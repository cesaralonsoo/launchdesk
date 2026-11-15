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
  if (s.anyOf) return s.anyOf.forEach((x: S, i: number) => checkSchema(x, `${path}|${i}`));
  for (const k of UNSUPPORTED) assert.ok(!(k in s), `${path}: unsupported keyword ${k}`);
  if (s.type === "object") {
    assert.equal(s.additionalProperties, false, `${path}: additionalProperties`);
    assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), `${path}: required`);
    for (const [k, v] of Object.entries(s.properties)) checkSchema(v as S, `${path}.${k}`);
  }
  if (s.type === "array") checkSchema(s.items, `${path}[]`);
}

/** Minimal validator for the subset of JSON Schema we use. */
function validate(s: S, v: unknown, path: string): void {
  if (s.anyOf) {
    const ok = s.anyOf.some((x: S) => {
      try {
        validate(x, v, path);
        return true;
      } catch {
        return false;
      }
    });
    return assert.ok(ok, `${path}: matches no anyOf branch`);
  }
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
    case "null":
      return assert.equal(v, null, path);
    default:
      assert.fail(`${path}: unknown schema type ${s.type}`);
  }
}

const { sampleIdea } = await import("../server/mocks.js");
const KEYS = ["coffee", "dog", "bikes", "bread"] as const;
for (const [dept, schema] of Object.entries(SCHEMAS)) {
  checkSchema(schema, dept);
  for (const k of KEYS) validate(schema, mockFor(dept as keyof typeof SCHEMAS, sampleIdea(k)), `${k}.${dept}`);
}
assert.deepEqual((SCHEMAS.dex as S).properties.logos.items.properties.icon.enum, [...LOGO_ICONS]);

// mock content sizes match what the UI expects (v4 shapes, spec-v4 §3.1)
const mia = mockFor("mia");
assert.ok(mia.checklist.length >= 8 && mia.checklist.length <= 12);
assert.ok(mia.market.currency);
const leo = mockFor("leo");
assert.deepEqual(leo.signals.map((s) => s.name), [...SIGNAL_NAMES]);
assert.equal(leo.interviews.questions.length, 5);
assert.ok(leo.market_facts.every((f) => f.is_estimate && f.source_id === null), "mocks never cite sources");
const sam = sanitize("sam", mockFor("sam"));
assert.equal(sam.months.length, 12);
assert.equal(sam.months.find((m) => m.revenue >= m.costs)?.month ?? null, sam.break_even.month);
assert.equal(sam.cash_needed.value, -Math.min(...sam.months.map((m) => m.cash), -sam.startup_cost.value));
assert.equal(sam.months[0]!.cash, sam.months[0]!.revenue - sam.months[0]!.costs - sam.startup_cost.value);
assert.equal(mockFor("nova").names.length, 3);
assert.equal(mockFor("dex").logos.length, 3);
assert.equal(mockFor("dex").landing.faq.length, 3);
const rae = mockFor("rae");
assert.ok(rae.posts.length >= 10 && rae.posts.length <= 20);
assert.equal(rae.first_posts.length, 3);

// sanitizers
const l2 = sanitize("leo", { ...mockFor("leo"), score: 12.345, signals: [{ name: "Timing", score: -3, why: "x", source_id: 4 }] });
assert.equal(l2.score, 6.4, "v6: missing signals take the clamped score (10), capped at 7.5 with no source; Timing 0 → 0.85 × 7.5");
assert.equal(l2.verdict, "pivot", "a signal at 3 or below blocks a go");
assert.ok(l2.pivot, "a pivot is always present when the verdict is not go");
assert.deepEqual(l2.signals.map((s) => s.name), [...SIGNAL_NAMES]);
assert.equal(l2.signals[4]!.score, 0);
assert.equal(l2.signals[4]!.source_id, null, "no web sources yet: ids are dropped");
assert.deepEqual(l2.sources, []);

