// WS-A · the architecture: model base slab, floors, corridor, walls with ribbon windows, glass partitions,
// skirting, baked AO along wall bases. Same floor plan as layout.ts.
import * as THREE from "three";
import type { Room } from "../../contracts";
import { Builder, type Registry } from "./kit";
import { CORRIDOR, HALF_X, HALF_Z, ROOMS, ROOM_D, ROOM_W, SLAB_PAD, type RoomDef } from "./layout";
import { fadeTex, planksTex, plasterTex, softRectTex, stoneTex } from "./textures";

export const WALL_T = 0.16;
export const EXT_H = 1.86; // exterior walls (back row, left end) with a ribbon window
export const PART_H = 1.18; // partitions between rooms
const SILL = 1.26;
const HEAD = 1.68;
const GLASS_H = 1.04;
const NEUTRAL = "#B9BCC2";
const MULLION = "#1D2024"; // thin black architectural metal

function uvScale(m: THREE.Mesh, su: number, sv: number) {
  const uv = m.geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
}

/** Room-local frame helpers. */
export function roomBox(r: RoomDef) {
  const back = r.row === "back";
  return {
    x0: r.cx - ROOM_W / 2,
    x1: r.cx + ROOM_W / 2,
    z0: r.cz - ROOM_D / 2,
    z1: r.cz + ROOM_D / 2,
    back,
  };
}

/** A wall segment along X or Z with a darker cut cap (reads as a sectioned architectural model). */
function wallSeg(B: Builder, R: Registry, room: Room | null, accent: string, dir: "x" | "z", len: number, h: number, cx: number, cz: number, y0 = 0) {
  const w = dir === "x" ? len : WALL_T;
  const d = dir === "x" ? WALL_T : len;
  B.box(w, h - 0.02, d, R.m("wall", room, accent, { rough: 0.92 }), [cx, y0 + (h - 0.02) / 2, cz]);
  const cap = B.box(w + 0.004, 0.02, d + 0.004, R.m("wallCap", room, accent, { rough: 0.85 }), [cx, y0 + h - 0.01, cz], 0, undefined, false);
  cap.receiveShadow = true;
}

/** Exterior wall with a continuous ribbon window between SILL and HEAD. */
function ribbonWall(B: Builder, R: Registry, room: Room | null, accent: string, dir: "x" | "z", len: number, cx: number, cz: number) {
  wallSeg(B, R, room, accent, dir, len, SILL, cx, cz);
  // lintel
  const w = dir === "x" ? len : WALL_T;
  const d = dir === "x" ? WALL_T : len;
  B.box(w, EXT_H - HEAD - 0.02, d, R.m("wall", room, accent, { rough: 0.92 }), [cx, HEAD + (EXT_H - HEAD - 0.02) / 2, cz]);
  B.box(w + 0.004, 0.02, d + 0.004, R.m("wallCap", room, accent, { rough: 0.85 }), [cx, EXT_H - 0.01, cz], 0, undefined, false);
  // glass
  const gh = HEAD - SILL;
  const pane = B.box(dir === "x" ? len : 0.02, gh, dir === "x" ? 0.02 : len, R.m("window", room, accent, {}), [cx, SILL + gh / 2, cz], 0, undefined, false);
  pane.receiveShadow = false;
  // mullions + sill ledge (dark metal)
  const metal = R.m("fixed", room, accent, { color: MULLION, rough: 0.4, metal: 0.6 });
  const n = Math.max(2, Math.round(len / 1.5));
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (i / n) * len;
    const px = dir === "x" ? cx + t : cx;
    const pz = dir === "x" ? cz : cz + t;
    B.box(dir === "x" ? 0.018 : WALL_T * 0.5, gh, dir === "x" ? WALL_T * 0.5 : 0.018, metal, [px, SILL + gh / 2, pz]);
  }
  B.box(dir === "x" ? len : WALL_T + 0.06, 0.025, dir === "x" ? WALL_T + 0.06 : len, R.m("trim", room, accent, { rough: 0.5, shade: 1.06 }), [cx, SILL + 0.0125, cz]);
  B.box(dir === "x" ? len : WALL_T * 0.7, 0.025, dir === "x" ? WALL_T * 0.7 : len, metal, [cx, HEAD - 0.012, cz], 0, undefined, false);
}

