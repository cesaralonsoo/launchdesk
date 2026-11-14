// Startup pack modal: openPack(project, tab?) / closePack().
import type { Project, SiteData } from "../types";
import { ensureSiteCss, SITE_CSS, wireLanding } from "../site/landing";
import { copyText } from "../site/qr";
import { wireCharts } from "./charts";
import { renderLogoTile } from "./logo";
import packCss from "./pack.css?inline";
import { brandOf, ICON, renderTab, siteDataOf, TABS, tabState, type TabId } from "./tabs";
import { esc, usd } from "./util";

export { renderLogo, renderIcon, renderLogoTile } from "./logo";
export type { TabId } from "./tabs";

const STYLE_ID = "ld-pack-css";
const FONTS = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap";

function ensureCss(): void {
  ensureSiteCss();
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = packCss;
    document.head.appendChild(s);
  }
  const links = [...document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")];
  if (!links.some((l) => /JetBrains/.test(l.href))) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = FONTS;
    document.head.appendChild(l);
  }
}

/** Accepts tab ids, labels, live-output tile names and department ids. */
function normalizeTab(tab: string | undefined): TabId | null {
  if (!tab) return null;
  const t = tab.toLowerCase().trim().replace(/[\s_-]+/g, " ");
  const map: Record<string, TabId> = {
    opportunity: "opportunity", leo: "opportunity", score: "opportunity", market: "opportunity",
    plan: "plan", mia: "plan", brief: "plan",
    model: "model", "business model": "model", sam: "model", numbers: "model", finance: "model",
    brand: "brand", name: "brand", logo: "brand", nova: "brand", identity: "brand",
    landing: "landing", "landing page": "landing", dex: "landing", pip: "landing", site: "landing", live: "landing",
    launch: "launch", rae: "launch", calendar: "launch",
    receipt: "receipt", payments: "receipt", lobby: "receipt",
  };
  return map[t] ?? null;
}

type State = {
  project: Project;
  tab: TabId;
  overlay: HTMLElement;
  body: HTMLElement;
  site: { founderAddress?: string; bchUsd?: number; loading?: boolean };
  cleanups: Array<() => void>;
  lastFocus: Element | null;
  ro?: ResizeObserver;
};
let S: State | null = null;

