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

const chain = await import("../server/chain.js");
const { app } = await import("../server/app.js");
const { migrate, exec } = await import("../server/db.js");
const { config } = await import("../server/config.js");
const { installEscrow } = await import("../server/escrow/install.js");
const { escrowTick } = await import("../server/escrow/watch.js");
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
