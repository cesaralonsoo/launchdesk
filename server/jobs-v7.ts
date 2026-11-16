// LaunchDesk v7 jobs: the validate stage (4 research blocks → one written report) and the CEO steer. Owner: WS-INTEL.
// Runs next to the v4 departments (jobs.ts starts it inside the validate stage) and saves ResultsV7 after every step,
// so the poll (GET /api/projects/:id → results.v7) shows each analyst's real progress notes (results.v7.notes) while
// the team works, and the finished report (blocks + brief + report) when it is done.
import { mergeResearch, PACK_OF_ROLE, type Research, type ResearchPack } from "./ai.js";
import { Budget, costOf, costScope, EST, endCost } from "./cost.js";
import { leoFromV7, memoFromV7 } from "./v7-bridge.js";
import { mockJudge, preparedSteerFor, routeSteer, runAnalyst, runJudge } from "./ai-v7.js";
import { assembleReport, emptyResearch, fallbackReport, ownerOf, researchBlock, sampleBlocks, sampleSteerFindings, type BlockResearch } from "./blocks-v7.js";
import { adjustConfidence, alignVerdictMd, econSummary, marketOf, writeReport, type WrittenReport } from "./report-v7.js";
import { config } from "./config.js";
import { exec } from "./db.js";
import {
  applySteer, BLOCK_IDS, BLOCK_LIBRARY, BLOCK_OF_ROLE, blockRoster, buildReport, fallbackBlockPlans, finishWork, hasBlocks, hire, NOTES_MAX, pendingBlock, refreshBlocks,
  type AgentNote, type AnalystRole, type AnalystWork, type IdeaReport, type BlockId, type Finding, type JudgeDraft, type ResultsV7, type SteerPlan, type SteerResult, STEER_LIMIT,
} from "./v7.js";
import { samplesSteer, sampleResults, v7SampleFor } from "./v7-samples.js";

const ANALYST_DEADLINE_MS = 60_000;
const withDeadline = <T>(p: Promise<T>, ms: number): Promise<T> => {
  let t: NodeJS.Timeout | undefined;
  return Promise.race([p, new Promise<never>((_, rej) => (t = setTimeout(() => rej(new Error("This took too long, please retry")), ms)))]).finally(() => clearTimeout(t));
};

export async function loadV7(projectId: string): Promise<ResultsV7 | null> {
  const r = await exec("SELECT json FROM results_v7 WHERE project_id = ?", [projectId]);
  const j = r.rows[0]?.json;
  return j ? (JSON.parse(String(j)) as ResultsV7) : null;
}
export async function saveV7(projectId: string, v: ResultsV7) {
  await exec(
    "INSERT INTO results_v7 (project_id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
    [projectId, JSON.stringify(v), Date.now()],
  );
}

/** The shared research the analysts cited (kept so a CEO steer can cite the same numbered sources). */
async function saveResearch(projectId: string, r: Research | null) {
  await exec("UPDATE results_v7 SET research = ? WHERE project_id = ?", [r ? JSON.stringify(r) : null, projectId]);
}
async function loadResearch(projectId: string): Promise<Research | null> {
  const r = await exec("SELECT research FROM results_v7 WHERE project_id = ?", [projectId]);
  const j = r.rows[0]?.research;
  const v = j ? (JSON.parse(String(j)) as Research | { blocks: BlockResearch[] }) : null;
  return v && "sources" in v ? v : null;
}
/** Block mode: each block's numbered research (a steer rewrites a block from it and cites the same numbers). */
async function saveBlockResearch(projectId: string, blocks: BlockResearch[]) {
  await exec("UPDATE results_v7 SET research = ? WHERE project_id = ?", [JSON.stringify({ blocks }), projectId]);
}
async function loadBlockResearch(projectId: string): Promise<BlockResearch[]> {
  const r = await exec("SELECT research FROM results_v7 WHERE project_id = ?", [projectId]);
  const j = r.rows[0]?.research;
  const v = j ? (JSON.parse(String(j)) as { blocks?: BlockResearch[] }) : null;
  return BLOCK_IDS.map((id) => v?.blocks?.find((b) => b.id === id) ?? emptyResearch(id));
}

