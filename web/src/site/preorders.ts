// F11: on-chain pre-orders paid straight to the founder's address. Owner: WS3. Signature frozen (contracts-v4.md).
// Consumers: pack Website section (WS4) and the Website tile (WS2): `import { countPreorders } from "../site"`.
// Everything here reads the public chain through Electrum; nothing is stored or invented.
import { binToHex, cashAddressToLockingBytecode } from "@bitauth/libauth";
import { connectElectrum, type Electrum } from "../electrum";
import type { Preorders } from "../types";

type VerboseTx = {
  txid: string;
  time?: number;
  blocktime?: number;
  vout: Array<{ value: number | string; scriptPubKey?: { hex?: string } }>;
};

const withPrefix = (a: string) => (a.includes(":") ? a : `bitcoincash:${a}`);

/** Hex of the locking script for a cash address, or null when the address can't be read. */
export function lockingHex(address: string): string | null {
  const r = cashAddressToLockingBytecode(withPrefix(address.trim()));
  return typeof r === "string" ? null : binToHex(r.bytecode);
}

/** Sats paid to `hex` by one transaction. */
export const satsTo = (tx: VerboseTx, hex: string) =>
  tx.vout.filter((o) => o.scriptPubKey?.hex === hex).reduce((n, o) => n + Math.round(Number(o.value) * 1e8), 0);

export async function txVerbose(el: Electrum, txid: string): Promise<VerboseTx | null> {
  try {
    return await el.call<VerboseTx>("blockchain.transaction.get", [txid, true]);
  } catch {
    return null;
  }
}

const sinceMs = (since: string | number) => (typeof since === "number" ? since : Date.parse(since));
const inflight = new Map<string, { at: number; p: Promise<Preorders | null> }>();
const FRESH_MS = 20_000;
const MAX_TXS = 60;

/**
 * Payments to `address` since `since` (ISO date, e.g. `pip.live_at`, or ms epoch), read from the chain
 * via Electrum (`blockchain.address.get_history` + the transactions' outputs to that address).
 * Resolves `null` when the chain could not be checked: callers must then show nothing or "Couldn't check",
 * never "0 pre-orders". Never cached across addresses; safe to call on every render (dedupes in flight,
 * and reuses an answer for 20 s).
 */
export function countPreorders(address: string, since: string | number): Promise<Preorders | null> {
  const key = `${address}|${since}`;
  const hit = inflight.get(key);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.p;
  const p = load(address, since);
  inflight.set(key, { at: Date.now(), p });
  void p.then((v) => v === null && inflight.delete(key));
  return p;
}

async function load(address: string, since: string | number): Promise<Preorders | null> {
  const hex = address ? lockingHex(address) : null;
  const from = sinceMs(since);
  if (!hex || !Number.isFinite(from)) return null;
  let el: Electrum | null = null;
  try {
    el = await connectElectrum();
    const history = await el.call<Array<{ tx_hash: string; height: number }>>("blockchain.address.get_history", [withPrefix(address)]);
    // Newest first; unconfirmed (height ≤ 0) count as "now".
    const recent = [...history].sort((a, b) => (b.height <= 0 ? Infinity : b.height) - (a.height <= 0 ? Infinity : a.height)).slice(0, MAX_TXS);
    const txs: Preorders["txs"] = [];
    for (const h of recent) {
      const tx = await txVerbose(el, h.tx_hash);
      if (!tx) return null; // a partial answer would undercount: say "couldn't check" instead
      const t = tx.blocktime ?? tx.time ?? null;
      if (t != null && t * 1000 < from) continue;
      const sats = satsTo(tx, hex);
      if (sats > 0) txs.push({ txid: h.tx_hash, sats, at: t != null ? t * 1000 : null });
    }
    return { count: txs.length, sats: txs.reduce((n, x) => n + x.sats, 0), txs };
  } catch {
    return null;
  } finally {
    el?.close();
  }
}

/**
 * Watches `address` for a new payment of at least `minSats` (the public page's QR sheet). Calls `onPaid`
 * once with the matching transaction. Returns a stop function that unsubscribes and closes the socket
 * (also fixes "WebSocket is already in CLOSING or CLOSED state" when the sheet closes mid-connect).
 */
export function watchPayment(address: string, minSats: number, onPaid: (tx: { txid: string; sats: number }) => void): () => void {
  let stopped = false;
  let el: Electrum | null = null;
  const hex = lockingHex(address);
  const addr = withPrefix(address);
  if (!hex) return () => {};
  const known = new Set<string>();
  const check = async () => {
    if (!el || stopped) return;
    const [mem, hist] = await Promise.all([
      el.call<Array<{ tx_hash: string }>>("blockchain.address.get_mempool", [addr]).catch(() => []),
      el.call<Array<{ tx_hash: string }>>("blockchain.address.get_history", [addr]).catch(() => []),
    ]);
    for (const { tx_hash } of [...mem, ...hist.slice(-10)]) {
      if (known.has(tx_hash) || stopped) continue;
      known.add(tx_hash);
      const tx = await txVerbose(el, tx_hash);
      const sats = tx ? satsTo(tx, hex) : 0;
      if (sats >= minSats && !stopped) {
        stopped = true;
        onPaid({ txid: tx_hash, sats });
        stop();
        return;
      }
    }
  };
  void (async () => {
    try {
      const c = await connectElectrum();
      if (stopped) return c.close();
      el = c;
      // Everything already there before the sheet opened is not this pre-order.
      const [mem, hist] = await Promise.all([
        c.call<Array<{ tx_hash: string }>>("blockchain.address.get_mempool", [addr]).catch(() => []),
        c.call<Array<{ tx_hash: string }>>("blockchain.address.get_history", [addr]).catch(() => []),
      ]);
      [...mem, ...hist].forEach((x) => known.add(x.tx_hash));
      c.onNotify((method, params) => {
        if (method === "blockchain.address.subscribe" && params[0] === addr) void check();
      });
      await c.call("blockchain.address.subscribe", [addr]);
    } catch {
      /* offline: the sheet still shows the QR; we just can't confirm automatically */
    }
  })();
  const stop = () => {
    stopped = true;
    const c = el;
    el = null;
    if (!c) return;
    void c.call("blockchain.address.unsubscribe", [addr]).catch(() => {}).finally(() => c.close());
  };
  return stop;
}
