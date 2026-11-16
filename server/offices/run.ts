// Runs one office task. Mock (no AI key): the sample result for this business and a typical cost.
// Real: Haiku or Sonnet on the project brain, with prompt caching on the brain block, capped searches and
// max_tokens, a hard spend guard at the quote's worst case, and the real cost measured by server/cost.ts.
// The real path is implemented but not exercised in tests (zero API spend); it never runs on a mock server.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { Budget, costOf, costScope, endCost, recordUsage, type CostLine } from "../cost.js";
import { brainText, mockQuestions } from "./brain.js";
import { HAIKU, PLANS } from "./catalog.js";
import { fixtureResult } from "./fixtures.js";
import type { Brain, FollowUp, TaskId, TaskResult } from "./types.js";

export interface RunOut {
  result: TaskResult;
  usd: number;
  sample: boolean;
}
export interface RunDeps {
  mock: boolean;
  /** Mock only: wait this long so the inbox shows "working" (ms). */
  delayMs?: number;
}
export const defaultRunDeps = (): RunDeps => ({ mock: config.mockAi, delayMs: config.mockDelayMs ?? 1800 });

const SYSTEM = `You are one office in LaunchDesk, a small team that works for the owner of a small business. The owner pays a few cents for each task and will use what you write today, as is.
Write in plain words a normal person uses: short sentences, no jargon, no marketing clichés. Be concrete and specific to this business. Never invent facts, names, prices or reviews: when you need something you were not told, mark it [check]. Answer ONLY with the JSON object asked for.`;

const SEARCH_TOOL = "web_search_20260209";
let client: Anthropic | null = null;
const ai = () => (client ??= new Anthropic({ apiKey: config.anthropicKey, maxRetries: 1, timeout: 90_000 }));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const textOf = (m: Anthropic.Message) => m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");

/** The system prompt: instructions, then the brain as its own block, cached (it is the same for every task). */
const systemFor = (b: Brain): Anthropic.TextBlockParam[] => [
  { type: "text", text: SYSTEM },
  { type: "text", text: brainText(b), cache_control: { type: "ephemeral" } },
];

/** Pulls the first JSON object out of a reply and checks it has the TaskResult shape. */
export function parseResult(text: string, fallbackTitle: string): TaskResult {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("The office's answer could not be read.");
  const v = JSON.parse(text.slice(s, e + 1)) as Partial<TaskResult>;
  const items = (Array.isArray(v.items) ? v.items : [])
    .filter((i) => i && typeof i.text === "string" && i.text.trim())
    .slice(0, 12)
    .map((i) => ({ text: String(i.text).slice(0, 900), ...(i.heading ? { heading: String(i.heading).slice(0, 140) } : {}), ...(i.note ? { note: String(i.note).slice(0, 300) } : {}) }));
  if (!items.length) throw new Error("The office's answer was empty.");
  const sources = (Array.isArray(v.sources) ? v.sources : []).filter((x) => x && /^https?:\/\//.test(String(x.url))).slice(0, 8).map((x) => ({ title: String(x.title || x.url).slice(0, 140), url: String(x.url) }));
  return { title: String(v.title || fallbackTitle).slice(0, 120), ...(v.intro ? { intro: String(v.intro).slice(0, 400) } : {}), items, ...(sources.length ? { sources } : {}) };
}

const SHAPE = `{"title": string, "intro": string (one line), "items": [{"heading": string, "text": string, "note": string (optional)}], "sources": [{"title": string, "url": string}] (only pages you actually used)}`;

/** One real call, with web search when `searches` > 0 (continues a paused turn at most twice). */
async function call(label: string, model: string, b: Brain, prompt: string, maxTokens: number, searches: number, budget: Budget, est: number): Promise<string> {
  const settle = budget.reserve(label, est);
  const lines: CostLine[] = [];
  try {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
    let msg: Anthropic.Message | null = null;
    for (let turn = 0; turn < 3; turn++) {
      msg = await ai().messages.create({
        model,
        max_tokens: maxTokens,
        system: systemFor(b),
        messages,
        ...(searches > 0 ? { tools: [{ type: SEARCH_TOOL, name: "web_search", max_uses: searches }] as unknown as Anthropic.ToolUnion[] } : {}),
      });
      lines.push(recordUsage(`office:${label}`, msg.model, msg.usage));
      if (msg.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: msg.content as Anthropic.ContentBlockParam[] });
    }
    return msg ? textOf(msg) : "";
  } finally {
    settle(lines);
  }
}

