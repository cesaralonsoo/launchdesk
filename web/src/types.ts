// Shared data contract between server and web (v4, spec-v4 §3.1). The server keeps a copy in server/types.ts.
// Owner: WS4. Contract frozen: see .notes/contracts-v4.md. Changes are additive only.

export type DeptId = "lobby" | "mia" | "leo" | "sam" | "nova" | "dex" | "rae" | "pip";
export type WorkDept = Exclude<DeptId, "lobby">;
export type Stage = "validate" | "build";

export const STAGE_DEPTS: Record<Stage, WorkDept[]> = {
  validate: ["mia", "leo", "sam"],
  build: ["nova", "dex", "rae", "pip"],
};

// ---------- department outputs ----------

/** R1: where the business is. Never a street unless the founder wrote it. */
export type Market = { city: string | null; country_iso: string; currency: string; language: string };

/** R4: one task the founder does in the real world. */
export type ChecklistItem = {
  week: 1 | 2 | 3 | 4;
  task: string; // ≤ 10 words, starts with a verb, owner is always the founder
  how: string; // 1 sentence
  done_when: string; // measurable, e.g. "30 of 100 commuters say they'd pay €3+"
  helped_by: WorkDept | null; // which deliverable helps ("uses Rae's posts")
  est_hours: number;
};

export type MiaPlan = {
  title: string; // short project title, e.g. "Specialty coffee kiosk in Barcelona"
  one_liner: string;
  brief: { concept: string; for: string; goal: string };
  market: Market; // R1
  checklist: ChecklistItem[]; // R4, replaces weeks; 8–12 items
};

/** R2: a web source Leo actually saw (collected from search citations, never invented). */
export type Source = { id: number; url: string; title: string; domain: string; accessed: string };

export type LeoRisk = { risk: string; mitigation: string; severity: "high" | "med" | "low" };

export type LeoOpportunity = {
  score: number; // 0–10, one decimal
  verdict: "go" | "pivot" | "no-go";
  headline: string;
  summary: string;
  /** Exactly 5: Demand, Competition gap, Price acceptance, Channel, Timing. R5 */
  signals: Array<{ name: string; score: number; why: string /* ≤ 12 words */; source_id: number | null }>;
  why_go: string;
  risks: LeoRisk[]; // R5 (was string[])
  pivot: { idea: string; why: string } | null; // required when verdict !== "go"
  next_step: string;
  market_facts: Array<{ fact: string; source_id: number | null; is_estimate: boolean }>; // R2 (source string removed)
  competitors: Array<{ name: string; note: string; price: number; differentiation: number; url: string | null }>; // price & differentiation 0–10
  you: { price: number; differentiation: number };
  sources: Source[]; // [] when web search is off
  /** R6. `questions: []` means "not available" (old projects): hide the block. */
  interviews: { who: string; where: string; questions: string[] /* 5, past-behaviour */; good_sign: string; target: number };
};

export type SamAssumptionKey =
  | "customers_per_day_m1"
  | "customers_per_day_m12"
  | "avg_ticket"
  | "gross_margin_pct"
  | "fixed_costs_month"
  | "startup_cost"
  | "open_days_month";
export const SAM_ASSUMPTION_KEYS: readonly SamAssumptionKey[] = [
  "customers_per_day_m1",
  "customers_per_day_m12",
  "avg_ticket",
  "gross_margin_pct",
  "fixed_costs_month",
  "startup_cost",
  "open_days_month",
];
export type SamAssumption = { key: SamAssumptionKey; label: string; value: number; unit: string; basis: string; is_estimate: boolean };

/** What Sam's model call returns (R3). Everything else in SamModel is derived by deriveSam(). */
export type SamDraft = {
  currency: string;
  canvas: SamModel["canvas"];
  assumptions: SamAssumption[];
  fixed_costs_breakdown: Array<{ label: string; value: number }>;
  price_note: string; // e.g. "Flat white, avg ticket €4.60"
  startup_note: string; // what the start-up cost covers
  main_risk: string;
};

