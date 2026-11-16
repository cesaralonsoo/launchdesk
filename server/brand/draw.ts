// WP2 · Logo options. Claude plans the meaning and draws 6 symbol candidates on a 64 grid (2 per family); code owns
// the checks (lint.ts), the wordmark and the lockups (compose.ts). Fewer than 3 survivors → one repair call → else
// code-drawn fallbacks. AI=mock / MOCK_AI / no key → a saved real fixture, re-coloured to the brand (zero spend).
//
//   makeLogos(input)          → LogoResult (options[0..2] = one per family when possible; chosen = options[0].id)
//   moreLogos(input, prev)    → LogoResult with 3+ new options appended (avoids the ideas already shown)
//   drawLogos(brand, avoid)   → raw linted survivors of one draw (no repair, no fallback)
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { recordUsage, type CostLine } from "../cost.js";
import type { KitBrand, KitInput, LogoOption, LogoResult } from "../kit-contract.js";
import { remapPalette } from "./compose.js";
import { fitSymbol, lintSymbol, normHex, type LintResult } from "./lint.js";
import { fallbackOptions, repairPrompt, type Candidate, type Failed } from "./repair.js";

export const PROMPT_VERSION = 4;
const FAMILIES = ["literal", "monogram", "geometric"] as const;
type Family = (typeof FAMILIES)[number];

const env = (k: string, d: string) => (process.env[k] && /^claude-[a-z0-9-]+$/.test(process.env[k]!) ? process.env[k]! : d);
export const LOGO_MODEL = () => env("MODEL_LOGO", "claude-sonnet-5-5");
export const REPAIR_MODEL = () => env("MODEL_LOGO_REPAIR", "claude-sonnet-5-5");
export const isMock = () => process.env.AI === "mock" || config.mockAi;

type DrawCtx = Pick<KitInput, "idea" | "brand"> & { report?: Partial<KitInput["report"]> };

// ───────────────────────────────────────────────────────────── prompt
const CLICHES: Array<[RegExp, string]> = [
  [/coffee|caf[eé]|espresso|barista|flat white/i, "coffee cups, mugs, beans, steam swirls, coffee cherries"],
  [/dog|pet|walk|puppy|perr/i, "paw prints, bones, dog heads or silhouettes, leashes drawn literally, hearts"],
  [/bike|bicycle|cycl|bici/i, "bicycle side views, spoked wheels, chains, cogs, helmets"],
  [/bread|bak|pan |forn|pastry/i, "wheat ears, rolling pins, chef hats, croissants"],
  [/app|software|invoice|ticket|saas|digital/i, "phones, screens, cursors, gears, cloud shapes, check marks in circles"],
  [/shop|store|tienda|e-?commerce/i, "shopping bags, carts, price tags"],
];
const clichesFor = (idea: string) => CLICHES.filter(([re]) => re.test(idea)).map(([, c]) => c).join("; ");
const initialOf = (name: string) => (name.trim().match(/\p{L}/u)?.[0] ?? "A").toUpperCase();

