// WP2 · Logo options: the SVG linter is an XSS gate and a design gate; lockups, mock fixtures, repair/fallback.
// Zero spend: AI=mock. Run: node_modules/.bin/tsx --test test/brand.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.AI = "mock";
process.env.MOCK_AI = "1";

const { lintSymbol, pathPoints } = await import("../server/brand/lint.js");
const { lockupSvg, darkSymbol, remapPalette } = await import("../server/brand/compose.js");
const { PAIRINGS, googleFontsHref, casedName } = await import("../server/brand/fonts.js");
const { makeLogos, moreLogos, mockOptions, rank, loadFixtures, drawPrompt, markScore, STRONG_MONOGRAM } = await import("../server/brand/draw.js");
const { fallbackOptions } = await import("../server/brand/repair.js");
const { FONT_WHITELIST, BANNED_FONTS } = await import("../server/types.js");

const pal = { primary: "#2B211C", accent: "#C8813A", bg: "#F4EADF", ink: "#2B211C" };
const brand = { name: "Pausa", tagline: "A proper pause.", voice: "Warm", palette: pal, fonts: { display: "Fraunces", text: "Inter" }, lang: "en", currency: "€" };
const good = `<circle cx="32" cy="32" r="26" fill="#2B211C"/><rect x="24" y="18" width="6" height="28" rx="3" fill="#F4EADF"/><rect x="34" y="18" width="6" height="28" rx="3" fill="#C8813A"/>`;

test("a clean symbol passes and is rebuilt", () => {
  const r = lintSymbol(good, pal);
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.equal(r.stats.shapes, 3);
  assert.deepEqual(r.stats.colours.sort(), ["#2B211C", "#C8813A", "#F4EADF"].sort());
});