export type SamModel = {
  currency: string; // "€", "$"
  canvas: { customer: string; value: string; revenue: string; channels: string; costs: string; unit_economics: string };
  assumptions: SamAssumption[]; // R3 — model outputs these
  fixed_costs_breakdown: Array<{ label: string; value: number }>;
  // ↓ all derived from assumptions by deriveSam() (never from the model):
  months: Array<{ month: number; revenue: number; costs: number; cash: number }>; // 12 rows; cash = cumulative incl. startup_cost
  price: { value: number; display: string; note: string };
  startup_cost: { value: number; display: string; note: string };
  cash_needed: { value: number; display: string; month: number }; // lowest point of cumulative cash, as positive amount (month 0 = before opening)
  break_even: { month: number | null; note: string }; // first month revenue ≥ costs; null if not in 12 months
  breakeven_units_per_day: number;
  year1: { revenue: string; costs: string; result: string; monthly_profit_m12: string; payback: string };
  main_risk: string;
};

export type Palette = Array<{ name: string; hex: string }>; // 4 colours: Primary, Accent, Background, Extra

/** R11: Google Fonts families the brand may use (sanitize maps unknown names to Fraunces / Inter). */
export const FONT_WHITELIST = [
  "Fraunces", "Instrument Sans", "Instrument Serif", "Inter", "Bricolage Grotesque", "DM Serif Display", "DM Sans",
  "Space Grotesk", "Libre Caslon Text", "Libre Baskerville", "Manrope", "Outfit", "Syne", "Young Serif", "IBM Plex Sans",
  "IBM Plex Serif", "IBM Plex Mono", "Playfair Display", "Lora", "Source Serif 4", "Work Sans", "Rubik", "Karla",
  "Archivo", "Archivo Black", "Familjen Grotesk", "Schibsted Grotesk", "Hanken Grotesk", "Figtree", "Onest",
  "Unbounded", "Gloock", "Cormorant Garamond", "EB Garamond", "Crimson Pro", "Newsreader", "Literata", "Epilogue",
  "Red Hat Display", "Lexend", "Urbanist",
] as const satisfies readonly string[];
export type BrandFont = (typeof FONT_WHITELIST)[number];
export const BANNED_FONTS: readonly string[] = ["Sora", "Plus Jakarta Sans", "Poppins", "Montserrat"];
export const DEFAULT_FONTS: FontPair = { display: "Fraunces", body: "Inter" };

export type FontPair = { display: string; body: string }; // both from FONT_WHITELIST (R11)

export type NovaBrand = {
  names: Array<{ name: string; why: string; tagline: string; palette: Palette }>; // 3 options, first is recommended
  chosen: number;
  typography: FontPair; // was { headline, body }
  voice: { traits: string[]; rules: string; sample: string };
};

export const LOGO_ICONS = [
  "cup", "bike", "leaf", "paw", "book", "code", "fork", "home", "heart", "bolt",
  "star", "shop", "music", "camera", "chart", "globe", "tool", "spark",
] as const;
export type LogoIcon = (typeof LOGO_ICONS)[number];

/** R12: how the name is set as a wordmark. */
export type Wordmark = {
  weight: 500 | 600 | 700;
  letter_spacing_em: number;
  case: "lower" | "title" | "upper";
  mark: "icon" | "monogram" | "none";
  placement: "left" | "above";
};
export type DexLogo = { concept: string; icon: LogoIcon; shape: "emblem" | "monogram" | "wordmark"; monogram: string; wordmark: Wordmark };
export const DEFAULT_WORDMARK: Wordmark = { weight: 600, letter_spacing_em: -0.02, case: "title", mark: "icon", placement: "left" };

export type DexDesign = {
  logos: DexLogo[]; // 3
  landing: {
    headline: string;
    subheadline: string;
    bullets: string[]; // 3
    cta: string; // "Pre-order for €29"
    offer: string; // "First 100 Morning Passes at €29"
    offer_price: number; // in Sam's currency, |offer − sam.price| / sam.price ≤ 0.4 (validated)
    normal_price: number | null;
    price_hint_usd: number; // pre-order price in USD for the BCH QR
    faq: Array<{ q: string; a: string }>; // 3
    where_when: string | null; // neighbourhood + hours, never a street unless the founder wrote it
  };
};

