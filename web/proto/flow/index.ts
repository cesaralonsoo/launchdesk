// The experience state machine (WS-C). It is the only thing that drives the World.
// idle → idea → pay-validate → validate(mia, leo, sam × working → result) → verdict → pay-build
//      → build(nova, dex, rae, pip × working → result) → level-up → live → scale.        Timings: CONTRACTS.md §5.
// Every world move goes outward: the office (level 1) does all the work, the tower (level 2) grows around it
// once the startup is live, the district (level 3) is the horizon.
//
// Pacing rule: never two camera moves at once, and the UI shows a surface only once the camera has settled.
// `settled` (ProtoFlow, additive) is false while the world is moving for the current state; the UI waits for it.
import { BUILD_DEPTS, VALIDATE_DEPTS, type Dept, type DeptState, type Flow, type FlowAction, type FlowState, type FlowStep, type Level, type World } from "../contracts";
import { IDEA } from "../data";

/** Working time per department at speed 1 (ms). */
export const WORK_MS = 5200;
/** Result cards auto-advance after this long (ms). Never divided by speed: reading time is the user's.
 *  Dense, decision-relevant cards (Leo, Sam, Rae) never auto-advance. The UI pauses it on hover/pointer move. */
export const READ_MS = 20000;
export const NO_AUTO: readonly string[] = ["leo", "sam", "rae"];
/** Order of the steps (deep links, paid amount). */
export const STEP_ORDER: FlowStep[] = ["idle", "idea", "pay-validate", "validate", "verdict", "pay-build", "build", "level-up", "live", "scale"];

export interface ProtoFlow extends Flow {
  /** false while the camera is still moving into the current state. */
  readonly settled: boolean;
  readonly speed: 1 | 3;
  /** ms timestamp when the current dept started working (for the tag's progress ring). */
  readonly workStart: number;
  readonly workMs: number;
  /** $ cents paid so far in this run (wallet pill). */
  readonly paidCents: number;
}

const LEVEL_OF: Record<FlowStep, Level> = {
  idle: 1, idea: 1, "pay-validate": 1, validate: 1, verdict: 1, "pay-build": 1, build: 1, "level-up": 2, live: 2, scale: 3,
};

