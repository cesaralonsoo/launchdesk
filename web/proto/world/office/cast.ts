// WS-OFFICE · v7 characters. These are the v5 figures César liked (git f9cb376 world/office/agents.ts): soft rounded
// bodies, a round head with two dot eyes, a hair cap and one accessory each, calm idle life (breathing, weight shift,
// glances, blinks). v7 changes only what the roster needs:
//   - a figure is built from a FigureLook (shirt colour from the roster, skin/hair/accessory from CAST), not a room
//   - it lives on a Spot (seat + stand, parent-local) that the office or the bedroom assigns
//   - ActorState drives the pose: absent · arriving (pop-in) · idle · working · presenting (paper up) · done · asleep
//   - pixel styles: cel-banded (3-step toon) shading and one vertex-coloured material per figure, so they sit in the
//     pixel-art world without losing their soft shapes
import * as THREE from "three";
import type { ActorId, ActorState, AnalystRole, Quality } from "../../contracts";
import { ROLE_LIBRARY, ROOM_META } from "../../contracts";
import { laptopScreenTex } from "./pixel";
import { isPixel } from "./style";
import { radialTex } from "./textures";

export type Accessory = "bun" | "glasses" | "long" | "topbun" | "beanie" | "headphones" | "none" | "cap" | "hood" | "ponytail" | "curly";
export interface FigureLook {
  shirt: string;
  skin: string;
  hair: string;
  accessory: Accessory;
  pants?: string;
  shoes?: string;
  /** Accessory colour (beanie, cap, hood). Defaults to a deeper shirt tone. */
  extra?: string;
}

/** Per-person looks. v5 people keep their v5 look (Mia, Leo, Sam, Nova, Dex, Rae, Pip); new analysts get their own. */
export const CAST: Record<ActorId, Omit<FigureLook, "shirt">> = {
  viability: { skin: "#F1C6A4", hair: "#3A2619", accessory: "bun" }, // Mia
  competition: { skin: "#C98E62", hair: "#1F1A17", accessory: "glasses" }, // Leo
  market: { skin: "#5C3A26", hair: "#141110", accessory: "none" }, // Sam
  demand: { skin: "#8D5B3E", hair: "#22160F", accessory: "ponytail" }, // Ava
  pricing: { skin: "#EBC3A0", hair: "#7A4A2A", accessory: "glasses" }, // Theo
  location: { skin: "#D9A27C", hair: "#2B1C14", accessory: "long" }, // Lola
  regulation: { skin: "#A86B4A", hair: "#1A1311", accessory: "curly" }, // Omar
  tech: { skin: "#E8B990", hair: "#141110", accessory: "headphones" }, // Kai
  scalability: { skin: "#F5D2B8", hair: "#5B3A6E", accessory: "topbun" }, // Iris
  nova: { skin: "#F5D2B8", hair: "#D9A441", accessory: "long" },
  dex: { skin: "#E0A982", hair: "#5A3825", accessory: "beanie", extra: "#B4462A" },
  rae: { skin: "#6E4630", hair: "#1A1311", accessory: "topbun" },
  pip: { skin: "#F2C7A5", hair: "#C4562B", accessory: "headphones" },
  founder: { skin: "#E2B08A", hair: "#3B2A20", accessory: "hood", pants: "#3A4150", extra: "#088F6A" },
};
/** The founder (you, the CEO) wears BCH green. */
export const FOUNDER_COLOR = "#0AC18E";
export function lookOf(id: ActorId, color?: string): FigureLook {
  const base = CAST[id];
  const shirt =
    color ??
    (id === "founder" ? FOUNDER_COLOR : id in ROLE_LIBRARY ? ROLE_LIBRARY[id as AnalystRole].color : ROOM_META[id as "nova"]?.color ?? "#94A3B8");
  return { ...base, shirt };
}

/** Where a figure lives, in its parent's coordinates. `sitIdle`: sits even when idle/done (bedroom spots, founder). */
export interface Spot {
  seat: { x: number; z: number; yaw: number };
  stand: { x: number; z: number; yaw: number };
  /** Seat height offset vs a 0.45 m chair (bed edge +, beanbag −). */
  sitY?: number;
  sitIdle?: boolean;
  /** Works on a laptop on the lap (bedroom). */
  lap?: boolean;
  /** Where to look when presenting (parent coords). */
  face?: { x: number; z: number };
  /** Works standing (writing on the pinboard) instead of sitting. */
  standWork?: boolean;
}

