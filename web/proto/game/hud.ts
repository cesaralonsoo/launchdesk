// v8 seam stub (WP-0): the HUD (PLAN.md 5.4). Owned by WP-C. Renders nothing yet.
import type { WorldV7 } from "../contracts";
import type { ProtoFlowV7 } from "../flow";
import type { WorldV8 } from "../world/api-v8";

export interface HudDeps {
  world: WorldV7 & WorldV8;
  flow: ProtoFlowV7;
}
/** Mounts the HUD into `host` (the #hud slot of the UI root). Returns an unmount function. */
export function mountHud(host: HTMLElement, deps: HudDeps): () => void {
  void host;
  void deps;
  return () => {};
}
