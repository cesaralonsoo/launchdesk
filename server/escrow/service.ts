// Escrow orders on the server, behind ESCROW=1 (default off: the current P2PKH flow is unchanged).
//
//   escrowOn()                          feature flag
//   escrowQuoteAddress(id, stage, addr) the contract address the wallet pays (instead of MERCHANT_ADDRESS)
//   escrowCheckPayment(id, stage, hex)  drop-in for checkPaymentTx(): verifies the funding, records the order
//   escrowRelease(id, stage, report)    after the report is ready: pays LaunchDesk + OP_RETURN "LD1" <sha256(report)>
//   escrowRefundSweep() / startEscrowRefundJob()  refunds every funded order not released after the timeout
//   escrowStatus(id, stage)             what the "verify" panel shows
//
// Env: ESCROW=1, ESCROW_WIF (server hot key, WIF), ESCROW_ORACLE_WIF (optional, defaults to ESCROW_WIF),
//      ESCROW_NETWORK=mainnet|chipnet (default mainnet; chipnet also needs ELECTRUM_SERVERS pointing at chipnet),
//      ESCROW_TIMEOUT_BLOCKS (default 6 ≈ 1 h). MERCHANT_ADDRESS is where releases pay out.
// Network calls go through the existing server/chain.ts electrum() + broadcast() (with failover).
import { binToHex, hexToBin } from "@bitauth/libauth";
import type { Network, NetworkProvider, SpendableUtxo } from "cashscript";
import { broadcast, electrum, paymentTag } from "../chain.js";
import { config } from "../config.js";
import { exec, markPaymentRefunded } from "../db.js";
import {
  DEFAULT_TIMEOUT_BLOCKS,
  buildRefund,
  buildRelease,
  checkFunding,
  makeEscrow,
  pkhOf,
  pubsOf,
  reportHashOf,
  sha256,
  type Escrow,
  type EscrowKeys,
  type EscrowNet,
  type Funding,
} from "./contract.js";

/** Swappable for tests only (so a release can be checked against a MockNetworkProvider). */
let send: (hex: string, txid: string) => Promise<void> = broadcast;
export const __setEscrowBroadcast = (fn: typeof send) => void (send = fn);

