// WS-OFFICE · rooms/pricing.ts — Pricing analyst ("what people pay today, what you can charge").
//
// Concept: a charming corner shop turned price lab. The hero is a shop counter with a big vintage till and a brass
// balance (a coin stack against a gift box), a giant price tag leaning on its front; behind it a chalkboard of three
// pricing tiers ($ · $$ · $$$, the middle one starred) and a pegboard of hanging tags under a neon "$" (glows at night).
// Supporting: a shelf of tagged goods, three display plinths (good / better / best), an A-frame sign by the door.
import * as THREE from "three";
import { artMat, coinStack, glyph3D, priceTag, sagString, tierBoardTex, tillDisplayTex } from "./a-kit";
import { accent, accentSoft, C, decor, mixHex, fx, neonMat, plant, pool, researchDesk, rug, screenMat, shadowRect, wallBoard, type Ctx, type P3, type ThemeFn } from "./common";

const KRAFT = "#E2C79A";
const TAG_COLORS = ["#FBFAF6", KRAFT, "#FFE58A"];

export const pricing: ThemeFn = (ctx) => {
  const { c, group: g } = ctx;
  researchDesk(ctx, { screen: 0, dual: true });
  if (ctx.compact) {
    wallBoard(ctx, "prices");
    aFrame(c, g, [ctx.side === "a" ? -2.45 : 2.45, 0, 0.5], ctx.side === "a" ? 0.5 : -0.5);
    return decor(ctx);
  }

  tierBoard(c, g);
  tagWall(c, g);
  rug(c, g, "stripe", 2.3, 1.35, [1.0, 0, 0.15]);
  counter(c, g, [1.0, 0, -0.62]);
  plinths(c, g);
  shopShelf(c, g, [-2.66, 0, 0.7]);
  aFrame(c, g, [-1.75, 0, 2.05], 0.35);
  // a warm pool over the till at night
  pool(c, 1.0, [1.0, 0, -0.3], g, 0.5);
  plant(c, g, [-2.55, 0, 2.05], "bush", C.terracotta);
  plant(c, g, [2.62, 0, 0.15], "tall");
  return decor(ctx);
};

// ─────────────────────────────────────────────── back wall: tier chalkboard + tag pegboard + neon

function tierBoard(c: Ctx, g: THREE.Object3D) {
  const { B } = c;
  const w = 1.62, h = w * (46 / 84);
  const s = B.sub([0.52, 0.72, -2.37], 0, g);
  B.box(w + 0.1, h + 0.1, 0.045, fx(c, C.oakDark, 0.6), [0, 0, 0.022], 0.015, s);
  B.plane(w, h, artMat(c, tierBoardTex(c.color), "tierboard", 0.9), [0, 0, 0.046], s);
  // chalk ledge + chalk sticks
  B.box(w * 0.9, 0.03, 0.07, fx(c, C.oakDark, 0.6), [0, -h / 2 - 0.05, 0.05], 0.01, s);
  B.box(0.08, 0.018, 0.018, fx(c, "#FBFAF6", 0.9), [-0.3, -h / 2 - 0.026, 0.06], 0.005, s).rotation.y = 0.3;
  B.box(0.06, 0.018, 0.018, fx(c, "#F6D365", 0.9), [-0.18, -h / 2 - 0.026, 0.06], 0.005, s).rotation.y = -0.2;
}

