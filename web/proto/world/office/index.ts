// WS-A · createOfficeModel(): the level-1 office as a pure THREE graph (no renderer, camera, DOM labels or RAF).
// Contract: OfficeModel in ../../contracts.ts. Coordinates as layout.ts (X ±12.45, Z ±6.25, floor top y = 0).
//
// Look: an architectural-model diorama. Warm plaster walls with darker cut caps, ribbon windows, glass corridor
// partitions, microcement floors, oak furniture. Each department reads by its feature wall, rug, upholstery and
// props — no neon strips. Static geometry is baked to ~one draw call per material.
//
// Environment light: the office brings its own image-based lighting (RoomEnvironment → PMREM), generated lazily
// the first time it is rendered, so it looks right inside any renderer WS-B sets up. See officeRenderHints().
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { AtmospherePreset, Dept, DeptState, OfficeModel, Quality, Room } from "../../contracts";
import { ROOM_META } from "../../contracts";
import { Agent, Cheer } from "./agents";
import { bake, Builder, DEFAULT_SURFACES, Registry, type Look, type RoomMix } from "./kit";
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

const ENV_BY_TIME: Record<Look["time"], number> = { day: 0.22, studio: 0.24, golden: 0.16, night: 0.08 };

export function createOfficeModel(opts: OfficeOptions): OfficeModelExt {
  const q = opts.quality;
  const still = !!opts.still;
  const R = new Registry(q);
  const root = new THREE.Group();
  root.name = "office";

  // ── build
  const shell = buildShell(R, q);
  root.add(bake(shell.shared));
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
    const baked = bake(g);
    baked.name = `room:${r.id}`;
    root.add(baked);
    roomGroups.set(r.id, baked);
    const a = new Agent(r, R, q);
    agents.set(r.id, a);
    root.add(a.root, a.hud);
  }
  if (groundShadow) groundShadow.name = "office-ground-shadow";

  // ── interior lamps: one soft warm point light per room (high quality only). Always present so that
  //    switching themes never recompiles shaders; intensity 0 when the lights are off.
  const roomLights = new Map<Room, THREE.PointLight>();
  if (q === "high") {
    for (const r of ROOMS) {
      const l = new THREE.PointLight("#FFC48A", 0, 7.5, 1.6);
      l.position.set(r.cx + (r.row === "back" ? 0.8 : 0.6), 1.95, r.cz + (r.row === "back" ? -0.2 : 0.4));
      l.castShadow = false;
      l.name = `lamp:${r.id}`;
      root.add(l);
      roomLights.set(r.id, l);
    }
  }
  const lampLevel = () => (!look.lightsOn ? 0 : look.time === "night" ? 5.5 : look.time === "golden" ? 1.6 : 1.0);
  const syncLights = (only?: Room) => {
    for (const [room, l] of roomLights) {
      if (only && room !== only) continue;
      const m = mixes.get(room)!;
      l.intensity = lampLevel() * (1 - m.locked) * (1 + 0.25 * m.work);
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
  const look: Look = { s: { ...DEFAULT_SURFACES }, acc: 1, lightsOn: false, time: "studio", env: ENV_BY_TIME.studio };
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
      syncLights(d);
    }
    agents.get(d)!.setState(s, instant);
  }

  function applyAtmosphere(a: AtmospherePreset) {
    look.s = { ...DEFAULT_SURFACES, ...(a.surfaces ?? {}) } as Look["s"];
    look.acc = a.accentStrength ?? 1;
    look.lightsOn = a.lightsOn ?? (a.timeOfDay === "night" || a.timeOfDay === "golden");
    look.time = a.timeOfDay;
    look.env = ENV_BY_TIME[a.timeOfDay];
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
      let busy = !still;
      const k = 1 - Math.exp(-dt * 4.5);
      for (const [room, m] of mixes) {
        const tg = targets.get(room)!;
        const dl = tg.locked - m.locked, dw = tg.work - m.work, dd = tg.done - m.done;
        if (Math.abs(dl) + Math.abs(dw) + Math.abs(dd) > 1e-3) {
          m.locked += dl * k;
          m.work += dw * k;
          m.done += dd * k;
          if (Math.abs(dl) + Math.abs(dw) + Math.abs(dd) < 4e-3) Object.assign(m, tg);
          R.resolve(look, mixes, room);
          syncLights(room);
          busy = true;
        }
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
