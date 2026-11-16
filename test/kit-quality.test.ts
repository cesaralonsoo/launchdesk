// q3 launch-kit quality: subscription table, free/fee ideas get a free waitlist, owner pay counted once, on-topic
// photos, hero label rows kept. Zero spend, zero network. Run: MOCK_AI=1 node_modules/.bin/tsx --test test/kit-quality.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "ld-kitq-"));
Object.assign(process.env, { MOCK_AI: "1", ANTHROPIC_API_KEY: "", DATABASE_URL: `file:${join(dir, "q.db")}`, PHOTO_VISION: "" });
globalThis.fetch = (async (u: unknown) => {
  throw new Error(`unexpected network call: ${String(u)}`);
}) as typeof fetch;

const ai = await import("../server/ai.js");
const { deriveSam } = await import("../server/types.js");
const mocks = await import("../server/mocks.js");
const kit = await import("../server/kit.js");
const { templatePlan, templateSite } = await import("../server/kit-templates.js");
const { validateModelSite } = await import("../server/site/validate.js");
const { renderSite } = await import("../server/site/render.js");
const { customBrief, keepHeroTagRows, heroTagInFlow, demandStats } = await import("../server/site/custom.js");
const { siteDigest } = await import("../server/site/plan.js");
const P = await import("../server/site/photos.js");
type KitInput = import("../server/kit-contract.js").KitInput;
type Draft = import("../server/ai.js").SamDraftV6;

const RUNS = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/sam-q2-runs.json"), "utf8")) as Record<"newsletter" | "splitbill" | "wallets" | "coffeebox", { idea: string; draft: Draft; econ: import("../server/v7.js").EconSummary }>;
const h16 = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);

// ───────────────────────────────────────────── 2. subscription 12-month table
test("non-subscription models are byte-identical to before (hashes from the code at 87c6595)", () => {
  const HEAD: Record<string, [string, string]> = {
    coffee: ["ad254bcb777b1480", "787a2eab46985cb1"],
    dog: ["af3aa6c8784c50aa", "2d5f58926c2cacd9"],
    bikes: ["2eace70014fd1ac4", "471eb20e2c1de457"],
    bread: ["1cc8020f5d6f2f26", "7520aa54472df092"],
    saas: ["ac213c6f8de8a52e", "e22a0ff1bcf8d2b0"], // the mock subscription stays as pinned (mock Sam is never carried over)
  };
  for (const [k, [san, der]] of Object.entries(HEAD)) {
    const idea = mocks.sampleIdea(k as never);
    assert.equal(h16(ai.sanitize("sam", mocks.mockFor("sam", idea), { idea })), san, `${k} sanitize`);
    assert.equal(h16(deriveSam(structuredClone(mocks.mockFor("sam", idea)))), der, `${k} deriveSam`);
  }
  assert.equal(h16(ai.deriveSamV6(structuredClone(RUNS.wallets.draft))), "2ecc81ea9611ecd4", "wallets (per sale)");
  assert.equal(h16(ai.deriveSamV6(structuredClone(RUNS.splitbill.draft))), "17d1671bbdaec55e", "split-bill (per bill)");
  // a non-subscription draft is left alone by the carry-over step
  const w = structuredClone(RUNS.wallets.draft);
  assert.deepEqual(ai.withSubscriberCarryOver(w), RUNS.wallets.draft);
});

