// WS-OFFICE · rooms/nova.ts — Nova, the brand designer (name, colours, voice). (designer D)
// Concept: "a boutique brand studio" — hero: a giant swatch-fan sculpture in the brand's shades, fanned towards the
// camera; an easel with the new mark being painted, a stool of paint pots, a name-ideas board on the glass (one note
// circled), a type specimen + moodboard on the feature wall, and a velvet loveseat lounge. Desk + chair are fixed.
import * as THREE from "three";
import { moodboardTex } from "../textures";
import {
  accent, accentSoft, C, decor, desk, floorLamp, framed, fx, neonMat, plant, pool, plainRug, shadowRect, shadowRound, sofa, taskChair,
  type Ctx, type P3, type ThemeFn,
} from "./common";
import { bookStack, brandCanvasTex, mix, namesBoardTex, stool, typeSpecTex } from "./d-kit";

/** The hero: a Pantone-style swatch fan, blades pivoting on a brass pin, on a low round plinth. Faces +Z. */
function swatchFan(c: Ctx, g: THREE.Object3D, pos: P3, rotY: number, h = 1.15) {
  const { B } = c;
  const s = B.sub(pos, rotY, g);
  shadowRound(c, 0.6, [0, 0, 0], s, 0.3);
  B.cyl(0.42, 0.46, 0.12, fx(c, "#F3EEE6", 0.5), [0, 0.06, 0], 24, s);
  B.cyl(0.43, 0.43, 0.02, accentSoft(c, 0.5), [0, 0.125, 0], 24, s);
  const shades = [
    mix(c.color, C.ink, 0.45), mix(c.color, C.ink, 0.22), c.color, mix(c.color, "#ffffff", 0.22),
    mix(c.color, "#ffffff", 0.45), "#F2C9A0", "#E9DCC8", "#2B2622",
  ];
  const n = shades.length;
  const pivot = B.sub([0, 0.3, 0], 0, s);
  const bw = 0.2;
  B.box(0.08, 0.2, 0.06, fx(c, C.brass, 0.3, 0.8), [0, 0.22, -0.06], 0, s);
  shades.forEach((col, i) => {
    const a = -0.72 + (i / (n - 1)) * 1.44; // fan spread, radians
    const blade = B.sub([0, 0, -0.012 * i], 0, pivot);
    blade.rotation.z = -a;
    B.box(bw, h, 0.022, fx(c, "#FBFAF7", 0.6), [0, h / 2, 0], 0, blade);
    B.box(bw - 0.02, h * 0.66, 0.026, fx(c, col, 0.55), [0, h * 0.62, 0], 0, blade);
    B.box(bw - 0.06, 0.018, 0.026, fx(c, "#9AA0A8", 0.6), [-0.01, h * 0.18, 0], 0, blade);
  });
  B.cyl(0.05, 0.05, 0.16, fx(c, C.brass, 0.3, 0.8), [0, 0.3, -0.04], 10, s).rotation.x = Math.PI / 2;
  return s;
}

/** Wooden easel with a canvas; the canvas faces +Z. */
function easel(c: Ctx, g: THREE.Object3D, pos: P3, rotY: number, tex: THREE.Texture) {
  const { B } = c;
  const e = B.sub(pos, rotY, g);
  const wood = fx(c, C.oakDark, 0.6);
  shadowRound(c, 0.42, [0, 0, -0.05], e, 0.24);
  B.box(0.04, 1.5, 0.04, wood, [-0.24, 0.73, 0], 0, e).rotation.z = -0.13;
  B.box(0.04, 1.5, 0.04, wood, [0.24, 0.73, 0], 0, e).rotation.z = 0.13;
  B.box(0.04, 1.36, 0.04, wood, [0, 0.64, -0.28], 0, e).rotation.x = -0.32;
  B.box(0.7, 0.04, 0.1, wood, [0, 0.56, 0.04], 0, e);
  const cv = B.sub([0, 0.93, 0.07], 0, e);
  cv.rotation.x = -0.09;
  B.box(0.74, 0.62, 0.035, fx(c, "#FBFAF7", 0.8), [0, 0, 0], 0, cv);
  B.plane(0.68, 0.56, c.R.m("fixed", c.room, c.color, { map: tex, rough: 0.9, key: "art" }), [0, 0, 0.019], cv);
  // a palette resting on the ledge, with dabs
  const pal = B.sub([0.18, 0.585, 0.09], 0, e);
  B.box(0.22, 0.015, 0.14, fx(c, C.oak, 0.5), [0, 0, 0], 0, pal).rotation.y = 0.3;
  for (const [x, z, col] of [[-0.05, 0.02, c.color], [0.02, -0.03, "#F2C9A0"], [0.06, 0.03, "#2B2622"]] as const)
    B.box(0.03, 0.012, 0.03, fx(c, col, 0.5), [x, 0.012, z], 0, pal);
  return e;
}

