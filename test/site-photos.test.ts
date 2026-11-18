// site2 photos module: zero spend, zero network (fake fetch, temp DB). Run: MOCK_AI=1 node_modules/.bin/tsx --test test/site-photos.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "ld-photos-"));
Object.assign(process.env, { MOCK_AI: "1", ANTHROPIC_API_KEY: "", DATABASE_URL: `file:${join(dir, "photos.db")}`, PHOTO_VISION: "" });

// Any real network call is a test failure.
globalThis.fetch = (async (u: unknown) => {
  throw new Error(`unexpected network call: ${String(u)}`);
}) as typeof fetch;

const P = await import("../server/site/photos.js");
const DB = await import("../server/site/photos-db.js");
const { Hono } = await import("hono");

const FX = join(process.cwd(), "server/site/fixtures/photos");
const jpeg = (f: string) => new Uint8Array(readFileSync(join(FX, f)));
const quiet = () => {};

// ───────────────────────────────────────────── fake upstream
type Hit = { id: string; source: string; title: string; w: number; h: number; url: string; license?: string; tags?: string[]; filetype?: string | null };
const ovResult = (r: Hit) => ({
  id: r.id, title: r.title, foreign_landing_url: `https://example.org/landing/${r.id}`, url: r.url, creator: "Jo Doe", creator_url: null,
  license: r.license ?? "cc0", license_version: "1.0", license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
  source: r.source, filetype: r.filetype === undefined ? "jpg" : r.filetype, width: r.w, height: r.h, tags: (r.tags ?? []).map((name) => ({ name })),
  thumbnail: `https://api.openverse.org/v1/images/${r.id}/thumb/`,
});
const OV_HITS: Hit[] = [
  { id: "a1", source: "rawpixel", title: "Free plant shop photo", w: 3500, h: 2333, url: "https://images.rawpixel.com/image_1300/czNmcy1wcml2YXRl.jpg" },
  { id: "a2", source: "wordpress", title: "Three houseplants in white pots on a wooden floor", w: 2048, h: 1276, url: "https://pd.w.org/2025/09/abc-2048x1276.jpg" },
  { id: "a3", source: "stocksnap", title: "Laptop Desk", w: 6000, h: 4000, url: "https://cdn.stocksnap.io/img-thumbs/960w/X1.jpg" },
  { id: "a4", source: "stocksnap", title: "Barista Pouring", w: 4135, h: 2757, url: "https://cdn.stocksnap.io/img-thumbs/960w/X2.jpg" },
  { id: "a5", source: "rawpixel", title: "Brown dog yellow leash", w: 3000, h: 2000, url: "https://images.rawpixel.com/editor_1024/ZG9n.jpg" },
  { id: "a6", source: "rawpixel", title: "Woman working laptop", w: 4471, h: 2981, url: "https://images.rawpixel.com/editor_1024/d29t.jpg" },
  { id: "bad1", source: "rawpixel", title: "Bowl (wan) Water Plants Arabesques", w: 3333, h: 1948, url: "https://images.rawpixel.com/editor_1024/bad1.jpg", tags: ["museum"] },
  { id: "bad2", source: "rawpixel", title: "Potted succulent png sticker", w: 4000, h: 4000, url: "https://images.rawpixel.com/image_png_1300/bad2.png" },
  { id: "bad3", source: "stocksnap", title: "Tiny", w: 640, h: 480, url: "https://cdn.stocksnap.io/img-thumbs/960w/T.jpg" },
  { id: "bad4", source: "flickr", title: "Flickr thing", w: 3000, h: 2000, url: "https://live.staticflickr.com/x.jpg" },
];
const BYTES: Record<string, Uint8Array> = {
  "czNmcy1wcml2YXRl": jpeg("plant-shop.jpg"),
  "abc-1536x957.jpg": jpeg("houseplants.jpg"),
  "X1.jpg": jpeg("laptop-desk.jpg"),
  "X2.jpg": jpeg("barista-pouring.jpg"),
  "ZG9n": jpeg("dog-leash.jpg"),
  "d29t": jpeg("laptop-woman.jpg"),
  "Leith_Shore": jpeg("dog-walk.jpg"),
};
const COMMONS_JSON = {
  query: {
    pages: {
      "11": { pageid: 11, index: 1, title: "File:Leith_Shore.jpg", imageinfo: [{ mime: "image/jpeg", width: 4000, height: 2600, thumburl: "https://upload.wikimedia.org/thumb/Leith_Shore.jpg/1280px-Leith_Shore.jpg", url: "https://upload.wikimedia.org/Leith_Shore.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Leith_Shore.jpg", extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, Artist: { value: '<a href="//x">Kim Lee</a>' } } }] },
      "12": { pageid: 12, index: 2, title: "File:Old map.jpg", imageinfo: [{ mime: "image/jpeg", width: 4000, height: 2600, thumburl: "https://upload.wikimedia.org/thumb/map.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Old_map.jpg", extmetadata: { LicenseShortName: { value: "All rights reserved" } } }] },
    },
  },
};

