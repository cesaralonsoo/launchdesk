// WS-OFFICE · rooms/common.ts — the shared contract + helpers every room theme builds against.
//
// A theme is a function `(ctx: ThemeCtx) => RoomDecor` that furnishes ONE room of the level-1 floor in room-local
// coordinates: origin = room centre on the floor (y = 0), x ∈ [−3, 3] (left → right), z ∈ [−2.5, 2.5] (back → front).
// The overview camera looks from +x/+z (yaw 34°, pitch 40°): things near +z and +x are closest to the lens.
//
//   back row (r0…r3, research): exterior back wall at z = −2.38 (feature wall, ribbon window from y 1.26 to 1.68),
//                               left partition at x = −2.92 (h 1.18; r0 = exterior wall at −2.96), open towards +z.
//   front row (lobby, nova, dex, launch): corridor glass at z = −2.48 with the door in x ∈ [−0.65, 0.65],
//                               left partition at x = −2.92 (lobby: exterior wall at −2.96), open towards +z.
//   No room owns a right wall (it is the neighbour's partition; r3/launch are cut away): stand tall pieces free.
//
// Everything a theme adds under `ctx.group` is BAKED by the office (merged per material into a handful of meshes),
// so build freely with the Builder; only objects passed through `ctx.animate()` stay separate and may move in
// `update()`. Colours resolve through the Registry roles (see kit.ts), so day/night/locked/working all just work:
//   fx()/accent()/accentSoft() surfaces · screenMat() glowing UIs (brighter at night and while working) ·
//   lampMat() lamp shades (light up with the lamps) · glowMat()/neonMat() things that glow at night · ledMat() LEDs.
// Use `applyNight(level)` only for what the roles can't do (a light you own, swapping a texture…).
import * as THREE from "three";
import type { AnalystRole, FloorRoom, Quality } from "../../../contracts";
import { bake, type P3, type Registry } from "../kit";
import type { RoomDef } from "../layout";
import { deptWallTex, type WallKind } from "../pixel";
import { accent, C, desk, framed, fx, sideTable, shadowRect, taskChair, type Ctx } from "../props";

export * from "../props";
export type { P3 } from "../kit";

// ─────────────────────────────────────────────── contract

/** Every decor theme. Research rooms pick theirs from the analyst role; front rooms are fixed. */
export type ThemeId = AnalystRole | "nova" | "dex" | "launch" | "lobby" | "vacant";

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export type ZoneKind = "desk" | "chair" | "seat" | "stand" | "face" | "path" | "door" | "sign" | "tray";
/** A room-local rectangle that must stay clear. `maxH` = what may stand inside it (0 = nothing at all). */
export interface Zone extends Rect {
  kind: ZoneKind;
  label: string;
  maxH: number;
}

export interface WallAnchor {
  /** Which wall: back (normal +z), left (normal +x), glass (front-row corridor glass, normal +z). */
  wall: "back" | "left" | "glass";
  /** The wall's inside face: z for back/glass, x for left. Hang things 0.02–0.04 in front of it. */
  at: number;
  /** Usable span along the wall (x for back/glass, z for left). */
  from: number;
  to: number;
  /** Usable height on the wall (art, shelves, boards). */
  y0: number;
  y1: number;
  /** rotY that makes a +Z-facing piece face into the room. */
  rotY: number;
}

export interface ThemeCtx {
  /** Builder + Registry + material owner key + accent colour (`c.color2`: Pip's colour in launch). */
  c: Ctx;
  def: RoomDef;
  theme: ThemeId;
  /** The specialist's colour (= c.color). */
  accent: string;
  quality: Quality;
  /** quality === "high": spend extra triangles/lights only when true. */
  hi: boolean;
  /** "solo" = the whole room · "a"/"b" = left/right half of r3 when two analysts share it (5-person roster). */
  side: "solo" | "a" | "b";
  /** side !== "solo": build the desk, one wall piece and at most one small prop inside `area`. */
  compact: boolean;
  /** What this theme may decorate (room-local). */
  area: Rect;
  /** Where the workstation goes (fixed: the characters' seats are in layout.ts). */
  desk: { x: number; z: number; rotY: number };
  /** Keep-clear zones (desks, chairs, seats, the stand spot, the face cone, door, sign…). */
  zones: Zone[];
  /** Wall anchors for boards, shelves, art. */
  walls: WallAnchor[];
  /** Parent for everything (room-local; baked by the office). */
  group: THREE.Group;
  /** Mark an object as animated: it is kept out of the static bake and may move in update(). */
  animate<T extends THREE.Object3D>(o: T): T;
}

