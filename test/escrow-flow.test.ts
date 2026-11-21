// Run: node_modules/.bin/tsx --test test/escrow-flow.test.ts
// "Pay only if it delivers", end to end through the real Hono app with installEscrow() in front of it:
// quote -> the customer's wallet pays the per-order contract -> /pay -> the (sample-data) team runs -> the watcher
// releases with OP_RETURN "LD1" <sha256(report)> -> the proof routes; plus the refund drill and a wallet that paid
// without coming back to /pay. Every transaction is evaluated by the BCH VM inside CashScript's MockNetworkProvider,
// reached through chain.ts's own electrum() (test transport). No network, no AI calls, nothing broadcast anywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { binToHex, decodeTransaction, encodePrivateKeyWif, hexToBin } from "@bitauth/libauth";
import { MockNetworkProvider, SignatureTemplate, TransactionBuilder, randomUtxo } from "cashscript";
import { Hono } from "hono";

const wif = (fill: number) => encodePrivateKeyWif(new Uint8Array(32).fill(fill), "testnet");
const dir = mkdtempSync(join(tmpdir(), "launchdesk-escrow-"));
const { p2pkhAddress, keyOf, readDeliveryHash } = await import("../server/escrow/contract.js");
const MERCHANT = p2pkhAddress(new Uint8Array(20).fill(0xaa), "chipnet");
Object.assign(process.env, {
  NODE_ENV: "test",
  PRICE_NOW: "2026-11-20T12:00:00Z", // inside the BLAZE launch window (10¢ / 50¢); test/pricing.test.ts covers the switch
  MOCK_AI: "1", // the team runs on sample data; the pay step flips config.mockAi off (no key is set: no AI call possible)
  MOCK_DELAY_MS: "5",
  DEV_SKIP_PAYMENT: "0",
  BCH_USD_FIXED: "400",
  DATABASE_URL: `file:${join(dir, "t.db")}`,
  MERCHANT_ADDRESS: MERCHANT,
  ESCROW: "1",
  ESCROW_NETWORK: "chipnet",
  ESCROW_WIF: wif(1),
  ESCROW_ORACLE_WIF: wif(2),
  ESCROW_TIMEOUT_BLOCKS: "6",
  ELECTRUM_SERVERS: "wss://unused.invalid:1",
});
delete process.env.ANTHROPIC_API_KEY;

// The AI provider, faked before the app wraps fetch for the brake: every call answers "credit balance is too low".
// Only the "AI out of credit" test below makes AI calls (with config.mockAi off for that run); nothing leaves the machine.
const CREDIT = JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." } });
let aiCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (new URL(url).host === "api.anthropic.com") {
    aiCalls++;
    return new Response(CREDIT, { status: 400, headers: { "content-type": "application/json" } });
  }
  return realFetch(input, init);
}) as typeof fetch;

const chain = await import("../server/chain.js");
const { app } = await import("../server/app.js");
const { migrate, exec } = await import("../server/db.js");
const { config } = await import("../server/config.js");
const { installEscrow } = await import("../server/escrow/install.js");
const { escrowTick, deliveredReport } = await import("../server/escrow/watch.js");
const { runV7, loadV7, undeliveredReason, sourcedBlocksOf } = await import("../server/jobs-v7.js");
const { getProject } = await import("../server/db.js");
const brake = await import("../server/brake.js");
const { escrowStraySweep } = await import("../server/escrow/service.js");
await migrate();

