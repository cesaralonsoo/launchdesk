// WS-OFFICE · rooms/tech.ts — Tech analyst ("can we build it?").
// Concept: a cosy dev lab. Hero = two server racks with blinking LEDs and a glowing top strip, cabled to a big wall
// screen with the system diagram + a terminal; a maker bench under a neon "</>" with a 3D printer (its head runs)
// and a tiny robot buddy; a beanbag corner with a rubber duck, and a robot vacuum doing its rounds.
import * as THREE from "three";
import { accent, accentSoft, C, decor, fx, ledMat, mergeStatic, neonMat, plant, researchDesk, rug, screenMat, shadowRect, shadowRound, wallBoard, type Ctx, type P3, type ThemeCtx, type ThemeFn } from "./common";
import { cTex, disc, fillRR, FONT } from "./c-kit";

const GRAPHITE = "#2B3038", GRAPHITE_L = "#3A404A";

// ─────────────────────────────────────────────── textures

/** The wall screen: an architecture diagram (left) and a terminal (right). */
function archTex(color: string) {
  return cTex(`tech:arch:${color}`, 1024, 512, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#14203A");
    bg.addColorStop(1, "#0C1424");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    // window chrome
    g.fillStyle = "rgba(255,255,255,0.06)";
    g.fillRect(0, 0, w, 34);
    for (const [i, col] of ["#FF6B6B", "#F2C04A", "#3DDC97"].entries()) disc(g, col, 22 + i * 22, 17, 7);
    // grid dots
    g.fillStyle = "rgba(255,255,255,0.06)";
    for (let y = 60; y < h; y += 28) for (let x = 20; x < 610; x += 28) g.fillRect(x, y, 3, 3);
    // nodes
    const node = (x: number, y: number, label: string, col: string, wd = 150) => {
      fillRR(g, "rgba(0,0,0,0.35)", x + 5, y + 7, wd, 66, 12);
      fillRR(g, "#1E2C4A", x, y, wd, 66, 12);
      g.lineWidth = 4;
      g.strokeStyle = col;
      g.beginPath();
      g.roundRect(x, y, wd, 66, 12);
      g.stroke();
      fillRR(g, col, x + 14, y + 22, 22, 22, 6);
      g.font = FONT(26, 800);
      g.fillStyle = "#EAF0FA";
      g.textBaseline = "middle";
      g.fillText(label, x + 48, y + 34);
    };
    const link = (pts: [number, number][], col: string) => {
      g.strokeStyle = col;
      g.lineWidth = 5;
      g.setLineDash([14, 8]);
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
      g.setLineDash([]);
      const [x, y] = pts[pts.length - 1]!;
      disc(g, col, x, y, 7);
    };
    link([[180, 133], [250, 133]], "#7FB2FF");
    link([[400, 133], [470, 133], [470, 230]], color);
    link([[325, 166], [325, 300]], color);
    link([[400, 335], [470, 335], [470, 300]], "#3DDC97");
    link([[180, 335], [250, 335]], "#7FB2FF");
    node(30, 100, "WEB", "#7FB2FF");
    node(250, 100, "API", color);
    node(470, 230, "AI", "#F2C04A", 120);
    node(250, 300, "DB", "#3DDC97");
    node(30, 300, "APP", "#7FB2FF");
    g.font = FONT(18, 700);
    g.fillStyle = "rgba(234,240,250,0.55)";
    g.fillText("system.map", 30, 470);
    // terminal pane
    fillRR(g, "#0A101C", 640, 56, 364, 436, 14);
    g.font = FONT(20, 700);
    const lines: [string, string][] = [
      ["$ npm run build", "#EAF0FA"],
      ["  bundling 214 modules", "rgba(234,240,250,0.5)"],
      ["  ✓ compiled in 1.2s", "#3DDC97"],
      ["$ npm test", "#EAF0FA"],
      ["  ✓ 48 passing", "#3DDC97"],
      ["$ deploy --prod", "#EAF0FA"],
      ["  ▸ uploading", color],
      ["  ✓ live", "#3DDC97"],
      ["$ _", "#EAF0FA"],
    ];
    lines.forEach(([t, col], i) => {
      g.fillStyle = col;
      g.fillText(t, 662, 92 + i * 44);
    });
  });
}

// ─────────────────────────────────────────────── pieces

