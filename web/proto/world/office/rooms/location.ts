// WS-OFFICE · rooms/location.ts — Location analyst ("where should it be?").
// Concept: a little street corner inside a planning studio. Hero = a city diorama table with a big bobbing pin over
// the chosen shop; behind it a wide illustrated city map with push-pins; a metro station sign over a park bench, a
// street lamp, a zebra crossing at the door and traffic cones. Lovely at night: lamp, lit sign, glowing pin ring.
import * as THREE from "three";
import { accent, accentSoft, C, decor, fx, glowMat, lampMat, mergeStatic, neonMat, plant, pool, researchDesk, rug, shadowRect, shadowRound, wallBoard, type Ctx, type P3, type ThemeCtx, type ThemeFn } from "./common";
import { artMat, cone, cTex, disc, fillRR, FONT, rr } from "./c-kit";

// ─────────────────────────────────────────────── textures

/** The wall map: paper, blocks, parks, a river, avenues, a metro line, the chosen spot with a radius, pins. */
const MAP_W = 1024, MAP_H = 256;
/** Pins on the wall map (canvas px) → also built in 3D. */
const MAP_PINS: [number, number, string][] = [[212, 92, "#E5484D"], [402, 176, "#F2B33D"], [856, 70, "#22A06B"], [930, 190, "#E5484D"]];
const SPOT: [number, number] = [640, 118];

