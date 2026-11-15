// Decide (spec-v4 L33–L35, M9, F2 link). Owner: WS3. Signature frozen (contracts-v4.md).
import "./money.css";
import { api } from "../api";
import type { LeoOpportunity, Project } from "../types";
import { normalize } from "../types";
import { h, svg } from "./dom";
import { closeButton, openModal, toast } from "./modal";
import { countUp, DUR, EASE, reduced } from "./motion";
import { play } from "./sound";
import { app, fmtUsd, isDevTx } from "./state";
import { iconSvg } from "./ui";

/**
 * approve = "Build it · $0.20" (or "Build anyway"); stop = "Stop here, keep the report";
 * pivot = "Validate the pivot · $0.10" (caller starts a new project prefilled with leo.pivot.idea); null = dismissed.
 */
export type GateChoice = "approve" | "stop" | "pivot" | null;

const TITLE: Record<LeoOpportunity["verdict"], string> = { go: "Leo says go.", pivot: "Leo says pivot first.", "no-go": "Leo says no-go." };
const SEVERITY = { high: 0, med: 1, low: 2 } as const;

/** Opens a pack section on top of the gate (the pack is a full-screen layer above modals). */
async function openInPack(p: Project, section: "summary" | "brand", opts: { readOnly?: boolean; banner?: "example" | null } = {}) {
  try {
    const pack = await import("../pack");
    pack.openPack(p, { section, ...opts });
  } catch {
    toast("Couldn't open the report. Please try again.", "err");
  }
}

/** 72px score ring, 6px stroke; the number counts up with the stroke (M9: one 900ms timeline). */
function scoreRing(score: number, animate: boolean) {
  const size = 72;
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(10, score));
  const color = v >= 7 ? "var(--bch)" : "var(--ink)";
  const art = svg(
    `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--fill)" stroke-width="6"/><circle class="lg-ring-v" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v / 10)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`,
  );
  const num = h("b", { class: "lg-ring-n num" }, v.toFixed(1));
  const el = h("div", { class: "lg-ring", role: "img", "aria-label": `Market score ${v.toFixed(1)} out of 10` }, art, num);
  if (animate) {
    const arc = art.querySelector<SVGCircleElement>(".lg-ring-v")!;
    arc.animate([{ strokeDashoffset: c }, { strokeDashoffset: c * (1 - v / 10) }], { duration: 900, easing: EASE.out, fill: "backwards" });
    void countUp(num, v, { ms: 900, decimals: 1 });
  }
  return el;
}

/** L34: locked previews of Stage 2, built locally from Stage 1 data (no AI, nothing invented). */
function previews(p: Project) {
  const title = (p.results.mia?.title ?? p.idea).split(/\s+/).slice(0, 2).join(" ");
  const headline = p.results.mia?.one_liner ?? p.results.leo?.headline ?? p.idea;
  const lock = () => h("span", { class: "lg-lock", "aria-hidden": "true", html: iconSvg("lock", 14, 1.6) });
  const item = (cls: string, caption: string, ...art: Array<Node | string>) =>
    h("figure", { class: `lg-prev ${cls}` }, h("div", { class: "lg-prev-art" }, h("div", { class: "lg-blur", "aria-hidden": "true" }, ...art), lock()), h("figcaption", null, caption));
  const cal = h("div", { class: "lg-cal" });
  for (let i = 0; i < 30; i++) cal.append(h("i", { class: [3, 8, 11, 16, 22, 27].includes(i) ? "on" : "" }));
  return h(
    "div",
    { class: "lg-prevs" },
    item("is-names", "3 names", h("span", { class: "w1" }, title), h("span", { class: "w2" }, title), h("span", { class: "w3" }, title)),
    item("is-logos", "3 logos", h("i"), h("i"), h("i")),
    item("is-page", "Live page with BCH pre\u2011orders", h("div", { class: "lg-phone" }, h("b", null, headline), h("span", { class: "lg-phone-cta" }))),
    item("is-cal", "30-day launch plan", cal),
  );
}

