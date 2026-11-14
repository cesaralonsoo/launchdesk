import * as THREE from "three";
import { box, basic, mat, plane } from "./furniture";
import { CORRIDOR, HALF_X, HALF_Z, ROOMS, ROOM_D, ROOM_W, SLAB_PAD, type RoomDef } from "./layout";
import { floorTex, glowTex } from "./textures";

export const WALL_H = 1.3;
export const PART_H = 1.15;
const T = 0.12; // wall thickness

export type RoomMeshes = {
  root: THREE.Group;
  glows: Map<string, THREE.Material[]>;
};

function glowStrip(color: string, len: number, depth: number, opacity: number): THREE.Mesh {
  const m = new THREE.MeshBasicMaterial({
    map: glowTex(), color, transparent: true, opacity, depthWrite: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, depth), m);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function trimMat(color: string) {
  return mat(color, { emissive: color, ei: 0.55, rough: 0.5 });
}

function wallMat() {
  return mat("#F1F2F4", { rough: 0.92 });
}

/** One straight wall along X (dir="x") or Z (dir="z"), with a coloured top trim. */
function wall(dir: "x" | "z", len: number, h: number, color: string, at: [number, number], g: THREE.Group) {
  const [x, z] = at;
  const w = dir === "x" ? len : T;
  const d = dir === "x" ? T : len;
  g.add(box(w, h, d, wallMat(), [x, h / 2, z]));
  const trim = box(w + 0.02, 0.06, d + 0.02, trimMat(color), [x, h + 0.03, z]);
  trim.castShadow = false;
  g.add(trim);
  // base skirting line in dept colour
  const sk = box(dir === "x" ? len : T + 0.02, 0.05, dir === "x" ? T + 0.02 : len, mat("#DDE3EA"), [x, 0.025, z]);
  sk.castShadow = false;
  g.add(sk);
}

function glassWall(len: number, h: number, color: string, at: [number, number], g: THREE.Group) {
  const [x, z] = at;
  const glass = new THREE.MeshStandardMaterial({
    color: "#CFE8FF", transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false,
  });
  const pane = new THREE.Mesh(new THREE.BoxGeometry(len, h, 0.04), glass);
  pane.position.set(x, h / 2, z);
  g.add(pane);
  g.add(box(len, 0.05, 0.08, trimMat(color), [x, h, z]));
  g.add(box(len, 0.08, 0.1, mat("#DDE3EA"), [x, 0.04, z]));
  for (const ex of [-len / 2, len / 2]) g.add(box(0.06, h, 0.08, mat("#C9D2DE"), [x + ex, h / 2, z]));
}

function buildRoom(r: RoomDef, g: THREE.Group, glows: Map<string, THREE.Material[]>) {
  const back = r.row === "back";
  const x0 = r.cx - ROOM_W / 2;
  const z0 = r.cz - ROOM_D / 2;
  const z1 = r.cz + ROOM_D / 2;

  // floor
  // Light warm grey, not white: the rooms must not glare next to the dark UI.
  const fm = new THREE.MeshStandardMaterial({ color: "#E6E8EC", map: floorTex(), roughness: 0.95 });
  fm.color = new THREE.Color("#ECEEF1").lerp(new THREE.Color(r.color), 0.04);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W - 0.04, 0.06, ROOM_D - 0.04), fm);
  floor.position.set(r.cx, -0.02, r.cz);
  floor.receiveShadow = true;
  g.add(floor);

  // walls: back + left (cut-away diorama)
  if (back) {
    wall("x", ROOM_W, WALL_H, r.color, [r.cx, z0 + T / 2], g);
  } else {
    // glass partition to the corridor with a door gap in the middle
    const seg = ROOM_W / 2 - 0.65;
    glassWall(seg, 0.95, r.color, [x0 + seg / 2, z0 + 0.02], g);
    glassWall(seg, 0.95, r.color, [r.cx + 0.65 + seg / 2, z0 + 0.02], g);
  }
  const leftH = r.col === 0 ? WALL_H : PART_H;
  wall("z", ROOM_D + (back ? T : 0), leftH, r.color, [x0 + T / 2, r.cz - (back ? T / 2 : 0)], g);

  // glowing coloured edge along the floor
  const line = basic(r.color);
  const inset = 0.05;
  const lw = 0.045;
  const edges: Array<[number, number, number, number]> = [
    // x, z, length, rotation (0 = along x)
    [r.cx, z0 + inset + (back ? T : 0), ROOM_W - 0.1, 0],
    [r.cx, z1 - inset, ROOM_W - 0.1, 0],
    [x0 + inset + T, r.cz, ROOM_D - 0.1, 1],
    [x0 + ROOM_W - inset, r.cz, ROOM_D - 0.1, 1],
  ];
  const mats: THREE.Material[] = [];
  edges.forEach(([x, z, len, rot], i) => {
    const s = box(rot ? lw : len, 0.012, rot ? len : lw, line, [x, 0.016, z]);
    s.castShadow = false;
    s.receiveShadow = false;
    g.add(s);
    const gl = glowStrip(r.color, len, 0.55, i === 1 && !back ? 0.32 : 0.22);
    gl.position.set(x, 0.014, z);
    // point the bright end of the gradient at the edge
    const inward = [1, -1, 1, -1][i]!;
    if (rot) {
      gl.rotation.z = inward > 0 ? Math.PI / 2 : -Math.PI / 2; // bright side faces the edge
      gl.position.x += inward * 0.27;
    } else {
      gl.rotation.z = inward > 0 ? 0 : Math.PI;
      gl.position.z += inward * 0.27;
    }
    g.add(gl);
    mats.push(gl.material as THREE.Material);
  });
  glows.set(r.id, mats);

  // glowing line on the outer slab edge for this room
  const outerZ = back ? -(HALF_Z + SLAB_PAD) : HALF_Z + SLAB_PAD;
  const rim = box(ROOM_W - 0.06, 0.05, 0.03, line, [r.cx, -0.05, outerZ + (back ? -0.005 : 0.005)]);
  rim.castShadow = false;
  g.add(rim);
  if (r.col === 0) {
    const rimL = box(0.03, 0.05, ROOM_D, line, [-(HALF_X + SLAB_PAD) - 0.005, -0.05, r.cz]);
    rimL.castShadow = false;
    g.add(rimL);
  }
  if (r.col === 3) {
    const rimR = box(0.03, 0.05, ROOM_D, line, [HALF_X + SLAB_PAD + 0.005, -0.05, r.cz]);
    rimR.castShadow = false;
    g.add(rimR);
  }
}