function mapTex(color: string) {
  return cTex(`loc:map:${color}`, MAP_W, MAP_H, (g, w, h) => {
    g.fillStyle = "#F5F0E4";
    g.fillRect(0, 0, w, h);
    // city blocks
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    for (let y = 8; y < h - 8; y += 38) for (let x = 8; x < w - 8; x += 52) {
      const park = rnd() < 0.16;
      fillRR(g, park ? "#CFE3B4" : rnd() < 0.5 ? "#E8DFCF" : "#E2D8C6", x, y, 44, 30, 5);
      if (park) for (let k = 0; k < 4; k++) disc(g, "#9CC584", x + 9 + (k % 2) * 22 + rnd() * 6, y + 9 + Math.floor(k / 2) * 12, 5);
    }
    // the river
    g.strokeStyle = "#BFDDF0";
    g.lineWidth = 34;
    g.lineCap = "round";
    g.beginPath();
    for (let x = -20; x <= w + 20; x += 8) {
      const y = 214 + Math.sin(x / 120) * 18 - x * 0.02;
      x === -20 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
    g.strokeStyle = "#9FCBE8";
    g.lineWidth = 22;
    g.stroke();
    // avenues (white with a warm casing)
    const road = (pts: [number, number][], wdt: number) => {
      for (const [col, lw] of [["#D8CBB4", wdt + 6], ["#FFFFFF", wdt]] as const) {
        g.strokeStyle = col;
        g.lineWidth = lw;
        g.lineJoin = "round";
        g.beginPath();
        pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
      }
    };
    road([[0, 42], [w, 42]], 9);
    road([[0, 156], [w, 156]], 12);
    road([[164, 0], [164, h]], 9);
    road([[476, 0], [476, h]], 12);
    road([[790, 0], [790, h]], 9);
    road([[40, h], [380, 0]], 10);
    // metro line with stations
    g.strokeStyle = color;
    g.lineWidth = 9;
    g.beginPath();
    const line: [number, number][] = [[30, 120], [250, 120], [330, 80], [560, 80], [640, 118], [760, 118], [860, 200], [1000, 200]];
    line.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    for (const [x, y] of [line[1]!, line[3]!, line[5]!, line[6]!]) {
      disc(g, "#FFFFFF", x, y, 10);
      g.lineWidth = 5;
      g.strokeStyle = "#2B3140";
      g.beginPath();
      g.arc(x, y, 10, 0, Math.PI * 2);
      g.stroke();
    }
    // the chosen spot: a soft radius + dashed ring + star
    g.fillStyle = color + "33";
    g.beginPath();
    g.arc(SPOT[0], SPOT[1], 74, 0, Math.PI * 2);
    g.fill();
    g.setLineDash([12, 9]);
    g.lineWidth = 5;
    g.strokeStyle = color;
    g.stroke();
    g.setLineDash([]);
    // pins (drawn as their shadows; the heads are 3D)
    for (const [x, y] of MAP_PINS) disc(g, "rgba(40,30,20,0.18)", x + 6, y + 6, 9);
    // compass + legend card
    fillRR(g, "#FFFFFF", w - 70, 12, 56, 56, 28);
    g.fillStyle = "#2B3140";
    g.beginPath();
    g.moveTo(w - 42, 18);
    g.lineTo(w - 34, 40);
    g.lineTo(w - 50, 40);
    g.closePath();
    g.fill();
    g.fillStyle = "#C9C2B4";
    g.beginPath();
    g.moveTo(w - 42, 62);
    g.lineTo(w - 34, 40);
    g.lineTo(w - 50, 40);
    g.closePath();
    g.fill();
    fillRR(g, "#FFFFFF", 14, 14, 120, 58, 8);
    g.font = FONT(15);
    g.fillStyle = "#2B3140";
    g.fillText("FOOTFALL", 24, 36);
    for (let k = 0; k < 3; k++) fillRR(g, k === 0 ? color : "#D9D2C4", 24, 46 + k * 7, 30 + k * 22 + (k === 0 ? 44 : 0), 4, 2);
    g.strokeStyle = "#CBBFA8";
    g.lineWidth = 6;
    rr(g, 3, 3, w - 6, h - 6, 6);
    g.stroke();
  });
}

/** The metro station sign (lit at night): tiled board, roundel, station name, line colour band. */
function metroTex(color: string) {
  return cTex(`loc:metro:${color}`, 640, 128, (g, w, h) => {
    fillRR(g, "#1F2A44", 0, 0, w, h, 14);
    fillRR(g, "#FFFFFF", 8, 8, w - 16, h - 16, 9);
    fillRR(g, color, 8, h - 30, w - 16, 22, 0);
    g.fillStyle = "#1F2A44";
    g.fillRect(8, h - 30, w - 16, 3);
    // roundel
    const cx = 72, cy = 52;
    g.lineWidth = 15;
    g.strokeStyle = color;
    g.beginPath();
    g.arc(cx, cy, 32, 0, Math.PI * 2);
    g.stroke();
    fillRR(g, "#1F2A44", cx - 48, cy - 11, 96, 22, 3);
    g.font = FONT(18, 900);
    g.fillStyle = "#FFFFFF";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("METRO", cx, cy + 1);
    g.textAlign = "left";
    g.font = FONT(50, 900);
    g.fillStyle = "#1F2A44";
    g.fillText("MAIN STREET", 140, 54);
  });
}

// ─────────────────────────────────────────────── pieces

/** Hero: the city diorama table. Returns the chosen-spot position (room-local) for the pin. */
function dioramaTable(ctx: ThemeCtx, pos: P3): THREE.Vector3 {
  const { c, group } = ctx;
  const { B } = c;
  const t = B.sub(pos, 0, group);
  const W = 1.7, D = 1.06, top = 0.64;
  shadowRect(c, W + 0.35, D + 0.35, [0, 0, 0], t, 0.32);
  // oak table, chunky legs + apron
  B.box(W, 0.06, D, fx(c, C.oak, 0.5), [0, top - 0.03, 0], 0.02, t);
  B.box(W - 0.14, 0.08, D - 0.14, fx(c, C.oakDark, 0.6), [0, top - 0.1, 0], 0.01, t);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) B.box(0.07, top - 0.06, 0.07, fx(c, C.oakDark, 0.6), [x * (W / 2 - 0.09), (top - 0.06) / 2, z * (D / 2 - 0.09)], 0.012, t);
  // the model base (green ground, slightly raised)
  const y0 = top + 0.02;
  B.box(W - 0.12, 0.04, D - 0.12, fx(c, "#BFD9A3", 0.85), [0, y0, 0], 0.012, t);
  const gy = y0 + 0.02; // ground level of the model
  // river along the back edge + a little bridge
  B.box(W - 0.14, 0.012, 0.13, fx(c, "#8EC6E6", 0.3), [0, gy + 0.002, -0.36], 0, t, false);
  // roads: an avenue along x and a street along z, with dashes
  const asph = fx(c, "#7D838C", 0.8), dash = fx(c, "#FFFFFF", 0.6);
  B.box(W - 0.13, 0.008, 0.13, asph, [0, gy + 0.004, 0.1], 0, t, false);
  B.box(0.12, 0.008, D - 0.13, asph, [-0.28, gy + 0.004, 0], 0, t, false);
  for (let i = 0; i < 7; i++) B.box(0.07, 0.003, 0.012, dash, [-0.72 + i * 0.24, gy + 0.009, 0.1], 0, t, false);
  B.box(0.16, 0.03, 0.17, fx(c, "#E9E2D3", 0.7), [-0.28, gy + 0.012, -0.36], 0.008, t);
  // buildings: [x, z, w, d, h, wall, roof: "hip" | "flat"]
  const walls = ["#FFFFFF", "#F6CFA8", "#E9C9EC", "#C7E0F4", "#F8E3A0"];
  const win = neonMat(c, "#FFE2A0");
  const roofHip = fx(c, C.terracotta, 0.75), roofFlat = fx(c, "#C9C4BA", 0.8);
  const bl: [number, number, number, number, number, number, "hip" | "flat"][] = [
    [-0.66, -0.13, 0.18, 0.18, 0.17, 0, "hip"],
    [-0.45, -0.14, 0.16, 0.16, 0.25, 1, "flat"],
    [-0.66, 0.31, 0.18, 0.18, 0.15, 2, "hip"],
    [-0.46, 0.32, 0.15, 0.15, 0.2, 3, "hip"],
    [-0.06, -0.15, 0.18, 0.17, 0.42, 3, "flat"],
    [0.15, -0.16, 0.16, 0.15, 0.28, 0, "flat"],
    [0.53, -0.13, 0.19, 0.17, 0.19, 4, "hip"],
    [0.73, -0.15, 0.14, 0.14, 0.32, 1, "flat"],
    [-0.04, 0.33, 0.17, 0.16, 0.15, 4, "hip"],
    [0.6, 0.33, 0.18, 0.16, 0.14, 2, "hip"],
    [0.77, 0.33, 0.11, 0.13, 0.24, 0, "flat"],
  ];
  for (const [x, z, w, d, h, wi, roof] of bl) {
    B.box(w, h, d, fx(c, walls[wi]!, 0.75), [x, gy + h / 2, z], 0.01, t);
    if (roof === "hip") cone(c, t, Math.max(w, d) * 0.74, 0.08, roofHip, [x, gy + h + 0.04, z]);
    else B.box(w + 0.01, 0.015, d + 0.01, roofFlat, [x, gy + h + 0.007, z], 0.004, t);
    // a strip of windows facing the camera (+z)
    for (let k = 0; k < Math.max(1, Math.floor(h / 0.08)); k++) B.box(w * 0.7, 0.028, 0.006, win, [x, gy + 0.05 + k * 0.075, z + d / 2 + 0.002], 0, t, false);
  }
  // the chosen shop: a little corner shop with an awning in the dept colour
  const sx = 0.3, sz = 0.33;
  B.box(0.2, 0.15, 0.16, fx(c, "#FFFFFF", 0.6), [sx, gy + 0.075, sz], 0.012, t);
  B.box(0.22, 0.03, 0.18, accent(c, 0.4), [sx, gy + 0.165, sz], 0.008, t);
  const aw = B.box(0.22, 0.012, 0.07, accent(c, 0.4), [sx, gy + 0.115, sz + 0.105], 0.004, t);
  aw.rotation.x = 0.45;
  B.box(0.07, 0.09, 0.004, fx(c, "#5A7FA0", 0.3), [sx - 0.04, gy + 0.05, sz + 0.081], 0, t, false);
  B.box(0.05, 0.1, 0.004, fx(c, C.oakDark, 0.5), [sx + 0.06, gy + 0.05, sz + 0.081], 0, t, false);
  // the glowing ring around the chosen shop
  const ring = B.torus(0.17, 0.014, neonMat(c, c.color), [sx, gy + 0.006, sz], Math.PI * 2, t);
  ring.rotation.x = Math.PI / 2;
  // trees
  const leaf = fx(c, C.leafC, 0.8), leaf2 = fx(c, C.leafD, 0.8), trunk = fx(c, C.oakDark, 0.7);
  for (const [x, z, k] of [[-0.75, 0.05, 0], [-0.14, 0.18, 1], [0.08, 0.2, 0], [0.42, -0.02, 1], [0.78, 0.04, 0], [-0.55, 0.05, 1], [0.0, 0.46, 1], [0.48, 0.47, 0]] as const) {
    B.box(0.012, 0.04, 0.012, trunk, [x, gy + 0.02, z], 0, t);
    B.blob(0.035, k ? leaf : leaf2, [x, gy + 0.065, z], 0, t);
  }
  // two little cars on the avenue
  for (const [x, col] of [[-0.55, "#E5484D"], [0.62, "#F2B33D"]] as const) {
    B.box(0.07, 0.025, 0.04, fx(c, col, 0.45), [x, gy + 0.022, 0.13], 0.01, t);
    B.box(0.04, 0.02, 0.035, fx(c, "#DDEAF2", 0.3), [x - 0.005, gy + 0.042, 0.13], 0.008, t);
  }
  // small map-pins stuck in the model
  for (const [x, z, col] of [[-0.66, 0.31, "#E5484D"], [0.53, -0.13, "#F2B33D"], [-0.06, -0.15, "#22A06B"]] as const) {
    const top0 = bl.find((b) => b[0] === x && b[1] === z)![4] + gy + 0.06;
    B.cyl(0.004, 0.004, 0.09, fx(c, C.steel, 0.3, 0.6), [x, top0 + 0.045, z], 6, t);
    B.sphere(0.022, fx(c, col, 0.4), [x, top0 + 0.095, z], 10, t);
  }
  // a rolled map and a magnifier on the table edge
  const rm = B.cyl(0.025, 0.025, 0.4, fx(c, "#F1E9D6", 0.8), [0.55, top + 0.026, 0.47], 12, t);
  rm.rotation.z = Math.PI / 2;
  rm.rotation.y = 0.25;
  return new THREE.Vector3(pos[0] + sx, gy + 0.5, pos[2] + sz);
}