/** One save queue per project: concurrent analysts never overwrite each other's progress. */
const chains = new Map<string, Promise<unknown>>();
function update(projectId: string, fn: (v: ResultsV7) => ResultsV7): Promise<ResultsV7> {
  const next = (chains.get(projectId) ?? Promise.resolve()).then(async () => {
    const cur = (await loadV7(projectId)) ?? empty();
    const v = fn(cur);
    await saveV7(projectId, v);
    return v;
  });
  chains.set(projectId, next.catch(() => undefined));
  return next;
}
const empty = (): ResultsV7 => ({ version: 7, roster: [], work: [], report: null, steers: [], status: "planning" });

/** What runV7 accepts as research: one promise (old callers, tests) or the two parallel packs (jobs.ts). */
export type ResearchInput = Promise<Research | null> | Research | null | (Record<ResearchPack, Promise<Research | null>> & { all: Promise<Research | null> });
const isPacks = (r: ResearchInput): r is Record<ResearchPack, Promise<Research | null>> & { all: Promise<Research | null> } => !!r && typeof r === "object" && "all" in r && "market" in r;

const RESEARCH_DEADLINE_MS = 70_000;
const JUDGE_DEADLINE_MS = 45_000;
const REPORT_DEADLINE_MS = 190_000;

/** Appends a progress note (speech bubble) for one analyst; the newest NOTES_MAX are kept. */
function noteFor(projectId: string, t0: number, analyst: AnalystRole) {
  return (kind: AgentNote["kind"], text: string) =>
    void update(projectId, (v) => {
      const at = Date.now() - t0;
      return { ...v, notes: [...(v.notes ?? []), { analyst, kind, text, at }].slice(-NOTES_MAX), ...(kind === "found" && v.firstFindingMs == null ? { firstFindingMs: at } : {}) };
    }).catch(() => undefined);
}

/** Appends a progress note for any analyst (the writer's notes go to the section's owner). */
const writerNoteFor = (projectId: string, t0: number) => (analyst: AnalystRole, kind: AgentNote["kind"], text: string) => noteFor(projectId, t0, analyst)(kind, text);

/** What runV7 keeps from the writer next to the blocks (the full Markdown and the computed unit economics). */
const reportExtras = (w: WrittenReport, report: IdeaReport | null): Pick<ResultsV7, "reportMd" | "econ" | "econErr"> => ({
  ...(w.md ? { reportMd: report ? alignVerdictMd(w.md, report.verdict, report.score) : w.md } : {}),
  econ: econSummary(w, w.sources ?? [], w.accessed),
  ...(w.econErr ? { econErr: w.econErr } : {}),
});
/** The report's confidence, lowered when its money inputs are missing or gaps are a large part of the evidence. */
const honestReport = (report: IdeaReport, w: WrittenReport, work: readonly AnalystWork[]): IdeaReport => {
  const all = work.flatMap((x) => x.findings);
  const gaps = all.filter((f) => !f.source && /not found/i.test(f.basis ?? "")).length;
  return { ...report, confidence: adjustConfidence(report.confidence, { econMissing: !w.econ || w.econ.computed.missing.length > 0, gaps, total: all.length }) };
};

/**
 * The validate pipeline, recipe "V1" (.notes/quality/opt/DECISION.md): the 4 blocks research in parallel from t = 0
 * (1 search + <= 1 fetch each on Haiku, progress notes saved as they happen) -> ONE streamed writer call writes the
 * whole report -> it is parsed into blocks -> buildReport computes score / verdict / scalability / level cap.
 * Every paid call reserves its estimate in a per-report budget (REPORT_CAP_USD, $0.10). The `research` argument
 * is ignored (kept for old callers). Idempotent: a finished report is left alone; an interrupted run starts over
 * and reuses the research already paid for.
 */
