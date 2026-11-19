// B1 spend brake: one global switch that stops TAKING MONEY before work we could not deliver.
//
// It turns on when:
//   (a) the AI provider answers with an error that means "no credit / billing / bad key" (400 "credit balance",
//       400/429 "usage limits" (the console spend limit), 402, 401, 403), or with a storm of 529 "overloaded" answers;
//   (b) today's recorded AI spend (UTC day, kept in the ai_spend table so a restart remembers it) would pass
//       DAILY_CAP_USD (default $3) with one more run;
//   (c) PAUSE=1 is set in the environment (manual switch).
//
// When it is on: GET /api/config says paused + a plain reason, and the routes that take real money (project quote
// and pay, office task quote and pay) answer 503 {paused:true, error} before any wallet or chain step.
// Sample runs, examples and already-paid work are left alone: a paid run keeps going (and with escrow, a run that
// fails is refunded by the watcher after its timeout). The brake never touches escrow code, so it cannot release.
//
// A credit or key error stays on until the server restarts (top up or fix the key, then redeploy/restart).
// A 529 storm clears itself after OVERLOAD_PAUSE_MS. The daily cap clears at 00:00 UTC.
import type { MiddlewareHandler } from "hono";
import { onSpend, REPORT_CAP_USD } from "./cost.js";
import { exec } from "./db.js";

export type BrakeReason = "manual" | "credit" | "overload" | "daily";
export type BrakeView = { paused: boolean; pausedReason?: string };

const SAMPLE_HINT = "You can still watch a sample run or open a finished example.";
/** Added to the 503 of a money route: the refusal happens before any wallet step. */
export const NO_MONEY = "No money was taken.";
export const REASON_TEXT: Record<BrakeReason, string> = {
  manual: `Live runs are paused for now. ${SAMPLE_HINT}`,
  credit: `Live runs are paused: our AI account needs attention. ${SAMPLE_HINT}`,
  overload: `Live runs are paused for a few minutes: the AI service is very busy. ${SAMPLE_HINT}`,
  daily: `Live runs are paused until tomorrow: today's AI budget is used up. ${SAMPLE_HINT}`,
};

const OVERLOAD_WINDOW_MS = 5 * 60_000;
const OVERLOAD_MAX = 6; // the SDK retries, so 6 answers is about 2–3 calls in a row
export const OVERLOAD_PAUSE_MS = 10 * 60_000;

/** Daily AI cap in USD (DAILY_CAP_USD, default 3). Read on every call so an env change in tests applies. */
export const dailyCapUsd = () => {
  const v = Number(process.env.DAILY_CAP_USD);
  return Number.isFinite(v) && v > 0 ? v : 3;
};
const manualPause = () => process.env.PAUSE === "1";

// ───────────────────────────────────────────────────────────── state
let tripped: { reason: "credit" | "overload"; at: number; until: number | null } | null = null;
let overloads: number[] = [];

/** Turns the brake on. `credit` stays on until restart; `overload` for OVERLOAD_PAUSE_MS. */
export function trip(reason: "credit" | "overload", detail = "", now = Date.now()) {
  if (tripped?.reason === "credit") return; // the stronger one stays
  tripped = { reason, at: now, until: reason === "credit" ? null : now + OVERLOAD_PAUSE_MS };
  console.error(`[brake] ON (${reason})${detail ? `: ${detail.slice(0, 200)}` : ""}. Live payments are refused until ${reason === "credit" ? "the server restarts" : "the pause ends"}.`);
}

/** What one error answer from the AI provider means for the brake. */
export function classifyAiError(status: number, bodyText = ""): "credit" | "overload" | null {
  if (status === 401 || status === 403 || status === 402) return "credit";
  if (status === 400 && /credit balance|billing|purchase credits|plans\s*&\s*billing/i.test(bodyText)) return "credit";
  // the console spend limit ("You have reached your specified API usage limits. You will regain access on …"): no more
  // calls until the limit is raised. Anchored to that wording so a temporary 429 that merely says "usage limit" is not.
  if ((status === 400 || status === 429) && /specified API usage limits|regain access on/i.test(bodyText)) return "credit";
  if (status === 529) return "overload";
  return null;
}

/** True once an AI answer said "no credit / spend limit / bad key" (until restart): AI work now falls back to templates. */
export const creditOut = () => tripped?.reason === "credit";

let creditErrorsSeen = 0;
/**
 * How many "no credit / spend limit / bad key" answers this process has seen. A run snapshots it at its start and
 * compares at its end, so only credit errors DURING that run count against it (a trip left over from before a top-up
 * without a restart does not fail later runs that worked).
 */
export const creditErrors = () => creditErrorsSeen;

/** Feeds one AI provider answer (status and, for 400/402/429, its body) into the brake. */
export function noteAiAnswer(status: number, bodyText = "", now = Date.now()) {
  const kind = classifyAiError(status, bodyText);
  if (kind === "credit") {
    creditErrorsSeen++;
    trip("credit", `HTTP ${status} ${bodyText}`, now);
  } else if (kind === "overload") {
    overloads = overloads.filter((t) => now - t < OVERLOAD_WINDOW_MS);
    overloads.push(now);
    if (overloads.length >= OVERLOAD_MAX) trip("overload", `${overloads.length} overloaded answers in 5 minutes`, now);
  }
}

