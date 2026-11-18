// WP1 Website template "warm": soft tinted page, rounded cards, a blob hero with stickers. Food, pets, kids, wellness.
import type { Section } from "../spec.js";
import { exampleNotice, menuList, chrome, credit, esc, faqList, icon, mark, photoBand, photoCreditLine, photoImg, priceLine, reserveBtn, scarcity, sectionOf, sourceLink, waitlist, type RenderCtx } from "./shared.js";

export const fonts = { display: "Fraunces", text: "DM Sans", href: "family=Fraunces:opsz,wght,SOFT@9..144,500..700,100&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700" };
export const mode = "soft" as const;

export const css = `
:root{--fd:"Fraunces",ui-serif,Georgia,serif;--fb:"DM Sans",ui-sans-serif,system-ui,sans-serif;--r:28px}
.nav .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;height:84px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font:600 24px/1 var(--fd);font-variation-settings:"SOFT" 100;letter-spacing:-.01em}
.nav nav{display:none;gap:8px}.nav nav a{text-decoration:none;padding:10px 16px;border-radius:999px;font-size:15px;font-weight:500}.nav nav a:hover{background:var(--sf)}@media(min-width:900px){.nav nav{display:flex}}
.hero{padding:16px 0 64px}.hero .wrap{display:grid;gap:40px;align-items:center}@media(min-width:900px){.hero{padding:32px 0 104px}.hero .wrap{grid-template-columns:1.05fr .95fr;gap:56px}}
.tag{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:999px;background:var(--sf);font-weight:600;font-size:14px;box-shadow:0 2px 0 var(--ln)}.tag svg{color:var(--p)}
.hero h1{margin-top:22px;font:600 clamp(46px,7.4vw,96px)/.98 var(--fd);font-variation-settings:"SOFT" 100;letter-spacing:-.03em;text-wrap:balance}
.hero .sub{margin-top:24px;max-width:36ch;font-size:clamp(18px,1.6vw,21px);color:var(--mu)}
.ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}.hero .scarce{margin-top:22px}
.btn-p{box-shadow:0 4px 0 color-mix(in srgb,var(--p) 60%,#000)}.btn-p:hover{transform:translateY(-2px);box-shadow:0 6px 0 color-mix(in srgb,var(--p) 60%,#000)}
.btn-g{background:var(--sf);border:0;box-shadow:0 4px 0 var(--ln)}
.art{position:relative;aspect-ratio:1;max-width:560px;width:100%;margin-inline:auto}
.art .blob{position:absolute;inset:4%;color:var(--tint)}.art .blob2{position:absolute;inset:14% 0 0 18%;color:color-mix(in srgb,var(--a) 35%,var(--bg));transform:rotate(30deg);opacity:.7}
.art .mark{position:absolute;left:50%;top:50%;width:40%;height:auto;transform:translate(-50%,-50%) rotate(-4deg);filter:drop-shadow(0 20px 30px rgb(0 0 0/.16))}
.art .wph{position:absolute;inset:6% 6% 8% 4%;overflow:hidden;border-radius:46% 54% 42% 58%/52% 44% 56% 48%;box-shadow:0 30px 60px -30px rgb(0 0 0/.4)}.art .wph img{width:100%;height:100%;object-fit:cover}
.stk{position:absolute;z-index:1;display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;background:var(--sf);font-weight:600;font-size:15px;box-shadow:0 10px 24px -10px rgb(0 0 0/.25);white-space:nowrap;max-width:70%;overflow:hidden;text-overflow:ellipsis}
.stk svg{color:var(--p)}.stk.s1{left:0;top:16%;transform:rotate(-6deg)}.stk.s2{right:0;top:44%;transform:rotate(5deg)}.stk.s3{left:8%;bottom:10%;transform:rotate(-3deg)}
.stk.pr{right:6%;bottom:2%;background:var(--p);color:var(--op);font:600 22px/1 var(--fd);padding:14px 20px;transform:rotate(-8deg)}
@media(max-width:520px){.stk{font-size:13px;padding:8px 12px}.stk.pr{font-size:18px}}
.wave{display:block;width:100%;height:40px;color:var(--sf)}
.band{background:var(--sf)}
.sec{padding:80px 0}@media(min-width:900px){.sec{padding:112px 0}}
.lbl{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:14px;color:var(--p);margin-bottom:14px}
.h2{font:600 clamp(36px,5vw,64px)/1.02 var(--fd);font-variation-settings:"SOFT" 100;letter-spacing:-.025em;max-width:18ch;text-wrap:balance}
.center{text-align:center}.center .h2{margin-inline:auto}
.stats{display:grid;gap:16px;margin-top:44px}@media(min-width:760px){.stats{grid-template-columns:repeat(var(--n),1fr)}}
.box{border-radius:var(--r);padding:28px;background:var(--sf)}.band .box{background:var(--bg)}
.stat .v{font:600 clamp(52px,6vw,80px)/1 var(--fd);font-variation-settings:"SOFT" 100;color:var(--p);letter-spacing:-.03em}.stat p{margin:12px 0 16px}
.steps{display:grid;gap:16px;margin-top:44px}@media(min-width:760px){.steps{grid-template-columns:repeat(3,1fr)}}
.step{position:relative;padding-top:36px}.step .n{position:absolute;top:-18px;left:24px;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:var(--a);color:var(--oa);font:600 22px/1 var(--fd);box-shadow:0 4px 0 color-mix(in srgb,var(--a) 60%,#000)}
.step h3,.card h3{margin:14px 0 8px;font:600 24px/1.15 var(--fd);font-variation-settings:"SOFT" 100}.step p,.card p{color:var(--mu)}
.step .ic,.card .ic{width:48px;height:48px;border-radius:16px;display:grid;place-items:center;background:var(--tint);color:var(--p)}
.cards{display:grid;gap:16px;margin-top:44px}@media(min-width:700px){.cards{grid-template-columns:repeat(2,1fr)}}@media(min-width:1000px){.cards{grid-template-columns:repeat(3,1fr)}}
.card:nth-child(3n+2){background:var(--tint)}.card:nth-child(3n+2) .ic{background:var(--sf)}
.intro{margin-top:14px;max-width:50ch;color:var(--mu);font-size:19px}.center .intro{margin-inline:auto}
.offer{margin-top:44px;border-radius:36px;background:var(--p);color:var(--op);padding:32px 24px;display:grid;gap:28px;position:relative;overflow:hidden}
@media(min-width:900px){.offer{grid-template-columns:1.2fr .8fr;padding:56px;gap:48px;align-items:center}}
.offer::after{content:"";position:absolute;right:-80px;top:-80px;width:280px;height:280px;border-radius:50%;background:color-mix(in srgb,var(--op) 10%,transparent)}
.offer h3{font:600 clamp(30px,3.6vw,46px)/1.05 var(--fd);font-variation-settings:"SOFT" 100;letter-spacing:-.02em}
.ticks{list-style:none;padding:0;margin:24px 0 0;display:grid;gap:12px}.ticks li{display:flex;gap:12px}.ticks svg{flex:none;margin-top:3px}
.note{margin-top:20px;font-size:14px;opacity:.85}
.pcard{position:relative;z-index:1;background:var(--sf);color:var(--ink);border-radius:28px;padding:28px;display:flex;flex-direction:column;gap:16px;box-shadow:0 20px 40px -20px rgb(0 0 0/.35)}.pcard .btn{width:100%}
.about .box{display:grid;gap:24px;align-items:center;padding:36px 28px}@media(min-width:900px){.about .box{grid-template-columns:auto 1fr;padding:56px;gap:48px}}
.about .big{font:500 clamp(24px,2.8vw,34px)/1.3 var(--fd);font-variation-settings:"SOFT" 100;max-width:34ch}
.local{display:grid;gap:16px;margin-top:40px}@media(min-width:900px){.local{grid-template-columns:1fr 1fr}}
.fact{display:flex;gap:14px;align-items:center;font-weight:600}.fact .ic{flex:none}
.faq{max-width:780px;margin:40px auto 0}.faq details{background:var(--sf);border:0;border-radius:20px;padding:0 22px;margin-bottom:10px}.band .faq details{background:var(--bg)}details p{padding-right:0}
.final{padding:24px 0 72px}.final .box{text-align:center;padding:64px 24px;background:var(--tint);position:relative;overflow:hidden}
.final .h2{margin-inline:auto}.final .intro{margin-inline:auto}.final .ctas{justify-content:center}.final .wl{margin:24px auto 0}
footer{padding:24px 0 48px;font-size:14px;color:var(--mu)}footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;align-items:center}
`;

