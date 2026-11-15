// The non-result surfaces (WS-C): idea popup, pay sheet, verdict, level-up, live, scale, pack.
import { ROOM_META, type Dept } from "../contracts";
import { IDEA } from "../data";
import {
  BRAND, BRAND_FONTS, BRAND_NAME, CENTS, DEX, LEO, NOVA, PIP, POSTS, PREORDER_GOAL, RISK, SAM, TASKS, pal, usd,
} from "../data/sample";
import { brandTile, logo, ring } from "./cards";
import { esc } from "./dom";
import { I, avatar } from "./icons";

const num = (v: number, dec = 0, pre = "", suf = "", delay = 160) =>
  `<span class="n" data-count="${v}" data-dec="${dec}" data-pre="${esc(pre)}" data-suf="${esc(suf)}" data-delay="${delay}">${pre}${v.toFixed(dec)}${suf}</span>`;

// ───────────────────────────────────────────── idea

/** Headline, one field, one button with the price in it. One muted line says what you leave with. */
export function ideaPanel(idea: string): string {
  return `
  <form class="idea" autocomplete="off">
    <div class="idea-h" data-st>
      <h1 class="t-display">What's your idea?</h1>
      <p class="idea-sub">Seven AI specialists turn it into a live business.</p>
    </div>
    <div class="idea-field" data-st>
      <textarea name="idea" rows="2" maxlength="280" placeholder="${esc(IDEA)}" aria-label="Your idea">${idea && idea !== IDEA ? esc(idea) : ""}</textarea>
      <button class="btn btn-primary btn-go" type="submit"><span>Validate</span><span class="btn-price">${usd(CENTS.validate)}</span></button>
    </div>
    <ol class="idea-out" data-st aria-label="What you get">
      <li>${I.report(15)}<span>Report</span></li><li>${I.brand(15)}<span>Brand</span></li><li>${I.globe(15)}<span>Live site</span></li>
    </ol>
  </form>`;
}

// ───────────────────────────────────────────── pay (Apple Pay-like)

export function payPanel(stage: "validate" | "build", idea = IDEA): string {
  const depts: Dept[] = stage === "validate" ? ["mia", "leo", "sam"] : ["nova", "dex", "rae", "pip"];
  const cents = CENTS[stage];
  const title = stage === "validate" ? "Validate your idea" : "Build and launch";
  const who = stage === "validate" ? "Plan · Market · Numbers" : "Brand · Site · Launch plan";
  const sample = stage === "validate" && idea.trim() !== IDEA.trim();
  return `
  <section class="pay" data-stage="${stage}">
    <header class="pay-top" data-st><span class="pay-merchant">${I.wallet(16)}<b>LaunchDesk</b></span><span class="tag">Prototype · no payment</span></header>
    <div class="pay-line" data-st>
      <div class="pay-avs">${depts.map((d) => avatar(d, 26)).join("")}</div>
      <div><b>${title}</b><span>${who}</span></div>
    </div>
    <div class="pay-amount" data-st><b class="huge">${usd(cents)}</b><span>in Bitcoin Cash</span></div>
    <button class="btn btn-primary btn-pay" data-act="approve" type="button" data-st>
      <span class="b-lbl">Approve</span><span class="spin" aria-hidden="true"></span>
      <span class="tick" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1"/></svg></span>
    </button>
    ${sample ? `<p class="pay-note" data-st>Demo shows a sample: ${esc(BRAND_NAME)}, coffee kiosk.</p>` : `<p class="pay-foot" data-st>LaunchDesk never holds your keys.</p>`}
  </section>`;
}

// ───────────────────────────────────────────── verdict

export function verdictPanel(): string {
  const verdict = LEO.verdict === "go" ? "Go" : LEO.verdict === "pivot" ? "Pivot first" : "No-go";
  return `
  <section class="verdict">
    <header class="v-top" data-st>
      <span class="eyebrow">Your report</span>
      <span class="v-avs">${avatar("mia", 22)}${avatar("leo", 22)}${avatar("sam", 22)}</span>
    </header>
    <div class="v-hero" data-st>
      <div class="score">${ring(LEO.score, 96, 8)}<b class="big">${num(LEO.score, 1)}</b></div>
      <div class="v-say"><span class="pill pill-pos">${verdict}</span><p class="headline">${esc(LEO.headline)}</p></div>
    </div>
    <dl class="kpis kpis-3" data-st>
      <div><dt>Cash needed</dt><dd>${num(Math.round(SAM.cash_needed.value / 1000), 0, SAM.currency, "k")}</dd></div>
      <div><dt>Break-even</dt><dd>${SAM.break_even.month != null ? `Month ${num(SAM.break_even.month)}` : "Not in year 1"}</dd></div>
      <div><dt>Price</dt><dd>${num(SAM.price.value, 2, SAM.currency)}</dd></div>
    </dl>
    <div class="v-risk" data-st>
      <div><span class="lbl">Biggest risk</span><p>${esc(RISK.risk)}</p></div>
      <div><span class="lbl">Cheapest test</span><p>${esc(RISK.test)}</p></div>
    </div>
    <div class="v-actions" data-st>
      <div class="v-next"><span class="v-avs">${avatar("nova", 24)}${avatar("dex", 24)}${avatar("rae", 24)}${avatar("pip", 24)}</span><span>Brand · Site · Launch plan</span></div>
      <button class="btn btn-primary btn-build" data-act="build" type="button"><span>Build it</span><span class="btn-price">${usd(CENTS.build)}</span></button>
      <div class="v-quiet">
        ${LEO.verdict === "pivot" ? `<button class="btn btn-ghost" data-act="pivot" type="button">Pivot</button>` : ""}
        <button class="btn btn-ghost" data-act="stop" type="button">Stop here</button>
      </div>
    </div>
  </section>`;
}

