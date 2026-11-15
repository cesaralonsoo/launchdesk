// WS-OFFICE · room theme preview (dev only): /proto/world/office/rooms.html — see rooms/README.md.
// Renders the REAL office model (createOfficeModel) with the REAL day cycle lighting (daycycle.ts + the CSS sky,
// neutral tone mapping, hemi + key + moon fill, the world's office atmosphere), framed on one room.
//
//   ?role=<theme>       viability competition market demand pricing location regulation tech scalability
//                       nova dex launch lobby vacant                       (default competition)
//   ?pair=a,b           r3 shared by two analysts (5-person roster), e.g. pair=market,demand (or market%2Bdemand)
//   ?room=r0|r1|r2|r3   which research room shows the role (default r1: partitions on both sides)
//   ?time=dawn|day|golden|dusk|night|0..1      (default day) · ?cycle=<sec> run the day cycle
//   ?state=idle|working|presenting|done|asleep|absent   the people in the room (default idle; others idle)
//   ?view=room|wide|floor|top                  close-up (default) · room + neighbours · whole floor · plan view
//   ?zones=1            overlay the keep-clear zones (red = nothing, amber = low only) and wall anchors (blue)
//   ?all=1              grid of every theme (+ shared r3 + vacant), same time/state params
//   ?quality=high|low · ?still=1 (no idle motion) · ?ui=0 (no labels/buttons, for screenshots)
// Mouse: drag = orbit, wheel = zoom, double-click = reset.
import * as THREE from "three";
import { ANALYST_ROLES, BUILD_TEAM, DAY_TIMES, ROLE_LIBRARY, type ActorId, type ActorState, type Analyst, type AnalystRole, type DayPhaseName, type FloorRoom } from "../../contracts";
import { THEMES } from "../../themes";
import { fitShot, applyShot, roomAngles, levelAngles, type Shot } from "../camera";
import { createDayCycle, type DayState } from "../daycycle";
import { createSky } from "../sky";
import { createOfficeModel, type OfficeModelExt } from "./index";
import { ROOM_BY_ID } from "./layout";
import { wallsFor, zonesFor, type ThemeId, type ZoneKind } from "./rooms/common";
import { THEME_IDS } from "./rooms/index";

const qp = new URLSearchParams(location.search);
const quality = qp.get("quality") === "low" ? "low" : "high";
const still = qp.get("still") === "1";
const ui = qp.get("ui") !== "0";
const all = qp.get("all") === "1";
const showZones = qp.get("zones") === "1";
const view = (["room", "wide", "floor", "top"] as const).find((v) => v === qp.get("view")) ?? "room";
const STATES: readonly ActorState[] = ["absent", "arriving", "idle", "working", "presenting", "done", "asleep"];
const subjectState = (STATES.find((s) => s === qp.get("state")) ?? "idle") as ActorState;
const timeQ = qp.get("time");
let dayT = timeQ == null ? DAY_TIMES.day : timeQ in DAY_TIMES ? DAY_TIMES[timeQ as DayPhaseName] : Number.isFinite(+timeQ) ? Math.min(1, Math.max(0, +timeQ)) : DAY_TIMES.day;
const cycleSec = Number(qp.get("cycle") ?? 0);
if (!ui) document.documentElement.dataset.ui = "0";

// ─────────────────────────────────────────────── renderer + lights (as world/index.ts)
const host = document.getElementById("world")!;
const renderer = new THREE.WebGLRenderer({ antialias: quality === "high", alpha: true, powerPreference: "high-performance" });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(quality === "high" ? 2 : 1, devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = quality === "high";
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setScissorTest(true);
host.appendChild(renderer.domElement);
const sky = createSky(host);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffffff, 60, 220);
const hemi = new THREE.HemisphereLight();
const key = new THREE.DirectionalLight();
const fill = new THREE.DirectionalLight("#ffffff", 0.25);
key.castShadow = quality === "high";
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.03;
scene.add(hemi, key, key.target, fill, fill.target);
const camera = new THREE.PerspectiveCamera(24, 1, 0.5, 3000);

