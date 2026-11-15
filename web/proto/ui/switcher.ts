// Variant switcher (WS-C): bottom-left "Aa" chip → Theme · Layout · Speed · Jump · Replay.
import { LAYOUT_IDS, THEME_IDS, writeParams, type FlowStep, type LayoutId, type ThemeId, type ThemeTokens } from "../contracts";
import { LAYOUT_NAMES, THEMES } from "../themes";
import { el } from "./dom";
import { I } from "./icons";

export const JUMPS: Array<{ id: string; label: string; to: { step: FlowStep; dept?: "mia" | "leo" | "sam" | "nova" | "dex" | "rae" | "pip" } }> = [
  { id: "idea", label: "Idea", to: { step: "idea" } },
  { id: "pay1", label: "Pay $0.10", to: { step: "pay-validate" } },
  { id: "mia", label: "Mia · Plan", to: { step: "validate", dept: "mia" } },
  { id: "leo", label: "Leo · Score", to: { step: "validate", dept: "leo" } },
  { id: "sam", label: "Sam · Numbers", to: { step: "validate", dept: "sam" } },
  { id: "verdict", label: "Verdict", to: { step: "verdict" } },
  { id: "pay2", label: "Pay $0.20", to: { step: "pay-build" } },
  { id: "nova", label: "Nova · Brand", to: { step: "build", dept: "nova" } },
  { id: "dex", label: "Dex · Logo", to: { step: "build", dept: "dex" } },
  { id: "rae", label: "Rae · Launch", to: { step: "build", dept: "rae" } },
  { id: "pip", label: "Pip · Live", to: { step: "build", dept: "pip" } },
  { id: "levelup", label: "Level up", to: { step: "level-up" } },
  { id: "live", label: "Live", to: { step: "live" } },
  { id: "district", label: "District", to: { step: "scale" } },
];

export interface SwitcherDeps {
  theme: ThemeId;
  layout: LayoutId;
  fast: boolean;
  onTheme(t: ThemeTokens): void;
  onLayout(l: LayoutId): void;
  onSpeed(fast: boolean): void;
  onJump(id: string): void;
  onReplay(): void;
}

export function createSwitcher(deps: SwitcherDeps): HTMLElement {
  let theme = deps.theme, layout = deps.layout, fast = deps.fast;
  const root = el(`<div class="switcher" data-open="0">
    <button class="sw-chip glass" type="button" aria-expanded="false" aria-label="Design variants"><span>Aa</span></button>
    <div class="sw-panel glass" role="dialog" aria-label="Design variants">
      <div class="sw-sec"><span class="sw-h">Theme</span><div class="sw-themes"></div></div>
      <div class="sw-sec"><span class="sw-h">Layout</span><div class="seg sw-layouts"></div></div>
      <div class="sw-sec sw-row">
        <div><span class="sw-h">Speed</span><div class="seg sw-speed"><button type="button" data-speed="1">1×</button><button type="button" data-speed="3">3×</button></div></div>
        <div class="sw-grow"><span class="sw-h">Jump to</span><select class="sw-jump"><option value="">Step…</option>${JUMPS.map((j) => `<option value="${j.id}">${j.label}</option>`).join("")}</select></div>
        <button class="btn btn-ghost btn-icon sw-replay" type="button" aria-label="Replay" title="Replay">${I.replay(16)}</button>
      </div>
    </div>
  </div>`);
  const themes = root.querySelector<HTMLElement>(".sw-themes")!;
  const layouts = root.querySelector<HTMLElement>(".sw-layouts")!;
  themes.innerHTML = THEME_IDS.map((id) => {
    const t = THEMES[id];
    const [a, b = a] = t.atmosphere.sky;
    return `<button type="button" class="sw-theme" data-theme="${id}" style="--sa:${a};--sb:${b};--sc:${t.colors.accent};--sf:${t.fonts.display}">
      <span class="sw-sw"><i></i></span><span class="sw-name">${t.name}</span></button>`;
  }).join("");
  layouts.innerHTML = LAYOUT_IDS.map((id) => `<button type="button" data-layout="${id}">${LAYOUT_NAMES[id]}</button>`).join("");

  const sync = () => {
    root.querySelectorAll<HTMLElement>("[data-theme]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.theme === theme)));
    root.querySelectorAll<HTMLElement>("[data-layout]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.layout === layout)));
    root.querySelectorAll<HTMLElement>("[data-speed]").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.speed === "3") === fast)));
  };
  const setOpen = (o: boolean) => {
    root.dataset.open = o ? "1" : "0";
    root.querySelector(".sw-chip")!.setAttribute("aria-expanded", String(o));
  };
  root.querySelector(".sw-chip")!.addEventListener("click", () => setOpen(root.dataset.open !== "1"));
  root.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("button");
    if (!b) return;
    if (b.dataset.theme) {
      theme = b.dataset.theme as ThemeId;
      writeParams({ theme });
      deps.onTheme(THEMES[theme]);
    } else if (b.dataset.layout) {
      layout = b.dataset.layout as LayoutId;
      writeParams({ layout });
      deps.onLayout(layout);
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
