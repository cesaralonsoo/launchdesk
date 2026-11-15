// WS-OFFICE · rooms/d-kit.ts — designer D's local kit for the front rooms (lobby, nova, dex, launch):
// pixel-native canvas textures (cached per colour) and a few small pieces the four rooms share.
// Honesty rule (pixel.ts): wall art never shows numbers, names, quotes or URLs — only shapes and tiny labels.
import * as THREE from "three";
import { pxText, pxTextWidth } from "../pixel";
import { canvasTex } from "../textures";
import { C, fx, mixHex, shadowRound, type Ctx, type P3 } from "./common";

// ─────────────────────────────────────────────── pixel helpers

type G = CanvasRenderingContext2D;
const rect = (g: G, c: string, x: number, y: number, w: number, h: number) => {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
};
const panel = (g: G, fill: string, line: string, x: number, y: number, w: number, h: number) => {
  rect(g, line, x, y, w, h);
  rect(g, fill, x + 1, y + 1, w - 2, h - 2);
};
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const INK = "#1E2229";
const PAPER = "#F4F1EA";
export const mix = (a: string, b: string, k: number) => mixHex(a, b, k);
/** Pixel-native texture (nearest in the pixel styles, 4× upscaled in clean). */
const ptex = (key: string, w: number, h: number, draw: (g: G, w: number, h: number) => void) => canvasTex(`d:${key}`, w, h, draw, true, 0, true);

// ─────────────────────────────────────────────── lobby

/** Door mat: "HELLO" in cream on the room colour. */
export const welcomeMatTex = (color: string) =>
  ptex(`mat:${color}`, 40, 20, (g, w, h) => {
    rect(g, mix(color, INK, 0.35), 0, 0, w, h);
    rect(g, mix(color, "#ffffff", 0.15), 2, 2, w - 4, h - 4);
    rect(g, mix(color, INK, 0.2), 3, 3, w - 6, h - 6);
    pxText(g, "HELLO", w / 2, 7, "#F6F0E2", 1, "center");
  });

/** Desk name plate: "CEO". */
export const nameplateTex = (color: string) =>
  ptex(`plate:${color}`, 24, 9, (g, w, h) => {
    rect(g, INK, 0, 0, w, h);
    rect(g, color, 0, h - 1, w, 1);
    pxText(g, "CEO", w / 2, 1, "#F2D9A0", 1, "center");
  });

