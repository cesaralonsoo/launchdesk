// WS-A · furniture and department props. Everything is built in room-local coordinates
// (x ∈ [−3, 3], z ∈ [−2.5, 2.5]); back rooms open towards +z, front rooms have the corridor glass at −z.
import * as THREE from "three";
import type { Room } from "../../contracts";
import { Builder, mixHex, type P3, type Registry } from "./kit";
import type { RoomDef } from "./layout";
import {
  calendarTex, consoleTex, financeWallTex, logoGridTex, marketWallTex, moodboardTex, planWallTex, printTex, radialTex,
  rugTex, screenTex, softRectTex, wordmarkTex,
} from "./textures";

export interface Ctx {
  R: Registry;
  B: Builder;
  room: Room;
  color: string;
}

const C = {
  oak: "#D8BE98",
  oakDark: "#A37E58",
  lacquer: "#F4F3F0",
  metal: "#2C3037",
  steel: "#A9AEB6",
  fabric: "#D9D4CC",
  leafA: "#3E6E4B",
  leafB: "#2F5A3C",
  leafC: "#6E9A66",
  leafD: "#527F55",
  pot: "#E9E4DC",
  terracotta: "#C98463",
  potDark: "#3B3B3D",
  ink: "#1E2229",
  brass: "#B8925A",
};

export interface Furnished {
  /** Animated bits that must not be baked. */
  spinners: THREE.Object3D[];
  /** Screens the agent looks at (for the 'working' glow). */
  deskFocus: THREE.Vector3;
}

// ─────────────────────────────────────────────── material shortcuts
const fx = (c: Ctx, color: string, rough = 0.7, metal = 0) => c.R.m("fixed", c.room, c.color, { color, rough, metal });
// two finishes per accent role (lacquer / fabric) keep the draw-call count low after baking
const accent = (c: Ctx, rough = 0.75) => c.R.m("accent", c.room, c.color, { rough: rough < 0.6 ? 0.42 : 0.85 });
const accentSoft = (c: Ctx, rough = 0.85) => c.R.m("accentSoft", c.room, c.color, { rough: rough < 0.6 ? 0.5 : 0.9 });
const screen = (c: Ctx, t: THREE.Texture) => c.R.m("screen", c.room, c.color, { map: t });
const lampShade = (c: Ctx) => c.R.m("lamp", c.room, c.color, { color: "#FBF4E6", rough: 0.5 });

function shadowRect(c: Ctx, w: number, d: number, pos: P3, parent?: THREE.Object3D, o = 0.32, rotY = 0) {
  c.B.decal(w, d, c.R.m("shadow", c.room, c.color, { map: softRectTex(), opacity: Math.min(0.72, o * 1.9) }), [pos[0], 0.006, pos[2]], parent, rotY);
}
function shadowRound(c: Ctx, r: number, pos: P3, parent?: THREE.Object3D, o = 0.3) {
  c.B.decal(r * 2, r * 2, c.R.m("shadow", c.room, c.color, { map: radialTex(), opacity: Math.min(0.72, o * 1.9), key: "round" }), [pos[0], 0.007, pos[2]], parent);
}
function pool(c: Ctx, r: number, pos: P3, parent?: THREE.Object3D, o = 0.5) {
  c.B.decal(r * 2, r * 2, c.R.m("pool", c.room, c.color, { map: radialTex(), opacity: o }), [pos[0], 0.012, pos[2]], parent);
}

// ─────────────────────────────────────────────── pieces (built facing +Z, origin on the floor)

let plantSeed = 1;
function prng() {
  plantSeed = (plantSeed * 16807) % 2147483647;
  return (plantSeed - 1) / 2147483646;
}

/** One leaf: a flattened ellipsoid pointing along +Z of its own frame, tilted up by `pitch`, around Y by `yaw`. */
function leaf(c: Ctx, parent: THREE.Object3D, m: THREE.Material, at: P3, yaw: number, pitch: number, len: number, wid: number) {
  const g = c.B.sub(at, yaw, parent);
  const l = c.B.sphere(1, m, [0, 0, 0], 10, g);
  l.scale.set(wid, 0.012 + wid * 0.08, len);
  l.position.set(0, Math.sin(pitch) * len, Math.cos(pitch) * len);
  l.rotation.x = -pitch;
  return l;
}