const PANTS = "#2F3440";
const SHOES = "#1D2027";
const EYES = "#1B1D22";
const WALK = 1.25; // m/s — unhurried
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const smooth = (x: number) => x * x * (3 - 2 * x);
const tmpC = new THREE.Color();
const hsl = { h: 0, s: 0, l: 0 };
/** The v5 "accent" treatment for clothing: the colour, a touch quieter. */
function clothOf(hex: string) {
  tmpC.set(hex).getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, hsl.s * 0.72, Math.min(0.62, hsl.l * 0.92));
}

let toonRamp: THREE.DataTexture | null = null;
function ramp() {
  if (toonRamp) return toonRamp;
  // 3 bands: shadow, mid, light (crisp, pixel-art style)
  const d = new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
  toonRamp = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.generateMipmaps = false;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

/** Merge the direct mesh children of `g` (except `skip`) into one vertex-coloured mesh. */
function mergeChildren(g: THREE.Object3D, mat: THREE.Material, colors: Map<THREE.Object3D, THREE.Color>, skip: Set<THREE.Object3D>) {
  const geos: THREE.BufferGeometry[] = [];
  const victims: THREE.Mesh[] = [];
  for (const ch of g.children) {
    if (!(ch instanceof THREE.Mesh) || skip.has(ch)) continue;
    ch.updateMatrix();
    let geo = ch.geometry as THREE.BufferGeometry;
    geo = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const n of Object.keys(geo.attributes)) if (n !== "position" && n !== "normal") geo.deleteAttribute(n);
    geo.applyMatrix4(ch.matrix);
    const c = colors.get(ch) ?? tmpC.set("#ffffff");
    const n = geo.attributes.position!.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) (a[i * 3] = c.r), (a[i * 3 + 1] = c.g), (a[i * 3 + 2] = c.b);
    geo.setAttribute("color", new THREE.Float32BufferAttribute(a, 3));
    geos.push(geo);
    victims.push(ch);
  }
  if (!geos.length) return;
  // manual merge (positions, normals, colours) — avoids BufferGeometryUtils attribute checks
  let count = 0;
  for (const geo of geos) count += geo.attributes.position!.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), colA = new Float32Array(count * 3);
  let o = 0;
  for (const geo of geos) {
    pos.set(geo.attributes.position!.array as Float32Array, o * 3);
    nor.set(geo.attributes.normal!.array as Float32Array, o * 3);
    colA.set(geo.attributes.color!.array as Float32Array, o * 3);
    o += geo.attributes.position!.count;
    geo.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colA, 3));
  merged.computeBoundingSphere();
  for (const v of victims) {
    v.geometry.dispose();
    v.removeFromParent();
  }
  const m = new THREE.Mesh(merged, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
}

export class Figure {
  readonly root = new THREE.Group();
  state: ActorState = "idle";
  /** 0..1 externally driven visibility scale (boom reveal, room rise). */
  presence = 1;

  private body = new THREE.Group();
  private hips = new THREE.Group();
  private chest = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private shinL = new THREE.Group();
  private shinR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private foreL = new THREE.Group();
  private foreR = new THREE.Group();
  private head = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private laptop = new THREE.Group();
  private paper: THREE.Mesh;
  private shadow: THREE.Mesh;
  private mats: THREE.Material[] = [];

  private pos = new THREE.Vector2();
  private target = new THREE.Vector2();
  private targetYaw = 0;
  private yaw = 0;
  private sit = 0;
  private sleep = 0;
  private walkPhase = 0;
  private walking = false;
  private hop = 0;
  private hopArms = 0;
  private pop = 1; // arriving pop-in 0 → 1
  private present = 0;
  private blink = 1 + Math.random() * 3;
  private seed: number;
  private lookT = 0;
  private lookYaw = 0;
  private lookYawTarget = 0;

