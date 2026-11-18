// WP4: the Launch kit orchestrator. One paid step after the report: Nova writes the brand, then logo, website and
// 30-day plan are made in parallel (Promise.allSettled). Each part is retried once, then degrades to a plain
// fallback so the founder never sees an error screen. A per-kit spend guard (cost.ts Budget) refuses work past
// KIT_SPEND_CAP_CENTS. Status is saved after every change; the UI polls GET /api/projects/:id/kit (kit-routes.ts).
//
// The parts come from other packages, loaded lazily so the kit runs (with fallbacks) before they exist:
//   WP1 server/site/plan.ts       planSite(input: KitInput): Promise<SiteSpec>
//   WP2 server/brand/draw.ts      drawLogos(brand: KitBrand, avoid: string[]): Promise<LogoOption[]>
//   WP3 server/marketing/plan.ts  planMarketing(input: KitInput): Promise<MarketingResult>
//   site2 server/site/photos.ts   findPhotos(...)  real photos for the idea (free, keyless, ≤12 s, in parallel)
//   site2 server/site/custom.ts   generateCustomSite(...)  one page designed for this business, after the copy is
//                                 ready; it becomes the live design unless the founder already chose one by hand.
import { statKind } from "./site/stat-kind.js";
import { freeToUser, runDept } from "./ai.js";
import { config } from "./config.js";
import { Budget, BudgetError, costOf, costScope } from "./cost.js";
import { exec, getProject, getProjectRow } from "./db.js";
import { slugify } from "./jobs.js";
import { loadV7 } from "./jobs-v7.js";
import type { Kit, KitBrand, KitInput, LogoOption, LogoResult, MarketingResult, ReportDigest, SitePhotoMeta, SiteResult, SiteTemplate, StandardTemplate } from "./kit-contract.js";
import type { SitePhoto } from "./site/photos.js";
import type { CustomPhoto } from "./site/custom-render.js";
import type { NovaBrand, Project } from "./types.js";
import { normHex } from "./brand/lint.js";
import { templatePlan, templateSite } from "./kit-templates.js";
import { gateReason, withValidateFirst, type PlanV2, type ReportGate } from "./marketing/schema.js";
import type { SiteRow } from "./site/db.js";
import type { SiteSpec } from "./site/spec.js";
import { asSiteSpec, luminance, validateModelSite } from "./site/validate.js";
import type { ResultsV7 } from "./v7.js";
import { isPlaceholderPass, plainText } from "./v7.js";
import { currencyOf, symbolFor } from "./money.js";
import { sellsOnline } from "./report-v7.js";

export type KitPart = "logo" | "site" | "marketing";
export const KIT_PARTS: readonly KitPart[] = ["logo", "site", "marketing"];
export const SITE_TEMPLATES: readonly StandardTemplate[] = ["editorial", "bold", "warm"];
/** Every design the founder can pick: the page made for them (once it is ready) and the 3 standard ones. */
export const SITE_DESIGNS: readonly SiteTemplate[] = ["custom", ...SITE_TEMPLATES];

/**
 * Reservation estimates per part (PLAN.md §4, list prices). custom = the designed page (one Sonnet 5.5 call,
 * ~4.5k cached system + ~3k brief in (menu included), 8-14k out with thinking at "medium": typically $0.10-0.15, $0.25 worst case
 * at the 24k cap). Photos are free (keyless Openverse/Commons). The sum must stay ≤ KIT_CAP_USD (test/kit.test.ts).
 */
export const KIT_EST = { brand: 0.04, logo: 0.09, site: 0.05, marketing: 0.115, custom: 0.12 } as const;

export interface KitDeps {
  brand(p: Project): Promise<NovaBrand>;
  logos(brand: KitBrand, avoid: string[], ctx?: { idea: string; report?: ReportDigest }): Promise<LogoOption[]>;
  site(input: KitInput): Promise<unknown>;
  marketing(input: KitInput): Promise<MarketingResult>;
  /** Real photos for the idea (never throws; [] is fine). Default: site/photos.ts findPhotos, with the search words the
   *  website plan wrote (its menu items: "flat white", "croissant"). */
  photos?(input: KitInput, queries?: SiteSpec["photoQueries"]): Promise<SitePhoto[]>;
  /** The page designed for this business; html null when it did not pass the checks. Default: site/custom.ts. */
  custom?(input: KitInput, photos: CustomPhoto[], spec: SiteSpec): Promise<{ html: string | null; usd: number; issues: string[] }>;
}

