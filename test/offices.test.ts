// "Your offices" through the real app (app.request), mock AI only: zero spend, no network, nothing broadcast.
// (A) from a created project, (B) bring a project you already run + follow-up questions, quote before run,
// test payment, result in the inbox with "used X¢ of Y¢ quoted". Run: npx tsx test/offices.test.ts
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "launchdesk-offices-"));
Object.assign(process.env, { NODE_ENV: "test", MOCK_AI: "1", MOCK_DELAY_MS: "0", DATABASE_URL: `file:${join(dir, "offices.db")}`, BCH_USD_FIXED: "400" });

const { app } = await import("../server/app.js");
const { migrate, exec } = await import("../server/db.js");
const { sampleProject } = await import("../server/mocks.js");
const { sanitize } = await import("../server/ai.js");
const { createHash } = await import("node:crypto");
const { priceCents, chargeCents, OFFICES, PLANS, TASKS } = await import("../server/offices/catalog.js");
const { fixtureResult, fixtureKey, DEMO_FORMS } = await import("../server/offices/fixtures.js");
const { brainFromForm, mockQuestions, readForm, brainText } = await import("../server/offices/brain.js");
const { parseResult } = await import("../server/offices/run.js");
type View = import("../server/offices/types.js").OfficesView;
type Quote = import("../server/offices/types.js").TaskQuote;
await migrate();

