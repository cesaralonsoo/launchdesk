// WS-A · furniture and department props. Everything is built in room-local coordinates
// (x ∈ [−3, 3], z ∈ [−2.5, 2.5]); back rooms open towards +z, front rooms have the corridor glass at −z.
import * as THREE from "three";
import type { AnalystRole } from "../../contracts";
import { Builder, mixHex, type P3, type Registry, type Room } from "./kit";
import type { RoomDef } from "./layout";
import { deptWallTex, laptopScreenTex, pixelRugTex, type WallKind } from "./pixel";
import { isPixel, isVoxel } from "./style";
import {
  calendarTex, logoGridTex, moodboardTex, printTex, radialTex, rugTex, screenTex, softRectTex,
} from "./textures";

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

export interface Furnished {
  /** Animated bits that must not be baked. */
  spinners: THREE.Object3D[];
  /** Screens the agent looks at (for the 'working' glow). */
  deskFocus: THREE.Vector3;
}

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

/** Low pedestal with a sculpture of rising blocks; `lit` = how many are in the dept colour. */
function steps(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number, n = 4, lit = 1) {
  const { B } = c;
  const s = B.sub(pos, rotY, parent);
  shadowRect(c, 1.3, 0.8, [0, 0, 0], s, 0.3);
  B.box(1.0, 0.16, 0.5, fx(c, C.lacquer, 0.45), [0, 0.08, 0], 0.03, s);
  for (let i = 0; i < n; i++) {
    const h = 0.26 + i * 0.22;
    const m = i >= n - lit ? accent(c, 0.35) : c.R.m("accentSoft", c.room, c.color, { rough: 0.5, shade: 1.06 - i * 0.06 });
    B.box(0.17, h, 0.28, m, [-0.33 + i * 0.22, 0.16 + h / 2, 0], 0.025, s);
  }
  return s;
}

function rack(c: Ctx, parent: THREE.Object3D, pos: P3, rotY = 0) {
  const { B } = c;
  const r = B.sub(pos, rotY, parent);
  shadowRect(c, 0.9, 0.9, [0, 0, 0], r, 0.35);
  B.box(0.6, 1.5, 0.62, fx(c, "#EDEDEB", 0.4, 0.1), [0, 0.75, 0], 0.025, r);
  B.box(0.52, 1.36, 0.01, fx(c, "#2F343C", 0.4, 0.3), [0, 0.76, 0.31], 0, r);
  for (let i = 0; i < 8; i++) {
    const y = 0.2 + i * 0.16;
    B.box(0.48, 0.11, 0.008, fx(c, "#373C45", 0.4, 0.3), [0, y, 0.318], 0, r);
    B.box(0.025, 0.025, 0.006, c.R.m("led", c.room, c.color, { color: i % 3 === 0 ? "#0AC18E" : i % 3 === 1 ? "#7FB2FF" : "#F2C04A" }), [-0.19, y, 0.324], 0, r);
    B.box(0.025, 0.025, 0.006, c.R.m("led", c.room, c.color, { color: "#0AC18E" }), [-0.15, y, 0.324], 0, r);
  }
  return r;
}

function globe(c: Ctx, parent: THREE.Object3D, pos: P3, spinners: THREE.Object3D[]) {
  const { B } = c;
  const gt = sideTable(c, parent, pos, 0.55, 0.26);
  const gl = new THREE.Group();
  gl.position.set(0, 0.84, 0);
  gl.userData.keep = true;
  gt.add(gl);
  B.cyl(0.07, 0.09, 0.03, fx(c, C.metal, 0.4, 0.4), [0, -0.24, 0], 20, gl);
  B.cyl(0.008, 0.008, 0.24, fx(c, C.metal, 0.4, 0.4), [0, -0.12, 0], 6, gl);
  const ball = new THREE.Group();
  ball.rotation.z = 0.41;
  gl.add(ball);
  B.sphere(0.2, accent(c, 0.35), [0, 0, 0], 32, ball);
  const land = fx(c, "#F1EEE8", 0.8);
  B.blob(0.085, land, [0.12, 0.08, 0.1], 1, ball);
  B.blob(0.075, land, [-0.13, -0.03, 0.1], 1, ball);
  B.blob(0.06, land, [0.03, -0.1, -0.15], 1, ball);
  B.blob(0.07, land, [-0.05, 0.12, -0.12], 1, ball);
  B.torus(0.235, 0.008, fx(c, C.metal, 0.35, 0.6), [0, 0, 0], Math.PI * 1.2, gl).rotation.set(0, Math.PI / 2, 0.41 - Math.PI * 0.1);
  spinners.push(ball);
}

