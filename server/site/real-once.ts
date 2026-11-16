// WP1 dev helper: ONE real planSite call on a new idea, renders it in 3 templates. Costs ~$0.03-0.06. Never loops.
//   MOCK_AI=0 node_modules/.bin/tsx server/site/real-once.ts <outDir>
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { KitInput } from "../kit-contract.js";
import { planSiteDetailed, SITE_MODEL } from "./plan.js";
import { renderSite } from "./render.js";
import { SITE_TEMPLATES } from "./spec.js";

const out = process.argv[2] ?? "site-real";
mkdirSync(out, { recursive: true });
const input: KitInput = {
  projectId: "real-1",
  slug: "fern-and-co",
  founderAddress: "bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy",
  idea: "A plant shop in Leith, Edinburgh that sells easy houseplants and offers a monthly plant-care visit for busy flat owners",
  brand: { name: "Fern & Co", tagline: "Houseplants that stay alive", voice: "friendly, calm, practical", palette: { primary: "#2e5a3a", accent: "#d98b5f", bg: "#f5f1ea", ink: "#1c241e" }, fonts: { display: "Fraunces", text: "DM Sans" }, lang: "en", city: "Edinburgh", currency: "£" },
  report: {
    customer: "Busy flat owners in Leith aged 25-40 who want plants but keep killing them",
    pain: "Plants die within months because owners don't know light, water or repotting needs",
    offer: { what: "Starter Jungle: 3 easy plants + 2 care visits", price: 45, normal: 60, limit: 50 },
    // No placeholder statistic: a demo page must only show sourced numbers (real kits pass real sourced stats).
    stats: [],
    competitors: [{ name: "Supermarket plants", gap: "No advice, no aftercare" }],
    risks: ["Seasonal demand"],
  },
};
const r = await planSiteDetailed(input, { mock: false });
appendFileSync(".notes/next/spend.log", `WP1 ${SITE_MODEL} $${r.usd.toFixed(4)}\n`);
console.log("usd", r.usd.toFixed(4), "issues", r.issues);
writeFileSync(join(out, "spec.json"), JSON.stringify(r.spec, null, 2));
for (const t of SITE_TEMPLATES) writeFileSync(join(out, `real-fern-${t}.html`), renderSite(r.spec, { brand: input.brand }, t, { reserved: 0, bchUsd: 480 }, { slug: input.slug }));
