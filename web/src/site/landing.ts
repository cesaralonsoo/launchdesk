// The generated public page (/s/:slug), brand-first (spec-v4 L41–L43, M13, F11). Owner: WS3.
// Also rendered inside the pack's phone / desktop previews (pack/tabs.ts) and the offline pack HTML,
// so the markup must look right with no JavaScript at all: motion is added by wireLanding() only.
import type { SiteData } from "../types";
import { iconGroup, renderWordmark } from "../pack/logo";
import { brandColors, contrast, esc, fontStack, loadFonts, mix } from "../pack/util";
import siteCss from "./site.css?inline";
import { watchPayment } from "./preorders";
import { BCH_BADGE, bchAmount, copyText, paymentUri, qrSvg } from "./qr";
import { explorerTx } from "../explorer";

const STYLE_ID = "ld-site-css";
export function ensureSiteCss(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = siteCss;
  document.head.appendChild(s);
}
export const SITE_CSS: string = siteCss;

export const ICON_CHECK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>`;
const ICON_X = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
const ICON_PLUS = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13"/></svg>`;
const ICON_COPY = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 8.5V6.2a1.7 1.7 0 0 0-1.7-1.7H6.2a1.7 1.7 0 0 0-1.7 1.7v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3"/></svg>`;

/** Brand-first colours: page = brand Background, text = brand Primary (or the most readable ink), CTA = Primary. */
export function brandVars(data: Pick<SiteData, "palette">): string {
  const c = brandColors(data.palette);
  const bg = c.bg;
  const ink = c.ink;
  const primary = contrast(c.primary, bg) >= 3 ? c.primary : ink;
  const onPrimary = contrast(bg, primary) >= 4.5 ? bg : contrast("#ffffff", primary) >= contrast("#111111", primary) ? "#ffffff" : "#111111";
  // Accent carries the big step numbers and the pattern band; fall back to Primary when it is too pale on the page.
  const accent = contrast(c.accent, bg) >= 2.2 ? c.accent : primary;
  const onAccent = contrast("#ffffff", accent) >= contrast("#111111", accent) ? "#ffffff" : "#111111";
  const line = mix(ink, bg, 0.88);
  return [
    `--b-bg:${bg}`,
    `--b-ink:${ink}`,
    `--b-muted:${mix(ink, bg, 0.3)}`,
    `--b-faint:${mix(ink, bg, 0.45)}`,
    `--b-primary:${primary}`,
    `--b-on-primary:${onPrimary}`,
    `--b-accent:${accent}`,
    `--b-on-accent:${onAccent}`,
    `--b-line:${line}`,
    `--b-soft:${mix(ink, bg, 0.94)}`,
  ].join(";");
}

/** "First 100 Morning Passes at €29 (normally €39)" → head "First 100 Morning Passes: €29", was "normally €39". */
export function splitOffer(offer: string) {
  let head = offer.trim();
  let was = "";
  const m = head.match(/\s*\((?:normally|usually|was|regular(?:ly)?|instead of)\s+([^)]+)\)\s*\.?$/i);
  if (m) {
    was = `normally ${m[1]!.trim()}`;
    head = head.slice(0, m.index).trim();
  }
  head = head.replace(/\s+(?:at|for)\s+([€£$]\s?\d[\d.,]*|\d[\d.,]*\s?(?:€|EUR|£|GBP))\s*$/i, ": $1");
  return { head, was };
}

