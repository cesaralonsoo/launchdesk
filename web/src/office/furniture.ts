import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { DeptId, RoomDef } from "./layout";
import {
  logoWallTex, moodboardTex, radialTex, rugTex, screenTex, signTex, sketchTex, wallScreenTex, whiteboardTex,
} from "./textures";

// ---------- material + geometry helpers ----------

const mats = new Map<string, THREE.Material>();
export function mat(color: string, opts: { rough?: number; metal?: number; emissive?: string; ei?: number; flat?: boolean } = {}) {
  const key = `${color}|${opts.rough ?? 0.75}|${opts.metal ?? 0}|${opts.emissive ?? ""}|${opts.ei ?? 0}|${opts.flat ? 1 : 0}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.75,
      metalness: opts.metal ?? 0,
      emissive: opts.emissive ?? "#000000",
      emissiveIntensity: opts.ei ?? 0,
      flatShading: opts.flat ?? false,
    });
    mats.set(key, m);
  }
  return m;
}
export function basic(color: string, opacity = 1) {
  const key = `basic|${color}|${opacity}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });
    mats.set(key, m);
  }
  return m;
}
const texMats = new Map<THREE.Texture, THREE.Material>();
export function texMat(t: THREE.Texture, lit = false) {
  let m = texMats.get(t);
  if (!m) {
    m = lit
      ? new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })
      : new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
    texMats.set(t, m);
  }
  return m;
}
export function disposeMaterials() {
  shadowMat?.dispose();
  shadowMat = null;
  mats.forEach((m) => m.dispose());
  texMats.forEach((m) => m.dispose());
  mats.clear();
  texMats.clear();
  geos.forEach((g) => g.dispose());
  geos.clear();
}

const geos = new Map<string, THREE.BufferGeometry>();
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geos.get(key) as T | undefined;
  if (!g) {
    g = make();
    geos.set(key, g);
  }
  return g;
}

type P3 = [number, number, number];

export function box(w: number, h: number, d: number, m: THREE.Material, pos: P3, r = 0): THREE.Mesh {
  const g = r > 0
    ? geo(`rb${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)))
    : geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(...pos);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
export function cyl(rt: number, rb: number, h: number, m: THREE.Material, pos: P3, seg = 20): THREE.Mesh {
  const mesh = new THREE.Mesh(geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m);
  mesh.position.set(...pos);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
export function sphere(r: number, m: THREE.Material, pos: P3, seg = 16): THREE.Mesh {
  const mesh = new THREE.Mesh(geo(`s${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.75))), m);
  mesh.position.set(...pos);
  mesh.castShadow = true;
  return mesh;
}
export function blob(r: number, m: THREE.Material, pos: P3, detail = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geo(`i${r},${detail}`, () => new THREE.IcosahedronGeometry(r, detail)), m);
  mesh.position.set(...pos);
  mesh.castShadow = true;
  return mesh;
}
export function plane(w: number, h: number, m: THREE.Material, pos: P3, rotY = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geo(`p${w},${h}`, () => new THREE.PlaneGeometry(w, h)), m);
  mesh.position.set(...pos);
  mesh.rotation.y = rotY;
  return mesh;
}
function group(x: number, z: number, rotY = 0, y = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  return g;
}

// ---------- palette ----------
const C = {
  wood: "#E7D3B5",
  woodDark: "#B98A5E",
  white: "#F7F8FA",
  offWhite: "#E9EDF2",
  steel: "#5B6676",
  dark: "#2A3140",
  darker: "#1B2130",
  leaf1: "#3FA66B",
  leaf2: "#2F8C5A",
  leaf3: "#62C083",
  pot: "#F1EEE8",
  terracotta: "#D9825B",
};

// ---------- pieces (all built facing +Z, origin on the floor) ----------

/** Desk with monitor, keyboard and mug. Monitor screen faces +Z. Returns group and the screen mesh. */
let shadowMat: THREE.MeshBasicMaterial | null = null;
const shadowGeo = new THREE.PlaneGeometry(1, 1);
/** Soft blurred contact shadow (a radial-gradient plane) that grounds furniture and people on the floor. */
export function contactShadow(w: number, d: number, opacity = 1): THREE.Mesh {
  shadowMat ??= new THREE.MeshBasicMaterial({ color: "#1B2230", map: radialTex(), transparent: true, opacity: 0.26, depthWrite: false });
  const m = new THREE.Mesh(shadowGeo, opacity === 1 ? shadowMat : Object.assign(shadowMat.clone(), { opacity: 0.26 * opacity }));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(w, d, 1);
  m.position.y = 0.012;
  m.renderOrder = -1;
  m.raycast = () => {};
  return m;
}

