// WS-OFFICE · rooms/market.ts — Market analyst ("how much money is in this market?").
//
// Concept: a sunny little trading floor. The hero is a giant bar chart made of gold coin stacks rising across a
// TAM / SAM / SOM rug (three nested circles), a green growth arrow over the stacks and a coin spinning on the top
// one; behind it a wall of six trading screens with a scrolling ticker that glows at night.
// Supporting: a vault safe with gold bars, a credenza of market reports with a golden bull, a piggy bank, a money tree.
import * as THREE from "three";
import { coin, coinStack, glyph3D, strand, tickerTex, tradingWallTex } from "./a-kit";
import { accent, accentSoft, C, credenza, decor, fx, mergeStatic, plant, pool, researchDesk, screenMat, shadowRect, shadowRound, wallBoard, type Ctx, type P3, type ThemeFn } from "./common";

export const market: ThemeFn = (ctx) => {
  const { c, group: g } = ctx;
  researchDesk(ctx, { screen: 1, dual: true });
  if (ctx.compact) {
    wallBoard(ctx, "money");
    piggyBank(c, g, [ctx.side === "a" ? -2.5 : 2.5, 0, 0.5], ctx.side === "a" ? -0.2 : -1.2);
    return decor(ctx);
  }

  const ticker = tradingWall(c, g);
  tamRug(c, g, [1.2, 0, 0.55], 2.75);
  const top = coinChart(ctx, g);
  vault(c, g, [-2.58, 0, -0.75]);
  reports(c, g, [-2.2, 0, 1.15]);
  // a warm pool over the coin stacks at night
  pool(c, 1.3, [1.3, 0, 0.6], g, 0.45);
  piggyBank(c, g, [2.45, 0, 1.75], -0.75);
  plant(c, g, [-2.55, 0, 2.05], "tall", C.terracotta);
  plant(c, g, [2.62, 0, -0.1], "bush");

  return decor(ctx, {
    update(_dt, t) {
      top.rotation.y = t * 1.1;
      top.position.y = top.userData.y + Math.sin(t * 2) * 0.02;
      ticker.offset.x = (t * 0.035) % 1;
    },
  });
};

// ─────────────────────────────────────────────── trading wall (back wall)

function tradingWall(c: Ctx, g: THREE.Object3D): THREE.Texture {
  const { B } = c;
  const s = B.sub([1.18, 0, -2.37], 0, g);
  const w = 2.5, h = w * (36 / 104);
  const cy = 0.76;
  B.box(w + 0.08, h + 0.08, 0.05, fx(c, "#23272E", 0.4, 0.2), [0, cy, 0.025], 0.015, s);
  B.plane(w, h, screenMat(c, tradingWallTex(c.color)), [0, cy, 0.052], s).receiveShadow = false;
  // the ticker strip underneath
  const tt = tickerTex(c.color);
  B.box(w + 0.08, 0.1, 0.05, fx(c, "#23272E", 0.4, 0.2), [0, 0.27, 0.025], 0.012, s);
  B.plane(w, 0.07, screenMat(c, tt), [0, 0.27, 0.052], s).receiveShadow = false;
  // a little "live" lamp on the frame
  B.box(0.05, 0.05, 0.02, c.R.m("led", c.room, c.color, { color: "#FF5A5F" }), [-w / 2 + 0.08, cy + h / 2 + 0.005, 0.06], 0.01, s);
  return tt;
}

/** TAM / SAM / SOM: three nested soft discs (plain geometry, smooth edges — no pixel dithering). */
function tamRug(c: Ctx, g: THREE.Object3D, pos: P3, d: number) {
  const { B } = c;
  const rings: [number, THREE.Material][] = [
    [d / 2, c.R.m("rug", c.room, c.color, { rough: 1, key: "tam0", shade: 1.12 })],
    [d * 0.34, accentSoft(c, 0.95)],
    [d * 0.19, accent(c, 0.9)],
  ];
  rings.forEach(([r, m], i) => {
    B.cyl(r, r, 0.006, m, [pos[0], 0.004 + i * 0.004, pos[2]], 48, g).receiveShadow = true;
  });
  // a thin gold rim on the outer ring
  B.torus(d / 2 - 0.02, 0.012, fx(c, "#E2B04A", 0.4, 0.4), [pos[0], 0.012, pos[2]], Math.PI * 2, g).rotation.x = Math.PI / 2;
}

// ─────────────────────────────────────────────── the hero: coin-stack bar chart

