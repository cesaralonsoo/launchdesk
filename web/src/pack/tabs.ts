// Tab renderers for the startup pack. Pure functions: Project in, HTML string out (also used for the download).
import type { DexDesign, DeptStatus, NovaBrand, Project, SiteData, Stage, WorkDept } from "../types";
import { explorerTx } from "../explorer";
import { landingMarkup } from "../site/landing";
import { BCH_BADGE, bchAmount, bchMark, paymentUri, qrSvg } from "../site/qr";
import { positioningMap, projectionChart, scoreRing } from "./charts";
import { renderIcon, renderLogoTile } from "./logo";
import { businessCard, heroScene, socialProfile } from "./mockups";
import { brandColors, esc, fmtDate, mix, parseDay, sats, usd } from "./util";

export type TabId = "opportunity" | "plan" | "model" | "brand" | "landing" | "launch" | "receipt";

export const DEPT: Record<WorkDept | "lobby", { name: string; role: string; color: string }> = {
  lobby: { name: "Lobby", role: "Intake", color: "#0AC18E" },
  mia: { name: "Mia", role: "Chief of Staff", color: "#8B7CF6" },
  leo: { name: "Leo", role: "Market Research", color: "#3B82F6" },
  sam: { name: "Sam", role: "Strategy & Finance", color: "#F59E0B" },
  nova: { name: "Nova", role: "Brand", color: "#EC4899" },
  dex: { name: "Dex", role: "Design & Product", color: "#F97362" },
  rae: { name: "Rae", role: "Marketing & Content", color: "#14B8A6" },
  pip: { name: "Pip", role: "Launch Pad", color: "#94A3B8" },
};

export const TABS: Array<{ id: TabId; label: string; color: string; dept: WorkDept | null; stage: Stage | null; what: string }> = [
  { id: "opportunity", label: "Opportunity", color: "#3B82F6", dept: "leo", stage: "validate", what: "the opportunity score" },
  { id: "plan", label: "Plan", color: "#8B7CF6", dept: "mia", stage: "validate", what: "the brief and 4-week plan" },
  { id: "model", label: "Business model", color: "#F59E0B", dept: "sam", stage: "validate", what: "the business model and numbers" },
  { id: "brand", label: "Brand", color: "#EC4899", dept: "nova", stage: "build", what: "the name and identity" },
  { id: "landing", label: "Landing page", color: "#F97362", dept: "dex", stage: "build", what: "the landing page" },
  { id: "launch", label: "Launch", color: "#14B8A6", dept: "rae", stage: "build", what: "the 30-day launch plan" },
  { id: "receipt", label: "Receipt", color: "#0AC18E", dept: null, stage: null, what: "the receipt" },
];



const ICON = {
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>`,
  lock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>`,
  ext: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`,
  arrow: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  swap: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>`,
  shield: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12 2.2 2.2 4.4-4.4"/></svg>`,
  clock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
};
export { ICON };

// ---------- shared ----------

export function brandOf(p: Project): { name: string; tagline: string; option?: NovaBrand["names"][number]; logo?: DexDesign["logos"][number] } {
  const nova = p.results.nova;
  const opt = nova ? nova.names[nova.chosen] ?? nova.names[0] : undefined;
  const fallback = p.results.mia?.title || p.idea || "Your project";
  return { name: opt?.name || fallback, tagline: opt?.tagline || "", option: opt, logo: p.results.dex?.logos?.[0] };
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
    logo: b.logo ?? { concept: "", icon: "spark", shape: "emblem", monogram: b.name[0] || "A" },
    landing: dex.landing,
    founderAddress: extra.founderAddress ?? "",
    bchUsd: extra.bchUsd ?? 0,
  };
}

/** Whether a tab has its data; otherwise why not. */
export function tabState(p: Project, id: TabId): "ready" | "working" | "locked" | "queued" | "error" {
  const t = TABS.find((x) => x.id === id)!;
  if (!t.dept) return "ready";
  const has = id === "brand" ? !!p.results.nova : !!p.results[t.dept];
  if (has) return "ready";
  const st: DeptStatus | undefined = p.status[t.dept];
  if (st === "working") return "working";
  if (st === "error") return "error";
  if (t.stage && !p.payments[t.stage]) return "locked";
  return "queued";
}