/** Framed "milestones": three little badges (first sale, a star, a heart). */
export const milestonesTex = (color: string) =>
  ptex(`miles:${color}`, 36, 16, (g, w, h) => {
    rect(g, PAPER, 0, 0, w, h);
    const soft = mix(color, "#ffffff", 0.6);
    for (let i = 0; i < 3; i++) {
      const x = 2 + i * 11;
      panel(g, i === 1 ? soft : "#ffffff", "#CFC8BA", x, 2, 10, 12);
    }
    // a coin
    rect(g, "#E6B94F", 5, 5, 4, 6);
    rect(g, "#C9962F", 6, 6, 2, 4);
    // a star
    const sx = 16, sy = 4;
    for (const [x, y] of [[2, 0], [1, 2], [2, 2], [3, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [1, 4], [2, 4], [3, 4], [1, 5], [3, 5], [0, 6], [4, 6]] as const) rect(g, color, sx + x, sy + y, 1, 1);
    // a heart
    const hx = 26, hy = 5;
    for (const [x, y] of [[0, 0], [1, 0], [3, 0], [4, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]] as const) rect(g, "#E5484D", hx + x, hy + y, 1, 2);
  });

// ─────────────────────────────────────────────── nova

/** Type specimen poster: a huge "Aa", a weight ladder and a colour strip. */
export const typeSpecTex = (color: string) =>
  ptex(`type:${color}`, 32, 40, (g, w, h) => {
    rect(g, "#FBF7F2", 0, 0, w, h);
    pxText(g, "AA", w / 2, 4, INK, 2, "center");
    rect(g, color, 5, 20, w - 10, 1);
    for (let i = 0; i < 4; i++) rect(g, i === 0 ? INK : "#B9B2AA", 5, 24 + i * 3, 22 - i * 4, i === 0 ? 2 : 1);
    const sw = [color, mix(color, "#ffffff", 0.45), "#2B2622", "#E9C9A6"];
    sw.forEach((c, i) => rect(g, c, 5 + i * 6, 35, 5, 3));
  });

/** Name-ideas board (whiteboard): sticky notes with scribbles, one circled in the brand colour. */
export const namesBoardTex = (color: string) =>
  ptex(`names:${color}`, 48, 28, (g, w, h) => {
    rect(g, "#FDFDFB", 0, 0, w, h);
    const r = rng(41);
    const notes = ["#FFE58A", mix(color, "#ffffff", 0.55), "#A8DDC4", "#FFE58A", "#C9C2F8", mix(color, "#ffffff", 0.55), "#FFE58A", "#A8DDC4"];
    notes.forEach((n, i) => {
      const x = 3 + (i % 4) * 11, y = 3 + Math.floor(i / 4) * 12;
      panel(g, n, "#00000022", x, y, 9, 9);
      rect(g, "#5B6270", x + 2, y + 3, 3 + Math.floor(r() * 4), 1);
      rect(g, "#8B919A", x + 2, y + 5, 2 + Math.floor(r() * 4), 1);
    });
    // the chosen one: a marker ring around note #5
    g.fillStyle = color;
    const cx = 3 + 1 * 11 + 4, cy = 3 + 12 + 4;
    for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 2;
      g.fillRect(Math.round(cx + Math.cos(t) * 7), Math.round(cy + Math.sin(t) * 6.5), 1, 1);
    }
    rect(g, color, 40, 24, 6, 1);
  });

/** Easel canvas: the brand mark being painted (big glyph-ish shape in the brand colour). */
export const brandCanvasTex = (color: string) =>
  ptex(`bcanvas:${color}`, 24, 20, (g, w, h) => {
    rect(g, "#FBFAF7", 0, 0, w, h);
    const soft = mix(color, "#ffffff", 0.5);
    // a rounded arch mark + a wordmark bar
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 12; x++) {
        const dx = x - 5.5, dy = y - 8;
        if (dx * dx + dy * dy < 36 && dx * dx + dy * dy > 6) rect(g, color, 6 + x, 2 + y, 1, 1);
      }
    rect(g, color, 6, 10, 2, 2);
    rect(g, color, 16, 10, 2, 2);
    rect(g, INK, 5, 14, 14, 2);
    rect(g, soft, 7, 17, 10, 1);
    // a paint splash
    rect(g, soft, 2, 2, 2, 1);
    rect(g, soft, 1, 3, 3, 2);
  });

// ─────────────────────────────────────────────── dex

/** The website mockup: browser chrome, hero headline + button, an image, three cards. Glows (screen). */
export const websiteTex = (color: string) =>
  ptex(`site:${color}`, 64, 40, (g, w, h) => {
    rect(g, "#FFFFFF", 0, 0, w, h);
    rect(g, "#E9EBEE", 0, 0, w, 5);
    rect(g, "#FF6159", 2, 2, 1, 1);
    rect(g, "#FFBD2E", 4, 2, 1, 1);
    rect(g, "#28C941", 6, 2, 1, 1);
    rect(g, "#FFFFFF", 12, 1, 36, 3);
    // nav
    rect(g, color, 3, 8, 4, 4);
    for (let i = 0; i < 3; i++) rect(g, "#9AA0A8", 40 + i * 7, 9, 5, 1);
    // hero
    const soft = mix(color, "#ffffff", 0.82);
    rect(g, soft, 0, 14, w, 15);
    rect(g, INK, 4, 17, 26, 2);
    rect(g, INK, 4, 20, 18, 2);
    rect(g, "#8B919A", 4, 23, 22, 1);
    rect(g, color, 4, 25, 10, 3);
    // hero image
    rect(g, mix(color, "#ffffff", 0.35), 38, 16, 22, 11);
    rect(g, "#ffffff", 45, 19, 6, 5);
    rect(g, color, 47, 21, 2, 1);
    // cards
    for (let i = 0; i < 3; i++) {
      panel(g, "#ffffff", "#DADDE2", 3 + i * 20, 31, 18, 8);
      rect(g, i === 1 ? color : "#C9CDD3", 5 + i * 20, 33, 4, 4);
      rect(g, "#9AA0A8", 11 + i * 20, 34, 7, 1);
    }
  });

