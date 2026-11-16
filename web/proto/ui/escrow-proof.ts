// "Proof on Bitcoin Cash" (VITE_ESCROW=1 only; loaded by live/pay.ts). A small panel at the end of the live report
// (/p/:id) that shows what the payment contract did:
//   released  the report's fingerprint (SHA-256 of the exact report data), a link to the release transaction on a
//             block explorer, a "Check it" button that re-hashes the report in this browser, and how to check it
//             yourself with any SHA-256 tool.
//   funded    "your payment is waiting in the contract" (polls until it is released or refunded).
//   refunded  "your payment came back to your wallet" + the refund transaction.
// It mounts itself next to the report (a MutationObserver), so no other screen needs to know about it.
import "./escrow-proof.css";
import { esc } from "./dom";

type Status = {
  state: "quoted" | "funded" | "released" | "refunded";
  sats: number | null;
  releaseTxid: string | null;
  refundTxid: string | null;
  reportHash: string | null;
  releaseUrl: string | null;
  refundUrl: string | null;
};

const projectId = () => /^\/p\/([A-Za-z0-9_-]{4,40})\/?$/.exec(location.pathname)?.[1] ?? null;
const base = (id: string) => `/api/escrow/${encodeURIComponent(id)}/validate`;
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-8)}`;

let status: Status | null = null;
let forId: string | null = null;
let poll: number | null = null;
let loading = false;

async function load(id: string) {
  if (loading) return;
  loading = true;
  try {
    const r = await fetch(base(id), { cache: "no-store" });
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
  if (s.state !== "released" || !s.reportHash)
    return `<h3>Your payment is waiting in a contract</h3>
      <p>It goes to LaunchDesk only once this report is recorded on Bitcoin Cash. This usually takes a few seconds.</p>`;
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

function paint() {
  const id = projectId();
  const paper = document.querySelector<HTMLElement>(".rdoc .rd-paper");
  const old = document.querySelector<HTMLElement>(".ep-panel");
  if (!id || !paper || !status || id !== forId) return old?.remove();
  const markup = html(id, status);
  if (old && old.parentElement === paper && old.dataset.state === status.state) return;
  old?.remove();
  const el = document.createElement("section");
  el.className = "ep-panel";
  el.dataset.state = status.state;
  el.innerHTML = markup;
  el.querySelector<HTMLButtonElement>(".ep-check")?.addEventListener("click", () => void check(id, el.querySelector<HTMLElement>(".ep-out")!));
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
    if (!id || !paper) return paint();
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
}
