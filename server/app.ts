import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { installEscrow } from "./escrow/install.js";
import { readFileSync, statSync } from "node:fs";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { normalizeFounderAddress } from "./address.js";
import { broadcast, checkPaymentTx, findQrPayment, paymentTag, RpcError } from "./chain.js";
import { config, merchantOnMainnet, STAGES } from "./config.js";
import { allow, clientIp } from "./ratelimit.js";
import { brakeGuard, brakeView, watchAiFetch } from "./brake.js";
import { REPORT_CAP_USD } from "./cost.js";
import { getTask } from "./offices/store.js";
import { claimStageRun, exec, getProject, getProjectRow, paidFor, stageDone, type ProjectRow } from "./db.js";
import * as jobs from "./jobs.js";
import { isRunning, prepareStage, reserveStart, startStage } from "./jobs.js";
import { SteerError, startSteer } from "./jobs-v7.js";
import { ANALYST_ROLES, type AnalystRole } from "./v7.js";
import { bchUsdCached, bchUsdOrZero, centsToSats } from "./price.js";
import { currentPrices, fmtCents, launchNote, launchNoteInner, pricingView, quotedCents, stagePriceCents } from "./pricing.js";
import { kitRoutes } from "./kit-routes.js";
import { exampleRoutes } from "./examples.js";
import { officeRoutes } from "./offices/routes.js";
import { TASKS as OFFICE_TASKS } from "./offices/catalog.js";
import { siteRowFor } from "./kit.js";
import { siteNotFoundHtml, siteRoutes } from "./site/routes.js";
import { getSite } from "./site/db.js";
import { STAGE_DEPTS, type AppConfig, type CreatedProject, type Project, type Quote, type ShareLink, type SiteData, type Stage, type Stats, type WorkDept } from "./types.js";

export const app = new Hono();
// B1 spend brake: every AI error answer feeds it, and these guards run before escrow and before the routes, so a
// paused server refuses new money before any wallet or chain step. Samples, test pays and paid orders pass.
watchAiFetch();
const stageHeadroom = (stage: unknown) => (stage === "build" ? config.kitSpendCapCents / 100 : REPORT_CAP_USD);
app.post("/api/projects/:id/quote", brakeGuard({ headroom: (b) => stageHeadroom(b.stage) }));
app.post(
  "/api/projects/:id/pay",
  brakeGuard({
    headroom: (b) => stageHeadroom(b.stage),
    // A sample run takes no money; a plain-QR check looks for money that was already sent, so it is recorded.
    skip: async (c, b) => {
      if (b.dev || (b as { watch?: boolean }).watch) return true;
      const paid = await exec("SELECT 1 FROM payments WHERE project_id = ? AND stage = ?", [c.req.param("id") ?? "", String(b.stage ?? "")]);
      return paid.rows.length > 0;
    },
  }),
);
// AI calls included in a paid stage (no new payment): CEO notes and the one logo redraw. In mock mode they cost
// nothing. /api/offices/bring makes no AI call at all (plain questions), so it needs no brake.
const FREE_HEADROOM_USD = 0.05;
for (const path of ["/api/projects/:id/steer", "/api/projects/:id/kit/logo/more"])
  app.post(path, brakeGuard({ skip: () => config.mockAi, headroom: () => FREE_HEADROOM_USD }));
const officeTestOk = (c: Context) => config.mockAi || localDev(c);
app.post("/api/offices/:sid/tasks", brakeGuard({ skip: (c) => officeTestOk(c) }));
app.post(
  "/api/offices/:sid/tasks/:tid/pay",
  brakeGuard({
    skip: async (c, b) => {
      if (b.test === true) return true;
      const t = await getTask(c.req.param("sid") ?? "", c.req.param("tid") ?? "").catch(() => null);
      return !!t && t.status !== "quoted"; // already paid: the route answers as usual
    },
  }),
);
installEscrow(app);
const QUOTE_MS = 15 * 60_000;

class ApiError extends Error {
  constructor(
    public status: 400 | 402 | 403 | 404 | 409 | 429 | 501 | 502 | 503,
    message: string,
  ) {
    super(message);
  }
}

const newId = () => randomBytes(8).toString("base64url").replace(/[-_]/g, "x").slice(0, 10);
const isStage = (s: unknown): s is Stage => STAGES.includes(s as Stage);
/** Dev payments are accepted only from a local host (the Vite proxy keeps the original Host). */
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]", "::1", "::ffff:127.0.0.1"];
const isLocalRequest = (c: Context) => {
  if (!LOOPBACK.includes(new URL(c.req.url).hostname)) return false;
  // The Host header can be spoofed from the LAN: also require a loopback socket when there is one.
  const remote = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress;
  return remote == null || LOOPBACK.includes(remote);
};
/** Payments need a merchant address, and in production it must be a mainnet one. */
const assertPayable = () => {
  if (!config.merchantAddress) throw new ApiError(503, "Payments are not configured yet");
  if (config.production && !merchantOnMainnet()) throw new ApiError(503, "Payments are switched off: the server is not set up for Bitcoin Cash mainnet.");
  assertRealAi();
};
/** Real money must never buy sample output. */
const assertRealAi = () => {
  if (config.mockAi) throw new ApiError(503, "Real payments are switched off: this server runs with sample AI data.");
};