/** Wireframe storyboard (glass board): three phone frames with boxes + arrows. */
export const wireframeTex = (color: string) =>
  ptex(`wire:${color}`, 48, 28, (g, w, h) => {
    rect(g, "#FDFDFB", 0, 0, w, h);
    for (let i = 0; i < 3; i++) {
      const x = 3 + i * 16;
      panel(g, "#ffffff", "#5B6270", x, 2, 11, 22);
      rect(g, i === 1 ? color : "#C9CDD3", x + 2, 5, 7, 5);
      rect(g, "#9AA0A8", x + 2, 12, 7, 1);
      rect(g, "#9AA0A8", x + 2, 14, 5, 1);
      rect(g, i === 2 ? color : "#C9CDD3", x + 2, 18, 7, 3);
      if (i < 2) {
        rect(g, color, x + 12, 12, 3, 1);
        rect(g, color, x + 14, 11, 1, 3);
      }
    }
    rect(g, "#FFE58A", 38, 22, 7, 5);
  });

/** Logo sketch on the drafting table: three pencil roughs + the chosen mark. */
export const sketchTex = (color: string) =>
  ptex(`sketch:${color}`, 32, 22, (g, w, h) => {
    rect(g, "#FBFAF5", 0, 0, w, h);
    g.fillStyle = "#6B7079";
    for (let a = 0; a < 24; a++) {
      const t = (a / 24) * Math.PI * 2;
      g.fillRect(Math.round(7 + Math.cos(t) * 4), Math.round(7 + Math.sin(t) * 4), 1, 1);
    }
    rect(g, "#6B7079", 15, 3, 8, 1);
    rect(g, "#6B7079", 15, 10, 8, 1);
    rect(g, "#6B7079", 15, 3, 1, 8);
    rect(g, "#6B7079", 22, 3, 1, 8);
    // chosen: arch in colour
    for (let y = 0; y < 6; y++)
      for (let x = 0; x < 9; x++) {
        const dx = x - 4, dy = y - 5.5;
        if (dx * dx + dy * dy < 20 && dx * dx + dy * dy > 4) rect(g, color, 11 + x, 13 + y, 1, 1);
      }
    rect(g, color, 11, 18, 2, 1);
    rect(g, color, 18, 18, 2, 1);
    rect(g, "#6B7079", 3, 19, 6, 1);
  });

// ─────────────────────────────────────────────── launch

/** "LIVE" lamp face: white caps on red. Glows at night. */
export const liveSignTex = () =>
  ptex("live", 28, 11, (g, w, h) => {
    rect(g, "#C9302C", 0, 0, w, h);
    rect(g, "#E5484D", 1, 1, w - 2, h - 2);
    rect(g, "#FFFFFF", 3, 4, 3, 3);
    pxText(g, "LIVE", 8 + pxTextWidth("LIVE") / 2, 2, "#FFFFFF", 1, "center");
  });