export type Channel = "instagram" | "tiktok" | "linkedin" | "x" | "email";
export const CHANNELS: readonly Channel[] = ["instagram", "tiktok", "linkedin", "x", "email"];
export type PostFormat = "reel" | "carousel" | "story" | "post" | "email";

export type RaeLaunch = {
  start_date: string; // ISO date
  posts: Array<{
    day: number; // 1–30
    channel: Channel;
    time: string; // HH:MM
    format: PostFormat;
    hook: string; // ≤ 12 words
    caption: string; // ≤ 40 words
    cta: string;
  }>; // ~12 (quality over count)
  first_posts: Array<{ kind: string; title: string; text: string; date: string; channel: Channel }>; // 3
  handle: string;
};

export type PipLive = { slug: string; url: string; live_at: string };

/** R7: one-page memo written after Sam (not a department). */
export type Memo = { purpose: string; problem: string; insight: string; verdict_line: string; next_7_days: string[] /* 3 */ };

export type DeptResults = {
  mia?: MiaPlan; leo?: LeoOpportunity; sam?: SamModel; memo?: Memo;
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
  errors?: Partial<Record<WorkDept, string>>; // R18, human message ("Leo hit a snag.")
  attempts?: Partial<Record<WorkDept, number>>;
  share_id?: string | null; // F5 (not secret, read-only link id)
  example?: boolean; // F2 read-only seed
};

/** F3: answer of POST /api/projects. The owner key is shown once; the server keeps only its sha256. */
export type CreatedProject = { id: string; ownerKey: string };
/** F5: answer of POST /api/projects/:id/share. */
export type ShareLink = { shareId: string };

export type Quote = {
  stage: Stage;
  sats: number;
  cents: number;
  address: string;
  tag: string;
  expiresAt: number;
  bip21: string; // F10 "bitcoincash:<merchant>?amount=<bch>"
  bchUsd: number; // rate used for this quote (receipts)
};

export type AppConfig = {
  prices: Record<Stage, number>; // cents
  merchantAddress: string;
  mockAi: boolean;
  devSkipPayment: boolean;
  bchUsd: number;
  hackathon: boolean; // L3 footer strip
  sampleIdeas: string[]; // F1: the 3 chip sentences (the only valid ideas in mock mode)
};

export type Stats = {
  ideas: number;
  payments: number;
  launched: number;
  /** L18: median wall-clock ms per stage over real runs; null when fewer than 5 runs. */
  medianMs: Record<Stage, number | null>;
};

export type SiteData = {
  slug: string;
  name: string;
  tagline: string;
  palette: Palette;
  logo: DexLogo;
  landing: DexDesign["landing"];
  founderAddress: string;
  bchUsd: number;
  /** True when the page was generated in a local test without a wallet: the QR address is a placeholder. */
  demo?: boolean;
  fonts: FontPair;
  wordmark: Wordmark;
  faq: DexDesign["landing"]["faq"];
  where_when: string | null;
  offer_price: number;
  normal_price: number | null;
  currency: string;
};

/** F11: on-chain payments to the founder address since launch (site/ countPreorders). */
export type Preorders = { count: number; sats: number; txs: Array<{ txid: string; sats: number; at: number | null }> };

// ---------- helpers (pure, shared by server and web) ----------

const round = (n: number) => Math.round(Number.isFinite(n) ? n : 0);

/** Compact money: "€38k", "€4.6k", "€950", "€3.20". */
export function fmtMoney(cur: string, n: number, opts: { cents?: boolean } = {}): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  let s: string;
  if (a >= 1_000_000) s = `${+(a / 1_000_000).toFixed(1)}M`;
  else if (a >= 10_000) s = `${Math.round(a / 1000)}k`;
  else if (a >= 1000) s = `${+(a / 1000).toFixed(1)}k`;
  else s = opts.cents && a < 100 ? a.toFixed(2) : String(Math.round(a));
  return `${sign}${cur}${s}`;
}

