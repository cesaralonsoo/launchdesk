// 2D floor-plan fallback (no WebGL). Same rooms, same API, same overlay.
import {
  DEPT_INITIAL, HALF_X, HALF_Z, ROOM, ROOMS, ROOM_D, ROOM_W, SLAB_PAD, easeInOut, route, toWorld,
  type AgentState, type ChipTone, type DeptId, type PinSpec, type RoomDef, type Vec2,
} from "./layout";
import { Overlay, type Anchors, type P3, type Rect } from "./overlay";
import type { FocusOpts, Office } from "./types";

const U = 40; // px per world unit on the board
const BW = (HALF_X + SLAB_PAD) * 2 * U;
const BH = (HALF_Z + SLAB_PAD) * 2 * U;
const bx = (x: number) => (x + HALF_X + SLAB_PAD) * U;
const bz = (z: number) => (z + HALF_Z + SLAB_PAD) * U;

type Walker = {
  id: DeptId;
  el: HTMLDivElement;
  pos: Vec2;
  path: Vec2[];
  done: (() => void) | null;
  state: AgentState;
};

const FURNITURE: Record<DeptId, string> = {
  mia: `<i class="f desk" style="left:12%;top:6%;width:30%"></i><i class="f chair" style="left:22%;top:30%"></i>
        <i class="f board" style="left:52%;top:3%;width:34%"></i><i class="f table" style="left:62%;top:44%"></i>
        <i class="f plant" style="left:4%;top:8%"></i><i class="f plant" style="left:88%;top:80%"></i>`,
  leo: `<i class="f desk" style="left:12%;top:6%;width:30%"></i><i class="f chair" style="left:22%;top:30%"></i>
        <i class="f screen" style="left:52%;top:3%;width:36%"></i><i class="f globe" style="left:84%;top:48%"></i>
        <i class="f shelf" style="left:4%;top:44%;height:28%"></i><i class="f plant" style="left:6%;top:82%"></i>`,
  sam: `<i class="f desk" style="left:12%;top:6%;width:30%"></i><i class="f chair" style="left:22%;top:30%"></i>
        <i class="f bars" style="left:62%;top:46%"></i><i class="f cabinet" style="left:74%;top:6%"></i><i class="f cabinet" style="left:84%;top:6%"></i>
        <i class="f plant" style="left:4%;top:8%"></i><i class="f plant" style="left:88%;top:80%"></i>`,
  nova: `<i class="f desk" style="left:12%;top:6%;width:30%"></i><i class="f chair" style="left:22%;top:30%"></i>
        <i class="f mood" style="left:52%;top:3%;width:36%"></i><i class="f sofa pink" style="left:56%;top:62%"></i>
        <i class="f rug pink" style="left:58%;top:40%"></i><i class="f plant" style="left:6%;top:82%"></i>`,
  lobby: `<i class="f logo" style="left:2%;top:22%;height:50%"></i><i class="f counter" style="left:18%;top:28%;height:44%"></i>
        <i class="f rug teal" style="left:56%;top:46%"></i><i class="f sofa teal" style="left:58%;top:78%"></i>
        <i class="f plant" style="left:4%;top:84%"></i><i class="f plant" style="left:90%;top:6%"></i>`,
  dex: `<i class="f desk v" style="left:3%;top:36%;height:30%"></i><i class="f chair" style="left:16%;top:46%"></i>
        <i class="f drawing" style="left:60%;top:16%"></i><i class="f printer" style="left:84%;top:52%"></i>
        <i class="f plant" style="left:4%;top:84%"></i><i class="f plant" style="left:6%;top:8%"></i>`,
  rae: `<i class="f desk v" style="left:3%;top:36%;height:30%"></i><i class="f chair" style="left:16%;top:46%"></i>
        <i class="f ring" style="left:80%;top:12%"></i><i class="f tripod" style="left:62%;top:46%"></i>
        <i class="f sofa teal v" style="left:84%;top:46%"></i><i class="f plant" style="left:4%;top:84%"></i>`,
  pip: `<i class="f desk v" style="left:3%;top:36%;height:30%"></i><i class="f chair" style="left:16%;top:46%"></i>
        <i class="f rack" style="left:62%;top:8%"></i><i class="f rack" style="left:72%;top:8%"></i><i class="f rack" style="left:82%;top:8%"></i>
        <i class="f bean" style="left:58%;top:62%"></i><i class="f rocket" style="left:86%;top:78%"></i><i class="f plant" style="left:4%;top:84%"></i>`,
};

