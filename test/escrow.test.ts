// Run: node_modules/.bin/tsx --test test/escrow.test.ts
// Escrow covenant ("Pay only if it delivers"), fully offline on CashScript's MockNetworkProvider: every tx below is
// evaluated by the real BCH VM (libauth), nothing touches mainnet or chipnet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { binToHex, encodePrivateKeyWif, encodeTransaction, hexToBin, decodeTransaction, utf8ToBin } from "@bitauth/libauth";
import { MockNetworkProvider, SignatureTemplate, TransactionBuilder, randomUtxo } from "cashscript";
import {
  MAX_FEE_SATS,
  buildRefund,
  buildRelease,
  checkFunding,
  deliveryOpReturn,
  fundingUtxo,
  keyOf,
  makeEscrow,
  p2pkhAddress,
  readDeliveryHash,
  reportHashOf,
  signReport,
  type Escrow,
  type Funding,
} from "../server/escrow/contract.js";

const wif = (fill: number) => encodePrivateKeyWif(new Uint8Array(32).fill(fill), "testnet");
const KEYS = { releaseWif: wif(1), oracleWif: wif(2) };
const pkhAddr = (fill: number) => p2pkhAddress(new Uint8Array(20).fill(fill), "chipnet");
const MERCHANT = pkhAddr(0xaa);
const CUSTOMER = pkhAddr(0xbb);
const THIEF = pkhAddr(0xcc);
const REPORT = JSON.stringify({ title: "Coffee kiosk at a metro exit", verdict: "worth testing" });
const HASH = reportHashOf(REPORT);
const PRICE = 25_000;

function setup(sats = PRICE) {
  const provider = new MockNetworkProvider();
  const escrow = makeEscrow({ ref: "LD1:p123:validate", merchantAddress: MERCHANT, refundAddress: CUSTOMER, timeoutBlocks: 6 }, KEYS, provider);
  const u = provider.addUtxo(escrow.address, randomUtxo({ satoshis: BigInt(sats) }));
  const funding: Funding = { txid: u.txid, vout: u.vout, sats };
  return { provider, escrow, funding };
}
const send = (p: MockNetworkProvider, hex: string) => p.sendRawTransaction(hex);
// Every rejection must come from the contract (the VM), not from a fee or dust rule of the mock network.
const rejects = async (fn: () => unknown) =>
  assert.rejects(async () => fn(), (e: Error) => /evaluating input index 0/.test(e.message));
const releaseUnlock = (e: Escrow, hash = HASH, sig = signReport(e, hash, KEYS), wifKey = KEYS.releaseWif) =>
  e.contract.unlock.release(new SignatureTemplate(keyOf(wifKey).priv), sig, hash);

test("address: one P2SH32 per order, deterministic", () => {
  const { escrow } = setup();
  assert.match(escrow.address, /^bchtest:p/);
  assert.equal(escrow.lockingBytecodeHex.slice(0, 4), "aa20"); // OP_HASH256 <32 bytes>: P2SH32
  const again = makeEscrow({ ref: "LD1:p123:validate", merchantAddress: MERCHANT, refundAddress: CUSTOMER, timeoutBlocks: 6 }, KEYS, new MockNetworkProvider());
  assert.equal(again.address, escrow.address);
  const other = makeEscrow({ ref: "LD1:p124:validate", merchantAddress: MERCHANT, refundAddress: CUSTOMER, timeoutBlocks: 6 }, KEYS, new MockNetworkProvider());
  assert.notEqual(other.address, escrow.address);
});

test("release: pays the merchant and writes OP_RETURN LD1 <reportHash>", async () => {
  const { provider, escrow, funding } = setup();
  const tx = buildRelease(escrow, funding, HASH, KEYS);
  assert.ok(tx.fee > 0 && tx.fee <= MAX_FEE_SATS);
  if (process.env.ESCROW_DEBUG) console.log("  release bytes", tx.hex.length / 2, "fee", tx.fee, "contract bytes", escrow.contract.bytesize);
  const txid = await send(provider, tx.hex);
  assert.equal(txid, tx.txid);
  const d = decodeTransaction(hexToBin(tx.hex));
  assert.ok(typeof d !== "string");
  assert.equal(Number(d.outputs[0].valueSatoshis), PRICE - tx.fee);
  assert.equal(readDeliveryHash(d.outputs[1].lockingBytecode), binToHex(HASH));
  const merchantUtxos = await provider.getUtxos(MERCHANT);
  assert.equal(merchantUtxos.length, 1);
});

