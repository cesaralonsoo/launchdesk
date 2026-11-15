// App shell: layout, routing, polling, and the run story (spec-v4 §2.3, §2.4, §2.7, M1, M8). Owner: WS2.
// app.project is the server truth; everything on screen renders the director's view (what the user has seen).
import "./run.css";
import { api, ApiError } from "../api";
import type { DeptId, Preorders, Project, Stage, WorkDept } from "../types";
import { STAGE_DEPTS } from "../types";
import { resume } from "../wallet";
import type { Office, Rect } from "../office";
import type { PackSection } from "../pack";
import { renderMark } from "../pack/logo";
import { countPreorders } from "../site/preorders";
import { director, currentBeat, isSkipping, type Beat } from "./director";
import { h } from "./dom";
import { openGate } from "./gate";
import { header, strip } from "./header";
import { closeAllModals, copyText, toast } from "./modal";
import { reduced, textSwap } from "./motion";
import { brandOf, doneText, ensureFont, fontStack, nameOf, nowCard, snagText, teamList } from "./now";
import { liveOutput } from "./output";
import { openPay } from "./pay";
import { projects } from "./projects";
import { sideColumn } from "./side";
import { play, type Sfx } from "./sound";
import { app, isDevTx, needsPolling, phaseOf, provisionalTitle, setStopped, stageDone, stepOf, type Phase } from "./state";
import { DOING, TEAM, WORK_ORDER } from "./team";
import { iconSvg } from "./ui";

const POLL_MS = 1500;
const ERROR_POLL_MS = 6500;
const DEPT_SECTION: Record<WorkDept, PackSection> = { mia: "plan", leo: "market", sam: "numbers", nova: "brand", dex: "brand", rae: "launch", pip: "website" };
const stageOf = (d: WorkDept): Stage => (STAGE_DEPTS.validate.includes(d) ? "validate" : "build");
const coarse = () => matchMedia("(pointer: coarse)").matches;
const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
};

/** F8: what the director announces when a department delivers. */
function announce(p: Project, d: WorkDept): string {
  const r = p.results;
  switch (d) {
    case "mia":
      return `Mia finished: a plan with ${r.mia?.checklist.length ?? 0} tasks.`;
    case "leo":
      return `Leo finished: market score ${r.leo?.score.toFixed(1)} out of 10, ${r.leo?.verdict === "no-go" ? "no-go" : r.leo?.verdict}.`;
    case "sam":
      return `Sam finished: about ${r.sam?.cash_needed.display} to get started.`;
    case "nova":
      return `Nova finished: meet ${brandOf(p)?.name}.`;
    case "dex":
      return "Dex finished: logo and landing page ready.";
    case "rae":
      return `Rae finished: ${r.rae?.posts.length ?? 0} posts scheduled.`;
    case "pip":
      return `Pip finished: ${nameOf(p)} is live.`;
  }
}

/** L24: the second line of an expanded label. */
function pinValue(p: Project, d: WorkDept): string | null {
  const r = p.results;
  switch (d) {
    case "mia":
      return r.mia ? `${r.mia.checklist.length} tasks` : null;
    case "leo":
      return r.leo ? `${r.leo.score.toFixed(1)} · ${r.leo.verdict === "go" ? "Go" : r.leo.verdict === "pivot" ? "Pivot" : "No-go"}` : null;
    case "sam":
      return r.sam ? `${r.sam.cash_needed.display} to start` : null;
    case "nova":
      return brandOf(p)?.name ?? null;
    case "dex":
      return r.dex ? "3 logos" : null;
    case "rae":
      return r.rae ? `${r.rae.posts.length} posts` : null;
    case "pip":
      return r.pip ? "Live" : null;
  }
}

