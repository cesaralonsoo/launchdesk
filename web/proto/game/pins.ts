// In-app pills pinned to the 3D (offices floor and campus), positioned from world.labelPoints() at <= 30 Hz.
// Same idea as WP-A's ui/labels.ts for the home; this one only draws the game's own pills (office rooms, campus plots)
// so the two packages never edit the same file. Swap for ui/labels.ts at integration if it offers the same thing.
import type { WorldV7 } from "../contracts";
import type { WorldV8 } from "../world/api-v8";
import { esc } from "../ui/dom";

type World = WorldV7 & WorldV8;
export interface Pin {
  id: string;
  html: string;
  /** "dot" = a small numbered/coloured dot (phones), "pill" = a white pill. */
  kind?: "pill" | "dot";
  tone?: string;
  /** Nothing to open: drawn as a plain label (no pointer cursor, not focusable, clicks go to the 3D). */
  inert?: boolean;
  /** Accessible name for an interactive pin ("Research: open the report"). */
  label?: string;
}

/** What a pin must never sit on: the open panel (report, proof, kit, cards, sheets), the top bar, the example strip and
 *  the HUD. A pin that would touch one of them is hidden for that frame (they also paint above the pin layer). */
const OCCLUDERS = ".ui .panels > .panel.in, .ui .chrome, .ex-ribbon, .hud-card, .hud-pill, .hud-back, .hud-sheet, .ofx, .db-meta";

export function createPins(host: HTMLElement, world: World, onPick: (id: string) => void) {
  const layer = document.createElement("div");
  layer.className = "gp-layer";
  layer.setAttribute("aria-hidden", "false");
  host.appendChild(layer);
  let pins: Pin[] = [];
  let els = new Map<string, HTMLElement>();
  const size = new WeakMap<HTMLElement, { w: number; h: number }>();
  let raf = 0;
  let last = 0;
  let on = false;

  layer.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-pin]");
    const id = b?.dataset.pin;
    if (id && !b!.hasAttribute("data-inert")) onPick(id);
  });

  function sync() {
    const keep = new Set(pins.map((p) => p.id));
    for (const [id, n] of els) if (!keep.has(id)) (n.remove(), els.delete(id));
    for (const p of pins) {
      let n = els.get(p.id);
      if (!n) {
        const b = document.createElement("button");
        b.type = "button";
        n = b;
        n.dataset.pin = p.id;
        layer.appendChild(n);
        els.set(p.id, n);
      }
      n.className = `gp gp-${p.kind ?? "pill"}`;
      if (p.tone) n.style.setProperty("--tone", p.tone);
      if (n.innerHTML !== p.html) (n.innerHTML = p.html), size.delete(n);
      n.toggleAttribute("data-inert", !!p.inert);
      if (p.inert) (n.tabIndex = -1), n.setAttribute("aria-disabled", "true");
      else (n.removeAttribute("tabindex"), n.removeAttribute("aria-disabled"));
      if (p.label && !p.inert) n.setAttribute("aria-label", p.label);
      else n.removeAttribute("aria-label");
    }
  }
  function frame(t: number) {
    raf = requestAnimationFrame(frame);
    if (t - last < 33) return;
    last = t;
    const canvas = document.getElementById("world")?.getBoundingClientRect();
    const ox = canvas?.left ?? 0;
    const oy = canvas?.top ?? 0;
    const pts = new Map(world.labelPoints().map((p) => [p.id, p]));
    const occ = [...document.querySelectorAll<HTMLElement>(OCCLUDERS)]
      .filter((o) => o.offsetParent !== null || getComputedStyle(o).position === "fixed")
      .map((o) => o.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    for (const [id, n] of els) {
      const p = pts.get(id);
      let show = !!p && p.visible;
      if (show) {
        const x = Math.round(ox + p!.x);
        const y = Math.round(oy + p!.y);
        let sz = size.get(n);
        if (!sz) {
          n.hidden = false;
          sz = { w: n.offsetWidth, h: n.offsetHeight };
          if (sz.w) size.set(n, sz);
        }
        // the pin's box (anchored bottom-centre on its point), with a little air around it
        const l = x - sz.w / 2 - 4, r = x + sz.w / 2 + 4, t = y - sz.h - 4, b = y + 4;
        if (occ.some((o) => l < o.right && r > o.left && t < o.bottom && b > o.top)) show = false;
        else n.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
      n.hidden = !show;
    }
  }
  return {
    set(next: Pin[]) {
      pins = next;
      sync();
      const want = pins.length > 0;
      if (want && !on) {
        on = true;
        raf = requestAnimationFrame(frame);
      } else if (!want && on) {
        on = false;
        cancelAnimationFrame(raf);
      }
    },
    dispose() {
      cancelAnimationFrame(raf);
      layer.remove();
      els = new Map();
    },
  };
}

export const pillHtml = (title: string, sub?: string, dot?: string) =>
  `${dot ? `<i class="gp-dot" style="background:${esc(dot)}"></i>` : ""}<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}`;