export function plant(c: Ctx, parent: THREE.Object3D, pos: P3, kind: "tall" | "bush" | "small" | "palm" = "bush", pot = C.pot) {
  const { B } = c;
  plantSeed = 7 + Math.abs(Math.round(pos[0] * 131 + pos[2] * 71 + kind.length * 13)) + c.room.length * 101;
  const g = B.sub(pos, prng() * Math.PI * 2, parent);
  const leaves = [fx(c, C.leafA, 0.62), fx(c, C.leafB, 0.62), fx(c, C.leafC, 0.62), fx(c, C.leafD, 0.62)];
  const potM = fx(c, pot, 0.75);
  const soil = fx(c, "#4A3B2F", 1);
  const pick = () => leaves[Math.floor(prng() * leaves.length)]!;
  if (kind === "tall") {
    // olive / fig standard: tapered pot, slim trunk, three tiers of glossy leaves
    B.cyl(0.17, 0.13, 0.44, potM, [0, 0.22, 0], 28, g);
    B.cyl(0.175, 0.175, 0.025, potM, [0, 0.43, 0], 28, g);
    B.cyl(0.155, 0.155, 0.02, soil, [0, 0.432, 0], 20, g);
    B.cyl(0.012, 0.02, 0.95, fx(c, "#6B5442", 0.8), [0, 0.9, 0], 6, g);
    const tiers: Array<[number, number, number]> = [[1.05, 0.24, 9], [1.3, 0.2, 8], [1.52, 0.14, 6]];
    for (const [y, rad, n] of tiers) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + prng() * 0.6;
        leaf(c, g, pick(), [Math.sin(a) * rad * 0.35, y + (prng() - 0.5) * 0.1, Math.cos(a) * rad * 0.35], a, 0.15 + prng() * 0.5, 0.12 + prng() * 0.05, 0.07);
      }
    }
    shadowRound(c, 0.45, [0, 0, 0], g, 0.32);
  } else if (kind === "palm") {
    // sansevieria: upright sword leaves in two greens
    B.cyl(0.19, 0.16, 0.36, potM, [0, 0.18, 0], 28, g);
    B.cyl(0.175, 0.175, 0.02, soil, [0, 0.355, 0], 20, g);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + prng() * 0.5;
      const h = 0.42 + prng() * 0.42;
      const r = 0.03 + prng() * 0.09;
      const bl = B.box(0.055, h, 0.012, pick(), [Math.sin(a) * r, 0.36 + h / 2 - 0.02, Math.cos(a) * r], 0.006, g);
      bl.rotation.set(Math.cos(a) * (0.08 + r), a + prng(), -Math.sin(a) * (0.08 + r));
    }
    shadowRound(c, 0.45, [0, 0, 0], g, 0.32);
  } else if (kind === "small") {
    // succulent rosette in a small ceramic pot
    B.cyl(0.075, 0.06, 0.12, potM, [0, 0.06, 0], 20, g);
    B.cyl(0.068, 0.068, 0.01, soil, [0, 0.118, 0], 16, g);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 * 1.618;
      leaf(c, g, i % 3 === 0 ? leaves[2]! : leaves[3]!, [0, 0.13, 0], a, 0.35 + (i / 9) * 0.6, 0.05 + (i % 3) * 0.008, 0.03);
    }
    shadowRound(c, 0.14, [0, 0, 0], g, 0.25);
  } else {
    // monstera-ish bush: big leaves on long stems radiating from the pot
    B.cyl(0.2, 0.15, 0.34, potM, [0, 0.17, 0], 28, g);
    B.cyl(0.205, 0.205, 0.025, potM, [0, 0.335, 0], 28, g);
    B.cyl(0.185, 0.185, 0.02, soil, [0, 0.338, 0], 20, g);
    const n = 13;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + prng() * 0.4;
      const up = 0.35 + prng() * 0.55;
      const stem = 0.18 + prng() * 0.32;
      const sx = Math.sin(a) * stem * Math.cos(up) * 0.7, sz = Math.cos(a) * stem * Math.cos(up) * 0.7, sy = 0.34 + Math.sin(up) * stem;
      const st = B.cyl(0.006, 0.008, stem, leaves[1]!, [sx / 2, 0.34 + (sy - 0.34) / 2, sz / 2], 5, g);
      st.rotation.set(Math.cos(a) * (Math.PI / 2 - up) * 0.7, 0, -Math.sin(a) * (Math.PI / 2 - up) * 0.7);
      leaf(c, g, pick(), [sx, sy, sz], a, 0.1 + prng() * 0.35, 0.13 + prng() * 0.05, 0.11);
    }
    shadowRound(c, 0.5, [0, 0, 0], g, 0.32);
  }
  return g;
}

export function floorLamp(c: Ctx, parent: THREE.Object3D, pos: P3) {
  const { B } = c;
  const g = B.sub(pos, 0, parent);
  B.cyl(0.13, 0.14, 0.022, fx(c, C.brass, 0.35, 0.8), [0, 0.011, 0], 24, g);
  B.cyl(0.011, 0.011, 1.42, fx(c, C.brass, 0.35, 0.8), [0, 0.72, 0], 8, g);
  B.cyl(0.13, 0.19, 0.24, lampShade(c), [0, 1.5, 0], 28, g);
  pool(c, 0.8, [0, 0, 0], g, 0.55);
  shadowRound(c, 0.22, [0, 0, 0], g, 0.25);
  return g;
}

function deskLamp(c: Ctx, parent: THREE.Object3D, pos: P3) {
  const { B } = c;
  const g = B.sub(pos, 0, parent);
  B.cyl(0.06, 0.065, 0.02, fx(c, C.metal, 0.4, 0.3), [0, 0.01, 0], 16, g);
  const a1 = B.cyl(0.009, 0.009, 0.3, fx(c, C.metal, 0.4, 0.3), [0.03, 0.15, 0], 6, g);
  a1.rotation.z = -0.2;
  const sh = B.cyl(0.035, 0.075, 0.09, lampShade(c), [0.09, 0.3, 0], 18, g);
  sh.rotation.z = 0.7;
  return g;
}

function monitor(c: Ctx, parent: THREE.Object3D, pos: P3, tex: THREE.Texture, w = 0.78, h = 0.46, rotY = 0) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  B.box(0.16, 0.012, 0.12, fx(c, C.metal, 0.4, 0.3), [0, 0.006, 0], 0.005, g);
  B.box(0.03, 0.2, 0.025, fx(c, C.metal, 0.4, 0.3), [0, 0.11, -0.03], 0, g);
  B.box(w + 0.03, h + 0.03, 0.03, fx(c, C.ink, 0.35), [0, 0.2 + h / 2, 0], 0.012, g);
  B.plane(w, h, screen(c, tex), [0, 0.2 + h / 2, 0.0155], g);
  return g;
}

