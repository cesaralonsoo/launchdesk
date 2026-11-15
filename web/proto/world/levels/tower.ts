// WS-B · Level 2 "Building": a light-stone + glass tower built around the level-1 office.
// The office never moves: it is floor 0 (y = 0). Upper floors stack on top of it, one by one, and light up.
import * as THREE from "three";
import { Y0, at, clamp01, easeOut, facade, merge, rbox, uvBox, win } from "./kit";
import type { Palette } from "./palette";

export const FLOOR_H = 3.2;
export const FLOORS = 12; // incl. the office floor
const GX = 13.5, GZ = 7.2; // glass line (office slab is ±12.45 × ±6.25)
const SX = 13.75, SZ = 7.45; // slab band
const FIN = 3.6; // fin rhythm = two facade modules (mullions every 1.8)
const ROOF_Y = FLOORS * FLOOR_H - 0.55; // top of the last floor's glass

export interface Tower {
  readonly root: THREE.Group;
  /** 0 = only the office (level 1) · 1 = complete tower. Deterministic, any value. */
  setGrowth(g: number): void;
  readonly growth: number;
  applyPalette(p: Palette): void;
  /** Light sweep running up the floors (level-up celebration). */
  sweep(): void;
  setBeacon(on: boolean, pulse?: boolean): void;
  update(dt: number, t: number): boolean;
  bounds(): THREE.Box3;
  /** World point of the roof beacon. */
  beaconPoint(): THREE.Vector3;
  dispose(): void;
}

