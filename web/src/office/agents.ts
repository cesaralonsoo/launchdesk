import * as THREE from "three";
import { box, contactShadow, mat, sphere } from "./furniture";
import { ROOM, route, roomAt, toWorld, type AgentState, type DeptId, type RoomDef, type Vec2 } from "./layout";

const SCALE = 1.08;
const WALK_SPEED = 3.4; // world units / second
const PANTS = "#2E3A50";
const SHOES = "#1B2130";
const EYES = "#1B1F2A";

const capGeo = new Map<string, THREE.CapsuleGeometry>();
function capsule(r: number, len: number, m: THREE.Material, pos: [number, number, number]) {
  const k = `${r},${len}`;
  let g = capGeo.get(k);
  if (!g) {
    g = new THREE.CapsuleGeometry(r, len, 6, 14);
    capGeo.set(k, g);
  }
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(...pos);
  mesh.castShadow = true;
  return mesh;
}

type Spot = Vec2 & { yaw?: number };

export class Agent {
  readonly id: DeptId;
  readonly room: RoomDef;
  readonly root = new THREE.Group();
  readonly hit: THREE.Mesh;
  state: AgentState = "idle";

  private body = new THREE.Group();
  private hips = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private torso: THREE.Mesh;
  private head = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private sparkles = new THREE.Group();

  private path: Vec2[] = [];
  private pathDone: (() => void) | null = null;
  private yaw = 0;
  private targetYaw = 0;
  private sit = 0;
  private targetSit = 0;
  private lean = 0;
  private targetLean = 0;
  private walkPhase = 0;
  private hop = 0;
  private away = false; // visiting another room
  private paceIdx = 0;
  private paceWait = 0;
  private blink = 2 + Math.random() * 3;
  private seed = Math.random() * 10;
  readonly beanBag: THREE.Vector3 | null;

