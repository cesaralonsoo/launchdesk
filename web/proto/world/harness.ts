// WS-A1 · Dev-only world harness (not linked from the app): /proto/world/harness.html
// ?scene=office|building|district  ?time=…  ?cycle=…  ?still=1  ?quality=low  ?portfolio=0..6  ?built=1  ?labels=1  ?clock=1
import type { AtmospherePreset, PortfolioItem } from "../contracts";
import { readParams } from "../contracts";
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
const world = createWorldX(document.getElementById("world")!, { quality: p.quality, atmosphere: GRAPHITE, level, reducedMotion: p.still });
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
