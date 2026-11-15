// WS-A · createOfficeModel(): the level-1 office as a pure THREE graph (no renderer, camera, DOM labels or RAF).
// Contract: OfficeModel in ../../contracts.ts. Coordinates as layout.ts (X ±12.45, Z ±6.25, floor top y = 0).
//
// Look: an architectural-model diorama. Matte plaster walls with charcoal section-cut caps, ribbon windows, frosted
// glass partitions with thin black mullions, warm oak plank rooms around a pale stone corridor, a thick refined
// plinth. Each department reads by its feature wall, rug, upholstery and props — no neon strips. Baked contact
// shadows / fake AO everywhere (gradient decals). Static geometry is baked to ~one draw call per material.
//
// Day cycle (v6): applyAtmosphere() may be called ~10×/s with an interpolated preset. It is allocation-free: it
// derives three continuous factors (dark, warm, lamps) and mutates existing material colours / intensities.
//
// Environment light: the office brings its own image-based lighting (RoomEnvironment → PMREM), generated lazily
// the first time it is rendered, so it looks right inside any renderer WS-B sets up. See officeRenderHints().
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { AtmospherePreset, Dept, DeptState, OfficeModel, Quality, Room } from "../../contracts";
import { ROOM_META } from "../../contracts";
import { Agent, Cheer } from "./agents";
import { bake, Builder, hexInto, makeLook, Registry, setSurfaces, type RoomMix } from "./kit";
import { HALF_X, HALF_Z, ROOMS, ROOM_D, ROOM_W, SLAB_PAD, type RoomDef } from "./layout";
import { furnish } from "./props";
import { buildShell, EXT_H } from "./shell";
import { disposeTextures } from "./textures";

export interface OfficeOptions {
  quality: Quality;
  /** Reduced motion: no idle animation, state changes snap. */
  still?: boolean;
}

/** Extra (additive) methods on top of the OfficeModel contract. */
export interface OfficeModelExt extends OfficeModel {
  /** Current state of a department. */
  deptState(d: Dept): DeptState;
  /** Snap every state transition (deep links / replay). */
  setDeptState(d: Dept, s: DeptState, opts?: { instant?: boolean }): void;
  /** Recommended renderer settings for this office's materials. */
  readonly hints: typeof officeRenderHints;
}

/**
 * What the office was tuned for. WS-B may adopt any of these; nothing breaks if it doesn't.
 *  - ACES Filmic tone mapping, sRGB output
 *  - PCFSoft shadows, key-light bias −0.0004 / normalBias 0.02, shadow map 2048 (high)
 */
export const officeRenderHints = {
  toneMapping: THREE.ACESFilmicToneMapping,
  outputColorSpace: THREE.SRGBColorSpace,
  shadowMapType: THREE.PCFSoftShadowMap,
  shadowBias: -0.0004,
  shadowNormalBias: 0.02,
} as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const _c = new THREE.Color();
/** Relative luminance of an sRGB hex string (allocation-free). */
function lum(hex: string) {
  hexInto(_c, hex).convertLinearToSRGB();
  return 0.2126 * _c.r + 0.7152 * _c.g + 0.0722 * _c.b;
}

