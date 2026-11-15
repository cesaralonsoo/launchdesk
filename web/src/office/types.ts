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

/**
 * What the 3D scene (scene.ts) and the 2D fallback implement. Kept as-is so the scene file stays untouched.
 * App code uses `Office` from office/index.ts (= LiveOffice below), which adds the v4 money API.
 */
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

/**
 * v4 additions (spec-v4 L26, M7). Owner: WS2. Frozen signatures (contracts-v4.md).
 * createOffice() returns this; index.ts adds default implementations on top of any Office.
 */
export interface LiveOffice extends Office {
  /**
   * A 10px BCH-green coin travels between two rooms' projected centres (700ms ease-in-out, 6px arc).
   * Internal moves show the coin only (no amount text). Resolves on arrival. 2D: simple fade.
   * Reduced motion: resolves immediately without drawing.
   */
  coin(from: DeptId, to: DeptId): Promise<void>;
  /**
   * A 28px coin flies from a viewport rect (e.g. the pay sheet's check) to a room (520ms ease-in-out,
   * −24px arc at 50%). Used by pay.ts after a real payment: `office.coinFromRect(rect, "lobby")`.
   */
  coinFromRect(rect: DOMRect, to: DeptId): Promise<void>;
}
