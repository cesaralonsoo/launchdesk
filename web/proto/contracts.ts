// LaunchDesk prototype — shared contracts. Owner: tech lead.
// v7 (top of CONTRACTS.md) is the current brief: bedroom → floor → building → district, a dynamic analyst roster per
// idea, an evidence stream with real sources, a scalability cap, CEO steering, worlds per project, a 110 s demo.
// Everything below the "v7" banner at the end of this file is additive; the v5/v6 types stay for compatibility.
// Additive changes only (new optional fields / new optional methods). Never rename or remove.
//
//   WS-OFFICE  web/proto/world/office/**, world/bedroom/**       → OfficeModelV7, BedroomModel
//   WS-WORLD   web/proto/world/{index,camera,daycycle,sky,v7}.ts, levels/**, other world/*  → WorldV7
//   WS-EXP     web/proto.html, main.ts, ui/**, themes/**, flow/** → FlowV7, UI
//   WS-INTEL   server/**, test/**, web/proto/data/**           → ProjectV7 samples, ResultsV7 on the server
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

// ═════════════════════════════════════════════════════════════ v7 ═════════════════════════════════════════════
// Brief: CONTRACTS.md "v7". One thing at a time; evidence before the score; the world grows only as far as the idea scales.

// ───────────────────────────────────────────────────────────── a) world levels

/** 0 Bedroom (the founder alone, validation) · 1 Floor (the office) · 2 Building · 3 District. */
export type WorldLevel = 0 | 1 | 2 | 3;
export const WORLD_LEVELS: readonly WorldLevel[] = [0, 1, 2, 3];
export const LEVEL_META: Record<WorldLevel, { name: string; short: string; unlock: string }> = {
  0: { name: "Your room", short: "Room", unlock: "Every idea starts here" },
  1: { name: "Your office", short: "Floor", unlock: "A report worth building" },
  2: { name: "Your building", short: "Building", unlock: "Live, and it can scale" },
  3: { name: "Your district", short: "District", unlock: "Only ideas that scale" },
};
/** Transition style the world uses between two levels. 0→1 is the "boom"; every other move is a continuous camera pull/push. */
export const levelTransition = (from: WorldLevel, to: WorldLevel): "boom" | "pull" | "push" | "switch" =>
  from === 0 && to === 1 ? "boom" : from === 0 || to === 0 ? "switch" : to > from ? "pull" : "push";
/** Boom 0→1 total duration (ms, speed 1). Pull-backs keep the v6 timings (1→2 3.0 s, 2→3 3.2 s). */
export const BOOM_MS = 2600;

// ───────────────────────────────────────────────────────────── b) dynamic roster

/** The library of analyst roles. The validate stage hires 3–5 of them per idea (always viability + competition). */
export type AnalystRole = "viability" | "competition" | "market" | "demand" | "pricing" | "location" | "regulation" | "tech" | "scalability";
export const ANALYST_ROLES: readonly AnalystRole[] = ["viability", "competition", "market", "demand", "pricing", "location", "regulation", "tech", "scalability"];
/** Build-stage specialists (phase 2, hired on the floor after $0.20). Same ids as v5 depts. */
export type BuildDept = Extract<Dept, "nova" | "dex" | "rae" | "pip">;
export const BUILD_TEAM: readonly BuildDept[] = ["nova", "dex", "rae", "pip"];
/** Anyone who can stand in the world. `founder` = the user (CEO), always present. */
export type ActorId = AnalystRole | BuildDept | "founder";

