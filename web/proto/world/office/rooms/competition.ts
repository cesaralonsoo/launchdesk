// WS-OFFICE · rooms/competition.ts — Competition analyst ("who else does this?").
//
// Concept: a cosy detective's war room. The hero is a planning table with a map of the neighbourhood, little rival
// shops pinned in red and a big brass magnifier gliding over them; behind it the investigation board — a cork wall
// of competitor storefront cards tied together with red string, the biggest rival circled.
// Supporting: a filing cabinet of case files, a coat stand with the trench coat and hat, a chess table, the globe,
// an arc lamp over the map (glows at night).
import * as THREE from "three";
import { corkTex } from "../pixel";
import { artMat, positioningTex, priceTag, sagString, rivalMapTex, strand } from "./a-kit";
import { accent, accentSoft, C, decor, fx, globe, lampMat, mergeStatic, plant, pool, researchDesk, rug, shadowRect, shadowRound, spin, wallBoard, type Ctx, type P3, type ThemeFn } from "./common";

/** Rival shop colours (cards on the board and the little houses on the map share them). */
const RIVALS = ["#E5484D", "#22A06B", "#F59E0B", "#8B7CF6", "#EC6FA9", "#14B8A6", "#64748B", "#F97316"];

export const competition: ThemeFn = (ctx) => {
  const { c, group: g } = ctx;
  researchDesk(ctx, { screen: 0, dual: true });
  if (ctx.compact) {
    wallBoard(ctx, "competitors");
    coatStand(c, g, [ctx.side === "a" ? -2.55 : 2.55, 0, 0.5], ctx.side === "a" ? 0.6 : -0.6);
    return decor(ctx);
  }

  investigationBoard(c, g);
  const mag = mapTable(ctx, [1.15, 0, 0.45], -0.08);
  arcLamp(c, g, [2.62, 0, 0.85], [1.35, 1.42, 0.4], 0.58);
  positioningEasel(c, g, [2.5, 0, -1.2], -0.72);
  rug(c, g, "round", 2.7, 2.7, [1.15, 0, 0.5]);
  filingCabinet(c, g, [-2.6, 0, -0.95]);
  coatStand(c, g, [-2.55, 0, 0.3], 0.5);
  chessTable(c, g, [-2.38, 0, 1.25]);
  const ball = globe(ctx, [2.25, 0, 1.7]);
  plant(c, g, [-2.55, 0, 2.05], "palm");

  return decor(ctx, {
    update(dt, t) {
      spin([ball])(dt);
      // the magnifier drifts from rival to rival
      mag.position.set(Math.cos(t * 0.35) * 0.38, 0.86 + Math.sin(t * 1.3) * 0.025, Math.sin(t * 0.35) * 0.2);
      mag.rotation.y = -0.5 + Math.sin(t * 0.35) * 0.35;
    },
  });
};

// ─────────────────────────────────────────────── the investigation board (back wall)

function investigationBoard(c: Ctx, g: THREE.Object3D) {
  const { B } = c;
  const cx = 0.86, cy = 0.73, w = 2.9, h = 0.9, zf = -2.37;
  const s = B.sub([cx, cy, zf], 0, g);
  B.box(w + 0.08, h + 0.08, 0.04, fx(c, C.oak, 0.55), [0, 0, 0.02], 0.015, s);
  B.plane(w, h, artMat(c, corkTex(), "cork"), [0, 0, 0.042], s);
  const front = 0.05;
  // 2 × 4 storefront cards
  const pins: P3[] = [];
  for (let i = 0; i < 8; i++) {
    const col = i % 4, row = Math.floor(i / 4);
    const x = -1.04 + col * 0.7 + (row ? 0.1 : -0.04), y = row ? -0.2 : 0.2;
    const rot = ((i * 37) % 7 - 3) * 0.025;
    storeCard(c, s, [x, y, front], rot, RIVALS[i]!);
    pins.push([x, y + 0.17, front + 0.03]);
    B.sphere(0.022, fx(c, "#E5484D", 0.4), [x, y + 0.17, front + 0.03], 10, s);
  }
  // red string: who copies whom
  const red = fx(c, "#D93B3F", 0.6);
  for (const [a, b] of [[0, 1], [1, 6], [6, 3], [2, 5], [5, 7], [4, 1], [2, 6]] as const) sagString(c, s, pins[a]!, pins[b]!, 0.05, 0.005, red, 5);
  // the biggest rival, circled in the analyst's colour
  const ring = B.torus(0.27, 0.014, accent(c, 0.4), [-1.04 + 2 * 0.7 + 0.1, -0.2 + 0.02, front + 0.025], Math.PI * 2, s);
  ring.scale.set(1.15, 0.85, 1);
  // sticky notes and a question mark card
  const sticky = [fx(c, "#FFE58A", 0.8), accentSoft(c), fx(c, "#FFC7A8", 0.8)];
  for (let i = 0; i < 6; i++) {
    const n = B.box(0.09, 0.09, 0.008, sticky[i % 3]!, [-1.32 + i * 0.53, (i % 2 ? -0.38 : 0.38), front], 0.002, s);
    n.rotation.z = (i % 3 - 1) * 0.12;
  }
}

