// WS-A · standalone office preview (dev only): /proto/world/office/preview.html
// Its own renderer so the office can be judged in isolation, with the settings it was tuned for.
//
// Params:
//   atmo   = studio | day | golden | night | mono   (maps to the theme atmospheres: graphite/forest/ivory/midnight/mono)
//   quality= low | high          high: shadows 2048 + GTAO ambient occlusion; low: no shadows, DPR 1, baked AO only
//   states = validate | build | locked | done | mixed | idle   (a preset of dept states) — or e.g. mia:done,leo:working
//   focus  = overview | lobby | mia | … | pip
//   tm     = aces | neutral      tone mapping (WS-B's stub uses neutral)
//   still=1  no idle motion       bar=0 hide the buttons       cheer=<room> fire a celebration after load
//   time   = dawn | day | golden | dusk | night | 0..1   v6 day cycle: an interpolated preset (overrides atmo)
//   cycle  = <seconds>           run the whole day cycle (applyAtmosphere every 100 ms, like the world clock)
// v7 (WS-OFFICE):
//   model  = office | bedroom    which diorama (bedroom = level 0, the founder's room)
//   ostyle = clean | pixel | voxel   art direction (default voxel)
//   roster = viability,competition,market,…   the hired analysts (3–5, contracts ROLE_LIBRARY)
//   actors = <id>:<state>,…      v7 actor states (absent|arriving|idle|working|presenting|done|asleep); presets:
//            room0 (founder only) · hire · evidence · report · floor · build · live
//   sign   = draft:Coffee kiosk | brand:Pausa:#C2410C:pause[:tagline]
//   focus  = overview | <floor room r0…launch> | actor:<id>
//   reveal = 0..1 (office boom reveal) · boom = 0..1 (bedroom boom) · pulse=<id>:<kind>,… fired after load
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { ALL_DEPTS, ALL_ROOMS, ROLE_LIBRARY, type ActorId, type ActorState, type Analyst, type AnalystRole, type AtmospherePreset, type BedroomModel, type CompanySign, type Dept, type DeptState, type FindingKind, type FloorRoom, type Room, type ThemeId } from "../../contracts";
import { THEMES } from "../../themes";
import { createBedroomModel } from "../bedroom";
import { createOfficeModel } from "./index";

const qp = new URLSearchParams(location.search);
const quality = qp.get("quality") === "low" ? "low" : "high";
const still = qp.get("still") === "1";
if (qp.get("bar") === "0") document.documentElement.dataset.bar = "0";
const ATMO: Record<string, ThemeId> = { studio: "graphite", day: "forest", golden: "ivory", night: "midnight", mono: "mono" };
let atmoKey = qp.get("atmo") ?? "studio";
if (!(atmoKey in ATMO)) atmoKey = "studio";

