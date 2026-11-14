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
    build: int(env.PRICE_BUILD_CENTS, 20),
  } satisfies Record<Stage, number>,
  databaseUrl: env.DATABASE_URL || "file:local.db",
  databaseToken: env.DATABASE_TOKEN || undefined,
  /** Optional absolute origin for generated site URLs (e.g. https://launchdesk.app). Empty: relative /s/<slug>. */
  publicUrl: (env.PUBLIC_URL || "").replace(/\/+$/, ""),
  /** Fixed BCH/USD price, for offline tests only. */
  fixedBchUsd: env.BCH_USD_FIXED ? Number(env.BCH_USD_FIXED) : null,
  // Local testing only: lets you run the flow without paying. Ignored in production and on non-local hosts.
  devSkipPayment: env.DEV_SKIP_PAYMENT === "1" && env.NODE_ENV !== "production",
  electrumServers: (env.ELECTRUM_SERVERS || "wss://bch.imaginary.cash:50004,wss://fulcrum.pat.mn:50004,wss://electroncash.dk:50004")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

if (!config.merchantAddress) console.warn("[config] MERCHANT_ADDRESS is not set: payments are disabled");
if (config.mockAi) console.warn("[config] AI is in MOCK mode (no ANTHROPIC_API_KEY or MOCK_AI=1)");
