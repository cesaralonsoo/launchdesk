// v6 · The non-result surfaces (WS-B): idea, pay, verdict (credit decision), level toasts, "your business", scale.
import { ROOM_META, type Dept } from "../contracts";
import { IDEA } from "../data";
import { absUrl, bePace, brandLogo, cashBack, num, est, sitePreview, stackOf, verdictText } from "./cards";
import { esc } from "./dom";
import { I, avatar } from "./icons";
import { ldMark } from "./logo";
import { VERDICT_LABEL, money, usd, type View } from "./view";

// ───────────────────────────── idea: logo, one question, one field, one price
export function ideaPanel(idea: string, past = 0): string {
  return `
  <form class="idea" autocomplete="off">
    <h1 class="t-display" data-st>What's your idea?</h1>
    <div class="idea-field" data-st>
      <textarea name="idea" rows="2" maxlength="280" placeholder="${esc(IDEA)}" aria-label="Your idea">${idea && idea !== IDEA ? esc(idea) : ""}</textarea>
      <button class="btn btn-primary btn-go" type="submit"><span>Validate</span><span class="btn-price">${usd(10)}</span></button>
    </div>
    <ol class="idea-steps" data-st aria-label="What you get">
      <li><i>1</i><span><b>Validate</b> score, plan, money</span><em>${usd(10)}</em></li>
      <li class="is-arrow" aria-hidden="true"></li>
      <li><i>2</i><span><b>Launch kit</b> logo, website, 30-day plan</span><em>${usd(50)}</em></li>
    </ol>
    ${past ? `<button type="button" class="idea-past" data-act="projects" data-st>or open one of your ${past} projects</button>` : ""}
  </form>`;
}

// ───────────────────────────── pay (Apple Pay-like)
export function payPanel(v: View, stage: "validate" | "build", idea = IDEA): string {
  const depts: Dept[] = stage === "validate" ? ["mia", "leo", "sam"] : ["nova", "dex", "rae", "pip"];
  const cents = v.cents[stage];
  const title = stage === "validate" ? "Validate the idea" : "Launch kit";
  const who = stage === "validate" ? "Plan · Market research · Money" : "Your logo · your website · your 30-day plan";
  const sample = stage === "validate" && idea.trim() !== IDEA.trim();
  return `
  <section class="pay" data-stage="${stage}">
    <header class="pay-top" data-st><span class="pay-merchant">${ldMark(18)}<b>LaunchDesk</b></span><span class="tag">Prototype · no payment</span></header>
    <div class="pay-amount" data-st><b class="huge">${usd(cents)}</b><span>in Bitcoin Cash</span></div>
    <div class="pay-line" data-st>
      <div class="pay-avs">${depts.map((d) => avatar(d, 26)).join("")}</div>
      <div><b>${title}</b><span>${who}</span></div>
    </div>
    <button class="btn btn-primary btn-pay" data-act="approve" type="button" data-st>
      <span class="b-lbl">Approve</span><span class="spin" aria-hidden="true"></span>
      <span class="tick" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1"/></svg></span>
    </button>
    ${sample ? `<p class="pay-note" data-st>This prototype shows a sample run: ${esc(v.name)}, a coffee kiosk.</p>` : `<p class="pay-foot" data-st>Paid from your wallet. LaunchDesk never holds your keys.</p>`}
  </section>`;
}

// ───────────────────────────── verdict: a premium credit decision
/** Semicircle gauge 0–10: one quiet track, one arc, the number. The verdict pill says Go / Pivot / No-go. */
export function gauge(score: number, w = 220): string {
  const h = w * 0.56, cx = w / 2, cy = w / 2 + 4, r = w / 2 - 14;
  const ang = (s: number) => Math.PI * (1 - s / 10);
  const pt = (s: number, rr = r) => [cx + rr * Math.cos(ang(s)), cy - rr * Math.sin(ang(s))] as const;
  const arc = (a: number, b: number, rr = r) => {
    const [x1, y1] = pt(a, rr), [x2, y2] = pt(b, rr);
    return `M${x1.toFixed(1)},${y1.toFixed(1)} A${rr},${rr} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)}`;
  };
  const tone = score >= 7 ? "pos" : score >= 5 ? "warn" : "neg";
  const ticks = [5, 7].map((t) => { const [a, b] = pt(t, r - 10), [c, d] = pt(t, r - 16); return `<line x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${c.toFixed(1)}" y2="${d.toFixed(1)}" class="g-tick"/>`; }).join("");
  return `<div class="gauge" data-tone="${tone}" style="--w:${w}px">
    <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
      <path d="${arc(0, 10)}" class="g-track"/>
      <path d="${arc(0, Math.max(0.05, score))}" class="g-fg" pathLength="1"/>
      ${ticks}
    </svg>
    <div class="g-val"><b class="huge">${num(score, 1, "", "", 60)}</b><span>out of 10</span></div>
  </div>`;
}