test("subscription: subscribers carry over with a labelled monthly cancel rate; revenue = active subscribers × price", () => {
  const d = ai.withSubscriberCarryOver(structuredClone(RUNS.newsletter.draft));
  const churn = d.assumptions.find((a) => a.key === "churn_pct_month")!;
  assert.equal(churn.value, ai.SUBSCRIPTION_CHURN_PCT);
  assert.equal(churn.unit, "%");
  assert.equal(churn.is_estimate, true, "the cancel rate is an estimate");
  assert.match(churn.basis, /assumption/i);
  assert.match(d.assumptions.find((a) => a.key === "customers_per_day_m1")!.label, /new/i);
  // idempotent
  assert.equal(ai.withSubscriberCarryOver(d).assumptions.filter((a) => a.key === "churn_pct_month").length, 1);

  const m = ai.deriveSamV6(d);
  const days = d.assumptions.find((a) => a.key === "open_days_month")!.value;
  const ticket = d.assumptions.find((a) => a.key === "avg_ticket")!.value;
  const c1 = d.assumptions.find((a) => a.key === "customers_per_day_m1")!.value;
  assert.ok(m.subscribers && m.subscribers.length === 12);
  // month 1 = the first month's new subscribers; later months keep last month's minus 8%, plus new ones
  assert.equal(m.subscribers![0], Math.round(c1 * days));
  for (let i = 1; i < 12; i++) assert.ok(m.subscribers![i]! > m.subscribers![i - 1]! * (1 - churn.value / 100), `month ${i + 1} carries subscribers over`);
  for (let i = 0; i < 12; i++) assert.ok(Math.abs(m.months[i]!.revenue - m.subscribers![i]! * ticket) <= ticket, `month ${i + 1} revenue = active × price`);
  // the old table sold month 12 as 120 new sales; with carry-over month 12 has several hundred paying subscribers
  assert.ok(m.subscribers![11]! > 4 * days);
  // break-even stays "N paying subscribers"
  assert.match(m.breakeven.formula, /= 93 paying subscribers$/);
  assert.match(m.headroom.note, /paying subscribers by month 12 \(after 8% cancel each month, an estimate\)/);
  // the card shows active subscribers at month 12 (m12_per_day × per_month / per_day)
  const shown = Math.round(m.headroom.m12_per_day * (m.breakeven.per_month / m.breakeven.per_day));
  assert.equal(shown, m.subscribers![11]);
  assert.equal(m.headroom.multiple, Math.round((m.subscribers![11]! / 93) * 10) / 10);
});

test("subscription found from the idea when Sam priced it per box (real run, coffee box at $24 a month)", () => {
  const R = RUNS.coffeebox;
  assert.equal(ai.isSubscription(R.draft), false, "Sam wrote 'per box'");
  const m = ai.deriveSamV6(ai.withSubscriberCarryOver(structuredClone(R.draft), R.idea));
  assert.deepEqual(m.subscribers, [9, 18, 29, 41, 57, 76, 100, 127, 156, 186, 215, 243]);
  assert.equal(m.months[11]!.revenue, 5828);
  assert.equal(m.breakeven.formula, "$2,110 fixed ÷ $6.80 per subscriber a month = 311 paying subscribers");
  assert.match(m.headroom.note, /^243 paying subscribers by month 12 \(after 8% cancel each month, an estimate\), 0\.8× the 311 needed$/);
  // Sam's own canvas ("$24 per subscriber per month") is enough too
  assert.equal(ai.withSubscriberCarryOver(structuredClone(R.draft)).assumptions.length, 8);
});

// ───────────────────────────────────────────── 3. free or fee-based ideas
test("freeToUser: free with a fee, commission, ads or freemium; not free shipping, not a priced paid tier", () => {
  const yes = [
    RUNS.splitbill.idea,
    "A marketplace for used climbing gear that takes a 10% commission",
    "A free recipe app paid for by ads",
    "A freemium habit tracker",
    "A booking site for dog sitters, free for owners, sitters pay a small fee",
    "An app that finds free parking spots in Chicago, ad-supported",
    "A study-partner app for students, free to use, earns from ads",
  ];
  const no = [
    RUNS.wallets.idea,
    RUNS.newsletter.idea,
    "A monthly box of specialty coffee beans for remote workers, $24 a month, shipped across the US",
    "Handmade candles with free shipping across the US, $28 each",
    "Gluten-free brownies delivered in Austin, $4 each",
    "A habit tracker, free, with a Pro plan at $5 a month",
    // review q3: "free" as an adjective and businesses that merely mention ads or commissions sell something
    "Stress-free dog walking in Austin, $25 a walk",
    "Hassle free bike repair at your door, $40 a visit",
    "Free-range eggs delivered weekly in Denver, $6 a dozen",
    "A tool that writes Facebook ads for small shops, $29 a month",
    "Commissioned pet portraits painted from photos, $120 each",
    "Plastic free cleaning refills by mail, $18 a box",
    ...(["coffee", "dog", "bikes", "bread", "saas"] as const).map((k) => mocks.sampleIdea(k)),
  ];
  for (const i of yes) assert.equal(ai.freeToUser(i), true, i);
  for (const i of no) assert.equal(ai.freeToUser(i), false, i);
});

