// Prototype v6 entry (WS-B). Boot order: params → base tokens → world → day clock → flow → ui → deep link.
// One product: center layout, one type system, one skin that follows the world's day cycle.
import { DAY_TIMES, readParams, type DayClockInfo, type Dept, type DeptPhase, type FlowState, type FlowStep, type World } from "./contracts";
import { createFlow } from "./flow";
import { applyDayTokens, clockInfo } from "./themes/day";
import { applyBase, THEMES } from "./themes";
import { createUi } from "./ui";
import { MARK_IDS, faviconHref, setMark, type MarkId } from "./ui/logo";
import type { Clock } from "./ui/switcher";
import { createWorld } from "./world";

/** Short deep-link aliases (additive, see CONTRACTS.md "Changes by ws-c-experience"). */
const ALIAS: Record<string, { step: FlowStep; dept?: Dept }> = {
  pay1: { step: "pay-validate" },
  pay2: { step: "pay-build" },
  levelup: { step: "level-up" },
  district: { step: "scale" },
  mia: { step: "validate", dept: "mia" },
  leo: { step: "validate", dept: "leo" },
  sam: { step: "validate", dept: "sam" },
  nova: { step: "build", dept: "nova" },
  dex: { step: "build", dept: "dex" },
  rae: { step: "build", dept: "rae" },
  pip: { step: "build", dept: "pip" },
};

const q = new URLSearchParams(location.search);
const alias = ALIAS[q.get("step") ?? ""];
const p = readParams();
const devTools = q.get("switcher") === "1"; // v6: the switcher is a dev tool, hidden unless asked for
const mark = q.get("mark") as MarkId | null;
if (mark && MARK_IDS.includes(mark)) setMark(mark);
const fav = document.querySelector<HTMLLinkElement>("link[rel='icon']");
if (fav) fav.href = faviconHref();

applyBase();
const stage = document.getElementById("world")!;
const uiHost = document.getElementById("ui")!;
const reduced = p.still || matchMedia("(prefers-reduced-motion: reduce)").matches;
const sceneLevel = p.scene === "district" ? 3 : p.scene === "building" ? 2 : p.scene === "office" ? 1 : undefined;

// first paint: a fixed time if asked (screenshots), else late afternoon, so the first minutes drift into golden hour.
// The default day lasts 30 minutes: one validate + build run (~2 min) moves the light by ~1/15 of a day, so the
// change is ambient, never an event. ?cycle=<seconds> speeds it up for demos (e.g. ?cycle=60).
const DEFAULT_START = 0.64;
const DEFAULT_PERIOD = 1800;
const fixedT = p.time ?? (p.still ? DAY_TIMES.day : null);
const t0 = fixedT ?? DEFAULT_START;
const ATMO = (t: number) => {
  const n = clockInfo(t).name;
  return n === "day" ? THEMES.graphite.atmosphere : n === "golden" || n === "dawn" ? THEMES.ivory.atmosphere : THEMES.midnight.atmosphere;
};
const world = createWorld(stage, { quality: p.quality, atmosphere: ATMO(t0), level: sceneLevel ?? 1, reducedMotion: reduced });
const clock = createClock(world, fixedT, p.cycle ?? DEFAULT_PERIOD, t0);
clock.onClock((i) => applyDayTokens(i));

const step = alias?.step ?? p.step ?? (p.scene ? "scale" : undefined);
const init: (Partial<FlowState> & { step: FlowStep }) | undefined = step
  ? { step, dept: alias?.dept ?? p.dept ?? undefined, phase: (p.phase ?? undefined) as DeptPhase | undefined, level: sceneLevel }
  : undefined;
const flow = createFlow(world, init, { hold: p.still }); // still=1 freezes a deep-linked "working" phase for screenshots
if (p.fast) flow.setSpeed(3);
if (p.focus) void world.focus(p.focus, { animate: false });

const ui = p.ui && !p.scene ? createUi(uiHost, { world, flow, clock, switcher: devTools, fast: p.fast, still: p.still }) : null;
if (q.get("projects") === "1") setTimeout(() => ui?.openProjects(), 0); // screenshot / deep link: open "Your projects"
if (!step) setTimeout(() => flow.state.step === "idle" && flow.next(), reduced ? 0 : 1200 / (p.fast ? 3 : 1));

Object.assign(window, { __proto: { world, flow, clock } }); // console / screenshot scripts

// ───────────────────────────── day clock
/** Uses the world's clock (v6 contract) when it has one; otherwise runs a local clock with the same landmarks and
 *  steps the world's atmosphere by phase, so the UI cycle works before the world cycle lands. */
function createClock(w: World, fixed: number | null, period: number, start: number): Clock {
  const native = typeof w.setClock === "function" && typeof w.onClock === "function" && typeof w.getClock === "function";
  if (native) {
    w.setClock(fixed != null ? { mode: "fixed", t: fixed } : { mode: "cycle", periodSec: period, startAt: start }, { animate: false });
    return {
      info: () => w.getClock(),
      onClock: (cb) => w.onClock(cb),
      fix: (t) => w.setClock({ mode: "fixed", t }, { animate: true }),
      cycle: (s) => w.setClock({ mode: "cycle", periodSec: s, startAt: w.getClock().t }, { animate: true }),
    };
  }
  let mode: { fixed: number } | { period: number; base: number; at: number } = fixed != null ? { fixed } : { period, base: start, at: performance.now() };
  const cbs = new Set<(i: DayClockInfo) => void>();
  const now = () => ("fixed" in mode ? mode.fixed : (mode.base + (performance.now() - mode.at) / 1000 / mode.period) % 1);
  let phase = clockInfo(now()).name;
  const tick = () => {
    const i = clockInfo(now());
    cbs.forEach((cb) => cb(i));
    if (i.name !== phase) {
      phase = i.name;
      w.setAtmosphere(ATMO(i.t), { animate: true });
    }
  };
  setInterval(() => !("fixed" in mode) && tick(), 100);
  return {
    info: () => clockInfo(now()),
    onClock(cb) {
      cbs.add(cb);
      cb(clockInfo(now()));
      return () => cbs.delete(cb);
    },
    fix(t) {
      mode = { fixed: t };
      tick();
    },
    cycle(s) {
      mode = { period: s, base: now(), at: performance.now() };
      tick();
    },
  };
}
