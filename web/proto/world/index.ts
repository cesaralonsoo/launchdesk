// WS-B / WS-WORLD · World composition: renderer, lights, sky, fog, diorama base, camera rig, insets framing.
// v7: level 0 = the founder's room (bedroom model on the lobby footprint) → BOOM → level 1 office floor → level 2
// building → level 3 district, capped by the idea's scalability (the next level shows as a dashed ghost with a
// padlock). Pixel-art canvas pass (?pixel=0..2), actors/roster/sign forwarded to the bedroom + office, one world per
// project (setProject crossfades). Contract: WorldV7 in ../contracts.ts. Extras (additive): WorldExtras below.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  BEDROOM_FOOTPRINT, BOOM_MS, BUILD_TEAM, FLOOR_PLAN, READY_ATTR, ROOM_META, levelTransition, readParams, seatOf,
  type ActorId, type ActorState, type Analyst, type AtmospherePreset, type BedroomModel, type ClockMode, type CreateBedroomModel, type CompanySign, type DayClockInfo, type Dept, type DeptState,
  type FindingKind, type FloorRoom, type FocusTarget, type Insets, type Level, type OfficeModel, type OfficeModelV7, type PortfolioItem, type Room, type WorldLevel,
  type WorldOptions, type WorldProject, type WorldV7,
} from "../contracts";
import { createBedroomModel } from "./bedroom";
import { BOOM, createBoomFx } from "./boom";
import { Drift, FOV, applyShot, cloneShot, easeInOut, easeLevel, easeOutward, fitShot, levelAngles, lerpShot, roomAngles, type Shot } from "./camera";
import { createBase } from "./levels/district";
import { createCampus, type Campus } from "./levels/campus";
import { OFFICE_ROOMS, PLATE_Y, createStack, type Stack } from "./levels/stack";
import { createGhost, type GhostKind } from "./levels/ghost";
import { Y0, clamp01, disposeFacades, win } from "./levels/kit";
import type { Palette } from "./levels/palette";
import { FLOORS, FLOOR_H } from "./levels/tower";
import { createOfficeModel, type OfficeModelExt } from "./office";
import { DayClock, clockInfo, createDayCycle, type DayState } from "./daycycle";
import { createPixelPass, readPixelMode, type PixelMode } from "./pixel";
import { createSky } from "./sky";
import type { Area, OfficeRoomId, RoomState, WorldV8 } from "./api-v8";

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
  /** v6: past projects in the district — screen points (CSS px) above each portfolio building, for DOM labels. Empty below level 3. */
  portfolioScreenPoints(): { id: string; x: number; y: number }[];
  /** v6: the clock mode currently in force (cycle or fixed). */
  clockMode(): ClockMode;
  /** Debug handles for scripts (not for product code). */
  readonly debug: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; key: THREE.DirectionalLight; state(): unknown };
  // ── v7 extras
  /** Screen point (CSS px) of the padlock over the locked-level ghost, for a "why it stops here" tag. null = no ghost. */
  ghostScreenPoint(): { x: number; y: number } | null;
  /** Which ghost is showing (the level a bigger idea would unlock), or null. */
  ghostLevel(): WorldLevel | null;
  /** Current pixel-art mode (?pixel=0..2) and a live switch. */
  readonly pixel: PixelMode;
  setPixel(m: PixelMode): void;
  /** Screenshot helper: pose the 0 → 1 boom at `ms` (0…BOOM_MS), no animation. */
  debugBoom(ms: number): void;
  readonly levelCap: WorldLevel;
}

/** v7 options (additive): `worldLevel` (initial, default `level` ?? 1) and `pixel` (default ?pixel= or 1). */
export type WorldOptionsV7 = WorldOptions & { worldLevel?: WorldLevel; pixel?: PixelMode; /** dev: inject a room model (harness) */ createBedroom?: CreateBedroomModel };
export type WorldX = WorldV7 & WorldExtras & WorldV8;
type Office = OfficeModelExt;
void (null as unknown as OfficeModel & Partial<OfficeModelV7>);

/** Floor rooms → v6 office rooms (same 4 × 2 grid) — used only while the office has no v7 methods. */
const FLOOR_TO_ROOM: Record<FloorRoom, Room> = { r0: "mia", r1: "leo", r2: "sam", r3: "nova", lobby: "lobby", nova: "dex", dex: "rae", launch: "pip" };
const ROOM_TO_FLOOR = Object.fromEntries(Object.entries(FLOOR_TO_ROOM).map(([f, r]) => [r, f])) as Record<Room, FloorRoom>;
const STATE_V6: Record<ActorState, DeptState> = { absent: "locked", arriving: "working", idle: "idle", working: "working", presenting: "working", done: "done", asleep: "locked" };
const GHOST_FOR: Record<number, GhostKind> = { 0: "floor", 1: "tower", 2: "district" };
/** The office root's resting transform (identity). Framing and ghosts use it, never the mid-boom scale. */
const OFFICE_REST = new THREE.Matrix4();

/** city = planned massing rising, solid = its clay goes from ghost to solid (both 0 at level 2, 1 at level 3). */
type Growth = { tower: number; ground: number; city: number; solid: number };
// v8: tower = the offices floor of the exploded stack (wl 2) · city = the campus (wl 3, replaces floor + stack).
// No streets, no diorama slab (ground stays 0).
const GROWTH: Record<Level, Growth> = {
  1: { tower: 0, ground: 0, city: 0, solid: 0 },
  2: { tower: 1, ground: 0, city: 0, solid: 0 },
  3: { tower: 0, ground: 0, city: 1, solid: 1 },
};
const BACK_ROW: readonly FloorRoom[] = ["r0", "r1", "r2", "r3"];
const FRONT_ROW: readonly FloorRoom[] = ["nova", "dex", "launch"];
/** The dashed offices plate above floor 1 (same footprint, slab 7.25..7.5). */
const PLATE_BOX = new THREE.Box3(new THREE.Vector3(-12.45, PLATE_Y - 0.25, -6.25), new THREE.Vector3(12.45, PLATE_Y, 6.25));
const EXAMPLE_ID = "ex-coffee-bcn";
type Showcase = "example" | "yours";

/** v7: returns the WorldV7 directly (the tech-lead adapter in v7.ts is now a pass-through). */
export const createWorld = (host: HTMLElement, opts: WorldOptionsV7): WorldX => createWorldX(host, opts);

