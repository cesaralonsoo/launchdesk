// WS-OFFICE · rooms/viability.ts — Viability analyst ("is this a business?").
// Concept: the go / no-go lab. A big viability meter (red · amber · green) has its needle twitching in the green;
// a SWOT whiteboard, a kill-criteria flip chart, a go/no-go traffic light and a huddle table with an "idea" bulb
// tell the rest. A bin of crumpled paper = the ideas that did not make it.
import * as THREE from "three";
import { accent, accentSoft, C, decor, fx, lampMat, mergeStatic, neonMat, plant, pool, researchDesk, rug, shadowRect, shadowRound, wallBoard, type ThemeFn } from "./common";
import { checklistTex, flatNote, note, NOTE, rnd, rod, stool, swotTex } from "./b-kit";

export const viability: ThemeFn = (ctx) => {
  const { c, group: g } = ctx;
  const { B } = c;
  researchDesk(ctx, { screen: 0 });
  if (ctx.compact) {
    wallBoard(ctx, "swot");
    // one small prop: a desk-side traffic light (go)
    trafficLight(ctx, [ctx.desk.x + 1.08, 0, -2.12], 0.8);
    return decor(ctx);
  }
  const ink = fx(c, C.ink, 0.45);
  const white = fx(c, "#FBFBF8", 0.5);

  // ── SWOT whiteboard (back wall, right of the desk): four quadrants + real 3D sticky notes + marker tray
  const bw = 2.1, bh = bw / 2.2, bx = 1.35, by = 0.73;
  const sw = B.sub([bx, by, -2.35], 0, g);
  B.box(bw + 0.08, bh + 0.08, 0.04, fx(c, "#D9DCE1", 0.4, 0.4), [0, 0, 0], 0.01, sw);
  B.plane(bw, bh, c.R.m("fixed", c.room, c.color, { map: swotTex(c.color), rough: 0.6, key: "art" }), [0, 0, 0.021], sw);
  const qTone = [NOTE.green, NOTE.pink, NOTE.lilac, NOTE.orange];
  const r = rnd(3);
  for (let q = 0; q < 4; q++) {
    const qx = (q % 2 ? 1 : -1) * bw * 0.25, qy = (q < 2 ? 1 : -1) * bh * 0.25;
    for (let k = 0; k < 3; k++) note(c, sw, [qx + 0.2 + (k % 2) * 0.13, qy + 0.08 - k * 0.09, 0.03], k === 2 ? NOTE.yellow : qTone[q]!, 0.1, (r() - 0.5) * 0.3);
  }
  B.box(bw * 0.8, 0.03, 0.07, fx(c, "#C9CDD3", 0.35, 0.5), [0, -bh / 2 - 0.05, 0.04], 0.01, sw);
  ["#22A06B", "#E5484D", c.color].forEach((col, i) => (B.cyl(0.014, 0.014, 0.13, fx(c, col, 0.5), [-0.5 + i * 0.16, -bh / 2 - 0.025, 0.05], 8, sw).rotation.z = Math.PI / 2));
  B.box(0.12, 0.05, 0.05, fx(c, "#3A3F47", 0.7), [0.3, -bh / 2 - 0.01, 0.05], 0.01, sw);

  // ── hero: the viability meter — a big dial on a plinth (red · amber · green), the needle twitching in the green
  const gm = B.sub([2.0, 0, -0.75], 0.6, g);
  shadowRect(c, 1.3, 0.75, [0, 0, 0], gm, 0.32);
  B.box(0.95, 0.42, 0.42, fx(c, C.lacquer, 0.45), [0, 0.21, 0], 0.03, gm);
  B.box(0.97, 0.05, 0.44, accent(c, 0.4), [0, 0.445, 0], 0.015, gm);
  B.box(0.08, 0.35, 0.08, fx(c, "#3A3F47", 0.5, 0.2), [0, 0.62, 0], 0.01, gm);
  const R0 = 0.6, cy = 0.85;
  const dial = B.sub([0, cy, 0], 0, gm);
  const wedge = (r: number, d: number, t0: number, t1: number, m: THREE.Material, z: number) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d, ctx.hi ? 24 : 12, 1, false, t0, t1 - t0), m);
    w.rotation.x = Math.PI / 2;
    w.position.z = z;
    w.castShadow = w.receiveShadow = true;
    dial.add(w);
  };
  const P = Math.PI;
  wedge(R0 + 0.07, 0.08, P / 2, P * 1.5, fx(c, "#2C3037", 0.5, 0.2), 0);
  wedge(R0, 0.04, P / 2, P * (5 / 6), fx(c, "#2FB37A", 0.55), 0.045);
  wedge(R0, 0.04, P * (5 / 6), P * (7 / 6), fx(c, "#F5A524", 0.55), 0.045);
  wedge(R0, 0.04, P * (7 / 6), P * 1.5, fx(c, "#E5484D", 0.55), 0.045);
  wedge(R0 * 0.55, 0.05, P / 2, P * 1.5, white, 0.05);
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * P;
    const tk = B.box(0.018, i % 3 === 0 ? 0.1 : 0.06, 0.012, white, [Math.cos(a) * (R0 - 0.07), Math.sin(a) * (R0 - 0.07), 0.07], 0, dial, false);
    tk.rotation.z = a - P / 2;
  }
  B.box(R0 * 2 + 0.14, 0.05, 0.1, fx(c, "#2C3037", 0.5, 0.2), [0, -0.02, 0], 0.01, dial);
  // tiny icons: a tick on the green side, a cross on the red side
  const tick = B.sub([0.42, 0.14, 0.08], 0, dial);
  B.box(0.035, 0.07, 0.02, white, [-0.025, 0.0, 0], 0, tick, false).rotation.z = 0.7;
  B.box(0.035, 0.13, 0.02, white, [0.025, 0.03, 0], 0, tick, false).rotation.z = -0.55;
  const cross = B.sub([-0.42, 0.14, 0.08], 0, dial);
  B.box(0.03, 0.12, 0.02, white, [0, 0, 0], 0, cross, false).rotation.z = 0.78;
  B.box(0.03, 0.12, 0.02, white, [0, 0, 0], 0, cross, false).rotation.z = -0.78;
  const tmp = new THREE.Group();
  B.box(0.05, R0 - 0.08, 0.025, fx(c, "#1E2229", 0.4), [0, (R0 - 0.08) / 2, 0], 0, tmp);
  B.cyl(0.0, 0.045, 0.09, fx(c, "#1E2229", 0.4), [0, R0 - 0.05, 0], 8, tmp);
  B.sphere(0.065, accent(c, 0.4), [0, 0, 0.01], 14, tmp);
  const needle = ctx.animate(mergeStatic(tmp, c.R));
  needle.position.set(0, 0, 0.1);
  needle.rotation.z = -0.72;
  dial.add(needle);
  // a little lamp on top of the dial, lit at night
  B.cyl(0.05, 0.07, 0.06, fx(c, "#2C3037", 0.5, 0.2), [0, R0 + 0.1, 0], 12, dial);
  B.sphere(0.06, neonMat(c, "#2FD07F"), [0, R0 + 0.16, 0], 12, dial);

  // ── kill-criteria flip chart (front-left, turned to the camera)
  const ez = B.sub([-2.3, 0, 1.15], 0.95, g);
  shadowRect(c, 0.9, 0.6, [0, 0, 0], ez, 0.25);
  const wood = fx(c, C.oakDark, 0.6);
  rod(c, ez, [-0.34, 0, 0.12], [-0.25, 1.5, 0.0], 0.022, wood);
  rod(c, ez, [0.34, 0, 0.12], [0.25, 1.5, 0.0], 0.022, wood);
  rod(c, ez, [0, 0, -0.42], [0, 1.45, -0.04], 0.02, wood);
  B.box(0.78, 0.04, 0.09, wood, [0, 0.52, 0.11], 0.01, ez);
  B.box(0.72, 0.03, 0.05, fx(c, "#3A3F47", 0.5), [0, 1.43, 0.05], 0.01, ez);
  const paper = B.sub([0, 1.0, 0.07], 0, ez);
  paper.rotation.x = -0.08;
  B.box(0.68, 0.86, 0.02, white, [0, 0, -0.012], 0, paper);
  B.plane(0.66, 0.84, c.R.m("fixed", c.room, c.color, { map: checklistTex(c.color), rough: 0.85, key: "art" }), [0, 0, 0.0], paper);
  // flipped-over pages curling at the top
  B.box(0.68, 0.06, 0.05, fx(c, "#EDEBE6", 0.8), [0, 0.43, -0.01], 0.02, paper);
  B.cyl(0.012, 0.012, 0.11, accent(c, 0.4), [0.12, 0.535, 0.12], 8, ez).rotation.z = Math.PI / 2;

  // ── the bin of killed ideas (crumpled paper)
  const bin = B.sub([-1.7, 0, 1.95], 0, g);
  shadowRound(c, 0.24, [0, 0, 0], bin, 0.25);
  B.cyl(0.17, 0.13, 0.34, fx(c, "#3A3F47", 0.5, 0.2), [0, 0.17, 0], 16, bin);
  B.cyl(0.155, 0.155, 0.01, fx(c, "#2A2E35", 0.8), [0, 0.32, 0], 16, bin);
  const crumple = fx(c, "#F4F1EA", 0.95);
  for (const [x, y, z, s] of [[-0.05, 0.36, 0.02, 0.07], [0.06, 0.37, -0.04, 0.065], [0.0, 0.42, 0.03, 0.06], [0.24, 0.05, 0.12, 0.05], [-0.2, 0.05, 0.22, 0.045], [0.1, 0.045, 0.3, 0.04]] as const) B.blob(s, crumple, [x, y, z], 0, bin);

  // ── huddle table: standing round table, sticky notes, a glowing idea bulb, two stools
  const t = B.sub([0.7, 0, 0.95], 0, g);
  shadowRound(c, 0.75, [0, 0, 0], t, 0.25);
  B.cyl(0.5, 0.5, 0.045, fx(c, C.lacquer, 0.4), [0, 0.92, 0], 40, t);
  B.cyl(0.03, 0.03, 0.9, fx(c, C.metal, 0.4, 0.3), [0, 0.45, 0], 10, t);
  B.cyl(0.24, 0.26, 0.025, fx(c, C.metal, 0.4, 0.3), [0, 0.012, 0], 24, t);
  flatNote(c, t, [0.2, 0.948, 0.12], NOTE.green, 0.14, 0.35);
  flatNote(c, t, [-0.22, 0.948, -0.05], NOTE.pink, 0.13, -0.2);
  flatNote(c, t, [0.02, 0.948, 0.3], NOTE.yellow, 0.13, 0.1);
  flatNote(c, t, [0.28, 0.948, -0.16], NOTE.lilac, 0.12, -0.5);
  B.box(0.24, 0.012, 0.18, fx(c, "#ECEAE4", 0.85), [-0.12, 0.95, 0.22], 0.004, t).rotation.y = 0.5;
  B.cyl(0.04, 0.036, 0.09, accent(c, 0.45), [-0.3, 0.99, 0.18], 14, t);
  // the idea bulb (table lamp): glows at night
  B.cyl(0.07, 0.08, 0.03, fx(c, C.metal, 0.4, 0.3), [0.02, 0.957, -0.24], 16, t);
  B.cyl(0.04, 0.045, 0.07, fx(c, "#BFC4CB", 0.3, 0.7), [0.02, 1.005, -0.24], 12, t);
  B.sphere(0.1, lampMat(c), [0.02, 1.13, -0.24], 20, t);
  pool(c, 0.9, [0, 0, 0], t, 0.4);
  stool(c, t, [Math.sin(2.0) * 0.82, 0, Math.cos(2.0) * 0.82], accent(c, 0.85), 0.66);
  stool(c, t, [Math.sin(0.9) * 0.84, 0, Math.cos(0.9) * 0.84], accentSoft(c, 0.85), 0.66);
  rug(c, g, "round", 2.3, 2.3, [0.85, 0, 0.85]);

  // ── the go / no-go traffic light (back, right of the desk)
  trafficLight(ctx, [-0.42, 0, -2.12], 1);

  // plants
  plant(c, g, [-2.6, 0, -1.15], "tall", C.terracotta);
  plant(c, g, [2.62, 0, 1.95], "bush");
  plant(c, g, [-2.62, 0, 2.05], "small");
  return decor(ctx, { update: (_dt, time) => void (needle.rotation.z = -0.72 + Math.sin(time * 1.3) * 0.05 + Math.sin(time * 7.1) * 0.012) });
};