/** "€2.50", "€29", "$450": no decimals for whole amounts. */
export function localPrice(currency: string, n: number): string {
  if (!(n > 0)) return "";
  const v = Math.round(n * 100) / 100;
  const s = Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency || "$"}${s}`;
}

/**
 * One source of truth for the pre-order price: Dex's offer price in the brand's currency first ("€29"),
 * then the USD / BCH conversion the QR actually charges.
 */
export function priceParts(L: SiteData["landing"], bchUsd: number, currency = "") {
  const usd = Number(L.price_hint_usd) || 0;
  let local = "";
  if (Number(L.offer_price) > 0 && currency && currency !== "$") local = localPrice(currency, Number(L.offer_price));
  if (!local) {
    const m = (L.offer || "").match(/([€£$])\s?(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?(€|EUR|£|GBP)/);
    const sym = m ? (m[1] ?? (m[4] === "EUR" ? "€" : m[4] === "GBP" ? "£" : m[4])) : "";
    local = m && sym !== "$" ? `${sym}${m[2] ?? m[3]}` : "";
  }
  const usdTxt = usd ? `$${usd.toFixed(2)}` : "";
  const bch = bchAmount(usd, bchUsd);
  return {
    usd,
    bch,
    /** "€29 · ≈ $31.50" or "$31.50" */
    main: local && usdTxt ? `${local} · ≈ ${usdTxt}` : usdTxt,
    /** Short form for tight spots: "€29" or "$31.50" */
    short: local || usdTxt,
  };
}

/** The tiled band: the logo's icon at 12% on the accent colour, as an SVG data URL (no network). */
function patternUrl(data: SiteData, color: string): string {
  const icon = data.logo?.icon ?? "spark";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><g opacity=".12">` +
    iconGroup(icon, color, 18, 18, 36, "transparent") +
    iconGroup(icon, color, 78, 78, 24, "transparent") +
    `</g></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

/** Static markup of the landing page (no behaviour). `homeHref` is where "Made with LaunchDesk" points. */
export function landingMarkup(data: SiteData, opts: { homeHref?: string } = {}): string {
  const L = data.landing;
  const name = data.name || "Your brand";
  const c = brandColors(data.palette);
  const vars = brandVars(data);
  const ink = c.ink;
  const accent = /--b-accent:([^;]+)/.exec(vars)?.[1] ?? c.accent;
  const onAccent = /--b-on-accent:([^;]+)/.exec(vars)?.[1] ?? "#ffffff";
  const display = fontStack(data.fonts?.display, "display");
  const body = fontStack(data.fonts?.body, "body");
  const currency = data.currency || "";
  const price = priceParts(L, data.bchUsd, currency);
  const offerPrice = localPrice(currency, Number(data.offer_price ?? L.offer_price)) || price.short;
  const normal = data.normal_price ?? L.normal_price;
  const normalTxt = normal && normal > (data.offer_price ?? L.offer_price ?? 0) ? localPrice(currency, normal) : "";
  const offer = splitOffer(L.offer || "");
  const bullets = (L.bullets || []).slice(0, 3);
  const faq = (data.faq?.length ? data.faq : L.faq || []).slice(0, 3);
  const where = data.where_when ?? L.where_when ?? null;
  const homeHref = opts.homeHref ?? "/";
  const year = new Date().getFullYear();
  const cta = esc(L.cta || `Pre-order ${offerPrice}`.trim());
  const logo = renderWordmark(data.logo, data.palette, name, 30, data.fonts, { color: ink });

  return `
