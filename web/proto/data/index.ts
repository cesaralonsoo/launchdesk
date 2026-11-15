// Real sample data (WS-C owns). Generated from server/mocks.ts through the real sanitizers (see DATA.md):
//   pausa.json            = exampleProject()  coffee kiosk, Barcelona (the run the prototype plays)
//   past/*.json           = sampleProject()   three earlier runs for "Your projects"
// Never invent numbers: every figure the UI shows must come from these payloads.
import type { Project } from "../../src/types";
import type { Level, PastProject } from "../contracts";
import raw from "./pausa.json";
import bikes from "./past/segunda-vuelta.json";
import dog from "./past/ronda.json";
import bread from "./past/miga.json";
import games from "./past/tablero.json";
import { v6 } from "./v6";

export const PAUSA = raw as unknown as Project;
export const IDEA = PAUSA.idea;

/** How far a run got, same rule as the flow (integrate v6): 1 office = validated (any verdict, not built) ·
 *  2 tower = built and live · 3 district = live and grown (every finished stored run reaches the district). */
export const levelOf = (p: Project): Level => (p.results.pip ? 3 : 1);

/** Builds a "Your projects" row from any stored project (also used for the visitor's own runs). */
export function toPast(p: Project): PastProject {
  const r = v6(p);
  const brand = r.nova?.names[r.nova.chosen]?.name;
  return {
    id: p.id,
    title: brand ?? r.mia?.title ?? p.idea.slice(0, 40),
    idea: p.idea,
    score: r.leo?.score ?? null,
    verdict: r.leo?.verdict ?? null,
    level: levelOf(p),
    createdAt: new Date(p.created_at).toISOString(),
    project: p,
  };
}

/**
 * v6: seeds for "Your projects", newest first (the UI adds the visitor's own runs from localStorage):
 * Miga (sourdough classes, Go, validated → tower), Ronda (dog walks, Pivot → stopped at the office),
 * Tablero (board-game café, No-go, the honest no), Segunda Vuelta (restored bikes, Go, launched → district).
 */
export const PAST_PROJECTS: PastProject[] = [bread, dog, games, bikes].map((p) => toPast(p as unknown as Project));