/** The department's feature board on the back wall (pixel art, no numbers or names). */
function board(c: Ctx, g: THREE.Group, kind: WallKind, pos: P3 = [1.2, 0.95, -2.36], w = 2.0, rotY = 0, frame: string = C.lacquer) {
  framed(c, g, pos, rotY, deptWallTex(kind, c.color), w, w * (56 / 96), frame, kind !== "code");
}

// ─────────────────────────────────────────────── research wing: one set per analyst role

export const ROLE_WALL: Record<AnalystRole, WallKind> = {
  viability: "swot", competition: "competitors", market: "money", demand: "personas", pricing: "prices",
  location: "map", regulation: "rules", tech: "code", scalability: "growth",
};

function researchSet(c: Ctx, g: THREE.Group, role: AnalystRole | null, spinners: THREE.Object3D[]) {
  const { B } = c;
  board(c, g, role ? ROLE_WALL[role] : "vacant");
  switch (role) {
    case "viability": {
      // SWOT whiteboard + a standing table with notes and two stools
      B.box(2.0, 0.03, 0.07, fx(c, C.steel, 0.35, 0.6), [1.2, 0.33, -2.33], 0.01, g);
      for (let i = 0; i < 3; i++) B.cyl(0.012, 0.012, 0.12, i === 0 ? accent(c) : fx(c, ["#2C3037", "#22A06B", "#E5484D"][i]!, 0.5), [0.6 + i * 0.12, 0.36, -2.31], 8, g).rotation.z = Math.PI / 2;
      const t = B.sub([1.2, 0, 0.35], 0, g);
      shadowRound(c, 0.75, [0, 0, 0], t, 0.25);
      B.cyl(0.5, 0.5, 0.04, fx(c, C.lacquer, 0.4), [0, 0.74, 0], 40, t);
      B.cyl(0.03, 0.03, 0.72, fx(c, C.metal, 0.4, 0.3), [0, 0.37, 0], 10, t);
      B.cyl(0.22, 0.24, 0.02, fx(c, C.metal, 0.4, 0.3), [0, 0.01, 0], 24, t);
      B.box(0.22, 0.01, 0.22, fx(c, "#22A06B", 0.9), [0.14, 0.765, 0.05], 0, t).rotation.y = 0.35;
      B.box(0.2, 0.01, 0.2, fx(c, "#FFB8A3", 0.9), [-0.16, 0.765, -0.1], 0, t).rotation.y = -0.2;
      for (const a of [0.9, 2.5]) {
        const s = B.sub([Math.sin(a) * 0.78, 0, Math.cos(a) * 0.78], 0, t);
        B.cyl(0.17, 0.17, 0.06, accent(c, 0.85), [0, 0.5, 0], 24, s);
        B.cyl(0.02, 0.02, 0.48, fx(c, C.metal, 0.4, 0.3), [0, 0.24, 0], 8, s);
        shadowRound(c, 0.24, [0, 0, 0], s, 0.2);
      }
      rug(c, g, "rect", 2.4, 2.0, [1.2, 0, 0.4]);
      floorLamp(c, g, [2.6, 0, -2.05]);
      credenza(c, g, [-2.68, 0, 0.75], Math.PI / 2, 1.3);
      plant(c, g, [-2.68, 0.54, 1.15], "small");
      plant(c, g, [2.6, 0, 1.95], "bush", C.terracotta);
      break;
    }
    case "competition": {
      // cork wall of competitor cards, the globe, a reading chair and a shelf of reports
      globe(c, g, [2.45, 0, 0.1], spinners);
      armchair(c, g, [1.05, 0, 0.95], Math.PI + 0.35);
      rug(c, g, "round", 2.3, 2.3, [1.2, 0, 0.6]);
      bookshelf(c, g, [-2.72, 0, 0.75], Math.PI / 2, 1.3, 1.1);
      plant(c, g, [-2.6, 0, 2.0], "palm");
      floorLamp(c, g, [2.55, 0, -1.25]);
      break;
    }
    case "market": {
      // the money board, a coin-stack sculpture, calculator and binders
      steps(c, g, [1.3, 0, 0.45], -0.35, 4, 1);
      const st = sideTable(c, g, [2.55, 0, -0.6], 0.55, 0.26);
      const calc = B.sub([0, 0.57, 0], 0.4, st);
      B.box(0.16, 0.025, 0.22, fx(c, C.ink, 0.5), [0, 0.012, 0], 0.012, calc);
      B.box(0.12, 0.004, 0.05, fx(c, "#B9E4D3", 0.4), [0, 0.027, -0.07], 0, calc);
      for (let i = 0; i < 12; i++) B.box(0.024, 0.006, 0.024, i % 4 === 3 ? accent(c, 0.5) : fx(c, "#E9E8E4", 0.5), [-0.045 + (i % 4) * 0.03, 0.028, -0.01 + Math.floor(i / 4) * 0.04], 0, calc);
      for (let i = 0; i < 4; i++) B.cyl(0.05, 0.05, 0.016, fx(c, "#D9B45A", 0.3, 0.8), [-0.12, 0.575 + i * 0.017, 0.1], 16, st);
      rug(c, g, "rect", 2.1, 1.7, [1.3, 0, 0.5]);
      credenza(c, g, [-2.68, 0, 0.8], Math.PI / 2, 1.2);
      for (let i = 0; i < 5; i++) B.box(0.07, 0.3, 0.24, i % 3 === 0 ? accent(c, 0.6) : accentSoft(c), [-2.68, 0.69, 0.5 + i * 0.09], 0.01, g);
      plant(c, g, [-2.6, 0, 2.0], "tall", C.terracotta);
      plant(c, g, [2.6, 0, 1.95], "bush");
      break;
    }
    case "demand": {
      // persona board + an interview corner: two armchairs facing, a side table with two mugs
      armchair(c, g, [0.7, 0, 0.75], Math.PI * 0.75);
      armchair(c, g, [2.05, 0, 0.15], -Math.PI * 0.6);
      const st = sideTable(c, g, [1.55, 0, 1.05], 0.5, 0.22);
      B.cyl(0.04, 0.036, 0.08, accent(c, 0.45), [0.06, 0.55, 0], 14, st);
      B.cyl(0.04, 0.036, 0.08, fx(c, C.lacquer, 0.4), [-0.08, 0.55, 0.05], 14, st);
      rug(c, g, "round", 2.6, 2.6, [1.35, 0, 0.55]);
      credenza(c, g, [-2.68, 0, 0.8], Math.PI / 2, 1.2);
      plant(c, g, [-2.68, 0.54, 1.2], "small");
      plant(c, g, [2.6, 0, -2.0], "tall");
      plant(c, g, [-2.6, 0, 2.0], "bush", C.terracotta);
      break;
    }
    case "pricing": {
      // price-tag wall + a big tag sculpture + scales on a side table
      const tg = B.sub([1.3, 0, 0.5], -0.4, g);
      shadowRect(c, 1.2, 0.8, [0, 0, 0], tg, 0.3);
      B.box(0.9, 0.12, 0.45, fx(c, C.lacquer, 0.45), [0, 0.06, 0], 0.02, tg);
      B.box(0.5, 0.62, 0.06, accent(c, 0.4), [0, 0.47, 0], 0.02, tg);
      B.box(0.3, 0.3, 0.06, accent(c, 0.4), [0, 0.86, 0], 0.02, tg).rotation.z = Math.PI / 4;
      B.cyl(0.05, 0.05, 0.08, fx(c, C.lacquer, 0.4), [0, 0.86, 0], 12, tg).rotation.x = Math.PI / 2;
      const st = sideTable(c, g, [2.5, 0, -0.7], 0.55, 0.26);
      B.cyl(0.012, 0.012, 0.3, fx(c, C.brass, 0.35, 0.8), [0, 0.72, 0], 6, st);
      B.box(0.36, 0.012, 0.02, fx(c, C.brass, 0.35, 0.8), [0, 0.87, 0], 0, st);
      for (const sx of [-1, 1]) B.cyl(0.07, 0.05, 0.02, fx(c, C.brass, 0.35, 0.8), [sx * 0.17, 0.8, 0], 14, st);
      rug(c, g, "stripe", 2.2, 1.6, [1.3, 0, 0.5]);
      bookshelf(c, g, [-2.72, 0, 0.75], Math.PI / 2, 1.2, 1.0);
      plant(c, g, [2.6, 0, 1.95], "bush", C.terracotta);
      break;
    }
    case "location": {
      // the city map + a map table with block buildings and three pins
      const t = B.sub([1.25, 0, 0.45], 0, g);
      shadowRect(c, 1.8, 1.2, [0, 0, 0], t, 0.3);
      B.box(1.5, 0.05, 0.95, fx(c, C.oak, 0.5), [0, 0.6, 0], 0.015, t);
      for (const [x, z] of [[-0.66, -0.4], [0.66, -0.4], [-0.66, 0.4], [0.66, 0.4]] as const) B.box(0.04, 0.58, 0.04, fx(c, C.metal, 0.4, 0.3), [x, 0.29, z], 0, t);
      B.box(1.36, 0.01, 0.82, fx(c, "#EDEAE2", 0.9), [0, 0.63, 0], 0, t);
      for (let i = 0; i < 9; i++) {
        const h = 0.04 + ((i * 7) % 5) * 0.025;
        B.box(0.14, h, 0.14, fx(c, i % 3 === 0 ? "#D7E5C8" : "#DAD5CB", 0.8), [-0.5 + (i % 3) * 0.34, 0.635 + h / 2, -0.28 + Math.floor(i / 3) * 0.28], 0, t);
      }
      for (const [x, z] of [[-0.18, -0.1], [0.3, 0.2], [0.5, -0.25]] as const) {
        B.cyl(0.006, 0.006, 0.16, fx(c, C.metal, 0.4, 0.3), [x, 0.71, z], 6, t);
        B.sphere(0.035, accent(c, 0.4), [x, 0.8, z], 12, t);
      }
      rug(c, g, "rect", 2.2, 1.7, [1.25, 0, 0.45]);
      credenza(c, g, [-2.68, 0, 0.8], Math.PI / 2, 1.2);
      plant(c, g, [-2.68, 0.54, 1.2], "small");
      plant(c, g, [2.6, 0, 1.95], "tall");
      break;
    }
    case "regulation": {
      // documents + stamp board, two shelves of binders, a filing cabinet
      for (const x of [0.75, 1.95]) {
        const sh = B.sub([x, 0, -2.18], 0, g);
        shadowRect(c, 1.2, 0.5, [0, 0, 0], sh, 0.3);
        B.box(1.05, 0.46, 0.34, fx(c, C.lacquer, 0.45), [0, 0.23, 0], 0.02, sh);
        for (let i = 0; i < 9; i++) B.box(0.08, 0.3, 0.24, i % 4 === 0 ? accent(c, 0.6) : i % 2 ? accentSoft(c) : fx(c, "#E9E3D8", 0.8), [-0.42 + i * 0.105, 0.61, 0], 0.008, sh);
      }
      const fc = B.sub([2.55, 0, 0.6], -Math.PI / 2, g);
      shadowRect(c, 0.7, 0.7, [0, 0, 0], fc, 0.3);
      B.box(0.48, 1.0, 0.56, fx(c, "#B9BEC6", 0.4, 0.3), [0, 0.5, 0], 0.015, fc);
      for (let i = 0; i < 3; i++) B.box(0.12, 0.02, 0.01, fx(c, C.metal, 0.4, 0.3), [0, 0.25 + i * 0.3, 0.285], 0, fc);
      armchair(c, g, [1.0, 0, 0.9], Math.PI + 0.35);
      rug(c, g, "rect", 2.0, 1.6, [1.1, 0, 0.7]);
      bookshelf(c, g, [-2.72, 0, 0.75], Math.PI / 2, 1.3, 1.1);
      plant(c, g, [-2.6, 0, 2.0], "palm");
      break;
    }
    case "tech": {
      // a terminal wall (lit), a server rack and a beanbag
      rack(c, g, [2.45, 0, -0.9], -Math.PI / 2);
      const bb = B.sub([1.15, 0, 0.75], -0.6, g);
      shadowRound(c, 0.6, [0, 0, 0], bb, 0.3);
      B.sphere(0.45, accent(c, 0.95), [0, 0.22, 0], 28, bb).scale.set(1.1, 0.5, 1.1);
      B.sphere(0.36, accent(c, 0.95), [0, 0.4, -0.26], 24, bb).scale.set(1.15, 0.78, 0.6);
      rug(c, g, "round", 2.2, 2.2, [1.2, 0, 0.6]);
      credenza(c, g, [-2.68, 0, 0.8], Math.PI / 2, 1.2);
      plant(c, g, [-2.68, 0.54, 1.2], "small");
      plant(c, g, [2.6, 0, 1.95], "bush");
      break;
    }
    case "scalability": {
      // the growth board (room → floor → building → district) + a 4-step block sculpture + the globe
      steps(c, g, [1.15, 0, 0.5], -0.3, 4, 3);
      globe(c, g, [2.5, 0, -0.8], spinners);
      rug(c, g, "rect", 2.2, 1.7, [1.2, 0, 0.5]);
      bookshelf(c, g, [-2.72, 0, 0.75], Math.PI / 2, 1.2, 1.0);
      plant(c, g, [2.6, 0, 1.95], "tall", C.terracotta);
      break;
    }
    default: {
      // vacant research room: waiting for a hire
      plant(c, g, [2.6, 0, 1.95], "bush");
      plant(c, g, [-2.6, 0, 2.0], "small");
      break;
    }
  }
}

