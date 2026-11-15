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

export type UsageLike = { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; server_tool_use?: { web_search_requests?: number | null } | null };
export type CostLine = { label: string; model: string; in: number; out: number; searches: number; usd: number };

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
  const line: CostLine = { label, model, in: u.input_tokens ?? 0, out: u.output_tokens ?? 0, searches: u.server_tool_use?.web_search_requests ?? 0, usd: Math.round(usdOf(model, u) * 1e5) / 1e5 };
  const s = scope.getStore();
  if (s) {
    const key = `${s.projectId}:${s.stage}`;
    ledger.set(key, [...(ledger.get(key) ?? []), line]);
  }
  console.log(`[cost] ${s ? s.projectId + " " + s.stage + " " : ""}${label} ${model} in=${line.in} out=${line.out}${line.searches ? ` searches=${line.searches}` : ""} $${line.usd.toFixed(4)}`);
  return line;
}

/** The stage's total so far (and its lines). */
export function costOf(projectId: string, stage: string): { usd: number; calls: number } {
  const lines = ledger.get(`${projectId}:${stage}`) ?? [];
  return { usd: Math.round(lines.reduce((t, l) => t + l.usd, 0) * 1e4) / 1e4, calls: lines.length };
}
export function endCost(projectId: string, stage: string) {
  const c = costOf(projectId, stage);
  if (c.calls) console.log(`[cost] ${projectId} ${stage} TOTAL $${c.usd.toFixed(4)} over ${c.calls} calls`);
  ledger.delete(`${projectId}:${stage}`);
  return c;
}
