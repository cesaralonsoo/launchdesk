// Dialogs, sheets, popovers and toasts (M10, F8). Owner: WS1.
// Desktop: scale .98→1 + fade (300ms spring-soft), exit →.98 + fade 180ms ease-in, backdrop blur 0→12px.
// Phones (≤640px): bottom sheet, translateY(100%)→0 380ms ease-sheet, exit 260ms ease-in, 36×5 grabber.
// Every dialog: focus trap, Esc, focus returned to the opener. Locked dialogs nudge 4px on a dismiss attempt.
import { h } from "./dom";
import { EASE, reduced } from "./motion";

export type ModalHandle = {
  el: HTMLElement;
  body: HTMLElement;
  close: () => void;
  closed: Promise<void>;
  /** While locked, Esc / backdrop / × do nothing (e.g. a payment is being checked). */
  lock: (locked: boolean) => void;
};

export type ModalOpts = { label: string; className?: string; onClose?: () => void; dismissable?: boolean };
export type SheetOpts = ModalOpts & {
  /** Desktop: open as a popover under this element (360px wide by default). Phones always get a bottom sheet. */
  anchor?: HTMLElement | null;
  /** Popover width on desktop, px. */
  width?: number;
};

let stack: ModalHandle[] = [];
const phone = () => matchMedia("(max-width: 640px)").matches;
const FOCUSABLE = "a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])";

function build(opts: SheetOpts, kind: "modal" | "sheet"): ModalHandle {
  const prevFocus = document.activeElement as HTMLElement | null;
  const pop = kind === "sheet" && !!opts.anchor && !phone();
  const body = h("div", {
    class: `modal${kind === "sheet" ? " is-sheet" : ""}${pop ? " is-pop" : ""} ${opts.className ?? ""}`,
    role: "dialog",
    "aria-modal": "true",
    "aria-label": opts.label,
    tabindex: "-1",
  });
  const back = h("div", { class: `modal-back${pop ? " is-pop" : ""}` }, body);
  if (pop && opts.anchor) {
    const r = opts.anchor.getBoundingClientRect();
    const w = opts.width ?? 360;
    body.style.width = `${w}px`;
    body.style.top = `${Math.round(r.bottom + 8)}px`;
    body.style.left = `${Math.round(Math.max(16, Math.min(innerWidth - w - 16, r.right - w)))}px`;
  }
  let done!: () => void;
  const closed = new Promise<void>((r) => (done = r));
  let isClosed = false;
  let dismissable = opts.dismissable !== false;
  let locked = false;

  const nudge = () => {
    if (reduced()) return;
    body.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(4px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(0)" }],
      { duration: 200, easing: EASE.out },
    );
  };
  const tryDismiss = () => {
    if (dismissable) close();
    else if (locked) nudge();
  };
  const close = () => {
    if (isClosed) return;
    isClosed = true;
    document.removeEventListener("keydown", onKey, true);
    back.classList.add("leaving");
    const ms = reduced() ? 150 : phone() && !pop ? 260 : 180;
    setTimeout(() => back.remove(), ms + 20);
    stack = stack.filter((m) => m !== handle);
    opts.onClose?.();
    prevFocus?.focus?.({ preventScroll: true });
    done();
  };
  const onKey = (e: KeyboardEvent) => {
    if (stack[stack.length - 1] !== handle) return;
    if (e.key === "Escape") {
      e.preventDefault();
      tryDismiss();
    } else if (e.key === "Tab") {
      const f = [...body.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (!f.length) {
        e.preventDefault();
        body.focus();
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      if (!body.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (document.activeElement === first || document.activeElement === body)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  back.addEventListener("mousedown", (e) => {
    if (e.target === back) tryDismiss();
  });
  // × buttons made with closeButton() call close() directly: route them through the lock as well.
  body.addEventListener(
    "click",
    (e) => {
      const x = (e.target as Element).closest?.(".modal-x");
      if (x && body.contains(x) && locked) {
        e.stopImmediatePropagation();
        e.preventDefault();
        nudge();
      }
    },
    true,
  );
  document.addEventListener("keydown", onKey, true);
  document.body.append(back);
  const lock = (on: boolean) => {
    locked = on;
    dismissable = !on && opts.dismissable !== false;
    body.classList.toggle("is-locked", on);
  };
  const handle: ModalHandle = { el: back, body, close, closed, lock };
  stack.push(handle);
  requestAnimationFrame(() => {
    const auto = body.querySelector<HTMLElement>("[data-autofocus]") ?? body;
    // Don't let the focused button scroll a tall dialog: the reader should start at the top.
    auto.focus({ preventScroll: true });
    body.scrollTop = 0;
    back.scrollTop = 0;
  });
  return handle;
}

/** Opens an accessible dialog: focus trap, Esc to close, focus restored on close. Bottom sheet on phones. */
export function openModal(opts: ModalOpts): ModalHandle {
  return build(opts, "modal");
}

/**
 * Sheet variant (same handle): a bottom sheet on phones; on desktop a popover under `anchor` when given
 * (e.g. "My projects"), otherwise a centred sheet.
 */
export function openSheet(opts: SheetOpts): ModalHandle {
  return build(opts, "sheet");
}

export const closeButton = (close: () => void, label = "Close") =>
  h("button", { class: "icon-btn modal-x", type: "button", "aria-label": label, title: label, onclick: close, html: CLOSE_SVG });

const CLOSE_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';

/** One toast at a time is plenty; newer toasts push older ones out. */
export function toast(text: string, tone: "ok" | "err" | "info" = "info") {
  let host = document.querySelector<HTMLElement>(".toasts");
  if (!host) {
    host = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
    document.body.append(host);
  }
  while (host.children.length >= 2) host.firstElementChild?.remove();
  const t = h("div", { class: `toast ${tone}` }, text);
  host.append(t);
  setTimeout(() => t.classList.add("leaving"), 3600);
  setTimeout(() => t.remove(), 3800);
}

export async function copyText(text: string, what = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(what, "ok");
  } catch {
    toast("Could not copy. Select the text and copy it manually.", "err");
  }
}

/** Closes every open dialog (browser Back / Forward). */
export function closeAllModals() {
  for (const m of [...stack].reverse()) m.close();
}
