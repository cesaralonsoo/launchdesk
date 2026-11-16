// LaunchDesk v7.2 — the founder report writer (recipe "V1", measured in .notes/quality/opt/DECISION.md). Owner: WS-INTEL.
//
//   research × 4 (blocks-v7.ts researchBlock)      writer (ONE streamed Haiku call)          parse (pure, here)
//   1 search + ≤ 1 fetch each, notes per line  ──►  whole report in Markdown, every figure ──►  results.v7.blocks / work
//   with the [S#] of the page that states it        cites [S#], unit economics as            findings, judge draft,
//                                                    placeholders + a fenced econ JSON block   brief, reportMd
//
// The arithmetic is done in code (computeEcon), never by the model. Any [S#] that is not in the source list is
// removed. A parse failure never triggers a second paid call: the report ships with "n/a" and `econErr`.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { Budget, BudgetError, EST, recordUsage, type CostLine } from "./cost.js";
import { emptyResearch, fallbackReport, sampleBlocks, type BlockResearch, type BlockOut, type EvidenceOut, type JudgeOut, type ReportOut } from "./blocks-v7.js";
import { VERDICT_BANDS_V7, VERDICT_WORD, type EconSummary, type IdeaReport } from "./v7.js";
import { BLOCK_IDS, BLOCK_LIBRARY, BLOCK_LIMITS, capWords, fullSentences, noInlineCites, unitPlural as unitPluralV7, factorScore, fallbackBlockPlans, hostOf, isGapText, STEP_ESTIMATE, STEP_SOURCED, type AgentNote, type AnalystRole, type BlockId, type FindingKind, type Impact, type SourceRef } from "./v7.js";
import { ACCESSED, REPORT_SAMPLES, v7SampleFor, type V7Sample } from "./v7-samples.js";
import { LOCATION_GAP } from "./v7.js";
import type { BusinessKind } from "./blocks-v7.js";
import { currencyOf, fmtMoney, MONEY_SIGN_SRC, symbolFor } from "./money.js";

const envModel = (name: string, dflt: string) => (process.env[name] && /^claude-[a-z0-9-]+$/.test(process.env[name]!) ? process.env[name]! : dflt);
/** Never default to Sonnet: DECISION.md measured it as not worth the cost. */
export const WRITER_MODEL = envModel("MODEL_REPORT_WRITER", "claude-haiku-5-5");
const WRITER_CALL_MS = 120_000;

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: config.anthropicKey, maxRetries: 0, timeout: WRITER_CALL_MS }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

// ───────────────────────────────────────────────────────────── market (user_location for the searches)

const CITIES: Array<[RegExp, string, string]> = [
  [/\bmadrid\b/i, "Madrid", "ES"], [/\bbarcelona\b/i, "Barcelona", "ES"], [/\bval[eè]ncia\b/i, "Valencia", "ES"], [/\b(sevilla|seville)\b/i, "Seville", "ES"],
  [/\bzaragoza\b/i, "Zaragoza", "ES"], [/\bm[aá]laga\b/i, "Malaga", "ES"], [/\bmurcia\b/i, "Murcia", "ES"], [/\bpalma\b/i, "Palma", "ES"], [/\bbilbao\b/i, "Bilbao", "ES"],
  [/\balicante\b/i, "Alicante", "ES"], [/\bc[oó]rdoba\b/i, "Cordoba", "ES"], [/\bvalladolid\b/i, "Valladolid", "ES"], [/\bvigo\b/i, "Vigo", "ES"], [/\bgranada\b/i, "Granada", "ES"],
  [/\bgij[oó]n\b/i, "Gijon", "ES"], [/\b(a coru[nñ]a|la coru[nñ]a)\b/i, "A Coruna", "ES"], [/\bsantander\b/i, "Santander", "ES"], [/\b(san sebasti[aá]n|donostia)\b/i, "San Sebastian", "ES"],
  [/\bpamplona\b/i, "Pamplona", "ES"], [/\bsalamanca\b/i, "Salamanca", "ES"], [/\bc[aá]diz\b/i, "Cadiz", "ES"], [/\bgirona\b/i, "Girona", "ES"], [/\btarragona\b/i, "Tarragona", "ES"],
  [/\b(lisbon|lisboa)\b/i, "Lisbon", "PT"], [/\bporto\b/i, "Porto", "PT"], [/\bparis\b/i, "Paris", "FR"], [/\blyon\b/i, "Lyon", "FR"], [/\blondon\b/i, "London", "GB"],
  [/\bmanchester\b/i, "Manchester", "GB"], [/\bberlin\b/i, "Berlin", "DE"], [/\b(munich|m[uü]nchen)\b/i, "Munich", "DE"], [/\b(rome|roma)\b/i, "Rome", "IT"], [/\b(milan|milano)\b/i, "Milan", "IT"],
  [/\bamsterdam\b/i, "Amsterdam", "NL"], [/\bdublin\b/i, "Dublin", "IE"],
];
/** Ruzafa → Valencia etc.: neighbourhoods founders name without their city. */
const BARRIOS: Array<[RegExp, string]> = [[/\b(ruzafa|russafa)\b/i, "Valencia"], [/\b(gr[aà]cia|eixample|poblenou|el born)\b/i, "Barcelona"], [/\b(malasa[nñ]a|lavapi[eé]s|chamber[ií]|salamanca district)\b/i, "Madrid"]];
export interface Market { city: string; country: string }
/** The idea's city when a known one is named (pure); null otherwise (then the searches carry no user_location). */
export function marketOf(idea: string): Market | null {
  for (const [re, city] of BARRIOS) if (re.test(idea)) return { city, country: "ES" };
  for (const [re, city, country] of CITIES) if (re.test(idea)) return { city, country };
  return null;
}

const ONLINE_WORDS = /\b(online|app|apps|saas|software|platform|marketplace|website|web ?shop|e-?commerce|subscription box|newsletter|digital|plugin|api|crypto|bitcoin|bch|token|nft|dao|wallet|ships|shipping|shipped|mail[- ]order|worldwide|remote|course|ebook|podcast|etsy|shopify|amazon|en l[ií]nea|aplicaci[oó]n|plataforma|tienda online|env[ií]os?)\b/i;
const PREMISES_WORDS = /\b(kiosk|caf[eé]|coffee shop|bakery|restaurant|bar|salon|gym|studio|stall|food truck|shop in|store in|storefront|walk-in|near me)\b/i;
/** Pure: "online" when the idea names no known city and sells online (app, software, shipping, crypto…) with no
 *  premises; everything else is "local" (today's city-centred research). */
export function businessKind(idea: string): BusinessKind {
  const t = String(idea ?? "");
  if (marketOf(t)) return "local";
  if (!ONLINE_WORDS.test(t)) return "local";
  // "an app that splits restaurant bills": the premises word describes the customer, not what is sold. With a software
  // or online-channel word, premises only count when they are the thing being opened or run.
  if (SOFTWARE_WORDS.test(t)) return PREMISES_SOLD.test(t) ? "local" : "online";
  return PREMISES_WORDS.test(t) ? "local" : "online";
}
const SOFTWARE_WORDS = /\b(app|apps|saas|software|platform|plugin|api|website|newsletter|marketplace|etsy|shopify|amazon|ebay|e-?commerce|online store|web ?shop|podcast|ebook)\b/i;
const PREMISES_SOLD = { test: (t: string) => /\b(open(?:ing)?|run(?:ning)?|own(?:ing)?|start(?:ing)?)\s+(?:a|an|my|our)?\s*(?:kiosk|caf[eé]|coffee shop|bakery|restaurant|bar|salon|gym|studio|stall|food truck|shop|store|storefront)(?![a-z])/i.test(t) || /\b(?:kiosk|caf[eé]|coffee shop|bakery|restaurant|bar|salon|gym|stall|food truck|shop|store|storefront)\s+(?:in|at|on|near)\s+(?:the\s+)?[A-Z]/.test(t) };
/** Selling channels that are never a place. An "app" or "website" is not one: a dog-walking app in Madrid is local. */
const ONLINE_CHANNEL = /\b(etsy|shopify|amazon|ebay|online (?:shop|store)|web ?shop|e-?commerce|ships|shipping|mail[- ]order|newsletter|saas|software|podcast|ebook)\b/i;
/** Pure: the idea sells through a channel that is not a place (Etsy, an online store, a newsletter…), even when it
 *  names the founder's city: the launch kit is then planned online. */
export function sellsOnline(idea: string): boolean {
  const t = String(idea ?? "");
  return ONLINE_CHANNEL.test(t) && !PREMISES_SOLD.test(t);
}

// ───────────────────────────────────────────────────────────── sources: per-block numbers → global [S#]

export interface ReportSource { id: string; url: string; title: string }
/** Pure: each block's notes (local [n]) relabelled with global [S#] ids, deduplicated by URL across blocks. */
export function labelResearch(research: readonly BlockResearch[]): { sections: Array<{ id: BlockId; title: string; notes: string }>; sources: ReportSource[] } {
  const sources: ReportSource[] = [];
  const sid = (c: SourceRef) => {
    let s = sources.find((x) => x.url === c.url);
    if (!s) sources.push((s = { id: `S${sources.length + 1}`, url: c.url, title: c.title }));
    return s.id;
  };
  const sections = BLOCK_IDS.map((id) => {
    const r = research.find((x) => x.id === id) ?? emptyResearch(id);
    const lines = r.notes.map((n) => `- ${n.replace(/\[(\d{1,2})\]/g, (all, k: string) => (r.cites[Number(k) - 1] ? `[${sid(r.cites[Number(k) - 1]!)}]` : ""))}`);
    return { id, title: BLOCK_LIBRARY[id].label, notes: lines.join("\n") || "not found" };
  });
  return { sections, sources };
}

