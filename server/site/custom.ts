// Bespoke site: ONE design call that hand-makes the landing page (HTML + CSS fragment) for this business with the
// real photos found for it. The answer is gated by sanitize.ts (allow-list + honesty checks); if it fails, html is
// null and the caller keeps the 3 standard designs. Mock mode (MOCK_AI=1) uses a fixture or a code-built design.
//
// Prompt source: .notes/site2/site-system-prompt.md (kept in sync by hand). Contract: .notes/site2/output-contract.md.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { recordUsage, usdOf } from "../cost.js";
import type { KitInput } from "../kit-contract.js";
import { uiFor, type SiteSpec } from "./spec.js";
import { validateModelSite } from "./validate.js";
import { templateSite } from "../kit-templates.js";
import { money } from "./validate.js";
import { extractFragment, sanitize, type HonestyRules, type SanitizeCtx } from "./sanitize.js";
import { photoKey, type CustomPhoto } from "./custom-render.js";
import { mockDesign } from "./fixtures/custom/mock-design.js";
import { areaOf } from "./photos.js";
import { statKind } from "./stat-kind.js";

export type { CustomPhoto } from "./custom-render.js";

export const CUSTOM_MODEL = process.env.MODEL_SITE_CUSTOM || "claude-sonnet-5-5";
/** Thinking depth for the design call (Sonnet 5.5 levels low|medium|high). */
export const CUSTOM_EFFORT = (process.env.MODEL_SITE_CUSTOM_EFFORT || "medium") as "low" | "medium" | "high";
/**
 * Model choice (16 Nov live test, same brief): Sonnet 5.5 scored 7-7.2/10 against Haiku 5.5's 6.5-7.3, made the bolder
 * designed moves, and took ~30 s against Haiku's 63 s; Haiku used 15.4k of 16k tokens on thinking and would be cut off
 * on a richer brief. Sonnet costs ~$0.05 a page against ~$0.008. Quality and reliability first: Sonnet. If Haiku is
 * ever set here, use effort "low".
 * Output budget: a page is ~5.5-9k tokens plus some thinking. A page that hits the cap is rejected. Max ≈ $0.17.
 */
export const CUSTOM_MAX_TOKENS = 16_000;

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEND_LOG = join(HERE, "..", "..", ".notes", "next", "spend.log");

export interface CustomResult {
  /** Canonical fragment to store (sanitizer "store" mode), or null when the page did not pass the gate. */
  html: string | null;
  usd: number;
  ms: number;
  /** Why the page was rejected (empty when html is set). */
  issues: string[];
  /** Soft quality notes (logged, page still published). */
  warnings: string[];
  model: string;
  mock: boolean;
  stop?: string | null;
}

export interface CustomOpts {
  /** The validated copy (used for the mock design and labels). Built from the input when missing. */
  spec?: SiteSpec;
  mock?: boolean;
  signal?: AbortSignal;
}

// ───────────────────────────────────────────────────────────── prompt