const host = document.getElementById("world")!;
const renderer = new THREE.WebGLRenderer({ antialias: quality === "high" && Number(qp.get("px") ?? 1) <= 1, alpha: false, powerPreference: "high-performance" });
// px=2|3: render at 1/px resolution and upscale with nearest (a renderer-level pixel pass, for the comparison)
const pxQ = Math.max(1, Number(qp.get("px") ?? 1));
renderer.setPixelRatio(pxQ > 1 ? 1 / pxQ : Math.min(quality === "high" ? 2 : 1, devicePixelRatio || 1));
if (pxQ > 1) renderer.domElement.style.imageRendering = "pixelated";
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = qp.get("tm") === "neutral" ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = quality === "high";
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(24, 1, 0.5, 400);
const hemi = new THREE.HemisphereLight();
const key = new THREE.DirectionalLight();
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 4;
Object.assign(key.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 90 });
scene.add(hemi, key, key.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.56;
ground.receiveShadow = true;
scene.add(ground);

const office = createOfficeModel({ quality, still });
const isBed = qp.get("model") === "bedroom";
const bedroom: BedroomModel | null = isBed ? createBedroomModel({ quality, still }) : null;
if (bedroom) {
  scene.add(bedroom.root);
  ground.position.y = -0.56;
} else scene.add(office.root);

// ── v7 roster / actors / sign
const roles = (qp.get("roster") ?? "viability,competition,market").split(",").filter((r): r is AnalystRole => r in ROLE_LIBRARY);
const roster: Analyst[] = roles.map((role) => ({ id: role, role, name: ROLE_LIBRARY[role].name, color: ROLE_LIBRARY[role].color, mission: ROLE_LIBRARY[role].mission, why: "", weight: 1 / roles.length }));
office.setRoster(roster);
bedroom?.setRoster(roster);
const ACTOR_PRESETS: Record<string, (r: Analyst[]) => Array<[ActorId, ActorState]>> = {
  room0: () => [["founder", "working"]],
  hire: (r) => [["founder", "idle"], ...r.map((a, i) => [a.id, i < r.length - 1 ? "idle" : "arriving"] as [ActorId, ActorState])],
  evidence: (r) => [["founder", "idle"], ...r.map((a, i) => [a.id, i === 0 ? "done" : i === 1 ? "presenting" : "working"] as [ActorId, ActorState])],
  report: (r) => [["founder", "idle"], ...r.map((a) => [a.id, "done"] as [ActorId, ActorState])],
  floor: (r) => [["founder", "idle"], ...r.map((a) => [a.id, "done"] as [ActorId, ActorState]), ["nova", "asleep"], ["dex", "asleep"], ["rae", "asleep"], ["pip", "asleep"]],
  build: (r) => [["founder", "idle"], ...r.map((a) => [a.id, "done"] as [ActorId, ActorState]), ["nova", "done"], ["dex", "working"], ["rae", "idle"], ["pip", "asleep"]],
  live: (r) => [["founder", "working"], ...r.map((a) => [a.id, "done"] as [ActorId, ActorState]), ["nova", "done"], ["dex", "done"], ["rae", "done"], ["pip", "done"]],
};
function applyActors(spec: string, instant: boolean) {
  const preset = ACTOR_PRESETS[spec];
  const pairs = preset ? preset(roster) : (spec.split(",").map((p) => p.split(":")) as Array<[ActorId, ActorState]>);
  for (const [id, st] of pairs) {
    office.setActorState(id, st, { instant });
    bedroom?.setActorState(id, st, { instant });
  }
}
const signQ = qp.get("sign");
if (signQ) {
  const [kind, name, color, glyph, tagline] = signQ.split(":");
  const s: CompanySign = { kind: kind === "brand" ? "brand" : "draft", name: name ?? "Your idea", color: color ?? "#1E2229", glyph, tagline };
  office.setSign(s);
  bedroom?.setSign(s);
}
const revealQ = qp.get("reveal");
if (revealQ != null) office.setReveal(Number(revealQ));
const boomQ = qp.get("boom");
if (boomQ != null) bedroom?.setBoom(Number(boomQ));

let composer: EffectComposer | null = null;
let gtao: GTAOPass | null = null;
if (quality === "high" && qp.get("ao") !== "0" && pxQ === 1) {
  // No MSAA on the AO path (GTAO reads non-multisampled depth → halos); SMAA after tone mapping instead.
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  gtao = new GTAOPass(scene, camera, 1, 1);
  gtao.output = qp.get("aoview") === "1" ? GTAOPass.OUTPUT.Denoise : GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 1;
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.3, thickness: 1.2, scale: 1.3, samples: 16 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 10, rings: 3, samples: 24 });
  composer.addPass(gtao);
  composer.addPass(new OutputPass());
  composer.addPass(new SMAAPass());
}

