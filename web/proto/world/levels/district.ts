// WS-B · Levels base + 3 "District": the diorama base (always), the streets around the tower (level 2) and the
// company-growth buildings (level 3). Pure THREE; the world drives setGround/setCity/setBuilt and update().
import * as THREE from "three";
import type { PortfolioItem } from "../../contracts";
import { buildArch, FH, type Part } from "./arch";
import { PopSet, Y0, at, clamp01, easeOut, facade, merge, rbox, rng, treeGeos, win, type Inst } from "./kit";
import type { Palette } from "./palette";

export const BASE_X = 98, BASE_Z = 68, BASE_T = 3.2;
const ROAD_X = 28, ROAD_Z = 20, ROAD_W = 9;
const KERB = 0.2; // block top above street
const KY = Y0 + KERB;
const COLS: [number, number][] = [[-94, -ROAD_X - ROAD_W / 2], [-ROAD_X + ROAD_W / 2, ROAD_X - ROAD_W / 2], [ROAD_X + ROAD_W / 2, 94]];
const ROWS: [number, number][] = [[-64, -ROAD_Z - ROAD_W / 2], [-ROAD_Z + ROAD_W / 2, ROAD_Z - ROAD_W / 2], [ROAD_Z + ROAD_W / 2, 64]];

/** A district building: plot centre + volumes in the shared language (arch.ts). */
type BSpec = { id: string; x: number; z: number; parts: Part[]; plot: [number, number] };
/** Reserved plots for past projects (setPortfolio), nearest the tower first. Footprint grows with the project's level. */
const SLOTS: { x: number; z: number }[] = [
  { x: 46, z: 0 }, { x: -46, z: 0 }, { x: 46, z: 37 }, { x: -46, z: 37 }, { x: 9, z: -38 }, { x: -46, z: -38 },
];
const SLOT_PLOT: [number, number] = [16, 14];
function portfolioParts(level: 1 | 2 | 3): Part[] {
  if (level === 1) return [{ x: 0, z: 0, w: 12, d: 9, floors: 1, rhythm: "shop" }]; // pavilion
  if (level === 2) return [{ x: 0, z: 0, w: 13, d: 11, floors: 1, rhythm: "shop" }, { x: 0, z: -0.5, w: 11, d: 9, floors: 5, from: 1.31 }];
  return [{ x: 0, z: 0, w: 15, d: 13, floors: 2, rhythm: "shop" }, { x: 0, z: -0.5, w: 12.5, d: 10.5, floors: 7, from: 2.63 }];
}

export interface District {
  readonly ground: THREE.Group; // level 2+: blocks, plaza, streets, trees, cars, people
  readonly city: THREE.Group; // level 3: buildings
  /** 0..1 deterministic growth of the street layer. */
  setGround(g: number): void;
  /** 0..1 deterministic growth of the buildings (ripple outward from the tower). */
  setCity(g: number): void;
  /** 0 = planned (clay model, unlit) · 1 = built (materials, lit windows). */
  setBuilt(k: number): void;
  /** 0 = planned massing as a faint ghost (level 2 hint) · 1 = solid clay maquette (level 3). */
  setSolid(k: number): void;
  readonly built: number;
  applyPalette(p: Palette): void;
  update(dt: number, t: number): boolean;
  /** Box of the whole diorama (for level-3 framing). */
  bounds(): THREE.Box3;
  /** Points to frame at level 3: base corners + the top corners of every building. */
  framePoints(): THREE.Vector3[];
  /** v6: past projects → buildings on the reserved plots (max 6, first = nearest the tower). */
  setPortfolio(items: PortfolioItem[]): void;
  /** v6: world points just above each portfolio building's roof (label anchors). */
  portfolioAnchors(): { id: string; p: THREE.Vector3 }[];
  /** v7: one box per building volume (world space), for the dashed "locked district" ghost. */
  ghostBoxes(): THREE.Box3[];
  dispose(): void;
}