test("release rejected: payout to anyone but the merchant", async () => {
  const { provider, escrow, funding } = setup();
  const tb = new TransactionBuilder({ provider })
    .addInput(fundingUtxo(escrow, funding), releaseUnlock(escrow))
    .addOutput({ to: THIEF, amount: BigInt(PRICE - 1000) })
    .addOutput({ to: deliveryOpReturn(HASH), amount: 0n });
  assert.throws(() => tb.debug());
  await rejects(() => send(provider, tb.build()));
});

test("release rejected: merchant output short (value sent to a third output / burnt as fee)", async () => {
  const { provider, escrow, funding } = setup();
  const tb = new TransactionBuilder({ provider })
    .addInput(fundingUtxo(escrow, funding), releaseUnlock(escrow))
    .addOutput({ to: MERCHANT, amount: BigInt(PRICE - MAX_FEE_SATS - 1) })
    .addOutput({ to: deliveryOpReturn(HASH), amount: 0n });
  await rejects(() => send(provider, tb.build()));
  const tb3 = new TransactionBuilder({ provider })
    .addInput(fundingUtxo(escrow, funding), releaseUnlock(escrow))
    .addOutput({ to: MERCHANT, amount: BigInt(PRICE - 9000) })
    .addOutput({ to: deliveryOpReturn(HASH), amount: 0n })
    .addOutput({ to: THIEF, amount: 8000n });
  await rejects(() => send(provider, tb3.build()));
});

test("release rejected: OP_RETURN missing or carrying a different hash than the one signed", async () => {
  const { provider, escrow, funding } = setup();
  const noTag = new TransactionBuilder({ provider })
    .addInput(fundingUtxo(escrow, funding), releaseUnlock(escrow))
    .addOutput({ to: MERCHANT, amount: BigInt(PRICE - 1600) })
    .addOutput({ to: THIEF, amount: 600n });
  await rejects(() => send(provider, noTag.build()));
  const otherHash = reportHashOf("a different report");
  const swapped = new TransactionBuilder({ provider })
    .addInput(fundingUtxo(escrow, funding), releaseUnlock(escrow))
    .addOutput({ to: MERCHANT, amount: BigInt(PRICE - 1000) })
    .addOutput({ to: deliveryOpReturn(otherHash), amount: 0n });
  await rejects(() => send(provider, swapped.build()));
});

test("release rejected: report signature from the wrong key, or made for another order", async () => {
  const { provider, escrow, funding } = setup();
  const forged = signReport(escrow, HASH, { releaseWif: wif(9) });
  const tb = new TransactionBuilder({ provider })
    .addInput(fundingUtxo(escrow, funding), releaseUnlock(escrow, HASH, forged))
    .addOutput({ to: MERCHANT, amount: BigInt(PRICE - 1000) })
    .addOutput({ to: deliveryOpReturn(HASH), amount: 0n });
  await rejects(() => send(provider, tb.build()));
  const otherOrder = makeEscrow({ ref: "LD1:zzz:validate", merchantAddress: MERCHANT, refundAddress: CUSTOMER }, KEYS, provider);
  const replayed = signReport(otherOrder, HASH, KEYS);
  const tb2 = new TransactionBuilder({ provider })
    .addInput(fundingUtxo(escrow, funding), releaseUnlock(escrow, HASH, replayed))
    .addOutput({ to: MERCHANT, amount: BigInt(PRICE - 1000) })
    .addOutput({ to: deliveryOpReturn(HASH), amount: 0n });
  await rejects(() => send(provider, tb2.build()));
});

