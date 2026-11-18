// v7 · The experience state machine (WS-EXP). The only thing that drives the World.
//
//   idea → pay1 → hire → evidence → report → [steer]* → floor (the Launch kit offer) → pay2 → live (one result
//   screen: logo, website, 30-day plan) → building (the offices floor) · district (the campus) · end (tour recap)
// v8 (redesign PLAN.md 4, 6): every step from the idea to the live kit happens on floor 1 (no bedroom, no boom).
// boom and build deep links open floor and live; building = world level 2 (offices), district = level 3 (campus).
// The scalability cap gates nothing (it stays a line in the report). "bedroom" is only the blank moment while a
// /p/:id link loads.
//
// One engine for three drivers: the user (next / actions), deep links (goto, snapped) and the judges' demo
// (goto with animate, see flow/demo.ts). `enter(step, animate)` plays a step: hire pops analysts one by one, evidence
// reveals findings one at a time, build runs each specialist. Every async sequence is cancelled by a new goto.
// In demo mode (`auto = false`) the flow never moves to the next *step* by itself: the demo script does.
import {
  BUILD_TEAM, DEMO_SCRIPT, FLOW_STEPS_V7, STEER_LIMIT, STEP_ALIAS, STEP_LEVEL, hasBlocks, levelCapFor, scoreDisplay, worldProjectOf,
  type ActorId, type Analyst, type AnalystRole, type BuildDept, type CompanySign, type Finding, type FlowActionV7,
  type FlowStateV7, type FlowStepV7, type FlowV7, type IdeaReport, type ProjectV7, type ReportPage, type SteerResult,
  type WorldLevel, type WorldV7,
} from "../contracts";
import { PROJECTS_V7, SAMPLE_V7, mockSteer } from "../data";
import type { Project } from "../../src/types";
import { createLiveRun, createProject, postSteer, savedShells, shellProject, type LiveRun } from "../live/adapter";
import { onChange as onSavedChange } from "../../src/app/projects";
import { STEP_EVENT } from "../game/types";
import type { WorldV8 } from "../world/api-v8";

/** v8: the world is never capped by the scalability score (PLAN.md 5.1.5); levels open on real events only. */
const WORLD_CAP: WorldLevel = 3;

/** Validate 10 cents + Launch kit 50 cents (server config.priceCents; ui/steps.ts KIT_CENTS). */
export const PAID_ALL = 10 + 50;
export const REPORT_PAGES: readonly ReportPage[] = ["score", "scale", "points", "next"];
export const STORE_KEY = "launchdesk.proto.projects.v7";

/** Pacing at speed 1 (ms). The demo script compresses some of them (see flow/demo.ts). */
export interface Timing {
  intro: number; // bedroom → idea card
  hireEvery: number;
  hireTail: number; // after the last hire, before the research starts
  findingEvery: number;
  analystGap: number; // camera move between analysts
  reportTail: number; // after the last finding, before the report
  buildWork: number;
  steerWork: number;
}
export const TIMING: Timing = { intro: 1100, hireEvery: 1500, hireTail: 1400, findingEvery: 2600, analystGap: 700, reportTail: 1300, buildWork: 4200, steerWork: 2800 };

export interface ProtoFlowV7 extends FlowV7 {
  readonly project: ProjectV7;
  /** The current report (after any CEO steer). */
  readonly report: IdeaReport | null;
  readonly roster: readonly Analyst[];
  /** Every finding, in reveal order (roster order, then t), with steer replacements applied. */
  readonly findings: Finding[];
  /** How many findings have been revealed (evidence step; = all after it). */
  readonly revealed: number;
  /** How many analysts have been hired so far (hire step; = all after it). */
  readonly hired: number;
  readonly cap: WorldLevel;
  /** The cap from the scalability score alone (before a scale path is chosen; a path adds one level). */
  readonly baseCap: WorldLevel;
  readonly paidCents: number;
  readonly steers: SteerResult[];
  /** The steer being processed (ack shown, analysts re-running) or null. */
  readonly steering: SteerResult | null;
  readonly steersLeft: number;
  /** ms timestamp when the current build specialist started (tag progress ring). */
  readonly workStart: number;
  readonly workMs: number;
  readonly demo: boolean;
  readonly reduced: boolean;
  /** A world move (boom, pull-back) is playing: the UI waits. */
  readonly moving: boolean;
  readonly projects: ProjectV7[];
  /** v7 owner update: the scale path the founder committed to (index into scalePaths(report)), or null. */
  readonly chosenPath: number | null;
  /** Commit to a scale path: the world may now grow past the scalability cap (the score says how hard it is). */
  commitPath(i: number): void;
  levelOf(id: string): WorldLevel;
  goto(s: Partial<FlowStateV7> & { step: FlowStepV7 }, opts?: { animate?: boolean }): void;
  setDemo(on: boolean): void;
  setTiming(t: Partial<Timing>): void;
  /** Re-show a revealed finding (tap on the evidence counter). */
  peek(i: number): void;
  /** v7 live: the real run behind the current project (null = a sample / the tour). */
  readonly live: LiveRun | null;
  /** Projects of this browser (real runs), newest first; `projects` = these + the sample worlds. */
  readonly mine: ProjectV7[];
  isSample(id: string): boolean;
  /** v7 live: attach a real project. "new" = just created (→ pay1); "open" = from Your offices (→ where it stands). */
  startLive(p: ProjectV7, mode: "new" | "open"): void;
  /** Last steer error (live), shown in the steer surface. */
  readonly steerError: string | null;
  /** v7.1 founder direction: a real run (or a 4-block project) does not stream findings one by one. The team works
   *  in the office (calm progress notes), then one report is delivered. The guided tour keeps the old reveal. */
  readonly calm: boolean;
  /** The UI tells the flow while progress notes are still queued, so the report waits (≤ 6 s) for the last ones. */
  setWorkHold(fn: (() => boolean) | null): void;
  /** v8: the one way to start a real run from any idea box (home hero, the end card): POST /api/projects, then the
   *  pay card. The same idea again before paying reuses its unpaid project. Rejects with a readable message. In the
   *  tour it only plays the sample. `flow.next({ type: "submit-idea" })` calls this too (errors → submitError). */
  submitIdea(idea: string): Promise<void>;
  /** The last submitIdea error reached through flow.next (null after a new attempt). */
  readonly submitError: string | null;
  /** True while submitIdea waits for the server. */
  readonly submitting: boolean;
}