export function drawPrompt(c: DrawCtx, avoid: readonly string[] = []): string {
  const b = c.brand;
  const cl = clichesFor(c.idea);
  return `Design the SYMBOL of this small business's logo. We typeset the name next to it in ${b.fonts.display}; you draw only the mark.

<business>
idea: ${c.idea}
name: ${b.name}
tagline: ${b.tagline}
voice: ${b.voice}${c.report?.customer ? `\ncustomer: ${c.report.customer}` : ""}${c.report?.pain ? `\ntheir moment: ${c.report.pain}` : ""}${b.city ? `\ncity: ${b.city}` : ""}
</business>
<palette>
ink ${b.palette.ink}: the main masses
accent ${b.palette.accent}: one key shape or one small highlight, never most of the mark
background ${b.palette.bg}: the paper; use it only as a cut-out drawn on top of another shape
</palette>

What a great mark is:
- One idea, one silhouette: something you could describe in five words and redraw from memory. It reads at 16 px as a favicon and still works in one colour.
- A small visual idea, where two meanings meet: a letter that is also an object, a negative-space cut that reveals a second shape, a shape that tells the name's story. Not just a pleasant shape.
- Built from strong, simple geometry on the grid: circles, half and quarter circles, squares, bars, arcs and straight diagonal cuts. Bold filled masses with consistent weight; let the negative space do the clever part.
- The accent is essential: take it away and the idea breaks. Never a decorative dot or a tacked-on square.
- Specific to THIS business: it comes from the name's story or the customer's moment, not from the generic category.
- Optically balanced and big: the mark fills a 52 to 56 unit square centred in the 64 canvas.

Marks that worked for other small businesses (for the level of idea, never to copy):
- A dog-walking service called "Ronda": five upright bars (the weekdays) with one accent bar cutting across them all (the midday walk). Counting and routine in one sign.
- The same brand: a thick ring (the round) with one accent dot sitting on it (the walker on the route).
- A coffee stop called "Pausa": two bars like a pause button, one in the accent colour (a real pause before the train).
- A day split in two: a circle whose top half is the accent (the midday) and bottom half ink.
What made them good: the name's meaning is drawn, the accent is the second meaning, you can say the idea in one breath.
Marks that were rejected as first-sketch level:
- A letter drawn with one even-width stroke, with a small accent square or dot stuck on the end.
- A plain doorway, arch or ring outline with nothing else going on.
- A letter in a circle or a tile; two shapes side by side that do not interact.
First work out what the name means (translate it if it is not English) and what the customer's moment looks like; draw from that.

Never: clip-art or emoji pictograms${cl ? ` (for this business especially: ${cl})` : ""}, houses, light bulbs, globes, rockets, leaves, hearts, swooshes, speech bubbles, thin outlines, many small details, gradients, shadows, letters made of type.
${avoid.length ? `Already shown to the founder, do something different from: ${avoid.map((a) => `"${a}"`).join("; ")}.\n` : ""}
Technical rules (code checks each one and throws away a mark that breaks it):
- Inner SVG markup only, no <svg> wrapper; the viewBox is 0 0 64 64.
- Elements: path, circle, rect, ellipse, polygon, line, g. No text, defs, masks, clip paths, style, ids or classes.
- Every shape has an explicit fill: one of the three palette hex codes, or "none". A stroke uses a palette hex and stroke-width of at least 4.
- At most 8 shapes; each path d under 600 characters; every coordinate between 4 and 60. Use absolute commands; use A arcs for round curves.

Draw 6 candidates, each a truly different silhouette, best first within its family:
- 2 "literal": the customer's moment or the name's story, reduced to 2 to 4 geometric shapes (a sign, not an illustration).
- 2 "monogram": the letter "${initialOf(b.name)}" constructed from geometry (bars, arcs, quarter circles) and fused with one idea from the business. It must still read clearly as "${initialOf(b.name)}" at 16 px. Not a font letter, not a letter in a box or circle, not a letter with a dot added.
- 2 "geometric": one memorable abstract shape plus one accent cut or dot that carries the meaning.
For each: family; two_meanings = "what you see = what it means", the two meanings that meet in the mark (for example "five bars + one cross bar = weekdays + the midday walk"); construction = how it is built on the grid in max 25 words (shapes, sizes, where the cut is), decided before you write the svg; strength = your honest 1 to 5 rating as a senior designer (5 = a final a client would keep for years, 3 = a decent first sketch, 1 = generic); idea = max 14 words in ${b.lang === "es" ? "Spanish" : b.lang === "ca" ? "Catalan" : "English"}, plain words a shop owner understands: what it shows and why it fits their customers; svg.`;
}

const SYSTEM = `You are a senior brand identity designer at a studio known for simple, geometric, memorable marks (think Pentagram, Koto, Collins). Small business owners hire you; they get a mark they will put on a sign, a cup, a van and an app icon for years. You draw in clean SVG on a strict grid, with very few shapes. Taste over cleverness; never clip-art.`;

const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
export const DRAW_SCHEMA = obj({
  candidates: { type: "array", items: obj({ family: { type: "string", enum: [...FAMILIES] }, two_meanings: { type: "string" }, construction: { type: "string" }, strength: { type: "integer" }, idea: { type: "string" }, svg: { type: "string" } }) },
});

// ───────────────────────────────────────────────────────────── calls
let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: config.anthropicKey, maxRetries: 1, timeout: 120_000 }));
const fallbackOpts = (model: string) => (model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const });

export interface CallOut { candidates: Candidate[]; cost: CostLine; model: string }

