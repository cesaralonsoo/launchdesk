// WP1 Website: planSite(input) → SiteSpec. One Sonnet 5.5 (effort low) structured-output call with a cached system
// prompt; the answer is repaired in code (validate.ts), never by a second model call. Mock mode returns a fixture.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { recordUsage, usdOf } from "../cost.js";
import type { KitInput, LogoOption } from "../kit-contract.js";
import { ICONS, MODEL_SITE_SCHEMA, type ModelSite, type SiteSpec } from "./spec.js";
import { priceGuide, validateModelSite } from "./validate.js";
import { templateSite } from "../kit-templates.js";

export const SITE_MODEL = process.env.MODEL_SITE || "claude-sonnet-5-5";

const HERE = dirname(fileURLToPath(import.meta.url));
export interface SiteFixture { input: KitInput; logos: LogoOption[]; model: ModelSite }
export const FIXTURES = ["bakery-es", "dogwalk-en", "saas-en"] as const;
export function loadFixture(name: (typeof FIXTURES)[number]): SiteFixture {
  return JSON.parse(readFileSync(join(HERE, "fixtures", `${name}.json`), "utf8")) as SiteFixture;
}

/** Best fixture for a mock run: same slug/project first, then by kind of business, then language. */
export function mockFixtureFor(input: KitInput): SiteFixture {
  const all = FIXTURES.map(loadFixture);
  const hit = all.find((f) => f.input.slug === input.slug || f.input.projectId === input.projectId);
  if (hit) return hit;
  const idea = input.idea.toLowerCase();
  if (/\b(pan|bread|bak|caf|coffee|food|comida|cake|pastel)/.test(idea)) return all[0]!;
  if (/\b(dog|pet|perro|walk|paseo|cat|gato)/.test(idea)) return all[1]!;
  if (/\b(app|saas|software|tool|invoice|freelanc|online)/.test(idea)) return all[2]!;
  return input.brand.lang.startsWith("es") ? all[0]! : all[1]!;
}

export const SITE_SYSTEM = `You are a senior brand designer and conversion copywriter writing the one-page website of a small new business.
You write copy only; the layout, fonts and colours are chosen elsewhere. You pick icons from this list only: ${ICONS.join(", ")}.

Rules:
- Write in the language given as brand.lang (es = Spanish from Spain, en = plain English). Use the brand voice.
- Plain words a normal customer understands. No jargon, no technical words, no web addresses.
- The hero headline is the customer's outcome, max 8 words. Concrete and local: place, time, what they get.
- Never use hype words: revolutionary, seamless, unlock, elevate, game-changer, cutting-edge, world-class.
- Every claim must come from the digest or be something the founder controls (how it works, what is included).
- Never invent numbers, reviews, testimonials, customer names, awards, years in business, press mentions, an address, a phone number or opening hours.
- Prices: do not write prices or discounts in any text field; the page shows prices itself. Prices go ONLY in menu.groups[].items[].price.
- Use the founder's offer as given (offer.what). No refund or money-back promises.
- Stats: pick 0-3 indexes from digest.stats that help a buyer trust the offer; never restate a number not in the digest.
- Payment: digest.payment says whether this page takes payment. If it is "Bitcoin Cash", a FAQ may say simply that you reserve and pay with Bitcoin Cash from your phone. If it is "none", never mention paying, Bitcoin Cash, BCH or reserving with money anywhere (steps, FAQ, buttons): people join the email list.
- "local" is for a physical place or service area; leave all its fields empty for online products. For a place that is not open yet, say where in plain words ("Opening soon by the metro exit in Eixample") only from the idea; never a street address.
- Never write opening hours, times of day (like 7:30 or 9:30), opening days, dates or how many items are available: the business is not open yet. Describe the customer's habits without clock times ("on your morning commute").
- Order the sections for this business; keep offer and faq; drop local for online products.

The menu (the price list), written like the real menu of this kind of business:
- kind: "menu" for food and drink, "services" for priced services (grooming, repairs, dog walks), "classes" for sessions, "plans" for software subscriptions; an idea that is an app or software gets a price list only when priceGuide.market exists; "none" when nothing with a price fits (then leave items empty).
- 3 to 12 lines (menu.items, each with its group name) in 1 to 4 groups named the way the trade does ("Coffee", "With milk", "Something to eat"; "Walks", "Extras"). The founder's offer item (offer.what) is one line, priced at priceGuide.offer.normal if it exists, else priceGuide.offer.price.
- Every price is a plain number in priceGuide.currency, inside priceGuide.band, set the way this trade prices its own lines relative to the founder's price; lines of the same kind as the offer stay inside priceGuide.market's low-high range when it exists. Round like a real menu (2.20, 3.50, 12, 45). Never a price outside the band (the code drops it).
- Every line is something a customer would really pay for on its own; never tiny add-ons (water, wipes, bags) invented to fill the list: fewer real lines beat filler.
- Only things this business would plausibly sell on day one given the idea; no signature dishes with invented stories, no "award-winning", no origins or suppliers the digest does not name.
- desc: one plain line saying what it is ("Double espresso, steamed whole milk", "30 minutes, one dog, on lead"). Oat or other options only as a plain fact, never a promise of sourcing.
- photo: 1-3 English words a stock photo of that exact item would be tagged with ("flat white", "espresso", "croissant", "dog leash"), or "" for things photos cannot show.
- photoQueries: concrete English search words for free stock photos of this business: hero (the product or the counter, wide), detail (close-ups of the actual products), people (someone doing the work). Never abstract words (solution, service, quality).

Length guide: hero.sub 20-30 words, step bodies 10-20 words, faq answers 15-35 words, about 35-60 words.`;

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: config.anthropicKey, maxRetries: 1, timeout: 90_000 }));

