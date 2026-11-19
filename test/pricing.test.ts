// Run: node_modules/.bin/tsx --test test/pricing.test.ts
// BCH BLAZE launch price (server/pricing.ts): until 30 Nov 2026 23:59:59 Europe/Madrid the report costs 10¢ and the
// Launch kit 50¢; from the next second the regular $1 / $5 apply, with no restart. The clock is injected
// (setPriceClock), so this file passes on any date. Real-money mode with a dummy key: nothing here runs the AI, the
// price feeds are blocked (BCH_USD_FIXED) and nothing is broadcast.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const dir = mkdtempSync(join(tmpdir(), "launchdesk-pricing-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  MOCK_AI: "0",
  ANTHROPIC_API_KEY: "sk-test-dummy",
  ANTHROPIC_BASE_URL: "http://127.0.0.1:9", // never reached: no run starts in this file
  BCH_USD_FIXED: "400",
  DATABASE_URL: `file:${join(dir, "t.db")}`,
  MERCHANT_ADDRESS: "bitcoincash:qp9d679zvayvudj65nd9zlgezvjplr8g3vea64wad0",
  ELECTRUM_SERVERS: "ws://127.0.0.1:9",
  DEV_SKIP_PAYMENT: "1",
  PRICE_VALIDATE_CENTS: "",
  PRICE_BUILD_CENTS: "",
  PRICE_VALIDATE_REGULAR_CENTS: "",
  PRICE_BUILD_REGULAR_CENTS: "",
  LAUNCH_PRICE_UNTIL: "",
  PRICE_NOW: "",
});
delete process.env.ESCROW;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
  throw new Error(`blocked in test: ${String(input)}`);
}) as typeof fetch;

const { app, withPrices } = await import("../server/app.js");
const db = await import("../server/db.js");
const { config } = await import("../server/config.js");
const pricing = await import("../server/pricing.js");
const ui = await import("../web/proto/prices.ts");
await db.migrate();

// The last launch second is 30 Nov 2026 23:59:59 in Madrid (CET, UTC+1) = 22:59:59 UTC.
const LAST_LAUNCH_MS = Date.parse("2026-11-30T22:59:59.999Z");
const FIRST_REGULAR_MS = Date.parse("2026-11-30T23:00:00.000Z"); // 1 Dec 2026 00:00 Madrid
const DURING = Date.parse("2026-11-20T12:00:00Z");
const AFTER = Date.parse("2026-12-02T09:00:00Z");
const at = (ms: number) => pricing.setPriceClock(() => ms);

test.after(() => {
  pricing.setPriceClock(null);
  globalThis.fetch = realFetch;
});

test("config: launch prices 10¢ / 50¢, regular $1 / $5, launch until 30 Nov 2026 23:59:59 Madrid", () => {
  assert.deepEqual(config.priceCents, { validate: 10, build: 50 });
  assert.deepEqual(config.regularPriceCents, { validate: 100, build: 500 });
  assert.equal(config.launchPriceUntil, Date.parse("2026-11-30T23:59:59+01:00"));
  assert.equal(new Date(config.launchPriceUntil).toISOString(), "2026-11-30T22:59:59.000Z");
});

test("the price switches by date (injected clock), the end second included", () => {
  for (const now of [DURING, Date.parse("2026-11-30T22:59:59.000Z"), LAST_LAUNCH_MS]) {
    assert.equal(pricing.launchPriceOn(now), true, new Date(now).toISOString());
    assert.equal(pricing.stagePriceCents("validate", now), 10);
    assert.equal(pricing.stagePriceCents("build", now), 50);
  }
  for (const now of [FIRST_REGULAR_MS, AFTER, Date.parse("2027-06-01T00:00:00Z")]) {
    assert.equal(pricing.launchPriceOn(now), false, new Date(now).toISOString());
    assert.deepEqual(pricing.currentPrices(now), { validate: 100, build: 500 });
  }
  // the default argument follows the clock: no restart needed at the switch
  at(LAST_LAUNCH_MS);
  assert.equal(pricing.stagePriceCents("validate"), 10);
  at(FIRST_REGULAR_MS);
  assert.equal(pricing.stagePriceCents("validate"), 100);
  assert.equal(pricing.stagePriceCents("build"), 500);
});

