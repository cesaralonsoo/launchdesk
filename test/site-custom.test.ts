// Bespoke site tests: sanitizer XSS cases, the quality gate, mock generation and final page assembly. Zero spend.
// Run: MOCK_AI=1 node_modules/.bin/tsx --test test/site-custom.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

Object.assign(process.env, { MOCK_AI: "1", ANTHROPIC_API_KEY: "" });

const { sanitize, gateCustom, sanitizeCss, inventedClaims, extractFragment } = await import("../server/site/sanitize.js");
const { generateCustomSite, customBrief, storeCtx, aspectOf, CUSTOM_SYSTEM } = await import("../server/site/custom.js");
const { customRender, fontsHref, photoKey, headerLogo } = await import("../server/site/custom-render.js");
const { SCRIPT_HASH } = await import("../server/site/render.js");
const { SITE_JS } = await import("../server/site/templates/shared.js");
const { loadFixture } = await import("../server/site/plan.js");
const { validateModelSite } = await import("../server/site/validate.js");
type SanitizeCtx = import("../server/site/sanitize.js").SanitizeCtx;

const GOLD = readFileSync(new URL("../server/site/fixtures/custom/fern.html", import.meta.url), "utf8");
const STAT = "https://www.example.org/plant-survey";
const photos = Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [`p${i}`, { url: `/s/fern/photo/${i}`, width: 1200, height: 1600, alt: `photo ${i}` }]));
const ctx = (over: Partial<SanitizeCtx> = {}): SanitizeCtx => ({
  mode: "page", photos, links: [STAT], reserveEnabled: true, fonts: { display: "Fraunces", text: "DM Sans" },
  leadAction: "/api/sites/fern/lead", thanks: "Thanks!", emailLabel: "Your email",
  honesty: { numberSources: ["£45", "£60", "Starter Jungle: 3 easy plants + 2 care visits", "3 in 5"], stats: [{ value: "3 in 5", sourceUrl: STAT }] },
  ...over,
});
/** A minimal valid page with something nasty injected into <main>. */
const page = (inject: string, css = "") => `<style>:root{--a:#123}${css}${".x{color:red}".repeat(40)}</style>
<header><a href="#top">Shop</a><a href="#reserve" data-ld="reserve">Reserve</a></header>
<main><section><h1>Hello</h1><a class="b" href="#reserve" data-ld="reserve">Reserve for £45</a>
<img src="ld-photo:p1" alt="a"><img src="ld-photo:p2" alt="b"><img src="ld-photo:p3" alt="c">${inject}</section>
<section id="join"><form data-ld="waitlist"><label for="e">Email</label><input id="e" type="email" name="email"><button>Join</button></form></section></main><footer>Bye</footer>`;
const out = (s: { css: string; body: string }) => s.css + s.body;

test("the gold page passes the gate and gets wired", () => {
  const s = sanitize(GOLD, ctx());
  assert.deepEqual(s.problems, []);
  assert.equal(s.counts.reserve, 3);
  assert.equal(s.counts.photos, 6);
  assert.match(s.body, /<a class="btn btn-clay" href="#reserve" data-reserve>/);
  assert.match(s.body, /<form [^>]*method="post" action="\/api\/sites\/fern\/lead" data-lead>/);
  assert.match(s.body, /name="website" tabindex="-1"/);
  assert.match(s.body, /class="wl-ok" role="status" hidden>Thanks!/);
  assert.match(s.body, /src="\/s\/fern\/photo\/1"/);
  assert.match(s.body, /<section class="hero" data-hero>/);
  assert.match(s.body, new RegExp(`href="${STAT}" rel="noopener nofollow" target="_blank"`));
  assert.doesNotMatch(s.body, /ld-photo:|data-ld/);
});

test("store mode keeps neutral hooks and is idempotent", () => {
  const a = sanitize(GOLD, ctx({ mode: "store" }));
  assert.deepEqual(a.problems, []);
  assert.match(a.body, /src="ld-photo:p1"/);
  assert.match(a.body, /data-ld="reserve"/);
  const stored = `<style>${a.css}</style>${a.body}`;
  const b = sanitize(stored, ctx({ mode: "store" }));
  assert.equal(`<style>${b.css}</style>${b.body}`, stored);
});