/** Painted feature panel on a wall face (dept colour). normal: which way the face points. */
function accentPanel(B: Builder, R: Registry, room: Room, accent: string, normal: "+z" | "+x", len: number, h: number, x: number, z: number) {
  const m = R.m("accentWall", room, accent, { rough: 0.95 });
  const t = 0.008;
  if (normal === "+z") B.box(len, h, t, m, [x, h / 2 + 0.07, z + t / 2], 0, undefined, false);
  else B.box(t, h, len, m, [x + t / 2, h / 2 + 0.07, z], 0, undefined, false);
}

function skirting(B: Builder, R: Registry, room: Room | null, accent: string, normal: "+z" | "+x", len: number, x: number, z: number) {
  const m = R.m("trim", room, accent, { rough: 0.7 });
  if (normal === "+z") B.box(len, 0.07, 0.016, m, [x, 0.035, z + 0.008], 0, undefined, false);
  else B.box(0.016, 0.07, len, m, [x + 0.008, 0.035, z], 0, undefined, false);
}

/** Baked ambient occlusion where floor meets wall. */
function aoStrip(B: Builder, R: Registry, room: Room | null, len: number, x: number, z: number, along: "x" | "z", strength = 0.2, side: 1 | -1 = 1) {
  const m = R.m("shadow", room, NEUTRAL, { map: fadeTex(), opacity: strength });
  const w = 0.5;
  // fadeTex is opaque at v=0 (the wall); flip the decal for the −side
  if (along === "x") B.decal(len, w, m, [x, 0.004, z + (side * w) / 2], undefined, side === 1 ? 0 : Math.PI);
  else B.decal(len, w, m, [x + (side * w) / 2, 0.004, z], undefined, side === 1 ? Math.PI / 2 : -Math.PI / 2);
}

/** Frosted glass partition: clear pane, a frosted manifestation band, thin black mullions every ~0.9 m. */
function glassPartition(B: Builder, R: Registry, room: Room, accent: string, len: number, cx: number, cz: number) {
  const metal = R.m("fixed", room, accent, { color: MULLION, rough: 0.4, metal: 0.6 });
  B.box(len, GLASS_H, 0.012, R.m("glass", room, accent, { rough: 0.12, opacity: 0.14 }), [cx, GLASS_H / 2, cz], 0, undefined, false).receiveShadow = false;
  B.box(len - 0.02, 0.42, 0.016, R.m("glass", room, accent, { rough: 0.7, opacity: 0.3, key: "frost" }), [cx, 0.52, cz], 0, undefined, false).receiveShadow = false;
  B.box(len, 0.018, 0.035, metal, [cx, GLASS_H, cz]);
  B.box(len, 0.03, 0.035, metal, [cx, 0.015, cz]);
  const n = Math.max(1, Math.round(len / 0.9));
  for (let i = 0; i <= n; i++) B.box(i === 0 || i === n ? 0.022 : 0.012, GLASS_H, 0.03, metal, [cx - len / 2 + (i / n) * len, GLASS_H / 2, cz]);
}

export interface ShellOut {
  shared: THREE.Group;
  perRoom: Map<Room, THREE.Group>;
}

