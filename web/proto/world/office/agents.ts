// WS-A · the seven specialists + receptionist. Slim architectural-model figures (~6.5 heads tall) in simple
// tailored clothing tied to their department. No icons above heads: state reads from the body.
//   idle    standing, breathing, weight shifts, glances, now and then turns to a colleague
//   working seated and typing (screens pulse); every ~12 s walks to the room's board, gestures, walks back
//   done    a calm satisfied pose: leans back in the chair, hands behind the head
//   locked  asleep at the desk
//   cheer   a small hop with arms up
import * as THREE from "three";
import type { DeptState, Quality } from "../../contracts";
import { mergeLimb, type Registry } from "./kit";
import { toWorld, type RoomDef } from "./layout";
import { radialTex } from "./textures";

const EYES = "#1B1D22";
const WALK = 1.05; // m/s — unhurried
const HIP = 0.74;
const SIT_DROP = 0.3;

/** Per-person wardrobe: trousers and shoes (tops are the dept colour, tailored). */
const WARDROBE: Record<string, { pants: string; shoes: string }> = {
  mia: { pants: "#33343B", shoes: "#F1EEE9" },
  leo: { pants: "#C7B596", shoes: "#3A2C22" },
  sam: { pants: "#2B3037", shoes: "#1C1E22" },
  nova: { pants: "#E6DFD3", shoes: "#2A2A2E" },
  lobby: { pants: "#2E3833", shoes: "#F1EEE9" },
  dex: { pants: "#3A404B", shoes: "#F1EEE9" },
  rae: { pants: "#B8A487", shoes: "#2A2622" },
  pip: { pants: "#2A2E35", shoes: "#F1EEE9" },
};