const ORDER = FLOW_STEPS_V7;
const after = (a: FlowStepV7, b: FlowStepV7) => ORDER.indexOf(a) >= ORDER.indexOf(b);

/** Findings in reveal order. */
export function orderFindings(p: ProjectV7, roster: readonly Analyst[] = p.v7.roster): Finding[] {
  const out: Finding[] = [];
  for (const a of roster) {
    const w = p.v7.work.find((x) => x.analyst === a.id);
    if (w) out.push(...[...w.findings].sort((x, y) => x.t - y.t));
  }
  return out;
}

// ───────────────────────────── per-project progress (one world per project)
function loadLevels(): Record<string, WorldLevel> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
/** Projects whose Launch kit payment card was open (a reload comes back to it, not to the offer). */
const PAY2_KEY = "launchdesk.proto.pay2.v1";
function pay2Open(id: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(PAY2_KEY) || "[]") as string[]).includes(id);
  } catch {
    return false;
  }
}
function setPay2Open(id: string, on: boolean): void {
  try {
    const v = (JSON.parse(localStorage.getItem(PAY2_KEY) || "[]") as string[]).filter((x) => x !== id);
    if (on) v.push(id);
    localStorage.setItem(PAY2_KEY, JSON.stringify(v.slice(-20)));
  } catch {
    /* private mode */
  }
}
function saveLevels(v: Record<string, WorldLevel>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(v));
  } catch {
    /* private mode: progress lives for this tab only */
  }
}

/** The company sign once Nova named it (brand) — from the legacy phase-2 payload. */
export function brandSign(p: ProjectV7): CompanySign | null {
  const L = p.legacy as Project | null;
  const nova = L?.results?.nova;
  const n = nova ? nova.names[nova.chosen] ?? nova.names[0] : null;
  if (!n) return null;
  const glyph = (L?.results?.dex?.logos?.[0] as { glyph?: string } | undefined)?.glyph;
  const primary = n.palette?.find((c) => c.name === "Primary")?.hex ?? n.palette?.[0]?.hex ?? "#1D1D1F";
  return { kind: "brand", name: n.name, tagline: n.tagline, color: primary, glyph };
}

