// Which level-up moments were already shown (PLAN.md 5.5). The ONLY thing the game keeps in localStorage: never what
// was earned (that always comes from the server), just "projectId:stage" keys so a reload replays nothing.
// Sample runs never write here; the tour may play its moments, but they are kept in memory only.
import type { Stage } from "./types";
import { newlyUnlocked, type GameState } from "./rules";

export const SEEN_KEY = "launchdesk.game.seen.v1";
const MAX = 400;

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export interface Seen {
  has(projectId: string, stage: Stage): boolean;
  /** Remembers a moment. `persist: false` (sample / tour) keeps it for this page only. */
  add(projectId: string, stage: Stage, persist: boolean): void;
}

export function createSeen(store: KV | null): Seen {
  const mem = new Set<string>();
  const read = (): string[] => {
    try {
      const v = JSON.parse(store?.getItem(SEEN_KEY) || "[]");
      return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  };
  return {
    has: (id, st) => mem.has(`${id}:${st}`) || read().includes(`${id}:${st}`),
    add(id, st, persist) {
      const k = `${id}:${st}`;
      mem.add(k);
      if (!persist || !store) return;
      try {
        const all = read().filter((x) => x !== k);
        store.setItem(SEEN_KEY, JSON.stringify([...all, k].slice(-MAX)));
      } catch {
        /* private window: the moment may replay once, nothing else breaks */
      }
    },
  };
}

/**
 * The level-ups to play now. Only a stage that unlocked while this page watched the project (prev → cur) fires, once
 * per project per stage. On the first look at a project everything already unlocked is marked seen silently.
 * Samples fire only in the tour (`tour`) and are never persisted. Examples never fire.
 */
export function levelUpsToPlay(prev: GameState | null, cur: GameState, seen: Seen, o: { tour: boolean }): Stage[] {
  const persist = !cur.sample;
  if (cur.example || (cur.sample && !o.tour)) return [];
  if (!prev || prev.projectId !== cur.projectId) {
    // first look: nothing replays (only real projects remember it; the tour starts from zero every time)
    if (!cur.sample) for (const s of cur.stages) if (s.unlocked) seen.add(cur.projectId, s.id, persist);
    return [];
  }
  const out: Stage[] = [];
  for (const st of newlyUnlocked(prev, cur)) {
    if (seen.has(cur.projectId, st)) continue;
    seen.add(cur.projectId, st, persist);
    out.push(st);
  }
  return out;
}
