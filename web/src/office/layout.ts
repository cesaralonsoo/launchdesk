// Shared floor-plan data for the 3D office and the 2D fallback.
// World units: X runs along the building (left → right), Z runs back (−) → front (+), Y is up.

export type DeptId = "lobby" | "mia" | "leo" | "sam" | "nova" | "dex" | "rae" | "pip";
export type AgentState = "idle" | "working" | "walking" | "sleeping" | "done";
export type ChipTone = "bch" | "gold" | "dept";
/** `iconHtml`: trusted SVG markup (e.g. the generated logo) shown instead of the letter icon. */
export type PinSpec = { kicker: string; value: string; tone?: string; icon?: string; iconHtml?: string };

export const ROOM_W = 6;
export const ROOM_D = 5;
export const CORRIDOR = 1.6;
export const ROW_Z = CORRIDOR / 2 + ROOM_D / 2; // 3.3
export const SLAB_PAD = 0.45;
export const HALF_X = (ROOM_W * 4) / 2; // 12
export const HALF_Z = CORRIDOR / 2 + ROOM_D; // 5.8

export type Vec2 = { x: number; z: number };

export type RoomDef = {
  id: DeptId;
  name: string;
  label: string;
  role: string;
  color: string;
  row: "back" | "front";
  col: number;
  cx: number;
  cz: number;
  intro: string;
  /** Local (room-relative) spots. */
  seat: Vec2 & { yaw: number };
  stand: Vec2 & { yaw: number };
  visit: Vec2;
  skin: string;
  hair: string;
  accessory: "bun" | "glasses" | "long" | "topbun" | "beanie" | "headphones" | "none" | "cap";
};

const BACK_SEAT = { x: -1.55, z: -1.28, yaw: Math.PI };
const BACK_STAND = { x: -0.55, z: -0.35, yaw: Math.PI / 4 };
const FRONT_SEAT = { x: -1.62, z: 0.2, yaw: -Math.PI / 2 };
const FRONT_STAND = { x: -0.7, z: 0.95, yaw: Math.PI / 4 };

function room(
  id: DeptId,
  row: "back" | "front",
  col: number,
  extra: Omit<RoomDef, "id" | "row" | "col" | "cx" | "cz" | "seat" | "stand" | "visit"> &
    Partial<Pick<RoomDef, "seat" | "stand" | "visit">>,
): RoomDef {
  const back = row === "back";
  return {
    id,
    row,
    col,
    cx: -HALF_X + ROOM_W / 2 + col * ROOM_W,
    cz: back ? -ROW_Z : ROW_Z,
    seat: back ? BACK_SEAT : FRONT_SEAT,
    stand: back ? BACK_STAND : FRONT_STAND,
    visit: back ? { x: 0.55, z: 0.75 } : { x: 0.45, z: -0.7 },
    ...extra,
  };
}

