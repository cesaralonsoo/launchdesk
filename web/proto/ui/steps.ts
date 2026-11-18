// v7 · The surfaces, one per step (WS-EXP). Markup only; ui/index.ts mounts one at a time and wires data-act.
// Rules: one headline + one action per step; findings one at a time; the score only in the report and only built from
// the factor bars; every number traces back to a finding, its source, or says "Estimate".
import {
  BLOCK_IDS, BLOCK_LIBRARY, BUILD_TEAM, ROLE_LIBRARY, ROOM_META, hasBlocks, scoreDisplay,
  type Analyst, type AnalystRole, type BuildDept, type Finding, type FindingKind, type IdeaReport, type ReportPage,
  type ScalePath, type SteerChange, type SteerResult,
} from "../contracts";
import { brandSign, REPORT_PAGES, type ProtoFlowV7 } from "../flow";
import { esc } from "./dom";
import { I } from "./icons";
import { ldMark } from "./logo";
import { badge, levelGlyph } from "./pixel";
import { usd } from "./view";
import { statusLine } from "../live/adapter";
import { kitOfferHtml } from "./kit-screen";
import { knownExamples, mainExample, pausedHtml } from "./example";
import { fullSentences, leadLine, plainText, verdictWhy, VERDICT_RULE_V7 } from "../../../server/v7";
import { OFFICES } from "../../../server/offices/catalog";
import { projects as savedRuns } from "../../src/app/projects";

/** WP4: the Launch kit price, in cents (server config.priceCents.build). */
export const KIT_CENTS = 50;

export const KIND_LABEL: Record<FindingKind, string> = { fact: "Fact", number: "Number", competitor: "Competitor", risk: "Risk", strength: "Strength", estimate: "Estimate" };
// display words; the enum stays "pivot": an uncertain idea is something to test, not a failure
const VERDICT = { go: "Go", pivot: "Test first", "no-go": "No-go" } as const;
// Same clean-up as the report page (report-doc.ts): no [S9] labels, whole sentences only.
const plain = (t: string) => fullSentences(plainText(t), 40);
export const BUILD_DOING: Record<BuildDept, string> = { nova: "Choosing your name and colours", dex: "Drawing your logo", rae: "Writing your 30-day plan", pip: "Putting your website online" };
const BUILD_ROLE: Record<BuildDept, string> = { nova: "Brand", dex: "Logo", rae: "30-day plan", pip: "Website" };

export const who = (f: ProtoFlowV7, id: AnalystRole): Analyst =>
  f.roster.find((a) => a.id === id) ?? { id, role: id, name: ROLE_LIBRARY[id].name, color: ROLE_LIBRARY[id].color, mission: ROLE_LIBRARY[id].mission, why: "", weight: 0 };
export const builderBadge = (b: BuildDept, size = 30) => badge(ROOM_META[b].name, ROOM_META[b].color, size);
const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** Kind badge + text + the proof: the source domain (tap for the page) or "Estimate · basis". */
export function proof(f: Finding): string {
  if (f.source) return `<button class="src" type="button" data-act="source" data-f="${esc(f.id)}" title="${esc(f.source.title)}"><i></i><span>${esc(f.source.domain)}</span>${I.ext(12)}</button>`;
  return `<span class="estm" title="An estimate, not a measured fact"><b>Estimate</b>${f.basis ? ` · ${esc(f.basis)}` : ""}</span>`;
}
export function kindTag(f: Finding): string {
  const k = f.kind === "competitor" && f.competitor && !f.competitor.named ? "Competitor type" : KIND_LABEL[f.kind];
  return `<span class="kind" data-k="${f.kind}">${esc(k)}</span>`;
}

// ───────────────────────────── idea / end
/** Escrow on (VITE_ESCROW=1, as on the public demo): the home line says where the payment waits. */
const ESCROW_ON = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_ESCROW === "1";
/** The stage vocabulary (redesign PLAN.md 1): number, name, price, what you get, its dot colour. */
export const STAGES = [
  { n: 1, name: "Research", price: "10¢", gets: "Score, verdict, sources", c: "#4F7CF0" },
  { n: 2, name: "Launch kit", price: "50¢", gets: "Logo, live website, 30-day plan", c: "#E3893B" },
  { n: 3, name: "Offices", price: "from 2¢", gets: "Weekly work: posts, prices, replies", c: "#8C6BE8" },
] as const;
/** The idea box when the home (ui/home.ts) is not mounted, and the "Your turn" card. Same copy as the home hero.
 *  `paused`: the server takes no payments right now (GET /api/config paused:true): a calm notice instead of the price. */
export function ideaHtml(placeholder: string, value: string, end = false, paused = false): string {
  void placeholder;
  return `
  <form class="v-idea" autocomplete="off">
    <span class="v-eyebrow" data-st><i></i>Live on Bitcoin Cash mainnet</span>
    <h1 class="t-display" data-st>${end ? "Your turn." : "Check your business idea. <span>Then launch it.</span>"}</h1>
    <p class="v-sub" data-st>${ESCROW_ON ? "An AI team researches it with real sources and gives you an honest score. Your 10¢ waits in an on-chain contract until the report arrives." : "An AI team researches it with real sources and gives you an honest score. Paid in Bitcoin Cash."}</p>
    ${paused ? `<div data-st>${pausedHtml()}</div>` : `<div class="idea-field" data-st>
      <textarea name="idea" rows="2" maxlength="280" placeholder="e.g. A coffee kiosk at a Barcelona metro exit, €3 flat whites" aria-label="Your idea">${esc(value)}</textarea>
      <button type="button" class="idea-try" data-act="try-idea">Try an example</button>
      <button class="btn btn-primary btn-go" type="submit"><span>Check my idea</span><span class="btn-price">10¢</span></button>
    </div>`}
    <div class="v-alt" data-st>
      <button type="button" class="v-link" data-act="example"><b>See a finished company</b>${I.arrow(13)}<em>free · no wallet</em></button>
      <button type="button" class="v-link" data-act="tour"><span aria-hidden="true" class="v-play">▶</span><span>90-second tour</span></button>
    </div>
  </form>`;
}

