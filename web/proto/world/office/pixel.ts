// WS-OFFICE · v7 pixel-art kit: a 5×7 bitmap font, the brand glyphs on a 9×9 grid, and pixel-native canvas textures
// (floors, department walls, bedroom posters, the company sign). Everything is drawn with integer rects on small
// canvases; in the pixel styles the textures are sampled nearest, so every texel reads as a pixel.
//
// Honesty rule: wall art never shows numbers, names, quotes or URLs. Charts are shapes; competitor cards are blank
// pixel logos with a price-tag shape; the company sign shows only what the project's own CompanySign says.
import * as THREE from "three";
import type { CompanySign } from "../../contracts";
import { canvasTex } from "./textures";

// ─────────────────────────────────────────────── 5×7 font (uppercase; accents stripped, unknown → space)

const F: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14], "2": [14, 17, 1, 2, 4, 8, 31], "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14], "6": [6, 8, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14], "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0], ".": [0, 0, 0, 0, 0, 12, 12], ",": [0, 0, 0, 0, 12, 4, 8], "'": [4, 4, 8, 0, 0, 0, 0],
  "-": [0, 0, 0, 14, 0, 0, 0], "!": [4, 4, 4, 4, 4, 0, 4], "?": [14, 17, 1, 2, 4, 0, 4], ":": [0, 12, 12, 0, 12, 12, 0],
  "&": [12, 18, 20, 8, 21, 18, 13], "€": [7, 8, 30, 8, 30, 8, 7], $: [4, 15, 20, 14, 5, 30, 4], "/": [1, 1, 2, 4, 8, 16, 16],
  "+": [0, 4, 4, 31, 4, 4, 0], "%": [24, 25, 2, 4, 8, 19, 3], "·": [0, 0, 0, 12, 12, 0, 0],
};
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
/** Width in font pixels at scale 1 (5 px per glyph + 1 px tracking; a space is 3 px). */
export function pxTextWidth(text: string, scale = 1): number {
  let w = 0;
  for (const ch of norm(text)) w += ch === " " ? 3 : 6;
  return Math.max(0, w - 1) * scale;
}
export function pxText(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale = 1, align: "left" | "center" | "right" = "left") {
  const w = pxTextWidth(text, scale);
  let cx = Math.round(align === "center" ? x - w / 2 : align === "right" ? x - w : x);
  g.fillStyle = color;
  for (const ch of norm(text)) {
    if (ch === " ") {
      cx += 3 * scale;
      continue;
    }
    const rows = F[ch] ?? F["?"]!;
    for (let r = 0; r < 7; r++) {
      const bits = rows[r]!;
      for (let c = 0; c < 5; c++) if (bits & (16 >> c)) g.fillRect(cx + c * scale, y + r * scale, scale, scale);
    }
    cx += 6 * scale;
  }
}
/** Greedy word wrap for the bitmap font. */
export function pxWrap(text: string, maxW: number, scale = 1): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (pxTextWidth(next, scale) <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ─────────────────────────────────────────────── brand glyphs (server LOGO_GLYPHS), 9×9

const GL: Record<string, string[]> = {
  pause: [".........", ".##...##.", ".##...##.", ".##...##.", ".##...##.", ".##...##.", ".##...##.", ".##...##.", "........."],
  roundel: ["...###...", ".##...##.", ".#.....#.", "#...#...#", "#..###..#", "#...#...#", ".#.....#.", ".##...##.", "...###..."],
  loop: [".........", ".##...##.", "#..#.#..#", "#...#...#", "#..#.#..#", ".##...##.", ".........", ".........", "........."],
  loaf: [".........", "..#####..", ".#.....#.", "#..#.#..#", "#.......#", "#.#...#.#", "#.......#", "#########", "........."],
  route: ["##.......", "##.......", ".#.......", ".####....", "....#....", "....####.", ".......#.", ".......##", ".......##"],
  tile: [".........", ".###.###.", ".###.###.", ".###.###.", ".........", ".###.###.", ".###.###.", ".###.###.", "........."],
  stop: ["..#####..", ".#######.", "#########", "###...###", "###...###", "###...###", "#########", ".#######.", "..#####.."],
  spark: ["....#....", "....#....", "...###...", "..#####..", "#########", "..#####..", "...###...", "....#....", "....#...."],
};
export function pxGlyph(g: CanvasRenderingContext2D, name: string | undefined, x: number, y: number, scale: number, color: string): boolean {
  const rows = name && name !== "none" ? GL[name] : undefined;
  if (!rows) return false;
  g.fillStyle = color;
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === "#") g.fillRect(x + c * scale, y + r * scale, scale, scale);
  });
  return true;
}

