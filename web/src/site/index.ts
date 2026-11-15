// Public generated landing page at /s/:slug. Owner: WS3 (L41–L44, F11, F12).
import type { Project, SiteData } from "../types";
import { list as savedProjects } from "../app/projects";
import { renderMark } from "../pack/logo";
import { brandColors, esc, loadFonts } from "../pack/util";
import { ensureSiteCss, landingMarkup, wireLanding } from "./landing";
import { copyText, qrSvg } from "./qr";

export { landingMarkup, wireLanding, ensureSiteCss } from "./landing";
export { countPreorders } from "./preorders";

let cleanup: (() => void) | null = null;

function setMeta(name: string, content: string): void {
  let m = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!m) {
    m = document.createElement("meta");
    m.name = name;
    document.head.appendChild(m);
  }
  m.content = content;
}

function setFavicon(svg: string): void {
  let l = document.querySelector<HTMLLinkElement>("link[rel~=icon]");
  if (!l) {
    l = document.createElement("link");
    l.rel = "icon";
    document.head.appendChild(l);
  }
  l.type = "image/svg+xml";
  l.href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/** A favicon from the brand mark (rounded tile in the primary colour). */
function brandFavicon(data: SiteData): string {
  const c = brandColors(data.palette);
  const mono = (data.logo?.monogram || data.name.charAt(0) || "A").slice(0, 2).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${c.primary}"/><text x="32" y="43" text-anchor="middle" font-family="Georgia, serif" font-weight="600" font-size="${mono.length > 1 ? 26 : 34}" fill="${c.onPrimary}">${esc(mono)}</text></svg>`;
}

function isSiteData(v: unknown): v is SiteData {
  const d = v as SiteData;
  return !!d && typeof d === "object" && typeof d.name === "string" && !!d.landing && typeof d.landing.headline === "string";
}

const LD_MARK = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 14.5h14"/><path d="M5.5 9.5 9 6l3.5 3.5"/></svg>`;

/** F12: branded LaunchDesk 404 with a way forward. */
function notFound(container: HTMLElement, slug: string, offline: boolean) {
  document.title = offline ? "Can't reach LaunchDesk" : "Page not found · LaunchDesk";
  setMeta("robots", "noindex");
  container.innerHTML = `<div class="lds-state"><div class="lds-state-in">
    <a class="lds-state-mark" href="/" style="color:inherit;text-decoration:none">${LD_MARK}LaunchDesk</a>
    <span class="lds-state-code">${offline ? "Offline" : "404"}</span>
    <h1>${offline ? "We can't reach this page right now" : "This page isn't live"}</h1>
    <p>${offline ? "Check your connection and try again." : `Nothing is published at <code>/s/${esc(slug)}</code>. It may be mistyped, or its founder hasn't launched yet.`}</p>
    ${offline ? `<a class="lds-state-cta" href="${esc(location.pathname)}">Try again</a>` : `<a class="lds-state-cta" href="/">Build your own page for $0.30</a>`}
    ${offline ? "" : `<a class="lds-state-2" href="/p/example">See a finished example →</a>`}
  </div></div>`;
}

/** Fetch GET /api/sites/:slug and render the brand's standalone landing page into `container`. */
export async function renderSite(container: HTMLElement, slug: string): Promise<void> {
  cleanup?.();
  cleanup = null;
  ensureSiteCss();
  document.body.style.margin = "0";
  document.body.style.background = "#F5F5F7";
  container.innerHTML = `<div class="lds-state"><div><div class="lds-spin" role="status" aria-label="Loading"></div></div></div>`;

  let data: SiteData;
  try {
    const res = await fetch(`/api/sites/${encodeURIComponent(slug)}`, { headers: { accept: "application/json" } });
    if (res.status === 404) return notFound(container, slug, false);
    if (!res.ok) throw new Error(String(res.status));
    const json: unknown = await res.json();
    if (!isSiteData(json)) return notFound(container, slug, false);
    data = { ...json, slug: json.slug || slug, palette: Array.isArray(json.palette) ? json.palette : [] };
  } catch {
    return notFound(container, slug, true);
  }

  if (data.fonts) loadFonts(data.fonts);
  const c = brandColors(data.palette);
  document.title = data.tagline ? `${data.name} · ${data.tagline}` : data.name;
  setMeta("description", data.landing.subheadline || data.tagline || "");
  setMeta("theme-color", c.bg);
  setFavicon(brandFavicon(data));
  document.body.style.background = c.bg;
  document.documentElement.style.background = c.bg;

  container.innerHTML = landingMarkup(data);
  const offWire = wireLanding(container, data, document.body);
  const offBar = founderBar(container, data);
  cleanup = () => {
    offWire();
    offBar();
  };
}

// ---------- L44: founder-only share bar ----------

const ICON = {
  link: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>`,
  download: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4.5v10.5M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19.5h14"/></svg>`,
  post: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 8.5V6.2a1.7 1.7 0 0 0-1.7-1.7H6.2a1.7 1.7 0 0 0-1.7 1.7v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3"/></svg>`,
  close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
};

/** Draws the page's QR (a link to this page, not a payment) to a PNG and downloads it. */
async function downloadQr(data: SiteData, url: string) {
  const size = 1024;
  const svg = qrSvg(url, { size, label: `${data.name} page` }).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("no png");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${data.slug || "page"}-qr.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function founderBar(container: HTMLElement, data: SiteData): () => void {
  const mine = savedProjects().find((p) => p.slug === data.slug);
  let dismissed = false;
  try {
    dismissed = sessionStorage.getItem(`ld-sharebar-${data.slug}`) === "1";
  } catch {
    /* storage blocked */
  }
  if (!mine || dismissed) return () => {};

  const root = container.querySelector<HTMLElement>(".lds");
  root?.classList.add("has-founder");
  const url = location.origin + location.pathname;
  const bar = document.createElement("div");
  bar.className = "lds-share";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Share your page");
  bar.innerHTML = `
    <span class="lds-share-t">${renderMark(data.logo, data.palette, data.name, 20, data.fonts)}<b>Share your page</b></span>
    <button type="button" data-a="link">${ICON.link}<span>Copy link</span></button>
    <button type="button" data-a="qr">${ICON.download}<span>Download QR</span></button>
    <button type="button" data-a="post" hidden>${ICON.post}<span>Copy first post</span></button>
    <button type="button" class="lds-share-x" data-a="close" aria-label="Hide for now">${ICON.close}</button>`;
  document.body.appendChild(bar);

  // The first post comes from the founder's own project (Rae), read like any project page does.
  let caption = "";
  void fetch(`/api/projects/${encodeURIComponent(mine.id)}`)
    .then((r) => (r.ok ? (r.json() as Promise<Project>) : null))
    .then((p) => {
      const post = p?.results?.rae?.first_posts?.[0];
      caption = post?.text ? `${post.text}\n\n${url}` : "";
      const b = bar.querySelector<HTMLButtonElement>('[data-a="post"]');
      if (b && caption) b.hidden = false;
    })
    .catch(() => {});

  const flash = (b: HTMLButtonElement, text: string) => {
    const span = b.querySelector("span");
    if (!span) return;
    const prev = span.textContent;
    span.textContent = text;
    b.classList.add("ok");
    setTimeout(() => {
      span.textContent = prev;
      b.classList.remove("ok");
    }, 1400);
  };
  const onClick = async (e: Event) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-a]");
    if (!b) return;
    const a = b.dataset.a;
    if (a === "close") {
      try {
        sessionStorage.setItem(`ld-sharebar-${data.slug}`, "1");
      } catch {
        /* fine */
      }
      off();
      return;
    }
    if (a === "link") flash(b, (await copyText(url)) ? "Copied" : "Copy failed");
    if (a === "post") flash(b, (await copyText(caption)) ? "Copied" : "Copy failed");
    if (a === "qr") {
      try {
        await downloadQr(data, url);
        flash(b, "Downloaded");
      } catch {
        flash(b, "Couldn't make it");
      }
    }
  };
  bar.addEventListener("click", onClick);
  const off = () => {
    bar.removeEventListener("click", onClick);
    bar.remove();
    root?.classList.remove("has-founder");
  };
  return off;
}