<div class="lds" style="${vars};--b-display:${esc(display)};--b-body:${esc(body)}">
  <section class="lds-hero" id="top">
    <div class="lds-wrap lds-hero-in">
      <div class="lds-logo" data-lds-in>${logo}</div>
      <h1 class="lds-h1" data-lds-in>${esc(L.headline)}</h1>
      <p class="lds-sub" data-lds-in>${esc(L.subheadline)}</p>
      <div class="lds-cta-wrap" data-lds-in>
        <button class="lds-cta" data-lds-pay type="button">${cta}</button>
        <p class="lds-cta-note">${data.demo ? "Demo page: pre-orders are switched off." : `Pay with Bitcoin Cash, straight to ${esc(name)}'s wallet.`}</p>
      </div>
    </div>
  </section>

  <div class="lds-band" aria-hidden="true" style="--b-pattern:${esc(patternUrl(data, onAccent))}"><div class="lds-band-tiles"></div></div>

  ${bullets.length ? `
  <section class="lds-sec lds-points" data-lds-reveal>
    <div class="lds-wrap">
      <ul class="lds-points-list">${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
    </div>
  </section>` : ""}

  <section class="lds-sec lds-how" id="lds-how" data-lds-reveal>
    <div class="lds-wrap">
      <h2 class="lds-h2">How it works</h2>
      <ol class="lds-steps">
        <li><span class="lds-step-n">1</span><b>Tap “${cta}”</b><span>You see the exact amount in Bitcoin Cash.</span></li>
        <li><span class="lds-step-n">2</span><b>Scan with any BCH wallet</b><span>Selene, Paytaca, Cashonize or Electron Cash.</span></li>
        <li><span class="lds-step-n">3</span><b>Paid straight to ${esc(name)}</b><span>No card, no account, no middleman.</span></li>
      </ol>
    </div>
  </section>

  <section class="lds-sec lds-offer" data-lds-reveal>
    <div class="lds-wrap"><div class="lds-offer-in">
      <div class="lds-offer-l">
        <h2 class="lds-h2">${esc((offerPrice ? offer.head.replace(/:\s*[€£$]?\s?\d[\d.,]*\s*(?:€|EUR|£|GBP)?\s*$/i, "") : offer.head) || `Be first in line at ${name}.`)}</h2>
        ${where ? `<p class="lds-where">${esc(where)}</p>` : ""}
      </div>
      <div class="lds-offer-r">
        ${offerPrice ? `<div class="lds-price"><b>${esc(offerPrice)}</b>${normalTxt ? `<s>Normally ${esc(normalTxt)}</s>` : ""}</div>` : ""}
        <button class="lds-cta" data-lds-pay type="button">${cta}</button>
      </div>
    </div></div>
  </section>

  ${faq.length ? `
  <section class="lds-sec lds-faq" data-lds-reveal>
    <div class="lds-wrap">
      <h2 class="lds-h2">Questions</h2>
      <div class="lds-faq-list">${faq.map((f) => `<details><summary><span>${esc(f.q)}</span>${ICON_PLUS}</summary><p>${esc(f.a)}</p></details>`).join("")}</div>
    </div>
  </section>` : ""}

  <footer class="lds-foot">
    <div class="lds-wrap lds-foot-in">
      <span>© ${year} ${esc(name)}</span>
      <a href="${esc(homeHref)}" target="_blank" rel="noopener">Made with LaunchDesk</a>
      <a href="/legal#report" target="_blank" rel="noopener">Report this page</a>
    </div>
  </footer>
  ${data.demo ? `<div class="lds-demo" role="note">Demo page: pre-orders are off</div>` : ""}
</div>`;
}

/** The pay sheet content (QR to the founder's address). */
export function paySheetMarkup(data: SiteData): string {
  const price = priceParts(data.landing, data.bchUsd, data.currency || "");
  const amount = price.bch;
  const addr = (data.founderAddress || "").trim();
  const uri = addr ? paymentUri(addr, amount) : "";
  const shown = addr.replace(/^bitcoincash:/, "");
  const name = esc(data.name);
  const logo = renderWordmark(data.logo, data.palette, data.name, 17, data.fonts, { color: "#1D1D1F" });
  return `
