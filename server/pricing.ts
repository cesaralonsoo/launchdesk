// The one place that decides what the report and the Launch kit cost right now (BCH BLAZE launch price).
// Until config.launchPriceUntil (default 30 Nov 2026 23:59:59 Europe/Madrid) the launch prices apply
// (PRICE_VALIDATE_CENTS / PRICE_BUILD_CENTS, 10¢ / 50¢); from the next second the regular ones
// (PRICE_VALIDATE_REGULAR_CENTS / PRICE_BUILD_REGULAR_CENTS, $1 / $5). Decided per request: no restart at the switch.
// Every quote, every recorded payment and every shown price reads it. A quote already issued keeps its sats (and its
// cents): the switch never changes an amount a wallet was already asked for. Office task prices are not affected.
import { config, STAGES } from "./config.js";
import { exec } from "./db.js";
import type { Stage } from "./types.js";

type Clock = () => number;
// Local runs can pose a date (screenshots of the regular prices): PRICE_NOW=2026-12-02T10:00:00Z. Never in production.
const posed = !config.production && process.env.PRICE_NOW ? Date.parse(process.env.PRICE_NOW) : NaN;
const defaultClock: Clock = Number.isFinite(posed) ? () => posed : () => Date.now();
let clock: Clock = defaultClock;

/** Tests: pin the pricing clock (null restores the real one). */
export function setPriceClock(fn: Clock | null) {
  clock = fn ?? defaultClock;
}
export const priceNow = () => clock();

/** True while the launch price applies. The end second itself is still launch (23:59:59 inclusive). */
export const launchPriceOn = (now = clock()) => Math.floor(now / 1000) * 1000 <= config.launchPriceUntil;

/** What a stage costs at `now`, in US cents. */
export function stagePriceCents(stage: Stage, now = clock()): number {
  return launchPriceOn(now) ? config.priceCents[stage] : config.regularPriceCents[stage];
}
export function currentPrices(now = clock()): Record<Stage, number> {
  return Object.fromEntries(STAGES.map((s) => [s, stagePriceCents(s, now)])) as Record<Stage, number>;
}

/** The pricing block of GET /api/config: today's prices, the regular ones, whether the launch price is on and its last second. */
export function pricingView(now = clock()) {
  const on = launchPriceOn(now);
  return {
    prices: currentPrices(now),
    regularPrices: { ...config.regularPriceCents },
    launchPrice: on,
    launchPriceUntil: new Date(config.launchPriceUntil).toISOString(),
  };
}

/** The price a payment for this order is recorded at: its quote's (a quote keeps its price), else today's. */
export async function quotedCents(projectId: string, stage: Stage, now = clock()): Promise<number> {
  const q = await exec("SELECT cents FROM quotes WHERE project_id = ? AND stage = ?", [projectId, stage]);
  const v = q.rows[0]?.cents;
  return v == null ? stagePriceCents(stage, now) : Number(v);
}

/** "1 Dec": the first day of the regular prices, in Madrid time (the launch ends at 23:59:59 there). */
export const regularFromLabel = () =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Madrid" }).format(new Date(config.launchPriceUntil + 1000));

/**
 * The one-line launch note (web/proto/prices.ts launchNote says the same): "BLAZE launch price · from 1 Dec: $1 report · $5 kit".
 * Empty once the window is over, or when the launch prices are not below the regular ones.
 */
export function launchNote(now = clock()): string {
  if (!launchPriceOn(now)) return "";
  const r = config.regularPriceCents;
  if (config.priceCents.validate >= r.validate && config.priceCents.build >= r.build) return "";
  return `BLAZE launch price · from ${regularFromLabel()}: ${fmtCents(r.validate)} report · ${fmtCents(r.build)} kit`;
}

/** The note as HTML: two unbreakable halves, so a narrow line wraps only after "BLAZE launch price ·". */
export const launchNoteInner = (note: string) => {
  const i = note.indexOf(" · ");
  return i < 0 ? note : `<span>${note.slice(0, i)} ·</span> <span>${note.slice(i + 3)}</span>`;
};

/** Prices as the UI shows them (web/proto/prices.ts fmtCents): 10 → "10¢", 100 → "$1", 150 → "$1.50". */
export const fmtCents = (c: number) => (c < 100 ? `${c}¢` : `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`);