export function desk(color: string, variant: number, w = 1.5): { g: THREE.Group; screen: THREE.Mesh } {
  const g = new THREE.Group();
  g.add(contactShadow(w + 0.7, 1.35));
  g.add(box(w, 0.07, 0.72, mat(C.wood, { rough: 0.6 }), [0, 0.66, 0], 0.025));
  for (const sx of [-1, 1]) {
    g.add(box(0.06, 0.64, 0.6, mat(C.dark), [sx * (w / 2 - 0.08), 0.32, 0]));
  }
  // drawer unit
  g.add(box(0.36, 0.42, 0.56, mat(C.offWhite), [w / 2 - 0.3, 0.33, 0.02], 0.03));
  // monitor
  g.add(box(0.08, 0.2, 0.06, mat(C.dark), [0, 0.8, -0.18]));
  g.add(box(0.26, 0.02, 0.16, mat(C.dark), [0, 0.705, -0.16], 0.01));
  g.add(box(0.86, 0.5, 0.05, mat(C.darker, { rough: 0.4 }), [0, 1.1, -0.2], 0.03));
  const screen = plane(0.8, 0.44, texMat(screenTex(color, variant)).clone() as THREE.Material, [0, 1.1, -0.172]);
  g.add(screen);
  // keyboard + mouse + mug
  g.add(box(0.5, 0.025, 0.16, mat(C.white), [-0.02, 0.71, 0.12], 0.01));
  g.add(box(0.07, 0.025, 0.1, mat(C.white), [0.36, 0.71, 0.13], 0.02));
  g.add(cyl(0.05, 0.045, 0.1, mat(color, { rough: 0.5 }), [-w / 2 + 0.2, 0.75, 0.05]));
  const l = deskLamp();
  l.position.set(w / 2 - 0.2, 0.7, -0.15);
  g.add(l);
  const p = plant("small");
  p.position.set(-w / 2 + 0.22, 0.7, -0.2);
  p.scale.setScalar(0.75);
  g.add(p);
  return { g, screen };
}

export function officeChair(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.24, 0.24, 0.03, mat(C.dark), [0, 0.04, 0], 5));
  g.add(cyl(0.03, 0.03, 0.3, mat(C.steel, { metal: 0.4, rough: 0.4 }), [0, 0.2, 0]));
  g.add(box(0.48, 0.08, 0.46, mat(color, { rough: 0.8 }), [0, 0.38, 0], 0.035));
  g.add(box(0.46, 0.5, 0.07, mat(color, { rough: 0.8 }), [0, 0.68, -0.22], 0.035));
  return g;
}

export function plant(kind: "bush" | "tall" | "small" = "bush", potColor = C.pot): THREE.Group {
  const g = new THREE.Group();
  const leaf = [mat(C.leaf1, { flat: true }), mat(C.leaf2, { flat: true }), mat(C.leaf3, { flat: true })];
  if (kind === "tall") {
    g.add(cyl(0.2, 0.15, 0.4, mat(potColor), [0, 0.2, 0]));
    g.add(cyl(0.02, 0.02, 0.6, mat(C.woodDark), [0, 0.6, 0], 6));
    g.add(blob(0.26, leaf[0]!, [0, 1.0, 0]));
    g.add(blob(0.2, leaf[1]!, [0.14, 1.22, 0.06]));
    g.add(blob(0.18, leaf[2]!, [-0.12, 1.25, -0.06]));
    g.add(blob(0.15, leaf[0]!, [0.02, 1.42, 0.02]));
  } else if (kind === "small") {
    g.add(cyl(0.1, 0.08, 0.16, mat(potColor), [0, 0.08, 0]));
    g.add(blob(0.13, leaf[2]!, [0, 0.26, 0]));
    g.add(blob(0.09, leaf[0]!, [0.06, 0.34, 0.04]));
  } else {
    g.add(cyl(0.2, 0.16, 0.34, mat(potColor), [0, 0.17, 0]));
    g.add(blob(0.24, leaf[0]!, [0, 0.52, 0]));
    g.add(blob(0.18, leaf[1]!, [0.16, 0.62, 0.04]));
    g.add(blob(0.17, leaf[2]!, [-0.14, 0.66, -0.05]));
    g.add(blob(0.14, leaf[1]!, [0.02, 0.8, 0.02]));
  }
  return g;
}

