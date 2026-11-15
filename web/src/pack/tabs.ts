// Section renderers for the startup pack document (spec-v4 §2.8, §3.2). Pure: Project in, HTML string out.
// The same strings build the in-app document, the downloaded HTML and the PDF. Owner: WS4.
import {
  DEFAULT_FONTS,
  DEFAULT_WORDMARK,
  fmtMoney,
  type DexDesign,
  type DeptStatus,
  type FontPair,
  type NovaBrand,
  type Preorders,
  type Project,
  type SamAssumption,
  type SiteData,
  type Stage,
  type WorkDept,
} from "../types";
import { explorerTx } from "../explorer";
import { landingMarkup } from "../site/landing";
import { BCH_BADGE, bchAmount, paymentUri, qrSvg } from "../site/qr";
import { cashChart, cashSeries, positioningMap, priceLevel, sparkline, verdictWord } from "./charts";
import { renderMark, renderWordmark } from "./logo";
import { productMockup, profileMockup } from "./mockups";
import { brandColors, contrast, esc, fontStack, parseDay, sats, usd } from "./util";

export type PackSection = "summary" | "market" | "plan" | "numbers" | "brand" | "website" | "launch" | "receipt";
/** v3 name, kept for importers. */
export type TabId = PackSection;

export const SECTIONS: Array<{ id: PackSection; label: string; dept: WorkDept | null; stage: Stage | null }> = [
  { id: "summary", label: "Summary", dept: null, stage: "validate" },
  { id: "market", label: "Market", dept: "leo", stage: "validate" },
  { id: "plan", label: "Plan", dept: "mia", stage: "validate" },
  { id: "numbers", label: "Numbers", dept: "sam", stage: "validate" },
  { id: "brand", label: "Brand", dept: "nova", stage: "build" },
  { id: "website", label: "Website", dept: "pip", stage: "build" },
  { id: "launch", label: "Launch", dept: "rae", stage: "build" },
  { id: "receipt", label: "Receipt", dept: null, stage: null },
];

export const DEPT: Record<WorkDept | "lobby", { name: string; role: string; color: string }> = {
  lobby: { name: "Lobby", role: "Intake", color: "#0AC18E" },
  mia: { name: "Mia", role: "Plan", color: "#8B7CF6" },
  leo: { name: "Leo", role: "Market research", color: "#3B82F6" },
  sam: { name: "Sam", role: "Numbers", color: "#F59E0B" },
  nova: { name: "Nova", role: "Name and brand", color: "#EC4899" },
  dex: { name: "Dex", role: "Logo and page", color: "#F97362" },
  rae: { name: "Rae", role: "Launch plan", color: "#14B8A6" },
  pip: { name: "Pip", role: "Live site", color: "#94A3B8" },
};

const svg = (d: string, size = 16, sw = 1.5) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  check: svg(`<path d="m5 12.5 4.2 4.2L19 7"/>`, 14, 2),
  lock: svg(`<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>`, 14),
  ext: svg(`<path d="M8 16 16 8M9.5 8H16v6.5"/>`, 14),
  copy: svg(`<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>`),
  warn: svg(`<path d="M12 4.5 21 19.5H3z"/><path d="M12 10v4.2M12 17h.01"/>`),
  arrow: svg(`<path d="M5 12h14M13 6l6 6-6 6"/>`, 14),
  download: svg(`<path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/>`),
  share: svg(`<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M6 12.5v6a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-6"/>`),
  close: svg(`<path d="M7 7l10 10M17 7 7 17"/>`, 16, 1.8),
  more: svg(`<circle cx="6" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="18" cy="12" r="1" fill="currentColor"/>`),
  chevron: svg(`<path d="m7 10 5 5 5-5"/>`, 14),
};

const CHANNEL_GLYPH: Record<string, string> = {
  instagram: svg(`<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.8" cy="7.2" r=".6" fill="currentColor"/>`, 20),
  tiktok: svg(`<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c.4 2.4 2 4 4.5 4.2"/>`, 20),
  linkedin: svg(`<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 10.5V16M8.5 7.8v.01M12 16v-5.5M12 13c0-1.6 1-2.6 2.3-2.6s2.2.8 2.2 2.6V16"/>`, 20),
  x: svg(`<path d="M5 5l14 14M19 5 5 19"/>`, 20),
  email: svg(`<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="m4 7 8 6 8-6"/>`, 20),
};
const CHANNEL_NAME: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", x: "X", email: "Email" };
/** Grey per channel for calendar dots (never brand colours). */
const CHANNEL_GREY: Record<string, string> = { instagram: "#1D1D1F", tiktok: "#424245", linkedin: "#6E6E73", x: "#76767B", email: "#AEAEB2" };

export type RenderCtx = {
  founderAddress?: string;
  bchUsd?: number;
  origin?: string;
  loading?: boolean;
  /** Static document (download / PDF): no toggles, no live previews. */
  doc?: boolean;
  readOnly?: boolean;
  /** Ticked checkboxes (localStorage per project). */
  checks?: Record<string, boolean>;
  preorders?: Preorders | null;
  /** The live page is a demo page (sample run on the merchant address): pre-orders are off. */
  demo?: boolean;
  /** Price of stage 2 in cents, for the locked sections ("Build · $0.20"). */
  buildCents?: number;
};

// ---------- shared ----------

export type Brand = { name: string; tagline: string; option?: NovaBrand["names"][number]; logo?: DexDesign["logos"][number]; fonts: FontPair };

/** Break-even volume in words: "186 a day", or "about 4 a week" when below one a day. */
function perDay(n: number): string {
  return n >= 1 ? `${n} a day` : `about ${Math.max(1, Math.round(n * 7))} a week`;
}

export function brandOf(p: Project): Brand {
  const nova = p.results.nova;
  const opt = nova ? nova.names[nova.chosen] ?? nova.names[0] : undefined;
  const fallback = p.results.mia?.title || p.idea || "Your project";
  return { name: opt?.name || fallback, tagline: opt?.tagline || "", option: opt, logo: p.results.dex?.logos?.[0], fonts: nova?.typography ?? { ...DEFAULT_FONTS } };
}

export function siteDataOf(p: Project, extra: { founderAddress?: string; bchUsd?: number } = {}): SiteData | null {
  const b = brandOf(p);
  const dex = p.results.dex;
  if (!dex) return null;
  return {
    slug: p.results.pip?.slug || "preview",
    name: b.name,
    tagline: b.tagline,
    palette: b.option?.palette ?? [],
    logo: b.logo ?? { concept: "", icon: "spark", shape: "emblem", monogram: b.name[0] || "A", wordmark: { ...DEFAULT_WORDMARK } },
    landing: dex.landing,
    founderAddress: extra.founderAddress ?? "",
    bchUsd: extra.bchUsd ?? 0,
    demo: !extra.founderAddress,
    fonts: b.fonts,
    wordmark: b.logo?.wordmark ?? { ...DEFAULT_WORDMARK },
    faq: dex.landing.faq,
    where_when: dex.landing.where_when,
    offer_price: dex.landing.offer_price,
    normal_price: dex.landing.normal_price,
    currency: p.results.sam?.currency ?? p.results.mia?.market.currency ?? "€",
  };
}