export async function runV7(projectId: string, idea: string, _research?: ResearchInput): Promise<void> {
  const cur = await loadV7(projectId);
  if (cur?.status === "done" && cur.report) return;
  const t0 = Date.now();
  try {
    const plans = fallbackBlockPlans(idea);
    const roster = blockRoster();
    await saveV7(projectId, {
      ...empty(),
      roster,
      work: roster.map((a) => ({ analyst: a.role, status: "working", findings: [], score: null, headline: "" })),
      blocks: plans.map((p) => pendingBlock(p, "working")),
      notes: [],
      status: "researching",
    });
    const budget = new Budget();
    const location = marketOf(idea);
    // A retry after a failed report reuses the research already paid for (saved per block as each finishes).
    const saved = config.mockAi ? [] : await loadBlockResearch(projectId);
    const toRun = BLOCK_IDS.filter((id) => !saved.some((r) => r.id === id && r.ok));
    if (!config.mockAi && !budget.fits(toRun.length * EST.research + EST.writer)) throw new Error("This report would exceed its budget.");
    const done: BlockResearch[] = [];
    const research = await Promise.all(
      BLOCK_IDS.map(async (id) => {
        const role = BLOCK_LIBRARY[id].role;
        const prior = saved.find((r) => r.id === id && r.ok);
        if (prior) {
          console.log(`[jobs7] ${projectId} research ${id}: reusing the saved research (${prior.cites.length} sources)`);
          noteFor(projectId, t0, role)("found", prior.summary || "Reusing my earlier research.");
          done.push(prior);
          return prior;
        }
        const r = await withDeadline(researchBlock(idea, id, { onNote: noteFor(projectId, t0, role), location, budget }), RESEARCH_DEADLINE_MS).catch((e) => {
          console.error(`[jobs7] ${projectId} research ${id}:`, (e as Error).message);
          return emptyResearch(id);
        });
        await update(projectId, (v) => ({ ...v, researched: (v.researched ?? 0) + r.cites.length }));
        done.push(r);
        await saveBlockResearch(projectId, BLOCK_IDS.map((b) => done.find((x) => x.id === b) ?? emptyResearch(b))).catch(() => undefined);
        return r;
      }),
    );
    await saveBlockResearch(projectId, research);
    if (!config.mockAi && research.every((r) => !r.ok)) console.warn(`[jobs7] ${projectId} no block research came back; the report is estimates only`);
    await update(projectId, (v) => ({ ...v, status: "judging" }));
    // writeReport retries the writer once and falls back to the notes; past the deadline the notes become the report.
    const w: WrittenReport = await withDeadline(writeReport(idea, research, { budget, onNote: writerNoteFor(projectId, t0) }), REPORT_DEADLINE_MS).catch((e) => {
      console.error(`[jobs7] ${projectId} report failed, building it from the notes:`, (e as Error).message);
      return { md: "", econ: null, econErr: "report timed out", invalidCites: 0, meta: {}, out: fallbackReport(idea, research), fromNotes: true };
    });
    if (w.fromNotes) console.warn(`[jobs7] ${projectId} report built from the research notes (no model write-up)`);
    const a = assembleReport(w.out, research, { t0 });
    const work: AnalystWork[] = roster.map((x) => finishWork({ analyst: x.role, status: "done", findings: a.findings[x.role] ?? [], score: null, headline: a.blocks.find((b) => b.role === x.role)?.takeaway ?? "" }));
    const report = honestReport(buildReport(roster, work, a.judge), w, work);
    const cost = costOf(projectId, "validate");
    const ms = Date.now() - t0;
    console.log(`[jobs7] ${projectId} report ready after ${ms}ms (${report.evidence.sourced}/${report.evidence.total} items sourced, report spend $${budget.spent.toFixed(4)}${w.invalidCites ? `, ${w.invalidCites} invalid cites removed` : ""})`);
    noteFor(projectId, t0, "viability")("status", `Report ready in ${Math.round(ms / 1000)} s`);
    await update(projectId, (v) => ({ ...v, roster, work, blocks: a.blocks, brief: a.brief, report, status: "done", ...reportExtras(w, report), ...(cost.calls ? { cost } : {}), ms }));
  } catch (e) {
    noteFor(projectId, t0, "viability")("status", "The report could not be finished.");
    await update(projectId, (v) => ({ ...v, status: "error", error: (e as Error).message || "Something went wrong" }));
  }
}