  constructor(room: RoomDef, beanBag?: THREE.Vector3) {
    this.id = room.id;
    this.room = room;
    this.beanBag = beanBag ? beanBag.clone() : null;
    const shirt = mat(room.color, { rough: 0.7 });
    const skin = mat(room.skin, { rough: 0.65 });
    const hair = mat(room.hair, { rough: 0.8 });

    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = 0.36;

    // legs
    for (const [leg, sx] of [[this.legL, -1], [this.legR, 1]] as const) {
      leg.position.set(sx * 0.095, 0, 0);
      leg.add(capsule(0.072, 0.2, mat(PANTS), [0, -0.16, 0]));
      leg.add(box(0.13, 0.07, 0.2, mat(SHOES), [0, -0.33, 0.035], 0.03));
      this.hips.add(leg);
    }
    // torso
    this.torso = capsule(0.2, 0.2, shirt, [0, 0.27, 0]);
    this.torso.scale.set(1, 1, 0.86);
    this.hips.add(this.torso);
    const belt = capsule(0.205, 0.02, mat(PANTS), [0, 0.07, 0]);
    belt.scale.set(1, 1, 0.86);
    this.hips.add(belt);
    // collar
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 16), mat("#FFFFFF"));
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.5, 0.01);
    this.hips.add(collar);
    // arms
    for (const [arm, sx] of [[this.armL, -1], [this.armR, 1]] as const) {
      arm.position.set(sx * 0.235, 0.43, 0);
      arm.add(capsule(0.062, 0.17, shirt, [0, -0.13, 0]));
      arm.add(sphere(0.062, skin, [0, -0.29, 0.01], 10));
      arm.rotation.z = sx * 0.12;
      this.hips.add(arm);
    }
    // head
    this.head.position.y = 0.74;
    this.hips.add(this.head);
    const h = sphere(0.245, skin, [0, 0, 0], 24);
    h.scale.set(1, 0.95, 0.95);
    this.head.add(h);
    for (const sx of [-1, 1]) {
      const e = sphere(0.032, mat(EYES, { rough: 0.3 }), [sx * 0.088, -0.01, 0.21], 10);
      e.scale.set(1, 1.15, 0.6);
      this.eyes.push(e);
      this.head.add(e);
      const b = sphere(0.045, mat("#F59E9E", { rough: 0.9 }), [sx * 0.155, -0.075, 0.175], 10);
      b.scale.set(1, 0.6, 0.35);
      b.castShadow = false;
      this.head.add(b);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 4, 12, Math.PI), mat(EYES));
    smile.position.set(0, -0.085, 0.218);
    smile.rotation.z = Math.PI;
    this.head.add(smile);
    // hair cap
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.262, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), hair);
    cap.rotation.x = -0.42;
    cap.position.set(0, 0.015, -0.02);
    cap.castShadow = true;
    this.head.add(cap);
    this.addAccessory(room.accessory, hair, room.color);

    // sparkles (working)
    const sm = new THREE.MeshBasicMaterial({ color: "#FFE58A", toneMapped: false });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.05 - i * 0.008), sm);
      s.userData.k = i;
      this.sparkles.add(s);
    }
    this.sparkles.position.y = 1.15;
    this.sparkles.visible = false;
    this.body.add(this.sparkles);

    this.body.scale.setScalar(SCALE);

    // invisible hit box for picking
    this.hit = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.45, 0.8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    this.hit.position.y = 0.7;
    this.hit.userData.agent = room.id;
    this.root.add(this.hit);
    this.root.add(contactShadow(0.95, 0.95));

    const home = this.spot("stand");
    this.root.position.set(home.x, 0, home.z);
    this.yaw = this.targetYaw = home.yaw ?? 0;
    this.root.traverse((o) => (o.userData.agent = room.id));
  }

  private addAccessory(kind: RoomDef["accessory"], hair: THREE.Material, color: string) {
    const h = this.head;
    switch (kind) {
      case "bun":
        h.add(sphere(0.11, hair, [0, 0.17, -0.2], 14));
        break;
      case "topbun":
        h.add(sphere(0.12, hair, [0, 0.29, -0.04], 14));
        break;
      case "long": {
        const back = box(0.46, 0.42, 0.14, hair, [0, -0.1, -0.15], 0.07);
        h.add(back);
        break;
      }
      case "glasses": {
        const gm = mat("#1F2937", { rough: 0.3 });
        for (const sx of [-1, 1]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.012, 6, 16), gm);
          ring.position.set(sx * 0.088, -0.01, 0.228);
          h.add(ring);
        }
        h.add(box(0.06, 0.014, 0.014, gm, [0, 0.0, 0.235]));
        break;
      }
      case "beanie": {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), mat("#C2410C", { rough: 0.9 }));
        b.position.y = 0.04;
        b.rotation.x = -0.25;
        h.add(b);
        h.add(sphere(0.06, mat("#FDBA74"), [0, 0.3, -0.05], 10));
        break;
      }
      case "cap": {
        const c = new THREE.Mesh(new THREE.SphereGeometry(0.265, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), mat(color, { rough: 0.6 }));
        c.position.y = 0.03;
        h.add(c);
        const brim = box(0.26, 0.025, 0.18, mat(color, { rough: 0.6 }), [0, 0.1, 0.24], 0.01);
        h.add(brim);
        break;
      }
      case "headphones": {
        const hm = mat("#334155", { rough: 0.4 });
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.025, 6, 20, Math.PI), hm);
        band.position.y = 0.02;
        h.add(band);
        for (const sx of [-1, 1]) {
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16), mat("#0AC18E", { rough: 0.5 }));
          cup.rotation.z = Math.PI / 2;
          cup.position.set(sx * 0.255, -0.02, 0);
          h.add(cup);
        }
        break;
      }
      default:
        break;
    }
  }

  /** World-space spot inside the home room. */
  private spot(which: "seat" | "stand" | "visit"): Spot {
    const p = this.room[which];
    const w = toWorld(this.room, p);
    return { ...w, yaw: "yaw" in p ? (p as { yaw: number }).yaw : undefined };
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }
  get isWalking() {
    return this.path.length > 0;
  }

  headWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.head.getWorldPosition(out);
  }

  setState(s: AgentState) {
    this.state = s;
    if (s === "done") this.hop = 1;
    if (!this.away && !this.isWalking) this.settle();
  }

  /** Move to the posture spot that matches the current state (inside the home room). */
  private settle() {
    const s = this.state;
    let target: Spot;
    if (s === "working") target = this.spot("seat");
    else if (s === "sleeping" && this.beanBag) {
      const w = toWorld(this.room, { x: this.beanBag.x, z: this.beanBag.z - 0.05 });
      target = { ...w, yaw: Math.PI * 0.85 };
    } else if (s === "sleeping") target = this.spot("seat");
    else target = this.spot("stand");
    const d = Math.hypot(target.x - this.root.position.x, target.z - this.root.position.z);
    this.targetSit = 0;
    this.targetLean = 0;
    if (d > 0.05) {
      this.followPath([target], () => this.arrive(target));
    } else {
      this.arrive(target);
    }
  }

  private arrive(t: Spot) {
    if (t.yaw !== undefined) this.targetYaw = t.yaw;
    const s = this.state;
    const seated = (s === "working" || s === "sleeping") && this.room.id !== "lobby";
    this.targetSit = seated ? 1 : 0;
    this.targetLean = s === "sleeping" ? (this.beanBag ? -0.75 : 0.35) : 0;
  }

  /** Walk to another department (or back home when to === own id). */
  walkTo(to: DeptId): Promise<void> {
    const target = ROOM[to];
    const home = to === this.id;
    const destLocal = home ? this.room.stand : target.visit;
    // stagger visitors a little so they don't overlap the host
    const dest = toWorld(target, destLocal);
    const pts = route({ x: this.root.position.x, z: this.root.position.z }, target, dest);
    this.targetSit = 0;
    this.targetLean = 0;
    return new Promise((resolve) => {
      this.followPath(pts, () => {
        this.away = !home;
        if (home) {
          this.settle();
        } else {
          // face the host's workstation
          const host = toWorld(target, target.stand);
          this.targetYaw = Math.atan2(host.x - dest.x, host.z - dest.z);
        }
        resolve();
      });
    });
  }

  private followPath(pts: Vec2[], done: () => void) {
    if (this.pathDone) {
      const prev = this.pathDone;
      this.pathDone = null;
      prev();
    }
    this.path = pts.slice();
    this.pathDone = done;
    this.sit = Math.min(this.sit, 0.6);
  }

  update(dt: number, t: number) {
    const p = this.root.position;
    let moving = false;

    if (this.path.length && this.sit < 0.08) {
      const next = this.path[0]!;
      const dx = next.x - p.x;
      const dz = next.z - p.z;
      const dist = Math.hypot(dx, dz);
      const step = WALK_SPEED * dt;
      if (dist <= step) {
        p.x = next.x;
        p.z = next.z;
        this.path.shift();
        if (!this.path.length) {
          const cb = this.pathDone;
          this.pathDone = null;
          cb?.();
        }
      } else {
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
        this.targetYaw = Math.atan2(dx, dz);
        moving = true;
      }
    } else if (this.path.length) {
      this.targetSit = 0; // stand up first
    }

    // pacing in place for the "walking" state (inside the home room)
    if (!moving && !this.path.length && this.state === "walking" && !this.away) {
      this.paceWait -= dt;
      if (this.paceWait <= 0) {
        const r = this.room;
        const spots: Vec2[] = [r.stand, { x: r.visit.x, z: r.visit.z }, { x: 0.2, z: r.row === "back" ? 0.1 : 0.2 }];
        this.paceIdx = (this.paceIdx + 1) % spots.length;
        const w = toWorld(r, spots[this.paceIdx]!);
        this.followPath([w], () => (this.paceWait = 0.8 + Math.random() * 1.2));
        this.paceWait = 99;
      }
    }

    // smooth yaw / sit / lean
    let dy = this.targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 10);
    this.root.rotation.y = this.yaw;
    this.sit += (this.targetSit - this.sit) * Math.min(1, dt * 7);
    this.lean += (this.targetLean - this.lean) * Math.min(1, dt * 4);

    // walk cycle
    const walking = moving;
    if (walking) this.walkPhase += dt * 11;
    const swing = walking ? Math.sin(this.walkPhase) * 0.65 : 0;
    const bob = walking ? Math.abs(Math.sin(this.walkPhase)) * 0.045 : 0;

    const working = this.state === "working" && !walking;
    const sleeping = this.state === "sleeping" && !walking;
    const breathe = Math.sin(t * 2.2 + this.seed);

    // posture
    const legSit = -Math.PI / 2 * this.sit;
    this.legL.rotation.x = legSit + swing;
    this.legR.rotation.x = legSit - swing;
    this.body.position.y = this.sit * 0.07 + bob;
    this.hips.rotation.x = this.lean * (this.beanBag ? 1 : 0.5);
    if (this.beanBag && sleeping) this.body.position.y = this.sit * 0.0 + 0.0;

    // arms
    let aL = -swing * 0.9;
    let aR = swing * 0.9;
    if (working) {
      const k = this.sit;
      aL = -1.15 * k + Math.sin(t * 17) * 0.12 * k;
      aR = -1.15 * k + Math.sin(t * 17 + 1.7) * 0.12 * k;
      if (k < 0.5) {
        // working while away / standing: gesture
        aR = -0.9 + Math.sin(t * 5) * 0.25;
      }
    } else if (this.hop > 0) {
      aL = -2.6 * this.hop;
      aR = -2.6 * this.hop;
    } else if (!walking && !sleeping) {
      aL = breathe * 0.04;
      aR = -breathe * 0.04;
    }
    this.armL.rotation.x = aL;
    this.armR.rotation.x = aR;
    this.armL.rotation.z = -0.12 - (this.hop > 0 ? 0.3 * this.hop : 0);
    this.armR.rotation.z = 0.12 + (this.hop > 0 ? 0.3 * this.hop : 0);

    // breathing / typing bounce
    const tb = working && this.sit > 0.5 ? Math.abs(Math.sin(t * 9)) * 0.012 : 0;
    this.torso.scale.y = 1 + breathe * 0.02;
    this.head.position.y = 0.74 + breathe * 0.008 + tb;
    this.head.rotation.x = sleeping ? 0.35 : working ? 0.12 : 0;
    this.head.rotation.y = !walking && !working && !sleeping ? Math.sin(t * 0.6 + this.seed) * 0.25 : 0;
    this.head.rotation.z = sleeping ? 0.2 : 0;

    // hop for "done"
    if (this.hop > 0) {
      this.hop = Math.max(0, this.hop - dt * 0.9);
      const ph = (1 - this.hop) * Math.PI * 3;
      this.body.position.y += Math.abs(Math.sin(ph)) * 0.22 * this.hop;
    }

    // blink / closed eyes
    this.blink -= dt;
    let eyeY = 1.15;
    if (sleeping) eyeY = 0.15;
    else if (this.blink < 0.12) eyeY = 0.15;
    if (this.blink < 0) this.blink = 2.5 + Math.random() * 3;
    for (const e of this.eyes) e.scale.y = eyeY;

    // sparkles
    this.sparkles.visible = working;
    if (working) {
      this.sparkles.children.forEach((s, i) => {
        const a = t * 2.2 + (i * Math.PI * 2) / 3;
        s.position.set(Math.cos(a) * 0.42, 0.25 + Math.sin(t * 3 + i) * 0.1, Math.sin(a) * 0.42);
        s.rotation.y = t * 3;
        const sc = 0.7 + Math.abs(Math.sin(t * 4 + i * 2)) * 0.6;
        s.scale.setScalar(sc);
      });
    }
  }

  /** Little jump with arms up (celebrations). */
  cheer() {
    if (this.state !== "sleeping" && !this.isWalking) this.hop = 1;
  }

  /** Is this agent currently outside its home room? */
  get isAway() {
    const r = roomAt({ x: this.root.position.x, z: this.root.position.z });
    return !r || r.id !== this.id;
  }
}