/** Fixed camera direction used by the world rig (yaw 34°, pitch 40°): billboards face it. */
const CAM_DIR = new THREE.Vector3(Math.cos(THREE.MathUtils.degToRad(40)) * Math.sin(THREE.MathUtils.degToRad(34)), Math.sin(THREE.MathUtils.degToRad(40)), Math.cos(THREE.MathUtils.degToRad(40)) * Math.cos(THREE.MathUtils.degToRad(34)));
const BILLBOARD_Q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), CAM_DIR);

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export class Agent {
  readonly root = new THREE.Group();
  /** Kept for API compatibility (v5 head badges). Always empty: no icons above heads. */
  readonly hud = new THREE.Group();
  state: DeptState = "idle";

  private body = new THREE.Group();
  private hips = new THREE.Group();
  private chest = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private shinL = new THREE.Group();
  private shinR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private foreL = new THREE.Group();
  private foreR = new THREE.Group();
  private head = new THREE.Group();
  private eyes = new THREE.Group();

  private pos = new THREE.Vector2();
  private target = new THREE.Vector2();
  private targetYaw = 0;
  private yaw = 0;
  private sit = 0;
  private sleep = 0;
  private relax = 0; // done pose
  private gesture = 0; // at the board
  private walkPhase = 0;
  private walking = false;
  private hop = 0;
  private blink = 1 + Math.random() * 3;
  private seed: number;
  private lookT = 0;
  private lookYaw = 0;
  private lookYawTarget = 0;
  // working routine: 0 = at the desk, 1 = at the board
  private task: 0 | 1 = 0;
  private taskT = 6;
  private board: { x: number; z: number; yaw: number } | null;
  // idle: turn to a colleague now and then
  private turnT = 5;
  private turnYaw = 0;
  private turnK = 0;

  constructor(
    readonly def: RoomDef,
    R: Registry,
    q: Quality,
  ) {
    const room = def.id;
    this.seed = def.cx * 1.7 + def.cz * 0.3;
    this.taskT = 7 + ((Math.abs(this.seed * 13.7) % 1) * 6);
    this.turnT = 4 + ((Math.abs(this.seed * 7.3) % 1) * 6);
    const w = WARDROBE[room] ?? WARDROBE.sam!;
    const shirt = R.m("cloth", room, def.color, { rough: 0.88, key: "shirt" });
    const skin = R.m("skin", room, def.color, { color: def.skin, rough: 0.6 });
    const hair = R.m("skin", room, def.color, { color: def.hair, rough: 0.7 });
    const pants = R.m("fixed", room, def.color, { color: w.pants, rough: 0.85 });
    const shoes = R.m("fixed", room, def.color, { color: w.shoes, rough: 0.55 });
    const eyeM = R.m("fixed", room, def.color, { color: EYES, rough: 0.3 });
    const seg = q === "high" ? 1 : 0.6;
    const cap = (r: number, len: number, m: THREE.Material, parent: THREE.Object3D, pos: [number, number, number]) => {
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, Math.round(6 * seg), Math.round(14 * seg)), m);
      mesh.position.set(...pos);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const sph = (r: number, m: THREE.Material, parent: THREE.Object3D, pos: [number, number, number], s = 20) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, Math.round(s * seg), Math.round(s * 0.75 * seg)), m);
      mesh.position.set(...pos);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    this.root.userData.keep = true;
    this.hud.userData.keep = true;
    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = HIP;

    // legs: thigh 0.36, shin 0.34, shoe
    for (const [leg, shin, sx] of [[this.legL, this.shinL, -1], [this.legR, this.shinR, 1]] as const) {
      leg.position.set(sx * 0.062, 0, 0);
      cap(0.05, 0.27, pants, leg, [0, -0.18, 0]);
      shin.position.set(0, -0.36, 0);
      leg.add(shin);
      cap(0.042, 0.27, pants, shin, [0, -0.165, 0]);
      const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.08, 4, Math.round(10 * seg)), shoes);
      shoe.rotation.x = Math.PI / 2;
      shoe.position.set(0, -0.34, 0.032);
      shoe.scale.set(1.05, 1, 0.8);
      shoe.castShadow = true;
      shin.add(shoe);
      this.hips.add(leg);
    }
    this.hips.add(this.chest);
    // pelvis (trousers) + torso (top), slim and slightly flattened front-to-back
    const pelvis = cap(0.098, 0.04, pants, this.chest, [0, 0.03, 0]);
    pelvis.scale.set(1, 1, 0.74);
    const torso = cap(0.112, 0.28, shirt, this.chest, [0, 0.29, 0]);
    torso.scale.set(1, 1, 0.7);
    // shoulders: a soft yoke so the silhouette is not a tube
    const yoke = cap(0.06, 0.2, shirt, this.chest, [0, 0.46, 0]);
    yoke.rotation.z = Math.PI / 2;
    yoke.scale.set(1, 1, 0.8);
    for (const [arm, fore, sx] of [[this.armL, this.foreL, -1], [this.armR, this.foreR, 1]] as const) {
      arm.position.set(sx * 0.155, 0.47, 0);
      cap(0.034, 0.2, shirt, arm, [0, -0.12, 0]);
      fore.position.set(0, -0.26, 0);
      arm.add(fore);
      cap(0.029, 0.17, shirt, fore, [0, -0.1, 0]);
      sph(0.033, skin, fore, [0, -0.225, 0.004], 12);
      arm.rotation.z = sx * 0.08;
      this.chest.add(arm);
    }
    // neck + head (head geometry authored at r = 0.2, scaled to r ≈ 0.116)
    cap(0.034, 0.06, skin, this.chest, [0, 0.58, 0]);
    this.head.position.y = 0.715;
    this.head.scale.setScalar(0.58);
    this.chest.add(this.head);
    const h = sph(0.2, skin, this.head, [0, 0, 0], 28);
    h.scale.set(0.94, 1.02, 0.97);
    this.eyes.position.set(0, 0, 0.18);
    this.head.add(this.eyes);
    for (const sx of [-1, 1]) {
      const e = sph(0.02, eyeM, this.eyes, [sx * 0.07, 0.0, 0], 10);
      e.scale.set(1, 1.25, 0.6);
      e.castShadow = false;
    }
    // hair cap
    const hc = new THREE.Mesh(new THREE.SphereGeometry(0.21, Math.round(28 * seg), Math.round(14 * seg), 0, Math.PI * 2, 0, Math.PI * 0.52), hair);
    hc.rotation.x = -0.42;
    hc.position.set(0, 0.016, -0.018);
    hc.scale.set(0.96, 1.04, 1);
    hc.castShadow = true;
    this.head.add(hc);
    this.accessory(R, hair, sph, q);

    // one vertex-coloured material per figure; every limb collapses to a single mesh (eyes stay apart to blink)
    const fig = R.vc(room, "figure", def.color);
    const skip = new Set<THREE.Object3D>();
    for (const g of [this.legL, this.legR, this.shinL, this.shinR, this.chest, this.armL, this.armR, this.foreL, this.foreR, this.head, this.eyes]) mergeLimb(g, fig, R, skip);

    // soft contact shadow that follows the agent
    const shM = R.m("shadow", room, def.color, { map: radialTex(), opacity: 0.4, key: "agent" });
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62).rotateX(-Math.PI / 2), shM);
    sh.position.y = 0.008;
    sh.renderOrder = 1;
    sh.raycast = () => {};
    this.root.add(sh);

    this.board = def.id === "lobby" ? null : def.row === "back" ? { x: 1.2, z: -1.72, yaw: Math.PI } : { x: -2.18, z: 1.6, yaw: -Math.PI / 2 };

    const s = this.spot("stand");
    this.pos.set(s.x, s.z);
    this.target.copy(this.pos);
    this.yaw = this.targetYaw = s.yaw;
    this.root.position.set(s.x, 0, s.z);
  }

  private accessory(R: Registry, hair: THREE.Material, sph: (r: number, m: THREE.Material, p: THREE.Object3D, pos: [number, number, number], s?: number) => THREE.Mesh, q: Quality) {
    const h = this.head;
    const d = this.def;
    const seg = q === "high" ? 1 : 0.6;
    switch (d.accessory) {
      case "bun":
        sph(0.1, hair, h, [0, 0.13, -0.18], 16);
        break;
      case "topbun":
        sph(0.1, hair, h, [0, 0.24, -0.04], 16);
        break;
      case "long": {
        const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.22, 4, Math.round(16 * seg)), hair);
        back.position.set(0, -0.14, -0.08);
        back.scale.set(1.18, 1, 0.7);
        back.castShadow = true;
        h.add(back);
        break;
      }
      case "glasses": {
        const gm = R.m("fixed", d.id, d.color, { color: "#1D2024", rough: 0.3 });
        for (const sx of [-1, 1]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.009, 6, 20), gm);
          ring.position.set(sx * 0.07, 0.0, 0.19);
          h.add(ring);
        }
        const br = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.012), gm);
        br.position.set(0, 0.005, 0.198);
        h.add(br);
        break;
      }
      case "beanie": {
        const bm = R.m("fixed", d.id, d.color, { color: "#7A3B2C", rough: 0.95 });
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.218, Math.round(24 * seg), 12, 0, Math.PI * 2, 0, Math.PI * 0.46), bm);
        b.position.y = 0.03;
        b.rotation.x = -0.2;
        b.castShadow = true;
        h.add(b);
        const fold = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.028, 6, Math.round(28 * seg)), bm);
        fold.rotation.x = Math.PI / 2 - 0.2;
        fold.position.set(0, 0.05, 0.0);
        h.add(fold);
        break;
      }
      case "cap": {
        const m = R.m("cloth", d.id, d.color, { rough: 0.7, key: "cap" });
        const c = new THREE.Mesh(new THREE.SphereGeometry(0.214, Math.round(24 * seg), 12, 0, Math.PI * 2, 0, Math.PI * 0.42), m);
        c.position.y = 0.025;
        c.castShadow = true;
        h.add(c);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.016, Math.round(24 * seg), 1, false, -Math.PI / 2, Math.PI), m);
        brim.position.set(0, 0.08, 0.15);
        brim.scale.set(1, 1, 0.8);
        h.add(brim);
        break;
      }
      case "headphones": {
        const hm = R.m("fixed", d.id, d.color, { color: "#2C3037", rough: 0.4 });
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 6, Math.round(24 * seg), Math.PI), hm);
        band.position.y = 0.01;
        h.add(band);
        for (const sx of [-1, 1]) {
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 18), hm);
          cup.rotation.z = Math.PI / 2;
          cup.position.set(sx * 0.21, -0.01, 0);
          h.add(cup);
        }
        break;
      }
      default:
        break;
    }
  }

  private spot(which: "seat" | "stand"): { x: number; z: number; yaw: number } {
    const p = this.def[which];
    const w = toWorld(this.def, p);
    return { x: w.x, z: w.z, yaw: p.yaw };
  }

  /** Head position in office-root space (for DOM tags). */
  headPoint(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.pos.x, this.headHeight() + 0.22, this.pos.y);
  }

  private headHeight() {
    return HIP + 0.715 + 0.12 - smooth(this.sit) * SIT_DROP - this.sleep * 0.25;
  }

  private seatedFor(s: DeptState) {
    return this.def.id !== "lobby" && (s === "working" || s === "locked" || s === "done");
  }

  private goTo(which: "seat" | "stand" | "board") {
    const sp = which === "board" && this.board ? { x: this.def.cx + this.board.x, z: this.def.cz + this.board.z, yaw: this.board.yaw } : this.spot(which === "board" ? "seat" : which);
    this.target.set(sp.x, sp.z);
    this.targetYaw = sp.yaw;
  }

  setState(s: DeptState, instant = false) {
    this.state = s;
    this.task = 0;
    this.goTo(this.def.id === "lobby" ? "seat" : this.seatedFor(s) ? "seat" : "stand");
    if (instant) {
      this.pos.copy(this.target);
      this.yaw = this.targetYaw;
      this.sit = this.seatedFor(s) ? 1 : 0;
      this.sleep = s === "locked" ? 1 : 0;
      this.relax = s === "done" ? 1 : 0;
      this.gesture = 0;
    }
  }

  cheer() {
    if (this.state === "locked") return;
    this.hop = 1;
  }

  /** Returns true while the agent is visibly in transition (walking, hopping). */
  update(dt: number, t: number, still: boolean): boolean {
    const s = this.state;
    let busy = false;

    // working routine: desk ↔ board
    if (s === "working" && !still && this.board) {
      this.taskT -= dt;
      if (this.taskT <= 0) {
        this.task = this.task === 0 ? 1 : 0;
        this.taskT = this.task === 1 ? 4.5 + (Math.abs(Math.sin(this.seed + t)) * 2) : 10 + Math.abs(Math.sin(this.seed * 3 + t)) * 6;
        this.goTo(this.task === 1 ? "board" : "seat");
      }
    } else if (this.task === 1) {
      this.task = 0;
      this.goTo(this.seatedFor(s) ? "seat" : "stand");
    }
    const wantSeat = this.seatedFor(s) && this.task === 0;

    // walking: stand up first, then walk, then sit
    const dx = this.target.x - this.pos.x;
    const dz = this.target.y - this.pos.y;
    const dist = Math.hypot(dx, dz);
    this.walking = false;
    if (dist > 0.01) {
      busy = true;
      this.sit = Math.max(0, this.sit - dt * 2.6);
      this.sleep = Math.max(0, this.sleep - dt * 3);
      this.relax = Math.max(0, this.relax - dt * 3);
      if (this.sit < 0.05) {
        const step = Math.min(dist, WALK * dt * Math.min(1, 0.35 + dist * 2));
        this.pos.x += (dx / dist) * step;
        this.pos.y += (dz / dist) * step;
        this.walking = dist > 0.02;
        this.yaw = this.turnTo(this.yaw, Math.atan2(dx, dz), dt, 8);
      }
    } else {
      // idle: now and then turn towards a colleague (corridor / next room), then back
      let yawT = this.targetYaw;
      if (s === "idle" && !still && this.def.id !== "lobby") {
        this.turnT -= dt;
        if (this.turnT <= 0) {
          this.turnK = this.turnK > 0.5 ? 0 : 1;
          this.turnYaw = (Math.sin(this.seed * 5.1 + t) > 0 ? 1 : -1) * (0.55 + Math.abs(Math.sin(t * 0.7)) * 0.4);
          this.turnT = this.turnK ? 2.8 + Math.abs(Math.sin(this.seed + t)) * 1.5 : 6 + Math.abs(Math.sin(this.seed * 2 + t)) * 6;
        }
        yawT += this.turnK * this.turnYaw;
      }
      this.yaw = this.turnTo(this.yaw, yawT, dt, 3.2);
      const sitT = wantSeat ? 1 : 0;
      if (Math.abs(this.sit - sitT) > 0.001) busy = true;
      this.sit = sitT >= this.sit ? Math.min(1, this.sit + dt * 2.2) : Math.max(0, this.sit - dt * 2.6);
      this.sleep = damp(this.sleep, s === "locked" ? 1 : 0, 3, dt);
      this.relax = damp(this.relax, s === "done" && this.sit > 0.9 ? 1 : 0, 2.2, dt);
    }
    this.gesture = damp(this.gesture, this.task === 1 && dist < 0.02 ? 1 : 0, 3, dt);
    if (this.walking) this.walkPhase += dt * 8.2;

    this.root.position.set(this.pos.x, 0, this.pos.y);
    this.root.rotation.y = this.yaw;

    const tt = still ? 0 : t;
    const breathe = Math.sin(tt * 1.7 + this.seed);
    const sitE = smooth(this.sit);
    const swing = this.walking ? Math.sin(this.walkPhase) * 0.42 : 0;
    const bob = this.walking ? Math.abs(Math.sin(this.walkPhase)) * 0.018 : 0;
    const relax = smooth(clamp01(this.relax));
    const gest = smooth(clamp01(this.gesture));

    // legs / hips
    this.legL.rotation.x = (-Math.PI / 2) * sitE + swing;
    this.legR.rotation.x = (-Math.PI / 2) * sitE - swing;
    this.shinL.rotation.x = (Math.PI / 2) * sitE * (1 - 0.25 * relax) + Math.max(0, -swing) * 0.7;
    this.shinR.rotation.x = (Math.PI / 2) * sitE * (1 - 0.15 * relax) + Math.max(0, swing) * 0.7;
    this.body.position.y = bob - sitE * SIT_DROP;
    // seated: slide forward onto the front of the seat to reach the keyboard; back when relaxed
    this.body.position.z = sitE * (0.08 - 0.1 * relax);
    const working = s === "working" && sitE > 0.6;
    const sleeping = this.sleep;

    // chest: forward while typing, slumped when asleep, leaning back when done
    this.chest.rotation.x = (working ? 0.12 : 0) + sleeping * 0.62 - relax * 0.26 + (still ? 0 : breathe * (0.01 + sleeping * 0.02));
    this.chest.scale.set(1, 1 + (still ? 0 : breathe * 0.01), 1 + (still ? 0 : breathe * 0.015));
    // weight shift when standing
    this.hips.rotation.z = !this.walking && sitE < 0.1 && !still ? Math.sin(tt * 0.45 + this.seed) * 0.03 : 0;
    this.hips.rotation.y = this.walking ? Math.sin(this.walkPhase) * 0.06 : 0;

    // arms
    let aL = -swing * 0.7, aR = swing * 0.7, fL = -0.18, fR = -0.18, zL = -0.07, zR = 0.07;
    if (working) {
      // typing: upper arms forward, forearms level on the keyboard, small alternating taps
      aL = -0.9 + Math.sin(tt * 14 + 0.3) * 0.03;
      aR = -0.9 + Math.sin(tt * 14 + 2.0) * 0.03;
      fL = -0.72 + Math.max(0, Math.sin(tt * 14)) * 0.1;
      fR = -0.72 + Math.max(0, Math.sin(tt * 14 + 1.7)) * 0.1;
      zL = 0.12;
      zR = -0.12;
    } else if (sleeping > 0.5) {
      // arms folded on the desk, head resting on them
      aL = aR = -1.05 * sleeping;
      fL = fR = -1.45 * sleeping;
      zL = 0.4;
      zR = -0.4;
    } else if (sitE > 0.5) {
      // seated, hands on the lap → hands behind the head when done
      aL = aR = -0.5 * (1 - relax) - 2.75 * relax;
      fL = fR = -0.75 * (1 - relax) - 2.45 * relax;
      zL = -0.05 - 0.55 * relax;
      zR = 0.05 + 0.55 * relax;
    } else if (!this.walking) {
      aL = breathe * 0.025;
      aR = -breathe * 0.025;
      if (gest > 0.01) {
        // at the board: right arm points at it, left hand relaxed
        aR = aR * (1 - gest) + (-1.55 + Math.sin(tt * 1.3) * 0.12) * gest;
        fR = -0.18 * (1 - gest) - 0.25 * gest;
        zR = 0.07 + 0.1 * gest;
      }
    }
    if (this.hop > 0) {
      const k = Math.sin(Math.min(1, (1 - this.hop) * 3) * Math.PI * 0.5) * this.hop;
      aL = aL * (1 - k) - 2.7 * k;
      aR = aR * (1 - k) - 2.7 * k;
      zL = -0.1 - 0.3 * k;
      zR = 0.1 + 0.3 * k;
      fL = fR = -0.1;
    }
    this.armL.rotation.set(aL, 0, zL);
    this.armR.rotation.set(aR, 0, zR);
    this.foreL.rotation.x = fL;
    this.foreR.rotation.x = fR;

    // head: idle glances, on the screen while working, down when asleep, up and back when done
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.lookT = 2.2 + ((Math.sin(this.seed * 13.1 + t) + 1) / 2) * 3.5;
      const r = Math.sin(this.seed * 7.7 + t * 1.3);
      this.lookYawTarget = s === "working" ? r * 0.15 : r * 0.5;
    }
    this.lookYaw = damp(this.lookYaw, still ? 0 : this.lookYawTarget, 2.5, dt);
    this.head.rotation.y = sleeping > 0.5 ? 0 : this.lookYaw * (1 - 0.6 * relax);
    this.head.rotation.x = working ? 0.12 + Math.sin(tt * 2.1) * 0.025 : sleeping * 0.35 - relax * 0.12;
    this.head.rotation.z = sleeping * 0.42 + (s === "idle" && !still ? Math.sin(tt * 0.7 + this.seed) * 0.03 : 0);

    // hop (cheer)
    if (this.hop > 0) {
      busy = true;
      this.hop = Math.max(0, this.hop - dt * 0.85);
      const ph = (1 - this.hop) * Math.PI * 2;
      this.body.position.y += Math.max(0, Math.sin(ph)) * 0.13 * this.hop;
    }

    // blinks / closed eyes (also closed, content, when relaxed)
    this.blink -= dt;
    const closed = sleeping > 0.5 || relax > 0.8 || (!still && this.blink < 0.11);
    if (this.blink < 0) this.blink = 2.4 + ((Math.sin(this.seed * 3 + t) + 1) / 2) * 3;
    this.eyes.scale.y = closed ? 0.15 : 1;

    this.hud.position.set(this.pos.x, 0, this.pos.y);
    return busy;
  }

  private turnTo(a: number, b: number, dt: number, k: number) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * (1 - Math.exp(-k * dt));
  }

  dispose() {
    for (const g of [this.root, this.hud])
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
  }
}

