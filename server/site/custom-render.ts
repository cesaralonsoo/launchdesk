// Bespoke site: final page assembly. Takes the stored (already gated) fragment, re-sanitizes it for this page
// (photo URLs, reserve links, waitlist wiring) and wraps it in our own document: head/SEO, brand fonts, the reserve
// sheet + sticky bar from templates/shared.ts, the photo credits and the same one inline script (so SCRIPT_HASH and
// SITE_CSP from render.ts are unchanged). Returns null when the fragment no longer passes; the caller then renders
// the standard design instead.
import type { Kit } from "../kit-contract.js";
import type { SiteSpec } from "./spec.js";
import type { LiveData, RenderOpts } from "./render.js";
import { buildCtx } from "./render.js";
import { BCH_COIN, chrome, credit, esc, mark, sectionOf, SITE_JS, type RenderCtx } from "./templates/shared.js";
import { currencySymbol, ensureContrast, mix, onColor, type Tokens } from "./validate.js";
import { sanitize, type SanitizePhoto, type Sanitized } from "./sanitize.js";

/** A downloaded photo as the page needs it (the photos module's SitePhoto is a superset). Order = model ids p1, p2… */
export interface CustomPhoto {
  id?: string;
  alt: string;
  width: number;
  height: number;
  /** Short credit line, e.g. `"Snake plant" by Jane Doe`. */
  credit?: string;
  /** "cc0" | "pdm" | "by" | "by-sa" … */
  license?: string;
  sourceUrl?: string;
  role?: string;
  /** Literal description for the design model. */
  shows?: string;
}

export interface CustomRow {
  /** Stored fragment ("store" mode output of the sanitizer). */
  html: string;
  spec: SiteSpec;
  kit: Pick<Kit, "brand" | "logo">;
  photos: CustomPhoto[];
}

export interface CustomRenderOpts extends RenderOpts {
  slug: string;
  /** Served URL of photo n (1-based). Default `/s/<slug>/photo/<n>`. */
  photoUrl?: (n: number, photo: CustomPhoto) => string;
}

/** The model sees photos as p1…pN in array order. */
export const photoKey = (i: number) => `p${i + 1}`;
export const defaultPhotoUrl = (slug: string, n: number) => `/s/${encodeURIComponent(slug)}/photo/${n}`;

// ───────────────────────────────────────────────────────────── fonts

