// WP1 Website template "bold": dark page, glowing mesh hero, oversized grotesk, bento cards. Apps, SaaS, services.
import type { Section } from "../spec.js";
import { exampleNotice, menuList, chrome, credit, esc, faqList, icon, mark, photoBand, photoCreditLine, photoImg, priceLine, reserveBtn, scarcity, sectionOf, sourceLink, waitlist, type RenderCtx } from "./shared.js";

export const fonts = { display: "Bricolage Grotesque", text: "Inter", href: "family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Inter:wght@400;500;600;700" };
export const mode = "dark" as const;

export const css = `
:root{--fd:"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif;--fb:"Inter",ui-sans-serif,system-ui,sans-serif;color-scheme:dark}
body{background:var(--bg)}
.glass{background:color-mix(in srgb,var(--sf) 70%,transparent);border:1px solid color-mix(in srgb,var(--ink) 10%,transparent);backdrop-filter:blur(16px) saturate(1.3)}
.nav{position:sticky;top:0;z-index:30;padding:14px 0}
.nav .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;height:60px;padding:0 10px 0 16px;border-radius:999px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font:700 20px/1 var(--fd);letter-spacing:-.02em}
.nav nav{display:none;gap:26px;font-size:15px;color:var(--mu)}.nav nav a{text-decoration:none}.nav nav a:hover{color:var(--ink)}@media(min-width:900px){.nav nav{display:flex}}
.hero{position:relative;padding:56px 0 88px;overflow:hidden;isolation:isolate;margin-top:-88px;padding-top:144px}
.hero::before{content:"";position:absolute;inset:-10% -10% 0;z-index:-2;background:radial-gradient(38% 46% at 78% 30%,color-mix(in srgb,var(--p) 70%,transparent),transparent 70%),radial-gradient(30% 40% at 18% 20%,color-mix(in srgb,var(--a) 45%,transparent),transparent 70%),radial-gradient(50% 50% at 50% 100%,color-mix(in srgb,var(--p) 30%,transparent),transparent 70%);filter:blur(30px);opacity:.75}
.hero::after{content:"";position:absolute;inset:0;z-index:-1;background-image:linear-gradient(color-mix(in srgb,var(--ink) 6%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--ink) 6%,transparent) 1px,transparent 1px);background-size:56px 56px;mask-image:radial-gradient(60% 60% at 50% 40%,#000,transparent)}
.hero .wrap{display:grid;gap:48px;align-items:center}@media(min-width:960px){.hero{padding-bottom:140px}.hero .wrap{grid-template-columns:1.2fr .8fr;gap:56px}}
.pill{display:inline-flex;align-items:center;gap:10px;padding:8px 14px 8px 8px;border-radius:999px;font-size:14px;color:var(--ink)}.pill i{width:22px;height:22px;border-radius:50%;background:var(--a);display:grid;place-items:center;color:var(--oa)}
.hero h1{margin-top:24px;font:800 clamp(48px,8.2vw,112px)/.92 var(--fd);letter-spacing:-.032em;text-wrap:balance}
.hero h1 span{background:linear-gradient(100deg,var(--ink) 30%,color-mix(in srgb,var(--a) 80%,var(--ink)) 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero .sub{margin-top:26px;max-width:38ch;font-size:clamp(18px,1.6vw,21px);color:var(--mu)}
.ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:36px}.hero .scarce{margin-top:22px}
.btn-p{box-shadow:0 0 0 1px color-mix(in srgb,var(--ink) 15%,transparent) inset,0 12px 40px -8px color-mix(in srgb,var(--p) 80%,transparent)}
.btn-g{border-color:color-mix(in srgb,var(--ink) 18%,transparent);background:color-mix(in srgb,var(--ink) 5%,transparent)}
.card{position:relative;border-radius:28px;padding:28px;overflow:hidden}
.hcard{box-shadow:0 40px 80px -30px rgb(0 0 0/.7)}.hcard .top{display:flex;align-items:center;gap:14px}.hcard .top small{display:block;font-size:13px;color:var(--mu)}.hcard .top b{font:700 18px/1.2 var(--fd)}
.hcard .big{margin:28px 0 22px;display:grid;place-items:center;aspect-ratio:16/10;border-radius:20px;background:radial-gradient(60% 80% at 50% 40%,color-mix(in srgb,var(--p) 45%,transparent),transparent),color-mix(in srgb,var(--ink) 4%,transparent)}
.hcard .big.ph{position:relative;overflow:hidden;background:none;aspect-ratio:4/3}.hcard .big.ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hcard .big .mark{width:42%;height:auto;filter:drop-shadow(0 18px 30px rgb(0 0 0/.5))}
.hcard .row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}.hcard .price{gap:8px;min-width:0}.hcard .price b{font-size:40px}.hcard .price .was{white-space:nowrap;font-size:14px}.hcard .row .btn{flex:none}
.sec{padding:96px 0}@media(min-width:900px){.sec{padding:128px 0}}
.lbl{display:inline-flex;font:600 13px/1 var(--fb);letter-spacing:.12em;text-transform:uppercase;color:var(--a);margin-bottom:18px}
.h2{font:800 clamp(38px,5.6vw,72px)/.98 var(--fd);letter-spacing:-.04em;max-width:16ch;text-wrap:balance}
.lead{margin-top:18px;max-width:52ch;color:var(--mu);font-size:19px}
.stats{display:grid;gap:14px;margin-top:48px}@media(min-width:760px){.stats{grid-template-columns:repeat(var(--n),1fr)}}
.stat .v{font:800 clamp(56px,7vw,92px)/1 var(--fd);letter-spacing:-.04em;background:linear-gradient(180deg,var(--ink),color-mix(in srgb,var(--a) 70%,var(--ink)));-webkit-background-clip:text;background-clip:text;color:transparent}
.stat p{margin:14px 0 20px;color:var(--mu)}
.bento{display:grid;gap:14px;margin-top:48px}@media(min-width:900px){.bento{grid-template-columns:repeat(6,1fr)}.bento .card:nth-child(1){grid-column:span 4}.bento .card:nth-child(2){grid-column:span 2}.bento .card:nth-child(3){grid-column:span 6}}
.bento .card{min-height:220px;display:flex;flex-direction:column;justify-content:space-between;gap:36px}
.bento .n{font:800 15px/1 var(--fd);color:var(--mu)}.bento h3{font:700 clamp(24px,2.6vw,32px)/1.08 var(--fd);letter-spacing:-.02em}.bento p{color:var(--mu);margin-top:10px;max-width:46ch}
.chip{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(135deg,var(--p),color-mix(in srgb,var(--a) 60%,var(--p)));color:var(--op);box-shadow:0 10px 30px -10px var(--p)}
.bento .card:nth-child(1)::after{content:"";position:absolute;right:-60px;top:-60px;width:240px;height:240px;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--p) 45%,transparent),transparent)}
.grid3{display:grid;gap:14px;margin-top:48px}@media(min-width:700px){.grid3{grid-template-columns:repeat(2,1fr)}}@media(min-width:1000px){.grid3{grid-template-columns:repeat(3,1fr)}}
.grid3 .card h3{margin-top:28px;font:700 22px/1.15 var(--fd)}.grid3 .card p{margin-top:8px;color:var(--mu)}
.offer{display:grid;gap:0;margin-top:48px;border-radius:32px;padding:1px;background:linear-gradient(135deg,color-mix(in srgb,var(--a) 80%,transparent),color-mix(in srgb,var(--ink) 8%,transparent) 40%,color-mix(in srgb,var(--p) 80%,transparent))}
.offer>div{display:grid;gap:36px;border-radius:31px;background:var(--bg);padding:32px 24px}@media(min-width:900px){.offer>div{grid-template-columns:1.1fr .9fr;padding:56px;gap:56px}}
.offer h3{font:800 clamp(30px,3.6vw,44px)/1.02 var(--fd);letter-spacing:-.03em}
.ticks{list-style:none;padding:0;margin:26px 0 0;display:grid;gap:14px}.ticks li{display:flex;gap:12px}.ticks svg{flex:none;margin-top:3px;color:var(--a)}
.note{margin-top:22px;font-size:14px;color:var(--mu)}.offer .side{display:flex;flex-direction:column;gap:18px;justify-content:center}.offer .btn{width:100%}
.about .big{font:700 clamp(28px,3.4vw,44px)/1.15 var(--fd);letter-spacing:-.025em;max-width:30ch}.about .big::first-letter{color:var(--a)}
.local .card{display:grid;gap:24px;margin-top:40px}@media(min-width:900px){.local .card{grid-template-columns:1.3fr 1fr;align-items:center;padding:48px}}
.facts{display:grid;gap:10px}.fact{display:flex;gap:12px;align-items:center;padding:16px 18px;border-radius:16px;background:color-mix(in srgb,var(--ink) 5%,transparent)}.fact svg{color:var(--a)}
.faq{display:grid;gap:36px}@media(min-width:900px){.faq{grid-template-columns:.8fr 1.2fr;gap:72px}}
.faq details{border-color:color-mix(in srgb,var(--ink) 12%,transparent)}
.final .card{text-align:center;padding:72px 24px;background:radial-gradient(70% 90% at 50% 0%,color-mix(in srgb,var(--p) 55%,transparent),transparent 70%),color-mix(in srgb,var(--sf) 80%,transparent);border:1px solid color-mix(in srgb,var(--ink) 10%,transparent)}
.final .h2{margin-inline:auto;font-size:clamp(42px,6.6vw,88px)}.final .lead{margin-inline:auto}.final .ctas{justify-content:center}.final .wl{margin:24px auto 0}
.wl input[type=email]{background:color-mix(in srgb,var(--ink) 6%,transparent);border-color:color-mix(in srgb,var(--ink) 14%,transparent)}.wl button{background:var(--ink);color:var(--bg)}
footer{padding:32px 0 48px;font-size:14px;color:var(--mu)}footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;align-items:center}
.bar-in{background:color-mix(in srgb,var(--sf) 75%,transparent)}
svg.mark{background:#F7F5F0;border-radius:24%;box-shadow:0 0 0 1px rgb(255 255 255/.12)}.big svg.mark{padding:26px}
.btn-p{background:var(--ink);color:var(--bg)}
`;