// ─────────────────────────────────────────────── helpers

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const col = new THREE.Color();
const hex = (c: THREE.Color) => "#" + c.getHexString();
const mix = (a: string, b: string, k: number) => hex(col.set(a).lerp(new THREE.Color(b), k));
const rect = (g: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) => {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
};
/** 1-px outlined box (pixel-art panel). */
function panel(g: CanvasRenderingContext2D, fill: string, line: string, x: number, y: number, w: number, h: number) {
  rect(g, line, x, y, w, h);
  rect(g, fill, x + 1, y + 1, w - 2, h - 2);
}
const INK = "#1E2229";
const PAPER = "#F4F1EA";

// ─────────────────────────────────────────────── floors (white-based: the material colour tints them)

/** Oak planks: 4 rows per repeat, staggered joints, 3 tones, a dark seam and a light top edge. */
export function pixelPlanksTex(): THREE.CanvasTexture {
  const t = canvasTex("px:planks", 32, 32, (g, w, h) => {
    const r = rng(11);
    rect(g, "#ffffff", 0, 0, w, h);
    const tones = ["#FFFFFF", "#F3EEE6", "#E8E0D4"];
    for (let row = 0; row < 4; row++) {
      let x = -Math.floor(r() * 12);
      while (x < w) {
        const len = 12 + Math.floor(r() * 10);
        rect(g, tones[Math.floor(r() * 3)]!, x, row * 8, len, 8);
        // grain: a couple of 2-px darker streaks
        for (let k = 0; k < 2; k++) rect(g, "#DCD2C4", x + 2 + Math.floor(r() * (len - 4)), row * 8 + 2 + Math.floor(r() * 4), 2 + Math.floor(r() * 3), 1);
        rect(g, "#BFB2A0", x, row * 8, 1, 8);
        x += len;
      }
      rect(g, "#C9BDAC", 0, row * 8 + 7, w, 1);
    }
  }, true, 0, true);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Corridor stone: large tiles with a 1-px joint and a faint speckle. */
export function pixelStoneTex(): THREE.CanvasTexture {
  const t = canvasTex("px:stone", 32, 32, (g, w, h) => {
    const r = rng(23);
    rect(g, "#ffffff", 0, 0, w, h);
    for (let i = 0; i < 26; i++) rect(g, r() < 0.5 ? "#F1EEE9" : "#E9E5DE", Math.floor(r() * w), Math.floor(r() * h), 1, 1);
    rect(g, "#D9D3C9", 0, 15, w, 1);
    rect(g, "#D9D3C9", 15, 0, 1, 16);
    rect(g, "#D9D3C9", 7, 16, 1, 16);
    rect(g, "#D9D3C9", 23, 16, 1, 16);
    rect(g, "#D9D3C9", 0, 31, w, 1);
  }, true, 0, true);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Bedroom wallpaper: tiny diamond dots on a warm white (white-based, tinted by the material). */
export function wallpaperTex(): THREE.CanvasTexture {
  const t = canvasTex("px:wallpaper", 16, 16, (g, w, h) => {
    rect(g, "#ffffff", 0, 0, w, h);
    rect(g, "#ECE6DE", 3, 3, 1, 1);
    rect(g, "#ECE6DE", 11, 11, 1, 1);
    rect(g, "#F3EFE9", 3, 11, 1, 1);
    rect(g, "#F3EFE9", 11, 3, 1, 1);
  }, true, 0, true);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Pixel rug: border stripes and a centre motif, white-based (tinted by the rug role). */
export function pixelRugTex(kind: "rect" | "stripe"): THREE.CanvasTexture {
  return canvasTex(`px:rug:${kind}`, 32, 24, (g, w, h) => {
    rect(g, "#ffffff", 0, 0, w, h);
    rect(g, "#CFCFCF", 0, 0, w, 1);
    rect(g, "#CFCFCF", 0, h - 1, w, 1);
    rect(g, "#CFCFCF", 0, 0, 1, h);
    rect(g, "#CFCFCF", w - 1, 0, 1, h);
    if (kind === "rect") {
      for (let x = 3; x < w - 3; x += 2) rect(g, "#E4E4E4", x, 2, 1, 1), rect(g, "#E4E4E4", x, h - 3, 1, 1);
      rect(g, "#DADADA", 6, 6, w - 12, h - 12);
      rect(g, "#ffffff", 7, 7, w - 14, h - 14);
      rect(g, "#C4C4C4", w / 2 - 2, h / 2 - 1, 4, 2);
      rect(g, "#C4C4C4", w / 2 - 1, h / 2 - 2, 2, 4);
    } else {
      for (let y = 3; y < h - 3; y += 4) rect(g, "#D6D6D6", 2, y, w - 4, 2);
    }
    // fringe
    for (let y = 1; y < h - 1; y += 2) rect(g, "#BDBDBD", 0, y, 1, 1), rect(g, "#BDBDBD", w - 1, y, 1, 1);
  }, true, 0, true);
}

// ─────────────────────────────────────────────── department walls (pixel-native, ~96×56)

export type WallKind = "swot" | "competitors" | "money" | "personas" | "prices" | "map" | "rules" | "code" | "growth" | "vacant";

export function deptWallTex(kind: WallKind, color: string): THREE.CanvasTexture {
  return canvasTex(`px:wall:${kind}:${color}`, 96, 56, (g, w, h) => {
    const r = rng(kind.length * 97 + 5);
    const soft = mix(color, "#ffffff", 0.55);
    const deep = mix(color, INK, 0.25);
    rect(g, PAPER, 0, 0, w, h);
    switch (kind) {
      case "swot": {
        // a 2×2 whiteboard grid: S W / O T, a few marker lines and sticky notes per quadrant
        const labels = ["S", "W", "O", "T"];
        const tones = ["#22A06B", "#E5484D", color, "#F59E0B"];
        for (let i = 0; i < 4; i++) {
          const x = 4 + (i % 2) * 46, y = 4 + Math.floor(i / 2) * 25;
          rect(g, "#ffffff", x, y, 42, 22);
          pxText(g, labels[i]!, x + 3, y + 3, tones[i]!, 1);
          for (let k = 0; k < 3; k++) rect(g, "#9AA0A8", x + 11, y + 4 + k * 5, 10 + Math.floor(r() * 16), 1);
          const n = 1 + Math.floor(r() * 2);
          for (let k = 0; k < n; k++) panel(g, k ? "#FFE58A" : soft, "#00000022", x + 28 + k * 6, y + 12 - k * 3, 8, 7);
        }
        rect(g, "#C9CDD3", 48, 2, 1, h - 4);
        rect(g, "#C9CDD3", 2, 28, w - 4, 1);
        break;
      }
      case "competitors": {
        // a pinned wall of competitor cards: blank pixel logo, two text lines, a price-tag shape; red string links
        rect(g, "#D9C3A0", 0, 0, w, h); // cork
        for (let i = 0; i < 40; i++) rect(g, r() < 0.5 ? "#CBB28C" : "#E2CFAE", Math.floor(r() * w), Math.floor(r() * h), 1, 1);
        const pts: Array<[number, number]> = [];
        for (let i = 0; i < 6; i++) {
          const x = 5 + (i % 3) * 31, y = 5 + Math.floor(i / 3) * 26;
          panel(g, "#ffffff", "#B8B2A6", x, y, 26, 21);
          const lc = ["#3B82F6", "#E5484D", "#22A06B", "#F59E0B", "#8B7CF6", "#475569"][i]!;
          rect(g, lc, x + 3, y + 3, 7, 7);
          rect(g, "#ffffff", x + 5, y + 5, 3, 3);
          rect(g, "#5B6270", x + 12, y + 4, 10, 1);
          rect(g, "#A3A9B2", x + 12, y + 7, 8, 1);
          rect(g, "#A3A9B2", x + 3, y + 13, 18, 1);
          // price tag
          rect(g, i === 4 ? color : "#E9E3D6", x + 15, y + 15, 8, 4);
          rect(g, i === 4 ? color : "#E9E3D6", x + 14, y + 16, 1, 2);
          rect(g, "#E5484D", x + 12, y - 1, 2, 2); // pin
          pts.push([x + 13, y]);
        }
        g.fillStyle = "#E5484D";
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, ay] = pts[i]!, [bx, by] = pts[i + 1]!;
          const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
          for (let s = 0; s <= n; s += 2) g.fillRect(Math.round(ax + ((bx - ax) * s) / n), Math.round(ay + ((by - ay) * s) / n + Math.sin((s / n) * Math.PI) * 3), 1, 1);
        }
        break;
      }
      case "money": {
        // a market-size board: stacked coin columns + a rising curve (shapes only)
        rect(g, "#ffffff", 3, 3, w - 6, h - 6);
        for (let i = 0; i < 6; i++) {
          const hh = 6 + i * 6 + Math.floor(r() * 3);
          for (let k = 0; k < hh; k += 3) {
            rect(g, i === 5 ? color : "#E6B94F", 8 + i * 9, h - 8 - k - 2, 7, 2);
            rect(g, "#B98A2A", 8 + i * 9, h - 8 - k, 7, 1);
          }
        }
        let py = h - 12;
        for (let x = 62; x < w - 6; x++) {
          const y = Math.round(h - 12 - Math.pow((x - 62) / (w - 68), 1.6) * 34);
          rect(g, color, x, Math.min(py, y), 1, Math.abs(py - y) + 1);
          py = y;
        }
        rect(g, "#C9CDD3", 60, h - 8, w - 66, 1);
        rect(g, "#0AC18E", w - 9, 9, 3, 3);
        break;
      }
      case "personas": {
        // three customer persona cards (pixel faces), with need / habit lines
        const skins = ["#F1C6A4", "#8D5B3E", "#D9A27C"], hairs = ["#3A2619", "#141110", "#C4562B"];
        for (let i = 0; i < 3; i++) {
          const x = 4 + i * 31;
          panel(g, "#ffffff", "#C9CDD3", x, 5, 28, 46);
          rect(g, soft, x + 1, 6, 26, 18);
          rect(g, skins[i]!, x + 10, 10, 8, 9);
          rect(g, hairs[i]!, x + 9, 8, 10, 3);
          rect(g, INK, x + 12, 14, 1, 1);
          rect(g, INK, x + 15, 14, 1, 1);
          rect(g, deep, x + 8, 20, 12, 4);
          for (let k = 0; k < 4; k++) rect(g, k === 0 ? color : "#A3A9B2", x + 4, 28 + k * 5, 8 + Math.floor(r() * 14), 1);
        }
        break;
      }
      case "prices": {
        // price tags on a rail: one highlighted in the dept colour, a "sweet spot" bracket
        rect(g, "#ffffff", 3, 3, w - 6, h - 6);
        rect(g, "#9AA0A8", 6, 12, w - 12, 1);
        for (let i = 0; i < 5; i++) {
          const x = 9 + i * 17, y = 15 + (i % 2) * 5;
          const c = i === 2 ? color : "#ECE6DA";
          rect(g, c, x + 2, y, 10, 14);
          rect(g, c, x, y + 2, 14, 10);
          rect(g, "#ffffff", x + 6, y + 3, 2, 2);
          rect(g, i === 2 ? "#ffffff" : "#8A909A", x + 3, y + 8, 8, 1);
          rect(g, i === 2 ? "#ffffff" : "#8A909A", x + 4, y + 10, 6, 1);
          rect(g, "#9AA0A8", x + 6, 12, 1, y - 12);
        }
        rect(g, color, 38, 42, 22, 1);
        rect(g, color, 38, 38, 1, 5);
        rect(g, color, 59, 38, 1, 5);
        break;
      }
      case "map": {
        // a pixel city map: blocks, a river, a metro line with stations and dept-colour pins
        rect(g, "#EDEAE2", 3, 3, w - 6, h - 6);
        for (let y = 6; y < h - 6; y += 8) for (let x = 6; x < w - 6; x += 10) if (r() < 0.82) rect(g, r() < 0.3 ? "#D7E5C8" : "#DAD5CB", x, y, 8, 6);
        for (let x = 3; x < w - 3; x++) rect(g, "#A9CBE6", x, Math.round(34 + Math.sin(x / 9) * 4), 1, 3);
        for (let x = 10; x < w - 10; x++) rect(g, "#E5484D", x, 18, 1, 1);
        for (let k = 0; k < 6; k++) panel(g, "#ffffff", "#E5484D", 12 + k * 14, 16, 5, 5);
        for (const [x, y] of [[26, 12], [54, 27], [70, 9]] as const) {
          rect(g, color, x, y, 5, 5);
          rect(g, color, x + 2, y + 5, 1, 3);
          rect(g, "#ffffff", x + 2, y + 2, 1, 1);
        }
        break;
      }
      case "rules": {
        // documents with checkboxes and an approval stamp
        for (let i = 0; i < 3; i++) {
          const x = 6 + i * 30, y = 5 + (i % 2) * 3;
          panel(g, "#ffffff", "#C9CDD3", x, y, 26, 44);
          for (let k = 0; k < 5; k++) {
            panel(g, k < 3 - i + 1 ? soft : "#ffffff", "#8A909A", x + 3, y + 5 + k * 7, 4, 4);
            if (k < 3 - i + 1) rect(g, deep, x + 4, y + 6 + k * 7, 2, 2);
            rect(g, "#A3A9B2", x + 9, y + 6 + k * 7, 12 - (k % 2) * 4, 1);
          }
        }
        // stamp
        rect(g, "#E5484D", 70, 36, 18, 1);
        rect(g, "#E5484D", 70, 47, 18, 1);
        rect(g, "#E5484D", 70, 36, 1, 12);
        rect(g, "#E5484D", 87, 36, 1, 12);
        pxGlyph(g, "spark", 75, 38, 1, "#E5484D");
        break;
      }
      case "code": {
        // a terminal: dark, coloured code lines, a cursor
        rect(g, "#121A28", 0, 0, w, h);
        rect(g, "#1C2638", 0, 0, w, 5);
        for (const [i, c] of [[0, "#FF5F57"], [1, "#FEBC2E"], [2, "#28C840"]] as const) rect(g, c, 3 + i * 4, 1, 2, 2);
        for (let k = 0; k < 9; k++) {
          const ind = [0, 4, 4, 8, 8, 4, 0, 4, 0][k]!;
          rect(g, "#3A4560", 3, 8 + k * 5, 4, 1);
          rect(g, k % 3 === 1 ? color : k % 3 === 2 ? "#9BE2C8" : "#C9D1DE", 10 + ind, 8 + k * 5, 10 + Math.floor(r() * 30), 1);
          if (r() < 0.5) rect(g, "#F2C04A", 30 + ind + Math.floor(r() * 30), 8 + k * 5, 6, 1);
        }
        rect(g, "#ffffff", 14, 53, 3, 1);
        break;
      }
      case "growth": {
        // how far it can grow: room → floor → building → district as four pixel steps, a dotted path
        rect(g, "#ffffff", 3, 3, w - 6, h - 6);
        const steps = [[8, 6], [28, 12], [50, 22], [72, 34]] as const;
        steps.forEach(([x, hh], i) => {
          rect(g, i < 3 ? color : "#E1E3E7", x, h - 8 - hh, 16, hh);
          for (let yy = h - 8 - hh + 2; yy < h - 10; yy += 4) for (let xx = x + 2; xx < x + 14; xx += 4) rect(g, i < 3 ? mix(color, "#ffffff", 0.5) : "#ffffff", xx, yy, 2, 2);
        });
        for (let x = 10; x < 86; x += 3) rect(g, "#9AA0A8", x, Math.round(h - 18 - (x - 10) * 0.42), 1, 1);
        rect(g, "#C9CDD3", 4, h - 8, w - 8, 1);
        break;
      }
      case "vacant":
      default: {
        rect(g, "#ffffff", 3, 3, w - 6, h - 6);
        pxText(g, "HIRING", w / 2, h / 2 - 4, "#B9BCC2", 1, "center");
        break;
      }
    }
    // frame shadow line (bottom/right) so the board reads as an object
    rect(g, "#00000014", 0, h - 1, w, 1);
    rect(g, "#00000014", w - 1, 0, 1, h);
  }, true, 0, true);
}

// ─────────────────────────────────────────────── bedroom posters / window

export function posterTex(kind: "rocket" | "ship" | "plant" | "cards" | "bch"): THREE.CanvasTexture {
  return canvasTex(`px:poster:${kind}`, 24, 32, (g, w, h) => {
    if (kind === "rocket") {
      rect(g, "#243B6B", 0, 0, w, h);
      for (const [x, y] of [[3, 4], [18, 7], [6, 20], [20, 24], [12, 2]] as const) rect(g, "#FFE9A8", x, y, 1, 1);
      rect(g, "#F4F1EA", 10, 8, 4, 12);
      rect(g, "#F4F1EA", 11, 6, 2, 2);
      rect(g, "#E5484D", 10, 7, 4, 2);
      rect(g, "#7FB2FF", 11, 11, 2, 2);
      rect(g, "#E5484D", 8, 17, 2, 4);
      rect(g, "#E5484D", 14, 17, 2, 4);
      rect(g, "#F59E0B", 11, 20, 2, 3);
      rect(g, "#FFE58A", 11, 23, 2, 2);
      rect(g, "#ffffff", 0, 28, w, 4);
      rect(g, "#243B6B", 8, 29, 8, 2);
    } else if (kind === "ship") {
      rect(g, "#F4D35E", 0, 0, w, h);
      pxText(g, "SHIP", 12, 6, INK, 1, "center");
      pxText(g, "IT", 12, 16, INK, 1, "center");
      rect(g, INK, 4, 26, 16, 1);
    } else if (kind === "plant") {
      rect(g, "#E9F1E4", 0, 0, w, h);
      rect(g, "#C98463", 8, 22, 8, 7);
      rect(g, "#3E6E4B", 11, 10, 2, 12);
      rect(g, "#527F55", 6, 12, 5, 3);
      rect(g, "#6E9A66", 13, 8, 5, 3);
      rect(g, "#3E6E4B", 7, 17, 4, 2);
      rect(g, "#6E9A66", 13, 15, 5, 2);
    } else if (kind === "bch") {
      rect(g, "#0AC18E", 0, 0, w, h);
      rect(g, "#ffffff", 6, 8, 12, 14);
      rect(g, "#0AC18E", 9, 11, 6, 3);
      rect(g, "#0AC18E", 9, 16, 6, 3);
      rect(g, "#ffffff", 10, 6, 2, 2);
      rect(g, "#ffffff", 13, 22, 2, 2);
    } else {
      rect(g, "#F4F1EA", 0, 0, w, h);
      for (let i = 0; i < 4; i++) panel(g, ["#FFE58A", "#FFB8A3", "#A8DDC4", "#C9C2F8"][i]!, "#00000022", 2 + (i % 2) * 11, 3 + Math.floor(i / 2) * 14, 9, 11);
    }
    rect(g, "#00000022", 0, h - 1, w, 1);
  }, true, 0, true);
}

/** City skyline for the bedroom window: dark silhouettes (alpha) with lit windows in a separate mask. */
export function skylineTex(lit: boolean): THREE.CanvasTexture {
  return canvasTex(`px:skyline:${lit ? 1 : 0}`, 48, 32, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = rng(77);
    let x = 0;
    while (x < w) {
      const bw = 5 + Math.floor(r() * 7);
      const bh = 8 + Math.floor(r() * 16);
      if (!lit) rect(g, r() < 0.5 ? "#4A5568" : "#3D4656", x, h - bh, bw, bh);
      else
        for (let yy = h - bh + 2; yy < h - 1; yy += 3)
          for (let xx = x + 1; xx < x + bw - 1; xx += 2) if (r() < 0.38) rect(g, r() < 0.8 ? "#FFD27A" : "#BFE3FF", xx, yy, 1, 1);
      x += bw + (r() < 0.3 ? 1 : 0);
    }
  }, true, 0, true);
}