export interface RoleMeta {
  /** Department name shown on the desk / tag, ≤ 2 words. */
  dept: string;
  /** Default person name (server may keep it; must never collide with Nova/Dex/Rae/Pip). */
  name: string;
  color: string;
  /** Default one-line mission, ≤ 10 words; the server rewrites it for the idea. */
  mission: string;
  /** Default weight in the score (normalised over the hired roster). 0 = not in the score (scalability has its own score). */
  weight: number;
  /** When the server hires it (documentation for WS-INTEL's pickRoster). */
  when: string;
}
export const ROLE_LIBRARY: Record<AnalystRole, RoleMeta> = {
  viability: { dept: "Viability", name: "Mia", color: "#8B7CF6", mission: "Strengths, weak points, what kills it", weight: 0.25, when: "always" },
  competition: { dept: "Competition", name: "Leo", color: "#3B82F6", mission: "Who you are up against, and their gap", weight: 0.25, when: "always" },
  market: { dept: "Market", name: "Sam", color: "#F59E0B", mission: "How much money is in this market", weight: 0.2, when: "almost always (skip only for tiny hobby ideas)" },
  demand: { dept: "Customers", name: "Ava", color: "#22A06B", mission: "Who buys, how often, and why", weight: 0.2, when: "new behaviour or unclear buyer" },
  pricing: { dept: "Pricing", name: "Theo", color: "#CA8A04", mission: "What people pay today, what you can charge", weight: 0.15, when: "price is the open question" },
  location: { dept: "Location", name: "Lola", color: "#C2410C", mission: "Footfall, rent and the right street", weight: 0.15, when: "physical premises or a local service area" },
  regulation: { dept: "Rules", name: "Omar", color: "#475569", mission: "Licences, permits and legal blockers", weight: 0.1, when: "food, health, finance, kids, alcohol, transport, data" },
  tech: { dept: "Tech", name: "Kai", color: "#0891B2", mission: "Can it be built, and how fast", weight: 0.15, when: "software or hardware must be built" },
  scalability: { dept: "Scale", name: "Iris", color: "#DB2777", mission: "How far this can grow beyond one place", weight: 0, when: "reach is the main question (the report always scores scalability)" },
};

export interface Analyst {
  /** = role (one analyst per role per project). */
  id: AnalystRole;
  role: AnalystRole;
  /** Person first name, e.g. "Leo". */
  name: string;
  color: string;
  /** For THIS idea, ≤ 12 words: "Map coffee options inside Barcelona metro stations". */
  mission: string;
  /** Why this analyst was hired for this idea, ≤ 12 words (shown once, at hire). */
  why: string;
  /** 0..1, normalised over the roster's non-zero weights. */
  weight: number;
}

/** Level 0: the founder's desk + 5 analyst spots, in hire order. */
export type BedroomSpot = "desk" | "s0" | "s1" | "s2" | "s3" | "s4";
export const BEDROOM_SPOTS: readonly BedroomSpot[] = ["s0", "s1", "s2", "s3", "s4"]; // bed edge · beanbag · window cushion · pinboard · door chair
/** Level 1 floor plan (same 4×2 grid and footprint as v5/v6; ids changed):
 *  back row  = research wing r0 r1 r2 r3 (one analyst each; a 5th analyst takes the 2nd desk in r3)
 *  front row = lobby (founder's CEO desk + reception, col 0) · nova (col 1) · dex (col 2) · launch (rae + pip, col 3). */
export type FloorRoom = "lobby" | "r0" | "r1" | "r2" | "r3" | "nova" | "dex" | "launch";
export const FLOOR_PLAN: Record<FloorRoom, { row: "back" | "front"; col: 0 | 1 | 2 | 3 }> = {
  r0: { row: "back", col: 0 }, r1: { row: "back", col: 1 }, r2: { row: "back", col: 2 }, r3: { row: "back", col: 3 },
  lobby: { row: "front", col: 0 }, nova: { row: "front", col: 1 }, dex: { row: "front", col: 2 }, launch: { row: "front", col: 3 },
};
/** Where an actor sits. Analysts by roster index; builders by id; founder at the CEO desk / bedroom desk. */
export function seatOf(id: ActorId, roster: readonly Analyst[], level: WorldLevel): { room: FloorRoom | "bedroom"; spot: BedroomSpot | null; desk: 0 | 1 } {
  if (level === 0) {
    if (id === "founder") return { room: "bedroom", spot: "desk", desk: 0 };
    const i = roster.findIndex((a) => a.id === id);
    return { room: "bedroom", spot: i >= 0 ? BEDROOM_SPOTS[Math.min(i, 4)] : null, desk: 0 };
  }
  if (id === "founder") return { room: "lobby", spot: null, desk: 0 };
  if (id === "nova" || id === "dex") return { room: id, spot: null, desk: 0 };
  if (id === "rae" || id === "pip") return { room: "launch", spot: null, desk: id === "rae" ? 0 : 1 };
  const i = Math.max(0, roster.findIndex((a) => a.id === id));
  return { room: (["r0", "r1", "r2", "r3"] as const)[Math.min(i, 3)], spot: null, desk: i >= 4 ? 1 : 0 };
}
/** The bedroom sits exactly on the lobby room's footprint (office-root coords, 6 × 5 m, floor y = 0), so the founder's
 *  bedroom desk becomes the CEO desk after the boom. */
