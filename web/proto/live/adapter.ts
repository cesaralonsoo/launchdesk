// v7 live · The real run behind the same flow and UI. Polls GET /api/projects/:id and maps it onto ProjectV7:
// results.v7 (roster, findings as they land, report, steers) + the v4 payload as `legacy` (phase-2 cards, site slug).
// Findings keep their ARRIVAL order (analysts finish in parallel), so the flow can reveal them one by one as they land.
import type { AnalystRole, BuildDept, CompanySign, Finding, ProjectV7, ResultsV7, WorldLevel } from "../contracts";
import { api, ApiError } from "../../src/api";
import { projects as saved, shortTitle } from "../../src/app/projects";
import type { AppConfig, Project, Stage } from "../../src/types";

export type V7Status = "planning" | "researching" | "analysing" | "judging" | "done" | "error";
type ServerV7 = ResultsV7 & { status?: V7Status; error?: string };

let cfg: Promise<AppConfig | null> | null = null;
/** GET /api/config once (null when the server is unreachable). */
export const liveConfig = (): Promise<AppConfig | null> => (cfg ??= api.config().catch(() => ((cfg = null), null)));

export const draftSign = (title: string): CompanySign => ({ kind: "draft", name: title, color: "#1D1D1F" });

/** A ProjectV7 shell for a project we only know from "Your offices" (localStorage) or that was just created. */
export function shellProject(id: string, idea: string, title: string, createdAt = new Date().toISOString()): ProjectV7 {
  return { id, idea, title, createdAt, v7: { version: 7, roster: [], work: [], report: null, steers: [] }, level: 0, sign: draftSign(title), legacy: null };
}

/** Saved projects (this browser) → ProjectV7 shells, newest first. */
export function savedShells(): ProjectV7[] {
  return saved.list().map((r) => {
    const p = shellProject(r.id, r.title, r.title, new Date(r.createdAt).toISOString());
    p.level = (r.stage === "live" ? 1 : 0) as WorldLevel;
    return p;
  });
}

export interface LiveRun {
  readonly id: string;
  readonly project: ProjectV7;
  readonly server: Project | null;
  readonly status: V7Status | null;
  readonly error: string | null;
  /** Every finding so far, in arrival order (a steer's replacement takes the place of the finding it replaces). */
  readonly findings: Finding[];
  readonly paid: Partial<Record<Stage, { txid: string; sats: number; cents: number }>>;
  readonly phase1Done: boolean;
  buildStatus(b: BuildDept): "queued" | "working" | "done" | "error" | undefined;
  readonly siteSlug: string | null;
  /** Resolves on the next update (or after `ms`). */
  next(ms?: number): Promise<void>;
  onUpdate(cb: (r: LiveRun) => void): () => void;
  /** Poll fast again (after a payment, a steer, a retry). */
  kick(): void;
  stop(): void;
}

const POLL_MIN = 900;
const POLL_MAX = 6000;

