// WS-OFFICE · rooms/demand.ts — Demand analyst ("will people want it?").
// Concept: the customer-interview studio. A cork wall covered in clustered sticky notes (what people said),
// persona posters, a cosy interview set (two armchairs, mic, softbox, camera with a REC light), a glowing
// speech-bubble sign and queue-belt posts at the door: if the idea is good, people line up.
import { accent, accentSoft, armchair, C, decor, framed, fx, lampMat, neonMat, plant, pool, researchDesk, plainRug, shadowRound, sideTable, wallBoard, type ThemeFn } from "./common";
import { deptWallTex } from "../pixel";
import { note, NOTE, rnd, rod } from "./b-kit";

export const demand: ThemeFn = (ctx) => {
  const { c, group: g } = ctx;
  const { B } = c;
  researchDesk(ctx, { screen: 0 });
  headset(ctx, [ctx.desk.x - 0.39, 1.405, -2.18]);
  if (ctx.compact) {
    wallBoard(ctx, "personas");
    // one small prop: a mic on a desk-side stand
    micStand(ctx, [ctx.desk.x + 1.05, 0, -2.05], 0.6, 1.0);
    return decor(ctx);
  }
  const metal = fx(c, C.metal, 0.4, 0.3);

  // ── hero: the affinity wall (cork, back wall) — four clusters of notes under accent header cards
  const ww = 3.1, wh = 0.92, wx = 1.32, wy = 0.7;
  const aw = B.sub([wx, wy, -2.35], 0, g);
  B.box(ww + 0.1, wh + 0.1, 0.04, fx(c, "#FBFAF6", 0.5), [0, 0, 0], 0.012, aw);
  B.box(ww, wh, 0.02, fx(c, "#D8BF98", 0.95), [0, 0, 0.02], 0, aw);
  const r = rnd(9);
  // saturated, bigger and fewer notes so the clusters read from the overview
  const clusters = ["#FFD43B", "#FF7AA2", "#4DABF7", "#51CF66"];
  void NOTE;
  const pinM = fx(c, "#E5484D", 0.4);
  for (let k = 0; k < 4; k++) {
    const cx = -ww / 2 + 0.42 + k * 0.76;
    // header card in the room colour
    B.box(0.56, 0.14, 0.012, fx(c, "#1F6B45", 0.5), [cx, wh / 2 - 0.17, 0.036], 0, aw, false);
    B.box(0.3, 0.025, 0.004, fx(c, "#ffffff", 0.6), [cx - 0.04, wh / 2 - 0.17, 0.043], 0, aw, false);
    const n = 5 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const col = r() < 0.15 ? clusters[(k + 1) % 4]! : clusters[k]!;
      const x = cx - 0.12 + (i % 2) * 0.24 + (r() - 0.5) * 0.03;
      const y = wh / 2 - 0.38 - Math.floor(i / 2) * 0.2 + (r() - 0.5) * 0.03;
      note(c, aw, [x, y, 0.035], col, 0.18, (r() - 0.5) * 0.3);
      if (i % 3 === 1) B.sphere(0.012, pinM, [x, y + 0.045, 0.045], 8, aw);
    }
  }
  // fairy lights along the top of the wall (glow at night)
  const bulb = lampMat(c), wire = fx(c, "#3A3F47", 0.6);
  let pp: [number, number, number] | null = null;
  for (let i = 0; i <= 16; i++) {
    const x = -ww / 2 + 0.05 + i * ((ww - 0.1) / 16);
    const y = wh / 2 - 0.035 - Math.abs(Math.sin(i * (Math.PI / 4))) * 0.05;
    const q: [number, number, number] = [x, y, 0.06];
    if (pp) rod(c, aw, pp, q, 0.003, wire);
    if (i % 2 === 1) B.sphere(0.032, bulb, [x, y - 0.03, 0.065], 8, aw);
    pp = q;
  }
  // strings joining two insights across clusters
  const string = fx(c, "#C0392B", 0.6);
  rod(c, aw, [-0.6, -0.2, 0.05], [0.35, 0.03, 0.05], 0.004, string);
  rod(c, aw, [0.35, 0.03, 0.05], [0.95, -0.25, 0.05], 0.004, string);

  // ── personas: three customer posters on the left wall
  framed(c, g, [-2.89, 0.62, 1.0], Math.PI / 2, deptWallTex("personas", c.color), 1.5, 1.5 * (56 / 96), C.oak);

  // ── speech-bubble neon on the left wall (glows at night)
  const sb = B.sub([-2.88, 0.8, -0.95], Math.PI / 2, g);
  B.box(0.62, 0.4, 0.02, fx(c, "#F7F6F2", 0.6), [0, 0, 0], 0.03, sb);
  const neon = neonMat(c, c.color);
  const t = 0.028;
  B.box(0.5, t, t, neon, [0, 0.14, 0.03], 0, sb);
  B.box(0.5, t, t, neon, [0, -0.14, 0.03], 0, sb);
  B.box(t, 0.28 + t, t, neon, [-0.25, 0, 0.03], 0, sb);
  B.box(t, 0.28 + t, t, neon, [0.25, 0, 0.03], 0, sb);
  const tail = B.box(t, 0.14, t, neon, [-0.13, -0.19, 0.03], 0, sb);
  tail.rotation.z = -0.6;
  for (let i = 0; i < 3; i++) B.sphere(0.035, neon, [-0.12 + i * 0.12, 0, 0.035], 10, sb);

  // ── the interview set: guest + host armchairs, a low table with two mugs, mic, softbox, camera
  armchair(c, g, [2.05, 0, -0.75], -Math.PI / 2 - 0.5);
  armchair(c, g, [0.55, 0, 0.35], Math.PI / 2 + 0.25);
  const st = sideTable(c, g, [1.35, 0, -0.1], 0.42, 0.24);
  B.cyl(0.04, 0.036, 0.08, accent(c, 0.45), [0.08, 0.475, 0.02], 14, st);
  B.cyl(0.04, 0.036, 0.08, fx(c, C.lacquer, 0.4), [-0.08, 0.475, -0.05], 14, st);
  B.box(0.16, 0.012, 0.2, fx(c, "#ECEAE4", 0.85), [0.02, 0.442, 0.12], 0.004, st).rotation.y = 0.4;
  plainRug(c, g, 2.7, 2.3, [1.3, 0, -0.15], true);
  pool(c, 1.2, [1.3, 0, -0.15], g, 0.5);
  micStand(ctx, [1.6, 0, -1.25], 1.0, 1.0);
  // softbox on a stand (glows at night), aimed at the guest
  const sbx = B.sub([2.25, 0, -1.75], -0.5, g);
  shadowRound(c, 0.3, [0, 0, 0], sbx, 0.25);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    rod(c, sbx, [Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24], [0, 0.45, 0], 0.012, metal);
  }
  B.cyl(0.014, 0.014, 0.9, metal, [0, 0.9, 0], 8, sbx);
  const head = B.sub([0, 1.38, 0], 0, sbx);
  head.rotation.x = 0.25;
  B.box(0.5, 0.42, 0.22, fx(c, "#2C3037", 0.6), [0, 0, -0.08], 0.03, head);
  B.box(0.46, 0.38, 0.02, lampMat(c), [0, 0, 0.04], 0, head);
  pool(c, 0.9, [-0.2, 0, 0.6], sbx, 0.45);
  // camera on a tripod, pointing at the guest; REC light
  camera(ctx, [0.6, 0, -1.05], -1.1);

  // ── the queue at the door: retractable-belt posts (chrome, belt in the room colour) — people line up
  const chrome = fx(c, "#C9CDD3", 0.3, 0.6);
  const posts: Array<[number, number]> = [[0.45, 1.5], [1.15, 1.95], [2.0, 1.95]];
  for (const [x, z] of posts) {
    const p = B.sub([x, 0, z], 0, g);
    shadowRound(c, 0.18, [0, 0, 0], p, 0.25);
    B.cyl(0.13, 0.14, 0.035, fx(c, "#2C3037", 0.5, 0.2), [0, 0.018, 0], 16, p);
    B.cyl(0.024, 0.024, 0.86, chrome, [0, 0.45, 0], 10, p);
    B.cyl(0.042, 0.042, 0.07, chrome, [0, 0.86, 0], 12, p);
  }
  const belt = accent(c, 0.4);
  for (let i = 0; i < posts.length - 1; i++) {
    const [x0, z0] = posts[i]!, [x1, z1] = posts[i + 1]!;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const bm = B.box(len, 0.05, 0.008, belt, [(x0 + x1) / 2, 0.84, (z0 + z1) / 2], 0, g);
    bm.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  }
  // a little A-board sign with a heart
  const ab = B.sub([0.2, 0, 2.05], 0.55, g);
  for (const s of [-1, 1]) {
    const pnl = B.box(0.42, 0.56, 0.025, fx(c, "#2C3037", 0.8), [0, 0.27, s * 0.08], 0.01, ab);
    pnl.rotation.x = s * 0.16;
  }
  B.box(0.46, 0.04, 0.04, fx(c, C.oak, 0.6), [0, 0.56, 0], 0.01, ab);
  const heart = B.sub([0, 0.3, 0.125], 0, ab);
  heart.rotation.x = -0.16;
  const hm = fx(c, "#FF6B8A", 0.5);
  B.sphere(0.06, hm, [-0.045, 0.03, 0], 12, heart).scale.z = 0.3;
  B.sphere(0.06, hm, [0.045, 0.03, 0], 12, heart).scale.z = 0.3;
  const hb = B.box(0.09, 0.09, 0.02, hm, [0, -0.02, 0], 0, heart);
  hb.rotation.z = Math.PI / 4;

  plant(c, g, [-2.6, 0, -1.2], "bush", C.terracotta);
  plant(c, g, [-2.6, 0, 2.05], "tall");
  return decor(ctx);
};

