// Public generated landing page at /s/:slug.
import type { SiteData } from "../types";
import { renderLogo } from "../pack/logo";
import { brandColors, esc } from "../pack/util";
import { ensureSiteCss, landingMarkup, wireLanding } from "./landing";

export { landingMarkup, wireLanding, ensureSiteCss } from "./landing";

let cleanup: (() => void) | null = null;

function ensureFonts(): void {
  const has = [...document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")].some((l) => /family=Sora/.test(l.href));
  const hasMono = [...document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")].some((l) => /JetBrains/.test(l.href));
  const fams: string[] = [];
  if (!has) fams.push("family=Sora:wght@600;700;800", "family=Plus+Jakarta+Sans:wght@400;500;600;700;800");
  if (!hasMono) fams.push("family=JetBrains+Mono:wght@400;500;600");
  if (!fams.length) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = `https://fonts.googleapis.com/css2?${fams.join("&")}&display=swap`;
  document.head.appendChild(l);
}

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
  l.href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace(/<svg /, '<svg xmlns="http://www.w3.org/2000/svg" '));
}

function isSiteData(v: unknown): v is SiteData {
  const d = v as SiteData;
  return !!d && typeof d === "object" && typeof d.name === "string" && !!d.landing && typeof d.landing.headline === "string";
}

/** Fetch GET /api/sites/:slug and render the brand's standalone landing page into `container`. */
export async function renderSite(container: HTMLElement, slug: string): Promise<void> {
  cleanup?.();
  cleanup = null;
  ensureSiteCss();
  ensureFonts();
  document.body.style.margin = "0";
  document.body.style.background = "#0B0F15";
  container.innerHTML = `<div class="lds-state"><div><div class="lds-spin"></div></div></div>`;

  let data: SiteData;
  try {
    const res = await fetch(`/api/sites/${encodeURIComponent(slug)}`, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    const json: unknown = await res.json();
    if (!isSiteData(json)) throw new Error("bad data");
    data = { ...json, slug: json.slug || slug, palette: Array.isArray(json.palette) ? json.palette : [] };
  } catch {
    document.title = "Page not found · LaunchDesk";
    container.innerHTML = `<div class="lds-state"><div>
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#6F7E93" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 9.5h.01M15 9.5h.01M8.5 16c1-1.2 2.2-1.8 3.5-1.8s2.5.6 3.5 1.8"/></svg>
      <h1>This page isn't live yet</h1>
      <p>We couldn't find a launched project at <code>/s/${esc(slug)}</code>.</p>
      <a href="/">Build yours with LaunchDesk</a></div></div>`;
    return;
  }

  const c = brandColors(data.palette);
  document.title = `${data.name}${data.tagline ? ` — ${data.tagline}` : ""}`;
  setMeta("description", data.landing.subheadline || data.tagline || "");
  setMeta("theme-color", c.bg);
  setFavicon(renderLogo(data.logo, data.palette, data.name, 64));
  document.body.style.background = c.bg;
  document.documentElement.style.background = c.bg;

  container.innerHTML = landingMarkup(data);
  cleanup = wireLanding(container, data, document.body);
}
