// WS-OFFICE · rooms/dex.ts — Dex, the designer (logo + website). (designer D)
// Concept: "a product-design studio" — hero: a giant browser-window display showing the website mockup (glows at
// night); a tilted drafting table with logo roughs, the chosen mark as a 3D sculpture on a plinth, a giant pencil
// cup, wireframes on the glass and logo sheets on the feature wall. Desk (dual monitors) + chair are fixed.
import * as THREE from "three";
import { logoGridTex } from "../textures";
import {
  accent, accentSoft, C, decor, desk, deskLamp, floorLamp, framed, fx, glowMat, plant, plainRug, pool, shadowRect, shadowRound,
  taskChair, type Ctx, type P3, type ThemeFn,
} from "./common";
import { mix, sketchTex, stool, websiteTex, wireframeTex } from "./d-kit";

/** Big display on a rolling A-stand: the website in a browser window. Faces +Z. */
function siteDisplay(c: Ctx, g: THREE.Object3D, pos: P3, rotY: number, w = 1.62, h = 1.0) {
  const { B } = c;
  const s = B.sub(pos, rotY, g);
  const metal = fx(c, C.metal, 0.4, 0.3);
  shadowRect(c, w * 0.8, 0.7, [0, 0, 0], s, 0.3);
  for (const sx of [-1, 1]) {
    B.box(0.06, 0.04, 0.6, metal, [sx * w * 0.32, 0.06, 0], 0, s);
    for (const sz of [-1, 1]) B.cyl(0.035, 0.035, 0.03, fx(c, "#5B6270", 0.5), [sx * w * 0.32, 0.03, sz * 0.26], 8, s).rotation.z = Math.PI / 2;
    B.box(0.06, 0.98, 0.06, metal, [sx * w * 0.32, 0.55, -0.02], 0, s);
  }
  const yc = 0.5 + h / 2 + 0.06;
  B.box(w + 0.07, h + 0.07, 0.06, fx(c, C.ink, 0.35), [0, yc, 0.0], 0, s);
  // lit in every state (glow role: a backlit print by day, glowing at night) so the hero never reads as a dark slab
  B.plane(w, h, glowMat(c, websiteTex(c.color)), [0, yc, 0.032], s).receiveShadow = false;
  // a thin accent bar under the screen (brand light)
  B.box(w * 0.5, 0.025, 0.03, accent(c, 0.4), [0, yc - h / 2 - 0.06, 0.02], 0, s);
  return s;
}

/** Drafting table with a tilted top, a lit logo sketch, a ruler, a set-square and a clamp lamp. Sitter at +Z. */
function draftingTable(c: Ctx, g: THREE.Object3D, pos: P3, rotY: number) {
  const { B } = c;
  const t = B.sub(pos, rotY, g);
  shadowRect(c, 1.4, 1.0, [0, 0, 0], t, 0.3);
  const metal = fx(c, C.metal, 0.4, 0.3);
  for (const [x, z, h] of [[-0.5, -0.27, 0.92], [0.5, -0.27, 0.92], [-0.5, 0.27, 0.7], [0.5, 0.27, 0.7]] as const) B.box(0.04, h, 0.04, metal, [x, h / 2, z], 0, t);
  B.box(1.0, 0.03, 0.03, metal, [0, 0.2, 0], 0, t);
  const top = B.sub([0, 0.83, 0], 0, t);
  top.rotation.x = 0.36;
  B.box(1.16, 0.04, 0.72, fx(c, C.oak, 0.5), [0, 0, 0], 0, top);
  B.box(1.16, 0.035, 0.03, fx(c, C.oakDark, 0.5), [0, 0.035, 0.36], 0, top);
  B.box(0.6, 0.01, 0.42, fx(c, "#FBFAF5", 0.9), [-0.12, 0.025, 0], 0, top);
  B.plane(0.56, 0.38, c.R.m("fixed", c.room, c.color, { map: sketchTex(c.color), rough: 0.9, key: "art" }), [-0.12, 0.031, 0], top).rotation.x = -Math.PI / 2;
  B.box(0.04, 0.008, 0.6, fx(c, "#F5C542", 0.5), [0.28, 0.034, 0], 0, top).rotation.y = 0.15;
  const sq = B.box(0.18, 0.006, 0.18, c.R.m("glass", c.room, c.color, { color: mix(c.color, "#ffffff", 0.3), opacity: 0.6, key: "setsq" }), [0.4, 0.033, -0.12], 0, top);
  sq.rotation.y = 0.5;
  // pencils on the ledge
  for (const [x, col] of [[-0.3, "#F5C542"], [-0.22, c.color], [0.1, C.ink]] as const) B.box(0.16, 0.012, 0.012, fx(c, col, 0.5), [x, 0.06, 0.37], 0, top);
  deskLamp(c, t, [0.52, 0.92, -0.27]);
  return t;
}

/** The chosen logo as a sculpture: an arch (half ring + two feet) in the brand colour on a white plinth. */
function logoPlinth(c: Ctx, g: THREE.Object3D, pos: P3, rotY: number) {
  const { B } = c;
  const p = B.sub(pos, rotY, g);
  shadowRound(c, 0.42, [0, 0, 0], p, 0.3);
  // a low disc plinth with a chunky app-icon style mark standing on it (rounded tile + white ring + dot)
  B.cyl(0.34, 0.37, 0.4, fx(c, "#F4F3F0", 0.45), [0, 0.2, 0], 24, p);
  B.cyl(0.35, 0.35, 0.03, fx(c, C.oak, 0.5), [0, 0.415, 0], 24, p);
  const m = accent(c, 0.4);
  B.box(0.62, 0.62, 0.14, m, [0, 0.74, 0], 0.08, p);
  const ring = B.torus(0.16, 0.045, fx(c, "#FBFAF7", 0.4), [0, 0.76, 0.075], Math.PI * 2, p);
  void ring;
  B.cyl(0.07, 0.07, 0.04, fx(c, "#F5C542", 0.4), [0.12, 0.62, 0.075], 16, p).rotation.x = Math.PI / 2;
  return p;
}

