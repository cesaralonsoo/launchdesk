// WP2 · SVG symbol linter and XSS gate. The model's markup is never passed through: it is tokenised and rebuilt from
// an allowlist of elements and attributes whose values are validated by type. Anything else is dropped. Then the
// design rules are checked (palette-only colours, at most 3 of them, at most 12 shapes, inside the 64 box, strokes
// thick enough for a 16 px favicon). Pure module (no imports).

export interface LintPalette { primary: string; accent: string; bg: string; ink: string }
export interface LintResult {
  ok: boolean;
  /** Rebuilt inner markup (safe even when !ok). */
  svg: string;
  errors: string[];
  warnings: string[];
  stats: { shapes: number; colours: string[]; bbox: [number, number, number, number] | null };
}

const SHAPES = new Set(["path", "circle", "rect", "ellipse", "polygon", "polyline", "line"]);
const ELEMENTS = new Set([...SHAPES, "g"]);
const NUM_ATTRS = new Set(["cx", "cy", "r", "x", "y", "width", "height", "rx", "ry", "x1", "y1", "x2", "y2", "stroke-width", "opacity", "fill-opacity", "stroke-opacity"]);
const ATTRS = new Set([...NUM_ATTRS, "d", "points", "fill", "stroke", "stroke-linecap", "stroke-linejoin", "transform", "fill-rule", "clip-rule"]);
const ENUMS: Record<string, readonly string[]> = {
  "stroke-linecap": ["butt", "round", "square"],
  "stroke-linejoin": ["miter", "round", "bevel"],
  "fill-rule": ["nonzero", "evenodd"],
  "clip-rule": ["nonzero", "evenodd"],
};
const NUM = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
const PATH_D = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/;
const POINTS = /^[0-9eE.,\s+-]+$/;
const TRANSFORM = /^(\s*(translate|rotate|scale|matrix|skewX|skewY)\(\s*[-+0-9eE.,\s]+\)\s*,?)+$/;
const NAMED: Record<string, string> = { white: "#FFFFFF", black: "#000000" };

export const LIMITS = { shapes: 12, colours: 3, pathChars: 1200, minStroke: 3, box: 64, slack: 2, minExtent: 30, maxInput: 16000 } as const;

export function normHex(v: string): string | null {
  const s = v.trim();
  const named = NAMED[s.toLowerCase()];
  if (named) return named;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (!m) return null;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join("") : m[1]!;
  return "#" + h.toUpperCase();
}
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const dist = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};

/** Every number in a path `d`, as absolute [x, y] points (curve control points included: a conservative box). */
export function pathPoints(d: string): Array<[number, number]> | null {
  const toks = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi);
  if (!toks) return null;
  const pts: Array<[number, number]> = [];
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0;
  const n = () => {
    const t = toks[i++];
    if (t === undefined || /[a-z]/i.test(t)) throw new Error("bad path");
    return Number(t);
  };
  const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  try {
    while (i < toks.length) {
      if (/[a-z]/i.test(toks[i]!)) cmd = toks[i++]!;
      else if (!cmd) return null;
      const lc = cmd.toLowerCase();
      const rel = cmd !== cmd.toUpperCase();
      if (lc === "z") { x = sx; y = sy; if (i < toks.length && !/[a-z]/i.test(toks[i]!)) return null; continue; }
      if (ARGS[lc] === undefined) return null;
      if (lc === "h") { x = (rel ? x : 0) + n(); pts.push([x, y]); }
      else if (lc === "v") { y = (rel ? y : 0) + n(); pts.push([x, y]); }
      else if (lc === "a") {
        const rx = n(), ry = n(), rot = n(), large = n(), sweep = n();
        const ex = (rel ? x : 0) + n(), ey = (rel ? y : 0) + n();
        pts.push([ex, ey], ...arcSamples(x, y, rx, ry, rot, large, sweep, ex, ey));
        x = ex; y = ey;
      } else {
        const k = ARGS[lc]! / 2;
        let px = x, py = y;
        for (let j = 0; j < k; j++) {
          px = (rel ? x : 0) + n();
          py = (rel ? y : 0) + n();
          pts.push([px, py]);
        }
        x = px; y = py;
        if (lc === "m") { sx = x; sy = y; cmd = rel ? "l" : "L"; }
      }
    }
  } catch {
    return null;
  }
  return pts;
}

