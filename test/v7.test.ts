// v7 invariants (WS-INTEL): the score is arithmetic on findings, the level cap follows scalability, every source is a
// real page object from the registry, steer diffs agree with the reports, and the prototype JSON is up to date.
// Run: npx tsx test/v7.test.ts (also imported by schema.test.ts, so `npm test` runs it).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
process.env.MOCK_AI = "1";
process.env.DATABASE_URL ??= ":memory:";

const v7 = await import("../server/v7.js");
const { V7_SAMPLES, SOURCES, sampleResults, samplesSteer, v7SampleFor } = await import("../server/v7-samples.js");
const ai7 = await import("../server/ai-v7.js");
const { buildWorld } = await import("../server/seed/gen-v7.js");
const contracts = await import("../web/proto/contracts.ts");
type Finding = import("../server/v7.js").Finding;
type IdeaReport = import("../server/v7.js").IdeaReport;
type ResultsV7 = import("../server/v7.js").ResultsV7;

// ── the server mirror of the contract is the contract
assert.deepEqual(v7.ROLE_LIBRARY, contracts.ROLE_LIBRARY, "ROLE_LIBRARY matches contracts.ts");
assert.deepEqual([...v7.ANALYST_ROLES], [...contracts.ANALYST_ROLES]);
assert.equal(v7.STEER_LIMIT, contracts.STEER_LIMIT);
for (const s of [0, 3.9, 4, 6.9, 7, 10]) for (const vd of ["go", "pivot", "no-go"] as const) assert.equal(v7.levelCapFor(s, vd), contracts.levelCapFor(s, vd));
for (const x of [0, 0.29, 0.3, 0.59, 0.6, 1]) assert.equal(v7.confidenceFor(x), contracts.confidenceFor(x));

// ── independent re-implementation of the score (the header of server/v7.ts)
const REGISTRY = new Map(Object.values(SOURCES).map((s) => [s.url, s]));
const sourced = (f: Finding) => !!f.source;
const factorOf = (fs: Finding[]) => {
  let s = 5;
  for (const f of fs) s += (f.impact ?? 0) * (sourced(f) ? 1 : 0.5);
  s = Math.min(10, Math.max(0, s));
  if (!fs.some(sourced)) s = Math.min(7.5, s);
  return Math.round(s * 10 + 1e-7) / 10;
};