export const BEDROOM_FOOTPRINT = { cx: -9, cz: 3.3, w: 6, d: 5 } as const;

/** absent = not hired / not here · arriving = hire animation (resolves to idle by itself, ~900 ms) · presenting = handing
 *  a finding to the founder · asleep = locked (phase-2 builders before $0.20). */
export type ActorState = "absent" | "arriving" | "idle" | "working" | "presenting" | "done" | "asleep";

/** The company sign in the world. Bedroom: a handwritten note on the pinboard. Floor+: the lobby wall sign. Never the LaunchDesk logo. */
export interface CompanySign {
  /** "draft" = working title before Nova names it · "brand" = Nova's chosen name (+ Dex glyph). */
  kind: "draft" | "brand";
  name: string;
  tagline?: string;
  /** Brand primary (draft: neutral ink). */
  color: string;
  /** One of server LOGO_GLYPHS: none|pause|roundel|loop|loaf|route|tile|stop (drawn on the pixel grid). */
  glyph?: string;
}

// ───────────────────────────────────────────────────────────── c) evidence stream + report

export type FindingKind = "fact" | "estimate" | "competitor" | "risk" | "strength" | "number";
export interface SourceRef {
  url: string;
  title: string;
  domain: string;
  /** YYYY-MM-DD, the day the page was actually fetched. */
  accessed: string;
}
export interface Finding {
  /** Unique within the project, e.g. "competition-2". */
  id: string;
  analyst: AnalystRole;
  kind: FindingKind;
  /** ≤ 18 words, plain English, one claim (≤ 35 words, one full sentence, when it is block evidence: ResultsV7.blocks). */
  text: string;
  value?: number;
  unit?: string;
  /** Formatted value for the hero of the finding chip ("€3.40", "1.6×", "12 stations"). */
  display?: string;
  /** Required for fact / number / a named competitor. Missing → the finding is an estimate and must say its basis. */
  source?: SourceRef | null;
  /** For estimates: the basis in ≤ 10 words ("typical for a 40 m² kiosk"). */
  basis?: string;
  /** kind = competitor: `named` only with a source; otherwise `name` is a category ("Chain cafés in stations"). */
  competitor?: { name: string; named: boolean; price?: string; note: string };
  /** Effect on that analyst's factor: −2 … +2 (0 = context). */
  impact?: -2 | -1 | 0 | 1 | 2;
  /** ms after the analyst started: reveal order and pacing (proto replays these; server = real arrival). */
  t: number;
  /** Set when a steer replaced an earlier finding. */
  replaces?: string;
}
export type WorkStatus = "queued" | "working" | "done" | "error";
export interface AnalystWork {
  analyst: AnalystRole;
  status: WorkStatus;
  findings: Finding[];
  /** Factor score 0–10, one decimal (null while working). Capped at 7.5 when none of its findings has a source. */
  score: number | null;
  /** ≤ 12 words, the analyst's one-line conclusion. */
  headline: string;
}
export interface ScoreFactor {
  analyst: AnalystRole;
  label: string;
  weight: number;
  score: number;
  /** Finding ids that justify the score (the UI links bar → findings). */
  findings: string[];
  sourced: number;
  total: number;
}
export interface Scalability {
  /** 0–10, one decimal. */
  score: number;
  /** How far the world may grow: levelCapFor(score), and 0 for a no-go. */
  cap: WorldLevel;
  /** "Neighbourhood" | "City" | "Country" | "Global" — the honest reach label. */
  reach: string;
  /** ≤ 20 words: why it stops where it stops. */
  why: string;
  /** 1–3 concrete changes that would raise the cap ("A second kiosk in another station"). */
  wouldScale: string[];
  parts: Array<{ label: "Reach" | "Repeatable" | "Margins at scale" | "Founder-free" | "Digital leverage"; score: number }>;
  /** v7 owner update (additive, optional): every business can scale — these are the ways THIS one could. The world's
   *  next level is unlocked by committing to one (UI: flow.commitPath). Missing → the UI derives them from wouldScale. */
  paths?: ScalePath[];
}
/** v7 owner update: a way to scale. `kind` drives the icon/label; `ease` 0–10 = how hard (10 = natural fit). */
export interface ScalePath {
  kind: "locations" | "franchise" | "online" | "b2b" | "licensing" | "team" | "new-markets" | "product";
  /** ≤ 6 words: "Franchise the kiosk". */
  label: string;
  /** ≤ 14 words: the concrete move (= a wouldScale line). */
  how: string;
  ease: number;
}
export interface IdeaReport {
  score: number;
  verdict: "go" | "pivot" | "no-go";
  /** ≤ 16 words. */
  verdictLine: string;
  factors: ScoreFactor[];
  /** "0.25×7.1 + 0.25×6.4 + … = 6.8" */
  math: string;
  evidence: { total: number; sourced: number; sourcedShare: number; sources: SourceRef[] };
  confidence: "low" | "medium" | "high";
  scalability: Scalability;
  /** Exactly 3 each, each tied to a finding. */
  strengths: Array<{ text: string; finding: string }>;
  weaknesses: Array<{ text: string; finding: string }>;
  /** 3 next steps, ≤ 12 words each, the founder does them. */
  nextSteps: string[];
  pivot?: { idea: string; why: string } | null;
  /** Additive (written report): the Verdict section's reason bullets. */
  reasons?: string[];
}
export const levelCapFor = (scalability: number, verdict: IdeaReport["verdict"] = "go"): WorldLevel =>
  verdict === "no-go" ? 0 : scalability >= 7 ? 3 : scalability >= 4 ? 2 : 1;
