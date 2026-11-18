// WP-B (redesign) · World level 2 "Offices": the exploded stack. Floor 1 is the live office (untouched, y 0). Floor 2
// sits 7.5 m above it: one roofless plate with the same footprint, a 0.25 m slab with a dark cut edge, walls on the back
// and left only (the same language as office/shell.ts) and four rooms in a row: Marketing · Research · Money ·
// Customers. All furniture is baked into one vertex-coloured mesh (+ one for the glowing screens); people are
// instanced. Every room shows only what really happened (setOffices): off = dim, working = lit + someone typing,
// done = lit + a paper pile per real result (max 5). Implements the old Tower interface so world/index.ts barely changes.
import * as THREE from "three";
import type { OfficeRoomId } from "../api-v8";
import { glowMaterial, Lite, liteMaterial, mixHex, paintTag, type LiteGeo, type Tint } from "./lite";
import { easeOut, win } from "./kit";
import type { Palette } from "./palette";
import { Papers, People } from "./people";
import type { Tower } from "./tower";

export const PLATE_Y = 7.5;
/** The offices floor footprint = floor 1's slab (office/layout: ±12 × ±5.8 + 0.45 pad). */
const HX = 12.45, HZ = 6.25;
const ROOM_W = 6, ROOM_Z0 = -5.8, ROOM_Z1 = 2.9;
const ROOM_CZ = (ROOM_Z0 + ROOM_Z1) / 2;
export const OFFICE_ROOMS: readonly OfficeRoomId[] = ["marketing", "research", "money", "customers"];
/** Same tints as ui/offices.ts ROOM_TINT. */
export const OFFICE_TINT: Record<OfficeRoomId, string> = { marketing: "#E8590C", research: "#1971C2", money: "#05875F", customers: "#7048E8" };
export const OFFICE_NAME: Record<OfficeRoomId, string> = { marketing: "Marketing", research: "Research", money: "Money", customers: "Customers" };

export type OfficeState = { id: OfficeRoomId; state: "off" | "working" | "done"; results: number };

export interface Stack extends Tower {
  setOffices(rooms: OfficeState[], o?: { sample?: boolean }): void;
  /** World box of one office room (for camera shots and picking). */
  roomBox(id: OfficeRoomId): THREE.Box3;
  /** World point just above a room (DOM label anchor). */
  roomAnchor(id: OfficeRoomId): THREE.Vector3;
  /** Office room under the ray. */
  pick(ray: THREE.Raycaster): OfficeRoomId | null;
  /** Floor 2 alone (+ the top of floor 1), for portrait framing. */
  upperBounds(): THREE.Box3;
}

const C = {
  slabCut: "#353A45", floor: "#EEEAE3", wall: "#FAFAF8", wallCap: "#2E333D", partition: "#F4F2EE", oak: "#E6D3B5", oakDark: "#B98F62",
  metal: "#5A606B", chair: "#3B414C", pot: "#C9825B", leaf: "#4E9A5B", leafDark: "#3C7F49", white: "#FFFFFF", ink: "#2B2F38", gold: "#E2B23C",
  screenOff: "#262A32",
};

