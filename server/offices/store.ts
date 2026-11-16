// Storage for "Your offices": one row per office space (a brain + its owner) and one row per task in its inbox.
// Tables are created on first use (additive, no change to server/db.ts).
import { exec } from "../db.js";
import type { Brain, FollowUp, InboxItem, OfficeId, TaskId, TaskResult, TaskStatus } from "./types.js";

let ready: Promise<void> | null = null;
export function ensureTables(): Promise<void> {
  return (ready ??= (async () => {
    await exec(`CREATE TABLE IF NOT EXISTS office_spaces (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      project_id TEXT,
      owner_hash TEXT,
      brain TEXT NOT NULL,
      questions TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    )`);
    await exec("CREATE UNIQUE INDEX IF NOT EXISTS office_spaces_project ON office_spaces(project_id) WHERE project_id IS NOT NULL");
    await exec(`CREATE TABLE IF NOT EXISTS office_tasks (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      task TEXT NOT NULL,
      office TEXT NOT NULL,
      title TEXT NOT NULL,
      input TEXT,
      status TEXT NOT NULL,
      quoted_cents INTEGER NOT NULL,
      sats INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL,
      used_cents INTEGER,
      usd REAL,
      txid TEXT UNIQUE,
      paid_sats INTEGER,
      result TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      finished_at INTEGER
    )`);
    await exec("CREATE INDEX IF NOT EXISTS office_tasks_space ON office_tasks(space_id, created_at)");
  })().catch((e) => {
    ready = null;
    throw e;
  }));
}

export interface SpaceRow {
  id: string;
  source: "report" | "brought";
  projectId: string | null;
  ownerHash: string | null;
  brain: Brain;
  questions: FollowUp[];
}

const toSpace = (r: Record<string, unknown>): SpaceRow => ({
  id: String(r.id),
  source: r.source === "report" ? "report" : "brought",
  projectId: r.project_id == null ? null : String(r.project_id),
  ownerHash: r.owner_hash == null ? null : String(r.owner_hash),
  brain: JSON.parse(String(r.brain)) as Brain,
  questions: JSON.parse(String(r.questions ?? "[]")) as FollowUp[],
});

export async function getSpace(id: string): Promise<SpaceRow | null> {
  await ensureTables();
  const r = await exec("SELECT * FROM office_spaces WHERE id = ?", [id]);
  return r.rows[0] ? toSpace(r.rows[0] as Record<string, unknown>) : null;
}
export async function spaceForProject(projectId: string): Promise<SpaceRow | null> {
  await ensureTables();
  const r = await exec("SELECT * FROM office_spaces WHERE project_id = ?", [projectId]);
  return r.rows[0] ? toSpace(r.rows[0] as Record<string, unknown>) : null;
}
export async function insertSpace(s: SpaceRow) {
  await ensureTables();
  await exec("INSERT INTO office_spaces (id, source, project_id, owner_hash, brain, questions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    s.id,
    s.source,
    s.projectId,
    s.ownerHash,
    JSON.stringify(s.brain),
    JSON.stringify(s.questions),
    Date.now(),
  ]);
}
export async function updateBrain(id: string, brain: Brain, questions: FollowUp[]) {
  await exec("UPDATE office_spaces SET brain = ?, questions = ? WHERE id = ?", [JSON.stringify(brain), JSON.stringify(questions), id]);
}

export interface TaskRow {
  id: string;
  spaceId: string;
  task: TaskId;
  office: OfficeId;
  title: string;
  input: string;
  status: TaskStatus;
  quotedCents: number;
  sats: number;
  expiresAt: number;
  usedCents: number | null;
  usd: number | null;
  txid: string | null;
  paidSats: number | null;
  result: TaskResult | null;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
}
const num = (v: unknown) => (v == null ? null : Number(v));
const toTask = (r: Record<string, unknown>): TaskRow => ({
  id: String(r.id),
  spaceId: String(r.space_id),
  task: String(r.task) as TaskId,
  office: String(r.office) as OfficeId,
  title: String(r.title),
  input: String(r.input ?? ""),
  status: String(r.status) as TaskStatus,
  quotedCents: Number(r.quoted_cents),
  sats: Number(r.sats),
  expiresAt: Number(r.expires_at),
  usedCents: num(r.used_cents),
  usd: num(r.usd),
  txid: r.txid == null ? null : String(r.txid),
  paidSats: num(r.paid_sats),
  result: r.result == null ? null : (JSON.parse(String(r.result)) as TaskResult),
  error: r.error == null ? null : String(r.error),
  createdAt: Number(r.created_at),
  finishedAt: num(r.finished_at),
});

export async function insertTask(t: Pick<TaskRow, "id" | "spaceId" | "task" | "office" | "title" | "input" | "quotedCents" | "sats" | "expiresAt">) {
  await exec(
    "INSERT INTO office_tasks (id, space_id, task, office, title, input, status, quoted_cents, sats, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 'quoted', ?, ?, ?, ?)",
    [t.id, t.spaceId, t.task, t.office, t.title, t.input || null, t.quotedCents, t.sats, t.expiresAt, Date.now()],
  );
}
export async function getTask(spaceId: string, id: string): Promise<TaskRow | null> {
  const r = await exec("SELECT * FROM office_tasks WHERE id = ? AND space_id = ?", [id, spaceId]);
  return r.rows[0] ? toTask(r.rows[0] as Record<string, unknown>) : null;
}
export async function listTasks(spaceId: string): Promise<TaskRow[]> {
  await ensureTables();
  const r = await exec("SELECT * FROM office_tasks WHERE space_id = ? AND status != 'quoted' ORDER BY created_at DESC LIMIT 50", [spaceId]);
  return r.rows.map((x) => toTask(x as Record<string, unknown>));
}
export async function txidUsed(txid: string): Promise<boolean> {
  const r = await exec("SELECT id FROM office_tasks WHERE txid = ?", [txid]);
  return r.rows.length > 0;
}
/** Marks a quoted task paid and working. Returns false when it was not in "quoted" any more (double click). */
export async function markPaid(id: string, txid: string, paidSats: number): Promise<boolean> {
  const r = await exec("UPDATE office_tasks SET status = 'working', txid = ?, paid_sats = ? WHERE id = ? AND status = 'quoted'", [txid, paidSats, id]);
  return r.rowsAffected > 0;
}
export async function finishTask(id: string, out: { result: TaskResult; usd: number; usedCents: number }) {
  await exec("UPDATE office_tasks SET status = 'done', result = ?, usd = ?, used_cents = ?, finished_at = ? WHERE id = ?", [
    JSON.stringify(out.result),
    out.usd,
    out.usedCents,
    Date.now(),
    id,
  ]);
}
export async function failTask(id: string, error: string) {
  await exec("UPDATE office_tasks SET status = 'error', error = ?, used_cents = 0, finished_at = ? WHERE id = ?", [error.slice(0, 300), Date.now(), id]);
}

export const toInbox = (t: TaskRow): InboxItem => ({
  id: t.id,
  task: t.task,
  office: t.office,
  title: t.title,
  status: t.status,
  quotedCents: t.quotedCents,
  ...(t.usedCents != null ? { usedCents: t.usedCents } : {}),
  ...(t.txid ? { paid: { txid: t.txid, sats: t.paidSats ?? 0, test: t.txid.startsWith("test-") } } : {}),
  ...(t.result ? { result: t.result } : {}),
  ...(t.error ? { error: t.error } : {}),
  createdAt: t.createdAt,
  ...(t.finishedAt ? { finishedAt: t.finishedAt } : {}),
});
