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
import { validateModelSite } from "./validate.js";
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
- Never invent numbers, reviews, testimonials, customer names, awards, years in business or press mentions.
- Prices: do not write prices or discounts in any text; the page shows the founder's price itself.
- Use the founder's offer as given (offer.what). No refund or money-back promises.
- Stats: pick 0-3 indexes from digest.stats that help a buyer trust the offer; never restate a number not in the digest.
- Payment is with Bitcoin Cash from the phone; when a FAQ asks how to pay, say that simply.
- "local" is for a physical place or service area; leave all its fields empty for online products.
- "hours" only if the digest says them, otherwise empty.
- Order the sections for this business; keep offer and faq; drop local for online products.

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
      : { what: report.offer.what, limit: report.offer.limit ?? null },
    stats: report.stats.map((s, i) => ({ i, value: s.value, label: s.label })),
    competitors: report.competitors.slice(0, 3),
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
        max_tokens: 6000,
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
