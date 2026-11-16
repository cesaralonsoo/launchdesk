// WP1 Website template "editorial": serif display, thin rules, big numerals, off-white. Cafés, bakeries, local services.
import type { Section } from "../spec.js";
import { chrome, credit, esc, faqList, icon, mark, priceLine, reserveBtn, scarcity, sectionOf, sourceLink, waitlist, type RenderCtx } from "./shared.js";

export const fonts = { display: "Instrument Serif", text: "Inter", href: "family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700" };
export const mode = "light" as const;

export const css = `
:root{--fd:"Instrument Serif",ui-serif,Georgia,serif;--fb:"Inter",ui-sans-serif,system-ui,sans-serif}
.nav{position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid transparent}
.nav .wrap{display:flex;align-items:center;justify-content:space-between;height:72px;gap:16px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font:400 26px/1 var(--fd);letter-spacing:-.01em}
.nav nav{display:none;gap:28px;font-size:15px;color:var(--mu)}.nav nav a{text-decoration:none}.nav nav a:hover{color:var(--ink)}
@media(min-width:900px){.nav nav{display:flex}}
.hero{padding:40px 0 72px}.hero .wrap{display:grid;gap:48px;align-items:center}
@media(min-width:900px){.hero{padding:72px 0 112px}.hero .wrap{grid-template-columns:1.15fr .85fr;gap:72px}}
.eyebrow{display:flex;align-items:center;gap:12px;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:var(--mu);margin-bottom:28px}.eyebrow::before{content:"";width:28px;height:1px;background:currentColor}
.hero h1{font:400 clamp(52px,8.4vw,108px)/.95 var(--fd);letter-spacing:-.025em;text-wrap:balance}
.hero h1 em{font-style:italic;color:var(--p)}
.hero .sub{margin-top:28px;max-width:34ch;font-size:clamp(18px,1.6vw,21px);color:var(--mu);text-wrap:pretty}
.ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:36px}.hero .scarce{margin-top:22px}
.plate{position:relative;aspect-ratio:4/5;border-radius:28px;background:var(--tint);overflow:hidden;isolation:isolate}
.plate::before{content:"";position:absolute;inset:-20%;background:radial-gradient(40% 35% at 70% 25%,color-mix(in srgb,var(--a) 55%,transparent),transparent 70%),radial-gradient(45% 40% at 20% 85%,color-mix(in srgb,var(--p) 30%,transparent),transparent 70%);z-index:-1}
.plate::after{content:"";position:absolute;inset:0;opacity:.35;mix-blend-mode:multiply;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
.plate .mark{position:absolute;left:50%;top:44%;width:46%;height:auto;transform:translate(-50%,-50%);filter:drop-shadow(0 24px 40px rgb(0 0 0/.18))}
.plate .ring{position:absolute;left:50%;top:44%;width:78%;aspect-ratio:1;border:1px solid color-mix(in srgb,var(--ink) 18%,transparent);border-radius:50%;transform:translate(-50%,-50%)}
.ticket{position:absolute;left:18px;right:18px;bottom:18px;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 18px;border-radius:18px;background:color-mix(in srgb,var(--sf) 88%,transparent);backdrop-filter:blur(10px);box-shadow:0 18px 40px -18px rgb(0 0 0/.3)}
.ticket small{display:block;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--mu)}.ticket strong{font:400 22px/1.15 var(--fd)}
.ticket .tp{font:400 34px/1 var(--fd);white-space:nowrap}
.sec{padding:88px 0;border-top:1px solid var(--ln)}@media(min-width:900px){.sec{padding:120px 0}}
.kick{display:flex;gap:14px;align-items:baseline;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:var(--mu);margin-bottom:22px}.kick b{font:400 15px/1 var(--fd);letter-spacing:0;color:var(--p)}
.h2{font:400 clamp(38px,5.2vw,68px)/1 var(--fd);letter-spacing:-.02em;max-width:18ch;text-wrap:balance}
.lead{margin-top:18px;max-width:52ch;color:var(--mu);font-size:19px}
.stats{display:grid;gap:0;margin-top:56px}@media(min-width:760px){.stats{grid-template-columns:repeat(var(--n),1fr)}}
.stat{padding:28px 0;border-top:1px solid var(--ln)}@media(min-width:760px){.stat{padding:8px 32px 0 0;border-top:0;border-left:1px solid var(--ln);padding-left:28px}.stat:first-child{border-left:0;padding-left:0}}
.stat .v{font:400 clamp(64px,8vw,104px)/1 var(--fd);letter-spacing:-.03em;color:var(--p)}.stat p{margin:14px 0 14px;max-width:30ch}
.steps{display:grid;gap:40px;margin-top:64px;counter-reset:s}@media(min-width:760px){.steps{grid-template-columns:repeat(3,1fr);gap:40px}}
.step{border-top:1px solid var(--ink);padding-top:22px}.step .n{font:italic 400 44px/1 var(--fd);color:var(--p)}.step h3{margin:18px 0 8px;font-size:20px;font-weight:600}.step p{color:var(--mu)}
.menu{margin-top:56px;display:grid;gap:0}@media(min-width:900px){.menu{grid-template-columns:1fr 1fr;column-gap:64px}}
.item{display:grid;grid-template-columns:auto 1fr;gap:18px;padding:26px 0;border-top:1px solid var(--ln)}.item .ic{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:var(--tint);color:var(--p)}
.item h3{font:400 28px/1.1 var(--fd)}.item p{color:var(--mu);margin-top:6px}
.offer{display:grid;gap:0;border-radius:28px;background:var(--sf);border:1px solid var(--ln);overflow:hidden;margin-top:48px;box-shadow:0 30px 60px -40px rgb(0 0 0/.25)}
@media(min-width:900px){.offer{grid-template-columns:1.2fr .8fr}}
.offer .l{padding:36px 28px}.offer .r{padding:36px 28px;display:flex;flex-direction:column;justify-content:center;gap:18px;background:var(--tint);position:relative}
@media(min-width:900px){.offer .l,.offer .r{padding:56px}.offer .r{border-left:2px dashed color-mix(in srgb,var(--ink) 20%,transparent)}}
@media(max-width:899px){.offer .r{border-top:2px dashed color-mix(in srgb,var(--ink) 20%,transparent)}}
.offer h3{font:400 clamp(32px,4vw,48px)/1.05 var(--fd);letter-spacing:-.015em}
.ticks{list-style:none;padding:0;margin:28px 0 0;display:grid;gap:14px}.ticks li{display:flex;gap:12px;align-items:flex-start}.ticks svg{flex:none;margin-top:3px;color:var(--p)}
.note{margin-top:24px;font-size:14px;color:var(--mu)}
.offer .btn{width:100%}
.about p.big{font:400 clamp(30px,3.6vw,46px)/1.18 var(--fd);letter-spacing:-.01em;max-width:28ch;margin-top:8px;text-wrap:pretty}
.local{display:grid;gap:32px;margin-top:40px}@media(min-width:900px){.local{grid-template-columns:1fr 1fr;align-items:end}}
.facts{display:grid;gap:12px}.fact{display:flex;gap:14px;align-items:center;padding:18px 20px;border-radius:18px;background:var(--sf);border:1px solid var(--ln)}.fact svg{color:var(--p)}
.faq{display:grid;gap:40px}@media(min-width:900px){.faq{grid-template-columns:.8fr 1.2fr;gap:80px}}.faq details:first-child{border-top:1px solid var(--ln)}
.final{padding:120px 0;text-align:center;background:var(--ink);color:var(--bg)}.final .h2{margin-inline:auto;max-width:16ch;font-size:clamp(44px,7vw,92px)}
.final p.lead{margin-inline:auto;color:color-mix(in srgb,var(--bg) 70%,transparent)}.final .ctas{justify-content:center}
.final .btn-p{background:var(--bg);color:var(--ink)}.final .wl{margin:28px auto 0}.final .wl input{background:transparent;border-color:color-mix(in srgb,var(--bg) 25%,transparent);color:var(--bg)}
.final .wl input::placeholder{color:color-mix(in srgb,var(--bg) 55%,transparent)}.final .wl button{background:var(--a);color:var(--oa)}.final .wl-note,.final .wl-ok{color:color-mix(in srgb,var(--bg) 65%,transparent)}
footer{padding:40px 0;font-size:14px;color:var(--mu)}footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;align-items:center}
`;

