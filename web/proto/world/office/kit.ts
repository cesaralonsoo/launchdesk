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
  | "floor" // room floor: warm oak planks, faint dept tint
  | "corridor" // corridor: pale mineral stone (lighter than the oak rooms)
  | "wall" // matte plaster in the theme wall colour
  | "wallCap" // section-cut wall tops: deep charcoal, reads as an architectural model cut
  | "trim" // skirting / sills / thresholds: a shade under the wall colour
  | "accentWall" // painted feature wall in a muted dept colour
  | "rug" // woven rug: a deeper, desaturated dept tone
  | "accent" // dept colour, softened for upholstery and small objects
  | "accentSoft" // pale dept colour (cushions, binders)
  | "cloth" // character clothing: dept colour, tailored (a touch darker, less saturated)
  | "slab" // base of the architectural model
  | "slabCap" // the light top lip of the slab
  | "glass" // partitions / window panes
  | "skin" // character skin: never desaturated by the theme, only by locked rooms
  | "fixed" // natural materials (wood, steel, leaves) — only desaturated by mono themes / locked rooms
  | "screen" // emissive UI textures
  | "lamp" // lamp shades: glow when lights are on
  | "window" // window glass with sky light behind it
  | "pool" // additive light pool on the floor (lamps)
  | "workPool" // additive dept-coloured pool while the room works
  | "shadow" // contact shadows / AO decals
  | "led" // tiny always-on indicators
  | "vc"; // merged vertex-coloured material (fixed props / characters): colour lives in the vertices

export type Surfaces = { floor: string; wall: string; slab: string; glass: string; corridor: string };
type SurfKey = keyof Surfaces;
const SURF_KEYS: readonly SurfKey[] = ["floor", "wall", "slab", "glass", "corridor"];

/**
 * The resolved look, continuous in every factor so the day cycle can drive it ~10×/s.
 * Built once and mutated in place by `setLook()` — no allocations per call.
 */
export interface Look {
  s: Record<SurfKey, THREE.Color>;
  /** accentStrength 0..1 */
  acc: number;
  /** 0 = full day … 1 = full night (from the sky luminance). */
  dark: number;
  /** 0..1 warm low sun (from the key light colour). */
  warm: number;
  /** 0..1 interior lamps (AtmospherePreset.lightsOn, boolean or fractional fade). */
  lamps: number;
  /** envMapIntensity */
  env: number;
}

export const DEFAULT_SURFACES: Surfaces = {
  floor: "#F1EFEB",
  wall: "#FAF9F7",
  slab: "#D9D6D0",
  glass: "#DCE8F2",
  corridor: "#ECE6DC",
};

export function makeLook(): Look {
  const s = {} as Record<SurfKey, THREE.Color>;
  for (const k of SURF_KEYS) s[k] = hexInto(new THREE.Color(), DEFAULT_SURFACES[k]);
  return { s, acc: 0.85, dark: 0, warm: 0, lamps: 0, env: 0.22 };
}

/** Look used to bake vertex colours: neutral surfaces, accent strength 0.88, daylight. */
const NEUTRAL_LOOK: Look = Object.assign(makeLook(), { acc: 0.88 });

/** Parse "#rrggbb" / "#rgb" into `c` without allocating (falls back to Color.set for other CSS forms). */
export function hexInto(c: THREE.Color, v: string): THREE.Color {
  if (v.charCodeAt(0) === 35 && (v.length === 7 || v.length === 4)) {
    let n = 0;
    const short = v.length === 4;
    for (let i = 1; i < v.length; i++) {
      const ch = v.charCodeAt(i);
      const d = ch <= 57 ? ch - 48 : (ch | 32) - 87;
      if (d < 0 || d > 15) return c.set(v);
      n = short ? (n << 8) | (d << 4) | d : (n << 4) | d;
    }
    return c.setHex(n, THREE.SRGBColorSpace);
  }
  return c.set(v);
}

const lastSurf: Record<string, string> = {};
/** Write theme surfaces into the look (string compare first: unchanged strings cost nothing). */
export function setSurfaces(L: Look, s: Partial<Surfaces> | undefined) {
  for (const k of SURF_KEYS) {
    const v = s?.[k] ?? DEFAULT_SURFACES[k];
    if (lastSurf[k] === v) continue;
    lastSurf[k] = v;
    hexInto(L.s[k], v);
  }
}