/** A competitor card: a little shopfront with a striped awning (faces +Z). */
function storeCard(c: Ctx, parent: THREE.Object3D, pos: P3, rotZ: number, color: string) {
  const { B } = c;
  const k = B.sub(pos, 0, parent);
  k.rotation.z = rotZ;
  B.box(0.5, 0.34, 0.012, fx(c, "#FBFAF6", 0.8), [0, 0, 0], 0.004, k);
  // facade
  const fac = fx(c, mixLight(color, 0.55), 0.7);
  B.box(0.38, 0.2, 0.03, fac, [0, -0.045, 0.012], 0.006, k);
  // sign band + awning stripes
  B.box(0.38, 0.05, 0.035, fx(c, color, 0.6), [0, 0.085, 0.014], 0.006, k);
  const white = fx(c, "#FFFFFF", 0.7), col = fx(c, color, 0.6);
  for (let i = 0; i < 5; i++) {
    const st = B.box(0.078, 0.05, 0.05, i % 2 ? white : col, [-0.152 + i * 0.076, 0.035, 0.04], 0, k, false);
    st.rotation.x = 0.55;
  }
  // window + door
  B.box(0.18, 0.09, 0.006, fx(c, "#BFE0F2", 0.2), [-0.07, -0.06, 0.03], 0, k);
  B.box(0.07, 0.13, 0.006, fx(c, "#5A4636", 0.6), [0.11, -0.08, 0.03], 0, k);
  // a tiny price tag under each shop
  priceTag(c, k, [-0.18, -0.145, 0.012], 0.07, fx(c, "#F2E2BF", 0.8), 0, 0.006);
}

const tmpC = new THREE.Color();
const mixLight = (hex: string, k: number) => "#" + tmpC.set(hex).lerp(new THREE.Color("#ffffff"), k).getHexString();

// ─────────────────────────────────────────────── the hero: rivals map table + magnifier