// ───────────────────────────────────────────────────────────── steer

const steering = new Set<string>();
export const isSteering = (projectId: string) => steering.has(projectId);

export class SteerError extends Error {
  constructor(public status: 409 | 429, message: string) {
    super(message);
  }
}

/**
 * Starts a CEO steer: routes it (who re-checks), stores a "working" entry and runs the rerun in the background.
 * Resolves with what POST /steer answers (202). Throws SteerError 409 / 429.
 */
export async function startSteer(projectId: string, idea: string, note: string, target?: AnalystRole[]): Promise<{ id: string; ack: string; rerun: AnalystRole[] }> {
  if (steering.has(projectId)) throw new SteerError(409, "Your team is still working on the last note.");
  const v = await loadV7(projectId);
  if (!v?.report || v.status !== "done") throw new SteerError(409, "The report is not ready yet.");
  if (v.steers.length >= STEER_LIMIT) throw new SteerError(429, `You can steer the team ${STEER_LIMIT} times per stage.`);
  steering.add(projectId);
  try {
    const blocks = hasBlocks(v);
    const routed = await routeSteer(idea, note, blocks ? blockRoster() : v.roster, target?.map((r) => (blocks ? ownerOf(r) : r)), blocks ? { alias: ownerOf } : undefined);
    const plan: SteerPlan = blocks ? { ...routed, rerun: [...new Set(routed.rerun.map(ownerOf))], hire: [], drop: [] } : routed;
    const id = `steer-${v.steers.length + 1}`;
    const entry: SteerResult = { id, note: note.slice(0, 280), ack: plan.ack, status: "working", rerun: plan.rerun, hired: [], dropped: [], findings: [], changes: [], report: null, at: new Date().toISOString() };
    await update(projectId, (x) => ({ ...x, steers: [...x.steers, entry] }));
    void costScope(projectId, "steer", () => runSteer(projectId, idea, note, id, plan)).finally(() => {
      steering.delete(projectId);
      endCost(projectId, "steer");
    });
    return { id, ack: plan.ack, rerun: plan.rerun };
  } catch (e) {
    steering.delete(projectId);
    throw e;
  }
}