export class Office2D implements Office {
  readonly mode = "2d" as const;
  private root: HTMLDivElement;
  private board: HTMLDivElement;
  private overlay: Overlay;
  private walkers = new Map<DeptId, Walker>();
  private roomEls = new Map<DeptId, HTMLDivElement>();
  private k = 1;
  private tx = 0;
  private ty = 0;
  private fitK = 1;
  private anim: { k0: number; k1: number; x0: number; x1: number; y0: number; y1: number; t0: number; ms: number } | null = null;
  private view: { room: DeptId | "overview"; opts: FocusOpts } = { room: "overview", opts: {} };
  private w = 1;
  private h = 1;
  private raf = 0;
  private last = 0;
  private ro: ResizeObserver;
  private cbs: Array<(id: DeptId) => void> = [];
  private drag: { x: number; y: number; moved: boolean } | null = null;

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "lo-root lo-2d";
    const stage = document.createElement("div");
    stage.className = "lo-stage";
    this.board = document.createElement("div");
    this.board.className = "lo-board";
    this.board.style.width = `${BW}px`;
    this.board.style.height = `${BH}px`;
    stage.appendChild(this.board);
    this.root.appendChild(stage);
    host.appendChild(this.root);

    const cor = document.createElement("div");
    cor.className = "lo-corridor";
    Object.assign(cor.style, { left: `${bx(-HALF_X)}px`, top: `${bz(-0.8)}px`, width: `${HALF_X * 2 * U}px`, height: `${1.6 * U}px` });
    this.board.appendChild(cor);