const BLOB = `<svg viewBox="0 0 200 200" fill="currentColor" aria-hidden="true"><path d="M44.6-61.9C57.5-52.2 67.1-38.4 72.4-22.9 77.7-7.4 78.6 9.8 72.9 24.6 67.2 39.4 54.9 51.8 40.6 60.6 26.3 69.4 10 74.6-6.9 75.7-23.8 76.8-41.3 73.8-53.5 63.8-65.7 53.8-72.6 36.9-75.4 19.9-78.2 2.9-76.9-14.2-70-28.4-63.1-42.6-50.6-53.9-36.9-63.3-23.2-72.7-8.4-80.2 4.3-86.1 17-92 31.7-71.6 44.6-61.9Z" transform="translate(100 100)"/></svg>`;
const WAVE = (flip = false) =>
  `<svg class="wave" viewBox="0 0 1440 40" preserveAspectRatio="none" aria-hidden="true"${flip ? ' style="transform:scaleY(-1)"' : ""}><path fill="currentColor" d="M0 40V22C120 8 240 2 360 8s240 26 360 26 240-24 360-28 240 10 360 18v-6 0V40z"/></svg>`;

function section(c: RenderCtx, s: Section, banded: boolean): string {
  const open = (id = "", extra = "") => (banded ? `${WAVE()}<section class="sec band${extra}"${id ? ` id="${id}"` : ""}>` : `<section class="sec${extra}"${id ? ` id="${id}"` : ""}>`);
  const close = banded ? `</section>${WAVE(true)}` : `</section>`;
  switch (s.kind) {
    case "proof-stats":
      return `${open()}<div class="wrap center"><p class="lbl">${icon("chart", 18)}${esc(s.title)}</p><div class="stats" style="--n:${s.stats.length}">${s.stats
        .map((st) => `<div class="box stat rv"><div class="v">${esc(st.value)}</div><p>${esc(st.label)}</p>${sourceLink(c, st.sourceUrl, st.source)}</div>`)
        .join("")}</div></div>${close}`;
    case "how-it-works-for-customer":
      return `${open("how")}<div class="wrap center"><p class="lbl">${icon("spark", 18)}${esc(c.ui.howItWorks)}</p><h2 class="h2 rv">${esc(s.title)}</h2><div class="steps" style="text-align:left;margin-top:64px">${s.steps
        .map((st, i) => `<div class="box step rv"><span class="n">${i + 1}</span><span class="ic">${icon(st.icon)}</span><h3>${esc(st.title)}</h3><p>${esc(st.body)}</p></div>`)
        .join("")}</div></div>${close}`;
    case "menu":
      return `${open("menu")}<div class="wrap"><div class="center"><p class="lbl">${icon("heart", 18)}${esc(s.title)}</p><h2 class="h2 rv">${esc(s.intro || s.title)}</h2></div>${menuList(c, s)}</div>${close}`;
    case "menu-or-services":
      return `${open()}<div class="wrap center"><p class="lbl">${icon("heart", 18)}${esc(s.title)}</p><h2 class="h2 rv">${esc(s.intro || s.title)}</h2><div class="cards" style="text-align:left">${s.items
        .map((it) => `<div class="box card rv"><span class="ic">${icon(it.icon)}</span><h3>${esc(it.title)}</h3><p>${esc(it.body)}</p></div>`)
        .join("")}</div></div>${close}`;
    case "offer":
      return `${open("offer")}<div class="wrap"><div class="center"><p class="lbl">${icon("gift", 18)}${esc(c.ui.offer)}</p><h2 class="h2 rv">${esc(s.title)}</h2></div><div class="offer rv"><div><h3>${esc(s.item)}</h3><ul class="ticks">${s.bullets
        .map((b) => `<li>${icon("check", 18, 2.2)}<span>${esc(b)}</span></li>`)
        .join("")}</ul>${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}</div><div class="pcard">${priceLine(c)}${scarcity(c)}${reserveBtn(c, undefined, undefined, true)}${waitlist(c, "wl")}</div></div></div>${close}`;
    case "about":
      return `${open("", " about")}<div class="wrap"><div class="box rv">${mark(c, 120)}<div><p class="lbl">${esc(s.title)}</p><p class="big">${esc(s.body)}</p></div></div></div>${close}`;
    case "local":
      return `${open()}<div class="wrap"><div class="center"><p class="lbl">${icon("map-pin", 18)}${esc(s.title)}</p><h2 class="h2 rv">${esc(s.body)}</h2></div><div class="local">${
        s.area ? `<div class="box fact rv"><span class="ic">${icon("map-pin")}</span><span>${esc(s.area)}</span></div>` : ""
      }${s.hours ? `<div class="box fact rv"><span class="ic">${icon("clock")}</span><span>${esc(s.hours)}</span></div>` : ""}</div></div>${close}`;
    case "faq":
      return `${open("faq")}<div class="wrap"><div class="center"><p class="lbl">${icon("chat", 18)}${esc(c.ui.faq)}</p><h2 class="h2">${esc(s.title)}</h2></div><div class="faq">${faqList(s.items)}</div></div>${close}`;
  }
}

