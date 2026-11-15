// v7 (WS-EXP) · Guard so the flow always gets a WorldV7. WS-WORLD's createWorld returns one directly; until (or unless)
// that lands, a v6 World is adapted the way the tech lead's stub did (level 0 drawn as level 1, roster 0/1/2 → the old
// mia/leo/sam rooms). Kept here, not imported from world/v7.ts, because WS-WORLD deletes that adapter.
import type { ActorId, ActorState, Analyst, Dept, DeptState, FocusTarget, Level, World, WorldLevel, WorldV7 } from "../contracts";
import { BUILD_TEAM } from "../contracts";

const OLD: readonly Dept[] = ["mia", "leo", "sam"];
const STATE: Record<ActorState, DeptState> = { absent: "locked", arriving: "working", idle: "idle", working: "working", presenting: "working", done: "done", asleep: "locked" };

export function ensureWorldV7(w: World): WorldV7 {
  if ("setWorldLevel" in w && typeof (w as WorldV7).setWorldLevel === "function") return w as WorldV7;
  let roster: readonly Analyst[] = [];
  let cap: WorldLevel = 3;
  let wl: WorldLevel = 1;
  const dept = (id: ActorId): Dept | null =>
    id === "founder" ? null : (BUILD_TEAM as readonly string[]).includes(id) ? (id as Dept) : OLD[roster.findIndex((a) => a.id === id)] ?? null;
  const v7: Omit<WorldV7, keyof World> = {
    get worldLevel() { return wl; },
    async setWorldLevel(l, opts) { wl = Math.min(l, cap) as WorldLevel; await w.setLevel(Math.max(1, wl) as Level, opts); },
    setLevelCap(c) { cap = c; },
    setRoster(r) { roster = r; },
    setActorState(id, s) { const d = dept(id); if (d) w.setDeptState(d, STATE[s]); },
    pulse() {},
    focusActor(id, opts) { const d = id === "overview" ? "overview" : id === "founder" ? "lobby" : dept(id); return w.focus((d ?? "overview") as FocusTarget, opts); },
    actorScreenPoint(id) { const d = id === "founder" ? "lobby" : dept(id); return d ? w.roomScreenPoint(d) : null; },
    onActorClick(cb) { return w.onRoomClick((room) => { const i = OLD.indexOf(room as Dept); const a = i >= 0 ? roster[i] : null; cb(a ? a.id : room === "lobby" ? "founder" : (room as ActorId)); }); },
    setSign() {},
    async setProject(p, opts) { roster = p.roster; cap = p.cap; await this.setWorldLevel(p.level, opts); },
  };
  return Object.defineProperties(Object.create(w), Object.getOwnPropertyDescriptors(v7)) as WorldV7;
}
