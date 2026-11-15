// WS-A1 · One architectural language for the whole district, shared with the hero tower:
// light stone floor bands + slim vertical fins on a 3.6 m rhythm + blue-grey curtain glass, flat roofs with a
// parapet and a plant box. Variety comes only from massing (podium + shaft, setbacks, slabs, pavilions) and from
// two facade rhythms of the same family: "fins" (vertical, like the tower) and "ribbon" (horizontal spandrels).
import * as THREE from "three";
import { at, merge } from "./kit";

export const FH = 3.2; // floor height (same as the tower)
const FIN = 3.6;

export type Rhythm = "fins" | "ribbon" | "shop";
/** One volume: local centre (x, z), footprint w × d, `floors` floors starting at floor `from` (0 = street). */
export type Part = { x: number; z: number; w: number; d: number; floors: number; from?: number; rhythm?: Rhythm; roof?: boolean };

export type ArchGeos = { stone: THREE.BufferGeometry; glass: THREE.BufferGeometry; ribbon: THREE.BufferGeometry | null; roof: THREE.BufferGeometry; plant: THREE.BufferGeometry | null; top: number };

/** World-unit UVs for a glass box: u along the face (per facade module width), v per floor. Side faces only. */
function glassBox(w: number, h: number, d: number, modW: number, modH: number, uOff: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  const faceW = [d, d, w, w, w, w];
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (f === 2 || f === 3) uv.setXY(i, 0.02, 0.02);
      else uv.setXY(i, uv.getX(i) * (faceW[f]! / modW) + uOff + f * 0.13, uv.getY(i) * (h / modH));
    }
  uv.needsUpdate = true;
  return g;
}

/**
 * Builds merged geometries (building-local, y = 0 at the plot surface) for a list of parts.
 * `modW/modH` = facade texture repeat in world units (kit.facade()).
 */
export function buildArch(parts: Part[], tex: { fins: { modW: number; modH: number }; ribbon: { modW: number; modH: number } }, seed: number, plantBox = true): ArchGeos {
  const stone: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [], ribbon: THREE.BufferGeometry[] = [], roof: THREE.BufferGeometry[] = [], plant: THREE.BufferGeometry[] = [];
  let top = 0;
  let s = seed;
  const r = () => ((s = (s * 16807 + 11) % 2147483647) / 2147483647);
  for (const p of parts) {
    const rh = p.rhythm ?? "fins";
    const fh = rh === "shop" ? 4.2 : FH;
    const y0 = (p.from ?? 0) * FH;
    const H = p.floors * fh;
    top = Math.max(top, y0 + H);
    const gw = p.w - 0.5, gd = p.d - 0.5; // glass line inside the band edge
    const T = rh === "ribbon" ? tex.ribbon : tex.fins;
    const box = glassBox(gw, H, gd, T.modW, rh === "shop" ? T.modH * (4.2 / 3.2) : T.modH, r());
    (rh === "ribbon" ? ribbon : glass).push(at(box, p.x, y0 + H / 2, p.z));
    // floor bands (thin on fins/shop, deep spandrels on ribbon)
    const bandH = rh === "ribbon" ? 0.95 : 0.32;
    for (let f = 0; f <= p.floors; f++) {
      const y = y0 + f * fh;
      if (f === p.floors && p.roof === false) continue;
      const bh = f === p.floors ? 0.7 : f === 0 && y0 === 0 ? 0.25 : bandH;
      stone.push(at(new THREE.BoxGeometry(p.w, bh, p.d), p.x, y + (f === p.floors ? bh / 2 - 0.15 : f === 0 ? bh / 2 : 0), p.z));
    }
    // vertical fins on the fin rhythm; shopfronts get slimmer, wider-spaced mullion piers
    if (rh !== "ribbon") {
      const step = rh === "shop" ? FIN * 1.5 : FIN;
      const fw = rh === "shop" ? 0.22 : 0.14, fd = rh === "shop" ? 0.3 : 0.5;
      const nx = Math.max(1, Math.round(p.w / step)), nz = Math.max(1, Math.round(p.d / step));
      for (let k = 1; k < nx; k++) {
        const x = p.x - p.w / 2 + (k * p.w) / nx;
        for (const sz of [-1, 1]) stone.push(at(new THREE.BoxGeometry(fw, H, fd), x, y0 + H / 2, p.z + sz * (p.d / 2 - 0.02)));
      }
      for (let k = 1; k < nz; k++) {
        const z = p.z - p.d / 2 + (k * p.d) / nz;
        for (const sx of [-1, 1]) stone.push(at(new THREE.BoxGeometry(fd, H, fw), p.x + sx * (p.w / 2 - 0.02), y0 + H / 2, z));
      }
      // slim corner posts (glass corners read premium; a post keeps the edge crisp)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) stone.push(at(new THREE.BoxGeometry(0.3, H, 0.3), p.x + sx * (p.w / 2 - 0.1), y0 + H / 2, p.z + sz * (p.d / 2 - 0.1)));
    }
    if (p.roof !== false) {
      // parapet + roof membrane
      const py = y0 + H + 0.55 + 0.25;
      stone.push(
        at(new THREE.BoxGeometry(p.w, 0.5, 0.14), p.x, py, p.z + p.d / 2 - 0.07),
        at(new THREE.BoxGeometry(p.w, 0.5, 0.14), p.x, py, p.z - p.d / 2 + 0.07),
        at(new THREE.BoxGeometry(0.14, 0.5, p.d), p.x + p.w / 2 - 0.07, py, p.z),
        at(new THREE.BoxGeometry(0.14, 0.5, p.d), p.x - p.w / 2 + 0.07, py, p.z),
      );
      roof.push(at(new THREE.BoxGeometry(p.w - 0.3, 0.04, p.d - 0.3), p.x, y0 + H + 0.57, p.z));
    }
  }
  // one plant box on the highest roof (the tower has the same kit)
  if (plantBox) {
    const hi = parts.reduce((a, b) => ((b.from ?? 0) * FH + b.floors * (b.rhythm === "shop" ? 4.2 : FH) > (a.from ?? 0) * FH + a.floors * (a.rhythm === "shop" ? 4.2 : FH) ? b : a));
    if (hi.w > 8 && hi.d > 7 && hi.roof !== false) {
      const y = top + 0.57;
      plant.push(at(new THREE.BoxGeometry(Math.min(5, hi.w * 0.3), 1.4, Math.min(3.4, hi.d * 0.3)), hi.x + hi.w * 0.18, y + 0.7, hi.z - hi.d * 0.15));
      plant.push(at(new THREE.BoxGeometry(Math.min(3, hi.w * 0.2), 0.9, Math.min(2.4, hi.d * 0.22)), hi.x - hi.w * 0.2, y + 0.45, hi.z - hi.d * 0.2));
    }
  }
  return {
    stone: merge(stone),
    glass: glass.length ? merge(glass) : merge([new THREE.BoxGeometry(0.01, 0.01, 0.01)]),
    ribbon: ribbon.length ? merge(ribbon) : null,
    roof: merge(roof.length ? roof : [new THREE.BoxGeometry(0.01, 0.01, 0.01)]),
    plant: plant.length ? merge(plant) : null,
    top: top + 0.8,
  };
}
