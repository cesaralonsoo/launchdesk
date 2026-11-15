// WS-OFFICE · rooms/c-kit.ts — small local helpers for designer C's themes (location, regulation, tech).
// Canvas textures here are flat illustrations (crisp vector shapes, no pixel posterising), cached by key.
import * as THREE from "three";
import { canvasTex } from "../textures";
import { fx, type Ctx, type P3 } from "./common";

export type G2 = CanvasRenderingContext2D;

/** Rounded rectangle path. */
export function rr(g: G2, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}
export function fillRR(g: G2, color: string, x: number, y: number, w: number, h: number, r: number) {
  g.fillStyle = color;
  rr(g, x, y, w, h, r);
  g.fill();
}
export function disc(g: G2, color: string, x: number, y: number, r: number) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}
export const FONT = (px: number, w = 800) => `${w} ${px}px "Inter Tight", "Inter", system-ui, -apple-system, sans-serif`;

/** A cached flat-illustration canvas texture (always high-res, linear filtered). */
export const cTex = (key: string, w: number, h: number, draw: (g: G2, w: number, h: number) => void) => canvasTex(`C:${key}`, w, h, draw);

/** Painted, non-glowing surface with a texture (wall maps, posters, paper). */
export const artMat = (c: Ctx, t: THREE.Texture, key = "c-art") => c.R.m("fixed", c.room, c.color, { map: t, rough: 0.85, key });

/** Alpha-tested painted decal material (floor markings, stickers). */
export function cutoutMat(c: Ctx, t: THREE.Texture, key: string) {
  const m = c.R.m("fixed", c.room, c.color, { map: t, rough: 0.9, key }) as THREE.MeshStandardMaterial;
  m.transparent = false;
  m.alphaTest = 0.5;
  return m;
}

/** Thin flat plate lying on a surface (paper sheets etc.). */
export function sheet(c: Ctx, parent: THREE.Object3D, w: number, d: number, pos: P3, rotY = 0, color = "#FBF8F2") {
  const m = c.B.box(w, 0.004, d, fx(c, color, 0.9), pos, 0, parent, false);
  m.rotation.y = rotY;
  return m;
}

/** Pyramid roof / cone with n sides (n = 4 → a square hip roof when rotated π/4). */
export function cone(c: Ctx, parent: THREE.Object3D, r: number, h: number, m: THREE.Material, pos: P3, n = 4) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, n), m);
  mesh.position.set(...pos);
  if (n === 4) mesh.rotation.y = Math.PI / 4;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** A gentle 0..1 ease used by small loops (stamp, pin bob). */
export const smooth = (x: number) => x * x * (3 - 2 * x);