    for (const r of ROOMS) this.board.appendChild(this.roomEl(r));
    for (const r of ROOMS) {
      const el = document.createElement("div");
      el.className = "lo-av";
      el.style.setProperty("--c", r.color);
      el.innerHTML = `<span>${DEPT_INITIAL[r.id]}</span>`;
      el.title = `${r.name} · ${r.role}`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this.clicked(r.id);
      });
      this.board.appendChild(el);
      const pos = toWorld(r, r.stand);
      this.walkers.set(r.id, { id: r.id, el, pos, path: [], done: null, state: "idle" });
    }
    this.overlay = new Overlay(this.root);
    this.overlay.onLabelClick = (id) => this.clicked(id);
    this.setState("pip", "sleeping");

    stage.addEventListener("pointerdown", (e) => (this.drag = { x: e.clientX, y: e.clientY, moved: false }));
    stage.addEventListener("pointermove", (e) => {
      if (!this.drag || !e.buttons) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (!this.drag.moved && Math.hypot(dx, dy) < 5) return;
      this.drag.moved = true;
      this.anim = null;
      this.tx += dx;
      this.ty += dy;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    });
    const end = () => (this.drag = null);
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.root);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private roomEl(r: RoomDef) {
    const el = document.createElement("div");
    el.className = `lo-room lo-room-${r.row} lo-room-${r.id}${r.col === 0 ? " lo-first" : ""}`;
    el.style.setProperty("--c", r.color);
    Object.assign(el.style, {
      left: `${bx(r.cx - ROOM_W / 2)}px`,
      top: `${bz(r.cz - ROOM_D / 2)}px`,
      width: `${ROOM_W * U}px`,
      height: `${ROOM_D * U}px`,
    });
    el.innerHTML = FURNITURE[r.id];
    this.roomEls.set(r.id, el);
    return el;
  }

  private clicked(id: DeptId) {
    this.overlay.bubble(id, ROOM[id].intro);
    for (const cb of this.cbs) cb(id);
  }

  private viewFor(room: DeptId | "overview", opts: FocusOpts) {
    const phone = this.w < 640;
    // Overlay safe areas: status pill on top; guide card + controls at the bottom.
    const safe = phone ? { top: 44, right: 8, bottom: 12, left: 8 } : { top: 56, right: 18, bottom: 110, left: 18 };
    const ins = { ...safe, ...(opts.inset ?? {}) };
    const area: Rect = opts.free ?? { x: ins.left, y: ins.top, w: this.w - ins.left - ins.right, h: this.h - ins.top - ins.bottom };
    const aw = Math.max(80, area.w);
    const ah = Math.max(80, area.h);
    let cx: number, cy: number, k: number;
    const fit = Math.min((this.w - safe.left - safe.right) / BW, (this.h - safe.top - safe.bottom) / BH);
    this.fitK = fit;
    if (room === "overview") {
      k = Math.min(aw / BW, ah / BH);
      cx = BW / 2;
      cy = BH / 2;
    } else {
      const rs = [room, ...(opts.with ?? [])].map((id) => ROOM[id]);
      const x0 = Math.min(...rs.map((r) => r.cx)) - ROOM_W / 2 - 0.6;
      const x1 = Math.max(...rs.map((r) => r.cx)) + ROOM_W / 2 + 0.6;
      const z0 = Math.min(...rs.map((r) => r.cz)) - ROOM_D / 2 - 0.6;
      const z1 = Math.max(...rs.map((r) => r.cz)) + ROOM_D / 2 + 0.6;
      k = Math.min(aw / ((x1 - x0) * U), ah / ((z1 - z0) * U), fit * (phone ? 1.12 : 1.7));
      cx = bx((x0 + x1) / 2);
      cy = bz((z0 + z1) / 2);
    }
    return { k, x: area.x + aw / 2 - cx * k, y: area.y + ah / 2 - cy * k };
  }

  private move(v: { k: number; x: number; y: number }, ms: number) {
    if (ms <= 0) {
      this.anim = null;
      this.k = v.k;
      this.tx = v.x;
      this.ty = v.y;
      return;
    }
    this.anim = { k0: this.k, k1: v.k, x0: this.tx, x1: v.x, y0: this.ty, y1: v.y, t0: performance.now(), ms };
  }

  private resize() {
    const r = this.root.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.root.classList.toggle("lo-sm", this.w < 640);
    this.root.classList.toggle("lo-xs", this.w < 440);
    this.viewFor("overview", {});
    this.move(this.viewFor(this.view.room, this.view.opts), 0);
  }

  private project = (p: P3) => ({
    x: this.tx + bx(p.x) * this.k,
    y: this.ty + (bz(p.z) - p.y * U * 0.55) * this.k,
  });

  private anchors: Anchors = {
    // Inside the room's top-left corner, so overlays at the edges never cover a label.
    label: (id) => ({ x: ROOM[id].cx - ROOM_W / 2 + 1.7, y: 0, z: ROOM[id].cz - ROOM_D / 2 + 0.75 }),
    pin: (id) => ({ x: ROOM[id].cx + 0.9, y: 1.4, z: ROOM[id].cz + 0.6 }),
    chip: (id) => {
      const p = this.walkers.get(id)!.pos;
      return { x: p.x, y: 1.2, z: p.z };
    },
    head: (id) => {
      const p = this.walkers.get(id)!.pos;
      return { x: p.x, y: 0.9, z: p.z };
    },
  };

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
    this.last = now;
    if (document.hidden) return;
    if (this.anim) {
      const a = this.anim;
      const t = Math.min(1, (now - a.t0) / a.ms);
      const e = easeInOut(t);
      this.k = a.k0 + (a.k1 - a.k0) * e;
      this.tx = a.x0 + (a.x1 - a.x0) * e;
      this.ty = a.y0 + (a.y1 - a.y0) * e;
      if (t >= 1) this.anim = null;
    }
    this.board.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.k})`;
    for (const w of this.walkers.values()) {
      if (w.path.length) {
        const n = w.path[0]!;
        const dx = n.x - w.pos.x;
        const dz = n.z - w.pos.z;
        const d = Math.hypot(dx, dz);
        const step = 3.4 * dt;
        if (d <= step) {
          w.pos = { ...n };
          w.path.shift();
          if (!w.path.length) {
            const cb = w.done;
            w.done = null;
            cb?.();
          }
        } else {
          w.pos = { x: w.pos.x + (dx / d) * step, z: w.pos.z + (dz / d) * step };
        }
      }
      w.el.classList.toggle("is-walking", w.path.length > 0);
      w.el.style.transform = `translate(${bx(w.pos.x)}px, ${bz(w.pos.z)}px)`;
    }
    this.overlay.update(this.project, this.anchors, (id) => this.walkers.get(id)!.state === "sleeping", this.w, this.h);
  };

  private goTo(w: Walker, pts: Vec2[], done: () => void) {
    if (w.done) {
      const p = w.done;
      w.done = null;
      p();
    }
    w.path = pts;
    w.done = done;
  }

  focus(room: DeptId | "overview", opts: FocusOpts = {}) {
    this.view = { room, opts };
    this.overlay.openLabel(room === "overview" ? null : room);
    this.roomEls.forEach((el, id) => el.classList.toggle("is-focus", id === room));
    this.move(this.viewFor(room, opts), opts.ms ?? 900);
  }
  zoom(delta: 1 | -1) {
    const k1 = Math.min(this.fitK * 6, Math.max(this.fitK * 0.6, this.k * (delta > 0 ? 1.3 : 1 / 1.3)));
    const cx = this.w / 2;
    const cy = this.h / 2;
    this.move({ k: k1, x: cx - ((cx - this.tx) / this.k) * k1, y: cy - ((cy - this.ty) / this.k) * k1 }, 320);
  }
  fit() {
    this.focus("overview");
  }
  flag(id: DeptId, on: boolean) {
    this.overlay.flag(id, on);
    this.roomEls.get(id)?.classList.toggle("is-error", on);
  }
  setOccluders(fn: () => Rect[]) {
    this.overlay.occluders = fn;
  }
  roomCenter(id: DeptId) {
    return this.project({ x: ROOM[id].cx, y: 0, z: ROOM[id].cz });
  }
  setState(id: DeptId, s: AgentState) {
    const w = this.walkers.get(id);
    if (!w) return;
    w.state = s;
    for (const st of ["idle", "working", "walking", "sleeping", "done"]) w.el.classList.toggle(`is-${st}`, st === s);
    this.roomEls.get(id)?.classList.toggle("is-working", s === "working");
    this.overlay.setAgentState(id, s);
    if (!w.path.length) {
      const r = ROOM[id];
      const spot = s === "working" ? r.seat : r.stand;
      const here = toWorld(r, spot);
      if (Math.hypot(here.x - w.pos.x, here.z - w.pos.z) > 0.05 && Math.abs(w.pos.x - r.cx) < ROOM_W / 2 && Math.abs(w.pos.z - r.cz) < ROOM_D / 2) {
        this.goTo(w, [here], () => {});
      }
    }
  }
  note(id: DeptId, text: string | null) {
    this.overlay.note(id, text);
  }
  walk(id: DeptId, to: DeptId): Promise<void> {
    const w = this.walkers.get(id);
    if (!w) return Promise.resolve();
    const t = ROOM[to];
    const dest = toWorld(t, to === id ? t.stand : t.visit);
    return new Promise((res) => this.goTo(w, route(w.pos, t, dest), res));
  }
  chip(room: DeptId, text: string, tone: ChipTone = "gold") {
    this.overlay.chip(room, text, tone);
  }
  pin(room: DeptId, p: PinSpec) {
    this.overlay.pin(room, p);
  }
  clearPins() {
    this.overlay.clearPins();
  }
  celebrate() {
    this.overlay.celebrate();
    for (const w of this.walkers.values()) {
      w.el.classList.remove("is-cheer");
      void w.el.offsetWidth;
      w.el.classList.add("is-cheer");
    }
  }
  say(id: DeptId, text?: string) {
    this.overlay.bubble(id, text ?? ROOM[id].intro);
  }
  onAgentClick(cb: (id: DeptId) => void) {
    this.cbs.push(cb);
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.overlay.dispose();
    this.root.remove();
  }
}

