// Bespoke site: allow-list sanitizer + quality gate for the HTML fragment the design model writes.
// Contract: .notes/site2/output-contract.md. The fragment is parsed with parse5 (the browser's own parsing rules),
// rebuilt from an allow-list (never "cleaned" in place) and serialized by us, so nothing the model writes can run.
//
// Two output modes:
//   "store" → canonical fragment kept in the DB: photos stay `ld-photo:<id>`, hooks stay `data-ld=…`. Re-sanitizable.
//   "page"  → wired for one page: photo URLs, reserve links, the waitlist form (action, honeypot, thanks line), data-hero.
import { parseFragment, type DefaultTreeAdapterTypes as P } from "parse5";
import { PAY_TALK } from "./validate.js";

// ───────────────────────────────────────────────────────────── types

export interface SanitizePhoto {
  /** Served URL in "page" mode, e.g. /s/<slug>/photo/1. */
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

/** What the honesty check may accept (only at generation time; the copy is not re-judged at every render). */
export interface HonestyRules {
  /** Texts whose numbers are allowed on the page (price, offer, sourced stats, the founder's own words…). */
  numberSources: string[];
  /** Sourced stats: when a value is shown, its source link must be on the page. */
  stats: Array<{ value: string; sourceUrl: string }>;
  /** The founder's own words (offer, idea, copy without stats): a stat value that also appears here is not a stat. */
  plain?: string[];
}

export interface SanitizeCtx {
  mode: "store" | "page";
  /** Model id ("p1") → photo. Unknown ids are removed. */
  photos: Record<string, SanitizePhoto>;
  /** External links allowed: exact stat source URLs, or "any-https" for an already-vetted stored fragment. */
  links: string[] | "any-https";
  /** Reserve buttons are kept only when the page can take a reservation. */
  reserveEnabled: boolean;
  fonts: { display: string; text: string };
  /** "page" mode wiring. */
  leadAction?: string;
  thanks?: string;
  emailLabel?: string;
  /** "page" mode: one line placed under the hero's reserve button ("Pay with Bitcoin Cash · instant · no account"). */
  reserveNote?: string;
  /** Present → run the invented-claims guard. */
  honesty?: HonestyRules;
}

export interface Sanitized {
  css: string;
  body: string;
  /** REQUIRED checks that failed: any → the caller falls back to the 3 standard designs. */
  problems: string[];
  /** Logged, still published. */
  warnings: string[];
  counts: { h1: number; header: number; main: number; footer: number; reserve: number; reserveTop: number; forms: number; photos: number; svg: number; bytes: number };
  /** Model id of the first photo (og:image). */
  heroPhoto?: string;
}

// ───────────────────────────────────────────────────────────── allow-lists

const HTML_OK = new Set([
  "header", "main", "footer", "section", "article", "aside", "nav", "div", "figure", "figcaption",
  "h1", "h2", "h3", "h4", "p", "span", "strong", "b", "em", "i", "s", "small", "br", "hr", "blockquote", "sup", "sub", "mark",
  "ul", "ol", "li", "dl", "dt", "dd", "details", "summary",
  "a", "img",
]);
const FORM_ONLY = new Set(["label", "input", "button"]);
const SVG_SHAPES = new Set(["g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon"]);
/** Dropped together with everything inside them. */
const DROP = new Set([
  "script", "link", "meta", "base", "iframe", "frame", "frameset", "object", "embed", "applet", "param", "video", "audio", "source",
  "track", "picture", "canvas", "template", "noscript", "noembed", "noframes", "math", "foreignobject", "use", "image", "textarea", "select",
  "option", "optgroup", "title", "head", "portal", "dialog", "slot", "xmp", "plaintext", "datalist", "output", "fencedframe", "animate",
  "animatemotion", "animatetransform", "set", "filter", "pattern", "mask", "clippath", "lineargradient", "radialgradient", "defs", "symbol",
  "marker", "text", "textpath", "tspan", "style-sheet",
]);
const VOID = new Set(["br", "hr", "img", "input"]);
const MAX_SVG = 3;
const MAX_SVG_BYTES = 1500;
const MAX_HTML = 70_000;
const MAX_CSS = 16_000;

const CLASS_RE = /^[A-Za-z][\w-]{0,40}$/;
/** Class names our own chrome uses: a model element must never pick up the fixed sheet/bar styling. */
const RESERVED_CLASS = /^(sheet|bar|hp|wl-ok|wl-err|lock|rv|in|js|done|on|hide)$|^(sheet|bar|sh|ld)-/;
const ID_RE = /^[a-z][a-z0-9_-]{0,40}$/;
const RESERVED_ID = /^(reserve|sh-t|ld-.*|wl-.*)$/;
const ROLES = new Set(["list", "listitem", "img", "note", "presentation"]);
const PAINT = /^(none|currentcolor|transparent|#[0-9a-f]{3,8}|var\(--[\w-]{1,40}\))$/i;
const GEOM = /^[\w\s.,+\-()%#]{0,1200}$/;
const NUM = /^-?\d{1,5}(\.\d{1,4})?$/;

// ───────────────────────────────────────────────────────────── tree

interface El { tag: string; attrs: Array<[string, string]>; kids: Node[]; svg?: boolean; hook?: "reserve" | "waitlist" | "photo" | "stat"; photoId?: string }
type Node = El | string;

const isEl = (n: Node): n is El => typeof n !== "string";
const attr = (e: P.Element, name: string) => e.attrs.find((a) => a.name.toLowerCase() === name)?.value;
const set = (e: El, name: string, value: string) => {
  const i = e.attrs.findIndex(([k]) => k === name);
  if (i >= 0) e.attrs[i] = [name, value];
  else e.attrs.push([name, value]);
};
const get = (e: El, name: string) => e.attrs.find(([k]) => k === name)?.[1];
const kidsOf = (n: P.Node): P.ChildNode[] => ("childNodes" in n ? (n.childNodes as P.ChildNode[]) : []);
const tagOf = (n: P.Element) => n.tagName.toLowerCase();

function* walkP(n: P.Node): Generator<P.Element> {
  for (const k of kidsOf(n)) {
    if ("tagName" in k) {
      yield k;
      if (k.nodeName === "template") continue;
      yield* walkP(k);
    }
  }
}
function* walkEl(nodes: Node[]): Generator<El> {
  for (const n of nodes) if (isEl(n)) { yield n; yield* walkEl(n.kids); }
}

const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function serialize(nodes: Node[]): string {
  let out = "";
  for (const n of nodes) {
    if (!isEl(n)) { out += escText(n); continue; }
    const a = n.attrs.map(([k, v]) => (v === "" && /^(data-reserve|data-lead|data-hero|required|hidden|reversed|open)$/.test(k) ? ` ${k}` : ` ${k}="${escAttr(v)}"`)).join("");
    if (VOID.has(n.tag)) out += `<${n.tag}${a}>`;
    else out += `<${n.tag}${a}>${serialize(n.kids)}</${n.tag}>`;
  }
  return out;
}

function textOf(nodes: Node[], alts: boolean): string {
  let t = "";
  for (const n of nodes) {
    if (!isEl(n)) t += n;
    else {
      if (alts && n.tag === "img") t += " " + (get(n, "alt") ?? "") + " ";
      t += " " + textOf(n.kids, alts) + " ";
    }
  }
  return t;
}

// ───────────────────────────────────────────────────────────── CSS

const GENERIC_FONTS = new Set([
  "serif", "sans-serif", "monospace", "cursive", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "-apple-system",
  "blinkmacsystemfont", "segoe ui", "roboto", "helvetica neue", "helvetica", "arial", "georgia", "times new roman", "times", "menlo",
  "consolas", "inherit", "initial", "unset", "revert",
]);
/** Selectors aimed at our own chrome (sheet, sticky bar, honeypot, credits, wiring attributes). */
const RESERVED_SEL = /\.(?:sheet|bar|hp|wl-ok|wl-err|lock)(?![\w-])|\.(?:sheet|bar|sh|ld)-|\[\s*data-(?:reserve|lead|bar|close|copy|hero|ld)|#(?:reserve|sh-t|ld-[\w-]*)(?![\w-])|\[\s*hidden/i;
const BAD_VALUE = /url\s*\(|image-set|expression|javascript:|vbscript:|data:|@import|-moz-binding|behavior|<\/|\bsrc\s*\(|\bimage\s*\(|element\s*\(|cross-fade|paint\s*\(/i;

/** Index of the char that closes the block opened at `open` (a "{"), skipping strings; -1 if unbalanced. */
function closeOf(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") { i = skipStr(s, i); continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
}
function skipStr(s: string, i: number): number {
  const q = s[i];
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === "\\") { j++; continue; }
    if (s[j] === q || s[j] === "\n") return j;
  }
  return s.length;
}
/** Splits on `sep` at depth 0 (outside strings, (), []). */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") { i = skipStr(s, i); continue; }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
    else if (c === sep && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out;
}

function cleanFamilies(v: string, fonts: SanitizeCtx["fonts"]): string {
  const brand = new Set([fonts.display.toLowerCase(), fonts.text.toLowerCase()]);
  const out: string[] = [];
  for (const raw of splitTop(v, ",")) {
    const f = raw.trim();
    const bare = f.replace(/^["']|["']$/g, "").trim().toLowerCase();
    const ok = /^var\(--[\w-]{1,40}\)$/.test(f) || brand.has(bare) || GENERIC_FONTS.has(bare);
    const keep = ok ? f : `"${fonts.text}"`;
    if (!out.includes(keep)) out.push(keep);
  }
  return out.join(",");
}

function cleanDecls(inner: string, ctx: SanitizeCtx, warn: (w: string) => void): string {
  // Nested rules inside a style rule are dropped (CSS nesting is not part of the contract).
  let s = inner;
  for (let guard = 0; s.includes("{") && guard < 50; guard++) s = s.replace(/[^;{}]*\{[^{}]*\}/g, "");
  const out: string[] = [];
  for (const d of splitTop(s, ";")) {
    const i = d.indexOf(":");
    if (i < 0) continue;
    const prop = d.slice(0, i).trim().toLowerCase();
    let value = d.slice(i + 1).trim().replace(/\s+/g, " ");
    if (!value || !/^(--[\w-]{1,60}|-?[a-z][a-z-]{0,40})$/.test(prop)) continue;
    if (/^(behavior|-ms-behavior|-moz-binding|src)$/.test(prop) || BAD_VALUE.test(value) || /[{}<]/.test(value.replace(/["'][^"']*["']/g, ""))) { warn(`css: dropped ${prop}`); continue; }
    if (value.includes("\\") && !(prop === "content" && /^(?:[^\\]|\\[0-9a-f]{1,6} ?)*$/i.test(value))) { warn(`css: dropped escaped ${prop}`); continue; }
    if (prop === "position" && /fixed/i.test(value)) { warn("css: dropped position:fixed"); continue; }
    if (prop === "content" && value.length > 40) { warn("css: dropped long content"); continue; }
    if (prop === "font-family") value = cleanFamilies(value, ctx.fonts);
    out.push(`${prop}:${value}`);
  }
  return out.join(";");
}

function cleanSelectors(prelude: string): string {
  const out: string[] = [];
  for (const raw of splitTop(prelude, ",")) {
    const sel = raw.trim().replace(/\s+/g, " ");
    if (!sel || sel.length > 300) continue;
    if (/[{}<;\\@]/.test(sel) || /url|expression|javascript/i.test(sel) || RESERVED_SEL.test(sel)) continue;
    // :is(#a, b) would give every match id specificity and could restyle our sheet.
    if (sel.includes("#") && /:(is|where|not|has|matches)\(/i.test(sel)) continue;
    out.push(sel);
  }
  return out.join(",");
}

/** Sanitizes the model's stylesheet. Returns the rebuilt CSS (one rule per line). */
export function sanitizeCss(css: string, ctx: SanitizeCtx): { css: string; keyframes: number; warnings: string[] } {
  const warnings: string[] = [];
  const warn = (w: string) => { if (warnings.length < 40) warnings.push(w); };
  let keyframes = 0;
  const src = css.replace(/\/\*[\s\S]*?(\*\/|$)/g, "").replace(/<!--|-->/g, "");

  const rules = (s: string, depth: number): string[] => {
    const out: string[] = [];
    let i = 0;
    while (i < s.length) {
      // Find the next "{" or ";" at depth 0.
      let j = i;
      let paren = 0;
      for (; j < s.length; j++) {
        const c = s[j];
        if (c === '"' || c === "'") { j = skipStr(s, j); continue; }
        if (c === "(") paren++;
        else if (c === ")") paren = Math.max(0, paren - 1);
        else if (paren === 0 && (c === "{" || c === ";" || c === "}")) break;
      }
      if (j >= s.length) break;
      const prelude = s.slice(i, j).trim();
      if (s[j] === ";" || s[j] === "}") {
        if (prelude) warn(`css: dropped statement ${prelude.slice(0, 30)}`);
        i = j + 1;
        continue;
      }
      const k = closeOf(s, j);
      if (k < 0) { warn("css: unbalanced braces"); break; }
      const inner = s.slice(j + 1, k);
      i = k + 1;
      if (prelude.startsWith("@")) {
        const name = (/^@([\w-]+)/.exec(prelude)?.[1] ?? "").toLowerCase();
        if (/^(media|supports|container)$/.test(name) && depth < 3) {
          if (!/^@[\w-]+[\w\s\-():,.<>=/'"%]*$/.test(prelude) || BAD_VALUE.test(prelude)) { warn(`css: dropped @${name}`); continue; }
          const body = rules(inner, depth + 1).join("");
          if (body) out.push(`${prelude.replace(/\s+/g, " ")}{${body}}`);
        } else if (/^(-webkit-)?keyframes$/.test(name)) {
          const kfName = prelude.replace(/^@[\w-]+\s*/, "");
          if (++keyframes > 2 || !/^[A-Za-z][\w-]{0,40}$/.test(kfName)) { warn("css: dropped keyframes"); continue; }
          const frames: string[] = [];
          let p = 0;
          while (p < inner.length) {
            const o = inner.indexOf("{", p);
            if (o < 0) break;
            const c = closeOf(inner, o);
            if (c < 0) break;
            const sel = inner.slice(p, o).trim().toLowerCase();
            p = c + 1;
            if (!/^(from|to|\d{1,3}(\.\d+)?%)(\s*,\s*(from|to|\d{1,3}(\.\d+)?%))*$/.test(sel)) continue;
            const d = cleanDecls(inner.slice(o + 1, c), ctx, warn);
            if (d) frames.push(`${sel}{${d}}`);
          }
          if (frames.length) out.push(`@keyframes ${kfName}{${frames.join("")}}`);
        } else warn(`css: dropped @${name}`);
        continue;
      }
      const sel = cleanSelectors(prelude);
      if (!sel) continue;
      const d = cleanDecls(inner, ctx, warn);
      if (d) out.push(`${sel}{${d}}` + (depth === 0 ? "\n" : ""));
    }
    return out;
  };
  let out = rules(src, 0).join("").trim();
  out = out.replace(/<\//g, "< /");
  return { css: out, keyframes, warnings };
}

// ───────────────────────────────────────────────────────────── honesty (invented claims)

const CLAIM_WORDS = /★|☆|\b(reviews?|rated|ratings?|testimonials?|customers say|clients say|years of experience|since (19|20)\d\d|award[- ]?winning|awards?|trusted by|as seen in|five[- ]star|5[- ]star|rese[ñn]as?|opiniones|valoraci[oó]n(es)?|testimonios?|a[ñn]os de experiencia|desde (19|20)\d\d|premiad[oa]s?|premios?)\b/i;

/** Every way a number token can be read ("1,200" → 1200 or 1.2), as canonical strings. */
function readings(tok: string): string[] {
  const out = new Set<string>();
  const add = (v: number) => { if (Number.isFinite(v)) out.add(String(Math.round(v * 100) / 100)); };
  if (!/[.,]/.test(tok)) add(Number(tok));
  else {
    add(Number(tok.replace(/[.,]/g, "")));
    const last = Math.max(tok.lastIndexOf("."), tok.lastIndexOf(","));
    add(Number(tok.slice(0, last).replace(/[.,]/g, "") + "." + tok.slice(last + 1)));
  }
  return [...out];
}
const numbersIn = (s: string) => s.match(/\d+(?:[.,]\d+)*/g) ?? [];

export function inventedClaims(text: string, rules: HonestyRules): string[] {
  const found: string[] = [];
  const allowed = new Set<string>(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  for (const s of rules.numberSources) for (const t of numbersIn(s)) for (const r of readings(t)) allowed.add(r);
  for (const t of numbersIn(text)) if (!readings(t).some((r) => allowed.has(r))) found.push(`number "${t}" is not in the brief`);
  const w = CLAIM_WORDS.exec(text);
  if (w) found.push(`claim word "${w[0]}"`);
  return [...new Set(found)].slice(0, 8);
}

// ───────────────────────────────────────────────────────────── the sanitizer

interface State {
  ctx: SanitizeCtx;
  ids: Set<string>; // valid ids present in the fragment (for #links)
  usedIds: Set<string>;
  css: string[];
  warnings: string[];
  svg: number;
  sections: number;
  zone: "header" | "first" | "";
  form: { emailId: string; label: boolean; email: boolean } | null;
  formsDone: number;
  reserve: number;
  reserveTop: number;
  statLinks: Set<string>;
  usedPhotos: string[];
  /** Photo ids the model's HTML refers to anywhere (a repeated photo is swapped for one it never used). */
  refs: Set<string>;
}

const warnOnce = (st: State, w: string) => { if (!st.warnings.includes(w) && st.warnings.length < 60) st.warnings.push(w); };

function globalAttrs(st: State, src: P.Element, el: El) {
  for (const { name: rawName, value } of src.attrs) {
    const name = rawName.toLowerCase();
    if (name === "class") {
      const toks = value.split(/\s+/).filter((c) => CLASS_RE.test(c) && !RESERVED_CLASS.test(c.toLowerCase())).slice(0, 8);
      if (toks.length) el.attrs.push(["class", toks.join(" ")]);
    } else if (name === "id") {
      if (ID_RE.test(value) && !RESERVED_ID.test(value) && !st.usedIds.has(value)) { st.usedIds.add(value); el.attrs.push(["id", value]); }
    } else if (name === "aria-label" || name === "title") {
      if (value.length <= 200) el.attrs.push([name, value]);
    } else if (name === "aria-hidden") {
      if (value === "true") el.attrs.push([name, "true"]);
    } else if (name === "aria-labelledby") {
      if (/^[a-z][\w-]{0,40}( [a-z][\w-]{0,40}){0,3}$/.test(value)) el.attrs.push([name, value]);
    } else if (name === "role") {
      if (ROLES.has(value)) el.attrs.push([name, value]);
    } else if (name === "lang") {
      if (/^[a-z]{2}(-[A-Za-z]{2})?$/.test(value)) el.attrs.push([name, value]);
    }
  }
}

function svgAttrs(src: P.Element, el: El, root: boolean) {
  for (const { name: rawName, value } of src.attrs) {
    const name = rawName.toLowerCase();
    const v = value.trim();
    if (/url|javascript|expression/i.test(v)) continue;
    if (name === "class" || name === "aria-hidden") { if (name === "aria-hidden" ? v === "true" : /^[\w -]{1,80}$/.test(v)) el.attrs.push([rawName, v]); continue; }
    if (name === "fill" || name === "stroke") { if (PAINT.test(v)) el.attrs.push([name, v]); continue; }
    if (root && (name === "viewbox" || name === "width" || name === "height" || name === "focusable")) {
      if (name === "viewbox" ? /^[\d\s.,-]{3,40}$/.test(v) : name === "focusable" ? v === "false" : NUM.test(v)) el.attrs.push([name === "viewbox" ? "viewBox" : name, v]);
      continue;
    }
    if (/^(d|cx|cy|r|rx|ry|x|y|x1|y1|x2|y2|width|height|points|transform)$/.test(name)) { if (GEOM.test(v)) el.attrs.push([name, v]); continue; }
    if (/^(stroke-width|opacity|fill-opacity|stroke-opacity)$/.test(name)) { if (NUM.test(v)) el.attrs.push([name, v]); continue; }
    if (/^(stroke-linecap|stroke-linejoin|fill-rule)$/.test(name)) { if (/^[a-z-]{1,12}$/.test(v)) el.attrs.push([name, v]); continue; }
  }
  if (root) el.attrs.push(["aria-hidden", "true"]);
}

function convert(st: State, nodes: P.ChildNode[], inSvg: boolean): Node[] {
  const out: Node[] = [];
  for (const n of nodes) {
    if (n.nodeName === "#text") { if (!inSvg) out.push((n as P.TextNode).value); continue; }
    if (!("tagName" in n)) continue; // comments, doctype
    const tag = tagOf(n);
    if (tag === "style") {
      const css = kidsOf(n).map((k) => (k.nodeName === "#text" ? (k as P.TextNode).value : "")).join("");
      st.css.push(css);
      continue;
    }
    if (DROP.has(tag)) { warnOnce(st, `dropped <${tag}>`); continue; }

    if (inSvg) {
      if (!SVG_SHAPES.has(tag)) { warnOnce(st, `dropped svg <${tag}>`); continue; }
      const el: El = { tag, attrs: [], kids: [], svg: true };
      svgAttrs(n, el, false);
      el.kids = convert(st, kidsOf(n), true);
      out.push(el);
      continue;
    }

    if (tag === "svg") {
      if (st.svg >= MAX_SVG) { warnOnce(st, "dropped extra svg"); continue; }
      const el: El = { tag: "svg", attrs: [], kids: [], svg: true };
      svgAttrs(n, el, true);
      el.kids = convert(st, kidsOf(n), true);
      if (serialize([el]).length > MAX_SVG_BYTES) { warnOnce(st, "dropped large svg"); continue; }
      st.svg++;
      out.push(el);
      continue;
    }

    if (tag === "form") {
      const isWaitlist = attr(n, "data-ld") === "waitlist" || (st.formsDone === 0 && [...walkP(n)].some((e) => tagOf(e) === "input" && (attr(e, "type") === "email" || attr(e, "name") === "email")));
      if (!isWaitlist || st.formsDone > 0 || st.form) {
        warnOnce(st, "unwrapped extra form");
        out.push(...convert(st, kidsOf(n), false));
        continue;
      }
      const email = [...walkP(n)].find((e) => tagOf(e) === "input" && (attr(e, "type") === "email" || attr(e, "name") === "email"));
      const wanted = email ? attr(email, "id") ?? "" : "";
      const emailId = ID_RE.test(wanted) && !RESERVED_ID.test(wanted) && !st.usedIds.has(wanted) ? wanted : "ld-email";
      st.usedIds.add(emailId);
      const el: El = { tag: "form", attrs: [], kids: [], hook: "waitlist" };
      globalAttrs(st, n, el);
      el.attrs = el.attrs.filter(([k]) => k !== "id");
      st.form = { emailId, label: false, email: false };
      el.kids = convert(st, kidsOf(n), false);
      if (!st.form.label) el.kids.unshift({ tag: "label", attrs: [["class", "sr"], ["for", emailId]], kids: [st.ctx.emailLabel ?? "Your email"] });
      if (st.form.email) st.formsDone++;
      else warnOnce(st, "form without an email field");
      st.form = null;
      out.push(el);
      continue;
    }

    if (FORM_ONLY.has(tag)) {
      if (!st.form) { if (tag !== "input") out.push(...convert(st, kidsOf(n), false)); continue; }
      if (tag === "input") {
        const isEmail = attr(n, "type") === "email" || attr(n, "name") === "email";
        if (!isEmail || st.form.email) continue;
        st.form.email = true;
        const ph = (attr(n, "placeholder") ?? "").slice(0, 60);
        const el: El = { tag: "input", attrs: [], kids: [] };
        globalAttrs(st, n, el);
        el.attrs = el.attrs.filter(([k]) => k === "class" || k === "aria-label");
        el.attrs.unshift(["id", st.form.emailId], ["type", "email"], ["name", "email"]);
        el.attrs.push(["required", ""], ["maxlength", "160"], ["autocomplete", "email"]);
        if (ph) el.attrs.push(["placeholder", ph]);
        out.push(el);
        continue;
      }
      const el: El = { tag, attrs: [], kids: [] };
      globalAttrs(st, n, el);
      el.attrs = el.attrs.filter(([k]) => k !== "id");
      if (tag === "label") { st.form.label = true; el.attrs.push(["for", st.form.emailId]); }
      if (tag === "button") el.attrs.push(["type", "submit"]);
      el.kids = convert(st, kidsOf(n), false);
      out.push(el);
      continue;
    }

    if (!HTML_OK.has(tag)) {
      warnOnce(st, `unwrapped <${tag}>`);
      out.push(...convert(st, kidsOf(n), false));
      continue;
    }

    if (tag === "img") {
      const m = /^ld-photo:([A-Za-z0-9_-]{1,20})$/.exec((attr(n, "src") ?? "").trim());
      let ph = m ? st.ctx.photos[m[1]!] : undefined;
      if (!m || !ph) { warnOnce(st, `dropped image ${(attr(n, "src") ?? "").slice(0, 40)}`); out.push({ tag: "#dropped-img", attrs: [], kids: [] }); continue; }
      let id = m[1]!;
      let swapped = false;
      if (st.usedPhotos.includes(id)) {
        // The same photo twice reads as a mistake: use a photo the page never used instead, if there is one.
        const spare = Object.keys(st.ctx.photos).find((k) => !st.refs.has(k) && !st.usedPhotos.includes(k));
        warnOnce(st, spare ? `photo ${id} used twice (second use swapped for ${spare})` : `photo ${id} used twice`);
        if (spare) { id = spare; ph = st.ctx.photos[spare]!; swapped = true; }
      }
      st.usedPhotos.push(id);
      const el: El = { tag: "img", attrs: [], kids: [], hook: "photo", photoId: id };
      globalAttrs(st, n, el);
      const int = (v: string | undefined) => (v && /^\d{1,4}$/.test(v) && +v >= 1 && +v <= 4000 ? v : "");
      const alt = (swapped ? "" : (attr(n, "alt") ?? "").trim().slice(0, 160)) || ph.alt || "Photo";
      el.attrs.push(["src", `ld-photo:${id}`], ["alt", alt]);
      const w = (swapped ? "" : int(attr(n, "width"))) || (ph.width ? String(ph.width) : "");
      const h = (swapped ? "" : int(attr(n, "height"))) || (ph.height ? String(ph.height) : "");
      if (w && h) el.attrs.push(["width", w], ["height", h]);
      out.push(el);
      continue;
    }

    const el: El = { tag, attrs: [], kids: [] };
    globalAttrs(st, n, el);
    if (tag === "ol") {
      const start = attr(n, "start");
      if (start && /^\d{1,3}$/.test(start)) el.attrs.push(["start", start]);
      if (attr(n, "reversed") !== undefined) el.attrs.push(["reversed", ""]);
    }
    if (tag === "details" && attr(n, "open") !== undefined) el.attrs.push(["open", ""]);

    if (tag === "a") {
      const href = (attr(n, "href") ?? "").trim();
      const ld = attr(n, "data-ld");
      if (ld === "reserve" || href === "#reserve") {
        if (!st.ctx.reserveEnabled) { warnOnce(st, "reserve buttons removed (no reservations)"); continue; }
        el.hook = "reserve";
        el.attrs.push(["href", "#reserve"]);
        st.reserve++;
        if (st.zone) st.reserveTop++;
      } else if (href.startsWith("#")) {
        const frag = href.slice(1);
        el.attrs.push(["href", frag === "top" || st.ids.has(frag) ? href : "#top"]);
      } else if (/^https:\/\/[^\s"'<>\\]+$/i.test(href) && (st.ctx.links === "any-https" || st.ctx.links.includes(href))) {
        el.hook = "stat";
        st.statLinks.add(href);
        el.attrs.push(["href", href], ["rel", "noopener nofollow"], ["target", "_blank"]);
      } else {
        if (href) warnOnce(st, `unwrapped link ${href.slice(0, 60)}`);
        out.push(...convert(st, kidsOf(n), false));
        continue;
      }
    }

    const prevZone = st.zone;
    if (tag === "header" && !prevZone) st.zone = "header";
    if (tag === "section" && st.sections++ === 0) st.zone = "first";
    el.kids = convert(st, kidsOf(n), false);
    st.zone = prevZone;

    if (tag === "figure") {
      const hadDropped = el.kids.some((k) => isEl(k) && k.tag === "#dropped-img");
      const hasImg = [...walkEl(el.kids)].some((k) => k.tag === "img");
      if (hadDropped && !hasImg) continue;
    }
    out.push(el);
  }
  return out;
}

/** Removes leftover "#dropped-img" markers at any depth. */
function prune(nodes: Node[]): Node[] {
  return nodes.filter((k) => !isEl(k) || k.tag !== "#dropped-img").map((k) => (isEl(k) ? ((k.kids = prune(k.kids)), k) : k));
}

/** Rebuilds the fragment from the allow-list and runs the REQUIRED checks. Never throws. */
export function sanitize(html: string, ctx: SanitizeCtx): Sanitized {
  const problems: string[] = [];
  let frag: P.DocumentFragment;
  try {
    frag = parseFragment(String(html ?? ""));
  } catch {
    frag = parseFragment("");
    problems.push("could not parse the page");
  }
  const ids = new Set<string>();
  for (const e of walkP(frag)) {
    const id = attr(e, "id");
    if (id && ID_RE.test(id) && !RESERVED_ID.test(id)) ids.add(id);
  }
  const st: State = { ctx, ids, usedIds: new Set(), css: [], warnings: [], svg: 0, sections: 0, zone: "", form: null, formsDone: 0, reserve: 0, reserveTop: 0, statLinks: new Set(), usedPhotos: [], refs: new Set([...html.matchAll(/ld-photo:([A-Za-z0-9_-]{1,20})/g)].map((m) => m[1]!)) };
  let tree = prune(convert(st, kidsOf(frag), false));
  // Whitespace-only text at the top level is noise.
  tree = tree.filter((n) => isEl(n) || n.trim());

  const all = [...walkEl(tree)];
  const count = (t: string) => all.filter((e) => e.tag === t).length;
  const counts = { h1: count("h1"), header: count("header"), main: count("main"), footer: count("footer"), reserve: st.reserve, reserveTop: st.reserveTop, forms: st.formsDone, photos: st.usedPhotos.length, svg: st.svg, bytes: 0 };

  const cssOut = sanitizeCss(st.css.join("\n"), ctx);
  st.warnings.push(...cssOut.warnings.slice(0, 20));

  // ── page wiring
  if (ctx.mode === "page") {
    let n = 0;
    for (const e of all) {
      if (e.hook === "photo" && e.photoId) {
        const ph = ctx.photos[e.photoId]!;
        set(e, "src", ph.url);
        e.attrs.push(["decoding", "async"]);
        if (n++ >= 2) e.attrs.push(["loading", "lazy"]);
      } else if (e.hook === "reserve") {
        e.attrs.push(["data-reserve", ""]);
      } else if (e.hook === "waitlist") {
        e.attrs.push(["method", "post"], ["action", ctx.leadAction ?? ""], ["data-lead", ""]);
        e.kids.push({ tag: "input", attrs: [["type", "text"], ["name", "website"], ["tabindex", "-1"], ["autocomplete", "off"], ["class", "hp"], ["aria-hidden", "true"]], kids: [] });
        e.kids.push({ tag: "p", attrs: [["class", "wl-ok"], ["role", "status"], ["hidden", ""]], kids: [ctx.thanks ?? "You're on the list."] });
      }
    }
    // The sticky bar hides while the hero is on screen: the hero is the section holding the h1 (or the header).
    const h1Holder = (nodes: Node[], stack: El[]): El | null => {
      for (const k of nodes) {
        if (!isEl(k)) continue;
        if (k.tag === "h1") return [...stack].reverse().find((s) => s.tag === "section") ?? stack.find((s) => s.tag === "header") ?? stack[0] ?? null;
        const r = h1Holder(k.kids, [...stack, k]);
        if (r) return r;
      }
      return null;
    };
    const hero = h1Holder(tree, []) ?? all.find((e) => e.tag === "section") ?? null;
    if (hero) hero.attrs.push(["data-hero", ""]);
    // The payment note goes under the hero's reserve button: after its button row, or right after the button.
    if (hero && ctx.reserveNote) {
      const find = (el: El, stack: El[]): El[] | null => {
        for (const k of el.kids) {
          if (!isEl(k)) continue;
          if (k.hook === "reserve") return [...stack, el, k];
          const r = find(k, [...stack, el]);
          if (r) return r;
        }
        return null;
      };
      const path = find(hero, []);
      if (path && path.length >= 2) {
        const btn = path[path.length - 1]!, parent = path[path.length - 2]!, grand = path[path.length - 3];
        const note: El = { tag: "p", attrs: [["class", "ld-note"]], kids: [ctx.reserveNote] };
        const isRow = parent !== hero && parent.kids.every((k) => !isEl(k) || /^(a|button|span|small|b|strong|em|s|del)$/.test(k.tag));
        if (isRow && grand) grand.kids.splice(grand.kids.indexOf(parent) + 1, 0, note);
        else parent.kids.splice(parent.kids.indexOf(btn) + 1, 0, note);
      }
    }
  } else {
    for (const e of all) {
      if (e.hook === "reserve") e.attrs.push(["data-ld", "reserve"]);
      else if (e.hook === "waitlist") e.attrs.push(["data-ld", "waitlist"]);
    }
  }

  const body = serialize(tree);
  counts.bytes = body.length + cssOut.css.length;

  // ── REQUIRED checks
  if (counts.h1 !== 1) problems.push(`needs exactly one main heading (found ${counts.h1})`);
  if (!counts.header) problems.push("no <header>");
  if (counts.main !== 1) problems.push(`needs one <main> (found ${counts.main})`);
  if (!counts.footer) problems.push("no <footer>");
  if (counts.forms !== 1) problems.push("no email sign-up form");
  if (ctx.reserveEnabled) {
    if (counts.reserve < 2) problems.push(`only ${counts.reserve} reserve button(s), needs 2`);
    if (counts.reserveTop < 1) problems.push("no reserve button in the header or the first section");
  }
  if (!ctx.reserveEnabled) {
    // No reservations: the page may not say you can pay (the prompt asks for this; the code makes sure).
    const pay = textOf(tree, false).replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).find((t) => PAY_TALK.test(t));
    if (pay) problems.push(`talks about paying but reservations are off ("${pay.trim().slice(0, 60)}")`);
  }
  const nPhotos = Object.keys(ctx.photos).length;
  const distinct = new Set(st.usedPhotos).size;
  if (distinct < Math.min(3, nPhotos)) problems.push(`uses ${distinct} photo(s), needs ${Math.min(3, nPhotos)}`);
  if (!cssOut.css || cssOut.css.length < 400) problems.push("no stylesheet");
  if (cssOut.css.length > MAX_CSS) problems.push(`stylesheet too big (${cssOut.css.length} bytes)`);
  if (counts.bytes > MAX_HTML) problems.push(`page too big (${counts.bytes} bytes)`);
  if (ctx.honesty) {
    const text = textOf(tree, true).replace(/\s+/g, " ");
    problems.push(...inventedClaims(text, ctx.honesty));
    const plain = (ctx.honesty.plain ?? []).join(" \n ");
    const shown = (v: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(text);
    for (const s of ctx.honesty.stats) if (s.value.length >= 2 && shown(s.value) && !plain.includes(s.value) && !st.statLinks.has(s.sourceUrl)) problems.push(`stat "${s.value}" shown without its source link`);
  }
  // Defence in depth: nothing executable or external may survive (stat links are the only absolute URLs).
  if (/<(script|iframe|object|embed|base|meta|link|style)\b|\son[a-z]+\s*=|javascript:|srcdoc|xlink:href/i.test(body)) problems.push("unsafe markup left after cleaning");
  if (/url\s*\(|@import|expression\s*\(|javascript:|<\/style/i.test(cssOut.css)) problems.push("unsafe css left after cleaning");
  const externals = [...body.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((m) => m[1]!).filter((u) => !u.startsWith("#") && !u.startsWith("ld-photo:") && !st.statLinks.has(u.replace(/&amp;/g, "&")) && !Object.values(ctx.photos).some((p) => p.url === u) && u !== ctx.leadAction);
  if (externals.length) problems.push(`unexpected link ${externals[0]!.slice(0, 60)}`);

  // ── soft warnings
  if (distinct < 4 && nPhotos >= 4) st.warnings.push(`only ${distinct} photos used`);
  if (cssOut.css.length > 12_000) st.warnings.push("stylesheet over 12 KB");
  if (count("h2") < 3) st.warnings.push("fewer than 3 section headings");
  if (!/:focus-visible/.test(cssOut.css)) st.warnings.push("no :focus-visible style");
  if (!/@media ?\(max-width/.test(cssOut.css)) st.warnings.push("no phone breakpoint");

  return { css: cssOut.css, body, problems: [...new Set(problems)], warnings: st.warnings, counts, heroPhoto: st.usedPhotos[0] };
}

/** sanitize() that returns null when a REQUIRED check fails (the caller then shows the standard designs). */
export function gateCustom(html: string, ctx: SanitizeCtx): Sanitized | null {
  const r = sanitize(html, ctx);
  return r.problems.length ? null : r;
}

/** Cuts the fragment out of a reply that may carry prose or a markdown fence around it. */
export function extractFragment(text: string): string {
  let t = String(text ?? "").replace(/^\s*```(?:html)?\s*/i, "").replace(/\s*```\s*$/, "");
  const a = t.search(/<style[\s>]/i);
  const z = t.toLowerCase().lastIndexOf("</footer>");
  if (a >= 0 && z > a) t = t.slice(a, z + "</footer>".length);
  else if (a >= 0) t = t.slice(a);
  return t.trim();
}