test("XSS: scripts, handlers, javascript: URLs, srcdoc, svg script, meta refresh, base href are removed", () => {
  const cases = [
    `<script>alert(1)</script>`,
    `<img src="ld-photo:p4" onerror="alert(1)" alt="x">`,
    `<img src=x onerror=alert(1)>`,
    `<a href="javascript:alert(1)">x</a>`,
    `<a href="JaVaScRiPt:alert(1)">x</a>`,
    `<a href=" javascript:alert(1)">x</a>`,
    `<a href="data:text/html,<script>alert(1)</script>">x</a>`,
    `<iframe srcdoc="<script>alert(1)</script>"></iframe>`,
    `<div srcdoc="x" onclick="alert(1)" style="background:url(http://e.vil)">x</div>`,
    `<svg><script>alert(1)</script><path d="M0 0" onload="alert(1)"/></svg>`,
    `<svg><a xlink:href="javascript:alert(1)"><rect width="9" height="9"/></a></svg>`,
    `<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>`,
    `<svg><animate attributeName="href" to="javascript:alert(1)"/></svg>`,
    `<math><mtext><img src=x onerror=alert(1)></mtext></math>`,
    `<meta http-equiv="refresh" content="0;url=https://e.vil">`,
    `<base href="https://e.vil/">`,
    `<link rel="stylesheet" href="https://e.vil/x.css">`,
    `<object data="https://e.vil/x.swf"></object><embed src="https://e.vil/x">`,
    `<form action="https://e.vil"><input name="password" type="password"></form>`,
    `<noscript><p title="</noscript><img src=x onerror=alert(1)>"></p></noscript>`,
    `<template><script>alert(1)</script></template>`,
    `<a href="https://e.vil/phish">Claim</a>`,
    `<img src="https://e.vil/pixel.gif" alt="t">`,
    `<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>`,
    `<button formaction="https://e.vil">x</button>`,
    `<details open ontoggle="alert(1)"><summary>x</summary></details>`,
  ];
  for (const c of cases) {
    const s = sanitize(page(c), ctx());
    const html = out(s);
    assert.doesNotMatch(html, /<script|<iframe|<object|<embed|<meta|<base|<link|<math|<template|<noscript|<foreignObject|<animate/i, c);
    assert.doesNotMatch(html, /\son[a-z]+=|javascript:|srcdoc|xlink:href|formaction|e\.vil|data:text/i, c);
    assert.doesNotMatch(html, /\sstyle=/i, c);
    assert.doesNotMatch(s.problems.join(), /unsafe/, c);
  }
  // Escaped text stays text.
  assert.match(out(sanitize(page(`<p>&lt;script&gt;</p>`), ctx())), /&lt;script&gt;/);
});

