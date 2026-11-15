// WS-OFFICE · rooms/a-kit.ts — designer A's local helpers (competition, market, pricing).
// Small pieces shared by the three rooms: strings between two points, price tags, coin stacks, a 3D bitmap glyph,
// and the pixel-native canvas textures of the three sets (cached per colour).
//
// Honesty rule (pixel.ts): wall art never shows numbers, names, quotes or URLs — charts are shapes, prices are "$".
import * as THREE from "three";
import { canvasTex } from "../textures";
import { C, fx, type Ctx, type P3 } from "./common";

// ─────────────────────────────────────────────── geometry helpers

const UP = new THREE.Vector3(0, 1, 0);
const tv = new THREE.Vector3();

/** A thin rod (string, wire, arm) from a to b (parent-local). */
export function strand(c: Ctx, parent: THREE.Object3D, a: P3, b: P3, r: number, m: THREE.Material, seg = 6) {
  tv.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = tv.length();
  const mesh = c.B.cyl(r, r, len, m, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], seg, parent);
  mesh.quaternion.setFromUnitVectors(UP, tv.normalize());
  mesh.castShadow = false;
  return mesh;
}

/** A sagging string a → b through `n` segments (bunting, red string). Returns the points. */
export function sagString(c: Ctx, parent: THREE.Object3D, a: P3, b: P3, sag: number, r: number, m: THREE.Material, n = 6): P3[] {
  const pts: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    pts.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - Math.sin(k * Math.PI) * sag, a[2] + (b[2] - a[2]) * k]);
  }
  for (let i = 0; i < n; i++) strand(c, parent, pts[i]!, pts[i + 1]!, r, m, 5);
  return pts;
}

/**
 * A price tag (flat, faces +Z): a rectangle with a pointed left end and a punched hole. `w` = body width.
 * Origin = the hole (where the string ties on).
 */
export function priceTag(c: Ctx, parent: THREE.Object3D, pos: P3, w: number, body: THREE.Material, rotZ = 0, d = 0.02, hole: THREE.Material = fx(c, C.ink, 0.6)) {
  const { B } = c;
  const h = w * 0.58;
  const t = B.sub(pos, 0, parent);
  t.rotation.z = rotZ;
  const s = h / Math.SQRT2;
  B.box(w, h, d, body, [w / 2 + h * 0.05, 0, 0], 0.008, t);
  const tip = B.box(s, s, d, body, [h * 0.05, 0, 0], 0.008, t);
  tip.rotation.z = Math.PI / 4;
  B.cyl(h * 0.11, h * 0.11, d + 0.006, hole, [h * 0.12, 0, 0], 10, t).rotation.x = Math.PI / 2;
  return t;
}

/** A stack of `n` coins (rim lines every other coin). Origin on the floor/surface. */
export function coinStack(c: Ctx, parent: THREE.Object3D, pos: P3, n: number, r = 0.16, t = 0.05, gold = "#F6C94E", rim = "#DDA437", jitter = 0.012) {
  const { B } = c;
  const a = fx(c, gold, 0.4, 0.2);
  const b = fx(c, rim, 0.45, 0.2);
  const s = B.sub(pos, 0, parent);
  for (let i = 0; i < n; i++) {
    const jx = Math.sin(i * 2.7 + pos[0] * 5) * jitter, jz = Math.cos(i * 1.9 + pos[2] * 7) * jitter;
    B.cyl(r, r, t * 0.86, i % 2 ? a : b, [jx, t / 2 + i * t, jz], 18, s);
    B.cyl(r * 0.8, r * 0.8, t * 0.88, a, [jx, t / 2 + i * t + 0.001, jz], 14, s);
  }
  return s;
}

/** One upright coin (faces +Z): rim + face + an embossed "$". */
export function coin(c: Ctx, parent: THREE.Object3D, pos: P3, r = 0.16, t = 0.045) {
  const { B } = c;
  const g = B.sub(pos, 0, parent);
  B.cyl(r, r, t, fx(c, "#E3AE3E", 0.4, 0.2), [0, 0, 0], 22, g).rotation.x = Math.PI / 2;
  B.cyl(r * 0.8, r * 0.8, t + 0.006, fx(c, "#F8D266", 0.4, 0.2), [0, 0, 0], 20, g).rotation.x = Math.PI / 2;
  glyph3D(c, g, "$", [0, 0, t / 2 + 0.006], (r * 1.1) / 7, fx(c, "#C98A22", 0.45, 0.2), 0.012);
  glyph3D(c, g, "$", [0, 0, -t / 2 - 0.006], (r * 1.1) / 7, fx(c, "#C98A22", 0.45, 0.2), 0.012, true);
  return g;
}