export const confidenceFor = (sourcedShare: number): IdeaReport["confidence"] => (sourcedShare >= 0.6 ? "high" : sourcedShare >= 0.3 ? "medium" : "low");
/** No big score without evidence: the hero number appears only with ≥ 6 findings of which ≥ 3 have a source. */
export const scoreDisplay = (r: Pick<IdeaReport, "evidence">): "hero" | "provisional" => (r.evidence.total >= 6 && r.evidence.sourced >= 3 ? "hero" : "provisional");

// ───────────────────────────────────────────────────────────── h) 4 blocks (validate contract v7.1)
// Mirror of server/v7.ts "4 blocks" (types + BLOCK_LIBRARY + blockVerdictFor + hasBlocks). Exactly 4 blocks per idea,
// each owned by one analyst role, so rooms r0–r3, actors and the score maths are unchanged. Spec: .notes/quality/contract.md.
// UI: one block at a time (title → takeaway + chip → evidence with numbered sources → what it means → next actions).

export type BlockId = "customers" | "competition" | "money" | "risks";
export const BLOCK_IDS: readonly BlockId[] = ["customers", "competition", "money", "risks"];
export interface BlockMeta {
  role: AnalystRole;
  label: string;
  covers: string;
  searches: number;
  fetches: number;
}
export const BLOCK_LIBRARY: Record<BlockId, BlockMeta> = {
  customers: { role: "demand", label: "Customers & demand", covers: "Who buys, how many of them, how often, what they spend and why they would switch", searches: 2, fetches: 2 },
  competition: { role: "competition", label: "Competition & alternatives", covers: "Named rivals and substitutes, their prices, strengths and the gap left open", searches: 2, fetches: 2 },
  money: { role: "pricing", label: "Money", covers: "Price you can charge, cost per unit, margin, fixed costs, break-even volume", searches: 1, fetches: 1 },
  risks: { role: "viability", label: "Risks & how to start", covers: "What kills it (rules, dependencies, timing), the cheapest first test and the path to scale", searches: 1, fetches: 1 },
};
export type BlockVerdict = "strong" | "mixed" | "weak";
/** Chip = the block's factor score in the report's verdict bands (Go 6.5 · Pivot 4.5). */
export const blockVerdictFor = (score: number): BlockVerdict => (score >= 6.5 ? "strong" : score >= 4.5 ? "mixed" : "weak");
/** A headline figure. `source` null = an estimate and `basis` says why (label it "Estimate" in the UI). */
export interface KeyNumber {
  /** ≤ 5 words: "Break-even". */
  label: string;
  /** ≤ 4 words: "38 subscribers/month". */
  value: string;
  source: SourceRef | null;
  basis?: string;
}
export interface ReportBlock {
  id: BlockId;
  /** Owner analyst: its character works / presents while the block runs, its room is r0–r3 by BLOCK_IDS order. */
  role: AnalystRole;
  /** Idea-specific, ≤ 10 words: "Who buys €25 bread subscriptions in Ruzafa?". */
  title: string;
  /** 2–3 questions, ≤ 16 words each. */
  focus: string[];
  status: WorkStatus;
  /** ≤ 30 words. "" while working. */
  takeaway: string;
  /** factorScore of the block's findings, one decimal (null while working). */
  score: number | null;
  verdict: BlockVerdict | null;
  /** 4–7 Finding ids in reading order (the findings are in work[role].findings; impact −2…+2, source optional). */
  evidence: string[];
  /** ≤ 60 words, "what it means for you". */
  meaning: string;
  /** 1–3 next actions, ≤ 16 words each. */
  actions: string[];
  keyNumbers?: KeyNumber[];
  /** Distinct sources in citation order: evidence is numbered [1], [2] … by this list. */
  sources: SourceRef[];
  ms?: { first?: number; done?: number };
}
export const hasBlocks = (r: Pick<ResultsV7, "blocks"> | null | undefined): r is { blocks: ReportBlock[] } => !!r?.blocks?.length;
/** The source number of a finding inside its block (1-based; 0 = estimate, no source). */
export const sourceNumber = (b: Pick<ReportBlock, "sources">, f: Pick<Finding, "source">): number => (f.source ? b.sources.findIndex((s) => s.url === f.source!.url) + 1 : 0);