// ───────────────────────────── pay
export function payHtml(f: ProtoFlowV7, stage: 1 | 2, customIdea: boolean): string {
  const cents = stage === 1 ? 10 : KIT_CENTS;
  const avs = stage === 1 ? f.roster.map((a) => badge(a.name, a.color, 26)).join("") : BUILD_TEAM.map((b) => builderBadge(b, 26)).join("");
  const title = stage === 1 ? "Research" : "Launch kit";
  const line = stage === 1 ? `${f.roster.length} analysts picked for this idea` : "Your logo · your website · your 30-day plan";
  return `
  <section class="pay">
    <header class="pay-top" data-st><span class="pay-merchant">${ldMark(18, undefined, true)}<b>LaunchDesk</b></span><span class="tag tag-demo">Sample · no payment</span></header>
    <div class="pay-amount" data-st><b class="huge">${usd(cents)}</b><span>in Bitcoin Cash</span></div>
    <div class="pay-line" data-st><div class="pay-avs">${avs}</div><div><b>${title}</b><span>${esc(line)}</span></div></div>
    <button class="btn btn-primary btn-pay" data-act="approve" type="button" data-st${f.paidCents >= (stage === 1 ? 10 : 10 + KIT_CENTS) /* flow/index.ts PAID_ALL = validate + kit */ ? ' data-state="done"' : ""}>
      <span class="b-lbl">Approve</span><span class="spin" aria-hidden="true"></span>
      <span class="tick" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1"/></svg></span>
    </button>
    ${stage === 1 && customIdea ? `<p class="pay-note" data-st>This tour plays a sample run: ${esc(f.project.title)}.</p>` : `<p class="pay-foot" data-st>${stage === 1 ? `On mainnet this 10¢ waits in a CashScript contract until the report arrives. <a href="/p/${esc(mainExample()?.id ?? "ex-coffee-bcn")}">See a real one ${I.ext(11)}</a>` : "Paid from your wallet. LaunchDesk never holds your keys."}</p>`}
  </section>`;
}

// ───────────────────────────── hire
/** The analyst's team name: the report section it writes (block contract), else its classic department. */
const deptOf = (f: ProtoFlowV7, a: Analyst) => {
  const b = hasBlocks((f.live?.project ?? f.project).v7) ? BLOCK_IDS.find((id) => BLOCK_LIBRARY[id].role === a.role) : undefined;
  return b ? BLOCK_LIBRARY[b].label : ROLE_LIBRARY[a.role].dept;
};
export function hireHtml(f: ProtoFlowV7): string {
  return `
  <section class="v-hire">
    <header class="v-head" data-st><span class="eyebrow px-eb">Hiring</span><h2 class="t-display">A team for this idea</h2></header>
    ${f.roster.length ? `<ol class="hires">${f.roster.map((a, i) => hireRow(a, i < f.hired, deptOf(f, a))).join("")}</ol>` : `<div class="ev-wait">${f.live?.error ? esc(f.live.error) : "Picking analysts for your idea"}<span class="dots"><i></i><i></i><i></i></span></div>`}
  </section>`;
}
const hireRow = (a: Analyst, on: boolean, dept: string) => `
  <li class="hire" data-on="${on ? 1 : 0}" data-id="${a.id}">
    ${badge(a.name, a.color, 34)}
    <div><b>${esc(a.name)} <em>${esc(dept)}</em></b><span>${esc(a.mission)}</span></div>
  </li>`;