// ---- a fake Fulcrum on top of the mock network ------------------------------------------------------------------------
const mock = new MockNetworkProvider();
let tip = 900_000;
const heights = new Map<string, number>(); // txid -> block height (0 = mempool)
const broadcasts: string[] = [];
const shOf = (lockHex: string) => binToHex(Uint8Array.from(createHash("sha256").update(hexToBin(lockHex)).digest()).reverse());
chain.__setElectrumTransport(async (method, params) => {
  if (method === "blockchain.transaction.broadcast") {
    const txid = await mock.sendRawTransaction(String(params[0])).catch((e: Error) => {
      throw new chain.RpcError(e.message);
    });
    if (!heights.has(txid)) heights.set(txid, 0);
    broadcasts.push(txid);
    return txid;
  }
  if (method === "blockchain.transaction.get") {
    const hex = await mock.getRawTransaction(String(params[0]));
    if (!hex) throw new chain.RpcError("No such mempool or blockchain transaction");
    return hex;
  }
  if (method === "blockchain.scripthash.listunspent") {
    const set = (mock as unknown as { utxoSet: Array<[string, { txid: string; vout: number; satoshis: bigint }]> }).utxoSet;
    return set.filter(([lock]) => shOf(lock) === params[0]).map(([, u]) => ({ tx_hash: u.txid, tx_pos: u.vout, value: Number(u.satoshis), height: heights.get(u.txid) ?? 1 }));
  }
  if (method === "blockchain.headers.subscribe") return { height: tip };
  throw new Error("unexpected electrum call " + method);
});
/** Confirms everything in the mempool, then adds `n - 1` more blocks on top. */
const mine = (n: number) => {
  tip++;
  for (const [t, h] of heights) if (h === 0) heights.set(t, tip);
  tip += n - 1;
};

// ---- the customer's wallet (a P2PKH coin on the mock network) ------------------------------------------------------
const CUSTOMER_KEY = keyOf(wif(5));
const CUSTOMER = p2pkhAddress(createHash("ripemd160").update(createHash("sha256").update(CUSTOMER_KEY.pub).digest()).digest(), "chipnet");
function walletPays(to: string, sats: number, tag: string): string {
  const coin = mock.addUtxo(CUSTOMER, randomUtxo({ satoshis: BigInt(sats) + 5_000n }));
  return new TransactionBuilder({ provider: mock })
    .addInput(coin, new SignatureTemplate(CUSTOMER_KEY.priv).unlockP2PKH())
    .addOutput({ to, amount: BigInt(sats) })
    .addOpReturnOutput([tag])
    .addOutput({ to: CUSTOMER, amount: 4_000n })
    .build();
}

test("flag off: installEscrow adds nothing", () => {
  const h = new Hono();
  delete process.env.ESCROW;
  try {
    installEscrow(h, { watch: false });
  } finally {
    process.env.ESCROW = "1";
  }
  assert.equal(h.routes.length, 0);
});

