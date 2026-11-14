// Department work panels shown over the office while a department works / delivers (screenshots 04, 05, 09).
import type { DeptStatus, LeoOpportunity, Project, RaeLaunch, SamModel, WorkDept } from "../types";
import { esc, h, svg } from "./dom";
import { logoSvg } from "./logo";
import { deptStatus } from "./state";
import { TEAM, WORK_ORDER } from "./team";
import { avatar, extIcon, ring, statusPill, verdictPill } from "./ui";

const skel = (lines = 3, widths = [92, 78, 64, 86]) =>
  h("div", { class: "skel-block", "aria-hidden": "true" }, Array.from({ length: lines }, (_, i) => h("div", { class: "skel", style: `width:${widths[i % widths.length]}%` })));

/** A grey bar that shimmers: the shape of text that is still being written. */
const bar = (w: number, delay = 0) => h("span", { class: "skel-i", style: `width:${w}%;animation-delay:${delay}s`, "aria-hidden": "true" });
const stagger = (i: number, step = 0.18) => `animation-delay:${(i * step).toFixed(2)}s`;

const section = (title: string, tag?: string | null, ...body: Array<Node | null>) =>
  h("section", { class: "dp-sec" }, h("div", { class: "dp-sec-h" }, h("span", { class: "kicker" }, title), tag ? h("span", { class: "tag" }, tag) : null), ...body);

// ---------- Mia ----------

function mia(p: Project, working: boolean) {
  const r = p.results.mia;
  const brief = r
    ? h(
        "div",
        { class: "brief" },
        h("p", null, h("b", null, "Concept: "), r.brief.concept),
        h("p", null, h("b", null, "For: "), r.brief.for),
        h("p", null, h("b", null, "Goal: "), r.brief.goal),
      )
    : h(
        "div",
        { class: "brief" },
        h("p", { class: "brief-idea" }, h("b", null, "Your idea: "), p.idea),
        h("p", { class: "skel-line" }, h("b", null, "For: "), bar(62)),
        h("p", { class: "skel-line" }, h("b", null, "Goal: "), bar(78, 0.3)),
      );
  // Where Mia usually books each department, drawn in while she writes the real plan.
  const SKETCH: Record<WorkDept, number[]> = { mia: [1, 2, 3, 4], leo: [1], sam: [1, 2], nova: [2], dex: [2, 3], rae: [3, 4], pip: [4] };
  let n = 0;
  const cell = (d: WorkDept, w: number) => {
    const tasks = r?.weeks.filter((x) => x.dept === d && x.week === w) ?? [];
    if (!r) {
      if (d === "mia" && w === 1)
        return h("div", { class: "wk-cell" }, h("span", { class: "wk-chip live", style: `--c:${TEAM.mia.color}` }, "Brief & plan", h("small", null, working ? "Today · now" : "Today")));
      return h("div", { class: "wk-cell" }, SKETCH[d].includes(w) ? h("span", { class: "wk-chip ghost", style: `--c:${TEAM[d].color};${stagger(n++, 0.22)}`, "aria-hidden": "true" }) : null);
    }
    return h(
      "div",
      { class: "wk-cell" },
      tasks.map((t) => h("span", { class: "wk-chip", style: `--c:${TEAM[d].color};${stagger(n++, 0.04)}`, title: t.task }, t.task)),
    );
  };
  const grid = h(
    "div",
    { class: "wk-grid", role: "table", "aria-label": "4-week plan" },
    h("div", { class: "wk-h", role: "row" }, h("span", null), [1, 2, 3, 4].map((w) => h("span", { role: "columnheader" }, `Week ${w}`))),
    WORK_ORDER.map((d) =>
      h("div", { class: "wk-row", role: "row" }, h("span", { class: "wk-d", role: "rowheader" }, h("span", { class: "dot", style: `--c:${TEAM[d].color}` }), TEAM[d].name), [1, 2, 3, 4].map((w) => cell(d, w))),
    ),
  );
  return [section("Project brief", r ? null : "writing…", brief), section("4-week plan", "one row per department", grid)];
}

// ---------- Leo ----------

