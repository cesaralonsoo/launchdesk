// Run: node_modules/.bin/tsx --test test/paygate.test.ts
// The pay gate: "no AI runs and no AI money is spent unless we have really been paid for that exact work".
// The server runs in real-money mode (MOCK_AI=0, a dummy key) with the Anthropic SDK pointed at a local stub that
// counts every request: each unpaid attempt below must leave that count at 0. No network: the price feeds are
// blocked, Electrum is a test transport, and nothing is broadcast anywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { binToHex, cashAddressToLockingBytecode, encodeTransaction, hexToBin, utf8ToBin } from "@bitauth/libauth";

// ---- the AI stub: answers 500 to everything and counts ------------------------------------------------------------
const aiHits: string[] = [];
const stub = createServer((req, res) => {
  aiHits.push(`${req.method} ${req.url}`);
  res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ type: "error", error: { type: "api_error", message: "stub" } }));
});
await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
stub.unref();

const MERCHANT = "bitcoincash:qp9d679zvayvudj65nd9zlgezvjplr8g3vea64wad0";
const dir = mkdtempSync(join(tmpdir(), "launchdesk-paygate-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  MOCK_AI: "0",
  ANTHROPIC_API_KEY: "sk-test-dummy",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${(stub.address() as AddressInfo).port}`,
  BCH_USD_FIXED: "400",
  DATABASE_URL: `file:${join(dir, "t.db")}`,
  MERCHANT_ADDRESS: MERCHANT,
  ELECTRUM_SERVERS: "ws://127.0.0.1:9",
  RATE_LIMIT_RUN: "4",
  PRICE_VALIDATE_CENTS: "",
  PRICE_BUILD_CENTS: "",
});
delete process.env.ESCROW;
// Price feeds are "down": any fetch to them fails (and nothing else leaves the machine).
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!/^http:\/\/127\.0\.0\.1:/.test(url)) throw new Error(`blocked in test: ${url}`);
  return realFetch(input, init);
}) as typeof fetch;

const chain = await import("../server/chain.js");
const { app } = await import("../server/app.js");
const db = await import("../server/db.js");
const { config } = await import("../server/config.js");
const { resetRateLimits } = await import("../server/ratelimit.js");
const store = await import("../server/offices/store.js");
const kit = await import("../server/kit.js");
const { kitRoutes } = await import("../server/kit-routes.js");
const { prepareStage } = await import("../server/jobs.js");
await db.migrate();
await store.ensureTables();
assert.equal(config.mockAi, false, "real-money mode");

const H = (key?: string, ip = "10.1.0.1") => ({ "content-type": "application/json", "x-forwarded-for": ip, ...(key ? { "x-owner-key": key } : {}) });
async function call<T = any>(path: string, body: unknown, key?: string, ip?: string) {
  const res = await app.request("http://example.test" + path, { method: "POST", headers: H(key, ip), body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as T };
}
const settle = () => new Promise((r) => setTimeout(r, 50));
async function noAi<T>(fn: () => Promise<T>): Promise<T> {
  const before = aiHits.length;
  const out = await fn();
  await settle();
  assert.deepEqual(aiHits.slice(before), [], "the AI stub got no request");
  return out;
}
const M = (cashAddressToLockingBytecode(MERCHANT) as { bytecode: Uint8Array }).bytecode;
const opret = (t: string) => {
  const d = utf8ToBin(t);
  return Uint8Array.from([0x6a, d.length, ...d]);
};
const tx = (outs: Array<[Uint8Array, bigint]>, fill = "22") =>
  binToHex(
    encodeTransaction({
      version: 2,
      locktime: 0,
      inputs: [{ outpointTransactionHash: hexToBin(fill.repeat(32)), outpointIndex: 0, sequenceNumber: 0xffffffff, unlockingBytecode: new Uint8Array() }],
      outputs: outs.map(([lockingBytecode, valueSatoshis]) => ({ lockingBytecode, valueSatoshis })),
    }),
  );
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
let n = 0;
async function project(paid?: { stage: "validate" | "build"; refunded?: boolean; runs?: number }) {
  const id = `PG${++n}x`;
  const key = `owner-${id}`;
  await db.exec("INSERT INTO projects (id, idea, created_at, owner_hash) VALUES (?, ?, ?, ?)", [id, "A small bakery in Ruzafa selling sourdough at 4 euros", Date.now(), sha(key)]);
  if (paid)
    await db.exec("INSERT INTO payments (txid, project_id, stage, sats, cents, created_at, refunded_at, runs) VALUES (?, ?, ?, 25000, 10, ?, ?, ?)", [
      `tx-${id}`,
      id,
      paid.stage,
      Date.now(),
      paid.refunded ? Date.now() : null,
      paid.runs ?? 0,
    ]);
  return { id, key };
}

test("bring: the follow-up questions are plain ones, no AI call", async () => {
  const r = await noAi(() => call("/api/offices/bring", { what: "A small bakery in Ruzafa, Valencia", where: "Valencia" }));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(r.json.view.questions.length >= 1 && r.json.view.questions.length <= 3);
  assert.equal(r.json.view.sample, false, "a real-money server, not a sample one");
});

test("offices quote: price feed down -> 503, never a 0-sat quote", async () => {
  const b = await call("/api/offices/bring", { what: "A small bakery in Ruzafa, Valencia", where: "Valencia" });
  const { view, key } = b.json;
  config.fixedBchUsd = null; // the feeds are blocked: no price at all
  try {
    const q = await noAi(() => call(`/api/offices/${view.id}/tasks`, { task: "posts" }, key));
    assert.equal(q.status, 503);
    assert.match(q.json.error, /Prices are unavailable/);
    assert.equal((await store.listTasks(view.id)).length, 0, "no task row was written");
  } finally {
    config.fixedBchUsd = 400;
  }
  const ok = await call(`/api/offices/${view.id}/tasks`, { task: "posts" }, key);
  assert.equal(ok.status, 200);
  assert.ok(ok.json.quote.sats > 0);
});

test("offices pay: a 0-sat task or a dust payment never runs", async () => {
  const b = await call("/api/offices/bring", { what: "A small bakery in Ruzafa, Valencia", where: "Valencia" });
  const { view, key } = b.json;
  const base = { spaceId: view.id, task: "posts" as const, office: "marketing" as never, title: "Posts", input: "", quotedCents: 9, expiresAt: Date.now() + 60_000 };
  await store.insertTask({ ...base, id: "zero1", sats: 0 });
  await store.insertTask({ ...base, id: "dust1", sats: 100 });
  const zero = await noAi(() => call(`/api/offices/${view.id}/tasks/zero1/pay`, { txHex: tx([[M, 1000n], [opret(`LD1:${view.id}:zero1`), 0n]]) }, key));
  assert.equal(zero.status, 400);
  assert.match(zero.json.error, /not valid/);
  const dust = await noAi(() => call(`/api/offices/${view.id}/tasks/dust1/pay`, { txHex: tx([[M, 100n], [opret(`LD1:${view.id}:dust1`), 0n]]) }, key));
  assert.equal(dust.status, 400);
  assert.match(dust.json.error, /too small/i);
  assert.equal((await store.getTask(view.id, "zero1"))!.status, "quoted");
  assert.equal((await store.getTask(view.id, "dust1"))!.status, "quoted");
});

test("checkPaymentTx refuses a 0 / NaN minimum (defence in depth)", () => {
  const t = tx([[M, 0n], [opret("LD1:x:validate"), 0n]]);
  assert.throws(() => chain.checkPaymentTx(t, 0, "LD1:x:validate"), /Prices are unavailable/);
  assert.throws(() => chain.checkPaymentTx(t, Number.NaN, "LD1:x:validate"), /Prices are unavailable/);
});

test("project quote: price feed down -> 503", async () => {
  const { id, key } = await project();
  config.fixedBchUsd = null;
  try {
    const q = await noAi(() => call(`/api/projects/${id}/quote`, { stage: "validate" }, key));
    assert.equal(q.status, 503);
    assert.match(q.json.error, /Prices are unavailable/);
  } finally {
    config.fixedBchUsd = 400;
  }
});

test("refunded stage: run, retry, steer and job preparation all refuse (402), no AI", async () => {
  const { id, key } = await project({ stage: "validate", refunded: true });
  await db.exec("INSERT INTO jobs (project_id, dept, stage, status, queued_at) VALUES (?, 'mia', 'validate', 'error', ?)", [id, Date.now()]);
  const run = await noAi(() => call(`/api/projects/${id}/run`, { stage: "validate" }, key));
  assert.equal(run.status, 402);
  assert.match(run.json.error, /refunded/);
  const retry = await noAi(() => call(`/api/projects/${id}/retry`, { dept: "mia" }, key));
  assert.equal(retry.status, 402);
  const steer = await noAi(() => call(`/api/projects/${id}/steer`, { note: "Look at rent prices again" }, key));
  assert.equal(steer.status, 402);
  await assert.rejects(prepareStage(id, "validate"), /refunded/);
  const p = await db.getProject(id);
  assert.equal(p!.payments.validate!.refunded, true);
  assert.equal(db.paidFor(p!, "validate"), false);
  assert.equal(await db.claimStageRun(id, "validate"), false);
});

test("markPaymentRefunded and the migration are idempotent; old rows read as not refunded", async () => {
  const { id } = await project({ stage: "validate" });
  assert.equal(db.paidFor((await db.getProject(id))!, "validate"), true);
  await db.markPaymentRefunded(id, "validate", 1234);
  await db.markPaymentRefunded(id, "validate", 9999);
  const r = await db.exec("SELECT refunded_at FROM payments WHERE project_id = ?", [id]);
  assert.equal(Number(r.rows[0]!.refunded_at), 1234, "the first refund time stays");
  await db.migrate(); // again: no error, nothing changes
  assert.equal(Number((await db.exec("SELECT refunded_at FROM payments WHERE project_id = ?", [id])).rows[0]!.refunded_at), 1234);
});

test("run cap: at most 3 runs per paid stage across run and retry, then 402 Contact us", async () => {
  const { id } = await project({ stage: "validate" });
  assert.equal(await db.claimStageRun(id, "validate"), true);
  assert.equal(await db.claimStageRun(id, "validate"), true);
  assert.equal(await db.claimStageRun(id, "validate"), true);
  assert.equal(await db.claimStageRun(id, "validate"), false, "the 4th run is refused");
  assert.equal(db.MAX_STAGE_RUNS, 3);

  resetRateLimits();
  const used = await project({ stage: "validate", runs: 3 });
  await db.exec("INSERT INTO jobs (project_id, dept, stage, status, queued_at) VALUES (?, 'mia', 'validate', 'error', ?)", [used.id, Date.now()]);
  const run = await noAi(() => call(`/api/projects/${used.id}/run`, { stage: "validate" }, used.key, "10.2.0.1"));
  assert.equal(run.status, 402);
  assert.match(run.json.error, /Contact us/);
  const retry = await noAi(() => call(`/api/projects/${used.id}/retry`, { dept: "mia" }, used.key, "10.2.0.1"));
  assert.equal(retry.status, 402);
  assert.match(retry.json.error, /Contact us/);
});

test("run/retry starts are rate-limited per IP", async () => {
  resetRateLimits();
  const used = await project({ stage: "validate", runs: 3 }); // every start is refused by the cap: no AI either way
  const codes: number[] = [];
  for (let i = 0; i < 6; i++) codes.push((await noAi(() => call(`/api/projects/${used.id}/run`, { stage: "validate" }, used.key, "10.3.0.1"))).status);
  assert.deepEqual(codes, [402, 402, 402, 402, 429, 429], "RATE_LIMIT_RUN=4 per 10 minutes");
  assert.equal((await call(`/api/projects/${used.id}/run`, { stage: "validate" }, used.key, "10.3.0.2")).status, 402, "another IP is not limited");
  resetRateLimits();
});

test("unpaid stage: run, retry and steer refuse with 402", async () => {
  const { id, key } = await project();
  await db.exec("INSERT INTO jobs (project_id, dept, stage, status, queued_at) VALUES (?, 'mia', 'validate', 'error', ?)", [id, Date.now()]);
  assert.equal((await noAi(() => call(`/api/projects/${id}/run`, { stage: "validate" }, key))).status, 402);
  assert.equal((await noAi(() => call(`/api/projects/${id}/retry`, { dept: "mia" }, key))).status, 402);
  assert.equal((await noAi(() => call(`/api/projects/${id}/steer`, { note: "Look at rent prices again" }, key))).status, 402);
});

// ---- the one free logo redraw ----------------------------------------------------------------------------------------
const logo = (id: string, family: "literal" | "monogram" | "geometric") => ({ id, family, idea: `idea ${id}`, svg: `<circle cx="32" cy="32" r="24" fill="#111111"/>` });
async function kitProject(paid = true) {
  const p = await project(paid ? { stage: "build" } : undefined);
  await kit.saveKit(p.id, {
    brand: { name: "Pan", tagline: "Bread", palette: { primary: "#111111", accent: "#0AC18E", bg: "#F8FAFC", ink: "#111111" } } as never,
    status: { brand: "done", logo: "done", site: "done", marketing: "done" },
    logo: { options: [logo("a", "literal"), logo("b", "monogram"), logo("c", "geometric")], chosen: "a", fallback: false },
  });
  return p;
}

test("logo/more: 15 clicks at once draw exactly once; the flag is saved before the draw", async () => {
  const { id, key } = await kitProject();
  let draws = 0;
  let flagBeforeDraw: boolean | undefined;
  const deps = {
    ...kit.defaultDeps,
    logos: async () => {
      draws++;
      flagBeforeDraw = (await kit.loadKit(id))!.logo!.moreUsed;
      await new Promise((r) => setTimeout(r, 40));
      return [logo("n1", "literal"), logo("n2", "monogram"), logo("n3", "geometric")];
    },
  } as never;
  const routes = kitRoutes(deps);
  resetRateLimits();
  const res = await noAi(() =>
    Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        routes.request(`http://example.test/api/projects/${id}/kit/logo/more`, { method: "POST", headers: H(key, `10.4.0.${i + 1}`), body: "{}" }).then((r) => r.status),
      ),
    ),
  );
  assert.equal(draws, 1, "one model draw for 15 clicks");
  assert.equal(flagBeforeDraw, true, "moreUsed was persisted before the model was called");
  assert.equal(res.filter((s) => s === 200).length, 1);
  assert.equal(res.filter((s) => s === 409).length, 14);
  const k = (await kit.loadKit(id))!;
  assert.equal(k.logo!.options.length, 6);
  assert.equal(k.logo!.moreUsed, true);
  assert.equal((await routes.request(`http://example.test/api/projects/${id}/kit/logo/more`, { method: "POST", headers: H(key, "10.4.1.1"), body: "{}" })).status, 409);
  assert.equal(draws, 1);
  resetRateLimits();
});

