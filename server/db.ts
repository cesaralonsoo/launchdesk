import { createClient } from "@libsql/client";
import { config, type Stage } from "./config.js";

export const db = createClient({ url: config.databaseUrl, authToken: config.databaseToken });

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
      `CREATE TABLE IF NOT EXISTS results (
        project_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        json TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (project_id, stage)
      )`,
    ],
    "write",
  );
}

export async function getProject(id: string) {
  const p = await db.execute({ sql: "SELECT id, idea, created_at FROM projects WHERE id = ?", args: [id] });
  if (!p.rows.length) return null;
  const pays = await db.execute({ sql: "SELECT stage, txid, sats FROM payments WHERE project_id = ?", args: [id] });
  const res = await db.execute({ sql: "SELECT stage, json FROM results WHERE project_id = ?", args: [id] });
  return {
    id: String(p.rows[0].id),
    idea: String(p.rows[0].idea),
    payments: Object.fromEntries(pays.rows.map((r) => [String(r.stage), { txid: String(r.txid), sats: Number(r.sats) }])),
    results: Object.fromEntries(res.rows.map((r) => [String(r.stage), JSON.parse(String(r.json))])) as Partial<Record<Stage, unknown>>,
  };
}
