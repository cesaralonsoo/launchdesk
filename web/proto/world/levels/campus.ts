// WP-B (redesign) · World level 3 "Campus": every idea checked in this browser (plus the finished examples, labelled
// by the UI) as a small open building at 40 % scale on one pale ground plate, cut open like the office. A building
// shows exactly its real progress: 0 = only the lobby · 1 = research lit · 2 = the whole floor lit · 3 = + the offices
// floor above. A No-go becomes a single small pavilion. Free plots are dashed squares ("Your next idea").
// No streets, no cars, no filler buildings, no dusk. Everything is baked into a handful of draw calls.
// Implements the old District interface so world/index.ts barely changes.
import * as THREE from "three";
import type { PortfolioItem } from "../../contracts";
import { Lite, liteMaterial, mixHex, type LiteGeo } from "./lite";
import type { Palette } from "./palette";
import { People, type Person } from "./people";
import type { District } from "./district";

export type CampusItem = { id: string; name: string; score?: number; verdict?: string; stage: 0 | 1 | 2 | 3; nogo?: boolean };

export interface Campus extends District {
  setCampus(items: CampusItem[]): void;
  /** Label anchors: one per building ("<id>") and per free plot ("next:<n>"), world space. */
  anchors(): { id: string; p: THREE.Vector3 }[];
  /** Building or free plot under the ray: an item id, "next", or null. */
  pick(ray: THREE.Raycaster): string | null;
  /** Box of one plot (item id or "next:<n>") for push-in shots. */
  plotBox(id: string): THREE.Box3 | null;
}

const S = 0.4; // scale of a building against the real office
const PLOTS: { x: number; z: number }[] = [
  { x: -13, z: 5.2 }, { x: 0, z: 5.2 }, { x: 13, z: 5.2 },
  { x: -13, z: -6.2 }, { x: 0, z: -6.2 }, { x: 13, z: -6.2 },
];
const PLOT_W = 11.6, PLOT_D = 7.6;
const GX = 21.5, GZ = 12.5; // ground plate half extents
const STAGE_TINT = { research: "#4F7CF0", kit: "#E3893B", offices: "#8C6BE8", lobby: "#3A9D8F" };
const OFF_TINTS = ["#E8590C", "#1971C2", "#05875F", "#7048E8"];
const C = { slabCut: "#3A3F4A", floor: "#E9E5DE", wall: "#F4F2EE", cap: "#2E333D", locked: "#C9C6C0", desk: "#D9BF97", ground: "#DDE0D6", path: "#EEEDE7", plot: "#E6E3DB", dash: "#A99BE0", leaf: "#7DB07F", leafDark: "#5E9663", trunk: "#9C7A5B" };

