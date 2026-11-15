// v7 sample worlds (WS-INTEL). Generated, never hand-edited: `MOCK_AI=1 DATABASE_URL=:memory: npx tsx server/seed/gen-v7.ts`
// writes data/v7/*.json from server/v7-samples.ts through the server's own maths (buildReport / applySteer).
//
// Honesty: every `source` is a page WS-INTEL actually opened (url, title, domain, accessed 2026-11-15); everything
// else is kind "estimate" (or a risk/strength without source) with its `basis`. Scores are computed, not typed.
// See DATA.md (v7) for the hero element per screen and the reveal order.
import type { AnalystRole, CompanySign, Finding, ProjectV7, ResultsV7, SteerResult } from "../contracts";
import type { Project } from "../../src/types";
import raw from "./pausa.json";
import pausaJson from "./v7/pausa.json";
import tiqueJson from "./v7/tique.json";
import rondaJson from "./v7/ronda.json";
import fornJson from "./v7/forn.json";

const PAUSA = raw as unknown as Project; // direct import (not ./index) to avoid an import cycle

/** A prepared CEO note (demo): `match` is tested against the lower-cased note. */
export interface PreparedSteer { key: string; match: RegExp; note: string; result: SteerResult }
type World = Omit<ProjectV7, "legacy"> & { legacy: unknown; prepared: Array<{ key: string; match: string; note: string; result: SteerResult }> };

const PREPARED = new Map<string, PreparedSteer[]>();
function load(json: unknown, legacy?: Project): ProjectV7 {
  const w = json as World;
  PREPARED.set(w.id, w.prepared.map((p) => ({ key: p.key, match: new RegExp(p.match), note: p.note, result: p.result })));
  const { prepared: _drop, ...project } = w;
  void _drop;
  return { ...project, legacy: legacy ?? w.legacy } as ProjectV7;
}

/** The run the prototype and ?demo=1 play: Pausa, coffee at a Barcelona metro exit. Starts in the room (level 0). */
export const SAMPLE_V7: ProjectV7 = load(pausaJson, PAUSA);

/** "Your offices", newest first: one world per project, each at the level it reached and capped by its scalability.
 *  pausa (room, the demo) · forn (bakery, floor = its cap) · ronda (dog walks, building = its cap) · tique (SaaS, district). */
export const PROJECTS_V7: ProjectV7[] = [SAMPLE_V7, load(fornJson), load(rondaJson), load(tiqueJson)];

/** The note ?demo=1 types at 64 s (it has a prepared, sourced answer). */
export const DEMO_STEER_NOTE = PREPARED.get(SAMPLE_V7.id)![0]!.note;
/** Prepared notes per project id (UI may offer them as suggestion chips). */
export const preparedSteers = (projectId: string): readonly PreparedSteer[] => PREPARED.get(projectId) ?? [];

/**
 * Proto mock of POST /api/projects/:id/steer (deterministic). A note that matches a prepared variant returns that
 * finished steer (new findings with sources or labelled estimates, real diffs). Anything else is acknowledged
 * honestly with no changes: the prototype cannot research new evidence.
 */
export function mockSteer(p: ProjectV7, note: string, target?: AnalystRole[]): SteerResult {
  const t = ` ${note.toLowerCase()} `;
  const hit = preparedSteers(p.id).find((s) => s.match.test(t));
  const id = `steer-${p.v7.steers.length + 1}`;
  if (hit && !p.v7.steers.some((s) => s.note === hit.result.note)) return { ...structuredClone(hit.result), id, note: note.slice(0, 280) };
  const rerun = (target?.length ? target : [p.v7.roster.at(-1)?.id ?? "viability"]).filter((r) => p.v7.roster.some((a) => a.id === r));
  return {
    id, note: note.slice(0, 280), ack: "Noted. The prototype can't research new evidence for that.", status: "done",
    rerun, hired: [], dropped: [], findings: [], changes: [], report: p.v7.report, at: new Date().toISOString(),
  };
}

/** Applies a finished steer to a project (what the server stores): merged findings, new report, steer appended. */
export function applySteerToProject(p: ProjectV7, s: SteerResult): ProjectV7 {
  const gone = new Set(s.findings.map((f) => f.replaces).filter(Boolean));
  const fresh = (role: AnalystRole) => s.findings.filter((f) => f.analyst === role);
  const roster = [...p.v7.roster.filter((a) => !s.dropped.includes(a.id)), ...s.hired];
  const work = roster.map((a) => {
    const w = p.v7.work.find((x) => x.analyst === a.id) ?? { analyst: a.id, status: "done" as const, findings: [], score: null, headline: "" };
    const add = fresh(a.id);
    if (!add.length && !s.report) return w;
    const factor = s.report?.factors.find((f) => f.analyst === a.id);
    const last = Math.max(0, ...w.findings.map((f) => f.t));
    const shifted = add.map((f, i) => ({ ...f, t: last + 2600 * (i + 1) })); // reveal after the kept findings
    return { ...w, findings: [...w.findings.filter((f) => !gone.has(f.id)), ...shifted], score: factor?.score ?? w.score };
  });
  const v7: ResultsV7 = { ...p.v7, roster: s.report ? roster : p.v7.roster, work, report: s.report ?? p.v7.report, steers: [...p.v7.steers, s] };
  return { ...p, v7 };
}

/** All findings in reveal order (roster order, then t): what the evidence step plays one at a time. */
export const findingsInOrder = (p: ProjectV7): Finding[] =>
  p.v7.roster.flatMap((a) => [...(p.v7.work.find((w) => w.analyst === a.id)?.findings ?? [])].sort((x, y) => x.t - y.t));

/** The lobby sign once Nova has named it (brand + Dex's first glyph), from a built project's legacy payload. */
export function brandSignOf(p: ProjectV7): CompanySign | null {
  const r = (p.legacy as Project | null)?.results;
  const b = r?.nova?.names[r.nova.chosen];
  if (!b) return null;
  const glyph = (r?.dex?.logos[0] as { glyph?: string } | undefined)?.glyph ?? "none";
  return { kind: "brand", name: b.name, tagline: b.tagline, color: b.palette[0]?.hex ?? "#1D1D1F", glyph };
}