// ───────────────────────────────────────────── storage (one row per project)
let tableReady: Promise<unknown> | null = null;
const ensureTable = () =>
  (tableReady ??= exec("CREATE TABLE IF NOT EXISTS kits (project_id TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at INTEGER NOT NULL)"));

export async function loadKit(projectId: string): Promise<Kit | null> {
  await ensureTable();
  const r = await exec("SELECT json FROM kits WHERE project_id = ?", [projectId]);
  const j = r.rows[0]?.json;
  return j ? (JSON.parse(String(j)) as Kit) : null;
}
export async function saveKit(projectId: string, kit: Kit) {
  await ensureTable();
  await exec(
    "INSERT INTO kits (project_id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
    [projectId, JSON.stringify(kit), Date.now()],
  );
}

// ───────────────────────────────────────────── inputs
const PALETTE_DEFAULT = { primary: "#1F2937", accent: "#0AC18E", bg: "#F8FAFC", ink: "#111827" };
const LANG_OF: Record<string, string> = { es: "es", spanish: "es", español: "es", en: "en", english: "en", fr: "fr", french: "fr", de: "de", german: "de", it: "it", pt: "pt", ca: "ca" };

/** The kit's currency sign. A written report decides it (its econ currency, else the idea's own: no conversion);
 *  older projects keep Sam's or Mia's sign. */
export function kitCurrency(p: Pick<Project, "idea" | "results">): string {
  const v7 = (p.results as { v7?: Pick<ResultsV7, "report" | "econ"> }).v7;
  if (v7?.report) return symbolFor(v7.econ?.currency ?? (v7.econ ? "EUR" : currencyOf(p.idea).code));
  return p.results.sam?.currency ?? p.results.mia?.market?.currency ?? "€";
}

export function kitBrandFrom(nova: NovaBrand | undefined, p: Project): KitBrand {
  const n = nova?.names[nova.chosen] ?? nova?.names[0];
  const hex = (role: string, i: number) => n?.palette.find((c) => c.name === role)?.hex ?? n?.palette[i]?.hex;
  const market = p.results.mia?.market;
  const lang = LANG_OF[(market?.language ?? "en").trim().toLowerCase()] ?? (market?.language ?? "en").slice(0, 2).toLowerCase();
  const fallbackName = (p.results.mia?.title ?? "My business").split(/\s+/).slice(0, 2).join(" ");
  return safeBrand({
    name: n?.name ?? fallbackName,
    tagline: n?.tagline ?? "",
    voice: nova ? `${nova.voice.traits.join(", ")}. ${nova.voice.rules}` : "Clear and direct.",
    palette: {
      primary: hex("Primary", 0) ?? PALETTE_DEFAULT.primary,
      accent: hex("Accent", 1) ?? PALETTE_DEFAULT.accent,
      bg: hex("Background", 2) ?? PALETTE_DEFAULT.bg,
      ink: hex("Primary", 0) ?? PALETTE_DEFAULT.ink,
    },
    fonts: { display: nova?.typography.display ?? "Fraunces", text: nova?.typography.body ?? "Inter" },
    lang: lang || "en",
    // an idea that sells through Etsy, an app, a website… is planned online even when it names the founder's city
    ...(market?.city && !sellsOnline(p.idea) ? { city: market.city } : {}),
    currency: kitCurrency(p),
  });
}

/**
 * Colours from the brand writer are checked before they reach SVG attributes, the website tokens or link previews:
 * only #RRGGBB values survive (else the default), and ink is always dark (it is the dark background of the logo
 * and the main colour of the mark): the darkest palette colour when it is dark enough, else near-black.
 */
export function safeBrand(b: KitBrand): KitBrand {
  const h = (v: string | undefined, d: string) => normHex(String(v ?? "")) ?? d;
  const primary = h(b.palette.primary, PALETTE_DEFAULT.primary);
  const accent = h(b.palette.accent, PALETTE_DEFAULT.accent);
  const bg = h(b.palette.bg, PALETTE_DEFAULT.bg);
  const darkest = [h(b.palette.ink, primary), primary, accent].sort((x, y) => luminance(x) - luminance(y))[0]!;
  const ink = luminance(darkest) <= 0.06 ? darkest : "#111827";
  return { ...b, palette: { primary, accent, bg, ink } };
}