/** r3 shared by two analysts (5-person roster): two desks and two small boards, no big set. */
function sharedSet(c: Ctx, g: THREE.Group, a: AnalystRole, b: AnalystRole) {
  board(c, g, ROLE_WALL[a], [-1.55, 1.05, -2.36], 1.15);
  const c2: Ctx = { ...c, color: c.color2 ?? c.color };
  board(c2, g, ROLE_WALL[b], [1.25, 1.05, -2.36], 1.15);
  rug(c, g, "stripe", 2.0, 1.4, [0, 0, 0.9]);
  plant(c, g, [2.6, 0, 1.95], "tall");
  plant(c, g, [-2.6, 0, 2.0], "bush", C.terracotta);
}

// ─────────────────────────────────────────────── front row

/** Lobby: the founder's CEO desk (same spot as the bedroom desk), a reception sofa. The company sign is dynamic (index.ts). */
function lobbySet(c: Ctx, g: THREE.Group) {
  const { B } = c;
  laptopDesk(c, g, [-1.55, 0, 0.35], -Math.PI / 2, 1.4);
  taskChair(c, g, [-2.22, 0, 0.35], Math.PI / 2);
  // an in-tray where findings land (pulse target), a mug and a lamp
  const tray = B.sub([-1.62, 0.722, -0.18], 0, g);
  B.box(0.28, 0.03, 0.22, fx(c, C.metal, 0.4, 0.3), [0, 0.015, 0], 0.005, tray);
  B.box(0.24, 0.012, 0.18, fx(c, "#FBFAF6", 0.9), [0, 0.032, 0], 0, tray);
  B.cyl(0.042, 0.038, 0.09, accent(c, 0.45), [-1.4, 0.767, 0.82], 14, g);
  deskLamp(c, g, [-1.55, 0.722, 0.9]);
  // reception: sofa + coffee table + rug
  sofa(c, g, [1.45, 0, 1.75], Math.PI, 1.8);
  coffeeTable(c, g, [1.45, 0, 0.9]);
  B.box(0.22, 0.03, 0.3, accentSoft(c), [1.3, 0.375, 0.9], 0.005, g).rotation.y = 0.2;
  rug(c, g, "round", 2.6, 2.6, [1.45, 0, 1.15]);
  rug(c, g, "rect", 2.0, 1.5, [-1.8, 0, 0.35]);
  plant(c, g, [-2.55, 0, 2.05], "palm");
  plant(c, g, [2.6, 0, -2.05], "tall");
  floorLamp(c, g, [2.6, 0, 1.0]);
}