/** Over-ear headset hanging on a monitor corner. */
function headset(ctx: Parameters<ThemeFn>[0], pos: [number, number, number]) {
  const { c } = ctx;
  const { B } = c;
  const h = B.sub(pos, 0, ctx.group);
  B.torus(0.075, 0.012, fx(c, "#2C3037", 0.5), [0, 0, 0.0], Math.PI, h).rotation.set(0, Math.PI / 2, 0);
  B.cyl(0.04, 0.04, 0.035, accent(c, 0.45), [0, -0.01, 0.075], 14, h).rotation.x = Math.PI / 2;
  B.cyl(0.04, 0.04, 0.035, accent(c, 0.45), [0, -0.01, -0.075], 14, h).rotation.x = Math.PI / 2;
}

/** Studio mic on a boom stand. `s` scales the stand height. */
function micStand(ctx: Parameters<ThemeFn>[0], pos: [number, number, number], rotY: number, s: number) {
  const { c } = ctx;
  const { B } = c;
  const metal = fx(c, C.metal, 0.4, 0.3);
  const m = B.sub(pos, rotY, ctx.group);
  shadowRound(c, 0.2, [0, 0, 0], m, 0.22);
  B.cyl(0.13, 0.14, 0.025, metal, [0, 0.012, 0], 16, m);
  B.cyl(0.014, 0.014, 0.95 * s, metal, [0, 0.475 * s, 0], 8, m);
  rod(c, m, [0, 0.95 * s, 0], [0, 1.1 * s, 0.32], 0.011, metal);
  const mic = B.sub([0, 1.1 * s, 0.32], 0, m);
  mic.rotation.x = 0.5;
  B.cyl(0.035, 0.03, 0.13, fx(c, "#3A3F47", 0.45, 0.4), [0, -0.02, 0], 12, mic);
  B.sphere(0.045, fx(c, "#9AA0A8", 0.5, 0.5), [0, 0.07, 0], 12, mic);
  B.torus(0.05, 0.006, accent(c, 0.4), [0, 0.0, 0], Math.PI * 2, mic).rotation.x = Math.PI / 2;
}

