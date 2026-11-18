// Prototype v7 entry (WS-EXP). Boot: params → fixed UI theme → world (it owns the day cycle; the scene alone changes
// with the hour) → flow → ui → deep link / demo.
import { DAY_TIMES, readParams, readParamsV7, type FlowStateV7, type FlowStepV7, type WorldV7 } from "./contracts";
import { createFlow } from "./flow";
import { ensureWorldV7 } from "./flow/compat";
import { createDemo } from "./flow/demo";
import { THEMES, applyFixedUi } from "./themes";
import { createUi } from "./ui";
import { faviconHref, markFromParam, setMark } from "./ui/logo";
import { createWorld } from "./world";
import type { WorldV8 } from "./world/api-v8";

const q = new URLSearchParams(location.search);
const p = readParams();
const p7 = readParamsV7();
const mark = markFromParam(q.get("logo"));
if (mark) setMark(mark);
const fav = document.querySelector<HTMLLinkElement>("link[rel='icon']");
if (fav) fav.href = faviconHref();

applyFixedUi();
const stage = document.getElementById("world")!;
const uiHost = document.getElementById("ui")!;
const reduced = p.still || matchMedia("(prefers-reduced-motion: reduce)").matches;

// The day: a fixed hour for screenshots (?time=), else late afternoon drifting slowly (30-minute day, ?cycle= faster).
const DEFAULT_START = 0.64;
const DEFAULT_PERIOD = 1800;
const fixedT = p.time ?? (p.still ? DAY_TIMES.day : null);
// v8: phones render at low quality (no shadows, no antialias, DPR capped at 1.5 in world/pixel.ts) unless ?quality= says.
const phone = matchMedia("(pointer:coarse)").matches && innerWidth < 768;
const quality = q.has("quality") ? p.quality : phone ? "low" : p.quality;
// createWorld already returns the full v7 world (+ the v8 seam); ensureWorldV7 is a pass-through for it.
const world = ensureWorldV7(createWorld(stage, { quality, atmosphere: THEMES.graphite.atmosphere, level: 1, reducedMotion: reduced })) as WorldV7 & WorldV8;
if (typeof world.setClock === "function") {
  world.setClock(fixedT != null ? { mode: "fixed", t: fixedT } : { mode: "cycle", periodSec: p.cycle ?? DEFAULT_PERIOD, startAt: DEFAULT_START }, { animate: false });
}

let init: (Partial<FlowStateV7> & { step: FlowStepV7 }) | undefined;
if (p7.step) {
  init = { step: p7.step, page: p7.page ?? undefined, builder: p7.builder ?? undefined, phase: p7.phase ?? undefined, projectId: p7.project ?? undefined };
  if (p7.step === "evidence") {
    init.analyst = p7.analyst ?? undefined;
    init.finding = p7.n ?? undefined;
  }
}

const flow = createFlow(world, p7.demo ? { step: "bedroom" } : init, { hold: p.still, reduced, demo: p7.demo });
// A real run lives at /p/:id (the server and dev middleware serve the app there): reload or share = reopen it.
const pathId = /^\/p\/([A-Za-z0-9_-]{4,40})\/?$/.exec(location.pathname)?.[1] ?? null;
const openId = p7.project ?? pathId;
// a finished example opens on its report (as from the home card), so a shared link never skips the report and its proof
if (openId && !p7.step && !p7.demo) flow.next({ type: "switch-project", id: openId, ...(/^ex-/.test(openId) ? { at: "report" as const } : {}) });
const demo = p7.demo ? createDemo(flow, p7.demoAt ?? 0) : null;

const ui = p.ui ? createUi(uiHost, { world, flow, demo, still: p.still }) : null;
if (q.get("offices") === "1" || q.get("projects") === "1") setTimeout(() => ui?.openOffices(), 0);

Object.assign(window, { __proto: { world, flow, demo, ui } }); // console / screenshot scripts