/** Stage 1 report + go/no-go decision. Owner: WS3. Signature frozen (contracts-v4.md). */
export function openGate(p: Project): Promise<GateChoice> {
  const { leo, sam, mia } = p.results;
  const verdict = leo?.verdict ?? "go";
  const noGo = verdict === "no-go";
  const pivot = verdict === "pivot";
  const buildCents = app.config?.prices.build ?? 20;
  const validateCents = app.config?.prices.validate ?? 10;
  const animate = !reduced();
  let choice: GateChoice = null;

  const m = openModal({ label: "Your report. Build it?", className: "ld-gate" });
  play("open");
  const pick = (c: GateChoice) => {
    choice = c;
    m.close();
  };

  // ---- meta: real wall clock, paid_at → last result ----
  const paid = p.payments.validate;
  const t = p.timings.validate;
  const secs = paid && t?.finished ? Math.max(1, Math.round((t.finished - paid.at) / 1000)) : null;
  const how = !paid ? null : isDevTx(paid.txid) ? (app.config?.mockAi || p.example ? "sample run" : "local test") : `paid ${fmtUsd(paid.cents)}`;
  const meta = secs && how ? `Validated in ${secs} s · ${how}` : how ? `Validated · ${how}` : "";

  // ---- report ----
  const ringEl = leo ? scoreRing(leo.score, animate) : null;
  const titleEl = h("h2", { class: "lg-title" }, TITLE[verdict]);
  const headEl = h("p", { class: "lg-headline" }, leo?.headline ?? mia?.one_liner ?? "");

  const kpis = sam
    ? h(
        "div",
        { class: "lg-kpis" },
        [
          ["Price", sam.price.display, "Estimate"],
          ["Cash needed", sam.cash_needed.display, sam.cash_needed.month > 0 ? `Lowest in month ${sam.cash_needed.month}` : "Before opening"],
          ["Break-even", sam.break_even.month ? `Month ${sam.break_even.month}` : "Not in year 1", sam.breakeven_units_per_day > 0 ? (sam.breakeven_units_per_day >= 1 ? `${Math.round(sam.breakeven_units_per_day)} sales a day` : `About ${Math.max(1, Math.round(sam.breakeven_units_per_day * 7))} sales a week`) : "Estimate"],
        ].map(([l, v, s]) => h("div", { class: "lg-kpi" }, h("span", { class: "lg-kpi-l" }, l), h("b", { class: "lg-kpi-v num" }, v), h("span", { class: "lg-kpi-s" }, s))),
      )
    : null;

  const risk = leo?.risks?.length ? [...leo.risks].sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity])[0] : null;
  const riskText = risk?.risk ?? sam?.main_risk ?? "";
  const riskEl = riskText
    ? h(
        "p",
        { class: "lg-risk" },
        h("span", { class: "lg-risk-i", "aria-hidden": "true", html: iconSvg("warn", 16, 1.6) }),
        h("span", null, riskText.replace(/\.?\s*$/, "."), risk?.mitigation ? [" ", h("b", null, "Cheapest test:"), " ", risk.mitigation.replace(/\.?\s*$/, ".")] : null),
      )
    : null;

  const readFull = h("button", { type: "button", class: "lg-link", onclick: () => void openInPack(p, "summary") }, "Read the full report →");

  const report = h(
    "section",
    { class: "lg-report", "aria-label": "Your report" },
    h("div", { class: "lg-top" }, h("span", { class: "lg-kicker" }, "Your report"), meta ? h("span", { class: "lg-meta num" }, meta) : null),
    h("div", { class: "lg-hero" }, ringEl, h("div", { class: "lg-hero-t" }, titleEl, headEl)),
    kpis,
    riskEl,
    readFull,
  );

  // ---- what $0.20 buys ----
  const prevs = previews(p);
  const example = h(
    "button",
    {
      type: "button",
      class: "lg-link lg-link-sm",
      onclick: async () => {
        try {
          void openInPack(normalize(await api.get("example")), "brand", { readOnly: true, banner: "example" });
        } catch {
          toast("The example pack isn't available on this server.", "err");
        }
      },
    },
    "See what Build delivers →",
  );
  const upsell = h(
    "section",
    { class: "lg-build", "aria-label": `For ${fmtUsd(buildCents)} you also get` },
    h("h3", { class: "lg-h3" }, `For ${fmtUsd(buildCents)} you also get`),
    prevs,
    example,
  );

  // ---- footer (L35) ----
  const build = `Build it · ${fmtUsd(buildCents)}`;
  const primaryBtn = noGo
    ? h("button", { type: "button", class: "btn primary lg lg-cta", onclick: () => pick("stop"), "data-autofocus": "" }, "Stop here")
    : h("button", { type: "button", class: "btn primary lg lg-cta", onclick: () => pick("approve"), "data-autofocus": "" }, build);
  const mkTertiary = () =>
    noGo
      ? h("button", { type: "button", class: "lg-link", onclick: () => pick("approve") }, `Build anyway · ${fmtUsd(buildCents)}`)
      : h("button", { type: "button", class: "lg-link", onclick: () => pick("stop") }, "Stop here, keep the report");
  const tertiary = mkTertiary();
  // A sample-data demo server only runs the 3 sample ideas, so a pivot (free text) can't start there.
  const demoOnly = !!app.config?.mockAi && !app.config?.devSkipPayment;
  const mkPivot = () =>
    pivot && leo?.pivot?.idea && !demoOnly
      ? h("button", { type: "button", class: "btn lg lg-pivot", onclick: () => pick("pivot"), title: leo.pivot.idea }, `Validate the pivot · ${fmtUsd(validateCents)}`)
      : null;
  const pivotBtn = mkPivot();
  // Phones: only the primary stays in the sticky footer; the other choices sit under the previews.
  const altChoices = h("div", { class: "lg-alt" }, mkPivot(), mkTertiary());

  const foot = h(
    "div",
    { class: "lg-foot" },
    h("div", { class: "lg-foot-row" }, tertiary, h("div", { class: "lg-foot-r" }, pivotBtn, primaryBtn)),
    h("p", { class: "lg-keep" }, "You keep everything from Stage 1 either way."),
  );

  m.body.append(h("div", { class: "lg-x" }, closeButton(m.close, "Decide later")), h("div", { class: "lg-body" }, report, h("hr", { class: "lg-rule" }), upsell, altChoices), foot);

  // ---- M9 entry: one timeline, footer never animates ----
  if (animate) {
    const rise = (el: Element | null, delay: number) =>
      el?.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: DUR.d3, delay, easing: EASE.out, fill: "backwards" });
    rise(titleEl, 120);
    rise(headEl, 160);
    kpis?.querySelectorAll(".lg-kpi").forEach((k, i) => rise(k, 220 + i * 60));
    rise(riskEl, 400);
    rise(readFull, 420);
    prevs.querySelectorAll(".lg-prev").forEach((k, i) => rise(k, 480 + i * 50));
    if (!noGo) {
      // One "ready" cue on the primary: a 1px focus ring fades in and out once, at 1.2 s.
      primaryBtn.animate(
        [{ boxShadow: "0 0 0 1px rgba(0,113,227,0)" }, { boxShadow: "0 0 0 1px rgba(0,113,227,1)", offset: 0.5 }, { boxShadow: "0 0 0 1px rgba(0,113,227,0)" }],
        { duration: 1200, delay: 1200, easing: "ease-in-out" },
      );
    }
  }

  return m.closed.then(() => choice);
}