/** The big location pin (teardrop in the dept colour with a white dot). Built at the origin; merged, animated. */
function bigPin(c: Ctx) {
  const { B } = c;
  const src = new THREE.Group();
  const m = fx(c, "#E5484D", 0.3);
  B.sphere(0.075, m, [0, 0.0, 0], 24, src);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.066, 0.14, 16), m);
  tip.rotation.x = Math.PI;
  tip.position.set(0, -0.085, 0);
  src.add(tip);
  B.sphere(0.03, fx(c, "#FFFFFF", 0.4), [0, 0.012, 0.055], 12, src).scale.set(1, 1, 0.5);
  B.sphere(0.03, fx(c, "#FFFFFF", 0.4), [0, 0.012, -0.055], 12, src).scale.set(1, 1, 0.5);
  src.scale.setScalar(2.0);
  const out = new THREE.Group();
  out.add(src);
  return mergeStatic(out, c.R);
}

/** A cast-iron park bench; faces +Z. */
function bench(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number, w = 1.2) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  shadowRect(c, w + 0.25, 0.7, [0, 0, 0], g, 0.28);
  const iron = fx(c, "#2E3A33", 0.5, 0.3), wood = fx(c, "#C98B55", 0.6);
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.08);
    B.box(0.04, 0.42, 0.05, iron, [x, 0.21, 0.13], 0.01, g);
    B.box(0.04, 0.8, 0.05, iron, [x, 0.4, -0.15], 0.01, g);
    B.box(0.04, 0.04, 0.34, iron, [x, 0.4, -0.01], 0.01, g);
    B.box(0.04, 0.04, 0.3, iron, [x, 0.6, 0.0], 0.01, g); // armrest
    B.box(0.04, 0.16, 0.04, iron, [x, 0.5, 0.13], 0.01, g);
  }
  for (let i = 0; i < 4; i++) B.box(w, 0.035, 0.075, wood, [0, 0.43, 0.12 - i * 0.085], 0.012, g);
  for (let i = 0; i < 3; i++) B.box(w, 0.075, 0.03, wood, [0, 0.55 + i * 0.1, -0.17], 0.012, g);
  return g;
}