export function createFlow(worldIn: WorldV7, init?: Partial<FlowStateV7> & { step: FlowStepV7 }, opts: { hold?: boolean; reduced?: boolean; demo?: boolean } = {}): ProtoFlowV7 {
  const world = worldIn;
  const reduced = !!opts.reduced;
  let demo = !!opts.demo;
  let T: Timing = { ...TIMING };
  let project: ProjectV7 = SAMPLE_V7;
  let report: IdeaReport | null = project.v7.report;
  let roster: readonly Analyst[] = project.v7.roster;
  let findings: Finding[] = orderFindings(project);
  let steers: SteerResult[] = [];
  let steering: SteerResult | null = null;
  let revealed = 0;
  let hired = 0;
  let paid = 0;
  let workStart = 0;
  let moving = false;
  let settled = true;
  let run = 0;
  let timers: number[] = [];
  let levels = loadLevels();
  let state: FlowStateV7 = { step: "bedroom", projectId: project.id, level: 0 };
  const cbs = new Set<(s: FlowStateV7, p: FlowStateV7) => void>();

  let live: LiveRun | null = null;
  let mine: ProjectV7[] = savedShells();
  let steerError: string | null = null;
  onSavedChange(() => {
    mine = savedShells();
    ping();
  });
  const isSample = (id: string) => PROJECTS_V7.some((x) => x.id === id);
  const calm = () => !demo && (!!live || hasBlocks(project.v7));
  /** Calm mode: each analyst's figure follows its real work status (or its block's). */
  const workState = (id: AnalystRole): Parameters<WorldV7["setActorState"]>[1] => {
    const b = project.v7.blocks?.find((x) => x.role === id);
    const st = b?.status ?? project.v7.work.find((w) => w.analyst === id)?.status ?? "queued";
    return st === "working" ? "working" : st === "done" || st === "error" ? "done" : "idle";
  };
  const allProjects = () => [...mine.map((m) => (live && m.id === live.id ? live.project : m)), ...PROJECTS_V7];

  let committed: Record<string, number> = {}; // project id → chosen scale path index
  // Scalability caps the world (a neighbourhood bakery never gets a district). Committing to a scale path lifts the cap
  // by ONE level (owner update: every business can grow with work), never past what the idea can carry; a no-go stays.
  const baseCap = (): WorldLevel => report?.scalability.cap ?? levelCapFor(0, "go");
  const cap = (): WorldLevel =>
    (committed[project.id] != null && report?.verdict !== "no-go" ? Math.min(3, baseCap() + 1) : baseCap()) as WorldLevel;
  /** v8: the cap gates nothing; only a No-go (cap 0) hides the dashed offices plate (the world never renders wl 0). */
  const capNow = (): WorldLevel => (report?.verdict === "no-go" ? 0 : WORLD_CAP);
  const emit = (prev: FlowStateV7) => cbs.forEach((cb) => cb(state, prev));
  const set = (patch: Partial<FlowStateV7>) => {
    const prev = state;
    state = { ...state, ...patch };
    emit(prev);
  };
  const ping = () => emit(state);
  const cancel = () => {
    run++;
    timers.forEach(clearTimeout);
    timers = [];
    moving = false;
  };
  const wait = (ms: number) => new Promise<void>((r) => timers.push(window.setTimeout(r, reduced ? Math.min(ms, 60) : ms)));
  const alive = (tok: number) => tok === run;

  function reach(l: WorldLevel) {
    if ((levels[project.id] ?? 0) >= l) return;
    levels = { ...levels, [project.id]: l };
    saveLevels(levels);
  }

  // ───────────────────────────── world painting (any state → consistent world, for deep links and replays)
  function signFor(step: FlowStepV7, builder?: BuildDept, phase?: string): CompanySign {
    const named = after(step, "live") || (step === "build" && builder && (builder !== "nova" || phase === "result"));
    return (named && brandSign(project)) || project.sign;
  }
  function paintActors(s: FlowStateV7) {
    const st = s.step;
    world.setActorState("founder", "idle", { instant: true });
    const preHire = !after(st, "hire");
    roster.forEach((a, i) => {
      let x: Parameters<WorldV7["setActorState"]>[1] = "done";
      if (preHire) x = "absent";
      else if (st === "hire") x = i < hired ? "idle" : "absent";
      else if (st === "evidence" && calm()) x = live?.phase1Done ? "done" : workState(a.id);
      else if (st === "evidence") {
        const cur = findings[Math.max(0, revealed - 1)]?.analyst ?? s.analyst;
        const ci = roster.findIndex((r) => r.id === cur);
        x = i < ci ? "done" : i === ci ? "working" : "idle";
      } else if (st === "steer" && steering?.status === "working" && steering.rerun.includes(a.id)) x = "working";
      world.setActorState(a.id, x, { instant: true });
    });
    const bi = s.builder ? BUILD_TEAM.indexOf(s.builder) : -1;
    // a real project whose kit is paid (a finished example opened on its report, a reload): its studio is staffed
    const kitPaid = !demo && !!live?.paid.build;
    for (const b of BUILD_TEAM) {
      let x: Parameters<WorldV7["setActorState"]>[1];
      if (!after(st, "floor")) x = kitPaid && st !== "idea" && st !== "bedroom" ? "idle" : "absent";
      else if (st === "floor" || (st === "pay2" && paid < PAID_ALL)) x = "asleep";
      else if (st === "pay2") x = "idle";
      else if (st === "build") {
        const i = BUILD_TEAM.indexOf(b);
        x = i < bi ? "done" : i > bi ? "idle" : s.phase === "working" ? "working" : "done";
      } else x = "done";
      world.setActorState(b, x, { instant: true });
    }
  }
  /** v8: floor 1 at least (the bedroom is gone), never gated by the scalability cap. */
  function worldLevelFor(step: FlowStepV7): WorldLevel {
    return Math.max(1, STEP_LEVEL[STEP_ALIAS[step] ?? step]) as WorldLevel;
  }
  function paintProject(level: WorldLevel) {
    world.setLevelCap(capNow());
    world.setRoster(roster);
    void world.setProject({ ...worldProjectOf(project), level: Math.max(1, level) as WorldLevel, roster: [...roster], cap: capNow(), capWhy: report?.scalability.why }, { animate: false });
  }

  // ───────────────────────────── step players
  async function playHire(tok: number, animate: boolean) {
    if (!animate) return;
    while (live && !roster.length && !live.error) {
      await live.next();
      if (!alive(tok)) return;
    }
    // A real run after paying: the analysts are already at work on the server, so they arrive quickly and the work
    // screen (their real progress lines) is up within ~3 s of paying. The guided tour keeps its slower pace.
    const quick = !!live && !demo;
    for (let i = hired; i < roster.length; i++) {
      await wait(i === 0 ? (quick ? 250 : 500) : quick ? 380 : T.hireEvery);
      if (!alive(tok)) return;
      hired = i + 1;
      world.setActorState(roster[i]!.id, "arriving");
      ping();
    }
    await wait(quick ? 500 : T.hireTail);
    if (!alive(tok) || demo) return;
    enter({ step: "evidence" }, true);
  }

  async function playEvidence(tok: number, animate: boolean) {
    if (calm()) return playWork(tok);
    if (!animate) return;
    let cur: AnalystRole | null = revealed > 0 ? findings[revealed - 1]!.analyst : null;
    // live: findings land while we reveal; when caught up, wait for the next poll until the report exists
    while (revealed < findings.length || (live && !live.phase1Done && !live.error)) {
      if (revealed >= findings.length) {
        await live!.next();
        if (!alive(tok)) return;
        continue;
      }
      const f = findings[revealed]!;
      if (f.analyst !== cur) {
        if (cur) world.setActorState(cur, "done");
        cur = f.analyst;
        world.setActorState(cur, "working");
        set({ analyst: cur });
        void world.focusActor(cur, { ms: 700 });
        await wait(T.analystGap);
        if (!alive(tok)) return;
      }
      revealed++;
      world.pulse(f.analyst, f.kind);
      set({ finding: revealed - 1, analyst: f.analyst });
      await wait(T.findingEvery);
      if (!alive(tok)) return;
    }
    if (cur) world.setActorState(cur, "done");
    ping();
    if (live?.error || (live && !report)) return;
    await wait(T.reportTail);
    if (!alive(tok) || demo) return;
    enter({ step: "report", page: "score" }, true);
  }

  let workHold: (() => boolean) | null = null;
  /** Calm mode: no reveal. Figures follow the real work; the report opens once it exists. */
  async function playWork(tok: number) {
    revealed = findings.length;
    while (live && !live.phase1Done && !live.error) {
      roster.forEach((a) => world.setActorState(a.id, workState(a.id)));
      await live.next();
      if (!alive(tok)) return;
      revealed = findings.length;
      ping();
    }
    roster.forEach((a) => world.setActorState(a.id, "done"));
    ping();
    if (live?.error || !report) return;
    await wait(T.reportTail);
    // let the last queued progress notes be read (a quick run otherwise jumps past them), at most 6 s
    for (let t = 0; t < 6000 && workHold?.(); t += 300) {
      await wait(300);
      if (!alive(tok)) return;
    }
    if (!alive(tok) || demo) return;
    enter({ step: "report", page: "score" }, true);
  }

  async function playBuild(tok: number, animate: boolean, b: BuildDept) {
    if (state.phase !== "working" || !animate || opts.hold) return;
    workStart = performance.now();
    world.setActorState(b, "working");
    if (live) {
      const t0 = performance.now();
      while (live.buildStatus(b) !== "done" && live.buildStatus(b) !== "error") {
        await live.next();
        if (!alive(tok)) return;
      }
      // keep the work beat readable even when the result was already there
      const left = 1800 - (performance.now() - t0);
      if (left > 0) await wait(left);
    } else await wait(T.buildWork);
    if (!alive(tok)) return;
    world.setActorState(b, "done");
    if (b === "nova") world.setSign(signFor("build", "nova", "result"));
    set({ phase: "result" });
  }

  async function playMove(tok: number, step: FlowStepV7, level: WorldLevel, animate: boolean) {
    const from = world.worldLevel;
    if (level === from || !animate) {
      if (level !== from) await world.setWorldLevel(level, { animate: false });
      return;
    }
    moving = true;
    settled = false;
    ping();
    // v8: no celebrate("level-up") here; the level-up moment (card + camera) belongs to the game layer (game/levelup.ts)
    await world.setWorldLevel(level, { animate: true });
    if (!alive(tok)) return;
    moving = false;
    settled = true;
    ping();
    void step;
  }

  /** Plays (animate) or snaps (deep link) one step. */
  function enter(s0: Partial<FlowStateV7> & { step: FlowStepV7 }, animate: boolean) {
    cancel();
    const tok = run;
    // v8: boom → floor, build → live (old deep links and old callers land on the step that replaced them)
    const alias = STEP_ALIAS[s0.step];
    const s: Partial<FlowStateV7> & { step: FlowStepV7 } = alias ? { step: alias } : s0;
    const step = s.step;
    const prev = state;
    if (live && !demo) {
      if (step === "pay2") setPay2Open(live.id, true);
      else if (prev.step === "pay2" || after(step, "pay2")) setPay2Open(live.id, false);
    }
    // progress counters implied by the step
    hired = after(step, "evidence") ? roster.length : step === "hire" ? (animate ? 0 : roster.length) : 0;
    if (step === "evidence") {
      const idx = s.finding ?? (s.analyst ? findings.findIndex((f) => f.analyst === s.analyst) : animate ? -1 : findings.length - 1);
      const n = s.analyst && s.finding != null ? findings.findIndex((f) => f.analyst === s.analyst) + s.finding : idx;
      revealed = animate && s.finding == null && !s.analyst ? 0 : Math.max(0, Math.min(findings.length, n + 1));
    } else revealed = after(step, "report") ? findings.length : 0;
    paid = after(step, "build") || (step === "pay2" && prev.step === "pay2" && paid >= PAID_ALL) ? PAID_ALL : after(step, "hire") ? 10 : step === "pay1" && paid >= 10 ? 10 : 0;
    if (!after(step, "steer") || step === "steer") {
      /* keep steers (they changed the report) */
    }
    const page = step === "report" ? s.page ?? "score" : undefined;
    const builder = step === "build" ? s.builder ?? "nova" : undefined;
    const phase = step === "build" ? s.phase ?? (animate ? "working" : "result") : undefined;
    const level = worldLevelFor(step);
    const analyst = step === "evidence" ? (revealed > 0 ? findings[revealed - 1]!.analyst : s.analyst ?? roster[0]?.id) : undefined;
    state = { step, projectId: project.id, level, page, builder, phase, analyst, finding: step === "evidence" ? Math.max(0, revealed - 1) : undefined };
    settled = true;
    // progress per project is remembered only for this browser's own runs (never the tour or a sample world)
    if (!demo && live && after(step, "floor")) reach(level);
    if (unpaid && after(step, "hire")) unpaid = null; // paid: the same idea again is a new project
    // world
    world.setLevelCap(capNow());
    world.setRoster(roster);
    world.setSign(signFor(step, builder, phase));
    const moveAnimated = animate && !reduced && world.worldLevel !== level && (step === "building" || step === "district" || step === "end" || world.worldLevel > 1);
    const ask = level;
    if (!moveAnimated) void world.setWorldLevel(ask, { animate: false });
    paintActors(state);
    workStart = performance.now();
    const focus: ActorId | "overview" =
      step === "evidence" && analyst && !calm() ? analyst : step === "build" && builder ? builder : "overview";
    if (!moveAnimated && ask === level) void world.focusActor(focus, { animate: animate && !reduced });
    if (animate && (step === "pay1" || step === "pay2") && prev.step !== step) {
      /* camera already on the founder / lobby */
    }
    emit(prev);
    dispatchEvent(new CustomEvent(STEP_EVENT, { detail: { step, projectId: project.id, sample: demo || !live } }));
    if (moveAnimated) void playMove(tok, step, ask, true);
    if (step === "hire") void playHire(tok, animate);
    if (step === "evidence") void playEvidence(tok, animate);
    if (step === "build" && builder) void playBuild(tok, animate, builder);
    if (step === "live" && animate) world.celebrate("live");
  }

  /** Actors that leave the roster (another project, a steer drop) must leave the scene too. */
  function retire(next: readonly Analyst[]) {
    for (const a of roster) if (!next.some((x) => x.id === a.id)) world.setActorState(a.id, "absent", { instant: true });
  }
  function useProject(p: ProjectV7) {
    retire(p.v7.roster);
    project = p;
    report = p.v7.report;
    roster = p.v7.roster;
    findings = orderFindings(p);
    steers = [...p.v7.steers];
    steering = null;
  }

  /** Where a project's world opens (switcher). */
  /** v8: a sample world opens on its report (its floor lit behind it); never straight onto the offices or campus. */
  function homeStep(p: ProjectV7): Partial<FlowStateV7> & { step: FlowStepV7 } {
    return p.v7.report ? { step: "report", page: "score" } : { step: "idea" };
  }

  async function doSteerLive(note: string) {
    if (!live) return;
    const r = live;
    steerError = null;
    const text = note.trim().slice(0, 280);
    steering = { id: "pending", note: text, ack: "Sending your note to the team.", status: "working", rerun: [], hired: [], dropped: [], findings: [], changes: [], report: null, at: new Date().toISOString() };
    if (state.step !== "steer") set({ step: "steer", page: undefined });
    else ping();
    let res: { id: string; ack: string; rerun: AnalystRole[] };
    try {
      res = await postSteer(r.id, text);
    } catch (e) {
      steering = null;
      steerError = (e as Error).message || "Your note could not be sent.";
      return ping();
    }
    steering = { ...steering, id: res.id, ack: res.ack, rerun: res.rerun };
    for (const id of res.rerun) world.setActorState(id, "working");
    if (res.rerun[0]) (world as WorldV7 & Partial<WorldV8>).shotFor?.("wing:back");
    ping();
    r.kick();
    for (;;) {
      await r.next(6000);
      if (live !== r) return;
      const s = r.project.v7.steers.find((x) => x.id === res.id);
      if (s && s.status !== "working") {
        const before = roster;
        retire(r.project.v7.roster);
        roster = r.project.v7.roster;
        if (roster.map((a) => a.id).join() !== before.map((a) => a.id).join()) resnapRoster();
        findings = [...r.findings];
        revealed = findings.length;
        if (r.project.v7.report) report = r.project.v7.report;
        world.setLevelCap(capNow());
        for (const id of res.rerun) world.setActorState(id, "done");
        for (const f of s.findings) world.pulse(f.analyst, f.kind);
        void world.focusActor("overview", { ms: 900 });
        steering = s.status === "error" ? { ...s, ack: "Your team could not finish that note. Nothing changed." } : s;
        steers = r.project.v7.steers.filter((x) => x.status !== "working");
        return ping();
      }
    }
  }

  async function doSteer(note: string) {
    if (live) return doSteerLive(note);
    if (steering?.status === "working" || steers.length >= STEER_LIMIT) return;
    const tok = run;
    const res = mockSteer({ ...project, v7: { ...project.v7, report, steers } }, note.trim().slice(0, 280));
    steering = { ...res, status: "working" };
    if (state.step !== "steer") set({ step: "steer", page: undefined });
    else ping();
    for (const id of res.rerun) world.setActorState(id, "working");
    // the research wing re-checks (PLAN.md 4.1 steer: camera on the back row, not a close-up)
    if (res.rerun[0]) (world as WorldV7 & Partial<WorldV8>).shotFor?.("wing:back");
    for (const a of res.hired) world.setActorState(a.id, "arriving");
    await wait(T.steerWork);
    if (!alive(tok)) return;
    // apply: roster changes, replaced findings, new report
    if (res.hired.length || res.dropped.length) {
      roster = [...roster.filter((a) => !res.dropped.includes(a.id)), ...res.hired];
      world.setRoster(roster);
    }
    for (const f of res.findings) {
      const i = f.replaces ? findings.findIndex((x) => x.id === f.replaces) : -1;
      if (i >= 0) findings[i] = f;
      else findings.push(f);
    }
    findings = [...findings];
    revealed = findings.length;
    if (res.report) report = res.report;
    world.setLevelCap(capNow());
    for (const id of res.rerun) world.setActorState(id, "done");
    for (const f of res.findings) world.pulse(f.analyst, f.kind);
    void world.focusActor("overview", { ms: 900 });
    steering = { ...res, status: "done" };
    steers = [...steers, steering];
    ping();
  }

  let submitError: string | null = null;
  let submitting = false;
  /** The project created for an idea, until it is paid (pay → Back → the same idea again reuses it). */
  let unpaid: { idea: string; proj: ProjectV7 } | null = null;
  async function submitIdea(raw: string): Promise<void> {
    const idea = raw.trim();
    if (demo) {
      enter({ step: "pay1" }, true);
      return;
    }
    if (idea.length < 15) throw new Error(idea ? "Tell us a bit more: one full sentence." : "Type your idea first.");
    if (submitting) return;
    submitError = null;
    if (unpaid && unpaid.idea === idea) return attachLive(unpaid.proj, "new");
    submitting = true;
    ping();
    try {
      const proj = await createProject(idea);
      unpaid = { idea, proj };
      attachLive(proj, "new");
    } catch (e) {
      throw new Error((e as Error).message || "Could not start. Try again.");
    } finally {
      submitting = false;
      ping();
    }
  }

  const flow: ProtoFlowV7 = {
    get submitError() { return submitError; },
    get submitting() { return submitting; },
    submitIdea,
    get state() { return state; },
    get settled() { return settled; },
    get project() { return project; },
    get report() { return report; },
    get roster() { return roster; },
    get findings() { return findings; },
    get revealed() { return revealed; },
    get hired() { return hired; },
    get cap() { return cap(); },
    get baseCap() { return baseCap(); },
    get paidCents() { return paid; },
    get steers() { return steers; },
    get steering() { return steering; },
    get steersLeft() { return Math.max(0, STEER_LIMIT - steers.length); },
    get workStart() { return workStart; },
    get workMs() { return T.buildWork; },
    get demo() { return demo; },
    get reduced() { return reduced; },
    get moving() { return moving; },
    get projects() { return allProjects(); },
    get live() { return live; },
    get mine() { return mine; },
    get steerError() { return steerError; },
    get calm() { return calm(); },
    setWorkHold(fn) {
      workHold = fn;
    },
    isSample,
    startLive(p, mode) {
      attachLive(p, mode);
    },
    get chosenPath() { return committed[project.id] ?? null; },
    commitPath(i) {
      committed = { ...committed, [project.id]: i };
      world.setLevelCap(capNow());
      const st = state.step;
      if (st === "building" || st === "district") enter({ step: st }, true);
      else ping();
    },
    levelOf: (id) => {
      const p = allProjects().find((x) => x.id === id);
      return Math.max(levels[id] ?? 0, p?.level ?? 0) as WorldLevel;
    },
    goto(s, o) {
      enter(s, !!o?.animate);
    },
    setDemo(on) {
      demo = on;
    },
    setTiming(t) {
      T = { ...TIMING, ...t };
    },
    peek(i) {
      if (i < 0 || i >= revealed) return;
      set({ finding: i, analyst: findings[i]!.analyst });
    },
    next(a?: FlowActionV7) {
      const s = state.step;
      if (a?.type === "switch-project") {
        const lp = mine.find((x) => x.id === a.id);
        if (lp && !demo) return attachLive(lp, "open", a.at);
        const p = PROJECTS_V7.find((x) => x.id === a.id);
        // a real project this browser has not saved (a /p/:id link): open it from the server
        if (!p) return demo || !/^[A-Za-z0-9_-]{4,40}$/.test(a.id) ? undefined : attachLive(shellProject(a.id, "", "Your idea"), "open", a.at);
        detachLive();
        cancel();
        useProject(p);
        const home = homeStep(p);
        paintProject(worldLevelFor(home.step));
        return enter(home, false);
      }
      if (a?.type === "new-project") {
        detachLive();
        cancel();
        useProject(SAMPLE_V7);
        paid = 0;
        return enter({ step: "idea" }, true);
      }
      if (a?.type === "steer") return void doSteer(a.note);
      if (moving) return;
      switch (s) {
        case "bedroom":
          return enter({ step: "idea" }, true);
        case "idea":
          if (a?.type === "submit-idea") {
            if (demo) return enter({ step: "pay1" }, true);
            submitIdea(a.idea).catch((e: Error) => ((submitError = e.message), ping()));
          }
          return;
        case "pay1":
          if (a?.type !== "approve-pay") return;
          paid = 10;
          world.celebrate("paid");
          ping();
          if (!demo) {
            const tok = run;
            // a real run: the team (and its first progress lines) shows up at once, the pay card already said "paid"
            void wait(live ? 400 : 900).then(() => alive(tok) && enter({ step: "hire" }, true));
          }
          return;
        // a stray action from the step before (the tour's pay press landing late) never skips a step
        case "hire":
          if (a && a.type !== "next") return;
          return enter({ step: "evidence" }, true);
        case "evidence":
          if (a && a.type !== "next") return;
          if (live && !report) return;
          return enter({ step: "report", page: "score" }, true);
        case "report": {
          if (a?.type === "decide") return decide(a.choice);
          const i = REPORT_PAGES.indexOf(state.page ?? "score");
          if (i < REPORT_PAGES.length - 1) return set({ page: REPORT_PAGES[i + 1] });
          return;
        }
        case "steer":
          if (a?.type === "decide") return decide(a.choice);
          return enter({ step: "report", page: "next" }, false);
        case "boom":
          return enter({ step: "floor" }, true);
        case "floor":
          return enter({ step: "pay2" }, true);
        case "pay2":
          if (a?.type !== "approve-pay") return;
          paid = PAID_ALL;
          world.celebrate("paid");
          for (const b of BUILD_TEAM) world.setActorState(b, "arriving");
          ping();
          if (!demo) {
            // straight to the one Launch kit screen: its three panels fill in while the team works
            const tok = run;
            void wait(900).then(() => alive(tok) && enter({ step: "live" }, true));
          }
          return;
        case "build": {
          if (state.phase !== "result") return;
          const i = BUILD_TEAM.indexOf(state.builder ?? "nova");
          const nb = BUILD_TEAM[i + 1];
          return nb ? enter({ step: "build", builder: nb, phase: "working" }, true) : enter({ step: "live" }, true);
        }
        case "live":
          // a sample world goes on to its offices floor; a real kit opens its offices from the kit footer
          if (!live) return enter({ step: "building" }, true);
          return;
        case "building":
          return enter({ step: "district" }, true);
        case "district":
          return enter({ step: "end" }, true);
        case "end":
          if (a?.type === "submit-idea") {
            if (demo) {
              useProject(SAMPLE_V7);
              paintFloor();
              return enter({ step: "pay1" }, true);
            }
            detachLive();
            submitIdea(a.idea).catch((e: Error) => ((submitError = e.message), ping()));
          }
          return;
      }
    },
    onChange(cb) {
      cbs.add(cb);
      return () => cbs.delete(cb);
    },
  };

  // ───────────────────────────── live (real API) attach / sync
  let offLive: (() => void) | null = null;
  function detachLive() {
    if (live) setPath("/");
    offLive?.();
    offLive = null;
    live?.stop();
    live = null;
    steerError = null;
  }
  function syncLive(r: LiveRun) {
    if (live !== r || project.id !== r.id) return;
    const p = r.project;
    const before = roster.map((a) => a.id).join();
    project = p;
    if (steering?.status === "working") return ping();
    retire(p.v7.roster);
    roster = p.v7.roster;
    findings = [...r.findings];
    report = p.v7.report;
    steers = p.v7.steers.filter((x) => x.status !== "working");
    if (roster.map((a) => a.id).join() !== before) {
      resnapRoster();
      if (!after(state.step, "hire")) roster.forEach((a) => world.setActorState(a.id, "absent", { instant: true }));
    }
    world.setLevelCap(capNow());
    if (after(state.step, "build")) world.setSign(signFor(state.step, state.builder, state.phase));
    ping();
  }
  /** A live roster change (first poll, a steer hire): re-apply the whole project so the world snaps every new figure to
   *  the current level (a plain setRoster leaves new floor figures visible above the room at level 0). */
  function resnapRoster() {
    void world.setProject({ ...worldProjectOf(project), level: Math.max(1, world.worldLevel) as WorldLevel, roster: [...roster], cap: capNow(), capWhy: report?.scalability.why }, { animate: false });
  }
  /** Where a real project stands on the server. */
  function liveHome(r: LiveRun): Partial<FlowStateV7> & { step: FlowStepV7 } {
    const paid = r.paid;
    if (!paid.validate) return { step: "pay1" };
    if (!r.phase1Done) return { step: r.project.v7.roster.length ? "evidence" : "hire" };
    if (!paid.build) return pay2Open(r.id) ? { step: "pay2" } : (levels[r.id] ?? 0) >= 1 ? { step: "floor" } : { step: "report", page: "score" };
    return { step: "live" }; // the kit screen shows each part as it lands
  }
  function attachLive(seed: ProjectV7, mode: "new" | "open", at?: "report" | "live") {
    detachLive();
    cancel();
    const r = createLiveRun(seed.id, seed);
    live = r;
    setPath(`/p/${encodeURIComponent(seed.id)}`);
    useProject(seed);
    committed = { ...committed };
    offLive = r.onUpdate(syncLive);
    if (mode === "new") {
      paid = 0;
      return enter({ step: "pay1" }, true);
    }
    // open: the floor waits (no panel) while the first poll lands, then go where the project stands
    paintProject(1);
    enter({ step: "bedroom" }, false);
    const tok = run;
    void (async () => {
      while (!r.server && !r.error) {
        // check every 250 ms: the first fetch can land without an update event, and waiting the full 8 s left a
        // shared link on a blank page
        await Promise.race([r.next(8000), new Promise((res) => setTimeout(res, 250))]);
        if (live !== r || !alive(tok)) return;
      }
      if (!r.server) {
        // not on this server (or gone): back to a fresh idea, never a pay card for a project that does not exist
        detachLive();
        useProject(SAMPLE_V7);
        paintFloor();
        return enter({ step: "idea" }, false);
      }
      useProject(r.project);
      // a finished project asked to open on its report (the examples): the report first, the kit one tap away
      const home: Partial<FlowStateV7> & { step: FlowStepV7 } = at === "report" && r.phase1Done ? { step: "report", page: "score" } : liveHome(r);
      paintProject(worldLevelFor(home.step));
      enter(home, home.step === "evidence" || home.step === "hire" || home.step === "build");
    })();
  }
  /** The address bar follows the real run (/p/:id survives a reload); samples and the tour live at "/". */
  function setPath(path: string) {
    try {
      if (location.pathname !== path) history.replaceState(history.state, "", path + location.search + location.hash);
    } catch {
      /* sandboxed */
    }
  }

  function decide(c: "grow" | "pivot" | "stop") {
    if (c === "grow") return enter({ step: "floor" }, true); // the Launch kit offer, over the office
    if (c === "pivot") {
      // a fresh idea is a fresh project: leave the finished run (the address bar goes back to "/")
      if (live) {
        detachLive();
        cancel();
        useProject(SAMPLE_V7);
        paid = 0;
      }
      return enter({ step: "idea" }, true);
    }
    return enter({ step: "end" }, true);
  }
  function paintFloor() {
    void world.setWorldLevel(1, { animate: false });
  }

  // boot
  if (init?.step) {
    const proj = PROJECTS_V7.find((x) => x.id === (init as { projectId?: string }).projectId);
    if (proj) useProject(proj);
    // ?step=bedroom (old links) opens the idea: the bedroom is never drawn
    const first = init.step === "bedroom" ? { ...init, step: "idea" as const } : init;
    enter(first, !opts.hold && !reduced && first.step !== "report");
  } else enter({ step: "idea" }, false);
  return flow;
}

/** Demo rows → the state goto() needs. */
export const demoState = (row: (typeof DEMO_SCRIPT)[number]): Partial<FlowStateV7> & { step: FlowStepV7 } => ({
  // row 0 is "the idea types itself" over the floor; an old "bedroom" row means the same
  step: row.step === "bedroom" ? "idea" : row.step,
  page: row.page,
  builder: row.builder,
  phase: row.builder ? "working" : undefined,
});
export { scoreDisplay };