/** Video camera on a tripod with a red REC light (glows at night). Faces +Z. */
function camera(ctx: Parameters<ThemeFn>[0], pos: [number, number, number], rotY: number) {
  const { c } = ctx;
  const { B } = c;
  const metal = fx(c, C.metal, 0.4, 0.3);
  const cm = B.sub(pos, rotY, ctx.group);
  shadowRound(c, 0.3, [0, 0, 0], cm, 0.22);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.3;
    rod(c, cm, [Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26], [0, 0.95, 0], 0.012, metal);
  }
  const body = B.sub([0, 1.07, 0], 0, cm);
  body.rotation.x = 0.08;
  B.box(0.16, 0.16, 0.28, fx(c, "#2C3037", 0.5), [0, 0, 0], 0.03, body);
  B.cyl(0.065, 0.075, 0.12, fx(c, "#1E2229", 0.4), [0, 0, 0.19], 16, body).rotation.x = Math.PI / 2;
  B.cyl(0.05, 0.05, 0.005, fx(c, "#5B8DEF", 0.15, 0.3), [0, 0, 0.252], 16, body).rotation.x = Math.PI / 2;
  B.box(0.04, 0.1, 0.12, fx(c, "#2C3037", 0.5), [0.1, 0.02, -0.05], 0.01, body);
  B.sphere(0.022, neonMat(c, "#FF3B47"), [-0.05, 0.09, 0.08], 10, body);
  B.box(0.02, 0.02, 0.003, accent(c, 0.4), [0.03, 0.06, 0.141], 0, body);
}
