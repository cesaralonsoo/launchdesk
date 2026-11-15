// Pay sheet (spec-v4 L28–L32, M7, F9, F10). Owner: WS3. One layout for both stages, demo and real.
import "./money.css";
import { api, ApiError } from "../api";
import { qrSvg } from "../site/qr";
import type { Project, Quote, Stage, WorkDept } from "../types";
import { normalize, STAGE_DEPTS } from "../types";
import {
  cancelPairing,
  disconnect,
  newPairing,
  onWallet,
  pair,
  PAIRING_TTL_S,
  payWithWallet,
  receiveAddress,
  walletName,
  walletState,
} from "../wallet";
import { h } from "./dom";
import { closeButton, copyText, openModal, toast, type ModalHandle } from "./modal";
import { checkDraw, countUp, DUR, EASE, reduced } from "./motion";
import { ownerKey } from "./projects";
import { play } from "./sound";
import { app, explorerTx, fmtSats, fmtUsd } from "./state";
import { TEAM } from "./team";
import { avatarGroup, iconSvg } from "./ui";

/** Phones and tablets: nobody can scan their own screen, so the deep link comes first. */
const isHandheld = () => matchMedia("(pointer: coarse)").matches || innerWidth < 768;

const WALLET_TIMEOUT_MS = 60_000;
const QR_POLL_MS = 3_000;
const SEEN_POLL_MS = 4_000;

const names = (ds: readonly WorkDept[]) => {
  const n = ds.map((d) => TEAM[d].name);
  return n.length < 2 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
};
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const approxSats = (cents: number, bchUsd: number) => (bchUsd > 0 ? Math.ceil((cents / 100 / bchUsd) * 1e8) : 0);
const ico = (name: string, size = 16, stroke = 1.5, cls = "ico") => h("span", { class: cls, "aria-hidden": "true", html: iconSvg(name, size, stroke) });

// ---------- connect view (F9) ----------

type ConnectView = { el: HTMLElement; dispose: () => void };

/**
 * The three ways in: phone wallet (pairing QR with a 2-minute code), wallet on this computer (deep link),
 * and a short "New to Bitcoin Cash?" note. Handheld devices get the deep link first.
 */
function connectView(opts: { onExample?: () => void } = {}): ConnectView {
  let { uri, qrSvg: qr } = pair();
  let born = Date.now();
  const qrBox = h("div", { class: "pc-qr well", role: "img", "aria-label": "WizardConnect pairing QR code", html: qr });
  const ttl = h("span", { class: "pc-ttl num" });
  const deep = h("a", { class: "btn sm pc-open", href: uri }, "Open wallet");
  const fresh = () => {
    ({ uri, qrSvg: qr } = newPairing());
    born = Date.now();
    qrBox.innerHTML = qr;
    deep.href = uri;
    tick();
  };
  const newCode = h("button", { type: "button", class: "link-btn", onclick: fresh }, "New code");
  const waiting = h("span", { class: "pc-wait" }, h("i", { class: "pc-dot", "aria-hidden": "true" }), "Waiting for your wallet…");
  const tick = () => {
    const left = PAIRING_TTL_S * 1000 - (Date.now() - born);
    if (left <= 0) {
      ttl.textContent = "Code expired";
      waiting.hidden = true;
      qrBox.classList.add("is-stale");
    } else {
      ttl.textContent = `Code valid for ${mmss(left)}`;
      waiting.hidden = false;
      qrBox.classList.remove("is-stale");
    }
  };
  tick();
  const timer = window.setInterval(tick, 1000);

  const phone = h(
    "div",
    { class: "pc-row pc-phone" },
    h("div", { class: "pc-h" }, h("b", null, "BCH wallet on your phone"), h("span", { class: "pc-sub" }, "Scan with Selene, Cashonize or Paytaca.")),
    h(
      "div",
      { class: "pc-pair" },
      qrBox,
      h(
        "div",
        { class: "pc-side" },
        waiting,
        ttl,
        h("div", { class: "pc-links" }, newCode, h("button", { type: "button", class: "link-btn", onclick: () => copyText(uri, "Pairing link copied") }, "Copy link")),
      ),
    ),
  );
  const computer = h(
    "div",
    { class: "pc-row pc-line" },
    h("div", { class: "pc-h" }, h("b", null, "Wallet on this computer"), h("span", { class: "pc-sub" }, "Opens through WizardConnect.")),
    deep,
  );
  const newbie = h(
    "details",
    { class: "pc-row pc-new" },
    h("summary", null, h("b", null, "New to Bitcoin Cash?"), ico("chevronDown", 16, 1.5, "ico pc-chev")),
    h(
      "div",
      { class: "pc-new-body" },
      h(
        "ol",
        null,
        h("li", null, "Install Selene or Paytaca on your phone."),
        h("li", null, "Add $1 of BCH from any exchange."),
        h("li", null, "Come back and scan the code above."),
      ),
      h("p", null, "10 cents is less than a text message. LaunchDesk never holds your keys."),
    ),
  );
  const example = opts.onExample
    ? h("button", { type: "button", class: "link-btn pc-example", onclick: opts.onExample }, "Try the free example instead")
    : null;
  const el = h("div", { class: "pay-connect" }, isHandheld() ? [computer, phone] : [phone, computer], newbie, example);
  if (isHandheld()) {
    deep.classList.add("primary");
    phone.classList.add("is-secondary");
  }
  return { el, dispose: () => clearInterval(timer) };
}

