// WP-B (redesign) · Instanced mini people for the lite floors (offices floor, campus): one InstancedMesh for every
// body and one for every head and one for the hair, per-instance colour, so any number of people costs 3 draw calls. Plus instanced paper
// stacks (results on a desk). Animation is cheap: only "working" people move (a small typing bob), updated ≤ 30 Hz.
import * as THREE from "three";

const SKINS = ["#F1C7A5", "#D9A27E", "#B97A57", "#8D5A3E", "#F3D3B8"];
const HAIRS = ["#2B2420", "#6B4A2E", "#C98E4B", "#1E1B1A", "#8C5A3C", "#3A2E28"];

export type Person = { x: number; y: number; z: number; ry: number; shirt: string; skin?: number; working: boolean; visible: boolean; scale?: number };

export class People {
  readonly root = new THREE.Group();
  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private hair: THREE.InstancedMesh;
  private list: Person[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private c = new THREE.Color();
  private last = -1;
  constructor(private cap: number, shadows = false) {
    // seated figure: a rounded bean body (≈ 0.75 tall) + a big head, the same chibi proportions as the floor cast
    const body = new THREE.CapsuleGeometry(0.2, 0.32, 3, 10);
    body.translate(0, 0.62, 0);
    const head = new THREE.SphereGeometry(0.22, 14, 10);
    head.translate(0, 1.16, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.75 });
    const hmat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    this.bodies = new THREE.InstancedMesh(body, mat, cap);
    this.heads = new THREE.InstancedMesh(head, hmat, cap);
    // a hair cap over the top and back of the head (same chibi read as the floor-1 cast), one more draw call
    const hair = new THREE.SphereGeometry(0.235, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    hair.rotateX(-0.35);
    hair.translate(0, 1.19, -0.01);
    this.hair = new THREE.InstancedMesh(hair, new THREE.MeshStandardMaterial({ roughness: 0.8 }), cap);
    for (const im of [this.bodies, this.heads, this.hair]) {
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = shadows;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(im);
    }
    this.root.name = "people";
  }
  set(list: Person[]) {
    this.list = list.slice(0, this.cap);
    this.bodies.count = this.heads.count = this.hair.count = this.list.length;
    this.list.forEach((p, i) => {
      this.bodies.setColorAt(i, this.c.set(p.shirt));
      this.heads.setColorAt(i, this.c.set(SKINS[(p.skin ?? i) % SKINS.length]!));
      this.hair.setColorAt(i, this.c.set(HAIRS[((p.skin ?? i) * 7 + 3) % HAIRS.length]!));
    });
    for (const im of [this.bodies, this.heads, this.hair]) if (im.instanceColor) im.instanceColor.needsUpdate = true;
    this.pose(0, true);
  }
  get count() {
    return this.list.length;
  }
  /** Writes matrices. Only working people move, so a still floor never re-uploads. */
  pose(t: number, force = false) {
    if (!force && !this.list.some((p) => p.working && p.visible)) return false;
    if (!force && t - this.last < 1 / 30) return true;
    this.last = t;
    this.list.forEach((p, i) => {
      const sc = p.visible ? (p.scale ?? 1) : 1e-4;
      const bob = p.working ? Math.abs(Math.sin(t * 7 + i * 1.7)) * 0.035 : 0;
      const lean = p.working ? 0.08 + Math.sin(t * 3.1 + i) * 0.03 : 0;
      this.e.set(lean, p.ry, 0, "YXZ");
      this.q.setFromEuler(this.e);
      this.m.compose(this.p.set(p.x, p.y + bob * sc, p.z), this.q, this.s.set(sc, sc, sc));
      this.bodies.setMatrixAt(i, this.m);
      this.e.set(lean * 1.6, p.ry + (p.working ? Math.sin(t * 1.3 + i) * 0.12 : 0), 0, "YXZ");
      this.q.setFromEuler(this.e);
      this.m.compose(this.p.set(p.x, p.y + bob * sc, p.z), this.q, this.s.set(sc, sc, sc));
      this.heads.setMatrixAt(i, this.m);
      this.hair.setMatrixAt(i, this.m);
    });
    this.hair.instanceMatrix.needsUpdate = true;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    return true;
  }
  dispose() {
    for (const im of [this.bodies, this.heads, this.hair]) {
      im.geometry.dispose();
      (im.material as THREE.Material).dispose();
      im.dispose();
    }
  }
}

/** Instanced paper stacks: one sheet-pile per result (max `perSpot` per spot, the UI shows "+n" beyond). */
export class Papers {
  readonly mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  constructor(cap: number) {
    const g = new THREE.BoxGeometry(0.36, 0.05, 0.27);
    g.translate(0, 0.025, 0);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: "#FFFFFF", roughness: 0.9 }), cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = "papers";
  }
  /** spots: where each pile sits and how many sheets-bundles it has. */
  set(spots: { x: number; y: number; z: number; n: number }[]) {
    let i = 0;
    for (const sp of spots)
      for (let k = 0; k < sp.n && i < this.mesh.instanceMatrix.count; k++, i++) {
        this.e.set(0, (k % 2 ? 0.12 : -0.08) + k * 0.05, 0);
        this.q.setFromEuler(this.e);
        this.m.compose(this.p.set(sp.x + (k % 2) * 0.03, sp.y + k * 0.06, sp.z), this.q, this.s.set(1, 1, 1));
        this.mesh.setMatrixAt(i, this.m);
      }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