export function positioningMap(leo: LeoOpportunity, w = 280, hgt = 210) {
  const pad = 22;
  const x = (v: number) => pad + (Math.max(0, Math.min(10, v)) / 10) * (w - pad * 2);
  const y = (v: number) => hgt - pad - (Math.max(0, Math.min(10, v)) / 10) * (hgt - pad * 2);
  const comps = leo.competitors
    .map(
      (c, i) =>
        `<g><circle cx="${x(c.price)}" cy="${y(c.differentiation)}" r="5" fill="#3B82F6" opacity=".85"/><text x="${x(c.price) + 8}" y="${y(c.differentiation) + 4}" font-size="10.5" fill="var(--muted)">${esc(c.name.length > 16 ? c.name.slice(0, 15) + "…" : c.name)}</text><title>${i + 1}. ${esc(c.name)}</title></g>`,
    )
    .join("");
  return svg(
    `<svg class="posmap" viewBox="0 0 ${w} ${hgt}" role="img" aria-label="Positioning map: price versus differentiation"><rect x="${pad}" y="${pad}" width="${w - pad * 2}" height="${hgt - pad * 2}" rx="8" fill="var(--bg2)" stroke="var(--line)"/><line x1="${w / 2}" y1="${pad}" x2="${w / 2}" y2="${hgt - pad}" stroke="var(--line)" stroke-dasharray="3 4"/><line x1="${pad}" y1="${hgt / 2}" x2="${w - pad}" y2="${hgt / 2}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="${w / 2}" y="${hgt - 6}" text-anchor="middle" font-size="9" fill="var(--dim)">PRICE  low → high</text><text x="10" y="${hgt / 2}" font-size="9" fill="var(--dim)" transform="rotate(-90 10 ${hgt / 2})" text-anchor="middle">DIFFERENTIATION</text>${comps}<g><circle cx="${x(leo.you.price)}" cy="${y(leo.you.differentiation)}" r="9" fill="var(--bch)" opacity=".22"/><circle cx="${x(leo.you.price)}" cy="${y(leo.you.differentiation)}" r="5.5" fill="var(--bch)"/><text x="${x(leo.you.price) + 10}" y="${y(leo.you.differentiation) - 6}" font-size="10" font-weight="700" fill="var(--bch2)">You</text></g></svg>`,
  );
}

function leo(p: Project, working: boolean) {
  const r = p.results.leo;
  if (!r) {
    const SIGNALS = ["Demand", "Competition gap", "Price acceptance", "Channel", "Timing"];
    return [
      section(
        "Competitor map",
        working ? "scanning…" : null,
        h(
          "div",
          { class: "scan" },
          h(
            "div",
            { class: "radar", "aria-hidden": "true" },
            h("span", { class: "sweep" }),
            [[28, 30], [70, 24], [62, 66], [24, 70], [46, 46]].map(([x, y], i) => h("i", { style: `left:${x}%;top:${y}%;animation-delay:${0.7 + i * 0.75}s` })),
          ),
          h(
            "ul",
            { class: "sig-skel" },
            SIGNALS.map((name, i) => h("li", null, h("span", null, name), h("span", { class: "sig-track" }, h("i", { style: stagger(i, 0.35) })))),
          ),
        ),
      ),
    ];
  }
  return [
    h(
      "div",
      { class: "dp-hero" },
      ring(r.score, 76),
      h("div", null, h("div", { class: "dp-headline" }, verdictPill(r.verdict), " ", r.headline), h("p", { class: "muted small" }, r.summary)),
    ),
    section(
      "Competitor map",
      `${r.competitors.length} found`,
      h(
        "div",
        { class: "comp-wrap" },
        positioningMap(r),
        h(
          "ol",
          { class: "comp-list" },
          r.competitors.slice(0, 5).map((c) => h("li", null, h("b", null, c.name), h("span", null, c.note))),
        ),
      ),
    ),
  ];
}

// ---------- Sam ----------

/**
 * Skeleton of the 12-month chart while Sam works: faint month columns, two dashed placeholder lines
 * (revenue, costs) and a shimmer sweeping left to right. Every column has the same height: no fake data.
 */