export function mountApp(root: HTMLElement) {
  // ---------- layout ----------
  const hdr = header(() => go("/"));
  const officeHost = h("div", { class: "office-host" });
  const pillText = h("span", { class: "pill-t" });
  const pillSkip = h("button", { type: "button", class: "pill-skip", hidden: true, onclick: () => director.skip() }, "Skip animation");
  const statusPill = h("div", { class: "ov-status run-pill", role: "status" }, h("span", { class: "sdot", "aria-hidden": "true" }), pillText, pillSkip);
  const statusText = h("span", { "aria-hidden": "true" });
  const statusSkip = h("button", { type: "button", class: "rs-skip", hidden: true, onclick: () => director.skip() }, "Skip animation");
  const statusLine = h("p", { class: "run-status-m", hidden: true }, statusText, statusSkip);
  const runBar = h("div", { class: "run-bar", "aria-hidden": "true" });
  const ctrl = (label: string, icon: string, fn: () => void) => h("button", { type: "button", class: "zbtn", "aria-label": label, title: label, onclick: () => (play("tap"), fn()), html: icon });
  const zoomGroup = h(
    "div",
    { class: "zoom run-zoom", role: "group", "aria-label": "Office view" },
    ctrl("Zoom out", iconSvg("minus", 16), () => office?.zoom(-1)),
    ctrl("Zoom in", iconSvg("plus", 16), () => office?.zoom(1)),
    ctrl("Fit the whole office", iconSvg("fit", 16), () => office?.fit()),
  );
  const coach = coachMark();
  const finaleSlot = h("div", { class: "finale-slot" });
  /** True while the launch card is up: the Now card goes quiet and the pill steps back (one focal thing). */
  let launchOpen = false;
  const clearFinale = () => {
    finaleSlot.replaceChildren();
    if (!launchOpen) return;
    launchOpen = false;
    document.body.classList.remove("has-launch");
    render();
  };
  const officePanel = h("div", { class: "office run-office", role: "region", "aria-label": "The LaunchDesk office" }, officeHost, runBar, statusPill, zoomGroup, coach.el, finaleSlot);
  const officeWrap = h("div", { class: "office-wrap" }, officePanel);
  const liveRegion = h("div", { class: "sr-only", "aria-live": "polite", role: "status" });

  const shelf = liveOutput((d) => void openPackSafe(DEPT_SECTION[d]));
  const side = sideColumn({
    start,
    pay: (s) => void pay(s),
    gate: () => void gate(),
    pack: (tab) => void openPackSafe(tab as PackSection | undefined),
    retry: () => void retry(null),
    newIdea: () => go("/"),
    agenda: (d) => void openPackSafe(DEPT_SECTION[d]),
  });
  const now = nowCard({
    pay: (s) => void pay(s),
    gate: () => void gate(),
    pack: (s) => void openPackSafe(s as PackSection | undefined),
    retry: (d) => void retry(d),
    skipDept: (d) => void skipDept(d),
    skipAnimation: () => director.skip(),
    site: () => {
      const slug = view?.results.pip?.slug;
      if (slug) window.open(`/s/${slug}`, "_blank", "noopener");
    },
  });
  const team = teamList({ open: (d) => void openPackSafe(DEPT_SECTION[d]), gate: () => void gate() });
  const projTitle = h("h1", { class: "rc-title", id: "proj-title" });
  const savedChip = h(
    "button",
    {
      type: "button",
      class: "rc-saved",
      hidden: true,
      onclick: () => {
        void copyText(location.href, "Private link copied. Anyone with it can continue this project.");
      },
    },
    "Saved · Copy link",
  );
  const newIdea = h("button", { type: "button", class: "link rc-new", onclick: () => go("/") }, "Start a new idea");
  const runCol = h("aside", { class: "run-col", "aria-label": "Your run", hidden: true }, h("div", { class: "rc-head" }, projTitle, savedChip), now.el, team.el, newIdea);
  root.replaceChildren(
    strip(),
    hdr.el,
    h("main", { class: "layout", id: "main" }, h("div", { class: "left" }, officeWrap, statusLine, shelf.el), side.el, runCol),
    liveRegion,
  );

  // ---------- office (lazy: three.js loads on first use, F13) ----------
  let office: Office | null = null;
  const rel = (el: Element | null): Rect | null => {
    if (!el || !(el as HTMLElement).offsetParent) return null;
    const o = officePanel.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
  };
  const occluders = (): Rect[] => [rel(statusPill), rel(zoomGroup), rel(coach.el.firstElementChild), rel(finaleSlot.firstElementChild)].filter((x): x is Rect => !!x);

  async function mountOffice(mode?: "2d") {
    try {
      const mod = await import("../office");
      office = mod.createOffice(officeHost, mode ? { mode } : {});
      officePanel.classList.add("is-ready");
      office.onAgentClick((id) => {
        play("tap");
        coach.dismiss();
        const p = view;
        if (id === "lobby" || !p) return;
        const st = p.status[id];
        if (st === "error") return void retry(id);
      });
      office.setOccluders(occluders);
      (office as Office & { onLost?: (() => void) | null }).onLost = () => {
        office?.dispose();
        void mountOffice("2d");
      };
      if (import.meta.env.DEV || location.search.includes("ld-debug")) (window as unknown as { __ld: unknown }).__ld = { office: () => office, director, panel: officePanel };
      syncOffice(view, true);
    } catch (e) {
      console.error("[office]", e);
      officeHost.append(h("div", { class: "office-fail" }, "The office could not be drawn on this device."));
    }
  }
  void mountOffice();

  // ---------- camera ----------
  let focused: DeptId | "overview" = "overview";
  const desktop = () => innerWidth >= 1100;
  /**
   * L14: the working room at ~1.35× the overview zoom, centred. The scene fits a room into the `free` rect,
   * so a centred rect at 44.5% of the card gives 1.35× (measured: zoom ≈ 3.24·s − 0.09 at 16:10).
   * Phones get a little more (≈ 1.5×) so the characters stay readable.
   */
  function freeRect(): Rect | undefined {
    const w = officePanel.clientWidth;
    const hh = officePanel.clientHeight;
    if (!w || !hh) return undefined;
    const s = desktop() ? 0.445 : 0.55;
    return { x: (w * (1 - s)) / 2, y: (hh * (1 - s)) / 2 + (desktop() ? 12 : 0), w: w * s, h: hh * s };
  }
  function focus(room: DeptId | "overview", ms?: number) {
    if (!office) return void (focused = room);
    let t = ms;
    if (t === undefined && room !== "overview" && focused !== "overview") {
      // 700–1100ms by distance (M1 handover)
      const a = office.roomCenter(focused);
      const b = office.roomCenter(room);
      const w = officePanel.clientWidth || 1;
      t = 700 + 400 * Math.min(1, Math.hypot(a.x - b.x, a.y - b.y) / w);
    }
    focused = room;
    if (reduced()) {
      // M2: no camera travel; a 180ms opacity dip hides the cut
      officeHost.animate([{ opacity: 1 }, { opacity: 0.85 }, { opacity: 1 }], { duration: 180 });
      t = 0;
    }
    office.focus(room, { ms: t ?? 900, free: room === "overview" ? undefined : freeRect() });
  }

  /** Puts the office in the state of `p` with no motion (load, restore, office mounted late). */
  function syncOffice(p: Project | null, hard = false) {
    if (!office) return;
    if (hard) office.clearPins();
    for (const d of ["lobby", ...WORK_ORDER] as DeptId[]) {
      if (d === "lobby") continue;
      const s = p?.status[d];
      office.setState(d, s === "done" ? "done" : s === "working" ? "working" : d === "pip" ? "sleeping" : "idle");
      office.flag(d, s === "error");
      office.note(d, null);
    }
    if (!p) return focus("overview", 0);
    const ph = phaseOf(p);
    if (ph.kind === "done" && hard) finalePins(p);
    const active = WORK_ORDER.find((d) => p.status[d] === "working" || p.status[d] === "error");
    if (hard) focus(active ?? "overview", 0);
  }
  function finalePins(p: Project) {
    // On a phone-width office three value pins crowd each other; only the live site gets one.
    const narrow = officeHost.clientWidth < 560;
    for (const d of (narrow ? ["pip"] : ["leo", "sam", "pip"]) as WorkDept[]) {
      const v = pinValue(p, d);
      if (v) office?.pin(d, { kicker: "", value: v });
    }
  }

  // ---------- sound (M14: at most one per 600ms) ----------
  let lastSound = 0;
  const sound = (s: Sfx) => {
    const t = performance.now();
    if (t - lastSound < 600) return;
    lastSound = t;
    play(s);
  };

  // ---------- status pill (L19, L18, F12) ----------
  let connection: "ok" | "reconnecting" | "offline" = "ok";
  function pillFor(p: Project | null, beat: Beat | null): { text: string; tone: string } {
    if (connection === "offline") return { text: "Offline. We'll resume when you're back.", tone: "err" };
    if (connection === "reconnecting") return { text: "Reconnecting…", tone: "wait" };
    if (!p) return { text: "Your team is in. What are we building?", tone: "ok" };
    const ph = phaseOf(p);
    if (beat) {
      const st = p.status[beat.dept];
      if (st === "error") return { text: snagText(beat.dept), tone: "err" };
      if (beat.phase === "reveal" || beat.phase === "hold") return { text: doneText(p, beat.dept), tone: "ok" };
      return { text: DOING[beat.dept] + eta(p, beat.dept), tone: "busy" };
    }
    switch (ph.kind) {
      case "unpaid":
        return { text: "Waiting for your payment", tone: "wait" };
      case "gate":
        return { text: "Your call. Build it?", tone: "wait" };
      case "stopped":
        return { text: "Report saved. Build any time.", tone: "ok" };
      case "done":
        return { text: `${nameOf(p)} is live`, tone: "live" };
      case "error":
        return ph.dept ? { text: snagText(ph.dept), tone: "err" } : { text: "We couldn't finish", tone: "err" };
      case "working": {
        const d = ph.dept;
        return d ? { text: DOING[d], tone: "busy" } : { text: "Your team is getting started", tone: "busy" };
      }
      default:
        return { text: "Your team is in. What are we building?", tone: "ok" };
    }
  }
  /** L18 copy for the phone status line: "Validating · Leo, 2 of 3". Empty when nothing is running. */
  function progressLine(p: Project | null, beat: Beat | null): string {
    if (!p) return "";
    if (connection !== "ok") return pillFor(p, beat).text;
    const ph = phaseOf(p);
    const d = beat?.dept ?? (ph.kind === "working" ? ph.dept : null);
    if (!d) return "";
    const s = stageOf(d);
    const ds = STAGE_DEPTS[s];
    const live = beat ? beat.phase === "handover" || beat.phase === "working" : true;
    return `${s === "validate" ? "Validating" : "Building"} · ${TEAM[d].name}, ${ds.indexOf(d) + 1} of ${ds.length}${live ? eta(p, d) : ""}`;
  }
  /** "about 25 s left", only when /api/stats has a real median (≥ 5 runs). */
  function eta(p: Project, d: WorkDept): string {
    const s = stageOf(d);
    const med = app.stats?.medianMs?.[s];
    const started = p.timings[s]?.started;
    if (!med || !started) return "";
    const left = Math.round((med - (Date.now() - started)) / 5000) * 5;
    return left >= 5 ? ` · about ${left} s left` : "";
  }

  // ---------- run bar (L18) ----------
  let barStage: Stage | null = null;
  let barRaf = 0;
  const segStart = new Map<WorkDept, number>();
  function renderBar(p: Project | null) {
    const ph = p ? phaseOf(p) : null;
    const stage: Stage | null = ph && (ph.kind === "working" || ph.kind === "error") ? ph.stage : null;
    officePanel.classList.toggle("has-bar", !!stage);
    if (!stage || !p) {
      cancelAnimationFrame(barRaf);
      barRaf = 0;
      barStage = null;
      return;
    }
    if (barStage !== stage) {
      barStage = stage;
      segStart.clear();
      runBar.replaceChildren(...STAGE_DEPTS[stage].map((d) => h("span", { class: "rb-seg", "data-dept": d }, h("i"))));
    }
    const med = app.stats?.medianMs?.[stage];
    const expected = (med ? med / STAGE_DEPTS[stage].length : stage === "validate" ? 7000 : 5500) + (stage === "validate" ? 2400 : 1800);
    const frame = () => {
      const v = view;
      if (!v || barStage !== stage) return;
      let anyLive = false;
      runBar.querySelectorAll<HTMLElement>(".rb-seg").forEach((seg) => {
        const d = seg.dataset.dept as WorkDept;
        const st = v.status[d];
        let k = 0;
        if (st === "done") k = 1;
        else if (st === "working" || st === "error") {
          if (!segStart.has(d)) segStart.set(d, performance.now());
          const t = performance.now() - segStart.get(d)!;
          k = 0.9 * (1 - Math.exp(-t / (expected / 2)));
          anyLive = true;
        }
        (seg.firstElementChild as HTMLElement).style.transform = `scaleX(${k.toFixed(4)})`;
        seg.classList.toggle("is-done", st === "done");
      });
      barRaf = anyLive ? requestAnimationFrame(frame) : 0;
    };
    cancelAnimationFrame(barRaf);
    barRaf = requestAnimationFrame(frame);
  }

  // ---------- render (always the director's view) ----------
  let view: Project | null = null;
  let preorders: Preorders | null = null;
  let lastPill = "";
  let pillFor_id: string | null = null;
  function render() {
    const p = view;
    const beat = currentBeat();
    const ph: Phase = phaseOf(p);
    // While a beat (e.g. Sam's hold) is still on screen, the step stays where the story is.
    const stepPh: Phase = beat && ph.kind === "gate" ? { kind: "working", stage: "validate" } as Phase : beat && ph.kind === "done" ? { kind: "working", stage: "build" } as Phase : ph;
    hdr.setStep(stepOf(stepPh));
    document.body.classList.toggle("is-home", !p);
    document.body.classList.toggle("is-run", !!p && (ph.kind === "working" || ph.kind === "error" || ph.kind === "unpaid"));
    side.el.hidden = !!p;
    runCol.hidden = !p;
    if (!p) side.render(null);
    // pill
    const pill = pillFor(p, beat);
    statusPill.className = `ov-status run-pill t-${pill.tone}`;
    if (pill.text !== lastPill) {
      lastPill = pill.text;
      // A newly opened project shows its state at once; only changes within a project animate.
      const opened = (p?.id ?? null) !== pillFor_id;
      pillFor_id = p?.id ?? null;
      if (!pillText.textContent || opened) {
        pillText.textContent = pill.text;
        textSwap(pillText, pill.text); // replaces any swap still queued from the previous screen
      } else textSwap(pillText, pill.text);
    }
    // Phones: the line under the office carries progress, never the Now card's sentence again.
    const mline = progressLine(p, beat);
    if (statusText.textContent !== mline) statusText.textContent = mline;
    statusLine.hidden = !mline;
    const runs = Number(store.get("launchdesk-runs") || "0");
    const showSkip = !!beat && runs >= 1 && p?.status[beat.dept] !== "error" && !isSkipping() && STAGE_DEPTS[stageOf(beat.dept)][0] !== beat.dept && (beat.phase === "handover" || beat.phase === "working");
    pillSkip.hidden = !showSkip;
    statusSkip.hidden = !showSkip;
    // right column
    if (p) {
      const title = p.results.mia?.title || provisionalTitle(p.idea);
      if (projTitle.textContent !== title) {
        if (projTitle.textContent) textSwap(projTitle, title);
        else projTitle.textContent = title;
      }
      projTitle.title = p.idea;
      savedChip.hidden = !p.payments.validate || !!p.example || location.pathname.startsWith("/r/");
    }
    now.update(p, beat, { showSkip, launchOpen });
    team.update(p, beat);
    shelf.render(p, { preorders });
    renderBar(p);
    // F7: progress beyond the page
    if (p) {
      if (beat && (ph.kind === "working" || ph.kind === "error")) {
        const ds = STAGE_DEPTS[stageOf(beat.dept)];
        document.title = `(${ds.indexOf(beat.dept) + 1}/${ds.length}) ${DOING[beat.dept]} · LaunchDesk`;
      } else if (ph.kind === "gate") document.title = "Report ready · LaunchDesk";
      else if (ph.kind === "done") document.title = `${nameOf(p)} is live · LaunchDesk`;
      else document.title = `${p.results.mia?.title ?? "Your project"} · LaunchDesk`;
    } else document.title = "LaunchDesk · Your startup team, for pennies";
    // F4: keep "My projects" fresh (never for shared or example projects)
    if (p && !p.example && !location.pathname.startsWith("/r/")) projects.upsert(p);
  }

  // ---------- director hooks ----------
  let payCoin: Promise<void> | null = null;
  let finaleFor: string | null = null;
  const gateShown = new Set<string>();

  function onView(v: Project) {
    view = v;
    // error flags follow the view
    if (office) for (const d of WORK_ORDER) office.flag(d, v.status[d] === "error");
    render();
  }

  function onBeat(b: Beat, v: Project) {
    const d = b.dept;
    coach.dismiss();
    switch (b.phase) {
      case "handover": {
        office?.clearPins();
        const ds = STAGE_DEPTS[stageOf(d)];
        const i = ds.indexOf(d);
        const from: DeptId = i === 0 ? "lobby" : ds[i - 1]!;
        const coinNow = () => {
          if (isSkipping()) return;
          void office?.coin(from, d);
        };
        if (i === 0 && payCoin) void payCoin.then(coinNow);
        else coinNow();
        payCoin = null;
        office?.setState(d, "working");
        focus(d);
        break;
      }
      case "working":
        office?.setState(d, "working");
        if (focused !== d) focus(d);
        break;
      case "reveal": {
        office?.setState(d, "done");
        const pv = pinValue(v, d);
        if (pv) office?.pin(d, { kicker: "", value: pv });
        liveRegion.textContent = announce(v, d);
        // M14: "done" when the tile's count-up ends
        if (!isSkipping()) setTimeout(() => sound("done"), 700);
        if (d === "pip" || d === "sam") {
          store.set("launchdesk-runs", String(Number(store.get("launchdesk-runs") || "0") + 1));
        }
        break;
      }
      case "hold":
        break;
    }
    render();
  }

  function onGate(v: Project) {
    if (app.project?.id !== v.id) return;
    setTimeout(() => {
      focus("overview");
      // Opens once by itself per project; after that only the user reopens it (Now card, team row).
      if (view && phaseOf(view).kind === "gate" && !gateShown.has(v.id)) void gate();
    }, 0);
  }

  function onFinale(v: Project) {
    if (finaleFor === v.id) return;
    finaleFor = v.id;
    void finale(v);
  }

  /** M8: 4.2s. Overview, labels turn green in work order, one confetti burst, the launch card rises. */
  async function finale(p: Project) {
    const rm = reduced();
    const wait = (ms: number) => new Promise((r) => setTimeout(r, rm ? Math.min(ms, 200) : ms));
    now.el.classList.add("is-collapsing");
    office?.clearPins();
    const brand = brandOf(p);
    if (brand?.palette[0]) officeHost.style.setProperty("--lo-brand", brand.palette[0].hex);
    if (office) {
      if (rm) focus("overview", 0);
      else {
        const o = officePanel.getBoundingClientRect();
        focused = "overview";
        // Phones have no pill over the canvas: a small even margin keeps the office as large as it can be.
        const narrow = o.width < 560;
        const inset = narrow
          ? { top: 16, bottom: 12, left: 12, right: 12 }
          : { top: 60 + o.height * 0.02, bottom: 20 + o.height * 0.02, left: 16 + o.width * 0.02, right: Math.min(408, o.width * 0.42) };
        office.focus("overview", { ms: 1100, inset });
      }
    }
    await wait(600);
    const mod = await import("../office");
    mod.pulseLabels(officeHost, WORK_ORDER);
    finalePins(p);
    await wait(700);
    if (!rm) {
      office?.celebrate();
      sound("celebrate");
    }
    await wait(200);
    now.el.classList.remove("is-collapsing");
    if (view?.id === p.id) launchCard(view);
    void refreshStats();
  }

  /** L36: the launch card, centred over the office (bottom sheet on phones). No auto-open of the pack. */
  function launchCard(p: Project) {
    const b = brandOf(p);
    const name = nameOf(p);
    const slug = p.results.pip?.slug;
    const url = slug ? `${location.origin}/s/${slug}` : "";
    ensureFont(p.results.nova?.typography.display);
    const close = () => {
      const c = finaleSlot.firstElementChild as HTMLElement | null;
      if (!c) return;
      if (rmOrGone(c)) return void clearFinale();
      c.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(8px) scale(.98)" }], { duration: 180, easing: "cubic-bezier(.55,0,1,.45)", fill: "forwards" }).finished.then(() => clearFinale(), () => clearFinale());
    };
    const rmOrGone = (c: HTMLElement) => reduced() || !c.isConnected;
    const card = h(
      "div",
      { class: "launch sheet", role: "dialog", "aria-modal": "false", "aria-labelledby": "launch-t" },
      h("button", { type: "button", class: "icon-btn ghost launch-x", "aria-label": "Close", onclick: close, html: iconSvg("close", 16) }),
      h("div", { class: "launch-logo", html: renderMark(p.results.dex?.logos[0], b?.palette, name, 56, p.results.nova?.typography) }),
      h("h2", { id: "launch-t", class: "launch-t", style: `font-family:${fontStack(p.results.nova?.typography.display)}` }, `${name} is live`),
      b ? h("p", { class: "launch-tag" }, b.tagline) : null,
      url
        ? h(
            "div",
            { class: "launch-url" },
            h("span", { class: "mono" }, `${location.host}/s/${slug}`),
            h("button", { type: "button", class: "rn-ib", "aria-label": "Copy link", onclick: () => void copyText(url, "Link copied"), html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/></svg>` }),
          )
        : null,
      h("button", { type: "button", class: "btn primary lg block", onclick: () => (close(), void openPackSafe("summary")) }, "Open your startup pack"),
      slug ? h("a", { class: "btn block", href: `/s/${slug}`, target: "_blank", rel: "noopener" }, "Visit your site ↗") : null,
    );
    finaleSlot.replaceChildren(card);
    launchOpen = true;
    document.body.classList.add("has-launch");
    render();
    if (!reduced()) {
      card.animate([{ opacity: 0, transform: "translateY(24px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: "linear(0, .22 6%, .55 14%, .8 24%, .94 35%, 1.008 50%, 1.012 62%, 1.003 80%, 1)", fill: "backwards" });
      card.querySelector(".launch-logo")?.animate([{ transform: "scale(.9)" }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" });
    }
    (card.querySelector(".btn.primary") as HTMLElement | null)?.focus({ preventScroll: true });
  }

  function startStory(p: Project, opts: { fastForward?: boolean } = {}) {
    clearFinale();
    director.start(p, { onView, onBeat, onGate, onFinale }, opts);
    syncOffice(view, true);
  }

  // ---------- polling ----------
  let timer: number | undefined;
  let pollId = 0;
  let failures = 0;
  let graceUntil = 0;
  async function poll(my: number) {
    clearTimeout(timer);
    const id = app.project?.id;
    if (!id || my !== pollId) return;
    if (!navigator.onLine) {
      setConnection("offline");
      return;
    }
    try {
      const p = await api.get(id);
      if (my !== pollId) return;
      failures = 0;
      setConnection("ok");
      if (app.project?.id === id) {
        app.project = p;
        director.push(p);
      }
    } catch {
      if (my !== pollId) return;
      failures++;
      if (failures >= 3) setConnection("reconnecting");
    }
    if (my !== pollId || app.project?.id !== id) return;
    const ph = phaseOf(app.project);
    const fast = needsPolling(ph) || Date.now() < graceUntil;
    // F12: exponential backoff after failures (1.5s → 3s → 6s … 30s)
    const back = failures ? Math.min(30_000, POLL_MS * 2 ** failures) : POLL_MS;
    if (fast) timer = window.setTimeout(() => void poll(my), back);
    else if (ph.kind === "error") timer = window.setTimeout(() => void poll(my), Math.max(ERROR_POLL_MS, back));
  }
  const ensurePolling = () => {
    const my = ++pollId;
    clearTimeout(timer);
    void poll(my);
  };
  function setConnection(c: typeof connection) {
    if (connection === c) return;
    connection = c;
    render();
  }
  addEventListener("offline", () => setConnection("offline"));
  addEventListener("online", () => {
    setConnection("ok");
    if (app.project) ensurePolling();
  });

  let preKey = "";
  async function refreshPreorders(p: Project | null) {
    const pip = p?.results.pip;
    if (!p || !pip) return;
    const k = `${p.id}|${pip.slug}`;
    if (preKey === k) return;
    preKey = k;
    try {
      const site = await api.site(pip.slug);
      if (!site.founderAddress || site.demo) return;
      preorders = await countPreorders(site.founderAddress, pip.live_at);
      if (view?.id === p!.id) render();
    } catch {
      preorders = null;
    }
  }

  async function refreshStats() {
    try {
      app.stats = await api.stats();
      side.refreshStats();
    } catch {
      /* stats are optional */
    }
  }

  // ---------- actions ----------
  async function start(idea: string) {
    const created = await api.create(idea);
    if (created.ownerKey) {
      // F3: the key comes back once; keep it before anything else
      const p0 = { id: created.id, idea, created_at: Date.now(), payments: {}, status: {}, results: {}, timings: {}, models: {} } as Project;
      projects.upsert(p0, { ownerKey: created.ownerKey });
    }
    const p = await api.get(created.id);
    history.pushState(null, "", `/p/${created.id}`);
    setProject(p, { fastForward: true });
    play("tap");
    void pay("validate");
  }

  function setProject(p: Project | null, opts: { fastForward?: boolean } = {}) {
    app.project = p;
    preorders = null;
    preKey = "";
    if (!p) {
      director.stop();
      view = null;
      clearFinale();
      syncOffice(null, true);
      render();
      return;
    }
    startStory(p, opts);
    void refreshPreorders(p);
  }

  async function pay(stage: Stage) {
    const p = app.project;
    if (!p) return;
    if (p.payments[stage]) return ensurePolling();
    const paid = await openPay(p, stage);
    if (app.project?.id !== p.id) return;
    if (!paid) {
      // Closed early: the payment may still have gone through. Ask the server.
      try {
        const fresh = await api.get(p.id);
        if (app.project?.id === p.id && fresh.payments[stage]) {
          app.project = fresh;
          director.push(fresh);
          void api.run(p.id, stage).catch(() => {});
          ensurePolling();
        }
      } catch {
        /* nothing to do */
      }
      return;
    }
    if (stage === "build") setStopped(p.id, false);
    if (!desktop()) window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
    // M7 hand-off: the coin flies from the sheet's check to the lobby, then the lobby shows "+$0.10 paid".
    const pay0 = paid.project.payments[stage];
    const real = !!pay0 && !isDevTx(pay0.txid) && pay0.sats > 0;
    focus("lobby", 600);
    if (paid.fromRect && office) {
      payCoin = office.coinFromRect(paid.fromRect, "lobby").then(() => {
        if (real) office?.chip("lobby", `+$${(pay0!.cents / 100).toFixed(2)} paid`, "bch");
        sound("coin");
      });
    } else if (real) office?.chip("lobby", `+$${(pay0!.cents / 100).toFixed(2)} paid`, "bch");
    app.project = paid.project;
    director.push(paid.project);
    void refreshStats();
    ensurePolling();
  }

  async function gate() {
    const p = app.project;
    const v = view;
    if (!p || !v || !stageDone(v, "validate") || p.payments.build) return;
    if (gateShown.has(`${p.id}|open`)) return;
    gateShown.add(p.id);
    gateShown.add(`${p.id}|open`);
    let choice: Awaited<ReturnType<typeof openGate>> = null;
    try {
      choice = await openGate(v);
    } finally {
      gateShown.delete(`${p.id}|open`);
    }
    if (app.project?.id !== p.id) return;
    if (choice === "approve") {
      setStopped(p.id, false);
      render();
      await pay("build");
    } else if (choice === "stop") {
      setStopped(p.id, true);
      render();
      toast("Report saved. Nothing else is charged.", "ok");
    } else if (choice === "pivot") {
      const idea = p.results.leo?.pivot?.idea;
      go("/");
      if (idea)
        requestAnimationFrame(() => {
          const ta = document.getElementById("idea") as HTMLTextAreaElement | null;
          if (!ta) return;
          ta.value = idea;
          ta.dispatchEvent(new Event("input", { bubbles: true }));
          ta.focus();
          ta.setSelectionRange(idea.length, idea.length);
        });
    } else render();
  }

  /** R18: free, idempotent retry of one department (falls back to re-running the stage on older servers). */
  async function retry(d: WorkDept | null) {
    const p = app.project;
    if (!p) return;
    const ph = phaseOf(p);
    const stage: Stage = d ? stageOf(d) : ph.kind === "error" || ph.kind === "working" ? ph.stage : "validate";
    graceUntil = Date.now() + 12_000;
    try {
      if (d) {
        try {
          await api.retry(p.id, d);
        } catch (e) {
          if (e instanceof ApiError && (e.status === 501 || e.status === 404)) await api.run(p.id, stage);
          else throw e;
        }
      } else await api.run(p.id, stage);
      toast(d ? `${TEAM[d].name} is on it again` : "Running it again…", "info");
    } catch (e) {
      toast((e as Error).message, "err");
    }
    failures = 0;
    ensurePolling();
  }

  async function skipDept(d: WorkDept) {
    const p = app.project;
    if (!p) return;
    try {
      await api.skip(p.id, d);
      graceUntil = Date.now() + 12_000;
      ensurePolling();
    } catch (e) {
      toast(e instanceof ApiError && e.status === 501 ? "Skipping isn't available on this server yet. Try again, free." : (e as Error).message, "err");
    }
  }

  let packMod: typeof import("../pack") | null = null;
  async function openPackSafe(section?: PackSection, opts: { readOnly?: boolean; banner?: "example" | "share" | null; project?: Project } = {}) {
    const p = opts.project ?? view ?? app.project;
    if (!p) return;
    play("open");
    try {
      packMod ??= await import("../pack");
      packMod.openPack(p, { section, readOnly: opts.readOnly, banner: opts.banner });
    } catch (e) {
      console.error("[pack]", e);
      toast("Could not open the pack.", "err");
    }
  }

  // ---------- routing ----------
  let loadSeq = 0;
  async function load(path: string) {
    const seq = ++loadSeq;
    clearTimeout(timer);
    pollId++;
    if (packMod?.isPackOpen()) packMod.closePack();
    closeAllModals();
    setRobots(path.startsWith("/r/"));
    const share = path.match(/^\/r\/([\w-]+)/);
    const m = path.match(/^\/p\/([\w-]+)/);
    if (!m && !share) {
      setProject(null);
      return;
    }
    try {
      const p = share ? await api.shared(share[1]!) : await api.get(m![1]!);
      if (seq !== loadSeq) return;
      setProject(p, { fastForward: true });
      const ph = phaseOf(p);
      if (share || p.example) {
        // F5 / F2: a read-only document over the finished office
        void openPackSafe("summary", { readOnly: true, banner: share ? "share" : "example", project: p });
        return;
      }
      if (ph.kind === "working") {
        void api.run(p.id, ph.stage).catch(() => {});
        ensurePolling();
      } else if (ph.kind === "gate" && !gateShown.has(p.id)) {
        void gate();
      } else if (ph.kind === "error") {
        ensurePolling();
      }
    } catch (e) {
      if (seq !== loadSeq) return;
      // F12: unknown link → a calm card in the side column
      setProject(null);
      if (e instanceof ApiError && e.status === 404) {
        side.el.hidden = false;
        side.renderNotFound();
      } else toast((e as Error).message || "Project not found", "err");
    }
  }
  function go(path: string) {
    if (location.pathname !== path) history.pushState(null, "", path);
    void load(path);
  }
  window.addEventListener("popstate", () => void load(location.pathname));
  // The pack's "Build it · $0.20" button (stage 1 packs): open the gate's build payment for that project.
  window.addEventListener("launchdesk:build", (e) => {
    const id = (e as CustomEvent<{ id?: string }>).detail?.id;
    const p = app.project;
    if (!p || p.id !== id || p.example || location.pathname.startsWith("/r/")) return;
    e.preventDefault();
    if (p.payments.build) return;
    setStopped(p.id, false);
    render();
    void pay("build");
  });
  window.addEventListener("launchdesk:new-idea", (e) => {
    e.preventDefault();
    go("/");
    requestAnimationFrame(() => document.getElementById("idea")?.focus());
  });

  // ---------- boot ----------
  render();
  resume();
  const loadConfig = async (again: boolean) => {
    try {
      app.config = await api.config();
      side.refreshConfig();
      render();
      if (again && !app.config.bchUsd) setTimeout(() => void loadConfig(false), 6000);
    } catch {
      /* side.ts shows the offline card and retries (F12) */
    }
  };
  void loadConfig(true);
  void refreshStats();
  void load(location.pathname);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && app.project && (needsPolling(phaseOf(app.project)) || phaseOf(app.project).kind === "error")) ensurePolling();
  });
  // The camera keeps the working room framed when the office card changes size.
  new ResizeObserver(() => {
    if (office && focused !== "overview") office.focus(focused, { ms: 0, free: freeRect() });
  }).observe(officePanel);
}

/** F5: shared reports are not for search engines. */
function setRobots(on: boolean) {
  let m = document.querySelector<HTMLMetaElement>('meta[name="robots"][data-ld]');
  if (on && !m) {
    m = h("meta", { name: "robots", content: "noindex", "data-ld": "" });
    document.head.append(m);
  } else if (!on) m?.remove();
}

/** L22: one-time coach mark on the first visit (dismissed with "Got it", remembered). */
function coachMark() {
  const KEY = "launchdesk-coach";
  let seen = false;
  try {
    seen = localStorage.getItem(KEY) === "1";
    // A returning visitor with projects already knows the office: the coach mark retires itself.
    if (!seen && projects.list().length > 0) {
      seen = true;
      localStorage.setItem(KEY, "1");
    }
  } catch {
    seen = true;
  }
  const el = h("div", { class: "coach-slot" });
  const dismiss = () => {
    if (seen) return;
    seen = true;
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* fine */
    }
    const c = el.firstElementChild as HTMLElement | null;
    if (!c) return;
    if (reduced()) return void el.replaceChildren();
    c.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(4px)" }], { duration: 160, easing: "cubic-bezier(.55,0,1,.45)", fill: "forwards" }).finished.then(() => el.replaceChildren(), () => el.replaceChildren());
  };
  if (!seen) {
    el.append(
      h(
        "div",
        { class: "coach", role: "note" },
        h(
          "ol",
          null,
          h("li", null, "This is your team. Each room is a specialist."),
          h("li", null, "Pay $0.10 and watch them check your idea."),
          h("li", null, "You decide if they build it."),
        ),
        h("button", { type: "button", class: "btn sm", onclick: dismiss }, "Got it"),
      ),
    );
  }
  return { el, dismiss };
}