export interface RoomDecor {
  group: THREE.Group;
  /** Called every frame while the room's variant is shown (not in reduced motion). */
  update?(dt: number, t: number): void;
  /** 0 = full day … 1 = night with the lamps on. Called on every atmosphere change (≤ 10 Hz) and on activation. */
  applyNight?(level: number): void;
}

export type ThemeFn = (ctx: ThemeCtx) => RoomDecor;

// ─────────────────────────────────────────────── frame: zones and walls per room

const ROOM_HALF_X = 3, ROOM_HALF_Z = 2.5;
export const ROOM_RECT: Rect = { x0: -ROOM_HALF_X, x1: ROOM_HALF_X, z0: -ROOM_HALF_Z, z1: ROOM_HALF_Z };

/** Desk positions (room-local) per seat; the seats themselves live in layout.ts (floorSpot). */
export const DESK_AT = {
  backA: { x: -1.55, z: -1.98, rotY: 0 },
  backB: { x: 1.25, z: -1.98, rotY: 0 },
  front: { x: -2.36, z: 0.2, rotY: Math.PI / 2 },
  pip: { x: 1.15, z: 1.45, rotY: Math.PI },
  ceo: { x: -1.55, z: 0.35, rotY: -Math.PI / 2 },
} as const;

const z = (kind: ZoneKind, label: string, x0: number, x1: number, z0: number, z1: number, maxH = 0): Zone => ({ kind, label, x0, x1, z0, z1, maxH });

function backZones(side: "a" | "b"): Zone[] {
  const x = side === "a" ? DESK_AT.backA.x : DESK_AT.backB.x;
  const sx = side === "a" ? -0.55 : 1.95; // stand spot
  return [
    z("desk", `desk ${side}`, x - 0.8, x + 0.8, -2.38, -1.6),
    z("chair", `chair ${side}`, x - 0.4, x + 0.4, -1.6, -0.85),
    z("stand", `stand spot ${side}`, sx - 0.35, sx + 0.35, -0.7, 0.0),
    // the analyst faces the camera: keep the line from the seat towards +x/+z low
    z("face", `face cone ${side}`, x - 0.1, x + 1.0, -0.85, 0.3, 0.5),
  ];
}
const BACK_PATH = z("path", "walk-in lane from the corridor", -1.2, -0.2, 0.0, 2.5);

/** Keep-clear zones for a room (+ which seats are used). */
export function zonesFor(id: FloorRoom, shared: boolean): Zone[] {
  if (id.startsWith("r")) return [...backZones("a"), ...(shared ? backZones("b") : []), BACK_PATH];
  const door = z("door", "corridor door + entry", -0.75, 0.75, -2.5, -1.4);
  if (id === "lobby")
    return [
      door,
      z("desk", "CEO desk", -1.95, -1.15, -0.4, 1.1),
      z("chair", "founder's chair", -2.6, -1.85, 0.0, 0.7),
      z("tray", "in-tray (pulse target, on the desk)", -1.8, -1.45, -0.32, -0.04),
      z("stand", "founder stand spot", -1.6, -0.9, 0.7, 1.4),
      z("face", "founder face cone", -2.3, -1.0, 0.35, 1.5, 0.5),
      z("sign", "company sign (left wall, y 0.5–1.18)", -2.96, -2.7, -2.33, -0.23, 0),
      z("path", "door → desk lane", -1.0, 0.75, -1.4, 0.8),
    ];
  const front = [
    door,
    z("desk", "desk", -2.75, -1.95, -0.6, 1.0),
    z("chair", "chair", -1.95, -1.2, -0.2, 0.6),
    z("stand", "stand spot", -1.05, -0.35, 0.6, 1.3),
    z("face", "face cone", -1.6, -0.4, 0.2, 1.4, 0.5),
    z("path", "door → desk lane", -1.2, 0.75, -1.4, 0.6),
  ];
  if (id === "launch")
    front.push(
      z("desk", "Pip's desk", 0.55, 1.75, 1.1, 1.8),
      z("chair", "Pip's chair", 0.8, 1.5, 0.45, 1.1),
      z("stand", "Pip stand spot", 1.4, 2.1, -0.1, 0.6),
    );
  return front;
}

/** Wall anchors for a room (room-local). */
export function wallsFor(def: RoomDef): WallAnchor[] {
  const leftAt = def.col === 0 ? -2.96 : -2.92;
  if (def.row === "back")
    return [
      { wall: "back", at: -2.37, from: -2.9, to: 2.9, y0: 0.1, y1: 1.22, rotY: 0 },
      { wall: "left", at: leftAt, from: -2.35, to: 2.4, y0: 0.1, y1: def.col === 0 ? 1.22 : 1.14, rotY: Math.PI / 2 },
    ];
  return [
    { wall: "glass", at: -2.46, from: -2.9, to: 2.9, y0: 0, y1: 1.0, rotY: 0 },
    { wall: "left", at: leftAt, from: -2.45, to: 2.4, y0: 0.1, y1: def.col === 0 ? 1.22 : 1.14, rotY: Math.PI / 2 },
  ];
}

