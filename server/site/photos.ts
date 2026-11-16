// site2 photos: real, on-topic, free-licensed photos for each generated website, with no API key and no signup.
//
//   findPhotos({ idea, city, queries? })  → 0..6 SitePhoto (1 hero, ≤3 detail, 1 people, 1 place), bytes included
//   savePhotos / listPhotos (photos-db.ts) → stored in site_photos, served by photoRoute() at GET /s/:slug/p/:n
//   photoCredits(photos)                   → the short footer credit line + per-photo links
//
// Sources (see .notes/site2/photos-research.md): Openverse limited to the CC0 stock sources (rawpixel, StockSnap,
// WordPress Photo Directory) for hero/detail/people, Wikimedia Commons for the real place (city). Every step is
// time-boxed (default 25 s for the whole thing); partial results are fine and zero photos never breaks a site.
// Mock mode (MOCK_AI=1, or opts.mock) uses the bundled fixtures in fixtures/photos/ and makes NO network calls.
// Haiku photo check (on by default, PHOTO_VISION=0 turns it off, never in mock): one cheap call (~$0.001) that drops
// off-topic, sepia, landmark and party picks and writes a literal description of each kept photo.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context, Next } from "hono";
import { config } from "../config.js";

export type PhotoRole = "hero" | "detail" | "people" | "place";
export type PhotoProvider = "rawpixel" | "stocksnap" | "wordpress" | "wikimedia";
export type PhotoLicense = "cc0" | "pdm" | "by" | "by-sa";
export interface PhotoQueries { hero: string[]; detail: string[]; people: string[]; place: string[] }

/** Everything about a stored photo except its bytes (safe to put in JSON, the model input, or the kit). */
export interface PhotoMeta {
  n: number; // 1-based, the URL index: /s/:slug/p/:n
  ref: string; // "p1".. (what the page HTML refers to)
  id: string; // `${provider}:${foreignId}`
  role: PhotoRole;
  alt: string; // scene description only, English, no claims
  title: string;
  creator?: string;
  creatorUrl?: string;
  credit: string; // short: `"Title" by Creator` or `Rawpixel`
  license: PhotoLicense;
  licenseVersion?: string;
  licenseUrl: string;
  sourceUrl: string; // landing page (rawpixel / StockSnap / WordPress / Commons file page)
  provider: PhotoProvider;
  width: number;
  height: number;
  mime: "image/jpeg" | "image/webp";
  size: number;
  hash: string; // sha256 hex of the bytes (cache-busting ?v=)
  /** What the photo really shows, for the page designer: the photo check's description, else the full title + tags. */
  shows?: string;
}
export interface SitePhoto extends PhotoMeta { bytes: Uint8Array }
// The kit contract carries the same shape (kit.site.photos): keep both in sync (compile-time check both ways).
type _Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const _photoMetaMatchesContract: _Same<PhotoMeta, import("../kit-contract.js").SitePhotoMeta> = true;

/** A search hit before download. */
export interface Candidate {
  id: string;
  provider: PhotoProvider;
  title: string;
  creator?: string;
  creatorUrl?: string;
  license: PhotoLicense;
  licenseVersion?: string;
  licenseUrl: string;
  sourceUrl: string;
  url: string; // original/variant URL from the API
  thumb?: string; // small preview (vision check)
  width: number; // original size
  height: number;
  tags: string[];
  query: string;
  queryRole: PhotoRole;
  rank: number; // position in its result list (0 = most relevant)
  /** Longer text about the photo when the source has one (Commons description). */
  desc?: string;
  /** Year the photo was taken, when the source says (Commons). */
  year?: number;
}

export interface FindPhotosInput {
  idea: string;
  city?: string;
  /** Neighbourhood inside the city ("Leith"). Default: read from the idea ("… in Leith, Edinburgh"). */
  area?: string;
  /** Model-written queries (ModelSite.photoQueries). Optional: deterministic ones from the idea are always added. */
  queries?: Partial<PhotoQueries>;
  signal?: AbortSignal;
  /** Default: config.mockAi. true = bundled fixtures, no network. */
  mock?: boolean;
  /** Mock only: top up with other categories' fixtures to reach 6 photos (layout testing). Default false. */
  mockFill?: boolean;
  /** Whole-step time box, ms. Default 25000 (it runs next to the other kit parts, which take ~30 s). */
  budgetMs?: number;
  /** Injected for tests. Default: global fetch. */
  fetch?: typeof fetch;
  /** Search-result cache. Default: the photo_search_cache table (real mode only). Pass null to disable. */
  cache?: { get(key: string): Promise<unknown | null>; set(key: string, value: unknown): Promise<void> } | null;
  /** Haiku vision check (about $0.0005). Default ON unless PHOTO_VISION=0. Never runs in mock mode. */
  vision?: boolean;
  /** Log line sink (default console.log). */
  log?: (msg: string) => void;
}

const UA = "LaunchDeskSiteBuilder/1.0 (small-business website photo picker)";
export const MAX_PHOTO_BYTES = 900_000;
const MAX_PHOTOS = 6;
const OPENVERSE = "https://api.openverse.org/v1/images/";
const COMMONS = "https://commons.wikimedia.org/w/api.php";

