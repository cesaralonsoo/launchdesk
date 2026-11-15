// Hand-built charts for the pack (and, read-only, the Now card / tiles). Pure functions returning HTML strings.
// Lines live in a stretched SVG with non-scaling strokes; every label is HTML placed in %, so text never scales
// below 12px on a phone (D3). Colours: --ink / --ink-2 / --faint / --bch only (design-v3).
import type { LeoOpportunity, SamModel } from "../types";
import { fmtMoney } from "../types";
import { clamp, esc } from "./util";

export function verdictColor(v: string | undefined): string {
  return v === "go" ? "#0AC18E" : "#1D1D1F";
}

export const verdictWord = (v: string | undefined) => (v === "no-go" ? "No-go" : v === "pivot" ? "Pivot" : "Go");

/** Score ring (gate, Now card). Score with one decimal in the centre. */
export function scoreRing(score: number, verdict: string | undefined, size = 72): string {
  const s = clamp(score, 0, 10);
  const stroke = size >= 96 ? 7 : 6;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  return `<div class="ldp-ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(118,118,128,.12)" stroke-width="${stroke}"/>
      <circle class="arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${verdictColor(verdict)}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${((s / 10) * C).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    <div class="v" style="font-size:${Math.round(size * 0.3)}px">${s.toFixed(1)}</div>
  </div>`;
}

const pct = (n: number) => `${(Math.round(n * 1000) / 10).toFixed(1)}%`;

function ticks(lo: number, hi: number, max = 4): number[] {
  const span = hi - lo || 1;
  const raw = span / max;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => span / s <= max) ?? 10 * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v));
  return out;
}

/**
 * Sparkline (Summary 120px, Now card 160px, tiles 40px). Values left→right; optional dot at `mark` (index) and
 * a hairline at zero when the series crosses it. Returns an inline SVG sized `width`×`height`.
 */
