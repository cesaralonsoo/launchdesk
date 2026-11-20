// Hackathon links (BCH BLAZE 2026 rule: slides, repo and the EMBER2026 CashTokens address on the home page).
// v8: no black strip on top of every screen. The home has a slim light strip at the very top (mountTopBar) and the same
// links in its footer (#blaze), both styled by ui/home.css. Links still at their bare placeholder are hidden, never a dead click for a judge.
import { EMBER_ADDRESS, EVENT_LABEL, FIRST_COMMIT_URL, REPO_URL, SLIDES_URL, VIDEO_URL, linkReady } from "./config";

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
  const video = `<a href="${escAttr(VIDEO_URL)}" target="_blank" rel="noopener">Video</a>`;
  const fresh = `<a href="${escAttr(FIRST_COMMIT_URL)}" target="_blank" rel="noopener">Built during BLAZE · first commit 14 Nov</a>`;
  el.innerHTML = `<div class="h-foot-in">
      <span><b>Built for ${EVENT_LABEL}</b> · Mainnet track</span>
      ${slides}${video}${code}${fresh}
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

/** The slim top-of-page strip on the home (BCH BLAZE 2026 rule: a top-of-page banner with the slides, the repo and
 *  the EMBER2026 CashTokens address). Light, one row, under 40 px; the footer keeps the same links. Idempotent. */
export function mountTopBar(el: HTMLElement): () => void {
  if (el.dataset.ldTop === "1") return () => {};
  el.dataset.ldTop = "1";
  const ext = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M4.5 2.5h5v5M9.5 2.5 3 9"/></svg>`;
  const slides = linkReady(SLIDES_URL) ? `<a href="${escAttr(SLIDES_URL)}" target="_blank" rel="noopener">Slides${ext}</a>` : "";
  const code = linkReady(REPO_URL) ? `<a href="${escAttr(REPO_URL)}" target="_blank" rel="noopener">Code${ext}</a>` : "";
  const video = `<a href="${escAttr(VIDEO_URL)}" target="_blank" rel="noopener">Video${ext}</a>`;
  const fresh = `<a class="h-blaze-new" href="${escAttr(FIRST_COMMIT_URL)}" target="_blank" rel="noopener" title="No earlier code or demo: the first commit is from 14 Nov 2026, after the Kick-Off">Built during BLAZE${ext}</a>`;
  const bare = EMBER_ADDRESS.replace(/^bitcoincash:/, "");
  const short = `${bare.slice(0, 4)}…${bare.slice(-4)}`;
  el.innerHTML = `<div class="h-blaze-in">
      <span class="h-blaze-ev"><i aria-hidden="true"></i><b>${EVENT_LABEL.replace(/^BCH /, '<span class="h-blaze-bch">BCH </span>')}</b><span class="h-blaze-tr"> · Mainnet track</span></span>
      <span class="h-blaze-r">
        ${slides}${video}${code}${fresh}
        <span class="h-blaze-vote"><span class="h-blaze-vl">Vote with </span><b>EMBER2026</b>
          <code title="${escAttr(EMBER_ADDRESS)}"><span class="h-blaze-al">${escAttr(EMBER_ADDRESS)}</span><span class="h-blaze-as" aria-hidden="true">${escAttr(short)}</span></code>
          <button type="button" aria-label="Copy the EMBER2026 vote address">Copy</button></span>
      </span>
    </div>`;
  const btn = el.querySelector<HTMLButtonElement>(".h-blaze-vote button")!;
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
    delete el.dataset.ldTop;
  };
}

/** @deprecated v8: the top strip is gone; kept so an old caller still compiles. Fills `el` as a footer. */
export const mountBanner = mountFooter;