async function runReal(task: TaskId, b: Brain, input: string, scopeId: string): Promise<RunOut> {
  const plan = PLANS[task];
  // Hard cap: never spend more than the worst case the quote was built from.
  const budget = new Budget(plan.estUsd);
  const extra = input ? `\n\nThe owner added this:\n<owner_input>\n${input.slice(0, 4000)}\n</owner_input>` : "";
  return costScope(scopeId, task, async () => {
    let text: string;
    if (plan.gather) {
      // Haiku gathers with capped searches; the writer model turns the notes into the answer.
      const notes = await call(`${task}:gather`, HAIKU, b, `Search the web (at most ${plan.searches} searches) for what this task needs, near this business. Write short plain notes, each with its source URL. Only what the sources say.\n\nTask: ${plan.brief}`, 1500, plan.searches, budget, plan.estUsd * 0.5);
      text = await call(`${task}:write`, plan.model, b, `${plan.brief}${extra}\n\nResearch notes (with sources):\n<notes>\n${notes.slice(0, 12000)}\n</notes>\n\nAnswer as JSON: ${SHAPE}`, plan.maxTokens, 0, budget, plan.estUsd * 0.5);
    } else {
      const search = plan.searches ? `Search the web (at most ${plan.searches} searches). ` : "";
      text = await call(task, plan.model, b, `${search}${plan.brief}${extra}\n\nAnswer as JSON: ${SHAPE}`, plan.maxTokens, plan.searches, budget, plan.estUsd);
    }
    const usd = costOf(scopeId, task).usd;
    endCost(scopeId, task);
    return { result: parseResult(text, task), usd, sample: false };
  });
}

/** Runs a task. Throws a plain-English Error on failure (the caller marks the item and charges nothing). */
export async function runTask(task: TaskId, b: Brain, input = "", scopeId = "office", deps: RunDeps = defaultRunDeps()): Promise<RunOut> {
  if (deps.mock) {
    if (deps.delayMs) await sleep(deps.delayMs);
    return { result: fixtureResult(task, b), usd: PLANS[task].mockUsd, sample: true };
  }
  return runReal(task, b, input, scopeId);
}

/** "Bring a project": up to 3 follow-up questions for what is missing. Mock: deterministic. Real: one Haiku call. */
export async function followUps(b: Brain, deps: RunDeps = defaultRunDeps()): Promise<FollowUp[]> {
  const base = mockQuestions(b);
  if (deps.mock || !base.length) return base;
  try {
    const msg = await ai().messages.create({
      model: HAIKU,
      max_tokens: 500,
      system: systemFor(b),
      messages: [
        {
          role: "user",
          content: `The owner just told us about their business (above). We still miss: ${base.map((q) => q.id).join(", ")}. Rewrite one short, friendly question for each missing item, specific to this business, with a short example answer as the hint. JSON only: {"questions":[{"id": one of ${JSON.stringify(base.map((q) => q.id))}, "question": string, "hint": string}]}`,
        },
      ],
    });
    recordUsage("office:followups", msg.model, msg.usage);
    const t = textOf(msg);
    const v = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) as { questions?: Array<Partial<FollowUp>> };
    const out = base.map((q) => {
      const r = v.questions?.find((x) => x.id === q.id);
      return r?.question ? { id: q.id, question: String(r.question).slice(0, 140), hint: String(r.hint ?? q.hint).slice(0, 140) } : q;
    });
    return out.slice(0, 3);
  } catch {
    return base; // the plain questions are always good enough
  }
}
