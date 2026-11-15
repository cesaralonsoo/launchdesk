// v6 · Dev tools (WS-B), only with ?switcher=1: time of day, cycle speed, logo candidates, speed, jump, replay.
// The product has one layout (center) and one skin that follows the day cycle, so there is nothing to "theme" here.
import { DAY_TIMES, writeParams, type DayClockInfo, type DayPhaseName, type FlowStep } from "../contracts";
import { el } from "./dom";
import { I } from "./icons";
import { MARK_IDS, MARK_NAMES, getMark, ldMark, setMark, type MarkId } from "./logo";

export const JUMPS: Array<{ id: string; label: string; to: { step: FlowStep; dept?: "mia" | "leo" | "sam" | "nova" | "dex" | "rae" | "pip" } }> = [
  { id: "idea", label: "Idea", to: { step: "idea" } },
  { id: "pay1", label: "Pay $0.10", to: { step: "pay-validate" } },
  { id: "mia", label: "Mia · Plan", to: { step: "validate", dept: "mia" } },
  { id: "leo", label: "Leo · Market", to: { step: "validate", dept: "leo" } },
  { id: "sam", label: "Sam · Money", to: { step: "validate", dept: "sam" } },
  { id: "verdict", label: "Verdict", to: { step: "verdict" } },
  { id: "pay2", label: "Pay $0.20", to: { step: "pay-build" } },
  { id: "nova", label: "Nova · Brand", to: { step: "build", dept: "nova" } },
  { id: "dex", label: "Dex · Logo & site", to: { step: "build", dept: "dex" } },
  { id: "rae", label: "Rae · Launch", to: { step: "build", dept: "rae" } },
  { id: "pip", label: "Pip · Live", to: { step: "build", dept: "pip" } },
  { id: "levelup", label: "Level up", to: { step: "level-up" } },
  { id: "live", label: "Live", to: { step: "live" } },
  { id: "district", label: "District", to: { step: "scale" } },
];

export interface Clock {
  info(): DayClockInfo;
  onClock(cb: (i: DayClockInfo) => void): () => void;
  /** fixed time (0..1) or a cycle of `periodSec` (null = paused at the current time) */
  fix(t: number): void;
  cycle(periodSec: number): void;
}

export interface SwitcherDeps {
  clock: Clock;
  fast: boolean;
  onSpeed(fast: boolean): void;
  onJump(id: string): void;
  onReplay(): void;
}

const CYCLES: Array<[string, number]> = [["30 min", 1800], ["4 min", 240], ["1 min", 60]];

export function createSwitcher(deps: SwitcherDeps): HTMLElement {
  let fast = deps.fast;
  let mode: "fixed" | number = 1800;
  const root = el(`<div class="switcher" data-open="0">
    <button class="sw-chip glass" type="button" aria-expanded="false" aria-label="Dev tools">${I.sun(16)}<span class="sw-t">--:--</span></button>
    <div class="sw-panel glass" role="dialog" aria-label="Dev tools">
      <div class="sw-sec"><span class="sw-h">Time of day <b class="sw-phase"></b></span>
        <input class="sw-time" type="range" min="0" max="1" step="0.001" aria-label="Time of day"/>
        <div class="sw-marks">${(Object.keys(DAY_TIMES) as DayPhaseName[]).map((k) => `<button type="button" data-at="${DAY_TIMES[k]}">${k}</button>`).join("")}</div>
      </div>
      <div class="sw-sec"><span class="sw-h">Cycle</span><div class="seg sw-cycle">${CYCLES.map(([l, s]) => `<button type="button" data-cycle="${s}">${l}</button>`).join("")}<button type="button" data-cycle="0">Hold</button></div></div>
      <div class="sw-sec"><span class="sw-h">Logo</span><div class="sw-marks-logo">${MARK_IDS.map((m) => `<button type="button" data-mark="${m}" title="${MARK_NAMES[m]}">${ldMark(22, m, true)}<span>${MARK_NAMES[m]}</span></button>`).join("")}</div></div>
      <div class="sw-sec sw-row">
        <div><span class="sw-h">Speed</span><div class="seg sw-speed"><button type="button" data-speed="1">1×</button><button type="button" data-speed="3">3×</button></div></div>
        <div class="sw-grow"><span class="sw-h">Jump to</span><select class="sw-jump"><option value="">Step…</option>${JUMPS.map((j) => `<option value="${j.id}">${j.label}</option>`).join("")}</select></div>
        <button class="btn btn-ghost btn-icon sw-replay" type="button" aria-label="Replay" title="Replay">${I.replay(16)}</button>
      </div>
    </div>
  </div>`);
  const range = root.querySelector<HTMLInputElement>(".sw-time")!;
  const tEl = root.querySelector<HTMLElement>(".sw-t")!;
  const phEl = root.querySelector<HTMLElement>(".sw-phase")!;
  const hhmm = (t: number) => {
    const m = Math.round(t * 24 * 60) % (24 * 60);
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };
  const sync = () => {
    root.querySelectorAll<HTMLElement>("[data-speed]").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.speed === "3") === fast)));
    root.querySelectorAll<HTMLElement>("[data-cycle]").forEach((b) => b.setAttribute("aria-pressed", String(mode === "fixed" ? b.dataset.cycle === "0" : Number(b.dataset.cycle) === mode)));
    root.querySelectorAll<HTMLElement>("[data-mark]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mark === getMark())));
  };
  deps.clock.onClock((i) => {
    tEl.textContent = hhmm(i.t);
    phEl.textContent = i.name;
    if (document.activeElement !== range) range.value = String(i.t);
  });
  range.addEventListener("input", () => {
    mode = "fixed";
    deps.clock.fix(Number(range.value));
    writeParams({ time: Number(range.value).toFixed(3), cycle: null });
    sync();
  });
  const setOpen = (o: boolean) => {
    root.dataset.open = o ? "1" : "0";
    root.querySelector(".sw-chip")!.setAttribute("aria-expanded", String(o));
  };
  root.querySelector(".sw-chip")!.addEventListener("click", () => setOpen(root.dataset.open !== "1"));
  root.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("button");
    if (!b) return;
    if (b.dataset.at) {
      mode = "fixed";
      deps.clock.fix(Number(b.dataset.at));
      writeParams({ time: b.dataset.at, cycle: null });
    } else if (b.dataset.cycle) {
      const s = Number(b.dataset.cycle);
      if (s) {
        mode = s;
        deps.clock.cycle(s);
        writeParams({ time: null, cycle: s === 1800 ? null : String(s) });
      } else {
        mode = "fixed";
        deps.clock.fix(deps.clock.info().t);
      }
    } else if (b.dataset.mark) {
      setMark(b.dataset.mark as MarkId);
      writeParams({ mark: b.dataset.mark } as never);
    } else if (b.dataset.speed) {
      fast = b.dataset.speed === "3";
      writeParams({ fast: fast ? "1" : null });
      deps.onSpeed(fast);
    } else if (b.classList.contains("sw-replay")) {
      setOpen(false);
      deps.onReplay();
    }
    sync();
  });
  root.querySelector<HTMLSelectElement>(".sw-jump")!.addEventListener("change", (e) => {
    const s = e.target as HTMLSelectElement;
    if (s.value) deps.onJump(s.value);
    s.value = "";
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && setOpen(false));
  document.addEventListener("pointerdown", (e) => !root.contains(e.target as Node) && setOpen(false));
  sync();
  return root;
}
