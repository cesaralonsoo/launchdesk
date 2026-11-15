// Line icons (WS-C). 1.6 px strokes on a 20 grid, currentColor. No sparkles, no emoji.
import { ROOM_META, type Room } from "../contracts";

const s = (body: string, size = 20) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const I = {
  check: (n = 20) => s(`<path d="M4.5 10.5l3.5 3.5 7.5-8"/>`, n),
  arrow: (n = 20) => s(`<path d="M4 10h12M11 5l5 5-5 5"/>`, n),
  enter: (n = 20) => s(`<path d="M16 4v6a2 2 0 0 1-2 2H5"/><path d="M8 8.5L4.5 12 8 15.5"/>`, n),
  close: (n = 20) => s(`<path d="M5 5l10 10M15 5L5 15"/>`, n),
  replay: (n = 20) => s(`<path d="M4 10a6 6 0 1 0 1.8-4.3"/><path d="M4 4v3.5h3.5"/>`, n),
  ext: (n = 20) => s(`<path d="M8 4H4.8A.8.8 0 0 0 4 4.8v10.4c0 .4.4.8.8.8h10.4c.4 0 .8-.4.8-.8V12"/><path d="M11 4h5v5M16 4l-7 7"/>`, n),
  lock: (n = 20) => s(`<rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>`, n),
  // level glyphs
  office: (n = 20) => s(`<rect x="4" y="9" width="12" height="7" rx="1.2"/><path d="M8 16v-3h4v3"/>`, n),
  building: (n = 20) => s(`<rect x="6" y="3" width="8" height="13.5" rx="1.2"/><path d="M8.5 6.5h3M8.5 9.5h3M8.5 12.5h3"/>`, n),
  district: (n = 20) => s(`<rect x="2.5" y="8" width="5" height="8.5" rx="1"/><rect x="8" y="3.5" width="5" height="13" rx="1"/><rect x="13.5" y="10" width="4" height="6.5" rx="1"/>`, n),
  wallet: (n = 20) => s(`<rect x="3" y="5.5" width="14" height="10" rx="2.2"/><path d="M13 10.5h1.5"/><path d="M5 5.5l7.5-2.3c.8-.2 1.5.3 1.5 1.1v1.2"/>`, n),
  globe: (n = 20) => s(`<circle cx="10" cy="10" r="6.5"/><path d="M3.5 10h13M10 3.5c2 2 2 11 0 13M10 3.5c-2 2-2 11 0 13"/>`, n),
  pack: (n = 20) => s(`<rect x="3.5" y="6" width="13" height="10.5" rx="1.8"/><path d="M7.5 6V4.8c0-.7.5-1.3 1.2-1.3h2.6c.7 0 1.2.6 1.2 1.3V6M3.5 10.5h13"/>`, n),
  report: (n = 20) => s(`<rect x="4.5" y="3" width="11" height="14" rx="1.8"/><path d="M7.5 13v-2M10 13V8.5M12.5 13V10"/>`, n),
  brand: (n = 20) => s(`<rect x="3.5" y="3.5" width="13" height="13" rx="3.5"/><circle cx="10" cy="10" r="3"/>`, n),
  info: (n = 20) => s(`<circle cx="10" cy="10" r="7"/><path d="M10 9.2v4.3M10 6.6v.1"/>`, n),
  grid: (n = 20) => s(`<rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.4"/><rect x="11" y="3.5" width="5.5" height="5.5" rx="1.4"/><rect x="3.5" y="11" width="5.5" height="5.5" rx="1.4"/><rect x="11" y="11" width="5.5" height="5.5" rx="1.4"/>`, n),
  back: (n = 20) => s(`<path d="M16 10H4M9 5l-5 5 5 5"/>`, n),
  sun: (n = 20) => s(`<circle cx="10" cy="10" r="3.2"/><path d="M10 2.8v1.6M10 15.6v1.6M2.8 10h1.6M15.6 10h1.6M4.9 4.9l1.1 1.1M14 14l1.1 1.1M4.9 15.1 6 14M14 6l1.1-1.1"/>`, n),
  pause: (n = 20) => s(`<path d="M7.5 5v10M12.5 5v10"/>`, n),
};

/** The brand mark for Dex's logos (LogoIcon "cup"). */
export const cupMark = (size = 28, stroke = "currentColor") =>
  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
     <path d="M7 13h15v6a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7v-6z"/><path d="M22 15h1.5a3 3 0 0 1 0 6H22"/>
     <path d="M12 5c-1 1.2 1 2.2 0 3.6M16.5 5c-1 1.2 1 2.2 0 3.6"/></svg>`;

/** Agent avatar: room-colour disc with the initial. */
export const avatar = (r: Room, size = 28) =>
  `<span class="av" style="--room:${ROOM_META[r].color};--av:${size}px"><span>${ROOM_META[r].name[0]}</span></span>`;
