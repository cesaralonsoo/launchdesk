// WS-A1 · Day cycle: keyframed atmosphere over a 0..1 day (0 = midnight, 0.5 = noon), sun + moon arcs,
// and an allocation-free interpolator that writes into one mutable DayState every frame.
//
//   night 0.00 → pre-dawn 0.17 → first light 0.235 → dawn 0.275 → morning 0.40 → day 0.50 → afternoon 0.64
//   → golden 0.72 → sunset 0.775 → dusk 0.82 → blue hour 0.88 → night 1.00
//
// Colours are authored as sRGB hex and interpolated as THREE.Color (linear working space).
import * as THREE from "three";
import type { AtmospherePreset, ClockMode, DayClockInfo, DayPhaseName } from "../contracts";
import { lerpPalette, paletteFor, type Palette } from "./levels/palette";

type Hex = string;
interface Key {
  t: number;
  skyTop: Hex;
  skyBottom: Hex;
  /** Horizon glow (CSS radial behind the scene) colour + strength. */
  glow: Hex;
  glowK: number;
  fog: Hex;
  fogNear: number;
  fogFar: number;
  sun: Hex;
  /** Key light intensity when the sun drives it. */
  sunI: number;
  moonI: number;
  ambSky: Hex;
  ambGround: Hex;
  ambI: number;
  ground: Hex;
  exposure: number;
  /** Interior lamps + lit windows 0..1. */
  lights: number;
  stars: number;
  daylight: number;
  warmth: number;
}

