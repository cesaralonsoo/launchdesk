// v7 · ?demo=1 — the judges' path (WS-EXP). DEMO_SCRIPT (contracts.ts) is the timeline; this plays it on the flow:
// at each row's second the flow enters that step (animated) and holds until the next row. The flow never advances
// a step by itself in demo mode; the UI only performs the "self-typing" bits (idea, pay press, CEO note).
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

/** The chapters drawn on the thin bar (start second, label). */
export const DEMO_CHAPTERS: Array<[number, string]> = [
  [0, "Idea"], [10, "Team"], [18, "Evidence"], [46, "Report"], [64, "You, CEO"], [72, "Boom"], [78, "Build"], [96, "Grow"], [109, "Your turn"],
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
  const evSlot = (DEMO_SCRIPT[evRow + 1]!.at - DEMO_SCRIPT[evRow]!.at) * 1000 - 2600;
  const n = Math.max(1, flow.findings.length);
  const analysts = Math.max(1, flow.roster.length);
  flow.setTiming({ findingEvery: Math.min(2600, Math.max(1500, (evSlot - analysts * 500) / n)), analystGap: 500, hireEvery: 1400, hireTail: 600, buildWork: 1700, steerWork: 2400, reportTail: 600 });

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
  const loop = (now: number) => {
    if (!on) return;
    // clamp: a slow frame (or the world still loading) never jumps the story forward
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused && document.documentElement.dataset.ready === "1") {
      t = Math.min(DEMO_LENGTH_S, t + dt);
      const i = rowAt(t);
      if (i !== row) play(i);
      if (t >= DEMO_LENGTH_S) paused = true;
    }
    cbs.forEach((cb) => cb());
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
  return demo;
}