export function sparkline(values: number[], opts: { width?: number; height?: number; mark?: number | null; stroke?: string; zero?: boolean; label?: string } = {}): string {
  const { width = 120, height = 32, mark = null, stroke = "#1D1D1F", zero = true, label = "Trend" } = opts;
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return "";
  const lo = Math.min(...v, zero ? 0 : Infinity), hi = Math.max(...v, zero ? 0 : -Infinity);
  const pad = 3;
  const x = (i: number) => pad + ((width - pad * 2) * i) / (v.length - 1);
  const y = (n: number) => pad + (height - pad * 2) * (1 - (n - lo) / (hi - lo || 1));
  const d = v.map((n, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(n).toFixed(1)}`).join("");
  const z = zero && lo < 0 && hi > 0 ? `<line x1="0" x2="${width}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="rgba(0,0,0,.14)" stroke-width="1" stroke-dasharray="2 3"/>` : "";
  const m = mark != null && v[mark] != null ? `<circle cx="${x(mark).toFixed(1)}" cy="${y(v[mark]!).toFixed(1)}" r="3" fill="#fff" stroke="#0AC18E" stroke-width="2"/>` : "";
  return `<svg class="ldp-spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${z}<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>${m}</svg>`;
}

/** Cumulative cash by month, starting at −start-up (for sparklines). */
export const cashSeries = (sam: SamModel) => [-(sam.startup_cost?.value ?? 0), ...(sam.months ?? []).map((m) => m.cash)];

/**
 * R15: 12-month chart. Revenue 2px ink, costs 1.5px faint dashed, cumulative cash 1.5px ink-2 dipping below the
 * zero line with a "Lowest point" note; 10% green between revenue and costs after break-even, 6% red before;
 * markers only at break-even and month 12; direct end labels; ≤ 4 ticks.
 */
export function cashChart(sam: SamModel, opts: { height?: number } = {}): string {
  const cur = sam.currency || "€";
  const rows = [...(sam.months || [])].sort((a, b) => a.month - b.month).slice(0, 12);
  if (rows.length < 2) return "";
  const H = opts.height ?? 240;
  const hasCash = rows.some((r) => typeof r.cash === "number");
  const all = rows.flatMap((r) => [r.revenue, r.costs, hasCash ? r.cash : 0]);
  let lo = Math.min(0, ...all), hi = Math.max(...all);
  const span = hi - lo || 1;
  lo -= span * 0.04;
  hi += span * 0.1;
  // plot box in % of the container (labels need room on the right and the bottom)
  const L = 0, R = 1, T = 0, B = 1;
  const X = (i: number) => L + ((R - L) * i) / (rows.length - 1);
  const Y = (v: number) => T + (B - T) * (1 - (v - lo) / (hi - lo));
  const P = (i: number, v: number) => `${(X(i) * 1000).toFixed(1)} ${(Y(v) * 1000).toFixed(1)}`;
  const path = (k: "revenue" | "costs" | "cash") => rows.map((r, i) => `${i ? "L" : "M"}${P(i, r[k])}`).join("");
  const beIdx = sam.break_even?.month ? rows.findIndex((r) => r.month === sam.break_even.month) : -1;
  // area between revenue and costs: red before break-even, green from it
  const band = (from: number, to: number) => {
    if (to <= from) return "";
    const up = rows.slice(from, to + 1).map((r, j) => `${j ? "L" : "M"}${P(from + j, r.revenue)}`).join("");
    const down = rows.slice(from, to + 1).map((r, j) => `L${P(from + j, r.costs)}`).reverse().join("");
    return up + down + "Z";
  };
  const split = beIdx >= 0 ? beIdx : rows.length - 1;
  const red = band(0, split);
  const green = beIdx >= 0 ? band(beIdx, rows.length - 1) : "";
  const tickVals = ticks(Math.min(0, ...all), Math.max(...all), 4);
  const edge = (x: number) => (x < 0.2 ? " l" : x > 0.7 ? " rr" : "");
  const low = rows.reduce((a, r) => (r.cash < a.cash ? r : a), rows[0]!);
  const lowI = rows.indexOf(low);
  const last = rows[rows.length - 1]!;
  const lab = (x: number, y: number, html: string, cls = "") => `<span class="ldp-cl ${cls}" style="left:${pct(x)};top:${pct(y)}">${html}</span>`;
  // end labels, nudged apart vertically (min 7% gap)
  const ends = [
    { k: "Revenue", v: last.revenue, cls: "ink" },
    { k: "Costs", v: last.costs, cls: "faint" },
    ...(hasCash ? [{ k: "Cash", v: last.cash, cls: "ink2" }] : []),
  ].map((e) => ({ ...e, y: Y(e.v) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i]!.y - ends[i - 1]!.y < 0.08) ends[i]!.y = ends[i - 1]!.y + 0.08;
  const showLow = hasCash && low.cash < 0;
  const lowNote = showLow ? `Lowest point ${fmtMoney(cur, low.cash)} · month ${low.month}` : "";
  return `<figure class="ldp-cash" style="height:${H}px" aria-label="12-month projection: revenue, costs and cumulative cash"><div class="plot">
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
      ${tickVals.map((t) => `<line x1="0" x2="${R * 1000}" y1="${Y(t) * 1000}" y2="${Y(t) * 1000}" stroke="${t === 0 ? "rgba(0,0,0,.22)" : "rgba(0,0,0,.06)"}" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join("")}
      ${red ? `<path d="${red}" fill="rgba(255,59,48,.06)"/>` : ""}${green ? `<path d="${green}" fill="rgba(10,193,142,.10)"/>` : ""}
      <path d="${path("costs")}" fill="none" stroke="#76767B" stroke-width="1.5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>
      ${hasCash ? `<path class="ln-cash" d="${path("cash")}" fill="none" stroke="#424245" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>` : ""}
      <path class="ln-rev" d="${path("revenue")}" fill="none" stroke="#1D1D1F" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    </svg>
    ${tickVals.map((t) => lab(R, Y(t), esc(fmtMoney(cur, t)), "tick")).join("")}
    ${[1, 4, 8, 12].filter((m) => m <= rows.length).map((m) => lab(X(m - 1), B + 0.04, `M${m}`, "x")).join("")}
    ${ends.map((e) => lab(R + 0.012, e.y, `<span class="k">${e.k} </span>${esc(fmtMoney(cur, e.v))}`, `end ${e.cls}`)).join("")}
    ${beIdx >= 0 ? `<span class="ldp-cdot be" style="left:${pct(X(beIdx))};top:${pct(Y(rows[beIdx]!.revenue))}"></span>${lab(X(beIdx), Y(rows[beIdx]!.revenue) - 0.04, `Break-even · month ${rows[beIdx]!.month}`, `note${edge(X(beIdx))}`)}` : ""}
    <span class="ldp-cdot m12" style="left:${pct(X(rows.length - 1))};top:${pct(Y(last.revenue))}"></span>
    ${showLow ? `${lab(X(lowI), Y(low.cash) - 0.04, esc(lowNote), `note${edge(X(lowI))}`)}` : ""}
  </div></figure>`;
}

/** Back-compat name (v3 callers). */
export const projectionChart = (sam: SamModel) => cashChart(sam);

/** Nothing to wire any more (the chart has direct labels); kept for callers. */
export function wireCharts(_root: HTMLElement): void {}

// ---------- R14 positioning map ----------

const level = (n: number) => (n < 3.5 ? "Low" : n < 6.5 ? "Mid" : "High");
export { level as priceLevel };

/**
 * R14: price (x) vs differentiation (y). A 1:1 square (max 360px), 1px axes crossing at the centre, quadrant
 * names in the corners, competitors as 8px dots with direct labels (right, left, above, below; else a numbered
 * dot + legend), "You" as a 12px green dot with a halo. Axis titles outside, never rotated.
 */
export function positioningMap(leo: LeoOpportunity, opts: { size?: number } = {}): string {
  const S = opts.size ?? 360; // nominal px, used only for label collision maths
  const IN = 0.08;
  const X = (v: number) => IN + (clamp(v, 0, 10) / 10) * (1 - IN * 2);
  const Y = (v: number) => 1 - IN - (clamp(v, 0, 10) / 10) * (1 - IN * 2);
  type Box = { x0: number; y0: number; x1: number; y1: number };
  const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const comps = (leo.competitors || []).slice(0, 8);
  const you = leo.you ?? { price: 5, differentiation: 5 };
  const yx = X(you.price) * S, yy = Y(you.differentiation) * S;
  // quadrant labels (12px, 12px inset) are obstacles
  const q = 12;
  const placed: Box[] = [
    { x0: q, y0: q, x1: q + 74, y1: q + 16 },
    { x0: S - q - 60, y0: q, x1: S - q, y1: q + 16 },
    { x0: q, y0: S - q - 16, x1: q + 56, y1: S - q },
    { x0: S - q - 80, y0: S - q - 16, x1: S - q, y1: S - q },
    { x0: yx - 13, y0: yy - 13, x1: yx + 13, y1: yy + 13 },
    ...comps.map((c) => ({ x0: X(c.price) * S - 9, y0: Y(c.differentiation) * S - 9, x1: X(c.price) * S + 9, y1: Y(c.differentiation) * S + 9 })),
  ];
  const tw = (t: string, px: number, w = 0.56) => t.length * px * w + 2;
  const tryPlace = (cx: number, cy: number, w: number, h: number, gap: number): Box | null => {
    const cands: Box[] = [
      { x0: cx + gap, y0: cy - h / 2, x1: cx + gap + w, y1: cy + h / 2 },
      { x0: cx - gap - w, y0: cy - h / 2, x1: cx - gap, y1: cy + h / 2 },
      { x0: cx - w / 2, y0: cy - gap - h, x1: cx + w / 2, y1: cy - gap },
      { x0: cx - w / 2, y0: cy + gap, x1: cx + w / 2, y1: cy + gap + h },
      { x0: cx + gap, y0: cy - h - 4, x1: cx + gap + w, y1: cy - 4 },
      { x0: cx + gap, y0: cy + 4, x1: cx + gap + w, y1: cy + h + 4 },
      { x0: cx - gap - w, y0: cy - h - 4, x1: cx - gap, y1: cy - 4 },
      { x0: cx - gap - w, y0: cy + 4, x1: cx - gap, y1: cy + h + 4 },
    ];
    for (const b of cands) {
      if (b.x0 < 2 || b.x1 > S - 2 || b.y0 < 2 || b.y1 > S - 2) continue;
      if (placed.some((o) => hit(b, o))) continue;
      placed.push(b);
      return b;
    }
    return null;
  };
  const youBox = tryPlace(yx, yy, tw("You", 13, 0.62), 18, 14);
  const legend: string[] = [];
  const dots = comps.map((c, i) => {
    const cx = X(c.price) * S, cy = Y(c.differentiation) * S;
    const b = tryPlace(cx, cy, tw(c.name, 13), 18, 9);
    const dot = `<span class="ldp-mdot" style="left:${pct(cx / S)};top:${pct(cy / S)}"></span>`;
    if (b) return dot + `<span class="ldp-mlab" style="left:${pct(b.x0 / S)};top:${pct(b.y0 / S)}">${esc(c.name)}</span>`;
    legend.push(`<li><b>${i + 1}</b>${esc(c.name)}</li>`);
    return `<span class="ldp-mdot num" style="left:${pct(cx / S)};top:${pct(cy / S)}">${i + 1}</span>`;
  }).join("");
  return `<div class="ldp-mapwrap">
    <div class="ldp-maptitle y">Differentiation ↑</div>
    <div class="ldp-map" role="img" aria-label="Positioning map: price on the horizontal axis, differentiation on the vertical axis">
      <span class="ax h"></span><span class="ax v"></span>
      <span class="qd tl">Sweet spot</span><span class="qd tr">Premium</span><span class="qd bl">Budget</span><span class="qd br">Overpriced</span>
      ${dots}
      <span class="ldp-you" style="left:${pct(yx / S)};top:${pct(yy / S)}"></span>
      ${youBox ? `<span class="ldp-mlab you" style="left:${pct(youBox.x0 / S)};top:${pct(youBox.y0 / S)}">You</span>` : ""}
    </div>
    <div class="ldp-maptitle x">Price →</div>
    ${legend.length ? `<ol class="ldp-maplegend">${legend.join("")}</ol>` : ""}
  </div>`;
}
