// site2 photos storage: the bytes of each chosen photo live in our own DB (served same-origin, CSP stays img-src 'self'),
// plus a small per-query cache of search results so repeated ideas do not spend the anonymous Openverse quota
// (20 requests/min, 200/day). Nothing here calls the network.
import { db, exec } from "../db.js";
import type { PhotoMeta, SitePhoto } from "./photos.js";

let ready: Promise<void> | null = null;
export function ensurePhotoTables(): Promise<void> {
  return (ready ??= (async () => {
    await exec(`CREATE TABLE IF NOT EXISTS site_photos (
      project_id TEXT NOT NULL,
      n INTEGER NOT NULL,
      role TEXT NOT NULL,
      mime TEXT NOT NULL,
      bytes BLOB NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      hash TEXT NOT NULL,
      meta_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (project_id, n)
    )`);
    await exec(`CREATE TABLE IF NOT EXISTS photo_search_cache (
      key TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`);
  })().catch((e) => {
    ready = null;
    throw e;
  }));
}

const metaOf = (p: SitePhoto | PhotoMeta): PhotoMeta => {
  const { bytes: _b, ...meta } = p as SitePhoto;
  return meta;
};

/** Replaces all photos of a project (a rebuild picks a fresh set). Zero photos clears them. */
export async function savePhotos(projectId: string, photos: SitePhoto[]): Promise<void> {
  await ensurePhotoTables();
  const now = Date.now();
  await db.batch(
    [
      { sql: `DELETE FROM site_photos WHERE project_id = ?`, args: [projectId] },
      ...photos.map((p) => ({
        sql: `INSERT INTO site_photos (project_id, n, role, mime, bytes, width, height, hash, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [projectId, p.n, p.role, p.mime, p.bytes, p.width, p.height, p.hash, JSON.stringify(metaOf(p)), now],
      })),
    ],
    "write",
  );
}

/** The photos' metadata (no bytes), in n order: for the page builder, the model input and the credit line. */
export async function listPhotos(projectId: string): Promise<PhotoMeta[]> {
  await ensurePhotoTables();
  const r = await exec(`SELECT meta_json FROM site_photos WHERE project_id = ? ORDER BY n`, [projectId]);
  const out: PhotoMeta[] = [];
  for (const row of r.rows) {
    try {
      out.push(JSON.parse(String(row.meta_json)) as PhotoMeta);
    } catch {
      /* a broken row is skipped, never shown */
    }
  }
  return out;
}

export async function getPhotoBytes(projectId: string, n: number): Promise<{ mime: string; bytes: Uint8Array; hash: string } | null> {
  if (!Number.isInteger(n) || n < 1 || n > 12) return null;
  await ensurePhotoTables();
  const r = await exec(`SELECT mime, bytes, hash FROM site_photos WHERE project_id = ? AND n = ?`, [projectId, n]);
  const row = r.rows[0];
  if (!row) return null;
  const raw = row.bytes as unknown;
  const bytes = raw instanceof Uint8Array ? raw : raw instanceof ArrayBuffer ? new Uint8Array(raw) : null;
  if (!bytes || !bytes.length) return null;
  return { mime: String(row.mime), bytes, hash: String(row.hash) };
}

export async function deletePhotos(projectId: string): Promise<void> {
  await ensurePhotoTables();
  await exec(`DELETE FROM site_photos WHERE project_id = ?`, [projectId]);
}

// ───────────────────────────────────────────── search cache (parsed candidates, not raw API responses)
const CACHE_TTL_MS = 7 * 24 * 3600_000;

export async function cacheGet(key: string): Promise<unknown | null> {
  await ensurePhotoTables();
  const r = await exec(`SELECT json, created_at FROM photo_search_cache WHERE key = ?`, [key]);
  const row = r.rows[0];
  if (!row || Date.now() - Number(row.created_at) > CACHE_TTL_MS) return null;
  try {
    return JSON.parse(String(row.json));
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  await ensurePhotoTables();
  await exec(`INSERT INTO photo_search_cache (key, json, created_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, created_at = excluded.created_at`, [key, JSON.stringify(value), Date.now()]);
}