/** The customer's own problem in plain words: the canvas value or the brief, never the research notes about rivals. */
function customerPain(p: Project, v7: ResultsV7 | null): string {
  const sam = p.results.sam as { canvas?: { value?: string } } | undefined;
  const mia = p.results.mia as { brief?: { concept?: string } } | undefined;
  const pick = [sam?.canvas?.value, mia?.brief?.concept].map((x) => String(x ?? "").trim()).find((x) => x.length >= 12);
  return pick ?? p.results.memo?.problem ?? v7?.report?.verdictLine ?? "";
}

/** The report, reduced to what the kit needs. Stats only with a real source link, most customer-relevant first. */
export function digestOf(p: Project, v7: ResultsV7 | null): ReportDigest & ReportGate {
  const sam = p.results.sam as (Project["results"]["sam"] & { launch_offer?: { item: string; price: number; normal_price: number; limit: number } }) | undefined;
  const lo = sam?.launch_offer;
  const all: ReportDigest["stats"] = [];
  // A number the report counts AGAINST the idea is never shown as proof on the website: drop it when a negative
  // finding with the same source, or a weak point, quotes it. Writer qualifiers ("72,707 (unconfirmed)") are cut, and
  // a number qualified as unconfirmed / estimate / assumed is not headline proof at all.
  const against = (v7?.work ?? []).flatMap((w) => w.findings.filter((f) => (f.impact ?? 0) < 0).map((f) => ({ url: f.source?.url ?? "", text: `${f.text} ${f.display ?? ""}` })));
  const weak = (v7?.report?.weaknesses ?? []).map((w) => w.text);
  const quotes = (t: string, v: string) => /\d/.test(v) && v.length >= 2 && t.includes(v);
  const push = (value: string, label: string, url: string, title?: string) => {
    if (/\((?:[^)]*\b(?:unconfirmed|estimate[sd]?|assumed|assumption|sin confirmar|estimad[oa]s?|supuesto)\b[^)]*)\)/i.test(value)) return;
    const v = value.replace(/\s*\([^)]*\)/g, "").trim();
    if (!v) return;
    if (against.some((f) => f.url === url && quotes(f.text, v)) || weak.some((t) => quotes(t, v))) return;
    all.push({ value: v, label, sourceUrl: url, ...(title?.trim() ? { sourceTitle: title.trim() } : {}) });
  };
  for (const b of v7?.blocks ?? []) for (const k of b.keyNumbers ?? []) if (k.source?.url) push(k.value, k.label, k.source.url, k.source.title);
  if (!all.length)
    for (const w of v7?.work ?? []) for (const f of w.findings) if (f.source?.url && f.display && (f.impact ?? 0) >= 0) push(f.display, f.text.slice(0, 80), f.source.url, f.source.title);
  const order = { demand: 0, price: 1, context: 2 } as const;
  const seen = new Set<string>();
  const stats = all
    .map((s, i) => ({ ...s, kind: statKind(s), i }))
    .filter((s) => (seen.has(`${s.value}|${s.label}`) ? false : (seen.add(`${s.value}|${s.label}`), true)))
    .sort((a, b) => order[a.kind] - order[b.kind] || a.i - b.i)
    .slice(0, 6)
    .map(({ i: _i, ...s }) => s);
  const competitors: ReportDigest["competitors"] = [];
  for (const w of v7?.work ?? []) for (const f of w.findings) if (f.competitor?.named && competitors.length < 5) competitors.push({ name: f.competitor.name, gap: f.competitor.note });
  if (!competitors.length) for (const c of p.results.leo?.competitors ?? []) if (competitors.length < 5) competitors.push({ name: c.name, gap: (c as { gap?: string; weakness?: string }).gap ?? (c as { weakness?: string }).weakness ?? "" });
  const risks = (v7?.report?.weaknesses.map((w) => w.text) ?? p.results.leo?.risks.map((r) => r.risk) ?? []).slice(0, 4);
  return {
    customer: p.results.mia?.brief.for ?? "",
    pain: customerPain(p, v7),
    // an idea that is free to its users (fee, commission, ads) sells nothing up front: a free early-access list
    offer: (lo && !(lo.price > 0)) || freeToUser(p.idea)
      ? { what: lo && !(lo.price > 0) ? lo.item : "Free early access", price: 0, ...(lo?.limit ? { limit: lo.limit } : {}), free: true }
      : lo ? { what: lo.item, price: lo.price, normal: lo.normal_price, limit: lo.limit } : { what: p.results.mia?.title ?? p.idea, price: sam?.price.value ?? 0 },
    stats,
    competitors,
    risks,
    ...gateOf(v7),
  };
}

