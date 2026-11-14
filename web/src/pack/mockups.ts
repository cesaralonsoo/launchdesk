// "In use" brand mockups — generic flat illustrations coloured with the brand palette.
import type { DexDesign, Palette } from "../types";
import { iconGroup, renderLogo } from "./logo";
import { brandColors, esc, mix } from "./util";

type Logo = DexDesign["logos"][number];

const PHYSICAL = new Set(["cup", "fork", "shop", "leaf", "paw", "book", "bike", "home", "heart", "music", "camera", "tool"]);

/** Embed a logo SVG at (x,y,size) inside a parent SVG. */
function logoAt(logo: Logo | undefined, p: Palette | undefined, name: string, x: number, y: number, s: number): string {
  return renderLogo(logo, p, name, s).replace("<svg ", `<svg x="${x}" y="${y}" `);
}

function storefront(logo: Logo | undefined, p: Palette | undefined, name: string): string {
  const c = brandColors(p);
  const wall = "#D9D6D0", ground = "#BDB9B2", facade = c.primary;
  const awn = Array.from({ length: 9 }, (_, i) => `<path d="M${60 + i * 28} 104h28v18a14 14 0 0 1-28 0z" fill="${i % 2 ? c.bg : c.accent}"/>`).join("");
  const nm = esc(name);
  const fs = Math.min(26, 230 / Math.max(4, name.length * 0.62));
  return `<svg viewBox="0 0 520 300" role="img" aria-label="${nm} storefront mockup">
    <rect width="520" height="300" fill="${wall}"/>
    <rect y="246" width="520" height="54" fill="${ground}"/><rect y="246" width="520" height="4" fill="#A9A49C"/>
    <rect x="48" y="40" width="276" height="206" fill="${facade}"/>
    <rect x="64" y="54" width="244" height="40" rx="8" fill="${c.bg}"/>
    ${logoAt(logo, p, name, 70, 57, 34)}
    <text x="112" y="82" font-family="-apple-system, BlinkMacSystemFont, Inter, Helvetica Neue, Arial, sans-serif" font-weight="800" font-size="${fs.toFixed(1)}" fill="${c.ink}" letter-spacing="-.5">${nm}</text>
    <rect x="54" y="100" width="264" height="6" fill="${mix(facade, "#000", 0.25)}"/>
    ${awn}
    <rect x="64" y="146" width="140" height="100" fill="${mix(c.extra, "#8A949C", 0.55)}"/>
    <rect x="64" y="146" width="140" height="100" fill="url(#glass)"/>
    ${logoAt(logo, p, name, 110, 172, 48)}
    <rect x="220" y="146" width="88" height="100" fill="${mix(facade, "#000", 0.35)}"/>
    <rect x="228" y="154" width="72" height="44" fill="${mix(facade, "#fff", 0.12)}" opacity=".5"/>
    <circle cx="292" cy="204" r="3" fill="${c.accent}"/>
    <defs><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/></linearGradient></defs>
    <ellipse cx="420" cy="250" rx="62" ry="8" fill="#000" opacity=".12"/>
    <path d="M378 118h84l-10 128h-64z" fill="${c.bg}"/>
    <path d="M384 164h72l-3.6 52h-64.8z" fill="${c.accent}"/>
    ${logoAt(logo, p, name, 402, 170, 36)}
    <rect x="370" y="104" width="100" height="18" rx="5" fill="${mix(c.bg, "#000", 0.08)}"/>
    <rect x="378" y="96" width="84" height="10" rx="4" fill="${c.bg}"/>
  </svg>`;
}

function laptop(logo: Logo | undefined, p: Palette | undefined, name: string, headline: string): string {
  const c = brandColors(p);
  const nm = esc(name);
  const lines: string[] = [];
  for (const w of headline.split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + " " + w).length <= 20) lines[lines.length - 1] = last + " " + w;
    else lines.push(w);
  }
  if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].replace(/\s*\S*$/, "") + "…"; }
  const heads = lines.map((t, i) => `<text x="108" y="${104 + i * 16}" font-family="-apple-system, BlinkMacSystemFont, Inter, Helvetica Neue, Arial, sans-serif" font-size="12.5" font-weight="800" fill="${c.ink}">${esc(t)}</text>`).join("");
  const yb = 104 + lines.length * 16;
  return `<svg viewBox="0 0 520 300" role="img" aria-label="${nm} website mockup">
    <defs><linearGradient id="lpbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E9EEF3"/><stop offset="1" stop-color="#D3DAE2"/></linearGradient>
    <linearGradient id="lphero" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.accent}"/><stop offset="1" stop-color="${c.primary}"/></linearGradient></defs>
    <rect width="520" height="300" fill="url(#lpbg)"/>
    <ellipse cx="250" cy="262" rx="200" ry="10" fill="#000" opacity=".1"/>
    <rect x="84" y="40" width="332" height="212" rx="12" fill="#1C2330"/>
    <rect x="94" y="50" width="312" height="192" rx="4" fill="${c.bg}"/>
    <path d="M60 252h380l-18 14H78z" fill="#AEB7C2"/><rect x="60" y="248" width="380" height="6" rx="3" fill="#C8D0D9"/>
    ${logoAt(logo, p, name, 104, 58, 18)}
    <text x="126" y="71" font-family="-apple-system, BlinkMacSystemFont, Inter, Helvetica Neue, Arial, sans-serif" font-size="10" font-weight="800" fill="${c.ink}">${nm}</text>
    <rect x="356" y="60" width="40" height="13" rx="6.5" fill="none" stroke="${c.ink}" stroke-width="1"/>
    ${heads}
    <rect x="108" y="${yb}" width="120" height="5" rx="2.5" fill="${mix(c.ink, c.bg, 0.6)}"/><rect x="108" y="${yb + 10}" width="96" height="5" rx="2.5" fill="${mix(c.ink, c.bg, 0.6)}"/>
    <rect x="108" y="${yb + 26}" width="88" height="20" rx="6" fill="#0AC18E"/>
    <rect x="270" y="88" width="122" height="110" rx="10" fill="url(#lphero)"/>
    ${iconGroup(logo?.icon ?? "spark", mix(c.bg, "#fff", 0.4), 309, 120, 44, c.accent)}
    <rect x="384" y="122" width="88" height="150" rx="14" fill="#1C2330"/>
    <rect x="389" y="130" width="78" height="134" rx="9" fill="${c.bg}"/>
    <rect x="395" y="140" width="66" height="44" rx="6" fill="url(#lphero)"/>
    <rect x="395" y="192" width="54" height="6" rx="3" fill="${c.ink}"/><rect x="395" y="202" width="40" height="6" rx="3" fill="${c.ink}"/>
    <rect x="395" y="240" width="66" height="14" rx="5" fill="#0AC18E"/>
  </svg>`;
}

