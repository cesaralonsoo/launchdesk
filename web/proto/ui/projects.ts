// v6 · "Your projects" (WS-B): seeds (data PAST_PROJECTS) + this browser's own runs (localStorage), a drawer to list
// them and a read-only report that reuses the result cards. Own runs of the prototype always ran the sample (PAUSA),
// so they store a marker, not a copy.
import type { Project } from "../../src/types";
import { BUILD_DEPTS, VALIDATE_DEPTS, type Dept, type Level, type PastProject, type PortfolioItem } from "../contracts";
import { PAST_PROJECTS, PAUSA } from "../data";
import { brandLogo, dial, resultCard, verdictText } from "./cards";
import { esc } from "./dom";
import { I, avatar } from "./icons";
import { VERDICT_LABEL, fmtDate, makeView, type View } from "./view";

const KEY = "launchdesk.proto.projects.v1";
const SAMPLE = "sample:pausa";

export type RunStatus = "validated" | "pivot" | "nogo" | "stopped" | "live" | "district";
export interface Run extends PastProject { status: RunStatus; own: boolean }

function readLocal(): Run[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as Run[]) : [];
    return Array.isArray(arr) ? arr.filter((r) => r && typeof r.id === "string") : [];
  } catch {
    return [];
  }
}
function writeLocal(runs: Run[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(runs.slice(0, 40)));
  } catch {
    /* private mode / quota: the drawer still shows this session's runs */
  }
}

const isProject = (p: unknown): p is Project => !!p && typeof p === "object" && "results" in (p as object) && "idea" in (p as object);
export function projectOf(r: PastProject): Project {
  return isProject(r.project) ? r.project : PAUSA;
}

const LEVEL_NAME: Record<Level, string> = { 1: "Office", 2: "Building", 3: "District" };
const STATUS_NAME: Record<RunStatus, string> = { validated: "Validated", pivot: "Pivot", nogo: "No-go", stopped: "Stopped", live: "Live", district: "Live" };
const statusOfSeed = (p: PastProject): RunStatus => {
  const r = projectOf(p).results;
  return r?.pip ? "live" : p.verdict === "go" ? "validated" : p.verdict === "pivot" ? "pivot" : p.verdict === "no-go" ? "nogo" : "stopped";
};

export interface ProjectStore {
  all(): Run[];
  /** Start a run (idea submitted). Returns its id. */
  start(idea: string): string;
  update(id: string, patch: Partial<Run>): void;
  onChange(cb: () => void): () => void;
  portfolio(): PortfolioItem[];
}

export function createStore(): ProjectStore {
  let local = readLocal();
  const cbs = new Set<() => void>();
  const emit = () => cbs.forEach((c) => c());
  return {
    all() {
      const seeds: Run[] = PAST_PROJECTS.map((p) => ({ ...p, own: false, status: statusOfSeed(p) }));
      return [...local, ...seeds].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    },
    start(idea) {
      const id = `run-${Date.now().toString(36)}`;
      local = [{ id, title: PAUSA.results.mia?.title ?? "Sample run", idea, score: null, verdict: null, level: 1, createdAt: new Date().toISOString(), project: SAMPLE, status: "validated", own: true }, ...local];
      return id;
    },
    update(id, patch) {
      const r = local.find((x) => x.id === id);
      if (!r) return;
      Object.assign(r, patch);
      writeLocal(local);
      emit();
    },
    onChange(cb) {
      cbs.add(cb);
      return () => cbs.delete(cb);
    },
    portfolio() {
      // own runs of the prototype are all the sample: the hero tower already is that building, so only seeds get one
      return this.all().filter((r) => !r.own).map((r) => ({ id: r.id, title: r.title, level: r.level, score: r.score }));
    },
  };
}

// ───────────────────────────── shelf ("Your projects": a row of cards along the bottom)
export function drawerHtml(runs: Run[]): string {
  const cards = runs.map((r, i) => {
    const v = makeView(projectOf(r));
    const built = !!(v.pip && v.brand) && r.level >= 2;
    const name = built ? v.brand!.name : r.title;
    const sub = built ? v.mia?.title ?? r.idea : v.mia?.one_liner ?? r.idea;
    const art = built
      ? `<div class="pj-art built" style="background:${v.pal("Background")}"><span class="pj-full">${brandLogo(v, 0, 20)}</span><span class="pj-mk">${brandLogo(v, 0, 34, { mode: "mark" })}</span></div>`
      : `<div class="pj-art" data-v="${r.verdict ?? ""}">${dial(r.score, 58, 4)}<span class="pj-vt">${r.verdict ? esc(verdictText(v)) : "Running"}</span></div>`;
    return `<li style="--i:${i}"><button type="button" class="pj" data-open="${esc(r.id)}">
      ${art}
      <span class="pj-txt"><b>${esc(name)}</b><em>${esc(sub)}</em></span>
      <span class="pj-meta"><span class="pj-st" data-s="${r.status}">${STATUS_NAME[r.status]}</span><span>${esc(fmtDate(r.createdAt).replace(/ \d{4}$/, ""))}</span></span>
    </button></li>`;
  }).join("");
  return `
  <section class="drawer shelf" role="dialog" aria-label="Your projects">
    <header class="dr-top"><div><h2 class="t-display">Your projects</h2><span class="dr-n">${runs.length}</span></div>
      <button class="btn btn-ghost btn-icon" data-act="close" type="button" aria-label="Close">${I.close(16)}</button></header>
    <ul class="pj-row">
      <li><button type="button" class="pj pj-new" data-act="new"><span class="pj-plus">+</span><b>New idea</b><em>Validate it for $0.10</em></button></li>
      ${cards}
    </ul>
  </section>`;
}