<div class="lds-sheet-card" role="dialog" aria-modal="true" aria-label="Pre-order from ${name} with Bitcoin Cash">
  <button class="lds-sheet-x" type="button" data-lds-close aria-label="Close">${ICON_X}</button>
  <div class="lds-sheet-head">${logo}</div>
  <div data-lds-sheet-main>
    ${price.short ? `<div class="lds-amount"><b>${esc(price.short)}</b>${amount ? `<span class="lds-amount-bch">${amount} BCH${price.short.startsWith("$") ? "" : ` · ≈ $${price.usd.toFixed(2)}`}</span>` : ""}</div>` : ""}
    ${data.demo ? `
    <div class="lds-qrbox lds-qr-sample" aria-hidden="true">${qrSvg("LaunchDesk demo page. Pre-orders are switched off.", { size: 200 })}<span>Sample</span></div>
    <p class="lds-direct"><b>Demo page.</b> This would send BCH to the founder's own wallet. No wallet is connected here, so don't pay.</p>
    ` : addr ? `
    <div class="lds-qrbox">${qrSvg(uri, { size: 200, badge: `<circle cx="50" cy="50" r="50" fill="#fff"/><g transform="translate(8 8) scale(.84)">${BCH_BADGE}</g>`, label: "Bitcoin Cash payment QR" })}</div>
    <div class="lds-waiting" data-lds-waiting><i></i>Waiting for payment</div>
    <div class="lds-addr"><code title="${esc(addr)}">${esc(shown)}</code><button class="lds-copy" type="button" data-lds-copy="${esc(addr)}" aria-label="Copy address">${ICON_COPY}</button></div>
    <a class="lds-open" href="${esc(uri)}">Open in wallet app</a>
    <p class="lds-direct">Paid directly to ${name}. LaunchDesk never holds funds.</p>
    ` : `<p class="lds-noaddr">Pre-orders open soon: the founder hasn't connected a wallet yet.</p>`}
  </div>
</div>`;
}

/** F11 + M13: the success state after the founder's address receives the pre-order. */
function successMarkup(data: SiteData, tx: { txid: string; sats: number }): string {
  const bch = (tx.sats / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
  return `
<div class="lds-paid">
  <span class="lds-ok"><svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true"><circle class="lds-ok-ring" cx="28" cy="28" r="26.5" fill="none" stroke-width="3"/><circle class="lds-ok-fill" cx="28" cy="28" r="28"/><path class="lds-ok-check" d="M18 28.5l6.5 6.5L38.5 21" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
  <b class="lds-paid-t">Pre-order received</b>
  <span class="lds-paid-amt">${bch} BCH</span>
  <a class="lds-paid-tx" href="${esc(explorerTx(tx.txid))}" target="_blank" rel="noopener">View transaction ↗</a>
  <p class="lds-direct">Paid directly to ${esc(data.name)}. LaunchDesk never holds funds.</p>
