// Floating DOM labels pinned to points of the 3D world (PLAN.md 2.2 / 5.4). Generic: the home uses it for the three
// stage pills over the floor, the game layer (WP-C) for its in-app pills. The layer element must cover the canvas
// exactly (points are canvas-relative CSS px, as WorldV8.labelPoints() returns them). Positions are read at most
// `hz` times a second (default 30) and only while the layer is shown and not paused.

export interface LabelPoint {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface LabelDef {
  id: string;
  /** Inner HTML of the label (trusted markup built by the caller). */
  html: string;
  className?: string;
  /** Accessible name; the label is a <button> when onClick is set, else a <span aria-hidden>. */
  label?: string;
  onClick?(id: string): void;
  onEnter?(id: string): void;
  onLeave?(id: string): void;
}

export interface LabelsOpts {
  points(): LabelPoint[];
  defs: LabelDef[];
  hz?: number;
}

export interface Labels {
  setDefs(defs: LabelDef[]): void;
  /** Marks one label as active (class "on") and the layer as focused (class "focus"); null clears it. */
  setActive(id: string | null): void;
  setPaused(p: boolean): void;
  /** Re-read the points now (after a resize, for example). */
  refresh(): void;
  dispose(): void;
}

export function mountLabels(layer: HTMLElement, o: LabelsOpts): Labels {
  const els = new Map<string, HTMLElement>();
  const every = 1000 / Math.max(1, Math.min(60, o.hz ?? 30));
  let raf = 0;
  let last = 0;
  let paused = false;
  let active: string | null = null;

  function build(defs: LabelDef[]) {
    for (const e of els.values()) e.remove();
    els.clear();
    for (const d of defs) {
      const e = document.createElement(d.onClick ? "button" : "span");
      e.className = `lbl ${d.className ?? ""}`.trim();
      e.dataset.id = d.id;
      e.innerHTML = d.html;
      e.style.visibility = "hidden";
      if (e instanceof HTMLButtonElement) {
        e.type = "button";
        if (d.label) e.setAttribute("aria-label", d.label);
        e.addEventListener("click", () => d.onClick?.(d.id));
      } else e.setAttribute("aria-hidden", "true");
      if (d.onEnter) {
        e.addEventListener("pointerenter", (ev) => (ev as PointerEvent).pointerType === "mouse" && d.onEnter?.(d.id));
        e.addEventListener("focus", () => d.onEnter?.(d.id));
      }
      if (d.onLeave) {
        e.addEventListener("pointerleave", (ev) => (ev as PointerEvent).pointerType === "mouse" && d.onLeave?.(d.id));
        e.addEventListener("blur", () => d.onLeave?.(d.id));
      }
      if (d.id === active) e.classList.add("on");
      layer.appendChild(e);
      els.set(d.id, e);
    }
    place();
  }

  function place() {
    let pts: LabelPoint[] = [];
    try {
      pts = o.points();
    } catch {
      pts = [];
    }
    const seen = new Set<string>();
    const w = layer.clientWidth;
    const h = layer.clientHeight;
    for (const p of pts) {
      const e = els.get(p.id);
      if (!e || seen.has(p.id)) continue;
      seen.add(p.id);
      const ok = p.visible && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > -40 && p.y > -40 && p.x < w + 40 && p.y < h + 40;
      e.style.visibility = ok ? "visible" : "hidden";
      if (ok) e.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`;
    }
    for (const [id, e] of els) if (!seen.has(id)) e.style.visibility = "hidden";
  }

  function tick(t: number) {
    raf = requestAnimationFrame(tick);
    if (paused || t - last < every) return;
    last = t;
    place();
  }
  build(o.defs);
  raf = requestAnimationFrame(tick);

  return {
    setDefs: build,
    setActive(id) {
      active = id;
      layer.classList.toggle("focus", !!id);
      for (const [k, e] of els) e.classList.toggle("on", k === id);
    },
    setPaused(p) {
      paused = p;
      if (!p) place();
    },
    refresh: place,
    dispose() {
      cancelAnimationFrame(raf);
      for (const e of els.values()) e.remove();
      els.clear();
    },
  };
}
