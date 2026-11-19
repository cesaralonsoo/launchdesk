// Every price the UI shows comes from here, and here from GET /api/config (server config.priceCents, set by the env
// vars PRICE_VALIDATE_CENTS / PRICE_BUILD_CENTS, and the offices catalog's cheapest task). The defaults below are the
// server's own defaults, used only until the config answers (or when the server is unreachable).
//   priceText("validate")  → "10¢"          for text, attributes and aria labels (read at render time)
//   priceHtml("offices")   → <span data-price="offices">from 2¢</span>   for HTML: refreshed in place on load
//   centsOf("build")       → 50
// No imports: pure, so node tests (game/rules.ts) load it too. main.ts calls loadPrices(liveConfig()).

export type PriceKey = "validate" | "build" | "offices";
const cur: Record<PriceKey, number> = { validate: 10, build: 50, offices: 2 };

/** 10 → "10¢", 150 → "$1.50", 200 → "$2". */
export const fmtCents = (c: number) => (c < 100 ? `${c}¢` : `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`);
/** The same price in words, for screen readers ("10 cents", "1.50 dollars"). */
export const centsWords = (c: number) => (c < 100 ? `${c} cent${c === 1 ? "" : "s"}` : `${(c / 100).toFixed(c % 100 ? 2 : 0)} dollars`);

export const centsOf = (k: PriceKey) => cur[k];
export const priceText = (k: PriceKey) => (k === "offices" ? `from ${fmtCents(cur.offices)}` : fmtCents(cur[k]));
export const priceWords = (k: PriceKey) => (k === "offices" ? `from ${centsWords(cur.offices)} a task` : centsWords(cur[k]));
export const priceHtml = (k: PriceKey) => `<span data-price="${k}">${priceText(k)}</span>`;

const isKey = (v: string | undefined): v is PriceKey => v === "validate" || v === "build" || v === "offices";
/** Rewrites every [data-price] element under `root` with today's price (static HTML and early renders). */
export function applyPrices(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-price]").forEach((el) => {
    const k = el.dataset.price;
    if (isKey(k)) el.textContent = el.dataset.priceBare != null && k === "offices" ? fmtCents(cur.offices) : priceText(k);
  });
}

/** Takes the server's prices (GET /api/config). Fires "launchdesk:prices" on document when anything changed. */
export function setPrices(cfg: { prices?: Partial<Record<"validate" | "build", number>>; officesFromCents?: number } | null | undefined) {
  if (!cfg) return;
  const next = { validate: cfg.prices?.validate, build: cfg.prices?.build, offices: cfg.officesFromCents };
  let changed = false;
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
