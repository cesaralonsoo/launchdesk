// "See a finished example" (judge path): the real runs the server seeds from server/seed/examples/finished
// (server/examples.ts, GET /api/examples). The home button opens the coffee kiosk on its report; a ribbon over the
// example says what it is (a real run, its date, what was paid) and jumps between the report, the on-chain proof
// and the launch kit. Also: the calm "payments paused" notice and the "your $0.10 is locked" line after paying.
import "./example.css";
import { esc } from "./dom";
import { I } from "./icons";

export type ExampleCard = {
  id: string;
  slug: string;
  title: string;
  run: string;
  paid: string;
  kitNote: string;
  createdAt: number;
  verdict: { score: number; verdict: string } | null;
  sources: number;
  proof: boolean;
};

let list: Promise<ExampleCard[]> | null = null;
let known: ExampleCard[] = [];
/** GET /api/examples once ([] when the server has none or is older than this page). */
export function examples(): Promise<ExampleCard[]> {
  return (list ??= fetch("/api/examples", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { examples: [] }))
    .then((j: { examples?: ExampleCard[] }) => (known = Array.isArray(j.examples) ? j.examples : []))
    .catch(() => ((list = null), [])));
}
/** The examples already loaded (sync; empty until examples() resolved). */
export const knownExamples = () => known;
export const exampleOf = (id: string | null | undefined) => (id ? (known.find((x) => x.id === id) ?? null) : null);
/** The one the home button opens: the one with the on-chain proof first. */
export const mainExample = () => known.find((x) => x.proof) ?? known[0] ?? null;

const VERDICT: Record<string, string> = { go: "Go", pivot: "Test first", "no-go": "No-go" };

/** The home button. Before /api/examples answers it still says the same thing (the click waits for the list). */
export function exampleButtonHtml(): string {
  const x = mainExample();
  const sub = x
    ? `${x.title} · ${x.proof ? "report, website and BCH payment proof" : "report and website"}`
    : "A real run: the report, the website and the payment proof";
  return `<button type="button" class="ex-home" data-act="example">
      <span class="ex-home-i">${I.report(18)}</span>
      <span class="ex-home-t"><b>See a finished example</b><span class="ex-home-s">${esc(sub)}</span></span>
      <span class="ex-home-free">Free · no wallet</span>${I.arrow(14)}
    </button>`;
}

/** The kit note in one short line ("Kit from a second run (€2.50 flat white version)"), or undefined. */
export function kitNoteShort(note: string | undefined): string | undefined {
  if (!note) return undefined;
  const ver = /\(a ([^)]{1,40}) version\)/.exec(note)?.[1];
  return `Kit from a second run${ver ? ` (${ver} version)` : " of this idea"}`;
}

/** The strip over an open example: what it is, and the three places a judge wants to see. */
export function ribbonHtml(x: ExampleCard, at: "report" | "kit" | "proof", others: ExampleCard[]): string {
  const other = others.find((o) => o.id !== x.id);
  const v = x.verdict ? `${VERDICT[x.verdict.verdict] ?? x.verdict.verdict} ${x.verdict.score.toFixed(1)}/10` : "";
  // one short line on the ribbon; the full reason behind an (i) tap
  const kitShort = kitNoteShort(x.kitNote) ?? "";
  return `<div class="ex-ribbon glass" role="region" aria-label="Finished example">
    <div class="ex-r-t"><span class="ex-r-tag">Finished example</span><b>${esc(x.title)}</b>
      <span class="ex-r-meta">${esc(x.run)} · ${esc(x.paid)}${v ? ` · ${esc(v)}` : ""}${x.sources ? ` · ${x.sources} web pages cited` : ""}</span></div>
    <nav class="ex-r-nav">
      <button type="button" data-ex="report" aria-pressed="${at === "report"}">Report</button>
      ${x.proof ? `<button type="button" data-ex="proof" aria-pressed="${at === "proof"}">Proof on Bitcoin Cash</button>` : ""}
      <button type="button" data-ex="kit" aria-pressed="${at === "kit"}">Launch kit</button>
      ${other ? `<button type="button" data-ex="other" data-id="${esc(other.id)}" title="${esc(other.title)}">Another example</button>` : ""}
      <button type="button" class="ex-r-own" data-ex="own">Try your own idea</button>
    </nav>
    ${at === "kit" && kitShort ? `<details class="ex-r-note"><summary>${I.info(13)}<span>${esc(kitShort)}</span></summary><p>${esc(x.kitNote)}</p></details>` : ""}
  </div>`;
}

/** Payments are switched off on the server (GET /api/config paused:true): a calm line, and the way to the example. */
export function pausedHtml(): string {
  return `<div class="ex-paused" role="status">
    <b>New runs are paused for a little while.</b>
    <span>Nothing can be paid right now, so nothing will be charged. The finished example shows everything a run makes.</span>
    <button type="button" class="btn btn-primary ex-paused-go" data-act="example"><span>See a finished example</span></button>
  </div>`;
}

/** Right after paying, while the report is being made (escrow on, a real payment only). */
export function lockedHtml(cents: number): string {
  const usd = `$${(cents / 100).toFixed(2)}`;
  return `<div class="ex-lock" role="status">
    <span class="ex-lock-i" aria-hidden="true">${I.lock(20)}</span>
    <p><b>Your ${usd} is locked in a Bitcoin Cash contract, not paid yet.</b> <span>It is released only when your report is delivered.</span></p>
  </div>`;
}
