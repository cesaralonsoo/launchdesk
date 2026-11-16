// WP3 · Marketing plan v2: honesty rules in code, schema shape, saved real fixtures, mock path. Zero spend.
// Run: node_modules/.bin/tsx test/marketing.test.ts
import assert from "node:assert/strict";
process.env.MOCK_AI = "1";
process.env.DATABASE_URL ??= ":memory:";

const { cleanPlan, usedSources, PLAN_SCHEMA, PLAN_SCHEMA_A, PLAN_SCHEMA_B, BANNED, COPY_LIMITS, assumeWord } = await import("../server/marketing/schema.js");
const { planMarketing, loadFixture, fixtureKeyFor, mergeSources, promptA, promptB, FIXTURE_KEYS } = await import("../server/marketing/plan.js");
const { locationOf, researchPrompt } = await import("../server/marketing/research.js");
type PlanV2 = import("../server/marketing/schema.js").PlanV2;

let n = 0;
const test = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    n++;
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
};
const SRC = [1, 2, 3].map((n) => ({ n, url: `https://example.org/${n}`, title: `Page ${n}` }));
const ctx = { lang: "es", currency: "EUR" };

await test("the two writer schemas cover the whole plan, disjointly", () => {
  const all = Object.keys(PLAN_SCHEMA.properties).sort();
  const a = Object.keys(PLAN_SCHEMA_A.properties);
  const b = Object.keys(PLAN_SCHEMA_B.properties);
  assert.deepEqual([...a, ...b].sort(), all);
  assert.equal(a.filter((k) => b.includes(k)).length, 0);
  assert.deepEqual(PLAN_SCHEMA_A.required.sort(), a.sort());
});

await test("unsourced local facts become assumptions; unknown sources removed; events need a source", () => {
  const { plan, warnings } = cleanPlan(
    {
      channels: [{ name: "Vecinos", role: "first sales", why: "Ya compran pan", source: 9, weekly_hours: 3, cost: 0, first_action: "Hablar" }],
      local: [{ fact: "Hay un mercado los sábados", source: 2 }, { fact: "Hay 25.000 vecinos", source: 0 }, { fact: "Inventado", source: 7 }],
      events: [{ name: "Fira", date: "1 dic", where: "Gràcia", source: 3 }, { name: "Fake fest", date: "2 dic", where: "X", source: 0 }],
      customer: { who: "x", places: [{ place: "Plaça del Sol", when: "sábado", source: 4 }] },
    },
    SRC,
    ctx,
  );
  assert.deepEqual(plan.local, [{ fact: "Hay un mercado los sábados", source: 2 }]);
  assert.ok(plan.assumptions.includes("Hay 25.000 vecinos") && plan.assumptions.includes("Inventado"));
  assert.deepEqual(plan.events.map((e) => e.name), ["Fira"]);
  assert.equal(plan.channels[0]!.source, null);
  assert.equal(plan.customer.places[0]!.source, null);
  assert.ok(warnings.some((w) => /unknown source 9/.test(w)));
  assert.deepEqual(usedSources(plan), [2, 3]);
});

await test("budget lines never exceed their tier; tiers sorted; days in order; ≤5 KPIs; ≤4 channels", () => {
  const ch = (i: number) => ({ name: `C${i}`, role: "awareness", why: "porque sí", source: 0, weekly_hours: 1, cost: 0, first_action: "x" });
  const { plan, warnings } = cleanPlan(
    {
      channels: [1, 2, 3, 4, 5].map(ch),
      budget: { tiers: [{ amount: 500, label: "c", lines: [] }, { amount: 100, label: "b", lines: [{ channel: "C1", amount: 150, for: "x" }, { channel: "C2", amount: 50, for: "y" }] }, { amount: 0, label: "a", lines: [] }], reserve_pct: 80, reallocate_rule: "" },
      weeks: [{ theme: "t", aim: "a", days: [{ day: 9, time: "9:00", channel: "C1", action: "b", copy: "", hours: 1 }, { day: 2, time: "9:00", channel: "C1", action: "a", copy: "flyer", hours: 1 }] }],
      kpis: [1, 2, 3, 4, 5, 6].map((i) => ({ name: `K${i}`, target: "1", how_to_count: "x", count_from: "nope" })),
    },
    SRC,
    ctx,
  );
  assert.equal(plan.channels.length, 4);
  assert.deepEqual(plan.budget.tiers.map((t) => t.amount), [0, 100, 500]);
  const t100 = plan.budget.tiers[1]!;
  assert.ok(t100.lines.reduce((s, l) => s + l.amount, 0) <= 100);
  assert.ok(plan.budget.reserve_pct <= 30);
  assert.deepEqual(plan.weeks[0]!.days.map((d) => d.day), [2, 9]);
  assert.equal(plan.weeks[0]!.days[0]!.copy, "flyer");
  assert.equal(plan.weeks[0]!.days[1]!.copy, null);
  assert.equal(plan.kpis.length, 5);
  assert.equal(plan.kpis[0]!.count_from, "by hand");
  assert.ok(warnings.some((w) => /scaled down/.test(w)));
});