function tagWall(c: Ctx, g: THREE.Object3D) {
  const { B } = c;
  const s = B.sub([2.05, 0, -2.37], 0, g);
  const w = 1.15, h = 0.9, cy = 0.74;
  B.box(w, h, 0.03, fx(c, "#E9DCC4", 0.8), [0, cy, 0.015], 0.012, s);
  // peg holes (a few dark dots so it reads as pegboard)
  const hole = fx(c, "#B9A98C", 0.8);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 7; j++) if ((i + j) % 2 === 0) B.box(0.015, 0.015, 0.004, hole, [-0.49 + i * 0.14, cy - 0.38 + j * 0.125, 0.031], 0, s, false);
  // neon "$" in a ring on top
  const neon = neonMat(c, "#FFB547");
  glyph3D(c, s, "$", [0, cy + 0.24, 0.07], 0.042, neon, 0.03);
  const ring = B.torus(0.2, 0.014, neonMat(c, "#FF7A9C"), [0, cy + 0.24, 0.07], Math.PI * 2, s);
  ring.scale.set(1, 1, 1);
  // hooks + hanging tags (two rows)
  const peg = fx(c, C.steel, 0.35, 0.6);
  for (let r = 0; r < 2; r++)
    for (let k = 0; k < 4; k++) {
      const x = -0.42 + k * 0.28 + (r ? 0.07 : 0), y = cy - 0.02 - r * 0.3;
      B.cyl(0.008, 0.008, 0.07, peg, [x, y, 0.065], 6, s).rotation.x = Math.PI / 2;
      const i = r * 4 + k;
      const m = i === 2 || i === 5 ? accent(c, 0.45) : fx(c, TAG_COLORS[i % 3]!, 0.8);
      const t = priceTag(c, s, [x, y - 0.015, 0.1], 0.17, m, -Math.PI / 2 + ((i * 13) % 5 - 2) * 0.06, 0.014);
      if (i % 3 !== 1) glyph3D(c, t, "$", [0.11, 0, 0.012], 0.0095, fx(c, C.ink, 0.6), 0.004).rotation.z = Math.PI / 2;
    }
}

// ─────────────────────────────────────────────── the hero: shop counter with till + scales

