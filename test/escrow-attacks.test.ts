// Run: node_modules/.bin/tsx --test test/escrow-attacks.test.ts
// Named attacks on the escrow covenant (contracts/LaunchDeskEscrow.cash). Fully offline: every transaction is checked
// by the real BCH virtual machine (libauth) inside CashScript's MockNetworkProvider. Nothing touches mainnet/chipnet.
//
// Attacker model: in most release attacks the attacker HOLDS BOTH LaunchDesk keys (release key + report key), i.e. a
// stolen or misused server key. The point is that even then the contract only lets the coins go to two places:
// the merchant address (with the report fingerprint on chain) or, after the timeout, back to the customer.
// Each attack has a matching "control" that is identical except for the one tampered detail, and the control passes,
// so every rejection below is caused by the tampered detail and not by something else in the test.
//
// What the mock network does NOT check: the real age of the funding coin. BIP68 (the relative lock) is enforced by
// nodes using block heights; the VM only checks the input's sequence field against the contract's timeout. The
// refund-timing tests below therefore test the sequence rules, which is the part the contract controls.
import { test } from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { binToHex, decodeTransaction, encodePrivateKeyWif, encodeTransaction, hexToBin, secp256k1 } from "@bitauth/libauth";
import { MockNetworkProvider, SignatureTemplate, TransactionBuilder, type Output } from "cashscript";
import {
  MAX_FEE_SATS,
  buildRefund,
  buildRelease,
  deliveryOpReturn,
  fundingUtxo,
  keyOf,
  makeEscrow,
  p2pkhAddress,
  pkhOf,
  reportHashOf,
  sha256,
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
const REF = "LD1:pAttack:validate";
const REPORT = JSON.stringify({ title: "Bike repair cart at a train station", verdict: "test first" });
const HASH = reportHashOf(REPORT);
const OTHER_HASH = reportHashOf("a different, cheaper report");
const PRICE = 30_000;
const FEE = 1000;

// The same attacks also run against the v2 contract (contracts/LaunchDeskEscrowV2.cash) with ESCROW_ATTACK_VERSION=2
// (npm run mutate:v2 does this). Its coin then sits at vout 1, where v2 releases exactly like v1 (no receipt NFT is
// possible), so every shared require() line is attacked the same way; test/escrow-v2.test.ts covers the receipt branch.
const VERSION = process.env.ESCROW_ATTACK_VERSION === "2" ? 2 : 1;
const DEFAULT_VOUT = VERSION === 2 ? 1 : 0;

let txCounter = 0;
/** A fresh funding coin for `escrow` (at vout 0 unless told otherwise) on its own mock network. */
function setup(opts: { sats?: number; vout?: number; ref?: string; refund?: string; timeout?: number; token?: Output["token"] } = {}) {
  const provider = new MockNetworkProvider();
  const escrow = makeEscrow(
    { ref: opts.ref ?? REF, merchantAddress: MERCHANT, refundAddress: opts.refund ?? CUSTOMER, timeoutBlocks: opts.timeout ?? 6 },
    KEYS,
    provider,
    VERSION,
  );
  const sats = opts.sats ?? PRICE;
  const txid = (++txCounter).toString(16).padStart(64, "e");
  provider.addUtxo(escrow.address, { txid, vout: opts.vout ?? DEFAULT_VOUT, satoshis: BigInt(sats), token: opts.token });
  const funding: Funding = { txid, vout: opts.vout ?? DEFAULT_VOUT, sats };
  return { provider, escrow, funding };
}
type Ctx = ReturnType<typeof setup>;

const send = (p: MockNetworkProvider, hex: string) => p.sendRawTransaction(hex);
/** The rejection must come from the contract (the VM evaluating the escrow input), not from a mock network rule. */
const rejectedByContract = (p: MockNetworkProvider, hex: string) =>
  assert.rejects(send(p, hex), (e: Error) => /evaluating input index 0/.test(e.message));
const accepted = async (p: MockNetworkProvider, hex: string) => assert.match(await send(p, hex), /^[0-9a-f]{64}$/);

const releaseKey = () => new SignatureTemplate(keyOf(KEYS.releaseWif).priv);
const releaseUnlock = (e: Escrow, o: { hash?: Uint8Array; reportSig?: Uint8Array; signer?: SignatureTemplate } = {}) => {
  const hash = o.hash ?? HASH;
  return e.contract.unlock.release(o.signer ?? releaseKey(), o.reportSig ?? signReport(e, hash, KEYS), hash);
};
const merchantOut = (amount: number, extra: Partial<Output> = {}): Output => ({ to: MERCHANT, amount: BigInt(amount), ...extra });
const tagOut = (hash = HASH): Output => ({ to: deliveryOpReturn(hash), amount: 0n });

/** A release transaction signed with the real LaunchDesk keys, with any outputs the attacker wants. */
function release(c: Ctx, outputs: Output[], o: Parameters<typeof releaseUnlock>[1] = {}, sequence?: number) {
  return new TransactionBuilder({ provider: c.provider })
    .addInput(fundingUtxo(c.escrow, c.funding), releaseUnlock(c.escrow, o), sequence === undefined ? undefined : { sequence })
    .addOutputs(outputs)
    .build();
}
function refund(c: Ctx, outputs: Output[], sequence = 6) {
  return new TransactionBuilder({ provider: c.provider })
    .addInput(fundingUtxo(c.escrow, c.funding), c.escrow.contract.unlock.refund(), { sequence })
    .addOutputs(outputs)
    .build();
}
/** Re-encodes a transaction after an edit. Only safe for refunds (no signature) or to show a signature breaks. */
function mutate(hex: string, edit: (tx: Exclude<ReturnType<typeof decodeTransaction>, string>) => void): string {
  const tx = decodeTransaction(hexToBin(hex));
  if (typeof tx === "string") throw new Error(tx);
  edit(tx);
  return binToHex(encodeTransaction(tx));
}
const p2sh20Of = (pkh: Uint8Array) => Uint8Array.from([0xa9, 0x14, ...pkh, 0x87]);
const p2pkhLock = (address: string) => Uint8Array.from([0x76, 0xa9, 0x14, ...pkhOf(address, "chipnet"), 0x88, 0xac]);

// =====================================================================================================================
// Controls: the honest paths work, including the exact fee limit (so the "1 sat over" attacks below are meaningful).
// =====================================================================================================================
test("control: honest release (server builder) is accepted", async () => {
  const c = setup();
  await accepted(c.provider, buildRelease(c.escrow, c.funding, HASH, KEYS).hex);
});
test("control: release that leaves exactly the maximum fee (2000 sats) is accepted", async () => {
  const c = setup();
  await accepted(c.provider, release(c, [merchantOut(PRICE - MAX_FEE_SATS), tagOut()]));
});
test("control: honest refund (server builder) is accepted, and nobody signs it", async () => {
  const c = setup();
  const tx = buildRefund(c.escrow, c.funding);
  await accepted(c.provider, tx.hex);
  assert.equal((await c.provider.getUtxos(CUSTOMER)).length, 1);
});
test("control: refund that leaves exactly the maximum fee is accepted, also with a longer wait (sequence 7)", async () => {
  const a = setup();
  await accepted(a.provider, refund(a, [{ to: CUSTOMER, amount: BigInt(PRICE - MAX_FEE_SATS) }]));
  const b = setup();
  await accepted(b.provider, refund(b, [{ to: CUSTOMER, amount: BigInt(PRICE - FEE) }], 7));
});

// =====================================================================================================================
// Release attacks (attacker holds the LaunchDesk keys unless the test says otherwise)
// =====================================================================================================================
test("attack: release pays a different address", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [{ to: THIEF, amount: BigInt(PRICE - FEE) }, tagOut()]));
});
test("attack: release pays the customer's address instead of the merchant (wrong destination either way)", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [{ to: CUSTOMER, amount: BigInt(PRICE - FEE) }, tagOut()]));
});
test("attack: release pays a P2SH script that reuses the merchant's 20-byte hash", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [{ to: p2sh20Of(pkhOf(MERCHANT, "chipnet")), amount: BigInt(PRICE - FEE) }, tagOut()]));
});
test("attack: release with no valid report signature (all-zero 64-byte signature)", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE), tagOut()], { reportSig: new Uint8Array(64) }));
});
test("attack: release with a report signature over a different report hash", async () => {
  const c = setup();
  const sigForOther = signReport(c.escrow, OTHER_HASH, KEYS);
  // Signed hash = OTHER, claimed hash and OP_RETURN = HASH.
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE), tagOut(HASH)], { hash: HASH, reportSig: sigForOther }));
});
test("attack: release with the report signature made by the release key instead of the report key", async () => {
  const c = setup();
  const wrongSigner = signReport(c.escrow, HASH, { releaseWif: KEYS.releaseWif }); // oracle != release in this test
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE), tagOut()], { reportSig: wrongSigner }));
});
test("attack: release by an outsider with their own key (valid report signature, wrong transaction signer)", async () => {
  const c = setup();
  const outsider = new SignatureTemplate(keyOf(wif(0x42)).priv);
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE), tagOut()], { signer: outsider }));
});
test("attack: release with merchant output 1 sat below the fee limit (fee inflated to 2001)", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - MAX_FEE_SATS - 1), tagOut()]));
});
test("attack: release with most of the money left as miner fee", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [merchantOut(1000), tagOut()]));
});
test("attack: release with a third output (siphon to another address)", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - 5000), tagOut(), { to: THIEF, amount: 3000n }]));
});
test("attack: release with a third output that is a harmless-looking second OP_RETURN", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE), tagOut(), tagOut(OTHER_HASH)]));
});
test("attack: release with only the merchant output (no fingerprint on chain)", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE)]));
});
test("attack: release with the outputs swapped (OP_RETURN first, merchant second)", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [tagOut(), merchantOut(PRICE - FEE)]));
});
test("attack: release whose OP_RETURN carries a different hash than the one signed", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE), tagOut(OTHER_HASH)]));
});
test("attack: release with a tampered OP_RETURN (wrong 'LD2' prefix, extra bytes, non-minimal push)", async () => {
  const tampered = [
    Uint8Array.from([0x6a, 0x03, 0x4c, 0x44, 0x32, 0x20, ...HASH]), // "LD2"
    Uint8Array.from([...deliveryOpReturn(HASH), 0x01, 0x00]), // extra push at the end
    Uint8Array.from([0x6a, 0x4c, 0x03, 0x4c, 0x44, 0x31, 0x20, ...HASH]), // OP_PUSHDATA1 for the prefix
    Uint8Array.from([0x6a, 0x20, ...HASH]), // hash only, no prefix
  ];
  for (const lock of tampered) {
    const c = setup();
    await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE), { to: lock, amount: 0n }]));
  }
});
test("attack: release puts 1 sat on the OP_RETURN output", async () => {
  const c = setup();
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE - 1), { to: deliveryOpReturn(HASH), amount: 1n }]));
});
test("attack: release mints a new token on the merchant output (token genesis from the funding coin)", async () => {
  // The funding coin sits at vout 0, so a tx spending it may create a token category equal to its txid.
  const c = setup({ vout: 0 });
  const token = { category: c.funding.txid, amount: 1_000_000n };
  await rejectedByContract(c.provider, release(c, [{ to: p2pkhLock(MERCHANT), amount: BigInt(PRICE - FEE), token }, tagOut()]));
});
test("attack: release spends two escrow coins at once (batching two payments to one order)", async () => {
  const c = setup();
  const txid2 = "f".repeat(64);
  c.provider.addUtxo(c.escrow.address, { txid: txid2, vout: 1, satoshis: BigInt(PRICE) });
  const second = fundingUtxo(c.escrow, { txid: txid2, vout: 1, sats: PRICE });
  const hex = new TransactionBuilder({ provider: c.provider })
    .addInput(fundingUtxo(c.escrow, c.funding), releaseUnlock(c.escrow))
    .addInput(second, releaseUnlock(c.escrow))
    .addOutputs([merchantOut(2 * PRICE - MAX_FEE_SATS), tagOut()])
    .build();
  await rejectedByContract(c.provider, hex);
});
test("attack: release adds an outside input (e.g. to pay the fee or mix in other coins)", async () => {
  const c = setup();
  const thiefKey = new SignatureTemplate(keyOf(wif(0x33)).priv);
  const thiefAddr = p2pkhAddress(hash160(keyOf(wif(0x33)).pub), "chipnet");
  c.provider.addUtxo(thiefAddr, { txid: "d".repeat(64), vout: 0, satoshis: 10_000n });
  const hex = new TransactionBuilder({ provider: c.provider })
    .addInput(fundingUtxo(c.escrow, c.funding), releaseUnlock(c.escrow))
    .addInput({ txid: "d".repeat(64), vout: 0, satoshis: 10_000n, lockingBytecode: binToHex(p2pkhLock(thiefAddr)) }, thiefKey.unlockP2PKH())
    .addOutputs([merchantOut(PRICE - FEE), tagOut(), { to: thiefAddr, amount: 9_000n }])
    .build();
  await rejectedByContract(c.provider, hex);
});