export function createWorldX(host: HTMLElement, opts: WorldOptionsV7): WorldX {
  const q = new URLSearchParams(location.search);
  const high = opts.quality === "high";
  const reduced = !!opts.reducedMotion;
  const pixelMode: PixelMode = opts.pixel ?? readPixelMode();

  // ── renderer: transparent canvas over a CSS sky gradient on the host
  const renderer = new THREE.WebGLRenderer({ antialias: high && pixelMode === 0, alpha: true, powerPreference: "high-performance" });
  const pixel = createPixelPass(renderer, { mode: pixelMode, quality: opts.quality });
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
  const officeOpts = { quality: opts.quality, still: reduced };
  const office = createOfficeModel(officeOpts) as Office;
  scene.add(office.root);
  // v7 level 0: the founder's room sits exactly on the lobby footprint (office-root coordinates)
  const bedroom: BedroomModel = (opts.createBedroom ?? createBedroomModel)({ quality: opts.quality, still: reduced });
  bedroom.root.position.set(BEDROOM_FOOTPRINT.cx, 0, BEDROOM_FOOTPRINT.cz);
  scene.add(bedroom.root);
  const fx = createBoomFx();
  scene.add(fx.root);

  // lazily built levels
  let tower: Stack | null = null;
  let district: Campus | null = null;
  const growth: Growth = { ...GROWTH[1] };
  function ensureLevels() {
    if (tower && district) return;
    tower = createStack({ quality: opts.quality, env });
    district = createCampus({ quality: opts.quality, env });
    scene.add(tower.root, district.ground, district.city);
    tower.applyPalette(pal);
    district.applyPalette(pal);
    if (officesState) tower.setOffices(officesState.rooms, { sample: officesState.sample });
    if (campusItems) district.setCampus(campusItems);
    paintGrowth();
  }
  function paintGrowth() {
    base.setPresence(0); // v8: no diorama slab at any level
    const campusOn = growth.city >= 0.5;
    office.root.visible = !campusOn;
    if (!tower || !district) {
      paintPlate();
      return;
    }
    tower.setGrowth(campusOn ? 0 : growth.tower);
    district.setCity(growth.city);
    paintPlate();
  }

  // celebration rings on the office floor (paid at the lobby, live at Pip's room; v8: one per unlocked room)
  const ringGeo = new THREE.RingGeometry(0.92, 1, 64);
  const rings = Array.from({ length: 5 }, () => {
    const mat = new THREE.MeshBasicMaterial({ color: "#0AC18E", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, mat, t: -1 };
  });
  const ring = rings[0]!.mesh;
  void ring;

  // where the work happens: one soft light in the working department's colour (created at 0 so no recompiles)
  const workLight = new THREE.PointLight("#ffffff", 0, 9, 1.4);
  workLight.position.set(0, 2.6, 0);
  scene.add(workLight);
  let workTarget = 0;
  const deptStates = new Map<Dept, DeptState>();

  // ── state
  /** v7 world level actually built (≤ cap) · `asked` = what the flow asked for (> wl ⇒ the ghost of wl+1 shows). */
  // v8: the founder's room (wl 0) is never entered any more: every level request is clamped to ≥ 1
  let wl: WorldLevel = Math.max(1, opts.worldLevel ?? opts.level ?? 1) as WorldLevel;
  let asked: WorldLevel = wl;
  let cap: WorldLevel = 3;
  /** v6 growth level (the room is drawn on top of a level-1 growth state). */
  let level: Level = Math.max(1, wl) as Level;
  let insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
  let focusT: Focus = "overview";
  let w = 1, h = 1;
  const cur: Shot = { target: new THREE.Vector3(), dist: 60, yaw: 0.6, pitch: 0.7 };
  type Anim = { from: Shot; to: Shot; t0: number; ms: number; ease: (k: number) => number; arc: number; done: () => void; g0?: Growth; g1?: Growth; up?: boolean };
  let anim: Anim | null = null;
  let builtAnim: { from: number; to: number; t0: number; ms: number; done: () => void } | null = null;
  let builtK = q.get("built") === "0" ? 0 : 1; // v6: the district is a real (built, lit) city by default
  let beacon = false;
  let portfolio: PortfolioItem[] = [];
  const _pp = new THREE.Vector3();
  let pendingSweep = false;
  const drift = new Drift();
  drift.enabled = !reduced;
  const clickCbs = new Set<(r: Room) => void>();
  const actorCbs = new Set<(id: ActorId) => void>();
  let roster: readonly Analyst[] = [];
  const actorStates = new Map<ActorId, ActorState>();
  let sign: CompanySign | null = null;
  // ── v8 state
  /** No-go (cap 0): the floor stays, the offices plate goes. The cap gates nothing else. */
  let noGo = false;
  let officesState: { rooms: { id: OfficeRoomId; state: "off" | "working" | "done"; results: number }[]; sample: boolean } | null = null;
  let campusItems: Parameters<WorldV8["setCampus"]>[0] | null = null;
  let showcase: Showcase = "yours";
  /** What the flow/game asked for (the user's own company); shown in "yours", kept aside while the example shows. */
  const mine = {
    roster: [] as Analyst[],
    actors: new Map<ActorId, ActorState>(),
    sign: null as CompanySign | null,
    rooms: new Map<FloorRoom, RoomState>(),
    screen: { img: null as HTMLCanvasElement | null, line: "" },
  };
  let paused = false;
  let framesDrawn = 0;
  const pickCbs = new Set<(id: string) => void>();
  /** 0 = the room is intact and the floor hidden · 1 = the floor is complete and the room gone. */
  let boomK = wl === 0 ? 0 : 1;
  let boom: { t0: number; from: Shot; done: () => void } | null = null;
  let fade: { t0: number; ms: number; mid: (() => void) | null; done: () => void } | null = null;
  const ghost = createGhost(
    {
      floor: () => {
        const rooms = (Object.keys(FLOOR_PLAN) as FloorRoom[]).filter((r) => r !== "lobby");
        return rooms.map((r) => floorBounds(r).applyMatrix4(OFFICE_REST));
      },
      tower: () => [new THREE.Box3(new THREE.Vector3(-13.5, FLOOR_H - 0.55, -7.2), new THREE.Vector3(13.5, FLOORS * FLOOR_H - 0.55, 7.2))],
      district: () => [],
      plate: () => [PLATE_BOX.clone()],
    },
    { reduced },
  );
  scene.add(ghost.root);
  const camCbs = new Set<() => void>();

  // ── atmosphere = day cycle (lighting, sky, fog, palettes) × base preset (office surfaces, accent strength)
  const n = (a: number, b: number, k: number) => a + (b - a) * k;
  const P = readParams();
  const cycle = createDayCycle();
  const startMode: ClockMode = P.time != null ? { mode: "fixed", t: P.time } : { mode: "cycle", periodSec: P.cycle ?? 1800, startAt: 0.64 };
  const clock = new DayClock(performance.now(), startMode, reduced && P.time == null);
  let baseAtm: AtmospherePreset = opts.atmosphere;
  let day: DayState = cycle.sample(clock.value(performance.now()));
  let pal: Palette = day.palette;
  const sky = createSky(host);
  /** What the office receives (≤ 10 Hz). Extra fields beyond AtmospherePreset: lightLevel/daylight/warmth (0..1). */
  type OfficeAtm = AtmospherePreset & { lightLevel: number; daylight: number; warmth: number; clockT: number };
  const officeAtm: OfficeAtm = {
    ...opts.atmosphere, sky: ["#000000", "#000000"], fog: { color: "#000000", near: 60, far: 220 }, key: { ...opts.atmosphere.key }, ambient: { ...opts.atmosphere.ambient },
    lightLevel: 0, daylight: 1, warmth: 0, clockT: 0.5,
  };
  const info: DayClockInfo = { t: 0.5, name: "day", daylight: 1, warmth: 0 };
  const clockCbs = new Set<(i: DayClockInfo) => void>();
  let lastSlow = -1e9;
  let fogNear = 60, fogFar = 220;
  const hex = (c: THREE.Color) => `#${c.getHexString()}`;
  // office surfaces follow the day: Graphite by day, Ivory at golden hour, Midnight at night (blended, ≤ 10 Hz)
  const SURF = {
    day: { floor: "#F2F3F5", wall: "#FAFAFB", slab: "#D5DAE1", glass: "#DDEBFA", corridor: "#E9ECF0" },
    golden: { floor: "#F2EFEA", wall: "#FBFAF8", slab: "#C9C3BA", glass: "#E8EEF2", corridor: "#E9E4DC" },
    night: { floor: "#D9D4CB", wall: "#E7E3DC", slab: "#2A3140", glass: "#9DB7D8", corridor: "#CFCAC1" },
  } as const;
  type SurfKey = keyof typeof SURF.day;
  const surfC = Object.fromEntries((Object.keys(SURF) as (keyof typeof SURF)[]).map((k) => [k, Object.fromEntries((Object.keys(SURF[k]) as SurfKey[]).map((f) => [f, new THREE.Color(SURF[k][f])]))])) as Record<keyof typeof SURF, Record<SurfKey, THREE.Color>>;
  const _sc = new THREE.Color();
  const surfOut: Record<SurfKey, string> = { ...SURF.day };
  function surfacesAt(s: DayState) {
    // interiors stay in their day colours until the light really goes (daylight < 0.45): dusk = warm lamps against a pink sky
    const x = Math.min(1, s.daylight / 0.45), warm = Math.min(1, s.warmth * 1.1), dl = x * x * (3 - 2 * x);
    for (const f of Object.keys(surfOut) as SurfKey[]) {
      _sc.copy(surfC.day[f]).lerp(surfC.golden[f], warm);
      _sc.lerp(surfC.night[f], 1 - dl);
      surfOut[f] = hex(_sc);
    }
    return surfOut;
  }

  /** Per frame: lights, fog, exposure. Cheap and allocation-free. */
  function paintLights(s: DayState) {
    hemi.color.copy(s.ambSky);
    hemi.groundColor.copy(s.ambGround);
    hemi.intensity = s.ambI;
    key.color.copy(s.keyColor);
    key.intensity = s.keyI;
    keyDir.copy(s.keyDir);
    fillDir.set(-keyDir.x, 0.6, -keyDir.z).normalize();
    fill.color.copy(hemi.color).lerp(moonFill, s.night);
    fill.intensity = 0.28 + 0.4 * s.night; // moonlight keeps night shapes readable
    renderer.toneMappingExposure = s.exposure;
    if (!scene.fog) scene.fog = new THREE.Fog(0xffffff, 60, 220);
    (scene.fog as THREE.Fog).color.copy(s.fog);
    fogNear = s.fogNear;
    fogFar = s.fogFar;
  }
  const moonFill = new THREE.Color("#8FA6CC");

  /** ≤ 10 Hz: level palettes, CSS sky, office atmosphere, clock listeners. */
  function paintSlow(s: DayState) {
    base.applyPalette(pal);
    tower?.applyPalette(pal);
    district?.applyPalette(pal);
    sky.paint(s, camera);
    const o = officeAtm;
    o.timeOfDay = s.daylight < 0.32 ? "night" : s.warmth > 0.5 ? "golden" : baseAtm.timeOfDay === "studio" && s.daylight > 0.95 ? "studio" : "day";
    o.sky = [hex(s.skyTop), hex(s.skyBottom)];
    o.fog = { color: hex(s.fog), near: s.fogNear, far: s.fogFar };
    o.key = { color: hex(s.keyColor), intensity: s.keyI, azimuth: s.sunEl > 0 ? s.sunAz : -32, elevation: s.sunEl > 0 ? Math.max(6, s.sunEl) : 48, shadows: true };
    o.ambient = { sky: hex(s.ambSky), ground: hex(s.ambGround), intensity: s.ambI };
    o.ground = hex(s.ground);
    o.exposure = s.exposure;
    o.surfaces = surfacesAt(s);
    o.accentStrength = baseAtm.accentStrength;
    o.lightsOn = s.lights > 0.3;
    o.lightLevel = s.lights;
    o.daylight = s.daylight;
    o.warmth = s.warmth;
    o.clockT = s.t;
    office.applyAtmosphere(o);
    bedroom.applyAtmosphere(o);
    ghost.setClay(pal.clay, s.night);
    pixel.setInk(s.night);
    clockInfo(s, info);
    for (const cb of clockCbs) cb(info);
  }

  let lastT = -1, slowT = -1;
  function stepDay(now: number, force = false) {
    const t = clock.value(now);
    if (!force && t === lastT) {
      // clock at rest: settle the last slow paint once, then only the sky glow follows the camera
      if (slowT !== t && now - lastSlow >= 100) {
        lastSlow = now;
        slowT = t;
        paintSlow(day);
      } else if (camMoved && now - lastSlow >= 100) {
        lastSlow = now;
        sky.paint(day, camera);
      }
      return;
    }
    lastT = t;
    day = cycle.sample(t);
    pal = day.palette;
    paintLights(day);
    if (force || (now - lastSlow >= 100 && t !== slowT)) {
      lastSlow = now;
      slowT = t;
      paintSlow(day);
    }
  }
  let camMoved = false;
  const keyDir = new THREE.Vector3(0.5, 0.8, 0.5), fillDir = new THREE.Vector3();
  let lightsChanged = true;

  function setAtmosphere(a: AtmospherePreset) {
    baseAtm = a;
    key.castShadow = high && a.key.shadows;
    stepDay(performance.now(), true);
  }

  // ── framing
  /** Focus key: a v6 room / "overview", or `actor:<id>` (v7 focusActor). */
  type Focus = FocusTarget | `actor:${string}` | `area:${string}`;
  function floorBounds(r: FloorRoom): THREE.Box3 {
    return (office.floorRoomBounds ? office.floorRoomBounds(r) : office.roomBounds(FLOOR_TO_ROOM[r])).clone();
  }
  function bedroomWorld(b: THREE.Box3) {
    bedroom.root.updateMatrixWorld(true);
    return b.applyMatrix4(bedroom.root.matrixWorld);
  }
  /** Framing box of one actor at the current world level. */
  function actorBox(id: ActorId): THREE.Box3 {
    if (wl === 0) return bedroomWorld(bedroom.focusBounds(id).clone());
    const seat = seatOf(id, roster, 1);
    return floorBounds(seat.room as FloorRoom).applyMatrix4(OFFICE_REST);
  }
  /** v8: the camera frames the built level (no ghost levels: the cap gates nothing). */
  const viewLevel = (): WorldLevel => wl;
  const portraitNow = () => w / h < 0.85;
  /** Is the dashed offices plate part of the picture (floor level, not a No-go, the stack not grown)? */
  const plateWanted = () => wl === 1 && !noGo && !anim?.g1?.tower;
  function boxFor(t: FocusTarget, lv: Level | 0): THREE.Box3 | THREE.Vector3[] {
    if (t !== "overview") return office.roomBounds(t).clone().applyMatrix4(OFFICE_REST);
    if (lv === 0) return bedroomWorld(bedroom.bounds().clone());
    if (lv === 1) {
      const b = office.bounds().clone().applyMatrix4(OFFICE_REST);
      return plateWanted() ? b.union(PLATE_BOX) : b;
    }
    ensureLevels();
    if (lv === 2) return portraitNow() ? tower!.upperBounds() : tower!.bounds();
    return district!.framePoints();
  }
  /** v8 area boxes (world space) for camera shots. */
  function areaBox(a: string): THREE.Box3 | null {
    const rows = (ids: readonly FloorRoom[]) => ids.reduce((b, r) => b.union(floorBounds(r).applyMatrix4(OFFICE_REST)), new THREE.Box3());
    if (a === "wing:back") return rows(BACK_ROW).expandByVector(new THREE.Vector3(0.3, 0, 0.3));
    if (a === "wing:front") return rows(FRONT_ROW).expandByVector(new THREE.Vector3(0.3, 0, 0.3));
    if (a === "plate") return PLATE_BOX.clone().union(office.bounds().clone().applyMatrix4(OFFICE_REST).setFromCenterAndSize(new THREE.Vector3(0, 1.9, 0), new THREE.Vector3(24.9, 0.2, 12.5)));
    if (a.startsWith("room:")) return floorBounds(a.slice(5) as FloorRoom).applyMatrix4(OFFICE_REST).expandByVector(new THREE.Vector3(0.8, 0, 0.8));
    if (a.startsWith("office:")) {
      ensureLevels();
      return tower!.roomBox(a.slice(7) as OfficeRoomId).expandByVector(new THREE.Vector3(0.6, 0, 0.6));
    }
    if (a.startsWith("plot:")) {
      ensureLevels();
      return district!.plotBox(a.slice(5));
    }
    return null;
  }
  function shotOf(t: Focus, lv: WorldLevel = viewLevel()): Shot {
    const aspect = w / h;
    if (t.startsWith("area:")) {
      const b = areaBox(t.slice(5));
      if (b) {
        const c = b.getCenter(new THREE.Vector3());
        const a = t.slice(5);
        const ang = a.startsWith("office:") ? levelAngles(2, aspect) : a.startsWith("plot:") ? levelAngles(3, aspect) : a === "plate" ? levelAngles(1, aspect) : roomAngles(c.x, aspect);
        return fitShot(b, ang.yaw, ang.pitch, w, h, insets, a.startsWith("room:") || a.startsWith("office:") ? 0.12 : 0.07);
      }
      t = "overview";
    }
    if (t.startsWith("actor:")) {
      const id = t.slice(6) as ActorId;
      const b = actorBox(id).expandByVector(new THREE.Vector3(wl === 0 ? 0.35 : 0.8, 0, wl === 0 ? 0.35 : 0.8));
      const c = b.getCenter(new THREE.Vector3());
      const ang = wl === 0 ? levelAngles(0, aspect) : roomAngles(c.x, aspect);
      return fitShot(b, ang.yaw, ang.pitch - (wl === 0 ? THREE.MathUtils.degToRad(4) : 0), w, h, insets, 0.12);
    }
    if (t !== "overview" && wl === 0) t = "overview"; // rooms only exist on the floor
    if (t !== "overview") {
      const b = (boxFor(t as FocusTarget, 1) as THREE.Box3).expandByVector(new THREE.Vector3(0.8, 0, 0.8));
      const c = b.getCenter(new THREE.Vector3());
      const ang = roomAngles(c.x, aspect);
      return fitShot(b, ang.yaw, ang.pitch, w, h, insets, 0.12);
    }
    const ang = levelAngles(lv, aspect);
    return fitShot(boxFor("overview", lv as Level | 0), ang.yaw, ang.pitch, w, h, insets, lv === 0 ? 0.1 : lv === 1 ? 0.06 : 0.04);
  }

  let pose = { dYaw: 0, dPitch: 0 };
  const _lx = new THREE.Vector3(), _ly = new THREE.Vector3(), _lz = new THREE.Vector3(), _snap = new THREE.Vector3();
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
    // texel-snapped shadow camera: the frustum moves in whole shadow-map texels in light space, so shadows never
    // shimmer while the camera drifts; the sun itself turns slowly enough (≤ 0.4°/s at the default 240 s day).
    const texel = (2 * ext) / key.shadow.mapSize.x;
    _lz.copy(keyDir);
    _lx.set(0, 1, 0).cross(_lz);
    if (_lx.lengthSq() < 1e-6) _lx.set(1, 0, 0);
    _lx.normalize();
    _ly.crossVectors(_lz, _lx);
    const sx = Math.round(cur.target.dot(_lx) / texel) * texel, sy = Math.round(cur.target.dot(_ly) / texel) * texel, sz = cur.target.dot(_lz);
    _snap.set(0, 0, 0).addScaledVector(_lx, sx).addScaledVector(_ly, sy).addScaledVector(_lz, sz);
    key.position.copy(_snap).addScaledVector(keyDir, cur.dist + ext + 40);
    key.target.position.copy(_snap);
    fill.position.copy(cur.target).addScaledVector(fillDir, 50);
    fill.target.position.copy(cur.target);
    const sc = key.shadow.camera;
    if (sc.right !== ext || lightsChanged) {
      Object.assign(sc, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: cur.dist + ext * 3 + 120 });
      sc.updateProjectionMatrix();
      lightsChanged = false;
    }
    camMoved = !lastCam.equals(camera.matrixWorld);
    if (camMoved) {
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
        tower: n(g0.tower, g1.tower, win(k, 0.02, 0.68)),
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
    pixel.resize(w, h);
    sky.setPixel(pixel.cssPx);
    ghost.setViewport(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (anim) anim.to = shotOf(focusT);
    else if (!boom) void go(shotOf(focusT), { animate: false });
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // ── v7: the room ↔ floor reveal (boom), level snaps and crossfades
  const G = (lv: WorldLevel) => GROWTH[Math.max(1, lv) as Level];
  const LOBBY = new THREE.Vector3(BEDROOM_FOOTPRINT.cx, 0, BEDROOM_FOOTPRINT.cz);
  /** Floor reveal: the office's own setReveal, or (until WS-OFFICE lands it) a slab that spreads out of the room. */
  function revealOffice(k: number) {
    if (office.setReveal) {
      office.root.visible = true;
      office.setReveal(k);
      return;
    }
    office.root.visible = k > 0.001;
    if (k >= 1) {
      office.root.scale.set(1, 1, 1);
      office.root.position.set(0, 0, 0);
      return;
    }
    const e = easeOutward(win(k, 0, 0.6)), up = easeOutBack(win(k, 0.3, 0.7));
    const sx = n(6 / 24.9, 1, e), sz = n(5 / 12.5, 1, e);
    office.root.scale.set(sx, n(0.02, 1, up), sz);
    office.root.position.set(LOBBY.x * (1 - sx), 0, LOBBY.z * (1 - sz));
  }
  function applyBoom(roomK: number, floorK: number) {
    bedroom.setBoom(roomK);
    bedroom.root.visible = roomK < 0.999;
    revealOffice(floorK);
  }
  /** Snap every level-dependent piece to `lv` (no animation). */
  function snapLevel(lv: WorldLevel) {
    boom = null;
    fx.clear();
    wl = lv;
    level = Math.max(1, lv) as Level;
    boomK = lv === 0 ? 0 : 1;
    applyBoom(lv === 0 ? 0 : 1, lv === 0 ? 0 : 1);
    paintPlate(false);
  }
  /** Crossfade the canvas (the CSS sky stays): out, `mid()` snaps the new state, in. */
  function crossfade(ms: number, mid: () => void): Promise<void> {
    if (fade) {
      fade.mid?.();
      fade.done();
    }
    if (reduced && ms > 400) ms = 400;
    return new Promise((done) => {
      fade = { t0: performance.now(), ms, mid, done };
      document.documentElement.dataset.busy = "1";
    });
  }
  function founderPoint(): THREE.Vector3 | null {
    const a = bedroom.actorAnchor("founder");
    return a ? bedroom.root.localToWorld(a.clone()) : null;
  }
  function startBoom(): Promise<void> {
    if (anim) {
      const d = anim.done;
      anim = null;
      d();
    }
    const colors = ["#F2E6D3", "#E9DCC6", "#C9A27A", "#8C6A4F", "#0AC18E", "#FFFFFF", ...roster.map((a) => a.color)];
    fx.arm(LOBBY.clone().add(office.root.position), { x: BEDROOM_FOOTPRINT.w / 2, z: BEDROOM_FOOTPRINT.d / 2 }, founderPoint(), colors);
    return new Promise((done) => {
      boom = { t0: performance.now(), from: cloneShot(cur), done };
      document.documentElement.dataset.busy = "1";
    });
  }
  const _shake = new THREE.Vector3();
  let boomTo: Shot | null = null;
  /** Deterministic boom pose at `ms` (also used by debugBoom). */
  function poseBoom(ms: number, from: Shot) {
    const roomK = easeInOut(win(ms, BOOM.roomFrom, BOOM.roomLen));
    const floorK = win(ms, BOOM.floorFrom, BOOM.floorLen);
    boomK = floorK;
    applyBoom(roomK, floorK);
    fx.pose(ms);
    // camera: a short push-in (anticipation), then one smooth pull to the floor overview
    boomTo = shotOf("overview", Math.max(1, viewLevel()) as WorldLevel);
    const kc = win(ms, BOOM.camFrom, BOOM.camLen);
    lerpShot(from, boomTo, easeOutward(kc), cur, 0.05);
    const pre = ms < BOOM.pre ? Math.sin((ms / BOOM.pre) * Math.PI * 0.5) : Math.max(0, 1 - (ms - BOOM.pre) / 260);
    cur.dist *= 1 - 0.045 * pre;
    if (!reduced) cur.target.add(fx.shake(ms, _shake));
  }
  function finishBoom() {
    if (!boom) return;
    const d = boom.done;
    boom = null;
    fx.clear();
    boomK = 1;
    applyBoom(1, 1);
    if (boomTo) {
      cur.target.copy(boomTo.target);
      cur.dist = boomTo.dist;
      cur.yaw = boomTo.yaw;
      cur.pitch = boomTo.pitch;
    }
    void go(shotOf(focusT), { animate: false });
    d();
  }

  /**
   * v8: floor (1) ↔ offices stack (2) is one camera move while floor 2 slides down into place; anything to or from the
   * campus (3) crossfades (it replaces the office). The cap never gates a level (cap 0 = No-go only hides the plate).
   */
  function setWorldLevel(l: WorldLevel, o?: { animate?: boolean }): Promise<void> {
    const animate = (o?.animate ?? true) && !reduced;
    const target = Math.max(1, Math.min(3, l)) as WorldLevel;
    const from = wl;
    if (boom) finishBoom();
    asked = target;
    if (!focusT.startsWith("area:") || from !== target) focusT = "overview";
    if (target !== 1) office.setDim(null);
    if (from === target || (from !== 3 && target !== 3)) {
      wl = target;
      level = target as Level;
      paintPlate();
      const ms = from === target ? 1100 : 1500;
      const ease = from === target ? easeInOut : target > from ? easeOutward : easeLevel;
      return go(shotOf(focusT, target), { animate, ms, ease, growthTo: G(target) });
    }
    const apply = () => {
      snapLevel(target);
      setGrowthNow(G(target));
      paintPlate();
      void go(shotOf("overview"), { animate: false });
    };
    if (!(o?.animate ?? true)) {
      apply();
      return Promise.resolve();
    }
    return crossfade(reduced ? 400 : 700, apply);
  }
  /** The dashed offices plate: floor level only, never on a No-go, never while the real offices floor shows. */
  function paintPlate(animate = true) {
    // a wing or room close-up hides it (its dashes would cut across the rooms); the overview and "plate" show it
    const close = focusT !== "overview" && focusT !== "area:plate";
    const on = wl === 1 && !noGo && !close && growth.tower < 0.02 && growth.city < 0.5;
    ghost.show(on ? "plate" : null, animate && !reduced);
  }

  // ── input: clicks on rooms / actors, pointer parallax
  const ray = new THREE.Raycaster();
  const rayAt = (x: number, y: number) => ray.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), camera);
  const toRoom = (x: number, y: number): Room | null => {
    if (wl !== 1 || boom) return null;
    rayAt(x, y);
    return office.pick(ray);
  };
  const toActor = (x: number, y: number): ActorId | null => {
    if (boom || wl > 1) return null;
    rayAt(x, y);
    if (wl === 0) return bedroom.pickActor(ray);
    if (office.pickActor) return office.pickActor(ray);
    const room = office.pick(ray);
    if (!room) return null;
    const fr = ROOM_TO_FLOOR[room];
    if (fr === "lobby") return "founder";
    if (fr === "nova" || fr === "dex") return fr;
    if (fr === "launch") return "pip";
    return roster[+fr.slice(1)]?.id ?? null;
  };
  const onClick = (e: MouseEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (pickCbs.size) {
      const id = pickAt(x, y);
      if (id) for (const cb of pickCbs) cb(id);
    }
    const room = toRoom(x, y);
    if (room) for (const cb of clickCbs) cb(room);
    if (actorCbs.size) {
      const id = toActor(x, y);
      if (id) for (const cb of actorCbs) cb(id);
    }
  };
  renderer.domElement.addEventListener("click", onClick);
  const onMove = (e: PointerEvent) => drift.pointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  window.addEventListener("pointermove", onMove, { passive: true });

  // ── loop
  let raf = 0, last = performance.now(), first = true;
  const clock0 = performance.now();
  const tick = (now: number) => {
    if (paused) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
    // rAF timestamps can run behind performance.now() (boot, resume): never step backwards (a negative dt made the
    // work light's ease diverge into a huge negative light that blew the lobby out to white)
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = Math.max(last, now);
    const t = (now - clock0) / 1000;
    stepDay(now);
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
    if (boom) {
      const ms = now - boom.t0;
      if (ms >= BOOM_MS) finishBoom();
      else poseBoom(ms, boom.from);
    }
    if (fade) {
      const k = Math.min(1, (now - fade.t0) / fade.ms);
      if (k >= 0.5 && fade.mid) {
        const m = fade.mid;
        fade.mid = null;
        m();
      }
      renderer.domElement.style.opacity = (k < 0.5 ? 1 - 2 * k : 2 * k - 1).toFixed(3);
      if (k >= 1) {
        const d = fade.done;
        fade = null;
        renderer.domElement.style.opacity = "";
        d();
      }
    }
    const [dy, dp] = drift.step(dt, t);
    pose = { dYaw: dy, dPitch: dp };
    sync();
    if (office.root.visible) office.update(dt, t);
    if (bedroom.root.visible) bedroom.update(dt, t);
    ghost.update(dt, t);
    if (!office.root.visible || growth.city > 0) workLight.intensity = 0; // the floor's work light never shines on the campus
    else if (Math.abs(workLight.intensity - workTarget) > 1e-3) workLight.intensity += (workTarget - workLight.intensity) * (reduced ? 1 : 1 - Math.exp(-dt * 3));
    tower?.update(dt, t);
    district?.update(dt, reduced ? 0 : t);
    for (const r of rings) {
      if (r.t < 0) continue;
      const k = Math.min(1, (now - r.t) / 800); // wall clock: always gone before the camera leaves the lobby
      r.mesh.scale.setScalar(0.4 + (1 - Math.pow(1 - k, 3)) * 2.6);
      r.mat.opacity = (1 - k) * (1 - k) * 0.6;
      if (k >= 1) {
        r.t = -1;
        r.mesh.visible = false;
      }
    }
    pixel.render(scene, camera);
    framesDrawn++;
    document.documentElement.dataset.busy = anim || builtAnim || boom || fade || rings.some((r) => r.t >= 0) ? "1" : "0";
    if (first) {
      first = false;
      document.documentElement.setAttribute(READY_ATTR, "1");
      // pre-build levels 2/3 while the user reads the idea popup, so the first pull-back never hitches
      const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1200));
      idle(() => {
        ensureLevels();
        // warm every program the boom and the levels will need (hidden objects are skipped by compile)
        const vis = [office.root, bedroom.root, fx.root, ghost.root, tower!.root, district!.ground, district!.city, base.root].map((o) => [o, o.visible] as const);
        for (const [o] of vis) o.visible = true;
        try {
          pixel.compile(scene, camera);
        } finally {
          for (const [o, v] of vis) o.visible = v;
        }
      });
    }
  };

  // ── boot
  resize();
  setAtmosphere(opts.atmosphere);
  snapLevel(wl);
  setGrowthNow(G(wl));
  void go(shotOf("overview"), { animate: false });
  raf = requestAnimationFrame(tick);

  function pulseAt(room: Room) {
    ringAt(office.roomBounds(room).clone().applyMatrix4(OFFICE_REST));
  }
  /** One expanding green ring on the floor of a box (a free ring from the pool, else the oldest). */
  function ringAt(b: THREE.Box3) {
    const c = b.getCenter(new THREE.Vector3());
    const r = rings.find((x) => x.t < 0) ?? rings.reduce((a, x) => (x.t < a.t ? x : a));
    r.mesh.position.set(c.x, b.min.y + 0.03, c.z);
    r.mat.color.copy(pal.money);
    r.mesh.visible = true;
    r.t = performance.now();
  }
  const toScreen = (p: THREE.Vector3, m = 1.05) => {
    p.project(camera);
    if (p.z > 1 || Math.abs(p.x) > m || Math.abs(p.y) > m) return null;
    return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
  };
  /** Work light over whoever is working on the floor (v6 dept rooms or v7 actors). */
  function paintWorkLight() {
    let box: THREE.Box3 | null = null, color = "#ffffff";
    const v7 = [...actorStates].find(([, st]) => st === "working");
    if (v7 && wl >= 1) {
      const [id] = v7;
      box = floorBounds(seatOf(id, roster, 1).room as FloorRoom).applyMatrix4(OFFICE_REST);
      color = id === "founder" ? "#0AC18E" : (BUILD_TEAM as readonly string[]).includes(id) ? ROOM_META[id as Dept].color : roster.find((a) => a.id === id)?.color ?? "#ffffff";
    } else {
      const working = [...deptStates].find(([, st]) => st === "working")?.[0];
      if (working && wl >= 1) {
        box = office.roomBounds(working).clone().applyMatrix4(OFFICE_REST);
        color = ROOM_META[working].color;
      }
    }
    if (!box) {
      workTarget = 0;
      return;
    }
    const c = box.getCenter(new THREE.Vector3());
    workLight.position.set(c.x, 2.4, c.z);
    workLight.color.set(color);
    workTarget = 3.2 + 1.8 * day.night;
  }
  /** v6 mapping of an actor onto a v6 dept room (only while the office has no v7 methods). */
  function deptOf(id: ActorId): Dept | null {
    if (id === "founder") return null;
    const fr = seatOf(id, roster, 1).room as FloorRoom;
    const r = FLOOR_TO_ROOM[fr];
    return r === "lobby" ? null : (r as Dept);
  }

  // ── v8: what the office shows. The flow/game's own company ("yours") is kept in `mine`; the home hero may show
  // the real finished example instead ("example"), read from the example's own project + kit (never invented).
  function applyRoster(r: readonly Analyst[]) {
    roster = r.slice();
    bedroom.setRoster(roster);
    office.setRoster(roster);
  }
  function applyActor(id: ActorId, s: ActorState, o?: { instant?: boolean }) {
    actorStates.set(id, s);
    bedroom.setActorState(id, s, o);
    office.setActorState(id, s, o);
    paintWorkLight();
  }
  function applySign(s: CompanySign) {
    sign = s;
    bedroom.setSign(s);
    office.setSign(s);
  }
  const ALL_FLOOR: readonly FloorRoom[] = ["lobby", ...BACK_ROW, ...FRONT_ROW];
  function applyRooms(m: Map<FloorRoom, RoomState>, instant: boolean) {
    for (const id of ALL_FLOOR) office.setRoomState(id, m.get(id) ?? null, { instant });
  }
  /** Back to the user's own company exactly as the flow/game last described it. */
  function restoreMine() {
    applyRoster(mine.roster);
    actorStates.clear();
    const def = (id: ActorId): ActorState => (id === "founder" ? "idle" : (BUILD_TEAM as readonly string[]).includes(id) ? "asleep" : "absent");
    for (const id of ["founder", ...BUILD_TEAM, ...mine.roster.map((a) => a.id)] as ActorId[]) applyActor(id, mine.actors.get(id) ?? def(id), { instant: true });
    applySign(mine.sign ?? { kind: "draft", name: "Your idea", color: "#1E2229" });
    applyRooms(mine.rooms, true);
    office.setScreen(mine.screen.img, mine.screen.line);
  }
  type Example = { roster: Analyst[]; sign: CompanySign; logo: HTMLCanvasElement | null; line: string };
  let example: Example | null = null;
  let exampleLoad: Promise<Example | null> | null = null;
  const VERDICT: Record<string, string> = { go: "GO", pivot: "TEST FIRST", "test-first": "TEST FIRST", "no-go": "NO-GO", nogo: "NO-GO" };
  /** Reads the finished example (GET /api/projects/ex-coffee-bcn + /kit, the same public routes the example page uses). */
  function loadExample(): Promise<Example | null> {
    exampleLoad ??= (async () => {
      try {
        const [pr, kr] = await Promise.all([fetch(`/api/projects/${EXAMPLE_ID}`), fetch(`/api/projects/${EXAMPLE_ID}/kit`)]);
        if (!pr.ok) return null;
        const p = (await pr.json()) as { results?: { v7?: { roster?: Analyst[] }; leo?: { score?: number; verdict?: string } } };
        const k = kr.ok ? ((await kr.json()) as { kit?: { brand?: { name?: string; tagline?: string; palette?: { primary?: string; bg?: string } }; logo?: { chosen?: string; options?: { id: string; svg: string }[] } } }).kit : undefined;
        const r = (p.results?.v7?.roster ?? []).filter((a) => a && a.id && a.role).slice(0, 5);
        const score = p.results?.leo?.score, verdict = p.results?.leo?.verdict;
        const name = k?.brand?.name?.trim() || "";
        const tag = [score != null ? score.toFixed(1) : "", verdict ? VERDICT[verdict] ?? verdict.toUpperCase() : ""].filter(Boolean).join(" · ");
        const sign: CompanySign = name ? { kind: "brand", name, tagline: tag || undefined, color: k?.brand?.palette?.primary || "#1E2229" } : { kind: "draft", name: tag || "Finished example", color: "#1E2229" };
        const opt = k?.logo?.options?.find((o) => o.id === k.logo?.chosen) ?? k?.logo?.options?.[0];
        const logo = opt ? await svgCanvas(opt.svg, k?.brand?.palette?.bg) : null;
        return { roster: r, sign, logo, line: k?.brand?.tagline ?? "" };
      } catch {
        return null;
      }
    })();
    return exampleLoad;
  }
  function applyExample(ex: Example | null) {
    const r = ex?.roster.length ? ex.roster : mine.roster;
    applyRoster(r);
    actorStates.clear();
    applyActor("founder", "idle", { instant: true });
    for (const a of r) applyActor(a.id, "done", { instant: true });
    for (const b of BUILD_TEAM) applyActor(b, "done", { instant: true });
    // the end state of a finished run: every research room that had an analyst + the whole studio, done
    const m = new Map<FloorRoom, RoomState>([["lobby", "idle"]]);
    BACK_ROW.forEach((id, i) => m.set(id, i < Math.min(4, r.length) ? "done" : "locked"));
    for (const id of FRONT_ROW) m.set(id, "done");
    applyRooms(m, true);
    if (ex) applySign(ex.sign);
    office.setScreen(ex?.logo ?? null, ex?.logo ? ex.line : "");
  }
  let showcaseTok = 0;
  function setShowcase(mode: Showcase) {
    if (mode === showcase) return;
    showcase = mode;
    const tok = ++showcaseTok;
    // before anything was drawn (or within the canvas fade-in) the first state is simply set, no crossfade
    const early = framesDrawn < 20;
    if (mode === "yours") {
      if (fadeIn) renderer.domElement.style.opacity = "";
      fadeIn = false;
      if (early) restoreMine();
      else void crossfade(600, restoreMine);
      return;
    }
    if (example) {
      if (early) applyExample(example);
      else void crossfade(600, () => applyExample(example));
      return;
    }
    // first time: keep the canvas clear until the example's real data arrives (max 2.5 s), then fade it in
    fadeIn = true;
    renderer.domElement.style.opacity = "0";
    const show = (ex: Example | null) => {
      if (tok !== showcaseTok || showcase !== "example") return;
      example = ex;
      fadeIn = false;
      fade = { t0: performance.now() - 200, ms: 400, mid: () => applyExample(ex), done: () => {} };
    };
    const timer = setTimeout(() => show(null), 2500);
    void loadExample().then((ex) => {
      clearTimeout(timer);
      show(ex);
    });
  }
  let fadeIn = false;

  /** Screen point of a world position (CSS px, unclipped) + whether it is inside the canvas and in front. */
  const _lp = new THREE.Vector3();
  function screenOf(p: THREE.Vector3) {
    _lp.copy(p).project(camera);
    const x = ((_lp.x + 1) / 2) * w, y = ((1 - _lp.y) / 2) * h;
    return { x, y, visible: _lp.z < 1 && x >= 0 && x <= w && y >= 0 && y <= h };
  }
  /** Anchors for DOM labels at the current level (see WorldV8.labelPoints). */
  function labelPoints() {
    const out: { id: string; x: number; y: number; visible: boolean }[] = [];
    const settled = !fade && !boom && !fadeIn;
    const push = (id: string, p: THREE.Vector3, ok = true) => {
      const s = screenOf(p);
      out.push({ id, x: s.x, y: s.y, visible: s.visible && ok && settled });
    };
    if (growth.city >= 0.5) {
      if (district) for (const a of district.anchors()) push(`campus:${a.id}`, a.p);
      return out;
    }
    const floorOn = growth.tower < 0.5;
    push("wing:back", new THREE.Vector3(0, 2.25, -3.3), floorOn);
    push("wing:front", new THREE.Vector3(3, 2.0, 3.3), floorOn);
    push("plate", new THREE.Vector3(0, PLATE_Y + 0.35, -1.5), floorOn && ghost.kind === "plate");
    for (const id of ALL_FLOOR) {
      const c = office.roomCenter(id).applyMatrix4(OFFICE_REST).setY(2.1);
      push(`room:${id}`, c, floorOn);
    }
    if (tower) for (const id of OFFICE_ROOMS) push(`office:${id}`, tower.roomAnchor(id), growth.tower >= 0.5);
    return out;
  }
  /** What a click/tap at (x, y) hits: room:<id> · plate · office:<id> · campus:<id> · campus:next. */
  function pickAt(x: number, y: number): string | null {
    if (boom || fade) return null;
    rayAt(x, y);
    if (growth.city >= 0.5) {
      const id = district?.pick(ray);
      return id ? (id === "next" ? "campus:next" : `campus:${id}`) : null;
    }
    if (tower && growth.tower >= 0.5) {
      const id = tower.pick(ray);
      if (id) return `office:${id}`;
    }
    const fr = office.pickFloor(ray);
    if (fr) return `room:${fr}`;
    if (ghost.kind === "plate" && ray.ray.intersectsBox(PLATE_BOX)) return "plate";
    return null;
  }
  /** Camera presets (WorldV8.shotFor). Hovering a wing dims the other rows. */
  function shotForArea(a: Area) {
    const key = typeof a === "string" ? a : a.room.includes(":") ? a.room : `room:${a.room}`;
    if (key === "stack") {
      office.setDim(null);
      void setWorldLevel(2);
      return;
    }
    if (key === "campus") {
      office.setDim(null);
      void setWorldLevel(3);
      return;
    }
    if (key === "floor") {
      office.setDim(null);
      if (wl !== 1) void setWorldLevel(1);
      else {
        focusT = "overview";
        paintPlate();
        void go(shotOf("overview"), { animate: true, ms: 600 });
      }
      return;
    }
    const lvFor = key.startsWith("office:") ? 2 : key.startsWith("plot:") || key.startsWith("campus:") ? 3 : 1;
    const k = key.startsWith("campus:") ? `plot:${key.slice(7)}` : key;
    office.setDim(k === "wing:back" ? [...FRONT_ROW, "lobby"] : k === "wing:front" ? [...BACK_ROW, "lobby"] : k === "plate" ? ALL_FLOOR : null);
    focusT = `area:${k}`;
    paintPlate();
    if (wl !== lvFor) {
      void setWorldLevel(lvFor as WorldLevel).then(() => {
        if (focusT === `area:${k}`) void go(shotOf(focusT), { animate: true, ms: 600 });
      });
      return;
    }
    void go(shotOf(focusT), { animate: true, ms: 600 });
  }
  /** Unlock beat: the wing's rooms go locked → idle one column at a time (120 ms apart), one ring per room. */
  function unlockWing(wing: "research" | "studio", o?: { animate?: boolean }): Promise<void> {
    const ids = wing === "research" ? BACK_ROW : FRONT_ROW;
    const animate = (o?.animate ?? true) && !reduced;
    const target = mine.rooms;
    const open = (id: FloorRoom, instant: boolean) => {
      const was = target.get(id);
      if (was && was !== "locked") return; // already lit by real work: never step it back
      target.set(id, "idle");
      if (showcase === "yours") office.setRoomState(id, "idle", { instant });
      if (!instant && showcase === "yours" && wl === 1) ringAt(floorBounds(id).applyMatrix4(OFFICE_REST));
    };
    if (!animate) {
      for (const id of ids) open(id, true);
      return Promise.resolve();
    }
    if (wl === 1) shotForArea(wing === "research" ? "wing:back" : "wing:front");
    office.setDim(null);
    return new Promise((done) => {
      ids.forEach((id, i) => setTimeout(() => open(id, false), 250 + i * 120));
      setTimeout(done, 250 + ids.length * 120 + 800);
    });
  }

  const world: WorldX = {
    camera,
    debug: { renderer, scene, key, state: () => ({ wl, asked, cap, level, focusT, insets, w, h, boomK, ghost: ghost.kind, pixel: pixel.mode, cur: { t: cur.target.toArray(), d: cur.dist }, growth: { ...growth }, built: builtK }) },
    get level() {
      return level;
    },
    get worldLevel() {
      return wl;
    },
    get levelCap() {
      return cap;
    },
    get pixel() {
      return pixel.mode;
    },
    setPixel(m) {
      pixel.setMode(m);
      sky.setPixel(pixel.cssPx);
    },
    setLevel(l, o) {
      return setWorldLevel(l, o);
    },
    setWorldLevel,
    setLevelCap(c) {
      // v8: the cap gates nothing. Cap 0 (a No-go) only hides the offices plate; the floor stays.
      cap = c;
      noGo = c === 0;
      paintPlate();
    },
    focus(t, o) {
      const prev = focusT;
      focusT = t;
      office.setDim(null);
      paintPlate();
      const animate = o?.animate ?? true;
      if (t !== "overview" && level !== 1 && wl !== 0) {
        // a room only exists inside the office: dive back in
        const from = level;
        level = 1;
        wl = 1;
        asked = 1;
        ghost.show(null, animate);
        return go(shotOf(t, 1), { animate, ms: levelMs(from, 1), ease: easeLevel, growthTo: GROWTH[1] });
      }
      const sameKind = (t === "overview") === (prev === "overview");
      return go(shotOf(t), { animate, ms: o?.ms ?? 1100, arc: t !== "overview" && sameKind ? 0.035 : 0 });
    },
    focusActor(id, o) {
      if (id === "overview") return world.focus("overview", o);
      if (wl >= 2) {
        // an actor only exists inside the office: dive back in, then frame them
        focusT = `actor:${id}`;
        const from = level;
        level = 1;
        wl = 1;
        asked = 1;
        ghost.show(null, true);
        return go(shotOf(focusT, 1), { animate: o?.animate ?? true, ms: levelMs(from, 1), ease: easeLevel, growthTo: GROWTH[1] });
      }
      const prev = focusT;
      focusT = `actor:${id}`;
      office.setDim(null);
      paintPlate();
      return go(shotOf(focusT), { animate: o?.animate ?? true, ms: o?.ms ?? 1100, arc: prev.startsWith("actor:") ? 0.03 : 0 });
    },
    setDeptState(d: Dept, s: DeptState) {
      office.setDeptState(d, s);
      deptStates.set(d, s);
      paintWorkLight();
    },
    setRoster(r) {
      mine.roster = r.slice();
      if (showcase === "yours") applyRoster(mine.roster);
    },
    setActorState(id, s, o) {
      mine.actors.set(id, s);
      if (showcase === "yours") applyActor(id, s, o);
    },
    pulse(id: ActorId, kind: FindingKind) {
      if (wl === 0) bedroom.pulse(id, kind);
      else office.pulse?.(id, kind);
    },
    actorScreenPoint(id) {
      if (wl >= 2 || growth.tower > 0.02 || boom) return null;
      let p: THREE.Vector3 | null = null;
      if (wl === 0) {
        const a = bedroom.actorAnchor(id);
        if (a) p = bedroom.root.localToWorld(a.clone());
      } else {
        const a = office.actorAnchor?.(id) ?? null;
        if (a) p = office.root.localToWorld(a.clone());
        else {
          const d = id === "founder" ? "lobby" : deptOf(id);
          if (d) p = office.root.localToWorld((office.anchor?.(d) ?? office.roomBounds(d).getCenter(new THREE.Vector3())).clone());
        }
      }
      return p ? toScreen(p) : null;
    },
    onActorClick(cb) {
      actorCbs.add(cb);
      return () => actorCbs.delete(cb);
    },
    setSign(s: CompanySign) {
      mine.sign = s;
      if (showcase === "yours") applySign(s);
    },
    setProject(p: WorldProject, o) {
      const apply = () => {
        cap = p.cap;
        noGo = p.cap === 0;
        world.setRoster(p.roster);
        actorStates.clear();
        mine.actors.clear();
        const set = (id: ActorId, s: ActorState) => world.setActorState(id, s, { instant: true });
        set("founder", "idle");
        for (const a of roster) set(a.id, p.level >= 1 ? "done" : "idle");
        for (const b of BUILD_TEAM) set(b, p.builders.includes(b) ? (p.level >= 2 ? "done" : "idle") : "asleep");
        world.setSign(p.sign);
        asked = Math.max(1, Math.min(3, p.level)) as WorldLevel; // v8: the cap no longer limits the level
        focusT = "overview";
        snapLevel(asked);
        setGrowthNow(G(asked));
        void go(shotOf("overview"), { animate: false });
      };
      if (o?.animate === false || showcase === "example") {
        apply();
        return Promise.resolve();
      }
      return crossfade(reduced ? 400 : 600, apply);
    },
    setAtmosphere: (a) => setAtmosphere(a),
    setClock(c, o) {
      const now = performance.now();
      clock.frozen = false;
      clock.set(c, now, (o?.animate ?? true) && !reduced);
      stepDay(now, true);
    },
    getClock() {
      return clockInfo(day, { t: 0, name: "day", daylight: 1, warmth: 0 });
    },
    onClock(cb) {
      clockCbs.add(cb);
      cb(clockInfo(day, { t: 0, name: "day", daylight: 1, warmth: 0 }));
      return () => clockCbs.delete(cb);
    },
    setPortfolio(items: PortfolioItem[]) {
      portfolio = items.slice();
      district?.setPortfolio(portfolio);
    },
    portfolioScreenPoints() {
      if (!district || growth.city < 0.5) return [];
      const out: { id: string; x: number; y: number }[] = [];
      for (const a of district.portfolioAnchors()) {
        const s = toScreen(_pp.copy(a.p), 1);
        if (s) out.push({ id: a.id, ...s });
      }
      return out;
    },
    // v8: no locked-level ghosts any more (the dashed offices plate is not a lock); kept for the v7 contract
    ghostScreenPoint() {
      if (!ghost.kind || ghost.kind === "plate") return null;
      const a = ghost.anchor();
      return a ? toScreen(a, 1) : null;
    },
    ghostLevel() {
      return ghost.kind && ghost.kind !== "plate" ? (({ floor: 1, tower: 2, district: 3 }) as const)[ghost.kind] : null;
    },
    clockMode: () => clock.current,
    setInsets(i) {
      if (i.left === insets.left && i.right === insets.right && i.top === insets.top && i.bottom === insets.bottom) return;
      insets = { ...i };
      if (boom) return; // the boom re-reads the framing every frame
      if (anim) {
        anim.to = shotOf(focusT);
        return;
      }
      void go(shotOf(focusT), { animate: true, ms: 600 });
    },
    celebrate(kind) {
      if (kind === "paid") {
        office.cheer("lobby");
        if (wl <= 1) pulseAt("lobby");
      } else if (kind === "level-up") {
        office.cheer();
        if (tower && growth.tower >= 1 && !anim) tower.sweep();
        else pendingSweep = true;
      } else {
        office.cheer("pip");
        if (level === 1 && wl === 1) pulseAt("pip");
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
      return toScreen(new THREE.Vector3(-8, Y0 - 0.2, 7.9), 1); // front edge of the plinth, under the lobby entrance
    },
    roomScreenPoint(room) {
      if (wl !== 1 || level !== 1 || growth.tower > 0.02) return null;
      const p = (office.anchor?.(room) ?? office.roomBounds(room).getCenter(new THREE.Vector3())).clone();
      return toScreen(office.root.localToWorld(p));
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
      const a = shotOf("overview", from), b = shotOf("overview", to);
      const ease = from === to ? easeInOut : to > from ? easeOutward : easeLevel;
      lerpShot(a, b, ease(clamp01(k)), cur);
      const g = growthAt(GROWTH[from], GROWTH[to], clamp01(k), to > from);
      setGrowthNow(g);
      level = k >= 1 ? to : from;
      wl = level;
      asked = wl;
      sync();
    },
    debugBoom(ms) {
      anim = null;
      boom = null;
      asked = 1;
      wl = 1;
      level = 1;
      setGrowthNow(G(1));
      const colors = ["#F2E6D3", "#E9DCC6", "#C9A27A", "#8C6A4F", "#0AC18E", "#FFFFFF", ...roster.map((a) => a.color)];
      fx.arm(LOBBY.clone(), { x: BEDROOM_FOOTPRINT.w / 2, z: BEDROOM_FOOTPRINT.d / 2 }, founderPoint(), colors);
      poseBoom(Math.max(0, Math.min(BOOM_MS, ms)), shotOf("overview", 0));
      sync();
    },
    // ── v8 (redesign WP-B). Signatures in ./api-v8.ts.
    unlockWing,
    setRooms(rooms) {
      for (const r of rooms) {
        if (!(ALL_FLOOR as readonly string[]).includes(r.id)) continue;
        mine.rooms.set(r.id as FloorRoom, r.state);
        if (showcase === "yours") office.setRoomState(r.id as FloorRoom, r.state);
      }
    },
    shotFor: shotForArea,
    setOffices(rooms, o) {
      officesState = { rooms: rooms.map((r) => ({ ...r })), sample: !!o?.sample };
      tower?.setOffices(officesState.rooms, { sample: officesState.sample });
    },
    setCampus(items) {
      campusItems = items.map((i) => ({ ...i }));
      district?.setCampus(campusItems);
    },
    async levelUp(to) {
      if (to === "research" || to === "studio") return unlockWing(to);
      const lv = to === "offices" ? 2 : 3;
      await setWorldLevel(lv as WorldLevel);
      if (lv === 2) tower?.sweep();
    },
    setLobbyScreen(img, line) {
      mine.screen = { img, line };
      if (showcase === "yours") office.setScreen(img, line);
    },
    setShowcase,
    labelPoints,
    onPick(cb) {
      pickCbs.add(cb);
      return () => pickCbs.delete(cb);
    },
    setPaused(p) {
      if (p === paused) return;
      paused = p;
      if (!p && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    },
    dispose() {
      paused = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      ringGeo.dispose();
      for (const r of rings) r.mat.dispose();
      window.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("click", onClick);
      office.dispose();
      bedroom.dispose();
      fx.dispose();
      ghost.dispose();
      pixel.dispose();
      tower?.dispose();
      district?.dispose();
      base.dispose();
      sky.dispose();
      clockCbs.clear();
      disposeFacades();
      env.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
  void sign;
  return world;
}

/** Overshoot ease for things that pop up (rooms rising). */
function easeOutBack(t: number) {
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

/** Renders a logo SVG (the kit's own markup, 64 × 64 viewBox) to a canvas for the lobby screen. */
function svgCanvas(svg: string, bg?: string): Promise<HTMLCanvasElement | null> {
  return new Promise((res) => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const img = new Image();
    const src = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256">${bg ? `<rect width="64" height="64" fill="${bg.replace(/[^#0-9a-zA-Z]/g, "")}"/>` : ""}${svg}</svg>`;
    img.onload = () => {
      c.getContext("2d")!.drawImage(img, 0, 0, 256, 256);
      res(c);
    };
    img.onerror = () => res(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
  });
}
