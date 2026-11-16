// "Proof on Bitcoin Cash" (started by ui/index.ts). A small panel at the end of the live report
// (/p/:id) that shows what the payment contract did:
//   released  the report's fingerprint (SHA-256 of the exact report data), a link to the release transaction on a
//             block explorer, a "Check it" button that re-hashes the report in this browser, and how to check it
//             yourself with any SHA-256 tool.
//   funded    "your payment is waiting in the contract" (polls until it is released or refunded).
//   refunded  "your payment came back to your wallet" + the refund transaction.
// It mounts itself next to the report (a MutationObserver), so no other screen needs to know about it.
// Live runs: only with VITE_ESCROW=1 (GET /api/escrow/:id/validate). The finished examples (ui/example.ts) always
// show their real mainnet proof from the server's snapshot (GET /api/examples/:id/proof), escrow flag or not.
import "./escrow-proof.css";
import { esc } from "./dom";
import { exampleOf, examples } from "./example";
import { ownerKey } from "../../src/app/projects";

type Status = {
  state: "quoted" | "funded" | "released" | "refunded";
  sats: number | null;
  fundingTxid?: string | null;
  fundingUrl?: string | null;
  fundedAt?: number;
  cents?: number | null;
  releasedSats?: number;
  releaseTxid: string | null;
  refundTxid: string | null;
  reportHash: string | null;
  releaseUrl: string | null;
  refundUrl: string | null;
  /** Public values to refund with no LaunchDesk server (contracts/refund-offline.ts); refundAddress only for the owner. */
  refundDetails?: {
    project: string; ref: string; network: string; contractAddress: string; merchantAddress: string; refundAddress: string | null;
    releasePk: string; oraclePk: string; timeoutBlocks: number; funding: string | null;
  };
};

const projectId = () => /^\/p\/([A-Za-z0-9_-]{4,40})\/?$/.exec(location.pathname)?.[1] ?? null;
const ESCROW = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_ESCROW === "1";
const isExample = (id: string) => !!exampleOf(id)?.proof;
const base = (id: string) => (isExample(id) ? `/api/examples/${encodeURIComponent(id)}/proof` : `/api/escrow/${encodeURIComponent(id)}/validate`);
const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const n = (x: number) => x.toLocaleString("en-US");
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-8)}`;

let status: Status | null = null;
let forId: string | null = null;
let poll: number | null = null;
let loading = false;

async function load(id: string) {
  if (loading) return;
  loading = true;
  try {
    const key = isExample(id) ? null : ownerKey(id);
    const r = await fetch(base(id), { cache: "no-store", headers: key ? { "x-owner-key": key } : {} });
    status = r.ok ? ((await r.json()) as Status) : null;
  } catch {
    /* keep what we had */
  } finally {
    loading = false;
  }
  forId = id;
  if (poll) clearTimeout(poll);
  poll = status?.state === "funded" ? window.setTimeout(() => void load(id).then(paint), 15_000) : null;
}

function html(id: string, s: Status): string {
  const link = (url: string | null, label: string) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : "");
  if (s.state === "refunded")
    return `<h3>Your payment came back to your wallet</h3>
      <p>The report wasn't delivered in time, so the Bitcoin Cash contract sent your payment back by itself.</p>
      <p class="ep-links">${link(s.refundUrl, "See the refund")}</p>`;
  if (isExample(id) && s.state === "released" && s.reportHash)
    return `<h3>Proof on Bitcoin Cash</h3>
    <p>This report was paid for with real money: <b>${s.cents ? `$${(s.cents / 100).toFixed(2)} ` : ""}in Bitcoin Cash</b> (${n(s.sats ?? 0)} sats) went into a contract on mainnet${s.fundedAt ? ` on ${esc(day(s.fundedAt))}` : ""}. The contract paid LaunchDesk only when the report was delivered, and that payment wrote the report's fingerprint on chain. If anyone changes a single letter of the report, the fingerprint no longer matches.</p>
    <ol class="ep-steps">
      <li><span>1</span><div><b>Paid into the contract</b>${s.fundingUrl ? `<a href="${esc(s.fundingUrl)}" target="_blank" rel="noopener noreferrer"><code>${esc(short(s.fundingTxid ?? ""))}</code> ↗</a>` : ""}</div></li>
      <li><span>2</span><div><b>Released when the report was delivered</b>${s.releaseUrl ? `<a href="${esc(s.releaseUrl)}" target="_blank" rel="noopener noreferrer"><code>${esc(short(s.releaseTxid ?? ""))}</code> ↗</a>` : ""}</div></li>
    </ol>
    <div class="ep-fp"><span>Report fingerprint</span><code title="${esc(s.reportHash)}">${esc(s.reportHash)}</code></div>
    <p class="ep-links"><button type="button" class="btn btn-primary ep-check"><span>Check it</span></button><span class="ep-out" aria-live="polite"></span></p>
    <details class="ep-how"><summary>Check it yourself</summary>
      <ol>
        <li><a href="${esc(base(id))}/report" download="launchdesk-report.json">Download the report data</a> (the exact text that was fingerprinted).</li>
        <li>Get its SHA-256 with any tool. On a Mac or Linux: <code>shasum -a 256 launchdesk-report.json</code>. On Windows: <code>certutil -hashfile launchdesk-report.json SHA256</code>.</li>
        <li>The result should be <code>${esc(short(s.reportHash))}</code> (the full fingerprint above).</li>
        <li>Open the release record. Its last output (OP_RETURN) holds <code>4c4431</code> (“LD1”) followed by the same fingerprint.</li>
      </ol>
    </details>`;
  if (s.state !== "released" || !s.reportHash)
    return `<h3>Your payment is waiting in a contract</h3>
      <p>It goes to LaunchDesk only once this report is recorded on Bitcoin Cash. This usually takes a few seconds.</p>
      ${s.refundDetails?.funding ? `<details class="ep-how"><summary>If LaunchDesk goes offline</summary>
        <p>About an hour after your payment confirms (${n(s.refundDetails.timeoutBlocks)} blocks), the contract lets anyone send the money back to your wallet, with no key. Our server does this by itself. If it is down, these details let anyone rebuild the refund with the open-source script <code>contracts/refund-offline.ts</code>.</p>
        <p class="ep-links"><button type="button" class="v-link ep-refund">Download refund details</button></p>
      </details>` : ""}`;
  return `<h3>Proof on Bitcoin Cash</h3>
    <p>When this report was delivered, its fingerprint was written into a public Bitcoin Cash transaction. If anyone changes a single letter of the report, the fingerprint no longer matches.</p>
    <div class="ep-fp"><span>Report fingerprint</span><code title="${esc(s.reportHash)}">${esc(s.reportHash)}</code></div>
    <p class="ep-links">${link(s.releaseUrl, "See the record")}<button type="button" class="v-link ep-check">Check it</button><span class="ep-out" aria-live="polite"></span></p>
    <details class="ep-how"><summary>Check it yourself</summary>
      <ol>
        <li><a href="${esc(base(id))}/report" download="launchdesk-report.json">Download the report data</a> (the exact text that was fingerprinted).</li>
        <li>Get its SHA-256 with any tool. On a Mac or Linux: <code>shasum -a 256 launchdesk-report.json</code>. On Windows: <code>certutil -hashfile launchdesk-report.json SHA256</code>.</li>
        <li>The result should be <code>${esc(short(s.reportHash))}</code> (the full fingerprint above).</li>
        <li>Open the record. Its last output (OP_RETURN) holds <code>4c4431</code> (“LD1”) followed by the same fingerprint.</li>
      </ol>
      <p>The PDF is a printout of this page, so its own fingerprint differs: check the report data instead.</p>
    </details>`;
}

async function check(id: string, out: HTMLElement) {
  out.textContent = "Checking…";
  out.dataset.ok = "";
  try {
    const bytes = await (await fetch(`${base(id)}/report`, { cache: "no-store" })).arrayBuffer();
    const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const ok = hex === status?.reportHash;
    out.dataset.ok = ok ? "yes" : "no";
    out.textContent = ok ? "Match: this is exactly the report that was recorded." : "No match. The report data differs from the record.";
  } catch {
    out.textContent = "Couldn't check right now. Try again in a moment.";
  }
}

/** A small text file with the order's public values and the exact command that rebuilds the refund offline. */
function downloadRefund(d: NonNullable<Status["refundDetails"]>) {
  const refund = d.refundAddress ?? "<your wallet's bitcoincash: address>";
  const cmd = `npx tsx contracts/refund-offline.ts --project ${d.project} --refund ${refund} --funding ${d.funding ?? "<txid>:<vout>:<sats>"} --merchant ${d.merchantAddress} --timeout ${d.timeoutBlocks} --net ${d.network} --release-pk ${d.releasePk} --oracle-pk ${d.oraclePk}`;
  const text = `LaunchDesk refund details (public values: no key can be made from them)