/** Desk with monitor, keyboard, mug, lamp. Faces +Z (the sitter is at +Z). */
export function desk(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number, screenVariant: number, opts: { w?: number; dual?: boolean } = {}) {
  const { B } = c;
  const w = opts.w ?? 1.5;
  const g = B.sub(pos, rotY, parent);
  shadowRect(c, w + 0.5, 1.15, [0, 0, 0], g, 0.34);
  B.box(w, 0.045, 0.72, fx(c, C.oak, 0.55), [0, 0.7, 0], 0.018, g);
  // slim A-frame legs
  for (const sx of [-1, 1]) {
    B.box(0.035, 0.68, 0.035, fx(c, C.metal, 0.4, 0.3), [sx * (w / 2 - 0.08), 0.34, -0.28], 0, g);
    B.box(0.035, 0.68, 0.035, fx(c, C.metal, 0.4, 0.3), [sx * (w / 2 - 0.08), 0.34, 0.28], 0, g);
    B.box(0.035, 0.035, 0.6, fx(c, C.metal, 0.4, 0.3), [sx * (w / 2 - 0.08), 0.1, 0], 0, g);
  }
  // drawer pedestal in lacquer
  B.box(0.36, 0.5, 0.56, fx(c, C.lacquer, 0.45), [w / 2 - 0.3, 0.27, -0.02], 0.025, g);
  B.box(0.12, 0.012, 0.012, fx(c, C.steel, 0.3, 0.7), [w / 2 - 0.3, 0.42, 0.265], 0, g);
  const tex = screenTex(c.color, screenVariant);
  if (opts.dual) {
    monitor(c, g, [-0.33, 0.722, -0.18], tex, 0.62, 0.38, 0.12);
    monitor(c, g, [0.33, 0.722, -0.18], screenTex(c.color, (screenVariant + 1) % 5), 0.62, 0.38, -0.12);
  } else {
    monitor(c, g, [0, 0.722, -0.2], tex);
  }
  B.box(0.46, 0.018, 0.15, fx(c, "#E9E8E4", 0.5), [-0.02, 0.731, 0.14], 0.008, g);
  B.box(0.06, 0.02, 0.1, fx(c, "#E9E8E4", 0.4), [0.32, 0.732, 0.15], 0.02, g);
  B.cyl(0.042, 0.038, 0.09, accent(c, 0.45), [-w / 2 + 0.2, 0.767, 0.08], 18, g);
  deskLamp(c, g, [w / 2 - 0.18, 0.722, -0.2]);
  // a notebook
  B.box(0.2, 0.012, 0.26, accentSoft(c), [-w / 2 + 0.25, 0.728, -0.12], 0.004, g).rotation.y = 0.2;
  pool(c, 0.55, [w / 2 - 0.1, 0.725, 0.0], g, 0.25);
  return g;
}

export function taskChair(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  shadowRound(c, 0.35, [0, 0, 0], g, 0.3);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = B.box(0.035, 0.03, 0.26, fx(c, C.metal, 0.4, 0.3), [Math.sin(a) * 0.12, 0.05, Math.cos(a) * 0.12], 0.01, g);
    leg.rotation.y = a;
  }
  B.cyl(0.022, 0.022, 0.24, fx(c, C.steel, 0.3, 0.7), [0, 0.17, 0], 10, g);
  B.box(0.46, 0.07, 0.44, accent(c, 0.85), [0, 0.32, 0], 0.03, g);
  const back = B.box(0.42, 0.44, 0.06, accent(c, 0.85), [0, 0.62, -0.22], 0.03, g);
  back.rotation.x = -0.08;
  return g;
}

function sofa(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number, w = 1.6, m?: THREE.Material) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  const fab = m ?? accent(c, 0.95);
  shadowRect(c, w + 0.5, 1.05, [0, 0, 0], g, 0.34);
  B.box(w, 0.2, 0.74, fab, [0, 0.18, 0], 0.07, g);
  B.box(w, 0.44, 0.2, fab, [0, 0.4, -0.27], 0.08, g);
  B.box(0.16, 0.3, 0.74, fab, [-w / 2 + 0.08, 0.33, 0], 0.07, g);
  B.box(0.16, 0.3, 0.74, fab, [w / 2 - 0.08, 0.33, 0], 0.07, g);
  const cush = accentSoft(c, 0.95);
  B.box(w / 2 - 0.15, 0.1, 0.52, fab, [-w / 4 + 0.04, 0.32, 0.06], 0.045, g);
  B.box(w / 2 - 0.15, 0.1, 0.52, fab, [w / 4 - 0.04, 0.32, 0.06], 0.045, g);
  const pillow = B.box(0.3, 0.26, 0.09, cush, [-w / 2 + 0.36, 0.5, -0.12], 0.04, g);
  pillow.rotation.set(-0.25, 0.15, 0.1);
  for (const sx of [-1, 1]) B.cyl(0.02, 0.015, 0.08, fx(c, C.oakDark), [sx * (w / 2 - 0.1), 0.04, 0.26], 8, g);
  return g;
}

function armchair(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  shadowRound(c, 0.55, [0, 0, 0], g, 0.3);
  const fab = accent(c, 0.95);
  B.box(0.72, 0.2, 0.7, fab, [0, 0.2, 0], 0.08, g);
  const back = B.box(0.72, 0.5, 0.16, fab, [0, 0.45, -0.28], 0.07, g);
  back.rotation.x = -0.12;
  B.box(0.12, 0.26, 0.66, fab, [-0.32, 0.38, 0], 0.05, g);
  B.box(0.12, 0.26, 0.66, fab, [0.32, 0.38, 0], 0.05, g);
  for (const [x, z] of [[-0.28, -0.26], [0.28, -0.26], [-0.28, 0.26], [0.28, 0.26]] as const) B.cyl(0.02, 0.015, 0.12, fx(c, C.oakDark), [x, 0.05, z], 8, g);
  return g;
}

function sideTable(c: Ctx, parent: THREE.Object3D, pos: P3, h = 0.5, r = 0.24) {
  const { B } = c;
  const g = B.sub(pos, 0, parent);
  shadowRound(c, r + 0.12, [0, 0, 0], g, 0.25);
  B.cyl(r, r, 0.035, fx(c, C.oak, 0.5), [0, h, 0], 32, g);
  B.cyl(0.018, 0.018, h, fx(c, C.metal, 0.4, 0.3), [0, h / 2, 0], 8, g);
  B.cyl(0.14, 0.15, 0.02, fx(c, C.metal, 0.4, 0.3), [0, 0.01, 0], 20, g);
  return g;
}

