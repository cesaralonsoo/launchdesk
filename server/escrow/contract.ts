// "Pay only if it delivers": the per-order escrow contract (contracts/LaunchDeskEscrow.cash), pure helpers.
// No database and no network here, so every path is unit-tested with CashScript's MockNetworkProvider.
//
//   makeEscrow(order)    -> the P2SH32 contract (address) for one order
//   checkFunding(tx)     -> the customer's funding tx really pays this contract (and carries the LD1 tag)
//   reportHashOf(bytes)  -> sha256 of the delivered report (what goes on chain)
//   signReport()         -> the report signature checkDataSig verifies (over orderId ++ reportHash)
//   buildRelease()       -> merchant payout + OP_RETURN "LD1" <reportHash>
//   buildRefund()        -> after `timeout` blocks, all of it back to the customer; no signature needed
import { createHash } from "node:crypto";
import {
  binToHex,
  decodeCashAddress,
  decodePrivateKeyWif,
  decodeTransaction,
  encodeCashAddress,
  hashTransaction,
  hexToBin,
  secp256k1,
} from "@bitauth/libauth";
import { Contract, SignatureTemplate, TransactionBuilder, type NetworkProvider, type SpendableUtxo } from "cashscript";
import { escrowArtifact } from "./artifact.js";

/** Must match the `amount - 2000` cap in the contract: the most a release or refund may leave as miner fee. */
export const MAX_FEE_SATS = 2000;
/** 6 blocks ≈ 1 hour. Relative to the confirmation of the funding output (BIP68, block based). */
export const DEFAULT_TIMEOUT_BLOCKS = 6;
const DUST = 546;

export type EscrowNet = "mainnet" | "chipnet";
const prefixOf = (net: EscrowNet) => (net === "mainnet" ? "bitcoincash" : "bchtest");

export interface EscrowKeys {
  /** Server hot key: signs the release transaction. It can only ever pay the merchant address. */
  releaseWif: string;
  /** Key that signs "report delivered for this order". Defaults to the release key. */
  oracleWif?: string;
}

/** Public keys only: enough to rebuild an order's contract (and refund it) even after the server key changes. */
export interface EscrowPubs {
  releasePk: Uint8Array;
  oraclePk: Uint8Array;
}
export const pubsOf = (k: EscrowKeys | EscrowPubs): EscrowPubs =>
  "releaseWif" in k ? { releasePk: keyOf(k.releaseWif).pub, oraclePk: keyOf(k.oracleWif ?? k.releaseWif).pub } : k;

export interface EscrowOrder {
  /** Order reference, e.g. "LD1:<projectId>:validate". Hashed into the contract, so each order has its own address. */
  ref: string;
  /** P2PKH address that receives a release (LaunchDesk merchant wallet). */
  merchantAddress: string;
  /** P2PKH address of the customer: where a refund goes. */
  refundAddress: string;
  timeoutBlocks?: number;
}

export const sha256 = (b: Uint8Array | string) => Uint8Array.from(createHash("sha256").update(b).digest());
export const orderIdOf = (ref: string) => sha256(ref);
/** The report fingerprint written on chain. Hash exactly the bytes the customer can download. */
export const reportHashOf = (report: Uint8Array | string) => sha256(report);

/** 20-byte public key hash of a P2PKH cashaddr on the given network (with or without prefix). */
export function pkhOf(address: string, net: EscrowNet): Uint8Array {
  let a = String(address || "").trim().toLowerCase();
  if (!a.includes(":")) a = `${prefixOf(net)}:${a}`;
  const d = decodeCashAddress(a);
  if (typeof d === "string") throw new Error("That is not a valid Bitcoin Cash address.");
  if (d.prefix !== prefixOf(net)) throw new Error(`Address is not a ${net} address.`);
  if (d.type !== "p2pkh") throw new Error("Please use a standard Bitcoin Cash address (starting with q).");
  return d.payload;
}
export function p2pkhAddress(pkh: Uint8Array, net: EscrowNet): string {
  const r = encodeCashAddress({ prefix: prefixOf(net), type: "p2pkh", payload: pkh });
  return typeof r === "string" ? r : r.address;
}

