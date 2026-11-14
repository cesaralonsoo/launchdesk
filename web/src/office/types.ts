import type { AgentState, ChipTone, DeptId, PinSpec } from "./layout";

export type { AgentState, ChipTone, DeptId, PinSpec };
export type { Rect } from "./overlay";
import type { Rect } from "./overlay";

export type FocusOpts = {
  /** Camera move duration in ms (default 900, 0 = instant). */
  ms?: number;
  /** Pixels covered by other UI (e.g. a department panel on the right) — the room is centred in what is left. */
  inset?: { top?: number; right?: number; bottom?: number; left?: number };
  /** The visible part of the office in px (office coordinates). The room's centre lands in its middle. Wins over `inset`. */
  free?: Rect;
  /** Other rooms that must be in frame too (e.g. the lobby while Mia fetches the budget). */
  with?: DeptId[];
};

export interface Office {
  readonly mode: "3d" | "2d";
  focus(room: DeptId | "overview", opts?: FocusOpts): void;
  zoom(delta: 1 | -1): void;
  fit(): void;
  setState(id: DeptId, s: AgentState): void;
  /** Walks via the corridor; walk(id, id) returns the agent home. Resolves on arrival. */
  walk(id: DeptId, to: DeptId): Promise<void>;
  /** Rising pill that fades after ~2.5 s. */
  chip(room: DeptId, text: string, tone?: ChipTone): void;
  /** Persistent result bubble above the room (one per room; a new pin replaces the old one). */
  pin(room: DeptId, p: PinSpec): void;
  clearPins(): void;
  celebrate(): void;
  onAgentClick(cb: (id: DeptId) => void): void;
  dispose(): void;
  // ---- extras (additive, optional to use) ----
  /** Second line under the room label, e.g. "Writing the plan". null clears it. */
  note(id: DeptId, text: string | null): void;
  /** Speech bubble over an agent (defaults to their role intro). */
  say(id: DeptId, text?: string): void;
  /** Red "needs retry" state: "!" over the agent and a red room label. */
  flag(id: DeptId, on: boolean): void;
  /** Rects (office px) covered by other UI; labels and pins under them fade out. */
  setOccluders(fn: () => Rect[]): void;
  /** Projected centre of a room in office px (used by visual checks). */
  roomCenter(id: DeptId): { x: number; y: number };
}
