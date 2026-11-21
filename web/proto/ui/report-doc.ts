// v7.1 · Calm working screen + the one written report (founder direction: no findings flying by; the team works in
// the office with short, readable progress notes, then ONE report is delivered, readable here and printable as a PDF).
// Markup + pure data helpers only; ui/index.ts mounts them. Every number shown comes from a finding / key number with
// its source, or is labelled "Estimate". Nothing here invents text: notes are the server's (results.v7.notes) or are
// derived from what the team really did (which page it read, which section it finished).
import {
  BLOCK_LIBRARY, ROLE_LIBRARY, blockVerdictFor, hasBlocks, scoreDisplay, sourceNumber,
  type Analyst, type AnalystRole, type BlockVerdict, type EconSummary, type Finding, type IdeaReport, type KeyNumber, type ProjectV7,
  type ReportBlock, type ResultsV7, type SourceRef,
} from "../contracts";
import type { ProtoFlowV7 } from "../flow";
import { statusLine } from "../live/adapter";
import { estimateBasis, fullSentences, leadLine, plainText, reasonsAfterLead, unitPlural, verdictWhy, VERDICT_RULE_V7 } from "../../../server/v7";
import { esc } from "./dom";
import { exampleName, exampleOf, knownExamples } from "./example";
import { I } from "./icons";
import { ldMark } from "./logo";
import { badge } from "./pixel";
import { priceHtml } from "../prices";

const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
// display words; the enum stays "pivot": an uncertain idea is something to test, not a failure
const VERDICT = { go: "Go", pivot: "Test first", "no-go": "No-go" } as const;
/** Pivot text as full sentences: [S#] labels are research-note ids, not this page's source numbers, and a text the
 *  server cut mid-sentence ("…though both come from undated travel…") ends at its last whole sentence. */
const plain = (t: string) => fullSentences(plainText(t), 40);
/** Text as a reader sees it, escaped: no research ids ([S2], [S2, estimate]) and no "no source id" notes. */
const tx = (t: string | null | undefined) => esc(plainText(t ?? ""));
/** "Neighbourhood" → "One neighbourhood": how far it can grow, said as words (the /10 sits in its own section). */
const REACH: Record<string, string> = { Neighbourhood: "One neighbourhood", City: "One city", Country: "The whole country", Global: "Worldwide" };
const CHIP: Record<BlockVerdict, string> = { strong: "Strong", mixed: "Mixed", weak: "Weak" };
/** Only http(s) links leave the app. */
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : "");

/** The doc replaces the old 4 report pages only for projects analysed in 4 blocks with a finished report. */
export const docMode = (p: ProjectV7, r: IdeaReport | null) => !!r && hasBlocks(p.v7);

const analystOf = (f: ProtoFlowV7, role: AnalystRole): Analyst =>
  f.roster.find((a) => a.id === role) ?? { id: role, role, name: ROLE_LIBRARY[role].name, color: ROLE_LIBRARY[role].color, mission: ROLE_LIBRARY[role].mission, why: "", weight: 0 };

// ───────────────────────────── progress notes (working screen)

export interface WorkNote {
  key: string;
  text: string;
  role?: AnalystRole;
}
type RawNote = string | { id?: string; text?: string; role?: AnalystRole; analyst?: AnalystRole; at?: string | number };

/** results.v7.notes when the server writes them (optional, any of string | {text, role|analyst}); else derived from
 *  the real work: the section an analyst starts on, each page it read, the moment it finishes. */
