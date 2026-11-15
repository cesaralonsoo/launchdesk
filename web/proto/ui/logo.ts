// v7 · LaunchDesk identity (WS-EXP). Drawn on an 8 × 8 pixel grid to match the pixel-art world: one ink colour and at
// most one BCH-green pixel, no gradients. 8 cells = exactly 2 px at a 16 px favicon, 3 px at the 24 px header.
//
// Four candidates (?logo=1..4). Default 1 "Skyline": a stepped silhouette that rises from one low block (your room) to
// a tower, with one green pixel on the roof (the beacon the world lights when you go live). Critique in CONTRACTS.md.
export type MarkId = "skyline" | "desk" | "window" | "prompt";
export const MARK_IDS: readonly MarkId[] = ["skyline", "desk", "window", "prompt"];
export const MARK_NAMES: Record<MarkId, string> = { skyline: "Skyline", desk: "Desk", window: "Lit window", prompt: "Prompt" };

// X = ink, G = the green pixel, . = empty. Rows top → bottom.
const GRID: Record<MarkId, string[]> = {
  skyline: [
    "......GX",
    "......XX",
    "....XXXX",
    "....XXXX",
    "..XXXXXX",
    "..XXXXXX",
    "XXXXXXXX",
    "XXXXXXXX",
  ],
  desk: [
    "........",
    ".XXXXXX.",
    ".X....X.",
    ".X.G..X.",
    ".X....X.",
    ".XXXXXX.",
    "XXXXXXXX",
    "........",
  ],
  window: [
    ".XXXXXX.",
    ".X.XX.X.",
    ".XXXXXX.",
    ".X.XXGX.",
    ".XXXXXX.",
    ".X.XX.X.",
    ".XXXXXX.",
    ".XXX.XX.",
  ],
  prompt: [
    ".XXXXXX.",
    "XXXXXXXX",
    "XX.XXXXX",
    "XXX.XXXX",
    "XX.XGGXX",
    "XXXXXXXX",
    "XXXXXXXX",
    ".XXXXXX.",
  ],
};

/** Merges horizontal runs into rects so the SVG stays tiny and seamless at any size. */
function rects(id: MarkId, ink: string, acc: string): string {
  let out = "";
  GRID[id].forEach((row, y) => {
    let x = 0;
    while (x < 8) {
      const c = row[x]!;
      if (c === ".") { x++; continue; }
      let w = 1;
      while (x + w < 8 && row[x + w] === c) w++;
      out += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${c === "G" ? acc : ink}"/>`;
      x += w;
    }
  });
  return out;
}

let current: MarkId = "skyline";
export const getMark = () => current;
export function setMark(id: MarkId): void {
  current = id;
  document.querySelectorAll<HTMLElement>("[data-ld-mark]").forEach((n) => (n.outerHTML = ldMark(Number(n.dataset.size) || 24, id)));
  const l = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (l) l.href = faviconHref(id);
}
/** ?logo=1..4 */
export const markFromParam = (v: string | null): MarkId | null => (v && /^[1-4]$/.test(v) ? MARK_IDS[+v - 1]! : v && (MARK_IDS as readonly string[]).includes(v) ? (v as MarkId) : null);

/** The mark alone. `ink` defaults to currentColor; the green pixel is BCH green. */
export function ldMark(size = 24, id: MarkId = current, fixed = false, acc = "#0AC18E", ink = "currentColor"): string {
  return `<svg class="ld-mark"${fixed ? "" : " data-ld-mark"} data-size="${size}" width="${size}" height="${size}" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${rects(id, ink, acc)}</svg>`;
}

/** Mark + wordmark. */
export function ldLogo(size = 24, id: MarkId = current): string {
  return `<span class="ld-logo" style="--ld:${size}px">${ldMark(size, id)}<span class="ld-word">LaunchDesk</span></span>`;
}

/** Favicon (data URI): the bare mark; the ink flips to off-white on dark tab bars (prefers-color-scheme inside the SVG). */
export function faviconHref(id: MarkId = current): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges"><style>.i{fill:#0B0D12}@media (prefers-color-scheme:dark){.i{fill:#F2F4F7}}</style>${rects(id, "INK", "#0AC18E").replace(/fill="INK"/g, 'class="i"')}</svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}