// ───────────────────────────────────────────────────────────── d) CEO steer / debate

export interface SteerRequest {
  /** The founder's note, ≤ 280 chars: "Focus on office workers, not tourists". */
  note: string;
  /** Optional: analysts the founder addressed; the server decides otherwise. */
  target?: AnalystRole[];
}
export interface SteerChange {
  what: "score" | "factor" | "scalability" | "verdict" | "finding" | "roster";
  /** analyst role, finding id, … */
  key?: string;
  before: string | number | null;
  after: string | number | null;
  /** ≤ 12 words. */
  why: string;
}
export interface SteerResult {
  id: string;
  note: string;
  /** One line back from the team, ≤ 14 words: "Got it. Re-checking demand and pricing for office workers." */
  ack: string;
  status: "working" | "done" | "error";
  rerun: AnalystRole[];
  hired: Analyst[];
  dropped: AnalystRole[];
  /** New/replacing findings (each with `replaces` when it supersedes one). */
  findings: Finding[];
  changes: SteerChange[];
  /** The report after the steer (null while working). */
  report: IdeaReport | null;
  at: string;
}
/** Server (real app): POST /api/projects/:id/steer  body SteerRequest, header x-owner-key (same auth as /run)
 *   → 202 { id, ack, rerun }   409 { error } while a stage runs   429 { error } after STEER_LIMIT per stage.
 *  Progress is read with the existing GET /api/projects/:id poll: results.v7.steers[i]. Free (included in the stage price). */
