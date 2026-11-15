// LaunchDesk v7 jobs: the analyst team of the validate stage and the CEO steer. Owner: WS-INTEL.
// Runs next to the v4 departments (jobs.ts starts it inside the validate stage, sharing Leo's web research), and
// saves ResultsV7 after every step so the poll (GET /api/projects/:id → results.v7) can animate findings as they land.
import type { Research } from "./ai.js";
import { mockJudge, planRoster, preparedSteerFor, routeSteer, runAnalyst, runJudge } from "./ai-v7.js";
import { config } from "./config.js";
import { exec } from "./db.js";
import { applySteer, buildReport, finishWork, hire, type AnalystRole, type AnalystWork, type Finding, type ResultsV7, type SteerResult, STEER_LIMIT } from "./v7.js";
import { samplesSteer, sampleResults } from "./v7-samples.js";

const ANALYST_DEADLINE_MS = 150_000;
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
  return j ? (JSON.parse(String(j)) as Research) : null;
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

/**
 * The v7 validate pipeline: plan the roster (‖ research) → every analyst in parallel → judge → report.
 * Idempotent: a finished report is left alone; an interrupted run starts over (findings are cheap to redo).
 */
export async function runV7(projectId: string, idea: string, research: Promise<Research | null> | Research | null): Promise<void> {
  const cur = await loadV7(projectId);
  if (cur?.status === "done" && cur.report) return;
  try {
    await saveV7(projectId, empty());
    const { roster } = await planRoster(idea);
    await update(projectId, (v) => ({ ...v, roster, work: roster.map((a) => ({ analyst: a.role, status: "queued", findings: [], score: null, headline: "" })), status: "researching" }));
    const found = await Promise.resolve(research).catch(() => null);
    await saveResearch(projectId, found);
    await update(projectId, (v) => ({ ...v, status: "analysing", researched: found?.sources.length ?? 0 }));
    const work = await Promise.all(
      roster.map(async (a): Promise<AnalystWork> => {
        await update(projectId, (v) => ({ ...v, work: v.work.map((w) => (w.analyst === a.role ? { ...w, status: "working" } : w)) }));
        let done: AnalystWork;
        try {
          const out = await withDeadline(runAnalyst(idea, a, found), ANALYST_DEADLINE_MS).catch(async (e) => {
            console.error(`[jobs7] ${projectId} ${a.role} (attempt 1):`, (e as Error).message);
            return withDeadline(runAnalyst(idea, a, found), ANALYST_DEADLINE_MS);
          });
          done = finishWork({ analyst: a.role, status: "done", findings: out.findings, score: null, headline: out.headline });
        } catch (e) {
          console.error(`[jobs7] ${projectId} ${a.role} failed:`, (e as Error).message);
          done = { analyst: a.role, status: "error", findings: [], score: null, headline: `${a.name} hit a snag.` };
        }
        await update(projectId, (v) => ({ ...v, work: v.work.map((w) => (w.analyst === a.role ? done : w)) }));
        return done;
      }),
    );
    if (work.every((w) => w.status === "error")) throw new Error("No analyst could finish. Please retry.");
    await update(projectId, (v) => ({ ...v, status: "judging" }));
    const findings = work.flatMap((w) => w.findings);
    const judge = await runJudge(idea, roster, findings).catch((e) => {
      console.error(`[jobs7] ${projectId} judge failed, using the rule-based judge:`, (e as Error).message);
      return mockJudge("", findings);
    });
    const report = buildReport(roster, work, judge);
    await update(projectId, (v) => ({ ...v, work, report, status: "done" }));
  } catch (e) {
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
    const plan = await routeSteer(idea, note, v.roster, target);
    const id = `steer-${v.steers.length + 1}`;
    const entry: SteerResult = { id, note: note.slice(0, 280), ack: plan.ack, status: "working", rerun: plan.rerun, hired: [], dropped: [], findings: [], changes: [], report: null, at: new Date().toISOString() };
    await update(projectId, (x) => ({ ...x, steers: [...x.steers, entry] }));
    void runSteer(projectId, idea, note, id, plan).finally(() => steering.delete(projectId));
    return { id, ack: plan.ack, rerun: plan.rerun };
  } catch (e) {
    steering.delete(projectId);
    throw e;
  }
}

async function runSteer(projectId: string, idea: string, note: string, id: string, plan: Awaited<ReturnType<typeof routeSteer>>) {
  try {
    const prev = (await loadV7(projectId))!;
    const prepared = config.mockAi ? preparedSteerFor(idea, note) : null;
    if (prepared) {
      // Demo mode: the prepared, honest variant for the sample (same maths as a real run).
      await new Promise((r) => setTimeout(r, config.mockDelayMs ?? 2400));
      const base = { ...prev, steers: prev.steers.filter((s) => s.id !== id) };
      const { results, steer } = samplesSteer(prepared.sample, base, prepared.steer, note, new Date().toISOString());
      await update(projectId, () => ({ ...results, steers: [...base.steers, { ...steer, id }] }));
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
          fresh[role] = await withDeadline(runAnalyst(idea, a, found, { note, previous, startIndex: start }), ANALYST_DEADLINE_MS);
        }),
      );
    }
    const allAfter = prev.work.flatMap((w) => w.findings).concat(Object.values(fresh).flatMap((f) => f?.findings ?? []));
    const judge = await runJudge(idea, roster, allAfter, note).catch(() => mockJudge("", allAfter));
    const base = { ...prev, steers: prev.steers.filter((s) => s.id !== id) };
    const { results, steer } = applySteer(base, { id, note, plan, fresh, judge, at: new Date().toISOString() });
    await update(projectId, () => ({ ...results, steers: [...base.steers, steer] }));
  } catch (e) {
    console.error(`[jobs7] ${projectId} steer failed:`, (e as Error).message);
    await update(projectId, (v) => ({ ...v, steers: v.steers.map((s) => (s.id === id ? { ...s, status: "error" as const } : s)) }));
  }
}

/** For seeds and tests: a finished sample report (demo data). */
export { sampleResults };