// 5×7 bitmap glyphs for the 3D signs (same font as pixel.ts).
const GLYPH: Record<string, number[]> = {
  $: [4, 15, 20, 14, 5, 30, 4],
  "?": [14, 17, 1, 2, 4, 0, 4],
  "!": [4, 4, 4, 4, 4, 0, 4],
  "%": [24, 25, 2, 4, 8, 19, 3],
  "+": [0, 4, 4, 31, 4, 4, 0],
};

/** A bitmap glyph built from little blocks, centred on `pos`, facing +Z (`back` = mirrored, faces −Z). */
export function glyph3D(c: Ctx, parent: THREE.Object3D, ch: string, pos: P3, px: number, m: THREE.Material, d = 0.02, back = false) {
  const rows = GLYPH[ch] ?? GLYPH["?"]!;
  const g = c.B.sub(pos, back ? Math.PI : 0, parent);
  for (let r = 0; r < 7; r++) {
    // merge runs of set bits into one block per run
    let run = -1;
    for (let col = 0; col <= 5; col++) {
      const on = col < 5 && (rows[r]! & (16 >> col)) !== 0;
      if (on && run < 0) run = col;
      if (!on && run >= 0) {
        const n = col - run;
        c.B.box(px * n, px, d, m, [(run + n / 2 - 2.5) * px, (3 - r) * px, 0], 0, g, false);
        run = -1;
      }
    }
  }
  return g;
}

/** A flat textured panel facing +Z (wall art, a table-top map with rotation). `mat` must carry the map. */
export function panel(c: Ctx, parent: THREE.Object3D, pos: P3, w: number, h: number, mat: THREE.Material, rotX = 0) {
  const p = c.B.plane(w, h, mat, pos, parent);
  p.rotation.x = rotX;
  return p;
}

/** Wall art material with a map (not lit at night, keyed so several textures can share the "fixed" role). */
export const artMat = (c: Ctx, t: THREE.Texture, key: string, rough = 0.85) => c.R.m("fixed", c.room, c.color, { map: t, rough, key });

// ─────────────────────────────────────────────── pixel-native textures

const col = new THREE.Color();
const mix = (a: string, b: string, k: number) => "#" + col.set(a).lerp(new THREE.Color(b), k).getHexString();
const rect = (g: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) => {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
};
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function glyph2D(g: CanvasRenderingContext2D, ch: string, x: number, y: number, color: string, s = 1) {
  const rows = GLYPH[ch] ?? GLYPH["?"]!;
  g.fillStyle = color;
  for (let r = 0; r < 7; r++) for (let k = 0; k < 5; k++) if (rows[r]! & (16 >> k)) g.fillRect(x + k * s, y + r * s, s, s);
}
const INK = "#1E2229";