export const STEER_LIMIT = 3;

// ───────────────────────────────────────────────────────────── e) projects / worlds

/** What the server stores at project.results.v7 and what the proto samples carry. */
export interface ResultsV7 {
  version: 7;
  roster: Analyst[];
  work: AnalystWork[];
  report: IdeaReport | null;
  steers: SteerResult[];
  /** "4 blocks" analysis (additive, optional; see section h). Missing on old projects and data/v7/*.json past
   *  projects, which render from roster / work / report as before. Block evidence = work[block.role].findings. */
  blocks?: ReportBlock[];
  /** Additive (written report): unit economics computed by the server from the writer's inputs. */
  econ?: EconSummary | null;
  econErr?: string;
}
/** Mirror of server/v7.ts EconSummary: null figures = an input was missing (see `missing`). */
export interface EconSummary {
  unit: string;
  price: number;
  vatRate: number;
  shareKept: number;
  net: number;
  variable: number | null;
  contribution: number | null;
  fixedMonthly: number | null;
  breakEven: number | null;
  startupCapital: number | null;
  missing?: string[];
  lines?: Array<{ group: "variable" | "fixed" | "startup"; item: string; eur: number; source: SourceRef | null }>;
}
/** One project = one world. */
export interface ProjectV7 {
  id: string;
  idea: string;
  /** Working title (sign "draft") until Nova names it. */
  title: string;
  createdAt: string;
  v7: ResultsV7;
  /** Highest level this project reached (persisted). */
  level: WorldLevel;
  sign: CompanySign;
  /** The v4/v6 Project payload for phase-2 cards (nova/dex/rae/pip) — typed by data/index.ts. null = not built. */
  legacy: unknown;
}
/** What the world needs to draw a project. */
export interface WorldProject {
  id: string;
  level: WorldLevel;
  cap: WorldLevel;
  capWhy?: string;
  roster: Analyst[];
  /** Phase-2 hires present (empty before $0.20). */
  builders: BuildDept[];
  sign: CompanySign;
}
export const worldProjectOf = (p: ProjectV7): WorldProject => ({
  id: p.id,
  level: p.level,
  cap: p.v7.report?.scalability.cap ?? 1,
  capWhy: p.v7.report?.scalability.why,
  roster: p.v7.roster,
  builders: p.legacy && p.level >= 1 ? [...BUILD_TEAM] : [],
  sign: p.sign,
});

// ───────────────────────────────────────────────────────────── world / office / bedroom v7

export interface WorldV7 extends World {
  readonly worldLevel: WorldLevel;
  /** 0→1 = boom (BOOM_MS), then continuous pulls. Never goes above the cap: asking for more resolves at the cap and
   *  shows the next level as a ghost outline (dashed clay) with no lights. */
  setWorldLevel(l: WorldLevel, opts?: { animate?: boolean }): Promise<void>;
  setLevelCap(cap: WorldLevel): void;
  setRoster(r: readonly Analyst[]): void;
  setActorState(id: ActorId, s: ActorState, opts?: { instant?: boolean }): void;
  /** A finding landed: small pixel "paper" from the analyst to the founder's desk / pinboard (tone by kind). */
  pulse(id: ActorId, kind: FindingKind): void;
  focusActor(id: ActorId | "overview", opts?: { animate?: boolean; ms?: number }): Promise<void>;
  actorScreenPoint(id: ActorId): { x: number; y: number } | null;
  onActorClick(cb: (id: ActorId) => void): () => void;
  setSign(s: CompanySign): void;
  /** Switch worlds: snaps (or 600 ms crossfade) to that project's level, roster, builders and sign. */
  setProject(p: WorldProject, opts?: { animate?: boolean }): Promise<void>;
}

