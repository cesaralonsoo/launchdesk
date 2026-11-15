// WS-CHARACTERS · v7 characters: cute chibi figures in the spirit of the original mock-up (.notes/ref-maqueta),
// a bit more polished. Big round head (≈44 % of the height) with a simple friendly face (two glossy dot eyes,
// rosy cheeks, a tiny smile), a soft bean body in the department colour, stubby arms and legs, varied hair and skin.
//   - a figure is built from a FigureLook (shirt colour from the roster, skin/hair/cut/accessory from CAST)
//   - it lives on a Spot (seat + stand, parent-local) that the office or the bedroom assigns
//   - ActorState drives the pose: absent · arriving (pop-in) · idle · working · presenting (paper up) · done · asleep
//   - life: breathing, blinks, glances and head tilts, typing, walking with a bounce, writing on the pinboard,
//     squash-and-stretch hops (hire / done / cheer), a slow sleepy sway
// Geometry is merged per bone into one vertex-coloured mesh (eyes stay separate so they can blink): ~12 draw calls
// per figure, the same budget as before.
import * as THREE from "three";
import type { ActorId, ActorState, AnalystRole, Quality } from "../../contracts";
import { ROLE_LIBRARY, ROOM_META } from "../../contracts";
import type { AtmospherePreset } from "../../contracts";
import { YAW as CAM_YAW } from "../camera";
import { laptopScreenTex } from "./pixel";
import { isPixel } from "./style";
import { radialTex } from "./textures";

export type Accessory = "bun" | "glasses" | "long" | "topbun" | "beanie" | "headphones" | "none" | "cap" | "hood" | "ponytail" | "curly";
/** Base haircut under the accessory. short: crop with a side swoop · bob: rounder, covers the ears · spiky: tufts. */
export type Cut = "short" | "bob" | "spiky";
export interface FigureLook {
  shirt: string;
  skin: string;
  hair: string;
  accessory: Accessory;
  cut?: Cut;
  pants?: string;
  shoes?: string;
  /** Accessory colour (beanie, cap, hood). Defaults to a deeper shirt tone. */
  extra?: string;
}