test("free/fee idea: Sam's launch offer is a free early-access list, never a priced reserve", () => {
  const draft = structuredClone(RUNS.splitbill.draft) as Draft;
  const s = ai.sanitize("sam", draft as never, { idea: RUNS.splitbill.idea }) as unknown as ReturnType<typeof ai.deriveSamV6>;
  assert.equal(s.launch_offer.price, 0);
  assert.equal(s.launch_offer.display, "Free");
  assert.equal(s.launch_offer.item, "Free early access");
  assert.equal(s.launch_offer.revenue_if_sold_out, 0);
  assert.equal(s.launch_offer.contribution, 0);
  // a priced idea keeps its pre-order
  const w = ai.sanitize("sam", structuredClone(RUNS.wallets.draft) as never, { idea: RUNS.wallets.idea }) as unknown as ReturnType<typeof ai.deriveSamV6>;
  assert.equal(w.launch_offer.price, 40);
});

function kitInput(free: boolean): KitInput {
  return {
    projectId: "P1",
    idea: RUNS.splitbill.idea,
    brand: { name: "Tabby", tagline: "Split the bill, not the friendship", voice: "Warm.", palette: { primary: "#1F2937", accent: "#0AC18E", bg: "#F8FAFC", ink: "#111827" }, fonts: { display: "Fraunces", text: "Inter" }, lang: "en", currency: "$" },
    report: { customer: "Friends who eat out together", pain: "Settling up after dinner is awkward.", offer: free ? { what: "Free early access", price: 0, free: true } : { what: "One settled bill", price: 0.64, normal: 0.8, limit: 50 }, stats: [], competitors: [], risks: [] },
    founderAddress: "bitcoincash:qp9d679zvayvudj65nd9zlgezvjplr8g3vea64wad0",
    slug: "tabby",
  } as KitInput;
}

