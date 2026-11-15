// WS-A · materials-by-role, geometry helpers and static-mesh baking for the level-1 office.
//
// Every material is registered with a *role* (floor, wall, accent, screen, lamp…) and the room that owns it.
// Colours are never hard-wired: `resolve()` recomputes them from the current atmosphere (theme surfaces,
// accentStrength, lights on/off) and from the room state (locked → desaturated + dimmed, working → screens up).
// That is what lets five themes and four room states reuse one model without rebuilding geometry.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Quality, Room } from "../../contracts";

export type P3 = [number, number, number];

export type Role =
  | "floor" // room floor: theme floor, faint dept tint
  | "corridor" // corridor / lobby planks
  | "wall" // theme wall colour
  | "wallCap" // wall tops: a touch darker, reads as thickness
  | "accentWall" // painted feature wall in a muted dept colour
  | "rug" // soft dept tint over the floor
  | "accent" // full dept colour (chairs, small objects)
  | "accentSoft" // pale dept colour (cushions, binders)
  | "slab" // base of the architectural model
  | "slabCap" // the light top band of the slab
  | "glass" // partitions / window panes
  | "skin" // character skin: never desaturated by the theme, only by locked rooms
  | "fixed" // natural materials (wood, steel, leaves) — only desaturated by mono themes / locked rooms
  | "screen" // emissive UI textures
  | "lamp" // lamp shades: glow when lights are on
  | "window" // window glass with sky light behind it
  | "pool" // additive light pool on the floor (lamps)
  | "workPool" // additive dept-coloured pool while the room works
  | "shadow" // contact shadows / AO decals
  | "led"; // tiny always-on indicators

export type Surfaces = { floor: string; wall: string; slab: string; glass: string; corridor: string };

export interface Look {
  s: Surfaces;
  acc: number; // accentStrength 0..1
  lightsOn: boolean;
  time: "day" | "golden" | "night" | "studio";
  env: number; // envMapIntensity
}

export const DEFAULT_SURFACES: Surfaces = {
  floor: "#F1EFEB",
  wall: "#FAF9F7",
  slab: "#D9D6D0",
  glass: "#DCE8F2",
  corridor: "#ECE6DC",
};

export interface Entry {
  mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
  role: Role;
  room: Room | null;
  accent: string; // dept colour of the owning room (or neutral)
  base: THREE.Color; // for fixed/screen/led: the designed colour; for others: a shade multiplier in r
  shade: number; // brightness multiplier for variants of the same role (e.g. darker wall cap)
  opacity: number; // base opacity for transparent roles
  emissive: number; // base emissive intensity (screens, lamps)
}

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
const hsl = { h: 0, s: 0, l: 0 };
const NEUTRAL_ACCENT = new THREE.Color("#B9BCC2");
const WHITE = new THREE.Color("#FFFFFF");
const OAK = new THREE.Color("#D9C3A2");

function desat(c: THREE.Color, k: number) {
  if (k <= 0) return c;
  c.getHSL(hsl);
  return c.setHSL(hsl.h, hsl.s * (1 - k), hsl.l);
}

/** Per-room dynamic mix values, animated by index.ts. */
export interface RoomMix {
  locked: number; // 0..1
  work: number; // 0..1
  done: number; // 0..1
}

export class Registry {
  readonly entries: Entry[] = [];
  private byKey = new Map<string, Entry>();
  envMap: THREE.Texture | null = null;

  constructor(readonly quality: Quality) {}

