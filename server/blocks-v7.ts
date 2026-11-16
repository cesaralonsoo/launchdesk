// LaunchDesk v7.2 — the validate stage as ONE written founder report in 4 blocks (recipe "V1", measured in
// .notes/quality/opt/DECISION.md; contract: .notes/quality/contract.md). Owner: WS-INTEL. All calls on Claude Haiku 5.5.
//
//   research × 4 (in parallel, from t = 0, this file)               writer (1 streamed call, report-v7.ts)
//   customers · competition · money · risks                    ──►  the whole report in Markdown; unit economics
//   web_search (1) + web_fetch (≤ 1, max_content_tokens 5000)        computed in code; parsed back into these blocks
//   → plain note lines, each ending with the page that states it
//
// Honesty: a note's URL counts only when it matches a page the tools really returned (search result, search
// citation or fetched page); the server numbers those pages, and the writer cites only those numbers ([S#]).
// URLs, titles and domains are always copied from tool results, never from model text.
// Progress notes (speech bubbles) are real events: the queries actually issued, the hosts actually read, the number
// of facts found; no extra model calls, nothing invented.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { Budget, BudgetError, EST, recordUsage, type CostLine } from "./cost.js";
import {
  BLOCK_IDS,
  BLOCK_LIBRARY,
  BLOCK_LIMITS,
  BLOCK_EVIDENCE_WORDS,
  buildBlock,
  capWords,
  enforceSourceRule,
  fallbackBlockPlans,
  hostOf,
  type AgentNote,
  type AnalystRole,
  type BlockDraft,
  type BlockId,
  type BlockPlan,
  type Finding,
  type FindingKind,
  type Impact,
  type JudgeDraft,
  type ReportBlock,
  type ReportBrief,
  type ScalePart,
  type SourceRef,
  type ValidateFirst,
} from "./v7.js";
import { REPORT_SAMPLES, v7SampleFor, type V7Sample } from "./v7-samples.js";

const envModel = (name: string, dflt: string) => (process.env[name] && /^claude-[a-z0-9-]+$/.test(process.env[name]!) ? process.env[name]! : dflt);
/** Research model (MODEL_REPORT_RESEARCH; MODEL_BLOCKS kept as the older name). Never default to Sonnet. */
export const BLOCK_MODEL = envModel("MODEL_REPORT_RESEARCH", envModel("MODEL_BLOCKS", "claude-haiku-5-5"));
/** Fetched page text cap (tokens per fetch; keeps each research call far under Haiku's 100K price step). */
export const FETCH_MAX_TOKENS = 5000;
/** V1 recipe: one search and at most one fetch per section (4 searches per report). BLOCK_LIBRARY's larger
 *  budgets are the mirrored contract maxima, not what a run spends. */
export const SEARCHES_PER_BLOCK = 1;
export const FETCHES_PER_BLOCK = 1;
/** Haiku 5.5: the _20260209 (dynamic filtering) versions make searches fail or truncate (DECISION.md). */
const SEARCH_TOOL = "web_search_20250305";
const FETCH_TOOL = "web_fetch_20250910";
const RESEARCH_CALL_MS = 60_000;

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: config.anthropicKey, maxRetries: 0, timeout: 120_000 }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

// ───────────────────────────────────────────────────────────── research (one call per block)

const RSYSTEM = (city: string | null) =>
  `You are a market researcher. The current date is ${today()}. Your training data ends well before today's date. Prices, rents, wages, rules and anything "latest" may have changed since then, so search for those before you answer. ${city ? `Put the user's city (${city}) in search queries.` : "Put the place named in the idea in search queries."}`;