function section(c: RenderCtx, s: Section): string {
  switch (s.kind) {
    case "proof-stats":
      return `<section class="sec"><div class="wrap"><p class="lbl">${esc(s.title)}</p><div class="stats" style="--n:${s.stats.length}">${s.stats
        .map((st) => `<div class="card glass stat rv"><div class="v">${esc(st.value)}</div><p>${esc(st.label)}</p>${sourceLink(c, st.sourceUrl, st.source)}</div>`)
        .join("")}</div></div></section>`;
    case "how-it-works-for-customer":
      return `<section class="sec" id="how"><div class="wrap"><p class="lbl">${esc(c.ui.howItWorks)}</p><h2 class="h2 rv">${esc(s.title)}</h2><div class="bento">${s.steps
        .map((st, i) => `<div class="card glass rv"><div style="display:flex;justify-content:space-between;align-items:flex-start"><span class="chip">${icon(st.icon, 24)}</span><span class="n">0${i + 1}</span></div><div><h3>${esc(st.title)}</h3><p>${esc(st.body)}</p></div></div>`)
        .join("")}</div></div></section>`;
    case "menu":
      return `<section class="sec" id="menu"><div class="wrap"><p class="lbl">${esc(s.title)}</p><h2 class="h2 rv">${esc(s.intro || s.title)}</h2>${menuList(c, s)}</div></section>`;
    case "menu-or-services":
      return `<section class="sec"><div class="wrap"><p class="lbl">${esc(s.title)}</p><h2 class="h2 rv">${esc(s.intro || s.title)}</h2><div class="grid3">${s.items
        .map((it) => `<div class="card glass rv"><span class="chip">${icon(it.icon, 24)}</span><h3>${esc(it.title)}</h3><p>${esc(it.body)}</p></div>`)
        .join("")}</div></div></section>`;
    case "offer":
      return `<section class="sec" id="offer"><div class="wrap"><p class="lbl">${esc(c.ui.offer)}</p><h2 class="h2 rv">${esc(s.title)}</h2><div class="offer rv"><div><div><h3>${esc(s.item)}</h3><ul class="ticks">${s.bullets
        .map((b) => `<li>${icon("check", 18, 2.2)}<span>${esc(b)}</span></li>`)
        .join("")}</ul>${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}</div><div class="side">${priceLine(c)}${scarcity(c)}${reserveBtn(c, undefined, undefined, true)}${waitlist(c, "wl")}</div></div></div></div></section>`;
    case "about":
      return `<section class="sec about"><div class="wrap"><p class="lbl">${esc(s.title)}</p><p class="big rv">${esc(s.body)}</p></div></section>`;
    case "local":
      return `<section class="sec local"><div class="wrap"><div class="card glass rv"><div><p class="lbl">${esc(s.title)}</p><h2 class="h2" style="font-size:clamp(30px,3.6vw,48px)">${esc(s.body)}</h2></div><div class="facts">${
        s.area ? `<div class="fact">${icon("map-pin")}<span>${esc(s.area)}</span></div>` : ""
      }${s.hours ? `<div class="fact">${icon("clock")}<span>${esc(s.hours)}</span></div>` : ""}</div></div></div></section>`;
    case "faq":
      return `<section class="sec" id="faq"><div class="wrap faq"><div><p class="lbl">${esc(c.ui.faq)}</p><h2 class="h2">${esc(s.title)}</h2></div><div>${faqList(s.items)}</div></div></section>`;
  }
}

