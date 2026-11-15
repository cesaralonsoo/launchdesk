// Real sample data (WS-C owns). pausa.json = exampleProject() from server/mocks.ts, dumped verbatim (coffee kiosk, Barcelona).
// Never invent numbers: every figure the UI shows must come from PAUSA.
import type { Project } from "../../src/types";
import type { PastProject } from "../contracts";
import raw from "./pausa.json";

export const PAUSA = raw as unknown as Project;
export const IDEA = PAUSA.idea;

/** v6: seeds for "Your projects" (WS-C fills these with real sample runs; the UI adds the visitor's own runs from localStorage). */
export const PAST_PROJECTS: PastProject[] = [];
