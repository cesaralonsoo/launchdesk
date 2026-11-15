// Right column. Home: the idea card (L5–L10, F1, F2), "Your projects" (L11) and the phone start dock (L13).
// Project: the v3 project card (WS2 replaces it with the Now card + team list). Owner: WS1.
import { api } from "../api";
import type { Project, Stage, Stats, WorkDept } from "../types";
import { STAGE_DEPTS } from "../types";
import { h, patch } from "./dom";
import { toast } from "./modal";
import { reduced } from "./motion";
import { list as listProjects, onChange as onProjects } from "./projects";
import { openMyProjects, projectRow } from "./projects-ui";
import { play } from "./sound";
import {
  app,
  deptStatus,
  explorerTx,
  fmtSats,
  fmtUsd,
  isDevTx,
  phaseOf,
  provisionalTitle,
  shortTx,
  stageSats,
  type Phase,
} from "./state";
import { STAGE_INFO, TEAM, WORK_ORDER } from "./team";
import { avatar, avatarGroup, bchMark, extIcon, icon, iconSvg, spinner, statusPill, type AgendaStatus } from "./ui";

export type SideActions = {
  start: (idea: string) => Promise<void>;
  pay: (stage: Stage) => void;
  gate: () => void;
  pack: (tab?: string) => void;
  retry: () => void;
  newIdea: () => void;
  agenda: (d: WorkDept) => void;
};

const price = (s: Stage) => fmtUsd(app.config?.prices[s] ?? (s === "validate" ? 10 : 20));
const MIN_IDEA = 15;

/** F1: the 3 sample ideas (server list wins). Chip label → full sentence. */
const SAMPLE_FALLBACK = [
  "A specialty coffee kiosk at a Barcelona metro exit, €3 flat whites for commuters",
  "A dog-walking app for busy Madrid professionals, €12 a walk",
  "An online shop for restored vintage road bikes, around €450 each",
];
const CHIP_LABELS = ["Coffee kiosk, Barcelona", "Dog-walking app, Madrid", "Vintage bikes, online"];
const samples = () => (app.config?.sampleIdeas?.length ? app.config.sampleIdeas : SAMPLE_FALLBACK);
/** A public demo server without AI: only the sample ideas, no free text, no price shown as a charge. */
const isDemo = () => !!app.config?.mockAi;

// ---------- typed placeholder (L6) ----------

/** Types the sample ideas into the placeholder: 40ms per character, 2.5s pause. Stops on focus. */
function typePlaceholder(ta: HTMLTextAreaElement) {
  let stopped = false;
  let timer = 0;
  let i = 0;
  const stop = (final?: string) => {
    stopped = true;
    clearTimeout(timer);
    if (final !== undefined) ta.placeholder = final;
  };
  const cycle = () => {
    const text = samples()[i % samples().length]!;
    let n = 0;
    const type = () => {
      if (stopped || !ta.isConnected) return;
      ta.placeholder = text.slice(0, ++n);
      if (n < text.length) timer = window.setTimeout(type, 40);
      else timer = window.setTimeout(erase, 2500);
    };
    const erase = () => {
      if (stopped || !ta.isConnected) return;
      n = Math.max(0, n - 3);
      ta.placeholder = text.slice(0, n);
      if (n > 0) timer = window.setTimeout(erase, 16);
      else {
        i++;
        timer = window.setTimeout(cycle, 400);
      }
    };
    type();
  };
  if (reduced()) ta.placeholder = samples()[0]!;
  // Start once the card is in the page (the loops stop when it leaves).
  else timer = window.setTimeout(cycle, 500);
  ta.addEventListener("focus", () => stop(samples()[i % samples().length]), { once: true });
  return { stop };
}

// ---------- the idea card ----------

type HomeCard = { el: HTMLElement; update: () => void; setOffline: (msg: string | null, retry?: () => void) => void };
let home: HomeCard | null = null;