async function callCandidates(label: string, model: string, effort: "low" | "medium", prompt: string, maxTokens: number): Promise<CallOut> {
  const t0 = Date.now();
  let msg: Anthropic.Beta.BetaMessage;
  try {
    msg = await getClient()
      .beta.messages.stream({
        model,
        max_tokens: maxTokens,
        ...fallbackOpts(model),
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
        output_config: { effort, format: { type: "json_schema", schema: DRAW_SCHEMA } },
      } as never)
      .finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error(`[logo] ${label} API error ${e.status}:`, e.message);
      throw new Error("The logo designer is busy. Please try again in a minute.");
    }
    throw e;
  }
  const cost = recordUsage(label, msg.model, msg.usage);
  console.log(`[logo] ${label} ${msg.model} effort=${effort} stop=${msg.stop_reason} in=${msg.usage.input_tokens} out=${msg.usage.output_tokens} ${Date.now() - t0}ms $${cost.usd.toFixed(4)}`);
  if (msg.stop_reason === "refusal") throw new Error("The logo designer declined this one.");
  if (msg.stop_reason === "max_tokens") throw new Error("The logo answer was cut off.");
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const parsed = JSON.parse(text) as { candidates?: Candidate[] };
  return { candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [], cost, model: msg.model };
}

// ───────────────────────────────────────────────────────────── lint + rank
export interface Linted { candidate: Candidate; lint: LintResult }
export const lintAll = (cands: readonly Candidate[], brand: KitBrand): Linted[] =>
  cands.map((c) => ({ candidate: c, lint: lintSymbol(String(c?.svg ?? ""), brand.palette) }));

const famOf = (f: unknown): Family => (FAMILIES.includes(f as Family) ? (f as Family) : "geometric");
const cleanIdea = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().split(" ").slice(0, 18).join(" ").replace(/[<>]/g, "");
let seq = 0;
const optionOf = (l: Linted, prefix: string): LogoOption => ({ id: `${prefix}${++seq}`, family: famOf(l.candidate.family), idea: cleanIdea(l.candidate.idea), svg: fitSymbol(l.lint) });

/**
 * How clear the mark's idea is, from what code can check plus the designer's own rating. Penalised: outline-only
 * marks (one even stroke), a single shape, an accent that is only a tiny dot or square stuck on, no second meaning.
 * A monogram starts lower: it has to earn its place among the first three.
 */
export function markScore(c: Pick<Candidate, "family" | "svg" | "two_meanings" | "strength">, svg: string, accent: string): number {
  const shapes = svg.match(/<(path|circle|rect|ellipse|polygon|polyline|line)\b[^>]*>/g) ?? [];
  const filled = shapes.filter((t) => !/fill="none"/i.test(t));
  const acc = shapes.filter((t) => t.toUpperCase().includes(accent.toUpperCase()));
  const tiny = (t: string) => {
    const n = (k: string) => Number(t.match(new RegExp(`\\b${k}="([\\d.]+)"`))?.[1] ?? NaN);
    if (/^<circle/.test(t)) return n("r") <= 5;
    if (/^<rect/.test(t)) return n("width") * n("height") <= 64;
    return false;
  };
  const meanings = String(c.two_meanings ?? "").split(/\s*(?:=|\+|;|\bmeans\b)\s*/).filter((x) => x.trim().length > 2);
  let s = Math.max(1, Math.min(5, Number(c.strength) || 3));
  if (!filled.length) s -= 1.5; // outline only
  if (shapes.length < 2) s -= 1;
  if (!acc.length || acc.every(tiny)) s -= c.family === "monogram" ? 1 : 0.5; // accent stuck on, not part of the idea
  if (meanings.length < 2) s -= 0.5;
  if (c.family === "monogram") s -= 0.75;
  return s;
}
/** A monogram goes in the first three only with a score at least this high. */
export const STRONG_MONOGRAM = 3.5;

/** Survivors ordered so the first three cover three families when possible; the rest keep the given order.
 *  `weak` ids (plain monograms) never take a first-three slot while another option can fill it. */
export function rank(options: readonly LogoOption[], weak: ReadonlySet<string> = new Set()): LogoOption[] {
  const first: LogoOption[] = [];
  for (const f of FAMILIES) {
    const o = options.find((x) => x.family === f && !first.includes(x) && !weak.has(x.id));
    if (o) first.push(o);
  }
  for (const o of options) if (first.length < 3 && !first.includes(o) && !weak.has(o.id)) first.push(o);
  return [...first, ...options.filter((o) => !first.includes(o))];
}

