// WS-OFFICE · rooms/b-kit.ts — small helpers shared by designer B's themes (viability, demand, scalability).
// Local on purpose (common.ts belongs to the setup lead): sticky notes, a chunky stool, a canvas-texture shorthand
// and the few textures these three rooms paint. Honesty rule: shapes only, no numbers, names or quotes.
import * as THREE from "three";
import { canvasTex } from "../textures";
import { C, fx, mixHex, shadowRound, type Ctx, type P3 } from "./common";

export const NOTE = { yellow: "#FFE27A", pink: "#FFB3C7", green: "#9FE3B4", blue: "#A9D4FF", orange: "#FFC48A", lilac: "#CDBDFF" } as const;

/** A sticky note on a wall (faces +Z in `parent`'s frame), slightly tilted. */
export function note(c: Ctx, parent: THREE.Object3D, pos: P3, color: string, s = 0.11, tilt = 0) {
  const m = c.B.box(s, s, 0.008, fx(c, color, 0.9), pos, 0, parent, false);
  m.rotation.z = tilt;
  return m;
}

/** A sticky note lying flat on a surface. */
export function flatNote(c: Ctx, parent: THREE.Object3D, pos: P3, color: string, s = 0.12, rot = 0) {
  const m = c.B.box(s, 0.008, s, fx(c, color, 0.9), pos, 0, parent, false);
  m.rotation.y = rot;
  return m;
}

/** Tiny deterministic random (stable layouts per room). */
export function rnd(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Bar stool / pouf: accent seat on a metal stem. */
export function stool(c: Ctx, parent: THREE.Object3D, pos: P3, seat: THREE.Material, h = 0.5) {
  const { B } = c;
  const s = B.sub(pos, 0, parent);
  B.cyl(0.17, 0.16, 0.07, seat, [0, h, 0], 20, s);
  B.cyl(0.02, 0.02, h - 0.02, fx(c, C.metal, 0.4, 0.3), [0, (h - 0.02) / 2, 0], 8, s);
  B.cyl(0.13, 0.14, 0.02, fx(c, C.metal, 0.4, 0.3), [0, 0.01, 0], 16, s);
  shadowRound(c, 0.22, [0, 0, 0], s, 0.2);
  return s;
}

/** Thin rod between two points (chains, strings, crane cables). */
export function rod(c: Ctx, parent: THREE.Object3D, a: P3, b: P3, r: number, m: THREE.Material) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const mesh = c.B.cyl(r, r, len, m, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], 6, parent);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
  return mesh;
}

// ─────────────────────────────────────────────── textures (HD canvas; pixelated by canvasTex in the pixel styles)