function timeline() {
  const row = (n: string, title: string, sub: string, ids: Parameters<typeof avatarGroup>[0], stage: Stage) =>
    h(
      "li",
      { class: "tl-row" },
      h("span", { class: "tl-n", "aria-hidden": "true" }, n),
      h("div", { class: "tl-m" }, h("div", { class: "tl-t" }, h("b", null, title), avatarGroup(ids)), h("small", null, sub)),
      h("span", { class: "tl-p num", "data-price": stage }, price(stage)),
    );
  return h(
    "ol",
    { class: "tl", "aria-label": "How it works" },
    row("1", "Validate", "Plan, market score, numbers", ["mia", "leo", "sam"], "validate"),
    h("li", { class: "tl-gap" }, h("span", { class: "tl-line", "aria-hidden": "true" }), h("small", null, "You decide in between")),
    row("2", "Build", "Name, logo, live site, 30-day launch", ["nova", "dex", "rae", "pip"], "build"),
  );
}

/** L10: real stats only (hidden under 10 ideas). */
const statsLine = (s: Stats | null) =>
  s && s.ideas >= 10 ? `${s.ideas.toLocaleString("en-US")} ideas validated · ${s.launched.toLocaleString("en-US")} launched` : "";

/** The home idea card (L5–L10). Exported for WS2 (contracts: `renderHomeCard()`). */
export function renderHomeCard(act: SideActions): HTMLElement {
  const ta = h("textarea", {
    id: "idea",
    rows: 3,
    maxlength: 2000,
    "aria-describedby": "idea-hint idea-err",
    "aria-label": "Your business idea",
    spellcheck: "true",
  });
  const go = h("button", {
    type: "submit",
    class: "idea-go",
    "aria-label": "Validate my idea",
    tabindex: "-1",
    html: iconSvg("arrowUp", 18, 2),
  });
  const field = h("div", { class: "idea-field" }, ta, go);
  const hint = h("p", { class: "idea-hint", id: "idea-hint" }, "Tip: say where, for whom and at what price.");
  const err = h("p", { class: "field-err", id: "idea-err", role: "alert" });
  const chips = h(
    "div",
    { class: "idea-chips", role: "group", "aria-label": "Sample ideas" },
    CHIP_LABELS.map((label, i) =>
      h(
        "button",
        {
          type: "button",
          class: "chip ex",
          onclick: () => {
            ta.value = samples()[i] ?? SAMPLE_FALLBACK[i]!;
            chips.querySelectorAll(".chip").forEach((c, j) => c.classList.toggle("is-on", j === i));
            err.textContent = "";
            play("tap");
            ph.stop(ta.placeholder);
            ta.focus({ preventScroll: true });
            ta.setSelectionRange(ta.value.length, ta.value.length);
            field.classList.remove("flash");
            void field.offsetWidth;
            field.classList.add("flash");
            sync();
          },
        },
        label,
      ),
    ),
  );
  const btn = h("button", { type: "submit", class: "btn primary lg block start-btn", disabled: true });
  const ctaSub = h("p", { class: "idea-cta-sub" });
  const exampleLink = h(
    "a",
    {
      class: "link idea-example",
      href: "/p/example",
      hidden: true,
      onclick: (e: Event) => {
        if ((e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey) return;
        e.preventDefault();
        void openExample();
      },
    },
    "See a finished pack, free →",
  );
  const statsRow = h("li", { class: "trust-stats", hidden: true }, icon("bars", 16), h("span", null));
  const trust = h(
    "ul",
    { class: "trust" },
    h("li", null, icon("shield", 16), h("span", null, "No account, no card, no subscription")),
    h("li", null, icon("lock", 16), h("span", null, "Your idea stays private")),
    statsRow,
  );
  const rate = h("p", { class: "idea-rate num" });
  const offline = h("div", { class: "idea-offline", role: "alert", hidden: true });
  const sub = h("p", { class: "idea-sub" });

  const form = h(
    "form",
    { class: "surface idea-card", "aria-labelledby": "np-title", novalidate: true },
    h("h1", { id: "np-title", class: "t-display idea-h" }, "Your startup team, for pennies."),
    sub,
    h("div", { class: "idea-input" }, field, hint, err),
    chips,
    timeline(),
    h("div", { class: "idea-cta" }, offline, btn, ctaSub, exampleLink),
    recentProjects(true),
    h("div", { class: "idea-trust" }, trust, rate),
  );

  // Phones: a sticky start bar once the card's own button has scrolled away (L13).
  const dockBtn = h("button", { type: "button", class: "btn primary lg block" });
  const dock = h("div", { class: "home-dock", role: "region", "aria-label": "Start" }, dockBtn);
  form.append(dock);
  dockBtn.addEventListener("click", () => {
    if (valid()) return void form.requestSubmit();
    ta.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
    ta.focus({ preventScroll: true });
  });
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(([e]) => document.body.classList.toggle("cta-away", !!e && !e.isIntersecting && e.boundingClientRect.top < innerHeight), {
      threshold: 0,
    });
    io.observe(btn);
    const mo = new MutationObserver(() => {
      if (!form.isConnected) {
        io.disconnect();
        mo.disconnect();
        document.body.classList.remove("cta-away");
      }
    });
    requestAnimationFrame(() => form.parentElement && mo.observe(form.parentElement, { childList: true }));
  }

  let offlineMsg: string | null = null;
  let busy = false;
  const valid = () => ta.value.trim().length >= MIN_IDEA;
  const ctaLabel = () => (isDemo() ? "Watch a sample run" : `Validate my idea · ${price("validate")}`);

  /** Disabled state, hint, inline arrow and auto-grow (3 → 6 rows). */
  function sync() {
    const n = ta.value.trim().length;
    const ok = n >= MIN_IDEA;
    const wasDisabled = btn.disabled;
    btn.disabled = !ok || busy || !!offlineMsg;
    if (wasDisabled && !btn.disabled) btn.classList.add("just-enabled");
    form.classList.toggle("is-valid", ok);
    go.tabIndex = ok ? 0 : -1;
    go.disabled = !ok || busy || !!offlineMsg;
    if (isDemo()) hint.textContent = "";
    else hint.textContent = n > 0 && !ok ? "Add a few more words" : "Tip: say where, for whom and at what price.";
    hint.classList.toggle("is-short", n > 0 && !ok);
    const cs = getComputedStyle(ta);
    const lh = parseFloat(cs.lineHeight) || 25;
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    ta.style.height = "auto";
    const want = Math.max(lh * 3 + pad, Math.min(ta.scrollHeight, lh * 6 + pad)) + border;
    ta.style.height = `${Math.ceil(want)}px`;
    ta.style.overflowY = ta.scrollHeight > lh * 6 + pad + 1 ? "auto" : "hidden";
  }

  /** Config-driven text: prices, demo mode, BCH rate, stats. Never rebuilds the field. */
  function update() {
    const demo = isDemo();
    form.classList.toggle("is-demo", demo);
    ta.readOnly = demo;
    if (demo) {
      ph.stop("Demo server: pick one of the 3 sample ideas");
      ta.setAttribute("aria-readonly", "true");
      // First impression is a working button: the first sample is picked for you.
      if (!ta.value.trim()) {
        ta.value = samples()[0] ?? SAMPLE_FALLBACK[0]!;
        chips.querySelector(".chip")?.classList.add("is-on");
      }
    } else ta.removeAttribute("aria-readonly");
    sub.textContent = `Three specialists test your idea for ${price("validate")}. Like the answer? Four more build it for ${price("build")}.`;
    if (!busy) btn.textContent = ctaLabel();
    dockBtn.textContent = ctaLabel();
    ctaSub.textContent = demo ? "Demo server: no payment and no AI. You'll see a fixed sample." : "About 1 minute. Stop after this step and keep the report.";
    form.querySelectorAll<HTMLElement>("[data-price]").forEach((x) => (x.textContent = price(x.dataset.price as Stage)));
    const usd = app.config?.bchUsd;
    rate.textContent = usd ? `1 BCH ≈ $${Math.round(usd).toLocaleString("en-US")}` : "";
    const sl = statsLine(app.stats);
    statsRow.hidden = !sl;
    statsRow.querySelector("span:last-child")!.textContent = sl;
    sync();
  }

  function setOffline(msg: string | null, retry?: () => void) {
    offlineMsg = msg;
    offline.hidden = !msg;
    offline.replaceChildren();
    if (msg)
      offline.append(h("span", null, msg), ...(retry ? [h("button", { type: "button", class: "link", onclick: retry }, "Retry")] : []));
    sync();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const idea = ta.value.trim();
    if (idea.length < MIN_IDEA) {
      hint.textContent = "Add a few more words";
      ta.focus();
      return;
    }
    if (busy || offlineMsg) return;
    err.textContent = "";
    busy = true;
    sync();
    btn.replaceChildren(spinner(), isDemo() ? "Starting the sample…" : "Opening the office…");
    try {
      await act.start(idea);
    } catch (x) {
      err.textContent = (x as Error).message;
    } finally {
      busy = false;
      btn.textContent = ctaLabel();
      sync();
    }
  });
  ta.addEventListener("input", () => {
    err.textContent = "";
    sync();
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  btn.addEventListener("animationend", () => btn.classList.remove("just-enabled"));

  // F2: show the example link only when this server really has the example pack.
  void api
    .get("example")
    .then((p) => {
      if (p?.example || p?.id === "example") exampleLink.hidden = false;
    })
    .catch(() => undefined);

  const ph = typePlaceholder(ta);
  home = { el: form, update, setOffline };
  update();
  requestAnimationFrame(sync);
  return form;
}

/** F2: opens the seeded example pack read-only, without leaving the home screen. */
async function openExample() {
  play("open");
  try {
    const [p, pack] = await Promise.all([api.get("example"), import("../pack")]);
    pack.openPack(p, { readOnly: true, banner: "example" });
  } catch {
    toast("The example pack isn't available on this server.", "err");
  }
}

/** L11: up to 3 recent projects under the idea card, from this browser's list. */
function recentProjects(inline = false): HTMLElement {
  // Inline: inside the idea card, right under the CTA, so a returning visitor sees it above the fold.
  const hid = inline ? "recent-h-in" : "recent-h";
  const el = h("section", { class: inline ? "recent recent-in" : "surface recent", "aria-labelledby": hid, hidden: true });
  const max = inline ? 2 : 3;
  const render = () => {
    const rows = listProjects();
    el.hidden = rows.length === 0;
    if (!rows.length) return el.replaceChildren();
    const all = h("button", { type: "button", class: "link recent-all" }, "See all");
    all.addEventListener("click", () => openMyProjects(all));
    el.replaceChildren(
      h("div", { class: "recent-h" }, h("h2", { id: hid, class: "t-label" }, "Your projects"), rows.length > max ? all : null),
      h("div", { class: "pr-list" }, rows.slice(0, max).map((r) => projectRow(r))),
    );
  };
  const off = onProjects(render);
  const mo = new MutationObserver(() => {
    if (!el.isConnected && el.dataset.mounted) {
      off();
      mo.disconnect();
    }
  });
  requestAnimationFrame(() => {
    el.dataset.mounted = "1";
    if (el.parentElement) mo.observe(el.parentElement, { childList: true });
  });
  render();
  return el;
}

// ---------- F12: errors ----------

/** Side-column card for an unknown /p/:id (WS2 calls `side.renderNotFound()`). */
export function notFoundCard(act: Pick<SideActions, "newIdea">): HTMLElement {
  const any = listProjects().length > 0;
  const mine = h("button", { type: "button", class: "btn" }, "My projects");
  mine.addEventListener("click", () => openMyProjects(mine));
  return h(
    "section",
    { class: "surface notfound", role: "alert" },
    h("h1", { class: "t-title-3" }, "This project link doesn't work"),
    h("p", { class: "nf-sub" }, "It may be mistyped, or it was made on another server."),
    h("div", { class: "nf-btns" }, h("button", { type: "button", class: "btn primary", onclick: act.newIdea }, "Start a new idea"), any ? mine : null),
  );
}

// ---------- Project (v3 card; WS2 replaces it with now.ts) ----------

type Row = { key: string; dept: WorkDept | "you"; label: string; status: AgendaStatus; note?: string };

/** The team in work order, with "You · Decide" between Sam and Nova. No clock times: only real states. */
function agendaRows(p: Project, ph: Phase): Row[] {
  const rows: Row[] = [];
  const stopped = ph.kind === "stopped";
  WORK_ORDER.forEach((d) => {
    const s = deptStatus(p, d);
    const isB = STAGE_DEPTS.build.includes(d);
    const status: AgendaStatus = s === "scheduled" ? (stopped && isB ? "skipped" : "queued") : s;
    rows.push({
      key: d,
      dept: d,
      label: `${TEAM[d].name} · ${TEAM[d].task}`,
      status,
      note: s === "error" ? "Needs a retry" : undefined,
    });
    if (d === "sam") {
      const g: AgendaStatus = p.payments.build ? "done" : ph.kind === "gate" ? "waiting" : stopped ? "stopped" : "queued";
      rows.push({ key: "you", dept: "you", label: "You · Decide", status: g, note: g === "waiting" ? "Your report is ready" : stopped ? "You kept the report" : undefined });
    }
  });
  return rows;
}

function actionBar(p: Project, ph: Phase, act: SideActions) {
  switch (ph.kind) {
    case "unpaid":
      return h(
        "div",
        { class: "next" },
        h("div", null, h("b", null, "Waiting for your payment"), h("small", null, STAGE_INFO[ph.stage].label)),
        h("button", { type: "button", class: "btn primary", onclick: () => act.pay(ph.stage) }, bchMark(15), `Pay ${price(ph.stage)} with BCH`),
      );
    case "gate":
      return h(
        "div",
        { class: "next wait" },
        h("div", null, h("b", null, "Your Stage 1 report is ready"), h("small", null, "Continue to Build & Launch, or stop and keep it.")),
        h("button", { type: "button", class: "btn primary", onclick: act.gate }, "Review and decide"),
      );
    case "stopped":
      return h(
        "div",
        { class: "next" },
        h("div", null, h("b", null, "You kept the Stage 1 report"), h("small", null, "Nothing else is charged. You can still continue later.")),
        h("div", { class: "next-btns" }, h("button", { type: "button", class: "btn sm", onclick: () => act.pack("opportunity") }, "Open report"), h("button", { type: "button", class: "btn primary sm", onclick: act.gate }, `Continue · ${price("build")}`)),
      );
    case "done":
      return h(
        "div",
        { class: "next done" },
        h("div", null, h("b", null, "Your startup pack is ready"), h("small", null, p.results.pip ? `Live at /s/${p.results.pip.slug}` : "All 7 departments delivered")),
        h("button", { type: "button", class: "btn primary", onclick: () => act.pack() }, "Open pack"),
      );
    case "error": {
      const who = ph.dept ? TEAM[ph.dept] : null;
      return h(
        "div",
        { class: "next danger", role: "alert" },
        h(
          "div",
          null,
          h("b", null, who ? `${who.name} couldn't finish ${who.snag}` : "The team hit a problem"),
          h("small", null, "Retry is free: you already paid for this stage."),
        ),
        h("button", { type: "button", class: "btn primary", onclick: act.retry }, who ? `Retry ${who.name}` : "Retry"),
      );
    }
    default:
      return null;
  }
}

function ledger(p: Project) {
  type L = { at: number; real: boolean; from: string; to: string; sub: Node | string; sats: number; right: string; sim?: boolean };
  const items: L[] = [];
  (["validate", "build"] as Stage[]).forEach((s) => {
    const pay = p.payments[s];
    if (!pay) return;
    const n = STAGE_INFO[s].n;
    const dev = isDevTx(pay.txid);
    items.push({
      at: pay.at,
      real: !dev,
      from: "You",
      to: "LaunchDesk",
      sub: dev
        ? `Stage ${n}, local test, not paid`
        : h("span", null, `Stage ${n} · `, h("a", { href: explorerTx(pay.txid), target: "_blank", rel: "noopener", class: "tx", "aria-label": `View transaction ${pay.txid} on a block explorer` }, `tx ${shortTx(pay.txid)}`, extIcon())),
      sats: pay.sats,
      right: dev ? "local test, nothing paid" : fmtUsd(pay.cents),
    });
    // Internal flows: how the stage budget moves through the office. Never on-chain, never a txid.
    // In a local test nothing was paid: the amounts are the stage price at today's rate, and say so.
    const budget = stageSats(p, s);
    if (budget <= 0) return;
    const tag = dev ? "≈ at stage price, simulated" : "internal, not on-chain";
    items.push({ at: pay.at + 1, real: false, from: "Lobby", to: "Mia", sub: `Stage ${n} budget`, sats: budget, right: tag, sim: dev });
    const depts = STAGE_DEPTS[s];
    const share = Math.floor(budget / depts.length);
    depts.forEach((d, i) => {
      if (d === "mia" || deptStatus(p, d) !== "done") return;
      items.push({ at: pay.at + 2 + i, real: false, from: "Mia", to: TEAM[d].name, sub: TEAM[d].task, sats: share, right: tag, sim: dev });
    });
  });
  items.sort((a, b) => b.at - a.at);
  const realCount = items.filter((i) => i.real).length;
  const MAX = 4;
  const more = items.length - MAX;
  return h(
    "section",
    { class: "card ledger", "aria-labelledby": "ledger-h" },
    h(
      "div",
      { class: "card-h" },
      h("h2", { id: "ledger-h" }, "Office ledger"),
      h("span", { class: "card-meta" }, `${items.length} ${items.length === 1 ? "entry" : "entries"}, ${realCount} on-chain`),
    ),
    items.length
      ? h(
          "ul",
          { class: "led-list", id: `led-${p.id}` },
          items.map((it, i) =>
            h(
              "li",
              { class: `led ${it.real ? "real" : "internal"}${i >= MAX ? " extra" : ""}` },
              it.real || it.from === "You" ? h("span", { class: "led-ico", "aria-hidden": "true" }, bchMark(18)) : h("span", { class: "led-ico", "aria-hidden": "true", html: iconSvg("transfer", 15) }),
              h("div", { class: "led-m" }, h("b", null, `${it.from} → ${it.to}`), h("small", null, it.sub)),
              h("div", { class: "led-v" }, h("b", { class: "num" }, `${it.sim ? "≈ " : ""}${fmtSats(it.sats)} sats`), it.right ? h("small", null, it.right) : null),
            ),
          ),
        )
      : h("p", { class: "muted small empty" }, "No payments yet. Your first payment shows up here with a link to the transaction."),
    more > 0
      ? h(
          "button",
          {
            type: "button",
            class: "link small led-more",
            "aria-expanded": "false",
            "aria-controls": `led-${p.id}`,
            onclick: (e: Event) => {
              const b = e.currentTarget as HTMLButtonElement;
              const open = b.closest(".ledger")!.classList.toggle("open");
              b.setAttribute("aria-expanded", String(open));
              b.textContent = open ? "Show less" : `Show ${more} more`;
            },
          },
          `Show ${more} more`,
        )
      : null,
    h(
      "details",
      { class: "how" },
      h("summary", null, h("span", null, "How the money moves"), h("span", { class: "chev", "aria-hidden": "true", html: iconSvg("chevronDown", 14) })),
      h(
        "ol",
        null,
        h("li", null, h("b", null, "You pay the office per stage"), h("small", null, "On-chain in Bitcoin Cash, cents not dollars")),
        h("li", null, h("b", null, "The lobby hands Mia the stage budget"), h("small", null, "internal, not on-chain")),
        h("li", null, h("b", null, "Mia pays each department as it delivers"), h("small", null, "internal, not on-chain")),
      ),
    ),
  );
}

// ---------- stats (real counts from the server) ----------

let shownStats: Stats | null = null;

/** Counts up from what was on screen to the new value. */
function countUp(el: HTMLElement, from: number, to: number) {
  if (from === to || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = to.toLocaleString("en-US");
    return;
  }
  const t0 = performance.now();
  const ms = 900;
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e).toLocaleString("en-US");
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const hasStats = (s: Stats | null): s is Stats => !!s && (s.ideas > 0 || s.payments > 0 || s.launched > 0);

/** Real mainnet counters. Only shown once there is something real to count (never placeholder dashes). */
export function statsCard(s: Stats | null): HTMLElement | null {
  if (!hasStats(s)) return null;
  const prev = shownStats;
  shownStats = s;
  const tile = (k: "ideas" | "payments" | "launched", l: string) => {
    const from = prev?.[k] ?? 0;
    const b = h("b", null, from.toLocaleString("en-US"));
    requestAnimationFrame(() => countUp(b, from, s[k]));
    return h("div", { class: "stat" }, b, h("small", null, l));
  };
  return h(
    "section",
    { class: "card stats", "aria-label": "LaunchDesk in numbers" },
    h("div", { class: "stat-row" }, tile("ideas", "Ideas validated"), tile("payments", "On-chain payments"), tile("launched", "Businesses launched")),
    h("p", { class: "stat-cap" }, "Mainnet runs only, straight from the database"),
  );
}

const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

/** This project's own numbers: shown for a local / sample run, or before the first mainnet payment. */
function runCard(p: Project): HTMLElement | null {
  const paid = (["validate", "build"] as Stage[]).filter((s) => p.payments[s]);
  if (!paid.length) return null;
  const delivered = WORK_ORDER.filter((d) => deptStatus(p, d) === "done").length;
  const ms = paid.reduce((t, s) => {
    const tm = p.timings[s];
    return t + (tm ? (tm.finished ?? Date.now()) - tm.started : 0);
  }, 0);
  const local = paid.some((s) => isDevTx(p.payments[s]!.txid));
  const stat = (v: string, l: string) => h("div", { class: "stat" }, h("b", null, v), h("small", null, l));
  return h(
    "section",
    { class: "card stats run", "aria-label": "This run" },
    h("div", { class: "stat-k" }, h("span", { class: "kicker" }, "This run"), local ? h("span", { class: "demo-pill" }, "Local test") : null),
    h("div", { class: "stat-row" }, stat(`${paid.length}/2`, "Stages run"), stat(`${delivered}/7`, "Departments delivered"), stat(ms ? fmtDur(ms) : "0s", "Time taken")),
    h("p", { class: "stat-cap" }, local ? "Local tests are never counted in LaunchDesk's mainnet numbers" : "Your run will be the first one counted on mainnet"),
  );
}

// ---------- project ----------

let lastTitle = "";

function projectView(p: Project, act: SideActions) {
  const ph = phaseOf(p);
  const title = p.results.mia?.title || provisionalTitle(p.idea);
  const changed = lastTitle !== "" && lastTitle !== title;
  lastTitle = title;
  const rows = agendaRows(p, ph);
  const localRun = Object.values(p.payments).some((x) => x && isDevTx(x.txid));
  return [
    h(
      "section",
      { class: "card proj", "aria-labelledby": "proj-title" },
      h("div", { class: "kicker" }, "Your project"),
      h("h1", { id: "proj-title", class: `proj-title${changed ? " swap" : ""}`, title: p.idea }, title),
      actionBar(p, ph, act),
      h("div", { class: "agenda-h" }, h("span", { class: "kicker" }, "Your team")),
      h(
        "ol",
        { class: "agenda" },
        rows.map((r) => {
          const clickable =
            r.dept === "you" ? r.status === "waiting" || r.status === "stopped" : r.status === "working" || r.status === "done" || r.status === "error";
          const inner = [
            avatar(r.dept, 32),
            h("span", { class: "ag-m" }, h("b", null, r.label), r.note ? h("small", null, r.note) : null),
            statusPill(r.status),
          ];
          return h(
            "li",
            { class: `ag s-${r.status}` },
            clickable
              ? h(
                  "button",
                  {
                    type: "button",
                    class: "ag-in",
                    onclick: () => (r.dept === "you" ? act.gate() : act.agenda(r.dept)),
                    "aria-label": `${r.label}: ${r.status}. ${r.dept === "you" ? "Open the decision" : "Show the work"}`,
                  },
                  inner,
                )
              : h("div", { class: "ag-in" }, inner),
          );
        }),
      ),
      h("button", { type: "button", class: "link small new-idea", onclick: act.newIdea }, icon("plus", 14), "Start a new idea"),
    ),
    hasStats(app.stats) && !localRun ? statsCard(app.stats) : runCard(p),
    ledger(p),
  ];
}

export function sideColumn(act: SideActions) {
  const el = h("aside", { class: "side", "aria-label": "Project" });
  let current: Project | null = null;
  const render = (p: Project | null) => {
    current = p;
    if (!p) {
      lastTitle = "";
      patch(el, "home", () => [renderHomeCard(act)]);
      return;
    }
    home = null;
    const key = JSON.stringify([p.id, p.status, Object.keys(p.results), p.payments, p.timings, p.error, phaseOf(p).kind, app.config?.prices, app.config?.bchUsd ? 1 : 0]);
    patch(el, key, () => projectView(p, act));
  };
  /** F12: unknown /p/:id. */
  const renderNotFound = () => {
    current = null;
    home = null;
    patch(el, "notfound", () => [notFoundCard(act), recentProjects()]);
  };
  const refreshStats = () => {
    if (!current) return home?.update();
    const localRun = Object.values(current.payments).some((x) => x && isDevTx(x.txid));
    const nu = hasStats(app.stats) && !localRun ? statsCard(app.stats) : runCard(current);
    const old = el.querySelector(".stats");
    if (old && nu) old.replaceWith(nu);
    else if (old) old.remove();
    else if (nu) el.querySelector(".ledger")?.before(nu);
  };
  /** New config (prices, BCH rate, demo mode): update labels in place, never rebuild the form the user is typing in. */
  const refreshConfig = () => {
    if (app.config) stopConfigWatch();
    if (!current) return home?.update();
    render(current);
  };

  // F12: if the config never arrives, say so in the card and retry with backoff (2s, 4s, 8s … 30s).
  let watch = 0;
  let delay = 2000;
  const stopConfigWatch = () => {
    clearTimeout(watch);
    home?.setOffline(null);
  };
  const tryConfig = async () => {
    if (app.config) return stopConfigWatch();
    try {
      app.config = await api.config();
      stopConfigWatch();
      refreshConfig();
    } catch {
      home?.setOffline("Can't reach LaunchDesk right now.", () => {
        clearTimeout(watch);
        delay = 2000;
        void tryConfig();
      });
      watch = window.setTimeout(() => void tryConfig(), delay);
      delay = Math.min(30_000, delay * 2);
    }
  };
  watch = window.setTimeout(() => void tryConfig(), 4000);
  addEventListener("online", () => !app.config && void tryConfig());

  return { el, render, renderNotFound, refreshStats, refreshConfig };
}
