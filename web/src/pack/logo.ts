// Logo emblems drawn from Dex's spec + Nova's palette. Pure SVG strings, no network, no fonts required.
import type { DexDesign, LogoIcon, Palette } from "../types";
import { LOGO_ICONS } from "../types";
import { brandColors, contrast, esc, mix } from "./util";

type Logo = DexDesign["logos"][number];

// Hand-built icons on a 24×24 grid. Strokes use currentColor; solid parts carry fill="currentColor".
const F = 'fill="currentColor" stroke="none"';
const ICONS: Record<LogoIcon, string> = {
  cup:
    `<path d="M4.5 10h12v3.5a5.5 5.5 0 0 1-5.5 5.5h-1a5.5 5.5 0 0 1-5.5-5.5z" ${F}/>` +
    `<path d="M16.5 11.2h1.3a2.6 2.6 0 0 1 0 5.2h-1.6"/><path d="M3 21.2h16"/>` +
    `<path d="M8 2.8c-.9 1.1.9 2.2 0 3.4M11.3 2.8c-.9 1.1.9 2.2 0 3.4M14.6 2.8c-.9 1.1.9 2.2 0 3.4"/>`,
  bike:
    `<circle cx="5.5" cy="16" r="3.6"/><circle cx="18.5" cy="16" r="3.6"/>` +
    `<path d="M5.5 16 9.2 8.6h6.3L18.5 16M9.2 8.6 12.4 16H5.5M15.5 8.6 12.4 16"/>` +
    `<path d="M7.4 6.4h3.2M14.3 5.2h2.6l-1.4 3.4"/>`,
  leaf:
    `<path d="M4.6 19.4C4 10.6 9.4 4.6 20.2 3.8c.6 10.4-5 16-15.6 15.6z" ${F}/>` +
    `<path d="M4.6 19.4C8 15 11 12 15.6 8.4" style="stroke:var(--logo-cut,#fff)" stroke-width="1.6"/>`,
  paw:
    `<path d="M12 11.6c2.9 0 6 3.4 6 5.9 0 1.8-1.4 2.6-3 2.6-1.2 0-2-.6-3-.6s-1.8.6-3 .6c-1.6 0-3-.8-3-2.6 0-2.5 3.1-5.9 6-5.9z" ${F}/>` +
    `<ellipse cx="5.2" cy="10.2" rx="1.9" ry="2.3" ${F}/><ellipse cx="9.2" cy="5.9" rx="2" ry="2.5" ${F}/>` +
    `<ellipse cx="14.8" cy="5.9" rx="2" ry="2.5" ${F}/><ellipse cx="18.8" cy="10.2" rx="1.9" ry="2.3" ${F}/>`,
  book:
    `<path d="M2.8 5.4c3-1.2 6.2-1 9.2 1.2 3-2.2 6.2-2.4 9.2-1.2v13.4c-3-1.2-6.2-1-9.2 1.2-3-2.2-6.2-2.4-9.2-1.2z"/>` +
    `<path d="M12 6.6v13.2M5.6 9.2c1.6-.3 3.1 0 4.2.6M5.6 12.4c1.6-.3 3.1 0 4.2.6M14.2 9.8c1.1-.6 2.6-.9 4.2-.6"/>`,
  code: `<path d="M8 6.5 2.8 12 8 17.5M16 6.5l5.2 5.5-5.2 5.5M13.6 4.2l-3.2 15.6"/>`,
  fork:
    `<path d="M5.6 2.8v5.6a2.6 2.6 0 0 0 5.2 0V2.8M8.2 2.8v18.4"/>` +
    `<path d="M18.4 21.2V2.8c-2.6 1.4-4 4.4-4 8 0 2 1.2 3.2 4 3.2" ${F} />` +
    `<path d="M18.4 21.2V2.8c-2.6 1.4-4 4.4-4 8 0 2 1.2 3.2 4 3.2"/>`,
  home:
    `<path d="M2.8 11.2 12 3.4l9.2 7.8"/><path d="M5.2 9.4v11h13.6v-11"/>` +
    `<path d="M10 20.4v-5.6h4v5.6" ${F}/>`,
  heart:
    `<path d="M12 20.4S3.4 15.6 3.4 9.5A4.6 4.6 0 0 1 12 7.2a4.6 4.6 0 0 1 8.6 2.3c0 6.1-8.6 10.9-8.6 10.9z" ${F}/>`,
  bolt: `<path d="M13.4 2.4 4.2 13.8h6.6l-1.2 7.8 9.2-11.4h-6.6z" ${F}/>`,
  star:
    `<path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.4l-5.8 3 1.1-6.4-4.7-4.6 6.5-.9z" ${F}/>`,
  shop:
    `<path d="M3.2 9 4.8 3.8h14.4L20.8 9"/>` +
    `<path d="M3.2 9a2.95 2.95 0 0 0 5.9 0 2.95 2.95 0 0 0 5.8 0 2.95 2.95 0 0 0 5.9 0z" ${F}/>` +
    `<path d="M4.6 12.2v8.4h14.8v-8.4"/><path d="M10 20.6v-4.8h4v4.8" ${F}/>`,
  music:
    `<path d="M9 17.6V5.2l11-2.2v12.4"/>` +
    `<circle cx="6.4" cy="17.8" r="2.7" ${F}/><circle cx="17.4" cy="15.6" r="2.7" ${F}/><path d="M9 9.2l11-2.2"/>`,
  camera:
    `<path d="M3 8.6A1.6 1.6 0 0 1 4.6 7h2.9l1.6-2.6h5.8L16.5 7h2.9A1.6 1.6 0 0 1 21 8.6v9.2a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 17.8z"/>` +
    `<circle cx="12" cy="13" r="3.6"/><circle cx="12" cy="13" r="1.4" ${F}/>`,
  chart:
    `<path d="M3.6 3.6v16.8h16.8"/>` +
    `<rect x="6.6" y="12.6" width="3" height="5.2" rx=".8" ${F}/><rect x="11.2" y="8.6" width="3" height="9.2" rx=".8" ${F}/>` +
    `<rect x="15.8" y="5" width="3" height="12.8" rx=".8" ${F}/>`,
  globe:
    `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>`,
  tool:
    `<path d="M14 10 5.4 18.6" stroke-width="3.4"/>` +
    `<path d="M13.2 6.9a4.7 4.7 0 0 1 6.2-4.4l-3 3 .8 2.3 2.3.8 3-3a4.7 4.7 0 0 1-4.4 6.2 4.7 4.7 0 0 1-4.9-4.9z" ${F}/>`,
  spark:
    `<path d="M11 2.6c.8 5 2.6 6.8 7.6 7.6-5 .8-6.8 2.6-7.6 7.6-.8-5-2.6-6.8-7.6-7.6 5-.8 6.8-2.6 7.6-7.6z" ${F}/>` +
    `<path d="M18.6 14.6c.35 1.5 1 2.15 2.5 2.5-1.5.35-2.15 1-2.5 2.5-.35-1.5-1-2.15-2.5-2.5 1.5-.35 2.15-1 2.5-2.5z" ${F}/>`,
};

