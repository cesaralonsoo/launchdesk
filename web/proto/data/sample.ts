// Display-ready view of the real sample (PAUSA = exampleProject() from server/mocks.ts). WS-C owns.
// Nothing here is invented: every figure is read from PAUSA or computed directly from its fields.
import type { Dept } from "../contracts";
import { PAUSA } from "./index";
import { v6 } from "./v6";

const R = PAUSA.results;
export const MIA = R.mia!;
export const LEO = R.leo!;
export const SAM = R.sam!;
export const NOVA = R.nova!;
export const DEX = R.dex!;
export const RAE = R.rae!;
export const PIP = R.pip!;
export const MEMO = R.memo!;

export const BRAND = NOVA.names[NOVA.chosen]!;
export const BRAND_NAME = BRAND.name; // "Pausa"
export const BRAND_FONTS = NOVA.typography; // Fraunces / Instrument Sans
export const pal = (name: string, p = BRAND.palette) => p.find((c) => c.name === name)?.hex ?? p[0]!.hex;

/** The prototype runs one real sample (Pausa). No other example chips: the output must never ignore the input. */
export const EXAMPLES: Array<{ label: string; idea: string }> = [{ label: "Coffee kiosk", idea: PAUSA.idea }];

/** spec-v4 §6 work-log lines: always true sub-steps. Leo: no web search in the sample (sources: []). */
export const WORKLOG: Record<Dept, string[]> = {
  mia: ["Reading your idea", "Setting the go/no-go number", "Sequencing 4 weeks of tests", "Picking your first 3 tasks"],
  leo: [LEO.sources.length ? "Searching the web for evidence" : "Mapping what customers use today", "Scoring 5 weighted signals", "Writing the kill criteria", "Reaching the verdict"],
  sam: ["Pricing one sale", "Adding up the fixed costs", "Projecting 12 months", "Testing ±20% on sales"],
  nova: ["Brainstorming names", "Shortlisting 3", "Building palettes", "Writing the positioning"],
  dex: ["Sketching 3 logos", "Setting the wordmark", "Writing your landing page"],
  rae: ["Choosing channels", "Planning 30 days", "Writing your first 3 posts"],
  pip: [`Reserving /s/${PIP.slug}`, "Publishing your page", "Connecting pre-orders to your wallet"],
};

/** Short "doing" line for the floating tag (spec §6 status pill, shortened). */
export const DOING: Record<Dept, string> = {
  mia: "Writing your plan",
  leo: "Sizing up the competition",
  sam: "Running the numbers",
  nova: "Naming your business",
  dex: "Drawing your logo",
  rae: "Planning your launch",
  pip: `Putting ${BRAND_NAME} live`,
};

// ---- derived figures (all from PAUSA)
export const TASKS = MIA.checklist;
export const WEEKS = [1, 2, 3, 4].map((w) => TASKS.filter((t) => t.week === w));
/** Mia's go/no-go gate (v6): "100 paid pre-orders by week 4"; the page FAQ says the same number. */
export const GATE = v6(PAUSA).mia?.gate ?? { metric: "paid pre-orders", target: 100, by_week: 4 as const };
export const PREORDER_GOAL = GATE.target;
/** v6 extras, typed (see DATA.md for the hero numbers per card). */
export const LEO6 = v6(PAUSA).leo!;
export const SAM6 = v6(PAUSA).sam!;
export const OFFER = SAM6.launch_offer!;
export const POSITIONING = v6(PAUSA).nova?.positioning ?? "";
export const CASH_CURVE = [{ month: 0, cash: -SAM.startup_cost.value }, ...SAM.months.map((m) => ({ month: m.month, cash: m.cash }))];
export const RISK = (() => {
  const [risk, test] = SAM.main_risk.split(":");
  return { risk: (risk ?? SAM.main_risk).trim().replace(/\.$/, ""), test: test ? test.trim().replace(/^./, (c) => c.toUpperCase()) : LEO.next_step };
})();
export const POSTS = RAE.posts;
export const CHANNEL_COUNT = POSTS.reduce<Record<string, number>>((a, p) => ((a[p.channel] = (a[p.channel] ?? 0) + 1), a), {});
export const CHANNEL_LABEL: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", x: "X", email: "Email" };
export const CENTS = { validate: PAUSA.payments.validate?.cents ?? 10, build: PAUSA.payments.build?.cents ?? 20 };
export const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