// ───────────────────────────── read-only report (also "Open your pack")
export function reportSections(v: View): Array<[string, string]> {
  const s: Array<[string, string]> = [["summary", "Summary"]];
  const label: Record<Dept, string> = { mia: "Plan", leo: "Market", sam: "Money", nova: "Brand", dex: "Logo & site", rae: "Launch", pip: "Live" };
  for (const d of [...VALIDATE_DEPTS, ...BUILD_DEPTS]) if (v.has(d)) s.push([d, label[d]]);
  return s;
}

function summary(v: View, r: { level: Level; status: RunStatus } | null): string {
  const M = v.memo, L = v.leo, S = v.sam;
  return `<article class="card c-summary">
    <div class="rs-hero">
      ${L ? dial(L.score, 84, 6) : ""}
      <div><span class="verdict-chip" data-v="${L?.verdict ?? "go"}">${L ? esc(verdictText(v)) : "–"}</span>
      <p class="c-take big-take">${esc((M?.verdict_line ?? L?.headline ?? v.idea).replace(/^Go, to test: (.)/i, (_m, c: string) => c.toUpperCase()))}</p></div>
    </div>
    ${M ? `<dl class="memo">
      <div><dt>What</dt><dd>${esc(M.purpose)}</dd></div>
      <div><dt>Problem</dt><dd>${esc(M.problem)}</dd></div>
      <div><dt>Insight</dt><dd>${esc(M.insight)}</dd></div>
    </dl>` : ""}
    <dl class="facts f3">
      ${S ? `<div class="fact"><dt>Cash to start<span class="est">Est.</span></dt><dd>${esc(S.cash_needed.display)}</dd></div>
      <div class="fact"><dt>Profitable from</dt><dd>${S.break_even.month != null ? `Month ${S.break_even.month}` : "Not in year 1"}</dd></div>
      <div class="fact"><dt>Year 1 operating</dt><dd>${esc(S.year1.result)}</dd></div>` : ""}
    </dl>
    ${M?.next_7_days.length ? `<div class="next7"><span class="lbl">Next 7 days</span><ol>${M.next_7_days.map((d, i) => `<li><span class="n7-i">${i + 1}</span><span>${esc(d)}</span></li>`).join("")}</ol></div>` : ""}
    ${r ? `<p class="basis">${I.info(13)}<span>${r.level >= 2 ? "Built and live" : r.status === "stopped" || r.status === "nogo" ? "Stopped after validation" : "Validated, not built yet"}</span></p>` : ""}
  </article>`;
}

export function readerHtml(v: View, r: Run | null, title: string): string {
  const secs = reportSections(v);
  const date = fmtDate(r?.createdAt ?? v.createdAt ?? Date.now());
  return `
  <section class="reader" data-sec="summary">
    <header class="rd-top">
      ${r ? `<button class="btn btn-ghost btn-icon" data-act="back" type="button" aria-label="Back to projects">${I.back(16)}</button>` : ""}
      <div class="rd-id"><span class="eyebrow">${esc(title)} · ${esc(date)}</span><h2 class="t-display">${esc(v.brand && (r?.level ?? 2) >= 2 ? v.brand.name : v.title)}</h2></div>
      <span class="rd-avs">${secs.slice(1).map(([d]) => avatar(d as Dept, 22)).join("")}</span>
      <button class="btn btn-ghost btn-icon" data-act="close" type="button" aria-label="Close">${I.close(16)}</button>
    </header>
    <nav class="rd-nav" role="tablist">${secs.map(([id, l], i) => `<button type="button" role="tab" data-sec="${id}" aria-selected="${i === 0}">${esc(l)}</button>`).join("")}</nav>
    <div class="rd-body">
      <div class="rd-sec" data-sec="summary">${summary(v, r)}</div>
      ${secs.slice(1).map(([d]) => `<div class="rd-sec" data-sec="${d}" hidden>${resultCard(v, d as Dept, "read")}</div>`).join("")}
    </div>
    <p class="rd-foot">AI output is guidance, not financial or legal advice.</p>
  </section>`;
}