export function sofa(color: string, w = 1.5): THREE.Group {
  const g = new THREE.Group();
  const m = mat(color, { rough: 0.9 });
  g.add(box(w, 0.26, 0.7, m, [0, 0.2, 0], 0.08));
  g.add(box(w, 0.48, 0.2, m, [0, 0.42, -0.27], 0.08));
  g.add(box(0.18, 0.36, 0.7, m, [-w / 2 + 0.09, 0.34, 0], 0.07));
  g.add(box(0.18, 0.36, 0.7, m, [w / 2 - 0.09, 0.34, 0], 0.07));
  const cushion = mat(new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.25).getStyle(), { rough: 0.9 });
  g.add(box(w / 2 - 0.2, 0.08, 0.5, cushion, [-w / 4 + 0.04, 0.36, 0.05], 0.04));
  g.add(box(w / 2 - 0.2, 0.08, 0.5, cushion, [w / 4 - 0.04, 0.36, 0.05], 0.04));
  return g;
}

export function rug(color: string, r: number, x: number, z: number): THREE.Mesh {
  const m = new THREE.MeshStandardMaterial({ map: rugTex(color), transparent: true, roughness: 1 });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 40), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.022, z);
  mesh.receiveShadow = true;
  return mesh;
}

export function rectRug(color: string, w: number, d: number, x: number, z: number): THREE.Mesh {
  const mesh = box(w, 0.02, d, mat(color, { rough: 1 }), [x, 0.02, z], 0.01);
  mesh.castShadow = false;
  return mesh;
}

/** Framed picture hung on a wall; faces +Z. */
export function wallPanel(t: THREE.Texture, w: number, h: number, frame = C.white, lit = false): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w + 0.08, h + 0.08, 0.05, mat(frame), [0, 0, 0], 0.02));
  g.add(plane(w, h, texMat(t, lit), [0, 0, 0.027]));
  return g;
}

function lamp(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.16, 0.18, 0.04, mat(C.dark), [0, 0.02, 0]));
  g.add(cyl(0.02, 0.02, 1.4, mat(C.dark, { metal: 0.3 }), [0, 0.72, 0], 8));
  g.add(cyl(0.12, 0.24, 0.24, mat("#FFF4D6", { emissive: "#FFD98A", ei: 0.9 }), [0, 1.48, 0]));
  return g;
}

function bookshelf(w: number, colors: string[]): THREE.Group {
  const g = new THREE.Group();
  const m = mat(C.white);
  g.add(box(w, 1.2, 0.34, m, [0, 0.6, 0], 0.02));
  for (let s = 0; s < 3; s++) {
    const y = 0.16 + s * 0.38;
    g.add(box(w - 0.08, 0.3, 0.02, mat(C.offWhite), [0, y + 0.13, -0.15]));
    let x = -w / 2 + 0.12;
    let i = s * 3;
    while (x < w / 2 - 0.2) {
      const bw = 0.06 + ((i * 7) % 4) * 0.015;
      const bh = 0.2 + ((i * 5) % 3) * 0.03;
      g.add(box(bw, bh, 0.22, mat(colors[i % colors.length]!), [x, y + bh / 2 + 0.02, 0.02]));
      x += bw + 0.015;
      i++;
      if (i % 5 === 0) x += 0.12;
    }
  }
  // carve front: overlay a darker inset by placing back panel
  return g;
}

function globe(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.5, 0.6, 0.5, mat(C.white), [0, 0.3, 0], 0.04));
  g.add(cyl(0.08, 0.12, 0.06, mat(C.woodDark), [0, 0.63, 0]));
  g.add(cyl(0.015, 0.015, 0.2, mat(C.woodDark), [0, 0.72, 0], 6));
  const s = sphere(0.22, mat("#3B82F6", { rough: 0.4 }), [0, 0.9, 0], 20);
  g.add(s);
  const land = mat("#34D399", { flat: true });
  g.add(blob(0.09, land, [0.12, 0.98, 0.12]));
  g.add(blob(0.08, land, [-0.15, 0.86, 0.08]));
  g.add(blob(0.07, land, [0.03, 0.82, -0.18]));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.012, 6, 32), mat(C.woodDark, { metal: 0.4 }));
  ring.position.set(0, 0.9, 0);
  ring.rotation.y = Math.PI / 2;
  g.add(ring);
  g.userData.spin = s;
  return g;
}