export function workNotes(f: ProtoFlowV7, v7: ResultsV7): WorkNote[] {
  const raw = (v7 as ResultsV7 & { notes?: RawNote[] }).notes;
  if (Array.isArray(raw) && raw.length) {
    return raw
      .map((n, i): WorkNote | null => {
        if (typeof n === "string") return n.trim() ? { key: `s${i}:${n}`, text: n.trim() } : null;
        const text = (n?.text ?? "").trim();
        return text ? { key: n.id ?? `n${i}:${text}`, text, role: n.role ?? n.analyst } : null;
      })
      .filter((x): x is WorkNote => !!x);
  }
  const out: WorkNote[] = [];
  const blocks = v7.blocks ?? [];
  for (const a of v7.roster) {
    const w = v7.work.find((x) => x.analyst === a.id);
    const b = blocks.find((x) => x.role === a.id);
    if (!w || w.status === "queued") continue;
    const topic = b?.focus[0] ?? b?.title ?? a.mission;
    out.push({ key: `start:${a.id}`, role: a.id, text: `Looking into: ${trimTo(topic, 90)}` });
    const seen = new Set<string>();
    for (const fd of [...w.findings].sort((x, y) => x.t - y.t)) {
      if (!fd.source || seen.has(fd.source.url)) continue;
      seen.add(fd.source.url);
      out.push({ key: `read:${a.id}:${fd.source.url}`, role: a.id, text: `Reading: ${trimTo(fd.source.title || fd.source.domain, 70)} · ${fd.source.domain}` });
    }
    if (w.status === "done") out.push({ key: `done:${a.id}`, role: a.id, text: `Finished ${b ? BLOCK_LIBRARY[b.id].label.toLowerCase() : ROLE_LIBRARY[a.role].dept.toLowerCase()}.` });
    if (w.status === "error") out.push({ key: `err:${a.id}`, role: a.id, text: "Could not finish this part. The report says so." });
  }
  return out;
}
const trimTo = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** "Your team is researching · 2 of 4 done" */
export function progressOf(f: ProtoFlowV7): { done: number; total: number; line: string } {
  const v7 = (f.live?.project ?? f.project).v7;
  const parts = v7.blocks?.length ? v7.blocks.map((b) => b.status) : v7.roster.map((a) => v7.work.find((w) => w.analyst === a.id)?.status ?? "queued");
  const total = parts.length;
  const done = parts.filter((s) => s === "done" || s === "error").length;
  const st = f.live?.status ?? null;
  let line: string;
  if (f.live?.error) line = f.live.error;
  else if (!total) line = statusLine(st);
  else if (done < total) line = `Your team is researching · ${done} of ${total} done`;
  else line = "Writing your report";
  return { done, total, line };
}

export function workHtml(f: ProtoFlowV7): string {
  return `
  <section class="v-work">
    <header class="wk-head" data-st>
      <span class="eyebrow">Research in progress</span>
      <h2 class="t-display">Your team is on it</h2>
      <p class="wk-sub">They research with real sources. You get one complete report to read when they finish, usually in 60 to 90 seconds.</p>
    </header>
    <div class="wk-prog" data-st>${progressBar(f)}</div>
    <ol class="wk-team" data-st>${teamRows(f)}</ol>
    <ol class="wk-feed" aria-live="polite" aria-label="What the team is doing" data-st></ol>
  </section>`;
}
export function progressBar(f: ProtoFlowV7): string {
  const p = progressOf(f);
  const k = p.total ? p.done / p.total : 0;
  return `<p class="wk-line"><span class="wk-dot" aria-hidden="true"></span><span>${esc(p.line)}</span></p><span class="wk-bar" aria-hidden="true"><i style="--w:${k}"></i></span>`;
}
export function teamRows(f: ProtoFlowV7): string {
  const v7 = (f.live?.project ?? f.project).v7;
  return f.roster
    .map((a) => {
      const w = v7.work.find((x) => x.analyst === a.id);
      const b = v7.blocks?.find((x) => x.role === a.id);
      const st = b?.status ?? w?.status ?? "queued";
      const what = b ? BLOCK_LIBRARY[b.id].label : ROLE_LIBRARY[a.role].dept;
      const word = st === "done" ? "Done" : st === "error" ? "Skipped" : st === "working" ? "Working" : "Up next";
      return `<li data-s="${st}">${badge(a.name, a.color, 22)}<b>${esc(a.name)}</b><span>${esc(what)}</span><em>${word}</em></li>`;
    })
    .join("");
}
export const noteRow = (f: ProtoFlowV7, n: WorkNote) => {
  const a = n.role ? analystOf(f, n.role) : null;
  return `<li class="wk-note">${a ? `<b style="--c:${a.color}">${esc(a.name)}</b>` : ""}<span>${esc(n.text)}</span></li>`;
};
export const bubbleHtml = (f: ProtoFlowV7, n: WorkNote) => {
  const a = n.role ? analystOf(f, n.role) : null;
  return `${a ? `<b style="--c:${a.color}">${esc(a.name)}</b>` : ""}<span>${esc(n.text)}</span>`;
};

