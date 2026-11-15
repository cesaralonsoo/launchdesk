// WS-OFFICE · rooms/lobby.ts — the lobby: the founder's HQ. (designer D)
// Concept: "the founder's front door" — a reception counter with a bell by the door and a HELLO mat, a warm
// waiting lounge facing the camera, the CEO's executive desk (name plate, in-tray, trophy credenza behind) and the
// company sign framed by a low bench of plants. Lovely at night: lamps, a glowing counter strip, the sign.
// Fixed by the office (index.ts), keep clear: the company sign on the left wall (x −2.93, y 0.84, z −1.28, 2.1 × 0.66 m)
// and the in-tray where findings land (−1.62, 0.722, −0.18) — the tray itself is built here.
import * as THREE from "three";
import { posterTex } from "../pixel";
import {
  accent, accentSoft, armchair, C, decor, deskLamp, floorLamp, framed, fx, lampMat, laptop, neonMat, plant, pool, rug,
  shadowRect, shadowRound, sofa, type Ctx, type P3, type ThemeFn,
} from "./common";
import { bookStack, milestonesTex, mix, nameplateTex, succulent, welcomeMatTex } from "./d-kit";

/** The CEO's executive desk: walnut top, solid sides, a front modesty panel in the company colour. Sitter at +Z. */
function execDesk(c: Ctx, g: THREE.Object3D, pos: P3, rotY: number, w = 1.5) {
  const { B } = c;
  const d = B.sub(pos, rotY, g);
  const walnut = fx(c, "#9A6B47", 0.5);
  const cream = fx(c, "#F3EEE6", 0.5);
  shadowRect(c, w + 0.45, 1.1, [0, 0, 0], d, 0.36);
  B.box(w, 0.06, 0.74, walnut, [0, 0.71, 0], 0.02, d);
  for (const sx of [-1, 1]) B.box(0.07, 0.68, 0.7, cream, [sx * (w / 2 - 0.05), 0.34, 0], 0.02, d);
  // modesty panel (faces the room / the camera) with a brass rail
  B.box(w - 0.12, 0.5, 0.04, accent(c, 0.4), [0, 0.42, -0.31], 0.01, d);
  B.box(w - 0.12, 0.025, 0.05, fx(c, C.brass, 0.3, 0.8), [0, 0.19, -0.31], 0, d);
  // drawer block on the sitter's right
  B.box(0.4, 0.5, 0.6, cream, [w / 2 - 0.3, 0.42, 0.02], 0.02, d);
  for (const y of [0.32, 0.52]) B.box(0.14, 0.014, 0.012, fx(c, C.brass, 0.3, 0.8), [w / 2 - 0.3, y, 0.33], 0, d);
  // top: laptop, name plate, mug, desk lamp, a framed photo, a succulent
  laptop(c, d, [-0.08, 0.74, 0.06], 0);
  const plate = B.sub([0.0, 0.74, -0.3], Math.PI, d);
  B.box(0.26, 0.07, 0.05, fx(c, C.ink, 0.4), [0, 0.035, 0], 0, plate).rotation.x = -0.35;
  B.plane(0.24, 0.09, c.R.m("glow", c.room, c.color, { map: nameplateTex(c.color) }), [0, 0.04, 0.03], plate).rotation.x = -0.35;
  B.cyl(0.042, 0.038, 0.09, accentSoft(c, 0.45), [0.38, 0.785, 0.18], 14, d);
  deskLamp(c, d, [0.58, 0.74, -0.2]);
  const ph = B.sub([0.36, 0.74, -0.2], -0.35, d);
  B.box(0.13, 0.16, 0.02, fx(c, C.oakDark, 0.5), [0, 0.08, 0], 0, ph).rotation.x = -0.18;
  B.plane(0.1, 0.12, c.R.m("fixed", c.room, c.color, { map: posterTex("plant"), rough: 0.85, key: "art" }), [0, 0.082, 0.012], ph).rotation.x = -0.18;
  succulent(c, d, [-0.6, 0.74, -0.24]);
  return d;
}