function mapTable(ctx: Parameters<ThemeFn>[0], pos: P3, rotY: number): THREE.Object3D {
  const { c, group: g } = ctx;
  const { B } = c;
  const t = B.sub(pos, rotY, g);
  const W = 1.55, D = 1.0, H = 0.56;
  shadowRect(c, W + 0.4, D + 0.4, [0, 0, 0], t, 0.32);
  B.box(W + 0.08, 0.05, D + 0.08, fx(c, C.oakDark, 0.55), [0, H - 0.025, 0], 0.02, t);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(0.07, H - 0.05, 0.07, fx(c, C.oakDark, 0.6), [sx * (W / 2 - 0.06), (H - 0.05) / 2, sz * (D / 2 - 0.06)], 0.012, t);
  B.box(W - 0.1, 0.03, 0.04, fx(c, C.oakDark, 0.6), [0, 0.14, 0], 0, t);
  const top = B.plane(W, D, artMat(c, rivalMapTex(c.color), "rivalmap", 0.8), [0, H + 0.002, 0], t);
  top.rotation.x = -Math.PI / 2;
  // rival shops: little houses with pyramid roofs + red pins
  const spots: Array<[number, number]> = [[-0.6, -0.3], [-0.25, 0.28], [0.5, -0.32], [0.62, 0.22], [-0.58, 0.3], [0.2, 0.35]];
  spots.forEach(([x, z], i) => {
    const color = RIVALS[i]!;
    house(c, t, [x, H, z], 0.13 + (i % 3) * 0.025, fx(c, "#FBFAF6", 0.7), fx(c, color, 0.6), (i * 0.7) % 1.5);
    strand(c, t, [x + 0.09, H + 0.12, z + 0.06], [x + 0.09, H + 0.34, z + 0.06], 0.008, fx(c, C.steel, 0.4, 0.5));
    B.sphere(0.038, fx(c, "#E5484D", 0.4), [x + 0.09, H + 0.35, z + 0.06], 10, t);
  });
  // our spot: an accent house with a flag (the map's dashed circle sits around it)
  const ox = -0.08, oz = -0.08;
  house(c, t, [ox, H, oz], 0.2, accentSoft(c), accent(c, 0.45), 0.3);
  strand(c, t, [ox, H + 0.25, oz], [ox, H + 0.55, oz], 0.008, fx(c, C.metal, 0.4, 0.3));
  B.box(0.16, 0.1, 0.01, accent(c, 0.4), [ox + 0.08, H + 0.49, oz], 0.002, t);
  // notebook + pencil at the near edge
  B.box(0.24, 0.016, 0.17, fx(c, "#F6F1E4", 0.8), [0.55, H + 0.01, 0.38], 0.004, t).rotation.y = 0.3;
  B.box(0.18, 0.012, 0.012, fx(c, "#F2C04A", 0.6), [0.52, H + 0.025, 0.4], 0, t).rotation.y = -0.4;

  // the magnifier (animated; merged into ~3 meshes)
  const src = new THREE.Group();
  const lens = B.sub([0, 0, 0], 0, src);
  lens.rotation.x = -1.05;
  const brass = fx(c, C.brass, 0.3, 0.75);
  B.torus(0.25, 0.032, brass, [0, 0, 0], Math.PI * 2, lens);
  const glass = c.R.m("glass", c.room, c.color, { opacity: 0.35, rough: 0.05 });
  B.cyl(0.24, 0.24, 0.012, glass, [0, 0, 0], 24, lens).rotation.x = Math.PI / 2;
  B.cyl(0.035, 0.03, 0.06, brass, [0, -0.29, 0], 10, lens);
  B.cyl(0.032, 0.04, 0.28, fx(c, "#4A3426", 0.5), [0, -0.46, 0], 10, lens);
  B.sphere(0.045, fx(c, "#4A3426", 0.5), [0, -0.61, 0], 10, lens);
  // glint
  B.box(0.06, 0.012, 0.004, fx(c, "#FFFFFF", 0.1), [-0.08, 0.1, 0.01], 0, lens, false).rotation.z = 0.6;
  const mag = ctx.animate(mergeStatic(src, c.R));
  mag.position.set(0.3, 0.86, 0);
  t.add(mag);
  // its soft shadow on the map stays put (a light pool from the arc lamp hides the mismatch)
  shadowRound(c, 0.24, [0.05, H + 0.004, 0], t, 0.22);
  return mag;
}

function house(c: Ctx, parent: THREE.Object3D, pos: P3, s: number, wall: THREE.Material, roof: THREE.Material, rotY: number) {
  const { B } = c;
  const h = B.sub(pos, rotY, parent);
  B.box(s, s * 0.85, s, wall, [0, (s * 0.85) / 2, 0], 0.006, h);
  const r = B.cyl(0, s * 0.82, s * 0.55, roof, [0, s * 0.85 + s * 0.27, 0], 4, h);
  r.rotation.y = Math.PI / 4;
  B.box(s * 0.3, s * 0.45, 0.006, fx(c, "#5A4636", 0.6), [0, s * 0.22, s / 2 + 0.003], 0, h);
}

// ─────────────────────────────────────────────── supporting props

/** An arc floor lamp: base at `pos`, the shade hangs at `at` (room-local); glows at night with a pool below. */
function arcLamp(c: Ctx, g: THREE.Object3D, pos: P3, at: P3, onto = 0) {
  const { B } = c;
  const s = B.sub([0, 0, 0], 0, g);
  const blk = fx(c, C.metal, 0.4, 0.3);
  shadowRound(c, 0.26, pos, s, 0.3);
  B.cyl(0.16, 0.18, 0.05, fx(c, "#E9E6E0", 0.3, 0.1), [pos[0], 0.025, pos[2]], 18, s);
  const top: P3 = [pos[0], 1.72, pos[2]];
  strand(c, s, [pos[0], 0.05, pos[2]], top, 0.014, blk, 8);
  // the arc: a few segments bending towards the shade
  const pts: P3[] = [];
  for (let i = 0; i <= 6; i++) {
    const k = i / 6;
    pts.push([pos[0] + (at[0] - pos[0]) * k, 1.72 + Math.sin(k * Math.PI * 0.85) * 0.22 - k * k * (1.72 - at[1] - 0.12), pos[2] + (at[2] - pos[2]) * k]);
  }
  for (let i = 0; i < 6; i++) strand(c, s, pts[i]!, pts[i + 1]!, 0.013, blk, 8);
  B.cyl(0.07, 0.2, 0.17, lampMat(c), [at[0], at[1], at[2]], 20, s);
  B.cyl(0.03, 0.03, 0.04, blk, [at[0], at[1] + 0.1, at[2]], 8, s);
  pool(c, 0.9, [at[0], 0, at[2]], B.sub([0, onto, 0], 0, s), 0.6);
}