export function isLogoIcon(v: unknown): v is LogoIcon {
  return typeof v === "string" && (LOGO_ICONS as readonly string[]).includes(v);
}

/** One icon as an SVG <g>, positioned at (x, y) with the given size, for embedding inside another SVG. */
export function iconGroup(icon: LogoIcon | string, color: string, x: number, y: number, size: number, cut = "#fff"): string {
  const key: LogoIcon = isLogoIcon(icon) ? icon : "spark";
  const s = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${s})" color="${color}" style="--logo-cut:${cut}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[key]}</g>`;
}

/** Standalone icon SVG (for UI chips, landing hero, post cards). */
export function renderIcon(icon: LogoIcon | string, color: string, size = 24, cut = "#fff"): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${iconGroup(icon, color, 0, 0, 24, cut)}</svg>`;
}

function fitText(text: string, maxWidth: number, base: number, perChar: number): number {
  const w = text.length * perChar * base;
  return w > maxWidth ? Math.max(base * 0.5, (maxWidth / (text.length * perChar))) : base;
}

let uid = 0;

/**
 * Render a logo concept as a square SVG.
 * - emblem: round badge (primary) with fine ring, icon and the name in caps
 * - monogram: rounded square in accent with the monogram letter(s)
 * - wordmark: icon + lowercase name with an accent underline
 * The SVG has a transparent background, so callers can place it on any tile.
 */
export function renderLogo(logo: Logo | undefined, palette: Palette | undefined, name: string, size: number): string {
  const c = brandColors(palette);
  const icon = logo?.icon ?? "spark";
  const shape = logo?.shape ?? "emblem";
  const nm = String(name || "Brand").trim();
  const id = `lg${++uid}`;
  const font = `font-family="-apple-system, BlinkMacSystemFont, Inter, 'Helvetica Neue', Arial, sans-serif"`;
  let body = "";

  if (shape === "monogram") {
    const mono = (logo?.monogram || nm[0] || "A").trim().slice(0, 2).toUpperCase();
    const fill = c.accent;
    const ink = contrast(fill, c.primary) >= 3 ? c.primary : c.onAccent;
    const fs = mono.length > 1 ? 46 : 62;
    body =
      `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(fill, "#ffffff", 0.12)}"/><stop offset="1" stop-color="${mix(fill, "#000000", 0.08)}"/></linearGradient></defs>` +
      `<rect x="6" y="6" width="88" height="88" rx="22" fill="url(#${id}g)"/>` +
      `<text x="50" y="${mono.length > 1 ? 66 : 72}" text-anchor="middle" ${font} font-weight="800" font-size="${fs}" fill="${ink}" letter-spacing="-1">${esc(mono)}</text>` +
      `<circle cx="78" cy="22" r="6.5" fill="${ink}"/>`;
  } else if (shape === "wordmark") {
    const word = nm.toLowerCase();
    const fs = fitText(word, 80, 24, 0.62);
    body =
      iconGroup(icon, c.accent, 38, 14, 24, c.bg) +
      `<text x="50" y="${62 + fs * 0.1}" text-anchor="middle" ${font} font-weight="800" font-size="${fs.toFixed(1)}" fill="${c.ink}" letter-spacing="-0.5">${esc(word)}</text>` +
      `<rect x="34" y="${72 + fs * 0.1}" width="32" height="4" rx="2" fill="${c.accent}"/>`;
  } else {
    const disc = c.primary;
    const onDisc = contrast(disc, c.bg) >= 3 ? c.bg : c.onPrimary;
    const word = nm.toUpperCase();
    const fs = fitText(word, 50, 11, 0.78);
    body =
      `<circle cx="50" cy="50" r="46" fill="${disc}"/>` +
      `<circle cx="50" cy="50" r="40.5" fill="none" stroke="${c.accent}" stroke-width="1.6"/>` +
      `<circle cx="50" cy="50" r="37.5" fill="none" stroke="${onDisc}" stroke-opacity=".18" stroke-width=".8"/>` +
      iconGroup(icon, onDisc, 36, 24, 28, disc) +
      `<text x="50" y="${69 + fs * 0.12}" text-anchor="middle" ${font} font-weight="800" font-size="${fs.toFixed(1)}" fill="${onDisc}" letter-spacing="${(fs * 0.16).toFixed(2)}">${esc(word)}</text>` +
      `<circle cx="22" cy="52" r="1.3" fill="${c.accent}"/><circle cx="78" cy="52" r="1.3" fill="${c.accent}"/>`;
  }
  return `<svg class="ld-logo" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${esc(nm)} logo">${body}</svg>`;
}