function chartSkeleton(w = 520, hgt = 150) {
  const pl = 26;
  const pr = 8;
  const pt = 10;
  const pb = 20;
  const ih = hgt - pt - pb;
  const cw = (w - pl - pr) / 12;
  const cols = Array.from({ length: 12 }, (_, i) => `<rect class="sk-col" x="${(pl + i * cw + cw * 0.18).toFixed(1)}" y="${pt}" width="${(cw * 0.64).toFixed(1)}" height="${ih}" rx="4"/>`).join("");
  const X = (i: number) => pl + cw * (i + 0.5);
  const curve = (f: (k: number) => number) => Array.from({ length: 12 }, (_, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${(pt + ih * (1 - f(i / 11))).toFixed(1)}`).join("");
  const rev = curve((k) => 0.12 + 0.7 * k * k * (3 - 2 * k));
  const cost = curve((k) => 0.46 + 0.08 * k);
  const grid = [0, 0.5, 1].map((k) => `<line class="sk-grid" x1="${pl}" x2="${w - pr}" y1="${pt + k * ih}" y2="${pt + k * ih}"/>`).join("");
  const labels = Array.from({ length: 12 }, (_, i) => (i % 2 === 0 || i === 11 ? `<text class="sk-t" x="${X(i).toFixed(1)}" y="${hgt - 5}" text-anchor="middle">M${i + 1}</text>` : "")).join("");
  return svg(
    `<svg class="chart chart-skel" viewBox="0 0 ${w} ${hgt}" aria-hidden="true"><defs><linearGradient id="skg" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".09"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>${grid}${cols}<line class="sk-ax" x1="${pl}" x2="${pl}" y1="${pt}" y2="${pt + ih}"/><line class="sk-ax" x1="${pl}" x2="${w - pr}" y1="${pt + ih}" y2="${pt + ih}"/><path class="sk-line rev" d="${rev}"/><path class="sk-line cost" d="${cost}"/>${labels}<rect class="sk-sweep" x="${pl - 120}" y="${pt}" width="120" height="${ih}" fill="url(#skg)"/></svg>`,
  );
}

export function revenueChart(sam: SamModel, w = 520, hgt = 150) {
  const ms = sam.months.slice(0, 12);
  if (!ms.length) return h("div");
  const max = Math.max(1, ...ms.flatMap((m) => [m.revenue, m.costs]));
  const pl = 6;
  const pb = 18;
  const step = (w - pl * 2) / Math.max(1, ms.length - 1);
  const X = (i: number) => pl + i * step;
  const Y = (v: number) => 8 + (1 - v / max) * (hgt - pb - 8);
  const line = (k: "revenue" | "costs") => ms.map((m, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(m[k]).toFixed(1)}`).join("");
  const area = `${line("revenue")}L${X(ms.length - 1)},${hgt - pb}L${X(0)},${hgt - pb}Z`;
  const be = sam.break_even.month;
  const bi = ms.findIndex((m) => m.month === be);
  const beMark =
    bi >= 0
      ? `<line x1="${X(bi)}" y1="6" x2="${X(bi)}" y2="${hgt - pb}" stroke="var(--gold)" stroke-dasharray="3 3"/><rect x="${Math.min(w - 76, X(bi) + 4)}" y="4" width="72" height="16" rx="8" fill="rgba(245,197,66,.16)"/><text x="${Math.min(w - 76, X(bi) + 4) + 36}" y="15.5" font-size="9.5" font-weight="700" text-anchor="middle" fill="var(--gold)">Break-even M${be}</text>`
      : "";
  const labels = ms.map((m, i) => (i % 2 === 0 || i === ms.length - 1 ? `<text x="${X(i)}" y="${hgt - 4}" font-size="9" text-anchor="middle" fill="var(--dim)">M${m.month}</text>` : "")).join("");
  return svg(
    `<svg class="chart" viewBox="0 0 ${w} ${hgt}" role="img" aria-label="12-month projection: revenue versus costs${bi >= 0 ? `, break-even in month ${be}` : ""}"><defs><linearGradient id="rv" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0AC18E" stop-opacity=".35"/><stop offset="1" stop-color="#0AC18E" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#rv)"/><path d="${line("costs")}" fill="none" stroke="var(--danger)" stroke-width="2" stroke-dasharray="5 4"/><path d="${line("revenue")}" fill="none" stroke="var(--bch)" stroke-width="2.4"/>${beMark}${labels}</svg>`,
  );
}

function sam(p: Project, working: boolean) {
  const r = p.results.sam;
  if (!r)
    return [
      h(
        "div",
        { class: "kpis" },
        ["Price", "Start-up cost", "Break-even"].map((l, i) =>
          h("div", { class: "kpi" }, h("div", { class: "kpi-l" }, l), h("div", { class: "kpi-v" }, bar(56, i * 0.2)), h("div", { class: "kpi-n" }, bar(84, i * 0.2 + 0.1))),
        ),
      ),
      section(
        "12-month projection",
        working ? "calculating…" : null,
        chartSkeleton(),
        h("div", { class: "legend skel-legend" }, h("span", { class: "lg rev" }, "Revenue"), h("span", { class: "lg cost" }, "Costs")),
      ),
    ];
  return [
    h(
      "div",
      { class: "kpis" },
      h("div", { class: "kpi" }, h("div", { class: "kpi-l" }, "Price"), h("div", { class: "kpi-v" }, r.price.value), h("div", { class: "kpi-n" }, r.price.note)),
      h("div", { class: "kpi" }, h("div", { class: "kpi-l" }, "Start-up cost"), h("div", { class: "kpi-v" }, r.startup_cost.value), h("div", { class: "kpi-n" }, r.startup_cost.note)),
      h("div", { class: "kpi" }, h("div", { class: "kpi-l" }, "Break-even"), h("div", { class: "kpi-v" }, `Month ${r.break_even.month}`), h("div", { class: "kpi-n" }, r.break_even.note)),
    ),
    section(
      "12-month projection",
      "estimate",
      revenueChart(r),
      h("div", { class: "legend" }, h("span", { class: "lg rev" }, "Revenue"), h("span", { class: "lg cost" }, "Costs")),
    ),
    h("div", { class: "risk" }, h("b", null, "Main risk"), h("span", null, r.main_risk)),
  ];
}

// ---------- Nova ----------

function nova(p: Project, working: boolean) {
  const r = p.results.nova;
  if (!r)
    return [
      section(
        "Name options",
        working ? "brainstorming…" : null,
        h(
          "div",
          { class: "names" },
          [0, 1, 2].map((i) =>
            h(
              "div",
              { class: "name-card skel-card", style: stagger(i, 0.25) },
              h("div", { class: "nm" }, bar(64, i * 0.2)),
              h("div", { class: "nm-tag" }, bar(88, i * 0.2 + 0.1)),
              h("div", { class: "swatches cycling", "aria-hidden": "true" }, [0, 1, 2, 3].map((k) => h("span", { class: "sw", style: `animation-delay:${-(i * 1.1 + k * 0.45)}s` }))),
              h("p", { class: "muted small" }, bar(76, i * 0.2 + 0.2)),
            ),
          ),
        ),
      ),
    ];
  return [
    section(
      "Name options",
      "you pick · first is recommended",
      h(
        "div",
        { class: "names" },
        r.names.map((n, i) =>
          h(
            "div",
            { class: `name-card ${i === r.chosen ? "chosen" : ""}` },
            i === r.chosen ? h("span", { class: "tag bch" }, "Recommended") : null,
            h("div", { class: "nm", style: `font-family:${esc(r.typography.headline)},Sora,sans-serif` }, n.name),
            h("div", { class: "nm-tag" }, n.tagline),
            h("div", { class: "swatches" }, n.palette.map((c) => h("span", { class: "sw", style: `background:${c.hex}`, title: `${c.name} ${c.hex}` }))),
            h("p", { class: "muted small" }, n.why),
          ),
        ),
      ),
    ),
    section("Brand voice", null, h("div", { class: "chips" }, r.voice.traits.map((t) => h("span", { class: "chip" }, t))), h("p", { class: "sample" }, `“${r.voice.sample}”`)),
  ];
}

// ---------- Dex ----------

function dex(p: Project, working: boolean) {
  const r = p.results.dex;
  const brand = p.results.nova?.names[p.results.nova.chosen];
  if (!r)
    return [
      section(
        "Logo concepts",
        working ? "sketching…" : null,
        h(
          "div",
          { class: "logos" },
          ["Emblem", "Monogram", "Wordmark"].map((label, i) =>
            h(
              "div",
              { class: "logo-card skel-logo", style: `--d:${(i * 0.45).toFixed(2)}s` },
              i === 2
                ? h("div", { class: "wm-skel", "aria-hidden": "true" }, bar(86, 0.1), bar(62, 0.25), bar(38, 0.4))
                : svg(
                    `<svg class="logo-sketch" viewBox="0 0 64 64" aria-hidden="true">${i === 0 ? '<circle cx="32" cy="32" r="28" class="ls-o"/>' : '<rect x="5" y="5" width="54" height="54" rx="14" class="ls-o"/>'}</svg>`,
                  ),
              h("b", null, label),
              h("small", { class: "muted drawing" }, working ? "drawing…" : "queued"),
            ),
          ),
        ),
      ),
      section("Landing page copy", null, h("div", { class: "land-prev skel-land" }, bar(72), bar(92, 0.2), bar(40, 0.4))),
    ];
  const pal = brand?.palette;
  return [
    section(
      "Logo concepts",
      "3 options",
      h(
        "div",
        { class: "logos" },
        r.logos.map((l, i) =>
          h(
            "div",
            { class: `logo-card ${i === 0 ? "chosen" : ""}` },
            h("div", { class: "logo-art", html: logoSvg(l, pal, 76, brand?.name) }),
            h("b", null, l.shape[0].toUpperCase() + l.shape.slice(1)),
            h("small", { class: "muted" }, l.concept),
          ),
        ),
      ),
    ),
    section(
      "Landing page copy",
      null,
      h(
        "div",
        { class: "land-prev", style: pal ? `--p:${pal[0]?.hex};--a:${pal[1]?.hex}` : "" },
        h("div", { class: "lp-h" }, r.landing.headline),
        h("div", { class: "lp-s" }, r.landing.subheadline),
        h("span", { class: "lp-cta" }, r.landing.cta),
        h("small", { class: "muted" }, r.landing.offer),
      ),
    ),
  ];
}

// ---------- Rae ----------

const CH_COLOR: Record<RaeLaunch["posts"][number]["channel"], string> = {
  IG: "#C13584", TT: "#25B6C9", LI: "#3B82F6", X: "#64748B", Mail: "#F59E0B", ALL: "#0AC18E",
};

export function launchCalendar(r: RaeLaunch) {
  const start = new Date(r.start_date + (r.start_date.length <= 10 ? "T12:00:00" : ""));
  const valid = !Number.isNaN(start.getTime());
  const offset = valid ? (start.getDay() + 6) % 7 : 0;
  const cells: Node[] = [];
  for (let i = 0; i < offset; i++) cells.push(h("div", { class: "cal-cell empty", "aria-hidden": "true" }));
  for (let day = 1; day <= 30; day++) {
    const date = valid ? new Date(start.getTime() + (day - 1) * 86400000) : null;
    const posts = r.posts.filter((x) => x.day === day);
    const label = date ? (date.getDate() === 1 || day === 1 ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : String(date.getDate())) : String(day);
    cells.push(
      h(
        "div",
        { class: `cal-cell ${posts.length ? "has" : ""} ${day === 1 ? "first" : ""}` },
        h("span", { class: "cal-d" }, label),
        posts.slice(0, 2).map((x) => h("span", { class: "cal-chip", style: `--c:${CH_COLOR[x.channel] ?? "#64748B"}`, title: `${x.channel} · ${x.title}` }, h("b", null, x.channel), " ", x.title)),
      ),
    );
  }
  return h(
    "div",
    { class: "cal", role: "grid", "aria-label": "30-day launch calendar" },
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => h("div", { class: "cal-wd" }, d)),
    cells,
  );
}