export interface OfficeModelV7 extends OfficeModel {
  setRoster(r: readonly Analyst[]): void;
  setActorState(id: ActorId, s: ActorState, opts?: { instant?: boolean }): void;
  actorAnchor(id: ActorId): THREE.Vector3 | null;
  floorRoomBounds(r: FloorRoom): THREE.Box3;
  pickActor(ray: THREE.Raycaster): ActorId | null;
  setSign(s: CompanySign): void;
  /** Boom reveal driven by the world: 0 = only the lobby footprint exists · 1 = full floor (rooms rise column by column). */
  setReveal(k: number): void;
  pulse(id: ActorId, kind: FindingKind): void;
}
export interface BedroomModel {
  /** Root-local origin = centre of the 6 × 5 room floor; the world places it at BEDROOM_FOOTPRINT. Nothing above y = 2.6. */
  readonly root: THREE.Group;
  bounds(): THREE.Box3;
  focusBounds(id: ActorId | "overview"): THREE.Box3;
  setRoster(r: readonly Analyst[]): void;
  setActorState(id: ActorId, s: ActorState, opts?: { instant?: boolean }): void;
  actorAnchor(id: ActorId): THREE.Vector3 | null;
  pickActor(ray: THREE.Raycaster): ActorId | null;
  setSign(s: CompanySign): void;
  pulse(id: ActorId, kind: FindingKind): void;
  /** 0 = intact room · 1 = gone (walls fold outward, props burst into pixel cubes). */
  setBoom(k: number): void;
  applyAtmosphere(a: AtmospherePreset): void;
  update(dt: number, t: number): boolean;
  dispose(): void;
}
export type CreateBedroomModel = (opts: { quality: Quality; still?: boolean }) => BedroomModel;

// ───────────────────────────────────────────────────────────── f) UI theme

/** The UI is fixed light Graphite. The day cycle drives the world scene only (sky, light, lamps, windows):
 *  ui/** must not subscribe to onClock for colours, and nothing writes CSS tokens on clock ticks. */
export const UI_THEME: ThemeId = "graphite";

// ───────────────────────────────────────────────────────────── flow v7 + g) demo / deep links

export type FlowStepV7 =
  | "bedroom" // level 0, founder at the laptop; idea card opens after ~1 s
  | "idea"
  | "pay1" // $0.10 validate
  | "hire" // analysts appear one by one with their mission
  | "evidence" // findings revealed one at a time, per analyst
  | "report" // score + verdict, then scalability, then strengths/weak points, then next steps (pages)
  | "steer" // CEO note → rerun → diff
  | "boom" // level 0 → 1
  | "floor" // the office floor, build team asleep
  | "pay2" // $0.20 build
  | "build" // nova → dex → rae → pip (working → result)
  | "live" // site + pre-orders
  | "building" // level 2 (if cap ≥ 2; else the ghost + why)
  | "district" // level 3 (if cap = 3; else the ghost + "what would make it scale")
  | "end"; // demo end card
export const FLOW_STEPS_V7: readonly FlowStepV7[] = ["bedroom", "idea", "pay1", "hire", "evidence", "report", "steer", "boom", "floor", "pay2", "build", "live", "building", "district", "end"];
export const STEP_LEVEL: Record<FlowStepV7, WorldLevel> = {
  bedroom: 0, idea: 0, pay1: 0, hire: 0, evidence: 0, report: 0, steer: 0, boom: 1, floor: 1, pay2: 1, build: 1, live: 1, building: 2, district: 3, end: 3,
};
export type ReportPage = "score" | "scale" | "points" | "next";
export interface FlowStateV7 {
  step: FlowStepV7;
  projectId: string;
  analyst?: AnalystRole;
  /** Index of the finding being revealed (evidence). */
  finding?: number;
  page?: ReportPage;
  builder?: BuildDept;
  phase?: DeptPhase;
  level: WorldLevel;
}
export type FlowActionV7 =
  | { type: "submit-idea"; idea: string }
  | { type: "approve-pay" }
  | { type: "next" }
  | { type: "steer"; note: string }
  | { type: "decide"; choice: "grow" | "pivot" | "stop" }
  | { type: "continue" }
  | { type: "switch-project"; id: string }
  | { type: "new-project" };