test("release rejected: tx signed by a key that is not the release key", async () => {
  const { provider, escrow, funding } = setup();
  const tb = new TransactionBuilder({ provider })
    .addInput(fundingUtxo(escrow, funding), releaseUnlock(escrow, HASH, undefined, wif(7)))
    .addOutput({ to: MERCHANT, amount: BigInt(PRICE - 1000) })
    .addOutput({ to: deliveryOpReturn(HASH), amount: 0n });
  await rejects(() => send(provider, tb.build()));
});

test("refund: after the timeout, all of it goes back to the customer, no signature", async () => {
  const { provider, escrow, funding } = setup();
  const tx = buildRefund(escrow, funding);
  await send(provider, tx.hex);
  const d = decodeTransaction(hexToBin(tx.hex));
  assert.ok(typeof d !== "string");
  assert.equal(d.inputs[0].sequenceNumber, 6);
  assert.equal(Number(d.outputs[0].valueSatoshis), PRICE - tx.fee);
  assert.equal((await provider.getUtxos(CUSTOMER)).length, 1);
});

test("refund rejected: too early (relative lock below the timeout)", async () => {
  const { provider, escrow, funding } = setup();
  for (const sequence of [0, 5, 0xffffffff]) {
    const tb = new TransactionBuilder({ provider })
      .addInput(fundingUtxo(escrow, funding), escrow.contract.unlock.refund(), { sequence })
      .addOutput({ to: CUSTOMER, amount: BigInt(PRICE - 1000) });
    assert.throws(() => tb.debug(), undefined, `sequence ${sequence} must fail`);
  }
});

test("refund rejected: to another address, short amount, or an extra output", async () => {
  const { provider, escrow, funding } = setup();
  const u = fundingUtxo(escrow, funding);
  const cases = [
    [{ to: THIEF, amount: BigInt(PRICE - 1000) }],
    [{ to: CUSTOMER, amount: BigInt(PRICE - MAX_FEE_SATS - 1) }],
    [{ to: CUSTOMER, amount: BigInt(PRICE - 9000) }, { to: THIEF, amount: 7000n }],
  ];
  for (const outs of cases) {
    const tb = new TransactionBuilder({ provider }).addInput(u, escrow.contract.unlock.refund(), { sequence: 6 }).addOutputs(outs);
    await rejects(() => send(provider, tb.build()));
  }
});

test("refund rejected: two escrow inputs batched so one refund output covers only one", async () => {
  const { provider, escrow, funding } = setup();
  const u2 = provider.addUtxo(escrow.address, randomUtxo({ satoshis: BigInt(PRICE) }));
  const tb = new TransactionBuilder({ provider })
    .addInput(fundingUtxo(escrow, funding), escrow.contract.unlock.refund(), { sequence: 6 })
    .addInput(u2, escrow.contract.unlock.refund(), { sequence: 6 })
    .addOutput({ to: CUSTOMER, amount: BigInt(PRICE - 1000) })
    .addOutput({ to: THIEF, amount: BigInt(PRICE - 1000) });
  await rejects(() => send(provider, tb.build()));
});

test("checkFunding: accepts the customer's tagged payment, rejects wrong address / small / untagged", () => {
  const { escrow } = setup();
  const lock = hexToBin(escrow.lockingBytecodeHex);
  const tag = (t: string) => { const d = utf8ToBin(t); return Uint8Array.from([0x6a, d.length, ...d]); };
  const other = Uint8Array.from([0x76, 0xa9, 0x14, ...new Uint8Array(20).fill(7), 0x88, 0xac]);
  const tx = (outs: Array<[Uint8Array, bigint]>) =>
    binToHex(encodeTransaction({
      version: 2, locktime: 0,
      inputs: [{ outpointTransactionHash: hexToBin("11".repeat(32)), outpointIndex: 0, sequenceNumber: 0xffffffff, unlockingBytecode: new Uint8Array() }],
      outputs: outs.map(([lockingBytecode, valueSatoshis]) => ({ lockingBytecode, valueSatoshis })),
    }));
  const T = "LD1:p123:validate";
  const ok = checkFunding(tx([[other, 5000n], [lock, 25_000n], [tag(T), 0n]]), escrow, 24_000, T);
  assert.equal(ok.vout, 1);
  assert.equal(ok.sats, 25_000);
  assert.match(ok.txid, /^[0-9a-f]{64}$/);
  assert.throws(() => checkFunding(tx([[other, 25_000n], [tag(T), 0n]]), escrow, 24_000, T), /safe address/);
  assert.throws(() => checkFunding(tx([[lock, 1000n], [tag(T), 0n]]), escrow, 24_000, T), /too small/);
  assert.throws(() => checkFunding(tx([[lock, 25_000n], [tag("LD1:other:validate"), 0n]]), escrow, 24_000, T), /not tagged/);
  assert.throws(() => checkFunding("zz", escrow, 1, T), /Invalid transaction/);
});