// ───────────────────────────── evidence: one finding at a time
export function evidenceHtml(f: ProtoFlowV7, i: number): string {
  const fd = f.findings[i];
  const a = fd ? who(f, fd.analyst) : f.roster[0]!;
  const mine = f.findings.filter((x) => x.analyst === a.id);
  const k = fd ? mine.indexOf(fd) + 1 : 0;
  return `
  <section class="v-ev">
    <header class="ev-who">
      ${badge(a.name, a.color, 34)}
      <div><b>${esc(a.name)} <em>${esc(deptOf(f, a))}</em></b><span>${esc(a.mission)}</span></div>
      <span class="ev-k num">${k}<small>/${mine.length}</small></span>
    </header>
    <div class="ev-slot">${fd && i < f.revealed ? findingCard(fd) : evWait(f)}</div>
    ${evidenceFoot(f, i)}
  </section>`;
}
const WORK_WORD = { queued: "Up next", working: "Searching the web", done: "Done", error: "Skipped" } as const;
/** Before the first finding lands (real AI: 15–30 s): every analyst's live status, so the wait is never blank. */
export function evWait(f: ProtoFlowV7): string {
  const L = f.live;
  if (!L || !f.roster.length || L.error) return `<div class="ev-wait">${esc(L ? (L.error ?? statusLine(L.status)) : "Starting the research")}<span class="dots"><i></i><i></i><i></i></span></div>`;
  const work = L.project.v7.work;
  const rows = f.roster.map((a) => {
    const w = work.find((x) => x.analyst === a.role);
    const st = w?.status ?? "queued";
    const n = w?.findings.length ?? 0;
    return `<li data-s="${st}">${badge(a.name, a.color, 22)}<b>${esc(a.name)}</b><span class="et-m">${esc(a.mission)}</span><em>${st === "working" ? `${WORK_WORD.working}<span class="dots"><i></i><i></i><i></i></span>` : st === "done" ? `${n} found` : WORK_WORD[st]}</em></li>`;
  }).join("");
  const early = !work.some((w) => w.status === "done" || w.findings.length);
  return `<div class="ev-team"><ol>${rows}</ol>${early ? `<p>Each analyst searches the web live. First findings usually land in 15–30 s.</p>` : ""}</div>`;
}
export function findingCard(fd: Finding): string {
  const hero = fd.display ?? (fd.competitor?.price ? fd.competitor.price : "");
  const name = fd.competitor ? `<b class="fc-name">${esc(fd.competitor.name)}</b>` : "";
  return `
  <article class="fcard" data-k="${fd.kind}" data-sourced="${fd.source ? 1 : 0}" data-fid="${esc(fd.id)}">
    <div class="fc-top">${kindTag(fd)}${impact(fd)}</div>
    ${hero ? `<div class="fc-hero num">${esc(hero)}</div>` : ""}
    ${name}
    <p class="fc-text">${esc(fd.text)}</p>
    <div class="fc-proof">${proof(fd)}</div>
  </article>`;
}
function impact(fd: Finding): string {
  const v = fd.impact ?? 0;
  if (!v) return "";
  return `<span class="imp" data-v="${v > 0 ? "up" : "down"}" title="Effect on this factor">${v > 0 ? "+" : "−"}${Math.abs(v)}</span>`;
}
export function evidenceFoot(f: ProtoFlowV7, cur: number): string {
  const shown = f.findings.slice(0, f.revealed);
  const src = shown.filter((x) => x.source).length;
  const ready = scoreDisplay({ evidence: { total: shown.length, sourced: src, sourcedShare: 0, sources: [] } }) === "hero";
  const total = f.findings.length;
  const cells = f.findings.map((x, j) => `<button type="button" class="cell" data-act="peek" data-i="${j}" data-on="${j < f.revealed ? 1 : 0}" data-s="${x.source ? 1 : 0}" data-cur="${j === cur ? 1 : 0}" aria-label="Finding ${j + 1}" ${j < f.revealed ? "" : "disabled"}></button>`).join("");
  const L = f.live;
  const waiting = !!L && !L.phase1Done;
  const status = L && (waiting || L.error) ? `<div class="ev-status"${L.error ? ' data-err="1"' : ""}>${L.error ? esc(L.error) : `${esc(statusLine(L.status))}<span class="dots"><i></i><i></i><i></i></span>`}</div>` : "";
  return `
  <footer class="ev-foot">
    ${status}
    <div class="ev-cells" style="--n:${Math.max(total, 1)}">${cells}</div>
    <div class="ev-count"><span><b class="num">${shown.length}</b> finding${shown.length === 1 ? "" : "s"} · <b class="num">${src}</b> sourced</span>
      <span class="ev-unlock" data-ready="${ready ? 1 : 0}">${ready ? `${I.check(13)}Score unlocked` : "Score unlocks at 6 · 3 sourced"}</span></div>
    ${waiting ? "" : `<button class="btn btn-quiet ev-skip" data-act="next" type="button"><span>${f.revealed >= total ? "See the report" : "Skip to report"}</span>${I.arrow(14)}</button>`}
  </footer>`;
}


// ───────────────────────────── scale paths (owner update: every business can scale; choose how)
const PATH_KIND: Array<[RegExp, ScalePath["kind"], string]> = [
  [/franchis/i, "franchise", "Franchise it"],
  [/licen/i, "licensing", "License it"],
  [/online|subscription|app\b|delivery|e-?shop|web/i, "online", "Go online"],
  [/wholesale|b2b|gestor|caf[eé]s nearby|offices|companies|corporate/i, "b2b", "Sell to businesses"],
  [/second (city|country)|other (cities|countries|trades)|abroad|same model in/i, "new-markets", "New markets"],
  [/trained|runs .* without you|hire|barista|walkers paid/i, "team", "A team that runs it"],
  [/second|another|more (shops|stands|kiosks)|central workshop|two shops/i, "locations", "More locations"],
];
export function scalePaths(r: IdeaReport | null): ScalePath[] {
  if (!r) return [];
  const S = r.scalability;
  if (S.paths?.length) return S.paths;
  const used = new Set<string>();
  return S.wouldScale.map((how) => {
    // first matching kind not used yet, so two paths never share a label
    const all = PATH_KIND.filter(([re]) => re.test(how));
    const m = all.find(([, k]) => !used.has(k)) ?? all[0];
    if (m) used.add(m[1]);
    return { kind: m?.[1] ?? "product", label: m?.[2] ?? "Widen the offer", how, ease: S.score };
  });
}
/** How hard, in words, from the 0–10 scalability score (10 = a natural fit). */
export const easeWord = (n: number) => (n >= 7 ? "Natural fit" : n >= 4 ? "Doable with work" : "Hard, but possible");
export function pathList(f: ProtoFlowV7, act: boolean): string {
  const ps = scalePaths(f.report);
  return `<ol class="paths">${ps.map((p, i) => {
    const on = f.chosenPath === i;
    const inner = `<span class="pa-k">${i === 0 ? "Best path" : `Path ${i + 1}`}</span><b>${esc(p.label)}</b><span class="pa-how">${esc(p.how)}</span>`;
    return `<li>${act ? `<button type="button" data-act="path" data-i="${i}" aria-pressed="${on}">${inner}<em>${on ? `${I.check(13)}Chosen` : "Choose"}</em></button>` : `<div class="pa">${inner}</div>`}</li>`;
  }).join("")}</ol>`;
}