/** A graphite server rack with a smoked glass door, rows of servers, LEDs and a glowing top strip. Faces +Z. */
function serverRack(c: Ctx, parent: THREE.Object3D, pos: P3, h = 1.3, seed = 1) {
  const { B } = c;
  const g = B.sub(pos, 0, parent);
  shadowRect(c, 0.85, 0.9, [0, 0, 0], g, 0.38);
  const body = fx(c, GRAPHITE, 0.45, 0.25);
  B.box(0.6, h, 0.6, body, [0, h / 2 + 0.04, 0], 0.03, g);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) B.cyl(0.025, 0.025, 0.04, fx(c, C.metal, 0.4, 0.3), [x * 0.24, 0.02, z * 0.24], 8, g);
  // servers behind the door
  const u = fx(c, GRAPHITE_L, 0.4, 0.3), grill = fx(c, "#20242B", 0.6, 0.2);
  const n = Math.floor((h - 0.18) / 0.13);
  let s = seed * 7919;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const leds = [ledMat(c, "#3DDC97"), ledMat(c, "#7FB2FF"), ledMat(c, "#F2C04A"), ledMat(c, c.color)];
  for (let i = 0; i < n; i++) {
    const y = 0.14 + i * 0.13;
    B.box(0.5, 0.105, 0.02, u, [0, y, 0.301], 0.006, g);
    B.box(0.22, 0.05, 0.004, grill, [0.08, y, 0.312], 0, g, false);
    for (let k = 0; k < 3; k++) B.box(0.022, 0.022, 0.006, leds[Math.floor(rnd() * 4)]!, [-0.2 + k * 0.04, y + 0.015, 0.313], 0, g, false);
    B.box(0.06, 0.012, 0.006, leds[i % 2 ? 0 : 3]!, [-0.16, y - 0.025, 0.313], 0, g, false);
  }
  // door frame + handle, a glowing strip on top and a vent
  for (const sx of [-1, 1]) B.box(0.03, h - 0.04, 0.02, body, [sx * 0.285, h / 2 + 0.04, 0.31], 0, g);
  B.box(0.022, 0.24, 0.03, fx(c, C.steel, 0.3, 0.7), [0.25, h / 2 + 0.04, 0.33], 0.008, g);
  B.box(0.5, 0.025, 0.02, neonMat(c, c.color), [0, h + 0.005, 0.3], 0.008, g);
  B.box(0.4, 0.012, 0.4, fx(c, "#20242B", 0.6), [0, h + 0.045, 0], 0, g, false);
  return g;
}

/** A neon "</>" on a dark plate (lit at night). Faces +Z. */
function neonCode(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  B.box(0.86, 0.42, 0.025, fx(c, GRAPHITE, 0.5), [0, 0, 0], 0.03, g);
  const m = neonMat(c, c.color);
  const bar = (x: number, y: number, len: number, rot: number) => {
    const b = B.box(len, 0.04, 0.03, m, [x, y, 0.03], 0.018, g);
    b.rotation.z = rot;
  };
  const a = 0.62, L = 0.17;
  bar(-0.26, 0.055, L, a);
  bar(-0.26, -0.055, L, -a);
  bar(0.26, 0.055, L, -a);
  bar(0.26, -0.055, L, a);
  bar(0, 0, 0.3, 1.2);
  for (const [x, y] of [[-0.38, 0.17], [0.38, 0.17], [-0.38, -0.17], [0.38, -0.17]] as const) B.cyl(0.012, 0.012, 0.03, fx(c, C.steel, 0.3, 0.7), [x, y, 0.02], 8, g).rotation.x = Math.PI / 2;
  return g;
}