// ───────────────────────────────────────────────────────────── queries
interface Category { key: string; match: RegExp; hero: string[]; detail: string[]; people: string[] }
/** Order matters: the first match wins ("online plant shop" is plants, not software). */
export const CATEGORIES: Category[] = [
  { key: "coffee", match: /coffee|caf[eé]|espresso|barista|latte|kiosk|tea\b|t[eé] /i, hero: ["barista coffee", "espresso machine"], detail: ["latte art", "espresso shot", "takeaway coffee", "espresso cup"], people: ["barista pouring"] },
  { key: "bakery", match: /bak(e|er|ery|ing)|bread|pastr|panader|pasteler|cake|croissant|sourdough|boulanger/i, hero: ["bakery bread", "bakery"], detail: ["sourdough bread", "croissant", "pastry"], people: ["baker kneading"] },
  { key: "plants", match: /plant|flor|flower|garden|jard[ií]n|botan|succulent|nursery|vivero/i, hero: ["houseplants", "plant shop"], detail: ["snake plant", "monstera", "pothos", "potted plant"], people: ["woman watering plants"] },
  { key: "dogs", match: /\bdogs?\b|perr|puppy|\bpets?\b|mascota|\bcats?\b|gato|canine/i, hero: ["dog walking", "dog walker"], detail: ["dog leash", "dog park", "puppy"], people: ["woman walking dog"] },
  { key: "fitness", match: /yoga|fitness|\bgym|pilates|exercis|workout|stretch|senior|elderly|mayores|run(ning|ners?)\b|personal train/i, hero: ["yoga class", "seniors exercise"], detail: ["yoga mat", "stretching", "fitness"], people: ["seniors exercise"] },
  { key: "food", match: /restaurant|food|meal|kitchen|cook|chef|comida|cater|lunch|dinner|pizza|taco|burger|vegan|recipe/i, hero: ["restaurant table", "chef cooking"], detail: ["fresh vegetables", "plated food", "kitchen"], people: ["chef cooking"] },
  { key: "beauty", match: /hair|salon|beauty|nail|barber|peluquer|makeup|skincare|spa\b|massage/i, hero: ["hair salon", "barber shop"], detail: ["hairdresser", "makeup brushes", "skincare"], people: ["hairdresser"] },
  { key: "kids", match: /\bkids?\b|child|niñ|baby|toddler|school|tutor|nanny|daycare|guarder/i, hero: ["children playing", "kids learning"], detail: ["children books", "crayons drawing", "toys"], people: ["teacher child"] },
  { key: "tools", match: /repair|plumb|handyman|clean|bike|bicycle|carpent|electric|mechanic|workshop|reform|fix\b/i, hero: ["workshop tools", "bicycle repair"], detail: ["hand tools", "toolbox", "workbench"], people: ["carpenter working"] },
  { key: "work", match: /\bapp\b|saas|software|invoice|factur|freelanc|online|platform|\btool|digital|startup|web\b|ai\b|account|bookkeep/i, hero: ["laptop desk", "woman working laptop"], detail: ["calculator receipts", "notebook laptop", "coffee laptop"], people: ["freelancer working"] },
];
const GENERIC: Category = { key: "generic", match: /$^/, hero: ["small shop", "local market"], detail: ["shop counter", "handmade"], people: ["shop owner"] };

export function categoryOf(idea: string): Category | null {
  return CATEGORIES.find((c) => c.match.test(idea)) ?? null;
}