const kick = (n: number, label: string) => `<p class="kick"><b>(${String(n).padStart(2, "0")})</b>${esc(label)}</p>`;

function section(c: RenderCtx, s: Section, n: number): string {
  switch (s.kind) {
    case "proof-stats":
      return `<section class="sec"><div class="wrap">${kick(n, s.title || "")}<div class="stats" style="--n:${s.stats.length}">${s.stats
        .map((st) => `<div class="stat rv"><div class="v">${esc(st.value)}</div><p>${esc(st.label)}</p>${sourceLink(c, st.sourceUrl, st.source)}</div>`)
        .join("")}</div></div></section>`;
    case "how-it-works-for-customer":
      return `<section class="sec" id="how"><div class="wrap">${kick(n, c.ui.howItWorks)}<h2 class="h2 rv">${esc(s.title)}</h2><div class="steps">${s.steps
        .map((st, i) => `<div class="step rv"><div class="n">${i + 1}.</div><h3>${esc(st.title)}</h3><p>${esc(st.body)}</p></div>`)
        .join("")}</div></div></section>`;
    case "menu-or-services":
      return `<section class="sec"><div class="wrap">${kick(n, s.title)}<h2 class="h2 rv">${esc(s.intro || s.title)}</h2><div class="menu">${s.items
        .map((it) => `<div class="item rv"><span class="ic">${icon(it.icon, 22)}</span><div><h3>${esc(it.title)}</h3><p>${esc(it.body)}</p></div></div>`)
        .join("")}</div></div></section>`;
    case "offer":
      return `<section class="sec" id="offer"><div class="wrap">${kick(n, c.ui.offer)}<h2 class="h2 rv">${esc(s.title)}</h2><div class="offer rv"><div class="l"><h3>${esc(s.item)}</h3><ul class="ticks">${s.bullets
        .map((b) => `<li>${icon("check", 18, 2)}<span>${esc(b)}</span></li>`)
        .join("")}</ul>${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}</div><div class="r">${priceLine(c)}${scarcity(c)}${reserveBtn(c)}${waitlist(c, "wl")}</div></div></div></section>`;
    case "about":
      return `<section class="sec about"><div class="wrap">${kick(n, s.title)}<p class="big rv">${esc(s.body)}</p></div></section>`;
    case "local":
      return `<section class="sec"><div class="wrap">${kick(n, s.title)}<div class="local"><h2 class="h2 rv">${esc(s.body)}</h2><div class="facts rv">${
        s.area ? `<div class="fact">${icon("map-pin")}<span>${esc(s.area)}</span></div>` : ""
      }${s.hours ? `<div class="fact">${icon("clock")}<span>${esc(s.hours)}</span></div>` : ""}</div></div></div></section>`;
    case "faq":
      return `<section class="sec" id="faq"><div class="wrap faq"><div>${kick(n, c.ui.faq)}<h2 class="h2">${esc(s.title)}</h2></div><div>${faqList(s.items)}</div></div></section>`;
  }
}