// ─────────────────────────────────────────────── offices + cells
type Cell = { office: OfficeModelExt; ox: number; room: FloorRoom; label: string; href: string; subject: ActorId[]; el?: HTMLElement };
const offices: OfficeModelExt[] = [];
const cells: Cell[] = [];
const FRONT: Record<string, FloorRoom> = { lobby: "lobby", nova: "nova", dex: "dex", launch: "launch" };
const FRONT_ACTORS: Record<string, ActorId[]> = { lobby: ["founder"], nova: ["nova"], dex: ["dex"], launch: ["rae", "pip"] };
const analyst = (role: AnalystRole): Analyst => {
  const m = ROLE_LIBRARY[role];
  return { id: role, role, name: m.name, color: m.color, mission: m.mission, why: "", weight: 0.2 };
};

function addOffice(roster: AnalystRole[]): { office: OfficeModelExt; ox: number } {
  const office = createOfficeModel({ quality, still });
  const ox = offices.length * 30;
  office.root.position.x = ox;
  office.setRoster(roster.map(analyst));
  for (const id of ["founder", ...BUILD_TEAM, ...roster] as ActorId[]) office.setActorState(id, "idle", { instant: true });
  scene.add(office.root);
  offices.push(office);
  return { office, ox };
}
const fillers = (avoid: AnalystRole[]) => ANALYST_ROLES.filter((r) => !avoid.includes(r));
function addCell(theme: ThemeId | `pair:${AnalystRole}+${AnalystRole}`, office: OfficeModelExt, ox: number, roomQ?: FloorRoom) {
  let room: FloorRoom, subject: ActorId[], label: string;
  if (theme.startsWith("pair:")) {
    const [a, b] = theme.slice(5).split("+") as [AnalystRole, AnalystRole];
    room = "r3";
    subject = [a, b];
    label = `${a} + ${b} (shared r3)`;
  } else if (theme in FRONT) {
    room = FRONT[theme]!;
    subject = FRONT_ACTORS[theme]!;
    label = theme;
  } else if (theme === "vacant") {
    room = "r3";
    subject = [];
    label = "vacant (3 hires)";
  } else {
    room = roomQ ?? "r1";
    subject = [theme as ActorId];
    label = theme;
  }
  const q = new URLSearchParams(location.search);
  q.delete("all");
  if (theme.startsWith("pair:")) {
    q.delete("role");
    q.set("pair", theme.slice(5).replace("+", ","));
  } else {
    q.delete("pair");
    q.set("role", theme);
  }
  const cell: Cell = { office, ox, room, label, href: `?${q}`, subject };
  for (const id of subject) office.setActorState(id, subjectState, { instant: true });
  cells.push(cell);
  return cell;
}

if (all) {
  // r0..r3 per office; four offices side by side (30 m apart)
  const A = addOffice(["viability", "competition", "market", "demand"]);
  const B = addOffice(["pricing", "location", "regulation", "tech"]);
  const C = addOffice(["scalability", "viability", "competition"]);
  const D = addOffice(["viability", "competition", "scalability", "market", "demand"]);
  (["viability", "competition", "market", "demand"] as const).forEach((r, i) => addCell(r, A.office, A.ox, `r${i}` as FloorRoom));
  (["pricing", "location", "regulation", "tech"] as const).forEach((r, i) => addCell(r, B.office, B.ox, `r${i}` as FloorRoom));
  addCell("scalability", C.office, C.ox, "r0");
  addCell("pair:market+demand", D.office, D.ox);
  addCell("vacant", C.office, C.ox);
  for (const f of ["lobby", "nova", "dex", "launch"] as const) addCell(f, A.office, A.ox);
} else {
  const pairQ = qp.get("pair");
  const roleQ = (qp.get("role") ?? "competition") as ThemeId;
  const roomQ = (["r0", "r1", "r2", "r3"] as const).find((r) => r === qp.get("room")) ?? "r1";
  const pair = (pairQ ?? "").split(/[+ ,]/).filter((r): r is AnalystRole => (ANALYST_ROLES as readonly string[]).includes(r));
  if (pair.length === 2 && pair[0] !== pair[1]) {
    const [a, b] = pair as [AnalystRole, AnalystRole];
    const rest = fillers([a, b]).slice(0, 3);
    const o = addOffice([...rest, a, b]);
    addCell(`pair:${a}+${b}`, o.office, o.ox);
  } else if (roleQ === "vacant") {
    const o = addOffice(["viability", "competition", "market"]);
    addCell("vacant", o.office, o.ox);
  } else if (roleQ in FRONT) {
    const o = addOffice(["viability", "competition", "market", "demand"]);
    addCell(roleQ, o.office, o.ox);
  } else {
    const role = (ANALYST_ROLES as readonly string[]).includes(roleQ) ? (roleQ as AnalystRole) : "competition";
    const idx = +roomQ.slice(1);
    const roster = fillers([role]).slice(0, 3);
    roster.splice(idx, 0, role);
    const o = addOffice(roster.slice(0, 4));
    addCell(role, o.office, o.ox, roomQ);
  }
}

