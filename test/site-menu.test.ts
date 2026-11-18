// Website menu / price list, honesty guards, example notice, 404 page and the Sortida example seed. Zero spend (mock, temp DB).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "ld-menu-"));
Object.assign(process.env, { MOCK_AI: "1", ANTHROPIC_API_KEY: "", DATABASE_URL: `file:${join(dir, "menu.db")}`, BCH_USD_FIXED: "480" });

const { loadFixture } = await import("../server/site/plan.js");
const { renderSite } = await import("../server/site/render.js");
const { validateModelSite, menuOf, priceGuide } = await import("../server/site/validate.js");
const { SITE_TEMPLATES } = await import("../server/site/spec.js");
const { siteNotFoundHtml, siteRoutes } = await import("../server/site/routes.js");
type KitInput = import("../server/kit-contract.js").KitInput;

const fx = loadFixture("dogwalk-en");
const kit = { brand: fx.input.brand, logo: { options: fx.logos, chosen: fx.logos[0]!.id, fallback: false } };
/** The Sortida report's numbers: €2.50 opening offer (normally €3), one sourced market price (€3.90 flat white). */
const coffee = (over: Partial<KitInput["report"]> = {}, idea = "A specialty coffee kiosk at a Barcelona metro exit"): KitInput => ({
  ...fx.input,
  idea,
  brand: { ...fx.input.brand, currency: "€", lang: "en" },
  report: {
    ...fx.input.report,
    offer: { what: "One flat white, takeaway", price: 2.5, normal: 3, limit: 80 },
    stats: [{ value: "€3.90", label: "Syra Coffee flat white", sourceUrl: "https://guidavera.com/x", kind: "price" }],
    ...over,
  },
});
const items = [
  { group: "Coffee", name: "Espresso", desc: "Single shot", price: 1.52, photo: "espresso" },
  { group: "Coffee", name: "Americano", desc: "With hot water", price: 2.2, photo: "" },
  { group: "Coffee", name: "Golden latte", desc: "Edible gold leaf", price: 40, photo: "" },
  { group: "With milk", name: "Flat white", desc: "Double espresso, steamed milk", price: 3.2, photo: "flat white" },
  { group: "With milk", name: "flat white", desc: "duplicate", price: 3, photo: "" },
  { group: "With milk", name: "Latte", desc: "More milk", price: 3.4, photo: "latte" },
  { group: "Something to eat", name: "Croissant", desc: "Butter croissant", price: 2.2, photo: "croissant" },
];

test("menu: prices inside the report's band, menu rounding, the offer line at its regular price, duplicates dropped", () => {
  const g = priceGuide(coffee());
  assert.equal(g.currency, "€");
  assert.deepEqual(g.market && [g.market.low, g.market.high], [3.9, 3.9]);
  const issues: string[] = [];
  const m = menuOf({ kind: "menu", title: "Menu", intro: "", items }, coffee(), issues)!;
  assert.ok(m, issues.join("; "));
  const lines = m.groups.flatMap((x) => x.items);
  assert.deepEqual(m.groups.map((x) => x.name), ["Coffee", "With milk", "Something to eat"]);
  assert.equal(lines.find((l) => l.name === "Espresso")!.price, 1.5, "rounded like a menu");
  assert.ok(!lines.some((l) => l.name === "Golden latte"), "out-of-band price dropped");
  assert.ok(issues.some((i) => /Golden latte/.test(i)));
  assert.equal(lines.filter((l) => /flat white/i.test(l.name)).length, 1);
  const offer = lines.find((l) => l.offer)!;
  assert.equal(offer.name, "Flat white");
  assert.equal(offer.price, 3, "the offer line shows the regular price; the tag carries the opening price");
  assert.equal(m.note, "Opening menu · prices may change before we open");
});

test("menu: none for a free list, for too few lines, and for an app without sourced market prices", () => {
  assert.equal(menuOf({ kind: "menu", title: "", intro: "", items }, coffee({ offer: { what: "Free early access", price: 0, free: true } })), null);
  assert.equal(menuOf({ kind: "menu", title: "", intro: "", items: items.slice(0, 1) }, coffee()), null);
  assert.equal(menuOf({ kind: "none", title: "", intro: "", items }, coffee()), null);
  const app = "A dog-walking app for busy Madrid professionals";
  const walks = [
    { group: "Walks", name: "30-minute walk", desc: "One dog", price: 12, photo: "" },
    { group: "Walks", name: "45-minute walk", desc: "One dog", price: 16, photo: "" },
    { group: "Walks", name: "60-minute walk", desc: "One dog", price: 20, photo: "" },
  ];
  const offer = { what: "One 30-minute walk", price: 10, normal: 12 };
  assert.equal(menuOf({ kind: "services", title: "", intro: "", items: walks }, coffee({ offer, stats: [] }, app)), null, "no market prices");
  const priced = coffee({ offer, stats: [{ value: "€10–15", label: "Madrid 30-minute walk", sourceUrl: "https://example.org/w", kind: "price" }] }, app);
  const m = menuOf({ kind: "services", title: "", intro: "", items: walks }, priced)!;
  assert.equal(m.label, "services");
  assert.equal(m.note, "Opening prices · they may change before we open");
  assert.equal(menuOf({ kind: "menu", title: "", intro: "", items: walks }, priced), null, "an app is never a food menu");
});

