import type { DeptId, LeoOpportunity } from "../types";
import { BCH_BADGE } from "../site/qr";
import { h, svg } from "./dom";
import { TEAM } from "./team";

// Line icons on a 24×24 grid, drawn at 1.5 px (SF-Symbols-like). Identity comes from these, never from colour.
const P: Record<string, string> = {
  // departments
  lobby: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9.5 20v-6h5v6"/><path d="M3 20h18"/>',
  mia: '<rect x="5" y="4.5" width="14" height="16" rx="2.5"/><path d="M9 4.5V3.5h6v1"/><path d="M8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
  leo: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/><path d="M8 12l2-2.5 2 1.5 1.5-2"/>',
  sam: '<path d="M4 20h16"/><path d="M6.5 16.5v-4M11 16.5V8M15.5 16.5v-6M20 16.5V5"/>',
  nova: '<path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z"/><path d="M18 16.5c.25 1.2.8 1.75 2 2-1.2.25-1.75.8-2 2-.25-1.2-.8-1.75-2-2 1.2-.25 1.75-.8 2-2z"/>',
  dex: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M13.5 7l3 3"/>',
  rae: '<path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
  pip: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.3 5.2 3.3 8.5s-1 6.1-3.3 8.5c-2.3-2.4-3.3-5.2-3.3-8.5s1-6.1 3.3-8.5z"/>',
  you: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
  // ui
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  ext: '<path d="M8 16 16 8M9.5 8H16v6.5"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  minus: '<path d="M5.5 12h13"/>',
  chevronDown: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
  chevronUp: '<path d="m6.5 14.5 5.5-5.5 5.5 5.5"/>',
  fit: '<path d="M4.5 9V4.5H9M19.5 9V4.5H15M4.5 15v4.5H9M19.5 15v4.5H15"/>',
  arrowRight: '<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5"/>',
  wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17v3.5"/><path d="M4 7.5V17a2 2 0 0 0 2 2h14V8.5H6.5A2.5 2.5 0 0 1 4 7.5z"/><circle cx="16" cy="13.75" r="1"/>',
  soundOn: '<path d="M11 5 6.5 9H3.5v6h3L11 19z"/><path d="M15 9a4.5 4.5 0 0 1 0 6M17.8 6.5a8 8 0 0 1 0 11"/>',
  soundOff: '<path d="M11 5 6.5 9H3.5v6h3L11 19z"/><path d="m15.5 9.5 5 5M20.5 9.5l-5 5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5"/><path d="M12 16.2h.01"/>',
  transfer: '<path d="M5 9h13M14.5 5.5 18 9l-3.5 3.5M19 15H6M9.5 11.5 6 15l3.5 3.5"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  // v4 action + status icons (D8: actions and status only, never people)
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 8.5V6.2a1.7 1.7 0 0 0-1.7-1.7H6.2a1.7 1.7 0 0 0-1.7 1.7v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3"/>',
  download: '<path d="M12 4.5v10.5M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  share: '<path d="M12 15V4.5M8 8.5l4-4 4 4"/><path d="M7.5 11.5H6.2a1.7 1.7 0 0 0-1.7 1.7v5.1a1.7 1.7 0 0 0 1.7 1.7h11.6a1.7 1.7 0 0 0 1.7-1.7v-5.1a1.7 1.7 0 0 0-1.7-1.7h-1.3"/>',
  more: '<circle cx="6" cy="12" r=".9" fill="currentColor"/><circle cx="12" cy="12" r=".9" fill="currentColor"/><circle cx="18" cy="12" r=".9" fill="currentColor"/>',
  menu: '<path d="M4.5 8h15M4.5 16h15"/>',
  chevronRight: '<path d="m9.5 6.5 5.5 5.5-5.5 5.5"/>',
  arrowUp: '<path d="M12 19V5.5M6.5 11 12 5.5 17.5 11"/>',
  warn: '<path d="M10.3 4.6 3.2 17.2A2 2 0 0 0 5 20.2h14a2 2 0 0 0 1.8-3L13.7 4.6a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.5"/><path d="M12 17.1h.01"/>',
  shield: '<path d="M12 3.5 5 6.2v5.3c0 4.3 3 7.7 7 9 4-1.3 7-4.7 7-9V6.2z"/><path d="m8.8 12.2 2.2 2.2 4.2-4.4"/>',
  bars: '<path d="M5 19.5v-6M10 19.5v-10M15 19.5v-7.5M20 19.5V5"/>',
  vote: '<path d="M5 13.5h14v6H5z"/><path d="m8.5 9.5 2.5 2.5 5-5.5"/>',
  doc: '<path d="M6.5 3.5h7.5l4 4v13h-11.5z"/><path d="M13.5 3.5v4.5h4.5M9.5 12.5h5M9.5 16h5"/>',
};

export type IconName = keyof typeof P | DeptId;

