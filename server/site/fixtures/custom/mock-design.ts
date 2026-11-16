// Mock bespoke design (MOCK_AI=1): the gold Fern & Co layout (.notes/site2/gold/fern.html) rebuilt from THIS
// business's own brief and validated copy, so a zero-cost demo still shows a studio-grade page with only real facts.
// Output follows the same contract as the model (data-ld hooks, ld-photo ids) and goes through the same gate.
import type { KitInput } from "../../../kit-contract.js";
import type { Section, SiteSpec } from "../../spec.js";
import { esc } from "../../templates/shared.js";
import { ensureContrast, hex6, luminance, mix, money, onColor } from "../../validate.js";
import { fontStack, photoKey, type CustomPhoto } from "../../custom-render.js";

const L = {
  en: { price: "Price", where: "Where", included: "What's included", why: "Why it matters", compare: "What changes with {name}", back: "Back to top", notReady: "Not ready? Join the list", from: "From the first visit", included2: "Included" },
  es: { price: "Precio", where: "Dónde", included: "Qué incluye", why: "Por qué importa", compare: "Qué cambia con {name}", back: "Volver arriba", notReady: "¿Aún no? Apúntate a la lista", from: "Desde el primer día", included2: "Incluido" },
};

const sec = <K extends Section["kind"]>(s: SiteSpec, k: K) => s.sections.find((x) => x.kind === k) as Extract<Section, { kind: K }> | undefined;

/** "Houseplants that stay alive" → "Houseplants that <em>stay alive</em>" */
function emLast(text: string, n = 2): string {
  const w = text.trim().split(/\s+/);
  if (w.length < 3) return esc(text);
  const k = Math.min(n, w.length - 1);
  return `${esc(w.slice(0, -k).join(" "))} <em>${esc(w.slice(-k).join(" "))}</em>`;
}
const host = (u: string) => {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
};
const img = (key: string, p: CustomPhoto, alt?: string) => `<img src="ld-photo:${key}" alt="${esc(alt ?? p.alt)}" width="${p.width}" height="${p.height}">`;