// ───────────────────────────── report (pages)
const PAGE_LABEL: Record<ReportPage, string> = { score: "Score", scale: "Scale", points: "Strengths", next: "Next" };
function reportHead(f: ProtoFlowV7, page: ReportPage, read = false): string {
  const i = REPORT_PAGES.indexOf(page);
  return `
  <header class="rp-head" data-st>
    <div><span class="eyebrow px-eb">${f.isSample(f.project.id) ? "Practice run · sample data" : "Your report"}</span><b class="rp-title">${esc(f.project.title)}</b></div>
    ${read ? "" : `<nav class="rp-dots" aria-label="Report pages">${REPORT_PAGES.map((p, j) => `<button type="button" data-act="page" data-page="${p}" aria-current="${j === i}" title="${PAGE_LABEL[p]}"><i></i><span>${PAGE_LABEL[p]}</span></button>`).join("")}</nav>`}
  </header>`;
}
function reportFoot(page: ReportPage): string {
  const i = REPORT_PAGES.indexOf(page);
  const nxt = REPORT_PAGES[i + 1];
  if (!nxt) return "";
  const label = { scale: "Can it scale?", points: "Strengths and weak points", next: "What to do next" }[nxt as "scale" | "points" | "next"];
  return `<footer class="rp-foot" data-st>${i > 0 ? `<button class="btn btn-quiet" data-act="prev" type="button">${I.back(14)}<span>Back</span></button>` : "<span></span>"}
    <button class="btn btn-primary btn-next" data-act="next" type="button"><span>${label}</span>${I.arrow(16)}</button></footer>`;
}
/** Ten pixel blocks: the score, filled block by block. */
export const meter = (score: number, cls = "") =>
  `<div class="meter ${cls}" style="--v:${score}" aria-hidden="true">${Array.from({ length: 10 }, (_, j) => `<i style="--j:${j};--f:${Math.max(0, Math.min(1, score - j))}"></i>`).join("")}</div>`;

/** v8: the one report surface for samples and the tour (PLAN.md 5.6): the same header as a live run's report (score card,
 *  factor bars, the formula), no pager. Strengths, scale and next steps stay one tap away (Full report). */
export function reportOneHtml(f: ProtoFlowV7): string {
  const r = f.report;
  if (!r) return `<section class="v-rp"><p>No report yet.</p></section>`;
  const canGrow = r.verdict !== "no-go";
  return `<section class="v-rp" data-page="score">
    <header class="rp-head" data-st>
      <div><span class="eyebrow px-eb">${f.isSample(f.project.id) ? "Verdict · sample data" : "Your verdict"}</span><b class="rp-title">${esc(f.project.title)}</b></div>
      ${f.demo ? "" : `<button class="btn btn-quiet rp-full" data-act="pack" type="button">${I.report(14)}<span>Full report</span></button>`}
    </header>
    ${scorePage(f, r)}
    ${f.demo ? "" : `<div class="rp-acts" data-st>
      ${canGrow ? `<button class="btn btn-primary btn-grow" data-act="grow" type="button"><span>Launch kit</span><span class="btn-price">50¢</span></button>` : `<button class="btn btn-primary" data-act="pivot" type="button"><span>Try another idea</span>${I.arrow(16)}</button>`}
      <button class="btn btn-ghost" data-act="steer" type="button"><span>Tell your team</span><em class="rp-free">free</em></button>
    </div>`}
  </section>`;
}

export function reportPage(f: ProtoFlowV7, page: ReportPage, read = false): string {
  const r = f.report;
  if (!r) return `<section class="v-rp"><p>No report yet.</p></section>`;
  const body = page === "score" ? scorePage(f, r) : page === "scale" ? scalePage(f, r) : page === "points" ? pointsPage(f, r) : nextPage(f, r, read);
  return `<section class="v-rp" data-page="${page}">${reportHead(f, page, read)}${body}${read ? "" : reportFoot(page)}</section>`;
}

