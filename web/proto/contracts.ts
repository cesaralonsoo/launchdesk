// LaunchDesk prototype v5 — FROZEN shared contracts. Owner: tech lead.
// Every workstream imports from here; nobody edits this file without updating CONTRACTS.md and telling the others.
// Additive changes only (new optional fields / new optional methods). Never rename or remove.
//
//   WS-A  web/proto/world/office/**                        → implements OfficeModel  (createOfficeModel)
//   WS-B  web/proto/world/index.ts, camera.ts, levels/**   → implements World        (createWorld)
//   WS-C  web/proto/ui/**, themes/**, flow/**, data/**, main.ts → Theme, Flow, UI
import type * as THREE from "three";

// ───────────────────────────────────────────────────────────── departments

export type Dept = "mia" | "leo" | "sam" | "nova" | "dex" | "rae" | "pip";
export type Room = Dept | "lobby";
export type Stage = "validate" | "build";

export const VALIDATE_DEPTS: readonly Dept[] = ["mia", "leo", "sam"];
export const BUILD_DEPTS: readonly Dept[] = ["nova", "dex", "rae", "pip"];
export const ALL_DEPTS: readonly Dept[] = [...VALIDATE_DEPTS, ...BUILD_DEPTS];
export const ALL_ROOMS: readonly Room[] = ["lobby", ...ALL_DEPTS];

/** Product-facing identity of each room. Colours are the room accents (same as web/src/office/layout.ts). */
export const ROOM_META: Record<Room, { name: string; does: string; color: string; stage: Stage | null }> = {
  lobby: { name: "Lobby", does: "Payments", color: "#0AC18E", stage: null },
  mia: { name: "Mia", does: "Plan", color: "#8B7CF6", stage: "validate" },
  leo: { name: "Leo", does: "Market score", color: "#3B82F6", stage: "validate" },
  sam: { name: "Sam", does: "Numbers", color: "#F59E0B", stage: "validate" },
  nova: { name: "Nova", does: "Name & brand", color: "#EC4899", stage: "build" },
  dex: { name: "Dex", does: "Logo & site", color: "#F97362", stage: "build" },
  rae: { name: "Rae", does: "Launch plan", color: "#14B8A6", stage: "build" },
  pip: { name: "Pip", does: "Goes live", color: "#94A3B8", stage: "build" },
};

/** Visual state of a room. 'locked' = not paid for yet (Build rooms before $0.20): dimmed, lights off. */
export type DeptState = "idle" | "working" | "done" | "locked";

/** 1 = the office (one floor) · 2 = the whole tower · 3 = the district. */
export type Level = 1 | 2 | 3;

// ───────────────────────────────────────────────────────────── atmosphere (theme → world mood)

export type TimeOfDay = "day" | "golden" | "night" | "studio";

export interface AtmospherePreset {
  timeOfDay: TimeOfDay;
  /** Page/sky background. One colour = flat; two = vertical gradient top → bottom (rendered by WS-B as a sky dome or CSS behind a transparent canvas). */
  sky: [string] | [string, string];
  /** Linear fog in world units. null = no fog. Fog colour should match the sky bottom. */
  fog: { color: string; near: number; far: number } | null;
  key: { color: string; intensity: number; /** azimuth/elevation in degrees, azimuth 0 = +Z (front), 90 = +X */ azimuth: number; elevation: number; shadows: boolean };
  ambient: { sky: string; ground: string; intensity: number };
  /** Ground plane around the buildings (streets / plaza). */
  ground: string;
  /** Tone mapping exposure, ~0.8–1.2. */
  exposure: number;
  /** Optional surface overrides for the office (WS-A reads them; anything missing = WS-A default). */
  surfaces?: Partial<{ floor: string; wall: string; slab: string; glass: string; corridor: string }>;
  /** 0..1, how much the room accent colours show (trims, floor tint). Mono theme ≈ 0.15, colourful ≈ 1. */
  accentStrength?: number;
  /** Night/golden: interior lamps and lit windows on (WS-A lamps, WS-B tower/district windows). */
  lightsOn?: boolean;
}

