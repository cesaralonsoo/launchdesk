// WP1 Website: pieces every template shares (escaping, icons, logo, reserve sheet, waitlist, sticky bar, script).
import type { KitBrand } from "../../kit-contract.js";
import type { IconName, Section, SiteSpec, SiteUi } from "../spec.js";
import type { Tokens } from "../validate.js";

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface RenderCtx {
  spec: SiteSpec;
  brand: KitBrand;
  /** Inner SVG of the chosen logo (viewBox 0 0 64 64), already linted; null → monogram. */
  logo: string | null;
  t: Tokens;
  ui: SiteUi;
  slug: string;
  price: string; // "€29" or ""
  normal: string; // "€39" or ""
  bch: string; // "0.0752" or ""
  payUri: string;
  qr: string; // svg markup
  reserved: number;
  leadCount: number;
  homeHref: string;
  leadAction: string;
  /** Real photos for this site (same-origin URLs), hero first. Empty/undefined → the design shows the logo art. */
  photos?: CtxPhoto[];
  /** Footer credit for those photos (required for CC BY / BY-SA). */
  photoCredits?: CtxPhotoCredit[];
}

export interface CtxPhoto { url: string; alt: string; width: number; height: number }
export interface CtxPhotoCredit { label: string; href: string; license: string; licenseUrl: string }

/** A photo as an <img>. The hero loads eagerly; the rest lazily. */
export function photoImg(p: CtxPhoto, eager = false): string {
  const w = Math.max(1, Math.round(p.width));
  const h = Math.max(1, Math.round(p.height));
  return `<img src="${esc(p.url)}" alt="${esc(p.alt)}" width="${w}" height="${h}"${eager ? ` fetchpriority="high"` : ` loading="lazy"`} decoding="async">`;
}

/** One image section: up to 3 more photos after the hero one (nothing when there are none). */
export function photoBand(c: RenderCtx): string {
  const more = (c.photos ?? []).slice(1, 4);
  if (!more.length) return "";
  return `<section class="pband" aria-label="${esc(c.brand.name)}"><div class="wrap"><div class="pgrid n${more.length}">${more.map((p) => `<figure class="rv">${photoImg(p)}</figure>`).join("")}</div></div></section>`;
}

