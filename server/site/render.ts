// WP1 Website: renderSite(spec, kit, template, live) → one static HTML page (mobile-first, no framework).
// The chosen logo is read from the kit at render time, so picking another logo changes the site with no AI call.
import { createHash } from "node:crypto";
import qrcode from "qrcode-generator";
import type { Kit, SiteTemplate, StandardTemplate } from "../kit-contract.js";
import type { SiteSpec } from "./spec.js";
import { SITE_TEMPLATES } from "./spec.js";
import { baseCss, esc, reserveLabel, SITE_JS, type CtxPhoto, type CtxPhotoCredit, type RenderCtx } from "./templates/shared.js";
import * as editorial from "./templates/editorial.js";
import * as bold from "./templates/bold.js";
import * as warm from "./templates/warm.js";
import { currencySymbol, money, tokens } from "./validate.js";
import { lintSymbol } from "../brand/lint.js";

const TEMPLATES = { editorial, bold, warm } as const;

export interface LiveData {
  /** Real reservations (payments seen); 0 hides the counter. */
  reserved: number;
  /** Real waitlist sign-ups; shown only from 3. */
  leads?: number;
  /** BCH price in USD (0/undefined → the sheet shows the local price only, the wallet asks for the amount). */
  bchUsd?: number;
  /** USD per 1 unit of the offer currency (default: rough table, 1 for $). */
  usdPerUnit?: number;
}

export interface RenderOpts {
  /** Absolute origin for canonical/og links, e.g. "https://launchdesk.app". */
  origin?: string;
  /** Picker previews: noindex and no sticky bar animation. */
  preview?: boolean;
  /** Real photos (same-origin URLs), hero first, and their footer credits. */
  photos?: CtxPhoto[];
  photoCredits?: CtxPhotoCredit[];
}

const FX: Record<string, number> = { "$": 1, "€": 1.08, "£": 1.27 };

export const SCRIPT_HASH = `sha256-${createHash("sha256").update(SITE_JS).digest("base64")}`;

/** CSP for /s/* pages: our one inline script by hash, Google Fonts, data: images, nothing else. */
export const SITE_CSP = [
  "default-src 'none'",
  `script-src '${SCRIPT_HASH}'`,
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join("; ");

export function isTemplate(t: unknown): t is StandardTemplate {
  return typeof t === "string" && (SITE_TEMPLATES as readonly string[]).includes(t);
}

/** Every design a site can show: the 3 standard ones plus the page made for this business. */
export function isDesign(t: unknown): t is SiteTemplate {
  return t === "custom" || isTemplate(t);
}

export function qrSvg(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const q = 2;
  const total = n + q * 2;
  let d = "";
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.isDark(r, c)) { c++; continue; }
      let e = c;
      while (e < n && qr.isDark(r, e)) e++;
      d += `M${c + q} ${r + q}h${e - c}v1h-${e - c}z`;
      c = e;
    }
  }
  return `<svg viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#16181d"/></svg>`;
}

const bchAmount = (usd: number, bchUsd: number) => (usd > 0 && bchUsd > 0 ? (usd / bchUsd).toFixed(8).replace(/0+$/, "").replace(/\.$/, "") : "");

/**
 * The logo as it is inlined: rebuilt by WP2's allowlist linter (only known drawing elements and attributes, palette
 * colours) when the palette is known, then the old denylist as a second gate.
 */
