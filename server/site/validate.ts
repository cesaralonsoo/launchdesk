// WP1 Website: deterministic repair of the model's site copy, plus colour maths (contrast auto-fix).
// Rules: clamp every string, drop unknown icons/sections, stats only when they map to a sourced report stat,
// prices and the payment address always come from code, never testimonials, no hype words.
import type { KitBrand, KitInput } from "../kit-contract.js";
import { DEFAULT_ORDER, ICONS, uiFor, type IconName, type MenuGroup, type MenuLabel, type ModelSite, type Section, type SectionKind, type SitePhotoQueries, type SiteSpec, type Stat, type Step } from "./spec.js";
import { statKind } from "./stat-kind.js";

/** Wording that says the visitor can pay (Bitcoin Cash, pay from your phone, pre-order). Only allowed when the page can take a payment. */
export const PAY_TALK = /bitcoin|\bbch\b|\bpay(?:ing|ment)?\b[^.]{0,40}\b(?:phone|wallet|reserv|hold|lock)|\b(?:reserve|hold|lock)\b[^.]{0,40}\bpa(?:y|id)\b|\bpre-?(?:order|pay)|\bpaga[rs]?\b[^.]{0,40}\b(?:m[oó]vil|cartera|reserv)/i;

// ---------- text ----------

const HYPE = /\b(revolutionary|revolutionise|revolutionize|seamless(ly)?|unlock|elevate|game[- ]?changer|cutting[- ]edge|next[- ]level|world[- ]class|best[- ]in[- ]class|disrupt(ive)?|synergy|supercharge)\b/gi;
const QUOTE_ATTRIB = /[“"«][^”"»]{8,}[”"»]\s*[—–-]\s*\p{Lu}/u;

/** Plain text: no tags, no control chars, collapsed spaces, hype removed, cut at a word with "…". */
export function clean(v: unknown, max: number): string {
  let t = typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
  t = t.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(HYPE, "").replace(/\s+([,.!?;:])/g, "$1").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:\-–—\s]+$/, "") + "…";
}

const icon = (v: unknown): IconName => ((ICONS as readonly string[]).includes(String(v)) ? (v as IconName) : "spark");
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const step = (v: { icon?: unknown; title?: unknown; body?: unknown }): Step => ({ icon: icon(v?.icon), title: clean(v?.title, 40), body: clean(v?.body, 150) });

const SYMBOL_OF: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", "€": "€", $: "$", "£": "£",
  MXN: "MX$", "MX$": "MX$", CAD: "CA$", "CA$": "CA$", "C$": "CA$", AUD: "A$", "A$": "A$", "AU$": "A$",
  BRL: "R$", "R$": "R$", INR: "₹", "₹": "₹", JPY: "¥", "¥": "¥", "US$": "$",
};
/** "€", "EUR", "$", "USD", "£", "MXN", "MX$" … → a display symbol (or the code). */
export function currencySymbol(c: string): string {
  const k = (c || "").trim().toUpperCase();
  return SYMBOL_OF[k] ?? (k || "$");
}