/** Per-person looks: varied skin tones, hair colours and cuts; the shirt always comes from the department colour. */
export const CAST: Record<ActorId, Omit<FigureLook, "shirt">> = {
  viability: { skin: "#F1C6A4", hair: "#3A2619", accessory: "bun", cut: "bob" }, // Mia
  competition: { skin: "#C98E62", hair: "#1F1A17", accessory: "glasses", cut: "short" }, // Leo
  market: { skin: "#5C3A26", hair: "#141110", accessory: "none", cut: "spiky" }, // Sam
  demand: { skin: "#8D5B3E", hair: "#22160F", accessory: "ponytail", cut: "bob" }, // Ava
  pricing: { skin: "#EBC3A0", hair: "#7A4A2A", accessory: "glasses", cut: "spiky" }, // Theo
  location: { skin: "#D9A27C", hair: "#2B1C14", accessory: "long", cut: "bob" }, // Lola
  regulation: { skin: "#A86B4A", hair: "#1A1311", accessory: "curly", cut: "short" }, // Omar
  tech: { skin: "#E8B990", hair: "#141110", accessory: "headphones", cut: "short" }, // Kai
  scalability: { skin: "#F5D2B8", hair: "#5B3A6E", accessory: "topbun", cut: "bob" }, // Iris
  nova: { skin: "#F5D2B8", hair: "#D9A441", accessory: "long", cut: "bob" },
  dex: { skin: "#E0A982", hair: "#5A3825", accessory: "beanie", cut: "short", extra: "#B4462A" },
  rae: { skin: "#6E4630", hair: "#1A1311", accessory: "topbun", cut: "bob" },
  pip: { skin: "#F2C7A5", hair: "#C4562B", accessory: "headphones", cut: "spiky" },
  founder: { skin: "#E2B08A", hair: "#3B2A20", accessory: "hood", cut: "short", pants: "#3A4150", extra: "#088F6A" },
};
/** The founder (you, the CEO) wears BCH green. */
export const FOUNDER_COLOR = "#0AC18E";
export function lookOf(id: ActorId, color?: string): FigureLook {
  const base = CAST[id] ?? CAST.competition;
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

/** Night lift: a small light-independent glow so faces stay readable in the dark (shared by every figure). */
const FIG_LIFT = { value: 0 };
/** Called from the office / bedroom applyAtmosphere: lifts the figures a touch as the key light fades. */
export function setFigureAtmosphere(a: AtmospherePreset) {
  const k = Math.min(1, Math.max(0, (2.6 - a.key.intensity) / 2.2));
  FIG_LIFT.value = 0.04 + 0.2 * k * (a.lightsOn ? 1 : 0.7);
}
function figureMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFigLift = FIG_LIFT;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uFigLift;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uFigLift;");
  };
  m.customProgramCacheKey = () => "ld-figure";
  return m;
}
const wrapA = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const clampA = (a: number, m: number) => (a > m ? m : a < -m ? -m : a);
const SHOES = "#F4F1EA";
const EYES = "#1E1B22";
const WALK = 1.25; // m/s — unhurried
/** Overall figure scale: ~1.3 m tall, the same footprint as the desks and chairs were tuned for. */
const S = 1.12;
// skeleton (unscaled, metres)
const HIP_Y = 0.31; // hip pivot above the floor, standing
const CHEST_H = 0.34; // hips → head pivot
const HEAD_R = 0.26; // head radius
const HEAD_C = 0.25; // head pivot → head centre
const SEAT_HIP = 0.38; // hip pivot height when seated on a 0.45 chair (cushion top ≈ 0.355)
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const smooth = (x: number) => x * x * (3 - 2 * x);
const tmpC = new THREE.Color();
const hsl = { h: 0, s: 0, l: 0 };
/** Clothing: the department colour, solid and friendly (a touch softer than the UI accent). */
function clothOf(hex: string) {
  tmpC.set(hex).getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, Math.min(0.78, hsl.s * 0.88), Math.min(0.6, Math.max(0.3, hsl.l * 0.96)));
}
/** Trousers: a deeper, calmer take on the department colour, so from above each figure reads as one coloured shape. */
function pantsOf(hex: string) {
  tmpC.set(hex).getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, Math.min(0.5, hsl.s * 0.62), Math.min(0.34, Math.max(0.17, hsl.l * 0.52)));
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
    const own = colors.get(ch);
    for (const n of Object.keys(geo.attributes)) if (n !== "position" && n !== "normal" && (n !== "color" || own)) geo.deleteAttribute(n);
    geo.applyMatrix4(ch.matrix);
    if (own || !geo.attributes.color) {
      const c = own ?? tmpC.set("#ffffff");
      const n = geo.attributes.position!.count;
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) (a[i * 3] = c.r), (a[i * 3 + 1] = c.g), (a[i * 3 + 2] = c.b);
      geo.setAttribute("color", new THREE.Float32BufferAttribute(a, 3));
    }
    geos.push(geo);
    victims.push(ch);
  }
  if (!geos.length) return;
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

