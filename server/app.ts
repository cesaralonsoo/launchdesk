import { randomBytes } from "node:crypto";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { normalizeFounderAddress } from "./address.js";
import { broadcast, checkPaymentTx, paymentTag, RpcError } from "./chain.js";
import { config, STAGES } from "./config.js";
import { exec, getProject, getProjectRow, stageDone } from "./db.js";
import { isRunning, prepareStage, startStage } from "./jobs.js";
import { bchUsdCached, bchUsdOrZero, centsToSats } from "./price.js";
import type { AppConfig, Project, Quote, SiteData, Stage, Stats } from "./types.js";

export const app = new Hono();
const QUOTE_MS = 15 * 60_000;

class ApiError extends Error {
  constructor(
    public status: 400 | 402 | 404 | 409 | 502 | 503,
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
/** Real money must never buy sample output. */
const assertRealAi = () => {
  if (config.mockAi) throw new ApiError(503, "Real payments are switched off: this server runs with sample AI data.");
};

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
    prices: config.priceCents,
    merchantAddress: config.merchantAddress,
    mockAi: config.mockAi,
    devSkipPayment: config.devSkipPayment,
    // Never block the first paint on the price feeds: cached value now, fresh one on the next call.
    bchUsd: bchUsdCached(),
  } satisfies AppConfig),
);

/** Real counts. Local dev payments (txid "dev-…") never count. */
app.get("/api/stats", async (c) => {
  const real = (stage: Stage) => `SELECT project_id FROM payments WHERE stage = '${stage}' AND txid NOT LIKE 'dev-%'`;
  const [ideas, payments, launched] = await Promise.all([
    exec(`SELECT COUNT(*) AS n FROM jobs WHERE dept = 'leo' AND status = 'done' AND project_id IN (${real("validate")})`),
    exec("SELECT COUNT(*) AS n FROM payments WHERE txid NOT LIKE 'dev-%'"),
    exec(`SELECT COUNT(*) AS n FROM jobs WHERE dept = 'pip' AND status = 'done' AND project_id IN (${real("build")})`),
  ]);
  const n = (r: typeof ideas) => Number(r.rows[0]?.n ?? 0);
  return c.json({ ideas: n(ideas), payments: n(payments), launched: n(launched) } satisfies Stats);
});

app.post("/api/projects", async (c) => {
  const { idea } = await body<{ idea: string }>(c);
  const text = (typeof idea === "string" ? idea : "").trim();
  if (text.length < 15) throw new ApiError(400, "Tell us a bit more about your idea (at least a sentence).");
  if (text.length > 2000) throw new ApiError(400, "Please keep the idea under 2000 characters.");
  const id = newId();
  await exec("INSERT INTO projects (id, idea, created_at) VALUES (?, ?, ?)", [id, text, Date.now()]);
  return c.json({ id });
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

app.post("/api/projects/:id/quote", async (c) => {
  const { p, stage } = await loadForStage(c.req.param("id"), (await body<{ stage: Stage }>(c)).stage);
  if (!config.merchantAddress) throw new ApiError(503, "Payments are not configured yet");
  assertRealAi();
  const now = Date.now();
  const q = await exec("SELECT sats, expires_at FROM quotes WHERE project_id = ? AND stage = ?", [p.id, stage]);
  let sats: number;
  let expiresAt: number;
  const row = q.rows[0];
  if (row && Number(row.expires_at) > now + 60_000) {
    sats = Number(row.sats);
    expiresAt = Number(row.expires_at);
  } else {
    sats = await centsToSats(config.priceCents[stage]);
    expiresAt = now + QUOTE_MS;
    await exec("INSERT OR REPLACE INTO quotes (project_id, stage, sats, expires_at) VALUES (?, ?, ?, ?)", [p.id, stage, sats, expiresAt]);
  }
  const quote: Quote = { stage, sats, cents: config.priceCents[stage], address: config.merchantAddress, tag: paymentTag(p.id, stage), expiresAt };
  return c.json(quote);
});

app.post("/api/projects/:id/pay", async (c) => {
  const b = await body<{ stage: Stage; txHex: string; dev: boolean; founderAddress: string }>(c);
  const { p, stage } = await loadForStage(c.req.param("id"), b.stage);

  // The landing page QR pays the founder directly, so we need their address before taking the money.
  // It is validated now but only stored once the payment itself is accepted.
  let founder: string | null = null;
  if (stage === "build" && !p.payments.build) {
    const row = await getProjectRow(p.id);
    founder = b.founderAddress != null && b.founderAddress !== "" ? normalizeFounderAddress(b.founderAddress) : (row?.founder_address ?? null);
    if (!founder) throw new ApiError(400, "Connect your wallet first: we need your address for the pre-order QR.");
  }

  if (!p.payments[stage]) {
    let txid: string;
    let sats: number;
    if (b.dev) {
      if (!config.devSkipPayment || !isLocalRequest(c)) throw new ApiError(402, "Payment required");
      txid = "dev-" + newId();
      sats = 0;
    } else {
      assertRealAi();
      const q = await exec("SELECT sats, expires_at FROM quotes WHERE project_id = ? AND stage = ?", [p.id, stage]);
      const row = q.rows[0];
      if (!row) throw new ApiError(400, "Get a price quote first");
      if (Number(row.expires_at) < Date.now() - 5 * 60_000) throw new ApiError(400, "The price quote expired. Please try again.");
      const quoted = Number(row.sats);
      const txHex = typeof b.txHex === "string" ? b.txHex : "";
      const checked = checkPaymentTx(txHex, Math.floor(quoted * 0.99), paymentTag(p.id, stage));
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
        config.priceCents[stage],
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
  if (!p.payments[stage]) throw new ApiError(402, "This stage is not paid yet.");
  if (!stageDone(p, stage) && !isRunning(p.id, stage)) {
    await prepareStage(p.id, stage);
    void startStage(p.id, stage);
  }
  return c.json({ ok: true as const });
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
  };
  return c.json(site);
});

app.all("/api/*", () => {
  throw new ApiError(404, "Not found");
});

// Built SPA (production). Client routes /, /p/:id and /s/:slug all fall back to index.html.
app.use("/*", serveStatic({ root: "./dist/web" }));
app.get("/*", serveStatic({ path: "./dist/web/index.html" }));
