// WP3 · Marketing plan v2: honesty rules in code, schema shape, saved real fixtures, mock path. Zero spend.
// Run: node_modules/.bin/tsx test/marketing.test.ts
import assert from "node:assert/strict";
process.env.MOCK_AI = "1";
process.env.DATABASE_URL ??= ":memory:";

const { cleanPlan, saneDays, withValidateFirst, checksAfterInputs, fitReserve, garbled, usedSources, PLAN_SCHEMA, PLAN_SCHEMA_A, PLAN_SCHEMA_B, BANNED, COPY_LIMITS, assumeWord } = await import("../server/marketing/schema.js");
const { templatePlan } = await import("../server/kit-templates.js");
const { planMarketing, loadFixture, fixtureKeyFor, mergeSources, promptA, promptB, FIXTURE_KEYS, offerLine, placeLine, onlineEvents } = await import("../server/marketing/plan.js");
const { gateReason } = await import("../server/marketing/schema.js");
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
  const mx = promptA({ ...f.input, brand: { ...f.input.brand, currency: "MX$" } }, { notes: [], sources: [], queries: [], ok: false }, sources);
  assert.match(mx, /exactly 3 tiers: 0, 2000 and 10000 MX\$/);
  const tp = (currency: string) => templatePlan({ ...f.input, brand: { ...f.input.brand, currency } } as never).budget.tiers.map((t) => [t.amount, t.lines.reduce((x, l) => x + l.amount, 0)]);
  assert.deepEqual(tp("€"), [[0, 0], [100, 100], [500, 500]], "fallback plan budget unchanged in euros");
  assert.deepEqual(tp("MX$"), [[0, 0], [2000, 2000], [10000, 10000]], "fallback plan budget in pesos");
  assert.match(promptA({ ...f.input, brand: { ...f.input.brand, currency: "$" } }, { notes: [], sources: [], queries: [], ok: false }, sources), /exactly 3 tiers: 0, 100 and 500 \$/);
  assert.match(a, /\[1\]/);
  assert.match(a, /Spanish/);
  assert.match(a, /Suponemos/);
  const b = promptB(f.input, { notes: [], sources: [], queries: [], ok: false }, sources, { channels: [] });
  assert.match(b, /<strategy>/);
});

await test("sanity pass: channel follows the copy text, garbled tasks fall back to a template line", () => {
  const base = loadFixture("bikes-en")!.result.plan as PlanV2;
  const plan = structuredClone(base);
  plan.lang = "en";
  plan.channels = [{ ...plan.channels[0]!, name: "Kiosk sign and counter card" }, ...plan.channels.slice(1)];
  plan.weeks[0]!.days = [
    { day: 1, time: "", channel: "Kiosk sign and counter card", action: "Update the Google Business Profile with the kiosk description.", copy: "profile", hours: 1 },
    { day: 2, time: "", channel: "Kiosk sign and counter card", action: "the the", copy: null, hours: 1 },
    { day: 3, time: "", channel: "Kiosk sign and counter card", action: "Write the price on the kiosk sign and put the QR card on the counter.", copy: null, hours: 1 },
  ];
  const w: string[] = [];
  const out = saneDays(plan, [{ day: 2, time: "", channel: "By hand", action: "Count your reservations and write down what people asked.", copy: null, hours: 1 }], w);
  const d = out.weeks[0]!.days;
  assert.equal(d[0]!.channel, "Google Business Profile");
  assert.equal(d[1]!.action, "Count your reservations and write down what people asked.");
  assert.equal(d[2]!.channel, "Kiosk sign and counter card");
  assert.equal(w.length, 2);
  assert.ok(garbled("Send to [S3] the"));
  assert.ok(!garbled("Hand every buyer a stamp card with the pre-order QR on the back."));
});

