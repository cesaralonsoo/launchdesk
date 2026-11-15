// v6 · The UI follows the world's day cycle (WS-B). Pure functions: no DOM except applyDayTokens().
//
// One product skin, two poles: a refined Graphite by day and Midnight by night, warmer (paper / ember) at golden
// hour and dawn. The glass crosses over at dusk/dawn; ink, muted text and status colours are then picked against
// the *effective* glass colour, so every point of the cycle keeps WCAG AA (≥ 4.5:1) for body text.
import type { DayClockInfo, DayPhaseName } from "../contracts";

type RGB = [number, number, number];
type RGBA = [number, number, number, number];

export interface Skin {
  bg: string; glass: RGBA; glassStrong: RGBA; ink: string; muted: string; accent: string; accentInk: string;
  money: string; positive: string; warning: string; negative: string; border: RGBA; shadowA: number; sky: string;
}

/** Refined Graphite: white glass, near-black ink, BCH green. */
export const DAY: Skin = {
  bg: "#EDF0F3", glass: [255, 255, 255, 0.8], glassStrong: [255, 255, 255, 0.95], ink: "#0A0C11", muted: "#5B6371",
  accent: "#0A0C11", accentInk: "#FFFFFF", money: "#0AC18E", positive: "#05875F", warning: "#A15C00", negative: "#C2352A",
  border: [255, 255, 255, 0.72], shadowA: 0.11, sky: "#E6EAF0",
};
/** Midnight: smoked glass, off-white ink, mint. */
export const NIGHT: Skin = {
  bg: "#06080C", glass: [14, 17, 24, 0.74], glassStrong: [21, 25, 33, 0.92], ink: "#F2F4F7", muted: "#9AA3B2",
  accent: "#F2F4F7", accentInk: "#06080C", money: "#2FD9A3", positive: "#3BDDA9", warning: "#F5B947", negative: "#FF7B6F",
  border: [255, 255, 255, 0.08], shadowA: 0.42, sky: "#0D131E",
};
/** Golden hour, light pole: warm paper. */
export const GOLDEN: Skin = {
  bg: "#F8F1E6", glass: [253, 248, 240, 0.82], glassStrong: [254, 251, 246, 0.95], ink: "#1B1712", muted: "#6F6456",
  accent: "#1B1712", accentInk: "#FFFBF5", money: "#0AA67A", positive: "#07805A", warning: "#9A5A10", negative: "#B5402C",
  border: [255, 250, 240, 0.62], shadowA: 0.13, sky: "#EEDFC8",
};
/** Dusk / dawn, dark pole: ember-tinted smoked glass. */
export const EMBER: Skin = {
  bg: "#0D0A0A", glass: [24, 19, 18, 0.74], glassStrong: [32, 26, 24, 0.92], ink: "#F7F2EC", muted: "#AFA195",
  accent: "#F7F2EC", accentInk: "#0D0A0A", money: "#45DDA9", positive: "#48DCA8", warning: "#F7BE5A", negative: "#FF8670",
  border: [255, 236, 220, 0.09], shadowA: 0.4, sky: "#1E1615",
};