// ───────────────────────────────────────────────────────────── themes (WS-C)

export type ThemeId = "graphite" | "midnight" | "ivory" | "forest" | "mono";
export type LayoutId = "center" | "dock" | "side";

export interface ThemeTokens {
  id: ThemeId;
  name: string;
  /** One-line identity, shown only in the variant switcher. */
  tagline: string;
  fonts: {
    /** Google Fonts stylesheet URLs (css2). */
    hrefs: string[];
    display: string; // CSS font-family stacks
    text: string;
    numbers: string; // tabular figures are applied via font-variant-numeric
  };
  colors: {
    bg: string; // page background behind/around the canvas
    glass: string; // panel fill (rgba)
    glassStrong: string; // input/primary card fill (rgba)
    ink: string; // primary text
    muted: string; // secondary text
    line: string; // hairlines (rgba)
    accent: string; // primary action
    accentInk: string; // text on accent
    money: string; // BCH / payment green (or theme equivalent)
    positive: string;
    warning: string;
    negative: string;
  };
  radii: { sm: number; md: number; lg: number; pill: number };
  glass: { blur: number; saturate: number; border: string; shadow: string };
  scheme: "light" | "dark";
  atmosphere: AtmospherePreset;
}

// ───────────────────────────────────────────────────────────── office model (WS-A → WS-B)

/**
 * The level-1 office as a pure THREE object graph: no renderer, no camera, no DOM, no RAF.
 * Coordinates: same as web/src/office/layout.ts. Origin = centre of the corridor at floor level, Y up,
 * X along the building (−12.45 … +12.45 incl. slab), Z back (−) → front (+) (−6.25 … +6.25). Floor top at y = 0.
 * Slab underside at y ≈ −0.55. Tallest interior item ≤ 2.2.  WS-B places `root` inside the tower (level 2).
 */
export interface OfficeModel {
  readonly root: THREE.Group;
  /** Whole office footprint incl. slab, in root-local space. */
  bounds(): THREE.Box3;
  /** One room's box (floor → wall top + 0.5), root-local. Used for camera framing. */
  roomBounds(room: Room): THREE.Box3;
  setDeptState(dept: Dept, s: DeptState): void;
  applyAtmosphere(a: AtmospherePreset): void;
  /** Short local celebration (agents cheer, confetti in the room / lobby). */
  cheer(room?: Room): void;
  /** Advance animations. Returns true while something moves (WS-B then keeps rendering at full rate). */
  update(dt: number, t: number): boolean;
  /** Raycast helper for clicks. */
  pick(ray: THREE.Raycaster): Room | null;
  /** Optional: a mesh/point to anchor a floating DOM label (agent head), root-local. */
  anchor?(room: Room): THREE.Vector3;
  dispose(): void;
}
export type CreateOfficeModel = (opts: { quality: Quality }) => OfficeModel;

// ───────────────────────────────────────────────────────────── world (WS-B, uses WS-A)

export type Quality = "low" | "high";
export type FocusTarget = Room | "overview";
export type Insets = { left: number; right: number; top: number; bottom: number };

export interface WorldOptions {
  quality: Quality;
  atmosphere: AtmospherePreset;
  level?: Level; // initial, default 1
  /** Disable all motion (prefers-reduced-motion or screenshot mode): transitions resolve instantly. */
  reducedMotion?: boolean;
}

