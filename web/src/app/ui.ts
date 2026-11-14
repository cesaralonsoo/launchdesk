import type { DeptId, LeoOpportunity } from "../types";
import { h, svg } from "./dom";
import { TEAM } from "./team";

export const avatar = (id: DeptId, size: "sm" | "md" | "lg" = "sm") =>
  h("span", { class: `av av-${size}`, style: `--c:${TEAM[id].color}`, "aria-hidden": "true" }, TEAM[id].name[0]);

export const dot = (id: DeptId) => h("span", { class: "dot", style: `--c:${TEAM[id].color}`, "aria-hidden": "true" });

const VERDICT: Record<LeoOpportunity["verdict"], { label: string; cls: string }> = {
  go: { label: "GO", cls: "go" },
  pivot: { label: "PIVOT", cls: "pivot" },
  "no-go": { label: "NO-GO", cls: "nogo" },
};
export const verdictPill = (v: LeoOpportunity["verdict"]) => h("span", { class: `verdict ${VERDICT[v].cls}` }, VERDICT[v].label);

export const scoreColor = (score: number) => (score >= 7 ? "var(--bch)" : score >= 5 ? "var(--gold)" : "var(--danger)");

export function ring(score: number, size = 104, label = "Opportunity score") {
  const r = 42;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(10, score));
  const el = h(
    "div",
    { class: "ring", style: `width:${size}px;height:${size}px`, role: "img", "aria-label": `${label}: ${v.toFixed(1)} out of 10` },
    svg(
      `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--line)" stroke-width="8"/><circle class="ring-val" cx="50" cy="50" r="${r}" fill="none" stroke="${scoreColor(v)}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v / 10)}" transform="rotate(-90 50 50)"/></svg>`,
    ),
    h("div", { class: "ring-num" }, h("b", null, v.toFixed(1)), h("small", null, "/10")),
  );
  return el;
}

export type AgendaStatus = "done" | "working" | "queued" | "scheduled" | "waiting" | "error" | "stopped" | "skipped";
const STATUS_LABEL: Record<AgendaStatus, string> = {
  done: "Done",
  working: "Working",
  queued: "Queued",
  scheduled: "Scheduled",
  waiting: "Waiting for you",
  error: "Needs retry",
  stopped: "Stopped",
  skipped: "Not booked",
};
export const statusPill = (s: AgendaStatus) =>
  h("span", { class: `spill s-${s}` }, s === "working" ? h("span", { class: "pulse", "aria-hidden": "true" }) : null, STATUS_LABEL[s]);

export const spinner = () => h("span", { class: "spinner", "aria-hidden": "true" });

export const extIcon = () => h("span", { class: "ext", "aria-hidden": "true" }, "↗");