test("logo/more: a failed draw still uses the free redraw (no second try)", async () => {
  const { id, key } = await kitProject();
  let draws = 0;
  const routes = kitRoutes({ ...kit.defaultDeps, logos: async () => (draws++, Promise.reject(new Error("model said no"))) } as never);
  const a = await routes.request(`http://example.test/api/projects/${id}/kit/logo/more`, { method: "POST", headers: H(key, "10.5.0.1"), body: "{}" });
  assert.equal(a.status, 409);
  const b = await routes.request(`http://example.test/api/projects/${id}/kit/logo/more`, { method: "POST", headers: H(key, "10.5.0.2"), body: "{}" });
  assert.equal(b.status, 409);
  assert.match(((await b.json()) as { error: string }).error, /already used/);
  assert.equal(draws, 1);
  assert.equal((await kit.loadKit(id))!.logo!.moreUsed, true);
});

test("logo/more through the real app: unpaid kit -> 402, no AI", async () => {
  const { id, key } = await kitProject(false);
  const r = await noAi(() => call(`/api/projects/${id}/kit/logo/more`, {}, key));
  assert.equal(r.status, 402);
  assert.equal((await kit.loadKit(id))!.logo!.moreUsed, undefined, "nothing was claimed");
});

// ---- plain QR (BIP21) ---------------------------------------------------------------------------------------------
test("QR amounts are never handed out twice within 24 h", async () => {
  const { id, key } = await project();
  const base = Math.ceil((0.1 / 400) * 1e8); // 10¢ at $400
  for (let i = 1; i <= 999; i++) if (i !== 500) await db.exec("INSERT INTO qr_amounts (sats, project_id, stage, issued_at) VALUES (?, 'old', 'validate', ?)", [base + i, Date.now() - 60_000]);
  const q = await call(`/api/projects/${id}/quote`, { stage: "validate" }, key);
  assert.equal(q.status, 200, JSON.stringify(q.json));
  assert.equal(q.json.sats, base);
  assert.match(q.json.bip21, new RegExp(`amount=${((base + 500) / 1e8).toFixed(8).replace(/0+$/, "")}$`), "the only free suffix in the 24 h window");
  await db.exec("DELETE FROM qr_amounts");
});

