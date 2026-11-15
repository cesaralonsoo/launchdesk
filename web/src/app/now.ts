// Run view, right column (spec-v4 L15–L17, M5, R13, R18). Owner: WS2.
// Now card: what the team is doing right now (work log → highlight). Team list: who did what, in order.
// Everything here renders the director's `view`, never app.project.
import "./run.css";
import type { Project, Stage, WorkDept } from "../types";
import { STAGE_DEPTS, FONT_WHITELIST } from "../types";
import { renderLogo, renderMark } from "../pack/logo";
import { qrSvg } from "../site/qr";
import type { Beat } from "./director";
import { observedMs } from "./director";
import { esc, h, svg } from "./dom";
import { copyText } from "./modal";
import { checkDraw, enter, reduced, textSwap, countUp, DUR, EASE } from "./motion";
import { app, explorerTx, fmtUsd, isDevTx, isSkipped, phaseOf, provisionalTitle, type Phase } from "./state";
import { DELIVERABLE, DOING, TEAM, WORK_ORDER, workLog } from "./team";
import { avatar, iconSvg } from "./ui";

// ---------- shared helpers ----------

export const price = (s: Stage) => fmtUsd(app.config?.prices[s] ?? (s === "validate" ? 10 : 20));
const stageOf = (d: WorkDept): Stage => (STAGE_DEPTS.validate.includes(d) ? "validate" : "build");
export const brandOf = (p: Project) => p.results.nova?.names[p.results.nova.chosen] ?? null;
export const nameOf = (p: Project) => brandOf(p)?.name ?? p.results.mia?.title ?? provisionalTitle(p.idea);
export const isSample = (p: Project) => Object.values(p.payments).some((x) => x && isDevTx(x.txid));

const loadedFonts = new Set<string>();
/** R11 font loader (local copy until pack/util exports loadFonts): one Google Fonts <link> per family. */
export function ensureFont(family: string | undefined | null) {
  if (!family || loadedFonts.has(family) || !(FONT_WHITELIST as readonly string[]).includes(family)) return;
  loadedFonts.add(family);
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;600;700&display=swap`;
  document.head.append(l);
}
export const fontStack = (family: string | undefined | null) => (family ? `"${family.replace(/"/g, "")}", var(--font-display)` : "var(--font-display)");

/** "0:07" */
export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const secs = (ms: number) => `${Math.max(1, Math.round(ms / 1000))} s`;

/** One timer for every live "0:07" on the page. */
const ticking = new Set<HTMLElement>();
let tick = 0;
function live(el: HTMLElement, since: number) {
  el.dataset.since = String(since);
  el.textContent = clock(Date.now() - since);
  ticking.add(el);
  if (!tick)
    tick = window.setInterval(() => {
      ticking.forEach((x) => {
        if (!x.isConnected) return void ticking.delete(x);
        x.textContent = clock(Date.now() - Number(x.dataset.since));
      });
      if (!ticking.size) {
        clearInterval(tick);
        tick = 0;
      }
    }, 1000);
}