// ───────────────────────────────────────────────────────────── daily spend (persisted)
const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
let ready: Promise<void> | null = null;
const ensureTable = () =>
  (ready ??= exec("CREATE TABLE IF NOT EXISTS ai_spend (day TEXT PRIMARY KEY, usd REAL NOT NULL DEFAULT 0)").then(
    () => {},
    (e) => {
      ready = null;
      throw e;
    },
  ));
/** In-memory tally for the current process (fallback when the database cannot be read). */
const mem = new Map<string, number>();
let pending: Promise<unknown> = Promise.resolve();

/** Adds real AI spend to today's total (memory now, database in the background). */
export function addSpend(usd: number, now = Date.now()) {
  if (!(usd > 0)) return;
  const day = today(now);
  mem.set(day, (mem.get(day) ?? 0) + usd);
  pending = pending
    .then(() => ensureTable())
    .then(() => exec("INSERT INTO ai_spend (day, usd) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET usd = usd + excluded.usd", [day, usd]))
    .catch((e) => console.warn("[brake] could not save AI spend:", (e as Error).message));
}

/** Today's AI spend in USD: the saved total (survives restarts), never less than what this process counted. */
export async function spentToday(now = Date.now()): Promise<number> {
  const day = today(now);
  await pending;
  try {
    await ensureTable();
    const r = await exec("SELECT usd FROM ai_spend WHERE day = ?", [day]);
    return Math.max(Number(r.rows[0]?.usd ?? 0), mem.get(day) ?? 0);
  } catch {
    return mem.get(day) ?? 0;
  }
}

// ───────────────────────────────────────────────────────────── status
/**
 * Why the brake is on, or null. `headroomUsd` is the most the next run could cost: the daily cap refuses a run
 * that would pass it. Default: one report (REPORT_CAP_USD).
 */
export async function brakeReason(headroomUsd = REPORT_CAP_USD, now = Date.now()): Promise<BrakeReason | null> {
  if (manualPause()) return "manual";
  if (tripped && tripped.until != null && now >= tripped.until) tripped = null;
  if (tripped) return tripped.reason;
  if ((await spentToday(now)) + headroomUsd > dailyCapUsd() + 1e-9) return "daily";
  return null;
}

export async function brakeView(headroomUsd?: number): Promise<BrakeView> {
  const r = await brakeReason(headroomUsd);
  return r ? { paused: true, pausedReason: REASON_TEXT[r] } : { paused: false };
}

/** Tests only. */
export function _resetBrake(opts: { memory?: boolean } = {}) {
  tripped = null;
  overloads = [];
  if (opts.memory) mem.clear();
}

// ───────────────────────────────────────────────────────────── hooks
onSpend((usd) => addSpend(usd));

/** Hosts whose answers feed the brake: the Anthropic API (and ANTHROPIC_BASE_URL if set). */
const aiHosts = () => {
  const hosts = new Set(["api.anthropic.com"]);
  try {
    if (process.env.ANTHROPIC_BASE_URL) hosts.add(new URL(process.env.ANTHROPIC_BASE_URL).host);
  } catch {
    /* bad URL: ignore */
  }
  return hosts;
};
const urlOf = (input: unknown): string => (typeof input === "string" ? input : input instanceof URL ? input.href : ((input as { url?: string })?.url ?? ""));

let installed = false;
/**
 * Wraps globalThis.fetch once so every AI client (they all use the SDK's default fetch, created lazily) reports its
 * error answers here. Answers from other hosts pass through untouched. The body of a 400/402/429 is read from a clone.
 */
export function watchAiFetch(target: { fetch: typeof fetch } = globalThis) {
  if (target === globalThis && installed) return;
  if (target === globalThis) installed = true;
  const base = target.fetch.bind(target);
  target.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const res = await base(input, init);
    try {
      if (!res.ok && aiHosts().has(new URL(urlOf(input)).host)) {
        const text = res.status === 400 || res.status === 402 || res.status === 429 ? await res.clone().text().catch(() => "") : "";
        noteAiAnswer(res.status, text);
      }
    } catch {
      /* never break a request because of the brake */
    }
    return res;
  }) as typeof fetch;
}

// ───────────────────────────────────────────────────────────── route guards
type Body = { stage?: string; dev?: boolean; test?: boolean };
async function bodyOf(c: Parameters<MiddlewareHandler>[0]): Promise<Body> {
  try {
    return ((await c.req.json()) ?? {}) as Body; // Hono caches the parsed body, so the route can read it again
  } catch {
    return {};
  }
}

/**
 * Guard for a route that takes real money. `skip` says when the request takes no money (a sample run, a test pay,
 * or an order that is already paid) and must go on as usual. `headroom` is the most the bought run could cost.
 */
export function brakeGuard(opts: { skip?: (c: Parameters<MiddlewareHandler>[0], b: Body) => boolean | Promise<boolean>; headroom?: (b: Body) => number } = {}): MiddlewareHandler {
  return async (c, next) => {
    const b = await bodyOf(c);
    if (opts.skip && (await opts.skip(c, b))) return next();
    const reason = await brakeReason(opts.headroom ? opts.headroom(b) : undefined);
    if (!reason) return next();
    return c.json({ paused: true, error: `${REASON_TEXT[reason]} ${NO_MONEY}` }, 503);
  };
}
