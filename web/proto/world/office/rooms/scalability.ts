// WS-OFFICE · rooms/scalability.ts — Scalability analyst ("can it grow?").
// Concept: the model-maker's studio. A city diorama on a big table where one little shop (with a pink awning)
// has been copied block after block, and a toy tower crane swings in the next one. A 3D hockey-stick growth chart
// on the wall (room → floor → building → district), a row of pots from seed to tree, and franchise kits in boxes.
import * as THREE from "three";
import { accent, accentSoft, C, decor, fx, lampMat, mergeStatic, mixHex, neonMat, plainRug, plant, pool, researchDesk, shadowRect, shadowRound, wallBoard, type Ctx, type ThemeFn } from "./common";
import { cityTex, growthTex, rod } from "./b-kit";

export const scalability: ThemeFn = (ctx) => {
  const { c, group: g } = ctx;
  const { B } = c;
  researchDesk(ctx, { screen: 0 });
  if (ctx.compact) {
    wallBoard(ctx, "growth");
    // one small prop: three mini shops stacked on a pedestal
    const p = B.sub([ctx.desk.x + 1.08, 0, -2.1], 0.3, g);
    shadowRect(c, 0.5, 0.5, [0, 0, 0], p, 0.25);
    B.box(0.4, 0.55, 0.4, fx(c, C.lacquer, 0.45), [0, 0.275, 0], 0.02, p);
    B.box(0.42, 0.04, 0.42, accent(c, 0.4), [0, 0.57, 0], 0.01, p);
    let y = 0.59;
    for (const [i, s] of [1.5, 1.2, 0.9].entries()) {
      miniShop(c, p, [0, y, 0], i * 0.3, s);
      y += 0.155 * s;
    }
    return decor(ctx);
  }

  // ── growth chart on the back wall: grid panel + 3D bars rising in pink + an arrow
  const gw = 2.2, gh = gw * (300 / 640), gx = 1.25, gy = 0.69;
  const gp = B.sub([gx, gy, -2.35], 0, g);
  // a dark slate board so the pink bars pop (the old pale print washed out in the overview)
  B.box(gw + 0.1, gh + 0.1, 0.04, fx(c, "#F4F1EA", 0.5), [0, 0, 0], 0.012, gp);
  B.box(gw, gh, 0.012, fx(c, "#2E3440", 0.8), [0, 0, 0.024], 0, gp);
  for (let k = 1; k <= 3; k++) B.box(gw - 0.12, 0.008, 0.004, fx(c, "#4A5262", 0.8), [0, -gh / 2 + 0.09 + k * 0.22, 0.032], 0, gp, false);
  void growthTex;
  const axis = gh / 2 - gh * (242 / 300);
  const hs = [0.08, 0.12, 0.17, 0.25, 0.38, 0.58];
  const tops: Array<[number, number]> = [];
  hs.forEach((h, i) => {
    const x = -gw / 2 + 0.3 + i * 0.3;
    B.box(0.2, h, 0.06, i >= 4 ? neonMat(c, mixHex(c.color, "#ffffff", 0.1)) : fx(c, mixHex(c.color, "#ffffff", 0.35 - i * 0.06), 0.5), [x, axis + h / 2, 0.05], 0.015, gp);
    tops.push([x, axis + h + 0.07]);
  });
  const arrowM = fx(c, "#FFD43B", 0.45);
  for (let i = 0; i < tops.length - 1; i++) rod(c, gp, [tops[i]![0], tops[i]![1], 0.09], [tops[i + 1]![0], tops[i + 1]![1], 0.09], 0.016, arrowM);
  const last = tops[tops.length - 1]!, prev = tops[tops.length - 2]!;
  const ang = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
  const tip = B.cyl(0.0, 0.055, 0.12, arrowM, [last[0] + Math.cos(ang) * 0.05, last[1] + Math.sin(ang) * 0.05, 0.09], 8, gp);
  tip.rotation.z = ang - Math.PI / 2;
  for (const [x, y] of tops) B.sphere(0.025, accent(c, 0.4), [x, y, 0.09], 10, gp);

  // ── hero: the city diorama on a big table
  const tb = B.sub([1.1, 0, 0.45], 0, g);
  const tw = 1.9, td = 1.25, ty = 0.6;
  shadowRect(c, tw + 0.4, td + 0.4, [0, 0, 0], tb, 0.3);
  B.box(tw, 0.05, td, fx(c, C.oak, 0.55), [0, ty, 0], 0.02, tb);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(0.05, ty - 0.02, 0.05, fx(c, C.metal, 0.4, 0.3), [sx * (tw / 2 - 0.08), (ty - 0.02) / 2, sz * (td / 2 - 0.08)], 0, tb);
  const bw = tw - 0.14, bd = td - 0.14, by = ty + 0.025;
  B.box(bw, 0.04, bd, fx(c, "#E9E4DC", 0.6), [0, by + 0.02, 0], 0.01, tb);
  const city = B.sub([0, by + 0.041, 0], 0, tb);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.04, bd - 0.04).rotateX(-Math.PI / 2), c.R.m("fixed", c.room, c.color, { map: cityTex(), rough: 0.9, key: "art" }));
  top.receiveShadow = true;
  city.add(top);
  // the street grid (cityTex): roads at u ≈ .25 .58 .86 and v ≈ .31 .70 → blocks between them
  const U = (u: number) => -bw / 2 + 0.02 + u * (bw - 0.04), V = (v: number) => -bd / 2 + 0.02 + v * (bd - 0.04);
  // the original shop (bigger, centre block) + copies spreading out; a few towers where it grows up
  miniShop(c, city, [U(0.415), 0, V(0.5)], 0, 1.35, true);
  const copies: Array<[number, number, number, number]> = [
    [0.12, 0.13, 0.4, 0.9], [0.12, 0.5, 0, 0.95], [0.415, 0.14, 0, 1.0], [0.72, 0.5, Math.PI, 1.0],
    [0.72, 0.13, 0.2, 0.9], [0.415, 0.86, Math.PI, 1.0], [0.12, 0.86, 0, 0.9], [0.95, 0.86, -0.4, 0.85],
  ];
  for (const [u, v, r, s] of copies) miniShop(c, city, [U(u), 0, V(v)], r, s);
  tower(c, city, [U(0.95), 0, V(0.13)], 0.4);
  tower(c, city, [U(0.95), 0, V(0.48)], 0.3);
  tower(c, city, [U(0.72), 0, V(0.86)], 0.22);
  const leaf = [fx(c, C.leafC, 0.6), fx(c, C.leafA, 0.6)];
  for (const [u, v] of [[0.03, 0.32], [0.32, 0.32], [0.5, 0.32], [0.66, 0.68], [0.03, 0.68], [0.32, 0.69], [0.79, 0.32]] as const) {
    B.cyl(0.006, 0.006, 0.04, fx(c, "#6B5442", 0.8), [U(u), 0.02, V(v)], 5, city);
    B.blob(0.03, leaf[(u * 10) % 2 > 1 ? 1 : 0]!, [U(u), 0.06, V(v)], 0, city);
  }
  // a tiny tape measure and a cutting knife at the table edge (model-maker detail)
  B.cyl(0.05, 0.05, 0.03, accent(c, 0.4), [-tw / 2 + 0.09, ty + 0.04, td / 2 - 0.08], 14, tb);
  B.box(0.16, 0.012, 0.025, fx(c, "#F5B82E", 0.5), [-tw / 2 + 0.2, ty + 0.032, td / 2 - 0.05], 0, tb);
  plainRug(c, g, 2.8, 2.2, [1.1, 0, 0.45]);
  // a pendant-style work lamp over the model (floor-standing arc lamp)
  arcLamp(c, g, [-0.05, 0, -0.75], [0.95, 0.7]);

  // ── the toy tower crane (back right) swinging the next shop in
  // (moved to the open left-middle so it no longer covers the growth chart)
  const crane = B.sub([0.2, 0, -1.25], 0, g);
  const yellow = fx(c, "#F5B82E", 0.5), dark = fx(c, "#3A3F47", 0.5);
  shadowRect(c, 0.6, 0.6, [0, 0, 0], crane, 0.3);
  B.box(0.42, 0.12, 0.42, fx(c, "#9AA0A8", 0.6), [0, 0.06, 0], 0.015, crane);
  const mastH = 1.75;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(0.03, mastH, 0.03, yellow, [sx * 0.08, 0.12 + mastH / 2, sz * 0.08], 0, crane);
  for (let i = 0; i < 7; i++) {
    const y = 0.2 + i * 0.24;
    for (const [rx, rz, ry] of [[0, 0.08, 0], [0, -0.08, 0], [0.08, 0, Math.PI / 2], [-0.08, 0, Math.PI / 2]] as const) {
      const d = B.box(0.22, 0.018, 0.018, yellow, [rx, y + 0.12, rz], 0, crane);
      d.rotation.set(0, ry, i % 2 ? 0.75 : -0.75);
    }
  }
  const tmp = new THREE.Group();
  B.box(0.24, 0.2, 0.24, yellow, [0.0, 0.1, 0], 0.02, tmp);
  B.box(0.15, 0.14, 0.13, fx(c, "#F7F6F2", 0.5), [0.13, 0.12, 0.12], 0.02, tmp);
  B.box(0.11, 0.08, 0.005, fx(c, "#A9D4FF", 0.2, 0.2), [0.13, 0.14, 0.188], 0, tmp);
  const jibL = 1.6;
  B.box(jibL, 0.08, 0.08, yellow, [-jibL / 2, 0.24, 0], 0.01, tmp);
  for (let i = 0; i < 8; i++) B.box(0.012, 0.11, 0.012, dark, [-0.12 - i * 0.17, 0.24, 0.045], 0, tmp);
  B.box(0.4, 0.08, 0.08, yellow, [0.25, 0.24, 0], 0.01, tmp);
  B.box(0.18, 0.18, 0.16, fx(c, "#9AA0A8", 0.7), [0.36, 0.15, 0], 0.02, tmp);
  B.box(0.04, 0.32, 0.04, yellow, [0, 0.42, 0], 0, tmp);
  rod(c, tmp, [0, 0.58, 0], [-jibL + 0.05, 0.28, 0], 0.006, dark);
  rod(c, tmp, [0, 0.58, 0], [0.42, 0.28, 0], 0.006, dark);
  // trolley, cable, hook and the dangling next shop
  const hx = -1.35;
  B.box(0.08, 0.04, 0.1, dark, [hx, 0.18, 0], 0.01, tmp);
  const hookY = -0.95;
  rod(c, tmp, [hx, 0.17, 0], [hx, hookY + 0.06, 0], 0.004, dark);
  B.box(0.05, 0.04, 0.03, accent(c, 0.4), [hx, hookY + 0.04, 0], 0.008, tmp);
  for (const s of [-1, 1]) rod(c, tmp, [hx, hookY + 0.03, 0], [hx + s * 0.06, hookY - 0.06, s * 0.05], 0.003, dark);
  miniShop(c, tmp, [hx, hookY - 0.2, 0], 0.4, 1.0);
  const jib = ctx.animate(mergeStatic(tmp, c.R));
  jib.position.set(0, 0.12 + mastH, 0);
  jib.rotation.y = 2.1;
  crane.add(jib);

  // ── seed → sprout → plant → tree along the left wall (growth, literally)
  const pinkPot = "#F3C3D6";
  // a low plank shelf along the left wall carries the growth row, double size so it reads from the overview
  B.box(0.42, 0.22, 2.9, fx(c, C.oak, 0.55), [-2.66, 0.11, 0.75], 0.02, g);
  B.box(0.44, 0.03, 2.94, accent(c, 0.5), [-2.66, 0.235, 0.75], 0.01, g);
  const sp = B.sub([-2.62, 0.25, -0.4], 0, g);
  sp.scale.setScalar(2);
  shadowRound(c, 0.14, [0, 0, 0], sp, 0.25);
  B.box(0.14, 0.12, 0.14, fx(c, pinkPot, 0.75), [0, 0.06, 0], 0.015, sp);
  B.box(0.11, 0.02, 0.11, fx(c, "#4A3B2F", 1), [0, 0.12, 0], 0, sp);
  B.cyl(0.006, 0.006, 0.07, fx(c, C.leafC, 0.6), [0, 0.165, 0], 5, sp);
  B.box(0.05, 0.01, 0.03, fx(c, C.leafC, 0.6), [-0.025, 0.2, 0], 0, sp).rotation.z = 0.4;
  B.box(0.05, 0.01, 0.03, fx(c, C.leafC, 0.6), [0.025, 0.2, 0], 0, sp).rotation.z = -0.4;
  for (const [z, kind, k] of [[0.3, "small", 1.5], [1.15, "bush", 1.15], [1.95, "tall", 0.95]] as const) {
    const pg = B.sub([-2.62, 0.25, z], 0, g);
    pg.scale.setScalar(k);
    plant(c, pg, [0, 0, 0], kind, pinkPot);
  }

  // ── franchise kits: cardboard boxes with pink tape, one open with a shop popping out
  const bx = B.sub([2.05, 0, 1.75], -0.35, g);
  shadowRect(c, 1.0, 0.7, [0, 0, 0], bx, 0.28);
  const kraft = fx(c, "#C9A574", 0.85), tape = accent(c, 0.85);
  const box = (x: number, y: number, z: number, s: number, r = 0, open = false) => {
    const b = B.sub([x, y, z], r, bx);
    B.box(s, s * 0.8, s, kraft, [0, s * 0.4, 0], 0.01, b);
    if (open) {
      for (const sd of [-1, 1]) B.box(s, 0.01, s * 0.45, kraft, [0, s * 0.8 + 0.08, sd * (s / 2 + 0.06)], 0, b).rotation.x = sd * -0.9;
      miniShop(c, b, [0, s * 0.62, 0], 0.3, 1.1);
    } else {
      B.box(s + 0.004, 0.006, 0.06, tape, [0, s * 0.8, 0], 0, b);
      B.box(0.06, s * 0.8 + 0.004, s + 0.004, tape, [0, s * 0.4, 0], 0, b);
    }
  };
  box(-0.22, 0, 0, 0.38, 0.1);
  box(-0.2, 0.304, 0.02, 0.3, -0.2);
  box(0.28, 0, 0.05, 0.34, 0.15, true);

  return decor(ctx, { update: (_dt, time) => void (jib.rotation.y = 2.1 + Math.sin(time * 0.35) * 0.2) });
};

