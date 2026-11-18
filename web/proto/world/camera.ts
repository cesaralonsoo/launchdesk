// WS-B · Camera rig: fixed-orientation perspective shots, exact framing inside the free area (insets),
// buttery interpolation between shots (log-distance, eased), idle drift + pointer parallax.
import * as THREE from "three";
import type { Insets } from "../contracts";

export const FOV = 24; // narrow perspective: reads as a miniature, still allows a true pull-back to the district
export const YAW = THREE.MathUtils.degToRad(34);
export const PITCH = THREE.MathUtils.degToRad(40);
const D2R = THREE.MathUtils.degToRad;

/** A camera pose: look at `target` from `dist` along (yaw, pitch). */
export type Shot = { target: THREE.Vector3; dist: number; yaw: number; pitch: number };

export const cloneShot = (s: Shot): Shot => ({ target: s.target.clone(), dist: s.dist, yaw: s.yaw, pitch: s.pitch });

/** Unit vector from target towards the camera. */
export function dirVector(yaw = YAW, pitch = PITCH, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
}

const _up = new THREE.Vector3(0, 1, 0);
const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3(), _p = new THREE.Vector3();

export function boxCorners(box: THREE.Box3): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) out.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
  return out;
}

/** Free rect in NDC after insets and a breathing margin. */
function freeRect(w: number, h: number, ins: Insets, pad: number) {
  const fw = Math.max(120, w - ins.left - ins.right);
  const fh = Math.max(120, h - ins.top - ins.bottom);
  const p = Math.min(pad * Math.min(fw, fh), 72);
  const l = ins.left + p, r = ins.left + fw - p, t = ins.top + p, b = ins.top + fh - p;
  return { x0: (l / w) * 2 - 1, x1: (r / w) * 2 - 1, y0: 1 - (b / h) * 2, y1: 1 - (t / h) * 2 };
}

/**
 * Exact fit: finds target + distance so that all 8 corners of `box` project inside the free area
 * (canvas minus insets minus padding), with the box centred in that area. Fixed yaw/pitch.
 */
export function fitShot(box: THREE.Box3 | THREE.Vector3[], yaw: number, pitch: number, w: number, h: number, ins: Insets, pad = 0.07): Shot {
  const corners: THREE.Vector3[] = Array.isArray(box) ? box : boxCorners(box);
  const bb = Array.isArray(box) ? new THREE.Box3().setFromPoints(box) : box;
  dirVector(yaw, pitch, _d);
  _r.crossVectors(_up, _d).normalize();
  _u.crossVectors(_d, _r).normalize();
  const tanV = Math.tan(D2R(FOV) / 2);
  const tanH = tanV * (w / h);
  const fr = freeRect(w, h, ins, pad);
  const cx = (fr.x0 + fr.x1) / 2, cy = (fr.y0 + fr.y1) / 2, sw = fr.x1 - fr.x0, sh = fr.y1 - fr.y0;
  const target = bb.getCenter(new THREE.Vector3());
  let dist = (bb.getSize(_v).length() / 2 / Math.sin(D2R(FOV) / 2)) * 0.9;
  for (let it = 0; it < 14; it++) {
    _p.copy(target).addScaledVector(_d, dist);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of corners) {
      _v.subVectors(c, _p);
      const z = Math.max(0.01, -_v.dot(_d));
      const nx = _v.dot(_r) / (z * tanH), ny = _v.dot(_u) / (z * tanV);
      x0 = Math.min(x0, nx); x1 = Math.max(x1, nx); y0 = Math.min(y0, ny); y1 = Math.max(y1, ny);
    }
    const s = Math.max((x1 - x0) / sw, (y1 - y0) / sh);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    target.addScaledVector(_r, (mx - cx) * dist * tanH).addScaledVector(_u, (my - cy) * dist * tanV);
    const nd = dist * (0.35 + 0.65 * s);
    if (Math.abs(nd - dist) < 1e-3 && Math.abs(mx - cx) < 1e-3 && Math.abs(my - cy) < 1e-3) break;
    dist = nd;
  }
  return { target, dist, yaw, pitch };
}