test("free/fee idea: the kit digest, the site and the fallback plan ask people to join the list, with no BCH payment", async () => {
  // digest from a project whose Sam has a free offer, and from an older project whose Sam still had a priced one
  const sam = ai.sanitize("sam", structuredClone(RUNS.splitbill.draft) as never, { idea: RUNS.splitbill.idea });
  const p = { id: "x", idea: RUNS.splitbill.idea, results: { sam } } as never;
  assert.deepEqual(kit.digestOf(p, null).offer, { what: "Free early access", price: 0, limit: 50, free: true });
  const old = ai.sanitize("sam", structuredClone(RUNS.splitbill.draft) as never, {});
  assert.ok((old as { launch_offer: { price: number } }).launch_offer.price > 0);
  assert.equal(kit.digestOf({ id: "y", idea: RUNS.splitbill.idea, results: { sam: old } } as never, null).offer.free, true, "decided from the idea too");
  assert.equal(kit.digestOf({ id: "z", idea: RUNS.wallets.idea, results: { sam: ai.sanitize("sam", structuredClone(RUNS.wallets.draft) as never, {}) } } as never, null).offer.free, undefined);

  const input = kitInput(true);
  // a model that still wrote "Reserve" buttons is overruled
  const model = { ...templateSite(kitInput(false)), hero: { eyebrow: "Tabby", headline: "Split the bill", sub: "x", cta: "Reserve for $0.64", secondary: "How it works" }, finalCta: { headline: "Be first", sub: "", cta: "Pre-order now" } };
  const { spec } = validateModelSite(model, input);
  assert.equal(spec.reserve.address, "", "no payment address: nothing is sold");
  assert.equal(spec.reserve.price, 0);
  assert.equal(spec.reserve.waitlist, true);
  assert.equal(spec.hero.cta, "Join the list");
  assert.equal(spec.finalCta.cta, "Join the list");
  for (const t of ["editorial", "bold", "warm"] as const) {
    const html = renderSite(spec, { brand: input.brand, logo: null } as never, t, { reserved: 0, leads: 0 } as never, { slug: "tabby" });
    assert.doesNotMatch(html, / data-reserve>|href="bitcoincash:|class="sheet" id="reserve"|Reserve with BCH/, `${t}: no reserve sheet, coin button or pay link`);
    assert.match(html, /<a class="btn btn-p" href="#offer"><span>Join the list<\/span><\/a>/, `${t}: hero button goes to the form`);
    assert.match(html, /data-lead/, `${t}: the email form is there`);
  }
  // fallback copy and plan carry no reserve or payment words
  const fb = templateSite(input);
  assert.doesNotMatch(JSON.stringify(fb), /reserv|pay in|pay from|bitcoin/i);
  const plan = templatePlan(input);
  assert.doesNotMatch(JSON.stringify(plan), /reserv(?!e_pct)/i);
  assert.doesNotMatch(JSON.stringify(plan.channels), /window sign|counter/i, "an app gets no shop-window channels");
  assert.equal(plan.goal.metric, "early-access sign-ups");
  assert.ok(plan.kpis.every((k) => k.count_from !== "bch payments"));
  // the page writers are told
  assert.equal((siteDigest(input).offer as { free?: boolean }).free, true);
  assert.equal(customBrief(input, []).reserve.enabled, false);
  assert.equal((customBrief(input, []).report.offer as { free?: boolean }).free, true);
  // a priced idea is unchanged: reserve address kept, coin button
  const paid = validateModelSite(templateSite(kitInput(false)), kitInput(false)).spec;
  assert.equal(paid.reserve.address, kitInput(false).founderAddress);
  assert.equal(paid.reserve.waitlist, undefined);
});

// ───────────────────────────────────────────── 4. owner pay + labour counted once
test("founder's own time is counted once: owner pay stays, their per-sale labour leaves the unit cost", () => {
  const w = RUNS.wallets.econ;
  assert.deepEqual(ai.founderLabourTwice(w.lines), { labour: 15, ownerPay: "owner pay" });
  assert.equal(ai.founderLabourTwice(RUNS.newsletter.econ.lines), null, "no labour line");
  assert.equal(ai.founderLabourTwice(RUNS.splitbill.econ.lines), null, "support time is not the founder's making time");
  assert.equal(ai.founderLabourTwice([{ group: "fixed", item: "Owner pay", eur: 800 }, { group: "variable", item: "barista labour per drink", eur: 0.5 }] as never), null, "hired staff are kept");
  assert.equal(ai.founderLabourTwice([{ group: "variable", item: "labour, one hour", eur: 15 }] as never), null, "no owner pay: nothing counted twice");

  const v = ai.anchorSam(structuredClone(RUNS.wallets.draft), w);
  const margin = v.assumptions.find((a) => a.key === "gross_margin_pct")!;
  assert.equal(margin.value, Math.round(((8.27 + 15) / 45) * 10000) / 100);
  assert.match(margin.basis, /labour counted once/);
  assert.deepEqual(v.fixed_costs_breakdown[0], { label: "owner pay (covers your own time)", value: 800 });
  assert.equal(v.assumptions.find((a) => a.key === "fixed_costs_month")!.value, 1015);
  const m = ai.deriveSamV6(v);
  assert.equal(m.unit.contribution, 23.27);
  // no double count: the newsletter keeps the report's figures exactly
  const n = ai.anchorSam(structuredClone(RUNS.newsletter.draft), RUNS.newsletter.econ);
  assert.equal(n.assumptions.find((a) => a.key === "gross_margin_pct")!.value, Math.round((7.71 / 8) * 10000) / 100);
  assert.equal(n.assumptions.find((a) => a.key === "gross_margin_pct")!.basis, "From the report's unit economics");
});

// ───────────────────────────────────────────── 1. on-topic photos
const cand = (title: string, tags: string[] = [], extra: Partial<import("../server/site/photos.js").Candidate> = {}) => ({ title, tags, ...extra });

test("photos: queries start from the product noun", () => {
  assert.deepEqual(P.productOf(RUNS.wallets.idea), { phrase: "leather wallets", head: "wallet" });
  assert.deepEqual(P.productOf("A monthly box of specialty coffee beans for remote workers, $24 a month, shipped across the US"), { phrase: "coffee beans", head: "bean" });
  assert.deepEqual(P.productOf(RUNS.splitbill.idea), { phrase: "restaurant bills", head: "bill" });
  assert.equal(P.productOf(RUNS.newsletter.idea), null, "nothing concrete: category defaults only");
  assert.equal(P.productOf("Panadería de barrio"), null, "not English");
  const q = P.buildQueries({ idea: RUNS.wallets.idea });
  assert.equal(q.hero[0], "leather wallets");
  assert.ok(![...q.hero, ...q.detail, ...q.people].some((x) => /shop|market/.test(x)), "no generic 'small shop' scene");
  assert.equal(P.buildQueries({ idea: "A monthly box of specialty coffee beans for remote workers" }).hero[0], "coffee beans");
  assert.equal(P.categoryOf(RUNS.splitbill.idea)?.key, "mobile", "a phone app is not photographed as a restaurant");
});

test("photos: off-topic candidates are rejected at word level (val2 wallets, val1 split-bill)", () => {
  const w = P.topicOf(RUNS.wallets.idea, "Austin");
  // val2's actual picks
  assert.equal(P.onTopic(cand("blackboard reading “fresh cut flowers”", ["chalkboard", "door", "florist", "flower shop"]), w), false);
  assert.equal(P.onTopic(cand("handmade ladies leather handbag designed", ["leather"]), w, "Woman walking holding a blue leather-trimmed tote bag, city wall behind her"), false);
  assert.equal(P.onTopic(cand("Business Establishments", ["busy", "cafe", "coffee", "counter"]), w), false);
  assert.equal(P.onTopic(cand("Plant Garden", ["book", "business", "cactus", "counter", "flowerpot"]), w), false);
  assert.equal(P.onTopic(cand("A successful shop owner and", ["aceh", "banana", "business"]), w), false);
  // on topic
  assert.equal(P.onTopic(cand("Brown leather wallet on a wooden table"), w), true);
  assert.equal(P.onTopic(cand("Bifold", ["wallet", "leather"]), w), true);
  // word level: "rosemary" is not "rose", "cut" is not "haircut"
  assert.equal(P.onTopic(cand("Leather wallet beside a rosemary sprig"), w), true);
  assert.equal(P.onTopic(cand("Leather wallet with hand cut edges"), w), true);
  const salon = P.topicOf("A hair salon for curly hair in Leeds, $40 a haircut");
  assert.equal(P.onTopic(cand("Fresh cut flowers in a vase", ["salon"]), salon), false);
  assert.equal(P.onTopic(cand("Hairdresser giving a haircut in a salon"), salon), true);
  // val1: a chef plating food is not a bill-splitting app; a restaurant bill or a phone payment is
  const b = P.topicOf(RUNS.splitbill.idea);
  assert.equal(P.onTopic(cand("Chef Cook"), b, "Chef arranging food on white plates in a restaurant kitchen."), false);
  assert.equal(P.onTopic(cand("Plate Food"), b, "Pancakes topped with almonds and berries on a grey plate, indoors."), false);
  assert.equal(P.onTopic(cand("Restaurant bill on a table"), b), true);
  assert.equal(P.onTopic(cand("Paying with a smartphone"), b), true);
});

test("photos: q3 tool lending is about tools, never 'each other'; a laptop by a plant is not a Telegram bot", () => {
  const tools = "A free mobile app where neighbours lend tools to each other, earning from a $2 insurance fee per loan";
  assert.deepEqual(P.productOf(tools), { phrase: "tools", head: "tool" });
  assert.deepEqual(P.productOf("A marketplace where students swap textbooks with one another"), { phrase: "textbooks", head: "textbook" });
  assert.equal(P.buildQueries({ idea: tools }).hero[0], "tools");
  const t = P.topicOf(tools);
  assert.equal(P.onTopic(cand("Two lions snuggling each other"), t), false, "q3 v2: lions under 'Give it back'");
  assert.equal(P.onTopic(cand("Power drill and hammer on a workbench"), t), true);
  const bot = P.topicOf("A Telegram bot that sends daily crypto tax reminders to freelancers, $5 a month");
  assert.equal(P.onTopic(cand("Laptop on a desk next to a plant"), bot), false, "q3 v0: a stray plant is not excused by a category word");
  assert.equal(P.onTopic(cand("People working on laptops in a busy cafe"), bot), false);
  assert.equal(P.onTopic(cand("Hand holding a smartphone"), bot), true);
});

// fake Openverse with val2-like hits: only the wallet photo may be used; with none, no photos at all
const JPEG = new Uint8Array(readFileSync(join(process.cwd(), "server/site/fixtures/photos/laptop-desk.jpg")));
function fakeOpenverse(hits: Array<{ id: string; title: string; tags?: string[] }>) {
  return (async (input: unknown) => {
    const url = String(input);
    if (url.startsWith("https://api.openverse.org/v1/images/?"))
      return Response.json({
        results: hits.map((r) => ({ id: r.id, title: r.title, foreign_landing_url: `https://stocksnap.io/photo/${r.id}`, url: `https://cdn.stocksnap.io/img-thumbs/960w/${r.id}.jpg`, creator: "Jo Doe", license: "cc0", license_version: "1.0", license_url: "https://creativecommons.org/publicdomain/zero/1.0/", source: "stocksnap", filetype: "jpg", width: 4000, height: 2667, tags: (r.tags ?? []).map((name) => ({ name })) })),
      });
    if (url.includes("cdn.stocksnap.io")) return new Response(JPEG, { headers: { "content-type": "image/jpeg" } });
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
}
const VAL2_HITS = [
  { id: "flowers", title: "blackboard reading fresh cut flowers", tags: ["chalkboard", "florist", "flower shop"] },
  { id: "cafe", title: "Business Establishments", tags: ["busy", "cafe", "coffee", "counter"] },
  { id: "cactus", title: "Plant Garden", tags: ["cactus", "flowerpot", "business"] },
  { id: "tote", title: "Handmade ladies leather handbag", tags: ["leather", "bag", "fashion"] },
];

test("findPhotos: only on-topic photos are used, and none at all beats an off-topic one", async () => {
  P._resetRateLimit();
  const logs: string[] = [];
  const photos = await P.findPhotos({ idea: RUNS.wallets.idea, mock: false, vision: false, cache: null, fetch: fakeOpenverse([...VAL2_HITS, { id: "wallet", title: "Brown leather wallet on a wooden table", tags: ["wallet", "leather"] }]), log: (m) => logs.push(m) });
  assert.deepEqual(photos.map((p) => p.id), ["stocksnap:wallet"]);
  assert.equal(photos[0]!.credit, "Jo Doe / StockSnap", "credit is the kept photo's own");
  assert.equal(photos[0]!.sourceUrl, "https://stocksnap.io/photo/wallet");
  assert.ok(logs.some((l) => /off-topic candidates dropped/.test(l)));
  P._resetRateLimit();
  assert.deepEqual(await P.findPhotos({ idea: RUNS.wallets.idea, mock: false, vision: false, cache: null, fetch: fakeOpenverse(VAL2_HITS), log: () => {} }), []);
});

// ───────────────────────────────────────────── 5. hero label keeps its rows on phones
test("custom page: a rule hiding a hero-label row is dropped when the page is made", () => {
  const css = `.hero-tag dl{margin:0;display:grid;gap:6px}\n@media(max-width:560px){\n.hero-tag{left:auto;right:12px;bottom:12px;width:170px;padding:12px 14px}\n.hero-tag dl div:nth-child(2){display:none}\n.nav a{display:none}\n}`;
  const out = keepHeroTagRows(css);
  assert.doesNotMatch(out, /nth-child\(2\)\{display:none\}/);
  assert.match(out, /\.nav a\{display:none\}/, "other hidden things are left alone");
  assert.match(out, /\.hero-tag\{left:auto;right:12px;bottom:12px;width:170px;padding:12px 14px\}/);
  assert.equal(keepHeroTagRows(".a{color:red}"), ".a{color:red}");
});

// ───────────────────────────────────────────── q3 fixer: phone hero label in the flow, newest customer numbers
test("custom page: when the phone rules put the hero image and label in the flow, the image takes its own height (q3 v1)", () => {
  const css = `.hero-photo{position:relative;min-height:420px}\n.hero-photo img{position:absolute;inset:0;width:100%;height:100%}\n.hero-tag{position:absolute;left:-32px;bottom:40px}\n@media (max-width:560px){.top nav a:not(.btn){display:none}.hero-tag{position:static;width:auto}.hero-photo{aspect-ratio:auto}.hero-photo img{position:static;aspect-ratio:4/3}}`;
  assert.match(heroTagInFlow(css), /@media\(max-width:560px\)\{\[data-hero\] :has\(> \.hero-tag\) > img\{height:auto!important\}\}$/);
  // a label that stays over the photo on phones: untouched
  const overlay = `.hero-tag{position:absolute}\n@media (max-width:560px){.hero-tag{right:12px;bottom:12px;width:170px}}`;
  assert.equal(heroTagInFlow(overlay), overlay);
  assert.equal(heroTagInFlow(".a{color:red}"), ".a{color:red}");
});

test("custom page: two counts of the same thing are not shown side by side; the newest leads (q3 v0)", () => {
  const s = (value: string, label: string) => ({ value, label, sourceUrl: "https://x.org", kind: "demand" as const });
  const out = demandStats([s("562 million", "Crypto holders, 2024"), s("about 742 million", "Crypto holders worldwide, 2026"), s("38%", "Freelancers paid in crypto, 2025")]);
  assert.deepEqual(out.map((x) => x.value), ["about 742 million", "38%"]);
  assert.deepEqual(demandStats([s("1", "A"), { ...s("2", "Rents"), kind: "context" as never }]).map((x) => x.value), ["1"]);
});

// ───────────────────────────────────────────── review q3: a dropped id in a table cell leaves no empty brackets
test("renumberCites: an unknown id inside a table cell's brackets leaves no '[]' behind", async () => {
  const { renumberCites } = await import("../server/report-v7.js");
  const src = [{ id: "S2", title: "a", url: "https://a.example" }, { id: "S5", title: "b", url: "https://b.example" }] as never;
  const md = "Text [S5].\n\n| Figure | Value | Source |\n|---|---|---|\n| X | 742 million [S99] | [S2] |\n| Z | 4 [S5][S99] | [S99, S5] |";
  const out = renumberCites(md, src).md;
  assert.ok(!/\[\s*\]|\[\s*,|,\s*\]/.test(out), out);
  assert.match(out, /\| X \| 742 million \| \[S2\] \|/);
  assert.match(out, /\| Z \| 4 \[S1\] \| \[S1\] \|/);
});