await test("a No-go plan starts with the report's validate-first checks; Go is unchanged", () => {
  const plan = structuredClone(loadFixture("bikes-en")!.result.plan as PlanV2);
  const gate = { verdict: "no-go" as const, mainReason: "The permit route is unknown.", validateFirst: [{ what: "A kiosk permit can be granted at the metro exit", how: "Ask the city hall in writing which permit applies.", passIf: "A written procedure exists." }] };
  const out = withValidateFirst(plan, gate);
  const first = out.weeks[0]!.days[0]!;
  assert.equal(first.day, 1);
  assert.equal(first.channel, "Check first");
  assert.match(first.action, /^Before you open or spend money: Ask the city hall/);
  assert.match(first.action, /Go ahead only if: a written procedure exists\./);
  assert.ok(out.weeks[0]!.days.slice(1).every((d) => d.day > 1 && d.day <= 7));
  const go = withValidateFirst(plan, { ...gate, verdict: "go" });
  assert.deepEqual(go.weeks, plan.weeks, "Go: the writer's days are unchanged");
  assert.equal(go.gate?.verdict, "go", "Go: the checks are still shown first");
  assert.equal(out.gate?.verdict, "no-go");
  assert.equal(out.gate?.reason, "The permit route is unknown.");
  assert.deepEqual(out.gate?.checks, [{ what: "A kiosk permit can be granted at the metro exit", passIf: "A written procedure exists.", day: 1 }]);
  assert.deepEqual(withValidateFirst(out, gate).weeks[0]!.days.length, out.weeks[0]!.days.length, "not added twice");
  const f = loadFixture("bakery-es")!;
  const a = promptA({ ...f.input, report: { ...f.input.report, ...gate } } as never, { notes: [], sources: [], queries: [], ok: false }, []);
  assert.match(a, /<report_verdict verdict="no-go">The permit route is unknown\.<\/report_verdict>/);
  assert.match(a, /confirm the permit before opening day/);
  assert.match(a, /"Check 1:"/, "the writer is asked to number the checks so they can be matched");
  // the verdict word and in-words sources never reach the writer as part of the reason
  const b = promptA({ ...f.input, report: { ...f.input.report, ...gate, verdict: "pivot", mainReason: "Test first: €3 sits below Syra Coffee's €3.90 flat white (barcelonatourism.org, August 2026; no source id)." } } as never, { notes: [], sources: [], queries: [], ok: false }, []);
  assert.match(b, /<report_verdict verdict="test first">€3 sits below Syra Coffee's €3\.90 flat white\.<\/report_verdict>/);
});

// Real run, 16 Nov (e2e project xkUVNypbKZ, yoga for seniors in Ruzafa, Test first): the writer's Spanish plan already
// ran the report's checks ("Comprobación 2" on day 2, "3" on day 3, "1" on day 14), but the old key-word match only
// compared English check text with Spanish days, so it added three days mixing English into the Spanish plan.
await test("real yoga plan: numbered checks count as covered; a check in another language is referred to by number", () => {
  const E2E_DAYS = [
    { day: 1, time: "", channel: "Boca a boca entre asistentes", action: "Llama al 963 812 337 y pide hablar con la dirección. Propón una clase de prueba en una sala del centro o de una asociación cercana, y pregunta si hace falta permiso por escrito para dar yoga allí.", copy: null, hours: 1 },
    { day: 2, time: "", channel: "Boca a boca entre asistentes", action: "Comprobación 2: pide precio a dos profesoras certificadas para una clase suave de 60 minutos. Se pasa si alguna cobra 45 € o menos por clase.", copy: null, hours: 1 },
    { day: 3, time: "", channel: "Visita al centro de mayores de Ruzafa", action: "Comprobación 3: consigue por escrito que se puede dar yoga en la sala prestada, ya sea la del centro o la de una asociación. Sin ese papel no se abre nada.", copy: null, hours: 1 },
  ];
  const W2 = [{ day: 14, time: "", channel: "Clases de prueba en sala prestada", action: "Mira cuántas plazas hay pagadas. Comprobación 1: se pasa con 15 plazas pagadas en 14 días desde la apertura. Si no se llega, para y no gastes más.", copy: null, hours: 1 }];
  const VALIDATE_FIRST = [
    { what: "Adults aged 65+ in Ruzafa and nearby will pay 12 € for a small-group gentle yoga seat, at least once a week", how: "Run a free or 12 € trial class in a borrowed room, such as a community centre or senior association space near Ruzafa, and sell pre-paid seats for four weekly classes.", passIf: "At least 15 pre-paid seats sold within 14 days of the offer." },
    { what: "Instructor cost per class stays low enough for each seat to contribute", how: "Get quotes from at least two certified yoga teachers for a 60-minute gentle class, and record attendance at each pilot class.", passIf: "Instructor pay of 45 € or less per 60-minute class, and an average of at least 5 paid seats per class across four pilot classes." },
    { what: "A studio of the size needed can be rented near Ruzafa at a cost that the seat volume can carry", how: "Request quotes for three to five premises of about 60 m² in and around Ruzafa, and confirm the licence status and the acoustic zone rules with the city.", passIf: "A monthly rent of 1,300 € or less for a space that holds at least 6 mats, and written confirmation that a yoga use is permitted there." },
  ];
  const base = structuredClone(loadFixture("bakery-es")!.result.plan as PlanV2);
  const plan: PlanV2 = { ...base, lang: "es", weeks: [{ ...base.weeks[0]!, days: E2E_DAYS }, { ...base.weeks[1]!, days: W2 }, ...base.weeks.slice(2)] };
  const gate = { verdict: "pivot" as const, mainReason: "Test first: The citywide senior population is large, but no neighbourhood-level 65+ count for Ruzafa was found, so the core customer is unproven in the target area.", validateFirst: VALIDATE_FIRST };
  const out = withValidateFirst(plan, gate);
  assert.deepEqual(out.weeks, plan.weeks, "nothing added: every check is already in the plan");
  assert.deepEqual(out.gate?.checks.map((c) => c.day), [14, 2, 3]);
  assert.equal(out.gate?.reason, "The citywide senior population is large, but no neighbourhood-level 65+ count for Ruzafa was found, so the core customer is unproven in the target area.");
  // without the numbers, the checks are added in Spanish only (no English sentence inside the Spanish plan)
  const bare: PlanV2 = { ...plan, weeks: plan.weeks.map((w) => ({ ...w, days: w.days.map((d) => ({ ...d, action: d.action.replace(/Comprobación \d: /, "") })) })) };
  const o2 = withValidateFirst(bare, gate);
  const added = o2.weeks[0]!.days.filter((d) => d.channel === "Comprobar primero");
  assert.equal(added.length, 3);
  assert.match(added[0]!.action, /^Antes de abrir o gastar dinero: haz la comprobación 1 del informe/);
  for (const d of added) assert.doesNotMatch(d.action, /\b(the|and|with|Run|Get|Request)\b/, d.action);
  assert.deepEqual(o2.gate?.checks.map((c) => c.day), [1, 2, 3]);
  assert.ok(o2.weeks[0]!.days.filter((d) => d.channel !== "Comprobar primero").every((d) => d.day > 3), "the writer's days move after the checks");
});

await test("a rejected channel gets no budget; first actions carry no day number", () => {
  const ch = (name: string) => ({ name, role: "awareness", why: "because", source: 0, weekly_hours: 1, cost: 0, first_action: "Day 3: send the first 25" });
  const { plan, warnings } = cleanPlan(
    {
      channels: ["Direct email to shops", "Forum posts", "Waitlist email"].map(ch),
      rejected: [{ name: "Paid newsletter sponsorships", why_not: "too dear" }],
      budget: { tiers: [{ amount: 100, label: "b", lines: [{ channel: "Forum posts", amount: 55, for: "x" }, { channel: "Paid newsletter sponsorships", amount: 35, for: "y" }] }, { amount: 500, label: "c", lines: [{ channel: "Forum posts", amount: 450, for: "x" }] }, { amount: 0, label: "a", lines: [] }], reserve_pct: 15, reallocate_rule: "" },
      weeks: [],
      kpis: [],
    },
    SRC,
    ctx,
  );
  const t100 = plan.budget.tiers.find((t) => t.amount === 100)!;
  assert.deepEqual(t100.lines.map((l) => l.channel), ["Forum posts"]);
  assert.ok(warnings.some((w) => /rejected channel/.test(w)));
  assert.equal(plan.channels[0]!.first_action, "Send the first 25");
});

// q3: budget lines keep the reserve aside (new plans only)
await test("new plans: each tier's lines fit the tier minus the reserve; saved fixtures are not re-cut", async () => {
  const base = structuredClone(loadFixture("bakery-es")!.result.plan as PlanV2);
  // the val0 newsletter plan: 15% reserve, the 100 tier spent 90 and the 500 tier 450
  const plan: PlanV2 = { ...base, budget: { reserve_pct: 15, reallocate_rule: "x", tiers: [
    { amount: 0, label: "Free", lines: [{ channel: "Email", amount: 0, for: "time" }, { channel: "Forums", amount: 0, for: "time" }] },
    { amount: 100, label: "Small", lines: [{ channel: "Page", amount: 30, for: "domain" }, { channel: "Newsletter", amount: 25, for: "platform" }, { channel: "Sponsor", amount: 35, for: "slot" }] },
    { amount: 500, label: "Larger", lines: [{ channel: "Page", amount: 50, for: "tools" }, { channel: "Newsletter", amount: 50, for: "platform" }, { channel: "Sponsor", amount: 350, for: "slot" }, { channel: "Extra", amount: 20, for: "x" }] },
  ] } };
  const w: string[] = [];
  const out = fitReserve(plan, w);
  for (const t of out.budget.tiers) assert.ok(t.lines.reduce((s, l) => s + l.amount, 0) <= t.amount * 0.85, `tier ${t.amount}`);
  assert.deepEqual(out.budget.tiers[0]!.lines.map((l) => l.amount), [0, 0], "time-only lines stay");
  assert.deepEqual(out.budget.tiers[1]!.lines.map((l) => l.amount), [30, 25, 30], "cut from the last (lowest-priority) line");
  assert.deepEqual(out.budget.tiers[2]!.lines.map((l) => [l.channel, l.amount]), [["Page", 50], ["Newsletter", 50], ["Sponsor", 325]], "a line cut to 0 is dropped");
  assert.equal(w.length, 2);
  assert.deepEqual(fitReserve(out, []), out, "idempotent");
  // a plan that already fits is unchanged
  const ok = { ...plan, budget: { ...plan.budget, reserve_pct: 0 } };
  assert.deepEqual(fitReserve(ok, []).budget.tiers.map((t) => t.lines.length), [2, 3, 4]);
  // the saved real fixtures (bakery-es 500 tier: 460 with 12% kept) come back exactly as saved in demo mode
  for (const key of FIXTURE_KEYS) {
    const f = loadFixture(key)!;
    const r = await planMarketing(f.input, { mock: true });
    assert.deepEqual(r.plan.budget, f.result.plan.budget, `${key}: saved budget untouched`);
  }
});

await test("a check is judged after the days that produce its result, in the report's order (val0 #9)", () => {
  const base = structuredClone(loadFixture("bikes-en")!.result.plan as PlanV2);
  const d = (day: number, action: string) => ({ day, time: "", channel: "Direct email", action, copy: null, hours: 1 });
  // the val0 newsletter calendar: Check 3 on day 1, Check 2 on day 3 (its owner answers come on day 12), Check 1 on day 6
  const W1 = [
    d(1, "Check 3: Price the real newsletter platform, payment processor and hosting for one month. Pass mark: contribution of 96% or higher."),
    d(2, "Read ten recent crypto threads on Shopify Community and write down the unanswered questions."),
    d(3, "Check 2: Set up a BTCPay Server test store on a real shop and time every step. Pass mark: at least 3 of 5 owners name a step that free docs did not solve, and it is one a paid guide could fix."),
    d(6, "Check 1: Build one page with the $8 price and a BCH pay button. Pass mark: at least 6 of every 100 visitors start the sign-up."),
  ];
  const W2 = [d(8, "Send the waitlist email to the first 25 shops in your sheet."), d(12, "Call five shop owners who replied and ask what they could not solve from free docs. Count how many name a step a paid guide could fix."), d(14, "Send the email to the remaining 75 shops.")];
  const weeks = [{ ...base.weeks[0]!, days: W1 }, { ...base.weeks[1]!, days: W2 }, ...base.weeks.slice(2)];
  const w: string[] = [];
  const out = checksAfterInputs(weeks, w);
  const dayOf = (n: number) => out.flatMap((x) => x.days).find((x) => x.action.startsWith(`Check ${n}:`))!.day;
  assert.equal(dayOf(1), 6, "Check 1 stays (nothing later collects its result)");
  assert.equal(dayOf(2), 13, "Check 2 moves after day 12, where the owner answers come in");
  assert.equal(dayOf(3), 13, "Check 3 keeps the order: never before Check 2");
  const wk2 = out[1]!.days.map((x) => x.action.slice(0, 8));
  assert.ok(wk2.indexOf("Check 2:") < wk2.indexOf("Check 3:") && out[1]!.days.every((x, i, a) => i === 0 || a[i - 1]!.day <= x.day), "week 2 in day order, Check 2 before Check 3");
  assert.equal(out[0]!.days.length, 2);
  assert.equal(w.length, 2);
  assert.deepEqual(checksAfterInputs(out, []), out, "idempotent");
  // through cleanPlan, then the gate reads the new days
  const { plan } = cleanPlan({ ...base, weeks }, SRC, { lang: "en", currency: "USD" });
  const gated = withValidateFirst(plan, { verdict: "pivot", mainReason: "x", validateFirst: [1, 2, 3].map((i) => ({ what: `Check what ${i}`, how: `How ${i}.`, passIf: `Pass ${i}.` })) });
  assert.deepEqual(gated.gate!.checks.map((c) => c.day), [6, 13, 13]);
  // a plan without numbered checks is untouched
  assert.deepEqual(checksAfterInputs(base.weeks, []), base.weeks);
  // the prompt: a pass mark is a target, not the current estimate, judged when its result exists
  const f = loadFixture("bikes-en")!;
  const a = promptA({ ...f.input, report: { ...f.input.report, verdict: "pivot", mainReason: "x", validateFirst: [] } } as never, { notes: [], sources: [], queries: [], ok: false }, []);
  assert.match(a, /pass mark is a target the test must reach/);
  assert.match(a, /never the report's current estimate restated/);
  assert.match(promptB({ ...f.input, report: { ...f.input.report, verdict: "go", validateFirst: [] } } as never, { notes: [], sources: [], queries: [], ok: false }, [], {}), /after the days that collect it/);
});

await test("q3: a free offer is never sold in BCH; marketplace buyers stay on the marketplace; online plans have no town", () => {
  const f = loadFixture("bikes-en")!;
  const R = { notes: [], sources: [], queries: [], ok: false };
  const free = { ...f.input, idea: "A free mobile app where neighbours lend tools to each other, earning from a $2 insurance fee per loan", brand: { ...f.input.brand, city: undefined }, report: { ...f.input.report, offer: { what: "Free early access", price: 0, free: true }, verdict: "pivot", mainReason: "x", validateFirst: [] } };
  const a = promptA(free as never, R, []);
  assert.match(a, /The offer is free: the website collects free early-access sign-ups by email and has NO payment button/);
  assert.doesNotMatch(a, /The founder takes payments in Bitcoin Cash/);
  assert.doesNotMatch(a, /its BCH reserve button are live/);
  assert.match(a, /count_from is one of: website, by hand/);
  assert.match(a, /free sign-ups through it are the demand test/);
  assert.match(a, /sells online, to buyers anywhere in its country/);
  assert.match(a, /online only \(this business has no town\)/);
  // priced, with a town: the old BCH line and no online note
  assert.match(offerLine(f.input), /^The founder takes payments in Bitcoin Cash \(BCH\) on their own website: each pre-order or booking is one payment they can count\.$/);
  assert.equal(placeLine({ brand: { ...f.input.brand, city: "Leeds" } } as never), "");
  // Etsy: no off-Etsy pay links
  const etsy = offerLine({ ...f.input, idea: "Handmade ceramic mugs sold on Etsy from Portland, Oregon, $38 each" });
  assert.match(etsy, /Never send Etsy buyers off Etsy to pay/);
  // one pass mark per check, runnable inside the 30 days
  const pa = promptA({ ...f.input, report: { ...f.input.report, verdict: "pivot", mainReason: "x", validateFirst: [] } } as never, R, []);
  assert.match(pa, /One pass mark per check/);
  assert.match(pa, /Every check must be runnable inside these 30 days with this budget/);
  assert.match(promptB(f.input, R, [], {}), /Every task fits its day/);
  // in-person events are dropped for an online business
  const w: string[] = [];
  const ev = onlineEvents([{ name: "Culver City Old Tool Swap Meet", date: "2026-11-21", where: "Culver City, CA", source: 1 }, { name: "Maker livestream", date: "2026-11-25", where: "Online (YouTube)", source: 2 }], w);
  assert.deepEqual(ev.map((e) => e.name), ["Maker livestream"]);
  assert.equal(w.length, 1);
});

await test("q3: '(?)' never reaches the gate reason; post channels keep their full name", () => {
  assert.equal(gateReason("Test first: The research found no Telegram tax-reminder competitors (?)."), "The research found no Telegram tax-reminder competitors.");
  const base = structuredClone(loadFixture("bikes-en")!.result.plan as PlanV2);
  const long = "Direct replies in tax and payment threads";
  const { plan } = cleanPlan({ ...base, copy: { ...base.copy, posts: base.copy.posts.map((p, i) => (i === 1 ? { ...p, channel: long } : p)) } }, SRC, { lang: "en", currency: "USD" });
  assert.equal(plan.copy.posts[1]!.channel, long);
});

await test("q3: the copy a day uses is kept when the task fits it; a channel the task names keeps its label", () => {
  const base = structuredClone(loadFixture("bikes-en")!.result.plan as PlanV2);
  const channels = ["Survey and short interviews with freelancers", "Paid subscribers' feedback and renewals", "Etsy shop test", "Studio and potter circles"].map((name) => ({ ...base.channels[0]!, name }));
  const d = (day: number, channel: string, copy: string, action: string) => ({ day, time: "", channel, action, copy: copy as never, hours: 1 });
  const days = [
    d(2, channels[0]!.name, "message", "Send a five-question survey link to 30 freelancers who report crypto income."),
    d(21, channels[1]!.name, "email", "Message each pre-order buyer with one question: did the reminder come at a useful time?"),
    d(25, channels[1]!.name, "message", "Ask buyers what they would change and whether they plan to continue at $5 a month."),
    d(1, "Etsy shop test", "profile", "List 6 to 8 mugs at $38 on Etsy with clear photos of glaze and size, and fill in the shop About section."),
  ];
  const plan = { ...base, channels, weeks: [{ ...base.weeks[0]!, days }, ...base.weeks.slice(1).map((w) => ({ ...w, days: [] }))] };
  const w: string[] = [];
  const out = saneDays(plan, [], w).weeks[0]!.days;
  assert.deepEqual(out.map((x) => x.copy), ["message", "email", "message", "profile"], w.join("; "));
  assert.equal(out[3]!.channel, "Etsy shop test", "not relabelled 'Google Business Profile'");
});

await test("q3: a day that measures a check is not an input that pushes the check after it (val2 #3)", () => {
  const base = structuredClone(loadFixture("bikes-en")!.result.plan as PlanV2);
  const d = (day: number, action: string) => ({ day, time: "", channel: "Neighbourhood groups", action, copy: null, hours: 1 });
  const W1 = [d(7, "Check 1: Offer the $2 cover on 40 tool requests in the groups. Pass mark: at least 10 of 40 borrowers pay the $2 cover.")];
  const W4 = [d(28, "Count the borrowers who paid the $2 cover out of the 40 requests. Check 1 passes only if at least 10 of 40 borrowers paid.")];
  const weeks = [{ ...base.weeks[0]!, days: W1 }, base.weeks[1]!, base.weeks[2]!, { ...base.weeks[3]!, days: W4 }];
  const w: string[] = [];
  const out = checksAfterInputs(weeks, w);
  assert.equal(out.flatMap((x) => x.days).find((x) => x.action.startsWith("Check 1:"))!.day, 7);
  assert.equal(w.length, 0);
});

console.log(`marketing: ${n} tests passed`);
