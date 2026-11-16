// LaunchDesk v7 — the evidence model (pure: no I/O, no imports, safe for the server, the tests and the prototype
// generator). Owner: WS-INTEL. Mirrors the v7 block of web/proto/contracts.ts (same names, same shapes); the server
// stores ResultsV7 at project.results.v7 next to the v4 fields, which stay populated for web/src.
//
// The one rule: the score is arithmetic on findings, and a finding counts fully only when it carries a real source.
//   factor  = clamp(5 + Σ impact × step, 0, 10), step = 1.0 for a sourced finding, 0.5 for an estimate
//             (a factor with no sourced finding is capped at 7.5)
//   score   = Σ weight × factor over the hired analysts (weights from ROLE_LIBRARY, normalised), one decimal
//   verdict = Go ≥ 6.5 with no factor ≤ 3 · Pivot ("Test first") 4.5–6.4 · No-go < 4.5 AND sourced evidence against
//             (evidenceAgainst: a saturated market or weak demand/pricing shown by sourced findings, costs per unit
//             above the price from sourced cost lines, a legal ban). Under 4.5 without it = Pivot: missing data is
//             uncertainty, not evidence against, so it lowers confidence and becomes a "test first" item instead.
//   scale   = weighted parts (Reach 25 %, Repeatable 20 %, Margins at scale 20 %, Founder-free 15 %, Digital 20 %)
//   cap     = levelCapFor(scale, verdict): no-go 0 · < 4 floor · 4–6.9 building · ≥ 7 district

export type WorldLevel = 0 | 1 | 2 | 3;
export type AnalystRole = "viability" | "competition" | "market" | "demand" | "pricing" | "location" | "regulation" | "tech" | "scalability";
export const ANALYST_ROLES: readonly AnalystRole[] = ["viability", "competition", "market", "demand", "pricing", "location", "regulation", "tech", "scalability"];

export interface RoleMeta { dept: string; name: string; color: string; mission: string; weight: number; when: string }
/** Identical to contracts.ts ROLE_LIBRARY (test/v7.test.ts checks it). */
export const ROLE_LIBRARY: Record<AnalystRole, RoleMeta> = {
  viability: { dept: "Viability", name: "Mia", color: "#8B7CF6", mission: "Strengths, weak points, what kills it", weight: 0.25, when: "always" },
  competition: { dept: "Competition", name: "Leo", color: "#3B82F6", mission: "Who you are up against, and their gap", weight: 0.25, when: "always" },
  market: { dept: "Market", name: "Sam", color: "#F59E0B", mission: "How much money is in this market", weight: 0.2, when: "almost always (skip only for tiny hobby ideas)" },
  demand: { dept: "Customers", name: "Ava", color: "#22A06B", mission: "Who buys, how often, and why", weight: 0.2, when: "new behaviour or unclear buyer" },
  pricing: { dept: "Pricing", name: "Theo", color: "#CA8A04", mission: "What people pay today, what you can charge", weight: 0.15, when: "price is the open question" },
  location: { dept: "Location", name: "Lola", color: "#C2410C", mission: "Footfall, rent and the right street", weight: 0.15, when: "physical premises or a local service area" },
  regulation: { dept: "Rules", name: "Omar", color: "#475569", mission: "Licences, permits and legal blockers", weight: 0.1, when: "food, health, finance, kids, alcohol, transport, data" },
  tech: { dept: "Tech", name: "Kai", color: "#0891B2", mission: "Can it be built, and how fast", weight: 0.15, when: "software or hardware must be built" },
  scalability: { dept: "Scale", name: "Iris", color: "#DB2777", mission: "How far this can grow beyond one place", weight: 0, when: "reach is the main question (the report always scores scalability)" },
};

export interface Analyst { id: AnalystRole; role: AnalystRole; name: string; color: string; mission: string; why: string; weight: number }
export type FindingKind = "fact" | "estimate" | "competitor" | "risk" | "strength" | "number";
export interface SourceRef { url: string; title: string; domain: string; accessed: string }
export type Impact = -2 | -1 | 0 | 1 | 2;
export interface Finding {
  id: string;
  analyst: AnalystRole;
  kind: FindingKind;
  text: string;
  value?: number;
  unit?: string;
  display?: string;
  source?: SourceRef | null;
  basis?: string;
  competitor?: { name: string; named: boolean; price?: string; note: string };
  impact?: Impact;
  t: number;
  replaces?: string;
}
export type WorkStatus = "queued" | "working" | "done" | "error";
export interface AnalystWork { analyst: AnalystRole; status: WorkStatus; findings: Finding[]; score: number | null; headline: string }
export interface ScoreFactor { analyst: AnalystRole; label: string; weight: number; score: number; findings: string[]; sourced: number; total: number }
export type ScalePart = "Reach" | "Repeatable" | "Margins at scale" | "Founder-free" | "Digital leverage";
export interface Scalability { score: number; cap: WorldLevel; reach: string; why: string; wouldScale: string[]; parts: Array<{ label: ScalePart; score: number }> }
export interface IdeaReport {
  score: number;
  verdict: "go" | "pivot" | "no-go";
  verdictLine: string;
  factors: ScoreFactor[];
  math: string;
  evidence: { total: number; sourced: number; sourcedShare: number; sources: SourceRef[] };
  confidence: "low" | "medium" | "high";
  scalability: Scalability;
  strengths: Array<{ text: string; finding: string }>;
  weaknesses: Array<{ text: string; finding: string }>;
  nextSteps: string[];
  pivot?: { idea: string; why: string } | null;
  /** Additive (written report): the Verdict section's reason bullets, full sentences. */
  reasons?: string[];
  /** Additive: the sourced evidence against the idea that a No-go rests on (empty = nothing sourced counts against it). */
  against?: string[];
  /** Additive: what the research could not find (unknowns): they lower confidence, not the score; test them first. */
  unknowns?: string[];
}
export interface SteerChange { what: "score" | "factor" | "scalability" | "verdict" | "finding" | "roster"; key?: string; before: string | number | null; after: string | number | null; why: string }
export interface SteerResult {
  id: string; note: string; ack: string; status: "working" | "done" | "error";
  rerun: AnalystRole[]; hired: Analyst[]; dropped: AnalystRole[]; findings: Finding[]; changes: SteerChange[]; report: IdeaReport | null; at: string;
}
/** Server-only, additive: where the v7 pipeline is (the contract's ResultsV7 ignores these). */
export type V7Status = "planning" | "researching" | "analysing" | "judging" | "done" | "error";
export interface ResultsV7 {
  version: 7;
  roster: Analyst[];
  work: AnalystWork[];
  report: IdeaReport | null;
  steers: SteerResult[];
  status?: V7Status;
  error?: string;
  /** Number of web sources the shared research found (0 in demo mode). */
  researched?: number;
  /** Server-only diagnostics: AI cost of the stage, total and first-finding latency (ms after the run started). */
  cost?: { usd: number; calls: number; searches?: number; fetches?: number };
  ms?: number;
  firstFindingMs?: number;
  /** "4 blocks" analysis (additive, optional). Present only on projects validated with the block contract; old
   *  projects and data/v7/*.json past projects have no `blocks` and render from roster / work / report as before.
   *  Each block's evidence lives in work[block.role].findings (so the findings stream and buildReport keep working);
   *  the block itself holds the idea-specific title, the prose and the key numbers. Order = BLOCK_IDS. */
  blocks?: ReportBlock[];
  /** Server-only, additive (block contract): the written report around the 4 blocks. Absent on old projects. */
  brief?: ReportBrief;
  /** Server-only, additive: real progress notes per analyst for speech bubbles (search queries actually issued,
   *  page titles actually fetched, the block's own one-line summary). `at` = ms after the run started. */
  notes?: AgentNote[];
  /** Server-only, additive (V1 report): the full shipped Markdown report (sources list included). */
  reportMd?: string;
  /** Server-only, additive: unit economics computed in code from the writer's inputs, or why it failed. */
  econ?: EconSummary | null;
  econErr?: string;
}

