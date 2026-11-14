import { randomBytes } from "node:crypto";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { runStage } from "./ai.js";
import { broadcast, checkPaymentTx, paymentTag } from "./chain.js";
import { config, STAGES, type Stage } from "./config.js";
import { db, getProject, migrate } from "./db.js";
import { centsToSats } from "./price.js";

const app = new Hono();
const QUOTE_MS = 15 * 60_000;
const NEEDS: Record<Stage, Stage | null> = { validate: null, plan: "validate", kit: "plan" };

const newId = () => randomBytes(8).toString("base64url").replace(/[-_]/g, "x").slice(0, 10);
const isStage = (s: unknown): s is Stage => STAGES.includes(s as Stage);

app.onError((err, c) => {
  console.error("[api]", err);
  return c.json({ error: err.message || "Unexpected error" }, 400);
});

app.get("/healthz", async (c) => {
  await db.execute("SELECT 1");
  return c.text("ok");
});

app.get("/api/config", (c) =>
  c.json({
    prices: config.priceCents,
    merchantAddress: config.merchantAddress,
    mockAi: config.mockAi,
    devSkipPayment: config.devSkipPayment,
  }),
);

app.post("/api/projects", async (c) => {
  const { idea } = await c.req.json<{ idea?: string }>();
  const text = (idea ?? "").trim();
  if (text.length < 15) throw new Error("Tell us a bit more about your idea (at least a sentence).");
  if (text.length > 2000) throw new Error("Please keep the idea under 2000 characters.");
  const id = newId();
  await db.execute({ sql: "INSERT INTO projects (id, idea, created_at) VALUES (?, ?, ?)", args: [id, text, Date.now()] });
  return c.json({ id });
});

app.get("/api/projects/:id", async (c) => {
  const p = await getProject(c.req.param("id"));
  return p ? c.json(p) : c.json({ error: "Not found" }, 404);
});

async function loadForStage(id: string, stage: unknown) {
  if (!isStage(stage)) throw new Error("Unknown stage");
  const p = await getProject(id);
  if (!p) throw new Error("Project not found");
  const need = NEEDS[stage];
  if (need && !p.results[need]) throw new Error(`Finish the ${need} stage first`);
  return { p, stage };
}

app.post("/api/projects/:id/quote", async (c) => {
  const { p, stage } = await loadForStage(c.req.param("id"), (await c.req.json()).stage);
  if (!config.merchantAddress) throw new Error("Payments are not configured yet");
  const now = Date.now();
  const q = await db.execute({
    sql: "SELECT sats, expires_at FROM quotes WHERE project_id = ? AND stage = ?",
    args: [p.id, stage],
  });
  let sats: number;
  let expiresAt: number;
  if (q.rows.length && Number(q.rows[0].expires_at) > now + 60_000) {
    sats = Number(q.rows[0].sats);
    expiresAt = Number(q.rows[0].expires_at);
  } else {
    sats = await centsToSats(config.priceCents[stage]);
    expiresAt = now + QUOTE_MS;
    await db.execute({
      sql: "INSERT OR REPLACE INTO quotes (project_id, stage, sats, expires_at) VALUES (?, ?, ?, ?)",
      args: [p.id, stage, sats, expiresAt],
    });
  }
  return c.json({ stage, sats, cents: config.priceCents[stage], address: config.merchantAddress, tag: paymentTag(p.id, stage), expiresAt });
});

app.post("/api/projects/:id/pay", async (c) => {
  const body = await c.req.json<{ stage?: string; txHex?: string; dev?: boolean }>();
  const { p, stage } = await loadForStage(c.req.param("id"), body.stage);
  if (!p.payments[stage]) {
    let txid: string;
    let sats: number;
    if (body.dev && config.devSkipPayment) {
      txid = "dev-" + newId();
      sats = 0;
    } else {
      const q = await db.execute({
        sql: "SELECT sats, expires_at FROM quotes WHERE project_id = ? AND stage = ?",
        args: [p.id, stage],
      });
      if (!q.rows.length) throw new Error("Get a price quote first");
      if (Number(q.rows[0].expires_at) < Date.now() - 5 * 60_000) throw new Error("The price quote expired. Please try again.");
      const quoted = Number(q.rows[0].sats);
      const checked = checkPaymentTx(body.txHex ?? "", Math.floor(quoted * 0.99), paymentTag(p.id, stage));
      await broadcast(body.txHex!, checked.txid);
      txid = checked.txid;
      sats = checked.paidSats;
    }
    try {
      await db.execute({
        sql: "INSERT INTO payments (txid, project_id, stage, sats, created_at) VALUES (?, ?, ?, ?, ?)",
        args: [txid, p.id, stage, sats, Date.now()],
      });
    } catch {
      const again = await getProject(p.id);
      if (!again?.payments[stage] || again.payments[stage].txid !== txid) throw new Error("This payment was already used");
    }
  }
  return c.json(await getProject(p.id));
});

/** Runs the AI for a paid stage once; concurrent callers share the same run. */
const running = new Map<string, Promise<unknown>>();
async function ensureResult(id: string, stage: Stage) {
  const key = `${id}:${stage}`;
  if (!running.has(key)) {
    running.set(
      key,
      (async () => {
        const p = await getProject(id);
        if (!p?.payments[stage]) throw new Error("This stage is not paid");
        if (p.results[stage]) return;
        const { json, model } = await runStage(stage, p.idea, p.results);
        await db.execute({
          sql: "INSERT OR IGNORE INTO results (project_id, stage, json, model, created_at) VALUES (?, ?, ?, ?, ?)",
          args: [id, stage, JSON.stringify(json), model, Date.now()],
        });
      })().finally(() => running.delete(key)),
    );
  }
  await running.get(key);
  return getProject(id);
}

app.post("/api/projects/:id/run", async (c) => {
  const { p, stage } = await loadForStage(c.req.param("id"), (await c.req.json()).stage);
  return c.json(await ensureResult(p.id, stage));
});

app.use("/*", serveStatic({ root: "./dist/web" }));
app.get("/*", serveStatic({ path: "./dist/web/index.html" }));

await migrate();
serve({ fetch: app.fetch, port: config.port }, (i) => console.log(`LaunchDesk API on http://localhost:${i.port}`));
