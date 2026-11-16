// WP3 · "Your 30-day plan": research (Haiku + web search, research.ts) → writer step A (strategy) → writer step B
// (4-week calendar + ready-to-copy texts, written from A) → cleanPlan (honesty rules in code). Two steps because the
// full schema compiles to a grammar the API refuses as too large. Mock mode (AI off) returns a saved real fixture.
//
//   planMarketing(input) → MarketingResult { plan: PlanV2, sources }   (real cost per run: see spend.log)
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { config } from "../config.js";
import { Budget, recordUsage, type CostLine } from "../cost.js";
import type { KitInput, MarketingResult } from "../kit-contract.js";
import { templatePlan } from "../kit-templates.js";
import { emptyMarketingResearch, researchMarketing, type MarketingResearch } from "./research.js";
import { assumeWord, BANNED, cleanPlan, datedEvents, COPY_LIMITS, gateReason, PLAN_SCHEMA_A, PLAN_SCHEMA_B, saneDays, type PlanSource, type PlanV2, type ReportGate } from "./schema.js";

const envModel = (name: string, dflt: string) => (process.env[name] && /^claude-[a-z0-9-]+$/.test(process.env[name]!) ? process.env[name]! : dflt);
/** Writer model (both steps). MODEL_MARKETING=claude-opus-5-5 if the copy feels flat (about 2x the writer cost). */
export const WRITER_MODEL = envModel("MODEL_MARKETING", "claude-sonnet-5-5");
export const EST_WRITER_USD = { a: 0.05, b: 0.07 } as const;
/** Hard cap for one plan (research + both writer steps). */
export const MARKETING_CAP_USD = 0.2;
const CALL_MS = 180_000;

export type PlanResult = MarketingResult & { plan: PlanV2; warnings: string[] };

// ───────────────────────────────────────────────────────────── prompts

const LANG_NAME: Record<string, string> = { es: "Spanish (Spain)", en: "English", ca: "Catalan", fr: "French", de: "German", pt: "Portuguese", it: "Italian" };
const SYSTEM = "You are the launch lead for small, one-person businesses. You plan only what one person can do in 30 days, with real places and plain words. You never invent facts, numbers, names, quotes, reviews or events.";

/** The report's decision: verdict, deciding reason and the checks to run before opening or spending money. */
export function gateBlock(g: ReportGate): string {
  if (!g.verdict) return "";
  const checks = (g.validateFirst ?? []).slice(0, 3).map((v, i) => `${i + 1}. ${v.what}. How: ${v.how}${v.passIf ? ` Pass if: ${v.passIf}` : ""}`);
  return `<report_verdict verdict="${g.verdict === "pivot" ? "test first" : g.verdict}">${gateReason(g.mainReason)}</report_verdict>
<validate_first>
${checks.join("\n") || "- none"}
</validate_first>`;
}

const gateRule = (input: KitInput) => {
  const g = input.report as ReportGate;
  if (!g.verdict) return "";
  return g.verdict === "go"
    ? `\n- The report says Go. Still run its validate_first checks in week 1, alongside the first sales actions, each day's task starting "Check 1:", "Check 2:"… (in Spanish "Comprobación 1:"…).`
    : `\n- The report says ${g.verdict === "no-go" ? "No-go" : "Test first"}, and the founder chose to build anyway. The plan starts by checking the deciding reason and the validate_first items (for example: confirm the permit before opening day). Week 1 is checks and pre-orders only: no opening, no printing, no spending until each check passes. Put each check as an early day with its pass mark, and start that day's task with "Check 1:", "Check 2:" or "Check 3:" (in Spanish "Comprobación 1:"…), so the founder can match it to the report. Make the decision say: stop if a check fails.`;
};

export function contextBlock(input: KitInput, research: MarketingResearch, sources: readonly PlanSource[]): string {
  const { brand, report } = input;
  const cur = brand.currency;
  const statLines = report.stats.map((s) => {
    const n = sources.find((x) => x.url === s.sourceUrl)?.n;
    return `- ${s.label}: ${s.value}${n ? ` [${n}]` : ""}`;
  });
  return `<idea>${input.idea}</idea>
<brand name="${brand.name}" voice="${brand.voice}" tagline="${brand.tagline}" city="${brand.city ?? "online"}" currency="${cur}" />
<customer>${report.customer}</customer>
<pain>${report.pain}</pain>
<offer what="${report.offer.what}" price="${report.offer.price} ${cur}"${report.offer.normal ? ` normal="${report.offer.normal} ${cur}"` : ""}${report.offer.limit ? ` limit="${report.offer.limit}"` : ""} />
<report_numbers>
${statLines.join("\n") || "- none"}
</report_numbers>
<competitors>${report.competitors.map((c) => `${c.name} (gap: ${c.gap})`).join("; ") || "none named"}</competitors>
<risks>${report.risks.join("; ")}</risks>
${gateBlock(report as ReportGate)}
<research>
${research.notes.join("\n") || "- No web research came back. Use no local facts; put everything local in assumptions."}
</research>
<sources>
${sources.map((s) => `[${s.n}] ${s.title}`).join("\n") || "none"}
</sources>
The founder takes payments in Bitcoin Cash (BCH) on their own website: each pre-order or booking is one payment they can count.`;
}

