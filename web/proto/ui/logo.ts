// v6 · LaunchDesk identity (WS-B). Three candidate marks on a 24 grid; `ink` = currentColor, `acc` = the BCH accent.
// Default: "quadrant" — an L and a D-bowl cut from one rounded tile (LaunchDesk monogram; the bowl is the rising sun
// of the day cycle). Alternatives live in the dev switcher (?switcher=1).
export type MarkId = "quadrant" | "horizon" | "stack";
export const MARK_IDS: readonly MarkId[] = ["quadrant", "horizon", "stack"];
export const MARK_NAMES: Record<MarkId, string> = { quadrant: "Quadrant", horizon: "Horizon", stack: "Stack" };

const BODY: Record<MarkId, (acc: string) => string> = {
  // L (ink) + quarter-disc bowl (accent), 1.6 gap, outer corner radius 5.
  quadrant: (acc) =>
    `<path d="M2 7a5 5 0 0 1 5-5h2.2v12.8H22V17a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5z" fill="currentColor"/>` +
    `<path d="M10.8 2A11.2 11.2 0 0 1 22 13.2H10.8z" fill="${acc}"/>`,
  // a desk (slab) and a sun clearing it: launch + day cycle.
  horizon: (acc) =>
    `<circle cx="12" cy="11.4" r="6.4" fill="${acc}"/>` +
    `<rect x="1.6" y="13.2" width="20.8" height="8.6" rx="3" fill="currentColor"/>`,
  // three floors, offset: office → tower → district.
  stack: (acc) =>
    `<rect x="2" y="15.4" width="20" height="6.6" rx="2.4" fill="currentColor"/>` +
    `<rect x="5.4" y="8.7" width="16.6" height="5.4" rx="2.2" fill="currentColor" opacity=".55"/>` +
    `<rect x="9.2" y="2" width="12.8" height="5.4" rx="2.1" fill="${acc}"/>`,
};

let current: MarkId = "quadrant";
export const getMark = () => current;
export function setMark(id: MarkId): void {
  current = id;
  document.querySelectorAll<HTMLElement>("[data-ld-mark]").forEach((n) => (n.outerHTML = ldMark(Number(n.dataset.size) || 20, id))); faviconSync(id);
}

/** The mark alone. */
export function ldMark(size = 20, id: MarkId = current, fixed = false, acc = "var(--c-money)"): string {
  return `<svg class="ld-mark"${fixed ? "" : " data-ld-mark"} data-size="${size}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${BODY[id](acc)}</svg>`;
}

/** Mark + wordmark. */
export function ldLogo(size = 20, id: MarkId = current): string {
  return `<span class="ld-logo" style="--ld:${size}px">${ldMark(size, id)}<span class="ld-word">LaunchDesk</span></span>`;
}

function faviconSync(id: MarkId): void {
  const l = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (l) l.href = faviconHref(id);
}

/** Favicon (data URI): the mark on a dark tile so it reads on light and dark tab bars. */
export function faviconHref(id: MarkId = current): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0A0C11"/><g transform="translate(5 5) scale(.9167)" color="#F2F4F7">${BODY[id]("#0AC18E").replace(/currentColor/g, "#F2F4F7")}</g></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}