// ───────────────────────────── the report document

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

function srcLink(s: SourceRef, n: number): string {
  const u = safeUrl(s.url);
  const label = n > 0 ? `[${n}] ${esc(s.domain)}` : esc(s.domain);
  return u
    ? `<a class="rd-src" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(s.title)}">${label}${I.ext(11)}</a>`
    : `<span class="rd-src">${label}</span>`;
}
const estimate = (basis?: string) => { const b = plainText(basis ?? ""); return `<span class="rd-est" title="Not from a web source"><b>Estimate</b>${b ? ` · ${esc(b)}` : ""}</span>`; };

function evidenceItem(b: ReportBlock, fd: Finding): string {
  const n = sourceNumber(b, fd);
  const v = fd.impact ?? 0;
  const mark = v ? `<span class="rd-imp" data-v="${v > 0 ? "up" : "down"}" title="${v > 0 ? "Counts for the idea" : "Counts against the idea"}">${v > 0 ? "+" : "−"}</span>` : `<span class="rd-imp" data-v="0" title="Context">·</span>`;
  const proof = fd.source ? srcLink(fd.source, n) : estimate(estimateBasis(fd.text, fd.basis));
  return `<li class="rd-item">${mark}<p>${tx(fd.text)} ${proof}</p></li>`;
}
function keyNumber(b: ReportBlock, k: KeyNumber): string {
  const n = k.source ? b.sources.findIndex((s) => s.url === k.source!.url) + 1 : 0;
  return `<li><b class="num">${tx(k.value)}</b><span>${tx(k.label)}</span>${k.source ? srcLink(k.source, n) : estimate(k.basis)}</li>`;
}
/** EUR keeps its old format; any other currency (results.v7.econ.currency) is shown with its own sign, never converted. */
const money = (x: number, code = "EUR") => {
  const d = Math.abs(x) < 100 ? 2 : 0;
  if (code === "EUR") return `€${x.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: d, maximumFractionDigits: d }).format(x);
  } catch {
    return `${code} ${x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  }
};
const NA = `<span class="rd-na">n/a</span>`;
/** "one cup of flat white sold at the kiosk" → "cups of flat white" (break-even is already "a month"). */
const unitWord = (u: string) => unitPlural(u);
/** The unit economics the server computed in code (results.v7.econ), with each cost line's source. */
export function econHtml(b: ReportBlock, e: EconSummary | null | undefined, err?: string): string {
  if (!e) return err ? `<h3>Unit economics</h3><p class="rd-miss">The unit economics could not be computed (${esc(err)}).</p>` : "";
  const cur = e.currency ?? "EUR";
  const v = (x: number | null) => (x == null ? NA : `<b class="num">${esc(money(x, cur))}</b>`);
  const be = e.breakEven == null ? (e.missing?.length ? NA : `<b>never</b> <span>(contribution is not positive)</span>`) : `<b class="num">${e.breakEven.toLocaleString("en-GB")}</b> <span>${esc(unitWord(e.unit))} a month</span>`;
  const rows: Array<[string, string]> = [
    [`Price per ${esc(e.unit.replace(/^(?:one|a|an)\s+/i, ""))}${e.vatRate === 0 && e.currency && e.currency !== "EUR" ? "" : ` (incl. VAT ${Math.round(e.vatRate * 100)}%)`}`, v(e.price)],
    ...(e.shareKept < 1 ? ([["Share the business keeps", `<b class="num">${Math.round(e.shareKept * 100)}%</b>`]] as Array<[string, string]>) : []),
    ["Net revenue per unit", v(e.net)],
    ["Variable cost per unit", v(e.variable)],
    ["Contribution per unit", v(e.contribution)],
    ["Fixed costs per month", v(e.fixedMonthly)],
    ["Break-even", be],
    ["Start-up capital", v(e.startupCapital)],
  ];
  const group = (g: "variable" | "fixed" | "startup", title: string) => {
    const ls = (e.lines ?? []).filter((x) => x.group === g);
    if (!ls.length) return "";
    return `<h4>${title}</h4><ul class="rd-econ-lines">${ls.map((x) => {
      const n = x.source ? b.sources.findIndex((s) => s.url === x.source!.url) + 1 : 0;
      return `<li><span>${esc(x.item)}</span><b class="num">${x.eur > 0 ? esc(money(x.eur, cur)) : "missing"}</b>${x.source ? `${srcLink(x.source, n)}${x.check ? `<span class="rd-est rd-check" title="This figure was not found in the cited page's research note"><b>Check</b> · figure not confirmed in the source</span>` : ""}` : estimate()}</li>`;
    }).join("")}</ul>`;
  };
  return `<h3>Unit economics</h3>
    <p class="rd-note">Computed in code from the inputs listed below; every input without a source is an estimate, and “Check” means the source does not show that figure.</p>
    <table class="rd-econ"><tbody>${rows.map(([k, x]) => `<tr><th scope="row">${k}</th><td>${x}</td></tr>`).join("")}</tbody></table>
    ${e.missing?.length ? `<p class="rd-miss">Missing cost inputs: ${e.missing.map(esc).join("; ")}. The figures that depend on them are not shown until you get a quote.</p>` : ""}
    ${group("variable", "Variable costs per unit")}${group("fixed", "Fixed costs per month")}${group("startup", "Start-up costs")}`;
}