/** 29 → "€29" (en) or "29 €" (es); "MX$900"; a code with no symbol → "CHF 900". */
export function money(n: number, currency: string, lang: string): string {
  const sym = currencySymbol(currency);
  const v = Math.round(n * 100) / 100;
  const es = lang.toLowerCase().startsWith("es");
  const num = Number.isInteger(v) ? v.toLocaleString(es ? "es-ES" : "en-US") : v.toLocaleString(es ? "es-ES" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (/^[A-Z]{3}$/.test(sym)) return `${sym} ${num}`;
  if (sym.length > 1 && !sym.endsWith("$")) return `${num} ${sym}`;
  return es && sym === "€" ? `${num} €` : `${sym}${num}`;
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};


// ---------- the priced menu ----------

/** Ideas sold as software or online subscriptions: a price list there is "plans", and only with sourced market prices. */
const SOFTWARE = /\b(app|apps|saas|software|platform|plugin|extension|api|bot|newsletter|subscription|online tool|web tool)\b/i;

export interface PriceGuide {
  currency: string;
  /** The founder's opening offer and its regular price (null when the idea sells nothing up front). */
  offer: { what: string; price: number; normal: number | null } | null;
  /** Prices other places charge, from the report's sourced numbers (same currency only). */
  market: { low: number; high: number; examples: Array<{ value: string; label: string }> } | null;
  /** Every menu price must sit inside this band (code drops the rest). */
  band: { min: number; max: number } | null;
  software: boolean;
}

/** "€3.90", "3,50 €", "€2.50–€3.90" → [3.9], [3.5], [2.5, 3.9]. Only when the value is in the given currency. */
export function pricesIn(value: string, currency: string): number[] {
  const sym = currencySymbol(currency);
  const v = String(value ?? "");
  const code = ({ "€": "EUR", $: "USD", "£": "GBP" } as Record<string, string>)[sym] ?? sym;
  if (!v.includes(sym) && !new RegExp(`\\b${code}\\b`, "i").test(v)) return [];
  if (sym === "$" && /(?:[A-Z]{1,2})\$/.test(v)) return []; // MX$, CA$ … are not dollars
  return (v.match(/\d{1,5}(?:[.,]\d{1,2})?/g) ?? []).map((t) => Number(t.replace(",", "."))).filter((n) => n > 0 && n < 100_000);
}

/** The honest frame for menu prices: the founder's own price, the report's sourced market prices, and a band around them. */
export function priceGuide(input: KitInput): PriceGuide {
  const { brand, report } = input;
  const currency = brand.currency || "$";
  const offer = report.offer.free || !(report.offer.price > 0) ? null : { what: report.offer.what, price: report.offer.price, normal: report.offer.normal && report.offer.normal > report.offer.price ? report.offer.normal : null };
  const examples: Array<{ value: string; label: string }> = [];
  const nums: number[] = [];
  for (const st of report.stats) {
    if ((st.kind ?? statKind(st)) !== "price" || !/^https:\/\//.test(st.sourceUrl)) continue;
    const ps = pricesIn(st.value, currency);
    if (!ps.length) continue;
    nums.push(...ps);
    examples.push({ value: st.value, label: st.label });
  }
  const market = nums.length ? { low: Math.min(...nums), high: Math.max(...nums), examples: examples.slice(0, 6) } : null;
  const anchors = [...(offer ? [offer.price, offer.normal ?? offer.price] : []), ...(market ? [market.low, market.high] : [])];
  // Tight around the anchors: a small business's other lines sit near its own price (an espresso at half a flat white,
  // a cake slice a bit above it), never at a fraction or a multiple of it.
  const band = anchors.length ? { min: round2(Math.min(...anchors) * 0.5), max: round2(Math.max(...anchors) * 1.8) } : null;
  return { currency, offer, market, band, software: SOFTWARE.test(input.idea) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Menu-style price: 1.73 → 1.70, 12.3 → 12.50, 143 → 143. */
export function menuPrice(n: number): number {
  if (!(n > 0)) return 0;
  if (n < 10) return Math.round(n * 10) / 10;
  if (n < 100) return Math.round(n * 2) / 2;
  return Math.round(n);
}

const wordSet = (t: string) => new Set(String(t ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3));

/**
 * The model's menu → a priced, honest menu section, or null. Rules: 1-4 groups, up to 12 lines (at least 3 kept), every
 * price inside the guide's band (others dropped), menu-style rounding, the founder's offer is one line at its regular
 * price (marked as the offer), software only as "plans" or "services" with sourced market prices.
 */
export function menuOf(raw: Partial<ModelSite["menu"]> | null | undefined, input: KitInput, issues: string[] = []): Extract<Section, { kind: "menu" }> | null {
  const kind = String(raw?.kind ?? "none");
  if (!raw || kind === "none") return null;
  const label: MenuLabel = (["menu", "services", "classes", "plans"] as const).includes(kind as MenuLabel) ? (kind as MenuLabel) : "menu";
  const g = priceGuide(input);
  if (input.report.offer.free) { issues.push("menu dropped (free early-access list)"); return null; }
  if (!g.band) { issues.push("menu dropped (no price to anchor it)"); return null; }
  // an app that sells a service (dog walks booked in an app) may list services; either way only with sourced market prices
  if (g.software && (!(label === "plans" || label === "services") || !g.market)) { issues.push("menu dropped (software without sourced market prices)"); return null; }
  const groups: MenuGroup[] = [];
  const seen = new Set<string>();
  let total = 0;
  // The model writes flat lines with a group name (a nested schema was too large for structured outputs).
  const byGroup = new Map<string, Array<{ name?: unknown; desc?: unknown; price?: unknown; photo?: unknown }>>();
  for (const it of list<{ group?: unknown; name?: unknown; desc?: unknown; price?: unknown; photo?: unknown }>(raw.items)) {
    const gname = clean(it?.group, 30);
    if (!byGroup.has(gname) && byGroup.size >= 4) continue;
    byGroup.set(gname, [...(byGroup.get(gname) ?? []), it]);
  }
  for (const [gname, rows] of byGroup) {
    const items: MenuGroup["items"] = [];
    for (const it of rows) {
      if (total >= 12) break;
      const name = clean(it?.name, 40);
      const key = name.toLowerCase();
      const price = menuPrice(Number(it?.price));
      if (!name || seen.has(key)) continue;
      if (!(price >= g.band.min && price <= g.band.max)) { issues.push(`menu price ${it?.price} for "${name}" outside ${g.band.min}-${g.band.max}`); continue; }
      // A line the report prices (its name is in a sourced market price label, "flat white" in "Syra Coffee flat white")
      // stays inside the sourced market range: below it is moved to the low end, above it to the high end.
      const sourced = sameKindAsMarket(name, g) ? menuPrice(Math.min(g.market!.high, Math.max(g.market!.low, price))) : price;
      if (sourced !== price) issues.push(`menu price ${price} for "${name}" moved to ${sourced} (sourced range ${g.market!.low}-${g.market!.high})`);
      seen.add(key);
      items.push({ name, desc: clean(it?.desc, 90), price: sourced, ...(cleanPhotoWords(it?.photo) ? { photo: cleanPhotoWords(it?.photo) } : {}) });
      total++;
    }
    if (items.length) groups.push({ name: gname, items });
  }
  // The founder's offer is on the menu at its regular price: the line that names it best, else added first.
  if (g.offer) {
    const want = wordSet(g.offer.what);
    const regular = menuPrice(g.offer.normal ?? g.offer.price);
    let best: { gi: number; ii: number; score: number } | null = null;
    groups.forEach((gr, gi) => gr.items.forEach((it, ii) => {
      const score = [...wordSet(it.name)].filter((w) => want.has(w)).length;
      if (score > 0 && (!best || score > best.score)) best = { gi, ii, score };
    }));
    const hit = best as { gi: number; ii: number } | null;
    if (hit) groups[hit.gi]!.items[hit.ii] = { ...groups[hit.gi]!.items[hit.ii]!, price: regular, offer: true };
    else if (groups.length) { groups[0]!.items.unshift({ name: clean(g.offer.what, 40), desc: "", price: regular, offer: true }); total++; }
  }
  if (total < 3) { issues.push(`menu dropped (only ${total} lines kept)`); return null; }
  const ui = uiFor((input.brand.lang || "en").slice(0, 5));
  // "Opening menu" only for food and drink; walks, cuts or lessons get "Opening prices" whatever the model called them.
  const food = label === "menu" && FOOD_DRINK.test(`${input.idea} ${groups.flatMap((x) => [x.name, ...x.items.map((i) => i.name)]).join(" ")}`);
  const fallbackTitle = { menu: "Menu", services: "Services & prices", classes: "Classes", plans: "Plans" }[label];
  return { kind: "menu", label, title: clean(raw.title, 40) || fallbackTitle, intro: clean(raw.intro, 140), note: (food ? ui.menuNote : ui.priceNote) ?? "", groups };
}

/** Food and drink words (EN/ES): a "menu" of these is a café or food menu, anything else is a price list. */
const FOOD_DRINK = /\b(?:caf[eé]s?|coffee|espresso|latte|tea|bakery|panader[ií]a|bread|pan|pastr(?:y|ies)|cake|croissant|restaurant|food|comida|drinks?|bebidas?|bar|brunch|lunch|breakfast|desayuno|pizza|burger|sandwich|bocadillo|juice|zumo|ice cream|helado|wine|vino|beer|cerveza|kitchen|cocina)\b/i;

/** The line names something the report prices: its words appear together in one sourced market price label. */
function sameKindAsMarket(name: string, g: PriceGuide): boolean {
  if (!g.market) return false;
  const n = String(name).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (n.length < 4) return false;
  return g.market.examples.some((e) => ` ${String(e.label).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ")} `.includes(` ${n} `));
}

const cleanPhotoWords = (v: unknown) => String(v ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join(" ").slice(0, 30);

/** Model photo searches → clean English words (max 3 words each), plus each menu line's photo words as details. */
export function photoQueriesOf(raw: Partial<ModelSite["photoQueries"]> | null | undefined, menu: Extract<Section, { kind: "menu" }> | null): SitePhotoQueries | undefined {
  const words = (v: unknown, max: number) => [...new Set((typeof v === "string" ? v.split(/[,;\n]/) : list<unknown>(v)).map(cleanPhotoWords).filter((q) => q.length >= 3))].slice(0, max);
  // Menu lines round-robin across groups (a coffee, a milk drink, a pastry, then the rest), after the model's own
  // photo searches, so the first few searches already cover every kind of thing sold.
  const fromMenu: string[] = [];
  const cols = menu ? menu.groups.map((g) => g.items.map((i) => i.photo ?? "").filter((q) => q.length >= 3)) : [];
  for (let i = 0; cols.some((c) => i < c.length); i++) for (const c of cols) if (c[i]) fromMenu.push(c[i]!);
  const q = { hero: words(raw?.hero, 3), detail: [...new Set([...words(raw?.detail, 6), ...fromMenu])].slice(0, 8), people: words(raw?.people, 2) };
  return q.hero.length || q.detail.length || q.people.length ? q : undefined;
}

export interface Validated { spec: SiteSpec; issues: string[] }

/** The model's flat output → a safe SiteSpec. Never throws; fills gaps from the digest. */
export function validateModelSite(raw: Partial<ModelSite> | null | undefined, input: KitInput): Validated {
  const issues: string[] = [];
  const r = (raw ?? {}) as Partial<ModelSite>;
  const { brand, report } = input;
  const lang = (brand.lang || "en").slice(0, 5);
  const ui = uiFor(lang);
  const offerItem = clean(report.offer.what, 90);
  // a free early-access list sells nothing: every main button asks for the email, never for a reservation or payment
  const free = report.offer.free === true;
  const cta = (v: unknown, fallback: string) => {
    const t = clean(v, 28);
    return free ? (t && !/reserv|pre-?order|\bpay|\bbuy|\bbook|bch|bitcoin|checkout|\d/i.test(t) ? t : ui.joinList) : t || fallback;
  };

  const hero = {
    eyebrow: clean(r.hero?.eyebrow, 36) || clean(brand.city ? `${brand.name} · ${brand.city}` : brand.name, 36),
    headline: clean(r.hero?.headline, 70) || clean(brand.tagline, 70) || brand.name,
    sub: clean(r.hero?.sub, 200) || clean(report.pain, 200),
    cta: cta(r.hero?.cta, ui.reserve),
    secondary: clean(r.hero?.secondary, 28) || ui.howItWorks,
  };

  // Stats: only by index into the report, only with an https source, values copied from the report.
  const sourced: Stat[] = [];
  for (const i of list<number>(r.proof?.picks)) {
    const st = Number.isInteger(i) ? report.stats[i] : undefined;
    if (!st) { issues.push(`stat ${i} not in report`); continue; }
    if (!/^https:\/\//.test(st.sourceUrl) || !hostOf(st.sourceUrl)) { issues.push(`stat ${i} has no source`); continue; }
    if (/(^|\.)example\.(org|com|net)$/i.test(hostOf(st.sourceUrl))) { issues.push(`stat ${i} has a sample source`); continue; }
    if (sourced.some((x) => x.sourceUrl === st.sourceUrl && x.value === st.value)) continue;
    // a stat value is never cut mid-word ("About 24 mont…"): "about 24 months" becomes "~24 months", else the stat is skipped
    const sv = clean(st.value, 999), value = sv.length <= 14 ? sv : sv.replace(/^(?:about|around|approx\.?|approximately|roughly|~)\s*/i, "~");
    if (!value || value.length > 14) { issues.push(`stat ${i} value too long`); continue; }
    sourced.push({ value, label: clean(st.label, 90), sourceUrl: st.sourceUrl, source: hostOf(st.sourceUrl) });
    if (sourced.length === 3) break;
  }

  // A page that cannot take a Bitcoin Cash payment never says it can (no founder wallet, or a free list).
  const canPay = !free && Boolean((input.founderAddress || "").trim()) && Number(report.offer.price) > 0;
  const CLOCK = /\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s?(?:am|pm|h)\b/i;
  const lim = Number(report.offer.limit) > 0 ? String(report.offer.limit) : "";
  const limitTalk = (t: string) => Boolean(lim) && new RegExp(`(^|[^\\d.,])${lim}([^\\d.,]|$)`).test(t) && /limit|only|first|available|left|reserve early|quedan|solo|primer/i.test(t);
  const steps = list<Step>(r.how?.steps).map(step).filter((x) => x.title).filter((x) => canPay || !PAY_TALK.test(`${x.title} ${x.body}`)).slice(0, 3);
  const services = list<Step>(r.services?.items).map(step).filter((x) => x.title).slice(0, 6);
  const faq = list<{ q: unknown; a: unknown }>(r.faq?.items)
    .map((x) => ({ q: clean(x?.q, 100), a: clean(x?.a, 280) }))
    .filter((x) => x.q && x.a)
    .filter((x) => canPay || !PAY_TALK.test(`${x.q} ${x.a}`))
    // not open yet: no clock times ("between 7:30 and 9:30" read as opening hours) and no stock count from the analysis
    .filter((x) => !CLOCK.test(`${x.q} ${x.a}`) && !limitTalk(`${x.q} ${x.a}`))
    .slice(0, 6);
  const bullets = list<string>(r.offer?.bullets).map((b) => clean(b, 80)).filter(Boolean).filter((b) => canPay || !PAY_TALK.test(b)).slice(0, 4);

  const menu = menuOf(r.menu, input, issues);
  const build: Record<SectionKind, Section | null> = {
    menu,
    "how-it-works-for-customer": steps.length >= 2 ? { kind: "how-it-works-for-customer", title: clean(r.how?.title, 50) || ui.howItWorks, steps } : null,
    // a priced menu says it better: the unpriced cards only when there is no menu
    "menu-or-services": !menu && services.length >= 2 ? { kind: "menu-or-services", title: clean(r.services?.title, 50), intro: clean(r.services?.intro, 160), items: services } : null,
    "proof-stats": sourced.length ? { kind: "proof-stats", title: clean(r.proof?.title, 60), stats: sourced } : null,
    about: clean(r.about?.body, 10) ? { kind: "about", title: clean(r.about?.title, 60), body: clean(r.about?.body, 420) } : null,
    local: clean(r.local?.body, 10) || clean(r.local?.area, 10) ? { kind: "local", title: clean(r.local?.title, 50), body: clean(r.local?.body, 220), area: clean(r.local?.area, 80), hours: clean(r.local?.hours, 80) } : null,
    offer: { kind: "offer", title: clean(r.offer?.title, 60) || ui.offer, item: clean(r.offer?.item, 90) || offerItem, bullets: bullets.filter((b) => !CLOCK.test(b) && !limitTalk(b)), note: limitTalk(clean(r.offer?.note, 140)) || CLOCK.test(clean(r.offer?.note, 140)) ? "" : clean(r.offer?.note, 140) },
    faq: faq.length ? { kind: "faq", title: clean(r.faq?.title, 50) || ui.faq, items: faq } : null,
  };
  if (!build["proof-stats"] && list(r.proof?.picks).length) issues.push("no sourced stats kept");
  if (!build.faq) issues.push("faq missing");

  // Order: the model's choice, then any built section it forgot (offer always), each kind once.
  const order: SectionKind[] = [];
  for (const k of [...list<SectionKind>(r.order), ...DEFAULT_ORDER]) if (k in build && !order.includes(k) && build[k]) order.push(k);
  if (!order.includes("offer")) order.push("offer");
  // The hero already sells the offer: the first section explains (how it works / what you get), the offer follows.
  if (order[0] === "offer" && order.length > 2) order.splice(2, 0, order.shift()!);
  if (order[order.length - 1] === "offer" && order.includes("faq")) order.splice(order.indexOf("faq"), 0, order.pop()!);
  const sections = order.map((k) => build[k]!).filter(Boolean);

  // Never testimonials: drop any text that looks like an attributed quote.
  for (const sec of sections) {
    if (sec.kind === "about" && QUOTE_ATTRIB.test(sec.body)) { sec.body = ""; issues.push("quote removed from about"); }
  }

  const spec: SiteSpec = {
    v: 1,
    lang,
    seo: { title: clean(r.seo?.title, 60) || clean(`${brand.name} · ${brand.tagline}`, 60), description: clean(r.seo?.description, 155) || hero.sub.slice(0, 155) },
    hero,
    sections: sections.filter((s) => !(s.kind === "about" && !s.body)),
    finalCta: { headline: clean(r.finalCta?.headline, 60) || hero.headline, sub: clean(r.finalCta?.sub, 140), cta: cta(r.finalCta?.cta, ui.reserve) },
    footer: { tagline: clean(r.footer?.tagline, 80) || clean(brand.tagline, 80) },
    reserve: free
      ? { address: "", price: 0, normal: null, limit: null, currency: brand.currency || "$", waitlist: true }
      : {
          address: (input.founderAddress || "").trim(),
          price: Number(report.offer.price) > 0 ? Math.round(Number(report.offer.price) * 100) / 100 : 0,
          normal: Number(report.offer.normal) > Number(report.offer.price) ? Number(report.offer.normal) : null,
          limit: Number.isInteger(report.offer.limit) && Number(report.offer.limit) > 0 ? Number(report.offer.limit) : null,
          currency: brand.currency || "$",
        },
    ui,
  };
  const pq = photoQueriesOf(r.photoQueries, menu);
  if (pq) spec.photoQueries = pq;
  return { spec, issues };
}

/** Shape check for a stored spec (db / kit). Returns null when it can't be rendered. */
export function asSiteSpec(v: unknown): SiteSpec | null {
  const s = v as SiteSpec;
  if (!s || s.v !== 1 || !s.hero || !Array.isArray(s.sections) || !s.reserve || !s.ui) return null;
  return s;
}

// ---------- colour ----------

export function hex6(h: unknown, fallback: string): string {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(h ?? "").trim());
  if (!m || !m[1]) return fallback;
  return "#" + (m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1]).toLowerCase();
}
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
export function luminance(h: string): number {
  const [r, g, b] = rgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}
/** a·(1−t) + b·t */
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a), B = rgb(b);
  return toHex(A.map((v, i) => v + (B[i]! - v) * t));
}
/** Moves `fg` toward black or white until it reaches `min` contrast on `bg`. */
export function ensureContrast(fg: string, bg: string, min: number): string {
  if (contrast(fg, bg) >= min) return fg;
  const target = luminance(bg) > 0.4 ? "#000000" : "#ffffff";
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mix(fg, target, t);
    if (contrast(c, bg) >= min) return c;
  }
  return target;
}
export const onColor = (bg: string) => (contrast("#ffffff", bg) >= contrast("#111111", bg) ? "#ffffff" : "#111111");

export interface Tokens {
  bg: string; surface: string; ink: string; muted: string; line: string;
  primary: string; onPrimary: string; accent: string; onAccent: string; tint: string;
}

/**
 * Brand palette → page tokens for a template mode. "light" keeps the brand background (forced light),
 * "dark" builds a near-black page tinted with the brand. Every pair is contrast-checked.
 */
export function tokens(p: KitBrand["palette"], mode: "light" | "dark" | "soft"): Tokens {
  const primary0 = hex6(p.primary, "#1f3a5f");
  const accent0 = hex6(p.accent, "#e8a33d");
  let ink0 = hex6(p.ink, "#16181d");
  let bg0 = hex6(p.bg, "#faf7f2");
  if (luminance(ink0) > luminance(bg0)) [ink0, bg0] = [bg0, ink0];
  if (mode === "dark") {
    const bg = mix("#0b0b0f", primary0, 0.1);
    const surface = mix(bg, "#ffffff", 0.05);
    const ink = "#f4f2ee";
    const accent = ensureContrast(luminance(accent0) > luminance(primary0) ? accent0 : primary0, bg, 4.5);
    const primary = ensureContrast(mix(primary0, "#ffffff", luminance(primary0) < 0.08 ? 0.35 : 0), bg, 3);
    return { bg, surface, ink, muted: mix(ink, bg, 0.36), line: mix(ink, bg, 0.86), primary, onPrimary: onColor(primary), accent, onAccent: onColor(accent), tint: mix(bg, primary, 0.18) };
  }
  // Light page: never darker than a pale tone, so the copy always reads.
  let bg = luminance(bg0) < 0.75 ? mix(bg0, "#ffffff", 0.85) : bg0;
  if (mode === "soft") bg = mix(bg, accent0, 0.07);
  const ink = ensureContrast(ink0, bg, 12);
  const primary = ensureContrast(primary0, bg, 4.5);
  const accent = ensureContrast(accent0, bg, 2.2);
  return {
    bg,
    surface: mode === "soft" ? mix(bg, "#ffffff", 0.6) : mix(bg, "#ffffff", 0.55),
    ink,
    muted: ensureContrast(mix(ink, bg, 0.32), bg, 4.6),
    line: mix(ink, bg, 0.86),
    primary,
    onPrimary: onColor(primary),
    accent,
    onAccent: onColor(accent),
    tint: mix(bg, accent0, mode === "soft" ? 0.22 : 0.14),
  };
}
