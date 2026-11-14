// Hand-built SVG charts for the pack: score ring, 12-month projection, positioning map.
import type { LeoOpportunity, SamModel } from "../types";
import { clamp, esc, money } from "./util";

export function verdictColor(v: string | undefined): string {
  return v === "no-go" ? "#FF7A6B" : v === "pivot" ? "#F5C542" : "#0AC18E";
}

export function scoreRing(score: number, verdict: string | undefined, size = 112): string {
  const s = clamp(score, 0, 10);
  const stroke = 10;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const col = verdictColor(verdict);
  const ticks = Array.from({ length: 40 }, (_, i) => {
    const a = (i / 40) * Math.PI * 2 - Math.PI / 2;
    const r1 = r - stroke / 2 - 5, r2 = r1 - (i % 5 === 0 ? 4 : 2);
    return `<line x1="${(size / 2 + r1 * Math.cos(a)).toFixed(2)}" y1="${(size / 2 + r1 * Math.sin(a)).toFixed(2)}" x2="${(size / 2 + r2 * Math.cos(a)).toFixed(2)}" y2="${(size / 2 + r2 * Math.sin(a)).toFixed(2)}" stroke="#334156" stroke-width="1"/>`;
  }).join("");
  return `<div class="ldp-ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#222D3C" stroke-width="${stroke}"/>
      ${ticks}
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${((s / 10) * C).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"
        style="filter:drop-shadow(0 0 6px ${col}66)"/>
    </svg>
    <div class="v"><b>${s.toFixed(1)}</b><span>/ 10</span></div>
  </div>`;
}

