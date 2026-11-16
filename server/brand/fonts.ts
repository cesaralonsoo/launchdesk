// WP2 · Type pairings for the brand kit. Every family here is in FONT_WHITELIST (server/types.ts) and none is banned,
// so a pairing the model picks can always be loaded from Google Fonts. Exported for WP4's Nova prompt (pick one id)
// and WP1's site templates (load `googleFontsHref`). The wordmark is set in code with the pairing's style, never by
// the model, so the name always looks typeset, not drawn.
//
// Pure module (no imports): the browser (web/proto/ui/logo-picker.ts) imports it too.

export type WordCase = "lower" | "title" | "upper";
export interface WordStyle {
  /** CSS font-weight the wordmark is set in (must exist in the Google Fonts css2 request). */
  weight: number;
  /** letter-spacing in em. */
  tracking: number;
  case: WordCase;
  /** Average advance width of a lowercase letter in em, for laying out an SVG without measuring. */
  avg: number;
}
export interface FontPairing {
  id: string;
  display: string;
  text: string;
  /** Plain-word mood, for the Nova prompt ("which feels right for this business"). */
  mood: string;
  word: WordStyle;
}

export const PAIRINGS: readonly FontPairing[] = [
  { id: "fraunces-inter", display: "Fraunces", text: "Inter", mood: "warm, crafted, food and hospitality", word: { weight: 600, tracking: -0.025, case: "title", avg: 0.53 } },
  { id: "grotesk-inter", display: "Space Grotesk", text: "Inter", mood: "precise, technical, workshop", word: { weight: 600, tracking: -0.03, case: "lower", avg: 0.55 } },
  { id: "dmserif-dmsans", display: "DM Serif Display", text: "DM Sans", mood: "classic, confident, a shop with a sign", word: { weight: 400, tracking: -0.01, case: "title", avg: 0.5 } },
  { id: "syne-manrope", display: "Syne", text: "Manrope", mood: "artsy, fashion, studio", word: { weight: 700, tracking: 0.02, case: "upper", avg: 0.62 } },
  { id: "bricolage-inter", display: "Bricolage Grotesque", text: "Inter", mood: "friendly, neighbourhood, everyday service", word: { weight: 700, tracking: -0.035, case: "lower", avg: 0.53 } },
  { id: "instrument", display: "Instrument Serif", text: "Instrument Sans", mood: "quiet, refined, editorial", word: { weight: 400, tracking: -0.015, case: "title", avg: 0.43 } },
  { id: "archivo", display: "Archivo Black", text: "Archivo", mood: "loud, sporty, street", word: { weight: 400, tracking: 0.01, case: "upper", avg: 0.66 } },
  { id: "youngserif-worksans", display: "Young Serif", text: "Work Sans", mood: "homely, bakery, family business", word: { weight: 400, tracking: -0.01, case: "title", avg: 0.55 } },
  { id: "unbounded-manrope", display: "Unbounded", text: "Manrope", mood: "playful, bold, young", word: { weight: 600, tracking: -0.03, case: "lower", avg: 0.68 } },
  { id: "playfair-karla", display: "Playfair Display", text: "Karla", mood: "elegant, premium, wine and dining", word: { weight: 700, tracking: -0.01, case: "title", avg: 0.52 } },
  { id: "outfit", display: "Outfit", text: "Outfit", mood: "clean, modern, app", word: { weight: 600, tracking: -0.025, case: "lower", avg: 0.52 } },
  { id: "gloock-figtree", display: "Gloock", text: "Figtree", mood: "bold serif, bookish, character", word: { weight: 400, tracking: -0.005, case: "title", avg: 0.53 } },
  { id: "rubik", display: "Rubik", text: "Rubik", mood: "soft, approachable, kids and pets", word: { weight: 600, tracking: -0.015, case: "lower", avg: 0.54 } },
  { id: "caslon-hanken", display: "Libre Caslon Text", text: "Hanken Grotesk", mood: "trusted, established, professional services", word: { weight: 700, tracking: 0.01, case: "title", avg: 0.55 } },
  { id: "schibsted", display: "Schibsted Grotesk", text: "Schibsted Grotesk", mood: "newsroom, direct, no-nonsense", word: { weight: 800, tracking: -0.035, case: "lower", avg: 0.53 } },
  { id: "cormorant-epilogue", display: "Cormorant Garamond", text: "Epilogue", mood: "luxury, beauty, slow craft", word: { weight: 600, tracking: 0.06, case: "upper", avg: 0.46 } },
];

const norm = (s: string) => s.trim().toLowerCase();
const DEFAULT_WORD: WordStyle = { weight: 600, tracking: -0.02, case: "title", avg: 0.54 };

/** The pairing for a display family (or a pairing id). Unknown → null. */
export function pairingFor(displayOrId: string): FontPairing | null {
  const k = norm(displayOrId || "");
  return PAIRINGS.find((p) => p.id === k) ?? PAIRINGS.find((p) => norm(p.display) === k) ?? null;
}

/** The wordmark style for any display face (a non-pairing whitelisted face gets a safe default). */
export const wordStyleFor = (display: string): WordStyle => pairingFor(display)?.word ?? DEFAULT_WORD;

/** Serif or sans fallback stack for a family. */
export function fontStack(family: string): string {
  const serif = /serif|fraunces|young|caslon|garamond|lora|playfair|newsreader|gloock|cormorant|literata|crimson|baskerville/i.test(family) && !/sans/i.test(family);
  return `'${family.replace(/['"<>&]/g, "")}', ${serif ? "Georgia, serif" : "system-ui, sans-serif"}`;
}

/** One Google Fonts css2 URL for the given families (weights the wordmark and body text need). */
export function googleFontsHref(families: readonly string[]): string {
  const uniq = [...new Set(families.filter(Boolean).map((f) => f.trim()))];
  const q = uniq
    .map((f) => {
      const w = pairingFor(f)?.word.weight;
      const one = /^(Archivo Black|DM Serif Display|Instrument Serif|Gloock)$/.test(f);
      const weights = one ? "400" : [...new Set([400, 500, 600, 700, w ?? 600])].sort((a, b) => a - b).join(";");
      return `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@${weights}`;
    })
    .join("&");
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

/** The name cased for the wordmark. */
export function casedName(name: string, c: WordCase): string {
  const t = name.trim().replace(/\s+/g, " ");
  return c === "lower" ? t.toLowerCase() : c === "upper" ? t.toUpperCase() : t.replace(/(^|\s)(\p{L})/gu, (_, s, l: string) => s + l.toUpperCase());
}

/** Rough advance width of `text` in em (no DOM): good enough to size an SVG viewBox; the browser measures exactly. */
export function estimateWidthEm(text: string, w: WordStyle): number {
  let em = 0;
  for (const ch of text) {
    const k = /[iljI.,'!:;|]/.test(ch) ? 0.5 : /[mwMW]/.test(ch) ? 1.45 : /\s/.test(ch) ? 0.55 : /[A-Z]/.test(ch) ? 1.2 : /[ftr]/.test(ch) ? 0.75 : 1;
    em += k * w.avg + w.tracking;
  }
  // err wide (bold display faces run ~15% over the average): a little spare room beats a clipped last letter
  return Math.max(0.5, em * 1.15 + 0.1);
}
