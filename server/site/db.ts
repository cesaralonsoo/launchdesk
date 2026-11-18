// WP1 Website storage: the rendered site's inputs (spec + chosen template + brand/logo) and the email waitlist.
// The HTML itself is rendered on request (cheap, and a new logo or template shows at once).
import { exec } from "../db.js";
import type { Kit, SitePhotoMeta, SiteTemplate, StandardTemplate } from "../kit-contract.js";
import type { SiteSpec } from "./spec.js";
import { asSiteSpec } from "./validate.js";

let ready: Promise<void> | null = null;
export function ensureSiteTables(): Promise<void> {
  return (ready ??= (async () => {
    await exec(`CREATE TABLE IF NOT EXISTS sites (
      slug TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      template TEXT NOT NULL,
      spec_json TEXT NOT NULL,
      kit_json TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    )`);
    await exec(`CREATE TABLE IF NOT EXISTS site_leads (
      slug TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (slug, email)
    )`);
  })().catch((e) => {
    ready = null;
    throw e;
  }));
}

export interface SiteRow {
  slug: string;
  projectId: string;
  template: SiteTemplate;
  spec: SiteSpec;
  kit: Pick<Kit, "brand" | "logo">;
  version: number;
  updatedAt: number;
  /** Standard design shown when the custom page cannot be (default: editorial). */
  base?: StandardTemplate;
  /** Real photos for this site (metadata; bytes are served by GET /s/:slug/p/:n). */
  photos?: SitePhotoMeta[];
  /** The stored custom page fragment, read only when a request needs it. */
  customHtml?: () => Promise<string | null>;
  /** A read-only example made by LaunchDesk (notice on top, reserve sheet takes no money). */
  example?: boolean;
}

/** Saves (or replaces) a site. Only brand and logo of the kit are kept. */
export async function saveSite(row: { slug: string; projectId: string; template: SiteTemplate; spec: SiteSpec; kit: Pick<Kit, "brand" | "logo"> }): Promise<void> {
  await ensureSiteTables();
  const kit = JSON.stringify({ brand: row.kit.brand, logo: row.kit.logo });
  await exec(
    `INSERT INTO sites (slug, project_id, template, spec_json, kit_json, version, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(slug) DO UPDATE SET project_id = excluded.project_id, template = excluded.template, spec_json = excluded.spec_json,
       kit_json = excluded.kit_json, version = sites.version + 1, updated_at = excluded.updated_at`,
    [row.slug, row.projectId, row.template, JSON.stringify(row.spec), kit, Date.now()],
  );
}

export async function setSiteTemplate(slug: string, template: SiteTemplate): Promise<boolean> {
  await ensureSiteTables();
  const r = await exec(`UPDATE sites SET template = ?, version = version + 1, updated_at = ? WHERE slug = ?`, [template, Date.now(), slug]);
  return r.rowsAffected > 0;
}

/** New chosen logo (or brand): the page shows it on the next request, no AI call. */
export async function setSiteKit(slug: string, kit: Pick<Kit, "brand" | "logo">): Promise<boolean> {
  await ensureSiteTables();
  const r = await exec(`UPDATE sites SET kit_json = ?, version = version + 1, updated_at = ? WHERE slug = ?`, [JSON.stringify({ brand: kit.brand, logo: kit.logo }), Date.now(), slug]);
  return r.rowsAffected > 0;
}

export async function getSite(slug: string): Promise<SiteRow | null> {
  await ensureSiteTables();
  const r = await exec(`SELECT * FROM sites WHERE slug = ?`, [slug]);
  const row = r.rows[0];
  if (!row) return null;
  try {
    const spec = asSiteSpec(JSON.parse(String(row.spec_json)));
    const kit = JSON.parse(String(row.kit_json)) as Pick<Kit, "brand" | "logo">;
    if (!spec || !kit?.brand) return null;
    return { slug, projectId: String(row.project_id), template: String(row.template) as SiteTemplate, spec, kit, version: Number(row.version), updatedAt: Number(row.updated_at) };
  } catch {
    return null;
  }
}

/** true when new, false when the email was already on the list. */
export async function addLead(slug: string, email: string): Promise<boolean> {
  await ensureSiteTables();
  const r = await exec(`INSERT OR IGNORE INTO site_leads (slug, email, created_at) VALUES (?, ?, ?)`, [slug, email, Date.now()]);
  return r.rowsAffected > 0;
}

export async function countLeads(slug: string): Promise<number> {
  await ensureSiteTables();
  const r = await exec(`SELECT COUNT(*) AS n FROM site_leads WHERE slug = ?`, [slug]);
  return Number(r.rows[0]?.n ?? 0);
}

export async function listLeads(slug: string): Promise<Array<{ email: string; createdAt: number }>> {
  await ensureSiteTables();
  const r = await exec(`SELECT email, created_at FROM site_leads WHERE slug = ? ORDER BY created_at DESC LIMIT 1000`, [slug]);
  return r.rows.map((x) => ({ email: String(x.email), createdAt: Number(x.created_at) }));
}