/** F1: a public demo server (sample AI, no local dev switch) only runs the 3 sample ideas. */
const sameIdea = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();
const isSampleIdea = (idea: string) => config.sampleIdeas.some((s) => sameIdea(s, idea));
const localDev = (c: Context) => config.devSkipPayment && isLocalRequest(c);

// ---------- F3: owner key ----------
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/**
 * Checks X-Owner-Key against the stored hash. Legacy projects (no hash) stay open. A wrong key is always refused;
 * a missing key is refused when `strict` (retry, skip, share) or when OWNER_KEY_STRICT=1.
 */
function assertOwner(c: Context, row: ProjectRow | null, strict: boolean) {
  if (!row?.owner_hash) return;
  const key = c.req.header("x-owner-key") ?? "";
  if (!key) {
    if (strict || config.ownerKeyStrict) throw new ApiError(403, "Only the person who started this project can do that. Open it from the browser you used to start it.");
    return;
  }
  const a = Buffer.from(sha256(key), "hex");
  const b = Buffer.from(row.owner_hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError(403, "This link can read the project but not change it.");
}
/** F2: the example pack is read-only. */
function assertWritable(row: ProjectRow | null) {
  if (row?.example) throw new ApiError(403, "The example pack is read-only. Start your own idea to run the team.");
}

/** Pay gate for every route that starts AI on a paid stage: paid, not refunded. */
function assertPaid(p: Project, stage: Stage) {
  if (!p.payments[stage]) throw new ApiError(402, "This stage is not paid yet.");
  if (!paidFor(p, stage)) throw new ApiError(402, "This payment was refunded, so the team cannot work on it again. Contact us if this is a mistake.");
}
/** Counts one run of a paid stage (run + retries, at most MAX_STAGE_RUNS) and rate-limits starts per IP. */
async function claimRun(c: Context, p: Project, stage: Stage) {
  assertPaid(p, stage);
  if (!allow("run", clientIp(c), config.rateLimit.run, config.rateLimit.windowMs))
    throw new ApiError(429, "That is a lot of runs in a few minutes. Please wait a little and try again.");
  if (!(await claimStageRun(p.id, stage)))
    throw new ApiError(402, "This step was already run the most times one payment allows. Contact us and we will sort it out.");
}

async function body<T>(c: Context): Promise<Partial<T>> {
  try {
    return ((await c.req.json()) ?? {}) as Partial<T>;
  } catch {
    return {};
  }
}

app.onError((err, c) => {
  if (err instanceof ApiError) return c.json({ error: err.message }, err.status);
  console.error(`[api] ${c.req.method} ${c.req.path}: ${err.message}`);
  return c.json({ error: err.message || "Unexpected error" }, 400);
});

app.get("/healthz", async (c) => {
  await exec("SELECT 1");
  return c.text("ok");
});

app.get("/api/config", async (c) =>
  c.json({
    ...(await brakeView()),
    // Today's prices (the BLAZE launch price until its end, then the regular ones), the regular ones and the end date.
    ...pricingView(),
    // The cheapest office task today ("from 2¢" in the UI), from the same catalog the quotes use.
    officesFromCents: Math.min(...Object.values(OFFICE_TASKS).map((t) => t.cents)),
    merchantAddress: config.merchantAddress,
    mockAi: config.mockAi,
    devSkipPayment: config.devSkipPayment,
    // Never block the first paint on the price feeds: cached value now, fresh one on the next call.
    bchUsd: bchUsdCached(),
    hackathon: config.hackathon,
    sampleIdeas: config.sampleIdeas,
  } satisfies AppConfig),
);

/** Real counts. Local dev payments (txid "dev-…") never count. */
app.get("/api/stats", async (c) => {
  // Seeded examples (projects.example = 1) never count, whatever txid they carry.
  const notExample = "project_id NOT IN (SELECT id FROM projects WHERE example = 1)";
  const real = (stage: Stage) => `SELECT project_id FROM payments WHERE stage = '${stage}' AND txid NOT LIKE 'dev-%' AND ${notExample}`;
  const [ideas, payments, launched] = await Promise.all([
    exec(`SELECT COUNT(*) AS n FROM jobs WHERE dept = 'leo' AND status = 'done' AND project_id IN (${real("validate")})`),
    exec(`SELECT COUNT(*) AS n FROM payments WHERE txid NOT LIKE 'dev-%' AND ${notExample}`),
    exec(`SELECT COUNT(*) AS n FROM jobs WHERE dept = 'pip' AND status = 'done' AND project_id IN (${real("build")})`),
  ]);
  const n = (r: typeof ideas) => Number(r.rows[0]?.n ?? 0);
  // L18: median paid → last department done, over real runs only; null below 5 runs (no ETA shown).
  const median = async (stage: Stage): Promise<number | null> => {
    const r = await exec(
      `SELECT MAX(j.finished_at) - p.created_at AS ms FROM payments p JOIN jobs j ON j.project_id = p.project_id AND j.stage = p.stage
       WHERE p.stage = ? AND p.txid NOT LIKE 'dev-%' AND p.${notExample} GROUP BY p.project_id
       HAVING COUNT(*) = SUM(CASE WHEN j.status = 'done' THEN 1 ELSE 0 END)`,
      [stage],
    );
    const ms = r.rows.map((x) => Number(x.ms)).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
    return ms.length < 5 ? null : ms[Math.floor(ms.length / 2)]!;
  };
  const medianMs = { validate: await median("validate"), build: await median("build") };
  return c.json({ ideas: n(ideas), payments: n(payments), launched: n(launched), medianMs } satisfies Stats);
});

app.post("/api/projects", async (c) => {
  const { idea } = await body<{ idea: string }>(c);
  const text = (typeof idea === "string" ? idea : "").trim();
  if (config.mockAi && !localDev(c) && !isSampleIdea(text))
    throw new ApiError(400, "This demo server only runs the 3 sample ideas. Pick one of them to watch a sample run.");
  if (text.length < 15) throw new ApiError(400, "Tell us a bit more about your idea (at least a sentence).");
  if (text.length > 2000) throw new ApiError(400, "Please keep the idea under 2000 characters.");
  if (!allow("create", clientIp(c), config.rateLimit.create, config.rateLimit.windowMs))
    throw new ApiError(429, "You started a lot of projects in a few minutes. Please wait a little and try again.");
  const id = newId();
  // F3: the key is returned once; only its hash is stored.
  const ownerKey = randomBytes(24).toString("base64url");
  await exec("INSERT INTO projects (id, idea, created_at, owner_hash) VALUES (?, ?, ?, ?)", [id, text, Date.now(), sha256(ownerKey)]);
  return c.json({ id, ownerKey } satisfies CreatedProject);
});

app.get("/api/projects/:id", async (c) => {
  const p = await getProject(c.req.param("id"));
  if (!p) throw new ApiError(404, "Project not found");
  return c.json(p satisfies Project);
});

async function loadForStage(id: string, stage: unknown) {
  if (!isStage(stage)) throw new ApiError(400, "Unknown stage");
  const p = await getProject(id);
  if (!p) throw new ApiError(404, "Project not found");
  if (stage === "build" && !stageDone(p, "validate")) throw new ApiError(409, "Finish Stage 1 (Validate) first.");
  return { p, stage };
}

/** BCH dust limit: no quote asks for less (an output below it cannot be broadcast). */
const DUST_SATS = 546;
/** F10: no QR amount is handed out twice within this window (a late payment can only ever match its own quote). */
const QR_REUSE_MS = 24 * 60 * 60_000;
/**
 * F10: a sat suffix (1–999, then up to 9999 if those are all taken) that no quote got in the last 24 h, so a plain QR
 * payment can be matched by its exact amount to exactly one quote. Recorded at once in qr_amounts.
 */
async function uniqueQrSats(base: number, projectId: string, stage: Stage): Promise<number | null> {
  const now = Date.now();
  await pruneQr(now);
  const recent = await exec("SELECT sats FROM qr_amounts WHERE issued_at > ? AND sats BETWEEN ? AND ?", [now - QR_REUSE_MS, base + 1, base + 9999]);
  const used = new Set(recent.rows.map((r) => Number(r.sats)));
  for (const span of [999, 9999]) {
    const free: number[] = [];
    for (let i = 1; i <= span; i++) if (!used.has(base + i)) free.push(base + i);
    if (!free.length) continue;
    const v = free[Math.floor(Math.random() * free.length)]!;
    await exec("INSERT INTO qr_amounts (sats, project_id, stage, issued_at) VALUES (?, ?, ?, ?)", [v, projectId, stage, now]);
    return v;
  }
  // Every slot near this amount is taken: no plain QR for this quote (the wallet path still works). Never fail the quote.
  return null;
}
/** qr_seen keeps a longer memory than the 24 h reuse window, so an old payment is never "first seen" again as new. */
const QR_SEEN_KEEP_MS = 30 * 24 * 60 * 60_000;
let qrPrunedAt = 0;
/** Drops qr_amounts rows past the reuse window and old qr_seen rows (at most once an hour per process). */
export async function pruneQr(now = Date.now(), force = false) {
  if (!force && now - qrPrunedAt < 60 * 60_000) return;
  qrPrunedAt = now;
  await exec("DELETE FROM qr_amounts WHERE issued_at <= ?", [now - QR_REUSE_MS]);
  await exec("DELETE FROM qr_seen WHERE first_seen <= ?", [now - QR_SEEN_KEEP_MS]);
}
/** F10: when this server first saw `txid` paying the merchant address (recorded on the first sighting). */
async function firstSeen(txid: string): Promise<number> {
  await exec("INSERT OR IGNORE INTO qr_seen (txid, first_seen) VALUES (?, ?)", [txid, Date.now()]);
  const r = await exec("SELECT first_seen FROM qr_seen WHERE txid = ?", [txid]);
  return Number(r.rows[0]?.first_seen ?? 0);
}
const bip21 = (sats: number) =>
  `${config.merchantAddress.startsWith("bitcoincash:") ? "" : "bitcoincash:"}${config.merchantAddress}?amount=${(sats / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "")}`;

app.post("/api/projects/:id/quote", async (c) => {
  const qb = await body<{ stage: Stage; refundAddress: string }>(c);
  const { p, stage } = await loadForStage(c.req.param("id"), qb.stage);
  const qrow = await getProjectRow(p.id);
  assertWritable(qrow);
  // An escrow quote binds a refund address to the order: only the owner may set or replace it (else anyone who knows
  // the project id could swap the contract address under a payment the owner already signed).
  assertOwner(c, qrow, !!qb.refundAddress);
  assertPayable();
  const now = Date.now();
  const q = await exec("SELECT sats, expires_at, bch_usd, qr_sats, cents FROM quotes WHERE project_id = ? AND stage = ?", [p.id, stage]);
  let sats: number;
  let cents: number;
  let expiresAt: number;
  let rate: number;
  let qrSats: number | null;
  const row = q.rows[0];
  if (row && Number(row.expires_at) > now + 60_000) {
    // A quote already issued keeps its amount (and the price it was made at), even across the launch-price switch.
    sats = Number(row.sats);
    cents = row.cents == null ? stagePriceCents(stage) : Number(row.cents);
    expiresAt = Number(row.expires_at);
    rate = row.bch_usd == null ? await bchUsdOrZero() : Number(row.bch_usd);
    qrSats = row.qr_sats == null ? await uniqueQrSats(sats, p.id, stage) : Number(row.qr_sats);
    if ((row.qr_sats == null && qrSats != null) || row.bch_usd == null)
      await exec("UPDATE quotes SET bch_usd = ?, qr_sats = ? WHERE project_id = ? AND stage = ?", [rate || null, qrSats, p.id, stage]);
  } else {
    rate = await bchUsdOrZero();
    // No live price, no quote: never a 0 or stale-guess amount that could buy a run for nothing.
    if (!(rate > 0)) throw new ApiError(503, "Prices are unavailable, try again in a minute.");
    // Each new quote row reserves a QR amount slot for 24 h: cap how fast one visitor can take them.
    if (!allow("quote", clientIp(c), config.rateLimit.quote, config.rateLimit.windowMs))
      throw new ApiError(429, "That is a lot of price quotes in a few minutes. Please wait a little and try again.");
    // Never below the BCH dust limit: a smaller output cannot be broadcast, so that price could never be paid.
    cents = stagePriceCents(stage);
    sats = Math.max(DUST_SATS, await centsToSats(cents));
    qrSats = await uniqueQrSats(sats, p.id, stage);
    expiresAt = now + QUOTE_MS;
    await exec("INSERT OR REPLACE INTO quotes (project_id, stage, sats, expires_at, bch_usd, qr_sats, cents) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      p.id,
      stage,
      sats,
      expiresAt,
      rate || null,
      qrSats,
      cents,
    ]);
  }
  const quote: Quote = {
    stage,
    sats,
    cents,
    address: config.merchantAddress,
    tag: paymentTag(p.id, stage),
    expiresAt,
    // F10: the plain QR asks for a unique amount (sats + 1–999) so the server can match it without an OP_RETURN tag.
    ...(qrSats != null ? { bip21: bip21(qrSats) } : {}),
    bchUsd: rate,
  };
  return c.json(quote);
});

