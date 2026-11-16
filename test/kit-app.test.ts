// The Launch kit through the real app (app.request): the kit API and the website routes must answer before the
// /api/* catch-all, and a mock kit must give a believable, honest result. Zero spend. Run: npx tsx test/kit-app.test.ts
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "launchdesk-kitapp-"));
Object.assign(process.env, { NODE_ENV: "test", MOCK_AI: "1", MOCK_DELAY_MS: "0", DATABASE_URL: `file:${join(dir, "kitapp.db")}`, PUBLIC_URL: "", PRICE_BUILD_CENTS: "" });

const { app } = await import("../server/app.js");
const { migrate, exec } = await import("../server/db.js");
const kit = await import("../server/kit.js");
const { sampleProject } = await import("../server/mocks.js");
const { sanitize } = await import("../server/ai.js");
await migrate();

async function seed(id: string, key: "bread" | "dog" | "coffee") {
  const p = sampleProject(key, { id, upTo: "validate" }, sanitize as never);
  await exec("INSERT INTO projects (id, idea, created_at, founder_address) VALUES (?, ?, ?, ?)", [id, p.idea, Date.now(), "bitcoincash:qp9d679zvayvudj65nd9zlgezvjplr8g3vea64wad0"]);
  for (const d of ["mia", "leo", "sam"] as const)
    await exec("INSERT INTO jobs (project_id, dept, stage, status, json, queued_at, finished_at) VALUES (?, ?, 'validate', 'done', ?, ?, ?)", [id, d, JSON.stringify(p.results[d]), 1, 2]);
}

// Before the kit exists: the route is reachable (not the catch-all "Not found").
await seed("APPK1", "bread");
const before = await app.request("/api/projects/APPK1/kit");
assert.equal(before.status, 200, "GET /api/projects/:id/kit is mounted before the /api/* catch-all");
assert.equal(((await before.json()) as { kit: unknown }).kit, null);
assert.equal((await app.request("/api/projects/NOPE/kit")).status, 404);

for (const [id, key] of [["APPK1", "bread"], ["APPK2", "dog"]] as const) {
  if (id !== "APPK1") await seed(id, key);
  await kit.runKitStage(id);
  const r = await app.request(`/api/projects/${id}/kit`);
  assert.equal(r.status, 200);
  const v = (await r.json()) as { kit: import("../server/kit-contract.js").Kit; slug: string; siteUrl: string };
  assert.deepEqual(v.kit.status, { brand: "done", logo: "done", site: "done", marketing: "done" }, key);
  assert.match(v.siteUrl, /^https?:\/\/[^/]+\/s\/[a-z0-9-]+$/, "the website link is absolute");
  assert.ok(v.kit.logo!.options.length >= 3, "at least 3 logo options");
  assert.ok(/^#[0-9A-F]{6}$/.test(v.kit.brand.palette.ink), "ink is a checked hex");

  // The live site renders from the kit (not the old page), in every design, without sample sources or other brands.
  const site = await app.request(`/s/${v.slug}`);
  assert.equal(site.status, 200);
  const html = await site.text();
  assert.ok(html.includes(v.kit.brand.name), "site shows the brand");
  assert.ok(!/example\.(org|com)/.test(html), "no sample sources on the site");
  for (const other of ["Pawtrail", "East Austin", "72 horas", "Miga"]) if (other !== v.kit.brand.name) assert.ok(!html.includes(other), `no "${other}" from another fixture`);
  for (const t of ["editorial", "bold", "warm"]) assert.equal((await app.request(`/s/${v.slug}?preview=${t}`)).status, 200);

  // The site's waitlist route is reachable (before the catch-all) and works.
  const lead = await app.request(`/api/sites/${v.slug}/lead`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "a@b.co" }) });
  assert.equal(lead.status, 200, "POST /api/sites/:slug/lead is mounted");
  assert.deepEqual(await lead.json(), { ok: true });

  // A design choice shows on the live site at once.
  const choose = await app.request(`/api/projects/${id}/kit/site`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ template: "bold" }) });
  assert.equal(choose.status, 200);
  assert.equal((await kit.siteRowFor(v.slug))!.template, "bold");

  // The 30-day plan has the real plan shape (the result screen can show it) and no sample sources.
  const plan = v.kit.marketing!.plan as { goal?: unknown; channels?: unknown[]; weeks?: unknown[] };
  assert.ok(plan.goal && Array.isArray(plan.channels) && plan.weeks?.length === 4, "plan shape");
  assert.ok(!JSON.stringify(v.kit.marketing).includes("example.org"));

  const og = await app.request(`/og/${v.slug}.svg`);
  assert.equal(og.status, 200);
}

// The build price is the kit price.
const cfg = (await (await app.request("/api/config")).json()) as { prices: { validate: number; build: number } };
assert.deepEqual(cfg.prices, { validate: 10, build: 50 });

rmSync(dir, { recursive: true, force: true });
console.log("kit-app.test: ok");
process.exit(0);
