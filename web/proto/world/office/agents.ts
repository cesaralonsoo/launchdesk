// WS-A · the seven specialists + receptionist. Soft, rounded figures with minimal faces (two eyes),
// idle life (breathing, weight shift, head turns, blinks), working (walk to desk, sit, type, progress ring),
// done (stand, small hop, check badge), locked (asleep at the desk), cheer (hop, arms up).
import * as THREE from "three";
import type { DeptState, Quality } from "../../contracts";
import type { Registry } from "./kit";
import { toWorld, type RoomDef } from "./layout";
import { checkTex, radialTex } from "./textures";

const PANTS = "#2F3440";
const SHOES = "#1D2027";
const EYES = "#1B1D22";
const WALK = 1.25; // m/s — unhurried

/** Fixed camera direction used by the world rig (yaw 34°, pitch 40°): billboards face it. */
const CAM_DIR = new THREE.Vector3(Math.cos(THREE.MathUtils.degToRad(40)) * Math.sin(THREE.MathUtils.degToRad(34)), Math.sin(THREE.MathUtils.degToRad(40)), Math.cos(THREE.MathUtils.degToRad(40)) * Math.cos(THREE.MathUtils.degToRad(34)));
const BILLBOARD_Q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), CAM_DIR);

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const smooth = (x: number) => x * x * (3 - 2 * x);

export class Agent {
  readonly root = new THREE.Group();
  /** Billboarded status widgets (progress ring, done badge), not rotated with the body. */
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
  private eyes: THREE.Mesh[] = [];
  private ring = new THREE.Group();
  private ringArc: THREE.Mesh;
  private ringMats: THREE.MeshBasicMaterial[] = [];
  private badge = new THREE.Group();
  private badgeMats: THREE.MeshBasicMaterial[] = [];

  private pos = new THREE.Vector2();
  private target = new THREE.Vector2();
  private targetYaw = 0;
  private yaw = 0;
  private sit = 0;
  private sleep = 0;
  private walkPhase = 0;
  private walking = false;
  private hop = 0;
  private hopArms = 0;
  private ringK = 0;
  private badgeK = 0;
  private blink = 1 + Math.random() * 3;
  private seed: number;
  private lookT = 0;
  private lookYaw = 0;
  private lookYawTarget = 0;

  constructor(
    readonly def: RoomDef,
    R: Registry,
    q: Quality,
  ) {
    const room = def.id;
    this.seed = def.cx * 1.7 + def.cz * 0.3;
    const shirt = R.m("accent", room, def.color, { rough: 0.8, key: "shirt" });
    const skin = R.m("skin", room, def.color, { color: def.skin, rough: 0.6 });
    const hair = R.m("skin", room, def.color, { color: def.hair, rough: 0.75 });
    const pants = R.m("fixed", room, def.color, { color: PANTS, rough: 0.8 });
    const shoes = R.m("fixed", room, def.color, { color: SHOES, rough: 0.6 });
    const eyeM = R.m("fixed", room, def.color, { color: EYES, rough: 0.3 });
    const seg = q === "high" ? 1 : 0.6;
    const cap = (r: number, len: number, m: THREE.Material, parent: THREE.Object3D, pos: [number, number, number]) => {
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, Math.round(6 * seg), Math.round(16 * seg)), m);
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
    this.hips.position.y = 0.45;

