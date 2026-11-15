// WS-B · World composition: renderer, lights, sky, fog, diorama base, camera rig, insets framing,
// level 2 (tower) and level 3 (district) with one continuous pull-back, atmosphere tweens, celebrations.
// Contract: World in ../contracts.ts. Extras (additive, typed below): setDistrictBuilt, debugPose, camera.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  READY_ATTR, ROOM_META, type AtmospherePreset, type CreateWorld, type Dept, type DeptState, type FocusTarget, type Insets, type Level, type Room, type World, type WorldOptions,
} from "../contracts";
import { Drift, FOV, applyShot, cloneShot, easeInOut, easeLevel, easeOutward, fitShot, levelAngles, lerpShot, roomAngles, type Shot } from "./camera";
import { createBase, createDistrict, type District } from "./levels/district";
import { Y0, clamp01, disposeFacades, win } from "./levels/kit";
import { lerpPalette, paletteFor, type Palette } from "./levels/palette";
import { createTower, type Tower } from "./levels/tower";
import { createOfficeModel } from "./office";

/** Additive extras on top of the frozen World contract (see CONTRACTS.md, "Changes by ws-b-levels"). */
export interface WorldExtras {
  /** District buildings: 0 = planned (white clay model, unlit) · 1 = built (materials, lit windows). Animated by default. */
  setDistrictBuilt(k: number, opts?: { animate?: boolean }): Promise<void>;
  /** Screenshot helper: pose the level transition `from → to` at progress k (0..1), camera + growth, no animation. */
  debugPose(from: Level, to: Level, k: number): void;
  readonly camera: THREE.PerspectiveCamera;
  /** The level the viewer actually sees right now (growth past half-way), for HUD labels that must not run ahead. */
  renderedLevel(): Level;
  /** Screen point (CSS px) under the office floor of the tower, for the "Your office · Floor 1" tag; null at level 1. */
  officeScreenPoint(): { x: number; y: number } | null;
  /** Debug handles for scripts (not for product code). */
  readonly debug: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; key: THREE.DirectionalLight; state(): unknown };
}

/** city = planned massing rising, solid = its clay goes from ghost to solid (both 0 at level 2, 1 at level 3). */
type Growth = { tower: number; ground: number; city: number; solid: number };
const GROWTH: Record<Level, Growth> = {
  1: { tower: 0, ground: 0, city: 0, solid: 0 },
  2: { tower: 1, ground: 1, city: 0, solid: 0 },
  3: { tower: 1, ground: 1, city: 1, solid: 1 },
};

export const createWorld: CreateWorld = (host, opts) => createWorldX(host, opts);

