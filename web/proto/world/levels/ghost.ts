// WS-WORLD v7 · Locked-level ghosts: what scaling would unlock, drawn as a dashed clay blueprint (no lights) with a
// small pixel padlock. Floor ghost (cap 0: around the room), tower ghost (cap 1), district ghost (cap 2).
// Dashes are thin instanced boxes (not GL lines) so they read at every distance and through the pixel pass.
import * as THREE from "three";

export type GhostKind = "floor" | "tower" | "district";

/** Pixel padlock (12 × 14 art pixels), drawn on a canvas with hard edges. */
function lockTexture(): THREE.Texture {
  const rows = [
    "....####....",
    "...#....#...",
    "..#......#..",
    "..#......#..",
    "..#......#..",
    "############",
    "#oooooooooo#",
    "#oooo##oooo#",
    "#oooo##oooo#",
    "#oooo##oooo#",
    "#oooooooooo#",
    "#oooooooooo#",
    "############",
    "............",
  ];
  const S = 4, W = 12 + 4, H = 14 + 4;
  const c = document.createElement("canvas");
  c.width = W * S;
  c.height = H * S;
  const g = c.getContext("2d")!;
  // rounded pill-ish backing in clay white, 1-pixel ink frame
  g.fillStyle = "rgba(255,255,255,0.94)";
  g.fillRect(S, 0, (W - 2) * S, H * S);
  g.fillRect(0, S, W * S, (H - 2) * S);
  g.fillStyle = "rgba(60,58,70,0.55)";
  for (let x = 1; x < W - 1; x++) {
    g.fillRect(x * S, 0, S, S);
    g.fillRect(x * S, (H - 1) * S, S, S);
  }
  for (let y = 1; y < H - 1; y++) {
    g.fillRect(0, y * S, S, S);
    g.fillRect((W - 1) * S, y * S, S, S);
  }
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (ch === ".") return;
      g.fillStyle = ch === "#" ? "#3B3A46" : "#C9C3B8";
      g.fillRect((x + 2) * S, (y + 2) * S, S, S);
    }),
  );
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Dashes along the 12 edges of each box + optional horizontal rings every `ringEvery` metres (floor lines). */
function dashes(boxes: THREE.Box3[], o: { dash: number; gap: number; thick: number; ringEvery?: number; ringFrom?: number }): THREE.Matrix4[] {
  const out: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const seg = (a: THREE.Vector3, b: THREE.Vector3) => {
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.round(len / (o.dash + o.gap)));
    const step = len / n;
    const dir = b.clone().sub(a).normalize();
    const ax = Math.abs(dir.x) > 0.5 ? 0 : Math.abs(dir.y) > 0.5 ? 1 : 2;
    const d = Math.min(o.dash, step * 0.7);
    for (let i = 0; i < n; i++) {
      p.copy(a).addScaledVector(dir, step * i + step / 2);
      s.set(o.thick, o.thick, o.thick).setComponent(ax, d);
      out.push(m.compose(p, q, s).clone());
    }
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  for (const b of boxes) {
    const { min: a, max: c } = b;
    const ys = [a.y, c.y];
    if (o.ringEvery) for (let y = (o.ringFrom ?? a.y) + o.ringEvery; y < c.y - 0.3; y += o.ringEvery) ys.push(y);
    for (const y of ys) {
      seg(V(a.x, y, a.z), V(c.x, y, a.z));
      seg(V(a.x, y, c.z), V(c.x, y, c.z));
      seg(V(a.x, y, a.z), V(a.x, y, c.z));
      seg(V(c.x, y, a.z), V(c.x, y, c.z));
    }
    for (const x of [a.x, c.x]) for (const z of [a.z, c.z]) seg(V(x, a.y, z), V(x, c.y, z));
  }
  return out;
}

export interface Ghost {
  readonly root: THREE.Group;
  /** Shows one kind (or none) — fades. */
  show(kind: GhostKind | null, animate: boolean): void;
  readonly kind: GhostKind | null;
  /** Where the padlock floats (world). */
  anchor(): THREE.Vector3 | null;
  setClay(c: THREE.Color, night: number): void;
  /** Keeps the padlock about 60 CSS px tall on desktop and smaller on portrait phones. */
  setViewport(w: number, h: number): void;
  update(dt: number, t: number): boolean;
  dispose(): void;
}