function building(L: Lite, P: Person[], x0: number, z0: number, it: CampusItem, k: number) {
  const W = 24.9 * S, D = 12.5 * S, y = 0.3;
  const rw = 6 * S, rd = 5 * S, corridor = 1.6 * S;
  if (it.nogo) {
    // a single small pavilion: a plate, two low walls, one desk, nobody working
    L.box(5.2, 0.24, 3.6, C.slabCut, x0, 0.06, z0);
    L.box(5.1, 0.04, 3.5, C.floor, x0, 0.3, z0);
    L.box(5.0, 0.7, 0.1, C.wall, x0, 0.34, z0 - 1.7);
    L.box(0.1, 0.7, 3.4, C.wall, x0 - 2.5, 0.34, z0);
    L.box(1.2, 0.3, 0.55, C.desk, x0 - 0.6, 0.34, z0 - 0.9);
    L.box(1.4, 0.6, 0.06, mixHex("#9AA0AA", "#FFFFFF", 0.35), x0 + 1.1, 0.34, z0 - 1.6);
    return { top: 1.3 };
  }
  L.box(W, 0.24, D, C.slabCut, x0, 0.06, z0);
  L.box(W - 0.04, 0.04, D - 0.04, C.floor, x0, y, z0);
  L.box(W - 0.1, 0.75, 0.08, C.wall, x0, y + 0.04, z0 - D / 2 + 0.1);
  L.box(0.08, 0.75, D - 0.1, C.wall, x0 - W / 2 + 0.1, y + 0.04, z0);
  const rooms: { row: 0 | 1; col: number; lit: boolean; tint: string }[] = [];
  for (let c = 0; c < 4; c++) rooms.push({ row: 0, col: c, lit: it.stage >= 1, tint: STAGE_TINT.research });
  rooms.push({ row: 1, col: 0, lit: true, tint: STAGE_TINT.lobby });
  for (let c = 1; c < 4; c++) rooms.push({ row: 1, col: c, lit: it.stage >= 2, tint: STAGE_TINT.kit });
  for (const r of rooms) {
    const cx = x0 - W / 2 + 0.18 + rw / 2 + r.col * rw;
    const cz = z0 + (r.row === 0 ? -(corridor / 2 + rd / 2) : corridor / 2 + rd / 2);
    L.box(rw - 0.12, 0.02, rd - 0.12, r.lit ? mixHex(r.tint, "#FFFFFF", 0.3) : C.locked, cx, y + 0.04, cz);
    // a desk per room; a person only where the work really happened
    L.box(0.75, 0.3, 0.34, r.lit ? C.desk : "#CFCCC6", cx - 0.2, y + 0.06, cz + (r.row === 0 ? -0.45 : 0.1));
    if (r.lit) P.push({ x: cx - 0.2, y: y + 0.04, z: cz + (r.row === 0 ? -0.05 : 0.5), ry: r.row === 0 ? Math.PI : Math.PI * 0.85, shirt: r.tint, skin: k + r.col, working: false, visible: true, scale: S * 1.1 });
    if (r.col > 0) L.box(0.05, 0.42, rd, C.wall, cx - rw / 2, y + 0.04, cz);
  }
  let top = 1.2;
  if (it.stage >= 3) {
    const py = 3.0; // 7.5 m × 0.4
    L.box(W, 0.12, D, C.slabCut, x0, py - 0.1, z0);
    L.box(W - 0.04, 0.03, D - 0.04, C.floor, x0, py + 0.02, z0);
    L.box(W - 0.1, 0.75, 0.08, C.wall, x0, py + 0.05, z0 - D / 2 + 0.1);
    for (let c = 0; c < 4; c++) {
      const cx = x0 - W / 2 + 0.18 + rw / 2 + c * rw;
      L.box(rw - 0.12, 0.02, 2.9, mixHex(OFF_TINTS[c]!, "#FFFFFF", 0.3), cx, py + 0.05, z0 - 0.75);
      L.box(0.75, 0.3, 0.34, C.desk, cx - 0.2, py + 0.07, z0 - 1.5);
      P.push({ x: cx - 0.2, y: py + 0.05, z: z0 - 1.05, ry: Math.PI, shirt: OFF_TINTS[c]!, skin: k + c + 2, working: false, visible: true, scale: S * 1.1 });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.box(0.08, py - 0.1, 0.08, "#C3C8D0", x0 + sx * (W / 2 - 0.1), 0.3, z0 + sz * (D / 2 - 0.1));
    top = py + 1.2;
  }
  return { top };
}

function dashedPlot(L: Lite, x0: number, z0: number) {
  const w = 24.9 * S, d = 12.5 * S;
  L.box(w, 0.03, d, mixHex(C.plot, "#FFFFFF", 0.35), x0, 0.0, z0);
  const dash = 0.42, gap = 0.3;
  const run = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / (dash + gap))), st = len / n;
    for (let i = 0; i < n; i++) {
      const t = (i * st + st / 2) / len;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (Math.abs(bx - ax) > Math.abs(bz - az)) L.box(Math.min(dash, st * 0.7), 0.05, 0.07, C.dash, x, 0.03, z);
      else L.box(0.07, 0.05, Math.min(dash, st * 0.7), C.dash, x, 0.03, z);
    }
  };
  run(x0 - w / 2, z0 - d / 2, x0 + w / 2, z0 - d / 2);
  run(x0 - w / 2, z0 + d / 2, x0 + w / 2, z0 + d / 2);
  run(x0 - w / 2, z0 - d / 2, x0 - w / 2, z0 + d / 2);
  run(x0 + w / 2, z0 - d / 2, x0 + w / 2, z0 + d / 2);
  // a small "+" in the middle of the plot
  L.box(1.1, 0.05, 0.16, C.dash, x0, 0.03, z0);
  L.box(0.16, 0.05, 1.1, C.dash, x0, 0.03, z0);
}

