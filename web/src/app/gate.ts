import type { Project } from "../types";
import { STAGE_DEPTS } from "../types";
import { h } from "./dom";
import { closeButton, openModal } from "./modal";
import { play } from "./sound";
import { app, fmtUsd } from "./state";
import { TEAM } from "./team";
import { avatar, ring, verdictPill } from "./ui";

export type GateChoice = "approve" | "stop" | null;

/** Stage 1 report + go/no-go decision (screenshot 06). */
export function openGate(p: Project): Promise<GateChoice> {
  const leo = p.results.leo;
  const sam = p.results.sam;
  const t = p.timings.validate;
  const secs = t?.started && t.finished ? Math.max(1, Math.round((t.finished - t.started) / 1000)) : null;
  const paid = p.payments.validate;
  const buildCents = app.config?.prices.build ?? 20;
  const noGo = leo?.verdict === "no-go";
  let choice: GateChoice = null;

  const m = openModal({ label: "Stage 1 report and go / no-go decision", className: "gate-modal" });
  play("open");
  const pick = (c: GateChoice) => {
    choice = c;
    m.close();
  };

  const kpi = (label: string, by: string, value: string, note: string) =>
    h("div", { class: "kpi" }, h("div", { class: "kpi-l" }, label, h("span", { class: "muted" }, ` · ${by}`)), h("div", { class: "kpi-v" }, value), h("div", { class: "kpi-n" }, note));

  const meta = h(
    "div",
    { class: "gate-meta" },
    h("span", { class: "kicker bch" }, "Stage 1 report"),
    secs ? h("span", { class: "gm-t" }, `ready in ${secs}s`) : null,
    paid ? (paid.sats > 0 ? h("span", { class: "gm-t" }, `paid ${fmtUsd(paid.cents)}`) : h("span", { class: "demo-pill" }, "local test")) : null,
  );

  const approveBtn = h(
    "button",
    { type: "button", class: `btn lg ${noGo ? "ghost" : "primary"}`, onclick: () => pick("approve"), "data-autofocus": noGo ? null : "" },
    `Approve & pay ${fmtUsd(buildCents)}`,
  );
  const stopBtn = h(
    "button",
    { type: "button", class: `btn lg ${noGo ? "primary" : "ghost"}`, onclick: () => pick("stop"), "data-autofocus": noGo ? "" : null },
    "Stop here · keep the report",
  );

  m.body.append(
    h("div", { class: "gate-bar", "aria-hidden": "true" }),
    h("div", { class: "modal-head" }, meta, closeButton(m.close, "Decide later")),
    h(
      "div",
      { class: "modal-body gate-body" },
      leo
        ? h(
            "div",
            { class: "gate-hero" },
            ring(leo.score, innerWidth < 640 ? 64 : 104),
            h(
              "div",
              null,
              h("div", { class: "kicker" }, "Opportunity · Leo"),
              h("h2", { class: "gate-headline" }, verdictPill(leo.verdict), " ", leo.headline),
              h("p", { class: "muted" }, leo.summary),
            ),
          )
        : null,
      sam
        ? h(
            "div",
            { class: "kpis" },
            kpi("Price", "Sam", sam.price.value, sam.price.note),
            kpi("Start-up cost", "Sam", sam.startup_cost.value, sam.startup_cost.note),
            kpi("Break-even", "Sam", `Month ${sam.break_even.month}`, sam.break_even.note),
          )
        : null,
      sam?.main_risk ? h("div", { class: "risk" }, h("b", null, "Main risk"), h("span", null, sam.main_risk)) : null,
      h("h3", { class: "gate-q" }, noGo ? "Leo says no-go. Keep your money?" : `Continue to Build & Launch for ${fmtUsd(buildCents)}?`),
      h(
        "div",
        { class: "gate-depts" },
        STAGE_DEPTS.build.map((d) =>
          h("div", { class: "gate-dept" }, avatar(d, "md"), h("div", null, h("b", null, `${TEAM[d].name} · ${TEAM[d].task}`), h("small", null, TEAM[d].delivers))),
        ),
      ),
    ),
    // Sticky: on a phone the decision must stay on screen however long the report is.
    h("div", { class: "modal-foot gate-actions" }, noGo ? [stopBtn, approveBtn] : [approveBtn, stopBtn]),
  );
  return m.closed.then(() => choice);
}
