// WP4: Launch kit orchestrator + routes, zero spend (injected parts, mock AI). Run: npx tsx test/kit.test.ts
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "launchdesk-kit-"));
Object.assign(process.env, { NODE_ENV: "test", MOCK_AI: "1", MOCK_DELAY_MS: "0", DATABASE_URL: `file:${join(dir, "kit.db")}`, KIT_SPEND_CAP_CENTS: "45", PRICE_BUILD_CENTS: "" /* .env still says 20: test the code default */ });

const { migrate, exec } = await import("../server/db.js");
const kit = await import("../server/kit.js");
const { kitRoutes } = await import("../server/kit-routes.js");
const { sampleProject } = await import("../server/mocks.js");
const { config } = await import("../server/config.js");
await migrate();
type Deps = import("../server/kit.js").KitDeps;
type LogoOption = import("../server/kit-contract.js").LogoOption;

assert.equal(config.priceCents.build, 50, "the Launch kit costs 50 cents");
assert.equal(kit.KIT_CAP_USD, 0.45);

// A validated sample project (mock results) stored as job rows.
async function seed(id: string) {
  const { sanitize } = await import("../server/ai.js");
  const p = sampleProject("coffee", { id, upTo: "validate" }, sanitize as never);
  await exec("INSERT INTO projects (id, idea, created_at, founder_address) VALUES (?, ?, ?, ?)", [id, p.idea, Date.now(), "bitcoincash:qp9d679zvayvudj65nd9zlgezvjplr8g3vea64wad0"]);
  for (const d of ["mia", "leo", "sam"] as const)
    await exec("INSERT INTO jobs (project_id, dept, stage, status, json, queued_at, finished_at) VALUES (?, ?, 'validate', 'done', ?, ?, ?)", [id, d, JSON.stringify(p.results[d]), 1, 2]);
  return p;
}
let INK = "#111111"; // the brand's own ink, so the og image (allowlist lint, palette colours only) accepts it
const logo = (id: string, family: LogoOption["family"]): LogoOption => ({ id, family, idea: `idea ${id}`, svg: `<circle cx="32" cy="32" r="24" fill="${INK}"/>` });
const calls: string[] = [];
const good: Deps = {
  brand: async (p) => (calls.push("brand"), (await kit.defaultDeps.brand(p))),
  logos: async (b, avoid) => (calls.push("logos"), (INK = b.palette.ink), avoid.length ? [logo("n1", "literal"), logo("n2", "monogram"), logo("n3", "geometric")] : [logo("a", "literal"), logo("b", "literal"), logo("c", "monogram"), logo("d", "geometric")]),
  site: async (i) => (calls.push("site"), { hero: { title: i.brand.name } }),
  marketing: async () => (calls.push("marketing"), { plan: { goal: "20 pre-orders" }, sources: [{ n: 1, url: "https://example.org", title: "x" }] }),
};