function coinChart(ctx: Parameters<ThemeFn>[0], g: THREE.Object3D): THREE.Object3D {
  const { c } = ctx;
  const { B } = c;
  const counts = [5, 8, 12, 16, 21];
  const t = 0.052;
  const tops: P3[] = [];
  counts.forEach((n, k) => {
    const x = 0.3 + k * 0.46, z = 1.2 - k * 0.34;
    shadowRound(c, 0.3, [x, 0, z], g, 0.32);
    coinStack(c, g, [x, 0, z], n, 0.17, t);
    tops.push([x, n * t, z]);
  });
  // growth arrow above the stacks (slightly in front of them)
  const green = fx(c, "#2FB57C", 0.5);
  const pts: P3[] = tops.map(([x, y, z], k) => [x + 0.06, y + 0.24 + (k === 4 ? 0.0 : 0), z + 0.24]);
  pts[4] = [pts[4]![0] - 0.18, pts[4]![1] - 0.05, pts[4]![2] + 0.12];
  for (let i = 0; i < pts.length - 1; i++) strand(c, g, pts[i]!, pts[i + 1]!, 0.032, green, 8);
  for (const p of pts.slice(0, 4)) B.sphere(0.034, green, p, 10, g);
  // arrow head pointing along the last segment
  const a = pts[3]!, b = pts[4]!;
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const head = B.cyl(0, 0.09, 0.18, green, [b[0] + dir.x * 0.07, b[1] + dir.y * 0.07, b[2] + dir.z * 0.07], 12, g);
  head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  // a coin spinning above the tallest stack (animated)
  const src = new THREE.Group();
  coin(c, src, [0, 0, 0], 0.15, 0.04);
  const spinner = ctx.animate(mergeStatic(src, c.R));
  const tp = tops[4]!;
  spinner.position.set(tp[0], tp[1] + 0.26, tp[2]);
  spinner.userData.y = tp[1] + 0.26;
  g.add(spinner);
  // a few loose coins on the rug
  const loose = fx(c, "#F6C94E", 0.4, 0.2);
  for (const [x, z, r] of [[0.75, 1.55, 0.2], [1.6, 1.3, 1.1], [0.15, 0.6, 2.0]] as const) B.cyl(0.11, 0.11, 0.03, loose, [x, 0.015, z], 16, g).rotation.y = r;
  return spinner;
}

// ─────────────────────────────────────────────── supporting props

/** A chunky vault safe (faces +X) with gold bars on top. */
function vault(c: Ctx, g: THREE.Object3D, pos: P3) {
  const { B } = c;
  const v = B.sub(pos, Math.PI / 2, g);
  shadowRect(c, 0.95, 0.85, [0, 0, 0], v, 0.34);
  const steel = fx(c, "#56616E", 0.45, 0.35);
  B.box(0.72, 0.78, 0.6, steel, [0, 0.43, 0], 0.04, v);
  for (const sx of [-1, 1]) B.box(0.08, 0.06, 0.5, fx(c, "#3E4752", 0.5, 0.3), [sx * 0.3, 0.03, 0], 0.01, v);
  B.box(0.6, 0.64, 0.04, fx(c, "#66727F", 0.4, 0.35), [0, 0.43, 0.31], 0.025, v);
  // hinges
  for (const y of [0.25, 0.6]) B.box(0.04, 0.09, 0.05, fx(c, "#3E4752", 0.5, 0.3), [-0.31, y, 0.32], 0.01, v);
  // dial + wheel handle in brass
  const brass = fx(c, C.brass, 0.3, 0.75);
  const dial = B.cyl(0.09, 0.09, 0.04, brass, [0.08, 0.56, 0.34], 20, v);
  dial.rotation.x = Math.PI / 2;
  B.cyl(0.05, 0.05, 0.05, fx(c, "#E8D3A0", 0.4, 0.4), [0.08, 0.56, 0.355], 16, v).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    const sp = B.box(0.22, 0.022, 0.022, brass, [0.08, 0.3, 0.36], 0.008, v);
    sp.rotation.z = a;
  }
  B.cyl(0.03, 0.03, 0.05, brass, [0.08, 0.3, 0.35], 10, v).rotation.x = Math.PI / 2;
  // gold bars, a little pyramid
  const gold = fx(c, "#F6C94E", 0.35, 0.25);
  const bar = (x: number, y: number, z: number, r: number) => {
    const b = B.box(0.22, 0.07, 0.11, gold, [x, y, z], 0.012, v);
    b.rotation.y = r;
    b.scale.set(1, 1, 1);
  };
  bar(-0.12, 0.855, -0.05, 0.05);
  bar(0.12, 0.855, -0.07, -0.04);
  bar(0.0, 0.855, 0.12, 0.08);
  bar(0.0, 0.925, 0.0, -0.1);
}

