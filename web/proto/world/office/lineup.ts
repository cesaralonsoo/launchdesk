// WS-CHARACTERS · dev-only character line-up: /proto/world/office/lineup.html
//   ?row=cast   every actor standing idle (default)
//   ?row=poses  one figure in every state: idle · working · presenting · done (hop) · asleep · arriving · walking
//   ?who=<id>   the figure used by row=poses     ?still=1 freeze idle motion     ?t=<s> advance the clock first
import * as THREE from "three";
import type { ActorId, ActorState, AnalystRole } from "../../contracts";
import { ROLE_LIBRARY } from "../../contracts";
import { Figure, lookOf, type Spot } from "./cast";

const qp = new URLSearchParams(location.search);
const still = qp.get("still") === "1";
const row = qp.get("row") ?? "cast";
const host = document.getElementById("world")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#E9ECEF");
const camera = new THREE.PerspectiveCamera(24, 1, 0.5, 200);
scene.add(new THREE.HemisphereLight("#F4F1EA", "#9AA0A8", 1.1));
const key = new THREE.DirectionalLight("#FFF4E6", 2.2);
key.position.set(-6, 10, 8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#D8D2C6", roughness: 1 }));
floor.receiveShadow = true;
scene.add(floor);
// a stool for seated poses
const stoolM = new THREE.MeshStandardMaterial({ color: "#8C7B66", roughness: 0.9 });

const figs: Figure[] = [];
const ALL: ActorId[] = ["founder", "viability", "competition", "market", "demand", "pricing", "location", "regulation", "tech", "scalability", "nova", "dex", "rae", "pip"];
const spotAt = (x: number, z: number, yaw = 0, extra: Partial<Spot> = {}): Spot => ({ seat: { x, z: z - 0.05, yaw }, stand: { x, z, yaw }, ...extra });
if (row === "cast") {
  ALL.forEach((id, i) => {
    const x = (i - (ALL.length - 1) / 2) * 0.8;
    const f = new Figure(id, lookOf(id), spotAt(x, 0, 0.12), "high");
    f.setState("idle", true);
    scene.add(f.root);
    figs.push(f);
  });
  camera.position.set(0, 2.6, 18.5);
  camera.lookAt(0, 0.6, 0);
  camera.fov = 22;
} else {
  // ?who= takes a role id or a person's name (leo, mia, …)
  const raw = (qp.get("who") ?? "competition").toLowerCase();
  const byName = (Object.keys(ROLE_LIBRARY) as AnalystRole[]).find((r) => ROLE_LIBRARY[r].name.toLowerCase() === raw);
  const who = (byName ?? raw) as ActorId;
  const poses: Array<[ActorState, Partial<Spot>]> = [["idle", {}], ["working", {}], ["presenting", {}], ["done", {}], ["asleep", {}], ["working", { lap: true, sitIdle: true }], ["working", { standWork: true }]];
  poses.forEach(([st, ex], i) => {
    const x = (i - (poses.length - 1) / 2) * 0.95;
    const f = new Figure(who, lookOf(who), spotAt(x, 0, 0.35, ex), "high");
    f.setState(st, true);
    if (st === "done") f.cheer();
    if ((st === "working" && !ex.standWork) || st === "asleep") {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.4), stoolM);
      s.position.set(x, 0.175, -0.1);
      s.castShadow = true;
      scene.add(s);
    }
    scene.add(f.root);
    figs.push(f);
  });
  camera.position.set(0, 3.0, 11);
  camera.lookAt(0, 0.55, 0);
}
function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
let t = Number(qp.get("t") ?? 0);
for (let i = 0; i < 120; i++) {
  t += 1 / 60;
  for (const f of figs) f.update(1 / 60, t, still);
}
let last = performance.now();
let frames = 0;
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  for (const f of figs) f.update(dt, t, still);
  renderer.render(scene, camera);
  if (++frames === 3) document.documentElement.dataset.ready = "1";
});
(window as unknown as { __figs: Figure[] }).__figs = figs;
