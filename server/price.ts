// BCH price in USD, cached for 60 s. Sources: BitPay, then Kraken.
let cache: { usd: number; at: number } | null = null;

async function fetchJson(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json() as Promise<any>;
}

export async function bchUsd(): Promise<number> {
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