Order:             ${d.ref}
Contract address:  ${d.contractAddress}
Network:           ${d.network}
Your payment:      ${d.funding ?? "not seen yet"}  (txid:output:sats)
Refund goes to:    ${refund}
LaunchDesk payout: ${d.merchantAddress}
Release key:       ${d.releasePk}
Report key:        ${d.oraclePk}
Refund opens after ${d.timeoutBlocks} blocks (about an hour) from the confirmation of your payment.

How to refund without LaunchDesk:
1. Get the LaunchDesk source code and run: npm install
2. Run:
   ${cmd}
3. Check that the printed contract address equals the one above.
4. Paste the printed transaction into any Bitcoin Cash "broadcast transaction" page.
`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = `launchdesk-refund-${d.project}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Live runs need the escrow flag; the examples always have their proof. */
const wanted = (id: string | null) => !!id && (ESCROW || isExample(id));

function paint() {
  const id = projectId();
  const paper = document.querySelector<HTMLElement>(".rdoc .rd-paper");
  const old = document.querySelector<HTMLElement>(".ep-panel");
  if (!id || !paper || !status || id !== forId || !wanted(id)) return old?.remove();
  const markup = html(id, status);
  if (old && old.parentElement === paper && old.dataset.state === status.state) return;
  old?.remove();
  const el = document.createElement("section");
  el.className = "ep-panel";
  el.dataset.state = status.state;
  el.innerHTML = markup;
  el.querySelector<HTMLButtonElement>(".ep-check")?.addEventListener("click", () => void check(id, el.querySelector<HTMLElement>(".ep-out")!));
  el.querySelector<HTMLButtonElement>(".ep-refund")?.addEventListener("click", () => status?.refundDetails && downloadRefund(status.refundDetails));
  paper.append(el);
}

let queued = false;
let lastPaper: Element | null = null;
function onChange() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    const id = projectId();
    const paper = document.querySelector(".rdoc .rd-paper");
    if (!id || !paper || !wanted(id)) return paint();
    // A report that just appeared (or a new project): ask the server again, the payment may have moved on.
    if (id !== forId || paper !== lastPaper) {
      lastPaper = paper;
      void load(id).then(paint);
    } else paint();
  });
}

let started = false;
export function startEscrowProof() {
  if (started || typeof MutationObserver === "undefined") return;
  started = true;
  new MutationObserver(onChange).observe(document.body, { childList: true, subtree: true });
  onChange();
  // a /p/<example> link opened directly: the example list may land after the report did
  void examples().then(onChange);
}
