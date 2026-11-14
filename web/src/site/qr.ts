import qrcode from "qrcode-generator";
import { esc } from "../pack/util";

/** Crisp QR code as an SVG string (quiet zone included). Optional centre badge (SVG markup in a 100×100 box). */
export function qrSvg(text: string, opts: { size?: number; fg?: string; bg?: string; badge?: string; label?: string } = {}): string {
  const { size = 220, fg = "#1D1D1F", bg = "#ffffff", badge, label = "QR code" } = opts;
  const qr = qrcode(0, badge ? "H" : "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const q = 3; // quiet zone in modules
  const total = n + q * 2;
  let d = "";
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.isDark(r, c)) { c++; continue; }
      let e = c;
      while (e < n && qr.isDark(r, e)) e++;
      d += `M${c + q} ${r + q}h${e - c}v1h-${e - c}z`;
      c = e;
    }
  }
  let center = "";
  if (badge) {
    const b = Math.round(n * 0.22);
    const x = q + (n - b) / 2;
    center = `<rect x="${x - 0.6}" y="${x - 0.6}" width="${b + 1.2}" height="${b + 1.2}" rx="${b * 0.28}" fill="${bg}"/>` +
      `<svg x="${x}" y="${x}" width="${b}" height="${b}" viewBox="0 0 100 100">${badge}</svg>`;
  }
  return `<svg class="ld-qr" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="${esc(label)}">` +
    `<rect width="${total}" height="${total}" fill="${bg}"/><path d="${d}" fill="${fg}"/>${center}</svg>`;
}

/** The BCH mark (green disc with a tilted ₿-like glyph), drawn for a 100×100 box. */
export const BCH_BADGE =
  `<circle cx="50" cy="50" r="48" fill="#0AC18E"/>` +
  `<g transform="rotate(-14 50 50)" fill="#fff"><path fill-rule="evenodd" d="M38 26h17.5c8.6 0 13.5 4.3 13.5 10.6 0 4.6-2.6 7.6-6.4 8.8 4.9 1 8.2 4.5 8.2 9.7 0 7.2-5.5 12-14.7 12H38zm10 8.4v10.3h6.3c3.7 0 5.6-1.9 5.6-5.2s-1.9-5.1-5.6-5.1zm0 18v11.2h7.4c4.1 0 6.3-2 6.3-5.6s-2.2-5.6-6.3-5.6z"/>` +
  `<rect x="44" y="18" width="5" height="10" rx="1.5"/><rect x="53" y="18" width="5" height="10" rx="1.5"/><rect x="44" y="65" width="5" height="10" rx="1.5"/><rect x="53" y="65" width="5" height="10" rx="1.5"/></g>`;

/** BCH mark. `onGreen` (any coloured button) draws a monochrome outline coin in currentColor. */
export function bchMark(size = 18, onGreen = false): string {
  const badge = onGreen
    ? BCH_BADGE.replace('<circle cx="50" cy="50" r="48" fill="#0AC18E"/>', '<circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" stroke-width="8"/>').replace('fill="#fff"', 'fill="currentColor"')
    : BCH_BADGE;
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">${badge}</svg>`;
}

/** BCH amount for a USD price, 8 decimals max, trailing zeros trimmed. Empty string if no price. */
export function bchAmount(usd: number, bchUsd: number): string {
  if (!(usd > 0) || !(bchUsd > 0)) return "";
  return (usd / bchUsd).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

export function paymentUri(address: string, amount: string): string {
  const a = address.startsWith("bitcoincash:") ? address : `bitcoincash:${address}`;
  return amount ? `${a}?amount=${amount}` : a;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const t = document.createElement("textarea");
      t.value = text;
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