app.post("/api/projects/:id/pay", async (c) => {
  const b = await body<{ stage: Stage; txHex: string; dev: boolean; founderAddress: string; watch: boolean }>(c);
  const { p, stage } = await loadForStage(c.req.param("id"), b.stage);
  const prow = await getProjectRow(p.id);
  assertWritable(prow);
  assertOwner(c, prow, false);
  // F1: on a sample-data server anyone may watch a sample run of a sample idea. No money, no AI cost.
  const sampleRun = !!b.dev && config.mockAi && !localDev(c) && isSampleIdea(p.idea);

  // The landing page QR pays the founder directly, so we need their address before taking the money.
  // It is validated now but only stored once the payment itself is accepted.
  let founder: string | null = null;
  if (stage === "build" && !p.payments.build) {
    const row = await getProjectRow(p.id);
    founder = b.founderAddress != null && b.founderAddress !== "" ? normalizeFounderAddress(b.founderAddress) : (row?.founder_address ?? null);
    // Sample run: the page uses the merchant address and is labelled a demo page (dev txid).
    if (!founder && sampleRun && config.merchantAddress) founder = normalizeFounderAddress(config.merchantAddress);
    if (!founder) throw new ApiError(400, "Connect your wallet first: we need your address for the pre-order QR.");
  }

  if (!p.payments[stage]) {
    let txid: string;
    let sats: number;
    if (b.dev) {
      if (!sampleRun && !localDev(c)) throw new ApiError(402, "Payment required");
      txid = "dev-" + newId();
      sats = 0;
    } else if (b.watch) {
      // F10: plain QR (BIP21) payment. Look for a transaction paying the exact unique amount of this quote.
      assertPayable();
      const q = await exec("SELECT qr_sats, expires_at FROM quotes WHERE project_id = ? AND stage = ?", [p.id, stage]);
      const row = q.rows[0];
      if (!row) throw new ApiError(400, "Get a price quote first");
      if (row.qr_sats == null) throw new ApiError(400, "This price has no QR code. Pay from a connected wallet, or get a new price in a minute.");
      if (Number(row.expires_at) < Date.now() - 5 * 60_000) throw new ApiError(400, "The price quote expired. Please try again.");
      let found: { txid: string; sats: number } | null;
      try {
        const since = Number(row.expires_at) - QUOTE_MS; // when the quote was made
        found = await findQrPayment(Number(row.qr_sats), since, firstSeen);
      } catch {
        found = null; // network hiccup: the client keeps polling
      }
      if (!found) return c.json((await getProject(p.id)) satisfies Project | null);
      const used = await exec("SELECT project_id FROM payments WHERE txid = ?", [found.txid]);
      if (used.rows.length && String(used.rows[0]!.project_id) !== p.id) return c.json((await getProject(p.id)) satisfies Project | null);
      txid = found.txid;
      sats = found.sats;
    } else {
      assertPayable();
      const q = await exec("SELECT sats, expires_at FROM quotes WHERE project_id = ? AND stage = ?", [p.id, stage]);
      const row = q.rows[0];
      if (!row) throw new ApiError(400, "Get a price quote first");
      if (Number(row.expires_at) < Date.now() - 5 * 60_000) throw new ApiError(400, "The price quote expired. Please try again.");
      const quoted = Number(row.sats);
      const txHex = typeof b.txHex === "string" ? b.txHex : "";
      if (!txHex) throw new ApiError(400, "No signed transaction was sent. Approve the payment in your wallet and try again.");
      let checked: ReturnType<typeof checkPaymentTx>;
      try {
        checked = checkPaymentTx(txHex, Math.floor(quoted * 0.99), paymentTag(p.id, stage));
      } catch (e) {
        throw new ApiError(400, (e as Error).message);
      }
      // Idempotent: the same transaction sent twice (double click, retry after a timeout) is not broadcast again.
      const known = await exec("SELECT project_id, stage FROM payments WHERE txid = ?", [checked.txid]);
      if (known.rows.length && (String(known.rows[0]!.project_id) !== p.id || String(known.rows[0]!.stage) !== stage))
        throw new ApiError(409, "This payment was already used for another order.");
      try {
        await broadcast(txHex, checked.txid);
      } catch (e) {
        // A rejected broadcast is final; a network failure is not (the client can check again).
        if (e instanceof RpcError || /^Broadcast rejected/.test((e as Error).message)) throw new ApiError(400, (e as Error).message);
        throw new ApiError(502, "Could not reach the Bitcoin Cash network. Your payment may still arrive: check again in a moment.");
      }
      txid = checked.txid;
      sats = checked.paidSats;
    }
    try {
      await exec("INSERT INTO payments (txid, project_id, stage, sats, cents, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
        txid,
        p.id,
        stage,
        sats,
        await quotedCents(p.id, stage),
        Date.now(),
      ]);
    } catch {
      const again = await getProject(p.id);
      if (again?.payments[stage]?.txid !== txid) throw new ApiError(409, "This payment was already used");
    }
  }
  if (founder) await exec("UPDATE projects SET founder_address = ? WHERE id = ?", [founder, p.id]);
  return c.json((await getProject(p.id)) satisfies Project | null);
});

