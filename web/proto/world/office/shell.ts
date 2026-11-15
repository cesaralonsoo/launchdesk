// WS-A · the architecture: model base slab, floors, corridor, walls with ribbon windows, glass partitions,
// skirting, baked AO along wall bases. Same floor plan as layout.ts.
import * as THREE from "three";
import type { Room } from "../../contracts";
import { Builder, type Registry } from "./kit";
import { CORRIDOR, HALF_X, HALF_Z, ROOMS, ROOM_D, ROOM_W, SLAB_PAD, type RoomDef } from "./layout";
import { fadeTex, planksTex, plasterTex, softRectTex } from "./textures";

export const WALL_T = 0.16;
export const EXT_H = 1.86; // exterior walls (back row, left end) with a ribbon window
export const PART_H = 1.18; // partitions between rooms
const SILL = 1.26;
const HEAD = 1.68;
const GLASS_H = 1.04;
const NEUTRAL = "#B9BCC2";

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
  const metal = R.m("fixed", room, accent, { color: "#C3C7CD", rough: 0.35, metal: 0.5 });
  const n = Math.max(2, Math.round(len / 2.0));
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (i / n) * len;
    const px = dir === "x" ? cx + t : cx;
    const pz = dir === "x" ? cz : cz + t;
    B.box(dir === "x" ? 0.025 : WALL_T * 0.5, gh, dir === "x" ? WALL_T * 0.5 : 0.025, metal, [px, SILL + gh / 2, pz]);
  }
  B.box(dir === "x" ? len : WALL_T + 0.08, 0.03, dir === "x" ? WALL_T + 0.08 : len, R.m("wallCap", room, accent, { rough: 0.6, shade: 1.03 }), [cx, SILL + 0.015, cz]);
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
  const m = R.m("wallCap", room, accent, { rough: 0.7, shade: 1.02 });
  if (normal === "+z") B.box(len, 0.07, 0.016, m, [x, 0.035, z + 0.008], 0, undefined, false);
  else B.box(0.016, 0.07, len, m, [x + 0.008, 0.035, z], 0, undefined, false);
}

/** Baked ambient occlusion where floor meets wall. */
function aoStrip(B: Builder, R: Registry, room: Room | null, len: number, x: number, z: number, along: "x" | "z", strength = 0.2) {
  const m = R.m("shadow", room, NEUTRAL, { map: fadeTex(), opacity: strength });
  const w = 0.42;
  if (along === "x") B.decal(len, w, m, [x, 0.004, z + w / 2], undefined, 0);
  else B.decal(len, w, m, [x + w / 2, 0.004, z], undefined, Math.PI / 2);
}