export function createLiveRun(id: string, seed?: ProjectV7): LiveRun {
  let project: ProjectV7 = seed ?? shellProject(id, "", "Your idea");
  let server: Project | null = null;
  let v7: ServerV7 | null = null;
  let order: string[] = []; // finding ids, arrival order
  let findings: Finding[] = [];
  let lastJson = "";
  let delay = POLL_MIN;
  let timer = 0;
  let stopped = false;
  let error: string | null = null;
  const cbs = new Set<(r: LiveRun) => void>();
  let waiters: Array<() => void> = [];

  const busy = () => {
    if (!server) return true;
    const st = server.status ?? {};
    const anyWorking = Object.values(st).some((s) => s === "queued" || s === "working");
    const v7busy = !!server.payments.validate && (!v7 || (v7.status !== "done" && v7.status !== "error"));
    const steering = !!v7?.steers.some((s) => s.status === "working");
    return anyWorking || v7busy || steering;
  };

  function order7(v: ServerV7): Finding[] {
    const all = v.work.flatMap((w) => [...w.findings].sort((a, b) => a.t - b.t));
    const byId = new Map(all.map((f) => [f.id, f]));
    const next: string[] = [];
    for (const fid of order) {
      if (byId.has(fid)) next.push(fid);
      else {
        // replaced by a steer: the replacement takes this place
        const rep = all.find((f) => f.replaces === fid && !next.includes(f.id) && !order.includes(f.id));
        if (rep) next.push(rep.id);
      }
    }
    // new arrivals: grouped by analyst in roster order (an analyst's batch reads as one stretch of work)
    for (const a of v.roster) for (const f of all) if (f.analyst === a.id && !next.includes(f.id)) next.push(f.id);
    for (const f of all) if (!next.includes(f.id)) next.push(f.id);
    order = next;
    return next.map((fid) => byId.get(fid)!);
  }

  function apply(p: Project) {
    server = p;
    v7 = ((p.results as unknown as { v7?: ServerV7 }).v7 ?? null) as ServerV7 | null;
    // working title from the founder's own words (the sign says "draft" until Nova names it)
    const title = shortTitle(p.idea);
    findings = v7 ? order7(v7) : [];
    const results: ResultsV7 = v7 ? { version: 7, roster: v7.roster, work: v7.work, report: v7.status === "done" ? v7.report : null, steers: v7.steers } : { version: 7, roster: [], work: [], report: null, steers: [] };
    // v7.1: the 4-block sections and the team's progress notes (optional, written by the server when present)
    if (v7?.blocks?.length) results.blocks = v7.blocks;
    // the unit economics computed by the server (written report only)
    if (v7 && v7.status === "done" && v7.econ !== undefined) results.econ = v7.econ;
    if (v7?.status === "done" && typeof v7.econErr === "string") results.econErr = v7.econErr;
    if (v7 && Array.isArray((v7 as { notes?: unknown }).notes)) Object.assign(results, { notes: (v7 as { notes?: unknown }).notes });
    const built = !!(p.results.nova || p.results.dex || p.results.rae || p.results.pip);
    project = {
      id: p.id,
      idea: p.idea,
      title,
      createdAt: new Date(p.created_at).toISOString(),
      v7: results,
      level: (p.results.pip ? 1 : 0) as WorldLevel,
      sign: draftSign(title),
      legacy: built || p.payments.build ? p : null,
    };
    error = v7?.status === "error" ? v7.error || "The team hit a snag." : null;
    // the read-only examples are not "your" projects: they stay out of this browser's list
    if (!p.example) saved.upsert(p);
  }

  async function tick() {
    timer = 0;
    if (stopped) return;
    try {
      const p = await api.get(id);
      const json = JSON.stringify([p.status, p.payments, (p.results as unknown as { v7?: unknown }).v7, !!p.results.nova, !!p.results.dex, !!p.results.rae, p.results.pip]);
      if (json !== lastJson) {
        lastJson = json;
        apply(p);
        delay = POLL_MIN;
        emit();
      } else delay = Math.min(POLL_MAX, Math.round(delay * 1.5));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        error = "This project is not on this server.";
        emit();
        return;
      }
      delay = Math.min(POLL_MAX, delay * 2);
    }
    if (!stopped && (busy() || !server)) timer = window.setTimeout(tick, delay);
  }
  function emit() {
    cbs.forEach((cb) => cb(run));
    const w = waiters;
    waiters = [];
    w.forEach((r) => r());
  }

  const run: LiveRun = {
    id,
    get project() { return project; },
    get server() { return server; },
    get status() { return v7?.status ?? null; },
    get error() { return error; },
    get findings() { return findings; },
    get paid() { return server?.payments ?? {}; },
    get phase1Done() { return v7?.status === "done" && !!v7.report; },
    buildStatus: (b) => server?.status?.[b],
    get siteSlug() { return server?.results.pip?.slug ?? null; },
    next: (ms = 4000) => new Promise<void>((r) => {
      waiters.push(r);
      window.setTimeout(r, ms);
    }),
    onUpdate(cb) {
      cbs.add(cb);
      return () => cbs.delete(cb);
    },
    kick() {
      delay = POLL_MIN;
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(tick, 300);
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
  void tick();
  return run;
}

/** POST /api/projects (+ saves the owner key in this browser's "Your offices"). */
export async function createProject(idea: string): Promise<ProjectV7> {
  const c = await api.create(idea);
  const title = shortTitle(idea);
  const p = await api.get(c.id);
  saved.upsert(p, { ownerKey: c.ownerKey ?? null });
  return shellProject(c.id, idea, title);
}

/** POST /api/projects/:id/steer → 202 {id, ack, rerun}. */
export async function postSteer(id: string, note: string): Promise<{ id: string; ack: string; rerun: AnalystRole[] }> {
  const key = saved.ownerKey(id);
  let r: Response;
  try {
    r = await fetch(`/api/projects/${encodeURIComponent(id)}/steer`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { "x-owner-key": key } : {}) },
      body: JSON.stringify({ note }),
    });
  } catch {
    throw new ApiError("Cannot reach the LaunchDesk server. Check your connection.", 0);
  }
  const data = (await r.json().catch(() => ({}))) as { error?: string; id: string; ack: string; rerun: AnalystRole[] };
  if (!r.ok) throw new ApiError(data.error || `Request failed (${r.status})`, r.status);
  return data;
}

/** Human status for the wait between findings. */
export function statusLine(s: V7Status | null): string {
  switch (s) {
    case "planning": return "Picking your team";
    case "researching": return "Reading the web";
    case "analysing": return "Analysts at work";
    case "judging": return "Writing your report";
    case "error": return "Your team hit a snag";
    default: return "Starting the research";
  }
}