const commonRules = (input: KitInput) =>
  `- Write every text field in ${LANG_NAME[input.brand.lang] ?? input.brand.lang}, in the brand voice, for normal people. No marketing jargon. Never use: ${BANNED.join(", ")}.
- Source numbers go only in "source" fields (0 when there is none), never inside the text. No number about the world (population, prices, counts, dates of events) without a source; plan numbers (targets, budget, hours, the offer price) are fine.`;

export function promptA(input: KitInput, research: MarketingResearch, sources: readonly PlanSource[]): string {
  const cur = input.brand.currency;
  return `Plan the first 30 days of sales for this one-person business: one goal number, a few channels done well. This step is the strategy; the calendar and texts come next.
${contextBlock(input, research, sources)}

Rules:
${commonRules(input)}
- headline: one sentence that says the whole plan to a busy person.
- goal: ONE number for day 30 that the founder can count (pre-orders, paid bookings, first clients), realistic for one person, tied to the offer price. Say why that number (what it proves) and how it is counted.
- customer.places: 2-4 concrete places or moments where this customer already is (a named street, market, group, forum, time of day). Put its [n] number in source when the research states it, else 0.
- channels: 3 or 4, each with a role (one of: awareness, first sales, proof, repeat), why THIS customer is there (with source [n] when you use a research fact; if not sourced, start the why with "${assumeWord(input.brand.lang)}"), weekly hours, cost in ${cur} for the month, and the very first action (concrete: who, where, what).
- rejected: 1 or 2 obvious channels you do NOT use (for example paid ads or TikTok) and why not, for this business.
- budget.tiers: exactly 3 tiers: 0, 100 and 500 ${cur}. Lines per channel that never add up to more than the tier; reserve_pct 10-15; a rule for days 22-30 to move money to what works.
- kpis: at most 5. Each with a target and how to count it; count_from is one of: bch payments, website, by hand.
- local: up to 6 facts from the research that matter for this plan, each with its [n]. events: named events in the next 30 days from the research only, each with date, place and [n]. None in the research: empty lists.
- assumptions: 2-5 things this plan assumes that the founder should check.
- decision: what the day-30 numbers mean: scale, adjust or stop.${gateRule(input)}`;
}

export function promptB(input: KitInput, research: MarketingResearch, sources: readonly PlanSource[], strategy: unknown): string {
  return `Write the 4-week calendar and the ready-to-paste texts for this launch plan.
${contextBlock(input, research, sources)}
<strategy>
${JSON.stringify(strategy)}
</strategy>

Rules:
${commonRules(input)}
- Use only the strategy's channels. Every text uses the real offer and price. No invented quotes, reviews, awards, customer counts or "sold out". Say "our website" for the link; it is added later.
- weeks: exactly 4 (prepare, soft launch, offer, proof and last call). 3-5 days each, day numbers 1-30 in order, a time at the customer's moment, the channel, one concrete action (where, with whom, what), the text it uses in copy (one of post-1, post-2, post-3, message, email, flyer, profile, press, or "" for none) and hours. Never announce results before they happen.
- copy.posts: 3 posts for the strategy's channels (channel, hook, body ≤${COPY_LIMITS.postWords - 10} words, call to action).
- copy.message: a short personal message to send to people the founder knows or to a partner next door (WhatsApp style).
- copy.email: an email to the waitlist (subject + body ≤${COPY_LIMITS.emailWords - 20} words).
- copy.flyer: a headline + exactly 3 short lines.
- copy.profile: a Google Business Profile or shop description, ≤${COPY_LIMITS.profileChars - 50} characters.
- copy.press: a 3-sentence pitch to local press or a newsletter.
- Each day's channel is the channel that action actually uses (a Google profile update is not "kiosk sign"). Each action is 1-2 plain sentences that make sense read alone; state any card or discount rule exactly (for example "buy 5, the 6th is free").${gateRule(input)}`;
}

// ───────────────────────────────────────────────────────────── writer calls

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: config.anthropicKey, maxRetries: 0, timeout: CALL_MS }));