function scorePage(f: ProtoFlowV7, r: IdeaReport): string {
  const hero = scoreDisplay(r) === "hero";
  const need = Math.max(0, 3 - r.evidence.sourced);
  const delay = 260 + r.factors.length * 260;
  return `
  <div class="sc-top" data-st>
    <div class="sc-num ${hero ? "" : "prov"}">
      <b class="num"><span class="n" data-count="${r.score}" data-dec="1" data-delay="${delay - 200}" data-ms="900">${one(r.score)}</span><small>/10</small></b>
      ${meter(r.score, "big")}
    </div>
    <div class="sc-v">
      <span class="vpill" data-v="${r.verdict}" title="${esc(VERDICT_RULE_V7)}">${VERDICT[r.verdict]}${hero ? "" : " · provisional"}</span>
      ${verdictWhy(r) ? `<p class="sc-ev">${esc(verdictWhy(r))}</p>` : ""}
      <p class="sc-line">${esc(r.reasons?.length ? leadLine(r.verdictLine) : r.verdictLine)}</p>
      <p class="sc-ev"><b class="num">${r.evidence.total}</b> findings · <b class="num">${r.evidence.sourced}</b> sourced · ${f.isSample(f.project.id) ? "<span>sample data</span>" : `<span data-c="${r.confidence}">${r.confidence} confidence</span>`}</p>
    </div>
  </div>
  ${hero ? "" : `<p class="sc-warn" data-st>${I.info(14)}<span>Provisional: ${need ? `needs ${need} more sourced finding${need > 1 ? "s" : ""}` : "needs at least 6 findings"} before this score counts.</span></p>`}
  <ol class="factors" data-st>${r.factors.map((x, j) => {
    const a = who(f, x.analyst);
    return `<li style="--d:${260 + j * 260}ms;--c:${a.color}">
      ${badge(a.name, a.color, 26)}
      <span class="fx-l"><b>${esc(x.label)}</b><em>${Math.round(x.weight * 100)}%</em></span>
      <span class="fx-bar"><i style="--w:${x.score / 10}"></i></span>
      <b class="fx-s num">${one(x.score)}</b>
      <span class="fx-src">${x.sourced}/${x.total} sourced</span>
    </li>`;
  }).join("")}</ol>
  ${r.math ? `<p class="sc-math num" data-st>${esc(r.math)}</p>` : ""}`;
}

function scalePage(f: ProtoFlowV7, r: IdeaReport): string {
  const S = r.scalability;
  const best = scalePaths(r)[0];
  return `
  <div class="sl-top" data-st>
    <div class="sc-num sm"><b class="num"><span class="n" data-count="${S.score}" data-dec="1" data-delay="200" data-ms="800">${one(S.score)}</span><small>/10</small></b>${meter(S.score)}</div>
    <div class="sc-v"><span class="eyebrow">Scalability · ${esc(easeWord(S.score))} · reach today: <b>${esc(S.reach)}</b></span>
      <p class="sc-line">${best ? `Best way to scale: ${esc(best.label.toLowerCase())}.` : "Every business can scale. Here is how."}</p>
      <p class="sc-why">${esc(S.why)}</p></div>
  </div>
  <div data-st>${pathList(f, false)}</div>
  <ul class="parts" data-st>${S.parts.map((p) => `<li><span>${esc(p.label)}</span><span class="pt-bar"><i style="--w:${p.score / 10}"></i></span><b class="num">${p.score}</b></li>`).join("")}</ul>`;
}

function pointsPage(f: ProtoFlowV7, r: IdeaReport): string {
  const row = (x: { text: string; finding: string }) => {
    const fd = f.findings.find((y) => y.id === x.finding);
    return `<li><button type="button" data-act="finding" data-f="${esc(x.finding)}"><span>${esc(x.text)}</span><em>${fd?.source ? esc(fd.source.domain) : "Estimate"}</em></button></li>`;
  };
  return `
  <div class="pts" data-st>
    <div class="pt-col" data-t="up"><span class="eyebrow">${I.check(13)}Strengths</span><ol>${r.strengths.map(row).join("")}</ol></div>
    <div class="pt-col" data-t="down"><span class="eyebrow">${I.info(13)}Weak points</span><ol>${r.weaknesses.map(row).join("")}</ol></div>
  </div>`;
}

function nextPage(f: ProtoFlowV7, r: IdeaReport, read: boolean): string {
  const canGrow = r.verdict !== "no-go"; // v8: the scalability cap gates nothing
  return `
  <ol class="steps7" data-st>${r.nextSteps.map((s, i) => `<li><span class="n7">${i + 1}</span><span>${esc(s)}</span></li>`).join("")}</ol>
  ${r.pivot ? `<div class="pivot" data-st><span class="eyebrow">A change worth testing</span><p><b>${esc(plainText(r.pivot.idea).replace(/[.…]+$/, ""))}.</b> ${esc(plain(r.pivot.why))}</p></div>` : ""}
  ${read ? "" : `<div class="rp-acts" data-st>
    ${canGrow ? `<button class="btn btn-primary btn-grow" data-act="grow" type="button"><span>Launch kit</span><span class="btn-price">50¢</span></button>` : `${r.verdict === "no-go" ? `<button class="btn btn-ghost" data-act="grow" type="button"><span>Build the launch kit anyway</span></button>` : ""}<button class="btn btn-primary" data-act="pivot" type="button"><span>Try another idea</span>${I.arrow(16)}</button>`}
    <button class="btn btn-ghost" data-act="steer" type="button"><span>Tell your team</span></button>
  </div>
  ${canGrow ? "" : `<p class="rp-note" data-st>Not every idea should grow. A No-go for 10¢ is a result too.</p>`}`}`;
}