/** Maker bench with a 3D printer (animated head), a robot buddy, a parts drawer and a mat. Faces +Z. */
function makerBench(ctx: ThemeCtx, pos: P3, rotY: number) {
  const { c, group } = ctx;
  const { B } = c;
  const g = B.sub(pos, rotY, group);
  const W = 1.5, D = 0.6, top = 0.74;
  shadowRect(c, W + 0.3, D + 0.35, [0, 0, 0], g, 0.32);
  B.box(W, 0.05, D, fx(c, C.oak, 0.5), [0, top - 0.025, 0], 0.015, g);
  for (const sx of [-1, 1]) {
    B.box(0.05, top - 0.05, 0.05, fx(c, GRAPHITE, 0.4, 0.3), [sx * (W / 2 - 0.06), (top - 0.05) / 2, -D / 2 + 0.06], 0, g);
    B.box(0.05, top - 0.05, 0.05, fx(c, GRAPHITE, 0.4, 0.3), [sx * (W / 2 - 0.06), (top - 0.05) / 2, D / 2 - 0.06], 0, g);
  }
  B.box(W - 0.1, 0.03, D - 0.1, fx(c, C.oak, 0.6), [0, 0.18, 0], 0.01, g);
  B.box(W - 0.06, 0.014, 0.014, neonMat(c, c.color), [0, top - 0.06, D / 2 - 0.01], 0, g, false); // underglow
  // under-shelf: parts bins
  for (let k = 0; k < 4; k++) B.box(0.26, 0.14, 0.3, k % 2 ? accentSoft(c) : fx(c, "#F2C04A", 0.6), [-0.5 + k * 0.32, 0.265, 0.05], 0.015, g);
  // cutting mat
  B.box(0.5, 0.006, 0.36, fx(c, "#3E7D63", 0.8), [0.38, top + 0.003, 0.04], 0, g, false);
  // 3D printer: frame, bed, a half-printed rocket, the moving head on a gantry
  const P = B.sub([-0.4, top, -0.02], 0, g);
  const frame = fx(c, GRAPHITE, 0.4, 0.3);
  B.box(0.46, 0.05, 0.42, frame, [0, 0.025, 0], 0.012, P);
  for (const sx of [-1, 1]) B.box(0.04, 0.5, 0.04, frame, [sx * 0.2, 0.3, -0.12], 0.008, P);
  B.box(0.44, 0.04, 0.04, frame, [0, 0.55, -0.12], 0.008, P);
  B.box(0.34, 0.012, 0.3, fx(c, "#C9CDD3", 0.4, 0.4), [0, 0.07, 0.02], 0, P);
  B.cyl(0.035, 0.045, 0.06, accent(c, 0.4), [0, 0.106, 0.02], 12, P);
  B.cyl(0.026, 0.035, 0.045, accent(c, 0.4), [0, 0.158, 0.02], 12, P);
  B.box(0.1, 0.07, 0.04, fx(c, "#20242B", 0.5), [0.17, 0.11, 0.21], 0.01, P);
  B.box(0.07, 0.04, 0.004, screenMat(c, archTex(c.color)), [0.17, 0.115, 0.232], 0, P, false);
  const headSrc = new THREE.Group();
  B.box(0.38, 0.03, 0.03, fx(c, C.steel, 0.3, 0.7), [0, 0, 0], 0, headSrc);
  B.box(0.09, 0.08, 0.08, accent(c, 0.4), [0, -0.02, 0.03], 0.015, headSrc);
  B.cyl(0.008, 0.004, 0.04, fx(c, C.brass, 0.3, 0.8), [0, -0.08, 0.03], 6, headSrc);
  const head = ctx.animate(mergeStatic(headSrc, c.R));
  head.position.set(0, 0.29, 0.0);
  P.add(head);
  // robot buddy: rounded body, screen face with two LED eyes, an antenna
  const R = B.sub([0.32, top, 0.06], -0.35, g);
  shadowRound(c, 0.1, [0, 0, 0], R, 0.3);
  B.box(0.15, 0.12, 0.12, fx(c, "#F1F0EC", 0.4), [0, 0.075, 0], 0.04, R);
  B.box(0.18, 0.14, 0.14, fx(c, "#F1F0EC", 0.4), [0, 0.22, 0], 0.05, R);
  B.box(0.14, 0.08, 0.01, fx(c, "#1C222C", 0.3), [0, 0.22, 0.07], 0.02, R);
  for (const sx of [-1, 1]) B.box(0.026, 0.03, 0.006, ledMat(c, "#7FE8FF"), [sx * 0.035, 0.225, 0.077], 0, R, false);
  B.cyl(0.006, 0.006, 0.07, fx(c, C.metal, 0.4, 0.3), [0, 0.32, 0], 6, R);
  B.sphere(0.02, neonMat(c, c.color), [0, 0.36, 0], 10, R);
  for (const sx of [-1, 1]) B.box(0.03, 0.08, 0.04, accent(c, 0.4), [sx * 0.11, 0.2, 0], 0.012, R);
  // a soldering iron stand + spool
  B.cyl(0.04, 0.05, 0.03, fx(c, GRAPHITE, 0.4), [0.62, top + 0.015, -0.18], 12, g);
  B.cyl(0.035, 0.035, 0.04, fx(c, "#C7C9CC", 0.3, 0.8), [0.5, top + 0.02, -0.2], 12, g);
  return (t: number) => {
    head.position.x = Math.sin(t * 1.7) * 0.12;
    head.position.z = Math.sin(t * 2.9) * 0.06;
  };
}