/** Cork board texture (bedroom pinboard). */
export function corkTex(): THREE.CanvasTexture {
  return canvasTex("px:cork", 32, 24, (g, w, h) => {
    const r = rng(9);
    rect(g, "#D2B48A", 0, 0, w, h);
    for (let i = 0; i < 60; i++) rect(g, r() < 0.5 ? "#C4A276" : "#DFC59F", Math.floor(r() * w), Math.floor(r() * h), 1, 1);
  }, true, 0, true);
}

/** Laptop screen (pixel UI): dark, a sidebar and a few bars in the accent. */
export function laptopScreenTex(color: string): THREE.CanvasTexture {
  return canvasTex(`px:laptop:${color}`, 32, 20, (g, w, h) => {
    rect(g, "#162033", 0, 0, w, h);
    rect(g, "#1F2B42", 0, 0, 7, h);
    for (let i = 0; i < 4; i++) rect(g, i === 1 ? color : "#3A4560", 2, 3 + i * 4, 3, 1);
    rect(g, "#E6EAF0", 10, 3, 14, 2);
    for (let i = 0; i < 4; i++) rect(g, i === 2 ? color : "#556078", 10, 8 + i * 3, 8 + ((i * 7) % 12), 1);
  }, true, 0, true);
}

// ─────────────────────────────────────────────── the company sign (dynamic, one canvas per model)

