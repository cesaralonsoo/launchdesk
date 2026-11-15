// WS-OFFICE · createOfficeModel(): the level-1 floor as a pure THREE graph (no renderer, camera, DOM labels or RAF).
// Contract: OfficeModelV7 (+ the v5/v6 OfficeModel API, kept for compatibility) in ../../contracts.ts.
// Coordinates as layout.ts (X ±12.45, Z ±6.25, floor top y = 0).
//
// v7:
//   - floor plan r0 r1 r2 r3 / lobby nova dex launch. Research rooms are furnished for the analyst who sits there
//     (competition = wall of competitor cards, market = money board, viability = SWOT whiteboard, …), built lazily
//     per role and cached, so setRoster() swaps a room's set without rebuilding the floor.
//   - the v5 characters are back (cast.ts), one per actor: founder (CEO desk), 3–5 analysts, the four builders.
//   - pixel-art direction (style.ts): nearest-filtered low-res textures, crisp edges, voxel plants, cel-shaded figures.
//   - the lobby wall carries the project's own company sign (draft = taped kraft card, brand = backlit pixel sign).
//   - setReveal(k) for the boom: the slab spreads out of the lobby footprint, rooms rise column by column.
//
// Day cycle: applyAtmosphere() may be called ~10×/s with an interpolated preset. It is allocation-free.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type {
  ActorId, Analyst, AnalystRole, AtmospherePreset, BuildDept, CompanySign, Dept, DeptState, FindingKind, FloorRoom, OfficeModelV7, Quality, Room as LegacyRoom,
} from "../../contracts";
import { BUILD_TEAM, ROLE_LIBRARY, ROOM_META } from "../../contracts";
import { Figure, lookOf, setFigureAtmosphere, type Spot } from "./cast";
import { CubeBurst, Papers } from "./fx";
import { bake, Builder, hexInto, lookFromAtmosphere, makeLook, Registry, type RoomMix } from "./kit";
import { FLOOR_ROOMS, floorSpot, HALF_X, HALF_Z, LEGACY_OF, LEGACY_ROOM, ROOM_BY_ID, ROOM_D, ROOM_W, ROOMS, SLAB_PAD, toRoot, type RoomDef } from "./layout";
import { drawLobbySign, PixelCanvas } from "./pixel";
import { furnish, type RoomSet } from "./props";
import { buildRoomShell, buildSharedShell, EXT_H } from "./shell";
import { isPixel, resolveStyle, setStyle, style as currentStyle, type OfficeStyle } from "./style";
import { disposeTextures } from "./textures";

export { OFFICE_STYLES, type OfficeStyle } from "./style";

export interface OfficeOptions {
  quality: Quality;
  /** Reduced motion: no idle animation, state changes snap. */
  still?: boolean;
  /** Art direction (default "voxel"; `?ostyle=` overrides for comparisons). */
  style?: OfficeStyle;
}

/** Everything the office offers: the v7 contract, the v5/v6 API, and a few extras. */
export interface OfficeModelExt extends OfficeModelV7 {
  deptState(d: Dept): DeptState;
  setDeptState(d: Dept, s: DeptState, opts?: { instant?: boolean }): void;
  actorState(id: ActorId): import("../../contracts").ActorState;
  /** Root-local point a pulse lands on (founder's in-tray). */
  trayPoint(): THREE.Vector3;
  readonly style: OfficeStyle;
  readonly hints: typeof officeRenderHints;
}

/**
 * What the office was tuned for. WS-WORLD may adopt any of these; nothing breaks if it doesn't.
 *  - ACES Filmic tone mapping, sRGB output · PCFSoft shadows, bias −0.0004 / normalBias 0.02
 */
export const officeRenderHints = {
  toneMapping: THREE.ACESFilmicToneMapping,
  outputColorSpace: THREE.SRGBColorSpace,
  shadowMapType: THREE.PCFSoftShadowMap,
  shadowBias: -0.0004,
  shadowNormalBias: 0.02,
} as const;

type ActorState = import("../../contracts").ActorState;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const win = (k: number, a: number, b: number) => clamp01((k - a) / (b - a));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2));
const ARRIVE_MS = 900;
const DEFAULT_ROSTER: AnalystRole[] = ["viability", "competition", "market"];

