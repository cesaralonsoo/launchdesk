// WP3 · "Your 30-day plan" view. Mounted by kit-screen.ts into [data-kit-slot="plan"]:
//   mountPlanView(el, { plan, sources, brand, siteUrl, qrSvg })
// Four tabs (The plan · Week by week · Texts to copy · Budget and numbers); printing shows everything.
// Every local fact shows its source as a small numbered link; unsourced claims only appear under "Check first".
// Labels follow the plan's language (English or Spanish); the plan's own text is already in that language.
import type { PlanSource, PlanV2 } from "../../../server/marketing/schema";
import { esc } from "./dom";
import "./plan-view.css";

export interface PlanViewProps {
  plan: unknown;
  sources: PlanSource[];
  brand?: { name?: string; palette?: { primary?: string; accent?: string } } | null;
  siteUrl?: string | null;
  qrSvg?: string;
}

const L = {
  en: {
    title: "Your 30-day plan", goal: "Goal for day 30", counted: "How you count it", why: "Why this number",
    tabs: ["The plan", "Week by week", "Texts to copy", "Budget and numbers"],
    where: "Where your customers already are", channels: "What you'll do", notDoing: "What you won't do, and why",
    role: { awareness: "Get noticed", "first sales": "First sales", proof: "Build trust", repeat: "Bring them back" } as Record<string, string>,
    hWeek: "h a week", free: "Free", month: "a month", first: "First step",
    week: "Week", day: "Day", hours: "h", useText: "Text", local: "Good to know", events: "Coming up in the next 30 days",
    check: "Check first", checkSub: "The plan assumes these. Check them before you spend time or money.",
    posts: "Posts", post: "Post", message: "Message to people you know", email: "Email to your waitlist", subject: "Subject", flyer: "Flyer",
    profile: "Shop or map listing description", press: "Note to local press or a newsletter", copy: "Copy", copied: "Copied",
    budget: "Budget", reserve: "kept aside for whatever works best", move: "Days 22 to 30", kpis: "Numbers to watch",
    countFrom: { "bch payments": "From your payments", website: "From your website", "by hand": "Count by hand" } as Record<string, string>,
    day30: "On day 30, decide", scale: "Go bigger if", adjust: "Adjust if", stop: "Stop if",
    sources: "Sources", print: "Print the plan", scan: "Scan to open the website", noBudget: "No money needed",
  },
  es: {
    title: "Tu plan de 30 días", goal: "Objetivo para el día 30", counted: "Cómo lo cuentas", why: "Por qué este número",
    tabs: ["El plan", "Semana a semana", "Textos para copiar", "Presupuesto y números"],
    where: "Dónde están ya tus clientes", channels: "Qué vas a hacer", notDoing: "Qué no vas a hacer, y por qué",
    role: { awareness: "Darte a conocer", "first sales": "Primeras ventas", proof: "Ganar confianza", repeat: "Que repitan" } as Record<string, string>,
    hWeek: "h a la semana", free: "Gratis", month: "al mes", first: "Primer paso",
    week: "Semana", day: "Día", hours: "h", useText: "Texto", local: "Bueno saber", events: "En los próximos 30 días",
    check: "Compruébalo antes", checkSub: "El plan da esto por hecho. Compruébalo antes de poner tiempo o dinero.",
    posts: "Publicaciones", post: "Publicación", message: "Mensaje para gente que conoces", email: "Email a tu lista de espera", subject: "Asunto", flyer: "Cartel",
    profile: "Descripción para tu ficha en el mapa", press: "Nota para prensa local o un boletín", copy: "Copiar", copied: "Copiado",
    budget: "Presupuesto", reserve: "de reserva para lo que mejor funcione", move: "Días 22 a 30", kpis: "Números a vigilar",
    countFrom: { "bch payments": "Con tus pagos", website: "En tu web", "by hand": "A mano" } as Record<string, string>,
    day30: "El día 30, decide", scale: "Crece si", adjust: "Ajusta si", stop: "Para si",
    sources: "Fuentes", print: "Imprimir el plan", scan: "Escanea para abrir la web", noBudget: "Sin gastar dinero",
  },
};
type Labels = (typeof L)["en"];
const COPY_NAMES = (t: Labels): Record<string, string> => ({ "post-1": `${t.post} 1`, "post-2": `${t.post} 2`, "post-3": `${t.post} 3`, message: t.message, email: t.email, flyer: t.flyer, profile: t.profile, press: t.press });