function novaSet(c: Ctx, g: THREE.Group) {
  const { B } = c;
  desk(c, g, [-2.36, 0, 0.2], Math.PI / 2, 0);
  taskChair(c, g, [-1.56, 0, 0.2], -Math.PI / 2);
  framed(c, g, [-2.9, 0.86, 1.6], Math.PI / 2, moodboardTex(c.color), 1.1, 0.63, "#C8B39A");
  sofa(c, g, [1.3, 0, 1.75], Math.PI, 1.7);
  coffeeTable(c, g, [1.3, 0, 0.85]);
  for (let i = 0; i < 5; i++) {
    const sw = B.box(0.05, 0.006, 0.22, i === 2 ? accent(c, 0.6) : c.R.m("accentSoft", c.room, c.color, { rough: 0.7, shade: 1.1 - i * 0.08 }), [1.1, 0.367 + i * 0.002, 0.85], 0, g);
    sw.rotation.y = -0.6 + i * 0.25;
  }
  rug(c, g, "round", 2.4, 2.4, [1.3, 0, 1.1]);
  // easel with a canvas
  const e = B.sub([2.4, 0, -1.4], -0.55, g);
  const wood = fx(c, C.oakDark, 0.6);
  B.box(0.035, 1.4, 0.035, wood, [-0.22, 0.68, 0], 0, e).rotation.z = -0.12;
  B.box(0.035, 1.4, 0.035, wood, [0.22, 0.68, 0], 0, e).rotation.z = 0.12;
  B.box(0.035, 1.3, 0.035, wood, [0, 0.62, -0.25], 0, e).rotation.x = -0.3;
  B.box(0.6, 0.035, 0.08, wood, [0, 0.6, 0.04], 0, e);
  const cv = B.sub([0, 0.94, 0.07], 0, e);
  cv.rotation.x = -0.1;
  B.box(0.62, 0.5, 0.03, fx(c, "#FBFAF7", 0.8), [0, 0, 0], 0.005, cv);
  B.plane(0.56, 0.44, c.R.m("fixed", c.room, c.color, { map: printTex(c.color, 0), rough: 0.9 }), [0, 0, 0.016], cv);
  shadowRound(c, 0.4, [0, 0, 0], e, 0.22);
  plant(c, g, [-2.55, 0, 2.1], "bush");
  plant(c, g, [0.2, 0, -2.05], "small");
}