test("QR watch: only a payment first seen after the quote, untagged, with the exact amount, is accepted", async () => {
  const { id, key } = await project();
  const q = await call(`/api/projects/${id}/quote`, { stage: "validate" }, key);
  const want = Math.round(Number(/amount=([\d.]+)/.exec(q.json.bip21)![1]) * 1e8);
  const merchantHex = binToHex(M);
  const txs = new Map<string, { vout: Array<{ value: number; scriptPubKey: { hex: string } }> }>();
  let mempool: string[] = [];
  chain.__setElectrumTransport(async (method, params) => {
    if (method === "blockchain.scripthash.get_mempool") return mempool.map((tx_hash) => ({ tx_hash }));
    if (method === "blockchain.scripthash.get_history") return [];
    if (method === "blockchain.transaction.get") return txs.get(String(params[0]));
    throw new Error("unexpected " + method);
  });
  try {
    const pay = (v: number, extra: Array<{ value: number; scriptPubKey: { hex: string } }> = []) => ({ vout: [{ value: v / 1e8, scriptPubKey: { hex: merchantHex } }, ...extra] });
    // someone else's payment of the same amount, seen by this server before the quote existed
    txs.set("aa".repeat(32), pay(want));
    await db.exec("INSERT INTO qr_seen (txid, first_seen) VALUES (?, ?)", ["aa".repeat(32), Date.now() - 20 * 60_000]);
    // a tagged (wallet / office) payment of the same amount
    txs.set("bb".repeat(32), pay(want, [{ value: 0, scriptPubKey: { hex: binToHex(opret("LD1:other:validate")) } }]));
    // the wrong amount
    txs.set("cc".repeat(32), pay(want + 1));
    mempool = ["aa".repeat(32), "bb".repeat(32), "cc".repeat(32)];
    let r = await noAi(() => call(`/api/projects/${id}/pay`, { stage: "validate", watch: true }, key));
    assert.equal(r.status, 200);
    assert.equal(r.json.payments.validate, undefined, "none of these is this quote's payment");
    // the customer's own payment, new since the quote
    txs.set("dd".repeat(32), pay(want));
    mempool.push("dd".repeat(32));
    r = await noAi(() => call(`/api/projects/${id}/pay`, { stage: "validate", watch: true }, key));
    assert.equal(r.status, 200);
    assert.equal(r.json.payments.validate.txid, "dd".repeat(32));
    assert.equal(r.json.payments.validate.sats, want);
  } finally {
    chain.__setElectrumTransport(null);
  }
});