const isPlan = (p: unknown): p is PlanV2 => !!p && typeof p === "object" && "goal" in p && Array.isArray((p as PlanV2).channels) && Array.isArray((p as PlanV2).weeks);
const money = (n: number, cur: string, lang: string) => {
  try {
    return new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-GB", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${n} ${cur}`;
  }
};
const br = (s: string) => esc(s).replace(/\n/g, "<br>");
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** Pure: the plan as HTML (exported for tests and the preview page). */
export function planViewHtml(props: PlanViewProps): string {
  const p = props.plan;
  if (!isPlan(p)) return `<section class="pv pv-empty"><p>Your plan is on its way.</p></section>`;
  const t: Labels = p.lang === "es" ? L.es : L.en;
  const lang = p.lang;
  const cur = p.currency || "EUR";
  const srcs = new Map(props.sources.map((s) => [s.n, s]));
  const used: number[] = [];
  const cite = (n: number | null | undefined) => {
    if (n == null || !srcs.has(n)) return "";
    if (!used.includes(n)) used.push(n);
    const s = srcs.get(n)!;
    return `<a class="pv-cite" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.title)}">${used.indexOf(n) + 1}</a>`;
  };
  const site = props.siteUrl ? String(props.siteUrl) : "";
  const names = COPY_NAMES(t);
  const copyBtn = (id: string) => `<button type="button" class="pv-copy" data-pv-copy="${id}"><span>${t.copy}</span></button>`;

  // ── tab 1: the plan
  const goal = `<div class="pv-goal">
      <p class="pv-k">${t.goal}</p>
      <p class="pv-goal-n"><b>${p.goal.target}</b> <span>${esc(p.goal.unit)}</span></p>
      <p class="pv-goal-m">${esc(p.goal.metric)}</p>
      <dl class="pv-goal-dl"><div><dt>${t.why}</dt><dd>${esc(p.goal.why)}</dd></div><div><dt>${t.counted}</dt><dd>${esc(p.goal.how_counted)}</dd></div></dl>
    </div>`;
  const places = p.customer.places.length
    ? `<h3>${t.where}</h3><p class="pv-who">${esc(p.customer.who)}</p><ul class="pv-places">${p.customer.places.map((x) => `<li><span class="pv-nm"><b>${esc(x.place)}</b>${cite(x.source)}</span><span>${esc(x.when)}</span></li>`).join("")}</ul>`
    : "";
  const channels = `<h3>${t.channels}</h3><div class="pv-chs">${p.channels
    .map(
      (c, i) => `<article class="pv-ch">
        <header><span class="pv-n">${i + 1}</span><span class="pv-role" data-role="${esc(c.role)}">${esc(t.role[c.role] ?? c.role)}</span></header>
        <h4>${esc(c.name)}</h4>
        <p>${esc(c.why)}${cite(c.source)}</p>
        <p class="pv-first"><b>${t.first}</b> ${esc(c.first_action)}</p>
        <footer><span>${c.weekly_hours} ${t.hWeek}</span><span>${c.cost ? `${money(c.cost, cur, lang)} ${t.month}` : t.free}</span></footer>
      </article>`,
    )
    .join("")}</div>`;
  const rejected = p.rejected.length ? `<h3>${t.notDoing}</h3><ul class="pv-no">${p.rejected.map((r) => `<li><b>${esc(r.name)}</b> ${esc(r.why_not)}</li>`).join("")}</ul>` : "";
  const local = p.local.length ? `<h3>${t.local}</h3><ul class="pv-facts">${p.local.map((f) => `<li>${esc(f.fact)}${cite(f.source)}</li>`).join("")}</ul>` : "";
  const events = p.events.length ? `<h3>${t.events}</h3><ul class="pv-events">${p.events.map((e) => `<li><span class="pv-date">${esc(e.date)}</span><span class="pv-nm"><b>${esc(e.name)}</b>${cite(e.source)}</span><span>${esc(e.where)}</span></li>`).join("")}</ul>` : "";
  const assumptions = p.assumptions.length ? `<div class="pv-check"><h3>${t.check}</h3><p>${t.checkSub}</p><ul>${p.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>` : "";
  const tab1 = `${goal}${places}${channels}${rejected}${events}${local}${assumptions}`;

  // ── tab 2: week by week
  const tab2 = `<ol class="pv-weeks">${p.weeks
    .map(
      (w) => `<li class="pv-week"><header><span class="pv-k">${t.week} ${w.n}</span><h4>${esc(w.theme)}</h4><p>${esc(w.aim)}</p></header>
      <ul class="pv-days">${w.days
        .map(
          (d) => `<li><span class="pv-day"><b>${t.day} ${d.day}</b>${d.time ? `<span>${esc(d.time)}</span>` : ""}</span>
          <span class="pv-act"><span class="pv-chan">${esc(d.channel)}</span>${esc(d.action)}${d.copy && names[d.copy] ? ` <button type="button" class="pv-useref" data-pv-goto="${d.copy}">${t.useText}: ${esc(names[d.copy]!)}</button>` : ""}</span>
          <span class="pv-hrs">${d.hours ? `${d.hours} ${t.hours}` : ""}</span></li>`,
        )
        .join("")}</ul></li>`,
    )
    .join("")}</ol>`;

  // ── tab 3: texts to copy
  const c = p.copy;
  const block = (id: string, title: string, body: string, extra = "") => `<article class="pv-text" id="pv-${id}" data-pv-text="${id}"><header><h4>${esc(title)}</h4>${copyBtn(id)}</header>${extra}<div class="pv-body" data-pv-src="${id}">${body}</div></article>`;
  const flyer = `<article class="pv-text pv-flyer-wrap" id="pv-flyer" data-pv-text="flyer"><header><h4>${t.flyer}</h4>${copyBtn("flyer")}</header>
      <div class="pv-flyer" data-pv-src="flyer"><p class="pv-fh">${esc(c.flyer.headline)}</p>${c.flyer.lines.map((l) => `<p>${esc(l)}</p>`).join("")}
      ${site ? `<div class="pv-fq">${props.qrSvg ?? ""}<span>${esc(t.scan)}<br><b>${esc(host(site))}</b></span></div>` : ""}</div></article>`;
  const tab3 = `<div class="pv-texts">
    ${c.posts.map((x, i) => block(`post-${i + 1}`, `${t.post} ${i + 1} · ${x.channel}`, `<p><b>${esc(x.hook)}</b></p><p>${br(x.body)}</p><p>${esc(x.cta)}</p>`)).join("")}
    ${block("message", t.message, `<p>${br(c.message)}</p>`)}
    ${block("email", t.email, `<p><b>${t.subject}:</b> ${esc(c.email.subject)}</p><p>${br(c.email.body)}</p>`)}
    ${flyer}
    ${block("profile", t.profile, `<p>${br(c.profile)}</p>`)}
    ${block("press", t.press, `<p>${br(c.press)}</p>`)}
  </div>`;

  // ── tab 4: budget and numbers
  const tiers = p.budget.tiers;
  const tierTabs = `<div class="pv-tiers" role="tablist">${tiers.map((x, i) => `<button type="button" role="tab" data-pv-tier="${i}" aria-selected="${i === Math.min(1, tiers.length - 1)}">${x.amount ? money(x.amount, cur, lang) : t.noBudget}</button>`).join("")}</div>`;
  const tierBodies = tiers
    .map((x, i) => {
      const max = Math.max(1, ...x.lines.map((l) => l.amount));
      return `<div class="pv-tier" data-pv-tierbody="${i}" ${i === Math.min(1, tiers.length - 1) ? "" : "hidden"}><p class="pv-tl">${esc(x.label)}</p><ul>${x.lines
        .map((l) => `<li><span class="pv-bl"><b>${esc(l.channel)}</b><span>${esc(l.for)}</span></span><span class="pv-bar"><i style="--w:${x.amount ? l.amount / max : 0}"></i></span><span class="pv-amt">${l.amount ? money(l.amount, cur, lang) : t.free}</span></li>`)
        .join("")}</ul></div>`;
    })
    .join("");
  const kpis = `<h3>${t.kpis}</h3><ul class="pv-kpis">${p.kpis.map((k) => `<li><span class="pv-kt"><b>${esc(k.name)}</b><span>${esc(k.how_to_count)}</span></span><span class="pv-kv">${esc(k.target)}<em data-from="${esc(k.count_from)}">${esc(t.countFrom[k.count_from] ?? k.count_from)}</em></span></li>`).join("")}</ul>`;
  const decision = `<h3>${t.day30}</h3><div class="pv-dec"><div data-d="scale"><b>${t.scale}</b><p>${esc(p.decision.scale_if)}</p></div><div data-d="adjust"><b>${t.adjust}</b><p>${esc(p.decision.adjust_if)}</p></div><div data-d="stop"><b>${t.stop}</b><p>${esc(p.decision.stop_if)}</p></div></div>`;
  const tab4 = `<h3>${t.budget}</h3>${tierTabs}${tierBodies}<p class="pv-reserve"><b>${p.budget.reserve_pct}%</b> ${t.reserve}. <b>${t.move}:</b> ${esc(p.budget.reallocate_rule)}</p>${kpis}${decision}`;

  const sourceList = used.length ? `<footer class="pv-sources"><h3>${t.sources}</h3><ol>${used.map((n) => `<li><a href="${esc(srcs.get(n)!.url)}" target="_blank" rel="noopener noreferrer">${esc(srcs.get(n)!.title)}</a> <span>${esc(host(srcs.get(n)!.url))}</span></li>`).join("")}</ol></footer>` : "";
  const accent = props.brand?.palette?.primary && /^#[0-9a-f]{3,8}$/i.test(props.brand.palette.primary) ? ` style="--pv-brand:${props.brand.palette.primary}"` : "";

  return `<section class="pv" lang="${esc(lang)}"${accent}>
    <header class="pv-head"><div><p class="pv-k">${t.title}</p><h2>${esc(p.headline)}</h2></div>
      <button type="button" class="pv-print" data-pv-print>${t.print}</button></header>
    <nav class="pv-tabs" role="tablist">${t.tabs.map((x, i) => `<button type="button" role="tab" data-pv-tab="${i}" aria-selected="${i === 0}">${x}</button>`).join("")}</nav>
    <div class="pv-panel" data-pv-panel="0">${tab1}</div>
    <div class="pv-panel" data-pv-panel="1" hidden>${tab2}</div>
    <div class="pv-panel" data-pv-panel="2" hidden>${tab3}</div>
    <div class="pv-panel" data-pv-panel="3" hidden>${tab4}</div>
    ${sourceList}
  </section>`;
}

