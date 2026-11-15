// Display-ready view of the real sample (PAUSA = exampleProject() from server/mocks.ts). WS-C owns.
// Nothing here is invented: every figure is read from PAUSA or computed directly from its fields.
import type { Dept } from "../contracts";
import { PAUSA } from "./index";

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
  mia: ["Reading your idea", "Writing the brief", "Splitting it into 4 weeks", "Picking your first 3 tasks"],
  leo: ["Reading Mia's brief", LEO.sources.length ? "Searching the web for competitors" : "Listing likely competitors", "Scoring 5 signals", "Writing the verdict"],
  sam: ["Setting a price", "Estimating start-up costs", "Projecting 12 months", "Finding break-even"],
  nova: ["Brainstorming names", "Shortlisting 3", "Building palettes", "Writing taglines"],
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
export const PREORDER_GOAL = 30; // MIA.brief.goal "…collect 30 pre-orders within 4 weeks" and DEX faq "We open as soon as 30 pre-orders are in"
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
