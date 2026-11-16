// v6 · Result cards (WS-B). One grammar for every deliverable:
//   head (who) → ONE hero number or visual → one-line takeaway → 2–4 supporting facts (estimate / source badges)
//   → optional tabs with the full work → calm progress + Next.
// Every value comes from the View (a Project). Markup only: motion is CSS + countUp() + the tab height tween.
import { renderIcon } from "../../src/pack/logo";
import { brandLogoHtml, glyphOf, type LogoSpec } from "./brandmark";
import { BUILD_DEPTS, ROOM_META, VALIDATE_DEPTS, type Dept } from "../contracts";
import { esc } from "./dom";
import { I, avatar } from "./icons";
import { CHANNEL_LABEL, VERDICT_LABEL, fmtDate, money, type View } from "./view";

export type CardMode = "run" | "read";

// ───────────────────────────── shared atoms
export const num = (v: number, dec = 0, pre = "", suf = "", delay = 140) =>
  `<span class="n" data-count="${v}" data-dec="${dec}" data-pre="${esc(pre)}" data-suf="${esc(suf)}" data-delay="${delay}">${esc(pre)}${v.toFixed(dec)}${esc(suf)}</span>`;
/** Break-even pace in words people use: "186 a day", or "12 a month" when it is under one a day (slow, big-ticket sales). */
export function bePace(v: View): { n: number; dec: number; per: "day" | "month"; m12: number | null } {
  const S = v.sam!, X = v.sam6;
  const day = X?.be?.per_day ?? S.breakeven_units_per_day;
  const hr = X?.headroom;
  // a subscription break-even is a number of paying subscribers a month, never "3.1 a day"
  const monthly = /paying subscribers/.test(X?.be?.formula ?? "");
  if ((day >= 1 && !monthly) || !X?.be?.per_month) return { n: day, dec: day < 10 && day % 1 ? 1 : 0, per: "day", m12: hr ? hr.m12_per_day : null };
  const k = X.be.per_month / (day || 1);
  return { n: X.be.per_month, dec: 0, per: "month", m12: hr ? Math.round(hr.m12_per_day * k) : null };
}
export const est = (on = true) => (on ? `<span class="est" title="Estimate: an assumption, not a measured fact">Est.</span>` : "");
const src = (v: View, id: number | null) => {
  const s = id != null ? v.leo?.sources.find((x) => x.id === id) : null;
  return s ? `<a class="srcb" href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title)}">${esc(s.domain)}</a>` : "";
};
export const stackOf = (f: string, serif = /fraunces|serif|caslon|garamond|newsreader|playfair|lora|literata|gloock/i.test(f) && !/sans/i.test(f)) =>
  `'${f.replace(/'/g, "")}', ${serif ? "Georgia, serif" : "system-ui, sans-serif"}`;
const fact = (label: string, value: string, extra = "", sub = "") =>
  `<div class="fact"><dt>${esc(label)}${extra}</dt><dd>${value}</dd>${sub ? `<span class="f-sub">${esc(sub)}</span>` : ""}</div>`;

/** "Go" with no evidence behind it reads "Go · to test": the verdict and its confidence travel together. */
export function verdictText(v: View): string {
  const L = v.leo;
  if (!L) return "–";
  const low = v.leo6?.confidence?.level === "low";
  return L.verdict === "go" && low ? "Go · to test" : VERDICT_LABEL[L.verdict];
}
/** Payback in words: "around month 16" · "by month 9" · null when not within the model. */
export function cashBack(v: View): { month: number | null; words: string } {
  const S = v.sam!;
  const inYear = S.months.find((m) => m.cash >= 0)?.month ?? null;
  if (inYear != null) return { month: inYear, words: `by month ${inYear}` };
  const m = /month (\d+)/i.exec(S.year1.payback);
  return m ? { month: Number(m[1]), words: `around month ${m[1]}` } : { month: null, words: "not within the plan" };
}

const ROLE: Record<Dept, string> = { mia: "Plan", leo: "Market research", sam: "Money", nova: "Brand", dex: "Logo & site", rae: "Launch plan", pip: "Live site" };