export const CUSTOM_SYSTEM = `You are the design lead of a small, versatile studio. Each client is a small business that is about to open, and you hand-make one landing page for it: a page that looks like a top designer made it for this business alone, written in plain honest words, built so it works perfectly on a phone. The client has rejected proposals that felt templated. Make opinionated decisions grounded in the subject, and take one real aesthetic risk where it serves the business.

You will receive one JSON object with: the business (name, idea, city, area, currency, language), the brand (tagline, voice, palette of four hex colors, a display font and a text font), a validated research digest (customer, \`pain\` = what the customer wants solved, in their words; one offer with price and maybe a normal price; \`stats\` = sourced statistics about the customer or demand, often empty; \`marketPrices\` = sourced prices of other providers, context only; competitors and their gaps), reserve settings, and a list of real photos (id, role, aspect, orientation, alt text, and \`shows\`: the most honest description we have of what is in it).

After this prompt you also get one reference page made by our studio for a different business (a plant shop). It is the QUALITY BAR, not a layout to copy: match its craft (type scale, equal-crop grids with chips, a statement band, one closing card, a calm phone hero, every column carrying content), and change the structure, the device and the bold move for each business.

Return exactly one HTML fragment and nothing else: one \`<style>\` element, then \`<header>\`, \`<main>\`, \`<footer>\`. No \`<!doctype>\`, \`<html>\`, \`<head>\`, \`<body>\`, \`<script>\`, \`<link>\`, no markdown fences, no comments outside the CSS, no explanation before or after.

## 1. Plan before you write (silently)

Decide these and encode them in a short CSS comment at the top of \`<style>\` (one or two lines, the concept only):
- The subject's world: what does this business physically look, smell and sound like? Its materials, tools, units, vocabulary. A bakery has crumb, proofing times, morning batches; a bike repair shop has torque, tubes, same-day fixes; a plant shop has light levels, watering rhythm, pots and roots. Pick ONE recurring detail from that world and make it a visual device (for example a nursery plant tag as a care label, a ticket stub, a recipe card, a workshop job sheet, a menu chalk line, a price label). It must carry real content, not decoration.
- The single job of the page: get the visitor to reserve the offer, or, if they are not ready, leave an email.
- The hero thesis: the most characteristic thing in this subject's world, shown big (usually the hero photo plus the tagline, set large).
- One bold move, everything around it quiet. Examples: an oversized italic display headline; a full-bleed photo split; one dark statement band; an enormous numeral (only for a real customer statistic or the offer price). Pick one or two, not five.
- Banned gimmicks (they read as templates or as broken form controls): dashed or dotted borders around whole cards ("coupon" boxes), decorative dots or circles next to text or in labels (they look like radio buttons), one-corner-rounded cards, two-colour headlines without italics, emoji, icons drawn with characters.

Review the plan against the subject: if any part would look the same for any other business, change that part.

## 2. Brand and tokens

- Use the brand palette exactly as given, as CSS custom properties on \`:root\`. You may derive up to four extra tokens (a darker and a lighter shade of primary or background, a muted ink, a hairline color) by shifting lightness, never by inventing new hues. Name tokens after the subject where natural (\`--moss\`, \`--clay\`, \`--crust\`, \`--chalk\`).
- Contrast: body text at least 4.5:1 against its background, large display text at least 3:1. The accent is often too light for text on the light background: use it for fills, buttons with dark text, numerals at large sizes, or dark backgrounds; derive a darker accent shade for small accent text. Check every text/background pair you create.
- Single light page by default: set \`color-scheme: light\` on \`:root\` and give \`body\` an explicit \`background\` and \`color\` from tokens. If the brand background is dark, commit to a dark page instead and set \`color-scheme: dark\`. Every color in component rules comes from a token or is an \`rgba()\` of a token's color.
- Fonts: use ONLY the two families named in \`brand.fonts\` (display and text). The builder loads them; do not write \`@import\`, \`@font-face\` or \`<link>\`. Always add a real fallback stack (serif display: \`Georgia, "Times New Roman", serif\`; sans: \`system-ui, -apple-system, "Segoe UI", sans-serif\`). Fraunces, Newsreader, Literata and other variable serifs support \`font-variation-settings: "opsz" <n>\`; use a high optical size for big display type.

## 3. Typography (the page's personality)

- Set a clear scale and keep to it, using \`clamp()\`: hero headline roughly \`clamp(3rem, 7vw, 6.75rem)\` with tight leading (0.92 to 1.0) and slight negative tracking; section headings \`clamp(2.25rem, 4.6vw, 3.75rem)\`; card titles ~1.5rem; body 1.0625rem with line-height ~1.6; small labels ~0.75rem uppercase with 0.12em to 0.16em letter-spacing.
- Make the type treatment memorable: for example set one or two key words of each big headline in the display face's italic and the accent color; use a light weight (300 to 400) at huge sizes rather than bold.
- \`text-wrap: balance\` on headings, \`max-width\` around 34 to 46ch on lead paragraphs, 65ch at most on any running text.
- Use \`font-variant-numeric: tabular-nums\` where prices or numbers line up.
- Give every big numeral and every displayed price the class \`num\` (the builder keeps it on one line). A numeral longer than 4 characters is never larger than \`clamp(3rem, 8vw, 6rem)\`.
- A heading followed by text always has visible space between them: use \`gap\` (at least 0.75em) on the parent, or a margin. Never let an \`<h2>\` touch its paragraph.
- Buttons, inputs and selects inherit the text font (\`font: inherit\` or the text family). Strike through only the old price (\`normally <s>£60</s>\`), never the word "normally".

## 4. Layout and rhythm

- Mobile-first thinking, desktop composition: design the 390px phone layout and the 1280px desktop layout deliberately. Use CSS grid and flex with \`gap\`, not margins between siblings. Every grid or flex child that holds text gets \`min-width: 0\`.
- A centered \`.wrap\` container (max-width 1120px to 1240px) with side gutters of at least 20px written as \`padding-left: max(20px, env(safe-area-inset-left, 0px)); padding-right: max(20px, env(safe-area-inset-right, 0px));\`. Coloured bands span the full width; their inner \`.wrap\` keeps the gutter. Use \`padding-block\` for vertical section padding, never a \`padding\` shorthand on a gutter element.
- Generous whitespace: section padding about \`clamp(72px, 10vw, 136px)\`. Alternate section backgrounds: light, tinted (a slightly darker background), light, with AT MOST ONE dark band. Avoid putting every block in a card.
- In any two-column section, both columns carry content (text, a list, a photo or the form). Never leave one half empty, never let a short text column sit next to a photo three times its height: split photos match the text block (\`align-items: center\`, photo height at most about 1.3 times the text).
- Not everything centered. Prefer asymmetric splits (for example 5/7 or 1.08fr/1fr), left-aligned text, a large photo bleeding to one edge.
- The hero sizes to its content: \`min-height\` at most \`min(820px, 100svh)\` on desktop, never forced full height on phones, and never more than 120px of empty space above the headline or the photo (no vertical centering in a box taller than its content).
- Phone hero (below 560px): the header is a solid bar above the hero (the wordmark never sits on the photo), then the hero photo at full width with at least a 4:3 crop (\`aspect-ratio: 4/3\` or \`5/4\`), then the kicker, headline, price and the reserve button. No empty padding above the photo. The overlay label on the photo becomes a small chip (at most 25% of the photo) or moves below the photo; give that overlay element the class \`hero-tag\`.
- Breakpoints: one at about 900px (splits stack to one column, three-column grids go to two) and one at about 560px (everything single column, primary buttons full width, secondary nav links hidden). Nothing may make the page wider than the screen: no fixed widths over 340px, no \`min-width\` on content, no \`100vw\` widths (they include the scrollbar).
- Do not use \`position: fixed\` (the platform adds its own sticky reserve bar on phones). \`position: sticky\` is fine on desktop only.
- Page order (fixed; merge or drop a step that would be thin, 5 to 7 sections in total):
  1. header: the name as a wordmark and a reserve button;
  2. hero: kicker with the city or area, the \`<h1>\`, a one-sentence lead, the offer price, the main reserve button and "Not ready? Join the list";
  3. the problem, as the customer feels it (a statement, or a sourced customer statistic when \`stats\` has one);
  4. the offer in detail, with its reserve button;
  5. how it works (if the offer is a process) OR the kinds of thing sold: ONE block where each photo names a real kind the business sells or a real step, with 2 short factual chips each (for example "Snake plant": "Low to bright light", "Water every 2 to 3 weeks"), taken only from the idea, the offer and common knowledge;
  6. a comparison or statement band (the one dark band): what the alternatives leave out and what this business does instead, using the competitor gaps and, if useful, \`marketPrices\` in small type with their source links;
  7. ONE closing section that holds the email form and a last reserve button, then the footer. Never two closing call-to-action bands, never a reserve band after the email section.
- At most one photo grid on the page.
- Only number things (1, 2, 3) when they really are a sequence the visitor follows.

## 5. Photos (use them big and well)

- Use the photos you are given, by id, only as \`<img src="ld-photo:ID" alt="..." width="W" height="H">\` where W:H matches the given aspect (for example 3:4 becomes width="1200" height="1600"). Never invent ids, never use any other image source, never use CSS background images.
- Use each photo at most once. Count your photos before you plan: if a grid would need a photo you already used, make it a grid of two (or drop it). Use at least four photos if you have six or more; use every photo if you have four or fewer. Do not use a photo whose \`shows\` does not fit the section; it is better to leave it out.
- Roles: \`hero\` = the opening photo; \`detail\` = close-ups of the product or the work, for splits or the one grid; \`people\` = someone doing the activity, for a split; \`place\` = the city or area (optional, a supporting image no larger than 4:3, never the biggest image on the page and never next to the email form; leave it out if \`shows\` sounds like a landmark, a sign or an old print).
- Crops: never crop a photo narrower than 4:5, and never turn a landscape photo into a portrait column (it cuts the subject out). Grid images use \`aspect-ratio: 4/5\` on desktop and \`4/3\` on phones, with \`width: 100%\`, \`object-fit: cover\` and an \`object-position\` on the subject; grid items use \`align-items: start\` so captions line up. Split photos keep 4:3, 3:2 or 1:1. Below 560px every photo except the hero is landscape (\`aspect-ratio: 4/3\` or \`3/2\`), and a 3-photo grid becomes one column of landscape photos or a 2-up row.
- The hero photo: on desktop about half the width and the full hero height (\`object-fit: cover\` on an absolutely positioned img inside a relative figure, with a sensible \`object-position\`). It should show the thing the business sells or does.
- Small radius (0 to 6px) or none. No drop shadows on photos. An overlapping label on the hero photo is a good place for your recurring subject detail (desktop only at full size, see the phone hero rule).
- Captions and alt text may only name what \`shows\` states. If \`shows\` is vague, caption the kind of thing ("Monstera", "Espresso") or leave the caption out. Never describe an action ("Watering a houseplant", "Ready to go") or a setting that \`shows\` does not state, and never pair a photo with a claim about the service (home visits, steamed milk) that \`shows\` does not support. Never imply a photo shows the business's own shop, staff, products or customers: these are stock photos of the same kind of thing, so never write "our shop" or "our team".

## 6. Copy (honest, specific, in the brand voice)

- Write in the language given in \`business.lang\` (default English). Use the brand voice. Short, direct sentences, active voice, words the customer would use. No jargon, no hype words (revolutionary, seamless, unlock, elevate, curated experience), no em-dash asides, no "not X, but Y" constructions, no colon-then-reveal headlines.
- The \`<h1>\` is the brand tagline or a sharper version of it. Name the city or area in the hero kicker (for example "New plant shop · Leith, Edinburgh").
- The business has not opened yet. Never write anything that implies existing customers, history, awards, years of experience, opening hours, an address, a phone number, delivery areas, guarantees, or ratings unless the input states it.
- Never invent numbers. The only numbers allowed are: the offer price, the normal price, quantities that are part of the offer text ("3 easy plants + 2 care visits"), the statistics given in \`report.stats\` exactly as written, and general facts about the subject that are common knowledge and not statistics (for example "water every 2 to 3 weeks" for a snake plant). Never show the offer \`limit\` as scarcity. Any other number you write (care tips, steps, ranges) must be a single digit from 1 to 9, or a word.
- Never write testimonials, reviews, quotes from customers, customer names, star ratings, logos of press or partners, or follower counts.
- Each statistic or market price you show appears with its exact value and label and a link to its source: \`<a href="SOURCE_URL" rel="noopener nofollow" target="_blank">SOURCE: HOSTNAME</a>\`, where SOURCE is \`business.sourceWord\` exactly ("Source" in English). A number with no \`sourceUrl\` is not shown.
- Only a statistic in \`stats\` (about the customer or their problem) may be a big numeral. If \`stats\` is empty, do not make a giant statistic: use a statement band instead (like "A plant is easy to buy. Keeping it is the hard part."), or set the offer price big. Never make a competitor's price or price range the hero numeral or the main statistic; \`marketPrices\` only appear in small type inside the comparison, if at all. Never write meta phrases about the research ("prices vary a lot, so here are two more ranges", "studies show").
- Competitors: describe them by the name given and the gap given, fairly and without mocking. Present the difference as what this business does instead.
- Price: show it with the currency symbol in the input (\`£45\`). If \`normal\` exists, show it struck through next to it ("normally <s>£60</s>").
- Payment is in Bitcoin Cash. The hero's reserve button uses \`reserve.label\` exactly (for example "Reserve with BCH · £45"); the builder adds the coin mark and a one-line note under it, so do not write your own note about paying. Other reserve buttons may say "Reserve with BCH" or "Reserve your Starter Jungle". "Join the list" for the email. The email section explains in one line what the visitor will receive ("One email when we open. Nothing else.").

## 7. Required hooks (the builder wires these; the page is rejected without them)

- Reserve buttons: \`<a class="..." href="#reserve" data-ld="reserve">Label</a>\`. Put one in the header, one in the hero, and one next to the offer details. Only when \`reserve.enabled\` is false, leave every \`data-ld="reserve"\` element out and make the email signup the main action.
- Email signup: exactly one form:
  \`<form data-ld="waitlist"><label for="email">Your email</label><input id="email" type="email" name="email" placeholder="you@example.com" required><button type="submit">Join the list</button></form>\`
  You may add classes, change the visible label, placeholder and button text, and visually hide the label with a class. Do not add \`action\`, \`method\` or other inputs. Put the section with this form on \`id="join"\` and link to it from the hero ("Not ready? Join the list").
- Anchors: in-page links use \`href="#id"\` pointing to an id that exists. The only other links allowed are the statistic source URLs.
- Do not write photo credits, legal text or a "made with" line: the builder appends them under your footer.

## 8. CSS rules

- One \`<style>\` block, compact (target under 9 KB): one rule per line, short class names, no comments except the concept line, no unused rules, no vendor prefixes except \`-webkit-backdrop-filter\`.
- Allowed: custom properties, grid, flex, \`clamp()\`, \`min()\`, \`max()\`, \`aspect-ratio\`, \`object-fit\`, \`object-position\`, gradients, \`rgba()\`, \`backdrop-filter\`, \`::before\`/\`::after\` with \`content: ""\` or short text, \`counter()\`, transitions under 300ms on hover/focus, \`@media\` queries for width, \`prefers-reduced-motion\`.
- Not allowed: \`url()\` of any kind, \`@import\`, \`@font-face\`, \`position: fixed\`, \`expression()\`, animations that start content invisible (no \`opacity: 0\` waiting for scroll), \`100vh\` heroes on phones.
- Every interactive element has a visible \`:focus-visible\` style. Buttons at least 44px tall. Respect \`prefers-reduced-motion\` by disabling transitions.
- Watch specificity so sections do not undo each other's spacing.

## 9. Before you finish (silently check)

- Exactly one \`<h1>\`. Headings in order. Every \`<img>\` uses \`ld-photo:\` with a given id, has alt, width and height, and no id is used twice.
- At least three \`data-ld="reserve"\` links (if reserve is enabled) and exactly one \`<form data-ld="waitlist">\` with an \`<input name="email">\`.
- No invented numbers, quotes, names, addresses, hours or claims. Every statistic links to its source.
- No \`<script>\`, no \`style=""\` attributes, no event attributes, no external URLs other than statistic sources.
- At 390px nothing is wider than the screen, the header sits above the hero photo, the hero label covers at most a quarter of the photo, no photo except the hero is portrait, and the first screen shows name, photo and headline; at 1280px the hero is a strong composition with the photo big and no portrait photo tower is taller than about 560px.
- One closing section only, at most one dark band, no empty half-columns, no heading touching its paragraph.
- The page would not look the same for a different business.

Output the fragment now: start your reply with \`<style>\` and end it with \`</footer>\`.`;