// prettier-ignore
const KEYS: Key[] = [
  { t: 0.0,   skyTop: "#060A13", skyBottom: "#141C2E", glow: "#27324D", glowK: 0.22, fog: "#121A2A", fogNear: 60, fogFar: 230, sun: "#9FB4D9", sunI: 0,   moonI: 0.8,  ambSky: "#4A5D86", ambGround: "#10141C", ambI: 0.7,  ground: "#212A3D", exposure: 1.06, lights: 1,    stars: 1,    daylight: 0,    warmth: 0 },
  { t: 0.17,  skyTop: "#0A1020", skyBottom: "#1F2840", glow: "#33405F", glowK: 0.28, fog: "#1A2338", fogNear: 60, fogFar: 230, sun: "#9FB4D9", sunI: 0,   moonI: 0.7,  ambSky: "#4E618A", ambGround: "#12161F", ambI: 0.76, ground: "#1C2334", exposure: 1.06, lights: 0.92, stars: 0.85, daylight: 0.02, warmth: 0.05 },
  { t: 0.235, skyTop: "#4A5280", skyBottom: "#EBB3A6", glow: "#FFB896", glowK: 0.7,  fog: "#D2A6A4", fogNear: 60, fogFar: 230, sun: "#FFBFA0", sunI: 1.4, moonI: 0,    ambSky: "#AEB4D8", ambGround: "#6A5C66", ambI: 0.78, ground: "#C8C0C8", exposure: 1.1, lights: 0.6,  stars: 0.12, daylight: 0.38, warmth: 0.85 },
  { t: 0.275, skyTop: "#B3C3E0", skyBottom: "#F8DCCF", glow: "#FFD2B8", glowK: 0.55, fog: "#F0DAD1", fogNear: 60, fogFar: 230, sun: "#FFD9BE", sunI: 2.8, moonI: 0,    ambSky: "#E4E8F8", ambGround: "#A8999A", ambI: 0.84, ground: "#E6E1E2", exposure: 1.1, lights: 0.22, stars: 0,    daylight: 0.72, warmth: 0.55 },
  { t: 0.4,   skyTop: "#E4ECF6", skyBottom: "#DCE3EC", glow: "#FFFFFF", glowK: 0.42, fog: "#DFE5ED", fogNear: 60, fogFar: 220, sun: "#FFF4E6", sunI: 3.5, moonI: 0,    ambSky: "#E3EBFF", ambGround: "#A8A196", ambI: 0.58, ground: "#E3E7ED", exposure: 1.0, lights: 0,    stars: 0,    daylight: 1,    warmth: 0.08 },
  { t: 0.5,   skyTop: "#E6EDF6", skyBottom: "#DFE5EC", glow: "#FFFFFF", glowK: 0.45, fog: "#E0E6ED", fogNear: 60, fogFar: 220, sun: "#FFF2E2", sunI: 3.6, moonI: 0,    ambSky: "#E2EAFF", ambGround: "#A9A296", ambI: 0.56, ground: "#E4E8EE", exposure: 1.0, lights: 0,    stars: 0,    daylight: 1,    warmth: 0 },
  { t: 0.64,  skyTop: "#EEEDEE", skyBottom: "#EADFD0", glow: "#FFEBCF", glowK: 0.5,  fog: "#E8E0D4", fogNear: 64, fogFar: 235, sun: "#FFE2BC", sunI: 3.5, moonI: 0,    ambSky: "#E8E9F6", ambGround: "#A99886", ambI: 0.58, ground: "#E9E3DA", exposure: 1.04, lights: 0.08, stars: 0,    daylight: 1,    warmth: 0.3 },
  { t: 0.72,  skyTop: "#F3E6DA", skyBottom: "#F2CFA4", glow: "#FFB873", glowK: 0.78, fog: "#EFD9C0", fogNear: 70, fogFar: 260, sun: "#FFBE7E", sunI: 3.9, moonI: 0,    ambSky: "#DCDDF0", ambGround: "#9A8270", ambI: 0.52, ground: "#F0E2CF", exposure: 1.1, lights: 0.45, stars: 0,    daylight: 0.88, warmth: 1 },
  { t: 0.775, skyTop: "#9C98B8", skyBottom: "#F3B48E", glow: "#FF9D66", glowK: 0.85, fog: "#E4B092", fogNear: 66, fogFar: 245, sun: "#FFA676", sunI: 2.0, moonI: 0,    ambSky: "#D6C6DC", ambGround: "#6E5660", ambI: 0.66, ground: "#D3C6C3", exposure: 1.1, lights: 0.78, stars: 0,    daylight: 0.55, warmth: 0.95 },
  { t: 0.82,  skyTop: "#3A3C6A", skyBottom: "#D8897A", glow: "#F08A62", glowK: 0.62, fog: "#8F6B7C", fogNear: 60, fogFar: 235, sun: "#FF8A5C", sunI: 0.2, moonI: 0.25, ambSky: "#7F7FAE", ambGround: "#2E2633", ambI: 0.6,  ground: "#5E5868", exposure: 1.05, lights: 0.96, stars: 0.25, daylight: 0.24, warmth: 0.6 },
  { t: 0.88,  skyTop: "#121A33", skyBottom: "#38426A", glow: "#5A5F8E", glowK: 0.32, fog: "#2C3452", fogNear: 60, fogFar: 230, sun: "#9FB4D9", sunI: 0,   moonI: 0.65, ambSky: "#4E5F8A", ambGround: "#12151E", ambI: 0.76, ground: "#1E2638", exposure: 1.06, lights: 1,    stars: 0.7,  daylight: 0.06, warmth: 0.15 },
  { t: 1.0,   skyTop: "#060A13", skyBottom: "#141C2E", glow: "#27324D", glowK: 0.22, fog: "#121A2A", fogNear: 60, fogFar: 230, sun: "#9FB4D9", sunI: 0,   moonI: 0.8,  ambSky: "#4A5D86", ambGround: "#10141C", ambI: 0.7,  ground: "#212A3D", exposure: 1.06, lights: 1,    stars: 1,    daylight: 0,    warmth: 0 },
];

/** Sun: rises at 0.23, sets at 0.80, culminates 60°. Azimuth sweeps from back-right (132°) to front-right (70°): never through the camera azimuth (34°), so shadows always read. */
export const SUN_RISE = 0.23, SUN_SET = 0.8, SUN_MAX_EL = 60;
const SUN_AZ0 = 132, SUN_AZ1 = 70;
/** Moon: from the front-left like the Midnight theme (−30°, 50°). */
const MOON_AZ = -32, MOON_EL = 48;