test.after(() => {
  stub.close();
  globalThis.fetch = realFetch;
});

// ---- prices come from config (env PRICE_VALIDATE_CENTS / PRICE_BUILD_CENTS), never from UI copy --------------------
test("prices: /api/config carries the stage prices and the cheapest office task", async () => {
  const r = await app.request("http://example.test/api/config");
  const c = (await r.json()) as { prices: { validate: number; build: number }; officesFromCents: number };
  assert.deepEqual(c.prices, config.priceCents);
  const { TASKS } = await import("../server/offices/catalog.js");
  assert.equal(c.officesFromCents, Math.min(...Object.values(TASKS).map((t) => t.cents)));
});

test("prices: the home page is served with the configured prices in every data-price span and the meta text", async () => {
  const { withPrices } = await import("../server/app.js");
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  const before = { ...config.priceCents };
  config.priceCents.validate = 20;
  config.priceCents.build = 150;
  try {
    const out = withPrices(src);
    const spans = [...out.matchAll(/<(?:span|tspan) data-price="(\w+)">([^<]*)</g)].map((m) => `${m[1]}=${m[2]}`);
    assert.ok(spans.length >= 15, `found ${spans.length} price spans`);
    assert.ok(spans.every((x) => ["validate=20¢", "build=$1.50", "offices=from 2¢"].includes(x)), spans.join(", "));
    assert.match(out, /<meta name="description" content="Check your business idea for 20¢/);
    // no price left outside a data-price span in the page body
    const body = out.slice(out.indexOf("<body"));
    const loose = body.replace(/<(span|tspan) data-price="\w+">[^<]*<\/\1>/g, "").match(/\b(10|50)¢|from 2¢/g);
    assert.equal(loose, null, "every body price is a data-price span");
  } finally {
    Object.assign(config.priceCents, before);
  }
});

test("prices: the proto UI formats whatever the server sends", async () => {
  const p = await import("../web/proto/prices.ts");
  assert.equal(p.priceText("validate"), "10¢");
  assert.equal(p.priceText("offices"), "from 2¢");
  p.setPrices({ prices: { validate: 25, build: 120 }, officesFromCents: 3 });
  assert.equal(p.priceText("validate"), "25¢");
  assert.equal(p.priceText("build"), "$1.20");
  assert.equal(p.priceText("offices"), "from 3¢");
  assert.equal(p.priceWords("build"), "1.20 dollars");
  assert.match(p.priceHtml("validate"), /^<span data-price="validate">25¢<\/span>$/);
  p.setPrices({ prices: { validate: 0, build: Number.NaN } }); // nonsense is ignored
  assert.equal(p.centsOf("validate"), 25);
  p.setPrices({ prices: { validate: 10, build: 50 }, officesFromCents: 2 });
});
