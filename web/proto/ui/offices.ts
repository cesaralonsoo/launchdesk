// "Your offices": the team keeps working after the launch. Two ways in:
//   (A) from a created project (the report + kit already say what the business is: no questions), or
//   (B) "Bring a project you already run": what it is, where, a link if any, then up to 3 short questions.
// Four rooms (Marketing, Research, Money, Customers), each with 1–2 tasks. Every task shows its price in cents
// before it runs; "Run" opens the pay card (same .pay surface as the report's), then the result lands in the inbox
// with "used 4¢ of 9¢ quoted". On a sample-data server (or a local test) the card runs it without a wallet.
// Data: server/offices/routes.ts. Opened as its own full-screen layer, so it works on top of any screen.
import type { FollowUp, InboxItem, OfficeDef, OfficeId, OfficesView, TaskDef, TaskQuote } from "../../../server/offices/types";
import { el, esc } from "./dom";
import { I } from "./icons";
import "../live/live.css";
import "./kit-screen.css";
import "./offices.css";

export type OfficesOpts = {
  /** (A) the created project to continue from. Without it the screen starts at (B). */
  projectId?: string | null;
  ownerKey?: string | null;
  name?: string;
  /** API origin ("" = same origin). */
  api?: string;
  onClose?: () => void;
  /** v8: shown as a side card (desktop) / sheet (phone) over the offices floor in 3D, not a full-screen layer. */
  overWorld?: boolean;
  /** v8: open on this office (a room picked in 3D). */
  focus?: OfficeId;
  /** v8: every view the offices receive (open, poll, task paid, task done), for the game store. */
  onView?: (v: OfficesView) => void;
  /** v8: the owner looks at one office (or the whole floor): the camera follows. */
  onFocus?: (o: OfficeId | null) => void;
};

const DEMOS = [
  { label: "A bakery", what: 'A small sourdough bakery called "Miga" that also runs Saturday baking classes', where: "Ruzafa, Valencia" },
  { label: "Dog walks", what: 'Midday group dog walks called "Paseo", same walker every day', where: "Chamberí, Madrid" },
];
const ROOM_ICON: Record<OfficeId, (n?: number) => string> = { marketing: I.brand, research: I.globe, money: I.wallet, customers: I.report };
const ROOM_TINT: Record<OfficeId, string> = { marketing: "#E8590C", research: "#1971C2", money: "#05875F", customers: "#7048E8" };
const cents = (c: number) => (c >= 100 ? `$${(c / 100).toFixed(2)}` : `${c}¢`);
const fmtSats = (n: number) => n.toLocaleString("en-US");
const SAVED = "ld.offices.brought";

type Saved = { id: string; key: string; name: string };
function savedSpaces(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(SAVED) || "[]") as Saved[];
    return Array.isArray(v) ? v.filter((x) => x && x.id && x.key).slice(0, 5) : [];
  } catch {
    return [];
  }
}
function saveSpace(s: Saved) {
  try {
    localStorage.setItem(SAVED, JSON.stringify([s, ...savedSpaces().filter((x) => x.id !== s.id)].slice(0, 5)));
  } catch {
    /* private window: the offices still work for this visit */
  }
}

let openLayer: { close(): void } | null = null;