// ── v6 day cycle keyframes (dev stand-in for the world clock; t: 0 = midnight, 0.5 = noon)
const KF: Array<{ t: number; p: AtmospherePreset }> = (() => {
  const night = THEMES.midnight.atmosphere, golden = THEMES.ivory.atmosphere, day = THEMES.graphite.atmosphere;
  const surf = day.surfaces;
  const dawn: AtmospherePreset = {
    timeOfDay: "golden", sky: ["#E9DCE0", "#F2D8C6"], fog: { color: "#F0DACB", near: 60, far: 220 },
    key: { color: "#FFC9A0", intensity: 2.1, azimuth: -70, elevation: 14, shadows: true },
    ambient: { sky: "#E8E2F0", ground: "#A89A92", intensity: 0.6 }, ground: "#E6DED6", exposure: 1.02, surfaces: surf, accentStrength: 0.88, lightsOn: 0.45 as unknown as boolean,
  };
  const dusk: AtmospherePreset = {
    timeOfDay: "night", sky: ["#2A2E4A", "#9C7272"], fog: { color: "#7E6470", near: 55, far: 210 },
    key: { color: "#FF9A66", intensity: 1.15, azimuth: 82, elevation: 7, shadows: true },
    ambient: { sky: "#7C7EA8", ground: "#3A3038", intensity: 0.55 }, ground: "#5E5258", exposure: 1.04, surfaces: surf, accentStrength: 0.9, lightsOn: 0.9 as unknown as boolean,
  };
  const n = { ...night, surfaces: surf, lightsOn: 1 as unknown as boolean };
  return [
    { t: 0, p: n }, { t: 0.2, p: n }, { t: 0.27, p: dawn }, { t: 0.38, p: { ...day, lightsOn: 0 as unknown as boolean } },
    { t: 0.62, p: { ...day, lightsOn: 0 as unknown as boolean } }, { t: 0.72, p: { ...golden, surfaces: surf, lightsOn: 0.4 as unknown as boolean } },
    { t: 0.8, p: dusk }, { t: 0.87, p: n }, { t: 1, p: n },
  ];
})();
const NAMED: Record<string, number> = { dawn: 0.27, day: 0.5, golden: 0.72, dusk: 0.8, night: 0.0 };
const cA = new THREE.Color(), cB = new THREE.Color();
const lc = (a: string, b: string, k: number) => "#" + cA.set(a).lerp(cB.set(b), k).getHexString();
const ln = (a: number, b: number, k: number) => a + (b - a) * k;
function dayPreset(t: number): AtmospherePreset {
  t = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < KF.length - 2 && KF[i + 1]!.t <= t) i++;
  const A = KF[i]!, B = KF[i + 1]!;
  const raw = (t - A.t) / Math.max(1e-6, B.t - A.t);
  const k = raw * raw * (3 - 2 * raw);
  const a = A.p, b = B.p;
  const sky = (p: AtmospherePreset, j: number) => p.sky[Math.min(j, p.sky.length - 1)]!;
  const fa = a.fog!, fb = b.fog!;
  return {
    timeOfDay: k < 0.5 ? a.timeOfDay : b.timeOfDay,
    sky: [lc(sky(a, 0), sky(b, 0), k), lc(sky(a, 1), sky(b, 1), k)],
    fog: { color: lc(fa.color, fb.color, k), near: ln(fa.near, fb.near, k), far: ln(fa.far, fb.far, k) },
    key: { color: lc(a.key.color, b.key.color, k), intensity: ln(a.key.intensity, b.key.intensity, k), azimuth: ln(a.key.azimuth, b.key.azimuth, k), elevation: ln(a.key.elevation, b.key.elevation, k), shadows: true },
    ambient: { sky: lc(a.ambient.sky, b.ambient.sky, k), ground: lc(a.ambient.ground, b.ambient.ground, k), intensity: ln(a.ambient.intensity, b.ambient.intensity, k) },
    ground: lc(a.ground, b.ground, k),
    exposure: ln(a.exposure, b.exposure, k),
    surfaces: a.surfaces,
    accentStrength: ln(a.accentStrength ?? 1, b.accentStrength ?? 1, k),
    lightsOn: ln(Number(a.lightsOn ?? 0), Number(b.lightsOn ?? 0), k) as unknown as boolean,
  };
}

const fog = new THREE.Fog("#ffffff", 100, 400);
function applyAtmosphere(a: AtmospherePreset) {
  const [top, bottom = top] = a.sky;
  scene.background = cA.set(bottom).clone();
  document.body.style.background = `linear-gradient(${top}, ${bottom})`;
  if (a.fog) {
    fog.color.set(a.fog.color);
    fog.near = a.fog.near;
    fog.far = a.fog.far;
  }
  scene.fog = a.fog ? fog : null;
  hemi.color.set(a.ambient.sky);
  hemi.groundColor.set(a.ambient.ground);
  hemi.intensity = a.ambient.intensity;
  key.color.set(a.key.color);
  key.intensity = a.key.intensity;
  // same rule as WS-B: a sun within ±40° of the camera yaw (34°) is swung to the left so shadows show
  const sunAz = Math.abs(a.key.azimuth - 34) < 40 ? -35 + (a.key.azimuth - 34) * 0.3 : a.key.azimuth;
  const az = THREE.MathUtils.degToRad(Number(qp.get("keyaz") ?? sunAz)), el = THREE.MathUtils.degToRad(Number(qp.get("keyel") ?? a.key.elevation));
  key.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(40);
  key.castShadow = a.key.shadows && quality === "high";
  (ground.material as THREE.MeshStandardMaterial).color.set(a.ground);
  renderer.toneMappingExposure = a.exposure;
  office.applyAtmosphere(a);
  bedroom?.applyAtmosphere(a);
}