/** What each section's research must find (the money brief carries the 4 gaps the judges flagged). */
export const BRIEF: Record<BlockId, string> = {
  customers: "Population and demographics of the exact neighbourhood and city (latest official figure with its year), who the buyers are, what households spend on this need today, and evidence that demand for this product or format exists or is growing.",
  competition: "Named competitors in the same neighbourhood or city and their unit prices, existing subscriptions, delivery or apps for the same need, and the cheapest substitute (supermarket, DIY) with its price.",
  money: "Commercial rent, the main ingredient or material cost per unit, wages for the trade, equipment costs, typical margins, capital needed. Also find: the VAT rate that applies to this exact product (search it); named local competitors' unit prices; commercial (not residential) rent per m²; employer social security on top of wages.",
  risks: "Permits and registrations for this activity in this city, self-employment costs, the key risks (failure rates, energy or input costs, churn, platform dependency), and cheap ways to start (markets, shared kitchens, pre-sales).",
};
export const NOTE_RULES = `Then write plain research notes: short factual lines starting with "- ", each one a specific fact or number with its year, backed by a citation. Say "not found" rather than guessing. Do not number the lines.`;
export const researchPrompt = (idea: string, id: BlockId) => `Research this business idea for a founder deciding whether to put their savings into it.
<idea>${idea}</idea>
Topic: ${BLOCK_LIBRARY[id].label}. ${BRIEF[id]}
Search the web once (at most ${SEARCHES_PER_BLOCK} search), preferring primary and local sources (official statistics, operators' own sites and price lists, local press). Then fetch the one result page most likely to state the exact figures this topic needs (at most ${FETCHES_PER_BLOCK} fetch: an official statistic, a price list, the regulation itself) and take the numbers from that page; skip the fetch only if the snippets already state every figure with its year. Keep each source's own wording for categories (for example "foreign nationality" is not "foreign-born") and say where a price was seen (which shop, market or street). ${NOTE_RULES} At most 15 lines.`;

export interface BlockResearch {
  id: BlockId;
  /** Note lines, each ending in [n] (a number into `cites`) or "(estimate)". */
  notes: string[];
  /** The pages the tools really returned and the notes cite, numbered 1…n. */
  cites: SourceRef[];
  queries: string[];
  read: string[];
  summary: string;
  ok: boolean;
}
export const emptyResearch = (id: BlockId): BlockResearch => ({ id, notes: [], cites: [], queries: [], read: [], summary: "", ok: false });

const normUrl = (u: string) => {
  try {
    const x = new URL(u.trim().replace(/[).,;\]]+$/, ""));
    return `${x.hostname.replace(/^www\./, "").toLowerCase()}${x.pathname.replace(/\/+$/, "")}${x.search}`;
  } catch {
    return "";
  }
};

