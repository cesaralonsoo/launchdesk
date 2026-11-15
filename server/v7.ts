// LaunchDesk v7 — the evidence model (pure: no I/O, no imports, safe for the server, the tests and the prototype
// generator). Owner: WS-INTEL. Mirrors the v7 block of web/proto/contracts.ts (same names, same shapes); the server
// stores ResultsV7 at project.results.v7 next to the v4 fields, which stay populated for web/src.
//
// The one rule: the score is arithmetic on findings, and a finding counts fully only when it carries a real source.
//   factor  = clamp(5 + Σ impact × step, 0, 10), step = 1.0 for a sourced finding, 0.5 for an estimate
//             (a factor with no sourced finding is capped at 7.5)
//   score   = Σ weight × factor over the hired analysts (weights from ROLE_LIBRARY, normalised), one decimal
//   verdict = Go ≥ 6.5 with no factor ≤ 3 · Pivot 4.5–6.4 · No-go < 4.5 (5.0 = neutral evidence)
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
}

export const STEER_LIMIT = 3;
export const UNSOURCED_FACTOR_CAP = 7.5;
export const STEP_SOURCED = 1;
export const STEP_ESTIMATE = 0.5;
export const SCALE_WEIGHTS: Record<ScalePart, number> = { Reach: 0.25, Repeatable: 0.2, "Margins at scale": 0.2, "Founder-free": 0.15, "Digital leverage": 0.2 };
export const SCALE_PARTS = Object.keys(SCALE_WEIGHTS) as ScalePart[];
export const SCORE_RULE = "Each factor starts at 5.0: a sourced finding moves it 1 point per impact step, an estimate 0.5. No source: max 7.5.";
export const VERDICT_BANDS_V7 = { go: 6.5, pivot: 4.5, floor: 3 } as const;
export const VERDICT_RULE_V7 = "Go from 6.5 with no factor at 3 or below · Pivot 4.5–6.4 · No-go under 4.5";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
export const r1 = (n: number) => Math.round((n + 1e-9) * 10) / 10;

export const levelCapFor = (scalability: number, verdict: IdeaReport["verdict"] = "go"): WorldLevel =>
  verdict === "no-go" ? 0 : scalability >= 7 ? 3 : scalability >= 4 ? 2 : 1;
export const confidenceFor = (share: number): IdeaReport["confidence"] => (share >= 0.6 ? "high" : share >= 0.3 ? "medium" : "low");
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

/** Weights over the roster: ROLE_LIBRARY weights normalised over the non-zero ones (scalability = 0). */
export function rosterWeights(roles: readonly AnalystRole[]): Record<string, number> {
  const tot = roles.reduce((t, r) => t + ROLE_LIBRARY[r].weight, 0) || 1;
  return Object.fromEntries(roles.map((r) => [r, Math.round((ROLE_LIBRARY[r].weight / tot) * 1000) / 1000]));
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
  verdictLine: string;
  scalability: { parts: Partial<Record<ScalePart, number>>; why: string; wouldScale: string[]; reach?: string };
  strengths: Array<{ text: string; finding: string }>;
  weaknesses: Array<{ text: string; finding: string }>;
  nextSteps: string[];
  pivot?: { idea: string; why: string } | null;
}

export function scalabilityScore(parts: Partial<Record<ScalePart, number>>): number {
  return r1(SCALE_PARTS.reduce((t, p) => t + SCALE_WEIGHTS[p] * clamp(parts[p] ?? 0, 0, 10), 0));
}
export const reachLabel = (reach: number) => (reach <= 3 ? "Neighbourhood" : reach <= 5 ? "City" : reach <= 7.5 ? "Country" : "Global");

export function verdictFor(score: number, factors: readonly { score: number }[]): IdeaReport["verdict"] {
  if (score < VERDICT_BANDS_V7.pivot) return "no-go";
  if (score < VERDICT_BANDS_V7.go || factors.some((f) => f.score <= VERDICT_BANDS_V7.floor)) return "pivot";
  return "go";
}