export function createCampus(opts: { quality: "low" | "high"; env?: THREE.Texture | null }): Campus {
  const shadows = opts.quality === "high";
  const ground = new THREE.Group();
  ground.name = "campus-ground";
  const city = new THREE.Group();
  city.name = "campus";

  // ── ground plate: pale, soft paths, a few trees (one mesh)
  const GL = new Lite();
  GL.add(roundedPlate(GX * 2, GZ * 2, 3.2, 0.6), C.slabCut, 0, -0.62, 0);
  GL.add(roundedPlate(GX * 2 - 0.2, GZ * 2 - 0.2, 3.1, 0.06), C.ground, 0, -0.04, 0);
  GL.box(GX * 2 - 5, 0.02, 2.0, C.path, 0, -0.01, -0.5); // the main walk between the two rows
  for (const x of [-6.5, 6.5]) GL.box(1.4, 0.02, GZ * 2 - 5, C.path, x, -0.01, 0);
  for (const p of PLOTS) GL.box(PLOT_W, 0.02, PLOT_D, C.plot, p.x, -0.012, p.z);
  const trees = [[-20, -10.8], [-19.6, 10.6], [19.6, -11], [20, 10.8], [-6.5, 11.4], [6.5, -11.4], [19.8, -0.4], [-19.8, -0.6]];
  trees.forEach(([x, z], i) => {
    GL.cyl(0.12, 0.16, 0.9, C.trunk, x!, 0, z!, 6);
    GL.ball(0.75 + (i % 3) * 0.12, i % 2 ? C.leaf : C.leafDark, x!, 1.35, z!, 1);
  });
  const groundGeo = GL.build();
  const groundMesh = new THREE.Mesh(groundGeo.geo, liteMaterial(opts.env));
  groundMesh.receiveShadow = shadows;
  city.add(groundMesh);

  const mat = liteMaterial(opts.env);
  let mesh: THREE.Mesh | null = null;
  let built: LiteGeo | null = null;
  const people = new People(64, false);
  city.add(people.root);
  let items: CampusItem[] = [];
  let anchorList: { id: string; p: THREE.Vector3 }[] = [];
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const pickers: THREE.Mesh[] = [];
  const plotOf = new Map<string, { x: number; z: number; top: number }>();

  function rebuild() {
    if (mesh) {
      city.remove(mesh);
      built?.geo.dispose();
    }
    for (const p of pickers) {
      city.remove(p);
      p.geometry.dispose();
    }
    pickers.length = 0;
    plotOf.clear();
    const L = new Lite();
    const P: Person[] = [];
    anchorList = [];
    PLOTS.forEach((pl, i) => {
      const it = items[i];
      let id: string, top: number;
      if (it) {
        top = building(L, P, pl.x, pl.z, it, i).top;
        id = it.id;
      } else {
        dashedPlot(L, pl.x, pl.z);
        top = 0.3;
        id = `next:${i - items.length}`;
      }
      plotOf.set(id, { x: pl.x, z: pl.z, top });
      anchorList.push({ id, p: new THREE.Vector3(pl.x, top + 0.9, pl.z) });
      const m = new THREE.Mesh(new THREE.BoxGeometry(PLOT_W, Math.max(1.5, top + 1), PLOT_D), pickMat);
      m.position.set(pl.x, Math.max(1.5, top + 1) / 2, pl.z);
      m.userData.plot = it ? it.id : "next";
      city.add(m);
      pickers.push(m);
    });
    built = L.build();
    mesh = new THREE.Mesh(built.geo, mat);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    city.add(mesh);
    people.set(P);
  }
  rebuild();

  let cityK = 0;
  return {
    ground,
    city,
    setGround() {},
    setCity(g) {
      cityK = g;
      city.visible = g > 0.5;
    },
    setBuilt() {},
    setSolid() {},
    get built() {
      return 1;
    },
    applyPalette(_p: Palette) {},
    update(_dt, t) {
      void cityK;
      return people.pose(t);
    },
    bounds: () => new THREE.Box3(new THREE.Vector3(-GX, -0.7, -GZ), new THREE.Vector3(GX, 6, GZ)),
    framePoints() {
      // polish: the whole ground plate (its dark rim and the edge trees included), so no free plot is ever cut at the
      // screen edge; fitShot adds the breathing margin
      let top = 2.4; // edge trees
      for (const it of items) top = Math.max(top, (plotOf.get(it.id)?.top ?? 0.3) + 1.2);
      const pts: THREE.Vector3[] = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        pts.push(new THREE.Vector3(sx * (GX + 0.2), -0.95, sz * (GZ + 0.2)));
        pts.push(new THREE.Vector3(sx * (GX - 0.5), top, sz * (GZ - 0.5)));
      }
      return pts;
    },
    setPortfolio(_items: PortfolioItem[]) {},
    portfolioAnchors: () => anchorList.filter((a) => !a.id.startsWith("next:")),
    ghostBoxes: () => [],
    setCampus(next) {
      items = next.slice(0, PLOTS.length);
      rebuild();
    },
    anchors: () => anchorList.map((a) => ({ id: a.id, p: a.p.clone() })),
    pick(ray) {
      if (!city.visible) return null;
      const hit = ray.intersectObjects(pickers, false)[0];
      return hit ? (hit.object.userData.plot as string) : null;
    },
    plotBox(id) {
      const p = plotOf.get(id);
      if (!p) return null;
      return new THREE.Box3(new THREE.Vector3(p.x - PLOT_W / 2, -0.3, p.z - PLOT_D / 2), new THREE.Vector3(p.x + PLOT_W / 2, p.top + 0.6, p.z + PLOT_D / 2));
    },
    dispose() {
      groundGeo.geo.dispose();
      (groundMesh.material as THREE.Material).dispose();
      built?.geo.dispose();
      mat.dispose();
      people.dispose();
      for (const p of pickers) p.geometry.dispose();
      pickMat.dispose();
    },
  };
}

/** A flat rounded-rectangle slab (extruded), centred, top at y = h. */
function roundedPlate(w: number, d: number, r: number, h: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const X = w / 2, Z = d / 2;
  s.moveTo(-X + r, -Z);
  s.lineTo(X - r, -Z);
  s.quadraticCurveTo(X, -Z, X, -Z + r);
  s.lineTo(X, Z - r);
  s.quadraticCurveTo(X, Z, X - r, Z);
  s.lineTo(-X + r, Z);
  s.quadraticCurveTo(-X, Z, -X, Z - r);
  s.lineTo(-X, -Z + r);
  s.quadraticCurveTo(-X, -Z, -X + r, -Z);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  g.deleteAttribute("uv");
  return g;
}