async function callJson(label: string, prompt: string, schema: unknown, est: number, budget: Budget, onCost?: (l: CostLine) => void): Promise<Record<string, unknown>> {
  const settle = budget.reserve(label, est);
  const lines: CostLine[] = [];
  const t0 = Date.now();
  try {
    const stream = getClient().beta.messages.stream(
      { model: WRITER_MODEL, max_tokens: 10000, system: SYSTEM, messages: [{ role: "user", content: prompt }], output_config: { effort: "low", format: { type: "json_schema", schema } } } as never,
      { timeout: CALL_MS, maxRetries: 0 },
    );
    const msg = await stream.finalMessage();
    const line = recordUsage(label, msg.model, msg.usage);
    lines.push(line);
    onCost?.(line);
    console.log(`[marketing] ${label} ${msg.model} in=${msg.usage.input_tokens} out=${msg.usage.output_tokens} ${Date.now() - t0}ms stop=${msg.stop_reason}`);
    if (msg.stop_reason === "refusal") throw new Error("The AI declined to plan this idea.");
    if (msg.stop_reason === "max_tokens") throw new Error("The plan was cut off.");
    return JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""));
  } finally {
    settle(lines);
  }
}

/** Research pages + the report's own sourced numbers, numbered 1…n (deduplicated by URL). */
export function mergeSources(research: readonly PlanSource[], input: KitInput): PlanSource[] {
  const out: PlanSource[] = research.map((s, i) => ({ ...s, n: i + 1 }));
  for (const st of input.report.stats) {
    if (!/^https?:\/\//.test(st.sourceUrl) || out.some((s) => s.url === st.sourceUrl)) continue;
    out.push({ n: out.length + 1, url: st.sourceUrl, title: st.label });
  }
  return out;
}

// ───────────────────────────────────────────────────────────── fixtures (mock mode)

export interface PlanFixture { key: string; input: KitInput; result: PlanResult; meta: { model: string; research: string; usd: number; date: string; queries: string[] } }
export const FIXTURE_KEYS = ["bakery-es", "bikes-en"] as const;
const fixtureCache = new Map<string, PlanFixture>();
export function loadFixture(key: string): PlanFixture | null {
  if (fixtureCache.has(key)) return fixtureCache.get(key)!;
  try {
    const f = JSON.parse(readFileSync(new URL(`./fixtures/${key}.json`, import.meta.url), "utf8")) as PlanFixture;
    fixtureCache.set(key, f);
    return f;
  } catch {
    return null;
  }
}
/** Which saved plan stands in for an idea in mock mode: matching business, else local vs online. */
export function fixtureKeyFor(input: Pick<KitInput, "idea" | "brand">): (typeof FIXTURE_KEYS)[number] {
  const t = input.idea.toLowerCase();
  if (/\b(bike|bikes|bicycle|cycling|bici|bicis|vintage|online shop|tienda online)\b/.test(t)) return "bikes-en";
  if (/\b(bakery|bread|sourdough|loaf|loaves|panader[ií]a|forn|coffee|caf[eé]|kiosk)\b/.test(t)) return "bakery-es";
  return input.brand.city ? "bakery-es" : "bikes-en";
}

// ───────────────────────────────────────────────────────────── entry point

export async function planMarketing(input: KitInput, opts: { budget?: Budget; onCost?: (l: CostLine) => void; mock?: boolean; research?: MarketingResearch; onResearch?: (r: MarketingResearch) => void } = {}): Promise<PlanResult> {
  if (opts.mock ?? config.mockAi) {
    const f = loadFixture(fixtureKeyFor(input));
    // The saved plan only for that very business (same name and language); else a plan written by code from the input.
    if (!f || f.input.brand.name.toLowerCase() !== input.brand.name.toLowerCase() || f.input.brand.lang !== input.brand.lang)
      return { plan: templatePlan(input), sources: [], warnings: [] };
    const r = structuredClone(f.result);
    r.plan.events = datedEvents(r.plan.events, r.sources, r.plan.assumptions, [], r.plan.lang);
    return r;
  }
  const budget = opts.budget ?? new Budget(MARKETING_CAP_USD);
  const research = opts.research ?? (await researchMarketing(input, { budget, onCost: opts.onCost }).catch(() => emptyMarketingResearch()));
  opts.onResearch?.(research);
  const sources = mergeSources(research.sources, input);
  const a = await callJson("marketing:strategy", promptA(input, research, sources), PLAN_SCHEMA_A, EST_WRITER_USD.a, budget, opts.onCost);
  const b = await callJson("marketing:calendar", promptB(input, research, sources, a), PLAN_SCHEMA_B, EST_WRITER_USD.b, budget, opts.onCost);
  const cleaned = cleanPlan({ ...a, ...b }, sources, { lang: input.brand.lang, currency: input.brand.currency });
  const warnings = cleaned.warnings;
  const plan = saneDays(cleaned.plan, templatePlan(input).weeks.flatMap((w) => w.days), warnings);
  if (warnings.length) console.warn(`[marketing] cleaned: ${warnings.join("; ")}`);
  return { plan, sources, warnings };
}