// ─────────────────────────────────────────────── zone overlay
const ZONE_COLOR: Record<ZoneKind, string> = { desk: "#E5484D", chair: "#E5484D", seat: "#E5484D", stand: "#F59E0B", face: "#F59E0B", path: "#F59E0B", door: "#E5484D", sign: "#E5484D", tray: "#E5484D" };
if (showZones) {
  for (const c of cells) {
    const def = ROOM_BY_ID[c.room];
    const g = new THREE.Group();
    g.position.set(def.cx + c.ox, 0, def.cz);
    const shared = c.label.includes("shared");
    for (const z of zonesFor(c.room, shared)) {
      const col = z.maxH > 0 || z.kind === "path" ? "#F59E0B" : ZONE_COLOR[z.kind];
      const w = z.x1 - z.x0, d = z.z1 - z.z0, h = Math.max(0.04, z.maxH || (z.kind === "path" ? 0.04 : 1.0));
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false }));
      box.position.set((z.x0 + z.x1) / 2, h / 2 + 0.01, (z.z0 + z.z1) / 2);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: col }));
      edges.position.copy(box.position);
      g.add(box, edges);
    }
    for (const w of wallsFor(def)) {
      const len = w.to - w.from, hh = w.y1 - w.y0;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(len, hh), new THREE.MeshBasicMaterial({ color: "#3B82F6", transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
      if (w.wall === "left") {
        plane.rotation.y = Math.PI / 2;
        plane.position.set(w.at + 0.03, (w.y0 + w.y1) / 2, (w.from + w.to) / 2);
      } else plane.position.set((w.from + w.to) / 2, (w.y0 + w.y1) / 2, w.at + 0.03);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(plane.geometry), new THREE.LineBasicMaterial({ color: "#3B82F6" }));
      edges.position.copy(plane.position);
      edges.rotation.copy(plane.rotation);
      g.add(plane, edges);
    }
    scene.add(g);
  }
}

// ─────────────────────────────────────────────── day cycle (world/index.ts paintLights + paintSlow, office part)
const cycle = createDayCycle();
let day: DayState = cycle.sample(dayT);
const SURF = {
  day: { floor: "#F2F3F5", wall: "#FAFAFB", slab: "#D5DAE1", glass: "#DDEBFA", corridor: "#E9ECF0" },
  golden: { floor: "#F2EFEA", wall: "#FBFAF8", slab: "#C9C3BA", glass: "#E8EEF2", corridor: "#E9E4DC" },
  night: { floor: "#D9D4CB", wall: "#E7E3DC", slab: "#2A3140", glass: "#9DB7D8", corridor: "#CFCAC1" },
} as const;
type SurfKey = keyof typeof SURF.day;
const hex = (c: THREE.Color) => `#${c.getHexString()}`;
const _a = new THREE.Color(), _b = new THREE.Color();
function surfacesAt(s: DayState) {
  const x = Math.min(1, s.daylight / 0.45), warm = Math.min(1, s.warmth * 1.1), dl = x * x * (3 - 2 * x);
  const out = {} as Record<SurfKey, string>;
  for (const f of Object.keys(SURF.day) as SurfKey[]) out[f] = hex(_a.set(SURF.day[f]).lerp(_b.set(SURF.golden[f]), warm).lerp(_b.set(SURF.night[f]), 1 - dl));
  return out;
}
const moonFill = new THREE.Color("#8FA6CC");
const keyDir = new THREE.Vector3(), fillDir = new THREE.Vector3();
const base = THEMES.graphite.atmosphere;
function paint(s: DayState) {
  hemi.color.copy(s.ambSky);
  hemi.groundColor.copy(s.ambGround);
  hemi.intensity = s.ambI;
  key.color.copy(s.keyColor);
  key.intensity = s.keyI;
  keyDir.copy(s.keyDir);
  fillDir.set(-keyDir.x, 0.6, -keyDir.z).normalize();
  fill.color.copy(hemi.color).lerp(moonFill, s.night);
  fill.intensity = 0.28 + 0.4 * s.night;
  renderer.toneMappingExposure = s.exposure;
  (scene.fog as THREE.Fog).color.copy(s.fog);
  const o = {
    ...base,
    timeOfDay: s.daylight < 0.32 ? "night" : s.warmth > 0.5 ? "golden" : "day",
    sky: [hex(s.skyTop), hex(s.skyBottom)],
    fog: { color: hex(s.fog), near: s.fogNear, far: s.fogFar },
    key: { color: hex(s.keyColor), intensity: s.keyI, azimuth: s.sunEl > 0 ? s.sunAz : -32, elevation: s.sunEl > 0 ? Math.max(6, s.sunEl) : 48, shadows: true },
    ambient: { sky: hex(s.ambSky), ground: hex(s.ambGround), intensity: s.ambI },
    ground: hex(s.ground),
    exposure: s.exposure,
    surfaces: surfacesAt(s),
    lightsOn: s.lights > 0.3,
    lightLevel: s.lights, daylight: s.daylight, warmth: s.warmth, clockT: s.t,
  } as Parameters<OfficeModelExt["applyAtmosphere"]>[0];
  for (const of of offices) of.applyAtmosphere(o);
}
paint(day);

