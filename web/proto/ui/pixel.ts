// v7 · Pixel glyphs for the UI (WS-EXP): the four world levels and the analyst badges, drawn on the same 8 × 8 grid
// as the logo so the chrome speaks the world's pixel language. One colour each (currentColor).
import type { WorldLevel } from "../contracts";

const LEVEL_GRID: Record<WorldLevel, string[]> = {
  0: ["........", "........", "...XX...", "..XXXX..", ".XXXXXX.", "..X..X..", "..X.XX..", "..XXXX.."], // a little room
  1: ["........", "........", "........", "XXXXXXXX", "X.X.X.XX", "XXXXXXXX", "X......X", "........"], // one floor
  2: ["..XXXX..", "..X.XX..", "..XXXX..", "..XX.X..", "..XXXX..", "..X.XX..", "..XXXX..", "..XX.X.."], // a tower
  3: ["....XX..", "....XX..", ".XX.XX..", ".XX.XX.X", ".XX.XXXX", "XXXXXXXX", "XXXXXXXX", "........"], // a district
};

export function pixGrid(grid: string[], size: number, extra = ""): string {
  let r = "";
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== "X") { x++; continue; }
      let w = 1;
      while (row[x + w] === "X") w++;
      r += `<rect x="${x}" y="${y}" width="${w}" height="1"/>`;
      x += w;
    }
  });
  return `<svg class="px" width="${size}" height="${size}" viewBox="0 0 8 8" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"${extra}>${r}</svg>`;
}

export const levelGlyph = (l: WorldLevel, size = 16) => pixGrid(LEVEL_GRID[l], size);

/** Analyst / specialist badge: a square pixel tile in their colour with the initial in the pixel face. */
export const badge = (name: string, color: string, size = 30) =>
  `<span class="pxav" style="--c:${color};--s:${size}px" aria-hidden="true"><span>${name[0] ?? "?"}</span></span>`;
