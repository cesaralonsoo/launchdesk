// WP2 · "Your logo": 3 options at a time, each shown as it will really be used (on light, on dark, as an app icon and
// as the tiny browser-tab icon), one plain line on why it fits, one click to choose, "Show 3 more", and the files to
// download for the chosen one. No framework; WP4's result screen mounts it.
//
//   const p = mountLogoPicker(el, { brand, result, onChoose: (id) => api.chooseLogo(id), onMore: () => api.moreLogos() });
//   p.update(nextResult);  p.destroy();
import type { KitBrand, LogoOption, LogoResult } from "../../../server/kit-contract";
import { lockupSvg, type LockupOpts } from "../../../server/brand/compose";
import { googleFontsHref, wordStyleFor } from "../../../server/brand/fonts";
import { el, esc } from "./dom";

export interface LogoPickerProps {
  brand: KitBrand;
  result: LogoResult;
  /** Saves the choice (the site and the plan pick it up). Optimistic: the tile switches at once. */
  onChoose?: (id: string) => void | Promise<void>;
  /** Fetches more options (the server appends to result.options). Omit to hide the button when none are left. */
  onMore?: () => Promise<LogoResult>;
}
export interface LogoPicker { update(result: LogoResult): void; destroy(): void }

const PAGE = 3;

// ───────────────────────────────────────────────────────────── fonts + exact text width
const loaded = new Set<string>();
function loadFont(family: string): Promise<void> {
  if (!loaded.has(family)) {
    loaded.add(family);
    document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href: googleFontsHref([family]) }));
  }
  const w = wordStyleFor(family).weight;
  return Promise.race([document.fonts.load(`${w} 100px "${family}"`).then(() => undefined), new Promise<void>((r) => setTimeout(r, 2500))]).catch(() => undefined);
}
let ctx: CanvasRenderingContext2D | null = null;
const measure: LockupOpts["measure"] = (text, font, weight, px) => {
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * px * 0.6;
  ctx.font = `${weight} ${px}px "${font}"`;
  const ws = wordStyleFor(font);
  return ctx.measureText(text).width + ws.tracking * px * Math.max(0, [...text].length - 1) + px * 0.04;
};

// ───────────────────────────────────────────────────────────── files
const opts = (b: KitBrand): LockupOpts => ({ name: b.name, palette: b.palette, font: b.fonts.display, measure });
const slugName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "logo";