/** Competition: the rivals map on the planning table — streets, blocks, a park, a river; our spot in the accent. */
export function rivalMapTex(color: string) {
  return canvasTex(`a:rivalmap:${color}`, 72, 48, (g, w, h) => {
    const r = rng(31);
    rect(g, "#EDE4CF", 0, 0, w, h);
    // river
    for (let x = 0; x < w; x++) {
      const y = Math.round(34 + Math.sin(x / 9) * 4 - x * 0.12);
      rect(g, "#9CC7E3", x, y, 1, 4);
      rect(g, "#BBDAEE", x, y + 1, 1, 1);
    }
    // street grid
    const xs = [0, 13, 27, 40, 55, 72], ys = [0, 11, 22, 48];
    for (let i = 0; i < xs.length - 1; i++)
      for (let j = 0; j < ys.length - 1; j++) {
        const x0 = xs[i]! + 2, y0 = ys[j]! + 2, bw = xs[i + 1]! - xs[i]! - 3, bh = Math.min(ys[j + 1]!, 30) - ys[j]! - 3;
        if (bh <= 1) continue;
        const park = i === 3 && j === 1;
        rect(g, park ? "#B9D8A2" : r() < 0.5 ? "#E1D5BB" : "#D9CCB0", x0, y0, bw, bh);
        if (park) for (let k = 0; k < 5; k++) rect(g, "#8DBB78", x0 + 2 + Math.floor(r() * (bw - 4)), y0 + 2 + Math.floor(r() * (bh - 4)), 2, 2);
        else for (let k = 0; k < 3; k++) rect(g, "#CDBF9F", x0 + 1 + Math.floor(r() * (bw - 3)), y0 + 1 + Math.floor(r() * (bh - 3)), 2, 1);
      }
    for (const x of xs) rect(g, "#FFFDF7", x - 1, 0, 2, 31);
    for (const y of ys.slice(0, 3)) rect(g, "#FFFDF7", 0, y - 1, w, 2);
    // a diagonal avenue
    for (let k = 0; k < 30; k++) rect(g, "#FFFDF7", 2 + k * 2, 29 - k, 2, 2);
    // our spot (accent ring) and dashed "catchment" circle
    const cx = 34, cy = 16;
    for (let a = 0; a < 40; a++) if (a % 3) rect(g, mix(color, "#ffffff", 0.2), Math.round(cx + Math.cos((a / 40) * Math.PI * 2) * 11), Math.round(cy + Math.sin((a / 40) * Math.PI * 2) * 8), 1, 1);
    // frame
    rect(g, "#B9A882", 0, 0, w, 1);
    rect(g, "#B9A882", 0, h - 1, w, 1);
    rect(g, "#B9A882", 0, 0, 1, h);
    rect(g, "#B9A882", w - 1, 0, 1, h);
    // compass
    rect(g, INK, w - 7, h - 10, 1, 6);
    rect(g, "#E5484D", w - 7, h - 10, 1, 2);
  }, true, 0, true);
}

/** Market: the trading wall — six screens in one texture (candles, a rising line, bars, a pie, a heat grid, a gauge). */
export function tradingWallTex(color: string) {
  return canvasTex(`a:tradewall:${color}`, 104, 36, (g, w, h) => {
    const r = rng(12);
    rect(g, "#14171C", 0, 0, w, h);
    const up = "#34D399", dn = "#F87171", acc = mix(color, "#ffffff", 0.15), soft = mix(color, "#14171C", 0.55);
    const sw = 32, sh = 15;
    for (let i = 0; i < 6; i++) {
      const x = 2 + (i % 3) * (sw + 2), y = 2 + Math.floor(i / 3) * (sh + 2);
      rect(g, "#0E1B2E", x, y, sw, sh);
      rect(g, "#1B2A40", x, y, sw, 2);
      rect(g, acc, x + 1, y, 3, 1);
      const bx = x + 2, by = y + 3, bw = sw - 4, bh = sh - 5;
      switch (i) {
        case 0: {
          // candlesticks, trending up
          let v = bh * 0.7;
          for (let k = 0; k < 9; k++) {
            const d = (r() - 0.35) * 4;
            const o = v, cl = Math.max(1, Math.min(bh - 1, v - d));
            const top = Math.min(o, cl), hgt = Math.max(1, Math.abs(o - cl));
            const cc = cl < o ? up : dn;
            rect(g, cc, bx + 1 + k * 3, by + Math.round(top) - 1, 1, Math.round(hgt) + 2);
            rect(g, cc, bx + k * 3, by + Math.round(top), 3 - 1, Math.round(hgt));
            v = cl;
          }
          break;
        }
        case 1: {
          // a rising area curve in the accent
          for (let k = 0; k < bw; k++) {
            const yy = Math.round(bh - 1 - Math.pow(k / bw, 1.7) * (bh - 2) - Math.sin(k / 2) * 0.8);
            rect(g, soft, bx + k, by + yy, 1, bh - yy);
            rect(g, acc, bx + k, by + yy, 1, 1);
          }
          break;
        }
        case 2: {
          // bars
          for (let k = 0; k < 7; k++) {
            const hh = 2 + Math.round((k + 1) * (bh - 3) / 7 + (r() - 0.5) * 2);
            rect(g, k === 6 ? acc : "#5B7BA6", bx + 1 + k * 4, by + bh - hh, 3, hh);
          }
          break;
        }
        case 3: {
          // pie: big slice in the accent (the market share)
          const cx = bx + 8, cy = by + bh / 2, rr = 5.5;
          for (let yy = -6; yy <= 6; yy++)
            for (let xx = -6; xx <= 6; xx++) {
              if (xx * xx + yy * yy > rr * rr) continue;
              const a = Math.atan2(yy, xx);
              rect(g, a > -0.6 && a < 1.6 ? acc : a >= 1.6 ? "#5B7BA6" : "#2E4A70", Math.round(cx + xx), Math.round(cy + yy), 1, 1);
            }
          for (let k = 0; k < 3; k++) {
            rect(g, [acc, "#5B7BA6", "#2E4A70"][k]!, bx + 18, by + 2 + k * 3, 2, 2);
            rect(g, "#3B4C66", bx + 21, by + 2 + k * 3, 6 - k, 1);
          }
          break;
        }
        case 4: {
          // heat grid (sectors)
          for (let yy = 0; yy < 3; yy++)
            for (let xx = 0; xx < 7; xx++) {
              const v = r();
              rect(g, v > 0.66 ? up : v > 0.33 ? "#1F6F55" : v > 0.15 ? "#7A3A3A" : dn, bx + xx * 4, by + yy * 4, 3, 3);
            }
          break;
        }
        case 5: {
          // a gauge needle pointing high + arrows
          const cx = bx + 9, cy = by + bh - 1;
          for (let a = 0; a <= 20; a++) {
            const t = Math.PI - (a / 20) * Math.PI;
            rect(g, a > 13 ? acc : "#3B4C66", Math.round(cx + Math.cos(t) * 7), Math.round(cy - Math.sin(t) * 7), 1, 1);
          }
          for (let k = 0; k < 6; k++) rect(g, "#ffffff", Math.round(cx + Math.cos(0.7) * k), Math.round(cy - Math.sin(0.7) * k), 1, 1);
          // up arrows
          for (let k = 0; k < 3; k++) {
            const ax = bx + 20 + k * 3, ay = by + 2 + k * 2;
            rect(g, up, ax + 1, ay, 1, 1);
            rect(g, up, ax, ay + 1, 3, 1);
            rect(g, up, ax + 1, ay + 2, 1, 3);
          }
          break;
        }
      }
    }
  }, true, 0, true);
}