</div>`;
}

const reducedMotion = () => {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
};

/**
 * Wire up the pay buttons inside `root`. The sheet opens over `sheetHost`
 * (document.body for the real page, the phone screen for the pack preview).
 */
export function wireLanding(root: HTMLElement, data: SiteData, sheetHost: HTMLElement = document.body): () => void {
  let sheet: HTMLElement | null = null;
  let stopWatch: (() => void) | null = null;
  let lastFocus: HTMLElement | null = null;
  const contained = sheetHost !== document.body;
  const cleanups: Array<() => void> = [];
  if (data.fonts) loadFonts(data.fonts);

  const close = () => {
    const s = sheet;
    if (!s) return;
    sheet = null;
    stopWatch?.();
    stopWatch = null;
    s.classList.remove("in");
    s.classList.add("out");
    setTimeout(() => s.remove(), 220);
    document.removeEventListener("keydown", onKey, true);
    lastFocus?.focus?.({ preventScroll: true });
  };
  const onKey = (e: KeyboardEvent) => {
    if (!sheet) return;
    if (e.key === "Escape") return close();
    if (e.key === "Tab") {
      const f = [...sheet.querySelectorAll<HTMLElement>("a[href],button:not([disabled])")];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) (e.preventDefault(), f[f.length - 1]!.focus());
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) (e.preventDefault(), f[0]!.focus());
    }
  };
  const open = () => {
    if (sheet) return;
    lastFocus = document.activeElement as HTMLElement | null;
    const s = document.createElement("div");
    s.className = "lds-sheet" + (contained ? " contained" : "");
    s.innerHTML = paySheetMarkup(data);
    s.addEventListener("click", async (e) => {
      const t = e.target as HTMLElement;
      if (t === s || t.closest("[data-lds-close]")) return close();
      const cp = t.closest<HTMLButtonElement>("[data-lds-copy]");
      if (cp) {
        const ok = await copyText(cp.dataset.ldsCopy || "");
        cp.classList.toggle("ok", ok);
        cp.setAttribute("aria-label", ok ? "Copied" : "Copy failed");
        cp.innerHTML = ok ? ICON_CHECK : ICON_COPY;
        setTimeout(() => {
          cp.classList.remove("ok");
          cp.innerHTML = ICON_COPY;
          cp.setAttribute("aria-label", "Copy address");
        }, 1600);
      }
    });
    sheetHost.appendChild(s);
    sheet = s;
    requestAnimationFrame(() => s.classList.add("in"));
    document.addEventListener("keydown", onKey, true);
    (s.querySelector("[data-lds-close]") as HTMLElement | null)?.focus({ preventScroll: true });

    // F11: watch the founder's address and confirm the pre-order on-chain (real pages only, never the preview).
    const price = priceParts(data.landing, data.bchUsd, data.currency || "");
    const want = price.bch ? Math.round(Number(price.bch) * 1e8) : 0;
    if (!contained && !data.demo && data.founderAddress && want > 0) {
      stopWatch = watchPayment(data.founderAddress, Math.floor(want * 0.99), (tx) => {
        if (sheet !== s) return;
        const main = s.querySelector<HTMLElement>("[data-lds-sheet-main]");
        if (!main) return;
        main.innerHTML = successMarkup(data, tx);
        if (!reducedMotion()) {
          const ring = main.querySelector<SVGCircleElement>(".lds-ok-ring");
          const fill = main.querySelector<SVGCircleElement>(".lds-ok-fill");
          const check = main.querySelector<SVGPathElement>(".lds-ok-check");
          const c = 2 * Math.PI * 26.5;
          if (ring) (ring.style.strokeDasharray = String(c)), ring.animate([{ strokeDashoffset: c }, { strokeDashoffset: 0 }], { duration: 420, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" });
          fill?.animate([{ opacity: 0, transform: "scale(.9)" }, { opacity: 1, transform: "scale(1)" }], { duration: 220, delay: 300, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" });
          if (check) (check.style.strokeDasharray = "30"), check.animate([{ strokeDashoffset: 30 }, { strokeDashoffset: 0 }], { duration: 240, delay: 300, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" });
        }
      });
    }
  };
  const onClick = (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-lds-pay]")) {
      e.preventDefault();
      open();
      return;
    }
    const a = t.closest<HTMLAnchorElement>("a[href^='#']");
    if (a) {
      e.preventDefault();
      const id = a.getAttribute("href")!.slice(1);
      const el = id === "top" ? root.querySelector(".lds") : root.querySelector(`#${CSS.escape(id)}`);
      el?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    }
  };
  root.addEventListener("click", onClick);

  // M13: hero stagger, then sections reveal once on scroll. JS-only, so static exports never hide content.
  if (!contained && !reducedMotion()) {
    const ease = "cubic-bezier(.22,1,.36,1)";
    root.querySelectorAll<HTMLElement>("[data-lds-in]").forEach((el, i) =>
      el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 80 + i * 70, easing: ease, fill: "backwards" }),
    );
    root.querySelector<HTMLElement>(".lds-band-tiles")?.animate([{ transform: "scale(1.02)" }, { transform: "scale(1)" }], { duration: 700, easing: ease });
    if ("IntersectionObserver" in window) {
      const secs = [...root.querySelectorAll<HTMLElement>("[data-lds-reveal]")].filter((el) => el.getBoundingClientRect().top > innerHeight * 0.9);
      secs.forEach((el) => el.classList.add("lds-pre"));
      const io = new IntersectionObserver(
        (entries) => {
          let n = 0;
          for (const en of entries) {
            if (!en.isIntersecting) continue;
            const el = en.target as HTMLElement;
            io.unobserve(el);
            el.style.transitionDelay = `${n++ * 60}ms`;
            el.classList.remove("lds-pre");
          }
        },
        { threshold: 0.2 },
      );
      secs.forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
    }
  }

  return () => {
    root.removeEventListener("click", onClick);
    cleanups.forEach((f) => f());
    close();
  };
}
