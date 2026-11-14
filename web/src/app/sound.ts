// Soft UI sounds with WebAudio. Off by default; the choice is remembered per browser.

const KEY = "launchdesk-sound";
let on = false;
try {
  on = localStorage.getItem(KEY) === "1";
} catch {
  /* storage unavailable */
}
let ctx: AudioContext | null = null;
const subs = new Set<(on: boolean) => void>();

export const soundOn = () => on;
export const onSound = (cb: (on: boolean) => void) => (subs.add(cb), () => subs.delete(cb));
export function setSound(v: boolean) {
  on = v;
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
  subs.forEach((s) => s(v));
  if (v) play("tap");
}

function tone(freq: number, at: number, dur: number, gain = 0.06, type: OscillatorType = "sine") {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export type Sfx = "tap" | "coin" | "done" | "start" | "celebrate" | "open";

export function play(s: Sfx) {
  if (!on) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    return;
  }
  switch (s) {
    case "tap":
      tone(660, 0, 0.08, 0.035);
      break;
    case "open":
      tone(520, 0, 0.1, 0.03);
      tone(780, 0.05, 0.12, 0.03);
      break;
    case "coin":
      tone(988, 0, 0.12, 0.05, "triangle");
      tone(1319, 0.08, 0.28, 0.05, "triangle");
      break;
    case "start":
      tone(440, 0, 0.14, 0.04);
      tone(554, 0.09, 0.18, 0.04);
      break;
    case "done":
      tone(659, 0, 0.16, 0.045);
      tone(880, 0.1, 0.3, 0.045);
      break;
    case "celebrate":
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.4, 0.04, "triangle"));
      break;
  }
}