/** Market: the scrolling ticker (repeats horizontally): ▲ green, ▼ red, dashes. Own texture (offset animated). */
export function tickerTex(color: string) {
  const t = canvasTex(`a:ticker:${color}`, 64, 8, (g, w, h) => {
    rect(g, "#101318", 0, 0, w, h);
    const r = rng(5);
    let x = 1;
    while (x < w - 6) {
      const upq = r() < 0.65;
      const c = upq ? "#34D399" : "#F87171";
      if (upq) {
        rect(g, c, x + 1, 2, 1, 1);
        rect(g, c, x, 3, 3, 1);
      } else {
        rect(g, c, x, 3, 3, 1);
        rect(g, c, x + 1, 4, 1, 1);
      }
      const n = 3 + Math.floor(r() * 4);
      rect(g, r() < 0.3 ? mix(color, "#ffffff", 0.2) : "#C9D3E0", x + 4, 3, n, 2);
      x += 5 + n + 3;
    }
  }, true, 0, true);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

/** Market: the TAM / SAM / SOM rug — three concentric discs (white-based: the rug role tints it). */
export function tamRugTex() {
  return canvasTex(`a:tamrug`, 64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cx = w / 2 - 0.5, cy = h / 2 - 0.5;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - cx, y - cy);
        // SOM sits off-centre towards the back (like the classic nested diagram)
        const d2 = Math.hypot(x - cx, y - (cy - 6));
        const d3 = Math.hypot(x - cx, y - (cy - 12));
        if (d > 31.5) continue;
        let c = "#FFFFFF";
        if (d > 30) c = "#A8A8A8";
        else if (d2 < 21 && d2 > 19.6) c = "#FFFFFF";
        else if (d3 < 10) c = d3 > 8.8 ? "#FFFFFF" : "#767676";
        else if (d2 < 21) c = "#9C9C9C";
        else if ((x + y) % 4 === 0 && d < 29) c = "#EDEDED";
        rect(g, c, x, y, 1, 1);
      }
  }, true, 0, true);
}

