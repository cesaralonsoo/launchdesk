// WP3 · Marketing research: ONE Haiku 5.5 call with web_search (3 uses, user_location from the city) that finds where
// this customer already is, what happens locally in the next 30 days and how rivals get customers. Same honesty
// contract as Validate: the server numbers the pages the tool really returned (numberNotes from blocks-v7.ts,
// imported read-only), and a note counts as sourced only when it maps to one of them.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { Budget, recordUsage, type CostLine } from "../cost.js";
import { numberNotes } from "../blocks-v7.js";
import type { KitInput } from "../kit-contract.js";
import type { PlanSource } from "./schema.js";

const envModel = (name: string, dflt: string) => (process.env[name] && /^claude-[a-z0-9-]+$/.test(process.env[name]!) ? process.env[name]! : dflt);
export const RESEARCH_MODEL = envModel("MODEL_MARKETING_RESEARCH", "claude-haiku-5-5");
/** Haiku 5.5: newer web_search versions (dynamic filtering) fail or truncate (.notes/quality/opt/DECISION.md). */
const SEARCH_TOOL = "web_search_20250305";
/** Searches per plan ($0.01 each): MARKETING_SEARCHES=1..3, default 3. */
export const MARKETING_SEARCHES = Math.min(3, Math.max(1, Number(process.env.MARKETING_SEARCHES) || 3));
export const EST_RESEARCH_USD = 0.05;
const CALL_MS = 90_000;

export interface MarketingResearch { notes: string[]; sources: PlanSource[]; queries: string[]; ok: boolean }
export const emptyMarketingResearch = (): MarketingResearch => ({ notes: [], sources: [], queries: [], ok: false });

/** ISO country for user_location (the brand has a city, not a country). Unknown city: no location, the query names it. */
const COUNTRY: Record<string, string> = {
  barcelona: "ES", madrid: "ES", valencia: "ES", sevilla: "ES", seville: "ES", bilbao: "ES", malaga: "ES", málaga: "ES", zaragoza: "ES", palma: "ES",
  lisbon: "PT", lisboa: "PT", porto: "PT", paris: "FR", lyon: "FR", berlin: "DE", munich: "DE", london: "GB", manchester: "GB", dublin: "IE",
  amsterdam: "NL", rome: "IT", milan: "IT", "new york": "US", "san francisco": "US", "los angeles": "US", "mexico city": "MX", "buenos aires": "AR",
};
export function locationOf(city?: string): { country: string; city: string } | null {
  if (!city) return null;
  const c = COUNTRY[city.trim().toLowerCase()];
  return c ? { country: c, city: city.trim() } : null;
}

const today = () => new Date().toISOString().slice(0, 10);

export const researchPrompt = (input: KitInput) => {
  const { brand, report } = input;
  const where = brand.city ? `in ${brand.city}` : "online (no fixed city: think where these buyers gather on the internet and in their country)";
  const rivals = report.competitors.map((c) => c.name).slice(0, 4).join(", ") || "the closest alternatives";
  return `You research a launch plan for a one-person business ${where}. Today is ${today()}.
<idea>${input.idea}</idea>
<customer>${report.customer}</customer>
<offer>${report.offer.what}, ${report.offer.price} ${brand.currency}</offer>
Use at most ${MARKETING_SEARCHES} search${MARKETING_SEARCHES > 1 ? "es, one per question" : " (pick the query that answers the most of these questions)"}, in the local language (${brand.lang}) when that finds better local pages:
1. Where do these customers already gather ${where}: named groups, forums, markets, streets, newsletters, local media, hashtags.
2. What happens ${brand.city ? `in ${brand.city}` : "for this hobby or trade"} in the next 30 days (from ${today()}): named fairs, markets, events, seasonal dates, with their dates.
3. How ${rivals} and similar sellers get customers today, and real local prices for one paid channel (flyer printing, a market stall fee, or a sponsored post).
Then write plain research notes: short factual lines starting with "- ", each one a specific, named fact (a place, a group, an event with its date, a price with its year), followed by the page URL that states it in angle brackets. Say "not found" rather than guessing. Never invent a name, date or price. At most 15 lines. End with "Summary: " and one sentence.`;
};

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: config.anthropicKey, maxRetries: 0, timeout: 120_000 }));

/** One research call (no retry: a failed call means the writer plans from the report alone and says so). */
export async function researchMarketing(input: KitInput, opts: { budget?: Budget; onCost?: (l: CostLine) => void } = {}): Promise<MarketingResearch> {
  const settle = opts.budget?.reserve("marketing:research", EST_RESEARCH_USD);
  const lines: CostLine[] = [];
  const t0 = Date.now();
  try {
    const loc = locationOf(input.brand.city);
    const tools = [{ type: SEARCH_TOOL, name: "web_search", max_uses: MARKETING_SEARCHES, ...(loc ? { user_location: { type: "approximate", country: loc.country, city: loc.city } } : {}) }] as unknown as Anthropic.ToolUnion[];
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: researchPrompt(input) }];
    const pages: Array<{ url: string; title: string }> = [];
    const queries: string[] = [];
    let text = "";
    for (let turn = 0; turn < 3; turn++) {
      const msg = await getClient().messages.create(
        { model: RESEARCH_MODEL, max_tokens: 6000, system: `You are a careful local market researcher. Your training data ends before today's date; search for anything current (events, prices, groups).`, messages, tools },
        { timeout: CALL_MS, maxRetries: 0 },
      );
      const line = recordUsage("marketing:research", msg.model, msg.usage);
      lines.push(line);
      opts.onCost?.(line);
      for (const b of msg.content as unknown as Array<{ type: string; name?: string; input?: { query?: string }; content?: unknown }>) {
        if (b.type === "server_tool_use" && b.name === "web_search" && b.input?.query) queries.push(b.input.query);
        if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content as Array<{ type: string; url: string; title: string }>) if (r.type === "web_search_result") pages.push({ url: r.url, title: r.title });
      }
      for (const b of msg.content) {
        if (b.type !== "text") continue;
        const cited: string[] = [];
        for (const c of (b.citations ?? []) as unknown as Array<{ url?: string; title?: string | null }>) {
          if (!c.url) continue;
          pages.push({ url: c.url, title: c.title ?? c.url });
          cited.push(c.url);
        }
        const t = b.text.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 <$2>");
        text += t.replace(/\n+$/, "") + (cited.length ? ` ${[...new Set(cited)].map((u) => `<${u}>`).join(" ")}` : "") + (/\n$/.test(t) ? "\n" : "");
      }
      if (msg.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: msg.content as Anthropic.ContentBlockParam[] });
    }
    const out = numberNotes(text, pages);
    const sources: PlanSource[] = out.cites.map((c, i) => ({ n: i + 1, url: c.url, title: c.title }));
    console.log(`[marketing] research: ${out.notes.length} notes, ${sources.length} sources, ${queries.length} searches, ${Date.now() - t0}ms`);
    return { notes: out.notes, sources, queries, ok: out.notes.length > 0 };
  } catch (e) {
    console.error("[marketing] research failed:", (e as Error).message);
    return emptyMarketingResearch();
  } finally {
    settle?.(lines);
  }
}
