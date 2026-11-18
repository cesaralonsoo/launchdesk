// v8 redesign seam (WP-0): shared game vocabulary. Owned by WP-C (game/**); others import, never edit.
// Spec: redesign PLAN.md section 5. Everything here is derived from server data only (no XP, no points).
import type { FlowStepV7 } from "../contracts";

/** The four stages a company grows through (level-up moments fire once per project per stage). */
export type Stage = "research" | "studio" | "offices" | "campus";
/** Floor-1 rooms (lobby 1 + research 4 + launch kit 3) and the four offices on floor 2. */
export type FloorRoomId = "lobby" | "r0" | "r1" | "r2" | "r3" | "nova" | "dex" | "launch";
export type OfficeId = "marketing" | "research" | "money" | "customers";
export type RoomId = FloorRoomId | `office:${OfficeId}`;
/** Badges (section 5.3). Each is granted only from a server field; payment badges carry their tx. */
export type Milestone =
  | "money-locked"
  | "report-delivered"
  | "dodged-bad-idea"
  | "ceo-note"
  | "kit-paid"
  | "site-live"
  | "first-office-task"
  | "all-offices"
  | "second-idea";

/** Fired on window by flow/index.ts enter() on every step change (animated or snapped). */
export const STEP_EVENT = "ld:step";
export interface StepDetail {
  step: FlowStepV7;
  projectId: string;
  /** true for the tour and sample worlds (no real run behind them): nothing is persisted. */
  sample: boolean;
}
declare global {
  interface WindowEventMap {
    "ld:step": CustomEvent<StepDetail>;
  }
}

/** "Open your offices" (ui/kit-screen.ts) asks the game layer to open the offices floor over the 3D. The game calls
 *  preventDefault() when it handles it; otherwise the kit screen opens the offices on its own (old layer). */
export const OFFICES_EVENT = "ld:offices";
export interface OfficesOpenDetail {
  projectId: string;
  ownerKey: string | null;
  name?: string;
}
declare global {
  interface WindowEventMap {
    "ld:offices": CustomEvent<OfficesOpenDetail>;
  }
}