function counter(c: Ctx, g: THREE.Object3D, pos: P3) {
  const { B } = c;
  const s = B.sub(pos, 0, g);
  const W = 1.7, D = 0.56, H = 0.9;
  shadowRect(c, W + 0.4, D + 0.45, [0, 0, 0], s, 0.36);
  B.box(W, H - 0.06, D, fx(c, "#F6F0E4", 0.5), [0, (H - 0.06) / 2, 0], 0.03, s);
  // vertical slats on the front in the analyst's colour, a kick plate and the oak top
  const slat = fx(c, mixHex(c.color, "#FFD86B", 0.35), 0.5);
  for (let i = 0; i < 9; i++) B.box(0.1, H - 0.2, 0.02, slat, [-W / 2 + 0.13 + i * 0.18, H / 2 - 0.02, D / 2 + 0.008], 0.01, s);
  B.box(W - 0.04, 0.08, 0.02, fx(c, "#3A3D44", 0.6), [0, 0.04, D / 2 + 0.006], 0.01, s);
  B.box(W + 0.08, 0.06, D + 0.1, fx(c, C.oak, 0.5), [0, H - 0.03, 0.02], 0.02, s);

  // the till (vintage, brass + cream), left side
  const till = B.sub([-0.42, H, -0.02], 0.12, s);
  const brass = fx(c, "#CFA752", 0.3, 0.6);
  const cream = fx(c, "#F4EBD8", 0.6);
  B.box(0.5, 0.12, 0.42, brass, [0, 0.06, 0], 0.03, till);
  B.box(0.46, 0.035, 0.05, fx(c, "#B98F3E", 0.35, 0.6), [0, 0.07, 0.215], 0.01, till); // drawer lip
  const kp = B.sub([0, 0.12, 0.04], 0, till);
  kp.rotation.x = 0.45;
  B.box(0.44, 0.06, 0.26, brass, [0, 0.03, 0], 0.025, kp);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) B.cyl(0.022, 0.022, 0.03, i === 3 && j === 2 ? accent(c, 0.45) : cream, [-0.15 + i * 0.1, 0.07, -0.07 + j * 0.07], 10, kp);
  // display tower + "$" flags popping up
  B.box(0.3, 0.2, 0.12, brass, [0, 0.28, -0.13], 0.025, till);
  B.plane(0.22, 0.09, screenMat(c, tillDisplayTex()), [0, 0.3, -0.069], till).receiveShadow = false;
  for (const [x, hgt] of [[-0.08, 0.1], [0.04, 0.14]] as const) {
    B.box(0.012, hgt, 0.012, fx(c, C.metal, 0.4, 0.3), [x, 0.38 + hgt / 2, -0.15], 0, till);
    B.box(0.09, 0.07, 0.012, cream, [x + 0.05, 0.38 + hgt, -0.15], 0.006, till);
    glyph3D(c, till, "$", [x + 0.05, 0.38 + hgt, -0.142], 0.008, accent(c, 0.45), 0.004);
  }
  // crank on the side
  B.cyl(0.012, 0.012, 0.1, brass, [0.28, 0.12, 0], 6, till).rotation.z = Math.PI / 2;
  B.sphere(0.025, cream, [0.33, 0.12, 0.05], 8, till);

  // balance scales, right side: a coin stack vs a gift box (value vs price)
  const sc = B.sub([0.45, H, -0.05], -0.15, s);
  const br = fx(c, C.brass, 0.3, 0.75);
  B.cyl(0.11, 0.13, 0.03, br, [0, 0.015, 0], 18, sc);
  B.cyl(0.016, 0.02, 0.5, br, [0, 0.27, 0], 8, sc);
  B.sphere(0.03, br, [0, 0.53, 0], 10, sc);
  const tilt = 0.12;
  const beam = B.box(0.62, 0.025, 0.025, br, [0, 0.5, 0], 0.008, sc);
  beam.rotation.z = tilt;
  for (const sx of [-1, 1]) {
    const ex = sx * 0.3 * Math.cos(tilt), ey = 0.5 + sx * 0.3 * Math.sin(tilt);
    const py = ey - 0.24;
    for (const dz of [-0.05, 0.05]) sagString(c, sc, [ex, ey, 0], [ex + dz * 0.6, py + 0.02, dz], 0, 0.003, br, 1);
    B.cyl(0.11, 0.08, 0.025, br, [ex, py, 0], 18, sc);
    if (sx < 0) coinStack(c, sc, [ex, py + 0.012, 0], 4, 0.06, 0.022, "#E9B949", "#C8932E", 0.004);
    else {
      B.box(0.12, 0.1, 0.12, accentSoft(c), [ex, py + 0.062, 0], 0.012, sc);
      B.box(0.125, 0.104, 0.025, accent(c, 0.45), [ex, py + 0.062, 0], 0.006, sc);
      B.box(0.025, 0.104, 0.125, accent(c, 0.45), [ex, py + 0.062, 0], 0.006, sc);
    }
  }
  // a tag gun + a little roll of tags in the middle
  const gun = B.sub([0.0, H, 0.12], 0.6, s);
  B.box(0.16, 0.07, 0.05, fx(c, "#F2C04A", 0.5), [0, 0.06, 0], 0.015, gun);
  B.box(0.04, 0.09, 0.04, fx(c, "#3A3D44", 0.5), [0.05, 0.02, 0], 0.01, gun).rotation.z = -0.3;
  B.cyl(0.035, 0.035, 0.05, fx(c, "#FBFAF6", 0.8), [-0.1, 0.03, -0.05], 12, s).rotation.x = Math.PI / 2;

  // the giant price tag leaning against the counter front (string looped to the top)
  const big = B.sub([0.62, 0, D / 2 + 0.08], -0.2, s);
  big.rotation.x = -0.14;
  const t = priceTag(c, big, [0.0, 0.62, 0], 0.6, fx(c, KRAFT, 0.75), -Math.PI / 2 + 0.05, 0.035);
  glyph3D(c, t, "$", [0.36, 0, 0.022], 0.035, accent(c, 0.45), 0.012).rotation.z = Math.PI / 2;
  sagString(c, big, [0, 0.62, 0.02], [-0.12, 0.85, -0.08], -0.05, 0.007, fx(c, "#E5484D", 0.6), 4);
  shadowRect(c, 0.5, 0.25, [0, 0, 0.05], big, 0.25);
}