function fakeFetch(opts: { slow?: boolean; bigImages?: boolean } = {}) {
  const calls: string[] = [];
  const f = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (opts.slow)
      return new Promise<Response>((_, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted")), { once: true }));
    if (url.startsWith("https://api.openverse.org/v1/images/?")) return Response.json({ result_count: OV_HITS.length, results: OV_HITS.map(ovResult) });
    if (url.startsWith("https://commons.wikimedia.org/w/api.php")) return Response.json(COMMONS_JSON);
    if (opts.bigImages) return new Response(new Uint8Array(P.MAX_PHOTO_BYTES + 10), { headers: { "content-type": "image/jpeg" } });
    const key = Object.keys(BYTES).find((k) => url.includes(k));
    if (key) return new Response(BYTES[key]!, { headers: { "content-type": "image/jpeg" } });
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
  return { f, calls };
}

// ───────────────────────────────────────────── queries
test("queries: categories, cleaning, model queries first, place only with a city", () => {
  assert.equal(P.categoryOf("A plant shop in Leith")?.key, "plants");
  assert.equal(P.categoryOf("Online plant shop")?.key, "plants", "first match wins over 'online'");
  assert.equal(P.categoryOf("Dog walking in Madrid")?.key, "dogs");
  assert.equal(P.categoryOf("Invoicing app for freelancers")?.key, "work");
  assert.equal(P.categoryOf("Yoga for seniors in Valencia")?.key, "fitness");
  assert.equal(P.categoryOf("Panadería de barrio")?.key, "bakery");
  assert.equal(P.categoryOf("zzz"), null);
  assert.equal(P.cleanQuery("  Best Coffee-Kiosk SOLUTION, Barcelona 2026! extra words"), "coffee kiosk barcelona");
  const q = P.buildQueries({ idea: "Coffee kiosk", city: "Barcelona", queries: { hero: ["Barista Pouring!!"], place: ["Barceloneta beach"] } });
  assert.equal(q.hero[0], "barista pouring");
  assert.ok(q.hero.includes("barista coffee"));
  assert.ok(q.hero.length <= 4 && q.detail.length <= 4 && q.people.length <= 3);
  assert.deepEqual(q.place, ["Barceloneta beach", "Barcelona street", "Barcelona"]);
  assert.deepEqual(P.buildQueries({ idea: "Invoicing app" }).place, []);
  assert.ok(P.buildQueries({ idea: "zzz" }).hero.length > 0, "generic defaults when no category matches");
});

// ───────────────────────────────────────────── filters
test("filters: licence, size, museum objects, stickers, ratio, dedupe", () => {
  const parsed = P.parseOpenverse({ results: OV_HITS.map(ovResult) }, "plant shop", "hero");
  assert.equal(parsed.length, OV_HITS.length - 1, "unknown sources (flickr) are dropped at parse time");
  const kept = parsed.filter(P.keepCandidate).map((c) => c.id);
  assert.deepEqual(kept.sort(), ["rawpixel:a1", "rawpixel:a5", "rawpixel:a6", "stocksnap:a3", "stocksnap:a4", "wordpress:a2"]);
  const by = { ...parsed[0]!, license: "by-nc" as never };
  assert.equal(P.keepCandidate(by), false, "non-commercial licences are rejected");
  assert.equal(P.ratioOk({ width: 2000, height: 1000 }, "hero"), true);
  assert.equal(P.ratioOk({ width: 1000, height: 1500 }, "hero"), false, "portrait is not a hero");
  assert.equal(P.ratioOk({ width: 1000, height: 1400 }, "detail"), true);
  const dup = P.dedupe([parsed[0]!, { ...parsed[0]!, id: "x" }, { ...parsed[2]!, url: "u1", id: "s1" }, { ...parsed[2]!, url: "u2", id: "s2" }]);
  assert.equal(dup.length, 2, "same URL and same series are dropped");
});

test("download URLs: rawpixel goes to the clean editor_1024 variant, WordPress to 1536 (2048 for the hero)", () => {
  const [c] = P.parseOpenverse({ results: [ovResult(OV_HITS[0]!)] }, "q", "hero");
  assert.deepEqual(P.downloadUrls(c!), ["https://images.rawpixel.com/editor_1024/czNmcy1wcml2YXRl.jpg"]);
  const [w] = P.parseOpenverse({ results: [ovResult(OV_HITS[1]!)] }, "q", "hero");
  assert.deepEqual(P.downloadUrls(w!), ["https://pd.w.org/2025/09/abc-1536x957.jpg", "https://pd.w.org/2025/09/abc-2048x1276.jpg"]);
  assert.deepEqual(P.downloadUrls(w!, "hero"), ["https://pd.w.org/2025/09/abc-2048x1276.jpg", "https://pd.w.org/2025/09/abc-1536x957.jpg"], "the hero tries the 2048px file first");
  assert.ok(P.score(w!, "hero") > P.score({ ...w!, provider: "rawpixel" }, "hero"), "a hero that arrives big enough ranks first");
});

test("Commons parsing: licence mapping, artist HTML stripped, unknown licences dropped", () => {
  const c = P.parseCommons(COMMONS_JSON, "Leith Shore");
  assert.equal(c.length, 1);
  assert.equal(c[0]!.license, "by-sa");
  assert.equal(c[0]!.licenseVersion, "4.0");
  assert.equal(c[0]!.creator, "Kim Lee");
  assert.equal(c[0]!.title, "Leith Shore");
  assert.match(c[0]!.url, /1280px/);
  assert.equal(P.commonsLicense("Public domain")?.license, "pdm");
  assert.equal(P.commonsLicense("CC BY 2.0")?.license, "by");
  assert.equal(P.commonsLicense("GFDL"), null);
});

test("sniffImage: real JPEG sizes, WebP header, junk rejected", () => {
  const j = P.sniffImage(jpeg("houseplants.jpg"));
  assert.deepEqual(j, { mime: "image/jpeg", width: 1200, height: 747 });
  const webp = new Uint8Array(32);
  webp.set([...Buffer.from("RIFF")], 0);
  webp.set([...Buffer.from("WEBPVP8X")], 8);
  webp.set([0xff, 0x03, 0x00, 0xaa, 0x02, 0x00], 24); // 1024 x 683
  assert.deepEqual(P.sniffImage(webp), { mime: "image/webp", width: 1024, height: 683 });
  assert.equal(P.sniffImage(new TextEncoder().encode("<html><body>not an image</body></html>")), null);
  assert.equal(P.sniffImage(new Uint8Array(4)), null);
});

test("altFrom and credits: scene-only alt, BY/BY-SA credited with link and licence", () => {
  assert.equal(P.altFrom("Free cute houseplant window image", "q"), "Cute houseplant window");
  assert.equal(P.altFrom("Laptop", "laptop desk"), "Laptop desk");
  assert.equal(P.altFrom("Leith Shore - geograph.org.uk - 3506163", "x"), "Leith Shore");
  assert.equal(P.altFrom("MAD - 20170618 - 16 - 36431462664", "Madrid street"), "Madrid street", "archive codes fall back to the query");
  assert.equal(P.altFrom("Three houseplants in white pots sit on a wooden floor against a pale yellow wall: one with a white spathe, one with broad leaves", "q"), "Three houseplants in white pots sit on a wooden floor against a pale yellow wall");
  const base = { n: 1, ref: "p1", id: "x", role: "hero" as const, alt: "a", title: "Leith Shore", width: 1, height: 1, mime: "image/jpeg" as const, size: 1, hash: "ab", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Leith_Shore.jpg" };
  const cr = P.photoCredits([
    { ...base, provider: "wikimedia", license: "by-sa", licenseVersion: "4.0", credit: '"Leith Shore" by Kim Lee' },
    { ...base, n: 2, provider: "rawpixel", license: "cc0", credit: "Rawpixel" },
    { ...base, n: 3, provider: "rawpixel", license: "cc0", credit: "Rawpixel" },
  ]);
  assert.equal(cr.text, 'Photos: "Leith Shore" by Kim Lee, via Wikimedia Commons (CC BY-SA 4.0) · Rawpixel (CC0)');
  assert.equal(cr.items.length, 3);
  assert.equal(cr.items[0]!.required, true);
  assert.equal(cr.items[1]!.required, false);
  assert.equal(P.photoCredits([]).text, "");
  assert.equal(P.photoUrl("fern-co", { n: 2, hash: "0123456789abcdef" }), "/s/fern-co/p/2?v=0123456789");
});

// ───────────────────────────────────────────── findPhotos (fake network)
test("findPhotos: ≤8 verified photos, hero first, roles, ≤9 searches, credits for every photo", async () => {
  P._resetRateLimit();
  const { f, calls } = fakeFetch();
  const photos = await P.findPhotos({ idea: "A plant shop in Leith", city: "Leith Shore", mock: false, fetch: f, cache: null, log: quiet });
  // the fake search answers every query with the same mixed hits: only the plant photos (+ the place) are on topic
  assert.ok(photos.length >= 3 && photos.length <= 8, `got ${photos.length}`);
  assert.deepEqual(photos.filter((p) => p.provider !== "wikimedia").map((p) => p.id).sort(), ["rawpixel:a1", "wordpress:a2"], "no laptop, barista or dog photo for a plant shop");
  assert.equal(photos[0]!.role, "hero");
  assert.ok(photos[0]!.width / photos[0]!.height >= 1.25, "hero is landscape");
  assert.deepEqual(photos.map((p) => p.n), photos.map((_, i) => i + 1));
  assert.deepEqual(photos.map((p) => p.ref), photos.map((_, i) => `p${i + 1}`));
  assert.equal(new Set(photos.map((p) => p.hash)).size, photos.length, "no duplicate bytes");
  assert.equal(new Set(photos.map((p) => p.id)).size, photos.length, "no duplicate photos");
  for (const p of photos) {
    assert.ok(p.bytes.length > 1000 && p.bytes.length <= P.MAX_PHOTO_BYTES);
    assert.ok(P.sniffImage(p.bytes));
    assert.ok(p.alt && p.credit && p.licenseUrl && p.sourceUrl);
    assert.doesNotMatch(p.id, /bad\d/, "filtered candidates never chosen");
  }
  const place = photos.find((p) => p.role === "place");
  assert.ok(place, "Commons gives the place photo");
  assert.equal(place!.provider, "wikimedia");
  assert.equal(place!.license, "by-sa");
  const searches = calls.filter((u) => u.startsWith("https://api.openverse.org/v1/images/?"));
  assert.ok(searches.length <= 9, `${searches.length} Openverse searches`);
  assert.ok(calls.every((u) => !u.includes("image_1300")), "never downloads the watermarked rawpixel size");
});

test("findPhotos: everything failing gives [] (the site renders without photos)", async () => {
  P._resetRateLimit();
  const f = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  assert.deepEqual(await P.findPhotos({ idea: "Coffee kiosk", mock: false, fetch: f, cache: null, log: quiet }), []);
});

test("findPhotos: honours the time box (hung upstream → [] within budget)", async () => {
  P._resetRateLimit();
  const { f } = fakeFetch({ slow: true });
  const t0 = Date.now();
  const out = await P.findPhotos({ idea: "Coffee kiosk", mock: false, fetch: f, cache: null, budgetMs: 1200, log: quiet });
  const ms = Date.now() - t0;
  assert.deepEqual(out, []);
  assert.ok(ms < 2500, `took ${ms} ms`);
});

test("findPhotos: images over the byte cap are skipped", async () => {
  P._resetRateLimit();
  const { f } = fakeFetch({ bigImages: true });
  assert.deepEqual(await P.findPhotos({ idea: "Plant shop", mock: false, fetch: f, cache: null, log: quiet }), []);
});

test("findPhotos: search cache means a repeated idea makes no new searches", async () => {
  P._resetRateLimit();
  const store = new Map<string, unknown>();
  const cache = { get: async (k: string) => store.get(k) ?? null, set: async (k: string, v: unknown) => void store.set(k, v) };
  const one = fakeFetch();
  await P.findPhotos({ idea: "Plant shop", city: "Leith Shore", mock: false, fetch: one.f, cache, log: quiet });
  assert.ok(store.size > 0);
  const two = fakeFetch();
  const again = await P.findPhotos({ idea: "Plant shop", city: "Leith Shore", mock: false, fetch: two.f, cache, log: quiet });
  assert.ok(again.length > 0);
  assert.equal(two.calls.filter((u) => u.includes("api.openverse.org") || u.includes("w/api.php")).length, 0);
});

test("vision JSON is applied safely (bad indexes ignored, bad JSON keeps everything)", () => {
  const shown = P.parseOpenverse({ results: OV_HITS.slice(0, 4).map(ovResult) }, "q", "hero");
  const v = P.applyVision(JSON.stringify({ reject: [1, 99, -1], hero: 2, alts: [{ i: 0, alt: 'Shop <b>front</b> "x"' }, { i: 42, alt: "nope" }] }), shown);
  assert.deepEqual([...v.reject], [shown[1]!.id]);
  assert.equal(v.hero, shown[2]!.id);
  assert.equal(v.alts.get(shown[0]!.id), "Shop bfront/b x");
  assert.equal(v.alts.size, 1);
  const rejectedHero = P.applyVision(JSON.stringify({ reject: [2], hero: 2, alts: [] }), shown);
  assert.equal(rejectedHero.hero, null);
  assert.equal(P.applyVision("not json", shown).reject.size, 0);
});

// ───────────────────────────────────────────── mock mode
test("mock: bundled fixtures, no network, on-topic or nothing", async () => {
  const plants = await P.findPhotos({ idea: "Plant shop in Leith", log: quiet }); // config.mockAi (MOCK_AI=1)
  assert.equal(plants.length, 2);
  assert.equal(plants[0]!.role, "hero");
  assert.match(plants[0]!.alt, /plant/i);
  assert.equal(P.mockPhotos("Coffee kiosk in Barcelona").length, 2);
  assert.equal(P.mockPhotos("Panadería de barrio").length, 2, "bakery uses the coffee set");
  assert.equal(P.mockPhotos("Dog walking").length, 2);
  assert.equal(P.mockPhotos("Invoicing app for freelancers").length, 2);
  assert.deepEqual(P.mockPhotos("Yoga for seniors"), [], "no fixture for this category: zero photos, not wrong ones");
  const filled = P.mockPhotos("Yoga for seniors", { fill: true });
  assert.equal(filled.length, 8);
  for (const p of filled) assert.ok(P.sniffImage(p.bytes) && p.license === "cc0" && p.sourceUrl.startsWith("https://"));
});

test("fixtures: 8 photos with credits, total under 1.5 MB, no watermarked size", () => {
  const credits = JSON.parse(readFileSync(join(FX, "credits.json"), "utf8")) as Array<{ file: string; license: string; sourceUrl: string; alt: string }>;
  const files = readdirSync(FX).filter((f) => f.endsWith(".jpg"));
  assert.equal(files.length, credits.length);
  assert.ok(credits.length >= 6 && credits.length <= 8);
  const total = files.reduce((t, f) => t + statSync(join(FX, f)).size, 0);
  assert.ok(total < 1.5e6, `fixtures are ${total} bytes`);
  for (const c of credits) {
    assert.ok(files.includes(c.file));
    assert.equal(c.license, "cc0");
    assert.match(c.sourceUrl, /^https:\/\//);
    assert.ok(c.alt.length > 10);
  }
});

// ───────────────────────────────────────────── storage + serving
test("storage and GET /s/:slug/p/:n: bytes round-trip, long cache, nosniff, 404s", async () => {
  const photos = P.mockPhotos("Plant shop", { fill: true });
  await DB.savePhotos("proj1", photos);
  const meta = await DB.listPhotos("proj1");
  assert.equal(meta.length, 8);
  assert.equal((meta[0] as unknown as { bytes?: unknown }).bytes, undefined, "metadata has no bytes");
  assert.equal(meta[0]!.hash, photos[0]!.hash);
  const got = await DB.getPhotoBytes("proj1", 1);
  assert.deepEqual(Buffer.from(got!.bytes), Buffer.from(photos[0]!.bytes));

  const app = new Hono();
  app.get("/s/:slug/p/:n", P.photoRoute(async (slug) => (slug === "fern-co" ? "proj1" : null)));
  const res = await app.request("/s/fern-co/p/1?v=abc");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
  assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await res.arrayBuffer()).byteLength, photos[0]!.bytes.length);
  assert.equal((await app.request("/s/fern-co/p/p2")).status, 200, "p2 form accepted");
  assert.equal((await app.request("/s/fern-co/p/9")).status, 404);
  assert.equal((await app.request("/s/other/p/1")).status, 404);

  await DB.savePhotos("proj1", photos.slice(0, 2));
  assert.equal((await DB.listPhotos("proj1")).length, 2, "a rebuild replaces the set");
  await DB.savePhotos("proj1", []);
  assert.equal((await DB.listPhotos("proj1")).length, 0);
  assert.equal(await DB.getPhotoBytes("proj1", 0), null);
});

test("search cache table round-trips", async () => {
  await DB.cacheSet("ov1|plant shop", [{ id: "x" }]);
  assert.deepEqual(await DB.cacheGet("ov1|plant shop"), [{ id: "x" }]);
  assert.equal(await DB.cacheGet("missing"), null);
});

test("place photos: area from the idea, no landmarks, prints or old photos, the area must be named", () => {
  assert.equal(P.areaOf("A plant shop in Leith, Edinburgh that sells easy houseplants", "Edinburgh"), "Leith");
  assert.equal(P.areaOf("A dog-walking app for busy Madrid professionals", "Madrid"), "");
  assert.deepEqual(P.buildQueries({ idea: "A plant shop in Leith, Edinburgh", city: "Edinburgh" }).place, ["Leith Edinburgh", "Leith street"]);
  const base = P.parseCommons(COMMONS_JSON, "Leith")[0]!;
  assert.equal(P.placeOk(base, ["Leith"]), true);
  assert.equal(P.placeOk({ ...base, title: "Edinburgh Castle from Grass Market" }, ["Leith"]), false, "landmark, and not Leith");
  assert.equal(P.placeOk({ ...base, title: "Leith docks c. 1890" }, ["Leith"]), false, "old print");
  assert.equal(P.placeOk({ ...base, year: 1995 }, ["Leith"]), false, "taken before 2000");
  assert.equal(P.placeOk({ ...base, title: "Barcelona street art 02" }, ["Barcelona"]), false);
  assert.equal(P.placeOk({ ...base, title: "MAD - 20170618", tags: ["Streets in Madrid"] }, ["Madrid"]), true, "named in its categories");
  assert.deepEqual(P.subjectWords("Free Monstera leaf image"), ["monstera", "leaf"]);
  assert.match(P.showsOf({ title: "Woman walking dog outdoors nature", tags: ["dog", "leash", "grass"], provider: "rawpixel" }), /Woman walking dog outdoors nature\. Tags: leash, grass\./);
  assert.match(P.showsOf({ title: "x", tags: [], provider: "rawpixel" }, "A brown dog on a yellow leash on a pavement"), /checked by looking/);
});