const COPY = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/></svg>`;
const check = (size = 16) => h("span", { class: "rn-check", "aria-hidden": "true", html: `<svg viewBox="0 0 16 16" width="${size}" height="${size}"><circle cx="8" cy="8" r="8" fill="var(--bch)"/><path d="M4.6 8.3l2.3 2.2 4.5-4.7" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>` });

/** Status pill copy when a department has delivered (spec-v4 §6). */
export function doneText(p: Project, d: WorkDept): string {
  const r = p.results;
  if (isSkipped(p, d)) return `${TEAM[d].name} was skipped`;
  switch (d) {
    case "mia":
      return `Mia: plan ready, ${r.mia?.checklist.length ?? 0} tasks`;
    case "leo": {
      const v = r.leo?.verdict;
      return `Leo: ${r.leo?.score.toFixed(1) ?? "?"}/10, ${v === "go" ? "worth a shot" : v === "pivot" ? "pivot first" : "not this one"}`;
    }
    case "sam":
      return `Sam: ${r.sam?.cash_needed.display ?? "the numbers"} to get started`;
    case "nova":
      return `Nova: meet ${brandOf(p)?.name ?? "your brand"}`;
    case "dex":
      return "Dex: logo and page ready";
    case "rae":
      return `Rae: ${r.rae?.posts.length ?? 0} posts scheduled`;
    case "pip":
      return `${nameOf(p)} is live`;
  }
}

export const snagText = (d: WorkDept) => `${TEAM[d].name} hit a snag.`;

// ---------- R13 highlights (one result per department, all fit 344px, nothing truncates) ----------

const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions) => {
  const t = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
  return Number.isNaN(t.getTime()) ? iso : t.toLocaleDateString("en-GB", opts);
};

/** Small projection chart for the Now card (revenue, costs dashed, break-even dot). */
export function miniChart(p: Project, w = 320, hgt = 120) {
  const sam = p.results.sam!;
  const ms = sam.months.slice(0, 12);
  if (ms.length < 2) return h("div");
  const max = Math.max(1, ...ms.flatMap((m) => [m.revenue, m.costs]));
  const pl = 2, pr = 2, pt = 10, pb = 20;
  const X = (i: number) => pl + (i / (ms.length - 1)) * (w - pl - pr);
  const Y = (v: number) => pt + (1 - v / max) * (hgt - pt - pb);
  const line = (k: "revenue" | "costs") => ms.map((m, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(m[k]).toFixed(1)}`).join("");
  const bi = sam.break_even.month ? ms.findIndex((m) => m.month === sam.break_even.month) : -1;
  const be = bi >= 0 ? `<circle cx="${X(bi).toFixed(1)}" cy="${Y(ms[bi]!.revenue).toFixed(1)}" r="4" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.5"/>` : "";
  const ticks = [0, Math.floor((ms.length - 1) / 2), ms.length - 1].map((i) => `<text x="${X(i).toFixed(1)}" y="${hgt - 4}" text-anchor="${i === 0 ? "start" : i === ms.length - 1 ? "end" : "middle"}">M${ms[i]!.month}</text>`).join("");
  const el = svg(
    `<svg class="rn-chart" viewBox="0 0 ${w} ${hgt}" role="img" aria-label="12-month estimate: revenue versus costs${bi >= 0 ? `, break-even in month ${sam.break_even.month}` : ""}"><line x1="${pl}" x2="${w - pr}" y1="${hgt - pb}" y2="${hgt - pb}" stroke="var(--line)"/><path class="c-cost" d="${line("costs")}"/><path class="c-rev draw" d="${line("revenue")}"/>${be}${ticks}</svg>`,
  );
  return el;
}

function kpiRow(items: Array<[string, string, string?]>) {
  return h(
    "div",
    { class: "rn-kpis" },
    items.map(([l, v, sub]) => h("div", { class: "rn-kpi" }, h("span", { class: "rn-kpi-l" }, l), h("b", { class: "rn-kpi-v" }, v), sub ? h("span", { class: "rn-kpi-s" }, sub) : null)),
  );
}

export function verdictLine(v: "go" | "pivot" | "no-go") {
  return v === "go" ? "Leo says go." : v === "pivot" ? "Leo says pivot first." : "Leo says no-go.";
}

function scoreRing(score: number, size = 64) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(10, score));
  const el = h(
    "div",
    { class: "rn-ring", style: `width:${size}px;height:${size}px`, role: "img", "aria-label": `Market score ${v.toFixed(1)} out of 10` },
    svg(`<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--fill)" stroke-width="5"/><circle class="rn-ring-v" cx="32" cy="32" r="${r}" fill="none" stroke="${v >= 7 ? "var(--bch)" : "var(--ink)"}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - v / 10)).toFixed(2)}" transform="rotate(-90 32 32)"/></svg>`),
    h("b", { class: "rn-ring-n", "data-count": v.toFixed(1) }, v.toFixed(1)),
  );
  return el;
}