const s2 = mockFor("sam");
s2.assumptions = s2.assumptions.map((a) => (a.key === "fixed_costs_month" ? { ...a, value: 1e9 } : a));
s2.fixed_costs_breakdown = [{ label: "Everything", value: 1e9 }]; // v6: the breakdown is the source of truth
const s2s = sanitize("sam", s2);
assert.deepEqual(s2s.months.map((m) => m.month), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
assert.equal(s2s.break_even.month, null, "no break-even in year 1");
assert.throws(() => sanitize("sam", { ...mockFor("sam"), assumptions: [] }));

const n2 = mockFor("nova");
n2.names[0]!.palette = [{ name: "Accent", hex: "abc" }, { name: "Primary", hex: "#112233" }];
n2.chosen = 7;
n2.typography = { display: "Sora", body: "inter" };
const n2s = sanitize("nova", n2);
assert.deepEqual(n2s.names[0]!.palette.map((p) => p.name), ["Primary", "Accent", "Background", "Extra"]);
assert.equal(n2s.names[0]!.palette[0]!.hex, "#112233");
assert.equal(n2s.names[0]!.palette[1]!.hex, "#AABBCC");
assert.equal(n2s.chosen, 2);
assert.deepEqual(n2s.typography, { display: "Fraunces", body: "Inter" });

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
const extra = { channel: "instagram" as const, time: "9", format: "post" as const, hook: "x", caption: "", cta: "" };
r2.posts.push({ ...extra, day: 31 }, { ...extra, day: 1 });
const r2s = sanitize("rae", r2);
assert.equal(r2s.handle, "@pausabcn");
assert.equal(r2s.posts.length, mockFor("rae").posts.length);

// normalize(): v3 saved projects still render
const { normalize } = await import("../server/types.js");
const old = {
  id: "x", idea: "y", created_at: 0, payments: {}, status: {}, timings: {}, models: {},
  results: {
    mia: { title: "t", one_liner: "o", brief: { concept: "", for: "", goal: "" }, weeks: [{ dept: "leo", week: 1, task: "Count footfall" }] },
    leo: { ...mockFor("leo"), risks: ["Rent is high"], market_facts: [{ fact: "f", source: "Estimate", is_estimate: true }] },
    sam: { currency: "€", canvas: {}, price: { value: "€3.20", note: "" }, startup_cost: { value: "€38k", note: "" }, break_even: { month: 2, note: "" },
      months: [{ month: 1, revenue: 10, costs: 20 }, { month: 2, revenue: 30, costs: 20 }], year1: {}, main_risk: "" },
    nova: { ...mockFor("nova"), typography: { headline: "Sora", body: "Plus Jakarta Sans" } },
    rae: { start_date: "2026-01-01", handle: "@a", posts: [{ day: 1, channel: "IG", title: "Teaser" }], first_posts: [{ kind: "", title: "", text: "", date: "", channel: "Mail" }] },
  },
} as any;
const n = normalize(old).results;
assert.equal(n.mia!.checklist[0]!.task, "Count footfall");
assert.equal(n.mia!.checklist[0]!.helped_by, "leo");
assert.deepEqual(n.leo!.risks[0], { risk: "Rent is high", mitigation: "", severity: "med" });
assert.equal(n.leo!.market_facts[0]!.source_id, null);
assert.equal(n.sam!.price.value, 3.2);
assert.equal(n.sam!.startup_cost.value, 38000);
assert.equal(n.sam!.months[1]!.cash, -38000);
assert.equal(n.sam!.cash_needed.value, 38010);
assert.equal(n.nova!.typography.display, "Fraunces");
assert.equal(n.rae!.posts[0]!.channel, "instagram");
assert.equal(n.rae!.posts[0]!.hook, "Teaser");
assert.equal(n.rae!.first_posts[0]!.channel, "email");
assert.deepEqual(normalize(structuredClone(old)), normalize(normalize(structuredClone(old))), "idempotent");

const { slugify } = await import("../server/jobs.js");
assert.equal(slugify("Cafè Andén!"), "cafe-anden");
assert.equal(slugify("   "), "");

await import("./quality.test.js");
await import("./v7.test.ts");
console.log("schemas and sanitizers: all passed");
