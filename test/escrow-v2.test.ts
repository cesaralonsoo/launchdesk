// Run: node_modules/.bin/tsx --test test/escrow-v2.test.ts
// Escrow v2 (contracts/LaunchDeskEscrowV2.cash, behind ESCROW_V2=1): a release also gives the customer a CashTokens
// receipt NFT (category = funding txid, immutable, commitment = sha256 of the report). Fully offline: every tx is
// checked by the real BCH VM (libauth) inside CashScript's MockNetworkProvider, including the CashTokens consensus
// rules (genesis only from an input spending outpoint index 0). Nothing touches mainnet/chipnet.
//
// Same attacker model as test/escrow-attacks.test.ts: the attacker holds BOTH LaunchDesk keys. Every attack has a
// control that differs only in the tampered detail, and the control is accepted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { binToHex, decodeTransaction, encodePrivateKeyWif, hexToBin } from "@bitauth/libauth";
import { MockNetworkProvider, SignatureTemplate, TransactionBuilder, type Output } from "cashscript";
import {
  MAX_FEE_SATS,
  RECEIPT_SATS,
  buildRefund,
  buildRelease,
  checkFunding,
  deliveryOpReturn,
  fundingUtxo,
  keyOf,
  makeEscrow,
  mintsReceipt,
  p2pkhAddress,
  p2pkhLock,
  pkhOf,
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
const REF = "LD1:pReceipt:validate";
const REPORT = JSON.stringify({ title: "Bike repair cart at a train station", verdict: "test first" });
const HASH = reportHashOf(REPORT);
const OTHER_HASH = reportHashOf("a different, cheaper report");
const PRICE = 50_000; // about 10 cents
const FEE = 1000;
const lockOf = (address: string) => p2pkhLock(pkhOf(address, "chipnet"));

let txCounter = 0;
function setup(opts: { sats?: number; vout?: number; version?: 1 | 2 } = {}) {
  const provider = new MockNetworkProvider();
  const escrow = makeEscrow({ ref: REF, merchantAddress: MERCHANT, refundAddress: CUSTOMER, timeoutBlocks: 6 }, KEYS, provider, opts.version ?? 2);
  const sats = opts.sats ?? PRICE;
  const txid = (++txCounter).toString(16).padStart(64, "d");
  provider.addUtxo(escrow.address, { txid, vout: opts.vout ?? 0, satoshis: BigInt(sats) });
  const funding: Funding = { txid, vout: opts.vout ?? 0, sats };
  return { provider, escrow, funding };
}
type Ctx = ReturnType<typeof setup>;

const send = (p: MockNetworkProvider, hex: string) => p.sendRawTransaction(hex);
const rejectedByContract = (p: MockNetworkProvider, hex: string) =>
  assert.rejects(send(p, hex), (e: Error) => /evaluating input index 0/.test(e.message));
const rejected = (p: MockNetworkProvider, hex: string) => assert.rejects(send(p, hex));
const accepted = async (p: MockNetworkProvider, hex: string) => assert.match(await send(p, hex), /^[0-9a-f]{64}$/);

const releaseUnlock = (e: Escrow, hash = HASH) =>
  e.contract.unlock.release(new SignatureTemplate(keyOf(KEYS.releaseWif).priv), signReport(e, hash, KEYS), hash);
function release(c: Ctx, outputs: Output[], hash = HASH) {
  return new TransactionBuilder({ provider: c.provider }).addInput(fundingUtxo(c.escrow, c.funding), releaseUnlock(c.escrow, hash)).addOutputs(outputs).build();
}
const merchantOut = (amount: number): Output => ({ to: MERCHANT, amount: BigInt(amount) });
const tagOut = (hash = HASH): Output => ({ to: deliveryOpReturn(hash), amount: 0n });
type Nft = { capability: "none" | "mutable" | "minting"; commitment: string };
/** The honest receipt output, with any field overridden. */
function receiptOut(c: Ctx, o: { to?: string; sats?: number; category?: string; amount?: bigint; nft?: Nft | null } = {}): Output {
  const nft = o.nft === null ? undefined : (o.nft ?? { capability: "none", commitment: binToHex(HASH) });
  return {
    to: lockOf(o.to ?? CUSTOMER),
    amount: BigInt(o.sats ?? RECEIPT_SATS),
    token: { category: o.category ?? c.funding.txid, amount: o.amount ?? 0n, ...(nft ? { nft } : {}) },
  };
}
const honest = (c: Ctx, merchant = PRICE - FEE - RECEIPT_SATS) => [merchantOut(merchant), tagOut(), receiptOut(c)];

// =====================================================================================================================
// Controls
// =====================================================================================================================
test("v2 control: server release pays the merchant, writes the fingerprint and mints the receipt NFT to the customer", async () => {
  const c = setup();
  assert.equal(mintsReceipt(c.escrow, c.funding), true);
  const tx = buildRelease(c.escrow, c.funding, HASH, KEYS);
  const d = decodeTransaction(hexToBin(tx.hex));
  if (typeof d === "string") throw new Error(d);
  assert.equal(d.outputs.length, 3);
  assert.equal(Number(d.outputs[0].valueSatoshis), PRICE - tx.fee - RECEIPT_SATS);
  assert.equal(d.outputs[0].token, undefined);
  assert.equal(binToHex(d.outputs[1].lockingBytecode), binToHex(deliveryOpReturn(HASH)));
  const r = d.outputs[2];
  assert.equal(Number(r.valueSatoshis), RECEIPT_SATS);
  assert.equal(binToHex(r.lockingBytecode), binToHex(lockOf(CUSTOMER)));
  assert.equal(binToHex(r.token!.category), c.funding.txid, "category is the funding txid (display order, like a txid)");
  assert.equal(r.token!.amount, 0n);
  assert.equal(r.token!.nft!.capability, "none");
  assert.equal(binToHex(r.token!.nft!.commitment), binToHex(HASH));
  assert.ok(tx.fee > 0 && tx.fee <= MAX_FEE_SATS);
  await accepted(c.provider, tx.hex);
  const held = await c.provider.getUtxos(CUSTOMER);
  assert.equal(held.length, 1);
  assert.deepEqual(held[0].token, { category: c.funding.txid, amount: 0n, nft: { capability: "none", commitment: binToHex(HASH) } });
});
test("v2 control: release that leaves exactly the maximum fee (2000) next to the receipt is accepted", async () => {
  const c = setup();
  await accepted(c.provider, release(c, honest(c, PRICE - MAX_FEE_SATS - RECEIPT_SATS)));
});
test("v2 control: a 10-cent order (~50k sats) leaves the merchant value - receipt - fee", async () => {
  const c = setup({ sats: 48_123 });
  const tx = buildRelease(c.escrow, c.funding, HASH, KEYS);
  const d = decodeTransaction(hexToBin(tx.hex));
  if (typeof d === "string") throw new Error(d);
  assert.equal(Number(d.outputs[0].valueSatoshis) + Number(d.outputs[2].valueSatoshis) + tx.fee, 48_123);
  await accepted(c.provider, tx.hex);
});
test("v2 control: refund path is unchanged (keyless, everything back to the customer, no token)", async () => {
  const c = setup();
  const tx = buildRefund(c.escrow, c.funding);
  await accepted(c.provider, tx.hex);
  const held = await c.provider.getUtxos(CUSTOMER);
  assert.equal(held.length, 1);
  assert.equal(held[0].token, undefined);
});
test("v2 control: a coin funded at vout 1 (no genesis possible) is released like v1, without the receipt", async () => {
  const c = setup({ vout: 1 });
  assert.equal(mintsReceipt(c.escrow, c.funding), false);
  const tx = buildRelease(c.escrow, c.funding, HASH, KEYS);
  const d = decodeTransaction(hexToBin(tx.hex));
  if (typeof d === "string") throw new Error(d);
  assert.equal(d.outputs.length, 2);
  await accepted(c.provider, tx.hex);
});
test("v2: v1 and v2 contracts for the same order have different addresses (version is part of the order)", () => {
  const a = setup({ version: 1 });
  const b = setup({ version: 2 });
  assert.notEqual(a.escrow.address, b.escrow.address);
  assert.equal(a.escrow.version, 1);
  assert.equal(b.escrow.version, 2);
});
test("v2: checkFunding needs room for the receipt and the fee", () => {
  const c = setup();
  const lock = hexToBin(c.escrow.lockingBytecodeHex);
  // minimal one-output tx paying `sats` to the contract (unsigned input is fine: checkFunding only reads outputs)
  const txHex = (sats: number) =>
    binToHex(
      Uint8Array.from([
        2, 0, 0, 0, 1, ...new Uint8Array(32).fill(7), 0, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 1,
        ...new Uint8Array(new BigUint64Array([BigInt(sats)]).buffer), lock.length, ...lock, 0, 0, 0, 0,
      ]),
    );
  assert.throws(() => checkFunding(txHex(3000), c.escrow, 1), /too small/i);
  assert.equal(checkFunding(txHex(MAX_FEE_SATS + RECEIPT_SATS + 546), c.escrow, 1).vout, 0);
});

// =====================================================================================================================
// Attacks on the receipt (attacker holds both LaunchDesk keys)
// =====================================================================================================================
test("v2 attack: receipt NFT commits to a different report than the one signed and fingerprinted", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE - RECEIPT_SATS), tagOut(), receiptOut(c, { nft: { capability: "none", commitment: binToHex(OTHER_HASH) } })]));
});
test("v2 attack: receipt NFT with an empty or truncated commitment", async () => {
  for (const commitment of ["", binToHex(HASH).slice(0, 62)]) {
    const c = setup();
    await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE - RECEIPT_SATS), tagOut(), receiptOut(c, { nft: { capability: "none", commitment } })]));
  }
});
test("v2 attack: receipt NFT sent to the merchant instead of the customer", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE - RECEIPT_SATS), tagOut(), receiptOut(c, { to: MERCHANT })]));
});
test("v2 attack: receipt NFT sent to a thief", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE - RECEIPT_SATS), tagOut(), receiptOut(c, { to: THIEF })]));
});
test("v2 attack: receipt NFT put on the merchant output (2 outputs)", async () => {
  const c = setup();
  const onMerchant: Output = { to: lockOf(MERCHANT), amount: BigInt(PRICE - FEE), token: receiptOut(c).token };
  await rejectedByContract(c.provider, release(c, [onMerchant, tagOut()]));
});
test("v2 attack: honest receipt, but the merchant output also gets genesis tokens of the same category", async () => {
  const c = setup();
  const merchantWithTokens: Output = { to: lockOf(MERCHANT), amount: BigInt(PRICE - FEE - RECEIPT_SATS), token: { category: c.funding.txid, amount: 1_000_000n } };
  await rejectedByContract(c.provider, release(c, [merchantWithTokens, tagOut(), receiptOut(c)]));
});
test("v2 attack: receipt NFT with a wrong category (byte-reversed funding txid; nodes reject it too)", async () => {
  const c = setup();
  const reversed = binToHex(hexToBin(c.funding.txid).reverse());
  // A category that is not this input's genesis is also invalid by consensus, so either check may reject it.
  await rejected(c.provider, release(c, [merchantOut(PRICE - FEE - RECEIPT_SATS), tagOut(), receiptOut(c, { category: reversed })]));
});
test("v2 attack: release without the receipt (v1-shaped release of a vout-0 coin)", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE), tagOut()]));
});
test("v2 attack: receipt output pays the customer but carries no token", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE - RECEIPT_SATS), tagOut(), { to: CUSTOMER, amount: BigInt(RECEIPT_SATS) }]));
});
test("v2 attack: receipt carries only fungible tokens of the category (no NFT)", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE - RECEIPT_SATS), tagOut(), receiptOut(c, { amount: 1000n, nft: null })]));
});
test("v2 attack: receipt NFT with a fungible amount added", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE - RECEIPT_SATS), tagOut(), receiptOut(c, { amount: 1n })]));
});
test("v2 attack: receipt NFT is mutable or minting (customer could rewrite it / mint more)", async () => {
  for (const capability of ["mutable", "minting"] as const) {
    const c = setup();
    await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE - RECEIPT_SATS), tagOut(), receiptOut(c, { nft: { capability, commitment: binToHex(HASH) } })]));
  }
});
test("v2 attack: receipt output carries more or fewer sats than 1000 (merchant short / receipt underfunded)", async () => {
  for (const sats of [RECEIPT_SATS + 1, RECEIPT_SATS - 1]) {
    const c = setup();
    await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE - sats), tagOut(), receiptOut(c, { sats })]));
  }
});
test("v2 attack: release with merchant output 1 sat below the fee limit next to the receipt (fee 2001)", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, honest(c, PRICE - MAX_FEE_SATS - RECEIPT_SATS - 1)));
});
test("v2 attack: release with a 4th output (siphon) after the receipt", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - 5000), tagOut(), receiptOut(c), { to: THIEF, amount: 2000n }]));
});
test("v2 attack: a second receipt NFT (same category) on a 4th output", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE - 2 * RECEIPT_SATS), tagOut(), receiptOut(c), receiptOut(c, { to: THIEF })]));
});
test("v2 attack: receipt first, merchant and fingerprint after it (outputs reordered)", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [receiptOut(c), merchantOut(PRICE - FEE - RECEIPT_SATS), tagOut()]));
});
test("v2 attack: release puts genesis fungible tokens on the OP_RETURN output", async () => {
  const c = setup();
  const tagWithTokens: Output = { to: deliveryOpReturn(HASH), amount: 0n, token: { category: c.funding.txid, amount: 1_000_000n } };
  // Contract check (tx.outputs[1].tokenCategory == 0x); nodes may also refuse it as non-standard, either is fine.
  await rejected(c.provider, release(c, [merchantOut(PRICE - FEE - RECEIPT_SATS), tagWithTokens, receiptOut(c)]));
});
test("v2 attack (vout 1 coin): a 3rd output siphon is still rejected, and the fee cap is still 2000", async () => {
  const a = setup({ vout: 1 });
  await rejectedByContract(a.provider, release(a, [merchantOut(PRICE - 5000), tagOut(), { to: THIEF, amount: 3000n }]));
  const b = setup({ vout: 1 });
  await rejectedByContract(b.provider, release(b, [merchantOut(PRICE - MAX_FEE_SATS - 1), tagOut()]));
  const ok = setup({ vout: 1 });
  await accepted(ok.provider, release(ok, [merchantOut(PRICE - MAX_FEE_SATS), tagOut()]));
});
test("v2 attack: refund mints a receipt-like NFT to the customer (refund stays token-free)", async () => {
  const c = setup();
  const tx = new TransactionBuilder({ provider: c.provider })
    .addInput(fundingUtxo(c.escrow, c.funding), c.escrow.contract.unlock.refund(), { sequence: 6 })
    .addOutputs([{ to: lockOf(CUSTOMER), amount: BigInt(PRICE - FEE), token: receiptOut(c).token }])
    .build();
  await rejectedByContract(c.provider, tx);
});