function checkSource(f: Finding, where: string) {
  if (f.kind === "fact" || f.kind === "number") assert.ok(f.source, `${where}: a ${f.kind} needs a source`);
  if (f.competitor?.named) assert.ok(f.source, `${where}: a named competitor needs a source`);
  if (!f.source) {
    assert.ok(f.basis && f.basis.length > 3, `${where}: an unsourced finding says its basis`);
    return;
  }
  const s = f.source;
  assert.match(s.url, /^https:\/\//, `${where}: url`);
  assert.ok(s.title.trim().length > 5, `${where}: title`);
  assert.equal(s.domain, new URL(s.url).hostname.replace(/^www\./, ""), `${where}: domain`);
  assert.match(s.accessed, /^\d{4}-\d{2}-\d{2}$/, `${where}: accessed`);
  assert.deepEqual(REGISTRY.get(s.url), s, `${where}: source is a page from the fetched registry, never written ad hoc`);
}

function checkResults(r: ResultsV7, label: string) {
  const rep = r.report!;
  assert.ok(rep, `${label}: report`);
  assert.ok(r.roster.length >= 3 && r.roster.length <= 5, `${label}: 3–5 analysts`);
  assert.ok(r.roster.some((a) => a.role === "viability") && r.roster.some((a) => a.role === "competition"), `${label}: viability + competition always`);
  const wsum = r.roster.reduce((t, a) => t + a.weight, 0);
  assert.ok(Math.abs(wsum - 1) < 0.01, `${label}: weights normalised (${wsum})`);
  const all = r.work.flatMap((w) => w.findings);
  assert.equal(new Set(all.map((f) => f.id)).size, all.length, `${label}: finding ids unique`);
  all.forEach((f) => checkSource(f, `${label} ${f.id}`));
  for (const w of r.work) {
    assert.equal(w.score, factorOf(w.findings), `${label}: ${w.analyst} work score = factor of its findings`);
    w.findings.forEach((f, i) => i && assert.ok(f.t > w.findings[i - 1]!.t, `${label}: ${f.id} reveal order`));
    assert.ok(w.findings.every((f) => f.text.split(/\s+/).length <= 18), `${label}: ${w.analyst} finding text ≤ 18 words`);
  }
  // score = weighted findings
  let total = 0;
  for (const f of rep.factors) {
    const fs = r.work.find((w) => w.analyst === f.analyst)!.findings;
    assert.equal(f.score, factorOf(fs), `${label}: factor ${f.analyst}`);
    assert.deepEqual(f.findings, fs.map((x) => x.id));
    assert.equal(f.sourced, fs.filter(sourced).length);
    total += f.weight * f.score;
  }
  const wf = rep.factors.reduce((t, f) => t + f.weight, 0);
  assert.equal(rep.score, Math.round((total / wf) * 10 + 1e-7) / 10, `${label}: score = Σ weight × factor`);
  assert.ok(rep.math.endsWith(`= ${rep.score.toFixed(1)}`), `${label}: math shows the score`);
  // the maths string uses exactly the weights and factors shown, and adds up to the score
  assert.equal(Math.round(wf * 100), 100, `${label}: weights add up to 1.00`);
  assert.equal(rep.math, rep.factors.map((f) => `${f.weight.toFixed(2)}×${f.score.toFixed(1)}`).join(" + ") + ` = ${rep.score.toFixed(1)}`, `${label}: math = factors`);
  const shown = rep.factors.reduce((t, f) => t + Number(f.weight.toFixed(2)) * Number(f.score.toFixed(1)), 0);
  assert.equal(rep.score, Math.round(shown * 10 + 1e-7) / 10, `${label}: the shown products add up to the score`);
  assert.equal(rep.verdict, rep.score < 4.5 ? "no-go" : rep.score < 6.5 || rep.factors.some((f) => f.score <= 3) ? "pivot" : "go", `${label}: verdict band`);
  // evidence + confidence
  assert.equal(rep.evidence.total, all.length);
  assert.equal(rep.evidence.sourced, all.filter(sourced).length);
  assert.deepEqual(new Set(rep.evidence.sources.map((s) => s.url)), new Set(all.filter(sourced).map((f) => f.source!.url)));
  assert.equal(rep.confidence, v7.confidenceFor({ factors: rep.factors, findings: all }), `${label}: confidence weighs decision-relevant sourced findings`);
  // scalability → level cap
  const sc = rep.scalability;
  const ws = { Reach: 0.25, Repeatable: 0.2, "Margins at scale": 0.2, "Founder-free": 0.15, "Digital leverage": 0.2 } as Record<string, number>;
  assert.deepEqual(sc.parts.map((p) => p.label), ["Reach", "Repeatable", "Margins at scale", "Founder-free", "Digital leverage"]);
  assert.equal(sc.score, Math.round(sc.parts.reduce((t, p) => t + ws[p.label]! * p.score, 0) * 10 + 1e-7) / 10, `${label}: scalability = weighted parts`);
  assert.equal(sc.cap, contracts.levelCapFor(sc.score, rep.verdict), `${label}: cap follows scalability`);
  assert.ok(sc.wouldScale.length >= 1 && sc.wouldScale.length <= 3, `${label}: 1–3 ways to scale`);
  // report points tied to findings
  const ids = new Set(all.map((f) => f.id));
  for (const k of ["strengths", "weaknesses"] as const) {
    assert.equal(rep[k].length, 3, `${label}: 3 ${k}`);
    rep[k].forEach((x) => assert.ok(ids.has(x.finding), `${label}: ${k} → ${x.finding} exists`));
  }
  assert.equal(rep.nextSteps.length, 3);
  return rep;
}

function checkSteer(before: ResultsV7, after: ResultsV7, st: import("../server/v7.js").SteerResult, label: string) {
  const b = before.report!;
  const a = st.report!;
  assert.ok(a, `${label}: steer report`);
  assert.deepEqual(after.report, a, `${label}: stored report = steer report`);
  checkResults(after, `${label} (after)`);
  const old = new Set(before.work.flatMap((w) => w.findings.map((f) => f.id)));
  for (const f of st.findings) {
    assert.ok(!old.has(f.id), `${label}: new finding id ${f.id} is new`);
    if (f.replaces) {
      assert.ok(old.has(f.replaces), `${label}: ${f.id} replaces an existing finding`);
      assert.ok(!after.work.some((w) => w.findings.some((x) => x.id === f.replaces)), `${label}: replaced finding removed`);
    }
    checkSource(f, `${label} ${f.id}`);
  }
  for (const c of st.changes) {
    if (c.what === "score") assert.deepEqual([c.before, c.after], [b.score, a.score], `${label}: score diff`);
    if (c.what === "verdict") assert.deepEqual([c.before, c.after], [b.verdict, a.verdict]);
    if (c.what === "scalability") assert.deepEqual([c.before, c.after], [b.scalability.score, a.scalability.score]);
    if (c.what === "factor") {
      assert.equal(c.before, b.factors.find((f) => f.analyst === c.key)!.score, `${label}: factor ${c.key} before`);
      assert.equal(c.after, a.factors.find((f) => f.analyst === c.key)!.score, `${label}: factor ${c.key} after`);
    }
    if (c.what === "finding") assert.ok(st.findings.some((f) => f.id === c.key));
    assert.ok(c.why.split(/\s+/).length <= 12, `${label}: why ≤ 12 words`);
  }
  // no silent changes: every moved number has a chip
  if (a.score !== b.score) assert.ok(st.changes.some((c) => c.what === "score"));
  if (a.scalability.score !== b.scalability.score) assert.ok(st.changes.some((c) => c.what === "scalability"));
  for (const f of a.factors) {
    const bf = b.factors.find((x) => x.analyst === f.analyst);
    if (bf && bf.score !== f.score) assert.ok(st.changes.some((c) => c.what === "factor" && c.key === f.analyst), `${label}: chip for ${f.analyst}`);
  }
  assert.ok(st.ack.split(/\s+/).length <= 14);
}

// ── every sample, its steers, and the prototype JSON
const caps: Record<string, number> = {};
for (const s of Object.values(V7_SAMPLES)) {
  const r = sampleResults(s);
  const rep = checkResults(r, s.key);
  caps[s.key] = rep.scalability.cap;
  assert.equal(contracts.scoreDisplay(rep), rep.evidence.sourced >= 3 && rep.evidence.total >= 6 ? "hero" : "provisional");
  for (const p of s.steers) {
    const { results, steer } = samplesSteer(s, r, p, p.note, "2026-11-14T10:00:00.000Z");
    checkSteer(r, results, steer, `${s.key}/${p.key}`);
    assert.ok(steer.changes.length > 0, `${s.key}/${p.key}: a prepared steer changes something`);
    assert.ok(p.match.test(` ${p.note.toLowerCase()} `), `${s.key}/${p.key}: its own note matches`);
  }
  assert.equal(v7SampleFor(s.idea)?.key, s.key, `${s.key}: the idea picks its own sample`);
  // generated JSON is current
  const w = buildWorld(s.key);
  const json = JSON.parse(readFileSync(new URL(`../web/proto/data/v7/${s.id}.json`, import.meta.url), "utf8"));
  assert.deepEqual(json, JSON.parse(JSON.stringify(w)), `${s.id}.json is stale: run server/seed/gen-v7.ts`);
  assert.ok(json.level <= json.v7.report.scalability.cap, `${s.id}: the world never grows past its cap`);
}
// the portfolio covers every cap the brief asks for: a district, a building, a floor
assert.equal(caps.saas, 3, "the SaaS sample scales to a district");
assert.equal(caps.coffee, 2, "Pausa caps at the building (the district is a ghost)");
assert.equal(caps.dog, 2);
assert.equal(caps.bakery, 0, "the bakery is a no-go on its evidence: it stays in the room");
// honest calibration: not every sample is the same verdict
assert.ok(new Set(Object.values(V7_SAMPLES).map((x) => sampleResults(x).report!.verdict)).size >= 2, "samples cover more than one verdict");
assert.equal(contracts.scoreDisplay(sampleResults(V7_SAMPLES.coffee).report!), "hero", "the demo has enough sourced evidence for the hero score");

// ── honesty rule on raw findings
const demoted = v7.enforceSourceRule({ id: "x-0", analyst: "market", kind: "number", text: "40% of people", t: 0, source: { url: "not a url", title: "t", domain: "", accessed: "2026-01-01" }, competitor: { name: "Acme", named: true, note: "n" } });
assert.equal(demoted.kind, "estimate");
assert.equal(demoted.source, null);
assert.equal(demoted.competitor!.named, false);
assert.ok(demoted.basis);
assert.equal(v7.factorScore([{ id: "a", analyst: "market", kind: "strength", text: "t", t: 0, impact: 2 }, { id: "b", analyst: "market", kind: "strength", text: "t", t: 0, impact: 2 }, { id: "c", analyst: "market", kind: "strength", text: "t", t: 0, impact: 2 }, { id: "d", analyst: "market", kind: "strength", text: "t", t: 0, impact: 2 }, { id: "e", analyst: "market", kind: "strength", text: "t", t: 0, impact: 2 }, { id: "f", analyst: "market", kind: "strength", text: "t", t: 0, impact: 2 }]), 7.5, "no source: capped at 7.5");

// ── model answers: sources only from the research citation list, by number
const research = { text: "notes", seenHosts: ["example.org"], sources: [{ id: 1, url: "https://example.org/a", title: "Page A", domain: "example.org", accessed: "2026-11-15" }] };
const fs = ai7.sanitizeFindings("market", {
  headline: "h",
  findings: [
    { kind: "number", text: "Sourced figure", display: "12", value: 12, unit: "x", source_id: 1, basis: null, competitor: null, impact: 1, replaces: null },
    { kind: "fact", text: "Invented source number", display: null, value: null, unit: null, source_id: 7, basis: null, competitor: null, impact: 1, replaces: "market-9" },
    { kind: "competitor", text: "A rival", display: null, value: null, unit: null, source_id: null, basis: "guess", competitor: { name: "BigCo", price: null, note: "n" }, impact: -1, replaces: null },
  ],
}, research);
assert.deepEqual(fs[0]!.source, { url: "https://example.org/a", title: "Page A", domain: "example.org", accessed: "2026-11-15" });
assert.equal(fs[1]!.kind, "estimate", "unknown source id → estimate");
assert.equal(fs[1]!.source, null);
assert.equal(fs[1]!.replaces, undefined, "replaces only points at known ids");
assert.equal(fs[2]!.competitor!.named, false, "unsourced competitor is a category");
assert.deepEqual(fs.map((f) => f.id), ["market-0", "market-1", "market-2"]);

// ── roster picker: 3–5, always viability + competition, idea-aware
for (const idea of ["A bakery in Gràcia", "A B2B SaaS for dentists' invoicing", "Dog walking in Madrid", "Online Spanish lessons for kids", "Kiosk at a metro exit selling coffee", "x"]) {
  const r = ai7.sanitizeRoster(v7.pickRosterByKeywords(idea).map((role) => ({ role, mission: "m", why: "w" })), idea);
  assert.ok(r.length >= 3 && r.length <= 5, idea);
  assert.ok(r.some((a) => a.role === "viability") && r.some((a) => a.role === "competition"), idea);
  assert.equal(r.at(-1)!.role, "viability", "viability reads the others last");
}
assert.ok(v7.pickRosterByKeywords("A coffee kiosk at a metro exit").includes("location"));
assert.ok(v7.pickRosterByKeywords("An invoicing app for freelancers").includes("tech"));
const bad = ai7.sanitizeRoster([{ role: "tech", mission: "m", why: "w" }, { role: "tech", mission: "m", why: "w" }, { role: "nope" as never, mission: "m", why: "w" }], "An app");
assert.deepEqual(bad.map((a) => a.role).sort(), ["competition", "tech", "viability"].sort());

// ── steer routing (demo): prepared notes and keyword fallback only rerun hired analysts
const pausaRoster = sampleResults(V7_SAMPLES.coffee).roster;
assert.deepEqual((await ai7.routeSteer(V7_SAMPLES.coffee.idea, "Focus on office workers, not tourists", pausaRoster)).rerun, ["location", "viability"]);
const kw = ai7.routeByKeywords("Can we charge more?", pausaRoster);
assert.ok(kw.rerun.every((r) => pausaRoster.some((a) => a.role === r)) && kw.rerun.length >= 1);

// ── proto mockSteer: prepared variant, honest no-op otherwise
const data = await import("../web/proto/data/v7.ts");
const hit = data.mockSteer(data.SAMPLE_V7, "Focus on office workers, not tourists");
assert.ok(hit.changes.length > 0 && hit.report && hit.report.score !== data.SAMPLE_V7.v7.report!.score);
const miss = data.mockSteer(data.SAMPLE_V7, "Make the cups purple");
assert.deepEqual(miss.changes, []);
assert.deepEqual(miss.report, data.SAMPLE_V7.v7.report);
const applied = data.applySteerToProject(data.SAMPLE_V7, hit);
assert.deepEqual(applied.v7.report, hit.report);
checkResults(applied.v7 as unknown as ResultsV7, "proto applySteerToProject");
assert.equal(data.findingsInOrder(data.SAMPLE_V7).length, data.SAMPLE_V7.v7.report!.evidence.total);
assert.equal(data.PROJECTS_V7.length, 4);
for (const p of data.PROJECTS_V7) assert.ok(contracts.worldProjectOf(p).cap >= p.level, `${p.id}: level within cap`);
assert.equal(data.brandSignOf(data.SAMPLE_V7)?.name, "Pausa");

void (null as unknown as IdeaReport);
console.log("v7 invariants: all passed");
