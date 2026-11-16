// WP1 Website tests: zero spend (mock mode, temp DB). Run: node_modules/.bin/tsx --test test/site.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "ld-site-"));
Object.assign(process.env, { MOCK_AI: "1", ANTHROPIC_API_KEY: "", DATABASE_URL: `file:${join(dir, "site.db")}`, BCH_USD_FIXED: "480" });

const { FIXTURES, loadFixture, planSiteDetailed } = await import("../server/site/plan.js");
const { renderSite, SITE_CSP, SCRIPT_HASH, safeLogo } = await import("../server/site/render.js");
const { validateModelSite, contrast, tokens, clean } = await import("../server/site/validate.js");
const { SITE_TEMPLATES } = await import("../server/site/spec.js");
const { siteRoutes } = await import("../server/site/routes.js");
const { saveSite, setSiteTemplate, listLeads } = await import("../server/site/db.js");
const { SITE_JS } = await import("../server/site/templates/shared.js");
const { createHash } = await import("node:crypto");

const kitOf = (fx: ReturnType<typeof loadFixture>) => ({ brand: fx.input.brand, logo: { options: fx.logos, chosen: fx.logos[0]!.id, fallback: false } });

test("3 fixtures × 3 templates render complete, escaped, honest pages", () => {
  for (const name of FIXTURES) {
    const fx = loadFixture(name);
    const { spec } = validateModelSite(fx.model, fx.input);
    for (const t of SITE_TEMPLATES) {
      const html = renderSite(spec, kitOf(fx), t, { reserved: 0, bchUsd: 480 }, { slug: fx.input.slug });
      assert.match(html, /^<!doctype html>/);
      assert.match(html, new RegExp(`<html lang="${fx.input.brand.lang}"`));
      assert.match(html, /name="viewport"/);
      assert.match(html, /application\/ld\+json/);
      assert.match(html, /<details/);
      assert.match(html, /id="reserve"/);
      assert.match(html, /bitcoincash:[a-z0-9]+\?amount=0\.\d+/);
      assert.match(html, fx.input.brand.lang === "es" ? /Reservar con BCH/ : /Reserve with BCH/);
      assert.doesNotMatch(html, /reserved so far|reservas hasta ahora/, "no counter when nothing is reserved");
      assert.doesNotMatch(html, /undefined|NaN|\[object Object\]/);
      assert.ok(html.length < 120_000, `${name}/${t} too big: ${html.length}`);
    }
  }
});

test("prices come from the report, not the model", () => {
  const fx = loadFixture("bakery-es");
  const { spec } = validateModelSite(fx.model, fx.input);
  assert.equal(spec.reserve.price, 29);
  assert.equal(spec.reserve.normal, 39);
  assert.equal(spec.reserve.limit, 100);
  const html = renderSite(spec, kitOf(fx), "editorial", { reserved: 3 }, { slug: "miga-gracia" });
  assert.match(html, /29 €/);
  assert.match(html, /3 reservas hasta ahora/);
});

test("stats only when they map to a sourced report stat", () => {
  const raw = loadFixture("bakery-es");
  // Sample sources (example.org) never reach a page: with them, no proof section at all.
  assert.ok(!validateModelSite(raw.model, raw.input).spec.sections.some((s) => s.kind === "proof-stats"), "example.org stats are dropped");
  const fx = { ...raw, input: { ...raw.input, report: { ...raw.input.report, stats: raw.input.report.stats.map((st) => ({ ...st, sourceUrl: st.sourceUrl.replace("www.example.org", "www.ine.es") })) } } };
  const { spec, issues } = validateModelSite(fx.model, fx.input);
  const proof = spec.sections.find((s) => s.kind === "proof-stats");
  assert.ok(proof && proof.kind === "proof-stats");
  assert.equal(proof.stats.length, 2, "stat without https source and out-of-range index are dropped");
  assert.ok(issues.some((i) => /no source/.test(i)) && issues.some((i) => /not in report/.test(i)));
  const none = validateModelSite({ ...fx.model, proof: { title: "x", picks: [9] } }, fx.input).spec;
  assert.ok(!none.sections.some((s) => s.kind === "proof-stats"));
});