export function highlight(p: Project, d: WorkDept): HTMLElement {
  const r = p.results;
  const box = h("div", { class: `rn-hl rn-hl-${d}` });
  switch (d) {
    case "mia": {
      const m = r.mia!;
      const week = m.checklist.filter((x) => x.week === 1).slice(0, 3);
      const top = week.length ? week : m.checklist.slice(0, 3);
      box.append(
        h("p", { class: "rn-lead" }, m.brief.concept),
        h(
          "dl",
          { class: "rn-dl" },
          h("dt", null, "For"), h("dd", null, m.brief.for),
          h("dt", null, "Goal"), h("dd", null, m.brief.goal),
        ),
        h("h4", { class: "rn-sub" }, "This week"),
        h("ul", { class: "rn-tasks" }, top.map((t) => h("li", null, h("span", { class: "rn-box", "aria-hidden": "true" }), h("span", null, t.task)))),
      );
      break;
    }
    case "leo": {
      const l = r.leo!;
      box.append(
        h("div", { class: "rn-leo" }, scoreRing(l.score), h("div", null, h("b", { class: "rn-verdict" }, verdictLine(l.verdict)), h("p", { class: "rn-muted" }, l.headline))),
        h("h4", { class: "rn-sub" }, "Closest competitors"),
        h(
          "ol",
          { class: "rn-comps" },
          [...l.competitors]
            .sort((a, b) => Math.abs(a.price - l.you.price) - Math.abs(b.price - l.you.price))
            .slice(0, 3)
            .map((c) => h("li", null, h("b", null, c.name), h("span", null, c.note))),
        ),
      );
      break;
    }
    case "sam": {
      const s = r.sam!;
      box.append(
        kpiRow([
          ["Cash needed", s.cash_needed.display],
          ["Break-even", s.break_even.month ? `Month ${s.break_even.month}` : "Not in year 1"],
          ["Price", s.price.display],
        ]),
        h("div", { class: "rn-chart-wrap" }, miniChart(p), h("div", { class: "rn-legend" }, h("span", { class: "lg-rev" }, "Revenue"), h("span", { class: "lg-cost" }, "Costs"), h("span", { class: "rn-est" }, "Estimate"))),
      );
      break;
    }
    case "nova": {
      const n = r.nova!;
      ensureFont(n.typography.display);
      box.append(
        h(
          "ul",
          { class: "rn-names" },
          n.names.slice(0, 3).map((x, i) =>
            h(
              "li",
              { class: i === n.chosen ? "is-chosen" : "" },
              h("span", { class: "rn-name", style: `font-family:${fontStack(n.typography.display)}` }, x.name),
              h("span", { class: "rn-dots", "aria-label": `Palette: ${x.palette.map((c) => c.name).join(", ")}` }, x.palette.slice(0, 4).map((c) => h("i", { style: `background:${c.hex}` }))),
              h("span", { class: "rn-tagline" }, x.tagline),
            ),
          ),
        ),
      );
      break;
    }
    case "dex": {
      const x = r.dex!;
      const b = brandOf(p);
      box.append(
        h("div", { class: "rn-logo", html: renderLogo(x.logos[0], b?.palette, b?.name ?? nameOf(p), 112) }),
        h("p", { class: "rn-headline", style: `font-family:${fontStack(r.nova?.typography.display)}` }, x.landing.headline),
        h("p", { class: "rn-muted" }, x.landing.subheadline),
      );
      break;
    }
    case "rae": {
      const x = r.rae!;
      const fp = x.first_posts[0];
      const b = brandOf(p);
      const bg = b?.palette[2]?.hex ?? "#F4EADF";
      const ink = b?.palette[0]?.hex ?? "#1D1D1F";
      ensureFont(r.nova?.typography.display);
      if (fp)
        box.append(
          h(
            "article",
            { class: "rn-post", style: `--pb:${esc(bg)};--pi:${esc(ink)}` },
            h("span", { class: "rn-post-k" }, `${fp.channel === "x" ? "X" : fp.channel[0]!.toUpperCase() + fp.channel.slice(1)}, ${fmtDay(fp.date, { weekday: "short", day: "numeric", month: "short" })}`),
            h("b", { class: "rn-post-t", style: `font-family:${fontStack(r.nova?.typography.display)}` }, fp.title),
            h("p", null, fp.text),
          ),
        );
      box.append(h("p", { class: "rn-meta" }, `${x.posts.length} posts from ${fmtDay(x.start_date, { weekday: "short", day: "numeric", month: "short" })}`));
      break;
    }
    case "pip": {
      const x = r.pip!;
      const path = `/s/${x.slug}`;
      const full = `${location.origin}${path}`;
      const frame = h("iframe", { class: "rn-site", src: path, loading: "lazy", title: `${nameOf(p)} live page`, tabindex: "-1", "aria-hidden": "true" });
      box.append(
        h(
          "div",
          { class: "rn-pip" },
          h("div", { class: "rn-phone" }, frame),
          h(
            "div",
            { class: "rn-pip-r" },
            h("div", { class: "rn-qr", html: qrSvg(full, { size: 96 }), role: "img", "aria-label": "QR code that opens your page on a phone" }),
            h("p", { class: "rn-meta" }, "Open it on your phone"),
          ),
        ),
        h(
          "div",
          { class: "rn-url well" },
          h("span", { class: "mono" }, `${location.host}${path}`),
          h("button", { type: "button", class: "rn-ib", "aria-label": "Copy link", onclick: () => void copyText(full, "Link copied"), html: COPY }),
          h("a", { class: "rn-ib", href: path, target: "_blank", rel: "noopener", "aria-label": "Open your site in a new tab", html: iconSvg("ext", 16) }),
        ),
      );
      break;
    }
  }
  return box;
}