  constructor(
    readonly id: ActorId,
    readonly look: FigureLook,
    public spot: Spot,
    q: Quality,
  ) {
    this.seed = (id.charCodeAt(0) * 1.7 + id.length * 3.1) % 10;
    const pixel = isPixel();
    const mat: THREE.Material = pixel
      ? new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp() })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74 });
    this.mats.push(mat);
    const colors = new Map<THREE.Object3D, THREE.Color>();
    const C = (hex: string) => new THREE.Color(hex);
    const shirt = clothOf(look.shirt);
    const skin = C(look.skin);
    const ear = C(look.skin).multiplyScalar(0.96);
    const hair = C(look.hair);
    const pants = C(look.pants ?? PANTS);
    const shoes = C(look.shoes ?? SHOES);
    const eyeC = C(EYES);
    const extra = look.extra ? C(look.extra) : shirt.clone().multiplyScalar(0.78);
    const seg = q === "high" ? 1 : 0.6;
    const tag = (m: THREE.Mesh, c: THREE.Color) => (colors.set(m, c), m);
    const cap = (r: number, len: number, c: THREE.Color, parent: THREE.Object3D, p: [number, number, number]) => {
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, Math.round(6 * seg), Math.round(16 * seg)), mat);
      mesh.position.set(...p);
      parent.add(mesh);
      return tag(mesh, c);
    };
    const sph = (r: number, c: THREE.Color, parent: THREE.Object3D, p: [number, number, number], s = 20) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, Math.round(s * seg), Math.round(s * 0.75 * seg)), mat);
      mesh.position.set(...p);
      parent.add(mesh);
      return tag(mesh, c);
    };

    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = 0.45;
    for (const [leg, shin, sx] of [[this.legL, this.shinL, -1], [this.legR, this.shinR, 1]] as const) {
      leg.position.set(sx * 0.085, 0, 0);
      cap(0.07, 0.12, pants, leg, [0, -0.09, 0]);
      shin.position.set(0, -0.19, 0);
      leg.add(shin);
      cap(0.064, 0.1, pants, shin, [0, -0.08, 0]);
      const shoe = tag(new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.08, 4, 10), mat), shoes);
      shoe.rotation.x = Math.PI / 2;
      shoe.position.set(0, -0.205, 0.035);
      shoe.scale.set(1.1, 1, 0.75);
      shin.add(shoe);
      this.hips.add(leg);
    }
    this.hips.add(this.chest);
    cap(0.165, 0.2, shirt, this.chest, [0, 0.23, 0]).scale.set(1, 1, 0.8);
    cap(0.155, 0.02, pants, this.chest, [0, 0.07, 0]).scale.set(1, 1, 0.8);
    for (const [arm, fore, sx] of [[this.armL, this.foreL, -1], [this.armR, this.foreR, 1]] as const) {
      arm.position.set(sx * 0.2, 0.42, 0);
      cap(0.05, 0.12, shirt, arm, [0, -0.08, 0]);
      fore.position.set(0, -0.17, 0);
      arm.add(fore);
      cap(0.045, 0.1, skin, fore, [0, -0.06, 0]);
      sph(0.05, skin, fore, [0, -0.15, 0.005], 12);
      arm.rotation.z = sx * 0.1;
      this.chest.add(arm);
    }
    cap(0.05, 0.04, skin, this.chest, [0, 0.5, 0]);
    if (look.accessory === "hood") {
      // the founder's hoodie: a hood collar resting behind the neck
      const hood = tag(new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.038, 8, Math.round(18 * seg)), mat), extra);
      hood.rotation.x = Math.PI / 2 + 0.35;
      hood.position.set(0, 0.5, -0.05);
      this.chest.add(hood);
    }
    this.head.position.y = 0.7;
    this.head.scale.setScalar(0.82); // calmer proportions: less toy, more figure (v5)
    this.chest.add(this.head);
    sph(0.2, skin, this.head, [0, 0, 0], 28).scale.set(1, 0.97, 0.94);
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), mat);
      tag(e, eyeC);
      e.position.set(sx * 0.072, -0.005, 0.18);
      e.scale.set(1, 1.3, 0.6);
      this.head.add(e);
      this.eyes.push(e);
      sph(0.03, ear, this.head, [sx * 0.195, -0.02, 0.0], 10).scale.set(0.5, 1, 0.8);
    }
    const hc = tag(new THREE.Mesh(new THREE.SphereGeometry(0.212, Math.round(28 * seg), Math.round(14 * seg), 0, Math.PI * 2, 0, Math.PI * 0.5), mat), hair);
    hc.rotation.x = -0.45;
    hc.position.set(0, 0.012, -0.016);
    this.head.add(hc);
    this.accessory(look, hair, extra, shirt, sph, tag, mat, seg);
    this.body.scale.setScalar(1.06);

    // eyes keep their own meshes (they blink); every other part merges per bone
    const skip = new Set<THREE.Object3D>(this.eyes);
    for (const g of [this.legL, this.legR, this.shinL, this.shinR, this.chest, this.armL, this.armR, this.foreL, this.foreR, this.head]) mergeChildren(g, mat, colors, skip);
    for (const e of this.eyes) {
      const geo = e.geometry;
      const n = geo.attributes.position!.count;
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) (a[i * 3] = eyeC.r), (a[i * 3 + 1] = eyeC.g), (a[i * 3 + 2] = eyeC.b);
      geo.setAttribute("color", new THREE.Float32BufferAttribute(a, 3));
    }

    // props: a laptop on the lap (bedroom work), a paper to present a finding
    const lapBase = new THREE.MeshStandardMaterial({ color: "#C9CDD3", roughness: 0.4, metalness: 0.3, flatShading: pixel });
    const lapScreen = new THREE.MeshStandardMaterial({ color: "#111", emissive: "#ffffff", emissiveMap: laptopScreenTex(look.shirt), emissiveIntensity: 1.1, roughness: 0.3 });
    this.mats.push(lapBase, lapScreen);
    const lb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.016, 0.21), lapBase);
    lb.position.set(0, 0.008, 0);
    const lid = new THREE.Group();
    lid.position.set(0, 0.016, -0.1);
    lid.rotation.x = -1.85;
    const ls = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.2), lapBase);
    ls.position.set(0, 0, 0.1);
    const lscr = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.17), lapScreen);
    lscr.rotation.x = -Math.PI / 2;
    lscr.position.set(0, -0.007, 0.1);
    lscr.rotation.y = Math.PI;
    lscr.rotation.z = Math.PI;
    lid.add(ls, lscr);
    this.laptop.add(lb, lid);
    this.laptop.position.set(0, 0.06, 0.2);
    this.laptop.visible = false;
    this.hips.add(this.laptop);
    const paperM = new THREE.MeshStandardMaterial({ color: "#FBFAF6", roughness: 0.9, flatShading: pixel });
    this.mats.push(paperM);
    this.paper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.008), paperM);
    this.paper.position.set(0, -0.2, 0.06);
    this.paper.visible = false;
    this.foreR.add(this.paper);

    // soft contact shadow that follows the figure
    const shM = new THREE.MeshBasicMaterial({ map: radialTex(), color: "#2A2620", transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mats.push(shM);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7).rotateX(-Math.PI / 2), shM);
    this.shadow.position.y = 0.008;
    this.shadow.renderOrder = 1;
    this.shadow.raycast = () => {};
    this.root.add(this.shadow);
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o !== this.shadow) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.root.userData.keep = true;
    this.root.userData.actor = id;

    this.snapTo(this.wantSeat() ? spot.seat : spot.stand);
  }

  private accessory(
    look: FigureLook, hair: THREE.Color, extra: THREE.Color, shirt: THREE.Color,
    sph: (r: number, c: THREE.Color, p: THREE.Object3D, pos: [number, number, number], s?: number) => THREE.Mesh,
    tag: (m: THREE.Mesh, c: THREE.Color) => THREE.Mesh, mat: THREE.Material, seg: number,
  ) {
    const h = this.head;
    const add = (geo: THREE.BufferGeometry, c: THREE.Color) => {
      const m = tag(new THREE.Mesh(geo, mat), c);
      h.add(m);
      return m;
    };
    const dark = new THREE.Color("#20242B");
    switch (look.accessory) {
      case "bun":
        sph(0.09, hair, h, [0, 0.15, -0.16], 16);
        break;
      case "topbun":
        sph(0.095, hair, h, [0, 0.24, -0.03], 16);
        break;
      case "ponytail": {
        sph(0.07, hair, h, [0, 0.1, -0.2], 14);
        const tail = add(new THREE.CapsuleGeometry(0.055, 0.14, 4, Math.round(12 * seg)), hair);
        tail.position.set(0, -0.04, -0.25);
        tail.rotation.x = 0.35;
        break;
      }
      case "curly":
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          sph(0.075, hair, h, [Math.sin(a) * 0.15, 0.13 + Math.cos(a * 2) * 0.02, Math.cos(a) * 0.13 - 0.03], 12);
        }
        break;
      case "long": {
        const back = add(new THREE.CapsuleGeometry(0.15, 0.16, 4, Math.round(16 * seg)), hair);
        back.position.set(0, -0.1, -0.08);
        back.scale.set(1.25, 1, 0.75);
        break;
      }
      case "glasses": {
        for (const sx of [-1, 1]) add(new THREE.TorusGeometry(0.048, 0.008, 6, 20), dark).position.set(sx * 0.072, -0.005, 0.19);
        add(new THREE.BoxGeometry(0.05, 0.01, 0.01), dark).position.set(0, 0, 0.198);
        break;
      }
      case "beanie": {
        const b = add(new THREE.SphereGeometry(0.218, Math.round(24 * seg), 12, 0, Math.PI * 2, 0, Math.PI * 0.46), extra);
        b.position.y = 0.03;
        b.rotation.x = -0.2;
        const fold = add(new THREE.TorusGeometry(0.2, 0.025, 6, Math.round(28 * seg)), extra);
        fold.rotation.x = Math.PI / 2 - 0.2;
        fold.position.set(0, 0.05, 0);
        break;
      }
      case "cap": {
        const c = add(new THREE.SphereGeometry(0.214, Math.round(24 * seg), 12, 0, Math.PI * 2, 0, Math.PI * 0.42), shirt);
        c.position.y = 0.025;
        const brim = add(new THREE.CylinderGeometry(0.13, 0.13, 0.016, Math.round(24 * seg), 1, false, -Math.PI / 2, Math.PI), shirt);
        brim.position.set(0, 0.08, 0.15);
        brim.scale.set(1, 1, 0.8);
        break;
      }
      case "headphones": {
        const band = add(new THREE.TorusGeometry(0.22, 0.018, 6, Math.round(24 * seg), Math.PI), new THREE.Color("#2C3037"));
        band.position.y = 0.01;
        for (const sx of [-1, 1]) {
          const cup = add(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 18), shirt);
          cup.rotation.z = Math.PI / 2;
          cup.position.set(sx * 0.21, -0.01, 0);
        }
        break;
      }
      default:
        break;
    }
  }

  private wantSeat(s: ActorState = this.state) {
    if (this.spot.standWork) return s === "asleep";
    return s === "working" || s === "asleep" || ((s === "idle" || s === "done" || s === "arriving") && !!this.spot.sitIdle);
  }

  private snapTo(p: { x: number; z: number; yaw: number }) {
    this.pos.set(p.x, p.z);
    this.target.copy(this.pos);
    this.yaw = this.targetYaw = p.yaw;
    this.root.position.set(p.x, 0, p.z);
    this.root.rotation.y = p.yaw;
  }

  /** Move to a new spot (roster change, seat change). */
  setSpot(spot: Spot, instant = false) {
    this.spot = spot;
    this.setState(this.state, instant);
  }

  /** Head position in parent space (for DOM tags), ~0.3 above the head. */
  headPoint(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.pos.x, this.headHeight() + 0.3, this.pos.y);
  }
  /** Hand position (paper pulses start here), parent space. */
  handPoint(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.pos.x, this.headHeight() - 0.35, this.pos.y);
  }
  private headHeight() {
    return 0.45 * 1.06 + (0.73 + 0.2) * 1.06 - smooth(this.sit) * (0.11 - (this.spot.sitY ?? 0)) - this.sleep * 0.22;
  }

  setState(s: ActorState, instant = false) {
    const prev = this.state;
    this.state = s;
    const seated = this.wantSeat(s);
    const sp = seated ? this.spot.seat : this.spot.stand;
    this.target.set(sp.x, sp.z);
    this.targetYaw = sp.yaw;
    if (s === "done" && !this.spot.sitIdle) this.targetYaw = Math.PI * 0.18; // turn gently to the viewer (v5)
    if (s === "presenting" && this.spot.face) this.targetYaw = Math.atan2(this.spot.face.x - sp.x, this.spot.face.z - sp.z);
    if (s === "done" && (prev === "working" || prev === "presenting") && !instant) this.hop = 1;
    if (s === "arriving" && prev !== "arriving") {
      this.pop = instant ? 1 : 0;
      if (!instant) (this.hop = 1), (this.hopArms = 1);
    }
    if (instant || prev === "absent" || s === "absent") {
      this.pos.copy(this.target);
      this.yaw = this.targetYaw;
      this.sit = seated ? 1 : 0;
      this.sleep = s === "asleep" ? 1 : 0;
      this.present = s === "presenting" ? 1 : 0;
    }
    this.root.visible = s !== "absent" && this.presence > 0.001;
  }

  cheer() {
    if (this.state === "asleep" || this.state === "absent") return;
    this.hop = 1;
    this.hopArms = 1;
  }

  /** Returns true while the figure is visibly in transition. */
  update(dt: number, t: number, still: boolean): boolean {
    const s = this.state;
    if (s === "absent") {
      this.root.visible = false;
      return false;
    }
    const wantSeat = this.wantSeat();
    let busy = false;
    const dx = this.target.x - this.pos.x;
    const dz = this.target.y - this.pos.y;
    const dist = Math.hypot(dx, dz);
    this.walking = false;
    if (dist > 0.01) {
      busy = true;
      this.sit = Math.max(0, this.sit - dt * 3);
      this.sleep = Math.max(0, this.sleep - dt * 3);
      if (this.sit < 0.05) {
        const step = Math.min(dist, WALK * dt);
        this.pos.x += (dx / dist) * step;
        this.pos.y += (dz / dist) * step;
        this.walking = dist > 0.02;
        this.yaw = this.turnTo(this.yaw, Math.atan2(dx, dz), dt, 9);
      }
    } else {
      this.yaw = this.turnTo(this.yaw, this.targetYaw, dt, 6);
      const sitT = wantSeat ? 1 : 0;
      if (Math.abs(this.sit - sitT) > 0.001) busy = true;
      this.sit = sitT > this.sit ? Math.min(1, this.sit + dt * 2.6) : Math.max(0, this.sit - dt * 3);
      this.sleep = damp(this.sleep, s === "asleep" ? 1 : 0, 3, dt);
    }
    if (this.walking) this.walkPhase += dt * 9.5;
    this.present = damp(this.present, s === "presenting" ? 1 : 0, 6, dt);
    if (this.pop < 1) {
      this.pop = Math.min(1, this.pop + dt / 0.5);
      busy = true;
    }

    this.root.position.set(this.pos.x, 0, this.pos.y);
    this.root.rotation.y = this.yaw;
    // arriving pop (back-out overshoot) × external presence (room rise / boom)
    const p = this.pop;
    const popS = p >= 1 ? 1 : 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);
    const sc = Math.max(0.001, popS * this.presence);
    this.root.scale.setScalar(sc);
    this.root.visible = this.presence > 0.001;

    const tt = still ? 0 : t;
    const breathe = Math.sin(tt * 1.9 + this.seed);
    const sitE = smooth(this.sit);
    const swing = this.walking ? Math.sin(this.walkPhase) * 0.55 : 0;
    const bob = this.walking ? Math.abs(Math.sin(this.walkPhase)) * 0.03 : 0;

    this.legL.rotation.x = (-Math.PI / 2) * sitE + swing;
    this.legR.rotation.x = (-Math.PI / 2) * sitE - swing;
    this.shinL.rotation.x = (Math.PI / 2) * sitE + Math.max(0, -swing) * 0.6;
    this.shinR.rotation.x = (Math.PI / 2) * sitE + Math.max(0, swing) * 0.6;
    this.body.position.y = bob - sitE * (0.11 - (this.spot.sitY ?? 0));
    this.body.position.z = -sitE * 0.06;
    const working = s === "working" && sitE > 0.6;
    const sleeping = this.sleep;
    const lap = working && !!this.spot.lap;
    this.laptop.visible = lap;

    this.chest.rotation.x = (working ? 0.1 : 0) + sleeping * 0.62 + (still ? 0 : breathe * (0.012 + sleeping * 0.02));
    this.chest.scale.set(1, 1 + (still ? 0 : breathe * 0.012), 1);
    this.hips.rotation.z = !this.walking && sitE < 0.1 && !still ? Math.sin(tt * 0.45 + this.seed) * 0.025 : 0;

    let aL = -swing * 0.8, aR = swing * 0.8, fL = -0.15, fR = -0.15, zL = -0.1, zR = 0.1;
    if (working) {
      // typing: upper arms forward, forearms level, small alternating taps (v5); on a lap, a little lower
      const lo = lap ? 0.2 : 0;
      aL = -0.55 + lo + Math.sin(tt * 15 + 0.3) * 0.04;
      aR = -0.55 + lo + Math.sin(tt * 15 + 2.0) * 0.04;
      fL = -0.95 + lo + Math.max(0, Math.sin(tt * 15)) * 0.12;
      fR = -0.95 + lo + Math.max(0, Math.sin(tt * 15 + 1.7)) * 0.12;
      zL = -0.05;
      zR = 0.05;
    } else if (sleeping > 0.5) {
      aL = aR = -0.95 * sleeping;
      fL = fR = -1.35 * sleeping;
      zL = 0.45;
      zR = -0.45;
    } else if (sitE > 0.5) {
      aL = aR = -0.45;
      fL = fR = -0.6;
    } else if (!this.walking) {
      aL = breathe * 0.03;
      aR = -breathe * 0.03;
    }
    // standing work (pinboard): the right hand writes on the board in small strokes
    if (s === "working" && this.spot.standWork && !this.walking) {
      aR = -1.9 + (still ? 0 : Math.sin(tt * 3.1) * 0.12);
      fR = -0.35 + (still ? 0 : Math.sin(tt * 5.3) * 0.1);
      zR = 0.18;
    }
    // presenting: the right hand holds a paper up towards the founder / board
    const pk = this.present;
    if (pk > 0.01) {
      aR = aR * (1 - pk) + (-1.25 + (still ? 0 : Math.sin(tt * 2.2) * 0.05)) * pk;
      fR = fR * (1 - pk) + -0.55 * pk;
      zR = zR * (1 - pk) + 0.12 * pk;
    }
    this.paper.visible = pk > 0.3;
    if (this.hop > 0 && this.hopArms > 0) {
      const k = Math.sin(Math.min(1, (1 - this.hop) * 3) * Math.PI * 0.5) * this.hop;
      aL = aL * (1 - k) - 2.7 * k;
      aR = aR * (1 - k) - 2.7 * k;
      zL = -0.1 - 0.35 * k;
      zR = 0.1 + 0.35 * k;
      fL = fR = -0.1;
    }
    this.armL.rotation.set(aL, 0, zL);
    this.armR.rotation.set(aR, 0, zR);
    this.foreL.rotation.x = fL;
    this.foreR.rotation.x = fR;

    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.lookT = 2.2 + ((Math.sin(this.seed * 13.1 + t) + 1) / 2) * 3.5;
      const r = Math.sin(this.seed * 7.7 + t * 1.3);
      this.lookYawTarget = s === "working" ? r * 0.12 : r * 0.55;
    }
    this.lookYaw = damp(this.lookYaw, still || pk > 0.5 ? 0 : this.lookYawTarget, 2.5, dt);
    this.head.rotation.y = sleeping > 0.5 ? 0 : this.lookYaw;
    this.head.rotation.x = working ? (lap ? 0.32 : 0.16) + Math.sin(tt * 2.1) * 0.03 : sleeping * 0.35;
    this.head.rotation.z = sleeping * 0.42 + (s === "idle" && !still ? Math.sin(tt * 0.7 + this.seed) * 0.03 : 0);

    if (this.hop > 0) {
      busy = true;
      this.hop = Math.max(0, this.hop - dt * 0.85);
      if (this.hop === 0) this.hopArms = 0;
      const ph = (1 - this.hop) * Math.PI * 2;
      this.body.position.y += Math.max(0, Math.sin(ph)) * 0.16 * this.hop;
    }

    this.blink -= dt;
    const closed = sleeping > 0.5 || (!still && this.blink < 0.11);
    if (this.blink < 0) this.blink = 2.4 + ((Math.sin(this.seed * 3 + t) + 1) / 2) * 3;
    for (const e of this.eyes) e.scale.y = closed ? 0.18 : 1.3;
    return busy || !still;
  }

  private turnTo(a: number, b: number, dt: number, k: number) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * (1 - Math.exp(-k * dt));
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.root.removeFromParent();
  }
}
