// "Your offices" API (mounted by app.ts before the /api/* catch-all).
//   POST /api/offices/from-project  { projectId }            (A) open the offices of a created project (owner key)
//   POST /api/offices/bring         { what, where, link? }   (B) a business you already run → { view, key }
//   GET  /api/offices/:sid                                    the offices, the open questions and the inbox
//   POST /api/offices/:sid/answers  { answers: {id: text} }  answer (or skip) the follow-up questions
//   POST /api/offices/:sid/tasks    { task, input? }         price quote BEFORE running → { quote, item }
//   POST /api/offices/:sid/tasks/:tid/pay { test?: true } | { txHex }   pay, then the task runs in the background
// Every call but /bring needs X-Owner-Key: the project's key for (A), the key /bring returned for (B).
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { broadcast, checkPaymentTx, RpcError } from "../chain.js";
import { config, merchantOnMainnet } from "../config.js";
import { getProject, getProjectRow } from "../db.js";
import { loadV7 } from "../jobs-v7.js";
import { digestOf, loadKit } from "../kit.js";
import { bchUsdCached, bchUsdOrZero } from "../price.js";
import { allow, clientIp } from "../ratelimit.js";
import { applyAnswers, brainFromForm, brainFromProject, readForm } from "./brain.js";
import { chargeCents, isTaskId, OFFICES, TASKS } from "./catalog.js";
import { defaultRunDeps, followUps, runTask, type RunDeps } from "./run.js";
import * as store from "./store.js";
import type { OfficesView, TaskQuote } from "./types.js";

const QUOTE_MS = 15 * 60_000;
/** Below this an output is dust on BCH: no real payment is ever smaller. */
const DUST_SATS = 546;
const STUCK_MS = 10 * 60_000;

/** Honest wording: a test run cost nothing; a real payment for a failed run is owed back. */
const snag = (t: { txid: string | null }) =>
  !t.txid || t.txid.startsWith("test-") ? "This office hit a snag. Nothing was charged. Please try again." : "This office hit a snag and used 0¢ of your payment. Tell us and we will send it back.";