export function keyOf(wif: string): { priv: Uint8Array; pub: Uint8Array } {
  const d = decodePrivateKeyWif(wif);
  if (typeof d === "string") throw new Error("Escrow key misconfigured (bad WIF)");
  const pub = secp256k1.derivePublicKeyCompressed(d.privateKey);
  if (typeof pub === "string") throw new Error("Escrow key misconfigured: " + pub);
  return { priv: d.privateKey, pub };
}

export interface Escrow {
  contract: Contract<typeof escrowArtifact>;
  address: string;
  lockingBytecodeHex: string;
  orderId: Uint8Array;
  timeoutBlocks: number;
  order: EscrowOrder;
  net: EscrowNet;
}

export function makeEscrow(order: EscrowOrder, keys: EscrowKeys | EscrowPubs, provider: NetworkProvider): Escrow {
  const net: EscrowNet = provider.network === "mainnet" ? "mainnet" : "chipnet";
  const timeoutBlocks = order.timeoutBlocks ?? DEFAULT_TIMEOUT_BLOCKS;
  if (!Number.isInteger(timeoutBlocks) || timeoutBlocks < 1 || timeoutBlocks > 0xffff) throw new Error("Bad escrow timeout");
  const orderId = orderIdOf(order.ref);
  const { releasePk, oraclePk } = pubsOf(keys);
  const contract = new Contract(
    escrowArtifact,
    [pkhOf(order.merchantAddress, net), releasePk, oraclePk, pkhOf(order.refundAddress, net), BigInt(timeoutBlocks), orderId],
    { provider, contractType: "p2sh32" },
  );
  return { contract, address: contract.address, lockingBytecodeHex: contract.lockingBytecode, orderId, timeoutBlocks, order, net };
}

/** OP_RETURN "LD1" <reportHash>, byte for byte what LockingBytecodeNullData([0x4c4431, reportHash]) builds. */
export function deliveryOpReturn(reportHash: Uint8Array): Uint8Array {
  if (reportHash.length !== 32) throw new Error("reportHash must be 32 bytes");
  return Uint8Array.from([0x6a, 0x03, 0x4c, 0x44, 0x31, 0x20, ...reportHash]);
}

/** Reads a delivery OP_RETURN back (for the "verify" view). Returns the hex hash or null. */
export function readDeliveryHash(lockingBytecode: Uint8Array): string | null {
  const b = lockingBytecode;
  if (b.length !== 38 || b[0] !== 0x6a || b[1] !== 0x03 || b[2] !== 0x4c || b[3] !== 0x44 || b[4] !== 0x31 || b[5] !== 0x20) return null;
  return binToHex(b.slice(6));
}

export type Funding = { txid: string; vout: number; sats: number };

/**
 * Checks, without trusting the browser, that a signed tx pays at least `minSats` to this order's contract in ONE
 * output (the contract spends one input at a time) and, when `tag` is given, carries OP_RETURN <tag>.
 */
export function checkFunding(txHex: string, escrow: Escrow, minSats: number, tag?: string): Funding {
  if (!/^[0-9a-f]+$/i.test(txHex) || txHex.length > 200_000) throw new Error("Invalid transaction: the wallet sent something we could not read.");
  const bin = hexToBin(txHex);
  const tx = decodeTransaction(bin);
  if (typeof tx === "string") throw new Error("Invalid transaction: " + tx);
  const want = escrow.lockingBytecodeHex.toLowerCase();
  const tagHex = tag ? binToHex(pushOpReturn(new TextEncoder().encode(tag))) : null;
  let best: Funding | null = null;
  let tagged = !tagHex;
  tx.outputs.forEach((o, vout) => {
    const hex = binToHex(o.lockingBytecode);
    if (hex === want && !o.token) {
      const sats = Number(o.valueSatoshis);
      if (!best || sats > best.sats) best = { txid: "", vout, sats };
    }
    if (tagHex && hex === tagHex) tagged = true;
  });
  if (!tagged) throw new Error("The payment is not tagged for this order. Please pay again from this page.");
  const f = best as Funding | null;
  if (!f) throw new Error("This payment does not go to the order's safe address. Nothing was taken.");
  if (f.sats < minSats) throw new Error(`Payment too small: ${f.sats} sats, the price is ${minSats} sats.`);
  if (f.sats < MAX_FEE_SATS + DUST) throw new Error("Payment too small to hold in escrow.");
  return { ...f, txid: hashTransaction(bin) };
}