/** Paint pot (open can) with a coloured drip; origin on the surface it stands on. */
function paintPot(c: Ctx, g: THREE.Object3D, pos: P3, col: string, r = 0.07) {
  const { B } = c;
  const p = B.sub(pos, 0, g);
  B.cyl(r, r, r * 1.5, fx(c, "#C9CDD3", 0.35, 0.5), [0, r * 0.75, 0], 12, p);
  B.cyl(r * 0.9, r * 0.9, 0.012, fx(c, col, 0.4), [0, r * 1.5, 0], 12, p);
  B.box(0.02, r * 0.7, 0.008, fx(c, col, 0.4), [r * 0.4, r * 1.15, r * 0.95], 0, p);
  B.box(0.02, 0.012, r * 1.4, fx(c, C.metal, 0.4, 0.3), [0, r * 1.62, 0], 0, p).rotation.x = 0.0;
  return p;
}

export const nova: ThemeFn = (ctx) => {
  const { c, group: g } = ctx;
  const { B } = c;

  // ── workstation (fixed) + the feature wall: type specimen beside the desk, the moodboard in front of it
  desk(c, g, [ctx.desk.x, 0, ctx.desk.z], ctx.desk.rotY, 0);
  taskChair(c, g, [-1.56, 0, 0.2], -Math.PI / 2);
  framed(c, g, [-2.9, 0.72, -1.55], Math.PI / 2, typeSpecTex(c.color), 0.62, 0.78, "#2B2622");
  framed(c, g, [-2.9, 0.82, 1.7], Math.PI / 2, moodboardTex(c.color), 1.05, 0.6, "#C8B39A");
  // swatch books stacked under the type poster
  bookStack(c, g, [-2.6, 0, -1.55], [mix(c.color, C.ink, 0.3), "#F2C9A0", c.color, "#E9E3D8"], 0.4);

  // ── name ideas on the corridor glass (left of the door): whiteboard with sticky notes, one circled
  const nb = B.sub([-1.85, 0, -2.38], 0, g);
  shadowRect(c, 1.4, 0.4, [0, 0, 0.05], nb, 0.2);
  for (const sx of [-1, 1]) B.box(0.035, 1.02, 0.035, fx(c, C.metal, 0.4, 0.3), [sx * 0.6, 0.51, 0.02], 0, nb);
  B.box(1.24, 0.74, 0.03, fx(c, "#F4F3F0", 0.5), [0, 0.62, 0.04], 0, nb);
  B.plane(1.16, 0.66, c.R.m("fixed", c.room, c.color, { map: namesBoardTex(c.color), rough: 0.6, key: "art" }), [0, 0.62, 0.057], nb);
  B.box(1.1, 0.025, 0.06, fx(c, "#E2E0DA", 0.5), [0, 0.25, 0.08], 0, nb);
  for (const [x, col] of [[-0.3, c.color], [-0.2, C.ink], [0.35, "#22A06B"]] as const) B.box(0.09, 0.018, 0.018, fx(c, col, 0.5), [x, 0.272, 0.08], 0, nb);

  // ── hero: the giant swatch fan, fanned towards the camera (mid-right, by the open side)
  swatchFan(c, g, [2.3, 0, 0.35], 0.55);

  // ── easel with the new mark + a stool of paint pots and a brush jar
  easel(c, g, [0.95, 0, 1.55], 0.5, brandCanvasTex(c.color));
  const st = stool(c, g, [1.75, 0, 1.95], 0.44, accent(c, 0.4));
  paintPot(c, st, [-0.06, 0.465, 0.05], c.color);
  paintPot(c, st, [0.08, 0.465, -0.05], "#F2C9A0", 0.06);
  const jar = B.sub([0.06, 0.465, 0.1], 0, st);
  B.cyl(0.04, 0.035, 0.1, c.R.m("glass", c.room, c.color, { color: "#D8ECF5", opacity: 0.5, key: "jar" }), [0, 0.05, 0], 10, jar);
  for (const [a, col] of [[-0.2, C.oakDark], [0.1, c.color], [0.3, C.oak]] as const) {
    const b = B.box(0.012, 0.22, 0.012, fx(c, col, 0.5), [Math.sin(a) * 0.05, 0.13, 0], 0, jar);
    b.rotation.z = a;
  }
  // a dropcloth with paint dots under the easel
  B.box(1.1, 0.01, 0.8, fx(c, "#F4EEE3", 0.95), [1.2, 0.018, 1.75], 0.004, g).rotation.y = 0.5;
  for (const [x, z, col, r] of [[1.0, 1.6, c.color, 0.06], [1.35, 1.9, "#F2C9A0", 0.05], [1.5, 1.6, c.color, 0.04], [0.9, 1.95, "#2B2622", 0.03]] as const)
    B.cyl(r, r, 0.006, fx(c, col, 0.5), [x, 0.026, z], 12, g);
  // one pink rug ties easel, swatch fan and stool into a single studio corner
  plainRug(c, g, 3.0, 2.5, [1.55, 0, 1.15], true);
  // a freestanding moodboard angled to the camera
  easel(c, g, [0.25, 0, 2.05], 0.45, moodboardTex(c.color));

  // ── velvet loveseat lounge against the glass (right of the door), facing the room
  plainRug(c, g, 2.2, 1.6, [1.75, 0, -1.35], false, 0.92);
  sofa(c, g, [1.75, 0, -1.95], 0, 1.5);
  const ct = B.sub([1.75, 0, -1.0], 0, g);
  shadowRound(c, 0.38, [0, 0, 0], ct, 0.25);
  B.cyl(0.3, 0.3, 0.04, fx(c, "#F3EEE6", 0.4), [0, 0.32, 0], 20, ct);
  B.cyl(0.05, 0.12, 0.3, fx(c, C.brass, 0.3, 0.8), [0, 0.15, 0], 10, ct);
  // an open swatch book fanned on the table
  for (let i = 0; i < 5; i++) {
    const sw = B.box(0.05, 0.006, 0.2, i === 2 ? accent(c, 0.4) : c.R.m("accentSoft", c.room, c.color, { rough: 0.7, shade: 1.1 - i * 0.08 }), [-0.06, 0.345 + i * 0.002, 0.02], 0, ct);
    sw.rotation.y = -0.6 + i * 0.25;
  }
  B.cyl(0.035, 0.03, 0.08, fx(c, "#FBFAF6", 0.4), [0.14, 0.38, -0.06], 10, ct);
  // brand voice: a neon speech bubble ("…") on the glass above the loveseat — glows at night
  const nb2 = B.sub([1.6, 0.98, -2.4], 0, g);
  nb2.scale.setScalar(1.3);
  const neon = neonMat(c, mix(c.color, "#ffffff", 0.25));
  const ring = B.torus(0.17, 0.016, neon, [0, 0, 0], Math.PI * 2, nb2);
  ring.scale.set(1.55, 1, 1);
  const tail = B.box(0.026, 0.12, 0.026, neon, [-0.13, -0.19, 0], 0, nb2);
  tail.rotation.z = -0.6;
  for (const x of [-0.1, 0, 0.1]) B.sphere(0.028, neon, [x, 0, 0], 8, nb2);
  B.box(0.04, 0.04, 0.03, fx(c, C.metal, 0.4, 0.3), [0, -0.2, -0.03], 0, nb2);
  floorLamp(c, g, [2.58, 0, -2.12]);
  plant(c, g, [0.95, 0, -2.18], "small");

  plant(c, g, [-2.55, 0, 2.15], "bush", C.terracotta);
  pool(c, 0.6, [2.3, 0, 0.8], g, 0.25);
  return decor(ctx);
};
