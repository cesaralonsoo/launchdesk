// v8 redesign seam (WP-0): the world API the game layer, the home and the flow call. Implemented by WP-B (world/**);
// until then world/index.ts carries no-op stubs. Spec: redesign PLAN.md sections 4 and 7.0. Do not change signatures.
export type Wing = "research" | "studio";
export type Area = "floor" | "wing:back" | "wing:front" | "plate" | "stack" | "campus" | { room: string };
export type RoomState = "locked" | "idle" | "working" | "done";
export type OfficeRoomId = "marketing" | "research" | "money" | "customers";
export interface WorldV8 {
  unlockWing(w: Wing, o?: { animate?: boolean }): Promise<void>;
  setRooms(rooms: { id: string; state: RoomState }[]): void; // floor-1 lit states (game owns the truth)
  shotFor(a: Area): void; // camera presets incl. phones
  setOffices(rooms: { id: OfficeRoomId; state: "off" | "working" | "done"; results: number }[], o?: { sample?: boolean }): void;
  setCampus(items: { id: string; name: string; score?: number; verdict?: string; stage: 0 | 1 | 2 | 3; nogo?: boolean }[]): void;
  levelUp(to: "research" | "studio" | "offices" | "campus"): Promise<void>; // camera + geometry only; the card is UI
  setLobbyScreen(img: HTMLCanvasElement | null, line: string): void;
  setShowcase(mode: "example" | "yours"): void; // home hero states (crossfade)
  labelPoints(): { id: string; x: number; y: number; visible: boolean }[];
  onPick(cb: (id: string) => void): () => void;
  setPaused(p: boolean): void;
}