// ── camera: same rig as WS-B (yaw 34°, pitch 40°, fov 24°)
const YAW = THREE.MathUtils.degToRad(34), PITCH = THREE.MathUtils.degToRad(40);
const dir = new THREE.Vector3(Math.cos(PITCH) * Math.sin(YAW), Math.sin(PITCH), Math.cos(PITCH) * Math.cos(YAW));
let focus = (qp.get("focus") ?? "overview") as string;
const FLOOR: readonly string[] = ["r0", "r1", "r2", "r3", "lobby", "nova", "dex", "launch"];
if (focus !== "overview" && !ALL_ROOMS.includes(focus as Room) && !FLOOR.includes(focus) && !focus.startsWith("actor:")) focus = "overview";
const boxFor = (f: string): THREE.Box3 => {
  if (bedroom) return f.startsWith("actor:") ? bedroom.focusBounds(f.slice(6) as ActorId) : bedroom.bounds();
  if (f === "overview") return office.bounds();
  if (f.startsWith("actor:")) {
    const p = office.actorAnchor(f.slice(6) as ActorId) ?? new THREE.Vector3();
    return new THREE.Box3(new THREE.Vector3(p.x - 1.1, 0, p.z - 1.1), new THREE.Vector3(p.x + 1.1, 1.9, p.z + 1.1));
  }
  if (FLOOR.includes(f)) return office.floorRoomBounds(f as FloorRoom);
  return office.roomBounds(f as Room);
};
const camT = new THREE.Vector3();
let camD = 60;
const goal = { t: new THREE.Vector3(), d: 60 };
function frame(f: string, snap = false) {
  focus = f;
  const box = boxFor(f);
  const size = box.getSize(new THREE.Vector3());
  const r = (size.length() / 2) * (f === "overview" ? (bedroom ? 0.78 : 0.86) : 0.95);
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  goal.d = Math.max(r / Math.sin(vfov / 2), r / Math.sin(hfov / 2));
  goal.t.copy(box.getCenter(new THREE.Vector3()));
  if (f === "overview") goal.t.y = bedroom ? 0.7 : 0.2;
  if (snap || still) {
    camT.copy(goal.t);
    camD = goal.d;
  }
}

function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false);
  composer?.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  frame(focus, true);
}
new ResizeObserver(resize).observe(host);

// ── dept state presets
const PRESETS: Record<string, Partial<Record<Dept, DeptState>>> = {
  idle: {},
  locked: { nova: "locked", dex: "locked", rae: "locked", pip: "locked" },
  validate: { mia: "done", leo: "working", nova: "locked", dex: "locked", rae: "locked", pip: "locked" },
  verdict: { mia: "done", leo: "done", sam: "done", nova: "locked", dex: "locked", rae: "locked", pip: "locked" },
  build: { mia: "done", leo: "done", sam: "done", nova: "done", dex: "working" },
  done: Object.fromEntries(ALL_DEPTS.map((d) => [d, "done"])),
  mixed: { mia: "done", leo: "working", sam: "idle", nova: "locked", dex: "working", rae: "done", pip: "locked" },
};
function applyStates(spec: string, instant: boolean) {
  for (const d of ALL_DEPTS) office.setDeptState(d, "idle", { instant });
  const preset = PRESETS[spec];
  const pairs: Array<[Dept, DeptState]> = preset
    ? (Object.entries(preset) as Array<[Dept, DeptState]>)
    : spec.split(",").map((p) => p.split(":") as [Dept, DeptState]).filter(([d]) => ALL_DEPTS.includes(d));
  for (const [d, s] of pairs) office.setDeptState(d, s, { instant });
}

