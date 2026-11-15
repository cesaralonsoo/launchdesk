// WS-OFFICE · rooms/ — the theme registry. One file per room theme; this file picks the theme for a floor room,
// builds its ThemeCtx (area, desk spot, keep-clear zones, wall anchors) and adds the light pools every room shares.
//
// Research rooms (r0…r3) take the theme of the analyst who sits there (office index.ts calls furnishRoom again when
// the roster changes; each variant is built once and cached). r3 may be shared by two analysts: each theme then
// builds a compact half (side "a" = left, "b" = right). Front rooms have fixed themes.
import * as THREE from "three";
import type { AnalystRole, Quality } from "../../../contracts";
import type { RoomDef } from "../layout";
import { radialTex } from "../textures";
import { C, DESK_AT, plainRug, plant, researchDesk, ROOM_RECT, wallsFor, zonesFor, type RoomDecor, type ThemeCtx, type ThemeFn, type ThemeId, type Ctx } from "./common";
import { competition } from "./competition";
import { demand } from "./demand";
import { dex } from "./dex";
import { launch } from "./launch";
import { lobby } from "./lobby";
import { location } from "./location";
import { market } from "./market";
import { nova } from "./nova";
import { pricing } from "./pricing";
import { regulation } from "./regulation";
import { scalability } from "./scalability";
import { tech } from "./tech";
import { viability } from "./viability";

export type { RoomDecor, ThemeCtx, ThemeFn, ThemeId } from "./common";

/** Vacant research room: waiting for a hire. */
const vacant: ThemeFn = (ctx) => {
  const { c, group: g } = ctx;
  researchDesk(ctx, { screen: 0 });
  plant(c, g, [2.6, 0, 1.95], "bush");
  plant(c, g, [-2.6, 0, 2.0], "small");
  return { group: g };
};

export const THEMES: Record<ThemeId, ThemeFn> = {
  viability, competition, market, demand, pricing, location, regulation, tech, scalability,
  nova, dex, launch, lobby, vacant,
};
export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/** Which set a floor room shows. */
export type RoomSet =
  | { kind: "lobby" }
  | { kind: "nova" }
  | { kind: "dex" }
  | { kind: "launch"; pipColor: string }
  | { kind: "research"; role: AnalystRole | null }
  | { kind: "shared"; a: AnalystRole; b: AnalystRole; colorB: string };

/** Stable key of a set (variant cache key part). */
export const setKey = (s: RoomSet) => (s.kind === "research" ? s.role ?? "vacant" : s.kind === "shared" ? `${s.a}+${s.b}` : s.kind);

function makeCtx(c: Ctx, def: RoomDef, theme: ThemeId, q: Quality, g: THREE.Group, side: ThemeCtx["side"], animated: THREE.Object3D[]): ThemeCtx {
  const desk = def.row === "back" ? (side === "b" ? DESK_AT.backB : DESK_AT.backA) : def.id === "lobby" ? DESK_AT.ceo : DESK_AT.front;
  const area = side === "a" ? { ...ROOM_RECT, x1: -0.05 } : side === "b" ? { ...ROOM_RECT, x0: 0.05 } : { ...ROOM_RECT };
  return {
    c, def, theme, accent: c.color, quality: q, hi: q === "high", side, compact: side !== "solo", area, desk: { ...desk },
    zones: zonesFor(def.id, side !== "solo"), walls: wallsFor(def), group: g,
    animate<T extends THREE.Object3D>(o: T): T {
      o.userData.keep = true;
      animated.push(o);
      return o;
    },
  };
}

/**
 * Furnish one floor room (room-local group `g`, already positioned at the room centre).
 * `c.color` = the room's colour (analyst A / the builder); for shared rooms pass colorB in the set.
 */
export function furnishRoom(c: Ctx, def: RoomDef, g: THREE.Group, set: RoomSet, q: Quality): RoomDecor[] {
  const decors: RoomDecor[] = [];
  const animated: THREE.Object3D[] = [];
  const back = def.row === "back";
  const run = (cc: Ctx, theme: ThemeId, side: ThemeCtx["side"]) => decors.push(THEMES[theme](makeCtx(cc, def, theme, q, g, side, animated)));
  if (set.kind === "research") {
    run(c, set.role ?? "vacant", "solo");
  } else if (set.kind === "shared") {
    run(c, set.a, "a");
    run({ ...c, color: set.colorB }, set.b, "b");
    // shared room: the back wall split half and half in the two analysts' colours, a soft rug per half
    const cb: Ctx = { ...c, color: set.colorB };
    c.B.box(2.96, 1.1, 0.012, c.R.m("accentWall", c.room, set.colorB, { rough: 0.95, key: "halfB" }), [1.5, 0.62, -2.362], 0, g, false);
    c.B.box(0.03, 1.1, 0.016, c.R.m("fixed", c.room, c.color, { color: "#F4F1EA", rough: 0.5 }), [0.0, 0.62, -2.36], 0, g, false);
    plainRug(c, g, 2.3, 1.7, [-1.4, 0, 0.75], true);
    plainRug(cb, g, 2.3, 1.7, [1.4, 0, 0.75], true);
    plant(c, g, [2.6, 0, 1.95], "tall");
    plant(c, g, [-2.6, 0, 2.0], "bush", C.terracotta);
  } else if (set.kind === "launch") run({ ...c, color2: set.pipColor }, "launch", "solo");
  else run(c, set.kind, "solo");
  // evening room glow: one broad warm pool (fakes the interior lamps on every quality level)
  c.B.decal(4.6, 3.8, c.R.m("pool", c.room, c.color, { map: radialTex(), opacity: 0.22, key: "roomglow" }), [back ? 0 : 0.3, 0.011, back ? -0.3 : 0.3], g);
  // working light: a soft dept-coloured pool around the workstation
  const wp = back ? [-1.55, 0, -1.4] : set.kind === "lobby" ? [-1.9, 0, 0.35] : [-1.9, 0, 0.2];
  c.B.decal(3.0, 2.6, c.R.m("workPool", c.room, c.color, { map: radialTex(), opacity: 0.55 }), [wp[0]!, 0.014, wp[2]!], g);
  return decors;
}