/** Pure: turns the model's note text + the pages the tools returned into numbered notes (exported for tests). */
export function numberNotes(text: string, pages: ReadonlyArray<{ url: string; title: string }>, accessed = today()): { notes: string[]; cites: SourceRef[]; summary: string } {
  const known = new Map<string, { url: string; title: string }>();
  for (const p of pages) {
    const k = normUrl(p.url);
    if (k && !known.has(k)) known.set(k, p);
  }
  const cites: SourceRef[] = [];
  const hostPath = (k: string) => k.replace(/\?.*$/, "");
  const findPage = (u: string) => {
    const k = normUrl(u);
    if (!k) return undefined;
    const exact = known.get(k);
    if (exact) return exact;
    // The model often drops a query string or a trailing segment: accept the same host + path (or a path prefix of
    // at least one segment), never a different host.
    const hp = hostPath(k);
    for (const [kk, p] of known) if (hostPath(kk) === hp) return p;
    const segs = (x: string) => x.split("/").filter(Boolean); // [host, ...path segments]
    const want = segs(hp);
    for (const [kk, p] of known) {
      const have = segs(hostPath(kk));
      if (have[0] !== want[0]) continue;
      const [short, long] = have.length <= want.length ? [have, want] : [want, have];
      if (short.length >= 2 && short.every((x, i) => long[i] === x)) return p;
    }
    return undefined;
  };
  const numberOf = (u: string): number => {
    const page = findPage(u);
    if (!page) return 0;
    let i = cites.findIndex((c) => normUrl(c.url) === normUrl(page.url));
    if (i < 0) {
      if (cites.length >= 10) return 0;
      cites.push({ url: page.url, title: (page.title || hostOf(page.url)).slice(0, 140), domain: hostOf(page.url), accessed });
      i = cites.length - 1;
    }
    return i + 1;
  };
  // Footnote style ("[S1] Title — https://…" / "S1: https://…"): label → URL, still checked against the pages.
  // A footnote definition has a bracketed or S-prefixed label ("[S1] …", "S1: …", "[1] …"), or a bare number only
  // under a "Sources" heading. A plain numbered note ("1. Rent is €14/m² <https://…>") is a NOTE, not a definition.
  const isHeading = (l: string) => /^\s*(#+\s*)?\**sources?\**\s*:?\s*$/i.test(l);
  const defOf = (raw: string, inSources: boolean) =>
    /^\s*[-*•]?\s*(?:[[<(]\s*S?(\d{1,2})\s*[\]>)]|S(\d{1,2}))[\s:.\-–—]+.*?(https?:\/\/[^\s<>)\]]+)/i.exec(raw) ??
    (inSources ? /^\s*[-*•]?\s*()(\d{1,2})[\s:.\-–—]+.*?(https?:\/\/[^\s<>)\]]+)/i.exec(raw) : null);
  const labels = new Map<string, string>();
  {
    let inSources = false;
    for (const raw of text.split("\n")) {
      if (isHeading(raw)) inSources = true;
      const m = defOf(raw, inSources);
      const label = m?.[1] || m?.[2];
      if (m && label && !labels.has(label)) labels.set(label, m[3]!);
    }
  }
  let summary = "";
  const notes: string[] = [];
  let inSources = false;
  for (const raw of text.split("\n")) {
    if (isHeading(raw)) {
      inSources = true;
      continue;
    }
    // Leading list numbers are dropped: a writer must never mistake a note's line number for a source number.
    const line = raw.replace(/\*\*|__/g, "").replace(/^\s*[-*•]\s*/, "").replace(/^\d{1,2}[.)]\s+/, "").trim();
    if (!line || /^#+\s/.test(line) || /^\*[^*]+\*?$/.test(line)) continue;
    if (defOf(raw, inSources)) continue; // a footnote definition
    const m = /^summary\s*:\s*(.+)$/i.exec(line);
    if (m) {
      summary = capWords(m[1]!.replace(/<[^>]*>/g, "").trim(), 22);
      continue;
    }
    const urls = [...line.matchAll(/<?(https?:\/\/[^\s<>]+)>?/g)].map((x) => x[1]!);
    for (const ref of line.matchAll(/[[<]\s*S?(\d{1,2})\s*[\]>]/gi)) if (labels.has(ref[1]!)) urls.push(labels.get(ref[1]!)!);
    const nums = [...new Set(urls.map(numberOf).filter((n) => n > 0))];
    const clean = line.replace(/<?https?:\/\/[^\s<>]+>?/g, "").replace(/<\s*estimate\s*>/gi, "").replace(/[[<]\s*S?\d{1,2}\s*[\]>]/gi, "").replace(/\(\s*\)/g, "").replace(/\s+/g, " ").trim();
    if (clean.length < 8) continue;
    notes.push(`${clean}${nums.length ? " " + nums.map((n) => `[${n}]`).join("") : /\bnot found\b/i.test(clean) ? "" : " (estimate)"}`);
    if (notes.length >= 15) break;
  }
  return { notes, cites, summary };
}

export type NoteFn = (kind: AgentNote["kind"], text: string) => void;


/** Lines that only say "not found" are evidence of a gap, not facts. */
export const isGapNote = (n: string) => /\bnot found\b/i.test(n) && !/\[\d+\]/.test(n);

/** One block's research: 1 search + ≤ 1 fetch on Haiku, streamed so the progress notes land as they happen. A
 *  failed call is retried at most once (without web_fetch when the API rejected the tool); `pause_turn` continues
 *  the same call and is not a retry. Every call reserves its estimate in the report budget first. */