const hasData = (p: Project, id: PackSection) => {
  const r = p.results;
  switch (id) {
    case "summary": return !!(r.leo || r.mia);
    case "market": return !!r.leo;
    case "plan": return !!r.mia;
    case "numbers": return !!r.sam;
    case "brand": return !!r.nova;
    case "website": return !!r.dex;
    case "launch": return !!r.rae;
    case "receipt": return true;
  }
};

/** Whether a section has its data; otherwise why not. */
export function sectionState(p: Project, id: PackSection): "ready" | "working" | "locked" | "queued" | "error" {
  if (hasData(p, id)) return "ready";
  const s = SECTIONS.find((x) => x.id === id)!;
  const dept = s.dept ?? "leo";
  const st: DeptStatus | undefined = p.status[dept];
  if (s.stage && !p.payments[s.stage] && !p.example) return "locked";
  if (st === "working") return "working";
  if (st === "error") return "error";
  return "queued";
}
/** v3 name. */
export const tabState = sectionState;

const dGB = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", { timeZone: "UTC", ...o });
const isDev = (txid: string) => txid.startsWith("dev-");
const by = (d: WorkDept) => `<p class="ldp-by"><i style="background:var(--d-${d}, ${DEPT[d].color})"></i>${DEPT[d].name}, ${DEPT[d].role.toLowerCase()}</p>`;
const more = (id: PackSection, ctx: RenderCtx, label = "Details") => (ctx.doc ? "" : `<a class="ldp-more" href="#ldp-s-${id}" data-goto="${id}">${label} →</a>`);
const copyBtn = (text: string, label = "Copy") => `<button class="ldp-iconbtn" type="button" data-copy="${esc(text)}" aria-label="${esc(label)}" title="${esc(label)}" data-nodoc>${ICON.copy}</button>`;
const estTag = `<span class="ldp-est">Estimate</span>`;
const cbox = (key: string, ctx: RenderCtx) => `<input type="checkbox" data-check="${esc(key)}"${ctx.checks?.[key] ? " checked" : ""}><span class="cb" aria-hidden="true">${ICON.check}</span>`;

function notReady(p: Project, id: PackSection, ctx: RenderCtx): string {
  const s = SECTIONS.find((x) => x.id === id)!;
  const st = sectionState(p, id);
  const who = DEPT[s.dept ?? "leo"];
  if (st === "locked") {
    const price = usd(ctx.buildCents ?? 20);
    const what: Record<string, string> = {
      brand: "Three names with palettes, three logos and a brand voice.",
      website: "A live page that takes Bitcoin Cash pre-orders straight to your wallet.",
      launch: "A 30-day launch plan with your first three posts written.",
    };
    return `<div class="ldp-locked"><span class="ldp-lockchip">${ICON.lock}Build · ${price}</span><p>${esc(what[id] ?? "")}</p>${ctx.readOnly || ctx.doc ? "" : `<button class="ldp-btn" type="button" data-build>Build it · ${price}</button>`}</div>`;
  }
  const sd = s.dept;
  if (sd && p.models[sd] === "skipped") {
    const what: Record<string, string> = { brand: "no brand yet", website: "no page yet", launch: "no launch plan yet" };
    return `<div class="ldp-pending"><i></i>${esc(DEPT[sd].name)} was skipped, so there is ${what[id] ?? "nothing here yet"}.</div>`;
  }
  if (st === "error") return `<div class="ldp-pending err"><i></i>${esc(p.errors?.[s.dept!] ?? `${who.name} hit a snag.`)} Retry from the office: it's free.</div>`;
  return `<div class="ldp-pending"><i class="${st === "working" ? "on" : ""}"></i>${st === "working" ? `${who.name} is working on this.` : `${who.name} starts after the team before.`}</div>`;
}

const sectionHead = (title: string, sub = "") => `<header class="ldp-sh"><h2>${esc(title)}</h2>${sub}</header>`;

// ---------- Summary (R10) ----------

function boldScore(s: string): string {
  return esc(s).replace(/(\d{1,2}(?:\.\d)?\/10)/, "<b>$1</b>");
}

export function secSummary(p: Project, ctx: RenderCtx): string {
  const { mia, leo, sam, memo, rae, pip } = p.results;
  if (!mia && !leo) return sectionHead("Summary") + notReady(p, "summary", ctx);
  const b = brandOf(p);
  const title = p.results.nova ? b.name : mia?.title ?? b.name;
  const purpose = memo?.purpose ?? mia?.one_liner ?? "";
  const verdict = memo?.verdict_line ?? (leo ? `Leo scores it ${leo.score.toFixed(1)}/10: ${leo.verdict === "go" ? "go" : leo.verdict === "pivot" ? "pivot first" : "no-go"}. ${leo.headline}` : "");
  const problem = memo?.problem ?? leo?.summary ?? "";
  const insight = memo?.insight ?? leo?.why_go ?? "";
  const risks = [...(leo?.risks ?? [])].sort((a, z) => ["high", "med", "low"].indexOf(a.severity) - ["high", "med", "low"].indexOf(z.severity));
  const risk = risks[0];
  const next = (memo?.next_7_days?.length ? memo.next_7_days : (mia?.checklist ?? []).filter((x) => x.week === 1).map((x) => x.task)).slice(0, 3);
  const blocks: string[] = [];
  blocks.push(`<div class="ldp-memo-top"><p class="ldp-memo-kicker">Summary</p><h2 class="ldp-memo-title" id="ldp-h-summary">${esc(purpose || title)}</h2></div>`);
  if (verdict) blocks.push(`<div class="ldp-blk"><p class="ldp-verdict">${boldScore(verdict)}</p></div>`);
  if (problem) blocks.push(`<div class="ldp-blk"><h3>The problem today</h3><p>${esc(problem)}</p></div>`);
  if (insight) blocks.push(`<div class="ldp-blk"><h3>Why you can win</h3><p>${esc(insight)}</p>${more("market", ctx)}</div>`);
  if (sam) {
    const be = sam.break_even.month ? `Month ${sam.break_even.month}` : "Not in year 1";
    const series = cashSeries(sam);
    const beIdx = sam.break_even.month ? sam.break_even.month : null;
    blocks.push(`<div class="ldp-blk"><h3>The numbers</h3>
      <div class="ldp-kpis">
        <div><small>Price</small><b>${esc(sam.price.display)}</b><span>Estimate</span></div>
        <div><small>Cash needed</small><b>${esc(sam.cash_needed.display)}</b><span>${sam.cash_needed.month ? `Lowest in month ${sam.cash_needed.month}` : "Before opening"}</span></div>
        <div><small>Break-even</small><b>${be}</b><span>${sam.breakeven_units_per_day ? perDay(sam.breakeven_units_per_day) : esc(sam.break_even.note)}</span></div>
      </div>
      <div class="ldp-sparkrow">${sparkline(series, { width: 120, height: 32, mark: beIdx, label: "Cumulative cash over 12 months" })}<span>Cash over the first 12 months. Estimate.</span></div>
      ${more("numbers", ctx)}</div>`);
  }
  if (risk || sam?.main_risk) {
    blocks.push(`<div class="ldp-blk"><h3>Biggest risk and the cheapest test</h3>${risk
      ? `<p>${esc(risk.risk)}</p>${risk.mitigation ? `<p class="ldp-test"><span>Cheapest test:</span> ${esc(risk.mitigation)}</p>` : ""}`
      : `<p>${esc(sam!.main_risk)}</p>`}${more("market", ctx)}</div>`);
  }
  if (next.length) {
    blocks.push(`<div class="ldp-blk"><h3>Your next 7 days</h3><div class="ldp-checks">${next.map((t, i) => `<label class="ldp-check">${cbox(`s7-${i}`, ctx)}<span>${esc(t)}</span></label>`).join("")}</div>${more("plan", ctx, "Full plan")}</div>`);
  }
  if (pip) {
    const url = liveUrl(p, ctx);
    const first = rae?.first_posts?.[0]?.text;
    blocks.push(`<div class="ldp-blk"><h3>Live now</h3><div class="ldp-liverow"><a class="ldp-url" href="${esc(url.href)}" target="_blank" rel="noopener">${esc(url.shown)}${ICON.ext}</a>${copyBtn(url.full, "Copy link")}</div>
      ${first && !ctx.doc ? `<div><button class="ldp-btn sm" type="button" data-copy="${esc(first)}" data-label="Copy first post">Copy first post</button></div>` : ""}${more("website", ctx)}</div>`);
  }
  return `<div class="ldp-memo">${blocks.join("")}</div>`;
}

