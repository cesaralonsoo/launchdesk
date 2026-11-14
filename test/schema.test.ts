// Checks the structured-output schemas against the API rules and the mock data, and the sanitizers.
// Run: npx tsx test/schema.test.ts
import assert from "node:assert/strict";
process.env.MOCK_AI = "1";
process.env.DATABASE_URL = ":memory:"; // never touch local.db
const { SCHEMAS, SIGNAL_NAMES, sanitize } = await import("../server/ai.js");
const { mockFor } = await import("../server/mocks.js");
const { LOGO_ICONS } = await import("../server/types.js");

type S = Record<string, any>;
const UNSUPPORTED = ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "multipleOf", "pattern"];

/** Every object: all properties required, additionalProperties false; no unsupported keywords. */
function checkSchema(s: S, path: string) {
  for (const k of UNSUPPORTED) assert.ok(!(k in s), `${path}: unsupported keyword ${k}`);
  if (s.type === "object") {
    assert.equal(s.additionalProperties, false, `${path}: additionalProperties`);
    assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), `${path}: required`);
    for (const [k, v] of Object.entries(s.properties)) checkSchema(v as S, `${path}.${k}`);
  }
  if (s.type === "array") checkSchema(s.items, `${path}[]`);
}

/** Minimal validator for the subset of JSON Schema we use. */
function validate(s: S, v: unknown, path: string) {
  if (s.enum) return assert.ok(s.enum.includes(v), `${path}: ${String(v)} not in enum`);
  switch (s.type) {
    case "object": {
      assert.ok(v && typeof v === "object" && !Array.isArray(v), `${path}: object`);
      const o = v as Record<string, unknown>;
      assert.deepEqual(Object.keys(o).sort(), Object.keys(s.properties).sort(), `${path}: keys`);
      for (const [k, sub] of Object.entries(s.properties)) validate(sub as S, o[k], `${path}.${k}`);
      return;
    }
    case "array":
      assert.ok(Array.isArray(v), `${path}: array`);
      return (v as unknown[]).forEach((x, i) => validate(s.items, x, `${path}[${i}]`));
    case "string":
      return assert.equal(typeof v, "string", path);
    case "number":
      return assert.ok(typeof v === "number" && Number.isFinite(v), path);
    case "integer":
      return assert.ok(Number.isInteger(v), path);
    case "boolean":
      return assert.equal(typeof v, "boolean", path);
    default:
      assert.fail(`${path}: unknown schema type ${s.type}`);
  }
}

for (const [dept, schema] of Object.entries(SCHEMAS)) {
  checkSchema(schema, dept);
  validate(schema, mockFor(dept as keyof typeof SCHEMAS), dept);
}
assert.deepEqual((SCHEMAS.dex as S).properties.logos.items.properties.icon.enum, [...LOGO_ICONS]);

// mock content sizes match what the UI expects
const mia = mockFor("mia");
assert.equal(new Set(mia.weeks.map((w) => w.dept)).size, 7);
const leo = mockFor("leo");
assert.deepEqual(leo.signals.map((s) => s.name), [...SIGNAL_NAMES]);
const sam = mockFor("sam");
assert.equal(sam.months.length, 12);
assert.equal(sam.months.find((m) => m.revenue >= m.costs)?.month, sam.break_even.month);
assert.equal(mockFor("nova").names.length, 3);
assert.equal(mockFor("dex").logos.length, 3);
const rae = mockFor("rae");
assert.ok(rae.posts.length >= 18 && rae.posts.length <= 22);
assert.equal(rae.first_posts.length, 3);

// sanitizers
const l2 = sanitize("leo", { ...mockFor("leo"), score: 12.345, signals: [{ name: "Timing", score: -3 }] });
assert.equal(l2.score, 10);
assert.deepEqual(l2.signals.map((s) => s.name), [...SIGNAL_NAMES]);
assert.equal(l2.signals[4]!.score, 0);

const s2 = mockFor("sam");
s2.break_even.month = 2;
s2.months.reverse();
const s2s = sanitize("sam", s2);
assert.deepEqual(s2s.months.map((m) => m.month), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
assert.equal(s2s.break_even.month, 6, "break-even is recomputed from the table");
const never = mockFor("sam");
never.months.forEach((m) => (m.costs = m.revenue + 1));
never.break_even.month = 15;
assert.equal(sanitize("sam", never).break_even.month, 15);

const n2 = mockFor("nova");
n2.names[0]!.palette = [{ name: "Accent", hex: "abc" }, { name: "Primary", hex: "#112233" }];
n2.chosen = 7;
const n2s = sanitize("nova", n2);
assert.deepEqual(n2s.names[0]!.palette.map((p) => p.name), ["Primary", "Accent", "Background", "Extra"]);
assert.equal(n2s.names[0]!.palette[0]!.hex, "#112233");
assert.equal(n2s.names[0]!.palette[1]!.hex, "#AABBCC");
assert.equal(n2s.chosen, 2);

const d2 = mockFor("dex");
(d2.logos[0] as { icon: string }).icon = "rocket";
d2.logos[0]!.monogram = "abc";
d2.landing.price_hint_usd = 99999;
const d2s = sanitize("dex", d2);
assert.equal(d2s.logos[0]!.icon, "spark");
assert.equal(d2s.logos[0]!.monogram, "AB");
assert.equal(d2s.landing.price_hint_usd, 1000);

const r2 = mockFor("rae");
r2.handle = "Pausa BCN";
r2.posts.push({ day: 31, channel: "IG", title: "x" }, { day: 1, channel: "TT", title: "dup" });
const r2s = sanitize("rae", r2);
assert.equal(r2s.handle, "@pausabcn");
assert.equal(r2s.posts.length, 20);

const { slugify } = await import("../server/jobs.js");
assert.equal(slugify("Cafè Andén!"), "cafe-anden");
assert.equal(slugify("   "), "");

console.log("schemas and sanitizers: all passed");