function pushOpReturn(data: Uint8Array): Uint8Array {
  if (data.length <= 75) return Uint8Array.from([0x6a, data.length, ...data]);
  if (data.length <= 255) return Uint8Array.from([0x6a, 0x4c, data.length, ...data]);
  throw new Error("tag too long");
}

/** Schnorr data signature over orderId ++ reportHash (checkDataSig hashes the message with sha256). */
export function signReport(escrow: Escrow, reportHash: Uint8Array, keys: EscrowKeys): Uint8Array {
  const { priv } = keyOf(keys.oracleWif ?? keys.releaseWif);
  const msg = new Uint8Array([...escrow.orderId, ...reportHash]);
  const sig = secp256k1.signMessageHashSchnorr(priv, sha256(msg));
  if (typeof sig === "string") throw new Error("Could not sign the report: " + sig);
  return sig;
}

export const fundingUtxo = (escrow: Escrow, f: Funding): SpendableUtxo => ({
  txid: f.txid,
  vout: f.vout,
  satoshis: BigInt(f.sats),
  lockingBytecode: escrow.lockingBytecodeHex,
});

/** Size-based fee (1 sat/byte + margin), capped by the contract's MAX_FEE_SATS; the final tx is VM-checked locally. */
function feeFor(make: (fee: number) => TransactionBuilder): { hex: string; fee: number } {
  const probe = make(1000).build();
  const fee = Math.min(MAX_FEE_SATS, Math.ceil(probe.length / 2) + 20);
  const tb = make(fee);
  tb.debug(); // throws on any failing require(): we never hand out a tx the network would reject
  return { hex: tb.build(), fee };
}

export interface BuiltTx {
  hex: string;
  txid: string;
  fee: number;
}
const done = (r: { hex: string; fee: number }): BuiltTx => ({ ...r, txid: hashTransaction(hexToBin(r.hex)) });

/** Release: pays the merchant and fingerprints the report. Throws if the VM rejects it (no broadcast here). */
export function buildRelease(escrow: Escrow, funding: Funding, reportHash: Uint8Array, keys: EscrowKeys): BuiltTx {
  const reportSig = signReport(escrow, reportHash, keys);
  const merchant = p2pkhAddress(pkhOf(escrow.order.merchantAddress, escrow.net), escrow.net);
  return done(
    feeFor((fee) =>
      new TransactionBuilder({ provider: escrow.contract.provider })
        .addInput(fundingUtxo(escrow, funding), escrow.contract.unlock.release(new SignatureTemplate(keyOf(keys.releaseWif).priv), reportSig, reportHash))
        .addOutput({ to: merchant, amount: BigInt(funding.sats - fee) })
        .addOutput({ to: deliveryOpReturn(reportHash), amount: 0n }),
    ),
  );
}

/** Refund: valid only once the funding output is `timeoutBlocks` deep. Anyone can broadcast it. */
export function buildRefund(escrow: Escrow, funding: Funding): BuiltTx {
  const refund = p2pkhAddress(pkhOf(escrow.order.refundAddress, escrow.net), escrow.net);
  return done(
    feeFor((fee) =>
      new TransactionBuilder({ provider: escrow.contract.provider })
        .addInput(fundingUtxo(escrow, funding), escrow.contract.unlock.refund(), { sequence: escrow.timeoutBlocks })
        .addOutput({ to: refund, amount: BigInt(funding.sats - fee) }),
    ),
  );
}
