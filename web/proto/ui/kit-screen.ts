// WP4 · The Launch kit: the offer card after the report, and ONE result screen with three panels that fill in
// live: "Your logo" (WP2 picker), "Your website is live" (full link, Copy, QR, pick a design), "Your 30-day plan"
// (WP3 view). Plain words only. Data: GET /api/projects/:id/kit (server/kit-routes.ts), polled until done.
// The WP2/WP3 views are loaded when present (import.meta.glob tolerates a missing file); otherwise a simple
// built-in view is shown, so this screen works on its own.
import qrcode from "qrcode-generator";
import type { Kit, LogoOption, SiteTemplate } from "../../../server/kit-contract";
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
  onOffices?: () => void;
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
    <p class="ko-sub" data-st>Your logo, your website and your 30-day plan, made for this idea in about a minute.</p>
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
type Plan = { goal?: string; weeks?: Array<{ week: number; tasks?: Array<{ task: string; done_when?: string }>; title?: string }> };
function planBuiltIn(k: Kit): string {
  const P = (k.marketing?.plan ?? {}) as Plan;
  const weeks = (P.weeks ?? []).filter((w) => w.tasks?.length);
  return `${P.goal ? `<p class="kpl-goal"><span class="eyebrow">Goal for the month</span><b>${esc(P.goal)}</b></p>` : ""}
    ${weeks.length ? `<ol class="kpl-weeks">${weeks.map((w) => `<li><b>Week ${w.week}</b><ul>${w.tasks!.slice(0, 3).map((t) => `<li>${esc(t.task)}</li>`).join("")}</ul></li>`).join("")}</ol>` : `<p class="kp-sub">Your plan is being written.</p>`}`;
}

// ───────────────────────────── the screen
export function kitScreenHtml(data: KitPayload): string {
  const k = data.kit;
  const url = absolute(data.siteUrl);
  const st = k?.status;
  const logo = !k || !st || st.logo === "queued" || st.logo === "working" || !k.logo ? waiting(st?.brand === "done" ? "Drawing your logo options" : "Choosing your name and colours") : `<div data-kit-slot="logo">${logoBuiltIn(k)}</div>`;
  const siteReady = !!k && st?.site === "done" && !!k.site;
  const site = !siteReady
    ? st?.site === "error" ? oops("Your website hit a snag. We are on it.") : waiting("Putting your website online")
    : `<div class="ks-live">
        <span class="ks-dot" aria-hidden="true"></span>
        <a class="ks-url" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url.replace(/^https?:\/\//, ""))}</a>
      </div>
      <div class="ks-row">
        ${url ? qrSvg(url) : ""}
        <div class="ks-btns">
          <button type="button" class="btn btn-primary" data-kit-act="copy" data-url="${esc(url)}"><span>Copy link</span></button>
          <a class="btn btn-ghost" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><span>Open your website</span>${I.ext(14)}</a>
          <p class="ks-note">Scan to open it on your phone. Share the link anywhere.</p>
        </div>
      </div>
      <span class="eyebrow ks-pick">Pick a design</span>
      <div class="ks-tpl" role="radiogroup" aria-label="Website design">${TEMPLATES.map((t) => `
        <button type="button" role="radio" aria-checked="${k!.site!.template === t.id}" class="ks-t${k!.site!.template === t.id ? " on" : ""}" data-kit-tpl="${t.id}">
          <span class="ks-thumb"><iframe src="${esc(url)}?preview=${t.id}" title="${esc(t.name)} design preview" loading="lazy" tabindex="-1" aria-hidden="true"></iframe></span>
          <b>${esc(t.name)}</b><span>${esc(t.note)}</span>
        </button>`).join("")}</div>`;
  const plan = !k || !st || st.marketing === "queued" || st.marketing === "working" || !k.marketing ? waiting("Writing your 30-day plan") : `<div data-kit-slot="plan">${planBuiltIn(k)}</div>`;
  const done = isDone(k);
  return `
  <section class="kit" aria-live="polite">
    <header class="kit-head" data-st>
      <span class="eyebrow">${done ? "Ready" : "Making your launch kit"}</span>
      <h2 class="t-display">${k ? esc(k.brand.name) : "Your launch kit"}</h2>
      ${k?.brand.tagline ? `<p class="kit-tag">${esc(k.brand.tagline)}</p>` : ""}
    </header>
    <div class="kit-panels">
      <article class="kp kp-logo" data-st><header><span class="kp-n">1</span><h3>Your logo</h3></header>${logo}</article>
      <article class="kp kp-site" data-st><header><span class="kp-n">2</span><h3>${siteReady ? "Your website is live" : "Your website"}</h3></header>${site}</article>
      <article class="kp kp-plan" data-st><header><span class="kp-n">3</span><h3>Your 30-day plan</h3></header>${plan}</article>
    </div>
    <footer class="kit-foot" data-st>
      <p class="kit-own">This page is yours on this device. Keep your private link to come back.</p>
      <button type="button" class="btn btn-primary" data-kit-act="offices" disabled><span>Open your offices</span>${I.arrow(16)}<span class="kit-soon">tomorrow</span></button>
    </footer>
  </section>`;
}