const fmtPostDate = (d: string) => {
  const t = new Date(d.length <= 10 ? d + "T12:00:00" : d);
  if (Number.isNaN(t.getTime())) return d;
  const day = t.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return d.length > 10 ? `${day} · ${t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : day;
};

function rae(p: Project, working: boolean) {
  const r = p.results.rae;
  if (!r) {
    // Real dates from tomorrow; coloured channel chips drop in while Rae writes the posts.
    const start = new Date(Date.now() + 86400000);
    const offset = (start.getDay() + 6) % 7;
    const ch = ["IG", "TT", "LI", "Mail", "IG", "X", "ALL"] as const;
    const cells: Node[] = [];
    for (let i = 0; i < offset; i++) cells.push(h("div", { class: "cal-cell empty", "aria-hidden": "true" }));
    let k = 0;
    for (let day = 1; day <= 30; day++) {
      const date = new Date(start.getTime() + (day - 1) * 86400000);
      const label = date.getDate() === 1 || day === 1 ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : String(date.getDate());
      const has = day % 3 !== 2;
      cells.push(
        h(
          "div",
          { class: `cal-cell${day === 1 ? " first" : ""}` },
          h("span", { class: "cal-d" }, label),
          has ? h("span", { class: "cal-chip drop", style: `--c:${CH_COLOR[ch[k % ch.length]]};${stagger(k++, 0.16)}`, "aria-hidden": "true" }) : null,
        ),
      );
    }
    return [
      section(
        "Launch calendar",
        working ? "planning…" : null,
        h("div", { class: "cal cal-compact" }, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => h("div", { class: "cal-wd" }, d)), cells),
      ),
      section(
        "First 3 posts",
        working ? "writing…" : null,
        h("div", { class: "posts" }, [0, 1, 2].map((i) => h("article", { class: "post skel-post" }, h("div", { class: "post-img" }), bar(90, i * 0.2), bar(70, i * 0.2 + 0.1)))),
      ),
    ];
  }
  const pal = p.results.nova?.names[p.results.nova.chosen]?.palette;
  const g1 = pal?.[0]?.hex ?? "#14B8A6";
  const g2 = pal?.[1]?.hex ?? "#0B0F15";
  return [
    h(
      "div",
      { class: "rae-grid" },
      section("Launch calendar", `${r.posts.length} posts · 30 days`, h("div", { class: "cal-compact-wrap" }, launchCalendar(r))),
      section(
        "First 3 posts",
        "ready to publish",
        h(
          "div",
          { class: "posts" },
          r.first_posts.slice(0, 3).map((x) =>
            h(
              "article",
              { class: "post" },
              h("div", { class: "post-h" }, h("span", { class: "post-av", style: `background:${g1}` }), h("b", null, r.handle.startsWith("@") ? r.handle : "@" + r.handle)),
              h("div", { class: "post-img", style: `background:linear-gradient(150deg,${g1},${g2})` }, h("small", null, x.kind), h("b", null, x.title)),
              h("p", null, x.text),
              h("small", { class: "muted" }, `${x.channel} · ${fmtPostDate(x.date)}`),
            ),
          ),
        ),
      ),
    ),
  ];
}

// ---------- Pip ----------

function pip(p: Project, working: boolean) {
  const r = p.results.pip;
  if (!r)
    return [
      section(
        "Landing page",
        working ? "deploying…" : null,
        h(
          "div",
          { class: "deploy" },
          h("div", { class: "deploy-bar" }, h("span", null)),
          h(
            "ol",
            { class: "deploy-steps" },
            ["Reserving your page address", "Publishing the landing page", "Opening BCH pre-orders to your wallet"].map((t, i) => h("li", { style: stagger(i, 0.9) }, h("span", { class: "spinner sm", "aria-hidden": "true" }), t)),
          ),
        ),
      ),
    ];
  const url = r.url || `/s/${r.slug}`;
  return [
    h(
      "div",
      { class: "live-card" },
      h("div", { class: "live-dot", "aria-hidden": "true" }),
      h(
        "div",
        null,
        h("b", null, "Live today · pre-orders open"),
        h("div", { class: "mono small" }, location.host + "/s/" + r.slug),
        h("p", { class: "muted small" }, "Customers pay with Bitcoin Cash straight to your wallet. LaunchDesk never holds your customers' money."),
      ),
      h("a", { class: "btn primary sm", href: url, target: "_blank", rel: "noopener" }, "Open page ", extIcon()),
    ),
  ];
}

const WILL: Record<WorkDept, string[]> = {
  mia: ["Project brief: concept, audience, goal", "4-week plan for every department"],
  leo: ["Opportunity score out of 10", "Competitor map and the gap you can own", "Go / no-go verdict"],
  sam: ["Price and start-up cost", "12-month revenue and cost projection", "Break-even month and the main risk"],
  nova: ["Three brand names with palettes", "Tagline and brand voice"],
  dex: ["Three logo concepts", "Landing page copy and offer"],
  rae: ["30-day launch calendar", "First three posts, ready to publish"],
  pip: ["Your landing page, live", "BCH pre-orders to your wallet"],
};

const BUILDERS: Record<WorkDept, (p: Project, working: boolean) => Array<Node | null>> = { mia, leo, sam, nova, dex, rae, pip };

const pillOf = (st: DeptStatus | "scheduled") =>
  statusPill(st === "error" ? "error" : st === "done" ? "done" : st === "working" ? "working" : st === "queued" ? "queued" : "scheduled");

/** The panel body for the department's current state (placeholder, result, or error). */
export function deptPanelBody(p: Project, d: WorkDept, onRetry: () => void) {
  const st = deptStatus(p, d);
  const t = TEAM[d];
  const body: Array<Node | null> = [];
  if (st === "error") {
    // Only the problem and what is still to come: placeholder charts next to an error look like broken data.
    body.push(
      h(
        "div",
        { class: "callout danger dp-err", role: "alert" },
        h("b", null, `${t.name} couldn't finish ${t.snag}`),
        h("p", null, "Retry is free: you already paid for this stage."),
        h("button", { type: "button", class: "btn sm danger", onclick: onRetry }, `Retry ${t.name}`),
      ),
      section("What " + t.name + " will deliver", null, h("ul", { class: "will-list" }, WILL[d].map((x) => h("li", null, h("span", { class: "dot", style: `--c:${t.color}` }), x)))),
    );
    return h("div", { class: "dp-body" }, body);
  }
  body.push(...BUILDERS[d](p, st === "working"));
  return h("div", { class: "dp-body" }, body);
}

