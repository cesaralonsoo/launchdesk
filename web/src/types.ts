// Shared data contract between server and web. The server keeps a copy in server/types.ts.

export type DeptId = "lobby" | "mia" | "leo" | "sam" | "nova" | "dex" | "rae" | "pip";
export type WorkDept = Exclude<DeptId, "lobby">;
export type Stage = "validate" | "build";

export const STAGE_DEPTS: Record<Stage, WorkDept[]> = {
  validate: ["mia", "leo", "sam"],
  build: ["nova", "dex", "rae", "pip"],
};

// ---------- department outputs ----------

export type MiaPlan = {
  title: string; // short project title, e.g. "Specialty coffee kiosk in Barcelona"
  one_liner: string;
  brief: { concept: string; for: string; goal: string };
  weeks: Array<{ dept: WorkDept; week: 1 | 2 | 3 | 4; task: string }>; // 4-week plan grid
};

export type LeoOpportunity = {
  score: number; // 0–10, one decimal
  verdict: "go" | "pivot" | "no-go";
  headline: string; // "Focus on the 7–9 am commuter gap."
  summary: string;
  signals: Array<{ name: string; score: number }>; // exactly 5, 0–10: Demand, Competition gap, Price acceptance, Channel, Timing
  why_go: string;
  risks: string[];
  next_step: string;
  market_facts: Array<{ fact: string; source: string; is_estimate: boolean }>;
  competitors: Array<{ name: string; note: string; price: number; differentiation: number }>; // price & differentiation 0–10 for the positioning map
  you: { price: number; differentiation: number };
};

export type SamModel = {
  currency: string; // "€", "$"
  canvas: { customer: string; value: string; revenue: string; channels: string; costs: string; unit_economics: string };
  price: { value: string; note: string };
  startup_cost: { value: string; note: string };
  break_even: { month: number; note: string };
  months: Array<{ month: number; revenue: number; costs: number }>; // 12 rows
  year1: { revenue: string; costs: string; result: string; monthly_profit_m12: string; payback: string };
  main_risk: string;
};

export type Palette = Array<{ name: string; hex: string }>; // 4 colours: Primary, Accent, Background, Extra

export type NovaBrand = {
  names: Array<{ name: string; why: string; tagline: string; palette: Palette }>; // 3 options, first is recommended
  chosen: number;
  typography: { headline: string; body: string };
  voice: { traits: string[]; rules: string; sample: string };
};

export const LOGO_ICONS = [
  "cup", "bike", "leaf", "paw", "book", "code", "fork", "home", "heart", "bolt",
  "star", "shop", "music", "camera", "chart", "globe", "tool", "spark",
] as const;
export type LogoIcon = (typeof LOGO_ICONS)[number];

export type DexDesign = {
  logos: Array<{ concept: string; icon: LogoIcon; shape: "emblem" | "monogram" | "wordmark"; monogram: string }>; // 3
  landing: {
    headline: string;
    subheadline: string;
    bullets: string[]; // 3
    cta: string; // "Pre-order · Pay with BCH"
    offer: string; // "First 100 Morning Passes at €29"
    price_hint_usd: number; // suggested pre-order price in USD for the BCH QR
  };
};

export type RaeLaunch = {
  start_date: string; // ISO date
  posts: Array<{ day: number; channel: "IG" | "TT" | "LI" | "X" | "Mail" | "ALL"; title: string }>; // ~20 over 30 days
  first_posts: Array<{ kind: string; title: string; text: string; date: string; channel: string }>; // 3
  handle: string;
};

export type PipLive = { slug: string; url: string; live_at: string };

export type DeptResults = {
  mia?: MiaPlan; leo?: LeoOpportunity; sam?: SamModel;
  nova?: NovaBrand; dex?: DexDesign; rae?: RaeLaunch; pip?: PipLive;
};

// ---------- project ----------

export type DeptStatus = "queued" | "working" | "done" | "error";

export type Project = {
  id: string;
  idea: string;
  created_at: number;
  payments: Partial<Record<Stage, { txid: string; sats: number; cents: number; at: number }>>;
  status: Partial<Record<WorkDept, DeptStatus>>;
  results: DeptResults;
  timings: Partial<Record<Stage, { started: number; finished?: number }>>;
  models: Partial<Record<WorkDept, string>>;
  error?: string;
};

export type Quote = { stage: Stage; sats: number; cents: number; address: string; tag: string; expiresAt: number };

export type AppConfig = {
  prices: Record<Stage, number>; // cents
  merchantAddress: string;
  mockAi: boolean;
  devSkipPayment: boolean;
  bchUsd: number;
};

export type Stats = { ideas: number; payments: number; launched: number };

export type SiteData = {
  slug: string;
  name: string;
  tagline: string;
  palette: Palette;
  logo: DexDesign["logos"][number];
  landing: DexDesign["landing"];
  founderAddress: string;
  bchUsd: number;
  /** True when the page was generated in a local test without a wallet: the QR address is a placeholder. */
  demo?: boolean;
};