/** Linted survivors → options, best idea first, plain monograms marked weak. */
function scored(ok: readonly Linted[], prefix: string, accent: string): { options: LogoOption[]; weak: Set<string> } {
  const rows = ok.map((l) => { const o = optionOf(l, prefix); return { o, s: markScore(l.candidate, o.svg, accent) }; }).sort((a, b) => b.s - a.s);
  const weak = new Set(rows.filter((r) => r.o.family === "monogram" && r.s < STRONG_MONOGRAM).map((r) => r.o.id));
  return { options: rows.map((r) => r.o), weak };
}

// ───────────────────────────────────────────────────────────── mock fixtures
const FIX_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
export interface LogoFixture { id: string; promptVersion: number; model: string; usd: number; idea: string; brand: KitBrand; candidates: Candidate[]; lint: Array<{ ok: boolean; errors: string[]; warnings: string[] }>; options: LogoOption[] }
export function loadFixtures(): LogoFixture[] {
  try {
    return readdirSync(FIX_DIR).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(FIX_DIR, f), "utf8")) as LogoFixture);
  } catch {
    return [];
  }
}
const key = (s: string) => s.normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
/** The fixture for this brand (by name), else one picked by the name's hash, re-coloured to the brand's palette. */
/** Demo mode: the saved drawing set that fits this kind of business (never a dog logo for a bakery). */
const IDEA_FIXTURE: Array<[RegExp, string]> = [
  [/\b(dog|dogs|pet|pets|puppy|walker|walks?|perro)\b/i, "ronda"],
  [/\b(coffee|caf[eé]|kiosk|espresso|flat whites?)\b/i, "pausa"],
  [/\b(bike|bikes|bicycle|cycling|bici)\b/i, "segundavuelta"],
];
const FOOD = /\b(bakery|bakeries|bread|sourdough|loaf|loaves|baking|bake|pastry|cake|panader[ií]a|forn)\b/i;

/** Three bakery marks drawn by hand for demo mode (a loaf, an ear of wheat, a morning sun over the counter). */
function bakeryMarks(brand: KitBrand): LogoOption[] {
  const { primary: P, accent: A, bg: B } = brand.palette;
  const grain = (x: number, y: number, side: 1 | -1, fill: string) =>
    `<path d="M32 ${y} C${32 + side * 4} ${y - 9} ${32 + side * 12} ${y - 9} ${x} ${y - 6} C${32 + side * 11} ${y + 1} ${32 + side * 5} ${y + 3} 32 ${y} Z" fill="${fill}"/>`;
  return [
    { id: "bk-loaf", family: "literal", idea: "A round loaf with three cuts on top: what you come in for every morning.",
      svg: `<path d="M6 44 C6 24 18 14 32 14 C46 14 58 24 58 44 L58 48 L6 48 Z" fill="${P}"/><path d="M20 26 L26 38 M31 22 L37 36 M42 25 L47 34" fill="none" stroke="${B}" stroke-width="3.5" stroke-linecap="round"/><rect x="6" y="52" width="52" height="5" rx="2.5" fill="${A}"/>` },
    { id: "bk-wheat", family: "literal", idea: "An ear of wheat with a warm top grain: flour, slow work and care.",
      svg: `<path d="M32 60 L32 12" fill="none" stroke="${P}" stroke-width="4" stroke-linecap="round"/>${grain(44, 46, 1, P)}${grain(20, 46, -1, P)}${grain(44, 34, 1, P)}${grain(20, 34, -1, P)}<path d="M32 22 C27 16 27 9 32 4 C37 9 37 16 32 22 Z" fill="${A}"/>` },
    { id: "bk-sun", family: "geometric", idea: "A morning sun rising over the counter: fresh bread before work.",
      svg: `<path d="M12 40 A20 20 0 0 1 52 40 Z" fill="${A}"/><rect x="6" y="44" width="52" height="6" rx="3" fill="${P}"/><rect x="18" y="54" width="28" height="5" rx="2.5" fill="${P}"/>` },
  ];
}

export function mockOptions(brand: KitBrand, skip = 0, idea = ""): LogoOption[] {
  const all = loadFixtures();
  if (!all.length) return [];
  const exact = all.find((f) => key(f.brand.name) === key(brand.name));
  const byIdea = IDEA_FIXTURE.find(([re]) => re.test(idea))?.[1];
  if (!exact && !byIdea && FOOD.test(idea))
    return bakeryMarks(brand).map((o) => ({ ...o, svg: lintSymbol(o.svg, brand.palette).svg })).filter((o) => o.svg).slice(skip);
  const h = [...key(brand.name)].reduce((t, c) => (t * 31 + c.charCodeAt(0)) >>> 0, 7);
  const fx = exact ?? all.find((f) => f.id === byIdea) ?? all[h % all.length]!;
  const opts = fx.options.map((o) => ({ ...o, svg: remapPalette(o.svg, fx.brand.palette, brand.palette) }));
  // re-lint after the re-colour (a palette with fewer distinct roles can merge colours; never ship unlinted)
  return opts
    .map((o) => ({ ...o, svg: lintSymbol(o.svg, brand.palette).svg }))
    .filter((o) => o.svg)
    .slice(skip);
}