// ───────────────────────────── steer (CEO notes)
export function steerSuggestions(f: ProtoFlowV7): string[] {
  const coffee = /coffee|caf/i.test(f.project.idea);
  return coffee
    ? ["Focus on office workers, not tourists", "Test a lower price", "What would make it scale?"]
    : ["Focus on a narrower customer", "Test a lower price", "What would make it scale?"];
}
export function steerHtml(f: ProtoFlowV7, draft: string): string {
  const s = f.steering;
  const left = f.steersLeft;
  return `
  <section class="v-steer">
    <header class="v-head" data-st><span class="eyebrow px-eb">You're the CEO</span><h2 class="t-display">Tell your team</h2></header>
    ${s ? steerResultHtml(f, s) : ""}
    ${f.steerError ? `<p class="st-err" role="alert">${esc(f.steerError)}</p>` : ""}
    ${!s || s.status === "done" ? `
    <form class="steer-f" data-st autocomplete="off">
      <div class="idea-field sm"><textarea name="note" rows="1" maxlength="280" placeholder="Focus it like this…" aria-label="Note to your team">${esc(draft)}</textarea>
      <button class="btn btn-primary" type="submit" ${left ? "" : "disabled"}><span>Send</span></button></div>
      ${s ? "" : `<div class="sugg">${steerSuggestions(f).map((x) => `<button type="button" data-act="suggest">${esc(x)}</button>`).join("")}</div>`}
      <p class="steer-left">${left ? `${left} note${left > 1 ? "s" : ""} left on this stage · free` : "No notes left on this stage"}</p>
    </form>` : ""}
    ${s?.status === "done" ? `<footer class="rp-acts" data-st>
      ${f.report?.verdict !== "no-go" ? `<button class="btn btn-primary btn-grow" data-act="grow" type="button"><span>Launch kit</span><span class="btn-price">50¢</span></button>` : ""}
      <button class="btn btn-ghost" data-act="report" type="button"><span>See the new report</span></button></footer>` : ""}
  </section>`;
}
function steerResultHtml(f: ProtoFlowV7, s: SteerResult): string {
  const team = s.rerun.map((id) => who(f, id));
  const working = s.status === "working";
  return `
  <div class="st-thread" data-st>
    <p class="st-me"><span>${esc(s.note)}</span></p>
    <div class="st-team"><span class="st-avs">${team.map((a) => badge(a.name, a.color, 24)).join("")}</span>
      <p>${esc(s.ack)}${working ? `<span class="dots"><i></i><i></i><i></i></span>` : ""}</p></div>
    ${working ? "" : `<ul class="diffs">${s.changes.length ? s.changes.map((c) => diffChip(f, c)).join("") : `<li class="diff"><span>No number moved. ${s.findings.length ? `${s.findings.length} new finding${s.findings.length > 1 ? "s" : ""}.` : ""}</span></li>`}</ul>`}
  </div>`;
}
function diffChip(f: ProtoFlowV7, c: SteerChange): string {
  const label = c.what === "factor" && c.key ? ROLE_LIBRARY[c.key as AnalystRole]?.dept ?? c.key : c.what === "score" ? "Score" : c.what === "scalability" ? "Scalability" : c.what === "verdict" ? "Verdict" : c.what === "roster" ? "Team" : "Finding";
  const b = c.before, a = c.after;
  const dir = typeof b === "number" && typeof a === "number" ? (a > b ? "up" : a < b ? "down" : "") : "";
  const fmt = (v: string | number | null) => (v == null ? "–" : typeof v === "number" ? one(v) : v);
  void f;
  // a changed finding reads as a sentence, not as "before → after" text blocks
  if (c.what === "finding" || (typeof a === "string" && a.length > 24)) {
    return `<li class="diff diff-f" data-d="${b == null ? "new" : "changed"}"><b>${b == null ? "New finding" : "Updated finding"}</b><span class="df-t">${esc(fmt(a))}</span></li>`;
  }
  return `<li class="diff" data-d="${dir}"><b>${esc(label)}</b><span class="num">${esc(fmt(b))}</span>${I.arrow(12)}<span class="num to">${esc(fmt(a))}</span><em>${esc(c.why)}</em></li>`;
}

// ───────────────────────────── growth moments
/** WP4: after the report, one card that says what the Launch kit gives you and what it costs. */
export function floorHtml(_f: ProtoFlowV7): string {
  return kitOfferHtml(KIT_CENTS);
}
export function workTag(b: BuildDept): string {
  return `${builderBadge(b, 30)}<span class="wt-t"><b>${ROOM_META[b].name} <em>${BUILD_ROLE[b]}</em></b><span>${BUILD_DOING[b]}<span class="dots"><i></i><i></i><i></i></span></span></span>`;
}
export function analystTag(a: Analyst): string {
  return `<i style="background:${a.color}"></i><span>${esc(a.name)}</span>`;
}

/** v8 · Offices (world level 2, PLAN.md 4.2): the four offices of floor 2 with their real catalog prices. The rooms
 *  light in 3D only when a real task is done (game/store.ts); this card says what each office does and what it costs. */