/** Robot vacuum (animated: a slow loop around the beanbag rug). */
function robotVacuum(ctx: ThemeCtx) {
  const { c } = ctx;
  const { B } = c;
  const src = new THREE.Group();
  B.cyl(0.17, 0.17, 0.06, fx(c, "#F1F0EC", 0.35), [0, 0.035, 0], 24, src);
  B.cyl(0.07, 0.07, 0.012, fx(c, GRAPHITE, 0.4), [0, 0.07, -0.02], 16, src);
  B.box(0.18, 0.016, 0.03, accent(c, 0.4), [0, 0.064, 0.12], 0.006, src);
  B.box(0.024, 0.012, 0.024, ledMat(c, "#3DDC97"), [0.05, 0.072, 0.05], 0, src, false);
  const v = ctx.animate(mergeStatic(src, c.R));
  ctx.group.add(v);
  const cx = 1.25, cz = 0.75, rx = 1.15, rz = 0.85;
  const at = (t: number) => {
    const a = t * 0.32;
    v.position.set(cx + Math.cos(a) * rx, 0, cz + Math.sin(a) * rz);
    // tangent direction → heading (+Z forward)
    v.rotation.y = Math.atan2(-Math.sin(a) * rx, Math.cos(a) * rz);
  };
  at(10);
  return at;
}

// ─────────────────────────────────────────────── the room