function coffeeTable(c: Ctx, parent: THREE.Object3D, pos: P3, rotY = 0) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  shadowRect(c, 1.1, 0.7, [0, 0, 0], g, 0.25);
  B.box(0.86, 0.04, 0.48, fx(c, C.oak, 0.5), [0, 0.34, 0], 0.02, g);
  for (const [x, z] of [[-0.38, -0.19], [0.38, -0.19], [-0.38, 0.19], [0.38, 0.19]] as const) B.cyl(0.018, 0.018, 0.32, fx(c, C.metal, 0.4, 0.3), [x, 0.16, z], 8, g);
  return g;
}

function rug(c: Ctx, parent: THREE.Object3D, kind: "rect" | "round", w: number, d: number, pos: P3) {
  const m = c.R.m("rug", c.room, c.color, { map: rugTex(kind), rough: 1 }) as THREE.MeshStandardMaterial;
  m.transparent = true;
  m.alphaTest = 0.5;
  const mesh = c.B.decal(w, d, m, [pos[0], 0.003, pos[2]], parent);
  mesh.receiveShadow = true;
  return mesh;
}

/** Framed thing on a wall; faces +Z in its own frame. */
function framed(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number, tex: THREE.Texture, w: number, h: number, frame = C.lacquer, lit = true) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  B.box(w + 0.06, h + 0.06, 0.035, fx(c, frame, 0.5), [0, 0, 0], 0.01, g);
  const m = lit ? c.R.m("fixed", c.room, c.color, { map: tex, rough: 0.85, key: "art" }) : screen(c, tex);
  B.plane(w, h, m, [0, 0, 0.0185], g);
  return g;
}

function bookshelf(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number, w = 1.1, h = 1.1) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  shadowRect(c, w + 0.3, 0.6, [0, 0, 0], g, 0.3);
  const m = fx(c, C.lacquer, 0.5);
  B.box(w, 0.03, 0.34, m, [0, h, 0], 0.01, g);
  B.box(w, 0.06, 0.34, m, [0, 0.03, 0], 0.01, g);
  for (const sx of [-1, 1]) B.box(0.03, h, 0.34, m, [sx * (w / 2 - 0.015), h / 2, 0], 0, g);
  B.box(w - 0.04, h, 0.012, fx(c, "#E7E3DC", 0.8), [0, h / 2, -0.165], 0, g);
  const shelves = 3;
  const books = [accent(c, 0.7), accentSoft(c), fx(c, "#E9E3D8", 0.8), fx(c, "#3A3D44", 0.7), fx(c, C.oakDark, 0.7)];
  for (let s = 0; s < shelves; s++) {
    const y = 0.06 + s * ((h - 0.06) / shelves);
    if (s > 0) B.box(w - 0.06, 0.025, 0.32, m, [0, y, 0], 0, g);
    let x = -w / 2 + 0.08;
    let i = s * 4;
    while (x < w / 2 - 0.16) {
      const bw = 0.045 + ((i * 7) % 4) * 0.012;
      const bh = 0.18 + ((i * 5) % 3) * 0.035;
      B.box(bw, bh, 0.22, books[i % books.length]!, [x + bw / 2, y + 0.012 + bh / 2, 0.02], 0, g);
      x += bw + 0.008;
      i++;
      if (i % 6 === 0) x += 0.14;
    }
  }
  plant(c, g, [w / 2 - 0.14, h + 0.015, 0], "small");
  return g;
}

function credenza(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number, w = 1.2) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  shadowRect(c, w + 0.3, 0.65, [0, 0, 0], g, 0.3);
  B.box(w, 0.48, 0.4, fx(c, C.oak, 0.55), [0, 0.3, 0], 0.02, g);
  for (const sx of [-1, 1]) B.cyl(0.018, 0.014, 0.08, fx(c, C.metal, 0.4, 0.3), [sx * (w / 2 - 0.08), 0.04, 0.12], 8, g);
  B.box(0.004, 0.42, 0.005, fx(c, C.oakDark, 0.7), [0, 0.3, 0.2], 0, g);
  return g;
}

// ─────────────────────────────────────────────── department sets

function miaSet(c: Ctx, g: THREE.Group) {
  const { B } = c;
  // planning wall: a long pin board on the feature wall, with a marker rail
  framed(c, g, [1.15, 0.86, -2.36], 0, planWallTex(c.color), 2.3, 1.08, C.lacquer);
  B.box(2.0, 0.03, 0.07, fx(c, C.steel, 0.35, 0.6), [1.15, 0.27, -2.33], 0.01, g);
  for (let i = 0; i < 3; i++) B.cyl(0.012, 0.012, 0.12, i === 0 ? accent(c) : fx(c, ["#2C3037", "#0AC18E", "#E8604C"][i]!, 0.5), [0.6 + i * 0.12, 0.3, -2.31], 8, g).rotation.z = Math.PI / 2;
  // standing meeting table with two stools
  const t = B.sub([1.2, 0, 0.25], 0, g);
  shadowRound(c, 0.75, [0, 0, 0], t, 0.25);
  B.cyl(0.5, 0.5, 0.04, fx(c, C.lacquer, 0.4), [0, 0.74, 0], 40, t);
  B.cyl(0.03, 0.03, 0.72, fx(c, C.metal, 0.4, 0.3), [0, 0.37, 0], 10, t);
  B.cyl(0.22, 0.24, 0.02, fx(c, C.metal, 0.4, 0.3), [0, 0.01, 0], 24, t);
  B.box(0.22, 0.01, 0.3, fx(c, "#FFE9A8", 0.9), [0.12, 0.765, 0.05], 0, t).rotation.y = 0.35;
  B.box(0.18, 0.01, 0.18, accentSoft(c), [-0.18, 0.765, -0.1], 0, t).rotation.y = -0.2;
  for (const a of [0.9, 2.5]) {
    const s = B.sub([Math.sin(a) * 0.78, 0, Math.cos(a) * 0.78], 0, t);
    B.cyl(0.17, 0.17, 0.06, accent(c, 0.85), [0, 0.5, 0], 24, s);
    B.cyl(0.02, 0.02, 0.48, fx(c, C.metal, 0.4, 0.3), [0, 0.24, 0], 8, s);
    shadowRound(c, 0.24, [0, 0, 0], s, 0.2);
  }
  rug(c, g, "rect", 2.4, 2.0, [1.2, 0, 0.3]);
  floorLamp(c, g, [2.6, 0, -2.05]);
  credenza(c, g, [-2.68, 0, 0.75], Math.PI / 2, 1.3);
  plant(c, g, [-2.68, 0.54, 1.15], "small");
  B.box(0.24, 0.18, 0.18, accent(c, 0.6), [-2.68, 0.63, 0.4], 0.02, g);
  plant(c, g, [-2.6, 0, 2.0], "tall");
  plant(c, g, [2.6, 0, 1.95], "bush", C.terracotta);
}