/** Inline SVG line icon. Inherits `currentColor`. */
export function iconSvg(name: string, size = 16, stroke = 1.5) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ""}</svg>`;
}
export const icon = (name: string, size = 16, cls = "ico") => h("span", { class: cls, "aria-hidden": "true", html: iconSvg(name, size) });

/** The Bitcoin Cash mark: a green disc with a white B. Money only. */
export const BCH_SVG = (size = 16) => `<svg class="bch-mark" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">${BCH_BADGE}</svg>`;
export const bchMark = (size = 16) => h("span", { class: "bch-ico", "aria-hidden": "true", html: BCH_SVG(size) });

/** D5 department colours (fallbacks until styles.css defines --d-*). Only for dot, avatar tint, working ring, split bar. */
export const DEPT_COLOR: Record<DeptId, string> = {
  mia: "#8B7CF6", leo: "#3B82F6", sam: "#F59E0B", nova: "#EC4899", dex: "#F97362", rae: "#14B8A6", pip: "#94A3B8", lobby: "#0AC18E",
};
export type AvatarSize = 28 | 32 | 40 | 56;

const LEGACY_SIZE = { sm: 24, md: 28, lg: 36 } as const;

/**
 * D9 avatar (owner WS1, signature frozen): monogram circle, 600 weight at 45% of size, dept tint
 * (12% fill + letter in the dept colour darkened with black), optional 2px working ring that breathes
 * (styles.css `.avatar`). People are never icons (D8): the legacy sizes "sm" | "md" | "lg" now render the
 * same monogram at 24 / 28 / 36 px so v3 layouts keep their spacing.
 */
export function avatar(id: DeptId | "you", size: AvatarSize | "sm" | "md" | "lg" = "sm", opts: { working?: boolean } = {}): HTMLElement {
  const name = id === "you" ? "You" : TEAM[id].name;
  const px = typeof size === "string" ? LEGACY_SIZE[size] : size;
  const c = id === "you" ? "var(--ink-2)" : `var(--d-${id}, ${DEPT_COLOR[id]})`;
  return h(
    "span",
    {
      class: `avatar${typeof size === "string" ? ` av-${size}` : ""}${opts.working ? " is-working" : ""}`,
      "aria-hidden": "true",
      title: name,
      "data-dept": id,
      style: `--av:${px}px;--c:${c}`,
    },
    name.charAt(0).toUpperCase(),
  );
}

/** Overlapping avatar group (L8): 28px, −6px overlap, white separation ring. */
export const avatarGroup = (ids: Array<DeptId | "you">, size: AvatarSize = 28) =>
  h("span", { class: "avatar-group", "aria-hidden": "true" }, ids.map((id) => avatar(id, size)));

const VERDICT: Record<LeoOpportunity["verdict"], { label: string; cls: string }> = {
  go: { label: "Go", cls: "go" },
  pivot: { label: "Pivot", cls: "pivot" },
  "no-go": { label: "No-go", cls: "nogo" },
};
export const verdictPill = (v: LeoOpportunity["verdict"]) => h("span", { class: `verdict ${VERDICT[v].cls}` }, VERDICT[v].label);

/** Green only for a strong score; everything else stays ink. */
export const scoreColor = (score: number) => (score >= 7 ? "var(--bch)" : "var(--ink)");

export function ring(score: number, size = 104, label = "Opportunity score") {
  const r = 44;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(10, score));
  const el = h(
    "div",
    { class: "ring", style: `width:${size}px;height:${size}px`, role: "img", "aria-label": `${label}: ${v.toFixed(1)} out of 10` },
    svg(
      `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--fill)" stroke-width="6"/><circle class="ring-val" cx="50" cy="50" r="${r}" fill="none" stroke="${scoreColor(v)}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v / 10)}" transform="rotate(-90 50 50)"/></svg>`,
    ),
    h("div", { class: "ring-num" }, h("b", null, v.toFixed(1)), h("small", null, "of 10")),
  );
  return el;
}

export type AgendaStatus = "done" | "working" | "queued" | "scheduled" | "waiting" | "error" | "stopped" | "skipped";
const STATUS_LABEL: Record<AgendaStatus, string> = {
  done: "Done",
  working: "Working",
  queued: "Queued",
  scheduled: "Scheduled",
  waiting: "Your turn",
  error: "Needs retry",
  stopped: "Stopped",
  skipped: "Not booked",
};
/** Status: grey dot (queued), blue pulsing dot (working), green check (done), red dot (error). */
export const statusPill = (s: AgendaStatus) =>
  h(
    "span",
    { class: `spill s-${s}` },
    s === "done" ? h("span", { class: "s-check", "aria-hidden": "true", html: iconSvg("check", 13, 2) }) : h("span", { class: "s-dot", "aria-hidden": "true" }),
    STATUS_LABEL[s],
  );

export const spinner = () => h("span", { class: "spinner", "aria-hidden": "true" });

export const extIcon = () => h("span", { class: "ext", "aria-hidden": "true", html: iconSvg("ext", 13, 1.6) });
