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

export type SectionKind = "offer" | "how-it-works-for-customer" | "proof-stats" | "menu-or-services" | "about" | "faq" | "local";

export interface Step { icon: IconName; title: string; body: string }
export interface Stat { value: string; label: string; sourceUrl: string; source: string }

export type Section =
  | { kind: "offer"; title: string; item: string; bullets: string[]; note: string }
  | { kind: "how-it-works-for-customer"; title: string; steps: Step[] }
  | { kind: "proof-stats"; title: string; stats: Stat[] }
  | { kind: "menu-or-services"; title: string; intro: string; items: Step[] }
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
}

// ---------- the model's output (flat, every field required) ----------

export interface ModelSite {
  seo: { title: string; description: string };
  hero: { eyebrow: string; headline: string; sub: string; cta: string; secondary: string };
  offer: { title: string; item: string; bullets: string[]; note: string };
  how: { title: string; steps: Array<{ icon: string; title: string; body: string }> };
  services: { title: string; intro: string; items: Array<{ icon: string; title: string; body: string }> };
  about: { title: string; body: string };
  local: { title: string; body: string; area: string; hours: string };
  faq: { title: string; items: Array<{ q: string; a: string }> };
  proof: { title: string; picks: number[] };
  order: string[];
  finalCta: { headline: string; sub: string; cta: string };
  footer: { tagline: string };
}

type Schema = Record<string, unknown>;
const s = (description: string): Schema => ({ type: "string", description });
const arr = (items: Schema, description?: string): Schema => ({ type: "array", items, ...(description ? { description } : {}) });
const obj = (properties: Record<string, Schema>): Schema => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const iconSchema: Schema = { enum: [...ICONS] };
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
  about: obj({ title: s("Max 6 words"), body: s("Max 60 words, why this exists, in the founder's voice. No invented history.") }),
  local: obj({ title: s("Max 5 words"), body: s("Max 30 words"), area: s("Where it is or which area it serves, or empty"), hours: s("Only if known from the digest, else empty") }),
  faq: obj({ title: s("Max 5 words"), items: arr(obj({ q: s("Max 12 words"), a: s("Max 40 words") }), "4 to 6 real buyer questions") }),
  proof: obj({ title: s("Max 6 words"), picks: arr({ type: "integer" }, "Indexes (0-based) into digest.stats, best 2-3; empty if none fit") }),
  order: arr({ enum: ["how-it-works-for-customer", "menu-or-services", "proof-stats", "about", "local", "offer", "faq"] }, "Section order; drop sections that don't fit (keep offer and faq)"),
  finalCta: obj({ headline: s("Max 8 words"), sub: s("Max 20 words"), cta: s("Max 4 words") }),
  footer: obj({ tagline: s("Max 10 words") }),
});

export const DEFAULT_ORDER: SectionKind[] = ["how-it-works-for-customer", "menu-or-services", "proof-stats", "offer", "about", "local", "faq"];

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
};

export function uiFor(lang: string): SiteUi {
  return lang.toLowerCase().startsWith("es") ? UI_ES : UI_EN;
}