export function createWorldX(host: HTMLElement, opts: WorldOptions): World & WorldExtras {
  const q = new URLSearchParams(location.search);
  const high = opts.quality === "high";
  const reduced = !!opts.reducedMotion;

  // ── renderer: transparent canvas over a CSS sky gradient on the host
  const renderer = new THREE.WebGLRenderer({ antialias: high, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(high ? 2 : 1, devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = high;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "world-canvas";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 3000);
  const hemi = new THREE.HemisphereLight();
  const key = new THREE.DirectionalLight();
  const fill = new THREE.DirectionalLight("#ffffff", 0.25);
  key.castShadow = high;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  scene.add(hemi, key, key.target, fill, fill.target);

  const base = createBase({ quality: opts.quality });
  scene.add(base.root);
  const office = createOfficeModel({ quality: opts.quality });
  scene.add(office.root);

  // lazily built levels
  let tower: Tower | null = null;
  let district: District | null = null;
  const growth: Growth = { ...GROWTH[1] };
  function ensureLevels() {
    if (tower && district) return;
    tower = createTower({ quality: opts.quality, env });
    district = createDistrict({ quality: opts.quality, env });
    scene.add(tower.root, district.ground, district.city);
    tower.applyPalette(pal);
    district.applyPalette(pal);
    district.setBuilt(builtK);
    tower.setBeacon(beacon, false);
    paintGrowth();
  }
  const officeShadow = office.root.getObjectByName("office-ground-shadow");
  function paintGrowth() {
    if (officeShadow) officeShadow.visible = growth.tower < 0.03;
    base.setPresence(Math.min(1, growth.ground * 2.5));
    if (!tower || !district) return;
    tower.setGrowth(growth.tower);
    district.setGround(growth.ground);
    district.setCity(growth.city);
    district.setSolid(growth.solid);
  }

  // celebration rings on the office floor (paid at the lobby, live at Pip's room)
  const ringMat = new THREE.MeshBasicMaterial({ color: "#0AC18E", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  let ringT = -1;

  // where the work happens: one soft light in the working department's colour (created at 0 so no recompiles)
  const workLight = new THREE.PointLight("#ffffff", 0, 9, 1.4);
  workLight.position.set(0, 2.6, 0);
  scene.add(workLight);
  let workTarget = 0;
  const deptStates = new Map<Dept, DeptState>();

  // ── state
  let level: Level = opts.level ?? 1;
  let insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
  let focusT: FocusTarget = "overview";
  let w = 1, h = 1;
  const cur: Shot = { target: new THREE.Vector3(), dist: 60, yaw: 0.6, pitch: 0.7 };
  type Anim = { from: Shot; to: Shot; t0: number; ms: number; ease: (k: number) => number; arc: number; done: () => void; g0?: Growth; g1?: Growth; up?: boolean };
  let anim: Anim | null = null;
  let builtAnim: { from: number; to: number; t0: number; ms: number; done: () => void } | null = null;
  let builtK = q.get("built") === "1" ? 1 : 0;
  let beacon = false;
  let pendingSweep = false;
  const drift = new Drift();
  drift.enabled = !reduced;
  const clickCbs = new Set<(r: Room) => void>();
  const camCbs = new Set<() => void>();

  // ── atmosphere (tweened)
  let atmFrom: AtmospherePreset = opts.atmosphere;
  let atmTo: AtmospherePreset = opts.atmosphere;
  let palFrom: Palette = paletteFor(opts.atmosphere);
  let palTo: Palette = palFrom;
  let pal: Palette = lerpPalette(palFrom, palTo, 1);
  let atmK = 1, atmT0 = 0;
  const ATM_MS = 1100;
  const cA = new THREE.Color(), cB = new THREE.Color();
  const lerpC = (a: string, b: string, k: number, out: THREE.Color) => out.set(a).lerp(cB.set(b), k);
  const n = (a: number, b: number, k: number) => a + (b - a) * k;
  let fogNear = 60, fogFar = 220;

  function paintAtmosphere(k: number) {
    const A = atmFrom, B = atmTo;
    pal = lerpPalette(palFrom, palTo, k, pal);
    const top = `#${pal.skyTop.getHexString()}`, bottom = `#${pal.skyBottom.getHexString()}`;
    const night = (B.timeOfDay === "night" ? k : 0) + (A.timeOfDay === "night" ? 1 - k : 0);
    const glowA = (0.42 * (1 - night)).toFixed(3);
    host.style.background = `radial-gradient(120% 80% at 50% 38%, rgba(255,255,255,${glowA}) 0%, rgba(255,255,255,0) 60%), linear-gradient(180deg, ${top} 0%, ${bottom} 100%)`;
    const fa = A.fog ?? { color: A.sky[A.sky.length - 1], near: 400, far: 4000 };
    const fb = B.fog ?? { color: B.sky[B.sky.length - 1], near: 400, far: 4000 };
    if (!scene.fog) scene.fog = new THREE.Fog(fb.color, fb.near, fb.far);
    lerpC(fa.color, fb.color, k, (scene.fog as THREE.Fog).color);
    fogNear = n(fa.near, fb.near, k);
    fogFar = n(fa.far, fb.far, k);
    lerpC(A.ambient.sky, B.ambient.sky, k, hemi.color);
    lerpC(A.ambient.ground, B.ambient.ground, k, hemi.groundColor);
    hemi.intensity = n(A.ambient.intensity, B.ambient.intensity, k);
    lerpC(A.key.color, B.key.color, k, key.color);
    key.intensity = n(A.key.intensity, B.key.intensity, k);
    fill.color.copy(hemi.color).lerp(cA.set("#8FA6CC"), night);
    fill.intensity = 0.3 + 0.35 * night; // moonlight keeps night shapes readable
    renderer.toneMappingExposure = n(A.exposure, B.exposure, k);
    // key direction: interpolate azimuth/elevation
    // A sun at the camera's own azimuth (34°) hides every shadow behind its object and flattens the office.
    // Presets within ±40° of it are swung to the left (≈ −35°); the others (night −30°, golden 70°) are kept.
    const sunAz = (p: AtmospherePreset) => (Math.abs(p.key.azimuth - 34) < 40 ? -35 + (p.key.azimuth - 34) * 0.3 : p.key.azimuth);
    const az = THREE.MathUtils.degToRad(n(sunAz(A), sunAz(B), k)), el = THREE.MathUtils.degToRad(n(A.key.elevation, B.key.elevation, k));
    keyDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    fillDir.set(-keyDir.x, 0.6, -keyDir.z).normalize();
    key.castShadow = high && B.key.shadows;
    base.applyPalette(pal);
    tower?.applyPalette(pal);
    district?.applyPalette(pal);
    lightsChanged = true;
  }
  const keyDir = new THREE.Vector3(0.5, 0.8, 0.5), fillDir = new THREE.Vector3();
  let lightsChanged = true;

  function setAtmosphere(a: AtmospherePreset, animate: boolean) {
    palFrom = lerpPalette(pal, pal, 0); // snapshot of the colours on screen (safe mid-tween)
    atmFrom = atmTo; // light scalars restart from the last target preset
    atmTo = a;
    palTo = paletteFor(a);
    office.applyAtmosphere(a);
    if (!animate || reduced) {
      atmFrom = a;
      palFrom = palTo;
      atmK = 1;
      paintAtmosphere(1);
    } else {
      atmK = 0;
      atmT0 = performance.now();
    }
  }

  // ── framing
  function boxFor(t: FocusTarget, lv: Level): THREE.Box3 | THREE.Vector3[] {
    if (t !== "overview") return office.roomBounds(t).clone().applyMatrix4(office.root.matrixWorld);
    if (lv === 1) return office.bounds().clone().applyMatrix4(office.root.matrixWorld);
    if (lv === 2) return new THREE.Box3(new THREE.Vector3(-24, Y0, -12), new THREE.Vector3(24, 12 * 3.2 + 6, 16));
    ensureLevels();
    return district!.framePoints();
  }
  function shotFor(t: FocusTarget, lv: Level = level): Shot {
    const aspect = w / h;
    if (t !== "overview") {
      const b = (boxFor(t, 1) as THREE.Box3).expandByVector(new THREE.Vector3(0.8, 0, 0.8));
      const c = b.getCenter(new THREE.Vector3());
      const ang = roomAngles(c.x, aspect);
      return fitShot(b, ang.yaw, ang.pitch, w, h, insets, 0.12);
    }
    const ang = levelAngles(lv, aspect);
    return fitShot(boxFor("overview", lv), ang.yaw, ang.pitch, w, h, insets, lv === 1 ? 0.06 : 0.04);
  }

  let pose = { dYaw: 0, dPitch: 0 };
  const lastCam = new THREE.Matrix4();
  function sync() {
    applyShot(camera, cur, pose.dYaw, pose.dPitch);
    camera.updateMatrixWorld();
    // fog follows the camera distance so every level reads with the same depth
    // presets are tuned for the desktop level-1 shot (~62 units away); scale with the real distance (phones, levels 2/3)
    const s = Math.max(0.6, cur.dist / 62);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = fogNear * s;
      scene.fog.far = fogFar * s;
    }
    // shadow frustum hugs what the camera sees
    const vh = 2 * cur.dist * Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    const ext = Math.max(16, vh * Math.max(1, w / h) * 0.75);
    key.position.copy(cur.target).addScaledVector(keyDir, cur.dist + ext + 40);
    key.target.position.copy(cur.target);
    fill.position.copy(cur.target).addScaledVector(fillDir, 50);
    fill.target.position.copy(cur.target);
    const sc = key.shadow.camera;
    if (sc.right !== ext || lightsChanged) {
      Object.assign(sc, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: cur.dist + ext * 3 + 120 });
      sc.updateProjectionMatrix();
      lightsChanged = false;
    }
    if (!lastCam.equals(camera.matrixWorld)) {
      lastCam.copy(camera.matrixWorld);
      for (const cb of camCbs) cb();
    }
  }

  function setGrowthNow(g: Growth) {
    growth.tower = g.tower;
    growth.ground = g.ground;
    growth.city = g.city;
    growth.solid = g.solid;
    if (g.tower > 0 || g.ground > 0 || g.city > 0) ensureLevels();
    paintGrowth();
  }

  /**
   * Growth during a level move, driven by wall time `k` (linear 0..1), not by the eased camera: the tower starts
   * rising the moment the move starts, so the office is never left floating alone. Up = pull-back, down = push-in.
   */
  function growthAt(g0: Growth, g1: Growth, k: number, up: boolean): Growth {
    if (up)
      return {
        tower: n(g0.tower, g1.tower, win(k, 0.0, 0.62)),
        ground: n(g0.ground, g1.ground, win(k, 0.0, 0.45)),
        city: n(g0.city, g1.city, g0.tower < 1 ? win(k, 0.45, 0.5) : win(k, 0.0, 0.5)),
        solid: n(g0.solid, g1.solid, win(k, 0.25, 0.6)),
      };
    return {
      solid: n(g0.solid, g1.solid, win(k, 0, 0.3)),
      city: n(g0.city, g1.city, win(k, 0, 0.4)),
      tower: n(g0.tower, g1.tower, win(k, 0.04, 0.52)),
      ground: n(g0.ground, g1.ground, win(k, 0.3, 0.6)),
    };
  }

  function go(to: Shot, o: { animate: boolean; ms?: number; ease?: (k: number) => number; arc?: number; growthTo?: Growth }): Promise<void> {
    if (anim) {
      // finish growth of an interrupted move instantly-in-place: continue from wherever we are
      const d = anim.done;
      anim = null;
      d();
    }
    if (o.growthTo) ensureLevels();
    if (!o.animate || reduced) {
      cur.target.copy(to.target);
      cur.dist = to.dist;
      cur.yaw = to.yaw;
      cur.pitch = to.pitch;
      if (o.growthTo) setGrowthNow(o.growthTo);
      sync();
      if (o.growthTo && o.growthTo.tower >= 1 && pendingSweep) {
        pendingSweep = false;
        tower?.sweep();
      }
      return Promise.resolve();
    }
    return new Promise((done) => {
      const g1 = o.growthTo;
      anim = {
        from: cloneShot(cur), to, t0: performance.now(), ms: o.ms ?? 1100, ease: o.ease ?? easeInOut, arc: o.arc ?? 0, done,
        g0: g1 ? { ...growth } : undefined, g1, up: g1 ? g1.tower + g1.city + g1.ground >= growth.tower + growth.city + growth.ground : undefined,
      };
      document.documentElement.dataset.busy = "1";
    });
  }

  function levelMs(from: Level, to: Level) {
    if (from === to) return 1100;
    if (to > from) return to - from === 2 ? 3600 : to === 2 ? 2600 : 3000;
    return from - to === 2 ? 3200 : 2700;
  }

  function resize() {
    const r = host.getBoundingClientRect();
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (anim) anim.to = shotFor(focusT);
    else void go(shotFor(focusT), { animate: false });
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // ── input: clicks on rooms, pointer parallax
  const ray = new THREE.Raycaster();
  const toRoom = (x: number, y: number): Room | null => {
    if (level !== 1) return null;
    ray.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), camera);
    return office.pick(ray);
  };
  const onClick = (e: MouseEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    const room = toRoom(e.clientX - r.left, e.clientY - r.top);
    if (room) for (const cb of clickCbs) cb(room);
  };
  renderer.domElement.addEventListener("click", onClick);
  const onMove = (e: PointerEvent) => drift.pointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  window.addEventListener("pointermove", onMove, { passive: true });

  // ── loop
  let raf = 0, last = performance.now(), first = true;
  const clock0 = performance.now();
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const t = (now - clock0) / 1000;
    if (atmK < 1) {
      atmK = Math.min(1, (now - atmT0) / ATM_MS);
      paintAtmosphere(easeInOut(atmK));
      if (atmK >= 1) {
        atmFrom = atmTo;
        palFrom = palTo;
      }
    }
    if (builtAnim) {
      const k = Math.min(1, (now - builtAnim.t0) / builtAnim.ms);
      builtK = n(builtAnim.from, builtAnim.to, easeInOut(k));
      district?.setBuilt(builtK);
      if (k >= 1) {
        const d = builtAnim.done;
        builtAnim = null;
        d();
      }
    }
    if (anim) {
      const k = Math.min(1, (now - anim.t0) / anim.ms);
      lerpShot(anim.from, anim.to, anim.ease(k), cur, anim.arc);
      if (anim.g0 && anim.g1) {
        const g = growthAt(anim.g0, anim.g1, k, !!anim.up);
        growth.tower = g.tower;
        growth.ground = g.ground;
        growth.city = g.city;
        growth.solid = g.solid;
        paintGrowth();
      }
      if (k >= 1) {
        const a = anim;
        anim = null;
        if (a.g1 && a.g1.tower >= 1 && pendingSweep) {
          pendingSweep = false;
          tower?.sweep();
        }
        a.done();
      }
    }
    const [dy, dp] = drift.step(dt, t);
    pose = { dYaw: dy, dPitch: dp };
    sync();
    office.update(dt, t);
    if (Math.abs(workLight.intensity - workTarget) > 1e-3) workLight.intensity += (workTarget - workLight.intensity) * (reduced ? 1 : 1 - Math.exp(-dt * 3));
    tower?.update(dt, t);
    district?.update(dt, reduced ? 0 : t);
    if (ringT >= 0) {
      const k = Math.min(1, (now - ringT) / 800); // wall clock: always gone before the camera leaves the lobby
      ring.scale.setScalar(0.4 + (1 - Math.pow(1 - k, 3)) * 2.6);
      ringMat.opacity = (1 - k) * (1 - k) * 0.6;
      if (k >= 1) {
        ringT = -1;
        ring.visible = false;
      }
    }
    renderer.render(scene, camera);
    document.documentElement.dataset.busy = anim || builtAnim ? "1" : "0";
    if (first) {
      first = false;
      document.documentElement.setAttribute(READY_ATTR, "1");
      // pre-build levels 2/3 while the user reads the idea popup, so the first pull-back never hitches
      const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1200));
      idle(() => ensureLevels());
    }
  };

  // ── boot
  setAtmosphere(opts.atmosphere, false);
  resize();
  setGrowthNow(GROWTH[level]);
  void go(shotFor("overview"), { animate: false });
  raf = requestAnimationFrame(tick);

  function pulseAt(room: Room) {
    const b = office.roomBounds(room).clone().applyMatrix4(office.root.matrixWorld);
    const c = b.getCenter(new THREE.Vector3());
    ring.position.set(c.x, b.min.y + 0.03, c.z);
    ringMat.color.copy(pal.money);
    ring.visible = true;
    ringT = performance.now();
  }

  const world: World & WorldExtras = {
    camera,
    debug: { renderer, scene, key, state: () => ({ level, focusT, insets, w, h, cur: { t: cur.target.toArray(), d: cur.dist }, growth: { ...growth }, built: builtK }) },
    get level() {
      return level;
    },
    setLevel(l, o) {
      const from = level;
      level = l;
      focusT = "overview";
      const animate = o?.animate ?? true;
      const ms = levelMs(from, l);
      return go(shotFor("overview", l), { animate, ms, ease: from === l ? easeInOut : l > from ? easeOutward : easeLevel, growthTo: GROWTH[l] });
    },
    focus(t, o) {
      const prev = focusT;
      focusT = t;
      const animate = o?.animate ?? true;
      if (t !== "overview" && level !== 1) {
        // a room only exists inside the office: dive back in
        const from = level;
        level = 1;
        return go(shotFor(t, 1), { animate, ms: levelMs(from, 1), ease: easeLevel, growthTo: GROWTH[1] });
      }
      const sameKind = (t === "overview") === (prev === "overview");
      return go(shotFor(t), { animate, ms: o?.ms ?? 1100, arc: t !== "overview" && sameKind ? 0.035 : 0 });
    },
    setDeptState(d: Dept, s: DeptState) {
      office.setDeptState(d, s);
      deptStates.set(d, s);
      const working = [...deptStates].find(([, st]) => st === "working")?.[0];
      if (working) {
        const b = office.roomBounds(working).clone().applyMatrix4(office.root.matrixWorld);
        const c = b.getCenter(new THREE.Vector3());
        workLight.position.set(c.x, 2.4, c.z);
        workLight.color.set(ROOM_META[working].color);
        workTarget = atmTo.timeOfDay === "night" ? 5 : 3.2;
      } else workTarget = 0;
    },
    setAtmosphere: (a, o) => setAtmosphere(a, o?.animate ?? true),
    setInsets(i) {
      if (i.left === insets.left && i.right === insets.right && i.top === insets.top && i.bottom === insets.bottom) return;
      insets = { ...i };
      if (anim) {
        anim.to = shotFor(focusT);
        return;
      }
      void go(shotFor(focusT), { animate: true, ms: 600 });
    },
    celebrate(kind) {
      if (kind === "paid") {
        office.cheer("lobby");
        if (level === 1) pulseAt("lobby");
      } else if (kind === "level-up") {
        office.cheer();
        if (tower && growth.tower >= 1 && !anim) tower.sweep();
        else pendingSweep = true;
      } else {
        office.cheer("pip");
        if (level === 1) pulseAt("pip");
        beacon = true;
        ensureLevels();
        tower?.setBeacon(true, !reduced);
      }
    },
    renderedLevel() {
      return growth.solid > 0.5 ? 3 : growth.tower > 0.5 ? 2 : 1;
    },
    officeScreenPoint() {
      if (growth.tower < 0.5) return null;
      const p = new THREE.Vector3(-8, Y0 - 0.2, 7.9); // front edge of the plinth, under the lobby entrance
      p.project(camera);
      if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return null;
      return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
    },
    roomScreenPoint(room) {
      if (level !== 1 || growth.tower > 0.02) return null;
      const p = (office.anchor?.(room) ?? office.roomBounds(room).getCenter(new THREE.Vector3())).clone();
      office.root.localToWorld(p);
      p.project(camera);
      if (p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) return null;
      return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
    },
    screenToRoom: toRoom,
    onRoomClick(cb) {
      clickCbs.add(cb);
      return () => clickCbs.delete(cb);
    },
    onCameraChange(cb) {
      camCbs.add(cb);
      return () => camCbs.delete(cb);
    },
    setDistrictBuilt(k, o) {
      ensureLevels();
      builtAnim?.done();
      builtAnim = null;
      if (!(o?.animate ?? true) || reduced) {
        builtK = clamp01(k);
        district?.setBuilt(builtK);
        return Promise.resolve();
      }
      return new Promise((done) => {
        builtAnim = { from: builtK, to: clamp01(k), t0: performance.now(), ms: 2200, done };
      });
    },
    debugPose(from, to, k) {
      ensureLevels();
      anim = null;
      const a = shotFor("overview", from), b = shotFor("overview", to);
      const ease = from === to ? easeInOut : to > from ? easeOutward : easeLevel;
      lerpShot(a, b, ease(clamp01(k)), cur);
      const g = growthAt(GROWTH[from], GROWTH[to], clamp01(k), to > from);
      setGrowthNow(g);
      level = k >= 1 ? to : from;
      sync();
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("click", onClick);
      office.dispose();
      tower?.dispose();
      district?.dispose();
      base.dispose();
      disposeFacades();
      env.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
  return world;
}