function leoSet(c: Ctx, g: THREE.Group, spinners: THREE.Object3D[]) {
  const { B } = c;
  // market wall: big screen over a low media console
  framed(c, g, [1.2, 0.98, -2.34], 0, marketWallTex(c.color), 1.72, 0.97, C.ink, false);
  const con = B.sub([1.2, 0, -2.18], 0, g);
  shadowRect(c, 2.2, 0.6, [0, 0, 0], con, 0.3);
  B.box(1.9, 0.36, 0.38, fx(c, C.lacquer, 0.45), [0, 0.2, 0], 0.02, con);
  for (const x of [-0.475, 0.475]) B.box(0.004, 0.3, 0.004, fx(c, "#D5D2CC", 0.6), [x, 0.2, 0.19], 0, con);
  B.box(0.3, 0.06, 0.2, accent(c, 0.6), [-0.6, 0.41, 0], 0.02, con);
  plant(c, con, [0.72, 0.38, 0], "small");
  // globe on a side table
  const gt = sideTable(c, g, [2.45, 0, 0.2], 0.55, 0.26);
  const globe = new THREE.Group();
  globe.position.set(0, 0.84, 0);
  globe.userData.keep = true;
  gt.add(globe);
  B.cyl(0.07, 0.09, 0.03, fx(c, C.metal, 0.4, 0.4), [0, -0.24, 0], 20, globe);
  B.cyl(0.008, 0.008, 0.24, fx(c, C.metal, 0.4, 0.4), [0, -0.12, 0], 6, globe);
  const ball = new THREE.Group();
  ball.rotation.z = 0.41;
  globe.add(ball);
  const sea = B.sphere(0.2, accent(c, 0.35), [0, 0, 0], 32, ball);
  sea.castShadow = true;
  const land = fx(c, "#F1EEE8", 0.8);
  B.blob(0.085, land, [0.12, 0.08, 0.1], 1, ball);
  B.blob(0.075, land, [-0.13, -0.03, 0.1], 1, ball);
  B.blob(0.06, land, [0.03, -0.1, -0.15], 1, ball);
  B.blob(0.07, land, [-0.05, 0.12, -0.12], 1, ball);
  const ring = B.torus(0.235, 0.008, fx(c, C.metal, 0.35, 0.6), [0, 0, 0], Math.PI * 1.2, globe);
  ring.rotation.set(0, Math.PI / 2, 0.41 - Math.PI * 0.1);
  spinners.push(ball);
  // reading corner
  armchair(c, g, [1.05, 0, 0.95], Math.PI + 0.35);
  rug(c, g, "round", 2.3, 2.3, [1.2, 0, 0.6]);
  bookshelf(c, g, [-2.72, 0, 0.75], Math.PI / 2, 1.3, 1.1);
  plant(c, g, [-2.6, 0, 2.0], "palm");
  floorLamp(c, g, [2.55, 0, -1.2]);
}

function samSet(c: Ctx, g: THREE.Group) {
  const { B } = c;
  framed(c, g, [1.25, 0.92, -2.36], 0, financeWallTex(c.color), 1.75, 1.02, C.lacquer);
  // bar sculpture: four rising blocks, the last in the dept colour
  const s = B.sub([1.3, 0, 0.45], -0.35, g);
  shadowRect(c, 1.3, 0.8, [0, 0, 0], s, 0.3);
  B.box(1.0, 0.16, 0.5, fx(c, C.lacquer, 0.45), [0, 0.08, 0], 0.03, s);
  const hs = [0.3, 0.5, 0.72, 1.0];
  hs.forEach((h, i) => {
    const m = i === 3 ? accent(c, 0.35) : c.R.m("accentSoft", c.room, c.color, { rough: 0.5, shade: 1.06 - i * 0.06 });
    B.box(0.17, h, 0.28, m, [-0.33 + i * 0.22, 0.16 + h / 2, 0], 0.025, s);
  });
  // calculator + paper on a side table
  const st = sideTable(c, g, [2.55, 0, -0.6], 0.55, 0.26);
  const calc = B.sub([0, 0.57, 0], 0.4, st);
  B.box(0.16, 0.025, 0.22, fx(c, C.ink, 0.5), [0, 0.012, 0], 0.012, calc);
  B.box(0.12, 0.004, 0.05, fx(c, "#B9E4D3", 0.4), [0, 0.027, -0.07], 0, calc);
  for (let i = 0; i < 12; i++) B.box(0.024, 0.006, 0.024, i % 4 === 3 ? accent(c, 0.5) : fx(c, "#E9E8E4", 0.5), [-0.045 + (i % 4) * 0.03, 0.028, -0.01 + Math.floor(i / 4) * 0.04], 0, calc);
  B.box(0.21, 0.004, 0.29, fx(c, "#FFFFFF", 0.9), [0.06, 0.568, 0.04], 0, st).rotation.y = -0.3;
  // binders on a low cabinet along the wall
  const cab = B.sub([2.35, 0, -2.18], 0, g);
  shadowRect(c, 1.2, 0.6, [0, 0, 0], cab, 0.3);
  B.box(0.95, 0.5, 0.36, fx(c, C.lacquer, 0.45), [0, 0.25, 0], 0.02, cab);
  for (let i = 0; i < 6; i++) B.box(0.07, 0.3, 0.24, i % 3 === 0 ? accent(c, 0.6) : accentSoft(c), [-0.36 + i * 0.085, 0.65, 0], 0.01, cab);
  rug(c, g, "rect", 2.1, 1.7, [1.3, 0, 0.5]);
  credenza(c, g, [-2.68, 0, 0.8], Math.PI / 2, 1.2);
  plant(c, g, [-2.68, 0.54, 1.15], "small");
  plant(c, g, [-2.6, 0, 2.0], "tall", C.terracotta);
  plant(c, g, [2.6, 0, 1.95], "bush");
}

