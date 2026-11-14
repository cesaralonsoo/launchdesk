try {
  process.loadEnvFile?.(".env");
} catch {
  /* no .env: use the real environment */
}

const env = process.env;
const int = (v: string | undefined, d: number) => (v && /^\d+$/.test(v) ? Number(v) : d);

export const STAGES = ["validate", "plan", "kit"] as const;
export type Stage = (typeof STAGES)[number];

export const config = {
  port: int(env.PORT, 8787),
  production: env.NODE_ENV === "production",
  anthropicKey: env.ANTHROPIC_API_KEY || "",
  mockAi: env.MOCK_AI === "1" || !env.ANTHROPIC_API_KEY,
  merchantAddress: env.MERCHANT_ADDRESS || "",
  priceCents: {
    validate: int(env.PRICE_VALIDATE_CENTS, 10),
    plan: int(env.PRICE_PLAN_CENTS, 25),
    kit: int(env.PRICE_KIT_CENTS, 25),
  } satisfies Record<Stage, number>,
  databaseUrl: env.DATABASE_URL || "file:local.db",
  databaseToken: env.DATABASE_TOKEN || undefined,
  // Local testing only: lets you run the flow without paying. Ignored in production.
  devSkipPayment: env.DEV_SKIP_PAYMENT === "1" && env.NODE_ENV !== "production",
  electrumServers: (env.ELECTRUM_SERVERS || "wss://bch.imaginary.cash:50004,wss://fulcrum.pat.mn:50004,wss://electroncash.dk:50004")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

if (!config.merchantAddress) console.warn("[config] MERCHANT_ADDRESS is not set: payments are disabled");
if (config.mockAi) console.warn("[config] AI is in MOCK mode (no ANTHROPIC_API_KEY or MOCK_AI=1)");