/** A classic street lamp with a lantern head (glows at night) and a warm pool. */
function streetLamp(c: Ctx, parent: THREE.Object3D, pos: P3) {
  const { B } = c;
  const g = B.sub(pos, 0, parent);
  const iron = fx(c, "#2E3A33", 0.45, 0.35);
  shadowRound(c, 0.22, [0, 0, 0], g, 0.3);
  B.cyl(0.09, 0.12, 0.12, iron, [0, 0.06, 0], 12, g);
  B.cyl(0.05, 0.07, 0.1, iron, [0, 0.17, 0], 12, g);
  B.cyl(0.022, 0.026, 1.36, iron, [0, 0.9, 0], 10, g);
  B.cyl(0.05, 0.035, 0.05, iron, [0, 1.6, 0], 10, g);
  // lantern: glowing panes in an iron cage + a cap
  B.box(0.16, 0.2, 0.16, lampMat(c), [0, 1.73, 0], 0.02, g);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) B.box(0.018, 0.22, 0.018, iron, [x * 0.08, 1.73, z * 0.08], 0, g);
  cone(c, g, 0.15, 0.1, iron, [0, 1.88, 0]);
  B.sphere(0.022, iron, [0, 1.94, 0], 8, g);
  pool(c, 0.95, [0, 0, 0], g, 0.6);
  return g;
}