const ABSTRACT = /\b(solution|service|services|app|application|platform|software|saas|startup|brand|business|company|online|digital|best|premium|quality)\b/gi;
/** 1-3 concrete words, lower case, letters only. "" when nothing usable is left. */
export function cleanQuery(q: string): string {
  return String(q ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(ABSTRACT, " ")
    .replace(/[^a-z ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ")
    .slice(0, 40)
    .trim();
}

/** The neighbourhood named next to the city in the idea: "A plant shop in Leith, Edinburgh" → "Leith". "" if none. */
export function areaOf(idea: string, city?: string): string {
  const c = cleanCity(city);
  if (!c) return "";
  const esc = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`\\b(?:in|at|near|en)\\s+((?:\\p{Lu}[\\p{L}'’-]+)(?:\\s+(?:de\\s+|del\\s+|d'|l')?\\p{Lu}[\\p{L}'’-]+){0,2})\\s*(?:,|\\(|\\s-\\s)\\s*${esc}\\b`, "u").exec(String(idea ?? ""));
  const a = m?.[1]?.trim() ?? "";
  return a && a.toLowerCase() !== c.toLowerCase() ? a.slice(0, 40) : "";
}

/** Model queries first (cleaned), then the category defaults; de-duplicated, at most 4 per role. */
export function buildQueries(input: { idea: string; city?: string; area?: string; queries?: Partial<PhotoQueries> }): PhotoQueries {
  const cat = categoryOf(input.idea) ?? GENERIC;
  const merge = (a: string[] | undefined, b: string[], max = 4) => [...new Set([...(a ?? []), ...b].map(cleanQuery).filter((q) => q.length >= 3))].slice(0, max);
  const city = cleanCity(input.city);
  const area = cleanCity(input.area ?? areaOf(input.idea, input.city));
  // The neighbourhood first ("Leith Edinburgh", "Leith street"); the city alone only when there is no area.
  const defaults = area ? [`${area} ${city}`, `${area} street`] : city ? [`${city} street`, city] : [];
  const place = [...new Set([...(input.queries?.place ?? []).map((q) => String(q).replace(/[^\p{L} ]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40)), ...defaults].filter((q) => q.length >= 3))].slice(0, 3);
  return { hero: merge(input.queries?.hero, cat.hero), detail: merge(input.queries?.detail, cat.detail), people: merge(input.queries?.people, cat.people, 3), place };
}
const cleanCity = (c?: string) => String(c ?? "").replace(/[^\p{L} '-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40);

// ───────────────────────────────────────────────────────────── filters
const BAD_WORDS = /\b(isolated|white background|transparent|png|mockup|mock-up|illustration|illustrated|vector|drawing|drawn|engraving|etching|lithograph|painting|painted|museum|vintage|antique|public domain art|logo|icon|sign|signage|clipart|clip art|sticker|cartoon|render|3d|diagram|map|poster|collage|sketch|watercolou?r|print|postcard|stamp|coin|bowl \(|manuscript|text|screenshot|nude|naked)\b/i;
const BAD_RAWPIXEL_PATH = /rijks|smk|\bcle-|met-|nypl|lr\/images\/website\/20\d\d-\d\d\/(cle|fl|rijks)|image_png/i;
const ALLOWED_LICENSE = new Set<PhotoLicense>(["cc0", "pdm", "by", "by-sa"]);

/** The base64 path inside rawpixel URLs often names the archive the image came from (museum objects). */
function rawpixelPath(url: string): string {
  const m = url.match(/images\.rawpixel\.com\/[a-z_0-9]+\/([A-Za-z0-9_-]+)/);
  if (!m) return url;
  try {
    return Buffer.from(m[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1") + " " + url;
  } catch {
    return url;
  }
}

export function ratioOk(c: { width: number; height: number }, role: PhotoRole): boolean {
  if (!c.width || !c.height) return false;
  const r = c.width / c.height;
  return role === "hero" || role === "place" ? r >= 1.25 && r <= 2.2 : r >= 0.66 && r <= 2.2;
}

/**
 * Extra checks for the place photo (Commons): no landmarks or old prints, no black-and-white or sepia, nothing taken
 * before 2000, and the area (or the city when there is no area) must be named in its title, description or categories.
 */
const PLACE_BAD = /\b(castle|cathedral|church|chapel|abbey|basilica|palace|monument|memorial|statue|museum|cemetery|tomb|interior|aerial|panorama|graffiti|street art|mural|shop sign|night|protest|demonstration|police|bus|tram|train|station|stadium|sepia|monochrome|black and white|b&w|bw|photochrom|albumen|daguerreotype|postcard|engraving|lithograph|print|painting|drawing|map|plan|old|historic|history)\b|\bc\.\s?1[0-9]{3}|\b1[0-9]{3}s?\b/i;
export function placeOk(c: Candidate, names: string[]): boolean {
  const text = `${c.title} ${c.desc ?? ""} ${c.tags.join(" ")}`;
  if (PLACE_BAD.test(text)) return false;
  if (c.year && c.year < 2000) return false;
  const want = names.map((n) => n.trim().toLowerCase()).filter((n) => n.length >= 3);
  if (want.length && !want.some((n) => text.toLowerCase().includes(n))) return false;
  return true;
}

/** Government or military archive photos read as off-topic stock (a DoD gardener as "home plant care"). */
const ARCHIVE_CREATOR = /department of defense|\bdod\b|u\.s\. (army|navy|air force|marine)|usda|national archives|\bnasa\b|military/i;

/** A junk word in the photo's text, unless the idea itself names it ("sticker" is fine for a sticker shop). */
function badWords(text: string, idea: string): boolean {
  if (!idea) return BAD_WORDS.test(text);
  const re = new RegExp(BAD_WORDS.source, "gi");
  for (const m of text.matchAll(re)) {
    const w = m[0].toLowerCase().replace(/s$/, "");
    if (!new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(idea)) return true;
  }
  return false;
}

/** Hard filters: licence, size, file type, junk words (except ones the idea names), museum objects. Ratio is checked per role later. */
export function keepCandidate(c: Candidate, idea = ""): boolean {
  if (!ALLOWED_LICENSE.has(c.license)) return false;
  if (c.width < 1000 || c.height < 600) return false;
  if (!/^https:\/\//.test(c.url) || /\.(png|gif|svg|tiff?)(\?|$)/i.test(c.url)) return false;
  if (badWords(`${c.title} ${c.tags.join(" ")}`, idea)) return false;
  if (c.provider === "rawpixel" && BAD_RAWPIXEL_PATH.test(rawpixelPath(c.url))) return false;
  if (c.creator && ARCHIVE_CREATOR.test(c.creator)) return false;
  return true;
}

/** Words that name the main subject of a photo ("monstera", "leash"), for keeping detail photos different. */
const GENERIC_WORD = /^(free|photo|image|picture|stock|with|from|into|over|under|small|large|little|white|black|brown|green|yellow|close|closeup|view|top|background|indoor|indoors|outdoor|outdoors|house|home|potted|plant|plants|coffee|dogs?|bread|food|people|woman|man|person|wooden|table|sits|sitting|front|light)$/;
export function subjectWords(title: string): string[] {
  return [...new Set(title.toLowerCase().replace(/[^a-z ]+/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !GENERIC_WORD.test(w)).map((w) => w.replace(/(es|s)$/, "")))].slice(0, 8);
}

const normTitle = (t: string) => t.toLowerCase().replace(/^file:/, "").replace(/\.[a-z]{3,4}$/, "").replace(/[^a-z]+/g, " ").replace(/\b(free|photo|image|picture|stock)\b/g, "").trim().slice(0, 28);
/** Drops repeats: same URL, same id, or the same photo series (same title start and creator). */
export function dedupe(cands: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return cands.filter((c) => {
    const keys = [c.url, c.id, `${normTitle(c.title)}|${c.creator ?? ""}|${c.provider}`];
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
}

/** Higher is better. Prefers relevance, then sources that give bigger clean files. */
const OUTDOOR = /\b(outdoors?|nature|field|forest|meadow|countryside|farm|beach|mountain|hiking|greenhouse|nursery|garden(ing)?|park)\b/i;
/** Ideas that happen indoors or in a city street: a photo in a field reads as off-topic. */
const INDOOR_OR_URBAN = new Set(["plants", "coffee", "bakery", "food", "beauty", "work", "kids", "dogs"]);
export function score(c: Candidate, role: PhotoRole, category?: string): number {
  const relevance = 20 - Math.min(c.rank, 19);
  const roleMatch = c.queryRole === role ? 12 : 0;
  const source = role === "hero" ? { wordpress: 8, rawpixel: 6, stocksnap: 3, wikimedia: 2 }[c.provider] : { wordpress: 5, rawpixel: 5, stocksnap: 5, wikimedia: role === "place" ? 9 : 1 }[c.provider];
  const cc0 = c.license === "cc0" || c.license === "pdm" ? 2 : 0;
  // Dog walks are city walks, but a dog park is fine for a detail.
  const outdoorHit = category && INDOOR_OR_URBAN.has(category) && OUTDOOR.test(`${c.title} ${c.tags.slice(0, 8).join(" ")}`) && !(category === "dogs" && role === "detail");
  const outdoor = outdoorHit ? (role === "people" || role === "hero" ? -15 : -6) : 0;
  return relevance + roleMatch + source + cc0 + outdoor;
}

// ───────────────────────────────────────────────────────────── API parsing
type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function parseOpenverse(json: unknown, query: string, queryRole: PhotoRole): Candidate[] {
  const results = Array.isArray((json as Json)?.results) ? ((json as Json).results as Json[]) : [];
  const out: Candidate[] = [];
  results.forEach((r, rank) => {
    const provider = str(r.source) as PhotoProvider;
    if (!["rawpixel", "stocksnap", "wordpress", "wikimedia"].includes(provider)) return;
    const ft = str(r.filetype).toLowerCase();
    if (ft && ft !== "jpg" && ft !== "jpeg") return;
    out.push({
      id: `${provider}:${str(r.id)}`,
      provider,
      title: str(r.title).trim(),
      creator: str(r.creator).trim() || undefined,
      creatorUrl: str(r.creator_url) || undefined,
      license: str(r.license).toLowerCase() as PhotoLicense,
      licenseVersion: str(r.license_version) || undefined,
      licenseUrl: str(r.license_url),
      sourceUrl: str(r.foreign_landing_url),
      url: str(r.url),
      thumb: str(r.thumbnail) || undefined,
      width: num(r.width),
      height: num(r.height),
      tags: Array.isArray(r.tags) ? (r.tags as Json[]).map((t) => str(t?.name)).filter(Boolean).slice(0, 20) : [],
      query,
      queryRole,
      rank,
    });
  });
  return out;
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
export function commonsLicense(short: string): { license: PhotoLicense; version?: string; url: string } | null {
  const s = short.trim();
  if (/^cc0/i.test(s)) return { license: "cc0", version: "1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" };
  if (/^public domain|^pd\b/i.test(s)) return { license: "pdm", version: "1.0", url: "https://creativecommons.org/publicdomain/mark/1.0/" };
  const m = s.match(/^cc[ -]by(-sa)?[ -](\d\.\d)/i);
  if (!m) return null;
  const kind = m[1] ? "by-sa" : "by";
  return { license: kind, version: m[2], url: `https://creativecommons.org/licenses/${kind}/${m[2]}/` };
}

export function parseCommons(json: unknown, query: string): Candidate[] {
  const pages = (json as { query?: { pages?: Record<string, Json> } })?.query?.pages ?? {};
  const list = Object.values(pages).sort((a, b) => num(a.index) - num(b.index));
  const out: Candidate[] = [];
  list.forEach((p, rank) => {
    const info = Array.isArray(p.imageinfo) ? (p.imageinfo[0] as Json) : null;
    if (!info || str(info.mime) !== "image/jpeg") return;
    const meta = (info.extmetadata ?? {}) as Record<string, { value?: unknown }>;
    const lic = commonsLicense(str(meta.LicenseShortName?.value));
    if (!lic) return;
    const title = str(p.title).replace(/^File:/, "").replace(/\.(jpe?g)$/i, "").replace(/_/g, " ").trim();
    const creator = stripHtml(str(meta.Artist?.value)).slice(0, 80) || undefined;
    const desc = stripHtml(str(meta.ImageDescription?.value)).slice(0, 300) || undefined;
    const cats = str(meta.Categories?.value).split("|").map((x) => x.replace(/_/g, " ").trim()).filter(Boolean).slice(0, 20);
    const ym = /\b(1[89]\d{2}|20\d{2})\b/.exec(stripHtml(str(meta.DateTimeOriginal?.value)));
    out.push({
      id: `wikimedia:${str(String(p.pageid ?? ""))}`,
      provider: "wikimedia",
      title,
      creator,
      license: lic.license,
      licenseVersion: lic.version,
      licenseUrl: lic.url,
      sourceUrl: str(info.descriptionurl),
      url: str(info.thumburl) || str(info.url),
      // A small standard-size thumb for the photo check (Commons serves 330px for every file).
      ...(/\/\d+px-/.test(str(info.thumburl)) ? { thumb: str(info.thumburl).replace(/\/\d+px-/, "/330px-") } : {}),
      width: num(info.width),
      height: num(info.height),
      tags: cats,
      query,
      queryRole: "place",
      rank,
      ...(desc ? { desc } : {}),
      ...(ym ? { year: Number(ym[1]) } : {}),
    });
  });
  return out;
}

/** The URL we actually download, as a list to try in order (variant first, then the API's own URL). */
export function downloadUrls(c: Candidate): string[] {
  if (c.provider === "rawpixel") {
    // image_1300 carries a visible "rawpixel" watermark; editor_1024 is clean (WebP, ~200 KB). Checked 16 Nov.
    return [c.url.replace(/\/(editor|image)_\d+\//, "/editor_1024/")];
  }
  if (c.provider === "wordpress") {
    const m = c.url.match(/-(\d+)x(\d+)\.(jpe?g)$/i);
    if (m && Number(m[1]) > 1536) {
      const h = Math.round((Number(m[2]) * 1536) / Number(m[1]));
      return [c.url.replace(/-(\d+)x(\d+)\.(jpe?g)$/i, `-1536x${h}.$3`), c.url];
    }
    return [c.url];
  }
  return [c.url]; // StockSnap 960w; Commons thumburl at 1280
}

// ───────────────────────────────────────────────────────────── bytes
/** Checks the magic number and reads the real pixel size. null = not a JPEG/WebP we accept. */
export function sniffImage(b: Uint8Array): { mime: "image/jpeg" | "image/webp"; width: number; height: number } | null {
  if (b.length < 32) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1]!;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = (b[i + 2]! << 8) | b[i + 3]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = (b[i + 5]! << 8) | b[i + 6]!;
        const width = (b[i + 7]! << 8) | b[i + 8]!;
        return width && height ? { mime: "image/jpeg", width, height } : null;
      }
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }
  const ascii = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8X") return { mime: "image/webp", width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)) };
    if (chunk === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { mime: "image/webp", width: (b[26]! | (b[27]! << 8)) & 0x3fff, height: (b[28]! | (b[29]! << 8)) & 0x3fff };
    if (chunk === "VP8L" && b[20] === 0x2f) {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return { mime: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

/** GET with a hard byte cap (streamed) and an abort signal. Throws on any problem. */
async function fetchCapped(f: typeof fetch, url: string, signal: AbortSignal, cap = MAX_PHOTO_BYTES): Promise<Uint8Array> {
  const res = await f(url, { headers: { "User-Agent": UA, Accept: "image/webp,image/jpeg,*/*;q=0.5" }, signal, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > cap) {
    await res.body?.cancel().catch(() => {});
    throw new Error("too big");
  }
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > cap) throw new Error("too big");
    return buf;
  }
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      throw new Error("too big");
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ───────────────────────────────────────────────────────────── text helpers
const PROVIDER_NAME: Record<PhotoProvider, string> = { rawpixel: "Rawpixel", stocksnap: "StockSnap", wordpress: "WordPress Photo Directory", wikimedia: "Wikimedia Commons" };
export const licenseLabel = (l: PhotoLicense, v?: string) => (l === "cc0" ? "CC0" : l === "pdm" ? "Public domain" : `CC ${l.toUpperCase()}${v ? " " + v : ""}`);

/** A plain scene description from the title ("Free cute houseplant window image" → "Cute houseplant window"). */
export function altFrom(title: string, query: string): string {
  let t = title
    .replace(/^file:/i, "")
    .replace(/\.(jpe?g|png|webp)$/i, "")
    .replace(/geograph\.org\.uk/gi, " ")
    .replace(/[_]+/g, " ")
    .replace(/\b(free|stock|royalty|hd|photo|image|picture|photography|cc0|public domain)\b/gi, " ")
    .split(/\s+/)
    .filter((w) => w && !/\d/.test(w)) // archive numbers, dates, camera file names
    .join(" ")
    .replace(/(\s*[-–—,;:]\s*)+$/g, "")
    .replace(/^(\s*[-–—,;:]\s*)+/g, "")
    .replace(/\s+[-–—]\s+[-–—\s]*/g, " - ")
    .trim();
  if (t.replace(/[^a-z]/gi, " ").trim().split(/\s+/).filter((w) => w.length > 1).length < 2) t = query;
  if (t.length > 100) {
    const cut = t.slice(0, 100);
    const stop = Math.max(cut.lastIndexOf(":"), cut.lastIndexOf(","), cut.lastIndexOf(";"));
    t = stop > 30 ? cut.slice(0, stop) : cut.slice(0, cut.lastIndexOf(" ") > 30 ? cut.lastIndexOf(" ") : 100);
  }
  t = t.replace(/[<>"]/g, "").replace(/[\s,;:-]+$/, "").trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : "Photo";
}

function creditOf(c: { title: string; creator?: string; provider: PhotoProvider; license: PhotoLicense }): string {
  const by = c.creator && !/^(rawpixel|stocksnap|unknown)$/i.test(c.creator) ? c.creator.slice(0, 60) : "";
  if (c.license === "by" || c.license === "by-sa") return `"${altFrom(c.title, "Photo").slice(0, 60)}"${by ? ` by ${by}` : ""}`;
  return by ? `${by} / ${PROVIDER_NAME[c.provider]}` : PROVIDER_NAME[c.provider];
}

export interface PhotoCreditItem { n: number; label: string; href: string; license: string; licenseUrl: string; required: boolean }
/**
 * The footer credit line. CC BY / BY-SA require attribution (title, creator, licence, link); CC0 does not, but we
 * credit anyway. `text` is plain (escape it before putting it in HTML); `items` carry the links.
 */
export function photoCredits(photos: PhotoMeta[]): { text: string; items: PhotoCreditItem[] } {
  const items = photos.map((p) => ({
    n: p.n,
    label: p.license === "by" || p.license === "by-sa" ? `${p.credit}, via ${PROVIDER_NAME[p.provider]}` : p.credit,
    href: p.sourceUrl,
    license: licenseLabel(p.license, p.licenseVersion),
    licenseUrl: p.licenseUrl,
    required: p.license === "by" || p.license === "by-sa",
  }));
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const i of items) {
    const s = `${i.label} (${i.license})`;
    if (!seen.has(s)) parts.push(s);
    seen.add(s);
  }
  return { text: parts.length ? `Photos: ${parts.join(" · ")}` : "", items };
}

/** Same-origin URL for a stored photo, with a cache-busting version. */
export const photoUrl = (slug: string, p: Pick<PhotoMeta, "n" | "hash">) => `/s/${slug}/p/${p.n}?v=${p.hash.slice(0, 10)}`;

// ───────────────────────────────────────────────────────────── rate limit (anonymous Openverse: 20/min, 200/day)
const ovCalls: number[] = [];
let ovDay = { day: "", n: 0 };
function ovAllow(): boolean {
  const now = Date.now();
  while (ovCalls.length && now - ovCalls[0]! > 60_000) ovCalls.shift();
  const day = new Date(now).toISOString().slice(0, 10);
  if (ovDay.day !== day) ovDay = { day, n: 0 };
  if (ovCalls.length >= 18 || ovDay.n >= 190) return false;
  ovCalls.push(now);
  ovDay.n++;
  return true;
}
/** Tests only. */
export function _resetRateLimit() {
  ovCalls.length = 0;
  ovDay = { day: "", n: 0 };
}

// ───────────────────────────────────────────────────────────── main
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((r) => {
  const t = setTimeout(r, ms);
  signal.addEventListener("abort", () => (clearTimeout(t), r()), { once: true });
});

export async function findPhotos(input: FindPhotosInput): Promise<SitePhoto[]> {
  const log = input.log ?? ((m: string) => console.log(m));
  if (input.mock ?? config.mockAi) return mockPhotos(input.idea, { fill: input.mockFill });
  const started = Date.now();
  const budget = Math.max(1000, Math.min(input.budgetMs ?? 25_000, 30_000));
  const deadline = started + budget;
  // A ref'd timer (AbortSignal.timeout is unref'd and would not keep a lone script alive until the deadline).
  const box = new AbortController();
  const timer = setTimeout(() => box.abort(new Error("photo time budget used")), budget);
  const all = AbortSignal.any([box.signal, ...(input.signal ? [input.signal] : [])]);
  const f = input.fetch ?? fetch;
  const cache = input.cache === undefined ? await defaultCache() : input.cache;
  try {
    const area = cleanCity(input.area ?? areaOf(input.idea, input.city));
    const q = buildQueries({ ...input, area });
    const names = area ? [area] : input.city ? [cleanCity(input.city)] : [];
    const pool = await search(q, { f, signal: all, deadline: started + Math.min(Math.round(budget * 0.4), 8000), cache, log, names, idea: input.idea });
    if (all.aborted || !pool.length) return [];
    let ranked = pool;
    const useVision = (input.vision ?? process.env.PHOTO_VISION !== "0") && !config.mockAi;
    let alts = new Map<string, string>();
    const category = categoryOf(input.idea)?.key;
    if (useVision && deadline - Date.now() > 9000) {
      const v = await visionCheck(pool, input, { f, signal: all, deadline: Date.now() + Math.min(11_000, deadline - Date.now() - 6000) }, category).catch((e) => {
        log(`[photos] vision check skipped: ${(e as Error).message}`);
        return null;
      });
      if (v) {
        const kept = pool.filter((c) => !v.reject.has(c.id));
        // Photos the check looked at and kept come first; an unseen place photo is never used (it is the riskiest pick).
        const seen = kept.filter((c) => v.alts.has(c.id));
        const seenStock = seen.filter((c) => c.provider !== "wikimedia");
        ranked = (seenStock.length >= 4 ? [...seenStock, ...seen.filter((c) => c.provider === "wikimedia")] : kept.filter((c) => c.provider !== "wikimedia" || v.alts.has(c.id)))
          .map((c) => (v.hero === c.id ? { ...c, rank: -10, queryRole: "hero" as PhotoRole } : c));
        alts = v.alts;
      }
    }
    const photos = await pickAndDownload(ranked, { f, signal: all, alts, log, category });
    log(`[photos] ${photos.length} photos in ${Date.now() - started} ms (${pool.length} candidates)`);
    return photos;
  } catch (e) {
    log(`[photos] failed, site will show without photos: ${(e as Error).message}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function defaultCache(): Promise<FindPhotosInput["cache"]> {
  try {
    const m = await import("./photos-db.js");
    return { get: m.cacheGet, set: m.cacheSet };
  } catch {
    return null;
  }
}

interface Ctx { f: typeof fetch; signal: AbortSignal; deadline: number; cache: FindPhotosInput["cache"]; log: (m: string) => void; names?: string[]; idea?: string }

async function cached(ctx: Ctx, key: string, run: () => Promise<Candidate[]>): Promise<Candidate[]> {
  const hit = await ctx.cache?.get(key).catch(() => null);
  if (Array.isArray(hit)) return hit as Candidate[];
  const v = await run();
  if (v.length) await ctx.cache?.set(key, v).catch(() => {});
  return v;
}

async function searchOpenverse(ctx: Ctx, query: string, role: PhotoRole): Promise<Candidate[]> {
  return cached(ctx, `ov1|${query}`, async () => {
    if (!ovAllow()) return [];
    const u = `${OPENVERSE}?${new URLSearchParams({ q: query, license_type: "commercial", mature: "false", page_size: "20", source: "stocksnap,rawpixel,wordpress" })}`;
    const sig = AbortSignal.any([ctx.signal, AbortSignal.timeout(Math.max(500, ctx.deadline - Date.now()))]);
    const res = await ctx.f(u, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: sig });
    if (!res.ok) throw new Error(`Openverse ${res.status}`);
    return parseOpenverse(await res.json(), query, role);
  }).then((list) => list.map((c) => ({ ...c, query, queryRole: role })));
}

async function searchCommons(ctx: Ctx, query: string): Promise<Candidate[]> {
  return cached(ctx, `wm2|${query}`, async () => {
    const u = `${COMMONS}?${new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      generator: "search",
      gsrsearch: `${query} filetype:bitmap`,
      gsrnamespace: "6",
      gsrlimit: "20",
      prop: "imageinfo",
      iiprop: "url|size|mime|extmetadata",
      iiurlwidth: "1280",
      iiextmetadatafilter: "LicenseShortName|Artist|AttributionRequired|ImageDescription|Categories|DateTimeOriginal",
    })}`;
    const sig = AbortSignal.any([ctx.signal, AbortSignal.timeout(Math.max(500, ctx.deadline - Date.now()))]);
    const res = await ctx.f(u, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: sig });
    if (!res.ok) throw new Error(`Commons ${res.status}`);
    return parseCommons(await res.json(), query);
  });
}

/** Up to 5 Openverse searches + up to 2 Commons searches, in parallel, within the search deadline. */
async function search(q: PhotoQueries, ctx: Ctx): Promise<Candidate[]> {
  const plan: Array<[PhotoRole, string]> = [];
  const take = (role: PhotoRole, n: number) => q[role].slice(0, n).forEach((s) => plan.push([role, s]));
  take("hero", 2);
  take("detail", 2);
  take("people", 1);
  const settle = <T>(p: Promise<T[]>, label: string) => p.catch((e: Error) => (ctx.log(`[photos] ${label}: ${e.message}`), [] as T[]));
  const ov = Promise.all(plan.map(([role, s]) => settle(searchOpenverse(ctx, s, role), `search "${s}"`)));
  const place = (async () => {
    for (const s of q.place.slice(0, 2)) {
      const r = (await settle(searchCommons(ctx, s), `place "${s}"`)).filter((c) => keepCandidate(c, ctx.idea)).filter((c) => ratioOk(c, "place") && placeOk(c, ctx.names ?? []));
      if (r.length) return r;
    }
    return [] as Candidate[];
  })();
  const [lists, places] = await Promise.all([ov, place]);
  let pool = dedupe(lists.flat().filter((c) => keepCandidate(c, ctx.idea)));
  // Thin results: one more try with a category default the plan did not run yet.
  if (pool.filter((c) => ratioOk(c, "hero")).length < 2 && Date.now() < ctx.deadline - 1500) {
    const extra = [...q.hero.slice(2), ...q.detail.slice(2)][0];
    if (extra) pool = dedupe([...pool, ...(await settle(searchOpenverse(ctx, extra, "hero"), `search "${extra}"`)).filter((c) => keepCandidate(c, ctx.idea))]);
  }
  return dedupe([...pool, ...places]);
}

/** Fills the slots (hero, 3 detail, people, place) with downloaded, verified photos. Each slot tries ≤3 candidates. */
async function pickAndDownload(pool: Candidate[], ctx: { f: typeof fetch; signal: AbortSignal; alts: Map<string, string>; log: (m: string) => void; category?: string }): Promise<SitePhoto[]> {
  const slots: PhotoRole[] = ["hero", "detail", "detail", "detail", "people", "place"];
  const claimed = new Set<string>();
  // Main-subject words already used by a picked photo: two "monstera" or two "leash" details read as one photo twice.
  const usedWords = new Set<string>();
  const next = (role: PhotoRole): Candidate | null => {
    const fit = pool
      .filter((c) => !claimed.has(c.id) && ratioOk(c, role) && (role === "place" ? c.provider === "wikimedia" : c.provider !== "wikimedia"))
      .sort((a, b) => score(b, role, ctx.category) - score(a, role, ctx.category));
    const fresh = role === "place" ? fit : fit.filter((c) => !subjectWords(`${ctx.alts.get(c.id) ?? ""} ${c.title}`).some((w) => usedWords.has(w)));
    const c = fresh[0] ?? fit[0] ?? null;
    if (c) {
      claimed.add(c.id);
      subjectWords(c.title).forEach((w) => usedWords.add(w));
    }
    return c;
  };
  const fill = async (role: PhotoRole, i: number): Promise<{ i: number; photo: SitePhoto } | null> => {
    if (role === "place") await sleep(300, ctx.signal); // Commons thumbs 429 on bursts
    for (let attempt = 0; attempt < 3 && !ctx.signal.aborted; attempt++) {
      const c = next(role);
      if (!c) return null;
      for (const url of downloadUrls(c)) {
        try {
          const bytes = await fetchCapped(ctx.f, url, ctx.signal);
          const kind = sniffImage(bytes);
          if (!kind || kind.width < 600) throw new Error("not a usable JPEG/WebP");
          return { i, photo: toPhoto(c, role, bytes, kind, ctx.alts.get(c.id)) };
        } catch (e) {
          if (ctx.signal.aborted) return null;
          ctx.log(`[photos] skip ${c.id}: ${(e as Error).message}`);
        }
      }
    }
    return null;
  };
  // Slots run in parallel; claims are synchronous, so two slots never take the same photo.
  const got = (await Promise.all(slots.map((r, i) => fill(r, i)))).filter((x): x is { i: number; photo: SitePhoto } => !!x).sort((a, b) => a.i - b.i);
  const seenHash = new Set<string>();
  const out: SitePhoto[] = [];
  for (const { photo } of got) {
    if (seenHash.has(photo.hash) || out.length >= MAX_PHOTOS) continue;
    seenHash.add(photo.hash);
    out.push({ ...photo, n: out.length + 1, ref: `p${out.length + 1}` });
  }
  return out;
}

function toPhoto(c: Candidate, role: PhotoRole, bytes: Uint8Array, kind: { mime: "image/jpeg" | "image/webp"; width: number; height: number }, alt?: string): SitePhoto {
  return {
    n: 0,
    ref: "",
    id: c.id,
    role,
    alt: alt || altFrom(c.title, c.query),
    title: c.title.slice(0, 140) || altFrom("", c.query),
    creator: c.creator,
    creatorUrl: c.creatorUrl,
    credit: creditOf(c),
    license: c.license,
    licenseVersion: c.licenseVersion,
    licenseUrl: c.licenseUrl,
    sourceUrl: c.sourceUrl,
    provider: c.provider,
    width: kind.width,
    height: kind.height,
    mime: kind.mime,
    size: bytes.length,
    hash: createHash("sha256").update(bytes).digest("hex"),
    shows: showsOf(c, alt),
    bytes,
  };
}

/** The richest honest description we have: the photo check's words, else the source's full title, description and tags. */
export function showsOf(c: Pick<Candidate, "title" | "tags" | "desc" | "provider">, visionAlt?: string): string {
  const clean = (s: string) => s.replace(/[<>"]/g, "").replace(/\s+/g, " ").trim();
  if (visionAlt) return clean(`${visionAlt} (checked by looking at the photo)`).slice(0, 300);
  const title = clean(altFrom(c.title, "photo")).slice(0, 220);
  const desc = c.desc && !title.toLowerCase().includes(clean(c.desc).toLowerCase().slice(0, 40)) ? ` ${clean(c.desc).slice(0, 160)}` : "";
  const tags = c.provider === "wikimedia" ? [] : c.tags.slice(0, 6).map(clean).filter((t) => t && !title.toLowerCase().includes(t.toLowerCase()));
  return `${title}.${desc}${tags.length ? ` Tags: ${tags.join(", ")}.` : ""} (title from the photo site, not checked)`.slice(0, 340);
}

// ───────────────────────────────────────────────────────────── mock (bundled fixtures, no network)
interface FixtureEntry { file: string; category: string; role: PhotoRole; alt: string; title: string; creator?: string; creatorUrl?: string | null; license: PhotoLicense; licenseVersion?: string | null; licenseUrl: string; sourceUrl: string; provider: PhotoProvider; openverseId: string }
const HERE = dirname(fileURLToPath(import.meta.url));
function fixtureDir(): string | null {
  for (const d of [join(HERE, "fixtures", "photos"), join(process.cwd(), "server", "site", "fixtures", "photos")]) if (existsSync(join(d, "credits.json"))) return d;
  return null;
}
/** Which fixture set stands in for an idea's category (bakery/food look closest to the coffee set). */
const MOCK_SET: Record<string, string> = { coffee: "coffee", bakery: "coffee", food: "coffee", plants: "plants", dogs: "dogs", work: "work", fitness: "", beauty: "", kids: "", tools: "" };

export function mockPhotos(idea: string, opts: { fill?: boolean } = {}): SitePhoto[] {
  const dir = fixtureDir();
  if (!dir) return [];
  let list: FixtureEntry[];
  try {
    list = JSON.parse(readFileSync(join(dir, "credits.json"), "utf8")) as FixtureEntry[];
  } catch {
    return [];
  }
  const set = MOCK_SET[categoryOf(idea)?.key ?? ""] ?? "";
  const mine = list.filter((e) => e.category === set).sort((a, b) => (a.role === "hero" ? -1 : b.role === "hero" ? 1 : 0));
  const rest = opts.fill ? list.filter((e) => e.category !== set) : [];
  const chosen = [...mine, ...rest].slice(0, MAX_PHOTOS);
  const out: SitePhoto[] = [];
  for (const e of chosen) {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(readFileSync(join(dir, e.file)));
    } catch {
      continue;
    }
    const kind = sniffImage(bytes);
    if (!kind) continue;
    const c: Candidate = { id: `${e.provider}:${e.openverseId}`, provider: e.provider, title: e.title, creator: e.creator || undefined, creatorUrl: e.creatorUrl || undefined, license: e.license, licenseVersion: e.licenseVersion || undefined, licenseUrl: e.licenseUrl, sourceUrl: e.sourceUrl, url: "", width: kind.width, height: kind.height, tags: [], query: "", queryRole: e.role, rank: 0 };
    const role: PhotoRole = out.length === 0 ? "hero" : e.category === set ? "detail" : "detail";
    const p = toPhoto(c, role, bytes, kind, e.alt);
    out.push({ ...p, n: out.length + 1, ref: `p${out.length + 1}` });
  }
  return out;
}

// ───────────────────────────────────────────────────────────── serving
/** The stored photo as an HTTP response (null when missing). Long, immutable cache: URLs carry ?v=<hash>. */
export async function photoResponse(projectId: string, n: number): Promise<Response | null> {
  const { getPhotoBytes } = await import("./photos-db.js");
  const p = await getPhotoBytes(projectId, n).catch(() => null);
  if (!p || (p.mime !== "image/jpeg" && p.mime !== "image/webp") || !sniffImage(p.bytes)) return null;
  return new Response(p.bytes as unknown as ConstructorParameters<typeof Response>[0], {
    status: 200,
    headers: {
      "Content-Type": p.mime,
      "Content-Length": String(p.bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      ETag: `"${p.hash.slice(0, 16)}"`,
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}

/**
 * Hono handler for GET /s/:slug/p/:n (mount it inside siteRoutes, before the index.html catch-all).
 * `resolve(slug)` returns the project id that owns that site, or null.
 */
export function photoRoute(resolve: (slug: string) => Promise<string | null>) {
  return async (c: Context, next: Next) => {
    const slug = c.req.param("slug") ?? "";
    const raw = (c.req.param("n") ?? "").replace(/^p/, "");
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug) || !/^\d{1,2}$/.test(raw)) return next();
    const projectId = await resolve(slug).catch(() => null);
    if (!projectId) return c.notFound();
    const res = await photoResponse(projectId, Number(raw));
    return res ?? c.notFound();
  };
}

// ───────────────────────────────────────────────────────────── optional Haiku vision check
export const PHOTO_CHECK_MODEL = process.env.MODEL_PHOTO_CHECK || "claude-haiku-5-5";
const VISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reject", "hero", "alts"],
  properties: {
    reject: { type: "array", items: { type: "integer" } },
    hero: { type: "integer" },
    alts: { type: "array", items: { type: "object", additionalProperties: false, required: ["i", "alt"], properties: { i: { type: "integer" }, alt: { type: "string" } } } },
  },
};

/**
 * One Haiku call over ≤14 small thumbnails (12 Openverse /thumb/ + 2 Commons 330px, ~30 KB each). Returns ids to drop, the best hero, and
 * plain alt texts. About $0.0005 per site. Recorded with recordUsage("site-photos") and in .notes/next/spend.log.
 */
async function visionCheck(pool: Candidate[], input: FindPhotosInput, ctx: { f: typeof fetch; signal: AbortSignal; deadline: number }, category?: string): Promise<{ reject: Set<string>; hero: string | null; alts: Map<string, string> }> {
  // The best stock candidates plus the best 2 place candidates (the place photo is the riskiest pick).
  const stock = pool.filter((c) => c.thumb && c.provider !== "wikimedia").sort((a, b) => score(b, b.queryRole, category) - score(a, a.queryRole, category)).slice(0, 12);
  const place = pool.filter((c) => c.thumb && c.provider === "wikimedia").sort((a, b) => score(b, "place") - score(a, "place")).slice(0, 2);
  const picks = [...stock, ...place];
  if (picks.length < 3) throw new Error("too few thumbnails");
  const sig = AbortSignal.any([ctx.signal, AbortSignal.timeout(Math.max(500, ctx.deadline - Date.now()))]);
  const thumbs = await Promise.all(
    picks.map(async (c) => {
      try {
        if (c.provider === "wikimedia") await sleep(150, sig);
        const b = await fetchCapped(ctx.f, c.thumb!, AbortSignal.any([sig, AbortSignal.timeout(3500)]), 200_000);
        const k = sniffImage(b);
        return k ? { c, data: Buffer.from(b).toString("base64"), mime: k.mime } : null;
      } catch {
        return null;
      }
    }),
  );
  const ok = thumbs.filter((t): t is NonNullable<typeof t> => !!t);
  if (ok.length < 3) throw new Error("thumbnails did not load");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { recordUsage, usdOf } = await import("../cost.js");
  const client = new Anthropic({ apiKey: config.anthropicKey, maxRetries: 0, timeout: Math.max(1500, ctx.deadline - Date.now()) });
  const content: unknown[] = [
    { type: "text", text: `Business idea: ${input.idea.slice(0, 300)}${input.city ? `\nCity: ${input.city.slice(0, 60)}` : ""}\nThese are candidate photos for its website, numbered 0-${ok.length - 1}.` },
  ];
  ok.forEach((t, i) => content.push({ type: "text", text: `#${i}` }, { type: "image", source: { type: "base64", media_type: t.mime, data: t.data } }));
  content.push({
    type: "text",
    text: "Reject any photo that is off-topic for this business, an illustration, painting, engraving, old print or museum object, black-and-white or sepia, a product cut-out on white, a sign or text, dark or blurry, low quality, a famous landmark, or one where a person's face is the main subject. Also reject photos showing uniforms, logos, government-agency or brand marks, or screens with unrelated data, and keep only photos whose main subject is the product, the customer or the setting of this business: fewer photos are better than off-topic ones. Also reject photos whose setting contradicts the business (an outdoor farm or field for an indoor shop or a city service, a costume or party). Pick the best hero: a real, wide, well-lit photo of the thing the business sells or does, with calm space for a headline. For every photo you keep, write a plain alt text (6-16 words) that says only what is visible: the main subject, what it is doing, and the setting (indoors, street, park). Never guess brands, places or actions you cannot see. Use the numbers above. hero is -1 if none fits.",
  });
  const msg = await client.messages.create(
    {
      model: PHOTO_CHECK_MODEL,
      max_tokens: 3000,
      messages: [{ role: "user", content }],
      output_config: { effort: "low", format: { type: "json_schema", schema: VISION_SCHEMA } },
    } as never,
    { signal: sig },
  ) as unknown as { model: string; usage: { input_tokens: number; output_tokens: number }; content: Array<{ type: string; text?: string }>; stop_reason: string };
  recordUsage("site-photos", msg.model, msg.usage);
  const usd = usdOf(msg.model, msg.usage);
  try {
    const dir = join(process.cwd(), ".notes", "next");
    if (existsSync(dir)) appendFileSync(join(dir, "spend.log"), `SITE2 ${msg.model} $${usd.toFixed(4)}\n`);
  } catch {
    /* the ledger line above is the source of truth */
  }
  if (msg.stop_reason === "refusal") throw new Error("vision check declined");
  if (msg.stop_reason === "max_tokens") throw new Error("vision check answer cut off");
  const text = msg.content.map((b) => (b.type === "text" ? b.text ?? "" : "")).join("");
  return applyVision(text, ok.map((t) => t.c));
}

/** Parses the vision JSON against the shown candidates (exported for tests). Bad JSON = keep everything. */
export function applyVision(text: string, shown: Candidate[]): { reject: Set<string>; hero: string | null; alts: Map<string, string> } {
  const out = { reject: new Set<string>(), hero: null as string | null, alts: new Map<string, string>() };
  let j: { reject?: unknown; hero?: unknown; alts?: unknown };
  try {
    j = JSON.parse(text) as typeof j;
  } catch {
    return out;
  }
  const at = (i: unknown) => (typeof i === "number" && Number.isInteger(i) && i >= 0 && i < shown.length ? shown[i]! : null);
  if (Array.isArray(j.reject)) for (const i of j.reject) { const c = at(i); if (c) out.reject.add(c.id); }
  const h = at(j.hero);
  if (h && !out.reject.has(h.id)) out.hero = h.id;
  if (Array.isArray(j.alts))
    for (const a of j.alts as Array<{ i?: unknown; alt?: unknown }>) {
      const c = at(a?.i);
      const alt = typeof a?.alt === "string" ? a.alt.replace(/[<>"]/g, "").replace(/\s+/g, " ").trim().slice(0, 140) : "";
      if (c && alt) out.alts.set(c.id, alt);
    }
  return out;
}
