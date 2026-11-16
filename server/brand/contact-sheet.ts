// WP2 dev tool · Contact sheet of the saved logo fixtures (every candidate: lockup light + dark, app icon at 64/32/16,
// lint verdict), rendered by local headless Chrome to .notes/next/shots/logos-<id>.png. Zero API spend.
//   node_modules/.bin/tsx server/brand/contact-sheet.ts [id…]
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lockupSvg } from "./compose.js";
import { loadFixtures } from "./draw.js";
import { googleFontsHref } from "./fonts.js";
import { fitSymbol, lintSymbol } from "./lint.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, "../../.notes/next/shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const want = process.argv.slice(2);
mkdirSync(SHOTS, { recursive: true });
for (const fx of loadFixtures().filter((f) => !want.length || want.includes(f.id))) {
  const b = fx.brand;
  const cards = fx.candidates.map((c, i) => {
    const l = lintSymbol(String(c.svg ?? ""), b.palette);
    const o = { name: b.name, palette: b.palette, font: b.fonts.display };
    const sym = fitSymbol(l);
    const light = lockupSvg(sym, o).svg;
    const dark = lockupSvg(sym, { ...o, dark: true }).svg;
    const icon = lockupSvg(sym, { ...o, layout: "icon" }).svg;
    const stacked = lockupSvg(sym, { ...o, layout: "stacked" }).svg;
    return `<div class="card${l.ok ? "" : " bad"}"><div class="n">${i + 1} · ${esc(c.family)} ${l.ok ? "✓" : "✗ " + esc(l.errors.join("; "))}</div>
      <div class="row light">${light}</div><div class="row dark" style="background:${b.palette.ink}">${dark}</div>
      <div class="row icons"><span class="st">${stacked}</span><span class="i64">${icon}</span><span class="i32">${icon}</span><span class="i16">${icon}</span></div>
      <div class="idea">${esc(c.idea)}</div></div>`;
  });
  const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${googleFontsHref([b.fonts.display, "Inter"])}">
<style>body{margin:0;padding:28px;background:#E9E7E2;font:13px Inter,system-ui;color:#222;width:1344px}
h1{font:600 20px Inter;margin:0 0 4px}.sub{color:#666;margin:0 0 18px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{background:${b.palette.bg};border-radius:12px;padding:14px;overflow:hidden}
.bad{opacity:.45}.n{font-size:11px;color:#555;margin-bottom:8px;height:28px;overflow:hidden}
.row{display:flex;align-items:center;justify-content:center;height:96px;border-radius:8px}.row svg{max-width:100%;height:56px;width:auto}
.dark{margin-top:8px}.dark svg{height:40px}.icons{gap:18px;height:96px}.st svg{height:84px}.i64 svg{width:64px;height:64px}.i32 svg{width:32px;height:32px}.i16 svg{width:16px;height:16px}
.idea{font-size:12px;color:#444;margin-top:6px;min-height:32px}</style>
<h1>${esc(b.name)} — ${esc(fx.model)} · prompt v${fx.promptVersion} · $${fx.usd.toFixed(3)} · ${fx.options.length}/${fx.candidates.length} pass</h1><p class="sub">${esc(fx.idea)}</p>
<div class="grid">${cards.join("")}</div>`;
  const tmp = join(process.env.SHEET_TMP || tmpdir(), `logos-${fx.id}.html`);
  writeFileSync(tmp, html);
  const out = join(SHOTS, `logos-${fx.id}.png`);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--screenshot=${out}`, "--window-size=1400,1000", "--virtual-time-budget=6000", "file://" + tmp], { stdio: "ignore" });
  console.log(out);
}