test("XSS: CSS url(), @import, expression, behaviour, escapes and </style> breakouts are removed", () => {
  const evil = [
    `.a{background:url(http://e.vil/x.png)}`,
    `.a{background:URL( "https://e.vil" )}`,
    `.a{background-image:image-set("https://e.vil/x.png" 1x)}`,
    `@import url("https://e.vil/x.css");`,
    `@import "https://e.vil/x.css";`,
    `@font-face{font-family:x;src:url(https://e.vil/f.woff)}`,
    `.a{width:expression(alert(1))}`,
    `.a{behavior:url(x.htc)}`,
    `.a{-moz-binding:url(https://e.vil/x.xml#x)}`,
    `.a{background:u\\72l(https://e.vil)}`,
    `.a{background:\\75rl(https://e.vil)}`,
    `.a{color:red}</style><script>alert(1)</script><style>`,
    `@namespace svg url(http://www.w3.org/2000/svg);`,
    `.sheet{display:block}#reserve{opacity:0}.bar{top:0}[data-reserve]{display:none}.hp{position:static}`,
    `.a{position:fixed;top:0}`,
    `.a::before{content:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}`,
  ];
  for (const e of evil) {
    const s = sanitize(page("", e), ctx());
    assert.doesNotMatch(s.css, /url\s*\(|@import|@font-face|@namespace|expression|behavior|binding|image-set|<\/|\\7|position:fixed|e\.vil|\.sheet|#reserve|\.bar\b|\[data-reserve|\.hp\b/i, e);
    assert.doesNotMatch(s.body, /<script/i, e);
  }
  // Good CSS survives: media queries, keyframes, custom properties, gradients, content with a unicode escape.
  const good = sanitizeCss(`/*c*/:root{--a:#123}@media (max-width:900px){.a{display:grid;grid-template-columns:1fr}}@keyframes fade{from{opacity:.4}to{opacity:1}}.b::before{content:"\\2014"}.c{background:linear-gradient(rgba(0,0,0,.5),transparent)}.d{font-family:"Comic Sans MS",cursive}`, ctx());
  assert.match(good.css, /@media \(max-width:900px\)\{\.a\{display:grid;grid-template-columns:1fr\}\}/);
  assert.match(good.css, /@keyframes fade\{from\{opacity:\.4\}to\{opacity:1\}\}/);
  assert.match(good.css, /content:"\\2014"/);
  assert.match(good.css, /linear-gradient/);
  assert.match(good.css, /font-family:"DM Sans",cursive/);
});

test("links: unknown fragments go to #top, foreign links are unwrapped, unknown photos are dropped with their figure", () => {
  const s = sanitize(page(`<a href="#nowhere">a</a><a href="#join">b</a><a href="mailto:x@y.z">mail</a><figure><img src="ld-photo:p99" alt="x"><figcaption>gone</figcaption></figure><a href="${STAT}">Source: example.org</a>`), ctx());
  assert.match(s.body, /<a href="#top">a<\/a>/);
  assert.match(s.body, /<a href="#join">b<\/a>/);
  assert.match(s.body, /mail/);
  assert.doesNotMatch(s.body, /mailto|p99|gone/);
  assert.match(s.body, /target="_blank"/);
});

test("gate: missing hooks, invented numbers, review words, stats without source and oversize pages fall back", () => {
  assert.ok(gateCustom(page(""), ctx()), "the base page passes");
  assert.equal(gateCustom(page("").replace(/<form[\s\S]*<\/form>/, ""), ctx()), null, "no waitlist form");
  assert.equal(gateCustom(page("").replace(/href="#reserve" data-ld="reserve"/g, `href="#join"`), ctx()), null, "no reserve buttons");
  assert.ok(gateCustom(page("").replace(/<a [^>]*data-ld="reserve"[^>]*>[^<]*<\/a>/g, ""), ctx({ reserveEnabled: false })), "reserve not required when off");
  assert.equal(gateCustom(page("").replace("<h1>Hello</h1>", ""), ctx()), null, "no h1");
  assert.equal(gateCustom(page("<h1>Two</h1>"), ctx()), null, "two h1");
  assert.equal(gateCustom(page("").replace(/<img[^>]*>/g, ""), ctx()), null, "no photos");
  assert.equal(gateCustom(page("<p>Over 500 happy owners</p>"), ctx()), null, "invented number");
  assert.equal(gateCustom(page("<p>Loved in our reviews</p>"), ctx()), null, "review word");
  assert.equal(gateCustom(page("<p>★★★★★</p>"), ctx()), null, "stars");
  assert.equal(gateCustom(page("<p>Since 2019 in Leith</p>"), ctx()), null, "history");
  assert.equal(gateCustom(page("<p class='stat'>3 in 5</p>"), ctx()), null, "stat without source");
  assert.ok(gateCustom(page(`<p>3 in 5</p><a href="${STAT}">Source</a>`), ctx()), "stat with source");
  assert.ok(gateCustom(page("<p>Water every 2–3 weeks. £45, normally £60.</p>"), ctx()), "small digits and prices are fine");
  assert.equal(gateCustom(page(`<p>${"x".repeat(80_000)}</p>`), ctx()), null, "too big");
  assert.deepEqual(inventedClaims("Starter Jungle for £45", ctx().honesty!), []);
  assert.equal(extractFragment("Here you go:\n```html\n<style>a{}</style><header></header><footer>x</footer>\n```\nEnjoy"), "<style>a{}</style><header></header><footer>x</footer>");
});

test("mock generation + render: complete page, same script hash, no third-party resources but fonts", async () => {
  for (const name of ["dogwalk-en", "bakery-es"] as const) {
    const fx = loadFixture(name);
    const spec = validateModelSite(fx.model, fx.input).spec;
    const ph = [1, 2, 3, 4, 5].map((i) => ({ alt: `photo ${i}`, width: 1200, height: i % 2 ? 1600 : 800, credit: `"Photo ${i}" by Someone`, license: "cc0", sourceUrl: `https://stocksnap.io/photo/${i}` }));
    const r = await generateCustomSite(fx.input, ph, { spec });
    assert.equal(r.mock, true);
    assert.deepEqual(r.issues, [], `${name}: ${r.issues.join("; ")}`);
    assert.ok(r.html && r.html.startsWith("<style>"));
    const kit = { brand: fx.input.brand, logo: { options: fx.logos, chosen: fx.logos[0]!.id, fallback: false } };
    const html = customRender({ html: r.html!, spec, kit, photos: ph }, { reserved: 0, bchUsd: 480 }, { slug: fx.input.slug, origin: "https://launchdesk.app" });
    assert.ok(html, name);
    assert.match(html!, /^<!doctype html><html lang="[a-z-]+" data-template="custom">/);
    assert.match(html!, /id="reserve" role="dialog"/);
    assert.match(html!, /id="ld-bar" data-bar/);
    assert.match(html!, /bitcoincash:[a-z0-9]+\?amount=0\.\d+/);
    assert.match(html!, /data-hero/);
    assert.match(html!, /<form [^>]*data-lead>/);
    assert.match(html!, new RegExp(`src="/s/${fx.input.slug}/photo/1"`));
    assert.match(html!, /og:image" content="https:\/\/launchdesk\.app\/s\//);
    assert.match(html!, /(Photos|Fotos): <a href="https:\/\/stocksnap\.io/);
    assert.match(html!, /fonts\.googleapis\.com\/css2\?family=/);
    const scripts = [...html!.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0], SITE_JS);
    assert.equal(`sha256-${createHash("sha256").update(scripts[0]!).digest("base64")}`, SCRIPT_HASH);
    const srcs = [...html!.matchAll(/\ssrc="([^"]+)"/g)].map((m) => m[1]!);
    assert.ok(srcs.every((u) => u.startsWith("/s/")), srcs.join());
    assert.doesNotMatch(html!, /undefined|NaN|\[object Object\]|ld-photo:|data-ld=/);
  }
});

test("no reservations (no wallet): no reserve buttons, no sheet, no bar; still a valid page", async () => {
  const fx = loadFixture("dogwalk-en");
  const input = { ...fx.input, founderAddress: "" };
  const spec = validateModelSite(fx.model, input).spec;
  const ph = [1, 2, 3].map((i) => ({ alt: `p${i}`, width: 1200, height: 1600 }));
  const r = await generateCustomSite(input, ph, { spec });
  assert.ok(r.html, r.issues.join("; "));
  const html = customRender({ html: r.html!, spec, kit: { brand: input.brand }, photos: ph }, { reserved: 0 }, { slug: input.slug })!;
  assert.ok(html);
  assert.doesNotMatch(html, /<a [^>]*data-reserve|<div class="sheet" id="reserve"|<div id="ld-bar"/);
});

test("brief and helpers", () => {
  const fx = loadFixture("dogwalk-en");
  const b = customBrief(fx.input, [{ alt: "a", width: 1200, height: 1600, role: "hero" }, { alt: "b", width: 1600, height: 900 }]);
  assert.deepEqual(b.photos.map((p) => [p.id, p.aspect]), [["p1", "3:4"], ["p2", "16:9"]]);
  assert.ok(!JSON.stringify(b).includes(fx.input.founderAddress.slice(12)), "no wallet address in the brief");
  assert.ok(!("limit" in b.report.offer));
  assert.equal(aspectOf(1024, 683), "3:2");
  assert.equal(photoKey(0), "p1");
  assert.match(CUSTOM_SYSTEM, /data-ld="waitlist"/);
  assert.doesNotMatch(CUSTOM_SYSTEM, /starting with the rest/);
  assert.equal(fontsHref({ display: "Fraunces", text: "DM Sans" }), "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap");
  assert.equal(storeCtx(fx.input, []).mode, "store");
});

test("site quality net: BCH on the page, guard CSS, numerals, stats sorted for the page, reference page cached", async () => {
  const fx = loadFixture("dogwalk-en");
  const spec = validateModelSite(fx.model, fx.input).spec;
  const ph = [1, 2, 3, 4].map((i) => ({ alt: `photo ${i}`, width: 1200, height: 800 }));
  const r = await generateCustomSite(fx.input, ph, { spec });
  const html = customRender({ html: r.html!, spec, kit: { brand: fx.input.brand }, photos: ph }, { reserved: 0 }, { slug: fx.input.slug })!;
  assert.match(html, /<a [^>]*data-reserve><svg class="ld-coin"/, "reserve buttons carry the BCH coin");
  assert.match(html, /<p class="ld-note">Pay with Bitcoin Cash · instant · no account<\/p>/, "payment note under the hero button");
  assert.equal(html.match(/class="ld-note"/g)!.length, 1);
  assert.match(html, /@media\(max-width:560px\)\{\s*main section:not\(\[data-hero\]\)/, "phone photo guard after the model CSS");
  assert.ok(html.lastIndexOf("<style>:where(button") > html.indexOf("<style>#reserve"), "guard comes after the other stylesheets");
  const { decorateBody, guardCss } = await import("../server/site/custom-render.js");
  const d = decorateBody(`<p class="big num">€10–15</p><span class="num">£45</span>`);
  assert.match(d.body, /class="big num ld-c6"/);
  assert.deepEqual(d.chars, [6]);
  assert.doesNotMatch(guardCss(d.chars), /\.ld-c6\{font-size/, "no CSS rule sets a numeral size (it made small prices huge)");
  assert.match(html, /const fit=\(\)=>\{const W=h\.clientWidth;if\(W>560\)return;/, "phone numeral fit (shrink-only) inside the one allowed script");

  const { statKind } = await import("../server/site/stat-kind.js");
  assert.equal(statKind({ value: "1,729,963", label: "Barcelona population, 1 Jan 2026" }), "context");
  assert.equal(statKind({ value: "About €30/m²", label: "Asking rent per m², 27 m² unit" }), "context");
  assert.equal(statKind({ value: "€10–15", label: "Madrid 30-minute walk, Whopaws" }), "price");
  assert.equal(statKind({ value: "3 in 5", label: "new plant owners lose a plant in their first year" }), "demand");
  const b = customBrief({ ...fx.input, report: { ...fx.input.report, stats: [
    { value: "€10–15", label: "Madrid 30-minute walk, Whopaws", sourceUrl: "https://a.example/x" },
    { value: "277,353", label: "Eixample population, 2026", sourceUrl: "https://b.example/y" },
  ] } }, ph);
  assert.deepEqual(b.report.stats, [], "a competitor price is never the headline statistic");
  assert.equal(b.report.marketPrices[0]!.value, "€10–15");
  assert.match(b.reserve.label, /^Reserve with BCH · /);
  const { systemBlocks } = await import("../server/site/custom.js");
  const blocks = systemBlocks();
  assert.equal(blocks.length, 2);
  assert.match(blocks[1]!.text, /quality bar, not a layout to copy/);
  assert.ok(blocks[1]!.cache_control && !blocks[0]!.cache_control);
  assert.doesNotMatch(blocks[1]!.text, /example\.org\/plant-survey/, "the reference page carries no placeholder statistic");
});

test("the chosen logo sits next to the wordmark in the header, only when the link is the brand name", async () => {
  const svg = `<svg class="ld-logo" viewBox="0 0 64 64"><rect width="64" height="64"/></svg>`;
  const count = (h: string) => (/<header\b[\s\S]*?<\/header>/.exec(h)?.[0].match(/class="ld-logo"/g) ?? []).length;
  const once = headerLogo(GOLD, "Fern & Co", svg);
  assert.equal(count(once), 1, "Fern <span>&amp;</span> Co matches the brand Fern & Co");
  assert.match(once, /<a class="mark" href="#top"><svg class="ld-logo"/);
  assert.equal(headerLogo(once, "Fern & Co", svg), once, "applied twice: still one logo");
  assert.equal(headerLogo(GOLD, "Another Brand", svg), GOLD, "a wordmark that is not the brand name is left alone");
  assert.equal(headerLogo(GOLD, "Fern & Co", ""), GOLD, "no chosen logo: unchanged");
  assert.equal(headerLogo("<main><a href=\"#top\">Fern &amp; Co</a></main>", "Fern & Co", svg), "<main><a href=\"#top\">Fern &amp; Co</a></main>", "no header: unchanged");
  // end to end: the mock design's header wordmark gets the chosen logo; with no logo, nothing is added
  const fx = loadFixture("dogwalk-en");
  const spec = validateModelSite(fx.model, fx.input).spec;
  const ph = [1, 2, 3].map((i) => ({ alt: `p${i}`, width: 1200, height: 1600 }));
  const r = await generateCustomSite(fx.input, ph, { spec });
  const withLogo = customRender({ html: r.html!, spec, kit: { brand: fx.input.brand, logo: { options: fx.logos, chosen: fx.logos[0]!.id, fallback: false } }, photos: ph }, { reserved: 0 }, { slug: fx.input.slug })!;
  const without = customRender({ html: r.html!, spec, kit: { brand: fx.input.brand }, photos: ph }, { reserved: 0 }, { slug: fx.input.slug })!;
  assert.equal(count(withLogo), 1);
  assert.equal(count(without), 0);
  assert.match(withLogo, /header a\[href="#top"\]>svg\.ld-logo\{/);
});
