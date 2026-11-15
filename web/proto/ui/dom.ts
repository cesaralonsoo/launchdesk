// Tiny DOM helpers (WS-C). No framework.

/** html`...` returns a DocumentFragment-free element from a template string with exactly one root. */
export function el<T extends HTMLElement = HTMLElement>(html: string): T {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const reducedMotion = () =>
  document.documentElement.dataset.still === "1" || matchMedia("(prefers-reduced-motion: reduce)").matches;

export const isMobile = () => matchMedia("(max-width: 640px)").matches;

/** Counts every [data-count] inside root from 0 to its value. Keeps prefix/suffix and decimals of the original text. */
export function countUp(root: HTMLElement, ms = 600): void {
  const nodes = root.querySelectorAll<HTMLElement>("[data-count]");
  for (const n of nodes) {
    const target = Number(n.dataset.count);
    const dec = Number(n.dataset.dec ?? 0);
    const pre = n.dataset.pre ?? "";
    const suf = n.dataset.suf ?? "";
    const fmt = (v: number) => pre + v.toFixed(dec) + suf;
    if (reducedMotion()) {
      n.textContent = fmt(target);
      continue;
    }
    const delay = Number(n.dataset.delay ?? 120);
    const t0 = performance.now() + delay;
    // Scores (decimals) roll up from just below the value: a glance mid-animation never reads "0.0/10".
    const from = dec > 0 ? Math.max(0, target - 1.5) : 0;
    n.textContent = fmt(from);
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / ms));
      const e = 1 - Math.pow(1 - k, 4); // ease-out quart
      n.textContent = fmt(from + (target - from) * e);
      if (k < 1 && n.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

/** Sets --i on direct [data-stagger] children for CSS staggered entrances. */
export function stagger(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-st]").forEach((n, i) => n.style.setProperty("--i", String(i)));
}