function head(d: Dept, tabs: Array<[string, string]>): string {
  return `
  <header class="c-head" data-st>
    ${avatar(d, 30)}
    <div class="c-who"><b>${ROOM_META[d].name}</b><span>${ROLE[d]}</span></div>
    ${tabs.length > 1 ? `<div class="c-tabs" role="tablist">${tabs.map(([id, l], i) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${i === 0}">${esc(l)}</button>`).join("")}</div>` : ""}
  </header>`;
}

/** Progress for the stage (calm segments) + Next. */
function foot(d: Dept, mode: CardMode): string {
  if (mode === "read") return "";
  const list = VALIDATE_DEPTS.includes(d) ? VALIDATE_DEPTS : BUILD_DEPTS;
  const i = list.indexOf(d);
  const last = i === list.length - 1;
  const label = last ? (list === VALIDATE_DEPTS ? "See the verdict" : "See it live") : `Next · ${ROOM_META[list[i + 1]!].name}`;
  return `
  <footer class="c-foot" data-st>
    <div class="c-prog" aria-label="Step ${i + 1} of ${list.length}">
      <span class="pg">${list.map((x, j) => `<i data-s="${j < i ? "done" : j === i ? "now" : "todo"}" style="--room:${ROOM_META[x].color}"></i>`).join("")}</span>
      <span class="pg-l">${list === VALIDATE_DEPTS ? "Validate" : "Build"} · ${i + 1}/${list.length}</span>
    </div>
    <button class="btn btn-primary btn-next" data-act="next" type="button"><span>${esc(label)}</span>${I.arrow(16)}</button>
  </footer>`;
}

const pane = (id: string, html: string, first = false) => `<div class="c-pane" data-pane="${id}"${first ? "" : " hidden"}>${html}</div>`;

// ───────────────────────────── Mia · plan
function mia(v: View): { tabs: Array<[string, string]>; body: string } {
  const m = v.mia!;
  const week1 = v.weeks[0] ?? [];
  const helper = (h: Dept | null) => (h ? `<span class="t-help" title="Uses ${ROOM_META[h].name}'s work">${avatar(h, 18)}</span>` : "");
  const sum = `
    <div class="c-hero hero-row" data-st>
      ${v.gate
        ? `<div class="h-num"><b class="big">${num(v.gate.target)}</b><span>${esc(v.gate.metric)}<br/>by week ${v.gate.by_week}</span></div>`
        : `<div class="h-num"><b class="big">${num(v.tasks.length)}</b><span>tasks</span></div>`}
      <div class="h-meta"><span><b>${num(v.tasks.length)}</b> tasks · <b>${num(v.weeks.filter((w) => w.length).length)}</b> weeks</span><span><b>${num(v.hours)}</b> hours of your time</span></div>
    </div>
    <div class="wkline" data-st>${v.weeks.map((w, i) => `<div class="wk"><div class="wk-bar">${w.map((t) => `<i style="--h:${t.est_hours}"></i>`).join("")}</div><span>Week ${i + 1}</span></div>`).join("")}</div>
    <p class="c-take" data-st>${esc(m.brief.goal)}</p>
    <div class="c-sub" data-st><span class="lbl">Start this week</span></div>
    <ol class="tasks" data-st>${week1.slice(0, 3).map((t) => `<li><span class="t-txt"><b>${esc(t.task)}</b><em>Done when: ${esc(t.done_when)}</em></span>${helper(t.helped_by)}<span class="t-h">${t.est_hours} h</span></li>`).join("")}</ol>`;
  const all = `<div class="weeks-all">${v.weeks.map((w, i) => w.length ? `<section><h4>Week ${i + 1}<span>${w.reduce((a, t) => a + t.est_hours, 0)} h</span></h4><ol class="tasks">${w.map((t) => `<li><span class="t-txt"><b>${esc(t.task)}</b><em>${esc(t.how)}</em></span>${helper(t.helped_by)}<span class="t-h">${t.est_hours} h</span></li>`).join("")}</ol></section>` : "").join("")}</div>`;
  const brief = `<dl class="brief">
      <div><dt>The idea</dt><dd>${esc(m.brief.concept)}</dd></div>
      <div><dt>For</dt><dd>${esc(m.brief.for)}</dd></div>
      <div><dt>Goal in 4 weeks</dt><dd>${esc(m.brief.goal)}</dd></div>
      <div><dt>Where</dt><dd>${esc([m.market.city, m.market.country_iso].filter(Boolean).join(", "))} · prices in ${esc(m.market.currency)}</dd></div>
    </dl>`;
  return { tabs: [["sum", "Summary"], ["all", "All tasks"], ["brief", "Brief"]], body: pane("sum", sum, true) + pane("all", all) + pane("brief", brief) };
}

// ───────────────────────────── score dial (Leo, verdict, projects)
export function dial(score: number | null, size = 96, stroke = 7): string {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const k = score == null ? 0 : Math.max(0, Math.min(1, score / 10));
  const tone = score == null ? "none" : score >= 7 ? "pos" : score >= 4.5 ? "warn" : "neg";
  return `<span class="dial" data-tone="${tone}" style="--sz:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="--c:${c.toFixed(1)};--k:${k.toFixed(3)}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="d-bg" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="d-fg" stroke-width="${stroke}" stroke-dasharray="${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg><b>${score == null ? "–" : num(score, 1)}</b></span>`;
}

/** Price (x) vs differentiation (y), 0–10: competitors + you. */
function positioning(v: View): string {
  const L = v.leo!;
  const W = 300, H = 170, P = { l: 26, r: 10, t: 10, b: 24 };
  const X = (p: number) => P.l + (p / 10) * (W - P.l - P.r);
  const Y = (d: number) => H - P.b - (d / 10) * (H - P.t - P.b);
  const dots = L.competitors.map((c, i) => {
    const x = X(c.price), y = Y(c.differentiation);
    const right = x < W * 0.62;
    return `<g class="pm-c" style="--i:${i}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"/><text x="${(x + (right ? 8 : -8)).toFixed(1)}" y="${(y + 3.5 + (i % 2 ? 6 : -4)).toFixed(1)}" text-anchor="${right ? "start" : "end"}">${esc(c.name)}</text></g>`;
  }).join("");
  const yx = X(L.you.price), yy = Y(L.you.differentiation);
  return `<svg class="pmap" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Price versus differentiation">
    <line x1="${P.l}" x2="${W - P.r}" y1="${Y(5)}" y2="${Y(5)}" class="pm-mid"/><line x1="${X(5)}" x2="${X(5)}" y1="${P.t}" y2="${H - P.b}" class="pm-mid"/>
    <line x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}" class="pm-ax"/><line x1="${P.l}" x2="${P.l}" y1="${P.t}" y2="${H - P.b}" class="pm-ax"/>
    <text x="${P.l}" y="${H - 6}" class="pm-l">Cheaper</text><text x="${W - P.r}" y="${H - 6}" text-anchor="end" class="pm-l">Pricier →</text>
    <text x="4" y="${H - P.b}" class="pm-l" transform="rotate(-90 4 ${H - P.b})">Generic</text><text x="4" y="${P.t}" class="pm-l" transform="rotate(-90 4 ${P.t})" text-anchor="end">Distinctive →</text>
    ${dots}
    <g class="pm-you"><circle cx="${yx}" cy="${yy}" r="11" class="pm-halo"/><circle cx="${yx}" cy="${yy}" r="5.5"/><text x="${yx - 10}" y="${yy + 4}" text-anchor="end">You</text></g>
  </svg>`;
}

// ───────────────────────────── Leo · market research
function leo(v: View): { tabs: Array<[string, string]>; body: string } {
  const L = v.leo!;
  const sev = { high: "High", med: "Medium", low: "Low" } as const;
  const conf = v.leo6?.confidence;
  const basis = conf ? `${conf.level[0]!.toUpperCase()}${conf.level.slice(1)} confidence · ${conf.note}` : v.sourced ? `${L.sources.length} sources` : "No live sources · estimates";
  const w = v.leo6?.weights ?? [];
  const sum = `
    <div class="c-hero hero-score" data-st>
      ${dial(L.score, 92, 7)}
      <div class="hs-side">
        <span class="verdict-chip" data-v="${L.verdict}" data-conf="${conf?.level ?? ""}">${verdictText(v)}</span>
        <p class="c-take big-take">${esc(L.headline)}</p>
      </div>
    </div>
    <p class="c-why" data-st>${esc(L.why_go || L.summary)}</p>
    <ul class="sig-tiles" data-st>${L.signals.map((s, i) => `<li style="--i:${i};--v:${s.score / 10}" title="${esc(s.why)}"><span class="st-n">${esc(s.name)}${w[i] != null ? `<em>${Math.round(w[i]! * 100)}%</em>` : ""}</span><b class="st-v">${num(s.score, 1, "", "", 260)}</b><span class="st-bar"><i></i></span></li>`).join("")}</ul>
    <p class="basis" data-st data-conf="${conf?.level ?? ""}">${I.info(13)}<span>${esc(basis)}</span></p>`;
  const market = `
    ${v.leo6?.math ? `<div class="math"><span class="lbl">How the score is built</span><code>${esc(v.leo6.math)}</code>${v.leo6.rule ? `<span class="m-rule">${esc(v.leo6.rule)}</span>` : ""}</div>` : ""}
    <div class="c-sub"><span class="lbl">Why these scores</span></div>
    <ul class="signals">${L.signals.map((s, i) => `<li style="--i:${i}"><span class="s-name">${esc(s.name)}${src(v, s.source_id)}</span><span class="s-bar"><i style="--v:${s.score / 10}"></i></span><span class="s-v">${s.score.toFixed(1)}</span><span class="s-why">${esc(s.why)}</span></li>`).join("")}</ul>
    <div class="c-sub"><span class="lbl">Where you sit</span></div>
    <div class="pm-wrap">${positioning(v)}</div>
    <ul class="rivals">${L.competitors.map((c) => `<li><b>${esc(c.name)}</b><span>${esc(c.note)}</span></li>`).join("")}</ul>
    <div class="c-sub"><span class="lbl">Market facts</span></div>
    <ul class="mfacts">${L.market_facts.map((f) => `<li><span>${esc(f.fact)}</span>${f.is_estimate ? est() : src(v, f.source_id)}</li>`).join("")}</ul>`;
  const kill = v.leo6?.kill ?? [];
  const risks = `
    ${kill.length ? `<div class="kill"><span class="lbl">Stop if</span><ul>${kill.map((k) => `<li>${I.close(13)}<span>${esc(k.replace(/^Stop if /i, "").replace(/^./, (c) => c.toUpperCase()))}</span></li>`).join("")}</ul></div>` : ""}
    <ul class="risks">${L.risks.map((r) => `<li data-sev="${r.severity}"><span class="sev"><i></i>${sev[r.severity]}</span><b>${esc(r.risk)}</b><em>${esc(r.mitigation)}</em></li>`).join("")}</ul>
    <div class="callout"><span class="lbl">Cheapest next step</span><p>${esc(L.next_step)}</p></div>
    ${L.pivot ? `<div class="callout"><span class="lbl">Pivot</span><p><b>${esc(L.pivot.idea)}</b> ${esc(L.pivot.why)}</p></div>` : ""}`;
  const iv = L.interviews;
  const talk = iv.questions.length ? `
    <div class="iv-top"><div><span class="lbl">Talk to</span><p>${esc(iv.who)}</p></div><div class="iv-n"><b class="mid">${num(iv.target)}</b><span>people</span></div></div>
    <ol class="iv-q">${iv.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>
    <div class="callout pos"><span class="lbl">Good sign</span><p>${esc(iv.good_sign)}</p></div>` : "";
  const tabs: Array<[string, string]> = [["sum", "Score"], ["mkt", "Market"], ["risk", "Risks"]];
  if (talk) tabs.push(["talk", "Interviews"]);
  return { tabs, body: pane("sum", sum, true) + pane("mkt", market) + pane("risk", risks) + (talk ? pane("talk", talk) : "") };
}

// ───────────────────────────── Sam · money
export function cashCurve(v: View, w = 340, h = 112): string {
  const S = v.sam!;
  const pts0 = v.curve;
  const ys = pts0.map((p) => p.cash);
  const minY = Math.min(...ys, 0), maxY = Math.max(0, ...ys);
  const pad = { l: 2, r: 2, t: 22, b: 6 };
  const X = (m: number) => pad.l + (m / (pts0[pts0.length - 1]!.month || 12)) * (w - pad.l - pad.r);
  const Y = (c: number) => pad.t + ((maxY - c) / (maxY - minY || 1)) * (h - pad.t - pad.b);
  const pts = pts0.map((p) => [X(p.month), Y(p.cash)] as const);
  let d = `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2] ?? p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const z = Y(0);
  const low = pts[S.cash_needed.month] ?? pts[0]!;
  const be = S.break_even.month;
  const lowPct = (low[0] / w) * 100, bePct = be != null ? (X(be) / w) * 100 : null;
  const back = cashBack(v);
  const backIn = back.month != null && back.month <= (pts0[pts0.length - 1]!.month || 12);
  return `<div class="cv">
    <svg class="curve" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="${h}" aria-label="Cumulative cash over 12 months">
      <defs><clipPath id="cvneg"><rect x="0" y="${z}" width="${w}" height="${h}"/></clipPath><clipPath id="cvpos"><rect x="0" y="0" width="${w}" height="${z}"/></clipPath></defs>
      <path d="${d} L${pts[pts.length - 1]![0].toFixed(1)},${z} L${pts[0]![0].toFixed(1)},${z}Z" class="cv-neg" clip-path="url(#cvneg)"/>
      <path d="${d} L${pts[pts.length - 1]![0].toFixed(1)},${z} L${pts[0]![0].toFixed(1)},${z}Z" class="cv-pos" clip-path="url(#cvpos)"/>
      <line x1="0" x2="${w}" y1="${z}" y2="${z}" class="cv-zero"/>
      ${be != null ? `<line x1="${X(be)}" x2="${X(be)}" y1="4" y2="${h}" class="cv-be"/>` : ""}
      <path d="${d}" class="cv-line"/>
    </svg>
    <span class="cv-dot" style="left:${lowPct.toFixed(1)}%;top:${((low[1] / h) * 100).toFixed(1)}%"></span>
    <span class="cv-tag neg" style="left:${lowPct.toFixed(1)}%;top:${((low[1] / h) * 100).toFixed(1)}%">${esc(money(S.currency, -S.cash_needed.value))} · month ${S.cash_needed.month}</span>
    ${bePct != null ? `<span class="cv-tag be" style="left:${bePct.toFixed(1)}%">Profitable from here · M${be}</span>` : ""}
    ${backIn ? `<span class="cv-tag back" style="left:${((X(back.month!) / w) * 100).toFixed(1)}%;top:${((z / h) * 100).toFixed(1)}%">Cash back · M${back.month}</span>` : back.month != null ? `<span class="cv-tag back out" style="top:${((z / h) * 100).toFixed(1)}%">Cash back ~M${back.month} →</span>` : ""}
    <span class="cv-zl" style="top:${((z / h) * 100).toFixed(1)}%">${esc(S.currency)}0</span>
    <div class="cv-axis"><span>Opening</span><span>Month ${pts0[pts0.length - 1]!.month}</span></div>
  </div>`;
}

function sam(v: View): { tabs: Array<[string, string]>; body: string } {
  const S = v.sam!;
  const k = S.cash_needed.value >= 1000 ? Math.round(S.cash_needed.value / 1000) : S.cash_needed.value;
  const back = cashBack(v);
  const cashTxt = money(S.currency, S.cash_needed.value);
  const take = S.break_even.month != null
    ? `Profitable from month ${S.break_even.month} at ${bePace(v).n.toLocaleString("en-US")} sales a ${bePace(v).per}. Your ${cashTxt} is back ${back.words}.`
    : `Not profitable within 12 months: below ${bePace(v).n.toLocaleString("en-US")} sales a ${bePace(v).per} it loses money every month.`;
  const m12cash = S.months[S.months.length - 1]?.cash ?? 0;
  const sum = `
    <div class="c-hero hero-row hero-stack" data-st>
      <div class="h-num"><b class="big">${num(k, 0, S.currency, S.cash_needed.value >= 1000 ? "k" : "")}</b><span>cash to start${est()}</span></div>
      <div class="h-meta"><span>Start-up plus the losses until month ${S.break_even.month ?? "12"}, at the lowest point</span></div>
    </div>
    <p class="c-take" data-st>${esc(take)}</p>
    <div class="curve-wrap" data-st>${cashCurve(v)}</div>
    <dl class="facts f4" data-st>
      ${fact("Avg. ticket", num(S.price.value, S.price.value < 100 ? 2 : 0, S.currency), est())}
      ${fact("Start-up", esc(S.startup_cost.display), est())}
      ${fact("Year 1 operating", esc(S.year1.result), "", `${money(S.currency, m12cash)} after start-up`)}
      ${fact("Cash back", back.month != null ? `${back.month > 12 ? "~" : ""}Month ${back.month}` : "Not in plan")}
    </dl>`;
  const asm = `
    <ul class="asm">${S.assumptions.map((a) => `<li><span class="a-l"><b>${esc(a.label)}</b><em>${esc(a.basis)}</em></span><span class="a-v">${a.unit === S.currency ? esc(money(S.currency, a.value, a.value < 100)) : `${a.value.toLocaleString("en-US")}${a.unit === "%" ? "%" : ""}`}${a.unit !== S.currency && a.unit !== "%" ? `<small>${esc(a.unit)}</small>` : ""}</span>${est(a.is_estimate)}</li>`).join("")}</ul>
    <p class="basis">${I.info(13)}<span>Every number on the Money card is computed from these.</span></p>`;
  const total = S.fixed_costs_breakdown.reduce((a, c) => a + c.value, 0) || 1;
  const X = v.sam6;
  const u = X?.unit;
  const hr = X?.headroom;
  const pace = bePace(v);
  const be = `
    <div class="c-hero hero-row">
      <div class="h-num"><b class="big">${num(pace.n, pace.dec)}</b><span>sales a ${pace.per}<br/>to break even</span></div>
      ${hr && pace.m12 != null ? `<div class="h-meta"><span>Month-12 plan</span><span><b>${num(pace.m12)}</b> a ${pace.per} · <b>${hr.multiple.toFixed(1)}×</b></span></div>` : ""}
    </div>
    ${hr && pace.m12 != null ? `<div class="headroom" style="--be:${(hr.breakeven_per_day / hr.m12_per_day).toFixed(3)}"><span class="hr-bar"><i></i><b></b></span><div class="hr-l"><span>0</span><span class="hr-be">Break-even ${pace.n.toLocaleString("en-US")}</span><span>Plan ${pace.m12.toLocaleString("en-US")}</span></div></div>` : ""}
    ${X?.be ? `<div class="math"><span class="lbl">The maths</span><code>${esc(X.be.formula)}</code></div>` : ""}
    ${u ? `<div class="unit"><span class="lbl">Every sale</span>
      <div class="u-split" style="--k:${(u.variable_cost / u.price).toFixed(3)}"><span class="u-cost">${esc(money(S.currency, u.variable_cost, true))} cost</span><span class="u-left">${esc(money(S.currency, u.contribution, true))} left · ${u.margin_pct}%</span></div></div>` : ""}
    <div class="c-sub"><span class="lbl">Fixed costs a month</span><b class="mid-s">${esc(money(S.currency, total))}</b></div>
    <div class="stackbar">${S.fixed_costs_breakdown.map((c, i) => `<i style="--w:${(c.value / total).toFixed(4)};--i:${i}"></i>`).join("")}</div>
    <ul class="costs">${S.fixed_costs_breakdown.map((c, i) => `<li style="--i:${i}"><i></i><span>${esc(c.label)}</span><b>${esc(money(S.currency, c.value))}</b></li>`).join("")}</ul>`;
  const sens = X?.sens ?? [];
  const lo = Math.min(0, ...sens.map((r) => r.low.year1_result)), hi = Math.max(0, ...sens.map((r) => r.high.year1_result));
  const P = (n: number) => (((n - lo) / (hi - lo || 1)) * 100).toFixed(2);
  const matters = sens.length ? `
    <p class="c-take">What moves the year-1 operating result the most.</p>
    <div class="tornado" style="--zero:${P(0)}%">
      ${sens.map((r, i) => `<div class="tr" style="--i:${i}">
        <span class="tr-l">${esc(r.label)} <small>${r.key === "gross_margin_pct" ? "±10 pts" : "±20%"}</small>${r.key === X?.key ? `<em>Key</em>` : ""}</span>
        <span class="tr-bar"><i style="left:${P(Math.min(r.low.year1_result, r.high.year1_result))}%;width:${(Number(P(Math.max(r.low.year1_result, r.high.year1_result))) - Number(P(Math.min(r.low.year1_result, r.high.year1_result)))).toFixed(2)}%"></i><b style="left:${P(r.base.year1_result)}%"></b></span>
        <span class="tr-v">${esc(money(S.currency, Math.min(r.low.year1_result, r.high.year1_result)))} … ${esc(money(S.currency, Math.max(r.low.year1_result, r.high.year1_result)))}</span>
      </div>`).join("")}
      <div class="tr-ax"><span></span><span class="tr-axb"><span>${esc(money(S.currency, lo))}</span><span class="tr-z">${esc(S.currency)}0</span><span>${esc(money(S.currency, hi))}</span></span></div>
    </div>
    <ul class="sens-lines">${sens.map((r) => `<li>${esc(r.line)}</li>`).join("")}</ul>
    ${X?.offer ? `<div class="callout"><span class="lbl">Launch offer</span><p><b>${esc(X.offer.display)}</b> instead of ${esc(X.offer.normal_display)} for the first ${X.offer.limit}: still ${esc(X.offer.contribution_display)} left each, ${esc(X.offer.revenue_display)} if they sell out.</p></div>` : ""}` : "";
  const tabs: Array<[string, string]> = [["sum", "Summary"], ["be", "Break-even"]];
  if (matters) tabs.push(["sens", "Drivers"]);
  tabs.push(["asm", "Inputs"]);
  return { tabs, body: pane("sum", sum, true) + pane("be", be) + (matters ? pane("sens", matters) : "") + pane("asm", asm) };
}

// ───────────────────────────── Nova · brand
export function brandTile(v: View, size: "lg" | "md" | "sm" = "lg"): string {
  const b = v.brand;
  if (!b) return "";
  return `<div class="brand-tile ${size}" style="--b-bg:${v.pal("Background")};--b-ink:${v.pal("Primary")};--b-acc:${v.pal("Accent")};--b-font:${stackOf(v.fonts.display)};--b-body:${stackOf(v.fonts.body)}">
    <b class="b-name">${esc(b.name)}</b><span class="b-tag">${esc(b.tagline)}</span></div>`;
}

function nova(v: View): { tabs: Array<[string, string]>; body: string } {
  const N = v.nova!, b = v.brand!;
  const alts = N.names.filter((_, i) => i !== N.chosen);
  const sum = `
    <div class="c-hero" data-st>${brandTile(v, "lg")}</div>
    <p class="c-take" data-st>${esc(v.positioning ?? b.why)}</p>
    ${v.positioning ? `<p class="c-why" data-st>${esc(b.why)}</p>` : ""}
    <dl class="facts f2" data-st>
      <div class="fact"><dt>Palette</dt><dd class="pal">${b.palette.map((c) => `<i style="background:${c.hex}" title="${esc(c.name)} ${c.hex}"></i>`).join("")}</dd></div>
      <div class="fact"><dt>Type</dt><dd class="typ"><span style="font-family:${stackOf(N.typography.display)}">${esc(N.typography.display)}</span><span style="font-family:${stackOf(N.typography.body)}">${esc(N.typography.body)}</span></dd></div>
    </dl>
`;
  const others = `<div class="voice"><span class="lbl">Voice</span><div class="v-traits">${N.voice.traits.map((t) => `<span>${esc(t)}</span>`).join("")}</div><blockquote style="font-family:${stackOf(N.typography.body)}">“${esc(N.voice.sample)}”</blockquote></div>
    <div class="c-sub"><span class="lbl">Other names</span></div>
    <div class="alts">${alts.map((a) => `
      <div class="alt" style="--a-bg:${a.palette.find((c) => c.name === "Background")?.hex ?? "#F4F2EE"};--a-ink:${a.palette.find((c) => c.name === "Primary")?.hex ?? "#111"};--a-acc:${a.palette.find((c) => c.name === "Accent")?.hex ?? "#888"};--b-font:${stackOf(N.typography.display)}">
        <div class="alt-tile"><b>${esc(a.name)}</b><span>${esc(a.tagline)}</span></div><p>${esc(a.why)}</p></div>`).join("")}</div>
    <div class="callout"><span class="lbl">Voice</span><p>${esc(N.voice.rules)}</p></div>`;
  return { tabs: [["sum", "Brand"], ["alt", "Voice & names"]], body: pane("sum", sum, true) + pane("alt", others) };
}

// ───────────────────────────── Dex · logo & site
export const brandInk = (v: View, dark = false) =>
  dark ? { ink: v.pal("Background"), acc: v.pal("Accent"), bg: v.pal("Primary") } : { ink: v.pal("Primary"), acc: v.pal("Accent"), bg: v.pal("Background") };
export function brandLogo(v: View, i: number, px: number, opts: { dark?: boolean; mode?: "full" | "mark" } = {}): string {
  const L = v.dex?.logos[i] as LogoSpec | undefined;
  return brandLogoHtml(L, brandInk(v, opts.dark), v.brand?.name ?? v.name, px, v.fonts.display, { mode: opts.mode });
}

/** A full https link for people (the server may store a relative path). */
export const absUrl = (u: string) => (!u || /^https?:/.test(u) ? u : (typeof location !== "undefined" ? location.origin : "") + u);

export function sitePreview(v: View, full = false, bullets = false): string {
  const D = v.dex!;
  const L = D.landing;
  const cur = v.sam?.currency ?? "";
  const O = v.sam6?.offer;
  const goal = v.preorderGoal;
  const offer = O
    ? `<div class="site-offer"><div><b>${esc(O.display)}</b><s>${esc(O.normal_display)}</s></div><span>${esc(L.offer)}</span></div>`
    : `<div class="site-offer"><span>${esc(L.offer)}</span></div>`;
  // WP4: no fake "0 / goal" bar and no refund promise (nothing enforces either).
  void goal;
  const gate = "";
  return `<div class="site ${full ? "full" : ""}" style="--s-bg:${v.pal("Background")};--s-ink:${v.pal("Primary")};--s-acc:${v.pal("Accent")};--s-x:${v.pal("Extra")};--s-font:${stackOf(v.fonts.display)};--s-body:${stackOf(v.fonts.body)}">
    <div class="site-bar"><i></i><i></i><i></i><span class="site-url">${I.lock(10)}<span>${esc(absUrl(v.pip?.url ?? "").replace(/^https?:\/\//, ""))}</span></span></div>
    <div class="site-body">
      <div class="site-nav">${brandLogo(v, 0, full ? 18 : 14)}<span>${esc(L.where_when ?? "")}</span></div>
      <div class="site-hero">
        <div class="site-copy">
          <h3>${esc(L.headline)}</h3>
          <p>${esc(L.subheadline)}</p>
          <div class="site-cta-row"><span class="site-cta">${esc(L.cta)}</span>${L.normal_price != null ? `<span class="site-was">then ${esc(money(cur, L.normal_price, true))}</span>` : ""}</div>
        </div>
        ${full ? `<div class="site-art" aria-hidden="true">${brandLogo(v, 0, 64, { mode: "mark" })}</div>` : ""}
      </div>
      ${bullets || full ? `<ul class="site-bul">${L.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
      ${full ? `${offer}${gate}
      <div class="site-faq">${L.faq.map((f, i) => `<details${i === 0 ? " open" : ""}><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div>
      <div class="site-foot"><span>${esc(L.where_when ?? v.brand?.name ?? "")}</span><span>Paid in Bitcoin Cash, straight to ${esc(v.brand?.name ?? "the founder")}'s wallet.</span></div>` : ""}
    </div>
  </div>`;
}

export function logoSystem(v: View, i: number): string {
  return `<div class="logo-stage" style="background:${v.pal("Background")}">${brandLogo(v, i, 50)}</div>
    <div class="logo-uses">
      <div class="lu lu-dark" style="background:${v.pal("Primary")}">${brandLogo(v, i, 20, { dark: true })}</div>
      <div class="lu lu-icon" style="background:${v.pal("Background")}">${brandLogo(v, i, 44, { mode: "mark" })}<span>App icon</span></div>
      <div class="lu lu-fav"><span class="fav-tab">${brandLogo(v, i, 14, { mode: "mark" })}<em>${esc(v.brand?.name ?? v.name)}</em></span><span>Favicon</span></div>
    </div>`;
}

function dex(v: View): { tabs: Array<[string, string]>; body: string } {
  const D = v.dex!;
  const kind = (i: number) => ({ pause: "Symbol", loop: "Symbol", loaf: "Symbol", route: "Symbol", roundel: "Monogram", tile: "Monogram", stop: "Wordmark", none: "Wordmark" })[glyphOf(D.logos[i] as LogoSpec)];
  const sum = `
    <div class="c-hero logo-sys" data-st data-logo-hero>${logoSystem(v, 0)}</div>
    <p class="c-take" data-st data-logo-take>${esc(D.logos[0]?.concept ?? "")}</p>
    <div class="logo-row" data-st role="radiogroup" aria-label="Logo options">${D.logos.map((l, i) => `<button type="button" role="radio" aria-checked="${i === 0}" class="logo-cell${i === 0 ? " on" : ""}" data-logo="${i}" data-concept="${esc(l.concept)}" style="background:${v.pal("Background")}">${brandLogo(v, i, 15)}<span class="lc-k">${i === 0 ? "Chosen · " : ""}${kind(i)}</span></button>`).join("")}</div>
    <dl class="facts f2" data-st>
      ${fact("Landing headline", `<span class="dd-text" style="font-family:${stackOf(v.fonts.display)}">${esc(D.landing.headline)}</span>`)}
      ${v.sam6?.offer
        ? fact("Launch offer", `${esc(v.sam6.offer.display)}<small> · was ${esc(v.sam6.offer.normal_display)}</small>`, "", `First ${v.sam6.offer.limit} · ${v.sam6.offer.contribution_display} still left each`)
        : fact("Opening offer", `<span class="dd-text">${esc(D.landing.offer)}</span>`)}
    </dl>`;
  const site = `<div class="site-in-card">${sitePreview(v, true)}</div>`;
  return { tabs: [["sum", "Logo"], ["site", "Website"]], body: pane("sum", sum, true) + pane("site", site) };
}

// ───────────────────────────── Rae · launch
const CH_ICON: Record<string, string> = { instagram: "camera", tiktok: "music", email: "book", linkedin: "chart", x: "spark" };
function chColor(v: View, ch: string): string {
  return ({ instagram: v.pal("Accent"), tiktok: `color-mix(in srgb, ${v.pal("Primary")} 50%, var(--c-ink))`, email: v.pal("Extra") } as Record<string, string>)[ch] ?? "var(--c-muted)";
}

function rae(v: View): { tabs: Array<[string, string]>; body: string } {
  const Ra = v.rae!;
  const byDay = new Map(v.posts.map((p) => [p.day, p]));
  const start = new Date(Ra.start_date + "T12:00:00");
  const strip = Array.from({ length: 30 }, (_, i) => {
    const p = byDay.get(i + 1);
    return p ? `<i class="on" style="--ch:${chColor(v, p.channel)};--i:${i}" title="Day ${i + 1} · ${CHANNEL_LABEL[p.channel]} ${p.format}"></i>` : `<i style="--i:${i}"></i>`;
  }).join("");
  const first = v.posts[0];
  const sum = `
    <div class="c-hero hero-row" data-st>
      <div class="h-num"><b class="big">${num(v.posts.length)}</b><span>posts</span></div>
      <div class="h-meta"><span><b>30</b> days from ${esc(start.toLocaleDateString("en-GB", { day: "numeric", month: "short" }))}</span><span>${esc(Ra.handle)}</span></div>
    </div>
    <div class="strip" data-st><div class="strip-d">${strip}</div><div class="strip-ax"><span>Day 1</span><span>Day 15</span><span>Day 30</span></div></div>
    ${first ? `<p class="c-take quote" data-st>“${esc(first.hook)}”<span>Day ${first.day} · ${CHANNEL_LABEL[first.channel]} · ${esc(first.time)}</span></p>` : ""}
    <div class="chans" data-st>${Object.entries(v.channels).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<span><i style="background:${chColor(v, c)}"></i>${CHANNEL_LABEL[c] ?? c}<b>${n}</b></span>`).join("")}</div>`;
  const posts = `<div class="posts">${Ra.first_posts.map((p) => `
      <article class="post" style="--ch:${chColor(v, p.channel)}">
        <header>${renderIcon(CH_ICON[p.channel] ?? "spark", "currentColor", 14)}<b>${esc(Ra.handle)}</b><span>${esc(CHANNEL_LABEL[p.channel] ?? p.channel)} · ${esc(fmtDate(p.date).replace(/ \d{4}$/, ""))}</span></header>
        <span class="post-k">${esc(p.kind)}</span><b class="post-t">${esc(p.title)}</b><p>${esc(p.text)}</p></article>`).join("")}</div>`;
  const cal = `<ol class="cal-list">${v.posts.map((p) => `<li><span class="cl-d">Day ${p.day}</span><span class="cl-ch" style="--ch:${chColor(v, p.channel)}"><i></i>${CHANNEL_LABEL[p.channel]} · ${esc(p.format)}</span><span class="cl-h">${esc(p.hook)}</span></li>`).join("")}</ol>`;
  return { tabs: [["sum", "Plan"], ["posts", "First posts"], ["cal", "All 30 days"]], body: pane("sum", sum, true) + pane("posts", posts) + pane("cal", cal) };
}

// ───────────────────────────── your website is live
function pip(v: View): { tabs: Array<[string, string]>; body: string } {
  const P = v.pip!;
  const at = new Date(P.live_at);
  const url = absUrl(P.url);
  const sum = `
    <div class="c-hero" data-st><div class="live-url"><span class="live-dot"></span><b>${esc(url)}</b></div></div>
    <p class="c-take" data-st>Your website is live. Customers can reserve and pay in Bitcoin Cash, straight to your wallet.</p>
    <ul class="checks" data-st>${["Your website is online", `${v.dex?.landing.cta ?? "Reservations"} is open`, "Payments go straight to your wallet"].map((l) => `<li>${I.check(14)}<span>${esc(l)}</span></li>`).join("")}</ul>
    <dl class="facts f2" data-st>
      ${fact("Live since", esc(at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })), "", fmtDate(P.live_at))}
      ${fact("Offer", esc(v.dex?.landing.cta.replace(/^Pre-order for /, "") ?? "–"), "", "Opening week")}
    </dl>`;
  return { tabs: [["sum", "Live"]], body: pane("sum", sum, true) };
}

const MAKERS: Record<Dept, (v: View) => { tabs: Array<[string, string]>; body: string }> = { mia, leo, sam, nova, dex, rae, pip };

export function resultCard(v: View, d: Dept, mode: CardMode = "run"): string {
  if (!v.has(d)) return `<article class="card c-empty"><p class="c-take">${ROOM_META[d].name} has no result in this project.</p></article>`;
  const { tabs, body } = MAKERS[d](v);
  if (mode === "read") {
    // the report reads top to bottom: every pane shown, each under its own small heading (no second tab bar)
    let flat = body.replace(/ hidden>/g, ">");
    tabs.slice(1).forEach(([id, label]) => (flat = flat.replace(`<div class="c-pane" data-pane="${id}">`, `<div class="c-pane" data-pane="${id}"><h4 class="rd-h">${esc(label)}</h4>`)));
    return `<article class="card c-${d} c-read" data-dept="${d}" style="--room:${ROOM_META[d].color}">${head(d, [])}<div class="c-panes">${flat}</div></article>`;
  }
  return `<article class="card c-${d}" data-dept="${d}" style="--room:${ROOM_META[d].color}">${head(d, tabs)}<div class="c-panes" data-st>${body}</div>${foot(d, mode)}</article>`;
}
