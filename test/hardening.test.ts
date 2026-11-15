// Server hardening (WS server pass): the real-money path end to end with fixtures (quote → pay → tx check, no AI
// call, no network: the Electrum servers point at a closed local port), idempotent pay, rate limits, the v7 report
// maths, the streamed findings parser and the v7 → v4 bridge. Run: npx tsx test/hardening.test.ts
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cashAddressToLockingBytecode, encodeTransaction, binToHex, utf8ToBin, hexToBin } from "@bitauth/libauth";

const dir = mkdtempSync(join(tmpdir(), "launchdesk-hard-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  MOCK_AI: "0",
  ANTHROPIC_API_KEY: "test-placeholder-not-a-key", // real-money mode; this test never calls the API
  BCH_USD_FIXED: "460",
  DATABASE_URL: `file:${join(dir, "test.db")}`,
  MERCHANT_ADDRESS: "bitcoincash:qp9d679zvayvudj65nd9zlgezvjplr8g3vea64wad0",
  ELECTRUM_SERVERS: "ws://127.0.0.1:9",
  RATE_LIMIT_CREATE: "3",
  RATE_LIMIT_STEER: "2",
});

const { app } = await import("../server/app.js");
const { migrate, exec } = await import("../server/db.js");
const { config, merchantOnMainnet } = await import("../server/config.js");
const { paymentTag } = await import("../server/chain.js");
const { resetRateLimits, allow } = await import("../server/ratelimit.js");
const v7 = await import("../server/v7.js");
const { completeFindings } = await import("../server/ai-v7.js");
const { leoFromV7, memoFromV7 } = await import("../server/v7-bridge.js");
const { V7_SAMPLES, sampleResults } = await import("../server/v7-samples.js");
const { usdOf } = await import("../server/cost.js");
await migrate();
assert.equal(config.mockAi, false, "this test runs the real-money path");

const H = (ip: string, key?: string) => ({ "content-type": "application/json", "x-forwarded-for": ip, ...(key ? { "x-owner-key": key } : {}) });
const post = (path: string, body: unknown, ip = "10.0.0.1", key?: string) => app.request(`http://localhost${path}`, { method: "POST", headers: H(ip, key), body: JSON.stringify(body) });

// ── rate limit: project creation per IP
for (let i = 0; i < 3; i++) assert.equal((await post("/api/projects", { idea: "A tiny test idea with enough words in it" }, "10.0.0.9")).status, 200);
const limited = await post("/api/projects", { idea: "A tiny test idea with enough words in it" }, "10.0.0.9");
assert.equal(limited.status, 429);
assert.match(((await limited.json()) as { error: string }).error, /wait/);
assert.equal((await post("/api/projects", { idea: "A tiny test idea with enough words in it" }, "10.0.0.10")).status, 200, "another IP is not limited");
assert.equal((await post("/api/projects", { idea: "A tiny test idea with enough words in it" }, "6.6.6.6, 10.0.0.9")).status, 429, "a forged first X-Forwarded-For hop does not dodge the limit");
assert.equal(allow("t", "a", 1, 1000, 0), true);
assert.equal(allow("t", "a", 1, 1000, 500), false);
assert.equal(allow("t", "a", 1, 1000, 1500), true, "the window slides");
resetRateLimits();

// ── quote → pay with a signed transaction (fixtures)
const created = (await (await post("/api/projects", { idea: "A specialty coffee kiosk at a Barcelona metro exit" })).json()) as { id: string; ownerKey: string };
const q = await post(`/api/projects/${created.id}/quote`, { stage: "validate" }, "10.0.0.1", created.ownerKey);
assert.equal(q.status, 200);
const quote = (await q.json()) as { sats: number; tag: string; cents: number; address: string };
assert.equal(quote.cents, 10);
assert.equal(quote.tag, paymentTag(created.id, "validate"));
assert.ok(quote.sats > 0);

const lock = (a: string) => (cashAddressToLockingBytecode(a) as { bytecode: Uint8Array }).bytecode;
const opret = (t: string) => { const d = utf8ToBin(t); return Uint8Array.from([0x6a, d.length, ...d]); };
const tx = (outs: Array<[Uint8Array, bigint]>) =>
  binToHex(encodeTransaction({
    version: 2, locktime: 0,
    inputs: [{ outpointTransactionHash: hexToBin("22".repeat(32)), outpointIndex: 0, sequenceNumber: 0xffffffff, unlockingBytecode: new Uint8Array() }],
    outputs: outs.map(([lockingBytecode, valueSatoshis]) => ({ lockingBytecode, valueSatoshis })),
  }));