function barSculpture(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.0, 0.18, 0.5, mat(C.white), [0, 0.09, 0], 0.04));
  const hs = [0.35, 0.6, 0.9, 1.25];
  hs.forEach((h, i) => {
    const c = i === 3 ? color : new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.45 - i * 0.12).getStyle();
    g.add(box(0.17, h, 0.3, mat(c, { rough: 0.45, metal: 0.15 }), [-0.33 + i * 0.22, 0.18 + h / 2, 0], 0.03));
  });
  // arrow
  g.add(box(0.06, 0.06, 0.06, mat("#0AC18E"), [0.33, 1.52, 0], 0.02));
  return g;
}

function filingCabinet(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.5, 1.05, 0.55, mat("#CBD3DE", { metal: 0.2, rough: 0.5 }), [0, 0.525, 0], 0.03));
  for (let i = 0; i < 3; i++) {
    g.add(box(0.44, 0.005, 0.02, mat(C.steel), [0, 0.35 + i * 0.32, 0.28]));
    g.add(box(0.14, 0.03, 0.03, mat(C.steel, { metal: 0.6 }), [0, 0.22 + i * 0.32, 0.29], 0.01));
  }
  g.add(box(0.3, 0.06, 0.24, mat("#F59E0B"), [0, 1.08, 0], 0.02));
  return g;
}

function easel(): THREE.Group {
  const g = new THREE.Group();
  const w = mat(C.woodDark);
  const l1 = box(0.04, 1.4, 0.04, w, [-0.22, 0.68, 0]);
  l1.rotation.z = -0.12;
  const l2 = box(0.04, 1.4, 0.04, w, [0.22, 0.68, 0]);
  l2.rotation.z = 0.12;
  const l3 = box(0.04, 1.3, 0.04, w, [0, 0.62, -0.25]);
  l3.rotation.x = -0.3;
  g.add(l1, l2, l3);
  g.add(box(0.6, 0.04, 0.08, w, [0, 0.62, 0.04]));
  const canvas = new THREE.Group();
  canvas.add(box(0.62, 0.5, 0.03, mat(C.white), [0, 0, 0]));
  canvas.add(plane(0.54, 0.42, texMat(signTex("nova-art", "Aa", "#EC4899", "#FFF1F7")), [0, 0, 0.017]));
  canvas.position.set(0, 0.92, 0.06);
  canvas.rotation.x = -0.1;
  g.add(canvas);
  return g;
}

function drawingTable(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.06, 0.8, 0.06, mat(C.dark), [-0.45, 0.4, -0.2]));
  g.add(box(0.06, 0.8, 0.06, mat(C.dark), [0.45, 0.4, -0.2]));
  g.add(box(0.06, 0.62, 0.06, mat(C.dark), [-0.45, 0.31, 0.25]));
  g.add(box(0.06, 0.62, 0.06, mat(C.dark), [0.45, 0.31, 0.25]));
  const top = new THREE.Group();
  top.add(box(1.1, 0.04, 0.7, mat(C.white), [0, 0, 0], 0.015));
  top.add(plane(0.6, 0.45, texMat(sketchTex()), [0, 0.025, 0]).rotateX(-Math.PI / 2));
  top.add(box(0.3, 0.02, 0.03, mat("#F97362"), [0.35, 0.03, 0.2]));
  top.position.set(0, 0.75, 0.02);
  top.rotation.x = 0.28;
  g.add(top);
  return g;
}

function printer3d(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.7, 0.55, 0.55, mat(C.offWhite), [0, 0.275, 0], 0.03));
  g.add(box(0.72, 0.6, 0.57, new THREE.MeshStandardMaterial({ color: "#9FD8F5", transparent: true, opacity: 0.35, roughness: 0.1 }), [0, 0.86, 0], 0.02));
  g.add(box(0.74, 0.06, 0.59, mat(C.dark), [0, 1.18, 0], 0.02));
  g.add(box(0.12, 0.08, 0.12, mat(C.dark), [0.05, 1.05, 0]));
  g.add(cyl(0.012, 0.004, 0.06, basic("#FFB37A"), [0.05, 0.98, 0], 6));
  g.add(cyl(0.12, 0.16, 0.22, mat(color, { rough: 0.4 }), [0.05, 0.67, 0]));
  g.add(box(0.2, 0.05, 0.01, basic("#0AC18E"), [-0.18, 0.4, 0.28]));
  return g;
}