// ---- the app as it runs with ESCROW=1 (installEscrow first, then every existing route) -------------------------------
const server = new Hono();
installEscrow(server, { watch: false });
server.route("/", app);
async function call<T = any>(method: string, path: string, body?: unknown, key?: string) {
  const res = await server.request("http://localhost" + path, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(key ? { "x-owner-key": key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json: json as T, text };
}
async function newProject() {
  const r = await call<{ id: string; ownerKey: string }>("POST", "/api/projects", { idea: config.sampleIdeas[0] });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json;
}
const realMoney = <T>(fn: () => Promise<T>) => async () => {
  config.mockAi = false; // what a real server looks like at quote/pay time
  try {
    return await fn();
  } finally {
    config.mockAi = true;
  }
};
async function runToDone(id: string, key: string) {
  assert.equal((await call("POST", `/api/projects/${id}/run`, { stage: "validate" }, key)).status, 200);
  for (let i = 0; i < 600; i++) {
    const p = (await call("GET", `/api/projects/${id}`)).json;
    if (p.results?.v7?.status === "done" && ["mia", "leo", "sam"].every((d) => p.status[d] === "done")) return p;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("run did not finish");
}

test("release: quote -> contract address -> pay -> report -> released with the report fingerprint on chain", async () => {
  const { id, ownerKey } = await newProject();
  const tag = chain.paymentTag(id, "validate");

  const noWallet = await realMoney(() => call("POST", `/api/projects/${id}/quote`, { stage: "validate" }, ownerKey))();
  assert.equal(noWallet.status, 400);
  assert.match(noWallet.json.error, /Connect your wallet/);

  const q = await realMoney(() => call("POST", `/api/projects/${id}/quote`, { stage: "validate", refundAddress: CUSTOMER }, ownerKey))();
  assert.equal(q.status, 200, JSON.stringify(q.json));
  assert.match(q.json.address, /^bchtest:p/); // the order's own contract, not the merchant
  assert.notEqual(q.json.address, MERCHANT);
  assert.equal(q.json.bip21, undefined);
  assert.equal(q.json.escrow.timeoutBlocks, 6);
  assert.equal(q.json.tag, tag);

  // A wallet paying LaunchDesk directly is refused while escrow is on.
  const direct = await realMoney(() => call("POST", `/api/projects/${id}/pay`, { stage: "validate", txHex: walletPays(MERCHANT, q.json.sats, tag) }, ownerKey))();
  assert.equal(direct.status, 400);
  assert.match(direct.json.error, /safe address/);
  assert.equal((await realMoney(() => call("POST", `/api/projects/${id}/pay`, { stage: "validate", watch: true }, ownerKey))()).status, 400);

  const txHex = walletPays(q.json.address, q.json.sats, tag);
  const paid = await realMoney(() => call("POST", `/api/projects/${id}/pay`, { stage: "validate", txHex }, ownerKey))();
  assert.equal(paid.status, 200, JSON.stringify(paid.json));
  const fundingTxid = paid.json.payments.validate.txid;
  assert.equal(paid.json.payments.validate.sats, q.json.sats);
  assert.ok(broadcasts.includes(fundingTxid));
  let st = (await call("GET", `/api/escrow/${id}/validate`)).json;
  assert.equal(st.state, "funded");
  assert.equal(st.fundingTxid, fundingTxid);
  // Same tx again (double click): no second order, same answer.
  assert.equal((await realMoney(() => call("POST", `/api/projects/${id}/pay`, { stage: "validate", txHex }, ownerKey))()).status, 200);
  // The address can't be redirected after funding.
  assert.equal((await realMoney(() => call("POST", `/api/projects/${id}/quote`, { stage: "validate", refundAddress: MERCHANT }, ownerKey))()).json.address, q.json.address);

  // Not delivered yet: nothing is released, and a refund is not open before the timeout.
  assert.deepEqual(await escrowTick(), { funded: 0, released: 0, refunded: 0 });
  mine(1);
  const early = await call("POST", `/api/escrow/${id}/validate/refund`);
  assert.equal(early.status, 200);
  assert.equal(early.json.waitBlocks, 5);
  assert.equal((await call("GET", `/api/escrow/${id}/validate/report`)).status, 404);

  const p = await runToDone(id, ownerKey);
  const t = await escrowTick();
  assert.equal(t.released, 1);
  st = (await call("GET", `/api/escrow/${id}/validate`)).json;
  assert.equal(st.state, "released");
  assert.match(st.releaseUrl, new RegExp(st.releaseTxid));

  // The proof: the report bytes, their SHA-256, and the OP_RETURN of the release tx all agree.
  const body = (await call("GET", `/api/escrow/${id}/validate/report`)).text;
  assert.equal(body, JSON.stringify(p.results.v7.report));
  const hash = createHash("sha256").update(body, "utf8").digest("hex");
  assert.equal(st.reportHash, hash);
  const rel = decodeTransaction(hexToBin((await mock.getRawTransaction(st.releaseTxid))!));
  assert.ok(typeof rel !== "string");
  assert.equal(readDeliveryHash(rel.outputs[1]!.lockingBytecode), hash);
  assert.equal(binToHex(rel.outputs[1]!.lockingBytecode).slice(0, 10), "6a034c4431"); // OP_RETURN "LD1"
  assert.ok(Number(rel.outputs[0]!.valueSatoshis) >= q.json.sats - 2000);

  assert.deepEqual(await escrowTick(), { funded: 0, released: 0, refunded: 0 }); // idempotent
  assert.equal((await call("POST", `/api/escrow/${id}/validate/refund`)).status, 409);
});

test("refund: no report in time -> the coins go back to the customer's wallet", async () => {
  const { id, ownerKey } = await newProject();
  const q = await realMoney(() => call("POST", `/api/projects/${id}/quote`, { stage: "validate", refundAddress: CUSTOMER }, ownerKey))();
  const paid = await realMoney(() => call("POST", `/api/projects/${id}/pay`, { stage: "validate", txHex: walletPays(q.json.address, q.json.sats, chain.paymentTag(id, "validate")) }, ownerKey))();
  assert.equal(paid.status, 200);
  mine(5);
  assert.equal((await call("POST", `/api/escrow/${id}/validate/refund`)).json.waitBlocks, 1);
  mine(1);
  // The sweep waits for its wall-clock estimate; the button does not.
  const r = await call("POST", `/api/escrow/${id}/validate/refund`);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const st = (await call("GET", `/api/escrow/${id}/validate`)).json;
  assert.equal(st.state, "refunded");
  assert.equal(st.refundTxid, r.json.txid);
  const tx = decodeTransaction(hexToBin((await mock.getRawTransaction(r.json.txid))!));
  assert.ok(typeof tx !== "string");
  assert.equal(tx.outputs.length, 1);
  const lock = (await mock.getUtxos(CUSTOMER)).find((u) => u.txid === r.json.txid);
  assert.ok(lock && Number(lock.satoshis) >= q.json.sats - 2000);
  // Refunded: the payment is marked so, and the team can no longer be started on it (no AI for returned money).
  const pr = await exec("SELECT refunded_at FROM payments WHERE project_id = ? AND stage = 'validate'", [id]);
  assert.ok(Number(pr.rows[0]?.refunded_at) > 0, "the payment row is marked refunded");
  const run = await call("POST", `/api/projects/${id}/run`, { stage: "validate" }, ownerKey);
  assert.equal(run.status, 402, JSON.stringify(run.json));
  assert.match(run.json.error, /refunded/);
  assert.equal((await call("GET", `/api/projects/${id}`)).json.payments.validate.refunded, true);
  assert.equal((await escrowTick()).released, 0);
});

test("late report: past the timeout the watcher refunds instead of releasing", async () => {
  const { id, ownerKey } = await newProject();
  const q = await realMoney(() => call("POST", `/api/projects/${id}/quote`, { stage: "validate", refundAddress: CUSTOMER }, ownerKey))();
  await realMoney(() => call("POST", `/api/projects/${id}/pay`, { stage: "validate", txHex: walletPays(q.json.address, q.json.sats, chain.paymentTag(id, "validate")) }, ownerKey))();
  mine(7);
  await runToDone(id, ownerKey);
  assert.deepEqual(await escrowTick(), { funded: 0, released: 0, refunded: 1 });
  assert.equal((await call("GET", `/api/escrow/${id}/validate`)).json.state, "refunded");
});

test("delivered or not: the rule that decides whether a finished run may be released", () => {
  const live = { mock: false, sourcedBlocks: 4, fromNotes: false, creditHit: false };
  assert.equal(undeliveredReason(live), null, "research and a model write-up: delivered");
  assert.equal(undeliveredReason({ ...live, sourcedBlocks: 1 }), null, "some research and a model write-up: delivered");
  assert.equal(undeliveredReason({ ...live, sourcedBlocks: 2, fromNotes: true }), null, "some research, the writer failed for another reason (timeout, 500s): delivered from the notes");
  assert.equal(undeliveredReason({ ...live, sourcedBlocks: 2, fromNotes: true, creditHit: true }), "no-credit", "the writer fell back because credit ran out during the run");
  assert.equal(undeliveredReason({ ...live, creditHit: true }), null, "a credit error during research, but the model still wrote it: delivered");
  assert.equal(undeliveredReason({ ...live, sourcedBlocks: 0 }), "no-research", "zero sources is never released, even if the model wrote it");
  assert.equal(undeliveredReason({ ...live, sourcedBlocks: 0, fromNotes: true, creditHit: true }), "no-research");
  assert.equal(undeliveredReason({ ...live, mock: true, sourcedBlocks: 0, fromNotes: true, creditHit: true }), null, "sample runs always deliver");
});

test("ok blocks with gap-only notes and zero sources count as no research", () => {
  const gapOnly = { ok: true, cites: [] as string[] };
  assert.equal(sourcedBlocksOf([gapOnly, gapOnly, gapOnly, gapOnly]), 0, "every block ok but no cites: zero sourced blocks");
  assert.equal(undeliveredReason({ mock: false, sourcedBlocks: sourcedBlocksOf([gapOnly, gapOnly]), fromNotes: false, creditHit: false }), "no-research", "never released");
  assert.equal(sourcedBlocksOf([gapOnly, { ok: true, cites: ["https://a.example"] }, { ok: false, cites: [] }]), 1);
});

test("AI out of credit: the paid report fails, nothing is released, the escrow refunds the customer", async () => {
  const { id, ownerKey } = await newProject();
  const q = await realMoney(() => call("POST", `/api/projects/${id}/quote`, { stage: "validate", refundAddress: CUSTOMER }, ownerKey))();
  const paid = await realMoney(() => call("POST", `/api/projects/${id}/pay`, { stage: "validate", txHex: walletPays(q.json.address, q.json.sats, chain.paymentTag(id, "validate")) }, ownerKey))();
  assert.equal(paid.status, 200, JSON.stringify(paid.json));
  // The other validate departments finished, so only the report decides whether the order is delivered.
  for (const dept of ["mia", "leo", "sam"])
    await exec("INSERT INTO jobs (project_id, dept, stage, status, queued_at, finished_at) VALUES (?, ?, 'validate', 'done', ?, ?) ON CONFLICT(project_id, dept) DO UPDATE SET status = 'done'", [id, dept, Date.now(), Date.now()]);

  // A real (non-mock) report run whose every AI call answers 400 "credit balance is too low".
  const key = config.anthropicKey;
  config.mockAi = false;
  (config as { anthropicKey: string }).anthropicKey = "test-placeholder-not-a-key";
  try {
    await runV7(id, config.sampleIdeas[0]!);
  } finally {
    config.mockAi = true;
    (config as { anthropicKey: string }).anthropicKey = key;
  }
  try {
    assert.ok(aiCalls > 0, "the run did call the (fake) AI");
    assert.equal(brake.creditOut(), true, "the credit error tripped the brake");
    assert.ok(brake.creditErrors() > 0, "the credit answers were counted");
    const v7 = await loadV7(id);
    assert.equal(v7?.status, "error", "an estimates-only fallback is not a delivered report");
    assert.match(String(v7?.error), /comes back to your wallet by itself in about an hour/, "the wait comes from this order's own timeout (6 blocks)");
    const p = (await getProject(id))!;
    assert.equal(p.status.sam, "done");
    assert.equal(deliveredReport(p, "validate"), null);
    assert.equal((await call("GET", `/api/escrow/${id}/validate/report`)).status, 404);

    // The watcher never releases it...
    assert.deepEqual(await escrowTick(), { funded: 0, released: 0, refunded: 0 });
    assert.equal((await call("GET", `/api/escrow/${id}/validate`)).json.state, "funded");
    // ...and once the timeout is past, the existing refund sweep sends the money back.
    mine(6);
    await exec("UPDATE escrow_orders SET funded_at = ? WHERE project_id = ?", [Date.now() - 2 * 60 * 60_000, id]);
    const t = await escrowTick();
    assert.equal(t.released, 0);
    assert.equal(t.refunded, 1);
    const st = (await call("GET", `/api/escrow/${id}/validate`)).json;
    assert.equal(st.state, "refunded");
    assert.ok((await mock.getUtxos(CUSTOMER)).some((u) => u.txid === st.refundTxid));
  } finally {
    brake._resetBrake(); // the rest of this file takes payments again
  }
});

test("watch funding: the wallet paid but the browser never came back to /pay", async () => {
  const { id, ownerKey } = await newProject();
  const q = await realMoney(() => call("POST", `/api/projects/${id}/quote`, { stage: "validate", refundAddress: CUSTOMER }, ownerKey))();
  // The wallet broadcasts by itself (straight to the network, not through LaunchDesk).
  heights.set(await mock.sendRawTransaction(walletPays(q.json.address, q.json.sats, chain.paymentTag(id, "validate"))), 0);
  const t = await escrowTick();
  assert.equal(t.funded, 1);
  const pay = await exec("SELECT sats FROM payments WHERE project_id = ? AND stage = 'validate'", [id]);
  assert.equal(Number(pay.rows[0]?.sats), q.json.sats);
  // The watcher also started the run; once the report is done the next tick releases it.
  for (let i = 0; i < 600; i++) {
    const p = (await call("GET", `/api/projects/${id}`)).json;
    if (p.results?.v7?.status === "done" && p.status.sam === "done") break;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal((await escrowTick()).released, 1);
  assert.equal((await call("GET", `/api/escrow/${id}/validate`)).json.state, "released");
});

test("re-quote by a non-owner: refused, the owner's contract address and refund address stay", async () => {
  const { id, ownerKey } = await newProject();
  const q = await realMoney(() => call("POST", `/api/projects/${id}/quote`, { stage: "validate", refundAddress: CUSTOMER }, ownerKey))();
  assert.equal(q.status, 200);
  const ATTACKER = p2pkhAddress(new Uint8Array(20).fill(0xbb), "chipnet");
  // no key, and a wrong key: both refused before any escrow order is written
  const noKey = await realMoney(() => call("POST", `/api/projects/${id}/quote`, { stage: "validate", refundAddress: ATTACKER }))();
  assert.equal(noKey.status, 403);
  const wrongKey = await realMoney(() => call("POST", `/api/projects/${id}/quote`, { stage: "validate", refundAddress: ATTACKER }, "not-the-owner"))();
  assert.equal(wrongKey.status, 403);
  const row = await exec("SELECT address, refund_address FROM escrow_orders WHERE project_id = ? AND stage = 'validate'", [id]);
  assert.equal(String(row.rows[0]?.address), q.json.address);
  assert.equal(String(row.rows[0]?.refund_address), CUSTOMER);
  // the owner's signed payment to the first address is still accepted
  const paid = await realMoney(() => call("POST", `/api/projects/${id}/pay`, { stage: "validate", txHex: walletPays(q.json.address, q.json.sats, chain.paymentTag(id, "validate")) }, ownerKey))();
  assert.equal(paid.status, 200);
});

const customerCoins = async () => (await mock.getUtxos(CUSTOMER)).map((u) => `${u.txid}:${Number(u.satoshis)}`);

test("strays: an underpayment at an order address goes back after the timeout and never funds the order", async () => {
  const { id, ownerKey } = await newProject();
  const tag = chain.paymentTag(id, "validate");
  const q = await realMoney(() => call("POST", `/api/projects/${id}/quote`, { stage: "validate", refundAddress: CUSTOMER }, ownerKey))();
  const under = walletPays(q.json.address, q.json.sats - 3_000, tag); // below the price: never "funded"
  const underTxid = await mock.sendRawTransaction(under);
  heights.set(underTxid, 0);
  assert.equal((await escrowTick()).funded, 0);
  assert.equal(await escrowStraySweep(), 0, "not deep enough yet");
  mine(6);
  const before = await customerCoins();
  assert.equal(await escrowStraySweep(), 1);
  const back = (await customerCoins()).filter((c) => !before.includes(c));
  assert.equal(back.length, 1, "one refund output to the order's refund address");
  assert.ok(Number(back[0]!.split(":")[1]) >= q.json.sats - 3_000 - 2_000);
  assert.equal(await escrowStraySweep(), 0, "idempotent");
  // The returned coins can never be turned into a paid order afterwards.
  const pay = await realMoney(() => call("POST", `/api/projects/${id}/pay`, { stage: "validate", txHex: under }, ownerKey))();
  assert.equal(pay.status, 400);
  const paid = await exec("SELECT 1 FROM payments WHERE project_id = ?", [id]);
  assert.equal(paid.rows.length, 0);
  assert.equal((await call("GET", `/api/escrow/${id}/validate`)).json.state, "quoted");
});

test("strays: a second payment to a funded order goes back; the order's own coin stays", async () => {
  const { id, ownerKey } = await newProject();
  const tag = chain.paymentTag(id, "validate");
  const q = await realMoney(() => call("POST", `/api/projects/${id}/quote`, { stage: "validate", refundAddress: CUSTOMER }, ownerKey))();
  const paid = await realMoney(() => call("POST", `/api/projects/${id}/pay`, { stage: "validate", txHex: walletPays(q.json.address, q.json.sats, tag) }, ownerKey))();
  assert.equal(paid.status, 200);
  const second = await mock.sendRawTransaction(walletPays(q.json.address, q.json.sats, tag));
  heights.set(second, 0);
  mine(6);
  assert.equal(await escrowStraySweep(), 1, "only the extra coin");
  const st = (await call("GET", `/api/escrow/${id}/validate`)).json;
  assert.equal(st.state, "funded", "the order itself is untouched (its own refund/release path decides)");
  assert.equal(st.fundingTxid, paid.json.payments.validate.txid);
  const row = await exec("SELECT txid, refund_txid FROM escrow_strays WHERE project_id = ?", [id]);
  assert.equal(String(row.rows[0]!.txid), second);
  assert.ok(row.rows[0]!.refund_txid);
});

test("strays: a full payment to a stale quote is returned, and /pay can no longer turn it into a run", async () => {
  const { id, ownerKey } = await newProject();
  const tag = chain.paymentTag(id, "validate");
  const q = await realMoney(() => call("POST", `/api/projects/${id}/quote`, { stage: "validate", refundAddress: CUSTOMER }, ownerKey))();
  await exec("UPDATE escrow_orders SET updated_at = ? WHERE project_id = ?", [Date.now() - 4 * 60 * 60_000, id]); // nobody watches it any more
  const late = walletPays(q.json.address, q.json.sats, tag);
  const lateTxid = await mock.sendRawTransaction(late);
  heights.set(lateTxid, 0);
  assert.equal((await escrowTick()).funded, 0, "a stale quote is not funded by the watcher");
  mine(6);
  await escrowStraySweep();
  const row = await exec("SELECT refund_txid FROM escrow_strays WHERE txid = ?", [lateTxid]);
  assert.ok(row.rows[0]?.refund_txid, "sent back");
  const pay = await realMoney(() => call("POST", `/api/projects/${id}/pay`, { stage: "validate", txHex: late }, ownerKey))();
  assert.equal(pay.status, 400);
  assert.match(pay.json.error, /sent back/);
  assert.equal((await exec("SELECT 1 FROM payments WHERE project_id = ?", [id])).rows.length, 0, "no payment, so no run");
});

test("strays: a coin already claimed as stray (refund broadcast failed) never becomes a payment or a run", async () => {
  const { id, ownerKey } = await newProject();
  const tag = chain.paymentTag(id, "validate");
  const q = await realMoney(() => call("POST", `/api/projects/${id}/quote`, { stage: "validate", refundAddress: CUSTOMER }, ownerKey))();
  const hex = walletPays(q.json.address, q.json.sats, tag);
  const txid = await mock.sendRawTransaction(hex);
  heights.set(txid, 0);
  // The sweep claimed it earlier and its refund broadcast failed: the claim stays, the coin stays unspent.
  await exec("INSERT INTO escrow_strays (txid, vout, project_id, stage, sats, note, at) VALUES (?, 0, ?, 'validate', ?, 'refund: network down', ?)", [txid, id, q.json.sats, Date.now()]);
  assert.equal((await escrowTick()).funded, 0, "the watcher skips a stray coin");
  assert.equal((await exec("SELECT 1 FROM payments WHERE project_id = ?", [id])).rows.length, 0, "no payment row from the watcher");
  const pay = await realMoney(() => call("POST", `/api/projects/${id}/pay`, { stage: "validate", txHex: hex }, ownerKey))();
  assert.equal(pay.status, 400);
  assert.equal((await exec("SELECT 1 FROM payments WHERE project_id = ?", [id])).rows.length, 0, "no payment row from /pay");
  assert.equal((await call("GET", `/api/escrow/${id}/validate`)).json.state, "quoted");
});

test("strays: the sweep only looks at orders changed in the last 7 days (plus funded ones)", async () => {
  const { id, ownerKey } = await newProject();
  const tag = chain.paymentTag(id, "validate");
  const q = await realMoney(() => call("POST", `/api/projects/${id}/quote`, { stage: "validate", refundAddress: CUSTOMER }, ownerKey))();
  await exec("UPDATE escrow_orders SET updated_at = ? WHERE project_id = ?", [Date.now() - 8 * 24 * 60 * 60_000, id]);
  heights.set(await mock.sendRawTransaction(walletPays(q.json.address, q.json.sats - 3_000, tag)), 0);
  mine(6);
  await escrowStraySweep();
  assert.equal((await exec("SELECT 1 FROM escrow_strays WHERE project_id = ?", [id])).rows.length, 0, "an old quote's address is not scanned");
});

// ---- v2 (ESCROW_V2=1): the release also gives the customer a receipt NFT -------------------------------------------
test("v2: with ESCROW_V2=1 a new order uses the receipt contract; an order quoted before keeps v1", async () => {
  // This file creates many projects from one test "IP": lift the per-IP limits for the v2 tests below.
  config.rateLimit.create = 1000;
  config.rateLimit.run = 1000;
  // An order quoted (and paid) while the flag was off...
  const old = await newProject();
  const oq = await realMoney(() => call("POST", `/api/projects/${old.id}/quote`, { stage: "validate", refundAddress: CUSTOMER }, old.ownerKey))();
  assert.equal((await realMoney(() => call("POST", `/api/projects/${old.id}/pay`, { stage: "validate", txHex: walletPays(oq.json.address, oq.json.sats, chain.paymentTag(old.id, "validate")) }, old.ownerKey))()).status, 200);
  process.env.ESCROW_V2 = "1";
  try {
    const { id, ownerKey } = await newProject();
    const q = await realMoney(() => call("POST", `/api/projects/${id}/quote`, { stage: "validate", refundAddress: CUSTOMER }, ownerKey))();
    assert.equal(q.status, 200, JSON.stringify(q.json));
    assert.equal((await exec("SELECT contract_version FROM escrow_orders WHERE project_id = ?", [id])).rows[0]?.contract_version, 2);
    assert.equal((await exec("SELECT contract_version FROM escrow_orders WHERE project_id = ?", [old.id])).rows[0]?.contract_version, 1);
    const paid = await realMoney(() => call("POST", `/api/projects/${id}/pay`, { stage: "validate", txHex: walletPays(q.json.address, q.json.sats, chain.paymentTag(id, "validate")) }, ownerKey))();
    assert.equal(paid.status, 200, JSON.stringify(paid.json));
    const fundingTxid = paid.json.payments.validate.txid;
    let st = (await call("GET", `/api/escrow/${id}/validate`, undefined, ownerKey)).json;
    assert.equal(st.contractVersion, 2);
    assert.equal(st.receipt, null);
    assert.equal(st.refundDetails.contractVersion, 2);

    await runToDone(id, ownerKey);
    await runToDone(old.id, old.ownerKey);
    assert.equal((await escrowTick()).released, 2);

    st = (await call("GET", `/api/escrow/${id}/validate`)).json;
    assert.equal(st.state, "released");
    assert.equal(st.receipt.category, fundingTxid);
    assert.equal(st.receipt.commitment, st.reportHash);
    assert.equal(st.receipt.url, st.releaseUrl);
    const rel = decodeTransaction(hexToBin((await mock.getRawTransaction(st.releaseTxid))!));
    assert.ok(typeof rel !== "string");
    assert.equal(rel.outputs.length, 3);
    assert.equal(readDeliveryHash(rel.outputs[1]!.lockingBytecode), st.reportHash);
    assert.equal(binToHex(rel.outputs[2]!.token!.category), fundingTxid);
    assert.equal(rel.outputs[2]!.token!.nft!.capability, "none");
    assert.equal(binToHex(rel.outputs[2]!.token!.nft!.commitment), st.reportHash);
    const nft = (await mock.getUtxos(CUSTOMER)).find((u) => u.txid === st.releaseTxid);
    assert.equal(nft?.token?.nft?.commitment, st.reportHash, "the customer's wallet holds the receipt");
    assert.ok(Number(rel.outputs[0]!.valueSatoshis) >= q.json.sats - 2000 - 1000);

    // The v1 order released with its own contract (2 outputs, no receipt).
    const ost = (await call("GET", `/api/escrow/${old.id}/validate`)).json;
    assert.equal(ost.state, "released");
    assert.equal(ost.contractVersion, 1);
    assert.equal(ost.receipt, null);
    const orel = decodeTransaction(hexToBin((await mock.getRawTransaction(ost.releaseTxid))!));
    assert.ok(typeof orel !== "string");
    assert.equal(orel.outputs.length, 2);
  } finally {
    delete process.env.ESCROW_V2;
  }
});

test("v2: a v2 order is still refunded by the keyless path when the report is not delivered", async () => {
  process.env.ESCROW_V2 = "1";
  try {
    const { id, ownerKey } = await newProject();
    const q = await realMoney(() => call("POST", `/api/projects/${id}/quote`, { stage: "validate", refundAddress: CUSTOMER }, ownerKey))();
    assert.equal((await realMoney(() => call("POST", `/api/projects/${id}/pay`, { stage: "validate", txHex: walletPays(q.json.address, q.json.sats, chain.paymentTag(id, "validate")) }, ownerKey))()).status, 200);
    mine(6);
    const r = await call("POST", `/api/escrow/${id}/validate/refund`);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const st = (await call("GET", `/api/escrow/${id}/validate`)).json;
    assert.equal(st.state, "refunded");
    assert.equal(st.contractVersion, 2);
  } finally {
    delete process.env.ESCROW_V2;
  }
});
