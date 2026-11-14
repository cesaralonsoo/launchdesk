import { api } from "../api";
import type { DeptId, Project, Stage, WorkDept } from "../types";
import { STAGE_DEPTS } from "../types";
import { resume } from "../wallet";
import { h, reducedMotion } from "./dom";
import { openGate } from "./gate";
import { header, strip } from "./header";
import { closeAllModals, toast } from "./modal";
import { createOffice, type Office, type Rect } from "../office";
import { liveOutput, PACK_TAB } from "./output";
import { closePack, isPackOpen, openPack } from "../pack";
import { deptPanel, refreshDeptPanel } from "./panels";
import { openPay } from "./pay";
import { sideColumn } from "./side";
import { play } from "./sound";
import { app, deptStatus, fmtSats, isDevTx, needsPolling, phaseOf, setStopped, stageDone, stageSats, stepOf, type Phase } from "./state";
import { logoSvg } from "./logo";
import { iconSvg } from "./ui";
import { STAGE_INFO, TEAM, WORK_ORDER } from "./team";

const POLL_MS = 1500;
/** While a department needs a retry, keep an eye on the server (a restart or another tab may fix it). */
const ERROR_POLL_MS = 6500;
/** A department the user opened stays on screen this long before the director switches to the next one. */
const USER_PANEL_MS = 5000;
const READY = "Office open · 7 specialists ready";
/** A delivered panel stays on screen at least this long before the next department takes over. */
const PANEL_HOLD_MS = 2600;
/** ...but only this long when the next department is already working on the server. */
const PANEL_HANDOFF_MS = 1200;
/** The finale (confetti, pins, payout banner) plays this long before the pack opens. */
const FINALE_MS = 3600;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, reducedMotion() ? Math.min(ms, 120) : ms));
/** Never let an animation stall the director. */
const capped = (p: Promise<void> | undefined, ms = 3000) => Promise.race([p ?? Promise.resolve(), sleep(ms)]);
const coarse = () => matchMedia("(pointer: coarse)").matches;

function pinFor(p: Project, d: WorkDept): { kicker: string; value: string; iconHtml?: string } | null {
  const r = p.results;
  switch (d) {
    case "mia":
      return r.mia ? { kicker: "Project plan", value: `4 weeks · ${new Set(r.mia.weeks.map((w) => w.dept)).size} depts` } : null;
    case "leo":
      return r.leo ? { kicker: "Opportunity", value: `${r.leo.score.toFixed(1)}/10 ${r.leo.verdict.toUpperCase()}` } : null;
    case "sam":
      return r.sam ? { kicker: "Break-even", value: `Month ${r.sam.break_even.month}` } : null;
    case "nova": {
      const n = r.nova?.names[r.nova.chosen];
      return n ? { kicker: "Brand name", value: n.name } : null;
    }
    case "dex": {
      if (!r.dex) return null;
      const n = r.nova?.names[r.nova.chosen];
      const l = r.dex.logos[0];
      return { kicker: `Logo · ${l.shape}`, value: n?.name ?? "Logo", iconHtml: logoSvg(l, n?.palette, 24, n?.name) };
    }
    case "rae":
      return r.rae ? { kicker: "Launch", value: `${r.rae.posts.length} posts · 30 days` } : null;
    case "pip":
      return r.pip ? { kicker: "Landing page", value: "Live · pre-orders" } : null;
  }
}

/** The finale banner stays until the user has opened the finished pack once (per project, survives reloads). */
const seenKey = (id: string) => `launchdesk-pack-seen-${id}`;
function packSeen(id: string) {
  try {
    return localStorage.getItem(seenKey(id)) === "1";
  } catch {
    return true;
  }
}
function markPackSeen(id: string) {
  try {
    localStorage.setItem(seenKey(id), "1");
  } catch {
    /* storage unavailable */
  }
}