export async function researchBlock(idea: string, id: BlockId, opts: { onNote?: NoteFn; location?: { country: string; city: string } | null; budget?: Budget } = {}): Promise<BlockResearch> {
  const meta = BLOCK_LIBRARY[id];
  const say: NoteFn = (k, t) => {
    try {
      opts.onNote?.(k, t);
    } catch {
      /* progress never fails a call */
    }
  };
  say("status", `Digging into ${meta.label.toLowerCase()}…`);
  if (config.mockAi) return mockResearch(idea, id, say);
  const t0 = Date.now();
  const prompt = researchPrompt(idea, id);
  const attempt = async (withFetch: boolean): Promise<BlockResearch> => {
    const settle = opts.budget?.reserve(`research:${id}`, EST.research);
    const lines: CostLine[] = [];
    try {
      const tools = [
        { type: SEARCH_TOOL, name: "web_search", max_uses: SEARCHES_PER_BLOCK, ...(opts.location ? { user_location: { type: "approximate", country: opts.location.country, city: opts.location.city } } : {}) },
        ...(withFetch ? [{ type: FETCH_TOOL, name: "web_fetch", max_uses: FETCHES_PER_BLOCK, max_content_tokens: FETCH_MAX_TOKENS, citations: { enabled: true } }] : []),
      ] as unknown as Anthropic.ToolUnion[];
      const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
      const pages: Array<{ url: string; title: string }> = [];
      const queries: string[] = [];
      const read: string[] = [];
      let text = "";
      for (let turn = 0; turn < 3; turn++) {
        const stream = getClient().messages.stream(
          { model: BLOCK_MODEL, max_tokens: 8000, system: RSYSTEM(opts.location?.city ?? null), messages, tools } as Anthropic.MessageStreamParams,
          { timeout: RESEARCH_CALL_MS, maxRetries: 0 },
        );
        stream.on("contentBlock", (b) => {
          const blk = b as unknown as { type: string; name?: string; input?: { query?: string; url?: string }; content?: unknown };
          if (blk.type === "server_tool_use" && blk.name === "web_search" && blk.input?.query) {
            queries.push(blk.input.query);
            say("search", `Searching: ${capWords(blk.input.query, 10)}`);
          }
          if (blk.type === "server_tool_use" && blk.name === "web_fetch" && blk.input?.url) say("read", `Reading ${hostOf(blk.input.url)}…`);
        });
        const msg = await stream.finalMessage();
        lines.push(recordUsage(`research:${id}`, msg.model, msg.usage));
        for (const b of msg.content as unknown as Array<{ type: string; content?: unknown }>) {
          if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content as Array<{ type: string; url: string; title: string }>) if (r.type === "web_search_result") pages.push({ url: r.url, title: r.title });
          const c = b.content as { type?: string; url?: string; content?: { title?: string | null } } | undefined;
          if (b.type === "web_fetch_tool_result" && c?.type === "web_fetch_result" && c.url) {
            pages.push({ url: c.url, title: (c.content?.title || hostOf(c.url)).slice(0, 140) });
            read.push(c.url);
          }
        }
        for (const b of msg.content) {
          if (b.type !== "text") continue;
          const cited: string[] = [];
          for (const c of (b.citations ?? []) as unknown as Array<{ type: string; url?: string; title?: string | null; document_index?: number; document_title?: string | null }>) {
            let url = c.url;
            // A fetched page's citations point at the document (index into the fetched pages, or its title).
            if (!url && c.document_index != null) url = read[c.document_index];
            if (!url && c.document_title) url = pages.find((p) => read.includes(p.url) && p.title === c.document_title)?.url;
            if (!url) continue;
            pages.push({ url, title: c.title ?? c.document_title ?? hostOf(url) });
            cited.push(url);
          }
          // markdown links the model wrote count only when numberNotes matches them to a page the tools returned
          const t = b.text.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 <$2>");
          text += t.replace(/\n+$/, "") + (cited.length ? ` ${[...new Set(cited)].map((u) => `<${u}>`).join(" ")}` : "") + (/\n$/.test(t) ? "\n" : "");
        }
        if (msg.stop_reason === "refusal") throw new Error("The AI declined to research this idea.");
        if (msg.stop_reason !== "pause_turn") break;
        messages.push({ role: "assistant", content: msg.content as Anthropic.ContentBlockParam[] });
      }
      const out = numberNotes(text, pages);
      const facts = out.notes.filter((n) => !isGapNote(n)).length;
      say("found", facts ? `Found ${facts} fact${facts > 1 ? "s" : ""}, ${out.cites.length} source${out.cites.length === 1 ? "" : "s"}` : `Little public data on ${meta.label.toLowerCase()}`);
      console.log(`[blocks] research ${id}${withFetch ? " + fetch" : ""}: ${out.notes.length} notes, ${out.cites.length} sources, ${queries.length} searches, ${read.length} fetches, ${Date.now() - t0}ms`);
      const summary = out.summary || (facts ? `Found ${facts} facts in ${out.cites.length} source${out.cites.length === 1 ? "" : "s"}.` : "No usable web source found.");
      return { id, notes: out.notes, cites: out.cites, queries, read, summary, ok: out.notes.length > 0 };
    } finally {
      settle?.(lines);
    }
  };
  try {
    return await attempt(true).catch((e) => {
      if (e instanceof BudgetError) throw e;
      const rejected = e instanceof Anthropic.BadRequestError;
      console.error(`[blocks] research ${id} failed, retrying once${rejected ? " without web_fetch" : ""}:`, (e as Error).message);
      return attempt(!rejected);
    });
  } catch (e) {
    console.error(`[blocks] research ${id} gave up:`, (e as Error).message);
    say("status", "Couldn't reach the web for this part; the report marks it as not found.");
    return emptyResearch(id);
  }
}