// ─────────────── real wallet payment for one task (WizardConnect, same wallet module as the report's pay card)
type TaskPayDeps = {
  quote(): Promise<TaskQuote>;
  label: string;
  cents: number;
  testOk: boolean;
  pay(txHex: string): Promise<OfficesView>;
  onPaid(v: OfficesView): void;
};
function mountTaskPay(slot: HTMLElement, d: TaskPayDeps): () => void {
  let disposed = false;
  let busy = false;
  let off: (() => void) | null = null;
  const ctl = new AbortController();
  const testLink = d.testOk ? `<button type="button" class="v-link pl-dev" data-ofs="test">Run without paying (local test)</button>` : "";
  const set = (html: string) => !disposed && (slot.innerHTML = html);
  const fail = (title: string, text: string) => {
    busy = false;
    set(`<div class="pl-err" role="alert"><b>${esc(title)}</b><span>${esc(text)}</span></div><button class="btn btn-primary btn-pay" type="button" data-ofp="pay"><span class="b-lbl">Try again</span></button>${testLink}`);
  };
  void import("../../src/wallet").then((w) => {
    if (disposed) return;
    const render = () => {
      if (disposed || busy) return;
      const s = w.walletState();
      if (s === "ready") return set(`<div class="pl-with"><span>Pay with</span><b>${esc(w.walletName())}</b></div><button class="btn btn-primary btn-pay" type="button" data-ofp="pay"><span class="b-lbl">Pay ${cents(d.cents)} and run</span></button>${testLink}`);
      if (s === "pairing" || s === "connecting") return set(`<div class="pl-with"><span class="pl-spin"></span><span>Waiting for your wallet</span></div>${testLink}`);
      set(`<button class="btn btn-primary btn-pay" type="button" data-ofp="connect"><span class="b-lbl">Connect wallet</span></button><p class="pl-hint">WizardConnect · tested with Selene</p>${testLink}`);
    };
    const showQr = () => {
      try {
        const p = w.pair();
        set(`<div class="pl-qr"><div class="pl-code">${p.qrSvg}</div><div class="pl-qr-t"><b>Scan with your BCH wallet</b><span>Or open it on this device.</span><a class="btn btn-primary pl-open" href="${esc(p.uri)}">Open wallet</a></div></div>${testLink}`);
      } catch (e) {
        fail("Couldn't open WizardConnect.", (e as Error).message || "Try again in a moment.");
      }
    };
    const payNow = async () => {
      busy = true;
      set(`<ol class="pl-track"><li data-s="now"><i></i><span>Approve in ${esc(w.walletName())}</span></li><li><i></i><span>Confirming on Bitcoin Cash</span></li><li><i></i><span>Your office starts</span></li></ol>`);
      try {
        const q = await d.quote();
        if (!q.sats) throw new Error("The live BCH price is not available right now. Nothing was charged.");
        const txHex = await w.payWithWallet(q.address, q.sats, q.tag, d.label, ctl.signal);
        d.onPaid(await d.pay(txHex));
      } catch (e) {
        const m = (e as Error)?.message ?? "";
        if (/reject|cancel|denied|declin|abort/i.test(m)) return fail("Your wallet declined.", "Nothing was sent.");
        fail("Payment not completed.", m || "Something went wrong. Nothing was charged.");
      }
    };
    slot.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>("[data-ofp]")?.dataset.ofp;
      if (a === "connect") showQr();
      if (a === "pay") void payNow();
    });
    off = w.onWallet(() => !busy && render());
    w.resume();
    render();
  }, () => fail("Couldn't load the wallet.", "Please reload the page."));
  return () => {
    disposed = true;
    ctl.abort();
    off?.();
  };
}

