import { DEPT_IDS, DEPT_INITIAL, ROOM, toneColor, type AgentState, type ChipTone, type DeptId, type PinSpec } from "./layout";

export type P3 = { x: number; y: number; z: number };
export type Rect = { x: number; y: number; w: number; h: number };
const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
/** Narrow offices (phones): only the newest pins at full size, the rest collapse to coloured dots. */
const COMPACT_W = 600;
const COMPACT_MAX = 2;
export type Projector = (p: P3) => { x: number; y: number };
export type Anchors = {
  label(id: DeptId): P3;
  pin(id: DeptId): P3;
  chip(id: DeptId): P3;
  head(id: DeptId): P3;
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Transient = { el: HTMLElement; id: DeptId; until: number; offset: number };

export class Overlay {
  readonly el: HTMLDivElement;
  private labels = new Map<DeptId, HTMLDivElement>();
  private labelState = new Map<DeptId, { state: AgentState; note: string | null; open: boolean; flag: boolean }>();
  private labelW = new Map<DeptId, number>();
  private pins = new Map<DeptId, { el: HTMLDivElement; w: number; h: number; dot: boolean; sz: { full?: [number, number]; dot?: [number, number] } }>();
  private chips: Transient[] = [];
  private bubbles: Transient[] = [];
  private zzz = new Map<DeptId, HTMLDivElement>();
  private alerts = new Map<DeptId, HTMLDivElement>();
  private pinOrder: DeptId[] = [];
  private revealed: DeptId | null = null;
  /** Screen rects covered by other UI (department panel, guide card, controls). */
  occluders: (() => Rect[]) | null = null;
  private confetti: Confetti;
  private compactWas: boolean | null = null;
  onLabelClick: ((id: DeptId) => void) | null = null;

  constructor(host: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "lo-overlay";
    host.appendChild(this.el);
    this.confetti = new Confetti(host);
    for (const id of DEPT_IDS) {
      const r = ROOM[id];
      const l = document.createElement("div");
      l.className = `lo-label lo-${r.row}`;
      l.style.setProperty("--c", r.color);
      l.addEventListener("click", () => {
        this.revealed = this.revealed === id ? null : id;
        this.onLabelClick?.(id);
      });
      this.el.appendChild(l);
      this.labels.set(id, l);
      this.labelState.set(id, { state: id === "pip" ? "sleeping" : "idle", note: null, open: false, flag: false });
      this.renderLabel(id);
    }
  }

  private renderLabel(id: DeptId) {
    const st = this.labelState.get(id)!;
    const r = ROOM[id];
    const l = this.labels.get(id)!;
    this.labelW.delete(id);
    const open = st.open || !!st.note;
    l.classList.toggle("is-open", open);
    l.classList.toggle("is-working", st.state === "working");
    l.classList.toggle("is-done", st.state === "done" && !st.flag);
    l.classList.toggle("is-error", st.flag);
    l.setAttribute("role", "button");
    l.setAttribute("aria-label", st.flag ? `${r.name}: needs a retry. Retry ${r.name}` : `${r.name} · ${r.role}`);
    const mark = st.flag ? `<i class="lo-bang">!</i>` : st.state === "done" ? `<i class="lo-check">✓</i>` : `<i class="lo-dot"></i>`;
    l.innerHTML = open
      ? `<div class="lo-l1">${mark}<b>${r.label}</b><span>${esc(r.role)}</span></div>${st.note ? `<div class="lo-l2">${esc(st.note)}</div>` : ""}`
      : `<div class="lo-l1">${mark}<b>${r.label}</b></div>`;
  }

  setAgentState(id: DeptId, s: AgentState) {
    const st = this.labelState.get(id)!;
    if (st.state === s) return;
    st.state = s;
    this.renderLabel(id);
  }
  note(id: DeptId, text: string | null) {
    this.labelState.get(id)!.note = text;
    this.renderLabel(id);
  }
  /** Red "needs retry" state for a department. */
  flag(id: DeptId, on: boolean) {
    const st = this.labelState.get(id)!;
    if (st.flag === on) return;
    st.flag = on;
    this.renderLabel(id);
    const a = this.alerts.get(id);
    if (on && !a) {
      const el = document.createElement("div");
      el.className = "lo-alert";
      el.innerHTML = "<span>!</span>";
      this.el.appendChild(el);
      this.alerts.set(id, el);
    } else if (!on && a) {
      a.remove();
      this.alerts.delete(id);
    }
  }
  openLabel(id: DeptId | null) {
    for (const d of DEPT_IDS) {
      const st = this.labelState.get(d)!;
      const want = d === id;
      if (st.open !== want) {
        st.open = want;
        this.renderLabel(d);
      }
    }
  }

  pin(id: DeptId, p: PinSpec) {
    this.pins.get(id)?.el.remove();
    const r = ROOM[id];
    const c = toneColor(p.tone, r.color);
    const el = document.createElement("div");
    el.className = "lo-pin";
    el.style.setProperty("--c", c);
    const icon = p.icon ?? (p.tone === "go" ? "GO" : DEPT_INITIAL[id]);
    // iconHtml is markup we generate ourselves (the brand logo SVG), never user text.
    const ic = p.iconHtml ? `<span class="lo-pin-ic lo-pin-logo">${p.iconHtml}</span>` : `<span class="lo-pin-ic">${esc(icon)}</span>`;
    el.innerHTML = `<div class="lo-pin-in">${ic}<span class="lo-pin-tx"><small>${esc(p.kicker)}</small><b>${esc(p.value)}</b></span></div>`;
    el.setAttribute("title", `${p.kicker}: ${p.value}`);
    // A collapsed dot expands to the full pin when tapped.
    el.addEventListener("click", () => {
      this.revealed = this.revealed === id ? null : id;
    });
    this.el.appendChild(el);
    this.pins.set(id, { el, w: 0, h: 0, dot: false, sz: {} });
    this.pinOrder = this.pinOrder.filter((x) => x !== id).concat(id);
  }
  clearPins() {
    this.pins.forEach((p) => p.el.remove());
    this.pins.clear();
    this.pinOrder = [];
    this.revealed = null;
  }

  chip(id: DeptId, text: string, tone: ChipTone = "gold") {
    const el = document.createElement("div");
    el.className = `lo-chip lo-chip-${tone}`;
    if (tone === "dept") el.style.setProperty("--c", ROOM[id].color);
    el.innerHTML = `<span>${esc(text)}</span>`;
    this.el.appendChild(el);
    const offset = this.chips.filter((c) => c.id === id).length * 30;
    this.chips.push({ el, id, until: performance.now() + 2700, offset });
  }

  bubble(id: DeptId, text: string) {
    for (const b of this.bubbles.filter((b) => b.id === id)) b.until = 0;
    const el = document.createElement("div");
    el.className = "lo-bubble";
    el.style.setProperty("--c", ROOM[id].color);
    el.innerHTML = `<div class="lo-bubble-in"><b>${ROOM[id].name}</b> ${esc(text)}</div>`;
    this.el.appendChild(el);
    this.bubbles.push({ el, id, until: performance.now() + 4200, offset: 0 });
  }

  celebrate() {
    this.confetti.burst();
  }
  /** Something on the overlay is animating (chips rising, speech bubbles, confetti). */
  get busy() {
    return this.chips.length > 0 || this.bubbles.length > 0 || this.confetti.active;
  }

  update(project: Projector, a: Anchors, sleeping: (id: DeptId) => boolean, width: number, height: number) {
    const now = performance.now();
    const place = (el: HTMLElement, p: { x: number; y: number }, dy = 0) => {
      el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y + dy)}px, 0)`;
    };
    const occ = this.occluders?.() ?? [];
    const covered = (r: Rect) => occ.some((o) => hits(r, o));
    const compact = width < COMPACT_W;
    this.el.classList.toggle("lo-compact", compact);
    for (const id of DEPT_IDS) {
      const lab = this.labels.get(id)!;
      const ls = project(a.label(id));
      place(lab, ls);
      // Hide a label that would be cut by the office edge (a half label like "BY" looks broken).
      const half = (this.labelW.get(id) ?? 60) / 2;
      lab.classList.toggle("is-off", ls.x - half < 2 || ls.x + half > width - 2 || ls.y < 28 || ls.y > height + 4);
      // Fade labels that would sit under the department panel, the guide card or the controls.
      const st = this.labelState.get(id)!;
      const lh = st.open || st.note ? 46 : 26;
      lab.classList.toggle("is-hidden", covered({ x: ls.x - half, y: ls.y - 13, w: half * 2, h: lh }));
      const al = this.alerts.get(id);
      if (al) place(al, project(a.head(id)));
      // zzz
      const z = this.zzz.get(id);
      if (sleeping(id)) {
        let el = z;
        if (!el) {
          el = document.createElement("div");
          el.className = "lo-zzz";
          el.innerHTML = "<i>z</i><i>z</i><i>Z</i>";
          this.el.appendChild(el);
          this.zzz.set(id, el);
        }
        place(el, project(a.head(id)));
      } else if (z) {
        z.remove();
        this.zzz.delete(id);
      }
    }

    this.layoutPins(project, a, occ, compact, width, height);

    this.chips = this.chips.filter((c) => {
      if (now > c.until) {
        c.el.remove();
        return false;
      }
      place(c.el, project(a.chip(c.id)), -c.offset);
      return true;
    });
    this.bubbles = this.bubbles.filter((b) => {
      if (now > b.until) {
        b.el.classList.add("is-out");
        if (now > b.until + 250) {
          b.el.remove();
          return false;
        }
      }
      const p = project(a.head(b.id));
      place(b.el, { x: Math.min(Math.max(p.x, 120), width - 120), y: Math.max(p.y, 70) });
      return true;
    });
  }

  /**
   * Result pins: projected over their room, then a 2D pass keeps them readable. Newest first: each pin
   * tries a few nearby spots that clear the room labels, the pins already placed and the UI on top of
   * the office (status chip, guide card, department panel). A pin with no free spot collapses to a dot;
   * a pin under the panel is hidden.
   */
  private layoutPins(project: Projector, a: Anchors, occ: Rect[], compact: boolean, width: number, height: number) {
    if (!this.pins.size) return;
    if (this.compactWas !== compact) {
      this.compactWas = compact;
      this.pins.forEach((p) => (p.sz = {})); // sizes change with the compact style
    }
    const labelBoxes: Rect[] = [];
    for (const id of DEPT_IDS) {
      const l = this.labels.get(id)!;
      if (l.classList.contains("is-off") || l.classList.contains("is-hidden")) continue;
      const s = project(a.label(id));
      let lw = this.labelW.get(id) ?? 0;
      if (!lw) {
        lw = (l.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
        this.labelW.set(id, lw);
      }
      const st = this.labelState.get(id)!;
      labelBoxes.push({ x: s.x - lw / 2 - 3, y: s.y - 13, w: lw + 6, h: st.note ? 46 : 26 });
    }
    const full = compact ? new Set(this.pinOrder.slice(-COMPACT_MAX)) : null;
    if (full && this.revealed && this.pins.has(this.revealed)) full.add(this.revealed);
    const placed: Rect[] = [];
    const free = (r: Rect, extra: Rect[]) =>
      r.x >= 4 && r.x + r.w <= width - 4 && r.y >= 4 && r.y + r.h <= height - 4 && !extra.some((o) => hits(r, o)) && !placed.some((o) => hits(r, o));
    // newest pin first: it gets the best spot
    for (const id of [...this.pinOrder].reverse()) {
      const p = this.pins.get(id);
      if (!p) continue;
      const anchor = project(a.pin(id));
      const off = anchor.x < -20 || anchor.x > width + 20 || anchor.y < -20 || anchor.y > height + 60;
      p.el.classList.toggle("is-off", off);
      if (off) continue;
      const setMode = (dot: boolean) => {
        let sz = dot ? p.sz.dot : p.sz.full;
        if (!sz) {
          // measured once per mode (and again when the compact style changes)
          p.el.classList.toggle("is-dot", dot);
          sz = [p.el.offsetWidth || (dot ? 26 : 120), (p.el.offsetHeight || (dot ? 26 : 44)) + 10];
          if (dot) p.sz.dot = sz;
          else p.sz.full = sz;
        }
        p.dot = dot;
        [p.w, p.h] = sz;
      };
      const tryPlace = (dot: boolean) => {
        setMode(dot);
        const step = p.h + 6;
        const tries: Array<[number, number]> = [[0, 0], [0, -step], [0, step], [p.w * 0.6, 0], [-p.w * 0.6, 0], [0, -step * 2], [p.w * 0.6, -step], [-p.w * 0.6, -step]];
        for (const [dx, dy] of tries) {
          const x = Math.min(Math.max(anchor.x + dx, p.w / 2 + 6), width - p.w / 2 - 6);
          const y = anchor.y + dy;
          const box = { x: x - p.w / 2, y: y - p.h, w: p.w, h: p.h };
          if (free(box, [...labelBoxes, ...occ])) return { x, y, box };
        }
        return null;
      };
      let spot = !full || full.has(id) ? tryPlace(false) : null;
      if (!spot) spot = tryPlace(true);
      p.el.classList.toggle("is-dot", p.dot);
      if (!spot) {
        // No clean spot: a dot at the anchor, unless it would sit under the panel or another overlay.
        const x = Math.min(Math.max(anchor.x, 16), width - 16);
        const box = { x: x - p.w / 2, y: anchor.y - p.h, w: p.w, h: p.h };
        const covered = occ.some((o) => hits(box, o));
        p.el.classList.toggle("is-hidden", covered);
        if (!covered) placed.push(box);
        p.el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(anchor.y)}px, 0)`;
        continue;
      }
      p.el.classList.remove("is-hidden");
      placed.push(spot.box);
      p.el.style.transform = `translate3d(${Math.round(spot.x)}px, ${Math.round(spot.y)}px, 0)`;
    }
  }

  dispose() {
    this.confetti.dispose();
    this.el.remove();
  }
}

