import { TEAM, type Stage } from "./team";

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const list = (xs: unknown[] = [], cls = "") => `<ul class="clean ${cls}">${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
const copyBtn = (text: string) => `<button class="copy" data-copy="${esc(text)}">Copy</button>`;

function scoreRing(n: number, color: string) {
  const r = 54;
  const c = 2 * Math.PI * r;
  return `<div class="score"><svg viewBox="0 0 132 132"><circle cx="66" cy="66" r="${r}" stroke="#1b2431" stroke-width="12" fill="none"/>
    <circle cx="66" cy="66" r="${r}" stroke="${color}" stroke-width="12" fill="none" stroke-linecap="round"
      stroke-dasharray="${(c * Math.max(0, Math.min(100, n))) / 100} ${c}"/></svg>
    <div class="n"><div>${n}<small>/ 100</small></div></div></div>`;
}

export function renderValidate(v: any) {
  const color = v.verdict === "go" ? "#0FD9A0" : v.verdict === "pivot" ? "#F5C542" : "#FF7A6B";
  const label = v.verdict === "go" ? "Go" : v.verdict === "pivot" ? "Pivot" : "No-go";
  const dims: Array<[string, any]> = [
    ["Problem", v.problem_strength],
    ["Market", v.market],
    ["Competition", v.competition],
    ["Feasibility", v.feasibility],
  ];
  return `
  <div class="rep-head">
    ${scoreRing(v.score, color)}
    <div style="flex:1;min-width:240px">
      <span class="verdict ${esc(v.verdict)}">${label}</span>
      <h2 style="margin-top:10px">${esc(v.one_liner)}</h2>
      <p class="lead">${esc(v.summary)}</p>
    </div>
  </div>
  <div class="grid2">
    <div class="sec"><h4>Scores</h4><div class="bars">${dims
      .map(
        ([k, d]) => `<div class="bar"><div class="l"><span>${k}</span><span>${d?.score ?? "–"}</span></div>
        <div class="track"><div class="fill" style="width:${d?.score ?? 0}%"></div></div><div class="note">${esc(d?.note)}</div></div>`,
      )
      .join("")}</div></div>
    <div class="sec"><h4>Who it's for</h4><div class="callout">${esc(v.target_customer)}</div>
      <h4>Strengths</h4>${list(v.strengths)}
      <h4>Risks</h4>${list(v.risks, "risk")}</div>
  </div>
  <div class="sec"><h4>Competitors</h4><table class="t"><thead><tr><th>Name</th><th>Note</th></tr></thead><tbody>
    ${(v.competitors || []).map((c: any) => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.note)}</td></tr>`).join("")}</tbody></table></div>
  <div class="sec"><h4>Cheapest test this week</h4><div class="callout" style="--c:#F5C542">${esc(v.cheapest_test)}</div></div>
  ${v.pivot_ideas?.length ? `<div class="sec"><h4>Pivot ideas</h4>${list(v.pivot_ideas)}</div>` : ""}`;
}

export function renderPlan(p: any) {
  return `
  <h2>${esc(p.positioning)}</h2>
  <p class="lead">${esc(p.value_proposition)}</p>
  <div class="sec"><h4>Customer segments</h4><table class="t"><tbody>
    ${(p.customer_segments || []).map((s: any) => `<tr><td><b>${esc(s.segment)}</b></td><td>${esc(s.why)}</td></tr>`).join("")}</tbody></table></div>
  <div class="sec"><h4>Pricing</h4><div class="tiers">
    ${(p.pricing || []).map((t: any) => `<div class="tier"><b>${esc(t.tier)}</b><div class="p">${esc(t.price)}</div><div>${esc(t.includes)}</div></div>`).join("")}</div>
    <div class="callout">${esc(p.revenue_model)}</div></div>
  <div class="sec"><h4>90-day roadmap</h4><div class="road">
    ${(p.roadmap || []).map((r: any) => `<div><div class="w">${esc(r.phase)}<small>Weeks ${esc(r.weeks)}</small></div><div>${list(r.goals)}</div></div>`).join("")}</div></div>
  <div class="grid2">
    <div class="sec"><h4>Channels</h4><table class="t"><tbody>
      ${(p.channels || []).map((c: any) => `<tr><td><b>${esc(c.channel)}</b></td><td>${esc(c.tactic)}</td></tr>`).join("")}</tbody></table></div>
    <div class="sec"><h4>Startup costs</h4><table class="t"><tbody>
      ${(p.startup_costs || []).map((c: any) => `<tr><td>${esc(c.item)}</td><td><b>${esc(c.cost)}</b></td></tr>`).join("")}</tbody></table></div>
  </div>
  <div class="grid2">
    <div class="sec"><h4>KPIs</h4><table class="t"><tbody>
      ${(p.kpis || []).map((k: any) => `<tr><td>${esc(k.metric)}</td><td><b>${esc(k.target)}</b></td></tr>`).join("")}</tbody></table></div>
    <div class="sec"><h4>Your first week</h4>${list(p.first_week)}</div>
  </div>`;
}

export function renderKit(k: any) {
  const l = k.landing || {};
  return `
  <h2>${esc(k.tagline)}</h2>
  <p class="lead">${esc(k.elevator_pitch)}</p>
  <div class="sec"><h4>Name ideas</h4><div class="names">
    ${(k.name_ideas || []).map((n: any) => `<span><b>${esc(n.name)}</b>${esc(n.why)}</span>`).join("")}</div></div>
  <div class="sec"><h4>Landing page</h4><div class="landing-prev">
    <h3>${esc(l.headline)}</h3><p>${esc(l.subheadline)}</p>
    ${list(l.bullets).replace('class="clean "', 'class="clean" style="display:inline-grid;text-align:left"')}
    <div><span class="fake-btn">${esc(l.cta)}</span></div></div></div>
  <div class="sec"><h4>Social posts</h4><div class="bars">
    ${(k.posts || []).map((p: any) => `<div class="post">${copyBtn(p.text)}<div class="ch">${esc(p.channel)}</div><p>${esc(p.text)}</p></div>`).join("")}</div></div>
  <div class="sec"><h4>Launch email</h4><div class="post">${copyBtn(`${k.launch_email?.subject}\n\n${k.launch_email?.body}`)}
    <div class="ch">Subject: ${esc(k.launch_email?.subject)}</div><p>${esc(k.launch_email?.body)}</p></div></div>
  <div class="sec"><h4>Launch checklist</h4>${list(k.launch_checklist)}</div>`;
}

export const RENDER: Record<Stage, (x: any) => string> = { validate: renderValidate, plan: renderPlan, kit: renderKit };
export const stageColor = (s: Stage) => TEAM[s].color;