// ─────────────────────────────────────────────── supporting props

/** Three plinths, good / better / best: a jar, a ribboned box, a gift box with a gold star. */
function plinths(c: Ctx, g: THREE.Object3D) {
  const { B } = c;
  const s = B.sub([1.4, 0, 1.55], -0.3, g);
  s.scale.setScalar(1.15);
  const white = fx(c, "#F4F3F0", 0.45);
  const tiers: Array<[number, number]> = [[-0.5, 0.32], [0, 0.5], [0.5, 0.7]];
  tiers.forEach(([x, h], i) => {
    shadowRect(c, 0.5, 0.5, [x, 0, 0], s, 0.28);
    B.box(0.38, h, 0.38, white, [x, h / 2, 0], 0.025, s);
    B.box(0.39, 0.05, 0.39, accent(c, 0.45), [x, h - 0.04, 0], 0.012, s);
    // a $ band on the front
    const n = i + 1;
    for (let k = 0; k < n; k++) glyph3D(c, s, "$", [x - (n - 1) * 0.045 + k * 0.09, h * 0.45, 0.196], 0.012, accent(c, 0.45), 0.006);
  });
  // tier 1: a jar
  const [x1, h1] = tiers[0]!;
  B.cyl(0.08, 0.08, 0.16, fx(c, "#CFE7F2", 0.2), [x1, h1 + 0.08, 0], 14, s);
  B.cyl(0.085, 0.085, 0.04, accent(c, 0.45), [x1, h1 + 0.18, 0], 14, s);
  // tier 2: a box with a ribbon
  const [x2, h2] = tiers[1]!;
  B.box(0.22, 0.18, 0.22, fx(c, "#8CC7E8", 0.6), [x2, h2 + 0.09, 0], 0.015, s);
  B.box(0.225, 0.04, 0.225, fx(c, "#FBFAF6", 0.6), [x2, h2 + 0.12, 0], 0.008, s);
  // tier 3: the gift box with a bow and a gold star
  const [x3, h3] = tiers[2]!;
  const gift = fx(c, "#F0727E", 0.55), ribbon = fx(c, "#FFD86B", 0.45);
  B.box(0.28, 0.24, 0.28, gift, [x3, h3 + 0.12, 0], 0.02, s);
  B.box(0.285, 0.245, 0.06, ribbon, [x3, h3 + 0.12, 0], 0.01, s);
  B.box(0.06, 0.245, 0.285, ribbon, [x3, h3 + 0.12, 0], 0.01, s);
  for (const sx of [-1, 1]) B.sphere(0.06, ribbon, [x3 + sx * 0.05, h3 + 0.27, 0], 10, s).scale.set(1, 0.7, 0.6);
  const star = B.sub([x3, h3 + 0.44, 0], 0, s);
  const gold = fx(c, "#F2C04A", 0.3, 0.5);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const arm = B.box(0.05, 0.11, 0.035, gold, [Math.sin(a) * 0.045, Math.cos(a) * 0.045, 0], 0.008, star);
    arm.rotation.z = -a;
  }
  // hanging tags on each tier (string from the top edge)
  tiers.forEach(([x, h], i) => {
    const m = i === 2 ? accent(c, 0.45) : fx(c, TAG_COLORS[i]!, 0.8);
    priceTag(c, s, [x + 0.12, h - 0.03, 0.2], 0.1 + i * 0.02, m, -Math.PI / 2 - 0.25, 0.01);
  });
}