async function runSteer(projectId: string, idea: string, note: string, id: string, plan: Awaited<ReturnType<typeof routeSteer>>) {
  try {
    const prev = (await loadV7(projectId))!;
    if (hasBlocks(prev)) return await runBlockSteer(projectId, idea, note, id, plan, prev);
    const prepared = config.mockAi ? preparedSteerFor(idea, note) : null;
    if (prepared) {
      // Demo mode: the prepared, honest variant for the sample (same maths as a real run).
      await new Promise((r) => setTimeout(r, config.mockDelayMs ?? 2400));
      const base = { ...prev, steers: prev.steers.filter((s) => s.id !== id) };
      const { results, steer } = samplesSteer(prepared.sample, base, prepared.steer, note, new Date().toISOString());
      await update(projectId, () => ({ ...results, steers: [...base.steers, { ...steer, id }] }));
      await syncV4(projectId, idea);
      return;
    }
    if (config.mockAi) {
      // Demo mode without a prepared variant: nothing new can be researched, so nothing changes (an honest no-op).
      await new Promise((r) => setTimeout(r, config.mockDelayMs ?? 1200));
      const steer: SteerResult = { id, note: note.slice(0, 280), ack: "Noted. Demo mode can't research new evidence for that note.", status: "done", rerun: plan.rerun, hired: [], dropped: [], findings: [], changes: [], report: prev.report, at: new Date().toISOString() };
      await update(projectId, (v) => ({ ...v, steers: v.steers.map((x) => (x.id === id ? steer : x)) }));
      return;
    }
    const roster = prev.roster;
    const fresh: Partial<Record<AnalystRole, { findings: Finding[]; headline?: string }>> = {};
    {
      const found = await loadResearch(projectId);
      const targets = [...new Set([...plan.rerun, ...plan.hire.map((h) => h.role)])];
      const used = new Set([...prev.work.flatMap((w) => w.findings.map((f) => f.id)), ...prev.steers.flatMap((s) => s.findings.map((f) => f.id))]);
      await Promise.all(
        targets.map(async (role) => {
          const h = plan.hire.find((x) => x.role === role);
          const a = roster.find((x) => x.role === role) ?? hire(role, h?.mission ?? "", h?.why ?? "");
          const previous = prev.work.find((w) => w.analyst === role)?.findings ?? [];
          let start = previous.length;
          while (used.has(`${role}-${start}`)) start++;
          // One analyst failing (twice) only drops its re-check: the others still change the report.
          const run = () => withDeadline(runAnalyst(idea, a, found, { note, previous, startIndex: start }), ANALYST_DEADLINE_MS);
          try {
            fresh[role] = await run().catch(() => run());
          } catch (e) {
            console.error(`[jobs7] ${projectId} steer ${role} failed:`, (e as Error).message);
          }
        }),
      );
      if (targets.length && !Object.keys(fresh).length) throw new Error("No analyst could re-check that note.");
    }
    const allAfter = prev.work.flatMap((w) => w.findings).concat(Object.values(fresh).flatMap((f) => f?.findings ?? []));
    const judge = await withDeadline(runJudge(idea, roster, allAfter, note), JUDGE_DEADLINE_MS).catch(() => mockJudge("", allAfter));
    const base = { ...prev, steers: prev.steers.filter((s) => s.id !== id) };
    const { results, steer } = applySteer(base, { id, note, plan, fresh, judge, at: new Date().toISOString() });
    await update(projectId, () => ({ ...results, steers: [...base.steers, steer] }));
    await syncV4(projectId, idea);
  } catch (e) {
    console.error(`[jobs7] ${projectId} steer failed:`, (e as Error).message);
    await update(projectId, (v) => ({ ...v, steers: v.steers.map((s) => (s.id === id ? { ...s, status: "error" as const } : s)) }));
  }
}

/** Next free finding number per role (ids stay unique across the run and every steer). */
function nextIndex(prev: ResultsV7): Partial<Record<AnalystRole, number>> {
  const used = new Set([...prev.work.flatMap((w) => w.findings.map((f) => f.id)), ...prev.steers.flatMap((s) => s.findings.map((f) => f.id))]);
  const out: Partial<Record<AnalystRole, number>> = {};
  for (const w of prev.work) {
    const nums = [...used].filter((u) => u.startsWith(`${w.analyst}-`)).map((u) => Number(u.slice(w.analyst.length + 1))).filter(Number.isFinite);
    out[w.analyst] = Math.max(w.findings.length, ...nums.map((n) => n + 1));
  }
  return out;
}

/**
 * Block mode steer: the routed blocks research again with the note (in parallel), then one report call rewrites
 * only those blocks plus the summary parts; the other blocks are kept. Demo mode applies the sample's prepared
 * variant (regrouped into blocks) or, without one, stores an honest no-op.
 */