function niceMax(v: number): number {
  if (!(v > 0)) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** 12-month revenue vs costs with break-even marker. Returns HTML (svg + hover hit areas). */
export function projectionChart(sam: SamModel): string {
  const cur = sam.currency || "€";
  const rows = [...(sam.months || [])].sort((a, b) => a.month - b.month).slice(0, 12);
  if (rows.length < 2) return `<div class="ldp-empty" style="min-height:200px"><p>No monthly projection available.</p></div>`;
  const W = 680, H = 250, L = 50, R = 14, T = 40, B = 30;
  const pw = W - L - R, ph = H - T - B;
  const max = niceMax(Math.max(...rows.flatMap((r) => [r.revenue, r.costs])) * 1.08);
  const n = rows.length;
  const x = (i: number) => L + (pw * i) / (n - 1);
  const y = (v: number) => T + ph - (clamp(v, 0, max) / max) * ph;
  const line = (k: "revenue" | "costs") => rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(r[k]).toFixed(1)}`).join("");
  const area = `${line("revenue")}L${x(n - 1).toFixed(1)} ${T + ph}L${L} ${T + ph}Z`;
  const steps = 4;
  const grid = Array.from({ length: steps + 1 }, (_, i) => {
    const v = (max / steps) * i, yy = y(v);
    return `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#263243" ${i ? 'stroke-dasharray="2 4"' : ""}/>` +
      `<text x="${L - 10}" y="${yy + 4}" text-anchor="end" fill="#6F7E93" font-size="11" font-family="JetBrains Mono, monospace">${esc(money(cur, v))}</text>`;
  }).join("");
  const xl = rows.map((r, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" fill="#6F7E93" font-size="11" font-family="Plus Jakarta Sans, sans-serif">M${r.month}</text>`).join("");

  let be = "";
  const bm = Math.round(sam.break_even?.month ?? 0);
  const bi = rows.findIndex((r) => r.month === bm);
  if (bi >= 0) {
    const bx = x(bi), by = y(rows[bi].revenue);
    const label = `Break-even · month ${bm}`;
    const lw = label.length * 6.6 + 22;
    const lx = clamp(bx - lw / 2, L, W - R - lw);
    be = `<line x1="${bx}" x2="${bx}" y1="${T - 6}" y2="${T + ph}" stroke="#F5C542" stroke-width="1.5" stroke-dasharray="4 4"/>` +
      `<rect x="${lx}" y="${T - 34}" width="${lw}" height="24" rx="12" fill="#F5C542"/>` +
      `<text x="${lx + lw / 2}" y="${T - 18}" text-anchor="middle" fill="#2A2000" font-size="12" font-weight="800" font-family="Plus Jakarta Sans, sans-serif">${label}</text>` +
      `<circle cx="${bx}" cy="${by}" r="9" fill="#F5C542" opacity=".22"/><circle cx="${bx}" cy="${by}" r="5" fill="#F5C542" stroke="#0E141C" stroke-width="2"/>`;
  } else {
    be = `<rect x="${W - R - 170}" y="${T - 34}" width="170" height="24" rx="12" fill="#222D3C"/>` +
      `<text x="${W - R - 85}" y="${T - 18}" text-anchor="middle" fill="#9DAABD" font-size="12" font-weight="700" font-family="Plus Jakarta Sans, sans-serif">No break-even in year 1</text>`;
  }
  const hits = rows.map((r, i) => {
    const w = pw / (n - 1);
    return `<rect class="hit" x="${(x(i) - w / 2).toFixed(1)}" y="${T}" width="${w.toFixed(1)}" height="${ph}" fill="transparent" data-i="${i}" data-m="${r.month}" data-r="${esc(money(cur, r.revenue))}" data-c="${esc(money(cur, r.costs))}" data-x="${(x(i) / W).toFixed(4)}" data-y="${(y(Math.max(r.revenue, r.costs)) / H).toFixed(4)}"/>`;
  }).join("");
  const dots = rows.map((r, i) => `<circle class="pt pt${i}" cx="${x(i)}" cy="${y(r.revenue)}" r="3.2" fill="#0B0F15" stroke="#22C997" stroke-width="2"/>`).join("");

  return `<div class="ldp-chart" data-chart>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="12-month projection of revenue and costs">
      <defs><linearGradient id="ldpRev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22C997" stop-opacity=".28"/><stop offset="1" stop-color="#22C997" stop-opacity="0"/></linearGradient></defs>
      ${grid}${xl}
      <path d="${area}" fill="url(#ldpRev)"/>
      <path d="${line("costs")}" fill="none" stroke="#F0845C" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${line("revenue")}" fill="none" stroke="#22C997" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      <line class="cross" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="#9DAABD" stroke-opacity=".35" visibility="hidden"/>
      ${be}${hits}
    </svg>
    <div class="ldp-tip"></div>
  </div>`;
}

/** Wire hover tooltips for any projection chart inside `root`. */
export function wireCharts(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-chart]").forEach((box) => {
    const tip = box.querySelector<HTMLElement>(".ldp-tip")!;
    const cross = box.querySelector<SVGLineElement>(".cross");
    const svg = box.querySelector("svg")!;
    box.addEventListener("mousemove", (e) => {
      const hit = (e.target as Element).closest?.(".hit") as SVGRectElement | null;
      if (!hit) return;
      const d = hit.dataset;
      tip.innerHTML = `<b>Month ${d.m}</b><div><span><i style="--c:#22C997"></i>Revenue</span>${d.r}</div><div><span><i style="--c:#F0845C"></i>Costs</span>${d.c}</div>`;
      const sb = svg.getBoundingClientRect(), bb = box.getBoundingClientRect();
      const px = sb.left - bb.left + Number(d.x) * sb.width;
      const py = sb.top - bb.top + Number(d.y) * sb.height;
      tip.style.left = `${clamp(px + 12, 4, bb.width - 150)}px`;
      tip.style.top = `${Math.max(4, py - 70)}px`;
      tip.classList.add("on");
      if (cross) {
        const vx = Number(d.x) * 680;
        cross.setAttribute("x1", String(vx));
        cross.setAttribute("x2", String(vx));
        cross.setAttribute("visibility", "visible");
      }
    });
    box.addEventListener("mouseleave", () => { tip.classList.remove("on"); cross?.setAttribute("visibility", "hidden"); });
  });
}

