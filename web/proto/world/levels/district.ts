// WS-B · Levels base + 3 "District": the diorama base (always), the streets around the tower (level 2) and the
// company-growth buildings (level 3). Pure THREE; the world drives setGround/setCity/setBuilt and update().
import * as THREE from "three";
import { PopSet, Y0, at, clamp01, easeOut, facade, merge, rbox, rng, treeGeos, uvBox, win, type Inst } from "./kit";
import type { Palette } from "./palette";

export const BASE_X = 120, BASE_Z = 80, BASE_T = 3.2;
const ROAD_X = 28, ROAD_Z = 20, ROAD_W = 9;
const KERB = 0.2; // block top above street
const KY = Y0 + KERB;
const COLS: [number, number][] = [[-116, -ROAD_X - ROAD_W / 2], [-ROAD_X + ROAD_W / 2, ROAD_X - ROAD_W / 2], [ROAD_X + ROAD_W / 2, 116]];
const ROWS: [number, number][] = [[-76, -ROAD_Z - ROAD_W / 2], [-ROAD_Z + ROAD_W / 2, ROAD_Z - ROAD_W / 2], [ROAD_Z + ROAD_W / 2, 76]];

type Kind = "curtain" | "punched" | "ribbon" | "shop";
type Vol = { x: number; z: number; w: number; d: number; h: number; y?: number; kind: Kind; seed?: number };
type BSpec = { id: string; x: number; z: number; color: "glass" | string; vols: Vol[]; extras?: (g: THREE.Group, m: Mats) => void; plot: [number, number] };
type Mats = { stone: THREE.MeshStandardMaterial; roof: THREE.MeshStandardMaterial; metal: THREE.MeshStandardMaterial; dark: THREE.MeshStandardMaterial; leaf: THREE.MeshStandardMaterial };

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

  const atM = (m: THREE.Mesh, x: number, y: number, z: number) => {
    m.position.set(x, y, z);
    return m;
  };
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
    person: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
  };
  const bm: Mats = {
    stone: new THREE.MeshStandardMaterial({ roughness: 0.82 }),
    roof: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    metal: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ color: "#1F2A3A", roughness: 0.25, metalness: 0.6, envMap: opts.env }),
    leaf: new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }),
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
        // planters left/right of the tower with a soft lawn
        for (const sx of [-1, 1]) {
          const p = mk(rbox(5.2, 0.5, d - 6, 0.2), M.kerb, false);
          p.position.set(cx + sx * (w / 2 - 3.6), KY + 0.25, cz);
          const gr = mk(new THREE.BoxGeometry(4.4, 0.05, d - 6.8), M.grass, false);
          gr.position.set(cx + sx * (w / 2 - 3.6), KY + 0.51, cz);
          g.add(p, gr);
        }
      } else {
        const inset = 3.2;
        const lawn = mk(rbox(w - inset * 2, 0.12, d - inset * 2, 0.4), M.grass, false);
        lawn.position.set(cx, KY + 0.06, cz);
        g.add(lawn);
        if (isPark) {
          // pond with a stone rim, and two crossing paths
          const pond = new THREE.Shape();
          pond.absellipse(0, 0, 15, 8, 0, Math.PI * 2, false, 0.15);
          const rim = new THREE.Shape();
          rim.absellipse(0, 0, 16.2, 9.1, 0, Math.PI * 2, false, 0.15);
          const rimM = mk(new THREE.ShapeGeometry(rim, 48).rotateX(-Math.PI / 2), M.paving, false);
          rimM.position.set(cx + 6, KY + 0.14, cz + 2);
          const water = mk(new THREE.ShapeGeometry(pond, 48).rotateX(-Math.PI / 2), M.water, false);
          water.position.set(cx + 6, KY + 0.16, cz + 2);
          const p1 = mk(new THREE.BoxGeometry(2.2, 0.04, d - 6).rotateY(0.35), M.paving, false);
          p1.position.set(cx - 12, KY + 0.13, cz);
          const p2 = mk(new THREE.BoxGeometry(w - 6, 0.04, 2.2), M.paving, false);
          p2.position.set(cx, KY + 0.13, cz - 14);
          g.add(rimM, water, p1, p2);
        }
      }
      ground.add(g);
      const dist = Math.hypot(cx, cz);
      blocks.push({ mesh: g, a: isTower ? 0 : 0.06 + dist / 400 });
    }),
  );

  // ── buildings (level 3) — each a "next step" of the company: HQ, homes, studio, lab, offices, store, warehouse
  const specs: BSpec[] = [
    {
      id: "hq", x: -74, z: -50, color: "glass", plot: [26, 22],
      vols: [
        { x: 0, z: 0, w: 22, d: 18, h: 16 * 3.2, kind: "curtain", seed: 7 },
        { x: -1.5, z: -1, w: 16, d: 13, h: 5 * 3.2, y: 16 * 3.2, kind: "curtain", seed: 8 },
      ],
      extras(g, m) {
        const h = 21 * 3.2;
        g.add(atM(new THREE.Mesh(rbox(17, 0.8, 14, 0.1), m.stone), -1.5, h + 0.4, -1));
        g.add(atM(new THREE.Mesh(rbox(5, 2.2, 4, 0.1), m.metal), 2, h + 1.9, -2));
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 12, 8), m.metal);
        mast.position.set(-5, h + 6.8, -3);
        g.add(mast);
        // corner pilasters
        for (const [px, pz] of [[-11, -9], [11, -9], [-11, 9], [11, 9]]) g.add(atM(new THREE.Mesh(new THREE.BoxGeometry(0.9, 16 * 3.2, 0.9), m.stone), px, 8 * 3.2, pz));
      },
    },
    {
      id: "homes", x: 0, z: -50, color: "#EFE7DA", plot: [34, 22],
      vols: [
        { x: 0, z: 2, w: 32, d: 18, h: 6 * 3.2, kind: "punched", seed: 3 },
        { x: -2, z: -1, w: 24, d: 13, h: 4 * 3.2, y: 6 * 3.2, kind: "punched", seed: 4 },
        { x: -4, z: -3, w: 14, d: 9, h: 3 * 3.2, y: 10 * 3.2, kind: "punched", seed: 5 },
      ],
      extras(g, m) {
        // terrace planters on each step
        for (const [x, y, z, w] of [[0, 6 * 3.2, 9.6, 30], [-2, 10 * 3.2, 4.4, 22]] as const) {
          g.add(atM(new THREE.Mesh(rbox(w, 0.5, 1, 0.08), m.stone), x, y + 0.25, z));
          for (let k = 0; k < 5; k++) g.add(atM(new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), m.leaf), x - w / 2 + 3 + k * ((w - 6) / 4), y + 1.1, z));
        }
      },
    },
    {
      id: "studio", x: 74, z: -50, color: "#D8A486", plot: [38, 24],
      vols: [{ x: 0, z: 0, w: 34, d: 20, h: 7.4, kind: "shop", seed: 2 }],
      extras(g, m) {
        // sawtooth roof with north lights
        for (let k = 0; k < 6; k++) {
          const tri = new THREE.Shape();
          tri.moveTo(0, 0);
          tri.lineTo(5.6, 0);
          tri.lineTo(5.6, 2.6);
          tri.closePath();
          const geo = new THREE.ExtrudeGeometry(tri, { depth: 19, bevelEnabled: false });
          geo.translate(0, 0, -9.5);
          const mesh = new THREE.Mesh(geo, m.roof);
          mesh.position.set(-17 + k * 5.65, 7.4, 0);
          g.add(mesh);
          const glazing = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 18.6), m.dark);
          glazing.position.set(-17 + k * 5.65 + 5.58, 7.4 + 1.25, 0);
          g.add(glazing);
        }
      },
    },
    {
      id: "lab", x: -74, z: 0, color: "#E7EBEF", plot: [26, 26],
      vols: [{ x: 0, z: 0, w: 22, d: 22, h: 6 * 3.2, kind: "ribbon", seed: 6 }],
      extras(g, m) {
        const h = 6 * 3.2;
        g.add(atM(new THREE.Mesh(rbox(23, 0.6, 23, 0.1), m.stone), 0, h + 0.3, 0));
        g.add(atM(new THREE.Mesh(new THREE.SphereGeometry(4.2, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), m.dark), 3, h + 0.6, -3));
      },
    },
    {
      id: "offices", x: 74, z: 0, color: "#DCE3E8", plot: [36, 24],
      vols: [
        { x: -7, z: 0, w: 18, d: 18, h: 9 * 3.2, kind: "curtain", seed: 11 },
        { x: 8, z: 1, w: 14, d: 16, h: 5 * 3.2, kind: "ribbon", seed: 12 },
      ],
      extras(g, m) {
        g.add(atM(new THREE.Mesh(rbox(19, 0.7, 19, 0.1), m.stone), -7, 9 * 3.2 + 0.35, 0));
        g.add(atM(new THREE.Mesh(rbox(15, 0.6, 17, 0.1), m.stone), 8, 5 * 3.2 + 0.3, 1));
        for (let k = 0; k < 4; k++) g.add(atM(new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), m.leaf), 3 + k * 3.2, 5 * 3.2 + 1.4, 6));
      },
    },
    {
      id: "store", x: -74, z: 48, color: "#F2EEE6", plot: [36, 22],
      vols: [{ x: 0, z: -2, w: 30, d: 16, h: 5.2, kind: "shop", seed: 9 }],
      extras(g, m) {
        g.add(atM(new THREE.Mesh(rbox(34, 0.45, 21, 0.12), m.stone), 0, 5.4, 0));
        for (const px of [-16, -8, 0, 8, 16]) g.add(atM(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 5.2, 8), m.metal), px, 2.6, 9.6));
      },
    },
    {
      id: "warehouse", x: 74, z: 48, color: "#C9CFD7", plot: [40, 26],
      vols: [{ x: 0, z: 0, w: 36, d: 22, h: 8.5, kind: "ribbon", seed: 13 }],
      extras(g, m) {
        for (let k = 0; k < 4; k++) g.add(atM(new THREE.Mesh(new THREE.BoxGeometry(4.6, 5, 0.3), m.metal), -12 + k * 8, 2.5, 11.1));
        for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 2.2), m.dark);
          p.rotation.x = -0.35;
          p.position.set(-14 + c * 4.7, 8.5 + 0.6, -6 + r * 4.6);
          g.add(p);
        }
      },
    },
  ];

  type B = { spec: BSpec; g: THREE.Group; facades: THREE.MeshStandardMaterial[]; meshes: THREE.Mesh[]; built: THREE.Color; a: number; top: number };
  const clayMat = new THREE.MeshStandardMaterial({ roughness: 0.92 });
  const clayArr = [clayMat, clayMat, clayMat, clayMat, clayMat, clayMat];
  const bmBase = { stone: new THREE.Color(), roof: new THREE.Color(), metal: new THREE.Color(), dark: new THREE.Color("#1F2A3A"), leaf: new THREE.Color() };
  const buildings: B[] = [];
  const maxD = Math.max(...specs.map((s) => Math.hypot(s.x, s.z)));
  for (const spec of specs) {
    const g = new THREE.Group();
    g.position.set(spec.x, KY + 0.12, spec.z);
    const facades: THREE.MeshStandardMaterial[] = [];
    const meshes: THREE.Mesh[] = [];
    for (const v of spec.vols) {
      const fx = facade(v.kind, v.seed ?? 1);
      const fm = new THREE.MeshStandardMaterial({
        map: fx.map, emissiveMap: fx.lit, emissive: new THREE.Color("#FFE6C4"), emissiveIntensity: 0,
        roughness: v.kind === "curtain" ? 0.2 : 0.75, metalness: v.kind === "curtain" ? 0.3 : 0, envMap: v.kind === "curtain" ? opts.env : null,
      });
      fm.userData.kind = v.kind;
      facades.push(fm);
      const mesh = mk(uvBox(v.w, v.h, v.d, fx.modW, fx.modH, R()), [fm, fm, bm.roof, bm.roof, fm, fm]);
      mesh.position.set(v.x, (v.y ?? 0) + v.h / 2, v.z);
      mesh.userData.builtMat = mesh.material;
      meshes.push(mesh);
      g.add(mesh);
    }
    spec.extras?.(g, bm);
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = shadows;
        o.receiveShadow = shadows;
      }
    });
    city.add(g);
    footprints.push({ x0: spec.x - spec.plot[0] / 2, x1: spec.x + spec.plot[0] / 2, z0: spec.z - spec.plot[1] / 2, z1: spec.z + spec.plot[1] / 2 });
    const top = Math.max(...spec.vols.map((v) => (v.y ?? 0) + v.h)) + (spec.id === "hq" ? 12 : 2);
    buildings.push({ spec, g, facades, meshes, built: new THREE.Color(spec.color === "glass" ? "#5D7187" : spec.color), a: 0.04 + 0.5 * (Math.hypot(spec.x, spec.z) / maxD), top });
  }
  footprints.push({ x0: -18, x1: 18, z0: -11, z1: 11 }); // tower + plinth
  footprints.push({ x0: PARK.cx - 11, x1: PARK.cx + 24, z0: PARK.cz - 8, z1: PARK.cz + 12 }); // pond
  const inFoot = (x: number, z: number, m = 1.5) => footprints.some((f) => x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m);
  const nearCross = (x: number, z: number, m: number) => Math.abs(Math.abs(x) - ROAD_X) < m && Math.abs(Math.abs(z) - ROAD_Z) < m;

  // ── plots: dashed outlines where the next buildings will rise (seen at level 2)
  const plotItems: Inst[] = [];
  for (const s of specs) {
    const [pw, pd] = s.plot;
    const step = 2.4;
    for (let x = -pw / 2; x <= pw / 2 + 0.01; x += step) for (const sz of [-1, 1]) plotItems.push({ x: s.x + x, y: KY + 0.14, z: s.z + (sz * pd) / 2, sx: 1.2, sz: 0.22, a: 0.45 + R() * 0.2 });
    for (let z = -pd / 2 + step; z < pd / 2 - 0.01; z += step) for (const sx of [-1, 1]) plotItems.push({ x: s.x + (sx * pw) / 2, y: KY + 0.14, z: s.z + z, sx: 0.22, sz: 1.2, a: 0.45 + R() * 0.2 });
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
    for (const iz of [-ROAD_Z, ROAD_Z]) {
      for (let k = -3; k <= 3; k++) {
        for (const s of [-1, 1]) {
          marks.push({ x: ix + k * 1.05, y: Y0 + 0.01, z: iz + s * 6.2, sx: 0.55, sz: 2.6, a: 0.25 });
          marks.push({ x: ix + s * 6.2, y: Y0 + 0.01, z: iz + k * 1.05, sx: 2.6, sz: 0.55, a: 0.25 });
        }
      }
    }
  const markSet = new PopSet(new THREE.BoxGeometry(1, 0.03, 1), M.marking, marks, 0.25);
  ground.add(markSet.mesh);

  // ── trees: street rows + plaza planters + park clusters
  const trees: Inst[] = [];
  const tcol = () => new THREE.Color().setScalar(1);
  const pushTree = (x: number, z: number, s: number, a: number, y = KY) => trees.push({ x, y, z, sx: s, sy: s * (0.9 + R() * 0.25), sz: s, ry: R() * 6, a, color: tcol() });
  const edgeIn = 1.6;
  for (const [x0, x1] of COLS)
    for (const [z0, z1] of ROWS) {
      for (let x = x0 + 4; x < x1 - 3; x += 8.5)
        for (const z of [z0 + edgeIn, z1 - edgeIn]) if (!inFoot(x, z, 0.5) && !nearCross(x, z, 6.5)) pushTree(x, z, 0.85 + R() * 0.3, 0.12 + Math.hypot(x, z) / 220);
      for (let z = z0 + 4; z < z1 - 3; z += 8.5)
        for (const x of [x0 + edgeIn, x1 - edgeIn]) if (!inFoot(x, z, 0.5) && !nearCross(x, z, 6.5)) pushTree(x, z, 0.85 + R() * 0.3, 0.12 + Math.hypot(x, z) / 220);
    }
  for (const sx of [-1, 1]) for (let z = -10; z <= 10; z += 5) pushTree(sx * 19.9, z, 0.95 + R() * 0.2, 0.1 + R() * 0.1, KY + 0.5);
  for (let k = 0; k < 22; k++) {
    const ang = R() * Math.PI * 2, rr = 19 + R() * 9;
    const x = PARK.cx + 6 + Math.cos(ang) * rr * 0.95, z = PARK.cz + 2 + Math.sin(ang) * rr * 0.6;
    if (Math.abs(x) < 23 && z > ROWS[2][0] + 2.5 && z < ROWS[2][1] - 2.5) pushTree(x, z, 0.9 + R() * 0.5, 0.3 + R() * 0.25);
  }
  const tg = treeGeos();
  const trunks = new PopSet(tg.trunk, M.trunk, trees.map((t) => ({ ...t, color: undefined })), 0.22);
  const crowns = new PopSet(tg.crown, M.crown, trees, 0.22);
  trunks.mesh.castShadow = crowns.mesh.castShadow = shadows;
  crowns.mesh.receiveShadow = shadows;
  ground.add(trunks.mesh, crowns.mesh);

  // ── street lamps
  const lamps: Inst[] = [];
  for (const rx of [-ROAD_X, ROAD_X]) for (let z = -BASE_Z + 8; z < BASE_Z - 6; z += 14) if (Math.abs(Math.abs(z) - ROAD_Z) > 8) for (const s of [-1, 1]) lamps.push({ x: rx + s * (ROAD_W / 2 + 0.7), y: KY, z: z + s * 3, a: 0.3 + Math.abs(z) / 300 });
  for (const rz of [-ROAD_Z, ROAD_Z]) for (let x = -BASE_X + 8; x < BASE_X - 6; x += 14) if (Math.abs(Math.abs(x) - ROAD_X) > 8) for (const s of [-1, 1]) lamps.push({ x: x + s * 3, y: KY, z: rz + s * (ROAD_W / 2 + 0.7), a: 0.3 + Math.abs(x) / 300 });
  const poleG = new THREE.CylinderGeometry(0.05, 0.07, 3.4, 6).translate(0, 1.7, 0);
  const headG = new THREE.SphereGeometry(0.22, 10, 8).translate(0, 3.5, 0);
  const poles = new PopSet(poleG, M.pole, lamps, 0.2, "y");
  const heads = new PopSet(headG, M.lampHead, lamps, 0.2);
  // warm light pools under the lamps (only visible when lights are on)
  const poolMat = new THREE.MeshBasicMaterial({ color: "#FFD9A0", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const pools = new PopSet(new THREE.CircleGeometry(2.6, 24).rotateX(-Math.PI / 2), poolMat, lamps.map((l) => ({ ...l, y: Y0 + 0.03 })), 0.2);
  pools.mesh.renderOrder = 1;
  ground.add(poles.mesh, heads.mesh, pools.mesh);

  // ── cars on 8 lanes (drive on the right), people on sidewalks and in the plaza
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
    if (li % 4 === 3) return; // six cars in all: a quiet street, not a traffic sim
    cars.push({ lane, s: R() * lane.len, v: 5 + R() * 3.5 });
  });
  const carPalette = ["#F4F5F7", "#C9CED6", "#2D3440", "#5B6B7F", "#D9CBB4", "#9AA7B4", "#0AC18E", "#E8E2D6"];
  const bodyG = merge([at(rbox(2.6, 0.62, 1.22, 0.18), 0, 0.5, 0), at(new THREE.BoxGeometry(2.2, 0.3, 1.08), 0, 0.2, 0)]);
  const cabG = rbox(1.35, 0.5, 1.06, 0.16).translate(-0.12, 1.0, 0);
  const carBody = new THREE.InstancedMesh(bodyG, M.car, cars.length);
  const carCab = new THREE.InstancedMesh(cabG, M.cabin, cars.length);
  cars.forEach((_, i) => carBody.setColorAt(i, new THREE.Color(carPalette[i % carPalette.length])));
  carBody.castShadow = shadows;
  carBody.frustumCulled = carCab.frustumCulled = false;
  ground.add(carBody, carCab);

  type Walker = { ox: number; oz: number; dx: number; dz: number; len: number; s: number; v: number; circle?: { cx: number; cz: number; r: number } };
  const walkers: Walker[] = [];
  for (const rx of [-ROAD_X, ROAD_X])
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) walkers.push({ ox: rx + s * (ROAD_W / 2 + 1.1), oz: -BASE_Z + 4, dx: 0, dz: 1, len: BASE_Z * 2 - 8, s: R() * 150, v: (R() < 0.5 ? -1 : 1) * (0.9 + R() * 0.6) });
  for (const rz of [-ROAD_Z, ROAD_Z])
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) walkers.push({ ox: -BASE_X + 4, oz: rz + s * (ROAD_W / 2 + 1.1), dx: 1, dz: 0, len: BASE_X * 2 - 8, s: R() * 230, v: (R() < 0.5 ? -1 : 1) * (0.9 + R() * 0.6) });
  for (let k = 0; k < 10; k++) walkers.push({ ox: 0, oz: 0, dx: 0, dz: 0, len: 1, s: R() * 10, v: (R() < 0.5 ? -1 : 1) * (0.05 + R() * 0.05), circle: { cx: (R() - 0.5) * 30, cz: 12 + R() * 2.5, r: 1 + R() * 3 } });
  for (let k = 0; k < 8; k++) walkers.push({ ox: 0, oz: 0, dx: 0, dz: 0, len: 1, s: R() * 10, v: (R() < 0.5 ? -1 : 1) * 0.04, circle: { cx: PARK.cx + 6, cz: PARK.cz + 2, r: 17 + R() * 1.2 } });
  const personG = merge([at(new THREE.CylinderGeometry(0.17, 0.22, 0.8, 8), 0, 0.42, 0), at(new THREE.SphereGeometry(0.17, 10, 8), 0, 1.0, 0)]);
  const people = new THREE.InstancedMesh(personG, M.person, walkers.length);
  const ppl = ["#2D3440", "#E9E4DA", "#B85C4A", "#3D5A80", "#D9A441", "#5B6B7F", "#F4F5F7", "#0AC18E"];
  walkers.forEach((_, i) => people.setColorAt(i, new THREE.Color(ppl[i % ppl.length])));
  people.frustumCulled = false;
  people.castShadow = shadows;
  ground.add(people);

  // ── state + animation
  let gGround = -1, gCity = -1, built = 0, lit = 0.3, solidK = -1;
  let clay = new THREE.Color("#F1F1EE");
  const glassC = new THREE.Color("#5D7187");
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let lifeK = 0;

  function placeMovers(t: number) {
    const k = Math.max(1e-4, lifeK);
    cars.forEach((c, i) => {
      const L = c.lane;
      const s = (((c.s + c.v * t) % L.len) + L.len) % L.len;
      const edge = Math.min(1, s / 5, (L.len - s) / 5);
      tmpP.set(L.ox + L.dx * s, Y0, L.oz + L.dz * s);
      tmpQ.setFromAxisAngle(up, Math.atan2(-L.dz, L.dx));
      tmpS.setScalar(Math.max(1e-4, edge * k));
      tmpM.compose(tmpP, tmpQ, tmpS);
      carBody.setMatrixAt(i, tmpM);
      carCab.setMatrixAt(i, tmpM);
    });
    carBody.instanceMatrix.needsUpdate = carCab.instanceMatrix.needsUpdate = true;
    walkers.forEach((w, i) => {
      if (w.circle) {
        const a = w.s + w.v * t;
        tmpP.set(w.circle.cx + Math.cos(a) * w.circle.r, KY + 0.02, w.circle.cz + Math.sin(a) * w.circle.r * 0.62);
      } else {
        const s = (((w.s + w.v * t) % w.len) + w.len) % w.len;
        tmpP.set(w.ox + w.dx * s, KY, w.oz + w.dz * s);
      }
      const bob = 1 + Math.sin(t * 7 + i) * 0.03;
      tmpQ.identity();
      tmpS.set(k, k * bob, k);
      tmpM.compose(tmpP, tmpQ, tmpS);
      people.setMatrixAt(i, tmpM);
    });
    people.instanceMatrix.needsUpdate = true;
  }

  function paintBuilt() {
    const k = built;
    bm.stone.color.copy(clay).lerp(bmBase.stone, k);
    bm.roof.color.copy(clay).lerp(bmBase.roof, k);
    bm.metal.color.copy(clay).lerp(bmBase.metal, k);
    bm.metal.metalness = 0.5 * k;
    bm.dark.color.copy(clay).lerp(bmBase.dark, k);
    bm.dark.metalness = 0.6 * k;
    bm.dark.roughness = 0.25 + 0.65 * (1 - k);
    bm.leaf.color.copy(clay).lerp(bmBase.leaf, k);
    clayMat.color.copy(clay);
    for (const b of buildings) {
      for (const m of b.meshes) m.material = k <= 0.001 ? clayArr : (m.userData.builtMat as THREE.Material[]);
      for (const fm of b.facades) {
        const target = fm.userData.kind === "curtain" && b.spec.color === "glass" ? glassC : b.built;
        fm.color.copy(clay).lerp(target, built);
        fm.emissiveIntensity = built * (0.15 + 1.2 * lit);
      }
    }
  }

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
      lifeK = easeOut(win(g, 0.55, 0.4));
      carBody.visible = carCab.visible = lifeK > 0;
      people.visible = false; // too small to read at these zooms
    },
    setCity(g) {
      g = clamp01(g);
      if (g === gCity) return;
      gCity = g;
      city.visible = g > 0;
      for (const b of buildings) {
        const k = easeOut(win(g, b.a, 0.42));
        b.g.visible = k > 0;
        b.g.scale.y = Math.max(1e-3, k);
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
      for (const m of [clayMat, bm.stone, bm.roof, bm.metal, bm.dark, bm.leaf]) {
        const tr = op < 0.995;
        if (m.transparent !== tr) {
          m.transparent = tr;
          m.needsUpdate = true;
        }
        m.opacity = op;
        m.depthWrite = op > 0.6;
      }
      for (const b of buildings) for (const mesh of b.meshes) mesh.castShadow = shadows && op > 0.6;
    },
    applyPalette(p) {
      M.kerb.color.copy(p.kerb);
      M.paving.color.copy(p.paving);
      M.grass.color.copy(p.grass);
      M.water.color.copy(p.water);
      M.water.envMapIntensity = p.env;
      M.marking.color.copy(p.marking);
      M.trunk.color.copy(p.trunk);
      M.crown.color.set("#FFFFFF");
      M.pole.color.copy(p.metal);
      M.lampHead.color.copy(p.lamp).lerp(p.stone, 1 - p.lit);
      M.lampHead.emissive.copy(p.lamp);
      M.lampHead.emissiveIntensity = Math.max(0, p.lit - 0.3) * 2.2;
      poolMat.color.copy(p.lamp);
      poolMat.opacity = Math.max(0, p.lit - 0.55) * 0.32;
      M.person.color.set("#FFFFFF");
      bmBase.stone.copy(p.stone);
      bmBase.roof.copy(p.roof);
      bmBase.metal.copy(p.metal);
      bmBase.leaf.copy(p.tree);
      crowns.mesh.material = M.crown;
      for (let i = 0; i < crowns.count; i++) {
        const c = p.tree.clone().lerp(p.treeAlt, (i * 0.618) % 1);
        crowns.setColor(i, c);
      }
      clay = p.clay.clone();
      glassC.copy(p.glass);
      lit = p.lit;
      for (const b of buildings) for (const fm of b.facades) fm.emissive.copy(p.windowLit);
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
    },
  };
  district.setGround(0);
  district.setCity(0);
  district.setSolid(0);
  placeMovers(0);
  return district;
}
