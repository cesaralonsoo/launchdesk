// WP-B (redesign) · The lite room kit: boxes, cylinders and cones written straight into ONE vertex-coloured geometry,
// so a whole floor of furnished rooms (offices floor, every campus mini building) is one draw call (+ one for the
// glowing screens). Each vertex carries a tag (room index) so a room can be dimmed, lit or highlighted later by
// rewriting its colours from the stored base colours — no new materials, no recompiles.
import * as THREE from "three";

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color(), _n = new THREE.Matrix3();

export type Tint = { k: number; desat: number; lift?: number };

export class Lite {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private tags: number[] = [];
  /** Current tag for everything added next (-1 = shared, never repainted). */
  tag = -1;

  /** Adds a geometry (consumed) at x,y,z rotated ry, in colour `color`. */
  add(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, x: number, y: number, z: number, ry = 0, rx = 0) {
    const geo = g.index ? g.toNonIndexed() : g;
    _e.set(rx, ry, 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
    geo.applyMatrix4(_m);
    const P = geo.getAttribute("position"), N = geo.getAttribute("normal");
    _c.set(color);
    for (let i = 0; i < P.count; i++) {
      this.pos.push(P.getX(i), P.getY(i), P.getZ(i));
      this.nor.push(N.getX(i), N.getY(i), N.getZ(i));
      this.col.push(_c.r, _c.g, _c.b);
      this.tags.push(this.tag);
    }
    if (geo !== g) geo.dispose();
    g.dispose();
    return this;
  }
  box(w: number, h: number, d: number, color: THREE.ColorRepresentation, x: number, y: number, z: number, ry = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, ry);
  }
  /** A box whose centre (not base) is at y. */
  boxC(w: number, h: number, d: number, color: THREE.ColorRepresentation, x: number, y: number, z: number, ry = 0, rx = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, ry, rx);
  }
  cyl(rt: number, rb: number, h: number, color: THREE.ColorRepresentation, x: number, y: number, z: number, seg = 10) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y + h / 2, z);
  }
  ball(r: number, color: THREE.ColorRepresentation, x: number, y: number, z: number, detail = 0) {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, x, y, z);
  }
  get empty() {
    return this.pos.length === 0;
  }
  /** Builds the geometry. Colours can be repainted per tag with `LiteMesh.paint`. */
  build(): LiteGeo {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    const color = new THREE.Float32BufferAttribute(this.col.slice(), 3);
    color.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("color", color);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return { geo: g, base: new Float32Array(this.col), tags: Int16Array.from(this.tags) };
  }
}

export type LiteGeo = { geo: THREE.BufferGeometry; base: Float32Array; tags: Int16Array };

/** Repaints every vertex of `tag` from its base colour: desaturate, darken (k < 1) or lift towards white. */
export function paintTag(lg: LiteGeo, tag: number, t: Tint) {
  const col = lg.geo.getAttribute("color") as THREE.BufferAttribute;
  const a = col.array as Float32Array;
  const hsl = { h: 0, s: 0, l: 0 };
  for (let i = 0; i < lg.tags.length; i++) {
    if (lg.tags[i] !== tag) continue;
    _c.setRGB(lg.base[i * 3]!, lg.base[i * 3 + 1]!, lg.base[i * 3 + 2]!);
    if (t.desat > 0) {
      _c.getHSL(hsl);
      _c.setHSL(hsl.h, hsl.s * (1 - t.desat), hsl.l);
    }
    _c.multiplyScalar(t.k);
    if (t.lift) _c.lerp(WHITE, t.lift);
    a[i * 3] = _c.r;
    a[i * 3 + 1] = _c.g;
    a[i * 3 + 2] = _c.b;
  }
  col.needsUpdate = true;
}
const WHITE = new THREE.Color(1, 1, 1);
void _n;

/** Lit material for lite meshes (flat vertex colours, soft). */
export function liteMaterial(env?: THREE.Texture | null): THREE.MeshStandardMaterial {
  // the same soft image-based light the office materials get, so the lite floors read as bright as floor 1
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, envMap: env ?? null, envMapIntensity: 0.4 });
}
/** Unlit material for screens and signs (reads as glowing). */
export function glowMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
}

/** Mix two colours (hex) → hex string. */
export function mixHex(a: string, b: string, k: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()}`;
}