/** Logo on its brand tile (rounded square in the brand background) — used for headers and app icons. */
export function renderLogoTile(logo: Logo | undefined, palette: Palette | undefined, name: string, size: number, tile?: string): string {
  const c = brandColors(palette);
  const bg = tile ?? (logo?.shape === "monogram" ? c.primary : c.bg);
  const r = Math.round(size * 0.24);
  return `<span class="ld-logotile" style="width:${size}px;height:${size}px;border-radius:${r}px;background:${bg}">${renderLogo(logo, palette, name, Math.round(size * 0.86))}</span>`;
}

// ---------- R12: wordmark-first logos ----------

import type { FontPair, Wordmark } from "../types";
import { DEFAULT_WORDMARK } from "../types";
import { fontStack } from "./util";

const applyCase = (s: string, c: Wordmark["case"]) => (c === "lower" ? s.toLowerCase() : c === "upper" ? s.toUpperCase() : s);

/** The brand mark alone (icon or monogram) on a rounded tile in the brand primary. Size in px. */
export function renderMark(logo: Logo | undefined, palette: Palette | undefined, name: string, size: number, fonts?: FontPair): string {
  const c = brandColors(palette);
  const wm = logo?.wordmark ?? DEFAULT_WORDMARK;
  const r = Math.round(size * 0.26);
  const on = contrast(c.primary, c.bg) >= 3 ? c.bg : c.onPrimary;
  const mono = wm.mark === "monogram" || logo?.shape === "monogram";
  const inner = mono
    ? `<span style="font-family:${esc(fontStack(fonts?.display))};font-weight:${wm.weight};font-size:${Math.round(size * (((logo?.monogram || name[0] || "A").length > 1) ? 0.4 : 0.52))}px;line-height:1;letter-spacing:-0.02em;color:${on}">${esc((logo?.monogram || name[0] || "A").slice(0, 2).toUpperCase())}</span>`
    : renderIcon(logo?.icon ?? "spark", on, Math.round(size * 0.56), c.primary);
  return `<span class="ld-mark" style="width:${size}px;height:${size}px;border-radius:${r}px;background:${c.primary};display:inline-grid;place-items:center;flex:none">${inner}</span>`;
}

/**
 * R12: the name set as a wordmark in the brand display font with Dex's weight, tracking and case, plus an
 * optional mark (icon or monogram) left of it or above it. `size` is the cap size of the name in px.
 */
export function renderWordmark(logo: Logo | undefined, palette: Palette | undefined, name: string, size: number, fonts?: FontPair, opts: { color?: string } = {}): string {
  const c = brandColors(palette);
  const wm = logo?.wordmark ?? DEFAULT_WORDMARK;
  const color = opts.color ?? c.ink;
  const text = applyCase(String(name || "Brand").trim(), wm.case);
  const markSize = Math.round(size * (wm.placement === "above" ? 1.5 : 1.15));
  let mark = "";
  if (wm.mark === "icon") mark = renderIcon(logo?.icon ?? "spark", c.accent, markSize, c.bg);
  else if (wm.mark === "monogram") mark = renderMark(logo, palette, name, markSize, fonts);
  const above = wm.placement === "above";
  return `<span class="ld-wordmark" style="display:inline-flex;${above ? "flex-direction:column;" : ""}align-items:center;gap:${Math.round(size * (above ? 0.3 : 0.32))}px;color:${color}">${mark}<span style="font-family:${esc(fontStack(fonts?.display))};font-weight:${wm.weight};font-size:${size}px;line-height:1.05;letter-spacing:${wm.letter_spacing_em}em;white-space:nowrap">${esc(text)}</span></span>`;
}
