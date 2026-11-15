// WS-OFFICE · rooms/regulation.ts — Regulation analyst ("what are the rules?").
// Concept: a cosy little law library / notary's office. Hero = big brass scales of justice on a marble plinth that
// gently weigh; walnut bookcases of law binders with a rolling ladder; a green-leather notary desk with a giant rubber
// stamp that thumps an APPROVED sheet, a banker's lamp; framed licences with wax seals and a filing cabinet.
import * as THREE from "three";
import { accent, accentSoft, C, decor, floorLamp, fx, lampMat, mergeStatic, plant, pool, researchDesk, shadowRect, shadowRound, wallBoard, type Ctx, type P3, type ThemeCtx, type ThemeFn } from "./common";
import { artMat, cTex, cutoutMat, disc, fillRR, FONT, smooth } from "./c-kit";

const WALNUT = "#8C5E3C", WALNUT_D = "#6E4529", BRASS = "#C9A15C", MARBLE = "#EEEBE5", LEATHER = "#3F6B4F", WAX = "#C2413B";

// ─────────────────────────────────────────────── textures

const CERT_TITLES = ["LICENSE", "PERMIT", "CERTIFIED"];
function certTex(i: number, color: string) {
  return cTex(`reg:cert:${i}:${color}`, 240, 300, (g, w, h) => {
    g.fillStyle = "#FBF6EA";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#C9A15C";
    g.lineWidth = 6;
    g.strokeRect(12, 12, w - 24, h - 24);
    g.lineWidth = 2;
    g.strokeRect(22, 22, w - 44, h - 44);
    g.font = `700 30px Georgia, "Times New Roman", serif`;
    g.fillStyle = "#3A3328";
    g.textAlign = "center";
    g.fillText(CERT_TITLES[i % 3]!, w / 2, 76);
    fillRR(g, color, w / 2 - 34, 92, 68, 5, 2);
    for (let k = 0; k < 5; k++) fillRR(g, "#CFC6B4", 46 + (k % 2) * 10, 124 + k * 20, w - 92 - (k % 2) * 20, 6, 3);
    // the seal is 3D; leave a soft ribbon under it
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(w / 2 - 22, h - 70);
    g.lineTo(w / 2 - 34, h - 30);
    g.lineTo(w / 2 - 20, h - 38);
    g.lineTo(w / 2 - 10, h - 26);
    g.lineTo(w / 2, h - 70);
    g.fill();
    g.beginPath();
    g.moveTo(w / 2 + 22, h - 70);
    g.lineTo(w / 2 + 34, h - 30);
    g.lineTo(w / 2 + 20, h - 38);
    g.lineTo(w / 2 + 10, h - 26);
    g.lineTo(w / 2, h - 70);
    g.fill();
  });
}

/** The approved sheet on the notary desk. */
function approvedTex(color: string) {
  return cTex(`reg:approved:${color}`, 256, 320, (g, w, h) => {
    g.fillStyle = "#FFFFFF";
    g.fillRect(0, 0, w, h);
    fillRR(g, "#3A3328", 26, 26, 120, 12, 4);
    for (let k = 0; k < 9; k++) fillRR(g, k % 4 === 3 ? color : "#D4CFC6", 26, 60 + k * 18, w - 52 - ((k * 37) % 70), 7, 3);
    g.save();
    g.translate(w / 2 + 10, h - 70);
    g.rotate(-0.22);
    g.strokeStyle = "#D8453F";
    g.lineWidth = 7;
    g.strokeRect(-92, -30, 184, 60);
    g.font = FONT(36, 900);
    g.fillStyle = "#D8453F";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("APPROVED", 0, 2);
    g.restore();
  });
}

