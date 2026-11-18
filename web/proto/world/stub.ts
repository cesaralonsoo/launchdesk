// No-WebGL fallback: a world that draws nothing and answers every call harmlessly, so the flow and the UI still
// mount (the home, the example, a run and the tour keep working; the 3D slot shows a still instead, see main.ts).
import type { WorldV7 } from "../contracts";
import type { WorldV8 } from "./api-v8";

const PROMISE = /^(setLevel|setWorldLevel|focusActor|setProject|unlockWing|levelUp|setDistrictBuilt|celebrate|crossfade)$/;
const NULLISH = /(ScreenPoint|ghostLevel|screenToRoom)$/;
const LISTS = /^(labelPoints|portfolioScreenPoints)$/;

export function createStubWorld(): WorldV7 & WorldV8 {
  const noop = () => {};
  const fns = new Map<PropertyKey, unknown>();
  const props: Record<string, unknown> = { level: 1, worldLevel: 1, debug: undefined };
  return new Proxy({} as WorldV7 & WorldV8, {
    get(_t, k) {
      if (typeof k !== "string") return undefined;
      if (k in props) return props[k];
      if (k === "then") return undefined; // never look like a promise
      let f = fns.get(k);
      if (!f) {
        f = /^on[A-Z]/.test(k)
          ? () => noop
          : PROMISE.test(k)
            ? () => Promise.resolve()
            : NULLISH.test(k)
              ? () => null
              : LISTS.test(k)
                ? () => []
                : k === "renderedLevel"
                  ? () => 1
                  : k === "getClock"
                    ? () => ({ mode: "fixed", t: 0.5 })
                    : k === "clockMode"
                      ? () => "fixed"
                      : noop;
        fns.set(k, f);
      }
      return f;
    },
    set(_t, k, v) {
      // callers may wrap a method (the home wraps setInsets): keep what they set
      fns.set(k, v);
      return true;
    },
  });
}

/** True when this browser can give us a WebGL context at all. */
export function webglOk(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