export function mountApp(root: HTMLElement) {
  // ---------- layout ----------
  const hdr = header(() => go("/"));
  const officeHost = h("div", { class: "office-host" });
  const statusPill = h("div", { class: "ov-status", role: "status", "aria-live": "polite" });
  const guideText = h("p", { id: "guide-text" });
  const guideToggle = h("button", { type: "button", class: "guide-h", "aria-expanded": "true", "aria-controls": "guide-text" }, h("span", null, "What's happening"), h("span", { class: "chev", "aria-hidden": "true", html: iconSvg("chevronDown", 14) }));
  const guide = h("div", { class: "ov-guide" }, guideToggle, guideText);
  guideToggle.addEventListener("click", () => {
    const c = guide.classList.toggle("collapsed");
    guideToggle.setAttribute("aria-expanded", String(!c));
  });
  // Phones: the same narration as a one-line strip under the office.
  const stripText = h("span", { class: "gs-t" });
  const guideStrip = h(
    "button",
    {
      type: "button",
      class: "guide-strip",
      "aria-expanded": "false",
      onclick: () => guideStrip.setAttribute("aria-expanded", String(guideStrip.classList.toggle("open"))),
    },
    h("span", { class: "gs-k" }, "What's happening"),
    stripText,
    h("span", { class: "chev", "aria-hidden": "true", html: iconSvg("chevronDown", 14) }),
  );
  const ctrl = (label: string, icon: string, fn: () => void) => h("button", { type: "button", class: "zbtn", "aria-label": label, title: label, onclick: () => (play("tap"), fn()), html: icon });
  const zoomGroup = h(
    "div",
    { class: "zoom", role: "group", "aria-label": "Office view" },
    ctrl("Zoom out", iconSvg("minus", 16), () => office?.zoom(-1)),
    ctrl("Zoom in", iconSvg("plus", 16), () => office?.zoom(1)),
    ctrl("Fit the whole office", iconSvg("fit", 16), () => office?.fit()),
  );
  const controls = h("div", { class: "ov-controls" }, zoomGroup, h("span", { class: "hint" }, coarse() ? "Tap anyone to say hi" : "Click anyone to say hi"));
  const banner = h("div", { class: "ov-banner", "aria-live": "polite" });
  const officePanel = h("div", { class: "office", role: "region", "aria-label": "The LaunchDesk office" }, officeHost, statusPill, banner, guide, controls);
  const panelSlot = h("div", { class: "dp-slot" });
  const out = liveOutput((d) => openPackSafe(PACK_TAB[d]));
  const officeWrap = h("div", { class: "office-wrap" }, officePanel, panelSlot);
  // Phones, home screen: the next step is always one tap away.
  const homeBar = h(
    "div",
    { class: "home-bar", role: "region", "aria-label": "Start" },
    h(
      "button",
      {
        type: "button",
        class: "btn primary lg block hb-btn",
        onclick: () => {
          const ta = document.getElementById("idea") as HTMLTextAreaElement | null;
          if (!ta) return;
          if (ta.value.trim().length >= 15) return void ta.form?.requestSubmit();
          ta.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
          ta.focus({ preventScroll: true });
        },
      },
      h("span", { "data-hb-label": "" }, "Validate my idea"),
    ),
    h("small", { "data-hb-sub": "" }, "Paid in BCH"),
  );
  const side = sideColumn({
    start,
    pay: (s) => void pay(s),
    gate: () => void gate(),
    pack: (tab) => openPackSafe(tab),
    retry: () => void retry(),
    newIdea: () => go("/"),
    agenda: (d) => showPanel(d, true),
  });
  root.replaceChildren(
    strip(),
    hdr.el,
    h("main", { class: "layout", id: "main" }, h("div", { class: "left" }, officeWrap, guideStrip, out.el), side.el),
    homeBar,
  );

  // ---------- office ----------
  let office: Office | null = null;
  const rel = (el: Element | null): Rect | null => {
    if (!el || !(el as HTMLElement).offsetParent) return null;
    const o = officePanel.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
  };
  /** Everything drawn over the office: labels and pins under these fade out. */
  const occluders = (): Rect[] =>
    [rel(panelSlot.querySelector(".dp")), rel(guide), rel(zoomGroup), rel(controls.querySelector(".hint")), rel(statusPill), rel(banner.firstElementChild)].filter((x): x is Rect => !!x);

  function mountOffice(mode?: "2d") {
    try {
      office = createOffice(officeHost, mode ? { mode } : {});
      office.onAgentClick((id) => {
        play("tap");
        const p = app.project;
        if (id === "lobby" || !p) return;
        const st = deptStatus(p, id);
        if (st === "error") return void retry();
        if (st === "working" || st === "done") showPanel(id, true);
      });
      office.setOccluders(occluders);
      // A GL context that never comes back (backgrounded phone tab): swap in the 2D floor plan.
      (office as Office & { onLost?: (() => void) | null }).onLost = () => {
        office?.dispose();
        mountOffice("2d");
        if (app.project) restore(app.project);
      };
      if (import.meta.env.DEV) (window as unknown as { __ld: unknown }).__ld = { office: () => office, free: () => freeRect() };
    } catch (e) {
      console.error("[office]", e);
      officeHost.append(h("div", { class: "office-fail" }, "The office could not be drawn on this device."));
    }
  }
  mountOffice();

  // ---------- department panel ----------
  let panelDept: WorkDept | null = null;
  let panelKey = "";
  /** When the user last opened a panel themselves: the director doesn't snatch it away right after. */
  let userPanelAt = 0;
  /** The department the director is currently showing: the status pill and the guide follow it, not the server. */
  let shownDept: WorkDept | null = null;
  function showPanel(d: WorkDept | null, user = false) {
    const changed = d !== panelDept;
    panelDept = d;
    if (changed) panelKey = "";
    if (user) userPanelAt = d ? Date.now() : 0;
    renderPanel();
    if (d && user) {
      play("open");
      if (deptStatus(app.project!, d) !== "scheduled") focus(d);
    }
  }
  /** Director: show a department unless the user just opened another one. */
  function directorShow(d: WorkDept) {
    shownDept = d;
    if (panelDept !== d && panelDept && Date.now() - userPanelAt < USER_PANEL_MS) return false;
    showPanel(d);
    if (app.project) overlays(phaseOf(app.project));
    return true;
  }
  function renderPanel() {
    const p = app.project;
    if (!p || !panelDept) {
      panelSlot.replaceChildren();
      panelSlot.classList.remove("on");
      return;
    }
    const key = `${panelDept}|${deptStatus(p, panelDept)}|${p.results[panelDept] ? 1 : 0}`;
    if (key === panelKey) return;
    panelKey = key;
    const cur = panelSlot.querySelector<HTMLElement>(".dp");
    if (cur && cur.dataset.dept === panelDept) {
      refreshDeptPanel(cur, p, panelDept, () => void retry());
    } else {
      panelSlot.replaceChildren(deptPanel(p, panelDept, () => showPanel(null), () => void retry()));
    }
    panelSlot.classList.add("on");
  }
  // The panel and the "Click anyone to say hi" hint never compete for the same space.
  new MutationObserver(() => officeWrap.classList.toggle("has-panel", panelSlot.classList.contains("on"))).observe(panelSlot, { attributes: true, attributeFilter: ["class"] });

  // ---------- camera framing ----------
  const desktop = () => innerWidth >= 1100;
  /** The part of the office not covered by the department panel (office px). */
  function freeRect(): Rect | undefined {
    const dp = panelSlot.querySelector(".dp");
    if (!dp || !desktop()) return undefined;
    const o = officePanel.getBoundingClientRect();
    const r = dp.getBoundingClientRect();
    const top = 56; // status pill
    // The guide card (bottom-left) is a safe area too: rooms are framed above it.
    const g = guide.getBoundingClientRect();
    const bottom = g.height ? o.bottom - g.top + 12 : 70;
    // The panel is docked on the right: frame the room in what is left, 24 px from every edge.
    return { x: 24, y: top, w: r.left - o.left - 48, h: o.height - top - bottom };
  }
  let focused: { room: DeptId | "overview"; with?: DeptId[] } = { room: "overview" };
  const focus = (room: DeptId | "overview", withRooms?: DeptId[], ms?: number) => {
    focused = { room, with: withRooms };
    office?.focus(room, { ms: reducedMotion() ? 0 : ms, free: room === "overview" ? undefined : freeRect(), with: withRooms });
  };
  // The panel grows when results replace placeholders: keep the room framed beside it.
  let lastPanelBox = "";
  new ResizeObserver(() => {
    const dp = panelSlot.querySelector(".dp");
    const box = dp ? `${Math.round(dp.clientWidth / 24)}x${Math.round(dp.clientHeight / 24)}` : "";
    if (box === lastPanelBox) return;
    lastPanelBox = box;
    if (focused.room !== "overview") focus(focused.room, focused.with, 600);
  }).observe(panelSlot);

  // ---------- overlays ----------
  function overlays(ph: Phase) {
    let text = READY;
    let tone = "ok";
    let g = "Type your idea or pick an example. Stage 1 (validate) costs 10 cents in Bitcoin Cash.";
    switch (ph.kind) {
      case "unpaid":
        text = "Waiting for your payment";
        tone = "wait";
        g = `Approve the ${STAGE_INFO[ph.stage].label} payment in your wallet. The team starts the moment it lands on Bitcoin Cash.`;
        break;
      case "working": {
        // Follow what the office shows (the director lingers on a delivery), never contradict the panel.
        const d = shownDept && ph.stage === (STAGE_DEPTS.validate.includes(shownDept) ? "validate" : "build") ? shownDept : ph.dept;
        const st = d && app.project ? deptStatus(app.project, d) : null;
        if (d && st === "done") {
          const next = ph.dept && ph.dept !== d ? TEAM[ph.dept].name : null;
          text = next ? `${TEAM[d].name} delivered · handing over to ${next}` : `${TEAM[d].name} delivered`;
          g = TEAM[d].guide;
        } else if (d) {
          text = TEAM[d].working;
          g = TEAM[d].guide;
        } else {
          text = "Payment received · the team is getting started";
          g = "Your payment landed in the lobby. Mia takes the stage budget and briefs the team.";
        }
        tone = "busy";
        break;
      }
      case "gate":
        text = "Your turn: go or stop";
        tone = "wait";
        g = "Stage 1 is done. Read the report and decide: build it for $0.20, or stop here and keep the report.";
        break;
      case "stopped":
        text = "Report kept · office on standby";
        g = "You stopped after validation and kept the report. Nothing else is charged. You can still continue later.";
        break;
      case "done": {
        const name = app.project?.results.nova?.names[app.project.results.nova.chosen]?.name;
        const fresh = !!app.project && !packSeen(app.project.id);
        text = fresh && name ? `${name} is live. Open the pack` : "Your startup pack is ready";
        tone = fresh ? "live" : "ok";
        g = "Your startup pack is ready. Open any tile below to read it, or download the whole pack.";
        break;
      }
      case "error": {
        const who = ph.dept ? TEAM[ph.dept] : null;
        text = who ? `${who.name} hit a snag. Retry ${who.name}` : "The team hit a snag. Retry";
        tone = "err";
        g = who
          ? `${who.name} couldn't finish ${who.snag}. ${coarse() ? "Tap" : "Click"} ${who.name}'s room or Retry: it's free, you already paid for this stage.`
          : "Something went wrong. Retry is free: you already paid for this stage.";
        break;
      }
    }
    statusPill.className = `ov-status t-${tone}`;
    if (tone === "live") {
      statusPill.replaceChildren(
        h("button", { type: "button", class: "ov-live", onclick: () => openPackSafe() }, h("span", { class: "sdot", "aria-hidden": "true" }), h("span", null, text)),
      );
    } else statusPill.replaceChildren(h("span", { class: "sdot", "aria-hidden": "true" }), h("span", null, text));
    guideText.textContent = g;
    stripText.textContent = g;
  }

  function render() {
    const p = app.project;
    const ph = phaseOf(p);
    hdr.setStep(stepOf(ph));
    document.body.classList.toggle("is-home", !p);
    const price = app.config ? `$${(app.config.prices.validate / 100).toFixed(2)}` : "$0.10";
    const price2 = app.config ? `$${(app.config.prices.build / 100).toFixed(2)}` : "$0.20";
    homeBar.querySelector("[data-hb-label]")!.textContent = `Validate my idea · ${price}`;
    homeBar.querySelector("[data-hb-sub]")!.textContent = `Paid in Bitcoin Cash · ${price2} more to launch`;
    overlays(ph);
    out.render(p);
    side.render(p);
    renderPanel();
  }

  // ---------- director: turns project changes into office animation ----------
  let queue: Promise<void> = Promise.resolve();
  let epoch = 0;
  let pending = 0;
  let wake: (() => void) | null = null;
  const enqueue = (fn: () => Promise<void> | void) => {
    const my = epoch;
    pending++;
    wake?.();
    queue = queue
      .then(() => {
        pending--;
        return my === epoch ? fn() : undefined;
      })
      .catch((e) => console.error("[director]", e));
  };
  /** Lingers on a result, but hands over early (after `min`) as soon as something newer happens. */
  const dwell = async (ms: number, min = PANEL_HOLD_MS) => {
    if (pending > 0) return sleep(PANEL_HANDOFF_MS);
    await sleep(min);
    if (pending > 0) return;
    await Promise.race([sleep(ms - min), new Promise<void>((r) => (wake = r))]);
    wake = null;
  };
  const gateShown = new Set<string>();
  const packShown = new Set<string>();

  function showBanner(kicker: string, value: string, sub: string) {
    banner.replaceChildren(h("div", { class: "ovb" }, h("small", null, kicker), h("b", null, value), h("span", null, sub)));
    banner.classList.add("on");
  }
  const hideBanner = () => {
    banner.classList.remove("on");
    banner.replaceChildren();
  };

  function resetOffice() {
    epoch++;
    queue = Promise.resolve();
    hideBanner();
    if (!office) return;
    office.clearPins();
    shownDept = null;
    for (const d of ["lobby", ...WORK_ORDER] as DeptId[]) {
      office.setState(d, d === "pip" ? "sleeping" : "idle");
      office.note(d, null);
      office.flag(d, false);
    }
    focus("overview");
  }

  function markError(d: WorkDept) {
    office?.setState(d, "idle");
    office?.flag(d, true);
    office?.note(d, `Needs a retry · ${coarse() ? "tap" : "click"} to retry`);
  }

  /** Puts the office in the state of `p` without replaying animations (page load / restore). */
  function restore(p: Project) {
    resetOffice();
    if (!office) return;
    let active: WorkDept | null = null;
    for (const d of WORK_ORDER) {
      const s = deptStatus(p, d);
      if (s === "done") {
        office.setState(d, "done");
        const pin = pinFor(p, d);
        if (pin) office.pin(d, { ...pin, tone: TEAM[d].color });
      } else if (s === "working") {
        office.setState(d, "working");
        office.note(d, TEAM[d].busy);
        active = d;
      } else if (s === "error") {
        markError(d);
        active = d;
      }
    }
    const ph = phaseOf(p);
    if (!active && ph.kind === "working" && ph.stage === "validate") active = "mia";
    if (active) {
      shownDept = active;
      showPanel(active);
      focus(active);
    }
  }

  function diff(prev: Project, next: Project) {
    for (const s of ["validate", "build"] as Stage[]) {
      const pay = next.payments[s];
      if (pay && !prev.payments[s]) {
        enqueue(async () => {
          const budget = stageSats(next, s);
          play("coin");
          // Stage 1: Mia's panel opens right away with her brief and an empty plan.
          if (s === "validate") directorShow("mia");
          focus("lobby", ["mia"]);
          office?.chip("lobby", pay.sats > 0 ? `Payment received · ${fmtSats(pay.sats)} sats` : "Stage started · local test", pay.sats > 0 ? "bch" : "gold");
          await sleep(900);
          office?.setState("mia", "walking");
          await capped(office?.walk("mia", "lobby"));
          office?.chip(
            "lobby",
            budget > 0 && pay.sats > 0 ? `Lobby → Mia · ${fmtSats(budget)} sats · internal` : budget > 0 ? `Lobby → Mia · ≈ ${fmtSats(budget)} sats · simulated` : `Stage ${STAGE_INFO[s].n} budget → Mia · internal`,
            "gold",
          );
          await sleep(600);
          const back = capped(office?.walk("mia", "mia")).then(() => {
            const st = deptStatus(app.project ?? next, "mia");
            office?.setState("mia", st === "working" ? "working" : st === "done" ? "done" : "idle");
          });
          // Stage 1: Mia is the first to work, so wait for her to sit down. Stage 2: Nova starts while Mia walks back.
          if (s === "validate") {
            await back;
            if (deptStatus(app.project ?? next, "mia") !== "done") focus("mia");
          }
        });
      }
    }
    for (const d of WORK_ORDER) {
      const a = deptStatus(prev, d);
      const b = deptStatus(next, d);
      if (a === b) continue;
      if (a === "error") office?.flag(d, false);
      if (b === "working") {
        enqueue(async () => {
          office?.flag(d, false);
          office?.setState(d, "working");
          office?.note(d, TEAM[d].busy);
          if (directorShow(d)) focus(d);
          play("start");
          await sleep(500);
        });
      } else if (b === "done") {
        enqueue(async () => {
          office?.setState(d, "done");
          office?.note(d, null);
          const cur = app.project ?? next;
          const shown = directorShow(d);
          if (shown && focused.room !== d) focus(d);
          const pin = pinFor(cur, d);
          if (pin) office?.pin(d, { ...pin, tone: TEAM[d].color });
          const s = STAGE_DEPTS.validate.includes(d) ? "validate" : "build";
          const share = Math.floor(stageSats(cur, s) / STAGE_DEPTS[s].length);
          const sim = !!cur.payments[s] && isDevTx(cur.payments[s]!.txid);
          // Money between departments is bookkeeping inside the office: always labelled as internal (or simulated).
          office?.chip(
            d,
            d !== "mia" && share > 0 ? (sim ? `Mia → ${TEAM[d].name} · ≈ ${fmtSats(share)} sats · simulated` : `Mia → ${TEAM[d].name} · +${fmtSats(share)} sats · internal`) : "Delivered",
            "dept",
          );
          play("done");
          // Keep the delivered work on screen before the next department takes over.
          await dwell(d === "pip" ? PANEL_HOLD_MS : 4000);
        });
      } else if (b === "error") {
        enqueue(async () => {
          markError(d);
          shownDept = d;
          showPanel(d);
          focus(d);
        });
      }
    }
    if (stageDone(next, "validate") && !stageDone(prev, "validate")) {
      enqueue(async () => {
        void refreshStats();
        await sleep(600);
        shownDept = null;
        showPanel(null);
        focus("overview");
        await sleep(900);
        if (app.project?.id === next.id && phaseOf(app.project).kind === "gate") void gate();
      });
    }
    if (stageDone(next, "build") && !stageDone(prev, "build")) {
      enqueue(() => finale(next));
    }
  }

  /** Launch finale: overview, confetti, the pins pop in one by one, the team payout banner. */
  async function finale(p: Project) {
    void refreshStats();
    await sleep(400);
    shownDept = null;
    showPanel(null);
    focus("overview");
    await sleep(700);
    const cur = app.project ?? p;
    office?.clearPins();
    if (!reducedMotion()) office?.celebrate();
    play("celebrate");
    const total = stageSats(cur, "validate") + stageSats(cur, "build");
    const sim = Object.values(cur.payments).some((x) => x && isDevTx(x.txid));
    showBanner(
      sim ? "Team payout · simulated · local test" : "Team payout · internal · not on-chain",
      total > 0 ? `${sim ? "≈ " : ""}${fmtSats(total)} sats → 7` : "7 departments paid",
      sim ? "What the team would share at the stage prices. Nothing was paid in this local test." : "Mia, Leo, Sam, Nova, Dex, Rae and Pip get their share of your two stage payments",
    );
    for (const d of WORK_ORDER) {
      const pin = pinFor(cur, d);
      if (pin) office?.pin(d, { ...pin, tone: TEAM[d].color });
      await sleep(220);
    }
    await sleep(FINALE_MS - WORK_ORDER.length * 220);
    hideBanner();
    if (app.project?.id === p.id && !packShown.has(p.id)) {
      packShown.add(p.id);
      openPackSafe(undefined, true);
    }
    render();
  }

  function setProject(p: Project | null, opts: { restore?: boolean } = {}) {
    const prev = app.project;
    app.project = p;
    if (!p) {
      resetOffice();
      showPanel(null);
    } else if (opts.restore || !prev || prev.id !== p.id) {
      restore(p);
    } else {
      diff(prev, p);
    }
    render();
  }

  // ---------- polling ----------
  let timer: number | undefined;
  /** Each poll loop has a token; starting a new one (new project, retry) silently retires the old one. */
  let pollId = 0;
  let failures = 0;
  /** After a retry, keep polling for a while even if the first answer still shows the old error. */
  let graceUntil = 0;
  async function poll(my: number) {
    clearTimeout(timer);
    const id = app.project?.id;
    if (!id || my !== pollId) return;
    try {
      const p = await api.get(id);
      if (my !== pollId) return;
      failures = 0;
      if (app.project?.id === id) setProject(p);
    } catch {
      if (my !== pollId) return;
      failures++;
      if (failures === 3) toast("Connection is shaky. Still trying…", "err");
    }
    if (my !== pollId || app.project?.id !== id) return;
    const ph = phaseOf(app.project);
    const fast = needsPolling(ph) || Date.now() < graceUntil;
    if (fast) timer = window.setTimeout(() => void poll(my), failures ? Math.min(8000, POLL_MS * (failures + 1)) : POLL_MS);
    else if (ph.kind === "error") timer = window.setTimeout(() => void poll(my), ERROR_POLL_MS);
  }
  const ensurePolling = () => {
    const my = ++pollId;
    clearTimeout(timer);
    void poll(my);
  };

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
    const { id } = await api.create(idea);
    const p = await api.get(id);
    history.pushState(null, "", `/p/${id}`);
    setProject(p, { restore: true });
    play("tap");
    void pay("validate");
  }

  async function pay(stage: Stage) {
    const p = app.project;
    if (!p) return;
    if (p.payments[stage]) {
      ensurePolling();
      return;
    }
    const paid = await openPay(p, stage);
    if (app.project?.id !== p.id) return;
    if (!paid) {
      // Closed early: the payment may still have gone through. Ask the server.
      try {
        const fresh = await api.get(p.id);
        if (app.project?.id === p.id && fresh.payments[stage]) {
          setProject(fresh);
          void api.run(p.id, stage).catch(() => {});
          ensurePolling();
        }
      } catch {
        /* nothing to do */
      }
      return;
    }
    if (stage === "build") setStopped(p.id, false);
    // Phones: the paid stage plays out in the office at the top of the page.
    if (innerWidth < 1100) window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
    setProject(paid);
    void refreshStats();
    ensurePolling();
  }

  async function gate() {
    const p = app.project;
    if (!p || !stageDone(p, "validate") || p.payments.build) return;
    gateShown.add(p.id);
    showPanel(null);
    const choice = await openGate(p);
    if (app.project?.id !== p.id) return;
    if (choice === "approve") {
      setStopped(p.id, false);
      render();
      await pay("build");
    } else if (choice === "stop") {
      setStopped(p.id, true);
      render();
      toast("Report kept. Nothing else is charged.", "ok");
    }
  }

  async function retry() {
    const p = app.project;
    if (!p) return;
    const ph = phaseOf(p);
    if (ph.kind !== "error") return;
    graceUntil = Date.now() + 10_000;
    try {
      await api.run(p.id, ph.stage);
      toast(ph.dept ? `${TEAM[ph.dept].name} is on it again` : "Running it again…", "info");
    } catch (e) {
      toast((e as Error).message, "err");
    }
    failures = 0;
    ensurePolling();
  }

  /** `auto`: the finale opened it. The "is live" banner stays until the user opens the pack themselves. */
  function openPackSafe(tab?: string, auto = false) {
    const p = app.project;
    if (!p) return;
    play("open");
    if (!auto && phaseOf(p).kind === "done" && !packSeen(p.id)) {
      markPackSeen(p.id);
      requestAnimationFrame(() => overlays(phaseOf(app.project)));
    }
    try {
      openPack(p, tab);
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
    pollId++; // retire any poll loop of the previous screen
    // Back / Forward: nothing from the previous screen may stay on top.
    if (isPackOpen()) closePack();
    closeAllModals();
    const m = path.match(/^\/p\/([\w-]+)/);
    if (!m) {
      setProject(null);
      document.title = "LaunchDesk — Your startup team, for pennies";
      return;
    }
    try {
      const p = await api.get(m[1]);
      if (seq !== loadSeq) return; // a newer Back / Forward won
      setProject(p, { restore: true });
      document.title = `${p.results.mia?.title ?? "Your project"} · LaunchDesk`;
      const ph = phaseOf(p);
      if (ph.kind === "working") {
        // Idempotent: makes sure the server is working on a paid stage after a reload.
        void api.run(p.id, ph.stage).catch(() => {});
        ensurePolling();
      } else if (ph.kind === "gate" && !gateShown.has(p.id)) {
        void gate();
      } else if (ph.kind === "error") {
        ensurePolling();
      }
    } catch (e) {
      if (seq !== loadSeq) return;
      toast((e as Error).message || "Project not found", "err");
      history.replaceState(null, "", "/");
      setProject(null);
    }
  }
  function go(path: string) {
    if (location.pathname !== path) history.pushState(null, "", path);
    void load(path);
  }
  window.addEventListener("popstate", () => void load(location.pathname));
  // "Start a new idea" inside the pack modal: route in place instead of reloading.
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
      // Update prices and the BCH rate in place: never rebuild the form the user may be typing in.
      side.refreshConfig();
      out.render(app.project);
      // The server answers instantly from its price cache; ask again once it has a fresh price.
      if (again && !app.config.bchUsd) setTimeout(() => void loadConfig(false), 6000);
    } catch {
      toast("Cannot reach the LaunchDesk server.", "err");
    }
  };
  void loadConfig(true);
  void refreshStats();
  void load(location.pathname);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && app.project && (needsPolling(phaseOf(app.project)) || phaseOf(app.project).kind === "error")) ensurePolling();
  });
}
