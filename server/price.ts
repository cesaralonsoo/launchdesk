import { config } from "./config.js";

// BCH price in USD, cached for 60 s. Sources: BitPay, then Kraken.
let cache: { usd: number; at: number } | null = null;

async function fetchJson(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json() as Promise<any>;
}

export async function bchUsd(): Promise<number> {
  if (config.fixedBchUsd && config.fixedBchUsd > 0) return config.fixedBchUsd;
  if (cache && Date.now() - cache.at < 60_000) return cache.usd;
  const sources: Array<() => Promise<number>> = [
    async () => Number((await fetchJson("https://bitpay.com/rates/BCH/USD")).data.rate),
    async () => Number((Object.values((await fetchJson("https://api.kraken.com/0/public/Ticker?pair=BCHUSD")).result)[0] as any).c[0]),
  ];
  for (const s of sources) {
    try {
      const usd = await s();
      if (usd > 1) {
        cache = { usd, at: Date.now() };
        return usd;
      }
    } catch (e) {
      console.warn("[price]", (e as Error).message);
    }
  }
  if (cache) return cache.usd;
  throw new Error("BCH price unavailable");
}

/** Cents of USD to satoshis, rounded up. */
export async function centsToSats(cents: number) {
  const usd = await bchUsd();
  return Math.ceil(((cents / 100) / usd) * 1e8);
}

/** Best effort: the current price, or 0 when no source answers (callers must handle 0). */
export async function bchUsdOrZero(): Promise<number> {
  try {
    return await bchUsd();
  } catch {
    return 0;
  }
}

/** Instant: the cached price (0 before the first fetch) and a background refresh when it is stale. */
export function bchUsdCached(): number {
  if (config.fixedBchUsd && config.fixedBchUsd > 0) return config.fixedBchUsd;
  if (!cache || Date.now() - cache.at >= 60_000) void bchUsd().catch(() => {});
  return cache?.usd ?? 0;
}