/** Starts the department jobs in the background. Idempotent; progress is visible through GET. */
app.post("/api/projects/:id/run", async (c) => {
  const { p, stage } = await loadForStage(c.req.param("id"), (await body<{ stage: Stage }>(c)).stage);
  const row = await getProjectRow(p.id);
  assertWritable(row);
  assertOwner(c, row, false);
  assertPaid(p, stage);
  const release = !stageDone(p, stage) ? reserveStart(p.id, stage) : null;
  if (release) {
    try {
      await claimRun(c, p, stage);
      await prepareStage(p.id, stage);
      void startStage(p.id, stage);
    } finally {
      release();
    }
  }
  return c.json({ ok: true as const });
});

/**
 * v7 CEO steer (contract §d): body {note ≤ 280, target?: AnalystRole[]}, same auth as /run. Free.
 * 202 {id, ack, rerun}; progress via GET /api/projects/:id → results.v7.steers[]. 409 while a stage or a steer runs
 * (or before the report exists); 429 after STEER_LIMIT notes.
 */
app.post("/api/projects/:id/steer", async (c) => {
  const id = c.req.param("id");
  const row = await getProjectRow(id);
  if (!row) throw new ApiError(404, "Project not found");
  assertWritable(row);
  assertOwner(c, row, false);
  const p = await getProject(id);
  if (!p) throw new ApiError(404, "Project not found");
  assertPaid(p, "validate");
  const { note, target } = await body<{ note: string; target: AnalystRole[] }>(c);
  const text = (typeof note === "string" ? note : "").replace(/\s+/g, " ").trim();
  if (text.length < 3) throw new ApiError(400, "Write a short note for your team.");
  if (text.length > 280) throw new ApiError(400, "Keep the note under 280 characters.");
  const roles = Array.isArray(target) ? target.filter((r): r is AnalystRole => (ANALYST_ROLES as readonly string[]).includes(r)) : undefined;
  if (!allow("steer", clientIp(c), config.rateLimit.steer, config.rateLimit.windowMs))
    throw new ApiError(429, "That is a lot of notes in a few minutes. Please wait a little before steering again.");
  if (isRunning(p.id, "validate") || isRunning(p.id, "build")) throw new ApiError(409, "Your team is still working. Steer when it is done.");
  try {
    return c.json(await startSteer(p.id, p.idea, text, roles), 202);
  } catch (e) {
    if (e instanceof SteerError) throw new ApiError(e.status, e.message);
    throw e;
  }
});