/** Points along an SVG arc (endpoint → centre parameterisation, SVG spec F.6.5), for an honest bounding box. */
function arcSamples(x1: number, y1: number, rx: number, ry: number, rotDeg: number, large: number, sweep: number, x2: number, y2: number): Array<[number, number]> {
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return [];
  const phi = (rotDeg * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = (k * rx * yp) / ry, cyp = (-k * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const out: Array<[number, number]> = [];
  for (let i = 1; i < 24; i++) {
    const t = t1 + (dt * i) / 24;
    out.push([cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]);
  }
  return out;
}

type Inherit = { fill?: string; stroke?: string; sw?: number; transformed: boolean };
interface Node { tag: string; attrs: Array<[string, string]>; children: Node[] }

/** Lints and rebuilds the model's symbol markup (inner SVG, viewBox 0 0 64 64). */
export function lintSymbol(input: string, pal: LintPalette): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const palette = [...new Set([pal.primary, pal.accent, pal.ink, pal.bg].map((h) => normHex(h) ?? "#000000"))];
  const empty = (msg: string): LintResult => ({ ok: false, svg: "", errors: [msg], warnings, stats: { shapes: 0, colours: [], bbox: null } });
  if (typeof input !== "string" || !input.trim()) return empty("no markup");
  if (input.length > LIMITS.maxInput) return empty("markup too long");

  // 1. tokenise (comments, CDATA, doctype, processing instructions out first)
  const src = input.replace(/<!--[\s\S]*?(-->|$)/g, "").replace(/<!\[CDATA\[[\s\S]*?(\]\]>|$)/g, "").replace(/<[!?][^>]*>?/g, "");
  const root: Node = { tag: "#root", attrs: [], children: [] };
  const stack: Node[] = [root];
  let dropDepth = 0; // >0 while inside a dropped element
  const re = /<\s*(\/?)\s*([a-zA-Z][\w:.-]*)((?:\s+[^\s<>=\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s<>"']+))?)*)\s*(\/?)\s*>/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(src))) {
    if (src.slice(last, m.index).trim()) warnings.push("text content removed");
    last = re.lastIndex;
    const [, close, rawTag, rawAttrs = "", selfClose] = m;
    const tag = rawTag!.toLowerCase();
    if (close) {
      if (dropDepth > 0) { dropDepth--; continue; }
      if (tag === "svg") continue;
      if (stack.length > 1 && stack[stack.length - 1]!.tag === tag) stack.pop();
      continue;
    }
    if (dropDepth > 0) { if (!selfClose) dropDepth++; continue; }
    if (tag === "svg") continue; // unwrap a model-supplied outer <svg>
    if (!ELEMENTS.has(tag)) {
      warnings.push(`<${tag}> removed`);
      if (!selfClose) dropDepth = 1;
      continue;
    }
    const attrs: Array<[string, string]> = [];
    const ar = /([^\s<>=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s<>"']+)))?/g;
    let a: RegExpExecArray | null;
    while ((a = ar.exec(rawAttrs))) {
      const name = a[1]!.toLowerCase();
      const value = (a[2] ?? a[3] ?? a[4] ?? "").trim();
      if (!ATTRS.has(name)) { if (!/^(xmlns|id|class|data-)/.test(name)) warnings.push(`${name} removed`); continue; }
      attrs.push([name, value]);
    }
    const node: Node = { tag, attrs, children: [] };
    stack[stack.length - 1]!.children.push(node);
    if (!selfClose && tag === "g") stack.push(node);
    else if (!selfClose) dropDepth = 0; // a shape opened without self-closing: its close tag is matched above
  }
  if (src.slice(last).trim()) warnings.push("text content removed");

  // 2. validate + rebuild
  const colours = new Set<string>();
  let shapes = 0;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  const lo = -LIMITS.slack, hi = LIMITS.box + LIMITS.slack;
  const grow = (pts: Array<[number, number]>, el: string) => {
    for (const [x, y] of pts) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) { errors.push(`${el}: bad number`); return; }
      if (x < lo || x > hi || y < lo || y > hi) { errors.push(`${el}: outside the 64 box (${x.toFixed(1)},${y.toFixed(1)})`); return; }
      bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y);
    }
  };
  const colour = (v: string, el: string): string | null => {
    if (v === "none" || v === "transparent") return "none";
    const h = normHex(v);
    if (!h) { errors.push(`${el}: colour "${v.slice(0, 20)}" is not a palette hex`); return null; }
    if (palette.includes(h)) return h;
    let best = palette[0]!, bd = Infinity;
    for (const p of palette) { const d = dist(p, h); if (d < bd) { bd = d; best = p; } }
    if (bd <= 28) { warnings.push(`${el}: ${h} snapped to ${best}`); return best; }
    errors.push(`${el}: off-palette colour ${h}`);
    return null;
  };

  const build = (node: Node, inh: Inherit): string => {
    const out: string[] = [];
    const vals = new Map<string, string>();
    for (const [k, v] of node.attrs) {
      const el = node.tag;
      if (NUM_ATTRS.has(k)) {
        if (!NUM.test(v)) { warnings.push(`${el} ${k} "${v.slice(0, 12)}" removed`); continue; }
        const n = Number(v);
        if (/opacity/.test(k) && (n < 0 || n > 1)) { warnings.push(`${el} ${k} out of range`); continue; }
        vals.set(k, String(Math.round(n * 100) / 100));
      } else if (k === "d") {
        if (!PATH_D.test(v)) { errors.push("path: invalid d"); continue; }
        if (v.length > LIMITS.pathChars) errors.push(`path: d is ${v.length} chars (max ${LIMITS.pathChars})`);
        vals.set(k, v.replace(/\s+/g, " "));
      } else if (k === "points") {
        if (!POINTS.test(v)) { errors.push(`${el}: invalid points`); continue; }
        vals.set(k, v.replace(/\s+/g, " "));
      } else if (k === "fill" || k === "stroke") {
        const c = colour(v, el);
        if (c) vals.set(k, c);
      } else if (k === "transform") {
        if (!TRANSFORM.test(v)) { warnings.push(`${el} transform removed`); continue; }
        vals.set(k, v.replace(/\s+/g, " "));
      } else if (ENUMS[k]) {
        if (!ENUMS[k]!.includes(v)) { warnings.push(`${el} ${k} removed`); continue; }
        vals.set(k, v);
      }
    }
    const here: Inherit = {
      fill: vals.get("fill") ?? inh.fill,
      stroke: vals.get("stroke") ?? inh.stroke,
      sw: vals.has("stroke-width") ? Number(vals.get("stroke-width")) : inh.sw,
      transformed: inh.transformed || vals.has("transform"),
    };
    if (node.tag === "g") {
      const kids = node.children.map((c) => build(c, here)).filter(Boolean).join("");
      if (!kids) return "";
      out.push(`<g${attrs(vals)}>${kids}</g>`);
      return out.join("");
    }
    // shape
    const el = node.tag;
    const need = (keys: string[]) => keys.every((k) => vals.has(k));
    const num = (k: string) => Number(vals.get(k) ?? 0);
    let pts: Array<[number, number]> | null = [];
    if (el === "path") { if (!vals.has("d")) return ""; pts = pathPoints(vals.get("d")!); if (!pts) { errors.push("path: could not read d"); return ""; } }
    else if (el === "circle") { if (!need(["r"])) return ""; const r = num("r"), cx = num("cx"), cy = num("cy"); if (r <= 0) return ""; pts = [[cx - r, cy - r], [cx + r, cy + r]]; }
    else if (el === "ellipse") { if (!need(["rx", "ry"])) return ""; const cx = num("cx"), cy = num("cy"); pts = [[cx - num("rx"), cy - num("ry")], [cx + num("rx"), cy + num("ry")]]; }
    else if (el === "rect") { if (!need(["width", "height"])) return ""; const x = num("x"), y = num("y"); if (num("width") <= 0 || num("height") <= 0) return ""; pts = [[x, y], [x + num("width"), y + num("height")]]; }
    else if (el === "line") { pts = [[num("x1"), num("y1")], [num("x2"), num("y2")]]; }
    else if (el === "polygon" || el === "polyline") {
      const ns = (vals.get("points") ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
      if (ns.length < 4 || ns.length % 2) { errors.push(`${el}: bad points`); return ""; }
      pts = [];
      for (let i = 0; i < ns.length; i += 2) pts.push([ns[i]!, ns[i + 1]!]);
    }
    shapes++;
    // paint: line/polyline paint with stroke; everything else defaults to a black fill, which we never want
    const strokeOnly = el === "line";
    let fill = here.fill;
    if (!strokeOnly && fill === undefined) { fill = palette[0]!; vals.set("fill", fill); warnings.push(`${el}: no fill, set to ${fill}`); }
    if (strokeOnly) vals.delete("fill");
    const stroke = here.stroke;
    const stroked = stroke !== undefined && stroke !== "none";
    if (stroked) {
      const sw = here.sw ?? 1;
      if (sw < LIMITS.minStroke) errors.push(`${el}: stroke ${sw} is thinner than ${LIMITS.minStroke}`);
      colours.add(stroke!);
    } else if (strokeOnly) { errors.push("line: has no stroke"); return ""; }
    if (fill && fill !== "none" && !strokeOnly) colours.add(fill);
    if (!stroked && (fill === "none" || strokeOnly)) { warnings.push(`${el}: invisible, removed`); shapes--; return ""; }
    if (!here.transformed) {
      const pad = stroked ? (here.sw ?? 1) / 2 : 0;
      const box = pts.length ? pts : [];
      const xs = box.map((p) => p[0]), ys = box.map((p) => p[1]);
      if (xs.length) grow([[Math.min(...xs) - pad, Math.min(...ys) - pad], [Math.max(...xs) + pad, Math.max(...ys) + pad]], el);
    }
    return `<${el}${attrs(vals)}/>`;
  };
  const body = root.children.map((c) => build(c, { transformed: false })).join("");

  if (!shapes) errors.push("no shapes");
  if (shapes > LIMITS.shapes) errors.push(`${shapes} shapes (max ${LIMITS.shapes})`);
  // the background colour only counts when it is used as a cut-out on top of other shapes
  if (colours.size > LIMITS.colours) errors.push(`${colours.size} colours (max ${LIMITS.colours})`);
  const bbox: LintResult["stats"]["bbox"] = Number.isFinite(bx0) ? [bx0, by0, bx1, by1] : null;
  if (bbox && Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]) < LIMITS.minExtent) errors.push("symbol too small for the canvas");
  const onlyBg = [...colours].every((c) => c === normHex(pal.bg));
  if (shapes && onlyBg) errors.push("symbol only uses the background colour");
  return { ok: errors.length === 0, svg: body, errors: [...new Set(errors)], warnings: [...new Set(warnings)], stats: { shapes, colours: [...colours], bbox } };
}

const ORDER = ["d", "points", "cx", "cy", "r", "rx", "ry", "x", "y", "width", "height", "x1", "y1", "x2", "y2", "fill", "fill-rule", "clip-rule", "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-opacity", "opacity", "transform"];
function attrs(vals: Map<string, string>): string {
  const keys = [...vals.keys()].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  // every value was validated against a strict charset above; escape anyway (defence in depth)
  return keys.map((k) => ` ${k}="${vals.get(k)!.replace(/[&<>"']/g, "")}"`).join("");
}

/**
 * Optical sizing: scales and centres a passing symbol so its longest side is `target` units in the 64 box, so every
 * option sits at the same visual size next to the name (models draw anywhere from 30 to 60 units wide).
 */
export function fitSymbol(r: Pick<LintResult, "svg" | "stats">, target = 56): string {
  const b = r.stats.bbox;
  if (!b || !r.svg) return r.svg;
  const w = b[2] - b[0], h = b[3] - b[1];
  const k = target / Math.max(w, h);
  const tx = 32 - ((b[0] + b[2]) / 2) * k, ty = 32 - ((b[1] + b[3]) / 2) * k;
  if (Math.abs(k - 1) < 0.04 && Math.abs(tx) < 1.5 && Math.abs(ty) < 1.5) return r.svg;
  const f = (n: number) => String(Math.round(n * 100) / 100);
  return `<g transform="translate(${f(tx)} ${f(ty)}) scale(${f(k)})">${r.svg}</g>`;
}
