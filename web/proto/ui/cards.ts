// Result cards, one design per deliverable (WS-C). One hero, up to three supporting facts, Next.
// Every figure comes from data/sample.ts (PAUSA). Markup only: motion is CSS + countUp().
import { BUILD_DEPTS, ROOM_META, VALIDATE_DEPTS, type Dept } from "../contracts";
import {
  BRAND, BRAND_FONTS, BRAND_NAME, CASH_CURVE, CHANNEL_COUNT, CHANNEL_LABEL, DEX, LEO, NOVA, PIP, POSTS, RAE, SAM, TASKS, WEEKS, pal,
} from "../data/sample";
import { esc } from "./dom";
import { I, avatar, cupMark } from "./icons";

const brandFont = `'${BRAND_FONTS.display}', Georgia, serif`;
const brandBody = `'${BRAND_FONTS.body}', system-ui, sans-serif`;
export const BRAND_FONT_HREF = `https://fonts.googleapis.com/css2?family=${BRAND_FONTS.display.replace(/ /g, "+")}:opsz,wght@9..144,500;9..144,600;9..144,700&family=${BRAND_FONTS.body.replace(/ /g, "+")}:wght@400;500;600&display=swap`;

const num = (v: number, dec = 0, pre = "", suf = "", delay = 140) =>
  `<span class="n" data-count="${v}" data-dec="${dec}" data-pre="${esc(pre)}" data-suf="${esc(suf)}" data-delay="${delay}">${pre}${v.toFixed(dec)}${suf}</span>`;

const head = (d: Dept, title: string) => `
  <header class="c-head" data-st>
    ${avatar(d, 30)}
    <div class="c-who"><b>${ROOM_META[d].name}</b><span>${esc(title)}</span></div>
    <span class="c-done" title="Done">${I.check(14)}</span>
  </header>`;

const foot = (d: Dept) => {
  const list = VALIDATE_DEPTS.includes(d) ? VALIDATE_DEPTS : BUILD_DEPTS;
  const i = list.indexOf(d) + 1;
  const last = i === list.length;
  const label = last ? (list === VALIDATE_DEPTS ? "See verdict" : "See it live") : "Next";
  return `
  <footer class="c-foot" data-st>
    <span class="c-step">${i} of ${list.length}</span>
    <button class="btn btn-primary btn-next" data-act="next" type="button">
      <span>${label}</span>${I.arrow(16)}<i class="auto" aria-hidden="true"></i>
    </button>
  </footer>`;
};

// ───────────────────────────────────────────── Mia · plan

function mia(): string {
  const first = TASKS.slice(0, 3);
  return `
  ${head("mia", "Your plan")}
  <div class="c-hero" data-st>
    <div class="hero-pair"><b class="big">${num(TASKS.length)}</b><span>tasks</span></div>
    <div class="hero-pair"><b class="big">${num(WEEKS.length)}</b><span>weeks</span></div>
  </div>
  <div class="c-body">
    <div class="weeks" data-st>
      ${WEEKS.map((w, i) => `<div class="wk"><div class="wk-bars">${w.map(() => `<i></i>`).join("")}</div><span>W${i + 1}</span></div>`).join("")}
    </div>
    <ol class="tasks" data-st>
      ${first.map((t, i) => `<li><span class="t-i">${i + 1}</span><span class="t-txt">${esc(t.task)}</span><span class="t-h">${t.est_hours}h</span></li>`).join("")}
    </ol>
  </div>
  ${foot("mia")}`;
}

// ───────────────────────────────────────────── Leo · market score