// ---------- Market (R14, R5, R2) ----------

/** 5-dot meter from the same rounded score that is printed next to it: 7/10 = 3½ dots, 9/10 = 4½. */
const dots5 = (r: number) => `<span class="ldp-dots5" aria-hidden="true">${Array.from({ length: 5 }, (_, i) => `<i class="${r >= (i + 1) * 2 ? "on" : r === i * 2 + 1 ? "half" : ""}"></i>`).join("")}</span>`;
const sup = (id: number | null) => (id == null ? "" : `<sup><a href="#ldp-src-${id}">${id}</a></sup>`);

export function secMarket(p: Project, ctx: RenderCtx): string {
  const leo = p.results.leo;
  if (!leo) return sectionHead("Market", by("leo")) + notReady(p, "market", ctx);
  const srcs = leo.sources ?? [];
  const accessed = srcs[0]?.accessed ? dGB(parseDay(srcs[0].accessed), { day: "numeric", month: "short" }) : "";
  const meta = srcs.length ? `Researched ${srcs.length} source${srcs.length === 1 ? "" : "s"} · ${accessed}` : "No web sources this time: all figures are estimates.";
  const risks = leo.risks ?? [];
  const comps = leo.competitors ?? [];
  const facts = leo.market_facts ?? [];
  const vword = verdictWord(leo.verdict);
  return `${sectionHead("Market", by("leo") + `<p class="ldp-meta">${esc(meta)}</p>`)}
  <div class="ldp-scoreline"><span class="ldp-score"><b>${leo.score.toFixed(1)}</b><small>/10</small></span><span class="ldp-vtag ${esc(leo.verdict)}">${vword}</span></div>
  <h3 class="ldp-h3">${esc(leo.headline)}</h3>
  <p class="ldp-p">${esc(leo.summary)}</p>
  ${leo.pivot ? `<dl class="ldp-dl"><dt>Suggested pivot</dt><dd>${esc(leo.pivot.idea)}<small>${esc(leo.pivot.why)}</small></dd></dl>` : ""}

  <h3 class="ldp-sub">Five signals</h3>
  <table class="ldp-signals"><tbody>${(leo.signals ?? []).map((s) => `<tr><th>${esc(s.name)}</th><td class="m">${dots5(Math.round(s.score))}</td><td class="n">${Math.round(s.score)}/10</td><td class="w">${esc(s.why)}${sup(s.source_id)}</td></tr>`).join("")}</tbody></table>

  <h3 class="ldp-sub">Where you stand</h3>
  ${positioningMap(leo)}

  ${comps.length ? `<h3 class="ldp-sub">Competitors</h3>
  <table class="ldp-table"><thead><tr><th>Who</th><th>What they miss</th><th class="r">Price</th><th class="r">Different</th></tr></thead><tbody>
  ${comps.map((c) => `<tr><td><b>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener nofollow">${esc(c.name)}${ICON.ext}</a>` : esc(c.name)}</b></td><td class="mu">${esc(c.note)}</td><td class="r">${priceLevel(c.price)}</td><td class="r">${priceLevel(c.differentiation)}</td></tr>`).join("")}
  <tr class="you"><td><b>You</b></td><td class="mu">${esc(leo.headline)}</td><td class="r">${priceLevel(leo.you.price)}</td><td class="r">${priceLevel(leo.you.differentiation)}</td></tr>
  </tbody></table>` : ""}

  ${facts.length ? `<h3 class="ldp-sub">Key facts</h3><ul class="ldp-facts">${facts.map((f) => `<li>${esc(f.fact)}${sup(f.source_id)}${f.is_estimate ? ` ${estTag}` : ""}</li>`).join("")}</ul>` : ""}

  ${risks.length ? `<h3 class="ldp-sub">Risks</h3>
  <table class="ldp-table ldp-risks"><thead><tr><th>Risk</th><th>What to do</th></tr></thead><tbody>
  ${risks.map((r) => `<tr><td><span class="sev ${esc(r.severity)}" title="${r.severity === "med" ? "Medium" : r.severity === "high" ? "High" : "Low"} severity"></span>${esc(r.risk)}</td><td class="mu">${esc(r.mitigation || "—")}</td></tr>`).join("")}
  </tbody></table>` : ""}

  <h3 class="ldp-sub">Next step</h3><p class="ldp-p">${esc(leo.next_step)}</p>

  ${srcs.length ? `<ol class="ldp-sources">${srcs.map((s) => `<li id="ldp-src-${s.id}"><img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(s.domain)}&sz=32" width="14" height="14" alt="" loading="lazy" referrerpolicy="no-referrer"><a href="${esc(s.url)}" target="_blank" rel="noopener nofollow">${esc(s.title)}</a><span>${esc(s.domain)}, accessed ${esc(dGB(parseDay(s.accessed), { day: "numeric", month: "short", year: "numeric" }))}</span></li>`).join("")}</ol>` : ""}`;
}

// ---------- Plan (R17, R6) ----------