export function createTower(opts: { quality: "low" | "high"; env: THREE.Texture | null }): Tower {
  const root = new THREE.Group();
  root.name = "tower";
  const shadows = opts.quality === "high";
  const curtain = facade("curtain", 3);
  const hidden = new THREE.MeshBasicMaterial({ visible: false });

  const stone = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
  const roof = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const metal = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.5 });
  const solar = new THREE.MeshStandardMaterial({ color: "#1F2A3A", roughness: 0.25, metalness: 0.6, envMap: opts.env, envMapIntensity: 0.8 });
  const clear = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false, envMap: opts.env });
  const leaf = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
  const beaconMat = new THREE.MeshStandardMaterial({ color: "#0AC18E", emissive: "#0AC18E", emissiveIntensity: 0, roughness: 0.4 });
  const ringMat = new THREE.MeshBasicMaterial({ color: "#0AC18E", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });

  const mk = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], cast = true) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = cast && shadows;
    mesh.receiveShadow = shadows;
    return mesh;
  };

  // fins: one shared geometry per floor height
  function finsGeo(h: number) {
    const list: THREE.BufferGeometry[] = [];
    const nx = Math.round((GX * 2) / FIN);
    for (let k = 1; k < nx; k++) {
      const x = -GX + k * ((GX * 2) / nx);
      list.push(at(new THREE.BoxGeometry(0.16, h, 0.7), x, h / 2, GZ + 0.35));
      list.push(at(new THREE.BoxGeometry(0.16, h, 0.7), x, h / 2, -GZ - 0.35));
    }
    const nz = Math.max(2, Math.round((GZ * 2) / FIN));
    for (let k = 1; k < nz; k++) {
      const z = -GZ + k * ((GZ * 2) / nz);
      list.push(at(new THREE.BoxGeometry(0.7, h, 0.16), GX + 0.35, h / 2, z));
      list.push(at(new THREE.BoxGeometry(0.7, h, 0.16), -GX - 0.35, h / 2, z));
    }
    // solid corner pilasters
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) list.push(at(new THREE.BoxGeometry(0.75, h, 0.75), sx * (GX + 0.2), h / 2, sz * (GZ + 0.2)));
    return merge(list);
  }
  const finG = finsGeo(FLOOR_H);
  const finG0 = finsGeo(FLOOR_H - 0.55);

  // ── floor 0: plinth + clear glass around the office (the office shows through)
  const f0 = new THREE.Group();
  const plinth = mk(rbox(SX * 2 + 1.6, -Y0, SZ * 2 + 1.6, 0.12), stone, false);
  plinth.position.y = Y0 / 2;
  const glass0 = mk(new THREE.BoxGeometry(GX * 2, FLOOR_H - 0.55, GZ * 2), [clear, clear, hidden, hidden, clear, clear], false);
  glass0.position.y = (FLOOR_H - 0.55) / 2;
  glass0.renderOrder = 2;
  const fins0 = mk(finG0, stone);
  // entrance canopy on the front (lobby side, -X front row)
  const canopy = mk(rbox(7, 0.18, 2.2, 0.06), stone);
  canopy.position.set(-8, 2.3, GZ + 1.3);
  f0.add(plinth, glass0, fins0, canopy);
  root.add(f0);

  // ── "your office": floor 0 is outlined in the brand accent and its ceiling band glows, so the office the
  //    user watched at level 1 stays readable as one floor of the tower (and of the district).
  const homeMat = new THREE.LineBasicMaterial({ color: "#0AC18E", transparent: true, opacity: 0, toneMapped: false });
  const homeBox = new THREE.BoxGeometry(GX * 2 + 0.9, FLOOR_H - 0.55, GZ * 2 + 0.9);
  const home = new THREE.LineSegments(new THREE.EdgesGeometry(homeBox), homeMat);
  homeBox.dispose();
  home.position.y = (FLOOR_H - 0.55) / 2;
  home.renderOrder = 3;
  root.add(home);
  let homePulse = -1;

  // ── upper floors
  type Floor = { g: THREE.Group; glass: THREE.MeshStandardMaterial; band: THREE.MeshStandardMaterial; light: number; boost: number };
  const floors: Floor[] = [];
  const bandG = rbox(SX * 2, 0.42, SZ * 2, 0.05);
  const glassG = uvBox(GX * 2, FLOOR_H - 0.55, GZ * 2, curtain.modW, curtain.modH * ((FLOOR_H - 0.55) / FLOOR_H));
  for (let i = 1; i < FLOORS; i++) {
    const g = new THREE.Group();
    g.position.y = i * FLOOR_H - 0.55;
    const band = stone.clone();
    const gm = new THREE.MeshStandardMaterial({
      map: curtain.map, emissiveMap: curtain.lit, emissive: new THREE.Color("#FFE6C4"), emissiveIntensity: 0,
      roughness: 0.18, metalness: 0.35, envMap: opts.env,
    });
    const b = mk(bandG, band);
    b.position.y = 0.34;
    const gl = mk(glassG, [gm, gm, hidden, hidden, gm, gm]);
    gl.position.y = 0.55 + (FLOOR_H - 0.55) / 2;
    const fins = mk(finG, stone);
    g.add(b, gl, fins);
    root.add(g);
    floors.push({ g, glass: gm, band, light: 0, boost: 0 });
  }
  // per-floor texture variety without extra textures: shift u by floor
  floors.forEach((f, i) => {
    const sh = (i * 0.37) % 1;
    const geo = glassG.clone();
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) + sh);
    uv.needsUpdate = true;
    (f.g.children[1] as THREE.Mesh).geometry = geo;
  });

  // ── crown: roof slab, parapet, penthouse, plant, solar, garden, mast + beacon
  const crown = new THREE.Group();
  crown.position.y = ROOF_Y;
  const roofSlab = mk(rbox(SX * 2 + 0.2, 0.7, SZ * 2 + 0.2, 0.08), stone);
  roofSlab.position.y = 0.35;
  const roofTop = mk(new THREE.BoxGeometry(SX * 2 - 0.6, 0.04, SZ * 2 - 0.6), roof, false);
  roofTop.position.y = 0.72;
  const parapetG = merge([
    at(new THREE.BoxGeometry(SX * 2, 0.55, 0.16), 0, 0.97, SZ - 0.08),
    at(new THREE.BoxGeometry(SX * 2, 0.55, 0.16), 0, 0.97, -SZ + 0.08),
    at(new THREE.BoxGeometry(0.16, 0.55, SZ * 2), SX - 0.08, 0.97, 0),
    at(new THREE.BoxGeometry(0.16, 0.55, SZ * 2), -SX + 0.08, 0.97, 0),
  ]);
  const parapet = mk(parapetG, stone);
  const pentMat = new THREE.MeshStandardMaterial({
    map: curtain.map, emissiveMap: curtain.lit, emissive: new THREE.Color("#FFE6C4"), emissiveIntensity: 0, roughness: 0.18, metalness: 0.35, envMap: opts.env,
  });
  const pent = mk(uvBox(10, 2.7, 8.4, curtain.modW, curtain.modH * (2.7 / 3.2), 0.21), [pentMat, pentMat, hidden, hidden, pentMat, pentMat]);
  pent.position.set(-6.5, 0.72 + 1.35, -0.6);
  const pentRoof = mk(rbox(11.4, 0.32, 9.6, 0.08), stone);
  pentRoof.position.set(-6.5, 0.72 + 2.7 + 0.16, -0.6);
  const plant = mk(merge([at(rbox(3.2, 1.6, 2.4, 0.1), 4.2, 0.72 + 0.8, -4.2), at(rbox(2.2, 1.1, 2.2, 0.1), 8.2, 0.72 + 0.55, -4.4), at(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 14), 8.2, 0.72 + 1.35, -4.4)]), metal);
  const solarG: THREE.BufferGeometry[] = [];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 4; c++) {
      const g = new THREE.BoxGeometry(1.7, 0.06, 1.1);
      g.rotateX(-0.42);
      solarG.push(at(g, 2.4 + c * 2.0, 0.72 + 0.45, 0.6 + r * 1.9));
    }
  const solarM = mk(merge(solarG), solar);
  // roof garden: planters + three small trees along the front edge
  const planter = mk(merge([at(rbox(9, 0.5, 1.2, 0.08), 6, 0.72 + 0.25, SZ - 1.4)]), stone);
  const crownsG = merge([0, 1, 2].map((k) => at(new THREE.IcosahedronGeometry(0.75, 1), 2.8 + k * 3.1, 0.72 + 1.45, SZ - 1.4)));
  const roofTrees = mk(crownsG, leaf);
  const mast = mk(merge([at(new THREE.CylinderGeometry(0.07, 0.1, 7, 8), 11.6, 0.72 + 3.5, -5.6), at(new THREE.CylinderGeometry(0.03, 0.03, 3, 6), 10.8, 0.72 + 1.5, -5.6)]), metal);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), beaconMat);
  beacon.position.set(11.6, 0.72 + 7.2, -5.6);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(beacon.position);
  crown.add(roofSlab, roofTop, parapet, pent, pentRoof, plant, solarM, planter, roofTrees, mast, beacon, ring);
  root.add(crown);

  // ── state
  let growth = -1;
  let litLevel = 0.3;
  let sweepT = -1;
  let beaconOn = false;
  let pulseT = -1;
  const lightCol = new THREE.Color("#FFE6C4");

  function setGrowth(g: number) {
    g = clamp01(g);
    if (g === growth) return;
    growth = g;
    root.visible = g > 0;
    const k0 = easeOut(win(g, 0, 0.12));
    f0.visible = k0 > 0;
    plinth.scale.y = Math.max(1e-3, k0);
    plinth.position.y = Y0 + (-Y0 * Math.max(1e-3, k0)) / 2;
    glass0.scale.y = fins0.scale.y = Math.max(1e-3, k0);
    glass0.position.y = ((FLOOR_H - 0.55) / 2) * k0;
    canopy.visible = k0 > 0.9;
    home.visible = g > 0.05;
    homeMat.opacity = 0.9 * easeOut(win(g, 0.05, 0.3));
    floors.forEach((f, idx) => {
      const i = idx + 1;
      const a = 0.1 + (0.62 * (i - 1)) / (FLOORS - 2);
      const k = easeOut(win(g, a, 0.13));
      f.g.visible = k > 0;
      f.g.scale.y = Math.max(1e-3, k);
      f.light = easeOut(win(g, a + 0.07, 0.16));
    });
    const kc = easeOut(win(g, 0.8, 0.14));
    crown.visible = kc > 0;
    crown.scale.set(1, Math.max(1e-3, kc), 1);
    roofTrees.visible = g > 0.92;
    paintLights();
  }

  function paintLights() {
    const base = 0.12 + 1.0 * litLevel;
    for (const f of floors) {
      f.glass.emissiveIntensity = f.light * base + f.boost * 1.6;
      f.band.emissive.copy(lightCol).multiplyScalar(f.boost * 0.35);
    }
    // the band right above the office glows in the accent: "your floor"
    const hb = floors[0]!.band;
    hb.emissive.copy(homeMat.color).multiplyScalar(0.9 * clamp01(growth * 3) + (homePulse >= 0 ? Math.sin(Math.min(1, homePulse) * Math.PI) * 0.6 : 0));
    pentMat.emissiveIntensity = easeOut(win(growth, 0.88, 0.12)) * base;
  }

  const tower: Tower = {
    root,
    get growth() {
      return Math.max(0, growth);
    },
    setGrowth,
    applyPalette(p) {
      stone.color.copy(p.stone);
      for (const f of floors) {
        f.band.color.copy(p.stone);
        f.glass.color.copy(p.glass);
        f.glass.emissive.copy(p.windowLit);
        f.glass.envMapIntensity = p.env;
      }
      pentMat.color.copy(p.glass);
      pentMat.emissive.copy(p.windowLit);
      pentMat.envMapIntensity = p.env;
      clear.color.copy(p.glassClear);
      clear.envMapIntensity = p.env * 0.8;
      roof.color.copy(p.roof);
      metal.color.copy(p.metal);
      leaf.color.copy(p.tree);
      beaconMat.color.copy(p.money);
      homeMat.color.copy(p.money);
      beaconMat.emissive.copy(p.money);
      ringMat.color.copy(p.money);
      lightCol.copy(p.windowLit);
      litLevel = p.lit;
      paintLights();
    },
    sweep() {
      sweepT = 0;
      homePulse = 0;
    },
    setBeacon(on, pulse = true) {
      beaconOn = on;
      if (on && pulse) pulseT = 0;
    },
    update(dt, t) {
      let moving = false;
      if (sweepT >= 0) {
        sweepT += dt / 1.9;
        const pos = sweepT * (FLOORS + 3) - 1.5;
        floors.forEach((f, idx) => {
          const d = pos - (idx + 1);
          f.boost = sweepT >= 1 ? 0 : Math.exp(-(d * d) / 1.4) * f.light;
        });
        if (sweepT >= 1) sweepT = -1;
        paintLights();
        moving = true;
      }
      if (homePulse >= 0) {
        homePulse += dt / 0.6;
        const k = Math.min(1, homePulse);
        home.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.04);
        if (homePulse >= 1) {
          homePulse = -1;
          home.scale.setScalar(1);
        }
        paintLights();
        moving = true;
      }
      const breathe = beaconOn ? 0.55 + 0.45 * Math.sin(t * 2.2) : 0;
      beaconMat.emissiveIntensity = beaconOn ? 0.6 + breathe * 1.4 : 0;
      if (pulseT >= 0) {
        pulseT += dt / 2.4;
        const k = pulseT % 1;
        ring.scale.setScalar(1 + k * 9);
        ringMat.opacity = (1 - k) * 0.55;
        if (pulseT >= 3) {
          pulseT = -1;
          ringMat.opacity = 0;
        }
        moving = true;
      }
      return moving || beaconOn;
    },
    bounds() {
      return new THREE.Box3(new THREE.Vector3(-SX - 0.8, Y0, -SZ - 0.8), new THREE.Vector3(SX + 0.8, ROOF_Y + 8, SZ + 2.4));
    },
    beaconPoint() {
      return root.localToWorld(beacon.position.clone().add(crown.position));
    },
    dispose() {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
    },
  };
  setGrowth(0);
  return tower;
}