/** Customers a day at break-even: whole numbers from 10 up, one decimal below (0.5 bikes a day). */
const unitsPerDay = (u: number) => (u >= 10 ? Math.ceil(u) : Math.ceil(u * 10) / 10);

/** R3: builds the whole internally consistent model from Sam's assumptions. Same result on server and client (F18). */
export function deriveSam(d: SamDraft): SamModel {
  const a = (k: SamAssumptionKey, fallback = 0) => {
    const v = d.assumptions.find((x) => x.key === k)?.value;
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  };
  const c1 = Math.max(0, a("customers_per_day_m1"));
  const c12 = Math.max(0, a("customers_per_day_m12", c1));
  const ticket = Math.max(0, a("avg_ticket"));
  const margin = Math.min(100, Math.max(0, a("gross_margin_pct", 60))) / 100;
  const fixed = Math.max(0, a("fixed_costs_month"));
  const startup = Math.max(0, a("startup_cost"));
  const days = Math.min(31, Math.max(1, a("open_days_month", 26)));
  const cur = d.currency;
  // S-curve ramp from month 1 to month 12
  const sig = (m: number) => 1 / (1 + Math.exp(-0.6 * (m - 6.5)));
  const s1 = sig(1), s12 = sig(12);
  let cash = -startup;
  let low = { value: cash, month: 0 };
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const cust = c1 + (c12 - c1) * ((sig(m) - s1) / (s12 - s1));
    const revenue = round(cust * days * ticket);
    const costs = round(fixed + revenue * (1 - margin));
    cash += revenue - costs;
    if (cash < low.value) low = { value: cash, month: m };
    return { month: m, revenue, costs, cash: round(cash) };
  });
  const be = months.find((m) => m.revenue >= m.costs)?.month ?? null;
  const sum = (k: "revenue" | "costs") => months.reduce((t, m) => t + m[k], 0);
  const result = sum("revenue") - sum("costs");
  const m12 = months[11]!;
  const profit12 = m12.revenue - m12.costs;
  const paybackMonth = months.find((m) => m.cash >= 0)?.month;
  let payback = paybackMonth ? `Month ${paybackMonth}` : "Not in year 1";
  if (!paybackMonth && profit12 > 0) payback = `About month ${12 + Math.ceil(-m12.cash / profit12)}`;
  const unitMargin = ticket * margin;
  return {
    currency: cur,
    canvas: d.canvas,
    assumptions: d.assumptions,
    fixed_costs_breakdown: d.fixed_costs_breakdown,
    months,
    price: { value: ticket, display: fmtMoney(cur, ticket, { cents: true }), note: d.price_note },
    startup_cost: { value: startup, display: fmtMoney(cur, startup), note: d.startup_note },
    cash_needed: { value: round(Math.max(0, -low.value)), display: fmtMoney(cur, Math.max(0, -low.value)), month: low.month },
    break_even: { month: be, note: be ? `Revenue covers costs from month ${be}` : "Not within the first 12 months" },
    breakeven_units_per_day: unitMargin > 0 ? unitsPerDay(fixed / unitMargin / days) : 0,
    year1: {
      revenue: fmtMoney(cur, sum("revenue")),
      costs: fmtMoney(cur, sum("costs")),
      result: (result >= 0 ? "+" : "") + fmtMoney(cur, result),
      monthly_profit_m12: fmtMoney(cur, profit12),
      payback,
    },
    main_risk: d.main_risk,
  };
}