/** A rules checklist on a clipboard. */
function checklistTex(color: string) {
  return cTex(`reg:check:${color}`, 200, 260, (g, w, h) => {
    g.fillStyle = "#FFFFFF";
    g.fillRect(0, 0, w, h);
    g.font = FONT(22, 900);
    g.fillStyle = "#2B3140";
    g.fillText("RULES", 22, 42);
    for (let k = 0; k < 6; k++) {
      const y = 70 + k * 30;
      g.lineWidth = 3;
      g.strokeStyle = "#8A909A";
      g.strokeRect(22, y, 18, 18);
      if (k < 4) {
        g.strokeStyle = k === 2 ? "#D8453F" : "#22A06B";
        g.lineWidth = 5;
        g.beginPath();
        if (k === 2) {
          g.moveTo(24, y + 2); g.lineTo(38, y + 16); g.moveTo(38, y + 2); g.lineTo(24, y + 16);
        } else {
          g.moveTo(24, y + 9); g.lineTo(30, y + 15); g.lineTo(40, y - 1);
        }
        g.stroke();
      }
      fillRR(g, k === 0 ? color : "#CFD3D9", 52, y + 6, 110 - ((k * 23) % 40), 7, 3);
    }
    disc(g, color, w - 32, h - 30, 12);
  });
}

/** A warm classic rug: burgundy field, cream border, a medallion in the dept colour. */
function persianTex(color: string) {
  return cTex(`reg:rug:${color}`, 512, 384, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    fillRR(g, "#8E3B36", 0, 0, w, h, 18);
    fillRR(g, "#EFE3CC", 16, 16, w - 32, h - 32, 12);
    fillRR(g, "#9C4540", 34, 34, w - 68, h - 68, 8);
    g.strokeStyle = "#D9A441";
    g.lineWidth = 4;
    g.strokeRect(48, 48, w - 96, h - 96);
    // border dots
    for (let x = 30; x < w - 20; x += 26) {
      disc(g, "#B5524B", x, 25, 5);
      disc(g, "#B5524B", x, h - 25, 5);
    }
    // medallion
    g.save();
    g.translate(w / 2, h / 2);
    for (const [r, col] of [[110, "#EFE3CC"], [92, color], [70, "#D9A441"], [50, "#8E3B36"], [26, "#EFE3CC"]] as const) {
      g.fillStyle = col;
      g.beginPath();
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const rr2 = k % 2 ? r * 0.78 : r;
        g.lineTo(Math.cos(a) * rr2 * 1.25, Math.sin(a) * rr2 * 0.9);
      }
      g.closePath();
      g.fill();
    }
    g.restore();
    for (const [x, y] of [[90, 90], [w - 90, 90], [90, h - 90], [w - 90, h - 90]] as const) {
      disc(g, "#D9A441", x, y, 16);
      disc(g, color, x, y, 8);
    }
    // fringe
    g.fillStyle = "#EFE3CC";
    for (let y = 8; y < h - 8; y += 10) {
      g.fillRect(0, y, 6, 4);
      g.fillRect(w - 6, y, 6, 4);
    }
  });
}

// ─────────────────────────────────────────────── pieces

