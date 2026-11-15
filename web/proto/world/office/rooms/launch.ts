// WS-OFFICE · rooms/launch.ts — the launch room, shared by Rae (launch posts / marketing, desk 0, colour c.color)
// and Pip (publishes the live site, desk 1, colour c.color2). (designer D)
// Concept: "mission control for the launch". Rae's half (left) is a content studio: a seamless paper backdrop with
// the product on a pedestal, a ring light with the phone filming it, a softbox, "like" balloons bobbing over the set,
// the content calendar and a megaphone on the feature wall, and a cute rocket on its pad in the front corner.
// Pip's half (right) is the go-live corner: the server cabinets, a big screen with the live site under a red LIVE
// lamp, cables to Pip's desk and the big green go-live button on a hazard-striped pedestal.
import * as THREE from "three";
import { calendarTex } from "../textures";
import {
  accent, C, decor, desk, framed, fx, glowMat, lampMat, laptopDesk, ledMat, mergeStatic, neonMat, plant, pool, rack, rug,
  screenMat, shadowRect, shadowRound, taskChair, type Ctx, type P3, type ThemeFn,
} from "./common";
import { hazardTex, liveSignTex, liveSiteTex, mix, phoneTex, productTex } from "./d-kit";

/** Cute rocket on a launch pad with cloud puffs; ~1 m. */
function rocket(c: Ctx, g: THREE.Object3D, pos: P3, rotY: number, s = 1) {
  const { B } = c;
  const r = B.sub(pos, rotY, g);
  r.scale.setScalar(s);
  shadowRound(c, 0.5, [0, 0, 0], r, 0.3);
  B.cyl(0.36, 0.4, 0.08, fx(c, "#8A8F98", 0.5, 0.3), [0, 0.04, 0], 8, r);
  B.cyl(0.3, 0.3, 0.012, fx(c, "#F5C542", 0.5), [0, 0.086, 0], 8, r);
  const white = fx(c, "#F6F4EF", 0.45);
  B.cyl(0.15, 0.13, 0.5, white, [0, 0.42, 0], 8, r);
  B.cyl(0.13, 0.15, 0.12, white, [0, 0.11 + 0.62 + 0.06, 0], 8, r);
  B.cyl(0.0, 0.13, 0.26, accent(c, 0.4), [0, 0.98, 0], 8, r);
  B.cyl(0.155, 0.155, 0.05, accent(c, 0.4), [0, 0.55, 0], 8, r);
  // porthole (faces +Z)
  B.cyl(0.07, 0.07, 0.03, fx(c, "#C9CDD3", 0.3, 0.6), [0, 0.7, 0.14], 10, r).rotation.x = Math.PI / 2;
  B.cyl(0.05, 0.05, 0.034, c.R.m("glow", c.room, c.color, { color: "#9ED3FF", key: "porthole" }), [0, 0.7, 0.142], 10, r).rotation.x = Math.PI / 2;
  // three fins + nozzle
  for (let i = 0; i < 3; i++) {
    const f = B.sub([0, 0, 0], (i / 3) * Math.PI * 2 + Math.PI / 3, r);
    B.box(0.035, 0.26, 0.16, accent(c, 0.4), [0, 0.26, 0.17], 0, f).rotation.x = -0.2;
  }
  B.cyl(0.08, 0.11, 0.08, fx(c, "#5B6270", 0.4, 0.4), [0, 0.13, 0], 8, r);
  // cloud puffs
  const puff = fx(c, "#FFFFFF", 0.9);
  for (const [x, z, k] of [[-0.24, 0.12, 0.13], [0.22, 0.16, 0.11], [0.02, 0.26, 0.1], [-0.12, -0.2, 0.09], [0.26, -0.12, 0.08]] as const)
    B.sphere(k, puff, [x, 0.1 + k * 0.5, z], 8, r);
  return r;
}

