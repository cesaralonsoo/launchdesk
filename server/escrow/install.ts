// One-line hook-up for "Pay only if it delivers" (ESCROW=1; with the flag off this does nothing at all).
//
//   server/app.ts, right after `export const app = new Hono();`:
//       installEscrow(app);
//
// It must run before the routes are added, because it wraps two of them as middleware:
//   POST /api/projects/:id/quote  (validate only) the answer's `address` becomes this order's own contract address,
//                                 built with the paying wallet's `refundAddress` from the request body. The plain QR
//                                 (bip21) is dropped: a QR payer has no refund address.
//   POST /api/projects/:id/pay    (validate only) the signed tx is checked against the contract address first; the
//                                 existing route then broadcasts and records it as usual (chain.ts holdCheckedPayment).
// It also mounts the /api/escrow routes and starts the watcher (funding, release with the report hash, refunds).
import type { Context, Hono, MiddlewareHandler, Next } from "hono";
import { holdCheckedPayment, paymentTag } from "../chain.js";
import { exec, markPaymentRefunded } from "../db.js";
import { allow, clientIp } from "../ratelimit.js";
import { escrowRoutes } from "./routes.js";
import { escrowMarkFunded, escrowOn, isStray, escrowQuoteAddress, escrowVerifyPayment } from "./service.js";
import { ESCROW_STAGES, startEscrowWatcher } from "./watch.js";

type Body = { stage?: string; refundAddress?: string; txHex?: string; dev?: boolean; watch?: boolean };
async function bodyOf(c: Context): Promise<Body> {
  try {
    return ((await c.req.json()) ?? {}) as Body; // Hono caches the parsed body, so the route can read it again
  } catch {
    return {};
  }
}
const escrowed = (stage: unknown) => ESCROW_STAGES.includes(stage as never);

const quote: MiddlewareHandler = async (c, next) => {
  const b = await bodyOf(c);
  if (!escrowed(b.stage)) return next();
  await next();
  if (c.res.status !== 200) return;
  const q = (await c.res.clone().json()) as Record<string, unknown>;
  const id = c.req.param("id") ?? "";
  try {
    const e = await escrowQuoteAddress(id, String(b.stage), String(b.refundAddress ?? ""));
    const { bip21: _qr, ...rest } = q;
    c.res = undefined; // let Hono build a fresh response
    c.res = c.json({ ...rest, address: e.address, escrow: { timeoutBlocks: e.timeoutBlocks } });
  } catch (err) {
    const msg = String(b.refundAddress ?? "") ? (err as Error).message : "Connect your wallet first: a refund needs your wallet address.";
    c.res = undefined;
    c.res = c.json({ error: msg }, 400);
  }
};

const pay: MiddlewareHandler = async (c, next) => {
  const b = await bodyOf(c);
  if (!escrowed(b.stage) || b.dev) return next();
  if (b.watch) return c.json({ error: "Pay from a connected wallet so a refund can reach you." }, 400);
  const txHex = typeof b.txHex === "string" ? b.txHex : "";
  if (!txHex) return next(); // the route answers "No signed transaction was sent"
  const id = c.req.param("id") ?? "";
  const stage = String(b.stage);
  const paid = await exec("SELECT txid FROM payments WHERE project_id = ? AND stage = ?", [id, stage]);
  if (paid.rows.length) return next(); // already paid: the route returns the project as it is
  const q = await exec("SELECT sats FROM quotes WHERE project_id = ? AND stage = ?", [id, stage]);
  if (!q.rows[0]) return next(); // the route answers "Get a price quote first"
  let f: Awaited<ReturnType<typeof escrowVerifyPayment>>;
  try {
    f = await escrowVerifyPayment(id, stage, txHex, Math.floor(Number(q.rows[0].sats) * 0.99));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
  // Re-checked right before the route records the payment: the stray sweep may have claimed this coin meanwhile.
  if (await isStray(f.txid)) return c.json({ error: "This payment is being sent back to your wallet (it arrived outside its order). Nothing was charged." }, 400);
  const release = holdCheckedPayment(txHex, paymentTag(id, stage), { txid: f.txid, paidSats: f.paidSats });
  try {
    await next();
  } finally {
    release();
  }
  if (c.res.status === 200 && !(await escrowMarkFunded(id, stage, { txid: f.txid, vout: f.vout, sats: f.paidSats }))) {
    // Lost a race to the stray sweep: that coin goes back, so the payment row it made buys no AI (/run checks this).
    const own = await exec("SELECT 1 FROM payments WHERE project_id = ? AND stage = ? AND txid = ?", [id, stage, f.txid]);
    if (own.rows.length && (await isStray(f.txid))) await markPaymentRefunded(id, stage);
  }
};

const refundLimit: MiddlewareHandler = async (c: Context, next: Next) => {
  if (!allow("escrow-refund", clientIp(c), 6, 60_000)) return c.json({ error: "Too many tries. Wait a minute." }, 429);
  return next();
};

/** No-op unless ESCROW=1. `watch: false` for tests (they call escrowTick() themselves). */
export function installEscrow(app: Hono, opts: { watch?: boolean } = {}) {
  if (!escrowOn()) return;
  app.post("/api/projects/:id/quote", quote);
  app.post("/api/projects/:id/pay", pay);
  app.post("/api/escrow/:id/:stage/refund", refundLimit);
  app.route("/", escrowRoutes);
  if (opts.watch !== false) startEscrowWatcher();
}