// ─────────────────────────────────────────────── layout: one canvas, scissored cells
const labels = document.getElementById("labels")!;
for (const c of cells) {
  const a = document.createElement("a");
  a.className = "label";
  a.textContent = c.label;
  a.href = c.href;
  labels.appendChild(a);
  c.el = a;
}
let W = 1, H = 1;
const cols = all ? 5 : 1, rows = all ? Math.ceil(cells.length / 5) : 1;
const GAP = all ? 6 : 0;
function rectOf(i: number) {
  const cw = (W - GAP * (cols + 1)) / cols, ch = (H - GAP * (rows + 1)) / rows;
  const cx = i % cols, cy = Math.floor(i / cols);
  return { x: GAP + cx * (cw + GAP), y: GAP + cy * (ch + GAP), w: cw, h: ch };
}
const orbit = { yaw: 0, pitch: 0, zoom: 1 };
function shotFor(c: Cell, w: number, h: number): Shot {
  const off = new THREE.Vector3(c.ox, 0, 0);
  const box =
    view === "floor" ? c.office.bounds() : view === "wide" ? c.office.floorRoomBounds(c.room).expandByVector(new THREE.Vector3(3, 0, 1.2)) : c.office.floorRoomBounds(c.room);
  box.translate(off);
  const def = ROOM_BY_ID[c.room];
  const ang = view === "top" ? { yaw: 0, pitch: THREE.MathUtils.degToRad(89) } : view === "floor" ? levelAngles(1, w / h) : roomAngles(def.cx, w / h);
  const pad = view === "room" ? 0.04 : 0.06;
  const s = fitShot(box, ang.yaw + orbit.yaw, THREE.MathUtils.clamp(ang.pitch + orbit.pitch, 0.08, 1.55), w, h, { left: 0, right: 0, top: 0, bottom: 0 }, pad);
  s.dist *= orbit.zoom;
  return s;
}
function resize() {
  W = host.clientWidth;
  H = host.clientHeight;
  renderer.setSize(W, H, false);
  cells.forEach((c, i) => {
    const r = rectOf(i);
    Object.assign(c.el!.style, { left: `${r.x + 8}px`, top: `${r.y + 6}px` });
  });
  dirty = true;
}
let dirty = true;
new ResizeObserver(resize).observe(host);