/** Walnut bookcase full of ring binders (accent spines with white labels). Faces +Z. */
function binderCase(c: Ctx, parent: THREE.Object3D, pos: P3, w: number, h: number, seed: number) {
  const { B } = c;
  const g = B.sub(pos, 0, parent);
  shadowRect(c, w + 0.25, 0.6, [0, 0, 0], g, 0.3);
  const wood = fx(c, WALNUT, 0.55), dark = fx(c, WALNUT_D, 0.7);
  const dep = 0.36;
  B.box(w, 0.06, dep, wood, [0, h - 0.03, 0], 0.012, g);
  B.box(w, 0.08, dep, wood, [0, 0.04, 0], 0.012, g);
  for (const sx of [-1, 1]) B.box(0.05, h, dep, wood, [sx * (w / 2 - 0.025), h / 2, 0], 0.012, g);
  B.box(w - 0.06, h - 0.1, 0.02, dark, [0, h / 2, -dep / 2 + 0.01], 0, g);
  const rows = 3;
  const binders = [accent(c, 0.5), fx(c, "#F1EDE4", 0.7), fx(c, "#A8423C", 0.6), accentSoft(c), fx(c, "#D9A441", 0.6), fx(c, LEATHER, 0.6), fx(c, "#F1EDE4", 0.7)];
  const label = fx(c, "#FFFFFF", 0.6), ring = fx(c, "#E9E5DC", 0.5);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let r = 0; r < rows; r++) {
    const y = 0.08 + r * ((h - 0.14) / rows);
    if (r > 0) B.box(w - 0.08, 0.03, dep - 0.03, wood, [0, y, 0.01], 0, g);
    let x = -w / 2 + 0.07;
    let n = 0;
    const gap = Math.floor(rnd() * 6) + 3;
    while (x < w / 2 - 0.12) {
      if (n === gap) {
        // a lying stack, or a small brass bookend + space
        for (let k = 0; k < 3; k++) B.box(0.26, 0.05, 0.22, binders[(k + r) % binders.length]!, [x + 0.14, y + 0.04 + k * 0.05, 0.02], 0, g);
        x += 0.32;
        n++;
        continue;
      }
      const bw = 0.07 + rnd() * 0.02, bh = 0.24 + rnd() * 0.04;
      const m = binders[Math.floor(rnd() * binders.length)]!;
      B.box(bw, bh, 0.25, m, [x + bw / 2, y + 0.015 + bh / 2, 0.03], 0, g);
      B.box(bw * 0.62, 0.06, 0.004, label, [x + bw / 2, y + 0.015 + bh * 0.62, 0.157], 0, g, false);
      B.box(0.016, 0.016, 0.004, ring, [x + bw / 2, y + 0.015 + bh * 0.3, 0.157], 0, g, false);
      x += bw + 0.006;
      n++;
    }
  }
  return g;
}

/** Hero: scales of justice on a marble plinth. Returns the animated beam + pans for `update`. */
function scales(ctx: ThemeCtx, pos: P3) {
  const { c, group } = ctx;
  const { B } = c;
  const g = B.sub(pos, 0, group);
  g.scale.setScalar(1.45);
  const brass = fx(c, "#E0A93A", 0.28, 0.7), marble = fx(c, MARBLE, 0.35), velvet = fx(c, "#8E2F3A", 0.7);
  shadowRect(c, 0.65, 0.65, [0, 0, 0], g, 0.35);
  // plinth: a fluted marble column
  B.box(0.46, 0.08, 0.46, marble, [0, 0.04, 0], 0.02, g);
  B.box(0.38, 0.06, 0.38, marble, [0, 0.11, 0], 0.015, g);
  B.cyl(0.14, 0.15, 0.48, velvet, [0, 0.38, 0], 12, g);
  B.box(0.38, 0.06, 0.38, marble, [0, 0.65, 0], 0.015, g);
  B.box(0.44, 0.05, 0.44, marble, [0, 0.705, 0], 0.015, g);
  B.box(0.3, 0.012, 0.004, accent(c, 0.4), [0, 0.65, 0.192], 0, g, false);
  // the scale: base, post, finial
  const top = 0.73;
  B.cyl(0.13, 0.15, 0.04, brass, [0, top + 0.02, 0], 20, g);
  B.cyl(0.05, 0.07, 0.05, brass, [0, top + 0.06, 0], 16, g);
  B.cyl(0.018, 0.022, 0.62, brass, [0, top + 0.39, 0], 10, g);
  B.sphere(0.04, brass, [0, top + 0.72, 0], 14, g);
  const pivotY = top + 0.66;
  // animated beam (one merged mesh)
  const beamSrc = new THREE.Group();
  B.box(0.84, 0.03, 0.03, brass, [0, 0, 0], 0.012, beamSrc);
  B.sphere(0.026, brass, [-0.42, 0, 0], 10, beamSrc);
  B.sphere(0.026, brass, [0.42, 0, 0], 10, beamSrc);
  B.cyl(0.05, 0.05, 0.03, brass, [0, 0, 0], 16, beamSrc).rotation.x = Math.PI / 2;
  const beam = ctx.animate(mergeStatic(beamSrc, c.R));
  beam.position.set(0, pivotY, 0);
  g.add(beam);
  // two pans hanging from the beam ends (left: a rule book; right: gold weights)
  const pan = (load: "book" | "weights") => {
    const p = new THREE.Group();
    const L = 0.36;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5;
      const ch = B.cyl(0.004, 0.004, L, brass, [Math.cos(a) * 0.07, -L / 2, Math.sin(a) * 0.07], 4, p);
      ch.rotation.set(Math.sin(a) * 0.19, 0, -Math.cos(a) * 0.19);
    }
    B.cyl(0.15, 0.11, 0.035, brass, [0, -L - 0.01, 0], 22, p);
    if (load === "book") {
      B.box(0.15, 0.045, 0.11, accent(c, 0.5), [0, -L + 0.03, 0], 0.012, p);
      B.box(0.145, 0.035, 0.1, fx(c, "#FBF6EA", 0.8), [0.004, -L + 0.03, 0], 0.006, p);
    } else {
      B.cyl(0.035, 0.04, 0.05, brass, [-0.04, -L + 0.033, 0.01], 10, p);
      B.cyl(0.028, 0.032, 0.04, brass, [0.045, -L + 0.028, -0.01], 10, p);
      B.sphere(0.012, brass, [-0.04, -L + 0.065, 0.01], 8, p);
    }
    const out = ctx.animate(mergeStatic(p, c.R));
    g.add(out);
    return out;
  };
  const pl = pan("book"), pr = pan("weights");
  const set = (a: number) => {
    beam.rotation.z = a;
    pl.position.set(-0.42 * Math.cos(a), pivotY - 0.42 * Math.sin(a), 0);
    pr.position.set(0.42 * Math.cos(a), pivotY + 0.42 * Math.sin(a), 0);
  };
  set(0.06);
  return set;
}

