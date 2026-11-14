// LaunchDesk office: the 3D isometric diorama of the eight departments (with a 2D fallback).
import "./office.css";
import { Office2D } from "./fallback2d";
import { Office3D } from "./scene";
import type { Office } from "./types";

export type { AgentState, ChipTone, DeptId, FocusOpts, Office, PinSpec, Rect } from "./types";
export { ROOMS, ROOM } from "./layout";
export type { RoomDef } from "./layout";

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Mounts the office inside `container` (which should have a size; the office fills it).
 * Picks the 3D diorama when WebGL is available, otherwise the 2D floor plan with the same API.
 * `?office=2d` in the page URL forces the fallback (handy for testing).
 */
export function createOffice(container: HTMLElement, opts: { mode?: "auto" | "3d" | "2d" } = {}): Office {
  let mode = opts.mode ?? "auto";
  if (mode === "auto") {
    const q = new URLSearchParams(location.search).get("office");
    mode = q === "2d" || q === "3d" ? q : "auto";
  }
  if (mode !== "2d" && (mode === "3d" || webglAvailable())) {
    try {
      return new Office3D(container);
    } catch (e) {
      console.warn("[office] WebGL failed, using the 2D floor plan", e);
      container.querySelector(".lo-root")?.remove();
    }
  }
  return new Office2D(container);
}
