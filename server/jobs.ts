// Background department jobs. Within a stage departments run one after another; each result is
// saved as soon as it is ready so the office can animate while the rest of the team works.
import { runDept, type AiDept } from "./ai.js";
import { config } from "./config.js";
import { exec, getProject, getProjectRow, stageDone } from "./db.js";
import { STAGE_DEPTS, type PipLive, type Stage, type WorkDept } from "./types.js";

const active = new Map<string, Promise<void>>();
/** One stalled department must never look like a hung office: fail it and let the user retry. */
const DEPT_DEADLINE_MS = 150_000;

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error("This took too long, please retry")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

/** Starts (or resumes) the jobs of a paid stage. Idempotent: a running stage is not started twice. */
export function startStage(projectId: string, stage: Stage): Promise<void> {
  const key = `${projectId}:${stage}`;
  const existing = active.get(key);
  if (existing) return existing;
  const run = runStage(projectId, stage)
    .catch((e) => console.error(`[jobs] ${key}:`, e))
    .finally(() => active.delete(key));
  active.set(key, run);
  return run;
}

export const isRunning = (projectId: string, stage: Stage) => active.has(`${projectId}:${stage}`);

async function prepare(projectId: string, stage: Stage, reset: boolean) {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");
  // Never run AI without a recorded payment.
  if (!project.payments[stage]) throw new Error("stage not paid");
  if (stage === "build" && !stageDone(project, "validate")) throw new Error("validate stage not finished");
  const now = Date.now();
  for (const dept of STAGE_DEPTS[stage]) {
    await exec("INSERT OR IGNORE INTO jobs (project_id, dept, stage, status, queued_at) VALUES (?, ?, ?, 'queued', ?)", [projectId, dept, stage, now]);
  }
  // "working" rows are leftovers from a restart; errors get a retry.
  if (reset) await exec("UPDATE jobs SET status = 'queued', error = NULL WHERE project_id = ? AND stage = ? AND status IN ('working', 'error')", [projectId, stage]);
}

/**
 * Makes a stage ready to run before POST /run answers: creates the job rows and turns a failed
 * department back into "queued", so a client polling right after a retry never sees the old error.
 */
export async function prepareStage(projectId: string, stage: Stage) {
  await prepare(projectId, stage, !isRunning(projectId, stage));
}

async function runStage(projectId: string, stage: Stage) {
  // Nothing else runs this stage in this process (startStage is deduplicated).
  await prepare(projectId, stage, true);

  for (const dept of STAGE_DEPTS[stage]) {
    const cur = await exec("SELECT status FROM jobs WHERE project_id = ? AND dept = ?", [projectId, dept]);
    if (cur.rows[0]?.status === "done") continue;
    await exec("UPDATE jobs SET status = 'working', started_at = ?, error = NULL WHERE project_id = ? AND dept = ?", [Date.now(), projectId, dept]);
    try {
      const out = await withDeadline(runOne(projectId, dept), DEPT_DEADLINE_MS);
      await exec(
        "UPDATE jobs SET status = 'done', json = ?, model = ?, usage = ?, finished_at = ? WHERE project_id = ? AND dept = ?",
        [JSON.stringify(out.json), out.model, out.usage ? JSON.stringify(out.usage) : null, Date.now(), projectId, dept],
      );
    } catch (e) {
      const msg = (e as Error).message || "Something went wrong";
      console.error(`[jobs] ${projectId} ${dept}:`, msg);
      await exec("UPDATE jobs SET status = 'error', error = ?, finished_at = ? WHERE project_id = ? AND dept = ?", [msg, Date.now(), projectId, dept]);
      return; // later departments stay queued; POST /run retries from here
    }
  }
}

async function runOne(projectId: string, dept: WorkDept): Promise<{ json: unknown; model: string; usage: unknown }> {
  const p = await getProject(projectId);
  if (!p) throw new Error("Project not found");
  if (dept === "pip") return { json: await publish(projectId), model: "none", usage: null };
  return runDept(dept as AiDept, p.idea, p.results);
}

/** Pip: no AI. Reserves a unique slug and marks the landing page live. */
async function publish(projectId: string): Promise<PipLive> {
  const p = await getProject(projectId);
  const row = await getProjectRow(projectId);
  if (!p || !row) throw new Error("Project not found");
  if (!row.founder_address) throw new Error("Missing founder address for the pre-order QR");
  const brand = p.results.nova;
  if (!brand || !p.results.dex) throw new Error("Brand and landing page are not ready");

  let slug = row.slug;
  if (!slug) {
    const base = slugify(brand.names[brand.chosen]?.name ?? "") || "launch";
    const candidates = [base, `${base}-${projectId.slice(0, 4).toLowerCase()}`, `${base}-${projectId.toLowerCase()}`];
    for (const c of candidates) {
      const taken = await exec("SELECT 1 FROM projects WHERE slug = ?", [c]);
      if (taken.rows.length) continue;
      try {
        await exec("UPDATE projects SET slug = ? WHERE id = ? AND slug IS NULL", [c, projectId]);
      } catch {
        continue; // lost a race on the unique index
      }
      slug = (await getProjectRow(projectId))?.slug ?? null;
      if (slug) break;
    }
    if (!slug) throw new Error("Could not reserve a page address");
  }
  return { slug, url: `${config.publicUrl}/s/${slug}`, live_at: new Date().toISOString() };
}

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
}

/** After a restart: resume every paid stage that still has queued or interrupted jobs. */
export async function resumePending() {
  // A stage with a failed department waits for the user's Retry: never re-run it behind their back.
  const r = await exec(
    "SELECT DISTINCT j.project_id, j.stage FROM jobs j WHERE j.status IN ('queued', 'working') AND NOT EXISTS (SELECT 1 FROM jobs e WHERE e.project_id = j.project_id AND e.stage = j.stage AND e.status = 'error')",
  );
  for (const row of r.rows) {
    console.log(`[jobs] resuming ${row.project_id} ${row.stage}`);
    void startStage(String(row.project_id), String(row.stage) as Stage);
  }
}
