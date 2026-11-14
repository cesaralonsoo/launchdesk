// The generated landing page. Used by the public /s/:slug route and by the pack's previews.
import type { SiteData } from "../types";
import { renderIcon, renderLogoTile } from "../pack/logo";
import { brandColors, esc, mix } from "../pack/util";
import siteCss from "./site.css?inline";
import { BCH_BADGE, bchAmount, bchMark, copyText, paymentUri, qrSvg } from "./qr";

const STYLE_ID = "ld-site-css";
export function ensureSiteCss(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = siteCss;
  document.head.appendChild(s);
}
export const SITE_CSS: string = siteCss;

export const ICON_CHECK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>`;
const ICON_TAG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.4 1.4 0 0 1 0 2l-7.1 7.1a1.4 1.4 0 0 1-2 0z"/><circle cx="8.3" cy="8.3" r="1.6" fill="currentColor"/></svg>`;
const ICON_SHIELD = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12 2.2 2.2 4.4-4.4"/></svg>`;
const ICON_X = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
const LD_MARK = `<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c3.6 2.6 5.4 6.2 5.4 10.4l-2.4 3.4H9l-2.4-3.4C6.6 8.7 8.4 5.1 12 2.5z" fill="#0AC18E"/><circle cx="12" cy="10" r="2" fill="#0B0F15"/><path d="M9.5 18h5l-2.5 4z" fill="#F5C542"/></svg>`;

export function brandVars(data: Pick<SiteData, "palette">): string {
  const c = brandColors(data.palette);
  const soft = mix(c.accent, c.bg, 0.8);
  const line = mix(c.ink, c.bg, 0.86);
  return `--b-bg:${c.bg};--b-ink:${c.ink};--b-muted:${c.muted};--b-primary:${c.primary};--b-on-primary:${c.onPrimary};--b-accent:${c.accent};--b-on-accent:${c.onAccent};--b-extra:${c.extra};--b-soft:${soft};--b-line:${line}`;
}

/**
 * One source of truth for the pre-order price: the offer's own currency first ("€29"),
 * then the USD / BCH conversion the QR actually charges.
 */
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