/** The diorama base (always visible, level 1 too): rounded slab in the street colour + a studio floor that only catches shadows. */
export function createBase(opts: { quality: "low" | "high" }) {
  const shadows = opts.quality === "high";
  const base = new THREE.Group();
  base.name = "base";
  const M = {
    cap: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    side: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    shadow: new THREE.ShadowMaterial({ opacity: 0.14, transparent: true, depthWrite: false }),
  };
  const mk = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], cast = true, recv = true) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = cast && shadows;
    mesh.receiveShadow = recv && shadows;
    return mesh;
  };
  // ── base: rounded diorama slab + an invisible studio floor that only catches its soft shadow
  {
    const s = new THREE.Shape();
    const r = 9, X = BASE_X, Z = BASE_Z;
    s.moveTo(-X + r, -Z);
    s.lineTo(X - r, -Z);
    s.quadraticCurveTo(X, -Z, X, -Z + r);
    s.lineTo(X, Z - r);
    s.quadraticCurveTo(X, Z, X - r, Z);
    s.lineTo(-X + r, Z);
    s.quadraticCurveTo(-X, Z, -X, Z - r);
    s.lineTo(-X, -Z + r);
    s.quadraticCurveTo(-X, -Z, -X + r, -Z);
    const g = new THREE.ExtrudeGeometry(s, { depth: BASE_T - 0.4, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.35, bevelSegments: 3, curveSegments: 10 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, Y0 - BASE_T + 0.2, 0);
    const slab = mk(g, [M.cap, M.side], false, true);
    slab.name = "base-slab";
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), M.shadow);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = Y0 - BASE_T - 0.02;
    floor.receiveShadow = shadows;
    base.add(slab, floor);
  }

  let presence = 1, shadowOp = 0.14;
  return {
    root: base,
    applyPalette(p: Palette) {
      M.cap.color.copy(p.ground);
      M.side.color.copy(p.baseSide);
      shadowOp = p.shadow;
      M.shadow.opacity = p.shadow * presence;
    },
    /** 0 at level 1 (the office floats on the sky; it carries its own contact shadow) → 1 once the city exists. */
    setPresence(k: number) {
      k = Math.max(0, Math.min(1, k));
      if (k === presence) return;
      presence = k;
      base.visible = k > 0.001;
      for (const m of [M.cap, M.side]) {
        const tr = k < 0.999;
        if (m.transparent !== tr) {
          m.transparent = tr;
          m.needsUpdate = true;
        }
        m.opacity = k;
        m.depthWrite = k > 0.5;
      }
      M.shadow.opacity = shadowOp * k;
    },
    dispose() {
      base.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      Object.values(M).forEach((m) => m.dispose());
    },
  };
}