export function createGhost(src: { floor: () => THREE.Box3[]; tower: () => THREE.Box3[]; district: () => THREE.Box3[] }, opts: { reduced: boolean }): Ghost {
  const root = new THREE.Group();
  root.name = "ghost";
  const mat = new THREE.MeshBasicMaterial({ color: "#B9B2A6", transparent: true, opacity: 0, depthWrite: false, fog: true });
  const fill = new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const lockTex = lockTexture();
  const lockMat = new THREE.SpriteMaterial({ map: lockTex, transparent: true, opacity: 0, depthTest: false, sizeAttenuation: false, fog: false });
  const lock = new THREE.Sprite(lockMat);
  lock.renderOrder = 10;
  const ar = 18 / 16;
  lock.scale.set(0.034, 0.034 * ar, 1);
  root.add(lock);
  const SPEC: Record<GhostKind, { dash: number; gap: number; thick: number; ringEvery?: number; fill: number }> = {
    floor: { dash: 0.5, gap: 0.4, thick: 0.07, fill: 0.12 },
    tower: { dash: 1.1, gap: 0.9, thick: 0.17, ringEvery: 3.2, fill: 0.1 },
    district: { dash: 2.2, gap: 1.6, thick: 0.36, ringEvery: 6.4, fill: 0.1 },
  };
  const built = new Map<GhostKind, { g: THREE.Group; top: THREE.Vector3 }>();
  function build(k: GhostKind) {
    let b = built.get(k);
    if (b) return b;
    const boxes = src[k]();
    const ms = dashes(boxes, { ...SPEC[k], ringFrom: boxes[0]?.min.y });
    const inst = new THREE.InstancedMesh(geo, mat, ms.length);
    ms.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    const g = new THREE.Group();
    g.add(inst);
    // faint translucent volumes so the massing reads as "planned", not as scaffolding
    for (const bx of boxes) {
      const sz = bx.getSize(new THREE.Vector3()), c = bx.getCenter(new THREE.Vector3());
      const v = new THREE.Mesh(geo, fill);
      v.scale.copy(sz);
      v.position.copy(c);
      v.renderOrder = -1;
      g.add(v);
    }
    const all = boxes.reduce((a, x) => a.union(x), new THREE.Box3());
    const top = new THREE.Vector3((all.min.x + all.max.x) / 2, all.max.y + (k === "floor" ? 0.9 : k === "tower" ? 3 : 6), (all.min.z + all.max.z) / 2);
    if (k === "district") top.set(0, 12 * 3.2 + 9, 0); // above the hero tower's roof
    g.visible = false;
    root.add(g);
    b = { g, top };
    built.set(k, b);
    return b;
  }
  let kind: GhostKind | null = null;
  let k = 0, target = 0, fillK = SPEC.tower.fill, nightK = 0;
  return {
    root,
    get kind() { return kind; },
    show(next, animate) {
      if (next === kind) return;
      if (next) {
        for (const [kk, b] of built) b.g.visible = kk === next;
        const b = build(next);
        b.g.visible = true;
        lock.position.copy(b.top);
        fillK = SPEC[next].fill;
        if (!kind) k = animate && !opts.reduced ? 0 : 1;
        target = 1;
      } else target = 0;
      if (!animate || opts.reduced) k = target;
      kind = next;
      if (!next && k === 0) for (const b of built.values()) b.g.visible = false;
    },
    anchor() {
      return kind && k > 0.3 ? lock.position.clone() : null;
    },
    setViewport(w, h) {
      const s = 0.034 * Math.min(1, Math.max(0.5, w / h / 1.4));
      lock.scale.set(s, s * ar, 1);
    },
    setClay(c, night) {
      mat.color.copy(c).multiplyScalar(0.82).lerp(new THREE.Color("#9AA6C4"), night * 0.6);
      fill.color.set(night > 0.5 ? "#7F8DAE" : "#FFFFFF");
      nightK = night;
    },
    update(dt, t) {
      if (k !== target) {
        k += Math.sign(target - k) * Math.min(Math.abs(target - k), dt / 0.7);
        if (k === 0) for (const b of built.values()) b.g.visible = false;
      }
      const breathe = opts.reduced ? 1 : 0.86 + 0.14 * Math.sin(t * 1.6);
      mat.opacity = 0.95 * k * breathe;
      fill.opacity = fillK * k * (1 - 0.55 * nightK);
      lockMat.opacity = k;
      root.visible = k > 0.001;
      return k !== target;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      fill.dispose();
      lockMat.dispose();
      lockTex.dispose();
      for (const b of built.values()) b.g.traverse((o) => o instanceof THREE.InstancedMesh && o.dispose());
    },
  };
}