/** The report's decision for the plan: verdict, deciding reason (the verdict line without its verdict word), checks. */
export function gateOf(v7: ResultsV7 | null): ReportGate {
  const r = v7?.report;
  if (!r) return {};
  const mainReason = gateReason(r.verdictLine);
  const validateFirst = (v7?.brief?.validateFirst ?? []).filter((v) => v?.what).slice(0, 3).map((v) => ({ what: plainText(v.what), how: plainText(v.how), passIf: isPlaceholderPass(v.passIf) ? "" : plainText(v.passIf) }));
  return { verdict: r.verdict, ...(mainReason ? { mainReason } : {}), ...(validateFirst.length ? { validateFirst } : {}) };
}

// ───────────────────────────────────────────── fallbacks (no AI)
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const initials = (name: string) =>
  (name.match(/\p{L}[\p{L}\p{N}]*/gu) ?? ["L"]).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("").slice(0, 2) || "L";

/** Three plain marks from the brand's own colours and initials: used when no drawn logo survives. */
export function fallbackLogos(brand: KitBrand): LogoOption[] {
  const { primary: p, accent: a, bg } = brand.palette;
  const m = esc(initials(brand.name));
  const t = (y: number, size: number, fill: string) => `<text x="32" y="${y}" text-anchor="middle" font-family="${esc(brand.fonts.display)}, serif" font-size="${size}" font-weight="700" fill="${fill}">${m}</text>`;
  return [
    { id: "fb-tile", family: "monogram", idea: "Your initials on a rounded tile, in your main colour.", svg: `<rect x="4" y="4" width="56" height="56" rx="14" fill="${p}"/>${t(42, m.length > 1 ? 24 : 30, bg)}` },
    { id: "fb-ring", family: "geometric", idea: "A ring with an accent dot: simple, works small.", svg: `<circle cx="32" cy="32" r="24" fill="none" stroke="${p}" stroke-width="6"/><circle cx="46" cy="18" r="6" fill="${a}"/>` },
    { id: "fb-stop", family: "literal", idea: "Your first letter with an accent full stop.", svg: `${t(46, 38, p).replace(`>${m}<`, `>${esc(m[0] ?? "L")}<`)}<circle cx="50" cy="42" r="5" fill="${a}"/>` },
  ];
}

/** A real SiteSpec written by code from the founder's input (renders like any other site). */
function fallbackSite(input: KitInput): SiteSpec {
  return validateModelSite(templateSite(input), input).spec;
}

/** A real PlanV2 written by code from the founder's input (no sources, no invented facts). */
function fallbackMarketing(input: KitInput): MarketingResult {
  return { plan: templatePlan(input), sources: [] };
}

// ───────────────────────────────────────────── default parts (lazy imports of WP1–3)
async function tryImport<T>(path: string): Promise<T | null> {
  try {
    return (await import(path)) as T;
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_MODULE_NOT_FOUND" || /Cannot find module/.test(String(e))) return null;
    throw e;
  }
}
const SITE_MOD = "./site/plan.js";
const LOGO_MOD = "./brand/draw.js";
const MKT_MOD = "./marketing/plan.js";

export const defaultDeps: KitDeps = {
  async brand(p) {
    if (p.results.nova) return p.results.nova; // already written (old build path or a resumed kit)
    return (await runDept("nova", p.idea, p.results)).json;
  },
  async logos(brand, avoid, ctx) {
    // WP2 returns { options, failed, ... } (DrawOut); an array is accepted too.
    const m = await tryImport<{ drawLogos(b: KitBrand, avoid: string[], ctx?: { idea: string; report?: ReportDigest }): Promise<LogoOption[] | { options: LogoOption[] }> }>(LOGO_MOD);
    if (!m) throw new NotReady("logo");
    const out = await m.drawLogos(brand, avoid, ctx ?? { idea: brand.tagline });
    return Array.isArray(out) ? out : out.options;
  },
  async site(input) {
    const m = await tryImport<{ planSite(i: KitInput): Promise<unknown> }>(SITE_MOD);
    if (!m) throw new NotReady("site");
    return m.planSite(input);
  },
  async marketing(input) {
    const m = await tryImport<{ planMarketing(i: KitInput): Promise<MarketingResult> }>(MKT_MOD);
    if (!m) throw new NotReady("marketing");
    return m.planMarketing(input);
  },
  async photos(input, queries) {
    const { findPhotos } = await import("./site/photos.js");
    return findPhotos({ idea: input.idea, city: input.brand.city, ...(queries ? { queries } : {}) });
  },
  async custom(input, photos, spec) {
    const { generateCustomSite } = await import("./site/custom.js");
    return generateCustomSite(input, photos, { spec });
  },
};
/** A part whose module is not installed yet: go straight to the fallback, no retry. */
class NotReady extends Error {
  constructor(part: string) {
    super(`${part} module not installed`);
  }
}