function tripodCamera(): THREE.Group {
  const g = new THREE.Group();
  const leg = mat(C.dark, { metal: 0.3 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const l = box(0.03, 1.0, 0.03, leg, [Math.sin(a) * 0.2, 0.48, Math.cos(a) * 0.2]);
    l.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
    g.add(l);
  }
  g.add(box(0.36, 0.22, 0.2, mat("#111827", { rough: 0.4 }), [0, 1.05, 0], 0.03));
  const lens = cyl(0.08, 0.09, 0.18, mat("#1F2937", { metal: 0.5, rough: 0.3 }), [0, 1.05, 0.16]);
  lens.rotation.x = Math.PI / 2;
  g.add(lens);
  g.add(sphere(0.025, basic("#FF3B3B"), [0.13, 1.14, 0.1], 8));
  return g;
}

function ringLight(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.18, 0.2, 0.04, mat(C.dark), [0, 0.02, 0]));
  g.add(cyl(0.018, 0.018, 1.25, mat(C.dark, { metal: 0.4 }), [0, 0.64, 0], 8));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 10, 40), basic("#FFF8E7"));
  ring.position.set(0, 1.5, 0);
  ring.castShadow = true;
  g.add(ring);
  g.add(cyl(0.05, 0.05, 0.05, mat(C.dark), [0, 1.5, 0]).rotateX(Math.PI / 2));
  return g;
}

function rocket(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.38, 0.42, 0.18, mat(C.dark), [0, 0.09, 0], 24));
  g.add(cyl(0.3, 0.3, 0.02, basic("#0AC18E"), [0, 0.19, 0], 24));
  const body = mat("#F8FAFC", { rough: 0.35 });
  g.add(cyl(0.17, 0.15, 0.7, body, [0, 0.62, 0]));
  g.add(cyl(0.0, 0.17, 0.36, mat("#FF7A6B", { rough: 0.4 }), [0, 1.15, 0]));
  g.add(sphere(0.07, mat("#60A5FA", { rough: 0.2, metal: 0.3 }), [0, 0.78, 0.14], 12));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const fin = box(0.03, 0.3, 0.2, mat("#FF7A6B"), [Math.sin(a) * 0.17, 0.38, Math.cos(a) * 0.17]);
    fin.rotation.y = a;
    g.add(fin);
  }
  g.add(cyl(0.12, 0.07, 0.12, mat("#F5C542", { emissive: "#F59E0B", ei: 0.6 }), [0, 0.22, 0]));
  return g;
}

function serverRack(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.55, 1.4, 0.6, mat("#1E2533", { rough: 0.5 }), [0, 0.7, 0], 0.03));
  const leds = [basic("#0AC18E"), basic("#60A5FA"), basic("#F5C542")];
  for (let i = 0; i < 7; i++) {
    g.add(box(0.47, 0.13, 0.01, mat("#2B3446"), [0, 0.2 + i * 0.165, 0.305]));
    g.add(box(0.035, 0.035, 0.01, leds[i % 3]!, [-0.17, 0.2 + i * 0.165, 0.312]));
    g.add(box(0.035, 0.035, 0.01, leds[(i + 1) % 3]!, [-0.11, 0.2 + i * 0.165, 0.312]));
  }
  return g;
}

function beanBag(color: string): THREE.Group {
  const g = new THREE.Group();
  const m = mat(color, { rough: 0.95 });
  const s = sphere(0.45, m, [0, 0.24, 0], 20);
  s.scale.set(1.1, 0.55, 1.1);
  s.receiveShadow = true;
  g.add(s);
  const back = sphere(0.36, m, [0, 0.42, -0.28], 18);
  back.scale.set(1.15, 0.8, 0.6);
  g.add(back);
  return g;
}

function counter(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.7, 0.95, 2.2, mat(C.white), [0, 0.475, 0], 0.05));
  g.add(box(0.82, 0.06, 2.3, mat(C.wood), [0.05, 0.98, 0], 0.025));
  g.add(box(0.02, 0.5, 1.9, basic(color), [0.36, 0.5, 0]));
  // cash register
  const reg = new THREE.Group();
  reg.add(box(0.42, 0.14, 0.38, mat(C.dark), [0, 0.07, 0], 0.03));
  reg.add(box(0.36, 0.06, 0.24, mat("#334155"), [0.02, 0.17, 0.02], 0.02));
  const scr = box(0.05, 0.2, 0.3, mat(C.darker), [-0.1, 0.32, 0], 0.02);
  scr.rotation.z = 0.25;
  reg.add(scr);
  reg.add(plane(0.26, 0.15, basic(color), [-0.07, 0.33, 0], Math.PI / 2).rotateX(0));
  reg.add(box(0.12, 0.02, 0.12, mat("#F5C542", { metal: 0.6, rough: 0.3 }), [0.12, 0.215, -0.08]));
  reg.position.set(0.05, 1.01, 0.55);
  g.add(reg);
  // coin stack
  for (let i = 0; i < 4; i++) g.add(cyl(0.06, 0.06, 0.02, mat("#F5C542", { metal: 0.6, rough: 0.35 }), [0.15, 1.02 + i * 0.022, -0.55], 16));
  g.add(cyl(0.06, 0.06, 0.02, mat("#0AC18E", { metal: 0.4, rough: 0.35 }), [0.22, 1.02, -0.38], 16));
  return g;
}

