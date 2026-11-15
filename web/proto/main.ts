// Prototype v5 entry (WS-C). Boot order: params → theme → world → flow → ui → deep link.
import { readParams, type Dept, type DeptPhase, type FlowState, type FlowStep } from "./contracts";
import { createFlow } from "./flow";
import { applyTheme, THEMES } from "./themes";
import { createUi } from "./ui";
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
const theme = THEMES[p.theme];
applyTheme(theme);

const stage = document.getElementById("world")!;
const uiHost = document.getElementById("ui")!;
const reduced = p.still || matchMedia("(prefers-reduced-motion: reduce)").matches;
const sceneLevel = p.scene === "district" ? 3 : p.scene === "building" ? 2 : p.scene === "office" ? 1 : undefined;

const world = createWorld(stage, { quality: p.quality, atmosphere: theme.atmosphere, level: sceneLevel ?? 1, reducedMotion: reduced });
const step = alias?.step ?? p.step ?? (p.scene ? "scale" : undefined);
const init: (Partial<FlowState> & { step: FlowStep }) | undefined = step
  ? { step, dept: alias?.dept ?? p.dept ?? undefined, phase: (p.phase ?? undefined) as DeptPhase | undefined, level: sceneLevel }
  : undefined;
const flow = createFlow(world, init, { hold: p.still }); // still=1 freezes a deep-linked "working" phase for screenshots
if (p.fast) flow.setSpeed(3);
if (p.focus) void world.focus(p.focus, { animate: false });

if (p.ui && !p.scene) {
  createUi(uiHost, {
    world, flow, layout: p.layout, switcher: p.switcher, theme: p.theme, fast: p.fast, still: p.still,
    onTheme(t) {
      applyTheme(t);
      world.setAtmosphere(t.atmosphere, { animate: true });
    },
  });
}
if (!step) setTimeout(() => flow.state.step === "idle" && flow.next(), reduced ? 0 : 1200 / (p.fast ? 3 : 1));

Object.assign(window, { __proto: { world, flow } }); // console / screenshot scripts