export interface World {
  /** Continuous camera pull-back (or push-in). Resolves when the camera settles. Level 2/3 geometry is lazy-built on first use. */
  setLevel(level: Level, opts?: { animate?: boolean }): Promise<void>;
  readonly level: Level;
  /** Frame one room (or the overview of the current level) in the free area left by setInsets. Default ~1100 ms ease. */
  focus(target: FocusTarget, opts?: { animate?: boolean; ms?: number }): Promise<void>;
  setDeptState(dept: Dept, s: DeptState): void;
  setAtmosphere(a: AtmospherePreset, opts?: { animate?: boolean }): void;
  /** CSS px of the canvas covered by UI. Re-frames the current focus (animated). */
  setInsets(i: Insets): void;
  celebrate(kind: "level-up" | "paid" | "live"): void;
  /** Projected screen point (CSS px, canvas-relative) of a room's anchor, for floating DOM tags. null if off-screen. */
  roomScreenPoint(room: Room): { x: number; y: number } | null;
  screenToRoom?(x: number, y: number): Room | null;
  onRoomClick(cb: (room: Room) => void): () => void;
  /** Fires every frame the camera moved (UI re-positions floating tags). */
  onCameraChange(cb: () => void): () => void;
  // ── v6: day cycle (WS-A1 implements). The world owns the clock; the UI listens and blends its tokens.
  setClock(c: ClockMode, opts?: { animate?: boolean }): void;
  getClock(): DayClockInfo;
  /** Fires at most ~10×/s while the clock moves (and once immediately on subscribe). */
  onClock(cb: (i: DayClockInfo) => void): () => void;
  /** v6: past projects become extra buildings in the district (level 3). Optional until WS-A1 lands it. */
  setPortfolio?(items: PortfolioItem[]): void;
  dispose(): void;
}
export type CreateWorld = (host: HTMLElement, opts: WorldOptions) => World;

// ───────────────────────────────────────────────────────────── v6 day cycle + portfolio

export type DayPhaseName = "dawn" | "day" | "golden" | "dusk" | "night";
export interface DayClockInfo {
  /** 0..1 time of day. 0 = midnight, 0.25 ≈ dawn, 0.5 = noon, 0.72 ≈ golden hour, 0.8 ≈ dusk. */
  t: number;
  name: DayPhaseName;
  /** 0 = full night … 1 = full day, smooth (UI blends its night ↔ day tokens with this). */
  daylight: number;
  /** 0..1 amount of warm low sun (golden hour / dawn). */
  warmth: number;
}
/** cycle: a full day every periodSec (default 240 s), starting at startAt (default: real local time of day mapped to 0..1). fixed: hold one time. */
export type ClockMode = { mode: "cycle"; periodSec?: number; startAt?: number } | { mode: "fixed"; t: number };
export interface PortfolioItem { id: string; title: string; level: Level; score: number | null }

/** A finished/abandoned run shown in "Your projects" (data/index.ts exports PAST_PROJECTS). `project` has the same shape as PAUSA. */
export interface PastProject {
  id: string;
  title: string;
  idea: string;
  score: number | null;
  verdict: "go" | "pivot" | "no-go" | null;
  level: Level;
  /** ISO date */
  createdAt: string;
  project: unknown;
}

// ───────────────────────────────────────────────────────────── flow (WS-C)

export type FlowStep =
  | "idle" // office overview, idea popup closed → opens automatically after ~1.2 s
  | "idea" // "What's your idea?" popup
  | "pay-validate" // simulated $0.10 approval
  | "validate" // Mia → Leo → Sam
  | "verdict" // summary + decision (Build / pivot / stop)
  | "level-up" // building unlocked moment (level 1 → 2)
  | "pay-build" // simulated $0.20 approval
  | "build" // Nova → Dex → Rae → Pip
  | "live" // site preview + pre-orders
  | "scale"; // level 3 district, growth path

/** Inside 'validate' / 'build': which dept, and whether it is still working or showing its result card. */
export type DeptPhase = "working" | "result";

export interface FlowState {
  step: FlowStep;
  dept?: Dept;
  phase?: DeptPhase;
  idea: string;
  level: Level;
}

export interface Flow {
  readonly state: FlowState;
  /** Jump straight to a state (deep links, replay). World + UI snap without animation. */
  goto(s: Partial<FlowState> & { step: FlowStep }): void;
  /** User intent: submit idea, approve payment, Next on a result card, Build, Stop… */
  next(action?: FlowAction): void;
  replay(): void;
  setSpeed(x: 1 | 3): void; // 3 = fast/demo mode
  onChange(cb: (s: FlowState, prev: FlowState) => void): () => void;
}
export type FlowAction =
  | { type: "submit-idea"; idea: string }
  | { type: "approve-pay" }
  | { type: "next" } // advance from a result card
  | { type: "decide"; choice: "build" | "pivot" | "stop" }
  | { type: "continue" }; // level-up / live → next

