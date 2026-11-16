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
assert.deepEqual(v7.BLOCK_LIBRARY, contracts.BLOCK_LIBRARY, "BLOCK_LIBRARY matches contracts.ts");
assert.deepEqual([...v7.BLOCK_IDS], [...contracts.BLOCK_IDS]);
for (const x of [0, 4.4, 4.5, 6.4, 6.5, 10]) assert.equal(v7.blockVerdictFor(x), contracts.blockVerdictFor(x));
{
  // 4 blocks: fixed roster of 4 owners (one room each), weights add up to 1.00, drafts become sourced findings by number
  const roster = v7.blockRoster();
  assert.deepEqual(roster.map((a) => a.role), ["demand", "competition", "pricing", "viability"]);
  assert.equal(Math.round(roster.reduce((t, a) => t + a.weight, 0) * 100), 100);
  const cite = { url: "https://example.org/a", title: "Page A", domain: "example.org", accessed: "2026-11-15" };
  const plan = v7.fallbackBlockPlans("Bread subscriptions in Ruzafa")[0]!;
  const { block, findings } = v7.buildBlock(plan, { takeaway: "t", meaning: "m", actions: ["a"], evidence: [
    { text: "Sourced fact", kind: "fact", impact: 1, source: 1 }, { text: "No source", kind: "number", impact: 1, source: 9 },
  ], keyNumbers: [{ label: "Price", value: "€25", source: 1 }, { label: "Margin", value: "40%" }] }, [cite]);
  assert.equal(findings[0]!.source?.url, cite.url);
  assert.equal(findings[1]!.kind, "estimate", "an out-of-range source number makes an estimate");
  assert.equal(block.score, v7.factorScore(findings));
  assert.equal(block.verdict, v7.blockVerdictFor(block.score!));
  assert.equal(block.keyNumbers![1]!.source, null);
  assert.equal(v7.sourceNumber(block, findings[0]!), 1);
  assert.equal(v7.hasBlocks({ blocks: [block] }), true);
  assert.equal(v7.hasBlocks({}), false);
}
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

