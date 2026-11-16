// WP2 · Lockups composed in code from a linted 64×64 symbol and the brand's display face. Shared by the server (WP1's
// site renders the chosen logo at serve time) and the browser picker. Pure module: no DOM, no Node APIs.
//
// Variants: "horizontal" (symbol + name), "stacked" (symbol over name), "word" (name only), "icon" (symbol on a
// rounded tile: app icon, avatar, favicon). `dark: true` swaps the ink and the background so it sits on a dark page.
import { casedName, estimateWidthEm, fontStack, googleFontsHref, wordStyleFor, type WordStyle } from "./fonts.js";

export interface LogoPalette { primary: string; accent: string; bg: string; ink: string }
export type Layout = "horizontal" | "stacked" | "word" | "icon";
export interface LockupOpts {
  name: string;
  palette: LogoPalette;
  /** Display family (from the brand's fonts). */
  font: string;
  layout?: Layout;
  dark?: boolean;
  /** Embed a Google Fonts @import so the downloaded file renders the face on its own. */
  embedFont?: boolean;
  /** Exact advance width of the cased name at `px` (call it at the real size: variable faces with an optical-size axis change width with size). */
  measure?: (text: string, font: string, weight: number, px: number) => number;
  word?: Partial<WordStyle>;
}

const H = (s: string) => s.toUpperCase();
const xmlEsc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Swaps colours inside a linted symbol (exact uppercase hex attributes, as the linter writes them). */
export function recolor(svg: string, map: Record<string, string>): string {
  const m = new Map(Object.entries(map).map(([k, v]) => [H(k), H(v)]));
  return svg.replace(/(fill|stroke)="(#[0-9A-F]{6})"/g, (all, attr: string, hex: string) => (m.has(hex) ? `${attr}="${m.get(hex)}"` : all));
}

/** The symbol for a dark background: ink-coloured parts turn light, light cut-outs turn dark, the accent stays. */
export function darkSymbol(svg: string, p: LogoPalette): string {
  const map: Record<string, string> = {};
  map[p.bg] = darkBg(p);
  map[p.primary] = p.bg;
  map[p.ink] = p.bg;
  return recolor(svg, map);
}
/** The dark page colour: the brand ink (it is dark by Nova's contrast rule). */
export const darkBg = (p: LogoPalette) => p.ink;

/** Re-maps a symbol drawn with one palette onto another, role by role (mock fixtures on any brand). */
export function remapPalette(svg: string, from: LogoPalette, to: LogoPalette): string {
  const map: Record<string, string> = {};
  for (const role of ["bg", "accent", "ink", "primary"] as const) if (!map[H(from[role])]) map[H(from[role])] = to[role];
  return recolor(svg, map);
}

export interface Lockup { svg: string; width: number; height: number }

/** A complete standalone <svg> for one lockup. */
export function lockupSvg(symbol: string, o: LockupOpts): Lockup {
  const layout = o.layout ?? "horizontal";
  const p = o.palette;
  const ws: WordStyle = { ...wordStyleFor(o.font), ...(o.word ?? {}) };
  const ink = o.dark ? p.bg : p.ink;
  const sym = o.dark ? darkSymbol(symbol, p) : symbol;
  const text = casedName(o.name || "Brand", ws.case);
  const style = o.embedFont ? `<style>@import url('${googleFontsHref([o.font]).replace(/&/g, "&amp;")}');</style>` : "";
  const open = (w: number, h: number, bg?: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(w)} ${r(h)}" width="${r(w)}" height="${r(h)}" role="img" aria-label="${xmlEsc(o.name)}">${style}${bg ? `<rect width="${r(w)}" height="${r(h)}" fill="${bg}"/>` : ""}`;
  const widthAt = (fs: number) => (o.measure ? o.measure(text, o.font, ws.weight, fs) * 1.03 + fs * 0.05 : estimateWidthEm(text, ws) * fs);
  const word = (x: number, y: number, fs: number, anchor: "start" | "middle") =>
    `<text x="${r(x)}" y="${r(y)}" text-anchor="${anchor}" font-family="${xmlEsc(fontStack(o.font))}" font-weight="${ws.weight}" font-size="${r(fs)}" letter-spacing="${r(ws.tracking * fs)}" fill="${ink}">${xmlEsc(text)}</text>`;
  // cap height ≈ 0.7 em for most faces; lowercase names read smaller, so they get a slightly larger size
  const capK = ws.case === "upper" ? 0.72 : 0.7;

  if (layout === "icon") {
    const S = 64, pad = 9;
    const tile = o.dark ? darkBg(p) : p.bg;
    return { svg: `${open(S, S)}<rect width="64" height="64" rx="14" fill="${tile}"/><g transform="translate(${pad} ${pad}) scale(${r((S - 2 * pad) / 64)})">${sym}</g></svg>`, width: S, height: S };
  }
  if (layout === "word") {
    const fs = 64, padX = 4;
    const w = widthAt(fs) + padX * 2;
    const h = fs * 1.05;
    return { svg: `${open(w, h)}${word(padX, h / 2 + (fs * capK) / 2, fs, "start")}</svg>`, width: w, height: h };
  }
  if (layout === "stacked") {
    const S = 64, fs = ws.case === "upper" ? 22 : 26, gap = 12;
    const tw = widthAt(fs);
    const w = Math.max(S, tw) + 8;
    const h = S + gap + fs * capK + 6;
    return { svg: `${open(w, h)}<g transform="translate(${r((w - S) / 2)} 0)">${sym}</g>${word(w / 2, S + gap + fs * capK, fs, "middle")}</svg>`, width: w, height: h };
  }
  // horizontal: the name's cap height is ~46% of the symbol; gap ~ a third of the symbol
  const S = 64, fs = (S * 0.46) / capK * (ws.case === "lower" ? 1.08 : 1), gap = 18;
  const tw = widthAt(fs);
  const w = S + gap + tw + 4;
  return { svg: `${open(w, S)}${sym}${word(S + gap, S / 2 + (fs * capK) / 2 - (ws.case === "lower" ? fs * 0.02 : 0), fs, "start")}</svg>`, width: w, height: S };
}

/** Just the symbol as a standalone square SVG (no tile). */
export const symbolSvg = (symbol: string, size = 64) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">${symbol}</svg>`;

const r = (n: number) => Math.round(n * 100) / 100;