const HELP: Record<WorkDept, string> = {
  mia: "Uses Mia's plan", leo: "Uses Leo's research", sam: "Uses Sam's numbers", nova: "Uses Nova's brand",
  dex: "Uses Dex's page", rae: "Uses Rae's posts", pip: "Uses your live page",
};

/** "Two full counts" → "two full counts" (keeps acronyms and names like "MVP" or "Instagram" when the next letter is upper case too). */
const lowerFirst = (t: string) => (/^[A-Z][a-z]/.test(t) && !/^(I|Instagram|TikTok|LinkedIn|Google|Barcelona|Madrid)\b/.test(t) ? t[0]!.toLowerCase() + t.slice(1) : t);

export function secPlan(p: Project, ctx: RenderCtx): string {
  const mia = p.results.mia;
  if (!mia) return sectionHead("Plan", by("mia")) + notReady(p, "plan", ctx);
  const list = mia.checklist ?? [];
  const done = list.filter((_, i) => ctx.checks?.[`t-${i}`]).length;
  const weeks = [1, 2, 3, 4].map((w) => ({ w, items: list.map((x, i) => ({ x, i })).filter(({ x }) => x.week === w) })).filter((g) => g.items.length);
  const iv = p.results.leo?.interviews;
  const ivText = iv && iv.questions.length
    ? [`Talk to customers: ${iv.who}`, `Where: ${iv.where}`, `Target: ${iv.target} conversations`, "", ...iv.questions.map((q) => `[ ] ${q}`), "", `Good sign: ${iv.good_sign}`].join("\n")
    : "";
  return `${sectionHead("Plan", by("mia") + `<p class="ldp-meta" data-plan-count="${list.length}">${done} of ${list.length} done</p>`)}
  <dl class="ldp-dl">
    <dt>Concept</dt><dd>${esc(mia.brief.concept)}</dd>
    <dt>For</dt><dd>${esc(mia.brief.for)}</dd>
    <dt>Goal</dt><dd>${esc(mia.brief.goal)}</dd>
  </dl>
  <div class="ldp-weeks">${weeks.map((g) => `<div class="ldp-week"><h3 class="ldp-weekh">Week ${g.w}</h3>${g.items.map(({ x, i }) => `<label class="ldp-task">${cbox(`t-${i}`, ctx)}<span class="ldp-tk"><b>${esc(x.task)}</b>${x.how ? `<span class="how">${esc(x.how)}</span>` : ""}${x.done_when ? `<span class="dw">Done when ${esc(lowerFirst(x.done_when.replace(/^done when\s*/i, "")))}</span>` : ""}${x.helped_by ? `<span class="hb"><i style="background:var(--d-${x.helped_by}, ${DEPT[x.helped_by].color})"></i>${HELP[x.helped_by]}</span>` : ""}</span>${x.est_hours ? `<span class="hrs">${x.est_hours} h</span>` : ""}</label>`).join("")}</div>`).join("")}</div>
  ${iv && iv.questions.length ? `<div class="ldp-talk">
    <div class="ldp-talkhead"><h3 class="ldp-sub">Talk to customers</h3>${ctx.doc ? "" : `<button class="ldp-btn sm" type="button" data-copy="${esc(ivText)}" data-label="Copy as checklist">Copy as checklist</button>`}</div>
    <dl class="ldp-dl"><dt>Who</dt><dd>${esc(iv.who)}</dd><dt>Where</dt><dd>${esc(iv.where)}</dd><dt>Target</dt><dd>${iv.target} conversations</dd></dl>
    <ol class="ldp-qs">${iv.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>
    <p class="ldp-good"><span>Good sign:</span> ${esc(iv.good_sign)}</p>
  </div>` : ""}`;
}

// ---------- Numbers (R15) ----------

function fmtAssumption(a: SamAssumption, cur: string): string {
  const u = a.unit.trim();
  if (u === cur || /^(€|\$|£|eur|usd|gbp)$/i.test(u)) return fmtMoney(cur, a.value, { cents: a.value < 100 && a.value % 1 !== 0 });
  if (u === "%") return `${a.value}%`;
  const v = Number.isInteger(a.value) ? a.value.toLocaleString("en-US") : String(a.value);
  return `${v} ${esc(u)}`;
}

export function secNumbers(p: Project, ctx: RenderCtx): string {
  const sam = p.results.sam;
  if (!sam) return sectionHead("Numbers", by("sam")) + notReady(p, "numbers", ctx);
  const cur = sam.currency;
  const be = sam.break_even.month ? `Month ${sam.break_even.month}` : "Not in year 1";
  const low = sam.months.reduce((a, m) => (m.cash < a.cash ? m : a), sam.months[0] ?? { cash: 0, month: 0 });
  const res = sam.year1.result || "";
  const neg = /^[−-]/.test(res.trim());
  const cv = sam.canvas;
  const yr = (k: string, v: string, word = "") => `<tr><th>${k}</th><td class="r"><b>${esc(v)}</b>${word ? ` <span class="w">${word}</span>` : ""}</td></tr>`;
  return `${sectionHead("Numbers", by("sam") + `<p class="ldp-meta">Every number here is an estimate from Sam's assumptions below.</p>`)}
  <div class="ldp-kpis four">
    <div><small>Price</small><b>${esc(sam.price.display)}</b><span>${esc(sam.price.note)}</span></div>
    <div><small>Start-up</small><b>${esc(sam.startup_cost.display)}</b><span>${esc(sam.startup_cost.note)}</span></div>
    <div class="hero"><small>Cash needed</small><b>${esc(sam.cash_needed.display)}</b><span>${low && low.cash < 0 ? `Lowest point ${esc(fmtMoney(cur, low.cash))} · month ${low.month}` : "Before opening"}</span></div>
    <div><small>Break-even</small><b>${be}</b><span>${sam.breakeven_units_per_day ? perDay(sam.breakeven_units_per_day) : esc(sam.break_even.note)}</span></div>
  </div>
  ${cashChart(sam)}
  <p class="ldp-legend"><span><i class="rev"></i>Revenue per month</span><span><i class="cost"></i>Costs per month</span><span><i class="cash"></i>Cash, cumulative</span></p>

  ${sam.assumptions.length ? `<h3 class="ldp-sub">Assumptions</h3>
  <table class="ldp-table ldp-assume"><tbody>${sam.assumptions.map((a) => `<tr><th>${esc(a.label)}</th><td class="r v">${fmtAssumption(a, cur)}</td><td class="mu">${esc(a.basis)}${a.is_estimate ? ` ${estTag}` : ""}</td></tr>`).join("")}</tbody></table>
  ${sam.fixed_costs_breakdown.length ? `<h3 class="ldp-sub">Fixed costs per month</h3><table class="ldp-table ldp-fixed"><tbody>${sam.fixed_costs_breakdown.map((f) => `<tr><th>${esc(f.label)}</th><td class="r">${esc(fmtMoney(cur, f.value))}</td></tr>`).join("")}<tr class="tot"><th>Total</th><td class="r"><b>${esc(fmtMoney(cur, sam.fixed_costs_breakdown.reduce((t, f) => t + f.value, 0)))}</b></td></tr></tbody></table>` : ""}` : ""}

  <h3 class="ldp-sub">Year 1</h3>
  <table class="ldp-table ldp-y1"><tbody>
    ${yr("Revenue", sam.year1.revenue)}${yr("Operating costs", sam.year1.costs)}
    ${yr("Result, before start-up costs", res, neg ? "loss" : "profit")}
    ${yr("Monthly profit by month 12", sam.year1.monthly_profit_m12, /^[−-]/.test(sam.year1.monthly_profit_m12) ? "loss" : "profit")}
    ${yr(`Payback of the ${sam.startup_cost.display} start-up`, sam.year1.payback)}
  </tbody></table>

  <h3 class="ldp-sub">Business model</h3>
  <div class="ldp-canvas">
    <div><small>Customer</small><p>${esc(cv.customer)}</p></div><div><small>Value</small><p>${esc(cv.value)}</p></div><div><small>Revenue</small><p>${esc(cv.revenue)}</p></div>
    <div><small>Channels</small><p>${esc(cv.channels)}</p></div><div><small>Costs</small><p>${esc(cv.costs)}</p></div><div><small>Unit economics</small><p>${esc(cv.unit_economics)}</p></div>
  </div>
  ${sam.main_risk ? `<p class="ldp-risknote">${ICON.warn}<span>${esc(sam.main_risk)}</span></p>` : ""}`;
}

// ---------- Brand (R19, R11, R12) ----------

export function secBrand(p: Project, ctx: RenderCtx): string {
  const nova = p.results.nova;
  if (!nova) return sectionHead("Brand", by("nova")) + notReady(p, "brand", ctx);
  const b = brandOf(p);
  const pal = b.option?.palette ?? [];
  const c = brandColors(pal);
  const f = b.fonts;
  const dex = p.results.dex;
  const logos = dex?.logos ?? [];
  const ratio = contrast(c.primary, c.bg);
  const aa = ratio >= 4.5;
  const handle = p.results.rae?.handle || "@" + b.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const hooks = (p.results.rae?.posts ?? []).map((x) => x.hook);
  const others = nova.names.map((n, i) => ({ n, i })).filter((x) => x.i !== nova.chosen);
  const para = dex ? `${dex.landing.headline} ${dex.landing.subheadline}` : `${b.tagline} ${p.results.mia?.one_liner ?? ""}`;
  const skippedNote = [p.models.nova === "skipped" ? "Nova was skipped, so this is your working title, not a researched brand yet." : "", p.models.dex === "skipped" ? "Dex was skipped, so the logo is a plain wordmark." : ""].filter(Boolean).join(" ");
  return `${sectionHead("Brand", by("nova"))}
  ${skippedNote ? `<div class="ldp-pending" style="margin-bottom:16px"><i></i>${esc(skippedNote)}</div>` : ""}
  <div class="ldp-brandhero" style="background:${c.bg};color:${c.ink}">
    ${renderWordmark(b.logo, pal, b.name, 64, f, { color: c.ink })}
    ${b.tagline ? `<p style="font-family:${esc(fontStack(f.body, "body"))}">${esc(b.tagline)}</p>` : ""}
  </div>
  ${b.option?.why ? `<p class="ldp-p">${esc(b.option.why)}</p>` : ""}

  <h3 class="ldp-sub">Palette</h3>
  <div class="ldp-swatches">${pal.slice(0, 4).map((s) => `<button class="ldp-sw" type="button" data-copy="${esc(s.hex)}" data-label="${esc(s.hex)}" aria-label="Copy ${esc(s.name)} ${esc(s.hex)}"><span class="sw-chip" style="background:${esc(s.hex)}"></span><b>${esc(s.name)}</b><code>${esc(s.hex.toUpperCase())}</code></button>`).join("")}</div>
  <p class="ldp-aa ${aa ? "ok" : "no"}">Primary on Background: ${ratio.toFixed(1)}:1, AA ${aa ? "✓" : "✗"}</p>

  <h3 class="ldp-sub">Typography</h3>
  <div class="ldp-specimen">
    <div class="ldp-spec-name" style="font-family:${esc(fontStack(f.display))};color:${c.ink}">${esc(b.name)}</div>
    <p style="font-family:${esc(fontStack(f.body, "body"))}">${esc(para.trim())}</p>
    <p class="ldp-fonts"><span><b>${esc(f.display)}</b> for headlines</span><span><b>${esc(f.body)}</b> for text</span></p>
  </div>

  <h3 class="ldp-sub">Voice</h3>
  <dl class="ldp-dl"><dt>Traits</dt><dd>${esc((nova.voice.traits ?? []).join(", "))}</dd><dt>How to write</dt><dd>${esc(nova.voice.rules)}</dd><dt>Sounds like</dt><dd>“${esc(nova.voice.sample)}”</dd></dl>

  <h3 class="ldp-sub">In use</h3>
  <div class="ldp-inuse">
    <div class="ldp-stage">${productMockup(b.logo, pal, b.name, f)}</div>
    <div class="ldp-stage ig"><div class="ldp-scale">${profileMockup(b.logo, pal, b.name, handle, b.tagline, hooks, f)}</div></div>
  </div>

  ${logos.length > 1 ? `<h3 class="ldp-sub">Logo options</h3>
  <div class="ldp-options">${logos.map((l, i) => `<div class="ldp-opt${i === 0 ? " rec" : ""}"><div class="pv" style="background:${c.bg}">${renderWordmark(l, pal, b.name, 24, f, { color: c.ink })}</div><p>${i === 0 ? "<b>Recommended.</b> " : ""}${esc(l.concept)}</p></div>`).join("")}</div>` : ""}
  ${others.length ? `<h3 class="ldp-sub">Other names</h3>
  <div class="ldp-options">${others.map(({ n }) => `<button class="ldp-opt" type="button" data-copy="${esc(n.name)}" data-label="Copied"><div class="pv" style="background:${esc(n.palette?.[2]?.hex ?? "#fff")};color:${esc(n.palette?.[0]?.hex ?? "#1D1D1F")}"><span style="font-family:${esc(fontStack(f.display))};font-size:24px;font-weight:600">${esc(n.name)}</span></div><p><b>${esc(n.tagline)}</b> ${esc(n.why)}</p><span class="pal">${(n.palette ?? []).slice(0, 4).map((s) => `<i style="background:${esc(s.hex)}"></i>`).join("")}</span></button>`).join("")}</div>` : ""}`;
}

// ---------- Website (R21, F11) ----------

function liveUrl(p: Project, ctx: RenderCtx): { href: string; full: string; shown: string } {
  const pip = p.results.pip;
  const origin = ctx.origin ?? (typeof location !== "undefined" ? location.origin : "");
  const path = pip ? (/^https?:\/\//.test(pip.url) ? pip.url : `/s/${pip.slug}`) : "";
  const full = /^https?:\/\//.test(path) ? path : `${origin}${path}`;
  return { href: path, full, shown: full.replace(/^https?:\/\//, "") };
}

export function secWebsite(p: Project, ctx: RenderCtx): string {
  const data = siteDataOf(p, ctx);
  if (!data) return sectionHead("Website", by("pip")) + notReady(p, "website", ctx);
  const pip = p.results.pip;
  const url = liveUrl(p, ctx);
  const usdv = Number(data.landing.price_hint_usd) || 0;
  const amount = bchAmount(usdv, data.bchUsd);
  const addr = data.founderAddress;
  const head = pip
    ? `<p class="ldp-liveline"><span class="ok"></span>Live at <a href="${esc(url.href)}" target="_blank" rel="noopener">${esc(url.shown)}</a>${copyBtn(url.full, "Copy link")}${ctx.doc ? "" : `<a class="ldp-iconbtn" href="${esc(url.href)}" target="_blank" rel="noopener" aria-label="Open your site" title="Open">${ICON.ext}</a>`}</p>`
    : `<p class="ldp-liveline"><span></span>Not live yet. Pip publishes it after Rae.</p>`;
  const markup = landingMarkup(data, { homeHref: "/" });
  const previews = ctx.doc
    ? ""
    : `<div class="ldp-previews">
        <div class="ldp-browser"><div class="bar"><i></i><i></i><i></i><span>${esc(url.shown || "your-page")}</span></div><div class="ldp-fit" data-fit="1280"><div class="ldp-real desk" data-desk>${markup}</div></div></div>
        <div class="ldp-phone"><div class="ldp-fit" data-fit="390" data-phone-host><div class="ldp-real phone" data-phone>${markup}</div></div></div>
      </div>`;
  const qr = ctx.demo
    ? `<p class="ldp-meta">Sample run: this is a demo page, so pre-orders are switched off. On a paid run the QR pays your own wallet.</p>`
    : addr
    ? `<div class="ldp-qrrow"><div class="qr">${qrSvg(paymentUri(addr, amount), { size: 112, badge: `<circle cx="50" cy="50" r="50" fill="#fff"/><g transform="translate(8 8) scale(.84)">${BCH_BADGE}</g>` })}</div>
        <div><p>This QR goes straight to your wallet. LaunchDesk never holds your customers' money.</p><code>${esc(addr)}</code>${usdv ? `<p class="mu">Pre-order price $${usdv.toFixed(2)}${amount ? `, about ${amount} BCH today` : ""}.</p>` : ""}</div></div>`
    : ctx.loading ? `<p class="ldp-meta">Loading your payment details…</p>` : "";
  return `${sectionHead("Website", by("pip"))}
  ${head}
  ${previews}
  <dl class="ldp-dl">
    <dt>Headline</dt><dd>${esc(data.landing.headline)}</dd>
    <dt>Offer</dt><dd>${esc(data.landing.offer)}</dd>
    <dt>Button</dt><dd>${esc(data.landing.cta)}</dd>
    ${data.where_when ? `<dt>Where and when</dt><dd>${esc(data.where_when)}</dd>` : ""}
  </dl>
  ${pip && !ctx.doc ? `<div data-preorders>${preordersHtml(ctx.preorders, data.currency)}</div>` : ""}
  ${qr}`;
}

/** F11: pre-orders paid on-chain since launch. `null` = couldn't check: show nothing. */
export function preordersHtml(po: Preorders | null | undefined, _cur = "€"): string {
  if (!po) return "";
  return `<h3 class="ldp-sub">Pre-orders</h3><p class="ldp-meta">Payments to your address since launch, on-chain</p>
  ${po.count ? `<table class="ldp-table"><tbody>${po.txs.map((t) => `<tr><td class="mu">${t.at ? esc(dGB(new Date(t.at), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) : "Unconfirmed"}</td><td class="r">${sats(t.sats)} sats</td><td class="r"><a class="ldp-tx" href="${esc(explorerTx(t.txid))}" target="_blank" rel="noopener">${esc(t.txid.slice(0, 8))}…${ICON.ext}</a></td></tr>`).join("")}
  <tr class="tot"><th>${po.count} pre-order${po.count === 1 ? "" : "s"}</th><td class="r"><b>${sats(po.sats)} sats</b></td><td></td></tr></tbody></table>` : `<p class="ldp-p">0 pre-orders so far.</p>`}`;
}

// ---------- Launch (R20) ----------

export function secLaunch(p: Project, ctx: RenderCtx): string {
  const rae = p.results.rae;
  if (!rae) return sectionHead("Launch", by("rae")) + notReady(p, "launch", ctx);
  const b = brandOf(p);
  const pal = b.option?.palette ?? [];
  const c = brandColors(pal);
  const start = parseDay(rae.start_date);
  const at = (day: number) => new Date(start.getTime() + (day - 1) * 86_400_000);
  const posts = [...(rae.posts ?? [])].sort((a, z) => a.day - z.day);
  const launchFp = (rae.first_posts ?? []).find((x) => /launch|open/i.test(x.kind));
  const launchDay = launchFp ? Math.round((parseDay(launchFp.date).getTime() - start.getTime()) / 86_400_000) + 1 : null;
  const meta = posts.length ? `${posts.length} posts from ${dGB(start, { weekday: "short", day: "numeric", month: "short" })}` : "No posts planned";
  // list, grouped by 7-day weeks from the start date
  const weeks = new Map<number, typeof posts>();
  for (const x of posts) {
    const w = Math.floor((x.day - 1) / 7);
    if (!weeks.has(w)) weeks.set(w, []);
    weeks.get(w)!.push(x);
  }
  const range = (w: number) => {
    const a = at(w * 7 + 1), z = at(Math.min(30, w * 7 + 7));
    const sameMonth = a.getUTCMonth() === z.getUTCMonth();
    return `${a.getUTCDate()}${sameMonth ? "" : " " + dGB(a, { month: "short" })}–${dGB(z, { day: "numeric", month: "short" })}`;
  };
  const list = [...weeks.entries()].map(([w, xs]) => `<div class="ldp-lweek"><h3 class="ldp-weekh">Week ${w + 1} <span>${range(w)}</span></h3>${xs.map((x) => {
    const full = `${x.hook}\n\n${x.caption}${x.cta ? `\n\n${x.cta}` : ""}`;
    return `<details class="ldp-post"><summary><span class="d">${esc(dGB(at(x.day), { weekday: "short", day: "numeric" }))}</span><span class="g" title="${esc(CHANNEL_NAME[x.channel] ?? x.channel)}">${CHANNEL_GLYPH[x.channel] ?? ""}</span><span class="h">${esc(x.hook)}</span><span class="t">${esc(x.time)}</span>${ctx.doc ? "" : copyBtn(full, "Copy post")}</summary><div class="body"><p>${esc(x.caption)}</p>${x.cta ? `<p class="cta">${esc(x.cta)}</p>` : ""}<p class="mu">${esc(CHANNEL_NAME[x.channel] ?? x.channel)}, ${esc(x.format)}</p></div></details>`;
  }).join("")}</div>`).join("");
  // calendar (P1): borderless month grid, posts as 6px dots
  const dow = (start.getUTCDay() + 6) % 7;
  const byDay = new Map(posts.map((x) => [x.day, x]));
  const cells: string[] = [];
  for (let i = 0; i < dow; i++) cells.push(`<span></span>`);
  for (let d = 1; d <= 30; d++) {
    const x = byDay.get(d);
    const isLaunch = launchDay === d;
    const date = at(d);
    cells.push(`<span class="${x ? "has" : ""}${isLaunch ? " launch" : ""}" title="${x ? esc(`${CHANNEL_NAME[x.channel]}: ${x.hook}`) : ""}"><em>${date.getUTCDate() === 1 || d === 1 ? dGB(date, { day: "numeric", month: "short" }) : date.getUTCDate()}</em>${x ? `<i style="background:${isLaunch ? "#0AC18E" : CHANNEL_GREY[x.channel] ?? "#6E6E73"}"></i>` : ""}${isLaunch ? `<b>Launch</b>` : ""}</span>`);
  }
  const cal = `<div class="ldp-cal"><div class="dow">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<span>${d}</span>`).join("")}</div><div class="grid">${cells.join("")}</div></div>`;
  const fp = (rae.first_posts ?? []).slice(0, 3);
  const cards = fp.length ? `<h3 class="ldp-sub">First 3 posts</h3><div class="ldp-firstposts">${fp.map((x) => {
    const when = new Date(x.date);
    const ok = !Number.isNaN(when.getTime());
    return `<article class="ldp-fp"><div class="art" style="background:${c.bg};color:${c.ink}"><small>${esc(x.kind)}</small><h4 style="font-family:${esc(fontStack(b.fonts.display))}">${esc(x.title)}</h4><span class="lg">${renderMark(b.logo, pal, b.name, 28, b.fonts)}</span></div>
      <div class="meta"><span>${ok ? esc(dGB(when, { weekday: "short", day: "numeric", month: "short" })) + ", " + esc(x.date.slice(11, 16)) : ""}</span><span>${esc(CHANNEL_NAME[x.channel] ?? x.channel)}</span></div>
      <p>${esc(x.text)}</p>${ctx.doc ? "" : `<button class="ldp-btn sm" type="button" data-copy="${esc(x.text)}" data-label="Copy">Copy</button>`}</article>`;
  }).join("")}</div>` : "";
  if (p.models.rae === "skipped") return `${sectionHead("Launch", by("rae"))}<div class="ldp-pending"><i></i>Rae was skipped, so there is no launch plan yet.</div>`;
  return `${sectionHead("Launch", by("rae") + `<p class="ldp-meta">${esc(meta)}${rae.handle ? `, as ${esc(rae.handle)}` : ""}</p>`)}
  ${ctx.doc || !posts.length ? "" : `<div class="ldp-seg" role="tablist" aria-label="Launch view"><button type="button" role="tab" aria-selected="true" data-view="list">List</button><button type="button" role="tab" aria-selected="false" data-view="cal">Calendar</button><span class="ind"></span></div>`}
  <div class="ldp-launchviews" data-launch="list"><div class="v-list">${list}</div>${ctx.doc ? "" : `<div class="v-cal">${cal}</div>`}</div>
  ${cards}`;
}

// ---------- Receipt (R22) ----------

const STAGE_DEPTS: Record<Stage, WorkDept[]> = { validate: ["mia", "leo", "sam"], build: ["nova", "dex", "rae", "pip"] };
const LIST_CENTS: Record<Stage, number> = { validate: 10, build: 20 };

function dur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 90 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}
const modelLabel = (m: string | undefined) => (m === "mock" ? "Sample data" : m === "none" ? "No AI" : m === "skipped" ? "Skipped" : m ?? "");
/** "LD-7K2Q9M": a readable receipt number from the project id (no 0/O or 1/I/L to confuse). */
export function receiptNo(id: string): string {
  const A = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += A[h % A.length];
    h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
  }
  return `LD-${out}`;
}
/** Whole percentages that add up to exactly 100 (largest remainder). */
function pct100(ws: number[]): number[] {
  const tot = ws.reduce((t, x) => t + x, 0) || 1;
  const raw = ws.map((w) => (w / tot) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((t, x) => t + x, 0);
  raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f).forEach(({ i }) => {
    if (left > 0) (out[i]! += 1), left--;
  });
  return out;
}

export function secReceipt(p: Project, ctx: RenderCtx): string {
  const stages: Stage[] = ["validate", "build"];
  const paid = stages.filter((s) => p.payments[s]);
  const real = paid.filter((s) => !isDev(p.payments[s]!.txid));
  const sample = paid.length > 0 && real.length === 0;
  const cents = real.reduce((t, s) => t + p.payments[s]!.cents, 0);
  const satsTot = real.reduce((t, s) => t + p.payments[s]!.sats, 0);
  const lead = !paid.length
    ? `<p class="ldp-meta">Nothing paid yet.</p>`
    : sample
      ? `<div class="ldp-total"><span class="sampledot"></span><div><b class="sm">Sample run · nothing was charged</b><span>List price ${usd(paid.reduce((t, s) => t + LIST_CENTS[s], 0))}</span></div></div>`
      : `<div class="ldp-total"><div><small>Total</small><b>${usd(cents)}</b><span>${sats(satsTot)} sats at the quoted rate</span></div></div>`;
  const rows = paid.map((s, i) => {
    const pay = p.payments[s]!;
    const dev = isDev(pay.txid);
    const rate = !dev && pay.sats > 0 ? (pay.cents / 100) / (pay.sats / 1e8) : 0;
    const date = dGB(new Date(pay.at), { day: "numeric", month: "short", year: "numeric" });
    return `<div class="ldp-rrow">
      <div class="top"><b>${dev ? "Sample run, no receipt" : `Receipt <span class="rno">${receiptNo(p.id)}-${i + 1}</span>`}</b><span>${s === "validate" ? "Validate" : "Build"}, ${esc(date)}</span><span class="amt">${dev ? `<span class="nc">${usd(LIST_CENTS[s])} · Not charged</span>` : usd(pay.cents)}</span></div>
      ${dev ? "" : `<div class="det"><span>${sats(pay.sats)} sats</span>${rate ? `<span>1 BCH ≈ $${rate.toFixed(2)}</span>` : ""}<span class="tx"><a href="${esc(explorerTx(pay.txid))}" target="_blank" rel="noopener"><code>${esc(pay.txid.slice(0, 8))}…${esc(pay.txid.slice(-8))}</code>${ICON.ext}</a>${ctx.doc ? "" : copyBtn(pay.txid, "Copy transaction id")}</span></div>`}
    </div>`;
  }).join("");
  // How the team split it: each stage's budget in equal shares to its departments (internal, not on-chain)
  const parts = paid.flatMap((s) => STAGE_DEPTS[s].map((d) => ({ d, w: (p.payments[s]!.cents || LIST_CENTS[s]) / STAGE_DEPTS[s].length })));
  const pcts = pct100(parts.map((x) => x.w));
  const listCents = paid.reduce((t, s) => t + (p.payments[s]!.cents || LIST_CENTS[s]), 0);
  const split = parts.length ? `<h3 class="ldp-sub">${sample ? `How a paid ${usd(listCents)} would be split` : "How the team split it"}</h3>
    <div class="ldp-split" role="img" aria-label="Budget split between departments">${parts.map((x) => `<i style="flex:${x.w};background:var(--d-${x.d}, ${DEPT[x.d].color})"></i>`).join("")}</div>
    <div class="ldp-splitlab">${parts.map((x, i) => `<span style="flex:${x.w}">${DEPT[x.d].name}<small>${pcts[i]}%</small></span>`).join("")}</div>
    <p class="ldp-meta">${sample ? "Sample, nothing moved" : "Internal, not on-chain"}</p>` : "";
  const times = stages.filter((s) => p.timings[s]?.finished).map((s) => `<dt>${s === "validate" ? "Validate" : "Build"}</dt><dd>${dur(p.timings[s]!.finished! - p.timings[s]!.started)}</dd>`).join("");
  const byModel = new Map<string, string[]>();
  for (const d of ["mia", "leo", "sam", "nova", "dex", "rae", "pip"] as WorkDept[]) {
    if (!p.models[d]) continue;
    const k = modelLabel(p.models[d]);
    byModel.set(k, [...(byModel.get(k) ?? []), DEPT[d].name]);
  }
  const and = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const models = [...byModel.entries()].map(([m, who]) => `<dt>${esc(m)}</dt><dd>${esc(and(who))}</dd>`).join("");
  return `${sectionHead("Receipt")}
  ${lead}
  ${rows ? `<div class="ldp-rrows">${rows}</div>` : ""}
  ${split}
  ${times ? `<h3 class="ldp-sub">Time per stage</h3><dl class="ldp-dl">${times}</dl>` : ""}
  ${models ? `<h3 class="ldp-sub">Models</h3><dl class="ldp-dl">${models}</dl>` : ""}
  <p class="ldp-meta">Only stage payments are on-chain. AI output is guidance, not financial or legal advice.</p>
  ${ctx.doc ? "" : `<button class="ldp-btn" type="button" data-print>Print receipt</button>`}`;
}

export function renderSection(p: Project, id: PackSection, ctx: RenderCtx = {}): string {
  switch (id) {
    case "summary": return secSummary(p, ctx);
    case "market": return secMarket(p, ctx);
    case "plan": return secPlan(p, ctx);
    case "numbers": return secNumbers(p, ctx);
    case "brand": return secBrand(p, ctx);
    case "website": return secWebsite(p, ctx);
    case "launch": return secLaunch(p, ctx);
    case "receipt": return secReceipt(p, ctx);
  }
}

/** The whole document: every section in order (locked ones as a short teaser). */
/** Stage-1 pack: the whole Build group as one locked block (previews from Stage 1 data, one button). */
function buildBlock(p: Project, ctx: RenderCtx): string {
  const price = usd(ctx.buildCents ?? 20);
  const title = (p.results.mia?.title ?? p.idea).split(/\s+/).slice(0, 2).join(" ");
  const headline = p.results.mia?.one_liner ?? p.results.leo?.headline ?? p.idea;
  const item = (cls: string, caption: string, art: string) =>
    `<figure class="lg-prev ${cls}"><div class="lg-prev-art"><div class="lg-blur" aria-hidden="true">${art}</div><span class="lg-lock" aria-hidden="true">${ICON.lock}</span></div><figcaption>${esc(caption)}</figcaption></figure>`;
  const cal = Array.from({ length: 30 }, (_, i) => `<i class="${[3, 8, 11, 16, 22, 27].includes(i) ? "on" : ""}"></i>`).join("");
  return `<header class="ldp-sh"><h2 id="ldp-h-brand">Brand, website and launch</h2><p class="ldp-meta">Nova, Dex, Rae and Pip build these for ${price}.</p></header>
  <div class="ldp-buildblk">
    <div class="lg-prevs">
      ${item("is-names", "3 names", `<span class="w1">${esc(title)}</span><span class="w2">${esc(title)}</span><span class="w3">${esc(title)}</span>`)}
      ${item("is-logos", "3 logos", "<i></i><i></i><i></i>")}
      ${item("is-page", "Live page with BCH pre\u2011orders", `<div class="lg-phone"><b>${esc(headline)}</b><span class="lg-phone-cta"></span></div>`)}
      ${item("is-cal", "30-day launch plan", `<div class="lg-cal">${cal}</div>`)}
    </div>
    ${ctx.readOnly || ctx.doc ? "" : `<button class="ldp-btn primary" type="button" data-build>Build it · ${price}</button><p class="ldp-keep">You keep everything from Stage 1 either way.</p>`}
  </div>`;
}

export function renderDocument(p: Project, ctx: RenderCtx = {}): string {
  const group: PackSection[] = ["brand", "website", "launch"];
  const allLocked = !ctx.doc && group.every((id) => sectionState(p, id) === "locked");
  if (allLocked)
    return SECTIONS.map((s) =>
      s.id === "brand"
        ? `<section class="ldp-s" id="ldp-s-brand" data-section="brand" aria-labelledby="ldp-h-brand">${buildBlock(p, ctx)}</section>`
        : group.includes(s.id)
          ? `<section class="ldp-s ldp-s-alias" id="ldp-s-${s.id}" data-section="${s.id}" data-alias="brand" aria-hidden="true"></section>`
          : `<section class="ldp-s" id="ldp-s-${s.id}" data-section="${s.id}" aria-labelledby="ldp-h-${s.id}">${renderSection(p, s.id, ctx).replace("<header class=\"ldp-sh\"><h2>", `<header class="ldp-sh"><h2 id="ldp-h-${s.id}">`)}</section>`,
    ).join("");
  return SECTIONS.map((s) => `<section class="ldp-s" id="ldp-s-${s.id}" data-section="${s.id}" aria-labelledby="ldp-h-${s.id}">${renderSection(p, s.id, ctx).replace("<header class=\"ldp-sh\"><h2>", `<header class="ldp-sh"><h2 id="ldp-h-${s.id}">`)}</section>`).join("");
}

/** v3 entry point (single tab). */
export const renderTab = (p: Project, id: PackSection, ctx: RenderCtx = {}) => renderSection(p, id, ctx);