export function createDistrict(opts: { quality: "low" | "high"; env: THREE.Texture | null }): District {
  const shadows = opts.quality === "high";
  const R = rng(42);
  const ground = new THREE.Group();
  ground.name = "streets";
  const city = new THREE.Group();
  city.name = "district";

  const mk = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], cast = true, recv = true) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = cast && shadows;
    mesh.receiveShadow = recv && shadows;
    return mesh;
  };

  // ── materials (palette-driven)
  const M = {
    kerb: new THREE.MeshStandardMaterial({ roughness: 0.92 }),
    paving: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    grass: new THREE.MeshStandardMaterial({ roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ roughness: 0.08, metalness: 0.2, envMap: opts.env }),
    marking: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    trunk: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    crown: new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }),
    pole: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.4 }),
    lampHead: new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: "#FFD9A0", emissiveIntensity: 0 }),
    car: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.25, envMap: opts.env, envMapIntensity: 0.6 }),
    cabin: new THREE.MeshStandardMaterial({ color: "#2A3240", roughness: 0.15, metalness: 0.4, envMap: opts.env }),
  };

  // ── blocks
  type Block = { mesh: THREE.Group; a: number };
  const blocks: Block[] = [];
  const footprints: { x0: number; x1: number; z0: number; z1: number }[] = [];
  const PARK = { cx: 0, cz: (ROWS[2][0] + ROWS[2][1]) / 2 };
  ROWS.forEach(([z0, z1], ri) =>
    COLS.forEach(([x0, x1], ci) => {
      const g = new THREE.Group();
      const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const isTower = ri === 1 && ci === 1;
      const isPark = ri === 2 && ci === 1;
      const kerb = mk(rbox(w, KERB + 0.3, d, 0.25), isTower ? M.paving : M.kerb, false);
      kerb.position.set(cx, KY - (KERB + 0.3) / 2, cz);
      g.add(kerb);
      if (isTower) {
        for (const sx of [-1, 1]) {
          const p = mk(rbox(5.2, 0.5, d - 6, 0.2), M.kerb, false);
          p.position.set(cx + sx * (w / 2 - 3.6), KY + 0.25, cz);
          const gr = mk(new THREE.BoxGeometry(4.4, 0.05, d - 6.8), M.grass, false);
          gr.position.set(cx + sx * (w / 2 - 3.6), KY + 0.51, cz);
          g.add(p, gr);
        }
      } else {
        const inset = 3.2;
        const lawn = mk(rbox(w - inset * 2, 0.12, d - inset * 2, 0.4), isPark ? M.grass : M.paving, false);
        lawn.position.set(cx, KY + 0.06, cz);
        g.add(lawn);
        if (isPark) {
          const pond = new THREE.Shape();
          pond.absellipse(0, 0, 12, 6.5, 0, Math.PI * 2, false, 0.15);
          const rim = new THREE.Shape();
          rim.absellipse(0, 0, 13, 7.4, 0, Math.PI * 2, false, 0.15);
          const rimM = mk(new THREE.ShapeGeometry(rim, 48).rotateX(-Math.PI / 2), M.paving, false);
          rimM.position.set(cx + 5, KY + 0.14, cz + 1.5);
          const water = mk(new THREE.ShapeGeometry(pond, 48).rotateX(-Math.PI / 2), M.water, false);
          water.position.set(cx + 5, KY + 0.16, cz + 1.5);
          const p1 = mk(new THREE.BoxGeometry(2.2, 0.04, d - 6).rotateY(0.35), M.paving, false);
          p1.position.set(cx - 11, KY + 0.13, cz);
          const p2 = mk(new THREE.BoxGeometry(w - 6, 0.04, 2.2), M.paving, false);
          p2.position.set(cx, KY + 0.13, cz - 11);
          g.add(rimM, water, p1, p2);
        } else {
          // soft courtyard lawns between the buildings
          const lg = mk(rbox(w - 12, 0.1, d - 12, 0.6), M.grass, false);
          lg.position.set(cx, KY + 0.14, cz);
          g.add(lg);
        }
      }
      ground.add(g);
      blocks.push({ mesh: g, a: isTower ? 0 : 0.06 + Math.hypot(cx, cz) / 320 });
    }),
  );

  // ── buildings (level 3): one language with the hero tower; the hero stays the tallest by far
  const P2 = 8.4 / FH; // a two-floor shop podium, in floors
  const specs: BSpec[] = [
    { id: "lb", x: -74, z: -46, plot: [28, 22], parts: [{ x: 0, z: 0, w: 26, d: 20, floors: 2, rhythm: "shop" }, { x: -1, z: -1, w: 17, d: 13, floors: 6, from: P2 }] },
    { id: "cb", x: -11, z: -46, plot: [18, 22], parts: [{ x: 0, z: 0, w: 16, d: 20, floors: 5, rhythm: "ribbon" }, { x: 0, z: -2.5, w: 16, d: 11, floors: 2, from: 5, rhythm: "ribbon" }] },
    { id: "rb1", x: 74, z: -48, plot: [32, 22], parts: [{ x: 0, z: -3, w: 30, d: 12, floors: 4, rhythm: "ribbon" }, { x: 9, z: 5, w: 12, d: 12, floors: 4, rhythm: "ribbon" }] },
    { id: "rb2", x: 47, z: -45, plot: [16, 18], parts: [{ x: 0, z: 0, w: 14, d: 16, floors: 8 }] },
    { id: "lm", x: -76, z: 0, plot: [28, 22], parts: [{ x: 0, z: 0, w: 26, d: 20, floors: 5, rhythm: "ribbon" }] },
    { id: "rm", x: 76, z: 0, plot: [28, 22], parts: [{ x: 0, z: 0, w: 26, d: 20, floors: 1, rhythm: "shop" }, { x: 0, z: -1, w: 18, d: 13, floors: 6, from: 4.2 / FH }] },
    { id: "lf", x: -76, z: 44, plot: [28, 26], parts: [{ x: 0, z: 0, w: 26, d: 24, floors: 3 }, { x: -2, z: -3.5, w: 20, d: 17, floors: 2, from: 3 }, { x: -4, z: -6, w: 12, d: 10, floors: 2, from: 5 }] },
    { id: "lf2", x: -47, z: 56, plot: [16, 9], parts: [{ x: 0, z: 0, w: 14, d: 7, floors: 2, rhythm: "ribbon" }] },
    { id: "rf", x: 76, z: 45, plot: [26, 24], parts: [{ x: 0, z: 0, w: 24, d: 22, floors: 2, rhythm: "shop" }, { x: 1, z: -1, w: 16, d: 14, floors: 6, from: P2 }] },
    { id: "rf2", x: 47, z: 56, plot: [16, 9], parts: [{ x: 0, z: 0, w: 14, d: 7, floors: 2, rhythm: "shop" }] },
  ];

  const fins = facade("curtain", 5), rib = facade("ribbon", 13);
  const texInfo = { fins, ribbon: rib };
  const glassMat = (f: typeof fins, curtain: boolean) =>
    new THREE.MeshStandardMaterial({
      map: f.map, emissiveMap: f.lit, emissive: new THREE.Color("#FFE6C4"), emissiveIntensity: 0,
      roughness: curtain ? 0.18 : 0.6, metalness: curtain ? 0.35 : 0, envMap: opts.env,
    });
  /** Planned/built district materials (clay ↔ real, shared by every generic building). */
  const G = {
    stone: new THREE.MeshStandardMaterial({ roughness: 0.82 }),
    glass: glassMat(fins, true),
    ribbon: glassMat(rib, false),
    roof: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    plant: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 }),
  };
  /** Past projects: always built and lit, with an accent line on the roof ("yours"). */
  const PM = {
    stone: new THREE.MeshStandardMaterial({ roughness: 0.82 }),
    glass: glassMat(fins, true),
    ribbon: glassMat(rib, false),
    roof: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    plant: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 }),
    accent: new THREE.MeshStandardMaterial({ color: "#0AC18E", emissive: "#0AC18E", emissiveIntensity: 0.6, roughness: 0.5 }),
  };
  type Mats = Omit<typeof PM, "accent">;

  function archGroup(parts: Part[], seed: number, m: Mats) {
    const a = buildArch(parts, texInfo, seed);
    const g = new THREE.Group();
    g.add(mk(a.stone, m.stone), mk(a.glass, m.glass), mk(a.roof, m.roof, false));
    if (a.ribbon) g.add(mk(a.ribbon, m.ribbon));
    if (a.plant) g.add(mk(a.plant, m.plant));
    return { g, top: a.top };
  }

  type B = { spec: BSpec; g: THREE.Group; a: number; top: number };
  const buildings: B[] = [];
  const maxD = Math.max(...specs.map((s) => Math.hypot(s.x, s.z)));
  specs.forEach((spec, i) => {
    const { g, top } = archGroup(spec.parts, 101 + i * 37, G);
    g.position.set(spec.x, KY + 0.12, spec.z);
    city.add(g);
    footprints.push({ x0: spec.x - spec.plot[0] / 2, x1: spec.x + spec.plot[0] / 2, z0: spec.z - spec.plot[1] / 2, z1: spec.z + spec.plot[1] / 2 });
    buildings.push({ spec, g, a: 0.04 + 0.5 * (Math.hypot(spec.x, spec.z) / maxD), top });
  });
  for (const sl of SLOTS) footprints.push({ x0: sl.x - SLOT_PLOT[0] / 2, x1: sl.x + SLOT_PLOT[0] / 2, z0: sl.z - SLOT_PLOT[1] / 2, z1: sl.z + SLOT_PLOT[1] / 2 });
  footprints.push({ x0: -18, x1: 18, z0: -11, z1: 11 }); // tower + plinth
  footprints.push({ x0: PARK.cx - 9, x1: PARK.cx + 19, z0: PARK.cz - 6.5, z1: PARK.cz + 10 }); // pond
  const inFoot = (x: number, z: number, m = 1.5) => footprints.some((f) => x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m);
  const nearCross = (x: number, z: number, m: number) => Math.abs(Math.abs(x) - ROAD_X) < m && Math.abs(Math.abs(z) - ROAD_Z) < m;

  // ── portfolio: past projects on the reserved plots
  const portfolioRoot = new THREE.Group();
  portfolioRoot.name = "portfolio";
  city.add(portfolioRoot);
  type PB = { id: string; slot: number; g: THREE.Group; top: number; a: number };
  let pbs: PB[] = [];
  const accentLine = (w: number, d: number, y: number) =>
    merge([
      at(new THREE.BoxGeometry(w + 0.06, 0.12, 0.06), 0, y, d / 2), at(new THREE.BoxGeometry(w + 0.06, 0.12, 0.06), 0, y, -d / 2),
      at(new THREE.BoxGeometry(0.06, 0.12, d + 0.06), w / 2, y, 0), at(new THREE.BoxGeometry(0.06, 0.12, d + 0.06), -w / 2, y, 0),
    ]);

  // slot plots: dashed outline on every free reserved plot ("room for your next idea")
  const slotPlots: THREE.Mesh[] = SLOTS.map((sl) => {
    const list: THREE.BufferGeometry[] = [];
    const [pw, pd] = SLOT_PLOT;
    for (let x = -pw / 2; x <= pw / 2 + 0.01; x += 2) for (const sz of [-1, 1]) list.push(at(new THREE.BoxGeometry(1, 0.04, 0.2), x, 0, (sz * pd) / 2));
    for (let z = -pd / 2 + 2; z < pd / 2 - 0.01; z += 2) for (const sx of [-1, 1]) list.push(at(new THREE.BoxGeometry(0.2, 0.04, 1), (sx * pw) / 2, 0, z));
    const m = mk(merge(list), M.marking, false);
    m.position.set(sl.x, KY + 0.2, sl.z);
    ground.add(m);
    return m;
  });

  // ── plots: dashed outlines where the next buildings will rise (seen at level 2)
  const plotItems: Inst[] = [];
  for (const s of specs) {
    const [pw, pd] = s.plot;
    const step = 2.4;
    for (let x = -pw / 2; x <= pw / 2 + 0.01; x += step) for (const sz of [-1, 1]) plotItems.push({ x: s.x + x, y: KY + 0.2, z: s.z + (sz * pd) / 2, sx: 1.2, sz: 0.22, a: 0.45 + R() * 0.2 });
    for (let z = -pd / 2 + step; z < pd / 2 - 0.01; z += step) for (const sx of [-1, 1]) plotItems.push({ x: s.x + (sx * pw) / 2, y: KY + 0.2, z: s.z + z, sx: 0.22, sz: 1.2, a: 0.45 + R() * 0.2 });
  }
  const plots = new PopSet(new THREE.BoxGeometry(1, 0.04, 1), M.marking, plotItems, 0.2);
  ground.add(plots.mesh);

  // ── road markings: centre dashes + zebra crossings
  const marks: Inst[] = [];
  for (const rx of [-ROAD_X, ROAD_X])
    for (let z = -BASE_Z + 3; z < BASE_Z - 3; z += 6) if (Math.abs(Math.abs(z) - ROAD_Z) > 7) marks.push({ x: rx, y: Y0 + 0.01, z, sx: 0.2, sz: 2.4, a: 0.2 + Math.abs(z) / 300 });
  for (const rz of [-ROAD_Z, ROAD_Z])
    for (let x = -BASE_X + 3; x < BASE_X - 3; x += 6) if (Math.abs(Math.abs(x) - ROAD_X) > 7) marks.push({ x, y: Y0 + 0.01, z: rz, sx: 2.4, sz: 0.2, a: 0.2 + Math.abs(x) / 300 });
  for (const ix of [-ROAD_X, ROAD_X])
    for (const iz of [-ROAD_Z, ROAD_Z])
      for (let k = -3; k <= 3; k++)
        for (const s of [-1, 1]) {
          marks.push({ x: ix + k * 1.05, y: Y0 + 0.01, z: iz + s * 6.2, sx: 0.55, sz: 2.6, a: 0.25 });
          marks.push({ x: ix + s * 6.2, y: Y0 + 0.01, z: iz + k * 1.05, sx: 2.6, sz: 0.55, a: 0.25 });
        }
  const markSet = new PopSet(new THREE.BoxGeometry(1, 0.03, 1), M.marking, marks, 0.25);
  ground.add(markSet.mesh);

  // ── trees: street rows + plaza planters + park clusters
  const trees: Inst[] = [];
  const pushTree = (x: number, z: number, s: number, a: number, y = KY) => trees.push({ x, y, z, sx: s, sy: s * (0.9 + R() * 0.25), sz: s, ry: R() * 6, a, color: new THREE.Color(1, 1, 1) });
  const edgeIn = 1.6;
  for (const [x0, x1] of COLS)
    for (const [z0, z1] of ROWS) {
      for (let x = x0 + 4; x < x1 - 3; x += 8.5)
        for (const z of [z0 + edgeIn, z1 - edgeIn]) if (!inFoot(x, z, 0.5) && !nearCross(x, z, 6.5)) pushTree(x, z, 0.85 + R() * 0.3, 0.12 + Math.hypot(x, z) / 220);
      for (let z = z0 + 4; z < z1 - 3; z += 8.5)
        for (const x of [x0 + edgeIn, x1 - edgeIn]) if (!inFoot(x, z, 0.5) && !nearCross(x, z, 6.5)) pushTree(x, z, 0.85 + R() * 0.3, 0.12 + Math.hypot(x, z) / 220);
    }
  for (const sx of [-1, 1]) for (let z = -10; z <= 10; z += 5) pushTree(sx * 19.9, z, 0.95 + R() * 0.2, 0.1 + R() * 0.1, KY + 0.5);
  for (let k = 0; k < 20; k++) {
    const ang = R() * Math.PI * 2, rr = 15 + R() * 7;
    const x = PARK.cx + 5 + Math.cos(ang) * rr * 0.95, z = PARK.cz + 1.5 + Math.sin(ang) * rr * 0.55;
    if (Math.abs(x) < 20 && z > ROWS[2][0] + 3 && z < ROWS[2][1] - 3 && !inFoot(x, z, 0)) pushTree(x, z, 0.9 + R() * 0.5, 0.3 + R() * 0.25);
  }
  const tg = treeGeos();
  const trunks = new PopSet(tg.trunk, M.trunk, trees.map((t) => ({ ...t, color: undefined })), 0.22);
  const crowns = new PopSet(tg.crown, M.crown, trees, 0.22);
  trunks.mesh.castShadow = crowns.mesh.castShadow = shadows;
  crowns.mesh.receiveShadow = shadows;
  ground.add(trunks.mesh, crowns.mesh);

  // ── street lamps + warm pools of light
  const lamps: Inst[] = [];
  for (const rx of [-ROAD_X, ROAD_X]) for (let z = -BASE_Z + 8; z < BASE_Z - 6; z += 12) if (Math.abs(Math.abs(z) - ROAD_Z) > 8) for (const s of [-1, 1]) lamps.push({ x: rx + s * (ROAD_W / 2 + 0.7), y: KY, z: z + s * 3, a: 0.3 + Math.abs(z) / 300 });
  for (const rz of [-ROAD_Z, ROAD_Z]) for (let x = -BASE_X + 8; x < BASE_X - 6; x += 12) if (Math.abs(Math.abs(x) - ROAD_X) > 8) for (const s of [-1, 1]) lamps.push({ x: x + s * 3, y: KY, z: rz + s * (ROAD_W / 2 + 0.7), a: 0.3 + Math.abs(x) / 300 });
  const poleG = new THREE.CylinderGeometry(0.05, 0.07, 3.4, 6).translate(0, 1.7, 0);
  const headG = new THREE.SphereGeometry(0.22, 10, 8).translate(0, 3.5, 0);
  const poles = new PopSet(poleG, M.pole, lamps, 0.2, "y");
  const heads = new PopSet(headG, M.lampHead, lamps, 0.2);
  const poolMat = new THREE.MeshBasicMaterial({ color: "#FFD9A0", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: radialTex() });
  const pools = new PopSet(new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2), poolMat, lamps.map((l) => ({ ...l, y: Y0 + 0.04 })), 0.2);
  pools.mesh.renderOrder = 1;
  ground.add(poles.mesh, heads.mesh, pools.mesh);

  // ── cars (drive on the right) with head/tail lights and long-exposure light trails at night
  type Mover = { lane: { ox: number; oz: number; dx: number; dz: number; len: number }; s: number; v: number };
  const lanes: Mover["lane"][] = [];
  for (const rx of [-ROAD_X, ROAD_X]) {
    lanes.push({ ox: rx - 2.1, oz: -BASE_Z, dx: 0, dz: 1, len: BASE_Z * 2 });
    lanes.push({ ox: rx + 2.1, oz: BASE_Z, dx: 0, dz: -1, len: BASE_Z * 2 });
  }
  for (const rz of [-ROAD_Z, ROAD_Z]) {
    lanes.push({ ox: -BASE_X, oz: rz + 2.1, dx: 1, dz: 0, len: BASE_X * 2 });
    lanes.push({ ox: BASE_X, oz: rz - 2.1, dx: -1, dz: 0, len: BASE_X * 2 });
  }
  const cars: Mover[] = [];
  lanes.forEach((lane, li) => {
    const n = li % 3 === 0 ? 2 : 1;
    for (let k = 0; k < n; k++) cars.push({ lane, s: (R() + k * 0.5) * lane.len, v: 5.5 + R() * 3 });
  });
  const carPalette = ["#F4F5F7", "#C9CED6", "#2D3440", "#5B6B7F", "#D9CBB4", "#9AA7B4", "#E8E2D6", "#3E4757"];
  const bodyG = merge([at(rbox(2.6, 0.62, 1.22, 0.18), 0, 0.5, 0), at(new THREE.BoxGeometry(2.2, 0.3, 1.08), 0, 0.2, 0)]);
  const cabG = rbox(1.35, 0.5, 1.06, 0.16).translate(-0.12, 1.0, 0);
  const carBody = new THREE.InstancedMesh(bodyG, M.car, cars.length);
  const carCab = new THREE.InstancedMesh(cabG, M.cabin, cars.length);
  cars.forEach((_, i) => carBody.setColorAt(i, new THREE.Color(carPalette[i % carPalette.length])));
  carBody.castShadow = shadows;
  carBody.frustumCulled = carCab.frustumCulled = false;
  // lights + trails: one additive mesh per car, vertex-coloured (white ahead, red behind, fading to black = nothing)
  const trailG = trailGeometry();
  const trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  trailMat.color.setScalar(0);
  const carTrail = new THREE.InstancedMesh(trailG, trailMat, cars.length);
  carTrail.frustumCulled = false;
  carTrail.renderOrder = 2;
  ground.add(carBody, carCab, carTrail);

  // ── state + animation
  let gGround = -1, gCity = -1, built = 0, lit = 0.3, solidK = -1, night = 0;
  const clay = new THREE.Color("#F1F1EE");
  const P = { stone: new THREE.Color(), glass: new THREE.Color(), roof: new THREE.Color(), metal: new THREE.Color(), lamp: new THREE.Color() };
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tmpC = new THREE.Color();
  let lifeK = 0;
  const yawOf = cars.map((c) => Math.atan2(-c.lane.dz, c.lane.dx));

  function placeMovers(t: number) {
    const k = Math.max(1e-4, lifeK);
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i]!, L = c.lane;
      const s = (((c.s + c.v * t) % L.len) + L.len) % L.len;
      const edge = Math.min(1, s / 5, (L.len - s) / 5);
      tmpP.set(L.ox + L.dx * s, Y0, L.oz + L.dz * s);
      tmpQ.setFromAxisAngle(up, yawOf[i]!);
      tmpS.setScalar(Math.max(1e-4, edge * k));
      tmpM.compose(tmpP, tmpQ, tmpS);
      carBody.setMatrixAt(i, tmpM);
      carCab.setMatrixAt(i, tmpM);
      carTrail.setMatrixAt(i, tmpM);
    }
    carBody.instanceMatrix.needsUpdate = carCab.instanceMatrix.needsUpdate = carTrail.instanceMatrix.needsUpdate = true;
  }

  function paintBuilt() {
    const k = built;
    G.stone.color.copy(clay).lerp(P.stone, k);
    G.roof.color.copy(clay).lerp(P.roof, k);
    G.plant.color.copy(clay).lerp(P.metal, k);
    G.plant.metalness = 0.3 * k;
    for (const gm of [G.glass, G.ribbon]) {
      tmpC.copy(clay).multiplyScalar(0.94);
      gm.color.copy(tmpC).lerp(P.glass, k);
      gm.roughness = gm === G.glass ? 0.18 + 0.7 * (1 - k) : 0.6 + 0.3 * (1 - k);
      gm.metalness = gm === G.glass ? 0.35 * k : 0;
      gm.envMapIntensity = gm === G.glass ? 0.2 + 0.6 * k : 0.3 * k;
      gm.emissiveIntensity = k * Math.max(0, lit - 0.1) * 1.3;
    }
  }

  function buildPortfolio(items: PortfolioItem[]) {
    for (const pb of pbs) {
      pb.g.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      portfolioRoot.remove(pb.g);
    }
    pbs = [];
    items.slice(0, SLOTS.length).forEach((it, slot) => {
      const sl = SLOTS[slot]!;
      const lv = (it.level === 3 ? 3 : it.level === 2 ? 2 : 1) as 1 | 2 | 3;
      const parts = portfolioParts(lv);
      const { g, top } = archGroup(parts, 900 + slot * 13 + it.id.length, PM);
      const hi = parts[parts.length - 1]!;
      const roofY = (hi.from ?? 0) * FH + hi.floors * (hi.rhythm === "shop" ? 4.2 : FH) + 1.05;
      const line = new THREE.Mesh(accentLine(hi.w, hi.d, roofY), PM.accent);
      line.position.set(hi.x, 0, hi.z);
      g.add(line);
      g.position.set(sl.x, KY + 0.12, sl.z);
      g.userData.id = it.id;
      portfolioRoot.add(g);
      pbs.push({ id: it.id, slot, g, top, a: 0.1 + slot * 0.06 });
    });
    slotPlots.forEach((m, i) => (m.visible = i >= pbs.length));
    gCity = -1;
    district.setCity(Math.max(0, cityG));
  }
  let cityG = 0;

  const district: District = {
    ground, city,
    get built() {
      return built;
    },
    setGround(g) {
      g = clamp01(g);
      if (g === gGround) return;
      gGround = g;
      ground.visible = g > 0;
      for (const b of blocks) {
        const k = easeOut(win(g, b.a, 0.3));
        b.mesh.visible = k > 0;
        b.mesh.position.y = (1 - k) * -1.2;
      }
      markSet.setGrowth(g);
      plots.setGrowth(g);
      trunks.setGrowth(g);
      crowns.setGrowth(g);
      poles.setGrowth(g);
      heads.setGrowth(g);
      pools.setGrowth(g);
      const sk = easeOut(win(g, 0.5, 0.4));
      for (const m of slotPlots) m.scale.setScalar(Math.max(1e-3, sk));
      lifeK = easeOut(win(g, 0.55, 0.4));
      carBody.visible = carCab.visible = lifeK > 0;
      carTrail.visible = lifeK > 0 && night > 0.02;
    },
    setCity(g) {
      g = clamp01(g);
      cityG = g;
      if (g === gCity) return;
      gCity = g;
      city.visible = g > 0;
      for (const b of buildings) {
        const k = easeOut(win(g, b.a, 0.42));
        b.g.visible = k > 0;
        b.g.scale.y = Math.max(1e-3, k);
      }
      for (const pb of pbs) {
        const k = easeOut(win(g, pb.a, 0.42));
        pb.g.visible = k > 0;
        pb.g.scale.y = Math.max(1e-3, k);
      }
      plots.mesh.visible = g < 0.6 && gGround > 0;
    },
    setBuilt(k) {
      built = clamp01(k);
      paintBuilt();
    },
    setSolid(k) {
      k = clamp01(k);
      if (k === solidK) return;
      solidK = k;
      const op = 0.2 + 0.8 * easeOut(k);
      for (const m of Object.values(G)) {
        const tr = op < 0.995;
        if (m.transparent !== tr) {
          m.transparent = tr;
          m.needsUpdate = true;
        }
        m.opacity = op;
        m.depthWrite = op > 0.6;
      }
      for (const b of buildings) b.g.traverse((o) => (o.castShadow = shadows && op > 0.6));
    },
    setPortfolio(items) {
      buildPortfolio(items);
    },
    portfolioAnchors() {
      return pbs.filter((pb) => pb.g.visible).map((pb) => ({ id: pb.id, p: new THREE.Vector3(pb.g.position.x, pb.g.position.y + pb.top * pb.g.scale.y + 1.5, pb.g.position.z) }));
    },
    applyPalette(p) {
      M.kerb.color.copy(p.kerb);
      M.paving.color.copy(p.paving);
      M.grass.color.copy(p.grass);
      M.water.color.copy(p.water);
      M.water.envMapIntensity = p.env;
      M.marking.color.copy(p.marking);
      M.trunk.color.copy(p.trunk);
      M.crown.color.set(0xffffff);
      M.pole.color.copy(p.metal);
      night = clamp01((p.lit - 0.25) / 0.65);
      M.lampHead.color.copy(p.lamp).lerp(p.stone, 1 - night);
      M.lampHead.emissive.copy(p.lamp);
      M.lampHead.emissiveIntensity = night * 2.6;
      poolMat.color.copy(p.lamp);
      poolMat.opacity = night * 0.55;
      pools.mesh.visible = night > 0.02 && gGround > 0;
      trailMat.color.setScalar(night);
      carTrail.visible = lifeK > 0 && night > 0.02;
      for (let i = 0; i < crowns.count; i++) crowns.setColor(i, tmpC.copy(p.tree).lerp(p.treeAlt, (i * 0.618) % 1));
      clay.copy(p.clay);
      P.stone.copy(p.stone);
      P.glass.copy(p.glass);
      P.roof.copy(p.roof);
      P.metal.copy(p.metal);
      lit = p.lit;
      for (const gm of [G.glass, G.ribbon, PM.glass, PM.ribbon]) gm.emissive.copy(p.windowLit);
      PM.stone.color.copy(p.stone);
      PM.roof.color.copy(p.roof);
      PM.plant.color.copy(p.metal);
      PM.glass.color.copy(p.glass);
      PM.ribbon.color.copy(p.glass);
      PM.glass.envMapIntensity = p.env;
      PM.glass.emissiveIntensity = PM.ribbon.emissiveIntensity = Math.max(0, lit - 0.1) * 1.4;
      PM.accent.color.copy(p.money);
      PM.accent.emissive.copy(p.money);
      PM.accent.emissiveIntensity = 0.5 + 1.2 * night;
      paintBuilt();
    },
    update(_dt, t) {
      if (!ground.visible || lifeK <= 0) return false;
      placeMovers(t);
      return true;
    },
    bounds() {
      return new THREE.Box3(new THREE.Vector3(-BASE_X, Y0 - BASE_T, -BASE_Z), new THREE.Vector3(BASE_X, 30, BASE_Z));
    },
    ghostBoxes() {
      const out: THREE.Box3[] = [];
      for (const b of buildings)
        for (const p of b.spec.parts) {
          const fh = (p.rhythm ?? "fins") === "shop" ? 4.2 : FH;
          const y0 = KY + 0.12 + (p.from ?? 0) * FH;
          out.push(new THREE.Box3(new THREE.Vector3(b.spec.x + p.x - p.w / 2, y0, b.spec.z + p.z - p.d / 2), new THREE.Vector3(b.spec.x + p.x + p.w / 2, y0 + p.floors * fh, b.spec.z + p.z + p.d / 2)));
        }
      return out;
    },
    framePoints() {
      const pts: THREE.Vector3[] = [];
      for (const x of [-BASE_X, BASE_X]) for (const z of [-BASE_Z, BASE_Z]) pts.push(new THREE.Vector3(x, Y0 - BASE_T, z), new THREE.Vector3(x, Y0, z));
      for (const b of buildings) {
        const [pw, pd] = b.spec.plot;
        for (const sx of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) pts.push(new THREE.Vector3(b.spec.x + sx * pw, KY + b.top, b.spec.z + sz * pd));
      }
      for (const sx of [-14, 14]) for (const sz of [-8, 8]) pts.push(new THREE.Vector3(sx, 12 * 3.2 + 8, sz));
      return pts;
    },
    dispose() {
      for (const grp of [ground, city])
        grp.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
          }
        });
      poolMat.map?.dispose();
    },
  };
  district.setGround(0);
  district.setCity(0);
  district.setSolid(0);
  placeMovers(0);
  return district;
}

