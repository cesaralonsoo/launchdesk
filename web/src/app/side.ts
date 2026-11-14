import type { Project, Stage, Stats, WorkDept } from "../types";
import { STAGE_DEPTS } from "../types";
import { h, patch } from "./dom";
import { play } from "./sound";
import {
  app,
  deptStatus,
  explorerTx,
  fmtSats,
  fmtTime,
  fmtUsd,
  isDevTx,
  phaseOf,
  provisionalTitle,
  shortTx,
  stageSats,
  type Phase,
} from "./state";
import { EXAMPLES, STAGE_INFO, TEAM, WORK_ORDER } from "./team";
import { avatar, bchMark, extIcon, icon, iconSvg, spinner, statusPill, type AgendaStatus } from "./ui";

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

// ---------- New project ----------

const rateText = () => (app.config?.bchUsd ? ` · 1 BCH ≈ $${Math.round(app.config.bchUsd).toLocaleString("en-US")}` : "");

function stageCard(stage: Stage, lines: string) {
  const info = STAGE_INFO[stage];
  return h(
    "div",
    { class: `stage-card s-${stage}` },
    h("span", { class: "sc-n", "aria-hidden": "true" }, String(info.n)),
    h("div", { class: "sc-m" }, h("div", { class: "sc-title" }, info.title), h("div", { class: "sc-lines" }, lines)),
    h("span", { class: "sc-price", "data-price": stage }, price(stage)),
  );
}

function newProject(act: SideActions) {
  const ta = h("textarea", {
    id: "idea",
    rows: 3,
    maxlength: 2000,
    placeholder: "Describe your business idea…",
    "aria-describedby": "idea-err",
  });
  const err = h("p", { class: "field-err", id: "idea-err", role: "alert" });
  const btnLabel = () => `Validate my idea · ${price("validate")}`;
  const btn = h("button", { type: "submit", class: "btn primary lg block start-btn", "data-price-label": "validate" }, btnLabel());
  const form = h(
    "form",
    { class: "card new-card", "aria-labelledby": "np-title", novalidate: true },
    h("div", { class: "kicker" }, "New project"),
    h("h1", { id: "np-title", class: "np-title" }, "Your startup team, for pennies."),
    h(
      "p",
      { class: "np-lead" },
      "Seven AI specialists validate, plan and launch your idea. Never pay for a bad idea again.",
    ),
    h("label", { class: "sr-only", for: "idea" }, "Your business idea"),
    ta,
    err,
    h(
      "div",
      { class: "examples", role: "group", "aria-label": "Example ideas" },
      h("span", { class: "ex-l" }, "Try"),
      EXAMPLES.map((ex) =>
        h(
          "button",
          {
            type: "button",
            class: "chip ex",
            title: ex,
            onclick: () => {
              ta.value = ex;
              err.textContent = "";
              play("tap");
              ta.focus();
            },
          },
          h("span", null, ex),
        ),
      ),
    ),
    h(
      "div",
      { class: "stages", role: "list", "aria-label": "How it works" },
      stageCard("validate", "Plan, opportunity score, business model"),
      h("div", { class: "decide" }, "Then you decide: continue, or stop and keep the report."),
      stageCard("build", "Name, logo, landing page, 30-day launch, go live"),
    ),
    h(
      "div",
      { class: "start-dock" },
      btn,
      h("p", { class: "foot" }, bchMark(13), "Paid in Bitcoin Cash", h("span", { "data-rate": "" }, rateText())),
    ),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const idea = ta.value.trim();
    if (idea.length < 15) {
      err.textContent = "Tell us a bit more: one sentence on what you sell, and to whom.";
      ta.focus();
      return;
    }
    err.textContent = "";
    btn.disabled = true;
    btn.replaceChildren(spinner(), " Opening the office…");
    try {
      await act.start(idea);
    } catch (x) {
      err.textContent = (x as Error).message;
    } finally {
      btn.disabled = false;
      btn.textContent = btnLabel();
    }
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) form.requestSubmit();
  });
  return form;
}

// ---------- Project ----------

type Row = { key: string; dept: WorkDept | "you"; label: string; status: AgendaStatus; time: string; note?: string; tip?: string };

/** Mia's day plan: the working day she books for the team. The real run takes minutes, not hours. */
const DAY_PLAN: Record<WorkDept | "you", string> = { mia: "09:30", leo: "10:00", sam: "10:20", you: "10:35", nova: "10:40", dex: "11:00", rae: "11:30", pip: "12:00" };

