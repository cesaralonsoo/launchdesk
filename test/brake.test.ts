// B1 spend brake + R1 proxy hops. Real-money mode with a placeholder key, through the real Hono app. No network:
// the AI host is answered by a local fake fetch, the Electrum servers point at a closed port, the BCH price is fixed.
// Zero AI spend, nothing broadcast. Run: npx tsx test/brake.test.ts
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "launchdesk-brake-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  MOCK_AI: "0",
  ANTHROPIC_API_KEY: "test-placeholder-not-a-key",
  BCH_USD_FIXED: "460",
  DATABASE_URL: `file:${join(dir, "brake.db")}`,
  MERCHANT_ADDRESS: "bitcoincash:qp9d679zvayvudj65nd9zlgezvjplr8g3vea64wad0",
  ELECTRUM_SERVERS: "ws://127.0.0.1:9",
  DAILY_CAP_USD: "0.5",
  REPORT_CAP_USD: "0.08",
  KIT_SPEND_CAP_CENTS: "45",
  DEV_SKIP_PAYMENT: "0", // a local .env may switch it on; this test is about real money
  ESCROW: "0",
});
delete process.env.PAUSE;
delete process.env.TRUST_PROXY_HOPS;
delete process.env.TRUST_PROXY_SKIP_PRIVATE;

// The AI provider, faked before the app installs its fetch watcher (so the SDK's default fetch goes through both).
const CREDIT = JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." } });
let aiAnswer: { status: number; body: string } = { status: 400, body: CREDIT };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (new URL(url).host === "api.anthropic.com") return new Response(aiAnswer.body, { status: aiAnswer.status, headers: { "content-type": "application/json" } });
  throw new Error(`test: no network (${url})`);
}) as typeof fetch;

const { app } = await import("../server/app.js");
const { migrate, exec } = await import("../server/db.js");
const { seedExample } = await import("../server/seed/example.js");
const B = await import("../server/brake.js");
const { recordUsage } = await import("../server/cost.js");
const { pickClientIp, isPrivateIp } = await import("../server/ratelimit.js");
const { config } = await import("../server/config.js");
const { default: Anthropic } = await import("@anthropic-ai/sdk");
await migrate();
await seedExample();
assert.equal(config.mockAi, false, "this test runs the real-money path");

const post = (path: string, body: unknown, ip = "10.1.0.1") =>
  app.request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
const cfg = async () => (await (await app.request("http://localhost/api/config")).json()) as { paused: boolean; pausedReason?: string; prices: unknown };
let n = 0;
const ok = (msg: string) => console.log(`  ok ${++n} ${msg}`);

// ── 1. what an AI error means
assert.equal(B.classifyAiError(400, CREDIT), "credit");
assert.equal(B.classifyAiError(401), "credit");
assert.equal(B.classifyAiError(403), "credit");
assert.equal(B.classifyAiError(402), "credit");
assert.equal(B.classifyAiError(529), "overload");
assert.equal(B.classifyAiError(400, '{"error":{"message":"max_tokens is too large"}}'), null, "an ordinary bad request is not a billing problem");
assert.equal(B.classifyAiError(429), null, "a rate limit is not a billing problem");
assert.equal(B.classifyAiError(500), null);
ok("AI errors are classified (credit / key / overload / other)");

// ── 2. not paused: config says so, a quote is given
assert.equal((await cfg()).paused, false);
const created = (await (await post("/api/projects", { idea: "A tiny test idea with enough words in it" })).json()) as { id: string; ownerKey: string };
assert.equal((await post(`/api/projects/${created.id}/quote`, { stage: "validate" })).status, 200);
ok("not paused: /api/config paused=false and a quote is given");

// ── 3. a real SDK call that gets "credit balance too low" turns the brake on (through the wrapped global fetch)
const client = new Anthropic({ apiKey: "test-placeholder-not-a-key", maxRetries: 0 });
await assert.rejects(client.messages.create({ model: "claude-haiku-5-5", max_tokens: 5, messages: [{ role: "user", content: "hi" }] }));
assert.equal(await B.brakeReason(), "credit");
ok("an SDK call answered 400 'credit balance' turns the brake on");