/** Unit economics computed in code (null figures = an input was missing, see `missing`). Lines carry their source. */
export interface EconSummary {
  unit: string;
  price: number;
  vatRate: number;
  shareKept: number;
  net: number;
  variable: number | null;
  contribution: number | null;
  fixedMonthly: number | null;
  breakEven: number | null;
  startupCapital: number | null;
  /** Inputs the writer left at €0 or empty: the figures that depend on them are not shown as facts. */
  missing?: string[];
  /** `check`: the line cites a source, but its figure could not be found in that source's research note. */
  lines?: Array<{ group: "variable" | "fixed" | "startup"; item: string; eur: number; source: SourceRef | null; check?: boolean }>;
}
export interface AgentNote { analyst: AnalystRole; kind: "search" | "read" | "found" | "status"; text: string; at: number }
export const NOTES_MAX = 60;
/** One thing to validate first: what, how to test it cheaply, and the pass mark (≤ 3). */
export interface ValidateFirst { what: string; how: string; passIf: string }
export interface ReportBrief {
  /** Working title, ≤ 6 words. */
  title: string;
  /** Executive summary, ≤ 110 words. */
  summary: string;
  /** Market the research assumed (city / country / currency), when the report names one. */
  market?: string;
  validateFirst: ValidateFirst[];
  /** ISO date the research ran. */
  researchedAt: string;
}

export const STEER_LIMIT = 3;
export const UNSOURCED_FACTOR_CAP = 7.5;
export const STEP_SOURCED = 1;
export const STEP_ESTIMATE = 0.5;
export const SCALE_WEIGHTS: Record<ScalePart, number> = { Reach: 0.25, Repeatable: 0.2, "Margins at scale": 0.2, "Founder-free": 0.15, "Digital leverage": 0.2 };
export const SCALE_PARTS = Object.keys(SCALE_WEIGHTS) as ScalePart[];
export const SCORE_RULE = "Each factor starts at 5.0: a sourced finding moves it 1 point per impact step, an estimate 0.5. No source: max 7.5.";
export const VERDICT_BANDS_V7 = { go: 6.5, pivot: 4.5, floor: 3 } as const;
export const VERDICT_RULE_V7 = "Go from 6.5 with no factor at 3 or below · Test first 4.5–6.4, or lower when nothing sourced counts against the idea · No-go under 4.5 with sourced evidence against it";
/** A section counts against the idea when its sourced findings lean this many points more against than for. */
export const AGAINST_NET = 3;

/** An item that reports missing data (an unknown), not a fact: "… was not found", "could not check", "unverified". */
export const isGapText = (t: string) =>
  /\bnot found\b|\bno [^.]{0,80}\b(?:was|were) found\b|\bthe research (?:found|has|gives) no\b|\bthe research did not (?:find|cover|confirm|check)\b|\bno source (?:gives|shows|confirms)\b|\b(?:was|were|is|are) not confirmed\b|\bcould not (?:be )?(?:check|confirm|verif)\w*\b|\bnot covered by the research\b/i.test(t);
/** A sourced finding that says the activity is not allowed at all (a ban, not a requirement that can be met). */
export const BAN_TEXT = /\b(?:banned|prohibited|forbidden|illegal|not (?:allowed|permitted|legal)|no (?:new )?(?:licen[cs]es?|permits?|concessions?) (?:are|is|will be) (?:issued|granted)|moratorium)\b(?![^.]{0,40}\b(?:without|unless|except)\b)/i;

/** Pure: the sourced evidence against the idea, one plain sentence per reason (empty when there is none).
 *  Only sourced findings that are not gaps count. Rules & risks: only a ban (a requirement such as a licence or
 *  insurance is a cost or a task, not a reason the idea fails). Other sections: sourced findings that lean at least
 *  AGAINST_NET points more against than for, in a factor at the floor. Money: per-unit costs from sourced cost lines
 *  already above what one sale brings in. */