/** Shared environment probe: one PMREM'd RoomEnvironment per renderer, applied to a registry on first render. */
const envCache = new WeakMap<THREE.WebGLRenderer, THREE.WebGLRenderTarget>();
export function envProbe(R: Registry): THREE.Mesh {
  const probe = new THREE.Mesh(new THREE.PlaneGeometry(0.001, 0.001), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 }));
  probe.frustumCulled = false;
  probe.raycast = () => {};
  probe.userData.keep = true;
  probe.onBeforeRender = (renderer) => {
    let rt = envCache.get(renderer);
    if (!rt) {
      const pm = new THREE.PMREMGenerator(renderer);
      const env = new RoomEnvironment();
      rt = pm.fromScene(env, 0.04);
      env.dispose();
      pm.dispose();
      envCache.set(renderer, rt);
    }
    R.setEnvMap(rt.texture);
    probe.visible = false;
  };
  return probe;
}

interface Slot {
  def: RoomDef;
  holder: THREE.Group; // rise scaling (boom reveal)
  variants: Map<string, { g: THREE.Group; spinners: THREE.Object3D[] }>;
  active: string;
  mix: RoomMix;
  target: RoomMix;
  rise: number;
}
interface Actor {
  id: ActorId;
  fig: Figure;
  room: FloorRoom;
  desk: 0 | 1;
  state: ActorState;
  arriveT: number;
}

