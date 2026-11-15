// WS-B · Level palette: one AtmospherePreset → every colour the tower/district/base need.
// Palettes are plain colour bags so the world can lerp two of them while the atmosphere animates.
import * as THREE from "three";
import type { AtmospherePreset } from "../../contracts";

export interface Palette {
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
  ground: THREE.Color; // base top = streets
  baseSide: THREE.Color;
  kerb: THREE.Color; // block / sidewalk surface
  paving: THREE.Color; // plaza stone
  grass: THREE.Color;
  tree: THREE.Color;
  treeAlt: THREE.Color;
  trunk: THREE.Color;
  water: THREE.Color;
  stone: THREE.Color; // light stone fins + slab bands
  stoneDark: THREE.Color;
  glass: THREE.Color; // facade glass (opaque floors)
  glassClear: THREE.Color; // office-floor glass (transparent)
  windowLit: THREE.Color; // interior warm light
  clay: THREE.Color; // planned (not yet built) buildings
  marking: THREE.Color; // lane dashes, crosswalks
  roof: THREE.Color;
  metal: THREE.Color;
  lamp: THREE.Color;
  money: THREE.Color;
  /** Scalars (lerped too). */
  lit: number; // 0..1 how much windows glow (night 1, golden .7, day .35)
  shadow: number; // ShadowMaterial opacity on the studio floor
  env: number; // envMap intensity on glass
  accent: number; // accentStrength
}

const C = (s: string) => new THREE.Color(s);
const mix = (a: string | THREE.Color, b: string | THREE.Color, k: number) => new THREE.Color(a as THREE.ColorRepresentation).lerp(new THREE.Color(b as THREE.ColorRepresentation), k);

/** Desaturate a colour towards its own luminance (mono theme). */
function desat(c: THREE.Color, amount: number): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, hsl.s * (1 - amount), hsl.l);
}

export function paletteFor(a: AtmospherePreset): Palette {
  const tod = a.timeOfDay;
  const night = tod === "night";
  const golden = tod === "golden";
  const acc = a.accentStrength ?? 0.8;
  const mono = 1 - Math.min(1, acc / 0.6); // 0 for colourful themes, ~0.75 for mono
  const [top, bottom = top] = a.sky;
  // golden light darkens and warms everything: lift the street colour so level 1 still floats on a light ground
  const ground = night ? mix(a.ground, "#2B3445", 0.35) : golden ? mix(a.ground, "#FFFFFF", 0.3) : C(a.ground);
  const wall = a.surfaces?.wall ?? "#F6F5F2";
  const slab = a.surfaces?.slab ?? "#D5DAE1";
  const glassTint = a.surfaces?.glass ?? "#DDEBFA";

  const g = (c: THREE.Color) => desat(c, mono);
  const grassBase = night ? C("#1C2620") : golden ? C("#CBD0A6") : C("#C5D3B4");
  const treeBase = night ? C("#1B2A20") : golden ? C("#8E9F6E") : C("#86A47A");
  const treeAlt = night ? C("#24301F") : golden ? C("#B8AA7E") : C("#A7BC86");

  return {
    skyTop: C(top),
    skyBottom: C(bottom),
    ground,
    baseSide: night ? mix(ground, "#000000", 0.25) : mix(ground, slab, 0.55).lerp(C("#5A6270"), 0.12),
    kerb: night ? mix(ground, "#4A5466", 0.5) : mix(ground, "#FFFFFF", 0.55),
    paving: night ? mix(ground, "#4A505C", 0.5) : mix(wall, ground, 0.35),
    grass: g(grassBase),
    tree: g(treeBase),
    treeAlt: g(treeAlt),
    trunk: night ? C("#2A2420") : C("#8A7360"),
    water: night ? C("#1B2B40") : golden ? mix("#A9BCC0", top, 0.3) : g(C("#A9C8D6")),
    stone: night ? mix(wall, "#8C8F96", 0.35) : mix(wall, "#EEE9E1", 0.35),
    stoneDark: night ? C("#3B4150") : mix(slab, "#B9B3AA", 0.3),
    glass: night ? C("#1A2232") : golden ? mix("#66727E", glassTint, 0.14) : g(mix("#5E7894", glassTint, 0.16)),
    glassClear: night ? C("#9DB7D8") : C(glassTint),
    windowLit: night ? C("#FFE6C8") : golden ? C("#FFE0BC") : C("#FFF3E4"),
    clay: night ? C("#4A5466") : golden ? C("#FBF6EE") : mix(wall, "#F1F2F4", 0.5),
    marking: night ? C("#5B6372") : C("#FFFFFF"),
    roof: night ? C("#262C38") : mix(slab, "#C9CDD3", 0.5),
    metal: night ? C("#4B5263") : C("#9AA3AE"),
    lamp: C("#FFD9A0"),
    money: C("#0AC18E"),
    lit: night ? 0.9 : golden ? 0.5 : 0.12,
    shadow: night ? 0.38 : golden ? 0.2 : 0.14,
    env: night ? 0.25 : 0.7,
    accent: acc,
  };
}

let KEYS: (keyof Palette)[] | null = null;
/** out = lerp(a, b, k) for every field. Allocation-free when `out` is given (after its first fill). */
export function lerpPalette(a: Palette, b: Palette, k: number, out?: Palette): Palette {
  const o = (out ?? ({} as Palette)) as unknown as Record<string, THREE.Color | number>;
  const keys = (KEYS ??= Object.keys(a) as (keyof Palette)[]);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    const va = a[key], vb = b[key];
    if (typeof va === "number") o[key] = va + ((vb as number) - va) * k;
    else {
      const cur = o[key];
      const c = cur instanceof THREE.Color ? cur : new THREE.Color();
      c.copy(va).lerp(vb as THREE.Color, k);
      o[key] = c;
    }
  }
  return o as unknown as Palette;
}
