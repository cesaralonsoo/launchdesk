// WS-OFFICE · level 0: the founder's bedroom, a cosy pixel-art diorama where every idea starts.
// Contract: BedroomModel in ../../contracts.ts. Root origin = centre of the 6 × 5 m room floor (the world places it on
// BEDROOM_FOOTPRINT, i.e. exactly on the lobby). Nothing above y = 2.6.
//
// What is in it: a bed, the founder's desk with a laptop (the same spot as the CEO desk on the floor), a window with a
// little skyline that follows the day cycle (warm lit windows and a moon at night), fairy lights, posters, a plant,
// a cork pinboard with the company's working title on an index card. Analysts pop in around the room as they are
// hired (bed edge, beanbag, window bench, pinboard, door chair) and work on laptops on their laps. Each finding lands
// as a paper on the pinboard and stays there as a coloured sticky note: the evidence piles up where you can see it.
//
// setBoom(k): 150 ms laptop flash → the walls fold outward → furniture bursts into pixel cubes → gone.
import * as THREE from "three";
import type { ActorId, ActorState, Analyst, AtmospherePreset, BedroomModel, BedroomSpot, CompanySign, CreateBedroomModel, FindingKind } from "../../contracts";
import { BEDROOM_FOOTPRINT, BEDROOM_SPOTS } from "../../contracts";
import { Figure, lookOf, type Spot } from "../office/cast";
import { CubeBurst, KIND_TONE, Papers } from "../office/fx";
import { envProbe } from "../office/index";
import { bake, Builder, lookFromAtmosphere, makeLook, Registry, type RoomMix } from "../office/kit";
import { corkTex, drawPinNote, PixelCanvas, posterTex, skylineTex, wallpaperTex } from "../office/pixel";
import { accent, accentSoft, C, deskLamp, framed, fx, lampShade, laptopDesk, plant, rug, shadowRect, shadowRound, taskChair, type Ctx } from "../office/props";
import { isPixel, isVoxel, resolveStyle, setStyle } from "../office/style";
import { planksTex, radialTex, softRectTex } from "../office/textures";

const W = BEDROOM_FOOTPRINT.w, D = BEDROOM_FOOTPRINT.d;
const HX = W / 2, HZ = D / 2;
const WALL_H = 2.4;
const WALL_T = 0.14;
const PAD = 0.3;
const KEY = "bed";
const ACCENT = "#E58E5A"; // warm terracotta: the room's own colour (duvet, curtains, beanbag)

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const win = (k: number, a: number, b: number) => clamp01((k - a) / (b - a));
const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const ARRIVE_MS = 900;

/** Spots in hire order (contracts BEDROOM_SPOTS): bed edge · beanbag · window bench · pinboard · door chair. */
const FOUNDER: Spot = { seat: { x: -2.2, z: 0.35, yaw: Math.PI / 2 }, stand: { x: -1.25, z: 1.05, yaw: Math.PI / 3 }, sitIdle: true, face: { x: 0, z: 2 } };
const FACE_FOUNDER = { x: -2.0, z: 0.35 };
const yawTo = (x: number, z: number) => Math.atan2(FACE_FOUNDER.x - x, FACE_FOUNDER.z - z);
const SPOTS: Record<Exclude<BedroomSpot, "desk">, Spot> = {
  s0: { seat: { x: 1.42, z: -1.15, yaw: -Math.PI / 2 }, stand: { x: 0.85, z: -0.7, yaw: yawTo(0.85, -0.7) }, sitY: 0.09, sitIdle: true, lap: true, face: FACE_FOUNDER },
  s1: { seat: { x: 0.45, z: 1.5, yaw: yawTo(0.45, 1.5) }, stand: { x: -0.35, z: 1.05, yaw: yawTo(-0.35, 1.05) }, sitY: -0.08, sitIdle: true, lap: true, face: FACE_FOUNDER },
  s2: { seat: { x: -0.7, z: -2.08, yaw: yawTo(-0.7, -2.08) * 0.6 }, stand: { x: -0.7, z: -1.6, yaw: yawTo(-0.7, -1.6) }, sitY: 0, sitIdle: true, lap: true, face: FACE_FOUNDER },
  s3: { seat: { x: -2.25, z: -1.25, yaw: -Math.PI / 2 }, stand: { x: -2.25, z: -1.25, yaw: -Math.PI / 2 }, standWork: true, face: FACE_FOUNDER },
  s4: { seat: { x: 2.25, z: 1.55, yaw: yawTo(2.25, 1.55) }, stand: { x: 1.9, z: 1.2, yaw: yawTo(1.9, 1.2) }, sitY: 0, sitIdle: true, lap: true, face: FACE_FOUNDER },
};