type V3 = [number, number, number];
const Z = new THREE.Vector3(0, 0, 1);

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
  private walkK = 0;
  private hop = 0;
  private hopArms = 0;
  private pop = 1; // arriving pop-in 0 → 1
  private present = 0;
  private blink = 1 + Math.random() * 3;
  private seed: number;
  private lookT = 0;
  private lookYaw = 0;
  private lookYawTarget = 0;
  private tilt = 0;
  private tiltTarget = 0;
  /** Glance-back to the viewer (periodic) and "notice" (a finding just landed): 0..1 weights. */
  private glanceT = 3;
  private glanceLeft = 0;
  private glanceK = 0;
  private noticeLeft = 0;
  private twist = 0;
  /** Extra size (the floor shows figures a touch bigger so they read at the overview distance). */
  size = 1;

  constructor(
    readonly id: ActorId,
    readonly look: FigureLook,
    public spot: Spot,
    q: Quality,
  ) {
    this.seed = (id.charCodeAt(0) * 1.7 + id.length * 3.1) % 10;
    const pixel = isPixel();
    const mat: THREE.Material = figureMaterial();
    this.mats.push(mat);
    const colors = new Map<THREE.Object3D, THREE.Color>();
    const C = (hex: string) => new THREE.Color(hex);
    const shirt = clothOf(look.shirt);
    const shirtDeep = shirt.clone().multiplyScalar(0.84);
    const skin = C(look.skin);
    const hair = C(look.hair).lerp(C("#7A5136"), 0.2);
    const pants = look.pants ? C(look.pants) : pantsOf(look.shirt);
    const shoes = C(look.shoes ?? SHOES);
    const sole = C("#3A3F4A");
    const eyeC = C(EYES);
    const extra = look.extra ? C(look.extra) : shirt.clone().multiplyScalar(0.78);
    const hi = q === "high";
    const tag = (m: THREE.Mesh, c: THREE.Color) => (colors.set(m, c), m);
    /** Ellipsoid: a sphere of radius r scaled by s. */
    const ball = (r: number, c: THREE.Color, parent: THREE.Object3D, p: V3, s: V3 = [1, 1, 1], seg = 20) => {
      const n = Math.max(8, Math.round(seg * (hi ? 1 : 0.65)));
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, n, Math.round(n * 0.75)), mat);
      mesh.position.set(...p);
      mesh.scale.set(...s);
      parent.add(mesh);
      return tag(mesh, c);
    };
    const pill = (r: number, len: number, c: THREE.Color, parent: THREE.Object3D, p: V3, s: V3 = [1, 1, 1]) => {
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, hi ? 6 : 4, hi ? 16 : 10), mat);
      mesh.position.set(...p);
      mesh.scale.set(...s);
      parent.add(mesh);
      return tag(mesh, c);
    };
    // a point on the head sphere (head-local), from angles: yaw (0 = front, + = figure's left… we use x sign) and pitch
    const HC = new THREE.Vector3(0, HEAD_C, 0);
    const onHead = (x: number, y: number, rr = HEAD_R) => {
      const z = Math.sqrt(Math.max(0, rr * rr - x * x - y * y));
      return { p: new THREE.Vector3(x, y + HEAD_C, z), n: new THREE.Vector3(x, y, z).normalize() };
    };
    const decal = (mesh: THREE.Mesh, x: number, y: number, lift = 0) => {
      const { p, n } = onHead(x, y);
      mesh.position.copy(p).addScaledVector(n, lift);
      mesh.quaternion.setFromUnitVectors(Z, n);
      return mesh;
    };

    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = HIP_Y;
    // legs: short soft pillars and round sneakers
    for (const [leg, shin, sx] of [[this.legL, this.shinL, -1], [this.legR, this.shinR, 1]] as const) {
      leg.position.set(sx * 0.078, -0.02, 0);
      pill(0.064, 0.07, pants, leg, [0, -0.07, 0]);
      shin.position.set(0, -0.13, 0);
      leg.add(shin);
      pill(0.06, 0.05, pants, shin, [0, -0.04, 0]);
      ball(0.072, shoes, shin, [0, -0.125, 0.03], [1, 0.62, 1.35], 16);
      ball(0.07, sole, shin, [0, -0.145, 0.03], [1.02, 0.28, 1.36], 14);
      this.hips.add(leg);
    }
    // pants seat (the shirt bean sits over it)
    ball(0.15, pants, this.hips, [0, 0.02, -0.005], [1.06, 0.55, 0.9]);
    this.hips.add(this.chest);
    // torso: a soft bean in the department colour, a collar band, a tiny pocket for character
    pill(0.152, 0.08, shirt, this.chest, [0, 0.19, 0], [1.08, 1, 0.88]);
    ball(0.11, shirtDeep, this.chest, [0, 0.33, 0], [1.05, 0.32, 0.95], 16);
    for (const [arm, fore, sx] of [[this.armL, this.foreL, -1], [this.armR, this.foreR, 1]] as const) {
      arm.position.set(sx * 0.175, 0.29, 0);
      ball(0.06, shirt, arm, [0, -0.01, 0], [1, 1, 1], 14);
      pill(0.054, 0.07, shirt, arm, [0, -0.06, 0]);
      fore.position.set(0, -0.11, 0);
      arm.add(fore);
      pill(0.047, 0.05, skin, fore, [0, -0.035, 0]);
      ball(0.058, skin, fore, [0, -0.085, 0.004], [1, 1, 0.9], 14);
      arm.rotation.z = sx * 0.12;
      this.chest.add(arm);
    }
    if (look.accessory === "hood") {
      // the founder's hoodie: a soft hood rolled behind the neck, drawstrings and a kangaroo pocket
      ball(0.17, extra, this.chest, [0, 0.34, -0.07], [1.1, 0.5, 0.85], 16);
      for (const sx of [-1, 1]) pill(0.009, 0.07, C("#F4F1EA"), this.chest, [sx * 0.045, 0.24, 0.13]);
      ball(0.09, shirtDeep, this.chest, [0, 0.1, 0.125], [1.25, 0.6, 0.3], 12);
    }

    // head: the big round head, a simple friendly face
    this.head.position.y = CHEST_H;
    this.chest.add(this.head);
    ball(HEAD_R, skin, this.head, [0, HEAD_C, 0], [1.04, 0.97, 1], 28);
    for (const sx of [-1, 1]) ball(0.045, skin.clone().multiplyScalar(0.94), this.head, [sx * 0.262, HEAD_C - 0.02, 0.0], [0.55, 1, 0.8], 12);
    const cheek = C(look.skin).lerp(C("#FF7F7A"), 0.42);
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.031, 14, 10), mat);
      e.scale.set(1, 1.38, 0.55);
      decal(e, sx * 0.088, -0.01, -0.006);
      // catchlights: a big and a tiny white dot so the eyes look glossy on every skin tone (blink with the eye)
      const g1 = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 8, 6), mat);
      g1.position.set(0.011, 0.012, 0.024);
      const g2 = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 6, 4), mat);
      g2.position.set(-0.01, -0.012, 0.025);
      for (const g of [g1, g2]) {
        const gn = g.geometry.attributes.position!.count;
        g.geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(gn * 3).fill(1), 3));
        e.add(g);
      }
      this.head.add(e);
      this.eyes.push(e);
      const ck = ball(0.038, cheek, this.head, [0, 0, 0], [1.25, 0.72, 0.28], 12);
      decal(ck, sx * 0.148, -0.072, -0.004);
    }
    // a tiny smile (a half torus)
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0075, 6, 14, Math.PI), mat);
    smile.geometry.rotateZ(Math.PI);
    tag(smile, C(look.skin).lerp(C("#5A2A26"), 0.7));
    decal(smile, 0, -0.07, -0.002);
    this.head.add(smile);
    this.hair(look, hair, HC);
    this.accessory(look, hair, extra, shirt, ball, pill);
    this.body.scale.setScalar(S);

    // eyes keep their own meshes (they blink); every other part merges per bone
    const skip = new Set<THREE.Object3D>(this.eyes);
    for (const g of [this.hips, this.legL, this.legR, this.shinL, this.shinR, this.chest, this.armL, this.armR, this.foreL, this.foreR, this.head]) mergeChildren(g, mat, colors, skip);
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
    this.laptop.position.set(0, 0.075, 0.2);
    this.laptop.scale.setScalar(0.85);
    this.laptop.visible = false;
    this.hips.add(this.laptop);
    const paperM = new THREE.MeshStandardMaterial({ color: "#FBFAF6", roughness: 0.9, flatShading: pixel });
    this.mats.push(paperM);
    this.paper = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.008), paperM);
    this.paper.position.set(0, -0.15, 0.06);
    this.paper.visible = false;
    this.foreR.add(this.paper);

    // soft contact shadow that follows the figure
    const shM = new THREE.MeshBasicMaterial({ map: radialTex(), color: "#2A2620", transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mats.push(shM);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.66).rotateX(-Math.PI / 2), shM);
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

  /** Hair: an offset ellipsoid "helmet" that leaves the face clear (a soft hairline), plus a fringe for the cut. */
  private hair(look: FigureLook, hair: THREE.Color, HC: THREE.Vector3) {
    const mat = this.mats[0]!;
    const h = this.head;
    const add = (r: number, p: V3, s: V3, rot: V3 = [0, 0, 0], seg = 22) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), mat);
      m.position.set(p[0] + HC.x, p[1] + HC.y, p[2] + HC.z);
      m.scale.set(...s);
      m.rotation.set(...rot);
      h.add(m);
      const n = m.geometry.attributes.position!.count;
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) (a[i * 3] = hair.r), (a[i * 3 + 1] = hair.g), (a[i * 3 + 2] = hair.b);
      m.geometry.setAttribute("color", new THREE.Float32BufferAttribute(a, 3));
      return m;
    };
    const cut = look.cut ?? "short";
    if (look.accessory === "beanie" || look.accessory === "cap") {
      // under a hat: only a short back and two side tufts show
      add(0.27, [0, 0.0, -0.05], [1.04, 0.92, 1]);
      for (const sx of [-1, 1]) add(0.055, [sx * 0.225, -0.05, 0.03], [0.6, 1.1, 0.9], [0, 0, sx * 0.2], 12);
      return;
    }
    if (look.accessory === "curly") {
      add(0.275, [0, 0.055, -0.065], [1.04, 0.95, 1]);
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        add(0.085, [Math.sin(a) * 0.2, 0.17 + Math.cos(a * 2) * 0.02, Math.cos(a) * 0.17 - 0.04], [1, 0.9, 1], [0, 0, 0], 12);
      }
      add(0.1, [0, 0.25, -0.02], [1.2, 0.8, 1.1], [0, 0, 0], 14);
      add(0.07, [-0.08, 0.21, 0.16], [1.1, 0.8, 0.9], [0, 0, 0], 12);
      add(0.07, [0.08, 0.215, 0.15], [1.1, 0.8, 0.9], [0, 0, 0], 12);
      return;
    }
    if (cut === "bob") {
      add(0.284, [0, 0.045, -0.055], [1.06, 0.98, 1]);
      // fringe: two soft swoops parted off-centre
      add(0.13, [-0.07, 0.165, 0.15], [1.25, 0.48, 0.62], [-0.45, 0, 0.18], 16);
      add(0.11, [0.1, 0.17, 0.14], [1.15, 0.45, 0.6], [-0.45, 0, -0.25], 16);
      // side locks framing the cheeks
      for (const sx of [-1, 1]) add(0.075, [sx * 0.235, -0.05, 0.06], [0.62, 1.55, 0.95], [0, 0, sx * 0.08], 14);
    } else if (cut === "spiky") {
      add(0.272, [0, 0.07, -0.06], [1.03, 0.95, 1]);
      // soft tufts: short rounded drops leaning forward (no sharp cones), a row on top and a second one behind
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 0.078;
        const e = Math.abs(i - 2);
        add(0.062, [x, 0.3 - e * 0.035, 0.05 - e * 0.025], [0.95, 1.45, 0.9], [0.55, 0, -x * 2.6], 12);
      }
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * 0.085;
        add(0.058, [x, 0.29 - Math.abs(i - 1.5) * 0.03, -0.09], [0.95, 1.3, 0.9], [-0.2, 0, -x * 2.4], 12);
      }
      add(0.1, [0.05, 0.19, 0.15], [1.4, 0.45, 0.6], [-0.5, 0, -0.2], 14);
    } else {
      // short: a neat crop with a side swoop
      add(0.274, [0, 0.07, -0.065], [1.035, 0.95, 1]);
      add(0.12, [-0.06, 0.19, 0.14], [1.5, 0.5, 0.7], [-0.5, 0, 0.22], 16);
      add(0.06, [0.15, 0.17, 0.13], [1.1, 0.6, 0.7], [-0.4, 0, -0.3], 12);
    }
  }

  private accessory(
    look: FigureLook, hair: THREE.Color, extra: THREE.Color, shirt: THREE.Color,
    ball: (r: number, c: THREE.Color, parent: THREE.Object3D, p: V3, s?: V3, seg?: number) => THREE.Mesh,
    pill: (r: number, len: number, c: THREE.Color, parent: THREE.Object3D, p: V3, s?: V3) => THREE.Mesh,
  ) {
    const h = this.head;
    const y0 = HEAD_C;
    const dark = new THREE.Color("#262A33");
    const tagged = (m: THREE.Mesh, c: THREE.Color) => {
      const n = m.geometry.attributes.position!.count;
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) (a[i * 3] = c.r), (a[i * 3 + 1] = c.g), (a[i * 3 + 2] = c.b);
      m.geometry.setAttribute("color", new THREE.Float32BufferAttribute(a, 3));
      h.add(m);
      return m;
    };
    const mat = this.mats[0]!;
    switch (look.accessory) {
      case "bun":
        ball(0.09, hair, h, [0, y0 + 0.2, -0.2], [1, 1, 1], 16);
        ball(0.035, extra, h, [0, y0 + 0.155, -0.17], [1.6, 0.6, 1], 10);
        break;
      case "topbun":
        ball(0.095, hair, h, [0, y0 + 0.31, -0.03], [1, 0.92, 1], 16);
        ball(0.06, extra, h, [0, y0 + 0.245, -0.03], [1.3, 0.5, 1.3], 12);
        break;
      case "ponytail":
        ball(0.04, extra, h, [0, y0 + 0.12, -0.27], [1.3, 1, 1], 10);
        pill(0.06, 0.16, hair, h, [0, y0 - 0.02, -0.32], [1, 1, 0.85]).rotation.x = 0.35;
        ball(0.055, hair, h, [0, y0 - 0.13, -0.36], [1, 1, 0.85], 12);
        break;
      case "long":
        // long hair down the back and over the shoulders
        pill(0.2, 0.1, hair, h, [0, y0 - 0.12, -0.1], [1.12, 1, 0.55]);
        for (const sx of [-1, 1]) pill(0.06, 0.14, hair, h, [sx * 0.23, y0 - 0.12, -0.04], [0.75, 1, 1]);
        break;
      case "glasses": {
        for (const sx of [-1, 1]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.009, 6, 20), mat);
          const z = Math.sqrt(HEAD_R * HEAD_R - 0.088 * 0.088 - 0.0001) + 0.018;
          ring.position.set(sx * 0.088, y0 - 0.008, z);
          ring.rotation.y = sx * 0.3;
          tagged(ring, dark);
        }
        const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.06, 6), mat);
        bridge.rotation.z = Math.PI / 2;
        bridge.position.set(0, y0 + 0.004, 0.268);
        tagged(bridge, dark);
        break;
      }
      case "beanie": {
        ball(0.282, extra, h, [0, y0 + 0.11, -0.02], [1.05, 0.86, 1.03], 24);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.262, 0.04, 8, 28), mat);
        rim.rotation.x = Math.PI / 2 + 0.1;
        rim.position.set(0, y0 + 0.13, -0.01);
        rim.scale.set(1.07, 1.04, 1);
        tagged(rim, extra.clone().multiplyScalar(0.82));
        ball(0.055, C2("#F4F1EA"), h, [0, y0 + 0.37, -0.02], [1, 1, 1], 12);
        break;
      }
      case "cap":
        ball(0.28, shirt, h, [0, y0 + 0.08, -0.01], [1.04, 0.82, 1.03], 24);
        ball(0.17, shirt, h, [0, y0 + 0.1, 0.22], [1, 0.12, 0.9], 16);
        break;
      case "headphones": {
        const band = new THREE.Color("#2C3037");
        const arc = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.022, 8, 26, Math.PI), mat);
        arc.position.set(0, y0 + 0.0, 0.0);
        arc.scale.set(1.0, 1.08, 1);
        tagged(arc, band);
        for (const sx of [-1, 1]) {
          ball(0.075, band, h, [sx * 0.285, y0 - 0.01, 0], [0.55, 1, 1], 14);
          ball(0.06, shirt, h, [sx * 0.31, y0 - 0.01, 0], [0.4, 0.85, 0.85], 12);
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

  /** A finding just landed: look up at the viewer for a moment, with a happy blink. */
  notice() {
    if (this.state === "asleep" || this.state === "absent") return;
    this.noticeLeft = 1.8;
    this.blink = Math.min(this.blink, 0.1);
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
    return out.set(this.pos.x, this.headHeight() - 0.62, this.pos.y);
  }
  private sitLift() {
    return SEAT_HIP + (this.spot.sitY ?? 0) - HIP_Y * S;
  }
  /** Top of the head (parent space), following sitting and sleeping. */
  private headHeight() {
    const sitK = smooth(this.sit);
    const h = (HIP_Y + CHEST_H + HEAD_C + HEAD_R) * S + sitK * this.sitLift() - this.sleep * 0.2;
    return h * this.size - (this.size - 1) * (SEAT_HIP + (this.spot.sitY ?? 0)) * sitK;
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
    if (s === "done" && (prev === "working" || prev === "presenting") && !instant) (this.hop = 1), (this.hopArms = 1);
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
    if (this.walking) this.walkPhase += dt * 11;
    this.walkK = damp(this.walkK, this.walking ? 1 : 0, 10, dt);
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
    const sc = Math.max(0.001, popS * this.presence * this.size);
    this.root.scale.setScalar(sc);
    // a bigger figure still sits on the same seat height
    this.root.position.y = -(this.size - 1) * (SEAT_HIP + (this.spot.sitY ?? 0)) * smooth(this.sit);
    this.root.visible = this.presence > 0.001;

    const tt = still ? 0 : t;
    const breathe = Math.sin(tt * 1.9 + this.seed);
    const sitE = smooth(this.sit);
    const wk = this.walkK;
    const swing = Math.sin(this.walkPhase) * 0.7 * wk;
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.045 * wk;

    this.legL.rotation.x = (-Math.PI / 2) * sitE + swing;
    this.legR.rotation.x = (-Math.PI / 2) * sitE - swing;
    // seated: chibi legs are short, so the shins dangle and kick softly
    const kick = sitE > 0.6 && !still && s !== "asleep" ? Math.sin(tt * 1.6 + this.seed) * 0.12 : 0;
    this.shinL.rotation.x = (Math.PI / 2) * sitE * 0.85 + Math.max(0, -swing) * 0.7 + kick;
    this.shinR.rotation.x = (Math.PI / 2) * sitE * 0.85 + Math.max(0, swing) * 0.7 - kick;
    this.body.position.y = bob + sitE * this.sitLift();
    this.body.position.z = -sitE * 0.05;
    const working = s === "working" && sitE > 0.6;
    const sleeping = this.sleep;
    const lap = working && !!this.spot.lap;
    this.laptop.visible = lap;

    this.chest.rotation.x = (working ? 0.06 : 0) + sleeping * 0.5 + wk * 0.06 + (still ? 0 : breathe * (0.012 + sleeping * 0.025));
    const br = still ? 0 : breathe * (0.014 + sleeping * 0.01);
    this.chest.scale.set(1 - br * 0.4, 1 + br, 1 - br * 0.4);
    // weight shift when standing, a little rock while walking
    this.hips.rotation.z = sitE < 0.1 && !still ? Math.sin(tt * 0.45 + this.seed) * 0.025 * (1 - wk) + Math.sin(this.walkPhase) * 0.06 * wk : 0;
    this.hips.rotation.y = Math.sin(this.walkPhase) * 0.08 * wk;

    let aL = -swing * 0.9, aR = swing * 0.9, fL = -0.2, fR = -0.2, zL = -0.12, zR = 0.12;
    if (working) {
      // typing: hands forward on the keys, small alternating taps; on a lap, a little lower
      const lo = lap ? 0.25 : 0;
      aL = -0.8 + lo + Math.sin(tt * 15 + 0.3) * 0.05;
      aR = -0.8 + lo + Math.sin(tt * 15 + 2.0) * 0.05;
      fL = -0.75 + lo * 0.6 + Math.max(0, Math.sin(tt * 15)) * 0.16;
      fR = -0.75 + lo * 0.6 + Math.max(0, Math.sin(tt * 15 + 1.7)) * 0.16;
      zL = 0.12;
      zR = -0.12;
    } else if (sleeping > 0.5) {
      // arms folded on the desk as a pillow
      aL = aR = -1.15 * sleeping;
      fL = fR = -1.2 * sleeping;
      zL = 0.5;
      zR = -0.5;
    } else if (sitE > 0.5) {
      // hands resting on the lap, with a little fidget
      aL = -0.5 + (still ? 0 : Math.sin(tt * 0.9 + this.seed) * 0.04);
      aR = -0.5 + (still ? 0 : Math.sin(tt * 0.9 + this.seed + 1) * 0.04);
      fL = fR = -0.55;
      zL = 0.08;
      zR = -0.08;
    } else if (wk < 0.5) {
      aL = breathe * 0.04;
      aR = -breathe * 0.04;
      // done: a tiny happy sway with arms out
      if (s === "done") {
        const sw = still ? 0 : Math.sin(tt * 2.4 + this.seed);
        zL = -0.28 - sw * 0.06;
        zR = 0.28 - sw * 0.06;
      }
    }
    // standing work (pinboard): the right hand writes on the board in small strokes, the left points at it
    if (s === "working" && this.spot.standWork && !this.walking) {
      aR = -2.05 + (still ? 0 : Math.sin(tt * 3.1) * 0.12);
      fR = -0.3 + (still ? 0 : Math.sin(tt * 5.3) * 0.12);
      zR = 0.15;
      aL = -0.35;
      fL = -0.9;
      zL = -0.05;
    }
    // presenting: the right hand holds a paper up towards the founder / board, the left points at it
    const pk = this.present;
    if (pk > 0.01) {
      const wob = still ? 0 : Math.sin(tt * 2.2) * 0.05;
      aR = aR * (1 - pk) + (-1.45 + wob) * pk;
      fR = fR * (1 - pk) + -0.35 * pk;
      zR = zR * (1 - pk) + 0.05 * pk;
      aL = aL * (1 - pk) + -1.0 * pk;
      fL = fL * (1 - pk) + -0.4 * pk;
      zL = zL * (1 - pk) + 0.35 * pk;
    }
    this.paper.visible = pk > 0.3;
    this.paper.rotation.x = -(aR + fR) * pk;
    if (this.hop > 0 && this.hopArms > 0) {
      const k = Math.sin(Math.min(1, (1 - this.hop) * 3) * Math.PI * 0.5) * this.hop;
      const wave = still ? 0 : Math.sin(tt * 14) * 0.15 * k;
      aL = aL * (1 - k) - 2.75 * k;
      aR = aR * (1 - k) - 2.75 * k;
      zL = zL * (1 - k) + (-0.45 + wave) * k;
      zR = zR * (1 - k) + (0.45 - wave) * k;
      fL = fR = -0.1;
    }
    this.armL.rotation.set(aL, 0, zL);
    this.armR.rotation.set(aR, 0, zR);
    this.foreL.rotation.x = fL;
    this.foreR.rotation.x = fR;

    // where the viewer is, relative to the body (parents are unrotated; the camera keeps its fixed azimuth)
    const toCam = wrapA(CAM_YAW - this.yaw);
    const camHead = clampA(toCam, 1.15);
    const resting = !this.walking && sleeping < 0.5;
    // glances and curious head tilts; at rest the head leans towards the viewer so the faces read
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.lookT = 2.2 + ((Math.sin(this.seed * 13.1 + t) + 1) / 2) * 3.5;
      const r = Math.sin(this.seed * 7.7 + t * 1.3);
      this.lookYawTarget = s === "working" ? r * 0.14 : r * 0.4;
      this.tiltTarget = s === "working" ? 0 : Math.sin(this.seed * 5.3 + t * 2.1) * 0.12;
    }
    // every few seconds a worker glances back at you (staggered by seed); a landed finding makes them look up
    if (!still && resting) {
      this.glanceT -= dt;
      if (this.glanceT <= 0) {
        this.glanceLeft = 1.1 + (this.seed % 3) * 0.15;
        this.glanceT = (s === "working" ? 4.5 : 6) + ((Math.sin(this.seed * 9.1 + t * 0.7) + 1) / 2) * 3.5 + this.glanceLeft;
      }
    }
    this.glanceLeft = Math.max(0, this.glanceLeft - dt);
    this.noticeLeft = Math.max(0, this.noticeLeft - dt);
    const glanceOn = resting && (this.glanceLeft > 0 || this.noticeLeft > 0) ? 1 : 0;
    this.glanceK = damp(this.glanceK, glanceOn, 7, dt);
    let base = 0;
    if (resting && s !== "working") base = camHead * (pk > 0.5 ? 0.45 : 0.7);
    else if (resting && still) base = clampA(camHead * 0.5, 0.6);
    const wander = still || pk > 0.5 ? 0 : this.lookYawTarget;
    this.lookYaw = damp(this.lookYaw, base + wander * (1 - this.glanceK * 0.8), 2.5, dt);
    this.tilt = damp(this.tilt, still ? 0 : this.tiltTarget, 2, dt);
    const gk = smooth(this.glanceK);
    this.head.rotation.y = sleeping > 0.5 ? 0 : this.lookYaw * (1 - gk) + camHead * gk;
    // standing figures turn their shoulders a little too (pinboard, presenting), seated ones only the head
    this.twist = damp(this.twist, (1 - sitE) * (resting ? 1 : 0) * clampA(toCam - camHead + toCam * 0.25, 0.7) * gk, 6, dt);
    this.root.rotation.y = this.yaw + this.twist;
    if (sleeping <= 0.5) this.head.rotation.y -= this.twist;
    this.head.rotation.x = (working ? (lap ? 0.2 : 0.1) + Math.sin(tt * 2.1) * 0.03 : sleeping * 0.3 + (pk > 0.5 ? -0.08 : 0)) * (1 - gk) - gk * 0.12;
    this.head.rotation.z = sleeping * (0.38 + (still ? 0 : Math.sin(tt * 0.8) * 0.04)) + this.tilt * (1 - sleeping) + Math.sin(this.walkPhase) * 0.05 * wk;

    // hop with squash and stretch
    let sq = 0;
    if (this.hop > 0) {
      busy = true;
      this.hop = Math.max(0, this.hop - dt * 0.85);
      if (this.hop === 0) this.hopArms = 0;
      const ph = (1 - this.hop) * Math.PI * 2;
      const up = Math.sin(ph);
      this.body.position.y += Math.max(0, up) * 0.18 * this.hop;
      sq = (up > 0 ? up * 0.06 : up * 0.08) * this.hop; // stretch going up, squash on landing
    }
    this.body.scale.set(S * (1 - sq * 0.6), S * (1 + sq), S * (1 - sq * 0.6));

    this.blink -= dt;
    const closed = sleeping > 0.5 || (!still && this.blink < 0.12);
    if (this.blink < 0) this.blink = 2.4 + ((Math.sin(this.seed * 3 + t) + 1) / 2) * 3;
    for (const e of this.eyes) e.scale.y = closed ? 0.18 : 1.38;
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

function C2(hex: string) {
  return new THREE.Color(hex);
}