test("delivery OP_RETURN round trip", () => {
  assert.equal(readDeliveryHash(deliveryOpReturn(HASH)), binToHex(HASH));
  assert.equal(readDeliveryHash(Uint8Array.from([0x6a, 0x01, 0x00])), null);
});

// ---- server/escrow/service.ts: quote -> pay check -> release, on an in-memory DB, broadcast into a mock network ----
test("service: quote address, payment check, release with the report hash on chain, status + report bytes", async () => {
  Object.assign(process.env, {
    DATABASE_URL: ":memory:",
    MERCHANT_ADDRESS: MERCHANT,
    ESCROW: "1",
    ESCROW_NETWORK: "chipnet",
    ESCROW_WIF: KEYS.releaseWif,
    ESCROW_ORACLE_WIF: KEYS.oracleWif,
    ESCROW_TIMEOUT_BLOCKS: "6",
  });
  const svc = await import("../server/escrow/service.js");
  assert.equal(svc.escrowOn(), true);
  await assert.rejects(svc.escrowQuoteAddress("p9", "validate", "bitcoincash:qp9d679zvayvudj65nd9zlgezvjplr8g3vea64wad0"), /not a chipnet/);
  const q = await svc.escrowQuoteAddress("p9", "validate", CUSTOMER);
  const same = makeEscrow({ ref: "LD1:p9:validate", merchantAddress: MERCHANT, refundAddress: CUSTOMER, timeoutBlocks: 6 }, KEYS, new MockNetworkProvider());
  assert.equal(q.address, same.address);

  // The customer's wallet tx: one output to the contract + the LD1 tag.
  const tag = utf8ToBin("LD1:p9:validate");
  const payHex = binToHex(encodeTransaction({
    version: 2, locktime: 0,
    inputs: [{ outpointTransactionHash: hexToBin("22".repeat(32)), outpointIndex: 0, sequenceNumber: 0xffffffff, unlockingBytecode: new Uint8Array() }],
    outputs: [
      { lockingBytecode: hexToBin(same.lockingBytecodeHex), valueSatoshis: 25_000n },
      { lockingBytecode: Uint8Array.from([0x6a, tag.length, ...tag]), valueSatoshis: 0n },
    ],
  }));
  const paid = await svc.escrowCheckPayment("p9", "validate", payHex, 24_000);
  assert.equal(paid.paidSats, 25_000);
  assert.equal((await svc.escrowStatus("p9", "validate"))?.state, "funded");
  // Re-quote after funding keeps the same address (cannot be redirected).
  assert.equal((await svc.escrowQuoteAddress("p9", "validate", THIEF)).address, q.address);

  const mock = new MockNetworkProvider();
  mock.addUtxo(same.address, { txid: paid.txid, vout: 0, satoshis: 25_000n });
  svc.__setEscrowBroadcast(async (hex) => void (await mock.sendRawTransaction(hex)));
  const rel = await svc.escrowRelease("p9", "validate", REPORT);
  assert.equal(rel.error, undefined);
  assert.equal(rel.reportHash, binToHex(HASH));
  const st = await svc.escrowStatus("p9", "validate");
  assert.equal(st?.state, "released");
  assert.equal(st?.releaseTxid, rel.txid);
  assert.equal(await svc.escrowReportBody("p9", "validate"), REPORT);
  assert.deepEqual(await svc.escrowRelease("p9", "validate", REPORT), { txid: rel.txid, reportHash: rel.reportHash }); // idempotent
  assert.match((await svc.escrowRefund("p9", "validate")).error ?? "", /delivered/);
});