interface Actor {
  id: ActorId;
  fig: Figure;
  state: ActorState;
  arriveT: number;
}
interface Piece {
  g: THREE.Group;
  base: THREE.Vector3;
  delay: number;
  color: string;
}

export const createBedroomModel: CreateBedroomModel = (opts) => {
  const q = opts.quality;
  setStyle(resolveStyle());
  const still = opts.still ?? (typeof location !== "undefined" && /[?&]still=1\b/.test(location.search));
  const R = new Registry(q);
  const root = new THREE.Group();
  root.name = "bedroom";
  const look = makeLook();
  const mix: RoomMix = { locked: 0, work: 0, done: 0 };
  const mixes = new Map<string, RoomMix>([[KEY, mix]]);
  const ctx = (B: Builder, color = ACCENT): Ctx => ({ R, B, room: KEY, color });

  // ── plinth + floor (the plinth matches the office slab, so the boom reads as the same model growing)
  const base = new THREE.Group();
  {
    const B = new Builder(q);
    const NEU = "#B9BCC2";
    const sw = W + PAD * 2, sd = D + PAD * 2;
    B.box(sw, 0.05, sd, R.m("slabCap", null, NEU, { rough: 0.55 }), [0, -0.075, 0], 0.012);
    const body = B.box(sw - 0.02, 0.36, sd - 0.02, R.m("slab", null, NEU, { rough: 0.7 }), [0, -0.106 - 0.18, 0], 0.01);
    body.castShadow = true;
    B.box(sw - 0.3, 0.09, sd - 0.3, R.m("slab", null, NEU, { rough: 0.9, shade: 0.45 }), [0, -0.505, 0], 0, undefined, false);
    const floor = B.box(W, 0.05, D, R.m("floor", KEY, "#C9A57C", { map: planksTex(), rough: 0.6 }), [0, -0.025, 0], 0, undefined, false);
    uv(floor, W / 1.3, D / 1.3);
    B.decal(sw + 1.8, sd + 1.8, R.m("shadow", null, NEU, { map: softRectTex(), opacity: 0.38 }), [0, -0.548, 0.3]);
    base.add(bake(B.group, R));
  }
  root.add(base);

  // ── walls: two groups pivoting on their outer bottom edge, so they can fold outward
  const wallBack = new THREE.Group();
  wallBack.position.set(0, 0, -HZ - WALL_T);
  const wallLeft = new THREE.Group();
  wallLeft.position.set(-HX - WALL_T, 0, 0);
  const pin = new PixelCanvas(48, 32, isPixel());
  const stickies: THREE.Mesh[] = [];
  const stickyMats: THREE.MeshLambertMaterial[] = [];
  let stickyN = 0;
  const PIN_C = new THREE.Vector3(-HX + 0.02, 1.45, -1.45); // pinboard centre (root-local)
  {
    // back wall (room-local coordinates, then baked into the pivot group's frame)
    const B = new Builder(q);
    const c = ctx(B);
    const paper = R.m("fixed", KEY, ACCENT, { color: "#F3E6D4", map: wallpaperTex(), rough: 0.95, key: "paperB" });
    const wz = -HZ - WALL_T / 2;
    const seg = (x0: number, x1: number, y0: number, y1: number) => {
      const m = B.box(x1 - x0, y1 - y0, WALL_T, paper, [(x0 + x1) / 2, (y0 + y1) / 2, wz]);
      uv(m, (x1 - x0) / 0.6, (y1 - y0) / 0.6);
    };
    const WX0 = -1.5, WX1 = 0.1, WY0 = 1.0, WY1 = 1.95;
    seg(-HX - WALL_T, WX0, 0, WALL_H);
    seg(WX1, HX, 0, WALL_H);
    seg(WX0, WX1, 0, WY0);
    seg(WX0, WX1, WY1, WALL_H);
    B.box(W + WALL_T, 0.03, WALL_T + 0.004, R.m("wallCap", KEY, ACCENT, { rough: 0.85 }), [-WALL_T / 2, WALL_H + 0.015, wz], 0, undefined, false);
    B.box(W, 0.09, 0.02, R.m("trim", KEY, ACCENT, { rough: 0.7 }), [0, 0.045, -HZ + 0.01], 0, undefined, false);
    // window: sky, skyline, lit windows (glow at night), moon, frame, sill, curtains
    const ww = WX1 - WX0, wh = WY1 - WY0, wcx = (WX0 + WX1) / 2, wcy = (WY0 + WY1) / 2;
    const sky = B.plane(ww, wh, R.m("window", KEY, ACCENT, {}), [wcx, wcy, wz - 0.03]);
    sky.receiveShadow = false;
    const skyMat = R.m("fixed", KEY, ACCENT, { color: "#56607A", map: skylineTex(false), rough: 1, key: "skyline" }) as THREE.MeshStandardMaterial;
    skyMat.transparent = true;
    skyMat.alphaTest = 0.5;
    B.plane(ww, wh * 0.62, skyMat, [wcx, WY0 + wh * 0.31, wz - 0.02]).receiveShadow = false;
    B.plane(ww, wh * 0.62, R.m("glow", KEY, ACCENT, { color: "#3D4656", map: skylineTex(true) }), [wcx, WY0 + wh * 0.31, wz - 0.019]).receiveShadow = false;
    B.box(0.13, 0.13, 0.01, R.m("glow", KEY, ACCENT, { color: "#E8EEF8", key: "moon" }), [wcx + 0.45, WY1 - 0.2, wz - 0.025], 0, undefined, false);
    const frame = fx(c, "#F7F4EE", 0.6);
    B.box(ww + 0.1, 0.06, 0.08, frame, [wcx, WY0 - 0.03, wz + 0.05]);
    B.box(ww + 0.1, 0.06, 0.08, frame, [wcx, WY1 + 0.03, wz + 0.05]);
    for (const x of [WX0 - 0.03, WX1 + 0.03, wcx]) B.box(x === wcx ? 0.04 : 0.06, wh, 0.06, frame, [x, wcy, wz + 0.04]);
    B.box(ww + 0.24, 0.035, 0.2, frame, [wcx, WY0 - 0.06, wz + 0.14]);
    plant(c, B.group, [wcx - 0.45, WY0 - 0.04, wz + 0.15], "small", C.terracotta);
    for (const x of [WX0 - 0.17, WX1 + 0.17]) B.box(0.2, wh + 0.4, 0.05, accentSoft(c), [x, wcy - 0.12, wz + 0.12]);
    B.box(ww + 0.7, 0.03, 0.03, fx(c, C.oakDark, 0.6), [wcx, WY1 + 0.16, wz + 0.15]);
    // posters
    framed(c, B.group, [-2.35, 1.5, wz + WALL_T / 2 + 0.02], 0, posterTex("rocket"), 0.45, 0.6, "#F7F4EE");
    framed(c, B.group, [1.55, 1.72, wz + WALL_T / 2 + 0.02], 0, posterTex("ship"), 0.42, 0.56, C.ink);
    framed(c, B.group, [2.25, 1.62, wz + WALL_T / 2 + 0.02], 0, posterTex("bch"), 0.32, 0.42, "#F7F4EE");
    // fairy lights along the top of the back wall
    const bead = R.m("lamp", KEY, ACCENT, { color: "#FFF1C9", rough: 0.4 });
    for (let i = 0; i < 18; i++) {
      const x = -HX + 0.2 + (i / 17) * (W - 0.4);
      const y = 2.2 - Math.abs(Math.sin((i / 17) * Math.PI * 3)) * 0.12;
      B.box(0.045, 0.045, 0.045, bead, [x, y, wz + WALL_T / 2 + 0.03], 0, undefined, false);
    }
    const baked = bake(B.group, R);
    baked.position.set(0, 0, HZ + WALL_T);
    wallBack.add(baked);
  }
  {
    // left wall + pinboard + shelf
    const B = new Builder(q);
    const c = ctx(B);
    const paper = R.m("fixed", KEY, ACCENT, { color: "#EFCFB6", map: wallpaperTex(), rough: 0.95, key: "paperL" });
    const wx = -HX - WALL_T / 2;
    const m = B.box(WALL_T, WALL_H, D, paper, [wx, WALL_H / 2, 0]);
    uv(m, D / 0.6, WALL_H / 0.6);
    B.box(WALL_T + 0.004, 0.03, D, R.m("wallCap", KEY, ACCENT, { rough: 0.85 }), [wx, WALL_H + 0.015, 0], 0, undefined, false);
    B.box(0.02, 0.09, D, R.m("trim", KEY, ACCENT, { rough: 0.7 }), [-HX + 0.01, 0.045, 0], 0, undefined, false);
    // pinboard (cork, oak frame)
    const pb = B.sub([PIN_C.x, PIN_C.y, PIN_C.z], Math.PI / 2);
    B.box(1.36, 0.9, 0.04, fx(c, C.oakDark, 0.6), [0, 0, 0], 0, pb);
    B.plane(1.28, 0.82, R.m("fixed", KEY, ACCENT, { map: corkTex(), rough: 1, key: "cork" }), [0, 0, 0.021], pb);
    // shelf over the desk with books and a plant
    const sh = B.sub([-HX + 0.16, 1.62, 0.55], Math.PI / 2);
    B.box(1.1, 0.03, 0.24, fx(c, C.oak, 0.55), [0, 0, 0], 0, sh);
    const books = [accent(c, 0.7), fx(c, "#3B82F6", 0.8), fx(c, "#E9E3D8", 0.8), fx(c, "#3A3D44", 0.7), fx(c, "#0AC18E", 0.7)];
    let x = -0.48;
    for (let i = 0; i < 7; i++) {
      const bw = 0.05 + ((i * 7) % 3) * 0.012, bh = 0.17 + ((i * 5) % 3) * 0.03;
      B.box(bw, bh, 0.17, books[i % books.length]!, [x + bw / 2, 0.015 + bh / 2, 0], 0, sh);
      x += bw + 0.008;
    }
    plant(c, sh, [0.36, 0.015, 0], "small");
    framed(c, B.group, [-HX + 0.02, 1.45, 1.55], Math.PI / 2, posterTex("cards"), 0.42, 0.56, "#F7F4EE");
    const baked = bake(B.group, R);
    baked.position.set(HX + WALL_T, 0, 0);
    wallLeft.add(baked);
    // the working-title index card + sticky notes live on the pinboard (not baked: they change)
    const noteM = new THREE.MeshStandardMaterial({ map: pin.tex, roughness: 0.9, transparent: true, alphaTest: 0.5 });
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.333), noteM);
    note.position.set(PIN_C.x + 0.03 + HX + WALL_T, PIN_C.y + 0.17, PIN_C.z - 0.33);
    note.rotation.y = Math.PI / 2;
    note.userData.keep = true;
    wallLeft.add(note);
    const geo = new THREE.BoxGeometry(0.012, 0.15, 0.15);
    for (let i = 0; i < 12; i++) {
      const sm = new THREE.MeshLambertMaterial({ color: "#FFE58A", flatShading: true });
      stickyMats.push(sm);
      const s = new THREE.Mesh(geo, sm);
      const col = i % 4, row = Math.floor(i / 4);
      s.position.set(PIN_C.x + 0.035 + HX + WALL_T, PIN_C.y + 0.22 - row * 0.21 - (i % 2) * 0.02, PIN_C.z + 0.08 + col * 0.15 - (row === 0 ? 0 : 0.45) + (row > 0 ? 0 : 0.0));
      s.rotation.x = ((i * 37) % 7 - 3) * 0.035;
      s.visible = false;
      s.userData.keep = true;
      s.castShadow = false;
      wallLeft.add(s);
      stickies.push(s);
    }
  }
  root.add(wallBack, wallLeft);

  // ── furniture: each piece baked on its own so the boom can burst them one by one
  const pieces: Piece[] = [];
  const props = new THREE.Group();
  root.add(props);
  const piece = (name: string, at: [number, number, number], rot: number, color: string, delay: number, build: (c: Ctx, g: THREE.Group) => void) => {
    const B = new Builder(q);
    const c = ctx(B);
    build(c, B.group);
    const baked = bake(B.group, R);
    baked.name = name;
    const holder = new THREE.Group();
    holder.position.set(...at);
    holder.rotation.y = rot;
    holder.add(baked);
    props.add(holder);
    pieces.push({ g: holder, base: new THREE.Vector3(...at), delay, color });
  };
  // bed: headboard on the back wall, long side towards the room
  piece("bed", [2.05, 0, -1.42], 0, ACCENT, 0.05, (c, g) => {
    const { B } = c;
    shadowRect(c, 1.9, 2.4, [0, 0, 0], g, 0.38);
    B.box(1.6, 0.25, 2.0, fx(c, C.oak, 0.6), [0, 0.125, 0], 0.02, g);
    B.box(1.62, 0.8, 0.08, fx(c, C.oakDark, 0.6), [0, 0.5, -1.0], 0.02, g);
    B.box(1.5, 0.2, 1.9, fx(c, "#FBFAF7", 0.9), [0, 0.35, 0.02], 0.04, g);
    B.box(1.54, 0.08, 1.3, accent(c, 0.95), [0, 0.47, 0.32], 0.04, g);
    B.box(1.56, 0.1, 0.32, accentSoft(c, 0.95), [0, 0.5, 0.86], 0.04, g);
    for (const sx of [-1, 1]) B.box(0.62, 0.13, 0.36, fx(c, "#F1EEE8", 0.9), [sx * 0.36, 0.5, -0.72], 0.05, g).rotation.x = -0.2;
  });
  piece("nightstand", [0.78, 0, -2.18], 0, C.oak, 0.12, (c, g) => {
    const { B } = c;
    shadowRect(c, 0.6, 0.6, [0, 0, 0], g, 0.3);
    B.box(0.42, 0.46, 0.38, fx(c, C.oak, 0.55), [0, 0.23, 0], 0.02, g);
    B.box(0.32, 0.01, 0.01, fx(c, C.oakDark, 0.6), [0, 0.32, 0.195], 0, g);
    B.cyl(0.07, 0.08, 0.04, fx(c, C.ink, 0.5), [0, 0.48, 0], 12, g);
    B.cyl(0.012, 0.012, 0.22, fx(c, C.ink, 0.5), [0, 0.6, 0], 6, g);
    B.cyl(0.08, 0.13, 0.15, lampShade(c), [0, 0.76, 0], 12, g);
  });
  piece("bench", [-0.7, 0, -2.18], 0, ACCENT, 0.18, (c, g) => {
    const { B } = c;
    shadowRect(c, 1.9, 0.7, [0, 0, 0], g, 0.3);
    B.box(1.62, 0.3, 0.46, fx(c, "#F4F1EA", 0.6), [0, 0.15, 0], 0.02, g);
    B.box(1.56, 0.07, 0.42, accent(c, 0.95), [0, 0.335, 0], 0.03, g);
    B.box(0.36, 0.26, 0.1, accentSoft(c, 0.95), [-0.55, 0.48, -0.15], 0.04, g).rotation.set(-0.25, 0.2, 0);
  });
  piece("desk", [-1.55, 0, 0.35], -Math.PI / 2, C.oak, 0.0, (c, g) => {
    const { B } = c;
    laptopDesk({ ...c, color: "#0AC18E" }, g, [0, 0, 0], 0, 1.4);
    B.cyl(0.042, 0.038, 0.09, fx(c, "#E5484D", 0.45), [0.5, 0.767, 0.05], 14, g);
    deskLamp(c, g, [-0.55, 0.722, -0.18]);
    for (let i = 0; i < 3; i++) B.box(0.1, 0.006, 0.1, fx(c, ["#FFE58A", "#A8DDC4", "#FFB8A3"][i]!, 0.9), [0.32 + i * 0.05, 0.725 + i * 0.006, -0.2], 0, g).rotation.y = i * 0.3;
    B.box(0.18, 0.02, 0.24, fx(c, C.ink, 0.6), [-0.32, 0.732, 0.08], 0, g).rotation.y = 0.25;
  });
  piece("chair", [-2.22, 0, 0.35], Math.PI / 2, "#0AC18E", 0.02, (c, g) => taskChair({ ...c, color: "#5E6B7A" }, g, [0, 0, 0], 0));
  piece("beanbag", [0.45, 0, 1.55], 0, ACCENT, 0.24, (c, g) => {
    const { B } = c;
    shadowRound(c, 0.6, [0, 0, 0], g, 0.3);
    const yawB = Math.atan2(-2.6, -1.15);
    const bb = c.B.sub([0, 0, 0], yawB, g);
    if (isVoxel()) {
      // chunky voxel beanbag: a squashed seat and a slouched back
      B.box(0.86, 0.26, 0.86, accent(c, 0.95), [0, 0.13, 0], 0, bb);
      B.box(0.7, 0.1, 0.7, accent(c, 0.95), [0, 0.3, 0.02], 0, bb);
      B.box(0.8, 0.42, 0.26, accent(c, 0.95), [0, 0.42, -0.36], 0, bb).rotation.x = -0.25;
    } else {
      B.sphere(0.46, accent(c, 0.95), [0, 0.2, 0], 24, bb).scale.set(1.1, 0.48, 1.1);
      B.sphere(0.34, accent(c, 0.95), [0, 0.36, -0.22], 20, bb).scale.set(1.1, 0.75, 0.7);
    }
  });
  piece("stool", [2.25, 0, 1.55], 0, C.oak, 0.3, (c, g) => {
    const { B } = c;
    shadowRound(c, 0.3, [0, 0, 0], g, 0.25);
    B.cyl(0.2, 0.2, 0.05, fx(c, C.oak, 0.5), [0, 0.33, 0], 16, g);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      B.box(0.035, 0.33, 0.035, fx(c, C.oakDark, 0.6), [Math.sin(a) * 0.13, 0.165, Math.cos(a) * 0.13], 0, g);
    }
  });
  piece("rug", [0.3, 0, 0.55], 0, ACCENT, 0.4, (c, g) => rug(c, g, "stripe", 2.8, 2.0, [0, 0, 0]));
  piece("plant", [-2.55, 0, -2.05], 0, C.leafA, 0.28, (c, g) => plant(c, g, [0, 0, 0], "tall", C.terracotta));
  piece("plant2", [2.65, 0, 0.35], 0, C.leafB, 0.34, (c, g) => plant(c, g, [0, 0, 0], "bush"));
  piece("bin", [-1.0, 0, 1.05], 0, "#F4F1EA", 0.2, (c, g) => {
    const { B } = c;
    shadowRound(c, 0.2, [0, 0, 0], g, 0.25);
    B.cyl(0.13, 0.11, 0.3, fx(c, "#5E6B7A", 0.6), [0, 0.15, 0], 12, g);
    for (const [x, z] of [[0.03, 0.02], [-0.05, -0.03], [0.22, 0.14], [0.34, -0.1]] as const) B.blob(0.05, fx(c, "#F7F6F2", 0.9), [x, x > 0.1 ? 0.045 : 0.3, z], 0, g);
  });

  // ── people
  const actors = new Map<ActorId, Actor>();
  let roster: Analyst[] = [];
  function ensure(id: ActorId, spot: Spot, color: string, initial: ActorState) {
    let a = actors.get(id);
    if (a && a.fig.look.shirt !== color) {
      a.fig.dispose();
      actors.delete(id);
      a = undefined;
    }
    if (!a) {
      const fig = new Figure(id, lookOf(id, color), spot, q);
      root.add(fig.root);
      const pm = new THREE.Mesh(pickGeo, pickMat);
      pm.userData.actor = id;
      fig.root.add(pm);
      a = { id, fig, state: initial, arriveT: -1 };
      actors.set(id, a);
      fig.setState(initial, true);
    } else if (a.fig.spot !== spot) a.fig.setSpot(spot, true);
    return a;
  }
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const pickGeo = new THREE.BoxGeometry(0.62, 1.45, 0.62).translate(0, 0.72, 0);
  ensure("founder", FOUNDER, lookOf("founder").shirt, "working");

  function setRoster(r: readonly Analyst[]) {
    roster = r.slice(0, 5);
    const keep = new Set<ActorId>(["founder"]);
    roster.forEach((an, i) => {
      keep.add(an.id);
      const spot = SPOTS[BEDROOM_SPOTS[i]! as Exclude<BedroomSpot, "desk">];
      ensure(an.id, spot, an.color, actors.get(an.id)?.state ?? "absent");
    });
    for (const [id, a] of actors) if (!keep.has(id)) (a.fig.dispose(), actors.delete(id));
    syncWork();
  }
  const syncWork = () => {
    mix.work = [...actors.values()].some((a) => a.state === "working") ? 1 : 0;
    R.resolve(look, mixes, KEY);
  };

  function setActorState(id: ActorId, s: ActorState, o?: { instant?: boolean }) {
    const a = actors.get(id);
    if (!a) return;
    const instant = still || !!o?.instant;
    const prev = a.state;
    a.state = s === "arriving" && instant ? "idle" : s;
    a.arriveT = a.state === "arriving" ? 0 : -1;
    a.fig.setState(a.state, instant);
    if (a.state === "arriving" && prev !== "arriving") {
      const sp = a.fig.spot.sitIdle ? a.fig.spot.seat : a.fig.spot.stand;
      burst.fire(sp.x, 0.7, sp.z, a.fig.look.shirt, { power: 0.9, size: 0.075 });
    }
    syncWork();
  }

  // ── effects
  const burst = new CubeBurst(5, 18);
  const papers = new Papers(burst, 6);
  root.add(burst.root, papers.root);

  // ── boom cubes: one InstancedMesh, each cube owned by a piece (colour + origin), driven only by k (scrubbable)
  const BOOM_N = q === "high" ? 220 : 140;
  const boomMat = new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true });
  const boom = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), boomMat, BOOM_N);
  boom.frustumCulled = false;
  boom.raycast = () => {};
  boom.visible = false;
  const boomSeeds: Array<{ o: THREE.Vector3; v: THREE.Vector3; s: number; d: number; r: number }> = [];
  {
    const palette = (hex: string, i: number) => {
      const c = new THREE.Color(hex);
      return i % 4 === 0 ? c.lerp(new THREE.Color("#ffffff"), 0.35) : i % 4 === 1 ? c.multiplyScalar(0.8) : c;
    };
    const wallC = "#F2E9DE";
    for (let i = 0; i < BOOM_N; i++) {
      const fromWall = i % 3 === 0;
      const p = pieces[i % pieces.length]!;
      const o = fromWall
        ? new THREE.Vector3(i % 2 ? -HX + 0.1 : -HX + ((i * 37) % 60) / 10, 0.3 + ((i * 13) % 20) / 10, i % 2 ? -HZ + ((i * 29) % 50) / 10 : -HZ + 0.1)
        : new THREE.Vector3(p.base.x + (((i * 17) % 9) - 4) * 0.1, 0.15 + ((i * 11) % 8) * 0.08, p.base.z + (((i * 23) % 9) - 4) * 0.1);
      const out = new THREE.Vector3(o.x + 0.5, 0, o.z - 0.2).normalize();
      const sp = 2.2 + ((i * 7) % 10) / 10 * 3.2;
      boomSeeds.push({ o, v: new THREE.Vector3(out.x * sp, 2.2 + ((i * 19) % 10) / 10 * 3.4, out.z * sp), s: 0.06 + ((i * 3) % 5) * 0.022, d: fromWall ? 0.18 + ((i * 5) % 10) / 100 : p.delay * 0.6 + 0.1, r: i * 0.61 });
      boom.setColorAt(i, palette(fromWall ? wallC : p.color, i));
    }
    if (boom.instanceColor) boom.instanceColor.needsUpdate = true;
  }
  root.add(boom);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  let boomK = 0;
  function setBoom(k: number) {
    boomK = clamp01(k);
    const kk = boomK;
    // 0 … 0.06: anticipation + laptop flash (the screens pulse white)
    const flash = kk > 0 && kk < 0.1 ? Math.sin((kk / 0.1) * Math.PI) : 0;
    R.pulse(KEY, 1 + flash * 7);
    // walls fold outward (pivot at the outer bottom edge), then sink away
    const fold = easeIn(win(kk, 0.06, 0.42));
    wallBack.rotation.x = -fold * (Math.PI / 2);
    wallLeft.rotation.z = fold * (Math.PI / 2);
    const wallGone = win(kk, 0.42, 0.62);
    wallBack.scale.setScalar(Math.max(0.001, 1 - wallGone));
    wallLeft.scale.setScalar(Math.max(0.001, 1 - wallGone));
    wallBack.visible = wallLeft.visible = wallGone < 1;
    // furniture pops (a squash, then shrinks to nothing) while its cubes fly
    for (const p of pieces) {
      const t = win(kk, 0.08 + p.delay * 0.5, 0.3 + p.delay * 0.5);
      const squash = t < 0.3 ? 1 + Math.sin((t / 0.3) * Math.PI) * 0.12 : 1 - easeOut((t - 0.3) / 0.7);
      p.g.scale.set(Math.max(0.001, squash), Math.max(0.001, t < 0.3 ? 1 - Math.sin((t / 0.3) * Math.PI) * 0.15 : squash), Math.max(0.001, squash));
      p.g.visible = t < 1;
    }
    // floor + plinth: hand over to the office slab that spreads out of this footprint
    const floorGone = win(kk, 0.55, 0.85);
    base.scale.set(1, Math.max(0.001, 1 - floorGone), 1);
    base.visible = floorGone < 1;
    // people hop and vanish (they reappear at their research desks on the floor)
    for (const a of actors.values()) a.fig.presence = 1 - win(kk, 0.1, 0.28);
    // cubes
    boom.visible = kk > 0.06 && kk < 0.999;
    if (boom.visible) {
      for (let i = 0; i < BOOM_N; i++) {
        const s = boomSeeds[i]!;
        const T = Math.max(0, (kk - s.d) * 2.6 * 1.0); // seconds since this cube launched (BOOM_MS ≈ 2.6 s)
        if (kk < s.d) {
          boom.setMatrixAt(i, _m.makeScale(0, 0, 0));
          continue;
        }
        _p.set(s.o.x + s.v.x * T, s.o.y + s.v.y * T - 4.9 * T * T, s.o.z + s.v.z * T);
        const life = clamp01(T / 1.3);
        const sc = s.s * (life < 0.1 ? life / 0.1 : 1 - life * life);
        _s.setScalar(Math.max(0.0001, sc));
        _q.setFromEuler(_e.set(s.r + T * 5, s.r * 1.7 + T * 3, s.r * 0.3));
        boom.setMatrixAt(i, _m.compose(_p, _q, _s));
      }
      boom.instanceMatrix.needsUpdate = true;
    }
  }

  // ── lights (high: desk lamp + bedside lamp; low: emissive + pools)
  const lamps: THREE.PointLight[] = [];
  if (q === "high") {
    const l1 = new THREE.PointLight("#FFC27E", 0, 5, 1.6);
    l1.position.set(-1.55, 1.25, 1.0);
    const l2 = new THREE.PointLight("#FFB869", 0, 4, 1.7);
    l2.position.set(0.78, 1.0, -1.9);
    l1.name = "lamp:desk";
    l2.name = "lamp:bed";
    root.add(l1, l2);
    lamps.push(l1, l2);
  }
  {
    const B = new Builder(q);
    for (const [x, z, r] of [[-1.55, 0.35, 1.3], [0.78, -1.9, 1.1], [0.3, 0.4, 2.4]] as const)
      B.decal(r * 2, r * 2, R.m("pool", KEY, ACCENT, { map: radialTex(), opacity: x === 0.3 ? 0.18 : 0.42, key: `pool${r}` }), [x, 0.012, z]);
    const pools = bake(B.group, R);
    root.add(pools);
  }
  const syncLights = () => {
    const lv = look.lamps * (0.25 + 9 * look.dark * look.dark + 2 * look.warm);
    if (lamps[0]) lamps[0].intensity = lv * 1.2;
    if (lamps[1]) lamps[1].intensity = lv * 0.8;
  };

  // ── sign (pinboard index card)
  let sign: CompanySign = { kind: "draft", name: "Your idea", color: "#1E2229" };
  function setSign(s: CompanySign) {
    sign = { ...s };
    pin.draw((g, w, h) => drawPinNote(g, w, h, sign));
  }
  setSign(sign);

  root.add(envProbe(R));
  R.resolve(look, mixes);

  const box = new THREE.Box3(new THREE.Vector3(-HX - PAD, -0.55, -HZ - PAD), new THREE.Vector3(HX + PAD, 2.5, HZ + PAD));
  const _v = new THREE.Vector3();

  const model: BedroomModel = {
    root,
    bounds: () => box.clone(),
    focusBounds(id) {
      if (id === "overview") return box.clone();
      const a = actors.get(id);
      if (!a || a.state === "absent") return box.clone();
      const p = a.fig.headPoint(_v);
      // frame the person with a bit of their corner (and the founder's desk with the founder)
      return new THREE.Box3(new THREE.Vector3(p.x - 1.0, 0, p.z - 1.0), new THREE.Vector3(p.x + 1.0, 1.9, p.z + 1.0));
    },
    setRoster,
    setActorState,
    actorAnchor(id) {
      const a = actors.get(id);
      return a && a.state !== "absent" ? a.fig.headPoint() : null;
    },
    pickActor(ray) {
      const list: THREE.Object3D[] = [];
      for (const a of actors.values()) if (a.fig.root.visible) list.push(a.fig.root);
      const hit = ray.intersectObjects(list, true).find((h) => h.object.userData.actor);
      return hit ? (hit.object.userData.actor as ActorId) : null;
    },
    setSign,
    pulse(id: ActorId, kind: FindingKind) {
      const a = actors.get(id);
      if (!a || a.state === "absent") return;
      const from = a.fig.handPoint(new THREE.Vector3());
      const idx = stickyN % stickies.length;
      const st = stickies[idx]!;
      const to = new THREE.Vector3(st.position.x - HX - WALL_T + 0.02, st.position.y, st.position.z);
      papers.fire(from, to, kind, () => {
        stickyMats[idx]!.color.set(KIND_TONE[kind]).lerp(new THREE.Color("#ffffff"), 0.35);
        st.visible = true;
        st.scale.setScalar(1.35);
      });
      stickyN++;
    },
    setBoom,
    applyAtmosphere(a: AtmospherePreset) {
      lookFromAtmosphere(look, a);
      R.resolve(look, mixes);
      syncLights();
    },
    update(dt, t) {
      dt = dt > 0 ? (dt < 0.1 ? dt : 0.1) : 0;
      let busy = !still;
      for (const a of actors.values()) {
        if (a.arriveT >= 0) {
          a.arriveT += dt * 1000;
          if (a.arriveT >= ARRIVE_MS) {
            a.arriveT = -1;
            a.state = "idle";
            a.fig.setState("idle");
            syncWork();
          }
        }
        busy = a.fig.update(dt, t, still) || busy;
      }
      for (const s of stickies) if (s.scale.x > 1.001) (s.scale.setScalar(Math.max(1, s.scale.x - dt * 1.6)), (busy = true));
      if (!still && boomK === 0 && mix.work > 0) R.pulse(KEY, 1 + 0.12 * Math.sin(t * 2.4) + 0.05 * Math.sin(t * 7.1));
      busy = burst.update(dt) || busy;
      busy = papers.update(dt) || busy;
      return busy;
    },
    dispose() {
      for (const a of actors.values()) a.fig.dispose();
      burst.dispose();
      papers.dispose();
      pin.dispose();
      for (const m of stickyMats) m.dispose();
      boom.geometry.dispose();
      boomMat.dispose();
      pickMat.dispose();
      pickGeo.dispose();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      R.dispose();
    },
  };
  return model;
};

function uv(m: THREE.Mesh, su: number, sv: number) {
  const a = m.geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * su, a.getY(i) * sv);
  a.needsUpdate = true;
}
