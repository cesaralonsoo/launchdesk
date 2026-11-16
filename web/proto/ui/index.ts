// v7 · Every DOM surface (WS-EXP). One surface at a time over the world: the chrome (logo · growth track · your
// offices), one panel for the current step, a floating name tag on whoever works, and overlays (source, offices,
// report, site). Reads the flow; only calls flow.next / goto / peek. Fixed light theme: nothing here listens to the clock.
import "./ui.css";
import "./v7.css";
import "./report-doc.css";
import { DEMO_LENGTH_S, LEVEL_META, type FlowStateV7, type Insets, type ProjectV7, type WorldLevel, type WorldV7 } from "../contracts";
import { REPORT_PAGES, type ProtoFlowV7 } from "../flow";
import { DEMO_CHAPTERS, type Demo } from "../flow/demo";
import type { Project } from "../../src/types";
import { resultCard } from "./cards";
import { countUp, el, esc, isMobile, reducedMotion, stagger } from "./dom";
import { ldLogo } from "./logo";
import { livePanel, siteOverlay } from "./moments";
import { levelGlyph } from "./pixel";
import {
  noBuildHtml,
  analystTag, boomHtml, evidenceFoot, evidenceHtml, evWait, findingCard, floorHtml, hireHtml, ideaHtml, levelHtml, officesHtml,
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
import { kitOfferHtml, mountKitScreen, officesTeaserHtml } from "./kit-screen";
import { projects as savedProjects } from "../../src/app/projects";
import { BUILD_TEAM } from "../contracts";
import type { AppConfig as AppConfigLike } from "../../src/types";

export interface Ui {
  openOffices(): void;
  dispose(): void;
}
export interface UiDeps {
  world: WorldV7;
  flow: ProtoFlowV7;
  demo: Demo | null;
  still?: boolean;
}

type Pos = "center" | "bottom" | "sheet" | "boom" | "doc";
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
    paintMode();
    if (curKey === "idea" || curKey === "end") render(true);
  });
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
  /** The project created for the idea on the pay card, until it is paid (Back + resubmit reuses it). */
  let lastUnpaid: { idea: string; proj: ProjectV7 } | null = null;
  let steerDraft = "";

  const root = el(`<div class="ui v7">
    <header class="chrome">
      <div class="chrome-l"><a class="wordmark" href="/" aria-label="LaunchDesk, start over">${ldLogo(24)}</a><button class="back-btn glass" type="button" data-act="back" hidden title="Back (Esc)" aria-label="Back"><span class="bb-i">${I.back(15)}</span><span class="bb-t">Back</span></button></div>
      <ol class="grow" aria-label="Growth"></ol>
      <div class="chrome-r"><span class="live-tag" hidden></span><button class="offices-btn glass" type="button" data-act="offices" aria-label="Your offices"><span class="ob-g"></span><span class="ob-t">Your offices</span></button></div>
    </header>
    <div class="demo-bar" hidden><div class="db-track"></div><div class="db-meta"><span class="db-ch"></span><span class="db-keys"><kbd>Space</kbd> pause <kbd>→</kbd> skip <kbd>Esc</kbd> exit</span></div></div>
    <div class="atag" data-on="0"></div>
    <div class="wtag glass" data-on="0"></div>
    <div class="wbub" data-on="0" aria-hidden="true"></div>
    <div class="panels"></div>
    <div class="overlay" data-open="0"><div class="scrim" data-act="close"></div><div class="ov-body"></div></div>
  </div>`);
  host.appendChild(root);
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const growEl = $(".grow"), panelsEl = $(".panels"), overlay = $(".overlay"), atag = $(".atag"), wtag = $(".wtag"), obG = $(".ob-g");
  const demoBar = $(".demo-bar");
  const modeTag = $(".live-tag");
  /** The honest label: a real run on a sample-data server, or a sample world shown as an example. */
  function paintMode() {
    const st = flow.state.step;
    let k = "", t = "";
    if (demo) k = "";
    else if (flow.live) {
      if (cfg?.mockAi) (k = "demo"), (t = "Sample data");
    } else if (st === "idea" || st === "end" || st === "bedroom") {
      if (cfg?.mockAi) (k = "demo"), (t = "Sample data");
    } else if (flow.isSample(flow.project.id)) (k = "example"), (t = "Example");
    modeTag.hidden = !k;
    if (k && (modeTag.dataset.k !== k || modeTag.dataset.t !== t)) {
      modeTag.dataset.k = k;
      modeTag.dataset.t = t;
      modeTag.title = t;
      // Phones get the short word so the tag never pushes "Your offices" off-screen.
      modeTag.innerHTML = `<i></i><span class="lt-l">${t}</span><span class="lt-s">${k === "demo" ? "Sample" : t}</span>`;
    }
  }

  // ────────────────────────────── chrome: the growth track (room → floor → building → district)
  let growKey = "";
  function paintGrow() {
    const cur = world.worldLevel as WorldLevel;
    const cap = flow.cap;
    const key = `${cur}:${cap}`;
    if (key === growKey) return;
    growKey = key;
    growEl.innerHTML = ([0, 1, 2, 3] as WorldLevel[])
      .map((l) => `<li data-s="${l === cur ? "now" : l < cur ? "done" : l > cap ? "ghost" : "next"}" title="${LEVEL_META[l].name}${l > cap ? " · beyond this idea's reach" : ""}">${levelGlyph(l, 16)}<span>${LEVEL_META[l].short}</span></li>`)
      .join("");
    obG.innerHTML = I.grid(14); // a plain "your projects" mark, not a game level
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
      ch.textContent = `${demo.paused ? "Paused · " : ""}${c?.[1] ?? ""}`;
    });
  }

  // ────────────────────────────── panels
  let curKey: string | null = null;
  let curPanel: HTMLElement | null = null;
  let insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };

  function keyFor(s: FlowStateV7): string | null {
    if (flow.moving && s.step !== "boom") return null;
    switch (s.step) {
      case "bedroom":
        return null;
      case "idea":
      case "end":
        return s.step;
      case "pay1":
      case "pay2":
        return s.step;
      case "hire":
        return `hire:${flow.roster.length}`;
      case "evidence":
        return flow.calm ? "work" : "evidence";
      case "report":
        return docMode(flow.project, flow.report) ? "doc" : `report:${s.page ?? "score"}`;
      case "steer":
        return `steer:${flow.steers.length}:${flow.steering?.status ?? "none"}`;
      case "boom":
        return flow.moving ? "boom" : null;
      case "floor":
        return "floor";
      case "build":
        return s.phase === "result" ? `build:${s.builder}` : null;
      case "building":
      case "district":
        return `${s.step}:${flow.cap}:${flow.chosenPath ?? "-"}`;
      default:
        return s.step;
    }
  }
  function posFor(key: string): Pos {
    if (key === "boom") return "boom";
    if (key === "doc") return "doc";
    if (isMobile()) return "sheet";
    return "bottom"; // every surface rises from the bottom; the world is framed in the space above it
  }
  function build(key: string, s: FlowStateV7): string {
    const v = getView();
    if (key === "idea") return ideaHtml(flow.project.idea, typedIdea);
    if (key === "end") return ideaHtml(flow.project.idea, "", true);
    if ((key === "pay1" || key === "pay2") && flow.live && !demo) {
      const st = key === "pay1" ? 1 : 2;
      const avs = st === 1 ? (flow.roster.length ? flow.roster.map((a) => badge(a.name, a.color, 26)).join("") : "") : BUILD_TEAM.filter((b) => b !== "pip").map((b) => builderBadge(b, 26)).join("");
      return livePayHtml(st === 1 ? "validate" : "build", cfg?.prices[st === 1 ? "validate" : "build"] ?? (st === 1 ? 10 : KIT_CENTS), avs,
        st === 1 ? "Validate your idea" : "Launch kit", st === 1 ? "A research team picked for this idea" : "Your logo · your website · your 30-day plan",
        !!cfg?.mockAi, ldMark(18, undefined, true));
    }
    if (key === "pay1") return payHtml(flow, 1, !!typedIdea.trim() && typedIdea.trim() !== flow.project.idea.trim());
    if (key === "pay2") return payHtml(flow, 2, false);
    if (key.startsWith("hire")) return hireHtml(flow);
    if (key === "evidence") return evidenceHtml(flow, s.finding ?? 0);
    if (key === "work") return workHtml(flow);
    if (key === "doc") return reportDocHtml(flow);
    if (key.startsWith("report:")) return reportPage(flow, s.page ?? "score");
    if (key.startsWith("steer")) return steerHtml(flow, steerDraft);
    if (key === "boom") return boomHtml();
    if (key === "floor") return kitOfferHtml(cfg?.prices.build ?? KIT_CENTS);
    if (key.startsWith("build:")) return v ? resultCard(v, s.builder!) : s.phase === "result" ? noBuildHtml(s.builder ?? null) : "";
    // A real project (also on a demo-mode server): the one Launch kit screen, filled in live from the server.
    if (key === "live" && flow.live) return `<div class="kit-root"></div>`;
    if (key === "live") return v ? livePanel(v, flow.report) : noBuildHtml(null);
    if (key.startsWith("building")) return levelHtml(flow, 2, v?.name ?? flow.project.title);
    if (key.startsWith("district")) return levelHtml(flow, 3, v?.name ?? flow.project.title);
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
    const p = el(`<div class="panel ${pos === "boom" || pos === "doc" ? "" : "glass"}" data-pos="${pos}" data-key="${key.split(":")[0]}">${build(key, s)}</div>`);
    stagger(p);
    panelsEl.appendChild(p);
    curPanel = p;
    countUp(p, 900);
    mount(p, key, s);
    requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add("in")));
    queueMicrotask(() => measure());
  }
  function measure() {
    if (!curPanel || !curKey) return;
    const pos = curPanel.dataset.pos as Pos;
    const r = curPanel.getBoundingClientRect();
    if (pos === "bottom" || pos === "sheet" || pos === "center") setInsets({ left: 0, right: 0, top: isMobile() ? 56 : 64, bottom: Math.round(innerHeight - r.top + 12) });
    else setInsets({ left: 0, right: 0, top: 0, bottom: 0 });
  }
  function setInsets(i: Insets) {
    if (Math.abs(i.bottom - insets.bottom) < 8 && Math.abs(i.top - insets.top) < 8) return;
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
          onOffices: (name) => openOverlay(officesTeaserHtml(name || "your business"), "offices"),
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
    if (key === "idea" || key === "end") {
      const form = p.querySelector<HTMLFormElement>("form")!;
      const ta = form.querySelector<HTMLTextAreaElement>("textarea")!;
      const go = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
      let sending = false;
      // The sample sentences are one click away from the start (a judge never has to type to see a run).
      const chipsHtml = () =>
        cfg?.sampleIdeas.length ? `<div class="idea-chips">${cfg.sampleIdeas.map((x) => `<button type="button" data-idea="${esc(x)}">${esc(x.split(",")[0]!)}</button>`).join("")}</div>` : "";
      const wireChips = () => form.querySelectorAll<HTMLButtonElement>("[data-idea]").forEach((b) => b.addEventListener("click", () => ((ta.value = b.dataset.idea!), submit())));
      const fail = (msg: string) => {
        sending = false;
        go.disabled = false;
        form.querySelector(".idea-err")?.remove();
        form.querySelector(".idea-chips")?.remove();
        form.querySelector(".idea-field")!.insertAdjacentHTML("afterend", `<p class="idea-err" role="alert">${esc(msg)}</p>${cfg?.mockAi ? chipsHtml() : ""}`);
        wireChips();
        measure();
      };
      const submit = () => {
        // An empty box runs the idea shown as the placeholder instead of an error.
        if (!ta.value.trim() && !demo && key === "idea") ta.value = ta.placeholder;
        typedIdea = ta.value;
        if (demo) return flow.next({ type: "submit-idea", idea: ta.value });
        const idea = ta.value.trim();
        if (idea.length < 15) return fail(idea ? "Tell us a bit more: one full sentence." : "Type your idea first.");
        if (sending) return;
        // pay → Back → submit the same idea again: reuse the unpaid project instead of piling up a new one each time
        if (lastUnpaid && lastUnpaid.idea === idea) return flow.startLive(lastUnpaid.proj, "new");
        sending = true;
        go.disabled = true;
        createProject(idea).then(
          (proj) => ((lastUnpaid = { idea, proj }), flow.startLive(proj, "new")),
          (e: Error) => fail(e.message || "Could not start. Try again."),
        );
      };
      form.addEventListener("submit", (e) => (e.preventDefault(), submit()));
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          submit();
        }
      });
      if (!demo && cfg?.sampleIdeas.length) {
        form.querySelector(".idea-field")!.insertAdjacentHTML("afterend", chipsHtml());
        wireChips();
      }
      if (demo && key === "idea") typeInto(ta, flow.project.idea || DEMO_IDEA_FALLBACK, 3600);
      else if (!isMobile() && !deps.still) setTimeout(() => ta.focus({ preventScroll: true }), 400);
    }
    if (demo && (key.startsWith("district") || key.startsWith("building")) && flow.cap < (key.startsWith("district") ? 3 : 2))
      setTimeout(() => demo && p.isConnected && p.querySelector<HTMLButtonElement>("[data-act=path]")?.click(), 1200);
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
        if (!doc && i > 0) return () => flow.goto({ step: "report", page: REPORT_PAGES[i - 1]! });
        return () => goHome(true);
      }
      case "steer":
        return () => flow.goto({ step: "report", page: doc ? "score" : "next" });
      case "boom":
      case "floor":
      case "pay2":
      case "build":
      case "live":
        return flow.report ? () => flow.goto({ step: "report", page: doc ? "score" : "next" }) : () => goHome(true);
      case "building":
        return () => flow.goto({ step: flow.project.legacy ? "live" : "floor" });
      case "district":
        return () => flow.goto({ step: "building" });
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
      setTimeout(() => {
        t.dataset.state = "done";
        flow.next({ type: "approve-pay" });
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
    if (act === "grow") return flow.next({ type: "decide", choice: "grow" });
    if (act === "pivot") return flow.next({ type: "decide", choice: "pivot" });
    if (act === "steer") return flow.goto({ step: "steer" });
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
      return flow.next({ type: "switch-project", id: t.dataset.id! });
    }
    if (act === "new") {
      closeOverlay();
      demo?.exit();
      typedIdea = "";
      return flow.next({ type: "new-project" });
    }
    if (act === "replay" || act === "tour") return void (location.href = "?demo=1");
    if (act === "example") {
      // Replay the finished sample fast: findings stream in (~10 s), then the report opens. The world levels follow
      // from the report's own buttons.
      const done = flow.projects.find((p) => flow.isSample(p.id) && p.v7.report?.scalability.cap === 3) ?? flow.projects[flow.projects.length - 1];
      if (!done) return;
      flow.next({ type: "switch-project", id: done.id });
      flow.setTiming({ findingEvery: 520, analystGap: 320, reportTail: 600 });
      fastExample = true;
      return flow.goto({ step: "evidence" }, { animate: true });
    }
    if (act === "path") return flow.commitPath(Number(t.dataset.i));
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
    if (e.key === "ArrowRight" || e.key === "Enter") {
      if (s.step === "report" && s.page !== "next") return flow.next({ type: "next" });
      if (s.step === "evidence" || s.step === "floor" || s.step === "live" || s.step === "building" || (s.step === "build" && s.phase === "result")) return flow.next({ type: "next" });
    }
    if (e.key === "ArrowLeft" && s.step === "report") {
      const i = REPORT_PAGES.indexOf(s.page ?? "score");
      if (i > 0) flow.goto({ step: "report", page: REPORT_PAGES[i - 1]! });
    }
  });

  // ────────────────────────────── render loop (flow events)
  function render(force = false) {
    const s = flow.state;
    if (lastUnpaid && !["idea", "pay1", "bedroom"].includes(s.step)) lastUnpaid = null;
    root.dataset.step = s.step;
    paintGrow();
    paintMode();
    if (force) curKey = null;
    show(keyFor(s), s);
    root.dataset.doc = curKey === "doc" ? "1" : "0";
    paintBack();
    pushHistory();
    paintTags();
  }
  let fastExample = false;
  flow.onChange((st) => {
    if (fastExample && st.step !== "evidence") {
      fastExample = false;
      flow.setTiming({});
    }
    render();
  });
  addEventListener("resize", () => {
    measure();
    paintTags();
  });
  render();
  // the growth track follows the world's level while it animates (boom, pull-backs)
  setInterval(paintGrow, 250);

  return {
    openOffices: () => openOverlay(officesHtml(flow), "offices"),
    dispose: () => root.remove(),
  };
}