export function buildBuilding(): RoomMeshes {
  const root = new THREE.Group();
  const glows = new Map<string, THREE.Material[]>();

  // base slab
  const sw = HALF_X * 2 + SLAB_PAD * 2;
  const sd = HALF_Z * 2 + SLAB_PAD * 2;
  const slab = box(sw, 0.55, sd, mat("#2A2F3A", { rough: 0.85 }), [0, -0.3, 0], 0.08);
  slab.castShadow = false;
  root.add(slab);
  const cap = box(sw - 0.02, 0.05, sd - 0.02, mat("#475366", { rough: 0.8 }), [0, -0.04, 0], 0.02);
  cap.castShadow = false;
  root.add(cap);

  // corridor
  const cor = box(HALF_X * 2, 0.05, CORRIDOR, mat("#DDE1E7", { rough: 0.95 }), [0, -0.015, 0]);
  cor.castShadow = false;
  root.add(cor);
  for (let i = 0; i < 24; i++) {
    const s = box(0.5, 0.01, 0.06, basic("#C2CCD9"), [-HALF_X + 0.5 + i * 1.0, 0.014, 0]);
    s.castShadow = false;
    root.add(s);
  }

  for (const r of ROOMS) buildRoom(r, root, glows);

  // soft contact shadow under the slab
  const shadowMat = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.35, depthWrite: false });
  const sh = plane(sw + 3, sd + 3, shadowMat, [0, -0.6, 0]);
  sh.rotation.x = -Math.PI / 2;
  sh.visible = false;
  root.add(sh);

  return { root, glows };
}
