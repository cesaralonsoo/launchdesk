// Every price the UI shows comes from here, and here from GET /api/config (server/pricing.ts: the BCH BLAZE launch
// price, PRICE_VALIDATE_CENTS / PRICE_BUILD_CENTS, until LAUNCH_PRICE_UNTIL, then the regular PRICE_*_REGULAR_CENTS;
// and the offices catalog's cheapest task). The defaults below are the server's own defaults, used only until the
// config answers (or when the server is unreachable).
//   priceText("validate")  → "10¢"          for text, attributes and aria labels (read at render time)
//   priceHtml("offices")   → <span data-price="offices">from 2¢</span>   for HTML: refreshed in place on load
//   centsOf("build")       → 50
//   launchNote()           → "BLAZE launch price · from 1 Dec: $1 report · $5 kit" while the launch price is on, else ""
//   launchNoteHtml("cls")  → <p class="launch-note cls" data-launch-note>…</p>   hidden (and refreshed) like the prices
// No imports: pure, so node tests (game/rules.ts) load it too. main.ts calls loadPrices(liveConfig()).

export type PriceKey = "validate" | "build" | "offices";
const cur: Record<PriceKey, number> = { validate: 10, build: 50, offices: 2 };
/** The launch window as the server reports it. Until the config answers: the defaults (launch on until 30 Nov). */
const launch = { on: true, until: Date.parse("2026-11-30T23:59:59+01:00"), regular: { validate: 100, build: 500 } };

/** 10 → "10¢", 150 → "$1.50", 200 → "$2". */
export const fmtCents = (c: number) => (c < 100 ? `${c}¢` : `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`);
/** The same price in words, for screen readers ("10 cents", "1.50 dollars"). */
export const centsWords = (c: number) => (c < 100 ? `${c} cent${c === 1 ? "" : "s"}` : `${(c / 100).toFixed(c % 100 ? 2 : 0)} dollar${c === 100 ? "" : "s"}`);

export const centsOf = (k: PriceKey) => cur[k];
export const priceText = (k: PriceKey) => (k === "offices" ? `from ${fmtCents(cur.offices)}` : fmtCents(cur[k]));
export const priceWords = (k: PriceKey) => (k === "offices" ? `from ${centsWords(cur.offices)} a task` : centsWords(cur[k]));
export const priceHtml = (k: PriceKey) => `<span data-price="${k}">${priceText(k)}</span>`;

/** "1 Dec": the first day of the regular prices, in Madrid time (the launch price ends at 23:59:59 there). */
export const regularFrom = (until = launch.until) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Madrid" }).format(new Date(until + 1000));
/**
 * The one honest line shown next to a price while the launch price is on (never "normally": the regular price has
 * not been charged yet). Empty after the window, or when the launch prices are not below the regular ones.
 */
export function launchNote(now = Date.now()): string {
  if (!launch.on || now > launch.until + 999) return "";
  if (cur.validate >= launch.regular.validate && cur.build >= launch.regular.build) return "";
  return `BLAZE launch price · from ${regularFrom()}: ${fmtCents(launch.regular.validate)} report · ${fmtCents(launch.regular.build)} kit`;
}
/** The note's inner HTML: two unbreakable halves, so a narrow line wraps only after "BLAZE launch price ·". */
export const launchNoteInner = (note: string) => {
  const i = note.indexOf(" · ");
  return i < 0 ? note : `<span>${note.slice(0, i)} ·</span> <span>${note.slice(i + 3)}</span>`;
};
/** The note as HTML (a <p> by default): applyPrices() refreshes its text and hides it when the window is over. */
export const launchNoteHtml = (cls = "", tag: "p" | "span" = "p") => {
  const t = launchNote();
  return `<${tag} class="launch-note${cls ? ` ${cls}` : ""}" data-launch-note${t ? "" : " hidden"}>${launchNoteInner(t)}</${tag}>`;
};

const isKey = (v: string | undefined): v is PriceKey => v === "validate" || v === "build" || v === "offices";
/** Rewrites every [data-price] element under `root` with today's price (static HTML and early renders). */
export function applyPrices(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-price]").forEach((el) => {
    const k = el.dataset.price;
    if (isKey(k)) el.textContent = el.dataset.priceBare != null && k === "offices" ? fmtCents(cur.offices) : priceText(k);
  });
  const note = launchNote();
  root.querySelectorAll<HTMLElement>("[data-launch-note]").forEach((el) => {
    if (el.textContent !== note) el.innerHTML = launchNoteInner(note); // our own text: digits, "$", "¢" and words
    el.hidden = !note;
  });
}

/** Takes the server's prices (GET /api/config). Fires "launchdesk:prices" on document when anything changed. */
export type PricesConfig = {
  prices?: Partial<Record<"validate" | "build", number>>;
  officesFromCents?: number;
  regularPrices?: Partial<Record<"validate" | "build", number>>;
  launchPrice?: boolean;
  launchPriceUntil?: string | null;
};
export function setPrices(cfg: PricesConfig | null | undefined) {
  if (!cfg) return;
  let changed = false;
  if (typeof cfg.launchPrice === "boolean" && cfg.launchPrice !== launch.on) (launch.on = cfg.launchPrice), (changed = true);
  const until = cfg.launchPriceUntil ? Date.parse(cfg.launchPriceUntil) : NaN;
  if (Number.isFinite(until) && until !== launch.until) (launch.until = until), (changed = true);
  for (const k of ["validate", "build"] as const) {
    const v = cfg.regularPrices?.[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0 && v !== launch.regular[k]) (launch.regular[k] = v), (changed = true);
  }
  const next = { validate: cfg.prices?.validate, build: cfg.prices?.build, offices: cfg.officesFromCents };
  for (const k of ["validate", "build", "offices"] as const) {
    const v = next[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0 && v !== cur[k]) {
      cur[k] = v;
      changed = true;
    }
  }
  if (typeof document === "undefined") return;
  applyPrices();
  if (changed) document.dispatchEvent(new CustomEvent("launchdesk:prices"));
}
/** main.ts: load once at boot (never blocks the first paint; the defaults show until it answers). */
export const loadPrices = (config: Promise<unknown>) => config.then((c) => setPrices(c as Parameters<typeof setPrices>[0])).catch(() => {});
