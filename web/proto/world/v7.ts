// v7 (WS-WORLD): createWorld() now returns a WorldV7 directly (world/index.ts). This module stays only so code written
// against the tech-lead stub keeps compiling: asWorldV7(world) is a typed pass-through.
import type { World, WorldV7 } from "../contracts";

export function asWorldV7(w: World): WorldV7 {
  if (!("setWorldLevel" in w)) throw new Error("asWorldV7: createWorld() returns a WorldV7 since v7");
  return w as WorldV7;
}
