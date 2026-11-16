// WP1 dev helper (no AI, no network): renders every fixture in every template to a folder.
//   node_modules/.bin/tsx server/site/preview.ts <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURES, loadFixture } from "./plan.js";
import { renderSite } from "./render.js";
import { SITE_TEMPLATES } from "./spec.js";
import { validateModelSite } from "./validate.js";

const out = process.argv[2] ?? "site-preview";
mkdirSync(out, { recursive: true });
for (const name of FIXTURES) {
  const fx = loadFixture(name);
  const { spec, issues } = validateModelSite(fx.model, fx.input);
  const kit = { brand: fx.input.brand, logo: { options: fx.logos, chosen: fx.logos[0]?.id ?? "", fallback: false } };
  for (const t of SITE_TEMPLATES) writeFileSync(join(out, `${name}-${t}.html`), renderSite(spec, kit, t, { reserved: 0, bchUsd: 480 }, { slug: fx.input.slug }));
  console.log(name, issues.length ? `issues: ${issues.join("; ")}` : "ok");
}