/** Builds the full, internally consistent report from the roster, the analysts' work and the judge's draft. */
export function buildReport(roster: readonly Analyst[], work: readonly AnalystWork[], judge: JudgeDraft): IdeaReport {
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
  const wsum = factors.reduce((t, f) => t + f.weight, 0) || 1;
  const score = r1(factors.reduce((t, f) => t + f.weight * f.score, 0) / wsum);
  const verdict = verdictFor(score, factors);
  const all = work.flatMap((w) => w.findings);
  const sources: SourceRef[] = [];
  for (const f of all) if (isSourced(f) && !sources.some((s) => s.url === f.source!.url)) sources.push(f.source!);
  const sourced = all.filter(isSourced).length;
  const share = all.length ? Math.round((sourced / all.length) * 100) / 100 : 0;
  const parts = SCALE_PARTS.map((label) => ({ label, score: r1(clamp(judge.scalability.parts[label] ?? 0, 0, 10)) }));
  const sScore = scalabilityScore(judge.scalability.parts);
  const ids = new Set(all.map((f) => f.id));
  const byImpact = [...all].sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0) || Number(isSourced(b)) - Number(isSourced(a)));
  const pick = (given: JudgeDraft["strengths"], pool: Finding[]) => {
    const out = given.filter((s) => ids.has(s.finding) && s.text.trim()).slice(0, 3).map((s) => ({ text: capWords(s.text, 14), finding: s.finding }));
    for (const f of pool) {
      if (out.length >= 3) break;
      if (!out.some((s) => s.finding === f.id)) out.push({ text: capWords(f.text, 14), finding: f.id });
    }
    return out;
  };
  const strengths = pick(judge.strengths, byImpact.filter((f) => (f.impact ?? 0) > 0).concat(byImpact));
  const weaknesses = pick(judge.weaknesses, [...byImpact].reverse().filter((f) => (f.impact ?? 0) < 0).concat([...byImpact].reverse()));
  return {
    score,
    verdict,
    verdictLine: capWords(judge.verdictLine, 16),
    factors,
    math: factors.map((f) => `${f.weight.toFixed(2)}×${f.score.toFixed(1)}`).join(" + ") + ` = ${score.toFixed(1)}`,
    evidence: { total: all.length, sourced, sourcedShare: share, sources },
    confidence: confidenceFor(share),
    scalability: {
      score: sScore,
      cap: levelCapFor(sScore, verdict),
      reach: judge.scalability.reach || reachLabel(parts[0]!.score),
      why: capWords(judge.scalability.why, 20),
      wouldScale: judge.scalability.wouldScale.filter((x) => x.trim()).slice(0, 3).map((x) => capWords(x, 12)),
      parts,
    },
    strengths,
    weaknesses,
    nextSteps: judge.nextSteps.slice(0, 3).map((x) => capWords(x, 12)),
    pivot: verdict === "go" ? null : (judge.pivot ?? null),
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
  s: { id: string; note: string; plan: SteerPlan; fresh: Partial<Record<AnalystRole, { findings: Finding[]; headline?: string }>>; judge: JudgeDraft; at: string; why?: Partial<Record<string, string>> },
): { results: ResultsV7; steer: SteerResult } {
  const before = prev.report!;
  const hired = s.plan.hire.filter((h) => !prev.roster.some((a) => a.role === h.role)).map((h) => hire(h.role, h.mission, h.why));
  const dropped = s.plan.drop.filter((r) => r !== "viability" && r !== "competition" && prev.roster.some((a) => a.role === r));
  const roster = weigh([...prev.roster.filter((a) => !dropped.includes(a.role)), ...hired]).slice(0, 5);
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
    return finishWork({ ...w, status: "done", findings: mergeFindings(w.findings, shifted), headline: fr.headline ?? w.headline });
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
