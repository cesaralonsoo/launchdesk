// The escrow watcher (ESCROW=1 only). One tick, every 20 s by default:
//   1. funding:  a quoted order whose contract address received the price (for example the wallet broadcast it but the
//                browser closed before POST /pay) is marked paid and its run is started, exactly like /pay + /run.
//   2. release:  a paid order whose report is done is released: LaunchDesk is paid and OP_RETURN "LD1" <sha256(report)>
//                is written on chain. Never when the run failed (the refund is the safety net), and never once the
//                refund has unlocked (the customer was promised their money back after the timeout).
//   3. refund:   a paid order that was not released before its timeout is sent back to the customer's wallet.
//   4. strays:   (every 5 min) coins at an order address outside its funding outpoint go back once they are deep enough.
// Nothing in here throws into the server: every failure is written to escrow_orders.note and retried next tick.
import { binToHex, hexToBin } from "@bitauth/libauth";
import { electrum } from "../chain.js";
import { config } from "../config.js";
import { claimStageRun, exec, getProject, paidFor, stageDone } from "../db.js";
import { prepareStage, reserveStart, startStage } from "../jobs.js";
import type { Project, Stage } from "../types.js";
import { sha256 } from "./contract.js";
import { depthOf, escrowMarkFunded, isStray, escrowRefund, escrowRefundSweep, escrowRelease, escrowStraySweep, getRow, straySweepRunning, setRow, table, type Row } from "./service.js";

/** Only the $0.10 validate run is escrowed; the build stage keeps the direct payment. */
export const ESCROW_STAGES: readonly Stage[] = ["validate"];

/**
 * The exact text whose SHA-256 goes on chain, and that the customer can download and hash themselves.
 * null while the report is not ready, or when the run failed.
 */
export function deliveredReport(p: Project, stage: Stage): string | null {
  if (stage !== "validate" || !stageDone(p, "validate")) return null;
  const v7 = (p.results as { v7?: { status?: string; report?: unknown } }).v7;
  if (!v7 || v7.status !== "done" || !v7.report) return null;
  return JSON.stringify(v7.report);
}

const lockOf = (r: Row) => hexToBin(String(r.locking_hex));
const scripthashOf = (r: Row) => binToHex(sha256(lockOf(r)).reverse());

/** 1. A quoted order paid outside /pay: find the coins at its own contract address. */
async function watchFunding(r: Row): Promise<boolean> {
  const id = String(r.project_id);
  const stage = String(r.stage) as Stage;
  const q = await exec("SELECT sats FROM quotes WHERE project_id = ? AND stage = ?", [id, stage]);
  const quoted = Number(q.rows[0]?.sats ?? 0);
  if (!quoted) return false;
  const list = await electrum<Array<{ tx_hash: string; tx_pos: number; value: number }>>("blockchain.scripthash.listunspent", [scripthashOf(r)]);
  let u: (typeof list)[number] | undefined;
  for (const x of list) {
    if (x.value < Math.floor(quoted * 0.99)) continue;
    if (await isStray(x.tx_hash)) continue; // being sent back by the stray sweep: never a payment, never a run
    u = x;
    break;
  }
  if (!u) return false;
  if (!(await escrowMarkFunded(id, stage, { txid: u.tx_hash, vout: u.tx_pos, sats: u.value }))) return false;
  const known = await exec("SELECT txid FROM payments WHERE project_id = ? AND stage = ?", [id, stage]);
  if (!known.rows.length) {
    await exec("INSERT OR IGNORE INTO payments (txid, project_id, stage, sats, cents, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
      u.tx_hash, id, stage, u.value, config.priceCents[stage], Date.now(),
    ]);
    const p = await getProject(id);
    const release = p && paidFor(p, stage) && !stageDone(p, stage) ? reserveStart(id, stage) : null;
    if (release) {
      try {
        if (await claimStageRun(id, stage)) {
          await prepareStage(id, stage);
          void startStage(id, stage);
        }
      } finally {
        release();
      }
    }
  }
  return true;
}

/** 2. Release a paid order whose report is ready (or refund it if it is already past its timeout). */
async function watchRelease(r: Row): Promise<"released" | "refunded" | null> {
  const id = String(r.project_id);
  const stage = String(r.stage) as Stage;
  const p = await getProject(id);
  if (!p) return null;
  const report = deliveredReport(p, stage);
  if (report == null) return null;
  const depth = await depthOf(r).catch(() => 0);
  if (depth !== null && depth >= Number(r.timeout_blocks)) {
    // Late: the promise was "no report within about an hour, it comes back to you". Keep it.
    return (await escrowRefund(id, stage)).txid ? "refunded" : null;
  }
  return (await escrowRelease(id, stage, report)).txid ? "released" : null;
}

export type TickResult = { funded: number; released: number; refunded: number };

/** Stray coins (see service.ts escrowStraySweep) are looked for every few minutes, not every tick. */
const STRAY_EVERY_MS = 5 * 60_000;
let lastStray = 0;

let ticking = false;
export async function escrowTick(): Promise<TickResult> {
  const out: TickResult = { funded: 0, released: 0, refunded: 0 };
  if (ticking) return out;
  ticking = true;
  try {
    await table();
    const since = Date.now() - 3 * 60 * 60_000; // a quote is held 15 min; look a while longer for late wallets
    const rows = (await exec("SELECT * FROM escrow_orders WHERE status = 'funded' OR (status = 'quoted' AND updated_at >= ?) ORDER BY updated_at", [since])).rows as Row[];
    for (const r0 of rows) {
      const id = String(r0.project_id);
      const stage = String(r0.stage);
      try {
        if (r0.status === "quoted") {
          if (Number(r0.updated_at) < since) continue;
          if (await watchFunding(r0)) out.funded++;
        }
        const r = await getRow(id, stage);
        if (r?.status === "funded" && r.funding_txid) {
          const done = await watchRelease(r);
          if (done === "released") out.released++;
          if (done === "refunded") out.refunded++;
        }
      } catch (e) {
        await setRow(id, stage, { note: `watch: ${(e as Error).message}`.slice(0, 300) }).catch(() => {});
      }
    }
    out.refunded += await escrowRefundSweep().catch(() => 0);
    if (Date.now() - lastStray >= STRAY_EVERY_MS) {
      lastStray = Date.now();
      // Outside the tick lock: one Electrum call per watched order must never hold up funding, auto-start or release.
      if (!straySweepRunning()) void escrowStraySweep(since).catch((e) => console.warn("[escrow] strays", (e as Error).message));
    }
  } finally {
    ticking = false;
  }
  return out;
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startEscrowWatcher(everyMs = 20_000) {
  if (timer) return;
  timer = setInterval(() => void escrowTick().catch((e) => console.warn("[escrow] tick", (e as Error).message)), everyMs);
  timer.unref?.();
}
export function stopEscrowWatcher() {
  if (timer) clearInterval(timer);
  timer = null;
}