// ── happy path: brand then 3 parts, saved, nova job written, slug reserved
await seed("K1");
const k1 = await kit.runKit("K1", good);
assert.deepEqual(k1.status, { brand: "done", logo: "done", site: "done", marketing: "done" });
assert.equal(calls[0], "brand");
assert.equal(k1.logo!.options.length, 4, "every survivor is kept, so Show 3 more needs no new drawing");
assert.deepEqual(k1.logo!.options.slice(0, 3).map((o) => o.family), ["literal", "monogram", "geometric"], "first page: one per family");
assert.equal(k1.logo!.fallback, false);
assert.ok(k1.brand.name && /^#[0-9A-F]{6}$/i.test(k1.brand.palette.primary));
assert.equal((await kit.loadKit("K1"))!.marketing!.sources.length, 1);
const row = (await exec("SELECT slug FROM projects WHERE id = 'K1'")).rows[0]!;
assert.ok(String(row.slug).length > 1, "website address reserved");

// ── idempotent: a second run does no new work
calls.length = 0;
await kit.runKit("K1", good);
assert.deepEqual(calls, []);

// ── degrade: every part fails twice → fallbacks, never an error
await seed("K2");
let tries = 0;
const bad: Deps = { brand: good.brand, logos: async () => (tries++, []), site: async () => { tries++; throw new Error("boom"); }, marketing: async () => { tries++; throw new Error("boom"); } };
const k2 = await kit.runKit("K2", bad);
assert.deepEqual(k2.status, { brand: "done", logo: "done", site: "done", marketing: "done" });
assert.equal(k2.logo!.fallback, true);
assert.equal(k2.logo!.options.length, 3);
assert.equal(tries, 6, "each part is retried exactly once");
for (const o of k2.logo!.options) assert.ok(!/<script|on\w+=/i.test(o.svg));

// ── modules not installed (default deps): straight to fallback, no crash
await seed("K3");
const k3 = await kit.runKit("K3", { ...kit.defaultDeps });
assert.equal(k3.status.logo, "done");
assert.equal(k3.status.site, "done");

// ── site2: the designed page. Rejected → status error, the standard design stays; a hand pick is never overridden.
await seed("K5");
const rejecting: Deps = { ...good, photos: async () => [], custom: async () => ({ html: null, usd: 0.1, issues: ["invented number"] }) };
const k5 = await kit.runKit("K5", rejecting);
assert.equal(k5.site!.custom?.status, "error");
assert.equal(k5.site!.template, k5.site!.base, "the standard design stays live");
const r5 = await kit.siteRowFor((await exec("SELECT slug FROM projects WHERE id = 'K5'")).rows[0]!.slug as string);
assert.equal(r5!.customHtml, undefined);
calls.length = 0;
await kit.runKit("K5", { ...rejecting, custom: async () => (calls.push("custom"), { html: "<style></style>", usd: 0, issues: [] }) });
assert.deepEqual(calls, [], "a rejected designed page is not paid for again on a resumed kit");
await assert.rejects(kit.chooseTemplate("K5", "custom"), /not ready/);

await seed("K6");
let release: () => void = () => {};
const gate = new Promise<void>((r) => (release = r));
const slow: Deps = { ...good, photos: async () => [], custom: async () => (await gate, { html: '<style>p{color:red}</style><header data-hero><h1>x</h1></header>', usd: 0.09, issues: [] }) };
const run6 = kit.runKit("K6", slow);
for (let i = 0; i < 100 && (await kit.loadKit("K6"))?.site?.custom?.status !== "working"; i++) await new Promise((r) => setTimeout(r, 20));
await kit.chooseTemplate("K6", "warm"); // the founder picks while the page is still being designed
release();
const k6 = await run6;
assert.equal(k6.site!.custom?.status, "done");
assert.equal(k6.site!.template, "warm", "the hand pick wins over the auto switch");
assert.equal((await kit.loadKit("K6"))!.site!.template, "warm");
assert.equal((await kit.loadKit("K6"))!.site!.custom!.usd, 0.09);
assert.ok(kit.KIT_EST.custom > 0 && kit.SITE_DESIGNS[0] === "custom");

// ── spend guard: the cost.ts Budget refuses an estimate past the cap
const { Budget, BudgetError } = await import("../server/cost.js");
assert.throws(() => new Budget(0.05).reserve("logo", 0.09), BudgetError);
const total = Object.values(kit.KIT_EST).reduce((a, b) => a + b, 0);
assert.ok(total <= kit.KIT_CAP_USD, "one full kit fits the cap");

// ── stage hook marks the old build departments done
await seed("K4");
await kit.runKitStage("K4", good);
const st = (await exec("SELECT dept, status FROM jobs WHERE project_id = 'K4' AND stage = 'build' ORDER BY dept")).rows.map((r) => `${r.dept}:${r.status}`);
assert.deepEqual(st, ["dex:done", "nova:done", "pip:done", "rae:done"]);

// ── routes
const app = kitRoutes(good);
const req = (path: string, init?: RequestInit) => app.request(`http://localhost${path}`, init);
const post = (path: string, b: unknown, key?: string) => req(path, { method: "POST", headers: { "content-type": "application/json", ...(key ? { "x-owner-key": key } : {}) }, body: JSON.stringify(b) });
const g = await req("/api/projects/K1/kit");
assert.equal(g.status, 200);
const gj = (await g.json()) as { kit: { status: object }; siteUrl: string };
assert.match(gj.siteUrl, /^http:\/\/localhost\/s\/[a-z0-9-]+$/, "absolute link");
assert.equal((await req("/api/projects/NOPE/kit")).status, 404);

assert.equal((await post("/api/projects/K1/kit/logo", { id: k1.logo!.options[1]!.id })).status, 200);
assert.equal((await kit.loadKit("K1"))!.logo!.chosen, k1.logo!.options[1]!.id);
assert.equal((await post("/api/projects/K1/kit/logo", { id: "zzz" })).status, 409);
assert.equal((await post("/api/projects/K1/kit/site", { template: "warm" })).status, 200);
assert.equal((await kit.loadKit("K1"))!.site!.template, "warm");
assert.equal((await post("/api/projects/K1/kit/site", { template: "neon" })).status, 409);
// The redraw is part of the paid kit: refused (402, nothing drawn) until the build payment exists.
calls.length = 0;
assert.equal((await post("/api/projects/K1/kit/logo/more", {})).status, 402, "no build payment, no redraw");
assert.deepEqual(calls, [], "no logo drawing without a payment");
await exec("INSERT INTO payments (txid, project_id, stage, sats, cents, created_at) VALUES ('dev-k1', 'K1', 'build', 0, 50, ?)", [Date.now()]);
const more = await post("/api/projects/K1/kit/logo/more", {});
assert.equal(more.status, 200);
assert.equal((await kit.loadKit("K1"))!.logo!.options.length, 7);
assert.equal((await post("/api/projects/K1/kit/logo/more", {})).status, 409, "one new drawing per kit");

// owner key: a project with an owner hash refuses changes without the key
const { createHash } = await import("node:crypto");
await exec("UPDATE projects SET owner_hash = ? WHERE id = 'K2'", [createHash("sha256").update("secret").digest("hex")]);
assert.equal((await post("/api/projects/K2/kit/site", { template: "bold" })).status, 403);
assert.equal((await post("/api/projects/K2/kit/site", { template: "bold" }, "wrong")).status, 403);
assert.equal((await post("/api/projects/K2/kit/site", { template: "bold" }, "secret")).status, 200);

// og logo image
const slug = String(row.slug);
const og = await req(`/og/${slug}.svg`);
assert.equal(og.status, 200);
assert.match(og.headers.get("content-type") ?? "", /svg/);
assert.equal((await req("/og/nope.svg")).status, 404);

// digest: stats only with a source link
const d = kit.digestOf((await (await import("../server/db.js")).getProject("K1"))!, null);
for (const s of d.stats) assert.match(s.sourceUrl, /^https?:/);

rmSync(dir, { recursive: true, force: true });
console.log("kit.test: all passed");