const M = lock(config.merchantAddress);
const pay = async (txHex: string) => {
  const r = await post(`/api/projects/${created.id}/pay`, { stage: "validate", txHex }, "10.0.0.1", created.ownerKey);
  return { status: r.status, body: (await r.json()) as { error?: string; payments?: Record<string, unknown> } };
};
let r = await pay("");
assert.equal(r.status, 400);
assert.match(r.body.error!, /No signed transaction/);
r = await pay(tx([[M, BigInt(quote.sats)]]));
assert.equal(r.status, 400);
assert.match(r.body.error!, /not tagged/);
r = await pay(tx([[M, BigInt(quote.sats - 500)], [opret(quote.tag), 0n]]));
assert.equal(r.status, 400);
assert.match(r.body.error!, /too small.*Nothing was charged/);
r = await pay(tx([[M, BigInt(quote.sats)], [opret(paymentTag("other", "validate")), 0n]]));
assert.equal(r.status, 400, "a tag for another project is refused");
r = await pay("zz-not-hex");
assert.equal(r.status, 400);
assert.match(r.body.error!, /Invalid transaction/);
// a valid transaction: the broadcast cannot reach the (closed) node → 502 with a clear, non-final message
const good = tx([[M, BigInt(quote.sats)], [opret(quote.tag), 0n]]);
r = await pay(good);
assert.equal(r.status, 502);
assert.match(r.body.error!, /may still arrive/);
let p = (await (await app.request(`http://localhost/api/projects/${created.id}`)).json()) as { payments: Record<string, unknown> };
assert.equal(p.payments.validate, undefined, "no payment is recorded when the broadcast failed");

// plain QR (watch): a node outage is not an error; the client keeps polling and nothing is recorded
const w = await post(`/api/projects/${created.id}/pay`, { stage: "validate", watch: true }, "10.0.0.1", created.ownerKey);
assert.equal(w.status, 200);
assert.equal(((await w.json()) as { payments: Record<string, unknown> }).payments.validate, undefined);

// idempotent pay: once recorded (as after a successful broadcast), sending the same tx again returns the project
const { hashTransaction } = await import("@bitauth/libauth");
const txid = hashTransaction(hexToBin(good));
await exec("INSERT INTO payments (txid, project_id, stage, sats, cents, created_at) VALUES (?, ?, ?, ?, ?, ?)", [txid, created.id, "validate", quote.sats, 10, Date.now()]);
r = await pay(good);
assert.equal(r.status, 200, "paying twice is harmless");
assert.ok(r.body.payments?.validate);
// the same transaction cannot pay a second project
const other = (await (await post("/api/projects", { idea: "A second project to reuse a transaction on" })).json()) as { id: string; ownerKey: string };
await post(`/api/projects/${other.id}/quote`, { stage: "validate" }, "10.0.0.1", other.ownerKey);
const reuse = await post(`/api/projects/${other.id}/pay`, { stage: "validate", txHex: good }, "10.0.0.1", other.ownerKey);
assert.equal(reuse.status, 400, "the tag binds the payment to its project");
// dev payments are refused in real mode from a non-local request without DEV_SKIP_PAYMENT
const dev = await app.request(`http://example.com/api/projects/${other.id}/pay`, { method: "POST", headers: H("1.2.3.4", other.ownerKey), body: JSON.stringify({ stage: "validate", dev: true }) });
assert.equal(dev.status, 402);

// ── mainnet only
assert.equal(merchantOnMainnet("bitcoincash:qp9d679zvayvudj65nd9zlgezvjplr8g3vea64wad0"), true);
assert.equal(merchantOnMainnet("qp9d679zvayvudj65nd9zlgezvjplr8g3vea64wad0"), true);
assert.equal(merchantOnMainnet("bchtest:qp9d679zvayvudj65nd9zlgezvjplr8g3vea64wad0"), false);
assert.equal(merchantOnMainnet("bchreg:qp9d679zvayvudj65nd9zlgezvjplr8g3vea64wad0"), false);