export interface FlowV7 {
  readonly state: FlowStateV7;
  readonly settled: boolean;
  goto(s: Partial<FlowStateV7> & { step: FlowStepV7 }): void;
  next(a?: FlowActionV7): void;
  onChange(cb: (s: FlowStateV7, prev: FlowStateV7) => void): () => void;
}

/** ?demo=1 — the judges' path (~110 s, auto-advance, Space pause, → skip, Esc exits to the normal flow).
 *  `at` = seconds from start; each row holds until the next. Sample: Pausa (cap 2 → the district shows as a ghost). */
export const DEMO_SCRIPT: ReadonlyArray<{ at: number; step: FlowStepV7; show: string; analyst?: AnalystRole; page?: ReportPage; builder?: BuildDept }> = [
  { at: 0, step: "bedroom", show: "Room at night-to-dawn, founder at the laptop; idea types itself" },
  { at: 6, step: "pay1", show: "$0.10 in BCH, approves itself after 1.5 s" },
  { at: 10, step: "hire", show: "3–5 analysts pop in, one every 1.6 s, name + mission" },
  { at: 18, step: "evidence", show: "~10 findings, one every 2.6 s, source chip on each; counter Evidence n · m sourced" },
  { at: 46, step: "report", page: "score", show: "Score builds from the factor bars; verdict line" },
  { at: 53, step: "report", page: "scale", show: "Scalability 0–10 + cap: how far this world can grow" },
  { at: 59, step: "report", page: "points", show: "3 strengths · 3 weak points" },
  { at: 64, step: "steer", show: "Note types itself, 2 analysts re-run, diff chips" },
  { at: 72, step: "boom", show: "Room bursts into the office floor" },
  { at: 78, step: "pay2", show: "$0.20, approves itself" },
  { at: 81, step: "build", builder: "nova", show: "Name + brand" },
  { at: 85, step: "build", builder: "dex", show: "Logo + landing" },
  { at: 89, step: "build", builder: "rae", show: "30-day launch plan" },
  { at: 93, step: "build", builder: "pip", show: "Goes live" },
  { at: 96, step: "live", show: "Site card with BCH pre-orders" },
  { at: 100, step: "building", show: "Pull back: the building" },
  { at: 104, step: "district", show: "District ghost + what would make it scale" },
  { at: 109, step: "end", show: "Your turn: type your idea" },
];
export const DEMO_LENGTH_S = 112;

export interface ProtoParamsV7 {
  step: FlowStepV7 | null;
  analyst: AnalystRole | null; // &analyst=competition
  n: number | null; // &n=3 finding index (evidence)
  page: ReportPage | null; // &page=scale (report)
  builder: BuildDept | null; // &who=dex (build)  — or ?step=nova|dex|rae|pip
  phase: DeptPhase | null;
  project: string | null; // &project=<id> world to open
  demo: boolean; // ?demo=1
  demoAt: number | null; // &t=<seconds> seek the demo
}
export function readParamsV7(search = location.search): ProtoParamsV7 {
  const q = new URLSearchParams(search);
  const raw = q.get("step");
  const builderAlias = pickN(raw, BUILD_TEAM);
  const num = (v: string | null) => (v != null && v !== "" && Number.isFinite(+v) ? +v : null);
  return {
    step: builderAlias ? "build" : pickN(raw, FLOW_STEPS_V7),
    analyst: pickN(q.get("analyst"), ANALYST_ROLES),
    n: num(q.get("n")),
    page: pickN(q.get("page"), ["score", "scale", "points", "next"] as const),
    builder: builderAlias ?? pickN(q.get("who"), BUILD_TEAM),
    phase: pickN(q.get("phase"), ["working", "result"] as const),
    project: q.get("project"),
    demo: q.get("demo") === "1",
    demoAt: num(q.get("t")),
  };
}
