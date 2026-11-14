import { api, ApiError } from "../api";
import type { Project, Quote, Stage } from "../types";
import { STAGE_DEPTS } from "../types";
import { onWallet, pair, payWithWallet, receiveAddress, walletName, walletState } from "../wallet";
import { h } from "./dom";
import { closeButton, copyText, openModal, type ModalHandle } from "./modal";
import { play } from "./sound";
import { app, fmtBch, fmtSats, fmtUsd } from "./state";
import { STAGE_INFO, TEAM } from "./team";
import { iconSvg } from "./ui";

/** Phones and tablets: nobody can scan their own screen, so the deep link comes first. */
const isHandheld = () => matchMedia("(pointer: coarse)").matches || innerWidth < 768;

const walletIcon = iconSvg("wallet", 18);

/** The pairing block: WizardConnect QR + "Open wallet app" deep link, ordered for the device. */
function pairingBlock(intro: string) {
  const { uri, qrSvg } = pair();
  const qr = h("div", { class: "qr", html: qrSvg, role: "img", "aria-label": "WizardConnect pairing QR code" });
  const copy = h("button", { type: "button", class: "link small", onclick: () => copyText(uri, "Pairing link copied") }, "Copy pairing link");
  if (isHandheld()) {
    const qrBox = h("div", { class: "qr-row qr-alt", hidden: true }, qr, h("div", { class: "qr-text" }, h("p", { class: "muted small" }, "Scan this from another device's BCH wallet."), copy));
    const toggle = h(
      "button",
      {
        type: "button",
        class: "link small qr-toggle",
        "aria-expanded": "false",
        onclick: (e: Event) => {
          const b = e.currentTarget as HTMLButtonElement;
          qrBox.hidden = !qrBox.hidden;
          b.setAttribute("aria-expanded", String(!qrBox.hidden));
          b.textContent = qrBox.hidden ? "Show QR instead" : "Hide QR";
        },
      },
      "Show QR instead",
    );
    return h(
      "div",
      { class: "pair is-phone" },
      h("p", { class: "qr-lead" }, intro),
      h(
        "a",
        { class: "btn primary block lg wallet-cta", href: uri, "data-autofocus": "" },
        h("span", { class: "wc-ico", "aria-hidden": "true", html: walletIcon }),
        h("span", null, h("b", null, "Open wallet app"), h("small", null, "Selene, Cashonize or Paytaca, via WizardConnect")),
      ),
      toggle,
      qrBox,
    );
  }
  return h(
    "div",
    { class: "pair" },
    h(
      "div",
      { class: "qr-row" },
      qr,
      h(
        "div",
        { class: "qr-text" },
        h("p", { class: "qr-lead" }, intro),
        h("p", { class: "muted small" }, "Scan with your phone's BCH wallet (Selene, Cashonize, Paytaca)."),
        copy,
      ),
    ),
    h(
      "a",
      { class: "btn block wallet-alt", href: uri },
      h("span", { class: "wc-ico sm", "aria-hidden": "true", html: walletIcon }),
      "Wallet on this computer? Open it",
    ),
  );
}

/** Standalone "Connect wallet" dialog (from the header). */
export function openConnect() {
  if (walletState() === "ready") return;
  const m = openModal({ label: "Connect your wallet", className: "pay-modal" });
  m.body.append(
    h(
      "div",
      { class: "modal-head" },
      h("div", null, h("div", { class: "kicker" }, "Connect wallet"), h("h2", { class: "modal-title" }, "Pay in cents with Bitcoin Cash")),
      closeButton(m.close),
    ),
    h("div", { class: "modal-body" }, pairingBlock("Pair once. Every stage is then a one-tap approval in your wallet. LaunchDesk never holds your keys.")),
  );
  const off = onWallet((s) => {
    if (s === "ready") {
      play("coin");
      m.close();
    }
  });
  void m.closed.then(() => off());
}

type Step = "approve" | "check" | "start";
type Cause = "cancelled" | "not-found" | "expired" | "quote" | "other";