/** Skeleton shaped like the final highlight, one sweep style (M5). */
function skeleton(d: WorkDept): HTMLElement {
  const bar = (w: number | string, hh = 12, cls = "") => h("i", { class: `sk ${cls}`, style: `width:${typeof w === "number" ? w + "%" : w};height:${hh}px` });
  const s = h("div", { class: `rn-skel rn-skel-${d}`, "aria-hidden": "true" });
  switch (d) {
    case "mia":
      s.append(bar(92, 14), bar(70, 14), h("div", { class: "sk-gap" }), bar(58), bar(76), h("div", { class: "sk-gap" }), bar(40, 10), bar(84), bar(72), bar(66));
      break;
    case "leo":
      s.append(h("div", { class: "sk-row" }, h("i", { class: "sk sk-circle", style: "width:64px;height:64px" }), h("div", { class: "sk-col" }, bar(70, 16), bar(92), bar(60))), h("div", { class: "sk-gap" }), bar(84), bar(76), bar(68));
      break;
    case "sam":
      s.append(h("div", { class: "sk-row sk-kpis" }, [0, 1, 2].map(() => h("div", { class: "sk-col" }, bar(60, 10), bar(80, 22)))), h("div", { class: "sk-gap" }), bar("100%", 120, "sk-block"));
      break;
    case "nova":
      s.append(...[0, 1, 2].map(() => h("div", { class: "sk-col sk-name" }, bar(52, 24), bar(36, 8))));
      break;
    case "dex":
      s.append(h("i", { class: "sk sk-sq", style: "width:112px;height:112px" }), bar(88, 18), bar(64));
      break;
    case "rae":
      s.append(bar("100%", 150, "sk-block"), bar(56));
      break;
    case "pip":
      s.append(h("div", { class: "sk-row" }, h("i", { class: "sk sk-sq", style: "width:126px;height:220px" }), h("i", { class: "sk sk-sq", style: "width:96px;height:96px" })), bar("100%", 40, "sk-block"));
      break;
  }
  return s;
}

// ---------- Now card ----------

export type NowActions = {
  pay: (s: Stage) => void;
  gate: () => void;
  pack: (section?: string) => void;
  retry: (d: WorkDept | null) => void;
  skipDept: (d: WorkDept) => void;
  skipAnimation: () => void;
  site: () => void;
};

const SECTION: Record<WorkDept, string> = { mia: "plan", leo: "market", sam: "numbers", nova: "brand", dex: "brand", rae: "launch", pip: "website" };

