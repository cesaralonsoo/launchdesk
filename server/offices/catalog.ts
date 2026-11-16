// The four offices and their tasks. Prices follow .notes/next/management-economics.md §4–5:
// price = worst-case real cost × 3, rounded up to a cent, at least 2¢. After a run we charge real cost × 3, never
// more than the quote, and the inbox shows "used 4¢ of 9¢ quoted".
import type { OfficeDef, OfficeId, TaskDef, TaskId } from "./types.js";

export const HAIKU = "claude-haiku-5-5";
export const SONNET = "claude-sonnet-5-5";
export const MARKUP = 3;
export const MIN_CENTS = 2;

/** How a task runs for real: who gathers, who writes, how many searches at most, how long the answer may be. */
export interface TaskPlan {
  /** Worst-case real cost in USD (capped searches + max_tokens): the quote is built from it. */
  estUsd: number;
  model: string;
  searches: number;
  maxTokens: number;
  /** Haiku gathers with web search first, then `model` writes (only for research-heavy tasks). */
  gather?: boolean;
  brief: string;
  /** Mock: the real cost a typical run had (used for "used X¢ of Y¢"). */
  mockUsd: number;
}

export const priceCents = (usd: number) => Math.max(MIN_CENTS, Math.ceil(Math.round(usd * 100 * MARKUP * 1000) / 1000));
/** What we charge after a run: real cost × 3, rounded up, at least 1¢, never above the quote. */
export const chargeCents = (usd: number, quoted: number) => Math.min(quoted, Math.max(1, Math.ceil(Math.round(usd * 100 * MARKUP * 1000) / 1000)));

export const PLANS: Record<TaskId, TaskPlan> = {
  posts: {
    estUsd: 0.03,
    model: SONNET,
    searches: 0,
    maxTokens: 1800,
    mockUsd: 0.0125,
    brief:
      "Write 5 social media posts for this week, one per weekday, in the business's own voice. Each: the day, the text (under 60 words, no hashtag spam, at most 2 hashtags), and one line on the photo to take. Mix: one behind the scenes, one offer, one customer story, one useful tip, one question.",
  },
  competitors: {
    estUsd: 0.066,
    model: HAIKU,
    searches: 6,
    maxTokens: 1500,
    gather: false,
    mockUsd: 0.034,
    brief:
      "Check the competitors listed (and up to 2 others nearby you find). For each: what they offer and charge now, anything new this month (offer, opening, reviews), and one thing the owner could do about it. Only write what the sources say; cite them.",
  },
  prices: {
    estUsd: 0.1,
    model: SONNET,
    searches: 4,
    maxTokens: 1500,
    gather: true,
    mockUsd: 0.052,
    brief:
      "Review the owner's prices against what similar businesses nearby charge. Suggest 3 options (a cheaper entry, the main one, a premium one) with a price each and why. Say plainly if the current price looks too low or too high. Cite the prices you compare with.",
  },
  breakeven: {
    estUsd: 0.05,
    model: SONNET,
    searches: 0,
    maxTokens: 1200,
    mockUsd: 0.021,
    brief:
      "Work out a simple break-even: the monthly fixed costs you can reasonably assume for this kind of business (say they are assumptions), the margin per sale, and how many sales a month cover the costs. End with the one number to watch. Keep the sums visible and simple.",
  },
  replies: {
    estUsd: 0.005,
    model: HAIKU,
    searches: 0,
    maxTokens: 1200,
    mockUsd: 0.002,
    brief:
      "Write reply drafts to customer messages, in the owner's voice: warm, short, specific. If the owner pasted messages, answer those (up to 5). If not, answer the 5 questions this kind of business gets most. Never promise anything the facts do not support; mark what the owner must check with [check].",
  },
  faq: {
    estUsd: 0.01,
    model: HAIKU,
    searches: 0,
    maxTokens: 1200,
    mockUsd: 0.004,
    brief: "Write a short FAQ for the website: 6 questions customers really ask, each answered in 1 to 3 plain sentences, using only the facts given. Mark anything the owner must fill in with [check].",
  },
};

const task = (id: TaskId, office: OfficeId, title: string, line: string, input?: TaskDef["input"]): TaskDef => ({
  id,
  office,
  title,
  line,
  cents: priceCents(PLANS[id].estUsd),
  ...(input ? { input } : {}),
});

export const OFFICES: OfficeDef[] = [
  {
    id: "marketing",
    name: "Marketing",
    line: "Gets the word out",
    tasks: [task("posts", "marketing", "5 posts for this week", "One a day, in your voice, with a photo idea for each.")],
  },
  {
    id: "research",
    name: "Research",
    line: "Keeps an eye on the street",
    tasks: [task("competitors", "research", "Watch my competitors", "What the others charge and changed lately, with links.")],
  },
  {
    id: "money",
    name: "Money",
    line: "Makes the numbers add up",
    tasks: [
      task("prices", "money", "Check my prices", "Your prices next to similar places, and 3 options to try."),
      task("breakeven", "money", "How many sales do I need?", "Your break-even each month, with the sums shown."),
    ],
  },
  {
    id: "customers",
    name: "Customers",
    line: "Answers the people who ask",
    tasks: [
      task("replies", "customers", "Reply drafts to customers", "Ready-to-send answers. Paste messages, or get the usual ones.", {
        label: "Messages to answer (optional)",
        placeholder: "Paste up to 5 messages from customers, one per line",
      }),
      task("faq", "customers", "Questions page for my website", "6 questions people ask, answered in plain words."),
    ],
  },
];

export const TASKS: Record<TaskId, TaskDef> = Object.fromEntries(OFFICES.flatMap((o) => o.tasks).map((t) => [t.id, t])) as Record<TaskId, TaskDef>;
export const isTaskId = (v: unknown): v is TaskId => typeof v === "string" && v in TASKS;