const D2R = Math.PI / 180;
const smooth = (x: number) => x * x * (3 - 2 * x);
const wrap = (t: number) => ((t % 1) + 1) % 1;

/** Everything the world needs for one instant. Mutated in place (allocation-free). */
export interface DayState {
  t: number;
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
  glow: THREE.Color;
  glowK: number;
  fog: THREE.Color;
  fogNear: number;
  fogFar: number;
  keyColor: THREE.Color;
  keyI: number;
  /** Unit vector towards the key light (sun by day, moon by night). */
  keyDir: THREE.Vector3;
  /** Sun elevation in degrees (negative below the horizon) and azimuth. */
  sunEl: number;
  sunAz: number;
  ambSky: THREE.Color;
  ambGround: THREE.Color;
  ambI: number;
  ground: THREE.Color;
  exposure: number;
  lights: number;
  stars: number;
  daylight: number;
  warmth: number;
  /** 1 - daylight, for moonlight fill. */
  night: number;
  palette: Palette;
}

type KeyC = Key & { c: Record<"skyTop" | "skyBottom" | "glow" | "fog" | "sun" | "ambSky" | "ambGround" | "ground", THREE.Color>; pal: Palette };

/** Anchor presets for the level palettes (stone, glass, trees, lit windows…). Keyframes blend them by daylight/warmth. */
const ANCHOR_DAY: AtmospherePreset = {
  timeOfDay: "studio", sky: ["#F4F6F9", "#E3E7ED"], fog: null, key: { color: "#FFF4E6", intensity: 3.1, azimuth: 120, elevation: 50, shadows: true },
  ambient: { sky: "#F4F6FF", ground: "#B8B0A6", intensity: 0.72 }, ground: "#E6E9EE", exposure: 1.02,
  surfaces: { wall: "#FAFAFB", slab: "#D5DAE1", glass: "#DDEBFA" }, accentStrength: 0.85,
};
const ANCHOR_GOLD: AtmospherePreset = {
  ...ANCHOR_DAY, timeOfDay: "golden", sky: ["#F7F1E8", "#EADFCC"], ground: "#ECE7DF", surfaces: { wall: "#FBFAF8", slab: "#C9C3BA", glass: "#E8EEF2" },
};
const ANCHOR_NIGHT: AtmospherePreset = {
  ...ANCHOR_DAY, timeOfDay: "night", sky: ["#0A0E16", "#141B27"], ground: "#10141C", surfaces: { wall: "#E7E3DC", slab: "#1A202B", glass: "#9DB7D8" },
};