/** A shop shelf of tagged goods against the left wall (faces +X). */
function shopShelf(c: Ctx, g: THREE.Object3D, pos: P3) {
  const { B } = c;
  const s = B.sub(pos, Math.PI / 2, g);
  const w = 1.35, h = 1.08, d = 0.38;
  shadowRect(c, w + 0.3, 0.65, [0, 0, 0], s, 0.3);
  const wood = fx(c, C.oak, 0.55);
  for (const sx of [-1, 1]) B.box(0.04, h, d, wood, [sx * (w / 2 - 0.02), h / 2, 0], 0.01, s);
  B.box(w, h, 0.02, fx(c, "#EFE8DA", 0.8), [0, h / 2, -d / 2 + 0.01], 0, s);
  const goods = [accent(c, 0.45), fx(c, "#9CC7E3", 0.5), fx(c, KRAFT, 0.75), fx(c, "#F5A9BC", 0.55), accentSoft(c), fx(c, "#B9D8A2", 0.6)];
  for (let r = 0; r < 3; r++) {
    const y = 0.05 + r * 0.35;
    B.box(w - 0.06, 0.035, d, wood, [0, y, 0], 0.008, s);
    // tag strip on the shelf edge
    B.box(w - 0.1, 0.045, 0.01, fx(c, "#FBFAF6", 0.8), [0, y - 0.005, d / 2 + 0.005], 0, s);
    let x = -w / 2 + 0.12;
    let k = r * 2;
    while (x < w / 2 - 0.12) {
      const m = goods[k % goods.length]!;
      const kind = (k + r) % 3;
      if (kind === 0) B.cyl(0.055, 0.055, 0.15, m, [x, y + 0.095, 0.02], 12, s), B.cyl(0.058, 0.058, 0.03, fx(c, "#FBFAF6", 0.6), [x, y + 0.18, 0.02], 12, s);
      else if (kind === 1) B.box(0.13, 0.2, 0.1, m, [x, y + 0.118, 0.02], 0.01, s);
      else B.cyl(0.035, 0.045, 0.24, m, [x, y + 0.138, 0.02], 10, s);
      // price chip on the strip
      if (k % 2 === 0) B.box(0.06, 0.035, 0.006, k % 4 === 0 ? accent(c, 0.45) : fx(c, "#FFE58A", 0.8), [x, y - 0.005, d / 2 + 0.012], 0, s);
      x += kind === 1 ? 0.19 : 0.16;
      k++;
    }
  }
  B.box(w, 0.04, d, wood, [0, h, 0], 0.01, s);
  // a striped awning on top: a shop, not an office shelf
  const white = fx(c, "#FFFFFF", 0.7);
  for (let i = 0; i < 7; i++) {
    const st = B.box(w / 7, 0.05, 0.2, i % 2 ? white : accent(c, 0.45), [-w / 2 + (i + 0.5) * (w / 7), h + 0.06, d / 2 - 0.02], 0, s);
    st.rotation.x = 0.5;
  }
}

/** A chalk A-frame sign ("$" + an arrow) by the door. */
function aFrame(c: Ctx, g: THREE.Object3D, pos: P3, rotY: number) {
  const { B } = c;
  const s = B.sub(pos, rotY, g);
  shadowRect(c, 0.6, 0.55, [0, 0, 0], s, 0.25);
  const wood = fx(c, C.oakDark, 0.6);
  const slate = fx(c, "#27352F", 0.9);
  for (const sz of [-1, 1]) {
    const p = B.sub([0, 0, sz * 0.13], 0, s);
    p.rotation.x = sz * 0.2;
    B.box(0.5, 0.78, 0.03, wood, [0, 0.39, 0], 0.012, p);
    B.box(0.42, 0.62, 0.035, slate, [0, 0.42, 0], 0.008, p);
    if (sz > 0) {
      glyph3D(c, p, "$", [0, 0.54, 0.022], 0.03, fx(c, "#F6D365", 0.8), 0.006);
      const chalk = fx(c, "#EEF0E8", 0.9);
      B.box(0.26, 0.02, 0.006, chalk, [0, 0.32, 0.02], 0, p);
      B.box(0.18, 0.02, 0.006, chalk, [-0.04, 0.26, 0.02], 0, p);
      B.box(0.1, 0.03, 0.006, accent(c, 0.45), [0.1, 0.19, 0.02], 0, p);
    }
  }
}