export function priceParts(L: SiteData["landing"], bchUsd: number) {
  const usd = Number(L.price_hint_usd) || 0;
  const m = (L.offer || "").match(/([€£$])\s?(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?(€|EUR|£|GBP)/);
  const sym = m ? (m[1] ?? (m[4] === "EUR" ? "€" : m[4] === "GBP" ? "£" : m[4])) : "";
  const local = m && sym !== "$" ? `${sym}${m[2] ?? m[3]}` : "";
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

const FEATURE_ICONS: Array<[RegExp, string]> = [
  [/pass|member|subscri|month|weekday|loyal/i, "star"],
  [/fast|quick|minute|second|ahead|queue|wait|express/i, "bolt"],
  [/bean|roast|origin|organic|fresh|local|farm|natural|green|plant/i, "leaf"],
  [/coffee|cup|tea|espresso|latte/i, "cup"],
  [/deliver|ride|bike/i, "bike"],
  [/home|house|neighbo/i, "home"],
  [/learn|course|book|lesson/i, "book"],
  [/food|taco|eat|meal|kitchen/i, "fork"],
  [/shop|store|buy/i, "shop"],
  [/love|care|friendly/i, "heart"],
];

/** A distinct, on-theme icon per feature card. */
function featureIcons(bullets: string[], logoIcon: string): string[] {
  const used = new Set<string>();
  return bullets.map((b, i) => {
    const hit = FEATURE_ICONS.find(([re, ic]) => re.test(b) && !used.has(ic) && (i > 0 || ic !== logoIcon));
    const pick = i === 0 && !hit ? logoIcon : hit?.[1] ?? ["spark", "heart", "star", "globe"].find((x) => !used.has(x) && x !== logoIcon) ?? "spark";
    used.add(pick);
    return pick;
  });
}

/** Static markup of the landing page (no behaviour). `homeHref` is where "Made with LaunchDesk" points. */
export function landingMarkup(data: SiteData, opts: { homeHref?: string } = {}): string {
  const c = brandColors(data.palette);
  const L = data.landing;
  const name = data.name || "Your brand";
  const bullets = (L.bullets || []).slice(0, 3);
  const icon = data.logo?.icon ?? "spark";
  const price = priceParts(L, data.bchUsd);
  const usd = price.usd;
  const amount = price.bch;
  const offer = splitOffer(L.offer || "");
  const icons = featureIcons(bullets, icon);
  const homeHref = opts.homeHref ?? "/";
  const year = new Date().getFullYear();
  const cta = esc(L.cta || "Pre-order · Pay with BCH");

  return `
<div class="lds" style="${brandVars(data)}">
  <div class="lds-wrap">
    <nav class="lds-nav">
      <a class="lds-brand" href="#top">${renderLogoTile(data.logo, data.palette, name, 38)}<span>${esc(name)}</span></a>
      <div class="lds-navlinks">
        <a class="hide-sm" href="#lds-features">Why ${esc(name)}</a>
        <a class="hide-sm" href="#lds-how">How pre-orders work</a>
        <button class="lds-pill" data-lds-pay type="button">Pre-order</button>
      </div>
    </nav>

    <section class="lds-hero" id="top">
      <div>
        <span class="lds-eyebrow"><i></i>${esc(data.tagline || "Pre-orders open")}</span>
        <h1 class="lds-h1">${esc(L.headline)}</h1>
        <p class="lds-sub">${esc(L.subheadline)}</p>
        <div class="lds-ctas">
          <button class="lds-cta" data-lds-pay type="button">${bchMark(24, true)}<span>${cta}</span></button>
          ${L.offer ? `<span class="lds-offer">${ICON_TAG}${esc(L.offer)}</span>` : ""}
        </div>
        <div class="lds-trust">
          ${usd ? `<span>${ICON_CHECK}Pre-order: ${esc(price.short)}${amount ? ` ≈ ${(Number(amount) || 0).toFixed(3)} BCH` : ""}</span>` : ""}
          <span>${ICON_SHIELD}${data.demo ? "Local test · demo address" : `Paid straight to ${esc(name)}'s wallet`}</span>
        </div>
      </div>
      <div class="lds-visual" aria-hidden="true">
        <span class="lds-ring r1"></span><span class="lds-ring r2"></span>
        <span class="lds-bigicon">${renderIcon(icon, c.bg === "#ffffff" ? "#ffffff" : mix(c.bg, "#ffffff", 0.4), 132, c.accent)}</span>
        <div class="lds-float f1">${renderLogoTile(data.logo, data.palette, name, 40)}<div>${esc(name)}<small>${esc(data.tagline || "")}</small></div></div>
        ${usd ? `<div class="lds-float f2"><div><small>Pre-order</small><b>${esc(price.short)}</b></div></div>` : ""}
      </div>
    </section>

    <section class="lds-features" id="lds-features">
      ${bullets.map((b, i) => `<div class="lds-feature"><div class="n">${renderIcon(icons[i], c.onPrimary, 20, c.primary)}</div><h3>${esc(b)}</h3></div>`).join("")}
    </section>

    <section class="lds-band">
      <div><h2>${esc(offer.head || `Be first in line at ${name}.`)}</h2>${offer.was ? `<p class="lds-was"><s>${esc(offer.was)}</s></p>` : ""}<p>Reserve yours today. Pay in Bitcoin Cash in a few seconds, from any BCH wallet.</p></div>
      <button class="lds-cta" data-lds-pay type="button">${bchMark(24, true)}<span>${cta}</span></button>
    </section>

    <section class="lds-how" id="lds-how">
      <div class="lds-kicker">How pre-orders work</div>
      <h2>Three taps. No card, no middleman.</h2>
      <div class="lds-steps">
        <div class="lds-step"><b>Tap “Pre-order”</b><span>You see the exact price in dollars and in BCH.</span></div>
        <div class="lds-step"><b>Scan with any BCH wallet</b><span>Selene, Paytaca, Cashonize, Electron Cash…</span></div>
        <div class="lds-step"><b>Paid to ${esc(name)} directly</b><span>The payment goes straight to the founder's own wallet.</span></div>
      </div>
    </section>
  </div>
  <footer class="lds-foot">
    <div class="lds-wrap">
      <span>© ${year} ${esc(name)}</span>
      <a class="lds-made" href="${esc(homeHref)}" target="_blank" rel="noopener"><i>${LD_MARK}</i>Made with LaunchDesk</a>
    </div>
  </footer>
</div>`;
}

/** The pay sheet content (QR to the founder's address). */
export function paySheetMarkup(data: SiteData): string {
  const price = priceParts(data.landing, data.bchUsd);
  const usd = price.usd;
  const amount = price.bch;
  const addr = (data.founderAddress || "").trim();
  const uri = addr ? paymentUri(addr, amount) : "";
  const shown = addr.replace(/^bitcoincash:/, "");
  return `
<div class="lds-sheet-card" role="dialog" aria-modal="true" aria-label="Pre-order with Bitcoin Cash">
  <button class="lds-sheet-x" type="button" data-lds-close aria-label="Close">${ICON_X}</button>
  <div class="lds-sheet-head">${renderLogoTile(data.logo, data.palette, data.name, 44)}<div><b>Pre-order ${esc(data.name)}</b><small>${esc(data.landing.offer || data.tagline || "")}</small></div></div>
  ${usd ? `<div class="lds-amount"><b>${esc(price.short)}</b>${price.short !== `$${usd.toFixed(2)}` ? `<span>≈ $${usd.toFixed(2)}</span>` : ""}${amount ? `<span>${amount} BCH</span>` : ""}</div>` : `<div style="height:14px"></div>`}
  ${addr ? `
  <div class="lds-qrbox">${qrSvg(uri, { size: 216, badge: `<circle cx="50" cy="50" r="50" fill="#fff"/><g transform="translate(8 8) scale(.84)">${BCH_BADGE}</g>`, label: "Bitcoin Cash payment QR" })}</div>
  <div class="lds-scan">Scan with any Bitcoin Cash wallet</div>
  <div class="lds-addr"><code title="${esc(addr)}">${esc(shown)}</code><button class="lds-copy" type="button" data-lds-copy="${esc(addr)}">Copy address</button></div>
  <a class="lds-open" href="${esc(uri)}">${bchMark(20, true)}Open in wallet app</a>
  ${data.demo
    ? `<div class="lds-direct lds-demo">${ICON_SHIELD}<span><b>Local test · demo address.</b> This page was generated without a connected wallet, so the QR shows a placeholder address. Don't pay it.</span></div>`
    : `<div class="lds-direct">${ICON_SHIELD}<span>This payment goes straight to ${esc(data.name)}'s own wallet. LaunchDesk never holds customers' money.</span></div>`}
  ` : `<div class="lds-noaddr">Pre-orders open soon: the founder hasn't connected a wallet yet.</div>`}
</div>`;
}


/**
 * Wire up the pay buttons inside `root`. The sheet opens over `sheetHost`
 * (document.body for the real page, the phone screen for the pack preview).
 */
export function wireLanding(root: HTMLElement, data: SiteData, sheetHost: HTMLElement = document.body): () => void {
  let sheet: HTMLElement | null = null;
  const contained = sheetHost !== document.body;

  const close = () => {
    const s = sheet;
    if (!s) return;
    sheet = null;
    s.classList.remove("in");
    setTimeout(() => s.remove(), 200);
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  const open = () => {
    if (sheet) return;
    const s = document.createElement("div");
    s.className = "lds-sheet" + (contained ? " contained" : "");
    s.innerHTML = paySheetMarkup(data);
    s.addEventListener("click", async (e) => {
      const t = e.target as HTMLElement;
      if (t === s || t.closest("[data-lds-close]")) return close();
      const cp = t.closest<HTMLButtonElement>("[data-lds-copy]");
      if (cp) {
        const ok = await copyText(cp.dataset.ldsCopy || "");
        cp.textContent = ok ? "Copied" : "Copy failed";
        cp.classList.toggle("ok", ok);
        setTimeout(() => { cp.textContent = "Copy address"; cp.classList.remove("ok"); }, 1600);
      }
    });
    sheetHost.appendChild(s);
    sheet = s;
    requestAnimationFrame(() => s.classList.add("in"));
    document.addEventListener("keydown", onKey);
    (s.querySelector("[data-lds-close]") as HTMLElement | null)?.focus({ preventScroll: true });
  };
  const onClick = (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-lds-pay]")) { e.preventDefault(); open(); return; }
    const a = t.closest<HTMLAnchorElement>("a[href^='#']");
    if (a) {
      e.preventDefault();
      const id = a.getAttribute("href")!.slice(1);
      const el = id === "top" ? root.querySelector(".lds") : root.querySelector(`#${CSS.escape(id)}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  root.addEventListener("click", onClick);
  return () => { root.removeEventListener("click", onClick); close(); };
}