// =====================================================================================================================
// Replay attacks
// =====================================================================================================================
test("replay: report signature from another order (different reference, so different contract) is rejected", async () => {
  const c = setup();
  const other = makeEscrow({ ref: "LD1:pOther:validate", merchantAddress: MERCHANT, refundAddress: CUSTOMER, timeoutBlocks: 6 }, KEYS, c.provider, VERSION);
  assert.notEqual(other.address, c.escrow.address);
  const replayed = signReport(other, HASH, KEYS);
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE), tagOut()], { reportSig: replayed }));
});
test("replay: a whole release transaction for order A cannot spend order B's coin", async () => {
  const a = setup({ ref: "LD1:pA:validate" });
  const b = setup({ ref: "LD1:pB:validate" });
  const relA = buildRelease(a.escrow, a.funding, HASH, KEYS).hex;
  // Point A's signed transaction at B's coin (put B's coin on A's network so the coin exists).
  a.provider.addUtxo(b.escrow.address, { txid: b.funding.txid, vout: b.funding.vout, satoshis: BigInt(PRICE) });
  const pointedAtB = mutate(relA, (tx) => {
    tx.inputs[0]!.outpointTransactionHash = hexToBin(b.funding.txid);
    tx.inputs[0]!.outpointIndex = b.funding.vout;
  });
  await assert.rejects(send(a.provider, pointedAtB)); // A's contract code does not hash to B's address
});
test("replay: the release-key signature of one payment cannot release a second payment to the same address", async () => {
  const c = setup();
  const relHex = buildRelease(c.escrow, c.funding, HASH, KEYS).hex;
  const txid2 = "c".repeat(64);
  c.provider.addUtxo(c.escrow.address, { txid: txid2, vout: c.funding.vout, satoshis: BigInt(PRICE) });
  const moved = mutate(relHex, (tx) => {
    tx.inputs[0]!.outpointTransactionHash = hexToBin(txid2);
  });
  await rejectedByContract(c.provider, moved); // the transaction signature covers which coin is spent
});
test("replay: report signature with orderId and hash concatenated in the wrong order is rejected", async () => {
  const c = setup();
  const { priv } = keyOf(KEYS.oracleWif);
  const sig = secp256k1.signMessageHashSchnorr(priv, sha256(new Uint8Array([...HASH, ...c.escrow.orderId])));
  assert.ok(typeof sig !== "string");
  await rejectedByContract(c.provider, release(c, [merchantOut(PRICE - FEE), tagOut()], { reportSig: sig as Uint8Array }));
});

