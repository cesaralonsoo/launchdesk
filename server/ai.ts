import Anthropic from "@anthropic-ai/sdk";
import { config, type Stage } from "./config.js";
import { MOCKS } from "./mocks.js";

const str = { type: "string" } as const;
const strs = { type: "array", items: str } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const SCHEMAS: Record<Stage, object> = {
  validate: obj({
    score: { type: "integer", description: "0-100 overall viability" },
    verdict: { type: "string", enum: ["go", "pivot", "no-go"] },
    one_liner: { ...str, description: "The idea restated in one clear sentence" },
    summary: { ...str, description: "3-4 sentences: the honest verdict and why" },
    target_customer: str,
    problem_strength: obj({ score: { type: "integer" }, note: str }),
    market: obj({ score: { type: "integer" }, note: str }),
    competition: obj({ score: { type: "integer" }, note: str }),
    feasibility: obj({ score: { type: "integer" }, note: str }),
    competitors: { type: "array", items: obj({ name: str, note: str }) },
    strengths: strs,
    risks: strs,
    cheapest_test: { ...str, description: "The cheapest experiment to validate demand this week" },
    pivot_ideas: strs,
  }),
  plan: obj({
    positioning: str,
    value_proposition: str,
    customer_segments: { type: "array", items: obj({ segment: str, why: str }) },
    pricing: { type: "array", items: obj({ tier: str, price: str, includes: str }) },
    revenue_model: str,
    channels: { type: "array", items: obj({ channel: str, tactic: str }) },
    roadmap: { type: "array", items: obj({ phase: str, weeks: str, goals: strs }) },
    startup_costs: { type: "array", items: obj({ item: str, cost: str }) },
    kpis: { type: "array", items: obj({ metric: str, target: str }) },
    first_week: strs,
  }),
  kit: obj({
    name_ideas: { type: "array", items: obj({ name: str, why: str }) },
    tagline: str,
    landing: obj({ headline: str, subheadline: str, bullets: strs, cta: str }),
    elevator_pitch: str,
    posts: { type: "array", items: obj({ channel: str, text: str }) },
    launch_email: obj({ subject: str, body: str }),
    launch_checklist: strs,
  }),
};

const SYSTEM = `You are LaunchDesk, a sharp, honest startup advisory team.
Write in the same language as the founder's idea. Be concrete, specific and practical; no filler, no hype.
Never invent precise statistics or sources. When you estimate, say it is an estimate.
Competitors must be real companies or real product categories you are confident exist.`;

const PROMPTS: Record<Stage, (idea: string, prior: Record<string, unknown>) => string> = {
  validate: (idea) =>
    `Validate this business idea like a skeptical early-stage investor who also wants the founder to win.
Score each dimension 0-100 and give an overall score. Use "go" only if it is worth building now, "pivot" if the core is promising but needs a change, "no-go" otherwise.

Idea:
<idea>${idea}</idea>`,
  plan: (idea, prior) =>
    `Write a lean, actionable business plan for this idea. Use the validation below; address its risks.
Roadmap: 3-4 phases over the first 90 days. Pricing in the most likely local currency.

Idea:
<idea>${idea}</idea>

Validation:
${JSON.stringify(prior.validate ?? {})}`,
  kit: (idea, prior) =>
    `Create a launch kit for this idea: brand name ideas (5), tagline, landing page copy, elevator pitch,
5 social posts for the channels in the plan, a launch email, and a 10-item launch checklist.

Idea:
<idea>${idea}</idea>

Validation:
${JSON.stringify(prior.validate ?? {})}

Plan:
${JSON.stringify(prior.plan ?? {})}`,
};

const MODELS: Record<Stage, { model: string; effort: "low" | "medium" | "high"; maxTokens: number }> = {
  validate: { model: "claude-sonnet-5-5", effort: "medium", maxTokens: 8000 },
  plan: { model: "claude-opus-5-5", effort: "medium", maxTokens: 16000 },
  kit: { model: "claude-opus-5-5", effort: "low", maxTokens: 16000 },
};

const client = config.mockAi ? null : new Anthropic({ apiKey: config.anthropicKey });

export async function runStage(stage: Stage, idea: string, prior: Record<string, unknown>) {
  if (!client) {
    await new Promise((r) => setTimeout(r, 1200));
    return { json: MOCKS[stage], model: "mock" };
  }
  const m = MODELS[stage];
  const stream = client.messages.stream({
    model: m.model,
    max_tokens: m.maxTokens,
    system: SYSTEM,
    messages: [{ role: "user", content: PROMPTS[stage](idea, prior) }],
    output_config: { effort: m.effort, format: { type: "json_schema", schema: SCHEMAS[stage] } },
  } as any);
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("The AI declined this idea.");
  if (msg.stop_reason === "max_tokens") throw new Error("The AI answer was cut off.");
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  console.log(`[ai] ${stage} ${msg.model} in=${msg.usage.input_tokens} out=${msg.usage.output_tokens}`);
  return { json: JSON.parse(text), model: msg.model };
}
