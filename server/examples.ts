// "See a finished example": real runs from 16 Nov 2026, snapshotted into server/seed/examples/finished/*.json (plus the
// website's photos as files), seeded at boot as read-only projects (projects.example = 1), so every existing route
// (GET /api/projects/:id, /kit, /s/:slug with its photos) serves them with no AI call and no payment.
//
//   ex-coffee-bcn  coffee kiosk, Barcelona: the report paid with $0.10 on Bitcoin Cash mainnet through the escrow
//                  contract, its real sources, and the on-chain proof (funding b127d21e…, release 661ca57b…, report
//                  fingerprint 8447cc72…). Its launch kit comes from the second real run of the same idea that morning.
//   ex-yoga-vlc    gentle yoga for seniors, Valencia: a real AI run (payment skipped locally) with the website designed
//                  for the idea and its CC0 photos.
//
// Routes (mount BEFORE app.ts's /api/* catch-all):
//   GET /api/examples                      the examples, in order, with their honest labels
//   GET /api/examples/:id/proof            the escrow proof of the example's report (same shape as /api/escrow/:id/:stage)
//   GET /api/examples/:id/proof/report     the exact bytes that were fingerprinted on chain (re-hash them in the browser)
// The proof routes work with ESCROW off: they read the snapshot, never the chain and never the escrow table.
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { config } from "./config.js";
import { db, exec } from "./db.js";
import { saveKit } from "./kit.js";
import type { Kit } from "./kit-contract.js";
import { saveCustom } from "./site/custom-db.js";
import { ensurePhotoTables } from "./site/photos-db.js";

type Job = { dept: string; stage: string; status: string; json: unknown; model: string | null; queued_at: number; started_at: number | null; finished_at: number | null };
type Photo = { n: number; role: string; mime: string; file: string; width: number; height: number; hash: string; meta: unknown; created_at: number };
type Escrow = {
  stage: "validate";
  network: "mainnet" | "chipnet";
  address: string;
  timeoutBlocks: number;
  fundingTxid: string;
  fundingVout: number;
  sats: number;
  fundedAt: number;
  releaseTxid: string;
  releasedAt: number;
  releasedSats: number;
  reportHash: string;
  reportBody: string;
};
export type ExampleSnapshot = {
  id: string;
  slug: string;
  idea: string;
  created_at: number;
  label: { title: string; run: string; paid: string; kitNote: string };
  jobs: Job[];
  payments: Array<{ stage: "validate" | "build"; sats: number; cents: number; created_at: number }>;
  v7: { json: Record<string, unknown>; research: unknown; updated_at: number } | null;
  kit: Kit | null;
  custom: { html: string; version: number; created_at: number } | null;
  photos: Photo[];
  escrow: Escrow | null;
};
/** What the home screen and the example ribbon show (GET /api/examples). */
export type ExampleCard = {
  id: string;
  slug: string;
  title: string;
  run: string;
  paid: string;
  kitNote: string;
  /** The brand the example's launch kit chose ("Sortida"), so every surface names it the same from its first paint. */
  brand: string | null;
  createdAt: number;
  verdict: { score: number; verdict: string } | null;
  sources: number;
  proof: boolean;
};

// The yoga snapshot (yoga-seniors-valencia.json) is kept on disk but not listed: its idea is in English while its kit
// was written in Spanish, so it is off the judge path until it is regenerated in English.
const ORDER = ["coffee-kiosk-barcelona.json"];

/** The snapshot folder: next to this file in dev (tsx), or the source tree from the compiled server (tsc copies no JSON). */
function dir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const d of [join(here, "seed", "examples", "finished"), join(process.cwd(), "server", "seed", "examples", "finished")])
    if (existsSync(join(d, ORDER[0]!))) return d;
  return null;
}