export function createFlow(world: World, init?: Partial<FlowState> & { step?: FlowStep }, opts: { hold?: boolean } = {}): ProtoFlow {
  let speed: 1 | 3 = 1;
  let state: FlowState = { step: "idle", idea: IDEA, level: 1 };
  let settled = true;
  let run = 0; // cancels pending async sequences on goto/replay
  let timers: number[] = [];
  let workStart = 0;
  let paid = 0;
  const cbs = new Set<(s: FlowState, p: FlowState) => void>();

  const emit = (prev: FlowState) => {
    for (const cb of cbs) cb(state, prev);
  };
  const set = (patch: Partial<FlowState>, isSettled = settled) => {
    const prev = state;
    state = { ...state, ...patch };
    settled = isSettled;
    emit(prev);
  };
  const settle = (token: number) => {
    if (token !== run || settled) return;
    settled = true;
    emit(state);
  };
  const wait = (ms: number) => new Promise<void>((r) => timers.push(window.setTimeout(r, ms / speed)));
  /** Wall-clock pause that speed does not shorten (time to look at a reward). */
  const hold = (ms: number) => new Promise<void>((r) => timers.push(window.setTimeout(r, ms)));
  const cancel = () => {
    run++;
    timers.forEach(clearTimeout);
    timers = [];
  };

  /** Dept lights for any state, so deep links render consistently. */
  function paintDepts(s: FlowState) {
    const order = [...VALIDATE_DEPTS, ...BUILD_DEPTS];
    const idx = s.dept ? order.indexOf(s.dept) : -1;
    const afterValidate = ["verdict", "level-up", "pay-build", "build", "live", "scale"].includes(s.step);
    const afterBuild = ["level-up", "live", "scale"].includes(s.step);
    const buildOpen = ["build", "level-up", "live", "scale"].includes(s.step) || (s.step === "pay-build" && paid >= 30);
    for (const d of order) {
      const i = order.indexOf(d);
      let done: boolean;
      if (s.step === "validate" || s.step === "build") {
        const inStage = (s.step === "validate" ? VALIDATE_DEPTS : BUILD_DEPTS).includes(d);
        done = inStage ? i < idx || (i === idx && s.phase === "result") : s.step === "build" && VALIDATE_DEPTS.includes(d);
      } else done = VALIDATE_DEPTS.includes(d) ? afterValidate : afterBuild;
      let st: DeptState = done ? "done" : "idle";
      if (d === s.dept && s.phase === "working") st = "working";
      if (BUILD_DEPTS.includes(d) && !buildOpen && st === "idle") st = "locked";
      world.setDeptState(d, st);
    }
  }

  async function enterDept(d: Dept, step: "validate" | "build") {
    const token = run;
    set({ step, dept: d, phase: "working" }, false);
    paintDepts(state);
    await world.focus(d);
    if (token !== run) return;
    workStart = performance.now();
    settle(token);
    await wait(WORK_MS);
    if (token !== run) return;
    set({ phase: "result" }, true);
    paintDepts(state);
  }

  async function advanceDept() {
    const token = run;
    const list = state.step === "validate" ? VALIDATE_DEPTS : BUILD_DEPTS;
    const i = state.dept ? list.indexOf(state.dept) : -1;
    const nextD = list[i + 1];
    if (nextD) return enterDept(nextD, state.step as "validate" | "build");
    if (state.step === "validate") {
      set({ step: "verdict", dept: undefined, phase: undefined }, false);
      paintDepts(state);
      await world.focus("overview");
      settle(token);
    } else {
      // the startup is live: the office grows into a building around it. No UI while it grows, then a short hold.
      set({ step: "level-up", dept: undefined, phase: undefined, level: 2 }, false);
      paintDepts(state);
      await world.setLevel(2);
      if (token !== run) return;
      world.celebrate("level-up");
      await hold(1200);
      if (token !== run) return;
      settle(token);
    }
  }

  const flow: ProtoFlow = {
    get state() {
      return state;
    },
    get settled() {
      return settled;
    },
    get speed() {
      return speed;
    },
    get workStart() {
      return workStart;
    },
    get workMs() {
      return WORK_MS / speed;
    },
    get paidCents() {
      return paid;
    },
    goto(s) {
      cancel();
      const level = s.level ?? LEVEL_OF[s.step];
      let dept = s.dept;
      let phase = s.phase;
      if (s.step === "validate" || s.step === "build") {
        const list = s.step === "validate" ? VALIDATE_DEPTS : BUILD_DEPTS;
        if (!dept || !list.includes(dept)) dept = list[0];
        phase = phase ?? "result";
      } else {
        dept = undefined;
        phase = undefined;
      }
      const i = STEP_ORDER.indexOf(s.step);
      paid = i >= STEP_ORDER.indexOf("build") ? 30 : i >= 3 ? 10 : 0;
      workStart = performance.now();
      const prev = state;
      state = { idea: s.idea ?? state.idea, step: s.step, dept, phase, level };
      settled = true;
      paintDepts(state);
      void world.setLevel(level, { animate: false });
      const f = dept ?? (s.step === "pay-validate" || s.step === "pay-build" ? "lobby" : "overview");
      void world.focus(f, { animate: false });
      emit(prev);
      if (s.step === "validate" || s.step === "build") {
        if (phase === "working" && !opts.hold) {
          const token = run;
          void wait(WORK_MS).then(() => {
            if (token !== run) return;
            set({ phase: "result" }, true);
            paintDepts(state);
          });
        }
      }
    },
    async next(a?: FlowAction) {
      const s = state.step;
      const token = run;
      if (!settled && !(s === "validate" || s === "build")) return;
      if (s === "idle") return set({ step: "idea" }, true);
      if (s === "idea" && a?.type === "submit-idea") {
        set({ step: "pay-validate", idea: a.idea.trim() || IDEA }, false);
        await world.focus("lobby", { ms: 900 });
        return settle(token);
      }
      if (s === "pay-validate" && a?.type === "approve-pay") {
        paid = 10;
        world.celebrate("paid");
        emit(state);
        await wait(700);
        if (token !== run) return;
        return enterDept("mia", "validate");
      }
      if ((s === "validate" || s === "build") && state.phase === "result") return advanceDept();
      if (s === "verdict" && a?.type === "decide") {
        if (a.choice === "stop") {
          cancel();
          return flow.goto({ step: "idle" });
        }
        if (a.choice === "pivot") return set({ step: "idea" }, true);
        set({ step: "pay-build" }, false);
        await world.focus("lobby", { ms: 1000 });
        if (token !== run) return;
        return settle(token);
      }
      if (s === "level-up") {
        set({ step: "live" }, false);
        world.celebrate("live");
        await hold(700);
        if (token !== run) return;
        return settle(token);
      }
      if (s === "pay-build" && a?.type === "approve-pay") {
        paid = 30;
        world.celebrate("paid");
        paintDepts(state); // build rooms unlock
        emit(state);
        await wait(900);
        if (token !== run) return;
        return enterDept("nova", "build");
      }
      if (s === "live") {
        set({ step: "scale", level: 3 }, false);
        await world.setLevel(3);
        return settle(token);
      }
    },
    replay() {
      flow.goto({ step: "idle" });
      const token = run;
      void wait(1200).then(() => token === run && flow.next());
    },
    setSpeed(x) {
      speed = x;
    },
    onChange(cb) {
      cbs.add(cb);
      return () => cbs.delete(cb);
    },
  };
  if (init?.step) flow.goto({ ...init, step: init.step });
  else paintDepts(state);
  return flow;
}