export function body(c: RenderCtx): string {
  const s = c.spec;
  const offer = sectionOf(s, "offer");
  const how = sectionOf(s, "how-it-works-for-customer");
  const ticket = c.price
    ? `<div class="ticket"><div><small>${esc(c.ui.offer)}</small><strong>${esc(offer?.item ?? "")}</strong></div><span class="tp">${esc(c.price)}</span></div>`
    : "";
  return `<header class="nav"><div class="wrap"><a class="brand" href="#top">${mark(c, 34)}<span>${esc(c.brand.name)}</span></a><nav>${how ? `<a href="#how">${esc(c.ui.howItWorks)}</a>` : ""}<a href="#offer">${esc(c.ui.offer)}</a><a href="#faq">${esc(c.ui.faq)}</a></nav>${reserveBtn(c, c.ui.reserve, "btn btn-p btn-sm")}</div></header>
<main id="top">
<section class="hero" data-hero><div class="wrap"><div><p class="eyebrow">${esc(s.hero.eyebrow)}</p><h1>${esc(s.hero.headline)}</h1><p class="sub">${esc(s.hero.sub)}</p>
<div class="ctas">${reserveBtn(c, s.hero.cta)}<a class="btn btn-g" href="${how ? "#how" : "#offer"}">${esc(s.hero.secondary)}</a></div>${scarcity(c)}</div>
<div class="plate rv"><span class="ring"></span>${mark(c, 240)}${ticket}</div></div></section>
${s.sections.map((x, i) => section(c, x, i + 1)).join("\n")}
<section class="final"><div class="wrap"><h2 class="h2">${esc(s.finalCta.headline)}</h2>${s.finalCta.sub ? `<p class="lead">${esc(s.finalCta.sub)}</p>` : ""}<div class="ctas">${reserveBtn(c, s.finalCta.cta)}</div>${waitlist(c, "wl2")}</div></section>
</main>
<footer><div class="wrap"><span class="brand">${mark(c, 26)}<span>${esc(c.brand.name)}</span></span><span>${esc(s.footer.tagline)}</span>${credit(c)}</div></footer>
${chrome(c)}`;
}