class Confetti {
  private c: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private parts: Array<{ x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; life: number }> = [];
  private raf = 0;
  private last = 0;

  constructor(host: HTMLElement) {
    this.c = document.createElement("canvas");
    this.c.className = "lo-confetti";
    host.appendChild(this.c);
    this.g = this.c.getContext("2d")!;
  }

  burst() {
    const rect = this.c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.c.width = Math.max(1, rect.width * dpr);
    this.c.height = Math.max(1, rect.height * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = ["#8B7CF6", "#3B82F6", "#F59E0B", "#EC4899", "#F97362", "#14B8A6", "#0AC18E", "#F5C542", "#FFFFFF"];
    const n = Math.round(Math.min(260, rect.width * 0.26));
    for (let i = 0; i < n; i++) {
      const rain = i % 3 !== 0;
      const fromLeft = i % 2 === 0;
      this.parts.push(rain
        ? {
            x: Math.random() * rect.width, y: -20 - Math.random() * rect.height * 0.5,
            vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 120,
            r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 10,
            w: 5 + Math.random() * 4, h: 8 + Math.random() * 7, c: cols[i % cols.length]!, life: 4.5 + Math.random() * 1.5,
          }
        : {
            x: fromLeft ? -10 : rect.width + 10, y: rect.height * (0.55 + Math.random() * 0.2),
            vx: (fromLeft ? 1 : -1) * (260 + Math.random() * 380), vy: -(380 + Math.random() * 420),
            r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12,
            w: 5 + Math.random() * 4, h: 8 + Math.random() * 7, c: cols[i % cols.length]!, life: 3.8 + Math.random() * 1.2,
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
      p.vy += 520 * dt;
      p.vx *= 1 - dt * 1.2;
      p.vy = Math.min(p.vy, 160 + Math.sin(p.r * 3) * 40);
      p.x += p.vx * dt + Math.sin(now / 300 + p.w) * 0.6;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      if (p.life <= 0 || p.y > height + 20) return false;
      this.g.save();
      this.g.globalAlpha = Math.min(1, p.life);
      this.g.translate(p.x, p.y);
      this.g.rotate(p.r);
      this.g.scale(1, Math.cos(p.r * 2.3));
      this.g.fillStyle = p.c;
      this.g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
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