const RATIOS: Array<[string, number]> = [["1:1", 1], ["4:5", 0.8], ["3:4", 0.75], ["2:3", 2 / 3], ["9:16", 9 / 16], ["5:4", 1.25], ["4:3", 4 / 3], ["3:2", 1.5], ["16:9", 16 / 9], ["2:1", 2]];
export function aspectOf(w: number, h: number): string {
  if (!(w > 0 && h > 0)) return "4:3";
  const r = w / h;
  return RATIOS.reduce((best, cur) => (Math.abs(Math.log(cur[1] / r)) < Math.abs(Math.log(best[1] / r)) ? cur : best))[0];
}

const httpsOnly = (u: string) => /^https:\/\/[^\s"'<>\\]+$/.test(u);

/** The primary button label: Bitcoin Cash is named on the page itself, not only in the payment sheet. */
export function reserveLabel(price: string, lang: string): string {
  if (!price) return "";
  return lang.startsWith("es") ? `Reservar con BCH · ${price}` : `Reserve with BCH · ${price}`;
}

const orientationOf = (w: number, h: number) => (!(w > 0 && h > 0) ? "landscape" : w / h > 1.1 ? "landscape" : w / h < 0.9 ? "portrait" : "square");

/** The user message (see "Input" in the prompt notes). No address, no slug, no risks, no offer limit. */
export function customBrief(input: KitInput, photos: CustomPhoto[]) {
  const { brand, report } = input;
  const lang = (brand.lang || "en").slice(0, 5);
  const price = report.offer.price > 0 ? money(report.offer.price, brand.currency, lang) : "";
  const sourced = report.stats.filter((s) => httpsOnly(s.sourceUrl)).map((s) => ({ ...s, kind: s.kind ?? statKind(s) }));
  return {
    business: { name: brand.name, idea: input.idea, city: brand.city ?? "", area: areaOf(input.idea, brand.city), currency: brand.currency, lang, sourceWord: uiFor(lang).source },
    brand: { tagline: brand.tagline, voice: brand.voice, palette: brand.palette, fonts: brand.fonts },
    report: {
      customer: report.customer,
      pain: report.pain,
      offer: { what: report.offer.what, price: report.offer.price, ...(report.offer.normal ? { normal: report.offer.normal } : {}) },
      // Only numbers about the customer may become a headline; market prices are context; population, rent, fees are left out.
      stats: sourced.filter((s) => s.kind === "demand").slice(0, 2).map((s) => ({ value: s.value, label: s.label, sourceUrl: s.sourceUrl })),
      marketPrices: sourced.filter((s) => s.kind === "price").slice(0, 3).map((s) => ({ value: s.value, label: s.label, sourceUrl: s.sourceUrl })),
      competitors: report.competitors.slice(0, 3),
    },
    reserve: { enabled: Boolean(input.founderAddress) && report.offer.price > 0, label: reserveLabel(price, lang), payment: "Bitcoin Cash" },
    photos: photos.slice(0, 8).map((p, i) => ({ id: photoKey(i), role: p.role ?? (i === 0 ? "hero" : "detail"), aspect: aspectOf(p.width, p.height), orientation: orientationOf(p.width, p.height), alt: p.alt, shows: p.shows ?? `${p.alt} (short title only, details unknown)` })),
  };
}

/** Numbers and sourced stats the page may show (everything the founder or the report actually said). */
export function honestyFor(input: KitInput, extra: string[] = [], plain: string[] = []): HonestyRules {
  const { brand, report } = input;
  const lang = brand.lang || "en";
  const offerPrices = [report.offer.price, report.offer.normal ?? 0].filter((n) => n > 0).flatMap((n) => [money(n, brand.currency, lang), `${brand.currency}${n}`, `${n}${brand.currency}`, `${n} ${brand.currency}`]);
  return {
    numberSources: [
      brand.name, brand.tagline, brand.city ?? "", input.idea, report.customer, report.pain, report.offer.what,
      String(report.offer.price), report.offer.normal ? String(report.offer.normal) : "",
      report.offer.price > 0 ? money(report.offer.price, brand.currency, lang) : "", report.offer.normal ? money(report.offer.normal, brand.currency, lang) : "",
      ...report.stats.flatMap((s) => [s.value, s.label]),
      ...report.competitors.flatMap((c) => [c.name, c.gap]),
      ...extra,
    ],
    stats: report.stats.filter((s) => httpsOnly(s.sourceUrl)).map((s) => ({ value: s.value, sourceUrl: s.sourceUrl })),
    // The offer price is the founder's own number, even when a market price happens to be the same ("€10").
    plain: [brand.name, brand.tagline, input.idea, report.customer, report.pain, report.offer.what, ...offerPrices, ...plain],
  };
}

/** Gate context at generation time ("store" mode: photos stay ld-photo:, hooks stay data-ld). */
export function storeCtx(input: KitInput, photos: CustomPhoto[], extraNumbers: string[] = [], plain: string[] = []): SanitizeCtx {
  const ph: SanitizeCtx["photos"] = {};
  photos.slice(0, 8).forEach((p, i) => (ph[photoKey(i)] = { url: `ld-photo:${photoKey(i)}`, width: p.width, height: p.height, alt: p.alt }));
  return {
    mode: "store",
    photos: ph,
    links: input.report.stats.map((s) => s.sourceUrl).filter(httpsOnly),
    reserveEnabled: Boolean(input.founderAddress) && input.report.offer.price > 0,
    fonts: input.brand.fonts,
    emailLabel: input.brand.lang?.startsWith("es") ? "Tu email" : "Your email",
    honesty: honestyFor(input, extraNumbers, plain),
  };
}

// ───────────────────────────────────────────────────────────── mock

const FIXTURE_DIR = join(HERE, "fixtures", "custom");

/** The studio's reference page (the quality bar), sent after the system prompt and cached with it. */
let exemplar: string | null = null;
export function exemplarBlock(): string {
  if (exemplar !== null) return exemplar;
  const file = join(FIXTURE_DIR, "exemplar.html");
  const page = existsSync(file) ? readFileSync(file, "utf8") : "";
  exemplar = page
    ? `Reference page (quality bar, not a layout to copy; change structure and device per business). It was made for "Fern & Co", a plant shop in Leith, with six photos p1-p6 of plants:\n\n${page}`
    : "";
  return exemplar;
}

/** System blocks: the rules, then the reference page; the cache mark on the last block caches both. */
export function systemBlocks(): Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> {
  const ex = exemplarBlock();
  return ex
    ? [{ type: "text", text: CUSTOM_SYSTEM }, { type: "text", text: ex, cache_control: { type: "ephemeral" } }]
    : [{ type: "text", text: CUSTOM_SYSTEM, cache_control: { type: "ephemeral" } }];
}
/** Saved pages for known demo businesses (only used when it is that very business). */
const FIXTURES: Record<string, string> = { "fern & co": "fern.html" };

export function mockFragment(input: KitInput, spec: SiteSpec, photos: CustomPhoto[]): string {
  const file = FIXTURES[input.brand.name.trim().toLowerCase()];
  if (file && photos.length >= 6 && existsSync(join(FIXTURE_DIR, file))) return readFileSync(join(FIXTURE_DIR, file), "utf8");
  return mockDesign(input, spec, photos);
}

// ───────────────────────────────────────────────────────────── the call

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: config.anthropicKey, maxRetries: 1, timeout: 240_000 }));