function headerHtml(p: Project): string {
  const b = brandOf(p);
  const stage2 = !!p.payments.build;
  const allDone = !!p.results.pip;
  const s1Done = !!(p.results.mia && p.results.leo && p.results.sam);
  const kicker = allDone ? "Delivered · Stage 1 + 2" : stage2 ? "In progress · Stage 2" : s1Done ? "Delivered · Stage 1" : "In progress · Stage 1";
  const title = allDone ? "Your startup pack is ready" : s1Done && !stage2 ? "Your Stage 1 report" : "Your startup pack";
  const one = p.results.mia?.one_liner || b.tagline || p.idea;
  const tile = p.results.nova
    ? renderLogoTile(b.logo, b.option?.palette, b.name, 64)
    : `<span class="ld-logotile" style="width:64px;height:64px;border-radius:16px;background:linear-gradient(140deg,#1B2431,#0E141C);display:grid;place-items:center;font-family:Sora,sans-serif;font-weight:800;font-size:26px;color:#0FD9A0">${esc((b.name[0] || "L").toUpperCase())}</span>`;
  return `${tile}
    <div class="ldp-headtxt">
      <div class="ldp-kicker${allDone || (s1Done && !stage2) ? "" : " wip"}">${esc(kicker)}</div>
      <h2 class="ldp-title" id="ldp-title">${esc(title)}</h2>
      <p class="ldp-sub"><b>${esc(b.name)}</b> · ${esc(one)}</p>
      ${p.results.pip ? `<a class="ldp-livechip" href="/s/${esc(p.results.pip.slug)}" target="_blank" rel="noopener"><i></i>Live at /s/${esc(p.results.pip.slug)} ↗</a>` : ""}
    </div>
    <button class="ldp-x" type="button" data-close aria-label="Close pack"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
}

function tabsHtml(p: Project, active: TabId): string {
  return TABS.map((t) => {
    const st = tabState(p, t.id);
    const locked = st === "locked";
    return `<button class="ldp-tab${locked ? " locked" : ""}" role="tab" type="button" data-tab="${t.id}" aria-selected="${t.id === active}" style="--c:${t.color}"><i></i>${esc(t.label)}${locked ? ICON.lock : ""}</button>`;
  }).join("");
}

/** The most impressive result first: the live site taking BCH pre-orders. */
function liveBtn(p: Project): string {
  const slug = p.results.pip?.slug;
  if (!slug) return "";
  return `<a class="ldp-btn primary" href="/s/${esc(slug)}" target="_blank" rel="noopener">Open live site ↗</a>`;
}

function footNote(p: Project): string {
  const paid = (["validate", "build"] as const).filter((s) => p.payments[s]);
  const realStages = paid.filter((s) => !p.payments[s]!.txid.startsWith("dev-"));
  const cents = realStages.reduce((a, s) => a + (p.payments[s]!.cents || 0), 0);
  const real = realStages.length;
  if (!paid.length) return "AI estimates are labelled as estimates";
  if (!real) return "Local test · no on-chain payments · AI estimates are labelled";
  return `${real} on-chain payment${real === 1 ? "" : "s"} · ${usd(cents)} total · AI estimates are labelled`;
}

function renderBody(): void {
  if (!S) return;
  const { project: p, tab, body } = S;
  S.cleanups.splice(0).forEach((f) => f());
  S.ro?.disconnect();
  body.innerHTML = `<div class="ldp-panel" role="tabpanel" aria-labelledby="ldp-tab-${tab}">${renderTab(p, tab, { ...S.site, origin: location.origin })}</div>`;
  body.scrollTop = 0;
  wireCharts(body);
  if (tab === "landing") wireLandingPreviews(body);
}

function currentSite(): SiteData | null {
  return S ? siteDataOf(S.project, S.site) : null;
}

function wireLandingPreviews(body: HTMLElement): void {
  if (!S) return;
  const data = currentSite();
  const phone = body.querySelector<HTMLElement>("[data-phone]");
  const host = body.querySelector<HTMLElement>("[data-phone-host]");
  if (data && phone && host) S.cleanups.push(wireLanding(phone, data, host));
  const desk = body.querySelector<HTMLElement>("[data-desk]");
  if (desk?.parentElement) {
    const box = desk.parentElement;
    const fit = () => {
      const z = Math.max(0.2, box.clientWidth / 1280);
      desk.style.zoom = String(z);
      box.style.height = `${Math.round(700 * z)}px`;
    };
    fit();
    S.ro = new ResizeObserver(fit);
    S.ro.observe(box);
  }
}

async function loadSite(p: Project): Promise<void> {
  const slug = p.results.pip?.slug;
  if (!slug || !S) return;
  S.site.loading = true;
  try {
    const r = await fetch(`/api/sites/${encodeURIComponent(slug)}`, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(String(r.status));
    const d = (await r.json()) as Partial<SiteData>;
    if (!S || S.project.id !== p.id) return;
    S.site = { founderAddress: d.founderAddress || "", bchUsd: Number(d.bchUsd) || 0, loading: false };
  } catch {
    if (!S || S.project.id !== p.id) return;
    S.site.loading = false;
  }
  if (S.tab === "landing" || S.tab === "receipt") renderBody();
}

function toast(msg: string): void {
  const el = S?.overlay.querySelector<HTMLElement>(".ldp-toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("on");
  clearTimeout(Number(el.dataset.t));
  el.dataset.t = String(setTimeout(() => el.classList.remove("on"), 1600));
}

/** Scrolls the tab strip (never the page) so the active tab sits in the middle, and updates the edge fades. */
function centerTab(smooth = false): void {
  if (!S) return;
  const bar = S.overlay.querySelector<HTMLElement>(".ldp-tabs");
  const tab = bar?.querySelector<HTMLElement>('.ldp-tab[aria-selected="true"]');
  if (!bar || !tab) return;
  if (bar.scrollWidth > bar.clientWidth + 2) {
    const left = tab.offsetLeft - (bar.clientWidth - tab.offsetWidth) / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: smooth ? "smooth" : "auto" });
  }
  fadeTabs(bar);
}
function fadeTabs(bar: HTMLElement): void {
  const max = bar.scrollWidth - bar.clientWidth;
  bar.classList.toggle("fade-l", max > 2 && bar.scrollLeft > 4);
  bar.classList.toggle("fade-r", max > 2 && bar.scrollLeft < max - 4);
}

function setTab(id: TabId): void {
  if (!S || S.tab === id) return;
  S.tab = id;
  S.overlay.querySelectorAll<HTMLElement>(".ldp-tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === id)));
  centerTab(true);
  renderBody();
}

function onKey(e: KeyboardEvent): void {
  if (!S) return;
  if (e.key === "Escape") {
    if (S.overlay.querySelector(".lds-sheet")) return; // the landing sheet handles its own Escape
    e.preventDefault();
    closePack();
    return;
  }
  const t = e.target as HTMLElement;
  if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && t.classList.contains("ldp-tab")) {
    const ids = TABS.map((x) => x.id);
    const i = ids.indexOf(S.tab);
    const next = ids[(i + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
    setTab(next);
    S.overlay.querySelector<HTMLElement>(`.ldp-tab[data-tab="${next}"]`)?.focus();
  }
  if (e.key === "Tab") {
    const f = [...S.overlay.querySelectorAll<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])")].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
}

/** Open the pack modal for a project. `tab` accepts a tab id, label, tile name or department id. */
export function openPack(project: Project, tab?: string): void {
  ensureCss();
  const wanted = normalizeTab(tab);
  if (S) {
    // already open: refresh in place (e.g. new results arrived while polling)
    const sameProject = S.project.id === project.id;
    S.project = project;
    S.overlay.querySelector(".ldp-head")!.innerHTML = headerHtml(project);
    S.overlay.querySelector(".ldp-tabs")!.innerHTML = tabsHtml(project, wanted ?? S.tab);
    requestAnimationFrame(() => centerTab(true));
    S.overlay.querySelector(".ldp-foot .note span")!.textContent = footNote(project);
    S.overlay.querySelector(".ldp-foot [data-live]")!.innerHTML = liveBtn(project);
    if (!sameProject) S.site = {};
    S.tab = wanted ?? S.tab;
    renderBody();
    if (!sameProject || !S.site.founderAddress) void loadSite(project);
    return;
  }
  const first = wanted ?? (TABS.find((t) => tabState(project, t.id) === "ready" && t.id !== "receipt")?.id ?? "receipt");
  const overlay = document.createElement("div");
  overlay.className = "ldp-overlay";
  overlay.innerHTML = `
    <div class="ldp" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="ldp-title">
      <header class="ldp-head">${headerHtml(project)}</header>
      <nav class="ldp-tabs" role="tablist" aria-label="Pack sections">${tabsHtml(project, first)}</nav>
      <div class="ldp-body"></div>
      <footer class="ldp-foot">
        <div class="note"><i></i><span>${esc(footNote(project))}</span></div>
        <button class="ldp-newlink" type="button" data-new>Start a new idea</button>
        <button class="ldp-btn" type="button" data-download><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/></svg>Download pack</button>
        <span data-live>${liveBtn(project)}</span>
      </footer>
      <div class="ldp-toast" role="status" aria-live="polite"></div>
    </div>`;
  document.body.appendChild(overlay);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  S = {
    project, tab: first, overlay, body: overlay.querySelector(".ldp-body")!, site: {}, cleanups: [], lastFocus: document.activeElement,
  };
  overlay.dataset.prevOverflow = prevOverflow;

  overlay.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    if (t === overlay || t.closest("[data-close]")) return closePack();
    const tb = t.closest<HTMLElement>("[data-tab]");
    if (tb) return setTab(tb.dataset.tab as TabId);
    if (t.closest("[data-download]")) { downloadPack(); toast("Pack downloaded"); return; }
    if (t.closest("[data-new]")) { closePack(); navigateHome(); return; }
    const cp = t.closest<HTMLElement>("[data-copy]");
    if (cp) {
      const ok = await copyText(cp.dataset.copy || "");
      if (cp.classList.contains("ldp-copy")) {
        cp.textContent = ok ? "Copied" : "Copy failed";
        cp.classList.toggle("ok", ok);
        setTimeout(() => { cp.textContent = "Copy text"; cp.classList.remove("ok"); }, 1500);
      } else toast(ok ? `Copied ${cp.dataset.copy}` : "Copy failed");
    }
  });
  document.addEventListener("keydown", onKey);
  const bar = overlay.querySelector<HTMLElement>(".ldp-tabs")!;
  bar.addEventListener("scroll", () => fadeTabs(bar), { passive: true });
  renderBody();
  requestAnimationFrame(() => centerTab());
  requestAnimationFrame(() => {
    overlay.classList.add("in");
    overlay.querySelector<HTMLElement>(".ldp")?.focus({ preventScroll: true });
  });
  void loadSite(project);
}

export function closePack(): void {
  if (!S) return;
  const { overlay, lastFocus } = S;
  S.cleanups.forEach((f) => f());
  S.ro?.disconnect();
  document.removeEventListener("keydown", onKey);
  document.body.style.overflow = overlay.dataset.prevOverflow ?? "";
  S = null;
  overlay.classList.remove("in");
  setTimeout(() => overlay.remove(), 220);
  if (lastFocus instanceof HTMLElement) lastFocus.focus({ preventScroll: true });
}

export function isPackOpen(): boolean {
  return !!S;
}

/**
 * "Start a new idea": fires a cancelable `launchdesk:new-idea` event so the app can route in place
 * (call preventDefault); otherwise does a full navigation to "/".
 */
function navigateHome(): void {
  const ev = new CustomEvent("launchdesk:new-idea", { cancelable: true });
  if (window.dispatchEvent(ev)) location.assign("/");
}

// ---------- download ----------

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
}

/** Builds a self-contained HTML document with every section of the pack. */
export function buildPackHtml(p: Project, site: { founderAddress?: string; bchUsd?: number } = {}): string {
  const b = brandOf(p);
  const origin = typeof location !== "undefined" ? location.origin : "";
  const sections = TABS.filter((t) => tabState(p, t.id) === "ready").map((t) =>
    `<section class="ldp-docsec"><h2 class="ldp-doch" style="--c:${t.color}"><i></i>${esc(t.label)}</h2>${renderTab(p, t.id, { ...site, origin })}</section>`,
  ).join("");
  const generated = new Date().toUTCString();
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(b.name)} — Startup pack · LaunchDesk</title>
<link rel="stylesheet" href="${FONTS}">
<style>${packCss}\n${SITE_CSS}\n.ldp--doc .ldp-zoom-desk{zoom:.62}.ldp--doc .ldp-desk{height:400px}.ldp-panel{animation:none}</style>
</head><body class="ldp-docbody">
<div class="ldp ldp--doc">
  <header class="ldp-head">${headerHtml(p)}</header>
  <div class="ldp-body">${sections}</div>
  <div class="ldp-docfoot"><span>Generated with LaunchDesk · ${esc(generated)}</span><span>Only stage payments are on-chain; department budgets are internal. AI estimates are labelled.</span></div>
</div>
</body></html>`;
}

function downloadPack(): void {
  if (!S) return;
  const html = buildPackHtml(S.project, S.site);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(brandOf(S.project).name)}-launchdesk-pack.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
