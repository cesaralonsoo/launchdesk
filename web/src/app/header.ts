// Header (L1, L2): mark + wordmark, 4-step text stepper, "My projects", quiet wallet button, overflow menu.
// Owner: WS1. The hackathon strip moved to the footer (footer.ts, L3); `strip()` stays as a shim so callers
// that still mount it at the top get the footer at the bottom instead.
import { disconnect, onWallet, receiveAddress, walletName, walletState } from "../wallet";
import { h } from "./dom";
import { mountFooter, LINKS } from "./footer";
import { MARK_SVG } from "./logo";
import { closeButton, openModal } from "./modal";
import { openConnect } from "./pay";
import { list as listProjects, onChange as onProjects } from "./projects";
import { openMyProjects } from "./projects-ui";
import { onSound, play, setSound, soundOn } from "./sound";
import { app, shortAddr, type Step } from "./state";
import { avatarGroup, icon, iconSvg } from "./ui";

/** Legacy export (v3 tile). The v4 mark is `MARK_SVG()` in logo.ts. */
export const LOGO_SVG = MARK_SVG(28);

/**
 * v3 called this to mount the hackathon strip above the header. In v4 the strip lives in the page footer:
 * this returns an empty placeholder and mounts the footer at the end of the same parent once it is in the DOM.
 */
export function strip(): HTMLElement {
  const shim = h("div", { class: "strip-shim", hidden: true });
  queueMicrotask(() => mountFooter(shim.parentElement ?? document.body));
  return shim;
}

/** The 4 v4 steps. */
export const STEPS = ["Validate", "Decide", "Build", "Live"] as const;
export type StepName = (typeof STEPS)[number];
/** The pack section each done step opens. */
const STEP_SECTION = ["summary", "summary", "brand", "website"] as const;

/** v3 Step (1 Plan · 2 Validate · 3 Gate · 4 Build · 5 Launch) → v4 step index 0..3. */
const fromLegacy = (s: Step): number => (s <= 2 ? 0 : s === 3 ? 1 : s === 4 ? 2 : 3);

function openStepSection(i: number) {
  const p = app.project;
  if (!p) return;
  play("open");
  void import("../pack")
    .then((m) => m.openPack(p, { section: STEP_SECTION[i] }))
    .catch(() => undefined);
}

/** "How it works" (overflow menu): the whole product in three rows. */
export function openHowItWorks() {
  const m = openModal({ label: "How it works", className: "how-modal" });
  const price = (s: "validate" | "build") => `$${((app.config?.prices[s] ?? (s === "validate" ? 10 : 20)) / 100).toFixed(2)}`;
  const row = (n: string, title: string, sub: string, right: Node | string | null) =>
    h("li", { class: "hiw-row" }, h("span", { class: "hiw-n", "aria-hidden": "true" }, n), h("div", { class: "hiw-m" }, h("b", null, title), h("p", null, sub)), right);
  m.body.append(
    h("div", { class: "modal-head" }, h("h2", { class: "modal-title" }, "How it works"), closeButton(m.close)),
    h(
      "div",
      { class: "modal-body" },
      h(
        "ol",
        { class: "hiw" },
        row("1", `Validate · ${price("validate")}`, "Mia writes the plan, Leo scores the market and Sam runs the numbers.", avatarGroup(["mia", "leo", "sam"])),
        row("2", "Decide", "Read the report. Stop there and keep it, or continue.", null),
        row("3", `Build · ${price("build")}`, "Nova names it, Dex designs it, Rae plans the launch and Pip puts a page live that takes Bitcoin Cash pre-orders.", avatarGroup(["nova", "dex", "rae", "pip"])),
      ),
      h("p", { class: "hiw-foot" }, "You pay from your own wallet. LaunchDesk never holds your keys."),
    ),
  );
}

type MenuItem = { label: string; cls?: string; run?: () => void; href?: string; ext?: boolean; check?: () => boolean; right?: () => string };