/** An easel with the positioning map: rivals crowd three corners, our spot sits in the empty one (the gap). */
function positioningEasel(c: Ctx, g: THREE.Object3D, pos: P3, rotY: number) {
  const { B } = c;
  const e = B.sub(pos, rotY, g);
  shadowRect(c, 0.9, 0.6, [0, 0, 0], e, 0.25);
  const wood = fx(c, C.oak, 0.6);
  for (const sx of [-1, 1]) B.box(0.04, 1.62, 0.04, wood, [sx * 0.33, 0.78, 0.06], 0.01, e).rotation.set(-0.1, 0, sx * -0.12);
  B.box(0.04, 1.5, 0.04, wood, [0, 0.72, -0.26], 0.01, e).rotation.x = 0.3;
  B.box(0.84, 0.04, 0.07, wood, [0, 0.62, 0.12], 0.01, e);
  const b = B.sub([0, 1.08, 0.1], 0, e);
  b.rotation.x = -0.1;
  B.box(0.86, 0.86, 0.035, fx(c, "#F4F3F0", 0.5), [0, 0, 0], 0.012, b);
  B.plane(0.8, 0.8, artMat(c, positioningTex(c.color), "posmap", 0.7), [0, 0, 0.019], b);
}

/** A three-drawer cabinet of case files against the left wall (faces +X). */
function filingCabinet(c: Ctx, g: THREE.Object3D, pos: P3) {
  const { B } = c;
  const f = B.sub(pos, Math.PI / 2, g);
  shadowRect(c, 0.8, 0.8, [0, 0, 0], f, 0.3);
  const body = fx(c, "#7C8A99", 0.45, 0.3);
  B.box(0.5, 0.98, 0.5, body, [0, 0.49, 0], 0.02, f);
  for (let i = 0; i < 3; i++) {
    const y = 0.18 + i * 0.3;
    const out = i === 1 ? 0.16 : 0;
    B.box(0.44, 0.26, 0.04, fx(c, "#8E9CAB", 0.45, 0.3), [0, y, 0.25 + out], 0.012, f);
    B.box(0.14, 0.025, 0.03, fx(c, C.steel, 0.3, 0.7), [0, y + 0.06, 0.28 + out], 0.008, f);
    B.box(0.1, 0.05, 0.006, fx(c, "#FBFAF6", 0.8), [0, y - 0.04, 0.272 + out], 0, f);
    if (out) {
      // the open drawer: its sides + manila folders sticking out
      B.box(0.42, 0.18, 0.2, fx(c, "#8E9CAB", 0.45, 0.3), [0, y + 0.02, 0.15], 0.01, f);
      for (let k = 0; k < 5; k++) B.box(0.36, 0.2 + (k % 2) * 0.03, 0.012, fx(c, k === 2 ? "#F3B4B4" : "#E8CF94", 0.8), [0, y + 0.12, 0.08 + k * 0.035], 0.003, f);
      B.box(0.09, 0.04, 0.013, fx(c, "#E5484D", 0.6), [-0.1, y + 0.235, 0.15], 0.003, f);
    }
  }
  // case folders + binoculars on top
  for (let k = 0; k < 3; k++) B.box(0.34, 0.025, 0.25, fx(c, k === 1 ? "#E8CF94" : "#DCC082", 0.8), [0.02 * k, 0.995 + k * 0.026, -0.04], 0.004, f).rotation.y = k * 0.12;
  const bino = B.sub([0.08, 1.1, 0.12], 0.4, f);
  for (const sx of [-1, 1]) {
    B.cyl(0.04, 0.045, 0.14, fx(c, "#2F343C", 0.5), [sx * 0.05, 0.03, 0], 12, bino).rotation.x = Math.PI / 2;
    B.cyl(0.032, 0.032, 0.012, accent(c, 0.4), [sx * 0.05, 0.03, 0.075], 12, bino).rotation.x = Math.PI / 2;
  }
}

