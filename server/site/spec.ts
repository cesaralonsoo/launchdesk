// WP1 Website: the SiteSpec (what a rendered site is made of) and the JSON schema the model fills.
// The model fills a flat ModelSite (no unions, so structured outputs stay simple); validate.ts turns it into a
// SiteSpec whose prices, stats and payment address are copied in by code, never by the model.
import type { StandardTemplate } from "../kit-contract.js";

/** The 3 standard designs (the custom page is not in this list: it has no fixed template to loop over). */
export const SITE_TEMPLATES: readonly StandardTemplate[] = ["editorial", "bold", "warm"] as const;

/** Icon names the model may pick (drawn in templates/shared.ts). Anything else becomes "spark". */
export const ICONS = [
  "spark", "check", "clock", "calendar", "map-pin", "phone", "chat", "heart", "star", "shield", "leaf", "sun",
  "moon", "coffee", "bread", "cake", "cup", "gift", "bag", "truck", "home", "paw", "dog", "walk", "route",
  "user", "users", "smile", "hand", "key", "lock", "bolt", "chart", "target", "rocket", "code", "laptop",
  "mail", "bell", "search", "wand", "layers", "repeat", "wallet", "tag", "book", "music", "camera", "scissors",
  "tool", "plant", "flame", "drop", "wifi", "globe", "trophy",
] as const;
export type IconName = (typeof ICONS)[number];

export type SectionKind = "offer" | "how-it-works-for-customer" | "proof-stats" | "menu-or-services" | "menu" | "about" | "faq" | "local";

/** What a priced list is called on the page. */
export type MenuLabel = "menu" | "services" | "classes" | "plans";
/** One priced line. Prices are set in the plan step and repaired by code (validate.ts menuOf): never by the page designer. */
export interface MenuItem {
  name: string;
  desc: string;
  /** In the site's currency (spec.reserve.currency). */
  price: number;
  /** The founder's own offer (its regular price; the opening offer price is shown next to it). */
  offer?: boolean;
  /** 1-3 plain English words a stock photo of this item is tagged with ("flat white", "croissant"), or "". */
  photo?: string;
}
export interface MenuGroup { name: string; items: MenuItem[] }

export interface Step { icon: IconName; title: string; body: string }
export interface Stat { value: string; label: string; sourceUrl: string; source: string }

export type Section =
  | { kind: "offer"; title: string; item: string; bullets: string[]; note: string }
  | { kind: "how-it-works-for-customer"; title: string; steps: Step[] }
  | { kind: "proof-stats"; title: string; stats: Stat[] }
  | { kind: "menu-or-services"; title: string; intro: string; items: Step[] }
  /** The priced menu / price list (6-12 lines, grouped). `note` is the honest line under it ("Opening menu · prices may change before we open"). */
  | { kind: "menu"; label: MenuLabel; title: string; intro: string; note: string; groups: MenuGroup[] }
  | { kind: "about"; title: string; body: string }
  | { kind: "faq"; title: string; items: Array<{ q: string; a: string }> }
  | { kind: "local"; title: string; body: string; area: string; hours: string };

/** What the page needs to take a reservation. Filled by code from the report offer and the founder's address. */
export interface Reserve {
  address: string;
  price: number; // in `currency`
  normal: number | null;
  limit: number | null;
  currency: string;
  /** A free early-access list: nothing is sold, so no payment sheet; the main button takes people to the email form. */
  waitlist?: boolean;
}

/** Stock-photo search words written in the plan step (English, concrete), used by the photo finder. */
export interface SitePhotoQueries { hero: string[]; detail: string[]; people: string[] }

export interface SiteSpec {
  v: 1;
  lang: string;
  seo: { title: string; description: string };
  hero: { eyebrow: string; headline: string; sub: string; cta: string; secondary: string };
  sections: Section[];
  finalCta: { headline: string; sub: string; cta: string };
  footer: { tagline: string };
  reserve: Reserve;
  /** Simple, honest labels the page uses (in `lang`): button texts, form texts. */
  ui: SiteUi;
  /** Photo search words for this business (optional: older specs have none). */
  photoQueries?: SitePhotoQueries;
}

