// Hackathon links (BCH BLAZE 2026 rule: slides, repo and the EMBER2026 CashTokens address on the home page).
// v8: no more black strip on top of every screen; the same content lives in the home footer (#blaze), styled by
// ui/home.css. Links still at their bare placeholder are hidden, never a dead click for a judge.
import { EMBER_ADDRESS, EVENT_LABEL, REPO_URL, SLIDES_URL, linkReady } from "./config";

const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

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

/** Fills the home footer (`el`, idempotent): event, slides, code, the EMBER2026 vote address with Copy. */
export function mountFooter(el: HTMLElement): () => void {
  if (el.dataset.ldFooter === "1") return () => {};
  el.dataset.ldFooter = "1";
  const slides = linkReady(SLIDES_URL) ? `<a href="${escAttr(SLIDES_URL)}" target="_blank" rel="noopener">Slides</a>` : "";
  const code = linkReady(REPO_URL) ? `<a href="${escAttr(REPO_URL)}" target="_blank" rel="noopener">Code</a>` : "";
  el.innerHTML = `<div class="h-foot-in">
      <span><b>Built for ${EVENT_LABEL}</b> · Mainnet track</span>
      ${slides}${code}
      <span class="h-vote">Vote with EMBER2026 <code>${escAttr(EMBER_ADDRESS)}</code> <button type="button" aria-label="Copy the EMBER2026 vote address">Copy</button></span>
      <span class="h-foot-r">Built on Bitcoin Cash · CashScript</span>
    </div>`;
  const btn = el.querySelector<HTMLButtonElement>(".h-vote button")!;
  let timer = 0;
  btn.addEventListener("click", async () => {
    const ok = await copyText(EMBER_ADDRESS);
    btn.dataset.done = ok ? "1" : "0";
    btn.textContent = ok ? "Copied" : "Copy failed";
    clearTimeout(timer);
    timer = window.setTimeout(() => ((btn.dataset.done = "0"), (btn.textContent = "Copy")), 1800);
  });
  return () => {
    clearTimeout(timer);
    el.innerHTML = "";
    delete el.dataset.ldFooter;
  };
}

/** @deprecated v8: the top strip is gone; kept so an old caller still compiles. Fills `el` as a footer. */
export const mountBanner = mountFooter;