const chip = (v: BlockVerdict | null, score: number | null) =>
  v && score != null ? `<span class="rd-chip" data-v="${v}">${CHIP[v]} · <span class="num">${one(score)}</span></span>` : "";

function section(f: ProtoFlowV7, b: ReportBlock, i: number, byId: Map<string, Finding>, econ = ""): string {
  const meta = BLOCK_LIBRARY[b.id];
  const a = analystOf(f, b.role);
  const verdict = b.verdict ?? (b.score != null ? blockVerdictFor(b.score) : null);
  const items = b.evidence.map((id) => byId.get(id)).filter((x): x is Finding => !!x);
  if (b.status !== "done") {
    return `<section class="rd-sec" id="rd-${b.id}"><header class="rd-sh"><span class="rd-n num">${i + 1}</span><div><span class="eyebrow">${esc(meta.label)}</span><h2>${esc(b.title || meta.label)}</h2></div></header>
      <p class="rd-miss">${b.status === "error" ? `${esc(a.name)} could not finish this section, so it is left out of the score.` : "Still being written."}</p></section>`;
  }
  return `
  <section class="rd-sec" id="rd-${b.id}">
    <header class="rd-sh">
      <span class="rd-n num">${i + 1}</span>
      <div><span class="eyebrow">${!b.title || b.title === meta.label ? "" : `${esc(meta.label)} · `}by ${esc(a.name)}</span><h2>${esc(b.title || meta.label)}</h2></div>
      ${chip(verdict, b.score)}
    </header>
    ${b.focus.length ? `<p class="rd-focus"><span>Questions asked:</span> ${b.focus.map(esc).join(" · ")}</p>` : ""}
    ${b.takeaway ? `<p class="rd-take">${tx(b.takeaway)}</p>` : ""}
    ${b.keyNumbers?.length ? `<ul class="rd-kn">${b.keyNumbers.map((k) => keyNumber(b, k)).join("")}</ul>` : ""}
    ${items.length ? `<h3>Evidence</h3><ol class="rd-ev">${items.map((fd) => evidenceItem(b, fd)).join("")}</ol>` : ""}
    ${econ}
    ${b.meaning ? `<h3>What it means for you</h3><p class="rd-mean">${tx(b.meaning)}</p>` : ""}
    ${b.actions.length ? `<h3>Next actions</h3><ol class="rd-act">${b.actions.map((x) => `<li>${tx(x)}</li>`).join("")}</ol>` : ""}
  </section>`;
}

