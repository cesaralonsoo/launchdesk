// Motion helpers (spec-v4 M3). Owner: WS1. Public API frozen (contracts-v4.md): change internals, not signatures.
// Rules: only transform / opacity / filter / clip-path (+ FLIP width); exits faster than entries;
// everything is a no-op or jumps to the final state under prefers-reduced-motion.

/** Motion tokens as numbers (ms) and CSS easing strings, mirroring the :root block in styles.css. */
export const DUR = { instant: 100, d1: 160, d2: 220, d3: 300, d4: 420, d5: 800 } as const;
export const EASE = {
  out: "cubic-bezier(.22,1,.36,1)",
  in: "cubic-bezier(.55,0,1,.45)",
  inOut: "cubic-bezier(.65,0,.35,1)",
  sheet: "cubic-bezier(.32,.72,0,1)",
  springSoft: "linear(0, .22 6%, .55 14%, .8 24%, .94 35%, 1.008 50%, 1.012 62%, 1.003 80%, 1)",
} as const;

/** True when the user asked for reduced motion. */
export function reduced(): boolean {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const counters = new WeakMap<HTMLElement, number>();

export type CountUpOpts = { ms?: number; decimals?: number; prefix?: string; suffix?: string; locale?: string; from?: number };

/**
 * Counts `el` up to `to` (rAF, easeOutExpo, Intl.NumberFormat). Reserves min-width in ch from the final
 * string so the layout never jumps. Resolves when done. Reduced motion: writes the final value at once.
 */
export function countUp(el: HTMLElement, to: number, opts: CountUpOpts = {}): Promise<void> {
  const { ms = DUR.d5, decimals = 0, prefix = "", suffix = "", locale = "en-US" } = opts;
  const nf = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const fmt = (n: number) => prefix + nf.format(n) + suffix;
  const final = fmt(to);
  el.style.fontVariantNumeric = "tabular-nums";
  el.style.display ||= "inline-block";
  el.style.minWidth = `${final.length}ch`;
  const prev = counters.get(el);
  if (prev) cancelAnimationFrame(prev);
  if (reduced() || ms <= 0) {
    el.textContent = final;
    return Promise.resolve();
  }
  const from = opts.from ?? 0;
  const t0 = performance.now();
  return new Promise((resolve) => {
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      el.textContent = t >= 1 ? final : fmt(from + (to - from) * easeOutExpo(t));
      if (t < 1) counters.set(el, requestAnimationFrame(step));
      else {
        counters.delete(el);
        resolve();
      }
    };
    counters.set(el, requestAnimationFrame(step));
  });
}

type SwapState = { last: number; timer: number | null; pending: string | null; running: boolean };
const swaps = new WeakMap<HTMLElement, SwapState>();
const SWAP_MIN_GAP = 1200;

/**
 * Replaces the text of `el` with a short out/in animation: out translateY 0→−6px + fade 140ms ease-in,
 * in 6px→0 + fade 220ms ease-out, width FLIP 240ms ease-in-out. At least 1200ms between swaps;
 * the newest text wins. Reduced motion: plain text change (opacity crossfade only).
 */
export function textSwap(el: HTMLElement, text: string): void {
  let s = swaps.get(el);
  if (!s) swaps.set(el, (s = { last: 0, timer: null, pending: null, running: false }));
  if (!s.running && s.pending === null && el.textContent === text) return;
  s.pending = text;
  const st = s;
  const run = async () => {
    st.timer = null;
    const next = st.pending;
    if (next === null) return;
    st.pending = null;
    st.running = true;
    st.last = performance.now();
    if (reduced() || !el.isConnected) {
      el.textContent = next;
    } else {
      const w0 = el.getBoundingClientRect().width;
      const out = el.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-6px)" }], { duration: 140, easing: EASE.in, fill: "forwards" });
      await out.finished.catch(() => {});
      el.textContent = next;
      // Hold the hidden state inline, then drop the fill so animations never pile up on the element.
      el.style.opacity = "0";
      out.cancel();
      const w1 = el.getBoundingClientRect().width;
      if (Math.abs(w1 - w0) > 1 && getComputedStyle(el).display !== "inline") {
        el.animate([{ width: `${w0}px` }, { width: `${w1}px` }], { duration: 240, easing: EASE.inOut });
      }
      const inn = el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 220, easing: EASE.out });
      el.style.opacity = "";
      await inn.finished.catch(() => {});
    }
    st.running = false;
    if (st.pending !== null) schedule();
  };
  const schedule = () => {
    if (st.timer !== null || st.running) return;
    const wait = Math.max(0, st.last + SWAP_MIN_GAP - performance.now());
    st.timer = window.setTimeout(() => void run(), wait);
  };
  schedule();
}

/**
 * Draws a check (or any stroked path) inside `svg`: stroke-dashoffset 14→0 over 240ms ease-out.
 * Reduced motion: shown at once.
 */
export function checkDraw(svg: SVGElement): Promise<void> {
  const paths = [...svg.querySelectorAll<SVGPathElement | SVGPolylineElement>("path, polyline")];
  if (reduced() || !paths.length) return Promise.resolve();
  return Promise.all(
    paths.map((p) => {
      p.style.strokeDasharray = "14";
      return p
        .animate([{ strokeDashoffset: 14 }, { strokeDashoffset: 0 }], { duration: 240, easing: EASE.out, fill: "both" })
        .finished.then(() => undefined)
        .catch(() => undefined);
    }),
  ).then(() => undefined);
}

/**
 * Staggered entrance: opacity 0→1 + translateY 6px→0, 300ms ease-out, `stagger` ms apart, at most `max`
 * elements animate (the rest appear with the last one). Reduced motion: 150ms linear fade only.
 */
export function enter(els: Iterable<Element>, opts: { stagger?: number; max?: number } = {}): Promise<void> {
  const { stagger = 40, max = 8 } = opts;
  const list = [...els].filter((e): e is HTMLElement | SVGElement => e instanceof HTMLElement || e instanceof SVGElement);
  const r = reduced();
  return Promise.all(
    list.map((el, i) => {
      const delay = Math.min(i, max - 1) * stagger;
      const kf = r ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }];
      return el
        .animate(kf, { duration: r ? 150 : DUR.d3, delay: r ? 0 : delay, easing: r ? "linear" : EASE.out, fill: "backwards" })
        .finished.then(() => undefined)
        .catch(() => undefined);
    }),
  ).then(() => undefined);
}

/**
 * FLIP: measures `el`, runs `mutate()` (DOM change), then animates from the old box to the new one
 * (translate + scale, 420ms ease-in-out by default). Reduced motion: just mutates.
 */
export function flip(el: HTMLElement, mutate: () => void, ms: number = DUR.d4): Promise<void> {
  if (reduced() || ms <= 0 || !el.isConnected) {
    mutate();
    return Promise.resolve();
  }
  const a = el.getBoundingClientRect();
  mutate();
  const b = el.getBoundingClientRect();
  const dx = a.left - b.left;
  const dy = a.top - b.top;
  const sx = b.width ? a.width / b.width : 1;
  const sy = b.height ? a.height / b.height : 1;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return Promise.resolve();
  return el
    .animate(
      [
        { transformOrigin: "top left", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transformOrigin: "top left", transform: "none" },
      ],
      { duration: ms, easing: EASE.inOut },
    )
    .finished.then(() => undefined)
    .catch(() => undefined);
}