function logSpend(model: string, usd: number) {
  try {
    if (existsSync(dirname(SPEND_LOG))) appendFileSync(SPEND_LOG, `SITE2 ${model} $${usd.toFixed(4)}\n`);
  } catch {
    /* the log is a dev convenience */
  }
}

/** Makes the bespoke page. Never throws for a bad page (html null + issues); throws only on API errors. */
export async function generateCustomSite(input: KitInput, photos: CustomPhoto[], opts: CustomOpts = {}): Promise<CustomResult> {
  const t0 = Date.now();
  const spec = opts.spec ?? validateModelSite(templateSite(input), input).spec;
  const mock = opts.mock ?? config.mockAi;
  if (mock) {
    const raw = mockFragment(input, spec, photos);
    // The mock copy comes from the validated spec, so its numbers are allowed too.
    const copy = JSON.stringify({ ...spec, sections: spec.sections.filter((x) => x.kind !== "proof-stats") });
    const s = sanitize(raw, storeCtx(input, photos, [JSON.stringify(spec)], [copy]));
    return { html: s.problems.length ? null : s.css ? `<style>${s.css}</style>${s.body}` : null, usd: 0, ms: Date.now() - t0, issues: s.problems, warnings: s.warnings, model: "mock", mock: true };
  }

  const brief = customBrief(input, photos);
  let msg: Anthropic.Beta.BetaMessage;
  try {
    msg = await getClient()
      .beta.messages.stream(
        {
          model: CUSTOM_MODEL,
          max_tokens: CUSTOM_MAX_TOKENS,
          system: systemBlocks(),
          messages: [{ role: "user", content: JSON.stringify(brief) }],
          output_config: { effort: CUSTOM_EFFORT },
          // A refusal is re-run server-side on a fallback model inside the same call.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        } as never,
        { signal: opts.signal },
      )
      .finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error(`[site-custom] API error ${e.status}:`, e.message);
      throw new Error("The website designer is busy. Please retry in a minute.");
    }
    throw e;
  }
  recordUsage("site-custom", msg.model, msg.usage);
  const usd = usdOf(msg.model, msg.usage);
  logSpend(msg.model, usd);
  const ms = Date.now() - t0;
  console.log(`[site-custom] ${msg.model} stop=${msg.stop_reason} in=${msg.usage.input_tokens} cached=${msg.usage.cache_read_input_tokens ?? 0} out=${msg.usage.output_tokens} $${usd.toFixed(4)} ${ms}ms`);
  const base = { usd, ms, model: msg.model, mock: false, stop: msg.stop_reason };
  if (msg.stop_reason === "refusal") return { ...base, html: null, issues: ["the designer declined this idea"], warnings: [] };
  if (msg.stop_reason === "max_tokens") return { ...base, html: null, issues: ["the page was cut off (too long)"], warnings: [] };
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const s = sanitize(extractFragment(text), storeCtx(input, photos));
  if (s.problems.length) console.warn(`[site-custom] rejected: ${s.problems.join("; ")}`);
  return { ...base, html: s.problems.length ? null : `<style>${s.css}</style>${s.body}`, issues: s.problems, warnings: s.warnings };
}