  /** Get or create a lit material for `role` in `room`. `color` is only used by fixed/screen/led roles. */
  m(
    role: Role,
    room: Room | null,
    accent: string,
    o: { color?: string; rough?: number; metal?: number; shade?: number; map?: THREE.Texture; emissive?: number; opacity?: number; side?: THREE.Side; key?: string } = {},
  ): THREE.MeshStandardMaterial | THREE.MeshBasicMaterial {
    const key = [role, room ?? "-", accent, o.color ?? "", o.rough ?? "", o.metal ?? "", o.shade ?? 1, o.map?.uuid ?? "", o.emissive ?? "", o.opacity ?? "", o.side ?? "", o.key ?? ""].join("|");
    const hit = this.byKey.get(key);
    if (hit) return hit.mat;
    let mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
    const additive = role === "pool" || role === "workPool";
    if (role === "shadow" || additive || role === "led") {
      mat = new THREE.MeshBasicMaterial({
        map: o.map ?? null,
        color: o.color ?? "#ffffff",
        transparent: role !== "led",
        depthWrite: role === "led",
        toneMapped: role !== "led" ? !additive : false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        opacity: o.opacity ?? 1,
        polygonOffset: role !== "led",
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
    } else {
      const sm = new THREE.MeshStandardMaterial({
        color: o.color ?? "#ffffff",
        roughness: o.rough ?? 0.8,
        metalness: o.metal ?? 0,
        map: o.map ?? null,
        side: o.side ?? THREE.FrontSide,
      });
      if (role === "glass" || role === "window") {
        sm.transparent = true;
        sm.depthWrite = false;
        sm.opacity = o.opacity ?? 0.3;
        sm.roughness = o.rough ?? 0.06;
        sm.metalness = 0.0;
      }
      if (role === "screen") {
        sm.emissiveMap = o.map ?? null;
        sm.emissive.set("#ffffff");
        sm.roughness = 0.25;
      }
      if (role === "lamp") {
        sm.emissive.set("#FFD9A0");
      }
      mat = sm;
    }
    const e: Entry = {
      mat,
      role,
      room,
      accent,
      base: new THREE.Color(o.color ?? "#ffffff"),
      shade: o.shade ?? 1,
      opacity: o.opacity ?? (role === "glass" ? 0.28 : role === "window" ? 0.55 : 1),
      emissive: o.emissive ?? (role === "screen" ? 1 : role === "lamp" ? 1 : 0),
    };
    if (this.envMap && mat instanceof THREE.MeshStandardMaterial) mat.envMap = this.envMap;
    this.entries.push(e);
    this.byKey.set(key, e);
    return mat;
  }

  setEnvMap(t: THREE.Texture) {
    this.envMap = t;
    for (const e of this.entries) {
      if (e.mat instanceof THREE.MeshStandardMaterial) {
        e.mat.envMap = t;
        e.mat.needsUpdate = true;
      }
    }
  }

  /** Recompute every material of `room` (or of the shell when room = null; all when undefined). */
  resolve(look: Look, mixes: Map<Room, RoomMix>, only?: Room | null) {
    for (const e of this.entries) {
      if (only !== undefined && e.room !== only) continue;
      const mix = e.room ? mixes.get(e.room) : undefined;
      resolveEntry(e, look, mix);
    }
  }

  dispose() {
    for (const e of this.entries) e.mat.dispose();
    this.entries.length = 0;
    this.byKey.clear();
  }
}

function resolveEntry(e: Entry, L: Look, mix?: RoomMix) {
  const locked = mix?.locked ?? 0;
  const work = mix?.work ?? 0;
  const done = mix?.done ?? 0;
  const acc = L.acc;
  const accent = tmpB.set(e.accent);
  const c = tmpA;
  const night = L.time === "night";
  switch (e.role) {
    case "floor":
      // warm oak, pulled toward the theme floor, a whisper of the dept colour
      // rooms read as zones: a step darker than the neutral corridor
      c.set(L.s.floor).lerp(OAK, 0.45).lerp(accent, 0.04 * acc).multiplyScalar(0.94);
      desat(c, (1 - acc) * 0.8);
      break;
    case "corridor":
      c.set(L.s.corridor).multiplyScalar(0.97);
      break;
    case "wall":
      c.set(L.s.wall);
      break;
    case "wallCap":
      c.set(L.s.wall).multiplyScalar(0.8);
      break;
    case "accentWall": {
      // one strong identity surface per room: the department colour, softened only a little (~OKLCH L .72 C .12)
      const strong = desat(accent.clone(), 0.22).lerp(WHITE, 0.2);
      c.set(L.s.wall).lerp(strong, Math.min(1, 1.1 * acc));
      break;
    }
    case "rug": {
      const light = desat(accent.clone(), 0.12).lerp(WHITE, 0.55);
      c.set(L.s.floor).lerp(light, Math.min(1, 1.1 * acc));
      break;
    }
    case "accent":
      c.copy(NEUTRAL_ACCENT).lerp(accent, acc);
      break;
    case "accentSoft":
      c.set("#E6E7EA").lerp(tmpB.set(e.accent).lerp(WHITE, 0.45), acc);
      break;
    case "slab":
      c.set(L.s.slab);
      break;
    case "slabCap":
      c.set(L.s.slab).lerp(WHITE, 0.55);
      break;
    case "glass":
      c.set(L.s.glass);
      break;
    case "window": {
      const sky = L.time === "night" ? "#1C2A44" : L.time === "golden" ? "#FFE2B8" : L.time === "studio" ? "#F2F5F8" : "#DCEBF7";
      c.set(sky);
      break;
    }
    case "skin":
    case "fixed":
    case "screen":
    case "led":
    case "lamp":
      c.copy(e.base);
      if (e.role === "fixed") desat(c, (1 - acc) * 0.75);
      break;
    case "shadow":
      c.set(night ? "#000000" : "#2A2620");
      break;
    case "pool":
      c.set(L.time === "golden" ? "#FFC27A" : "#FFC98A");
      break;
    case "workPool":
      c.copy(accent).lerp(WHITE, 0.15);
      break;
  }
  if (e.role !== "pool" && e.role !== "workPool" && e.role !== "shadow" && e.role !== "led" && e.role !== "window") {
    c.multiplyScalar(e.shade);
    if (locked > 0) {
      desat(c, 0.85 * locked);
      c.multiplyScalar(1 - 0.2 * locked);
    }
  }
  if (e.role === "led" && locked > 0) c.multiplyScalar(1 - 0.85 * locked);

  const m = e.mat;
  m.color.copy(c);

  if (m instanceof THREE.MeshStandardMaterial) {
    m.envMapIntensity = L.env;
    if (e.role === "screen") {
      // Screens: soft by day, bright at night, brighter while the room works; off when locked.
      const baseI = night ? 1.25 : L.time === "golden" ? 1.0 : 0.85;
      m.emissiveIntensity = e.emissive * baseI * (1 + 0.45 * work) * (1 - locked);
      m.color.copy(c).multiplyScalar(0.12 + 0.88 * (1 - locked));
    } else if (e.role === "lamp") {
      const on = L.lightsOn ? 1 : 0.06;
      m.emissiveIntensity = e.emissive * on * (1 - 0.9 * locked) * (night ? 1.6 : 1.1);
    } else if (e.role === "window") {
      m.emissive.copy(c);
      m.emissiveIntensity = (night ? 0.25 : L.time === "golden" ? 0.55 : 0.45) * (1 - 0.6 * locked);
      m.opacity = night ? 0.85 : 0.6;
    } else if (e.role === "glass") {
      m.opacity = e.opacity;
    }
    if (e.role === "accent" && done > 0) {
      // Done: a quiet glow on accent surfaces (the dept "light" stays on).
      m.emissive.copy(c);
      m.emissiveIntensity = 0.08 * done;
    } else if (e.role === "accent") {
      m.emissiveIntensity = 0;
    }
  } else {
    if (e.role === "pool") m.opacity = Math.min(1, e.opacity * (L.lightsOn ? (night ? 1.5 : 0.6) : 0)) * (1 - 0.9 * locked);
    else if (e.role === "workPool") m.opacity = e.opacity * (0.12 * done + 0.55 * work) * (night ? 1 : 0.8) * (1 - locked);
    else if (e.role === "shadow") m.opacity = e.opacity * (night ? 0.75 : 1);
  }
}

// ─────────────────────────────────────────────── geometry

const tmpM = new THREE.Matrix4();

export class Builder {
  readonly group = new THREE.Group();
  constructor(readonly q: Quality) {}

  private place<T extends THREE.Object3D>(o: T, pos: P3, parent: THREE.Object3D): T {
    o.position.set(...pos);
    parent.add(o);
    return o;
  }

  box(w: number, h: number, d: number, m: THREE.Material, pos: P3, r = 0, parent: THREE.Object3D = this.group, shadow = true): THREE.Mesh {
    const rad = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
    const g = rad > 0.002 ? new RoundedBoxGeometry(w, h, d, this.q === "high" ? 3 : 1, rad) : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    return this.place(mesh, pos, parent);
  }

  cyl(rt: number, rb: number, h: number, m: THREE.Material, pos: P3, seg = 24, parent: THREE.Object3D = this.group): THREE.Mesh {
    const s = this.q === "high" ? seg : Math.max(8, Math.round(seg * 0.5));
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return this.place(mesh, pos, parent);
  }

  sphere(r: number, m: THREE.Material, pos: P3, seg = 20, parent: THREE.Object3D = this.group): THREE.Mesh {
    const s = this.q === "high" ? seg : Math.max(8, Math.round(seg * 0.5));
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, s, Math.max(6, Math.round(s * 0.7))), m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return this.place(mesh, pos, parent);
  }

  /** Low-poly faceted blob (foliage). */
  blob(r: number, m: THREE.Material, pos: P3, detail = 1, parent: THREE.Object3D = this.group): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, this.q === "high" ? detail : 0), m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return this.place(mesh, pos, parent);
  }

  /** Vertical plane facing +Z (wall art, screens). */
  plane(w: number, h: number, m: THREE.Material, pos: P3, parent: THREE.Object3D = this.group): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.receiveShadow = true;
    return this.place(mesh, pos, parent);
  }

  /** Horizontal plane on the floor (decals: shadows, pools, rugs). */
  decal(w: number, d: number, m: THREE.Material, pos: P3, parent: THREE.Object3D = this.group, rotY = 0): THREE.Mesh {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    if (rotY) g.rotateY(rotY);
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = false;
    mesh.receiveShadow = m instanceof THREE.MeshStandardMaterial;
    mesh.renderOrder = 1;
    mesh.raycast = () => {};
    return this.place(mesh, pos, parent);
  }

  torus(R: number, r: number, m: THREE.Material, pos: P3, arc = Math.PI * 2, parent: THREE.Object3D = this.group): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(R, r, this.q === "high" ? 10 : 6, this.q === "high" ? 40 : 20, arc), m);
    mesh.castShadow = true;
    return this.place(mesh, pos, parent);
  }

  sub(pos: P3 = [0, 0, 0], rotY = 0, parent: THREE.Object3D = this.group): THREE.Group {
    const g = new THREE.Group();
    g.position.set(...pos);
    g.rotation.y = rotY;
    parent.add(g);
    return g;
  }
}

