// The home (PLAN.md 2–3, WP-A). web/index.html paints the hero and the scroll sections as static HTML at 0 ms; this
// module hydrates them while the flow is on the idea step:
//   - page mode (html.home): the document scrolls; the 3D canvas sits under the hero and scrolls away with it
//     (desktop: full-bleed behind the copy; phones: a 300 px block under the header), paused when off-screen;
//   - the stage strip and the three 3D pills (ui/labels.ts over WorldV8.labelPoints) move the camera to a wing;
//   - typing crossfades the floor from the finished example to "This will be yours" (WorldV8.setShowcase);
//   - submit creates the project and hands over to the flow (same path as the old idea card);
//   - the sections are fed by the real finished example: /api/examples, its kit, its on-chain proof, and the
//     in-browser SHA-256 check of its report.
// Cross-package calls only through WorldV8 (+ setInsets), the flow, and the ld:step event.
import type { WorldV7 } from "../contracts";
import type { ProtoFlowV7 } from "../flow";
import type { WorldV8, Area } from "../world/api-v8";
import type { ProjectV7 } from "../contracts";
import { STEP_EVENT } from "../game/types";
import { examples, mainExample, type ExampleCard } from "./example";
import { checkReportHash } from "./escrow-proof";
import { mountLabels, type LabelPoint } from "./labels";
import { mountFooter } from "../banner";
import { createProject, liveConfig } from "../live/adapter";
import { projects as savedProjects } from "../../src/app/projects";
// the real task catalog the server charges from (plain data; the prices on the page are the prices you pay)
import { OFFICES } from "../../../server/offices/catalog";

export interface HomeDeps {
  world: WorldV7 & WorldV8;
  flow: ProtoFlowV7;
}

