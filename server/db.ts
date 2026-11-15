import { createClient, type InValue } from "@libsql/client";
import { config } from "./config.js";
import { STAGE_DEPTS, normalize, type DeptResults, type DeptStatus, type Project, type Stage, type WorkDept } from "./types.js";

export const db = createClient({ url: config.databaseUrl, authToken: config.databaseToken });

/** Creates the v2 schema. Old v1 tables (results) are left alone and ignored. */
export async function migrate() {
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        idea TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS quotes (
        project_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        sats INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (project_id, stage)
      )`,
      `CREATE TABLE IF NOT EXISTS payments (
        txid TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        sats INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (project_id, stage)
      )`,
      // One row per department job. Results are saved as soon as each department is done.
      `CREATE TABLE IF NOT EXISTS jobs (
        project_id TEXT NOT NULL,
        dept TEXT NOT NULL,
        stage TEXT NOT NULL,
        status TEXT NOT NULL,
        json TEXT,
        model TEXT,
        error TEXT,
        usage TEXT,
        queued_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER,
        PRIMARY KEY (project_id, dept)
      )`,
    ],
    "write",
  );
  // v1 -> v2 column additions (ALTER is idempotent via the column check).
  await addColumn("projects", "founder_address", "TEXT");
  await addColumn("projects", "slug", "TEXT");
  await addColumn("payments", "cents", "INTEGER NOT NULL DEFAULT 0");
  await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS projects_slug ON projects(slug) WHERE slug IS NOT NULL");
  // v4 (contracts-v4.md §5): additive only, existing rows keep working.
  await addColumn("projects", "owner_hash", "TEXT"); // F3: sha256 of the owner key; NULL = legacy, open
  await addColumn("projects", "share_id", "TEXT"); // F5: read-only link id
  await addColumn("projects", "example", "INTEGER NOT NULL DEFAULT 0"); // F2: read-only seed
  await addColumn("quotes", "bch_usd", "REAL"); // F10/R22: rate used for the quote
  await addColumn("quotes", "qr_sats", "INTEGER"); // F10: unique amount for the plain QR (BIP21) path
  await addColumn("jobs", "attempts", "INTEGER NOT NULL DEFAULT 0"); // R18
  await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS projects_share ON projects(share_id) WHERE share_id IS NOT NULL");
  // v7 (WS-INTEL): the analyst team's results (ResultsV7) and the shared web research they cite, one row per project.
  await db.execute("CREATE TABLE IF NOT EXISTS results_v7 (project_id TEXT PRIMARY KEY, json TEXT NOT NULL, research TEXT, updated_at INTEGER NOT NULL)");
}

async function addColumn(table: string, column: string, type: string) {
  const info = await db.execute(`PRAGMA table_info(${table})`);
  if (!info.rows.some((r) => r.name === column)) await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

export async function exec(sql: string, args: InValue[] = []) {
  return db.execute({ sql, args });
}

export type ProjectRow = {
  id: string;
  idea: string;
  created_at: number;
  founder_address: string | null;
  slug: string | null;
  owner_hash: string | null;
  share_id: string | null;
  example: boolean;
};

export async function getProjectRow(id: string): Promise<ProjectRow | null> {
  const r = await exec("SELECT id, idea, created_at, founder_address, slug, owner_hash, share_id, example FROM projects WHERE id = ?", [id]);
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    idea: String(row.idea),
    created_at: Number(row.created_at),
    founder_address: row.founder_address == null ? null : String(row.founder_address),
    slug: row.slug == null ? null : String(row.slug),
    owner_hash: row.owner_hash == null ? null : String(row.owner_hash),
    share_id: row.share_id == null ? null : String(row.share_id),
    example: Number(row.example ?? 0) === 1,
  };
}

const DEPT_STAGE = Object.fromEntries(
  (Object.entries(STAGE_DEPTS) as Array<[Stage, WorkDept[]]>).flatMap(([s, ds]) => ds.map((d) => [d, s])),
) as Record<WorkDept, Stage>;
export const stageOf = (d: WorkDept) => DEPT_STAGE[d];

/** Assembles the public Project shape (see types.ts). */
export async function getProject(id: string): Promise<Project | null> {
  const row = await getProjectRow(id);
  if (!row) return null;
  const [pays, jobs, v7] = await Promise.all([
    exec("SELECT stage, txid, sats, cents, created_at FROM payments WHERE project_id = ?", [id]),
    exec("SELECT dept, stage, status, json, model, error, queued_at, finished_at, attempts FROM jobs WHERE project_id = ?", [id]),
    exec("SELECT json FROM results_v7 WHERE project_id = ?", [id]),
  ]);

  const project: Project = {
    id: row.id,
    idea: row.idea,
    created_at: row.created_at,
    payments: {},
    status: {},
    results: {},
    timings: {},
    models: {},
  };
  if (row.share_id) project.share_id = row.share_id;
  if (row.example) project.example = true;
  for (const p of pays.rows) {
    project.payments[String(p.stage) as Stage] = {
      txid: String(p.txid),
      sats: Number(p.sats),
      cents: Number(p.cents),
      at: Number(p.created_at),
    };
  }
  const order = (d: WorkDept) => (STAGE_DEPTS.validate as WorkDept[]).concat(STAGE_DEPTS.build).indexOf(d);
  const rows = [...jobs.rows].sort((a, b) => order(String(a.dept) as WorkDept) - order(String(b.dept) as WorkDept));
  for (const j of rows) {
    const dept = String(j.dept) as WorkDept;
    project.status[dept] = String(j.status) as DeptStatus;
    if (j.model) project.models[dept] = String(j.model);
    if (j.status === "done" && j.json) (project.results as Record<string, unknown>)[dept] = JSON.parse(String(j.json));
    if (j.status === "error" && !project.error) project.error = String(j.error ?? "Something went wrong");
    if (j.status === "error") (project.errors ??= {})[dept] = humanError(dept);
    const tries = Number(j.attempts ?? 0);
    if (tries > 0) (project.attempts ??= {})[dept] = tries;
  }
  for (const stage of Object.keys(STAGE_DEPTS) as Stage[]) {
    const js = rows.filter((j) => j.stage === stage);
    if (!js.length) continue;
    const started = Math.min(...js.map((j) => Number(j.queued_at)));
    const allDone = js.length === STAGE_DEPTS[stage].length && js.every((j) => j.status === "done");
    project.timings[stage] = allDone ? { started, finished: Math.max(...js.map((j) => Number(j.finished_at))) } : { started };
  }
  // v7: the analyst team's results sit next to the v4 fields (web/src ignores them).
  if (v7.rows[0]?.json) (project.results as Record<string, unknown>).v7 = JSON.parse(String(v7.rows[0].json));
  // v3 rows keep working: upgrade old result shapes on read (additive, nothing is rewritten in the DB).
  return normalize(project);
}

const NAMES: Record<WorkDept, string> = { mia: "Mia", leo: "Leo", sam: "Sam", nova: "Nova", dex: "Dex", rae: "Rae", pip: "Pip" };
/** R18: the human message shown in the Now card and team row (the raw error stays in the jobs table). */
const humanError = (d: WorkDept) => `${NAMES[d]} hit a snag.`;

export const stageDone = (p: Project, stage: Stage) => STAGE_DEPTS[stage].every((d) => p.status[d] === "done");
export type { DeptResults };