/**
 * Merge every static mesh under `src` into one mesh per (material, shadow flags, renderOrder).
 * Objects flagged `userData.keep = true` (agents, spinning props) are moved over intact.
 * Result: a few dozen draw calls for the whole office instead of ~1500.
 */
export function bake(src: THREE.Object3D): THREE.Group {
  src.updateMatrixWorld(true);
  const inv = src.matrixWorld.clone().invert();
  const out = new THREE.Group();
  out.name = src.name;
  type Bucket = { mat: THREE.Material; cast: boolean; recv: boolean; order: number; geos: THREE.BufferGeometry[]; noRay: boolean };
  const buckets = new Map<string, Bucket>();
  const kept: THREE.Object3D[] = [];
  const toDispose: THREE.BufferGeometry[] = [];

  const visit = (o: THREE.Object3D) => {
    for (const ch of o.children) {
      if (ch.userData.keep) {
        kept.push(ch);
        continue;
      }
      if (ch instanceof THREE.Mesh && !Array.isArray(ch.material)) {
        const noRay = ch.raycast !== THREE.Mesh.prototype.raycast;
        const k = `${ch.material.uuid}|${ch.castShadow}|${ch.receiveShadow}|${ch.renderOrder}|${noRay}`;
        let b = buckets.get(k);
        if (!b) {
          b = { mat: ch.material, cast: ch.castShadow, recv: ch.receiveShadow, order: ch.renderOrder, geos: [], noRay };
          buckets.set(k, b);
        }
        let g = ch.geometry as THREE.BufferGeometry;
        toDispose.push(g);
        g = g.index ? g.toNonIndexed() : g.clone();
        for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
        if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position!.count * 2), 2));
        if (!g.attributes.normal) g.computeVertexNormals();
        tmpM.multiplyMatrices(inv, ch.matrixWorld);
        g.applyMatrix4(tmpM);
        b.geos.push(g);
      }
      visit(ch);
    }
  };
  visit(src);

  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    mesh.renderOrder = b.order;
    if (b.noRay) mesh.raycast = () => {};
    out.add(mesh);
  }
  for (const k of kept) {
    const m = new THREE.Matrix4().multiplyMatrices(inv, k.matrixWorld);
    k.removeFromParent();
    m.decompose(k.position, k.quaternion, k.scale);
    out.add(k);
  }
  for (const g of new Set(toDispose)) g.dispose();
  return out;
}

export const mixHex = (a: string, b: string, k: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