export interface Entry {
  mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
  role: Role;
  room: Room | null;
  accent: THREE.Color; // dept colour of the owning room (or neutral), parsed once
  base: THREE.Color; // designed colour (fixed/screen/led/skin)
  shade: number; // brightness multiplier for variants of the same role
  opacity: number; // base opacity for transparent roles
  emissive: number; // base emissive intensity (screens, lamps)
  /** last resolved emissive intensity (screens pulse around it while the room works) */
  ei: number;
  /** vc only: desaturation uniform shared with the shader */
  uDesat?: { value: number };
}

export type VcBucket = "matte" | "satin" | "metal" | "figure";
const VC_PARAMS: Record<VcBucket, { rough: number; metal: number }> = {
  matte: { rough: 0.78, metal: 0 },
  satin: { rough: 0.42, metal: 0 },
  metal: { rough: 0.38, metal: 0.65 },
  figure: { rough: 0.74, metal: 0 },
};
/** One shared shader program for every vc material; per-material desaturation uniform. */
function vcCompile(this: THREE.Material, shader: { uniforms: Record<string, { value: unknown }>; fragmentShader: string }) {
  shader.uniforms.uDesat = (this.userData as { uDesat: { value: number } }).uDesat;
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nuniform float uDesat;")
    .replace("#include <color_fragment>", "#include <color_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), uDesat);");
}

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
const hsl = { h: 0, s: 0, l: 0 };
const NEUTRAL_ACCENT = new THREE.Color("#B9BCC2");
const WHITE = new THREE.Color("#FFFFFF");
const OAK = new THREE.Color("#C9A57C"); // warm natural oak
const STONE = new THREE.Color("#DDD8D0");
const CHARCOAL = new THREE.Color("#2A2B2F");
const RUG_BASE = new THREE.Color("#E6E0D6");
const SKY_DAY = new THREE.Color("#DCEBF7");
const SKY_GOLD = new THREE.Color("#FFD9A6");
const SKY_NIGHT = new THREE.Color("#1A2742");
const POOL_WARM = new THREE.Color("#FFC27A");
const POOL_NIGHT = new THREE.Color("#FFB869");
const SHADOW_DAY = new THREE.Color("#2A2620");
const BLACK = new THREE.Color("#000000");
const LAMP_GLOW = new THREE.Color("#FFD29A");

function desat(c: THREE.Color, k: number) {
  if (k <= 0) return c;
  c.getHSL(hsl);
  return c.setHSL(hsl.h, hsl.s * (1 - Math.min(1, k)), hsl.l);
}

/** Per-room dynamic mix values, animated by index.ts. */
export interface RoomMix {
  locked: number; // 0..1
  work: number; // 0..1
  done: number; // 0..1
}

export class Registry {
  readonly entries: Entry[] = [];
  /** Screen entries per room (pulsed every frame while the room works). */
  readonly screens = new Map<Room, Entry[]>();
  private byKey = new Map<string, Entry>();
  envMap: THREE.Texture | null = null;

  constructor(readonly quality: Quality) {}