    for (const [leg, shin, sx] of [[this.legL, this.shinL, -1], [this.legR, this.shinR, 1]] as const) {
      leg.position.set(sx * 0.085, 0, 0);
      cap(0.07, 0.12, pants, leg, [0, -0.09, 0]);
      shin.position.set(0, -0.19, 0);
      leg.add(shin);
      cap(0.064, 0.1, pants, shin, [0, -0.08, 0]);
      const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.08, 4, 10), shoes);
      shoe.rotation.x = Math.PI / 2;
      shoe.position.set(0, -0.205, 0.035);
      shoe.scale.set(1.1, 1, 0.75);
      shoe.castShadow = true;
      shin.add(shoe);
      this.hips.add(leg);
    }
    this.hips.add(this.chest);
    const torso = cap(0.165, 0.2, shirt, this.chest, [0, 0.23, 0]);
    torso.scale.set(1, 1, 0.8);
    const waist = cap(0.155, 0.02, pants, this.chest, [0, 0.07, 0]);
    waist.scale.set(1, 1, 0.8);
    for (const [arm, fore, sx] of [[this.armL, this.foreL, -1], [this.armR, this.foreR, 1]] as const) {
      arm.position.set(sx * 0.2, 0.42, 0);
      cap(0.05, 0.12, shirt, arm, [0, -0.08, 0]);
      fore.position.set(0, -0.17, 0);
      arm.add(fore);
      cap(0.045, 0.1, skin, fore, [0, -0.06, 0]);
      sph(0.05, skin, fore, [0, -0.15, 0.005], 12);
      arm.rotation.z = sx * 0.1;
      this.chest.add(arm);
    }
    // neck + head
    cap(0.05, 0.04, skin, this.chest, [0, 0.5, 0]);
    this.head.position.y = 0.7;
    this.head.scale.setScalar(0.82); // calmer proportions: less toy, more figure
    this.chest.add(this.head);
    const h = sph(0.2, skin, this.head, [0, 0, 0], 28);
    h.scale.set(1, 0.97, 0.94);
    for (const sx of [-1, 1]) {
      const e = sph(0.022, eyeM, this.head, [sx * 0.072, -0.005, 0.18], 10);
      e.scale.set(1, 1.3, 0.6);
      e.castShadow = false;
      this.eyes.push(e);
      sph(0.03, R.m("skin", room, def.color, { color: def.skin, rough: 0.6, shade: 0.96 }), this.head, [sx * 0.195, -0.02, 0.0], 10).scale.set(0.5, 1, 0.8);
    }
    // hair cap
    const hc = new THREE.Mesh(new THREE.SphereGeometry(0.212, Math.round(28 * seg), Math.round(14 * seg), 0, Math.PI * 2, 0, Math.PI * 0.5), hair);
    hc.rotation.x = -0.45;
    hc.position.set(0, 0.012, -0.016);
    hc.castShadow = true;
    this.head.add(hc);
    this.accessory(R, hair, sph, q);

    this.body.scale.setScalar(1.06);

    // ── HUD: progress ring + done badge (billboarded to the camera direction)
    const ringBase = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const ringArcM = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const disc = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.ringMats.push(ringBase, ringArcM, disc);
    const plate = new THREE.Mesh(new THREE.CircleGeometry(0.15, 40), disc);
    plate.position.z = -0.002;
    this.ring.add(plate);
    this.ring.add(new THREE.Mesh(new THREE.RingGeometry(0.105, 0.125, 48), ringBase));
    this.ringArc = new THREE.Mesh(new THREE.RingGeometry(0.105, 0.125, 48, 1, 0, Math.PI * 0.6), ringArcM);
    this.ring.add(this.ringArc);
    const bDisc = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const bCheck = new THREE.MeshBasicMaterial({ map: checkTex(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const bHalo = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.badgeMats.push(bDisc, bCheck, bHalo);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(0.15, 40), bHalo);
    halo.position.z = -0.002;
    this.badge.add(halo);
    this.badge.add(new THREE.Mesh(new THREE.CircleGeometry(0.12, 40), bDisc));
    const ck = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), bCheck);
    ck.position.z = 0.002;
    this.badge.add(ck);
    for (const g of [this.ring, this.badge]) {
      g.quaternion.copy(BILLBOARD_Q);
      g.renderOrder = 10;
      g.traverse((o) => {
        o.renderOrder = 10;
        o.raycast = () => {};
      });
      g.visible = false;
      this.hud.add(g);
    }
    // soft contact shadow that follows the agent
    const shM = R.m("shadow", room, def.color, { map: radialTex(), opacity: 0.32, key: "agent" });
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7).rotateX(-Math.PI / 2), shM);
    sh.position.y = 0.008;
    sh.renderOrder = 1;
    sh.raycast = () => {};
    this.root.add(sh);

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
        sph(0.09, hair, h, [0, 0.15, -0.16], 16);
        break;
      case "topbun":
        sph(0.095, hair, h, [0, 0.24, -0.03], 16);
        break;
      case "long": {
        const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.16, 4, Math.round(16 * seg)), hair);
        back.position.set(0, -0.1, -0.08);
        back.scale.set(1.25, 1, 0.75);
        back.castShadow = true;
        h.add(back);
        break;
      }
      case "glasses": {
        const gm = R.m("fixed", d.id, d.color, { color: "#20242B", rough: 0.3 });
        for (const sx of [-1, 1]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.008, 6, 20), gm);
          ring.position.set(sx * 0.072, -0.005, 0.19);
          h.add(ring);
        }
        const br = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.01), gm);
        br.position.set(0, 0.0, 0.198);
        h.add(br);
        break;
      }
      case "beanie": {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.218, Math.round(24 * seg), 12, 0, Math.PI * 2, 0, Math.PI * 0.46), R.m("fixed", d.id, d.color, { color: "#B4462A", rough: 0.95 }));
        b.position.y = 0.03;
        b.rotation.x = -0.2;
        b.castShadow = true;
        h.add(b);
        const fold = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, Math.round(28 * seg)), R.m("fixed", d.id, d.color, { color: "#B4462A", rough: 0.95 }));
        fold.rotation.x = Math.PI / 2 - 0.2;
        fold.position.set(0, 0.05, 0.0);
        h.add(fold);
        break;
      }
      case "cap": {
        const m = R.m("accent", d.id, d.color, { rough: 0.6, key: "cap" });
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
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 18), R.m("accent", d.id, d.color, { rough: 0.5, key: "cups" }));
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
    return out.set(this.pos.x, this.headHeight() + 0.3, this.pos.y);
  }

  private headHeight() {
    return 0.45 * 1.06 + (0.73 + 0.2) * 1.06 - smooth(this.sit) * 0.11 - this.sleep * 0.22;
  }

  setState(s: DeptState, instant = false) {
    const prev = this.state;
    this.state = s;
    const seated = s === "working" || s === "locked" || this.def.id === "lobby";
    const sp = this.spot(this.def.id === "lobby" ? "seat" : seated ? "seat" : "stand");
    this.target.set(sp.x, sp.z);
    this.targetYaw = sp.yaw;
    if (s === "done" && this.def.id !== "lobby") this.targetYaw = Math.PI * 0.18; // turn gently to the viewer
    if (s === "done" && prev === "working" && !instant) this.hop = 1;
    if (instant) {
      this.pos.copy(this.target);
      this.yaw = this.targetYaw;
      this.sit = seated && this.def.id !== "lobby" ? 1 : 0;
      this.sleep = s === "locked" ? 1 : 0;
      this.ringK = s === "working" ? 1 : 0;
      this.badgeK = s === "done" ? 1 : 0;
    }
  }

  cheer() {
    if (this.state === "locked") return;
    this.hop = 1;
    this.hopArms = 1;
  }

  /** Returns true while the agent is visibly in transition (walking, hopping, rings fading). */
  update(dt: number, t: number, still: boolean): boolean {
    const s = this.state;
    const isLobby = this.def.id === "lobby";
    const wantSeat = (s === "working" || s === "locked") && !isLobby;
    let busy = false;

    // walking: stand up first, then walk, then sit
    const dx = this.target.x - this.pos.x;
    const dz = this.target.y - this.pos.y;
    const dist = Math.hypot(dx, dz);
    this.walking = false;
    if (dist > 0.01) {
      busy = true;
      this.sit = Math.max(0, this.sit - dt * 3);
      this.sleep = Math.max(0, this.sleep - dt * 3);
      if (this.sit < 0.05) {
        const step = Math.min(dist, WALK * dt);
        this.pos.x += (dx / dist) * step;
        this.pos.y += (dz / dist) * step;
        this.walking = dist > 0.02;
        this.yaw = this.turnTo(this.yaw, Math.atan2(dx, dz), dt, 9);
      }
    } else {
      this.yaw = this.turnTo(this.yaw, this.targetYaw, dt, 6);
      const sitT = wantSeat ? 1 : 0;
      if (Math.abs(this.sit - sitT) > 0.001) busy = true;
      this.sit = sitT > this.sit ? Math.min(1, this.sit + dt * 2.6) : Math.max(0, this.sit - dt * 3);
      const sl = s === "locked" ? 1 : 0;
      this.sleep = damp(this.sleep, sl, 3, dt);
    }
    if (this.walking) this.walkPhase += dt * 9.5;

    this.root.position.set(this.pos.x, 0, this.pos.y);
    this.root.rotation.y = this.yaw;

    const tt = still ? 0 : t;
    const breathe = Math.sin(tt * 1.9 + this.seed);
    const sitE = smooth(this.sit);
    const swing = this.walking ? Math.sin(this.walkPhase) * 0.55 : 0;
    const bob = this.walking ? Math.abs(Math.sin(this.walkPhase)) * 0.03 : 0;

    // legs / hips
    this.legL.rotation.x = -Math.PI / 2 * sitE + swing;
    this.legR.rotation.x = -Math.PI / 2 * sitE - swing;
    this.shinL.rotation.x = (Math.PI / 2) * sitE + Math.max(0, -swing) * 0.6;
    this.shinR.rotation.x = (Math.PI / 2) * sitE + Math.max(0, swing) * 0.6;
    this.body.position.y = bob - sitE * 0.11;
    // seated: move the hips a little back onto the chair seat
    this.body.position.z = -sitE * 0.06;
    const working = s === "working" && sitE > 0.6;
    const sleeping = this.sleep;

    // chest lean: forward while typing, slumped forward when asleep
    this.chest.rotation.x = (working ? 0.1 : 0) + sleeping * 0.62 + (still ? 0 : breathe * (0.012 + sleeping * 0.02));
    this.chest.scale.set(1, 1 + (still ? 0 : breathe * 0.012), 1);
    // weight shift when idle standing
    this.hips.rotation.z = !this.walking && sitE < 0.1 && !still ? Math.sin(tt * 0.45 + this.seed) * 0.025 : 0;

    // arms
    let aL = -swing * 0.8, aR = swing * 0.8, fL = -0.15, fR = -0.15, zL = -0.1, zR = 0.1;
    if (working) {
      // typing: upper arms forward, forearms level, small alternating taps
      aL = -0.55 + Math.sin(tt * 15 + 0.3) * 0.04;
      aR = -0.55 + Math.sin(tt * 15 + 2.0) * 0.04;
      fL = -0.95 + Math.max(0, Math.sin(tt * 15)) * 0.12;
      fR = -0.95 + Math.max(0, Math.sin(tt * 15 + 1.7)) * 0.12;
      zL = -0.05;
      zR = 0.05;
    } else if (sleeping > 0.5) {
      // arms folded on the desk, head resting on them
      aL = aR = -0.95 * sleeping;
      fL = fR = -1.35 * sleeping;
      zL = 0.45;
      zR = -0.45;
    } else if (sitE > 0.5) {
      aL = aR = -0.45;
      fL = fR = -0.6;
    } else if (!this.walking) {
      aL = breathe * 0.03;
      aR = -breathe * 0.03;
    }
    if (this.hop > 0 && this.hopArms > 0) {
      const k = Math.sin(Math.min(1, (1 - this.hop) * 3) * Math.PI * 0.5) * this.hop;
      aL = aL * (1 - k) - 2.7 * k;
      aR = aR * (1 - k) - 2.7 * k;
      zL = -0.1 - 0.35 * k;
      zR = 0.1 + 0.35 * k;
      fL = fR = -0.1;
    }
    this.armL.rotation.set(aL, 0, zL);
    this.armR.rotation.set(aR, 0, zR);
    this.foreL.rotation.x = fL;
    this.foreR.rotation.x = fR;

    // head: idle glances, focused on the screen while working, down when asleep
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.lookT = 2.2 + ((Math.sin(this.seed * 13.1 + t) + 1) / 2) * 3.5;
      const r = Math.sin(this.seed * 7.7 + t * 1.3);
      this.lookYawTarget = s === "working" ? r * 0.12 : r * 0.55;
    }
    this.lookYaw = damp(this.lookYaw, still ? 0 : this.lookYawTarget, 2.5, dt);
    this.head.rotation.y = sleeping > 0.5 ? 0 : this.lookYaw;
    this.head.rotation.x = working ? 0.16 + Math.sin(tt * 2.1) * 0.03 : sleeping * 0.35;
    this.head.rotation.z = sleeping * 0.42 + (s === "idle" && !still ? Math.sin(tt * 0.7 + this.seed) * 0.03 : 0);

    // hop (done / cheer)
    if (this.hop > 0) {
      busy = true;
      this.hop = Math.max(0, this.hop - dt * 0.85);
      if (this.hop === 0) this.hopArms = 0;
      const ph = (1 - this.hop) * Math.PI * 2;
      this.body.position.y += Math.max(0, Math.sin(ph)) * 0.16 * this.hop;
    }

    // blinks / closed eyes
    this.blink -= dt;
    const closed = sleeping > 0.5 || (!still && this.blink < 0.11);
    if (this.blink < 0) this.blink = 2.4 + ((Math.sin(this.seed * 3 + t) + 1) / 2) * 3;
    for (const e of this.eyes) e.scale.y = closed ? 0.18 : 1.3;

    // HUD
    const ringT = s === "working" ? 1 : 0;
    const badgeT = s === "done" && !isLobby ? 1 : 0;
    const pr = this.ringK, pb = this.badgeK;
    this.ringK = damp(this.ringK, ringT, 6, dt);
    this.badgeK = damp(this.badgeK, badgeT, 5, dt);
    if (Math.abs(this.ringK - pr) > 1e-3 || Math.abs(this.badgeK - pb) > 1e-3) busy = true;
    const hy = this.headHeight();
    this.hud.position.set(this.pos.x, 0, this.pos.y);
    this.ring.visible = false && this.ringK > 0.01; // no head badges: state reads from the desk screen glow
    if (this.ring.visible) {
      const k = smooth(Math.min(1, this.ringK));
      this.ring.position.y = hy + 0.34 + (1 - k) * -0.08;
      this.ring.scale.setScalar(0.7 + 0.3 * k);
      this.ringMats[0]!.opacity = 0.22 * k;
      this.ringMats[1]!.opacity = 0.95 * k;
      this.ringMats[2]!.opacity = 0.92 * k;
      this.ringArc.rotation.z = -tt * 3.2;
      busy = true;
    }
    this.badge.visible = false && this.badgeK > 0.01;
    if (this.badge.visible) {
      const k = this.badgeK;
      const pop = k < 0.999 ? 1 + Math.sin(Math.min(1, k) * Math.PI) * 0.18 : 1;
      this.badge.position.y = hy + 0.32 + (still ? 0 : Math.sin(tt * 1.6 + this.seed) * 0.015);
      this.badge.scale.setScalar(Math.max(0.001, smooth(Math.min(1, k)) * pop));
      this.badgeMats[0]!.opacity = k;
      this.badgeMats[1]!.opacity = k;
      this.badgeMats[2]!.opacity = 0.9 * k;
    }
    return busy;
  }

  private turnTo(a: number, b: number, dt: number, k: number) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * (1 - Math.exp(-k * dt));
  }

  dispose() {
    for (const m of [...this.ringMats, ...this.badgeMats]) m.dispose();
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
