// v7 live · The real pay card (WizardConnect). Same .pay surface as the prototype; the slot under the amount runs:
// connect (QR + "Open wallet") → exact BCH from /quote → the wallet signs → POST /pay (the server checks the
// OP_RETURN tag "LD1:<id>:<stage>" and broadcasts) → confirmed + "View on explorer". Locally with DEV_SKIP_PAYMENT a
// dev-only "Run without paying" link stays; on a MOCK_AI server the card says so and starts the sample run.
import "./live.css";
import { api, ApiError } from "../../src/api";
import { explorerTx } from "../../src/explorer";
import type { AppConfig, Quote, Stage } from "../../src/types";
import { cancelPairing, newPairing, onWallet, pair, payWithWallet, receiveAddress, resume, walletName, walletState } from "../../src/wallet";
import { esc } from "../ui/dom";
import { ownerKey } from "../../src/app/projects";
import { centsOf, launchNoteHtml } from "../prices";

/**
 * VITE_ESCROW=1 (default off): "Pay only if it delivers". The wallet pays a per-order safe address (a Bitcoin Cash
 * contract) instead of LaunchDesk; the quote is asked with the wallet's own address so a refund can go back there.
 * Needs ESCROW=1 on the server (see .notes/next/escrow.md). With the flag off nothing below changes.
 */
export const ESCROW = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_ESCROW === "1";
/** Only the report (validate) is held in the contract (server/escrow/watch.ts ESCROW_STAGES); the launch kit is a
 *  plain payment to LaunchDesk, so its card must never claim otherwise. */
