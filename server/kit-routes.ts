// WP4: Launch kit API (mounted by app.ts). Reading is open like GET /api/projects/:id; choices need the owner key.
//   GET  /api/projects/:id/kit              → { kit, slug, siteUrl, running }
//   POST /api/projects/:id/kit/logo         { id }        choose a logo (no AI)
//   POST /api/projects/:id/kit/site         { template }  choose a website design (no AI)
//   POST /api/projects/:id/kit/logo/more                  3 more logo options (one AI draw, once per kit)
import { createHash, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { config } from "./config.js";
import { exec, getProject, getProjectRow, paidFor, type ProjectRow } from "./db.js";
import { chooseLogo, chooseTemplate, defaultDeps, kitRunning, loadKit, moreLogos, safeBrand, siteUrl, type KitDeps } from "./kit.js";
import { safeLogo } from "./site/render.js";
import { allow, clientIp } from "./ratelimit.js";

class KitError extends Error {
  constructor(public status: 400 | 402 | 403 | 404 | 409 | 429, message: string) {
    super(message);
  }
}
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** Same rule as app.ts assertOwner(strict): a project with an owner key only changes with that key. */
function assertOwner(c: Context, row: ProjectRow) {
  if (row.example) throw new KitError(403, "The example is read-only. Start your own idea to make your kit.");
  if (!row.owner_hash) return;
  const key = c.req.header("x-owner-key") ?? "";
  if (!key) throw new KitError(403, "Only the person who started this project can change it. Open it from the browser you used to start it.");
  const a = Buffer.from(sha256(key), "hex");
  const b = Buffer.from(row.owner_hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new KitError(403, "This link can read the project but not change it.");
}
async function body(c: Context): Promise<Record<string, unknown>> {
  try {
    return ((await c.req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}
const asMsg = (e: unknown) => (e as Error).message || "Something went wrong";

export function kitRoutes(deps: KitDeps = defaultDeps) {
  const r = new Hono();
  r.onError((err, c) => (err instanceof KitError ? c.json({ error: err.message }, err.status) : c.json({ error: asMsg(err) }, 400)));

  const owned = async (c: Context) => {
    const row = await getProjectRow(c.req.param("id") ?? "");
    if (!row) throw new KitError(404, "Project not found");
    assertOwner(c, row);
    return row;
  };
  const view = async (id: string, slug: string | null) => {
    const kit = await loadKit(id);
    // The link is always absolute: PUBLIC_URL when set, else the request's own origin (filled by the client).
    return { kit, slug, siteUrl: slug ? siteUrl(slug) : null, running: kitRunning(id) };
  };

  r.get("/api/projects/:id/kit", async (c) => {
    const row = await getProjectRow(c.req.param("id"));
    if (!row) throw new KitError(404, "Project not found");
    const v = await view(row.id, row.slug);
    if (v.siteUrl && !/^https?:/.test(v.siteUrl)) v.siteUrl = new URL(c.req.url).origin + v.siteUrl;
    return c.json(v);
  });

  r.post("/api/projects/:id/kit/logo", async (c) => {
    const row = await owned(c);
    const id = String((await body(c)).id ?? "");
    try {
      return c.json({ kit: await chooseLogo(row.id, id) });
    } catch (e) {
      throw new KitError(409, asMsg(e));
    }
  });

  r.post("/api/projects/:id/kit/site", async (c) => {
    const row = await owned(c);
    const template = String((await body(c)).template ?? "");
    try {
      return c.json({ kit: await chooseTemplate(row.id, template) });
    } catch (e) {
      throw new KitError(409, asMsg(e));
    }
  });

  r.post("/api/projects/:id/kit/logo/more", async (c) => {
    const row = await owned(c);
    // The redraw is part of the paid Launch kit: never without that payment, or after it was refunded.
    const p = await getProject(row.id);
    if (!p || !paidFor(p, "build")) throw new KitError(402, "The Launch kit is not paid, so no new logos can be drawn.");
    if (config.rateLimit.steer && !allow("kit-more", clientIp(c), config.rateLimit.steer, config.rateLimit.windowMs))
      throw new KitError(429, "Too many requests. Please wait a few minutes.");
    try {
      return c.json({ kit: await moreLogos(row.id, deps) });
    } catch (e) {
      throw new KitError(409, asMsg(e));
    }
  });

  // Link previews: the chosen logo as an SVG image (/og/<website-name>.svg). Replaces the old 501 for these paths.
  r.get("/og/:file{[a-z0-9-]+\\.svg}", async (c) => {
    const slug = c.req.param("file").replace(/\.svg$/, "");
    const p = await exec("SELECT id FROM projects WHERE slug = ?", [slug]);
    const id = p.rows[0]?.id;
    const kit = id ? await loadKit(String(id)) : null;
    const logo = kit?.logo?.options.find((o) => o.id === kit.logo!.chosen) ?? kit?.logo?.options[0];
    if (!kit || !logo) return c.notFound();
    const brand = safeBrand(kit.brand);
    const mark = safeLogo(logo.svg, brand.palette);
    if (!mark) return c.notFound();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512"><rect width="64" height="64" fill="${brand.palette.bg}"/>${mark}</svg>`;
    return c.body(svg, 200, { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=300", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" });
  });

  return r;
}