/** The digest the model sees (no address, no slug). */
export function siteDigest(input: KitInput) {
  const { brand, report } = input;
  return {
    idea: input.idea,
    brand: { name: brand.name, tagline: brand.tagline, voice: brand.voice, lang: brand.lang, city: brand.city ?? "" },
    customer: report.customer,
    pain: report.pain,
    offer: report.offer.free
      ? { what: report.offer.what, limit: null, free: true, note: "A free early-access list: nothing is sold yet. Buttons and FAQ say join the list (free), never reserve, pre-order or pay." }
      // no quantity: the limit comes from the analysis, not the founder, so it is never shown as scarcity
      : { what: report.offer.what },
    stats: report.stats.map((s, i) => ({ i, value: s.value, label: s.label })),
    competitors: report.competitors.slice(0, 3),
    payment: !report.offer.free && input.founderAddress && report.offer.price > 0 ? "Bitcoin Cash" : "none",
    priceGuide: (({ software: _s, ...g }) => g)(priceGuide(input)),
  };
}

export interface PlanResult { spec: SiteSpec; issues: string[]; usd: number; mock: boolean }

export async function planSiteDetailed(input: KitInput, opts: { mock?: boolean; variantHint?: string } = {}): Promise<PlanResult> {
  if (opts.mock ?? config.mockAi) {
    // A saved fixture only when it is this very business (same name and language); otherwise copy written by code
    // from the founder's own input, so a demo never shows another business's claims or numbers.
    const fx = mockFixtureFor(input);
    const same = fx.input.brand.name.toLowerCase() === input.brand.name.toLowerCase() && fx.input.brand.lang === input.brand.lang;
    const { spec, issues } = validateModelSite(same ? fx.model : templateSite(input), input);
    return { spec, issues, usd: 0, mock: true };
  }
  const prompt = `Digest:\n${JSON.stringify(siteDigest(input))}${opts.variantHint ? `\n\nStyle hint from the founder: ${opts.variantHint.slice(0, 200)}` : ""}`;
  let msg: Anthropic.Beta.BetaMessage;
  try {
    msg = await getClient()
      .beta.messages.stream({
        model: SITE_MODEL,
        max_tokens: 8000,
        system: [{ type: "text", text: SITE_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: prompt }],
        output_config: { effort: "low", format: { type: "json_schema", schema: MODEL_SITE_SCHEMA } },
      } as never)
      .finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error(`[site] API error ${e.status}:`, e.message);
      throw new Error("The website writer is busy. Please retry in a minute.");
    }
    throw e;
  }
  recordUsage("site", msg.model, msg.usage);
  const usd = usdOf(msg.model, msg.usage);
  console.log(`[site] ${msg.model} stop=${msg.stop_reason} in=${msg.usage.input_tokens} out=${msg.usage.output_tokens} $${usd.toFixed(4)}`);
  if (msg.stop_reason === "refusal") throw new Error("The website writer declined this idea.");
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let raw: ModelSite | null = null;
  try {
    raw = JSON.parse(text) as ModelSite;
  } catch {
    raw = null; // validate() fills every field from the digest
  }
  const { spec, issues } = validateModelSite(raw, input);
  if (!raw) issues.push("model output was not JSON");
  return { spec, issues, usd, mock: false };
}

export async function planSite(input: KitInput): Promise<SiteSpec> {
  return (await planSiteDetailed(input)).spec;
}
