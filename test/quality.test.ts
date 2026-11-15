// v6 quality invariants: the numbers the founder sees must add up, for every mock sample and for sanitized model answers.
// Run via test/schema.test.ts (imported at its end) or: npx tsx test/quality.test.ts
import assert from "node:assert/strict";
process.env.MOCK_AI = "1";
process.env.DATABASE_URL ??= ":memory:";
const ai = await import("../server/ai.js");
const { sanitize, leoScore, verdictFor, SIGNAL_WEIGHTS, SIGNAL_NAMES, cap } = ai;
const { mockFor, mockMemo, sampleIdea, sampleProject, exampleProject } = await import("../server/mocks.js");
const { STAGE_DEPTS, deriveSam } = await import("../server/types.js");
const { STAGE_GROUPS } = await import("../server/jobs.js");

type Any = Record<string, any>;
const KEYS = ["coffee", "dog", "bikes", "bread"] as const;

// weights are a real weighting
assert.equal(Math.round(Object.values(SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0) * 1000), 1000);

for (const k of KEYS) {
  const idea = sampleIdea(k);
  const p = sampleProject(k, { id: k, slug: k, now: Date.UTC(2026, 10, 16, 9) }, sanitize);
  const r = p.results as Any;

  // Leo: score = weighted signals, verdict = bands, the mock's typed score agrees with the maths.
  const leo = r.leo;
  assert.equal(leo.score, leoScore(leo.signals), `${k}: score is the weighted sum`);
  assert.equal(mockFor("leo", idea).score, leo.score, `${k}: mock score matches its own signals`);
  assert.equal(leo.verdict, verdictFor(leo.score, leo.signals), `${k}: verdict follows the bands`);
  assert.equal(mockFor("leo", idea).verdict, leo.verdict, `${k}: mock verdict matches the bands`);
  assert.deepEqual(leo.signals.map((s: Any) => s.name), [...SIGNAL_NAMES]);
  assert.ok(leo.signals.every((s: Any) => s.weight === SIGNAL_WEIGHTS[s.name as keyof typeof SIGNAL_WEIGHTS]));
  assert.ok(leo.score_math.endsWith(`= ${leo.score.toFixed(1)}`), `${k}: score maths shown`);
  assert.equal(leo.verdict === "go", leo.pivot === null, `${k}: pivot only when not go`);
  assert.ok(leo.kill_criteria.length >= 2 && leo.kill_criteria.every((x: string) => /^Stop if /.test(x)), `${k}: kill criteria`);
  assert.equal(leo.risks.length, 3);
  assert.equal(leo.interviews.questions.length, 5);
  assert.ok(leo.interviews.questions.every((q: string) => !/\bwould you\b/i.test(q)), `${k}: Mom Test questions are about the past`);
  assert.equal(leo.confidence.level, "low", "mocks have no web sources");
  assert.ok(leo.market_facts.every((f: Any) => f.is_estimate && f.source_id === null));
  assert.ok(leo.competitors.every((c: Any) => c.url === null));

  // Sam: breakdown adds up, break-even maths is shown and exact, months add up to year 1, offer leaves money.
  const sam = r.sam;
  const A = (key: string) => sam.assumptions.find((a: Any) => a.key === key).value as number;
  const fixed = A("fixed_costs_month");
  assert.equal(sam.fixed_costs_breakdown.reduce((t: number, l: Any) => t + l.value, 0), fixed, `${k}: fixed costs breakdown adds up`);
  const contribution = Math.round(A("avg_ticket") * A("gross_margin_pct")) / 100;
  assert.equal(sam.unit.contribution, contribution);
  const perDay = fixed / contribution / A("open_days_month");
  assert.ok(Math.abs(sam.breakeven_units_per_day - perDay) <= (perDay >= 10 ? 1 : 0.1), `${k}: break-even per day = fixed ÷ contribution ÷ days`);
  assert.equal(sam.breakeven.per_month, Math.ceil(fixed / contribution));
  assert.ok(sam.breakeven.formula.includes(fixed.toLocaleString("en-US")), `${k}: formula shows the exact fixed costs`);
  for (const m of sam.months) {
    assert.ok(Math.abs(m.costs - (fixed + m.revenue * (1 - A("gross_margin_pct") / 100))) <= 1, `${k}: month ${m.month} costs`);
  }
  let cash = -A("startup_cost");
  for (const m of sam.months) {
    cash += m.revenue - m.costs;
    assert.ok(Math.abs(m.cash - cash) <= 1, `${k}: cumulative cash month ${m.month}`);
  }
  const y1 = sam.months.reduce((t: number, m: Any) => t + m.revenue - m.costs, 0);
  assert.equal(sam.sensitivity[0].base.year1_result, Math.round(y1), `${k}: sensitivity base = the model`);
  assert.ok(sam.sensitivity.every((x: Any, i: number, a: Any[]) => i === 0 || a[i - 1].swing >= x.swing), "sorted by swing");
  assert.equal(sam.key_assumption, sam.sensitivity[0].key);
  assert.equal(sam.headroom.multiple, Math.round((A("customers_per_day_m12") / sam.breakeven_units_per_day) * 10) / 10);
  const lo = sam.launch_offer;
  assert.ok(lo.price > 0 && lo.price < lo.normal_price, `${k}: launch price under list`);
  assert.ok(lo.contribution > 0, `${k}: the launch offer still leaves money`);
  assert.ok(lo.limit >= r.mia.gate.target, `${k}: enough launch units to hit Mia's gate`);
  assert.equal(lo.revenue_if_sold_out, Math.round(lo.price * lo.limit * 100) / 100);
  // re-deriving gives the same model (server and client agree, F18)
  assert.deepEqual(deriveSam(mockFor("sam", idea)).months.length, 12);

  // Mia: the gate is a number in the brief, the plan is sequenced and measurable.
  assert.ok(r.mia.brief.goal.includes(String(r.mia.gate.target)), `${k}: goal contains the gate number`);
  assert.ok(r.mia.checklist.length >= 8 && r.mia.checklist.length <= 12);
  assert.ok(r.mia.checklist.every((t: Any) => /\d/.test(t.done_when) || /\b(one|two|three|four|five|six|ten|every|written down|chosen|ready|live|bookable)\b/i.test(t.done_when)), `${k}: done_when is countable`);
  assert.ok([1, 2, 3, 4].every((w) => r.mia.checklist.some((t: Any) => t.week === w)), `${k}: every week has work`);

  // Memo quotes the real numbers.
  const bePace = sam.breakeven_units_per_day >= 1 ? String(sam.breakeven_units_per_day) : String(Math.ceil(sam.breakeven_units_per_day * 30));
  assert.ok(r.memo.verdict_line.includes(bePace), `${k}: memo quotes the derived break-even pace (${bePace})`);
  // v6 polish: a sales test the plan calls a pass/stop line is a real business pace, never a token number.
  const testPace: Record<string, [RegExp, number]> = { coffee: [/under (\d+) cups a morning/, 1], bikes: [/more than (\d+) hours/, 0], bread: [/under (\d+) of (\d+) seats/, 0], dog: [/under (\d+) of (\d+) trial walks/, 0] };
  if (k === "coffee") {
    const n = Number(leo.kill_criteria.join(" ").match(testPace.coffee[0])?.[1]);
    assert.ok(n >= sam.breakeven_units_per_day * 0.5, `coffee: the cart's stop line (${n}) is at least half the break-even pace`);
  }
  // unsourced signals never claim 8+
  assert.ok(leo.signals.every((s: Any) => s.source_id != null || s.score <= 7.5), `${k}: unsourced signals capped`);
  // labour is in the fixed costs when the founder works in it
  assert.ok(sam.fixed_costs_breakdown.some((l: Any) => /founder/i.test(l.label)), `${k}: the founder's pay is a cost line`);
  assert.equal(r.memo.next_7_days.length, 3);
  assert.deepEqual(mockMemo(idea, r), r.memo);

  // Build stage (when the sample is built): Dex and Rae sell exactly Sam's launch offer.
  const built = sampleProject(k, { id: k + "b", slug: k, now: Date.UTC(2026, 10, 16, 9), upTo: "build" }, sanitize).results as Any;
  assert.equal(built.dex.landing.offer_price, lo.price, `${k}: page price = Sam's launch price`);
  assert.equal(built.dex.landing.normal_price, lo.normal_price);
  assert.ok(built.dex.landing.cta.includes(lo.display), `${k}: CTA shows the launch price`);
  const priceTxt = lo.display.replace(".00", "");
  assert.ok(built.rae.posts.some((x: Any) => x.caption.includes(priceTxt) || x.hook.includes(priceTxt)), `${k}: Rae sells the same price`);
  assert.equal(built.nova.names.length, 3);
  assert.ok(built.nova.positioning.startsWith("For "), `${k}: positioning line`);
  assert.equal(new Set(built.dex.logos.map((l: Any) => l.shape)).size, 3, `${k}: three genuinely different logo shapes`);
  // logo concepts only describe what the renderer draws (glyph)
  const GLYPH_WORDS: Record<string, RegExp> = { pause: /pause bars/i, roundel: /roundel/i, loop: /arrow|loop/i, loaf: /loaf/i, route: /route|loop/i, tile: /tile/i, stop: /full stop/i, none: /wordmark/i };
  for (const l of built.dex.logos) assert.ok(GLYPH_WORDS[l.glyph]?.test(l.concept), `${k}: logo concept matches its glyph (${l.glyph}): ${l.concept}`);
  assert.ok(!/guarantee/i.test(built.dex.landing.bullets.join(" ")), `${k}: bullets promise nothing uncosted`);
  // Rae never sells the offer before the plan opens pre-orders
  const preWeek = Math.min(...r.mia.checklist.filter((x: Any) => /pre-?order/i.test(x.task + " " + x.how)).map((x: Any) => x.week));
  if (Number.isFinite(preWeek)) assert.ok(built.rae.posts.filter((x: Any) => (x.caption + x.hook).includes(priceTxt)).every((x: Any) => Math.ceil(x.day / 7) >= preWeek - (k === "coffee" ? 0 : 1)), `${k}: the offer appears from the pre-order week`);
  assert.equal(built.dex.landing.bullets.length, 3);
  assert.equal(built.dex.landing.faq.length, 3);
  assert.ok(built.rae.posts.length >= 10 && built.rae.first_posts.length === 3);
  // posts only on open days: start date is a Monday; kiosk closed Sundays, walks weekdays only.
  assert.equal(new Date(built.rae.start_date + "T12:00:00Z").getUTCDay(), 1, "calendar starts on a Monday");
  const dow = (day: number) => (day - 1) % 7; // 0 = Monday
  if (k === "coffee") assert.ok(built.rae.posts.every((x: Any) => dow(x.day) !== 6), "coffee: no Sunday posts");
  if (k === "dog") assert.ok(built.rae.posts.every((x: Any) => dow(x.day) < 5), "dog: weekdays only");

  // Honesty: no URLs, no testimonials, no "survey"/"study" claims anywhere in the sample.
  const text = JSON.stringify(built);
  assert.ok(!/https?:\/\//.test(text), `${k}: no URLs`);
  assert.ok(!/\b(survey|study|studies|report says|according to)\b/i.test(text), `${k}: no invented research`);
}

// v6 polish: the honest no. The validate-only sample is a No-go whose plan never reaches break-even.
{
  const g = sampleProject("games", { id: "g", now: Date.UTC(2026, 10, 16, 9), upTo: "build" }, sanitize).results as Any;
  assert.equal(g.leo.verdict, "no-go");
  assert.ok(!g.nova && !g.pip, "games: never built");
  assert.ok(g.sam.headroom.multiple < 1, "games: the plan stays under break-even");
  assert.ok(g.memo.verdict_line.includes(String(g.sam.breakeven_units_per_day)), "games: memo quotes break-even");
  assert.ok(g.leo.pivot && g.leo.pivot.idea.length > 0);
}

// sanitizer: the score cannot be typed, the verdict cannot be argued, a pivot is filled in.
const fake = { ...mockFor("leo"), score: 9.9, verdict: "go" as const, pivot: null, signals: mockFor("leo").signals.map((s) => ({ ...s, score: 5 })) };
const fs = sanitize("leo", fake) as Any;
assert.equal(fs.score, 5);
assert.equal(fs.verdict, "pivot");
assert.ok(fs.pivot && fs.pivot.idea.length > 0);
assert.equal(sanitize("leo", { ...fake, signals: fake.signals.map((s) => ({ ...s, score: 4 })) }).verdict, "no-go");

// sanitizer: Sam's breakdown wins over a fixed-costs figure that does not add up; offer stays one sane unit.
const sd = mockFor("sam");
sd.assumptions = sd.assumptions.map((a) => (a.key === "fixed_costs_month" ? { ...a, value: 99999 } : a));
sd.launch_offer = { item: "x", price: 50, normal_price: 3, limit: 0 };
const ss = sanitize("sam", sd) as Any;
assert.equal(ss.assumptions.find((a: Any) => a.key === "fixed_costs_month").value, 11500);
assert.ok(ss.launch_offer.price < ss.launch_offer.normal_price && ss.launch_offer.limit >= 1);

// sanitizer: Dex's page is rewritten to Sam's launch offer when it drifts (Dex and Rae run in parallel).
const prior = { sam: sanitize("sam", mockFor("sam")) };
const dx = mockFor("dex");
dx.landing.offer_price = 1.1;
const ds = sanitize("dex", dx, { prior });
assert.equal(ds.landing.offer_price, 2.4);
assert.equal(ds.landing.cta, "Pre-order for €2.40");

// cap(): long text is cut, short text untouched.
assert.equal(cap("One two three.", 5), "One two three.");
assert.ok(cap("a ".repeat(40), 10).endsWith("…"));

// orchestration: groups cover each stage exactly once, in dependency order.
for (const st of ["validate", "build"] as const) assert.deepEqual(STAGE_GROUPS[st].flat(), STAGE_DEPTS[st]);
assert.deepEqual(STAGE_GROUPS.build[1], ["dex", "rae"], "Dex and Rae run in parallel");

// example pack: Pausa, with the v6 extras.
const ex = exampleProject(Date.now(), sanitize) as Any;
assert.equal(ex.results.pip.slug, "pausa");
assert.equal(ex.results.nova.names[0].name, "Pausa");
assert.ok(ex.results.sam.launch_offer && ex.results.leo.kill_criteria && ex.results.mia.gate);

console.log("quality invariants: all passed");