export interface SiteUi {
  reserve: string; // "Reserve with BCH"
  reserveFor: string; // "Reserve for {price}"
  joinList: string; // "Join the list"
  emailPlaceholder: string;
  thanks: string;
  privacy: string;
  scan: string;
  openWallet: string;
  copy: string;
  copied: string;
  close: string;
  normally: string;
  only: string; // "Only {n} available"
  reserved: string; // "{n} reserved"
  source: string;
  madeWith: string;
  faq: string;
  howItWorks: string;
  offer: string;
  /** The honest line under a priced menu (optional: older stored specs have none). */
  menuNote?: string;
  /** the same note for a price list that is not food and drink */
  priceNote?: string;
  /** "Opening offer" price label next to a menu line ("{price} opening offer"). */
  offerTag?: string;
}

// ---------- the model's output (flat, every field required) ----------

export interface ModelSite {
  seo: { title: string; description: string };
  hero: { eyebrow: string; headline: string; sub: string; cta: string; secondary: string };
  offer: { title: string; item: string; bullets: string[]; note: string };
  how: { title: string; steps: Array<{ icon: string; title: string; body: string }> };
  services: { title: string; intro: string; items: Array<{ icon: string; title: string; body: string }> };
  /** Optional in code-built copy (no prices are invented there); always asked of the model. */
  menu?: { kind: string; title: string; intro: string; items: Array<{ group: string; name: string; desc: string; price: number; photo: string }> };
  photoQueries?: { hero: string | string[]; detail: string | string[]; people: string | string[] };
  about: { title: string; body: string };
  local: { title: string; body: string; area: string; hours: string };
  faq: { title: string; items: Array<{ q: string; a: string }> };
  proof: { title: string; picks: number[] };
  order: string[];
  finalCta: { headline: string; sub: string; cta: string };
  /** Not asked of the model (structured-output size limit): the brand tagline is used. */
  footer?: { tagline: string };
}

type Schema = Record<string, unknown>;
const s = (description: string): Schema => ({ type: "string", description });
const arr = (items: Schema, description?: string): Schema => ({ type: "array", items, ...(description ? { description } : {}) });
const obj = (properties: Record<string, Schema>): Schema => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
// A plain string (an enum here made the structured-output grammar too large once the priced menu was added); validate.ts maps any unknown name to "spark".
const iconSchema: Schema = s("One icon name from the list in the instructions");
const card = obj({ icon: iconSchema, title: s("2-5 words"), body: s("One sentence, max 22 words") });

