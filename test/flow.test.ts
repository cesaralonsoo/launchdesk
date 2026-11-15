// Whole mock flow through the Hono app (app.request), no network and no AI cost.
// Run: npx tsx test/flow.test.ts
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "launchdesk-test-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  MOCK_AI: "1",
  MOCK_DELAY_MS: "20",
  DEV_SKIP_PAYMENT: "1",
  BCH_USD_FIXED: "460",
  DATABASE_URL: `file:${join(dir, "test.db")}`,
  MERCHANT_ADDRESS: "bitcoincash:qp9d679zvayvudj65nd9zlgezvjplr8g3vea64wad0",
  PUBLIC_URL: "",
});

const { app } = await import("../server/app.js");
const { migrate, exec } = await import("../server/db.js");
const { resumePending } = await import("../server/jobs.js");
const { config } = await import("../server/config.js");
type Project = import("../server/types.js").Project;
type SiteData = import("../server/types.js").SiteData;

await migrate();
await migrate(); // idempotent

const { encodeCashAddress } = await import("@bitauth/libauth");
const addr = (type: "p2pkh" | "p2sh", fill: number) => {
  const r = encodeCashAddress({ prefix: "bitcoincash", type, payload: new Uint8Array(20).fill(fill) });
  return typeof r === "string" ? r : r.address;
};
const FOUNDER = addr("p2pkh", 9);
const P2SH = addr("p2sh", 9);

async function call<T = any>(method: string, path: string, body?: unknown, host = "http://localhost") {
  const res = await app.request(host + path, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as T };
}

async function pollUntil(id: string, done: (p: Project) => boolean, ms = 10_000): Promise<Project> {
  const until = Date.now() + ms;
  const seen = new Set<string>();
  for (;;) {
    const { json: p } = await call<Project>("GET", `/api/projects/${id}`);
    for (const [d, s] of Object.entries(p.status)) seen.add(`${d}:${s}`);
    if (done(p)) {
      (p as Project & { _seen?: Set<string> })._seen = seen;
      return p;
    }
    if (p.error) throw new Error("job error: " + p.error);
    if (Date.now() > until) throw new Error("timeout: " + JSON.stringify(p.status));
    await new Promise((r) => setTimeout(r, 10));
  }
}

const cfg = await call("GET", "/api/config");
assert.equal(cfg.status, 200);
assert.deepEqual(cfg.json.prices, config.priceCents);
assert.equal(cfg.json.bchUsd, 460);
assert.equal(cfg.json.mockAi, true);

assert.deepEqual((await call("GET", "/api/stats")).json, { ideas: 0, payments: 0, launched: 0, medianMs: { validate: null, build: null } });
assert.equal((await call("POST", "/api/projects", { idea: "short" })).status, 400);
assert.equal((await call("GET", "/api/projects/nope")).status, 404);
assert.equal((await call("GET", "/api/nothing")).status, 404);

// create
const created = await call<{ id: string }>("POST", "/api/projects", { idea: "A specialty coffee kiosk for commuters in Barcelona" });
assert.equal(created.status, 200);
const id = created.json.id;

// no AI without payment; no build before validate
assert.equal((await call("POST", `/api/projects/${id}/run`, { stage: "validate" })).status, 402);
assert.equal((await call("POST", `/api/projects/${id}/pay`, { stage: "build", dev: true, founderAddress: FOUNDER })).status, 409);
// dev payments only from a local host
assert.equal((await call("POST", `/api/projects/${id}/pay`, { stage: "validate", dev: true }, "http://example.com")).status, 402);
// with sample AI data, real payments are refused (nobody pays real money for mock output)
assert.equal((await call("POST", `/api/projects/${id}/quote`, { stage: "validate" })).status, 503);
assert.equal((await call("POST", `/api/projects/${id}/pay`, { stage: "validate", txHex: "00" })).status, 503);

// with real AI configured: a real payment without a quote / tx is rejected, and quotes work
(config as { mockAi: boolean }).mockAi = false;
assert.equal((await call("POST", `/api/projects/${id}/pay`, { stage: "validate", txHex: "00" })).status, 400);
// quote (price is fixed offline)
const quote = await call("POST", `/api/projects/${id}/quote`, { stage: "validate" });
assert.equal(quote.status, 200);
assert.equal(quote.json.tag, `LD1:${id}:validate`);
assert.equal(quote.json.sats, Math.ceil((config.priceCents.validate / 100 / 460) * 1e8));
(config as { mockAi: boolean }).mockAi = true;

// dev pay validate
const paid = await call<Project>("POST", `/api/projects/${id}/pay`, { stage: "validate", dev: true });
assert.equal(paid.status, 200);
assert.match(paid.json.payments.validate!.txid, /^dev-/);
assert.equal(paid.json.payments.validate!.cents, config.priceCents.validate);
// paying twice is a no-op
const again = await call<Project>("POST", `/api/projects/${id}/pay`, { stage: "validate", dev: true });
assert.equal(again.json.payments.validate!.txid, paid.json.payments.validate!.txid);

