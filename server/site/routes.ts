// WP1 Website routes (a Hono sub-app; WP4 mounts it before the old /s/:slug handler):
//   GET  /s/:slug                     the live site (falls through when this slug has no new-style site)
//   GET  /s/:slug?preview=<template>  the same site in another template, for the picker (noindex)
//   POST /api/sites/:slug/lead        waitlist email (JSON or plain form post)
import { Hono } from "hono";
import { config } from "../config.js";
import { bchUsdCached } from "../price.js";
import { allow, clientIp } from "../ratelimit.js";
import { addLead, countLeads, getSite, type SiteRow } from "./db.js";
import { isTemplate, renderSite, SITE_CSP } from "./render.js";

export interface SiteRoutesOpts {
  /** Override where a site comes from (tests, or WP4 reading the kit directly). Default: the sites table. */
  load?: (slug: string) => Promise<SiteRow | null>;
  /** Real reservations paid for this site (chain/DB). Default 0 = counter hidden. */
  reserved?: (row: SiteRow) => Promise<number>;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,24}$/i;

export function siteRoutes(opts: SiteRoutesOpts = {}) {
  const app = new Hono();
  const load = opts.load ?? getSite;

  app.get("/s/:slug", async (c, next) => {
    const slug = c.req.param("slug");
    if (!SLUG.test(slug)) return next();
    const row = await load(slug).catch(() => null);
    if (!row) return next();
    const preview = c.req.query("preview");
    const template = isTemplate(preview) ? preview : row.template;
    const [reserved, leads] = await Promise.all([opts.reserved?.(row).catch(() => 0) ?? 0, countLeads(slug).catch(() => 0)]);
    const html = renderSite(row.spec, row.kit, template, { reserved, leads, bchUsd: bchUsdCached() }, { slug, origin: config.publicUrl || new URL(c.req.url).origin, preview: Boolean(preview) });
    c.header("Content-Security-Policy", SITE_CSP);
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("Cache-Control", preview ? "no-store" : "public, max-age=30");
    return c.html(html);
  });

  app.post("/api/sites/:slug/lead", async (c) => {
    const slug = c.req.param("slug");
    const wantsJson = (c.req.header("accept") ?? "").includes("application/json") || (c.req.header("content-type") ?? "").includes("application/json");
    const fail = (status: 400 | 404 | 429, error: string) => (wantsJson ? c.json({ ok: false, error }, status) : c.text(error, status));
    if (!SLUG.test(slug)) return fail(404, "Not found");
    if (!allow("site-lead", clientIp(c), 8, 10 * 60_000)) return fail(429, "Too many tries. Please wait a few minutes.");
    let email = "";
    let trap = "";
    try {
      if ((c.req.header("content-type") ?? "").includes("application/json")) {
        const b = (await c.req.json()) as { email?: unknown; website?: unknown };
        email = String(b.email ?? "");
        trap = String(b.website ?? "");
      } else {
        const f = await c.req.parseBody();
        email = String(f.email ?? "");
        trap = String(f.website ?? "");
      }
    } catch {
      return fail(400, "Please enter your email.");
    }
    email = email.trim().toLowerCase();
    if (!EMAIL.test(email)) return fail(400, "Please enter a valid email.");
    const row = await load(slug).catch(() => null);
    if (!row) return fail(404, "Not found");
    if (!trap) await addLead(slug, email); // bots fill the hidden field: pretend it worked
    return wantsJson ? c.json({ ok: true }) : c.redirect(`/s/${slug}?joined=1#offer`, 303);
  });

  return app;
}
