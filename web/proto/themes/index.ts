// Five theme identities (WS-C owns; tune freely, keep the ThemeTokens shape).
import type { LayoutId, ThemeId, ThemeTokens } from "../contracts";

const G = (q: string) => `https://fonts.googleapis.com/css2?${q}&display=swap`;

export const THEMES: Record<ThemeId, ThemeTokens> = {
  graphite: {
    id: "graphite", name: "Graphite", tagline: "White glass, ink, BCH green. Bright studio day.",
    fonts: {
      hrefs: [G("family=Inter+Tight:wght@500;600;700&family=Inter:wght@400;500;600")],
      display: `"Inter Tight", "Inter", system-ui, sans-serif`, text: `"Inter", system-ui, sans-serif`, numbers: `"Inter Tight", "Inter", system-ui, sans-serif`,
    },
    colors: {
      bg: "#EEF0F3", glass: "rgba(255,255,255,0.82)", glassStrong: "rgba(255,255,255,0.92)", ink: "#0B0D12", muted: "#646B78",
      line: "rgba(11,13,18,0.08)", accent: "#0B0D12", accentInk: "#FFFFFF", money: "#0AC18E", positive: "#0AA374", warning: "#C77700", negative: "#D93D2E",
    },
    radii: { sm: 10, md: 16, lg: 24, pill: 999 },
    glass: { blur: 28, saturate: 1.15, border: "rgba(255,255,255,0.7)", shadow: "0 1px 1px rgba(11,13,18,.04), 0 12px 40px rgba(11,13,18,.10)" },
    scheme: "light",
    atmosphere: {
      timeOfDay: "studio", sky: ["#F4F6F9", "#E3E7ED"], fog: { color: "#E3E7ED", near: 60, far: 220 },
      key: { color: "#FFF4E6", intensity: 3.1, azimuth: 35, elevation: 48, shadows: true },
      ambient: { sky: "#F4F6FF", ground: "#B8B0A6", intensity: 0.72 }, ground: "#E6E9EE", exposure: 1.02,
      surfaces: { floor: "#F2F3F5", wall: "#FAFAFB", slab: "#D5DAE1", glass: "#DDEBFA", corridor: "#E9ECF0" }, accentStrength: 0.85, lightsOn: false,
    },
  },
  midnight: {
    id: "midnight", name: "Midnight", tagline: "Dark glass, night city, warm windows.",
    fonts: {
      hrefs: [G("family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500")],
      display: `"Geist", system-ui, sans-serif`, text: `"Geist", system-ui, sans-serif`, numbers: `"Geist", system-ui, sans-serif`,
    },
    colors: {
      bg: "#07090D", glass: "rgba(16,19,26,0.76)", glassStrong: "rgba(24,28,36,0.88)", ink: "#F3F4F6", muted: "#8A92A3",
      line: "rgba(255,255,255,0.09)", accent: "#F3F4F6", accentInk: "#07090D", money: "#2FD9A3", positive: "#2FD9A3", warning: "#F2B33D", negative: "#FF6B5E",
    },
    radii: { sm: 10, md: 14, lg: 22, pill: 999 },
    glass: { blur: 30, saturate: 1.1, border: "rgba(255,255,255,0.08)", shadow: "0 20px 60px rgba(0,0,0,.45)" },
    scheme: "dark",
    atmosphere: {
      timeOfDay: "night", sky: ["#0A0E16", "#141B27"], fog: { color: "#141B27", near: 50, far: 200 },
      key: { color: "#9FB4D9", intensity: 0.7, azimuth: -30, elevation: 50, shadows: true },
      ambient: { sky: "#3A4A66", ground: "#0B0E14", intensity: 0.55 }, ground: "#10141C", exposure: 1.05,
      surfaces: { floor: "#D9D4CB", wall: "#E7E3DC", slab: "#1A202B", glass: "#9DB7D8", corridor: "#CFCAC1" }, accentStrength: 0.9, lightsOn: true,
    },
  },
  ivory: {
    id: "ivory", name: "Ivory", tagline: "Warm paper, serif numbers, golden hour.",
    fonts: {
      hrefs: [G("family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Geist:wght@400;500;600")],
      display: `"Newsreader", Georgia, serif`, text: `"Geist", system-ui, sans-serif`, numbers: `"Newsreader", Georgia, serif`,
    },
    colors: {
      bg: "#FBF8F3", glass: "rgba(251,248,243,0.86)", glassStrong: "rgba(253,251,247,0.95)", ink: "#1C1915", muted: "#7A7166",
      line: "rgba(28,25,21,0.10)", accent: "#1C1915", accentInk: "#FBF8F2", money: "#0E9F74", positive: "#0E9F74", warning: "#B7701E", negative: "#B8442F",
    },
    radii: { sm: 8, md: 14, lg: 20, pill: 999 },
    glass: { blur: 24, saturate: 1.05, border: "rgba(255,255,255,0.6)", shadow: "0 1px 1px rgba(60,40,10,.05), 0 14px 44px rgba(60,40,10,.12)" },
    scheme: "light",
    atmosphere: {
      timeOfDay: "golden", sky: ["#F7F1E8", "#EADFCC"], fog: { color: "#EFE6D8", near: 70, far: 260 },
      key: { color: "#FFD9A8", intensity: 3.0, azimuth: 70, elevation: 24, shadows: true },
      ambient: { sky: "#FFF6EA", ground: "#B8A898", intensity: 0.62 }, ground: "#ECE7DF", exposure: 1.04,
      surfaces: { floor: "#F2EFEA", wall: "#FBFAF8", slab: "#C9C3BA", glass: "#E8EEF2", corridor: "#E9E4DC" }, accentStrength: 0.9, lightsOn: true,
    },
  },
  forest: {
    id: "forest", name: "Forest & Lime", tagline: "Green-black glass, lime action. Overcast morning.",
    fonts: {
      hrefs: [G("family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600")],
      display: `"Space Grotesk", "Inter", system-ui, sans-serif`, text: `"Inter", system-ui, sans-serif`, numbers: `"Space Grotesk", "Inter", system-ui, sans-serif`,
    },
    colors: {
      bg: "#0F2A1F", glass: "rgba(15,42,31,0.86)", glassStrong: "rgba(20,52,39,0.94)", ink: "#EEF5EA", muted: "#9DB5A6",
      line: "rgba(238,245,234,0.12)", accent: "#C8F169", accentInk: "#0F2A1F", money: "#C8F169", positive: "#9BE07A", warning: "#F2C14E", negative: "#FF8A70",
    },
    radii: { sm: 12, md: 18, lg: 28, pill: 999 },
    glass: { blur: 26, saturate: 1.2, border: "rgba(200,241,105,0.10)", shadow: "0 18px 50px rgba(8,24,17,.35)" },
    scheme: "dark",
    atmosphere: {
      timeOfDay: "day", sky: ["#D9E1DE", "#C3CEC9"], fog: { color: "#CCD6D1", near: 60, far: 230 },
      key: { color: "#F2F6FF", intensity: 1.9, azimuth: 40, elevation: 62, shadows: true },
      ambient: { sky: "#E6EEF2", ground: "#8FA394", intensity: 1.05 }, ground: "#D3DDD6", exposure: 1.0,
      surfaces: { floor: "#EEF0EC", wall: "#FAFBF8", slab: "#1C3A2C", glass: "#D7EBE4", corridor: "#E5E8E2" }, accentStrength: 0.85, lightsOn: true,
    },
  },
  mono: {
    id: "mono", name: "Mono", tagline: "Black and white, monospaced numbers. Overcast.",
    fonts: {
      hrefs: [G("family=Geist:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600")],
      display: `"Geist", system-ui, sans-serif`, text: `"Geist", system-ui, sans-serif`, numbers: `"IBM Plex Mono", ui-monospace, monospace`,
    },
    colors: {
      bg: "#F2F2F2", glass: "rgba(255,255,255,0.96)", glassStrong: "#FFFFFF", ink: "#000000", muted: "#6B6B6B",
      line: "rgba(0,0,0,0.12)", accent: "#000000", accentInk: "#FFFFFF", money: "#000000", positive: "#000000", warning: "#000000", negative: "#000000",
    },
    radii: { sm: 4, md: 6, lg: 8, pill: 999 },
    glass: { blur: 16, saturate: 1, border: "rgba(0,0,0,0.10)", shadow: "0 8px 30px rgba(0,0,0,.08)" },
    scheme: "light",
    atmosphere: {
      timeOfDay: "studio", sky: ["#EDEDED"], fog: { color: "#EDEDED", near: 55, far: 200 },
      key: { color: "#FFFFFF", intensity: 2.4, azimuth: 20, elevation: 60, shadows: true },
      ambient: { sky: "#FFFFFF", ground: "#B0B0B0", intensity: 0.9 }, ground: "#E4E4E4", exposure: 1.0,
      surfaces: { floor: "#F4F4F4", wall: "#FFFFFF", slab: "#D0D0D0", glass: "#E8E8E8", corridor: "#EAEAEA" }, accentStrength: 0, lightsOn: false,
    },
  },
};

