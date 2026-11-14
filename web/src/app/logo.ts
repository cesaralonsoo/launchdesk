import type { DexDesign, LogoIcon, Palette } from "../types";
import { esc } from "./dom";

// Simple stroke icons on a 24×24 grid (drawn for LaunchDesk).
export const ICON_PATHS: Record<LogoIcon, string> = {
  cup: "M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c0 1 1 1 1 2s-1 1-1 2M12 3.5c0 1 1 1 1 2s-1 1-1 2",
  bike: "M5.5 17.5a3.5 3.5 0 1 0 0-.01M18.5 17.5a3.5 3.5 0 1 0 0-.01M5.5 17.5 9 10h6l3.5 7.5M9 10 12 17.5h-6.5M14 6h2.5l-1.5 4",
  leaf: "M5 19c0-8 5-13 14-14 0 9-5 14-13 14zM5 19l7-7",
  paw: "M12 19c-3 0-5-1.5-5-3.5S9.5 11 12 11s5 2.5 5 4.5-2 3.5-5 3.5zM6.5 10a1.6 2 0 1 0 0-.01M17.5 10a1.6 2 0 1 0 0-.01M9.5 6.5a1.6 2 0 1 0 0-.01M14.5 6.5a1.6 2 0 1 0 0-.01",
  book: "M4 5.5C6.5 4 9.5 4 12 6c2.5-2 5.5-2 8-.5V19c-2.5-1.5-5.5-1.5-8 .5-2.5-2-5.5-2-8-.5zM12 6v13.5",
  code: "M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 5l-3 14",
  fork: "M7 3v6a2 2 0 0 0 4 0V3M9 11v10M17 3c-2 1.5-2.5 4-2.5 7H17v11",
  home: "M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5",
  heart: "M12 20s-7.5-4.5-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10C19.5 15.5 12 20 12 20z",
  bolt: "M13 3 5 13.5h6L10 21l8-10.5h-6z",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z",
  shop: "M4 9.5 5.5 4h13L20 9.5M4 9.5c0 1.5 1.2 2.5 2.7 2.5s2.6-1 2.6-2.5c0 1.5 1.2 2.5 2.7 2.5s2.7-1 2.7-2.5c0 1.5 1.1 2.5 2.6 2.5S20 11 20 9.5M5.5 12v8h13v-8M10 20v-4.5h4V20",
  music: "M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
  camera: "M4 8h3.5L9 5.5h6L16.5 8H20v11H4zM12 16.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z",
  chart: "M4 20h16M6.5 20v-6M11 20V9M15.5 20v-4M20 20V5",
  globe: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM3.5 12h17M12 3.5c2.4 2.5 3.4 5.3 3.4 8.5s-1 6-3.4 8.5c-2.4-2.5-3.4-5.3-3.4-8.5s1-6 3.4-8.5z",
  tool: "M14.5 5.5a4 4 0 0 0 4.9 4.9L11 18.8a2 2 0 0 1-2.8-2.8l8.4-8.4zM14.5 5.5l2 2",
  spark: "M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3",
};

type Logo = DexDesign["logos"][number];

/** Renders a logo concept as an SVG string in the brand palette. */
export function logoSvg(logo: Logo, palette: Palette | undefined, size = 64, name = "") {
  const primary = palette?.[0]?.hex ?? "#0AC18E";
  const accent = palette?.[1]?.hex ?? "#F5C542";
  const bg = palette?.[2]?.hex ?? "#0B0F15";
  const path = ICON_PATHS[logo.icon] ?? ICON_PATHS.spark;
  const mono = esc((logo.monogram || name.slice(0, 2) || "?").slice(0, 2).toUpperCase());
  const label = esc(`${name || "Logo"} · ${logo.concept}`);
  if (logo.shape === "monogram") {
    return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${label}"><rect x="2" y="2" width="60" height="60" rx="16" fill="${primary}"/><rect x="7" y="7" width="50" height="50" rx="12" fill="none" stroke="${accent}" stroke-width="2" opacity=".75"/><text x="32" y="41.5" text-anchor="middle" font-family="Sora,system-ui,sans-serif" font-weight="800" font-size="25" fill="${bg}">${mono}</text></svg>`;
  }
  if (logo.shape === "wordmark") {
    return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${label}"><rect x="2" y="2" width="60" height="60" rx="14" fill="${bg}" stroke="${primary}" stroke-width="2"/><g transform="translate(20 9) scale(1)" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></g><text x="32" y="50" text-anchor="middle" font-family="Sora,system-ui,sans-serif" font-weight="800" font-size="11" letter-spacing=".5" fill="${primary}">${mono}</text></svg>`;
  }
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${label}"><circle cx="32" cy="32" r="30" fill="${primary}"/><circle cx="32" cy="32" r="24.5" fill="none" stroke="${accent}" stroke-width="1.6" opacity=".8"/><g transform="translate(16.4 16.4) scale(1.3)" fill="none" stroke="${bg}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></g></svg>`;
}