export function heroScene(logo: Logo | undefined, p: Palette | undefined, name: string, headline: string): string {
  return PHYSICAL.has(logo?.icon ?? "") ? storefront(logo, p, name) : laptop(logo, p, name, headline);
}

export function businessCard(logo: Logo | undefined, p: Palette | undefined, name: string, tagline: string, handle: string): string {
  const c = brandColors(p);
  const nm = esc(name);
  return `<svg viewBox="0 0 320 190" role="img" aria-label="${nm} business cards">
    <rect width="320" height="190" fill="${mix(c.extra, "#2A2F38", 0.55)}"/>
    <g transform="rotate(-8 120 100)"><rect x="36" y="44" width="170" height="100" rx="8" fill="${c.primary}"/>
      ${logoAt(logo, p, name, 96, 64, 50)}</g>
    <rect x="128" y="62" width="170" height="100" rx="8" fill="${c.bg}" style="filter:drop-shadow(0 8px 10px rgba(0,0,0,.3))"/>
    ${logoAt(logo, p, name, 142, 76, 30)}
    <text x="180" y="93" font-family="-apple-system, BlinkMacSystemFont, Inter, Helvetica Neue, Arial, sans-serif" font-size="13" font-weight="800" fill="${c.ink}">${nm}</text>
    <text x="142" y="128" font-family="-apple-system, BlinkMacSystemFont, Inter, Helvetica Neue, Arial, sans-serif" font-size="8.5" font-weight="700" fill="${c.ink}">Founder</text>
    <text x="142" y="141" font-family="-apple-system, BlinkMacSystemFont, Inter, Helvetica Neue, Arial, sans-serif" font-size="7.5" fill="${mix(c.ink, c.bg, 0.4)}">${esc(handle)}</text>
    <text x="142" y="152" font-family="-apple-system, BlinkMacSystemFont, Inter, Helvetica Neue, Arial, sans-serif" font-size="7.5" fill="${mix(c.ink, c.bg, 0.4)}">${esc(tagline).slice(0, 40)}</text>
    <rect x="284" y="70" width="6" height="84" rx="3" fill="${c.accent}"/>
  </svg>`;
}

export function socialProfile(logo: Logo | undefined, p: Palette | undefined, name: string, handle: string): string {
  const c = brandColors(p);
  const nm = esc(name);
  const tiles = [c.accent, c.primary, c.extra, mix(c.accent, c.bg, 0.4), c.primary, c.accent];
  return `<svg viewBox="0 0 260 190" role="img" aria-label="${nm} social profile">
    <rect width="260" height="190" fill="#F4F6F8"/>
    <rect x="70" y="14" width="120" height="190" rx="16" fill="#fff" stroke="#E1E5EA"/>
    <circle cx="96" cy="46" r="17" fill="${c.bg}" stroke="${c.accent}" stroke-width="2"/>
    ${logoAt(logo, p, name, 82, 32, 28)}
    <text x="120" y="42" font-family="-apple-system, BlinkMacSystemFont, Inter, Helvetica Neue, Arial, sans-serif" font-size="9" font-weight="800" fill="#12161C">${esc(handle).slice(0, 16)}</text>
    <rect x="120" y="48" width="44" height="4" rx="2" fill="#D5DAE0"/>
    <rect x="80" y="70" width="100" height="14" rx="5" fill="#12161C"/><text x="130" y="80" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Inter, Helvetica Neue, Arial, sans-serif" font-size="7.5" font-weight="700" fill="#fff">Follow</text>
    ${tiles.map((t, i) => `<rect x="${80 + (i % 3) * 34}" y="${92 + Math.floor(i / 3) * 34}" width="32" height="32" rx="3" fill="${t}"/>`).join("")}
    ${iconGroup(logo?.icon ?? "spark", c.bg, 88, 100, 16, c.accent)}
    ${iconGroup(logo?.icon ?? "spark", c.onPrimary, 156, 134, 16, c.primary)}
  </svg>`;
}