/** Google Fonts css2 axis spec per whitelisted family (types.ts FONT_WHITELIST). Unknown → regular weight only. */
const AXES: Record<string, string> = {
  Fraunces: "ital,opsz,wght@0,9..144,100..900;1,9..144,100..900",
  "Instrument Sans": "ital,wght@0,400..700;1,400..700",
  "Instrument Serif": "ital@0;1",
  Inter: "ital,opsz,wght@0,14..32,100..900;1,14..32,100..900",
  "Bricolage Grotesque": "opsz,wght@12..96,200..800",
  "DM Serif Display": "ital@0;1",
  "DM Sans": "ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000",
  "Space Grotesk": "wght@300..700",
  "Libre Caslon Text": "ital,wght@0,400;0,700;1,400",
  "Libre Baskerville": "ital,wght@0,400;0,700;1,400",
  Manrope: "wght@200..800",
  Outfit: "wght@100..900",
  Syne: "wght@400..800",
  "Young Serif": "",
  "IBM Plex Sans": "ital,wght@0,300;0,400;0,500;0,600;0,700;1,400",
  "IBM Plex Serif": "ital,wght@0,300;0,400;0,500;0,600;1,300;1,400",
  "IBM Plex Mono": "ital,wght@0,400;0,500;0,600;1,400",
  "Playfair Display": "ital,wght@0,400..900;1,400..900",
  Lora: "ital,wght@0,400..700;1,400..700",
  "Source Serif 4": "ital,opsz,wght@0,8..60,200..900;1,8..60,200..900",
  "Work Sans": "ital,wght@0,100..900;1,100..900",
  Rubik: "ital,wght@0,300..900;1,300..900",
  Karla: "ital,wght@0,200..800;1,200..800",
  Archivo: "ital,wght@0,100..900;1,100..900",
  "Archivo Black": "",
  "Familjen Grotesk": "ital,wght@0,400..700;1,400..700",
  "Schibsted Grotesk": "ital,wght@0,400..900;1,400..900",
  "Hanken Grotesk": "ital,wght@0,100..900;1,100..900",
  Figtree: "ital,wght@0,300..900;1,300..900",
  Onest: "wght@100..900",
  Unbounded: "wght@200..900",
  Gloock: "",
  "Cormorant Garamond": "ital,wght@0,300..700;1,300..700",
  "EB Garamond": "ital,wght@0,400..800;1,400..800",
  "Crimson Pro": "ital,wght@0,200..900;1,200..900",
  Newsreader: "ital,opsz,wght@0,6..72,200..800;1,6..72,200..800",
  Literata: "ital,opsz,wght@0,7..72,200..900;1,7..72,200..900",
  Epilogue: "ital,wght@0,100..900;1,100..900",
  "Red Hat Display": "ital,wght@0,300..900;1,300..900",
  Lexend: "wght@100..900",
  Urbanist: "ital,wght@0,100..900;1,100..900",
};
const SERIFS = new Set(["Fraunces", "Instrument Serif", "DM Serif Display", "Libre Caslon Text", "Libre Baskerville", "Young Serif", "IBM Plex Serif", "Playfair Display", "Lora", "Source Serif 4", "Gloock", "Cormorant Garamond", "EB Garamond", "Crimson Pro", "Newsreader", "Literata"]);
export const isSerif = (f: string) => SERIFS.has(f);
export const fontStack = (f: string) => `"${f.replace(/["\\<>]/g, "")}",${isSerif(f) ? 'Georgia,"Times New Roman",serif' : 'system-ui,-apple-system,"Segoe UI",sans-serif'}`;

/** Only letters, digits and spaces reach the URL. */
export function fontsHref(fonts: { display: string; text: string }): string {
  const fam = [...new Set([fonts.display, fonts.text])].map((f) => f.replace(/[^A-Za-z0-9 ]/g, "").trim()).filter(Boolean);
  const parts = fam.map((f) => {
    const ax = AXES[f];
    return `family=${f.replace(/ /g, "+")}${ax ? `:${ax}` : ""}`;
  });
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}

// ───────────────────────────────────────────────────────────── ctx (shared with render.ts)

export function customCtx(spec: SiteSpec, kit: Pick<Kit, "brand" | "logo">, live: LiveData, opts: CustomRenderOpts): RenderCtx {
  return buildCtx(spec, kit, live, { origin: opts.origin, preview: opts.preview, slug: opts.slug }, "light");
}

// ───────────────────────────────────────────────────────────── our chrome's CSS

/**
 * Styles for the sheet, sticky bar, waitlist states and credits. Everything is scoped under our own ids and starts
 * from `all: revert`, so the model's element rules (h2, p, a, button…) cannot restyle it; the model's CSS has every
 * selector that names these ids/classes removed by the sanitizer.
 */
