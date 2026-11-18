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
}

export function createPins(host: HTMLElement, world: World, onPick: (id: string) => void) {
  const layer = document.createElement("div");
  layer.className = "gp-layer";
  layer.setAttribute("aria-hidden", "false");
  host.appendChild(layer);
  let pins: Pin[] = [];
  let els = new Map<string, HTMLElement>();
  let raf = 0;
  let last = 0;
  let on = false;

  layer.addEventListener("click", (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-pin]")?.dataset.pin;
    if (id) onPick(id);
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
      if (n.innerHTML !== p.html) n.innerHTML = p.html;
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
    for (const [id, n] of els) {
      const p = pts.get(id);
      const show = !!p && p.visible;
      n.hidden = !show;
      if (show) n.style.transform = `translate(${Math.round(ox + p!.x)}px, ${Math.round(oy + p!.y)}px) translate(-50%, -100%)`;
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