const HOME_STEPS = new Set<string>(["idea", "bedroom"]);
const EXAMPLE_ID = "ex-coffee-bcn";
const AREA: Record<number, Area> = { 1: "wing:back", 2: "wing:front", 3: "plate" };
/** labelPoints() ids (WP-B) → our pills. */
const PIN_OF: Record<string, string> = { "wing:back": "s1", research: "s1", "wing:front": "s2", studio: "s2", plate: "s3", offices: "s3" };
const VERDICT: Record<string, string> = { go: "Go", pivot: "Test first", "no-go": "No-go" };
/** Same tints as the offices floor (ui/offices.ts ROOM_TINT). */
const ROOM_TINT: Record<string, string> = { marketing: "#E8590C", research: "#1971C2", money: "#05875F", customers: "#7048E8" };
const FALLBACK_SAMPLES = [
  "A specialty coffee kiosk at a Barcelona metro exit, €3 flat whites for commuters",
  "A dog-walking app for busy Madrid professionals, €12 a walk",
  "An online shop for restored vintage road bikes, around €450 each",
];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const short = (h: string) => (h.length > 20 ? `${h.slice(0, 8)}…${h.slice(-8)}` : h);
const cents = (c: number) => (c >= 100 ? `$${(c / 100).toFixed(2)}` : `${c}¢`);
const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const phone = () => matchMedia("(max-width: 767px)").matches;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The first words of an idea for the door sign ("A coffee kiosk at a metro exit" → "Coffee kiosk"). */
export function signWords(idea: string): string {
  const STOP = /^(a|an|the|my|our|for|at|in|on|of|to|with|and|or|by|from|near)$/i;
  const words = idea.replace(/[^\p{L}\p{N}\s'&-]/gu, " ").split(/\s+/).filter(Boolean);
  while (words.length && STOP.test(words[0]!)) words.shift();
  const out: string[] = [];
  for (const w of words) {
    if (out.length >= 3 || STOP.test(w)) break;
    out.push(w);
  }
  const s = out.join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Proof = {
  state: string; cents?: number | null; sats?: number | null; network?: string; fundedAt?: number;
  fundingTxid?: string | null; fundingUrl?: string | null; releaseTxid?: string | null; releaseUrl?: string | null; reportHash?: string | null;
};

/** Mounts the home. `host` (the #home slot of the UI root) stays empty: the home is the static #ld-home of index.html. */
export function mountHome(host: HTMLElement, deps: HomeDeps): () => void {
  void host;
  const { world, flow } = deps;
  const root = document.getElementById("ld-home");
  const html = document.documentElement;
  const q = new URLSearchParams(location.search);
  if (!root || q.get("demo") === "1") {
    html.classList.remove("home");
    html.classList.add("nohome");
    return () => {};
  }
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s);
  const $$ = <T extends HTMLElement = HTMLElement>(s: string) => [...root.querySelectorAll<T>(s)];
  const hero = $(".h-hero")!;
  const stage = $("#ldh-stage")!;
  const copy = $(".h-copy")!;
  const pinsEl = $(".h-pins")!;
  const ta = $<HTMLTextAreaElement>("#ldh-idea")!;
  const ta2 = $<HTMLTextAreaElement>("#ldh-idea2")!;
  const forms = [$<HTMLFormElement>("[data-h=form]")!, $<HTMLFormElement>("[data-h=form2]")!];
  const worldEl = document.getElementById("world");
  const offs: (() => void)[] = [];
  const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K | string, fn: (e: Event) => void, opt?: AddEventListenerOptions) => {
    t.addEventListener(type, fn, opt);
    offs.push(() => t.removeEventListener(type, fn, opt));
  };

  // ─── page mode ────────────────────────────────────────────────────────────────────────────────────────────
  let active = false;
  /** A project link / deep link opened the app: the home stays off until the visitor comes back to the idea step. */
  let armed = !html.classList.contains("nohome");
  let heroVisible = true;
  let mine = false;
  let raf = 0;

  function placeWorld() {
    if (!worldEl) return;
    if (!active) {
      worldEl.style.removeProperty("top");
      worldEl.style.removeProperty("height");
      return;
    }
    const top = phone() ? stage.offsetTop + hero.offsetTop : 0;
    const h = phone() ? stage.offsetHeight : hero.offsetHeight;
    worldEl.style.top = `${top}px`;
    worldEl.style.height = `${h}px`;
  }
  function applyInsets() {
    if (!active) return;
    if (phone()) setInsetsApp({ left: 0, right: 0, top: 0, bottom: 0 });
    else {
      const r = copy.getBoundingClientRect();
      setInsetsApp({ left: Math.round(r.right + 40), right: 16, top: 72, bottom: 64 });
    }
  }
  /** After any app surface re-measures, put the home's framing back (one frame later, and once more after it). */
  function reframe() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      placeWorld();
      applyInsets();
      labels.refresh();
    });
  }
  function setActive(v: boolean) {
    if (v === active) return;
    active = v;
    if (v) {
      html.classList.add("home");
      html.classList.remove("nohome");
      placeWorld();
      world.setShowcase(mine ? "yours" : "example");
      world.shotFor("floor");
      applyInsets();
      setTimeout(reframe, 60);
      labels.setPaused(false);
      world.setPaused(!heroVisible);
      requestAnimationFrame(() => requestAnimationFrame(() => html.classList.add("h-ready")));
      paintIdeas();
    } else {
      focusStage(0);
      html.style.scrollBehavior = "auto";
      window.scrollTo(0, 0);
      html.style.removeProperty("scroll-behavior");
      html.classList.remove("home", "h-ready");
      html.classList.add("nohome");
      placeWorld();
      labels.setPaused(true);
      world.setPaused(false);
      setBusy(false);
    }
  }
  // Bridge (REQUESTS.md R1): until ui/index.ts stops measuring its hidden idea card on the home, the home owns the
  // canvas framing while it is up. Calls from elsewhere are held and the last one is replayed when the home leaves,
  // so the app's framing is exactly what it asked for.
  const setInsetsApp = world.setInsets.bind(world);
  let heldInsets: Parameters<WorldV7["setInsets"]>[0] | null = null;
  world.setInsets = (i) => (active ? (heldInsets = i) : setInsetsApp(i));
  offs.push(() => (world.setInsets = setInsetsApp));
  /** Leaving is synchronous (the app measures its next card in a microtask right after ld:step); coming back waits a frame. */
  function sync() {
    const step = flow.state.step;
    if (!HOME_STEPS.has(step)) armed = true;
    const want = armed && HOME_STEPS.has(step);
    if (!want && active) {
      setActive(false);
      if (heldInsets) setInsetsApp(heldInsets);
      heldInsets = null;
      return;
    }
    requestAnimationFrame(() => {
      const s = flow.state.step;
      setActive(armed && HOME_STEPS.has(s));
      if (active) reframe();
    });
  }
  on(window, STEP_EVENT, sync);
  offs.push(flow.onChange(sync));
  on(window, "resize", reframe);
  const ro = new ResizeObserver(reframe);
  ro.observe(hero);
  offs.push(() => ro.disconnect());
  const io = new IntersectionObserver(
    ([e]) => {
      heroVisible = !!e?.isIntersecting;
      if (!active) return;
      world.setPaused(!heroVisible);
      labels.setPaused(!heroVisible);
    },
    { threshold: 0 },
  );
  io.observe(stage);
  offs.push(() => io.disconnect());

  // ─── stage strip + 3D pills ───────────────────────────────────────────────────────────────────────────────
  const PIN = (n: number, name: string, price: string) => `<i>${n}</i><span class="h-w">${name} <em>· ${price}</em></span>`;
  let focused = 0;
  function focusStage(n: number) {
    if (n === focused) return;
    focused = n;
    $$(".h-cell").forEach((c) => c.classList.toggle("on", c.dataset.stage === String(n)));
    labels.setActive(n ? `s${n}` : null);
    if (active) world.shotFor(n ? AREA[n]! : "floor");
  }
  const enter = (id: string) => focusStage(Number(id.slice(1)));
  const leave = () => focusStage(0);
  const labels = mountLabels(pinsEl, {
    hz: 30,
    points,
    defs: [
      { id: "s1", className: "h-p1", html: PIN(1, "Research", "10¢"), label: "Research, 10 cents: show it on the floor", onEnter: enter, onLeave: leave, onClick: (id) => tapStage(Number(id.slice(1))) },
      { id: "s2", className: "h-p2", html: PIN(2, "Launch kit", "50¢"), label: "Launch kit, 50 cents: show it on the floor", onEnter: enter, onLeave: leave, onClick: (id) => tapStage(Number(id.slice(1))) },
      { id: "s3", className: "h-p3", html: PIN(3, "Offices", "from 2¢"), label: "Offices, from 2 cents a task: show them", onEnter: enter, onLeave: leave, onClick: (id) => tapStage(Number(id.slice(1))) },
    ],
  });
  offs.push(() => labels.dispose());
  /** Until the world reports its own label points (WP-B), anchor the pills on the rooms it already projects. */
  function points(): LabelPoint[] {
    let got: LabelPoint[] = [];
    try {
      got = world.labelPoints().flatMap((p) => (PIN_OF[p.id] ? [{ ...p, id: PIN_OF[p.id]! }] : []));
    } catch {
      got = [];
    }
    if (got.length) return got;
    const avg = (rooms: Parameters<WorldV7["roomScreenPoint"]>[0][]) => {
      const ps = rooms.map((r) => world.roomScreenPoint(r)).filter((p): p is { x: number; y: number } => !!p);
      return ps.length ? { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length } : null;
    };
    const back = avg(["mia", "leo", "sam"]);
    const front = avg(["nova", "dex"]);
    const out: LabelPoint[] = [];
    if (back) out.push({ id: "s1", ...back, visible: true });
    if (front) out.push({ id: "s2", ...front, visible: true });
    if (back && front) out.push({ id: "s3", x: back.x - (front.x - back.x) * 0.3, y: back.y - Math.abs(front.y - back.y) * 1.1, visible: true });
    return out;
  }
  let tapTimer = 0;
  /** Touch / keyboard: show that wing for a few seconds (phones scroll the 3D block into view first). */
  function tapStage(n: number) {
    clearTimeout(tapTimer);
    if (focused === n) return focusStage(0);
    if (phone() && stage.getBoundingClientRect().top < -80) window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
    focusStage(n);
    tapTimer = window.setTimeout(() => focusStage(0), 4000);
  }
  for (const c of $$<HTMLButtonElement>(".h-cell")) {
    const n = Number(c.dataset.stage);
    on(c, "pointerenter", (e) => (e as PointerEvent).pointerType === "mouse" && focusStage(n));
    on(c, "pointerleave", (e) => (e as PointerEvent).pointerType === "mouse" && focusStage(0));
    on(c, "click", () => tapStage(n));
    on(c, "blur", () => focusStage(0));
  }
  offs.push(() => clearTimeout(tapTimer));

  // ─── typing → "This will be yours" ────────────────────────────────────────────────────────────────────────
  let signTimer = 0;
  function onType() {
    const now = ta.value.trim().length > 0;
    clearError();
    if (now !== mine) {
      mine = now;
      root!.classList.toggle("h-mine", mine);
      const chip = $<HTMLAnchorElement>(".h-chip")!;
      chip.setAttribute("aria-label", mine ? "This will be yours: your company starts on this floor" : "");
      if (!mine) chip.removeAttribute("aria-label");
      if (active) world.setShowcase(mine ? "yours" : "example");
    }
    clearTimeout(signTimer);
    if (mine) signTimer = window.setTimeout(() => active && world.setLobbyScreen(null, signWords(ta.value)), 250);
  }
  on(ta, "input", onType);
  offs.push(() => clearTimeout(signTimer));

  let samples = FALLBACK_SAMPLES;
  let k = 0;
  on($("[data-h=try]")!, "click", () => {
    ta.value = samples[k++ % samples.length]!;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(ta.value.length, ta.value.length);
  });

  // ─── submit (the same path as the old idea card: create the project, then the flow takes over at pay1) ────
  let busy = false;
  let lastUnpaid: { idea: string; proj: ProjectV7 } | null = null;
  function setBusy(v: boolean) {
    busy = v;
    for (const f of forms) {
      const b = f.querySelector<HTMLButtonElement>(".h-cta")!;
      b.disabled = v;
      b.querySelector(".h-cta-t")!.textContent = v ? "Starting…" : "Check my idea";
    }
  }
  function clearError() {
    for (const f of forms) f.querySelector<HTMLElement>(".h-err")!.hidden = true;
  }
  function fail(form: HTMLFormElement, msg: string) {
    setBusy(false);
    const p = form.querySelector<HTMLElement>(".h-err")!;
    p.textContent = msg;
    p.hidden = false;
    form.querySelector("textarea")?.focus({ preventScroll: true });
  }
  function submit(form: HTMLFormElement) {
    const box = form.querySelector("textarea")!;
    const idea = box.value.trim();
    if (!idea) return fail(form, "Type your idea first, or tap Try an example.");
    if (idea.length < 15) return fail(form, "Tell us a bit more: one full sentence.");
    if (busy) return;
    if (box !== ta) {
      ta.value = box.value;
      onType();
    }
    clearError();
    setBusy(true);
    if (lastUnpaid && lastUnpaid.idea === idea) return flow.startLive(lastUnpaid.proj, "new");
    createProject(idea).then(
      (proj) => {
        lastUnpaid = { idea, proj };
        flow.startLive(proj, "new");
      },
      (e: Error) => fail(form, e?.message || "Could not start. Try again."),
    );
  }
  for (const f of forms) {
    on(f, "submit", (e) => (e.preventDefault(), submit(f)));
    const box = f.querySelector("textarea")!;
    on(box, "keydown", (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === "Enter" && !ke.shiftKey && !ke.isComposing) {
        e.preventDefault();
        submit(f);
      }
    });
  }
  on(ta2, "input", clearError);

  // ─── links: the finished example opens in the app (no reload), "My ideas" opens the projects list ────────────
  let exampleId = EXAMPLE_ID;
  for (const a of $$<HTMLAnchorElement>("[data-h=open-example]")) {
    on(a, "click", (e) => {
      const me = e as MouseEvent;
      if (mine && a.classList.contains("h-chip")) return e.preventDefault();
      if (me.metaKey || me.ctrlKey || me.shiftKey || me.altKey || me.button !== 0) return;
      e.preventDefault();
      flow.next({ type: "switch-project", id: exampleId, at: "report" });
    });
  }
  const ideasLink = $<HTMLAnchorElement>("[data-h=ideas]")!;
  function paintIdeas() {
    ideasLink.hidden = !savedProjects.list().some((p) => !/^ex-/.test(p.id));
  }
  offs.push(savedProjects.onChange(paintIdeas));
  on(ideasLink, "click", (e) => {
    e.preventDefault();
    document.querySelector<HTMLElement>('.ui [data-act="offices"]')?.click();
  });
  paintIdeas();

  // ─── data: the finished example, its kit, its proof; the task catalog; the footer ─────────────────────────
  const tasks = $("[data-h=tasks]")!;
  tasks.innerHTML = OFFICES.map((o) => {
    const t = o.tasks[0]!;
    return `<li><i class="h-room" style="--rc:${ROOM_TINT[o.id] ?? "#8A919C"}"></i><span class="h-t">${esc(t.title)}<small>${esc(o.name)}</small></span><span class="h-tp">${cents(t.cents)}</span></li>`;
  }).join("");
  const footer = $("#blaze");
  if (footer) offs.push(mountFooter(footer));
  void liveConfig().then((c) => {
    if (c?.sampleIdeas?.length) samples = c.sampleIdeas;
    reframe();
  });

  const set = (key: string, text: string) => $$(`[data-h="${key}"]`).forEach((n) => (n.textContent = text));
  void examples().then((list: ExampleCard[]) => {
    const x = list.find((e) => e.id === EXAMPLE_ID) ?? null;
    // the captures on this page are of the coffee kiosk: without it, hide what would point at another company
    if (!x) {
      const other = mainExample();
      if (other) exampleId = other.id;
      else root.classList.add("h-noex");
      return;
    }
    const v = x.verdict ? (VERDICT[x.verdict.verdict] ?? x.verdict.verdict) : "";
    const score = x.verdict ? x.verdict.score.toFixed(1) : "";
    set("ex-title", x.title);
    set("cap-report", [x.title, score && `${score} ${v}`].filter(Boolean).join(" · "));
    if (x.verdict) {
      set("ex-verdict", v);
      $("[data-h=ex-verdict]")!.dataset.v = x.verdict.verdict;
      set("ex-score", score);
    }
    set("ex-sources", String(x.sources));
    set("ex-paid", x.paid);
    set("site-url", `${location.host}/s/${x.slug}`);
    $$<HTMLAnchorElement>("[data-h=site-link]").forEach((a) => (a.href = `/s/${encodeURIComponent(x.slug)}`));
    void loadKit(x);
    if (x.proof) void loadProof(x);
    else $("[data-h=proof]")!.hidden = true;
  });

  async function loadKit(x: ExampleCard) {
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(x.id)}/kit`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { kit?: { brand?: { name?: string; city?: string } } };
      const b = j.kit?.brand;
      if (!b?.name) return;
      set("ex-brand", b.name);
      set("ex-name", b.city ? `${b.name}, ${b.city}` : b.name);
    } catch {
      /* the static names stay (they are this example's) */
    }
  }

  async function loadProof(x: ExampleCard) {
    const card = $("[data-h=proof]")!;
    let p: Proof | null = null;
    try {
      const r = await fetch(`/api/examples/${encodeURIComponent(x.id)}/proof`, { cache: "no-store" });
      p = r.ok ? ((await r.json()) as Proof) : null;
    } catch {
      p = null;
    }
    if (!p || p.state !== "released" || !p.reportHash) return void (card.hidden = true);
    const link = (key: string, url: string | null | undefined) => {
      const a = $<HTMLAnchorElement>(`[data-h="${key}"]`)!;
      if (url) (a.href = url), (a.hidden = false);
    };
    set("fund-k", `Paid into the contract${p.sats ? ` · ${p.sats.toLocaleString("en-US")} sats` : ""}`);
    set("fund", short(p.fundingTxid ?? ""));
    $("[data-h=fund]")!.title = p.fundingTxid ?? "";
    link("fund-url", p.fundingUrl);
    set("rel", short(p.releaseTxid ?? ""));
    $("[data-h=rel]")!.title = p.releaseTxid ?? "";
    link("rel-url", p.releaseUrl);
    set("hash", short(p.reportHash));
    $("[data-h=hash]")!.title = p.reportHash;
    if (p.cents && p.network === "mainnet") set("ex-paid", `Paid $${(p.cents / 100).toFixed(2)} on BCH mainnet${p.fundedAt ? ` · ${day(p.fundedAt)}` : ""}`);
    const btn = $<HTMLButtonElement>("[data-h=check]")!;
    const out = $("[data-h=match]")!;
    btn.disabled = false;
    const hash = p.reportHash;
    on(btn, "click", async () => {
      btn.disabled = true;
      out.dataset.ok = "wait";
      out.textContent = "Checking…";
      out.classList.add("on");
      try {
        const r = await checkReportHash(`/api/examples/${encodeURIComponent(x.id)}/proof/report`, hash);
        out.dataset.ok = r.ok ? "yes" : "no";
        out.innerHTML = r.ok
          ? `Match ✓ <code title="${esc(r.hex)}">${esc(short(r.hex))}</code>`
          : `No match: this report differs from the one on chain`;
      } catch {
        out.dataset.ok = "no";
        out.textContent = "Couldn't check right now. Try again in a moment.";
      } finally {
        btn.disabled = false;
      }
    });
  }

  sync();
  return () => {
    for (const f of offs.splice(0)) f();
    cancelAnimationFrame(raf);
    setActive(false);
  };
}
