// v6 · Every DOM surface (WS-B): chrome, idea, pay, floating status tag, result cards, verdict, level toasts,
// "your business", district, Your projects (drawer + read-only report), dev switcher (?switcher=1).
// One layout: center. Reads the flow; only calls flow.next/goto/replay. Never touches world internals.
import "./ui.css";
import { BUILD_DEPTS, ROOM_META, VALIDATE_DEPTS, type Dept, type FlowState, type Insets, type World } from "../contracts";
import { PAUSA } from "../data";
import { DOING, WORKLOG } from "../data/sample";
import type { ProtoFlow } from "../flow";
import { logoSystem, resultCard } from "./cards";
import { commitScheme } from "../themes/day";
import { countUp, el, esc, isMobile, reducedMotion, stagger } from "./dom";
import { I, avatar } from "./icons";
import { ldLogo } from "./logo";
import { ideaPanel, levelUpPanel, livePanel, payPanel, scalePanel, siteOverlay, verdictPanel } from "./moments";
import { createStore, drawerHtml, projectOf, readerHtml, type ProjectStore, type Run } from "./projects";
import { JUMPS, createSwitcher, type Clock } from "./switcher";
import { ensureBrandFonts, makeView, usd, type View } from "./view";

export interface Ui {
  openProjects(): void;
  dispose(): void;
}

export interface UiDeps {
  world: World;
  flow: ProtoFlow;
  clock: Clock;
  /** dev tools, only with ?switcher=1 */
  switcher: boolean;
  fast?: boolean;
  /** Screenshot mode: no entrance motion. */
  still?: boolean;
  store?: ProjectStore;
}

type Pos = "center" | "bottom" | "toast" | "sheet";
const TOP = 64;
const TOP_INSET = 104;
const TOP_INSET_M = 64;

type WorldPlus = World & { renderedLevel?(): 1 | 2 | 3; officeScreenPoint?(): { x: number; y: number } | null; portfolioScreenPoints?(): { id: string; x: number; y: number }[] };

