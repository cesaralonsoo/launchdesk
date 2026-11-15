// LaunchDesk office: the 3D isometric diorama of the eight departments (with a 2D fallback).
import "./office.css";
import { Office2D } from "./fallback2d";
import { Office3D } from "./scene";
import type { DeptId, LiveOffice, Office as OfficeCore } from "./types";

export type { AgentState, ChipTone, DeptId, FocusOpts, PinSpec, Rect } from "./types";
/** The office as the app sees it: the scene API plus coin()/coinFromRect() (spec-v4 L26). */
export type Office = LiveOffice;
export type { OfficeCore };
export { ROOMS, ROOM } from "./layout";
export type { RoomDef } from "./layout";
export { pulseLabels, ROLE_SHORT } from "./overlay";

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
  return withMoney(createCore(container, opts), container);
}

function createCore(container: HTMLElement, opts: { mode?: "auto" | "3d" | "2d" }): OfficeCore {
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

// ---------- coin (spec-v4 L26 / M7). Default implementation for both modes; WS2 may refine it in overlay.ts. ----------

const reducedMotion = () => {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};
const EASE_IN_OUT = "cubic-bezier(.65,0,.35,1)";

function coinEl(size: number, fixed: boolean): HTMLElement {
  const el = document.createElement("div");
  el.className = "lo-coin";
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position: fixed ? "fixed" : "absolute",
    left: "0", top: "0", width: `${size}px`, height: `${size}px`, margin: `${-size / 2}px 0 0 ${-size / 2}px`,
    borderRadius: "50%", background: "var(--bch, #0AC18E)", boxShadow: "0 0 0 1px #fff, 0 1px 3px rgba(0,0,0,.18)",
    pointerEvents: "none", zIndex: fixed ? "200" : "30", willChange: "transform, opacity",
  });
  return el;
}

function fly(el: HTMLElement, a: { x: number; y: number }, b: { x: number; y: number }, ms: number, arc: number, fade: boolean): Promise<void> {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - arc };
  const kf: Keyframe[] = fade
    ? [{ opacity: 0, transform: `translate(${b.x}px, ${b.y}px)` }, { opacity: 1, offset: 0.4 }, { opacity: 0, transform: `translate(${b.x}px, ${b.y}px)` }]
    : [
        { opacity: 0, transform: `translate(${a.x}px, ${a.y}px)` },
        { opacity: 1, offset: 0.1 },
        { transform: `translate(${mid.x}px, ${mid.y}px)`, offset: 0.5 },
        { opacity: 1, offset: 0.9 },
        { opacity: 0, transform: `translate(${b.x}px, ${b.y}px)` },
      ];
  return el
    .animate(kf, { duration: ms, easing: EASE_IN_OUT, fill: "forwards" })
    .finished.catch(() => undefined)
    .then(() => el.remove());
}

function withMoney(core: OfficeCore, container: HTMLElement): Office {
  const o = core as Office;
  if (typeof o.coin !== "function") {
    o.coin = (from: DeptId, to: DeptId) => {
      if (reducedMotion()) return Promise.resolve();
      const el = coinEl(10, false);
      container.appendChild(el);
      return fly(el, core.roomCenter(from), core.roomCenter(to), 700, 6, core.mode === "2d");
    };
  }
  if (typeof o.coinFromRect !== "function") {
    o.coinFromRect = (rect: DOMRect, to: DeptId) => {
      if (reducedMotion()) return Promise.resolve();
      const box = container.getBoundingClientRect();
      const c = core.roomCenter(to);
      const el = coinEl(28, true);
      document.body.appendChild(el);
      return fly(el, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, { x: box.left + c.x, y: box.top + c.y }, 520, 24, false);
    };
  }
  return o;
}