/** A giant pencil cup with oversized pencils + a ruler: a cute studio prop. */
function pencilCup(c: Ctx, g: THREE.Object3D, pos: P3) {
  const { B } = c;
  const p = B.sub(pos, 0.3, g);
  shadowRound(c, 0.36, [0, 0, 0], p, 0.3);
  B.cyl(0.24, 0.21, 0.48, accentSoft(c, 0.5), [0, 0.24, 0], 16, p);
  B.cyl(0.245, 0.245, 0.04, accent(c, 0.4), [0, 0.46, 0], 16, p);
  const pencil = (x: number, z: number, rx: number, rz: number, len: number, body: string) => {
    const s = B.sub([x, 0.1, z], 0, p);
    s.rotation.set(rx, 0, rz);
    B.box(0.09, len, 0.09, fx(c, body, 0.5), [0, len / 2, 0], 0, s);
    B.cyl(0.0, 0.065, 0.16, fx(c, "#EBCB9C", 0.7), [0, len + 0.08, 0], 6, s);
    B.cyl(0.0, 0.022, 0.05, fx(c, C.ink, 0.5), [0, len + 0.135, 0], 6, s);
    B.box(0.095, 0.05, 0.095, fx(c, "#C9CDD3", 0.35, 0.5), [0, 0.02, 0], 0, s);
    return s;
  };
  pencil(-0.07, 0.04, 0.1, 0.18, 0.9, "#F5C542");
  pencil(0.07, -0.03, -0.12, -0.14, 0.78, c.color);
  pencil(0.02, 0.08, 0.22, -0.02, 0.66, "#3A86FF");
  const r = B.sub([-0.04, 0.1, -0.08], 0, p);
  r.rotation.set(-0.15, 0, 0.32);
  B.box(0.12, 0.92, 0.02, fx(c, "#F4F3F0", 0.5), [0, 0.46, 0], 0, r);
  for (let i = 0; i < 9; i++) B.box(0.05, 0.008, 0.022, fx(c, C.ink, 0.5), [-0.03, 0.1 + i * 0.09, 0], 0, r);
  return p;
}

export const dex: ThemeFn = (ctx) => {
  const { c, group: g } = ctx;
  const { B } = c;

  // ── workstation (fixed) + the feature wall: logo sheets in front of the desk, colour chips behind it
  desk(c, g, [ctx.desk.x, 0, ctx.desk.z], ctx.desk.rotY, 3, { dual: true });
  taskChair(c, g, [-1.56, 0, 0.2], -Math.PI / 2);
  framed(c, g, [-2.9, 0.8, 1.7], Math.PI / 2, logoGridTex(c.color), 1.1, 0.42, C.ink);
  framed(c, g, [-2.9, 0.72, -1.5], Math.PI / 2, sketchTex(c.color), 0.7, 0.48, C.oakDark);

  // ── wireframes on the corridor glass (left of the door)
  const wb = B.sub([-1.85, 0, -2.38], 0, g);
  shadowRect(c, 1.4, 0.4, [0, 0, 0.05], wb, 0.2);
  for (const sx of [-1, 1]) B.box(0.035, 1.02, 0.035, fx(c, C.metal, 0.4, 0.3), [sx * 0.6, 0.51, 0.02], 0, wb);
  B.box(1.24, 0.74, 0.03, fx(c, "#F4F3F0", 0.5), [0, 0.62, 0.04], 0, wb);
  B.plane(1.16, 0.66, c.R.m("fixed", c.room, c.color, { map: wireframeTex(c.color), rough: 0.6, key: "art" }), [0, 0.62, 0.057], wb);
  B.box(1.1, 0.025, 0.06, fx(c, "#E2E0DA", 0.5), [0, 0.25, 0.08], 0, wb);

  // ── hero: the website on a big display against the glass, right of the door, facing the room
  siteDisplay(c, g, [1.75, 0, -2.08], 0);
  pool(c, 1.0, [1.75, 0, -1.4], g, 0.3);

  // ── drafting table + stool (mid-right), on a rug in the brand colour
  plainRug(c, g, 2.6, 3.2, [1.55, 0, 0.6]);
  draftingTable(c, g, [1.4, 0, -0.15], -0.2);
  stool(c, g, [1.3, 0, 0.62], 0.6, accent(c, 0.4));

  // ── the chosen mark on a plinth + the giant pencil cup (front-right, by the open side)
  logoPlinth(c, g, [2.15, 0, 1.05], 0.5);
  pencilCup(c, g, [1.2, 0, 2.0]).scale.setScalar(1.15);
  floorLamp(c, g, [2.55, 0, -0.95]);
  // little paper balls on the floor (rejected sketches)
  for (const [x, z] of [[0.9, 1.25], [1.05, 1.45], [2.0, 1.55]] as const) B.sphere(0.045, fx(c, "#F4F1EA", 0.9), [x, 0.045, z], 8, g);
  plant(c, g, [-2.55, 0, 2.1], "bush", C.terracotta);
  plant(c, g, [0.95, 0, -2.2], "tall");
  return decor(ctx);
};
