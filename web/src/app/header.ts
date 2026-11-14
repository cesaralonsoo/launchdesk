import { disconnect, onWallet, receiveAddress, walletName, walletState } from "../wallet";
import { h } from "./dom";
import { copyText } from "./modal";
import { openConnect } from "./pay";
import { onSound, play, setSound, soundOn } from "./sound";
import { shortAddr, type Step } from "./state";
import { extIcon, icon, iconSvg } from "./ui";

// Hackathon links. Leave SLIDES empty to hide the link.
const LINKS = {
  slides: "",
  source: "https://github.com/cesaralonsoo/LaunchDesk",
  vote: "bitcoincash:zp9d679zvayvudj65nd9zlgezvjplr8g3v7hftqmju",
};

/** LaunchDesk mark: an ink tile with a white rocket line drawing. */
export const LOGO_SVG =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#1D1D1F"/><g fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M32 13c5.6 5 7.4 12 5.6 20.5H26.4C24.6 25 26.4 18 32 13z"/><path d="M26.4 33.5 21.5 40h6M37.6 33.5 42.5 40h-6M29 45.5h6"/></g><circle cx="32" cy="24.5" r="2.6" fill="#0AC18E"/></svg>';

export function strip() {
  const details = h("div", { class: "strip-more", id: "strip-more" });
  const vote = h(
    "span",
    { class: "strip-vote" },
    "Vote ",
    h("code", { title: LINKS.vote }, shortAddr(LINKS.vote)),
    h("button", { type: "button", class: "strip-copy", "aria-label": "Copy vote address", onclick: () => copyText(LINKS.vote, "Vote address copied") }, "Copy"),
  );
  const items = [
    LINKS.slides ? h("a", { href: LINKS.slides, target: "_blank", rel: "noopener" }, "Slides ", extIcon()) : null,
    h("a", { href: LINKS.source, target: "_blank", rel: "noopener" }, "Source code ", extIcon()),
    vote,
    h("span", { class: "strip-note" }, "All code written during BLAZE, 14–22 Nov 2026"),
  ];
  details.append(...items.filter((x): x is HTMLElement => !!x));
  const toggle = h("button", { type: "button", class: "strip-toggle", "aria-expanded": "false", "aria-controls": "strip-more" }, "Details");
  const bar = h(
    "div",
    { class: "strip", role: "complementary", "aria-label": "Hackathon information" },
    h("div", { class: "strip-in" }, h("span", { class: "strip-badge" }, "BCH BLAZE 2026", h("span", { class: "strip-sub" }, " · Mainnet track")), details, toggle),
  );
  toggle.addEventListener("click", () => {
    const open = bar.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Close" : "Details";
  });
  return bar;
}

const STEPS = ["Plan", "Validate", "Gate", "Build", "Launch"];

export function header(onHome: () => void) {
  const stepper = h("ol", { class: "stepper", "aria-label": "Progress" });
  const compact = h("div", { class: "stepper-compact", "aria-hidden": "true" });
  const walletBtn = h("button", { type: "button", class: "btn sm wallet-btn" });
  const soundBtn = h("button", { type: "button", class: "icon-btn sound-btn" });
  const menu = h("div", { class: "wallet-menu", hidden: true, role: "menu" });

  const renderWallet = () => {
    const s = walletState();
    walletBtn.replaceChildren();
    if (s === "ready") {
      walletBtn.append(h("span", { class: "live-dot", "aria-hidden": "true" }), h("span", { class: "wb-name" }, walletName()));
      walletBtn.setAttribute("aria-label", `Wallet connected: ${walletName()}. Open wallet menu`);
      walletBtn.setAttribute("aria-haspopup", "menu");
    } else {
      walletBtn.removeAttribute("aria-haspopup");
      walletBtn.removeAttribute("aria-label");
      walletBtn.append(
        icon("wallet", 16, "wb-ico"),
        h("span", { class: "wb-name" }, s === "connecting" ? "Connecting…" : h("span", null, "Connect", h("span", { class: "wb-long" }, " wallet"))),
      );
      menu.hidden = true;
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
    menu.replaceChildren(
      h("div", { class: "wm-h" }, h("b", null, walletName()), h("small", { class: "mono" }, addr ? shortAddr(addr) : "Connected")),
      h(
        "button",
        {
          type: "button",
          role: "menuitem",
          class: "wm-item",
          onclick: () => {
            menu.hidden = true;
            void disconnect();
          },
        },
        "Disconnect",
      ),
    );
    menu.hidden = !menu.hidden;
    if (!menu.hidden) menu.querySelector<HTMLElement>("button")?.focus();
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node) && e.target !== walletBtn && !walletBtn.contains(e.target as Node)) menu.hidden = true;
  });
  menu.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      menu.hidden = true;
      walletBtn.focus();
    }
  });
  onWallet(renderWallet);
  renderWallet();

  const renderSound = (on: boolean) => {
    soundBtn.setAttribute("aria-pressed", String(on));
    soundBtn.setAttribute("aria-label", on ? "Sound on. Turn sound off" : "Sound off. Turn sound on");
    soundBtn.innerHTML = iconSvg(on ? "soundOn" : "soundOff", 16);
    soundBtn.title = on ? "Sound on" : "Sound off";
  };
  soundBtn.addEventListener("click", () => setSound(!soundOn()));
  onSound(renderSound);
  renderSound(soundOn());

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
    h("span", { class: "brand-logo", html: LOGO_SVG }),
    h("span", { class: "brand-txt" }, h("b", null, "LaunchDesk"), h("small", null, "Your AI startup team, paid in cents")),
  );

  const el = h(
    "header",
    { class: "hdr" },
    brand,
    h("nav", { class: "hdr-mid", "aria-label": "Steps" }, stepper, compact),
    h("div", { class: "hdr-right" }, h("div", { class: "wallet-wrap" }, walletBtn, menu), soundBtn),
  );

  const setStep = (step: Step) => {
    stepper.replaceChildren(
      ...STEPS.map((label, i) => {
        const n = i + 1;
        const st = n < step ? "done" : n === step ? "current" : "todo";
        return h(
          "li",
          { class: `st ${st}`, "aria-current": st === "current" ? "step" : null },
          st === "done" ? h("span", { class: "st-n", "aria-hidden": "true", html: iconSvg("check", 12, 2.2) }) : h("span", { class: "st-n", "aria-hidden": "true" }, String(n)),
          h("span", { class: "st-l" }, label),
          h("span", { class: "sr-only" }, st === "done" ? " (done)" : ""),
        );
      }),
    );
    compact.replaceChildren(h("span", null, `Step ${step} of 5`), h("b", null, STEPS[step - 1]));
  };
  setStep(1);
  return { el, setStep };
}