export function evidenceAgainst(
  factors: readonly Pick<ScoreFactor, "analyst" | "label" | "score">[],
  findings: readonly Finding[],
  econ?: { net: number; lines?: ReadonlyArray<{ group: string; eur: number; source: SourceRef | null; check?: boolean }> } | null,
): string[] {
  const out: string[] = [];
  for (const f of factors) {
    const fs = findings.filter((x) => x.analyst === f.analyst && isSourced(x) && !isGapText(x.text));
    if (f.analyst === "viability") {
      const ban = fs.find((x) => (x.impact ?? 0) < 0 && BAN_TEXT.test(x.text));
      if (ban) out.push(`${f.label}: ${ban.text}`);
      continue;
    }
    const net = fs.reduce((t, x) => t + Math.sign(x.impact ?? 0), 0);
    if (net <= -AGAINST_NET && f.score <= VERDICT_BANDS_V7.floor) out.push(`${f.label}: ${-net} more sourced findings count against the idea than for it.`);
  }
  if (econ && econ.net > 0) {
    const sourcedVar = (econ.lines ?? []).filter((l) => l.group === "variable" && l.source && !l.check).reduce((t, l) => t + (Number(l.eur) || 0), 0);
    if (sourcedVar > econ.net) out.push(`Money: sourced costs per sale (€${sourcedVar.toFixed(2)}) are above the €${econ.net.toFixed(2)} each sale brings in.`);
  }
  return out;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
export const r1 = (n: number) => Math.round((n + 1e-9) * 10) / 10;

export const levelCapFor = (scalability: number, verdict: IdeaReport["verdict"] = "go"): WorldLevel =>
  verdict === "no-go" ? 0 : scalability >= 7 ? 3 : scalability >= 4 ? 2 : 1;
/**
 * Confidence = how much of the DECISION rests on sources, not just how many findings have one. Each finding counts
 * with |impact| (context findings with impact 0 count 0.25) times its factor's weight; the sourced part of that total
 * is the decision share. High needs ≥ 60 % and at least 3 sourced decision-relevant findings; medium ≥ 30 %.
 * Called with a plain number (old callers), it falls back to the share of sourced findings.
 */
export function confidenceFor(input: number | { factors: readonly Pick<ScoreFactor, "analyst" | "weight">[]; findings: readonly Finding[] }): IdeaReport["confidence"] {
  if (typeof input === "number") return input >= 0.6 ? "high" : input >= 0.3 ? "medium" : "low";
  const w = new Map(input.factors.map((f) => [f.analyst, f.weight]));
  let total = 0;
  let sourced = 0;
  let relevant = 0;
  for (const f of input.findings) {
    const weight = w.get(f.analyst) ?? 0;
    if (!weight) continue;
    const m = weight * (Math.abs(f.impact ?? 0) || 0.25);
    total += m;
    if (isSourced(f)) {
      sourced += m;
      if ((f.impact ?? 0) !== 0) relevant++;
    }
  }
  const share = total ? sourced / total : 0;
  return share >= 0.6 && relevant >= 3 ? "high" : share >= 0.3 && relevant >= 1 ? "medium" : "low";
}
export const scoreDisplay = (r: Pick<IdeaReport, "evidence">): "hero" | "provisional" => (r.evidence.total >= 6 && r.evidence.sourced >= 3 ? "hero" : "provisional");

/** A source is real only when it has an http(s) url and an access date (the server copies it from search citations). */
export const isSourced = (f: Pick<Finding, "source">): boolean => !!f.source && /^https?:\/\//.test(f.source.url) && /^\d{4}-\d{2}-\d{2}$/.test(f.source.accessed);
export const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** The honesty rule, applied to every finding (server answers, mocks and samples):
 *  a fact / number without a source becomes an estimate, and a competitor without a source is a category. */
export function enforceSourceRule(f: Finding): Finding {
  const out: Finding = { ...f };
  if (!isSourced(out)) {
    out.source = null;
    if (out.kind === "fact" || out.kind === "number") out.kind = "estimate";
    if (out.competitor) out.competitor = { ...out.competitor, named: false };
    if (!out.basis) out.basis = "Desk estimate, no web source";
  } else {
    out.source = { ...out.source!, domain: out.source!.domain || hostOf(out.source!.url) };
    // a sourced competitor may still be a category ("Neighbourhood bars"): keep the author's `named`.
  }
  if (out.impact != null) out.impact = clamp(Math.round(out.impact), -2, 2) as Impact;
  return out;
}

/** factor score of one analyst from its findings (see the header). */
export function factorScore(findings: readonly Finding[]): number {
  let s = 5;
  let sourced = 0;
  for (const f of findings) {
    const src = isSourced(f);
    if (src) sourced++;
    s += (f.impact ?? 0) * (src ? STEP_SOURCED : STEP_ESTIMATE);
  }
  s = clamp(s, 0, 10);
  if (!sourced) s = Math.min(UNSOURCED_FACTOR_CAP, s);
  return r1(s);
}

/** Weights over the roster: ROLE_LIBRARY weights normalised over the non-zero ones (scalability = 0), rounded to
 *  two decimals with the largest-remainder rule so the weights shown always add up to exactly 1.00 (the report's
 *  maths string uses these exact numbers). */
export function rosterWeights(roles: readonly AnalystRole[]): Record<string, number> {
  const tot = roles.reduce((t, r) => t + ROLE_LIBRARY[r].weight, 0);
  if (!tot) return Object.fromEntries(roles.map((r) => [r, 0]));
  const raw = roles.map((r) => (ROLE_LIBRARY[r].weight / tot) * 100);
  const cents = raw.map(Math.floor);
  let left = 100 - cents.reduce((t, c) => t + c, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    if (ROLE_LIBRARY[roles[i]!].weight > 0) cents[i]!++, left--;
  }
  return Object.fromEntries(roles.map((r, i) => [r, cents[i]! / 100]));
}
export function hire(role: AnalystRole, mission: string, why: string): Analyst {
  const m = ROLE_LIBRARY[role];
  return { id: role, role, name: m.name, color: m.color, mission: capWords(mission || m.mission, 12), why: capWords(why, 12), weight: 0 };
}
/** Re-weights a roster in place (after a hire / drop). */
export function weigh(roster: Analyst[]): Analyst[] {
  const w = rosterWeights(roster.map((a) => a.role));
  return roster.map((a) => ({ ...a, weight: w[a.role] ?? 0 }));
}

export function capWords(s: string, n: number): string {
  const w = (s ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return w.length <= n ? w.join(" ") : w.slice(0, n).join(" ").replace(/[,;:.]+$/, "") + "…";
}

// ───────────────────────────────────────────────────────────── display text (pure; also used by the web report)

const DOMAIN = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|es|cat|eu|io|co|guide|info|gov|edu|uk|de|fr|it|pt|nl|ie|news|blog)\b/i;
/** "(barcelonatourism.org, August 2026)", "(guidavera menu, undated)", "(mycoffee.guide, 2025; estimate)": the writer's
 *  in-words source for a fact it had no [S#] for. Not a parenthesis with a figure or a plain aside. */
const isInlineCite = (inner: string) =>
  DOMAIN.test(inner) || /\bundated\b|\bno source\b/i.test(inner) || /^[^,;()]{0,40}[,;]\s*(?:(?:[A-Z][a-z]+|\d{1,2} [A-Z][a-z]+)\s+)?(?:19|20)\d{2}(?:\s*;\s*estimate)?\s*$/.test(inner.trim()) || /^\s*(?:[A-Z][a-z]+\s+)?(?:19|20)\d{2}\s*$/.test(inner);
/** Pure: text as a reader sees it: no [S#] research ids, no "no source id" notes, spacing before punctuation fixed. */
export function plainText(s: string): string {
  return String(s ?? "")
    .replace(/\s*\[S\d+(?:\s*[,;]\s*(?:S\d+|estimate))*(?:\s+[^\]\n]{0,160})?\]/gi, "")
    .replace(/\s*[;,]\s*no source (?:id|cited)\b/gi, "")
    .replace(/\s*\(\s*no source (?:id|cited)\s*\)/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}
/** The old "Set a numeric pass mark before you start" filler for a check the writer gave no pass mark: shown as nothing. */
export const isPlaceholderPass = (s: string | null | undefined) => !s?.trim() || /^set (?:a |the )?(?:numeric )?pass mark before you start\.?$/i.test(s.trim());
/** Pure: plainText without the in-words source notes, for a short lead line. */
export function noInlineCites(s: string): string {
  return plainText(plainText(s).replace(/\s*\(([^()]{1,90})\)/g, (all, inner: string) => (isInlineCite(inner) ? "" : all)));
}
/** Sentences of a plain text (a sentence ends at . ! ? before a capital, digit, quote or €). */
export const sentencesOf = (t: string): string[] => t.split(/(?<=[.!?])\s+(?=[A-Z0-9(“"€*¿¡])/).map((x) => x.trim()).filter(Boolean);

/** Pure: whole sentences up to `max` words; a text that was cut ("…") drops its unfinished sentence, and a first
 *  sentence longer than `max` ends at its last full clause instead of a dangling fragment. */
export function fullSentences(text: string, max = 40): string {
  const raw = String(text ?? "").trim();
  const cut = /(?:…|\.{3})\s*$/.test(raw);
  const s = raw.replace(/(?:…|\.{3})\s*$/, "").trim();
  if (!s) return "";
  const ss = sentencesOf(s);
  const full = cut ? ss.slice(0, -1) : ss;
  let out = "";
  for (const x of full) {
    const next = out ? `${out} ${x}` : x;
    if (next.split(" ").length > max) break;
    out = next;
  }
  if (out) return /[.!?]$/.test(out) ? out : `${out}.`;
  const words = (cut ? ss[ss.length - 1]! : ss[0]!).split(" ").slice(0, max).join(" ");
  const clause = Math.max(words.lastIndexOf(", "), words.lastIndexOf("; "), words.lastIndexOf(" – "), words.lastIndexOf(" — "));
  const head = (clause > words.length * 0.35 ? words.slice(0, clause) : words).replace(/[,;:–—\s]+$/, "");
  return /[.!?]$/.test(head) ? head : `${head}.`;
}

const LEAD_WORD = /^\s*(test first|no-go|go|pivot)\s*:\s*/i;
/** Pure: the short, clean lead under the verdict badge: "Test first: <first sentence of the deciding reason>", with no
 *  research ids and no in-words source notes, at most `max` words. A short first sentence takes the next with it. */
export function leadLine(text: string, max = 28): string {
  const m = LEAD_WORD.exec(text);
  const word = m ? m[0].replace(/\s*:\s*$/, "") : "";
  const body = noInlineCites(m ? text.slice(m[0].length) : text);
  const cut = /(?:…|\.{3})\s*$/.test(body);
  const ss = sentencesOf(body.replace(/(?:…|\.{3})\s*$/, ""));
  const n = ss.length > 1 && ss[0]!.split(" ").length < 7 ? 2 : 1;
  const lead = ss.length ? fullSentences(`${ss.slice(0, n).join(" ")}${cut && ss.length <= n ? "…" : ""}`, max) : "";
  const out = lead ? `${lead.charAt(0).toUpperCase()}${lead.slice(1)}` : "";
  return word ? (out ? `${word}: ${out}` : word) : out;
}
const flatWords = (s: string) => noInlineCites(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** Pure: the reasons to list under a lead line, without repeating it: the reason the lead was taken from keeps only
 *  its sentences the lead does not already say (or is dropped), and "no source id" notes are removed. */
export function reasonsAfterLead(line: string, reasons: readonly string[]): string[] {
  const lead = flatWords(line.replace(LEAD_WORD, "").replace(/(?:…|\.{3})\s*$/, ""));
  return reasons
    .map((r) => plainText(r))
    .filter(Boolean)
    .map((r) => {
      const fr = flatWords(r);
      if (!lead || !(fr.startsWith(lead) || lead.startsWith(fr) || lead.includes(fr))) return r;
      const rest = sentencesOf(r).filter((x) => !lead.includes(flatWords(x)));
      return rest.join(" ");
    })
    .filter((r) => r.trim().length > 0);
}

const IRREGULAR: Record<string, string> = { person: "people", child: "children", man: "men", woman: "women", foot: "feet", tooth: "teeth", mouse: "mice", kg: "kg", g: "g", ml: "ml", l: "l", km: "km" };
const pluralWord = (w: string): string => {
  const low = w.toLowerCase();
  if (IRREGULAR[low]) return IRREGULAR[low]!;
  if (/(?:ss|ch|sh|x|z)$/i.test(w)) return `${w}es`;
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`;
  if (/s$/i.test(w)) return w;
  return `${w}s`;
};
/** Where a unit's head noun phrase ends: "cup of flat white | sold at the kiosk", "booked seat | in one class". */
const UNIT_TAIL = /\s+(?:sold|served|booked|bought|delivered|made|paid|taken|ordered|rented|at|in|on|per|for|from|with|to|during|via|through|by|that|which|who|including|incl\.?)\b.*$/i;
/** Pure: a unit in the plural for "1,411 ___ a month": "one cup of flat white sold at the kiosk" → "cups of flat
 *  white", "one booked seat in one gentle yoga class" → "booked seats", "one subscriber-month" → "subscribers". */
export function unitPlural(unit: string): string {
  let u = String(unit ?? "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  u = u.replace(/^(?:one|a|an|1|each|per)\s+/i, "").replace(/[-\s](?:month|monthly)\b/gi, "").replace(/\s+per\s+month\b/gi, "").trim();
  u = u.replace(UNIT_TAIL, "").replace(/[.,;:…]+$/, "").trim();
  if (!u) return "units";
  const of = /^(.+?)(\s+of\s+.+)$/i.exec(u);
  let head = of ? of[1]! : u;
  let tail = of ? of[2]! : "";
  if (tail.split(" ").length > 4) tail = "";
  const ws = head.split(" ");
  if (ws.length > 3) head = ws.slice(-3).join(" ");
  const parts = head.split(" ");
  parts[parts.length - 1] = pluralWord(parts[parts.length - 1]!);
  return `${parts.join(" ")}${tail}`;
}

/** Roster picker without AI (demo mode, and the fallback when the planning call fails): 3–5 roles by idea keywords.
 *  viability + competition always; market almost always; the rest by what the idea needs. */
export function pickRosterByKeywords(idea: string): AnalystRole[] {
  const t = ` ${idea.toLowerCase()} `;
  const has = (re: RegExp) => re.test(t);
  const online = has(/\b(app|apps|saas|software|platform|online|web|marketplace|subscription|api|ai|digital|plataforma|aplicaci[oó]n)\b/);
  const physical = has(/\b(kiosk|shop|store|caf[eé]|coffee|bakery|bar|restaurant|studio|gym|salon|stall|metro|street|tienda|local|panader[ií]a|quiosco)\b/);
  const local = has(/\b(walk|walks|walking|delivery|cleaning|classes|class|tutor|repair|neighbourhood|neighborhood|barrio)\b/);
  const regulated = has(/\b(food|bakery|alcohol|wine|beer|health|clinic|kids|children|school|finance|loan|invoice|invoicing|tax|verifactu|insurance|transport|taxi|data|medical|dog|dogs|pet|pets|perro|perros|cannabis)\b/);
  const pricey = has(/(€|\$|£)\s?\d|\d\s?(€|eur|euros)|\bprice|precio\b/);
  const out: AnalystRole[] = ["competition"];
  const add = (r: AnalystRole) => !out.includes(r) && out.length < 4 && out.push(r);
  add("market");
  if (physical) add("location");
  if (online) add("tech");
  if (regulated && !physical) add("regulation");
  if (local && !physical) add("demand");
  if (!physical && !online && !local) add("demand");
  if (pricey && out.length < 4 && !online) add("pricing");
  if (out.length < 3) add("demand");
  return [...out, "viability"]; // viability last: it reads the others' findings into strengths and weak points
}

// ───────────────────────────────────────────────────────────── report

/** What the judge (AI or mock) decides; everything numeric is recomputed here. */
export interface JudgeDraft {
  /** Server-only: written report (V1 writer) → keep full sentences (caps only guard runaway text). Classic roster: short caps. */
  fullText?: boolean;
  verdictLine: string;
  scalability: { parts: Partial<Record<ScalePart, number>>; why: string; wouldScale: string[]; reach?: string };
  strengths: Array<{ text: string; finding: string }>;
  weaknesses: Array<{ text: string; finding: string }>;
  nextSteps: string[];
  pivot?: { idea: string; why: string } | null;
  /** Written report only: the Verdict section's reason bullets. */
  reasons?: string[];
  /** Written report only: the computed unit economics, so a negative margin from sourced costs can decide a No-go. */
  econ?: Parameters<typeof evidenceAgainst>[2];
}

export function scalabilityScore(parts: Partial<Record<ScalePart, number>>): number {
  return r1(SCALE_PARTS.reduce((t, p) => t + SCALE_WEIGHTS[p] * clamp(parts[p] ?? 0, 0, 10), 0));
}
export const reachLabel = (reach: number) => (reach <= 3 ? "Neighbourhood" : reach <= 5 ? "City" : reach <= 7.5 ? "Country" : "Global");

/** Display words (the enum names stay): an uncertain idea is "Test first", not a failure. */
export const VERDICT_WORD: Record<IdeaReport["verdict"], string> = { go: "Go", pivot: "Test first", "no-go": "No-go" };
const WRITER_VERDICT = /^\s*(?:\*\*)?\s*(?:go with conditions|conditional go|no[- ]go|not decided|test first|pivot|go)\b\s*(?:\*\*)?\s*[.:—–-]*\s*/i;
/** The written report's own verdict word ("GO WITH CONDITIONS: …") replaced by the computed verdict, so the line
 *  under the badge never contradicts it. A line without a verdict word gets the computed one in front. */
export function alignVerdictLine(line: string, verdict: IdeaReport["verdict"]): string {
  const m = WRITER_VERDICT.exec(line);
  const rest = line.replace(WRITER_VERDICT, "").trim();
  if (!rest) return VERDICT_WORD[verdict];
  // "NO-GO on committing savings now." reads on; "GO WITH CONDITIONS: Demand …" takes a colon
  if (m && !/[.:—–-]\s*$/.test(m[0].replace(/\*\*/g, "").trim()) && /^[a-z]/.test(rest)) return `${VERDICT_WORD[verdict]} ${rest}`;
  return `${VERDICT_WORD[verdict]}: ${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
}

// Topic words per scored analyst, and the words that mark a reason as for or against the idea (plain heuristics).
const REASON_TOPIC: Record<string, RegExp> = {
  demand: /\b(?:demand|customers?|buyers?|bookings?|usage|audience|footfall|subscribers?|wants?|will pay)\b/i,
  competition: /\b(?:compet\w*|saturat\w*|crowded|rivals?|incumbents?|alternatives?|chains?|market is)\b/i,
  pricing: /\b(?:pric\w*|margins?|premium|break-even|contribution|economics|per walk|per unit|€)/i,
  viability: /\b(?:costs?|rent|wages?|insurance|licen[cs]\w*|legal|regulat\w*|capital|savings|exposure|liabilit\w*|break-even|permits?|social security|viab\w*)\b/i,
};
const REASON_NEG = /\b(?:no|not|none|nothing|unproven|missing|saturated|crowded|risk\w*|exposure|without|lacks?|weak|fails?|never|cannot|can't|unknown|unclear|too (?:high|low|small)|below|thin|loss\w*|expensive|undercut\w*)\b/gi;
const REASON_POS = /\b(?:in range|defensible|strong\w*|growing|proven|underserved|gap in|room for|willing|healthy|profitable|cheap\w*|clear demand|demand exists)\b/gi;
const hits = (re: RegExp, s: string) => (s.match(re) ?? []).length;

/** Pure: the index of the reason that best explains the computed verdict. No-go / Pivot: the most negative reason on
 *  the weakest scored sections; Go: the most positive one on the strongest. Ties keep the writer's order. */
export function leadReason(reasons: readonly string[], verdict: IdeaReport["verdict"], factors: ReadonlyArray<{ analyst: string; score: number }>): number {
  if (!reasons.length) return -1;
  const against = verdict !== "go";
  const weight = (f: { score: number }) => (against ? Math.max(0, 5 - f.score) : Math.max(0, f.score - 5));
  let best = 0;
  let top = -Infinity;
  reasons.forEach((r, i) => {
    const neg = hits(REASON_NEG, r);
    const pos = hits(REASON_POS, r);
    const topic = factors.reduce((t, f) => t + (REASON_TOPIC[f.analyst]?.test(r) ? weight(f) : 0), 0);
    const s = (against ? 2 * neg - 3 * pos : 2 * pos - 2 * neg) + topic;
    if (s > top) (top = s), (best = i);
  });
  return best;
}

/** `against` (from evidenceAgainst): under the Pivot band the verdict is No-go only when sourced evidence counts
 *  against the idea; otherwise it is Pivot ("Test first"). Omitted = the old rule (classic callers). */
export function verdictFor(score: number, factors: readonly { score: number }[], against?: readonly string[]): IdeaReport["verdict"] {
  if (score < VERDICT_BANDS_V7.pivot) return against && !against.length ? "pivot" : "no-go";
  if (score < VERDICT_BANDS_V7.go || factors.some((f) => f.score <= VERDICT_BANDS_V7.floor)) return "pivot";
  return "go";
}

/** Builds the full, internally consistent report from the roster, the analysts' work and the judge's draft. */
export function buildReport(roster: readonly Analyst[], work: readonly AnalystWork[], judge: JudgeDraft): IdeaReport {
  const cap = judge.fullText ? { point: 40, verdict: 45, why: 40, scale: 24, step: 90 } : { point: 14, verdict: 16, why: 20, scale: 12, step: 12 };
  const scored = roster.filter((a) => a.weight > 0);
  const workOf = (r: AnalystRole) => work.find((w) => w.analyst === r);
  const factors: ScoreFactor[] = scored.map((a) => {
    const fs = workOf(a.role)?.findings ?? [];
    return {
      analyst: a.role,
      label: ROLE_LIBRARY[a.role].dept,
      weight: a.weight,
      score: factorScore(fs),
      findings: fs.map((f) => f.id),
      sourced: fs.filter(isSourced).length,
      total: fs.length,
    };
  });
  // weights are two decimals adding up to 1.00 (rosterWeights) and factor scores one decimal, so the maths string
  // below, written with exactly these numbers, always adds up to the score shown.
  const score = r1(factors.reduce((t, f) => t + Math.round(f.weight * 100) * Math.round(f.score * 10), 0) / 1000);
  const all = work.flatMap((w) => w.findings);
  const against = evidenceAgainst(factors, all, judge.econ);
  // the evidence-against rule decides written reports (live runs); the prepared demo samples keep their bands
  const verdict = verdictFor(score, factors, judge.fullText ? against : undefined);
  const unknowns = all.filter((f) => !isSourced(f) && isGapText(f.text)).map((f) => capWords(f.text, cap.point)).slice(0, 4);
  // a low score with nothing sourced against it rests on unknowns: it never claims high confidence
  const conf = confidenceFor({ factors, findings: all });
  const confidence = judge.fullText && score < VERDICT_BANDS_V7.pivot && !against.length && conf === "high" ? "medium" : conf;
  const sources: SourceRef[] = [];
  for (const f of all) if (isSourced(f) && !sources.some((s) => s.url === f.source!.url)) sources.push(f.source!);
  const sourced = all.filter(isSourced).length;
  const share = all.length ? Math.round((sourced / all.length) * 100) / 100 : 0;
  const parts = SCALE_PARTS.map((label) => ({ label, score: r1(clamp(judge.scalability.parts[label] ?? 0, 0, 10)) }));
  const sScore = scalabilityScore(judge.scalability.parts);
  const ids = new Set(all.map((f) => f.id));
  const byImpact = [...all].sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0) || Number(isSourced(b)) - Number(isSourced(a)));
  const pick = (given: JudgeDraft["strengths"], pool: Finding[]) => {
    const out = given.filter((s) => ids.has(s.finding) && s.text.trim()).slice(0, 3).map((s) => ({ text: capWords(s.text, cap.point), finding: s.finding }));
    for (const f of pool) {
      if (out.length >= 3) break;
      if (!out.some((s) => s.finding === f.id)) out.push({ text: capWords(f.text, cap.point), finding: f.id });
    }
    return out;
  };
  const strengths = pick(judge.strengths, byImpact.filter((f) => (f.impact ?? 0) > 0).concat(byImpact));
  const weaknesses = pick(judge.weaknesses, [...byImpact].reverse().filter((f) => (f.impact ?? 0) < 0).concat([...byImpact].reverse()));
  // a written report leads with the reason that decides the computed verdict, not the writer's first bullet
  const li = judge.fullText && judge.reasons?.length ? leadReason(judge.reasons, verdict, factors) : -1;
  const reasons = li >= 0 ? [judge.reasons![li]!, ...judge.reasons!.filter((_, i) => i !== li)] : judge.reasons;
  // the lead under the badge is short and clean: the first sentence of the deciding reason, no in-words sources
  const line = li >= 0 ? leadLine(`${VERDICT_WORD[verdict]}: ${reasons![0]}`) : judge.fullText ? leadLine(alignVerdictLine(judge.verdictLine, verdict)) : judge.verdictLine;
  return {
    score,
    verdict,
    verdictLine: capWords(line, cap.verdict),
    factors,
    math: factors.map((f) => `${f.weight.toFixed(2)}×${f.score.toFixed(1)}`).join(" + ") + ` = ${score.toFixed(1)}`,
    evidence: { total: all.length, sourced, sourcedShare: share, sources },
    confidence,
    scalability: {
      score: sScore,
      cap: levelCapFor(sScore, verdict),
      reach: judge.scalability.reach || reachLabel(parts[0]!.score),
      why: capWords(judge.scalability.why, cap.why),
      wouldScale: judge.scalability.wouldScale.filter((x) => x.trim()).slice(0, 3).map((x) => capWords(x, cap.scale)),
      parts,
    },
    strengths,
    weaknesses,
    nextSteps: judge.nextSteps.slice(0, 3).map((x) => capWords(x, cap.step)),
    pivot: verdict === "go" || !judge.pivot ? null : judge.fullText ? { idea: plainText(judge.pivot.idea).replace(/[.…]+$/, ""), why: fullSentences(plainText(judge.pivot.why), 40) } : judge.pivot,
    ...(reasons?.length ? { reasons: reasons.slice(0, 5).map((x) => capWords(plainText(x), 60)) } : {}),
    ...(judge.fullText && against.length ? { against } : {}),
    ...(judge.fullText && unknowns.length ? { unknowns } : {}),
  };
}

/** Recomputes an analyst's work score (null while not done). */
export const finishWork = (w: AnalystWork): AnalystWork => ({ ...w, score: w.status === "done" ? factorScore(w.findings) : null });

/** Reveal pacing: t = ms after the analyst started, one finding every `gap` ms (the proto replays these). */
export const paced = (fs: Finding[], gap = 2600, start = 1400): Finding[] => fs.map((f, i) => ({ ...f, t: start + i * gap }));

// ───────────────────────────────────────────────────────────── steer

export interface SteerPlan { ack: string; rerun: AnalystRole[]; hire: Array<{ role: AnalystRole; mission: string; why: string }>; drop: AnalystRole[] }

/** Merges a rerun analyst's new findings: a finding with `replaces` removes that old one; the rest are added. */
export function mergeFindings(old: readonly Finding[], fresh: readonly Finding[]): Finding[] {
  const gone = new Set(fresh.map((f) => f.replaces).filter(Boolean));
  return [...old.filter((f) => !gone.has(f.id)), ...fresh];
}

const fmt = (n: number) => n.toFixed(1);

/** The diff the UI shows as chips after a steer. Every before/after value is read from the two reports. */
export function diffReports(before: IdeaReport, after: IdeaReport, ctx: { findings: readonly Finding[]; oldFindings: readonly Finding[]; hired: readonly Analyst[]; dropped: readonly AnalystRole[]; why?: Partial<Record<string, string>> }): SteerChange[] {
  const why = (k: string, d: string) => capWords(ctx.why?.[k] ?? d, 12);
  const out: SteerChange[] = [];
  for (const a of ctx.hired) out.push({ what: "roster", key: a.role, before: null, after: a.name, why: why(`roster:${a.role}`, a.why) });
  for (const r of ctx.dropped) out.push({ what: "roster", key: r, before: ROLE_LIBRARY[r].name, after: null, why: why(`roster:${r}`, "Not needed for this focus") });
  for (const f of after.factors) {
    const b = before.factors.find((x) => x.analyst === f.analyst);
    if (b && b.score !== f.score) out.push({ what: "factor", key: f.analyst, before: b.score, after: f.score, why: why(`factor:${f.analyst}`, `${ROLE_LIBRARY[f.analyst].dept} re-checked with your note`) });
  }
  for (const f of ctx.findings) {
    const old = f.replaces ? ctx.oldFindings.find((o) => o.id === f.replaces) : undefined;
    out.push({ what: "finding", key: f.id, before: old?.text ?? null, after: f.text, why: why(`finding:${f.id}`, old ? "Replaced with your focus" : "New evidence for your focus") });
  }
  if (before.scalability.score !== after.scalability.score) out.push({ what: "scalability", before: before.scalability.score, after: after.scalability.score, why: why("scalability", "Reach re-scored for the new plan") });
  if (before.score !== after.score) out.push({ what: "score", before: before.score, after: after.score, why: why("score", `Weighted factors now add up to ${fmt(after.score)}`) });
  if (before.verdict !== after.verdict) out.push({ what: "verdict", before: before.verdict, after: after.verdict, why: why("verdict", "The score crossed a verdict band") });
  return out;
}

/** Applies a finished steer to the stored results (pure). `fresh` = the rerun / hired analysts' new findings by role. */
export function applySteer(
  prev: ResultsV7,
  s: { id: string; note: string; plan: SteerPlan; fresh: Partial<Record<AnalystRole, { findings: Finding[]; headline?: string }>>; judge: JudgeDraft; at: string; why?: Partial<Record<string, string>>; replace?: readonly AnalystRole[] },
): { results: ResultsV7; steer: SteerResult } {
  const before = prev.report!;
  const hired = s.plan.hire.filter((h) => !prev.roster.some((a) => a.role === h.role)).map((h) => hire(h.role, h.mission, h.why));
  const dropped = s.plan.drop.filter((r) => r !== "viability" && r !== "competition" && prev.roster.some((a) => a.role === r));
  const roster = weigh([...prev.roster.filter((a) => !dropped.includes(a.role)), ...hired].slice(0, 5));
  const oldFindings = prev.work.flatMap((w) => w.findings);
  const newFindings: Finding[] = [];
  const work: AnalystWork[] = roster.map((a) => {
    const w = prev.work.find((x) => x.analyst === a.role) ?? { analyst: a.role, status: "done" as const, findings: [], score: null, headline: "" };
    const fr = s.fresh[a.role];
    if (!fr) return w;
    const clean = fr.findings.map(enforceSourceRule);
    newFindings.push(...clean);
    // In the merged work the new findings reveal after the kept ones (steer.findings keep rerun-relative t).
    const last = Math.max(0, ...w.findings.map((f) => f.t));
    const shifted = clean.map((f, i) => ({ ...f, t: last + 2600 * (i + 1) }));
    // Block mode: a re-run block rewrites its whole evidence list (replace), the classic roster merges.
    const findings = s.replace?.includes(a.role) ? shifted : mergeFindings(w.findings, shifted);
    return finishWork({ ...w, status: "done", findings, headline: fr.headline ?? w.headline });
  });
  const report = buildReport(roster, work, s.judge);
  const steer: SteerResult = {
    id: s.id,
    note: s.note.slice(0, 280),
    ack: capWords(s.plan.ack, 14),
    status: "done",
    rerun: s.plan.rerun.filter((r) => roster.some((a) => a.role === r)),
    hired,
    dropped,
    findings: newFindings,
    changes: diffReports(before, report, { findings: newFindings, oldFindings, hired, dropped, why: s.why }),
    report,
    at: s.at,
  };
  return { results: { ...prev, roster, work, report, steers: [...prev.steers.filter((x) => x.id !== s.id), steer] }, steer };
}

// ───────────────────────────────────────────────────────────── 4 blocks (validate contract v7.1)
// Exactly 4 blocks per idea, each owned by one existing analyst role so the world (rooms r0–r3, actors, states) and
// the score maths (factorScore → buildReport → verdict, scalability, levelCapFor) are unchanged. See
// .notes/quality/contract.md. Mirrored in web/proto/contracts.ts (types, BLOCK_LIBRARY, blockVerdictFor).

export type BlockId = "customers" | "competition" | "money" | "risks";
/** Display and roster order: viability (risks) last because it reads the other three blocks' evidence. */
export const BLOCK_IDS: readonly BlockId[] = ["customers", "competition", "money", "risks"];
export interface BlockMeta {
  /** The analyst who owns the block (its findings, room, character and factor in the score). */
  role: AnalystRole;
  /** Generic label, used when the planner gives no idea-specific title. */
  label: string;
  /** What the block must answer, for the planner and the block prompt. */
  covers: string;
  /** Research budget per block (Haiku 5.5, server-side tools): 6 searches in all = $0.06 of the $0.10 target. */
  searches: number;
  fetches: number;
}
/** Identical to contracts.ts BLOCK_LIBRARY (test/v7.test.ts checks it). */
export const BLOCK_LIBRARY: Record<BlockId, BlockMeta> = {
  customers: { role: "demand", label: "Customers & demand", covers: "Who buys, how many of them, how often, what they spend and why they would switch", searches: 2, fetches: 2 },
  competition: { role: "competition", label: "Competition & alternatives", covers: "Named rivals and substitutes, their prices, strengths and the gap left open", searches: 2, fetches: 2 },
  money: { role: "pricing", label: "Money", covers: "Price you can charge, cost per unit, margin, fixed costs, break-even volume", searches: 1, fetches: 1 },
  risks: { role: "viability", label: "Risks & how to start", covers: "What kills it (rules, dependencies, timing), the cheapest first test and the path to scale", searches: 1, fetches: 1 },
};
export const BLOCK_OF_ROLE: Partial<Record<AnalystRole, BlockId>> = Object.fromEntries(BLOCK_IDS.map((b) => [BLOCK_LIBRARY[b].role, b]));
/** Word caps. Block evidence is a full sentence; the classic roster keeps 18 words. */
export const FINDING_WORDS = 18;
export const BLOCK_EVIDENCE_WORDS = 90;
/** Generous caps (the V1 writer writes full sentences; a cap only guards against a runaway answer, never cuts a normal one). */
export const BLOCK_LIMITS = { title: 14, focus: 20, takeaway: 80, meaning: 140, action: 50, keyLabel: 12, keyValue: 12, evidenceMin: 4, evidenceMax: 12, actionsMax: 3, keyNumbersMax: 4, focusMax: 3 } as const;

export type BlockVerdict = "strong" | "mixed" | "weak";
/** The chip is arithmetic, like the score: the block's factor score in the report's verdict bands. */
export const blockVerdictFor = (score: number): BlockVerdict => (score >= VERDICT_BANDS_V7.go ? "strong" : score >= VERDICT_BANDS_V7.pivot ? "mixed" : "weak");

/** Planner output (one cheap Haiku call), tailored to the idea. */
export interface BlockPlan {
  id: BlockId;
  /** Idea-specific, ≤ 10 words: "Who buys €25 bread subscriptions in Ruzafa?". */
  title: string;
  /** 2–3 questions the block answers, ≤ 16 words each. */
  focus: string[];
  /** Web search queries for this block (≤ BLOCK_LIBRARY[id].searches), local language where it helps. */
  queries: string[];
}

/** What the block model writes (structured output). Sources are NUMBERS into the block's research citation list;
 *  the server copies url / title / domain / accessed from that list, never from model text. */
export interface BlockEvidenceDraft {
  /** One sentence ≤ 35 words, with a number where the source has one. */
  text: string;
  kind: FindingKind;
  impact: Impact;
  /** 1-based index into the block's citation list; omitted or 0 = estimate (then `basis` is required). */
  source?: number;
  basis?: string;
  value?: number;
  unit?: string;
  display?: string;
  competitor?: { name: string; price?: string; note: string };
}
export interface BlockDraft {
  takeaway: string;
  evidence: BlockEvidenceDraft[];
  meaning: string;
  actions: string[];
  keyNumbers?: Array<{ label: string; value: string; source?: number; basis?: string }>;
  math?: string[];
}

/** A headline figure of the block. `source` null = an estimate, and `basis` says why. */
export interface KeyNumber { label: string; value: string; source: SourceRef | null; basis?: string }

/** One block as stored in results.v7.blocks and shown by the UI. */
export interface ReportBlock {
  id: BlockId;
  role: AnalystRole;
  /** Idea-specific title from the plan (falls back to BLOCK_LIBRARY[id].label). */
  title: string;
  focus: string[];
  status: WorkStatus;
  /** ≤ 30 words: the one-line answer to the title. "" while working. */
  takeaway: string;
  /** factorScore of the block's findings (null while working) and its chip. */
  score: number | null;
  verdict: BlockVerdict | null;
  /** Ids of the evidence findings, in reading order; the findings themselves are in work[role].findings. */
  evidence: string[];
  /** ≤ 60 words, second person: "what it means for you". */
  meaning: string;
  /** 1–3 concrete next actions, ≤ 16 words each. */
  actions: string[];
  keyNumbers?: KeyNumber[];
  /** The block's distinct sources in citation order: the UI numbers evidence as [1], [2] … by this list. */
  sources: SourceRef[];
  /** Server-only, additive: unit-economics arithmetic lines ("€25 − €9.40 cost = €15.60 margin"), each labelled
   *  with its source number or "(estimate)". Money block mainly; ≤ 6 lines. */
  math?: string[];
  /** Server diagnostics: block cost and ms to its first finding / to done (after the run started). */
  ms?: { first?: number; done?: number };
}

/** The fixed 4-analyst roster of the block contract (weights normalise to 0.24 / 0.29 / 0.18 / 0.29). */
export const blockRoster = (plans?: readonly Pick<BlockPlan, "id" | "title">[]): Analyst[] =>
  weigh(BLOCK_IDS.map((b) => {
    const mission = plans?.find((p) => p.id === b)?.title || BLOCK_LIBRARY[b].covers;
    // the block's mission is shown whole on the hiring sheet (hire() caps classic missions at 12 words)
    return { ...hire(BLOCK_LIBRARY[b].role, mission, BLOCK_LIBRARY[b].label), mission: capWords(mission, 24) };
  }));

/** Plan without AI (demo mode, planner failure): generic titles and the block's own questions. */
export function fallbackBlockPlans(idea: string): BlockPlan[] {
  const short = capWords(idea, 6);
  const focus: Record<BlockId, string[]> = {
    customers: ["Who would pay for this, and how many are there?", "How often would they buy, and why switch?"],
    competition: ["Who do customers use today instead?", "What do they charge, and where are they weak?"],
    money: ["What price can it charge, and what does one sale cost?", "How many sales a month to break even?"],
    risks: ["What could stop it: rules, suppliers, timing?", "What is the cheapest first test, and how could it grow?"],
  };
  return BLOCK_IDS.map((id) => ({ id, title: BLOCK_LIBRARY[id].label, focus: focus[id], queries: [`${short} ${BLOCK_LIBRARY[id].label.toLowerCase()}`] }));
}

/** The source list of a block from its findings (first appearance order, deduplicated by url). */
export function blockSources(findings: readonly Finding[], extra: readonly (SourceRef | null | undefined)[] = []): SourceRef[] {
  const out: SourceRef[] = [];
  for (const s of [...findings.filter(isSourced).map((f) => f.source!), ...extra]) if (s && /^https?:\/\//.test(s.url) && !out.some((x) => x.url === s.url)) out.push(s);
  return out;
}

/** Turns a block draft into contract findings + the stored block (pure). `cites` = the block's research citation list
 *  (1-based numbers in the draft). Findings get ids `${role}-${startIndex + i}` and go through enforceSourceRule. */
export function buildBlock(plan: BlockPlan, draft: BlockDraft, cites: readonly SourceRef[], opts: { startIndex?: number; t0?: number; gap?: number } = {}): { block: ReportBlock; findings: Finding[] } {
  const role = BLOCK_LIBRARY[plan.id].role;
  const L = BLOCK_LIMITS;
  const cite = (n?: number) => (n && n >= 1 && n <= cites.length ? cites[n - 1]! : null);
  const findings = draft.evidence.slice(0, L.evidenceMax).map((e, i): Finding => {
    const source = cite(e.source);
    return enforceSourceRule({
      id: `${role}-${(opts.startIndex ?? 0) + i}`,
      analyst: role,
      kind: e.kind,
      text: capWords(e.text, BLOCK_EVIDENCE_WORDS),
      ...(e.value != null && Number.isFinite(e.value) ? { value: e.value } : {}),
      ...(e.unit ? { unit: capWords(e.unit, 2) } : {}),
      ...(e.display ? { display: capWords(e.display, 3) } : {}),
      source,
      ...(e.basis ? { basis: capWords(e.basis, 24) } : {}),
      ...(e.competitor ? { competitor: { name: capWords(e.competitor.name, 5), named: !!source, ...(e.competitor.price ? { price: e.competitor.price } : {}), note: capWords(e.competitor.note, 10) } } : {}),
      impact: e.impact,
      t: (opts.t0 ?? 0) + i * (opts.gap ?? 0),
    });
  });
  const keyNumbers: KeyNumber[] = (draft.keyNumbers ?? []).slice(0, L.keyNumbersMax).map((k) => {
    const source = cite(k.source);
    return { label: capWords(k.label, L.keyLabel), value: capWords(k.value, L.keyValue), source, ...(source ? {} : { basis: capWords(k.basis || "Desk estimate, no web source", 24) }) };
  });
  const score = factorScore(findings);
  const block: ReportBlock = {
    id: plan.id,
    role,
    title: capWords(plan.title || BLOCK_LIBRARY[plan.id].label, L.title),
    focus: plan.focus.slice(0, L.focusMax).map((q) => capWords(q, L.focus)),
    status: "done",
    takeaway: capWords(draft.takeaway, L.takeaway),
    score,
    verdict: blockVerdictFor(score),
    evidence: findings.map((f) => f.id),
    meaning: capWords(draft.meaning, L.meaning),
    actions: draft.actions.filter((a) => a.trim()).slice(0, L.actionsMax).map((a) => capWords(a, L.action)),
    ...(keyNumbers.length ? { keyNumbers } : {}),
    ...(draft.math?.length ? { math: draft.math.filter((x) => x.trim()).slice(0, 8).map((x) => capWords(x, 40)) } : {}),
    sources: blockSources(findings, keyNumbers.map((k) => k.source)),
  };
  return { block, findings };
}

/** A block before its draft arrives (queued / working), from the plan. */
export const pendingBlock = (plan: BlockPlan, status: WorkStatus = "queued"): ReportBlock => ({
  id: plan.id, role: BLOCK_LIBRARY[plan.id].role, title: capWords(plan.title || BLOCK_LIBRARY[plan.id].label, BLOCK_LIMITS.title), focus: plan.focus.slice(0, BLOCK_LIMITS.focusMax),
  status, takeaway: "", score: null, verdict: null, evidence: [], meaning: "", actions: [], sources: [],
});

/** True when results were produced by the block contract (UI: show blocks; else the classic roster view). */
export const hasBlocks = (r: Pick<ResultsV7, "blocks"> | null | undefined): r is { blocks: ReportBlock[] } => !!r?.blocks?.length;
/** The source number of a finding inside its block (1-based; 0 = estimate, no source). */
export const sourceNumber = (b: Pick<ReportBlock, "sources">, f: Pick<Finding, "source">): number => (f.source ? b.sources.findIndex((x) => x.url === f.source!.url) + 1 : 0);

/** After a steer changed the work: each block's evidence ids, score, chip and sources follow its owner's findings
 *  (prose is kept unless the block was rewritten). Pure. */
export function refreshBlocks(blocks: readonly ReportBlock[], work: readonly AnalystWork[]): ReportBlock[] {
  return blocks.map((b) => {
    const fs = work.find((w) => w.analyst === b.role)?.findings;
    if (!fs) return b;
    const score = factorScore(fs);
    return { ...b, evidence: fs.map((f) => f.id), score, verdict: blockVerdictFor(score), sources: blockSources(fs, (b.keyNumbers ?? []).map((k) => k.source)) };
  });
}