function agendaRows(p: Project, ph: Phase): Row[] {
  const at = (k: WorkDept | "you") => DAY_PLAN[k];
  const rows: Row[] = [];
  const stopped = ph.kind === "stopped";
  const delivered = (s: Stage) => (p.timings[s]?.finished ? ` · stage delivered at ${fmtTime(p.timings[s]!.finished!)}` : "");
  WORK_ORDER.forEach((d) => {
    const s = deptStatus(p, d);
    const isB = STAGE_DEPTS.build.includes(d);
    const status: AgendaStatus = s === "scheduled" ? (stopped && isB ? "skipped" : "scheduled") : s;
    rows.push({
      key: d,
      dept: d,
      label: `${TEAM[d].name} · ${TEAM[d].task}`,
      status,
      time: status === "skipped" ? "—" : at(d),
      note: s === "working" ? "Working now" : s === "error" ? "Needs a retry" : undefined,
      tip: `On Mia's day plan at ${at(d)}${s === "done" ? delivered(isB ? "build" : "validate") : ""}`,
    });
    if (d === "sam") {
      const g: AgendaStatus = p.payments.build ? "done" : ph.kind === "gate" ? "waiting" : stopped ? "stopped" : "scheduled";
      rows.push({
        key: "you",
        dept: "you",
        label: "You · Go / no-go",
        status: g,
        time: at("you"),
        note: g === "waiting" ? "Stage 1 report ready · review it" : stopped ? "You kept the report" : undefined,
      });
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
        ? `Stage ${n} · local test · not paid`
        : h("span", null, `Stage ${n} · `, h("a", { href: explorerTx(pay.txid), target: "_blank", rel: "noopener", class: "tx", "aria-label": `View transaction ${pay.txid} on a block explorer` }, `tx ${shortTx(pay.txid)}`, extIcon())),
      sats: pay.sats,
      right: dev ? "local test · nothing paid" : fmtUsd(pay.cents),
    });
    // Internal flows: how the stage budget moves through the office. Never on-chain, never a txid.
    // In a local test nothing was paid: the amounts are the stage price at today's rate, and say so.
    const budget = stageSats(p, s);
    if (budget <= 0) return;
    const tag = dev ? "≈ at stage price · simulated" : "internal · not on-chain";
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
      h("span", { class: "card-meta" }, `${items.length} ${items.length === 1 ? "entry" : "entries"} · ${realCount} on-chain`),
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
        h("li", null, h("b", null, "You pay the office per stage"), h("small", null, "On-chain · Bitcoin Cash · cents, not dollars")),
        h("li", null, h("b", null, "The lobby hands Mia the stage budget"), h("small", null, "internal · not on-chain")),
        h("li", null, h("b", null, "Mia pays each department as it delivers"), h("small", null, "internal · not on-chain")),
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
  const tile = (k: keyof Stats, l: string) => {
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
      h("div", { class: "agenda-h" }, h("span", { class: "kicker" }, "Today's agenda"), h("span", { class: "card-meta" }, "Scheduled by Mia")),
      h(
        "ol",
        { class: "agenda" },
        rows.map((r) => {
          const clickable =
            r.dept === "you" ? r.status === "waiting" || r.status === "stopped" : r.status === "working" || r.status === "done" || r.status === "error";
          const inner = [
            h("span", { class: "ag-t num" }, r.time),
            avatar(r.dept, "sm"),
            h("span", { class: "ag-m" }, h("b", null, r.label), r.note ? h("small", null, r.note) : null),
            statusPill(r.status),
          ];
          return h(
            "li",
            { class: `ag s-${r.status}`, title: r.tip ?? null },
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
      patch(el, "home", () => [newProject(act), statsCard(app.stats)]);
      // The counters arrive after the form: add them in place, never rebuild the form the user is typing in.
      if (!el.querySelector(".stats")) {
        const c = statsCard(app.stats);
        if (c) el.append(c);
      }
      return;
    }
    const key = JSON.stringify([p.id, p.status, Object.keys(p.results), p.payments, p.timings, p.error, phaseOf(p).kind, app.config?.prices, app.config?.bchUsd ? 1 : 0]);
    patch(el, key, () => projectView(p, act));
  };
  const refreshStats = () => {
    if (!current) return render(null);
    const localRun = Object.values(current.payments).some((x) => x && isDevTx(x.txid));
    const nu = hasStats(app.stats) && !localRun ? statsCard(app.stats) : runCard(current);
    const old = el.querySelector(".stats");
    if (old && nu) old.replaceWith(nu);
    else if (old) old.remove();
    else if (nu) el.querySelector(".ledger")?.before(nu);
  };
  /** New config (prices, BCH rate): update labels in place, never rebuild the form the user is typing in. */
  const refreshConfig = () => {
    el.querySelectorAll<HTMLElement>("[data-price]").forEach((x) => (x.textContent = price(x.dataset.price as Stage)));
    el.querySelectorAll<HTMLElement>("[data-price-label]").forEach((x) => {
      if (!(x as HTMLButtonElement).disabled) x.textContent = `Validate my idea · ${price("validate")}`;
    });
    el.querySelectorAll<HTMLElement>("[data-rate]").forEach((x) => (x.textContent = rateText()));
    if (current) render(current);
  };
  return { el, render, refreshStats, refreshConfig };
}