// ───────────────────────────────────────────── spend guard
export const KIT_CAP_USD = config.kitSpendCapCents / 100;

/** Budget synced with the project's real cost ledger (parallel parts share one ledger, so we read the total). */
function kitGuard(projectId: string, stage: string, cap = KIT_CAP_USD) {
  const b = new Budget(cap);
  return {
    budget: b,
    reserve(label: string, est: number) {
      b.spent = costOf(projectId, stage).usd;
      return b.reserve(label, est);
    },
  };
}

// ───────────────────────────────────────────── run
const running = new Map<string, Promise<Kit>>();

async function once<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof NotReady || e instanceof BudgetError) throw e;
    console.error(`[kit] ${label} failed, retrying once:`, (e as Error).message);
    return fn();
  }
}

/** The default website design for a kind of business (the founder can switch with one click). */
export function templateFor(idea: string): SiteTemplate {
  const t = idea.toLowerCase();
  if (/\b(dog|pet|cat|kid|child|yoga|wellness|care)/.test(t)) return "warm";
  if (/\b(app|saas|software|online|tool|platform)\b/.test(t)) return "bold";
  return "editorial";
}

/** The live website of a kit, for the website routes: brand, chosen logo and design are read from the kit. */
export async function siteRowFor(slug: string): Promise<SiteRow | null> {
  const r = await exec("SELECT id, example FROM projects WHERE slug = ?", [slug]);
  const id = r.rows[0]?.id;
  if (id == null) return null;
  const kit = await loadKit(String(id));
  const stored = kit?.site ? asSiteSpec(kit.site.spec) : null;
  if (!kit || !stored) return null;
  // A finished example is a showcase, not a shop: no reserve address, so no button can send real coins to anyone.
  // The page says so on top, and its reserve button opens a sheet that explains instead of showing a QR code.
  const example = Number(r.rows[0]?.example ?? 0) === 1;
  const spec = example ? { ...stored, reserve: { ...stored.reserve, address: "" } } : stored;
  const site = kit.site!;
  const projectId = String(id);
  const customReady = site.custom?.status === "done";
  return {
    slug,
    projectId,
    // "custom" only while the designed page is really there; otherwise the standard design it was made from.
    template: site.template === "custom" && !customReady ? site.base ?? "editorial" : site.template,
    base: site.base ?? (site.template !== "custom" ? site.template : "editorial"),
    spec,
    kit: { brand: kit.brand, logo: kit.logo },
    version: site.custom?.version ?? 1,
    updatedAt: Date.now(),
    ...(site.photos?.length ? { photos: site.photos } : {}),
    ...(example ? { example: true } : {}),
    ...(customReady ? { customHtml: async () => (await (await import("./site/custom-db.js")).loadCustom(projectId))?.html ?? null } : {}),
  };
}

/** Picks 3 options to show from the drawn ones (one per family when possible). */
export function pickThree(options: LogoOption[]): LogoOption[] {
  const out: LogoOption[] = [];
  for (const fam of ["literal", "monogram", "geometric"] as const) {
    const o = options.find((x) => x.family === fam && !out.includes(x));
    if (o) out.push(o);
  }
  for (const o of options) if (out.length < 3 && !out.includes(o)) out.push(o);
  return out.slice(0, 3);
}

/**
 * Runs the kit for a paid project. Idempotent: parts already done are kept; a running kit is not started twice.
 * Never throws for a part: a failed part ends as "done" with a fallback, or "error" only if even that fails.
 */
export function runKit(projectId: string, deps: KitDeps = defaultDeps, stage = "build"): Promise<Kit> {
  const cur = running.get(projectId);
  if (cur) return cur;
  const run = runKitInner(projectId, deps, stage).finally(() => running.delete(projectId));
  running.set(projectId, run);
  return run;
}
export const kitRunning = (projectId: string) => running.has(projectId);

