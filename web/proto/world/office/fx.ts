// WS-OFFICE · v7 effects shared by the floor and the bedroom (pure THREE, pooled, allocation-free per frame).
//   CubeBurst   pixel cubes that pop out and fall (hire "poof", cheer, a paper landing)
//   Papers      a pixel "paper" that flies in an arc from an analyst to the founder / pinboard (a finding landed)
import * as THREE from "three";
import type { FindingKind } from "../../contracts";

/** Paper tone by finding kind (the chip colours the UI uses are WS-EXP's; these only tint the world paper). */
export const KIND_TONE: Record<FindingKind, string> = {
  fact: "#0AC18E",
  number: "#F59E0B",
  competitor: "#3B82F6",
  risk: "#E5484D",
  strength: "#22A06B",
  estimate: "#94A3B8",
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _w = new THREE.Color("#ffffff");

/** One burst of N pixel cubes. */
class Burst {
  t = -1;
  dur = 0.75;
  o = new THREE.Vector3();
  seeds: Array<{ vx: number; vy: number; vz: number; s: number; r: number }> = [];
  constructor(readonly base: number, readonly n: number) {}
}

export class CubeBurst {
  readonly root = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private bursts: Burst[] = [];
  private next = 0;
  constructor(pools = 4, per = 18) {
    const mat = new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, pools * per);
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.mesh.castShadow = false;
    for (let i = 0; i < pools * per; i++) {
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, _w);
    }
    this.root.add(this.mesh);
    this.root.userData.keep = true;
    for (let i = 0; i < pools; i++) this.bursts.push(new Burst(i * per, per));
  }

  fire(x: number, y: number, z: number, color: string, opts: { power?: number; size?: number; dur?: number } = {}) {
    const b = this.bursts[this.next++ % this.bursts.length]!;
    b.t = 0;
    b.dur = opts.dur ?? 0.75;
    b.o.set(x, y, z);
    const pw = opts.power ?? 1, sz = opts.size ?? 0.07;
    b.seeds = [];
    for (let i = 0; i < b.n; i++) {
      const a = i * 2.39996 + x;
      const up = 0.4 + ((i * 37) % 11) / 11;
      const sp = (0.6 + ((i * 13) % 7) / 7) * pw;
      b.seeds.push({ vx: Math.cos(a) * sp, vy: (1.2 + up * 1.4) * pw, vz: Math.sin(a) * sp, s: sz * (0.6 + ((i * 7) % 5) / 5 * 0.8), r: i * 0.7 });
      _c.set(color);
      if (i % 3 === 1) _c.lerp(_w, 0.55);
      if (i % 5 === 4) _c.set("#ffffff");
      this.mesh.setColorAt(b.base + i, _c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): boolean {
    let any = false;
    for (const b of this.bursts) {
      if (b.t < 0) continue;
      b.t += dt;
      const k = b.t / b.dur;
      if (k >= 1) {
        b.t = -1;
        for (let i = 0; i < b.n; i++) this.mesh.setMatrixAt(b.base + i, _m.makeScale(0, 0, 0));
        any = true;
        continue;
      }
      any = true;
      const tt = b.t;
      b.seeds.forEach((s, i) => {
        _p.set(b.o.x + s.vx * tt, Math.max(0.02, b.o.y + s.vy * tt - 4.9 * tt * tt), b.o.z + s.vz * tt);
        const sc = s.s * (k < 0.12 ? k / 0.12 : 1 - Math.pow((k - 0.12) / 0.88, 2));
        _s.setScalar(Math.max(0.0001, sc));
        _q.setFromEuler(_e.set(s.r + tt * 6, s.r * 2 + tt * 4, 0));
        this.mesh.setMatrixAt(b.base + i, _m.compose(_p, _q, _s));
      });
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
    return this.bursts.some((b) => b.t >= 0);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Flying papers. `fire(from, to, kind)` → lands after ~0.9 s, then `onLand(i)` (a small burst + the receiver reacts). */
export class Papers {
  readonly root = new THREE.Group();
  private items: Array<{ g: THREE.Group; tab: THREE.MeshLambertMaterial; t: number; a: THREE.Vector3; b: THREE.Vector3; color: string; cb?: () => void }> = [];
  private next = 0;
  constructor(
    private burst: CubeBurst,
    n = 6,
  ) {
    const paperM = new THREE.MeshLambertMaterial({ color: "#FBFAF6", flatShading: true });
    const lineM = new THREE.MeshLambertMaterial({ color: "#9AA0A8", flatShading: true });
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.26), paperM);
      const tabM = new THREE.MeshLambertMaterial({ color: "#0AC18E", flatShading: true });
      const tab = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.016, 0.05), tabM);
      tab.position.z = -0.105;
      for (let k = 0; k < 3; k++) {
        const ln = new THREE.Mesh(new THREE.BoxGeometry(0.12 - k * 0.02, 0.014, 0.02), lineM);
        ln.position.set(-0.02, 0, -0.03 + k * 0.05);
        g.add(ln);
      }
      g.add(sheet, tab);
      g.visible = false;
      g.traverse((o) => (o.raycast = () => {}));
      this.root.add(g);
      this.items.push({ g, tab: tabM, t: -1, a: new THREE.Vector3(), b: new THREE.Vector3(), color: "#0AC18E" });
    }
    this.root.userData.keep = true;
  }

  fire(from: THREE.Vector3, to: THREE.Vector3, kind: FindingKind, onLand?: () => void) {
    const it = this.items[this.next++ % this.items.length]!;
    it.t = 0;
    it.a.copy(from);
    it.b.copy(to);
    it.color = KIND_TONE[kind] ?? "#0AC18E";
    it.tab.color.set(it.color);
    it.cb = onLand;
    it.g.visible = true;
  }

  update(dt: number): boolean {
    let busy = false;
    const T = 0.95;
    for (const it of this.items) {
      if (it.t < 0) continue;
      it.t += dt;
      const k = Math.min(1, it.t / T);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      _p.lerpVectors(it.a, it.b, e);
      const dist = it.a.distanceTo(it.b);
      _p.y += Math.sin(k * Math.PI) * (0.45 + dist * 0.18);
      it.g.position.copy(_p);
      it.g.rotation.set(Math.sin(k * Math.PI * 2) * 0.5, k * Math.PI * 2.2, Math.sin(k * Math.PI) * 0.4);
      it.g.scale.setScalar(k < 0.1 ? 0.4 + k * 6 : 1);
      busy = true;
      if (k >= 1) {
        it.t = -1;
        it.g.visible = false;
        this.burst.fire(it.b.x, it.b.y, it.b.z, it.color, { power: 0.45, size: 0.045, dur: 0.55 });
        it.cb?.();
      }
    }
    return busy;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
