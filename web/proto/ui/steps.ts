// v7 · The surfaces, one per step (WS-EXP). Markup only; ui/index.ts mounts one at a time and wires data-act.
// Rules: one headline + one action per step; findings one at a time; the score only in the report and only built from
// the factor bars; every number traces back to a finding, its source, or says "Estimate".
import {
  BLOCK_IDS, BLOCK_LIBRARY, BUILD_TEAM, LEVEL_META, ROLE_LIBRARY, ROOM_META, hasBlocks, scoreDisplay,
  type Analyst, type AnalystRole, type BuildDept, type Finding, type FindingKind, type IdeaReport, type ReportPage,
  type ScalePath, type SteerChange, type SteerResult, type WorldLevel,
} from "../contracts";
import { REPORT_PAGES, type ProtoFlowV7 } from "../flow";
import { esc } from "./dom";
import { I } from "./icons";
import { ldMark } from "./logo";
import { badge, levelGlyph } from "./pixel";
import { usd } from "./view";
import { statusLine } from "../live/adapter";
import { kitOfferHtml } from "./kit-screen";
import { exampleButtonHtml, knownExamples, pausedHtml } from "./example";
import { fullSentences, leadLine, plainText, verdictWhy, VERDICT_RULE_V7 } from "../../../server/v7";

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
/** `paused`: the server takes no payments right now (GET /api/config paused:true): a calm notice instead of the price. */
export function ideaHtml(placeholder: string, value: string, end = false, paused = false): string {
  return `
  <form class="v-idea" autocomplete="off">
    ${end ? `<div class="v-mark" data-st>${ldMark(40, undefined, true)}</div>` : ""}
    <h1 class="t-display" data-st>${end ? "Your turn." : "Turn your idea into a company."}</h1>
    ${end ? "" : `<p class="v-sub" data-st>An AI team researches it with real sources, scores it and builds it. Pay in BCH.${ESCROW_ON ? ` Your payment waits in an on-chain contract: released with the report's fingerprint, or refunded if no report comes.` : ""}</p>`}
    ${paused ? `<div data-st>${pausedHtml()}</div>` : `<div class="idea-field" data-st>
      <textarea name="idea" rows="2" maxlength="280" placeholder="${esc(placeholder)}" aria-label="Your idea">${esc(value)}</textarea>
      <button class="btn btn-primary btn-go" type="submit"><span>Validate</span><span class="btn-price">${usd(10)}</span></button>
    </div>`}
    ${paused ? "" : `<div class="ex-slot" data-st>${exampleButtonHtml()}</div>`}
    <div class="v-alt" data-st>
      <button type="button" class="v-link" data-act="tour">${I.replay(14)}<span>Watch the tour · 2 min</span></button>
    </div>
  </form>`;
}