test("the switch date and regular prices come from config", () => {
  const keep = { until: config.launchPriceUntil, regular: { ...config.regularPriceCents } };
  try {
    config.launchPriceUntil = Date.parse("2026-12-15T23:59:59+01:00");
    config.regularPriceCents.validate = 150;
    assert.equal(pricing.stagePriceCents("validate", AFTER), 10, "still the launch price on 2 Dec");
    assert.equal(pricing.stagePriceCents("validate", Date.parse("2026-12-16T00:00:00+01:00")), 150);
    assert.match(pricing.launchNote(AFTER), /from 16 Dec: \$1\.50 report · \$5 kit$/);
  } finally {
    config.launchPriceUntil = keep.until;
    Object.assign(config.regularPriceCents, keep.regular);
  }
});

test("/api/config: today's prices, the regular ones and the launch end date", async () => {
  at(DURING);
  let c = (await (await app.request("http://example.test/api/config")).json()) as Record<string, unknown>;
  assert.deepEqual(c.prices, { validate: 10, build: 50 });
  assert.deepEqual(c.regularPrices, { validate: 100, build: 500 });
  assert.equal(c.launchPrice, true);
  assert.equal(c.launchPriceUntil, "2026-11-30T22:59:59.000Z");
  at(AFTER);
  c = (await (await app.request("http://example.test/api/config")).json()) as Record<string, unknown>;
  assert.deepEqual(c.prices, { validate: 100, build: 500 });
  assert.deepEqual(c.regularPrices, { validate: 100, build: 500 });
  assert.equal(c.launchPrice, false);
  assert.equal(c.launchPriceUntil, "2026-11-30T22:59:59.000Z");
});