function glassPartition(B: Builder, R: Registry, room: Room, accent: string, len: number, cx: number, cz: number) {
  const metal = R.m("fixed", room, accent, { color: "#BFC3C9", rough: 0.35, metal: 0.5 });
  B.box(len, GLASS_H, 0.02, R.m("glass", room, accent, {}), [cx, GLASS_H / 2, cz], 0, undefined, false).receiveShadow = false;
  B.box(len, 0.025, 0.045, metal, [cx, GLASS_H, cz]);
  B.box(len, 0.04, 0.05, metal, [cx, 0.02, cz]);
  for (const ex of [-len / 2, len / 2]) B.box(0.03, GLASS_H, 0.045, metal, [cx + ex, GLASS_H / 2, cz]);
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
  const body = S.box(sw, 0.47, sd, R.m("slab", null, NEU, { rough: 0.75 }), [0, -0.55 + 0.235, 0], 0.07);
  body.castShadow = true;
  S.box(sw - 0.06, 0.07, sd - 0.06, R.m("slabCap", null, NEU, { rough: 0.6 }), [0, -0.075 - 0.002, 0], 0.025).castShadow = false;
  // a thin reveal line between cap and body
  S.box(sw - 0.12, 0.012, sd - 0.12, R.m("slab", null, NEU, { rough: 0.9, shade: 0.72 }), [0, -0.115, 0], 0, undefined, false);

  // ── corridor: light oak planks
  const cor = S.box(HALF_X * 2, 0.05, CORRIDOR, R.m("corridor", null, NEU, { map: plasterTex(), rough: 0.8 }), [0, -0.025, 0], 0, undefined, false);
  uvScale(cor, (HALF_X * 2) / 3.2, CORRIDOR / 3.2);
  // thresholds into the back rooms
  for (const r of ROOMS) {
    if (r.row !== "back") continue;
    S.box(1.3, 0.012, 0.06, R.m("wallCap", r.id, r.color, { rough: 0.5 }), [r.cx, 0.002, -CORRIDOR / 2], 0, undefined, false);
  }
  // ── left exterior wall (runs the whole depth, ribbon window)
  ribbonWall(S, R, null, NEU, "z", HALF_Z * 2 + WALL_T, -HALF_X - WALL_T / 2 + 0.04, 0);
  skirting(S, R, null, NEU, "+x", HALF_Z * 2, -HALF_X + 0.04, 0);
  aoStrip(S, R, null, HALF_Z * 2, -HALF_X + 0.05, 0, "z", 0.22);
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
    const floor = B.box(ROOM_W, 0.05, ROOM_D, R.m("floor", room, col, { map: planksTex(), rough: 0.6 }), [r.cx, -0.025, r.cz], 0, undefined, false);
    uvScale(floor, ROOM_W / 4, ROOM_D / 4);
    // seam lines between rooms (subtle reveal)
    B.box(ROOM_W, 0.004, 0.012, R.m("wallCap", room, col, { shade: 0.85 }), [r.cx, 0.001, back ? z1 - 0.006 : z0 + 0.006], 0, undefined, false);

    if (back) {
      // exterior back wall + ribbon window; the inside face is the dept feature wall
      const wz = z0 + WALL_T / 2 - 0.04;
      ribbonWall(B, R, room, col, "x", ROOM_W, r.cx, wz);
      accentPanel(B, R, room, col, "+z", ROOM_W - (r.col === 0 ? 0.04 : WALL_T / 2), SILL - 0.1, r.cx + (r.col === 0 ? 0.02 : WALL_T / 4), wz + WALL_T / 2);
      skirting(B, R, room, col, "+z", ROOM_W, r.cx, wz + WALL_T / 2 + 0.008);
      aoStrip(B, R, room, ROOM_W, r.cx, wz + WALL_T / 2, "x", 0.24);
    } else {
      // glass partition to the corridor with a central door
      const door = 1.3;
      const seg = (ROOM_W - door) / 2;
      glassPartition(B, R, room, col, seg - 0.04, x0 + seg / 2 + 0.02, z0 + 0.02);
      glassPartition(B, R, room, col, seg - 0.04, r.cx + door / 2 + seg / 2 - 0.02, z0 + 0.02);
      aoStrip(B, R, room, ROOM_W, r.cx, z0 + 0.05, "x", 0.12);
    }
    // left partition (interior) — col 0 rooms use the shared exterior wall
    if (r.col > 0) {
      const len = ROOM_D + (back ? WALL_T / 2 : 0);
      wallSeg(B, R, room, col, "z", len, PART_H, x0, r.cz - (back ? WALL_T / 4 : 0));
      skirting(B, R, room, col, "+x", ROOM_D, x0 + WALL_T / 2, r.cz);
      aoStrip(B, R, room, ROOM_D, x0 + WALL_T / 2, r.cz, "z", 0.2);
      if (!back) accentPanel(B, R, room, col, "+x", ROOM_D - 0.02, PART_H - 0.16, x0 + WALL_T / 2, r.cz);
    } else if (!back) {
      // lobby: feature wall on the exterior wall face, below the window
      accentPanel(B, R, room, col, "+x", ROOM_D - 0.02, SILL - 0.1, -HALF_X + 0.04, r.cz);
    }
    perRoom.set(room, B.group);
  }
  return { shared: S.group, perRoom };
}