function roundTable(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.45, 0.45, 0.05, mat(C.white), [0, 0.6, 0], 28));
  g.add(cyl(0.04, 0.04, 0.58, mat(C.dark), [0, 0.3, 0], 8));
  g.add(cyl(0.22, 0.22, 0.03, mat(C.dark), [0, 0.015, 0], 16));
  g.add(box(0.22, 0.01, 0.3, mat("#FFFFFF"), [0.08, 0.632, 0.02]).rotateY(0.3));
  g.add(cyl(0.04, 0.035, 0.08, mat(color), [-0.18, 0.66, -0.1]));
  for (const a of [0.6, 2.6]) {
    g.add(cyl(0.16, 0.16, 0.06, mat(color, { rough: 0.85 }), [Math.sin(a) * 0.7, 0.4, Math.cos(a) * 0.7], 16));
    g.add(cyl(0.03, 0.03, 0.38, mat(C.dark), [Math.sin(a) * 0.7, 0.19, Math.cos(a) * 0.7], 6));
  }
  return g;
}

function coffeeTable(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.8, 0.05, 0.45, mat(C.wood), [0, 0.32, 0], 0.02));
  for (const [x, z] of [[-0.34, -0.17], [0.34, -0.17], [-0.34, 0.17], [0.34, 0.17]] as const)
    g.add(box(0.04, 0.3, 0.04, mat(C.dark), [x, 0.15, z]));
  g.add(box(0.26, 0.03, 0.18, mat("#0AC18E"), [-0.12, 0.36, 0], 0.01));
  g.add(cyl(0.04, 0.035, 0.08, mat(C.white), [0.2, 0.38, 0.05]));
  return g;
}

function tvStand(t: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.5, 0.04, 0.34, mat(C.dark), [0, 0.02, 0], 0.015));
  g.add(box(0.06, 1.0, 0.06, mat(C.steel, { metal: 0.4, rough: 0.4 }), [0, 0.52, 0]));
  g.add(box(1.0, 0.6, 0.05, mat(C.darker, { rough: 0.4 }), [0, 1.08, 0.04], 0.025));
  g.add(plane(0.94, 0.54, texMat(t), [0, 1.08, 0.068]));
  return g;
}

function wallShelf(colors: string[]): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.0, 0.04, 0.24, mat(C.wood), [0, 0, 0.12], 0.01));
  colors.forEach((c, i) => g.add(box(0.07, 0.2 + (i % 2) * 0.05, 0.16, mat(c), [-0.38 + i * 0.09, 0.12 + (i % 2) * 0.025, 0.12])));
  const p = plant("small");
  p.position.set(0.32, 0.02, 0.12);
  p.scale.setScalar(0.8);
  g.add(p);
  return g;
}

function credenza(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.1, 0.5, 0.4, mat(C.white), [0, 0.25, 0], 0.03));
  g.add(box(0.02, 0.4, 0.01, mat("#DDE3EA"), [0, 0.25, 0.2]));
  g.add(box(0.24, 0.3, 0.2, mat(color, { rough: 0.6 }), [-0.3, 0.65, 0], 0.03));
  const p = plant("small");
  p.position.set(0.3, 0.5, 0);
  g.add(p);
  return g;
}

function deskLamp(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.07, 0.08, 0.03, mat(C.dark), [0, 0.015, 0], 12));
  const arm = box(0.025, 0.32, 0.025, mat(C.dark), [0.04, 0.17, 0]);
  arm.rotation.z = -0.25;
  g.add(arm);
  const sh = cyl(0.04, 0.08, 0.1, mat("#F8FAFC", { emissive: "#FFE7A3", ei: 0.5 }), [0.1, 0.33, 0], 12);
  sh.rotation.z = 0.6;
  g.add(sh);
  return g;
}

