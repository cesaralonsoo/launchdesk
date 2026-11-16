// WP3 · Saves one REAL plan as a fixture (costs ≈ $0.10). Never loops, never retries.
//   node_modules/.bin/tsx server/marketing/gen.ts bakery-es      (or bikes-en)
// Appends "WP3 <model> $x" lines to .notes/next/spend.log for every real call. The research is saved first
// (fixtures/inputs/<key>.research.json), so a failed writer call never pays for the searches twice.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "../config.js";
import type { CostLine } from "../cost.js";
import type { KitInput } from "../kit-contract.js";
import { planMarketing, WRITER_MODEL, type PlanFixture } from "./plan.js";
import { RESEARCH_MODEL, type MarketingResearch } from "./research.js";
import { cleanPlan } from "./schema.js";

const key = process.argv[2];
if (!key || !/^[a-z0-9-]+$/.test(key)) throw new Error("usage: gen.ts <fixture-key>");
if (process.argv[3] === "--reclean") {
  // Free: re-applies the current cleanPlan rules to a saved fixture (no AI call).
  const url = new URL(`./fixtures/${key}.json`, import.meta.url);
  const f = JSON.parse(readFileSync(url, "utf8")) as PlanFixture;
  const { plan, warnings } = cleanPlan(f.result.plan, f.result.sources, { lang: f.result.plan.lang, currency: f.result.plan.currency });
  f.result = { ...f.result, plan, warnings };
  writeFileSync(url, JSON.stringify(f, null, 1) + "\n");
  console.log(`[gen] ${key} recleaned, ${warnings.length} warnings`, warnings);
  process.exit(0);
}
if (config.mockAi) throw new Error("AI is in mock mode (no key or MOCK_AI=1): nothing to generate.");
const input = JSON.parse(readFileSync(new URL(`./fixtures/inputs/${key}.json`, import.meta.url), "utf8")) as KitInput;
const spendLog = new URL("../../.notes/next/spend.log", import.meta.url);
const lines: CostLine[] = [];
const onCost = (l: CostLine) => {
  lines.push(l);
  appendFileSync(spendLog, `WP3 ${l.model} $${l.usd.toFixed(4)} (${l.label} ${key}${l.searches ? `, ${l.searches} searches` : ""})\n`);
};
const cacheUrl = new URL(`./fixtures/inputs/${key}.research.json`, import.meta.url);
const cached = existsSync(cacheUrl) ? (JSON.parse(readFileSync(cacheUrl, "utf8")) as MarketingResearch) : undefined;
let queries: string[] = cached?.queries ?? [];
const onResearch = (r: MarketingResearch) => {
  queries = r.queries;
  if (!cached && r.ok) writeFileSync(cacheUrl, JSON.stringify(r, null, 1) + "\n");
};
const t0 = Date.now();
const result = await planMarketing(input, { onCost, mock: false, research: cached, onResearch });
const usd = Math.round(lines.reduce((t, l) => t + l.usd, 0) * 1e4) / 1e4;
const fixture: PlanFixture = { key, input, result, meta: { model: WRITER_MODEL, research: RESEARCH_MODEL, usd, date: new Date().toISOString().slice(0, 10), queries } };
writeFileSync(new URL(`./fixtures/${key}.json`, import.meta.url), JSON.stringify(fixture, null, 1) + "\n");
console.log(`[gen] ${key}: $${usd} in ${Math.round((Date.now() - t0) / 1000)}s, ${result.sources.length} sources, ${result.warnings.length} warnings`);
for (const w of result.warnings) console.log("  warn:", w);