function trafficCone(c: Ctx, parent: THREE.Object3D, pos: P3, rotY = 0) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  shadowRect(c, 0.3, 0.3, [0, 0, 0], g, 0.3);
  B.box(0.24, 0.025, 0.24, fx(c, "#F06A2A", 0.55), [0, 0.0125, 0], 0.008, g);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.085, 0.34, c.B.q === "high" ? 18 : 10), fx(c, "#F27A36", 0.5));
  body.position.set(0, 0.195, 0);
  body.castShadow = true;
  g.add(body);
  B.cyl(0.05, 0.062, 0.06, fx(c, "#FFFFFF", 0.5), [0, 0.2, 0], 16, g);
  return g;
}

/** A basket of rolled maps. */
function mapBasket(c: Ctx, parent: THREE.Object3D, pos: P3) {
  const { B } = c;
  const g = B.sub(pos, 0, parent);
  shadowRound(c, 0.24, [0, 0, 0], g, 0.3);
  B.cyl(0.15, 0.13, 0.32, accentSoft(c), [0, 0.16, 0], 16, g);
  B.torus(0.15, 0.015, accent(c, 0.4), [0, 0.32, 0], Math.PI * 2, g).rotation.x = Math.PI / 2;
  const cols = ["#F1E9D6", "#D6E6F2", "#F1E9D6", "#E8DCC3"];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const r = B.cyl(0.03, 0.03, 0.62, fx(c, cols[i]!, 0.8), [Math.cos(a) * 0.06, 0.38, Math.sin(a) * 0.06], 10, g);
    r.rotation.set(Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18);
  }
  return g;
}

// ─────────────────────────────────────────────── the room