export function createOfficeModel(opts: OfficeOptions): OfficeModelExt {
  const q = opts.quality;
  // WS-B does not pass `still` yet: fall back to ?still=1 / prefers-reduced-motion so deep links snap poses
  const still = opts.still ?? (typeof location !== "undefined" && (/[?&]still=1\b/.test(location.search) || !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  const R = new Registry(q);
  const root = new THREE.Group();
  root.name = "office";

  // ── build
  const shell = buildShell(R, q);
  root.add(bake(shell.shared, R));
  const groundShadow = root.getObjectByName("office-ground-shadow");
  const spinners: THREE.Object3D[] = [];
  const agents = new Map<Room, Agent>();
  const roomGroups = new Map<Room, THREE.Group>();
  for (const r of ROOMS) {
    const g = shell.perRoom.get(r.id)!;
    const B = new Builder(q);
    B.group.position.set(r.cx, 0, r.cz);
    const f = furnish({ R, B, room: r.id, color: r.color }, r, B.group);
    spinners.push(...f.spinners);
    g.add(B.group);
    const baked = bake(g, R);
    baked.name = `room:${r.id}`;
    root.add(baked);
    roomGroups.set(r.id, baked);
    const a = new Agent(r, R, q);
    agents.set(r.id, a);
    root.add(a.root, a.hud);
  }
  if (groundShadow) groundShadow.name = "office-ground-shadow";

  // ── interior light (high quality only; low = emissive shades + additive pools, no lights).
  //    Fixed count so the day cycle never recompiles shaders: 4 warm lamps (one per column of rooms, hung over
  //    the corridor glass line so both rooms of the column catch it) + 1 dept-coloured accent light that moves
  //    to the room that is working. All at intensity 0 by day.
  const warmLights: THREE.PointLight[] = [];
  let workLight: THREE.PointLight | null = null;
  if (q === "high") {
    for (let col = 0; col < 4; col++) {
      const back = ROOMS.find((r) => r.row === "back" && r.col === col)!;
      const l = new THREE.PointLight("#FFC27E", 0, 9, 1.7);
      l.position.set(back.cx + 0.6, 1.9, 0);
      l.castShadow = false;
      l.name = `lamp:col${col}`;
      root.add(l);
      warmLights.push(l);
    }
    workLight = new THREE.PointLight("#ffffff", 0, 5.2, 1.8);
    workLight.name = "lamp:work";
    workLight.castShadow = false;
    root.add(workLight);
  }
  let workRoom: Room | null = null;
  const syncLights = () => {
    const lv = look.lamps * (0.3 + 16 * look.dark * look.dark + 2.5 * look.warm);
    for (let i = 0; i < warmLights.length; i++) {
      const l = warmLights[i]!;
      // a column is dimmer when its rooms are locked
      l.intensity = lv * colOpen[i]!;
    }
    if (workLight) {
      let best: Room | null = null, bw = 0.01;
      for (const [room, m] of mixes) if (room !== "lobby" && m.work > bw) (bw = m.work), (best = room);
      if (best && best !== workRoom) {
        workRoom = best;
        const r = roomDef(best);
        workLight.position.set(r.cx + (r.row === "back" ? -1.2 : -1.6), 1.45, r.cz + (r.row === "back" ? -1.1 : 0.2));
        hexInto(workLight.color, r.color);
      }
      workLight.intensity = workRoom ? mixes.get(workRoom)!.work * (0.6 + 7 * look.dark) : 0;
    }
  };
  const colOpen = [1, 1, 1, 1];
  const syncCols = () => {
    for (let col = 0; col < 4; col++) {
      let open = 0;
      for (const r of ROOMS) if (r.col === col) open += 1 - mixes.get(r.id)!.locked;
      colOpen[col] = 0.25 + 0.375 * open;
    }
  };

  // ── picking volumes (invisible, never rendered)
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const pickBoxes: THREE.Mesh[] = [];
  for (const r of ROOMS) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 1.8, ROOM_D), pickMat);
    m.position.set(r.cx, 0.9, r.cz);
    m.userData.room = r.id;
    m.updateMatrix();
    root.add(m);
    pickBoxes.push(m);
  }

  // ── celebrations: one pool, reused
  const cheers = [new Cheer(), new Cheer(), new Cheer()];
  let cheerIdx = 0;
  for (const c of cheers) root.add(c.root);

  // ── environment probe: builds a PMREM'd RoomEnvironment with the host renderer on first render
  let envRT: THREE.WebGLRenderTarget | null = null;
  const probe = new THREE.Mesh(new THREE.PlaneGeometry(0.001, 0.001), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 }));
  probe.frustumCulled = false;
  probe.raycast = () => {};
  probe.onBeforeRender = (renderer) => {
    if (envRT) return;
    const pm = new THREE.PMREMGenerator(renderer);
    const env = new RoomEnvironment();
    envRT = pm.fromScene(env, 0.04);
    env.dispose();
    pm.dispose();
    R.setEnvMap(envRT.texture);
    probe.visible = false;
  };
  root.add(probe);

  // ── state
  const look = makeLook();
  const mixes = new Map<Room, RoomMix>();
  const targets = new Map<Room, RoomMix>();
  const states = new Map<Dept, DeptState>();
  for (const r of ROOMS) {
    mixes.set(r.id, { locked: 0, work: 0, done: 0 });
    targets.set(r.id, { locked: 0, work: 0, done: 0 });
    if (r.id !== "lobby") states.set(r.id, "idle");
  }
  R.resolve(look, mixes);

  const roomDef = (room: Room): RoomDef => ROOMS.find((x) => x.id === room)!;

  function setDeptState(d: Dept, s: DeptState, o?: { instant?: boolean }) {
    states.set(d, s);
    const tg = targets.get(d)!;
    tg.locked = s === "locked" ? 1 : 0;
    tg.work = s === "working" ? 1 : 0;
    tg.done = s === "done" ? 1 : 0;
    const instant = still || !!o?.instant;
    if (instant) {
      Object.assign(mixes.get(d)!, tg);
      R.resolve(look, mixes, d);
      syncCols();
      syncLights();
    }
    agents.get(d)!.setState(s, instant);
  }

  function applyAtmosphere(a: AtmospherePreset) {
    setSurfaces(look, a.surfaces);
    look.acc = a.accentStrength ?? 1;
    // dark: from the sky (bottom colour) luminance, so any interpolated preset fades smoothly
    const sky = a.sky[a.sky.length - 1]!;
    const skyDark = 1 - smoothstep(0.06, 0.42, lum(sky));
    const keyDark = 1 - smoothstep(0.6, 1.8, a.key.intensity);
    look.dark = clamp01(Math.max(skyDark, keyDark * 0.85));
    // warm: a low, orange key light
    hexInto(_c, a.key.color).convertLinearToSRGB();
    const warmHue = clamp01((_c.r - _c.b - 0.06) / 0.26);
    look.warm = warmHue * (1 - smoothstep(30, 60, a.key.elevation) * 0.6) * (1 - look.dark);
    const lo = a.lightsOn as unknown;
    const ll = (a as { lightLevel?: unknown }).lightLevel; // v6 world clock: continuous lamp fade (integrate)
    look.lamps =
      typeof ll === "number"
        ? clamp01(ll)
        : typeof lo === "number"
        ? clamp01(lo)
        : lo === true
          ? Math.max(0.3, look.dark, look.warm * 0.7)
          : lo === false
            ? 0
            : clamp01(look.dark * 1.2 + look.warm * 0.4);
    look.env = 0.24 - 0.15 * look.dark - 0.06 * look.warm;
    R.resolve(look, mixes);
    syncLights();
  }

  function cheer(room?: Room) {
    const list: Room[] = room ? [room] : ["lobby", ...([...states.entries()].filter(([, s]) => s !== "locked").map(([d]) => d))];
    for (const rm of list) agents.get(rm)?.cheer();
    const fireAt = (rm: Room) => {
      const a = agents.get(rm)!;
      const p = a.headPoint();
      cheers[cheerIdx % cheers.length]!.fire(p.x, p.z, ROOM_META[rm].color);
      cheerIdx++;
    };
    if (room) fireAt(room);
    else fireAt("lobby");
  }

  const bounds = new THREE.Box3(new THREE.Vector3(-HALF_X - SLAB_PAD, -0.55, -HALF_Z - SLAB_PAD), new THREE.Vector3(HALF_X + SLAB_PAD, EXT_H, HALF_Z + SLAB_PAD));

  const model: OfficeModelExt = {
    root,
    hints: officeRenderHints,
    bounds: () => bounds.clone(),
    roomBounds(room) {
      const r = roomDef(room);
      return new THREE.Box3(new THREE.Vector3(r.cx - ROOM_W / 2, 0, r.cz - ROOM_D / 2), new THREE.Vector3(r.cx + ROOM_W / 2, 2.0, r.cz + ROOM_D / 2));
    },
    deptState: (d) => states.get(d) ?? "idle",
    setDeptState,
    applyAtmosphere,
    cheer,
    update(dt, t) {
      // defensive: a host may hand us a negative / huge first-frame dt (rAF timestamp older than its own clock)
      dt = dt > 0 ? (dt < 0.1 ? dt : 0.1) : 0;
      let busy = !still;
      const k = 1 - Math.exp(-dt * 4.5);
      let moved = false;
      for (const [room, m] of mixes) {
        const tg = targets.get(room)!;
        const dl = tg.locked - m.locked, dw = tg.work - m.work, dd = tg.done - m.done;
        if (Math.abs(dl) + Math.abs(dw) + Math.abs(dd) > 1e-3) {
          m.locked += dl * k;
          m.work += dw * k;
          m.done += dd * k;
          if (Math.abs(dl) + Math.abs(dw) + Math.abs(dd) < 4e-3) Object.assign(m, tg);
          R.resolve(look, mixes, room);
          moved = true;
          busy = true;
        }
      }
      if (moved) {
        syncCols();
        syncLights();
      }
      // working rooms: screens breathe (a slow glow pulse, no geometry or colour work)
      if (!still)
        for (const [room, m] of mixes) {
          if (m.work > 0.02) R.pulse(room, 1 + m.work * (0.22 * Math.sin(t * 2.4 + room.length) + 0.08 * Math.sin(t * 7.1)));
        }
      for (const a of agents.values()) busy = a.update(dt, t, still) || busy;
      if (!still) for (const s of spinners) s.rotation.y += dt * 0.35;
      for (const c of cheers) busy = c.update(dt) || busy;
      return busy;
    },
    pick(ray) {
      const hit = ray.intersectObjects(pickBoxes, false)[0];
      return hit ? (hit.object.userData.room as Room) : null;
    },
    anchor(room) {
      return agents.get(room)!.headPoint();
    },
    dispose() {
      for (const a of agents.values()) a.dispose();
      for (const c of cheers) c.dispose();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      pickMat.dispose();
      (probe.material as THREE.Material).dispose();
      envRT?.dispose();
      R.dispose();
      disposeTextures();
    },
  };
  return model;
}
