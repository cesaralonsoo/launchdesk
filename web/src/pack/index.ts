// Startup pack: a full-screen document with a side rail (spec-v4 L37–L39, R10–R23, F5, F8, M12). Owner: WS4.
// openPack(project, {section, readOnly, banner}) / closePack() / isPackOpen() / buildPackHtml() (contracts-v4.md).
import { api } from "../api";
import { countPreorders } from "../site";
import { ensureSiteCss, wireLanding } from "../site/landing";
import { copyText } from "../site/qr";
import { normalize, type Preorders, type Project, type WorkDept } from "../types";
import { renderMark } from "./logo";
import packCss from "./pack.css?inline";
import { brandOf, ICON, renderDocument, renderSection, SECTIONS, sectionState, siteDataOf, type PackSection, type RenderCtx } from "./tabs";
import { brandColors, contrast, esc, fontsHref, fontStack, loadFonts, usd } from "./util";

export { renderLogo, renderIcon, renderLogoTile, renderMark, renderWordmark } from "./logo";
export { sparkline, cashChart, scoreRing, positioningMap } from "./charts";
export { loadFonts } from "./util";
export type { TabId } from "./tabs";
export type { PackSection } from "./tabs";
export { normalize } from "../types";

/** The 8 pack sections of the rail (spec-v4 L38), in order. */
export const PACK_SECTIONS: readonly PackSection[] = SECTIONS.map((s) => s.id);
/** Department → the pack section that shows its work (tiles, Now card "Open in your pack →", stepper). */
export const DEPT_SECTION: Record<WorkDept, PackSection> = {
  mia: "plan", leo: "market", sam: "numbers", nova: "brand", dex: "brand", rae: "launch", pip: "website",
};
export type PackOpenOpts = {
  /** Section to scroll to. Default: Summary. */
  section?: PackSection;
  /** L39: shared report or example pack. Hides pay/build/share actions; Download only. */
  readOnly?: boolean;
  /** L39: 40px banner on top. "example" = "Example pack, made for $0.30 · Start yours"; "share" = "Shared report, read only". */
  banner?: "example" | "share" | null;
};

const STYLE_ID = "ld-pack-css";
const UI_FONTS = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap";
const CHECKS_KEY = (id: string) => `launchdesk-pack-checks:${id}`;

function ensureCss(): void {
  ensureSiteCss();
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = packCss;
    document.head.appendChild(s);
  }
}

/** Accepts v4 section ids plus v3 tab ids, labels, tile names and department ids. */
function toSection(tab: string | undefined): PackSection | null {
  if (!tab) return null;
  const t = tab.toLowerCase().trim().replace(/[\s_-]+/g, " ");
  const map: Record<string, PackSection> = {
    summary: "summary", memo: "summary", report: "summary",
    market: "market", opportunity: "market", leo: "market", score: "market", research: "market",
    plan: "plan", mia: "plan", brief: "plan", checklist: "plan",
    numbers: "numbers", model: "numbers", "business model": "numbers", sam: "numbers", finance: "numbers",
    brand: "brand", name: "brand", logo: "brand", nova: "brand", dex: "brand", identity: "brand",
    website: "website", landing: "website", "landing page": "website", pip: "website", site: "website", live: "website",
    launch: "launch", rae: "launch", calendar: "launch",
    receipt: "receipt", payments: "receipt", lobby: "receipt",
  };
  return map[t] ?? null;
}

