// WP2 · Last resorts. repairPrompt: one cheap Sonnet call that fixes only the lint errors of failed candidates.
// fallbackOptions: three code-drawn geometric marks, used when fewer than 3 candidates survive even after repair.
import type { KitBrand, LogoOption } from "../kit-contract.js";
import { normHex } from "./lint.js";

export interface Candidate { family: LogoOption["family"]; idea: string; svg: string }
export interface Failed extends Candidate { errors: string[] }

export function repairPrompt(brand: KitBrand, failed: readonly Failed[]): string {
  return `These logo symbols for "${brand.name}" broke technical rules. Fix ONLY what the errors list says (keep each idea, silhouette and family). Return them all, same order.

Rules: inner SVG markup only, viewBox 0 0 64 64; elements path, circle, rect, ellipse, polygon, line, g; every shape an explicit fill from the palette or "none"; strokes at least 4 wide; at most 8 shapes; coordinates between 4 and 60; colours only ${brand.palette.ink}, ${brand.palette.accent}, ${brand.palette.bg} (max 3); no text, defs, masks or style.

${failed.map((f, i) => `<candidate n="${i + 1}" family="${f.family}" idea="${f.idea.replace(/"/g, "'")}">\n<errors>${f.errors.join("; ")}</errors>\n<svg>${f.svg}</svg>\n</candidate>`).join("\n")}`;
}

/** Three clean geometric marks drawn in code (palette roles only). Always pass lint. */
export function fallbackOptions(brand: KitBrand): LogoOption[] {
  const ink = normHex(brand.palette.ink) ?? "#1A1A1A";
  const acc = normHex(brand.palette.accent) ?? "#D9653B";
  const bg = normHex(brand.palette.bg) ?? "#F5F1E8";
  return [
    {
      id: "fb-quarter",
      family: "geometric",
      idea: "A full circle with one bright quarter: the part we do for you.",
      svg: `<circle cx="32" cy="32" r="26" fill="${ink}"/><path d="M32 32 V6 A26 26 0 0 1 58 32 Z" fill="${acc}"/>`,
    },
    {
      id: "fb-arch",
      family: "literal",
      idea: "An open doorway with a warm light inside: come in.",
      svg: `<path d="M10 58 V32 A22 22 0 0 1 54 32 V58 Z" fill="${ink}"/><circle cx="32" cy="38" r="8" fill="${acc}"/><rect x="28" y="46" width="8" height="12" fill="${bg}"/>`,
    },
    {
      id: "fb-steps",
      family: "geometric",
      idea: "Three blocks stepping up: steady progress, one step at a time.",
      svg: `<rect x="6" y="38" width="16" height="20" rx="3" fill="${ink}"/><rect x="24" y="24" width="16" height="34" rx="3" fill="${ink}"/><rect x="42" y="8" width="16" height="50" rx="3" fill="${acc}"/>`,
    },
  ];
}
