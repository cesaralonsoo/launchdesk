// WP4 · The Launch kit: the offer card after the report, and ONE result screen with three panels that fill in
// live: "Your logo" (WP2 picker), "Your website is live" (full link, Copy, QR, pick a design), "Your 30-day plan"
// (WP3 view). Plain words only. Data: GET /api/projects/:id/kit (server/kit-routes.ts), polled until done.
// The WP2/WP3 views are loaded when present (import.meta.glob tolerates a missing file); otherwise a simple
// built-in view is shown, so this screen works on its own.
import qrcode from "qrcode-generator";
import type { Kit, LogoOption, LogoResult, SiteTemplate } from "../../../server/kit-contract";
import { el, esc } from "./dom";
import { I } from "./icons";
import { usd } from "./view";
import "./kit-screen.css";

export type KitPayload = { kit: Kit | null; slug: string | null; siteUrl: string | null; running: boolean };
export type KitScreenOpts = {
  projectId: string;
  ownerKey?: string | null;
  /** API origin ("" = same origin). */
  api?: string;
  pollMs?: number;
  /** Show this payload instead of calling the server (mock / example / tests). */
  mock?: KitPayload;
  /** Opens "Your offices"; gets the brand name once it is known. */
  onOffices?: (name?: string) => void;
};

const TEMPLATES: Array<{ id: SiteTemplate; name: string; note: string }> = [
  { id: "editorial", name: "Classic", note: "Calm, lots of white space" },
  { id: "bold", name: "Bold", note: "Big type, strong colour" },
  { id: "warm", name: "Warm", note: "Soft and friendly" },
];

// ───────────────────────────── the offer card (after the report)
export function kitOfferHtml(cents = 50): string {
  return `
  <section class="kit-offer">
    <span class="eyebrow" data-st>Next step</span>
    <h2 class="t-display" data-st>Launch kit</h2>
    <p class="ko-sub" data-st>Your logo, your website and your 30-day plan · ${usd(cents)}. Made for this idea in about a minute.</p>
    <ul class="ko-list" data-st>
      <li>${I.brand(18)}<span><b>Your logo</b>Three options to choose from. Download it for print and social.</span></li>
      <li>${I.globe(18)}<span><b>Your website</b>Online straight away, with your own link. Customers can reserve and pay.</span></li>
      <li>${I.report(18)}<span><b>Your 30-day plan</b>What to do each week to win your first customers, with posts ready to copy.</span></li>
    </ul>
    <button class="btn btn-primary ko-go" data-act="next" type="button" data-st><span>Get my launch kit</span><span class="btn-price">${usd(cents)}</span></button>
    <p class="ko-foot" data-st>Paid in Bitcoin Cash from your wallet.</p>
  </section>`;
}