/**
 * A redrawable pixel canvas texture (company sign, pinboard note). Never cached: each model owns its own and calls
 * `draw()` again on setSign; the texture is flagged for upload.
 */
export class PixelCanvas {
  readonly canvas = document.createElement("canvas");
  readonly tex: THREE.CanvasTexture;
  constructor(w: number, h: number, nearest: boolean) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
    this.tex.minFilter = nearest ? THREE.NearestMipmapLinearFilter : THREE.LinearMipmapLinearFilter;
    this.tex.anisotropy = 4;
  }
  draw(fn: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
    const g = this.canvas.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    fn(g, this.canvas.width, this.canvas.height);
    this.tex.needsUpdate = true;
  }
  dispose() {
    this.tex.dispose();
  }
}

/** Readable brand ink on the sign background (pick black or white for contrast). */
function inkOn(bg: string) {
  col.set(bg);
  const l = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b; // linear
  return l > 0.32 ? INK : "#FFFFFF";
}

/**
 * Lobby wall sign, 128×40 px. brand: a backlit panel in the brand colour, glyph + name in pixel caps (2× when it
 * fits), optional tagline. draft: a kraft-paper card taped to the wall, "WORKING TITLE" kicker + the working name.
 */
export function drawLobbySign(g: CanvasRenderingContext2D, w: number, h: number, s: CompanySign) {
  if (s.kind === "brand") {
    const bg = s.color || "#1E2229";
    const ink = inkOn(bg);
    rect(g, mix(bg, INK, 0.45), 0, 0, w, h);
    rect(g, bg, 2, 2, w - 4, h - 4);
    // a 1-px inner bevel: light top, dark bottom
    rect(g, mix(bg, "#ffffff", 0.25), 2, 2, w - 4, 1);
    rect(g, mix(bg, INK, 0.25), 2, h - 3, w - 4, 1);
    const name = s.name.trim() || "Your idea";
    const tag = s.tagline && pxTextWidth(s.tagline) <= w - 16 ? s.tagline : "";
    const hasGlyph = !!(s.glyph && s.glyph !== "none");
    let sc = 2;
    const gw = hasGlyph ? 9 * sc + 5 : 0;
    if (pxTextWidth(name, 2) + gw > w - 12) sc = 1;
    const gw1 = hasGlyph ? 9 * sc + 4 : 0;
    const tw = pxTextWidth(name, sc);
    const total = gw1 + tw;
    const x0 = Math.round((w - total) / 2);
    const blockH = 7 * sc + (tag ? 10 : 0);
    const y0 = Math.round((h - blockH) / 2);
    if (hasGlyph) pxGlyph(g, s.glyph, x0, y0 + Math.round((7 * sc - 9 * sc) / 2) + (sc === 2 ? 0 : 0), sc, ink);
    pxText(g, name, x0 + gw1, y0, ink, sc);
    if (tag) pxText(g, tag, w / 2, y0 + 7 * sc + 4, mix(ink, bg, 0.3), 1, "center");
  } else {
    const kraft = "#D8B98C";
    rect(g, "#00000000", 0, 0, w, h);
    rect(g, mix(kraft, INK, 0.25), 3, 4, w - 6, h - 7);
    rect(g, kraft, 3, 3, w - 6, h - 7);
    rect(g, "#E6CDA6", 3, 3, w - 6, 1);
    // tape strips
    rect(g, "#F3EEDD", 8, 1, 14, 5);
    rect(g, "#F3EEDD", w - 22, 1, 14, 5);
    pxText(g, "WORKING TITLE", w / 2, 9, mix(INK, kraft, 0.45), 1, "center");
    const name = s.name.trim() || "Your idea";
    const sc = pxTextWidth(name, 2) <= w - 14 ? 2 : 1;
    pxText(g, name, w / 2, sc === 2 ? 20 : 22, INK, sc, "center");
  }
}