// ---------- room furnishing ----------

export type Furnished = {
  group: THREE.Group;
  screens: THREE.Mesh[];
  spinners: THREE.Object3D[];
  ringLights: THREE.Object3D[];
  beanBag?: THREE.Vector3;
};

/**
 * Builds the furniture for one room in room-local coordinates
 * (x ∈ [−3, 3], z ∈ [−2.5, 2.5]). Back rooms open towards +z (corridor),
 * front rooms have the corridor (with a door) at −z.
 */
export function furnishRoom(r: RoomDef, wallH: number): Furnished {
  const g = new THREE.Group();
  const screens: THREE.Mesh[] = [];
  const spinners: THREE.Object3D[] = [];
  const ringLights: THREE.Object3D[] = [];
  const out: Furnished = { group: g, screens, spinners, ringLights };
  const back = r.row === "back";
  const col = r.color;
  const v = ({ mia: 0, leo: 1, sam: 1, nova: 2, dex: 2, rae: 0, pip: 1, lobby: 0 } as Record<DeptId, number>)[r.id];

  // standard workstation (not in the lobby, which has the counter)
  if (r.id !== "lobby") {
    if (back) {
      const d = desk(col, v);
      d.g.position.set(r.seat.x, 0, -2.0);
      g.add(d.g);
      screens.push(d.screen);
      const ch = officeChair(col);
      ch.position.set(r.seat.x, 0, r.seat.z - 0.02);
      ch.rotation.y = Math.PI;
      g.add(ch);
    } else {
      const d = desk(col, v);
      d.g.position.set(-2.38, 0, r.seat.z);
      d.g.rotation.y = Math.PI / 2;
      g.add(d.g);
      screens.push(d.screen);
      const ch = officeChair(col);
      ch.position.set(r.seat.x + 0.04, 0, r.seat.z);
      ch.rotation.y = -Math.PI / 2;
      g.add(ch);
    }
  }

  const place = (o: THREE.Object3D, x: number, z: number, rotY = 0) => {
    o.position.set(x, o.position.y, z);
    o.rotation.y = rotY;
    g.add(o);
    return o;
  };
  const onBackWall = (o: THREE.Object3D, x: number, y: number) => {
    o.position.set(x, y, -2.5 + 0.12 + 0.035);
    g.add(o);
  };
  const onLeftWall = (o: THREE.Object3D, z: number, y: number) => {
    o.position.set(-3 + 0.12 + 0.035, y, z);
    o.rotation.y = Math.PI / 2;
    g.add(o);
  };

  switch (r.id) {
    case "mia": {
      onBackWall(wallPanel(whiteboardTex(), 1.7, 0.82, "#D7DEE8", true), 1.25, 0.82);
      g.add(box(1.6, 0.04, 0.08, mat("#CBD3DE"), [1.25, 0.43, -2.43]));
      place(lamp(), 2.55, -2.1);
      place(roundTable(col), 1.35, 0.15);
      place(plant("tall"), -2.6, -2.1);
      place(plant("bush"), 2.55, 1.85);
      g.add(rectRug("#E4E0FB", 2.2, 1.8, 1.35, 0.2));
      place(credenza(col), -2.6, 1.3, Math.PI / 2);
      onLeftWall(wallPanel(signTex("mia-goal", "Plan", col, "#F5F3FF"), 0.9, 0.34, C.white), -0.5, 0.85);
      break;
    }
    case "leo": {
      onBackWall(wallPanel(wallScreenTex(), 1.6, 0.9, C.darker), 1.3, 0.8);
      g.add(box(1.8, 0.35, 0.4, mat(C.white), [1.3, 0.175, -2.25], 0.03));
      place(globe(), 2.45, 0.2);
      spinners.push(g.children[g.children.length - 1]!.userData.spin as THREE.Object3D);
      place(bookshelf(1.1, ["#3B82F6", "#93C5FD", "#1E3A8A", "#F59E0B", "#E5E7EB"]), -2.75, 0.6, Math.PI / 2);
      place(plant("bush"), -2.6, 2.0);
      place(plant("small"), 0.6, -2.25);
      place(beanBag("#BFDBFE"), 1.25, 1.35, -0.5);
      place(tvStand(screenTex(col, 2)), 1.25, -0.6, -0.35);
      break;
    }
    case "sam": {
      place(barSculpture(col), 1.3, 0.35, -0.3);
      place(filingCabinet(), 2.5, -2.15);
      place(filingCabinet(), 1.92, -2.15);
      onBackWall(wallPanel(screenTex(col, 1), 1.0, 0.62, C.darker), 0.55, 0.85);
      place(plant("tall"), -2.6, -2.1, 0.4);
      place(plant("bush", C.terracotta), 2.55, 1.9);
      place(credenza(col), -2.6, 1.3, Math.PI / 2);
      onLeftWall(wallShelf(["#F59E0B", "#FCD34D", "#334155", "#E5E7EB"]), -0.6, 0.95);
      g.add(rectRug("#FDF0D5", 2.0, 1.6, 1.3, 0.4));
      break;
    }
    case "nova": {
      onBackWall(wallPanel(moodboardTex(), 1.7, 0.85, "#C9AF91", true), 1.3, 0.8);
      place(sofa("#F472B6", 1.6), 1.25, 0.95);
      place(coffeeTable(), 1.25, 0.15);
      place(easel(), 2.45, -1.2, -0.5);
      place(plant("bush"), -2.6, 2.0);
      place(plant("small", C.terracotta), 0.35, -2.25);
      place(plant("tall"), 2.6, 2.1);
      onLeftWall(wallShelf(["#EC4899", "#F9A8D4", "#7C3AED", "#FDE68A"]), -0.4, 0.95);
      g.add(rug("#FBCFE8", 1.0, 1.25, 0.6));
      break;
    }
    case "lobby": {
      onLeftWall(wallPanel(logoWallTex(), 2.2, 1.1, "#0E2A25"), -0.35, 0.72);
      place(counter(col), -1.25, -0.35);
      place(sofa("#5EEAD4", 1.7), 1.5, 1.7, Math.PI);
      place(coffeeTable(), 1.5, 0.95);
      g.add(rug("#99F6E4", 1.25, 1.35, 1.1));
      place(plant("tall"), -2.6, 2.05);
      place(plant("bush"), 2.6, -2.05);
      place(plant("small"), -2.6, -2.15);
      break;
    }
    case "dex": {
      place(drawingTable(), 1.2, -1.25, -0.25);
      const stool = new THREE.Group();
      stool.add(cyl(0.17, 0.17, 0.06, mat(col), [0, 0.55, 0]));
      stool.add(cyl(0.03, 0.03, 0.52, mat(C.dark), [0, 0.27, 0], 6));
      place(stool, 1.0, -0.55);
      place(printer3d(col), 2.45, 0.35);
      place(bookshelf(1.0, ["#F97362", "#FDBA74", "#334155", "#FCD34D", "#E5E7EB"]), 2.75, 1.55, -Math.PI / 2);
      place(plant("bush"), -2.6, 2.0);
      place(plant("small"), -2.5, -2.15);
      place(tvStand(screenTex(col, 2)), 0.0, 1.5, Math.PI * 0.85);
      onLeftWall(wallPanel(sketchTex(), 0.6, 0.6, C.white), 1.4, 0.8);
      break;
    }
    case "rae": {
      const rl = ringLight();
      place(rl, 2.3, -1.6, -0.6);
      ringLights.push(rl);
      place(tripodCamera(), 0.9, 0.1, Math.PI * 0.75 + 0.2);
      place(sofa("#2DD4BF", 1.5), 2.2, 0.75, -Math.PI / 2);
      place(plant("tall"), 2.5, 2.05);
      place(plant("bush"), -2.6, 2.0);
      onLeftWall(wallPanel(signTex("rae-onair", "ON AIR", "#FF5A5A", "#1A0F14"), 0.9, 0.34, "#1F2937"), 1.45, 0.85);
      g.add(rectRug("#CCFBF1", 1.6, 1.4, 1.9, -0.9));
      break;
    }
    case "pip": {
      place(serverRack(), 0.95, -2.05);
      place(serverRack(), 1.6, -2.05);
      place(serverRack(), 2.25, -2.05);
      place(rocket(), 2.3, 1.6);
      place(beanBag("#64748B"), 0.75, 0.95, -0.4);
      out.beanBag = new THREE.Vector3(0.75, 0, 0.95);
      place(plant("bush"), -2.6, 2.0);
      place(plant("small"), 2.65, -0.6);
      place(tvStand(screenTex(col, 1)), -0.4, 1.7, Math.PI * 0.9);
      onLeftWall(wallPanel(signTex("pip-sign", "LAUNCH", "#0AC18E", "#0B1B1A"), 0.95, 0.36, "#1F2937"), 1.45, 0.85);
      break;
    }
  }
  return out;
}
