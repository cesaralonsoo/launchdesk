// M1 Director: the client presentation queue. Owner: WS2. API frozen (contracts-v4.md).
// app.project = server truth (polls only enqueue via push()); `view` = what the user has seen.
// Every render consumer (stepper, status pill, Now card, team list, tiles, office pins, document title)
// reads the view the director hands out, never app.project directly.
//
// Per department: handover 900ms → working (min 2400ms stage 1 / 1800ms stage 2, extends until data
// exists) → reveal 400ms → hold 1600ms (1000ms when more is already queued). The gate opens only when the
// story reaches it (after Sam's hold); the finale only after Pip's hold. A poll that jumps queued → done
// still gets a working beat. Restoring a finished stage fast-forwards with no motion.
import type { Project, Stage, WorkDept } from "../types";
import { STAGE_DEPTS } from "../types";
import { reduced } from "./motion";

export type BeatPhase = "handover" | "working" | "reveal" | "hold";
export type Beat = { dept: WorkDept; phase: BeatPhase; startedAt: number };

export type DirectorHooks = {
  /** New view to render (a Project as far as the story has got). Called at least once per beat. */
  onView(view: Project): void;
  /** Beat changes, for the Now card, coin, camera and sounds. */
  onBeat?(beat: Beat, view: Project): void;
  /** The story reached the Decide gate (after Sam's hold). */
  onGate?(view: Project): void;
  /** The story reached the finale (after Pip's hold). */
  onFinale?(view: Project): void;
};

export type DirectorStartOpts = {
  /** Restore/reload of a finished stage: jump to the end with no motion. Default true when nothing is running. */
  fastForward?: boolean;
};

const ORDER: WorkDept[] = ["mia", "leo", "sam", "nova", "dex", "rae", "pip"];
const stageOf = (d: WorkDept): Stage => (STAGE_DEPTS.validate.includes(d) ? "validate" : "build");

/** Beat lengths (ms). Reduced motion keeps the order but shortens the holds (M2). */
const T = {
  handover: () => (reduced() ? 150 : 900),
  working: (s: Stage) => (reduced() ? 600 : s === "validate" ? 2400 : 1800),
  reveal: () => (reduced() ? 150 : 400),
  hold: (more: boolean) => (reduced() ? 900 : more ? 1000 : 1600),
  gate: () => (reduced() ? 600 : 0),
};

type Shown = "working" | "done" | "error";

let hooks: DirectorHooks | null = null;
let truth: Project | null = null;
let view: Project | null = null;
let shown: Partial<Record<WorkDept, Shown>> = {};
let beat: Beat | null = null;
let epoch = 0;
let skipping = false;
let idle = true;
let gated = false;
let finaled = false;
/** Wall-clock times the server was first seen working on / done with a department (real durations). */
const seen = new Map<string, { start?: number; end?: number }>();
const wakers = new Set<() => void>();

const wake = () => {
  const w = [...wakers];
  wakers.clear();
  w.forEach((f) => f());
};

/** Sleeps `ms`, but resolves at once when skipping, and early when `early()` turns true after a push. */
function sleep(ms: number, ep: number, early?: () => boolean): Promise<void> {
  if (skipping || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const t0 = performance.now();
    let timer = 0;
    const done = () => {
      clearTimeout(timer);
      wakers.delete(check);
      resolve();
    };
    const check = () => {
      if (ep !== epoch || skipping || (early && early()) || performance.now() - t0 >= ms) return done();
      wakers.add(check);
    };
    timer = window.setTimeout(done, ms);
    wakers.add(check);
  });
}

/** Waits for the next push (or a skip / stop). */
const nextPush = () => new Promise<void>((r) => wakers.add(r));

function compose(): Project | null {
  if (!truth) return null;
  const t = truth;
  const status: Project["status"] = {};
  const results: Project["results"] = {};
  const errors: NonNullable<Project["errors"]> = {};
  for (const d of ORDER) {
    const s = shown[d];
    if (s === "done") {
      status[d] = "done";
      (results as Record<string, unknown>)[d] = t.results[d];
      if (d === "sam" && t.results.memo) results.memo = t.results.memo;
    } else if (s === "working") status[d] = "working";
    else if (s === "error") {
      status[d] = "error";
      if (t.errors?.[d]) errors[d] = t.errors[d];
    } else if (t.payments[stageOf(d)]) status[d] = "queued";
  }
  return { ...t, status, results, errors };
}

function emit() {
  view = compose();
  if (view) hooks?.onView(view);
}

function setBeat(dept: WorkDept, phase: BeatPhase) {
  beat = { dept, phase, startedAt: performance.now() };
  emit();
  if (view) hooks?.onBeat?.(beat, view);
}

const truthStatus = (d: WorkDept) => (truth ? (truth.status[d] ?? (truth.results[d] ? "done" : undefined)) : undefined);
const truthDone = (d: WorkDept) => !!truth && truthStatus(d) === "done" && !!truth.results[d];