/** Public data for the generated landing page at /s/:slug. */
app.get("/api/sites/:slug", async (c) => {
  const r = await exec("SELECT id, founder_address FROM projects WHERE slug = ?", [c.req.param("slug").toLowerCase()]);
  const row = r.rows[0];
  if (!row) throw new ApiError(404, "Page not found");
  const p = await getProject(String(row.id));
  const { nova, dex, pip } = p?.results ?? {};
  if (!p || !nova || !dex || !pip || !row.founder_address) throw new ApiError(404, "Page not found");
  const brand = nova.names[nova.chosen] ?? nova.names[0];
  const logo = dex.logos[0];
  if (!brand || !logo) throw new ApiError(404, "Page not found");
  const site: SiteData = {
    slug: pip.slug,
    name: brand.name,
    tagline: brand.tagline,
    palette: brand.palette,
    logo,
    landing: dex.landing,
    founderAddress: String(row.founder_address),
    bchUsd: await bchUsdOrZero(),
    demo: String(row.founder_address) === config.merchantAddress && !!p.payments.build?.txid.startsWith("dev-"),
    fonts: nova.typography,
    wordmark: logo.wordmark,
    faq: dex.landing.faq,
    where_when: dex.landing.where_when,
    offer_price: dex.landing.offer_price,
    normal_price: dex.landing.normal_price,
    currency: p.results.sam?.currency ?? p.results.mia?.market.currency ?? "€",
  };
  return c.json(site);
});

