// WS-A1 / WS-WORLD · Dev-only world harness (not linked from the app): /proto/world/harness.html
// ?scene=office|building|district  ?time=…  ?cycle=…  ?still=1  ?quality=low  ?portfolio=0..6  ?built=1  ?labels=1  ?clock=1
// v7: ?wl=0..3 (world level) ?cap=0..3 ?ask=0..3 (asks past the cap → ghost) ?boom=<ms> (pose the boom) ?play=boom
//     ?pixel=0..2 ?roster=3..5 (sample analysts from ROLE_LIBRARY) ?focus=<actor>
import type { ActorId, Analyst, AnalystRole, AtmospherePreset, PortfolioItem, WorldLevel } from "../contracts";
import { BUILD_TEAM, ROLE_LIBRARY, readParams } from "../contracts";
import { createDevRoom } from "./dev-room";
import { createWorldX } from "./index";

const GRAPHITE: AtmospherePreset = {
  timeOfDay: "studio", sky: ["#F4F6F9", "#E3E7ED"], fog: { color: "#E3E7ED", near: 60, far: 220 },
  key: { color: "#FFF4E6", intensity: 3.1, azimuth: 35, elevation: 48, shadows: true },
  ambient: { sky: "#F4F6FF", ground: "#B8B0A6", intensity: 0.72 }, ground: "#E6E9EE", exposure: 1.02,
  surfaces: { floor: "#F2F3F5", wall: "#FAFAFB", slab: "#D5DAE1", glass: "#DDEBFA", corridor: "#E9ECF0" }, accentStrength: 0.85, lightsOn: false,
};
const p = readParams();
const q = new URLSearchParams(location.search);
const level = p.scene === "district" ? 3 : p.scene === "building" ? 2 : 1;
const wlq = q.get("wl");
const wl = (wlq != null ? Math.max(0, Math.min(3, +wlq)) : level) as WorldLevel;
const world = createWorldX(document.getElementById("world")!, { quality: p.quality, atmosphere: GRAPHITE, level, worldLevel: wl, reducedMotion: p.still, createBedroom: q.get("devroom") === "1" ? createDevRoom : undefined });
const roles: AnalystRole[] = ["viability", "competition", "market", "location", "pricing"];
const rosterN = Math.max(0, Math.min(5, +(q.get("roster") ?? 4)));
const roster: Analyst[] = roles.slice(0, rosterN).map((r) => ({ id: r, role: r, name: ROLE_LIBRARY[r].name, color: ROLE_LIBRARY[r].color, mission: ROLE_LIBRARY[r].mission, why: "", weight: 1 / rosterN }));
world.setRoster(roster);
world.setSign({ kind: q.get("brand") === "1" ? "brand" : "draft", name: q.get("brand") === "1" ? "Pausa" : "Coffee kiosk", color: q.get("brand") === "1" ? "#1F6F5C" : "#2B2B33", glyph: "pause" });
world.setActorState("founder", "working", { instant: true });
roster.forEach((a, i) => world.setActorState(a.id, i === 1 ? "working" : wl >= 1 ? "done" : "idle", { instant: true }));
for (const b of BUILD_TEAM) world.setActorState(b, wl >= 1 && q.get("built") !== "0" ? "idle" : "asleep", { instant: true });
const cap = q.get("cap");
if (cap != null) world.setLevelCap(+cap as WorldLevel);
const ask = q.get("ask");
if (ask != null) void world.setWorldLevel(+ask as WorldLevel, { animate: false });
const boomMs = q.get("boom");
if (boomMs != null) world.debugBoom(+boomMs);
if (q.get("play") === "boom") setTimeout(() => void world.setWorldLevel(1), +(q.get("delay") ?? 800));
const focus = q.get("focus");
if (focus) void world.focusActor(focus as ActorId, { animate: false });
const n = Math.max(0, Math.min(6, +(q.get("portfolio") ?? (level === 3 ? 3 : 0))));
const TITLES = ["Night bakery", "Bike repair van", "Study planner", "Plant shop", "Language swap", "Pet sitter"];
const items: PortfolioItem[] = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, title: TITLES[i]!, level: ([3, 2, 1, 2, 1, 1] as const)[i]!, score: null }));
world.setPortfolio?.(items);
const labels = document.getElementById("labels")!;
if (q.get("labels") === "1") {
  const draw = () => {
    labels.innerHTML = world.portfolioScreenPoints().map((s) => `<span style="left:${s.x}px;top:${s.y}px">${items.find((i) => i.id === s.id)?.title ?? s.id}</span>`).join("");
  };
  world.onCameraChange(draw);
  setInterval(draw, 500);
}
if (q.get("clock") === "1") world.onClock((i) => (document.getElementById("clock")!.textContent = `${i.name} · t ${i.t.toFixed(3)} · daylight ${i.daylight.toFixed(2)} · warmth ${i.warmth.toFixed(2)}`));
Object.assign(window, { __proto: { world } });