export function safeLogo(svg: string | undefined | null, palette?: Kit["brand"]["palette"]): string | null {
  if (!svg || svg.length > 20_000) return null;
  if (palette) {
    const r = lintSymbol(svg, palette);
    if (!r.ok || !r.svg) return null;
    svg = r.svg;
  }
  if (/<\s*(script|foreignObject|iframe|image|use|style|a)\b/i.test(svg) || /\son\w+\s*=|javascript:|href\s*=|url\((?!#)/i.test(svg)) return null;
  return svg.replace(/<\/?svg[^>]*>/gi, "");
}

/** Everything a page needs to render (prices, BCH amount, QR, logo, tokens). Shared by the standard and custom pages. */
export function buildCtx(spec: SiteSpec, kit: Pick<Kit, "brand" | "logo">, live: LiveData, opts: RenderOpts & { slug?: string }, mode: "light" | "dark" | "soft"): RenderCtx {
  const brand = kit.brand;
  const t = tokens(brand.palette, mode);
  const chosen = kit.logo?.options.find((o) => o.id === kit.logo?.chosen) ?? kit.logo?.options[0];
  const logo = safeLogo(chosen?.svg, kit.brand.palette);
  const r = spec.reserve;
  const cur = r.currency || brand.currency || "$";
  const price = r.price > 0 ? money(r.price, cur, spec.lang) : "";
  const normal = r.normal ? money(r.normal, cur, spec.lang) : "";
  const usd = r.price * (live.usdPerUnit ?? FX[currencySymbol(cur)] ?? 1);
  const bch = bchAmount(usd, live.bchUsd ?? 0);
  const addr = r.address ? (r.address.startsWith("bitcoincash:") ? r.address : `bitcoincash:${r.address}`) : "";
  const payUri = addr ? (bch ? `${addr}?amount=${bch}` : addr) : "";
  const slug = opts.slug ?? "";
  const origin = (opts.origin ?? "").replace(/\/$/, "");
  return {
    spec,
    brand,
    logo,
    t,
    ui: spec.ui,
    slug,
    price,
    normal,
    bch,
    payUri,
    qr: payUri ? qrSvg(payUri) : "",
    reserved: Math.max(0, Math.floor(live.reserved || 0)),
    leadCount: live.leads ?? 0,
    homeHref: origin ? `${origin}/` : "/",
    leadAction: `/api/sites/${encodeURIComponent(slug)}/lead`,
    ...(opts.photos?.length ? { photos: opts.photos, photoCredits: opts.photoCredits ?? [] } : {}),
  };
}

export function renderSite(spec: SiteSpec, kit: Pick<Kit, "brand" | "logo">, template: SiteTemplate, live: LiveData, opts: RenderOpts & { slug?: string } = {}): string {
  const T = TEMPLATES[isTemplate(template) ? template : "editorial"];
  const brand = kit.brand;
  const ctx = buildCtx(spec, kit, live, opts, T.mode);
  const { t, logo, slug } = ctx;
  const r = spec.reserve;
  const cur = r.currency || brand.currency || "$";
  const origin = (opts.origin ?? "").replace(/\/$/, "");
  const heroImg = ctx.photos?.[0] && origin ? origin + ctx.photos[0].url : "";

  const url = origin && slug ? `${origin}/s/${encodeURIComponent(slug)}` : "";
  const favicon = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${logo ?? `<rect width="64" height="64" rx="16" fill="${t.primary}"/>`}</svg>`)}`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: brand.name, slogan: brand.tagline, ...(url ? { url } : {}), ...(brand.city ? { address: { "@type": "PostalAddress", addressLocality: brand.city } } : {}) },
      ...(r.price > 0
        ? [{ "@type": "Product", name: spec.sections.find((s) => s.kind === "offer")?.["item" as never] ?? brand.name, brand: brand.name, offers: { "@type": "Offer", price: r.price, priceCurrency: ({ "€": "EUR", "$": "USD", "£": "GBP" } as Record<string, string>)[currencySymbol(cur)] ?? cur, availability: "https://schema.org/PreOrder" } }]
        : []),
    ],
  };
  const head = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`,
    `<title>${esc(spec.seo.title)}</title>`,
    `<meta name="description" content="${esc(spec.seo.description)}">`,
    `<meta name="theme-color" content="${t.bg}">`,
    opts.preview ? `<meta name="robots" content="noindex">` : "",
    url ? `<link rel="canonical" href="${esc(url)}">` : "",
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(spec.seo.title)}">`,
    `<meta property="og:description" content="${esc(spec.seo.description)}">`,
    url ? `<meta property="og:url" content="${esc(url)}">` : "",
    heroImg ? `<meta property="og:image" content="${esc(heroImg)}">` : "",
    `<meta name="twitter:card" content="${heroImg ? "summary_large_image" : "summary"}">`,
    `<link rel="icon" href="${favicon}">`,
    `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${T.fonts.href}&display=swap">`,
    `<style>${baseCss(t)}${T.css}</style>`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`,
  ].filter(Boolean);
  return `<!doctype html><html lang="${esc(spec.lang)}" data-template="${isTemplate(template) ? template : "editorial"}"><head>${head.join("\n")}</head><body>
${T.body(ctx)}
<script>${SITE_JS}</script>
</body></html>`;
}

export { reserveLabel };
