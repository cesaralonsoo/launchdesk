import * as THREE from "three";
import { Agent } from "./agents";
import { disposeMaterials, furnishRoom, type Furnished } from "./furniture";
import {
  DEPT_IDS, HALF_X, HALF_Z, ROOM, ROOMS, ROOM_D, ROOM_W, SLAB_PAD, easeInOut,
  type AgentState, type ChipTone, type DeptId, type PinSpec,
} from "./layout";
import { Overlay, type Anchors, type P3, type Rect } from "./overlay";
import { WALL_H, buildBuilding } from "./rooms";
import { disposeTextures } from "./textures";
import type { FocusOpts, Office } from "./types";

const AZIMUTH = THREE.MathUtils.degToRad(34);
const AZIMUTH_PORTRAIT = THREE.MathUtils.degToRad(61);
const ELEVATION = THREE.MathUtils.degToRad(42);
const VIEW_H = 10; // world units visible vertically at zoom 1

const pad = (r: Rect, p: number): Rect => ({ x: r.x + p, y: r.y + p, w: Math.max(40, r.w - p * 2), h: Math.max(40, r.h - p * 2) });

type CamAnim = { from: THREE.Vector3; to: THREE.Vector3; z0: number; z1: number; t0: number; ms: number };

export class Office3D implements Office {
  readonly mode = "3d" as const;
  private host: HTMLElement;
  private root: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private dir: THREE.Vector3;
  private target = new THREE.Vector3();
  private anim: CamAnim | null = null;
  private view: { room: DeptId | "overview"; opts: FocusOpts } = { room: "overview", opts: {} };
  private fitZoom = 1;
  private agents = new Map<DeptId, Agent>();
  private furnished = new Map<DeptId, Furnished>();
  private glows = new Map<string, THREE.Material[]>();
  private overlay: Overlay;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private raf = 0;
  private last = 0;
  private visible = true;
  private w = 1;
  private h = 1;
  private clickCbs: Array<(id: DeptId) => void> = [];
  private raycaster = new THREE.Raycaster();
  private hits: THREE.Object3D[] = [];
  private hover: DeptId | null = null;
  private drag: { x: number; y: number; moved: boolean; id: number } | null = null;
  private disposed = false;
  private tmp = new THREE.Vector3();
  private lost = false;
  private lostTimer = 0;
  /** Called when the GL context is gone for good; the caller can mount the 2D plan instead. */
  onLost: (() => void) | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
    this.root = document.createElement("div");
    this.root.className = "lo-root lo-3d";
    host.appendChild(this.root);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Shadows are re-rendered only when something moves (see tick), not every frame.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = "lo-canvas";
    this.root.appendChild(this.renderer.domElement);
    // Phones drop the GL context of background tabs: pause, then resume when it comes back
    // (three.js re-uploads geometry and textures on restore). If it never returns, onLost lets the app swap in 2D.
    this.renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
      this.stop();
      this.lostTimer = window.setTimeout(() => this.lost && this.onLost?.(), 4000);
    });
    this.renderer.domElement.addEventListener("webglcontextrestored", () => {
      this.lost = false;
      clearTimeout(this.lostTimer);
      this.resize();
      this.start();
    });

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.dir = new THREE.Vector3();
    this.setAzimuth(AZIMUTH);

    this.buildScene();
    this.overlay = new Overlay(this.root);
    this.overlay.onLabelClick = (id) => this.handleAgentClick(id);

    this.bindInput();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.root);
    this.io = new IntersectionObserver((e) => {
      this.visible = e.some((x) => x.isIntersecting);
    });
    this.io.observe(this.root);
    document.addEventListener("visibilitychange", this.onVis);
    this.resize();
    this.applyView(0);
    this.start();
  }

  // ---------- scene ----------

  private buildScene() {
    const s = this.scene;
    const hemi = new THREE.HemisphereLight("#FFFFFF", "#9AA6BA", 1.32);
    s.add(hemi);
    s.add(new THREE.AmbientLight("#DCE6F5", 0.35));
    const sun = new THREE.DirectionalLight("#FFF5E8", 2.05);
    sun.position.set(9, 18, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -17;
    sc.right = 17;
    sc.top = 13;
    sc.bottom = -13;
    sc.near = 1;
    sc.far = 60;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 4;
    s.add(sun);
    s.add(sun.target);
    const fill = new THREE.DirectionalLight("#C9D8FF", 0.45);
    fill.position.set(-10, 8, -6);
    s.add(fill);

    const b = buildBuilding();
    s.add(b.root);
    this.glows = b.glows;

    for (const r of ROOMS) {
      const f = furnishRoom(r, WALL_H);
      f.group.position.set(r.cx, 0, r.cz);
      s.add(f.group);
      this.furnished.set(r.id, f);
      const a = new Agent(r, f.beanBag);
      s.add(a.root);
      this.agents.set(r.id, a);
      this.hits.push(a.hit);
    }
    this.agents.get("pip")!.setState("sleeping");
    this.overlay?.setAgentState("pip", "sleeping");
  }

  // ---------- camera ----------

  private setAzimuth(a: number) {
    this.dir.set(Math.cos(ELEVATION) * Math.sin(a), Math.sin(ELEVATION), Math.cos(ELEVATION) * Math.cos(a));
  }

  private basis() {
    const fwd = this.dir.clone().negate();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    return { right, up };
  }

  /** Target + zoom that frame an axis-aligned box in the visible area. */
  private frame(min: THREE.Vector3, max: THREE.Vector3, margin: number, opts: FocusOpts & { maxZoom?: number }) {
    const { right, up } = this.basis();
    const c = min.clone().add(max).multiplyScalar(0.5);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).sub(c);
      const dx = p.dot(right);
      const dy = p.dot(up);
      x0 = Math.min(x0, dx); x1 = Math.max(x1, dx);
      y0 = Math.min(y0, dy); y1 = Math.max(y1, dy);
    }
    const ins = { top: 0, right: 0, bottom: 0, left: 0, ...(opts.inset ?? {}) };
    const area: Rect = opts.free ?? { x: ins.left, y: ins.top, w: this.w - ins.left - ins.right, h: this.h - ins.top - ins.bottom };
    const aw = Math.max(80, area.w);
    const ah = Math.max(80, area.h);
    // pixels per world unit = h * zoom / VIEW_H
    const zx = (VIEW_H * aw) / this.h / (x1 - x0);
    const zy = (VIEW_H * ah) / this.h / (y1 - y0);
    let zoom = Math.min(zx, zy) * margin;
    if (opts.maxZoom) zoom = Math.min(zoom, opts.maxZoom);
    const ppu = (this.h * zoom) / VIEW_H;
    // Put the box centre in the middle of the free area.
    const fx = area.x + area.w / 2 - this.w / 2;
    const fy = area.y + area.h / 2 - this.h / 2;
    const target = c
      .clone()
      .add(right.clone().multiplyScalar((x0 + x1) / 2 - fx / ppu))
      .add(up.clone().multiplyScalar((y0 + y1) / 2 + fy / ppu));
    return { target, zoom };
  }

  /** Overlay safe areas: status pill on top, guide card and controls at the bottom. */
  private safe(): FocusOpts["inset"] {
    return this.w < 640 ? { top: 40, bottom: 10, left: 6, right: 6 } : { top: 58, bottom: 84, left: 16, right: 16 };
  }

  private viewFor(room: DeptId | "overview", opts: FocusOpts) {
    if (room === "overview") {
      const min = new THREE.Vector3(-HALF_X - SLAB_PAD, -0.55, -HALF_Z - SLAB_PAD);
      const max = new THREE.Vector3(HALF_X + SLAB_PAD, WALL_H, HALF_Z + SLAB_PAD);
      const f = this.frame(min, max, 0.97, { ...opts, inset: opts.free ? opts.inset : { ...this.safe(), ...(opts.inset ?? {}) } });
      // The fit zoom ignores any panel: it is the reference for zoom limits.
      this.fitZoom = opts.free || opts.inset ? this.frame(min, max, 0.97, { inset: this.safe() }).zoom : f.zoom;
      return f;
    }
    const rooms = [room, ...(opts.with ?? [])].map((id) => ROOM[id]);
    const min = new THREE.Vector3(Math.min(...rooms.map((r) => r.cx)) - ROOM_W / 2 - 0.4, 0, Math.min(...rooms.map((r) => r.cz)) - ROOM_D / 2 - 0.3);
    const max = new THREE.Vector3(Math.max(...rooms.map((r) => r.cx)) + ROOM_W / 2 + 0.4, WALL_H + 0.5, Math.max(...rooms.map((r) => r.cz)) + ROOM_D / 2 + 0.3);
    const phone = this.w < 640;
    // Zoom into the working room (~2x on desktop, ~2.5x on phones) but always keep the whole room in frame:
    // frame() fits the room's box inside the free area, and the cap keeps a hint of the neighbours.
    const free = opts.free ? pad(opts.free, 8) : undefined;
    const inset = free ? undefined : { ...this.safe(), ...(opts.inset ?? {}) };
    return this.frame(min, max, 0.96, { ...opts, free, inset, maxZoom: this.fitZoom * (opts.with?.length ? 1.6 : phone ? 2.6 : 2.2) });
  }

  private applyView(ms: number) {
    this.viewFor("overview", {}); // keep fitZoom fresh
    const v = this.viewFor(this.view.room, this.view.opts);
    this.moveCamera(v.target, v.zoom, ms);
  }

  private moveCamera(target: THREE.Vector3, zoom: number, ms: number) {
    if (ms <= 0) {
      this.anim = null;
      this.target.copy(target);
      this.camera.zoom = zoom;
      this.syncCamera();
      return;
    }
    this.anim = { from: this.target.clone(), to: target.clone(), z0: this.camera.zoom, z1: zoom, t0: performance.now(), ms };
  }

  private syncCamera() {
    this.camera.position.copy(this.target).addScaledVector(this.dir, 60);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }

  private resize() {
    const r = this.root.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.renderer.setSize(this.w, this.h, false);
    const aspect = this.w / this.h;
    // portrait containers (phones): turn the building so it runs top-left → bottom-right steeply
    this.setAzimuth(aspect < 0.95 ? AZIMUTH_PORTRAIT : AZIMUTH);
    this.camera.left = (-VIEW_H * aspect) / 2;
    this.camera.right = (VIEW_H * aspect) / 2;
    this.camera.top = VIEW_H / 2;
    this.camera.bottom = -VIEW_H / 2;
    this.root.classList.toggle("lo-sm", this.w < 640);
    this.root.classList.toggle("lo-xs", this.w < 440);
    this.applyView(0);
    this.renderer.shadowMap.needsUpdate = true;
    this.renderOnce();
  }

  // ---------- input ----------

  private bindInput() {
    const el = this.renderer.domElement;
    for (const ev of ["pointermove", "pointerdown", "wheel"] as const) el.addEventListener(ev, () => (this.inputAt = performance.now()), { passive: true });
    el.addEventListener("pointerdown", (e) => {
      this.drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    });
    el.addEventListener("pointermove", (e) => {
      if (this.drag && e.buttons) {
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        if (!this.drag.moved && Math.hypot(dx, dy) > 5) {
          this.drag.moved = true;
          el.setPointerCapture(this.drag.id);
          this.root.classList.add("is-dragging");
        }
        if (this.drag.moved) {
          this.pan(dx, dy);
          this.drag.x = e.clientX;
          this.drag.y = e.clientY;
        }
        return;
      }
      const id = this.pick(e);
      if (id !== this.hover) {
        this.hover = id;
        el.style.cursor = id ? "pointer" : "grab";
      }
    });
    const end = (e: PointerEvent) => {
      if (!this.drag) return;
      const wasDrag = this.drag.moved;
      this.drag = null;
      this.root.classList.remove("is-dragging");
      if (wasDrag) return;
      const id = this.pick(e);
      if (id) this.handleAgentClick(id);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", () => {
      this.drag = null;
      this.root.classList.remove("is-dragging");
    });
    el.addEventListener("pointerleave", () => {
      this.hover = null;
    });
    el.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const k = Math.exp(-e.deltaY * 0.01);
        this.anim = null;
        this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * k, this.fitZoom * 0.6, this.fitZoom * 6);
        this.syncCamera();
      },
      { passive: false },
    );
  }

  private pan(dx: number, dy: number) {
    this.anim = null;
    const { right, up } = this.basis();
    const ppu = (this.h * this.camera.zoom) / VIEW_H;
    this.target.addScaledVector(right, -dx / ppu).addScaledVector(up, dy / ppu);
    this.syncCamera();
  }

  private pick(e: PointerEvent | MouseEvent): DeptId | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.hits, false)[0];
    return hit ? (hit.object.userData.agent as DeptId) : null;
  }

  private handleAgentClick(id: DeptId) {
    this.overlay.bubble(id, ROOM[id].intro);
    for (const cb of this.clickCbs) cb(id);
  }

  // ---------- loop ----------

  private onVis = () => {
    if (document.hidden) this.stop();
    else this.start();
  };

  private start() {
    if (this.raf || this.disposed || this.lost) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }
  private stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Last pointer / wheel input: the office renders at full rate for a moment after it. */
  private inputAt = 0;
  private lastShadow = 0;
  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    if (!this.visible) {
      this.last = now;
      return;
    }
    let walking = false;
    let working = false;
    for (const a of this.agents.values()) {
      if (a.isWalking) walking = true;
      if (a.state === "working") working = true;
    }
    const busy = !!this.anim || walking || working || this.overlay.busy || now - this.inputAt < 500 || this.drag != null;
    // Idle office (home screen, finished run): ~12 fps is plenty for the gentle bobbing and saves battery.
    if (!busy && now - this.last < 1000 / 12) return;
    const raw = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(0.1, raw);
    this.last = now;
    if (busy) this.adapt(raw);
    this.step(dt, now / 1000);
    if (walking || now - this.lastShadow > 400) {
      this.renderer.shadowMap.needsUpdate = true;
      this.lastShadow = now;
    }
    this.renderOnce();
  };

  /** Lower the pixel ratio on slow devices (keeps the office smooth on weak GPUs). */
  private frameAcc = 0;
  private frameN = 0;
  private adapt(raw: number) {
    if (raw <= 0 || raw > 0.5) return;
    this.frameAcc += raw;
    this.frameN++;
    if (this.frameN < 90) return;
    const avg = this.frameAcc / this.frameN;
    this.frameAcc = 0;
    this.frameN = 0;
    const pr = this.renderer.getPixelRatio();
    if (avg > 0.045 && pr > 1) {
      this.renderer.setPixelRatio(Math.max(1, pr - 0.5));
      this.renderer.setSize(this.w, this.h, false);
    }
  }

  private step(dt: number, t: number) {
    if (this.anim) {
      const a = this.anim;
      const k = Math.min(1, (performance.now() - a.t0) / a.ms);
      const e = easeInOut(k);
      this.target.lerpVectors(a.from, a.to, e);
      this.camera.zoom = a.z0 + (a.z1 - a.z0) * e;
      this.syncCamera();
      if (k >= 1) this.anim = null;
    }
    for (const a of this.agents.values()) a.update(dt, t);
    // room life: screens flicker and glows pulse while the department works
    for (const [id, f] of this.furnished) {
      const working = this.agents.get(id)?.state === "working";
      for (const s of f.screens) {
        const m = s.material as THREE.MeshBasicMaterial;
        const v = working ? 0.85 + Math.sin(t * 9 + s.id) * 0.15 : 0.82;
        m.color.setScalar(v);
      }
      for (const sp of f.spinners) sp.rotation.y += dt * (working ? 2.2 : 0.4);
      const gl = this.glows.get(id);
      if (gl) {
        const focused = this.view.room === id;
        const base = working ? 0.45 + Math.sin(t * 4) * 0.15 : focused ? 0.4 : 0.24;
        for (const m of gl) (m as THREE.MeshBasicMaterial).opacity += (base - (m as THREE.MeshBasicMaterial).opacity) * Math.min(1, dt * 6);
      }
    }
  }

  private project = (p: P3) => {
    this.tmp.set(p.x, p.y, p.z).project(this.camera);
    return { x: (this.tmp.x * 0.5 + 0.5) * this.w, y: (-this.tmp.y * 0.5 + 0.5) * this.h };
  };

  private anchors: Anchors = {
    label: (id) => {
      const r = ROOM[id];
      // Name labels sit at the room's front corner; result pins float above the room. They never stack.
      return r.row === "back"
        ? { x: r.cx - ROOM_W / 2 + 1.25, y: 0.05, z: r.cz + ROOM_D / 2 + 0.35 }
        : { x: r.cx - 0.2, y: -0.4, z: r.cz + ROOM_D / 2 + 0.75 };
    },
    pin: (id) => {
      const r = ROOM[id];
      return r.row === "back" ? { x: r.cx + 1.6, y: 1.3, z: r.cz + 1.0 } : { x: r.cx + 1.4, y: 1.3, z: r.cz + 0.4 };
    },
    chip: (id) => {
      const a = this.agents.get(id)!;
      const h = a.headWorld(new THREE.Vector3());
      return { x: h.x, y: h.y + 0.55, z: h.z };
    },
    head: (id) => {
      const h = this.agents.get(id)!.headWorld(new THREE.Vector3());
      return { x: h.x, y: h.y + 0.42, z: h.z };
    },
  };

  private renderOnce() {
    if (this.lost) return;
    this.renderer.render(this.scene, this.camera);
    this.overlay.update(this.project, this.anchors, (id) => this.agents.get(id)!.state === "sleeping" && !this.agents.get(id)!.isWalking, this.w, this.h);
  }

  // ---------- public API ----------

  focus(room: DeptId | "overview", opts: FocusOpts = {}) {
    this.view = { room, opts };
    this.overlay.openLabel(room === "overview" ? null : room);
    this.viewFor("overview", {});
    const v = this.viewFor(room, opts);
    this.moveCamera(v.target, v.zoom, opts.ms ?? 750);
  }
  zoom(delta: 1 | -1) {
    const z = THREE.MathUtils.clamp(this.camera.zoom * (delta > 0 ? 1.3 : 1 / 1.3), this.fitZoom * 0.6, this.fitZoom * 6);
    this.moveCamera(this.target.clone(), z, 320);
  }
  fit() {
    this.focus("overview");
  }
  flag(id: DeptId, on: boolean) {
    this.overlay.flag(id, on);
  }
  setOccluders(fn: () => Rect[]) {
    this.overlay.occluders = fn;
  }
  roomCenter(id: DeptId) {
    const r = ROOM[id];
    return this.project({ x: r.cx, y: WALL_H / 2, z: r.cz });
  }
  setState(id: DeptId, s: AgentState) {
    this.inputAt = performance.now() + 1200; // full frame rate while the agent reacts (hop, sit down)
    this.agents.get(id)?.setState(s);
    this.overlay.setAgentState(id, s);
  }
  note(id: DeptId, text: string | null) {
    this.overlay.note(id, text);
  }
  walk(id: DeptId, to: DeptId): Promise<void> {
    const a = this.agents.get(id);
    return a ? a.walkTo(to) : Promise.resolve();
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
    this.inputAt = performance.now() + 2500;
    this.overlay.celebrate();
    for (const id of DEPT_IDS) this.agents.get(id)!.cheer();
  }
  say(id: DeptId, text?: string) {
    this.overlay.bubble(id, text ?? ROOM[id].intro);
  }
  onAgentClick(cb: (id: DeptId) => void) {
    this.clickCbs.push(cb);
  }
  dispose() {
    this.disposed = true;
    this.stop();
    this.ro.disconnect();
    this.io.disconnect();
    document.removeEventListener("visibilitychange", this.onVis);
    this.overlay.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        const mm = m.material;
        (Array.isArray(mm) ? mm : [mm]).forEach((x) => x?.dispose());
      }
    });
    clearTimeout(this.lostTimer);
    disposeMaterials();
    disposeTextures();
    this.renderer.dispose();
    this.root.remove();
    void this.host;
  }
}
