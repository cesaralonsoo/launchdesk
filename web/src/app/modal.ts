import { h } from "./dom";

export type ModalHandle = {
  el: HTMLElement;
  body: HTMLElement;
  close: () => void;
  closed: Promise<void>;
  /** While locked, Esc / backdrop / × do nothing (e.g. a payment is being checked). */
  lock: (locked: boolean) => void;
};

let stack: ModalHandle[] = [];

/** Opens an accessible dialog: focus trap, Esc to close, focus restored on close. */
export function openModal(opts: { label: string; className?: string; onClose?: () => void; dismissable?: boolean }): ModalHandle {
  const prevFocus = document.activeElement as HTMLElement | null;
  const body = h("div", { class: `modal ${opts.className ?? ""}`, role: "dialog", "aria-modal": "true", "aria-label": opts.label, tabindex: "-1" });
  const back = h("div", { class: "modal-back" }, body);
  let done!: () => void;
  const closed = new Promise<void>((r) => (done = r));
  let isClosed = false;
  let dismissable = opts.dismissable !== false;
  const close = () => {
    if (isClosed) return;
    isClosed = true;
    document.removeEventListener("keydown", onKey, true);
    back.classList.add("leaving");
    setTimeout(() => back.remove(), 220);
    stack = stack.filter((m) => m !== handle);
    opts.onClose?.();
    prevFocus?.focus?.({ preventScroll: true });
    done();
  };
  const onKey = (e: KeyboardEvent) => {
    if (stack[stack.length - 1] !== handle) return;
    if (e.key === "Escape" && dismissable) {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      const f = [...body.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex='-1'])")].filter(
        (x) => x.offsetParent !== null,
      );
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  back.addEventListener("mousedown", (e) => {
    if (e.target === back && dismissable) close();
  });
  document.addEventListener("keydown", onKey, true);
  document.body.append(back);
  const lock = (locked: boolean) => {
    dismissable = !locked && opts.dismissable !== false;
    body.classList.toggle("is-locked", locked);
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

export const closeButton = (close: () => void, label = "Close") =>
  h("button", { class: "icon-btn modal-x", type: "button", "aria-label": label, title: label, onclick: close, html: CLOSE_SVG });

const CLOSE_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';

export function toast(text: string, tone: "ok" | "err" | "info" = "info") {
  let host = document.querySelector<HTMLElement>(".toasts");
  if (!host) {
    host = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
    document.body.append(host);
  }
  const t = h("div", { class: `toast ${tone}` }, text);
  host.append(t);
  setTimeout(() => t.classList.add("leaving"), 3600);
  setTimeout(() => t.remove(), 3900);
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