export const ROOMS: RoomDef[] = [
  room("mia", "back", 0, {
    name: "Mia", label: "MIA", role: "Chief of Staff", color: "#8B7CF6",
    intro: "Hi! I turn your idea into a brief and a 4-week plan for the whole team.",
    skin: "#F1C6A4", hair: "#3A2619", accessory: "bun",
  }),
  room("leo", "back", 1, {
    name: "Leo", label: "LEO", role: "Market Research", color: "#3B82F6",
    intro: "I scan the market and your competitors, then score the opportunity out of 10.",
    skin: "#C98E62", hair: "#1F1A17", accessory: "glasses",
  }),
  room("sam", "back", 2, {
    name: "Sam", label: "SAM", role: "Strategy & Finance", color: "#F59E0B",
    intro: "Price, start-up cost, break-even: I run the numbers before you spend a cent.",
    skin: "#8D5A3B", hair: "#141110", accessory: "none",
  }),
  room("nova", "back", 3, {
    name: "Nova", label: "NOVA", role: "Brand", color: "#EC4899",
    intro: "I find your name, your palette and the voice your brand speaks with.",
    skin: "#F5D2B8", hair: "#D9A441", accessory: "long",
  }),
  room("lobby", "front", 0, {
    name: "Lobby", label: "LOBBY", role: "Front desk · payments", color: "#0AC18E",
    intro: "Welcome to LaunchDesk! Stage payments land here, then I hand each department its budget.",
    skin: "#D9A27C", hair: "#2B2420", accessory: "cap",
    seat: { x: -1.95, z: -0.35, yaw: Math.PI / 2 },
    stand: { x: -1.95, z: -0.35, yaw: Math.PI / 2 },
    visit: { x: 0.2, z: -0.9 },
  }),
  room("dex", "front", 1, {
    name: "Dex", label: "DEX", role: "Design & Product", color: "#F97362",
    intro: "I sketch three logo concepts and write the copy for your landing page.",
    skin: "#E0A982", hair: "#5A3825", accessory: "beanie",
  }),
  room("rae", "front", 2, {
    name: "Rae", label: "RAE", role: "Marketing & Content", color: "#14B8A6",
    intro: "I plan your first 30 days of posts and write the first three for you.",
    skin: "#6E4630", hair: "#1A1311", accessory: "topbun",
  }),
  room("pip", "front", 3, {
    name: "Pip", label: "PIP", role: "Launch Pad", color: "#94A3B8",
    intro: "I put your landing page live with Bitcoin Cash pre-orders. Wake me at launch time. Zzz…",
    skin: "#F2C7A5", hair: "#C4562B", accessory: "headphones",
    stand: { x: 1.15, z: 1.15, yaw: Math.PI / 4 },
  }),
];

export const ROOM: Record<DeptId, RoomDef> = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<DeptId, RoomDef>;
export const DEPT_IDS = ROOMS.map((r) => r.id);

export function toWorld(r: RoomDef, p: Vec2): Vec2 {
  return { x: r.cx + p.x, z: r.cz + p.z };
}

/** Point just inside a room's doorway (on the corridor side). */
export function doorInner(r: RoomDef): Vec2 {
  return { x: r.cx, z: r.row === "back" ? r.cz + ROOM_D / 2 - 0.9 : r.cz - ROOM_D / 2 + 0.9 };
}
export function doorCorridor(r: RoomDef): Vec2 {
  return { x: r.cx, z: 0 };
}

/** Which room (if any) contains a world point. */
export function roomAt(p: Vec2): RoomDef | null {
  for (const r of ROOMS) {
    if (Math.abs(p.x - r.cx) <= ROOM_W / 2 && Math.abs(p.z - r.cz) <= ROOM_D / 2) return r;
  }
  return null;
}

/** Waypoints from a world point to a destination world point inside room `to`, via the corridor. */
export function route(from: Vec2, to: RoomDef, dest: Vec2): Vec2[] {
  const here = roomAt(from);
  const pts: Vec2[] = [];
  if (here && here.id === to.id) {
    pts.push(dest);
    return pts;
  }
  if (here) {
    pts.push(doorInner(here), doorCorridor(here));
  } else {
    pts.push({ x: from.x, z: 0 });
  }
  pts.push(doorCorridor(to), doorInner(to), dest);
  return pts;
}

export const DEPT_INITIAL: Record<DeptId, string> = {
  lobby: "B", mia: "M", leo: "L", sam: "S", nova: "N", dex: "D", rae: "R", pip: "P",
};

export function toneColor(tone: string | undefined, fallback: string): string {
  if (!tone) return fallback;
  if (tone === "bch" || tone === "go") return "#0AC18E";
  if (tone === "gold") return "#F5C542";
  if (tone === "danger" || tone === "no-go") return "#FF7A6B";
  if (tone === "pivot") return "#F59E0B";
  if (tone in ROOM) return ROOM[tone as DeptId].color;
  if (/^#[0-9a-f]{3,8}$/i.test(tone)) return tone;
  return fallback;
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