/** Small popover menu with arrow-key navigation, Esc and outside click to close, focus returned. */
function popMenu(anchor: HTMLElement, items: () => MenuItem[]) {
  const el = h("div", { class: "pop-menu", role: "menu", hidden: true });
  const close = (focus = true) => {
    if (el.hidden) return;
    el.hidden = true;
    anchor.setAttribute("aria-expanded", "false");
    if (focus) anchor.focus();
  };
  const open = () => {
    el.replaceChildren(
      ...items().map((it) => {
        const inner = [h("span", { class: "pm-l" }, it.label)];
        if (it.check) inner.push(h("span", { class: `pm-switch${it.check() ? " on" : ""}`, "aria-hidden": "true" }, h("i")));
        else if (it.right) inner.push(h("span", { class: "pm-r" }, it.right()));
        else if (it.ext) inner.push(h("span", { class: "pm-r", html: iconSvg("ext", 14, 1.6) }));
        const attrs = {
          class: `pm-item${it.cls ? ` ${it.cls}` : ""}`,
          role: it.check ? "menuitemcheckbox" : "menuitem",
          "aria-checked": it.check ? String(it.check()) : null,
          tabindex: "-1",
        };
        if (it.href)
          return h("a", { ...attrs, href: it.href, target: it.ext ? "_blank" : null, rel: it.ext ? "noopener" : null, onclick: () => close(false) }, inner);
        return h(
          "button",
          {
            ...attrs,
            type: "button",
            onclick: () => {
              if (it.check) {
                it.run?.();
                const on = it.check();
                const b = el.querySelector<HTMLElement>(`.${it.cls}`);
                b?.setAttribute("aria-checked", String(on));
                b?.querySelector(".pm-switch")?.classList.toggle("on", on);
                return;
              }
              close(true); // focus goes back to ⋯ first, so a dialog opened by the item returns focus there
              it.run?.();
            },
          },
          inner,
        );
      }),
    );
    el.hidden = false;
    anchor.setAttribute("aria-expanded", "true");
    el.querySelector<HTMLElement>(".pm-item")?.focus();
  };
  anchor.setAttribute("aria-haspopup", "menu");
  anchor.setAttribute("aria-expanded", "false");
  anchor.addEventListener("click", () => {
    play("tap");
    if (el.hidden) open();
    else close();
  });
  el.addEventListener("keydown", (e) => {
    const all = [...el.querySelectorAll<HTMLElement>(".pm-item")];
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = all.length;
      all[(i + (e.key === "ArrowDown" ? 1 : n - 1) + n) % n]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      all[e.key === "Home" ? 0 : all.length - 1]?.focus();
    } else if (e.key === "Tab") close(false);
  });
  document.addEventListener("click", (e) => {
    if (!el.hidden && !el.contains(e.target as Node) && !anchor.contains(e.target as Node)) close(false);
  });
  return { el, close };
}

