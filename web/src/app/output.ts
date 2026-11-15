// Deliverables shelf (spec-v4 L12, L20, R16, M6). Owner: WS2.
// Two groups ("Validate · $0.10", "Build · $0.20"), 7 tiles with a preview glyph and a short value.
// Renders the director's view. On the home screen it shows a labelled sample so visitors see what they get.
import "./run.css";
import type { Preorders, Project, WorkDept } from "../types";
import { STAGE_DEPTS } from "../types";
import { renderMark } from "../pack/logo";
import { esc, h } from "./dom";
import { checkDraw, reduced } from "./motion";
import { brandOf, ensureFont, fontStack, price } from "./now";
import { isSkipped, readyCount } from "./state";
import { TILE_TITLE, WORK_ORDER } from "./team";

/** Kept for callers that still map departments to pack tabs (v3 names). */
export const PACK_TAB: Record<WorkDept, string> = {
  mia: "plan", leo: "market", sam: "numbers", nova: "brand", dex: "brand", rae: "launch", pip: "website",
};

type Val = { big: string; sub: string; font?: string };

const fmtDay = (iso: string) => {
  const t = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
  return Number.isNaN(t.getTime()) ? "" : t.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** R16 tile value contract: hero value + qualifier, ≤ 14 characters each, computed client-side. */
function value(p: Project, d: WorkDept, pre: Preorders | null | undefined): Val | null {
  const r = p.results;
  switch (d) {
    case "mia":
      return r.mia ? { big: `${r.mia.checklist.length} tasks`, sub: `${new Set(r.mia.checklist.map((x) => x.week)).size || 4} weeks` } : null;
    case "leo":
      return r.leo ? { big: r.leo.score.toFixed(1), sub: r.leo.verdict === "go" ? "Go" : r.leo.verdict === "pivot" ? "Pivot" : "No-go" } : null;
    case "sam":
      return r.sam ? { big: r.sam.cash_needed.display, sub: "to start" } : null;
    case "nova": {
      const b = brandOf(p);
      return b ? { big: b.name, sub: "3 names", font: r.nova?.typography.display } : null;
    }
    case "dex": {
      const b = brandOf(p);
      return r.dex ? { big: b?.name ?? "Logo", sub: "3 concepts", font: r.nova?.typography.display } : null;
    }
    case "rae":
      return r.rae ? { big: `${r.rae.posts.length} posts`, sub: fmtDay(r.rae.start_date) ? `from ${fmtDay(r.rae.start_date)}` : "30 days" } : null;
    case "pip":
      if (!r.pip) return null;
      // n from F11; null = couldn't check, so we say nothing rather than "0".
      return { big: "Live", sub: pre ? `${pre.count} pre-order${pre.count === 1 ? "" : "s"}` : `/s/${r.pip.slug}` };
  }
}

// ---------- preview glyphs (40px tall, monochrome; brand colour only for brand things) ----------

function glyph(p: Project | null, d: WorkDept): string {
  const r = p?.results;
  switch (d) {
    case "mia": {
      // 4 weeks × 7 rows: one cell per task in its week
      const counts = [1, 2, 3, 4].map((w) => r?.mia?.checklist.filter((x) => x.week === w).length ?? 0);
      let cells = "";
      for (let w = 0; w < 4; w++)
        for (let i = 0; i < 7; i++) {
          const on = i < (counts[w] ?? 0);
          cells += `<rect x="${w * 11}" y="${i * 5.6}" width="9" height="4" rx="1.5" class="${on ? "g-on" : "g-off"}"/>`;
        }
      return `<svg viewBox="0 0 42 40" width="42" height="40" class="g g-plan">${cells}</svg>`;
    }
    case "leo": {
      const v = r?.leo ? Math.max(0, Math.min(10, r.leo.score)) : 0;
      const c = 2 * Math.PI * 16;
      return `<svg viewBox="0 0 40 40" width="40" height="40" class="g g-ring"><circle cx="20" cy="20" r="16" class="g-track"/><circle cx="20" cy="20" r="16" class="g-val draw-loop" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - (v || 6.5) / 10)).toFixed(1)}" transform="rotate(-90 20 20)" style="${v >= 7 ? "stroke:var(--bch)" : ""}"/></svg>`;
    }
    case "sam": {
      const ms = r?.sam?.months.slice(0, 12) ?? [];
      const w = 72, hh = 36;
      if (ms.length < 2) return `<svg viewBox="0 0 ${w} 40" width="${w}" height="40" class="g g-spark"><path class="g-line draw-loop" d="M2,32 C20,31 30,26 40,18 S60,6 70,5"/></svg>`;
      const vals = ms.map((m) => m.cash);
      const lo = Math.min(...vals, 0), hi = Math.max(...vals, 0);
      const X = (i: number) => 2 + (i / (ms.length - 1)) * (w - 4);
      const Y = (v: number) => 2 + (1 - (v - lo) / Math.max(1, hi - lo)) * (hh - 4);
      const d0 = vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
      const bi = r?.sam?.break_even.month ? ms.findIndex((m) => m.month === r.sam!.break_even.month) : -1;
      const dot = bi >= 0 ? `<circle cx="${X(bi).toFixed(1)}" cy="${Y(vals[bi]!).toFixed(1)}" r="3" class="g-dot"/>` : "";
      return `<svg viewBox="0 0 ${w} 40" width="${w}" height="40" class="g g-spark"><line x1="2" x2="${w - 2}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="g-zero"/><path class="g-line" d="${d0}"/>${dot}</svg>`;
    }
    case "nova": {
      const pal = brandOf(p ?? ({ results: {} } as Project))?.palette;
      const dots = [0, 1, 2, 3].map((i) => `<circle cx="${6 + i * 13}" cy="20" r="5" style="${pal?.[i] ? `fill:${esc(pal[i]!.hex)}` : ""}" class="${pal ? "g-sw" : "g-off"}"/>`).join("");
      return `<svg viewBox="0 0 48 40" width="48" height="40" class="g g-dots">${dots}</svg>`;
    }
    case "dex": {
      if (r?.dex) {
        const b = brandOf(p!);
        return `<span class="g-logo">${renderMark(r.dex.logos[0], b?.palette, b?.name ?? "", 40, r.nova?.typography)}</span>`;
      }
      return `<svg viewBox="0 0 40 40" width="40" height="40" class="g g-logo-e"><circle cx="20" cy="20" r="17" class="g-line draw-loop"/><path d="M13 22l5-8 4 6 3-4 3 6" class="g-line"/></svg>`;
    }
    case "rae": {
      const days = new Set(r?.rae?.posts.map((x) => x.day) ?? []);
      let c = "";
      for (let i = 0; i < 30; i++) {
        const x = (i % 6) * 8 + 3, y = Math.floor(i / 6) * 8 + 3;
        c += `<circle cx="${x}" cy="${y}" r="2.4" class="${days.has(i + 1) ? (i === 0 ? "g-bch" : "g-on") : "g-off"}"/>`;
      }
      return `<svg viewBox="0 0 46 40" width="46" height="40" class="g g-cal">${c}</svg>`;
    }
    case "pip":
      return `<svg viewBox="0 0 26 40" width="26" height="40" class="g g-phone"><rect x="1" y="1" width="24" height="38" rx="5" class="g-line"/><rect x="5" y="8" width="16" height="3" rx="1.5" class="${r?.pip ? "g-on" : "g-off"}"/><rect x="5" y="14" width="11" height="2" rx="1" class="g-off"/><rect x="5" y="27" width="16" height="5" rx="2.5" class="${r?.pip ? "g-bch" : "g-off"}"/></svg>`;
  }
}

// ---------- sample values for the home shelf (L12): labelled "Sample", never presented as the visitor's ----------

let sample: Project | null = null;
let sampleAsked = false;
async function loadSample(cb: () => void) {
  if (sampleAsked) return;
  sampleAsked = true;
  try {
    const { api } = await import("../api");
    sample = await api.get("example");
    cb();
  } catch {
    /* no seeded example on this server: the shelf stays empty but labelled */
  }
}

const CHECK = `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="var(--bch)"/><path d="M5.8 10.3l2.8 2.7 5.6-5.8" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export type ShelfOpts = { preorders?: Preorders | null };

export function liveOutput(onOpen: (d: WorkDept) => void) {
  const count = h("span", { class: "sh-count num", "aria-live": "off" });
  const sampleCap = h("span", { class: "sh-sample" }, "Sample");
  const tiles = new Map<WorkDept, { b: HTMLButtonElement; key: string; state: string }>();
  const group = (stage: "validate" | "build") => {
    const ul = h("ul", { class: "sh-tiles" });
    for (const d of STAGE_DEPTS[stage]) {
      const b = h("button", { type: "button", class: "tile2", "data-dept": d, onclick: () => b.getAttribute("aria-disabled") !== "true" && onOpen(d) });
      tiles.set(d, { b, key: "", state: "" });
      ul.append(h("li", null, b));
    }
    const head = h("span", { class: "sh-gh", "data-stage": stage });
    return h("div", { class: `sh-group sh-${stage}` }, head, ul);
  };
  const g1 = group("validate");
  const g2 = group("build");
  const el = h(
    "section",
    { class: "shelf", "aria-label": "Your deliverables" },
    h("div", { class: "sh-h" }, sampleCap, count),
    h("div", { class: "sh-row" }, g1, g2),
  );
  let shown = -1;

  let last: { p: Project | null; opts: ShelfOpts } = { p: null, opts: {} };
  const render = (p: Project | null, opts: ShelfOpts = {}) => {
    last = { p, opts };
    const home = !p;
    // The sample arrives later: re-render whatever is on screen by then (a project may have opened meanwhile).
    if (home && !sample) void loadSample(() => render(last.p, last.opts));
    const src = home ? sample : p;
    el.classList.toggle("is-sample", home);
    sampleCap.hidden = !home;
    el.querySelector<HTMLElement>('[data-stage="validate"]')!.textContent = `Validate · ${price("validate")}`;
    el.querySelector<HTMLElement>('[data-stage="build"]')!.textContent = `Build · ${price("build")}`;
    const n = home ? 0 : readyCount(p);
    count.hidden = home;
    if (n !== shown) {
      const txt = `${n} of 7 ready`;
      if (shown >= 0 && !reduced()) {
        // digit roll (220ms)
        count.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(-6px)", opacity: 0 }], { duration: 110, easing: "cubic-bezier(.55,0,1,.45)" }).finished.then(() => {
          count.textContent = txt;
          count.animate([{ transform: "translateY(6px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], { duration: 220, easing: "cubic-bezier(.22,1,.36,1)" });
        }, () => (count.textContent = txt));
      } else count.textContent = txt;
      shown = n;
      count.classList.toggle("all", n === 7);
    }
    const anyWorking = !!p && WORK_ORDER.some((d) => p.status[d] === "working");
    for (const d of WORK_ORDER) {
      const t = tiles.get(d)!;
      const st = !p ? "sample" : p.status[d] === "done" && isSkipped(p, d) ? "skipped" : p.status[d] === "done" && p.results[d] ? "done" : p.status[d] === "working" ? "working" : p.status[d] === "error" ? "error" : "empty";
      const v = src && (st === "done" || st === "sample") ? value(src, d, d === "pip" ? opts.preorders : undefined) : null;
      const key = `${st}|${v ? JSON.stringify(v) : ""}|${src ? JSON.stringify(src.results[d] ?? null).length : 0}`;
      if (t.key === key) continue;
      const fresh = t.state === "working" && st === "done";
      t.key = key;
      t.state = st;
      const b = t.b;
      b.className = `tile2 is-${st}`;
      const ready = st === "done";
      b.setAttribute("aria-disabled", String(!ready));
      b.tabIndex = ready ? 0 : -1;
      b.setAttribute("aria-label", `${TILE_TITLE[d]}: ${ready && v ? `${v.big}, ${v.sub}. Open in your pack` : st === "working" ? "being made now" : st === "error" ? "hit a snag" : st === "skipped" ? "skipped" : st === "sample" ? "sample" : "not made yet"}`);
      if (v?.font) ensureFont(v.font);
      const status = ready ? `<span class="t2-st t2-ok">${CHECK}</span>` : st === "skipped" ? `<span class="t2-st"><i class="t2-dash" aria-hidden="true"></i></span>` : st === "working" ? `<span class="t2-st"><i class="t2-dot work"></i></span>` : st === "error" ? `<span class="t2-st"><i class="t2-dot err"></i></span>` : `<span class="t2-st"></span>`;
      const big = st === "skipped" ? `<b class="t2-v t2-skip">Skipped</b><span class="t2-q">Nothing was made</span>` : v ? `<b class="t2-v"${v.font && (d === "nova" || d === "dex") ? ` style="font-family:${esc(fontStack(v.font))}"` : ""}>${esc(v.big)}</b><span class="t2-q">${esc(v.sub)}</span>` : `<b class="t2-v t2-empty" aria-hidden="true"></b><span class="t2-q">${st === "working" ? "Working" : st === "error" ? "Hit a snag" : ""}</span>`;
      b.innerHTML = `<span class="t2-t">${esc(TILE_TITLE[d])}</span>${status}<span class="t2-g">${glyph(src && (v || st === "sample") ? src : null, d)}</span><span class="t2-val">${big}</span>`;
      if (fresh && !reduced()) {
        // M6: only the newest tile animates
        b.animate([{ backgroundColor: "rgba(118,118,128,.08)" }, { backgroundColor: "#fff" }], { duration: 300, easing: "cubic-bezier(.22,1,.36,1)" });
        b.querySelector<HTMLElement>(".t2-val")?.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: 420, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" });
        b.animate([{ transform: "scale(1)" }, { transform: "scale(1.03)", offset: 0.45 }, { transform: "scale(1)" }], { duration: 280, easing: "linear(0, .22 6%, .55 14%, .8 24%, .94 35%, 1.008 50%, 1.012 62%, 1.003 80%, 1)" });
        const ok = b.querySelector<SVGElement>(".t2-ok svg");
        if (ok) {
          ok.style.opacity = "0";
          setTimeout(() => {
            ok.style.opacity = "1";
            void checkDraw(ok);
          }, 240);
        }
      }
    }
    el.classList.toggle("has-working", anyWorking);
  };
  render(null);
  return { el, render };
}