// ── v7.2 report pipeline (pure parts): a note's URL counts only when the tools returned that page
{
  const bl = await import("../server/blocks-v7.js");
  const rp = await import("../server/report-v7.js");
  const { REPORT_SAMPLES } = await import("../server/v7-samples.js");
  const pages = [{ url: "https://www.valencia.es/estadistica/barri.pdf", title: "Padrón Russafa" }, { url: "https://glovoapp.com/es/es/valencia/stores/x/", title: "Levaduramadre" }];
  const n = bl.numberNotes(
    ["- Ruzafa had 25,514 residents in 2025 <https://valencia.es/estadistica/barri.pdf>", "- A hogaza costs €5.75 <https://glovoapp.com/es/es/valencia/stores/x>", "- 40% of locals want subscriptions <https://invented.example.com/study>", "- About 11,600 households <estimate>", "- Household bread spend in Valencia: not found", "SUMMARY: Dense barrio, premium sourdough already sells."].join("\n"),
    pages,
    "2026-11-16",
  );
  assert.equal(n.cites.length, 2, "only pages the tools returned are numbered");
  assert.ok(n.notes[0]!.endsWith("[1]") && n.notes[1]!.endsWith("[2]"));
  assert.ok(n.notes[2]!.endsWith("(estimate)"), "a URL the tools never returned is not a source");
  assert.ok(n.notes[3]!.endsWith("(estimate)") && !n.notes.some((x) => x.includes("http")));
  assert.ok(n.notes[4]!.endsWith("not found"), "a gap note is not dressed as an estimate");
  assert.equal(n.summary, "Dense barrio, premium sourdough already sells.");
  // footnote style: labels resolve to their URL, still checked against the pages
  const fn = bl.numberNotes("**Residents:** 25,514 people in 2025. [S1]\nRent is €22/m² <S2>\nA claim with an unknown label [S3]\nSources:\n[S1] Padrón — https://www.valencia.es/estadistica/barri.pdf\n[S2] Idealista — https://www.idealista.com/x\n[S3] Made up — https://invented.example.com/", pages, "2026-11-16");
  assert.equal(fn.notes.length, 3, "footnote definitions are not notes");
  assert.ok(fn.notes[0]!.startsWith("Residents: 25,514") && fn.notes[0]!.endsWith("[1]"));
  assert.ok(fn.notes[1]!.endsWith("(estimate)") && fn.notes[2]!.endsWith("(estimate)"));
  const fz = bl.numberNotes("- Loaf €3.80 <https://www.mercadocentralvalencia.es/Mercado/ProductosFamilia>\n- Another loaf price claim <https://evil.example.com/Mercado/ProductosFamilia>", [{ url: "https://www.mercadocentralvalencia.es/Mercado/ProductosFamilia?SeccionId=9", title: "Mercat" }], "2026-11-16");
  assert.ok(fz.notes[0]!.endsWith("[1]") && fz.notes[1]!.endsWith("(estimate)"), "same host + path matches; another host never does");

  // V1 research recipe: 1 search + ≤ 1 fetch per section, the money brief carries the 4 judge-flagged gaps
  assert.equal(bl.SEARCHES_PER_BLOCK * v7.BLOCK_IDS.length, 4, "4 searches per report");
  assert.equal(bl.FETCH_MAX_TOKENS, 5000);
  for (const g of ["VAT rate that applies to this exact product", "competitors' unit prices", "commercial (not residential) rent per m²", "employer social security on top of wages"]) assert.ok(bl.researchPrompt("x", "money").includes(g), `money brief: ${g}`);
  assert.deepEqual(rp.marketOf("A sourdough bakery in Valencia's Ruzafa neighbourhood"), { city: "Valencia", country: "ES" });
  assert.deepEqual(rp.marketOf("Dog walkers in Madrid"), { city: "Madrid", country: "ES" });
  assert.equal(rp.marketOf("An invoicing app for freelancers"), null);

  // global [S#] labels: per-block numbers become report-wide ids, deduplicated by URL
  const c = (u: string) => ({ url: u, title: u, domain: "x", accessed: "2026-11-16" });
  const lab = rp.labelResearch([
    { ...bl.emptyResearch("customers"), notes: ["Residents 25,514 (2025) [1]", "Spend: not found"], cites: [c("https://a.es/1")], ok: true },
    { ...bl.emptyResearch("money"), notes: ["Rent €14/m² [2]", "Same page [1]"], cites: [c("https://a.es/1"), c("https://b.es/2")], ok: true },
  ]);
  assert.deepEqual(lab.sources.map((s) => s.id), ["S1", "S2"]);
  assert.ok(lab.sections[0]!.notes.includes("[S1]") && lab.sections[2]!.notes.includes("Rent €14/m² [S2]") && lab.sections[2]!.notes.includes("Same page [S1]"));
  assert.equal(lab.sections[1]!.notes, "not found");
  assert.ok(rp.writerPrompt("x", lab.sections).includes("Monthly = weekly × 4.33") && rp.writerPrompt("x", lab.sections).includes("must match the Verdict exactly"));

  // unit economics in code: reproduces the measured V1-a report (net €24.04, break-even 195, capital €66,600)
  const v1a = {
    unit: "one subscriber-month (4 weekly loaves at €25/month)", price_per_unit_gross_eur: 25, vat_rate: 0.04, share_kept: 1,
    variable_costs_per_unit: [{ item: "flour, salt and ingredients for 4 loaves", eur: 4, source: "estimate" }, { item: "packaging and delivery", eur: 2.5, source: "estimate" }],
    fixed_monthly_costs: [{ item: "rent, 160 m² unit", eur: 1200, source: "S14" }, { item: "utilities", eur: 300, source: "estimate" }, { item: "insurance, accounting and software", eur: 200, source: "estimate" }, { item: "owner social security, first bracket", eur: 206, source: "S21" }, { item: "baker wages (part-time)", eur: 1500, source: "estimate" }],
    startup_costs: [{ item: "licence and technical project", eur: 8000, source: "S18" }, { item: "oven and bakery equipment", eur: 35000, source: "estimate" }, { item: "fit-out works", eur: 15000, source: "estimate" }, { item: "deposit and first-month rent (3 months at 1,200)", eur: 3600, source: "S14" }, { item: "working capital", eur: 5000, source: "estimate" }],
  };
  const ec = rp.computeEcon(v1a);
  assert.equal(ec.raw.net.toFixed(2), "24.04");
  assert.equal(ec.raw.contrib.toFixed(2), "17.54");
  assert.equal(ec.raw.fixed, 3406);
  assert.equal(ec.raw.be, 195);
  assert.equal(ec.raw.cap, 66600);
  assert.deepEqual([ec.vals.NET_REVENUE_PER_UNIT, ec.vals.CONTRIBUTION_MARGIN_PCT, ec.vals.BREAK_EVEN_UNITS, ec.vals.STARTUP_CAPITAL], ["€24.04", "73%", "195", "€66,600"]);
  assert.equal(rp.computeEcon({ ...v1a, price_per_unit_gross_eur: 5 }).raw.be, null, "no break-even when contribution ≤ 0");
  // placeholders: filled from the computed values; unknown or uncomputable ones become "n/a" and are counted
  const ph = rp.fillPlaceholders("Break-even is {{BREAK_EVEN_UNITS}} subscribers; capital {{STARTUP_CAPITAL}}; {{MADE_UP}}.", ec.vals);
  assert.equal(ph.md, "Break-even is 195 subscribers; capital €66,600; n/a.");
  assert.equal(ph.missing, 1);
  assert.equal(rp.fillPlaceholders("x {{FIXED_MONTHLY}}", null).md, "x n/a");

  // finalize: econ block stripped, placeholders filled, computed table in Money, invalid [S#] removed, sources listed
  const srcs = [{ id: "S1", url: "https://a.es/1", title: "Padrón" }, { id: "S2", url: "https://b.es/2", title: "Rents" }];
  const raw = `# Founder report: Bread in Ruzafa\n\n## Executive summary\n\nBreak-even is {{BREAK_EVEN_UNITS}} subscribers [S1]. A made-up claim [S9].\n\n## Verdict\n\n**NO-GO**\n\n- Demand unproven [S7].\n\n## Money\n\n**Takeaway:** Rent dominates.\n\n**Evidence:**\n- (−) Rent is €1,200 a month [S2].\n\n## Risks & how to start\n\n**Takeaway:** Licences.\n\n\`\`\`econ\n${JSON.stringify({ ...v1a, scores: { money: 3 }, scalability: { reach: 2, reach_label: "Neighbourhood" } })}\n\`\`\`\n`;
  const fin = rp.finalizeReport(raw, srcs);
  assert.equal(fin.invalidCites, 2, "[S9] and [S7] are not in the source list");
  assert.ok(!fin.md.includes("[S9]") && !fin.md.includes("[S7]") && !fin.md.includes("```") && !fin.md.includes("{{"));
  assert.ok(fin.md.includes("Break-even is 195 subscribers [S1]"));
  assert.ok(fin.md.indexOf("**Computed unit economics**") > fin.md.indexOf("## Money") && fin.md.indexOf("**Computed unit economics**") < fin.md.indexOf("## Risks"), "the computed table closes the Money section");
  assert.ok(fin.md.includes("## Sources\n- [S1] [Padrón](https://a.es/1)\n- [S2] [Rents](https://b.es/2)"));
  assert.equal(fin.econErr, null);
  assert.equal(fin.meta.scores?.money, 3);
  const bad = rp.finalizeReport("## Money\n\nBreak-even {{BREAK_EVEN_UNITS}}.\n\n```econ\n{not json\n```", []);
  assert.ok(bad.econErr && bad.md.includes("Break-even n/a."), "a broken econ block ships the report with n/a (no second call)");
  assert.ok(rp.finalizeReport("## Money\n\nNo block.", []).econErr === "no econ block");

  // Markdown → blocks: the real V1-a report (embedded demo sample; also .notes/quality/opt/V1-a.md when present)
  const bakery = REPORT_SAMPLES.bakery!;
  const shipped = rp.finalizeReport(bakery.writer, bakery.sources);
  assert.equal(shipped.econ?.computed.be, 195);
  assert.equal(shipped.invalidCites, 0);
  const mds = [shipped.md];
  try {
    mds.push(readFileSync(new URL("../.notes/quality/opt/V1-a.md", import.meta.url), "utf8"));
  } catch {
    /* .notes is not in the repo */
  }
  for (const md of mds) {
    const out = rp.parseReport(md, { idea: bakery.idea, ...(md === shipped.md ? { meta: shipped.meta } : {}) });
    assert.deepEqual(Object.keys(out.blocks), [...v7.BLOCK_IDS], "4 blocks");
    assert.equal(out.working_title, "Sourdough bread subscriptions in Ruzafa, Valencia");
    assert.ok(out.verdict_line.startsWith("NO-GO on committing savings now."));
    assert.equal(out.validate_first.length, 3);
    assert.ok(out.validate_first[0]!.how.startsWith("Contact 100 households") && out.validate_first[0]!.pass_if.startsWith("at least 15 paid pre-subscriptions"));
    assert.equal(out.blocks.customers!.evidence[0]!.text, "The municipal register counted 25,514 residents across 87.8 hectares on 1 January 2025.");
    assert.equal(out.cites!.customers![out.blocks.customers!.evidence[0]!.source! - 1]!.url, "https://valenciamove.com/es/barrios-valencia/ruzafa/");
    assert.ok(out.blocks.money!.math.includes("Break-even (units per month): 195") && out.blocks.money!.math.includes("Start-up capital: €66,600"));
    assert.equal(out.blocks.money!.key_numbers.length, 4);
    assert.equal(out.blocks.competition!.actions.length, 3);
    assert.ok(!JSON.stringify(out).includes("[S"), "no [S#] tags left in the parsed text");
    const a = bl.assembleReport(out, []);
    assert.deepEqual(a.blocks.map((b) => b.role), ["demand", "competition", "pricing", "viability"]);
    for (const b of a.blocks) {
      assert.ok(b.sources.length >= 3, `${b.id}: real sources kept`);
      assert.ok(!b.takeaway.endsWith("…") && !b.meaning.endsWith("…") && b.actions.every((x) => !x.endsWith("…")), `${b.id}: full sentences, never cut with …`);
    }
    assert.ok(!a.brief.title.endsWith("…") && !a.brief.summary.endsWith("…") && a.brief.validateFirst.every((v) => !v.how.endsWith("…") && !v.passIf.endsWith("…")));
    const ids = new Set(Object.values(a.findings).flat().map((f) => f!.id));
    for (const s of [...a.judge.strengths, ...a.judge.weaknesses]) assert.ok(ids.has(s.finding), `judge point ${s.finding} is a real finding`);
    const work = a.blocks.map((b) => v7.finishWork({ analyst: b.role, status: "done", findings: a.findings[b.role] ?? [], score: null, headline: b.takeaway }));
    const rep = v7.buildReport(v7.blockRoster(), work, a.judge);
    assert.ok(rep.score >= 0 && rep.score <= 10 && ["go", "pivot", "no-go"].includes(rep.verdict));
    if (md === shipped.md) {
      // the writer's section scores steer the arithmetic: the money block (3/10) lands in the weak band
      assert.equal(a.blocks.find((b) => b.id === "money")!.verdict, "weak");
      assert.equal(a.judge.scalability.parts.Reach, 2);
    }
  }
  // impacts: explicit signs are kept, then nudged toward the writer's score
  assert.deepEqual(rp.impactsFor([{ sign: 1, sourced: true }, { sign: -1, sourced: true }]), [1, -1]);
  const up = rp.impactsFor([{ sign: 1, sourced: true }, { sign: -1, sourced: true }, { sign: null, sourced: true }], 8);
  assert.equal(up[1], -1, "a (−) item never flips");
  assert.equal(up[0], 2, "the (+) item is strengthened toward the writer's score");
  assert.equal(up[2], 0, "an untagged context fact is never turned into a + or a −");
  const down = rp.impactsFor([{ sign: null, sourced: true }, { sign: null, sourced: true }, { sign: -1, sourced: false }], 2);
  assert.deepEqual(down.slice(0, 2), [0, 0], "neutral facts stay neutral even when the section score is low");
  assert.ok(down[2]! < 0);
  assert.equal(rp.inferSign("The municipal register counted 25,514 residents across 87.8 hectares [S1]."), null);
  assert.equal(rp.inferSign("Ingredient costs, baker wages and VAT on bread were not found in the research."), -1);

  // zero costs are missing inputs, never facts (live run 2026-11-16: €0 rent/wages gave "break-even 4", "capital €150")
  {
    const z = rp.computeEcon({ unit: "one subscriber-month", price_per_unit_gross_eur: 25, vat_rate: 0.04, share_kept: 1, variable_costs_per_unit: [{ item: "flour", eur: 0 }], fixed_monthly_costs: [{ item: "RETA", eur: 88.64, source: "S20" }, { item: "rent", eur: 0 }], startup_costs: [{ item: "licence", eur: 150 }, { item: "oven", eur: 0 }] });
    assert.equal(z.raw.be, null);
    assert.equal(z.vals.BREAK_EVEN_UNITS, rp.ECON_NA);
    assert.equal(z.vals.STARTUP_CAPITAL, rp.ECON_NA);
    assert.equal(z.vals.VARIABLE_COST_PER_UNIT, rp.ECON_NA);
    assert.ok(z.raw.missing.some((m) => m.startsWith("rent")) && z.table.includes("Missing cost inputs"));
    const fz = rp.finalizeReport("# Founder report: X\n\n## Money\n\nBreak-even at {{BREAK_EVEN_UNITS}} subscribers.\n\n```econ\n" + JSON.stringify({ unit: "one subscriber-month", price_per_unit_gross_eur: 25, vat_rate: 0.04, variable_costs_per_unit: [], fixed_monthly_costs: [{ item: "rent", eur: 0 }], startup_costs: [] }) + "\n```", []);
    assert.ok(fz.econErr?.startsWith("cost inputs missing") && !/Break-even at \d/.test(fz.md));
    const es = rp.econSummary(fz, []);
    assert.ok(es && es.breakEven == null && es.fixedMonthly == null && es.missing!.length >= 2);
    assert.equal(rp.unitPlural("one subscriber-month"), "subscribers");
    assert.equal(rp.unitPlural("booked walk-hour"), "booked walk-hours");
    assert.ok(rp.priceHints("Weekly bread subscriptions at €25 a month")[0]!.includes("€5.77 per delivery"));
    assert.deepEqual(rp.priceHints("A dog-walking app, €12 a walk"), []);
    assert.equal(v7.alignVerdictLine("GO WITH CONDITIONS: Demand is plausible", "pivot"), "Pivot: Demand is plausible");
    assert.equal(v7.alignVerdictLine("NO-GO on committing savings now.", "no-go"), "No-go on committing savings now.");
    const am = rp.alignVerdictMd("## Verdict\n\n**GO WITH CONDITIONS**\n\n- reason", "pivot", 4.8);
    assert.ok(am.includes("**PIVOT** (score 4.8/10; the writer's own call was GO WITH CONDITIONS)"));
    assert.equal(rp.adjustConfidence("high", { econMissing: false, gaps: 1, total: 20 }), "high");
    assert.equal(rp.adjustConfidence("high", { econMissing: true, gaps: 7, total: 20 }), "low");
  }
  // fallbacks: a failed writer becomes the analyst's notes (sources kept by number), never an error
  const fr = bl.fallbackReport("A bakery in Ruzafa", [{ ...bl.emptyResearch("money"), notes: ["Rent is €14.6/m² (2026) [1]", "Flour costs about €1/kg (estimate)"], cites: [{ url: "https://idealista.com/x", title: "Idealista", domain: "idealista.com", accessed: "2026-11-16" }], summary: "Rent found.", ok: true }]);
  assert.equal(fr.blocks.money!.evidence[0]!.source, 1);
  assert.equal(fr.blocks.money!.evidence[1]!.source, null);
  assert.ok(fr.fallback!.includes("judge"));
  const fa = bl.assembleReport(fr, [{ ...bl.emptyResearch("money"), cites: [{ url: "https://idealista.com/x", title: "Idealista", domain: "idealista.com", accessed: "2026-11-16" }] }]);
  assert.equal(fa.blocks.length, 4);
  assert.equal(fa.findings.pricing![0]!.source?.url, "https://idealista.com/x");

  // demo mode: the whole pipeline (mock research → writer replay → finalize → parse) gives 4 blocks with notes
  const notes: string[] = [];
  const research = await Promise.all(v7.BLOCK_IDS.map((id) => bl.researchBlock(bakery.idea, id, { onNote: (k, t) => notes.push(`${id}:${k}:${t}`) })));
  assert.ok(research.every((r) => r.ok && r.cites.length > 0), "real sample notes and sources per block");
  const w = await rp.writeReport(bakery.idea, research, { onNote: (a, k, t) => notes.push(`${a}:${k}:${t}`) });
  assert.equal(Object.keys(w.out.blocks).length, 4);
  assert.ok(w.md.includes("## Sources") && w.econ?.computed.be === 195);
  assert.ok(notes.some((x) => x.endsWith("Break-even: 195 subscribers a month")), "break-even bubble reads naturally");
  assert.ok(w.out.reasons!.length >= 3 && w.out.reasons!.some((r) => r.includes("195")), "the verdict's reasons are kept");
  assert.equal(w.accessed, "2026-11-16", "replayed sources keep the run's own read date");
  const es7 = rp.econSummary(w, w.sources ?? [], w.accessed);
  assert.ok(es7 && es7.breakEven === 195 && es7.startupCapital === 66600 && es7.lines!.some((l) => l.source?.url));
  for (const want of ["Digging into", "Reading ", "Found ", "Writing the report", "Writing Money", "Break-even: 195"]) assert.ok(notes.some((x) => x.includes(want)), `progress note: ${want}`);
  assert.ok(notes.every((x) => x.split(":").slice(2).join(":").split(/\s+/).length <= 12), "speech bubbles stay short");
  const dog = REPORT_SAMPLES.dog!;
  const wd = await rp.writeReport(dog.idea, [], {});
  assert.equal(Object.keys(wd.out.blocks).length, 4);
  assert.equal(wd.econ?.computed.be, 205, "V4-b dog walkers: break-even 205 walk-hours");
  const wg = await rp.writeReport("Pottery classes for retirees in Lugo", [], {});
  const wc = await rp.writeReport(V7_SAMPLES.coffee.idea, [], {});
  assert.ok(Object.values(wc.out.blocks).some((b) => b!.evidence.some((e) => e.source != null)), "a classic sample replays its hand-checked sources");
  assert.equal(Object.keys(wg.out.blocks).length, 4, "an idea without a sample still gets a full (estimate) report");
  assert.ok(Object.values(wg.out.blocks).every((b) => b!.evidence.every((e) => e.source == null)));
}

// per-report budget: reserve and settle; refused when the estimate would pass the cap
{
  const { Budget, BudgetError, REPORT_CAP_USD, EST } = await import("../server/cost.js");
  assert.equal(REPORT_CAP_USD, 0.1);
  assert.ok(4 * EST.research + EST.writer <= REPORT_CAP_USD, "the V1 plan fits the cap");
  const b = new Budget(0.1);
  const settle = b.reserve("research", 0.06);
  assert.throws(() => b.reserve("writer", 0.05), BudgetError);
  settle([{ label: "r", model: "claude-haiku-5-5", in: 0, out: 0, searches: 1, fetches: 0, usd: 0.013 }]);
  settle([{ label: "r", model: "claude-haiku-5-5", in: 0, out: 0, searches: 1, fetches: 0, usd: 0.013 }]);
  assert.equal(b.spent, 0.013, "settle is idempotent");
  assert.ok(b.fits(0.05) && !b.fits(0.09));
}

void (null as unknown as IdeaReport);
console.log("v7 invariants: all passed");