/** Ring light on a tripod with the phone in the middle; the phone screen faces +Z (back towards the room). */
function ringLight(c: Ctx, g: THREE.Object3D, pos: P3, rotY: number) {
  const { B } = c;
  const t = B.sub(pos, rotY, g);
  const pole = fx(c, "#3A3F47", 0.4, 0.4);
  shadowRound(c, 0.35, [0, 0, 0], t, 0.24);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = B.box(0.025, 0.75, 0.025, pole, [Math.sin(a) * 0.16, 0.34, Math.cos(a) * 0.16], 0, t);
    leg.rotation.set(Math.cos(a) * 0.42, 0, -Math.sin(a) * 0.42);
  }
  B.cyl(0.014, 0.014, 0.75, pole, [0, 0.98, 0], 6, t);
  B.torus(0.24, 0.04, lampMat(c), [0, 1.36, 0], Math.PI * 2, t);
  B.box(0.02, 0.24, 0.02, pole, [0, 1.24, 0], 0, t);
  const ph = B.sub([0, 1.36, 0.0], 0, t);
  B.box(0.11, 0.2, 0.02, fx(c, C.ink, 0.35), [0, 0, 0], 0, ph);
  B.plane(0.09, 0.17, screenMat(c, phoneTex(c.color)), [0, 0, 0.011], ph);
  return t;
}

/** Softbox on a stand; the diffuser faces +Z. */
function softbox(c: Ctx, g: THREE.Object3D, pos: P3, rotY: number) {
  const { B } = c;
  const t = B.sub(pos, rotY, g);
  const pole = fx(c, "#3A3F47", 0.4, 0.4);
  shadowRound(c, 0.3, [0, 0, 0], t, 0.22);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = B.box(0.022, 0.6, 0.022, pole, [Math.sin(a) * 0.13, 0.27, Math.cos(a) * 0.13], 0, t);
    leg.rotation.set(Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45);
  }
  B.cyl(0.013, 0.013, 0.66, pole, [0, 0.84, 0], 6, t);
  const head = B.sub([0, 1.18, 0], 0, t);
  head.scale.setScalar(0.8);
  head.rotation.x = 0.15;
  const box = B.cyl(0.08, 0.3, 0.26, fx(c, C.ink, 0.5), [0, 0, -0.05], 4, head);
  box.rotation.set(Math.PI / 2, Math.PI / 4, 0);
  box.rotation.order = "YXZ";
  B.box(0.4, 0.4, 0.012, lampMat(c), [0, 0, 0.085], 0, head);
  return t;
}

/** Megaphone hanging on a wall hook (built facing +Z, mouth pointing +X of its frame). */
function megaphone(c: Ctx, g: THREE.Object3D, pos: P3, rotY: number) {
  const { B } = c;
  const m = B.sub(pos, rotY, g);
  const cone = B.cyl(0.13, 0.05, 0.3, accent(c, 0.4), [0.05, 0, 0.0], 10, m);
  cone.rotation.z = -Math.PI / 2;
  B.cyl(0.135, 0.135, 0.02, fx(c, "#F6F4EF", 0.4), [0.2, 0, 0], 10, m).rotation.z = -Math.PI / 2;
  B.cyl(0.045, 0.045, 0.12, fx(c, "#F6F4EF", 0.45), [-0.15, 0, 0], 8, m).rotation.z = -Math.PI / 2;
  B.box(0.04, 0.12, 0.04, fx(c, C.ink, 0.5), [-0.1, -0.08, 0], 0, m);
  B.box(0.03, 0.03, 0.08, fx(c, C.metal, 0.4, 0.3), [-0.05, 0.08, -0.06], 0, m);
  return m;
}