// ───────────────────────────────────────────────────────────── the report's shape (written by report-v7.ts)

const KINDS: FindingKind[] = ["fact", "number", "competitor", "estimate", "risk", "strength"];
const L = BLOCK_LIMITS;

export type EvidenceOut = { text: string; kind: FindingKind; impact: Impact; source: number | null; basis: string | null; display: string | null; competitor: { name: string; price: string | null; note: string } | null };
export type BlockOut = { title: string; focus: string[]; takeaway: string; evidence: EvidenceOut[]; key_numbers: Array<{ label: string; value: string; source: number | null; basis: string | null }>; math: string[]; meaning: string; actions: string[] };
export type Ref = { text: string; block: BlockId; item: number };
export type JudgeOut = {
  working_title: string;
  market: string | null;
  summary: string;
  verdict_line: string;
  validate_first: Array<{ what: string; how: string; pass_if: string }>;
  scalability: { reach: number; repeatable: number; margins: number; founder_free: number; digital: number; reach_label: string; why: string; would_scale: string[] };
  strengths: Ref[];
  weaknesses: Ref[];
  next_steps: string[];
  pivot: { idea: string; why: string } | null;
  /** Written report: the Verdict section's reason bullets. */
  reasons?: string[];
};
export type ReportOut = JudgeOut & {
  blocks: Partial<Record<BlockId, BlockOut>>;
  /** Each block's own numbered source list (evidence `source` numbers point into it); default: the research's cites. */
  cites?: Partial<Record<BlockId, SourceRef[]>>;
  /** Blocks or parts written by the fallback, not by the model. */
  fallback?: string[];
};

/** Pure: a plain write-up of one block from its notes, when its writing call failed twice (exported for tests). */
export function fallbackBlock(r: BlockResearch): BlockOut {
  const ev: EvidenceOut[] = r.notes.slice(0, L.evidenceMax).map((n) => {
    const m = /\[(\d+)\]/.exec(n);
    const text = capWords(n.replace(/\s*(\[\d+\])+\s*$/, "").replace(/\s*\(estimate\)\s*$/, ""), BLOCK_EVIDENCE_WORDS);
    return { text, kind: m ? (/\d/.test(text) ? "number" : "fact") : "estimate", impact: 0 as Impact, source: m ? Number(m[1]) : null, basis: m ? null : "Analyst note without a source", display: null, competitor: null };
  });
  const meta = BLOCK_LIBRARY[r.id];
  return {
    title: meta.label,
    focus: fallbackBlockPlans("").find((p) => p.id === r.id)!.focus,
    takeaway: r.summary || "The research for this section came back empty.",
    evidence: ev.length ? ev : [{ text: "No web research came back for this section, so nothing here is checked.", kind: "risk", impact: -1, source: null, basis: "No research", display: null, competitor: null }],
    key_numbers: [],
    math: [],
    meaning: "The written analysis of this section failed, so these are the analyst's research notes as found. Read them as raw material, not conclusions.",
    actions: [`Check the ${meta.label.toLowerCase()} notes by hand before deciding`],
  };
}

