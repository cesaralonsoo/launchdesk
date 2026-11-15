// Every DOM surface of the prototype (WS-C): chrome, idea popup, pay sheet, floating status tag, result cards,
// verdict, level-up, live, scale, pack, variant switcher. Reads the flow; only calls flow.next/goto/replay.
import "./ui.css";
import { BUILD_DEPTS, ROOM_META, VALIDATE_DEPTS, type Dept, type FlowState, type Insets, type LayoutId, type ThemeId, type ThemeTokens, type World } from "../contracts";
import { WORKLOG, DOING, usd } from "../data/sample";
import { NO_AUTO, READ_MS, type ProtoFlow } from "../flow";
import { BRAND_FONT_HREF, resultCard } from "./cards";
import { countUp, el, esc, isMobile, reducedMotion, stagger } from "./dom";
import { I, avatar } from "./icons";
import { ideaPanel, levelUpPanel, livePanel, packPanel, payPanel, scalePanel, siteOverlay, verdictPanel } from "./moments";
import { JUMPS, createSwitcher } from "./switcher";

export interface Ui {
  setLayout(l: LayoutId): void;
  setTheme(t: ThemeTokens): void;
  dispose(): void;
}

export interface UiDeps {
  world: World;
  flow: ProtoFlow;
  layout: LayoutId;
  switcher: boolean;
  onTheme(t: ThemeTokens): void;
  theme?: ThemeId;
  fast?: boolean;
  /** Screenshot mode: no auto-advance, no entrance motion. */
  still?: boolean;
}

type Pos = "center" | "bottom" | "side" | "dock" | "sheet" | "toast";
const TOP = 64; // chrome height (px): floating tags never go above it
/** Top inset handed to the world: chrome + its scrim, so a framed room never runs under the wordmark and dots. */
const TOP_INSET = 112;
const TOP_INSET_M = 72;

/** Optional world extras (WorldExtras in world/index.ts), read structurally so the UI keeps working on the frozen World. */
type WorldPlus = World & { renderedLevel?(): 1 | 2 | 3; officeScreenPoint?(): { x: number; y: number } | null };