const readChecks = (id: string): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(CHECKS_KEY(id)) || "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
};
const writeChecks = (id: string, v: Record<string, boolean>) => {
  try {
    localStorage.setItem(CHECKS_KEY(id), JSON.stringify(v));
  } catch {
    /* private mode: the ticks just don't persist */
  }
};
const reducedMotion = () => {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

type State = {
  project: Project;
  opts: PackOpenOpts;
  overlay: HTMLElement;
  scroller: HTMLElement;
  doc: HTMLElement;
  active: PackSection;
  site: { founderAddress?: string; bchUsd?: number; loading?: boolean; demo?: boolean };
  preorders: Preorders | null;
  checks: Record<string, boolean>;
  cleanups: Array<() => void>;
  lastFocus: Element | null;
  ro?: ResizeObserver;
  spyLock: number;
};
let S: State | null = null;

const readOnlyOf = (p: Project, o: PackOpenOpts) => !!(o.readOnly || p.example || o.banner);
const bannerOf = (p: Project, o: PackOpenOpts) => o.banner ?? (p.example ? "example" : null);

function ctxOf(st: State): RenderCtx {
  return {
    ...st.site,
    origin: location.origin,
    readOnly: readOnlyOf(st.project, st.opts),
    checks: st.checks,
    preorders: st.preorders,
  };
}

// ---------- markup ----------

function nameColor(p: Project): string {
  const c = brandColors(brandOf(p).option?.palette);
  return contrast(c.primary, "#ffffff") >= 3 ? c.primary : "#1D1D1F";
}

function logoHtml(p: Project, size: number): string {
  const b = brandOf(p);
  if (p.results.nova) return renderMark(b.logo, b.option?.palette, b.name, size, b.fonts);
  return `<span class="ld-mark ldp-mono" style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.26)}px;font-size:${Math.round(size * 0.42)}px">${esc((b.name[0] || "L").toUpperCase())}</span>`;
}

function actionsHtml(p: Project, ro: boolean, compact = false): string {
  const slug = p.results.pip?.slug;
  return `${slug ? `<a class="ldp-btn ${compact ? "sm" : ""}" href="/s/${esc(slug)}" target="_blank" rel="noopener">Open site${ICON.ext}</a>` : ""}
    ${ro ? "" : `<button class="ldp-btn ${compact ? "sm" : ""}" type="button" data-share>Share</button>`}
    <div class="ldp-menuwrap"><button class="ldp-iconbtn lg" type="button" data-menu="dl" aria-haspopup="menu" aria-label="Download" title="Download">${ICON.download}</button>
      <div class="ldp-menu" role="menu" data-menu-for="dl" hidden><button role="menuitem" type="button" data-pdf>Download PDF</button><button role="menuitem" type="button" data-html>Download HTML</button></div></div>`;
}

function headHtml(p: Project, ro: boolean): string {
  const b = brandOf(p);
  const one = b.tagline || p.results.mia?.one_liner || p.idea;
  const font = p.results.nova ? `font-family:${esc(fontStack(b.fonts.display))};` : "";
  return `${logoHtml(p, 64)}
    <div class="ldp-headtxt"><h1 class="ldp-name" id="ldp-name" style="${font}color:${nameColor(p)}">${esc(b.name)}</h1><p class="ldp-tag">${esc(one)}</p></div>
    <div class="ldp-actions">${actionsHtml(p, ro)}</div>`;
}

function railHtml(p: Project, active: PackSection, buildCents: number): string {
  let rows = "";
  for (const s of SECTIONS) {
    const st = sectionState(p, s.id);
    if (s.id === "brand") rows += `<div class="ldp-railgrp">Build${p.payments.build || p.example ? "" : ` · ${usd(buildCents)}`}</div>`;
    const locked = st === "locked";
    rows += `<button class="ldp-rrow-btn${locked ? " locked" : ""}" type="button" role="tab" id="ldp-tab-${s.id}" aria-controls="ldp-s-${s.id}" aria-selected="${s.id === active}" tabindex="${s.id === active ? 0 : -1}" data-goto="${s.id}"><span>${s.label}</span>${locked ? ICON.lock : st === "working" ? `<i class="wk"></i>` : ""}</button>`;
  }
  return `<span class="ldp-ind" aria-hidden="true"></span>${rows}`;
}

function mfootHtml(p: Project, ro: boolean, buildCents: number): string {
  const slug = p.results.pip?.slug;
  const primary = slug
    ? `<a class="ldp-btn primary" href="/s/${esc(slug)}" target="_blank" rel="noopener">Open your site</a>`
    : !ro && p.results.sam && !p.payments.build
      ? `<button class="ldp-btn primary" type="button" data-build>Build it · ${usd(buildCents)}</button>`
      : `<span></span>`;
  return `${ro ? `<span></span>` : `<button class="ldp-iconbtn lg" type="button" data-share aria-label="Share">${ICON.share}</button>`}<button class="ldp-iconbtn lg" type="button" data-pdf aria-label="Download PDF">${ICON.download}</button>${primary}`;
}

const bannerHtml = (kind: "example" | "share" | null) =>
  kind === "example"
    ? `<div class="ldp-banner">Example pack, made for $0.30<span>·</span><button type="button" data-new>Start yours</button></div>`
    : kind === "share"
      ? `<div class="ldp-banner">Shared report, read only</div>`
      : "";

// ---------- behaviour ----------

function toast(msg: string): void {
  const el = S?.overlay.querySelector<HTMLElement>(".ldp-toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("on");
  clearTimeout(Number(el.dataset.t));
  el.dataset.t = String(setTimeout(() => el.classList.remove("on"), 2200));
}

function setActive(id: PackSection, fromSpy = false): void {
  if (!S) return;
  S.active = id;
  const rail = S.overlay.querySelector<HTMLElement>(".ldp-rail");
  const btns = [...(rail?.querySelectorAll<HTMLElement>("[role=tab]") ?? [])];
  btns.forEach((b) => {
    const on = b.dataset.goto === id;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  });
  const cur = btns.find((b) => b.dataset.goto === id);
  const ind = rail?.querySelector<HTMLElement>(".ldp-ind");
  if (cur && ind) ind.style.transform = `translateY(${cur.offsetTop}px)`;
  const i = SECTIONS.findIndex((s) => s.id === id);
  const m = S.overlay.querySelector<HTMLElement>(".ldp-mnav .lbl");
  if (m) m.innerHTML = `<b>${SECTIONS[i]!.label}</b>${ICON.chevron}<span>${i + 1} of ${SECTIONS.length}</span>`;
  if (!fromSpy) return;
}

/** Top of `el` in the scroller's content coordinates (offsetTop is relative to .ldp, not the scroller). */
function topIn(el: HTMLElement): number {
  const sc = S!.scroller;
  return el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
}

function goTo(id: PackSection, smooth = true): void {
  if (!S) return;
  let el = S.doc.querySelector<HTMLElement>(`#ldp-s-${id}`);
  if (!el) return;
  // Locked Build group: Brand, Website and Launch all land on the one locked block.
  if (el.dataset.alias) el = S.doc.querySelector<HTMLElement>(`#ldp-s-${el.dataset.alias}`) ?? el;
  // Summary always lands at the very top (full header, no half-cut title). Other sections land with
  // their heading 24px under the sticky bar.
  // The section hairline lands exactly on the sticky bar's own bottom border (56px desktop compact bar,
  // 44px phone nav), so no orphan line shows under the bar and the heading sits a section gap below it.
  const top = id === "summary" ? 0 : topIn(el) - (innerWidth >= 1100 ? 56 : 44) + 1;
  // Long smooth scrolls pass other sections: keep the clicked one until the scroll ends (scrollend, or 1.6s).
  S.spyLock = Date.now() + (smooth ? 1600 : 50);
  S.scroller.scrollTo({ top: Math.max(0, top), behavior: smooth && !reducedMotion() ? "smooth" : "auto" });
  setActive(id);
}

function onScroll(): void {
  if (!S) return;
  const y = S.scroller.scrollTop;
  // The compact bar takes over as soon as the 40px title would start to clip (no half-cut header).
  S.overlay.classList.toggle("scrolled", y > 28);
  if (Date.now() < S.spyLock) return;
  const line = y + (innerWidth >= 1100 ? 96 : 128);
  let cur: PackSection = "summary";
  for (const s of SECTIONS) {
    const el = S.doc.querySelector<HTMLElement>(`#ldp-s-${s.id}`);
    if (el && !el.dataset.alias && topIn(el) <= line) cur = s.id;
  }
  if (S.scroller.scrollTop + S.scroller.clientHeight >= S.scroller.scrollHeight - 4) cur = "receipt";
  if (cur !== S.active) setActive(cur, true);
}

function closeMenus(except?: Element | null): void {
  S?.overlay.querySelectorAll<HTMLElement>(".ldp-menu, .ldp-msheet").forEach((m) => {
    if (m !== except) m.hidden = true;
  });
}

function fitPreviews(): void {
  if (!S) return;
  S.doc.querySelectorAll<HTMLElement>("[data-fit]").forEach((box) => {
    const real = Number(box.dataset.fit) || 1280;
    const inner = box.firstElementChild as HTMLElement | null;
    if (!inner) return;
    const z = box.clientWidth / real;
    inner.style.transform = `scale(${z})`;
    box.style.height = `${Math.round(inner.offsetHeight * z)}px`;
  });
  S.doc.querySelectorAll<HTMLElement>(".ldp-stage.ig").forEach((st) => {
    const inner = st.querySelector<HTMLElement>(".ldp-scale");
    if (!inner) return;
    const z = Math.min(1, (st.clientWidth - 24) / 375);
    inner.style.transform = `scale(${z})`;
    st.style.height = `${Math.round(inner.offsetHeight * z) + 32}px`;
  });
}

function wireDoc(): void {
  if (!S) return;
  const st = S;
  st.cleanups.splice(0).forEach((f) => f());
  // live landing previews (phone handles its own pay sheet)
  const data = siteDataOf(st.project, st.site);
  const phone = st.doc.querySelector<HTMLElement>("[data-phone]");
  const host = st.doc.querySelector<HTMLElement>("[data-phone-host]");
  if (data && phone && host) st.cleanups.push(wireLanding(phone, data, host));
  const desk = st.doc.querySelector<HTMLElement>("[data-desk]");
  if (data && desk) st.cleanups.push(wireLanding(desk, data, desk));
  st.ro?.disconnect();
  st.ro = new ResizeObserver(() => fitPreviews());
  st.ro.observe(st.doc);
  fitPreviews();
  // pre-orders (F11): null = couldn't check → nothing shown
  const pip = st.project.results.pip;
  if (pip && st.site.founderAddress && st.preorders === null) {
    const id = st.project.id;
    void countPreorders(st.site.founderAddress, pip.live_at).then((po) => {
      if (!S || S.project.id !== id || !po) return;
      S.preorders = po;
      const box = S.doc.querySelector<HTMLElement>("[data-preorders]");
      if (box) box.innerHTML = renderPreorders(po, S.project);
    });
  }
}

function renderPreorders(po: Preorders, p: Project): string {
  // tiny indirection so the section renderer stays the single source of truth
  const tmp = document.createElement("div");
  tmp.innerHTML = renderSection({ ...p }, "website", { ...ctxOf(S!), preorders: po });
  return tmp.querySelector("[data-preorders]")?.innerHTML ?? "";
}

function renderAll(keepScroll = true): void {
  if (!S) return;
  const st = S;
  const y = st.scroller.scrollTop;
  const p = st.project;
  const ro = readOnlyOf(p, st.opts);
  const cents = 20;
  st.overlay.querySelector(".ldp-head")!.innerHTML = headHtml(p, ro);
  st.overlay.querySelector(".ldp-compact .in")!.innerHTML = `${logoHtml(p, 28)}<b style="${p.results.nova ? `font-family:${esc(fontStack(brandOf(p).fonts.display))};` : ""}">${esc(brandOf(p).name)}</b><div class="ldp-actions">${actionsHtml(p, ro, true)}</div>`;
  st.overlay.querySelector(".ldp-rail")!.innerHTML = railHtml(p, st.active, cents);
  st.overlay.querySelector(".ldp-mfoot")!.innerHTML = mfootHtml(p, ro, cents);
  st.overlay.querySelector(".ldp-msheet")!.innerHTML = SECTIONS.map((s, i) => `<button type="button" data-goto="${s.id}">${i + 1}. ${s.label}${sectionState(p, s.id) === "locked" ? ICON.lock : ""}</button>`).join("");
  st.doc.innerHTML = renderDocument(p, { ...ctxOf(st), buildCents: cents });
  if (p.results.nova) loadFonts(brandOf(p).fonts);
  wireDoc();
  if (keepScroll) st.scroller.scrollTop = y;
  requestAnimationFrame(() => setActive(st.active));
}

async function share(): Promise<void> {
  if (!S) return;
  const p = S.project;
  let id = p.share_id ?? null;
  if (!id) {
    try {
      id = (await api.share(p.id)).shareId;
      if (S) S.project.share_id = id;
    } catch (e) {
      toast((e as Error).message || "Sharing isn't available right now.");
      return;
    }
  }
  const url = `${location.origin}/r/${id}`;
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share && matchMedia("(pointer: coarse)").matches) {
    try {
      await nav.share({ title: `${brandOf(p).name} · LaunchDesk report`, url });
      return;
    } catch {
      /* cancelled: fall back to copy */
    }
  }
  toast((await copyText(url)) ? "Link copied. Anyone with it can read, not edit." : url);
}

/** R23: print the document (or one section) from a hidden iframe with the A4 print sheet. */
function printDoc(only?: PackSection): void {
  if (!S) return;
  const html = buildPackHtml(S.project, S.site, { print: true, only });
  const f = document.createElement("iframe");
  f.setAttribute("aria-hidden", "true");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(f);
  f.onload = () => {
    const w = f.contentWindow;
    if (!w) return;
    const go = () => {
      w.focus();
      w.print();
      setTimeout(() => f.remove(), 60_000);
    };
    // give brand fonts a moment, never block on them
    const fonts = (w.document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) void Promise.race([fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(go);
    else setTimeout(go, 300);
  };
  f.srcdoc = html;
}

function downloadHtml(): void {
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

async function onClick(e: MouseEvent): Promise<void> {
  if (!S) return;
  const t = e.target as HTMLElement;
  const st = S;
  if (t === st.overlay || t.closest("[data-close]")) return closePack();
  const menuBtn = t.closest<HTMLElement>("[data-menu]");
  if (menuBtn) {
    const m = menuBtn.parentElement?.querySelector<HTMLElement>(".ldp-menu");
    closeMenus(m);
    if (m) m.hidden = !m.hidden;
    return;
  }
  const mn = t.closest<HTMLElement>("[data-mnav]");
  if (mn) {
    const sh = st.overlay.querySelector<HTMLElement>(".ldp-msheet");
    closeMenus(sh);
    if (sh) sh.hidden = !sh.hidden;
    return;
  }
  if (!t.closest(".ldp-menu")) closeMenus();
  const go = t.closest<HTMLElement>("[data-goto]");
  if (go) {
    e.preventDefault();
    closeMenus();
    return goTo(go.dataset.goto as PackSection);
  }
  if (t.closest("[data-pdf]")) return closeMenus(), printDoc();
  if (t.closest("[data-print]")) return printDoc("receipt");
  if (t.closest("[data-html]")) return closeMenus(), downloadHtml(), toast("Pack downloaded");
  if (t.closest("[data-share]")) return void share();
  if (t.closest("[data-new]")) {
    closePack();
    navigateHome();
    return;
  }
  if (t.closest("[data-build]")) {
    const ev = new CustomEvent("launchdesk:build", { cancelable: true, detail: { id: st.project.id } });
    closePack();
    window.dispatchEvent(ev);
    return;
  }
  const view = t.closest<HTMLElement>("[data-view]");
  if (view) {
    const seg = view.parentElement!;
    seg.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-selected", String(b === view)));
    seg.classList.toggle("r", view.dataset.view === "cal");
    seg.nextElementSibling?.setAttribute("data-launch", view.dataset.view === "cal" ? "cal" : "list");
    return;
  }
  const cp = t.closest<HTMLElement>("[data-copy]");
  if (cp) {
    e.preventDefault();
    const ok = await copyText(cp.dataset.copy || "");
    const label = cp.dataset.label;
    if (label && !cp.classList.contains("ldp-sw") && !cp.classList.contains("ldp-opt")) {
      cp.textContent = ok ? "Copied" : "Copy failed";
      setTimeout(() => (cp.textContent = label), 1200);
    } else if (cp.classList.contains("ldp-sw")) {
      const code = cp.querySelector("code");
      if (code) {
        code.textContent = ok ? "Copied" : "Copy failed";
        setTimeout(() => (code.textContent = (cp.dataset.copy || "").toUpperCase()), 1200);
      }
    } else toast(ok ? "Copied" : "Copy failed");
  }
}

function onChange(e: Event): void {
  if (!S) return;
  const t = e.target as HTMLInputElement;
  const key = t.dataset?.check;
  if (!key) return;
  S.checks[key] = t.checked;
  if (!t.checked) delete S.checks[key];
  writeChecks(S.project.id, S.checks);
  const meta = S.doc.querySelector<HTMLElement>("[data-plan-count]");
  if (meta) {
    const total = Number(meta.dataset.planCount) || 0;
    const done = Array.from({ length: total }, (_, i) => S!.checks[`t-${i}`]).filter(Boolean).length;
    meta.textContent = `${done} of ${total} done`;
  }
}

function onKey(e: KeyboardEvent): void {
  if (!S) return;
  if (e.key === "Escape") {
    if (S.overlay.querySelector(".lds-sheet")) return; // the landing pay sheet handles its own Escape
    const open = [...S.overlay.querySelectorAll<HTMLElement>(".ldp-menu, .ldp-msheet")].some((m) => !m.hidden);
    e.preventDefault();
    if (open) return closeMenus();
    return closePack();
  }
  const t = e.target as HTMLElement;
  if (t.getAttribute?.("role") === "tab" && t.closest(".ldp-rail")) {
    const ids = SECTIONS.map((s) => s.id);
    const i = ids.indexOf(t.dataset.goto as PackSection);
    let n = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") n = (i + 1) % ids.length;
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") n = (i - 1 + ids.length) % ids.length;
    if (e.key === "Home") n = 0;
    if (e.key === "End") n = ids.length - 1;
    if (n >= 0) {
      e.preventDefault();
      goTo(ids[n]!);
      S.overlay.querySelector<HTMLElement>(`#ldp-tab-${ids[n]}`)?.focus();
    }
  }
  if (e.key === "Tab") {
    const f = [...S.overlay.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input, summary, [tabindex]:not([tabindex='-1'])")].filter((x) => x.offsetParent !== null && !x.closest("[hidden]"));
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) {
      e.preventDefault();
      f[f.length - 1]!.focus();
    } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
      e.preventDefault();
      f[0]!.focus();
    }
  }
}

async function loadSite(p: Project): Promise<void> {
  const slug = p.results.pip?.slug;
  if (!slug || !S) return;
  S.site.loading = true;
  try {
    const r = await fetch(`/api/sites/${encodeURIComponent(slug)}`, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(String(r.status));
    const d = (await r.json()) as { founderAddress?: string; bchUsd?: number; demo?: boolean };
    if (!S || S.project.id !== p.id) return;
    // A demo page sits on LaunchDesk's own address: never show it as "your wallet" or offer a QR to it.
    S.site = d.demo ? { founderAddress: "", bchUsd: Number(d.bchUsd) || 0, loading: false, demo: true } : { founderAddress: d.founderAddress || "", bchUsd: Number(d.bchUsd) || 0, loading: false };
  } catch {
    if (!S || S.project.id !== p.id) return;
    S.site.loading = false;
  }
  renderAll();
}

/** Open the pack for a project, scrolled to `section` (default Summary). Called again while open, it refreshes in place. */
export function openPack(project: Project, opts: PackOpenOpts = {}): void {
  ensureCss();
  normalize(project);
  const wanted = toSection(opts.section);
  if (S) {
    const same = S.project.id === project.id;
    S.project = project;
    S.opts = { ...S.opts, ...opts };
    if (!same) {
      S.site = {};
      S.preorders = null;
      S.checks = readChecks(project.id);
    }
    renderAll(same);
    if (wanted) requestAnimationFrame(() => goTo(wanted, same));
    if (!same || (!S.site.founderAddress && !S.site.demo)) void loadSite(project);
    return;
  }
  if (!document.querySelector(`link[href="${UI_FONTS}"]`) && ![...document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")].some((l) => /family=Inter/.test(l.href))) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = UI_FONTS;
    document.head.appendChild(l);
  }
  const overlay = document.createElement("div");
  overlay.className = "ldp-overlay";
  overlay.innerHTML = `
    <div class="ldp" role="dialog" aria-modal="true" aria-labelledby="ldp-name" tabindex="-1">
      ${bannerHtml(bannerOf(project, opts))}
      <div class="ldp-topbtns"><div class="ldp-menuwrap"><button class="ldp-iconbtn" type="button" data-menu="more" aria-haspopup="menu" aria-label="More">${ICON.more}</button>
        <div class="ldp-menu" role="menu" hidden><button role="menuitem" type="button" data-new>Start a new idea</button><button role="menuitem" type="button" data-html>Download HTML</button></div></div>
        <button class="ldp-iconbtn" type="button" data-close aria-label="Close pack">${ICON.close}</button></div>
      <div class="ldp-compact" aria-hidden="true"><div class="in"></div></div>
      <div class="ldp-scroller">
        <header class="ldp-head"></header>
        <div class="ldp-mnav"><button type="button" data-mnav class="lbl" aria-label="Sections"></button></div>
        <div class="ldp-msheet" hidden></div>
        <div class="ldp-main">
          <nav class="ldp-rail" role="tablist" aria-orientation="vertical" aria-label="Pack sections"></nav>
          <article class="ldp-doc"></article>
        </div>
      </div>
      <footer class="ldp-mfoot"></footer>
      <div class="ldp-toast" role="status" aria-live="polite"></div>
    </div>`;
  document.body.appendChild(overlay);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  overlay.dataset.prevOverflow = prevOverflow;
  S = {
    project,
    opts,
    overlay,
    scroller: overlay.querySelector(".ldp-scroller")!,
    doc: overlay.querySelector(".ldp-doc")!,
    active: wanted ?? "summary",
    site: {},
    preorders: null,
    checks: readChecks(project.id),
    cleanups: [],
    lastFocus: document.activeElement,
    spyLock: 0,
  };
  overlay.addEventListener("click", (e) => void onClick(e));
  overlay.addEventListener("change", onChange);
  S.scroller.addEventListener("scroll", onScroll, { passive: true });
  S.scroller.addEventListener("scrollend", () => {
    if (!S) return;
    S.spyLock = 0;
    onScroll();
  });
  document.addEventListener("keydown", onKey);
  renderAll(false);
  if (wanted && wanted !== "summary") requestAnimationFrame(() => goTo(wanted, false));
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
  overlay.classList.add("out");
  setTimeout(() => overlay.remove(), reducedMotion() ? 0 : 260);
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

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
}

// ---------- download / print ----------

/**
 * A self-contained HTML document with every ready section (download, PDF). `print` adds the A4 sheet with a
 * cover page; `only` limits it to one section (Print receipt).
 */
export function buildPackHtml(p: Project, site: { founderAddress?: string; bchUsd?: number } = {}, opts: { print?: boolean; only?: PackSection } = {}): string {
  normalize(p);
  const b = brandOf(p);
  const origin = typeof location !== "undefined" ? location.origin : "";
  const ctx: RenderCtx = { ...site, origin, doc: true, readOnly: true };
  const ids = SECTIONS.filter((s) => (opts.only ? s.id === opts.only : sectionState(p, s.id) === "ready")).map((s) => s.id);
  const body = ids.map((id) => `<section class="ldp-s" id="ldp-s-${id}">${renderSection(p, id, ctx)}</section>`).join("");
  const leo = p.results.leo;
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const cover = opts.print && !opts.only
    ? `<div class="ldp-cover">${logoHtml(p, 72)}<h1 style="${p.results.nova ? `font-family:${esc(fontStack(b.fonts.display))};` : ""}color:${nameColor(p)}">${esc(b.name)}</h1><p>${esc(p.results.mia?.one_liner || b.tagline || p.idea)}</p>${leo ? `<p class="sc"><b>${leo.score.toFixed(1)}/10</b> ${leo.verdict === "go" ? "Go" : leo.verdict === "pivot" ? "Pivot" : "No-go"}</p>` : ""}<p class="dt">${esc(date)}</p></div>`
    : "";
  const fonts = p.results.nova ? `<link rel="stylesheet" href="${fontsHref(b.fonts)}">` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(b.name)} · Startup pack · LaunchDesk</title>
<link rel="stylesheet" href="${UI_FONTS}">${fonts}
<style>${packCss}</style>
</head><body class="ldp-docbody${opts.print ? " print" : ""}">
<div class="ldp ldp--doc">
  ${cover}
  ${opts.only ? "" : `<header class="ldp-head">${logoHtml(p, 64)}<div class="ldp-headtxt"><h1 class="ldp-name" style="${p.results.nova ? `font-family:${esc(fontStack(b.fonts.display))};` : ""}color:${nameColor(p)}">${esc(b.name)}</h1><p class="ldp-tag">${esc(b.tagline || p.results.mia?.one_liner || p.idea)}</p></div></header>`}
  <article class="ldp-doc">${body}</article>
  <footer class="ldp-docfoot">Made with LaunchDesk · ${esc(date)}. Estimates are labelled. Only stage payments are on-chain.</footer>
</div>
</body></html>`;
}