/** Standalone "Connect wallet" dialog (header button). */
export function openConnect() {
  if (walletState() === "ready") return;
  let view: ConnectView | null = null;
  const m = openModal({
    label: "Connect your wallet",
    className: "ld-pay",
    onClose: () => {
      view?.dispose();
      cancelPairing();
    },
  });
  view = connectView();
  m.body.append(
    h("div", { class: "lp-head" }, h("div", null, h("h2", { class: "lp-title" }, "Connect your wallet"), h("p", { class: "lp-lead" }, "Pair once. Each stage is then one tap in your wallet.")), closeButton(m.close)),
    h("div", { class: "lp-body" }, view.el, h("p", { class: "lp-foot" }, "LaunchDesk never holds your keys.")),
  );
  const off = onWallet((s) => {
    if (s === "ready") {
      play("coin");
      toast(`${walletName()} connected`, "ok");
      m.close();
    }
  });
  void m.closed.then(() => off());
}

// ---------- pay sheet ----------

type Cause = "declined" | "timeout" | "unseen" | "expired" | "other";
function causeOf(e: unknown): Cause {
  const msg = (e as Error)?.message ?? "";
  if (/reject|cancel|denied|declin|abort/i.test(msg)) return "declined";
  if (/no answer from your wallet/i.test(msg)) return "timeout";
  if (/quote expired/i.test(msg)) return "expired";
  // A rejected or invalid transaction is final: never offer "Check again" for it.
  if (/broadcast rejected|too small|not tagged|invalid transaction|already used/i.test(msg)) return "other";
  if (e instanceof ApiError && (e.status === 0 || e.status === 502 || e.status === 504)) return "unseen";
  if (/not found|timeout|did not answer|cannot reach|connection/i.test(msg)) return "unseen";
  return "other";
}

/** What openPay resolves with after a payment (contracts-v4.md). */
export type PayResult = {
  project: Project;
  /** Viewport rect of the success check (M7), for `office.coinFromRect(fromRect, "lobby")`. null if not measurable. */
  fromRect: DOMRect | null;
};

