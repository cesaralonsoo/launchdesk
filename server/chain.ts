import { createHash } from "node:crypto";
import {
  binToHex,
  binToUtf8,
  cashAddressToLockingBytecode,
  decodeTransaction,
  hashTransaction,
  hexToBin,
} from "@bitauth/libauth";
import { config } from "./config.js";

/** Tests only: replaces the Fulcrum transport (so a whole flow can run against a MockNetworkProvider, no network). */
let transport: ((method: string, params: unknown[]) => Promise<unknown>) | null = null;
export const __setElectrumTransport = (fn: typeof transport) => void (transport = fn);

/** One short-lived JSON-RPC call to a Fulcrum server, with failover. */
export async function electrum<T = unknown>(method: string, params: unknown[]): Promise<T> {
  if (transport) return (await transport(method, params)) as T;
  let lastErr: unknown;
  for (const url of config.electrumServers) {
    try {
      return await callOnce<T>(url, method, params);
    } catch (e) {
      lastErr = e;
      // An RPC error from the server is final (for example a rejected broadcast): don't retry elsewhere.
      if (e instanceof RpcError) throw e;
      console.warn(`[electrum] ${url} ${method}:`, (e as Error).message);
    }
  }
  throw lastErr;
}

export class RpcError extends Error {}

function callOnce<T>(url: string, method: string, params: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let settled = false;
    // Settle once, detach the handlers, then close: closing a socket that failed to connect fires `error` again,
    // which used to re-enter done() until the stack overflowed (and crashed the server on a node outage).
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.onopen = ws.onerror = ws.onmessage = null;
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error("timeout"))), 10_000);
    ws.onopen = () => ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }));
    ws.onerror = () => done(() => reject(new Error("socket error")));
    ws.onmessage = (ev) => {
      let msg: { id?: number; error?: { message?: string }; result?: unknown };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return done(() => reject(new Error("bad reply")));
      }
      if (msg.id !== 1) return;
      if (msg.error) done(() => reject(new RpcError(msg.error!.message ?? JSON.stringify(msg.error))));
      else done(() => resolve(msg.result as T));
    };
  });
}

/** The OP_RETURN tag that binds a payment to one project and stage. */
export const paymentTag = (projectId: string, stage: string) => `LD1:${projectId}:${stage}`;

export type CheckedPayment = { txid: string; paidSats: number };

/**
 * ESCROW=1 only (server/escrow/install.ts): a payment to the order's own contract address, verified by the escrow
 * code just before the pay route runs. Held only for the length of that one request.
 */
const preChecked = new Map<string, CheckedPayment & { tag: string }>();
export function holdCheckedPayment(txHex: string, tag: string, c: CheckedPayment): () => void {
  const k = txHex.toLowerCase();
  preChecked.set(k, { ...c, tag });
  return () => void preChecked.delete(k);
}

/**
 * Decode a signed transaction and check, without trusting the browser:
 * - it pays at least `minSats` to the merchant address;
 * - it carries an OP_RETURN with exactly `tag`.
 */
export function checkPaymentTx(txHex: string, minSats: number, tag: string): CheckedPayment {
  // Defence in depth: a 0 (or NaN) price would accept any transaction with the tag, even one paying nothing.
  if (!(Number.isFinite(minSats) && minSats > 0)) throw new Error("Prices are unavailable, try again in a minute. Nothing was charged.");
  // ESCROW=1: the escrow middleware already checked this exact transaction against the order's contract address.
  const pre = preChecked.get(txHex.toLowerCase());
  if (pre && pre.tag === tag && pre.paidSats >= minSats) return { txid: pre.txid, paidSats: pre.paidSats };
  if (!/^[0-9a-f]+$/i.test(txHex) || txHex.length > 200_000) throw new Error("Invalid transaction: the wallet sent something we could not read. Please try again.");
  const bin = hexToBin(txHex);
  const tx = decodeTransaction(bin);
  if (typeof tx === "string") throw new Error("Invalid transaction: " + tx);

  const merchant = cashAddressToLockingBytecode(config.merchantAddress);
  if (typeof merchant === "string") throw new Error("Server misconfigured: MERCHANT_ADDRESS");
  const merchantHex = binToHex(merchant.bytecode);

  let paidSats = 0;
  let tagged = false;
  for (const out of tx.outputs) {
    const hex = binToHex(out.lockingBytecode);
    if (hex === merchantHex && !out.token) paidSats += Number(out.valueSatoshis);
    if (out.lockingBytecode[0] === 0x6a && readOpReturnText(out.lockingBytecode) === tag) tagged = true;
  }
  if (!tagged) throw new Error("The payment is not tagged for this order (it misses the LaunchDesk reference). Please pay again from this page.");
  if (paidSats < minSats) throw new Error(`Payment too small: it sends ${paidSats} sats to LaunchDesk, the price is ${minSats} sats. Nothing was charged.`);
  return { txid: hashTransaction(bin), paidSats };
}

