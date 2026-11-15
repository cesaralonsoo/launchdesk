// Page footer (L4) and hackathon bar (L3). Owner: WS1.
// The hackathon bar shows only when /api/config says `hackathon: true`; its × is remembered per browser.
import { h } from "./dom";
import { MARK_SVG } from "./logo";
import { copyText } from "./modal";
import { app } from "./state";
import { iconSvg } from "./ui";

export const LINKS = {
  source: "https://github.com/cesaralonsoo/LaunchDesk",
  vote: "bitcoincash:zp9d679zvayvudj65nd9zlgezvjplr8g3v7hftqmju",
};

const HIDE_KEY = "launchdesk-hackathon-hidden";
const hidden = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
};

const ext = () => h("span", { class: "ext", "aria-hidden": "true", html: iconSvg("ext", 12, 1.6) });

/** "Vote" popover: the full address in mono with a copy button. */
function votePopover() {
  const btn = h("button", { type: "button", class: "hk-link hk-vote", "aria-expanded": "false", "aria-controls": "hk-vote-pop" }, "Vote");
  const pop = h(
    "div",
    { class: "hk-pop", id: "hk-vote-pop", role: "dialog", "aria-label": "Vote address", hidden: true },
    h("p", { class: "hk-pop-t" }, "Vote for LaunchDesk with this address"),
    h("code", { class: "hk-addr" }, LINKS.vote),
    h(
      "button",
      { type: "button", class: "btn sm hk-copy", onclick: () => void copyText(LINKS.vote, "Vote address copied") },
      h("span", { class: "ico", html: iconSvg("copy", 14) }),
      "Copy",
    ),
  );
  const set = (open: boolean) => {
    pop.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  };
  btn.addEventListener("click", () => set(!!pop.hidden));
  pop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      set(false);
      btn.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (!pop.hidden && !pop.contains(e.target as Node) && !btn.contains(e.target as Node)) set(false);
  });
  return h("span", { class: "hk-vote-wrap" }, btn, pop);
}

function hackathonBar() {
  const bar = h(
    "div",
    { class: "hk", role: "complementary", "aria-label": "Hackathon" },
    h(
      "div",
      { class: "hk-in" },
      h("span", { class: "hk-badge" }, "Built for BCH BLAZE 2026"),
      votePopover(),
      h("a", { class: "hk-link", href: LINKS.source, target: "_blank", rel: "noopener" }, "Source ", ext()),
      h("span", { class: "hk-note" }, "All code written 14–22 Nov 2026"),
      h("button", {
        type: "button",
        class: "hk-x",
        "aria-label": "Hide the hackathon bar",
        title: "Hide",
        html: iconSvg("close", 14, 1.6),
        onclick: () => {
          try {
            localStorage.setItem(HIDE_KEY, "1");
          } catch {
            /* storage unavailable: hide for this visit */
          }
          bar.remove();
        },
      }),
    ),
  );
  return bar;
}

/** Page footer: brand, legal links, AI disclaimer, source. The hackathon bar is added above it when enabled. */
export function footer(): HTMLElement {
  const el = h(
    "footer",
    { class: "site-foot" },
    h(
      "div",
      { class: "sf-in" },
      h("span", { class: "sf-brand" }, h("span", { class: "sf-mark", html: MARK_SVG(14) }), "LaunchDesk"),
      h("nav", { class: "sf-links", "aria-label": "Legal" }, h("a", { href: "/legal.html#terms" }, "Terms"), h("a", { href: "/legal.html#privacy" }, "Privacy"), h("a", { href: LINKS.source, target: "_blank", rel: "noopener" }, "Source")),
      h("p", { class: "sf-note" }, "AI output is guidance, not financial or legal advice."),
    ),
  );
  // The flag arrives with /api/config; wait for it (never show the bar on a guess).
  let tries = 0;
  const check = () => {
    if (app.config) {
      if (app.config.hackathon === true && !hidden() && !el.querySelector(".hk")) el.prepend(hackathonBar());
      return;
    }
    if (++tries < 120) setTimeout(check, 250);
  };
  check();
  return el;
}

/** Appends the footer once to `parent` (idempotent). */
export function mountFooter(parent: Element = document.body): HTMLElement {
  const existing = document.querySelector<HTMLElement>(".site-foot");
  if (existing) return existing;
  const el = footer();
  parent.append(el);
  return el;
}