export function mockDesign(input: KitInput, spec: SiteSpec, photos: CustomPhoto[]): string {
  const b = input.brand;
  const lang = spec.lang.toLowerCase().startsWith("es") ? "es" : "en";
  const T = L[lang];
  const ui = spec.ui;
  const r = spec.reserve;
  const cur = r.currency || b.currency || "$";
  const price = r.price > 0 ? money(r.price, cur, spec.lang) : "";
  const normal = r.normal ? money(r.normal, cur, spec.lang) : "";
  const reserve = Boolean(r.address) && r.price > 0;
  const offer = sec(spec, "offer");
  const how = sec(spec, "how-it-works-for-customer");
  const menu = sec(spec, "menu-or-services");
  const stats = sec(spec, "proof-stats")?.stats.filter((s) => s.sourceUrl) ?? [];
  const faq = sec(spec, "faq");
  const comps = input.report.competitors.slice(0, 2);
  const city = b.city ?? "";

  // ── palette (brand hues only; shades by lightness)
  const p = hex6(b.palette.primary, "#2e5a3a");
  const a = hex6(b.palette.accent, "#d98b5f");
  let bg = hex6(b.palette.bg, "#f5f1ea");
  let ink = hex6(b.palette.ink, "#1c241e");
  if (luminance(ink) > luminance(bg)) [ink, bg] = [bg, ink];
  if (luminance(bg) < 0.7) bg = mix(bg, "#ffffff", 0.8);
  ink = ensureContrast(ink, bg, 12);
  const band = luminance(p) > 0.3 ? ensureContrast(p, "#ffffff", 7) : p; // the hero slab must carry light text
  const onBand = onColor(band);
  const v = {
    p: band, pd: mix(band, "#000000", 0.25), a, aInk: ensureContrast(a, bg, 4.6), aOn: ensureContrast(a, band, 3.2), aHover: mix(a, "#ffffff", 0.15),
    bg, bg2: mix(bg, ink, 0.06), ink, ink2: ensureContrast(mix(ink, bg, 0.3), bg, 5), line: mix(ink, bg, 0.82),
    cream: onBand, sage: ensureContrast(mix(onBand, band, 0.22), band, 5), sage2: ensureContrast(mix(onBand, band, 0.35), band, 4.5),
    mute: ensureContrast(mix(bg, ink, 0.42), ink, 4.6), onA: onColor(a), bandBtnInk: onColor(onBand),
    dark: luminance(ink) < 0.06 ? ink : "#16181d",
  };
  const fd = fontStack(b.fonts.display);
  const ft = fontStack(b.fonts.text);

  // ── photos: hero first, then the rest in order
  const keyed = photos.slice(0, 8).map((ph, i) => ({ key: photoKey(i), ph }));
  const heroIdx = Math.max(0, keyed.findIndex((k) => k.ph.role === "hero"));
  const hero = keyed[heroIdx];
  const rest = keyed.filter((_, i) => i !== heroIdx);
  const offerPhoto = rest.shift();
  const howPhoto = rest.length && how ? rest.pop() : undefined;
  const trioItems = menu?.items.slice(0, 3) ?? [];
  // Photos in the grid only when every card gets one (uneven cards look broken).
  const withPhotos = rest.length >= trioItems.length;
  const trio = trioItems.map((it, i) => ({ it, ph: withPhotos ? rest[i] : undefined }));

  const reserveBtn = (label: string, cls = "btn btn-a") => (reserve ? `<a class="${cls}" href="#reserve" data-ld="reserve">${esc(label)}</a>` : "");
  const reserveFor = price ? ui.reserveFor.replace("{price}", price) : ui.reserve;
  const priceLine = price ? `<span class="price">${esc(price)}</span>${normal ? `<span class="was">${esc(ui.normally.replace("{price}", "")).trim()} <s>${esc(normal)}</s></span>` : ""}` : "";
  const nameMark = (() => {
    const w = b.name.split(/(\s*&\s*|\s+)/);
    return w.length > 1 && /&/.test(b.name) ? esc(b.name).replace("&amp;", "<span>&amp;</span>") : esc(b.name);
  })();
  const kicker = spec.hero.eyebrow || [ui.offer, city].filter(Boolean).join(" · ");

  const css = `<style>
/* Concept: the founder's own offer as a label hung on a big photo; one dark band; brand colours only. */
:root{--p:${v.p};--pd:${v.pd};--a:${v.a};--a-ink:${v.aInk};--a-on:${v.aOn};--a-h:${v.aHover};--bg:${v.bg};--bg2:${v.bg2};--ink:${v.ink};--ink2:${v.ink2};--line:${v.line};--cream:${v.cream};--sage:${v.sage};--sage2:${v.sage2};--mute:${v.mute};--dark:${v.dark};
--fd:${fd};--ft:${ft};--wrap:1200px;--gut:max(20px,env(safe-area-inset-left,0px));--sec:clamp(72px,10vw,136px);color-scheme:light}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:400 1.0625rem/1.6 var(--ft);-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%;height:auto}
figure{margin:0}
a{color:inherit}
a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--a);outline-offset:3px}
.wrap{max-width:var(--wrap);margin:0 auto;padding-left:var(--gut);padding-right:max(20px,env(safe-area-inset-right,0px))}
h1,h2,h3{font-family:var(--fd);font-weight:400;line-height:1.02;letter-spacing:-.02em;margin:0;text-wrap:balance}
h2{font-size:clamp(2.25rem,4.6vw,3.75rem)}
h3{font-size:1.5rem;line-height:1.15;letter-spacing:-.01em}
p{margin:0}
.kicker{font:600 .75rem/1.3 var(--ft);letter-spacing:.14em;text-transform:uppercase;color:var(--a-ink)}
.lede{font-size:clamp(1.125rem,1.6vw,1.3rem);line-height:1.55;max-width:38ch;color:var(--ink2)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.6em;min-height:52px;padding:0 1.6rem;border-radius:999px;font:600 1rem/1 var(--ft);text-decoration:none;border:1.5px solid transparent;transition:transform .2s ease,background-color .2s ease}
.btn:hover{transform:translateY(-1px)}
.btn-a{background:var(--a);color:${v.onA}}
.btn-a:hover{background:var(--a-h)}
.btn-line{border-color:currentColor;color:inherit}
.btn-p{background:var(--p);color:var(--cream)}
.btn-p:hover{background:var(--pd)}
.top{position:absolute;inset:0 0 auto;z-index:2;color:var(--cream)}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-block:22px}
.mark{font:500 1.5rem/1 var(--fd);letter-spacing:-.02em;text-decoration:none;min-width:0}
.mark span{font-style:italic;color:var(--a-on)}
.top nav{display:flex;align-items:center;gap:22px;font-size:.92rem;padding:5px 5px 5px 22px;border-radius:999px;background:rgba(0,0,0,.42);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.top nav a:not(.btn){text-decoration:none;opacity:.88}
.top nav a:not(.btn):hover{opacity:1;text-decoration:underline;text-underline-offset:4px}
.top .btn{min-height:42px;padding:0 1.15rem;font-size:.9rem}
.hero{background:var(--p);color:var(--cream);position:relative;overflow:hidden}
.hero-grid{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,1fr);align-items:stretch;min-height:min(820px,100svh)}
.hero-copy{display:flex;flex-direction:column;justify-content:center;gap:28px;padding:140px 56px 88px max(20px,calc((100% - var(--wrap))/2 + 20px));min-width:0}
.hero.solo .hero-grid{grid-template-columns:minmax(0,1fr)}
.hero.solo .hero-copy{padding-right:max(20px,calc((100% - var(--wrap))/2 + 20px))}
.hero .kicker{color:var(--a-on)}
.hero h1{font-size:clamp(3.1rem,7.2vw,6.5rem);line-height:.95;letter-spacing:-.035em;font-weight:350}
.hero h1 em{font-weight:300;color:var(--a-on)}
.hero .lede{color:var(--sage)}
.offer-line{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 14px;padding-top:22px;border-top:1px solid rgba(255,255,255,.22);max-width:480px}
.price{font:400 3rem/1 var(--fd);letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.was{font-size:1rem;color:var(--sage2)}
.offer-line p{flex-basis:100%;font-size:.95rem;color:var(--sage)}
.cta-row{display:flex;flex-wrap:wrap;gap:12px}
.hero-photo{position:relative;min-height:420px}
.hero-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 40%}
.tag{position:absolute;left:-28px;bottom:56px;width:236px;background:var(--bg);color:var(--ink);padding:22px 20px 18px;border-radius:118px 118px 6px 6px;box-shadow:0 18px 40px rgba(0,0,0,.28);text-align:center}
.tag::before{content:"";display:block;width:12px;height:12px;margin:0 auto 14px;border-radius:50%;background:var(--p)}
.tag b{display:block;font:italic 400 1.2rem/1.15 var(--fd);margin-bottom:10px}
.tag dl{margin:0;display:grid;gap:6px;font-size:.8rem;text-align:left;border-top:1px dashed var(--line);padding-top:10px}
.tag dl div{display:flex;justify-content:space-between;gap:10px}
.tag dt{font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-size:.68rem;color:var(--a-ink)}
.tag dd{margin:0;text-align:right;min-width:0}
.problem{padding-block:var(--sec)}
.problem-grid{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(40px,6vw,96px);align-items:end}
.problem-grid.one{grid-template-columns:minmax(0,1fr);max-width:900px}
.stat{font:300 clamp(4.5rem,12vw,10.5rem)/.86 var(--fd);letter-spacing:-.05em;color:var(--p);overflow-wrap:anywhere}
.stat-label{margin-top:22px;font-size:1.15rem;max-width:26ch}
.src{display:inline-block;margin-top:14px;font-size:.82rem;color:var(--ink2);text-underline-offset:3px}
.problem h2{margin:16px 0 24px}
.problem .lede{max-width:46ch}
.offer{padding-block:0 var(--sec)}
.offer-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(32px,5vw,80px);align-items:center}
.offer-grid.one{grid-template-columns:minmax(0,1fr);max-width:760px}
.offer-photo img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:4px}
.offer-copy{display:grid;gap:24px;min-width:0}
.box{list-style:none;margin:8px 0 0;padding:0;border-top:1px solid var(--line)}
.box li{display:grid;grid-template-columns:2.4rem minmax(0,1fr);gap:16px;padding:18px 0;border-bottom:1px solid var(--line)}
.box li::before{content:"";width:10px;height:10px;margin-top:.55em;border-radius:50%;background:var(--a)}
.buy{display:flex;align-items:center;flex-wrap:wrap;gap:16px 24px}
.buy .price{color:var(--p)}
.buy .was{color:var(--ink2)}
.note{font-size:.9rem;color:var(--ink2)}
.kinds{background:var(--bg2);padding-block:var(--sec)}
.kinds-head{display:flex;justify-content:space-between;align-items:end;gap:24px;flex-wrap:wrap;margin-bottom:48px}
.kinds-head p{max-width:40ch;color:var(--ink2)}
.trio{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.kind{display:grid;gap:16px;align-content:start;min-width:0}
.kind img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:4px}
.kind p{color:var(--ink2)}
.how{padding-block:var(--sec)}
.how-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(40px,6vw,96px);align-items:start}
.how-grid.one{grid-template-columns:minmax(0,1fr);max-width:820px}
.how-photo{position:sticky;top:24px}
.how-photo img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4px}
.how h2{margin-top:16px}
.steps{list-style:none;margin:40px 0 0;padding:0;counter-reset:s}
.steps li{counter-increment:s;display:grid;grid-template-columns:4rem minmax(0,1fr);gap:8px 20px;padding:28px 0;border-top:1px solid var(--line)}
.steps li::before{content:counter(s);font:italic 300 2.6rem/1 var(--fd);color:var(--a-ink)}
.steps h3{margin-bottom:6px}
.steps p{color:var(--ink2)}
.compare{background:var(--dark);color:#f6f4ef;padding-block:var(--sec)}
.compare h2{max-width:18ch;margin-bottom:48px}
.compare h2 em{color:var(--a)}
.cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);border-top:1px solid rgba(255,255,255,.2)}
.cols>div{padding:32px 32px 8px 0;min-width:0}
.cols>div+div{padding-left:32px;border-left:1px solid rgba(255,255,255,.2)}
.cols h3{margin-bottom:20px}
.cols ul{list-style:none;margin:0;padding:0;display:grid;gap:14px}
.cols li{display:flex;gap:12px;align-items:baseline}
.cols li::before{content:"";flex:none;width:8px;height:8px;border-radius:50%;transform:translateY(-2px)}
.them{color:var(--mute)}
.them li::before{border:1.5px solid var(--mute)}
.us li::before{background:var(--a)}
.faq{padding-block:var(--sec)}
.faq-grid{display:grid;grid-template-columns:minmax(0,4fr) minmax(0,8fr);gap:clamp(32px,6vw,96px)}
.faq details{border-bottom:1px solid var(--line)}
.faq details:first-child{border-top:1px solid var(--line)}
.faq summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:20px;padding:22px 0;font-weight:600;font-size:1.1rem}
.faq summary::after{content:"+";font:300 1.6rem/1 var(--fd);color:var(--a-ink)}
.faq details[open] summary::after{content:"–"}
.faq details p{padding:0 40px 22px 0;color:var(--ink2)}
.join{padding-block:0 var(--sec)}
.join.first{padding-top:var(--sec)}
.join-card{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);background:var(--p);color:var(--cream);border-radius:6px;overflow:hidden}
.join h2{font-size:clamp(2.4rem,5.2vw,4.25rem)}
.join h2 em{color:var(--a-on)}
.join-copy{padding:clamp(32px,5vw,64px);display:grid;gap:20px;align-content:center;min-width:0}
.join-copy+.join-copy{border-left:1px solid rgba(255,255,255,.18)}
.join-copy p{color:var(--sage);max-width:42ch}
.join form{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}
.join label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.join input{flex:1 1 220px;min-width:0;min-height:52px;padding:0 20px;border-radius:999px;border:1.5px solid rgba(255,255,255,.4);background:transparent;color:var(--cream);font:inherit}
.join input::placeholder{color:var(--sage2)}
.join button{min-height:52px;padding:0 1.5rem;border-radius:999px;border:0;background:var(--cream);color:${v.bandBtnInk};font:600 1rem/1 var(--ft);cursor:pointer}
.small{font-size:.82rem;color:var(--sage2)}
footer{border-top:1px solid var(--line);padding-block:40px;font-size:.9rem;color:var(--ink2)}
footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px}
@media (max-width:900px){
.hero-grid{grid-template-columns:1fr;min-height:0}
.hero-copy{padding:40px var(--gut) 56px}
.hero.solo .hero-copy{padding:120px var(--gut) 64px}
.hero-photo{order:-1;min-height:0;aspect-ratio:5/4;max-height:640px}
.hero-photo::after{content:"";position:absolute;inset:0 0 auto;height:110px;background:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,0))}
.tag{left:auto;right:16px;bottom:16px;width:200px;padding:18px 16px 14px}
.problem-grid,.offer-grid,.how-grid,.join-card,.faq-grid{grid-template-columns:1fr}
.offer-grid .offer-photo{order:2}
.offer-photo img{aspect-ratio:4/3}
.how-photo{position:static}
.trio{grid-template-columns:1fr 1fr}
.trio .kind:nth-child(3){grid-column:1/-1}
.trio .kind:nth-child(3) img{aspect-ratio:16/9}
.steps li{grid-template-columns:2.75rem minmax(0,1fr)}
.join-copy+.join-copy{border-left:0;padding-top:0}
}
@media (max-width:560px){
.top nav a:not(.btn){display:none}
.top nav{background:none;padding:0;-webkit-backdrop-filter:none;backdrop-filter:none}
.trio{grid-template-columns:1fr}
.trio .kind:nth-child(3) img,.kind img{aspect-ratio:4/3}
.cols{grid-template-columns:1fr}
.cols>div{padding:28px 0 8px}
.cols>div+div{padding-left:0;border-left:0;border-top:1px solid rgba(255,255,255,.2);margin-top:24px}
.btn{width:100%}
.top .btn{width:auto}
.tag{display:none}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>`;

  const nav = [offer ? `<a href="#offer">${esc(ui.offer)}</a>` : "", how ? `<a href="#how">${esc(ui.howItWorks)}</a>` : "", reserveBtn(ui.reserve, "btn btn-a")].join("");
  const header = `<header class="top"><div class="wrap"><a class="mark" href="#top">${nameMark}</a><nav aria-label="Main">${nav || `<a href="#join">${esc(ui.joinList)}</a>`}</nav></div></header>`;

  const tagRows = [price ? [T.price, price] : null, city ? [T.where, city] : null].filter(Boolean) as string[][];
  const heroSec = `<section class="hero${hero ? "" : " solo"}"><div class="hero-grid"><div class="hero-copy">
<p class="kicker">${esc(kicker)}</p>
<h1>${emLast(b.tagline || spec.hero.headline)}</h1>
<p class="lede">${esc(spec.hero.sub)}</p>
${price || offer ? `<div class="offer-line">${priceLine}${offer ? `<p>${esc(offer.item)}</p>` : ""}</div>` : ""}
<div class="cta-row">${reserveBtn(reserveFor)}<a class="btn btn-line" href="#join">${esc(spec.hero.secondary || T.notReady)}</a></div>
</div>${hero ? `<figure class="hero-photo">${img(hero.key, hero.ph)}${offer ? `<div class="tag" aria-hidden="true"><b>${esc(offer.item)}</b>${tagRows.length ? `<dl>${tagRows.map(([k, x]) => `<div><dt>${esc(k)}</dt><dd>${esc(x)}</dd></div>`).join("")}</dl>` : ""}</div>` : ""}</figure>` : ""}</div></section>`;

  const st = stats[0];
  const problem = input.report.pain || st
    ? `<section class="problem"><div class="wrap problem-grid${st ? "" : " one"}">${st ? `<div><p class="stat">${esc(st.value)}</p><p class="stat-label">${esc(st.label)}</p><a class="src" href="${esc(st.sourceUrl)}" rel="noopener nofollow" target="_blank">${esc(ui.source)}: ${esc(st.source || host(st.sourceUrl))}</a></div>` : ""}<div><p class="kicker">${esc(T.why)}</p><h2>${emLast(sec(spec, "proof-stats")?.title || sec(spec, "about")?.title || spec.finalCta.headline)}</h2><p class="lede">${esc(input.report.pain)}</p></div></div></section>`
    : "";

  const offerSec = offer
    ? `<section class="offer" id="offer"><div class="wrap offer-grid${offerPhoto ? "" : " one"}">${offerPhoto ? `<figure class="offer-photo">${img(offerPhoto.key, offerPhoto.ph)}</figure>` : ""}<div class="offer-copy"><p class="kicker">${esc(ui.offer)}</p><h2>${emLast(offer.item, 1)}</h2>${offer.title ? `<p class="lede">${esc(offer.title)}</p>` : ""}${offer.bullets.length ? `<ul class="box">${offer.bullets.slice(0, 5).map((x) => `<li><span>${esc(x)}</span></li>`).join("")}</ul>` : ""}<div class="buy">${priceLine}${reserveBtn(reserveFor, "btn btn-p")}</div>${offer.note ? `<p class="note">${esc(offer.note)}</p>` : ""}</div></div></section>`
    : "";

  const kinds = trio.length >= 2
    ? `<section class="kinds"><div class="wrap"><div class="kinds-head"><h2>${emLast(menu!.title, 1)}</h2>${menu!.intro ? `<p>${esc(menu!.intro)}</p>` : ""}</div><div class="trio">${trio.map(({ it, ph }) => `<article class="kind">${ph ? img(ph.key, ph.ph) : ""}<div><h3>${esc(it.title)}</h3><p>${esc(it.body)}</p></div></article>`).join("")}</div></div></section>`
    : "";

  const howSec = how && how.steps.length
    ? `<section class="how" id="how"><div class="wrap how-grid${howPhoto ? "" : " one"}">${howPhoto ? `<figure class="how-photo">${img(howPhoto.key, howPhoto.ph)}</figure>` : ""}<div><p class="kicker">${esc(ui.howItWorks)}</p><h2>${emLast(how.title)}</h2><ol class="steps">${how.steps.slice(0, 4).map((s) => `<li><div><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></div></li>`).join("")}</ol></div></div></section>`
    : "";

  const compare = comps.length && offer?.bullets.length
    ? `<section class="compare"><div class="wrap"><h2>${emLast(T.compare.replace("{name}", b.name), b.name.split(/\s+/).length)}</h2><div class="cols"><div class="them">${comps.map((c) => `<h3>${esc(c.name)}</h3><ul><li>${esc(c.gap)}</li></ul>`).join("")}</div><div class="us"><h3>${esc(b.name)}</h3><ul>${offer.bullets.slice(0, 4).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div></div></section>`
    : "";

  const faqSec = faq && faq.items.length
    ? `<section class="faq"><div class="wrap faq-grid"><h2>${esc(faq.title || ui.faq)}</h2><div>${faq.items.slice(0, 6).map((f, i) => `<details${i === 0 ? " open" : ""}><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div></div></section>`
    : "";

  const join = `<section class="join${faqSec ? "" : " first"}" id="join"><div class="wrap"><div class="join-card"><div class="join-copy"><h2>${emLast(spec.finalCta.headline)}</h2></div><div class="join-copy"><p>${esc(spec.finalCta.sub)}</p><form data-ld="waitlist"><label for="email">${esc(ui.emailPlaceholder)}</label><input id="email" type="email" name="email" placeholder="${esc(ui.emailPlaceholder)}" required><button type="submit">${esc(ui.joinList)}</button></form><p class="small">${esc(ui.privacy)}</p></div></div></div></section>`;

  const footer = `<footer><div class="wrap"><span>${esc([b.name, spec.footer.tagline || b.tagline, city].filter(Boolean).join(" · "))}</span><a href="#top">${esc(T.back)}</a></div></footer>`;

  return `${css}\n${header}\n<main id="top">${heroSec}${problem}${offerSec}${kinds}${howSec}${compare}${faqSec}${join}</main>\n${footer}`;
}