export function createDayCycle() {
  const pDay = paletteFor(ANCHOR_DAY), pGold = paletteFor(ANCHOR_GOLD), pNight = paletteFor(ANCHOR_NIGHT);
  const keys: KeyC[] = KEYS.map((k) => {
    const c = {
      skyTop: new THREE.Color(k.skyTop), skyBottom: new THREE.Color(k.skyBottom), glow: new THREE.Color(k.glow), fog: new THREE.Color(k.fog),
      sun: new THREE.Color(k.sun), ambSky: new THREE.Color(k.ambSky), ambGround: new THREE.Color(k.ambGround), ground: new THREE.Color(k.ground),
    };
    // palette: night ↔ (day ↔ golden by warmth) by daylight; then the keyframe's own sky/ground/lit
    const lit = lerpPalette(pDay, pGold, Math.min(1, k.warmth * 1.1));
    const pal = lerpPalette(pNight, lit, smooth(k.daylight));
    pal.skyTop.copy(c.skyTop);
    pal.skyBottom.copy(c.skyBottom);
    pal.ground.copy(c.ground);
    pal.baseSide.copy(c.ground).lerp(new THREE.Color("#3A4150"), 0.22 + 0.25 * (1 - k.daylight));
    pal.kerb.copy(pal.kerb).lerp(c.ground, 0.25);
    pal.lit = 0.1 + 0.85 * k.lights;
    pal.shadow = 0.14 + 0.18 * (1 - k.daylight);
    return { ...k, c, pal };
  });

  const s: DayState = {
    t: 0.5, skyTop: new THREE.Color(), skyBottom: new THREE.Color(), glow: new THREE.Color(), glowK: 0, fog: new THREE.Color(), fogNear: 60, fogFar: 220,
    keyColor: new THREE.Color(), keyI: 1, keyDir: new THREE.Vector3(0, 1, 0), sunEl: 45, sunAz: 120, ambSky: new THREE.Color(), ambGround: new THREE.Color(), ambI: 0.7,
    ground: new THREE.Color(), exposure: 1, lights: 0, stars: 0, daylight: 1, warmth: 0, night: 0, palette: lerpPalette(pDay, pDay, 0),
  };
  const sunV = new THREE.Vector3(), moonV = new THREE.Vector3(), moonC = new THREE.Color("#A9BDE3");

  const dirOf = (azDeg: number, elDeg: number, out: THREE.Vector3) => {
    const az = azDeg * D2R, el = elDeg * D2R;
    return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  };

  /** Write the state for time t (0..1) into `s` and return it. No allocations. */
  function sample(t: number): DayState {
    t = wrap(t);
    s.t = t;
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1]!.t) i++;
    const A = keys[i]!, B = keys[i + 1]!;
    const k = smooth((t - A.t) / (B.t - A.t));
    const L = (a: number, b: number) => a + (b - a) * k;
    s.skyTop.copy(A.c.skyTop).lerp(B.c.skyTop, k);
    s.skyBottom.copy(A.c.skyBottom).lerp(B.c.skyBottom, k);
    s.glow.copy(A.c.glow).lerp(B.c.glow, k);
    s.glowK = L(A.glowK, B.glowK);
    s.fog.copy(A.c.fog).lerp(B.c.fog, k);
    s.fogNear = L(A.fogNear, B.fogNear);
    s.fogFar = L(A.fogFar, B.fogFar);
    s.ambSky.copy(A.c.ambSky).lerp(B.c.ambSky, k);
    s.ambGround.copy(A.c.ambGround).lerp(B.c.ambGround, k);
    s.ambI = L(A.ambI, B.ambI);
    s.ground.copy(A.c.ground).lerp(B.c.ground, k);
    s.exposure = L(A.exposure, B.exposure);
    s.lights = L(A.lights, B.lights);
    s.stars = L(A.stars, B.stars);
    s.daylight = L(A.daylight, B.daylight);
    s.warmth = L(A.warmth, B.warmth);
    s.night = 1 - s.daylight;
    lerpPalette(A.pal, B.pal, k, s.palette);

    // sun along its arc; below the horizon the moon takes the key light. The swap happens while both are ~0.
    const f = (t - SUN_RISE) / (SUN_SET - SUN_RISE);
    const sf = Math.sin(Math.PI * f);
    s.sunEl = Math.sign(sf) * Math.pow(Math.abs(sf), 1.5) * SUN_MAX_EL; // negative outside the day; low and long near both ends
    s.sunAz = SUN_AZ0 + (SUN_AZ1 - SUN_AZ0) * Math.min(1.15, Math.max(-0.15, f));
    const sunI = L(A.sunI, B.sunI), moonI = L(A.moonI, B.moonI);
    // light from a sun 1° above the horizon still shades: keep the direction ≥ 6° so shadows stay finite
    dirOf(s.sunAz, Math.max(6, s.sunEl), sunV);
    dirOf(MOON_AZ, MOON_EL, moonV);
    const sunUp = f > 0 && f < 1;
    // long low-sun shadows would run off the diorama onto the invisible studio floor: fade that floor's shadow
    const lowSun = sunUp && sunI >= moonI ? Math.min(1, Math.max(0, (s.sunEl - 8) / 18)) : 1;
    s.palette.shadow *= lowSun;
    if (sunUp && sunI >= moonI) {
      s.keyDir.copy(sunV);
      s.keyColor.copy(A.c.sun).lerp(B.c.sun, k);
      s.keyI = sunI;
    } else {
      s.keyDir.copy(moonV);
      s.keyColor.copy(moonC);
      s.keyI = moonI;
    }
    return s;
  }

  return { sample, state: s };
}