function novaSet(c: Ctx, g: THREE.Group) {
  const { B } = c;
  framed(c, g, [1.2, 0.86, -2.36], 0, moodboardTex(c.color), 1.9, 1.08, "#C8B39A");
  sofa(c, g, [1.2, 0, 1.15], Math.PI, 1.7);
  coffeeTable(c, g, [1.2, 0, 0.25]);
  // swatch fan on the table
  for (let i = 0; i < 5; i++) {
    const sw = B.box(0.05, 0.006, 0.22, i === 2 ? accent(c, 0.6) : c.R.m("accentSoft", c.room, c.color, { rough: 0.7, shade: 1.1 - i * 0.08 }), [1.0, 0.367 + i * 0.002, 0.25], 0, g);
    sw.rotation.y = -0.6 + i * 0.25;
  }
  B.box(0.2, 0.03, 0.26, fx(c, "#2B2622", 0.7), [1.45, 0.375, 0.22], 0.005, g).rotation.y = 0.15;
  rug(c, g, "round", 2.4, 2.4, [1.2, 0, 0.6]);
  // easel with a canvas
  const e = B.sub([2.45, 0, -1.25], -0.55, g);
  const wood = fx(c, C.oakDark, 0.6);
  const l1 = B.box(0.035, 1.4, 0.035, wood, [-0.22, 0.68, 0], 0, e);
  l1.rotation.z = -0.12;
  const l2 = B.box(0.035, 1.4, 0.035, wood, [0.22, 0.68, 0], 0, e);
  l2.rotation.z = 0.12;
  const l3 = B.box(0.035, 1.3, 0.035, wood, [0, 0.62, -0.25], 0, e);
  l3.rotation.x = -0.3;
  B.box(0.6, 0.035, 0.08, wood, [0, 0.6, 0.04], 0, e);
  const cv = B.sub([0, 0.94, 0.07], 0, e);
  cv.rotation.x = -0.1;
  B.box(0.62, 0.5, 0.03, fx(c, "#FBFAF7", 0.8), [0, 0, 0], 0.005, cv);
  B.plane(0.56, 0.44, c.R.m("fixed", c.room, c.color, { map: printTex(c.color, 0), rough: 0.9 }), [0, 0, 0.016], cv);
  shadowRound(c, 0.4, [0, 0, 0], e, 0.22);
  plant(c, g, [-2.6, 0, 2.0], "bush");
  plant(c, g, [2.6, 0, 2.05], "tall");
  floorLamp(c, g, [-2.6, 0, 0.9]);
}

function lobbySet(c: Ctx, g: THREE.Group) {
  const { B } = c;
  // wordmark on the feature wall (exterior wall, faces +x)
  framed(c, g, [-2.93, 0.78, -0.2], Math.PI / 2, wordmarkTex(), 1.9, 0.6, "#16201C");
  // reception counter: long oak top over a lacquer body with an accent kick
  const ct = B.sub([-1.25, 0, -0.35], 0, g);
  shadowRect(c, 1.2, 2.7, [0, 0, 0], ct, 0.36);
  B.box(0.62, 0.95, 2.1, fx(c, C.lacquer, 0.45), [0, 0.475, 0], 0.04, ct);
  B.box(0.74, 0.05, 2.22, fx(c, C.oak, 0.5), [0.04, 0.975, 0], 0.02, ct);
  B.box(0.012, 0.08, 2.0, accent(c, 0.5), [0.316, 0.06, 0], 0, ct);
  B.box(0.012, 0.6, 0.02, accent(c, 0.5), [0.316, 0.5, -0.95], 0, ct);
  // payment terminal + coins
  const reg = B.sub([0.05, 1.0, 0.45], -0.3, ct);
  B.box(0.16, 0.03, 0.24, fx(c, C.ink, 0.4), [0, 0.015, 0], 0.012, reg);
  const s2 = B.box(0.14, 0.002, 0.11, c.R.m("screen", c.room, c.color, { map: screenTex(c.color, 3) }), [0, 0.032, -0.04], 0, reg);
  s2.receiveShadow = false;
  for (let i = 0; i < 4; i++) B.cyl(0.05, 0.05, 0.016, fx(c, "#D9B45A", 0.3, 0.8), [0.08, 1.008 + i * 0.017, -0.6], 24, ct);
  B.cyl(0.05, 0.05, 0.016, accent(c, 0.35), [0.16, 1.008, -0.42], 24, ct);
  plant(c, ct, [0.0, 1.0, -0.85], "small");
  // waiting area
  sofa(c, g, [1.45, 0, 1.75], Math.PI, 1.8);
  coffeeTable(c, g, [1.45, 0, 0.9]);
  B.box(0.22, 0.03, 0.3, accentSoft(c), [1.3, 0.375, 0.9], 0.005, g).rotation.y = 0.2;
  B.cyl(0.04, 0.035, 0.08, fx(c, C.lacquer, 0.4), [1.7, 0.4, 0.95], 16, g);
  rug(c, g, "round", 2.6, 2.6, [1.45, 0, 1.15]);
  plant(c, g, [-2.55, 0, 2.05], "palm");
  plant(c, g, [2.6, 0, -2.05], "tall");
  floorLamp(c, g, [2.6, 0, 1.0]);
}