// ───────────────────────────── pay
export function payHtml(f: ProtoFlowV7, stage: 1 | 2, customIdea: boolean): string {
  const cents = stage === 1 ? 10 : KIT_CENTS;
  const avs = stage === 1 ? f.roster.map((a) => badge(a.name, a.color, 26)).join("") : BUILD_TEAM.map((b) => builderBadge(b, 26)).join("");
  const title = stage === 1 ? "Validate your idea" : "Launch kit";
  const line = stage === 1 ? `${f.roster.length} analysts picked for this idea` : "Your logo · your website · your 30-day plan";
  return `
  <section class="pay">
    <header class="pay-top" data-st><span class="pay-merchant">${ldMark(18, undefined, true)}<b>LaunchDesk</b></span><span class="tag">Prototype · no payment</span></header>
    <div class="pay-amount" data-st><b class="huge">${usd(cents)}</b><span>in Bitcoin Cash</span></div>
    <div class="pay-line" data-st><div class="pay-avs">${avs}</div><div><b>${title}</b><span>${esc(line)}</span></div></div>
    <button class="btn btn-primary btn-pay" data-act="approve" type="button" data-st${f.paidCents >= (stage === 1 ? 10 : 10 + KIT_CENTS) /* flow/index.ts PAID_ALL = validate + kit */ ? ' data-state="done"' : ""}>
      <span class="b-lbl">Approve</span><span class="spin" aria-hidden="true"></span>
      <span class="tick" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1"/></svg></span>
    </button>
    ${stage === 1 && customIdea ? `<p class="pay-note" data-st>This prototype plays a sample run: ${esc(f.project.title)}.</p>` : `<p class="pay-foot" data-st>${stage === 1 ? "You get a report. Your launch kit is a second step." : "Paid from your wallet. LaunchDesk never holds your keys."}</p>`}
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

export function capTrack(cap: WorldLevel, reached: WorldLevel): string {
  return `<ol class="cap-track">${([0, 1, 2, 3] as WorldLevel[]).map((l) => `<li data-s="${l > cap ? "ghost" : l <= reached ? "on" : "open"}" title="${l > cap ? "Unlocks when you choose a scale path" : LEVEL_META[l].name}">${levelGlyph(l, 22)}<span>${LEVEL_META[l].short}</span></li>`).join('<li class="ct-sep" aria-hidden="true"></li>')}</ol>`;
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
  const canGrow = r.scalability.cap >= 1 && r.verdict !== "no-go";
  return `
  <ol class="steps7" data-st>${r.nextSteps.map((s, i) => `<li><span class="n7">${i + 1}</span><span>${esc(s)}</span></li>`).join("")}</ol>
  ${r.pivot ? `<div class="pivot" data-st><span class="eyebrow">${r.verdict === "pivot" ? "A change worth testing" : "Pivot to consider"}</span><p><b>${esc(plainText(r.pivot.idea).replace(/[.…]+$/, ""))}.</b> ${esc(plain(r.pivot.why))}</p></div>` : ""}
  ${read ? "" : `<div class="rp-acts" data-st>
    ${canGrow ? `<button class="btn btn-primary btn-grow" data-act="grow" type="button">${levelGlyph(1, 16)}<span>Grow into an office</span></button>` : `${r.verdict === "no-go" ? `<button class="btn btn-ghost" data-act="grow" type="button"><span>Build the launch kit anyway</span></button>` : ""}<button class="btn btn-primary" data-act="pivot" type="button"><span>Try another idea</span>${I.arrow(16)}</button>`}
    <button class="btn btn-ghost" data-act="steer" type="button"><span>Tell your team</span></button>
  </div>
  ${canGrow ? "" : `<p class="rp-note" data-st>Not every idea should grow. That is a result too.</p>`}`}`;
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
      ${f.cap >= 1 && f.report?.verdict !== "no-go" ? `<button class="btn btn-primary btn-grow" data-act="grow" type="button">${levelGlyph(1, 16)}<span>Grow into an office</span></button>` : ""}
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
/** WP4: the old "BOOM" moment is now the Launch kit offer (one clear card after the report). */
export function boomHtml(): string {
  return kitOfferHtml(KIT_CENTS);
}
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

/** WP4: no building / district levels in the founder's path. One calm "what's next" card instead. */
export function levelHtml(_f: ProtoFlowV7, _l: 2 | 3, brand: string): string {
  return `
  <section class="v-lvl">
    <div class="lv-t" data-st><span class="eyebrow">What's next</span><h2 class="t-display">${esc(brand)} is ready to launch</h2>
      <p>Your logo, your website and your 30-day plan are done. Your offices open tomorrow.</p></div>
    <button class="btn btn-primary" data-act="next" type="button" data-st><span>Finish</span>${I.arrow(16)}</button>
  </section>`;
}
/** Old building / district card (kept for reference, no longer shown). */
export function levelHtmlOld(f: ProtoFlowV7, l: 2 | 3, brand: string): string {
  const cap = f.cap;
  const S = f.report?.scalability;
  if (cap >= l) {
    return `
    <section class="v-lvl">
      <div class="lv-g" data-st>${levelGlyph(l, 30)}</div>
      <div class="lv-t" data-st><span class="eyebrow px-eb">Level ${l} · ${LEVEL_META[l].name}</span>
        <h2 class="t-display">${l === 2 ? `${esc(brand)} has a building` : "Your district"}</h2><p>${f.chosenPath != null && scalePaths(f.report)[f.chosenPath] ? `Scale path: ${esc(scalePaths(f.report)[f.chosenPath]!.label)}.` : l === 2 ? "Live, and ready to scale." : "Your company, at scale."}</p></div>
      <button class="btn btn-primary" data-act="next" type="button" data-st><span>${l === 2 ? (cap >= 3 ? "Grow into a district" : "What's next") : "Finish"}</span>${I.arrow(16)}</button>
    </section>`;
  }
  const name = LEVEL_META[l].short.toLowerCase();
  // A path lifts the cap by one level. When even that does not reach `l`, say so honestly: where it stops, why, and
  // what would make it scale. No fake district for a neighbourhood business.
  const unlockable = f.chosenPath == null && f.report?.verdict !== "no-go" && Math.min(3, f.baseCap + 1) >= l;
  if (!unlockable) {
    const stop = LEVEL_META[Math.max(1, cap) as WorldLevel].name.replace(/^Your /, "");
    return `
  <section class="v-cap">
    <header class="v-head" data-st><span class="eyebrow px-eb">${levelGlyph(l, 12)} ${LEVEL_META[l].name} · locked</span>
      <h2 class="t-display">${esc(brand)} stops at the ${esc(stop.toLowerCase())}</h2>
      <p class="sc-why">${S ? `Scalability ${one(S.score)}/10. A ${name} needs 7+. ${esc(S.why)}` : `A ${name} needs scalability 7+.`}</p></header>
    ${S?.wouldScale.length ? `<div data-st><span class="eyebrow">What would make it scale</span><ol class="paths">${S.wouldScale.slice(0, 3).map((w) => `<li><div class="pa"><span class="pa-how">${esc(w)}</span></div></li>`).join("")}</ol></div>` : ""}
    <footer class="rp-acts" data-st>
      <button class="btn btn-ghost" data-act="ask-scale" type="button"><span>Ask your team</span></button>
      <button class="btn btn-primary" data-act="next" type="button"><span>Finish</span>${I.arrow(16)}</button>
    </footer>
  </section>`;
  }
  return `
  <section class="v-cap">
    <header class="v-head" data-st><span class="eyebrow px-eb">${levelGlyph(l, 12)} Next · ${LEVEL_META[l].name}</span>
      <h2 class="t-display">Choose how ${esc(brand)} scales</h2>
      <p class="sc-why">${S ? `Scalability ${one(S.score)}/10 · ${esc(easeWord(S.score))}. ` : ""}Pick a path to grow into a ${name}.</p></header>
    <div data-st>${pathList(f, true)}</div>
    <footer class="rp-acts" data-st>
      <button class="btn btn-ghost" data-act="ask-scale" type="button"><span>Ask your team</span></button>
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

export function officesHtml(f: ProtoFlowV7): string {
  const row = (p: (typeof f.projects)[number], example: boolean) => {
    const l = f.levelOf(p.id);
    const r = p.v7.report;
    const cur = p.id === f.project.id;
    return `<li><button type="button" data-act="switch" data-id="${esc(p.id)}" aria-current="${cur}">
        <span class="of-g">${levelGlyph(l, 22)}</span>
        <span class="of-t"><b>${esc(p.title)}${example ? `<span class="of-tag">Sample data</span>` : ""}</b><span>${esc(!r && p.idea.trim() === p.title.trim() ? "No report yet" : p.idea)}</span></span>
        <span class="of-r"><b class="num">${r ? one(r.score) : "–"}</b><em>${r ? "score" : ""}${r && scoreDisplay(r) !== "hero" ? " · provisional" : ""}</em></span>
      </button></li>`;
  };
  const finished = knownExamples();
  const mine = f.projects.filter((p) => !f.isSample(p.id) && !finished.some((x) => x.id === p.id));
  const samples = f.projects.filter((p) => f.isSample(p.id));
  return `
  <section class="offices">
    <header class="of-head"><h2 class="t-display">Your offices</h2><button class="btn btn-ghost btn-icon ov-x" data-act="close" type="button" aria-label="Close">${I.close(16)}</button></header>
    <p class="of-sub">One office per idea.</p>
    ${mine.length ? `<ul class="of-list">${mine.map((p) => row(p, false)).join("")}</ul>` : `<p class="of-sub">Your ideas will live here. Nothing yet.</p>`}
    ${finished.length ? `<p class="of-sec">Finished examples (real runs)</p>
    <ul class="of-list">${finished.map((x) => `<li><button type="button" data-act="switch" data-id="${esc(x.id)}" data-at="report">
        <span class="of-g">${levelGlyph(3, 22)}</span>
        <span class="of-t"><b>${esc(x.title)}<span class="of-tag">Example</span></b><span>${esc(x.run)} · ${esc(x.paid)}</span></span>
        <span class="of-r"><b class="num">${x.verdict ? one(x.verdict.score) : "–"}</b><em>${x.verdict ? "score" : ""}</em></span>
      </button></li>`).join("")}</ul>` : ""}
    ${samples.length ? `<p class="of-sec">Practice runs (sample data, not real research)</p>
    <ul class="of-list">${samples.map((p) => row(p, true)).join("")}</ul>` : ""}
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
      <p>This example stops at the report. The coffee kiosk shows a full launch kit.</p></div>
    <button class="btn btn-primary" data-act="next" type="button" data-st><span>Next</span>${I.arrow(16)}</button>
  </section>`;
}
