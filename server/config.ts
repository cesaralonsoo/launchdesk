import type { Stage } from "./types.js";

try {
  process.loadEnvFile?.(".env");
} catch {
  /* no .env: use the real environment */
}

const env = process.env;
const int = (v: string | undefined, d: number) => (v && /^\d+$/.test(v) ? Number(v) : d);

export const STAGES = ["validate", "build"] as const satisfies readonly Stage[];
export type { Stage };

export const config = {
  port: int(env.PORT, 8790),
  production: env.NODE_ENV === "production",
  anthropicKey: env.ANTHROPIC_API_KEY || "",
  mockAi: env.MOCK_AI === "1" || !env.ANTHROPIC_API_KEY,
  /** Mock delay per department, ms. Default: random 2–4 s so the office animation can be developed. */
  mockDelayMs: env.MOCK_DELAY_MS && /^\d+$/.test(env.MOCK_DELAY_MS) ? Number(env.MOCK_DELAY_MS) : null,
  merchantAddress: env.MERCHANT_ADDRESS || "",
  priceCents: {
    validate: int(env.PRICE_VALIDATE_CENTS, 10),
    build: int(env.PRICE_BUILD_CENTS, 50), // WP4: the Launch kit (logo, website, 30-day plan)
  } satisfies Record<Stage, number>,
  databaseUrl: env.DATABASE_URL || "file:local.db",
  databaseToken: env.DATABASE_TOKEN || undefined,
  /** Optional absolute origin for generated site URLs (e.g. https://launchdesk.app). Empty: relative /s/<slug>. */
  publicUrl: (env.PUBLIC_URL || "").replace(/\/+$/, ""),
  /** Fixed BCH/USD price, for offline tests only. */
  fixedBchUsd: env.BCH_USD_FIXED ? Number(env.BCH_USD_FIXED) : null,
  // Local testing only: lets you run the flow without paying. Ignored in production and on non-local hosts.
  devSkipPayment: env.DEV_SKIP_PAYMENT === "1" && env.NODE_ENV !== "production",
  /** L3: show the "Built for BCH BLAZE 2026" footer strip. HACKATHON=0 hides it. */
  hackathon: env.HACKATHON !== "0",
  /** WP4 Launch kit: model for the logo draw (WP2 reads it) and the per-kit AI spend cap in cents (max 60). */
  modelLogo: env.MODEL_LOGO && /^claude-[a-z0-9-]+$/.test(env.MODEL_LOGO) ? env.MODEL_LOGO : "claude-sonnet-5-5",
  kitSpendCapCents: Math.min(int(env.KIT_SPEND_CAP_CENTS, 45), 60),
  /** F1: the 3 home chips (full sentences). In mock mode these are the only accepted ideas (WS3 enforces). */
  sampleIdeas: [
    "A specialty coffee kiosk at a Barcelona metro exit, €3 flat whites for commuters",
    "A dog-walking app for busy Madrid professionals, €12 a walk",
    "An online shop for restored vintage road bikes, around €450 each",
  ],
  /**
   * F3: when "1", pay and run also refuse requests without X-Owner-Key for projects that have an owner key.
   * Off by default until every client sends the header; retry, skip and share always require it.
   */
  ownerKeyStrict: env.OWNER_KEY_STRICT === "1",
  /** Per IP: new projects and CEO notes allowed per 10 minutes (0 = no limit). */
  rateLimit: { create: int(env.RATE_LIMIT_CREATE, 12), steer: int(env.RATE_LIMIT_STEER, 8), windowMs: 10 * 60_000 },
  /**
   * R1: how many proxies append to X-Forwarded-For in front of us. The visitor is that many entries from the right.
   * Default: 2 in production (Render's edge, plus room for its CDN hop; a shorter header clamps to its first entry),
   * 1 elsewhere. 0 ignores the header (socket address only).
   */
  trustProxyHops: int(env.TRUST_PROXY_HOPS, env.NODE_ENV === "production" ? 2 : 1),
  /** R1: drop trailing private addresses (internal load balancers) first. Default on in production. TRUST_PROXY_SKIP_PRIVATE=0/1. */
  proxySkipPrivate: env.TRUST_PROXY_SKIP_PRIVATE ? env.TRUST_PROXY_SKIP_PRIVATE === "1" : env.NODE_ENV === "production",
  electrumServers: (env.ELECTRUM_SERVERS || "wss://bch.imaginary.cash:50004,wss://fulcrum.pat.mn:50004,wss://electroncash.dk:50004")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

if (!config.merchantAddress) console.warn("[config] MERCHANT_ADDRESS is not set: payments are disabled");
/** Production takes real money on mainnet only: a testnet / regtest merchant address switches payments off. */
export const merchantOnMainnet = (a = config.merchantAddress) => /^(bitcoincash:)?[qp][0-9a-z]{41,}$/.test(a.toLowerCase()) && !/^(bchtest|bchreg):/.test(a.toLowerCase());
if (config.production && config.merchantAddress && !merchantOnMainnet())
  console.error("[config] MERCHANT_ADDRESS is not a mainnet bitcoincash: address: payments are disabled in production");
// B2: the escrow switches. ESCROW=1 without its key would accept money it can never release or refund.
if (env.ESCROW === "1" && !env.ESCROW_WIF) {
  console.error("[config] ESCROW=1 but ESCROW_WIF is not set. Escrow needs its key to release and refund orders. Set ESCROW_WIF, or remove ESCROW. Not starting.");
  process.exit(1);
}
// VITE_ESCROW is read when the web app is built; on Render the same env is visible here, so a mismatch is detectable.
if (env.VITE_ESCROW !== undefined && (env.VITE_ESCROW === "1") !== (env.ESCROW === "1"))
  console.warn(`[config] ESCROW=${env.ESCROW ?? "(unset)"} but VITE_ESCROW=${env.VITE_ESCROW}: set both to 1 or both off, then rebuild. Otherwise validate payments fail.`);
if (env.PAUSE === "1") console.warn("[config] PAUSE=1: live payments are refused; samples and examples still work");
if (config.mockAi) console.warn("[config] AI is in MOCK mode (no ANTHROPIC_API_KEY or MOCK_AI=1)");