/** Credenza of market reports + a golden bull (bull market) and a desk calculator. Faces +X. */
function reports(c: Ctx, g: THREE.Object3D, pos: P3) {
  const { B } = c;
  credenza(c, g, pos, Math.PI / 2, 1.2);
  const top = B.sub([pos[0], 0.54, pos[2]], Math.PI / 2, g);
  for (let i = 0; i < 5; i++) B.box(0.07, 0.3, 0.24, i % 3 === 0 ? accent(c, 0.6) : accentSoft(c), [-0.5 + i * 0.085, 0.15, -0.03], 0.01, top);
  // the bull
  const bull = B.sub([0.25, 0, 0], -0.5, top);
  const gold = fx(c, "#EDBB4C", 0.35, 0.25);
  B.box(0.3, 0.06, 0.16, fx(c, "#3A3D44", 0.5), [0, 0.03, 0], 0.01, bull);
  B.box(0.24, 0.12, 0.12, gold, [0, 0.16, 0], 0.03, bull);
  B.box(0.1, 0.1, 0.1, gold, [0.15, 0.2, 0], 0.025, bull);
  for (const sz of [-1, 1]) {
    B.box(0.03, 0.03, 0.06, gold, [0.17, 0.27, sz * 0.06], 0.008, bull).rotation.x = sz * 0.5;
    for (const sx of [-1, 1]) B.box(0.035, 0.08, 0.035, gold, [sx * 0.08, 0.09, sz * 0.04], 0.008, bull);
  }
  B.box(0.02, 0.08, 0.02, gold, [-0.13, 0.19, 0], 0.006, bull).rotation.z = -0.6;
}

/** A pink piggy bank on a little plinth, a coin about to drop in. Faces +X of its frame. */
function piggyBank(c: Ctx, g: THREE.Object3D, pos: P3, rotY: number) {
  const { B } = c;
  const p = B.sub(pos, rotY, g);
  shadowRect(c, 0.65, 0.65, [0, 0, 0], p, 0.3);
  B.box(0.5, 0.36, 0.5, fx(c, "#F4F3F0", 0.45), [0, 0.18, 0], 0.025, p);
  B.box(0.52, 0.04, 0.52, accent(c, 0.45), [0, 0.37, 0], 0.012, p);
  const pink = fx(c, "#F5A9BC", 0.55);
  const pk = B.sub([0, 0.39, 0], 0, p);
  const body = B.sphere(0.2, pink, [0, 0.21, 0], 18, pk);
  body.scale.set(1.25, 0.95, 0.95);
  B.cyl(0.075, 0.08, 0.07, fx(c, "#F28CA6", 0.55), [0.26, 0.21, 0], 14, pk).rotation.z = Math.PI / 2;
  for (const sz of [-1, 1]) {
    B.box(0.012, 0.025, 0.02, fx(c, "#B85772", 0.6), [0.296, 0.21, sz * 0.025], 0, pk);
    B.box(0.07, 0.08, 0.025, fx(c, "#F28CA6", 0.55), [0.12, 0.38, sz * 0.1], 0.01, pk).rotation.z = -0.3;
    B.sphere(0.022, fx(c, C.ink, 0.4), [0.2, 0.28, sz * 0.085], 8, pk);
    for (const sx of [-1, 1]) B.cyl(0.04, 0.045, 0.1, pink, [sx * 0.13, 0.05, sz * 0.09], 10, pk);
  }
  B.box(0.12, 0.012, 0.025, fx(c, "#B85772", 0.6), [-0.02, 0.4, 0], 0, pk);
  B.torus(0.03, 0.01, fx(c, "#F28CA6", 0.55), [-0.26, 0.26, 0], Math.PI * 1.5, pk);
  // the coin going in
  const cn = B.sub([-0.02, 0.47, 0], Math.PI / 2, pk);
  B.cyl(0.07, 0.07, 0.022, fx(c, "#E9B949", 0.3, 0.6), [0, 0, 0], 16, cn).rotation.x = Math.PI / 2;
  glyph3D(c, cn, "$", [0, 0, 0.013], 0.011, fx(c, "#C8932E", 0.35, 0.6), 0.006);
}