// ───────────────────────────── optional WP2 / WP3 views
type Mod = Record<string, unknown>;
const VIEWS = import.meta.glob<Mod>(["./logo-picker.ts", "./plan-view.ts"]);
async function view(path: string): Promise<Mod | null> {
  const load = VIEWS[path];
  return load ? load().catch(() => null) : null;
}
type MountFn = (el: HTMLElement, props: Record<string, unknown>) => void;

// ───────────────────────────── mount + live polling
export function mountKitScreen(root: HTMLElement, o: KitScreenOpts): { stop(): void; refresh(): Promise<void> } {
  const api = o.api ?? "";
  let data: KitPayload = o.mock ?? { kit: null, slug: null, siteUrl: null, running: true };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let busy = false;
  const headers = () => ({ "content-type": "application/json", ...(o.ownerKey ? { "x-owner-key": o.ownerKey } : {}) });

  const render = async () => {
    const node = el(kitScreenHtml(data));
    root.replaceChildren(node);
    const k = data.kit;
    if (!k) return;
    const url = absolute(data.siteUrl);
    // WP2 picker and WP3 plan view replace the built-in views when they exist.
    const logoSlot = node.querySelector<HTMLElement>('[data-kit-slot="logo"]');
    const picker = logoSlot ? await view("./logo-picker.ts") : null;
    const mountPicker = picker?.mountLogoPicker as MountFn | undefined;
    if (logoSlot && mountPicker) mountPicker(logoSlot, { kit: k, logo: k.logo, brand: k.brand, onChoose: (id: string) => void choose(id), onMore: () => void more() });
    const planSlot = node.querySelector<HTMLElement>('[data-kit-slot="plan"]');
    const pv = planSlot ? await view("./plan-view.ts") : null;
    const mountPlan = pv?.mountPlanView as MountFn | undefined;
    if (planSlot && mountPlan) mountPlan(planSlot, { plan: k.marketing?.plan, sources: k.marketing?.sources ?? [], brand: k.brand, siteUrl: url, qrSvg: url ? qrSvg(url, 96) : "" });
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
    if (!o.mock && (!isDone(data.kit) || data.running)) timer = setTimeout(tick, o.pollMs ?? 1500);
  };
  const post = async (path: string, body: unknown) => {
    if (o.mock || busy) return;
    busy = true;
    try {
      const r = await fetch(`${api}/api/projects/${encodeURIComponent(o.projectId)}/kit/${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as { kit?: Kit; error?: string };
      if (j.kit) data = { ...data, kit: j.kit };
      else if (j.error) toast(root, j.error);
      await render();
    } finally {
      busy = false;
    }
  };
  const choose = (id: string) => {
    if (data.kit?.logo) data.kit.logo.chosen = id; // instant feedback, the server confirms
    return post("logo", { id });
  };
  const more = () => post("logo/more", {});

  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const lg = t.closest<HTMLElement>("[data-kit-logo]");
    if (lg) return void choose(lg.dataset.kitLogo!);
    const tp = t.closest<HTMLElement>("[data-kit-tpl]");
    if (tp) {
      if (data.kit?.site) data.kit.site.template = tp.dataset.kitTpl as SiteTemplate;
      return void post("site", { template: tp.dataset.kitTpl });
    }
    const act = t.closest<HTMLElement>("[data-kit-act]")?.dataset.kitAct;
    if (act === "more") return void more();
    if (act === "offices") return o.onOffices?.();
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
    },
    refresh: tick,
  };
}

function toast(root: HTMLElement, text: string) {
  const t = el(`<div class="kit-toast" role="status">${esc(text)}</div>`);
  root.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