export function nowCard(act: NowActions) {
  const av = h("span", { class: "now-av" });
  let title = h("span", { class: "now-title" });
  let titleSubject = "";
  const meta = h("span", { class: "now-meta num" });
  const body = h("div", { class: "now-body" });
  const foot = h("div", { class: "now-foot" });
  const el = h("section", { class: "now surface", "aria-labelledby": "now-title" }, h("header", { class: "now-h" }, av, h("h2", { id: "now-title", class: "now-t" }, title), meta), body, foot);
  let key = "";
  let avKey = "";
  let logTimers: number[] = [];

  const setAvatar = (k: string, node: () => HTMLElement) => {
    if (avKey === k) return;
    avKey = k;
    av.replaceChildren(node());
  };
  /** Same subject (one department working -> done): animated swap. New subject: a fresh node, so a
   *  queued swap from the previous department can never leave its title on screen. */
  const setTitle = (t: string, subject = t) => {
    const same = subject === titleSubject;
    titleSubject = subject;
    if (!title.textContent) title.textContent = t;
    else if (same) textSwap(title, t);
    else if (title.textContent !== t) {
      const next = h("span", { class: "now-title" }, t);
      title.replaceWith(next);
      title = next;
      if (!reduced()) next.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: DUR.d2, easing: EASE.out });
    }
  };
  const clearLog = () => {
    logTimers.forEach(clearTimeout);
    logTimers = [];
  };

  /** M5 work log: always-true sub-steps, spaced over the expected time; the last one stays active. */
  function workLogEl(p: Project, d: WorkDept, since: number) {
    const lines = workLog(d, { searched: !!p.results.leo?.sources.length, slug: null });
    const med = app.stats?.medianMs?.[stageOf(d)];
    const per = med ? med / STAGE_DEPTS[stageOf(d)].length : stageOf(d) === "validate" ? 9000 : 6000;
    const step = Math.max(700, per / lines.length);
    const ol = h("ol", { class: "now-log", "aria-label": `${TEAM[d].name}'s steps` });
    const elapsed = Date.now() - since;
    lines.forEach((t, i) => {
      const li = h("li", null, h("span", { class: "nl-mark", "aria-hidden": "true" }), h("span", null, t));
      const at = i * step - elapsed;
      const show = () => {
        const prev = ol.lastElementChild as HTMLElement | null;
        if (prev) {
          prev.classList.remove("on");
          prev.classList.add("ok");
          const m = prev.querySelector(".nl-mark")!;
          m.innerHTML = `<svg viewBox="0 0 12 12" width="12" height="12"><path d="M2.5 6.3l2.2 2.1 4.8-4.9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
          void checkDraw(m.firstElementChild as SVGElement);
        }
        li.classList.add("on");
        ol.append(li);
        if (at > 0) void enter([li]);
      };
      if (at <= 0) show();
      else logTimers.push(window.setTimeout(show, at));
    });
    return ol;
  }

  let swapSeq = 0;
  function swapBody(nodes: Node[], animate: boolean) {
    const next = h("div", { class: "now-in" }, nodes);
    const seq = ++swapSeq;
    // Drop anything still fading from an earlier swap, so two bodies never stack.
    body.getAnimations().forEach((a) => a.cancel());
    while (body.childElementCount > 1) body.firstElementChild!.remove();
    const old = body.firstElementChild as HTMLElement | null;
    if (!animate || reduced() || !old) {
      body.replaceChildren(next);
      if (animate) void enter([next]);
      return next;
    }
    // Sequential, never a true crossfade: the old body leaves first (140ms ease-in), the new one
    // enters 120ms later (240ms ease-out), and the card height morphs so the team list slides.
    const h0 = body.offsetHeight;
    old.style.position = "absolute";
    old.style.inset = "0 0 auto 0";
    old.style.pointerEvents = "none";
    body.style.overflow = "clip";
    old.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-4px)" }], { duration: 140, easing: EASE.in, fill: "forwards" });
    body.append(next);
    next.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: DUR.d2 + 20, delay: 120, easing: EASE.out, fill: "backwards" });
    const h1 = body.offsetHeight;
    const done = () => {
      if (seq !== swapSeq) return;
      old.remove();
      body.style.overflow = "";
    };
    if (Math.abs(h1 - h0) > 1) {
      body.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: DUR.d3, easing: EASE.inOut });
    }
    window.setTimeout(done, 140);
    window.setTimeout(() => {
      if (seq === swapSeq) body.style.overflow = "";
    }, DUR.d3 + 140);
    return next;
  }

  function stagger(root: HTMLElement) {
    const kids = [...root.querySelectorAll<HTMLElement>(".rn-hl > *")];
    void enter(kids, { stagger: 40, max: 8 });
    // numbers count up, strokes draw (only on a fresh reveal)
    root.querySelectorAll<HTMLElement>("[data-count]").forEach((x) => void countUp(x, Number(x.dataset.count), { decimals: 1, ms: DUR.d5 }));
    root.querySelectorAll<SVGPathElement>(".draw").forEach((path) => {
      if (reduced()) return;
      const len = path.getTotalLength?.() || 400;
      path.style.strokeDasharray = String(len);
      path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: DUR.d5, easing: EASE.out, fill: "backwards" });
    });
    const ring = root.querySelector<SVGCircleElement>(".rn-ring-v");
    if (ring && !reduced()) {
      const c = Number(ring.getAttribute("stroke-dasharray"));
      ring.animate([{ strokeDashoffset: c }, { strokeDashoffset: Number(ring.getAttribute("stroke-dashoffset")) }], { duration: DUR.d5, easing: EASE.out, fill: "backwards" });
    }
  }

  let launchOpen = false;
  function phaseState(p: Project, ph: Phase) {
    const name = nameOf(p);
    switch (ph.kind) {
      case "unpaid":
        setAvatar("lobby", () => avatar("lobby", 40));
        setTitle(ph.stage === "validate" ? "Waiting for your payment" : "Ready to build");
        meta.textContent = "";
        return {
          k: `unpaid|${ph.stage}`,
          nodes: [h("p", { class: "now-p" }, ph.stage === "validate" ? "Mia, Leo and Sam start the moment your payment lands." : "Nova, Dex, Rae and Pip start the moment your payment lands.")],
          foot: [h("button", { type: "button", class: "btn primary block", onclick: () => act.pay(ph.stage) }, `Pay ${price(ph.stage)} with BCH`)],
        };
      case "gate": {
        const l = p.results.leo;
        const s = p.results.sam;
        setAvatar("you", () => avatar("you", 40));
        setTitle("Your call. Build it?");
        meta.textContent = "";
        return {
          k: `gate`,
          nodes: [
            l ? h("p", { class: "now-p" }, h("b", null, `${l.score.toFixed(1)}/10. `), verdictLine(l.verdict), s ? ` You'd need ${s.cash_needed.display} to get started.` : "") : null,
            h("p", { class: "now-p rn-muted" }, "You keep everything from Stage 1 either way."),
          ].filter(Boolean) as Node[],
          foot: [
            h("button", { type: "button", class: "btn primary block", onclick: act.gate }, "Review and decide"),
            h("button", { type: "button", class: "link now-link", onclick: () => act.pack("summary") }, "Read the full report →"),
          ],
        };
      }
      case "stopped":
        setAvatar("you", () => avatar("you", 40));
        setTitle("Report saved. Build any time.");
        meta.textContent = "";
        return {
          k: "stopped",
          nodes: [h("p", { class: "now-p" }, "Nothing else is charged. Your report stays here, and the team can build it whenever you're ready.")],
          foot: [
            h("button", { type: "button", class: "btn primary block", onclick: act.gate }, `Build it · ${price("build")}`),
            h("button", { type: "button", class: "link now-link", onclick: () => act.pack("summary") }, "Open your report →"),
          ],
        };
      case "done": {
        const b = brandOf(p);
        const pip = p.results.pip;
        if (launchOpen) {
          // The launch card is the focal thing: this card stays quiet, with what to do next.
          const next = p.results.memo?.next_7_days?.slice(0, 3) ?? [];
          setAvatar("you", () => avatar("you", 40));
          setTitle("Your first 7 days");
          meta.textContent = "";
          return {
            k: `done-quiet|${pip?.slug}`,
            nodes: next.length
              ? [h("ol", { class: "rn-tasks rn-next" }, next.map((t) => h("li", null, h("span", { class: "rn-box", "aria-hidden": "true" }), h("span", null, t))))]
              : [h("p", { class: "now-p rn-muted" }, "Your plan, numbers, brand and launch calendar are in your startup pack.")],
            foot: [h("button", { type: "button", class: "link now-link", onclick: () => act.pack("plan") }, "See the full plan →")],
          };
        }
        setAvatar(`brand|${b?.name}`, () => h("span", { class: "now-logo", html: renderMark(p.results.dex?.logos[0], b?.palette, name, 40, p.results.nova?.typography) }));
        setTitle(`${name} is live`);
        meta.textContent = "";
        return {
          k: `done|${pip?.slug}`,
          nodes: [
            b ? h("p", { class: "now-p rn-muted" }, b.tagline) : null,
            pip ? h("div", { class: "rn-url well" }, h("span", { class: "mono" }, `${location.host}/s/${pip.slug}`), h("button", { type: "button", class: "rn-ib", "aria-label": "Copy link", onclick: () => void copyText(`${location.origin}/s/${pip.slug}`, "Link copied"), html: COPY })) : null,
          ].filter(Boolean) as Node[],
          foot: [
            h("button", { type: "button", class: "btn primary block", onclick: () => act.pack() }, "Open your startup pack"),
            pip ? h("button", { type: "button", class: "btn block", onclick: act.site }, "Visit your site ↗") : null,
          ].filter(Boolean) as Node[],
        };
      }
      case "error":
        if (ph.dept) return null;
        setAvatar("err", () => avatar("lobby", 40));
        setTitle("We couldn't finish");
        meta.textContent = "";
        return {
          k: "stage-error",
          nodes: [h("p", { class: "now-p" }, "We couldn't finish. Your payment stays on this project: run it again for free.")],
          foot: [h("button", { type: "button", class: "btn primary block", onclick: () => act.retry(null) }, "Try again, free")],
        };
      default:
        return null;
    }
  }

  const update = (p: Project | null, beat: Beat | null, opts: { showSkip?: boolean; launchOpen?: boolean } = {}) => {
    el.hidden = !p;
    launchOpen = !!opts.launchOpen;
    if (!p) {
      key = "";
      clearLog();
      return;
    }
    const ph = phaseOf(p);
    // Which department the card is about: the beat, else an error, else the last one that delivered.
    let d: WorkDept | null = beat?.dept ?? (ph.kind === "error" ? ph.dept : null);
    if (!d && ph.kind === "working") d = [...WORK_ORDER].reverse().find((x) => p.status[x] === "done" && stageOf(x) === ph.stage) ?? null;
    if (!d || (!beat && ph.kind !== "working" && ph.kind !== "error")) {
      const st = phaseState(p, ph);
      if (st) {
        el.dataset.state = ph.kind;
        if (key !== st.k) {
          clearLog();
          const first = !key;
          key = st.k;
          swapBody(st.nodes, !first);
          foot.replaceChildren(...st.foot);
        }
        return;
      }
      if (!d) return;
    }
    const st = p.status[d];
    const t = TEAM[d];
    const working = st === "working" || st === "queued";
    el.dataset.state = st === "error" ? "error" : working ? "working" : "done";
    setAvatar(`${d}|${working}`, () => avatar(d!, 40, { working }));
    if (st === "error") {
      setTitle(snagText(d), d);
      meta.textContent = "";
      const k = `${d}|error|${p.attempts?.[d] ?? 0}`;
      if (key !== k) {
        key = k;
        clearLog();
        const canSkip = d === "nova" || d === "dex" || d === "rae";
        swapBody([h("p", { class: "now-p" }, h("span", { class: "now-err-dot", "aria-hidden": "true" }), `${t.name} couldn't finish ${t.snag}.`), h("p", { class: "now-p rn-muted" }, "You won't pay again for retries.")], true);
        foot.replaceChildren(
          h("button", { type: "button", class: "btn primary block", onclick: () => act.retry(d) }, "Try again, free"),
          canSkip ? h("button", { type: "button", class: "btn block", onclick: () => act.skipDept(d!) }, "Skip and continue") : "",
        );
      }
      return;
    }
    if (working) {
      setTitle(DOING[d], d);
      const since = Date.now() - (beat ? performance.now() - beat.startedAt : 0);
      const k = `${d}|working`;
      if (key !== k) {
        key = k;
        clearLog();
        const since0 = beat?.phase === "handover" || beat?.phase === "working" ? since : Date.now();
        const timer = h("span", { class: "num" });
        live(timer, since0);
        meta.replaceChildren(timer);
        swapBody([workLogEl(p, d, since0), skeleton(d)], true);
        foot.replaceChildren();
      }
      return;
    }
    // delivered
    setTitle(doneText(p, d), d);
    const k = `${d}|done`;
    if (key !== k) {
      const fresh = key === `${d}|working`;
      key = k;
      clearLog();
      const ms = observedMs(p.id, d);
      meta.textContent = ms ? secs(ms) : "";
      const node = swapBody([isSkipped(p, d) ? h("p", { class: "now-p rn-muted" }, `${TEAM[d].name} was skipped, so nothing was made here. The team carried on with what it had.`) : highlight(p, d)], fresh);
      if (fresh) stagger(node);
      const sec = SECTION[d];
      foot.replaceChildren(h("button", { type: "button", class: "link now-link", onclick: () => act.pack(sec) }, "Open in your pack →"));
    }
  };

  return { el, update };
}