/** Reads `OP_RETURN <push>` and returns the pushed bytes as text. */
function readOpReturnText(script: Uint8Array): string | null {
  let i = 1;
  const op = script[i++];
  let len: number;
  if (op === undefined) return null;
  if (op >= 0x01 && op <= 0x4b) len = op;
  else if (op === 0x4c) len = script[i++] ?? -1;
  else return null;
  if (len < 0 || i + len !== script.length) return null;
  return binToUtf8(script.slice(i, i + len));
}

/** Broadcasts; if the network already has the tx, that's fine too. */
export async function broadcast(txHex: string, txid: string) {
  try {
    await electrum<string>("blockchain.transaction.broadcast", [txHex]);
  } catch (e) {
    if (!(e instanceof RpcError)) throw e;
    // "already in mempool / known" -> confirm it exists, else fail.
    try {
      await electrum("blockchain.transaction.get", [txid, false]);
    } catch {
      throw new Error("Broadcast rejected: " + e.message);
    }
  }
}

type VerboseTx = {
  txid: string;
  time?: number;
  blocktime?: number;
  vout: Array<{ value: number | string; scriptPubKey?: { hex?: string; addresses?: string[] } }>;
};

/**
 * F10: finds a recent transaction paying exactly `sats` to the merchant address (the plain QR path,
 * which has no OP_RETURN tag: the unique 1–999 sat suffix of the quote is the match). Looks at the
 * mempool and the last confirmed entries only. Returns null when nothing matches yet.
 */
export async function findQrPayment(
  sats: number,
  since: number,
  /**
   * When this server first saw a transaction to the merchant (app.ts records every candidate the first time it is
   * listed). A match must be first seen at or after `since`: a payment that existed before the quote is someone else's.
   */
  firstSeen: (txid: string) => Promise<number> = async () => Date.now(),
): Promise<{ txid: string; sats: number } | null> {
  const lock = cashAddressToLockingBytecode(config.merchantAddress);
  if (typeof lock === "string") throw new Error("Server misconfigured: MERCHANT_ADDRESS");
  const merchantHex = binToHex(lock.bytecode);
  const scripthash = binToHex(sha256Rev(lock.bytecode));
  const [mempool, history] = await Promise.all([
    electrum<Array<{ tx_hash: string }>>("blockchain.scripthash.get_mempool", [scripthash]).catch(() => []),
    electrum<Array<{ tx_hash: string; height: number }>>("blockchain.scripthash.get_history", [scripthash]).catch(() => []),
  ]);
  const candidates = [...mempool.map((m) => m.tx_hash), ...history.slice(-12).reverse().map((h) => h.tx_hash)];
  const seen = new Set<string>();
  for (const txid of candidates) {
    if (seen.has(txid)) continue;
    seen.add(txid);
    if ((await firstSeen(txid)) < since) continue;
    const tx = await electrum<VerboseTx>("blockchain.transaction.get", [txid, true]).catch(() => null);
    if (!tx) continue;
    const t = tx.blocktime ?? tx.time;
    // Confirmed long before the quote existed: not this payment.
    if (t && t * 1000 < since - 10 * 60_000) continue;
    // A tagged payment (OP_RETURN "LD1:…") belongs to a wallet order or an office task, never to a plain QR.
    if (tx.vout.some((o) => (o.scriptPubKey?.hex ?? "").startsWith("6a") && (o.scriptPubKey?.hex ?? "").includes(LD1_HEX))) continue;
    const paid = tx.vout
      .filter((o) => o.scriptPubKey?.hex === merchantHex)
      .reduce((n, o) => n + Math.round(Number(o.value) * 1e8), 0);
    if (paid === sats) return { txid, sats: paid };
  }
  return null;
}

const LD1_HEX = Buffer.from("LD1:", "utf8").toString("hex");

/** Electrum script hash: sha256 of the locking script, byte-reversed. */
function sha256Rev(script: Uint8Array): Uint8Array {
  return Uint8Array.from(createHash("sha256").update(script).digest()).reverse();
}