await test("copy limits, [n] markers stripped from prose, banned words reported, English 'we assume' localised", () => {
  const long = Array.from({ length: 120 }, (_, i) => `w${i}`).join(" ");
  const { plan, warnings } = cleanPlan(
    {
      channels: [{ name: "X", role: "proof", why: "We assume que la gente pasa por aquí [2]", source: 0, weekly_hours: 1, cost: 0, first_action: "a" }],
      copy: { posts: [{ channel: "IG", hook: "h", body: long, cta: "c" }], message: "Hola [S3]", email: { subject: "s", body: long + " " + long }, flyer: { headline: "h", lines: ["a", "b", "c", "d"] }, profile: "p".repeat(900), press: "Uno. Dos. Tres. Cuatro." },
      weeks: [{ theme: "t", aim: "a", days: [{ day: 1, time: "", channel: "X", action: "Let's leverage the forum", copy: "", hours: 1 }] }],
    },
    SRC,
    ctx,
  );
  assert.ok(plan.copy.posts[0]!.body.split(/\s+/).length <= COPY_LIMITS.postWords);
  assert.ok(plan.copy.email.body.split(/\s+/).length <= COPY_LIMITS.emailWords);
  assert.ok(plan.copy.profile.length <= COPY_LIMITS.profileChars);
  assert.equal(plan.copy.flyer.lines.length, 3);
  assert.equal(plan.copy.press, "Uno. Dos. Tres.");
  assert.equal(plan.channels[0]!.why, "Suponemos que la gente pasa por aquí");
  assert.equal(assumeWord("es"), "Suponemos");
  assert.ok(warnings.some((w) => /banned phrase "leverage"/.test(w)));
  assert.ok(BANNED.includes("unlock"));
});

await test("an unsourced number in a channel's reason is flagged", () => {
  const { warnings } = cleanPlan({ channels: [{ name: "Ads", role: "awareness", why: "80% of buyers search on Google", source: 0, weekly_hours: 1, cost: 0, first_action: "a" }] }, SRC, { lang: "en", currency: "EUR" });
  assert.ok(warnings.some((w) => /number without a source/.test(w)));
});

await test("research: location from the city, prompt names the city and the 30-day window", () => {
  assert.deepEqual(locationOf("Barcelona"), { country: "ES", city: "Barcelona" });
  assert.equal(locationOf(undefined), null);
  assert.equal(locationOf("Atlantis"), null);
  const f = loadFixture("bakery-es")!;
  const p = researchPrompt(f.input);
  assert.match(p, /in Barcelona/);
  assert.match(p, /next 30 days/);
});

// ───────────────────────────── saved real fixtures

for (const key of FIXTURE_KEYS) {
  await test(`fixture ${key}: real, complete, honest`, () => {
    const f = loadFixture(key);
    assert.ok(f, `fixture ${key} missing`);
    const { plan, sources } = f!.result;
    assert.ok(f!.meta.usd > 0, "a real run has a cost");
    // re-cleaning a saved plan changes nothing and warns about nothing new
    const again = cleanPlan(plan, sources, { lang: plan.lang, currency: plan.currency });
    assert.deepEqual(again.plan, plan);
    assert.equal(again.warnings.length, 0, again.warnings.join("; "));
    assert.ok(plan.goal.target > 0 && plan.goal.metric);
    assert.ok(plan.channels.length >= 3 && plan.channels.length <= 4);
    assert.ok(plan.rejected.length >= 1);
    assert.deepEqual(plan.budget.tiers.map((t) => t.amount), [0, 100, 500]);
    for (const t of plan.budget.tiers) assert.ok(t.lines.reduce((s, l) => s + l.amount, 0) <= t.amount);
    assert.equal(plan.weeks.length, 4);
    for (const w of plan.weeks) assert.ok(w.days.length >= 2 && w.days.every((d) => d.day >= 1 && d.day <= 30));
    assert.ok(plan.kpis.length >= 1 && plan.kpis.length <= 5);
    assert.ok(plan.kpis.some((k) => k.count_from === "bch payments"), "one KPI counts BCH payments");
    assert.equal(plan.copy.posts.length, 3);
    assert.ok(plan.copy.message && plan.copy.email.subject && plan.copy.flyer.headline && plan.copy.profile && plan.copy.press);
    const known = new Set(sources.map((s) => s.n));
    for (const n of usedSources(plan)) assert.ok(known.has(n), `source ${n} exists`);
    for (const s of sources) assert.match(s.url, /^https:\/\//);
    const text = JSON.stringify(plan).toLowerCase();
    for (const b of BANNED) assert.ok(!text.includes(b), `banned "${b}"`);
    assert.ok(!/\[\d+\]/.test(JSON.stringify(plan.copy)), "no [n] in copy");
  });
}

await test("mock path returns the matching saved plan (and a copy, not the cache)", async () => {
  const f = loadFixture("bakery-es")!;
  const r = await planMarketing(f.input);
  assert.equal(r.plan.lang, "es");
  (r.plan as PlanV2).headline = "changed";
  assert.notEqual(loadFixture("bakery-es")!.result.plan.headline, "changed");
  assert.equal(fixtureKeyFor({ idea: "An online shop for restored vintage road bikes, around €450 each", brand: f.input.brand }), "bikes-en");
  assert.equal(fixtureKeyFor({ idea: "A specialty coffee kiosk at a Barcelona metro exit", brand: f.input.brand }), "bakery-es");
  assert.equal(fixtureKeyFor({ idea: "Tax help for freelancers", brand: { ...f.input.brand, city: undefined } }), "bikes-en");
});

await test("prompts carry the rules and the report's sourced numbers", () => {
  const f = loadFixture("bakery-es")!;
  const sources = mergeSources([], f.input);
  assert.equal(sources.length, f.input.report.stats.length);
  const a = promptA(f.input, { notes: [], sources: [], queries: [], ok: false }, sources);
  assert.match(a, /exactly 3 tiers: 0, 100 and 500 EUR/);
  assert.match(a, /\[1\]/);
  assert.match(a, /Spanish/);
  assert.match(a, /Suponemos/);
  const b = promptB(f.input, { notes: [], sources: [], queries: [], ok: false }, sources, { channels: [] });
  assert.match(b, /<strategy>/);
});

console.log(`marketing: ${n} tests passed`);