/** Notary desk: green leather top, giant rubber stamp (animated), ink pad, paper stacks, banker's lamp. Faces +Z. */
function notaryDesk(ctx: ThemeCtx, pos: P3, rotY: number) {
  const { c, group } = ctx;
  const { B } = c;
  const g = B.sub(pos, rotY, group);
  const W = 1.36, D = 0.72, top = 0.72;
  const wood = fx(c, WALNUT, 0.5), dark = fx(c, WALNUT_D, 0.6);
  shadowRect(c, W + 0.35, D + 0.4, [0, 0, 0], g, 0.34);
  B.box(W, 0.05, D, wood, [0, top - 0.025, 0], 0.015, g);
  B.box(W - 0.12, 0.006, D - 0.14, fx(c, LEATHER, 0.7), [0, top + 0.002, 0], 0, g, false);
  // two pedestals of drawers with brass pulls + a modesty panel facing the room
  for (const sx of [-1, 1]) {
    B.box(0.38, top - 0.05, D - 0.06, wood, [sx * (W / 2 - 0.21), (top - 0.05) / 2, 0], 0.015, g);
    for (let k = 0; k < 3; k++) {
      B.box(0.32, 0.004, 0.004, dark, [sx * (W / 2 - 0.21), 0.2 + k * 0.17, (D - 0.06) / 2 + 0.002], 0, g, false);
      B.box(0.07, 0.016, 0.02, fx(c, BRASS, 0.3, 0.75), [sx * (W / 2 - 0.21), 0.12 + k * 0.17, (D - 0.06) / 2 + 0.01], 0.006, g);
    }
  }
  B.box(W - 0.8, top - 0.25, 0.03, dark, [0, top - 0.17, -D / 2 + 0.1], 0.01, g);
  // paperwork
  const paper = fx(c, "#FBF8F2", 0.9);
  for (let k = 0; k < 6; k++) B.box(0.24, 0.012, 0.31, paper, [-0.47, top + 0.01 + k * 0.013, -0.12], 0, g).rotation.y = ((k * 13) % 5 - 2) * 0.04;
  for (let k = 0; k < 3; k++) B.box(0.24, 0.012, 0.31, paper, [-0.2, top + 0.01 + k * 0.013, -0.18], 0, g).rotation.y = 0.1 - k * 0.05;
  // the approved sheet (decal on the leather)
  B.decal(0.25, 0.31, artMat(c, approvedTex(c.color), "reg-approved"), [0.12, top + 0.008, 0.08], g, 0.12);
  // ink pad
  B.box(0.16, 0.025, 0.11, fx(c, C.metal, 0.4, 0.3), [0.38, top + 0.0125, 0.16], 0.008, g);
  B.box(0.13, 0.004, 0.08, fx(c, "#D8453F", 0.6), [0.38, top + 0.027, 0.16], 0, g, false);
  // banker's lamp: brass stand + green glass shade + warm bulb
  const lamp = B.sub([0.48, top, -0.2], 0, g);
  B.box(0.18, 0.025, 0.11, fx(c, BRASS, 0.3, 0.75), [0, 0.012, 0], 0.01, lamp);
  B.cyl(0.012, 0.012, 0.3, fx(c, BRASS, 0.3, 0.75), [0, 0.17, -0.02], 8, lamp);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.26, c.B.q === "high" ? 20 : 12, 1, false, 0, Math.PI), fx(c, "#2F7A55", 0.25));
  shade.rotation.set(0, 0, Math.PI / 2);
  shade.position.set(0, 0.31, 0.02);
  shade.castShadow = true;
  lamp.add(shade);
  B.box(0.22, 0.02, 0.08, lampMat(c), [0, 0.3, 0.02], 0.008, lamp);
  pool(c, 0.5, [0, 0, 0.12], lamp, 0.4);
  // the giant rubber stamp (animated): wooden handle with a dept-colour knob on a red rubber foot
  const st = new THREE.Group();
  B.box(0.15, 0.035, 0.11, fx(c, WALNUT_D, 0.6), [0, 0.035, 0], 0.01, st);
  B.box(0.14, 0.016, 0.1, fx(c, "#D8453F", 0.6), [0, 0.008, 0], 0.004, st);
  B.cyl(0.026, 0.04, 0.12, fx(c, WALNUT, 0.5), [0, 0.11, 0], 12, st);
  B.sphere(0.06, accent(c, 0.4), [0, 0.2, 0], 18, st);
  st.scale.setScalar(1.45);
  const wrap = new THREE.Group();
  wrap.add(st);
  const stamp = ctx.animate(mergeStatic(wrap, c.R));
  const base = new THREE.Vector3(0.14, top + 0.008, 0.07);
  stamp.position.copy(base);
  g.add(stamp);
  return (t: number) => {
    // rest beside the sheet, lift, hover, thump down, lift back (period 4.2 s)
    const p = (t % 4.2) / 4.2;
    let lift = 0;
    if (p < 0.2) lift = smooth(p / 0.2) * 0.14;
    else if (p < 0.34) lift = 0.14;
    else if (p < 0.38) lift = 0.14 * (1 - (p - 0.34) / 0.04);
    else if (p < 0.5) lift = 0;
    else if (p < 0.62) lift = smooth((p - 0.5) / 0.12) * 0.05;
    else lift = 0.05 * (1 - smooth(Math.min(1, (p - 0.62) / 0.2)));
    stamp.position.y = base.y + lift;
    const squash = p >= 0.38 && p < 0.44 ? 0.88 : 1;
    stamp.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
  };
}