/** Does a rect overlap a zone that does not allow `h` metres of height? (debug / self-checks) */
export function blocks(zones: readonly Zone[], r: Rect, h: number): Zone | null {
  for (const q of zones) if (h > q.maxH && r.x0 < q.x1 && r.x1 > q.x0 && r.z0 < q.z1 && r.z1 > q.z0) return q;
  return null;
}

// ─────────────────────────────────────────────── materials that glow at night

export const screenMat = (c: Ctx, t: THREE.Texture) => c.R.m("screen", c.room, c.color, { map: t });
export const lampMat = (c: Ctx) => c.R.m("lamp", c.room, c.color, { color: "#FBF4E6", rough: 0.5 });
export const ledMat = (c: Ctx, color: string) => c.R.m("led", c.room, c.color, { color });
/** A texture that lights up at night (lit signs, fairy lights). Alpha-tested. */
export const glowMat = (c: Ctx, t: THREE.Texture) => c.R.m("glow", c.room, c.color, { map: t });
/** A solid colour that glows at night (neon tube, "LIVE" light). */
export function neonMat(c: Ctx, color: string) {
  const m = c.R.m("glow", c.room, c.color, { color, key: "neon" }) as THREE.MeshStandardMaterial;
  m.emissive.set(color);
  return m;
}

// ─────────────────────────────────────────────── shared kit pieces (several themes use them)

/** The analyst role → pixel-art wall board kind (pixel.ts deptWallTex). */
export const ROLE_WALL: Record<AnalystRole, WallKind> = {
  viability: "swot", competition: "competitors", market: "money", demand: "personas", pricing: "prices",
  location: "map", regulation: "rules", tech: "code", scalability: "growth",
};

/** Framed pixel-art board (no numbers or names). `code` boards are screens (lit). */
export function board(c: Ctx, g: THREE.Object3D, kind: WallKind, pos: P3 = [1.2, 0.95, -2.36], w = 2.0, rotY = 0, frame: string = C.lacquer) {
  return framed(c, g, pos, rotY, deptWallTex(kind, c.color), w, w * (56 / 96), frame, kind !== "code");
}

/** The role's board on the back wall: big in a solo room, small above the desk in a shared half. */
export function wallBoard(ctx: ThemeCtx, kind: WallKind) {
  // shared half: beside the desk (not behind the monitors), top edge under the ribbon window
  if (ctx.compact) return board(ctx.c, ctx.group, kind, [ctx.desk.x + (ctx.side === "b" ? 1.12 : 1.08), 0.96, -2.36], 0.82);
  return board(ctx.c, ctx.group, kind);
}

/** The research workstation (desk + chair) at ctx.desk. `screen`: screenTex variant 0–4; `dual`: two monitors. */
export function researchDesk(ctx: ThemeCtx, o: { screen: number; dual?: boolean }) {
  const { c, group: g } = ctx;
  const d = ctx.desk;
  // legacy: the second desk of a shared room always showed screen variant 2
  desk(c, g, [d.x, 0, d.z], d.rotY, ctx.side === "b" ? 2 : o.screen, { dual: !!o.dual });
  taskChair(c, g, [d.x, 0, d.z + 0.75], Math.PI);
}

/** Low pedestal with a sculpture of rising blocks; `lit` = how many are in the dept colour. */
export function steps(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number, n = 4, lit = 1) {
  const { B } = c;
  const s = B.sub(pos, rotY, parent);
  shadowRect(c, 1.3, 0.8, [0, 0, 0], s, 0.3);
  B.box(1.0, 0.16, 0.5, fx(c, C.lacquer, 0.45), [0, 0.08, 0], 0.03, s);
  for (let i = 0; i < n; i++) {
    const h = 0.26 + i * 0.22;
    const m = i >= n - lit ? accent(c, 0.35) : c.R.m("accentSoft", c.room, c.color, { rough: 0.5, shade: 1.06 - i * 0.06 });
    B.box(0.17, h, 0.28, m, [-0.33 + i * 0.22, 0.16 + h / 2, 0], 0.025, s);
  }
  return s;
}