// ── 4. paused: money routes refuse before any wallet step; samples and examples keep working
const c4 = await cfg();
assert.equal(c4.paused, true);
assert.match(c4.pausedReason ?? "", /paused/i);
assert.ok(c4.prices, "the rest of the config is still there");
for (const stage of ["validate", "build"]) {
  const r = await post(`/api/projects/${created.id}/quote`, { stage });
  assert.equal(r.status, 503);
  const j = (await r.json()) as { paused: boolean; error: string };
  assert.equal(j.paused, true);
  assert.match(j.error, /paused/i);
  assert.match(j.error, /No money was taken/);
}
// A signed transaction is refused before it is even checked or broadcast (no "tx" error, no network error).
const pay = await post(`/api/projects/${created.id}/pay`, { stage: "validate", txHex: "00" });
assert.equal(pay.status, 503);
assert.equal(((await pay.json()) as { paused: boolean }).paused, true);
// A sample run (dev) is not a money step: it reaches the route (402 here: not a sample server, not local dev).
assert.notEqual((await post(`/api/projects/${created.id}/pay`, { stage: "validate", dev: true })).status, 503);
// A plain-QR check looks for money already sent: it reaches the route (no network here, so nothing found).
assert.notEqual((await post(`/api/projects/${created.id}/pay`, { stage: "validate", watch: true })).status, 503);
// Office tasks: price and pay refuse too; a test pay is not refused by the brake.
assert.equal((await post("/api/offices/s1/tasks", { task: "x" })).status, 503);
assert.equal((await post("/api/offices/s1/tasks/t1/pay", { txHex: "00" })).status, 503);
assert.notEqual((await post("/api/offices/s1/tasks/t1/pay", { test: true })).status, 503);
// The read-only example and the stats keep working.
assert.equal((await app.request("http://localhost/api/projects/example")).status, 200);
assert.equal((await app.request("http://localhost/api/stats")).status, 200);
assert.equal((await app.request("http://localhost/healthz")).status, 200);
ok("paused: quote/pay (projects and offices) answer 503 paused before any wallet step; samples, examples, stats work");

// ── 5. an order that is already paid is not blocked (its run goes on)
await exec("INSERT INTO payments (txid, project_id, stage, sats, cents, created_at) VALUES (?, ?, 'validate', 1000, 10, ?)", ["a".repeat(64), created.id, Date.now()]);
const again = await post(`/api/projects/${created.id}/pay`, { stage: "validate", txHex: "00" });
assert.equal(again.status, 200, "an already-paid order answers as usual");
assert.notEqual((await post(`/api/projects/${created.id}/run`, { stage: "validate" })).status, 503, "a paid run is never refused by the brake");
// That paid run really goes on (here it meets the same out-of-credit fake). Let it end before the next checks.
const { isRunning } = await import("../server/jobs.js");
for (let i = 0; i < 400 && isRunning(created.id, "validate"); i++) await new Promise((r) => setTimeout(r, 25));
assert.equal(isRunning(created.id, "validate"), false, "the paid run finished (here: failed on the fake AI)");
ok("paid orders: pay answers as usual and /run is never refused");

// ── 6. a credit brake stays on (until restart); an unrelated host's 401 never trips it
B._resetBrake();
const other = { fetch: (async () => new Response("no", { status: 401 })) as typeof fetch };
B.watchAiFetch(other);
await other.fetch("https://example.com/api");
assert.equal(await B.brakeReason(), null, "a 401 from another host does not trip the brake");
const fakeAi = { fetch: (async () => new Response(CREDIT, { status: 400 })) as typeof fetch };
B.watchAiFetch(fakeAi);
const res = await fakeAi.fetch("https://api.anthropic.com/v1/messages");
assert.match(await res.text(), /credit balance/, "the caller can still read the error body");
assert.equal(await B.brakeReason(undefined, Date.now() + 24 * 3600_000), "credit", "still on a day later");
ok("credit brake is sticky; other hosts are ignored; the error body stays readable");

// ── 7. a storm of 529 answers pauses for a while, then clears itself
B._resetBrake();
const t0 = Date.now();
for (let i = 0; i < 5; i++) B.noteAiAnswer(529, "", t0 + i);
assert.equal(await B.brakeReason(undefined, t0 + 10), null, "a few overloaded answers do not pause");
B.noteAiAnswer(529, "", t0 + 20);
assert.equal(await B.brakeReason(undefined, t0 + 30), "overload");
assert.equal(await B.brakeReason(undefined, t0 + B.OVERLOAD_PAUSE_MS + 60), null, "clears after the pause");
B._resetBrake();
for (let i = 0; i < 6; i++) B.noteAiAnswer(529, "", t0 + i * 6 * 60_000);
assert.equal(await B.brakeReason(undefined, t0 + 31 * 60_000), null, "529s spread over half an hour are not a storm");
ok("529 storm pauses for 10 minutes, scattered 529s do not");