/** "Photos: … (CC0) · …" with links to each source and licence. */
export function photoCreditLine(c: RenderCtx): string {
  const items = c.photoCredits ?? [];
  if (!items.length) return "";
  const safe = (u: string) => /^https:\/\/[^\s"'<>]+$/.test(u);
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const i of items) {
    const key = `${i.label}|${i.license}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = safe(i.href) ? `<a href="${esc(i.href)}" rel="noopener nofollow" target="_blank">${esc(i.label)}</a>` : esc(i.label);
    const lic = safe(i.licenseUrl) ? `<a href="${esc(i.licenseUrl)}" rel="noopener nofollow" target="_blank">${esc(i.license)}</a>` : esc(i.license);
    parts.push(`${label} (${lic})`);
  }
  return `<p class="pcred">${c.spec.lang.toLowerCase().startsWith("es") ? "Fotos" : "Photos"}: ${parts.join(" · ")}</p>`;
}

export const sectionOf = <K extends Section["kind"]>(spec: SiteSpec, kind: K) =>
  spec.sections.find((s) => s.kind === kind) as Extract<Section, { kind: K }> | undefined;

const P: Record<IconName, string> = {
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5",
  check: "M5 12.5l4.2 4.2L19 7",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  calendar: "M4 6.5h16v13.5H4zM4 10.5h16M8 3.5v4M16 3.5v4",
  "map-pin": "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  chat: "M4 5h16v11H9l-5 4z",
  heart: "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z",
  shield: "M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6zM8.8 12l2.2 2.2 4.4-4.4",
  leaf: "M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19l7-7",
  sun: "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  moon: "M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z",
  coffee: "M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M12 3.5v2.5",
  bread: "M5 11a4 4 0 0 1 1-7.8h12A4 4 0 0 1 19 11v8H5zM9 11v8M15 11v8",
  cake: "M4 20h16v-7H4zM4 15.5c2 1.3 4 1.3 5.3 0 1.4 1.3 4 1.3 5.4 0 1.3 1.3 3.3 1.3 5.3 0M12 13V9M12 6.5a1.3 1.3 0 0 0 1.3-1.3C13.3 4 12 3 12 3s-1.3 1-1.3 2.2A1.3 1.3 0 0 0 12 6.5z",
  cup: "M6 4h12l-1.5 16h-9zM6.6 9h10.8",
  gift: "M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1.5-3.5-6-3.5-5 0M12 7c1.5-3.5 6-3.5 5 0",
  bag: "M5 8h14l-1 12H6zM9 8V6.5a3 3 0 0 1 6 0V8",
  truck: "M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  home: "M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5",
  paw: "M12 20c-3 0-5-1.6-5-3.6 0-2.4 2.4-4.9 5-4.9s5 2.5 5 4.9c0 2-2 3.6-5 3.6zM6 11.5a1.8 2.2 0 1 0 0-.1zM18 11.5a1.8 2.2 0 1 0 0-.1zM9.3 7.5a1.8 2.3 0 1 0 0-.1zM14.7 7.5a1.8 2.3 0 1 0 0-.1z",
  dog: "M5 9l2-5 3 3h4l3-3 2 5v5a7 7 0 0 1-14 0zM9.5 12h.01M14.5 12h.01M11 16h2",
  walk: "M13 4.5a1.5 1.5 0 1 0 0-.1zM10 21l2-6 2.5 2.5V21M8 12l2.5-4h3l2.5 4 2 1M12.5 8L11 13",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14a6.5 6.5 0 0 1 3.5 6",
  smile: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01",
  hand: "M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v6.5M14 10V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-12.5 4.3L3 15.5a1.6 1.6 0 0 1 2.6-1.9L8 16",
  key: "M8 15.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM11.5 11H21M18 11v3M15 11v2",
  lock: "M5 11h14v10H5zM8 11V7.5a4 4 0 0 1 8 0V11",
  bolt: "M13 3L5 13.5h6L10 21l8-10.5h-6z",
  chart: "M4 20h16M7 16v-4M11.5 16V8M16 16v-6.5M20 5l-5 4.5-4-3L5 10",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z",
  rocket: "M5 19c1-3 2.5-4.5 4.5-4.5M9.5 14.5c-1-1-1.5-2.5-1-4C10 6 14 3.5 20 4c.5 6-2 10-6.5 11.5-1.5.5-3 0-4-1zM15 9.5h.01M8 11l-3 .5 2.5-3h3M13 16l-.5 3 3-2.5v-3",
  code: "M8.5 8L4.5 12l4 4M15.5 8l4 4-4 4M13.5 5l-3 14",
  laptop: "M5 5h14v10H5zM3 19h18",
  mail: "M3.5 5.5h17v13h-17zM3.5 6l8.5 7 8.5-7",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
  search: "M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM15.5 15.5L20.5 20.5",
  wand: "M4 20L15.5 8.5M14 5l1-2 1 2 2 1-2 1-1 2-1-2-2-1zM19 11l.6-1.4L21 9l-1.4-.6L19 7l-.6 1.4L17 9l1.4.6z",
  layers: "M12 3.5l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  repeat: "M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3",
  wallet: "M4 6.5h14a2 2 0 0 1 2 2V19H6a2 2 0 0 1-2-2zM4 6.5A2.5 2.5 0 0 1 6.5 4H16v2.5M16 13h4",
  tag: "M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5zM8 8.5h.01",
  book: "M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2zM4 20a2 2 0 0 0 2 2h13v-4",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  camera: "M3.5 8h4l2-3h5l2 3h4v11h-17zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  scissors: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.5 7.5L20 18M8.5 16.5L20 6",
  tool: "M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-2-2z",
  plant: "M12 21v-8M12 13c0-4 2.5-6.5 7-6.5 0 4.5-2.5 6.5-7 6.5zM12 15c0-3-2-5-6-5 0 3.5 2 5 6 5zM7 21h10",
  flame: "M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-1.5-2-1.5-3C7.5 10 6 12.5 6 15a6 6 0 0 0 6 6z",
  drop: "M12 3.5s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10.5 12 3.5 12 3.5z",
  wifi: "M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z",
  trophy: "M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 20h8",
};

export function icon(name: IconName, size = 22, sw = 1.7): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name] ?? P.spark}"/></svg>`;
}

/** The logo mark (64×64 inner SVG) or a monogram tile in the brand colour. */
export function mark(c: RenderCtx, size: number, cls = "mark"): string {
  if (c.logo) return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${c.logo}</svg>`;
  const ch = esc((c.brand.name.trim()[0] ?? "L").toUpperCase());
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="${c.t.primary}"/><text x="32" y="43" text-anchor="middle" font-size="30" font-weight="700" font-family="var(--fd)" fill="${c.t.onPrimary}">${ch}</text></svg>`;
}

export const fill = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

export const reserveLabel = (c: RenderCtx) => (c.price ? fill(c.ui.reserveFor, { price: c.price }) : c.ui.reserve);

export const BCH_COIN = `<svg width="18" height="18" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" stroke-width="8"/><g transform="rotate(-14 50 50)" fill="currentColor"><path fill-rule="evenodd" d="M38 26h17.5c8.6 0 13.5 4.3 13.5 10.6 0 4.6-2.6 7.6-6.4 8.8 4.9 1 8.2 4.5 8.2 9.7 0 7.2-5.5 12-14.7 12H38zm10 8.4v10.3h6.3c3.7 0 5.6-1.9 5.6-5.2s-1.9-5.1-5.6-5.1zm0 18v11.2h7.4c4.1 0 6.3-2 6.3-5.6s-2.2-5.6-6.3-5.6z"/><rect x="44" y="18" width="5" height="10" rx="1.5"/><rect x="53" y="18" width="5" height="10" rx="1.5"/><rect x="44" y="65" width="5" height="10" rx="1.5"/><rect x="53" y="65" width="5" height="10" rx="1.5"/></g></svg>`;

/** The primary "Reserve with BCH" button (a link to the sheet; JS opens it without a jump). */
export const reserveBtn = (c: RenderCtx, label = reserveLabel(c), cls = "btn btn-p") =>
  `<a class="${cls}" href="#reserve" data-reserve>${BCH_COIN}<span>${esc(label)}</span></a>`;

/** Price block: "€29  normally €39" + "Only 100 available". */
export function priceLine(c: RenderCtx): string {
  if (!c.price) return "";
  const was = c.normal ? `<s class="was">${esc(fill(c.ui.normally, { price: c.normal }))}</s>` : "";
  return `<div class="price"><b>${esc(c.price)}</b>${was}</div>`;
}

export function scarcity(c: RenderCtx): string {
  const bits: string[] = [];
  // No "Only N available": the limit comes from the analysis, not from the founder, so it would be a made-up number.
  if (c.reserved > 0) bits.push(esc(fill(c.ui.reserved, { n: c.reserved })));
  return bits.length ? `<p class="scarce"><i></i>${bits.join(" · ")}</p>` : "";
}

export function waitlist(c: RenderCtx, cls = "wl"): string {
  return `<form class="wl" method="post" action="${esc(c.leadAction)}" data-lead>
<label class="sr" for="wl-${cls}">${esc(c.ui.emailPlaceholder)}</label>
<input id="wl-${cls}" type="email" name="email" required maxlength="160" autocomplete="email" placeholder="${esc(c.ui.emailPlaceholder)}">
<input type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
<button type="submit">${esc(c.ui.joinList)}</button>
<p class="wl-ok" role="status" hidden>${esc(c.ui.thanks)}</p>
<p class="wl-note">${esc(c.ui.privacy)}</p>
</form>`;
}

export function faqList(items: Array<{ q: string; a: string }>): string {
  return items.map((f, i) => `<details${i === 0 ? " open" : ""}><summary><span>${esc(f.q)}</span><i aria-hidden="true"></i></summary><p>${esc(f.a)}</p></details>`).join("");
}

export function sourceLink(c: RenderCtx, url: string, host: string): string {
  return `<a class="src" href="${esc(url)}" rel="noopener nofollow" target="_blank">${esc(c.ui.source)}: ${esc(host)} ↗</a>`;
}

/** The reserve sheet (works with no JS through :target), the sticky mobile bar and the footer credit. */
export function chrome(c: RenderCtx): string {
  const s = c.spec;
  const offer = sectionOf(s, "offer");
  const amount = c.bch ? `<p class="sh-amt"><b>${esc(c.bch)} BCH</b>${c.price ? ` <span>≈ ${esc(c.price)}</span>` : ""}</p>` : c.price ? `<p class="sh-amt"><b>${esc(c.price)}</b></p>` : "";
  const sheet = s.reserve.address
    ? `<div class="sheet" id="reserve" role="dialog" aria-modal="true" aria-labelledby="sh-t">
<a class="sheet-bg" href="#" data-close aria-label="${esc(c.ui.close)}"></a>
<div class="sheet-card">
<a class="sheet-x" href="#" data-close aria-label="${esc(c.ui.close)}">×</a>
<div class="sheet-head">${mark(c, 40)}<div><p class="sh-k">${esc(c.brand.name)}</p><h2 id="sh-t">${esc(offer?.item || c.ui.reserve)}</h2></div></div>
${amount}
<div class="sh-qr">${c.qr}</div>
<p class="sh-scan">${esc(c.ui.scan)}</p>
<a class="btn btn-p sh-open" href="${esc(c.payUri)}">${BCH_COIN}<span>${esc(c.ui.openWallet)}</span></a>
<button class="sh-copy" type="button" data-copy="${esc(s.reserve.address)}" data-copied="${esc(c.ui.copied)}">${esc(c.ui.copy)}</button>
</div></div>`
    : "";
  const bar = `<div class="bar" data-bar><div class="bar-in"><span class="bar-name">${mark(c, 26)}<span>${c.price ? `<b>${esc(c.price)}</b>` : esc(c.brand.name)}</span></span>${reserveBtn(c, c.ui.reserve, "btn btn-p btn-sm")}</div></div>`;
  return sheet + bar;
}

export const credit = (c: RenderCtx) => `<a class="credit" href="${esc(c.homeHref)}" rel="noopener">${esc(c.ui.madeWith)}</a>`;

/** Inline behaviour: reveal on scroll, reserve sheet, copy, waitlist via fetch, sticky bar after the hero. */
export const SITE_JS = `(()=>{const d=document,h=d.documentElement;h.classList.add("js");
const io="IntersectionObserver"in window&&!matchMedia("(prefers-reduced-motion: reduce)").matches?new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}},{rootMargin:"0px 0px -8% 0px"}):null;
d.querySelectorAll(".rv").forEach(el=>io?io.observe(el):el.classList.add("in"));
const sh=d.getElementById("reserve");const open=e=>{if(!sh)return;e&&e.preventDefault();sh.classList.add("on");h.classList.add("lock")};const close=e=>{e&&e.preventDefault();sh&&sh.classList.remove("on");h.classList.remove("lock");if(location.hash==="#reserve")history.replaceState(null,"",location.pathname+location.search)};
d.querySelectorAll("[data-reserve]").forEach(a=>a.addEventListener("click",open));d.querySelectorAll("[data-close]").forEach(a=>a.addEventListener("click",close));d.addEventListener("keydown",e=>{if(e.key==="Escape")close()});if(location.hash==="#reserve")open();
d.querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);const t=b.textContent;b.textContent=b.dataset.copied;setTimeout(()=>b.textContent=t,1600)}catch{}}));
d.querySelectorAll("form[data-lead]").forEach(f=>f.addEventListener("submit",async e=>{e.preventDefault();const b=f.querySelector("button");b.disabled=true;try{const r=await fetch(f.action,{method:"POST",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify({email:f.email.value,website:f.website.value})});if(r.ok){f.classList.add("done");f.querySelector(".wl-ok").hidden=false}else b.disabled=false}catch{b.disabled=false}}));
const bar=d.querySelector("[data-bar]"),hero=d.querySelector("[data-hero]");if(bar&&hero&&"IntersectionObserver"in window){bar.classList.add("hide");new IntersectionObserver(([e])=>bar.classList.toggle("hide",e.isIntersecting),{threshold:0}).observe(hero)}
if(/[?&]joined=1/.test(location.search))d.querySelectorAll(".wl-ok").forEach(p=>p.hidden=false);})();`;

/** CSS every template includes: reset, tokens wiring, sheet, bar, waitlist, faq, reveal. Templates add their look. */
export function baseCss(t: Tokens): string {
  return `:root{--bg:${t.bg};--sf:${t.surface};--ink:${t.ink};--mu:${t.muted};--ln:${t.line};--p:${t.primary};--op:${t.onPrimary};--a:${t.accent};--oa:${t.onAccent};--tint:${t.tint};--r:16px;--w:1160px;color-scheme:light}
*,*::before,*::after{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}html.lock{overflow:hidden}
body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.6 var(--fb);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:clip}main{overflow-x:clip}
@media(max-width:560px){.nav .btn-sm{display:none}}
img,svg{display:block;max-width:100%}a{color:inherit}h1,h2,h3,p{margin:0}button,input{font:inherit}
.wrap{width:min(var(--w),100% - 40px);margin-inline:auto}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.hp{position:absolute;left:-9999px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 26px;border-radius:999px;font:600 16px/1 var(--fb);text-decoration:none;white-space:nowrap;transition:transform .2s ease,box-shadow .2s ease,background .2s}
.btn:hover{transform:translateY(-1px)}.btn:active{transform:translateY(0)}
.btn-p{background:var(--p);color:var(--op);box-shadow:0 1px 0 rgb(255 255 255/.18) inset,0 10px 24px -10px color-mix(in srgb,var(--p) 70%,transparent)}
.btn-g{color:var(--ink);border:1px solid var(--ln)}.btn-g:hover{border-color:var(--ink)}
.btn-sm{min-height:44px;padding:0 18px;font-size:15px}
.price{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.price b{font:700 clamp(40px,6vw,56px)/1 var(--fd);letter-spacing:-.02em}.price .was{color:var(--mu);font-size:16px}
.scarce{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--mu)}.scarce i{width:8px;height:8px;border-radius:50%;background:var(--a);box-shadow:0 0 0 4px color-mix(in srgb,var(--a) 22%,transparent)}
.src{font-size:13px;color:var(--mu);text-decoration:none;border-bottom:1px solid var(--ln)}.src:hover{color:var(--ink)}
details{border-bottom:1px solid var(--ln)}details summary{list-style:none;display:flex;justify-content:space-between;gap:20px;padding:22px 0;cursor:pointer;font-weight:600;font-size:18px}
details summary::-webkit-details-marker{display:none}details summary i{flex:none;width:28px;height:28px;border-radius:50%;border:1px solid var(--ln);position:relative;transition:transform .25s}
details summary i::before,details summary i::after{content:"";position:absolute;left:50%;top:50%;width:11px;height:1.6px;background:currentColor;transform:translate(-50%,-50%)}details summary i::after{transform:translate(-50%,-50%) rotate(90deg)}
details[open] summary i{transform:rotate(45deg)}details p{padding:0 48px 24px 0;color:var(--mu)}
.wl{display:grid;grid-template-columns:1fr auto;gap:8px;max-width:460px}.wl input[type=email]{min-height:52px;padding:0 18px;border-radius:999px;border:1px solid var(--ln);background:var(--sf);color:var(--ink);min-width:0}
.wl input:focus{outline:2px solid var(--p);outline-offset:1px}.wl button{min-height:52px;padding:0 22px;border-radius:999px;border:0;background:var(--ink);color:var(--bg);font-weight:600;cursor:pointer}
@media(max-width:440px){.wl{grid-template-columns:1fr}}
.wl-note,.wl-ok{grid-column:1/-1;font-size:13px;color:var(--mu)}.wl-ok{color:var(--ink);font-weight:600}.wl.done input,.wl.done button{display:none}
.sheet{position:fixed;inset:0;z-index:50;display:none;align-items:flex-end;justify-content:center}.sheet:target,.sheet.on{display:flex}
.sheet-bg{position:absolute;inset:0;background:rgb(10 10 14/.55);backdrop-filter:blur(6px)}
.sheet-card{position:relative;width:min(420px,100%);max-height:100dvh;overflow:auto;background:#fff;color:#16181d;border-radius:28px 28px 0 0;padding:28px 24px calc(24px + env(safe-area-inset-bottom));text-align:center;animation:up .35s cubic-bezier(.2,.8,.2,1)}
@media(min-width:640px){.sheet{align-items:center}.sheet-card{border-radius:28px}}
@keyframes up{from{transform:translateY(24px);opacity:0}}
.sheet-x{position:absolute;right:16px;top:12px;width:40px;height:40px;display:grid;place-items:center;font-size:26px;text-decoration:none;color:#6b6f78}
.sheet-head{display:flex;gap:12px;align-items:center;text-align:left;padding-right:32px}.sheet-head h2{font:600 18px/1.25 var(--fb)}.sh-k{font-size:13px;color:#6b6f78}
.sh-amt{margin:18px 0 6px;font-size:15px;color:#6b6f78}.sh-amt b{font:700 28px/1 var(--fb);color:#16181d;letter-spacing:-.01em}
.sh-qr{margin:10px auto;width:220px;padding:10px;border:1px solid #ececf0;border-radius:20px}.sh-qr svg{width:100%;height:auto}
.sh-scan{font-size:13px;color:#6b6f78;margin-bottom:16px}.sh-open{width:100%;background:#0ac18e;color:#fff;box-shadow:none}
.sh-copy{margin-top:10px;width:100%;min-height:44px;border-radius:999px;border:1px solid #e3e4e8;background:#fff;color:#16181d;font-weight:600;cursor:pointer}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:40;padding:10px 12px calc(10px + env(safe-area-inset-bottom));transition:transform .35s cubic-bezier(.2,.8,.2,1),opacity .35s}
.bar.hide{transform:translateY(120%);opacity:0;pointer-events:none}
.bar-in{max-width:560px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 8px 8px 14px;border-radius:999px;background:color-mix(in srgb,var(--sf) 82%,transparent);border:1px solid var(--ln);backdrop-filter:blur(14px) saturate(1.4);box-shadow:0 12px 32px -12px rgb(0 0 0/.35)}
.bar-name{display:flex;align-items:center;gap:10px;font-weight:600;min-width:0}.bar-name span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media(min-width:900px){.bar{display:none}}
.credit{font-size:13px;color:var(--mu);text-decoration:none}.credit:hover{color:var(--ink)}
.js .rv{opacity:0;transform:translateY(18px);transition:opacity .8s cubic-bezier(.2,.8,.2,1),transform .8s cubic-bezier(.2,.8,.2,1)}.js .rv.in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){.js .rv{opacity:1;transform:none;transition:none}*{animation:none!important}}
:focus-visible{outline:2px solid var(--p);outline-offset:3px}
.hph{position:relative;margin:0;border-radius:28px;overflow:hidden;background:var(--tint);aspect-ratio:4/5;box-shadow:0 40px 80px -48px rgb(0 0 0/.55)}
.hph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
@media(max-width:899px){.hph{aspect-ratio:4/3}}
.pband{padding:24px 0 8px}.pgrid{display:grid;gap:14px}.pgrid figure{margin:0;border-radius:22px;overflow:hidden;background:var(--tint);aspect-ratio:4/3}
.pgrid img{width:100%;height:100%;object-fit:cover}
.pgrid.n1 figure{aspect-ratio:21/9}
@media(min-width:760px){.pgrid.n2{grid-template-columns:1fr 1fr}.pgrid.n3{grid-template-columns:1.4fr 1fr 1fr}.pgrid.n3 figure:first-child{aspect-ratio:auto}}
@media(max-width:759px){.pgrid.n1 figure{aspect-ratio:4/3}.pgrid.n3 figure:first-child{grid-column:1/-1}.pgrid.n3{grid-template-columns:1fr 1fr}}
.pcred{flex-basis:100%;font-size:12px;line-height:1.5;color:var(--mu)}.pcred a{color:inherit;text-underline-offset:2px}
@media(max-width:899px){body{padding-bottom:84px}}`;
}