/** Pure: framing parts built by rules when the judge call failed twice (exported for tests). */
export function fallbackJudge(idea: string, blocks: Partial<Record<BlockId, BlockOut>>): JudgeOut {
  const j = mockJudgeParts(idea);
  const items = BLOCK_IDS.flatMap((id) => (blocks[id]?.evidence ?? []).map((e, i) => ({ id, i, e })));
  const pick = (sign: 1 | -1) => items.filter((x) => Math.sign(x.e.impact) === sign).slice(0, 3).map((x) => ({ text: capWords(x.e.text, 14), block: x.id, item: x.i + 1 }));
  return {
    working_title: capWords(idea, 6),
    market: null,
    summary: capWords(BLOCK_IDS.flatMap((id) => (blocks[id] ? [`${BLOCK_LIBRARY[id].label}: ${blocks[id]!.takeaway}`] : [])).join(" "), 110),
    verdict_line: "Read the four sections: the editor's summary could not be written.",
    validate_first: BLOCK_IDS.filter((id) => blocks[id]?.actions[0]).slice(0, 3).map((id) => ({ what: BLOCK_LIBRARY[id].covers, how: blocks[id]!.actions[0]!, pass_if: "" })),
    scalability: j,
    strengths: pick(1),
    weaknesses: pick(-1),
    next_steps: BLOCK_IDS.flatMap((id) => blocks[id]?.actions.slice(0, 1) ?? []).slice(0, 3),
    pivot: null,
  };
}
const mockJudgeParts = (idea: string): JudgeOut["scalability"] => {
  const t = idea.toLowerCase();
  const digital = /\b(app|saas|software|online|platform|marketplace|web)\b/.test(t);
  const physical = /\b(shop|kiosk|caf[eé]|bakery|restaurant|bar|studio|salon|gym)\b/.test(t);
  const [reach, repeatable, margins, founder_free, dig] = digital ? [8, 8, 7, 6, 9] : physical ? [3, 5, 4, 3, 2] : [5, 5, 5, 4, 4];
  return { reach, repeatable, margins, founder_free, digital: dig, reach_label: digital ? "Country" : physical ? "Neighbourhood" : "City", why: physical ? "Each place needs its own premises and staff (rule of thumb, not researched)." : "Rule-of-thumb estimate: the editor's analysis failed.", would_scale: [] };
};

/** The whole report built from the notes alone (every model writing call failed or timed out). */
export function fallbackReport(idea: string, research: readonly BlockResearch[], only: readonly BlockId[] = BLOCK_IDS): ReportOut {
  const blocks = Object.fromEntries(only.map((id) => [id, fallbackBlock(research.find((r) => r.id === id) ?? emptyResearch(id))])) as Partial<Record<BlockId, BlockOut>>;
  return { ...fallbackJudge(idea, blocks), blocks, fallback: [...only, "judge"] };
}

// ───────────────────────────────────────────────────────────── assembling (pure)

const draftOf = (b: BlockOut): BlockDraft => ({
  takeaway: b.takeaway,
  evidence: b.evidence.map((e) => ({
    text: e.text,
    kind: KINDS.includes(e.kind) ? e.kind : "estimate",
    impact: Math.max(-2, Math.min(2, Math.round(Number(e.impact) || 0))) as Impact,
    ...(e.source ? { source: e.source } : {}),
    ...(e.basis ? { basis: e.basis } : {}),
    ...(e.display ? { display: e.display } : {}),
    ...(e.competitor?.name?.trim() ? { competitor: { name: e.competitor.name, ...(e.competitor.price ? { price: e.competitor.price } : {}), note: e.competitor.note } } : {}),
  })),
  meaning: b.meaning,
  actions: b.actions,
  keyNumbers: b.key_numbers.map((k) => ({ label: k.label, value: k.value, ...(k.source ? { source: k.source } : {}), ...(k.basis ? { basis: k.basis } : {}) })),
  math: b.math,
});

export interface Assembled {
  blocks: ReportBlock[];
  findings: Partial<Record<AnalystRole, Finding[]>>;
  judge: JudgeDraft;
  brief: ReportBrief;
}

/**
 * Turns the report answer + the research into stored blocks, contract findings, the judge draft and the brief.
 * `kept` = blocks not rewritten (steer); `startIndex` = first free finding number per role (unique ids across steers).
 */