export const tech: ThemeFn = (ctx) => {
  const { c, group: g } = ctx;
  const { B } = c;
  researchDesk(ctx, { screen: 3, dual: true });
  if (ctx.compact) {
    wallBoard(ctx, "code");
    serverRack(c, g, [ctx.desk.x + (ctx.side === "a" ? 1.15 : 1.2), 0, -2.05], 0.85, 3);
    return decor(ctx);
  }

  // back wall: the big system screen, cabled to the racks
  const sc = B.sub([0.42, 0.74, -2.35], 0, g);
  B.box(1.72, 0.92, 0.05, fx(c, "#1A1E25", 0.35), [0, 0, 0], 0.02, sc);
  B.plane(1.64, 0.82, screenMat(c, archTex(c.color)), [0, 0, 0.026], sc);
  B.box(0.3, 0.025, 0.02, fx(c, "#1A1E25", 0.35), [0, -0.47, 0.01], 0.008, sc);
  // hero: two racks, a cable tray between them and the screen, cables on the floor
  serverRack(c, g, [1.75, 0, -2.0], 1.25, 1);
  serverRack(c, g, [2.42, 0, -2.0], 1.25, 2);
  B.box(2.0, 0.04, 0.12, fx(c, GRAPHITE, 0.5, 0.3), [1.6, 1.36, -2.24], 0.01, g);
  // bias light: a neon halo behind the screen (glows at night)
  B.box(1.84, 1.02, 0.01, neonMat(c, c.color), [0.42, 0.74, -2.362], 0, g, false);
  rug(c, g, "round", 2.3, 2.3, [1.25, 0, 0.75]);

  // beanbag corner: beanbag + laptop, side table with a rubber duck, mug and a can
  const bb = B.sub([1.05, 0, 0.75], -0.75, g);
  shadowRound(c, 0.6, [0, 0, 0], bb, 0.3);
  B.box(0.92, 0.3, 0.86, accent(c, 0.95), [0, 0.15, 0], 0.14, bb);
  B.box(0.8, 0.5, 0.3, accent(c, 0.95), [0, 0.38, -0.3], 0.14, bb).rotation.x = -0.18;
  B.box(0.28, 0.2, 0.62, accent(c, 0.95), [-0.36, 0.36, 0.02], 0.1, bb);
  B.box(0.28, 0.2, 0.62, accent(c, 0.95), [0.36, 0.36, 0.02], 0.1, bb);
  const lp = B.sub([0.0, 0.31, 0.12], 0, bb);
  lp.rotation.x = -0.15;
  B.box(0.32, 0.016, 0.22, fx(c, "#C9CDD3", 0.35, 0.4), [0, 0, 0], 0.006, lp);
  const lid = B.sub([0, 0.01, -0.1], 0, lp);
  lid.rotation.x = -0.35;
  B.box(0.32, 0.2, 0.012, fx(c, "#C9CDD3", 0.35, 0.4), [0, 0.1, 0], 0.006, lid);
  B.box(0.11, 0.11, 0.004, fx(c, "#F2C04A", 0.6), [0, 0.1, -0.009], 0.002, lid, false); // a sticker on the back
  const st = B.sub([1.78, 0, 1.0], 0, g);
  shadowRound(c, 0.24, [0, 0, 0], st, 0.3);
  B.cyl(0.22, 0.22, 0.04, fx(c, C.lacquer, 0.4), [0, 0.42, 0], 22, st);
  B.cyl(0.03, 0.04, 0.4, fx(c, GRAPHITE, 0.4, 0.3), [0, 0.2, 0], 10, st);
  B.cyl(0.14, 0.16, 0.02, fx(c, GRAPHITE, 0.4, 0.3), [0, 0.01, 0], 16, st);
  const duck = fx(c, "#F7CF3C", 0.4);
  B.sphere(0.07, duck, [0.05, 0.5, 0.02], 16, st).scale.set(1.2, 0.85, 1);
  B.sphere(0.045, duck, [0.1, 0.57, 0.02], 14, st);
  B.box(0.04, 0.015, 0.03, fx(c, "#F08A2C", 0.5), [0.15, 0.565, 0.02], 0.006, st);
  B.cyl(0.03, 0.03, 0.09, fx(c, "#E5484D", 0.4, 0.3), [-0.1, 0.485, -0.06], 12, st);
  B.cyl(0.04, 0.036, 0.08, fx(c, "#FFFFFF", 0.4), [-0.08, 0.48, 0.09], 14, st);

  // left wall: neon </> over the maker bench
  neonCode(c, g, [-2.9, 0.98, 0.65], Math.PI / 2);
  const printing = makerBench(ctx, [-2.6, 0, 0.65], Math.PI / 2);
  // small things: a whiteboard-on-wheels? no — a tower of cardboard boxes (shipping hardware)
  const bx = B.sub([-2.58, 0, -1.15], 0.15, g);
  shadowRect(c, 0.55, 0.5, [0, 0, 0], bx, 0.3);
  B.box(0.42, 0.3, 0.36, fx(c, "#D9B98C", 0.85), [0, 0.15, 0], 0.012, bx);
  B.box(0.34, 0.24, 0.3, fx(c, "#CFAE80", 0.85), [0.02, 0.42, 0.01], 0.012, bx).rotation.y = 0.2;
  B.box(0.43, 0.04, 0.012, accent(c, 0.4), [0, 0.2, 0.181], 0, bx, false);
  plant(c, g, [-2.6, 0, 2.05], "small");
  plant(c, g, [2.6, 0, 1.95], "bush");

  // the big red DEPLOY button on a pedestal (hazard ring, glowing at night)
  const db = B.sub([2.2, 0, 0.1], -0.5, g);
  shadowRound(c, 0.24, [0, 0, 0], db, 0.32);
  B.cyl(0.17, 0.19, 0.05, fx(c, GRAPHITE, 0.4, 0.3), [0, 0.025, 0], 16, db);
  B.cyl(0.11, 0.13, 0.62, fx(c, C.lacquer, 0.4), [0, 0.36, 0], 16, db);
  B.cyl(0.17, 0.15, 0.06, fx(c, "#F2C04A", 0.5), [0, 0.7, 0], 20, db);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    B.box(0.05, 0.062, 0.03, fx(c, "#20242B", 0.5), [Math.cos(a) * 0.155, 0.7, Math.sin(a) * 0.155], 0, db).rotation.y = -a;
  }
  B.cyl(0.1, 0.11, 0.03, fx(c, "#20242B", 0.5), [0, 0.745, 0], 18, db);
  B.sphere(0.085, neonMat(c, "#E5484D"), [0, 0.76, 0], 18, db).scale.set(1, 0.55, 1);

  const vac = robotVacuum(ctx);
  return decor(ctx, {
    update(_dt, t) {
      printing(t);
      vac(t);
    },
  });
};
