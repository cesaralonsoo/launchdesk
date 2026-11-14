import { disconnect, onWallet, receiveAddress, walletName, walletState } from "../wallet";
import { h } from "./dom";
import { copyText } from "./modal";
import { openConnect } from "./pay";
import { onSound, play, setSound, soundOn } from "./sound";
import { shortAddr, type Step } from "./state";
import { extIcon } from "./ui";

// Hackathon links. Leave SLIDES empty to hide the link.
const LINKS = {
  slides: "",
  source: "https://github.com/cesaralonsoo/LaunchDesk",
  vote: "bitcoincash:zp9d679zvayvudj65nd9zlgezvjplr8g3v7hftqmju",
};

export const LOGO_SVG =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lg-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0FD9A0"/><stop offset="1" stop-color="#08A87B"/></linearGradient></defs><rect width="64" height="64" rx="18" fill="url(#lg-b)"/><path d="M32 11c6.5 6 8.6 14.2 6.4 24.5H25.6C23.4 25.2 25.5 17 32 11z" fill="#0B0F15"/><circle cx="32" cy="23" r="3.3" fill="#0FD9A0"/><path d="M25.6 35.5 21 42.5h7.2M38.4 35.5 43 42.5h-7.2" fill="#0B0F15"/><rect x="19" y="46" width="26" height="5" rx="2.5" fill="#0B0F15"/></svg>';

export function strip() {
  const details = h("div", { class: "strip-more", id: "strip-more" });
  const vote = h(
    "span",
    { class: "strip-vote" },
    "Vote: ",
    h("code", { title: LINKS.vote }, shortAddr(LINKS.vote)),
    h("button", { type: "button", class: "strip-copy", "aria-label": "Copy vote address", onclick: () => copyText(LINKS.vote, "Vote address copied") }, "Copy"),
  );
  const items = [
    LINKS.slides ? h("a", { href: LINKS.slides, target: "_blank", rel: "noopener" }, "Slides ", extIcon()) : null,
    h("a", { href: LINKS.source, target: "_blank", rel: "noopener" }, "Source code ", extIcon()),
    vote,
    h("span", { class: "strip-note" }, "All code written during BLAZE (14–22 Nov 2026)"),
  ];
  details.append(...items.filter((x): x is HTMLElement => !!x));
  const toggle = h("button", { type: "button", class: "strip-toggle", "aria-expanded": "false", "aria-controls": "strip-more" }, "Details");
  const bar = h(
    "div",
    { class: "strip", role: "complementary", "aria-label": "Hackathon information" },
    h("div", { class: "strip-in" }, h("span", { class: "strip-badge" }, h("span", { class: "flame", "aria-hidden": "true" }), "BCH BLAZE 2026 · Mainnet track"), details, toggle),
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
  const walletBtn = h("button", { type: "button", class: "btn ghost sm wallet-btn" });
  const soundBtn = h("button", { type: "button", class: "btn ghost sm sound-btn" });
  const menu = h("div", { class: "wallet-menu", hidden: true, role: "menu" });

  const renderWallet = () => {
    const s = walletState();
    walletBtn.replaceChildren();
    if (s === "ready") {
      walletBtn.append(h("span", { class: "live-dot sm", "aria-hidden": "true" }), h("span", { class: "wb-name" }, walletName()));
      walletBtn.setAttribute("aria-label", `Wallet connected: ${walletName()}. Open wallet menu`);
      walletBtn.setAttribute("aria-haspopup", "menu");
    } else {
      walletBtn.removeAttribute("aria-haspopup");
      walletBtn.removeAttribute("aria-label");
      walletBtn.append(
        h("span", { class: "wb-ico", "aria-hidden": "true", html: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v4"/><path d="M4 7.5V17a2 2 0 0 0 2 2h14V9H6.5A2.5 2.5 0 0 1 4 7.5z"/></svg>' }),
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
    soundBtn.innerHTML = on
      ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg><span class="sb-l">Sound on</span>'
      : '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6M21 9l-5 6"/></svg><span class="sb-l">Sound off</span>';
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
    h("span", { class: "brand-txt" }, h("b", null, "LaunchDesk"), h("small", null, "Your AI startup team · paid in cents")),
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
          h("span", { class: "st-n", "aria-hidden": "true" }, st === "done" ? "✓" : String(n)),
          h("span", { class: "st-l" }, label),
          h("span", { class: "sr-only" }, st === "done" ? " (done)" : ""),
        );
      }),
    );
    compact.replaceChildren(h("span", { class: "st-n" }, String(step)), h("span", null, `Step ${step}/5 · `, h("b", null, STEPS[step - 1])));
  };
  setStep(1);
  return { el, setStep };
}