// ───────────────────────────── helpers
export function qrSvg(text: string, px = 132): string {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
  return `<svg class="kit-qr" viewBox="0 0 ${n + 4} ${n + 4}" width="${px}" height="${px}" role="img" aria-label="QR code for your website"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
}
const absolute = (u: string | null) => (!u ? "" : /^https?:/.test(u) ? u : location.origin + u);
const isDone = (k: Kit | null) => !!k && (["logo", "site", "marketing"] as const).every((p) => k.status[p] === "done" || k.status[p] === "error");
/** What the header may claim: "Ready" only when all three parts are really on screen. */
const isReady = (k: Kit | null, shown: { plan: boolean }) =>
  !!k && k.status.logo === "done" && !!k.logo && k.status.site === "done" && !!k.site && k.status.marketing === "done" && !!k.marketing && shown.plan;
const chosenLogo = (k: Kit | null) => (k?.logo ? k.logo.options.find((o) => o.id === k.logo!.chosen) ?? k.logo.options[0] ?? null : null);
function waiting(line: string): string {
  return `<div class="kit-wait"><span class="kw-bar"><i></i></span><span>${esc(line)}<span class="dots"><i></i><i></i><i></i></span></span></div>`;
}
function oops(line: string): string {
  return `<div class="kit-oops">${I.info(16)}<span>${esc(line)}</span></div>`;
}

// ───────────────────────────── built-in views (used until WP2/WP3 views are present)
function logoTile(k: Kit, o: LogoOption, on: boolean): string {
  const p = k.brand.palette;
  return `<button type="button" class="kl-tile${on ? " on" : ""}" role="radio" aria-checked="${on}" data-kit-logo="${esc(o.id)}" style="--k-bg:${p.bg};--k-ink:${p.ink}">
    <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">${o.svg}</svg>
    <b style="font-family:'${esc(k.brand.fonts.display)}',serif">${esc(k.brand.name)}</b>
    <span>${esc(o.idea)}</span>
  </button>`;
}
function logoBuiltIn(k: Kit): string {
  const L = k.logo!;
  return `<div class="kl-grid" role="radiogroup" aria-label="Logo options">${L.options.map((o) => logoTile(k, o, o.id === L.chosen)).join("")}</div>
    <div class="kp-acts">${L.options.length < 6 && !L.fallback ? `<button type="button" class="btn btn-ghost" data-kit-act="more"><span>Show 3 more</span></button>` : ""}</div>`;
}
type PlanGoal = string | { metric?: string; target?: number; unit?: string } | null | undefined;
type PlanWeek = { week?: number; n?: number; theme?: string; tasks?: Array<{ task: string }>; days?: Array<{ action: string }> };
type Plan = { goal?: PlanGoal; weeks?: PlanWeek[] };
/** The goal as one line, whether the plan stores it as text (old shape) or as an object (PlanV2). */
export function goalText(g: PlanGoal): string {
  if (!g) return "";
  if (typeof g === "string") return g;
  const n = typeof g.target === "number" && g.target > 0 ? `${g.target} ` : "";
  return `${n}${g.metric || g.unit || ""}`.trim();
}
function planBuiltIn(k: Kit): string {
  const P = (k.marketing?.plan ?? {}) as Plan;
  const goal = goalText(P.goal);
  const weeks = (Array.isArray(P.weeks) ? P.weeks : [])
    .map((w, i) => ({ n: w.week ?? w.n ?? i + 1, items: (w.tasks?.map((t) => t.task) ?? w.days?.map((d) => d.action) ?? []).filter((x) => typeof x === "string") }))
    .filter((w) => w.items.length);
  return `${goal ? `<p class="kpl-goal"><span class="eyebrow">Goal for the month</span><b>${esc(goal)}</b></p>` : ""}
    ${weeks.length ? `<ol class="kpl-weeks">${weeks.map((w) => `<li><b>Week ${w.n}</b><ul>${w.items.slice(0, 3).map((t) => `<li>${esc(t)}</li>`).join("")}</ul></li>`).join("")}</ol>` : `<p class="kp-sub">Your plan is being written.</p>`}`;
}

// ───────────────────────────── the screen (one skeleton; each panel body is replaced only when it changes)
function logoBody(k: Kit | null): string {
  const st = k?.status;
  if (!k || !st || st.logo === "queued" || st.logo === "working" || !k.logo)
    return st?.logo === "error" ? oops("Your logo hit a snag. Please reload in a minute.") : waiting(st?.brand === "done" ? "Drawing your logo options" : "Choosing your name and colours");
  return `<div data-kit-slot="logo">${logoBuiltIn(k)}</div>`;
}
function siteBody(k: Kit | null, url: string): string {
  const st = k?.status;
  if (!k || st?.site !== "done" || !k.site) return st?.site === "error" ? oops("Your website hit a snag. Please reload in a minute.") : waiting("Putting your website online");
  return `<div class="ks-live">
        <span class="ks-dot" aria-hidden="true"></span>
        <a class="ks-url" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(url)}"><span>${esc(k.brand.name)} is online</span><small>Open your website ${I.ext(12)}</small></a>
      </div>
      <div class="ks-row">
        ${url ? qrSvg(url) : ""}
        <div class="ks-btns">
          <button type="button" class="btn btn-primary" data-kit-act="copy" data-url="${esc(url)}"><span>Copy link</span></button>
          <p class="ks-note">Scan to open it on your phone. Share the link anywhere.</p>
        </div>
      </div>
      <span class="eyebrow ks-pick">Pick a design</span>
      <div class="ks-tpl" role="radiogroup" aria-label="Website design">${TEMPLATES.map((t) => `
        <button type="button" role="radio" aria-checked="${k.site!.template === t.id}" class="ks-t${k.site!.template === t.id ? " on" : ""}" data-kit-tpl="${t.id}">
          <span class="ks-thumb"><iframe src="${esc(url)}?preview=${t.id}" title="${esc(t.name)} design preview" loading="lazy" tabindex="-1" aria-hidden="true"></iframe></span>
          <b>${esc(t.name)}</b><span>${esc(t.note)}</span>
        </button>`).join("")}</div>`;
}
function planBody(k: Kit | null): string {
  const st = k?.status;
  if (!k || !st || st.marketing === "queued" || st.marketing === "working" || !k.marketing)
    return st?.marketing === "error" ? oops("Your plan hit a snag. Please reload in a minute.") : waiting("Writing your 30-day plan");
  return `<div data-kit-slot="plan"></div>`;
}
const headHtml = (k: Kit | null, ready: boolean, url = "") => {
  const L = chosenLogo(k);
  const live = !!k && k.status.site === "done" && !!k.site && !!url;
  return `
      ${L && k ? `<span class="kh-mark" style="background:${esc(k.brand.palette.bg)}"><svg viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">${L.svg}</svg></span>` : ""}
      <div class="kh-t">
        <span class="eyebrow">${ready ? "Ready" : "Making your launch kit"}</span>
        <h2 class="t-display kh-name"${k ? ` style="font-family:'${esc(k.brand.fonts.display)}',var(--f-display, serif)"` : ""}>${k ? esc(k.brand.name) : "Your launch kit"}</h2>
        ${live ? `<p class="kh-live"><span class="ks-dot" aria-hidden="true"></span>Your business is online</p>` : k?.brand.tagline ? `<p class="kit-tag">${esc(k.brand.tagline)}</p>` : ""}
      </div>
      ${live ? `<a class="btn btn-primary kh-open" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><span>Open your website</span>${I.ext(14)}</a>` : ""}`;
};

export function kitScreenHtml(data: KitPayload): string {
  const k = data.kit;
  const url = absolute(data.siteUrl);
  const siteReady = !!k && k.status.site === "done" && !!k.site;
  return `
  <section class="kit" aria-live="polite">
    <header class="kit-head" data-st data-kit-head>${headHtml(k, false, url)}</header>
    <div class="kit-panels">
      <article class="kp kp-logo" data-st><header><span class="kp-n">1</span><h3>Your logo</h3><p class="kp-hint">Pick the one that feels right. Your website updates on its own.</p></header><div class="kp-body" data-kit-body="logo">${logoBody(k)}</div></article>
      <article class="kp kp-site" data-st><header><span class="kp-n">2</span><h3 data-kit-site-title>${siteReady ? "Your website is live" : "Your website"}</h3></header><div class="kp-body" data-kit-body="site">${siteBody(k, url)}</div></article>
      <article class="kp kp-plan" data-st><header><span class="kp-n">3</span><h3>Your 30-day plan</h3></header><div class="kp-body" data-kit-body="plan">${planBody(k)}</div></article>
    </div>
    <footer class="kit-foot" data-st>
      <p class="kit-own">This page is yours on this device. Keep your private link to come back.</p>
      <button type="button" class="btn btn-ghost" data-kit-act="offices"><span>Your offices (soon)</span>${I.arrow(16)}</button>
    </footer>
  </section>`;
}

/** "Your offices" teaser: what comes after the kit. */
export function officesTeaserHtml(name: string): string {
  return `
  <section class="offices kit-offices">
    <header class="of-head"><h2 class="t-display">Your offices</h2><button class="btn btn-ghost btn-icon ov-x" data-act="close" type="button" aria-label="Close">${I.close(16)}</button></header>
    <p class="of-sub"><b>Coming next.</b> The team that made ${esc(name)} keeps working for you, and you pay only for each task you ask for.</p>
    <ul class="ko-list">
      <li>${I.report(18)}<span><b>Answer your customers</b>Replies to messages and reservations, in your voice.</span></li>
      <li>${I.brand(18)}<span><b>Post your plan</b>The texts of your 30-day plan, ready on the right day.</span></li>
      <li>${I.globe(18)}<span><b>Keep your website fresh</b>New offers and opening hours with one sentence from you.</span></li>
    </ul>
    <p class="of-sub">Each task is paid in Bitcoin Cash when you ask for it. No subscription.</p>
  </section>`;
}

// ───────────────────────────── optional WP2 / WP3 views
type Mod = Record<string, unknown>;
const VIEWS = import.meta.glob<Mod>(["./logo-picker.ts", "./plan-view.ts"]);
async function view(path: string): Promise<Mod | null> {
  const load = VIEWS[path];
  return load ? load().catch(() => null) : null;
}
type Picker = { update(result: LogoResult): void; destroy(): void };
type PickerMount = (el: HTMLElement, props: { brand: Kit["brand"]; result: LogoResult; onChoose: (id: string) => Promise<void>; onMore?: () => Promise<LogoResult> }) => Picker;
type PlanMount = (el: HTMLElement, props: Record<string, unknown>) => void;

// ───────────────────────────── mount + live polling
export function mountKitScreen(root: HTMLElement, o: KitScreenOpts): { stop(): void; refresh(): Promise<void> } {
  const api = o.api ?? "";
  let data: KitPayload = o.mock ?? { kit: null, slug: null, siteUrl: null, running: true };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let busy = false;
  const headers = () => ({ "content-type": "application/json", ...(o.ownerKey ? { "x-owner-key": o.ownerKey } : {}) });

  // The skeleton is built once; a poll only replaces a panel whose content changed (choices and tabs survive).
  const node = el(kitScreenHtml(data));
  root.replaceChildren(node);
  const body = (n: "logo" | "site" | "plan") => node.querySelector<HTMLElement>(`[data-kit-body="${n}"]`)!;
  const sig = { head: "", logo: "", site: "", plan: "" };
  let picker: Picker | null = null;

  const shown = { plan: false };
  const paintHead = () => {
    const k = data.kit;
    const url = absolute(data.siteUrl);
    const ready = isReady(k, shown);
    const head = `${ready}|${k?.brand.name ?? ""}|${k?.brand.tagline ?? ""}|${chosenLogo(k)?.id ?? ""}|${k?.status.site}|${url}`;
    if (head !== sig.head) {
      sig.head = head;
      node.querySelector<HTMLElement>("[data-kit-head]")!.innerHTML = headHtml(k, ready, url);
    }
  };
  // One panel failing to draw must never stop the others or the polling.
  const safe = async (what: string, f: () => unknown) => {
    try {
      await f();
    } catch (e) {
      console.error(`kit: ${what} view`, e);
    }
  };
  const render = async () => {
    await safe("head", paintHead);
    await safe("logo", renderLogo);
    await safe("site", renderSite);
    await safe("plan", renderPlan);
    await safe("head", paintHead);
  };
  const renderLogo = async () => {
    const k = data.kit;
    // Logo: mount the picker once; later option lists go through picker.update().
    const logo = `${k?.status.brand}|${k?.status.logo}|${k?.logo?.options.map((x) => x.id).join(",") ?? ""}`;
    if (logo !== sig.logo) {
      const first = !sig.logo.includes("|done|") || !picker;
      sig.logo = logo;
      if (picker && k?.logo && !first) picker.update(k.logo);
      else {
        picker?.destroy();
        picker = null;
        body("logo").innerHTML = logoBody(k);
        const slot = body("logo").querySelector<HTMLElement>('[data-kit-slot="logo"]');
        const mod = slot && k?.logo ? await view("./logo-picker.ts") : null;
        const mountPicker = mod?.mountLogoPicker as PickerMount | undefined;
        if (slot && k?.logo && mountPicker && !stopped) {
          slot.innerHTML = "";
          picker = mountPicker(slot, { brand: k.brand, result: k.logo, onChoose: (id) => choose(id), onMore: o.mock ? undefined : more });
        }
      }
    }
  };
  const renderSite = () => {
    const k = data.kit;
    const url = absolute(data.siteUrl);
    const site = `${k?.status.site}|${url}`;
    if (site !== sig.site) {
      sig.site = site;
      body("site").innerHTML = siteBody(k, url);
      node.querySelector("[data-kit-site-title]")!.textContent = k?.status.site === "done" && k.site ? "Your website is live" : "Your website";
    }
  };
  const renderPlan = async () => {
    const k = data.kit;
    const url = absolute(data.siteUrl);
    const plan = `${k?.status.marketing}|${k?.marketing ? "1" : "0"}|${url}`;
    if (plan === sig.plan) return;
    sig.plan = plan;
    shown.plan = false;
    body("plan").innerHTML = planBody(k);
    const slot = body("plan").querySelector<HTMLElement>('[data-kit-slot="plan"]');
    if (!slot || !k?.marketing) return;
    const mod = await view("./plan-view.ts");
    const mountPlan = mod?.mountPlanView as PlanMount | undefined;
    try {
      if (!mountPlan) throw new Error("no plan view");
      mountPlan(slot, { plan: k.marketing.plan, sources: k.marketing.sources ?? [], brand: k.brand, siteUrl: url, qrSvg: url ? qrSvg(url, 96) : "" });
    } catch (e) {
      if (mountPlan) console.error("kit: plan view", e);
      slot.innerHTML = planBuiltIn(k); // the simple view, so the plan always shows
    }
    shown.plan = true;
  };

  const load = async () => {
    if (o.mock) return;
    try {
      const r = await fetch(`${api}/api/projects/${encodeURIComponent(o.projectId)}/kit`);
      if (r.ok) data = (await r.json()) as KitPayload;
    } catch {
      /* offline for a moment: keep the last view */
    }
  };
  const tick = async () => {
    await load();
    if (stopped) return;
    await render();
    if (!o.mock && !stopped && (!isDone(data.kit) || data.running)) timer = setTimeout(tick, o.pollMs ?? 1500);
  };
  const post = async (path: string, payload: unknown): Promise<boolean> => {
    if (o.mock) return true;
    if (busy) return false;
    busy = true;
    try {
      const r = await fetch(`${api}/api/projects/${encodeURIComponent(o.projectId)}/kit/${path}`, { method: "POST", headers: headers(), body: JSON.stringify(payload) });
      const j = (await r.json().catch(() => ({}))) as { kit?: Kit; error?: string };
      if (j.kit) data = { ...data, kit: j.kit };
      else toast(root, j.error ?? "That did not work. Please try again.");
      await render();
      return !!j.kit;
    } catch {
      toast(root, "No connection. Please try again.");
      return false;
    } finally {
      busy = false;
    }
  };
  const choose = async (id: string) => {
    if (data.kit?.logo) data.kit.logo.chosen = id; // instant feedback, the server confirms
    if (!(await post("logo", { id }))) throw new Error("not saved"); // the picker rolls back
  };
  const more = async (): Promise<LogoResult> => {
    await post("logo/more", {});
    return data.kit!.logo!;
  };

  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const lg = t.closest<HTMLElement>("[data-kit-logo]");
    if (lg) {
      node.querySelectorAll<HTMLElement>("[data-kit-logo]").forEach((b) => {
        b.classList.toggle("on", b === lg);
        b.setAttribute("aria-checked", String(b === lg));
      });
      return void choose(lg.dataset.kitLogo!).catch(() => undefined);
    }
    const tp = t.closest<HTMLElement>("[data-kit-tpl]");
    if (tp) {
      const id = tp.dataset.kitTpl as SiteTemplate;
      if (data.kit?.site) data.kit.site.template = id;
      node.querySelectorAll<HTMLElement>("[data-kit-tpl]").forEach((b) => {
        b.classList.toggle("on", b === tp);
        b.setAttribute("aria-checked", String(b === tp));
      });
      return void post("site", { template: id }).then((ok) => ok && toast(root, "Your website now uses this design"));
    }
    const act = t.closest<HTMLElement>("[data-kit-act]")?.dataset.kitAct;
    if (act === "more") return void more();
    if (act === "offices") return o.onOffices?.(data.kit?.brand.name);
    if (act === "copy") {
      const url = t.closest<HTMLElement>("[data-url]")!.dataset.url!;
      void navigator.clipboard?.writeText(url).then(() => toast(root, "Link copied"), () => toast(root, url));
    }
  });

  void tick();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      picker?.destroy();
    },
    refresh: tick,
  };
}

function toast(root: HTMLElement, text: string) {
  const t = el(`<div class="kit-toast" role="status">${esc(text)}</div>`);
  root.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