// ---- quotes ------------------------------------------------------------------------------------------------------
let n = 0;
async function project() {
  const id = `PR${++n}x`;
  const key = `owner-${id}`;
  await db.exec("INSERT INTO projects (id, idea, created_at, owner_hash) VALUES (?, ?, ?, ?)", [id, "A small bakery in Ruzafa selling sourdough at 4 euros", Date.now(), createHash("sha256").update(key).digest("hex")]);
  return { id, key };
}
async function call<T = any>(path: string, body: unknown, key: string, host = "http://example.test") {
  const res = await app.request(host + path, { method: "POST", headers: { "content-type": "application/json", "x-owner-key": key, "x-forwarded-for": "10.2.0.1" }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as T };
}
const satsFor = (cents: number) => Math.ceil((cents / 100 / 400) * 1e8);

test("quotes: 10¢ in the launch window, $1 after it", async () => {
  at(DURING);
  const a = await project();
  const q1 = await call<{ sats: number; cents: number }>(`/api/projects/${a.id}/quote`, { stage: "validate" }, a.key);
  assert.equal(q1.status, 200, JSON.stringify(q1.json));
  assert.equal(q1.json.cents, 10);
  assert.equal(q1.json.sats, satsFor(10)); // 25,000 sats at $400

  at(AFTER);
  const b = await project();
  const q2 = await call<{ sats: number; cents: number }>(`/api/projects/${b.id}/quote`, { stage: "validate" }, b.key);
  assert.equal(q2.status, 200, JSON.stringify(q2.json));
  assert.equal(q2.json.cents, 100);
  assert.equal(q2.json.sats, satsFor(100)); // 250,000 sats at $400
});

test("quotes: one issued before the switch keeps its sats and price; the payment is recorded at that price", async () => {
  const t0 = LAST_LAUNCH_MS - 60_000;
  at(t0);
  const { id, key } = await project();
  const q1 = await call<{ sats: number; cents: number }>(`/api/projects/${id}/quote`, { stage: "validate" }, key);
  assert.equal(q1.json.cents, 10);
  // two minutes later the regular price applies, but the open quote (15 min) is what the wallet was asked for
  at(t0 + 120_000);
  assert.equal(pricing.stagePriceCents("validate"), 100);
  const q2 = await call<{ sats: number; cents: number }>(`/api/projects/${id}/quote`, { stage: "validate" }, key);
  assert.equal(q2.json.sats, q1.json.sats);
  assert.equal(q2.json.cents, 10);
  assert.equal(await pricing.quotedCents(id, "validate"), 10);
  const paid = await call<{ payments: { validate?: { cents: number } } }>(`/api/projects/${id}/pay`, { stage: "validate", dev: true }, key, "http://localhost");
  assert.equal(paid.status, 200, JSON.stringify(paid.json));
  assert.equal(paid.json.payments.validate?.cents, 10);
  // a project with no quote is recorded at today's price
  const other = await project();
  assert.equal(await pricing.quotedCents(other.id, "validate"), 100);
});

test("spend caps stay as they are and below every price: report cap and kit cap 45¢", async () => {
  const { REPORT_CAP_USD } = await import("../server/cost.js");
  assert.equal(config.kitSpendCapCents, 45);
  for (const now of [DURING, AFTER]) {
    assert.ok(REPORT_CAP_USD * 100 <= pricing.stagePriceCents("validate", now), "the report never costs more AI than it is sold for");
    assert.ok(config.kitSpendCapCents <= pricing.stagePriceCents("build", now), "the kit never costs more AI than it is sold for");
  }
});

// ---- shown prices ------------------------------------------------------------------------------------------------
test("home page: launch prices and the launch note while the window is open; regular prices and no note after", () => {
  const src = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  const notes = (html: string) => [...html.matchAll(/<(p|span)\b[^>]*data-launch-note([^>]*)>((?:[^<]+|<span>[^<]*<\/span>)*)<\/\1>/g)];
  assert.ok(notes(src).length >= 3, "hero, How it works and the last CTA carry the note");

  const during = withPrices(src, DURING);
  assert.ok(notes(during).every((m) => !/hidden/.test(m[2]!) && m[3]!.replace(/<[^>]+>/g, "") === "BLAZE launch price · from 1 Dec: $1 report · $5 kit"));
  assert.match(during, /<span data-price="validate">10¢<\/span>/);
  assert.match(during, /<span data-price="build">50¢<\/span>/);
  assert.match(during, /content="Check your business idea for 10¢/);

  const after = withPrices(src, AFTER);
  assert.ok(notes(after).every((m) => /hidden/.test(m[2]!) && m[3] === ""), "the note is hidden and empty after the window");
  assert.doesNotMatch(after, /launch price/);
  assert.match(after, /<span data-price="validate">\$1<\/span>/);
  assert.match(after, /<span data-price="build">\$5<\/span>/);
  assert.doesNotMatch(after, /data-price="(validate|build)">(10|50)¢/);
  assert.match(after, /content="Check your business idea for \$1 in Bitcoin Cash/);
  assert.doesNotMatch(after, /100¢|500¢/);
});

test("UI formatting: 10¢, 50¢, $1, $5 (never 100¢), and the launch note follows /api/config", () => {
  assert.equal(ui.fmtCents(10), "10¢");
  assert.equal(ui.fmtCents(50), "50¢");
  assert.equal(ui.fmtCents(100), "$1");
  assert.equal(ui.fmtCents(500), "$5");
  assert.equal(ui.fmtCents(150), "$1.50");
  assert.equal(pricing.fmtCents(100), "$1");
  assert.equal(pricing.fmtCents(500), "$5");
  assert.equal(ui.centsWords(500), "5 dollars");

  const now = Date.parse("2026-11-20T12:00:00Z");
  ui.setPrices({ prices: { validate: 10, build: 50 }, regularPrices: { validate: 100, build: 500 }, launchPrice: true, launchPriceUntil: "2026-11-30T22:59:59.000Z" });
  assert.equal(ui.priceText("validate"), "10¢");
  assert.equal(ui.regularFrom(), "1 Dec");
  assert.equal(ui.launchNote(now), "BLAZE launch price · from 1 Dec: $1 report · $5 kit");
  at(DURING);
  assert.equal(ui.launchNote(now), pricing.launchNote(), "server and UI say the same line");
  assert.ok(!/normally|<s>|line-through/i.test(ui.launchNote(now)));
  assert.equal(ui.launchNote(Date.parse("2026-12-01T00:00:00+01:00")), "", "a page left open past midnight drops the note");
  assert.match(ui.launchNoteHtml("x"), /^<p class="launch-note x" data-launch-note><span>BLAZE launch price ·<\/span> <span>from 1 Dec: \$1 report · \$5 kit<\/span><\/p>$/);

  ui.setPrices({ prices: { validate: 100, build: 500 }, regularPrices: { validate: 100, build: 500 }, launchPrice: false, launchPriceUntil: "2026-11-30T22:59:59.000Z" });
  assert.equal(ui.priceText("validate"), "$1");
  assert.equal(ui.priceText("build"), "$5");
  assert.equal(ui.priceWords("validate"), "1 dollar");
  assert.equal(ui.priceWords("build"), "5 dollars");
  assert.equal(ui.launchNote(), "");
  assert.match(ui.launchNoteHtml(), /data-launch-note hidden><\/p>$/);
  at(AFTER);
  assert.equal(pricing.launchNote(), "");
  // back to the defaults for any later test in this process
  ui.setPrices({ prices: { validate: 10, build: 50 }, launchPrice: true });
});