export function header(onHome: () => void) {
  // ---------- stepper (L1): persistent nodes so the connectors can animate ----------
  const stepper = h("ol", { class: "stepper", "aria-label": "Progress" });
  const stepEls = STEPS.map((label, i) => {
    const btn = h(
      "button",
      { type: "button", class: "st-b", disabled: true, onclick: () => openStepSection(i) },
      h("span", { class: "st-ok", "aria-hidden": "true", html: iconSvg("check", 12, 2.2) }),
      h("span", { class: "st-l" }, label),
      h("span", { class: "sr-only st-sr" }),
    );
    const li = h("li", { class: "st todo" }, i > 0 ? h("span", { class: "st-c", "aria-hidden": "true" }, h("i")) : null, btn);
    stepper.append(li);
    return { li, btn };
  });
  const compact = h("div", { class: "stepper-compact", "aria-hidden": "true" });

  // ---------- right side ----------
  const projBtn = h("button", { type: "button", class: "hdr-txt hdr-projects", hidden: true });
  const walletBtn = h("button", { type: "button", class: "hdr-txt wallet-btn" });
  const walletMenu = h("div", { class: "pop-menu wallet-menu", hidden: true, role: "menu" });
  const moreBtn = h("button", { type: "button", class: "icon-btn ghost hdr-more", "aria-label": "More", title: "More", html: iconSvg("more", 20, 1.5) });

  const projCount = () => listProjects().length;
  const renderProjects = () => {
    const n = projCount();
    projBtn.hidden = n === 0;
    projBtn.replaceChildren(h("span", null, "My projects"), h("span", { class: "hdr-count num" }, String(n)));
    projBtn.setAttribute("aria-label", `My projects, ${n}`);
  };
  projBtn.addEventListener("click", () => {
    play("tap");
    openMyProjects(projBtn);
  });
  onProjects(renderProjects);
  window.addEventListener("storage", (e) => e.key === "launchdesk-projects" && renderProjects());
  renderProjects();

  const renderWallet = () => {
    const s = walletState();
    walletBtn.replaceChildren();
    if (s === "ready") {
      walletBtn.classList.add("is-on");
      walletBtn.append(h("span", { class: "live-dot", "aria-hidden": "true" }), h("span", { class: "wb-name" }, walletName()));
      walletBtn.setAttribute("aria-label", `Wallet connected: ${walletName()}. Open wallet menu`);
      walletBtn.setAttribute("aria-haspopup", "menu");
    } else {
      walletBtn.classList.remove("is-on");
      walletBtn.removeAttribute("aria-haspopup");
      walletBtn.setAttribute("aria-label", s === "connecting" ? "Connecting wallet" : "Connect wallet");
      walletBtn.append(icon("wallet", 18, "ico wb-ico"), h("span", { class: "wb-name" }, s === "connecting" ? "Connecting…" : "Connect wallet"));
      walletMenu.hidden = true;
    }
  };
  walletBtn.addEventListener("click", () => {
    play("tap");
    if (walletState() !== "ready") return openConnect();
    let addr = "";
    try {
      addr = receiveAddress();
    } catch {
      /* not ready */
    }
    walletMenu.replaceChildren(
      h("div", { class: "wm-h" }, h("b", null, walletName()), h("small", { class: "mono" }, addr ? shortAddr(addr) : "Connected")),
      h(
        "button",
        {
          type: "button",
          role: "menuitem",
          class: "pm-item wm-item",
          onclick: () => {
            walletMenu.hidden = true;
            void disconnect();
          },
        },
        "Disconnect",
      ),
    );
    walletMenu.hidden = !walletMenu.hidden;
    if (!walletMenu.hidden) walletMenu.querySelector<HTMLElement>("button")?.focus();
  });
  document.addEventListener("click", (e) => {
    if (!walletMenu.hidden && !walletMenu.contains(e.target as Node) && !walletBtn.contains(e.target as Node)) walletMenu.hidden = true;
  });
  walletMenu.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      walletMenu.hidden = true;
      walletBtn.focus();
    }
  });
  onWallet(renderWallet);
  renderWallet();

  const more = popMenu(moreBtn, () => {
    const n = projCount();
    const items: MenuItem[] = [];
    if (n > 0) items.push({ label: "My projects", cls: "mn-projects mobile-only", right: () => String(n), run: () => openMyProjects(null) });
    items.push(
      { label: "Sound", cls: "mn-sound", check: soundOn, run: () => setSound(!soundOn()) },
      { label: "How it works", cls: "mn-how", run: openHowItWorks },
      { label: "Source code", href: LINKS.source, ext: true },
      { label: "Terms and privacy", href: "/legal.html" },
    );
    return items;
  });
  onSound(() => {
    const b = more.el.querySelector(".mn-sound");
    b?.setAttribute("aria-checked", String(soundOn()));
    b?.querySelector(".pm-switch")?.classList.toggle("on", soundOn());
  });

  const brand = h(
    "a",
    {
      href: "/",
      class: "brand",
      "aria-label": "LaunchDesk home",
      onclick: (e: Event) => {
        e.preventDefault();
        onHome();
      },
    },
    h("span", { class: "brand-mark", html: MARK_SVG(18) }),
    h("span", { class: "brand-word" }, "LaunchDesk"),
  );

  const el = h(
    "header",
    { class: "hdr" },
    brand,
    h("nav", { class: "hdr-mid", "aria-label": "Steps" }, stepper, compact),
    h(
      "div",
      { class: "hdr-right" },
      projBtn,
      h("div", { class: "pop-wrap" }, walletBtn, walletMenu),
      h("div", { class: "pop-wrap" }, moreBtn, more.el),
    ),
  );

  /** Shows step `cur` (0..3) as current; earlier steps are done (clickable), later ones are future. */
  const setStepIndex = (cur: number) => {
    stepEls.forEach(({ li, btn }, i) => {
      const st = i < cur ? "done" : i === cur ? "current" : "todo";
      li.className = `st ${st}`;
      li.querySelector(".st-c")?.classList.toggle("on", i <= cur);
      btn.disabled = st !== "done";
      if (st === "current") btn.setAttribute("aria-current", "step");
      else btn.removeAttribute("aria-current");
      btn.title = st === "done" ? `Open ${STEPS[i] === "Live" ? "your site section" : "this part of your pack"}` : "";
      btn.querySelector(".st-sr")!.textContent = st === "done" ? ", done" : st === "current" ? ", current step" : "";
    });
    compact.textContent = `Step ${cur + 1} of 4 · ${STEPS[cur]}`;
  };

  /** v3-compatible: takes the legacy 1..5 Step from state.ts and maps it onto Validate · Decide · Build · Live. */
  const setStep = (step: Step) => setStepIndex(fromLegacy(step));
  /** v4: set the step by name. */
  const setStage = (name: StepName) => setStepIndex(STEPS.indexOf(name));
  setStepIndex(0);
  return { el, setStep, setStage };
}
