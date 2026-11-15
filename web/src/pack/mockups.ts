// R19 "In use": two brand mockups only, drawn with CSS at real size and scaled with transform (pack.css).
// 1) a takeaway cup (food & drink) or a tote bag (everything else), 2) an Instagram-style profile grid.
import type { DexDesign, FontPair, Palette } from "../types";
import { renderMark, renderWordmark } from "./logo";
import { brandColors, contrast, esc, fontStack } from "./util";

type Logo = DexDesign["logos"][number];
const DRINK = new Set(["cup", "fork", "leaf", "heart"]);

/** Takeaway cup (or tote) with the wordmark wrapped on it, a sleeve in the brand primary and a soft floor shadow. */
export function productMockup(logo: Logo | undefined, p: Palette | undefined, name: string, fonts?: FontPair): string {
  const c = brandColors(p);
  const body = c.bg;
  const ink = contrast(body, c.primary) >= 3 ? c.primary : c.ink;
  const wm = renderWordmark(logo ? { ...logo, wordmark: { ...logo.wordmark, placement: "above" } } : logo, p, name, 26, fonts, { color: ink });
  if (DRINK.has(logo?.icon ?? "")) {
    return `<div class="ldp-mock cup" aria-label="${esc(name)} takeaway cup">
      <div class="lid" style="background:${c.primary}"></div>
      <div class="body" style="background:${body}">
        <div class="sleeve" style="background:${c.primary}"></div>
        <div class="print">${wm}</div>
      </div>
      <div class="floor"></div>
    </div>`;
  }
  return `<div class="ldp-mock tote" aria-label="${esc(name)} tote bag">
    <div class="handle" style="border-color:${c.primary}"></div>
    <div class="body" style="background:${body}"><div class="print">${wm}</div></div>
    <div class="floor"></div>
  </div>`;
}

/** Instagram-style profile: mark, handle, bio and a 3×3 grid of post hooks on palette colours. No follower counts. */
export function profileMockup(logo: Logo | undefined, p: Palette | undefined, name: string, handle: string, tagline: string, hooks: string[], fonts?: FontPair): string {
  const c = brandColors(p);
  const tiles = [c.primary, c.accent, c.bg, c.extra];
  const items = Array.from({ length: 9 }, (_, i) => {
    const bg = tiles[i % 4]!;
    const fg = contrast(bg, "#ffffff") >= 3 ? "#ffffff" : c.ink;
    const hook = hooks[i];
    return hook
      ? `<div class="t" style="background:${bg};color:${fg}"><span style="font-family:${esc(fontStack(fonts?.display))}">${esc(hook)}</span></div>`
      : `<div class="t" style="background:${bg};color:${fg}">${renderMark(logo, p, name, 40, fonts)}</div>`;
  }).join("");
  return `<div class="ldp-mock ig" aria-label="${esc(name)} social profile">
    <div class="ighead">${renderMark(logo, p, name, 64, fonts)}<div><b>${esc(handle)}</b><span>${esc(name)}</span><small>${esc(tagline)}</small></div></div>
    <div class="igbtn">Follow</div>
    <div class="iggrid">${items}</div>
  </div>`;
}