function save(name: string, blob: Blob) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
/** PNG of an icon SVG (no text inside, so an <img> renders it exactly). */
function png(svg: string, size: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = Object.assign(document.createElement("canvas"), { width: size, height: size });
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0, size, size);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png");
    };
    img.onerror = () => reject(new Error("svg"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}
async function download(kind: "logo" | "dark" | "icon" | "favicon", o: LogoOption, b: KitBrand) {
  const base = slugName(b.name);
  const svgBlob = (s: string) => new Blob([s], { type: "image/svg+xml" });
  if (kind === "logo") return save(`${base}-logo.svg`, svgBlob(lockupSvg(o.svg, { ...opts(b), embedFont: true }).svg));
  if (kind === "dark") return save(`${base}-logo-dark.svg`, svgBlob(lockupSvg(o.svg, { ...opts(b), embedFont: true, dark: true }).svg));
  const icon = lockupSvg(o.svg, { ...opts(b), layout: "icon" }).svg;
  if (kind === "icon") return save(`${base}-icon-512.png`, await png(icon, 512));
  return save(`${base}-favicon-32.png`, await png(icon, 32));
}

// ───────────────────────────────────────────────────────────── view
function tile(o: LogoOption, b: KitBrand, chosen: boolean, n: number): string {
  const O = opts(b);
  const light = lockupSvg(o.svg, O).svg;
  const dark = lockupSvg(o.svg, { ...O, dark: true }).svg;
  const icon = lockupSvg(o.svg, { ...O, layout: "icon" }).svg;
  return `<li class="lp-tile${chosen ? " is-chosen" : ""}" data-id="${esc(o.id)}">
  <button class="lp-pick" type="button" aria-pressed="${chosen}" aria-label="Option ${n}${chosen ? ", chosen" : ""}">
    <span class="lp-light" style="background:${b.palette.bg}">${light}</span>
    <span class="lp-uses">
      <span class="lp-dark" style="background:${b.palette.ink}">${dark}</span>
      <span class="lp-icon" title="App icon">${icon}</span>
      <span class="lp-tab" title="Browser tab"><span class="lp-fav">${icon}</span><span class="lp-tabname">${esc(b.name)}</span></span>
    </span>
    <span class="lp-why">${esc(o.idea)}</span>
    <span class="lp-cta">${chosen ? "✓ Your logo" : "Use this one"}</span>
  </button>
</li>`;
}

export function mountLogoPicker(host: HTMLElement, props: LogoPickerProps): LogoPicker {
  let result = props.result;
  let page = 0;
  let busy = false;
  let error = "";
  const root = el<HTMLElement>(`<section class="lp" aria-label="Your logo"></section>`);
  host.append(root);

  const render = () => {
    const b = props.brand;
    const total = result.options.length;
    const start = Math.min(page * PAGE, Math.max(0, total - PAGE));
    const shown = result.options.slice(start, start + PAGE);
    const chosen = result.options.find((o) => o.id === result.chosen) ?? result.options[0];
    const canMore = start + PAGE < total || !!props.onMore;
    root.innerHTML = `
<header class="lp-head"><h3>Your logo</h3><p>Pick the one that feels like ${esc(b.name)}. You can change it any time; your website updates on its own.</p></header>
<ol class="lp-grid">${shown.map((o, i) => tile(o, b, o.id === chosen?.id, start + i + 1)).join("")}</ol>
<div class="lp-foot">
  ${canMore ? `<button class="lp-more" type="button"${busy ? " disabled" : ""}>${busy ? "Drawing 3 more…" : start + PAGE < total ? "Show 3 more" : "Draw 3 more"}</button>` : ""}
  ${page > 0 ? `<button class="lp-back" type="button">Back to the first ones</button>` : ""}
  ${error ? `<span class="lp-err" role="status">${esc(error)}</span>` : ""}
</div>
${chosen ? `<div class="lp-files"><span class="lp-files-t">Download your logo</span>
  <button type="button" data-dl="logo">Logo</button><button type="button" data-dl="dark">Logo for dark backgrounds</button>
  <button type="button" data-dl="icon">App icon</button><button type="button" data-dl="favicon">Browser tab icon</button></div>` : ""}
${result.fallback ? `<p class="lp-note">These are simple starter marks. Tap “Draw 3 more” for designs made for ${esc(b.name)}.</p>` : ""}`;
  };

  const onClick = async (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    const pick = t.closest<HTMLElement>(".lp-tile");
    if (pick && t.closest(".lp-pick")) {
      const id = pick.dataset.id!;
      if (id === result.chosen) return;
      const prev = result.chosen;
      result = { ...result, chosen: id };
      render();
      try {
        await props.onChoose?.(id);
      } catch {
        result = { ...result, chosen: prev };
        error = "That didn't save. Please try again.";
        render();
      }
      return;
    }
    if (t.closest(".lp-back")) { page = 0; render(); return; }
    if (t.closest(".lp-more")) {
      error = "";
      if ((page + 1) * PAGE < result.options.length) { page++; render(); return; }
      if (!props.onMore || busy) return;
      busy = true;
      render();
      try {
        const before = result.options.length;
        result = await props.onMore();
        if (result.options.length > before) page = Math.ceil(before / PAGE);
      } catch {
        error = "Couldn't draw more right now. Please try again in a minute.";
      }
      busy = false;
      render();
      return;
    }
    const dl = t.closest<HTMLElement>("[data-dl]");
    if (dl) {
      const o = result.options.find((x) => x.id === result.chosen) ?? result.options[0];
      if (o) await download(dl.dataset.dl as "logo", o, props.brand).catch(() => { error = "The download didn't work in this browser."; render(); });
    }
  };
  root.addEventListener("click", onClick);
  render();
  // re-render once the face has loaded so the names are measured and set in the real font
  void loadFont(props.brand.fonts.display).then(render);

  return {
    update(next) {
      result = next;
      render();
    },
    destroy() {
      root.removeEventListener("click", onClick);
      root.remove();
    },
  };
}
