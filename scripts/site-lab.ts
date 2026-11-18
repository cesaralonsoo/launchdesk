// Site lab: run the website steps of the launch kit one at a time on a real report, to judge and iterate on quality.
// Dev tool only (never imported by the server). Every paid call is added to SPEND_LOG; a run stops before it starts when
// the log's total has reached LAB_CAP_USD.
//
//   LAB_DIR=<dir> npx tsx scripts/site-lab.ts input  <example-id>|<idea>   writes input.json (the KitInput)
//   LAB_DIR=<dir> npx tsx scripts/site-lab.ts plan                         spec.json   (one Sonnet call, ~$0.04)
//   LAB_DIR=<dir> npx tsx scripts/site-lab.ts photos                       photos/ + photos.json (keyless; Haiku check ~$0.003)
//   LAB_DIR=<dir> npx tsx scripts/site-lab.ts custom                       custom.html (one Sonnet call, ~$0.12)
//   LAB_DIR=<dir> npx tsx scripts/site-lab.ts render [example]             page-custom.html + page-<template>.html (no AI)
//
// "input" with an example id reads the seeded snapshot (server/seed/examples/finished) into a scratch DATABASE_URL.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { onSpend } from "../server/cost.js";
import type { KitInput, SitePhotoMeta } from "../server/kit-contract.js";
import type { SiteSpec } from "../server/site/spec.js";

const DIR = process.env.LAB_DIR || "lab";
const SPEND_LOG = process.env.SPEND_LOG || join(DIR, "..", "spend.log");
const CAP = Number(process.env.LAB_CAP_USD || 5);
mkdirSync(DIR, { recursive: true });

const spent = () => (existsSync(SPEND_LOG) ? readFileSync(SPEND_LOG, "utf8").split("\n").reduce((t, l) => t + (Number(/\$([\d.]+)/.exec(l)?.[1]) || 0), 0) : 0);
onSpend((usd) => appendFileSync(SPEND_LOG, `${new Date().toISOString()} ${process.argv[2]} ${DIR} $${usd.toFixed(5)}\n`));
const guard = () => {
  const s = spent();
  console.log(`[lab] spent so far $${s.toFixed(4)} of $${CAP}`);
  if (s >= CAP) throw new Error("lab spend cap reached");
};
const read = <T>(f: string): T => JSON.parse(readFileSync(join(DIR, f), "utf8")) as T;
const write = (f: string, v: unknown) => writeFileSync(join(DIR, f), typeof v === "string" ? v : JSON.stringify(v, null, 2));