export function createUi(host: HTMLElement, deps: UiDeps): Ui {
  const { world, flow } = deps;
  const store = deps.store ?? createStore();
  if (deps.still) document.documentElement.dataset.still = "1";
  const view: View = makeView(PAUSA);
  ensureBrandFonts(view);

  const root = el(`<div class="ui">
    <header class="chrome">
      <a class="wordmark" href="?" aria-label="LaunchDesk, start over">${ldLogo(20)}</a>
      <div class="chrome-c"></div>
      <div class="chrome-r">
        <div class="lvl" aria-label="Level"></div>
        <div class="wallet">${I.wallet(15)}<span class="w-txt">Wallet</span></div>
        <button class="proj-btn glass" type="button" data-act="projects" aria-label="Your projects">${I.grid(15)}<b class="pj-n"></b></button>
      </div>
    </header>
    <div class="ftag" aria-live="polite"></div>
    <div class="floortag" data-on="0"><i></i><span>Your office · Floor 1</span></div>
    <div class="pftags" data-on="0"></div>
    <div class="panels"></div>
    <button class="proj-pill glass" type="button" data-act="projects" data-on="0">${I.grid(15)}<span>Projects</span><b class="pj-n"></b></button>
    <div class="overlay" data-open="0"><div class="scrim" data-act="close"></div><div class="ov-body"></div></div>
  </div>`);
  host.appendChild(root);
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const lvlEl = $(".lvl"), walletEl = $(".wallet"), tagEl = $(".ftag"), panelsEl = $(".panels"), overlay = $(".overlay");
  const floorEl = $(".floortag"), pill = $(".proj-pill"), pfEl = $(".pftags");
  const wx = world as WorldPlus;

  // ────────────────────────────── chrome
  // progress lives on the card ("Validate · 2/3"); the chrome only names the level, as a badge (not a button)
  const LV = ["Office", "Building", "District"];
  lvlEl.innerHTML = `<span class="lvl-ic"></span><span class="lvl-k"></span><span class="lvl-name"></span>`;
  let shownLevel = 0;
  function paintLevel() {
    const lvl = wx.renderedLevel?.() ?? world.level;
    if (lvl === shownLevel) return;
    shownLevel = lvl;
    lvlEl.dataset.level = String(lvl);
    lvlEl.querySelector(".lvl-ic")!.innerHTML = lvl === 3 ? I.district(15) : lvl === 2 ? I.building(15) : I.office(15);
    lvlEl.querySelector(".lvl-k")!.textContent = `Level ${lvl}`;
    lvlEl.querySelector(".lvl-name")!.textContent = LV[lvl - 1]!;
    lvlEl.classList.remove("bump");
    void lvlEl.offsetWidth;
    lvlEl.classList.add("bump");
  }
  function paintChrome(s: FlowState) {
    root.dataset.step = s.step;
    paintLevel();
    const paid = flow.paidCents;
    walletEl.querySelector(".w-txt")!.innerHTML = paid ? `<b class="num">${usd(paid)}</b> paid` : "Wallet";
    walletEl.dataset.paid = paid ? "1" : "0";
  }

  // ────────────────────────────── projects (pill, drawer, reader) + portfolio buildings
  let runId: string | null = null;
  function paintProjects() {
    const n = store.all().length;
    root.querySelectorAll<HTMLElement>(".pj-n").forEach((b) => (b.textContent = n ? String(n) : ""));
    pill.dataset.on = n ? "1" : "0";
    root.dataset.projects = String(n);
    world.setPortfolio?.(store.portfolio().filter((p) => p.id !== runId)); // the run on screen is the hero tower, not a second building
  }
  store.onChange(paintProjects);
  paintProjects();

  function track(s: FlowState, prev: FlowState) {
    if (!runId) return;
    if (s.step === "verdict" && prev.step !== "verdict") store.update(runId, { score: view.leo?.score ?? null, verdict: view.leo?.verdict ?? null, level: 1, status: "validated" });
    else if ((s.step === "level-up" || s.step === "live") && prev.step !== s.step) store.update(runId, { level: 2, status: "live", title: view.mia?.title ?? view.name });
    else if (s.step === "scale" && prev.step !== "scale") store.update(runId, { level: 3, status: "district" });
    if ((s.step === "idle" || s.step === "idea") && runId) {
      runId = null;
      paintProjects();
    }
  }

  // ────────────────────────────── panels
  let curKey: string | null = null;
  let curPanel: HTMLElement | null = null;
  let insets: Insets = { left: 0, right: 0, top: TOP_INSET, bottom: 0 };

  function keyFor(s: FlowState): string | null {
    const settled = flow.settled;
    switch (s.step) {
      case "idle":
        return null;
      case "idea":
        return "idea";
      case "pay-validate":
        return settled ? "pay:validate" : null;
      case "pay-build":
        return settled ? "pay:build" : null;
      case "validate":
      case "build":
        return s.phase === "result" && s.dept ? `card:${s.dept}` : null;
      default:
        return settled ? s.step : null;
    }
  }
  function posFor(key: string): Pos {
    if (isMobile()) return key === "idea" || key.startsWith("pay") ? "sheet" : key === "level-up" ? "toast" : "sheet";
    if (key === "level-up" || key === "scale") return "toast";
    return key === "idea" || key.startsWith("pay") ? "center" : "bottom";
  }
  function build(key: string, s: FlowState): HTMLElement {
    let html = "";
    if (key === "idea") html = ideaPanel(s.idea, store.all().length);
    else if (key.startsWith("pay:")) html = payPanel(view, key.slice(4) as "validate" | "build", s.idea);
    else if (key.startsWith("card:")) html = resultCard(view, key.slice(5) as Dept);
    else if (key === "verdict") html = verdictPanel(view);
    else if (key === "level-up") html = levelUpPanel(view);
    else if (key === "live") html = livePanel(view);
    else if (key === "scale") html = scalePanel(view, store.all().length);
    const p = el(`<div class="panel glass" data-key="${key.split(":")[0]}" data-pos="${posFor(key)}">${html}</div>`);
    stagger(p);
    return p;
  }

  function computeInsets(p: HTMLElement | null): Insets {
    const vh = innerHeight;
    const top = isMobile() ? TOP_INSET_M : TOP_INSET;
    const base: Insets = { left: 0, right: 0, top, bottom: 0 };
    if (!p) return base;
    const pos = p.dataset.pos as Pos;
    const r = p.getBoundingClientRect();
    if (pos === "center") return base; // the popup floats over the office on purpose
    if (pos === "toast") return { ...base, bottom: Math.round(vh - r.top + 8) };
    return { ...base, bottom: Math.round(vh - r.top + 12) };
  }
  function pushInsets(i: Insets) {
    if (!(["left", "right", "top", "bottom"] as const).some((k) => Math.abs(i[k] - insets[k]) > 6)) return;
    insets = i;
    world.setInsets(i);
    placeTag();
  }

  function showPanel(key: string | null, s: FlowState) {
    if (key === curKey) return;
    commitScheme(); // a step change is the calm moment for a pending day ↔ night skin swap (crossfaded)
    const old = curPanel;
    curKey = key;
    curPanel = null;
    if (old) {
      old.classList.remove("in");
      old.classList.add("out");
      old.inert = true;
      setTimeout(() => old.remove(), reducedMotion() ? 0 : 260);
    }
    if (!key) {
      pushInsets(computeInsets(null));
      return;
    }
    const p = build(key, s);
    curPanel = p;
    panelsEl.appendChild(p);
    wirePanel(p, key);
    requestAnimationFrame(() => {
      p.classList.add("in");
      countUp(p);
      pushInsets(computeInsets(p));
      const f = p.querySelector<HTMLElement>("textarea");
      if (f && !isMobile()) f.focus({ preventScroll: true });
    });
  }

  /** While another tab is open, the card keeps the height of its first tab (the rest scrolls inside), so
   *  switching tabs never moves the layout or the camera. Back on the first tab the lock is released. */
  function switchTab(scope: HTMLElement, id: string) {
    const panes = scope.querySelector<HTMLElement>(".c-panes");
    const first = panes?.querySelector<HTMLElement>(".c-pane");
    if (panes && first && !isMobile() && !scope.closest(".reader")) {
      if (first.dataset.pane === id) {
        panes.style.height = "";
        delete panes.dataset.locked;
      } else if (!panes.style.height) {
        panes.style.height = `${Math.ceil(panes.getBoundingClientRect().height)}px`;
        panes.dataset.locked = "1";
      }
    }
    scope.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === id)));
    scope.querySelectorAll<HTMLElement>(".c-pane").forEach((pn) => {
      const on = pn.dataset.pane === id;
      if (on && pn.hidden) {
        pn.hidden = false;
        pn.classList.remove("pane-in");
        void pn.offsetWidth;
        pn.classList.add("pane-in");
        countUp(pn);
        pn.parentElement!.scrollTop = 0;
      } else if (!on) pn.hidden = true;
    });
  }

  function wirePanel(p: HTMLElement, key: string) {
    if (key === "idea") {
      const form = p.querySelector<HTMLFormElement>("form")!;
      const ta = form.querySelector("textarea")!;
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!flow.settled) return;
        flow.next({ type: "submit-idea", idea: ta.value });
      });
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          form.requestSubmit();
        }
      });
    }
    p.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const tab = t.closest<HTMLElement>("[data-tab]");
      if (tab) return switchTab(p, tab.dataset.tab!);
      const lg = t.closest<HTMLElement>("[data-logo]");
      if (lg) return pickLogo(p, Number(lg.dataset.logo));
      const b = t.closest<HTMLElement>("[data-act]");
      if (b) void act(b.dataset.act!, b);
    });
  }
  /** Dex: the three concepts are real options; picking one redraws the whole logo system and its rationale. */
  function pickLogo(scope: HTMLElement, i: number) {
    scope.querySelectorAll<HTMLElement>("[data-logo]").forEach((c) => {
      const on = Number(c.dataset.logo) === i;
      c.classList.toggle("on", on);
      c.setAttribute("aria-checked", String(on));
    });
    const hero = scope.querySelector<HTMLElement>("[data-logo-hero]");
    const take = scope.querySelector<HTMLElement>("[data-logo-take]");
    const cell = scope.querySelector<HTMLElement>(`[data-logo="${i}"]`);
    if (hero) {
      hero.innerHTML = logoSystem(view, i);
      hero.classList.remove("pane-in");
      void hero.offsetWidth;
      hero.classList.add("pane-in");
    }
    if (take && cell) take.textContent = cell.dataset.concept ?? "";
  }

  async function act(a: string, b?: HTMLElement) {
    if (a === "next") return flow.next({ type: "next" });
    if (a === "approve" && b) {
      if (b.dataset.state) return;
      // a run joins "Your projects" once it is paid for, not when the idea is typed
      if (flow.state.step === "pay-validate" && !runId) {
        runId = store.start(flow.state.idea.trim() || PAUSA.idea);
        paintProjects();
      }
      const sp = reducedMotion() ? 0 : 1;
      b.dataset.state = "busy";
      await sleep((850 * sp) / flow.speed);
      b.dataset.state = "done";
      await sleep((750 * sp) / flow.speed);
      return flow.next({ type: "approve-pay" });
    }
    if (a === "build") return flow.next({ type: "decide", choice: "build" });
    if (a === "pivot") return flow.next({ type: "decide", choice: "pivot" });
    if (a === "stop") {
      if (runId) store.update(runId, { status: "stopped" });
      return flow.next({ type: "decide", choice: "stop" });
    }
    if (a === "continue") return flow.next({ type: "continue" });
    if (a === "pack") return openReader(view, null, "Startup pack");
    if (a === "site") return openOverlay(siteOverlay(view), "site");
    if (a === "projects") return openProjects();
    if (a === "back") return openProjects();
    if (a === "close") return closeOverlay();
    if (a === "new") {
      closeOverlay();
      return flow.goto({ step: "idea", idea: "" });
    }
    if (a === "replay") return flow.replay();
  }

  // ────────────────────────────── overlay: drawer, reader, site
  const ovBody = overlay.querySelector<HTMLElement>(".ov-body")!;
  let lastFocus: HTMLElement | null = null;
  function openOverlay(html: string, kind: "drawer" | "reader" | "site") {
    if (overlay.dataset.open !== "1") lastFocus = document.activeElement as HTMLElement | null;
    ovBody.dataset.kind = kind;
    ovBody.innerHTML = `<div class="ov-card glass" data-kind="${kind}" tabindex="-1">${html}</div>`;
    stagger(ovBody);
    overlay.dataset.open = "1";
    overlay.dataset.kind = kind;
    const card = ovBody.querySelector<HTMLElement>(".ov-card")!;
    card.classList.remove("in");
    requestAnimationFrame(() => {
      card.classList.add("in");
      countUp(card);
      card.focus({ preventScroll: true }); // keyboard users tab from here; no focus ring on open
    });
    card.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const o = t.closest<HTMLElement>("button[data-open]"); // not the .overlay root, which also carries data-open="1"
      if (o) return openRun(o.dataset.open!);
      const sec = t.closest<HTMLElement>(".rd-nav [data-sec]");
      if (sec) return showSection(card, sec.dataset.sec!);
      const tab = t.closest<HTMLElement>("[data-tab]");
      if (tab) return switchTab(tab.closest<HTMLElement>(".card")!, tab.dataset.tab!);
      const b = t.closest<HTMLElement>("[data-act]");
      if (b) void act(b.dataset.act!, b);
    });
  }
  function closeOverlay() {
    if (overlay.dataset.open !== "1") return;
    overlay.dataset.open = "0";
    ovBody.querySelector(".ov-card")?.classList.remove("in");
    lastFocus?.focus?.({ preventScroll: true });
  }
  overlay.querySelector(".scrim")!.addEventListener("click", closeOverlay);

  function openProjects() {
    openOverlay(drawerHtml(store.all()), "drawer");
  }
  function openRun(id: string) {
    const r = store.all().find((x) => x.id === id);
    if (!r) return;
    const v = makeView(projectOf(r));
    ensureBrandFonts(v);
    openReader(v, r, r.own ? "Your run" : "Sample project");
  }
  function openReader(v: View, r: Run | null, title: string) {
    openOverlay(readerHtml(v, r, title), "reader");
  }
  function showSection(card: HTMLElement, id: string) {
    card.querySelectorAll<HTMLElement>(".rd-nav [data-sec]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.sec === id)));
    card.querySelectorAll<HTMLElement>(".rd-sec").forEach((s) => {
      const on = s.dataset.sec === id;
      if (on && s.hidden) {
        s.hidden = false;
        s.classList.remove("pane-in");
        void s.offsetWidth;
        s.classList.add("pane-in");
        countUp(s);
      } else if (!on) s.hidden = true;
    });
    card.querySelector<HTMLElement>(".rd-body")!.scrollTop = 0;
    card.querySelector<HTMLElement>(`.rd-nav [data-sec="${id}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: reducedMotion() ? "auto" : "smooth" });
  }

  // ────────────────────────────── floating status tag
  let tagDept: Dept | null = null;
  let tagTimer = 0;
  function showTag(d: Dept | null) {
    if (d === tagDept) return;
    tagDept = d;
    clearInterval(tagTimer);
    if (!d) {
      tagEl.dataset.on = "0";
      return;
    }
    const lines = WORKLOG[d];
    const ms = flow.workMs;
    tagEl.style.setProperty("--room", ROOM_META[d].color);
    tagEl.innerHTML = `
      <span class="tg-av">${avatar(d, 30)}<svg class="tg-ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" pathLength="1" style="animation-duration:${ms}ms"/></svg></span>
      <span class="tg-txt"><b>${ROOM_META[d].name} <em>· ${esc(ROOM_META[d].does)}</em></b><span class="tg-line"><span>${esc(DOING[d])}</span></span></span>`;
    tagEl.dataset.on = "1";
    let i = 0;
    const lineEl = tagEl.querySelector(".tg-line")!;
    const swap = () => {
      if (i >= lines.length) return;
      const n = el(`<span>${esc(lines[i++]!)}</span>`);
      lineEl.querySelectorAll("span:not(.out)").forEach((old) => {
        old.classList.add("out");
        setTimeout(() => old.remove(), 260);
      });
      lineEl.appendChild(n);
    };
    swap();
    tagTimer = window.setInterval(swap, Math.max(700, ms / lines.length));
    placeTag();
  }
  function placeTag() {
    if (!tagDept) return;
    const pt = world.roomScreenPoint(tagDept);
    if (!pt) {
      tagEl.style.opacity = "0";
      return;
    }
    tagEl.style.opacity = "";
    const r = tagEl.getBoundingClientRect();
    if (isMobile()) {
      tagEl.style.transform = `translate3d(${((innerWidth - r.width) / 2).toFixed(1)}px, ${(innerHeight - r.height - 24).toFixed(1)}px, 0)`;
      return;
    }
    const x = Math.min(innerWidth - r.width - 12, Math.max(12, pt.x - r.width / 2));
    const y = Math.max(TOP, Math.min(innerHeight - r.height - 12, pt.y - r.height - 28));
    tagEl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }
  function placeFloor() {
    const pt = wx.officeScreenPoint?.() ?? null;
    const on = !!pt && (wx.renderedLevel?.() ?? 1) >= 2 && flow.settled;
    floorEl.dataset.on = on ? "1" : "0";
    if (!pt || !on) return;
    const r = floorEl.getBoundingClientRect();
    const x = Math.min(innerWidth - r.width - 12, Math.max(12, pt.x - r.width / 2));
    const y = Math.max(TOP, Math.min(innerHeight - insets.bottom - r.height - 6, pt.y + 14));
    floorEl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }
  // v6 integrate: name tags over the past-project buildings in the district (world.portfolioScreenPoints)
  let pfKey = "";
  function placePortfolio() {
    const pts = flow.settled && flow.state.step === "scale" && !isMobile() ? wx.portfolioScreenPoints?.() ?? [] : [];
    pfEl.dataset.on = pts.length ? "1" : "0";
    if (!pts.length) return;
    const runs = store.all();
    const key = pts.map((p) => p.id).join(",");
    if (key !== pfKey) {
      pfKey = key;
      pfEl.innerHTML = pts.map((p) => {
        const r = runs.find((x) => x.id === p.id);
        if (!r) return "";
        const name = (r.level >= 2 ? makeView(projectOf(r)).brand?.name : null) ?? r.title.replace(/\s+in\s+[A-Z][\p{L} ]+$/u, "");
        return `<button type="button" class="pft" data-open="${esc(r.id)}" data-v="${r.verdict ?? ""}"><b>${esc(name.length > 24 ? name.slice(0, 23).trimEnd() + "…" : name)}</b>${r.score != null ? `<span class="num">${r.score.toFixed(1)}</span>` : ""}</button>`;
      }).join("");
    }
    const bottom = innerHeight - insets.bottom - 8;
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    [...pts].sort((a, b) => b.y - a.y).forEach((p) => {
      const t = pfEl.querySelector<HTMLElement>(`[data-open="${CSS.escape(p.id)}"]`);
      if (!t) return;
      const w = t.offsetWidth, h = t.offsetHeight;
      const x = Math.min(innerWidth - w - 12, Math.max(12, p.x - w / 2));
      let y = Math.min(bottom - h, Math.max(TOP, p.y - h - 10));
      // nearer tags (lower on screen) win; farther ones step up until they no longer overlap
      for (let k = 0; k < 6 && placed.some((o) => x < o.x + o.w + 4 && o.x < x + w + 4 && y < o.y + o.h + 4 && o.y < y + h + 4); k++) y -= h + 6;
      placed.push({ x, y, w, h });
      t.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    });
  }
  // chrome buttons outside panels ("Projects" pill on desktop, icon in the mobile top bar)
  root.querySelectorAll<HTMLElement>(".proj-pill, .proj-btn").forEach((b) => b.addEventListener("click", () => openProjects()));
  pfEl.addEventListener("click", (e) => {
    const o = (e.target as HTMLElement).closest<HTMLElement>("button[data-open]");
    if (o) openRun(o.dataset.open!);
  });
  const offCam = world.onCameraChange(() => {
    placeTag();
    placeFloor();
    placePortfolio();
    paintLevel();
  });

  // ────────────────────────────── render
  function render(s: FlowState, prev: FlowState) {
    paintChrome(s);
    track(s, prev);
    const working = (s.step === "validate" || s.step === "build") && s.phase === "working" && flow.settled ? s.dept! : null;
    showTag(working);
    showPanel(keyFor(s), s);
    placeFloor();
    placePortfolio();
  }
  const offFlow = flow.onChange((s, prev) => render(s, prev));
  render(flow.state, flow.state);

  const onResize = () => {
    if (curPanel && curKey) {
      curPanel.dataset.pos = posFor(curKey);
      pushInsets(computeInsets(curPanel));
    }
    placeTag();
  };
  addEventListener("resize", onResize);

  // ────────────────────────────── keyboard: → / Enter = Next, Esc closes, ← → move through a report
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const typing = t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT";
    if (e.key === "Escape") {
      if (overlay.dataset.open === "1") return closeOverlay();
      if (flow.state.step === "pay-validate") return flow.goto({ step: "idea" });
      return;
    }
    if (typing) return;
    if (overlay.dataset.open === "1") {
      const nav = ovBody.querySelector<HTMLElement>(".rd-nav");
      if (nav && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        const tabs = [...nav.querySelectorAll<HTMLElement>("[data-sec]")];
        const i = tabs.findIndex((x) => x.getAttribute("aria-selected") === "true");
        const n = tabs[Math.max(0, Math.min(tabs.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)))];
        if (n) showSection(ovBody.querySelector<HTMLElement>(".ov-card")!, n.dataset.sec!);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowRight" || e.key === "Enter") {
      if (t.tagName === "BUTTON" && e.key === "Enter" && !t.classList.contains("btn-next")) return; // native activation
      if (curKey?.startsWith("card:")) {
        e.preventDefault();
        void act("next");
      } else if (curKey === "level-up") {
        e.preventDefault();
        void act("continue");
      } else if (flow.state.step === "idle") flow.next();
    }
  };
  addEventListener("keydown", onKey);

  // ────────────────────────────── dev tools
  if (deps.switcher) {
    root.appendChild(
      createSwitcher({
        clock: deps.clock,
        fast: !!deps.fast,
        onSpeed: (f) => flow.setSpeed(f ? 3 : 1),
        onJump(id) {
          const j = JUMPS.find((x) => x.id === id);
          if (j) flow.goto({ ...j.to });
        },
        onReplay: () => flow.replay(),
      }),
    );
  }

  return {
    openProjects,
    dispose() {
      offFlow();
      offCam();
      removeEventListener("resize", onResize);
      removeEventListener("keydown", onKey);
      root.remove();
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