export function hooksCss(t: Tokens, textFont: string, bar: boolean): string {
  const fb = fontStack(textFont);
  const surf = mix(t.bg, "#ffffff", 0.5);
  const barInk = ensureContrast(t.ink, surf, 7);
  const btnBg = ensureContrast(t.primary, surf, 3);
  return `#reserve,#reserve :not(svg,svg *),#ld-bar,#ld-bar :not(svg,svg *),#ld-foot,#ld-foot :not(svg,svg *){all:revert;box-sizing:border-box}
#reserve svg,#ld-bar svg{display:block;max-width:100%}
html.lock{overflow:hidden}
#reserve{position:fixed;inset:0;z-index:2147483000;display:none;align-items:flex-end;justify-content:center;font:400 16px/1.5 ${fb};color:#16181d;text-align:center}
#reserve:target,#reserve.on{display:flex}
#reserve .sheet-bg{position:absolute;inset:0;background:rgb(10 10 14/.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
#reserve .sheet-card{position:relative;width:min(420px,100%);max-height:100dvh;overflow:auto;background:#fff;color:#16181d;border-radius:28px 28px 0 0;padding:28px 24px calc(24px + env(safe-area-inset-bottom));animation:ld-up .35s cubic-bezier(.2,.8,.2,1)}
@keyframes ld-up{from{transform:translateY(24px);opacity:0}}
@media(min-width:640px){#reserve{align-items:center}#reserve .sheet-card{border-radius:28px}}
#reserve .sheet-x{position:absolute;right:12px;top:10px;width:44px;height:44px;display:grid;place-items:center;font-size:28px;line-height:1;text-decoration:none;color:#6b6f78}
#reserve .sheet-head{display:flex;gap:12px;align-items:center;text-align:left;padding-right:36px}
#reserve .sheet-head svg{width:40px;height:40px;flex:none;border-radius:10px}
#reserve .sh-k{margin:0;font-size:13px;color:#6b6f78}
#reserve h2{margin:0;font:600 18px/1.25 ${fb};color:#16181d;letter-spacing:0}
#reserve .sh-amt{margin:18px 0 6px;font-size:15px;color:#6b6f78}
#reserve .sh-amt b{font:700 28px/1 ${fb};color:#16181d}
#reserve .sh-qr{margin:10px auto;width:220px;padding:10px;border:1px solid #ececf0;border-radius:20px}
#reserve .sh-qr svg{width:100%;height:auto}
#reserve .sh-scan{margin:0 0 16px;font-size:13px;color:#6b6f78}
#reserve .sh-open{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:52px;border-radius:999px;background:#0ac18e;color:#fff;font:600 16px/1 ${fb};text-decoration:none}
#reserve .sh-copy{display:block;margin:10px 0 0;width:100%;min-height:44px;border-radius:999px;border:1px solid #e3e4e8;background:#fff;color:#16181d;font:600 15px/1 ${fb};cursor:pointer}
#reserve a:focus-visible,#reserve button:focus-visible,#ld-bar a:focus-visible{outline:2px solid #0ac18e;outline-offset:2px}
form[data-lead] .hp{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;opacity:0!important}
form[data-lead].done input,form[data-lead].done button{display:none!important}
form[data-lead] .wl-ok{flex-basis:100%;grid-column:1/-1;margin:0;font-weight:600}
[hidden]{display:none!important}
.sr{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important}
#ld-foot{display:block;padding:18px max(20px,env(safe-area-inset-left,0px)) 26px;background:${t.bg};color:${t.muted};font:400 12.5px/1.6 ${fb};text-align:center}
#ld-foot p{margin:0 auto 6px;max-width:900px}#ld-foot a{color:inherit;text-underline-offset:2px}
${bar ? `#ld-bar{position:fixed;left:0;right:0;bottom:0;z-index:2147482000;padding:10px 12px calc(10px + env(safe-area-inset-bottom));font:600 15px/1.2 ${fb};transition:transform .35s cubic-bezier(.2,.8,.2,1),opacity .35s}
#ld-bar.hide{transform:translateY(120%);opacity:0;pointer-events:none}
#ld-bar .ld-bar-in{max-width:560px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 8px 8px 12px;border-radius:999px;background:${surf}e6;color:${barInk};border:1px solid ${t.line};-webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4);box-shadow:0 12px 32px -12px rgb(0 0 0/.35)}
#ld-bar .ld-bar-name{display:flex;align-items:center;gap:10px;min-width:0}
#ld-bar .ld-bar-name span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ld-bar .ld-bar-name svg{width:26px;height:26px;flex:none;border-radius:7px}
#ld-bar .ld-bar-btn{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 18px;border-radius:999px;background:${btnBg};color:${onColor(btnBg)};text-decoration:none;white-space:nowrap}
@media(min-width:900px){#ld-bar{display:none}}
@media(max-width:899px){html body{padding-bottom:84px}}
@media(prefers-reduced-motion:reduce){#ld-bar,#reserve .sheet-card{transition:none;animation:none}}` : ""}`;
}

// ───────────────────────────────────────────────────────────── safety net (after the model's CSS)

/**
 * A last-in-cascade stylesheet that fixes the slips a model makes whatever it writes: portrait photo towers on phones,
 * numerals that wrap ("€10– / 15"), headings touching their paragraph, buttons in the system font, a hero label that
 * covers the phone photo. Most typographic rules use :where() (zero specificity: the model's own rules still win); the
 * heading gap beats a bare `p{margin:0}` reset; the phone photo rules use !important because they must win. `chars` = character counts of the .num elements on the page.
 */
export function guardCss(chars: number[] = []): string {
  const caps = [...new Set(chars.filter((n) => n >= 5))]
    .sort((a, b) => a - b)
    .map((n) => `.ld-c${n}{font-size:min(${(150 / n).toFixed(1)}vw,6rem)!important}`)
    .join("");
  return `:where(button,input,select,textarea){font:inherit}
main :is(h1,h2,h3)+p{margin-top:.75em}
:where(.num){white-space:nowrap;font-variant-numeric:lining-nums tabular-nums}
:where(main) :where(s,del){white-space:nowrap}
:where(main) img{max-width:100%}
.ld-coin{display:inline-block;width:1.1em;height:1.1em;flex:none;vertical-align:-.2em;margin-right:.45em}
:where([data-reserve]){gap:.35em}
:where(main) :where(div,li,p,dd)>b+span::before{content:"\\a0"}
.ld-note{margin:.6em 0 0;font-size:.8125rem;line-height:1.4;letter-spacing:.01em;opacity:.82}
@media(max-width:560px){
main section:not([data-hero]) :is(figure,article,li,picture):has(img){aspect-ratio:auto!important;height:auto!important;min-height:0!important}
main section:not([data-hero]) :is(figure,article,li,picture) img{position:static!important;width:100%!important;height:auto!important;aspect-ratio:4/3!important;object-fit:cover!important}
main section:not([data-hero]) img{max-height:min(62svh,480px);object-fit:cover}
[data-hero] img{max-height:min(70svh,560px)}
[data-hero] .hero-tag{max-width:min(70%,240px)!important;font-size:.8125rem!important;padding:.7em .9em!important}
.num{white-space:nowrap}
${caps}
}`;
}

/** Adds the coin mark to every reserve button and a size class to big numerals (for the phone cap). */
export function decorateBody(body: string): { body: string; chars: number[] } {
  const coin = BCH_COIN.replace("<svg ", '<svg class="ld-coin" ');
  const chars: number[] = [];
  let out = body.replace(/(<a\b[^>]*\sdata-reserve(?:\s[^>]*)?>)(?!<svg)/g, `$1${coin}`);
  out = out.replace(/<(\w+)([^>]*?)\sclass="([^"]*)"([^>]*)>([^<]{1,24})<\//g, (m, tag: string, a: string, cls: string, b: string, text: string) => {
    if (!/(^|\s)num(\s|$)/.test(cls)) return m;
    const n = [...text.replace(/&[a-z#0-9]+;/gi, "x").trim()].length;
    if (n < 5) return m;
    chars.push(Math.min(n, 16));
    return `<${tag}${a} class="${cls} ld-c${Math.min(n, 16)}"${b}>${text}</`;
  });
  return { body: out, chars };
}

// ───────────────────────────────────────────────────────────── fixed labels in the page's language

/** The small fixed words the designer writes in English whatever the page language ("Source: example.com"). */
const LABELS: Record<string, { source: string; sources: string; photo: string }> = {
  en: { source: "Source", sources: "Sources", photo: "Photo" },
  es: { source: "Fuente", sources: "Fuentes", photo: "Foto" },
  ca: { source: "Font", sources: "Fonts", photo: "Foto" },
  fr: { source: "Source", sources: "Sources", photo: "Photo" },
  pt: { source: "Fonte", sources: "Fontes", photo: "Foto" },
  it: { source: "Fonte", sources: "Fonti", photo: "Foto" },
  de: { source: "Quelle", sources: "Quellen", photo: "Foto" },
};
const ANY_SOURCE = "Sources?|Fuentes?|Fonts?|Fontes?|Fonti|Quellen?";
/** Pure: the label at the start of a link or small text ("Source:", "Fuente:", "Photo:") in the page language
 *  (brand/spec lang; English when the language is not listed). Only labels followed by a colon are touched. */
export function localizeLabels(body: string, lang: string): string {
  const L = LABELS[String(lang ?? "").toLowerCase().slice(0, 2)] ?? LABELS.en!;
  return body
    .replace(new RegExp(`(<(?:a|small|span|cite|figcaption|p)\\b[^>]*>\\s*)(${ANY_SOURCE})(\\s*:)`, "gi"), (_m, open: string, word: string, colon: string) =>
      `${open}${/(?:s|ti|en)$/i.test(word) ? L.sources : L.source}${colon}`)
    .replace(/(<(?:small|span|figcaption)\b[^>]*>\s*)(Photo|Foto)(\s*:)/gi, (_m, open: string, _w: string, colon: string) => `${open}${L.photo}${colon}`);
}

// ───────────────────────────────────────────────────────────── assembly

const LICENSE: Record<string, string> = { cc0: "CC0", pdm: "Public domain", by: "CC BY", "by-sa": "CC BY-SA" };

function creditsLine(photos: CustomPhoto[], used: Set<string>, lang: string): string {
  const items = photos
    .map((p, i) => ({ p, key: photoKey(i) }))
    .filter(({ p, key }) => used.has(key) && p.credit)
    .map(({ p }) => {
      const lic = p.license ? ` (${esc(LICENSE[p.license.toLowerCase()] ?? p.license.toUpperCase())})` : "";
      const txt = `${esc(p.credit)}${lic}`;
      return p.sourceUrl && /^https:\/\/[^\s"'<>]+$/.test(p.sourceUrl) ? `<a href="${esc(p.sourceUrl)}" rel="noopener nofollow" target="_blank">${txt}</a>` : txt;
    });
  if (!items.length) return "";
  return `<p>${lang.startsWith("es") ? "Fotos" : "Photos"}: ${items.join(" · ")}</p>`;
}

/** Sanitizer context for one page. */
export function pageCtx(row: CustomRow, c: RenderCtx, opts: CustomRenderOpts) {
  const photos: Record<string, SanitizePhoto> = {};
  row.photos.forEach((p, i) => {
    photos[photoKey(i)] = { url: opts.photoUrl ? opts.photoUrl(i + 1, p) : defaultPhotoUrl(opts.slug, i + 1), width: p.width, height: p.height, alt: p.alt };
  });
  return {
    mode: "page" as const,
    photos,
    links: "any-https" as const, // stat links were checked against the report when the page was made
    reserveEnabled: Boolean(row.spec.reserve.address),
    fonts: row.kit.brand.fonts,
    leadAction: c.leadAction,
    thanks: c.ui.thanks,
    emailLabel: c.ui.emailPlaceholder,
    ...(row.spec.reserve.address ? { reserveNote: row.spec.lang.startsWith("es") ? "Paga con Bitcoin Cash · al instante · sin cuenta" : "Pay with Bitcoin Cash · instant · no account" } : {}),
  };
}

/** The full bespoke page, or null (→ caller renders the standard design). */
export function customRender(row: CustomRow, live: LiveData, opts: CustomRenderOpts): string | null {
  if (!row.html || row.html.length > 120_000) return null;
  const c = customCtx(row.spec, row.kit, live, opts);
  const sctx = pageCtx(row, c, opts);
  let s: Sanitized;
  try {
    s = sanitize(row.html, sctx);
  } catch (e) {
    console.error("[site-custom] sanitize failed", e);
    return null;
  }
  if (s.problems.length) {
    console.warn(`[site-custom] ${opts.slug} rejected at render: ${s.problems.join("; ")}`);
    return null;
  }
  const { spec, kit } = row;
  const deco = decorateBody(localizeLabels(s.body, row.spec.lang || row.kit.brand.lang));
  s = { ...s, body: deco.body };
  const brand = kit.brand;
  const t = c.t;
  const origin = (opts.origin ?? "").replace(/\/$/, "");
  const url = origin ? `${origin}/s/${encodeURIComponent(opts.slug)}` : "";
  const heroIdx = s.heroPhoto ? Number(s.heroPhoto.slice(1)) - 1 : -1;
  const heroUrl = heroIdx >= 0 && origin ? origin + sctx.photos[s.heroPhoto!]!.url : "";
  const favicon = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${c.logo ?? `<rect width="64" height="64" rx="16" fill="${t.primary}"/>`}</svg>`)}`;
  const r = spec.reserve;
  const cur = r.currency || brand.currency || "$";
  const offer = sectionOf(spec, "offer");
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: brand.name, slogan: brand.tagline, ...(url ? { url } : {}), ...(heroUrl ? { image: heroUrl } : {}), ...(brand.city ? { address: { "@type": "PostalAddress", addressLocality: brand.city } } : {}) },
      ...(r.price > 0 ? [{ "@type": "Product", name: offer?.item || brand.name, brand: brand.name, offers: { "@type": "Offer", price: r.price, priceCurrency: ({ "€": "EUR", "$": "USD", "£": "GBP" } as Record<string, string>)[currencySymbol(cur)] ?? cur, availability: "https://schema.org/PreOrder" } }] : []),
    ],
  };
  const withBar = Boolean(r.address);
  const head = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`,
    `<title>${esc(spec.seo.title)}</title>`,
    `<meta name="description" content="${esc(spec.seo.description)}">`,
    `<meta name="theme-color" content="${esc(t.bg)}">`,
    opts.preview ? `<meta name="robots" content="noindex">` : "",
    url ? `<link rel="canonical" href="${esc(url)}">` : "",
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(brand.name)}">`,
    `<meta property="og:title" content="${esc(spec.seo.title)}">`,
    `<meta property="og:description" content="${esc(spec.seo.description)}">`,
    url ? `<meta property="og:url" content="${esc(url)}">` : "",
    heroUrl ? `<meta property="og:image" content="${esc(heroUrl)}">` : "",
    `<meta name="twitter:card" content="${heroUrl ? "summary_large_image" : "summary"}">`,
    `<link rel="icon" href="${favicon}">`,
    `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link rel="stylesheet" href="${esc(fontsHref(brand.fonts))}">`,
    `<style>${hooksCss(t, brand.fonts.text, withBar)}</style>`,
    `<style>${s.css}</style>`,
    `<style>${guardCss(deco.chars)}</style>`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`,
  ].filter(Boolean);

  const used = new Set<string>([...s.body.matchAll(/<img [^>]*src="([^"]+)"/g)].map((m) => Object.entries(sctx.photos).find(([, p]) => p.url === m[1])?.[0] ?? ""));
  const sheet = withBar ? (chrome(c).split('<div class="bar"')[0] ?? "").replace('<svg class="mark"', '<svg class="ld-mark"') : "";
  const bar = withBar
    ? `<div id="ld-bar" data-bar><div class="ld-bar-in"><span class="ld-bar-name">${mark(c, 26, "ld-mark")}<span>${c.price ? `<b>${esc(c.price)}</b>` : esc(brand.name)}</span></span><a class="ld-bar-btn" href="#reserve" data-reserve>${BCH_COIN}<span>${esc(c.ui.reserve)}</span></a></div></div>`
    : "";
  const foot = `<div id="ld-foot">${creditsLine(row.photos, used, spec.lang)}${credit(c)}</div>`;
  const hasTop = /\sid="top"/.test(s.body);
  return `<!doctype html><html lang="${esc(spec.lang)}" data-template="custom"><head>${head.join("\n")}</head><body${hasTop ? "" : ` id="top"`}>
${s.body}
${foot}
${sheet}${bar}
<script>${SITE_JS}</script>
</body></html>`;
}