function emptyState(p: Project, id: TabId): string {
  const t = TABS.find((x) => x.id === id)!;
  const st = tabState(p, id);
  const who = t.dept ? DEPT[t.dept] : DEPT.lobby;
  if (st === "locked") {
    return `<div class="ldp-empty" style="--c:${t.color}"><div>
      <div class="ic">${ICON.lock.replace(/13/g, "26")}</div>
      <h3>Unlocks with Stage 2: Build &amp; Launch</h3>
      <p>${esc(who.name)} (${esc(who.role)}) prepares ${esc(t.what)} once you approve Stage 2 for $0.20. Your Stage 1 report stays yours either way.</p>
    </div></div>`;
  }
  if (st === "error") {
    return `<div class="ldp-empty err"><div><div class="ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.2h.01"/></svg></div><h3>${esc(who.name)} hit a problem</h3><p>${esc(p.error || "This department could not finish. It will retry automatically.")}</p></div></div>`;
  }
  return `<div class="ldp-empty" style="--c:${t.color}"><div>
    <div class="ic">${renderIcon("spark", "#424245", 26)}</div>
    <h3>${esc(who.name)} is ${st === "working" ? "working on" : "about to start"} ${esc(t.what)}</h3>
    <p>This tab fills in by itself as soon as ${esc(who.name)} delivers.</p>
    <div class="ldp-dots"><i></i><i></i><i></i></div>
  </div></div>`;
}

const meter = (v: number, c: string) => `<span class="ldp-meter" style="--c:${c}">${Array.from({ length: 5 }, (_, i) => `<i class="${v / 2 > i + 0.25 ? "on" : ""}"></i>`).join("")}</span>`;

// ---------- Opportunity ----------

function splitFact(f: string): { big: string; rest: string } {
  const m = /^\s*((?:~|≈|c\.\s?)?[€$£]?\d[\d.,]*(?:\s?[–-]\s?[€$£]?\d[\d.,]*)?\s?(?:%|k|m|bn|x)?)(?=\s|$)\s*(?:of\s)?(.*)$/i.exec(f);
  if (m && m[2] && m[1].length <= 12) return { big: m[1].trim(), rest: (/^of\s/i.test(f.slice(m[1].length).trim()) ? "of " : "") + m[2] };
  return { big: "", rest: f };
}