type G = CanvasRenderingContext2D;
const rr = (g: G, x: number, y: number, w: number, h: number, r: number, fill: string) => {
  g.fillStyle = fill;
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
};
const line = (g: G, x0: number, y0: number, x1: number, y1: number, w: number, col: string) => {
  g.strokeStyle = col;
  g.lineWidth = w;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
};
const letter = (g: G, ch: string, x: number, y: number, size: number, col: string) => {
  g.fillStyle = col;
  g.font = `900 ${size}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
  g.textBaseline = "top";
  g.fillText(ch, x, y);
};

/** SWOT whiteboard: four tinted quadrants, a big letter each, marker scribbles. 2.2:1. */
export function swotTex(color: string) {
  return canvasTex(`b:swot:${color}`, 704, 320, (g, w, h) => {
    rr(g, 0, 0, w, h, 0, "#FBFBF8");
    const tones = ["#22A06B", "#E5484D", color, "#F59E0B"];
    const r = rnd(11);
    for (let i = 0; i < 4; i++) {
      const x = 14 + (i % 2) * (w / 2 - 7), y = 14 + Math.floor(i / 2) * (h / 2 - 7);
      const qw = w / 2 - 21, qh = h / 2 - 21;
      rr(g, x, y, qw, qh, 14, mixHex(tones[i]!, "#ffffff", 0.86));
      rr(g, x + 14, y + 14, 58, 58, 12, tones[i]!);
      letter(g, "SWOT"[i]!, x + 25, y + 18, 50, "#ffffff");
      for (let k = 0; k < 4; k++) line(g, x + 90, y + 30 + k * 26, x + 90 + 60 + r() * 110, y + 30 + k * 26, 6, mixHex(tones[i]!, "#3A3F47", 0.55));
    }
    line(g, w / 2, 20, w / 2, h - 20, 4, "#C9CDD3");
    line(g, 20, h / 2, w - 20, h / 2, 4, "#C9CDD3");
  }, true, 4);
}

/** Kill-criteria flip chart: accent header, five checkbox rows (four green ticks, one red cross). */
export function checklistTex(color: string) {
  return canvasTex(`b:kill:${color}`, 300, 380, (g, w, h) => {
    rr(g, 0, 0, w, h, 0, "#FFFFFF");
    rr(g, 22, 20, w - 44, 54, 12, color);
    line(g, 46, 47, 46 + 150, 47, 12, "#ffffff");
    const r = rnd(5);
    for (let i = 0; i < 5; i++) {
      const y = 100 + i * 54;
      rr(g, 28, y, 40, 40, 8, "#E9EBEE");
      if (i === 3) {
        line(g, 36, y + 8, 60, y + 32, 9, "#E5484D");
        line(g, 60, y + 8, 36, y + 32, 9, "#E5484D");
      } else {
        line(g, 34, y + 21, 45, y + 32, 9, "#22A06B");
        line(g, 45, y + 32, 64, y + 6, 9, "#22A06B");
      }
      line(g, 88, y + 20, 88 + 90 + r() * 90, y + 20, 8, i === 3 ? "#E5484D" : "#9AA0A8");
    }
  }, true, 4);
}

/** Growth panel behind the 3D bars: soft grid + the four scale icons (room → floor → building → district). */
export function growthTex(color: string) {
  return canvasTex(`b:growth:${color}`, 640, 300, (g, w, h) => {
    rr(g, 0, 0, w, h, 0, "#FFFFFF");
    for (let i = 1; i < 6; i++) line(g, 20, i * 44, w - 20, i * 44, 2, "#EEF0F3");
    for (let i = 1; i < 10; i++) line(g, i * 64, 18, i * 64, h - 60, 2, "#F2F3F5");
    line(g, 30, h - 58, w - 20, h - 58, 4, "#C9CDD3");
    // icons under the axis, growing left → right
    const deep = mixHex(color, "#1E2229", 0.2);
    const y = h - 14;
    rr(g, 70, y - 22, 22, 22, 4, mixHex(color, "#ffffff", 0.5));
    rr(g, 220, y - 26, 44, 26, 4, mixHex(color, "#ffffff", 0.35));
    rr(g, 380, y - 40, 30, 40, 4, mixHex(color, "#ffffff", 0.15));
    for (let i = 0; i < 4; i++) rr(g, 530 + i * 18, y - 18 - (i % 2) * 18 - i * 6, 14, 18 + (i % 2) * 18 + i * 6, 3, deep);
    line(g, 104, y - 11, 206, y - 11, 4, "#C9CDD3");
    line(g, 276, y - 11, 366, y - 11, 4, "#C9CDD3");
    line(g, 422, y - 11, 516, y - 11, 4, "#C9CDD3");
  }, true, 4);
}

/** Top of the city-diorama base: green tiles, roads, a few crossings. */
export function cityTex() {
  return canvasTex(`b:city`, 384, 256, (g, w, h) => {
    rr(g, 0, 0, w, h, 0, "#CFE6C4");
    const road = "#9EA4AD";
    for (const x of [96, 224, 330]) rr(g, x - 9, 0, 18, h, 0, road);
    for (const y of [80, 180]) rr(g, 0, y - 9, w, 18, 0, road);
    g.setLineDash([8, 8]);
    for (const x of [96, 224, 330]) line(g, x, 0, x, h, 2, "#F4F3EF");
    for (const y of [80, 180]) line(g, 0, y, w, y, 2, "#F4F3EF");
  }, true, 4);
}