// ── 8. manual PAUSE=1
B._resetBrake();
process.env.PAUSE = "1";
assert.equal((await cfg()).paused, true);
assert.equal((await post(`/api/projects/${created.id}/quote`, { stage: "validate" })).status, 503);
delete process.env.PAUSE;
assert.equal((await cfg()).paused, false);
ok("PAUSE=1 pauses, removing it resumes");

// ── 9. daily cap: summed from recorded usage, saved in the database, survives a restart, resets the next day
B._resetBrake({ memory: true });
await exec("DELETE FROM ai_spend").catch(() => {});
recordUsage("test", "claude-sonnet-5-5", { input_tokens: 150_000 }); // $0.30
assert.equal(await B.brakeReason(), null, "$0.30 + one report ($0.08) fits under $0.50");
assert.equal((await post(`/api/projects/${created.id}/quote`, { stage: "build" })).status, 503, "a kit (up to $0.45) would pass the cap: refused");
recordUsage("test", "claude-sonnet-5-5", { input_tokens: 70_000 }); // +$0.14 = $0.44
assert.equal(await B.brakeReason(), "daily");
const c9 = await cfg();
assert.equal(c9.paused, true);
assert.match(c9.pausedReason ?? "", /tomorrow/);
const saved = await exec("SELECT usd FROM ai_spend WHERE day = ?", [new Date().toISOString().slice(0, 10)]);
assert.ok(Math.abs(Number(saved.rows[0]?.usd) - 0.44) < 1e-6, "today's spend is saved");
B._resetBrake({ memory: true }); // a restart: memory is gone, the database keeps the total
assert.equal(await B.brakeReason(), "daily", "the cap holds after a restart");
assert.equal(await B.brakeReason(undefined, Date.now() + 24 * 3600_000), null, "a new day starts at $0");
ok("daily cap: refuses a run that would pass it, persists across restarts, resets the next day");

// ── 10. R1: the visitor's address behind a proxy
assert.equal(pickClientIp("203.0.113.5", 2, true), "203.0.113.5", "one entry: that is the visitor");
assert.equal(pickClientIp("203.0.113.5, 10.0.0.3", 2, true), "203.0.113.5", "an internal hop is dropped");
assert.equal(pickClientIp("203.0.113.5, 172.70.1.2", 2, true), "203.0.113.5", "client then edge: the visitor");
assert.equal(pickClientIp("6.6.6.6, 203.0.113.5, 172.70.1.2", 2, true), "203.0.113.5", "a forged first entry does not win");
assert.equal(pickClientIp("6.6.6.6, 203.0.113.5, 172.70.1.2, 10.0.0.3", 2, true), "203.0.113.5", "edge plus internal hop");
assert.notEqual(pickClientIp("198.51.100.7, 172.70.1.2", 2, true), pickClientIp("203.0.113.5, 172.70.1.2", 2, true), "two visitors behind the same edge are not lumped together");
assert.equal(pickClientIp("6.6.6.6, 10.0.0.9", 1, false), "10.0.0.9", "one hop, no skipping: the last entry (old behaviour)");
assert.equal(pickClientIp("1.2.3.4", 0, true), null, "0 hops ignores the header");
assert.equal(pickClientIp(undefined, 2, true), null);
assert.ok(isPrivateIp("10.1.2.3") && isPrivateIp("192.168.0.1") && isPrivateIp("172.16.0.1") && isPrivateIp("::1") && isPrivateIp("fd00::1"));
assert.ok(!isPrivateIp("172.70.1.2") && !isPrivateIp("203.0.113.5") && !isPrivateIp("2001:db8::1"));
assert.equal(config.trustProxyHops, 1, "outside production the default is 1 hop");
ok("proxy hops: visitors behind Render's edge get their own bucket; forged entries do not win");

globalThis.fetch = realFetch;
rmSync(dir, { recursive: true, force: true });
console.log(`brake.test: ${n} groups passed`);