test("site spec: menu section and photo searches; no clock times, no stock count, no pay talk without a wallet", () => {
  const model = {
    ...fx.model,
    menu: { kind: "menu", title: "Menu", intro: "", items },
    photoQueries: { hero: "coffee kiosk", detail: "latte art, espresso cup", people: "barista" },
    faq: {
      title: "Questions",
      items: [
        { q: "When can I pick it up?", a: "Between 7:30 and 9:30 on weekdays." },
        { q: "How many are there?", a: "The offer is limited to the first 80 cups." },
        { q: "How do I pay?", a: "You pay with Bitcoin Cash from your phone." },
        { q: "Is it takeaway only?", a: "Yes, every drink is made to go." },
      ],
    },
  } as unknown as Parameters<typeof validateModelSite>[0];
  const { spec } = validateModelSite(model, { ...coffee(), founderAddress: "" });
  const menu = spec.sections.find((s) => s.kind === "menu");
  assert.ok(menu && menu.kind === "menu" && menu.groups.length === 3);
  assert.deepEqual(spec.photoQueries?.hero, ["coffee kiosk"]);
  assert.ok(spec.photoQueries!.detail.includes("latte art"));
  const faq = spec.sections.find((s) => s.kind === "faq");
  const qs = faq && faq.kind === "faq" ? faq.items.map((i) => i.q) : [];
  assert.ok(qs.includes("Is it takeaway only?"));
  for (const bad of ["When can I pick it up?", "How many are there?", "How do I pay?"]) assert.ok(!qs.includes(bad), bad);
  const withWallet = validateModelSite(model, { ...coffee(), founderAddress: "bitcoincash:qp9d679zvayvudj65nd9zlgezvjplr8g3vea64wad0" }).spec;
  const faq2 = withWallet.sections.find((s) => s.kind === "faq");
  assert.ok(faq2 && faq2.kind === "faq" && faq2.items.some((i) => i.q === "How do I pay?"), "pay talk is fine when the reserve button works");
});

test("the 3 standard designs print the menu; an example site says so and its reserve button explains payments are off", () => {
  const model = { ...fx.model, menu: { kind: "menu", title: "Menu", intro: "", items } } as unknown as Parameters<typeof validateModelSite>[0];
  const { spec } = validateModelSite(model, { ...coffee(), founderAddress: "" });
  for (const t of SITE_TEMPLATES) {
    const html = renderSite(spec, kit, t, { reserved: 0, bchUsd: 480 }, { slug: "sortida", example: true });
    assert.match(html, /id="menu"/, t);
    assert.match(html, /Croissant/);
    assert.match(html, /€2\.50 opening offer|2\.50 € opening offer/, t);
    assert.match(html, /Opening menu · prices may change before we open/);
    assert.match(html, /Example site made by LaunchDesk/);
    assert.match(html, /payments are off/);
    assert.match(html, /data-reserve/, `${t}: the example keeps its reserve button`);
    const live = renderSite(spec, kit, t, { reserved: 0, bchUsd: 480 }, { slug: "sortida" });
    assert.doesNotMatch(live, /Example site made by LaunchDesk/);
  }
});

test("unknown /s/ page: a real 404 with today's prices", () => {
  const html = siteNotFoundHtml("nope", { validate: 10, build: 50 });
  assert.match(html, /This page isn't live/);
  assert.match(html, /Research 10¢ · Launch kit with a website 50¢/);
  assert.doesNotMatch(html, /\$0\.30/);
  assert.match(siteNotFoundHtml("<x>"), /&lt;x&gt;/);
});

test("Sortida example: designed page, its photos and a priced menu from the paid report; the paid proof is untouched", async () => {
  const root = join(import.meta.dirname, "..", "server", "seed", "examples", "finished");
  const ex = JSON.parse(readFileSync(join(root, "coffee-kiosk-barcelona.json"), "utf8"));
  assert.equal(ex.kit.site.template, "custom");
  assert.ok(ex.custom?.html?.includes("ld-photo:p1"));
  assert.ok(ex.photos.length >= 5);
  for (const p of ex.photos) {
    const f = join(root, "photos", p.file);
    assert.ok(existsSync(f), p.file);
    assert.equal(createHash("sha256").update(readFileSync(f)).digest("hex"), p.hash, p.file);
  }
  const menu = ex.kit.site.spec.sections.find((s: { kind: string }) => s.kind === "menu");
  const offer = menu.groups.flatMap((g: { items: unknown[] }) => g.items).find((i: { offer?: boolean }) => i.offer);
  assert.equal(offer.price, 3);
  assert.match(ex.label.kitNote, /test mode \(not paid\)/);
  assert.equal(ex.payments[0].sats, 48584, "the mainnet payment record is unchanged");
  assert.equal(ex.escrow.network, "mainnet");

  const { migrate } = await import("../server/db.js");
  await migrate();
  const { seedFinishedExamples } = await import("../server/examples.js");
  const { siteRowFor } = await import("../server/kit.js");
  await seedFinishedExamples();
  const app = siteRoutes({ load: siteRowFor });
  const res = await app.request("/s/sortida");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Example site made by LaunchDesk/);
  assert.match(html, /id="menu"/);
  assert.match(html, /\/s\/sortida\/p\/1\?v=/);
  assert.match(html, /data-reserve/);
  assert.equal((await app.request("/s/sortida/p/1")).status, 200);
});