/** Filing cabinet with the top drawer open (folders). Faces +Z. */
function filingCabinet(c: Ctx, parent: THREE.Object3D, pos: P3, rotY: number) {
  const { B } = c;
  const g = B.sub(pos, rotY, parent);
  shadowRect(c, 0.7, 0.75, [0, 0, 0], g, 0.3);
  const body = fx(c, "#CBD0D6", 0.4, 0.3);
  B.box(0.46, 0.92, 0.55, body, [0, 0.46, 0], 0.018, g);
  for (let k = 0; k < 2; k++) {
    B.box(0.4, 0.26, 0.012, fx(c, "#BCC2C9", 0.4, 0.3), [0, 0.18 + k * 0.29, 0.28], 0.006, g);
    B.box(0.12, 0.022, 0.025, fx(c, C.steel, 0.3, 0.7), [0, 0.25 + k * 0.29, 0.29], 0.008, g);
  }
  // open drawer
  B.box(0.4, 0.22, 0.32, body, [0, 0.76, 0.42], 0.01, g);
  B.box(0.12, 0.022, 0.025, fx(c, C.steel, 0.3, 0.7), [0, 0.82, 0.59], 0.008, g);
  const tabs = [accent(c, 0.5), fx(c, "#F2C04A", 0.6), accentSoft(c), fx(c, "#E9DFC9", 0.7), accent(c, 0.5)];
  for (let k = 0; k < 5; k++) {
    B.box(0.34, 0.2, 0.012, fx(c, "#E9DFC9", 0.8), [0, 0.85, 0.3 + k * 0.052], 0, g);
    B.box(0.08, 0.04, 0.013, tabs[k]!, [-0.12 + (k % 3) * 0.12, 0.96, 0.3 + k * 0.052], 0, g);
  }
  return g;
}