/** Builds the panel for a department. */
export function deptPanel(p: Project, d: WorkDept, onClose: () => void, onRetry: () => void) {
  const t = TEAM[d];
  return h(
    "div",
    { class: `dp dp-${d}`, style: `--c:${t.color}`, role: "region", "aria-labelledby": `dp-h-${d}`, "data-dept": d },
    h(
      "header",
      { class: "dp-head" },
      avatar(d, "lg"),
      h(
        "div",
        { class: "dp-title" },
        h("b", { id: `dp-h-${d}` }, t.name, h("span", { class: "dp-role" }, ` · ${t.role}`)),
        h("small", null, h("span", { class: "dp-role-m" }, `${t.role} · `), t.panelSub),
      ),
      h("span", { class: "dp-pill" }, pillOf(deptStatus(p, d))),
      h("button", {
        type: "button",
        class: "icon-btn dp-collapse",
        "aria-label": `Collapse ${t.name}'s panel`,
        "aria-expanded": "true",
        onclick: (e: Event) => {
          const panel = (e.currentTarget as HTMLElement).closest(".dp")!;
          const c = panel.classList.toggle("collapsed");
          (e.currentTarget as HTMLElement).setAttribute("aria-expanded", String(!c));
          (e.currentTarget as HTMLElement).setAttribute("aria-label", `${c ? "Expand" : "Collapse"} ${t.name}'s panel`);
        },
        html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
      }),
      h("button", { type: "button", class: "icon-btn", "aria-label": `Close ${t.name}'s panel`, onclick: onClose, html: "&times;" }),
    ),
    deptPanelBody(p, d, onRetry),
  );
}

/** Updates an open panel in place: new pill, body crossfades (250 ms). */
export function refreshDeptPanel(el: HTMLElement, p: Project, d: WorkDept, onRetry: () => void) {
  el.querySelector(".dp-pill")?.replaceChildren(pillOf(deptStatus(p, d)));
  const old = el.querySelector(".dp-body");
  const next = deptPanelBody(p, d, onRetry);
  next.classList.add("fresh");
  if (old) old.replaceWith(next);
  else el.append(next);
}