export const LAYOUT_NAMES: Record<LayoutId, string> = { center: "Center", dock: "Dock", side: "Side" };

/** Loads the theme's fonts and writes its tokens as CSS custom properties on <html>. Idempotent. */
export function applyTheme(t: ThemeTokens, root: HTMLElement = document.documentElement): void {
  for (const href of t.fonts.hrefs) {
    if (!document.head.querySelector(`link[data-font="${CSS.escape(href)}"]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      l.dataset.font = href;
      document.head.appendChild(l);
    }
  }
  const v: Record<string, string> = {
    "--font-display": t.fonts.display, "--font-text": t.fonts.text, "--font-num": t.fonts.numbers,
    "--r-sm": `${t.radii.sm}px`, "--r-md": `${t.radii.md}px`, "--r-lg": `${t.radii.lg}px`, "--r-pill": `${t.radii.pill}px`,
    "--glass-blur": `${t.glass.blur}px`, "--glass-sat": String(t.glass.saturate), "--glass-border": t.glass.border, "--glass-shadow": t.glass.shadow,
  };
  for (const [k, c] of Object.entries(t.colors)) v[`--c-${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}`] = c;
  for (const [k, val] of Object.entries(v)) root.style.setProperty(k, val);
  root.dataset.theme = t.id;
  root.style.colorScheme = t.scheme;
}

// ───────────────────────────── v6: one product skin
/** v6 typography, the only one: Inter Tight for display and numbers (tabular), Inter for text. */
export const PRODUCT_FONTS = {
  href: G("family=Inter+Tight:wght@500;600;700&family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600"),
  display: `"Inter Tight", "Inter", system-ui, sans-serif`,
  text: `"Inter", system-ui, sans-serif`,
  numbers: `"Inter Tight", "Inter", system-ui, sans-serif`,
};

/** Fonts, radii and glass physics. Colours come from themes/day.ts (they follow the day cycle). */
export function applyBase(root: HTMLElement = document.documentElement): void {
  if (!document.head.querySelector("link[data-font='product']")) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = PRODUCT_FONTS.href;
    l.dataset.font = "product";
    document.head.appendChild(l);
  }
  const v: Record<string, string> = {
    "--font-display": PRODUCT_FONTS.display, "--font-text": PRODUCT_FONTS.text, "--font-num": PRODUCT_FONTS.numbers,
    "--r-sm": "10px", "--r-md": "16px", "--r-lg": "26px", "--r-pill": "999px", "--glass-blur": "30px", "--glass-sat": "1.4",
  };
  for (const [k, val] of Object.entries(v)) root.style.setProperty(k, val);
  root.dataset.theme = "product";
}