export function body(c: RenderCtx): string {
  const s = c.spec;
  const how = sectionOf(s, "how-it-works-for-customer");
  const hero = c.photos?.[0];
  const stickers = (how?.steps ?? sectionOf(s, "menu-or-services")?.items ?? []).slice(0, 3);
  return `${exampleNotice(c)}<header class="nav"><div class="wrap"><a class="brand" href="#top">${mark(c, 38)}<span>${esc(c.brand.name)}</span></a><nav>${sectionOf(s, "menu") ? `<a href="#menu">${esc(sectionOf(s, "menu")!.title)}</a>` : ""}${how ? `<a href="#how">${esc(c.ui.howItWorks)}</a>` : ""}<a href="#offer">${esc(c.ui.offer)}</a><a href="#faq">${esc(c.ui.faq)}</a></nav>${reserveBtn(c, c.ui.reserve, "btn btn-p btn-sm")}</div></header>
<main id="top">
<section class="hero" data-hero><div class="wrap"><div><span class="tag">${icon("map-pin", 16)}${esc(s.hero.eyebrow)}</span><h1>${esc(s.hero.headline)}</h1><p class="sub">${esc(s.hero.sub)}</p>
<div class="ctas">${reserveBtn(c, s.hero.cta)}<a class="btn btn-g" href="${how ? "#how" : "#offer"}">${esc(s.hero.secondary)}</a></div>${scarcity(c)}</div>
<div class="art rv${hero ? " has-ph" : ""}"><span class="blob2">${BLOB}</span>${hero ? `<span class="wph">${photoImg(hero, true)}</span>` : `<span class="blob">${BLOB}</span>${mark(c, 220)}`}${stickers.map((st, i) => `<span class="stk s${i + 1}">${icon(st.icon, 18)}${esc(st.title)}</span>`).join("")}${c.price ? `<span class="stk pr">${esc(c.price)}</span>` : ""}</div></div></section>
${s.sections.map((x, i) => (i === 1 ? photoBand(c) : "") + section(c, x, i % 2 === 0)).join("\n")}${s.sections.length < 2 ? photoBand(c) : ""}
<section class="final"><div class="wrap"><div class="box rv"><h2 class="h2">${esc(s.finalCta.headline)}</h2>${s.finalCta.sub ? `<p class="intro">${esc(s.finalCta.sub)}</p>` : ""}<div class="ctas">${reserveBtn(c, s.finalCta.cta, undefined, true)}</div>${waitlist(c, "wl2")}</div></div></section>
</main>
<footer><div class="wrap"><span class="brand">${mark(c, 28)}<span>${esc(c.brand.name)}</span></span><span>${esc(s.footer.tagline)}</span>${credit(c)}${photoCreditLine(c)}</div></footer>
${chrome(c)}`;
}
