// Background department jobs. Within a stage departments run one after another; each result is
// saved as soon as it is ready so the office can animate while the rest of the team works.
import { runDept, runMemo, type AiDept } from "./ai.js";
import { config } from "./config.js";
import { exec, getProject, getProjectRow, stageDone } from "./db.js";
import { DEFAULT_FONTS, DEFAULT_WORDMARK, fmtMoney, STAGE_DEPTS, type DexDesign, type NovaBrand, type PipLive, type Project, type RaeLaunch, type Stage, type WorkDept } from "./types.js";

const active = new Map<string, Promise<void>>();
/** One stalled department must never look like a hung office: fail it and let the user retry. */
const DEPT_DEADLINE_MS = 150_000;
/** R18: a failed department is retried once automatically after this pause. */
const AUTO_RETRY_MS = 2_000;

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
    let ok = false;
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      await exec("UPDATE jobs SET attempts = attempts + 1 WHERE project_id = ? AND dept = ?", [projectId, dept]);
      try {
        const out = await withDeadline(runOne(projectId, dept), DEPT_DEADLINE_MS);
        await exec(
          "UPDATE jobs SET status = 'done', json = ?, model = ?, usage = ?, finished_at = ? WHERE project_id = ? AND dept = ?",
          [JSON.stringify(out.json), out.model, out.usage ? JSON.stringify(out.usage) : null, Date.now(), projectId, dept],
        );
        ok = true;
      } catch (e) {
        const msg = (e as Error).message || "Something went wrong";
        console.error(`[jobs] ${projectId} ${dept} (attempt ${attempt}):`, msg);
        if (attempt === 1) {
          await new Promise((r) => setTimeout(r, AUTO_RETRY_MS)); // R18: one automatic retry
          continue;
        }
        await exec("UPDATE jobs SET status = 'error', error = ?, finished_at = ? WHERE project_id = ? AND dept = ?", [msg, Date.now(), projectId, dept]);
      }
    }
    if (!ok) return; // later departments stay queued; retryDept / POST /run continue from here
  }
}

/**
 * R18/F14: re-runs one failed department (and the rest of its stage) for free. Idempotent: a department that is
 * already done or running is left alone. Called by POST /api/projects/:id/retry (WS3) after the owner check.
 */
export async function retryDept(projectId: string, dept: WorkDept): Promise<void> {
  const r = await exec("SELECT stage, status FROM jobs WHERE project_id = ? AND dept = ?", [projectId, dept]);
  const row = r.rows[0];
  if (!row) throw new Error("This department has not started yet.");
  const stage = String(row.stage) as Stage;
  if (row.status === "error") {
    await exec("UPDATE jobs SET status = 'queued', error = NULL WHERE project_id = ? AND dept = ? AND status = 'error'", [projectId, dept]);
  }
  void startStage(projectId, stage);
}

/**
 * R18/F14: skips a failed Nova, Dex or Rae and continues the stage. The skipped department gets a plain,
 * clearly-labelled placeholder built only from earlier results (model "skipped"), so Pip can still publish.
 */
export async function skipDept(projectId: string, dept: "nova" | "dex" | "rae"): Promise<void> {
  if (!["nova", "dex", "rae"].includes(dept)) throw new Error("Only Nova, Dex and Rae can be skipped.");
  const p = await getProject(projectId);
  if (!p) throw new Error("Project not found");
  const st = p.status[dept];
  if (st === "done") return;
  if (st !== "error") throw new Error("Only a department that hit a snag can be skipped.");
  const json = placeholder(p, dept);
  await exec("UPDATE jobs SET status = 'done', json = ?, model = 'skipped', error = NULL, finished_at = ? WHERE project_id = ? AND dept = ?", [
    JSON.stringify(json), Date.now(), projectId, dept,
  ]);
  void startStage(projectId, "build");
}

function placeholder(p: Project, dept: "nova" | "dex" | "rae"): NovaBrand | DexDesign | RaeLaunch {
  const mia = p.results.mia;
  const sam = p.results.sam;
  const title = mia?.title ?? "My business";
  const name = title.split(/\s+/).slice(0, 2).join(" ");
  if (dept === "nova") {
    return {
      names: [{ name, why: "Nova was skipped: this is your working title.", tagline: (mia?.one_liner ?? "").split(/[.,]/)[0]!.slice(0, 48), palette: [
        { name: "Primary", hex: "#1D1D1F" }, { name: "Accent", hex: "#0AC18E" }, { name: "Background", hex: "#F5F5F7" }, { name: "Extra", hex: "#86868B" },
      ] }],
      chosen: 0,
      typography: { ...DEFAULT_FONTS },
      voice: { traits: ["Clear", "Direct"], rules: "Short sentences, real details, one action.", sample: mia?.one_liner ?? "" },
    };
  }
  if (dept === "dex") {
    const brand = p.results.nova?.names[p.results.nova.chosen]?.name ?? name;
    const price = sam?.price.value ?? 0;
    const cur = sam?.currency ?? mia?.market.currency ?? "€";
    return {
      logos: [{ concept: "Wordmark only (Dex was skipped).", icon: "spark", shape: "wordmark", monogram: brand.slice(0, 1).toUpperCase(), wordmark: { ...DEFAULT_WORDMARK, mark: "none" } }],
      landing: {
        headline: mia?.one_liner ?? brand,
        subheadline: mia?.brief.concept ?? "",
        bullets: [],
        cta: price > 0 ? `Pre-order for ${fmtMoney(cur, price, { cents: true })}` : "Pre-order",
        offer: price > 0 ? `Pre-order at ${sam!.price.display}` : "Pre-order now",
        offer_price: price,
        normal_price: null,
        price_hint_usd: Math.max(1, Math.round(price * 1.08 * 10) / 10),
        faq: [],
        where_when: null,
      },
    };
  }
  return { start_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), posts: [], first_posts: [], handle: "@" + name.toLowerCase().replace(/[^a-z0-9]+/g, "") };
}

async function runOne(projectId: string, dept: WorkDept): Promise<{ json: unknown; model: string; usage: unknown }> {
  const p = await getProject(projectId);
  if (!p) throw new Error("Project not found");
  if (dept === "pip") return { json: await publish(projectId), model: "none", usage: null };
  const out = await runDept(dept as AiDept, p.idea, p.results);
  if (dept === "sam") {
    // R7: the memo runs inside Sam's working beat and is stored with Sam's result (normalize() exposes it as
    // results.memo). It never fails Sam: without it the Summary is assembled from the other results.
    try {
      const memo = await runMemo(p.idea, { ...p.results, sam: out.json as NonNullable<Project["results"]["sam"]> });
      return { ...out, json: { ...(out.json as object), memo } };
    } catch (e) {
      console.error(`[jobs] ${projectId} memo skipped:`, (e as Error).message);
    }
  }
  return out;
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