/** A mini shop (≈ 0.16 m wide at s = 1): white walls, pink striped awning, a door and a lit window. Faces +Z. */
function miniShop(c: Ctx, parent: THREE.Object3D, pos: [number, number, number], rotY: number, s: number, hero = false) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  g.scale.setScalar(s);
  B.box(0.16, 0.13, 0.14, fx(c, hero ? "#FFFDF8" : "#F4F1EA", 0.6), [0, 0.065, 0], 0.008, g);
  B.box(0.18, 0.025, 0.16, fx(c, "#E9E4DC", 0.6), [0, 0.142, 0], 0.006, g);
  // awning: alternating stripes
  for (let i = 0; i < 4; i++) {
    const a = B.box(0.042, 0.012, 0.06, i % 2 ? fx(c, "#ffffff", 0.7) : accent(c, 0.85), [-0.063 + i * 0.042, 0.1, 0.09], 0, g, false);
    a.rotation.x = 0.45;
  }
  B.box(0.04, 0.065, 0.004, fx(c, "#8A6A4F", 0.6), [-0.035, 0.033, 0.071], 0, g, false);
  B.box(0.05, 0.04, 0.004, lampMat(c), [0.035, 0.045, 0.071], 0, g, false);
  return g;
}

/** A little tower block (accent-soft with window bands). */
function tower(c: Ctx, parent: THREE.Object3D, pos: [number, number, number], h: number) {
  const { B } = c;
  const g = B.sub(pos, 0, parent);
  B.box(0.13, h, 0.13, accentSoft(c, 0.5), [0, h / 2, 0], 0.008, g);
  for (let y = 0.05; y < h - 0.03; y += 0.06) B.box(0.134, 0.018, 0.134, lampMat(c), [0, y, 0], 0, g, false);
  B.box(0.09, 0.03, 0.09, fx(c, "#E9E4DC", 0.6), [0, h + 0.015, 0], 0, g);
}

