// Slim hackathon strip on top of the home page. It reserves its own height by moving #world and #ui down
// (both are position:fixed; the world re-fits through its ResizeObserver), so no v7 surface sits under it.
import { EMBER_ADDRESS, EVENT_LABEL, REPO_URL, SLIDES_URL, linkReady } from "./config";

export const BANNER_H = 30;

const CSS = `
html.has-ld-banner { --ld-banner-h: ${BANNER_H}px; }
html.has-ld-banner #world, html.has-ld-banner #ui, html.has-ld-banner #ui > .ui { top: var(--ld-banner-h); }
.ld-banner { position: fixed; top: 0; left: 0; right: 0; height: var(--ld-banner-h, ${BANNER_H}px); z-index: 50;
  display: flex; align-items: center; justify-content: center; gap: 14px; padding: 0 16px;
  background: var(--c-ink, #0B0D12); color: color-mix(in srgb, var(--c-bg, #E9ECF0) 72%, transparent);
  font: 500 12px/1 var(--font-text, Inter, system-ui, sans-serif); letter-spacing: 0.01em; white-space: nowrap; overflow: hidden; }
.ld-banner b { font-weight: 600; color: var(--c-bg, #E9ECF0); }
.ld-banner a, .ld-banner button { position: relative; color: var(--c-bg, #E9ECF0); text-decoration: none; background: none; border: 0; padding: 4px 2px; font: inherit; cursor: pointer; }
.ld-banner a::after, .ld-banner button::after { content: ""; position: absolute; inset: -12px -6px; }
.ld-banner a:hover, .ld-banner button:hover { text-decoration: underline; text-underline-offset: 3px; }
.ld-banner a:focus-visible, .ld-banner button:focus-visible { outline: 1px solid currentColor; outline-offset: 2px; border-radius: 3px; }
.ld-banner .sep { width: 1px; height: 12px; background: color-mix(in srgb, var(--c-bg, #E9ECF0) 22%, transparent); }
.ld-banner .dot { width: 6px; height: 6px; border-radius: 1px; background: #0AC18E; flex: none; }
.ld-banner .addr { font-family: var(--font-num, ui-monospace, monospace); font-variant-numeric: tabular-nums; }
.ld-banner .copy { display: inline-flex; align-items: center; gap: 6px; }
.ld-banner .lbl { color: color-mix(in srgb, var(--c-bg, #E9ECF0) 60%, transparent); }
.ld-banner .copy[data-done="1"] .addr { color: #0AC18E; }
@media (max-width: 640px) {
  .ld-banner { gap: 8px; justify-content: space-between; font-size: 11px; padding: 0 12px; }
  .ld-banner .sep, .ld-banner span.ev { display: none; }
  .ld-banner .copy { gap: 5px; }
}
@media (max-width: 420px) { .ld-banner .addr { display: none; } }
@media (max-width: 340px) { .ld-banner .lbl { display: none; } }`;

const short = (a: string) => {
  const s = a.replace(/^bitcoincash:/, "");
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** Mounts the banner into `el` (idempotent). Returns an unmount function. */
export function mountBanner(el: HTMLElement): () => void {
  if (el.dataset.ldBanner === "1") return () => {};
  el.dataset.ldBanner = "1";
  if (!document.getElementById("ld-banner-css")) {
    const st = document.createElement("style");
    st.id = "ld-banner-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const bar = document.createElement("div");
  bar.className = "ld-banner";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", `${EVENT_LABEL} submission links`);
  bar.innerHTML = `
    <span class="ev"><span class="dot" aria-hidden="true"></span></span><b class="ev">${EVENT_LABEL}</b>
    <span class="sep s0" aria-hidden="true"></span>
    ${linkReady(SLIDES_URL) ? `<a href="${SLIDES_URL}" target="_blank" rel="noopener">Slides</a>` : ""}
    ${linkReady(REPO_URL) ? `<a href="${REPO_URL}" target="_blank" rel="noopener">Code</a>` : ""}
    <span class="sep" aria-hidden="true"></span>
    <button type="button" class="copy" title="Copy the CashTokens address for EMBER2026 community-choice votes" aria-label="Copy EMBER2026 donation address ${EMBER_ADDRESS}">
      <span class="lbl">Vote with EMBER2026</span><span class="addr">${short(EMBER_ADDRESS)}</span><span class="state">Copy</span>
    </button>`;
  const btn = bar.querySelector<HTMLButtonElement>(".copy")!;
  const state = btn.querySelector<HTMLElement>(".state")!;
  let timer = 0;
  btn.addEventListener("click", async () => {
    const ok = await copyText(EMBER_ADDRESS);
    btn.dataset.done = ok ? "1" : "0";
    state.textContent = ok ? "Copied" : "Copy failed";
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      btn.dataset.done = "0";
      state.textContent = "Copy";
    }, 1800);
  });
  el.appendChild(bar);
  document.documentElement.classList.add("has-ld-banner");
  return () => {
    clearTimeout(timer);
    bar.remove();
    document.documentElement.classList.remove("has-ld-banner");
    delete el.dataset.ldBanner;
  };
}