// orbit
let drag: { x: number; y: number } | null = null;
renderer.domElement.addEventListener("pointerdown", (e) => (drag = { x: e.clientX, y: e.clientY }));
addEventListener("pointerup", () => (drag = null));
addEventListener("pointermove", (e) => {
  if (!drag) return;
  orbit.yaw -= (e.clientX - drag.x) * 0.006;
  orbit.pitch += (e.clientY - drag.y) * 0.004;
  drag = { x: e.clientX, y: e.clientY };
  dirty = true;
});
renderer.domElement.addEventListener("wheel", (e) => {
  e.preventDefault();
  orbit.zoom = THREE.MathUtils.clamp(orbit.zoom * Math.exp(e.deltaY * 0.001), 0.25, 4);
  dirty = true;
}, { passive: false });
renderer.domElement.addEventListener("dblclick", () => {
  Object.assign(orbit, { yaw: 0, pitch: 0, zoom: 1 });
  dirty = true;
});

// ─────────────────────────────────────────────── buttons
const bar = document.getElementById("bar")!;
const link = (label: string, set: Record<string, string | null>, on: boolean) => {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(set)) v == null ? q.delete(k) : q.set(k, v);
  const a = document.createElement("a");
  a.textContent = label;
  a.href = `?${q}`;
  if (on) a.setAttribute("aria-current", "true");
  bar.appendChild(a);
};
const sep = () => bar.appendChild(document.createElement("i"));
link("all", { all: "1", role: null, pair: null }, all);
for (const t of THEME_IDS) link(t, { role: t, all: null, pair: null }, !all && !qp.get("pair") && (qp.get("role") ?? "competition") === t);
link("shared", { pair: "market,demand", role: null, all: null }, !!qp.get("pair"));
sep();
for (const t of ["dawn", "day", "golden", "dusk", "night"]) link(t, { time: t, cycle: null }, (timeQ ?? "day") === t);
sep();
for (const s of ["idle", "working", "done", "asleep"]) link(s, { state: s }, subjectState === s);
sep();
for (const v of ["room", "wide", "floor", "top"]) link(v, { view: v }, view === v);
link("zones", { zones: showZones ? null : "1" }, showZones);

// ─────────────────────────────────────────────── loop
const clock = new THREE.Clock();
let frames = 0, slowAcc = 0;
const _snap = new THREE.Vector3();
function renderCell(c: Cell, r: { x: number; y: number; w: number; h: number }) {
  const s = shotFor(c, r.w, r.h);
  camera.aspect = r.w / r.h;
  camera.fov = 24;
  applyShot(camera, s);
  // shadow frustum around this cell's target
  const ext = Math.max(5, s.dist * Math.tan(THREE.MathUtils.degToRad(12)) * Math.max(1, r.w / r.h) * 1.2);
  _snap.copy(s.target);
  key.position.copy(_snap).addScaledVector(keyDir, s.dist + ext + 40);
  key.target.position.copy(_snap);
  fill.position.copy(s.target).addScaledVector(fillDir, 50);
  fill.target.position.copy(s.target);
  const sc = key.shadow.camera;
  Object.assign(sc, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: s.dist + ext * 3 + 120 });
  sc.updateProjectionMatrix();
  if (scene.fog instanceof THREE.Fog) {
    const k = s.dist / 40;
    scene.fog.near = day.fogNear * Math.max(1, k);
    scene.fog.far = day.fogFar * Math.max(1, k);
  }
  const y = H - r.y - r.h;
  renderer.setViewport(r.x, y, r.w, r.h);
  renderer.setScissor(r.x, y, r.w, r.h);
  renderer.render(scene, camera);
}
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, clock.getDelta());
  const t = clock.elapsedTime;
  if (cycleSec > 0) {
    dayT = (dayT + dt / cycleSec) % 1;
    day = cycle.sample(dayT);
    slowAcc += dt;
    if (slowAcc > 0.1) {
      slowAcc = 0;
      paint(day);
    }
    dirty = true;
  }
  let busy = false;
  for (const o of offices) busy = o.update(dt, t) || busy;
  if (!dirty && !busy && frames > 4) return;
  dirty = false;
  renderer.setScissor(0, 0, W, H);
  renderer.clear();
  cells.forEach((c, i) => renderCell(c, rectOf(i)));
  if (cells[0]) sky.paint(day, camera);
  frames++;
  if (frames === 4) document.documentElement.dataset.ready = "1";
}
resize();
tick();
(window as unknown as { __rooms: unknown }).__rooms = { offices, cells, scene, renderer, orbit, paint, cycle };