/** Splits the headline so its last 1-2 words carry the gradient. */
function splitHead(h: string): string {
  const w = h.split(" ");
  if (w.length < 3) return esc(h);
  const k = w.length > 5 ? 2 : 1;
  return `${esc(w.slice(0, -k).join(" "))} <span>${esc(w.slice(-k).join(" "))}</span>`;
}

export function body(c: RenderCtx): string {
  const s = c.spec;
  const offer = sectionOf(s, "offer");
  const how = sectionOf(s, "how-it-works-for-customer");
  const hero = c.photos?.[0];
  return `${exampleNotice(c)}<header class="nav"><div class="wrap glass"><a class="brand" href="#top">${mark(c, 32)}<span>${esc(c.brand.name)}</span></a><nav>${sectionOf(s, "menu") ? `<a href="#menu">${esc(sectionOf(s, "menu")!.title)}</a>` : ""}${how ? `<a href="#how">${esc(c.ui.howItWorks)}</a>` : ""}<a href="#offer">${esc(c.ui.offer)}</a><a href="#faq">${esc(c.ui.faq)}</a></nav>${reserveBtn(c, c.ui.reserve, "btn btn-p btn-sm")}</div></header>
<main id="top">
<section class="hero" data-hero><div class="wrap"><div><span class="pill glass"><i>${icon("spark", 14, 2.2)}</i>${esc(s.hero.eyebrow)}</span><h1>${splitHead(s.hero.headline)}</h1><p class="sub">${esc(s.hero.sub)}</p>
<div class="ctas">${reserveBtn(c, s.hero.cta)}<a class="btn btn-g" href="${how ? "#how" : "#offer"}">${esc(s.hero.secondary)}</a></div>${scarcity(c)}</div>
<div class="card glass hcard rv"><div class="top">${mark(c, 44)}<div><small>${esc(c.ui.offer)}</small><b>${esc(offer?.item ?? c.brand.name)}</b></div></div>${hero ? `<div class="big ph">${photoImg(hero, true)}</div>` : `<div class="big">${mark(c, 200)}</div>`}<div class="row">${priceLine(c)}${reserveBtn(c, c.ui.reserve, "btn btn-p btn-sm")}</div></div></div></section>
${s.sections.map((x, i) => (i === 1 ? photoBand(c) : "") + section(c, x)).join("\n")}${s.sections.length < 2 ? photoBand(c) : ""}
<section class="sec final"><div class="wrap"><div class="card rv"><h2 class="h2">${esc(s.finalCta.headline)}</h2>${s.finalCta.sub ? `<p class="lead">${esc(s.finalCta.sub)}</p>` : ""}<div class="ctas">${reserveBtn(c, s.finalCta.cta, undefined, true)}</div>${waitlist(c, "wl2")}</div></div></section>
</main>
<footer><div class="wrap"><span class="brand">${mark(c, 24)}<span>${esc(c.brand.name)}</span></span><span>${esc(s.footer.tagline)}</span>${credit(c)}${photoCreditLine(c)}</div></footer>
${chrome(c)}`;
}