/** Pip's big screen: the site is live — a mini site, a big green "live" bar, an uptime pulse line. */
export const liveSiteTex = (color: string) =>
  ptex(`livesite:${color}`, 48, 30, (g, w, h) => {
    rect(g, "#0C121C", 0, 0, w, h);
    // the published site in a frame
    rect(g, "#FFFFFF", 3, 3, 26, 18);
    rect(g, "#E9EBEE", 3, 3, 26, 3);
    rect(g, color, 5, 8, 12, 2);
    rect(g, "#9AA0A8", 5, 11, 16, 1);
    rect(g, "#0AC18E", 5, 14, 6, 2);
    rect(g, mix(color, "#ffffff", 0.5), 19, 13, 8, 6);
    // status column
    rect(g, "#0AC18E", 32, 4, 4, 4);
    rect(g, "#2A3444", 38, 5, 7, 2);
    for (let i = 0; i < 3; i++) rect(g, "#2A3444", 32, 11 + i * 3, 13 - i * 3, 1);
    // pulse line
    let y = 25;
    for (let x = 3; x < w - 3; x++) {
      const k = x % 9;
      const ny = k === 4 ? 22 : k === 5 ? 27 : 25;
      rect(g, "#0AC18E", x, Math.min(y, ny), 1, Math.abs(ny - y) + 1);
      y = ny;
    }
  });

/** Hazard stripes (yellow / ink) for the go-live pedestal band. */
export const hazardTex = () =>
  ptex("hazard", 32, 4, (g, w, h) => {
    rect(g, "#F5C542", 0, 0, w, h);
    for (let x = -4; x < w; x += 6) for (let y = 0; y < h; y++) rect(g, INK, x + y, y, 3, 1);
  });

/** The product on the photo set: a little box with a label in the room colour. */
export const productTex = (color: string) =>
  ptex(`prod:${color}`, 12, 12, (g, w, h) => {
    rect(g, "#FBF7F0", 0, 0, w, h);
    rect(g, color, 0, 4, w, 4);
    rect(g, "#FFFFFF", 3, 5, 6, 2);
  });

/** Phone screen on the tripod: a framed shot of the product with a record dot. */
export const phoneTex = (color: string) =>
  ptex(`phone:${color}`, 10, 18, (g, w, h) => {
    rect(g, "#121722", 0, 0, w, h);
    rect(g, mix(color, "#ffffff", 0.4), 1, 3, 8, 11);
    rect(g, "#FBF7F0", 3, 7, 4, 5);
    rect(g, color, 3, 9, 4, 1);
    rect(g, "#E5484D", 4, 15, 2, 2);
  });

// ─────────────────────────────────────────────── small shared pieces

/** A round wooden stool (seat in `seat`), origin on the floor. */
export function stool(c: Ctx, parent: THREE.Object3D, pos: P3, h = 0.46, seat?: THREE.Material) {
  const { B } = c;
  const s = B.sub(pos, 0, parent);
  shadowRound(c, 0.24, [0, 0, 0], s, 0.22);
  B.cyl(0.17, 0.17, 0.05, seat ?? fx(c, C.oak, 0.55), [0, h, 0], 24, s);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = B.box(0.03, h, 0.03, fx(c, C.oakDark, 0.6), [Math.sin(a) * 0.11, h / 2, Math.cos(a) * 0.11], 0, s);
    leg.rotation.set(Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12);
  }
  return s;
}

/** Small potted succulent (desk-top size). */
export function succulent(c: Ctx, parent: THREE.Object3D, pos: P3, pot = C.terracotta) {
  const { B } = c;
  const s = B.sub(pos, 0.4, parent);
  B.box(0.08, 0.07, 0.08, fx(c, pot, 0.75), [0, 0.035, 0], 0, s);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    B.box(0.035, 0.06, 0.035, fx(c, i % 2 ? C.leafC : C.leafA, 0.62), [Math.sin(a) * 0.02, 0.1, Math.cos(a) * 0.02], 0, s).rotation.set(Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4);
  }
  return s;
}

/** A stack of books lying flat. */
export function bookStack(c: Ctx, parent: THREE.Object3D, pos: P3, colors: string[], rotY = 0) {
  const { B } = c;
  const s = B.sub(pos, rotY, parent);
  let y = 0;
  colors.forEach((col, i) => {
    const t = 0.035 + (i % 2) * 0.01;
    B.box(0.24 - i * 0.015, t, 0.17 - i * 0.01, fx(c, col, 0.7), [0, y + t / 2, 0], 0, s).rotation.y = (i % 2 ? 0.12 : -0.08);
    y += t;
  });
  return s;
}