// ───────────────────────────────────────────────────────────── unit economics (computed in code)

/** `eur` is the amount in the econ currency (the idea's currency; EUR for every report stored before currencies). The
 *  writer may send it as `amount` (and the price as `price_per_unit_gross`): finalizeReport maps both to these names. */
export interface EconItem { item: string; eur: number; amount?: number; source?: string; quote?: string }
export interface EconInputs {
  unit: string;
  price_per_unit_gross_eur: number;
  price_per_unit_gross?: number;
  vat_rate: number;
  share_kept?: number | null;
  variable_costs_per_unit?: EconItem[];
  fixed_monthly_costs?: EconItem[];
  startup_costs?: EconItem[];
}
export interface EconComputed { net: number; varc: number; contrib: number; fixed: number; be: number | null; cap: number; missing: string[] }
export const PLACEHOLDERS = ["NET_REVENUE_PER_UNIT", "VARIABLE_COST_PER_UNIT", "CONTRIBUTION_PER_UNIT", "CONTRIBUTION_MARGIN_PCT", "FIXED_MONTHLY", "BREAK_EVEN_UNITS", "STARTUP_CAPITAL"] as const;
/** What a figure shows when one of its inputs is missing (the writer gave €0 or nothing). */
export const ECON_NA = "n/a (cost inputs missing)";

const eur = (x: number) => `€${x.toLocaleString("en-US", { minimumFractionDigits: Math.abs(x) < 100 ? 2 : 0, maximumFractionDigits: Math.abs(x) < 100 ? 2 : 0 })}`;
/** EUR keeps the exact old format (byte-identical tables); any other currency is formatted by Intl. */
const moneyIn = (code: string) => (code === "EUR" ? eur : (x: number) => fmtMoney(x, code));
/** Pure: the cost lines the writer left at €0 (or a whole empty group). A €0 cost is a missing input, never a fact. */
export function missingInputs(e: EconInputs): string[] {
  const out: string[] = [];
  const groups: Array<[string, EconItem[] | undefined]> = [["variable cost per unit", e.variable_costs_per_unit], ["fixed monthly costs", e.fixed_monthly_costs], ["start-up costs", e.startup_costs]];
  for (const [name, list] of groups) {
    if (!list?.length) out.push(name);
    else for (const x of list) if (!(Number(x.eur) > 0)) out.push(`${String(x.item || name).trim()} (${name})`);
  }
  return out;
}
/** Pure port of opt.ts computeEcon: net = gross / (1 + VAT) × share kept; break-even = ceil(fixed / contribution).
 *  Guard: when a cost input is missing (€0 or empty), the figures that depend on it become "n/a", never a number. */
export function computeEcon(e: EconInputs, code = "EUR"): { vals: Record<(typeof PLACEHOLDERS)[number], string>; table: string; raw: EconComputed } {
  const eur = moneyIn(code);
  const sym = code === "EUR" ? "€" : symbolFor(code);
  const sum = (a?: EconItem[]) => (a ?? []).reduce((s, x) => s + (Number(x.eur) || 0), 0);
  const share = e.share_kept == null ? 1 : Number(e.share_kept);
  const net = ((Number(e.price_per_unit_gross_eur) || 0) / (1 + (Number(e.vat_rate) || 0))) * share;
  const varc = sum(e.variable_costs_per_unit);
  const contrib = net - varc;
  const fixed = sum(e.fixed_monthly_costs);
  const cap = sum(e.startup_costs);
  const missing = missingInputs(e);
  const varOk = !missing.some((m) => m.includes("variable cost per unit"));
  const fixOk = !missing.some((m) => m.includes("fixed monthly costs"));
  const capOk = !missing.some((m) => m.includes("start-up costs"));
  const be = varOk && fixOk && contrib > 0 ? Math.ceil(fixed / contrib) : null;
  const vals = {
    NET_REVENUE_PER_UNIT: eur(net),
    VARIABLE_COST_PER_UNIT: varOk ? eur(varc) : ECON_NA,
    CONTRIBUTION_PER_UNIT: varOk ? eur(contrib) : ECON_NA,
    CONTRIBUTION_MARGIN_PCT: varOk && net > 0 ? `${((contrib / net) * 100).toFixed(0)}%` : "n/a",
    FIXED_MONTHLY: fixOk ? eur(fixed) : ECON_NA,
    BREAK_EVEN_UNITS: !varOk || !fixOk ? ECON_NA : be == null ? "never (contribution is not positive)" : be.toLocaleString("en-US"),
    STARTUP_CAPITAL: capOk ? eur(cap) : ECON_NA,
  };
  const cell = (s: unknown) => String(s ?? "").replace(/\|/g, "/").trim();
  // EUR tables stay byte-identical (stored reports); the US and Canada have sales tax, not VAT; 93.5% is never shown as 94%
  const taxWord = code === "USD" || code === "CAD" ? "sales tax" : "VAT";
  const sharePct = code === "EUR" || Number.isInteger(Math.round(share * 1000) / 10) ? (share * 100).toFixed(0) : (share * 100).toFixed(1);
  const row = (x: EconItem) => `| ${cell(x.item)} | ${Number(x.eur) > 0 ? eur(Number(x.eur)) : "missing"} | ${cell(x.source) || "estimate"} |`;
  const table = `**Computed unit economics** (unit: ${cell(e.unit)}; arithmetic done in code from the inputs below)

| line | value |
|---|---|
| Price per unit (incl. ${taxWord} ${((Number(e.vat_rate) || 0) * 100).toFixed(0)}%) | ${eur(Number(e.price_per_unit_gross_eur) || 0)} |
| Share kept by the business | ${sharePct}% |
| Net revenue per unit | ${vals.NET_REVENUE_PER_UNIT} |
| Variable cost per unit | ${vals.VARIABLE_COST_PER_UNIT} |
| Contribution per unit | ${vals.CONTRIBUTION_PER_UNIT} (${vals.CONTRIBUTION_MARGIN_PCT}) |
| Fixed costs per month | ${vals.FIXED_MONTHLY} |
| Break-even (units per month) | ${vals.BREAK_EVEN_UNITS} |
| Start-up capital | ${vals.STARTUP_CAPITAL} |

| variable cost per unit | ${sym} | source |
|---|---|---|
${(e.variable_costs_per_unit ?? []).map(row).join("\n")}

| fixed cost per month | ${sym} | source |
|---|---|---|
${(e.fixed_monthly_costs ?? []).map(row).join("\n")}

| start-up cost | ${sym} | source |
|---|---|---|
${(e.startup_costs ?? []).map(row).join("\n")}`;
  const warn = missing.length ? `\n\n**Missing cost inputs:** ${missing.map(cell).join("; ")}. The figures that depend on them are shown as n/a until you get a quote.` : "";
  return { vals, table: table + warn, raw: { net, varc, contrib, fixed, be, cap, missing } };
}

/** Pure: puts the computed figures where the writer left placeholders; unknown or uncomputable ones become "n/a". */
export function fillPlaceholders(md: string, vals: Partial<Record<string, string>> | null): { md: string; missing: number } {
  let missing = 0;
  // "€{{NET_REVENUE_PER_UNIT}}" → "€2.73", never "€€2.73": the computed value already carries its € sign
  // any currency sign ("$", "MX$", "£") or a code ("MXN ") in front of a placeholder is dropped: the value carries its own
  const out = md.replace(/((?:[A-Z]{1,2})?[€$£¥₹]\s?|\b[A-Z]{3}\s)?\{\{\s*([A-Z_]+)\s*\}\}/g, (_all, sign: string | undefined, k: string) => {
    const v = vals?.[k];
    if (v == null) missing++;
    const val = v ?? "n/a";
    return sign && /^\d/.test(val) ? `${sign}${val}` : val;
  });
  // "{{CONTRIBUTION_MARGIN_PCT}}%" → "46%", never "46%%": the computed value already ends in %
  // the writer's spec calls the fenced cost JSON "the econ block": the founder only sees the unit economics table
  return { md: out.replace(/%%/g, "%").replace(/\b(the|this|your)?\s*econ (?:block|fence|JSON)\b/gi, (m: string, d?: string) => (d ? `${d} unit economics table` : /^\s*E/.test(m) ? `${m.match(/^\s*/)![0]}Unit economics table` : `${m.match(/^\s*/)![0]}unit economics table`)), missing };
}

// ───────────────────────────────────────────────────────────── finalize (econ, placeholders, cites, sources)

export interface WriterScale { reach: number; repeatable: number; margins: number; founder_free: number; digital: number; reach_label: string; why: string; would_scale: string[] }
export interface WriterMeta { scores?: Partial<Record<BlockId, number>>; scalability?: Partial<WriterScale>; pivot?: { idea: string; why: string } | null }
export interface Finalized {
  md: string;
  /** `currency`: ISO code of every amount in `inputs` (absent = EUR). */
  econ: { inputs: EconInputs; computed: EconComputed; currency?: string } | null;
  econErr: string | null;
  invalidCites: number;
  meta: WriterMeta;
}