/** Price (x) vs differentiation (y) map with competitors and "Your spot". */
export function positioningMap(leo: LeoOpportunity): string {
  const W = 560, H = 360, L = 34, R = 16, T = 16, B = 34;
  const pw = W - L - R, ph = H - T - B;
  // Points stay 26 px inside the plot so pins never sit on the quadrant labels or the axes.
  const IN = 26;
  const px = (v: number) => L + IN + (clamp(v, 0, 10) / 10) * (pw - IN * 2);
  const py = (v: number) => T + ph - IN - (clamp(v, 0, 10) / 10) * (ph - IN * 2);

  // street-map like backdrop: blocks
  let blocks = "";
  const bw = pw / 8, bh = ph / 6;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) {
    blocks += `<rect x="${(L + i * bw + 3).toFixed(1)}" y="${(T + j * bh + 3).toFixed(1)}" width="${(bw - 6).toFixed(1)}" height="${(bh - 6).toFixed(1)}" rx="5" fill="#141C27"/>`;
  }
  const quad = (x: number, y: number, t: string, anchor: string) => `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="#4C5B70" font-size="10.5" font-weight="800" letter-spacing="1.4" font-family="Plus Jakarta Sans, sans-serif">${t}</text>`;

  type Box = { x0: number; y0: number; x1: number; y1: number };
  type Lab = { x: number; y: number; w: number; h: number; name: string; you?: boolean; box?: Box };
  const comps = (leo.competitors || []).slice(0, 8);
  const you = leo.you ?? { price: 5, differentiation: 8 };
  const youLab: Lab = { x: px(you.price), y: py(you.differentiation), w: 88, h: 26, name: "Your spot", you: true };
  const labels: Lab[] = comps.map((c) => ({ x: px(c.price), y: py(c.differentiation), w: Math.min(156, c.name.length * 6.9 + 34), h: 24, name: c.name }));
  // Obstacles: every marker (pins stand above their point; "you" is a disc).
  const obstacles: Box[] = [
    { x0: youLab.x - 19, y0: youLab.y - 19, x1: youLab.x + 19, y1: youLab.y + 19 },
    ...labels.map((l) => ({ x0: l.x - 8, y0: l.y - 21, x1: l.x + 8, y1: l.y + 2 })),
    // quadrant corner labels
    { x0: L + 6, y0: T + 4, x1: L + 96, y1: T + 24 },
    { x0: L + pw - 80, y0: T + 4, x1: L + pw - 6, y1: T + 24 },
    { x0: L + 6, y0: T + ph - 24, x1: L + 72, y1: T + ph - 4 },
    { x0: L + pw - 100, y0: T + ph - 24, x1: L + pw - 6, y1: T + ph - 4 },
  ];
  const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const inside = (b: Box) => b.x0 >= L + 2 && b.x1 <= W - R - 2 && b.y0 >= T + 2 && b.y1 <= T + ph - 2;
  const placed: Box[] = [];
  const place = (l: Lab) => {
    const cands: Box[] = [];
    const dys = [0, -16, 16, -30, 30, -44, 44];
    if (l.you) {
      // "Your spot" is anchored to its dot: right below it, or right above when there is no room.
      for (const dy of [14, -14 - l.h]) cands.push({ x0: l.x - l.w / 2, y0: l.y + dy, x1: l.x + l.w / 2, y1: l.y + dy + l.h });
    } else {
      const cy = l.y - 9;
      for (const dy of dys) {
        cands.push({ x0: l.x + 12, y0: cy - l.h / 2 + dy, x1: l.x + 12 + l.w, y1: cy + l.h / 2 + dy });
        cands.push({ x0: l.x - 12 - l.w, y0: cy - l.h / 2 + dy, x1: l.x - 12, y1: cy + l.h / 2 + dy });
      }
    }
    let best = cands[0], bestScore = Infinity;
    cands.forEach((c, i) => {
      const pad = { x0: c.x0 - 3, y0: c.y0 - 3, x1: c.x1 + 3, y1: c.y1 + 3 };
      let sc = i * 0.5 + (inside(c) ? 0 : 1e6);
      for (const o of obstacles) sc += overlap(pad, o) * 4;
      for (const o of placed) sc += overlap(pad, o) * 6;
      if (sc < bestScore) { bestScore = sc; best = c; }
    });
    l.box = best;
    placed.push(best);
  };
  place(youLab);
  labels.forEach(place);

  const pinMarker = (l: Lab) => `<path d="M${l.x} ${l.y + 1}c-5-6-7.5-9.5-7.5-13a7.5 7.5 0 0 1 15 0c0 3.5-2.5 7-7.5 13z" fill="#F0645A" stroke="#0E141C" stroke-width="1.5"/><circle cx="${l.x}" cy="${l.y - 12}" r="2.6" fill="#0E141C"/>`;
  const labelOf = (l: Lab, i: number) => {
    const b = l.box!;
    if (l.you) {
      return `<rect x="${b.x0}" y="${b.y0}" width="${l.w}" height="${l.h}" rx="${l.h / 2}" fill="#0AC18E" style="filter:drop-shadow(0 4px 10px rgba(10,193,142,.35))"/>` +
        `<text x="${b.x0 + l.w / 2}" y="${b.y0 + 17.5}" text-anchor="middle" fill="#062A1F" font-size="12.5" font-weight="800" font-family="Plus Jakarta Sans, sans-serif">Your spot</text>`;
    }
    const cy = (b.y0 + b.y1) / 2;
    const ax = b.x0 > l.x ? b.x0 : b.x1;
    const lead = Math.abs(cy - (l.y - 9)) > 12 ? `<path d="M${l.x} ${l.y - 9}L${ax} ${cy}" stroke="#4C5B70" stroke-width="1" stroke-dasharray="2 3"/>` : "";
    return `${lead}<rect x="${b.x0}" y="${b.y0}" width="${l.w}" height="${l.h}" rx="7" fill="#151C26" stroke="#3A475B"/>` +
      `<text x="${b.x0 + 9}" y="${b.y0 + 16}" fill="#EAF0F7" font-size="12" font-weight="700" font-family="Plus Jakarta Sans, sans-serif"><tspan fill="#6F7E93" font-family="JetBrains Mono, monospace" font-size="10.5">${i + 1}</tspan>  ${esc(l.name)}</text>`;
  };
  const youDisc = `<circle cx="${youLab.x}" cy="${youLab.y}" r="22" fill="#0AC18E" opacity=".12"><animate attributeName="r" values="12;24;12" dur="2.6s" repeatCount="indefinite"/><animate attributeName="opacity" values=".3;.04;.3" dur="2.6s" repeatCount="indefinite"/></circle>` +
    `<circle cx="${youLab.x}" cy="${youLab.y}" r="10" fill="#0AC18E" stroke="#0E141C" stroke-width="3"/><circle cx="${youLab.x}" cy="${youLab.y}" r="3.5" fill="#062A1F"/>`;
  return `<div class="ldp-map"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Positioning map: price versus differentiation">
    <rect width="${W}" height="${H}" fill="#0E141C"/>
    ${blocks}
    <line x1="${L + pw / 2}" x2="${L + pw / 2}" y1="${T}" y2="${T + ph}" stroke="#2C394C" stroke-width="1.5" stroke-dasharray="3 5"/>
    <line x1="${L}" x2="${L + pw}" y1="${T + ph / 2}" y2="${T + ph / 2}" stroke="#2C394C" stroke-width="1.5" stroke-dasharray="3 5"/>
    ${quad(L + 10, T + 18, "SWEET SPOT", "start")}${quad(L + pw - 10, T + 18, "PREMIUM", "end")}
    ${quad(L + 10, T + ph - 10, "BUDGET", "start")}${quad(L + pw - 10, T + ph - 10, "OVERPRICED", "end")}
    <path d="M${L} ${T + ph + 0.5}H${L + pw}" stroke="#4C5B70" stroke-width="1.5"/><path d="M${L - 0.5} ${T}V${T + ph}" stroke="#4C5B70" stroke-width="1.5"/>
    <text x="${L}" y="${H - 10}" fill="#9DAABD" font-size="11" font-weight="700" font-family="Plus Jakarta Sans, sans-serif">Low price</text>
    <text x="${L + pw / 2}" y="${H - 10}" text-anchor="middle" fill="#6F7E93" font-size="11" font-weight="700" letter-spacing="1" font-family="Plus Jakarta Sans, sans-serif">PRICE →</text>
    <text x="${L + pw}" y="${H - 10}" text-anchor="end" fill="#9DAABD" font-size="11" font-weight="700" font-family="Plus Jakarta Sans, sans-serif">High price</text>
    <text transform="translate(${L - 14} ${T + ph / 2}) rotate(-90)" text-anchor="middle" fill="#6F7E93" font-size="11" font-weight="700" letter-spacing="1" font-family="Plus Jakarta Sans, sans-serif">DIFFERENTIATION →</text>
    ${labels.map((l) => pinMarker(l)).join("")}${youDisc}
    ${labels.map((l, i) => labelOf(l, i)).join("")}${labelOf(youLab, -1)}
  </svg></div>`;
}