async function runKitInner(projectId: string, deps: KitDeps, stage: string): Promise<Kit> {
  const p = await getProject(projectId);
  if (!p) throw new Error("Project not found");
  const guard = kitGuard(projectId, stage);
  let kit: Kit = (await loadKit(projectId)) ?? {
    brand: kitBrandFrom(p.results.nova, p),
    status: { brand: "queued", logo: "queued", site: "queued", marketing: "queued" },
  };
  // A part interrupted by a restart, or one that errored, is run again.
  for (const k of Object.keys(kit.status) as Array<keyof Kit["status"]>) if (kit.status[k] !== "done") kit.status[k] = "queued";
  // The founder may pick a logo or a design while the kit is still running (the designed page takes minutes):
  // their choices in the stored kit win over this run's in-memory copy.
  const save = async () => {
    keepFounderChoices(kit, await loadKit(projectId).catch(() => null));
    await saveKit(projectId, kit);
  };
  const set = async (part: keyof Kit["status"], s: Kit["status"][typeof part]) => {
    kit.status[part] = s;
    await save();
  };

  // 1. Brand (Nova). Without it the parts still run on a plain brand from the report.
  if (kit.status.brand !== "done") {
    await set("brand", "working");
    try {
      const settle = guard.reserve("brand", p.results.nova ? 0 : KIT_EST.brand);
      const nova = await once("brand", () => deps.brand(p));
      settle();
      await saveNovaJob(projectId, nova);
      p.results.nova = nova;
      kit.brand = kitBrandFrom(nova, p);
    } catch (e) {
      console.error(`[kit] ${projectId} brand fell back:`, (e as Error).message);
      kit.brand = kitBrandFrom(undefined, p);
    }
    await set("brand", "done");
  }

  const row = await getProjectRow(projectId);
  const slug = await reserveSlug(projectId, kit.brand.name);
  const input: KitInput = { projectId, idea: p.idea, brand: kit.brand, report: digestOf(p, await loadV7(projectId)), founderAddress: row?.founder_address ?? "", slug };

  // 2. Photos (free, ≤30 s) start as soon as the website copy is written: its menu names the products to photograph.
  //    Logo and plan keep running in parallel; the designed page waits for both copy and photos.
  // 3. Logo, website and plan in parallel.
  const part = async <R>(name: KitPart, est: number, make: () => Promise<R>, fallback: () => R | Promise<R>, put: (r: R) => void) => {
    if (kit.status[name] === "done") return;
    await set(name, "working");
    let r: R;
    try {
      const settle = guard.reserve(name, est);
      try {
        r = await once(name, make);
      } finally {
        settle();
      }
    } catch (e) {
      if (!(e instanceof NotReady)) console.error(`[kit] ${projectId} ${name} fell back:`, (e as Error).message);
      try {
        r = await fallback();
      } catch {
        await set(name, "error");
        return;
      }
    }
    put(r);
    await set(name, "done");
  };
  await Promise.allSettled([
    part<LogoResult>(
      "logo",
      KIT_EST.logo,
      async () => {
        // All survivors are kept (up to 6): the best three first, so "Show 3 more" needs no new drawing.
        const all = await deps.logos(kit.brand, [], { idea: p.idea, report: input.report });
        const first = pickThree(all);
        if (first.length < 3) throw new Error(`only ${first.length} logos survived`);
        const drawn = [...first, ...all.filter((o) => !first.includes(o))].slice(0, 6);
        return { options: drawn, chosen: drawn[0]!.id, fallback: false };
      },
      () => {
        const fb = fallbackLogos(kit.brand);
        return { options: fb, chosen: fb[0]!.id, fallback: true };
      },
      (r) => (kit.logo = r),
    ),
    part<SiteResult>(
      "site",
      KIT_EST.site,
      async () => {
        const spec = asSiteSpec(await deps.site(input));
        if (!spec) throw new Error("website spec could not be rendered");
        return { spec, template: templateFor(input.idea) };
      },
      () => ({ spec: fallbackSite(input), template: templateFor(input.idea) }),
      (r) => (kit.site = { ...r, base: r.template as StandardTemplate }),
    ).then(() => customStep(projectId, kit, input, deps, guard, kitPhotos(projectId, kit, input, deps), save)),
    part<MarketingResult>("marketing", KIT_EST.marketing, () => deps.marketing(input), () => fallbackMarketing(input), (r) => (kit.marketing = { ...r, plan: r.plan && typeof r.plan === "object" && Array.isArray((r.plan as PlanV2).weeks) ? withValidateFirst(r.plan as PlanV2, input.report as ReportGate) : r.plan })),
  ]);
  await save();
  return kit;
}