// run (twice: idempotent)
const [r1, r2] = await Promise.all([
  call("POST", `/api/projects/${id}/run`, { stage: "validate" }),
  call("POST", `/api/projects/${id}/run`, { stage: "validate" }),
]);
assert.deepEqual([r1.json, r2.json], [{ ok: true }, { ok: true }]);

const v = await pollUntil(id, (p) => p.status.sam === "done");
assert.ok(v.results.mia && v.results.leo && v.results.sam);
assert.equal(v.results.leo.signals.length, 5);
assert.equal(v.results.sam.months.length, 12);
assert.equal(v.models.mia, "mock");
assert.ok(v.timings.validate?.finished && v.timings.validate.finished >= v.timings.validate.started);
assert.equal(v.timings.build, undefined);
assert.ok(!v.results.nova);
const seen = (v as Project & { _seen: Set<string> })._seen;
assert.ok(seen.has("sam:queued") || seen.has("sam:working"), "progress is visible while working");
assert.equal((await exec("SELECT COUNT(*) AS n FROM jobs WHERE project_id = ?", [id])).rows[0]!.n, 3);

// v7: the analyst team picked for the idea ran alongside (results.v7), with real sourced findings in demo mode
type V7 = import("../server/v7.js").ResultsV7;
const v7Of = (p: Project) => (p.results as { v7?: V7 }).v7;
const t7 = await pollUntil(id, (p) => v7Of(p)?.status === "done");
const r7 = v7Of(t7)!;
assert.deepEqual(r7.roster.map((a) => a.role), ["competition", "market", "location", "viability"], "coffee idea hires its own team");
assert.ok(r7.report && r7.report.evidence.sourced >= 3, "sourced evidence");
assert.ok(r7.work.every((w) => w.status === "done" && w.findings.length > 0));
assert.equal(r7.report.scalability.cap, 2);
// steer: validation, then 202 → working → done with diff chips, 409 while it runs, 429 after the limit
assert.equal((await call("POST", `/api/projects/${id}/steer`, { note: "" })).status, 400);
assert.equal((await call("POST", `/api/projects/${id}/steer`, { note: "x".repeat(281) })).status, 400);
assert.equal((await call("POST", "/api/projects/nope/steer", { note: "Focus on offices" })).status, 404);
const st1 = await call<{ id: string; ack: string; rerun: string[] }>("POST", `/api/projects/${id}/steer`, { note: "Focus on office workers, not tourists" });
assert.equal(st1.status, 202);
assert.deepEqual(st1.json.rerun, ["location", "viability"]);
assert.ok(st1.json.ack.length > 0);
assert.equal((await call("POST", `/api/projects/${id}/steer`, { note: "And cheaper cups" })).status, 409, "one note at a time");
const s1 = await pollUntil(id, (p) => v7Of(p)?.steers[0]?.status === "done");
const done1 = v7Of(s1)!.steers[0]!;
assert.ok(done1.changes.some((c) => c.what === "score" && c.before === r7.report!.score && c.after === done1.report!.score));
assert.deepEqual(v7Of(s1)!.report, done1.report, "the stored report is the steered one");
for (const note of ["Could we also sell our beans online?", "Make the cups purple"]) {
  assert.equal((await call("POST", `/api/projects/${id}/steer`, { note })).status, 202);
  await pollUntil(id, (p) => v7Of(p)!.steers.every((x) => x.status === "done"));
}
const s3 = v7Of((await call<Project>("GET", `/api/projects/${id}`)).json)!;
assert.equal(s3.steers.length, 3);
assert.deepEqual(s3.steers[2]!.changes, [], "a note demo mode can't research changes nothing");
assert.equal((await call("POST", `/api/projects/${id}/steer`, { note: "One more idea" })).status, 429);

// re-run after done does nothing
assert.equal((await call("POST", `/api/projects/${id}/run`, { stage: "validate" })).status, 200);

// build needs a valid founder address (p2pkh)
assert.equal((await call("POST", `/api/projects/${id}/pay`, { stage: "build", dev: true })).status, 400);
assert.equal((await call("POST", `/api/projects/${id}/pay`, { stage: "build", dev: true, founderAddress: "bitcoincash:nope" })).status, 400);
assert.equal(
  (await call("POST", `/api/projects/${id}/pay`, { stage: "build", dev: true, founderAddress: P2SH })).status,
  400,
  "p2sh is rejected",
);
const paidBuild = await call<Project>("POST", `/api/projects/${id}/pay`, { stage: "build", dev: true, founderAddress: FOUNDER.replace("bitcoincash:", "") });
assert.equal(paidBuild.status, 200);
assert.ok(paidBuild.json.payments.build);