/** Pricing: the tier chalkboard — three columns ($ · $$ · $$$), feature ticks, the middle tier starred. */
export function tierBoardTex(color: string) {
  return canvasTex(`a:tierboard:${color}`, 84, 46, (g, w, h) => {
    const r = rng(77);
    rect(g, "#27352F", 0, 0, w, h);
    for (let i = 0; i < 90; i++) rect(g, r() < 0.5 ? "#2D3C35" : "#22302A", Math.floor(r() * w), Math.floor(r() * h), 2, 1);
    const chalk = "#EEF0E8", dim = "#A9B3AC", acc = mix(color, "#ffffff", 0.35);
    for (let k = 0; k < 3; k++) {
      const x = 4 + k * 27, best = k === 1;
      // column box (dashed chalk)
      const c = best ? acc : dim;
      for (let i = 0; i < 24; i += 2) rect(g, c, x + i, 4, 1, 1), rect(g, c, x + i, h - 5, 1, 1);
      for (let i = 4; i < h - 4; i += 2) rect(g, c, x, i, 1, 1), rect(g, c, x + 23, i, 1, 1);
      // tier price in $ signs
      const n = k + 1, gw = n * 6 - 1;
      for (let i = 0; i < n; i++) glyph2D(g, "$", x + 12 - Math.floor(gw / 2) + i * 6, 8, best ? acc : chalk);
      rect(g, dim, x + 5, 18, 14, 1);
      // features: ticks + lines (more for higher tiers)
      for (let i = 0; i < 2 + k; i++) {
        const y = 22 + i * 5;
        rect(g, best ? acc : chalk, x + 4, y + 1, 1, 1);
        rect(g, best ? acc : chalk, x + 5, y + 2, 1, 1);
        rect(g, best ? acc : chalk, x + 6, y, 1, 2);
        rect(g, chalk, x + 9, y + 1, 8 + Math.floor(r() * 6), 1);
      }
      if (best) {
        // a chalk star above the middle tier
        const sx = x + 12, sy = 1;
        rect(g, "#F6D365", sx, sy, 1, 3);
        rect(g, "#F6D365", sx - 1, sy + 1, 3, 1);
      }
    }
    // chalk tray smudge
    rect(g, "#3A4A42", 0, h - 2, w, 2);
  }, true, 0, true);
}

/** Pricing: the till's little customer display ("$" + dashes), lit. */
export function tillDisplayTex() {
  return canvasTex(`a:till`, 24, 10, (g, w, h) => {
    rect(g, "#0F2A22", 0, 0, w, h);
    glyph2D(g, "$", 2, 2, "#7CF2B0", 1);
    for (let k = 0; k < 3; k++) rect(g, "#7CF2B0", 9 + k * 4, 6, 3, 2);
  }, true, 0, true);
}

/** Competition: the positioning map (two axes, rivals as dots in three quadrants, our star alone in the gap). */
export function positioningTex(color: string) {
  return canvasTex(`a:posmap:${color}`, 48, 48, (g, w, h) => {
    rect(g, "#FFFFFF", 0, 0, w, h);
    const ax = "#5B6270";
    rect(g, ax, 4, 24, 41, 1);
    rect(g, ax, 24, 4, 1, 41);
    rect(g, ax, 43, 23, 2, 3);
    rect(g, ax, 23, 3, 3, 2);
    // marker squiggles as axis labels (no words)
    rect(g, "#A3A9B2", 33, 27, 9, 1);
    rect(g, "#A3A9B2", 26, 5, 1, 8);
    const rv = ["#E5484D", "#22A06B", "#F59E0B", "#8B7CF6", "#EC6FA9", "#14B8A6", "#64748B", "#F97316"];
    const dots: Array<[number, number]> = [[8, 9], [13, 14], [16, 8], [9, 31], [15, 36], [11, 40], [32, 33], [38, 38], [35, 40]];
    dots.forEach(([x, y], i) => {
      rect(g, rv[i % rv.length]!, x - 1, y - 1, 3, 3);
      rect(g, "#ffffff", x, y, 1, 1);
    });
    // our star in the empty quadrant + a dashed ring
    const cx = 35, cy = 13;
    const acc = mix(color, INK, 0.1);
    rect(g, acc, cx - 1, cy - 3, 3, 7);
    rect(g, acc, cx - 3, cy - 1, 7, 3);
    rect(g, acc, cx - 2, cy - 2, 5, 5);
    for (let a = 0; a < 28; a++) if (a % 2) rect(g, "#E5484D", Math.round(cx + Math.cos((a / 28) * Math.PI * 2) * 7), Math.round(cy + Math.sin((a / 28) * Math.PI * 2) * 7), 1, 1);
  }, true, 0, true);
}
