// v7 · Every DOM surface (WS-EXP). One surface at a time over the world: the chrome (wordmark · BLAZE tag · Back on
// the left; How it works · Finished example · My ideas on the right), one panel for the current step, a floating name
// tag on whoever works, and overlays (source, my ideas, report, site). Reads the flow; only calls flow.next / goto /
// peek / submitIdea. Fixed light theme: nothing here listens to the clock.
// v8 (redesign PLAN.md): the home hero is ui/home.ts in the #home slot (this file only draws a fallback idea card
// while that slot is empty), the progress HUD is game/hud.ts in #hud. No growth track, no "Your offices" pill, no
// "Sample data" pill on the home. Phones: every step panel is a sheet that opens at 55% of the screen height and is
// dragged (or scrolled) up, so the 3D keeps at least 40% of the screen.
import "./ui.css";
import "./v7.css";
import "./report-doc.css";
import { DEMO_LENGTH_S, type FlowStateV7, type Insets, type WorldV7 } from "../contracts";
import { REPORT_PAGES, type ProtoFlowV7 } from "../flow";
import { DEMO_CHAPTERS, type Demo } from "../flow/demo";
import type { Project } from "../../src/types";
import { countUp, el, esc, isMobile, reducedMotion, stagger } from "./dom";
import { ldLogo } from "./logo";
import { livePanel, siteOverlay } from "./moments";
import {
  noBuildHtml, campusHtml, officesFloorHtml, recapHtml, reportOneHtml,
  analystTag, evidenceFoot, evidenceHtml, evWait, findingCard, hireHtml, ideaHtml, officesHtml,
  payHtml, reportPage, reportReader, sourceHtml, steerHtml, steerSuggestions, who, workTag,
} from "./steps";
import { ensureBrandFonts, makeView, type View } from "./view";
import { bubbleHtml, docMode, noteRow, progressBar, reportDocHtml, teamRows, workHtml, workNotes, type WorkNote } from "./report-doc";
import { I } from "./icons";
import { createProject, liveConfig } from "../live/adapter";
import { livePayHtml, mountPay } from "../live/pay";
import { ldMark } from "./logo";
import { badge } from "./pixel";
import { builderBadge, KIT_CENTS } from "./steps";
import { kitOfferHtml, mountKitScreen } from "./kit-screen";
import { projects as savedProjects } from "../../src/app/projects";
import { BUILD_TEAM } from "../contracts";
import type { AppConfig as AppConfigLike } from "../../src/types";
import { exampleOf, examples, kitNoteShort, knownExamples, lockedHtml, mainExample, ribbonHtml } from "./example";
import { startEscrowProof } from "./escrow-proof";
import { ESCROW } from "../live/pay";
import type { WorldV8 } from "../world/api-v8";
import { mountHome } from "./home";
import { mountHud } from "../game/hud";


export interface Ui {
  openOffices(): void;
  dispose(): void;
}
export interface UiDeps {
  world: WorldV7 & WorldV8;
  flow: ProtoFlowV7;
  demo: Demo | null;
  still?: boolean;
}

type Pos = "center" | "bottom" | "sheet" | "boom" | "doc" | "side" | "card";
const DEMO_IDEA_FALLBACK = "A specialty coffee kiosk at a metro exit";