class OfficeError extends Error {
  constructor(public status: 400 | 402 | 403 | 404 | 409 | 429 | 502 | 503, message: string) {
    super(message);
  }
}
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const newId = (n = 10) => randomBytes(12).toString("base64url").replace(/[-_]/g, "x").slice(0, n);
async function body(c: Context): Promise<Record<string, unknown>> {
  try {
    return ((await c.req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}
function keyMatches(c: Context, hash: string | null): boolean {
  if (!hash) return true; // legacy project without an owner key: open, like the rest of the app
  const key = c.req.header("x-owner-key") ?? "";
  if (!key) return false;
  const a = Buffer.from(sha256(key), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]", "::1", "::ffff:127.0.0.1"];
/** Same rule as app.ts: local host name AND loopback socket. */
function isLocalRequest(c: Context) {
  if (!LOOPBACK.includes(new URL(c.req.url).hostname)) return false;
  const remote = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress;
  return remote == null || LOOPBACK.includes(remote);
}
export interface OfficeDeps {
  run: RunDeps;
  /** Pay without a wallet: always on a sample-data server (nothing is charged, no AI is used), else local test only. */
  testOk(c: Context): boolean;
}
export const defaultOfficeDeps = (): OfficeDeps => ({
  run: defaultRunDeps(),
  testOk: (c) => config.mockAi || (config.devSkipPayment && isLocalRequest(c)),
});

export function officeRoutes(deps: OfficeDeps = defaultOfficeDeps()) {
  const r = new Hono();
  r.onError((err, c) => (err instanceof OfficeError ? c.json({ error: err.message }, err.status) : c.json({ error: (err as Error).message || "Something went wrong" }, 400)));

  const owned = async (c: Context) => {
    const s = await store.getSpace(c.req.param("sid") ?? "");
    if (!s) throw new OfficeError(404, "These offices were not found.");
    if (!keyMatches(c, s.ownerHash)) throw new OfficeError(403, "Only the owner can open these offices. Use the browser you started from.");
    return s;
  };
  const view = async (s: store.SpaceRow): Promise<OfficesView> => {
    const tasks = await store.listTasks(s.id);
    // A run lost to a restart must not spin forever: it is shown as failed and nothing is charged.
    for (const t of tasks)
      if (t.status === "working" && Date.now() - t.createdAt > STUCK_MS) {
        t.error = snag(t);
        await store.failTask(t.id, t.error);
        t.status = "error";
        t.usedCents = 0;
      }
    return {
      id: s.id,
      source: s.source,
      ...(s.projectId ? { projectId: s.projectId } : {}),
      brain: s.brain,
      questions: s.questions,
      offices: OFFICES,
      inbox: tasks.map(store.toInbox),
      sample: deps.run.mock,
    };
  };

  // (A) continue from a created project: the report and the kit fill the brain, no questions.
  r.post("/api/offices/from-project", async (c) => {
    const projectId = String((await body(c)).projectId ?? "");
    const row = await getProjectRow(projectId);
    const p = row ? await getProject(projectId) : null;
    if (!row || !p) throw new OfficeError(404, "Project not found.");
    if (row.example) throw new OfficeError(403, "The example is read-only. Start your own idea to open your offices.");
    if (!keyMatches(c, row.owner_hash)) throw new OfficeError(403, "Only the person who started this project can open its offices.");
    if (!p.results.mia) throw new OfficeError(409, "Your report is not ready yet.");
    let s = await store.spaceForProject(projectId);
    if (!s) {
      const [v7, kit] = await Promise.all([loadV7(projectId), loadKit(projectId)]);
      const brain = brainFromProject(p, digestOf(p, v7), kit);
      s = { id: newId(), source: "report", projectId, ownerHash: row.owner_hash, brain, questions: [] };
      try {
        await store.insertSpace(s);
      } catch {
        s = (await store.spaceForProject(projectId))!; // two clicks at once: the first one wins
      }
    }
    return c.json({ view: await view(s) });
  });

  // (B) a business the owner already runs: a short form, then up to 3 follow-up questions.
  r.post("/api/offices/bring", async (c) => {
    if (!allow("offices", clientIp(c), config.rateLimit.create, config.rateLimit.windowMs))
      throw new OfficeError(429, "Too many new projects from this connection. Please wait a few minutes.");
    let form;
    try {
      form = readForm(await body(c));
    } catch (e) {
      throw new OfficeError(400, (e as Error).message);
    }
    const brain = brainFromForm(form);
    const questions = await followUps(brain, deps.run);
    const key = randomBytes(18).toString("base64url");
    const s: store.SpaceRow = { id: newId(), source: "brought", projectId: null, ownerHash: sha256(key), brain, questions };
    await store.insertSpace(s);
    return c.json({ view: await view(s), key });
  });

  r.get("/api/offices/:sid", async (c) => c.json(await view(await owned(c))));

  r.post("/api/offices/:sid/answers", async (c) => {
    const s = await owned(c);
    const b = await body(c);
    const answers = b.answers && typeof b.answers === "object" ? (b.answers as Record<string, unknown>) : {};
    const brain = applyAnswers(s.brain, s.questions, answers);
    await store.updateBrain(s.id, brain, []);
    return c.json(await view({ ...s, brain, questions: [] }));
  });

  // The price is shown before anything runs. The quote holds for 15 minutes.
  r.post("/api/offices/:sid/tasks", async (c) => {
    const s = await owned(c);
    const b = await body(c);
    if (!isTaskId(b.task)) throw new OfficeError(400, "Pick a task from one of your offices.");
    const def = TASKS[b.task];
    const input = def.input && typeof b.input === "string" ? b.input.replace(/\r/g, "").trim().slice(0, 4000) : "";
    // Sample servers never fetch a price (no network needed); real ones ask for the live BCH price.
    const rate = deps.run.mock ? bchUsdCached() : await bchUsdOrZero();
    // A real server never quotes 0 sats: without a live price there is no price (a 0-sat quote would buy AI for free).
    if (!deps.run.mock && !(rate > 0)) throw new OfficeError(503, "Prices are unavailable, try again in a minute.");
    const sats = rate > 0 ? Math.ceil((def.cents / 100 / rate) * 1e8) : 0;
    const id = newId(12);
    const expiresAt = Date.now() + QUOTE_MS;
    await store.insertTask({ id, spaceId: s.id, task: def.id, office: def.office, title: def.title, input, quotedCents: def.cents, sats, expiresAt });
    const quote: TaskQuote = {
      taskId: id,
      cents: def.cents,
      sats,
      address: config.merchantAddress,
      tag: `LD1:${s.id}:${id}`,
      expiresAt,
      bchUsd: rate,
      testOk: deps.testOk(c),
    };
    return c.json({ quote });
  });

  r.post("/api/offices/:sid/tasks/:tid/pay", async (c) => {
    const s = await owned(c);
    const t = await store.getTask(s.id, c.req.param("tid"));
    if (!t) throw new OfficeError(404, "This task was not found. Pick it again.");
    if (t.status !== "quoted") return c.json(await view(s)); // already paid: idempotent
    const b = await body(c);
    let txid: string;
    let paidSats: number;
    if (b.test === true) {
      if (!deps.testOk(c)) throw new OfficeError(402, "Payment required.");
      txid = "test-" + newId(12);
      paidSats = 0;
    } else {
      // Real money only buys real AI, and only on a mainnet merchant in production.
      if (deps.run.mock) throw new OfficeError(503, "Real payments are switched off: this server runs with sample data.");
      if (!config.merchantAddress) throw new OfficeError(503, "Payments are not set up yet.");
      if (config.production && !merchantOnMainnet()) throw new OfficeError(503, "Payments are switched off on this server.");
      if (t.expiresAt < Date.now() - 5 * 60_000) throw new OfficeError(400, "The price expired. Pick the task again for a fresh price.");
      // A quote made while the price feed was down (0 sats) never buys a run.
      if (!(t.sats > 0)) throw new OfficeError(400, "This price is not valid. Pick the task again for a fresh price.");
      const txHex = typeof b.txHex === "string" ? b.txHex : "";
      if (!txHex) throw new OfficeError(400, "No signed payment was sent. Approve it in your wallet and try again.");
      let checked;
      try {
        checked = checkPaymentTx(txHex, Math.max(DUST_SATS, Math.floor(t.sats * 0.99)), `LD1:${s.id}:${t.id}`);
      } catch (e) {
        throw new OfficeError(400, (e as Error).message);
      }
      if (checked.paidSats < DUST_SATS) throw new OfficeError(400, "Payment too small. Nothing was charged.");
      if (await store.txidUsed(checked.txid)) throw new OfficeError(409, "This payment was already used.");
      try {
        await broadcast(txHex, checked.txid);
      } catch (e) {
        if (e instanceof RpcError || /^Broadcast rejected/.test((e as Error).message)) throw new OfficeError(400, (e as Error).message);
        throw new OfficeError(502, "Could not reach the Bitcoin Cash network. Your payment may still arrive: check again in a moment.");
      }
      txid = checked.txid;
      paidSats = checked.paidSats;
    }
    if (await store.markPaid(t.id, txid, paidSats)) void work(s, t);
    return c.json(await view(s));
  });

  /** Runs in the background; the inbox shows it working, then done (with used vs quoted) or failed (0¢). */
  async function work(s: store.SpaceRow, t: store.TaskRow) {
    try {
      const out = await runTask(t.task, s.brain, t.input, `office:${s.id}`, deps.run);
      await store.finishTask(t.id, { result: out.result, usd: out.usd, usedCents: chargeCents(out.usd, t.quotedCents) });
    } catch (e) {
      console.error(`[offices] ${s.id} ${t.task}: ${(e as Error).message}`);
      await store.failTask(t.id, snag(t));
    }
  }

  return r;
}