/** Plain text of one copy block, with the website link added when the text has none. */
export function copyText(p: PlanV2, id: string, siteUrl?: string | null): string {
  const c = p.copy;
  const m = /^post-(\d)$/.exec(id);
  let s = "";
  if (m) {
    const x = c.posts[Number(m[1]) - 1];
    s = x ? `${x.hook}\n\n${x.body}\n\n${x.cta}` : "";
  } else if (id === "message") s = c.message;
  else if (id === "email") s = `${c.email.subject}\n\n${c.email.body}`;
  else if (id === "flyer") s = [c.flyer.headline, ...c.flyer.lines].join("\n");
  else if (id === "profile") s = c.profile;
  else if (id === "press") s = c.press;
  if (siteUrl && s && !s.includes(siteUrl) && id !== "profile") s += `\n\n${siteUrl}`;
  return s;
}

export function mountPlanView(root: HTMLElement, props: PlanViewProps): void {
  root.innerHTML = planViewHtml(props);
  const p = props.plan;
  if (!isPlan(p)) return;
  const pv = root.querySelector<HTMLElement>(".pv")!;
  const t = p.lang === "es" ? L.es : L.en;
  const showTab = (i: number) => {
    pv.querySelectorAll<HTMLElement>("[data-pv-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.pvTab === String(i))));
    pv.querySelectorAll<HTMLElement>("[data-pv-panel]").forEach((x) => (x.hidden = x.dataset.pvPanel !== String(i)));
  };
  pv.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;
    const tab = target.closest<HTMLElement>("[data-pv-tab]");
    if (tab) return showTab(Number(tab.dataset.pvTab));
    const tier = target.closest<HTMLElement>("[data-pv-tier]");
    if (tier) {
      pv.querySelectorAll<HTMLElement>("[data-pv-tier]").forEach((b) => b.setAttribute("aria-selected", String(b === tier)));
      pv.querySelectorAll<HTMLElement>("[data-pv-tierbody]").forEach((x) => (x.hidden = x.dataset.pvTierbody !== tier.dataset.pvTier));
      return;
    }
    const go = target.closest<HTMLElement>("[data-pv-goto]");
    if (go) {
      showTab(2);
      pv.querySelector(`#pv-${go.dataset.pvGoto}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const cp = target.closest<HTMLButtonElement>("[data-pv-copy]");
    if (cp) {
      const text = copyText(p, cp.dataset.pvCopy!, props.siteUrl);
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.append(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      cp.dataset.done = "1";
      cp.querySelector("span")!.textContent = t.copied;
      setTimeout(() => {
        delete cp.dataset.done;
        cp.querySelector("span")!.textContent = t.copy;
      }, 1600);
      return;
    }
    if (target.closest("[data-pv-print]")) {
      document.documentElement.classList.add("pv-printing");
      window.print();
      setTimeout(() => document.documentElement.classList.remove("pv-printing"), 500);
    }
  });
}