// ---------- v4 routes (contracts-v4.md). Owner: WS3. ----------
const WORK_DEPTS: WorkDept[] = [...STAGE_DEPTS.validate, ...STAGE_DEPTS.build];
const deptStage = (d: WorkDept): Stage => (STAGE_DEPTS.validate.includes(d) ? "validate" : "build");
type JobsExtra = { retryDept?: (id: string, d: WorkDept) => Promise<void>; skipDept?: (id: string, d: "nova" | "dex" | "rae") => Promise<void> };
const jobsExtra = jobs as unknown as JobsExtra;

async function ownedProject(c: Context) {
  const row = await getProjectRow(c.req.param("id") ?? "");
  if (!row) throw new ApiError(404, "Project not found");
  assertWritable(row);
  assertOwner(c, row, true);
  const p = await getProject(row.id);
  if (!p) throw new ApiError(404, "Project not found");
  return { row, p };
}

/** R18/F14: re-run one failed department for free. Body {dept}. Idempotent: a department that isn't failed is left alone. */
app.post("/api/projects/:id/retry", async (c) => {
  const { p } = await ownedProject(c);
  const { dept } = await body<{ dept: WorkDept }>(c);
  if (!WORK_DEPTS.includes(dept as WorkDept)) throw new ApiError(400, "Unknown department");
  const d = dept as WorkDept;
  const stage = deptStage(d);
  assertPaid(p, stage);
  if (p.status[d] !== "error") return c.json({ ok: true as const });
  if (jobsExtra.retryDept) {
    await claimRun(c, p, stage);
    await jobsExtra.retryDept(p.id, d);
  } else {
    // Until jobs.retryDept lands: re-queue the failed department and run the stage on from there (free).
    const release = reserveStart(p.id, stage);
    if (release) {
      try {
        await claimRun(c, p, stage);
        await prepareStage(p.id, stage);
        void startStage(p.id, stage);
      } finally {
        release();
      }
    }
  }
  return c.json({ ok: true as const });
});