test("XSS: scripts, handlers, links, styles, foreignObject and entities never survive", () => {
  const evil = [
    `<script>alert(1)</script>${good}`,
    `<circle cx="32" cy="32" r="26" fill="#2B211C" onload="alert(1)"/>`,
    `<a href="javascript:alert(1)"><circle cx="32" cy="32" r="26" fill="#2B211C"/></a>${good}`,
    `<style>*{background:url(javascript:alert(1))}</style>${good}`,
    `<foreignObject><img src=x onerror=alert(1)></foreignObject>${good}`,
    `<image href="https://evil.example/x.png"/>${good}`,
    `<circle cx="32" cy="32" r="26" fill="url(javascript:alert(1))"/>`,
    `<path d="M4 4 L60 60&quot; onmouseover=&quot;alert(1)" fill="#2B211C"/>`,
    `<g transform="translate(0) expression(alert(1))">${good}</g>`,
    `<svg onload="alert(1)"><circle cx="32" cy="32" r="26" fill="#2B211C"/></svg>`,
    `<!-- <script>alert(1)</script> -->${good}<![CDATA[<script>alert(1)</script>]]>`,
    `<circle cx="32" cy="32" r="26" fill="#2B211C" style="fill:red"/><use href="#x"/>`,
    `<scr<script>ipt>alert(1)</script>${good}`,
    `<circle cx="32" cy="32" r="26" fill='#2B211C' xlink:href='javascript:alert(1)' />`,
  ];
  for (const e of evil) {
    const r = lintSymbol(e, pal);
    assert.doesNotMatch(r.svg, /script|on\w+=|href|style|javascript|foreignObject|<img|<image|<use|expression|url\(|&|<a\b|<svg/i, `leaked from: ${e}`);
    for (const m of r.svg.matchAll(/<\/?([a-z]+)/g)) assert.ok(["path", "circle", "rect", "ellipse", "polygon", "polyline", "line", "g"].includes(m[1]!), m[1]);
  }
});

test("design rules: palette, colour count, shape count, box, stroke, size", () => {
  assert.match(lintSymbol(`<circle cx="32" cy="32" r="26" fill="#00FF00"/>`, pal).errors.join(), /off-palette/);
  // near-palette snaps
  const snap = lintSymbol(`<circle cx="32" cy="32" r="26" fill="#2C221D"/>`, pal);
  assert.equal(snap.ok, true);
  assert.match(snap.svg, /#2B211C/);
  const many = Array.from({ length: 13 }, (_, i) => `<rect x="${4 + i * 4}" y="4" width="3" height="56" fill="#2B211C"/>`).join("");
  assert.match(lintSymbol(many, pal).errors.join(), /13 shapes/);
  assert.match(lintSymbol(`<circle cx="32" cy="32" r="40" fill="#2B211C"/>`, pal).errors.join(), /outside/);
  assert.match(lintSymbol(`<circle cx="32" cy="32" r="26" fill="none" stroke="#2B211C" stroke-width="1"/>`, pal).errors.join(), /thinner/);
  assert.match(lintSymbol(`<circle cx="32" cy="32" r="6" fill="#2B211C"/>`, pal).errors.join(), /too small/);
  assert.match(lintSymbol(`<circle cx="32" cy="32" r="26" fill="#F4EADF"/>`, pal).errors.join(), /background/);
  // a shape with no fill gets the ink, never the browser's black
  const nofill = lintSymbol(`<rect x="8" y="8" width="48" height="48"/>`, pal);
  assert.match(nofill.svg, /fill="#2B211C"/);
  // fill inherited from a group counts
  assert.equal(lintSymbol(`<g fill="#C8813A"><rect x="8" y="8" width="48" height="48"/></g>`, pal).ok, true);
  assert.equal(lintSymbol(`<path d="M8 56 A24 24 0 0 1 56 56 Z" fill="#2B211C"/>`, pal).ok, true);
});

test("path parser handles relative commands and implicit repeats", () => {
  const pts = pathPoints("m10 10 l10 0 10 10 h-20 v-10 z")!;
  assert.deepEqual(pts.at(-1), [10, 10]);
  assert.ok(pts.some(([x, y]) => x === 30 && y === 20));
  assert.equal(pathPoints("M10 10 L"), null);
});

test("lockups compose with escaped names, dark swap and the font", () => {
  const { svg, width } = lockupSvg(good, { name: `Pausa <b>&"`, palette: pal, font: "Fraunces", embedFont: true });
  assert.match(svg, /^<svg xmlns/);
  assert.match(svg, /&lt;b&gt;&amp;&quot;/);
  assert.match(svg, /fonts\.googleapis\.com\/css2\?family=Fraunces/);
  assert.ok(width > 64 + 60);
  const dark = darkSymbol(good, pal);
  assert.match(dark, /circle[^>]*fill="#F4EADF"/); // ink → paper
  assert.match(dark, /rect[^>]*fill="#2B211C"[^>]*\/><rect[^>]*#C8813A/); // cut-out → dark, accent stays
  for (const layout of ["stacked", "word", "icon"] as const) assert.match(lockupSvg(good, { name: "Pausa", palette: pal, font: "Fraunces", layout }).svg, /<\/svg>$/);
  assert.equal(casedName("segunda vuelta", "title"), "Segunda Vuelta");
});

test("font pairings are whitelisted, not banned, and loadable", () => {
  assert.equal(PAIRINGS.length, 16);
  for (const p of PAIRINGS) {
    for (const f of [p.display, p.text]) {
      assert.ok((FONT_WHITELIST as readonly string[]).includes(f), f);
      assert.ok(!BANNED_FONTS.includes(f), f);
    }
  }
  assert.match(googleFontsHref(["Space Grotesk", "Inter"]), /family=Space\+Grotesk:wght@[\d;]+&family=Inter/);
});

test("fallbacks always pass lint", () => {
  for (const o of fallbackOptions(brand)) assert.equal(lintSymbol(o.svg, pal).ok, true, o.id);
});

test("mock: fixtures load, survive re-lint, re-colour to another brand", async () => {
  const fx = loadFixtures();
  assert.ok(fx.length >= 1, "at least one fixture saved");
  for (const f of fx) for (const o of f.options) assert.equal(lintSymbol(o.svg, f.brand.palette).ok, true, `${f.id} ${o.id}`);
  const other = { ...brand, name: "Zzz Other", palette: { primary: "#112233", accent: "#EE5500", bg: "#FAFAFA", ink: "#112233" } };
  const opts = mockOptions(other);
  assert.ok(opts.length >= 3);
  for (const o of opts) assert.doesNotMatch(o.svg, new RegExp(fx.map((f) => f.brand.palette.accent).join("|"), "i"));
  const r = await makeLogos({ idea: "x", brand: other });
  assert.ok(r.options.length >= 3);
  assert.equal(r.chosen, r.options[0]!.id);
  assert.equal(r.costUsd, 0);
  const more = await moreLogos({ idea: "x", brand: other }, r, r.options.length);
  assert.ok(more.options.length >= r.options.length + 3);
  assert.equal(new Set(more.options.map((o) => o.id)).size, more.options.length, "ids unique");
  assert.ok(remapPalette(good, pal, other.palette).includes("#EE5500"));
});

test("rank puts one of each family first", () => {
  const o = (id: string, family: "literal" | "monogram" | "geometric") => ({ id, family, idea: "", svg: "" });
  assert.deepEqual(rank([o("a", "literal"), o("b", "literal"), o("c", "geometric"), o("d", "monogram")]).map((x) => x.id), ["a", "d", "c", "b"]);
});

test("draw prompt names the initial, clichés and what to avoid", () => {
  const p = drawPrompt({ idea: "A specialty coffee kiosk", brand }, ["two bars"]);
  assert.match(p, /letter "P"/);
  assert.match(p, /coffee cups/);
  assert.match(p, /"two bars"/);
});

test("plain monograms lose their first-three slot; marks with two meanings score higher", () => {
  const o = (id: string, family: "literal" | "monogram" | "geometric") => ({ id, family, idea: "", svg: "" });
  assert.deepEqual(rank([o("a", "literal"), o("m", "monogram"), o("c", "geometric"), o("b", "literal")], new Set(["m"])).map((x) => x.id), ["a", "c", "b", "m"]);
  const A = "#2F6F5E";
  const plainS = markScore({ family: "monogram", strength: 3, two_meanings: "an S", svg: "" }, `<path d="M10 10 L50 50" fill="none" stroke="#111111" stroke-width="6"/><rect x="50" y="50" width="6" height="6" fill="${A}"/>`, A);
  assert.ok(plainS < STRONG_MONOGRAM);
  const tally = markScore({ family: "literal", strength: 4, two_meanings: "five bars + one cross bar = weekdays + the midday walk", svg: "" }, `<rect x="8" y="10" width="6" height="44" fill="#111111"/><rect x="20" y="10" width="6" height="44" fill="#111111"/><rect x="4" y="28" width="56" height="8" fill="${A}"/>`, A);
  assert.ok(tally > plainS + 2);
});

test("draw prompt asks for the two meanings and an honest rating, with worked examples", () => {
  const p = drawPrompt({ idea: "A specialty coffee kiosk", brand }, []);
  assert.match(p, /two_meanings/);
  assert.match(p, /strength = your honest 1 to 5/);
  assert.match(p, /rejected as first-sketch level/);
});