export function createUi(host: HTMLElement, deps: UiDeps): Ui {
  const { world, flow } = deps;
  let layout = deps.layout;
  if (deps.still) document.documentElement.dataset.still = "1";

  // brand fonts (Nova's pick) for the startup's own artefacts
  if (!document.head.querySelector("link[data-brand-font]")) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = BRAND_FONT_HREF;
    l.dataset.brandFont = "1";
    document.head.appendChild(l);
  }

  const root = el(`<div class="ui" data-layout="${layout}">
    <header class="chrome">
      <a class="wordmark glass" href="?" aria-label="LaunchDesk"><span class="wm-mark"><i></i><i></i><i></i></span><span>LaunchDesk</span></a>
      <div class="run glass" aria-label="Progress"></div>
      <div class="chrome-r">
        <div class="lvl glass" aria-label="Level"></div>
        <div class="wallet glass">${I.wallet(15)}<span class="w-txt">Wallet</span></div>
      </div>
    </header>
    <div class="ftag" aria-live="polite"></div>
    <div class="floortag" data-on="0"><i></i><span>Your office · Floor 1</span></div>
    <div class="panels"></div>
    <div class="overlay" data-open="0"><div class="scrim" data-act="close"></div><div class="ov-body"></div></div>
  </div>`);
  host.appendChild(root);
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const runEl = $(".run"), lvlEl = $(".lvl"), walletEl = $(".wallet"), tagEl = $(".ftag"), panelsEl = $(".panels"), overlay = $(".overlay");
  const floorEl = $(".floortag");
  const wx = world as WorldPlus;

  // ────────────────────────────── chrome
  runEl.innerHTML =
    `<div class="run-g">${VALIDATE_DEPTS.map((d) => `<i data-d="${d}" style="--room:${ROOM_META[d].color}" title="${ROOM_META[d].name} · ${ROOM_META[d].does}"></i>`).join("")}</div>` +
    `<span class="run-sep"></span>` +
    `<div class="run-g">${BUILD_DEPTS.map((d) => `<i data-d="${d}" style="--room:${ROOM_META[d].color}" title="${ROOM_META[d].name} · ${ROOM_META[d].does}"></i>`).join("")}</div>`;
  const LV = ["Office", "Building", "District"];
  lvlEl.innerHTML = `<span class="lvl-seg" aria-hidden="true"><i data-l="1"></i><i data-l="2"></i><i data-l="3"></i></span><span class="lvl-name"></span>`;

  /** The badge follows what is on screen (the world's rendered level), never ahead of the transition. */
  let shownLevel = 0;
  function paintLevel() {
    const lvl = wx.renderedLevel?.() ?? world.level;
    if (lvl === shownLevel) return;
    shownLevel = lvl;
    lvlEl.dataset.level = String(lvl);
    // level 3 is the horizon (planned, not earned): its segment is shown as "next", not filled
    lvlEl.querySelectorAll<HTMLElement>("[data-l]").forEach((n) => {
      const l = Number(n.dataset.l);
      n.dataset.on = l < 3 && l <= lvl ? "1" : l === 3 && lvl === 3 ? "next" : "0";
    });
    const nm = lvlEl.querySelector(".lvl-name")!;
    nm.textContent = LV[lvl - 1]!;
    lvlEl.classList.remove("bump");
    void lvlEl.offsetWidth;
    lvlEl.classList.add("bump");
  }

  function paintChrome(s: FlowState) {
    root.dataset.step = s.step;
    const order = [...VALIDATE_DEPTS, ...BUILD_DEPTS];
    const di = s.dept ? order.indexOf(s.dept) : -1;
    const doneAll = (d: Dept) => {
      if (s.step === "validate" || s.step === "build") {
        const i = order.indexOf(d);
        return i < di || (i === di && s.phase === "result");
      }
      if (["verdict", "level-up", "pay-build"].includes(s.step)) return VALIDATE_DEPTS.includes(d);
      return ["live", "scale"].includes(s.step);
    };
    runEl.querySelectorAll<HTMLElement>("i").forEach((n) => {
      const d = n.dataset.d as Dept;
      n.dataset.s = d === s.dept && s.phase === "working" ? "now" : doneAll(d) ? "done" : "todo";
    });
    paintLevel();
    const paid = flow.paidCents;
    walletEl.querySelector(".w-txt")!.innerHTML = paid ? `<b class="num">${usd(paid)}</b> paid` : "Wallet";
    walletEl.dataset.paid = paid ? "1" : "0";
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
    if (isMobile()) return "sheet";
    if (key === "level-up" || key === "scale") return "toast";
    if (layout === "side") return "side";
    if (layout === "dock") return key === "idea" ? "dock" : key.startsWith("pay") ? "dock" : "bottom";
    return key === "idea" || key.startsWith("pay") ? "center" : "bottom";
  }
  function build(key: string, s: FlowState): HTMLElement {
    let html = "";
    if (key === "idea") html = ideaPanel(s.idea);
    else if (key.startsWith("pay:")) html = payPanel(key.slice(4) as "validate" | "build", s.idea);
    else if (key.startsWith("card:")) html = resultCard(key.slice(5) as Dept);
    else if (key === "verdict") html = verdictPanel();
    else if (key === "level-up") html = levelUpPanel();
    else if (key === "live") html = livePanel();
    else if (key === "scale") html = scalePanel();
    const p = el(`<div class="panel glass" data-key="${key.split(":")[0]}" data-pos="${posFor(key)}">${html}</div>`);
    stagger(p);
    return p;
  }

  function computeInsets(p: HTMLElement | null): Insets {
    const vw = innerWidth, vh = innerHeight;
    const top = isMobile() ? TOP_INSET_M : TOP_INSET;
    const base: Insets = { left: 0, right: 0, top, bottom: 0 };
    if (!p) return base;
    const pos = p.dataset.pos as Pos;
    const r = p.getBoundingClientRect();
    if (pos === "center") return base; // the popup floats over the office on purpose
    if (pos === "side") return { ...base, right: Math.round(vw - r.left + 12) };
    if (pos === "toast") return { ...base, top: Math.round(top * 0.6), bottom: Math.round(vh - r.top + 8) };
    return { ...base, bottom: Math.round(vh - r.top + 12) };
  }
  function pushInsets(i: Insets) {
    const ch = (["left", "right", "top", "bottom"] as const).some((k) => Math.abs(i[k] - insets[k]) > 6);
    if (!ch) return;
    insets = i;
    world.setInsets(i);
    placeTag();
  }

  function showPanel(key: string | null, s: FlowState) {
    if (key === curKey) return;
    const old = curPanel;
    curKey = key;
    curPanel = null;
    if (old) {
      old.classList.add("out");
      old.inert = true;
      setTimeout(() => old.remove(), reducedMotion() ? 0 : 200);
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

  function wirePanel(p: HTMLElement, key: string) {
    // auto-advance on result cards (pauses on hover / focus via CSS animation-play-state)
    const bar = p.querySelector<HTMLElement>(".btn-next .auto");
    if (bar) {
      const dept = key.startsWith("card:") ? key.slice(5) : "";
      if (deps.still || NO_AUTO.includes(dept)) bar.remove();
      else {
        bar.style.setProperty("animation-duration", `${READ_MS}ms`, "important"); // reading time never scales with speed
        bar.addEventListener("animationend", () => curPanel === p && flow.next({ type: "next" }));
      }
    }
    if (key === "idea") {
      const form = p.querySelector<HTMLFormElement>("form")!;
      const ta = form.querySelector("textarea")!;
      form.addEventListener("submit", (e) => {
        e.preventDefault();
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
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
      if (!b) return;
      act(b.dataset.act!, b);
    });
  }

  async function act(a: string, b?: HTMLElement) {
    const s = flow.state;
    if (a === "next") return flow.next({ type: "next" });
    if (a === "approve" && b) {
      if (b.dataset.state) return;
      const sp = reducedMotion() ? 0 : 1;
      b.dataset.state = "busy";
      await sleep((850 * sp) / flow.speed);
      b.dataset.state = "done";
      await sleep((750 * sp) / flow.speed);
      return flow.next({ type: "approve-pay" });
    }
    if (a === "build") return flow.next({ type: "decide", choice: "build" });
    if (a === "pivot") return flow.next({ type: "decide", choice: "pivot" });
    if (a === "stop") return flow.next({ type: "decide", choice: "stop" });
    if (a === "continue") return flow.next({ type: "continue" });
    if (a === "pack") return openOverlay(packPanel());
    if (a === "site") return openOverlay(siteOverlay(), "site");
    if (a === "close") return closeOverlay();
    if (a === "new") return flow.goto({ step: "idea", idea: "" });
    if (a === "replay") return flow.replay();
    void s;
  }

  // ────────────────────────────── overlay (pack / site)
  function openOverlay(html: string, kind = "pack") {
    const body = overlay.querySelector<HTMLElement>(".ov-body")!;
    body.innerHTML = `<div class="ov-card glass" data-kind="${kind}">${html}</div>`;
    stagger(body);
    overlay.dataset.open = "1";
    overlay.querySelector(".ov-card")!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
      if (b) void act(b.dataset.act!, b);
    });
  }
  function closeOverlay() {
    overlay.dataset.open = "0";
  }
  overlay.querySelector(".scrim")!.addEventListener("click", closeOverlay);

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
      // phones: pinned above the bottom safe area, centred
      const bottom = innerHeight - r.height - 16 - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sab")) || 0);
      tagEl.style.transform = `translate3d(${((innerWidth - r.width) / 2).toFixed(1)}px, ${bottom.toFixed(1)}px, 0)`;
      return;
    }
    const x = Math.min(innerWidth - r.width - 12, Math.max(12, pt.x - r.width / 2));
    const y = Math.max(TOP, Math.min(innerHeight - r.height - 12, pt.y - r.height - 28));
    tagEl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }
  // "Your office · Floor 1": ties the tower (and the district) back to the office that did the work
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
  const offCam = world.onCameraChange(() => {
    placeTag();
    placeFloor();
    paintLevel();
  });

  // ────────────────────────────── render
  function render(s: FlowState) {
    paintChrome(s);
    const working = (s.step === "validate" || s.step === "build") && s.phase === "working" && flow.settled ? s.dept! : null;
    showTag(working);
    showPanel(keyFor(s), s);
    placeFloor();
  }
  const offFlow = flow.onChange((s) => render(s));
  render(flow.state);

  const onResize = () => {
    if (curPanel && curKey) {
      curPanel.dataset.pos = posFor(curKey);
      pushInsets(computeInsets(curPanel));
    }
    placeTag();
  };
  addEventListener("resize", onResize);

  // a moving pointer means someone is reading: pause the auto-advance for a moment
  let readT = 0;
  const onPointer = () => {
    if (!curPanel) return;
    curPanel.classList.add("reading");
    clearTimeout(readT);
    const p = curPanel;
    readT = window.setTimeout(() => p.classList.remove("reading"), 2500);
  };
  addEventListener("pointermove", onPointer, { passive: true });

  // ────────────────────────────── keyboard
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const typing = t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT";
    if (e.key === "Escape") {
      if (overlay.dataset.open === "1") return closeOverlay();
      if (flow.state.step === "pay-validate") return flow.goto({ step: "idea" });
      return;
    }
    if (typing) return;
    if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
      if (t.tagName === "BUTTON" && e.key !== "ArrowRight") return; // native button activation
      const s = flow.state;
      if (curKey?.startsWith("card:")) {
        e.preventDefault();
        void act("next");
      } else if (curKey === "level-up") {
        e.preventDefault();
        void act("continue");
      } else if (s.step === "idle") flow.next();
    }
  };
  addEventListener("keydown", onKey);

  // ────────────────────────────── switcher
  if (deps.switcher) {
    root.appendChild(
      createSwitcher({
        theme: deps.theme ?? "graphite",
        layout,
        fast: !!deps.fast,
        onTheme: deps.onTheme,
        onLayout(l) {
          setLayout(l);
        },
        onSpeed(f) {
          flow.setSpeed(f ? 3 : 1);
        },
        onJump(id) {
          const j = JUMPS.find((x) => x.id === id);
          if (j) flow.goto({ ...j.to });
        },
        onReplay: () => flow.replay(),
      }),
    );
  }

  function setLayout(l: LayoutId) {
    layout = l;
    root.dataset.layout = l;
    // rebuild the current panel in its new position
    const k = curKey;
    curKey = null;
    if (curPanel) {
      curPanel.remove();
      curPanel = null;
    }
    showPanel(k, flow.state);
  }

  return {
    setLayout,
    setTheme: () => render(flow.state),
    dispose() {
      offFlow();
      offCam();
      removeEventListener("resize", onResize);
      removeEventListener("keydown", onKey);
      removeEventListener("pointermove", onPointer);
      root.remove();
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
