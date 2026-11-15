// WS-A · furniture and department props. Everything is built in room-local coordinates
// (x ∈ [−3, 3], z ∈ [−2.5, 2.5]); back rooms open towards +z, front rooms have the corridor glass at −z.
import * as THREE from "three";
import { Builder, mixHex, type P3, type Registry, type Room } from "./kit";
import { laptopScreenTex, pixelRugTex } from "./pixel";
import { isPixel, isVoxel } from "./style";
import { radialTex, rugTex, screenTex, softRectTex } from "./textures";

export interface Ctx {
  R: Registry;
  B: Builder;
  room: Room;
  color: string;
  /** Second analyst colour (r3 shared by two). */
  color2?: string;
}

export const C = {
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


// ─────────────────────────────────────────────── material shortcuts
export const fx = (c: Ctx, color: string, rough = 0.7, metal = 0) => c.R.m("fixed", c.room, c.color, { color, rough, metal });
// two finishes per accent role (lacquer / fabric) keep the draw-call count low after baking
export const accent = (c: Ctx, rough = 0.75) => c.R.m("accent", c.room, c.color, { rough: rough < 0.6 ? 0.42 : 0.85 });
export const accentSoft = (c: Ctx, rough = 0.85) => c.R.m("accentSoft", c.room, c.color, { rough: rough < 0.6 ? 0.5 : 0.9 });
export const screen = (c: Ctx, t: THREE.Texture) => c.R.m("screen", c.room, c.color, { map: t });
export const lampShade = (c: Ctx) => c.R.m("lamp", c.room, c.color, { color: "#FBF4E6", rough: 0.5 });

export function shadowRect(c: Ctx, w: number, d: number, pos: P3, parent?: THREE.Object3D, o = 0.32, rotY = 0) {
  c.B.decal(w, d, c.R.m("shadow", c.room, c.color, { map: softRectTex(), opacity: Math.min(0.72, o * 1.9) }), [pos[0], 0.006, pos[2]], parent, rotY);
}
export function shadowRound(c: Ctx, r: number, pos: P3, parent?: THREE.Object3D, o = 0.3) {
  c.B.decal(r * 2, r * 2, c.R.m("shadow", c.room, c.color, { map: radialTex(), opacity: Math.min(0.72, o * 1.9), key: "round" }), [pos[0], 0.007, pos[2]], parent);
}
export function pool(c: Ctx, r: number, pos: P3, parent?: THREE.Object3D, o = 0.5) {
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
  if (isVoxel()) {
    // voxel plants: a square pot and foliage as stacked leaf cubes in 4 greens
    const potW = kind === "small" ? 0.14 : kind === "tall" ? 0.3 : 0.34;
    const potH = kind === "small" ? 0.12 : kind === "tall" ? 0.42 : 0.34;
    B.box(potW, potH, potW, potM, [0, potH / 2, 0], 0, g);
    B.box(potW * 1.08, 0.03, potW * 1.08, potM, [0, potH, 0], 0, g);
    B.box(potW * 0.86, 0.02, potW * 0.86, soil, [0, potH + 0.012, 0], 0, g);
    const cube = (sz: number, x: number, y: number, z: number) => {
      const m = B.box(sz, sz, sz, pick(), [x, y, z], 0, g);
      m.rotation.y = Math.floor(prng() * 4) * (Math.PI / 8);
      return m;
    };
    if (kind === "small") {
      for (let i = 0; i < 5; i++) cube(0.05 + prng() * 0.02, (prng() - 0.5) * 0.08, potH + 0.04 + prng() * 0.05, (prng() - 0.5) * 0.08);
      shadowRound(c, 0.14, [0, 0, 0], g, 0.25);
    } else if (kind === "palm") {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const h = 0.3 + prng() * 0.4;
        B.box(0.06, h, 0.06, pick(), [Math.sin(a) * 0.08, potH + h / 2, Math.cos(a) * 0.08], 0, g);
      }
      shadowRound(c, 0.45, [0, 0, 0], g, 0.32);
    } else if (kind === "tall") {
      B.box(0.035, 0.9, 0.035, fx(c, "#6B5442", 0.8), [0, potH + 0.45, 0], 0, g);
      for (let i = 0; i < 16; i++) {
        const y = potH + 0.75 + prng() * 0.6, r = 0.08 + (1 - (y - potH - 0.75) / 0.6) * 0.16;
        const a = prng() * Math.PI * 2;
        cube(0.11 + prng() * 0.05, Math.sin(a) * r, y, Math.cos(a) * r);
      }
      shadowRound(c, 0.45, [0, 0, 0], g, 0.32);
    } else {
      for (let i = 0; i < 14; i++) {
        const a = prng() * Math.PI * 2, r = 0.05 + prng() * 0.2;
        cube(0.11 + prng() * 0.06, Math.sin(a) * r, potH + 0.08 + prng() * 0.32, Math.cos(a) * r);
      }
      shadowRound(c, 0.5, [0, 0, 0], g, 0.32);
    }
    return g;
  }
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

export function deskLamp(c: Ctx, parent: THREE.Object3D, pos: P3) {
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

export function sofa(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number, w = 1.6, m?: THREE.Material) {
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

export function armchair(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number) {
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

export function sideTable(c: Ctx, parent: THREE.Object3D, pos: P3, h = 0.5, r = 0.24) {
  const { B } = c;
  const g = B.sub(pos, 0, parent);
  shadowRound(c, r + 0.12, [0, 0, 0], g, 0.25);
  B.cyl(r, r, 0.035, fx(c, C.oak, 0.5), [0, h, 0], 32, g);
  B.cyl(0.018, 0.018, h, fx(c, C.metal, 0.4, 0.3), [0, h / 2, 0], 8, g);
  B.cyl(0.14, 0.15, 0.02, fx(c, C.metal, 0.4, 0.3), [0, 0.01, 0], 20, g);
  return g;
}

export function coffeeTable(c: Ctx, parent: THREE.Object3D, pos: P3, rotY = 0) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  shadowRect(c, 1.1, 0.7, [0, 0, 0], g, 0.25);
  B.box(0.86, 0.04, 0.48, fx(c, C.oak, 0.5), [0, 0.34, 0], 0.02, g);
  for (const [x, z] of [[-0.38, -0.19], [0.38, -0.19], [-0.38, 0.19], [0.38, 0.19]] as const) B.cyl(0.018, 0.018, 0.32, fx(c, C.metal, 0.4, 0.3), [x, 0.16, z], 8, g);
  return g;
}

export function rug(c: Ctx, parent: THREE.Object3D, kind: "rect" | "round" | "stripe", w: number, d: number, pos: P3) {
  const map = kind === "stripe" ? pixelRugTex("stripe") : isPixel() ? pixelRugTex("rect") : rugTex(kind);
  const m = c.R.m("rug", c.room, c.color, { map, rough: 1 }) as THREE.MeshStandardMaterial;
  m.transparent = true;
  m.alphaTest = 0.5;
  const mesh = c.B.decal(w, d, m, [pos[0], 0.003, pos[2]], parent);
  mesh.receiveShadow = true;
  return mesh;
}

/** Framed thing on a wall; faces +Z in its own frame. */
export function framed(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number, tex: THREE.Texture, w: number, h: number, frame = C.lacquer, lit = true) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  B.box(w + 0.06, h + 0.06, 0.035, fx(c, frame, 0.5), [0, 0, 0], 0.01, g);
  const m = lit ? c.R.m("fixed", c.room, c.color, { map: tex, rough: 0.85, key: "art" }) : screen(c, tex);
  B.plane(w, h, m, [0, 0, 0.0185], g);
  return g;
}

export function bookshelf(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number, w = 1.1, h = 1.1) {
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

export function credenza(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number, w = 1.2) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  shadowRect(c, w + 0.3, 0.65, [0, 0, 0], g, 0.3);
  B.box(w, 0.48, 0.4, fx(c, C.oak, 0.55), [0, 0.3, 0], 0.02, g);
  for (const sx of [-1, 1]) B.cyl(0.018, 0.014, 0.08, fx(c, C.metal, 0.4, 0.3), [sx * (w / 2 - 0.08), 0.04, 0.12], 8, g);
  B.box(0.004, 0.42, 0.005, fx(c, C.oakDark, 0.7), [0, 0.3, 0.2], 0, g);
  return g;
}

// ─────────────────────────────────────────────── v7 pieces

/** Open laptop; faces +Z (the user sits at +Z). The screen is a pixel UI in the room colour. */
export function laptop(c: Ctx, parent: THREE.Object3D, pos: P3, rotY = 0, color = c.color) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  B.box(0.34, 0.018, 0.24, fx(c, "#C9CDD3", 0.35, 0.4), [0, 0.009, 0], 0.006, g);
  B.box(0.28, 0.003, 0.1, fx(c, "#8E949C", 0.5, 0.2), [0, 0.019, 0.04], 0, g);
  const lid = B.sub([0, 0.018, -0.115], 0, g);
  lid.rotation.x = -0.32;
  B.box(0.34, 0.22, 0.012, fx(c, "#C9CDD3", 0.35, 0.4), [0, 0.11, 0], 0.006, lid);
  B.plane(0.3, 0.18, screen(c, laptopScreenTex(color)), [0, 0.112, 0.0065], lid).receiveShadow = false;
  return g;
}

/** A simple desk without a monitor (laptop desks: CEO desk, Pip, bedroom). Faces +Z (sitter at +Z). */
export function laptopDesk(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number, w = 1.3, top = C.oak) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  shadowRect(c, w + 0.4, 1.0, [0, 0, 0], g, 0.32);
  B.box(w, 0.045, 0.66, fx(c, top, 0.55), [0, 0.7, 0], 0.018, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(0.04, 0.68, 0.04, fx(c, C.metal, 0.4, 0.3), [sx * (w / 2 - 0.06), 0.34, sz * 0.27], 0, g);
  laptop(c, g, [0, 0.722, 0.02], 0);
  return g;
}

// Room-specific sets live in ./rooms/ (one file per theme; registry in rooms/index.ts).

export { mixHex };
