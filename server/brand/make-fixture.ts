// WP2 dev tool · Draw real logo fixtures for the three home ideas (the only ideas mock mode accepts).
//   node_modules/.bin/tsx server/brand/make-fixture.ts pausa --real     (one real Sonnet draw, logged to spend.log)
//   node_modules/.bin/tsx server/brand/make-fixture.ts pausa --relint   (re-lint a saved fixture, zero spend)
// Refuses a real call when WP2's spend.log total would pass WP2_CAP_USD (default 0.30).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { KitBrand } from "../kit-contract.js";
import { fitSymbol } from "./lint.js";
import { PROMPT_VERSION, drawLogos, lintAll, normBrand, rank, type LogoFixture } from "./draw.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEND = join(HERE, "../../.notes/next/spend.log");

export const FIXTURE_BRANDS: Record<string, { idea: string; customer: string; pain: string; brand: KitBrand }> = {
  pausa: {
    idea: "A specialty coffee kiosk at a Barcelona metro exit, €3 flat whites for commuters",
    customer: "Eixample commuters on their way to work, 7:00 to 9:30",
    pain: "Good coffee before the train, but the cafés open late and queues are long",
    brand: {
      name: "Pausa", tagline: "A proper pause before the train.", voice: "Warm, exact, local, quick. Talk like the barista who knows your order.",
      palette: { primary: "#2B211C", accent: "#C8813A", bg: "#F4EADF", ink: "#2B211C" }, fonts: { display: "Fraunces", text: "Instrument Sans" }, lang: "en", city: "Barcelona", currency: "€",
    },
  },
  ronda: {
    idea: "A dog-walking app for busy Madrid professionals, €12 a walk",
    customer: "Chamberí professionals who leave a dog alone all day",
    pain: "Nobody to walk the dog at midday; a different stranger every time",
    brand: {
      name: "Ronda", tagline: "Same walker, every weekday.", voice: "Friendly, reliable, local, plain. Write like the walker texting the owner.",
      palette: { primary: "#1F3A2E", accent: "#E07A3F", bg: "#F5F1E8", ink: "#1F3A2E" }, fonts: { display: "Bricolage Grotesque", text: "Inter" }, lang: "en", city: "Madrid", currency: "€",
    },
  },
  segundavuelta: {
    idea: "An online shop for restored vintage road bikes, around €450 each",
    customer: "Riders who love classic steel frames but fear buying a lemon",
    pain: "Second-hand classics are a gamble: hidden rust, worn parts, no history",
    brand: {
      name: "Segunda Vuelta", tagline: "Classic steel, second life.", voice: "Precise, honest, nerdy, calm. Write like a mechanic's notebook.",
      palette: { primary: "#1C2433", accent: "#C2412D", bg: "#F2EEE6", ink: "#1C2433" }, fonts: { display: "Space Grotesk", text: "IBM Plex Sans" }, lang: "en", currency: "€",
    },
  },
};

const spent = () =>
  existsSync(SPEND)
    ? readFileSync(SPEND, "utf8").split("\n").filter((l) => /^WP2\b/.test(l)).reduce((t, l) => t + (Number(/\$([\d.]+)/.exec(l)?.[1]) || 0), 0)
    : 0;

async function main() {
  const [id, flag] = process.argv.slice(2);
  const f = id && FIXTURE_BRANDS[id];
  if (!f) throw new Error(`usage: make-fixture.ts <${Object.keys(FIXTURE_BRANDS).join("|")}> --real|--relint`);
  const file = join(HERE, "fixtures", `${id}.json`);
  const brand = normBrand(f.brand);
  if (flag === "--relint") {
    const fx = JSON.parse(readFileSync(file, "utf8")) as LogoFixture;
    const linted = lintAll(fx.candidates, brand);
    let n = 0;
    fx.lint = linted.map((l) => ({ ok: l.lint.ok, errors: l.lint.errors, warnings: l.lint.warnings }));
    fx.options = rank(linted.filter((l) => l.lint.ok).map((l) => ({ id: `${id}-${++n}`, family: l.candidate.family, idea: l.candidate.idea, svg: fitSymbol(l.lint) })));
    writeFileSync(file, JSON.stringify(fx, null, 2) + "\n");
    console.log(`${id}: ${fx.options.length}/${fx.candidates.length} pass`, fx.lint.map((l) => l.errors.join("; ")).filter(Boolean));
    return;
  }
  if (flag !== "--real") throw new Error("pass --real to spend money, or --relint");
  const cap = Number(process.env.WP2_CAP_USD) || 0.3;
  if (spent() + 0.08 > cap) throw new Error(`WP2 spend $${spent().toFixed(3)} + ~$0.08 would pass the $${cap} cap`);
  process.env.AI = "real";
  const out = await drawLogos(brand, [], { idea: f.idea, report: { customer: f.customer, pain: f.pain } });
  if (out.model === "mock") throw new Error("AI is in mock mode (MOCK_AI=1 or no key): nothing drawn");
  appendFileSync(SPEND, `WP2 ${out.model} $${out.costUsd.toFixed(4)} logo.draw ${id} v${PROMPT_VERSION}\n`);
  const linted = lintAll(out.raw, brand);
  let n = 0;
  const fx: LogoFixture = {
    id, promptVersion: PROMPT_VERSION, model: out.model, usd: out.costUsd, idea: f.idea, brand,
    candidates: out.raw,
    lint: linted.map((l) => ({ ok: l.lint.ok, errors: l.lint.errors, warnings: l.lint.warnings })),
    options: rank(linted.filter((l) => l.lint.ok).map((l) => ({ id: `${id}-${++n}`, family: l.candidate.family, idea: l.candidate.idea, svg: fitSymbol(l.lint) }))),
  };
  writeFileSync(file, JSON.stringify(fx, null, 2) + "\n");
  console.log(`${id}: $${out.costUsd.toFixed(4)} ${fx.options.length}/${out.raw.length} pass`, fx.lint.map((l) => l.errors.join("; ")).filter(Boolean));
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
