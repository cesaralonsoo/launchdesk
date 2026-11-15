// v6 polish · The founder's logo, drawn for real. Dex picks a `glyph` (server/ai.ts LOGO_GLYPHS) and the concept text
// may only describe that glyph, the monogram and the type, so what the card says is exactly what it shows.
// Glyphs live on a 24-unit grid, coloured from Nova's palette: Primary = ink, Accent = the mark, Background = paper.
import { esc } from "./dom";

export type Glyph = "none" | "pause" | "roundel" | "loop" | "loaf" | "route" | "tile" | "stop";
export interface LogoSpec {
  concept?: string;
  glyph?: string;
  monogram?: string;
  wordmark?: { weight?: number; letter_spacing_em?: number; case?: "lower" | "title" | "upper"; placement?: "left" | "above" };
}
export interface BrandInk { ink: string; acc: string; bg: string }

const GLYPHS: readonly Glyph[] = ["none", "pause", "roundel", "loop", "loaf", "route", "tile", "stop"];
export const glyphOf = (l?: LogoSpec): Glyph => (GLYPHS.includes(l?.glyph as Glyph) ? (l!.glyph as Glyph) : "none");

const cased = (s: string, c?: string) => (c === "lower" ? s.toLowerCase() : c === "upper" ? s.toUpperCase() : s.replace(/^./, (x) => x.toUpperCase()));
const stack = (f: string) => `'${f.replace(/'/g, "")}', ${/serif|fraunces|young|caslon|garamond|lora|playfair|newsreader/i.test(f) && !/sans/i.test(f) ? "Georgia, serif" : "system-ui, sans-serif"}`;

let uid = 0;
/** The drawn symbol alone (no name), `size` px square. */
export function glyphSvg(g: Glyph, c: BrandInk, size: number, mono = "", font = "Inter", weight = 700): string {
  const svg = (body: string, vb = "0 0 24 24") => `<svg class="bm-g" width="${size}" height="${size}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;
  const m = esc((mono || "").slice(0, 2).toUpperCase());
  const txt = (x: number, y: number, fs: number, fill: string) =>
    `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="${esc(stack(font))}" font-weight="${weight}" font-size="${fs}" letter-spacing="${m.length > 1 ? -0.4 : 0}" fill="${fill}">${m}</text>`;
  switch (g) {
    case "pause":
      return svg(`<rect x="5.2" y="3.5" width="5" height="17" rx="2.5" fill="${c.acc}"/><rect x="13.8" y="3.5" width="5" height="17" rx="2.5" fill="${c.acc}"/>`);
    case "roundel":
      return svg(`<circle cx="12" cy="12" r="9.2" fill="none" stroke="${c.acc}" stroke-width="3.4"/><rect x="0.6" y="7.6" width="22.8" height="8.8" rx="1.6" fill="${c.ink}"/>${txt(12, 12.2, m.length > 1 ? 6.2 : 7.4, c.bg)}`);
    case "loop":
      return svg(`<path d="M19.4 9.2A8 8 0 1 0 20 12" fill="none" stroke="${c.acc}" stroke-width="3" stroke-linecap="round"/><path d="M16.2 7.6l4.1 1.9.6-4.4" fill="none" stroke="${c.acc}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`);
    case "loaf":
      return svg(`<ellipse cx="12" cy="12.4" rx="10" ry="9.4" fill="${c.acc}"/><path d="M6.6 15.6C9.4 10.4 13.6 8 18 7.8" fill="none" stroke="${c.bg}" stroke-width="2.2" stroke-linecap="round" opacity=".92"/><path d="M8.2 18c2.6-2.4 5.8-3.6 9-3.8" fill="none" stroke="${c.bg}" stroke-width="1.4" stroke-linecap="round" opacity=".5"/>`);
    case "route":
      return svg(`<path d="M6.5 6.8c3.8-3.6 11.6-2.8 12.8 2.4 1.2 5.2-2.6 9.8-7.6 10-5 .2-8.6-3.2-8-7.4.3-2 1.2-3.6 2.8-5z" fill="none" stroke="${c.acc}" stroke-width="2.8" stroke-linejoin="round"/><circle cx="6.5" cy="6.8" r="2.6" fill="${c.ink}"/>`);
    case "tile":
    case "stop":
    case "none":
    default: {
      // app-icon form for wordmark-only concepts: the monogram on a rounded ink tile, with the accent dot for "stop"
      const id = `bm${++uid}`;
      return svg(`<defs><clipPath id="${id}"><rect x="1" y="1" width="22" height="22" rx="6"/></clipPath></defs><rect x="1" y="1" width="22" height="22" rx="6" fill="${c.ink}"/>${txt(g === "stop" ? 11 : 12, 12.4, m.length > 1 ? 9 : 12, c.bg)}${g === "stop" ? `<circle cx="18.6" cy="17.4" r="1.9" fill="${c.acc}" clip-path="url(#${id})"/>` : ""}`);
    }
  }
}

/**
 * The full logo: glyph + name set in the brand display face with Dex's weight, tracking and case.
 * `px` = cap size of the name. `mode: "mark"` = the app-icon form only.
 */
export function brandLogoHtml(l: LogoSpec | undefined, c: BrandInk, name: string, px: number, font: string, opts: { mode?: "full" | "mark" } = {}): string {
  const g = glyphOf(l);
  const wm = l?.wordmark ?? {};
  const weight = wm.weight ?? 600;
  const mono = l?.monogram || name[0] || "A";
  if (opts.mode === "mark") return `<span class="bm bm-mark" style="--bm:${px}px">${glyphSvg(g === "none" ? "tile" : g, c, px, mono, font, weight)}</span>`;
  const text = cased(name.trim() || "Brand", wm.case);
  const above = wm.placement === "above" && g !== "stop" && g !== "none";
  const markPx = Math.round(px * (above ? 1.7 : g === "pause" ? 1.0 : g === "tile" ? 1.2 : 1.12));
  const mark = g === "none" || g === "stop" ? "" : glyphSvg(g, c, markPx, mono, font, weight);
  const dot = g === "stop" ? `<i class="bm-stop" style="background:${c.acc}"></i>` : "";
  const ls = Math.max(-0.05, Math.min(0.14, wm.letter_spacing_em ?? -0.02));
  return `<span class="bm bm-${g}${above ? " bm-above" : ""}" style="--bm:${px}px;color:${c.ink}">${mark}<span class="bm-word" style="font-family:${esc(stack(font))};font-weight:${weight};letter-spacing:${ls}em">${esc(text)}${dot}</span></span>`;
}
