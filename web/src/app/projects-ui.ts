// "My projects" UI (F4, L11): project rows, the header popover and in-app navigation. Owner: WS1.
// Storage lives in projects.ts (frozen API). Rows are cards because they are independently clickable (D1).
import { h } from "./dom";
import { closeButton, openSheet, type ModalHandle } from "./modal";
import { list, shortTitle, type SavedProject } from "./projects";
import { play } from "./sound";
import { iconSvg } from "./ui";

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** "Validated · 2 Nov", "Live · /s/pausa". One middot per line (D7). */
export function projectStatus(r: SavedProject): string {
  const day = fmtDay(r.updatedAt || r.createdAt);
  switch (r.stage) {
    case "live":
      return r.slug ? `Live · /s/${r.slug}` : `Live · ${day}`;
    case "building":
      return `Building · ${day}`;
    case "validated":
      return `Validated · ${day}`;
    case "validating":
      return `Validating · ${day}`;
    default:
      return `Draft · ${day}`;
  }
}

/** 32px score ring (Leo's score) or a grey dot when there is no score yet. */
export function scoreMark(score: number | null, size = 32): HTMLElement {
  // Drafts get a neutral outline circle (not a grey "disabled" dot).
  if (score == null) return h("span", { class: "pr-draft", style: `width:${size}px;height:${size}px`, "aria-hidden": "true" });
  const r = 13;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(10, score));
  return h("span", {
    class: "pr-ring",
    style: `width:${size}px;height:${size}px`,
    "aria-hidden": "true",
    html: `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="${r}" fill="none" stroke="var(--fill)" stroke-width="2.5"/><circle cx="16" cy="16" r="${r}" fill="none" stroke="${v >= 7 ? "var(--bch)" : "var(--ink)"}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - v / 10)).toFixed(2)}" transform="rotate(-90 16 16)"/><text x="16" y="20" text-anchor="middle">${v.toFixed(1)}</text></svg>`,
  });
}

/** Opens a project inside the app (the shell routes on popstate). */
export function goToProject(id: string) {
  const path = `/p/${encodeURIComponent(id)}`;
  if (location.pathname !== path) history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

export function projectRow(r: SavedProject, onOpen?: () => void): HTMLElement {
  return h(
    "a",
    {
      class: "pr-row",
      href: `/p/${encodeURIComponent(r.id)}`,
      onclick: (ev: Event) => {
        const e = ev as MouseEvent;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        play("tap");
        onOpen?.();
        goToProject(r.id);
      },
    },
    scoreMark(r.score),
    h("span", { class: "pr-m" }, h("b", null, r.title ? (r.stage === "new" || r.stage === "validating" || r.title.length > 48 ? shortTitle(r.title) : r.title) : "Untitled project"), h("small", null, projectStatus(r))),
    h("span", { class: "pr-chev", "aria-hidden": "true", html: iconSvg("chevronRight", 16, 1.6) }),
  );
}

let open: ModalHandle | null = null;

/** The "My projects" popover (desktop, under `anchor`) or bottom sheet (phones). */
export function openMyProjects(anchor: HTMLElement | null) {
  open?.close();
  const rows = list();
  const m = openSheet({ label: "My projects", className: "projects-sheet", anchor, width: 360, onClose: () => (open = null) });
  open = m;
  m.body.append(
    h("div", { class: "modal-head ps-head" }, h("h2", { class: "modal-title" }, "My projects"), closeButton(m.close)),
    h(
      "div",
      { class: "ps-body" },
      rows.length
        ? h("div", { class: "pr-list" }, rows.map((r) => projectRow(r, m.close)))
        : h("p", { class: "ps-empty" }, "Projects you start in this browser show up here."),
      h("p", { class: "ps-foot" }, "Saved in this browser only. No account needed."),
    ),
  );
  return m;
}