export function createUi(host: HTMLElement, deps: UiDeps): Ui {
  const { world, flow } = deps;
  let demo = deps.demo;
  if (deps.still) document.documentElement.dataset.still = "1";
  let view: View | null = null;
  let viewFor = "";
  let viewOf: unknown = null;
  let cfg: AppConfigLike | null = null;
  void liveConfig().then((c) => {
    cfg = c;
    document.documentElement.dataset.ldPaused = paused() ? "1" : "0"; // example.css hides every pay button (offices too)
    paintMode();
    // A pay panel drawn before the config arrived does not know about sample mode or the price yet: draw it again.
    if (curKey === "idea" || curKey === "end" || curKey === "pay1" || curKey === "pay2" || curKey === "floor") render(true);
  });
  /** GET /api/config paused:true (the server takes no payments right now): no pay buttons, the example instead. */
  const paused = () => !!(cfg as (AppConfigLike & { paused?: boolean }) | null)?.paused;
  // The finished examples (real runs seeded by the server): the home button names the main one once it is known.
  void examples().then(() => {
    paintMode();
    paintChrome();
    paintExample();
    // opened straight on /p/ex-… (or reloaded there): the kit mounted before the list arrived, so it was not read-only
    if (curKey === "live" && flow.live && exampleOf(flow.live.id)) render(true);
    // a report opened before the list arrived: its header now knows whether the example was paid
    if (curKey === "doc" && /^ex-/.test(flow.project.id)) render(true);
  });
  // "Proof on Bitcoin Cash" under a report: the examples' real proof always, a live run's when escrow is on.
  startEscrowProof();
  const getView = () => {
    if (viewFor !== flow.project.id || viewOf !== flow.project.legacy) {
      viewFor = flow.project.id;
      viewOf = flow.project.legacy;
      view = flow.project.legacy ? makeView(flow.project.legacy as Project) : null;
      if (view) ensureBrandFonts(view);
    }
    return view;
  };
  let typedIdea = "";
  let steerDraft = "";

  const root = el(`<div class="ui v7">
    <header class="chrome">
      <div class="chrome-l"><a class="wordmark" href="/" aria-label="LaunchDesk, start over">${ldLogo(24)}</a><a class="blaze-tag" href="/#blaze" data-act="blaze">BLAZE 2026</a><button class="back-btn glass" type="button" data-act="back" hidden title="Back (Esc)" aria-label="Back"><span class="bb-i">${I.back(15)}</span><span class="bb-t">Back</span></button></div>
      <nav class="chrome-r" aria-label="Main"><span class="live-tag" hidden></span><a class="nav-a" href="/#how" data-act="how" data-on-home>How it works</a><button class="nav-a" type="button" data-act="example" data-on-home><span class="na-l">Finished example</span><span class="na-s">Example</span></button><button class="nav-a" type="button" data-act="offices" hidden>My ideas</button></nav>
    </header>
    <div class="demo-bar" hidden><div class="db-track"></div><div class="db-meta"><span class="db-ch"></span><span class="db-tag">Sample tour</span><span class="db-keys"><kbd>Space</kbd> pause <kbd>→</kbd> skip <kbd>Esc</kbd> exit</span></div></div>
    <div class="atag" data-on="0"></div>
    <div class="wtag glass" data-on="0"></div>
    <div class="wbub" data-on="0" aria-hidden="true"></div>
    <div class="panels"></div>
    <div class="overlay" data-open="0"><div class="scrim" data-act="close"></div><div class="ov-body"></div></div>
    <div id="home"></div>
    <div id="hud"></div>
  </div>`);
  host.appendChild(root);
  // v8 seam (WP-0): the home (WP-A) and the HUD (WP-C) mount here; both stubs render nothing yet.
  const unmountHome = mountHome(root.querySelector<HTMLElement>("#home")!, { world, flow });
  const unmountHud = mountHud(root.querySelector<HTMLElement>("#hud")!, { world, flow });
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const panelsEl = $(".panels"), overlay = $(".overlay"), atag = $(".atag"), wtag = $(".wtag");
  const homeSlot = $("#home");
  /** The home hero (ui/home.ts) owns the idea step once it renders something (or marks the slot data-owns="idea"). */
  const homeOwned = () => homeSlot.dataset.owns === "idea" || homeSlot.childElementCount > 0;
  const demoBar = $(".demo-bar");
  const modeTag = $(".live-tag");
  /** The honest label, inside the app only (never on the home): a real run on a sample-data server, or a sample world.
   *  The tour says "Sample tour" on its own bar; a finished example has its strip. */
  function paintMode() {
    const st = flow.state.step;
    let k = "", t = "";
    if (demo || st === "idea" || st === "bedroom") k = "";
    else if (flow.live) {
      if (!exampleOf(flow.live.id) && cfg?.mockAi) (k = "demo"), (t = "Sample data");
    } else if (flow.isSample(flow.project.id)) (k = "demo"), (t = "Sample data");
    modeTag.hidden = !k;
    if (k && (modeTag.dataset.k !== k || modeTag.dataset.t !== t)) {
      modeTag.dataset.k = k;
      modeTag.dataset.t = t;
      modeTag.title = k === "demo" ? "Sample data: not real research, nothing is charged" : t;
      modeTag.innerHTML = `<i></i><span class="lt-l">${t}</span><span class="lt-s">Sample</span>`;
    }
  }

  // ────────────────────────────── chrome: the home links, "My ideas" once this browser has one
  const myIdeas = $<HTMLButtonElement>("[data-act=offices]");
  function paintChrome() {
    const home = flow.state.step === "idea" && !demo;
    root.dataset.home = home ? "1" : "0";
    root.querySelectorAll<HTMLElement>("[data-on-home]").forEach((x) => (x.hidden = !home));
    const finished = knownExamples();
    myIdeas.hidden = demo != null || !flow.mine.some((p) => !finished.some((x) => x.id === p.id) && !/^ex-/.test(p.id));
  }
  /** Scroll the home to one of its sections (WP-A's #how / #blaze); from inside the app, go home first. */
  function toSection(id: string) {
    const go = () => document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    if (flow.state.step === "idea" && !demo) return go();
    demo?.exit();
    closeOverlay();
    typedIdea = "";
    flow.next({ type: "new-project" });
    setTimeout(go, 120);
  }

  // ────────────────────────────── demo bar
  if (demo) {
    demoBar.hidden = false;
    root.dataset.demo = "1";
    $(".db-track").innerHTML = DEMO_CHAPTERS.map(([at], i) => {
      const end = DEMO_CHAPTERS[i + 1]?.[0] ?? DEMO_LENGTH_S;
      return `<span class="db-seg" style="flex:${end - at}"><i></i></span>`;
    }).join("");
    const segs = [...demoBar.querySelectorAll<HTMLElement>(".db-seg i")];
    const ch = $(".db-ch");
    demo.onTick(() => {
      if (!demo) return;
      if (!demo.on) {
        demoBar.hidden = true;
        root.dataset.demo = "0";
        demo = null;
        render(true);
        return;
      }
      DEMO_CHAPTERS.forEach(([at], i) => {
        const end = DEMO_CHAPTERS[i + 1]?.[0] ?? DEMO_LENGTH_S;
        segs[i]!.style.transform = `scaleX(${Math.max(0, Math.min(1, (demo!.t - at) / (end - at)))})`;
      });
      const c = [...DEMO_CHAPTERS].reverse().find(([at]) => at <= demo!.t);
      ch.textContent = `${demo.paused && demo.t < DEMO_LENGTH_S ? "Paused · " : ""}${c?.[1] ?? ""}`;
    });
  }

  // ────────────────────────────── panels
  let curKey: string | null = null;
  let curPanel: HTMLElement | null = null;
  let insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };

  function keyFor(s: FlowStateV7): string | null {
    if (flow.moving) return null;
    switch (s.step) {
      case "bedroom":
        return null;
      case "idea":
        // the home hero owns this step (the tour keeps its own card: the idea types itself in it)
        return homeOwned() && !demo ? null : "idea";
      case "end":
        return demo ? "recap" : "end";
      case "pay1":
      case "pay2":
        return s.step;
      case "hire":
        return `hire:${flow.roster.length}`;
      case "evidence":
        return flow.calm ? "work" : "evidence";
      case "report":
        // one report surface: the written report for real runs, the score card for samples and the tour
        return docMode(flow.project, flow.report) ? "doc" : demo || (s.page ?? "score") === "score" ? "report1" : `report:${s.page}`;
      case "steer":
        return `steer:${flow.steers.length}:${flow.steering?.status ?? "none"}`;
      case "floor":
        return "floor";
      case "building":
        return "offices";
      case "district":
        return `campus:${flow.mine.length}`;
      default:
        return s.step;
    }
  }
  const sideHome = () => innerWidth >= 960 && innerWidth / innerHeight >= 1.25;
  /** Wide windows read the written report as a side card, with the company's floor lit on the right. */
  const sideDoc = () => innerWidth >= 1100;
  function posFor(key: string): Pos {
    if (isMobile()) return "sheet";
    if (key === "doc") return sideDoc() ? "card" : "doc";
    // Home on a wide window: the idea card sits on the left and the office fills the rest, full height.
    if ((key === "idea" || key === "end" || key === "recap") && sideHome()) return "side";
    // the Launch kit offer and its 50¢ card sit on the left, so the floor (front row) keeps the right half
    if ((key === "floor" || key === "pay2") && sideHome()) return "side";
    return "bottom"; // every surface rises from the bottom; the world is framed in the space above it
  }
  function build(key: string, s: FlowStateV7): string {
    const v = getView();
    if (key === "idea") return ideaHtml(flow.project.idea, typedIdea, false, paused() && !demo);
    if (key === "end") return ideaHtml(flow.project.idea, "", true, paused() && !demo);
    if ((key === "pay1" || key === "pay2") && flow.live && !demo) {
      const st = key === "pay1" ? 1 : 2;
      const avs = st === 1 ? (flow.roster.length ? flow.roster.map((a) => badge(a.name, a.color, 26)).join("") : "") : BUILD_TEAM.filter((b) => b !== "pip").map((b) => builderBadge(b, 26)).join("");
      return livePayHtml(st === 1 ? "validate" : "build", cfg?.prices[st === 1 ? "validate" : "build"] ?? (st === 1 ? 10 : KIT_CENTS), avs,
        st === 1 ? "Research" : "Launch kit", st === 1 ? "A research team picked for this idea" : "Your logo · your website · your 30-day plan",
        !!cfg?.mockAi, ldMark(18, undefined, true));
    }
    if (key === "pay1") return payHtml(flow, 1, !!typedIdea.trim() && typedIdea.trim() !== flow.project.idea.trim());
    if (key === "pay2") return payHtml(flow, 2, false);
    if (key.startsWith("hire")) return hireHtml(flow);
    if (key === "evidence") return evidenceHtml(flow, s.finding ?? 0);
    if (key === "work") return workHtml(flow);
    if (key === "doc") return reportDocHtml(flow);
    if (key === "report1") return reportOneHtml(flow);
    if (key.startsWith("report:")) return reportPage(flow, s.page ?? "score");
    if (key.startsWith("steer")) return steerHtml(flow, steerDraft);
    if (key === "floor") return kitOfferHtml(cfg?.prices.build ?? KIT_CENTS, !!cfg?.mockAi || flow.isSample(flow.project.id));
    if (key === "recap") return recapHtml();
    // A real project (also on a demo-mode server): the one Launch kit screen, filled in live from the server.
    if (key === "live" && flow.live) return `<div class="kit-root"></div>`;
    if (key === "live") return v ? livePanel(v, flow.report) : noBuildHtml(null);
    if (key === "offices") return officesFloorHtml(flow, v?.name ?? flow.project.title);
    if (key.startsWith("campus")) return campusHtml(flow);
    return "";
  }
  let disposePanel: (() => void) | null = null;
  function show(key: string | null, s: FlowStateV7) {
    if (key === curKey) return update(s);
    disposePanel?.();
    disposePanel = null;
    const old = curPanel;
    if (old) {
      old.classList.remove("in");
      old.classList.add("out");
      setTimeout(() => old.remove(), 280);
    }
    curKey = key;
    curPanel = null;
    if (!key) {
      setInsets({ left: 0, right: 0, top: 0, bottom: 0 });
      return;
    }
    const pos = posFor(key);
    const p = el(`<div class="panel ${pos === "doc" || pos === "card" ? "" : "glass"}" data-pos="${pos}" data-key="${key.split(":")[0]}">${pos === "sheet" ? `<button class="sheet-grip" type="button" data-act="sheet" aria-label="Expand"></button>` : ""}${build(key, s)}</div>`);
    stagger(p);
    panelsEl.appendChild(p);
    curPanel = p;
    countUp(p, 900);
    if (pos === "sheet") wireSheet(p);
    mount(p, key, s);
    requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add("in")));
    queueMicrotask(() => measure());
  }
  /** Phones: a sheet opens at 55% of the screen; drag its grip (or scroll its content) up to read it full height, drag
   *  it down to see the 3D again. */
  function toggleSheet(on?: boolean) {
    if (!curPanel || curPanel.dataset.pos !== "sheet") return;
    const full = on ?? curPanel.dataset.full !== "1";
    if ((curPanel.dataset.full === "1") === full) return;
    curPanel.dataset.full = full ? "1" : "0";
    curPanel.querySelector(".sheet-grip")?.setAttribute("aria-label", full ? "Collapse" : "Expand");
    if (!full) curPanel.scrollTop = 0;
    measure();
  }
  function wireSheet(p: HTMLElement) {
    const grip = p.querySelector<HTMLElement>(".sheet-grip");
    let y0 = 0, dragging = false, moved = false;
    grip?.addEventListener("pointerdown", (e) => {
      dragging = true;
      moved = false;
      y0 = e.clientY;
      grip.setPointerCapture(e.pointerId);
    });
    grip?.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dy = e.clientY - y0;
      if (Math.abs(dy) > 8) moved = true;
      if (dy < -36) toggleSheet(true), (dragging = false);
      else if (dy > 36) toggleSheet(false), (dragging = false);
    });
    grip?.addEventListener("pointerup", () => (dragging = false));
    // a tap on the grip toggles (the click handler); a drag already did its job
    grip?.addEventListener("click", (e) => moved && (e.stopPropagation(), (moved = false)), true);
    p.addEventListener("scroll", () => p.dataset.full !== "1" && p.scrollTop > 24 && toggleSheet(true), { passive: true });
  }
  /** Frames the world in the space the panel leaves. The panels are position:fixed, so page scroll (the home) never
   *  moves them; with no panel (the home hero owns the idea step) this leaves the insets to the home. */
  let hudBottom = 0;
  function measure() {
    if (!curPanel || !curKey) return;
    // the offices floor and the campus view (game/hud.ts) frame the world themselves; they fire resize on close
    if (document.documentElement.matches(".ld-offices, .ld-campus")) return;
    const pos = curPanel.dataset.pos as Pos;
    const r = curPanel.getBoundingClientRect();
    // under the top bar, and under the example strip when one is shown
    let top = (isMobile() ? 52 : 64) + (root.dataset.example === "1" ? (innerWidth <= 760 ? 44 : 48) : 0);
    // the HUD card (top-right on wide screens, v7.css) is over the world: frame the 3D below it
    // (an open switcher menu or drawer is a passing overlay: keep the framing of the closed card)
    const hud = document.documentElement.classList.contains("has-hud") ? root.querySelector<HTMLElement>(".hud:not(.phone) .hud-card") : null;
    const hudOpen = !!root.querySelector('.hud[data-open="1"], .hud-name[aria-expanded="true"]');
    if (hud && !hudOpen) hudBottom = Math.round(hud.getBoundingClientRect().bottom);
    if (!hud) hudBottom = 0;
    if (hudBottom && (pos === "side" || pos === "card")) top = Math.max(top, hudBottom + 8);
    // the tour's chapter row sits under the top bar: never frame the floor up under it
    const meta = root.querySelector<HTMLElement>(".db-meta");
    if (meta && meta.offsetParent) top = Math.max(top, Math.round(meta.getBoundingClientRect().bottom + 8));
    // bottom / centre cards on wide screens: the HUD card owns the top-right corner, keep the floor left of it
    const hudLeft = hud && !hudOpen && !isMobile() ? Math.round(hud.getBoundingClientRect().left) : 0;
    const right = hudLeft && hudLeft > innerWidth * 0.6 ? Math.round(innerWidth - hudLeft + 12) : 0;
    if (pos === "side" || pos === "card") setInsets({ left: Math.round(r.right + 8), right: 0, top, bottom: 0 });
    else if (pos === "sheet") {
      // an expanded sheet covers the world: keep framing for the collapsed height, the 3D comes back on collapse
      const h = curPanel.dataset.full === "1" ? Math.round(innerHeight * 0.55) : Math.round(innerHeight - r.top);
      setInsets({ left: 0, right: 0, top, bottom: Math.min(Math.round(innerHeight * 0.6), h + 8) });
    } else if (pos === "bottom" || pos === "center") setInsets({ left: 0, right, top, bottom: Math.round(innerHeight - r.top + 12) });
    else setInsets({ left: 0, right: 0, top: 0, bottom: 0 });
  }
  function setInsets(i: Insets) {
    if (Math.abs(i.bottom - insets.bottom) < 8 && Math.abs(i.top - insets.top) < 8 && Math.abs(i.left - insets.left) < 8 && Math.abs(i.right - insets.right) < 8) return;
    insets = i;
    world.setInsets(i);
  }

  /** Progressive updates inside the same surface (no remount). */
  function update(s: FlowStateV7) {
    if (!curPanel || !curKey) return;
    if (curKey === "work") {
      const pr = curPanel.querySelector(".wk-prog");
      if (pr) pr.innerHTML = progressBar(flow);
      const tm = curPanel.querySelector(".wk-team");
      if (tm) tm.innerHTML = teamRows(flow);
      ingestNotes();
      measure();
    } else if (curKey.startsWith("hire")) {
      curPanel.querySelectorAll<HTMLElement>(".hire").forEach((li, i) => (li.dataset.on = i < flow.hired ? "1" : "0"));
      measure();
    } else if (curKey === "evidence") {
      const i = s.finding ?? 0;
      const fd = i < flow.revealed ? flow.findings[i] : undefined;
      const slot = curPanel.querySelector<HTMLElement>(".ev-slot")!;
      const curId = slot.querySelector<HTMLElement>(".fcard")?.dataset.fid;
      const head = curPanel.querySelector(".ev-who");
      if (!fd && !slot.querySelector(".fcard")) slot.innerHTML = evWait(flow);
      if (fd && curId !== fd.id) {
        const fresh = el(evidenceHtml(flow, i));
        head?.replaceWith(fresh.querySelector(".ev-who")!);
        const card = el(findingCard(fd));
        const prev = slot.querySelector(".fcard");
        if (prev) {
          // the old card is gone before the new one fades in (no overlapping text mid-swap)
          prev.classList.add("leave");
          card.classList.add("after");
          setTimeout(() => prev.remove(), 180);
        } else slot.innerHTML = "";
        slot.appendChild(card);
        // the cell flies home: the newest cell pops
      }
      curPanel.querySelector(".ev-foot")!.replaceWith(el(evidenceFoot(flow, i)));
      const pop = curPanel.querySelector<HTMLElement>(`.cell[data-i="${flow.revealed - 1}"]`);
      if (pop && fd && i === flow.revealed - 1) pop.classList.add("pop");
    }
  }

  function mount(p: HTMLElement, key: string, s: FlowStateV7) {
    if (key === "live" && flow.live) {
      const host = p.querySelector<HTMLElement>(".kit-root");
      const id = flow.live.id;
      if (host) {
        const k = mountKitScreen(host, {
          projectId: id,
          ownerKey: savedProjects.ownerKey(id),
          readOnly: !demo && !!exampleOf(id),
          note: !demo ? kitNoteShort(exampleOf(id)?.kitNote) : undefined,
          // a practice / read-only kit has no offices of its own: offer your own idea instead of a blank intake form
          onOffices: () => {
            closeOverlay();
            demo?.exit();
            typedIdea = "";
            flow.next({ type: "new-project" });
          },
          onOwn: () => ((typedIdea = ""), flow.next({ type: "new-project" })),
        });
        // the panels fill in over time: keep the world framed above the sheet
        const ro = new ResizeObserver(() => measure());
        ro.observe(host);
        disposePanel = () => (k.stop(), ro.disconnect());
      }
    }
    if (key === "work") {
      feedEl = p.querySelector<HTMLElement>(".wk-feed");
      noteSeen.clear();
      ingestNotes();
      disposePanel = () => {
        feedEl = null;
        noteQ = [];
        bubble = null;
        clearTimeout(noteTimer);
        noteTimer = 0;
        bub.dataset.on = "0";
      };
    }
    if ((key === "pay1" || key === "pay2") && flow.live && !demo) {
      const host = p.querySelector<HTMLElement>(".pay-live");
      const id = flow.live.id;
      if (host)
        disposePanel = mountPay(host, {
          projectId: id,
          stage: key === "pay1" ? "validate" : "build",
          config: cfg,
          onPaid: () => {
            flow.live?.kick();
            if (flow.live?.id === id) flow.next({ type: "approve-pay" });
          },
        });
    }
    if ((key === "idea" || key === "end") && p.querySelector("textarea")) {
      const form = p.querySelector<HTMLFormElement>("form")!;
      const ta = form.querySelector<HTMLTextAreaElement>("textarea")!;
      const go = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
      const fail = (msg: string) => {
        go.disabled = false;
        form.querySelector(".idea-err")?.remove();
        form.querySelector(".idea-field")!.insertAdjacentHTML("afterend", `<p class="idea-err" role="alert">${esc(msg)}</p>`);
        measure();
      };
      const submit = () => {
        typedIdea = ta.value;
        if (demo) return flow.next({ type: "submit-idea", idea: ta.value });
        go.disabled = true;
        flow.submitIdea(ta.value).then(() => (go.disabled = false), (e: Error) => fail(e.message));
      };
      form.addEventListener("submit", (e) => (e.preventDefault(), submit()));
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          submit();
        }
      });
      // "Try an example": fills the box with the next sample sentence (the visitor still presses the button)
      let tryI = 0;
      form.querySelector<HTMLButtonElement>("[data-act=try-idea]")?.addEventListener("click", (e) => {
        e.stopPropagation();
        const ideas = cfg?.sampleIdeas ?? [];
        if (!ideas.length) return;
        ta.value = ideas[tryI++ % ideas.length]!;
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        ta.focus();
      });
      if (demo && key === "idea") typeInto(ta, flow.project.idea || DEMO_IDEA_FALLBACK, 3600);
      else if (!isMobile() && !deps.still) setTimeout(() => ta.focus({ preventScroll: true }), 400);
    }
    if ((key === "pay1" || key === "pay2") && demo) setTimeout(() => p.querySelector<HTMLButtonElement>("[data-act=approve]")?.click(), 1500);
    if (key.startsWith("steer")) {
      const form = p.querySelector<HTMLFormElement>(".steer-f");
      const ta = form?.querySelector<HTMLTextAreaElement>("textarea");
      if (form && ta) {
        ta.addEventListener("input", () => (steerDraft = ta.value));
        const send = () => {
          if (!ta.value.trim()) return ta.focus();
          const note = ta.value;
          steerDraft = "";
          flow.next({ type: "steer", note });
        };
        form.addEventListener("submit", (e) => (e.preventDefault(), send()));
        ta.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        });
        if (demo && !flow.steering) {
          typeInto(ta, steerSuggestions(flow)[0]!, 2200);
          setTimeout(() => ta.isConnected && send(), 2700);
        } else if (!isMobile() && !deps.still && !flow.steering) setTimeout(() => ta.focus({ preventScroll: true }), 300);
      }
    }
    void s;
  }

  // ────────────────────────────── calm progress notes: queued, one every ~2.6 s, so each one can be read
  const bub = $(".wbub");
  let feedEl: HTMLElement | null = null;
  let noteQ: WorkNote[] = [];
  const noteSeen = new Set<string>();
  let noteTimer = 0;
  let bubble: WorkNote | null = null;
  const NOTE_MS = 2600;
  flow.setWorkHold(() => !!feedEl && noteQ.length > 0);
  function ingestNotes() {
    const v7 = (flow.live?.project ?? flow.project).v7;
    for (const n of workNotes(flow, v7)) {
      if (noteSeen.has(n.key)) continue;
      noteSeen.add(n.key);
      noteQ.push(n);
    }
    // never a firehose: when the team outpaces the reader, keep only the newest few (shown faster, see showNote)
    if (noteQ.length > 8) {
      // keep each analyst's latest note, then the newest others, in the order they happened
      const keep = new Set<WorkNote>();
      const research = (n: WorkNote) => !/^(writing|first lines)\b/i.test(n.text);
      for (const n of [...noteQ].reverse()) if (n.role && research(n) && ![...keep].some((k) => k.role === n.role && research(k))) keep.add(n);
      for (const n of [...noteQ].reverse()) if (keep.size < 8) keep.add(n);
      noteQ = noteQ.filter((n) => keep.has(n));
    }
    if (!noteTimer) showNote();
  }
  function showNote() {
    noteTimer = 0;
    const n = noteQ.shift();
    if (!n || !feedEl) {
      bubble = null;
      bub.dataset.on = "0";
      return;
    }
    const li = el(noteRow(flow, n));
    feedEl.prepend(li);
    requestAnimationFrame(() => li.classList.add("in"));
    while (feedEl.children.length > 4) feedEl.lastElementChild!.remove();
    bubble = n.role ? n : null;
    if (bubble) {
      bub.innerHTML = bubbleHtml(flow, bubble);
      bub.dataset.on = "1";
    } else bub.dataset.on = "0";
    paintTags();
    measure();
    // a backlog plays faster (down to ~1.3 s a note) so a quick run still shows most of what the team did
    const pace = noteQ.length >= 4 ? NOTE_MS / 2 : noteQ.length >= 2 ? NOTE_MS * 0.7 : NOTE_MS;
    noteTimer = window.setTimeout(showNote, reducedMotion() ? 1200 : pace);
  }

  // ────────────────────────────── back: one control (chrome button · Esc · the browser's back button)
  const backBtn = $<HTMLButtonElement>(".back-btn");
  const goHome = (offices = false) => {
    closeOverlay();
    typedIdea = "";
    flow.next({ type: "new-project" });
    if (offices && flow.mine.length) openOverlay(officesHtml(flow), "offices");
  };
  /** Where Back goes from here, or null at the start. */
  function backTarget(): (() => void) | null {
    const s = flow.state;
    const doc = docMode(flow.project, flow.report);
    switch (s.step) {
      case "pay1":
        return () => {
          // back to the idea, text kept, so it can be edited and validated again
          const keep = typedIdea || flow.project.idea;
          flow.next({ type: "new-project" });
          typedIdea = keep;
          render(true);
        };
      case "hire":
      case "evidence":
        return () => goHome(true); // a real run keeps working on the server; it waits in Your offices
      case "report": {
        const i = REPORT_PAGES.indexOf(s.page ?? "score");
        if (!doc && i > 0) return () => flow.goto({ step: "report", page: "score" });
        return () => goHome(true);
      }
      case "steer":
        return () => flow.goto({ step: "report", page: "score" });
      case "floor":
      case "pay2":
      case "live":
        return flow.report ? () => flow.goto({ step: "report", page: "score" }) : () => goHome(true);
      case "building":
        return () => flow.goto({ step: flow.live?.paid.build || (!flow.live && flow.project.legacy) ? "live" : "report", page: "score" });
      case "district":
        return () => goHome();
      case "end":
        return () => goHome();
      default:
        return null;
    }
  }
  function goBack(): boolean {
    if (overlay.dataset.open === "1") {
      closeOverlay();
      return true;
    }
    if (demo || flow.moving) return false;
    const t = backTarget();
    if (!t) return false;
    t();
    return true;
  }
  function paintBack() {
    const show = !demo && !!backTarget();
    backBtn.hidden = !show;
  }
  // History: each surface the founder reaches is one browser entry, so the browser's back button = our Back.
  // Each entry remembers its index and what it showed, so Forward can return to it (Back = our Back).
  type HistEntry = { ld: 1; i: number; pid?: string | null; step?: FlowStateV7["step"]; page?: string };
  let histKey = "";
  let histIdx = 0;
  let popping = false;
  const entryNow = (i: number): HistEntry => ({ ld: 1, i, pid: flow.live?.id ?? null, step: flow.state.step, page: flow.state.page });
  try {
    const st = history.state as HistEntry | null;
    histIdx = typeof st?.i === "number" ? st.i : 0;
    history.replaceState({ ...entryNow(histIdx) }, "");
  } catch {
    /* sandboxed */
  }
  const HIST_SAFE: ReadonlyArray<FlowStateV7["step"]> = ["report", "floor", "pay2", "live", "steer"];
  let restoring: HistEntry | null = null;
  function pushHistory() {
    const s = flow.state;
    const k = `${s.step}:${s.page ?? ""}:${flow.project.id}`;
    if (k === histKey) return;
    const first = !histKey;
    histKey = k;
    if (popping || demo || deps.still) return;
    // Reopening a project from Back/Forward: land on the surface that entry showed, in the same entry (no new one).
    if (restoring && flow.live?.id === restoring.pid && s.step !== "bedroom") {
      const want = restoring;
      restoring = null;
      if (want.step && want.step !== s.step && HIST_SAFE.includes(want.step) && (want.step !== "live" || s.step === "live")) {
        popping = true;
        try {
          flow.goto({ step: want.step, ...(want.page ? { page: want.page as never } : {}) });
        } finally {
          popping = false;
        }
        histKey = `${flow.state.step}:${flow.state.page ?? ""}:${flow.project.id}`;
      }
      try {
        history.replaceState(entryNow(histIdx), "", location.pathname + location.search);
      } catch {
        /* sandboxed */
      }
      return;
    }
    try {
      if (first) history.replaceState(entryNow(histIdx), "", location.pathname + location.search);
      else if (s.step !== "bedroom") history.pushState(entryNow(++histIdx), "", location.pathname + location.search);
    } catch {
      /* sandboxed */
    }
  }
  addEventListener("popstate", (e) => {
    const st = e.state as HistEntry | null;
    const forward = typeof st?.i === "number" && st.i > histIdx;
    if (typeof st?.i === "number") histIdx = st.i;
    popping = true;
    try {
      // Back and Forward both return to what that entry showed, for the surfaces that can be reopened as they were;
      // anything else (a run in progress, the pay card for the research) takes our Back.
      if (st?.pid && st.pid !== flow.live?.id && !demo) {
        closeOverlay();
        restoring = st;
        flow.next({ type: "switch-project", id: st.pid });
      } else if (st && overlay.dataset.open === "1" && !forward) closeOverlay();
      else if (st?.pid && st.step && HIST_SAFE.includes(st.step) && !flow.moving) {
        closeOverlay();
        flow.goto({ step: st.step, ...(st.page ? { page: st.page as never } : {}) });
      } else if (forward && st && !st.pid && flow.live && !demo) goHome(true);
      else if (!forward) goBack();
    } finally {
      popping = false;
    }
    histKey = `${flow.state.step}:${flow.state.page ?? ""}:${flow.project.id}`;
    // keep the address bar on the run that is really shown
    const want = flow.live ? `/p/${encodeURIComponent(flow.live.id)}` : "/";
    try {
      if (location.pathname !== want && (flow.live || /^\/p\//.test(location.pathname))) history.replaceState(history.state, "", want + location.search);
    } catch {
      /* sandboxed */
    }
  });

  function typeInto(ta: HTMLTextAreaElement, text: string, ms: number) {
    if (reducedMotion()) {
      ta.value = text;
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      ta.value = text.slice(0, Math.round(text.length * k));
      if (k < 1 && ta.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ────────────────────────────── floating tags (analyst name over their head · build work tag)
  function paintTags() {
    const s = flow.state;
    const v = getView();
    let target: Parameters<WorldV7["actorScreenPoint"]>[0] | null = null;
    if (s.step === "evidence" && s.analyst && curKey === "evidence" && !curPanel?.matches(".out")) target = s.analyst;
    if (curKey === "work" && bubble?.role) {
      const pt = world.actorScreenPoint(bubble.role);
      if (pt && pt.y > 80) {
        const x = Math.min(innerWidth - 140, Math.max(140, pt.x));
        bub.style.transform = `translate(${Math.round(x)}px, ${Math.round(pt.y - 16)}px) translate(-50%, -100%)`;
        bub.dataset.on = "1";
      } else bub.dataset.on = "0";
    } else if (bub.dataset.on === "1" && curKey !== "work") bub.dataset.on = "0";
    if (target) {
      const a = who(flow, target as never);
      const pt = world.actorScreenPoint(target);
      if (pt && pt.y > 60) {
        if (atag.dataset.who !== a.id) {
          atag.innerHTML = analystTag(a);
          atag.dataset.who = a.id;
        }
        atag.style.transform = `translate(${Math.round(pt.x)}px, ${Math.round(pt.y - 14)}px) translate(-50%, -100%)`;
        atag.dataset.on = "1";
      } else atag.dataset.on = "0";
    } else atag.dataset.on = "0";
    if (s.step === "build" && s.phase === "working" && s.builder && v) {
      if (wtag.dataset.who !== s.builder) {
        wtag.innerHTML = workTag(s.builder);
        wtag.dataset.who = s.builder;
      }
      const pt = world.actorScreenPoint(s.builder);
      const x = pt ? Math.min(innerWidth - 150, Math.max(150, pt.x)) : innerWidth / 2;
      const y = pt ? Math.max(90, pt.y - 24) : innerHeight * 0.4;
      wtag.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
      wtag.dataset.on = "1";
    } else {
      wtag.dataset.on = "0";
      wtag.dataset.who = "";
    }
  }
  world.onCameraChange(paintTags);

  /** "Download PDF": the browser's print dialog with the report's own print stylesheet (report-doc.css @media print). */
  function printReport() {
    const t = document.title;
    document.title = `${flow.project.title} · LaunchDesk report`;
    const done = () => {
      document.title = t;
      removeEventListener("afterprint", done);
    };
    addEventListener("afterprint", done);
    window.print();
  }

  // ────────────────────────────── overlays
  function openOverlay(html: string, kind: string) {
    const body = overlay.querySelector<HTMLElement>(".ov-body")!;
    body.dataset.kind = kind;
    body.innerHTML = `<div class="ov-card glass" data-kind="${kind}">${html}</div>`;
    overlay.dataset.open = "1";
    const card = body.firstElementChild as HTMLElement;
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("in")));
  }
  function closeOverlay() {
    overlay.dataset.open = "0";
  }
  function openFinding(id: string) {
    const fd = flow.findings.find((x) => x.id === id);
    if (!fd) return;
    openOverlay(sourceHtml(fd, who(flow, fd.analyst)), "source");
  }

  // ────────────────────────────── actions
  root.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!t) return;
    const act = t.dataset.act!;
    if (act === "approve") {
      if (t.dataset.state) return;
      t.dataset.state = "busy";
      const at = flow.state.step;
      setTimeout(() => {
        t.dataset.state = "done";
        if (flow.state.step === at) flow.next({ type: "approve-pay" });
      }, reducedMotion() ? 0 : 650);
      return;
    }
    if (act === "back") return void goBack();
    if (act === "pdf") return printReport();
    if (act === "doc-jump") {
      e.preventDefault();
      return curPanel?.querySelector(`#${t.dataset.to}`)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    }
    if (act === "next") return flow.next({ type: "next" });
    if (act === "continue") return flow.next({ type: "continue" });
    if (act === "prev" || act === "page") {
      const i = REPORT_PAGES.indexOf(flow.state.page ?? "score");
      const page = act === "page" ? (t.dataset.page as (typeof REPORT_PAGES)[number]) : REPORT_PAGES[Math.max(0, i - 1)]!;
      return flow.goto({ step: "report", page });
    }
    // a finished example's kit is already made: "See the launch kit" opens it, never the 50¢ offer (PLAN.md 6.5)
    if (act === "grow" && flow.live && exampleOf(flow.live.id)) return flow.goto({ step: "live" });
    if (act === "steer" && flow.live && exampleOf(flow.live.id)) return; // read-only: the strip offers "Try your own idea"
    if (act === "grow") return flow.next({ type: "decide", choice: "grow" });
    if (act === "pivot") return flow.next({ type: "decide", choice: "pivot" });
    if (act === "steer") return flow.goto({ step: "steer" });
    if (act === "sheet") return toggleSheet();
    if (act === "how" || act === "blaze") {
      e.preventDefault();
      return toSection(act);
    }
    if (act === "open-offices") {
      const id = flow.live?.id;
      return void import("./offices").then((m) => (id && !exampleOf(id) ? m.openOffices({ projectId: id, ownerKey: savedProjects.ownerKey(id), name: getView()?.name }) : m.openOffices({ name: getView()?.name })));
    }
    if (act === "ask-scale") {
      steerDraft = "What would make it scale?";
      return flow.goto({ step: "steer" });
    }
    if (act === "report") return flow.goto({ step: "report", page: "score" });
    if (act === "suggest") {
      const ta = curPanel?.querySelector<HTMLTextAreaElement>(".steer-f textarea");
      if (ta) {
        ta.value = t.textContent ?? "";
        steerDraft = ta.value;
        ta.focus();
      }
      return;
    }
    if (act === "peek") return flow.peek(Number(t.dataset.i));
    if (act === "source" || act === "finding") return openFinding(t.dataset.f!);
    if (act === "offices") return openOverlay(officesHtml(flow), "offices");
    if (act === "switch") {
      closeOverlay();
      demo?.exit();
      // a finished example opens on its report (like the ribbon's "Another example")
      if (t.dataset.at === "report") return flow.next({ type: "switch-project", id: t.dataset.id!, at: "report" });
      return flow.next({ type: "switch-project", id: t.dataset.id! });
    }
    if (act === "new") {
      closeOverlay();
      demo?.exit();
      typedIdea = "";
      return flow.next({ type: "new-project" });
    }
    if (act === "replay" || act === "tour") return void (location.href = "/?demo=1");
    if (act === "example") {
      closeOverlay();
      // The real finished example (server seed): open it on its report. No payment, no wallet.
      const go = (x: ReturnType<typeof mainExample>) => {
        demo?.exit();
        if (x) return flow.next({ type: "switch-project", id: x.id, at: "report" });
        replaySample();
      };
      if (knownExamples().length) return go(mainExample());
      void examples().then(() => go(mainExample()));
      return;
    }
    if (act === "see-proof") return jumpToProof();
    if (act === "site") {
      const slug = flow.live?.siteSlug;
      if (slug) return void open(`/s/${encodeURIComponent(slug)}`, "_blank", "noopener");
      const v = getView();
      return v && openOverlay(siteOverlay(v), "site");
    }
    if (act === "pack") return openOverlay(reportReader(flow), "reader");
    if (act === "close") return closeOverlay();
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.dataset.open === "1") return closeOverlay();
    if (e.key === "Escape" && !demo && !(e.target as HTMLElement)?.closest?.("textarea, input")) return void goBack();
    if (demo || overlay.dataset.open === "1") return;
    if ((e.target as HTMLElement)?.closest?.("textarea, input")) return;
    const s = flow.state;
    if ((e.key === "ArrowRight" || e.key === "Enter") && (s.step === "evidence" || s.step === "floor")) return flow.next({ type: "next" });
  });

  // ────────────────────────────── render loop (flow events)
  function render(force = false) {
    const s = flow.state;
    root.dataset.step = s.step;
    paintChrome();
    paintMode();
    if (force) curKey = null;
    show(keyFor(s), s);
    root.dataset.doc = curKey === "doc" ? "1" : "0";
    paintBack();
    pushHistory();
    paintTags();
    paintExample();
  }
  let fastExample = false;
  /** An older server without /api/examples: replay the bundled sample fast instead (findings stream in, then the report). */
  function replaySample() {
    const done = flow.projects.find((p) => flow.isSample(p.id) && p.v7.report?.scalability.cap === 3) ?? flow.projects[flow.projects.length - 1];
    if (!done) return;
    flow.next({ type: "switch-project", id: done.id });
    flow.setTiming({ findingEvery: 520, analystGap: 320, reportTail: 600 });
    fastExample = true;
    flow.goto({ step: "evidence" }, { animate: true });
  }

  // ────────────────────────────── the finished example's ribbon · "locked, not paid yet" after paying
  const ribbon = el(`<div class="ex-ribbon-host"></div>`);
  // the panels under the ribbon leave room for its real height (it grows with the kit note and on phones)
  const ribbonH = () => {
    const h = ribbon.querySelector<HTMLElement>(".ex-ribbon")?.offsetHeight ?? 0;
    if (h) root.style.setProperty("--ex-ribbon-h", `${h}px`);
  };
  const ribbonRo = typeof ResizeObserver === "function" ? new ResizeObserver(ribbonH) : null;
  root.appendChild(ribbon);
  let ribbonKey = "";
  /** The proof panel is on screen (the ribbon marks "Proof on Bitcoin Cash" as pressed instead of "Report"). */
  let proofShown = false;
  const proofIo = typeof IntersectionObserver === "function"
    ? new IntersectionObserver((es) => {
        const v = es.some((x) => x.isIntersecting);
        if (v !== proofShown) (proofShown = v), paintExample();
      }, { threshold: 0.25 })
    : null;
  let proofWatched: Element | null = null;
  setInterval(() => {
    const ep = flow.state.step === "report" ? document.querySelector(".ep-panel") : null;
    if (ep === proofWatched) return;
    if (proofWatched) proofIo?.unobserve(proofWatched);
    proofWatched = ep;
    if (ep) proofIo?.observe(ep);
    else if (proofShown) (proofShown = false), paintExample();
  }, 500);
  function paintExample() {
    const s = flow.state;
    const x = flow.live && !demo ? exampleOf(flow.live.id) : null;
    const at = s.step === "live" ? "kit" : proofShown ? "proof" : "report";
    const on = !!x && (s.step === "report" || s.step === "live" || s.step === "steer" || s.step === "floor");
    root.dataset.example = on ? "1" : "0";
    // on the offices floor the ribbon would cover "New idea" (the list there already holds the examples)
    const show = on && !!x && s.step !== "floor";
    const k = show && x ? `${x.id}:${at}` : "";
    if (k !== ribbonKey) {
      ribbonKey = k;
      ribbon.innerHTML = show && x ? ribbonHtml(x, at, knownExamples()) : "";
      ribbonRo?.disconnect();
      const rb = ribbon.querySelector<HTMLElement>(".ex-ribbon");
      if (rb) ribbonRo?.observe(rb);
      ribbonH();
    }
    paintLock();
  }
  const lockEl = el(`<div class="ex-lock-host"></div>`);
  root.appendChild(lockEl);
  /** Escrow on and a real payment just made: say plainly that the money is held by the contract until delivery. */
  function paintLock() {
    const s = flow.state;
    const pay = flow.live?.paid.validate;
    const real = !!pay && !pay.txid.startsWith("dev-") && pay.sats > 0;
    const on = ESCROW && !demo && !!flow.live && !exampleOf(flow.live.id) && real && !flow.live.phase1Done && (s.step === "hire" || s.step === "evidence");
    const html = on ? lockedHtml(pay!.cents || cfg?.prices.validate || 10) : "";
    if (lockEl.dataset.on !== (on ? "1" : "0")) {
      lockEl.dataset.on = on ? "1" : "0";
      lockEl.innerHTML = html;
    }
  }
  ribbon.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-ex]");
    if (!b) return;
    const what = b.dataset.ex;
    if (what === "report") return flow.goto({ step: "report", page: "score" });
    if (what === "kit") return flow.goto({ step: "live" });
    if (what === "other" && b.dataset.id) return flow.next({ type: "switch-project", id: b.dataset.id, at: "report" });
    if (what === "own") {
      typedIdea = "";
      return flow.next({ type: "new-project" });
    }
    if (what === "proof") jumpToProof();
  });
  function jumpToProof() {
    const jump = () => document.querySelector(".ep-panel")?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    if (flow.state.step !== "report") flow.goto({ step: "report", page: "score" });
    // the proof panel mounts itself under the report once it is on screen
    let n = 0;
    const tryJump = () => (document.querySelector(".ep-panel") ? jump() : ++n < 30 && setTimeout(tryJump, 120));
    tryJump();
  }
  flow.onChange((st) => {
    if (fastExample && st.step !== "evidence") {
      fastExample = false;
      flow.setTiming({});
    }
    render();
  });
  addEventListener("resize", () => {
    // crossing the wide/narrow line on the home moves the card (side ↔ bottom); keep what was typed
    if (curPanel && (curKey === "idea" || curKey === "end") && posFor(curKey) !== curPanel.dataset.pos) {
      const ta = curPanel.querySelector<HTMLTextAreaElement>("textarea");
      if (ta && curKey === "idea") typedIdea = ta.value;
      render(true);
    }
    measure();
    paintTags();
  });
  render();
  // the HUD grows/shrinks as the game state changes: re-frame the world under it
  if (typeof ResizeObserver === "function") new ResizeObserver(() => measure()).observe($("#hud").querySelector(".hud") ?? $("#hud"));
  // the home (ui/home.ts) may take the idea step after this first paint: drop the fallback card then
  const homeMo = typeof MutationObserver === "function" ? new MutationObserver(() => curKey === "idea" && homeOwned() && !demo && render(true)) : null;
  homeMo?.observe(homeSlot, { childList: true, attributes: true, attributeFilter: ["data-owns"] });

  return {
    openOffices: () => openOverlay(officesHtml(flow), "offices"),
    dispose: () => {
      unmountHome();
      unmountHud();
      root.remove();
    },
  };
}