export const MODEL_SITE_SCHEMA: Schema = obj({
  seo: obj({ title: s("Max 60 characters: name + what + place"), description: s("Max 150 characters") }),
  hero: obj({
    eyebrow: s("Max 4 words, e.g. the place or the kind of business"),
    headline: s("The customer's outcome. Max 8 words. No hype."),
    sub: s("One or two plain sentences, max 30 words, concrete (what, where, for whom)"),
    cta: s("Max 4 words, e.g. 'Reserve yours'"),
    secondary: s("Max 4 words, e.g. 'See how it works'"),
  }),
  offer: obj({
    title: s("Max 6 words"),
    item: s("What the customer gets, max 12 words, exactly the founder's offer"),
    bullets: arr(s("Max 10 words, only facts from the digest or things the founder controls"), "3 items"),
    note: s("One short line, e.g. how pickup or start works. No refund promises."),
  }),
  how: obj({ title: s("Max 5 words"), steps: arr(card, "Exactly 3 steps from the customer's point of view") }),
  services: obj({ title: s("Max 5 words"), intro: s("Max 20 words"), items: arr(card, "3 to 6 items: products, menu or services") }),
  menu: obj({
    kind: { enum: ["menu", "services", "classes", "plans", "none"], description: "menu = food and drink; services = priced services; classes = classes or sessions; plans = software plans (only if the digest has market prices for them); none = nothing with a price fits" },
    title: s("Max 4 words, what a customer of this kind of place calls it: 'Menu', 'Services & prices', 'Classes'"),
    intro: s("Max 18 words, plain"),
    items: arr(
      obj({
        group: s("Max 3 words, the menu group this line sits in, e.g. 'Coffee', 'With milk', 'Something to eat' (same text for lines of one group)"),
        name: s("Max 4 words, the item as a customer orders it"),
        desc: s("One plain line, max 12 words: what it is (no stacked adjectives, no claims)"),
        price: { type: "number", description: "Price in the brand currency, from priceGuide" },
        photo: s("1-3 plain English words a stock photo of this item is tagged with (e.g. 'flat white', 'croissant'), or ''"),
      }),
      "6 to 12 lines in 1 to 4 groups, grouped lines next to each other; the founder's offer item is one of them",
    ),
  }),
  // Comma-separated strings (arrays here made the structured-output grammar too large); split in validate.ts.
  photoQueries: obj({
    hero: s("2 searches, comma separated, each 1-3 plain English words: a wide, calm photo of the thing sold or where it is sold (e.g. 'coffee kiosk, barista counter')"),
    detail: s("4-6 searches, comma separated, each 1-3 plain English words: close-ups of the actual products or work (e.g. 'latte art, espresso cup, croissant')"),
    people: s("1-2 searches, comma separated: someone doing the work (e.g. 'barista pouring')"),
  }),
  about: obj({ title: s("Max 6 words"), body: s("Max 60 words, why this exists, in the founder's voice. No invented history.") }),
  // no "hours": a business that is not open yet has none to state (and the grammar stays under the structured-output size limit)
  local: obj({ title: s("Max 5 words"), body: s("Max 30 words"), area: s("Where it is or which area it serves, or empty") }),
  faq: obj({ title: s("Max 5 words"), items: arr(obj({ q: s("Max 12 words"), a: s("Max 40 words") }), "4 to 6 real buyer questions") }),
  proof: obj({ title: s("Max 6 words"), picks: arr({ type: "integer" }, "Indexes (0-based) into digest.stats, best 2-3; empty if none fit") }),
  order: arr({ enum: ["how-it-works-for-customer", "menu", "menu-or-services", "proof-stats", "about", "local", "offer", "faq"] }, "Section order; drop sections that don't fit (keep offer and faq). With a menu, drop menu-or-services."),
  finalCta: obj({ headline: s("Max 8 words"), sub: s("Max 20 words"), cta: s("Max 4 words") }),
});

export const DEFAULT_ORDER: SectionKind[] = ["menu", "how-it-works-for-customer", "menu-or-services", "proof-stats", "offer", "about", "local", "faq"];

const UI_EN: SiteUi = {
  reserve: "Reserve with BCH",
  reserveFor: "Reserve for {price}",
  joinList: "Join the list",
  emailPlaceholder: "Your email",
  thanks: "You're on the list. We'll write when it opens.",
  privacy: "We only use your email to tell you when it opens.",
  scan: "Scan with any Bitcoin Cash wallet",
  openWallet: "Open my wallet",
  copy: "Copy address",
  copied: "Copied",
  close: "Close",
  normally: "normally {price}",
  only: "Only {n} available",
  reserved: "{n} reserved so far",
  source: "Source",
  madeWith: "Made with LaunchDesk",
  faq: "Questions",
  howItWorks: "How it works",
  offer: "Opening offer",
  menuNote: "Opening menu · prices may change before we open",
  priceNote: "Opening prices · they may change before we open",
  offerTag: "{price} opening offer",
};

const UI_ES: SiteUi = {
  reserve: "Reservar con BCH",
  reserveFor: "Reservar por {price}",
  joinList: "Apúntate",
  emailPlaceholder: "Tu email",
  thanks: "Ya estás en la lista. Te escribimos cuando abra.",
  privacy: "Solo usamos tu email para avisarte cuando abra.",
  scan: "Escanea con cualquier cartera de Bitcoin Cash",
  openWallet: "Abrir mi cartera",
  copy: "Copiar dirección",
  copied: "Copiado",
  close: "Cerrar",
  normally: "normalmente {price}",
  only: "Solo {n} disponibles",
  reserved: "{n} reservas hasta ahora",
  source: "Fuente",
  madeWith: "Hecho con LaunchDesk",
  faq: "Preguntas",
  howItWorks: "Cómo funciona",
  offer: "Oferta de apertura",
  menuNote: "Carta de apertura · los precios pueden cambiar antes de abrir",
  priceNote: "Precios de apertura · pueden cambiar antes de abrir",
  offerTag: "{price} oferta de apertura",
};

export function uiFor(lang: string): SiteUi {
  return lang.toLowerCase().startsWith("es") ? UI_ES : UI_EN;
}