// ───────────────────────────────────────────────────────────── public API
export interface DrawOut { options: LogoOption[]; failed: Failed[]; costUsd: number; model: string; raw: Candidate[] }

export async function drawLogos(brand: KitBrand, avoid: readonly string[] = [], ctx: Omit<DrawCtx, "brand"> = { idea: brand.tagline }): Promise<DrawOut> {
  if (isMock()) return { options: rank(mockOptions(brand, 0, ctx.idea)), failed: [], costUsd: 0, model: "mock", raw: [] };
  const brandN = normBrand(brand);
  const model = LOGO_MODEL();
  const out = await callCandidates("logo.draw", model, "medium", drawPrompt({ ...ctx, brand: brandN }, avoid), 12000);
  const linted = lintAll(out.candidates, brandN);
  const sc = scored(linted.filter((l) => l.lint.ok), "lg", brandN.palette.accent);
  return {
    options: rank(sc.options, sc.weak),
    failed: linted.filter((l) => !l.lint.ok).map((l) => ({ ...l.candidate, family: famOf(l.candidate.family), errors: l.lint.errors })),
    costUsd: out.cost.usd,
    model: out.model,
    raw: out.candidates,
  };
}

/** Full logo step for the kit: draw → (repair once if < 3) → (fallback if still < 3). Never throws on a bad draw. */
export async function makeLogos(input: DrawCtx, avoid: readonly string[] = []): Promise<LogoResult & { costUsd: number }> {
  const brand = normBrand(input.brand);
  let options: LogoOption[] = [];
  let costUsd = 0;
  let failed: Failed[] = [];
  try {
    const d = await drawLogos(brand, avoid, input);
    options = d.options;
    failed = d.failed;
    costUsd += d.costUsd;
  } catch (e) {
    console.error("[logo] draw failed:", (e as Error).message);
  }
  if (options.length < 3 && failed.length && !isMock()) {
    try {
      const r = await callCandidates("logo.repair", REPAIR_MODEL(), "low", repairPrompt(brand, failed.slice(0, 4)), 6000);
      costUsd += r.cost.usd;
      options = rank([...options, ...lintAll(r.candidates, brand).filter((l) => l.lint.ok).map((l) => optionOf(l, "lr"))]);
    } catch (e) {
      console.error("[logo] repair failed:", (e as Error).message);
    }
  }
  let fallback = false;
  if (options.length < 3) {
    fallback = true;
    options = rank([...options, ...fallbackOptions(brand).slice(0, 3 - options.length)]);
  }
  return { options, chosen: options[0]!.id, fallback, costUsd };
}

/** "Show 3 more": unseen survivors first (free), else a new draw that avoids every idea shown so far. */
export async function moreLogos(input: DrawCtx, prev: LogoResult, shown: number): Promise<LogoResult & { costUsd: number }> {
  if (prev.options.length - shown >= 3) return { ...prev, costUsd: 0 };
  if (isMock()) {
    const extra = mockOptions(input.brand).map((o) => ({ ...o, id: `${o.id}m${++seq}` }));
    return { ...prev, options: [...prev.options, ...rank(extra)], costUsd: 0 };
  }
  const next = await makeLogos(input, prev.options.map((o) => o.idea));
  return { options: [...prev.options, ...next.options.filter((o) => !o.id.startsWith("fb-"))], chosen: prev.chosen, fallback: prev.fallback, costUsd: next.costUsd };
}

/** Upper-case hexes so lint, compose and recolor agree byte for byte. */
export function normBrand(b: KitBrand): KitBrand {
  const p = b.palette;
  const h = (v: string, d: string) => normHex(v) ?? d;
  return { ...b, palette: { primary: h(p.primary, "#1A1A1A"), accent: h(p.accent, "#D9653B"), bg: h(p.bg, "#F5F1E8"), ink: h(p.ink, h(p.primary, "#1A1A1A")) } };
}