export function tabOpportunity(p: Project): string {
  const leo = p.results.leo;
  if (!leo) return emptyState(p, "opportunity");
  const signals = (leo.signals || []).slice(0, 5);
  const facts = leo.market_facts || [];
  const anySourced = facts.some((f) => !f.is_estimate && f.source);
  const comps = leo.competitors || [];
  return `
  <div class="ldp-grid2">
    <div class="ldp-col">
      <div class="ldp-card ldp-score">
        ${scoreRing(leo.score, leo.verdict, 112)}
        <div>
          <div class="ldp-label" style="margin-bottom:4px">Opportunity score</div>
          <div class="ldp-dim" style="font-size:12px;margin-bottom:10px">${signals.length} signals scored by Leo</div>
          <div class="ldp-bars">${signals.map((s, i) => `<div class="ldp-bar"><span>${esc(s.name)}</span><div class="t"><i style="width:${Math.max(2, Math.min(100, s.score * 10))}%;animation-delay:${i * 70}ms"></i></div><b>${Number(s.score).toFixed(1)}</b></div>`).join("")}</div>
        </div>
      </div>
      <div class="ldp-card" style="padding:14px 16px">
        <div class="ldp-verdict" style="margin-top:0!important"><span class="ldp-vpill ${esc(leo.verdict)}">${leo.verdict === "no-go" ? "No-go" : esc(leo.verdict)}</span><h3>${esc(leo.headline)}</h3></div>
        <p class="ldp-summary">${esc(leo.summary)}</p>
      </div>
      <div class="ldp-callout"><h4>Why go</h4><p>${esc(leo.why_go)}</p></div>
      <div class="ldp-callout bad"><h4>Risks</h4>${(leo.risks || []).length > 1 ? `<ul>${leo.risks.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : `<p>${esc(leo.risks?.[0] ?? "")}</p>`}</div>
      <div class="ldp-callout"><h4>Next step</h4><p>${esc(leo.next_step)}</p></div>
      ${facts.length ? `<div class="ldp-sec" style="margin-top:8px">
        <div class="ldp-label">Key market data ${anySourced ? `<span class="ldp-badge green">With sources</span>` : ""}<span class="ldp-badge grey">Estimates labelled</span></div>
        <div class="ldp-facts">${facts.map((f) => {
          const { big, rest } = splitFact(f.fact);
          return `<div class="ldp-fact">${big ? `<span class="big">${esc(big)}</span>` : `<span class="big dot"></span>`}<div><p>${esc(big ? rest : f.fact)}</p>
            <small>${f.is_estimate ? `<span class="ldp-badge">Estimate</span>` : `<span class="ldp-badge green">Source</span>`}${esc(f.source || (f.is_estimate ? "Leo's estimate" : ""))}</small></div></div>`;
        }).join("")}</div>
      </div>` : ""}
    </div>
    <div class="ldp-col">
      <div>
        <div class="ldp-label">Positioning map <span class="sp"></span><span class="ldp-badge grey">Price vs. differentiation</span></div>
        ${positioningMap(leo)}
      </div>
      <div>
        <div class="ldp-label" style="margin-top:6px">Competitors <span class="ldp-badge">${comps.length} found</span></div>
        <div class="ldp-card flush"><table class="ldp-table">
          <thead><tr><th>#</th><th>Competitor</th><th>Weakness</th><th class="r hide-sm">Price</th><th class="r hide-sm">Diff.</th></tr></thead>
          <tbody>${comps.map((c, i) => `<tr><td class="n">${i + 1}</td><td><b>${esc(c.name)}</b></td><td class="ldp-muted">${esc(c.note)}</td><td class="r hide-sm">${meter(c.price, "#1D1D1F")}</td><td class="r hide-sm">${meter(c.differentiation, "#1D1D1F")}</td></tr>`).join("")}
          <tr class="you"><td class="n"></td><td><b>You</b></td><td class="ldp-muted">${esc(leo.headline)}</td><td class="r hide-sm">${meter(leo.you?.price ?? 5, "#1D1D1F")}</td><td class="r hide-sm">${meter(leo.you?.differentiation ?? 5, "#0AC18E")}</td></tr>
          </tbody></table></div>
      </div>
    </div>
  </div>`;
}

// ---------- Plan ----------

const ORDER: WorkDept[] = ["mia", "leo", "sam", "nova", "dex", "rae", "pip"];
const AGENDA: Array<{ d: WorkDept | "you"; t: string }> = [
  { d: "mia", t: "Brief & plan" }, { d: "leo", t: "Market & score" }, { d: "sam", t: "Business model" },
  { d: "you", t: "Go / no-go" }, { d: "nova", t: "Name & identity" }, { d: "dex", t: "Logo & landing" },
  { d: "rae", t: "30-day launch" }, { d: "pip", t: "Go live" },
];

function statusPill(p: Project, d: WorkDept | "you"): string {
  if (d === "you") {
    if (p.payments.build) return `<span class="ldp-status done">${ICON.check}Approved</span>`;
    if (p.results.sam) return `<span class="ldp-status you">Waiting for you</span>`;
    return `<span class="ldp-status">Scheduled</span>`;
  }
  const s = p.status[d];
  if (s === "done") return `<span class="ldp-status done">${ICON.check}Done</span>`;
  if (s === "working") return `<span class="ldp-status working">Working</span>`;
  if (s === "error") return `<span class="ldp-status error">Error</span>`;
  const stage: Stage = ["mia", "leo", "sam"].includes(d) ? "validate" : "build";
  return `<span class="ldp-status">${p.payments[stage] ? "Queued" : "Scheduled"}</span>`;
}

export function tabPlan(p: Project): string {
  const mia = p.results.mia;
  if (!mia) return emptyState(p, "plan");
  const cells = (d: WorkDept, w: number) => mia.weeks.filter((x) => x.dept === d && Number(x.week) === w).map((x) => `<span class="ldp-task" style="--c:${DEPT[d].color}">${esc(x.task)}</span>`).join("");
  let grid = `<div class="h">Department</div>${[1, 2, 3, 4].map((w) => `<div class="h">Week ${w}</div>`).join("")}`;
  ORDER.forEach((d, i) => {
    const last = i === ORDER.length - 1 ? " last" : "";
    grid += `<div class="d${last}" style="--c:${DEPT[d].color}"><i></i><span>${DEPT[d].name}<br><small>${esc(DEPT[d].role)}</small></span></div>` +
      [1, 2, 3, 4].map((w) => `<div class="${last.trim()}">${cells(d, w)}</div>`).join("");
  });
  const tasks = mia.weeks.length;
  return `
  <div class="ldp-planhead">
    <div class="ldp-label" style="margin-bottom:4px">Project brief · by Mia, Chief of Staff</div>
    <h2>${esc(mia.title)}</h2>
    <p>${esc(mia.one_liner)}</p>
  </div>
  <div class="ldp-brief">
    <div class="ldp-card"><h4>Concept</h4><p>${esc(mia.brief.concept)}</p></div>
    <div class="ldp-card"><h4>For</h4><p>${esc(mia.brief.for)}</p></div>
    <div class="ldp-card"><h4>Goal</h4><p>${esc(mia.brief.goal)}</p></div>
  </div>
  <div class="ldp-grid-l ldp-sec">
    <div>
      <div class="ldp-label">4-week plan <span class="sp"></span><span class="ldp-dim" style="font-weight:400">${tasks} tasks · one row per department</span></div>
      <div class="ldp-weeks">${grid}</div>
    </div>
    <div>
      <div class="ldp-label">Today's run <span class="sp"></span><span class="ldp-dim" style="font-weight:400">Scheduled by Mia</span></div>
      <div class="ldp-card" style="padding:4px 6px">
        <div class="ldp-agenda">${AGENDA.map((a) => {
          const nm = a.d === "you" ? "You" : DEPT[a.d].name;
          return `<div class="ldp-arow"><span><b>${nm}</b> · ${esc(a.t)}</span>${statusPill(p, a.d)}</div>`;
        }).join("")}</div>
      </div>
      ${stageTimes(p)}
    </div>
  </div>`;
}

function dur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 90 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

function stageTimes(p: Project): string {
  const rows = (["validate", "build"] as Stage[]).filter((s) => p.timings[s]?.finished).map((s) => {
    const t = p.timings[s]!;
    return `<div><span>${ICON.clock}${s === "validate" ? "Stage 1 · Validate" : "Stage 2 · Build & Launch"}</span><b>Delivered in ${dur(t.finished! - t.started)}</b></div>`;
  });
  return rows.length ? `<div class="ldp-card ldp-kv" style="margin-top:10px;padding:6px 14px">${rows.join("")}</div>` : "";
}

/** Friendly names for the model ids in the receipt. */
const modelLabel = (m: string | undefined) => (m === "mock" ? "Sample data" : m === "none" ? "No AI · deploy only" : (m ?? ""));

// ---------- Business model ----------

export function tabModel(p: Project): string {
  const sam = p.results.sam;
  if (!sam) return emptyState(p, "model");
  const cv = sam.canvas;
  const box = (k: string, t: string, _c?: string) => `<div class="ldp-card"><h4>${k}</h4><p>${esc(t)}</p></div>`;
  const res = sam.year1.result || "";
  const neg = /^[−-]/.test(res.trim());
  return `
  <div class="ldp-canvas">
    ${box("Customer", cv.customer, "#7DA8FF")}${box("Value", cv.value, "#B4A8FF")}${box("Revenue", cv.revenue, "#3DDBA8")}
    ${box("Channels", cv.channels, "#F472B6")}${box("Costs", cv.costs, "#F0845C")}${box("Unit economics", cv.unit_economics, "#F5C542")}
  </div>
  <div class="ldp-grid-l ldp-sec" style="margin-top:14px">
    <div class="ldp-col">
      <div class="ldp-kpis">
        <div class="ldp-card ldp-kpi"><small>Recommended price</small><b>${esc(sam.price.value)}</b><span>${esc(sam.price.note)}</span></div>
        <div class="ldp-card ldp-kpi"><small>Start-up cost</small><b>${esc(sam.startup_cost.value)}</b><span>${esc(sam.startup_cost.note)}</span></div>
        <div class="ldp-card ldp-kpi"><small>Break-even</small><b>${sam.break_even.month > 0 ? `Month ${sam.break_even.month}` : "—"}</b><span>${esc(sam.break_even.note)}</span></div>
      </div>
      <div class="ldp-card" style="padding:0">
        <div class="ldp-legend" style="padding:16px 18px 0"><span style="--c:#0AC18E"><i></i>Monthly revenue</span><span><i class="dash"></i>Monthly costs</span><span class="sp"></span><span class="ldp-badge">Projection · estimate</span></div>
        ${projectionChart(sam)}
      </div>
    </div>
    <div class="ldp-col">
      <div class="ldp-card ldp-y1">
        <header><h3>Year 1 summary</h3><span class="ldp-badge grey">Projection</span></header>
        <div class="row"><span>Revenue</span><b>${esc(sam.year1.revenue)}</b></div>
        <div class="row"><span>Operating costs</span><b>${esc(sam.year1.costs)}</b></div>
        <div class="row"><span>Year-1 operating result<small>excl. start-up</small></span><b class="${neg ? "neg" : "pos"}">${esc(res)}</b></div>
        <div class="row"><span>Monthly profit by month 12</span><b class="pos">${esc(sam.year1.monthly_profit_m12)}</b></div>
        <div class="row"><span>Break-even</span><b>${sam.break_even.month > 0 ? `Month ${sam.break_even.month}` : "Not in year 1"}</b></div>
        <div class="row hl"><span>Payback of the ${esc(sam.startup_cost.value)} start-up</span><b>${esc(sam.year1.payback)}</b></div>
        <footer>${esc(sam.price.note)} · ${esc(sam.break_even.note)} · start-up covers ${esc(sam.startup_cost.note)}.</footer>
      </div>
      <div class="ldp-callout bad"><h4>Main risk</h4><p>${esc(sam.main_risk)}</p></div>
    </div>
  </div>`;
}

// ---------- Brand ----------

export function tabBrand(p: Project): string {
  const nova = p.results.nova;
  if (!nova) return emptyState(p, "brand");
  const b = brandOf(p);
  const pal = b.option?.palette ?? [];
  const dex = p.results.dex;
  const logos = dex?.logos ?? [];
  const logo = logos[0];
  const c = brandColors(pal);
  const handle = p.results.rae?.handle || "@" + b.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const shapeLabel = logo ? `Logo · ${logo.shape}` : "Logo coming from Dex";
  const roles = ["Primary", "Accent", "Background", "Extra"];
  const others = nova.names.map((n, i) => ({ n, i })).filter((x) => x.i !== nova.chosen);
  return `
  <div class="ldp-grid2">
    <div class="ldp-col" style="gap:18px">
      <div class="ldp-identity">
        <figure class="ldp-logofig">
          ${renderLogoTile(logo, pal, b.name, 132)}
          <figcaption class="ldp-label">${esc(shapeLabel)}</figcaption>
        </figure>
        <div>
          <div class="ldp-label" style="margin-bottom:4px">Name &amp; identity</div>
          <div class="ldp-bname">${esc(b.name)}</div>
          <div class="ldp-tagline">“${esc(b.tagline)}”</div>
          ${b.option?.why ? `<div class="ldp-label" style="margin:12px 0 0">Why this name</div><p class="ldp-why">${esc(b.option.why)}</p>` : ""}
        </div>
      </div>
      <div>
        <div class="ldp-label">Palette <span class="ldp-dim" style="font-weight:400">· click to copy hex</span></div>
        <div class="ldp-swatches">${pal.slice(0, 4).map((s, i) => `<button class="ldp-swatch" type="button" data-copy="${esc(s.hex)}" title="Copy ${esc(s.hex)}"><span class="chip" style="background:${esc(s.hex)}"></span><b>${esc(s.name || roles[i] || "")}</b><small>${esc(s.hex.toUpperCase())}</small></button>`).join("")}</div>
      </div>
      <div class="ldp-card ldp-type">
        <div class="ldp-label">Typography</div>
        <b>${esc(nova.typography.headline)} — headlines</b>
        <span>${esc(nova.typography.body)} — body text and buttons</span>
        <div class="specimen"><span class="aa" style="color:${esc(c.accent)}">Aa</span><span class="ab">${esc(p.results.dex?.landing.headline || b.tagline)}</span></div>
      </div>
      <div class="ldp-card ldp-voice">
        <div class="ldp-label">Brand voice</div>
        <div class="ldp-chips">${(nova.voice.traits || []).map((t) => `<span class="ldp-chipx">${esc(t)}</span>`).join("")}</div>
        <p>${esc(nova.voice.rules)}</p>
        <blockquote>“${esc(nova.voice.sample)}” <small>— ${esc(b.name)}</small></blockquote>
      </div>
    </div>
    <div class="ldp-col" style="gap:16px">
      <div>
        <div class="ldp-label">In use</div>
        <div class="ldp-scene">${heroScene(logo, pal, b.name, dex?.landing.headline || b.tagline)}</div>
      </div>
      <div>
        <div class="ldp-label">On brand colour and on light</div>
        <div class="ldp-onbg">
          <div style="background:${esc(c.primary)}">${renderLogoTile(logo, pal, b.name, 76)}</div>
          <div style="background:#F4F6F8">${renderLogoTile(logo, pal, b.name, 76)}</div>
        </div>
      </div>
      <div>
        <div class="ldp-label">Stationery &amp; social</div>
        <div class="ldp-merch"><div>${businessCard(logo, pal, b.name, b.tagline, handle)}</div><div>${socialProfile(logo, pal, b.name, handle)}</div></div>
      </div>
      <div>
        <div class="ldp-label">Other concepts</div>
        <div class="ldp-concepts">
          ${logos.slice(1).map((l) => `<div class="ldp-card ldp-concept">${renderLogoTile(l, pal, b.name, 58)}<div><b>${esc(l.shape[0].toUpperCase() + l.shape.slice(1))}</b><span>${esc(l.concept)}</span></div></div>`).join("")}
          ${others.map(({ n }) => `<div class="ldp-card ldp-altname"><b>${esc(n.name)}</b><span class="mini">${(n.palette || []).slice(0, 4).map((s) => `<i style="background:${esc(s.hex)}"></i>`).join("")}</span><span>“${esc(n.tagline)}” · ${esc(n.why)}</span></div>`).join("")}
        </div>
      </div>
    </div>
  </div>`;
}

// ---------- Landing ----------

export function tabLanding(p: Project, site: { founderAddress?: string; bchUsd?: number; origin?: string; loading?: boolean } = {}): string {
  const data = siteDataOf(p, site);
  if (!data) return emptyState(p, "landing");
  const pip = p.results.pip;
  const origin = site.origin ?? (typeof location !== "undefined" ? location.origin : "");
  const path = pip?.url || (pip ? `/s/${pip.slug}` : "");
  const full = path ? `${origin}${path}` : "";
  const shown = full.replace(/^https?:\/\//, "");
  const usdv = Number(data.landing.price_hint_usd) || 0;
  const amount = bchAmount(usdv, data.bchUsd);
  const addr = data.founderAddress;
  const live = pip
    ? `<div class="ldp-live"><span class="ok">${ICON.check}</span><div><b>Live today</b> <span class="ldp-muted">· Pre-orders open</span><a href="${esc(path)}" target="_blank" rel="noopener">${esc(shown)}</a></div><a class="ldp-btn sm" href="${esc(path)}" target="_blank" rel="noopener" data-nodoc>Open ${ICON.ext}</a></div>`
    : `<div class="ldp-live pending"><span class="ok">${ICON.clock}</span><div><b>Publishing…</b> <span class="ldp-muted">Pip is putting your page online.</span></div></div>`;
  const customer = addr
    ? `<div class="ldp-customer"><div class="qr">${qrSvg(paymentUri(addr, amount), { size: 132, badge: `<circle cx="50" cy="50" r="50" fill="#fff"/><g transform="translate(8 8) scale(.84)">${BCH_BADGE}</g>` })}</div>
        <div><h4>${bchMark(20)} Pay with BCH</h4>
        <p>${usdv ? `<b>$${usdv.toFixed(2)}</b>${amount ? ` ≈ ${amount} BCH` : ""} · ` : ""}This QR goes straight to <b>YOUR</b> wallet. LaunchDesk never holds your customers' money. No middleman, no card minimum.</p>
        <code>${esc(addr)}</code></div></div>`
    : `<div class="ldp-card" style="display:flex;gap:12px;align-items:center">${site.loading ? `<div class="ldp-dots" style="margin:0"><i></i><i></i><i></i></div><span class="ldp-muted">Loading your payment QR…</span>` : `<span class="ldp-muted">The payment QR uses the wallet you connected when you paid Stage 2. It appears here once the page is live.</span>`}</div>`;
  return `
  <div class="ldp-landing">
    <div class="ldp-phonecol">
      <div class="ldp-phone"><div class="ldp-screen" data-phone-host><div class="ldp-scroll"><div class="ldp-zoom-phone" data-phone>${landingMarkup(data, { homeHref: "/" })}</div></div></div></div>
      <div class="ldp-tryit" data-nodoc><b>Try it:</b>tap <strong>${esc(data.landing.cta || "Pre-order · Pay with BCH")}</strong> on the phone.</div>
    </div>
    <div class="ldp-col" style="gap:16px">
      ${live}
      <div>
        <div class="ldp-label">Desktop</div>
        <div class="ldp-browser"><div class="bar"><i></i><i></i><i></i><span>${ICON.shield.replace(/15/g, "11")}${esc(shown || "your-page.launchdesk")}</span></div>
          <div class="ldp-desk"><div class="ldp-zoom-desk" data-desk>${landingMarkup(data, { homeHref: "/" })}</div></div></div>
      </div>
      <div>
        <div class="ldp-label">What your customer sees after “Pay with BCH”</div>
        ${customer}
      </div>
      <div class="ldp-card ldp-pip">
        <h4>What Pip did</h4>
        <ul>
          <li>${ICON.check}<span>Published your page at <b style="color:var(--ink)">${esc(path || "/s/…")}</b>${pip?.live_at ? ` on ${esc(fmtDate(new Date(pip.live_at), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))} UTC` : ""}.</span></li>
          <li>${ICON.check}<span>Wired the “${esc(data.landing.cta)}” button to a BCH payment request to your wallet${usdv ? ` for $${usdv.toFixed(2)}` : ""}.</span></li>
          <li>${ICON.check}<span>Offer on the page: ${esc(data.landing.offer)}.</span></li>
        </ul>
      </div>
    </div>
  </div>`;
}

// ---------- Launch ----------

export const CHANNEL: Record<string, { label: string; color: string }> = {
  IG: { label: "Instagram", color: "#1D1D1F" },
  TT: { label: "TikTok", color: "#1D1D1F" },
  LI: { label: "LinkedIn", color: "#1D1D1F" },
  X: { label: "X", color: "#1D1D1F" },
  Mail: { label: "Email", color: "#1D1D1F" },
  ALL: { label: "All channels", color: "#1D1D1F" },
};
const ch = (k: string) => CHANNEL[k] ?? { label: k, color: "#1D1D1F" };

export function tabLaunch(p: Project): string {
  const rae = p.results.rae;
  if (!rae) return emptyState(p, "launch");
  const b = brandOf(p);
  const pal = b.option?.palette ?? [];
  const c = brandColors(pal);
  const start = parseDay(rae.start_date);
  const dow = (start.getUTCDay() + 6) % 7; // Monday = 0
  const byDay = new Map<number, typeof rae.posts>();
  for (const post of rae.posts || []) {
    const d = Math.round(post.day);
    if (d < 1 || d > 30) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(post);
  }
  const days: string[] = [];
  for (let i = 0; i < dow; i++) days.push(`<div class="ldp-day blank"></div>`);
  const list: string[] = [];
  let lastWeek = -1;
  for (let d = 1; d <= 30; d++) {
    const date = new Date(start.getTime() + (d - 1) * 86400000);
    const dn = date.getUTCDate();
    const showMonth = d === 1 || dn === 1;
    const posts = byDay.get(d) ?? [];
    const big = posts.some((x) => x.channel === "ALL");
    days.push(`<div class="ldp-day${big ? " big" : ""}"><span class="num">${dn}${showMonth ? ` <em>${fmtDate(date, { month: "short" })}</em>` : ""}</span>${posts.map((x) => `<span class="ldp-post" style="--c:${ch(x.channel).color}" title="${esc(ch(x.channel).label)} · ${esc(x.title)}"><b>${esc(x.channel)}</b><span>${esc(x.title)}</span></span>`).join("")}</div>`);
    const wk = Math.floor((d - 1 + dow) / 7);
    if (posts.length) {
      if (wk !== lastWeek) { list.push(`<div class="wk">Week ${wk + 1}</div>`); lastWeek = wk; }
      for (const x of posts) list.push(`<div class="it"><small>${fmtDate(date, { weekday: "short", day: "numeric" })}</small><span class="ldp-post" style="--c:${ch(x.channel).color}"><b>${esc(x.channel)}</b><span>${esc(x.title)}</span></span></div>`);
    }
  }
  const used = [...new Set((rae.posts || []).map((x) => x.channel))];
  const gradA = c.accent, gradB = c.primary;
  const fp = (rae.first_posts || []).slice(0, 3);
  return `
  <div class="ldp-label">30-day launch calendar <span class="ldp-badge">from ${esc(fmtDate(start, { weekday: "short", month: "short", day: "numeric" }))} · ${(rae.posts || []).length} posts</span><span class="sp"></span>
    <span class="ldp-chlegend">${used.map((k) => `<span><b>${esc(k)}</b>${esc(ch(k).label)}</span>`).join("")}</span></div>
  <div class="ldp-cal">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="dow">${d}</div>`).join("")}${days.join("")}</div>
  <div class="ldp-callist">${list.join("")}</div>
  <div class="ldp-sec">
    <div class="ldp-label">First 3 posts, ready to publish</div>
    <div class="ldp-posts">${fp.map((x, i) => {
      const when = new Date(x.date);
      const okDate = !Number.isNaN(when.getTime());
      const whenTxt = okDate ? `${fmtDate(when, { weekday: "short", month: "short", day: "numeric" })} · ${String(when.getUTCHours()).padStart(2, "0")}:${String(when.getUTCMinutes()).padStart(2, "0")}` : esc(x.date);
      return `<article class="ldp-postcard">
        <div class="ldp-postimg" style="background:${esc(i === 1 ? gradA : gradB)}">
          <span class="ic">${renderIcon(b.logo?.icon ?? "spark", "#ffffff", 92, i === 1 ? gradA : gradB)}</span>
          <small>${esc(x.kind)}</small><b>${esc(x.title)}</b>
        </div>
        <div class="ldp-postbody">
          <div class="who">${renderLogoTile(b.logo, pal, b.name, 22)}${esc(rae.handle)}</div>
          <div class="when">${whenTxt} · ${esc(ch(x.channel).label)}</div>
          <p>${esc(x.text)}</p>
          <div class="act"><span>Suggested slot</span><button class="ldp-copy" type="button" data-copy="${esc(x.text)}">Copy text</button></div>
        </div>
      </article>`;
    }).join("")}</div>
  </div>`;
}