  /** Get or create a lit material for `role` in `room`. `color` is only used by fixed/screen/led/skin roles. */
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
      if (role === "lamp") sm.emissive.copy(LAMP_GLOW);
      mat = sm;
    }
    const e: Entry = {
      mat,
      role,
      room,
      accent: new THREE.Color(accent),
      base: new THREE.Color(o.color ?? "#ffffff"),
      shade: o.shade ?? 1,
      opacity: o.opacity ?? (role === "glass" ? 0.28 : role === "window" ? 0.55 : 1),
      emissive: o.emissive ?? (role === "screen" ? 1 : role === "lamp" ? 1 : 0),
      ei: 0,
    };
    mat.name = role;
    if (role === "shadow" && o.map) {
      mat.userData.shadowMap = o.map;
      mat.userData.alpha = o.opacity ?? 1;
      mat.userData.room = room;
    }
    if (role === "fixed" && !o.map && mat instanceof THREE.MeshStandardMaterial) {
      const metal = o.metal ?? 0, rough = o.rough ?? 0.8;
      mat.userData.vcBucket = (metal >= 0.3 ? "metal" : rough < 0.5 ? "satin" : "matte") satisfies VcBucket;
      mat.userData.room = room;
    }
    if (this.envMap && mat instanceof THREE.MeshStandardMaterial) mat.envMap = this.envMap;
    this.entries.push(e);
    this.byKey.set(key, e);
    if (role === "screen" && room) {
      let l = this.screens.get(room);
      if (!l) this.screens.set(room, (l = []));
      l.push(e);
    }
    return mat;
  }

  /** The merged vertex-colour material of a room for a bucket (created on first use). */
  vc(room: Room | null, bucket: VcBucket, accent = "#B9BCC2"): THREE.MeshStandardMaterial {
    const key = `vc|${room ?? "-"}|${bucket}|${bucket === "figure" ? accent : ""}`;
    const hit = this.byKey.get(key);
    if (hit) return hit.mat as THREE.MeshStandardMaterial;
    const p = VC_PARAMS[bucket];
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: p.rough, metalness: p.metal });
    const uDesat = { value: 0 };
    mat.name = "vc";
    mat.userData.uDesat = uDesat;
    mat.onBeforeCompile = vcCompile as unknown as THREE.Material["onBeforeCompile"];
    mat.customProgramCacheKey = () => "ld-vc";
    if (this.envMap) mat.envMap = this.envMap;
    const e: Entry = { mat, role: "vc", room, accent: new THREE.Color(accent), base: new THREE.Color("#ffffff"), shade: 1, opacity: 1, emissive: 0, ei: 0, uDesat };
    this.entries.push(e);
    this.byKey.set(key, e);
    return mat;
  }

  /** One contact-shadow material per room and mask; each decal's strength lives in its vertex alpha. */
  shadowVC(room: Room | null, map: THREE.Texture): THREE.MeshBasicMaterial {
    const key = `shadowvc|${room ?? "-"}|${map.uuid}`;
    const hit = this.byKey.get(key);
    if (hit) return hit.mat as THREE.MeshBasicMaterial;
    const mat = new THREE.MeshBasicMaterial({ map, color: "#ffffff", vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.name = "shadowvc";
    const e: Entry = { mat, role: "shadow", room, accent: new THREE.Color("#B9BCC2"), base: new THREE.Color("#ffffff"), shade: 1, opacity: 1, emissive: 0, ei: 0 };
    this.entries.push(e);
    this.byKey.set(key, e);
    return mat;
  }

  /** A material's colour resolved for a neutral look (what gets baked into vertex colours). */
  colorOf(mat: THREE.Material, out: THREE.Color): THREE.Color {
    for (const e of this.entries) {
      if (e.mat !== mat) continue;
      resolveEntry(e, NEUTRAL_LOOK, undefined);
      return out.copy(e.mat.color);
    }
    return out.copy((mat as THREE.MeshStandardMaterial).color ?? WHITE);
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

  /** Recompute every material of `room` (or of the shell when room = null; all when undefined). Allocation-free. */
  resolve(look: Look, mixes: Map<Room, RoomMix>, only?: Room | null) {
    const list = this.entries;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      if (only !== undefined && e.room !== only) continue;
      resolveEntry(e, look, e.room ? mixes.get(e.room) : undefined);
    }
  }

  /** Screens of a working room breathe around their resolved brightness. */
  pulse(room: Room, k: number) {
    const l = this.screens.get(room);
    if (!l) return;
    for (const e of l) (e.mat as THREE.MeshStandardMaterial).emissiveIntensity = e.ei * k;
  }

  dispose() {
    for (const e of this.entries) e.mat.dispose();
    this.entries.length = 0;
    this.byKey.clear();
    this.screens.clear();
  }
}

function resolveEntry(e: Entry, L: Look, mix?: RoomMix) {
  const locked = mix?.locked ?? 0;
  const work = mix?.work ?? 0;
  const done = mix?.done ?? 0;
  const acc = L.acc;
  const dark = L.dark;
  const warm = L.warm;
  const lamps = L.lamps;
  const accent = e.accent;
  const c = tmpA;
  switch (e.role) {
    case "floor":
      // warm oak planks; a whisper of the theme floor and the dept colour
      c.copy(OAK).lerp(L.s.floor, 0.26).lerp(accent, 0.03 * acc);
      desat(c, (1 - acc) * 0.85);
      break;
    case "corridor":
      // pale mineral stone: lighter than the oak so the plan reads as rooms + street
      c.copy(STONE).lerp(L.s.corridor, 0.5);
      desat(c, (1 - acc) * 0.85);
      break;
    case "wall":
      c.copy(L.s.wall);
      break;
    case "wallCap":
      c.copy(CHARCOAL).lerp(L.s.wall, 0.06);
      break;
    case "trim":
      c.copy(L.s.wall).multiplyScalar(0.9);
      break;
    case "accentWall": {
      // one identity surface per room: the dept colour, muted and a little lighter (tasteful, never neon)
      const strong = desat(tmpB.copy(accent), 0.42).lerp(WHITE, 0.18);
      c.copy(L.s.wall).lerp(strong, Math.min(1, 1.05 * acc));
      break;
    }
    case "rug": {
      // a deeper woven tone of the dept colour on a natural wool base
      const tone = desat(tmpB.copy(accent), 0.42).multiplyScalar(0.92);
      c.copy(RUG_BASE).lerp(tone, Math.min(1, 0.85 * acc));
      break;
    }
    case "accent":
      desat(tmpB.copy(accent), 0.34).multiplyScalar(0.86);
      c.copy(NEUTRAL_ACCENT).lerp(tmpB, acc);
      break;
    case "cloth":
      desat(tmpB.copy(accent), 0.3).multiplyScalar(0.8);
      c.copy(NEUTRAL_ACCENT).multiplyScalar(0.75).lerp(tmpB, Math.max(0.35, acc));
      break;
    case "accentSoft":
      tmpB.copy(accent).lerp(WHITE, 0.5);
      desat(tmpB, 0.15);
      c.set(0xe6e7ea).lerp(tmpB, acc);
      break;
    case "slab":
      c.copy(L.s.slab).multiplyScalar(0.84);
      break;
    case "slabCap":
      c.copy(L.s.slab).lerp(WHITE, 0.6);
      break;
    case "glass":
      c.copy(L.s.glass).lerp(WHITE, 0.3);
      break;
    case "window":
      c.copy(SKY_DAY).lerp(SKY_GOLD, warm * (1 - dark)).lerp(SKY_NIGHT, dark);
      break;
    case "vc":
      c.copy(WHITE);
      break;
    case "skin":
    case "fixed":
    case "screen":
    case "led":
    case "lamp":
      c.copy(e.base);
      if (e.role === "fixed") desat(c, (1 - acc) * 0.75);
      break;
    case "shadow":
      c.copy(SHADOW_DAY).lerp(BLACK, dark);
      break;
    case "pool":
      c.copy(POOL_NIGHT).lerp(POOL_WARM, warm);
      break;
    case "workPool":
      c.copy(accent).lerp(WHITE, 0.15);
      break;
  }
  if (e.role === "vc") {
    // colour is in the vertices (resolved at acc ≈ 0.88): mono themes and locked rooms desaturate in the shader
    const d0 = (1 - acc) * 0.75;
    e.uDesat!.value = 1 - (1 - Math.max(0, d0)) * (1 - 0.62 * locked);
    c.multiplyScalar(1 - 0.12 * locked);
  } else if (e.role !== "pool" && e.role !== "workPool" && e.role !== "shadow" && e.role !== "led" && e.role !== "window") {
    c.multiplyScalar(e.shade);
    if (locked > 0) {
      desat(c, 0.62 * locked);
      c.multiplyScalar(1 - 0.12 * locked);
    }
  }
  if (e.role === "led" && locked > 0) c.multiplyScalar(1 - 0.85 * locked);

  const m = e.mat;
  m.color.copy(c);

  if (m instanceof THREE.MeshStandardMaterial) {
    m.envMapIntensity = e.role === "glass" || e.role === "window" ? L.env * 0.35 : L.env;
    if (e.role === "screen") {
      // soft by day, bright at night, brighter while the room works; off when locked
      const baseI = 0.8 + 0.55 * dark + 0.15 * warm;
      e.ei = e.emissive * baseI * (1 + 0.45 * work) * (1 - locked);
      m.emissiveIntensity = e.ei;
      m.color.copy(c).multiplyScalar(0.12 + 0.88 * (1 - locked));
    } else if (e.role === "lamp") {
      const on = 0.05 + lamps * (0.25 + 0.95 * dark + 0.3 * warm);
      e.ei = e.emissive * on * (1 - 0.9 * locked);
      m.emissiveIntensity = e.ei;
    } else if (e.role === "window") {
      m.emissive.copy(c);
      m.emissiveIntensity = (0.45 + 0.12 * warm - 0.22 * dark) * (1 - 0.6 * locked);
      m.opacity = 0.6 + 0.25 * dark;
    } else if (e.role === "glass") {
      m.opacity = e.opacity * (1 - 0.35 * dark);
    }
    if (e.role === "accent") {
      // done: a quiet glow on accent surfaces (the dept "light" stays on)
      m.emissive.copy(c);
      m.emissiveIntensity = (0.06 + 0.06 * dark) * done;
    }
  } else {
    if (e.role === "pool") m.opacity = Math.min(1, e.opacity * lamps * (0.25 + 1.25 * dark + 0.35 * warm)) * (1 - 0.9 * locked);
    else if (e.role === "workPool") m.opacity = e.opacity * (0.12 * done + 0.55 * work) * (0.8 + 0.35 * dark) * (1 - locked);
    else if (e.role === "shadow") m.opacity = e.opacity * (1 - 0.3 * dark);
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
export function bake(src: THREE.Object3D, R?: Registry): THREE.Group {
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
        const ud = ch.material.userData;
        const vb = R ? (ud.vcBucket as VcBucket | undefined) : undefined;
        const sm = R && !ch.userData.keep ? (ud.shadowMap as THREE.Texture | undefined) : undefined;
        const mat: THREE.Material = vb ? R!.vc(ud.room as Room | null, vb) : sm ? R!.shadowVC(ud.room as Room | null, sm) : ch.material;
        const k = `${mat.uuid}|${ch.castShadow}|${ch.receiveShadow}|${ch.renderOrder}|${noRay}`;
        let b = buckets.get(k);
        if (!b) {
          b = { mat, cast: ch.castShadow, recv: ch.receiveShadow, order: ch.renderOrder, geos: [], noRay };
          buckets.set(k, b);
        }
        let g = ch.geometry as THREE.BufferGeometry;
        toDispose.push(g);
        g = g.index ? g.toNonIndexed() : g.clone();
        for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
        if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position!.count * 2), 2));
        if (!g.attributes.normal) g.computeVertexNormals();
        if (vb) paintVertices(g, R!.colorOf(ch.material, tmpCol));
        else if (sm) paintVertices(g, tmpCol.set(0xffffff), ud.alpha as number);
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

const tmpCol = new THREE.Color();
/** Fill a geometry's `color` attribute with one (linear) colour. */
export function paintVertices(g: THREE.BufferGeometry, c: THREE.Color, alpha?: number) {
  const n = g.attributes.position!.count;
  const k = alpha === undefined ? 3 : 4;
  const a = new Float32Array(n * k);
  for (let i = 0; i < n; i++) {
    a[i * k] = c.r;
    a[i * k + 1] = c.g;
    a[i * k + 2] = c.b;
    if (k === 4) a[i * k + 3] = alpha!;
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(a, k));
}

/**
 * Merge the direct mesh children of an animated group (a limb, the head) into one vertex-coloured mesh.
 * `skip` meshes (eyes that blink) stay separate.
 */
export function mergeLimb(group: THREE.Object3D, mat: THREE.Material, R: Registry, skip: Set<THREE.Object3D>) {
  const geos: THREE.BufferGeometry[] = [];
  const victims: THREE.Mesh[] = [];
  let cast = false;
  for (const ch of group.children) {
    if (!(ch instanceof THREE.Mesh) || skip.has(ch) || Array.isArray(ch.material)) continue;
    ch.updateMatrix();
    let g = ch.geometry as THREE.BufferGeometry;
    g = g.index ? g.toNonIndexed() : g.clone();
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
    g.applyMatrix4(ch.matrix);
    paintVertices(g, R.colorOf(ch.material, tmpCol));
    geos.push(g);
    victims.push(ch);
    cast ||= ch.castShadow;
  }
  if (geos.length < 2) {
    for (const g of geos) g.dispose();
    return;
  }
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return;
  for (const v of victims) {
    v.geometry.dispose();
    v.removeFromParent();
  }
  merged.computeBoundingSphere();
  const m = new THREE.Mesh(merged, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  group.add(m);
}

export const mixHex = (a: string, b: string, k: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