function dexSet(c: Ctx, g: THREE.Group) {
  const { B } = c;
  desk(c, g, [-2.36, 0, 0.2], Math.PI / 2, 3, { dual: true });
  taskChair(c, g, [-1.56, 0, 0.2], -Math.PI / 2);
  const t = B.sub([1.1, 0, -1.2], -0.25, g);
  shadowRect(c, 1.4, 1.0, [0, 0, 0], t, 0.3);
  for (const [x, z, h] of [[-0.48, -0.25, 0.86], [0.48, -0.25, 0.86], [-0.48, 0.25, 0.66], [0.48, 0.25, 0.66]] as const) B.box(0.035, h, 0.035, fx(c, C.metal, 0.4, 0.3), [x, h / 2, z], 0, t);
  const top = B.sub([0, 0.78, 0], 0, t);
  top.rotation.x = 0.3;
  B.box(1.1, 0.035, 0.66, fx(c, C.oak, 0.5), [0, 0, 0], 0.012, top);
  B.box(0.56, 0.012, 0.38, fx(c, C.ink, 0.35), [0, 0.022, 0], 0.01, top);
  B.box(0.5, 0.002, 0.32, c.R.m("screen", c.room, c.color, { map: logoGridTex(c.color) }), [0, 0.03, 0], 0, top).receiveShadow = false;
  B.cyl(0.008, 0.008, 0.16, accent(c, 0.4), [0.38, 0.035, 0.1], 8, top).rotation.set(Math.PI / 2, 0, 0.6);
  const stool = B.sub([1.0, 0, -0.45], 0, g);
  B.cyl(0.17, 0.17, 0.05, accent(c, 0.85), [0, 0.6, 0], 24, stool);
  B.cyl(0.02, 0.02, 0.58, fx(c, C.metal, 0.4, 0.3), [0, 0.29, 0], 8, stool);
  shadowRound(c, 0.25, [0, 0, 0], stool, 0.22);
  framed(c, g, [-2.9, 0.78, 1.75], Math.PI / 2, logoGridTex(c.color), 1.1, 0.42, C.lacquer);
  bookshelf(c, g, [2.68, 0, 1.1], -Math.PI / 2, 1.3, 1.0);
  rug(c, g, "rect", 2.0, 1.6, [1.0, 0, -0.9]);
  plant(c, g, [2.55, 0, -2.0], "tall");
  plant(c, g, [-2.55, 0, 2.1], "bush", C.terracotta);
}