/** Executive high-back chair in the company colour, faces +Z of its frame (sitter looks +Z). */
function bossChair(c: Ctx, g: THREE.Object3D, pos: P3, rotY: number) {
  const { B } = c;
  const ch = B.sub(pos, rotY, g);
  shadowRound(c, 0.38, [0, 0, 0], ch, 0.3);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    B.box(0.04, 0.035, 0.28, fx(c, C.metal, 0.4, 0.3), [Math.sin(a) * 0.13, 0.05, Math.cos(a) * 0.13], 0, ch).rotation.y = a;
  }
  B.cyl(0.025, 0.025, 0.24, fx(c, C.steel, 0.3, 0.7), [0, 0.18, 0], 10, ch);
  const leather = fx(c, mix(c.color, "#1E2229", 0.45), 0.55);
  B.box(0.52, 0.09, 0.5, leather, [0, 0.34, 0], 0, ch);
  const back = B.box(0.5, 0.74, 0.1, leather, [0, 0.74, -0.24], 0, ch);
  back.rotation.x = -0.1;
  B.box(0.38, 0.5, 0.02, accent(c, 0.85), [0, 0.72, -0.18], 0, ch).rotation.x = -0.1;
  for (const sx of [-1, 1]) B.box(0.06, 0.05, 0.36, fx(c, C.metal, 0.4, 0.3), [sx * 0.27, 0.5, -0.02], 0, ch);
}