test("hostile model text is escaped and cleaned; hype words dropped; garbage input still renders", () => {
  const fx = loadFixture("dogwalk-en");
  const bad = { ...fx.model, hero: { ...fx.model.hero, headline: `<script>alert(1)</script>Unlock "joy" & walks`, sub: "x".repeat(900) } };
  const { spec } = validateModelSite(bad, fx.input);
  assert.ok(!/unlock/i.test(spec.hero.headline));
  assert.ok(spec.hero.sub.length <= 200);
  const html = renderSite(spec, kitOf(fx), "editorial", { reserved: 0 });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&quot;joy&quot; &amp; walks/);
  assert.equal(clean("a <b>b</b> c", 20), "a b c");
  const empty = validateModelSite(null, fx.input).spec;
  assert.ok(empty.sections.some((s) => s.kind === "offer"));
  assert.ok(renderSite(empty, { brand: fx.input.brand }, "warm", { reserved: 0 }).includes("Pawtrail"));
});

test("logo is read at render time and unsafe logos fall back to a monogram", () => {
  const fx = loadFixture("saas-en");
  const { spec } = validateModelSite(fx.model, fx.input);
  const brand = { ...fx.input.brand, palette: { ...fx.input.brand.palette, accent: "#123456" } };
  const other = { id: "x2", family: "geometric" as const, idea: "", svg: `<circle cx="32" cy="32" r="24" fill="#123456"/>` };
  const html = renderSite(spec, { brand, logo: { options: [...fx.logos, other], chosen: "x2", fallback: false } }, "editorial", { reserved: 0 });
  assert.match(html, /#123456/i);
  assert.equal(safeLogo(`<circle onload="x()"/>`), null);
  assert.equal(safeLogo(`<image href="https://e.vil/x.png"/>`), null);
  assert.ok(safeLogo(`<rect width="64" height="64"/>`));
});

test("contrast auto-fix: every template's text and buttons are readable even for a bad palette", () => {
  const bad = { primary: "#fafafa", accent: "#ffff00", bg: "#ffffff", ink: "#dddddd" };
  for (const m of ["light", "dark", "soft"] as const) {
    const t = tokens(bad, m);
    assert.ok(contrast(t.ink, t.bg) >= 7, `${m} ink`);
    assert.ok(contrast(t.muted, t.bg) >= 4.5, `${m} muted`);
    assert.ok(contrast(t.onPrimary, t.primary) >= 3, `${m} button`);
  }
});

test("CSP allows exactly our inline script", () => {
  assert.equal(SCRIPT_HASH, `sha256-${createHash("sha256").update(SITE_JS).digest("base64")}`);
  assert.match(SITE_CSP, /script-src 'sha256-/);
  assert.doesNotMatch(SITE_CSP, /unsafe-eval|script-src[^;]*unsafe-inline/);
});

test("mock planSite returns a validated fixture with no spend", async () => {
  const fx = loadFixture("dogwalk-en");
  const r = await planSiteDetailed({ ...fx.input, slug: "other", projectId: "p9", idea: "dog walking in Leeds" });
  assert.equal(r.mock, true);
  assert.equal(r.usd, 0);
  assert.equal(r.spec.lang, "en");
});

test("routes: live page, template preview, fall-through, waitlist", async () => {
  const fx = loadFixture("bakery-es");
  const { spec } = validateModelSite(fx.model, fx.input);
  await saveSite({ slug: "miga-gracia", projectId: "p1", template: "warm", spec, kit: kitOf(fx) });
  const app = siteRoutes();
  const live = await app.request("/s/miga-gracia");
  assert.equal(live.status, 200);
  assert.match(live.headers.get("content-security-policy") ?? "", /script-src/);
  assert.match(await live.text(), /data-template="warm"/);
  const prev = await app.request("/s/miga-gracia?preview=bold");
  const ph = await prev.text();
  assert.match(ph, /data-template="bold"/);
  assert.match(ph, /noindex/);
  assert.equal((await app.request("/s/nope")).status, 404, "unknown slug falls through");
  assert.ok(await setSiteTemplate("miga-gracia", "editorial"));
  assert.match(await (await app.request("/s/miga-gracia")).text(), /data-template="editorial"/);

  const post = (body: unknown) => app.request("/api/sites/miga-gracia/lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await post({ email: "nope" })).status, 400);
  assert.equal((await post({ email: "Ana@Example.com" })).status, 200);
  assert.equal((await post({ email: "ana@example.com" })).status, 200);
  assert.equal((await post({ email: "bot@example.com", website: "spam" })).status, 200);
  assert.deepEqual((await listLeads("miga-gracia")).map((l) => l.email), ["ana@example.com"]);
  const form = await app.request("/api/sites/miga-gracia/lead", { method: "POST", body: new URLSearchParams({ email: "luis@example.com" }) });
  assert.equal(form.status, 303);
});