async function runBlockSteer(projectId: string, idea: string, note: string, id: string, plan: SteerPlan, prev: ResultsV7 & { blocks: NonNullable<ResultsV7["blocks"]> }) {
  const base = { ...prev, steers: prev.steers.filter((s) => s.id !== id) };
  const at = () => new Date().toISOString();
  if (config.mockAi) {
    const sample = v7SampleFor(idea);
    const prepared = preparedSteerFor(idea, note);
    await new Promise((r) => setTimeout(r, config.mockDelayMs ?? 2400));
    if (!sample || !prepared) {
      const steer: SteerResult = { id, note: note.slice(0, 280), ack: "Noted. Demo mode can't research new evidence for that note.", status: "done", rerun: plan.rerun, hired: [], dropped: [], findings: [], changes: [], report: prev.report, at: at() };
      await update(projectId, (v) => ({ ...v, steers: v.steers.map((x) => (x.id === id ? steer : x)) }));
      return;
    }
    const fresh = sampleSteerFindings(sample, prepared.steer, nextIndex(prev));
    const { idMap } = sampleBlocks(sample);
    const j = prepared.steer.judge(sample.judge);
    const remap = (l: JudgeDraft["strengths"]) => l.map((x) => ({ ...x, finding: idMap[x.finding] ?? x.finding }));
    const judge: JudgeDraft = { ...j, strengths: remap(j.strengths), weaknesses: remap(j.weaknesses) };
    const why = Object.fromEntries(Object.entries(prepared.steer.why ?? {}).map(([k, w]) => [k.startsWith("factor:") ? `factor:${ownerOf(k.slice(7) as AnalystRole)}` : k, w]));
    const p2: SteerPlan = { ...plan, ack: prepared.steer.plan.ack, rerun: [...new Set(prepared.steer.plan.rerun.map(ownerOf))] };
    const { results, steer } = applySteer(base, { id, note, plan: p2, fresh, judge, at: at(), why });
    await update(projectId, () => ({ ...results, blocks: refreshBlocks(prev.blocks, results.work), steers: [...base.steers, steer] }));
    await syncV4(projectId, idea);
    return;
  }
  const t0 = Date.now();
  const ids = [...new Set(plan.rerun.map((r) => BLOCK_OF_ROLE[r]).filter((b): b is BlockId => !!b))];
  const research = await loadBlockResearch(projectId);
  // Cheap: no new searches. ONE writer call rewrites the report with the note; only the routed blocks are taken.
  const w = await withDeadline(writeReport(idea, research, { note, focus: ids, budget: new Budget(), onNote: writerNoteFor(projectId, t0) }), REPORT_DEADLINE_MS);
  if (w.fromNotes) throw new Error("The writer could not rewrite the report.");
  const out = { ...w.out, blocks: Object.fromEntries(Object.entries(w.out.blocks).filter(([b]) => ids.includes(b as BlockId))) };
  const a = assembleReport(out, research, { kept: prev.blocks, startIndex: nextIndex(prev), t0 });
  // Each rewritten block replaces its whole evidence list; item i "replaces" the old item i so the diff can show it.
  const freshByRole: Partial<Record<AnalystRole, { findings: Finding[]; headline?: string }>> = {};
  for (const [role, fs] of Object.entries(a.findings) as Array<[AnalystRole, Finding[]]>) {
    const old = prev.work.find((x) => x.analyst === role)?.findings ?? [];
    freshByRole[role] = { findings: fs.map((f, i) => (old[i] ? { ...f, replaces: old[i]!.id } : f)), headline: a.blocks.find((b) => b.role === role)?.takeaway };
  }
  const rerun = Object.keys(freshByRole) as AnalystRole[];
  const { results, steer } = applySteer(base, { id, note, plan: { ...plan, rerun }, fresh: freshByRole, judge: a.judge, at: at(), replace: rerun });
  await update(projectId, () => ({ ...results, blocks: refreshBlocks(a.blocks, results.work), brief: { ...a.brief, researchedAt: prev.brief?.researchedAt ?? a.brief.researchedAt }, steers: [...base.steers, steer], ...reportExtras(w, results.report) }));
  await syncV4(projectId, idea);
}

/**
 * After a steer changed the report: the derived v4 copies (Leo's report, the memo) follow, so the classic pages
 * and the build quote the new score. Only rows that were derived from v7 (model "v7") are touched.
 */
export async function syncV4(projectId: string, idea: string) {
  const v = await loadV7(projectId);
  if (!v?.report) return;
  await exec("UPDATE jobs SET json = ? WHERE project_id = ? AND dept = 'leo' AND model = 'v7' AND status = 'done'", [JSON.stringify(leoFromV7(v)), projectId]);
  const sam = await exec("SELECT json FROM jobs WHERE project_id = ? AND dept = 'sam' AND status = 'done'", [projectId]);
  const j = sam.rows[0]?.json;
  if (j) {
    const o = JSON.parse(String(j)) as Record<string, unknown>;
    if (o.memo) await exec("UPDATE jobs SET json = ? WHERE project_id = ? AND dept = 'sam'", [JSON.stringify({ ...o, memo: memoFromV7(idea, v) }), projectId]);
  }
}

/** For seeds and tests: a finished sample report (demo data). */
export { sampleResults };
