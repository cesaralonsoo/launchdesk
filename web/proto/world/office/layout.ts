// WS-OFFICE · v7 floor plan (same 4×2 grid and footprint as v5/v6; contracts FLOOR_PLAN).
// World units: X runs along the building (left → right), Z runs back (−) → front (+), Y is up.
//   back row  r0 r1 r2 r3      research wing, one analyst each (a 5th analyst takes the 2nd desk in r3)
//   front row lobby nova dex launch   founder's CEO desk + reception · brand · design · launch (Rae desk 0, Pip desk 1)
import type { FloorRoom, Room } from "../../contracts";
import { FLOOR_PLAN } from "../../contracts";
import type { Spot } from "./cast";

export const ROOM_W = 6;
export const ROOM_D = 5;
export const CORRIDOR = 1.6;
export const ROW_Z = CORRIDOR / 2 + ROOM_D / 2; // 3.3
export const SLAB_PAD = 0.45;
export const HALF_X = (ROOM_W * 4) / 2; // 12
export const HALF_Z = CORRIDOR / 2 + ROOM_D; // 5.8

export interface RoomDef {
  id: FloorRoom;
  row: "back" | "front";
  col: 0 | 1 | 2 | 3;
  cx: number;
  cz: number;
}

export const FLOOR_ROOMS: readonly FloorRoom[] = ["r0", "r1", "r2", "r3", "lobby", "nova", "dex", "launch"];
export const ROOMS: RoomDef[] = FLOOR_ROOMS.map((id) => {
  const p = FLOOR_PLAN[id];
  return { id, row: p.row, col: p.col, cx: -HALF_X + ROOM_W / 2 + p.col * ROOM_W, cz: p.row === "back" ? -ROW_Z : ROW_Z };
});
export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<FloorRoom, RoomDef>;

/** v5/v6 room ids → v7 floor rooms (compat for the old OfficeModel API: setDeptState / roomBounds / pick / anchor). */
export const LEGACY_ROOM: Record<Room, FloorRoom> = { mia: "r0", leo: "r1", sam: "r2", nova: "nova", dex: "dex", rae: "launch", pip: "launch", lobby: "lobby" };
export const LEGACY_OF: Record<FloorRoom, Room> = { r0: "mia", r1: "leo", r2: "sam", r3: "sam", lobby: "lobby", nova: "nova", dex: "dex", launch: "rae" };

// ─────────────────────────────────────────────── seats (room-local)

const BACK_0: Spot = { seat: { x: -1.55, z: -1.28, yaw: Math.PI }, stand: { x: -0.55, z: -0.35, yaw: Math.PI / 4 }, face: { x: -0.6, z: 2.4 } };
const BACK_1: Spot = { seat: { x: 1.25, z: -1.28, yaw: Math.PI }, stand: { x: 1.95, z: -0.35, yaw: -Math.PI / 5 }, face: { x: 1.2, z: 2.4 } };
const FRONT_0: Spot = { seat: { x: -1.62, z: 0.2, yaw: -Math.PI / 2 }, stand: { x: -0.7, z: 0.95, yaw: Math.PI / 4 }, face: { x: -1, z: -2.4 } };
const PIP: Spot = { seat: { x: 1.15, z: 0.8, yaw: 0 }, stand: { x: 1.75, z: 0.25, yaw: Math.PI / 4 }, face: { x: -1, z: -2.4 } };
/** The founder's CEO desk in the lobby — the same spot as the bedroom desk (the bedroom sits on the lobby). */
export const FOUNDER_SPOT: Spot = { seat: { x: -2.2, z: 0.35, yaw: Math.PI / 2 }, stand: { x: -1.25, z: 1.05, yaw: Math.PI / 3 }, sitIdle: true, face: { x: 0, z: 2 } };

/** Room-local spot for an actor sitting at `desk` of `room`. */
export function floorSpot(room: FloorRoom, desk: 0 | 1): Spot {
  if (room === "lobby") return FOUNDER_SPOT;
  if (room === "launch") return desk === 1 ? PIP : FRONT_0;
  if (room === "nova" || room === "dex") return FRONT_0;
  return desk === 1 ? BACK_1 : BACK_0;
}

/** Spot moved into office-root coordinates. */
export function toRoot(r: RoomDef, s: Spot): Spot {
  const m = (p: { x: number; z: number; yaw: number }) => ({ x: p.x + r.cx, z: p.z + r.cz, yaw: p.yaw });
  return { ...s, seat: m(s.seat), stand: m(s.stand), face: s.face ? { x: s.face.x + r.cx, z: s.face.z + r.cz } : undefined };
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
