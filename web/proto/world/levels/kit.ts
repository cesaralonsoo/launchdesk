// WS-B · Level kit: facade textures, world-unit UV boxes, instanced sets with staggered growth, easing.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const Y0 = -0.56; // base top (street level). The office slab underside sits here.
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Progress of a sub-window [a, a+len] inside a 0..1 timeline. */
export const win = (g: number, a: number, len: number) => clamp01((g - a) / len);

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────────────────────────── facade textures (greyscale map × material colour, emissive map = lit interior)

export type FacadeTex = { map: THREE.Texture; lit: THREE.Texture; modW: number; modH: number };
const texCache = new Map<string, FacadeTex>();

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}
function toTex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  return t;
}

/**
 * kind:
 *  curtain — full-height glass with slim mullions (tower, HQ)
 *  punched — stone wall with deep windows (residential, lab)
 *  ribbon  — horizontal window band over a stone spandrel (mid-rise office)
 *  shop    — tall shopfront glazing (store, studio)
 */
export function facade(kind: "curtain" | "punched" | "ribbon" | "shop", seed = 1): FacadeTex {
  const key = `${kind}:${seed}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const N = 8; // modules per texture repeat
  const modW = kind === "punched" ? 2.4 : kind === "shop" ? 3 : 1.8;
  const modH = kind === "shop" ? 4.2 : 3.2;
  const W = 1024, H = 256;
  const mw = W / N;
  const r = rng(seed * 977 + kind.length);
  const [c1, m] = canvas(W, H);
  const [c2, e] = canvas(W, H);
  e.fillStyle = "#000";
  e.fillRect(0, 0, W, H);

  // lit interiors: mostly warm, some neutral office white, a few cool screens-blue; brightness varies, blinds half-down
  const TINTS: [number, number, number][] = [[255, 198, 138], [255, 222, 178], [255, 240, 222], [206, 222, 255]];
  const lightWin = (x: number, y: number, w: number, h: number, on: boolean) => {
    if (!on) return;
    const pick = r();
    const [cr, cg, cb] = TINTS[pick < 0.38 ? 0 : pick < 0.64 ? 1 : pick < 0.84 ? 2 : 3]!;
    const warm = 0.3 + r() * 0.7;
    const gr = e.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, `rgba(${cr},${cg},${cb},${warm})`);
    gr.addColorStop(0.25, `rgba(${cr},${cg},${cb},${warm * 0.92})`);
    gr.addColorStop(1, `rgba(${cr},${Math.round(cg * 0.9)},${Math.round(cb * 0.8)},${warm * 0.5})`);
    e.fillStyle = gr;
    e.fillRect(x, y, w, h);
    // ceiling light strip
    e.fillStyle = `rgba(255,250,240,${0.55 + warm * 0.4})`;
    e.fillRect(x + w * 0.1, y + h * 0.06, w * 0.8, Math.max(2, h * 0.03));
    // blinds pulled down on some windows
    if (r() < 0.25) {
      e.fillStyle = "rgba(0,0,0,0.55)";
      e.fillRect(x, y, w, h * (0.2 + r() * 0.35));
    }
    // desk / people silhouettes
    e.fillStyle = "rgba(30,24,18,0.6)";
    const n = Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const sx = x + r() * w * 0.8;
      e.fillRect(sx, y + h * 0.62, w * (0.12 + r() * 0.1), h * 0.38);
    }
  };

  if (kind === "curtain") {
    for (let i = 0; i < N; i++) {
      const x = i * mw;
      const g = m.createLinearGradient(0, 0, 0, H);
      const b = 196 + r() * 18;
      g.addColorStop(0, `rgb(${Math.min(255, b + 52)},${Math.min(255, b + 54)},${Math.min(255, b + 58)})`);
      g.addColorStop(0.5, `rgb(${b},${b + 2},${b + 6})`);
      g.addColorStop(1, `rgb(${b - 34},${b - 30},${b - 24})`);
      m.fillStyle = g;
      m.fillRect(x, 0, mw, H);
      // diagonal sky reflection
      m.fillStyle = `rgba(255,255,255,${0.06 + r() * 0.08})`;
      m.beginPath();
      m.moveTo(x + mw * 0.15, 0);
      m.lineTo(x + mw * 0.55, 0);
      m.lineTo(x + mw * 0.1, H);
      m.lineTo(x, H);
      m.closePath();
      m.fill();
      lightWin(x + 3, 6, mw - 6, H - 12, r() < 0.5);
    }
    m.fillStyle = "rgb(250,250,250)";
    for (let i = 0; i <= N; i++) m.fillRect(i * mw - 2, 0, 4, H); // mullions
    m.fillRect(0, H * 0.84, W, 3); // transom
  } else if (kind === "punched" || kind === "ribbon") {
    m.fillStyle = "#FFFFFF";
    m.fillRect(0, 0, W, H);
    for (let i = 0; i < N; i++) {
      const x = i * mw;
      const [wx, wy, ww, wh] = kind === "punched" ? [x + mw * 0.2, H * 0.22, mw * 0.6, H * 0.56] : [x, H * 0.3, mw, H * 0.5];
      const g = m.createLinearGradient(0, wy, 0, wy + wh);
      g.addColorStop(0, "rgb(120,126,136)");
      g.addColorStop(1, "rgb(72,78,88)");
      m.fillStyle = g;
      m.fillRect(wx, wy, ww, wh);
      m.fillStyle = "rgba(0,0,0,0.18)"; // reveal shadow
      m.fillRect(wx, wy, ww, 5);
      if (kind === "ribbon") {
        m.fillStyle = "rgb(225,227,230)";
        m.fillRect(x - 1, wy, 3, wh);
      }
      lightWin(wx + 2, wy + 2, ww - 4, wh - 4, r() < 0.46);
    }
    m.fillStyle = "rgba(0,0,0,0.06)";
    m.fillRect(0, H - 6, W, 6); // floor line
  } else {
    // shop: tall glazing with a thin stone head
    m.fillStyle = "#FFFFFF";
    m.fillRect(0, 0, W, H);
    for (let i = 0; i < N; i++) {
      const x = i * mw;
      const g = m.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "rgb(140,148,158)");
      g.addColorStop(1, "rgb(96,104,114)");
      m.fillStyle = g;
      m.fillRect(x + 4, H * 0.16, mw - 8, H * 0.84);
      lightWin(x + 6, H * 0.18, mw - 12, H * 0.8, r() < 0.9);
    }
  }
  const out: FacadeTex = { map: toTex(c1), lit: toTex(c2), modW: N * modW, modH };
  texCache.set(key, out);
  return out;
}

export function disposeFacades() {
  for (const t of texCache.values()) {
    t.map.dispose();
    t.lit.dispose();
  }
  texCache.clear();
}

/** Box whose side faces map the facade texture in world units (u per modW, v per modH, v=0 at the box bottom). Groups: 0..1 ±x, 2..3 ±y, 4..5 ±z. */
export function uvBox(w: number, h: number, d: number, modW: number, modH: number, uOffset = 0): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  const faceW = [d, d, w, w, w, w];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (f === 2 || f === 3) {
        uv.setXY(i, 0.5, 0.5);
        continue;
      }
      uv.setXY(i, uv.getX(i) * (faceW[f] / modW) + uOffset, uv.getY(i) * (h / modH));
    }
  }
  uv.needsUpdate = true;
  return g;
}

export function rbox(w: number, h: number, d: number, r = 0.08, seg = 2) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));
}

export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const norm = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of norm) {
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute("position").count) * 2), 2));
  }
  const m = mergeGeometries(norm, false)!;
  geos.forEach((g) => g.dispose());
  return m;
}

/** Translate a geometry in place and return it (for merge lists). */
export const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) => {
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
};

// ───────────────────────────────────────────── instanced sets that pop in with a stagger

export type Inst = { x: number; y: number; z: number; ry?: number; sx?: number; sy?: number; sz?: number; a?: number; color?: THREE.Color };

export class PopSet {
  readonly mesh: THREE.InstancedMesh;
  private items: Inst[];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private e = new THREE.Euler();
  private lastG = -1;
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, items: Inst[], private span = 0.25, private grow: "uniform" | "y" = "uniform") {
    this.items = items;
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
    this.mesh.count = items.length;
    this.mesh.frustumCulled = false;
    items.forEach((it, i) => it.color && this.mesh.setColorAt(i, it.color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.setGrowth(1);
  }
  /** g: 0..1 timeline; each item appears in [a, a+span]. */
  setGrowth(g: number, force = false) {
    if (!force && Math.abs(g - this.lastG) < 1e-4) return;
    this.lastG = g;
    this.items.forEach((it, i) => {
      const k = easeOut(win(g, it.a ?? 0, this.span));
      const kk = Math.max(1e-4, k);
      this.e.set(0, it.ry ?? 0, 0);
      this.q.setFromEuler(this.e);
      if (this.grow === "y") this.s.set(it.sx ?? 1, (it.sy ?? 1) * kk, it.sz ?? 1);
      else this.s.set((it.sx ?? 1) * kk, (it.sy ?? 1) * kk, (it.sz ?? 1) * kk);
      this.p.set(it.x, it.y, it.z);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = this.items.some((it) => g > (it.a ?? 0));
  }
  setColor(i: number, c: THREE.Color) {
    this.mesh.setColorAt(i, c);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  get count() {
    return this.items.length;
  }
  item(i: number) {
    return this.items[i];
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

/** Shared tree geometry: a soft low-poly crown on a slim trunk, unit height ≈ 3.2. */
export function treeGeos() {
  const trunk = new THREE.CylinderGeometry(0.09, 0.13, 1.4, 6);
  trunk.translate(0, 0.7, 0);
  const crown = new THREE.IcosahedronGeometry(1, 1);
  crown.scale(1, 1.18, 1);
  crown.translate(0, 2.15, 0);
  return { trunk, crown };
}