export const lobby: ThemeFn = (ctx) => {
  const { c, group: g } = ctx;
  const { B } = c;
  const brass = fx(c, C.brass, 0.3, 0.8);
  const cream = fx(c, "#F3EEE6", 0.5);

  // ── CEO corner: executive desk, boss chair, rug, the in-tray where findings land
  rug(c, g, "rect", 2.1, 1.7, [-1.85, 0, 0.4]);
  execDesk(c, g, [ctx.desk.x, 0, ctx.desk.z], ctx.desk.rotY, 1.5);
  bossChair(c, g, [-2.22, 0, 0.35], Math.PI / 2);
  const tray = B.sub([-1.62, 0.722, -0.18], 0, g);
  B.box(0.3, 0.035, 0.24, brass, [0, 0.03, 0], 0, tray);
  B.box(0.26, 0.014, 0.2, fx(c, "#FBFAF6", 0.9), [0, 0.052, 0], 0, tray);
  B.box(0.24, 0.006, 0.18, fx(c, "#FFE58A", 0.9), [0.01, 0.062, 0.01], 0, tray).rotation.y = 0.12;

  // behind the founder: a low credenza with a trophy, books and a lamp; milestones framed above
  const cr = B.sub([-2.72, 0, 1.55], Math.PI / 2, g);
  shadowRect(c, 1.4, 0.6, [0, 0, 0], cr, 0.3);
  B.box(1.2, 0.5, 0.38, fx(c, "#9A6B47", 0.5), [0, 0.29, 0], 0.02, cr);
  B.box(1.22, 0.03, 0.4, cream, [0, 0.555, 0], 0, cr);
  for (const sx of [-0.3, 0.3]) B.box(0.008, 0.4, 0.004, fx(c, "#6E4A31", 0.7), [sx, 0.29, 0.19], 0, cr);
  for (const sx of [-1, 1]) B.box(0.03, 0.04, 0.3, fx(c, C.metal, 0.4, 0.3), [sx * 0.52, 0.02, 0], 0, cr);
  // trophy (gold cup on a dark base)
  const tr = B.sub([-0.35, 0.57, 0], 0, cr);
  B.box(0.12, 0.06, 0.12, fx(c, C.ink, 0.4), [0, 0.03, 0], 0, tr);
  B.cyl(0.02, 0.02, 0.08, brass, [0, 0.1, 0], 8, tr);
  B.cyl(0.08, 0.035, 0.12, fx(c, "#E2B04A", 0.25, 0.8), [0, 0.2, 0], 12, tr);
  for (const sx of [-1, 1]) B.torus(0.035, 0.01, brass, [sx * 0.085, 0.21, 0], Math.PI * 2, tr).rotation.y = Math.PI / 2;
  bookStack(c, cr, [0.12, 0.57, 0.02], [mix(c.color, C.ink, 0.3), "#E9E3D8", C.oakDark], 0.2);
  // credenza lamp
  const cl = B.sub([0.44, 0.57, -0.02], 0, cr);
  B.cyl(0.05, 0.06, 0.03, brass, [0, 0.015, 0], 12, cl);
  B.cyl(0.012, 0.012, 0.26, brass, [0, 0.15, 0], 6, cl);
  B.cyl(0.08, 0.12, 0.14, lampMat(c), [0, 0.32, 0], 16, cl);
  pool(c, 0.5, [0.2, 0, 0.5], cr, 0.35);
  framed(c, g, [-2.93, 0.93, 1.55], Math.PI / 2, milestonesTex(c.color), 0.72, 0.32, "#9A6B47");
  plant(c, g, [-2.6, 0, 2.28], "tall", "#9A6B47");

  // ── under the company sign: a low bench with cushions + two potted plants (all below the sign, never on it)
  const bn = B.sub([-2.45, 0, -1.3], Math.PI / 2, g);
  shadowRect(c, 1.6, 0.55, [0, 0, 0], bn, 0.28);
  B.box(1.4, 0.07, 0.38, fx(c, C.oak, 0.5), [0, 0.34, 0], 0.02, bn);
  for (const sx of [-1, 1]) B.box(0.06, 0.32, 0.34, fx(c, C.oakDark, 0.6), [sx * 0.62, 0.16, 0], 0, bn);
  B.box(0.5, 0.04, 0.32, accentSoft(c), [-0.32, 0.395, 0], 0.015, bn);
  B.box(0.5, 0.04, 0.32, accent(c, 0.9), [0.32, 0.395, 0], 0.015, bn);
  plant(c, g, [-2.45, 0, -2.18], "bush", C.potDark);
  plant(c, g, [-2.58, 0, -0.28], "small", C.potDark);

  // ── reception counter by the door (right of the entry): front panel in the company colour, glowing strip
  const rc = B.sub([1.75, 0, -1.92], 0, g);
  shadowRect(c, 2.0, 0.95, [0, 0, 0], rc, 0.36);
  B.box(1.6, 0.86, 0.5, cream, [0, 0.43, 0], 0.02, rc);
  B.box(1.5, 0.66, 0.02, accent(c, 0.4), [0, 0.42, 0.255], 0, rc);
  for (let i = 0; i < 7; i++) B.box(0.035, 0.6, 0.02, accentSoft(c, 0.4), [-0.6 + i * 0.2, 0.42, 0.268], 0, rc);
  B.box(1.72, 0.05, 0.62, fx(c, C.oak, 0.4), [0, 0.885, 0.04], 0.015, rc);
  B.box(1.5, 0.025, 0.02, neonMat(c, mix(c.color, "#ffffff", 0.35)), [0, 0.07, 0.262], 0, rc);
  // service bell, guest book + pen, a vase of flowers, a small monitor facing the visitor
  const bell = B.sub([-0.45, 0.91, 0.12], 0, rc);
  B.cyl(0.07, 0.075, 0.015, fx(c, C.ink, 0.4), [0, 0.008, 0], 12, bell);
  B.sphere(0.055, fx(c, "#E2B04A", 0.25, 0.8), [0, 0.02, 0], 12, bell).scale.set(1, 0.8, 1);
  B.cyl(0.006, 0.006, 0.03, brass, [0, 0.075, 0], 6, bell);
  const gb = B.sub([0.05, 0.91, 0.14], 0.15, rc);
  B.box(0.3, 0.02, 0.2, fx(c, mix(c.color, C.ink, 0.35), 0.6), [0, 0.01, 0], 0, gb);
  B.box(0.27, 0.008, 0.18, fx(c, "#FBFAF6", 0.9), [0, 0.024, 0], 0, gb);
  B.box(0.008, 0.008, 0.14, fx(c, C.ink, 0.4), [0.09, 0.032, 0.0], 0, gb).rotation.y = 0.5;
  const vase = B.sub([0.58, 0.91, 0.02], 0, rc);
  B.cyl(0.05, 0.04, 0.16, fx(c, "#E8E4DC", 0.4), [0, 0.08, 0], 10, vase);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    B.cyl(0.004, 0.004, 0.18, fx(c, C.leafA, 0.6), [Math.sin(a) * 0.02, 0.24, Math.cos(a) * 0.02], 4, vase);
    B.box(0.05, 0.05, 0.05, fx(c, i % 2 ? "#F7B2C4" : "#FFE58A", 0.7), [Math.sin(a) * 0.045, 0.34 + (i % 2) * 0.03, Math.cos(a) * 0.045], 0, vase);
  }
  plant(c, g, [2.6, 0, -2.15], "tall");

  // ── waiting lounge facing the room (and the camera): sofa, two armchairs, coffee table, round rug, floor lamp
  rug(c, g, "round", 2.6, 2.3, [1.75, 0, 0.75]);
  sofa(c, g, [1.75, 0, -0.1], 0, 1.7);
  const creamC: Ctx = { ...c, color: "#E9DCC8" };
  armchair(creamC, g, [0.75, 0, 1.2], Math.PI / 2 + 0.3);
  armchair(creamC, g, [2.45, 0, 1.45], -Math.PI / 2 - 0.45);
  for (const [x, z, r] of [[0.68, 1.28, 0.3], [2.5, 1.5, -0.45]] as const) {
    const pl = B.box(0.26, 0.24, 0.08, accent(c, 0.9), [x, 0.5, z], 0, g);
    pl.rotation.set(-0.2, r + (x < 1 ? Math.PI / 2 : -Math.PI / 2), 0);
  }
  const ct = B.sub([1.7, 0, 0.95], 0, g);
  shadowRound(c, 0.48, [0, 0, 0], ct, 0.25);
  B.cyl(0.4, 0.4, 0.05, fx(c, C.oak, 0.45), [0, 0.36, 0], 24, ct);
  B.cyl(0.05, 0.08, 0.34, fx(c, C.metal, 0.4, 0.3), [0, 0.17, 0], 8, ct);
  B.cyl(0.2, 0.22, 0.02, fx(c, C.metal, 0.4, 0.3), [0, 0.01, 0], 12, ct);
  B.box(0.22, 0.012, 0.3, accentSoft(c), [-0.14, 0.391, 0.02], 0, ct).rotation.y = 0.35;
  B.box(0.22, 0.012, 0.3, fx(c, "#F6F3EE", 0.8), [-0.1, 0.403, 0.05], 0, ct).rotation.y = 0.05;
  B.cyl(0.04, 0.036, 0.08, fx(c, "#FBFAF6", 0.4), [0.18, 0.425, -0.08], 12, ct);
  B.cyl(0.11, 0.09, 0.05, fx(c, "#E8E4DC", 0.4), [0.16, 0.41, 0.15], 12, ct);
  for (const [x, z, col] of [[0.12, 0.13, "#F59E0B"], [0.19, 0.17, "#E5484D"], [0.15, 0.2, "#22A06B"]] as const) B.sphere(0.035, fx(c, col, 0.5), [x, 0.45, z], 8, ct);
  floorLamp(c, g, [2.6, 0, 0.55]);

  // ── the door: a HELLO mat inside the entry, a coat stand and a water cooler beside it
  const matM = c.R.m("fixed", c.room, c.color, { map: welcomeMatTex(c.color), rough: 1, key: "mat" });
  B.decal(1.0, 0.5, matM, [0, 0.004, -1.95], g);
  const cs = B.sub([-1.35, 0, -2.15], 0, g);
  shadowRound(c, 0.24, [0, 0, 0], cs, 0.25);
  B.cyl(0.16, 0.18, 0.03, fx(c, C.oakDark, 0.5), [0, 0.015, 0], 12, cs);
  B.cyl(0.02, 0.025, 1.62, fx(c, C.oakDark, 0.5), [0, 0.82, 0], 8, cs);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    B.box(0.02, 0.02, 0.14, fx(c, C.oakDark, 0.5), [Math.sin(a) * 0.06, 1.55, Math.cos(a) * 0.06], 0, cs).rotation.set(0.6, a, 0);
  }
  // a coat and a scarf in the company colour
  B.box(0.26, 0.5, 0.12, fx(c, "#C7B49A", 0.9), [0.05, 1.22, 0.1], 0.03, cs).rotation.z = 0.06;
  B.box(0.06, 0.4, 0.05, accent(c, 0.9), [-0.08, 1.25, -0.06], 0, cs).rotation.z = -0.1;
  const wc = B.sub([-2.0, 0, -2.18], 0, g);
  shadowRect(c, 0.5, 0.5, [0, 0, 0], wc, 0.28);
  B.box(0.32, 0.86, 0.3, fx(c, "#EDEDEB", 0.4), [0, 0.43, 0], 0.02, wc);
  B.box(0.1, 0.06, 0.04, fx(c, "#7FB2FF", 0.4), [0, 0.68, 0.16], 0, wc);
  B.cyl(0.13, 0.13, 0.36, c.R.m("glass", c.room, c.color, { color: "#8EC8F2", opacity: 0.55, key: "water" }), [0, 1.06, 0], 12, wc);
  B.cyl(0.13, 0.13, 0.02, fx(c, "#5FA8E0", 0.3), [0, 0.89, 0], 12, wc);

  return decor(ctx);
};