export const heldInContract = (stage: Stage) => ESCROW && stage === "validate";
// The "Proof on Bitcoin Cash" panel is started by ui/index.ts (it also shows the finished example's real proof).
async function escrowQuote(projectId: string, stage: Stage): Promise<Quote> {
  let refundAddress: string | undefined;
  try {
    refundAddress = receiveAddress();
  } catch {
    refundAddress = undefined;
  }
  if (!refundAddress) throw new Error("Connect your wallet first.");
  const key = ownerKey(projectId);
  let r: Response;
  try {
    r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/quote`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { "x-owner-key": key } : {}) },
      body: JSON.stringify({ stage, refundAddress }),
    });
  } catch {
    throw new ApiError("Cannot reach the LaunchDesk server. Check your connection.", 0);
  }
  const data = (await r.json().catch(() => ({}))) as Quote & { error?: string };
  if (!r.ok) throw new ApiError(data.error || `Request failed (${r.status})`, r.status);
  return data;
}

const WALLET_TIMEOUT_MS = 90_000;
let resumed = false;

export interface PayDeps {
  projectId: string;
  stage: Stage;
  config: AppConfig | null;
  /** Called once the payment is accepted and the stage was started. */
  onPaid(p: { txid: string | null; sats: number }): void;
}

const fmtSats = (n: number) => n.toLocaleString("en-US");
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

type Cause = "declined" | "funds" | "expired" | "timeout" | "unseen" | "other";
function causeOf(e: unknown): Cause {
  const m = (e as Error)?.message ?? "";
  if (/reject|cancel|denied|declin|abort/i.test(m)) return "declined";
  if (/not enough bch|insufficient/i.test(m)) return "funds";
  if (/quote expired|price quote expired/i.test(m)) return "expired";
  if (/no answer from your wallet/i.test(m)) return "timeout";
  if (/broadcast rejected|too small|not tagged|invalid transaction|already used/i.test(m)) return "other";
  if (e instanceof ApiError && (e.status === 0 || e.status === 502 || e.status === 504)) return "unseen";
  return "other";
}

/** Static markup for the live pay card (mounted by ui/index.ts, then driven by mountPay). */
export function livePayHtml(stage: Stage, cents: number, avatars: string, title: string, line: string, mock: boolean, merchant: string): string {
  return `
  <section class="pay pay-live">
    <header class="pay-top" data-st><span class="pay-merchant">${merchant}<b>LaunchDesk</b></span><span class="tag${mock ? " tag-demo" : ""}">${mock ? "Sample data" : "Bitcoin Cash · mainnet"}</span></header>
    <div class="pay-amount" data-st><b class="huge">${usd(cents)}</b><span class="pl-sats">in Bitcoin Cash</span></div>
    ${launchNoteHtml("pay-launch")}
    <div class="pay-line" data-st><div class="pay-avs">${avatars}</div><div><b>${esc(title)}</b><span>${esc(line)}</span></div></div>
    <div class="pl-slot" data-st aria-live="polite"></div>
    <p class="pay-foot pl-foot" data-st>${mock ? "This server runs sample AI data. Nothing is charged." : heldInContract(stage) ? "Your payment waits in a Bitcoin Cash contract. If the report isn't delivered, it comes back to you about an hour after your payment confirms (6 blocks)." : stage === "validate" ? "You get a report. Building is a second step." : ESCROW ? "Paid from your wallet straight to LaunchDesk (not held in a contract). LaunchDesk never holds your keys." : "Paid from your wallet. LaunchDesk never holds your keys."}</p>
  </section>`;
}

export function mountPay(root: HTMLElement, d: PayDeps): () => void {
  const slot = root.querySelector<HTMLElement>(".pl-slot")!;
  const satsEl = root.querySelector<HTMLElement>(".pl-sats")!;
  const cents = d.config?.prices[d.stage] ?? centsOf(d.stage);
  const mock = !!d.config?.mockAi;
  const devOk = !mock && !!d.config?.devSkipPayment;
  let quote: Quote | null = null;
  let disposed = false;
  let busy = false;
  let lastTx: string | null = null;
  let ctl: AbortController | null = null;
  const timers: number[] = [];
  const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
  const approx = d.config?.bchUsd ? Math.round((cents / 100 / d.config.bchUsd) * 1e8) : 0;
  satsEl.textContent = approx ? `≈ ${fmtSats(approx)} sats in Bitcoin Cash` : "in Bitcoin Cash";

  const clock = window.setInterval(() => {
    if (!quote || disposed) return;
    const left = quote.expiresAt - Date.now();
    satsEl.textContent = `${fmtSats(quote.sats)} sats · price held ${mmss(left)}`;
  }, 1000);

  const set = (html: string) => {
    if (!disposed) slot.innerHTML = html;
  };
  const btn = (act: string, label: string, primary = true) =>
    `<button class="btn ${primary ? "btn-primary" : "btn-ghost"} btn-pay" type="button" data-pl="${act}"><span class="b-lbl">${esc(label)}</span><span class="spin" aria-hidden="true"></span></button>`;
  const dev = () => (devOk ? `<button type="button" class="v-link pl-dev" data-pl="dev">Run without paying (local test)</button>` : "");

  function render() {
    if (disposed || busy) return;
    // GET /api/config paused:true: the server takes no payments right now. Never show a way to pay.
    if ((d.config as (AppConfig & { paused?: boolean }) | null)?.paused)
      return set(`<div class="pl-err pl-paused" role="status"><b>New runs are paused for a little while.</b><span>Nothing can be paid right now, so nothing will be charged.</span></div><button class="btn btn-primary btn-pay" type="button" data-act="example"><span class="b-lbl">See a finished company</span></button>`);
    if (mock) return set(`${btn("dev", d.stage === "validate" ? "Start the sample run" : "Start the sample build")}`);
    const s = walletState();
    if (s === "ready")
      return set(`<div class="pl-with"><span>Pay with</span><b>${esc(walletName())}</b><button type="button" class="v-link" data-pl="change">Change</button></div>${btn("pay", `Pay ${usd(cents)}`)}${dev()}`);
    if (s === "connecting") {
      later(() => walletState() === "connecting" && (cancelPairing(), render()), 9000);
      return set(`<div class="pl-with"><span class="pl-spin"></span><span>Reconnecting to your wallet</span></div>${dev()}`);
    }
    if (s === "pairing") return code(pair);
    set(`${btn("connect", "Connect wallet")}<p class="pl-hint">WizardConnect · tested with Selene</p>${dev()}`);
  }
  // pair()/newPairing() emit "pairing" before their code exists: the wallet listener must not re-enter them.
  let pairing = false;
  const code = (fn: () => { uri: string; qrSvg: string }) => {
    pairing = true;
    try {
      return showQr(fn());
    } catch (e) {
      fail("Couldn't open WizardConnect.", (e as Error)?.message || "Try again in a moment.", "Try again", "connect");
    } finally {
      pairing = false;
    }
  };
  function showQr(p: { uri: string; qrSvg: string }) {
    set(`<div class="pl-qr"><div class="pl-code">${p.qrSvg}</div>
      <div class="pl-qr-t"><b>Scan with your BCH wallet</b><span>Or open it on this device.</span>
        <a class="btn btn-primary pl-open" href="${esc(p.uri)}">Open wallet</a>
        <button type="button" class="v-link" data-pl="newcode">New code</button></div></div>${dev()}`);
  }
  function track(i: number) {
    const steps = [`Approve in ${walletName()}`, heldInContract(d.stage) ? "Waiting in the Bitcoin Cash contract" : "Confirming on Bitcoin Cash", "Your team starts"];
    set(`<ol class="pl-track">${steps.map((s, j) => `<li data-s="${j < i ? "done" : j === i ? "now" : ""}"><i></i><span>${esc(s)}</span></li>`).join("")}</ol>`);
  }
  function fail(title: string, text: string, again: string, act = "pay") {
    busy = false;
    set(`<div class="pl-err" role="alert"><b>${esc(title)}</b><span>${esc(text)}</span></div>${btn(act, again)}${dev()}`);
  }
  function showError(e: unknown) {
    const c = causeOf(e);
    if (c === "declined") return fail("Your wallet declined.", "Nothing was sent.", "Try again");
    if (c === "funds") return fail("Not enough BCH in this wallet.", `You need ${quote ? fmtSats(quote.sats) : "a few thousand"} sats plus a tiny fee.`, "Try again");
    if (c === "expired") return fail("The price expired.", "Nothing was charged. We fetch a fresh BCH price.", "Get a new price", "fresh");
    if (c === "timeout") return fail("No answer from your wallet.", "Check your phone, then send the request again.", "Send again");
    if (c === "unseen" && lastTx) return fail("Payment sent, waiting for the network.", "You won't be charged twice.", "Check again", "resubmit");
    fail("Payment not completed.", `${(e as Error)?.message || "Something went wrong."} Nothing was charged.`, "Try again", "fresh");
  }
  function success(txid: string | null, sats: number) {
    busy = true;
    const real = !!txid && !txid.startsWith("dev-") && sats > 0;
    set(`<div class="pl-ok"><span class="pl-tick"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
      <div><b>${real ? (heldInContract(d.stage) ? `Your ${usd(cents)} is locked in a Bitcoin Cash contract, not paid yet.` : "Paid") : mock ? "Sample run started" : "Local test started"}</b><span>${real ? (heldInContract(d.stage) ? `It is released only when your report is delivered. ${fmtSats(sats)} sats.` : `${fmtSats(sats)} sats · confirmed by LaunchDesk`) : "No payment was sent."}</span></div>
      ${real && txid ? `<a class="pl-tx" href="${esc(explorerTx(txid))}" target="_blank" rel="noopener noreferrer">View on explorer ↗</a>` : ""}</div>`);
    void api.run(d.projectId, d.stage).catch(() => {});
    later(() => !disposed && d.onPaid({ txid, sats }), real ? 1600 : 900);
  }

  const founder = () => {
    if (d.stage !== "build") return undefined;
    try {
      return receiveAddress();
    } catch {
      return undefined;
    }
  };
  async function submit(txHex: string, attempt = 0): Promise<void> {
    track(1);
    try {
      const p = await api.pay(d.projectId, { stage: d.stage, txHex, founderAddress: founder() });
      const paid = p.payments[d.stage];
      track(2);
      success(paid?.txid ?? null, paid?.sats ?? 0);
    } catch (e) {
      if (disposed) return;
      if (causeOf(e) === "unseen" && attempt < 12) return void later(() => void submit(txHex, attempt + 1), 4000);
      showError(e);
    }
  }
  async function payNow(fresh = false) {
    busy = true;
    try {
      if (fresh || !quote || quote.expiresAt - Date.now() < 60_000) quote = heldInContract(d.stage) ? await escrowQuote(d.projectId, d.stage) : await api.quote(d.projectId, d.stage);
    } catch (e) {
      busy = false;
      return fail("Couldn't get the live BCH price.", (e as Error).message || "Nothing was charged.", "Try again", "fresh");
    }
    track(0);
    ctl?.abort();
    ctl = new AbortController();
    const q = quote;
    // A quote keeps the price it was made at (server/pricing.ts): the card shows what the wallet is asked for.
    const amt = root.querySelector<HTMLElement>(".pay-amount .huge");
    if (amt && q.cents > 0 && amt.textContent !== usd(q.cents)) amt.textContent = usd(q.cents);
    try {
      const signing = payWithWallet(q.address, q.sats, q.tag, `LaunchDesk · ${d.stage === "validate" ? "Validate" : "Build"} · ${usd(q.cents)}`, ctl.signal);
      const timeout = new Promise<never>((_, ko) => later(() => ko(new Error("No answer from your wallet")), WALLET_TIMEOUT_MS));
      lastTx = await Promise.race([signing, timeout]);
    } catch (e) {
      ctl.abort();
      if (disposed) return;
      return showError(e);
    }
    if (disposed) return;
    await submit(lastTx);
  }
  async function payDev() {
    busy = true;
    set(`<button class="btn btn-primary btn-pay" type="button" data-state="busy" disabled><span class="b-lbl">Starting</span><span class="spin"></span></button>`);
    try {
      const fa = founder() ?? (d.stage === "build" ? d.config?.merchantAddress || undefined : undefined);
      const p = await api.pay(d.projectId, { stage: d.stage, dev: true, founderAddress: fa });
      const paid = p.payments[d.stage];
      success(paid?.txid ?? null, 0);
    } catch (e) {
      busy = false;
      fail(mock ? "Couldn't start the sample run." : "Local test failed.", (e as Error).message, "Try again", "dev");
    }
  }

  slot.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-pl]");
    if (!t) return;
    const a = t.dataset.pl;
    if (a === "connect") return code(pair);
    if (a === "newcode") return code(newPairing);
    if (a === "change") return void import("../../src/wallet").then((w) => w.disconnect()).then(render);
    if (a === "pay") return void payNow();
    if (a === "fresh") return void ((lastTx = null), payNow(true));
    if (a === "resubmit") return void (lastTx && submit(lastTx));
    if (a === "dev") return void payDev();
  });
  const off = onWallet(() => !busy && !pairing && render());
  if (!mock && !resumed) {
    resumed = true;
    resume();
  }
  render();
  return () => {
    disposed = true;
    off();
    ctl?.abort();
    clearInterval(clock);
    timers.forEach(clearTimeout);
    if (walletState() === "pairing") cancelPairing();
  };
}