function dexSet(c: Ctx, g: THREE.Group) {
  const { B } = c;
  // drawing tablet table (tilted top) + stool
  const t = B.sub([1.1, 0, -1.2], -0.25, g);
  shadowRect(c, 1.4, 1.0, [0, 0, 0], t, 0.3);
  for (const [x, z, h] of [[-0.48, -0.25, 0.86], [0.48, -0.25, 0.86], [-0.48, 0.25, 0.66], [0.48, 0.25, 0.66]] as const)
    B.box(0.035, h, 0.035, fx(c, C.metal, 0.4, 0.3), [x, h / 2, z], 0, t);
  const top = B.sub([0, 0.78, 0], 0, t);
  top.rotation.x = 0.3;
  B.box(1.1, 0.035, 0.66, fx(c, C.oak, 0.5), [0, 0, 0], 0.012, top);
  B.box(0.56, 0.012, 0.38, fx(c, C.ink, 0.35), [0, 0.022, 0], 0.01, top);
  B.box(0.5, 0.002, 0.32, c.R.m("screen", c.room, c.color, { map: logoGridTex(c.color) }), [0, 0.03, 0], 0, top).receiveShadow = false;
  const pen = B.cyl(0.008, 0.008, 0.16, accent(c, 0.4), [0.38, 0.035, 0.1], 8, top);
  pen.rotation.set(Math.PI / 2, 0, 0.6);
  const stool = B.sub([1.0, 0, -0.45], 0, g);
  B.cyl(0.17, 0.17, 0.05, accent(c, 0.85), [0, 0.6, 0], 24, stool);
  B.cyl(0.02, 0.02, 0.58, fx(c, C.metal, 0.4, 0.3), [0, 0.29, 0], 8, stool);
  B.torus(0.13, 0.01, fx(c, C.metal, 0.4, 0.3), [0, 0.26, 0], Math.PI * 2, stool).rotation.x = Math.PI / 2;
  shadowRound(c, 0.25, [0, 0, 0], stool, 0.22);
  // logo exploration board on the feature wall
  framed(c, g, [-2.9, 0.78, 1.75], Math.PI / 2, logoGridTex(c.color), 1.1, 0.42, C.lacquer);
  bookshelf(c, g, [2.68, 0, 1.1], -Math.PI / 2, 1.3, 1.0);
  rug(c, g, "rect", 2.0, 1.6, [1.0, 0, -0.9]);
  plant(c, g, [2.55, 0, -2.0], "tall");
  plant(c, g, [-2.55, 0, 2.1], "bush", C.terracotta);
  floorLamp(c, g, [0.0, 0, 1.95]);
}

function raeSet(c: Ctx, g: THREE.Group) {
  const { B } = c;
  // content corner: paper backdrop roll in the dept colour
  const bd = B.sub([2.0, 0, -1.75], 0, g);
  const pole = fx(c, "#8A8F98", 0.35, 0.6);
  for (const sx of [-1, 1]) {
    B.cyl(0.015, 0.015, 1.7, pole, [sx * 0.85, 0.85, -0.12], 8, bd);
    B.cyl(0.12, 0.12, 0.02, pole, [sx * 0.85, 0.01, -0.12], 16, bd);
  }
  B.cyl(0.05, 0.05, 1.7, accentSoft(c), [0, 1.66, -0.12], 20, bd).rotation.z = Math.PI / 2;
  B.box(1.6, 1.62, 0.01, accentSoft(c, 0.95), [0, 0.86, -0.1], 0, bd);
  const sweep = B.box(1.6, 0.01, 0.9, accentSoft(c, 0.95), [0, 0.006, 0.36], 0, bd);
  sweep.receiveShadow = true;
  // stool + plant prop on the backdrop
  B.cyl(0.14, 0.14, 0.04, fx(c, C.lacquer, 0.4), [-0.2, 0.46, 0.3], 24, bd);
  B.cyl(0.02, 0.02, 0.44, fx(c, C.oak, 0.6), [-0.2, 0.22, 0.3], 8, bd);
  plant(c, bd, [0.45, 0, 0.35], "bush");
  // ring light + tripod camera aimed at the backdrop
  const rl = B.sub([1.0, 0, -0.75], 0.55, g);
  B.cyl(0.14, 0.15, 0.02, pole, [0, 0.01, 0], 16, rl);
  B.cyl(0.012, 0.012, 1.26, pole, [0, 0.64, 0], 8, rl);
  B.torus(0.27, 0.035, lampShade(c), [0, 1.42, 0], Math.PI * 2, rl);
  const cam = B.sub([1.85, 0, 0.55], Math.PI + 0.05, g);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = B.box(0.022, 1.0, 0.022, pole, [Math.sin(a) * 0.18, 0.48, Math.cos(a) * 0.18], 0, cam);
    leg.rotation.set(Math.cos(a) * 0.36, 0, -Math.sin(a) * 0.36);
  }
  B.box(0.24, 0.16, 0.14, fx(c, C.ink, 0.4), [0, 1.04, 0], 0.025, cam);
  B.cyl(0.055, 0.06, 0.13, fx(c, "#3A3F47", 0.3, 0.5), [0, 1.04, 0.12], 20, cam).rotation.x = Math.PI / 2;
  B.sphere(0.014, c.R.m("led", c.room, c.color, { color: "#FF4D3D" }), [0.09, 1.1, 0.07], 8, cam);
  shadowRound(c, 0.35, [0, 0, 0], cam, 0.22);
  // calendar on the feature wall
  framed(c, g, [-2.9, 0.75, 1.75], Math.PI / 2, calendarTex(c.color), 0.86, 0.62, C.lacquer);
  sofa(c, g, [-0.4, 0, 2.05], Math.PI, 1.4);
  plant(c, g, [-2.55, 0, -2.05], "tall");
  plant(c, g, [0.75, 0, 2.15], "small");
}