// ---------- normalize(): v3 saved projects → v4 shapes ----------

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const isObj = (v: unknown): v is Any => !!v && typeof v === "object" && !Array.isArray(v);
const asArr = (v: unknown): any[] => (Array.isArray(v) ? v : []); // eslint-disable-line @typescript-eslint/no-explicit-any
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const numOf = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** "€38k" → 38000, "€3.20" → 3.2, "1.2M" → 1200000. NaN when no number. */
export function parseMoney(s: string): number {
  const m = /(-|−)?\s*[^\d-−]*?([\d.,]+)\s*([kKmM])?/.exec(s);
  if (!m || !m[2]) return NaN;
  let t = m[2];
  // "1.234,56" / "1,234.56" / "3,20"
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  let n = Number(t);
  if (m[3]) n *= /k/i.test(m[3]) ? 1e3 : 1e6;
  return m[1] ? -n : n;
}

const OLD_CHANNEL: Record<string, Channel> = {
  IG: "instagram", TT: "tiktok", LI: "linkedin", X: "x", Mail: "email", ALL: "instagram",
  instagram: "instagram", tiktok: "tiktok", linkedin: "linkedin", x: "x", email: "email",
};
export const toChannel = (c: unknown): Channel => OLD_CHANNEL[str(c)] ?? OLD_CHANNEL[str(c).toLowerCase()] ?? "instagram";

function normMia(v: Any, currency: string): MiaPlan {
  const out = v as MiaPlan;
  if (!isObj(v.market)) out.market = { city: null, country_iso: "", currency, language: "en" };
  if (!Array.isArray(v.checklist)) {
    out.checklist = asArr(v.weeks).map((w: Any) => ({
      week: ([1, 2, 3, 4].includes(w.week) ? w.week : 1) as 1 | 2 | 3 | 4,
      task: str(w.task),
      how: "",
      done_when: "",
      helped_by: w.dept && w.dept !== "mia" ? (w.dept as WorkDept) : null,
      est_hours: 0,
    }));
    delete (out as Any).weeks;
  }
  return out;
}

function normLeo(v: Any): LeoOpportunity {
  const out = v as LeoOpportunity;
  out.signals = asArr(v.signals).map((s: Any) => ({ name: str(s.name), score: numOf(s.score), why: str(s.why), source_id: s.source_id ?? null }));
  out.risks = asArr(v.risks).map((r: unknown) =>
    typeof r === "string" ? { risk: r, mitigation: "", severity: "med" as const } : { risk: str((r as Any).risk), mitigation: str((r as Any).mitigation), severity: (r as Any).severity ?? "med" },
  );
  if (v.pivot === undefined) out.pivot = null;
  out.market_facts = asArr(v.market_facts).map((f: Any) => ({ fact: str(f.fact), source_id: f.source_id ?? null, is_estimate: f.source_id == null ? true : !!f.is_estimate }));
  out.competitors = asArr(v.competitors).map((c: Any) => ({ ...c, url: c.url ?? null })) as LeoOpportunity["competitors"];
  if (!Array.isArray(v.sources)) out.sources = [];
  if (!isObj(v.interviews)) out.interviews = { who: "", where: "", questions: [], good_sign: "", target: 0 };
  return out;
}

function normSam(v: Any): SamModel {
  if (Array.isArray(v.assumptions) && isObj(v.cash_needed) && typeof v.price?.value === "number") return v as SamModel;
  const cur = str(v.currency, "€");
  const startup = isObj(v.startup_cost) ? (typeof v.startup_cost.value === "number" ? v.startup_cost.value : parseMoney(str(v.startup_cost.value))) : NaN;
  const price = isObj(v.price) ? (typeof v.price.value === "number" ? v.price.value : parseMoney(str(v.price.value))) : NaN;
  const st = Number.isFinite(startup) ? Math.abs(startup) : 0;
  let cash = -st;
  let low = { value: cash, month: 0 };
  const months = asArr(v.months).map((m: Any) => {
    cash += numOf(m.revenue) - numOf(m.costs);
    if (cash < low.value) low = { value: cash, month: numOf(m.month) };
    return { month: numOf(m.month), revenue: numOf(m.revenue), costs: numOf(m.costs), cash: Math.round(cash) };
  });
  const be = months.find((m) => m.revenue >= m.costs)?.month ?? null;
  return {
    currency: cur,
    canvas: v.canvas,
    assumptions: [],
    fixed_costs_breakdown: [],
    months,
    price: { value: Number.isFinite(price) ? price : 0, display: isObj(v.price) ? str(v.price.display, str(v.price.value)) : "", note: isObj(v.price) ? str(v.price.note) : "" },
    startup_cost: { value: st, display: isObj(v.startup_cost) ? str(v.startup_cost.display, str(v.startup_cost.value)) : fmtMoney(cur, st), note: isObj(v.startup_cost) ? str(v.startup_cost.note) : "" },
    cash_needed: { value: Math.round(-low.value), display: fmtMoney(cur, -low.value), month: low.month },
    break_even: { month: be, note: isObj(v.break_even) ? str(v.break_even.note) : "" },
    breakeven_units_per_day: 0,
    year1: v.year1,
    main_risk: str(v.main_risk),
  };
}