/** Arc floor lamp: base at `pos`, shade hanging over `reach` (dx, dz) — glows at night with a pool below. */
function arcLamp(c: Ctx, parent: THREE.Object3D, pos: [number, number, number], reach: [number, number]) {
  const { B } = c;
  const g = B.sub(pos, 0, parent);
  const m = fx(c, "#2C3037", 0.4, 0.3);
  shadowRound(c, 0.22, [0, 0, 0], g, 0.25);
  B.cyl(0.14, 0.15, 0.04, fx(c, "#F7F6F2", 0.4), [0, 0.02, 0], 16, g);
  const [dx, dz] = reach;
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push([dx * t, 0.04 + Math.sin(t * Math.PI * 0.62) * 1.55, dz * t]);
  }
  for (let i = 0; i < pts.length - 1; i++) rod(c, g, pts[i]!, pts[i + 1]!, 0.022, m);
  const end = pts[pts.length - 1]!;
  // a proper pendant hood: neck, a domed shade with a rim
  B.cyl(0.03, 0.03, 0.08, m, [end[0], end[1] - 0.02, end[2]], 8, g);
  B.cyl(0.07, 0.2, 0.16, accent(c, 0.4), [end[0], end[1] - 0.12, end[2]], 18, g);
  B.cyl(0.205, 0.205, 0.025, fx(c, "#F7F6F2", 0.4), [end[0], end[1] - 0.2, end[2]], 18, g);
  B.sphere(0.08, lampMat(c), [end[0], end[1] - 0.2, end[2]], 14, g);
  // the light lands on the model below (a pool on the table top)
  pool(c, 0.6, [0, 0, 0], B.sub([end[0], 0.655, end[2]], 0, g), 0.6);
}
