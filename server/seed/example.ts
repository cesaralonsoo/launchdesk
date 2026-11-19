// F2: the free example pack. One finished, read-only project (id "example", slug "pausa") seeded at boot.
// Content: mocks.exampleProject() run through the real sanitizers, else the mock answers run through sanitize()
// exactly like a real run. Nothing here is a payment: the rows use "dev-" txids, which the receipt shows as
// "Sample run · nothing was charged" and /api/stats never counts.
import { sanitize, type AiDept } from "../ai.js";
import { config } from "../config.js";
import { exec } from "../db.js";
import { stagePriceCents } from "../pricing.js";
import * as mocks from "../mocks.js";
import { STAGE_DEPTS, type DeptResults, type Stage, type WorkDept } from "../types.js";

export const EXAMPLE_ID = "example";
const WANT_SLUG = "pausa";

const DEPTS: WorkDept[] = [...STAGE_DEPTS.validate, ...STAGE_DEPTS.build];
const stageOf = (d: WorkDept): Stage => (STAGE_DEPTS.validate.includes(d) ? "validate" : "build");

function exampleResults(): { idea: string; results: DeptResults } {
  // v6: built with the real sanitizers, so the example carries the same derived extras as a live run.
  const seeded = mocks.exampleProject(Date.now(), sanitize);
  if (seeded.results.leo && seeded.results.nova) return { idea: seeded.idea, results: structuredClone(seeded.results) };
  const idea = config.sampleIdeas[0] ?? mocks.MOCK_IDEA;
  const results: DeptResults = {};
  for (const d of DEPTS) {
    if (d === "pip") continue;
    (results as Record<string, unknown>)[d] = sanitize(d as AiDept, mocks.mockFor(d as AiDept, idea));
  }
  return { idea, results };
}

/** Idempotent: rewrites the example rows on every boot so they follow the current mock content. */
export async function seedExample(): Promise<void> {
  const { idea, results } = exampleResults();
  const now = Date.now();
  const created = now - 3 * 24 * 3600_000;
  const prev = await exec("SELECT slug FROM projects WHERE id = ?", [EXAMPLE_ID]);
  let slug = prev.rows[0]?.slug == null ? null : String(prev.rows[0]!.slug);
  if (!slug) {
    const taken = await exec("SELECT id FROM projects WHERE slug = ?", [WANT_SLUG]);
    slug = taken.rows.length ? `${WANT_SLUG}-sample` : WANT_SLUG;
  }
  // The public page of the example uses the merchant address and is marked as a demo page (dev txid).
  const founder = config.merchantAddress || null;
  if (prev.rows.length) {
    await exec("UPDATE projects SET idea = ?, slug = ?, example = 1, founder_address = ? WHERE id = ?", [idea, slug, founder, EXAMPLE_ID]);
  } else {
    await exec("INSERT INTO projects (id, idea, created_at, founder_address, slug, example) VALUES (?, ?, ?, ?, ?, 1)", [
      EXAMPLE_ID,
      idea,
      created,
      founder,
      slug,
    ]);
  }
  const pip = { slug, url: `${config.publicUrl}/s/${slug}`, live_at: new Date(created + 60_000).toISOString() };
  (results as Record<string, unknown>).pip = pip;

  await exec("DELETE FROM jobs WHERE project_id = ?", [EXAMPLE_ID]);
  await exec("DELETE FROM payments WHERE project_id = ?", [EXAMPLE_ID]);
  let t = created + 2_000;
  for (const d of DEPTS) {
    let json = (results as Record<string, unknown>)[d];
    if (!json) continue;
    // R7: the memo is stored with Sam's result, exactly like a live run (normalize() exposes it as results.memo).
    if (d === "sam" && results.memo) json = { ...(json as object), memo: results.memo };
    const start = t;
    t += 4_000;
    await exec(
      "INSERT INTO jobs (project_id, dept, stage, status, json, model, queued_at, started_at, finished_at) VALUES (?, ?, ?, 'done', ?, 'sample', ?, ?, ?)",
      [EXAMPLE_ID, d, stageOf(d), JSON.stringify(json), created, start, t],
    );
  }
  for (const stage of ["validate", "build"] as Stage[]) {
    await exec("INSERT INTO payments (txid, project_id, stage, sats, cents, created_at) VALUES (?, ?, ?, 0, ?, ?)", [
      `dev-example-${stage}`,
      EXAMPLE_ID,
      stage,
      stagePriceCents(stage),
      created,
    ]);
  }
}