export function officesFloorHtml(f: ProtoFlowV7, brand: string): string {
  const sample = f.demo || !f.live;
  const from = Math.min(...OFFICES.flatMap((o) => o.tasks.map((t) => t.cents)));
  return `
  <section class="v-offices">
    <header class="v-head" data-st><span class="eyebrow px-eb"><i class="st-dot" style="--c:${STAGES[2].c}">3</i>Offices · from ${from}¢ a task${sample ? ` <em class="tag tag-demo">Sample</em>` : ""}</span>
      <h2 class="t-display">${esc(brand)}'s offices</h2>
      <p class="v-lede">Four offices keep working after the launch. You see the price before anything runs.</p></header>
    <ul class="of-rooms" data-st>${OFFICES.map((o) => {
      const min = Math.min(...o.tasks.map((t) => t.cents));
      return `<li><b>${esc(o.name)}</b><span>${esc(o.tasks.map((t) => t.title).join(" · "))}</span><em class="num">${o.tasks.length > 1 ? "from " : ""}${min}¢</em></li>`;
    }).join("")}</ul>
    ${f.demo ? "" : sample
      ? `<footer class="rp-acts" data-st><button class="btn btn-primary" data-act="new" type="button"><span>Check your own idea</span><span class="btn-price">10¢</span></button></footer>`
      : `<footer class="rp-acts" data-st><button class="btn btn-primary" data-act="open-offices" type="button"><span>Open the offices</span>${I.arrow(16)}</button></footer>`}
  </section>`;
}

/** v8 · Campus (world level 3, PLAN.md 4.3): every idea of this browser, each a building; the finished examples are
 *  labelled as examples. */
export function campusHtml(f: ProtoFlowV7): string {
  return `
  <section class="v-campus">
    <header class="v-head"><span class="eyebrow px-eb"><i class="st-dot" style="--c:#3A9D8F">4</i>Campus</span>
      <h2 class="t-display">Your companies</h2>
      <p class="v-lede">One building per idea. Open one to go inside.</p></header>
    ${companiesList(f)}
    <footer class="rp-acts"><button class="btn btn-primary" data-act="new" type="button"><span>Check your next idea</span><span class="btn-price">10¢</span></button></footer>
  </section>`;
}

/** The campus card's list (polish): every building on the plate, labelled Sample / Example / Yours, with its stage and
 *  score. Compact: one line per company. No stagger (data-st): the card is never caught blank mid-fade. */
function companiesList(f: ProtoFlowV7): string {
  const verdictOf = (v: string | undefined) => (v ? ({ go: "Go", pivot: "Test first", "no-go": "No-go" } as Record<string, string>)[v] ?? v : "");
  const finished = knownExamples();
  type Row = { id: string; name: string; tag: "Sample" | "Example" | "Yours"; stage: string; score: number | null; verdict?: string; at?: "report" };
  const rows: Row[] = [];
  if (f.isSample(f.project.id))
    rows.push({ id: f.project.id, name: brandSign(f.project)?.name ?? f.project.title, tag: "Sample", stage: "Tour data · report + launch kit", score: f.report?.score ?? null, verdict: f.report?.verdict });
  for (const x of finished) rows.push({ id: x.id, name: x.title, tag: "Example", stage: "Real run · report + launch kit", score: x.verdict?.score ?? null, verdict: x.verdict?.verdict, at: "report" });
  const mine = f.mine.filter((p) => !finished.some((x) => x.id === p.id) && !/^ex-/.test(p.id)).map((m) => f.projects.find((x) => x.id === m.id) ?? m);
  for (const p of mine) {
    const sv = savedRuns.get(p.id);
    const stage = { new: "Not paid yet", validating: "Research running", validated: "Report ready", building: "Launch kit in progress", live: "Launch kit ready" }[sv?.stage ?? "new"];
    rows.push({ id: p.id, name: p.title, tag: "Yours", stage, score: p.v7.report?.score ?? sv?.score ?? null, verdict: p.v7.report?.verdict ?? sv?.verdict ?? undefined });
  }
  if (!rows.length) return `<p class="of-sub">Nothing here yet. Your first idea gets the first building.</p>`;
  return `<ul class="cp-list">${rows
    .map(
      (r) => `<li><button type="button" data-act="switch" data-id="${esc(r.id)}"${r.at ? ` data-at="${r.at}"` : ""} aria-current="${r.id === f.project.id}">
        <span class="cp-t"><b>${esc(r.name)}</b><span><em class="cp-tag" data-tag="${r.tag.toLowerCase()}">${r.tag}</em>${esc(r.stage)}</span></span>
        <span class="cp-r">${r.score != null ? `<b class="num">${one(r.score)}</b><em>${esc(verdictOf(r.verdict))}</em>` : `<em>No score yet</em>`}</span>
      </button></li>`,
    )
    .join("")}</ul>`;
}

/** v8 · The tour's last card (PLAN.md 5.6): what the visitor just saw, the price of each step, and their turn. */
export function recapHtml(): string {
  return `
  <section class="v-recap">
    <header class="v-head" data-st><span class="eyebrow px-eb">End of the tour · sample data</span><h2 class="t-display">Your turn.</h2></header>
    <ol class="recap" data-st>
      <li><i class="st-dot" style="--c:${STAGES[0].c}">1</i><span><b>A verdict</b>10¢, held in an escrow contract until the report arrives</span></li>
      <li><i class="st-dot" style="--c:${STAGES[1].c}">2</i><span><b>A launch kit</b>50¢ for a logo, a live website and a 30-day plan</span></li>
      <li><i class="st-dot" style="--c:${STAGES[2].c}">3</i><span><b>An office task</b>from 2¢, priced before it runs</span></li>
    </ol>
    <footer class="rp-acts" data-st>
      <button class="btn btn-primary" data-act="new" type="button"><span>Check my idea</span><span class="btn-price">10¢</span></button>
      <button class="btn btn-ghost" data-act="replay" type="button">${I.replay(15)}<span>Replay</span></button>
      <button class="btn btn-quiet" data-act="example" type="button"><span>See a finished company</span>${I.arrow(14)}</button>
    </footer>
  </section>`;
}