/** Bedroom pinboard note, 48×32 px: an index card with the working title (wrapped) and a pin. */
export function drawPinNote(g: CanvasRenderingContext2D, w: number, h: number, s: CompanySign) {
  const paper = s.kind === "brand" ? "#FFFFFF" : "#FFF6C9";
  rect(g, "#0000002A", 2, 2, w - 2, h - 2);
  rect(g, paper, 0, 0, w - 2, h - 2);
  rect(g, s.kind === "brand" ? s.color : "#E5484D", 0, 0, w - 2, 2);
  rect(g, "#E5484D", Math.round(w / 2) - 2, 3, 3, 3);
  rect(g, "#B3262B", Math.round(w / 2) - 1, 6, 1, 1);
  const name = s.name.trim() || "Your idea";
  let lines = pxWrap(name, w - 8);
  if (lines.length > 3) lines = lines.slice(0, 3);
  const y0 = Math.round(9 + (3 - lines.length) * 4);
  const hasGlyph = s.kind === "brand" && !!(s.glyph && s.glyph !== "none");
  lines.forEach((ln, i) => pxText(g, ln, (w - 2) / 2 + (hasGlyph && i === 0 ? 6 : 0), y0 + i * 8, INK, 1, "center"));
  if (hasGlyph) pxGlyph(g, s.glyph, Math.round((w - 2) / 2 - pxTextWidth(lines[0]!) / 2 - 7), y0 - 1, 1, s.color);
}