/** R18/F14: skip a failed Nova, Dex or Rae. Body {dept}. Mia, Leo, Sam and Pip must succeed. */
app.post("/api/projects/:id/skip", async (c) => {
  const { p } = await ownedProject(c);
  const { dept } = await body<{ dept: WorkDept }>(c);
  if (dept !== "nova" && dept !== "dex" && dept !== "rae") throw new ApiError(400, "Only Nova, Dex and Rae can be skipped.");
  assertPaid(p, "build");
  if (p.status[dept] !== "error") return c.json({ ok: true as const });
  if (!jobsExtra.skipDept) throw new ApiError(501, "Skipping is not available yet. Try again, free.");
  await claimRun(c, p, "build"); // skipping continues the stage (more AI): it counts as a run
  await jobsExtra.skipDept(p.id, dept);
  return c.json({ ok: true as const });
});

/** F5: create (or return) the read-only share link. */
app.post("/api/projects/:id/share", async (c) => {
  const { row } = await ownedProject(c);
  if (row.share_id) return c.json({ shareId: row.share_id } satisfies ShareLink);
  for (let i = 0; i < 5; i++) {
    const shareId = randomBytes(12).toString("base64url").replace(/[-_]/g, "").slice(0, 10);
    if (shareId.length < 10) continue;
    try {
      await exec("UPDATE projects SET share_id = ? WHERE id = ? AND share_id IS NULL", [shareId, row.id]);
    } catch {
      continue; // unique index collision: try another id
    }
    const now = await getProjectRow(row.id);
    if (now?.share_id) return c.json({ shareId: now.share_id } satisfies ShareLink);
  }
  throw new ApiError(409, "Could not create a share link. Please try again.");
});

/** F5: revoke the share link. */
app.delete("/api/projects/:id/share", async (c) => {
  const { row } = await ownedProject(c);
  await exec("UPDATE projects SET share_id = NULL WHERE id = ?", [row.id]);
  return c.json({ ok: true as const });
});

/** Read-only copy for /r/:shareId: no owner-only fields. */
async function sharedProject(shareId: string): Promise<Project | null> {
  if (!/^[A-Za-z0-9]{6,32}$/.test(shareId)) return null;
  const r = await exec("SELECT id FROM projects WHERE share_id = ?", [shareId]);
  const id = r.rows[0]?.id;
  if (id == null) return null;
  const p = await getProject(String(id));
  if (!p) return null;
  const { share_id: _s, attempts: _a, ...rest } = p;
  return rest;
}

/** F5: read-only Project for /r/:shareId. */
app.get("/api/r/:shareId", async (c) => {
  const p = await sharedProject(c.req.param("shareId"));
  if (!p) throw new ApiError(404, "This shared report doesn't exist or was turned off by its owner.");
  return c.json(p satisfies Project);
});

// Launch kit API and the new websites answer before the /api/* catch-all and before the old /s/:slug page.
// A kit's website is read straight from the kit (brand, chosen logo, chosen design), so a choice shows at once;
// the sites table is the second source. Unknown slugs fall through to the old page.
app.route("/", exampleRoutes()); // finished examples: /api/examples, proof (server/examples.ts)
app.route("/", kitRoutes());
app.route("/", officeRoutes()); // "Your offices" (server/offices/routes.ts)
app.route("/", siteRoutes({ load: async (slug) => (await siteRowFor(slug)) ?? (await getSite(slug)) }));

app.all("/api/*", () => {
  throw new ApiError(404, "Not found");
});

// F6: link previews. /s/:slug and /r/:id get their own <title> and og tags before the SPA fallback.
// PNG previews (/og/*.png) need @resvg/resvg-js, which is not installed: those answer 501 and no og:image is set.
app.get("/og/*", (c) => c.json({ error: "Link preview images are not available yet." }, 501));

// "/" (and every other client route) is the v7 app, dist/web/index.html. The v4 bundle, dist/web/classic.html,
// still renders the public site /s/:slug and the shared pack /r/:shareId.
const htmlCache = new Map<string, { at: number; html: string }>();
/** A built HTML entry from dist/web, re-read when a new build replaces it. */
const readHtml = (file: string) => {
  const path = `./dist/web/${file}`;
  try {
    const at = statSync(path).mtimeMs;
    const hit = htmlCache.get(path);
    if (hit && hit.at === at) return hit.html;
    const html = readFileSync(path, "utf8");
    htmlCache.set(path, { at, html });
    return html;
  } catch {
    return null;
  }
};
const readIndex = () => readHtml("classic.html");
const attr = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
function withMeta(html: string, m: { title: string; description: string; noindex?: boolean }) {
  const tags = [
    `<title>${attr(m.title)}</title>`,
    `<meta name="description" content="${attr(m.description)}">`,
    `<meta property="og:title" content="${attr(m.title)}">`,
    `<meta property="og:description" content="${attr(m.description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta name="twitter:card" content="summary">`,
    m.noindex ? `<meta name="robots" content="noindex">` : "",
  ].join("");
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+(?:name="description"|property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\s*/gi, "")
    .replace(/<\/head>/i, `${tags}</head>`);
}