// ───────────────────────────────────────────────────────────── URL params (all optional)

export interface ProtoParams {
  theme: ThemeId; // ?theme=graphite|midnight|ivory|forest|mono   (default graphite)
  layout: LayoutId; // ?layout=center|dock|side                       (default center)
  quality: Quality; // ?quality=low|high                              (default: high, low if no WebGL2 / small screen)
  scene: "office" | "building" | "district" | null; // ?scene= world-only showcase: level 1/2/3, overview, UI hidden
  step: FlowStep | null; // ?step=verdict
  dept: Dept | null; // ?dept=leo (with step=validate|build)
  phase: DeptPhase | null; // ?phase=result
  focus: FocusTarget | null; // ?focus=leo (world camera override, for screenshots)
  fast: boolean; // ?fast=1 → speed x3
  ui: boolean; // ?ui=0 hides all UI (pure world)
  switcher: boolean; // ?switcher=0 hides the variant switcher (clean screenshots)
  still: boolean; // ?still=1 → reduced motion: no camera tweens, no idle bob (deterministic screenshots)
  /** v6 ?time=dawn|day|golden|dusk|night|0..1 → fixed time of day (screenshots). null = live cycle. */
  time: number | null;
  /** v6 ?cycle=<seconds> → length of a full day (default 240). */
  cycle: number | null;
}

export const DAY_TIMES: Record<DayPhaseName, number> = { dawn: 0.26, day: 0.5, golden: 0.72, dusk: 0.8, night: 0.0 };

const pick = <T extends string>(v: string | null, all: readonly T[], d: T): T => (v && (all as readonly string[]).includes(v) ? (v as T) : d);
const pickN = <T extends string>(v: string | null, all: readonly T[]): T | null => (v && (all as readonly string[]).includes(v) ? (v as T) : null);
export const THEME_IDS: readonly ThemeId[] = ["graphite", "midnight", "ivory", "forest", "mono"];
export const LAYOUT_IDS: readonly LayoutId[] = ["center", "dock", "side"];
export const FLOW_STEPS: readonly FlowStep[] = ["idle", "idea", "pay-validate", "validate", "verdict", "level-up", "pay-build", "build", "live", "scale"];

export function readParams(search = location.search): ProtoParams {
  const q = new URLSearchParams(search);
  return {
    theme: pick(q.get("theme"), THEME_IDS, "graphite"),
    layout: pick(q.get("layout"), LAYOUT_IDS, "center"),
    quality: pick(q.get("quality"), ["low", "high"] as const, "high"),
    scene: pickN(q.get("scene"), ["office", "building", "district"] as const),
    step: pickN(q.get("step"), FLOW_STEPS),
    dept: pickN(q.get("dept"), ALL_DEPTS),
    phase: pickN(q.get("phase"), ["working", "result"] as const),
    focus: pickN(q.get("focus"), [...ALL_ROOMS, "overview"] as const),
    fast: q.get("fast") === "1",
    ui: q.get("ui") !== "0",
    switcher: q.get("switcher") !== "0",
    still: q.get("still") === "1",
    time: ((v) => (v == null ? null : v in DAY_TIMES ? DAY_TIMES[v as DayPhaseName] : Number.isFinite(+v) ? Math.min(1, Math.max(0, +v)) : null))(q.get("time")),
    cycle: ((v) => (v && +v > 5 ? +v : null))(q.get("cycle")),
  };
}

/** Rewrites one or more params in place (history.replaceState) without reloading. */
export function writeParams(p: Partial<Record<keyof ProtoParams, string | null>>): void {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(p)) v == null ? q.delete(k) : q.set(k, v);
  history.replaceState(null, "", `${location.pathname}?${q}`);
}

/** Set on <html> once the first frame of the world is drawn: screenshot scripts wait for `html[data-ready="1"]`. */
export const READY_ATTR = "data-ready";