// ---------- Receipt ----------

export function tabReceipt(p: Project, bchUsd = 0): string {
  const stages: Array<{ s: Stage; label: string; depts: WorkDept[] }> = [
    { s: "validate", label: "Stage 1 · Validate", depts: ["mia", "leo", "sam"] },
    { s: "build", label: "Stage 2 · Build & Launch", depts: ["nova", "dex", "rae", "pip"] },
  ];
  const paid = stages.filter((x) => p.payments[x.s]);
  const realPaid = paid.filter((x) => !p.payments[x.s]!.txid.startsWith("dev-"));
  const totalCents = realPaid.reduce((a, x) => a + (p.payments[x.s]!.cents || 0), 0);
  const totalSats = realPaid.reduce((a, x) => a + (p.payments[x.s]!.sats || 0), 0);
  const onchain = realPaid.length;
  const devOnly = paid.length > 0 && onchain === 0;
  const rows = paid.map((x) => {
    const pay = p.payments[x.s]!;
    const dev = pay.txid.startsWith("dev-");
    const tx = dev ? `<span class="ldp-badge grey">Local test · no payment</span>` : `<a class="ldp-tx" href="${esc(explorerTx(pay.txid))}" target="_blank" rel="noopener">${esc(pay.txid.slice(0, 8))}…${esc(pay.txid.slice(-6))} ${ICON.ext}</a>`;
    return `<tr><td><b>${x.label}</b><div class="ldp-dim" style="font-size:12px">${esc(fmtDate(new Date(pay.at), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))} UTC</div></td><td class="r">${dev ? `<span class="ldp-dim">$0.00</span>` : `<b>${usd(pay.cents)}</b>`}</td><td class="r mono hide-sm">${sats(pay.sats)} sats</td><td>${tx}</td></tr>`;
  }).join("");
  const unpaid = stages.filter((x) => !p.payments[x.s]).map((x) => `<tr><td><b class="ldp-dim">${x.label}</b></td><td class="r ldp-dim">—</td><td class="r hide-sm ldp-dim">—</td><td><span class="ldp-badge grey">Not purchased</span></td></tr>`).join("");
  const models = ORDER.filter((d) => p.models[d]).map((d) => `<div style="--c:${DEPT[d].color}"><span><i></i>${DEPT[d].name} · ${esc(DEPT[d].role)}</span><b>${esc(modelLabel(p.models[d]))}</b></div>`).join("");
  const times = (["validate", "build"] as Stage[]).filter((s) => p.timings[s]).map((s) => {
    const t = p.timings[s]!;
    return `<div><span>${ICON.clock}${s === "validate" ? "Stage 1 · Validate" : "Stage 2 · Build & Launch"}</span><b>${t.finished ? dur(t.finished - t.started) : "running…"}</b></div>`;
  }).join("");
  const flows = paid.map((x) => {
    const pay = p.payments[x.s]!;
    return `<div><span class="ic bch">${bchMark(16)}</span><span>You → LaunchDesk<small>${x.label} · ${pay.txid.startsWith("dev-") ? "local test" : "on-chain"}</small></span><b style="font-size:13px">${sats(pay.sats)} sats</b></div>` +
      `<div><span class="ic">${ICON.swap}</span><span>Lobby → ${x.depts.map((d) => DEPT[d].name).join(", ")}<small>Department budgets · internal · not on-chain</small></span><span class="ldp-badge grey">Internal</span></div>`;
  }).join("");
  return `
  <div class="ldp-rcpt">
    <div class="ldp-col">
      <div class="ldp-card ldp-total">
        <div><small>Total paid</small><b>${usd(totalCents)}</b><small>${devOnly ? "Local test · stages ran without payment" : `${sats(totalSats)} sats${bchUsd > 0 ? ` · 1 BCH ≈ $${bchUsd.toFixed(2)}` : ""}`}</small></div>
        <span class="ldp-badge green">${onchain} on-chain payment${onchain === 1 ? "" : "s"}</span>
      </div>
      <div><div class="ldp-label">Payments</div>
        <div class="ldp-card flush"><table class="ldp-table"><thead><tr><th>Stage</th><th class="r">Paid</th><th class="r hide-sm">Amount</th><th>Transaction</th></tr></thead><tbody>${rows}${unpaid}</tbody></table></div>
      </div>
      <div><div class="ldp-label">How the money moved</div><div class="ldp-flow">${flows || `<div><span class="ic">—</span><span class="ldp-muted">No payments yet.</span><span></span></div>`}</div></div>
    </div>
    <div class="ldp-col">
      ${times ? `<div><div class="ldp-label">Time per stage</div><div class="ldp-card ldp-kv" style="padding:4px 14px">${times}</div></div>` : ""}
      ${models ? `<div><div class="ldp-label">AI models used</div><div class="ldp-card ldp-kv" style="padding:4px 14px">${models}</div></div>` : ""}
      <div class="ldp-card" style="display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:18px;color:var(--muted)"><span style="color:var(--bch-ink);flex:none;margin-top:1px">${ICON.shield}</span><span>Only your stage payments are on-chain. Department budgets are internal bookkeeping and never shown as transactions. AI estimates are labelled as estimates.</span></div>
    </div>
  </div>`;
}

export function renderTab(p: Project, id: TabId, ctx: { founderAddress?: string; bchUsd?: number; origin?: string; loading?: boolean } = {}): string {
  switch (id) {
    case "opportunity": return tabOpportunity(p);
    case "plan": return tabPlan(p);
    case "model": return tabModel(p);
    case "brand": return tabBrand(p);
    case "landing": return tabLanding(p, ctx);
    case "launch": return tabLaunch(p);
    case "receipt": return tabReceipt(p, ctx.bchUsd);
  }
}