app.get("/s/:slug", async (c, next) => {
  const html = readIndex();
  if (!html) return next();
  try {
    const r = await exec("SELECT id FROM projects WHERE slug = ?", [c.req.param("slug").toLowerCase()]);
    const p = r.rows[0] ? await getProject(String(r.rows[0].id)) : null;
    const nova = p?.results.nova;
    const brand = nova ? (nova.names[nova.chosen] ?? nova.names[0]) : null;
    // nothing published here: a server page with today's prices (the old SPA 404 named a stale price)
    if (!p || !brand || !p.results.pip) return c.html(siteNotFoundHtml(c.req.param("slug").toLowerCase()), 404);
    const headline = p.results.dex?.landing.headline;
    return c.html(withMeta(html, { title: brand.tagline ? `${brand.name} · ${brand.tagline}` : brand.name, description: headline || brand.tagline || brand.name }));
  } catch {
    return c.html(html);
  }
});

app.get("/r/:shareId", async (c, next) => {
  const p = await sharedProject(c.req.param("shareId")).catch(() => null);
  // the current app never makes /r links: an unknown or revoked one goes to the real home, not the old v4 page
  if (!p) return c.redirect("/", 302);
  const html = readIndex();
  if (!html) return next();
  const title = p?.results.mia?.title ?? "Shared report";
  const leo = p?.results.leo;
  const verdict = leo ? `${leo.score.toFixed(1)}/10 · ${leo.verdict === "go" ? "Go" : leo.verdict === "pivot" ? "Pivot first" : "No-go"}. ` : "";
  return c.html(
    withMeta(html, { title: `${title} · LaunchDesk report`, description: `${verdict}${p?.results.mia?.one_liner ?? "A startup report made with LaunchDesk."}`, noindex: true }),
    p ? 200 : 404,
  );
});

/**
 * The home page with today's prices already in it (no flash of the defaults): every data-price span gets the
 * price of the day (server/pricing.ts: the launch price, then the regular one; the offices catalog), and so do the link-preview meta
 * tags, which name the report price. The browser re-applies the same values from /api/config.
 */
export function withPrices(html: string, now?: number): string {
  const prices = currentPrices(now);
  const text: Record<string, string> = {
    validate: fmtCents(prices.validate),
    build: fmtCents(prices.build),
    offices: `from ${fmtCents(Math.min(...Object.values(OFFICE_TASKS).map((t) => t.cents)))}`,
  };
  const note = launchNote(now);
  return html
    // The BLAZE launch-price line: filled while the window is open, hidden after it.
    .replace(/(<(p|span|div)\b[^>]*?\sdata-launch-note)(?:\s+hidden)?>(?:[^<]+|<span>[^<]*<\/span>)*(<\/\2>)/g, (_m, open: string, _t: string, close: string) =>
      note ? `${open}>${launchNoteInner(note)}${close}` : `${open} hidden>${close}`,
    )
    .replace(/(<(span|tspan) data-price="(validate|build|offices)">)[^<]*(<\/\2>)/g, (_m, open: string, _t: string, k: string, close: string) => open + text[k] + close)
    .replace(/(<meta\s+(?:name|property)="(?:description|og:description|twitter:description)"\s+content=")([^"]*)(")/gi, (_m, a: string, body: string, b: string) => a + body.replace(/\b10¢/g, text.validate!) + b);
}
const servePricedIndex = (c: Context, next: () => Promise<void>) => {
  const html = readHtml("index.html");
  return html ? c.html(withPrices(html)) : next();
};

// Built app (production). /s/:slug and /r/:id are answered above with classic.html; /proto.html is served as a
// file (alias of the v7 app); every other client route (/, /p/:id, …) falls back to the v7 index.html, with prices.
// the older free example pack (id "example", the plain /s/pausa page): its link now opens the real, paid finished example
app.get("/p/example", (c) => c.redirect(`/p/ex-coffee-bcn${new URL(c.req.url).search}`, 302));
app.get("/p/example/", (c) => c.redirect(`/p/ex-coffee-bcn${new URL(c.req.url).search}`, 302));
app.get("/", servePricedIndex);
app.get("/index.html", servePricedIndex);
app.use("/*", serveStatic({ root: "./dist/web" }));
app.get("/*", servePricedIndex);