// ─────────────────────────────────────────────── the room

export const regulation: ThemeFn = (ctx) => {
  const { c, group: g } = ctx;
  const { B } = c;
  researchDesk(ctx, { screen: 0 });
  if (ctx.compact) {
    wallBoard(ctx, "rules");
    // one small prop: a stack of binders on the floor next to the desk
    const s = B.sub([ctx.desk.x + 1.05, 0, -2.08], 0.2, g);
    shadowRect(c, 0.45, 0.4, [0, 0, 0], s, 0.3);
    for (let k = 0; k < 4; k++) B.box(0.3, 0.07, 0.25, k % 2 ? accentSoft(c) : accent(c, 0.5), [0, 0.035 + k * 0.07, 0], 0.01, s).rotation.y = (k % 2) * 0.15;
    return decor(ctx);
  }

  // back wall: two walnut bookcases of law binders + a rolling library ladder on a brass rail
  binderCase(c, g, [0.17, 0, -2.16], 1.2, 1.16, 11);
  binderCase(c, g, [1.39, 0, -2.16], 1.2, 1.16, 29);
  B.box(2.44, 0.02, 0.02, fx(c, BRASS, 0.3, 0.75), [0.78, 1.08, -1.96], 0.008, g);
  const lad = B.sub([0.86, 0, -1.84], 0, g);
  lad.rotation.x = -0.14;
  for (const sx of [-1, 1]) B.box(0.035, 1.12, 0.035, fx(c, WALNUT_D, 0.6), [sx * 0.17, 0.56, 0], 0.01, lad);
  for (let k = 0; k < 5; k++) B.box(0.34, 0.025, 0.06, fx(c, WALNUT, 0.55), [0, 0.18 + k * 0.21, 0], 0.008, lad);
  for (const sx of [-1, 1]) B.cyl(0.025, 0.025, 0.02, fx(c, C.metal, 0.4, 0.3), [sx * 0.17, 0.025, 0], 10, lad).rotation.z = Math.PI / 2;

  // hero: the scales on their plinth (right, mid-depth) — they weigh gently
  const weigh = scales(ctx, [2.1, 0, -1.3]);
  // a burgundy panel with a brass frame behind the scales so the hero pops off the wall
  B.box(1.04, 1.1, 0.03, fx(c, "#B9925A", 0.35, 0.5), [2.38, 0.62, -2.35], 0.01, g);
  B.box(0.94, 1.0, 0.035, fx(c, "#7E2C36", 0.8), [2.38, 0.62, -2.345], 0.01, g);
  // a velvet rope in front of the scales (two brass stanchions)
  const rope = fx(c, "#A8423C", 0.6);
  for (const [x, z] of [[1.6, -0.45], [2.7, -0.2]] as const) {
    shadowRound(c, 0.14, [x, 0, z], g, 0.3);
    B.cyl(0.1, 0.12, 0.04, fx(c, BRASS, 0.3, 0.75), [x, 0.02, z], 16, g);
    B.cyl(0.02, 0.02, 0.78, fx(c, BRASS, 0.3, 0.75), [x, 0.43, z], 8, g);
    B.sphere(0.04, fx(c, BRASS, 0.3, 0.75), [x, 0.84, z], 12, g);
  }
  {
    const dx = 1.1, dz = 0.25, L = Math.hypot(dx, dz);
    const rs = B.sub([2.15, 0.8, -0.325], -Math.atan2(dz, dx), g);
    const r = B.torus(L / 2, 0.022, rope, [0, 0, 0], Math.PI, rs);
    r.rotation.x = Math.PI;
    r.scale.set(1, 0.32, 1);
  }

  // the notary desk on a classic rug
  B.decal(2.3, 1.72, cutoutMat(c, persianTex(c.color), "reg-rug"), [1.0, 0.004, 0.62], g).receiveShadow = true;
  const thump = notaryDesk(ctx, [0.95, 0, 0.45], 0);
  // a visitor's chair in front of it (towards the camera, low)
  const vc = B.sub([1.0, 0, 1.25], Math.PI, g);
  shadowRound(c, 0.3, [0, 0, 0], vc, 0.28);
  B.box(0.46, 0.08, 0.44, fx(c, LEATHER, 0.7), [0, 0.44, 0], 0.03, vc);
  B.box(0.46, 0.34, 0.07, fx(c, LEATHER, 0.7), [0, 0.64, -0.2], 0.03, vc);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) B.cyl(0.02, 0.016, 0.42, fx(c, WALNUT_D, 0.6), [x * 0.19, 0.2, z * 0.18], 8, vc);

  // left wall: three framed licences with wax seals + a clipboard checklist; filing cabinet; palm
  for (let i = 0; i < 3; i++) {
    const z = -0.55 + i * 0.62;
    const fr = B.sub([-2.9, 0.84 + (i === 1 ? 0.04 : 0), z], Math.PI / 2, g);
    B.box(0.42, 0.52, 0.035, fx(c, i === 1 ? WALNUT_D : BRASS, i === 1 ? 0.5 : 0.35, i === 1 ? 0 : 0.6), [0, 0, 0], 0.01, fr);
    B.plane(0.36, 0.45, artMat(c, certTex(i, c.color), "reg-cert" + i), [0, 0, 0.0185], fr);
    B.cyl(0.042, 0.042, 0.016, fx(c, WAX, 0.45), [0, -0.12, 0.026], 12, fr).rotation.x = Math.PI / 2;
  }
  const cb = B.sub([-2.9, 0.78, 1.45], Math.PI / 2, g);
  B.box(0.3, 0.4, 0.02, fx(c, "#B98552", 0.6), [0, 0, 0], 0.012, cb);
  B.plane(0.25, 0.33, artMat(c, checklistTex(c.color), "reg-check"), [0, -0.02, 0.011], cb);
  B.box(0.12, 0.04, 0.02, fx(c, C.steel, 0.3, 0.7), [0, 0.18, 0.015], 0.006, cb);
  filingCabinet(c, g, [-2.6, 0, -1.25], Math.PI / 2);
  // a stack of binders and a document box on the floor by the wall
  const st = B.sub([-2.6, 0, 0.55], 0.3, g);
  shadowRect(c, 0.5, 0.45, [0, 0, 0], st, 0.3);
  B.box(0.36, 0.26, 0.3, fx(c, "#D9C7A6", 0.85), [0, 0.13, 0], 0.012, st);
  B.box(0.38, 0.04, 0.32, fx(c, "#CDB894", 0.85), [0, 0.27, 0], 0.012, st);
  for (let k = 0; k < 3; k++) B.box(0.28, 0.06, 0.22, k === 1 ? accentSoft(c) : accent(c, 0.5), [0.02, 0.32 + k * 0.06, 0], 0.01, st).rotation.y = (k - 1) * 0.12;
  floorLamp(c, g, [-2.62, 0, 2.0]);
  plant(c, g, [2.6, 0, 1.95], "palm", BRASS);

  return decor(ctx, {
    update(_dt, t) {
      weigh(0.07 * Math.sin(t * 0.8) + 0.02 * Math.sin(t * 2.3));
      thump(t);
    },
  });
};