/** Month 1 → break-even → month 12 on one bar, in the units people use (a day, or a month for slow sales). */
export function paceBar(v: View): string {
  const S = v.sam, H = v.sam6?.headroom;
  if (!S || !H) return "";
  const p = bePace(v);
  const k = p.per === "month" ? (v.sam6?.be?.per_month ?? 0) / (S.breakeven_units_per_day || 1) : 1;
  const m1v = S.assumptions.find((a) => a.key === "customers_per_day_m1")?.value ?? 0;
  const m1 = Math.round(m1v * k * 10) / 10, be = p.n, m12 = p.m12 ?? Math.round(H.m12_per_day * k);
  const max = Math.max(m12, be, m1) * 1.08 || 1;
  const at = (x: number) => ((x / max) * 100).toFixed(1);
  const f = (x: number) => (x >= 10 ? Math.round(x) : x).toLocaleString("en-US");
  const short = m12 < be;
  return `<div class="pace" data-short="${short}" style="--m1:${at(m1)}%;--be:${at(be)}%;--m12:${at(m12)}%">
    <div class="pace-l"><span class="lbl">Sales a ${p.per}</span><span class="pace-x">${short ? "The plan never reaches break-even" : `Month 12 is ${(m12 / (be || 1)).toFixed(1)}× break-even`}</span></div>
    <span class="pace-bar"><i class="pb-fill"></i><b class="pb-be"></b><s class="pb-m1"></s><s class="pb-m12"></s></span>
    <div class="pace-ax"><span class="pa-m1">Month 1 · ${f(m1)}</span><span class="pa-be">Break-even · ${f(be)}</span><span class="pa-m12">Month 12 · ${f(m12)}</span></div>
  </div>`;
}

const BUYS: Array<[Dept, string]> = [["nova", "Name & brand"], ["dex", "Logo & landing page"], ["rae", "30-day launch plan"], ["pip", "Live page with pre-orders"]];

export function verdictPanel(v: View): string {
  const L = v.leo!, S = v.sam!;
  const line = v.memo?.verdict_line ?? L.headline;
  const date = new Date(v.createdAt || Date.now()).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const back = cashBack(v);
  const conf = v.leo6?.confidence;
  const canBuild = L.verdict !== "no-go";
  return `
  <section class="verdict" data-v="${L.verdict}">
    <header class="v-top" data-st>
      <span class="v-avs">${avatar("mia", 24)}${avatar("leo", 24)}${avatar("sam", 24)}</span>
      <div class="v-id"><span class="eyebrow">Decision · ${esc(date)}</span><b>${esc(v.title)}</b></div>
    </header>
    <div class="v-hero" data-st>
      ${gauge(L.score, 200)}
      <div class="v-say">
        <span class="v-pill" data-v="${L.verdict}" data-conf="${conf?.level ?? ""}"><i></i>${esc(verdictText(v))}</span>
        <p class="v-line">${esc(line.replace(/^(Go, to test|Go|Pivot[^:]*|No-go[^:]*|Thin but testable): /i, (m) => (/^go, to test/i.test(m) ? "" : m)))}</p>
        ${conf ? `<p class="v-conf" data-conf="${conf.level}">${I.info(13)}<span>${esc(conf.note)}</span></p>` : ""}
      </div>
    </div>
    <dl class="facts f3 v-kpis" data-st>
      <div class="fact"><dt>Cash to start${est()}</dt><dd>${esc(S.cash_needed.display)}</dd></div>
      <div class="fact"><dt>Profitable from</dt><dd>${S.break_even.month != null ? `Month ${num(S.break_even.month, 0, "", "", 60)}` : "Not in year 1"}</dd></div>
      <div class="fact"><dt>Cash back</dt><dd>${back.month != null ? `${back.month > 12 ? "~" : ""}Month ${num(back.month, 0, "", "", 60)}` : "Not in plan"}</dd></div>
    </dl>
    <div data-st>${paceBar(v)}</div>
    ${v.risk ? `<div class="v-risk" data-st>
      <div><span class="lbl"><i class="dot neg"></i>Biggest risk</span><p>${esc(v.risk.risk)}</p></div>
      <div><span class="lbl"><i class="dot pos"></i>Cheapest test</span><p>${esc(v.risk.test)}</p></div>
    </div>` : ""}
    ${canBuild ? `<p class="v-buy" data-st><span class="v-buy-avs">${BUYS.map(([d]) => avatar(d, 20)).join("")}</span><span>${BUYS.map(([, t]) => t).join(" · ")}</span></p>` : ""}
    <div class="v-actions" data-st>
      ${canBuild ? `<button class="btn btn-primary btn-build" data-act="build" type="button"><span>Build it</span><span class="btn-price">${usd(v.cents.build)}</span></button>` : ""}
      ${L.verdict === "pivot" ? `<button class="btn btn-ghost" data-act="pivot" type="button">Try another idea</button>` : ""}
      <button class="btn btn-quiet" data-act="stop" type="button">Stop here</button>
    </div>
  </section>`;
}