/** Interpolate two shots at eased k. Distance in log space (constant-feel zoom); `arc` adds a gentle mid-move pull-out. */
export function lerpShot(a: Shot, b: Shot, k: number, out: Shot, arc = 0): Shot {
  out.target.lerpVectors(a.target, b.target, k);
  out.dist = Math.exp(Math.log(a.dist) + (Math.log(b.dist) - Math.log(a.dist)) * k) * (1 + arc * Math.sin(Math.PI * k));
  out.yaw = a.yaw + (b.yaw - a.yaw) * k;
  out.pitch = a.pitch + (b.pitch - a.pitch) * k;
  return out;
}

/** Writes the shot (plus drift offsets in radians) into the camera. */
export function applyShot(cam: THREE.PerspectiveCamera, s: Shot, dYaw = 0, dPitch = 0) {
  dirVector(s.yaw + dYaw, s.pitch + dPitch, _d);
  cam.position.copy(s.target).addScaledVector(_d, s.dist);
  cam.near = Math.max(0.3, s.dist * 0.06);
  cam.far = s.dist * 6 + 600;
  cam.lookAt(s.target);
  cam.updateProjectionMatrix();
}

/** Ease in-out (cubic) for room moves; quint-ish "expo" ease for long level moves (slow start, long glide). */
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeLevel = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2) * 0.35 + easeInOut(t) * 0.65;

/** Pull-back ease: starts moving at once (no dead first second), lands softly. Used for outward level moves. */
export const easeOutward = (t: number) => 0.5 * (1 - Math.pow(1 - t, 3)) + 0.5 * easeInOut(t);

/** Per-level orientation (degrees). Portrait screens look along the short side a bit more. */
export function levelAngles(level: 0 | 1 | 2 | 3, aspect: number): { yaw: number; pitch: number } {
  const portrait = aspect < 0.85;
  // v7 level 0: the founder's room as a cut-away diorama, a touch lower so the walls and the desk read
  if (level === 0) return { yaw: D2R(portrait ? 40 : 36), pitch: D2R(portrait ? 40 : 33) };
  // v8: one camera family (yaw 30–38°, FOV 24) so every level reads as "the same office, bigger"
  if (level === 1) return { yaw: D2R(portrait ? 56 : 34), pitch: D2R(portrait ? 46 : 40) };
  if (level === 2) return { yaw: D2R(portrait ? 44 : 34), pitch: D2R(portrait ? 50 : 34) };
  return { yaw: D2R(portrait ? 44 : 36), pitch: D2R(portrait ? 46 : 38) };
}

/** Room shots: a touch lower than the overview and turned slightly towards the room (parallax on room changes). */
export function roomAngles(cx: number, aspect: number): { yaw: number; pitch: number } {
  const base = levelAngles(1, aspect);
  // phones look down more steeply so the room fills the portrait frame instead of a sliver of the floor plate
  return { yaw: base.yaw + D2R(THREE.MathUtils.clamp(cx / 12, -1, 1) * 4), pitch: D2R(aspect < 0.85 ? 54 : 37) };
}

/** Damped pointer parallax + slow idle breathing, in radians. */
export class Drift {
  private tx = 0;
  private ty = 0;
  private x = 0;
  private y = 0;
  enabled = true;
  pointer(nx: number, ny: number) {
    this.tx = THREE.MathUtils.clamp(nx, -1, 1);
    this.ty = THREE.MathUtils.clamp(ny, -1, 1);
  }
  /** Returns [dYaw, dPitch]. */
  step(dt: number, t: number): [number, number] {
    if (!this.enabled) return [0, 0];
    const k = 1 - Math.exp(-dt * 2.2);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    const yaw = D2R(this.x * 1.4 + Math.sin(t * 0.11) * 0.55);
    const pitch = D2R(-this.y * 0.9 + Math.sin(t * 0.077 + 1.3) * 0.35);
    return [yaw, pitch];
  }
}