/** First department the story still has to tell, or null when it is caught up. */
function nextDept(): WorkDept | null {
  if (!truth) return null;
  for (const d of ORDER) {
    if (!truth.payments[stageOf(d)]) return null;
    if (shown[d] !== "done") return d;
  }
  return null;
}

function track(p: Project) {
  const now = Date.now();
  for (const d of ORDER) {
    const s = p.status[d];
    const k = `${p.id}:${d}`;
    const r = seen.get(k) ?? {};
    if (s === "working" && !r.start) r.start = now;
    if (s === "done" && r.start && !r.end) r.end = now;
    seen.set(k, r);
  }
}

async function tell(d: WorkDept, ep: number) {
  const stage = stageOf(d);
  // (1) handover: the coin and the camera move to the room
  if (shown[d] !== "working" && shown[d] !== "error") {
    shown[d] = "working";
    setBeat(d, "handover");
    await sleep(T.handover(), ep);
    if (ep !== epoch) return;
  }
  // (2) working: at least the minimum, and until the data exists
  setBeat(d, "working");
  const t0 = performance.now();
  for (;;) {
    if (ep !== epoch) return;
    const st = truthStatus(d);
    if (st === "error") {
      if (shown[d] !== "error") {
        shown[d] = "error";
        emit();
      }
    } else if (shown[d] === "error") {
      shown[d] = "working";
      setBeat(d, "working");
    }
    const left = T.working(stage) - (performance.now() - t0);
    if (truthDone(d) && left <= 0) break;
    if (truthDone(d) && skipping) break;
    if (left > 0 && !skipping) await sleep(left, ep, () => truthStatus(d) === "error" && shown[d] !== "error");
    else await nextPush();
  }
  // (3) reveal: the result crossfades in, the tile and the pin update
  shown[d] = "done";
  setBeat(d, "reveal");
  await sleep(T.reveal(), ep);
  if (ep !== epoch) return;
  // (4) hold: let it land before the next department takes over
  setBeat(d, "hold");
  const i = ORDER.indexOf(d);
  const nx = ORDER[i + 1];
  const more = !!nx && stageOf(nx) === stage && !!truth && (truthStatus(nx) === "working" || truthDone(nx));
  const last = d === "sam" || d === "pip";
  await sleep(last ? Math.max(T.hold(false), T.gate()) : T.hold(more), ep);
  if (ep !== epoch) return;
  beat = null;
  emit();
  if (d === "sam" && !gated && view && !view.payments.build) {
    gated = true;
    hooks?.onGate?.(view);
  }
  if (d === "pip" && !finaled && view) {
    finaled = true;
    hooks?.onFinale?.(view);
  }
}

async function loop(ep: number) {
  while (ep === epoch) {
    const d = nextDept();
    if (!d) {
      idle = true;
      skipping = false;
      await nextPush();
      continue;
    }
    idle = false;
    await tell(d, ep);
  }
}

/** Starts telling the story of `project` (replaces any running story). */
export function start(project: Project, h: DirectorHooks, opts: DirectorStartOpts = {}): void {
  stop();
  hooks = h;
  truth = project;
  track(project);
  const ff = opts.fastForward ?? true;
  shown = {};
  if (ff) {
    // Restore: what the server already has is shown as-is, no motion. A department that is working keeps working.
    for (const d of ORDER) {
      const s = truthStatus(d);
      if (s === "done" && project.results[d]) shown[d] = "done";
      else if (s === "working") shown[d] = "working";
      else if (s === "error") shown[d] = "error";
    }
  }
  gated = !!shown.sam;
  finaled = !!shown.pip;
  emit();
  const ep = epoch;
  void loop(ep);
}

/** Enqueues a fresh server snapshot (call on every poll). */
export function push(project: Project): void {
  if (!hooks || !truth || project.id !== truth.id) return;
  truth = project;
  track(project);
  // Money and stage-level facts are the user's own actions: they show at once. Departments wait for their beat.
  emit();
  wake();
}

/** Stops the story and drops the queue (navigation, new idea). */
export function stop(): void {
  epoch++;
  hooks = null;
  truth = null;
  view = null;
  beat = null;
  shown = {};
  skipping = false;
  idle = true;
  gated = false;
  finaled = false;
  wake();
}

/** "Skip animation": finishes the current and queued beats instantly, order preserved. */
export function skip(): void {
  if (idle) return;
  skipping = true;
  wake();
}

/** What the user has seen so far, or null when idle. */
export const currentView = (): Project | null => view;
/** True while beats are queued or playing. */
export const busy = (): boolean => !idle;

// ---- additive helpers (WS2 internal; not part of the frozen contract) ----

/** The beat on screen right now, or null between departments. */
export const currentBeat = (): Beat | null => beat;
/** True while "Skip animation" is fast-forwarding. */
export const isSkipping = (): boolean => skipping;
/** Real duration the server took for a department, as observed by this tab (ms), or null when unknown. */
export function observedMs(id: string, d: WorkDept): number | null {
  const r = seen.get(`${id}:${d}`);
  return r?.start && r.end ? r.end - r.start : null;
}

export const director = { start, push, stop, skip, currentView, busy };
