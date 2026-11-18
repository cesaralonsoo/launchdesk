// v8 seam stub (WP-0): the home hero and scroll sections (PLAN.md 2-3). Owned by WP-A. Renders nothing yet.
import type { WorldV7 } from "../contracts";
import type { ProtoFlowV7 } from "../flow";
import type { WorldV8 } from "../world/api-v8";

export interface HomeDeps {
  world: WorldV7 & WorldV8;
  flow: ProtoFlowV7;
}
/** Mounts the home into `host` (the #home slot of the UI root). Returns an unmount function. */
export function mountHome(host: HTMLElement, deps: HomeDeps): () => void {
  void host;
  void deps;
  return () => {};
}