/** Opens the offices layer (one at a time). Returns a handle to close it. */
export function openOffices(o: OfficesOpts = {}): { close(): void; focus(o: OfficeId): void } {
  openLayer?.close();
  const api = o.api ?? "";
  let view: OfficesView | null = null;
  let key: string | null = o.ownerKey ?? null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let open = new Set<string>();
  let payDispose: (() => void) | null = null;
  let focusRoom: OfficeId | null = o.focus ?? null;
  const side = !!o.overWorld;
  const prevFocus = document.activeElement as HTMLElement | null;

  const layer = el(`<div class="ofx${side ? " ofx-side" : ""}" role="dialog" aria-modal="${side ? "false" : "true"}" aria-label="Your offices">
    <div class="ofx-in">
      <header class="ofx-top">
        <div class="ofx-t"><span class="eyebrow" data-ofx-eyebrow>Your offices</span><h2 class="t-display" data-ofx-name>${esc(o.name || "Your offices")}</h2></div>
        <button class="btn btn-ghost btn-icon" type="button" data-of="close" aria-label="Close">${I.close(16)}</button>
      </header>
      <main class="ofx-main" data-ofx-main></main>
    </div>
    <div class="ofx-sheet" data-ofx-sheet hidden></div>
  </div>`);
  document.body.appendChild(layer);
  if (!side) document.documentElement.classList.add("ofx-lock");
  const main = layer.querySelector<HTMLElement>("[data-ofx-main]")!;
  const sheet = layer.querySelector<HTMLElement>("[data-ofx-sheet]")!;
  const setName = (n: string, eyebrow = "Your offices") => {
    layer.querySelector("[data-ofx-name]")!.textContent = n;
    layer.querySelector("[data-ofx-eyebrow]")!.textContent = eyebrow;
  };
  const headers = () => ({ "content-type": "application/json", ...(key ? { "x-owner-key": key } : {}) });
  async function call<T>(path: string, payload?: unknown): Promise<T> {
    let r: Response;
    try {
      r = await fetch(`${api}${path}`, payload === undefined ? { headers: headers() } : { method: "POST", headers: headers(), body: JSON.stringify(payload) });
    } catch {
      throw new Error("No connection. Please try again.");
    }
    const j = (await r.json().catch(() => ({}))) as T & { error?: string };
    if (!r.ok) throw new Error(j.error || "That did not work. Please try again.");
    return j;
  }
  const toast = (text: string) => {
    const t = el(`<div class="kit-toast ofx-toast" role="status">${esc(text)}</div>`);
    layer.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  };
  const busy = (html: string) => (main.innerHTML = `<div class="kit-wait ofx-wait"><span class="kw-bar"><i></i></span><span>${esc(html)}</span></div>`);

  // ─────────────── (B) the short form, then the follow-up questions
  function showStart() {
    setName("Bring a project you already run", "Your offices");
    const mine = savedSpaces();
    main.innerHTML = `
      <section class="ofb">
        <p class="ofb-sub">Tell us about your business in a few words. Your offices will use it for every task.</p>
        <div class="ofb-demo" role="group" aria-label="Try an example">${DEMOS.map((d, i) => `<button type="button" class="chip" data-of-demo="${i}">${esc(d.label)}</button>`).join("")}</div>
        <form class="ofb-form" data-of-form novalidate>
          <label><span>What is it?</span><textarea name="what" rows="3" maxlength="400" required placeholder="For example: a small bakery that also runs baking classes"></textarea></label>
          <label><span>Where?</span><input name="where" maxlength="120" required placeholder="A town, a neighbourhood, or online" autocomplete="address-level2"></label>
          <label><span>Website or social link <em>(optional)</em></span><input name="link" maxlength="300" inputmode="url" placeholder="instagram.com/yourbakery"></label>
          <p class="ofb-err" data-of-err role="alert" hidden></p>
          <button class="btn btn-primary ofb-go" type="submit"><span>Continue</span>${I.arrow(16)}</button>
          <p class="ofb-foot">Free. Your offices only start working when you pick a task.</p>
        </form>
        ${mine.length ? `<div class="ofb-mine"><span class="eyebrow">Your offices on this device</span>${mine.map((m) => `<button type="button" class="btn btn-ghost" data-of-mine="${esc(m.id)}"><span>${esc(m.name)}</span>${I.arrow(14)}</button>`).join("")}</div>` : ""}
        ${o.projectId ? `<button type="button" class="v-link ofb-back" data-of="project">Back to the offices of ${esc(o.name || "your project")}</button>` : ""}
      </section>`;
    main.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
  }
  async function submitForm(form: HTMLFormElement) {
    const f = new FormData(form);
    const err = form.querySelector<HTMLElement>("[data-of-err]")!;
    const go = form.querySelector<HTMLButtonElement>(".ofb-go")!;
    go.disabled = true;
    try {
      const r = await call<{ view: OfficesView; key: string }>("/api/offices/bring", { what: f.get("what"), where: f.get("where"), link: f.get("link") });
      key = r.key;
      view = r.view;
      saveSpace({ id: r.view.id, key: r.key, name: r.view.brain.name });
      paint();
    } catch (e) {
      err.textContent = (e as Error).message;
      err.hidden = false;
      go.disabled = false;
    }
  }
  function questionsHtml(qs: FollowUp[]): string {
    return `
      <section class="ofb">
        <p class="ofb-sub">Thanks. ${qs.length === 1 ? "One quick question" : `${qs.length} quick questions`}, so your offices get it right. Skip any you like.</p>
        <form class="ofb-form" data-of-answers>
          ${qs.map((q, i) => `<label><span><b class="ofq-n">${i + 1}</b>${esc(q.question)}</span><small class="ofq-h">${esc(q.hint)}</small><input name="${esc(q.id)}" maxlength="240"></label>`).join("")}
          <button class="btn btn-primary ofb-go" type="submit"><span>Open my offices</span>${I.arrow(16)}</button>
          <button class="btn btn-quiet" type="button" data-of="skip">Skip the questions</button>
        </form>
      </section>`;
  }
  async function submitAnswers(form: HTMLFormElement | null) {
    if (!view) return;
    const answers: Record<string, string> = {};
    if (form) new FormData(form).forEach((v, k) => (answers[k] = String(v)));
    try {
      view = await call<OfficesView>(`/api/offices/${view.id}/answers`, { answers });
      paint();
    } catch (e) {
      toast((e as Error).message);
    }
  }

  // ─────────────── the four rooms + the inbox
  const taskBtn = (t: TaskDef) => `
    <li class="oft">
      <div class="oft-t"><b>${esc(t.title)}</b><span>${esc(t.line)}</span></div>
      <button type="button" class="btn btn-primary oft-run" data-of-task="${t.id}" aria-label="${esc(t.title)}, ${cents(t.cents)}"><span>Run</span><span class="btn-price">${cents(t.cents)}</span></button>
    </li>`;
  const roomHtml = (r: OfficeDef, inbox: InboxItem[]) => {
    const working = inbox.filter((i) => i.office === r.id && i.status === "working").length;
    return `
    <article class="ofr${focusRoom === r.id ? " is-focus" : ""}" data-of-room="${r.id}" style="--tint:${ROOM_TINT[r.id]}">
      <header><span class="ofr-ic" aria-hidden="true">${ROOM_ICON[r.id](18)}</span><div><h3>${esc(r.name)}</h3><p>${esc(r.line)}</p></div>${working ? `<span class="ofr-busy"><i></i>Working</span>` : ""}</header>
      <ul>${r.tasks.map(taskBtn).join("")}</ul>
    </article>`;
  };
  const statusChip = (i: InboxItem) =>
    i.status === "done"
      ? `<span class="ofi-chip ok">Done</span>`
      : i.status === "working"
        ? `<span class="ofi-chip run"><i></i>Working</span>`
        : i.status === "error"
          ? `<span class="ofi-chip bad">Didn't finish</span>`
          : "";
  const costLine = (i: InboxItem) => {
    if (i.status === "done" && i.usedCents != null) {
      const saved = i.quotedCents - i.usedCents;
      return `<span class="ofi-cost"><b>Used ${cents(i.usedCents)}</b> of ${cents(i.quotedCents)} quoted${saved > 0 ? ` · ${cents(saved)} saved` : ""}${i.paid?.test ? " · nothing charged" : ""}</span>`;
    }
    if (i.status === "error") return `<span class="ofi-cost">${esc(i.error || "Nothing was charged.")}</span>`;
    return `<span class="ofi-cost">Quoted ${cents(i.quotedCents)}</span>`;
  };
  const resultHtml = (i: InboxItem) => {
    const r = i.result;
    if (!r) return "";
    return `<div class="ofi-body">
      ${r.intro ? `<p class="ofi-intro">${esc(r.intro)}</p>` : ""}
      <ol class="ofi-items">${r.items.map((x, n) => `<li>${x.heading ? `<b>${esc(x.heading)}</b>` : ""}<p>${esc(x.text)}</p>${x.note ? `<small>${esc(x.note)}</small>` : ""}<button type="button" class="v-link ofi-copy" data-of-copy="${i.id}:${n}">Copy</button></li>`).join("")}</ol>
      ${r.sources?.length ? `<p class="ofi-src">Sources: ${r.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>`).join(" · ")}</p>` : ""}
      <div class="ofi-acts"><button type="button" class="btn btn-ghost" data-of-copyall="${i.id}"><span>Copy all</span></button><button type="button" class="btn btn-ghost" data-of-task="${i.task}"><span>Run again</span></button></div>
    </div>`;
  };
  const inboxHtml = (items: InboxItem[]) =>
    items.length
      ? `<ul class="ofi-list">${items.map((i) => {
          const on = open.has(i.id) && !!i.result;
          return `<li class="ofi" data-s="${i.status}" style="--tint:${ROOM_TINT[i.office]}">
            <button type="button" class="ofi-head" data-of-open="${i.id}" aria-expanded="${on}"${i.result ? "" : " disabled"}>
              <span class="ofi-ic" aria-hidden="true">${ROOM_ICON[i.office](16)}</span>
              <span class="ofi-t"><b>${esc(i.result?.title || i.title)}</b>${costLine(i)}</span>
              ${statusChip(i)}
            </button>
            ${on ? resultHtml(i) : ""}
          </li>`;
        }).join("")}</ul>`
      : `<p class="ofi-empty">Nothing yet. Pick a task above: you see the price first, and the result lands here.</p>`;
  const brainHtml = (v: OfficesView) => {
    const b = v.brain;
    const rows = [
      ["What it does", b.what],
      ["Where", b.where],
      ["Customers", b.customer],
      ["Main price", b.price],
      ["Goal", b.goal],
      ["Competitors", b.competitors.map((c) => c.name).join(", ")],
    ].filter(([, x]) => x);
    return `<details class="ofk"><summary>What your offices know <span>${v.source === "report" ? "from your report and launch kit" : "from what you told us"}</span></summary>
      <dl>${rows.map(([k, x]) => `<div><dt>${esc(k!)}</dt><dd>${esc(x!)}</dd></div>`).join("")}</dl></details>`;
  };

  let scrollToFocus = !!focusRoom;
  function paint() {
    if (closed || !view) return;
    const v = view;
    // a created project: the name its launch kit gave it (the brain keeps the working title)
    const name = v.source === "report" && v.projectId === o.projectId && o.name ? o.name : v.brain.name;
    setName(name);
    if (v.questions.length) {
      main.innerHTML = questionsHtml(v.questions);
      main.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
      return;
    }
    // Repaint only what changed, so an open result or the scroll position survives the polling.
    if (!main.querySelector("[data-ofx-rooms]")) {
      main.innerHTML = `
        ${v.sample ? `<p class="ofx-sample">${I.info(14)}<span>Sample data: results are examples, and nothing is charged.</span></p>` : ""}
        <p class="ofx-lead">Your team keeps working for ${esc(name.replace(/^Your /, "your "))}. Pick a task: you see the price first and pay only for what you run.</p>
        <section class="ofx-rooms" data-ofx-rooms></section>
        <section class="ofx-inbox"><header><h3>Inbox</h3><span class="ofx-sum" data-ofx-sum></span></header><div data-ofx-inbox></div></section>
        <div data-ofx-brain></div>
        ${v.source === "report" ? `<button type="button" class="v-link ofx-other" data-of="bring">Bring a project you already run</button>` : ""}`;
    }
    main.classList.toggle("has-inbox", v.inbox.length > 0); // results first once there are some
    main.querySelector<HTMLElement>("[data-ofx-rooms]")!.innerHTML = v.offices.map((r) => roomHtml(r, v.inbox)).join("");
    main.querySelector<HTMLElement>("[data-ofx-inbox]")!.innerHTML = inboxHtml(v.inbox);
    main.querySelector<HTMLElement>("[data-ofx-brain]")!.innerHTML = brainHtml(v);
    const spent = v.inbox.reduce((t, i) => t + (i.status === "done" && !i.paid?.test ? i.usedCents ?? 0 : 0), 0);
    main.querySelector<HTMLElement>("[data-ofx-sum]")!.textContent = v.inbox.length ? `${v.inbox.length} task${v.inbox.length > 1 ? "s" : ""}${spent ? ` · ${cents(spent)} used` : ""}` : "";
    o.onView?.(v);
    if (scrollToFocus && focusRoom) {
      scrollToFocus = false;
      main.querySelector<HTMLElement>(`[data-of-room="${focusRoom}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    schedule();
  }
  function schedule() {
    if (timer) clearTimeout(timer);
    if (closed || !view?.inbox.some((i) => i.status === "working")) return;
    timer = setTimeout(async () => {
      try {
        const before = new Map(view!.inbox.map((i) => [i.id, i.status]));
        view = await call<OfficesView>(`/api/offices/${view!.id}`);
        // A task that just finished opens by itself.
        for (const i of view.inbox) if (i.status === "done" && before.get(i.id) === "working") open = new Set([i.id]);
      } catch {
        /* offline for a moment: keep the last view */
      }
      paint();
    }, 1200);
  }

  // ─────────────── the pay card for one task
  function closeSheet() {
    payDispose?.();
    payDispose = null;
    sheet.hidden = true;
    sheet.innerHTML = "";
  }
  async function pickTask(id: string) {
    if (!view) return;
    const def = view.offices.flatMap((r) => r.tasks).find((t) => t.id === id);
    if (!def) return;
    sheet.hidden = false;
    sheet.innerHTML = `<div class="ofs" role="dialog" aria-label="${esc(def.title)}">
      <section class="pay pay-live">
        <header class="pay-top"><span class="pay-merchant"><span class="ofr-ic" style="--tint:${ROOM_TINT[def.office]}">${ROOM_ICON[def.office](16)}</span><b>${esc(view.offices.find((r) => r.id === def.office)!.name)}</b></span><span class="tag${view.sample ? " tag-demo" : ""}">${view.sample ? "Sample data" : "Bitcoin Cash · mainnet"}</span></header>
        <div class="pay-amount"><b class="huge">${cents(def.cents)}</b><span class="pl-sats" data-ofs-sats>Getting your price</span></div>
        <div class="pay-line"><div><b>${esc(def.title)}</b><span>${esc(def.line)}</span></div></div>
        ${def.input ? `<label class="ofs-in"><span>${esc(def.input.label)}</span><textarea rows="4" maxlength="4000" data-ofs-input placeholder="${esc(def.input.placeholder)}"></textarea></label>` : ""}
        <div class="pl-slot" aria-live="polite" data-ofs-slot><div class="pl-with"><span class="pl-spin"></span><span>Getting your price</span></div></div>
        <p class="pay-foot pl-foot">${view.sample ? "This server runs sample data. Nothing is charged." : "This is the most it can cost. You are charged only what it really uses, never more."}</p>
      </section>
      <button type="button" class="btn btn-quiet ofs-x" data-of="cancel">Not now</button>
    </div>`;
    const slot = sheet.querySelector<HTMLElement>("[data-ofs-slot]")!;
    const satsEl = sheet.querySelector<HTMLElement>("[data-ofs-sats]")!;
    let quote: TaskQuote;
    try {
      quote = (await call<{ quote: TaskQuote }>(`/api/offices/${view.id}/tasks`, { task: id })).quote;
    } catch (e) {
      slot.innerHTML = `<div class="pl-err" role="alert"><b>Couldn't get the price.</b><span>${esc((e as Error).message)}</span></div>`;
      return;
    }
    satsEl.textContent = quote.sats ? `≈ ${fmtSats(quote.sats)} sats in Bitcoin Cash` : "in Bitcoin Cash";
    const sid = view.id;
    const input = () => sheet.querySelector<HTMLTextAreaElement>("[data-ofs-input]")?.value ?? "";
    // The quote was made before the owner typed: send the text with a fresh quote when there is any.
    const ensureQuote = async () => {
      if (!def.input || !input().trim()) return quote;
      quote = (await call<{ quote: TaskQuote }>(`/api/offices/${sid}/tasks`, { task: id, input: input() })).quote;
      return quote;
    };
    const done = (v: OfficesView) => {
      view = v;
      closeSheet();
      toast(`${def.title}: your office is on it`);
      paint();
      layer.querySelector(".ofx-inbox")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const runTest = async () => {
      slot.innerHTML = `<button class="btn btn-primary btn-pay" type="button" disabled><span class="b-lbl">Starting</span><span class="spin"></span></button>`;
      try {
        const q = await ensureQuote();
        done(await call<OfficesView>(`/api/offices/${sid}/tasks/${q.taskId}/pay`, { test: true }));
      } catch (e) {
        slot.innerHTML = `<div class="pl-err" role="alert"><b>It didn't start.</b><span>${esc((e as Error).message)}</span></div>`;
      }
    };
    if (view.sample) {
      slot.innerHTML = `<button class="btn btn-primary btn-pay" type="button" data-ofs="test"><span class="b-lbl">Run it · ${cents(def.cents)}</span></button>`;
    } else {
      // The real wallet path (WizardConnect), loaded only when needed. A local test link stays when allowed.
      payDispose = mountTaskPay(slot, {
        quote: () => ensureQuote(),
        label: `LaunchDesk · ${def.title} · ${cents(def.cents)}`,
        cents: def.cents,
        testOk: quote.testOk,
        pay: (txHex) => call<OfficesView>(`/api/offices/${sid}/tasks/${quote.taskId}/pay`, { txHex }),
        onPaid: done,
      });
    }
    slot.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-ofs='test']")) void runTest();
    });
    sheet.querySelector<HTMLElement>(".btn-pay, textarea")?.focus({ preventScroll: true });
  }

  // ─────────────── start
  async function startFromProject() {
    if (!o.projectId) return showStart();
    busy("Opening your offices");
    try {
      view = (await call<{ view: OfficesView }>("/api/offices/from-project", { projectId: o.projectId })).view;
      paint();
    } catch (e) {
      main.innerHTML = `<div class="kit-oops">${I.info(16)}<span>${esc((e as Error).message)}</span></div><button type="button" class="v-link ofx-other" data-of="bring">Bring a project you already run</button>`;
    }
  }
  async function openSaved(id: string) {
    const s = savedSpaces().find((x) => x.id === id);
    if (!s) return;
    key = s.key;
    busy("Opening your offices");
    try {
      view = await call<OfficesView>(`/api/offices/${s.id}`);
      main.innerHTML = "";
      paint();
    } catch (e) {
      toast((e as Error).message);
      showStart();
    }
  }

  layer.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    if (f.matches("[data-of-form]")) void submitForm(f);
    if (f.matches("[data-of-answers]")) void submitAnswers(f);
  });
  layer.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>("[data-of]")?.dataset.of;
    if (act === "close") return handle.close();
    if (act === "cancel") return closeSheet();
    if (act === "skip") return void submitAnswers(null);
    if (act === "bring") {
      view = null;
      key = null;
      return showStart();
    }
    if (act === "project") {
      key = o.ownerKey ?? null;
      main.innerHTML = "";
      return void startFromProject();
    }
    if (t === sheet) return closeSheet();
    // v8: tapping a room's header points the camera at it
    const roomHead = t.closest<HTMLElement>(".ofr > header")?.parentElement?.dataset.ofRoom as OfficeId | undefined;
    if (roomHead && side) {
      handle.focus(roomHead);
      return o.onFocus?.(roomHead);
    }
    const demo = t.closest<HTMLElement>("[data-of-demo]")?.dataset.ofDemo;
    if (demo != null) {
      const d = DEMOS[Number(demo)]!;
      const f = main.querySelector<HTMLFormElement>("[data-of-form]")!;
      (f.elements.namedItem("what") as HTMLTextAreaElement).value = d.what;
      (f.elements.namedItem("where") as HTMLInputElement).value = d.where;
      return;
    }
    const mine = t.closest<HTMLElement>("[data-of-mine]")?.dataset.ofMine;
    if (mine) return void openSaved(mine);
    const task = t.closest<HTMLElement>("[data-of-task]")?.dataset.ofTask;
    if (task) return void pickTask(task);
    const op = t.closest<HTMLElement>("[data-of-open]")?.dataset.ofOpen;
    if (op) {
      open.has(op) ? open.delete(op) : open.add(op);
      return paint();
    }
    const cp = t.closest<HTMLElement>("[data-of-copy]")?.dataset.ofCopy;
    const all = t.closest<HTMLElement>("[data-of-copyall]")?.dataset.ofCopyall;
    if (cp || all) {
      const [id, n] = (cp ?? `${all}:`).split(":");
      const r = view?.inbox.find((i) => i.id === id)?.result;
      if (!r) return;
      const one = (x: (typeof r.items)[number]) => [x.heading, x.text].filter(Boolean).join("\n");
      const text = n ? one(r.items[Number(n)]!) : [r.title, ...r.items.map(one)].join("\n\n");
      void navigator.clipboard?.writeText(text).then(() => toast("Copied"), () => toast("Select the text to copy it"));
    }
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (!sheet.hidden) closeSheet();
    else handle.close();
  };
  document.addEventListener("keydown", onKey);

  const handle = {
    close() {
      if (closed) return;
      closed = true;
      if (timer) clearTimeout(timer);
      closeSheet();
      document.removeEventListener("keydown", onKey);
      if (!side) document.documentElement.classList.remove("ofx-lock");
      layer.remove();
      openLayer = null;
      prevFocus?.focus?.({ preventScroll: true });
      o.onClose?.();
    },
    focus(r: OfficeId) {
      focusRoom = r;
      main.querySelectorAll<HTMLElement>("[data-of-room]").forEach((n) => n.classList.toggle("is-focus", n.dataset.ofRoom === r));
      main.querySelector<HTMLElement>(`[data-of-room="${r}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
  };
  openLayer = handle;
  void startFromProject();
  layer.querySelector<HTMLElement>("[data-of='close']")!.focus({ preventScroll: true });
  return handle;
}