// ───────────────────────────────────────────── level toasts (the scene is the reward; the toast only names it)

export function levelUpPanel(): string {
  return `
  <section class="lvl-toast">
    <span class="eyebrow" data-st>Level 2</span>
    <h2 class="t-display" data-st>Building unlocked</h2>
    <p class="sub" data-st>${esc(BRAND_NAME)} is live. Your office is now floor 1.</p>
    <button class="btn btn-primary" data-act="continue" type="button" data-st><span>Continue</span>${I.arrow(16)}</button>
  </section>`;
}

// ───────────────────────────────────────────── live

export function sitePreview(full = false): string {
  const L = DEX.landing;
  return `<div class="site ${full ? "full" : ""}" style="--s-bg:${pal("Background")};--s-ink:${pal("Primary")};--s-acc:${pal("Accent")};--s-font:'${BRAND_FONTS.display}', Georgia, serif;--s-body:'${BRAND_FONTS.body}', system-ui, sans-serif">
    <div class="site-bar"><i></i><i></i><i></i><span class="site-url">${I.lock(11)}<span>${esc(PIP.url)}</span></span></div>
    <div class="site-body">
      <div class="site-nav">${logo(0, "sm")}<span>${esc(L.where_when ?? "")}</span></div>
      <h3>${esc(L.headline)}</h3>
      <p>${esc(L.subheadline)}</p>
      <span class="site-cta">${esc(L.cta)}</span>
      <span class="site-pay">Pay with Bitcoin Cash, straight to ${esc(BRAND_NAME)}'s wallet.</span>
      ${full ? `<ul class="site-bul">${L.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
    </div>
  </div>`;
}

export function livePanel(): string {
  return `
  <section class="live">
    <header class="live-top" data-st>
      <span class="live-dot"></span><span class="eyebrow">Live</span>
    </header>
    <h2 class="t-display" data-st>${esc(BRAND_NAME)} is live</h2>
    <div data-st>${sitePreview()}</div>
    <div class="live-stats" data-st>
      <div><b class="mid">${num(0)}</b><span>pre-orders</span></div>
      <div><b class="mid">${esc(DEX.landing.cta.replace(/^Pre-order for /, ""))}</b><span>pre-order price</span></div>
    </div>
    <div class="live-actions" data-st>
      <button class="btn btn-primary" data-act="pack" type="button">${I.pack(16)}<span>Open your pack</span></button>
      <button class="btn btn-ghost" data-act="site" type="button"><span>Visit site</span>${I.ext(14)}</button>
    </div>
    <button class="next-level" data-act="continue" type="button" data-st>
      <span class="g-ic">${I.district(18)}</span>
      <span><b>Next level</b><em>District · ${PREORDER_GOAL} pre-orders</em></span>
      ${I.arrow(16)}
    </button>
  </section>`;
}

// ───────────────────────────────────────────── scale (level 3 horizon)

export function scalePanel(): string {
  return `
  <section class="lvl-toast scale">
    <span class="eyebrow" data-st>Level 3 · next</span>
    <h2 class="t-display" data-st>Grow into a district</h2>
    <div class="unlock" data-st>
      <div class="u-row"><span>Pre-orders</span><b>${num(0)} / ${PREORDER_GOAL}</b></div>
      <div class="u-bar"><i style="--v:0"></i></div>
    </div>
    <div class="scale-actions" data-st>
      <button class="btn btn-primary" data-act="pack" type="button">${I.pack(16)}<span>Open your pack</span></button>
      <button class="btn btn-ghost" data-act="new" type="button">New idea</button>
      <button class="btn btn-ghost btn-icon" data-act="replay" type="button" aria-label="Replay">${I.replay(16)}</button>
    </div>
  </section>`;
}

// ───────────────────────────────────────────── pack (overlay)

export function packPanel(): string {
  const row = (d: Dept, what: string, value: string) =>
    `<li data-st>${avatar(d, 26)}<span class="p-what"><b>${what}</b><em>${ROOM_META[d].name}</em></span><span class="p-val">${value}</span></li>`;
  return `
  <section class="pack">
    <header class="pack-top" data-st>
      <div><span class="eyebrow">Startup pack</span><h2 class="t-display">${esc(BRAND_NAME)}</h2></div>
      <button class="btn btn-ghost btn-icon" data-act="close" type="button" aria-label="Close">${I.close(16)}</button>
    </header>
    <div class="pack-brand" data-st>${brandTile(false)}</div>
    <ul class="pack-list">
      ${row("mia", "Plan", `${TASKS.length} tasks · 4 weeks`)}
      ${row("leo", "Market score", `${LEO.score.toFixed(1)} · Go`)}
      ${row("sam", "Cash to start", `${SAM.cash_needed.display} · break-even month ${SAM.break_even.month}`)}
      ${row("nova", "Name", `${esc(BRAND.name)} + ${NOVA.names.length - 1} more`)}
      ${row("dex", "Logos and page", `${DEX.logos.length} logos`)}
      ${row("rae", "Launch plan", `${POSTS.length} posts · 30 days`)}
      ${row("pip", "Live site", `${esc(PIP.url)}`)}
    </ul>
    <p class="pack-foot" data-st>AI output is guidance, not financial or legal advice.</p>
  </section>`;
}

export function siteOverlay(): string {
  return `<section class="site-overlay"><button class="btn btn-ghost btn-icon so-close" data-act="close" type="button" aria-label="Close">${I.close(16)}</button>${sitePreview(true)}</section>`;
}

