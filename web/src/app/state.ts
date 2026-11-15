import type { AppConfig, DeptStatus, Project, Stage, Stats, WorkDept } from "../types";
import { STAGE_DEPTS } from "../types";
import { WORK_ORDER } from "./team";

// ---------- formatting ----------

export const fmtSats = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtBch = (sats: number) => (sats / 1e8).toFixed(8);
export const fmtUsd = (cents: number) => "$" + (cents / 100).toFixed(2);
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
export const shortTx = (txid: string) => (txid.length > 14 ? `${txid.slice(0, 6)}…${txid.slice(-4)}` : txid);
export const shortAddr = (a: string) => {
  const [p, rest = ""] = a.includes(":") ? a.split(":") : ["", a];
  return (p ? p + ":" : "") + (rest.length > 14 ? `${rest.slice(0, 8)}…${rest.slice(-6)}` : rest);
};
export { explorerTx } from "../explorer";
export const isDevTx = (txid: string) => txid.startsWith("dev-");

// ---------- app state ----------

export const app = {
  config: null as AppConfig | null,
  stats: null as Stats | null,
  project: null as Project | null,
};

// ---------- phase derivation ----------

export type Step = 1 | 2 | 3 | 4 | 5;
export type Phase =
  | { kind: "home" }
  | { kind: "unpaid"; stage: Stage } // project created, waiting for a payment
  | { kind: "working"; stage: Stage; dept: WorkDept | null } // dept null = paid, nobody started yet
  | { kind: "gate" }
  | { kind: "stopped" }
  | { kind: "done" }
  | { kind: "error"; stage: Stage; dept: WorkDept | null; message: string };

const stoppedKey = (id: string) => `launchdesk-stopped-${id}`;
export const isStopped = (id: string) => {
  try {
    return localStorage.getItem(stoppedKey(id)) === "1";
  } catch {
    return false;
  }
};
export const setStopped = (id: string, v: boolean) => {
  try {
    v ? localStorage.setItem(stoppedKey(id), "1") : localStorage.removeItem(stoppedKey(id));
  } catch {
    /* storage unavailable */
  }
};

export const deptStatus = (p: Project, d: WorkDept): DeptStatus | "scheduled" =>
  p.status[d] ?? (p.results[d] ? "done" : p.payments[stageOf(d)] ? "queued" : "scheduled");

export const stageOf = (d: WorkDept): Stage => (STAGE_DEPTS.validate.includes(d) ? "validate" : "build");
export const stageDone = (p: Project, s: Stage) => STAGE_DEPTS[s].every((d) => deptStatus(p, d) === "done");

export function phaseOf(p: Project | null): Phase {
  if (!p) return { kind: "home" };
  for (const stage of ["validate", "build"] as Stage[]) {
    if (stage === "build") {
      if (!p.payments.build) return isStopped(p.id) ? { kind: "stopped" } : { kind: "gate" };
    } else if (!p.payments.validate) return { kind: "unpaid", stage };
    if (stageDone(p, stage)) continue;
    const depts = STAGE_DEPTS[stage];
    const err = depts.find((d) => deptStatus(p, d) === "error");
    if (err) return { kind: "error", stage, dept: err, message: p.error || "A department hit a problem." };
    if (p.error) return { kind: "error", stage, dept: null, message: p.error };
    const working = depts.find((d) => deptStatus(p, d) === "working") ?? null;
    return { kind: "working", stage, dept: working };
  }
  return { kind: "done" };
}

export function stepOf(ph: Phase): Step {
  switch (ph.kind) {
    case "home":
      return 1;
    case "unpaid":
      return ph.stage === "validate" ? 1 : 4;
    case "working":
    case "error":
      // Once Stage 1 is paid the user is validating, even while Mia writes the plan.
      return ph.stage === "validate" ? 2 : 4;
    case "gate":
    case "stopped":
      return 3;
    case "done":
      return 5;
  }
}

/** A department the founder skipped after a snag: stored as done with a placeholder, but nothing was made. */
export const isSkipped = (p: Project, d: WorkDept) => p.models?.[d] === "skipped";
export const readyCount = (p: Project | null) => (p ? WORK_ORDER.filter((d) => deptStatus(p, d) === "done" && !isSkipped(p, d)).length : 0);

/** True while the server is (or should be) doing work for a paid stage. */
export const needsPolling = (ph: Phase) => ph.kind === "working";

/** A short title while Mia works: first 6 words, no leading article, sentence case. */
export function provisionalTitle(idea: string) {
  const all = idea.replace(/\s+/g, " ").trim().replace(/^(a|an|the)\s+/i, "").split(" ");
  // Short enough for the side column: up to ~30 characters, never ending on a filler word.
  const words: string[] = [];
  for (const w of all.slice(0, 6)) {
    if (words.length && (words.join(" ") + " " + w).length > 30) break;
    words.push(w.replace(/[,.;:!?]+$/, ""));
    if (/[,.;:!?]$/.test(w)) break;
  }
  while (words.length > 1 && /^(for|in|at|of|to|with|and|or|on|by|from|that|which|a|an|the)$/i.test(words[words.length - 1])) words.pop();
  const t = words.join(" ").replace(/[,.;:!?-]+$/, "");
  return t ? t[0].toUpperCase() + t.slice(1) : "Your project";
}

/**
 * Sats for the internal department flows. Real payments use the paid amount; a local test (0 sats)
 * uses the stage price at the live BCH rate, so the office still shows how money would move.
 */
export function stageSats(p: Project, s: Stage): number {
  const pay = p.payments[s];
  if (!pay) return 0;
  if (pay.sats > 0) return pay.sats;
  const usd = app.config?.bchUsd ?? 0;
  return usd > 0 ? Math.ceil((pay.cents / 100 / usd) * 1e8) : 0;
}
