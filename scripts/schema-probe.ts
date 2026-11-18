// Dev probe: does a structured-output schema compile? (A grammar error is a free 400; a pass costs a few tokens.)
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../server/config.js";
import { recordUsage } from "../server/cost.js";
import { MODEL_SITE_SCHEMA } from "../server/site/spec.js";

const drop = (process.argv[2] ?? "").split(",").filter(Boolean);
const schema = JSON.parse(JSON.stringify(MODEL_SITE_SCHEMA)) as { properties: Record<string, unknown>; required: string[] };
for (const k of drop) {
  delete schema.properties[k];
  schema.required = schema.required.filter((x) => x !== k);
}
const c = new Anthropic({ apiKey: config.anthropicKey });
try {
  const m = await c.messages.create({ model: "claude-haiku-5-5", max_tokens: 20, messages: [{ role: "user", content: "x" }], output_config: { format: { type: "json_schema", schema } } } as never);
  recordUsage("probe", (m as { model: string }).model, (m as { usage: never }).usage);
  console.log("OK without", drop);
} catch (e) {
  console.log("FAIL without", drop, (e as Error).message.slice(0, 120));
}