// simulate a server restart in the middle of the build stage: rows left queued/working get resumed
await exec("INSERT INTO jobs (project_id, dept, stage, status, queued_at) VALUES (?, 'nova', 'build', 'working', ?)", [id, Date.now()]);
await resumePending();
assert.equal((await call("POST", `/api/projects/${id}/run`, { stage: "build" })).status, 200);
const b = await pollUntil(id, (p) => p.status.pip === "done");
assert.ok(b.results.nova && b.results.dex && b.results.rae && b.results.pip);
assert.equal(b.results.pip.slug, "pausa");
assert.equal(b.results.pip.url, "/s/pausa");
assert.equal(b.models.pip, "none");
assert.ok(b.timings.build?.finished);
assert.equal(b.error, undefined);

// public site
const site = await call<SiteData>("GET", "/api/sites/pausa");
assert.equal(site.status, 200);
assert.equal(site.json.name, "Pausa");
assert.equal(site.json.founderAddress, FOUNDER);
assert.equal(site.json.palette.length, 4);
assert.equal(site.json.logo.icon, "cup");
assert.equal(site.json.bchUsd, 460);
assert.equal((await call("GET", "/api/sites/unknown")).status, 404);

// a second project with the same brand name gets a different slug
const second = (await call<{ id: string }>("POST", "/api/projects", { idea: "Another specialty coffee kiosk, this time in Madrid" })).json.id;
await call("POST", `/api/projects/${second}/pay`, { stage: "validate", dev: true });
await call("POST", `/api/projects/${second}/run`, { stage: "validate" });
await pollUntil(second, (p) => p.status.sam === "done");
await call("POST", `/api/projects/${second}/pay`, { stage: "build", dev: true, founderAddress: FOUNDER });
await call("POST", `/api/projects/${second}/run`, { stage: "build" });
const b2 = await pollUntil(second, (p) => p.status.pip === "done");
assert.notEqual(b2.results.pip!.slug, "pausa");
assert.match(b2.results.pip!.slug, /^pausa-/);

// retry: once POST /run answers, GET must no longer report the old error (no race with the client poll)
await exec("UPDATE jobs SET status = 'error', error = 'AI timeout' WHERE project_id = ? AND dept = 'rae'", [second]);
await exec("UPDATE jobs SET status = 'queued', json = NULL WHERE project_id = ? AND dept = 'pip'", [second]);
assert.equal((await call<Project>("GET", `/api/projects/${second}`)).json.status.rae, "error");
assert.equal((await call("POST", `/api/projects/${second}/run`, { stage: "build" })).status, 200);
assert.notEqual((await call<Project>("GET", `/api/projects/${second}`)).json.status.rae, "error");
await pollUntil(second, (p) => p.status.pip === "done");

// after a restart, a stage with a failed department is NOT re-run behind the user's back: retry stays user-initiated
await exec("UPDATE jobs SET status = 'error', error = 'AI timeout' WHERE project_id = ? AND dept = 'rae'", [second]);
await exec("UPDATE jobs SET status = 'queued', json = NULL WHERE project_id = ? AND dept = 'pip'", [second]);
await resumePending();
await new Promise((r) => setTimeout(r, 120));
const afterResume = (await call<Project>("GET", `/api/projects/${second}`)).json;
assert.equal(afterResume.status.rae, "error");
assert.equal(afterResume.status.pip, "queued");
assert.equal((await call("POST", `/api/projects/${second}/run`, { stage: "build" })).status, 200);
await pollUntil(second, (p) => p.status.pip === "done");

// a payment attempt that fails never overwrites the founder's payout address
const third = (await call<{ id: string }>("POST", "/api/projects", { idea: "A third coffee kiosk idea, this one in Seville" })).json.id;
await call("POST", `/api/projects/${third}/pay`, { stage: "validate", dev: true });
await call("POST", `/api/projects/${third}/run`, { stage: "validate" });
await pollUntil(third, (p) => p.status.sam === "done");
(config as { mockAi: boolean }).mockAi = false;
assert.equal((await call("POST", `/api/projects/${third}/pay`, { stage: "build", txHex: "00", founderAddress: FOUNDER })).status, 400);
(config as { mockAi: boolean }).mockAi = true;
assert.equal((await exec("SELECT founder_address FROM projects WHERE id = ?", [third])).rows[0]!.founder_address, null);

// stats are real: dev payments never count
assert.deepEqual((await call("GET", "/api/stats")).json, { ideas: 0, payments: 0, launched: 0, medianMs: { validate: null, build: null } });
await exec("UPDATE payments SET txid = 'f'||substr(txid, 5) WHERE project_id = ?", [id]);
assert.deepEqual((await call("GET", "/api/stats")).json, { ideas: 1, payments: 2, launched: 1, medianMs: { validate: null, build: null } });

rmSync(dir, { recursive: true, force: true });
console.log("mock flow: all passed");