export function buildShell(R: Registry, q: "low" | "high"): ShellOut {
  const S = new Builder(q);
  const perRoom = new Map<Room, THREE.Group>();
  const NEU = NEUTRAL;

  // ── base slab: an architectural model plinth
  const sw = HALF_X * 2 + SLAB_PAD * 2;
  const sd = HALF_Z * 2 + SLAB_PAD * 2;
  // a crisp light top plate, a deep body and a recessed dark plinth so the model floats with a clean edge
  S.box(sw, 0.05, sd, R.m("slabCap", null, NEU, { rough: 0.55 }), [0, -0.05 - 0.025, 0], 0.012).castShadow = true;
  S.box(sw - 0.004, 0.006, sd - 0.004, R.m("slab", null, NEU, { rough: 0.9, shade: 0.62 }), [0, -0.103, 0], 0, undefined, false);
  const body = S.box(sw - 0.02, 0.36, sd - 0.02, R.m("slab", null, NEU, { rough: 0.7 }), [0, -0.106 - 0.18, 0], 0.01);
  body.castShadow = true;
  S.box(sw - 0.34, 0.09, sd - 0.34, R.m("slab", null, NEU, { rough: 0.9, shade: 0.45 }), [0, -0.55 + 0.045, 0], 0, undefined, false);

  // ── corridor: light oak planks
  const cor = S.box(HALF_X * 2, 0.05, CORRIDOR, R.m("corridor", null, NEU, { map: stoneTex(), rough: 0.55 }), [0, -0.025, 0], 0, undefined, false);
  uvScale(cor, (HALF_X * 2) / 3.2, CORRIDOR / 3.2);
  void plasterTex;
  // thresholds into the back rooms
  for (const r of ROOMS) {
    if (r.row !== "back") continue;
    S.box(ROOM_W, 0.008, 0.03, R.m("fixed", r.id, r.color, { color: "#8C8F94", rough: 0.35, metal: 0.8 }), [r.cx, 0.001, -CORRIDOR / 2], 0, undefined, false);
  }
  // ── left exterior wall (runs the whole depth, ribbon window)
  ribbonWall(S, R, null, NEU, "z", HALF_Z * 2 + WALL_T, -HALF_X - WALL_T / 2 + 0.04, 0);
  skirting(S, R, null, NEU, "+x", HALF_Z * 2, -HALF_X + 0.04, 0);
  aoStrip(S, R, null, HALF_Z * 2, -HALF_X + 0.05, 0, "z", 0.28);
  // corridor side of the front glass
  aoStrip(S, R, null, HALF_X * 2, 0, CORRIDOR / 2 - 0.01, "x", 0.1, -1);
  // ── corridor end caps on the right: none (cut-away)

  // ── soft ground shadow under the plinth (contact with whatever floor WS-B puts under it)
  const gs = S.decal(sw + 2.4, sd + 2.4, R.m("shadow", null, NEU, { map: softRectTex(), opacity: 0.42 }), [0, -0.548, 0.35]);
  gs.name = "office-ground-shadow";
  gs.userData.keep = true;

  for (const r of ROOMS) {
    const B = new Builder(q);
    const { x0, z0, z1, back } = roomBox(r);
    const room = r.id;
    const col = r.color;

    // floor: microcement with a faint dept tint
    const floor = B.box(ROOM_W, 0.05, ROOM_D, R.m("floor", room, col, { map: planksTex(), rough: 0.55 }), [r.cx, -0.025, r.cz], 0, undefined, false);
    uvScale(floor, ROOM_W / 2.2, ROOM_D / 2.2);
    // seam lines between rooms (subtle reveal)
    B.box(ROOM_W, 0.004, 0.012, R.m("wallCap", room, col, { shade: 0.85 }), [r.cx, 0.001, back ? z1 - 0.006 : z0 + 0.006], 0, undefined, false);

    if (back) {
      // exterior back wall + ribbon window; the inside face is the dept feature wall
      const wz = z0 + WALL_T / 2 - 0.04;
      ribbonWall(B, R, room, col, "x", ROOM_W, r.cx, wz);
      accentPanel(B, R, room, col, "+z", ROOM_W - (r.col === 0 ? 0.04 : WALL_T / 2), SILL - 0.1, r.cx + (r.col === 0 ? 0.02 : WALL_T / 4), wz + WALL_T / 2);
      skirting(B, R, room, col, "+z", ROOM_W, r.cx, wz + WALL_T / 2 + 0.008);
      aoStrip(B, R, room, ROOM_W, r.cx, wz + WALL_T / 2, "x", 0.3);
    } else {
      // glass partition to the corridor with a central door
      const door = 1.3;
      const seg = (ROOM_W - door) / 2;
      glassPartition(B, R, room, col, seg - 0.04, x0 + seg / 2 + 0.02, z0 + 0.02);
      glassPartition(B, R, room, col, seg - 0.04, r.cx + door / 2 + seg / 2 - 0.02, z0 + 0.02);
      aoStrip(B, R, room, ROOM_W, r.cx, z0 + 0.03, "x", 0.14);
    }
    // left partition (interior) — col 0 rooms use the shared exterior wall
    if (r.col > 0) {
      const len = ROOM_D + (back ? WALL_T / 2 : 0);
      wallSeg(B, R, room, col, "z", len, PART_H, x0, r.cz - (back ? WALL_T / 4 : 0));
      skirting(B, R, room, col, "+x", ROOM_D, x0 + WALL_T / 2, r.cz);
      aoStrip(B, R, room, ROOM_D, x0 + WALL_T / 2, r.cz, "z", 0.24);
      // the neighbour's side of the same partition
      aoStrip(B, R, room, ROOM_D, x0 - WALL_T / 2, r.cz, "z", 0.24, -1);
      if (!back) accentPanel(B, R, room, col, "+x", ROOM_D - 0.02, PART_H - 0.16, x0 + WALL_T / 2, r.cz);
    } else if (!back) {
      // lobby: feature wall on the exterior wall face, below the window
      accentPanel(B, R, room, col, "+x", ROOM_D - 0.02, SILL - 0.1, -HALF_X + 0.04, r.cz);
    }
    perRoom.set(room, B.group);
  }
  return { shared: S.group, perRoom };
}