/** Copies what the founder chose (stored by chooseLogo/chooseTemplate/moreLogos) into a running kit. */
export function keepFounderChoices(kit: Kit, stored: Kit | null) {
  if (stored?.logo && kit.logo && stored.status.logo === "done") kit.logo = stored.logo; // the run never changes a drawn logo
  if (stored?.site?.picked && kit.site) {
    kit.site.template = stored.site.template;
    kit.site.picked = true;
  }
}

/** Photos for the site: found once per kit (bytes in site_photos, metadata in kit.site.photos). Never throws. */
async function kitPhotos(projectId: string, kit: Kit, input: KitInput, deps: KitDeps): Promise<SitePhotoMeta[]> {
  try {
    const { listPhotos, savePhotos } = await import("./site/photos-db.js");
    const have = await listPhotos(projectId);
    if (have.length) return have;
    const found = await (deps.photos ?? defaultDeps.photos!)(input, asSiteSpec(kit.site?.spec)?.photoQueries);
    if (!found.length) return [];
    await savePhotos(projectId, found);
    return await listPhotos(projectId);
  } catch (e) {
    console.error(`[kit] ${projectId} photos skipped:`, (e as Error).message);
    return kit.site?.photos ?? [];
  }
}

/**
 * The page designed for this business. Runs after the standard site is live (the founder already has a link), still
 * inside the kit run so the result screen keeps polling. Done → it becomes the live design unless the founder picked
 * one by hand. Any failure (checks, budget, API) → the standard design simply stays; nothing is shown as an error.
 * A resumed kit retries only an interrupted attempt ("working"), never a rejected one (no repeated spend).
 */
async function customStep(projectId: string, kit: Kit, input: KitInput, deps: KitDeps, guard: ReturnType<typeof kitGuard>, photosP: Promise<SitePhotoMeta[]>, save: () => Promise<void>) {
  const photos = await photosP;
  const site = kit.site;
  if (!site || kit.status.site !== "done") return;
  if (photos.length && !site.photos?.length) {
    site.photos = photos;
    await save();
  }
  if (site.custom?.status === "done" || site.custom?.status === "error") return;
  const spec = asSiteSpec(site.spec);
  if (!spec) return;
  const version = (site.custom?.version ?? 0) + 1;
  site.custom = { status: "working", version };
  await save();
  let settle: (() => void) | null = null;
  try {
    settle = guard.reserve("site-custom", KIT_EST.custom);
    const { customPhotos } = await import("./site/routes.js");
    const r = await (deps.custom ?? defaultDeps.custom!)(input, customPhotos(site.photos), spec);
    if (!r.html) throw new Error(`the designed page did not pass the checks: ${r.issues.slice(0, 3).join("; ")}`);
    const { saveCustom } = await import("./site/custom-db.js");
    await saveCustom(projectId, r.html, version);
    site.custom = { status: "done", version, usd: Math.round(r.usd * 10_000) / 10_000 };
    if (!site.picked) site.template = "custom";
  } catch (e) {
    console.error(`[kit] ${projectId} designed page skipped:`, (e as Error).message);
    site.custom = { status: "error", version };
  } finally {
    settle?.();
  }
  await save();
}

/** Nova's brand is stored as the "nova" job too, so the rest of the app (old pages, getProject) sees it. */
async function saveNovaJob(projectId: string, nova: NovaBrand) {
  await exec(
    "INSERT INTO jobs (project_id, dept, stage, status, json, model, queued_at, finished_at) VALUES (?, 'nova', 'build', 'done', ?, 'kit', ?, ?) ON CONFLICT(project_id, dept) DO UPDATE SET status = 'done', json = excluded.json, finished_at = excluded.finished_at, error = NULL",
    [projectId, JSON.stringify(nova), Date.now(), Date.now()],
  );
}