const timeQ = qp.get("time");
const cycleSec = Number(qp.get("cycle") ?? 0);
let dayT = timeQ == null ? -1 : timeQ in NAMED ? NAMED[timeQ]! : Number(timeQ);
if (cycleSec > 0 && dayT < 0) dayT = 0.5;
if (dayT >= 0) applyAtmosphere(dayPreset(dayT));
else applyAtmosphere(THEMES[ATMO[atmoKey]!].atmosphere);
applyStates(qp.get("states") ?? "locked", true);
if (qp.get("actors")) applyActors(qp.get("actors")!, true);
else if (bedroom) applyActors("room0", true);
frame(focus, true);

// ── buttons
const bar = document.getElementById("bar")!;
const btn = (label: string, on: () => void, pressed = false) => {
  const b = document.createElement("button");
  b.textContent = label;
  b.setAttribute("aria-pressed", String(pressed));
  b.onclick = on;
  bar.appendChild(b);
  return b;
};
for (const k of Object.keys(ATMO)) btn(k, () => applyAtmosphere(THEMES[ATMO[k]!].atmosphere), k === atmoKey && dayT < 0);
for (const k of Object.keys(NAMED)) btn(`t:${k}`, () => applyAtmosphere(dayPreset(NAMED[k]!)));
for (const k of Object.keys(PRESETS)) btn(k, () => applyStates(k, false));
for (const f of ["overview", ...FLOOR]) btn(f, () => frame(f));
for (const k of Object.keys(ACTOR_PRESETS)) btn(`a:${k}`, () => applyActors(k, false));
btn("cheer", () => office.cheer());
btn("pulse", () => {
  const a = roster[Math.floor(Math.random() * roster.length)];
  const kinds: FindingKind[] = ["fact", "number", "competitor", "risk", "strength", "estimate"];
  if (a) (bedroom ?? office).pulse(a.id, kinds[Math.floor(Math.random() * kinds.length)]!);
});
// click a room to frame it
const ray = new THREE.Raycaster();
renderer.domElement.addEventListener("click", (e) => {
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const id = bedroom ? bedroom.pickActor(ray) : office.pickActor(ray);
  if (id) return frame(`actor:${id}`);
  const room = office.pick(ray);
  frame(room ?? "overview");
});

// ── loop
const clock = new THREE.Clock();
let frames = 0;
let cycleAcc = 0;
const cheerRoom = qp.get("cheer") as Room | null;
let boomAnim = -1;
const pulses = (qp.get("pulse") ?? "").split(",").filter(Boolean).map((p) => p.split(":") as [ActorId, FindingKind]);
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, clock.getDelta());
  const t = clock.elapsedTime;
  const k = still ? 1 : 1 - Math.exp(-dt * 4);
  camT.lerp(goal.t, k);
  camD += (goal.d - camD) * k;
  camera.position.copy(camT).addScaledVector(dir, camD);
  camera.lookAt(camT);
  if (cycleSec > 0) {
    dayT += dt / cycleSec;
    cycleAcc += dt;
    if (cycleAcc >= 0.1) {
      cycleAcc = 0;
      applyAtmosphere(dayPreset(dayT));
    }
  }
  office.update(dt, t);
  bedroom?.update(dt, t);
  if (boomAnim >= 0) {
    boomAnim = Math.min(1, boomAnim + dt / 2.6);
    bedroom?.setBoom(boomAnim);
  }
  if (composer) composer.render(dt);
  else renderer.render(scene, camera);
  frames++;
  if (frames === 3) {
    document.documentElement.dataset.ready = "1";
    if (cheerRoom) office.cheer(cheerRoom === ("all" as Room) ? undefined : cheerRoom);
    pulses.forEach(([id, k], i) => setTimeout(() => (bedroom ?? office).pulse(id, k), i * 120));
    if (qp.get("boomplay") === "1") boomAnim = 0;
  }
}
tick();
(window as unknown as { __office: unknown }).__office = { office, bedroom, renderer, scene, camera, frame, applyStates, applyActors, gtao, applyAtmosphere, dayPreset, setBoom: (k: number) => bedroom?.setBoom(k), setReveal: (k: number) => office.setReveal(k) };
