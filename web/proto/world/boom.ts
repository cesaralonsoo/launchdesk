// WS-WORLD v7 · Boom FX (level 0 → 1): a laptop flash, a burst of pixel cubes thrown out of the room, a stepped
// shockwave on the floor and a short camera kick. Deterministic in `k` (ms since the boom started) so screenshots of
// a mid-frame are exact (debugBoom). The bedroom folds itself (setBoom) and the office rises (setReveal); this file
// only adds the shared spectacle around them.
import * as THREE from "three";

export const BOOM = {
  /** Anticipation (squash + laptop flash) before anything flies. */
  pre: 150,
  /** Room folds away over this window (ms from start). */
  roomFrom: 150, roomLen: 850,
  /** Office floor reveal window. */
  floorFrom: 420, floorLen: 1850,
  /** Camera move window. */
  camFrom: 320, camLen: 2280,
} as const;

const N = 80;
const G = -15;

export interface BoomFx {
  readonly root: THREE.Group;
  /** Prepare a boom from the room footprint (world centre, half size) and the founder's desk (flash origin). */
  arm(center: THREE.Vector3, half: { x: number; z: number }, flashAt: THREE.Vector3 | null, colors: string[]): void;
  /** Pose at ms since start (deterministic). Returns false once everything is spent. */
  pose(ms: number): boolean;
  /** Small screen-space camera kick (world units) for this instant. */
  shake(ms: number, out: THREE.Vector3): THREE.Vector3;
  clear(): void;
  dispose(): void;
}

export function createBoomFx(): BoomFx {
  const root = new THREE.Group();
  root.name = "boom";
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: "#ffffff" });
  const cubes = new THREE.InstancedMesh(geo, mat, N);
  cubes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cubes.frustumCulled = false;
  cubes.castShadow = false;
  cubes.count = 0;
  const flash = new THREE.PointLight("#E9FFF6", 0, 10, 1.6);
  const ringMat = new THREE.MeshBasicMaterial({ color: "#0AC18E", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  // a stepped (8-sided) ring reads as pixel art from the iso camera
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 8, 1), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.rotation.z = Math.PI / 8;
  const ring2 = new THREE.Mesh(ring.geometry, ringMat.clone());
  ring2.rotation.copy(ring.rotation);
  root.add(cubes, flash, ring, ring2);
  root.visible = false;

  type P = { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; s: number; t0: number };
  let parts: P[] = [];
  const c0 = new THREE.Vector3();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3(), e = new THREE.Euler();
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  return {
    root,
    arm(center, half, flashAt, colors) {
      seed = 7;
      c0.copy(center);
      parts = [];
      const col = new THREE.Color();
      for (let i = 0; i < N; i++) {
        // start on the room's walls and furniture volume, thrown outward and up
        const edge = rnd() < 0.62;
        const sx = (rnd() * 2 - 1) * half.x, sz = (rnd() * 2 - 1) * half.z;
        const p = new THREE.Vector3(center.x + (edge ? Math.sign(sx || 1) * half.x * (0.85 + rnd() * 0.15) : sx), 0.15 + rnd() * 2.3, center.z + (edge && rnd() < 0.5 ? Math.sign(sz || 1) * half.z : sz));
        const out = new THREE.Vector3(p.x - center.x, 0, p.z - center.z);
        if (out.lengthSq() < 0.01) out.set(rnd() - 0.5, 0, rnd() - 0.5);
        out.normalize().multiplyScalar(3.2 + rnd() * 5.5);
        out.y = 3.5 + rnd() * 5.5;
        const s = 0.1 + Math.pow(rnd(), 2.2) * 0.28;
        parts.push({ p, v: out, r: new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3), w: new THREE.Vector3(rnd() * 9 - 4.5, rnd() * 9 - 4.5, rnd() * 9 - 4.5), s, t0: rnd() * 120 });
        col.set(colors[i % colors.length] ?? "#ffffff");
        cubes.setColorAt(i, col);
      }
      if (cubes.instanceColor) cubes.instanceColor.needsUpdate = true;
      if (flashAt) flash.position.copy(flashAt).add(new THREE.Vector3(0, 0.6, 0.2));
      else flash.position.copy(center).add(new THREE.Vector3(0, 1.6, 0));
      ring.position.set(center.x, 0.04, center.z);
      ring2.position.copy(ring.position);
      root.visible = true;
    },
    pose(ms) {
      // laptop flash: rises through the anticipation, peaks as the room bursts, decays fast
      const f = ms < 150 ? ms / 150 : Math.exp(-(ms - 150) / 260);
      flash.intensity = 26 * f * f;
      // cubes: ballistic from the burst, one bounce, then shrink away
      let alive = 0;
      for (let i = 0; i < parts.length; i++) {
        const P = parts[i]!;
        const t = (ms - BOOM.pre - P.t0) / 1000;
        let s = 0;
        if (t > 0) {
          const life = 1.25 + (i % 7) * 0.06;
          pp.copy(P.p).addScaledVector(P.v, t);
          pp.y = P.p.y + P.v.y * t + 0.5 * G * t * t;
          if (pp.y < P.s / 2) {
            // land and settle (cheap bounce: mirror the overshoot, damped)
            const under = P.s / 2 - pp.y;
            pp.y = P.s / 2 + Math.min(0.5, under * 0.12);
          }
          e.set(P.r.x + P.w.x * t, P.r.y + P.w.y * t, P.r.z + P.w.z * t);
          s = P.s * (t < 0.08 ? t / 0.08 : t > life - 0.35 ? Math.max(0, (life - t) / 0.35) : 1);
        }
        if (s > 0.001) alive++;
        sc.setScalar(Math.max(1e-4, s));
        q.setFromEuler(e);
        m.compose(t > 0 ? pp : P.p, q, sc);
        cubes.setMatrixAt(i, m);
      }
      cubes.count = parts.length;
      cubes.instanceMatrix.needsUpdate = true;
      // shockwaves: two stepped rings from the room footprint
      const r1 = (ms - BOOM.pre) / 900, r2 = (ms - BOOM.pre - 180) / 1100;
      for (const [rg, k, maxR] of [[ring, r1, 8], [ring2, r2, 12]] as const) {
        const kk = Math.max(0, Math.min(1, k));
        rg.visible = k > 0 && k < 1;
        rg.scale.setScalar(2 + (1 - Math.pow(1 - kk, 3)) * maxR);
        (rg.material as THREE.MeshBasicMaterial).opacity = (1 - kk) * (1 - kk) * 0.42;
      }
      const live = alive > 0 || flash.intensity > 0.01 || r2 < 1;
      root.visible = live;
      return live;
    },
    shake(ms, out) {
      const t = ms - BOOM.pre;
      if (t < 0 || t > 520) return out.set(0, 0, 0);
      const a = 0.16 * Math.exp(-t / 160);
      return out.set(Math.sin(t * 0.11) * a, Math.sin(t * 0.083 + 1) * a * 0.6, Math.cos(t * 0.097) * a);
    },
    clear() {
      root.visible = false;
      flash.intensity = 0;
      cubes.count = 0;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      ring.geometry.dispose();
      ringMat.dispose();
      (ring2.material as THREE.Material).dispose();
      cubes.dispose();
    },
  };
}