/** POST /pay with {watch:true} (F10). Sends the owner key (F3) itself: api.ts' PayBody has no `watch`. */
async function payWatch(id: string, body: { stage: Stage; watch: true; founderAddress?: string }): Promise<Project> {
  const key = ownerKey(id);
  let r: Response;
  try {
    r = await fetch(`/api/projects/${encodeURIComponent(id)}/pay`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { "x-owner-key": key } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Cannot reach the LaunchDesk server. Check your connection.", 0);
  }
  const data = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new ApiError(data.error || `Request failed (${r.status})`, r.status);
  return normalize(data as Project);
}

type TrackStep = { label: string };

/**
 * Opens the pay sheet for a stage. Resolves with {project, fromRect} once paid (and the stage
 * started), or null if the user closed it before paying. Owner: WS3. Signature frozen.
 */
export function openPay(project: Project, stage: Stage): Promise<PayResult | null> {
  const cents = app.config?.prices[stage] ?? (stage === "validate" ? 10 : 20);
  const price = fmtUsd(cents);
  const depts = STAGE_DEPTS[stage];
  const first = TEAM[depts[0]].name;
  const sample = !!app.config?.mockAi;
  const localTest = !sample && !!app.config?.devSkipPayment;
  const canQr = !sample && !!app.config?.merchantAddress;
  const abort = new AbortController();
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => (timers.delete(t), fn()), ms);
    timers.add(t);
    return t;
  };
  let result: PayResult | null = null;
  let offWallet: (() => void) | null = null;
  let connect: ConnectView | null = null;
  let mode: "wallet" | "qr" = "wallet";
  let busy = false; // a payment is in flight: no re-quotes, no mode switches
  let closed = false;

  const m: ModalHandle = openModal({
    label: stage === "validate" ? "Validate your idea" : "Build and launch",
    className: "ld-pay",
    onClose: () => {
      closed = true;
      abort.abort();
      offWallet?.();
      connect?.dispose();
      timers.forEach((t) => clearTimeout(t));
      clearInterval(clock);
      // F9: never leave a half-open WizardConnect pairing behind ("Key exchange timed out").
      cancelPairing();
    },
  });

  // ---- static rows ----
  const satsLine = h("span", { class: "lp-sats mono num" });
  const totalNum = h("span", { class: "lp-total-v num" }, price);
  const head = h(
    "div",
    { class: "lp-head" },
    h("div", { class: "lp-title-row" }, h("h2", { class: "lp-title" }, stage === "validate" ? "Validate your idea" : "Build and launch"), sample ? h("span", { class: "lp-tag" }, "Demo") : null),
    closeButton(m.close),
  );
  const lineItem = h(
    "div",
    { class: "lp-line" },
    avatarGroup([...depts], 28),
    h("span", { class: "lp-line-name" }, names(depts)),
    h("span", { class: "lp-line-v num" }, price),
  );
  const total = h(
    "div",
    { class: "lp-total" },
    h("div", { class: "lp-total-row" }, h("span", { class: "lp-total-l" }, "Total"), totalNum),
    h("div", { class: "lp-total-sub" }, satsLine),
    sample ? null : h("p", { class: "lp-cap" }, "Network fee under $0.01, set by your wallet."),
  );

  const segWallet = h("button", { type: "button", class: "lp-seg-b", role: "tab", "aria-selected": "true", onclick: () => setMode("wallet") }, "Connect wallet");
  const segQr = h("button", { type: "button", class: "lp-seg-b", role: "tab", "aria-selected": "false", onclick: () => setMode("qr") }, "Scan QR");
  const seg = canQr ? h("div", { class: "lp-seg", role: "tablist", "aria-label": "How to pay" }, segWallet, segQr) : null;
  const withArea = h("div", { class: "lp-with" });
  const action = h("div", { class: "lp-action", "aria-live": "polite" });
  const foot = h("p", { class: "lp-foot" }, sample ? "Demo server: no payment and no AI. You'll see a fixed sample." : "Paid straight from your wallet. LaunchDesk never holds your keys.");
  const devLink = localTest ? h("button", { type: "button", class: "link-btn lp-dev", onclick: () => void payDev() }, "Run without paying (local test)") : null;

  const body = h("div", { class: "lp-body" }, lineItem, total);
  if (sample) body.append(action, foot, howRealPaymentWorks());
  else body.append(seg ?? "", withArea, action, foot, devLink ?? "");
  m.body.append(head, body);

  // ---- quote + price clock ----
  let quote: Quote | null = null;
  let lastTx: string | null = null;
  const renderSats = () => {
    if (sample) {
      const s = approxSats(cents, app.config?.bchUsd ?? 0);
      satsLine.textContent = s ? `≈ ${fmtSats(s)} sats` : "";
      return;
    }
    if (!quote) return;
    const left = quote.expiresAt - Date.now();
    satsLine.textContent = `${fmtSats(quote.sats)} sats · price held for ${mmss(left)}`;
    if (left <= 0 && !busy && !requoting) void requote();
  };
  let requoting = false;
  const requote = async () => {
    requoting = true;
    try {
      quote = await api.quote(project.id, stage);
      if (quote.bchUsd > 0) toast(`New price: 1 BCH ≈ $${Math.round(quote.bchUsd)}`, "info");
      if (mode === "qr") renderQr();
    } catch {
      /* the button path fetches again before signing */
    } finally {
      requoting = false;
      renderSats();
    }
  };
  const clock = window.setInterval(renderSats, 1000);
  renderSats();

  // ---- small views ----
  const primary = (label: string, onclick: () => void, extra: Record<string, string> = {}) =>
    h("button", { type: "button", class: "btn primary lg block lp-cta", onclick, "data-autofocus": "", ...extra }, label);

  const errorView = (title: string, text: string, actions: Array<[string, () => void]>) => {
    busy = false;
    m.lock(false);
    action.replaceChildren(
      h(
        "div",
        { class: "lp-err", role: "alert" },
        ico("alert", 20, 1.6, "ico lp-err-i"),
        h("div", null, h("b", null, title), text ? h("p", null, text) : null),
      ),
      h(
        "div",
        { class: "lp-err-btns" },
        actions.map(([label, fn], i) => h("button", { type: "button", class: `btn ${i === 0 ? "primary" : ""} lg`, onclick: fn, "data-autofocus": i === 0 ? "" : null }, label)),
      ),
    );
    action.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
  };

  /** L29: the button area becomes a 3-step tracker. */
  const tracker = (steps: TrackStep[], active: number) =>
    h(
      "ol",
      { class: "lp-track" },
      steps.map((s, i) =>
        h(
          "li",
          { class: i < active ? "is-done" : i === active ? "is-now" : "" },
          h(
            "span",
            { class: "lp-tk-dot", "aria-hidden": "true" },
            i < active ? h("span", { class: "lp-tk-check", html: iconSvg("check", 12, 2.2) }) : i === active ? h("span", { class: "lp-spin" }) : null,
          ),
          h("span", { class: "lp-tk-l" }, s.label),
        ),
      ),
    );
  const walletSteps = (): TrackStep[] => [{ label: `Approve in ${walletName()}` }, { label: "Confirming on Bitcoin Cash" }, { label: `${first} starts` }];
  const track = (steps: TrackStep[], active: number) => {
    action.replaceChildren(tracker(steps, active));
    const done = [...action.querySelectorAll<SVGElement>(".lp-track li.is-done svg")].pop();
    if (done) void checkDraw(done);
  };

  // ---- M7 success beat ----
  const success = async (p: Project, kind: "paid" | "sample" | "local") => {
    busy = true;
    m.lock(true);
    const paid = p.payments[stage];
    const real = kind === "paid" && !!paid && paid.sats > 0;
    const mark = h("span", {
      class: `lp-ok ${real ? "" : "is-grey"}`,
      html: `<svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true"><circle class="lp-ok-ring" cx="28" cy="28" r="26.5" fill="none" stroke-width="3"/><circle class="lp-ok-fill" cx="28" cy="28" r="28"/><path class="lp-ok-check" d="M18 28.5l6.5 6.5L38.5 21" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    });
    const amount = h("span", { class: "lp-ok-amt num" }, real ? "$0.00" : price);
    const sub = h("span", { class: "lp-ok-sub mono num" });
    const tx = real && paid ? h("a", { class: "lp-ok-tx", href: explorerTx(paid.txid), target: "_blank", rel: "noopener" }, "View transaction ↗") : null;
    const title = kind === "paid" ? "Paid" : kind === "sample" ? "Sample run started" : "Local test started";
    action.replaceChildren(
      h(
        "div",
        { class: "lp-done" },
        mark,
        h("b", { class: "lp-ok-t" }, title),
        real ? amount : null,
        real ? sub : h("span", { class: "lp-ok-sub" }, kind === "local" ? "No payment was sent." : "Nothing was charged."),
        tx,
      ),
    );
    seg && (seg.hidden = true);
    body.querySelectorAll<HTMLElement>(".lp-foot, .lp-how, .lp-dev").forEach((e) => (e.hidden = true));
    withArea.hidden = true;
    if (devLink) devLink.hidden = true;
    const svgEl = mark.querySelector("svg")!;
    const ringEl = svgEl.querySelector<SVGCircleElement>(".lp-ok-ring")!;
    const fillEl = svgEl.querySelector<SVGCircleElement>(".lp-ok-fill")!;
    const checkEl = svgEl.querySelector<SVGPathElement>(".lp-ok-check")!;
    const rm = reduced();
    if (!rm) {
      const c = 2 * Math.PI * 26.5;
      ringEl.style.strokeDasharray = String(c);
      ringEl.animate([{ strokeDashoffset: c }, { strokeDashoffset: 0 }], { duration: DUR.d4, easing: EASE.out, fill: "both" });
      fillEl.animate([{ opacity: 0, transform: "scale(.9)" }, { opacity: 1, transform: "scale(1)" }], { duration: DUR.d2, delay: 300, easing: EASE.out, fill: "both" });
      checkEl.style.strokeDasharray = "30";
      checkEl.animate([{ strokeDashoffset: 30 }, { strokeDashoffset: 0 }], { duration: 240, delay: 300, easing: EASE.out, fill: "both" });
      tx?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.d2, delay: 500, fill: "both" });
    }
    if (real && paid) {
      void countUp(amount, paid.cents / 100, { ms: 600, decimals: 2, prefix: "$" });
      void countUp(sub, paid.sats, { ms: 600, suffix: " sats · paid" });
    }
    // Coin sound at the end of the check stroke (M14).
    later(() => play(real ? "coin" : "start"), rm ? 0 : 540);
    result = { project: p, fromRect: null };
    // The stage starts while the beat plays; the run endpoint is idempotent.
    void api.run(project.id, stage).catch(() => {});
    await new Promise<void>((r) => later(r, rm ? 600 : 1400));
    if (closed) return;
    result.fromRect = mark.getBoundingClientRect();
    // Hand-off: the sheet steps back (.96 + fade 220ms ease-in); the caller flies the coin to the lobby.
    if (!rm) await m.body.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(.96)", opacity: 0 }], { duration: DUR.d2, easing: EASE.in, fill: "forwards" }).finished.catch(() => {});
    m.lock(false);
    m.close();
  };

  // ---- founder address (build stage) ----
  const founder = () => {
    if (stage !== "build") return undefined;
    try {
      return receiveAddress();
    } catch {
      return undefined;
    }
  };

  // ---- wallet path ----
  /** Sends a signed tx to the server. Safe to repeat with the same tx: it can only be paid once. */
  const submit = async (txHex: string, attempt = 0): Promise<void> => {
    track(walletSteps(), 1);
    m.lock(true);
    try {
      const p = await api.pay(project.id, { stage, txHex, founderAddress: founder() });
      track(walletSteps(), 2);
      await success(p, "paid");
    } catch (e) {
      if (abort.signal.aborted) return;
      const cause = causeOf(e);
      if (cause === "unseen" && attempt < 15) {
        // L32: keep polling; the same signed tx can only ever be charged once.
        action.replaceChildren(
          tracker(walletSteps(), 1),
          h("p", { class: "lp-note" }, "Payment seen, waiting for confirmation. You won't be charged twice."),
        );
        later(() => void submit(txHex, attempt + 1), SEEN_POLL_MS);
        return;
      }
      showPayError(e);
    }
  };

  const showPayError = (e: unknown) => {
    const cause = causeOf(e);
    if (cause === "declined") return errorView("Your wallet declined.", "Nothing was sent.", [["Try again", () => void payNow()]]);
    if (cause === "timeout")
      return errorView("No answer from your wallet in 60 s.", "Check your phone, then send the request again.", [
        ["Send again", () => void payNow()],
        ...(canQr ? ([["Show QR instead", () => setMode("qr")]] as Array<[string, () => void]>) : []),
      ]);
    if (cause === "unseen" && lastTx)
      return errorView("Payment seen, waiting for confirmation.", "You won't be charged twice.", [
        ["Check again", () => void submit(lastTx!)],
        ["Start over", () => ((lastTx = null), renderWallet())],
      ]);
    if (cause === "expired") return errorView("The price expired.", "Nothing was charged. We'll fetch a fresh BCH price.", [["Get a new price", () => ((lastTx = null), void payNow(true))]]);
    errorView("Payment not completed.", `${(e as Error)?.message || "Something went wrong."} Nothing was charged.`, [["Try again", () => ((lastTx = null), void payNow(true))]]);
  };

  let attemptCtl: AbortController | null = null;
  const payNow = async (fresh = false) => {
    busy = true;
    try {
      // Quotes live 15 minutes: never ask the wallet to sign a price the server will refuse.
      if (fresh || !quote || quote.expiresAt - Date.now() < 60_000) quote = await api.quote(project.id, stage);
      renderSats();
    } catch {
      return errorView("Couldn't fetch the live BCH price.", "Nothing was charged.", [["Try again", () => void payNow(true)]]);
    }
    track(walletSteps(), 0);
    attemptCtl?.abort();
    const ctl = (attemptCtl = new AbortController());
    const onAbort = () => ctl.abort();
    abort.signal.addEventListener("abort", onAbort, { once: true });
    const q = quote;
    try {
      const signing = payWithWallet(q.address, q.sats, q.tag, `LaunchDesk · ${stage === "validate" ? "Validate" : "Build"} · ${fmtUsd(q.cents)}`, ctl.signal);
      const timeout = new Promise<never>((_, ko) => later(() => ko(new Error("No answer from your wallet in 60 s.")), WALLET_TIMEOUT_MS));
      lastTx = await Promise.race([signing, timeout]);
      if (abort.signal.aborted) return;
    } catch (e) {
      ctl.abort();
      if (abort.signal.aborted) return;
      return showPayError(e);
    } finally {
      abort.signal.removeEventListener("abort", onAbort);
    }
    await submit(lastTx);
  };

  async function payDev() {
    busy = true;
    m.lock(true);
    const label = sample ? "Starting the sample run" : "Recording local test";
    action.replaceChildren(h("button", { type: "button", class: "btn primary lg block lp-cta is-busy", disabled: true }, h("span", { class: "lp-spin is-light" }), label));
    try {
      // Without a wallet the merchant address stands in, and the generated site is marked as a demo page.
      const fa = founder() ?? (stage === "build" ? app.config?.merchantAddress || undefined : undefined);
      const p = await api.pay(project.id, { stage, dev: true, founderAddress: fa });
      await success(p, sample ? "sample" : "local");
    } catch (e) {
      if (abort.signal.aborted) return;
      errorView(sample ? "Couldn't start the sample run." : "Local test failed.", (e as Error).message, [["Try again", () => void payDev()]]);
      if (sample) renderSampleCta(false);
    }
  }

  // ---- "Pay with" row / connect view ----
  const renderWallet = () => {
    offWallet?.();
    offWallet = null;
    connect?.dispose();
    connect = null;
    busy = false;
    const s = walletState();
    if (s === "ready") {
      withArea.replaceChildren(
        h(
          "div",
          { class: "lp-paywith" },
          h("span", { class: "lp-pw-l" }, "Pay with"),
          h("span", { class: "lp-wallet" }, h("span", { class: "lp-wallet-i", "aria-hidden": "true", html: iconSvg("wallet", 16) }), h("b", null, walletName())),
          h(
            "button",
            {
              type: "button",
              class: "link-btn",
              onclick: async () => {
                await disconnect();
                renderWallet();
              },
            },
            "Change",
          ),
        ),
        stage === "build" ? h("p", { class: "lp-cap" }, "Pre-orders from your new page will go to this wallet too.") : "",
      );
      action.replaceChildren(primary(`Pay ${price} with BCH`, () => void payNow()));
      offWallet = onWallet((st) => st !== "ready" && renderWallet());
      return;
    }
    if (s === "connecting") {
      withArea.replaceChildren(h("div", { class: "lp-paywith" }, h("span", { class: "lp-spin" }), h("span", null, "Reconnecting to your wallet…")));
      action.replaceChildren(h("button", { type: "button", class: "btn primary lg block lp-cta", disabled: true }, `Pay ${price} with BCH`));
      const t = later(() => walletState() !== "ready" && showConnect(), 9000);
      offWallet = onWallet((st) => {
        if (st === "ready") {
          clearTimeout(t);
          renderWallet();
        }
      });
      return;
    }
    showConnect();
  };

  const showConnect = () => {
    connect?.dispose();
    connect = connectView({ onExample: () => (m.close(), location.assign("/p/example")) });
    withArea.replaceChildren(connect.el);
    action.replaceChildren(h("button", { type: "button", class: "btn primary lg block lp-cta", disabled: true, title: "Connect a wallet first" }, `Pay ${price} with BCH`));
    offWallet?.();
    offWallet = onWallet((st) => {
      if (st === "ready") {
        play("tap");
        renderWallet();
        action.querySelector<HTMLElement>(".lp-cta")?.focus({ preventScroll: true });
      }
    });
  };

  // ---- QR path (F10) ----
  const founderInput =
    stage === "build"
      ? h("input", {
          class: "lp-input mono",
          type: "text",
          inputmode: "text",
          autocomplete: "off",
          spellcheck: "false",
          placeholder: "bitcoincash:q…",
          "aria-label": "Your Bitcoin Cash address for pre-orders",
        })
      : null;
  let qrPolling = false;
  const renderQr = () => {
    connect?.dispose();
    connect = null;
    cancelPairing(); // F9: the QR path needs no WizardConnect session
    offWallet?.();
    offWallet = null;
    if (!quote) {
      withArea.replaceChildren(h("div", { class: "lp-paywith" }, h("span", { class: "lp-spin" }), h("span", null, "Getting a live price…")));
      action.replaceChildren();
      void api
        .quote(project.id, stage)
        .then((q) => {
          quote = q;
          renderSats();
          if (mode === "qr") renderQr();
        })
        .catch(() => errorView("Couldn't fetch the live BCH price.", "Nothing was charged.", [["Try again", () => renderQr()]]));
      return;
    }
    const amount = (quote.bip21.match(/amount=([\d.]+)/)?.[1] ?? "").trim();
    withArea.replaceChildren(
      h(
        "div",
        { class: "lp-qr" },
        h("div", { class: "lp-qr-code well", html: qrSvg(quote.bip21, { size: 176, label: "Bitcoin Cash payment QR" }) }),
        h(
          "div",
          { class: "lp-qr-side" },
          h("span", { class: "lp-qr-l" }, "Send exactly"),
          h("b", { class: "lp-qr-amt mono num" }, `${amount} BCH`),
          h("p", { class: "lp-cap" }, "The last digits identify your payment. Any BCH wallet works."),
          h(
            "div",
            { class: "pc-links" },
            h("button", { type: "button", class: "link-btn", onclick: () => copyText(quote!.address, "Address copied") }, "Copy address"),
            h("a", { class: "link-btn", href: quote.bip21 }, "Open in wallet"),
          ),
        ),
      ),
      founderInput
        ? h(
            "label",
            { class: "lp-field" },
            h("span", null, "Your BCH address for pre-orders"),
            founderInput,
            h("small", null, "Customers' pre-orders from your page go straight here."),
          )
        : "",
    );
    action.replaceChildren(h("p", { class: "lp-wait" }, h("span", { class: "lp-spin" }), "Waiting for payment… we usually see it in about 2 seconds."));
    if (!qrPolling) void pollQr();
  };
  const pollQr = async () => {
    qrPolling = true;
    while (!closed && mode === "qr" && !result) {
      const fa = founderInput?.value.trim();
      if (stage === "validate" || fa) {
        try {
          const p = await payWatch(project.id, { stage, watch: true, founderAddress: fa || undefined });
          if (p.payments[stage]) {
            track([{ label: "Payment received" }, { label: "Confirming on Bitcoin Cash" }, { label: `${first} starts` }], 2);
            await success(p, "paid");
            break;
          }
        } catch (e) {
          const status = e instanceof ApiError ? e.status : 0;
          if (status === 400 && founderInput && /address/i.test((e as Error).message)) {
            founderInput.setCustomValidity((e as Error).message);
            founderInput.reportValidity();
          } else if (status && status !== 502 && status !== 504) {
            errorView("We couldn't check this payment.", (e as Error).message, [["Try again", () => renderQr()]]);
            break;
          }
        }
      }
      await new Promise((r) => later(() => r(null), QR_POLL_MS));
    }
    qrPolling = false;
  };
  founderInput?.addEventListener("input", () => founderInput.setCustomValidity(""));

  const setMode = (next: "wallet" | "qr") => {
    if (busy && next === mode) return;
    if (busy) {
      attemptCtl?.abort();
      busy = false;
    }
    mode = next;
    segWallet.setAttribute("aria-selected", String(next === "wallet"));
    segQr.setAttribute("aria-selected", String(next === "qr"));
    seg?.style.setProperty("--seg-x", next === "qr" ? "100%" : "0%");
    if (next === "qr") renderQr();
    else renderWallet();
  };

  // ---- demo (L31) ----
  function renderSampleCta(focus = true) {
    action.replaceChildren(primary("Watch a sample run", () => void payDev()));
    if (focus) requestAnimationFrame(() => action.querySelector<HTMLElement>(".lp-cta")?.focus({ preventScroll: true }));
  }
  function howRealPaymentWorks() {
    return h(
      "details",
      { class: "lp-how" },
      h("summary", null, "How real payment works", ico("chevronDown", 16, 1.5, "ico pc-chev")),
      h(
        "div",
        { class: "lp-how-body", "aria-hidden": "true" },
        h("div", { class: "lp-how-qr well", html: qrSvg("LaunchDesk demo: no real payment", { size: 96, label: "Example QR" }) }),
        h(
          "ol",
          null,
          h("li", null, "Pair a BCH wallet once"),
          h("li", null, `Approve ${price} in your wallet`),
          h("li", null, `${first} starts the moment it's on-chain`),
        ),
      ),
    );
  }

  // ---- go ----
  if (sample) {
    renderSampleCta();
  } else {
    void (async () => {
      try {
        quote = await api.quote(project.id, stage);
        renderSats();
      } catch {
        satsLine.textContent = "Live price unavailable";
      }
      if (!closed) renderWallet();
    })();
    withArea.replaceChildren(h("div", { class: "lp-paywith" }, h("span", { class: "lp-spin" }), h("span", null, "Getting a live price…")));
    action.replaceChildren(h("button", { type: "button", class: "btn primary lg block lp-cta", disabled: true }, `Pay ${price} with BCH`));
  }
  play("open");

  return m.closed.then(() => result);
}