export function reportDocHtml(f: ProtoFlowV7): string {
  const p = f.project;
  const r = f.report!;
  const blocks = p.v7.blocks ?? [];
  const byId = new Map(p.v7.work.flatMap((w) => w.findings).map((x) => [x.id, x]));
  const hero = scoreDisplay(r) === "hero";
  const S = r.scalability;
  const canGrow = r.verdict !== "no-go"; // v8: the scalability cap gates nothing
  const date = fmtDate(p.createdAt);
  const summary = blocks
    .filter((b) => b.status === "done" && b.takeaway)
    .map((b) => `<li><a href="#rd-${b.id}" data-act="doc-jump" data-to="rd-${b.id}"><b>${esc(BLOCK_LIBRARY[b.id].label)}</b></a>${chip(b.verdict ?? (b.score != null ? blockVerdictFor(b.score) : null), b.score)}<p>${tx(b.takeaway)}</p></li>`)
    .join("");
  const srcList = blocks
    .filter((b) => b.sources.length)
    .map((b) => `<div class="rd-sg"><h4>${esc(BLOCK_LIBRARY[b.id].label)}</h4><ol>${b.sources.map((s) => {
      const u = safeUrl(s.url);
      return `<li>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.domain)}</a>` : esc(s.title || s.domain)} <span>${esc(s.domain)}${s.accessed ? ` · read ${esc(s.accessed)}` : ""}</span></li>`;
    }).join("")}</ol></div>`)
    .join("");
  const paths = (S.paths ?? []).slice(0, 3);
  // one count everywhere: distinct web pages behind the sourced evidence (the ribbon and the Sources list use the same)
  const pages = new Set(blocks.flatMap((b) => b.sources.map((s) => s.url))).size;
  const ex = exampleOf(p.id);
  const isExample = !!ex || /^ex-/.test(p.id);
  // a short, clean lead (also for reports saved before the lead was shortened), and the reasons without repeating it
  const lead = r.reasons?.length ? leadLine(r.verdictLine) : r.verdictLine;
  const reasons = reasonsAfterLead(lead, r.reasons ?? []);
  const unknowns = ((r as IdeaReport & { unknowns?: string[] }).unknowns ?? []).slice(0, 4);
  const pv = r.pivot ? { idea: plainText(r.pivot.idea).replace(/[.…]+$/, ""), why: plain(r.pivot.why) } : null;
  return `
  <div class="rdoc">
    <div class="rd-bar no-print">
      <span class="rd-bar-t">${ex?.proof ? "Finished example: a real paid report" : isExample ? (ex || knownExamples().length ? "Finished example: a real AI run (test mode, not paid)" : "Finished example") : "Your report is ready. Read it, then decide at the end."}</span>
      <button class="btn btn-primary rd-pdf" data-act="pdf" type="button">${I.pack(15)}<span>Print / Save as PDF</span></button>
    </div>
    <article class="rd-paper">
      <header class="rd-cover">
        <div class="rd-brand">${ldMark(16, undefined, true)}<span>LaunchDesk · Validation report${date ? ` · ${esc(date)}` : ""}</span></div>
        <h1${isExample ? ` data-exn="${esc(p.id)}"` : ""}>${esc(ex ? exampleName(ex) : p.title)}</h1>
        <p class="rd-idea">“${esc(p.idea)}”</p>
        <div class="rd-score">
          <div><span class="eyebrow">Verdict</span><b class="rd-v" data-v="${r.verdict}" title="${esc(VERDICT_RULE_V7)}">${VERDICT[r.verdict]}</b></div>
          <div><span class="eyebrow">Score${hero ? "" : " · provisional"}</span><b class="num">${one(r.score)}<small>/10</small></b></div>
          <div><span class="eyebrow">How far it can grow</span><b class="rd-reach">${esc(REACH[S.reach] ?? S.reach)}</b></div>
        </div>
        ${verdictWhy(r) ? `<p class="rd-rule">${esc(verdictWhy(r))}</p>` : ""}
        ${ex?.proof ? `<button type="button" class="rd-proof-link no-print" data-act="see-proof">${I.lock(14)}<span>Paid on Bitcoin Cash · check the proof</span></button>` : ""}
        <p class="rd-line">${tx(lead)}</p>
        ${reasons.length ? `<ul class="rd-why">${reasons.map((x) => `<li>${tx(x)}</li>`).join("")}</ul>` : ""}
        ${r.verdict === "pivot" && unknowns.length ? `<p class="rd-line">Not known yet, so test these before you commit savings (they lower the confidence, not the score):</p><ul class="rd-why">${unknowns.map((x) => `<li>${tx(x)}</li>`).join("")}</ul>` : ""}
        ${isExample ? "" : `<div class="rd-ceo no-print"><span><b>You're the CEO.</b> Disagree with something? Tell your team what to re-check. ${f.steersLeft} of 3 notes left · free.</span><button class="btn btn-ghost" data-act="steer" type="button"${f.steersLeft ? "" : " disabled"}><span>Tell your team</span></button></div>`}
        <p class="rd-meta"><span class="num">${r.evidence.total}</span> pieces of evidence · <span class="num">${r.evidence.sourced}</span> backed by ${pages ? `<span class="num">${pages}</span> web page${pages === 1 ? "" : "s"}` : "a web source"} · ${esc(r.confidence)} confidence${hero ? "" : " · the score is provisional until at least 6 findings, 3 of them sourced"}</p>
      </header>

      <section class="rd-exec">
        <h2>Executive summary</h2>
        <ol class="rd-sum">${summary}</ol>
        ${r.math ? `<p class="rd-math num">How the score is built: ${esc(r.math)}</p>` : ""}
      </section>

      <section class="rd-first">
        <h2>Validate these 3 things first</h2>
        <ol>${r.nextSteps.slice(0, 3).map((s, i) => `<li><span class="num">${i + 1}</span><p>${tx(s)}</p></li>`).join("")}</ol>
      </section>

      ${blocks.map((b, i) => section(f, b, i, byId, b.id === "money" && b.status === "done" ? econHtml(b, p.v7.econ, p.v7.econErr) : "")).join("")}

      <section class="rd-sec rd-scale">
        <header class="rd-sh"><span class="rd-n num">${blocks.length + 1}</span><div><span class="eyebrow">Scalability</span><h2>How far it can grow</h2></div><span class="rd-chip" data-v="${S.score >= 6.5 ? "strong" : S.score >= 4.5 ? "mixed" : "weak"}"><span class="num">${one(S.score)}</span>/10</span></header>
        <p class="rd-take">Reach today: ${esc(REACH[S.reach] ?? S.reach)}. ${tx(S.why)}</p>
        ${paths.length ? `<h3>Ways it could scale</h3><ol class="rd-act">${paths.map((x) => `<li><b>${esc(x.label)}.</b> ${esc(x.how)}</li>`).join("")}</ol>` : S.wouldScale.length ? `<h3>What would raise the ceiling</h3><ol class="rd-act">${S.wouldScale.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
        ${pv ? `<h3>${r.verdict === "pivot" ? "A change worth testing" : "A pivot to consider"}</h3><p class="rd-mean"><b>${esc(pv.idea)}.</b> ${esc(pv.why)}</p>` : ""}
      </section>

      <section class="rd-sources">
        <h2>Sources${pages ? ` <small class="num">· ${pages} web page${pages === 1 ? "" : "s"}</small>` : ""}</h2>
        ${srcList || `<p class="rd-miss">No web sources were found for this idea. Every item above is an estimate.</p>`}
        <p class="rd-note">Each section was researched by one analyst who searched the web and read the pages listed. Numbers in brackets point to this list. Anything marked “Estimate” has no web source and says what it is based on. The score is arithmetic over the evidence, not an opinion.</p>
      </section>
    </article>

    <footer class="rd-decide no-print">
      <div><b>What next?</b><span>${isExample ? "This founder's launch kit is already made: logo, website and a 30-day plan." : canGrow ? `Happy with what you read? The next step is the launch kit: a logo, a live website and a 30-day plan.${pv ? ` A change worth testing first: ${esc(pv.idea)}.` : ""}` : `This idea should not grow as it stands. ${pv ? `A better version to try: <b>${esc(pv.idea)}.</b> ${esc(pv.why)}` : "Try another idea, or tell your team what to re-check."} You can still build the launch kit to see it.`}</span></div>
      <div class="rd-btns">
        <button class="btn btn-ghost" data-act="back" type="button">${I.back(15)}<span>Back</span></button>
        ${isExample ? "" : `<button class="btn btn-ghost" data-act="steer" type="button"><span>Tell your team</span></button>`}
        ${isExample ? `<button class="btn btn-primary" data-act="grow" type="button"><span>See the launch kit</span>${I.arrow(16)}</button>` : canGrow ? `<button class="btn btn-primary" data-act="grow" type="button"><span>Launch kit</span><span class="btn-price">${priceHtml("build")}</span></button>` : `<button class="btn btn-ghost" data-act="grow" type="button"><span>Build the launch kit anyway</span></button><button class="btn btn-primary" data-act="pivot" type="button"><span>Try another idea</span>${I.arrow(16)}</button>`}
      </div>
    </footer>
  </div>`;
}