export const location: ThemeFn = (ctx) => {
  const { c, group: g } = ctx;
  const { B } = c;
  researchDesk(ctx, { screen: 4 });
  if (ctx.compact) {
    wallBoard(ctx, "map");
    mapBasket(c, g, [ctx.desk.x + (ctx.side === "a" ? 1.08 : 1.12), 0, -2.08]);
    return decor(ctx);
  }

  // back wall: the big city map with 3D push-pins
  const mapW = 3.16, mapH = mapW * (MAP_H / MAP_W);
  const mx = 1.16, my = 0.82, mz = -2.35;
  const fr = B.sub([mx, my, mz], 0, g);
  B.box(mapW + 0.08, mapH + 0.08, 0.04, fx(c, C.oak, 0.5), [0, 0, 0], 0.012, fr);
  B.plane(mapW, mapH, artMat(c, mapTex(c.color), "loc-map"), [0, 0, 0.021], fr);
  const px = (u: number, v: number): P3 => [(u / MAP_W - 0.5) * mapW, (0.5 - v / MAP_H) * mapH, 0.021];
  for (const [u, v, col] of MAP_PINS) {
    const p = px(u, v);
    const n = B.cyl(0.006, 0.006, 0.06, fx(c, C.steel, 0.3, 0.6), [p[0], p[1], p[2] + 0.03], 6, fr);
    n.rotation.x = Math.PI / 2;
    B.sphere(0.03, fx(c, col, 0.4), [p[0], p[1], p[2] + 0.065], 12, fr);
  }
  // the chosen spot on the wall map: a bigger pin in the dept colour
  {
    const p = px(SPOT[0], SPOT[1]);
    const n = B.cyl(0.008, 0.008, 0.08, fx(c, C.steel, 0.3, 0.6), [p[0], p[1], p[2] + 0.04], 6, fr);
    n.rotation.x = Math.PI / 2;
    B.sphere(0.05, accent(c, 0.4), [p[0], p[1], p[2] + 0.09], 16, fr);
  }
  // a low plan chest under the map (wide shallow drawers) with rolled plans on top
  const pc = B.sub([1.55, 0, -2.13], 0, g);
  shadowRect(c, 1.7, 0.6, [0, 0, 0], pc, 0.28);
  B.box(1.5, 0.36, 0.42, fx(c, C.lacquer, 0.45), [0, 0.2, 0], 0.02, pc);
  B.box(1.5, 0.03, 0.42, fx(c, C.oak, 0.5), [0, 0.395, 0], 0.01, pc);
  for (let i = 0; i < 3; i++) {
    B.box(1.42, 0.004, 0.004, fx(c, "#D9D6CF", 0.6), [0, 0.1 + i * 0.1, 0.212], 0, pc, false);
    B.box(0.16, 0.018, 0.02, fx(c, C.brass, 0.35, 0.7), [0, 0.06 + i * 0.1, 0.22], 0.006, pc);
  }
  for (const [x, col, rz] of [[-0.45, "#F1E9D6", 0.1], [-0.25, "#D6E6F2", -0.06], [0.45, "#F1E9D6", 0.04]] as const) {
    const r = B.cyl(0.032, 0.032, 0.5, fx(c, col, 0.8), [x, 0.443, 0.02], 10, pc);
    r.rotation.set(Math.PI / 2, 0, rz);
  }

  // hero: the city diorama with the big pin bobbing over the chosen shop
  rug(c, g, "rect", 2.35, 1.6, [1.3, 0, 0.3]);
  const spot = dioramaTable(ctx, [1.3, 0, 0.25]);
  const pin = ctx.animate(bigPin(c));
  pin.position.copy(spot);
  g.add(pin);
  const pinY = spot.y;

  // left wall: the metro station sign over a park bench
  const sign = B.sub([-2.9, 0.9, 0.95], Math.PI / 2, g);
  B.box(1.42, 0.31, 0.03, fx(c, "#1F2A44", 0.5), [0, 0, 0], 0.012, sign);
  B.plane(1.38, 0.276, glowMat(c, metroTex(c.color)), [0, 0, 0.017], sign);
  bench(c, g, [-2.62, 0, 0.95], Math.PI / 2, 1.2);
  mapBasket(c, g, [-2.58, 0, -0.55]);
  streetLamp(c, g, [-2.62, 0, -1.25]);
  plant(c, g, [-2.62, 0, 2.12], "bush", "#CFCAC0");

  // the street at the door: asphalt, a zebra crossing, yellow kerb lines and cones
  const road = fx(c, "#8A9099", 0.85), white = fx(c, "#FFFFFF", 0.7), yellow = fx(c, "#F2C04A", 0.6);
  B.box(2.1, 0.008, 1.06, road, [-0.75, 0.004, 1.62], 0.003, g, false);
  for (let i = 0; i < 4; i++) B.box(0.9, 0.01, 0.15, white, [-0.7, 0.008, 1.22 + i * 0.27], 0.003, g, false);
  for (const zz of [1.12, 2.12]) for (const xx of [-1.55, 0.1]) B.box(0.5, 0.01, 0.035, yellow, [xx, 0.008, zz], 0, g, false);
  trafficCone(c, g, [0.55, 0, 1.25], 0.3);
  trafficCone(c, g, [0.62, 0, 1.75], -0.2);
  // a fire hydrant on the "pavement"
  const hy = B.sub([-2.05, 0, 1.9], 0.4, g);
  shadowRound(c, 0.16, [0, 0, 0], hy, 0.3);
  const red = fx(c, "#E0443E", 0.45);
  B.cyl(0.1, 0.11, 0.05, red, [0, 0.025, 0], 12, hy);
  B.cyl(0.075, 0.08, 0.3, red, [0, 0.2, 0], 12, hy);
  B.sphere(0.078, red, [0, 0.35, 0], 12, hy);
  B.cyl(0.03, 0.03, 0.05, fx(c, "#F2C04A", 0.4, 0.3), [0, 0.43, 0], 8, hy);
  for (const sx of [-1, 1]) B.cyl(0.035, 0.035, 0.07, red, [sx * 0.1, 0.24, 0], 10, hy).rotation.z = Math.PI / 2;
  B.cyl(0.04, 0.04, 0.06, red, [0, 0.24, 0.09], 10, hy).rotation.x = Math.PI / 2;
  plant(c, g, [2.6, 0, 1.95], "bush");

  return decor(ctx, {
    update(_dt, t) {
      pin.position.y = pinY + Math.sin(t * 2.1) * 0.035;
      pin.rotation.y = t * 0.9;
    },
  });
};