/** Pure: the writer's raw Markdown → the shipped report (see the header). */
export function finalizeReport(raw: string, sources: readonly ReportSource[], code = "EUR"): Finalized {
  const fences = [...raw.matchAll(/```(?:econ|json)\s*\n?([\s\S]*?)```/g)];
  const fence = fences[fences.length - 1];
  let md = (fence ? raw.slice(0, fence.index) + raw.slice(fence.index! + fence[0].length) : raw).replace(/\n## Sources\b[\s\S]*$/i, "").trim();
  let econ: Finalized["econ"] = null;
  let econErr: string | null = null;
  let meta: WriterMeta = {};
  let vals: Record<string, string> | null = null;
  let table = "";
  if (!fence) econErr = "no econ block";
  else {
    try {
      const j = JSON.parse(fence[1]!.trim()) as EconInputs & WriterMeta;
      // the currency-neutral keys ("price_per_unit_gross", "amount") and the old EUR ones both parse
      if (j && typeof j === "object") {
        if (j.price_per_unit_gross_eur == null && j.price_per_unit_gross != null) j.price_per_unit_gross_eur = j.price_per_unit_gross;
        delete j.price_per_unit_gross;
        for (const g of [j.variable_costs_per_unit, j.fixed_monthly_costs, j.startup_costs]) {
          if (!Array.isArray(g)) continue;
          for (const x of g) if (x && typeof x === "object") { if (x.eur == null && x.amount != null) x.eur = x.amount; delete x.amount; }
        }
      }
      const pv = j.pivot && typeof j.pivot === "object" ? { idea: String(j.pivot.idea ?? "").trim(), why: String(j.pivot.why ?? "").trim() } : null;
      meta = { ...(j.scores && typeof j.scores === "object" ? { scores: j.scores } : {}), ...(j.scalability && typeof j.scalability === "object" ? { scalability: j.scalability } : {}), ...(pv?.idea ? { pivot: pv } : {}) };
      if (!Number.isFinite(Number(j.price_per_unit_gross_eur)) || Number(j.price_per_unit_gross_eur) <= 0) econErr = "econ block has no price";
      else {
        const { scores: _s, scalability: _c, pivot: _p, ...inputs } = j;
        const c = computeEcon(inputs, code);
        econ = { inputs, computed: c.raw, ...(code !== "EUR" ? { currency: code } : {}) };
        vals = c.vals;
        table = c.table;
        if (c.raw.missing.length) econErr = `cost inputs missing: ${c.raw.missing.slice(0, 6).join(", ")}`;
      }
    } catch (e) {
      econErr = `econ block is not valid JSON: ${(e as Error).message.slice(0, 80)}`;
    }
  }
  const filled = fillPlaceholders(md, vals);
  md = filled.md;
  if (filled.missing && !econErr) econErr = `${filled.missing} placeholder(s) left unfilled`;
  if (table) {
    const mi = md.search(/^## Money\b/m);
    if (mi >= 0) {
      const rest = md.slice(mi + 3);
      const ni = rest.search(/^## /m);
      const at = ni < 0 ? md.length : mi + 3 + ni;
      md = `${md.slice(0, at).trimEnd()}\n\n${table}\n\n${md.slice(at)}`.trim();
    } else md = `${md}\n\n${table}`;
  }
  const known = new Map(sources.map((s) => [s.id, s]));
  let invalidCites = 0;
  md = md.replace(/ ?\[(S\d+)\]/g, (all, id: string) => (known.has(id) ? all : (invalidCites++, "")));
  const used = [...new Set([...md.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]!))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  if (used.length) md += `\n\n## Sources\n${used.map((id) => { const s = known.get(id)!; return `- [${id}] [${s.title.replace(/[[\]]/g, "")}](${s.url})`; }).join("\n")}\n`;
  return { md: md.trimEnd() + "\n", econ, econErr, invalidCites, meta };
}

// ───────────────────────────────────────────────────────────── Markdown → blocks (pure)

const strip = (s: string) => s.replace(/\*\*|__/g, "").replace(/(^|\s)\*([^*\n]+)\*/g, "$1$2").replace(/\s+/g, " ").trim();
/** Bracketed research ids, also with qualifiers: [S2], [S2, estimate], [S2, S3], [S12; estimate], [S18 covers …]. */
export const CITE_RE = /\s*\[S\d+(?:\s*[,;]\s*(?:S\d+|estimate))*(?:\s+[^\]\n]{0,160})?\]/gi;
const noCites = (s: string) => s.replace(CITE_RE, "").replace(/\s+([.,;:])/g, "$1").replace(/\s+/g, " ").trim();
const citesIn = (s: string) => [...s.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]!);

/** Splits a document into `## ` sections: heading → body. */
function sectionsOf(md: string): Array<{ head: string; body: string }> {
  const out: Array<{ head: string; body: string }> = [];
  const re = /^## (.+)$/gm;
  const hits = [...md.matchAll(re)];
  hits.forEach((h, i) => out.push({ head: h[1]!.trim(), body: md.slice(h.index! + h[0].length, hits[i + 1]?.index ?? md.length) }));
  return out;
}
const BLOCK_HEAD: Record<BlockId, RegExp> = { customers: /customer|demand/i, competition: /competi|alternativ/i, money: /^money|unit econ|financ/i, risks: /risk|how to start/i };
const LABELS = ["takeaway", "evidence", "key numbers", "computed unit economics", "unit economics", "what it means", "next actions"] as const;
type Label = (typeof LABELS)[number];

/** A topic section's labelled parts ("**Takeaway:** …" → takeaway). */
function partsOf(body: string): Partial<Record<Label, string[]>> {
  const out: Partial<Record<Label, string[]>> = {};
  let cur: Label | null = null;
  for (const line of body.split("\n")) {
    const m = /^\s*\*\*([^*]+?)\*\*\s*:?\s*(.*)$/.exec(line);
    const lab = m ? LABELS.find((l) => m[1]!.replace(/:$/, "").trim().toLowerCase().startsWith(l)) : undefined;
    if (lab) {
      cur = lab;
      out[cur] = m![2]!.trim() ? [m![2]!.trim()] : [];
      continue;
    }
    if (cur) out[cur]!.push(line);
  }
  return out;
}
/** List items (bulleted or numbered) with their indented continuation lines. */
function itemsOf(lines: readonly string[] = []): string[] {
  const items: string[] = [];
  for (const l of lines) {
    const m = /^\s*(?:[-*•]|\d{1,2}[.)])\s+(.*)$/.exec(l);
    if (m && !/^\s{2,}/.test(l)) items.push(m[1]!);
    else if (m && items.length) items[items.length - 1] += `\n${m[1]}`;
    else if (l.trim() && items.length && /^\s/.test(l)) items[items.length - 1] += ` ${l.trim()}`;
  }
  return items;
}
/** A heading-style check: "**1. Title**", "1. **Title**" at column 0, or "### 1. Title". */
const CHECK_HEAD = /^(?:#{3,4}\s*)?(?:\*\*|__)?\s*\d{1,2}[.)]\s+(.*)$/;
const PASS_FALLBACK = "";
/** "3 things to validate first" → what / how / pass_if. Handles both layouts the writer uses:
 *  a numbered list with indented "- Test… / - Pass…" bullets, and bold numbered headings ("**1. Title**") followed
 *  by un-indented bullets. In the second layout the bullets belong to the heading above them, not to new items. */
export function checksOf(lines: readonly string[]): Array<{ what: string; how: string; pass_if: string }> {
  const groups: Array<{ head: string; subs: string[] }> = [];
  const headed = lines.some((l) => /^(?:#{3,4}\s*\d|\*\*\s*\d{1,2}[.)]\s)/.test(l));
  if (headed) {
    for (const l of lines) {
      const h = /^\S/.test(l) && !/^[-*•]\s/.test(l) ? CHECK_HEAD.exec(l) : null;
      if (h) groups.push({ head: h[1]!, subs: [] });
      else if (groups.length && l.trim()) {
        const b = /^\s*(?:[-*•]|\d{1,2}[.)])\s+(.*)$/.exec(l);
        if (b) groups[groups.length - 1]!.subs.push(b[1]!);
        else if (groups[groups.length - 1]!.subs.length) groups[groups.length - 1]!.subs[groups[groups.length - 1]!.subs.length - 1] += ` ${l.trim()}`;
      }
    }
  } else {
    for (const it of itemsOf(lines)) { const [head, ...subs] = it.split("\n"); groups.push({ head: head!, subs }); }
  }
  return groups.map(({ head, subs }) => {
    let how = "", pass = "";
    for (const sub of subs) {
      const m = /^\s*(?:\*\*|\*|_)?([^:*_]{1,60}?)(?:\*\*|\*|_)?\s*:\s*(?:\*\*|\*|_)?\s*(.*)$/.exec(sub);
      if (!m) continue;
      const label = m[1]!.toLowerCase();
      const body = m[2]!.split(/\s*(?:\*\*|\*|_)?\bfail(?:s|ed)?\b(?:\*\*|\*|_)?\s*:/i)[0]!;
      if (!how && /\btest\b|how to|cheapest/.test(label)) how = body;
      else if (!pass && /^pass/.test(label)) pass = body;
    }
    const flat = [head, ...subs].join(" ");
    if (!how) how = /test[^:*]*:\**\s*(.*?)(?=(?:\s[-*]\s)?\s*\*?\s*pass\b[^:*]*:|$)/i.exec(flat)?.[1] ?? "";
    if (!pass) pass = (/pass(?:\s*if)?[^:*]*:\**\s*(.*)$/i.exec(flat)?.[1] ?? "").split(/\s*\*?\bfail\b\*?\s*:/i)[0]!;
    const what = strip(head).replace(/[.:]$/, "");
    return {
      what: noCites(what),
      // shown as its own sentence (next steps, memo): starts with a capital
      how: noCites(strip(how)).replace(/^[-*]\s*/, "").replace(/^\p{Ll}/u, (x) => x.toUpperCase()) || "Plan the cheapest test with a real number.",
      pass_if: noCites(strip(pass)).replace(/[-*]\s*$/, "").trim() || PASS_FALLBACK,
    };
  });
}
/** Markdown table rows (header and separator dropped), only the first table in the lines. */
function tableOf(lines: readonly string[] = []): string[][] {
  const rows: string[][] = [];
  let started = false;
  for (const l of lines) {
    if (/^\s*\|/.test(l)) {
      started = true;
      if (/^\s*\|\s*:?-{2,}/.test(l)) continue;
      rows.push(l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    } else if (started && l.trim()) break;
  }
  return rows.slice(1);
}
const prose = (lines: readonly string[] = []) => strip(lines.filter((l) => !/^\s*\|/.test(l)).join(" "));

const SIGN = /^\s*(?:\[([+\-−–=?])\]|\(([+\-−–=?])\)|([+−=]))\s+/;
/** (+) 1 · (−) −1 · (=) 0 · (?) "unknown" (the research did not find it) · untagged null. */
const signOf = (s: string): -1 | 0 | 1 | "?" | null => {
  const m = SIGN.exec(s);
  const c = m ? (m[1] ?? m[2] ?? m[3])! : null;
  return c == null ? null : c === "?" ? "?" : c === "+" ? 1 : c === "=" ? 0 : -1;
};

/** Gap bullets ("… was not found") are unknowns: they lower confidence and become things to test, never a point
 *  against the idea. (Re-exported from v7.ts, where the verdict rule uses the same test.) */
export { isGapText };
/** Conservative sign for a bullet the writer left untagged: only a clear hedge reads as −; a gap is an unknown
 *  (null) and anything else stays context (null), so the score is never pushed by missing data or a neutral fact. */
export function inferSign(t: string): -1 | null {
  if (isGapText(t)) return null;
  if (/\b(unproven|unmeasured|stricter)\b/i.test(t)) return -1;
  return null;
}

/** Pure: a full sentence for display: [S#] labels and a trailing "…" removed, whole sentences up to `max` words; a
 *  text cut mid-sentence ends at its last complete clause instead of a dangling fragment. */
export function sentenceCap(text: string, max = 40): string {
  const t = String(text ?? "").trim();
  const cut = /(?:…|\.{3})\s*$/.test(t);
  return fullSentences(`${noCites(strip(t)).replace(/(?:…|\.{3})\s*$/, "").trim()}${cut ? "…" : ""}`, max);
}

/** Impacts −2…+2: the writer's (+)/(−)/(=) signs (or a clear inferred one), then nudged so factorScore lands near the
 *  writer's section score. Only items that already lean the same way are strengthened: a neutral (=) or untagged
 *  context fact is never turned into a + or a −, so the score stops where the signed evidence takes it. */
export function impactsFor(items: ReadonlyArray<{ sign: -1 | 0 | 1 | null; sourced: boolean }>, score?: number): Impact[] {
  const imp: number[] = items.map((x) => x.sign ?? 0);
  const step = (i: number) => (items[i]!.sourced ? STEP_SOURCED : STEP_ESTIMATE);
  if (score != null && Number.isFinite(score) && items.length) {
    const target = Math.max(0, Math.min(10, score));
    const now = () => 5 + imp.reduce((t, v, i) => t + v * step(i), 0);
    for (let n = 0; n < 40; n++) {
      const gap = target - now();
      if (Math.abs(gap) < 0.5) break;
      const dir = gap > 0 ? 1 : -1;
      const order = items.map((_, i) => i).filter((i) => items[i]!.sign === dir && Math.abs(imp[i]! + dir) <= 2);
      // weakest first (spread the weight), sourced first on ties
      const pick = order.sort((x, y) => Math.abs(imp[x]!) - Math.abs(imp[y]!) || step(y) - step(x))[0];
      if (pick == null) break;
      imp[pick] = imp[pick]! + dir;
    }
  }
  return imp.map((v) => Math.max(-2, Math.min(2, v)) as Impact);
}

const scaleDefaults = (idea: string): WriterScale => {
  const t = idea.toLowerCase();
  const digital = /\b(app|saas|software|online|platform|marketplace|web|ships|shipping|subscription box)\b/.test(t);
  const physical = /\b(shop|kiosk|caf[eé]|bakery|restaurant|bar|studio|salon|gym)\b/.test(t);
  const [reach, repeatable, margins, founder_free, dig] = digital ? [7, 7, 6, 5, 8] : physical ? [3, 5, 4, 3, 2] : [5, 5, 5, 4, 4];
  return { reach, repeatable, margins, founder_free, digital: dig, reach_label: digital ? "Country" : physical ? "Neighbourhood" : "City", why: "Rule-of-thumb estimate: the writer gave no scalability scores.", would_scale: [] };
};
const num10 = (x: unknown, d: number) => (Number.isFinite(Number(x)) ? Math.max(0, Math.min(10, Number(x))) : d);

/** Pure: the shipped Markdown → the block contract (ReportOut + each block's own numbered sources). */
export function parseReport(md: string, opts: { idea?: string; meta?: WriterMeta; sources?: readonly ReportSource[]; accessed?: string } = {}): ReportOut {
  const accessed = opts.accessed ?? today();
  const online = opts.idea != null && businessKind(opts.idea) === "online";
  // The writer sometimes marks an uncited fact in words ("…, 2026; no source id"); the page already labels it Estimate.
  md = md.replace(/\s*[;,]\s*no source (?:id|cited)\b/gi, "").replace(/\s*\(\s*no source (?:id|cited)\s*\)/gi, "");
  const secs = sectionsOf(md);
  const srcList: ReportSource[] = opts.sources ? [...opts.sources] : [];
  if (!opts.sources) {
    const s = secs.find((x) => /^sources?\b/i.test(x.head));
    for (const m of (s?.body ?? "").matchAll(/^\s*[-*]\s*\[(S\d+)\]\s*\[([^\]]*)\]\((https?:[^)\s]+)\)/gm)) srcList.push({ id: m[1]!, title: m[2]!, url: m[3]! });
  }
  const known = new Map(srcList.map((s) => [s.id, s]));
  const plans = fallbackBlockPlans(opts.idea ?? "");
  const blocks: Partial<Record<BlockId, BlockOut>> = {};
  const cites: Partial<Record<BlockId, SourceRef[]>> = {};
  for (const id of BLOCK_IDS) {
    const sec = secs.find((s) => BLOCK_HEAD[id].test(s.head) && !/validate|summary|verdict/i.test(s.head));
    if (!sec) continue;
    const p = partsOf(sec.body);
    const local: SourceRef[] = [];
    const localOf = (sid?: string) => {
      const s = sid ? known.get(sid) : undefined;
      if (!s) return null;
      let i = local.findIndex((c) => c.url === s.url);
      if (i < 0) (local.push({ url: s.url, title: capWords(s.title || hostOf(s.url), 24), domain: hostOf(s.url), accessed }), (i = local.length - 1));
      return i + 1;
    };
    // an inferred sign (a gap, a hedge) only counts when the writer's own section score leans the same way
    const ws = opts.meta?.scores?.[id];
    const lean = ws == null || !Number.isFinite(Number(ws)) ? -1 : Number(ws) < 5 ? -1 : 0;
    // an online idea naming no city is not a gap: its "(?) no city was named" bullets are dropped (they never moved the score)
    const raw = itemsOf(p.evidence).map((t) => ({ t, tag: signOf(t) })).filter(({ t, tag }) => !(online && (tag === "?" || isGapText(noCites(strip(t.replace(SIGN, ""))))) && LOCATION_GAP.test(t)));
    const ev0 = raw.map(({ t, tag }) => {
      const body = t.replace(SIGN, "");
      const sid = citesIn(body).find((c) => known.has(c));
      const source = localOf(sid);
      const text = noCites(strip(body));
      // missing data is an unknown, not evidence against: a (?) tag or an unsourced gap never moves the score
      const unknown = tag === "?" || (!source && isGapText(text));
      const sign: -1 | 0 | 1 | null = unknown ? 0 : typeof tag === "number" ? tag : inferSign(text) === lean ? lean : null;
      return { text, sign, source, unknown };
    }).filter((x) => x.text.length > 3);
    const imps = impactsFor(ev0.map((e) => ({ sign: e.sign, sourced: !!e.source })), opts.meta?.scores?.[id]);
    const evidence: EvidenceOut[] = ev0.map((e, i) => {
      const imp = imps[i]!;
      const kind: FindingKind = e.source ? (/\d/.test(e.text) ? "number" : "fact") : imp < 0 ? "risk" : imp > 0 ? "strength" : "estimate";
      const display = e.source ? (/(?:[A-Z]{1,2})?[€$£¥₹]\s?\d[\d.,]*(?:\s?[–-]\s?\d[\d.,]*)?|\d[\d.,]*\s?(?:%|€)/.exec(e.text)?.[0] ?? null) : null;
      return { text: e.text, kind: e.unknown && !e.source ? "estimate" : kind, impact: imp, source: e.source, basis: e.source ? null : e.unknown ? "Not found in the research" : "No source cited in the report", display, competitor: null };
    });
    const key_numbers = tableOf(p["key numbers"])
      .filter((r) => r.length >= 2 && r[1] && !/^(not found|—|-|n\/a)$/i.test(r[1]!.trim()))
      .slice(0, 4)
      .map((r) => {
        const sid = citesIn(`[${(r[2] ?? "").replace(/[[\]]/g, "")}]`.replace(/\b(S\d+)\b/, "[$1]")).find((c) => known.has(c)) ?? (/\b(S\d+)\b/.exec(r[2] ?? "")?.[1] ?? undefined);
        const source = localOf(sid);
        return { label: noCites(strip(r[0]!)), value: noCites(strip(r[1]!)), source, basis: source ? null : strip(r[2] ?? "") || "estimate" };
      });
    const math = tableOf(p["computed unit economics"]).map((r) => `${strip(r[0] ?? "")}: ${strip(r[1] ?? "")}`);
    const base = plans.find((x) => x.id === id)!;
    blocks[id] = {
      title: BLOCK_LIBRARY[id].label,
      focus: base.focus,
      takeaway: noCites(prose(p.takeaway)) || "See the section below.",
      evidence: evidence.length ? evidence : [{ text: "The report gave no evidence for this section.", kind: "risk", impact: -1, source: null, basis: "No evidence written", display: null, competitor: null }],
      key_numbers,
      math,
      meaning: noCites(prose(p["what it means"])),
      actions: itemsOf(p["next actions"]).map((a) => noCites(strip(a))).filter(Boolean),
    };
    cites[id] = local;
  }
  const title = /^# (.+)$/m.exec(md)?.[1]?.replace(/^founder report\s*:\s*/i, "").trim() ?? capWords(opts.idea ?? "Founder report", 8);
  const summary = noCites(prose(secs.find((s) => /executive summary/i.test(s.head))?.body.split("\n") ?? []));
  const vsec = secs.find((s) => /^verdict/i.test(s.head))?.body ?? "";
  const vLines = vsec.split("\n").filter((l) => l.trim());
  const vHead = noCites(strip(vLines.find((l) => !/^\s*[-*]\s/.test(l)) ?? ""));
  const reasons0 = itemsOf(vLines).map((r) => noCites(strip(r)));
  // the same guard for the verdict reasons (keeping at least one)
  const reasons = online && reasons0.some((r) => !LOCATION_GAP.test(r)) ? reasons0.filter((r) => !LOCATION_GAP.test(r)) : reasons0;
  const verdict_line = vHead && vHead.split(" ").length <= 4 && reasons[0] ? `${vHead.replace(/[.:]$/, "")}: ${reasons[0]}` : vHead || reasons[0] || "";
  const validate_first = checksOf((secs.find((s) => /validate/i.test(s.head))?.body ?? "").split("\n")).slice(0, 3);
  // strengths / weaknesses: the strongest + and − evidence across the blocks (sourced first)
  const all = BLOCK_IDS.flatMap((id) => (blocks[id]?.evidence ?? []).map((e, i) => ({ id, i, e })));
  const pick = (sign: 1 | -1) => all.filter((x) => Math.sign(x.e.impact) === sign).sort((a, b) => Math.abs(b.e.impact) - Math.abs(a.e.impact) || Number(!!b.e.source) - Number(!!a.e.source)).slice(0, 3).map((x) => ({ text: x.e.text, block: x.id, item: x.i + 1 }));
  const sc = { ...scaleDefaults(opts.idea ?? md.slice(0, 400)), ...(opts.meta?.scalability ?? {}) };
  const scalability: WriterScale = {
    reach: num10(sc.reach, 5), repeatable: num10(sc.repeatable, 5), margins: num10(sc.margins, 5), founder_free: num10(sc.founder_free, 4), digital: num10(sc.digital, 4),
    reach_label: ["Neighbourhood", "City", "Country", "Global"].includes(String(sc.reach_label)) ? String(sc.reach_label) : "City",
    why: String(sc.why ?? ""), would_scale: Array.isArray(sc.would_scale) ? sc.would_scale.map(String).filter(Boolean).slice(0, 3) : [],
  };
  const next_steps = validate_first.length ? validate_first.map((v) => v.how) : BLOCK_IDS.flatMap((id) => blocks[id]?.actions.slice(0, 1) ?? []).slice(0, 3);
  const judge: JudgeOut = { working_title: title, market: null, summary, verdict_line, validate_first, scalability, strengths: pick(1), weaknesses: pick(-1), next_steps, pivot: opts.meta?.pivot?.idea ? { idea: noCites(capWords(opts.meta.pivot.idea.replace(/[.]+$/, ""), 14)).replace(/…$/, ""), why: sentenceCap(opts.meta.pivot.why, 40) } : null, ...(reasons.length ? { reasons } : {}) };
  return { ...judge, blocks, cites };
}

// ───────────────────────────────────────────────────────────── the writer prompt (WSYSTEM from opt.ts, unchanged)

const WSYSTEM = () => `You write founder reports: decision documents for a first-time founder deciding whether to put their savings into a business idea. The current date is ${today()}.
Quality bar (applies to everything you write):
- Specific to this exact idea, place and price. No generic startup advice.
- Real numbers with their source: every factual figure carries the [S#] id of the research note it came from. Use only [S#] ids that appear in the research notes; never invent a source or a number for it. A figure with no [S#] gets no marker in words (never write "no source id"); the page labels it as an estimate.
- When you assume something, label it "(estimate)" and show the inputs.
- If the research does not cover something, say so plainly instead of filling the gap.
- Plain, short sentences. Markdown. No preamble, no closing remarks.
- The reader may not know local terms. The first time you use a local acronym or a word in another language (for example a tax, a wage floor, an official gazette, a permit or a trade such as "gestor"), add its meaning in 4-6 plain words in parentheses.`;

const SECTION_SPEC = `Each of the four topic sections uses exactly this structure:
**Takeaway:** one or two sentences.
**Evidence:** 4-7 bullets, each a specific fact with its [S#]. Start each bullet with (+) if it helps the case, (−) if sourced evidence hurts it, (=) if it is context, or (?) if it is something the research did not find (an unknown, not a point against). A requirement the founder can meet (a licence, insurance, a registration) is (=) context or a cost line, not (−).
**Key numbers:** a small markdown table (figure | value | source or "estimate").
**What it means for you:** 2-4 sentences.
**Next actions:** 3 numbered concrete actions for the next two weeks.`;

const ECON_SPEC = (code: string, kind: BusinessKind = "local") => `UNIT ECONOMICS (computed by code, do not do this arithmetic yourself):
In the Money section, after Key numbers, write a **Unit economics** subsection that explains the inputs and uses these placeholders exactly where the computed figures go: {{NET_REVENUE_PER_UNIT}}, {{VARIABLE_COST_PER_UNIT}}, {{CONTRIBUTION_PER_UNIT}}, {{CONTRIBUTION_MARGIN_PCT}}, {{FIXED_MONTHLY}}, {{BREAK_EVEN_UNITS}} (a bare number: write the unit word after it yourself, e.g. "{{BREAK_EVEN_UNITS}} subscribers"), {{STARTUP_CAPITAL}}. Use the same placeholders anywhere else you mention these figures (executive summary, verdict, validation). Never write those numbers yourself.
At the very end of your answer, after everything else, output the inputs and your scores as one fenced block:
\`\`\`econ
{"unit": "one unit of sale, e.g. one subscriber-month or one booked hour", "price_per_unit_gross": 0, "vat_rate": 0.0, "share_kept": 1.0, "variable_costs_per_unit": [{"item": "", "amount": 0, "source": "S# or estimate", "quote": ""}], "fixed_monthly_costs": [{"item": "", "amount": 0, "source": "", "quote": ""}], "startup_costs": [{"item": "", "amount": 0, "source": "", "quote": ""}], "scores": {"customers": 0, "competition": 0, "money": 0, "risks": 0}, "scalability": {"reach": 0, "repeatable": 0, "margins": 0, "founder_free": 0, "digital": 0, "reach_label": "Neighbourhood", "why": "", "would_scale": [""]}, "pivot": {"idea": "", "why": ""}}
\`\`\`
All money in this block is in ${code} (${symbolFor(code)}), the currency of the idea's own price. Never convert the idea's price into another currency and never assume an exchange rate; if a source states a price in another currency, quote it as found and do not use it as an input.
price_per_unit_gross is what the customer pays per unit incl. VAT or sales tax; vat_rate is the VAT or sales-tax rate included in it (0 when prices are quoted before tax); share_kept is the fraction of the net price the business keeps (1.0 if it sells directly, the commission rate if it is a marketplace). Variable costs are per unit and borne by the business.
Cost line sources: put an S# only when that research note literally states this figure as this cost; then copy the note's exact words that contain the figure into "quote". A price customers pay is not a cost (a walk price is not a walker's pay). Otherwise write "source": "estimate" and "quote": "".
Never write 0 for a cost the research did not find: put your best realistic figure for this market and trade with "source": "estimate" (a 0 cost line makes the break-even meaningless and is shown as missing). ${kind === "online" ? "Include owner pay, software and hosting, tools, marketing, insurance and accounting in the fixed costs, and the product or materials, packaging, shipping and payment or platform fees in the variable costs." : "Include rent, wages or owner pay, utilities, insurance and accounting in the fixed costs, and the main inputs, packaging and delivery or payment fees in the variable costs."}
scores: 1-10 per topic section, how strongly its sourced evidence supports putting savings into the idea (5 = neutral). Score the evidence, not the gaps: data the research did not find is uncertainty, so it keeps the score near 5 and goes into "3 things to validate first" instead. Scores of 3 or below need sourced evidence against the idea, such as a saturated market shown by named competitors, sourced costs above the price, or a legal ban.
scalability: each part 0-10 (a neighbourhood shop ~2-3, a single kiosk ~4, a city service ~5, an online shop that ships nationally ~6, software sold nationally 8+); reach_label is one of Neighbourhood, City, Country, Global; why is one sentence on why it stops where it stops; would_scale lists 1-3 concrete changes that raise it.
pivot: when any section score is 4 or below, the single best concrete change of this idea that the research supports (idea: at most 14 words; why: one complete sentence of at most 30 words naming the evidence, no [S#] labels); otherwise null.`;

const FIXES = (kind: BusinessKind = "local") => `Rules:
- Do not state a verdict (GO, NO-GO, GO WITH CONDITIONS) in the executive summary: code adds the verdict sentence there.
- Monthly = weekly × 4.33.
- Each validation threshold must be in the same unit as the figure it tests.
- Write the currency sign or % once, never "€17 euros", "$17 dollars" or "%%".
- Keep figures consistent across sections.
- Keep each source's own category (foreign nationality is not foreign-born) and say where a price was seen; never present a price from another part of the city as the target neighbourhood's.
- Cite a source only for what that page is about (a guide for another trade is weak support: say so).${kind === "online" ? `
- This idea sells online. A missing city or neighbourhood is not a gap and never a reason: do not write (?) bullets, verdict reasons or validation items about the place.` : ""}`;

/** Pure: the per-delivery arithmetic implied by the idea's own price ("€25 a month" + "weekly" → €5.77 per weekly
 *  delivery), so the writer never derives it from competitors' loaf prices. Empty when the idea has no such price. */
export function priceHints(idea: string, code = currencyOf(idea).code): string[] {
  const out: string[] = [];
  const PER = String.raw`\s*(?:\/|a|per|each)\s*(month|week|year)\b`;
  const m = new RegExp(String.raw`${MONEY_SIGN_SRC}\s?(\d+(?:[.,]\d{1,2})?)${PER}`, "i").exec(idea) ?? new RegExp(String.raw`(\d+(?:[.,]\d{1,2})?)\s?(?:${MONEY_SIGN_SRC}|[A-Z]{3}\b|euros?\b|dollars?\b|pesos?\b|pounds?\b)${PER}`, "i").exec(idea);
  if (!m) return out;
  const price = Number(m[1]!.replace(",", "."));
  const per = m[2]!.toLowerCase();
  const fmt = (x: number) => (code === "EUR" ? `€${x.toFixed(2)}` : fmtMoney(Math.round(x * 100) / 100, code).replace(/^(\D*[\d,]+)$/, "$1.00"));
  const weekly = /\bweekly\b|\bevery week\b|\bonce a week\b|\bper week\b/i.test(idea);
  const twice = /\btwice a week\b|\b2 (?:times|deliveries) a week\b/i.test(idea);
  if (per === "month" && (weekly || twice)) {
    const n = twice ? 8.66 : 4.33;
    out.push(`${fmt(price)} a month buys ${n === 4.33 ? "one delivery a week" : "two deliveries a week"}: ${fmt(price)} ÷ ${n} = ${fmt(price / n)} per delivery (incl. VAT). Use this, not competitors' prices, when you say what one delivery is worth.`);
  }
  if (per === "week") out.push(`${fmt(price)} a week = ${fmt(price * 4.33)} a month (× 4.33).`);
  if (per === "year") out.push(`${fmt(price)} a year = ${fmt(price / 12)} a month.`);
  return out;
}

export function writerPrompt(idea: string, sections: ReadonlyArray<{ title: string; notes: string }>, opts: { note?: string; focus?: readonly BlockId[]; code?: string; kind?: BusinessKind } = {}): string {
  const code = opts.code ?? currencyOf(idea).code;
  const kind = opts.kind ?? businessKind(idea);
  const hints = priceHints(idea, code);
  const bchOnly = /\b(?:bch|sats?|satoshis?)\b/i.test(idea) && currencyOf(idea).why !== "price";
  const notes = sections.map((s) => `<notes topic="${s.title}">\n${s.notes}\n</notes>`).join("\n\n");
  const steer = opts.note
    ? `\n<ceo_note>${opts.note}</ceo_note>\nThe founder read the first report and wrote this note. Rewrite the report with that focus${opts.focus?.length ? `, above all the ${opts.focus.map((f) => BLOCK_LIBRARY[f].label).join(" and ")} section${opts.focus.length > 1 ? "s" : ""}` : ""}. Use only the research notes below; no new facts.`
    : "";
  return `Business idea: <idea>${idea}</idea>${steer}

Write the complete founder report.${hints.length ? `\nArithmetic from the idea's own price (done in code):\n${hints.map((h) => `- ${h}`).join("\n")}` : ""}${bchOnly ? `\nThe idea prices in Bitcoin Cash: any ${code} figure for its price is an estimate; say so.` : ""}
Research notes (the [S#] ids are the only sources you may cite):
${notes}

Structure, in this order:
# Founder report: ${kind === "online" ? "<what and who it is for, 4-8 words>" : "<what and where, 4-8 words>"}
## Executive summary
5-7 sentences: the opportunity, the strongest evidence for and against, and the money picture with the break-even figure. No verdict here.
## Verdict
One of GO / TEST FIRST / NO-GO in bold, then 3-5 bullets of reasons with [S#] where factual. NO-GO only when sourced evidence counts against the idea; when the case is open because data is missing, write TEST FIRST.
## 3 things to validate first
Three numbered items. Each: the assumption in bold on the numbered line, then three sub-bullets: "*Why it matters:*" (what breaks if wrong), "*Test this month:*" (the cheapest test), "*Pass:*" (the pass/fail threshold).
${BLOCK_IDS.map((b) => `## ${BLOCK_LIBRARY[b].label}`).join("\n")}

${SECTION_SPEC}

${ECON_SPEC(code, kind)}

${FIXES(kind)}`;
}

// ───────────────────────────────────────────────────────────── the call

const VERDICT_TALK = /\bverdict\b|\bno[- ]go\b|\bgo with conditions\b|\bconditional go\b|\bGO\b|\bPIVOT\b/;
const sentencesOf = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-Z0-9(“"€$£*])/).map((x) => x.trim()).filter(Boolean);
const flatText = (t: string) => noCites(strip(t)).toLowerCase().replace(/[^a-z0-9€]+/g, " ").trim();

/** Pure: the one verdict sentence the executive summary carries, written in code from the computed verdict. */
export function verdictSentence(verdict: IdeaReport["verdict"], score: number, lead?: string): string {
  const ss = lead ? sentencesOf(noInlineCites(noCites(strip(lead)))) : [];
  // a short first sentence ("Demand is unproven.") takes the next one with it, so the reason says why
  const why = ss.length ? ss.slice(0, ss[0]!.split(" ").length < 7 ? 2 : 1).join(" ").replace(/[.!?]*$/, ".") : "";
  // under the No-go band with nothing sourced against it: say why it is not a No-go
  const open = verdict === "pivot" && score < VERDICT_BANDS_V7.pivot ? " No sourced evidence rules it out, so test the open points before you commit savings." : "";
  return `Verdict: ${VERDICT_WORD[verdict]} (score ${score.toFixed(1)}/10).${why ? ` Main reason: ${why}` : ""}${open}`;
}

/** Pure: a summary with every sentence that states a verdict removed and the computed verdict sentence appended,
 *  so it can never contradict the badge. Idempotent. */
export function alignSummary(text: string, sentence: string): string {
  const kept = sentencesOf(text.split(sentence).join(" ").trim()).filter((x) => !VERDICT_TALK.test(x.replace(/\[S\d+\]/g, "")) && !/^Main reason:/.test(x));
  return [...kept, sentence].join(" ");
}

/** Pure: the shipped Markdown made to agree with the computed verdict: the Verdict head is the computed word and
 *  score, the deciding reason (`lead`, matched by text) is the first bullet, and the executive summary's own verdict
 *  sentences are replaced by the computed one. */
export function alignVerdictMd(md: string, verdict: IdeaReport["verdict"], score: number, opts: { lead?: string } = {}): string {
  const word = VERDICT_WORD[verdict].toUpperCase();
  let out = md.replace(/(^## Verdict[^\n]*\n+)([^\n]*)/m, (all, head: string, line: string) => {
    if (/^\s*[-*]\s/.test(line)) return `${head}**${word}** (score ${score.toFixed(1)}/10)\n\n${line}`;
    const rest = line.replace(/\*\*[^*]+\*\*\s*[.:—–-]*\s*/, "").replace(/^\(score[^)]*\)\s*/, "").trim();
    return `${head}**${word}** (score ${score.toFixed(1)}/10)${rest ? ` ${rest}` : ""}`;
  });
  if (opts.lead) {
    const key = flatText(opts.lead).slice(0, 40);
    out = out.replace(/(^## Verdict[^\n]*\n[\s\S]*?)(?=^## |(?![\s\S]))/m, (sec: string) => {
      const lines = sec.split("\n");
      const bullets = lines.map((l, i) => (/^\s*[-*]\s/.test(l) ? i : -1)).filter((i) => i >= 0);
      const hit = bullets.find((i) => key && flatText(lines[i]!.replace(/^\s*[-*]\s*/, "")).startsWith(key));
      if (hit == null || hit === bullets[0]) return sec;
      const [b] = lines.splice(hit, 1);
      lines.splice(bullets[0]!, 0, b!);
      return lines.join("\n");
    });
  }
  const sentence = verdictSentence(verdict, score, opts.lead);
  return out.replace(/(^## Executive summary[^\n]*\n+)([\s\S]*?)(\n*)(?=^## |(?![\s\S]))/m, (all, head: string, body: string, gap: string) =>
    `${head}${alignSummary(body.replace(/\s*\n\s*/g, " "), sentence)}${gap || "\n"}`);
}

/** Pure: confidence drops one level when the money inputs are missing and one more when gaps ("not found") are a
 *  quarter or more of the evidence: a report that says its picture is incomplete never claims high confidence.
 *  `econUnsourced`: every unit-economics line is an estimate with no cited source (counts like missing inputs). */
export function adjustConfidence(c: IdeaReport["confidence"], o: { econMissing: boolean; gaps: number; total: number; econUnsourced?: boolean }): IdeaReport["confidence"] {
  const lv: IdeaReport["confidence"][] = ["low", "medium", "high"];
  let i = lv.indexOf(c);
  // missing money inputs, or money inputs that are all desk estimates (no line cites a source): one level down
  if (o.econMissing || o.econUnsourced) i--;
  if (o.total && o.gaps / o.total >= 0.25) i--;
  return lv[Math.max(0, i)]!;
}

/** Pure: the computed unit economics for results.v7.econ, each cost line with its real source page (or null). */
/** Pure: true when the research notes contain the writer's quote, the quote states the line's figure, and the note
 *  that holds it cites the same source. Anything else is shown as "check" next to the source. */
export function quoteBacks(x: Pick<EconItem, "eur" | "quote">, sid: string, notes: string): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/\s*\[s\d+\]/g, "").replace(/\s+/g, " ").trim();
  const q = norm(String(x.quote ?? ""));
  const eur = Number(x.eur);
  if (q.length < 6 || !Number.isFinite(eur) || eur <= 0) return false;
  const nums = [...q.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => Number(m[0].replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".")));
  if (!nums.some((n) => Math.abs(n - eur) < 0.005)) return false;
  return notes.split("\n").some((line) => norm(line).includes(q) && new RegExp(`\\[${sid}\\]`).test(line));
}

export function econSummary(f: Pick<Finalized, "econ">, sources: readonly ReportSource[], accessed = today(), notes?: string): EconSummary | null {
  if (!f.econ) return null;
  const { inputs: e, computed: c } = f.econ;
  const known = new Map(sources.map((s) => [s.id, s]));
  const miss = c.missing;
  const varOk = !miss.some((m) => m.includes("variable cost per unit"));
  const fixOk = !miss.some((m) => m.includes("fixed monthly costs"));
  const capOk = !miss.some((m) => m.includes("start-up costs"));
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const line = (group: "variable" | "fixed" | "startup") => (x: EconItem) => {
    const sid = /\bS\d+\b/.exec(String(x.source ?? ""))?.[0];
    const s = sid ? known.get(sid) : undefined;
    const check = s && notes != null && !quoteBacks(x, sid!, notes);
    return { group, item: capWords(String(x.item ?? ""), 12), eur: r2(Number(x.eur) || 0), source: s ? { url: s.url, title: capWords(s.title || hostOf(s.url), 24), domain: hostOf(s.url), accessed } : null, ...(check ? { check: true } : {}) };
  };
  return {
    unit: e.unit,
    price: r2(Number(e.price_per_unit_gross_eur) || 0),
    vatRate: Number(e.vat_rate) || 0,
    shareKept: e.share_kept == null ? 1 : Number(e.share_kept),
    net: r2(c.net),
    variable: varOk ? r2(c.varc) : null,
    contribution: varOk ? r2(c.contrib) : null,
    fixedMonthly: fixOk ? r2(c.fixed) : null,
    breakEven: c.be,
    startupCapital: capOk ? r2(c.cap) : null,
    ...(miss.length ? { missing: miss } : {}),
    ...(f.econ.currency && f.econ.currency !== "EUR" ? { currency: f.econ.currency } : {}),
    lines: [...(e.variable_costs_per_unit ?? []).map(line("variable")), ...(e.fixed_monthly_costs ?? []).map(line("fixed")), ...(e.startup_costs ?? []).map(line("startup"))].slice(0, 30),
  };
}

export type WriterNote = (analyst: AnalystRole, kind: AgentNote["kind"], text: string) => void;
export interface WrittenReport extends Finalized {
  out: ReportOut;
  /** True when the writer failed and the report was built from the research notes. */
  fromNotes?: boolean;
  /** The [S#] list the report cites. */
  sources?: ReportSource[];
  /** Date the sources were read (a replayed demo keeps the run's own date). */
  accessed?: string;
  /** Live runs only: the research notes the writer saw, to check each cost line's quote against. */
  notesText?: string;
}

/** "one subscriber-month" → "subscribers", "booked walk-hour" → "booked walk-hours" (the bubble already says "a month"). */
export function unitPlural(unit: string): string {
  return unitPluralV7(unit);
}
const EDITOR: AnalystRole = "viability";
const ownerOfHead = (head: string): { role: AnalystRole; text: string } => {
  const b = BLOCK_IDS.find((id) => BLOCK_HEAD[id].test(head) && !/validate|summary|verdict/i.test(head));
  return b ? { role: BLOCK_LIBRARY[b].role, text: `Writing ${BLOCK_LIBRARY[b].label}…` } : { role: EDITOR, text: `Writing the ${capWords(head.toLowerCase(), 6)}…` };
};

/** Plain Markdown of the research notes (the shipped report when the writer failed). */
export function notesMarkdown(idea: string, research: readonly BlockResearch[]): { raw: string; sources: ReportSource[] } {
  const { sections, sources } = labelResearch(research);
  return {
    raw: `# Founder report: ${capWords(idea, 10)}\n\n## Executive summary\n\nThe written analysis could not be produced, so this report shows the research notes as found. Read them as raw material, not conclusions.\n\n## Verdict\n\n**Not decided.** The notes below are unanalysed.\n\n${sections.map((s) => `## ${s.title}\n\n**Takeaway:** Research notes as found.\n\n**Evidence:**\n${s.notes === "not found" ? "- (=) Nothing came back from the web for this section." : s.notes.split("\n").map((l) => l.replace(/^- /, "- (=) ")).join("\n")}\n\n**What it means for you:** Check these notes by hand before deciding.\n`).join("\n")}`,
    sources,
  };
}

async function callWriter(prompt: string, budget: Budget | undefined, say: WriterNote): Promise<string> {
  const settle = budget?.reserve("writer", EST.writer);
  const lines: CostLine[] = [];
  const t0 = Date.now();
  try {
    const stream = getClient().messages.stream(
      { model: WRITER_MODEL, max_tokens: 32000, thinking: { type: "adaptive" }, output_config: { effort: "low" }, system: WSYSTEM(), messages: [{ role: "user", content: prompt }] } as unknown as Anthropic.MessageStreamParams,
      { timeout: WRITER_CALL_MS, maxRetries: 0 },
    );
    let text = "";
    let heads = 0;
    stream.on("text", (d: string) => {
      if (!text) say(EDITOR, "status", "First lines of the report are in…");
      text += d;
      const done = [...text.matchAll(/^## (.+)\n/gm)];
      for (; heads < done.length; heads++) {
        const o = ownerOfHead(done[heads]![1]!);
        say(o.role, "status", o.text);
      }
    });
    const msg = await stream.finalMessage();
    lines.push(recordUsage("report:writer", msg.model, msg.usage));
    console.log(`[report] writer ${msg.model} in=${msg.usage.input_tokens} out=${msg.usage.output_tokens} stop=${msg.stop_reason} ${Date.now() - t0}ms`);
    if (msg.stop_reason === "refusal") throw new Error("The AI declined to write this report.");
    const full = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("") || text;
    if (!/^## /m.test(full)) throw new Error("The writer returned no report.");
    return full;
  } finally {
    settle?.(lines);
  }
}

/** Demo report from a classic sample (hand-checked findings and pages), written in the writer's Markdown format so
 *  it goes through the same finalize + parse path. Evidence order = sampleBlocks order (the prepared steers' ids). */
export function sampleMarkdown(s: V7Sample): { raw: string; sources: ReportSource[] } {
  const sb = sampleBlocks(s);
  const sources: ReportSource[] = [];
  const sid = (c: SourceRef) => {
    let x = sources.find((y) => y.url === c.url);
    if (!x) sources.push((x = { id: `S${sources.length + 1}`, url: c.url, title: c.title }));
    return x.id;
  };
  const scores: Partial<Record<BlockId, number>> = {};
  const sec = BLOCK_IDS.map((id, n) => {
    const ev = sb.evidence[id].slice(0, BLOCK_LIMITS.evidenceMax);
    scores[id] = factorScore(ev.map(({ f }, i) => ({ ...f, id: `x-${i}`, analyst: BLOCK_LIBRARY[id].role, t: 0 })));
    const bullets = ev.map(({ f }) => `- ${(f.impact ?? 0) > 0 ? "(+)" : (f.impact ?? 0) < 0 ? "(−)" : "(=)"} ${f.text}${f.source ? ` [${sid(f.source)}]` : " (estimate)"}`);
    const heads = sb.headline[id];
    return `## ${BLOCK_LIBRARY[id].label}

**Takeaway:** ${heads[0] ?? "Demo sample."}

**Evidence:**
${bullets.join("\n") || "- (=) Nothing in the demo sample for this section (estimate)."}

**What it means for you:** ${heads.length > 1 ? heads.slice(1).join(" ") : "Demo report from a prepared sample: a live run researches your exact idea and shows the arithmetic."}

**Next actions:**
1. ${s.judge.nextSteps[n % s.judge.nextSteps.length] ?? "Talk to ten people who have this problem"}
`;
  });
  const p = s.judge.scalability.parts;
  const meta = { scores, scalability: { reach: p.Reach ?? 5, repeatable: p.Repeatable ?? 5, margins: p["Margins at scale"] ?? 5, founder_free: p["Founder-free"] ?? 4, digital: p["Digital leverage"] ?? 4, reach_label: s.judge.scalability.reach ?? "City", why: s.judge.scalability.why, would_scale: s.judge.scalability.wouldScale } };
  const raw = `# Founder report: ${s.title}

## Executive summary

Demo report from a prepared sample with hand-checked sources. ${s.judge.verdictLine}

## Verdict

**${s.judge.verdictLine}**

${s.judge.strengths.map((x) => `- ${x.text}`).join("\n")}

## 3 things to validate first

${s.judge.nextSteps.slice(0, 3).map((x, i) => `${i + 1}. **${x}.**\n   - *Test this month:* ${x}.`).join("\n")}

${sec.join("\n")}
\`\`\`econ
${JSON.stringify(meta)}
\`\`\`
`;
  return { raw, sources };
}

/** Generic demo report (no prepared sample): every item a labelled estimate, through the same parse path. */
function genericMock(idea: string): string {
  const g: Record<BlockId, string[]> = {
    customers: ["(=) Demo mode: no web search ran, so the buyers are not counted (estimate).", "(−) Nobody has paid yet, so demand is an assumption, not evidence (estimate)."],
    competition: ["(−) Customers solve this today with a workaround or a general-purpose option (estimate).", "(+) A narrow first customer makes the gap easier to see and win (estimate)."],
    money: ["(=) Revenue = buyers you can reach × price × how often they buy (estimate).", "(=) Price against today's alternative, not against your costs (estimate)."],
    risks: ["(−) A licence or permit may be needed before the first sale (estimate).", "(+) The problem is everyday and easy to explain in one sentence (estimate)."],
  };
  return `# Founder report: ${capWords(idea, 8)}

## Executive summary

Demo mode: no web research ran, so every item below is a labelled estimate. Run it live before deciding. Verdict: run the research first.

## Verdict

**GO WITH CONDITIONS** — run the research first.

- Every figure here is an estimate.

## 3 things to validate first

1. **People have this problem often enough to pay.**
   - *Why it matters:* Without paying customers nothing else matters.
   - *Test this month:* Talk to ten people who have this problem.
   - *Pass:* at least 3 of 10 ask to pay or pre-order.
2. **The price beats today's alternative.**
   - *Why it matters:* Customers compare you with what they use now.
   - *Test this month:* Price the three closest alternatives.
   - *Pass:* your price is within 20% of theirs.
3. **The start-up costs fit your savings.**
   - *Why it matters:* Costs you cannot fund stop the launch.
   - *Test this month:* Get quotes for the three biggest start-up costs.
   - *Pass:* total quotes below the savings you can risk.

${BLOCK_IDS.map((id) => `## ${BLOCK_LIBRARY[id].label}

**Takeaway:** Demo estimate: run it live to research ${BLOCK_LIBRARY[id].label.toLowerCase()}.

**Evidence:**
${g[id].map((x) => `- ${x}`).join("\n")}

**What it means for you:** These are rules of thumb, not research.

**Next actions:**
1. Run the live report before deciding.
`).join("\n")}
\`\`\`econ
{"unit": "one sale (demo estimate)", "price_per_unit_gross_eur": 0, "vat_rate": 0, "share_kept": 1, "scores": {"customers": 4.5, "competition": 4.5, "money": 5, "risks": 4.5}}
\`\`\`
`;
}

/**
 * Writes, finalizes and parses the whole report (ONE paid call, retried at most once). The writer failing twice, or
 * the budget running out, never fails the stage: the report is built from the research notes.
 */
export async function writeReport(
  idea: string,
  research: readonly BlockResearch[],
  opts: { note?: string; focus?: readonly BlockId[]; budget?: Budget; onNote?: WriterNote } = {},
): Promise<WrittenReport> {
  const say: WriterNote = (a, k, t) => {
    try {
      opts.onNote?.(a, k, t);
    } catch {
      /* progress never fails a call */
    }
  };
  say(EDITOR, "status", "Writing the report…");
  let raw: string;
  let sources: ReportSource[];
  let fromNotes = false;
  let accessed: string | undefined;
  let notesText: string | undefined;
  // one currency per report, from the idea (prepared samples and the examples are all in euros)
  let code = currencyOf(idea).code;
  const kind = businessKind(idea);
  if (config.mockAi) {
    const classic = v7SampleFor(idea);
    if (classic) code = "EUR";
    const sample = classic ? REPORT_SAMPLES[classic.key] : undefined;
    const fromClassic = !sample && classic ? sampleMarkdown(classic) : null;
    raw = sample?.writer ?? fromClassic?.raw ?? genericMock(idea);
    sources = sample?.sources ?? fromClassic?.sources ?? [];
    accessed = sample?.accessed ?? (fromClassic ? ACCESSED : undefined);
    const delay = Math.min(2400, config.mockDelayMs ?? 2400);
    say(EDITOR, "status", "First lines of the report are in…");
    for (const h of [...raw.matchAll(/^## (.+)$/gm)]) {
      await sleep(delay / 8);
      const o = ownerOfHead(h[1]!);
      say(o.role, "status", o.text);
    }
  } else {
    const labelled = labelResearch(research);
    sources = labelled.sources;
    notesText = labelled.sections.map((x) => x.notes).join("\n");
    const prompt = writerPrompt(idea, labelled.sections, { ...opts, code, kind });
    try {
      raw = await callWriter(prompt, opts.budget, say).catch((e) => {
        if (e instanceof BudgetError) throw e;
        console.error("[report] writer failed, retrying once:", (e as Error).message);
        return callWriter(prompt, opts.budget, say);
      });
    } catch (e) {
      console.error("[report] writer failed, building the report from the notes:", (e as Error).message);
      const n = notesMarkdown(idea, research);
      raw = n.raw;
      sources = n.sources;
      fromNotes = true;
    }
  }
  const fin = finalizeReport(raw, sources, code);
  if (fin.invalidCites) console.warn(`[report] removed ${fin.invalidCites} citation(s) not in the source list`);
  if (fin.econErr && !fromNotes) console.warn(`[report] econ: ${fin.econErr}`);
  const out = parseReport(fin.md, { idea, meta: fin.meta, sources, ...(accessed ? { accessed } : {}) });
  if (fromNotes) {
    // keep the notes' own numbering per block (fallbackReport) and mark it as written from the notes
    const fb = fallbackReport(idea, research);
    return { ...fin, out: { ...fb, cites: Object.fromEntries(research.map((r) => [r.id, r.cites])) }, fromNotes, sources };
  }
  if (fin.econ) {
    const be = fin.econ.computed.be;
    if (fin.econ.computed.missing.length) say("pricing", "found", "Break-even: n/a, some cost inputs are missing");
    else say("pricing", "found", be == null ? "Break-even: never at this price" : `Break-even: ${be.toLocaleString("en-US")} ${unitPlural(fin.econ.inputs.unit)} a month`);
  }
  return { ...fin, out, sources, ...(accessed ? { accessed } : {}), ...(notesText != null ? { notesText } : {}) };
}