/** Launch: Rae's content desk (desk 0) + Pip's go-live laptop (desk 1), racks along the glass, the big green button. */
function launchSet(c: Ctx, g: THREE.Group, pip: Ctx) {
  const { B } = c;
  desk(c, g, [-2.36, 0, 0.2], Math.PI / 2, 2);
  taskChair(c, g, [-1.56, 0, 0.2], -Math.PI / 2);
  framed(c, g, [-2.9, 0.78, 1.75], Math.PI / 2, calendarTex(c.color), 0.86, 0.62, C.lacquer);
  const pole = fx(c, "#8A8F98", 0.35, 0.6);
  const rl = B.sub([-0.5, 0, -1.6], 0.55, g);
  B.cyl(0.14, 0.15, 0.02, pole, [0, 0.01, 0], 16, rl);
  B.cyl(0.012, 0.012, 1.26, pole, [0, 0.64, 0], 8, rl);
  B.torus(0.27, 0.035, lampShade(c), [0, 1.42, 0], Math.PI * 2, rl);
  // Pip's side (its own colour)
  rack(pip, g, [1.05, 0, -2.0]);
  rack(pip, g, [1.72, 0, -2.0]);
  laptopDesk(pip, g, [1.15, 0, 1.45], Math.PI, 1.1);
  const pd = B.sub([2.45, 0, 1.9], 0.5, g);
  shadowRound(pip, 0.45, [0, 0, 0], pd, 0.3);
  B.cyl(0.24, 0.27, 0.9, fx(pip, C.lacquer, 0.4), [0, 0.45, 0], 32, pd);
  B.cyl(0.25, 0.25, 0.03, fx(pip, C.ink, 0.35), [0, 0.915, 0], 32, pd);
  B.sphere(0.11, pip.R.m("led", pip.room, pip.color, { color: "#0AC18E" }), [0, 0.95, 0], 28, pd).scale.set(1, 0.45, 1);
  plant(c, g, [-2.55, 0, -2.05], "tall");
  plant(c, g, [2.6, 0, -0.8], "bush");
}