/** Server rack with blinking-colour LEDs; faces +Z. */
export function rack(c: Ctx, parent: THREE.Object3D, pos: P3, rotY = 0) {
  const { B } = c;
  const r = B.sub(pos, rotY, parent);
  shadowRect(c, 0.9, 0.9, [0, 0, 0], r, 0.35);
  B.box(0.6, 1.5, 0.62, fx(c, "#EDEDEB", 0.4, 0.1), [0, 0.75, 0], 0.025, r);
  B.box(0.52, 1.36, 0.01, fx(c, "#2F343C", 0.4, 0.3), [0, 0.76, 0.31], 0, r);
  for (let i = 0; i < 8; i++) {
    const y = 0.2 + i * 0.16;
    B.box(0.48, 0.11, 0.008, fx(c, "#373C45", 0.4, 0.3), [0, y, 0.318], 0, r);
    B.box(0.025, 0.025, 0.006, ledMat(c, i % 3 === 0 ? "#0AC18E" : i % 3 === 1 ? "#7FB2FF" : "#F2C04A"), [-0.19, y, 0.324], 0, r);
    B.box(0.025, 0.025, 0.006, ledMat(c, "#0AC18E"), [-0.15, y, 0.324], 0, r);
  }
  return r;
}

/** A globe on a side table. Returns the ball (already marked animated): spin it in update(). */
export function globe(ctx: ThemeCtx, pos: P3): THREE.Object3D {
  const { c } = ctx;
  const { B } = c;
  const gt = sideTable(c, ctx.group, pos, 0.55, 0.26);
  const gl = ctx.animate(new THREE.Group());
  gl.position.set(0, 0.84, 0);
  gt.add(gl);
  B.cyl(0.07, 0.09, 0.03, fx(c, C.metal, 0.4, 0.4), [0, -0.24, 0], 20, gl);
  B.cyl(0.008, 0.008, 0.24, fx(c, C.metal, 0.4, 0.4), [0, -0.12, 0], 6, gl);
  const ball = new THREE.Group();
  ball.rotation.z = 0.41;
  gl.add(ball);
  B.sphere(0.2, accent(c, 0.35), [0, 0, 0], 32, ball);
  const land = fx(c, "#F1EEE8", 0.8);
  B.blob(0.085, land, [0.12, 0.08, 0.1], 1, ball);
  B.blob(0.075, land, [-0.13, -0.03, 0.1], 1, ball);
  B.blob(0.06, land, [0.03, -0.1, -0.15], 1, ball);
  B.blob(0.07, land, [-0.05, 0.12, -0.12], 1, ball);
  B.torus(0.235, 0.008, fx(c, C.metal, 0.35, 0.6), [0, 0, 0], Math.PI * 1.2, gl).rotation.set(0, Math.PI / 2, 0.41 - Math.PI * 0.1);
  return ball;
}

/** Spin objects around their Y axis (the globe's old 0.35 rad/s). */
export const spin = (objs: THREE.Object3D[], speed = 0.35) => (dt: number) => {
  for (const o of objs) o.rotation.y += dt * speed;
};

/**
 * Merge a static sub-tree yourself (rarely needed: the office bakes the whole room). Useful for an animated
 * group made of many parts: build it under a Group, then `ctx.animate(mergeStatic(group, ctx.c.R))`.
 */
export function mergeStatic(src: THREE.Object3D, R: Registry): THREE.Group {
  return bake(src, R);
}

/** Shorthand for the common return. */
export const decor = (ctx: ThemeCtx, extra: Omit<RoomDecor, "group"> = {}): RoomDecor => ({ group: ctx.group, ...extra });

/**
 * A plain woven rug in the room colour (v7 polish): smooth geometry, no pixel texture, so the edges stay clean at
 * every distance. `round` = an ellipse. A thin darker border ring frames it.
 */
export function plainRug(c: Ctx, g: THREE.Object3D, w: number, d: number, pos: P3, round = false, shade = 1) {
  const { B } = c;
  const body = c.R.m("rug", c.room, c.color, { rough: 1, key: "plain", shade });
  const edge = c.R.m("rug", c.room, c.color, { rough: 1, key: "plainEdge", shade: shade * 0.82 });
  if (round) {
    B.cyl(0.5, 0.5, 0.008, edge, [pos[0], 0.004, pos[2]], 40, g).scale.set(w, 1, d);
    B.cyl(0.5, 0.5, 0.008, body, [pos[0], 0.007, pos[2]], 40, g).scale.set(w - 0.12, 1, d - 0.12);
  } else {
    B.box(w, 0.008, d, edge, [pos[0], 0.004, pos[2]], 0.003, g);
    B.box(w - 0.12, 0.008, d - 0.12, body, [pos[0], 0.007, pos[2]], 0.003, g);
  }
}
