// Per-run AI cost accounting. Every model call reports its usage here; jobs run inside costScope.run(projectId)
// so the calls of one project add up, and the totals are logged and saved (results.v7.cost, server-only).
// Prices are list prices per million tokens (checked 2026-11; verify against the price card before relying on them).
import { AsyncLocalStorage } from "node:async_hooks";

export const PRICES: Record<string, { in: number; out: number; cacheRead?: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.1 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};
/** Web search: $10 per 1,000 searches. */
export const SEARCH_USD = 0.01;

export type UsageLike = { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; server_tool_use?: { web_search_requests?: number | null; web_fetch_requests?: number | null } | null };
/** Web fetch is not metered (Claude API docs): a fetch costs only the tokens it adds. It is counted for the logs. */
export type CostLine = { label: string; model: string; in: number; out: number; searches: number; fetches: number; usd: number };

export function usdOf(model: string, u: UsageLike): number {
  const key = Object.keys(PRICES).find((k) => model.startsWith(k)) ?? "claude-sonnet-5-5";
  const p = PRICES[key]!;
  const inTok = u.input_tokens ?? 0;
  const cached = u.cache_read_input_tokens ?? 0;
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  return (inTok * p.in + cached * (p.cacheRead ?? p.in * 0.1) + (u.output_tokens ?? 0) * p.out) / 1e6 + searches * SEARCH_USD;
}

const scope = new AsyncLocalStorage<{ projectId: string; stage: string }>();
const ledger = new Map<string, CostLine[]>();

export const costScope = <T>(projectId: string, stage: string, fn: () => Promise<T>): Promise<T> => scope.run({ projectId, stage }, fn);

/** Records one call (logged always; added to the current project's ledger when inside a costScope). */
export function recordUsage(label: string, model: string, u: UsageLike): CostLine {
  const line: CostLine = { label, model, in: u.input_tokens ?? 0, out: u.output_tokens ?? 0, searches: u.server_tool_use?.web_search_requests ?? 0, fetches: u.server_tool_use?.web_fetch_requests ?? 0, usd: Math.round(usdOf(model, u) * 1e5) / 1e5 };
  const s = scope.getStore();
  if (s) {
    const key = `${s.projectId}:${s.stage}`;
    ledger.set(key, [...(ledger.get(key) ?? []), line]);
  }
  console.log(`[cost] ${s ? s.projectId + " " + s.stage + " " : ""}${label} ${model} in=${line.in} out=${line.out}${line.searches ? ` searches=${line.searches}` : ""}${line.fetches ? ` fetches=${line.fetches}` : ""} $${line.usd.toFixed(4)}`);
  return line;
}

/** The stage's total so far (and its lines). */
export function costOf(projectId: string, stage: string): { usd: number; calls: number; searches?: number; fetches?: number } {
  const lines = ledger.get(`${projectId}:${stage}`) ?? [];
  const searches = lines.reduce((t, l) => t + l.searches, 0);
  const fetches = lines.reduce((t, l) => t + l.fetches, 0);
  return { usd: Math.round(lines.reduce((t, l) => t + l.usd, 0) * 1e4) / 1e4, calls: lines.length, ...(searches ? { searches } : {}), ...(fetches ? { fetches } : {}) };
}
export function endCost(projectId: string, stage: string) {
  const c = costOf(projectId, stage);
  if (c.calls) console.log(`[cost] ${projectId} ${stage} TOTAL $${c.usd.toFixed(4)} over ${c.calls} calls${c.searches ? `, ${c.searches} searches` : ""}${c.fetches ? `, ${c.fetches} fetches` : ""}`);
  ledger.delete(`${projectId}:${stage}`);
  return c;
}

// ───────────────────────────────────────────────────────────── per-report budget guard
/** Hard cap per founder report (research + writer). Override with REPORT_CAP_USD (never above $0.25). */
export const REPORT_CAP_USD = (() => {
  const v = Number(process.env.REPORT_CAP_USD);
  return Number.isFinite(v) && v > 0 ? Math.min(v, 0.25) : 0.1;
})();
export class BudgetError extends Error {}
/**
 * Reserve-and-settle budget for one report: every paid call reserves its estimate first (refused when spent +
 * reserved + estimate would pass the cap) and settles with the real cost of the usage lines it recorded.
 */
export class Budget {
  spent = 0;
  reserved = 0;
  constructor(readonly cap = REPORT_CAP_USD) {}
  get left() {
    return Math.max(0, this.cap - this.spent - this.reserved);
  }
  /** True when an estimate still fits (used to refuse a report up front). */
  fits(est: number) {
    return this.spent + this.reserved + est <= this.cap + 1e-9;
  }
  /** Throws BudgetError when the estimate does not fit. Returns settle(lines actually recorded), idempotent. */
  reserve(label: string, est: number): (lines?: readonly CostLine[]) => void {
    if (!this.fits(est)) throw new BudgetError(`Report budget reached: ${label} needs ~$${est.toFixed(3)}, $${this.left.toFixed(3)} left of $${this.cap.toFixed(2)}`);
    this.reserved += est;
    let done = false;
    return (lines = []) => {
      if (done) return;
      done = true;
      this.reserved -= est;
      this.spent += lines.reduce((t, l) => t + l.usd, 0);
    };
  }
}
/** Estimates used for reservations (measured: research $0.013 per section without a fetch, writer $0.0057 in the
 *  live run of 2026-11-16; research keeps headroom for the one page fetch). 4 × 0.018 + 0.008 = $0.08 per report. */
export const EST = { research: 0.018, writer: 0.008 } as const;
