// Small helpers shared by the pack modal and the public landing page.
import type { Palette } from "../types";

export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}

/** €36k, €3.2k, €940 */
export function money(cur: string, n: number): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  let s: string;
  if (a >= 1_000_000) s = `${trim(a / 1_000_000)}M`;
  else if (a >= 10_000) s = `${Math.round(a / 1000)}k`;
  else if (a >= 1000) s = `${trim(a / 1000)}k`;
  else s = `${Math.round(a)}`;
  return `${sign}${cur}${s}`;
}
function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

export function sats(n: number): string {
  return n.toLocaleString("en-US");
}

export function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------- colour ----------

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  let h = String(hex || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return [128, 128, 128];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
}

export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export function luminance(hex: string): number {
  const c = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Pick whichever of the candidates reads best on `bg`. */
export function bestOn(bg: string, ...candidates: string[]): string {
  let best = candidates[0] ?? "#111111", score = -1;
  for (const c of candidates) {
    const s = contrast(bg, c);
    if (s > score) { score = s; best = c; }
  }
  return best;
}

export function isValidHex(h: string): boolean {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(h || "").trim());
}

/** Normalised brand roles from a 4-colour palette, with sane fallbacks and guaranteed contrast. */
export type BrandColors = { primary: string; accent: string; bg: string; extra: string; ink: string; onPrimary: string; onAccent: string; muted: string };

export function brandColors(p: Palette | undefined): BrandColors {
  const pick = (i: number, fb: string) => {
    const h = p?.[i]?.hex;
    return h && isValidHex(h) ? (h.startsWith("#") ? h : "#" + h) : fb;
  };
  const primary = pick(0, "#1F2937");
  const accent = pick(1, "#0AC18E");
  let bg = pick(2, "#F7F5F0");
  const extra = pick(3, mix(primary, accent, 0.5));
  // A landing needs a readable background: if the palette's "background" is mid-tone, lighten it.
  if (luminance(bg) < 0.55 && luminance(bg) > 0.08) bg = mix(bg, "#ffffff", 0.82);
  const ink = contrast(primary, bg) >= 4.5 ? primary : bestOn(bg, "#14110F", "#F8FAFC");
  return {
    primary, accent, bg, extra, ink,
    onPrimary: bestOn(primary, bg, "#ffffff", "#111111"),
    onAccent: bestOn(accent, "#ffffff", "#111111", primary),
    muted: mix(ink, bg, 0.38),
  };
}

export function fmtDate(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return d.toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
}

export function parseDay(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

// ---------- brand fonts (R11) ----------

import type { FontPair } from "../types";

/** The Google Fonts stylesheet URL for a brand pair (one request, wght 400;600;700, display=swap). */
export function fontsHref(pair: FontPair): string {
  const fam = [...new Set([pair.display, pair.body].filter(Boolean))]
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${fam}&display=swap`;
}

/**
 * R11: injects one Google Fonts <link> for a brand pair (idempotent). Used by the pack Brand section, the
 * deliverable tile, the finale launch card and the public site. Falls back silently to the system stack offline.
 */
export function loadFonts(pair: FontPair | null | undefined): void {
  if (!pair || typeof document === "undefined") return;
  const href = fontsHref(pair);
  const id = "ld-font-" + href.replace(/[^a-z0-9]/gi, "").slice(-60);
  if (document.getElementById(id)) return;
  const l = document.createElement("link");
  l.id = id;
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}

/** CSS font-family value for a brand face with a sensible fallback (serif faces fall back to a serif). */
export function fontStack(family: string | undefined, role: "display" | "body" = "display"): string {
  const f = (family || "").replace(/["\\]/g, "");
  const serif = /serif|fraunces|caslon|baskerville|playfair|lora|garamond|crimson|newsreader|literata|gloock|young serif/i.test(f) && !/sans/i.test(f);
  const fb = serif ? `Georgia, "Times New Roman", serif` : `-apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", Arial, sans-serif`;
  return f ? `"${f}", ${fb}` : role === "display" ? fb : fb;
}
