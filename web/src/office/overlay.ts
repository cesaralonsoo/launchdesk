// Office overlay (spec-v4 L23–L27): one white label language over the 3D/2D office.
// A room label is a 26px white pill; a result "pin" is the same label expanded upward with a value line.
// Labels never overlap (collision pass each frame). One transient chip at a time. Confetti is one burst.
// The public methods are what scene.ts and fallback2d.ts call; their signatures stay as they were.
import { DEPT_IDS, ROOM, type AgentState, type ChipTone, type DeptId, type PinSpec } from "./layout";
import { DELIVERABLE } from "../app/team";

export type P3 = { x: number; y: number; z: number };
export type Rect = { x: number; y: number; w: number; h: number };
const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export type Projector = (p: P3) => { x: number; y: number };
export type Anchors = {
  label(id: DeptId): P3;
  pin(id: DeptId): P3;
  chip(id: DeptId): P3;
  head(id: DeptId): P3;
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const reducedMotion = () => {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};
const SPRING_SOFT = "linear(0, .22 6%, .55 14%, .8 24%, .94 35%, 1.008 50%, 1.012 62%, 1.003 80%, 1)";

/** Short role shown after the name on hover, focus or while working ("Leo · Market score").
 *  The same deliverable words as the team list next to the office, so the two never disagree. */
export const ROLE_SHORT: Record<DeptId, string> = { lobby: "Front desk", ...DELIVERABLE };

const LABEL_H = 26;
/** Canvas inset for every overlay element (L21). */
const INSET = 12;

type LabelState = { state: AgentState; note: string | null; open: boolean; flag: boolean; value: string | null };
type Box = { id: DeptId; ax: number; ay: number; w: number; h: number; x: number; y: number; off: boolean };

export class Overlay {
  readonly el: HTMLDivElement;
  private labels = new Map<DeptId, HTMLDivElement>();
  private leaders = new Map<DeptId, HTMLDivElement>();
  private st = new Map<DeptId, LabelState>();
  private size = new Map<DeptId, [number, number]>();
  private chipQ: Array<{ id: DeptId; text: string; tone: ChipTone }> = [];
  private chipNow: { el: HTMLElement; id: DeptId; until: number } | null = null;
  private bubbles: Array<{ el: HTMLElement; id: DeptId; until: number }> = [];
  private zzz = new Map<DeptId, HTMLDivElement>();
  private confetti: Confetti;
  private wasCompact = false;
  /** Screen rects covered by other UI (status pill, controls, coach mark). */
  occluders: (() => Rect[]) | null = null;
  onLabelClick: ((id: DeptId) => void) | null = null;

  constructor(private host: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "lo-overlay";
    host.appendChild(this.el);
    this.confetti = new Confetti(host);
    for (const id of DEPT_IDS) {
      const r = ROOM[id];
      const lead = document.createElement("div");
      lead.className = "lo-leader";
      this.el.appendChild(lead);
      this.leaders.set(id, lead);
      const l = document.createElement("div");
      l.className = "lo-label";
      l.dataset.room = id;
      l.style.setProperty("--c", r.color);
      l.tabIndex = -1;
      l.addEventListener("click", () => this.onLabelClick?.(id));
      l.addEventListener("pointerenter", () => l.classList.add("is-hover"));
      l.addEventListener("pointerleave", () => l.classList.remove("is-hover"));
      this.el.appendChild(l);
      this.labels.set(id, l);
      this.st.set(id, { state: id === "pip" ? "sleeping" : "idle", note: null, open: false, flag: false, value: null });
      this.render(id);
    }
  }

  private render(id: DeptId, animate = false) {
    const s = this.st.get(id)!;
    const r = ROOM[id];
    const l = this.labels.get(id)!;
    const box = l.firstElementChild as HTMLElement | null;
    const before = animate && box && !reducedMotion() ? box.getBoundingClientRect() : null;
    this.size.delete(id);
    l.classList.toggle("is-open", s.open);
    l.classList.toggle("is-working", s.state === "working" && !s.flag);
    l.classList.toggle("is-done", s.state === "done" && !s.flag);
    l.classList.toggle("is-error", s.flag);
    l.classList.toggle("is-pin", !!s.value);
    l.setAttribute("role", "button");
    l.setAttribute("aria-label", s.flag ? `${r.name} hit a snag` : `${r.name}, ${ROLE_SHORT[id]}${s.value ? `: ${s.value}` : ""}`);
    const mark = s.flag
      ? `<i class="lo-dot lo-err"></i>`
      : s.state === "done"
        ? `<i class="lo-check"><svg viewBox="0 0 12 12" width="12" height="12"><circle cx="6" cy="6" r="6" fill="#0AC18E"/><path d="M3.4 6.2l1.8 1.7 3.4-3.6" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></i>`
        : `<i class="lo-dot"></i>`;
    const role = s.flag ? "Hit a snag" : ROLE_SHORT[id];
    l.innerHTML =
      // One structure for every pin: line 1 the mark and the name, line 2 the value ("Leo" / "7.8 · Go").
      `<div class="lo-box">` +
      `<div class="lo-row">${mark}<b>${esc(r.name)}</b><span class="lo-role"> · ${esc(role)}</span></div>` +
      (s.value ? `<div class="lo-val">${esc(s.value)}</div>` : "") +
      `</div>`;
    if (before) {
      const nb = l.firstElementChild as HTMLElement;
      const after = nb.getBoundingClientRect();
      if (Math.abs(after.width - before.width) > 1 || Math.abs(after.height - before.height) > 1) {
        // L24: width/height morph from the old pill, 320ms spring-soft, the value line fades in
        nb.animate([{ width: `${before.width}px`, height: `${before.height}px` }, { width: `${after.width}px`, height: `${after.height}px` }], { duration: 320, easing: SPRING_SOFT });
        nb.querySelector(".lo-val")?.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 220, delay: 100, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" });
      }
    }
  }

  setAgentState(id: DeptId, s: AgentState) {
    const st = this.st.get(id)!;
    if (st.state === s) return;
    const wasDone = st.state === "done";
    st.state = s;
    this.render(id, true);
    if (s === "done" && !wasDone && !reducedMotion()) {
      const svg = this.labels.get(id)!.querySelector<SVGPathElement>(".lo-check path");
      if (svg) {
        svg.style.strokeDasharray = "14";
        svg.animate([{ strokeDashoffset: 14 }, { strokeDashoffset: 0 }], { duration: 240, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" });
      }
    }
  }
  /** v3 second line under the label. v4 keeps the label to one line (the Now card carries the detail). */
  note(id: DeptId, text: string | null) {
    this.st.get(id)!.note = text;
  }
  /** Red "hit a snag" state. */
  flag(id: DeptId, on: boolean) {
    const st = this.st.get(id)!;
    if (st.flag === on) return;
    st.flag = on;
    this.render(id);
  }
  openLabel(id: DeptId | null) {
    for (const d of DEPT_IDS) {
      const st = this.st.get(d)!;
      const want = d === id;
      if (st.open !== want) {
        st.open = want;
        this.render(d);
      }
    }
  }

  /** L24: the room's label expands upward with a value line ("7.8 · Go"). Kicker and icon are not shown. */
  pin(id: DeptId, p: PinSpec) {
    const st = this.st.get(id)!;
    const v = p.value || null;
    if (st.value === v) return;
    st.value = v;
    this.render(id, true);
  }
  clearPins() {
    for (const id of DEPT_IDS) {
      const st = this.st.get(id)!;
      if (st.value) {
        st.value = null;
        this.render(id, true);
      }
    }
  }

  /**
   * L26: at most one transient chip in the whole office, FIFO, 1800ms life, white with ink text.
   * The tone is kept for API parity; v4 chips all look the same.
   */
  chip(id: DeptId, text: string, tone: ChipTone = "bch") {
    this.chipQ.push({ id, text, tone });
    if (this.chipQ.length > 3) this.chipQ.shift();
  }

  bubble(id: DeptId, text: string) {
    for (const b of this.bubbles) if (b.id === id) b.until = 0;
    const el = document.createElement("div");
    el.className = "lo-bubble";
    el.style.setProperty("--c", ROOM[id].color);
    el.innerHTML = `<div class="lo-bubble-in"><b>${esc(ROOM[id].name)}</b> ${esc(text)}</div>`;
    this.el.appendChild(el);
    this.bubbles.push({ el, id, until: performance.now() + 4200 });
  }

  celebrate() {
    if (reducedMotion()) return;
    const brand = getComputedStyle(this.host).getPropertyValue("--lo-brand").trim();
    this.confetti.burst(brand || "#1D1D1F");
  }
  /** Something on the overlay is animating (chips, speech bubbles, confetti). */
  get busy() {
    return !!this.chipNow || this.chipQ.length > 0 || this.bubbles.length > 0 || this.confetti.active;
  }

  update(project: Projector, a: Anchors, sleeping: (id: DeptId) => boolean, width: number, height: number) {
    const now = performance.now();
    const place = (el: HTMLElement, x: number, y: number) => {
      el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    };
    const occ = this.occluders?.() ?? [];
    const anyWorking = [...this.st.values()].some((s) => s.state === "working");
    // Phone-width office (L21/L25): only the working room, an error, a pin or a tapped label gets the
    // full pill; every other room is an 8px marker so the small office stays the hero.
    const compact = width < 560;
    this.el.classList.toggle("is-compact", compact);
    const labelH = compact ? 22 : LABEL_H;
    if (compact !== this.wasCompact) {
      this.wasCompact = compact;
      this.size.clear();
    }

    // ---- labels: measure, then a collision pass in screen space (L25) ----
    const boxes: Box[] = [];
    for (const id of DEPT_IDS) {
      const l = this.labels.get(id)!;
      let sz = this.size.get(id);
      if (!sz) {
        const b = l.firstElementChild as HTMLElement;
        // Measure the full pill even while it is shown as a dot, so it expands to the right size.
        const asDot = l.classList.contains("is-dot");
        if (asDot) l.classList.remove("is-dot");
        sz = [b.offsetWidth || 60, b.offsetHeight || labelH];
        if (asDot) l.classList.add("is-dot");
        this.size.set(id, sz);
      }
      const p = project(a.label(id));
      const [w, hh] = sz;
      // The anchor is the centre of the bottom row; a pin grows upward from it.
      const off = p.x < -w || p.x > width + w || p.y < -20 || p.y > height + 20;
      const x = Math.min(Math.max(p.x, INSET + w / 2), width - INSET - w / 2);
      const top = p.y - labelH / 2 - (hh - labelH);
      // Clamp every label inside the canvas with the 12px inset on all four sides (L21).
      const y = Math.min(Math.max(INSET, top), Math.max(INSET, height - INSET - hh));
      boxes.push({ id, ax: p.x, ay: p.y, w, h: hh, x, y, off });
    }
    boxes.sort((m, n) => m.y - n.y);
    const placed: Rect[] = [];
    for (const b of boxes) {
      const l = this.labels.get(b.id)!;
      const lead = this.leaders.get(b.id)!;
      l.classList.toggle("is-off", b.off);
      if (b.off) {
        lead.classList.remove("on");
        continue;
      }
      const y0 = b.y;
      let r: Rect = { x: b.x - b.w / 2, y: b.y, w: b.w, h: b.h };
      let moved = 0;
      while (placed.some((o) => hits(r, o)) && moved < 24) {
        moved += 4;
        r = { ...r, y: y0 + moved };
      }
      const ls = this.st.get(b.id)!;
      const focal = ls.state === "working" || ls.flag || !!ls.value || ls.open || l.classList.contains("is-hover");
      const clash = placed.some((o) => hits(r, o));
      const dot = (compact && !focal) || (clash && !l.classList.contains("is-hover") && !ls.open);
      l.classList.toggle("is-dot", dot);
      if (dot) {
        const dy = Math.min(Math.max(INSET, y0 + b.h - labelH / 2 - 6), height - INSET - 12);
        r = { x: b.x - 6, y: dy, w: 12, h: 12 };
        moved = 0;
      } else if (clash) moved = 0;
      // labels under the status pill or the controls fade out
      l.classList.toggle("is-hidden", occ.some((o) => hits(r, o)));
      placed.push(r);
      // translate to the name-row centre
      const cy = dot ? r.y + 6 : r.y + b.h - labelH / 2;
      place(l, b.x, cy);
      if (moved > 0 && !dot) {
        const len = moved;
        lead.style.height = `${len}px`;
        place(lead, b.ax, b.ay);
        lead.classList.add("on");
      } else lead.classList.remove("on");
    }

    // ---- zzz (Pip asleep). Hidden while someone works: one infinite animation at a time. ----
    for (const id of DEPT_IDS) {
      const z = this.zzz.get(id);
      if (sleeping(id) && !anyWorking) {
        let el = z;
        if (!el) {
          el = document.createElement("div");
          el.className = "lo-zzz";
          el.innerHTML = "<i>z</i><i>z</i><i>Z</i>";
          this.el.appendChild(el);
          this.zzz.set(id, el);
        }
        const p = project(a.head(id));
        place(el, p.x, p.y);
      } else if (z) {
        z.remove();
        this.zzz.delete(id);
      }
    }

    // ---- one transient chip at a time ----
    if (this.chipNow && now > this.chipNow.until) {
      const old = this.chipNow.el;
      old.classList.add("is-out");
      setTimeout(() => old.remove(), 200);
      this.chipNow = null;
    }
    if (!this.chipNow && this.chipQ.length) {
      const c = this.chipQ.shift()!;
      const el = document.createElement("div");
      el.className = "lo-chip";
      el.innerHTML = `<span>${c.tone === "bch" ? '<i class="lo-chip-dot"></i>' : ""}${esc(c.text)}</span>`;
      this.el.appendChild(el);
      this.chipNow = { el, id: c.id, until: now + 1800 };
    }
    if (this.chipNow) {
      const p = project(a.chip(this.chipNow.id));
      place(this.chipNow.el, Math.min(Math.max(p.x, 80), width - 80), Math.max(p.y, 40));
    }

    this.bubbles = this.bubbles.filter((b) => {
      if (now > b.until) {
        b.el.classList.add("is-out");
        if (now > b.until + 250) {
          b.el.remove();
          return false;
        }
      }
      const p = project(a.head(b.id));
      place(b.el, Math.min(Math.max(p.x, 130), width - 130), Math.max(p.y, 80));
      return true;
    });
  }

  dispose() {
    this.confetti.dispose();
    this.el.remove();
  }
}

/**
 * M8 t600: labels turn done-green in work order (90ms stagger): the check crossfades in and the label
 * breathes 1 → 1.04 → 1 over 300ms. No-op under reduced motion.
 */
export function pulseLabels(host: HTMLElement, ids: DeptId[], stagger = 90): void {
  if (reducedMotion()) return;
  ids.forEach((id, i) => {
    const box = host.querySelector<HTMLElement>(`.lo-label[data-room="${id}"] .lo-box`);
    box?.animate([{ transform: "scale(1)" }, { transform: "scale(1.04)", offset: 0.45 }, { transform: "scale(1)" }], { duration: 300, delay: i * stagger, easing: SPRING_SOFT });
    host.querySelector<HTMLElement>(`.lo-label[data-room="${id}"] .lo-check`)?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: i * stagger, fill: "backwards" });
  });
}

/** L27: one burst from top-centre, 70–90 particles, BCH green + white + the brand primary, 1.8s life. */
class Confetti {
  private c: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private parts: Array<{ x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; life: number; edge: boolean }> = [];
  private raf = 0;
  private last = 0;

  constructor(host: HTMLElement) {
    this.c = document.createElement("canvas");
    this.c.className = "lo-confetti";
    host.appendChild(this.c);
    this.g = this.c.getContext("2d")!;
  }

  burst(brand: string) {
    const rect = this.c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.c.width = Math.max(1, rect.width * dpr);
    this.c.height = Math.max(1, rect.height * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = ["#0AC18E", "#FFFFFF", brand];
    const n = 70 + Math.floor(Math.random() * 21);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
      const sp = 380 + Math.random() * 420;
      const c = cols[i % cols.length]!;
      this.parts.push({
        x: rect.width / 2 + (Math.random() - 0.5) * 40, y: -6,
        vx: Math.cos(a) * sp * 0.9, vy: Math.abs(Math.sin(a)) * sp * 0.35 + 60,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 10,
        w: 5 + Math.random() * 3, h: 8 + Math.random() * 5, c, life: 1.8, edge: c.toUpperCase() === "#FFFFFF",
      });
    }
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private tick = (now: number) => {
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    const { width, height } = this.c.getBoundingClientRect();
    this.g.clearRect(0, 0, width, height);
    this.parts = this.parts.filter((p) => {
      p.life -= dt;
      p.vy += 900 * dt;
      p.vx *= 1 - dt * 1.4;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      if (p.life <= 0 || p.y > height + 20) return false;
      this.g.save();
      this.g.globalAlpha = Math.min(1, p.life / 0.4);
      this.g.translate(p.x, p.y);
      this.g.rotate(p.r);
      this.g.scale(1, Math.cos(p.r * 2.3));
      this.g.fillStyle = p.c;
      this.g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      if (p.edge) {
        this.g.strokeStyle = "rgba(0,0,0,.14)";
        this.g.lineWidth = 1;
        this.g.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      this.g.restore();
      return true;
    });
    if (this.parts.length) this.raf = requestAnimationFrame(this.tick);
    else {
      this.raf = 0;
      this.g.clearRect(0, 0, width, height);
    }
  };

  get active() {
    return this.parts.length > 0;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.c.remove();
  }
}
