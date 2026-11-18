// v7 · ?demo=1 — the judges' tour (WS-EXP; v8 PLAN.md 5.6). DEMO_SCRIPT (contracts.ts) is the timeline; this plays
// it on the flow: at each row's second the flow enters that step (animated) and holds until the next row. The flow
// never advances a step by itself in demo mode; the UI only performs the "self-typing" bits (idea, pay press, CEO note).
// v8: the clock is wall-clock time (a slow GPU or a 4x CPU throttle never stretches the 90 s), so a beat that is
// still busy when its slot ends is simply cut and the next one starts.
// Space pauses, → skips to the next row, ← goes back one, Esc exits to the normal flow. &t=<s> seeks.
import { DEMO_LENGTH_S, DEMO_SCRIPT } from "../contracts";
import { demoState, type ProtoFlowV7 } from ".";

export interface Demo {
  readonly t: number; // seconds into the demo
  readonly paused: boolean;
  readonly row: number;
  readonly on: boolean;
  pause(p?: boolean): void;
  skip(dir?: 1 | -1): void;
  exit(): void;
  onTick(cb: () => void): () => void;
}

/** The chapters drawn on the thin bar (start second, label): the stage vocabulary (PLAN.md 1, 5.6). */
export const DEMO_CHAPTERS: Array<[number, string]> = [
  [0, "Idea"], [6, "Research"], [14, "Evidence"], [32, "Verdict"], [42, "CEO note"], [52, "Launch kit"], [62, "Live"], [70, "Offices"], [82, "Your turn"],
];

export function createDemo(flow: ProtoFlowV7, startAt = 0): Demo {
  const cbs = new Set<() => void>();
  let on = true;
  let paused = false;
  let t = Math.max(0, Math.min(DEMO_LENGTH_S - 1, startAt));
  let last = performance.now();
  let row = -1;
  flow.setDemo(true);
  // compress the evidence stream to the script's slot (~10 findings at 2.6 s, whatever the sample holds)
  const evRow = DEMO_SCRIPT.findIndex((r) => r.step === "evidence");
  const evSlot = (DEMO_SCRIPT[evRow + 1]!.at - DEMO_SCRIPT[evRow]!.at) * 1000 - 1500;
  const n = Math.max(1, flow.findings.length);
  const analysts = Math.max(1, flow.roster.length);
  // every finding fits its slot (a long sample reveals faster rather than being cut)
  flow.setTiming({ findingEvery: Math.min(2400, Math.max(700, (evSlot - analysts * 400) / n)), analystGap: 400, hireEvery: 900, hireTail: 400, buildWork: 1700, steerWork: 2400, reportTail: 400 });

  const rowAt = (s: number) => {
    let i = 0;
    DEMO_SCRIPT.forEach((r, j) => r.at <= s && (i = j));
    return i;
  };
  const play = (i: number) => {
    row = i;
    flow.goto(demoState(DEMO_SCRIPT[i]!), { animate: true });
    cbs.forEach((cb) => cb());
  };
  const advance = (now: number) => {
    if (!on) return;
    // wall clock: slow frames do not slow the tour. Only a long gap (a background tab, a debugger) is clamped, so
    // coming back never skips whole chapters.
    const dt = Math.min(1, (now - last) / 1000);
    last = now;
    if (!paused && document.documentElement.dataset.ready === "1") {
      t = Math.min(DEMO_LENGTH_S, t + dt);
      const i = rowAt(t);
      if (i !== row) play(i);
      if (t >= DEMO_LENGTH_S) paused = true;
    }
    cbs.forEach((cb) => cb());
  };
  const loop = (now: number) => {
    if (!on) return;
    advance(now);
    requestAnimationFrame(loop);
  };
  const key = (e: KeyboardEvent) => {
    if (!on || (e.target as HTMLElement)?.closest?.("textarea, input")) return;
    if (e.key === " ") { e.preventDefault(); demo.pause(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); demo.skip(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); demo.skip(-1); }
    else if (e.key === "Escape") { e.preventDefault(); demo.exit(); }
  };
  addEventListener("keydown", key, true);

  const demo: Demo = {
    get t() { return t; },
    get paused() { return paused; },
    get row() { return row; },
    get on() { return on; },
    pause(p) {
      paused = p ?? !paused;
      cbs.forEach((cb) => cb());
    },
    skip(dir = 1) {
      const i = Math.max(0, Math.min(DEMO_SCRIPT.length - 1, row + dir));
      t = DEMO_SCRIPT[i]!.at + 0.01;
      play(i);
    },
    exit() {
      on = false;
      flow.setDemo(false);
      flow.setTiming({});
      removeEventListener("keydown", key, true);
      cbs.forEach((cb) => cb());
    },
    onTick(cb) {
      cbs.add(cb);
      return () => cbs.delete(cb);
    },
  };
  play(rowAt(t));
  requestAnimationFrame((n0) => { last = n0; requestAnimationFrame(loop); });
  // rAF can be throttled to a few frames a second on a weak GPU: a timer keeps the clock honest in between
  const tick = window.setInterval(() => (on ? advance(performance.now()) : clearInterval(tick)), 250);
  return demo;
}