function causeOf(e: unknown): Cause {
  const msg = (e as Error)?.message ?? "";
  if (/reject|cancel|denied|declin|abort/i.test(msg)) return "cancelled";
  if (/quote expired/i.test(msg)) return "expired";
  // A rejected or invalid transaction is final: never offer "Check again" for it.
  if (/broadcast rejected|too small|not tagged|invalid transaction|already used/i.test(msg)) return "other";
  if (e instanceof ApiError && (e.status === 0 || e.status === 502 || e.status === 504)) return "not-found";
  if (/not found|timeout|did not answer|cannot reach|connection/i.test(msg)) return "not-found";
  return "other";
}

/**
 * Opens the pay modal for a stage. Resolves with the updated project once paid (and the stage
 * started), or null if the user closed it before paying.
 */
export function openPay(project: Project, stage: Stage): Promise<Project | null> {
  const info = STAGE_INFO[stage];
  const cents = app.config?.prices[stage] ?? (stage === "validate" ? 10 : 20);
  const first = TEAM[STAGE_DEPTS[stage][0]];
  const abort = new AbortController();
  let result: Project | null = null;
  let offWallet: (() => void) | null = null;
  const m: ModalHandle = openModal({
    label: `Pay ${info.label}`,
    className: "pay-modal",
    onClose: () => {
      abort.abort();
      offWallet?.();
    },
  });

  const sample = !!app.config?.mockAi;
  const satsLine = h("div", { class: "pay-sats mono", hidden: sample }, "Getting a live BCH quote…");
  const main = h("div", { class: "pay-main", "aria-live": "polite" });
  // Real AI + local test switch: a quiet secondary link. Sample-data servers get a full button in the body instead.
  const devLink =
    app.config?.devSkipPayment && !sample
      ? h("button", { type: "button", class: "link tiny dev-link", onclick: () => void payDev() }, "Run without paying (local test)")
      : null;
  const howLine = sample
    ? h("ol", { class: "pay-how", "aria-label": "What happens next" }, h("li", null, h("i", null, "1"), `${first.name} starts with sample data`))
    : h(
        "ol",
        { class: "pay-how", "aria-label": "How paying works" },
        h("li", null, h("i", null, "1"), "Pair wallet"),
        h("li", null, h("i", null, "2"), `Approve ${fmtUsd(cents)}`),
        h("li", null, h("i", null, "3"), `${first.name} starts`),
      );

  m.body.append(
    h(
      "div",
      { class: "modal-head" },
      h(
        "div",
        null,
        h("div", { class: "kicker" }, `Stage ${info.n} · ${info.title}`),
        h("div", { class: "pay-price" }, h("span", { class: "num" }, fmtUsd(cents)), sample ? h("span", { class: "demo-pill" }, "Demo") : null),
        satsLine,
        howLine,
      ),
      closeButton(m.close),
    ),
    h("div", { class: "modal-body" }, main),
    h(
      "div",
      { class: "modal-foot" },
      stage === "build"
        ? h("p", { class: "pay-founder" }, h("b", null, "Your wallet becomes your shop's checkout. "), "Customers' pre-orders go straight to it. LaunchDesk never holds that money.")
        : null,
      h("p", { class: "pay-gets" }, info.gets),
      devLink,
    ),
  );

  let quote: Quote | null = null;
  let lastTx: string | null = null;

  const errorView = (title: string, body: string, primary: [string, () => void], secondary?: [string, () => void]) => {
    m.lock(false);
    main.replaceChildren(
      h(
        "div",
        { class: "callout danger", role: "alert" },
        h("b", null, title),
        h("p", null, body),
        h(
          "div",
          { class: "callout-btns" },
          h("button", { type: "button", class: "btn sm primary", onclick: primary[1], "data-autofocus": "" }, primary[0]),
          secondary ? h("button", { type: "button", class: "btn sm", onclick: secondary[1] }, secondary[0]) : null,
        ),
      ),
    );
    main.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
  };

  const showPayError = (e: unknown) => {
    const cause = causeOf(e);
    if (cause === "cancelled") return errorView("You cancelled in your wallet", "Nothing was sent.", ["Try again", () => void payNow(true)]);
    if (cause === "not-found" && lastTx)
      return errorView(
        "We haven't seen your payment yet",
        "If your wallet shows it as sent, it can take a few seconds to reach the network. You won't be charged twice.",
        ["Check again", () => void submit(lastTx!)],
        ["Start over", () => ((lastTx = null), void loadQuote())],
      );
    if (cause === "expired") return errorView("The price quote expired", "Nothing was charged. We'll fetch a fresh BCH price.", ["Get a new quote", () => ((lastTx = null), void loadQuote())]);
    errorView("Payment not completed", `${(e as Error)?.message || "Something went wrong."} Nothing was charged.`, ["Try again", () => ((lastTx = null), void loadQuote())]);
  };

  const steps = (active: Step, dev: boolean) => {
    // A local test never touches the chain: it must never be described as a payment.
    const order: Step[] = dev ? ["check", "start"] : ["approve", "check", "start"];
    const label: Record<Step, string> = {
      approve: `Approve in ${walletName()}`,
      check: dev ? (sample ? "Opening the office" : "Recording local test") : "Checking payment on Bitcoin Cash",
      start: dev && sample ? `${first.name} starts · sample data` : `${first.name} starts`,
    };
    const ai = order.indexOf(active);
    return h(
      "ol",
      { class: "pay-steps" },
      order.map((s, i) =>
        h(
          "li",
          { class: i < ai ? "done" : i === ai ? "active" : "" },
          i < ai ? h("span", { class: "ps-dot", "aria-hidden": "true", html: iconSvg("check", 12, 2.2) }) : h("span", { class: "ps-dot", "aria-hidden": "true" }, String(i + 1)),
          h("span", null, label[s]),
          i === ai ? h("span", { class: "spinner", "aria-hidden": "true" }) : null,
        ),
      ),
    );
  };

  const approveView = (active: Step, dev = false) => {
    howLine.hidden = true;
    const head =
      active === "approve"
        ? [`Approve in ${walletName()}`, "Open your wallet and confirm the payment request."]
        : dev
          ? active === "check"
            ? [sample ? "Starting with sample data" : "Local test", sample ? "No payment needed on this demo server…" : "Recording local test…"]
            : [sample ? "Started · sample data" : "Started · local test", sample ? "Nothing was charged. Results are sample data." : "Local test recorded · no payment sent."]
          : active === "check"
            ? ["Payment sent", "Checking it on Bitcoin Cash mainnet…"]
            : ["Paid. Thank you", "Recorded on Bitcoin Cash mainnet."];
    // Once the wallet has signed, closing the dialog would hide a payment that is already on its way.
    m.lock(active !== "approve");
    main.replaceChildren(
      h(
        "div",
        { class: "approve" },
        h(
          "div",
          { class: "approve-head" },
          h("span", { class: "wc-ico big", "aria-hidden": "true", html: walletIcon }),
          h("div", null, h("b", null, head[0]), h("small", { class: "muted" }, head[1])),
        ),
        steps(active, dev),
      ),
    );
  };

  const finish = async (p: Project, dev = false) => {
    approveView("start", dev);
    play(dev ? "start" : "coin");
    result = p;
    await api.run(project.id, stage).catch(() => {});
    setTimeout(() => {
      m.lock(false);
      m.close();
    }, 650);
  };

  const founder = () => {
    if (stage !== "build") return undefined;
    try {
      return receiveAddress();
    } catch {
      return undefined;
    }
  };

  /** Sends a signed tx to the server. Safe to repeat with the same tx: it can only be paid once. */
  const submit = async (txHex: string) => {
    approveView("check");
    try {
      const p = await api.pay(project.id, { stage, txHex, founderAddress: founder() });
      await finish(p);
    } catch (e) {
      if (abort.signal.aborted) return;
      showPayError(e);
    }
  };

  const payNow = async (fresh = false) => {
    try {
      // Quotes live 15 minutes: never ask the wallet to sign a price the server will refuse.
      if (fresh || !quote || quote.expiresAt - Date.now() < 60_000) {
        quote = await api.quote(project.id, stage);
        satsLine.textContent = `${fmtSats(quote.sats)} sats · ${fmtBch(quote.sats)} BCH`;
      }
    } catch (e) {
      return errorView("Couldn't fetch the live BCH price", "Nothing was charged.", ["Retry", () => void payNow(true)]);
    }
    approveView("approve");
    try {
      const txHex = await payWithWallet(quote.address, quote.sats, quote.tag, `LaunchDesk · ${info.label} · ${fmtUsd(quote.cents)}`, abort.signal);
      if (abort.signal.aborted) return;
      lastTx = txHex;
    } catch (e) {
      if (abort.signal.aborted) return;
      return showPayError(e);
    }
    await submit(lastTx);
  };

  async function payDev() {
    approveView("check", true);
    try {
      // Local test without a wallet: the merchant address stands in, and the generated site marks it as a demo address.
      const fa = founder() ?? (stage === "build" ? app.config?.merchantAddress : undefined);
      const p = await api.pay(project.id, { stage, dev: true, founderAddress: fa });
      await finish(p, true);
    } catch (e) {
      errorView(sample ? "Couldn't start the run" : "Local test failed", (e as Error).message, ["Try again", () => void payDev()]);
    }
  }

  const route = () => {
    offWallet?.();
    offWallet = null;
    const s = walletState();
    if (s === "ready") return void payNow();
    if (s === "connecting") {
      main.replaceChildren(h("div", { class: "approve" }, h("div", { class: "approve-head" }, h("span", { class: "spinner" }), h("b", null, "Reconnecting to your wallet…"))));
      const t = setTimeout(() => walletState() !== "ready" && showPairing(), 9000);
      offWallet = onWallet((st) => {
        if (st === "ready") {
          clearTimeout(t);
          route();
        }
      });
      return;
    }
    showPairing();
  };

  const showPairing = () => {
    main.replaceChildren(pairingBlock(`Connect a Bitcoin Cash wallet to pay ${fmtUsd(cents)}. You approve the payment in the wallet.`));
    offWallet?.();
    offWallet = onWallet((st) => st === "ready" && route());
  };

  const loadQuote = async () => {
    howLine.hidden = false;
    if (sample) {
      // Real money must never buy sample output: this server runs without an AI key.
      const run = app.config?.devSkipPayment
        ? h("button", { type: "button", class: "btn primary lg block dev-link dev-run", "data-autofocus": "", onclick: () => void payDev() }, "Run with sample data")
        : null;
      main.replaceChildren(
        h(
          "div",
          { class: "sample-run" },
          h("p", { class: "info-line" }, h("span", { class: "info-i", "aria-hidden": "true", html: iconSvg("info", 16) }), "Demo server: no AI key, so nothing is charged and results are sample data."),
          run ?? h("p", { class: "muted small" }, "Payments are switched off on this server."),
        ),
      );
      requestAnimationFrame(() => run?.focus({ preventScroll: true }));
      return;
    }
    main.replaceChildren(h("div", { class: "approve" }, h("div", { class: "approve-head" }, h("span", { class: "spinner" }), h("b", null, "Getting a live quote…"))));
    try {
      quote = await api.quote(project.id, stage);
      satsLine.textContent = `${fmtSats(quote.sats)} sats · ${fmtBch(quote.sats)} BCH`;
      route();
    } catch {
      satsLine.textContent = "Live quote unavailable";
      satsLine.classList.remove("mono");
      errorView("Couldn't fetch the live BCH price", "Nothing was charged.", ["Retry", () => void loadQuote()]);
    }
  };
  void loadQuote();

  return m.closed.then(() => result);
}