function normNova(v: Any): NovaBrand {
  const out = v as NovaBrand;
  const t = isObj(v.typography) ? v.typography : {};
  const pick = (f: unknown, d: string) => (typeof f === "string" && (FONT_WHITELIST as readonly string[]).includes(f) ? f : d);
  out.typography = { display: pick(t.display ?? t.headline, DEFAULT_FONTS.display), body: pick(t.body, DEFAULT_FONTS.body) };
  return out;
}

function normDex(v: Any, samPrice: number | null): DexDesign {
  const out = v as DexDesign;
  out.logos = asArr(v.logos).map((l: Any) => ({ ...l, wordmark: isObj(l.wordmark) ? l.wordmark : { ...DEFAULT_WORDMARK } })) as DexLogo[];
  const L = (isObj(v.landing) ? v.landing : {}) as Any;
  if (typeof L.offer_price !== "number") {
    const p = parseMoney(str(L.offer));
    L.offer_price = Number.isFinite(p) && p > 0 ? p : (samPrice ?? 0);
  }
  if (L.normal_price === undefined) L.normal_price = null;
  if (!Array.isArray(L.faq)) L.faq = [];
  if (L.where_when === undefined) L.where_when = null;
  out.landing = L as DexDesign["landing"];
  return out;
}

function normRae(v: Any): RaeLaunch {
  const out = v as RaeLaunch;
  out.posts = asArr(v.posts).map((p: Any) =>
    "hook" in p
      ? p
      : { day: numOf(p.day, 1), channel: toChannel(p.channel), time: "09:00", format: p.channel === "Mail" ? "email" : "post", hook: str(p.title), caption: "", cta: "" },
  ) as RaeLaunch["posts"];
  out.first_posts = asArr(v.first_posts).map((p: Any) => ({ ...p, channel: toChannel(p.channel) })) as RaeLaunch["first_posts"];
  return out;
}

/**
 * Upgrades a project saved with v3 shapes (weeks, risks: string[], source: string, string prices,
 * typography.headline, old post channels) to v4 in place, and returns it. Idempotent and cheap:
 * call it on every project that comes from the API, localStorage or a share link.
 */
export function normalize(p: Project): Project {
  if (!p || !isObj(p.results)) return p;
  const r = p.results as Any;
  // R7: the memo is written inside Sam's job and stored with Sam's result; expose it as results.memo.
  if (isObj(r.sam) && isObj(r.sam.memo)) {
    if (!isObj(r.memo)) r.memo = r.sam.memo;
    delete r.sam.memo;
  }
  if (isObj(r.sam)) r.sam = normSam(r.sam);
  const cur = r.sam?.currency ?? "€";
  if (isObj(r.mia)) r.mia = normMia(r.mia, cur);
  if (isObj(r.leo)) r.leo = normLeo(r.leo);
  if (isObj(r.nova)) r.nova = normNova(r.nova);
  if (isObj(r.dex)) r.dex = normDex(r.dex, r.sam?.price?.value ?? null);
  if (isObj(r.rae)) r.rae = normRae(r.rae);
  return p;
}