export const escrowOn = () => process.env.ESCROW === "1";
export const net = (): EscrowNet => (process.env.ESCROW_NETWORK === "chipnet" ? "chipnet" : "mainnet");
const timeoutBlocks = () => {
  const n = Number(process.env.ESCROW_TIMEOUT_BLOCKS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_TIMEOUT_BLOCKS;
};
function keys(): EscrowKeys {
  const releaseWif = process.env.ESCROW_WIF || "";
  if (!releaseWif) throw new Error("Escrow is not configured on this server.");
  return { releaseWif, oracleWif: process.env.ESCROW_ORACLE_WIF || undefined };
}

/** cashscript NetworkProvider backed by chain.ts (only `network` is needed to build; the rest is for completeness). */
export function chainProvider(n: EscrowNet = net()): NetworkProvider {
  const scripthash = (lock: Uint8Array) => binToHex(sha256(lock).reverse());
  const utxosFor = async (lockHex: string): Promise<SpendableUtxo[]> => {
    const list = await electrum<Array<{ tx_hash: string; tx_pos: number; value: number }>>("blockchain.scripthash.listunspent", [
      scripthash(hexToBin(lockHex)),
    ]);
    return list.map((u) => ({ txid: u.tx_hash, vout: u.tx_pos, satoshis: BigInt(u.value), lockingBytecode: lockHex }));
  };
  return {
    network: n as Network,
    getUtxos: async () => {
      throw new Error("use getUtxosForLockingBytecode");
    },
    getUtxosForLockingBytecode: (l) => utxosFor(typeof l === "string" ? l : binToHex(l)),
    getBlockHeight: async () => (await electrum<{ height: number }>("blockchain.headers.subscribe", [])).height,
    getRawTransaction: (txid) => electrum<string>("blockchain.transaction.get", [txid, false]),
    sendRawTransaction: async (hex) => {
      const txid = binToHex(sha256(sha256(hexToBin(hex))).reverse());
      await broadcast(hex, txid);
      return txid;
    },
  };
}

// ---- store -------------------------------------------------------------------------------------------------------
let ready: Promise<unknown> | null = null;
export const table = () =>
  (ready ??= exec(`CREATE TABLE IF NOT EXISTS escrow_orders (
    project_id TEXT NOT NULL, stage TEXT NOT NULL,
    ref TEXT NOT NULL, network TEXT NOT NULL,
    merchant_address TEXT NOT NULL, refund_address TEXT NOT NULL,
    release_pk TEXT NOT NULL, oracle_pk TEXT NOT NULL, timeout_blocks INTEGER NOT NULL,
    address TEXT NOT NULL, locking_hex TEXT NOT NULL, redeem_hex TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'quoted',
    funding_txid TEXT, funding_vout INTEGER, sats INTEGER, funded_at INTEGER,
    report_hash TEXT, report_body TEXT, release_txid TEXT, refund_txid TEXT, note TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (project_id, stage))`));

export type Row = Record<string, unknown>;
export async function getRow(projectId: string, stage: string): Promise<Row | null> {
  await table();
  return ((await exec("SELECT * FROM escrow_orders WHERE project_id = ? AND stage = ?", [projectId, stage])).rows[0] as Row) ?? null;
}
export const setRow = async (projectId: string, stage: string, f: Record<string, string | number | null>) => {
  const cols = Object.keys(f);
  await exec(`UPDATE escrow_orders SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE project_id = ? AND stage = ?`, [
    ...cols.map((c) => f[c]!),
    Date.now(),
    projectId,
    stage,
  ]);
};
/** Rebuilds an order's contract from the stored public parameters (never from the current key). */
function escrowOf(r: Row): Escrow {
  return makeEscrow(
    { ref: String(r.ref), merchantAddress: String(r.merchant_address), refundAddress: String(r.refund_address), timeoutBlocks: Number(r.timeout_blocks) },
    { releasePk: hexToBin(String(r.release_pk)), oraclePk: hexToBin(String(r.oracle_pk)) },
    chainProvider(String(r.network) as EscrowNet),
  );
}
const fundingOf = (r: Row): Funding => ({ txid: String(r.funding_txid), vout: Number(r.funding_vout), sats: Number(r.sats) });

// ---- flow --------------------------------------------------------------------------------------------------------
/**
 * The address the customer's wallet pays for this order. `refundAddress` is the paying wallet's own address.
 * Re-quoting with another refund address before funding replaces the order; after funding it is fixed.
 */
export async function escrowQuoteAddress(projectId: string, stage: string, refundAddress: string): Promise<{ address: string; timeoutBlocks: number }> {
  const n = net();
  pkhOf(refundAddress, n); // throws a plain-words error on a bad address
  const existing = await getRow(projectId, stage);
  if (existing && existing.status !== "quoted") return { address: String(existing.address), timeoutBlocks: Number(existing.timeout_blocks) };
  const pubs = pubsOf(keys());
  const order = { ref: paymentTag(projectId, stage), merchantAddress: config.merchantAddress, refundAddress, timeoutBlocks: timeoutBlocks() };
  const e = makeEscrow(order, pubs, chainProvider(n));
  await exec(
    `INSERT OR REPLACE INTO escrow_orders (project_id, stage, ref, network, merchant_address, refund_address, release_pk, oracle_pk,
      timeout_blocks, address, locking_hex, redeem_hex, status, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'quoted',?)`,
    [projectId, stage, order.ref, n, order.merchantAddress, refundAddress, binToHex(pubs.releasePk), binToHex(pubs.oraclePk),
      e.timeoutBlocks, e.address, e.lockingBytecodeHex, e.contract.bytecode, Date.now()],
  );
  return { address: e.address, timeoutBlocks: e.timeoutBlocks };
}

/** Checks a signed funding tx against this order's contract, without writing anything. */
export async function escrowVerifyPayment(projectId: string, stage: string, txHex: string, minSats: number): Promise<{ txid: string; paidSats: number; vout: number }> {
  const r = await getRow(projectId, stage);
  if (!r) throw new Error("Get a price quote first");
  const f = checkFunding(txHex, escrowOf(r), minSats, String(r.ref));
  if (r.status !== "quoted" && r.funding_txid !== f.txid) throw new Error("This order was already paid.");
  // Coins the stray sweep is sending (or sent) back never fund an order: no AI for money that is being returned.
  if (await isStray(f.txid)) throw new Error("This payment is being sent back to your wallet (it arrived outside its order). Nothing was charged.");
  return { txid: f.txid, paidSats: f.sats, vout: f.vout };
}
/** Records the funding output (idempotent for the same tx). */
/** True when the order is (now, or already was) funded by exactly this coin; false when it was not marked (stray, other coin). */
export async function escrowMarkFunded(projectId: string, stage: string, f: { txid: string; vout: number; sats: number }): Promise<boolean> {
  if (await isStray(f.txid)) return false;
  const r = await getRow(projectId, stage);
  if (!r) return false;
  if (r.status === "quoted") {
    await setRow(projectId, stage, { status: "funded", funding_txid: f.txid, funding_vout: f.vout, sats: f.sats, funded_at: Date.now() });
    return true;
  }
  return r.funding_txid === f.txid && Number(r.funding_vout) === f.vout;
}

/** Drop-in for chain.ts checkPaymentTx() when ESCROW=1: same return shape. The caller still broadcasts. */
export async function escrowCheckPayment(projectId: string, stage: string, txHex: string, minSats: number): Promise<{ txid: string; paidSats: number }> {
  const f = await escrowVerifyPayment(projectId, stage, txHex, minSats);
  if (!(await escrowMarkFunded(projectId, stage, { txid: f.txid, vout: f.vout, sats: f.paidSats })))
    throw new Error("This payment does not fund this order (it is being sent back, or the order is paid another way).");
  return { txid: f.txid, paidSats: f.paidSats };
}

/**
 * The report is ready: hash exactly `report` (the bytes the customer can download from escrowReportBody) and release.
 * Idempotent; never throws into the job (returns the error text instead), the refund path stays as the safety net.
 */
export async function escrowRelease(projectId: string, stage: string, report: string): Promise<{ txid?: string; reportHash?: string; error?: string }> {
  try {
    const r = await getRow(projectId, stage);
    if (!r || !r.funding_txid) return { error: "no funded escrow order" };
    if (r.release_txid) return { txid: String(r.release_txid), reportHash: String(r.report_hash) };
    if (r.refund_txid) return { error: "already refunded" };
    const hash = reportHashOf(report);
    const tx = buildRelease(escrowOf(r), fundingOf(r), hash, keys());
    await setRow(projectId, stage, { report_hash: binToHex(hash), report_body: report });
    await send(tx.hex, tx.txid);
    await setRow(projectId, stage, { status: "released", release_txid: tx.txid, note: null });
    return { txid: tx.txid, reportHash: binToHex(hash) };
  } catch (e) {
    const msg = (e as Error).message;
    await setRow(projectId, stage, { note: `release: ${msg}`.slice(0, 300) }).catch(() => {});
    console.warn("[escrow] release", projectId, stage, msg);
    return { error: msg };
  }
}

/** Confirmations of the funding output, or 0 if unconfirmed, or null if it is no longer unspent. */
export async function depthOf(r: Row): Promise<number | null> {
  const p = chainProvider(String(r.network) as EscrowNet);
  const list = await electrum<Array<{ tx_hash: string; tx_pos: number; height: number }>>("blockchain.scripthash.listunspent", [
    binToHex(sha256(hexToBin(String(r.locking_hex))).reverse()),
  ]);
  const u = list.find((x) => x.tx_hash === r.funding_txid && x.tx_pos === Number(r.funding_vout));
  if (!u) return null;
  if (!u.height || u.height <= 0) return 0;
  return (await p.getBlockHeight()) - u.height + 1;
}

/** Refunds one order if its timeout has passed. Anyone may call it (it can only pay the customer back). */
export async function escrowRefund(projectId: string, stage: string): Promise<{ txid?: string; waitBlocks?: number; error?: string }> {
  const r = await getRow(projectId, stage);
  if (!r || !r.funding_txid) return { error: "Nothing to refund." };
  if (r.refund_txid) {
    await markPaymentRefunded(projectId, stage); // idempotent: repairs a crash between the two writes
    return { txid: String(r.refund_txid) };
  }
  if (r.release_txid) return { error: "Your report was delivered, so the payment was released." };
  try {
    const depth = await depthOf(r);
    if (depth === null) return { error: "The payment is not in the safe anymore." };
    const need = Number(r.timeout_blocks);
    if (depth < need) return { waitBlocks: need - depth };
    const tx = buildRefund(escrowOf(r), fundingOf(r));
    await send(tx.hex, tx.txid);
    await setRow(projectId, stage, { status: "refunded", refund_txid: tx.txid, note: null });
    // The money went back: this stage buys no more AI (run, retry, steer and job preparation all check this).
    await markPaymentRefunded(projectId, stage);
    return { txid: tx.txid };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Every funded, unreleased order older than its timeout (≈10 min per block, with slack) gets refunded. */
export async function escrowRefundSweep(): Promise<number> {
  await table();
  const rows = (await exec("SELECT project_id, stage, timeout_blocks, funded_at FROM escrow_orders WHERE status = 'funded'")).rows as Row[];
  let n = 0;
  for (const r of rows) {
    if (Date.now() - Number(r.funded_at) < Number(r.timeout_blocks) * 10 * 60_000) continue;
    const out = await escrowRefund(String(r.project_id), String(r.stage));
    if (out.txid) n++;
  }
  return n;
}

// ---- stray coins ---------------------------------------------------------------------------------------------------
// Money sent to an order's contract address outside its recorded funding outpoint: a second payment, an underpayment
// (below the price, so never "funded"), or a payment made after the quote went stale. Nothing ran for it, so once it
// is `timeout_blocks` deep it goes back through the contract's own keyless refund() path, which can only pay the
// order's refund address (the wallet that asked for the quote). No key is used and the contract is unchanged.
let straysReady: Promise<unknown> | null = null;
const straysTable = () =>
  (straysReady ??= exec(`CREATE TABLE IF NOT EXISTS escrow_strays (
    txid TEXT NOT NULL, vout INTEGER NOT NULL, project_id TEXT NOT NULL, stage TEXT NOT NULL, sats INTEGER NOT NULL,
    refund_txid TEXT, note TEXT, at INTEGER NOT NULL, PRIMARY KEY (txid, vout))`));
/** True when `txid` is (or was) being returned by the stray sweep. */
export async function isStray(txid: string): Promise<boolean> {
  await straysTable();
  return (await exec("SELECT 1 FROM escrow_strays WHERE txid = ?", [txid])).rows.length > 0;
}
/** How long after its last change an order's address is still watched for strays. */
const STRAY_WATCH_MS = 7 * 24 * 60 * 60_000;
/** At most this many order addresses are checked per sweep (one Electrum call each). */
const STRAY_MAX_ORDERS = 500;
/** The minimum a refund output may carry (BCH dust limit). */
const DUST_SATS = 546;

/**
 * Refunds every stray UTXO at a known order address once it is deep enough. `activeSince`: quoted orders changed
 * after this are still being watched for funding (watch.ts), so their coins at or above the price are left to it.
 * Returns the number of refunds broadcast. Never throws for one coin (its note says why it waits).
 */
let strayRun: Promise<number> | null = null;
/** True while a stray sweep is in flight (the watcher then skips its turn instead of queueing another). */
export const straySweepRunning = () => strayRun !== null;
export async function escrowStraySweep(activeSince = Date.now() - 3 * 60 * 60_000): Promise<number> {
  // One sweep at a time per process: a second caller waits for the running one, then sweeps again itself.
  while (strayRun) await strayRun.catch(() => 0);
  const run = straySweep(activeSince);
  strayRun = run;
  try {
    return await run;
  } finally {
    if (strayRun === run) strayRun = null;
  }
}
async function straySweep(activeSince: number): Promise<number> {
  await table();
  await straysTable();
  // Bounded: orders changed in the last 7 days, plus funded ones (their coin is still in the contract). A quote nobody
  // paid stays 'quoted' forever, so status alone would grow this list without end. Newest first, at most STRAY_MAX_ORDERS.
  const rows = (
    await exec("SELECT * FROM escrow_orders WHERE updated_at > ? OR status = 'funded' ORDER BY updated_at DESC LIMIT ?", [Date.now() - STRAY_WATCH_MS, STRAY_MAX_ORDERS])
  ).rows as Row[];
  let n = 0;
  for (const r of rows) {
    const id = String(r.project_id);
    const stage = String(r.stage);
    try {
      const list = await electrum<Array<{ tx_hash: string; tx_pos: number; value: number; height: number }>>("blockchain.scripthash.listunspent", [
        binToHex(sha256(hexToBin(String(r.locking_hex))).reverse()),
      ]);
      if (!list.length) continue;
      const tip = (await electrum<{ height: number }>("blockchain.headers.subscribe", [])).height;
      const q = await exec("SELECT sats FROM quotes WHERE project_id = ? AND stage = ?", [id, stage]);
      const price = Math.floor(Number(q.rows[0]?.sats ?? 0) * 0.99);
      for (const u of list) {
        const now = (await getRow(id, stage)) ?? r;
        if (now.funding_txid === u.tx_hash && Number(now.funding_vout) === u.tx_pos) continue; // the order's own coin
        if (now.status === "quoted" && Number(now.updated_at) >= activeSince && price > 0 && u.value >= price) continue; // may still fund it
        const paidRow = await exec("SELECT 1 FROM payments WHERE txid = ?", [u.tx_hash]);
        if (paidRow.rows.length) continue; // recorded as a payment: never treated as stray
        const depth = u.height > 0 ? tip - u.height + 1 : 0;
        if (depth < Number(now.timeout_blocks)) continue;
        const known = (await exec("SELECT refund_txid FROM escrow_strays WHERE txid = ? AND vout = ?", [u.tx_hash, u.tx_pos])).rows[0];
        if (known?.refund_txid) continue;
        // Claim the coin first: from here no /pay or watcher can make it fund an order.
        await exec("INSERT OR IGNORE INTO escrow_strays (txid, vout, project_id, stage, sats, at) VALUES (?, ?, ?, ?, ?, ?)", [u.tx_hash, u.tx_pos, id, stage, u.value, Date.now()]);
        const again = await getRow(id, stage);
        if (again?.funding_txid === u.tx_hash && Number(again.funding_vout) === u.tx_pos) {
          await exec("DELETE FROM escrow_strays WHERE txid = ? AND vout = ? AND refund_txid IS NULL", [u.tx_hash, u.tx_pos]); // lost a race to /pay
          continue;
        }
        try {
          const tx = buildRefund(escrowOf(now), { txid: u.tx_hash, vout: u.tx_pos, sats: u.value });
          if (u.value - tx.fee < DUST_SATS) throw new Error("too small to send back (dust)");
          await send(tx.hex, tx.txid);
          await exec("UPDATE escrow_strays SET refund_txid = ?, note = NULL WHERE txid = ? AND vout = ?", [tx.txid, u.tx_hash, u.tx_pos]);
          console.log(`[escrow] stray ${u.tx_hash}:${u.tx_pos} (${u.value} sats) at ${id} ${stage} refunded: ${tx.txid}`);
          n++;
        } catch (e) {
          await exec("UPDATE escrow_strays SET note = ? WHERE txid = ? AND vout = ?", [`refund: ${(e as Error).message}`.slice(0, 300), u.tx_hash, u.tx_pos]);
        }
      }
    } catch (e) {
      console.warn("[escrow] stray sweep", id, stage, (e as Error).message);
    }
  }
  return n;
}

let sweeping: ReturnType<typeof setInterval> | null = null;
export function startEscrowRefundJob(everyMs = 5 * 60_000) {
  if (!escrowOn() || sweeping) return;
  sweeping = setInterval(() => void escrowRefundSweep().catch((e) => console.warn("[escrow] sweep", (e as Error).message)), everyMs);
  sweeping.unref?.();
}

export type EscrowStatus = {
  state: "quoted" | "funded" | "released" | "refunded";
  address: string;
  sats: number | null;
  fundingTxid: string | null;
  releaseTxid: string | null;
  refundTxid: string | null;
  reportHash: string | null;
  timeoutBlocks: number;
  network: EscrowNet;
  /** Block explorer pages for the release / refund transactions (null until they exist). */
  releaseUrl: string | null;
  refundUrl: string | null;
  /** Everything contracts/refund-offline.ts needs to rebuild this order's contract and refund it with no LaunchDesk
   *  server. Public values only (no key can be derived from them). The refund address is filled only for the owner. */
  refundDetails: {
    project: string;
    ref: string;
    network: EscrowNet;
    contractAddress: string;
    merchantAddress: string;
    refundAddress: string | null;
    releasePk: string;
    oraclePk: string;
    timeoutBlocks: number;
    funding: string | null;
  };
};
/** Block explorer page for one transaction on the order's network. */
export const explorerTxUrl = (n: EscrowNet, txid: string) =>
  n === "chipnet" ? `https://chipnet.imaginary.cash/tx/${txid}` : `https://blockchair.com/bitcoin-cash/transaction/${txid}`;
export async function escrowStatus(projectId: string, stage: string, opts: { owner?: boolean } = {}): Promise<EscrowStatus | null> {
  const r = await getRow(projectId, stage);
  if (!r) return null;
  const s = (k: string) => (r[k] == null ? null : String(r[k]));
  return {
    state: String(r.status) as EscrowStatus["state"],
    address: String(r.address),
    sats: r.sats == null ? null : Number(r.sats),
    fundingTxid: s("funding_txid"),
    releaseTxid: s("release_txid"),
    refundTxid: s("refund_txid"),
    reportHash: s("report_hash"),
    timeoutBlocks: Number(r.timeout_blocks),
    network: String(r.network) as EscrowNet,
    releaseUrl: r.release_txid ? explorerTxUrl(String(r.network) as EscrowNet, String(r.release_txid)) : null,
    refundUrl: r.refund_txid ? explorerTxUrl(String(r.network) as EscrowNet, String(r.refund_txid)) : null,
    refundDetails: {
      project: projectId,
      ref: String(r.ref),
      network: String(r.network) as EscrowNet,
      contractAddress: String(r.address),
      merchantAddress: String(r.merchant_address),
      refundAddress: opts.owner ? s("refund_address") : null,
      releasePk: String(r.release_pk),
      oraclePk: String(r.oracle_pk),
      timeoutBlocks: Number(r.timeout_blocks),
      funding: r.funding_txid ? `${String(r.funding_txid)}:${Number(r.funding_vout)}:${Number(r.sats)}` : null,
    },
  };
}
/** The exact bytes that were hashed on chain, so anyone can re-hash them in the browser. */
export async function escrowReportBody(projectId: string, stage: string): Promise<string | null> {
  const r = await getRow(projectId, stage);
  return r?.report_body == null ? null : String(r.report_body);
}