// ── steer: limits (402 unpaid, 409 before the report, per-IP rate limit)
const unpaid = await post(`/api/projects/${other.id}/steer`, { note: "Focus on office workers" }, "10.0.0.1", other.ownerKey);
assert.equal(unpaid.status, 402);
const early = await post(`/api/projects/${created.id}/steer`, { note: "Focus on office workers" }, "10.0.0.3", created.ownerKey);
assert.equal(early.status, 409, "no steer before the report");
await post(`/api/projects/${created.id}/steer`, { note: "Focus on office workers" }, "10.0.0.3", created.ownerKey);
const steerLimited = await post(`/api/projects/${created.id}/steer`, { note: "Focus on office workers" }, "10.0.0.3", created.ownerKey);
assert.equal(steerLimited.status, 429);
assert.equal((await post(`/api/projects/${created.id}/steer`, { note: "x" }, "10.0.0.4", created.ownerKey)).status, 400, "a too-short note is refused");

// ── report maths: weights add up to 1.00 and the string adds up to the score, for every roster size
const roles = v7.ANALYST_ROLES;
for (let n = 2; n <= 5; n++) {
  for (let start = 0; start + n <= roles.length; start++) {
    const pick = roles.slice(start, start + n);
    const w = v7.rosterWeights(pick);
    const sum = Object.values(w).reduce((t, x) => t + Math.round(x * 100), 0);
    if (pick.some((x) => v7.ROLE_LIBRARY[x].weight > 0)) assert.equal(sum, 100, `weights of ${pick.join(",")} add up to 1.00`);
  }
}
// confidence counts what moves the decision, not just how many findings have a source
const src = { url: "https://example.org/a", title: "A", domain: "example.org", accessed: "2026-11-15" };
const F = (id: string, analyst: import("../server/v7.js").AnalystRole, impact: -2 | -1 | 0 | 1 | 2, sourced: boolean): import("../server/v7.js").Finding =>
  ({ id, analyst, kind: sourced ? "fact" : "estimate", text: "t", t: 0, impact, source: sourced ? src : null });
const factors = [{ analyst: "market" as const, weight: 0.5 }, { analyst: "competition" as const, weight: 0.5 }];
// many sourced context facts, but every decision-moving finding is an estimate → low
assert.equal(v7.confidenceFor({ factors, findings: [F("a", "market", 0, true), F("b", "market", 0, true), F("c", "market", 0, true), F("d", "competition", 2, false), F("e", "market", -2, false)] }), "low");
assert.equal(v7.confidenceFor({ factors, findings: [F("a", "market", 2, true), F("b", "competition", -1, true), F("c", "market", 1, true), F("d", "competition", 1, false)] }), "high");

// ── streamed findings: complete objects only, strings with braces and escapes are safe
const partial = '{"headline":"h","findings":[{"kind":"fact","text":"a {brace} and \\"quote\\"","impact":1},{"kind":"risk","text":"cut he';
const got = completeFindings(partial) as Array<{ text: string }>;
assert.equal(got.length, 1);
assert.equal(got[0]!.text, 'a {brace} and "quote"');
assert.equal(completeFindings('{"headline":"h","fin').length, 0);
assert.equal(completeFindings('{"headline":"h","findings":[{"a":1},{"b":{"c":2}}]}').length, 2);

// ── v7 → v4 bridge: one score everywhere
for (const s of Object.values(V7_SAMPLES)) {
  const res = sampleResults(s);
  const leo = leoFromV7(res);
  assert.equal(leo.score, res.report!.score, `${s.key}: Leo's score is the v7 score`);
  assert.equal(leo.verdict, res.report!.verdict);
  assert.equal(leo.score_math, res.report!.math);
  assert.equal(leo.signals.length, 5);
  for (const f of leo.market_facts) if (f.source_id != null) assert.ok(leo.sources.some((x) => x.id === f.source_id), "facts cite listed sources");
  assert.ok(memoFromV7(s.idea, res).verdict_line.startsWith(`${res.report!.score.toFixed(1)}/10`), `${s.key}: the memo quotes the v7 score`);
}

// ── cost table maths
assert.equal(Math.round(usdOf("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 100_000 }) * 100) / 100, 3);
assert.equal(Math.round(usdOf("claude-haiku-5-5", { input_tokens: 10_000, output_tokens: 1_000, server_tool_use: { web_search_requests: 2 } }) * 10000) / 10000, 0.0215);

rmSync(dir, { recursive: true, force: true });
console.log("hardening: all passed");
process.exit(0);