function furnish(L: Lite, G: Lite, i: number, id: OfficeRoomId) {
  const tint = OFFICE_TINT[id];
  const cx = -HX + 0.45 + ROOM_W / 2 + i * ROOM_W;
  L.tag = i;
  G.tag = i;
  const y = PLATE_Y;
  // floor tile + rug in the department colour
  L.box(ROOM_W - 0.12, 0.02, ROOM_Z1 - ROOM_Z0 - 0.1, mixHex(tint, "#F3EFE8", 0.72), cx, y, ROOM_CZ);
  L.box(2.8, 0.015, 1.9, mixHex(tint, "#FFFFFF", 0.38), cx + 0.7, y + 0.02, ROOM_CZ + 1.6);
  // accent band on the back wall + a wall board
  L.box(ROOM_W - 0.2, 1.75, 0.03, mixHex(tint, "#FFFFFF", 0.45), cx, y, ROOM_Z0 + 0.02);
  L.boxC(1.9, 0.95, 0.05, C.white, cx - 1.1, y + 1.12, ROOM_Z0 + 0.07);
  for (let k = 0; k < 3; k++) L.boxC(0.32, 0.12 + k * 0.14, 0.02, tint, cx - 1.75 + k * 0.42, y + 0.78 + (0.12 + k * 0.14) / 2, ROOM_Z0 + 0.1);
  L.boxC(0.75, 0.06, 0.02, mixHex(tint, C.ink, 0.3), cx - 0.55, y + 1.42, ROOM_Z0 + 0.1);
  L.boxC(0.6, 0.06, 0.02, mixHex(tint, "#FFFFFF", 0.4), cx - 0.6, y + 1.3, ROOM_Z0 + 0.1);
  // desk (facing the back wall) + chair + screen
  const dx = cx + 0.9, dz = ROOM_Z0 + 1.35;
  L.box(1.8, 0.06, 0.82, C.oak, dx, y + 0.7, dz);
  for (const sx of [-1, 1]) L.box(0.06, 0.7, 0.76, C.white, dx + sx * 0.86, y, dz);
  L.box(0.08, 0.36, 0.06, C.metal, dx, y + 0.76, dz - 0.25);
  G.boxC(0.92, 0.54, 0.04, mixHex(tint, "#FFFFFF", 0.35), dx, y + 1.25, dz - 0.27);
  L.boxC(0.98, 0.6, 0.03, C.ink, dx, y + 1.25, dz - 0.3);
  L.box(0.42, 0.03, 0.14, C.ink, dx - 0.1, y + 0.76, dz + 0.12);
  L.box(0.5, 0.08, 0.5, C.chair, dx, y + 0.42, dz + 0.78);
  L.box(0.5, 0.5, 0.08, C.chair, dx, y + 0.5, dz + 1.03);
  L.cyl(0.03, 0.03, 0.42, C.metal, dx, y, dz + 0.78, 6);
  // plant in the corner
  L.cyl(0.2, 0.16, 0.36, C.pot, cx + 2.45, y, ROOM_Z0 + 0.5, 10);
  L.ball(0.36, C.leaf, cx + 2.45, y + 0.68, ROOM_Z0 + 0.5, 0);
  L.ball(0.24, C.leafDark, cx + 2.3, y + 0.98, ROOM_Z0 + 0.62, 0);
  // the department's one prop
  if (id === "marketing") {
    // easel with this week's post + a megaphone on a stool
    const ex = cx - 1.4, ez = ROOM_CZ + 1.5;
    for (const sx of [-1, 1]) L.add(new THREE.BoxGeometry(0.05, 1.5, 0.05), C.oakDark, ex + sx * 0.32, y + 0.72, ez, 0, -0.12);
    L.boxC(0.95, 1.1, 0.05, C.white, ex, y + 1.05, ez - 0.05, 0, -0.12);
    L.boxC(0.8, 0.5, 0.02, mixHex(tint, "#FFFFFF", 0.3), ex, y + 1.2, ez - 0.02, 0, -0.12);
    L.boxC(0.55, 0.07, 0.02, C.ink, ex - 0.08, y + 0.82, ez + 0.0, 0, -0.12);
    L.cyl(0.2, 0.2, 0.45, C.white, cx - 0.2, y, ROOM_CZ + 2.3, 12);
    L.add(new THREE.CylinderGeometry(0.06, 0.2, 0.38, 12), tint, cx - 0.2, y + 0.62, ROOM_CZ + 2.3, 0, Math.PI / 2);
  } else if (id === "research") {
    // bookshelf against the left partition + a reading lamp
    const bx = cx - ROOM_W / 2 + 0.3, bz = ROOM_CZ + 0.6;
    L.box(0.4, 1.7, 1.6, C.white, bx, y, bz);
    const books = [tint, "#E3893B", "#3A9D8F", mixHex(tint, "#FFFFFF", 0.4), C.ink, "#D45D5D"];
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 5; k++) L.box(0.3, 0.32 - ((k + r) % 3) * 0.05, 0.2, books[(k + r * 2) % books.length]!, bx + 0.02, y + 0.12 + r * 0.52, bz - 0.6 + k * 0.28);
    L.ball(0.22, mixHex(tint, "#FFFFFF", 0.2), cx - 1.2, y + 0.98, ROOM_CZ + 2.2, 1);
    L.cyl(0.05, 0.12, 0.76, C.oakDark, cx - 1.2, y, ROOM_CZ + 2.2, 8);
  } else if (id === "money") {
    // coin stacks rising like a chart + a small safe
    for (let k = 0; k < 4; k++) L.cyl(0.2, 0.2, 0.25 + k * 0.22, C.gold, cx - 2.0 + k * 0.5, y, ROOM_CZ + 2.1, 14);
    L.box(0.85, 0.95, 0.8, C.ink, cx - 2.0, y, ROOM_CZ - 0.4);
    L.boxC(0.3, 0.3, 0.02, mixHex(tint, "#FFFFFF", 0.4), cx - 2.0, y + 0.55, ROOM_CZ + 0.01);
  } else {
    // a sofa for customers + a round coffee table with a speech-bubble card
    const sx = cx - 1.2, sz = ROOM_CZ + 2.3;
    L.box(1.9, 0.42, 0.8, mixHex(tint, "#FFFFFF", 0.25), sx, y, sz);
    L.box(1.9, 0.55, 0.22, mixHex(tint, C.ink, 0.15), sx, y + 0.3, sz + 0.34);
    for (const k of [-1, 1]) L.box(0.22, 0.55, 0.8, mixHex(tint, C.ink, 0.15), sx + k * 0.9, y + 0.1, sz);
    L.cyl(0.38, 0.38, 0.05, C.white, sx, y + 0.42, sz - 1.0, 18);
    L.cyl(0.05, 0.05, 0.42, C.metal, sx, y, sz - 1.0, 6);
    L.boxC(0.5, 0.32, 0.04, C.white, sx + 0.05, y + 0.72, sz - 1.0);
    L.boxC(0.34, 0.05, 0.02, tint, sx + 0.05, y + 0.76, sz - 0.97);
  }
  return { cx, seat: { x: dx, z: dz + 0.82 }, desk: { x: dx + 0.6, y: y + 0.76, z: dz + 0.16 } };
}