// ───────────────────────────── level toasts: the scene is the reward, the toast only names it
export function levelUpPanel(v: View): string {
  return `
  <section class="lvl-toast">
    <div class="lt-ic" data-st>${I.check(22)}</div>
    <div class="lt-txt" data-st><span class="eyebrow">Launch kit</span><h2 class="t-display">${esc(v.name)} is live</h2><p class="sub">Your logo, your website and your 30-day plan are ready.</p></div>
    <button class="btn btn-primary" data-act="continue" type="button" data-st><span>Continue</span>${I.arrow(16)}</button>
  </section>`;
}

// ───────────────────────────── live: "your business"
/** `r7`: the v7 report (score, verdict, next steps). When given it replaces the v6 Leo score so the live card never
 *  disagrees with the report the founder just read. */
export function livePanel(v: View, r7?: { score: number; verdict: string; nextSteps: string[] } | null): string {
  const S = v.sam, L = v.leo, M = v.memo;
  const days = r7?.nextSteps.length ? r7.nextSteps.slice(0, 3) : M?.next_7_days ?? v.weeks[0]?.slice(0, 3).map((t) => t.task) ?? [];
  // the verdict words of the report (one vocabulary everywhere): an uncertain idea is something to test
  const V7: Record<string, string> = { go: "Go", pivot: "Test first", "no-go": "No-go" };
  return `
  <section class="biz">
    <div class="biz-site" data-st>${v.dex ? sitePreview(v, false, true) : ""}</div>
    <div class="biz-main">
      <header class="biz-top" data-st><span class="live-dot"></span><span class="eyebrow">Your website is live · <b>${esc(absUrl(v.pip?.url ?? ""))}</b></span></header>
      <div class="biz-brand" data-st style="--b-font:${stackOf(v.fonts.display)}">${brandLogo(v, 0, 30)}<p>${esc(v.brand?.tagline ?? "")}</p></div>
      <dl class="facts f3" data-st>
        ${r7 ? `<div class="fact"><dt>Score</dt><dd>${num(r7.score, 1)}<small> · ${esc(V7[r7.verdict] ?? r7.verdict)}</small></dd></div>` : L ? `<div class="fact"><dt>Score</dt><dd>${num(L.score, 1)}<small> · ${esc(verdictText(v))}</small></dd></div>` : ""}
        ${S ? `<div class="fact"><dt>Cash to start${est()}</dt><dd>${esc(S.cash_needed.display)}</dd></div>` : ""}
      </dl>
      <p class="biz-bch" data-st><i aria-hidden="true">₿</i><span>Your site takes <b>Bitcoin Cash pre-orders</b>, paid straight to your wallet. LaunchDesk never touches the money.</span></p>
      <div class="next7" data-st><span class="lbl">${r7?.nextSteps.length ? "Your next steps" : "Your next 7 days"}</span><ol>${days.map((d, i) => `<li><span class="n7-i">${i + 1}</span><span>${esc(d)}</span></li>`).join("")}</ol></div>
      <div class="biz-act" data-st>
        <button class="btn btn-primary" data-act="site" type="button"><span>Visit your site</span>${I.ext(14)}</button>
        <button class="btn btn-ghost" data-act="pack" type="button">${I.report(16)}<span>Full report</span></button>
        <button class="btn btn-quiet nl" data-act="next" type="button"><span>Offices · from 2¢</span>${I.arrow(14)}</button>
      </div>
    </div>
  </section>`;
}

// ───────────────────────────── your projects (WP4: no levels, no fake counters)
export function scalePanel(v: View, projects: number): string {
  return `
  <section class="lvl-toast scale">
    <div class="lt-ic" data-st>${I.arrow(22)}</div>
    <div class="lt-txt" data-st><span class="eyebrow">What's next</span><h2 class="t-display">${esc(v.name)} is ready</h2>
      <p class="sub">${projects > 1 ? `You have ${projects} projects.` : "Start another idea any time."}</p></div>
    <div class="scale-actions" data-st>
      <button class="btn btn-primary" data-act="new" type="button"><span>New idea</span>${I.arrow(16)}</button>
      <button class="btn btn-ghost" data-act="pack" type="button">${I.report(16)}<span>Full report</span></button>
      <button class="btn btn-ghost btn-icon" data-act="replay" type="button" aria-label="Replay" title="Replay">${I.replay(16)}</button>
    </div>
  </section>`;
}

export function siteOverlay(v: View): string {
  return `<section class="site-overlay"><button class="btn btn-ghost btn-icon so-close" data-act="close" type="button" aria-label="Close">${I.close(16)}</button>${sitePreview(v, true)}</section>`;
}

export const roomName = (d: Dept) => ROOM_META[d].name;
export { money };
