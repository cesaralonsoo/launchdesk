// Escrow HTTP routes (mount only when ESCROW=1): app.route("/", escrowRoutes)
//   GET  /api/escrow/:id/:stage         status for the "Payment held safely / delivered / refunded" panel + verify view
//   GET  /api/escrow/:id/:stage/report  the exact report bytes whose sha256 is on chain (text/plain, for re-hashing)
//   POST /api/escrow/:id/:stage/refund  "Get my refund now": broadcasts the refund once the timeout has passed
// Quote and pay stay on the existing /api/projects/:id/quote and /pay routes, wrapped by install.ts.
import { Hono } from "hono";
import { escrowRefund, escrowReportBody, escrowStatus } from "./service.js";

export const escrowRoutes = new Hono();
const okStage = (s: string) => s === "validate" || s === "build";

escrowRoutes.get("/api/escrow/:id/:stage", async (c) => {
  const { id, stage } = c.req.param();
  if (!okStage(stage)) return c.json({ error: "Unknown step" }, 404);
  const s = await escrowStatus(id, stage);
  return s ? c.json(s) : c.json({ error: "No payment held for this order" }, 404);
});

escrowRoutes.get("/api/escrow/:id/:stage/report", async (c) => {
  const { id, stage } = c.req.param();
  if (!okStage(stage)) return c.json({ error: "Unknown step" }, 404);
  const body = await escrowReportBody(id, stage);
  if (body == null) return c.json({ error: "Not delivered yet" }, 404);
  return c.body(body, 200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
});

escrowRoutes.post("/api/escrow/:id/:stage/refund", async (c) => {
  const { id, stage } = c.req.param();
  if (!okStage(stage)) return c.json({ error: "Unknown step" }, 404);
  const r = await escrowRefund(id, stage);
  if (r.error) return c.json({ error: r.error }, 409);
  return c.json(r);
});