export function createStack(opts: { quality: "low" | "high"; env?: THREE.Texture | null }): Stack {
  const shadows = opts.quality === "high";
  const root = new THREE.Group();
  root.name = "stack";
  const upper = new THREE.Group(); // floor 2: slides down into place while it grows
  root.add(upper);

  // ── shared shell of floor 2 (tag -1)
  const L = new Lite();
  const G = new Lite();
  L.tag = -1;
  L.box(HX * 2, 0.2, HZ * 2, C.slabCut, 0, PLATE_Y - 0.25, 0); // dark cut edge
  L.box(HX * 2 - 0.06, 0.05, HZ * 2 - 0.06, C.floor, 0, PLATE_Y - 0.05, 0);
  L.box(HX * 2 - 0.3, 1.9, 0.16, C.wall, 0.0, PLATE_Y, -HZ + 0.25); // back wall
  L.box(HX * 2 - 0.3, 0.04, 0.2, C.wallCap, 0.0, PLATE_Y + 1.9, -HZ + 0.25);
  L.box(0.16, 1.9, HZ * 2 - 0.3, C.wall, -HX + 0.25, PLATE_Y, 0); // left wall
  L.box(0.2, 0.04, HZ * 2 - 0.3, C.wallCap, -HX + 0.25, PLATE_Y + 1.9, 0);
  for (let k = 1; k < 4; k++) {
    const x = -HX + 0.45 + k * ROOM_W;
    L.box(0.1, 1.15, ROOM_Z1 - ROOM_Z0, C.partition, x, PLATE_Y, ROOM_CZ);
    L.box(0.12, 0.03, ROOM_Z1 - ROOM_Z0, C.wallCap, x, PLATE_Y + 1.15, ROOM_CZ);
  }
  // corridor: a thin glass rail on the open edges and two plants (no people, no fake activity)
  L.box(HX * 2 - 0.5, 0.05, 0.05, "#9AA2AE", 0, PLATE_Y + 0.95, HZ - 0.12);
  L.box(0.05, 0.05, HZ * 2 - 0.5, "#9AA2AE", HX - 0.12, PLATE_Y + 0.95, 0);
  for (let k = 0; k <= 10; k++) L.box(0.04, 0.95, 0.04, "#B5BCC6", -HX + 0.4 + k * ((HX * 2 - 0.8) / 10), PLATE_Y, HZ - 0.12);
  for (const x of [-10.6, 10.6]) {
    L.cyl(0.24, 0.2, 0.42, C.pot, x, PLATE_Y, HZ - 1.0, 10);
    L.ball(0.45, C.leaf, x, PLATE_Y + 0.8, HZ - 1.0, 0);
  }
  const seats: { x: number; z: number }[] = [];
  const desks: { x: number; y: number; z: number }[] = [];
  const centers: number[] = [];
  OFFICE_ROOMS.forEach((id, i) => {
    const f = furnish(L, G, i, id);
    seats.push(f.seat);
    desks.push(f.desk);
    centers.push(f.cx);
  });
  const solid: LiteGeo = L.build();
  const glow: LiteGeo = G.build();
  const solidMat = liteMaterial(opts.env);
  const glowMat = glowMaterial();
  const solidMesh = new THREE.Mesh(solid.geo, solidMat);
  solidMesh.receiveShadow = shadows;
  const glowMesh = new THREE.Mesh(glow.geo, glowMat);
  upper.add(solidMesh, glowMesh);

  // people (one per office, seated at the desk) + result piles
  const people = new People(4, false);
  upper.add(people.root);
  const papers = new Papers(4 * 5);
  upper.add(papers.mesh);

  // ── columns down to floor 1 + a glass stair core beside the building (stretch with growth)
  const legs = new Lite();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.box(0.18, PLATE_Y - 0.25, 0.18, "#C3C8D0", sx * (HX - 0.2), 0, sz * (HZ - 0.2));
  // the core stands behind the far (left) end, so it never hides a room from the camera
  const CORE = { x: -HX - 1.25, z: -HZ + 1.7, w: 1.7 };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.box(0.08, PLATE_Y + 1.0 + 0.45, 0.08, "#9AA2AE", CORE.x + (sx * CORE.w) / 2, -0.45, CORE.z + (sz * CORE.w) / 2);
  for (let k = 0; k < 9; k++) legs.box(CORE.w - 0.2, 0.06, 0.5, "#DADDE2", CORE.x, -0.45 + k * ((PLATE_Y + 0.4) / 9), CORE.z - 0.55 + ((k % 2) * 1.1));
  // a short bridge from the core to the plate
  legs.box(0.9, 0.1, 1.2, C.floor, -HX - 0.2, PLATE_Y - 0.1, CORE.z);
  const legsGeo = legs.build();
  const legsMesh = new THREE.Mesh(legsGeo.geo, liteMaterial(opts.env));
  root.add(legsMesh);
  const coreGlass = new THREE.Mesh(
    new THREE.BoxGeometry(CORE.w, PLATE_Y + 1.45, CORE.w),
    new THREE.MeshStandardMaterial({ color: "#CFE3F5", transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false }),
  );
  coreGlass.position.set(CORE.x, -0.45 + (PLATE_Y + 1.45) / 2, CORE.z);
  coreGlass.renderOrder = 2;
  root.add(coreGlass);

  // picking volumes (invisible), one per office
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const pickers = OFFICE_ROOMS.map((id, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W - 0.1, 2.2, ROOM_Z1 - ROOM_Z0), pickMat);
    m.position.set(centers[i]!, PLATE_Y + 1.1, ROOM_CZ);
    m.userData.office = id;
    upper.add(m);
    return m;
  });

  // ── state
  const state = new Map<OfficeRoomId, OfficeState>(OFFICE_ROOMS.map((id) => [id, { id, state: "off", results: 0 }]));
  let sample = false;
  let sweepT = -1;
  const TINT: Record<OfficeState["state"], Tint> = { off: { k: 0.86, desat: 0.92 }, working: { k: 1.0, desat: 0 }, done: { k: 1.0, desat: 0 } };
  const GLOW: Record<OfficeState["state"], Tint> = { off: { k: 0.22, desat: 1 }, working: { k: 1.08, desat: 0 }, done: { k: 0.82, desat: 0.1 } };
  function paint(lift: number[] = [0, 0, 0, 0]) {
    const s = sample ? 0.12 : 0;
    OFFICE_ROOMS.forEach((id, i) => {
      const st = state.get(id)!.state;
      const t = TINT[st], g = GLOW[st];
      paintTag(solid, i, { k: t.k * (sample ? 0.96 : 1), desat: Math.min(1, t.desat + s), lift: lift[i] });
      paintTag(glow, i, { k: g.k, desat: Math.min(1, g.desat + s), lift: lift[i] ? lift[i]! * 0.6 : 0 });
    });
    paintTag(solid, -1, { k: sample ? 0.96 : 1, desat: s });
  }
  function placePeople() {
    people.set(
      OFFICE_ROOMS.map((id, i) => {
        const st = state.get(id)!.state;
        return { x: seats[i]!.x, y: PLATE_Y + 0.05, z: seats[i]!.z, ry: Math.PI, shirt: OFFICE_TINT[id], skin: i + 1, working: st === "working", visible: st !== "off" };
      }),
    );
    papers.set(OFFICE_ROOMS.map((id, i) => ({ ...desks[i]!, n: state.get(id)!.state === "off" ? 0 : Math.min(5, Math.max(0, state.get(id)!.results)) })));
  }
  paint();
  placePeople();

  let growth = 1;
  function setGrowth(g: number) {
    growth = Math.max(0, Math.min(1, g));
    root.visible = growth > 0.001;
    const e = easeOut(win(growth, 0, 1));
    upper.position.y = (1 - e) * 7;
    legsMesh.scale.y = Math.max(0.001, e);
    coreGlass.scale.y = Math.max(0.001, e);
    coreGlass.position.y = -0.45 + ((PLATE_Y + 1.45) / 2) * e;
    upper.visible = growth > 0.02;
  }
  setGrowth(0);

  const _v = new THREE.Vector3();
  const bounds = new THREE.Box3(new THREE.Vector3(-HX, -0.6, -HZ), new THREE.Vector3(HX, PLATE_Y + 2.0, HZ));
  return {
    root,
    get growth() {
      return growth;
    },
    setGrowth,
    applyPalette(_p: Palette) {},
    sweep() {
      sweepT = 0;
    },
    setBeacon() {},
    update(dt, t) {
      let busy = people.pose(t);
      if (sweepT >= 0) {
        sweepT += dt;
        const lift = OFFICE_ROOMS.map((_, i) => {
          const k = win(sweepT, i * 0.14, 0.5);
          return k > 0 && k < 1 ? Math.sin(k * Math.PI) * 0.35 : 0;
        });
        paint(lift);
        if (sweepT > 0.14 * 3 + 0.55) {
          sweepT = -1;
          paint();
        }
        busy = true;
      }
      return busy;
    },
    bounds: () => bounds.clone(),
    upperBounds: () => new THREE.Box3(new THREE.Vector3(-HX, PLATE_Y - 2.4, -HZ), new THREE.Vector3(HX, PLATE_Y + 2.0, HZ)),
    beaconPoint: () => _v.set(0, PLATE_Y + 2.4, 0).clone(),
    setOffices(rooms, o) {
      for (const r of rooms) if (state.has(r.id)) state.set(r.id, { id: r.id, state: r.state, results: Math.max(0, r.results | 0) });
      sample = !!o?.sample;
      paint();
      placePeople();
    },
    roomBox(id) {
      const i = OFFICE_ROOMS.indexOf(id);
      const cx = centers[i] ?? 0;
      return new THREE.Box3(new THREE.Vector3(cx - ROOM_W / 2, PLATE_Y, ROOM_Z0), new THREE.Vector3(cx + ROOM_W / 2, PLATE_Y + 1.9, ROOM_Z1 + 1.2)).translate(new THREE.Vector3(0, upper.position.y, 0));
    },
    roomAnchor(id) {
      const i = OFFICE_ROOMS.indexOf(id);
      return new THREE.Vector3(centers[i] ?? 0, PLATE_Y + upper.position.y + 2.35, ROOM_CZ - 0.6);
    },
    pick(ray) {
      if (!root.visible || !upper.visible) return null;
      const hit = ray.intersectObjects(pickers, false)[0];
      return hit ? (hit.object.userData.office as OfficeRoomId) : null;
    },
    dispose() {
      solid.geo.dispose();
      glow.geo.dispose();
      legsGeo.geo.dispose();
      solidMat.dispose();
      glowMat.dispose();
      (legsMesh.material as THREE.Material).dispose();
      coreGlass.geometry.dispose();
      (coreGlass.material as THREE.Material).dispose();
      pickers.forEach((p) => p.geometry.dispose());
      pickMat.dispose();
      people.dispose();
      papers.dispose();
    },
  };
}