/** Soft radial falloff (white centre → transparent) for lamp pools. */
function radialTex(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.4, "rgba(255,255,255,0.45)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Car-local (x forward) light geometry: headlamps + tail lamps on the body, a soft headlight beam on the road ahead
 * and a long red trail behind (long-exposure look). Vertex colours fade to black, which is "nothing" when additive.
 */
function trailGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], ca: number[], cb: number[], cc: number[], cd: number[]) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    col.push(...ca, ...cb, ...cc, ...ca, ...cc, ...cd);
  };
  const y = 0.03;
  const W = [1.0, 0.95, 0.85], Wd = [0.35, 0.33, 0.28], K = [0, 0, 0];
  const Rd = [1.0, 0.16, 0.12], Rdim = [0.45, 0.05, 0.04];
  // headlight beam: 1.3 → 9 ahead, widening
  quad([1.3, y, -0.5], [9, y, -1.3], [9, y, 1.3], [1.3, y, 0.5], Wd, K, K, Wd);
  // tail trail: −1.3 → −12 behind
  quad([-12, y, -0.45], [-1.3, y, -0.45], [-1.3, y, 0.45], [-12, y, 0.45], K, Rdim, Rdim, K);
  // lamps: small vertical quads at the nose (white) and tail (red), both sides
  for (const z of [-0.42, 0.42]) {
    quad([1.31, 0.42, z - 0.16], [1.31, 0.42, z + 0.16], [1.31, 0.6, z + 0.16], [1.31, 0.6, z - 0.16], W, W, W, W);
    quad([-1.31, 0.45, z + 0.16], [-1.31, 0.45, z - 0.16], [-1.31, 0.62, z - 0.16], [-1.31, 0.62, z + 0.16], Rd, Rd, Rd, Rd);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}
