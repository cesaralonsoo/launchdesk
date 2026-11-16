// The report never contradicts its computed verdict, leads with the reason that decides it, flags cost lines whose
// source does not show the figure, and carries the writer's pivot. Uses the live dog-walk run (16 Nov). Zero spend.
// Run: npx tsx test/verdict.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
process.env.MOCK_AI = "1";
process.env.DATABASE_URL ??= ":memory:";

const v7 = await import("../server/v7.js");
const rp = await import("../server/report-v7.js");
const live = JSON.parse(readFileSync(new URL("../server/seed/examples/dogwalk-madrid-live-2026-11-16.json", import.meta.url), "utf8")).project.results.v7;
const r = live.report as import("../server/v7.js").IdeaReport;
const md = live.reportMd as string;
const section = (m: string, head: string) => (new RegExp(`^## ${head}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(m)?.[1] ?? "");

// the live text really had the defect
assert.match(section(md, "Executive summary"), /GO WITH CONDITIONS/);
assert.equal(r.verdict, "no-go");

// 2. the lead reason is the one against the idea, not the first (favourable) bullet
const li = v7.leadReason(r.reasons!, r.verdict, r.factors);
assert.notEqual(li, 0, "a No-go does not lead with 'The price is in range'");
const lead = r.reasons![li]!;
assert.match(lead, /unproven|missing|saturated|exposure/i);
assert.equal(v7.leadReason(["Rover is cheaper and nothing shows demand.", "The price is in range and defensible."], "go", [{ analyst: "pricing", score: 8 }]), 1, "a Go leads with the reason for it");
assert.equal(v7.leadReason([], "no-go", []), -1);

// 1. the shipped Markdown agrees with the computed verdict everywhere
const fixed = rp.alignVerdictMd(md, r.verdict, r.score, { lead });
const sum = section(fixed, "Executive summary");
assert.doesNotMatch(sum, /GO WITH CONDITIONS|\bGO\b/, "the summary drops the writer's own verdict");
assert.match(sum, /Verdict: No-go \(score 2\.8\/10\)\. Main reason: /);
assert.equal(sum.match(/Verdict:/g)!.length, 1);
assert.match(sum, /break-even is 1,713 walks per month/, "the rest of the summary is kept");
assert.match(sum, /\[S8\]/, "citations in the summary are kept");
const vsec = section(fixed, "Verdict");
assert.match(vsec, /^\s*\*\*NO-GO\*\* \(score 2\.8\/10\)\s*$/m);
assert.doesNotMatch(vsec, /writer's own call|GO WITH CONDITIONS/);
const firstBullet = vsec.split("\n").find((l) => /^\s*-\s/.test(l))!;
assert.ok(firstBullet.includes(lead.split(".")[0]!), "the deciding reason is the first bullet");
assert.equal((vsec.match(/^\s*-\s/gm) ?? []).length, 5, "no bullet lost");
assert.equal(rp.alignVerdictMd(fixed, r.verdict, r.score, { lead }), fixed, "idempotent");
assert.equal(fixed.length > md.length - 200, true);

// the brief's summary (no cites) gets the same treatment
const bs = rp.alignSummary(live.brief.summary, rp.verdictSentence(r.verdict, r.score, lead));
assert.doesNotMatch(bs, /GO WITH CONDITIONS/);
assert.ok(bs.endsWith(rp.verdictSentence(r.verdict, r.score, lead)));
assert.equal(rp.alignSummary(bs, rp.verdictSentence(r.verdict, r.score, lead)), bs, "idempotent");
assert.match(rp.alignSummary("Demand is strong. We say GO.", rp.verdictSentence("pivot", 5.1)), /^Demand is strong\. Verdict: Test first \(score 5\.1\/10\)\.$/);
// "go" as an ordinary word is not a verdict
assert.match(rp.alignSummary("Owners go to work early.", "Verdict: Go (score 7.0/10)."), /^Owners go to work early\./);

// buildReport: a written report's verdict line and reasons start with the deciding reason
{
  const roster = v7.blockRoster();
  {
    const work = live.work as import("../server/v7.js").AnalystWork[];
    const out = v7.buildReport(roster, work, { fullText: true, verdictLine: "GO WITH CONDITIONS: The price is in range.", scalability: { parts: {}, why: "", wouldScale: [] }, strengths: [], weaknesses: [], nextSteps: [], reasons: r.reasons, pivot: { idea: "Group walks for office buildings", why: "Group walks are cheaper per dog" } });
    // the stored live findings: a low score, but nothing sourced counts against the idea → Test first, not No-go
    assert.equal(out.verdict, "pivot");
    assert.equal(out.against, undefined);
    assert.notEqual(out.confidence, "high", "a low score resting on unknowns never claims high confidence");
    {
      assert.ok(out.verdictLine.startsWith(`${v7.VERDICT_WORD[out.verdict]}: `));
      assert.doesNotMatch(out.verdictLine, /price is in range/);
      // the lead is the deciding reason's opening sentence(s), not the whole reason (the page lists the rest below it)
      assert.ok(out.reasons![0]!.startsWith(out.verdictLine.slice(out.verdictLine.indexOf(": ") + 2)), out.verdictLine);
      assert.equal(out.pivot?.idea, "Group walks for office buildings", "a No-go or Pivot keeps the writer's pivot");
    }
  }
}

// 3. cost lines: a source counts only when the research note holds the quoted figure
const notes = "- Group walks cost €8–12 per walk [S1]\n- Walkers earn €9 per hour on average [S2]";
assert.equal(rp.quoteBacks({ eur: 9, quote: "Walkers earn €9 per hour" }, "S2", notes), true);
assert.equal(rp.quoteBacks({ eur: 9, quote: "Walkers earn €9 per hour" }, "S1", notes), false, "the quote must sit under the cited source");
assert.equal(rp.quoteBacks({ eur: 8, quote: "" }, "S1", notes), false, "no quote, no proof");
assert.equal(rp.quoteBacks({ eur: 8, quote: "walker payout is €8" }, "S1", notes), false, "a quote that is not in the notes");
assert.equal(rp.quoteBacks({ eur: 7, quote: "Group walks cost €8–12" }, "S1", notes), false, "the quote must state the figure");
const fin = {
  econ: {
    inputs: { unit: "one walk", price_per_unit_gross_eur: 12, vat_rate: 0.21, variable_costs_per_unit: [{ item: "walker payout per walk", eur: 8, source: "S1" }, { item: "walker pay", eur: 9, source: "S2", quote: "Walkers earn €9 per hour" }, { item: "fees", eur: 0.4, source: "estimate" }] },
    computed: { net: 9.92, varc: 17.4, contrib: -7.48, fixed: 0, be: null, cap: 0, missing: [] },
  },
} as unknown as Parameters<typeof rp.econSummary>[0];
const srcs = [{ id: "S1", url: "https://www.whopaws.com/x", title: "Whopaws" }, { id: "S2", url: "https://example.org/pay", title: "Pay" }];
const es = rp.econSummary(fin, srcs, "2026-11-16", notes)!;
assert.deepEqual(es.lines!.map((l) => !!l.check), [true, false, false], "the unbacked €8 payout is marked Check; estimates are not");
assert.ok(rp.econSummary(fin, srcs, "2026-11-16")!.lines!.every((l) => !l.check), "no notes (demo samples): nothing is marked");

// 4. the writer's pivot comes through the econ block (no extra call), and the prompt asks for it and the rules above
const raw = `# Founder report: Dog walks\n\n## Executive summary\n\nA summary.\n\n## Verdict\n\n**NO-GO**\n\n- Demand is unproven.\n\n\`\`\`econ\n{"unit":"one walk","price_per_unit_gross_eur":12,"vat_rate":0.21,"variable_costs_per_unit":[{"item":"walker pay","eur":8,"source":"estimate"}],"fixed_monthly_costs":[{"item":"insurance","eur":40,"source":"estimate"}],"startup_costs":[{"item":"app","eur":3000,"source":"estimate"}],"pivot":{"idea":"Group walks sold to office buildings.","why":"Group walks are €8–12 [S1], so a building contract fills a walker's day."}}\n\`\`\``;
const f2 = rp.finalizeReport(raw, srcs);
assert.equal(f2.meta.pivot?.idea, "Group walks sold to office buildings.");
assert.ok(!("pivot" in (f2.econ!.inputs as object)), "the pivot is not an econ input");
assert.equal(rp.parseReport(f2.md, { idea: "Dog walks in Madrid", meta: f2.meta, sources: srcs }).pivot?.idea, "Group walks sold to office buildings");
assert.equal(rp.parseReport(f2.md, { idea: "Dog walks in Madrid", meta: {}, sources: srcs }).pivot, null);
const prompt = rp.writerPrompt("A dog-walking app in Madrid, €12 a walk", [{ title: "Money", notes: "not found" }]);
assert.match(prompt, /Do not state a verdict .* in the executive summary/);
assert.doesNotMatch(prompt, /and the verdict in one line/);
assert.match(prompt, /literally states this figure/);
assert.match(prompt, /"quote"/);
assert.match(prompt, /"pivot": \{"idea"/);

// 5. calibration: missing data is uncertainty, not evidence against. No-go needs sourced evidence against the idea.
{
  const src = { url: "https://example.org/a", title: "A", domain: "example.org", accessed: "2026-11-16" };
  const F = (analyst: import("../server/v7.js").AnalystRole, impact: -2 | -1 | 0 | 1 | 2, text: string, sourced = true) => ({ id: `${analyst}-${text.length}-${impact}`, analyst, kind: "fact" as const, text, impact, source: sourced ? src : null, t: 0 });
  const fac = (analyst: string, score: number) => ({ analyst: analyst as import("../server/v7.js").AnalystRole, label: analyst, score });
  // nothing sourced against: gaps, estimates and requirements that can be met do not count
  const soft = [F("demand", -2, "Footfall at the exit was not found.", false), F("pricing", -2, "Rent is probably high (estimate).", false), F("viability", -1, "Civil-liability insurance is compulsory."), F("viability", -1, "A PPP licence is required for listed breeds.")];
  assert.deepEqual(v7.evidenceAgainst([fac("demand", 2), fac("pricing", 2), fac("viability", 1)], soft), []);
  assert.equal(v7.verdictFor(2.5, [{ score: 2 }], []), "pivot", "low score, nothing sourced against → Test first");
  assert.equal(v7.verdictFor(2.5, [{ score: 2 }]), "no-go", "classic callers keep the old band");
  assert.equal(v7.verdictFor(2.5, [{ score: 2 }], ["x"]), "no-go");
  assert.equal(v7.verdictFor(7, [{ score: 7 }], []), "go");
  assert.equal(v7.VERDICT_WORD.pivot, "Test first", "display word; the enum stays pivot");
  // a saturated market shown by sourced competitors
  const sat = [F("competition", -1, "Rover lists 400 walkers in Chamberí at €8."), F("competition", -1, "Gudog lists 250 walkers at €9."), F("competition", -1, "Petme covers every district at €8."), F("competition", 0, "Wegow prices were not found.")];
  assert.equal(v7.evidenceAgainst([fac("competition", 2)], sat).length, 1);
  assert.deepEqual(v7.evidenceAgainst([fac("competition", 4)], sat), [], "only at the floor");
  // a legal ban (a sourced finding), not a requirement
  assert.match(v7.evidenceAgainst([fac("viability", 2)], [F("viability", -2, "New kiosks on public space are prohibited in the district until 2028.")])[0]!, /prohibited/);
  assert.deepEqual(v7.evidenceAgainst([fac("viability", 2)], [F("viability", -2, "Street vending is not allowed without a municipal licence.")]), [], "a requirement that can be met");
  assert.deepEqual(v7.evidenceAgainst([fac("viability", 2)], [F("viability", -2, "Street vending is prohibited.", false)]), [], "an unsourced claim does not decide");
  // negative contribution margin from sourced costs only
  const line = (eur: number, sourced: boolean, check = false) => ({ group: "variable", eur, source: sourced ? src : null, ...(check ? { check } : {}) });
  assert.match(v7.evidenceAgainst([], [], { net: 9.92, lines: [line(8, true), line(3, true)] })[0]!, /€11\.00.*€9\.92/);
  assert.deepEqual(v7.evidenceAgainst([], [], { net: 9.92, lines: [line(8, true), line(3, false)] }), [], "estimates alone never make a No-go");
  assert.deepEqual(v7.evidenceAgainst([], [], { net: 9.92, lines: [line(8, true), line(3, true, true)] }), [], "a cost the source does not back is not sourced");
  // the writer brief asks for the same split
  const wp = rp.writerPrompt("A coffee kiosk", [{ title: "Money", notes: "not found" }]);
  assert.match(wp, /\(\?\) if it is something the research did not find/);
  assert.match(wp, /Score the evidence, not the gaps/);
  assert.match(wp, /TEST FIRST/);
  // (?) bullets and unsourced gaps never move a section score
  const md2 = "# Founder report: X\n\n## Verdict\n\n**TEST FIRST**\n\n- Demand is open.\n\n## Customers\n\n**Evidence:**\n- (?) Footfall at the exit was not measured.\n- (−) No footfall data was found for the exit.\n- (=) The city has 1.7 million residents [S1].\n";
  const p2 = rp.parseReport(md2, { idea: "x", meta: { scores: { customers: 2 } }, sources: [{ id: "S1", url: "https://example.org/a", title: "A" }] });
  assert.deepEqual(p2.blocks.customers!.evidence.map((e) => e.impact), [0, 0, 0]);
  assert.deepEqual(p2.blocks.customers!.evidence.map((e) => e.basis), ["Not found in the research", "Not found in the research", null]);
}

// 6. the two saved live reports, re-finished offline (zero spend): both were No-go only on missing data
{
  const bl = await import("../server/blocks-v7.js");
  const refinish = (file: string) => {
    const j = JSON.parse(readFileSync(new URL(`../server/seed/examples/${file}`, import.meta.url), "utf8")).project;
    const v = j.results.v7;
    const old = v.report as import("../server/v7.js").IdeaReport;
    // the writer's own section scores are not stored (the econ block is stripped); the shipped factor scores stand in
    const scores = Object.fromEntries(v7.BLOCK_IDS.map((id) => [id, old.factors.find((f) => f.analyst === v7.BLOCK_LIBRARY[id].role)!.score]));
    const out = rp.parseReport(v.reportMd, { idea: j.idea, meta: { scores, pivot: old.pivot }, accessed: "2026-11-16" });
    const a = bl.assembleReport(out, []);
    const roster = v7.blockRoster();
    const work = roster.map((x) => v7.finishWork({ analyst: x.role, status: "done", findings: a.findings[x.role] ?? [], score: null, headline: "" }));
    return { old, rep: v7.buildReport(roster, work, { ...a.judge, econ: v.econ }) };
  };
  for (const [file, pivotWhy] of [["dogwalk-madrid-live-2026-11-16.json", null], ["coffee-kiosk-barcelona-live-2026-11-16.json", "Bicioci sells a coffee and croissant combo under €3 and Pasta Madre sells one for €1.60."]] as const) {
    const { old, rep } = refinish(file);
    assert.equal(old.verdict, "no-go", `${file}: shipped as No-go`);
    assert.equal(rep.verdict, "pivot", `${file}: re-finished as Test first`);
    assert.equal(v7.verdictFor(rep.score, rep.factors), "no-go", `${file}: the old rule would still say No-go on the same score`);
    assert.ok(rep.score < 4.5, `${file}: the score is not inflated`);
    assert.equal(rep.against, undefined, `${file}: nothing sourced counts against it`);
    assert.ok((rep.unknowns ?? []).length >= 3, `${file}: the gaps are listed as unknowns`);
    assert.notEqual(rep.confidence, "high");
    assert.ok(rep.verdictLine.startsWith("Test first: "));
    assert.match(rp.verdictSentence(rep.verdict, rep.score, rep.reasons?.[0]), /^Verdict: Test first .*No sourced evidence rules it out/);
    if (pivotWhy) {
      assert.equal(rep.pivot?.why, pivotWhy, "the pivot is a full sentence with no [S#] labels and no dangling clause");
      assert.ok(old.pivot!.why.includes("[S9]") && old.pivot!.why.endsWith("…"), "the shipped pivot had the defect");
    }
  }
  // sentenceCap: whole sentences, [S#] stripped, a cut text ends at its last full clause
  assert.equal(rp.sentenceCap("Group walks are €8–12 [S1], so a building contract fills a walker's day. More text here."), "Group walks are €8–12, so a building contract fills a walker's day. More text here.");
  assert.equal(rp.sentenceCap("One. Two three four five six.", 3), "One.");
  assert.equal(rp.sentenceCap("A long reason with no stop", 40), "A long reason with no stop.");
}

// ───────────────────────────────────────────── report text quality: real texts saved on 16 Nov (task C regression)
{
  // local.db results_v7 xFjb99Z6b4 (coffee kiosk, €3 flat white, Test first 5.5): the lead as it shipped
  const SHIPPED_LINE = "Test first: €3 sits below Syra Coffee's €3.90 flat white and inside the €3–4.50 range that Barcelona Tourism gives for third-wave cafés (barcelonatourism.org, August 2026; no source id). Three Marks lists a flat white at €2.50 (guidavera menu, undated; no source id), so price pressure…";
  const REASONS = [
    "€3 sits below Syra Coffee's €3.90 flat white and inside the €3–4.50 range that Barcelona Tourism gives for third-wave cafés (barcelonatourism.org, August 2026; no source id). Three Marks lists a flat white at €2.50 (guidavera menu, undated; no source id), so price pressure is real.",
    "The population is large, but no source counts the people who pass this exit or their buying habits. The city figures are for the whole city, not for the station.",
    "Traditional bars charge €1.50–2.50 for a café con leche (barcelonatourism.org, 2026; no source id). Commuters can buy a cheaper drink nearby.",
  ];
  const LEAD = "Test first: €3 sits below Syra Coffee's €3.90 flat white and inside the €3–4.50 range that Barcelona Tourism gives for third-wave cafés.";
  // a new report: the lead is the deciding reason's first sentence, without the in-words source notes
  assert.equal(v7.leadLine(`Test first: ${REASONS[0]}`), LEAD);
  // a report saved before the fix renders the same clean lead (report-doc.ts uses leadLine on the stored line)
  assert.equal(v7.leadLine(SHIPPED_LINE), LEAD);
  assert.ok(LEAD.split(" ").length <= 30);
  // the reasons under the lead never repeat it: the first one keeps only what the lead does not say
  const after = v7.reasonsAfterLead(LEAD, REASONS);
  assert.equal(after.length, 3);
  assert.equal(after[0], "Three Marks lists a flat white at €2.50 (guidavera menu, undated), so price pressure is real.");
  assert.ok(!after.some((x) => x.includes("€3 sits below")), "the lead's sentence is not listed again");
  assert.ok(!after.some((x) => /no source id/.test(x)));
  // the old shipped (truncated) lead also hides the repeat
  assert.ok(!v7.reasonsAfterLead(SHIPPED_LINE, REASONS).some((x) => x.includes("€3 sits below")));
  // the executive summary's "Main reason:" carries no in-words source either
  assert.equal(rp.verdictSentence("pivot", 5.5, REASONS[0]), "Verdict: Test first (score 5.5/10). Main reason: €3 sits below Syra Coffee's €3.90 flat white and inside the €3–4.50 range that Barcelona Tourism gives for third-wave cafés.");
  // e2e.db xkUVNypbKZ (yoga, Test first 4.1): a clean one-sentence lead is kept as it is
  const YOGA = "Test first: The citywide senior population is large, but no neighbourhood-level 65+ count for Ruzafa was found, so the core customer is unproven in the target area.";
  assert.equal(v7.leadLine(YOGA), YOGA);
  // asides that are not sources stay
  assert.equal(v7.noInlineCites("Rent is €21 per m² (asking price) in Ruzafa (idealista.com, 2026)."), "Rent is €21 per m² (asking price) in Ruzafa.");

  // pivot as shipped in the live coffee example: cut mid-sentence with raw [S9] labels → whole sentences, no labels
  const PIVOT_WHY = "Bicioci sells a coffee and croissant combo under €3 [S9] and Pasta Madre sells one for €1.60 [S9], though both come from undated travel…";
  assert.equal(v7.fullSentences(v7.plainText(PIVOT_WHY), 40), "Bicioci sells a coffee and croissant combo under €3 and Pasta Madre sells one for €1.60.");

  // break-even units read as English plurals ("1,411 cup of flat white sold at the kiosks a month" before)
  assert.equal(v7.unitPlural("one cup of flat white sold at the kiosk"), "cups of flat white");
  assert.equal(v7.unitPlural("one flat white sold at the metro-exit kiosk"), "flat whites");
  assert.equal(v7.unitPlural("one booked seat in one gentle yoga class"), "booked seats");
  assert.equal(v7.unitPlural("one subscriber-month"), "subscribers");
  assert.equal(v7.unitPlural("booked walk-hour"), "booked walk-hours");
  assert.equal(v7.unitPlural("one class"), "classes");
  assert.equal(v7.unitPlural("one sale (demo estimate)"), "sales");
  assert.equal(rp.unitPlural("one cup of flat white sold at the kiosk"), "cups of flat white");

  // the report Markdown never doubles the € sign ("Net revenue per cup is €€2.73" before)
  const filled = rp.fillPlaceholders("Net revenue per cup is €{{NET_REVENUE_PER_UNIT}}, break-even {{BREAK_EVEN_UNITS}} cups, capital € {{STARTUP_CAPITAL}}.", { NET_REVENUE_PER_UNIT: "€2.73", BREAK_EVEN_UNITS: "1,411", STARTUP_CAPITAL: "€23,400" });
  assert.equal(filled.md, "Net revenue per cup is €2.73, break-even 1,411 cups, capital €23,400.");
  assert.equal(rp.fillPlaceholders("€{{FIXED_MONTHLY}}", { FIXED_MONTHLY: "n/a (cost inputs missing)" }).md, "n/a (cost inputs missing)");

  // the bespoke Spanish website (e2e xkUVNypbKZ) showed "Source: gobinde.com": labels follow the page language
  const cr = await import("../server/site/custom-render.js");
  const SITE = `Gobinde, una clase: 18 €. <a href="https://gobinde.com/horario/" rel="noopener nofollow" target="_blank">Source: gobinde.com</a>`;
  assert.equal(cr.localizeLabels(SITE, "es"), SITE.replace(">Source: ", ">Fuente: "));
  assert.equal(cr.localizeLabels(SITE, "en"), SITE);
  assert.equal(cr.localizeLabels(SITE.replace("Source", "Fuente"), "en-GB"), SITE);
  assert.equal(cr.localizeLabels("<p>Sources: a, b</p><p>Source code is open</p>", "es"), "<p>Fuentes: a, b</p><p>Source code is open</p>");
}

console.log("verdict consistency: all passed");