/** A go / no-go traffic light on a pole: red and amber dim, green lit (glows at night). */
function trafficLight(ctx: Parameters<ThemeFn>[0], pos: [number, number, number], s: number) {
  const { c } = ctx;
  const { B } = c;
  const tl = B.sub(pos, 0.35, ctx.group);
  shadowRound(c, 0.22 * s, [0, 0, 0], tl, 0.25);
  const dark = fx(c, "#2C3037", 0.45, 0.2);
  B.cyl(0.13 * s, 0.15 * s, 0.04, dark, [0, 0.02, 0], 16, tl);
  B.cyl(0.025 * s, 0.025 * s, 0.85 * s, fx(c, "#8A8F98", 0.35, 0.6), [0, 0.45 * s, 0], 8, tl);
  const hy = 0.85 * s + 0.24 * s;
  B.box(0.2 * s, 0.5 * s, 0.16 * s, dark, [0, hy, 0], 0.03, tl);
  const lamps: Array<[string, boolean]> = [["#E5484D", false], ["#F5A524", false], ["#2FD07F", true]];
  lamps.forEach(([col, on], i) => {
    const y = hy + (0.15 - i * 0.15) * s;
    B.sphere(0.052 * s, on ? neonMat(c, col) : fx(c, mixDim(col), 0.4), [0, y, 0.07 * s], 14, tl).scale.z = 0.55;
    B.box(0.15 * s, 0.025 * s, 0.07 * s, dark, [0, y + 0.07 * s, 0.1 * s], 0.008, tl);
  });
}

const mixDim = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.45 + 0x2c * 0.55).toString(16).padStart(2, "0");
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
};
