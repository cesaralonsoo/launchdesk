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

export const PROMPT_VERSION = 3;
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
For each: family; construction = how it is built on the grid in max 25 words (shapes, sizes, where the cut is), decided before you write the svg; idea = max 14 words in ${b.lang === "es" ? "Spanish" : b.lang === "ca" ? "Catalan" : "English"}, plain words a shop owner understands: what it shows and why it fits their customers; svg.`;
}

const SYSTEM = `You are a senior brand identity designer at a studio known for simple, geometric, memorable marks (think Pentagram, Koto, Collins). Small business owners hire you; they get a mark they will put on a sign, a cup, a van and an app icon for years. You draw in clean SVG on a strict grid, with very few shapes. Taste over cleverness; never clip-art.`;

const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
export const DRAW_SCHEMA = obj({
  candidates: { type: "array", items: obj({ family: { type: "string", enum: [...FAMILIES] }, construction: { type: "string" }, idea: { type: "string" }, svg: { type: "string" } }) },
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

/** Survivors ordered so the first three cover three families when possible; the rest keep the model's order. */
export function rank(options: readonly LogoOption[]): LogoOption[] {
  const first: LogoOption[] = [];
  for (const f of FAMILIES) {
    const o = options.find((x) => x.family === f && !first.includes(x));
    if (o) first.push(o);
  }
  return [...first, ...options.filter((o) => !first.includes(o))];
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
export function mockOptions(brand: KitBrand, skip = 0): LogoOption[] {
  const all = loadFixtures();
  if (!all.length) return [];
  const exact = all.find((f) => key(f.brand.name) === key(brand.name));
  const h = [...key(brand.name)].reduce((t, c) => (t * 31 + c.charCodeAt(0)) >>> 0, 7);
  const fx = exact ?? all[h % all.length]!;
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
  if (isMock()) return { options: rank(mockOptions(brand)), failed: [], costUsd: 0, model: "mock", raw: [] };
  const brandN = normBrand(brand);
  const model = LOGO_MODEL();
  const out = await callCandidates("logo.draw", model, "medium", drawPrompt({ ...ctx, brand: brandN }, avoid), 12000);
  const linted = lintAll(out.candidates, brandN);
  return {
    options: rank(linted.filter((l) => l.lint.ok).map((l) => optionOf(l, "lg"))),
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