// ---------- Team list (L16) + Money (L17) ----------

export type TeamActions = { open: (d: WorkDept) => void; gate: () => void };

type RowKey = WorkDept | "you";
const ROWS: RowKey[] = ["mia", "leo", "sam", "you", "nova", "dex", "rae", "pip"];

export function teamList(act: TeamActions) {
  const hl = h("span", { class: "tm-hl", "aria-hidden": "true" });
  const list = h("ol", { class: "tm-list" });
  const rows = new Map<RowKey, { li: HTMLElement; right: HTMLElement; av: HTMLElement; state: string }>();
  const divider = h("li", { class: "tm-div", "aria-hidden": "true" }, h("span", null, `Build · ${price("build")}`));
  for (const k of ROWS) {
    if (k === "nova") list.append(divider);
    const name = k === "you" ? "You" : TEAM[k].name;
    const del = k === "you" ? "Decide" : DELIVERABLE[k];
    const av = h("span", { class: "tm-av" }, avatar(k, 32));
    const right = h("span", { class: "tm-r" });
    const li = h(
      "li",
      { class: "tm-row", "data-row": k },
      h(
        "button",
        {
          type: "button",
          class: "tm-in",
          "aria-label": `${name}, ${del}`,
          onclick: () => {
            const r = rows.get(k)!;
            if (k === "you") return void (r.state === "wait" || r.state === "stopped" ? act.gate() : null);
            if (r.state === "done" || r.state === "working" || r.state === "error") act.open(k);
          },
        },
        av,
        h("span", { class: "tm-m" }, h("b", null, name), h("small", null, del)),
        right,
      ),
    );
    rows.set(k, { li, right, av, state: "" });
    list.append(li);
  }
  list.prepend(hl);

  const money = h("details", { class: "tm-money" });
  const el = h("section", { class: "team", "aria-label": "Your team" }, h("h3", { class: "tm-h" }, "Your team"), list, money);
  let hlOn: RowKey | null = null;

  function moveHl(to: RowKey | null) {
    if (hlOn === to) return;
    const first = hlOn === null;
    hlOn = to;
    if (!to) {
      hl.classList.remove("on");
      return;
    }
    const li = rows.get(to)!.li;
    const y = li.offsetTop;
    hl.style.height = `${li.offsetHeight}px`;
    if (first || reduced()) {
      hl.style.transition = "none";
      hl.style.transform = `translateY(${y}px)`;
      void hl.offsetWidth;
      hl.style.transition = "";
    } else hl.style.transform = `translateY(${y}px)`;
    hl.classList.add("on");
  }

  function renderMoney(p: Project) {
    const items: HTMLElement[] = [];
    (["validate", "build"] as Stage[]).forEach((s) => {
      const pay = p.payments[s];
      if (!pay) return;
      if (isDevTx(pay.txid)) {
        items.push(h("li", null, h("span", null, `${s === "validate" ? "Validate" : "Build"}: sample run`), h("span", { class: "tm-faint" }, "Not charged")));
        return;
      }
      items.push(
        h(
          "li",
          null,
          h("span", null, `Paid ${fmtUsd(pay.cents)}`),
          h("a", { href: explorerTx(pay.txid), target: "_blank", rel: "noopener", class: "tm-tx" }, "on-chain ↗"),
        ),
      );
      const depts = STAGE_DEPTS[s];
      const share = pay.cents / depts.length;
      depts.forEach((d) => {
        if (p.status[d] !== "done" || isSkipped(p, d)) return;
        items.push(h("li", { class: "tm-int" }, h("span", null, `Lobby → ${TEAM[d].name}`), h("span", { class: "num" }, `+$${(share / 100).toFixed(2)}`), h("span", { class: "tm-faint" }, "internal, not on-chain")));
      });
    });
    const k = JSON.stringify([p.payments, p.status]);
    if (money.dataset.key === k) return;
    money.dataset.key = k;
    const open = money.open;
    money.replaceChildren(
      h("summary", null, h("span", null, "Money"), h("span", { class: "chev", "aria-hidden": "true", html: iconSvg("chevronDown", 14) })),
      items.length ? h("ul", { class: "tm-led" }, items) : h("p", { class: "tm-faint" }, "No payments yet."),
    );
    money.open = open;
    money.hidden = !items.length;
  }

  const update = (p: Project | null, beat: Beat | null) => {
    el.hidden = !p;
    if (!p) return;
    const ph = phaseOf(p);
    const buildPaid = !!p.payments.build;
    divider.firstElementChild!.textContent = `Build · ${price("build")}`;
    let working: RowKey | null = null;
    for (const k of ROWS) {
      const r = rows.get(k)!;
      let state = "queued";
      if (k === "you") {
        state = buildPaid ? "done" : ph.kind === "gate" && !beat ? "wait" : ph.kind === "stopped" ? "stopped" : "queued";
      } else {
        const s = p.status[k];
        state = s === "done" && isSkipped(p, k) ? "skipped" : s === "done" ? "done" : s === "working" ? "working" : s === "error" ? "error" : "queued";
      }
      const prev = r.state;
      if (state === "working" || state === "wait" || state === "error") working = k;
      if (prev === state) continue;
      r.state = state;
      r.li.dataset.state = state;
      const stage2 = k !== "you" && STAGE_DEPTS.build.includes(k);
      r.li.classList.toggle("is-locked", stage2 && !buildPaid);
      r.av.replaceChildren(avatar(k, 32, { working: state === "working" }));
      if (state === "working") {
        const t = h("span", { class: "tm-live num" });
        const since = beat && beat.dept === k ? Date.now() - (performance.now() - beat.startedAt) : Date.now();
        live(t, since);
        r.right.replaceChildren(t);
      } else if (state === "done") {
        const ms = k === "you" ? null : observedMs(p.id, k);
        const c = check(16);
        r.right.replaceChildren(ms ? h("span", { class: "tm-dur num" }, secs(ms)) : "", c);
        if (prev === "working") void checkDraw(c.querySelector("svg")!);
      } else if (state === "skipped") {
        r.right.replaceChildren(h("span", { class: "tm-skip" }, "Skipped"));
      } else if (state === "error") {
        r.right.replaceChildren(h("span", { class: "tm-err" }, "Hit a snag"));
      } else if (state === "wait") {
        r.right.replaceChildren(h("span", { class: "tm-live" }, "Your call"));
      } else if (state === "stopped") {
        r.right.replaceChildren(h("span", { class: "tm-faint" }, "Stopped"));
      } else r.right.replaceChildren();
    }
    el.classList.toggle("build-paid", buildPaid);
    divider.classList.toggle("is-locked", !buildPaid);
    requestAnimationFrame(() => moveHl(working));
    renderMoney(p);
  };

  return { el, update };
}