// ───────────────────────────── colour maths
const hex = (h: string): RGB => {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const toHex = (c: RGB) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const mixRGB = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const mixRGBA = (a: RGBA, b: RGBA, k: number): RGBA => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)];
const mixHex = (a: string, b: string, k: number) => toHex(mixRGB(hex(a), hex(b), k));
const rgba = (c: RGBA) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${c[3].toFixed(3)})`;
export const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
function lum(c: RGB): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
export function contrast(a: RGB | string, b: RGB | string): number {
  const A = lum(typeof a === "string" ? hex(a) : a), B = lum(typeof b === "string" ? hex(b) : b);
  return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05);
}
const over = (top: RGBA, under: RGB): RGB => mixRGB(under, [top[0], top[1], top[2]], top[3]);

function mixSkin(a: Skin, b: Skin, k: number): Skin {
  return {
    bg: mixHex(a.bg, b.bg, k), glass: mixRGBA(a.glass, b.glass, k), glassStrong: mixRGBA(a.glassStrong, b.glassStrong, k),
    ink: mixHex(a.ink, b.ink, k), muted: mixHex(a.muted, b.muted, k), accent: mixHex(a.accent, b.accent, k), accentInk: mixHex(a.accentInk, b.accentInk, k),
    money: mixHex(a.money, b.money, k), positive: mixHex(a.positive, b.positive, k), warning: mixHex(a.warning, b.warning, k), negative: mixHex(a.negative, b.negative, k),
    border: mixRGBA(a.border, b.border, k), shadowA: lerp(a.shadowA, b.shadowA, k), sky: mixHex(a.sky, b.sky, k),
  };
}

/** The resolved CSS tokens for one moment of the day + the numbers the AA test reads. */
export interface DayTokens {
  vars: Record<string, string>;
  scheme: "light" | "dark";
  /** effective glass colour (glass over the expected backdrop) and the contrast of ink / muted on it */
  check: { glass: string; ink: number; muted: number; positive: number; negative: number; warning: number; light: number };
}

/** Text colour that keeps ≥ `min` contrast on `bg`, as close to `want` as possible (moves toward the better pole). */
function ensure(want: string, bg: RGB, min: number, poles: [string, string]): string {
  if (contrast(want, bg) >= min) return want;
  const pole = contrast("#000000", bg) > contrast("#FFFFFF", bg) ? "#000000" : "#FFFFFF";
  void poles;
  let lo = 0, hi = 1;
  for (let i = 0; i < 14; i++) {
    const m = (lo + hi) / 2;
    contrast(mixHex(want, pole, m), bg) >= min ? (hi = m) : (lo = m);
  }
  return mixHex(want, pole, hi);
}

/**
 * daylight 0..1 and warmth 0..1 → tokens. `light` (the glass pole) crosses over between daylight 0.4 and 0.6:
 * golden hour (daylight ≈ 0.75) keeps the warm paper glass, dusk (≈ 0.3) is already smoked.
 */
export function dayTokens(daylight: number, warmth: number): DayTokens {
  const light = smooth(0.4, 0.6, daylight);
  const base = mixSkin(NIGHT, DAY, light);
  const warmPole = mixSkin(EMBER, GOLDEN, light);
  const s = mixSkin(base, warmPole, Math.min(1, warmth) * 0.9);
  const glassEff = over(s.glass, hex(s.sky));
  const strongEff = over(s.glassStrong, glassEff);
  // ink: whichever pole reads better on the effective glass, blended only where both are comfortably > AA
  const darkInk = mixHex(DAY.ink, GOLDEN.ink, warmth), lightInk = mixHex(NIGHT.ink, EMBER.ink, warmth);
  const cd = contrast(darkInk, glassEff), cl = contrast(lightInk, glassEff);
  const k = smooth(-1.2, 1.2, cd - cl); // 1 = dark ink
  const ink = ensure(mixHex(lightInk, darkInk, k), glassEff, 7, [darkInk, lightInk]);
  const poles: [string, string] = [darkInk, lightInk];
  const pick = (d: string, n: string) => ensure(mixHex(n, d, k), glassEff, 4.6, poles);
  const muted = ensure(mixHex(mixHex(NIGHT.muted, EMBER.muted, warmth), mixHex(DAY.muted, GOLDEN.muted, warmth), k), glassEff, 4.7, poles);
  const positive = pick(mixHex(DAY.positive, GOLDEN.positive, warmth), mixHex(NIGHT.positive, EMBER.positive, warmth));
  const negative = pick(mixHex(DAY.negative, GOLDEN.negative, warmth), mixHex(NIGHT.negative, EMBER.negative, warmth));
  const warning = pick(mixHex(DAY.warning, GOLDEN.warning, warmth), mixHex(NIGHT.warning, EMBER.warning, warmth));
  const accentInk = toHex(contrast("#FFFFFF", hex(ink)) > contrast("#06080C", hex(ink)) ? [255, 255, 255] : hex("#06080C"));
  const inkRGB = hex(ink);
  const shadow = `0 1px 1px rgba(0,0,0,${(s.shadowA * 0.35).toFixed(3)}), 0 18px 50px -12px rgba(0,0,0,${s.shadowA.toFixed(3)})`;
  const vars: Record<string, string> = {
    "--c-bg": s.bg,
    "--c-sky": s.sky,
    "--c-glass": rgba(s.glass),
    "--c-glass-strong": rgba(s.glassStrong),
    "--c-surface": toHex(strongEff),
    "--c-ink": ink,
    "--c-muted": muted,
    "--c-line": `rgba(${inkRGB.join(",")},${lerp(0.14, 0.09, k).toFixed(3)})`,
    "--c-fill": `rgba(${inkRGB.join(",")},${lerp(0.08, 0.05, k).toFixed(3)})`,
    "--c-accent": ink,
    "--c-accent-ink": accentInk,
    "--c-money": s.money,
    "--c-positive": positive,
    "--c-warning": warning,
    "--c-negative": negative,
    "--glass-border": rgba(s.border),
    "--glass-shadow": shadow,
    "--glass-hi": `rgba(255,255,255,${lerp(0.07, 0.5, light).toFixed(3)})`,
    "--daylight": daylight.toFixed(3),
    "--warmth": warmth.toFixed(3),
  };
  return {
    vars, scheme: k > 0.5 ? "light" : "dark",
    check: {
      glass: toHex(glassEff), ink: contrast(ink, glassEff), muted: contrast(muted, glassEff), positive: contrast(positive, glassEff),
      negative: contrast(negative, glassEff), warning: contrast(warning, glassEff), light,
    },
  };
}

// ───────────────────────────── a local clock (only used while the world has no setClock / onClock)

export const PHASES: Array<[DayPhaseName, number]> = [["night", 0], ["dawn", 0.26], ["day", 0.5], ["golden", 0.72], ["dusk", 0.8], ["night", 1]];
const bump = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));

/** Same landmarks as contracts DAY_TIMES: dawn 0.26 · day 0.5 · golden 0.72 · dusk 0.8 · night 0. */
export function clockInfo(t: number): DayClockInfo {
  const x = ((t % 1) + 1) % 1;
  const daylight = smooth(0.21, 0.36, x) * (1 - smooth(0.73, 0.86, x));
  const warmth = Math.min(1, bump(x, 0.27, 0.045) * 0.85 + bump(x, 0.735, 0.055));
  let name: DayPhaseName = "night", best = 9;
  for (const [n, at] of PHASES) {
    const d = Math.abs(x - at);
    if (d < best) (best = d), (name = n);
  }
  return { t: x, name, daylight, warmth };
}

// ───────────────────────────── scheme hysteresis (v6 polish)
// The glass never lerps through the middle (that read as a muddy grey-taupe flip, twice a day). There are two token
// families: light (Graphite ↔ golden paper by warmth) and dark (Midnight ↔ ember by warmth). Inside a family only hue
// and warmth drift, continuously. The clock may *ask* for the other family (with hysteresis on daylight), but the swap
// is applied only at a calm moment: when the UI changes step (commitScheme), or after a long wait, with a crossfade.

/** Tokens inside one family: no luminance crossover, so ink keeps its contrast and nothing passes through grey. */
export function familyTokens(scheme: "light" | "dark", warmth: number, daylight: number): DayTokens {
  const w = Math.min(1, warmth) * 0.9;
  const s = scheme === "light" ? mixSkin(DAY, GOLDEN, w) : mixSkin(NIGHT, EMBER, w);
  // a whisper of the hour inside the family: deep night is a touch cooler (indigo), full day a touch crisper
  if (scheme === "dark") s.sky = mixHex(s.sky, "#141A33", (1 - daylight) * (1 - w) * 0.35);
  const glassEff = over(s.glass, hex(s.sky));
  const strongEff = over(s.glassStrong, glassEff);
  const ink = s.ink, inkRGB = hex(ink);
  const light = scheme === "light";
  const shadow = `0 1px 1px rgba(0,0,0,${(s.shadowA * 0.35).toFixed(3)}), 0 18px 50px -12px rgba(0,0,0,${s.shadowA.toFixed(3)})`;
  const poles: [string, string] = [ink, ink];
  const vars: Record<string, string> = {
    "--c-bg": s.bg,
    "--c-sky": s.sky,
    "--c-glass": rgba(s.glass),
    "--c-glass-strong": rgba(s.glassStrong),
    "--c-surface": toHex(strongEff),
    "--c-ink": ink,
    "--c-muted": ensure(s.muted, glassEff, 4.7, poles),
    "--c-line": `rgba(${inkRGB.join(",")},${light ? 0.09 : 0.14})`,
    "--c-fill": `rgba(${inkRGB.join(",")},${light ? 0.05 : 0.08})`,
    "--c-accent": ink,
    "--c-accent-ink": s.accentInk,
    "--c-money": s.money,
    "--c-positive": ensure(s.positive, glassEff, 4.6, poles),
    "--c-warning": ensure(s.warning, glassEff, 4.6, poles),
    "--c-negative": ensure(s.negative, glassEff, 4.6, poles),
    "--glass-border": rgba(s.border),
    "--glass-shadow": shadow,
    "--glass-hi": `rgba(255,255,255,${light ? 0.5 : 0.07})`,
    "--daylight": daylight.toFixed(3),
    "--warmth": warmth.toFixed(3),
  };
  return {
    vars, scheme,
    check: {
      glass: toHex(glassEff), ink: contrast(ink, glassEff), muted: contrast(vars["--c-muted"]!, glassEff), positive: contrast(vars["--c-positive"]!, glassEff),
      negative: contrast(vars["--c-negative"]!, glassEff), warning: contrast(vars["--c-warning"]!, glassEff), light: light ? 1 : 0,
    },
  };
}

/** Which family the hour asks for, with hysteresis so dawn/dusk never flicker between them. */
export function wantScheme(daylight: number, current: "light" | "dark" | null): "light" | "dark" {
  if (current === "light") return daylight < 0.4 ? "dark" : "light";
  if (current === "dark") return daylight > 0.6 ? "light" : "dark";
  return daylight >= 0.5 ? "light" : "dark";
}

let applied: "light" | "dark" | null = null;
let pendingSince = 0;
let lastInfo: DayClockInfo | null = null;
let lastKey = "";
/** A long wait still lets the swap through (someone reading one card for minutes), crossfaded. */
const MAX_PENDING_MS = 45_000;

function write(info: DayClockInfo, scheme: "light" | "dark", root: HTMLElement): DayTokens | null {
  const key = `${scheme}:${Math.round(info.daylight * 200)}:${Math.round(info.warmth * 300)}`;
  if (key === lastKey) return null;
  lastKey = key;
  const tk = familyTokens(scheme, info.warmth, info.daylight);
  for (const [k, v] of Object.entries(tk.vars)) root.style.setProperty(k, v);
  root.style.colorScheme = scheme;
  root.dataset.scheme = scheme;
  root.dataset.phase = info.name;
  return tk;
}

function crossfade(root: HTMLElement) {
  if (root.dataset.still === "1") return;
  root.classList.add("scheme-xfade");
  clearTimeout((crossfade as unknown as { t?: number }).t);
  (crossfade as unknown as { t?: number }).t = window.setTimeout(() => root.classList.remove("scheme-xfade"), 1300);
}

/** Writes the tokens for this moment on <html>. The family swap waits for commitScheme() (or a long wait). */
export function applyDayTokens(info: DayClockInfo, root: HTMLElement = document.documentElement): DayTokens | null {
  lastInfo = info;
  const want = wantScheme(info.daylight, applied);
  if (applied == null) applied = want;
  else if (want !== applied) {
    const now = performance.now();
    if (!pendingSince) pendingSince = now;
    if (now - pendingSince > MAX_PENDING_MS) {
      applied = want;
      pendingSince = 0;
      crossfade(root);
    }
  } else pendingSince = 0;
  root.dataset.schemeWant = want;
  return write(info, applied, root);
}

/** Calm moment (a step change, a panel closing): let a pending family swap through, crossfaded. */
export function commitScheme(root: HTMLElement = document.documentElement): void {
  if (!lastInfo || applied == null) return;
  const want = wantScheme(lastInfo.daylight, applied);
  if (want === applied) return;
  applied = want;
  pendingSince = 0;
  crossfade(root);
  write(lastInfo, applied, root);
}