export function assembleReport(
  out: ReportOut,
  research: readonly BlockResearch[],
  opts: { kept?: readonly ReportBlock[]; startIndex?: Partial<Record<AnalystRole, number>>; t0?: number } = {},
): Assembled {
  const plans = fallbackBlockPlans("");
  const blocks: ReportBlock[] = [];
  const findings: Partial<Record<AnalystRole, Finding[]>> = {};
  for (const id of BLOCK_IDS) {
    const b = out.blocks[id];
    const keptBlock = opts.kept?.find((k) => k.id === id);
    if (!b) {
      if (keptBlock) blocks.push(keptBlock);
      continue;
    }
    const base = plans.find((p) => p.id === id)!;
    const plan: BlockPlan = { id, title: b.title?.trim() || base.title, focus: b.focus?.length ? b.focus : base.focus, queries: [] };
    const cites = out.cites?.[id] ?? research.find((r) => r.id === id)?.cites ?? [];
    const role = BLOCK_LIBRARY[id].role;
    const built = buildBlock(plan, draftOf(b), cites, { startIndex: opts.startIndex?.[role] ?? 0 });
    blocks.push({ ...built.block, ...(opts.t0 != null ? { ms: { done: Date.now() - opts.t0 } } : {}) });
    findings[role] = built.findings;
  }
  const idOf = (x: Ref): string => {
    const blk = blocks.find((b) => b.id === x.block);
    return blk?.evidence[Math.max(0, Math.round(x.item) - 1)] ?? "";
  };
  const judge: JudgeDraft = {
    fullText: true,
    verdictLine: out.verdict_line,
    scalability: {
      parts: { Reach: out.scalability.reach, Repeatable: out.scalability.repeatable, "Margins at scale": out.scalability.margins, "Founder-free": out.scalability.founder_free, "Digital leverage": out.scalability.digital } satisfies Record<ScalePart, number>,
      reach: ["Neighbourhood", "City", "Country", "Global"].includes(out.scalability.reach_label) ? out.scalability.reach_label : undefined,
      why: out.scalability.why,
      wouldScale: out.scalability.would_scale,
    },
    strengths: out.strengths.map((s) => ({ text: s.text, finding: idOf(s) })),
    weaknesses: out.weaknesses.map((s) => ({ text: s.text, finding: idOf(s) })),
    nextSteps: out.next_steps,
    pivot: out.pivot?.idea?.trim() ? out.pivot : null,
    ...(out.reasons?.length ? { reasons: out.reasons } : {}),
  };
  // Generous caps: the UI shows full sentences (a cap only guards against a runaway answer).
  const validateFirst: ValidateFirst[] = out.validate_first.slice(0, 3).map((v) => ({ what: capWords(v.what, 40), how: capWords(v.how, 90), passIf: capWords(v.pass_if, 50) }));
  const brief: ReportBrief = { title: capWords(out.working_title, 14), summary: capWords(out.summary, 260), ...(out.market ? { market: capWords(out.market, 12) } : {}), validateFirst, researchedAt: today() };
  return { blocks, findings, judge, brief };
}

// ───────────────────────────────────────────────────────────── demo mode (MOCK_AI): the hand-checked samples

/** Where a classic sample role's findings go in the 4 blocks. */
export const BLOCK_FROM_ROLE: Record<AnalystRole, BlockId> = {
  demand: "customers",
  location: "customers",
  competition: "competition",
  market: "money",
  pricing: "money",
  viability: "risks",
  regulation: "risks",
  tech: "risks",
  scalability: "risks",
};
export const ownerOf = (r: AnalystRole): AnalystRole => BLOCK_LIBRARY[BLOCK_FROM_ROLE[r]].role;

/** A sample's findings regrouped into blocks: sources numbered per block, the classic-id → block-id map. */
export function sampleBlocks(s: V7Sample): { evidence: Record<BlockId, Array<{ f: Omit<Finding, "id" | "analyst" | "t">; classicId: string }>>; cites: Record<BlockId, SourceRef[]>; headline: Record<BlockId, string[]>; idMap: Record<string, string> } {
  const evidence = Object.fromEntries(BLOCK_IDS.map((b) => [b, []])) as unknown as Record<BlockId, Array<{ f: Omit<Finding, "id" | "analyst" | "t">; classicId: string }>>;
  const headline = Object.fromEntries(BLOCK_IDS.map((b) => [b, []])) as unknown as Record<BlockId, string[]>;
  for (const r of s.roster) {
    const w = s.work[r.role];
    if (!w) continue;
    const b = BLOCK_FROM_ROLE[r.role];
    headline[b].push(w.headline);
    w.findings.forEach((f, i) => evidence[b].push({ f, classicId: `${r.role}-${i}` }));
  }
  const cites = Object.fromEntries(BLOCK_IDS.map((b) => [b, [] as SourceRef[]])) as Record<BlockId, SourceRef[]>;
  const idMap: Record<string, string> = {};
  for (const b of BLOCK_IDS) {
    for (const [i, e] of evidence[b].slice(0, L.evidenceMax).entries()) {
      if (e.f.source && !cites[b].some((c) => c.url === e.f.source!.url)) cites[b].push(e.f.source);
      idMap[e.classicId] = `${BLOCK_LIBRARY[b].role}-${i}`;
    }
  }
  return { evidence, cites, headline, idMap };
}