function pipSet(c: Ctx, g: THREE.Group) {
  const { B } = c;
  // server racks along the corridor glass
  for (let k = 0; k < 3; k++) {
    const r = B.sub([0.95 + k * 0.66, 0, -2.08], 0, g);
    shadowRect(c, 0.9, 0.9, [0, 0, 0], r, 0.35);
    B.box(0.6, 1.5, 0.62, fx(c, "#EDEDEB", 0.4, 0.1), [0, 0.75, 0], 0.025, r);
    B.box(0.52, 1.36, 0.01, fx(c, "#2F343C", 0.4, 0.3), [0, 0.76, 0.31], 0, r);
    for (let i = 0; i < 8; i++) {
      const y = 0.2 + i * 0.16;
      B.box(0.48, 0.11, 0.008, fx(c, "#373C45", 0.4, 0.3), [0, y, 0.318], 0, r);
      const led = c.R.m("led", c.room, c.color, { color: (i + k) % 3 === 0 ? "#0AC18E" : (i + k) % 3 === 1 ? "#7FB2FF" : "#F2C04A" });
      B.box(0.025, 0.025, 0.006, led, [-0.19, y, 0.324], 0, r);
      B.box(0.025, 0.025, 0.006, c.R.m("led", c.room, c.color, { color: "#0AC18E" }), [-0.15, y, 0.324], 0, r);
    }
  }
  // launch console screen on the feature wall
  framed(c, g, [-2.9, 0.78, 1.75], Math.PI / 2, consoleTex(c.color), 1.0, 0.48, C.ink, false);
  // bean bag (Pip naps here before launch)
  const bb = B.sub([1.85, 0, 0.45], -0.9, g);
  shadowRound(c, 0.6, [0, 0, 0], bb, 0.3);
  const s1 = B.sphere(0.45, accent(c, 0.95), [0, 0.22, 0], 28, bb);
  s1.scale.set(1.1, 0.5, 1.1);
  const s2 = B.sphere(0.36, accent(c, 0.95), [0, 0.4, -0.26], 24, bb);
  s2.scale.set(1.15, 0.78, 0.6);
  // small rocket model on a plinth
  const rk = B.sub([2.45, 0, 1.6], 0, g);
  shadowRound(c, 0.4, [0, 0, 0], rk, 0.25);
  B.box(0.42, 0.5, 0.42, fx(c, C.lacquer, 0.45), [0, 0.25, 0], 0.02, rk);
  B.cyl(0.07, 0.06, 0.3, fx(c, "#F7F7F5", 0.35), [0, 0.67, 0], 20, rk);
  B.cyl(0.0, 0.07, 0.15, accent(c, 0.4), [0, 0.895, 0], 20, rk);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const fin = B.box(0.012, 0.11, 0.08, accent(c, 0.4), [Math.sin(a) * 0.07, 0.56, Math.cos(a) * 0.07], 0, rk);
    fin.rotation.y = a;
  }
  B.sphere(0.022, fx(c, "#7FB2FF", 0.2, 0.3), [0, 0.72, 0.062], 12, rk);
  // go-live podium: one big green button
  const pd = B.sub([-0.55, 0, 1.75], 0.5, g);
  shadowRound(c, 0.45, [0, 0, 0], pd, 0.3);
  B.cyl(0.24, 0.27, 0.9, fx(c, C.lacquer, 0.4), [0, 0.45, 0], 32, pd);
  B.cyl(0.25, 0.25, 0.03, fx(c, C.ink, 0.35), [0, 0.915, 0], 32, pd);
  B.cyl(0.13, 0.13, 0.02, fx(c, "#2F343C", 0.4), [0, 0.94, 0], 28, pd);
  const btn = B.sphere(0.11, c.R.m("led", c.room, c.color, { color: "#0AC18E" }), [0, 0.95, 0], 28, pd);
  btn.scale.set(1, 0.45, 1);
  plant(c, g, [-2.55, 0, -0.9], "bush");
  plant(c, g, [2.6, 0, -0.55], "tall");
  floorLamp(c, g, [-1.55, 0, 1.95]);
}

/** Furnish one room. Returns non-static things for animation. */
export function furnish(c: Ctx, r: RoomDef, g: THREE.Group): Furnished {
  const spinners: THREE.Object3D[] = [];
  const back = r.row === "back";
  const v: Record<string, number> = { mia: 2, leo: 4, sam: 1, nova: 0, dex: 3, rae: 2, pip: 3, lobby: 0 };
  let deskFocus = new THREE.Vector3();
  if (r.id !== "lobby") {
    if (back) {
      desk(c, g, [r.seat.x, 0, -1.98], 0, v[r.id]!, { dual: r.id === "leo" || r.id === "sam" });
      taskChair(c, g, [r.seat.x, 0, r.seat.z + 0.05], Math.PI);
      deskFocus = new THREE.Vector3(r.seat.x, 1.0, -2.2);
    } else {
      desk(c, g, [-2.36, 0, r.seat.z], Math.PI / 2, v[r.id]!, { dual: r.id === "dex" });
      taskChair(c, g, [r.seat.x + 0.06, 0, r.seat.z], -Math.PI / 2);
      deskFocus = new THREE.Vector3(-2.6, 1.0, r.seat.z);
    }
  }
  switch (r.id) {
    case "mia": miaSet(c, g); break;
    case "leo": leoSet(c, g, spinners); break;
    case "sam": samSet(c, g); break;
    case "nova": novaSet(c, g); break;
    case "lobby": lobbySet(c, g); break;
    case "dex": dexSet(c, g); break;
    case "rae": raeSet(c, g); break;
    case "pip": pipSet(c, g); break;
  }
  // evening room glow: one broad warm pool (fakes the interior lamps on every quality level)
  c.B.decal(4.6, 3.8, c.R.m("pool", c.room, c.color, { map: radialTex(), opacity: 0.22, key: "roomglow" }), [back ? 0 : 0.3, 0.011, back ? -0.3 : 0.3], g);
  // working light: a soft dept-coloured pool around the workstation
  const wp = back ? [r.seat.x, 0, -1.4] : [-1.9, 0, r.seat.z];
  c.B.decal(3.0, 2.6, c.R.m("workPool", c.room, c.color, { map: radialTex(), opacity: 0.55 }), [wp[0]!, 0.014, wp[2]!], g);
  return { spinners, deskFocus };
}

export { mixHex };