/** The website address: reserved once, from the brand name. */
export async function reserveSlug(projectId: string, name: string): Promise<string> {
  const row = await getProjectRow(projectId);
  if (row?.slug) return row.slug;
  const base = slugify(name) || "launch";
  for (const c of [base, `${base}-${projectId.slice(0, 4).toLowerCase()}`, `${base}-${projectId.toLowerCase()}`]) {
    if ((await exec("SELECT 1 FROM projects WHERE slug = ?", [c])).rows.length) continue;
    try {
      await exec("UPDATE projects SET slug = ? WHERE id = ? AND slug IS NULL", [c, projectId]);
    } catch {
      continue;
    }
    const s = (await getProjectRow(projectId))?.slug;
    if (s) return s;
  }
  throw new Error("Could not reserve a website address");
}

/** The full public link of the website (absolute when PUBLIC_URL is set; the UI prefixes location.origin otherwise). */
export const siteUrl = (slug: string, origin = config.publicUrl) => `${origin}/s/${slug}`;

/**
 * Hook for jobs.ts (stage=build): runs the kit and then marks the old build departments done, so stageDone(),
 * timings and the project polling keep working. dex/rae get no result (the kit replaces them); pip gets the link.
 */
export async function runKitStage(projectId: string, deps: KitDeps = defaultDeps): Promise<Kit> {
  const kit = await runKit(projectId, deps, "build");
  const slug = (await getProjectRow(projectId))?.slug;
  const now = Date.now();
  for (const dept of ["nova", "dex", "rae", "pip"] as const) {
    const json = dept === "pip" && slug ? JSON.stringify({ slug, url: siteUrl(slug), live_at: new Date().toISOString() }) : null;
    await exec(
      "INSERT INTO jobs (project_id, dept, stage, status, json, model, queued_at, finished_at) VALUES (?, ?, 'build', 'done', ?, 'kit', ?, ?) ON CONFLICT(project_id, dept) DO UPDATE SET status = 'done', error = NULL, finished_at = excluded.finished_at, json = COALESCE(jobs.json, excluded.json)",
      [projectId, dept, json, now, now],
    );
  }
  return kit;
}

// ───────────────────────────────────────────── founder choices (no AI unless "more logos")
export async function chooseLogo(projectId: string, id: string): Promise<Kit> {
  const kit = await loadKit(projectId);
  if (!kit?.logo) throw new Error("Your logo is not ready yet.");
  if (!kit.logo.options.some((o) => o.id === id)) throw new Error("That logo is not one of your options.");
  kit.logo.chosen = id;
  await saveKit(projectId, kit);
  return kit;
}

export async function chooseTemplate(projectId: string, template: string): Promise<Kit> {
  if (!SITE_DESIGNS.includes(template as SiteTemplate)) throw new Error("Unknown design.");
  const kit = await loadKit(projectId);
  if (!kit?.site) throw new Error("Your website is not ready yet.");
  if (template === "custom" && kit.site.custom?.status !== "done") throw new Error("Your own design is not ready yet.");
  kit.site.template = template as SiteTemplate;
  kit.site.picked = true;
  await saveKit(projectId, kit);
  return kit;
}

/** "Show 3 more": one new draw, avoiding the ideas already shown. One free redraw per kit. */
export async function moreLogos(projectId: string, deps: KitDeps = defaultDeps): Promise<Kit> {
  const kit = await loadKit(projectId);
  if (!kit?.logo) throw new Error("Your logo is not ready yet.");
  const shown = kit.logo.options.length;
  // One new drawing per kit (spend): the first draw keeps up to 6, so more than 6 means it was already used.
  if (shown > 6) throw new Error(`You have already seen ${shown} logo options.`);
  return costScope(projectId, "kit-more", async () => {
    const guard = kitGuard(projectId, "kit-more", KIT_EST.logo * 1.5);
    const settle = guard.reserve("logo-more", KIT_EST.logo);
    try {
      const fresh = pickThree(await deps.logos(kit.brand, kit.logo!.options.map((o) => o.idea), { idea: (await getProject(projectId))?.idea ?? kit.brand.tagline }));
      if (!fresh.length) throw new Error("No new logos this time. Please try again later.");
      const ids = new Set(kit.logo!.options.map((o) => o.id));
      kit.logo!.options.push(...fresh.map((o) => (ids.has(o.id) ? { ...o, id: `${o.id}-2` } : o)));
      await saveKit(projectId, kit);
      return kit;
    } catch (e) {
      if (e instanceof NotReady) throw new Error("More logo options are not available yet.");
      throw e;
    } finally {
      settle();
    }
  });
}