// =====================================================================================================================
// Refund attacks (refund needs no signature, so the attacker here is anyone on the internet)
// =====================================================================================================================
test("attack: refund before the timeout (sequence 0, 1, 5, final)", async () => {
  for (const sequence of [0, 1, 5, 0xffffffff]) {
    const c = setup();
    await rejectedByContract(c.provider, refund(c, [{ to: CUSTOMER, amount: BigInt(PRICE - FEE) }], sequence));
  }
});
test("attack: refund with the relative lock switched off (BIP68 disable flag set on sequence 6)", async () => {
  const c = setup();
  await rejectedByContract(c.provider, refund(c, [{ to: CUSTOMER, amount: BigInt(PRICE - FEE) }], (0x80000000 | 6) >>> 0));
});
test("attack: refund with a time-based lock instead of a block-based one (type flag on sequence 6)", async () => {
  const c = setup();
  await rejectedByContract(c.provider, refund(c, [{ to: CUSTOMER, amount: BigInt(PRICE - FEE) }], (1 << 22) | 6));
});
test("attack: refund in a version 1 transaction (relative locks not active)", async () => {
  const c = setup();
  const ok = refund(c, [{ to: CUSTOMER, amount: BigInt(PRICE - FEE) }], 6);
  await rejectedByContract(c.provider, mutate(ok, (tx) => void (tx.version = 1)));
});
test("attack: refund sends the money to a different address", async () => {
  const c = setup();
  await rejectedByContract(c.provider, refund(c, [{ to: THIEF, amount: BigInt(PRICE - FEE) }]));
});
test("attack: refund rewritten after signing to pay a thief (no signature to break, the covenant still blocks it)", async () => {
  const c = setup();
  const honest = buildRefund(c.escrow, c.funding).hex;
  const stolen = mutate(honest, (tx) => void (tx.outputs[0]!.lockingBytecode = p2pkhLock(THIEF)));
  await rejectedByContract(c.provider, stolen);
});
test("attack: refund sends the merchant the money (refund path cannot pay LaunchDesk)", async () => {
  const c = setup();
  await rejectedByContract(c.provider, refund(c, [merchantOut(PRICE - FEE)]));
});
test("attack: refund sends 1 sat less than the fee limit allows", async () => {
  const c = setup();
  await rejectedByContract(c.provider, refund(c, [{ to: CUSTOMER, amount: BigInt(PRICE - MAX_FEE_SATS - 1) }]));
});
test("attack: refund split between the customer and a thief", async () => {
  const c = setup();
  await rejectedByContract(c.provider, refund(c, [{ to: CUSTOMER, amount: BigInt(PRICE - 9000) }, { to: THIEF, amount: 8000n }]));
});
test("attack: refund with an extra OP_RETURN output", async () => {
  const c = setup();
  await rejectedByContract(c.provider, refund(c, [{ to: CUSTOMER, amount: BigInt(PRICE - FEE) }, tagOut()]));
});
test("attack: refund mints a new token on the customer output", async () => {
  const c = setup({ vout: 0 });
  const token = { category: c.funding.txid, amount: 5n };
  await rejectedByContract(c.provider, refund(c, [{ to: p2pkhLock(CUSTOMER), amount: BigInt(PRICE - FEE), token }]));
});
test("attack: refund adds an outside input", async () => {
  const c = setup();
  const k = keyOf(wif(0x34));
  const addr = p2pkhAddress(hash160(k.pub), "chipnet");
  c.provider.addUtxo(addr, { txid: "b".repeat(64), vout: 0, satoshis: 10_000n });
  const hex = new TransactionBuilder({ provider: c.provider })
    .addInput(fundingUtxo(c.escrow, c.funding), c.escrow.contract.unlock.refund(), { sequence: 6 })
    .addInput({ txid: "b".repeat(64), vout: 0, satoshis: 10_000n, lockingBytecode: binToHex(p2pkhLock(addr)) }, new SignatureTemplate(k.priv).unlockP2PKH())
    .addOutputs([{ to: CUSTOMER, amount: BigInt(PRICE - FEE) }, { to: addr, amount: 9_000n }])
    .build();
  await rejectedByContract(c.provider, hex);
});
test("attack: refund of two payments to one order through one output (a miner would keep the second payment)", async () => {
  // Each input alone sees "output 0 pays the customer at least my amount - 2000", so without the one-input rule a
  // miner could merge two payments and keep one as fee. Same output count as the honest refund: only the input count differs.
  const c = setup();
  const txid2 = "a".repeat(64);
  c.provider.addUtxo(c.escrow.address, { txid: txid2, vout: 1, satoshis: BigInt(PRICE) });
  const hex = new TransactionBuilder({ provider: c.provider })
    .addInput(fundingUtxo(c.escrow, c.funding), c.escrow.contract.unlock.refund(), { sequence: 6 })
    .addInput(fundingUtxo(c.escrow, { txid: txid2, vout: 1, sats: PRICE }), c.escrow.contract.unlock.refund(), { sequence: 6 })
    .addOutputs([{ to: CUSTOMER, amount: BigInt(PRICE - FEE) }])
    .build();
  await rejectedByContract(c.provider, hex);
});
test("attack: refund contract rebuilt with a different customer address is a different address (cannot be redirected)", () => {
  const a = setup({ refund: CUSTOMER });
  const b = setup({ refund: THIEF });
  assert.notEqual(a.escrow.address, b.escrow.address);
});

// ---- helpers used above ----------------------------------------------------------------------------------------------
/** hash160 = ripemd160(sha256(pubkey)): the 20-byte hash inside a P2PKH address. */
function hash160(b: Uint8Array): Uint8Array {
  return Uint8Array.from(createHash("ripemd160").update(createHash("sha256").update(b).digest()).digest());
}
