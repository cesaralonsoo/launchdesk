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
  brand?: string | null;
  createdAt: number;
  verdict: { score: number; verdict: string } | null;
  sources: number;
  proof: boolean;
};

let list: Promise<ExampleCard[]> | null = null;
let known: ExampleCard[] = [];
/** The brand each example's launch kit chose (its logo and website carry it), by example id. */
const brands = new Map<string, string>();
const kits = new Map<string, Promise<ExampleKit | null>>();
export type ExampleKit = { kit?: { brand?: { name?: string; city?: string } } } & Record<string, unknown>;
/** GET /api/projects/<id>/kit once per example (the home, the HUD and the names share it). */
export function exampleKit(id: string): Promise<ExampleKit | null> {
  let k = kits.get(id);
  if (!k) {
    k = fetch(`/api/projects/${encodeURIComponent(id)}/kit`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ExampleKit>) : null))
      .catch(() => (kits.delete(id), null));
    kits.set(id, k);
  }
  return k;
}
/** GET /api/examples once ([] when the server has none or is older than this page). The list carries each example's
 *  brand name, so every surface names an example the same way from its first paint. An older server without it: the
 *  names wait up to 700 ms for the kits, and a late one re-renders the named surfaces ("ld:example-names"). */
export function examples(): Promise<ExampleCard[]> {
  return (list ??= fetch("/api/examples", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { examples: [] }))
    .then(async (j: { examples?: ExampleCard[] }) => {
      const xs = Array.isArray(j.examples) ? j.examples : [];
      for (const x of xs) if (typeof x.brand === "string" && x.brand.trim()) brands.set(x.id, x.brand.trim());
      const missing = xs.filter((x) => !brands.has(x.id));
      if (missing.length) {
        let late = false;
        const names = Promise.all(missing.map(async (x) => {
          const name = (await exampleKit(x.id))?.kit?.brand?.name?.trim();
          if (name) brands.set(x.id, name);
        })).then(() => { if (late) window.dispatchEvent(new CustomEvent("ld:example-names")); });
        await Promise.race([names, new Promise((r) => setTimeout(r, 700))]);
        late = true;
      }
      known = xs;
      queueMicrotask(() => window.dispatchEvent(new CustomEvent("ld:example-names")));
      return xs;
    })
    .catch(() => ((list = null), [])));
}
/** Anything rendered before the names were known carries data-exn="<example id>": put the one name in it. */
function fillExampleNames(): void {
  for (const el of document.querySelectorAll<HTMLElement>("[data-exn]")) {
    const x = exampleOf(el.dataset.exn);
    if (!x) continue;
    const t = el.dataset.exnShort ? exampleShort(x) : exampleName(x);
    if (el.textContent !== t) el.textContent = t;
  }
}
if (typeof window !== "undefined") window.addEventListener("ld:example-names", fillExampleNames);

/** The example's one display name: "Sortida · coffee kiosk in Barcelona" (brand · what it is), or its title alone. */
export function exampleName(x: Pick<ExampleCard, "id" | "title">): string {
  const b = brands.get(x.id);
  if (!b) return x.title;
  if (x.title.toLowerCase().includes(b.toLowerCase())) return x.title;
  return `${b} · ${x.title.charAt(0).toLowerCase()}${x.title.slice(1)}`;
}
/** The short form, where there is no room: the brand ("Sortida"), or the title. */
export const exampleShort = (x: Pick<ExampleCard, "id" | "title">): string => brands.get(x.id) ?? x.title;
/** The display name for a project id, when it is a known finished example. */
export function exampleNameOf(id: string | null | undefined): string | null {
  const x = exampleOf(id);
  return x ? exampleName(x) : null;
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
    ? `${exampleName(x)} · ${x.proof ? "report, website and BCH payment proof" : "report and website"}`
    : "A real run: the report, the website and the payment proof";
  return `<button type="button" class="ex-home" data-act="example">
      <span class="ex-home-i">${I.report(18)}</span>
      <span class="ex-home-t"><b>See a finished example</b><span class="ex-home-s">${esc(sub)}</span></span>
      <span class="ex-home-free">Free · no wallet</span>${I.arrow(14)}
    </button>`;
}

/** The example's kit note (from the server), shown as it is in a small line on the kit screen; undefined if none.
 *  No price wording is added here: the note says what it needs to. */
export function kitNoteShort(note: string | undefined): string | undefined {
  const t = note?.trim();
  return t ? t : undefined;
}

/** v8 (PLAN.md 6.5): a slim static strip under the top bar (44 px on phones), never over the report text: what it is,
 *  and the three places a judge wants to see. The kit note ("Kit from a second run …") lives on the kit screen. */
export function ribbonHtml(x: ExampleCard, at: "report" | "kit" | "proof", others: ExampleCard[]): string {
  const other = others.find((o) => o.id !== x.id);
  const v = x.verdict ? `${VERDICT[x.verdict.verdict] ?? x.verdict.verdict} ${x.verdict.score.toFixed(1)}/10` : "";
  return `<div class="ex-ribbon ex-strip" role="region" aria-label="Finished example">
    <div class="ex-r-t"><span class="ex-r-tag"><span class="ex-r-long">Finished </span>example</span><b><span class="ex-r-nl" data-exn="${esc(x.id)}">${esc(exampleName(x))}</span><span class="ex-r-ns" data-exn="${esc(x.id)}" data-exn-short="1">${esc(exampleShort(x))}</span></b>
      <span class="ex-r-meta">${esc(x.paid)}${v ? ` · ${esc(v)}` : ""}${x.sources ? ` · ${x.sources} web pages cited` : ""}</span></div>
    <nav class="ex-r-nav" aria-label="This example">
      <button type="button" data-ex="report" aria-pressed="${at === "report"}">Report</button>
      ${x.proof ? `<button type="button" data-ex="proof" aria-pressed="${at === "proof"}">Proof<span class="ex-r-long"> on Bitcoin Cash</span></button>` : ""}
      <button type="button" data-ex="kit" aria-pressed="${at === "kit"}"><span class="ex-r-l">Launch kit</span><span class="ex-r-s">Kit</span></button>
      ${other ? `<button type="button" class="ex-r-other" data-ex="other" data-id="${esc(other.id)}" title="${esc(other.title)}">Another example</button>` : ""}
      <button type="button" class="ex-r-own" data-ex="own"><span class="ex-r-l">Try your own idea</span><span class="ex-r-s">Your idea</span></button>
    </nav>
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