export const launch: ThemeFn = (ctx) => {
  const { c, group: g } = ctx;
  const { B } = c;
  const pip: Ctx = { ...c, color: c.color2 ?? c.color };

  // ════════════════ Rae's half (left): the content studio
  desk(c, g, [ctx.desk.x, 0, ctx.desk.z], ctx.desk.rotY, 2);
  taskChair(c, g, [-1.56, 0, 0.2], -Math.PI / 2);
  framed(c, g, [-2.9, 0.74, 1.72], Math.PI / 2, calendarTex(c.color), 0.96, 0.68, C.ink);
  megaphone(c, g, [-2.78, 0.82, -1.35], Math.PI / 2 + 0.35).scale.setScalar(1.35);

  // seamless backdrop: two poles, a roll in the room colour, paper sweeping onto the floor
  const bd = B.sub([-1.9, 0, -2.25], 0, g);
  const pole = fx(c, "#3A3F47", 0.4, 0.4);
  shadowRect(c, 1.9, 1.3, [0, 0, 0.55], bd, 0.2);
  for (const sx of [-1, 1]) {
    B.box(0.035, 1.62, 0.035, pole, [sx * 0.8, 0.81, 0], 0, bd);
    B.box(0.3, 0.025, 0.04, pole, [sx * 0.8, 0.015, 0], 0, bd);
  }
  B.cyl(0.06, 0.06, 1.62, accent(c, 0.4), [0, 1.52, 0.02], 10, bd).rotation.z = Math.PI / 2;
  const paper = c.R.m("accentWall", c.room, c.color, { rough: 0.9, key: "sweep", shade: 1.04 });
  B.box(1.5, 1.32, 0.012, paper, [0, 0.86, 0.04], 0, bd);
  const curve = B.box(1.5, 0.012, 0.32, paper, [0, 0.11, 0.15], 0, bd);
  curve.rotation.x = 0.85;
  B.box(1.5, 0.012, 0.75, paper, [0, 0.008, 0.66], 0, bd).receiveShadow = true;
  // the product on a white cube, with a sprig
  const pd = B.sub([-0.1, 0, 0.55], 0.4, bd);
  B.box(0.32, 0.3, 0.32, fx(c, "#FBFAF7", 0.5), [0, 0.15, 0], 0, pd);
  const pm = c.R.m("fixed", c.room, c.color, { map: productTex(c.color), rough: 0.6, key: "prod" });
  B.box(0.14, 0.2, 0.1, pm, [0, 0.4, 0], 0, pd);
  B.box(0.06, 0.08, 0.06, fx(c, "#FBFAF7", 0.4), [0.12, 0.34, 0.06], 0, pd);
  for (const [x, col] of [[0.3, "#F5C542"], [0.45, c.color]] as const) B.box(0.1, 0.1, 0.1, fx(c, col, 0.5), [x, 0.05, 0.1], 0, pd).rotation.y = 0.5;
  // lights + camera on the set
  ringLight(c, g, [-1.75, 0, -0.95], Math.PI);
  softbox(c, g, [-2.6, 0, -1.0], Math.PI - 0.6);
  pool(c, 1.0, [-1.9, 0, -1.6], g, 0.55);

  // "like" balloons over the set (animated bob), tied to the right pole
  const bsrc = new THREE.Group();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [x, y, z, col] of [[-0.12, 0.42, 0.12, "#E5484D"], [0.16, 0.3, 0.22, c.color], [-0.24, 0.22, 0.3, "#F5C542"]] as const) {
    const bm = fx(c, col, 0.35);
    B.sphere(0.13, bm, [x, y, z], 10, bsrc).scale.set(1, 1.18, 1);
    B.cyl(0.0, 0.025, 0.04, bm, [x, y - 0.16, z], 6, bsrc);
    const end = new THREE.Vector3(x, y - 0.17, z);
    const str = B.box(0.006, end.length(), 0.006, fx(c, "#9AA0A8", 0.6), [x / 2, (y - 0.17) / 2, z / 2], 0, bsrc, false);
    str.quaternion.setFromUnitVectors(up, end.normalize());
  }
  const bal = ctx.animate(mergeStatic(bsrc, c.R));
  bal.position.set(-1.1, 1.6, -2.25);
  g.add(bal);

  // the hero: a big rocket on its launch pad in the open middle, a smoke ring around the base, a pool at night
  rocket(c, g, [-0.1, 0, 1.95], 0.35, 1.55);
  const smoke = fx(c, "#FFFFFF", 0.95);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3, r = 0.6 + (i % 2) * 0.05, k = 0.08 + (i % 3) * 0.025;
    B.sphere(k, smoke, [-0.1 + Math.cos(a) * r, k * 0.55, 1.95 + Math.sin(a) * r * 0.75], 8, g);
  }
  pool(c, 1.1, [-0.1, 0, 1.95], g, 0.5);
  plant(c, g, [-0.95, 0, -2.2], "small");

  // ════════════════ Pip's half (right): the go-live corner
  rack(pip, g, [1.05, 0, -2.0]);
  rack(pip, g, [1.72, 0, -2.0]);
  for (const x of [1.05, 1.72]) B.box(0.56, 0.03, 0.03, neonMat(pip, "#0AC18E"), [x, 1.48, -1.68], 0, g);
  // the big live screen on a pole stand + the LIVE lamp on top
  const ls = B.sub([2.48, 0, -1.95], -0.25, g);
  shadowRect(pip, 0.9, 0.6, [0, 0, 0], ls, 0.26);
  B.box(0.6, 0.04, 0.4, fx(pip, C.metal, 0.4, 0.3), [0, 0.02, 0], 0, ls);
  B.box(0.06, 1.0, 0.06, fx(pip, C.metal, 0.4, 0.3), [0, 0.52, -0.04], 0, ls);
  B.box(0.92, 0.6, 0.05, fx(pip, C.ink, 0.35), [0, 1.2, 0], 0, ls);
  B.plane(0.86, 0.54, screenMat(pip, liveSiteTex(c.color)), [0, 1.2, 0.027], ls).receiveShadow = false;
  B.box(0.34, 0.14, 0.08, fx(pip, C.ink, 0.4), [0, 1.6, 0], 0, ls);
  B.plane(0.32, 0.12, glowMat(pip, liveSignTex()), [0, 1.6, 0.042], ls);
  B.sphere(0.05, neonMat(pip, "#FF4D4F"), [0.22, 1.62, 0.0], 10, ls);
  B.box(0.03, 0.06, 0.03, fx(pip, C.metal, 0.4, 0.3), [0, 1.52, 0], 0, ls);
  pool(pip, 0.8, [2.2, 0, -1.3], g, 0.35);
  // cables from the racks to Pip's desk
  const cable = fx(pip, "#2F343C", 0.6);
  for (const [dx, col] of [[0, cable], [0.06, fx(pip, "#0AC18E", 0.6)], [-0.06, fx(pip, mix(pip.color, "#1E2229", 0.2), 0.6)]] as const) {
    B.box(0.025, 0.018, 2.0, col, [1.25 + dx, 0.01, -0.62], 0, g);
  }
  // Pip's desk (fixed) on a rug, with a mug and a mini rocket figurine
  rug(pip, g, "rect", 1.9, 1.5, [1.15, 0, 1.15]);
  laptopDesk(pip, g, [1.15, 0, 1.45], Math.PI, 1.1);
  B.cyl(0.04, 0.036, 0.09, accent(pip, 0.45), [0.75, 0.768, 1.55], 12, g);
  const mini = B.sub([1.58, 0.722, 1.6], 0.4, g);
  B.cyl(0.03, 0.03, 0.1, fx(pip, "#F6F4EF", 0.45), [0, 0.07, 0], 6, mini);
  B.cyl(0.0, 0.03, 0.06, accent(c, 0.4), [0, 0.15, 0], 6, mini);
  B.box(0.09, 0.04, 0.012, accent(c, 0.4), [0, 0.04, 0], 0, mini);

  // the go-live console: a squat desk in Pip's colour, big green button under an open safety cover, hazard ring
  const gb = B.sub([2.3, 0, 1.75], -0.6, g);
  shadowRound(pip, 0.6, [0, 0, 0], gb, 0.3);
  const ring = c.R.m("fixed", c.room, c.color, { map: hazardTex(), rough: 0.6, key: "hazard" });
  B.cyl(0.62, 0.62, 0.01, ring, [0, 0.005, 0], 24, gb);
  B.cyl(0.5, 0.5, 0.014, fx(pip, "#3A3F47", 0.6), [0, 0.008, 0], 24, gb);
  B.box(0.72, 0.5, 0.52, accent(pip, 0.45), [0, 0.25, 0], 0.04, gb);
  const top = B.box(0.76, 0.06, 0.56, fx(pip, "#F4F3F0", 0.4), [0, 0.53, 0.02], 0.02, gb);
  top.rotation.x = 0.18;
  B.box(0.36, 0.2, 0.01, fx(pip, C.ink, 0.4), [0, 0.3, 0.262], 0.01, gb);
  for (let i = 0; i < 4; i++) B.box(0.04, 0.04, 0.01, ledMat(pip, i % 2 ? "#F2C04A" : "#0AC18E"), [-0.12 + i * 0.08, 0.3, 0.27], 0, gb);
  B.cyl(0.17, 0.17, 0.05, fx(pip, "#C9CDD3", 0.3, 0.6), [0, 0.585, 0.02], 16, gb);
  B.sphere(0.14, ledMat(pip, "#0AC18E"), [0, 0.61, 0.02], 16, gb).scale.set(1, 0.55, 1);
  const cover = B.sub([0, 0.6, -0.17], 0, gb);
  cover.rotation.x = -1.2;
  B.box(0.36, 0.02, 0.36, c.R.m("glass", c.room, c.color, { color: "#E5F1FF", opacity: 0.45, key: "cover" }), [0, 0, 0.18], 0, cover);
  pool(pip, 0.8, [2.3, 0, 1.75], g, 0.45);
  plant(pip, g, [2.65, 0, -0.75], "bush");

  return decor(ctx, {
    update(_dt, t) {
      bal.position.y = 1.6 + Math.sin(t * 1.3) * 0.035;
      bal.rotation.y = Math.sin(t * 0.6) * 0.12;
    },
  });
};