const json = (b: unknown, key?: string) => ({ method: "POST", headers: { "content-type": "application/json", ...(key ? { "x-owner-key": key } : {}) }, body: JSON.stringify(b) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── pricing: real × 3, rounded up, min 2¢; charge never above the quote
assert.equal(priceCents(0.03), 9);
assert.equal(priceCents(0.005), 2);
assert.equal(TASKS.posts.cents, 9);
assert.equal(TASKS.competitors.cents, 20);
assert.equal(TASKS.prices.cents, 30);
assert.equal(chargeCents(PLANS.posts.mockUsd, 9), 4, "posts: used 4¢ of 9¢");
assert.equal(chargeCents(1, 9), 9, "never above the quote");
assert.deepEqual(OFFICES.map((o) => o.id), ["marketing", "research", "money", "customers"]);
for (const o of OFFICES) assert.ok(o.tasks.length >= 1 && o.tasks.length <= 2, o.id);

// ── fixtures for every task, for both demo businesses
for (const f of DEMO_FORMS) {
  const b = brainFromForm(readForm({ ...f }));
  assert.notEqual(fixtureKey(b), "other", f.label);
  for (const t of Object.keys(TASKS) as Array<keyof typeof TASKS>) {
    const r = fixtureResult(t, b);
    assert.ok(r.title && r.items.length >= 3, `${f.label} ${t}`);
  }
}
assert.equal(brainFromForm(readForm({ ...DEMO_FORMS[0] })).name, "Miga");
assert.throws(() => readForm({ what: "x", where: "here" }), /sentence/);
assert.throws(() => readForm({ what: "A shop selling plants", where: "" }), /where/);
assert.ok(mockQuestions(brainFromForm(readForm({ what: "A plant shop", where: "Seville" }))).length <= 3);
assert.equal(brainText(brainFromForm(readForm({ ...DEMO_FORMS[1] }))), brainText(brainFromForm(readForm({ ...DEMO_FORMS[1] }))), "the cached block is stable");
assert.equal(parseResult('ok {"title":"T","items":[{"text":"a"},{"text":""}]}', "x").items.length, 1);
assert.throws(() => parseResult("no json", "x"));

async function untilDone(sid: string, key: string, id: string): Promise<View> {
  for (let i = 0; i < 50; i++) {
    const v = (await (await app.request(`/api/offices/${sid}`, { headers: { "x-owner-key": key } })).json()) as View;
    if (v.inbox.find((x) => x.id === id)?.status === "done") return v;
    await sleep(20);
  }
  throw new Error("task did not finish");
}

// ── (B) bring a project you already run
const br = await app.request("/api/offices/bring", json({ what: DEMO_FORMS[0].what, where: DEMO_FORMS[0].where }));
assert.equal(br.status, 200);
const { view: bv, key } = (await br.json()) as { view: View; key: string };
assert.ok(key.length > 10);
assert.equal(bv.source, "brought");
assert.equal(bv.sample, true);
assert.ok(bv.questions.length >= 1 && bv.questions.length <= 3, "1 to 3 follow-up questions");
assert.equal((await app.request(`/api/offices/${bv.id}`)).status, 403, "no key, no offices");
assert.equal((await app.request(`/api/offices/${bv.id}`, { headers: { "x-owner-key": "wrong" } })).status, 403);
const answered = (await (await app.request(`/api/offices/${bv.id}/answers`, json({ answers: { customer: "Neighbours on the way to work", price: "" } }, key))).json()) as View;
assert.equal(answered.questions.length, 0);
assert.equal(answered.brain.customer, "Neighbours on the way to work");
assert.equal((await app.request("/api/offices/bring", json({ what: "hi" }))).status, 400);

// quote before running, then a test payment, then the inbox
const qr = await app.request(`/api/offices/${bv.id}/tasks`, json({ task: "posts" }, key));
assert.equal(qr.status, 200);
const { quote } = (await qr.json()) as { quote: Quote };
assert.equal(quote.cents, 9);
assert.equal(quote.sats, Math.ceil((0.09 / 400) * 1e8));
assert.equal(quote.testOk, true, "sample server: runs without paying");
assert.equal((await app.request(`/api/offices/${bv.id}`, { headers: { "x-owner-key": key } }).then((r) => r.json()) as View).inbox.length, 0, "a quote alone is not in the inbox");
assert.equal((await app.request(`/api/offices/${bv.id}/tasks`, json({ task: "nope" }, key))).status, 400);
const real = await app.request(`/api/offices/${bv.id}/tasks/${quote.taskId}/pay`, json({ txHex: "00" }, key));
assert.equal(real.status, 503, "real money never buys sample output");
const paid = (await (await app.request(`/api/offices/${bv.id}/tasks/${quote.taskId}/pay`, json({ test: true }, key))).json()) as View;
assert.equal(paid.inbox[0]!.status === "working" || paid.inbox[0]!.status === "done", true);
const done = await untilDone(bv.id, key, quote.taskId);
const item = done.inbox.find((x) => x.id === quote.taskId)!;
assert.equal(item.usedCents, 4);
assert.equal(item.quotedCents, 9);
assert.ok(item.paid?.test);
assert.match(item.result!.items[0]!.text, /oven|loaves/i, "bakery fixture");
// paying twice is harmless
assert.equal((await app.request(`/api/offices/${bv.id}/tasks/${quote.taskId}/pay`, json({ test: true }, key))).status, 200);
assert.equal(((await (await app.request(`/api/offices/${bv.id}`, { headers: { "x-owner-key": key } })).json()) as View).inbox.length, 1);

// ── (A) continue from a created project (dog walks), owner key required
const ownerKey = "owner-key-for-test-123";
const p = sampleProject("dog", { id: "OFF1", upTo: "validate" }, sanitize as never);
await exec("INSERT INTO projects (id, idea, created_at, owner_hash) VALUES (?, ?, ?, ?)", ["OFF1", p.idea, Date.now(), createHash("sha256").update(ownerKey).digest("hex")]);
for (const d of ["mia", "leo", "sam"] as const)
  await exec("INSERT INTO jobs (project_id, dept, stage, status, json, queued_at, finished_at) VALUES (?, ?, 'validate', 'done', ?, ?, ?)", ["OFF1", d, JSON.stringify(p.results[d]), 1, 2]);
assert.equal((await app.request("/api/offices/from-project", json({ projectId: "OFF1" }))).status, 403);
assert.equal((await app.request("/api/offices/from-project", json({ projectId: "NOPE" }, ownerKey))).status, 404);
const fa = (await (await app.request("/api/offices/from-project", json({ projectId: "OFF1" }, ownerKey))).json()) as { view: View };
assert.equal(fa.view.source, "report");
assert.equal(fa.view.questions.length, 0, "zero questions after a report");
assert.ok(fa.view.brain.competitors.length >= 1, "competitors come from the report");
const again = (await (await app.request("/api/offices/from-project", json({ projectId: "OFF1" }, ownerKey))).json()) as { view: View };
assert.equal(again.view.id, fa.view.id, "one office space per project");
const q2 = ((await (await app.request(`/api/offices/${fa.view.id}/tasks`, json({ task: "replies", input: "Do you walk in the rain?" }, ownerKey))).json()) as { quote: Quote }).quote;
assert.equal(q2.cents, 2);
await app.request(`/api/offices/${fa.view.id}/tasks/${q2.taskId}/pay`, json({ test: true }, ownerKey));
const d2 = (await untilDone(fa.view.id, ownerKey, q2.taskId)).inbox.find((x) => x.id === q2.taskId)!;
assert.equal(d2.usedCents, 1);
assert.match(JSON.stringify(d2.result), /walk/i, "dog fixture");

rmSync(dir, { recursive: true, force: true });
console.log("offices: all checks passed");