// ─────────────────────────────────────────────── room celebrations

/** A soft floor ripple + a few rising motes of light. Tasteful, ~1.6 s. */
export class Cheer {
  readonly root = new THREE.Group();
  private ripple: THREE.Mesh;
  private rippleM: THREE.MeshBasicMaterial;
  private motes: THREE.InstancedMesh;
  private moteM: THREE.MeshBasicMaterial;
  private seeds: Array<{ x: number; z: number; v: number; d: number; s: number }> = [];
  private t = -1;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private sc = new THREE.Vector3();

  constructor() {
    this.root.userData.keep = true;
    this.rippleM = new THREE.MeshBasicMaterial({ color: "#ffffff", map: null, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.ripple = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 64).rotateX(-Math.PI / 2), this.rippleM);
    this.ripple.position.y = 0.02;
    this.ripple.raycast = () => {};
    this.moteM = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, toneMapped: false, map: radialTex(), blending: THREE.AdditiveBlending });
    this.motes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.09), this.moteM, 22);
    this.motes.raycast = () => {};
    this.motes.frustumCulled = false;
    this.root.add(this.ripple, this.motes);
    this.root.visible = false;
  }

  fire(x: number, z: number, color: string) {
    this.root.position.set(x, 0, z);
    this.rippleM.color.set(color);
    this.moteM.color.set(color).lerp(new THREE.Color("#ffffff"), 0.35);
    this.seeds = Array.from({ length: 22 }, (_, i) => {
      const a = i * 2.39996;
      const r = 0.3 + ((i * 37) % 11) / 11 * 1.6;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, v: 0.5 + ((i * 13) % 7) / 7 * 0.6, d: ((i * 17) % 9) / 9 * 0.35, s: 0.7 + ((i * 7) % 5) / 5 * 0.7 };
    });
    this.t = 0;
    this.root.visible = true;
  }

  update(dt: number): boolean {
    if (this.t < 0) return false;
    this.t += dt;
    const T = 1.8;
    const k = this.t / T;
    if (k >= 1) {
      this.t = -1;
      this.root.visible = false;
      return false;
    }
    const e = 1 - Math.pow(1 - k, 3);
    this.ripple.scale.setScalar(0.4 + e * 2.4);
    this.rippleM.opacity = 0.55 * (1 - k);
    this.q.copy(BILLBOARD_Q);
    this.seeds.forEach((s, i) => {
      const lk = Math.max(0, this.t - s.d) / (T - s.d);
      const y = 0.1 + lk * s.v * 1.6;
      this.p.set(s.x * (0.6 + lk * 0.4), y, s.z * (0.6 + lk * 0.4));
      const a = Math.sin(Math.min(1, lk) * Math.PI) * s.s;
      this.sc.setScalar(Math.max(0.001, a));
      this.m4.compose(this.p, this.q, this.sc);
      this.motes.setMatrixAt(i, this.m4);
    });
    this.motes.instanceMatrix.needsUpdate = true;
    this.moteM.opacity = 0.9;
    return true;
  }

  dispose() {
    this.rippleM.dispose();
    this.moteM.dispose();
    this.ripple.geometry.dispose();
    this.motes.geometry.dispose();
  }
}