async function main() {
  const cmd = process.argv[2];
  if (cmd === "input") {
    const arg = process.argv[3] ?? "";
    const { seedFinishedExamples, loadExamples } = await import("../server/examples.js");
    const { getProject, migrate } = (await import("../server/db.js")) as unknown as { getProject: (id: string) => Promise<import("../server/types.js").Project | null>; migrate?: () => Promise<void> };
    await migrate?.();
    const { digestOf } = await import("../server/kit.js");
    const { loadV7 } = await import("../server/jobs-v7.js");
    const ex = loadExamples().find((x) => x.id === arg);
    if (!ex) throw new Error(`unknown example ${arg}`);
    await seedFinishedExamples();
    const p = await getProject(ex.id);
    if (!p) throw new Error("not seeded");
    const brand = ex.kit!.brand;
    const input: KitInput = { projectId: ex.id, idea: ex.idea, brand, report: digestOf(p, await loadV7(ex.id)), founderAddress: process.env.LAB_FOUNDER || "", slug: ex.slug };
    write("input.json", input);
    console.log(JSON.stringify(input.report.offer), input.report.stats.length, "stats");
    return;
  }
  if (cmd === "input-file") {
    // a saved live report (server/seed/examples/*-live-*.json) plus a lab brand JSON (no brand call: the site step is what is judged)
    const { digestOf } = await import("../server/kit.js");
    const p = (JSON.parse(readFileSync(process.argv[3]!, "utf8")) as { project: import("../server/types.js").Project }).project;
    const brand = JSON.parse(readFileSync(process.argv[4]!, "utf8")) as KitInput["brand"];
    const v7 = (p.results as { v7?: import("../server/v7.js").ResultsV7 }).v7 ?? null;
    write("input.json", { projectId: p.id, idea: p.idea, brand, report: digestOf(p, v7), founderAddress: process.env.LAB_FOUNDER || "", slug: brand.name.toLowerCase() } satisfies KitInput);
    console.log("written");
    return;
  }
  const input = read<KitInput>("input.json");
  if (cmd === "plan") {
    guard();
    const { planSiteDetailed } = await import("../server/site/plan.js");
    const r = await planSiteDetailed(input, { mock: false });
    write("spec.json", r.spec);
    console.log("issues:", r.issues, "usd", r.usd);
    const m = r.spec.sections.find((s) => s.kind === "menu");
    console.log(JSON.stringify(m, null, 1));
    console.log("photoQueries", r.spec.photoQueries);
    return;
  }
  if (cmd === "marketing") {
    guard();
    const { defaultDeps } = await import("../server/kit.js");
    const { withValidateFirst } = await import("../server/marketing/schema.js");
    const r = await defaultDeps.marketing(input);
    const plan = r.plan && typeof r.plan === "object" && Array.isArray((r.plan as { weeks?: unknown }).weeks) ? withValidateFirst(r.plan as never, input.report as never) : r.plan;
    write("marketing.json", { ...r, plan });
    console.log("headline:", (plan as { headline?: string })?.headline);
    return;
  }
  if (cmd === "photos") {
    guard();
    const spec = read<SiteSpec>("spec.json");
    const { findPhotos } = await import("../server/site/photos.js");
    const photos = await findPhotos({ idea: input.idea, city: input.brand.city, queries: spec.photoQueries, mock: false, cache: null });
    mkdirSync(join(DIR, "photos"), { recursive: true });
    const meta = photos.map(({ bytes, ...m }) => {
      const file = `p${m.n}.${m.mime === "image/webp" ? "webp" : "jpg"}`;
      writeFileSync(join(DIR, "photos", file), bytes);
      return { ...m, file };
    });
    write("photos.json", meta);
    for (const m of meta) console.log(m.n, m.role, m.provider, `${m.width}x${m.height}`, m.alt);
    return;
  }
  const spec = read<SiteSpec>("spec.json");
  const photos = read<Array<SitePhotoMeta & { file: string }>>("photos.json");
  if (cmd === "custom") {
    guard();
    const { generateCustomSite } = await import("../server/site/custom.js");
    const { customPhotos } = await import("../server/site/routes.js");
    const r = await generateCustomSite(input, customPhotos(photos), { spec, mock: false });
    console.log("usd", r.usd.toFixed(4), "ms", r.ms, "stop", r.stop, "issues", r.issues, "warnings", r.warnings);
    if (r.html) write("custom.html", r.html);
    return;
  }
  if (cmd === "render") {
    const example = process.argv[3] === "example";
    const { customRender } = await import("../server/site/custom-render.js");
    const { customPhotos } = await import("../server/site/routes.js");
    const { renderSite } = await import("../server/site/render.js");
    const { photoCredits } = await import("../server/site/photos.js");
    const kitPart = { brand: input.brand, logo: (process.env.LAB_LOGO ? JSON.parse(readFileSync(process.env.LAB_LOGO, "utf8")) : undefined) };
    const sp: SiteSpec = example ? { ...spec, reserve: { ...spec.reserve, address: "" } } : spec;
    const live = { reserved: 0, leads: 0, bchUsd: 470 };
    if (existsSync(join(DIR, "custom.html"))) {
      const html = customRender({ html: readFileSync(join(DIR, "custom.html"), "utf8"), spec: sp, kit: kitPart, photos: customPhotos(photos) }, live, { slug: input.slug, example, photoUrl: (n) => `photos/${photos[n - 1]?.file}` });
      write("page-custom.html", html ?? "<p>custom page rejected at render</p>");
    }
    const credits = photoCredits(photos).items;
    for (const t of ["editorial", "bold", "warm"] as const)
      write(`page-${t}.html`, renderSite(sp, kitPart, t, live, { slug: input.slug, example, photos: photos.map((p) => ({ url: `photos/${p.file}`, alt: p.alt, width: p.width, height: p.height })), photoCredits: credits.map((i) => ({ label: i.label, href: i.href, license: i.license, licenseUrl: i.licenseUrl })) }));
    console.log("rendered");
    return;
  }
  throw new Error(`unknown command ${cmd}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
