// site2: storage of the page designed for one business (the gated HTML fragment from custom.ts). Kept out of the kit
// JSON on purpose: the kit is polled every 1.5 s by the result screen, the fragment is 15-40 KB.
import { exec } from "../db.js";

let ready: Promise<unknown> | null = null;
const ensure = () =>
  (ready ??= exec(
    "CREATE TABLE IF NOT EXISTS site_custom (project_id TEXT PRIMARY KEY, html TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)",
  ).catch((e) => {
    ready = null;
    throw e;
  }));

export async function saveCustom(projectId: string, html: string, version: number): Promise<void> {
  await ensure();
  await exec(
    "INSERT INTO site_custom (project_id, html, version, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET html = excluded.html, version = excluded.version, created_at = excluded.created_at",
    [projectId, html, version, Date.now()],
  );
}

export async function loadCustom(projectId: string): Promise<{ html: string; version: number } | null> {
  await ensure();
  const r = await exec("SELECT html, version FROM site_custom WHERE project_id = ?", [projectId]);
  const row = r.rows[0];
  return row ? { html: String(row.html), version: Number(row.version) } : null;
}

export async function deleteCustom(projectId: string): Promise<void> {
  await ensure();
  await exec("DELETE FROM site_custom WHERE project_id = ?", [projectId]);
}