export function ring(score: number, size = 92, stroke = 7): string {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="--c:${c.toFixed(1)};--k:${(score / 10).toFixed(3)}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-width="${stroke}" stroke-dasharray="${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

function leo(): string {
  const verdict = LEO.verdict === "go" ? "Go" : LEO.verdict === "pivot" ? "Pivot first" : "No-go";
  return `
  ${head("leo", "Market score")}
  <div class="c-hero hero-score" data-st>
    <div class="score">${ring(LEO.score)}<b class="big">${num(LEO.score, 1)}</b></div>
    <div class="score-side">
      <span class="pill pill-pos">${verdict}</span>
      <p class="headline">${esc(LEO.headline)}</p>
    </div>
  </div>
  <div class="c-body">
    <ul class="signals" data-st>
      ${LEO.signals.map((s) => `<li><span class="s-name">${esc(s.name)}</span><span class="s-bar"><i style="--v:${s.score / 10}"></i></span><span class="s-v">${num(s.score, 1, "", "", 260)}</span></li>`).join("")}
    </ul>
  </div>
  ${foot("leo")}`;
}

// ───────────────────────────────────────────── Sam · numbers

export function cashCurve(w = 320, h = 96): string {
  const xs = CASH_CURVE.map((p) => p.month);
  const ys = CASH_CURVE.map((p) => p.cash);
  const minY = Math.min(...ys), maxY = 0;
  const pad = { l: 4, r: 4, t: 10, b: 14 };
  const X = (m: number) => pad.l + ((m - xs[0]!) / (xs[xs.length - 1]! - xs[0]!)) * (w - pad.l - pad.r);
  const Y = (v: number) => pad.t + ((maxY - v) / (maxY - minY)) * (h - pad.t - pad.b);
  const pts = CASH_CURVE.map((p) => [X(p.month), Y(p.cash)] as const);
  // smooth path (Catmull-Rom → Bézier)
  let d = `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]!.toFixed(1)},${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)},${c2[1]!.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const area = `${d} L${pts[pts.length - 1]![0].toFixed(1)},${Y(0).toFixed(1)} L${pts[0]![0].toFixed(1)},${Y(0).toFixed(1)}Z`;
  const low = SAM.cash_needed.month;
  const lowP = pts[low]!;
  const be = SAM.break_even.month;
  const beX = be != null ? X(be) : null;
  return `<svg class="curve" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="${h}" aria-label="Cumulative cash, 12 months">
    <line x1="0" x2="${w}" y1="${Y(0)}" y2="${Y(0)}" class="cv-zero"/>
    <path d="${area}" class="cv-area"/>
    <path d="${d}" class="cv-line" pathLength="1"/>
    ${beX != null ? `<line x1="${beX}" x2="${beX}" y1="${pad.t - 4}" y2="${h - pad.b + 2}" class="cv-be"/>` : ""}
    <circle cx="${lowP[0]}" cy="${lowP[1]}" r="3.5" class="cv-dot"/>
  </svg>
  <div class="cv-legend"><span>Month 0</span>${beX != null ? `<span style="left:${((beX / w) * 100).toFixed(1)}%" class="cv-be-l">Break-even</span>` : ""}<span>Month 12</span></div>`;
}

function sam(): string {
  return `
  ${head("sam", "Numbers")}
  <div class="c-hero" data-st>
    <div class="hero-stack"><b class="big">${num(Math.round(SAM.cash_needed.value / 1000), 0, SAM.currency, "k")}</b><span>Cash to start</span></div>
  </div>
  <div class="c-body">
    <div class="curve-wrap" data-st>${cashCurve()}</div>
    <dl class="kpis" data-st>
      <div><dt>Price</dt><dd>${num(SAM.price.value, 2, SAM.currency)}</dd></div>
      <div><dt>Break-even</dt><dd>${SAM.break_even.month != null ? `Month ${num(SAM.break_even.month)}` : "Not in year 1"}</dd></div>
      <div><dt>Sales a day</dt><dd>${num(SAM.breakeven_units_per_day)}</dd></div>
    </dl>
  </div>
  ${foot("sam")}`;
}

// ───────────────────────────────────────────── Nova · name & brand

export function brandTile(big = true): string {
  return `<div class="brand-tile ${big ? "" : "sm"}" style="--b-bg:${pal("Background")};--b-ink:${pal("Primary")};--b-acc:${pal("Accent")};--b-font:${brandFont};--b-body:${brandBody}">
    <b class="b-name">${esc(BRAND.name)}</b><span class="b-tag">${esc(BRAND.tagline)}</span></div>`;
}

function nova(): string {
  const alts = NOVA.names.filter((_, i) => i !== NOVA.chosen);
  return `
  ${head("nova", "Name & brand")}
  <div class="c-hero" data-st>${brandTile()}</div>
  <div class="c-body">
    <div class="swatches" data-st>${BRAND.palette.map((c) => `<span class="sw"><i style="background:${c.hex}"></i><em>${c.hex}</em></span>`).join("")}</div>
    <div class="alts" data-st><span class="lbl">Also</span>${alts.map((a) => `<span class="alt" style="--a:${a.palette[1]!.hex}"><b style="font-family:${brandFont}">${esc(a.name)}</b><em>${esc(a.tagline)}</em></span>`).join("")}</div>
  </div>
  ${foot("nova")}`;
}

// ───────────────────────────────────────────── Dex · logo & site

export function logo(i: number, size: "lg" | "sm" = "lg"): string {
  const L = DEX.logos[i]!;
  const w = L.wordmark;
  const name = w.case === "upper" ? BRAND_NAME.toUpperCase() : w.case === "lower" ? BRAND_NAME.toLowerCase() : BRAND_NAME;
  const ink = pal("Primary"), acc = pal("Accent");
  const mark =
    L.shape === "monogram" ? `<span class="lg-mono" style="background:${ink};color:${pal("Background")}">${esc(L.monogram)}</span>`
    : L.shape === "emblem" ? `<span class="lg-emb" style="border-color:${ink};color:${acc}">${cupMark(size === "lg" ? 22 : 16, acc)}</span>`
    : `<span class="lg-icon">${cupMark(size === "lg" ? 34 : 20, acc)}</span>`;
  return `<div class="logo ${size} pl-${w.placement}" style="--l-ink:${ink};--l-bg:${pal("Background")};font-family:${brandFont}">
    ${mark}<span class="lg-word" style="font-weight:${w.weight};letter-spacing:${w.letter_spacing_em}em">${esc(name)}</span></div>`;
}

/** Just the symbol of logo i, for 32 px swatches. */
function logoMark(i: number): string {
  const L = DEX.logos[i]!;
  const ink = pal("Primary"), acc = pal("Accent");
  return L.shape === "monogram" ? `<span class="lg-mono" style="background:${ink};color:${pal("Background")};font-family:${brandFont}">${esc(L.monogram)}</span>`
    : L.shape === "emblem" ? `<span class="lg-emb" style="border-color:${ink};color:${acc}">${cupMark(14, acc)}</span>`
    : cupMark(20, acc);
}

function dex(): string {
  return `
  ${head("dex", "Logo & site")}
  <div class="c-hero" data-st><div class="logo-stage" style="background:${pal("Background")}">${logo(0, "lg")}</div></div>
  <div class="c-body">
    <div class="logo-alts" data-st><span class="lbl">Also drawn</span>${DEX.logos.slice(1).map((_, i) => `<span class="logo-sw" style="background:${pal("Background")}">${logoMark(i + 1)}</span>`).join("")}</div>
    <div class="landing-mini" data-st>
      <span class="lm-url">${I.globe(12)}<span>${esc(PIP.url)}</span></span>
      <b style="font-family:${brandFont}">${esc(DEX.landing.headline)}</b>
      <span class="lm-cta" style="background:${pal("Primary")};color:${pal("Background")}">${esc(DEX.landing.cta)}</span>
    </div>
  </div>
  ${foot("dex")}`;
}

// ───────────────────────────────────────────── Rae · 30-day launch

const CH_COL: Record<string, string> = { instagram: pal("Accent"), tiktok: pal("Primary"), email: pal("Extra"), linkedin: "var(--c-muted)", x: "var(--c-muted)" };

function rae(): string {
  const byDay = new Map(POSTS.map((p) => [p.day, p]));
  const start = new Date(RAE.start_date + "T12:00:00");
  const offset = (start.getDay() + 6) % 7; // Monday-first grid
  const cells: string[] = [];
  for (let i = 0; i < offset; i++) cells.push(`<i class="cd pad"></i>`);
  for (let d = 1; d <= 30; d++) {
    const p = byDay.get(d);
    cells.push(p ? `<i class="cd on" style="--ch:${CH_COL[p.channel]}" title="Day ${d} · ${CHANNEL_LABEL[p.channel]}"><b>${d}</b></i>` : `<i class="cd"></i>`);
  }
  const first = POSTS[0]!;
  return `
  ${head("rae", "Launch plan")}
  <div class="c-hero" data-st>
    <div class="hero-pair"><b class="big">${num(POSTS.length)}</b><span>posts</span></div>
    <div class="hero-pair"><b class="big">${num(30)}</b><span>days</span></div>
  </div>
  <div class="c-body">
    <div class="cal" data-st>${["M", "T", "W", "T", "F", "S", "S"].map((x) => `<span class="cal-h">${x}</span>`).join("")}${cells.join("")}</div>
    <div class="chans" data-st>${Object.entries(CHANNEL_COUNT).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<span><i style="background:${CH_COL[c]}"></i>${CHANNEL_LABEL[c]} <b>${n}</b></span>`).join("")}</div>
    <p class="first-post" data-st><span>Day ${first.day} · ${esc(RAE.handle)}</span>${esc(first.hook)}</p>
  </div>
  ${foot("rae")}`;
}

// ───────────────────────────────────────────── Pip · goes live

function pip(): string {
  return `
  ${head("pip", "Live site")}
  <div class="c-hero" data-st>
    <div class="live-url"><span class="live-dot"></span><b>${esc(PIP.url)}</b></div>
  </div>
  <div class="c-body">
    <ul class="checks" data-st>${PIP_DONE.map((l) => `<li>${I.check(14)}<span>${esc(l)}</span></li>`).join("")}</ul>
  </div>
  ${foot("pip")}`;
}

const PIP_DONE = [`${PIP.url} reserved`, "Page published", "Pre-orders go to your wallet"];

const MAKERS: Record<Dept, () => string> = { mia, leo, sam, nova, dex, rae, pip };

export function resultCard(d: Dept): string {
  return `<article class="card c-${d}" data-dept="${d}" style="--room:${ROOM_META[d].color}">${MAKERS[d]()}</article>`;
}