/** Which set a floor room shows. */
export type RoomSet =
  | { kind: "lobby" }
  | { kind: "nova" }
  | { kind: "dex" }
  | { kind: "launch"; pipColor: string }
  | { kind: "research"; role: AnalystRole | null }
  | { kind: "shared"; a: AnalystRole; b: AnalystRole; colorB: string };

/** Furnish one room (room-local group `g` already positioned at the room centre). */
export function furnish(c: Ctx, r: RoomDef, g: THREE.Group, set: RoomSet): Furnished {
  const spinners: THREE.Object3D[] = [];
  const back = r.row === "back";
  if (set.kind === "research" || set.kind === "shared") {
    // research desk(s) on the back wall (dual screens for the data-heavy roles)
    const heavy = (role: AnalystRole | null) => role === "market" || role === "competition" || role === "tech" || role === "pricing";
    const roleA = set.kind === "research" ? set.role : set.a;
    if (set.kind === "research" && !set.role) {
      desk(c, g, [-1.55, 0, -1.98], 0, 0);
      taskChair(c, g, [-1.55, 0, -1.23], Math.PI);
    } else {
      desk(c, g, [-1.55, 0, -1.98], 0, roleA === "tech" ? 3 : roleA === "location" ? 4 : roleA === "market" ? 1 : 0, { dual: heavy(roleA) });
      taskChair(c, g, [-1.55, 0, -1.23], Math.PI);
    }
    if (set.kind === "shared") {
      const c2: Ctx = { ...c, color: set.colorB };
      desk(c2, g, [1.25, 0, -1.98], 0, 2, { dual: heavy(set.b) });
      taskChair(c2, g, [1.25, 0, -1.23], Math.PI);
      sharedSet({ ...c, color2: set.colorB }, g, set.a, set.b);
    } else researchSet(c, g, set.role, spinners);
  } else if (set.kind === "lobby") lobbySet(c, g);
  else if (set.kind === "nova") novaSet(c, g);
  else if (set.kind === "dex") dexSet(c, g);
  else launchSet(c, g, { ...c, color: set.pipColor });
  // evening room glow: one broad warm pool (fakes the interior lamps on every quality level)
  c.B.decal(4.6, 3.8, c.R.m("pool", c.room, c.color, { map: radialTex(), opacity: 0.22, key: "roomglow" }), [back ? 0 : 0.3, 0.011, back ? -0.3 : 0.3], g);
  // working light: a soft dept-coloured pool around the workstation
  const wp = back ? [-1.55, 0, -1.4] : set.kind === "lobby" ? [-1.9, 0, 0.35] : [-1.9, 0, 0.2];
  c.B.decal(3.0, 2.6, c.R.m("workPool", c.room, c.color, { map: radialTex(), opacity: 0.55 }), [wp[0]!, 0.014, wp[2]!], g);
  return { spinners, deskFocus: new THREE.Vector3() };
}

export { mixHex };
