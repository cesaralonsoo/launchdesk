// v7 → v4 bridge (WS-INTEL, cost pass). When the v7 analyst team ran, Leo's research report and Mia's memo are NOT
// separate model calls any more: they are derived here from the v7 report, so the classic pages (/r pack, /s site)
// and the build prompts quote exactly the same score, verdict and evidence as the v7 report (one number everywhere).
import type { LeoV6 } from "./ai.js";
import type { LeoOpportunity, Memo, Source } from "./types.js";
import { ROLE_LIBRARY, VERDICT_RULE_V7, VERDICT_WORD, capWords, fullSentences, isSourced, type Finding, type IdeaReport, type ResultsV7 } from "./v7.js";

const SIGNALS: Array<[string, Array<string>]> = [
  ["Demand", ["demand", "market", "viability"]],
  ["Competition gap", ["competition", "viability"]],
  ["Price acceptance", ["pricing", "market", "competition"]],
  ["Channel", ["location", "demand", "tech", "viability"]],
  ["Timing", ["regulation", "market", "viability"]],
];

/** Leo's v4 report, derived from the v7 report (no model call). `score` and `verdict` ARE the v7 ones. */
export function leoFromV7(v: ResultsV7): LeoOpportunity & LeoV6 {
  const r = v.report!;
  const all = v.work.flatMap((w) => w.findings);
  const byId = new Map(all.map((f) => [f.id, f]));
  const sources: Source[] = r.evidence.sources.map((s, i) => ({ id: i + 1, url: s.url, title: s.title, domain: s.domain, accessed: s.accessed }));
  const sid = (f?: Finding) => (f && isSourced(f) ? (sources.find((s) => s.url === f.source!.url)?.id ?? null) : null);
  const factor = (roles: string[]) => roles.map((x) => r.factors.find((f) => f.analyst === x)).find(Boolean);
  const signals = SIGNALS.map(([name, roles]) => {
    const f = factor(roles);
    const top = f ? [...f.findings.map((id) => byId.get(id)!).filter(Boolean)].sort((a, b) => Math.abs(b.impact ?? 0) - Math.abs(a.impact ?? 0) || Number(isSourced(b)) - Number(isSourced(a)))[0] : undefined;
    return { name, score: f?.score ?? 5, why: capWords(top?.text ?? "No analyst covered this", 12), source_id: sid(top), weight: 0.2 };
  });
  const weak = r.weaknesses.map((w) => ({ w, f: byId.get(w.finding) }));
  return {
    score: r.score,
    verdict: r.verdict,
    headline: capWords(r.verdictLine, 12),
    summary: `${r.verdictLine} ${r.evidence.total} findings, ${r.evidence.sourced} with a source.`,
    signals,
    why_go: r.strengths[0]?.text ?? "",
    risks: weak.map(({ w, f }, i) => ({ risk: w.text, mitigation: r.nextSteps[i] ?? r.nextSteps[0] ?? "", severity: (f?.impact ?? -1) <= -2 ? "high" : i === 0 ? "high" : "med" })),
    pivot: r.verdict === "go" ? null : (r.pivot ?? null),
    next_step: r.nextSteps[0] ?? "",
    market_facts: all
      .filter((f) => f.kind === "fact" || f.kind === "number" || (f.kind === "estimate" && f.analyst === "market"))
      .slice(0, 5)
      .map((f) => ({ fact: f.text, source_id: sid(f), is_estimate: !isSourced(f) })),
    competitors: all
      .filter((f) => f.competitor)
      .slice(0, 5)
      .map((f) => ({ name: f.competitor!.name, note: f.competitor!.note, price: 5, differentiation: 4, url: isSourced(f) && f.competitor!.named ? f.source!.url : null })),
    you: { price: 5, differentiation: 7 },
    sources,
    interviews: { who: "", where: "", questions: [], good_sign: "", target: 0 },
    // v6 extras: the maths shown is the v7 maths (the same string as the report).
    kill_criteria: [],
    score_math: r.math,
    verdict_rule: VERDICT_RULE_V7,
    confidence: { level: r.confidence, note: `${r.evidence.sourced} of ${r.evidence.total} findings cite a source` },
  };
}

/** One closing mark per sentence: never "…." or "..". */
export function endSentence(t: string): string {
  const s = String(t ?? "").trim().replace(/\s+([.!?…])/g, "$1");
  if (!s) return "";
  if (/…\.+$/.test(s)) return s.replace(/…\.+$/, "…");
  if (/[.!?]{2,}$/.test(s)) return s.replace(/([.!?])[.!?]+$/, "$1");
  return /[.!?…]$/.test(s) ? s : `${s}.`;
}

/** The customer's problem (never the idea's weak points): the writer's own sentence on new reports, else the
 *  Customers section's takeaway. */
export function problemFor(v: ResultsV7): string {
  const own = v.brief?.problem?.trim();
  if (own) return endSentence(fullSentences(own, 40));
  const take = v.blocks?.find((b) => b.id === "customers")?.takeaway?.trim();
  return take ? endSentence(fullSentences(take, 40)) : "";
}

/** Mia's one-page memo, derived from the v7 report (no model call). Quotes the v7 score exactly. */
export function memoFromV7(idea: string, v: ResultsV7): Memo {
  const r: IdeaReport = v.report!;
  // the verdict line already carries the display word ("Test first: …"); add it only when it does not
  const word = VERDICT_WORD[r.verdict];
  const line = r.verdictLine.toLowerCase().startsWith(word.toLowerCase()) ? r.verdictLine : `${word}: ${r.verdictLine}`;
  const team = v.roster.map((a) => ROLE_LIBRARY[a.role].dept.toLowerCase()).join(", ");
  return {
    purpose: capWords(`Decide whether to put money into: ${idea}`, 24),
    problem: problemFor(v),
    insight: r.strengths.slice(0, 2).map((s) => endSentence(fullSentences(s.text, 40))).filter(Boolean).join(" "),
    verdict_line: `${r.score.toFixed(1)}/10 · ${line} (team: ${team}).`,
    next_7_days: r.nextSteps.slice(0, 3),
  };
}

/** What the build stage needs from the validate verdict (nova/dex prompts). */
export function buildBriefFromV7(v: ResultsV7 | undefined) {
  const r = v?.report;
  if (!r) return null;
  return {
    verdict: r.verdict,
    score: r.score,
    verdict_line: r.verdictLine,
    strengths: r.strengths.map((s) => s.text),
    weaknesses: r.weaknesses.map((w) => w.text),
    pivot: r.pivot ?? null,
    reach: r.scalability.reach,
  };
}