export type DayCycle = ReturnType<typeof createDayCycle>;

/** Phase name for the UI. */
export function phaseName(t: number): DayPhaseName {
  t = wrap(t);
  if (t < 0.215 || t >= 0.86) return "night";
  if (t < 0.335) return "dawn";
  if (t < 0.66) return "day";
  if (t < 0.765) return "golden";
  return "dusk";
}

/** Local wall-clock time of day as 0..1. */
export function localDayFraction(d = new Date()): number {
  return (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
}

/**
 * Pace of the day: deep night passes ~2.2× faster than daylight, so a cycle spends most of its time in the
 * light the product is designed for (day, golden hour) while still visiting dusk, night and dawn.
 */
function pace(t: number): number {
  // distance (in t) into the deep night [0.88 → 0.19], smoothed at both ends
  const d = Math.abs((((t - 0.035 + 0.5) % 1) + 1) % 1 - 0.5);
  const k = Math.max(0, Math.min(1, (0.155 - d) / 0.05));
  return 1 + 1.2 * smooth(k);
}
/** ∫ dt / pace over one day, so the average cycle still lasts periodSec. */
const PACE_NORM = (() => {
  let a = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) a += 1 / pace((i + 0.5) / N);
  return a / N;
})();

/** The world's clock: cycle (t advances, one day per periodSec on average) or fixed; setClock glides along the shortest arc. */
export class DayClock {
  private mode: ClockMode = { mode: "cycle" };
  private period = 240;
  private t = 0.5; // integrated cycle time
  private last = 0; // ms of the last advance
  private glide: { from: number; to: number; t0: number; ms: number } | null = null;
  private fixedT: number | null = null;
  frozen = false;

  constructor(now: number, mode: ClockMode, frozen: boolean) {
    this.frozen = frozen;
    this.set(mode, now, false);
  }

  /** Raw (unglided) target at `now`; advances the integrated cycle time. */
  private target(now: number): number {
    if (this.fixedT != null) return this.fixedT;
    const dt = Math.max(0, Math.min(0.5, (now - this.last) / 1000));
    this.last = now;
    if (!this.frozen) this.t = wrap(this.t + ((dt / this.period) * PACE_NORM) * pace(this.t));
    return this.t;
  }

  set(mode: ClockMode, now: number, animate: boolean, glideMs = 2400) {
    const prev = this.glideValue(now, this.fixedT ?? this.t);
    this.mode = mode;
    if (mode.mode === "fixed") {
      this.fixedT = wrap(mode.t);
    } else {
      this.fixedT = null;
      this.period = Math.max(5, mode.periodSec ?? 240);
      this.t = mode.startAt != null ? wrap(mode.startAt) : localDayFraction();
    }
    this.last = now;
    if (animate) {
      const to = this.fixedT ?? this.t;
      let d = to - prev;
      if (d > 0.5) d -= 1;
      if (d < -0.5) d += 1;
      this.glide = Math.abs(d) > 1e-4 ? { from: prev, to: prev + d, t0: now, ms: glideMs } : null;
    } else this.glide = null;
  }

  private glideValue(now: number, tgt: number): number {
    if (!this.glide) return tgt;
    const g = this.glide;
    const k = Math.min(1, (now - g.t0) / g.ms);
    if (k >= 1) {
      this.glide = null;
      return tgt;
    }
    let d = tgt - wrap(g.to);
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    return wrap(g.from + (g.to + d - g.from) * e);
  }

  /** Current time of day. Call once per frame (it advances the cycle). */
  value(now: number): number {
    return this.glideValue(now, this.target(now));
  }

  get moving(): boolean {
    return !!this.glide || (this.fixedT == null && !this.frozen);
  }
  get current(): ClockMode {
    return this.mode;
  }
}

export function clockInfo(s: DayState, out: DayClockInfo): DayClockInfo {
  out.t = s.t;
  out.name = phaseName(s.t);
  out.daylight = s.daylight;
  out.warmth = s.warmth;
  return out;
}