// ───────────────────────────── overlays
export function sourceHtml(fd: Finding, a: Analyst): string {
  const s = fd.source;
  return `
  <section class="src-ov">
    <button class="btn btn-ghost btn-icon ov-x" data-act="close" type="button" aria-label="Close">${I.close(16)}</button>
    <header class="ev-who">${badge(a.name, a.color, 30)}<div><b>${esc(a.name)} <em>${esc(ROLE_LIBRARY[a.role].dept)}</em></b><span>${kindTag(fd)}</span></div></header>
    <p class="so-text">${esc(fd.text)}</p>
    ${s ? `<div class="so-src"><span class="eyebrow">Source</span><b>${esc(s.title)}</b><span class="so-url">${esc(s.url)}</span><span class="so-acc">Read on ${esc(s.accessed)}</span>
      <a class="btn btn-primary" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><span>Open the page</span>${I.ext(14)}</a></div>`
    : `<div class="so-src est"><span class="eyebrow">Estimate</span><b>No web source for this one.</b><span>${esc(fd.basis ?? "A desk estimate from the analyst.")}</span></div>`}
  </section>`;
}

/** "My ideas": this browser's runs, newest first, then the finished examples (real runs, labelled). */
function ideasList(f: ProtoFlowV7): string {
  const verdictOf = (v: string | undefined) => (v ? ({ go: "Go", pivot: "Test first", "no-go": "No-go" } as Record<string, string>)[v] ?? v : "");
  const finished = knownExamples();
  const mine = f.mine.filter((p) => !finished.some((x) => x.id === p.id) && !/^ex-/.test(p.id)).map((m) => f.projects.find((x) => x.id === m.id) ?? m);
  const row = (p: (typeof f.projects)[number]) => {
    const r = p.v7.report;
    // This browser's saved row knows the score and how far the run got, even before the run is opened again.
    const sv = savedRuns.get(p.id);
    const score = r?.score ?? sv?.score ?? null;
    const verdict = r?.verdict ?? sv?.verdict ?? undefined;
    const stage = { new: "Not paid yet", validating: "Research running", validated: "Report ready", building: "Launch kit in progress", live: "Launch kit ready" }[sv?.stage ?? "new"];
    const sub = p.idea.trim() && p.idea.trim() !== p.title.trim() ? p.idea : stage;
    return `<li><button type="button" data-act="switch" data-id="${esc(p.id)}" aria-current="${p.id === f.project.id}">
        <span class="of-t"><b>${esc(p.title)}</b><span>${esc(sub)}</span></span>
        <span class="of-r">${score != null ? `<b class="num">${one(score)}</b><em>${esc(verdictOf(verdict ?? undefined))}</em>` : `<em>${esc(stage)}</em>`}</span>
      </button></li>`;
  };
  return `${mine.length ? `<ul class="of-list">${mine.map(row).join("")}</ul>` : `<p class="of-sub">${f.demo || !f.live ? "Your own ideas are not here yet: the sample building is tour data." : "Nothing yet. Your first idea will be here."}</p>`}
    ${finished.length ? `<p class="of-sec">Finished examples · real runs</p>
    <ul class="of-list">${finished.map((x) => `<li><button type="button" data-act="switch" data-id="${esc(x.id)}" data-at="report">
        <span class="of-t"><b>${esc(x.title)}<span class="of-tag">Example</span></b><span>${esc(x.run)} · ${esc(x.paid)}</span></span>
        <span class="of-r">${x.verdict ? `<b class="num">${one(x.verdict.score)}</b><em>${esc(verdictOf(x.verdict.verdict))}</em>` : ""}</span>
      </button></li>`).join("")}</ul>` : ""}`;
}
export function officesHtml(f: ProtoFlowV7): string {
  return `
  <section class="offices">
    <header class="of-head"><h2 class="t-display">My ideas</h2><button class="btn btn-ghost btn-icon ov-x" data-act="close" type="button" aria-label="Close">${I.close(16)}</button></header>
    ${ideasList(f)}
    <button class="btn btn-primary of-new" data-act="new" type="button"><span>New idea</span>${I.arrow(16)}</button>
  </section>`;
}

export function reportReader(f: ProtoFlowV7): string {
  return `<section class="reader"><button class="btn btn-ghost btn-icon ov-x" data-act="close" type="button" aria-label="Close">${I.close(16)}</button>${REPORT_PAGES.map((p) => reportPage(f, p, true)).join("")}</section>`;
}

/** A sample with no phase-2 output (forn, for instance): an honest card instead of an empty panel. */
export function noBuildHtml(b: BuildDept | null): string {
  return `
  <section class="v-lvl">
    <div class="lv-g" data-st>${b ? builderBadge(b, 30) : levelGlyph(1, 30)}</div>
    <div class="lv-t" data-st><span class="eyebrow px-eb">${b ? BUILD_ROLE[b] : "Launch kit"}</span><h2 class="t-display">No launch kit in this example</h2>
      <p>This sample stops at the report. The finished example shows a full launch kit.</p></div>
    <button class="btn btn-primary" data-act="next" type="button" data-st><span>Next</span>${I.arrow(16)}</button>
  </section>`;
}