let cache: ExampleSnapshot[] | null = null;
export function loadExamples(): ExampleSnapshot[] {
  if (cache) return cache;
  const d = dir();
  const out: ExampleSnapshot[] = [];
  if (d)
    for (const f of ORDER) {
      try {
        out.push(JSON.parse(readFileSync(join(d, f), "utf8")) as ExampleSnapshot);
      } catch (e) {
        console.warn(`[examples] ${f}: ${(e as Error).message}`);
      }
    }
  return (cache = out);
}
const byId = (id: string) => loadExamples().find((x) => x.id === id) ?? null;

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** Idempotent: rewrites the example rows on every boot from the snapshots. A failure never stops the server. */
export async function seedFinishedExamples(): Promise<void> {
  const d = dir();
  for (const x of loadExamples()) {
    try {
      await seedOne(x, d);
    } catch (e) {
      console.warn(`[examples] ${x.id}: ${(e as Error).message}`);
    }
  }
}

/** Display-only: the writer's "no source id" notes (from before the cleaner in v7.ts plainText) become "estimate" in every
 *  string the app shows, so "(barcelonatourism.org, 2026; no source id)" reads "(barcelonatourism.org, 2026; estimate)"
 *  and never passes for a listed source. The fingerprinted bytes (escrow.reportBody) are never touched, so "Check it"
 *  still matches. */
const dropNoSourceNotes = (s: string) =>
  s.replace(/\s*[;,]\s*no source (?:id|cited)\b/gi, "; estimate").replace(/\s*\(\s*no source (?:id|cited)\s*\)/gi, " (estimate)");
export function cleanForDisplay<T>(v: T): T {
  if (typeof v === "string") return dropNoSourceNotes(v) as T;
  if (Array.isArray(v)) return v.map(cleanForDisplay) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cleanForDisplay(x)])) as T;
  return v;
}

async function seedOne(x: ExampleSnapshot, d: string | null) {
  // never take a slug a real founder already owns
  const taken = await exec("SELECT id FROM projects WHERE slug = ? AND id <> ?", [x.slug, x.id]);
  const slug = taken.rows.length ? `${x.slug}-example` : x.slug;
  const founder = config.merchantAddress || null;
  const prev = await exec("SELECT id FROM projects WHERE id = ?", [x.id]);
  if (prev.rows.length) await exec("UPDATE projects SET idea = ?, created_at = ?, slug = ?, example = 1, founder_address = ? WHERE id = ?", [x.idea, x.created_at, slug, founder, x.id]);
  else await exec("INSERT INTO projects (id, idea, created_at, founder_address, slug, example) VALUES (?, ?, ?, ?, ?, 1)", [x.id, x.idea, x.created_at, founder, slug]);

  await exec("DELETE FROM jobs WHERE project_id = ?", [x.id]);
  await exec("DELETE FROM payments WHERE project_id = ?", [x.id]);
  for (const j of x.jobs) {
    let json = cleanForDisplay(j.json);
    // the website link follows this server (PUBLIC_URL) and the slug actually given
    if (j.dept === "pip" && json && typeof json === "object") json = { ...(json as object), slug, url: `${config.publicUrl}/s/${slug}` };
    await exec(
      "INSERT INTO jobs (project_id, dept, stage, status, json, model, queued_at, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [x.id, j.dept, j.stage, j.status, json == null ? null : JSON.stringify(json), j.model, j.queued_at, j.started_at, j.finished_at],
    );
  }
  // "dev-" txids: never counted by /api/stats and never clash with the real payment row on the server that ran it.
  // The real mainnet transactions are shown by the proof route, from the snapshot.
  for (const p of x.payments)
    await exec("INSERT INTO payments (txid, project_id, stage, sats, cents, created_at) VALUES (?, ?, ?, ?, ?, ?)", [`dev-${x.id}-${p.stage}`, x.id, p.stage, p.sats, p.cents, p.created_at]);

  if (x.v7)
    await exec(
      "INSERT INTO results_v7 (project_id, json, research, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET json = excluded.json, research = excluded.research, updated_at = excluded.updated_at",
      [x.id, JSON.stringify(cleanForDisplay(x.v7.json)), x.v7.research == null ? null : JSON.stringify(x.v7.research), x.v7.updated_at],
    );
  if (x.kit) await saveKit(x.id, x.kit);
  if (x.custom) await saveCustom(x.id, x.custom.html, x.custom.version);
  if (x.photos.length && d) {
    await ensurePhotoTables();
    const rows = x.photos.flatMap((p) => {
      try {
        const bytes = new Uint8Array(readFileSync(join(d, "photos", p.file)));
        return [{ sql: "INSERT INTO site_photos (project_id, n, role, mime, bytes, width, height, hash, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", args: [x.id, p.n, p.role, p.mime, bytes, p.width, p.height, p.hash, JSON.stringify(p.meta), p.created_at] }];
      } catch {
        return [];
      }
    });
    await db.batch([{ sql: "DELETE FROM site_photos WHERE project_id = ?", args: [x.id] }, ...rows], "write");
  }
}

