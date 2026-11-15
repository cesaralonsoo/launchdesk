// v6 extra fields the server writes next to the v4 shapes (server/ai.ts, mirrored here because the prototype can't
// import server code). All optional at the type level: old projects and the live app don't have them. WS-C owns.
import type { Project } from "../../src/types";

export type SignalV6 = { name: string; score: number; why: string; source_id: number | null; weight: number };
export type MiaV6 = { gate?: { metric: string; target: number; by_week: 1 | 2 | 3 | 4 } };
export type LeoV6 = {
  signals: SignalV6[];
  kill_criteria?: string[];
  /** "0.30×8.4 + 0.20×7.4 + … = 7.7" */
  score_math?: string;
  verdict_rule?: string;
  confidence?: { level: "low" | "medium" | "high"; note: string };
};
export type SamOutcome = { value: number; year1_result: number; break_even_month: number | null; breakeven_per_day: number; cash_needed: number };
export type SamV6 = {
  key_assumption?: string;
  launch_offer?: {
    item: string; price: number; normal_price: number; limit: number;
    display: string; normal_display: string; discount_pct: number;
    contribution: number; contribution_display: string; revenue_if_sold_out: number; revenue_display: string;
  };
  unit?: { price: number; variable_cost: number; contribution: number; margin_pct: number; line: string };
  breakeven?: { per_month: number; per_day: number; formula: string };
  headroom?: { m12_per_day: number; breakeven_per_day: number; multiple: number; note: string };
  sensitivity?: Array<{ key: string; label: string; low: SamOutcome; base: SamOutcome; high: SamOutcome; swing: number; line: string }>;
};
export type NovaV6 = { positioning?: string };

type R = NonNullable<Project["results"]>;
/** Typed view of a project's results including the v6 extras. */
export type ResultsV6 = Omit<R, "mia" | "leo" | "sam" | "nova"> & {
  mia?: NonNullable<R["mia"]> & MiaV6;
  leo?: Omit<NonNullable<R["leo"]>, "signals"> & LeoV6;
  sam?: NonNullable<R["sam"]> & SamV6;
  nova?: NonNullable<R["nova"]> & NovaV6;
};
export const v6 = (p: Project) => p.results as ResultsV6;