/** A coat stand with the detective's trench coat, a scarf in the analyst's colour and a fedora. */
function coatStand(c: Ctx, g: THREE.Object3D, pos: P3, rotY: number) {
  const { B } = c;
  const s = B.sub(pos, rotY, g);
  shadowRound(c, 0.3, [0, 0, 0], s, 0.3);
  const wood = fx(c, "#6B4A33", 0.55);
  for (let i = 0; i < 3; i++) B.box(0.34, 0.035, 0.05, wood, [0, 0.025, 0], 0.01, s).rotation.y = (i / 3) * Math.PI;
  B.cyl(0.022, 0.026, 1.62, wood, [0, 0.82, 0], 8, s);
  B.sphere(0.04, wood, [0, 1.65, 0], 10, s);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    strand(c, s, [0, 1.52, 0], [Math.cos(a) * 0.13, 1.58, Math.sin(a) * 0.13], 0.01, wood, 6);
  }
  // trench coat (beige), belt, collar
  const coat = fx(c, "#C9A97A", 0.85);
  const ct = B.box(0.36, 0.78, 0.16, coat, [0.0, 1.08, 0.12], 0.06, s);
  ct.rotation.x = -0.06;
  B.box(0.38, 0.05, 0.17, fx(c, "#A8865A", 0.8), [0, 0.98, 0.125], 0.02, s);
  B.box(0.3, 0.1, 0.14, coat, [0, 1.45, 0.1], 0.04, s);
  for (const sx of [-1, 1]) B.box(0.1, 0.62, 0.12, coat, [sx * 0.19, 1.12, 0.1], 0.04, s).rotation.z = sx * 0.06;
  // scarf
  B.box(0.08, 0.5, 0.03, accent(c, 0.9), [0.08, 1.2, 0.21], 0.015, s).rotation.z = 0.08;
  // fedora on the top hook
  const hat = B.sub([0.02, 1.71, 0.02], 0, s);
  hat.rotation.z = -0.12;
  B.cyl(0.17, 0.17, 0.022, fx(c, "#4A3B31", 0.7), [0, 0, 0], 20, hat);
  B.cyl(0.095, 0.11, 0.12, fx(c, "#4A3B31", 0.7), [0, 0.07, 0], 16, hat);
  B.cyl(0.112, 0.112, 0.03, fx(c, "#22201E", 0.6), [0, 0.03, 0], 16, hat);
}

/** A little chess table mid-game (strategy). */
function chessTable(c: Ctx, g: THREE.Object3D, pos: P3) {
  const { B } = c;
  const t = B.sub(pos, 0.25, g);
  shadowRound(c, 0.4, [0, 0, 0], t, 0.28);
  B.box(0.46, 0.04, 0.46, fx(c, C.oak, 0.5), [0, 0.5, 0], 0.012, t);
  B.cyl(0.04, 0.05, 0.48, fx(c, C.oakDark, 0.6), [0, 0.25, 0], 10, t);
  B.cyl(0.16, 0.18, 0.025, fx(c, C.oakDark, 0.6), [0, 0.012, 0], 14, t);
  const lt = fx(c, "#F3EDE1", 0.6), dk = fx(c, "#5A4636", 0.6);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) B.box(0.085, 0.012, 0.085, (i + j) % 2 ? dk : lt, [-0.1275 + i * 0.085, 0.526, -0.1275 + j * 0.085], 0, t, false);
  // a king and a few pawns: white (our colour) vs dark
  const pc = (x: number, z: number, h: number, m: THREE.Material) => {
    B.cyl(0.022, 0.03, h, m, [x, 0.532 + h / 2, z], 10, t);
    B.sphere(0.022, m, [x, 0.535 + h + 0.012, z], 10, t);
  };
  pc(-0.04, 0.09, 0.11, accent(c, 0.45));
  pc(0.12, -0.04, 0.11, fx(c, "#2F343C", 0.5));
  pc(-0.12, -0.12, 0.05, accent(c, 0.45));
  pc(0.04, -0.13, 0.05, fx(c, "#2F343C", 0.5));
  pc(0.13, 0.12, 0.05, fx(c, "#2F343C", 0.5));
  // a toppled rival piece
  B.cyl(0.022, 0.03, 0.08, fx(c, "#2F343C", 0.5), [0.19, 0.548, 0.19], 10, t).rotation.z = Math.PI / 2;
}