export const isExampleId = (id: string) => loadExamples().some((x) => x.id === id);

function cardOf(x: ExampleSnapshot): ExampleCard {
  const report = (x.v7?.json as { report?: { score?: number; verdict?: string } } | undefined)?.report;
  // distinct web pages the findings cite (each one opens from the report)
  const work = (x.v7?.json as { work?: Array<{ findings?: Array<{ source?: { url?: string } | null }> }> } | undefined)?.work ?? [];
  const sources = new Set(work.flatMap((w) => (w.findings ?? []).map((f) => f.source?.url).filter((u): u is string => !!u))).size;
  return {
    id: x.id,
    slug: x.slug,
    title: x.label.title,
    run: x.label.run,
    paid: x.label.paid,
    kitNote: x.label.kitNote,
    brand: x.kit?.brand?.name?.trim() || null,
    createdAt: x.created_at,
    verdict: report && typeof report.score === "number" && typeof report.verdict === "string" ? { score: report.score, verdict: report.verdict } : null,
    sources,
    proof: !!x.escrow,
  };
}

const txUrl = (net: string, txid: string) => (net === "chipnet" ? `https://chipnet.imaginary.cash/tx/${txid}` : `https://blockchair.com/bitcoin-cash/transaction/${txid}`);

export function exampleRoutes() {
  const r = new Hono();
  r.get("/api/examples", (c) => c.json({ examples: loadExamples().map(cardOf) }, 200, { "cache-control": "public, max-age=300" }));
  r.get("/api/examples/:id/proof", (c) => {
    const x = byId(c.req.param("id"));
    const e = x?.escrow;
    if (!x || !e) return c.json({ error: "This example has no payment proof." }, 404);
    return c.json({
      state: "released" as const,
      cents: x.payments.find((p) => p.stage === e.stage)?.cents ?? null,
      address: e.address,
      sats: e.sats,
      fundingTxid: e.fundingTxid,
      releaseTxid: e.releaseTxid,
      refundTxid: null,
      reportHash: e.reportHash,
      timeoutBlocks: e.timeoutBlocks,
      network: e.network,
      fundingUrl: txUrl(e.network, e.fundingTxid),
      releaseUrl: txUrl(e.network, e.releaseTxid),
      refundUrl: null,
      fundedAt: e.fundedAt,
      releasedAt: e.releasedAt,
      releasedSats: e.releasedSats,
      // a self-check: the stored bytes still hash to the on-chain fingerprint
      bodyMatches: sha256(e.reportBody) === e.reportHash,
    });
  });
  r.get("/api/examples/:id/proof/report", (c) => {
    const e = byId(c.req.param("id"))?.escrow;
    if (!e) return c.json({ error: "This example has no payment proof." }, 404);
    return c.body(e.reportBody, 200, { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" });
  });
  return r;
}
