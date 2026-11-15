// WS-OFFICE · v7 art direction knob, shared by the office floor and the bedroom.
//
//   clean  v6 look: rounded furniture, smooth shading, high-res linear textures (kept for comparison)
//   pixel  low-res nearest-filtered textures (floors, walls, screens, posters, rugs, shadows), crisp square edges,
//          cel-banded characters; geometry stays smooth-shaded
//   voxel  pixel + chunky faceted geometry (flat shading, 6–8-sided cylinders, cube plants and foliage)
//
// The style is read when a model is built (textures and geometry are baked for it); it cannot change live.
// Default: "voxel" (picked after the side-by-side comparison in .notes/proto-v7/ws-office/).
export type OfficeStyle = "clean" | "pixel" | "voxel";
export const OFFICE_STYLES: readonly OfficeStyle[] = ["clean", "pixel", "voxel"];
export const DEFAULT_STYLE: OfficeStyle = "voxel";

let current: OfficeStyle = DEFAULT_STYLE;
export const style = () => current;
export const isPixel = () => current !== "clean";
export const isVoxel = () => current === "voxel";
export function setStyle(s: OfficeStyle) {
  current = s;
}

/** `?ostyle=clean|pixel|voxel` (dev / comparison only), else the explicit option, else the default. */
export function resolveStyle(opt?: OfficeStyle): OfficeStyle {
  const q = typeof location !== "undefined" ? new URLSearchParams(location.search).get("ostyle") : null;
  if (q && (OFFICE_STYLES as readonly string[]).includes(q)) return q as OfficeStyle;
  return opt ?? DEFAULT_STYLE;
}