export function createOfficeModel(opts: OfficeOptions): OfficeModelExt {
  const q = opts.quality;
  const st = resolveStyle(opts.style);
  setStyle(st);
  const still = opts.still ?? (typeof location !== "undefined" && (/[?&]still=1\b/.test(location.search) || !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  const R = new Registry(q);
  const root = new THREE.Group();
  root.name = "office";

  // ── shared shell (slab, corridor, left wall); wrapped so the boom can spread it out of the lobby footprint
  const sharedWrap = new THREE.Group();
  sharedWrap.name = "office-shared";
  const shared = bake(buildSharedShell(R, q), R);
  sharedWrap.add(shared);
  root.add(sharedWrap);
  const groundShadow = root.getObjectByName("office-ground-shadow");
  if (groundShadow) groundShadow.name = "office-ground-shadow";

  // ── rooms
  const look = makeLook();
  const mixes = new Map<string, RoomMix>();
  const slots = new Map<FloorRoom, Slot>();
  for (const r of ROOMS) {
    const holder = new THREE.Group();
    holder.name = `room:${r.id}`;
    root.add(holder);
    const mix = { locked: 0, work: 0, done: 0 };
    slots.set(r.id, { def: r, holder, variants: new Map(), active: "", mix, target: { locked: 0, work: 0, done: 0 }, rise: 1 });
  }
  const NEUTRAL = "#B9BCC2";
  function buildVariant(slot: Slot, key: string, set: RoomSet, color: string) {
    const r = slot.def;
    const g = buildRoomShell(R, q, r, key, color);
    const B = new Builder(q);
    B.group.position.set(r.cx, 0, r.cz);
    const f = furnish({ R, B, room: key, color }, r, B.group, set);
    g.add(B.group);
    const baked = bake(g, R);
    baked.name = `set:${key}`;
    mixes.set(key, slot.mix);
    slot.variants.set(key, { g: baked, spinners: f.spinners });
    return slot.variants.get(key)!;
  }
  function activate(slot: Slot, key: string, set: RoomSet, color: string) {
    if (slot.active === key) return;
    const v = slot.variants.get(key) ?? buildVariant(slot, key, set, color);
    for (const [k, o] of slot.variants) if (k !== key) o.g.removeFromParent();
    slot.holder.add(v.g);
    slot.active = key;
    R.resolve(look, mixes, key);
  }

  // ── actors
  const actors = new Map<ActorId, Actor>();
  let roster: Analyst[] = DEFAULT_ROSTER.map((role) => {
    const m = ROLE_LIBRARY[role];
    return { id: role, role, name: m.name, color: m.color, mission: m.mission, why: "", weight: 1 / 3 };
  });
  const spotOf = (room: FloorRoom, desk: 0 | 1): Spot => toRoot(ROOM_BY_ID[room], floorSpot(room, desk));
  function ensureActor(id: ActorId, room: FloorRoom, desk: 0 | 1, color: string, initial: ActorState) {
    let a = actors.get(id);
    if (a && a.fig.look.shirt !== color) {
      a.fig.dispose();
      actors.delete(id);
      a = undefined;
    }
    if (!a) {
      const fig = new Figure(id, lookOf(id, color), spotOf(room, desk), q);
      fig.size = 1.1; // a touch bigger on the floor so they read at the overview distance
      root.add(fig.root);
      addPick(fig, id);
      a = { id, fig, room, desk, state: initial, arriveT: -1 };
      actors.set(id, a);
      fig.setState(initial, true);
    } else if (a.room !== room || a.desk !== desk) {
      a.room = room;
      a.desk = desk;
      a.fig.setSpot(spotOf(room, desk), true);
    }
    return a;
  }
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const pickGeo = new THREE.BoxGeometry(0.62, 1.45, 0.62).translate(0, 0.72, 0);
  const pickers: THREE.Mesh[] = [];
  function addPick(fig: Figure, id: ActorId) {
    const m = new THREE.Mesh(pickGeo, pickMat);
    m.userData.actor = id;
    fig.root.add(m);
    pickers.push(m);
  }

  // founder + builders always exist
  ensureActor("founder", "lobby", 0, lookOf("founder").shirt, "idle");
  for (const b of BUILD_TEAM) {
    const room: FloorRoom = b === "rae" || b === "pip" ? "launch" : b;
    ensureActor(b, room, b === "pip" ? 1 : 0, ROOM_META[b].color, "asleep");
  }
  activate(slots.get("lobby")!, "lobby", { kind: "lobby" }, ROOM_META.lobby.color);
  activate(slots.get("nova")!, "nova", { kind: "nova" }, ROOM_META.nova.color);
  activate(slots.get("dex")!, "dex", { kind: "dex" }, ROOM_META.dex.color);
  activate(slots.get("launch")!, "launch", { kind: "launch", pipColor: ROOM_META.pip.color }, ROOM_META.rae.color);

  function setRoster(r: readonly Analyst[]) {
    roster = r.slice(0, 5);
    // research rooms
    const byRoom: Analyst[][] = [[], [], [], []];
    roster.forEach((a, i) => byRoom[Math.min(i, 3)]!.push(a));
    byRoom.forEach((list, i) => {
      const slot = slots.get(`r${i}` as FloorRoom)!;
      if (list.length === 0) activate(slot, `r${i}/vacant`, { kind: "research", role: null }, NEUTRAL);
      else if (list.length === 1) activate(slot, `r${i}/${list[0]!.role}:${list[0]!.color}`, { kind: "research", role: list[0]!.role }, list[0]!.color);
      else activate(slot, `r${i}/${list[0]!.role}+${list[1]!.role}:${list[0]!.color}`, { kind: "shared", a: list[0]!.role, b: list[1]!.role, colorB: list[1]!.color }, list[0]!.color);
    });
    // analysts: keep, move or create; drop the ones no longer hired
    const keep = new Set<ActorId>(["founder", ...BUILD_TEAM]);
    roster.forEach((a, i) => {
      keep.add(a.id);
      const prev = actors.get(a.id)?.state ?? "idle";
      ensureActor(a.id, `r${Math.min(i, 3)}` as FloorRoom, i >= 4 ? 1 : 0, a.color, prev);
    });
    for (const [id, a] of actors) {
      if (keep.has(id)) continue;
      pickers.splice(pickers.findIndex((p) => p.userData.actor === id) >>> 0, 1);
      a.fig.dispose();
      actors.delete(id);
    }
    syncRooms(true);
  }

  // ── room state follows the people in it
  function syncRooms(instant: boolean) {
    for (const [id, slot] of slots) {
      const people = [...actors.values()].filter((a) => a.room === id);
      const present = people.filter((a) => a.state !== "absent");
      const tg = slot.target;
      if (id === "lobby") {
        tg.locked = 0;
        tg.work = people.some((a) => a.state === "working") ? 1 : 0;
        tg.done = 0;
      } else {
        const asleep = present.length > 0 && present.every((a) => a.state === "asleep");
        tg.locked = present.length === 0 ? (id.startsWith("r") ? 0.55 : 1) : asleep ? 1 : 0;
        tg.work = present.some((a) => a.state === "working" || a.state === "presenting" || a.state === "arriving") ? 1 : 0;
        tg.done = present.length > 0 && present.every((a) => a.state === "done") ? 1 : 0;
      }
      if (instant || still) {
        Object.assign(slot.mix, tg);
        R.resolve(look, mixes, slot.active);
      }
    }
    syncCols();
    syncLights();
  }

  function setActorState(id: ActorId, s: ActorState, o?: { instant?: boolean }) {
    const a = actors.get(id);
    if (!a) return;
    const instant = still || !!o?.instant;
    const prev = a.state;
    a.state = s === "arriving" && instant ? "idle" : s;
    a.arriveT = a.state === "arriving" ? 0 : -1;
    a.fig.setState(a.state, instant);
    if (a.state === "arriving" && prev !== "arriving") {
      const p = a.fig.headPoint(_v).sub(_up);
      burst.fire(p.x, 0.6, p.z, a.fig.look.shirt, { power: 0.9, size: 0.07 });
    }
    syncRooms(instant);
  }

  // ── interior light (high: 4 warm column lamps + 1 working-room accent; low: emissive + pools only)
  const warmLights: THREE.PointLight[] = [];
  let workLight: THREE.PointLight | null = null;
  if (q === "high") {
    for (let c = 0; c < 4; c++) {
      const back = ROOMS.find((r) => r.row === "back" && r.col === c)!;
      const l = new THREE.PointLight("#FFC27E", 0, 9, 1.7);
      l.position.set(back.cx + 0.6, 1.9, 0);
      l.name = `lamp:col${c}`;
      root.add(l);
      warmLights.push(l);
    }
    workLight = new THREE.PointLight("#ffffff", 0, 5.2, 1.8);
    workLight.name = "lamp:work";
    root.add(workLight);
  }
  const colOpen = [1, 1, 1, 1];
  const syncCols = () => {
    for (let c = 0; c < 4; c++) {
      let open = 0;
      for (const s of slots.values()) if (s.def.col === c) open += (1 - s.mix.locked) * s.rise;
      colOpen[c] = 0.25 + 0.375 * open;
    }
  };
  let workRoom: Slot | null = null;
  const syncLights = () => {
    const lv = look.lamps * (0.3 + 16 * look.dark * look.dark + 2.5 * look.warm);
    for (let i = 0; i < warmLights.length; i++) warmLights[i]!.intensity = lv * colOpen[i]!;
    if (workLight) {
      let best: Slot | null = null, bw = 0.01;
      for (const s of slots.values()) if (s.def.id !== "lobby" && s.mix.work > bw) (bw = s.mix.work), (best = s);
      if (best && best !== workRoom) {
        workRoom = best;
        const r = best.def;
        workLight.position.set(r.cx + (r.row === "back" ? -1.2 : -1.6), 1.45, r.cz + (r.row === "back" ? -1.1 : 0.2));
        const occupant = [...actors.values()].find((a) => a.room === r.id && a.state !== "absent");
        hexInto(workLight.color, occupant?.fig.look.shirt ?? "#ffffff");
      }
      workLight.intensity = workRoom ? workRoom.mix.work * workRoom.rise * (0.6 + 7 * look.dark) : 0;
    }
  };

  // ── company sign on the lobby wall (dynamic pixel canvas; never the LaunchDesk logo)
  const lobby = ROOM_BY_ID.lobby;
  const signCanvas = new PixelCanvas(128, 40, isPixel());
  const signW = 2.1, signH = signW * (40 / 128);
  const signFace = new THREE.MeshStandardMaterial({ map: signCanvas.tex, emissiveMap: signCanvas.tex, emissive: "#ffffff", emissiveIntensity: 0, roughness: 0.7, transparent: true, alphaTest: 0.5 });
  const signFrameM = new THREE.MeshStandardMaterial({ color: "#1E2229", roughness: 0.5, flatShading: isPixel() });
  const signG = new THREE.Group();
  signG.position.set(lobby.cx - 2.93, 0.84, lobby.cz - 1.28);
  signG.rotation.y = Math.PI / 2;
  const signFrame = new THREE.Mesh(new THREE.BoxGeometry(signW + 0.08, signH + 0.08, 0.05), signFrameM);
  signFrame.position.z = 0.0;
  signFrame.castShadow = true;
  const signPlane = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), signFace);
  signPlane.position.z = 0.027;
  signG.add(signFrame, signPlane);
  signG.userData.keep = true;
  slots.get("lobby")!.holder.add(signG);
  let sign: CompanySign = { kind: "draft", name: "Your idea", color: "#1E2229" };
  function setSign(s: CompanySign) {
    sign = { ...s };
    signCanvas.draw((g, w, h) => drawLobbySign(g, w, h, sign));
    const brand = sign.kind === "brand";
    signFrame.visible = brand;
    hexInto(signFrameM.color, brand ? sign.color || "#1E2229" : "#1E2229").multiplyScalar(0.45);
    syncSignGlow();
  }
  const syncSignGlow = () => {
    signFace.emissiveIntensity = sign.kind === "brand" ? 0.18 + 0.7 * look.dark + 0.25 * look.lamps * look.dark : 0.05 * look.dark;
  };
  setSign(sign);

  // ── effects
  const burst = new CubeBurst(5, 18);
  const papers = new Papers(burst, 6);
  root.add(burst.root, papers.root);
  const trayLocal = new THREE.Vector3(lobby.cx - 1.62, 0.78, lobby.cz - 0.18);
  const _v = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 0.3, 0);

  // ── environment probe (IBL for the office materials)
  root.add(envProbe(R));
  R.resolve(look, mixes);

  // ── boom reveal
  let reveal = 1;
  function setReveal(k: number) {
    reveal = clamp01(k);
    const done = reveal >= 0.999;
    // slab spreads out of the lobby footprint (+ a small pad), then the rooms rise column by column
    const e = done ? 1 : easeOut(win(reveal, 0.02, 0.55));
    const fullW = HALF_X * 2 + SLAB_PAD * 2, fullD = HALF_Z * 2 + SLAB_PAD * 2;
    const sx = (6.6 + (fullW - 6.6) * e) / fullW, sz = (5.6 + (fullD - 5.6) * e) / fullD;
    sharedWrap.scale.set(sx, 1, sz);
    sharedWrap.position.set(lobby.cx * (1 - sx) * (1 - 0) * 1, 0, lobby.cz * (1 - sz));
    sharedWrap.visible = reveal > 0.02;
    for (const s of slots.values()) {
      const r = s.def;
      const t0 = r.id === "lobby" ? 0.1 : 0.28 + r.col * 0.11 + (r.row === "back" ? 0.05 : 0);
      s.rise = done ? 1 : easeOutBack(win(reveal, t0, t0 + 0.3));
      s.holder.scale.set(1, Math.max(0.001, s.rise), 1);
      s.holder.visible = s.rise > 0.005 && reveal > 0.02;
    }
    for (const a of actors.values()) {
      const rise = slots.get(a.room)!.rise;
      a.fig.presence = done ? 1 : win(rise, 0.75, 1);
    }
    syncCols();
    syncLights();
  }

  function applyAtmosphere(a: AtmospherePreset) {
    setFigureAtmosphere(a);
    lookFromAtmosphere(look, a);
    R.resolve(look, mixes);
    syncLights();
    syncSignGlow();
  }

  // ── legacy mapping (v5/v6 world): mia/leo/sam = roster 0/1/2
  const LEGACY_IDX: Partial<Record<Dept, number>> = { mia: 0, leo: 1, sam: 2 };
  const actorOfDept = (d: Dept | "lobby"): ActorId | null =>
    d === "lobby" ? "founder" : (BUILD_TEAM as readonly string[]).includes(d) ? (d as BuildDept) : roster[LEGACY_IDX[d as Dept] ?? -1]?.id ?? null;
  const TO_ACTOR: Record<DeptState, ActorState> = { idle: "idle", working: "working", done: "done", locked: "asleep" };
  const TO_DEPT: Record<ActorState, DeptState> = { absent: "locked", arriving: "working", idle: "idle", working: "working", presenting: "working", done: "done", asleep: "locked" };

  const bounds = new THREE.Box3(new THREE.Vector3(-HALF_X - SLAB_PAD, -0.55, -HALF_Z - SLAB_PAD), new THREE.Vector3(HALF_X + SLAB_PAD, EXT_H, HALF_Z + SLAB_PAD));
  const floorRoomBounds = (fr: FloorRoom) => {
    const r = ROOM_BY_ID[fr];
    return new THREE.Box3(new THREE.Vector3(r.cx - ROOM_W / 2, 0, r.cz - ROOM_D / 2), new THREE.Vector3(r.cx + ROOM_W / 2, 2.0, r.cz + ROOM_D / 2));
  };
  const actorAnchor = (id: ActorId) => {
    const a = actors.get(id);
    return a && a.state !== "absent" ? a.fig.headPoint() : null;
  };

  const model: OfficeModelExt = {
    root,
    style: currentStyle(),
    hints: officeRenderHints,
    bounds: () => bounds.clone(),
    roomBounds: (room: LegacyRoom) => floorRoomBounds(LEGACY_ROOM[room]),
    floorRoomBounds,
    deptState(d) {
      const id = actorOfDept(d);
      return id ? TO_DEPT[actors.get(id)?.state ?? "idle"] : "idle";
    },
    setDeptState(d, s, o) {
      const id = actorOfDept(d);
      if (id) setActorState(id, TO_ACTOR[s], o);
    },
    actorState: (id) => actors.get(id)?.state ?? "absent",
    setRoster,
    setActorState,
    actorAnchor,
    pickActor(ray) {
      const vis = pickers.filter((p) => p.parent?.visible);
      const hit = ray.intersectObjects(vis, false)[0];
      return hit ? (hit.object.userData.actor as ActorId) : null;
    },
    setSign,
    setReveal,
    pulse(id: ActorId, kind: FindingKind) {
      const a = actors.get(id);
      if (!a || a.state === "absent") return;
      a.fig.notice();
      const from = a.fig.handPoint(new THREE.Vector3());
      const to = id === "founder" ? new THREE.Vector3(lobby.cx - 2.8, 0.9, lobby.cz - 1.28) : trayLocal.clone();
      papers.fire(from, to, kind);
    },
    trayPoint: () => trayLocal.clone(),
    applyAtmosphere,
    cheer(room?: LegacyRoom) {
      const fr = room ? LEGACY_ROOM[room] : null;
      for (const a of actors.values()) {
        if (fr && a.room !== fr) continue;
        if (a.state === "absent" || a.state === "asleep") continue;
        a.fig.cheer();
        const p = a.fig.headPoint(_v);
        burst.fire(p.x, 1.0, p.z, a.fig.look.shirt, { power: 0.8 });
      }
    },
    update(dt, t) {
      dt = dt > 0 ? (dt < 0.1 ? dt : 0.1) : 0;
      let busy = !still;
      const k = 1 - Math.exp(-dt * 4.5);
      let moved = false;
      for (const s of slots.values()) {
        const m = s.mix, tg = s.target;
        const dl = tg.locked - m.locked, dw = tg.work - m.work, dd = tg.done - m.done;
        if (Math.abs(dl) + Math.abs(dw) + Math.abs(dd) > 1e-3) {
          m.locked += dl * k;
          m.work += dw * k;
          m.done += dd * k;
          if (Math.abs(dl) + Math.abs(dw) + Math.abs(dd) < 4e-3) Object.assign(m, tg);
          R.resolve(look, mixes, s.active);
          moved = true;
          busy = true;
        }
      }
      if (moved) {
        syncCols();
        syncLights();
      }
      if (!still)
        for (const s of slots.values()) if (s.mix.work > 0.02) R.pulse(s.active, 1 + s.mix.work * (0.22 * Math.sin(t * 2.4 + s.def.col) + 0.08 * Math.sin(t * 7.1)));
      for (const a of actors.values()) {
        if (a.arriveT >= 0) {
          a.arriveT += dt * 1000;
          if (a.arriveT >= ARRIVE_MS) {
            a.arriveT = -1;
            a.state = "idle";
            a.fig.setState("idle");
            syncRooms(false);
          }
        }
        busy = a.fig.update(dt, t, still) || busy;
      }
      if (!still) for (const s of slots.values()) for (const sp of s.variants.get(s.active)?.spinners ?? []) sp.rotation.y += dt * 0.35;
      busy = burst.update(dt) || busy;
      busy = papers.update(dt) || busy;
      return busy;
    },
    pick(ray) {
      const hit = ray.intersectObjects(pickBoxes, false)[0];
      return hit ? LEGACY_OF[hit.object.userData.room as FloorRoom] : null;
    },
    anchor(room: LegacyRoom) {
      const id = actorOfDept(room as Dept | "lobby");
      return (id && actorAnchor(id)) || floorRoomBounds(LEGACY_ROOM[room]).getCenter(new THREE.Vector3()).setY(1.6);
    },
    dispose() {
      for (const a of actors.values()) a.fig.dispose();
      burst.dispose();
      papers.dispose();
      signCanvas.dispose();
      signFace.dispose();
      signFrameM.dispose();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const s of slots.values()) for (const v of s.variants.values()) v.g.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
      pickMat.dispose();
      R.dispose();
      disposeTextures();
    },
  };
  // room picking volumes (invisible)
  const pickBoxes: THREE.Mesh[] = [];
  for (const fr of FLOOR_ROOMS) {
    const r = ROOM_BY_ID[fr];
    const m = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 1.8, ROOM_D), pickMat);
    m.position.set(r.cx, 0.9, r.cz);
    m.userData.room = fr;
    root.add(m);
    pickBoxes.push(m);
  }
  setRoster(roster);
  return model;
}
