// Writes the prototype's v7 sample worlds (web/proto/data/v7/*.json) from server/v7-samples.ts through the same
// maths the server runs (buildReport, applySteer). Run: MOCK_AI=1 DATABASE_URL=:memory: npx tsx server/seed/gen-v7.ts
// Owner: WS-INTEL. Never edit the JSON by hand: change the samples and regenerate (test/v7.test.ts checks they match).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitize } from "../ai.js";
import { sampleProject } from "../mocks.js";
import type { Project } from "../types.js";
import { V7_SAMPLES, sampleResults, samplesSteer, type V7SampleKey } from "../v7-samples.js";
import type { ResultsV7, SteerResult, WorldLevel } from "../v7.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "web/proto/data/v7");
/** Same clock as the v6 data (DATA.md). */
export const NOW = Date.UTC(2026, 10, 14, 9, 30);
const DAY = 86_400_000;

type Sign = { kind: "draft" | "brand"; name: string; tagline?: string; color: string; glyph?: string };
export interface SampleWorld {
  id: string;
  idea: string;
  title: string;
  createdAt: string;
  v7: ResultsV7;
  level: WorldLevel;
  sign: Sign;
  /** v6 Project (phase-2 cards). null = not built. The coffee sample uses data/pausa.json (see data/v7.ts). */
  legacy: Project | null;
  /** Prepared CEO notes for mockSteer (demo): `match` is a RegExp source, `result` the finished steer. */
  prepared: Array<{ key: string; match: string; note: string; result: SteerResult }>;
}

function brandSign(p: Project): Sign | null {
  const nova = p.results.nova;
  const dex = p.results.dex as (Project["results"]["dex"] & { logos: Array<{ glyph?: string }> }) | undefined;
  const b = nova?.names[nova.chosen];
  if (!b) return null;
  return { kind: "brand", name: b.name, tagline: b.tagline, color: b.palette[0]?.hex ?? "#1D1D1F", glyph: dex?.logos[0]?.glyph ?? "none" };
}

export function buildWorld(key: V7SampleKey): SampleWorld {
  const s = V7_SAMPLES[key];
  const v7 = sampleResults(s);
  const plan: Record<V7SampleKey, { level: WorldLevel; ago: number; built: boolean }> = {
    coffee: { level: 0, ago: 0, built: false }, // the demo run: starts in the room (legacy = data/pausa.json)
    saas: { level: 3, ago: 12, built: true }, // scales: validated, built, grown to the district
    dog: { level: 2, ago: 5, built: true }, // city-sized: built and live, capped at the building
    bakery: { level: 0, ago: 2, built: false }, // no-go on the evidence: stays in the room (cap 0)
  };
  const p = plan[key];
  const cap = v7.report!.scalability.cap;
  if (p.level > cap) throw new Error(`${key}: level ${p.level} above its cap ${cap}`);
  const legacy = p.built ? sampleProject(key as Exclude<V7SampleKey, "bakery">, { id: `p-${s.id}`, slug: s.id, now: NOW - p.ago * DAY, upTo: "build" }, sanitize) : null;
  const sign = (legacy && brandSign(legacy)) ?? { kind: "draft" as const, name: s.title, color: "#1D1D1F" };
  const prepared = s.steers.map((st) => ({ key: st.key, match: st.match.source, note: st.note, result: samplesSteer(s, v7, st, st.note, new Date(NOW - p.ago * DAY + 60_000).toISOString()).steer }));
  return { id: s.id, idea: s.idea, title: s.title, createdAt: new Date(NOW - p.ago * DAY).toISOString(), v7, level: p.level, sign, legacy, prepared };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(OUT, { recursive: true });
  for (const key of Object.keys(V7_SAMPLES) as V7SampleKey[]) {
    const w = buildWorld(key);
    writeFileSync(join(OUT, `${w.id}.json`), JSON.stringify(w, null, 1) + "\n");
    const r = w.v7.report!;
    console.log(`${w.id.padEnd(6)} score ${r.score} ${r.verdict.padEnd(5)} · scale ${r.scalability.score} cap ${r.scalability.cap} · evidence ${r.evidence.total}/${r.evidence.sourced} sourced · level ${w.level} · ${r.math}`);
    for (const pr of w.prepared) console.log(`   steer "${pr.key}": ${pr.result.changes.map((c) => `${c.what}${c.key ? ":" + c.key : ""} ${c.before ?? "—"}→${c.after ?? "—"}`.slice(0, 60)).join(" | ")}`);
  }
}
