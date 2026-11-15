// v7 · Every DOM surface (WS-EXP). One surface at a time over the world: the chrome (logo · growth track · your
// offices), one panel for the current step, a floating name tag on whoever works, and overlays (source, offices,
// report, site). Reads the flow; only calls flow.next / goto / peek. Fixed light theme: nothing here listens to the clock.
import "./ui.css";
import "./v7.css";
import { DEMO_LENGTH_S, LEVEL_META, type FlowStateV7, type Insets, type WorldLevel, type WorldV7 } from "../contracts";
import { REPORT_PAGES, type ProtoFlowV7 } from "../flow";
import { DEMO_CHAPTERS, type Demo } from "../flow/demo";
import type { Project } from "../../src/types";
import { resultCard } from "./cards";
import { countUp, el, isMobile, reducedMotion, stagger } from "./dom";
import { ldLogo } from "./logo";
import { livePanel, siteOverlay } from "./moments";
import { levelGlyph } from "./pixel";
import {
  noBuildHtml,
  analystTag, boomHtml, evidenceFoot, evidenceHtml, findingCard, floorHtml, hireHtml, ideaHtml, levelHtml, officesHtml,
  payHtml, reportPage, reportReader, sourceHtml, steerHtml, steerSuggestions, who, workTag,
} from "./steps";
import { ensureBrandFonts, makeView, type View } from "./view";

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

type Pos = "center" | "bottom" | "sheet" | "boom";
const DEMO_IDEA_FALLBACK = "A specialty coffee kiosk at a metro exit";

export function createUi(host: HTMLElement, deps: UiDeps): Ui {
  const { world, flow } = deps;
  let demo = deps.demo;
  if (deps.still) document.documentElement.dataset.still = "1";
  let view: View | null = null;
  let viewFor = "";
  const getView = () => {
    if (viewFor !== flow.project.id) {
      viewFor = flow.project.id;
      view = flow.project.legacy ? makeView(flow.project.legacy as Project) : null;
      if (view) ensureBrandFonts(view);
    }
    return view;
  };
  let typedIdea = "";
  let steerDraft = "";

  const root = el(`<div class="ui v7">
    <header class="chrome">
      <a class="wordmark" href="?" aria-label="LaunchDesk, start over">${ldLogo(24)}</a>
      <ol class="grow" aria-label="Growth"></ol>
      <div class="chrome-r"><button class="offices-btn glass" type="button" data-act="offices" aria-label="Your offices"><span class="ob-g"></span><span class="ob-t">Your offices</span></button></div>
    </header>
    <div class="demo-bar" hidden><div class="db-track"></div><div class="db-meta"><span class="db-ch"></span><span class="db-keys"><kbd>Space</kbd> pause <kbd>→</kbd> skip <kbd>Esc</kbd> exit</span></div></div>
    <div class="atag" data-on="0"></div>
    <div class="wtag glass" data-on="0"></div>
    <div class="panels"></div>
    <div class="overlay" data-open="0"><div class="scrim" data-act="close"></div><div class="ov-body"></div></div>
  </div>`);
  host.appendChild(root);
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const growEl = $(".grow"), panelsEl = $(".panels"), overlay = $(".overlay"), atag = $(".atag"), wtag = $(".wtag"), obG = $(".ob-g");
  const demoBar = $(".demo-bar");

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
    obG.innerHTML = levelGlyph(cur, 14);
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
        return "hire";
      case "evidence":
        return "evidence";
      case "report":
        return `report:${s.page ?? "score"}`;
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
    if (isMobile()) return "sheet";
    return "bottom"; // every surface rises from the bottom; the world is framed in the space above it
  }
  function build(key: string, s: FlowStateV7): string {
    const v = getView();
    if (key === "idea") return ideaHtml(flow.project.idea, typedIdea);
    if (key === "end") return ideaHtml(flow.project.idea, "", true);
    if (key === "pay1") return payHtml(flow, 1, !!typedIdea.trim() && typedIdea.trim() !== flow.project.idea.trim());
    if (key === "pay2") return payHtml(flow, 2, false);
    if (key === "hire") return hireHtml(flow);
    if (key === "evidence") return evidenceHtml(flow, s.finding ?? 0);
    if (key.startsWith("report:")) return reportPage(flow, s.page ?? "score");
    if (key.startsWith("steer")) return steerHtml(flow, steerDraft);
    if (key === "boom") return boomHtml();
    if (key === "floor") return floorHtml(flow);
    if (key.startsWith("build:")) return v ? resultCard(v, s.builder!) : s.phase === "result" ? noBuildHtml(s.builder ?? null) : "";
    if (key === "live") return v ? livePanel(v, flow.report) : noBuildHtml(null);
    if (key.startsWith("building")) return levelHtml(flow, 2, v?.name ?? flow.project.title);
    if (key.startsWith("district")) return levelHtml(flow, 3, v?.name ?? flow.project.title);
    return "";
  }
  function show(key: string | null, s: FlowStateV7) {
    if (key === curKey) return update(s);
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
    const p = el(`<div class="panel ${pos === "boom" ? "" : "glass"}" data-pos="${pos}" data-key="${key.split(":")[0]}">${build(key, s)}</div>`);
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
    if (curKey === "hire") {
      curPanel.querySelectorAll<HTMLElement>(".hire").forEach((li, i) => (li.dataset.on = i < flow.hired ? "1" : "0"));
      measure();
    } else if (curKey === "evidence") {
      const i = s.finding ?? 0;
      const fd = flow.findings[i];
      const slot = curPanel.querySelector<HTMLElement>(".ev-slot")!;
      const curId = slot.querySelector<HTMLElement>(".fcard")?.dataset.fid;
      const head = curPanel.querySelector(".ev-who");
      if (fd && curId !== fd.id) {
        const fresh = el(evidenceHtml(flow, i));
        head?.replaceWith(fresh.querySelector(".ev-who")!);
        const card = el(findingCard(fd));
        const prev = slot.querySelector(".fcard");
        if (prev) {
          prev.classList.add("leave");
          setTimeout(() => prev.remove(), 260);
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
    if (key === "idea" || key === "end") {
      const form = p.querySelector<HTMLFormElement>("form")!;
      const ta = form.querySelector<HTMLTextAreaElement>("textarea")!;
      const submit = () => {
        typedIdea = ta.value;
        flow.next({ type: "submit-idea", idea: ta.value });
      };
      form.addEventListener("submit", (e) => (e.preventDefault(), submit()));
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          submit();
        }
      });
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
    if (s.step === "evidence" && s.analyst && !curPanel?.matches(".out")) target = s.analyst;
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
      const done = flow.projects.find((p) => p.v7.report?.scalability.cap === 3) ?? flow.projects[flow.projects.length - 1];
      return done && flow.next({ type: "switch-project", id: done.id });
    }
    if (act === "path") return flow.commitPath(Number(t.dataset.i));
    if (act === "site") {
      const v = getView();
      return v && openOverlay(siteOverlay(v), "site");
    }
    if (act === "pack") return openOverlay(reportReader(flow), "reader");
    if (act === "close") return closeOverlay();
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.dataset.open === "1") return closeOverlay();
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
    root.dataset.step = s.step;
    paintGrow();
    if (force) curKey = null;
    show(keyFor(s), s);
    paintTags();
  }
  flow.onChange(() => render());
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