/** Pure: notes carrying global [S#] labels → one block's notes with local [n] numbers and its cites. */
export function localizeNotes(id: BlockId, text: string, sources: ReadonlyArray<{ id: string; url: string; title: string }>, accessed = today()): Pick<BlockResearch, "notes" | "cites"> {
  const cites: SourceRef[] = [];
  const notes: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/^\s*[-*•]\s*/, "").trim();
    if (line.length < 8) continue;
    const nums: number[] = [];
    for (const m of line.matchAll(/\[(S\d+)\]/g)) {
      const s = sources.find((x) => x.id === m[1]);
      if (!s) continue;
      let i = cites.findIndex((c) => c.url === s.url);
      if (i < 0) (cites.push({ url: s.url, title: s.title.slice(0, 140), domain: hostOf(s.url), accessed }), (i = cites.length - 1));
      if (!nums.includes(i + 1)) nums.push(i + 1);
    }
    const clean = line.replace(/\s*\[S\d+\]/g, "").trim();
    notes.push(`${clean}${nums.length ? " " + nums.map((n) => `[${n}]`).join("") : isGapNote(clean) ? "" : " (estimate)"}`);
  }
  void id;
  return { notes: notes.slice(0, 15), cites };
}

/** A classic sample's findings for one block as numbered notes (its hand-checked pages as the cites). */
function classicNotes(s: V7Sample, id: BlockId): Pick<BlockResearch, "notes" | "cites"> {
  const sb = sampleBlocks(s);
  const cites = sb.cites[id];
  const notes = sb.evidence[id].slice(0, L.evidenceMax).map(({ f }) => {
    const k = f.source ? cites.findIndex((c) => c.url === f.source!.url) + 1 : 0;
    return `${f.text}${k ? ` [${k}]` : " (estimate)"}`;
  });
  return { notes, cites };
}

/** Demo mode: the real research notes of the matching measured run (REPORT_SAMPLES), with real progress notes. */
async function mockResearch(idea: string, id: BlockId, say: NoteFn): Promise<BlockResearch> {
  const key = v7SampleFor(idea)?.key;
  const sample = key ? REPORT_SAMPLES[key] : undefined;
  // demo pacing: long enough that each speech bubble can be read (the client shows one every ~1.5-2.6 s)
  const total = config.mockDelayMs ?? 3500 + Math.random() * 2500;
  const classic = v7SampleFor(idea);
  if (!sample && !classic) {
    await sleep(total);
    say("found", `Little public data on ${BLOCK_LIBRARY[id].label.toLowerCase()} (demo mode)`);
    return { ...emptyResearch(id), summary: "Demo mode: no web search, estimates only.", ok: true };
  }
  // a classic sample (hand-checked findings, real pages) when no measured report run exists for it
  const { notes, cites } = sample ? localizeNotes(id, sample.research[id], sample.sources, sample.accessed) : classicNotes(classic!, id);
  const hosts = [...new Set(cites.map((c) => c.domain))].slice(0, 2);
  const step = total / (hosts.length + 1);
  for (const h of hosts) {
    await sleep(step);
    say("read", `Reading ${h}…`);
  }
  await sleep(step);
  const facts = notes.filter((n) => !isGapNote(n)).length;
  say("found", `Found ${facts} facts, ${cites.length} sources`);
  return { id, notes, cites, queries: [], read: cites.map((c) => c.url), summary: `Found ${facts} facts in ${cites.length} sources.`, ok: true };
}

/** Demo-mode prepared steer, moved onto the block owners (ids follow the regrouped numbering). */
export function sampleSteerFindings(s: V7Sample, p: V7Sample["steers"][number], startIndex: Partial<Record<AnalystRole, number>>): Partial<Record<AnalystRole, { findings: Finding[]; headline?: string }>> {
  const { idMap } = sampleBlocks(s);
  const fresh: Partial<Record<AnalystRole, { findings: Finding[]; headline?: string }>> = {};
  for (const [role, v] of Object.entries(p.fresh) as Array<[AnalystRole, NonNullable<V7Sample["steers"][number]["fresh"][AnalystRole]>]>) {
    const owner = ownerOf(role);
    const list = fresh[owner]?.findings ?? [];
    const n0 = (startIndex[owner] ?? 0) + list.length;
    v.findings.forEach((f, i) => {
      const rep = v.replaces?.[i] ? idMap[v.replaces[i]!] : undefined;
      list.push(enforceSourceRule({ ...f, id: `${owner}-${n0 + i}`, analyst: owner, t: 0, ...(rep ? { replaces: rep } : {}) }));
    });
    fresh[owner] = { findings: list, headline: v.headline };
  }
  return fresh;
}
