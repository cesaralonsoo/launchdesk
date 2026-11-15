// WS-A · canvas textures for the level-1 office. Drawn once, cached, shared.
// Product text on textures is English and minimal (wordmark, week labels). Fonts fall back to system UI.
import * as THREE from "three";
import { isPixel } from "./style";
import { pixelPlanksTex, pixelRugTex, pixelStoneTex } from "./pixel";

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
const cache = new Map<string, THREE.CanvasTexture>();

/**
 * Draw once, cache, share. `px` (v7 pixel styles only): downsample factor — the texture is drawn at full size, then
 * reduced by `px` with box filtering, posterised to a limited palette and sampled nearest (crisp pixel-art texels).
 * `native`: the draw function already paints a pixel-art canvas at its final size (always nearest in pixel styles).
 */
export function canvasTex(key: string, w: number, h: number, draw: Draw, srgb = true, px = 0, native = false): THREE.CanvasTexture {
  const pixel = isPixel() && (px > 1 || native);
  const k = `${key}|${pixel ? "px" + px : "hd"}`;
  const hit = cache.get(k);
  if (hit) return hit;
  let c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = !native;
  draw(g, w, h);
  if (pixel && px > 1) c = pixelate(c, Math.max(1, Math.round(w / px)), Math.max(1, Math.round(h / px)));
  else if (native && !pixel) {
    // clean style: a pixel-native drawing upscaled 4× (nearest) so linear filtering keeps its edges
    const up = document.createElement("canvas");
    up.width = w * 4;
    up.height = h * 4;
    const ug = up.getContext("2d")!;
    ug.imageSmoothingEnabled = false;
    ug.drawImage(c, 0, 0, up.width, up.height);
    c = up;
  }
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (pixel) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
  } else {
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
  }
  cache.set(k, t);
  return t;
}

/** Box-filter `src` down to w×h, then posterise each channel (and alpha) to a small palette. */
function pixelate(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  // step down by halves for a clean box filter (drawImage with smoothing ≈ bilinear per step)
  let cur = src;
  while (cur.width / 2 >= w * 1.0001 && cur.height / 2 >= h * 1.0001) {
    const n = document.createElement("canvas");
    n.width = Math.max(w, Math.round(cur.width / 2));
    n.height = Math.max(h, Math.round(cur.height / 2));
    const ng = n.getContext("2d")!;
    ng.imageSmoothingEnabled = true;
    ng.imageSmoothingQuality = "high";
    ng.drawImage(cur, 0, 0, n.width, n.height);
    cur = n;
  }
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const og = out.getContext("2d")!;
  og.imageSmoothingEnabled = true;
  og.imageSmoothingQuality = "high";
  og.drawImage(cur, 0, 0, w, h);
  const img = og.getImageData(0, 0, w, h);
  const d = img.data;
  const q = (v: number, step: number) => Math.min(255, Math.round(v / step) * step);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = q(d[i]!, 17);
    d[i + 1] = q(d[i + 1]!, 17);
    d[i + 2] = q(d[i + 2]!, 17);
    d[i + 3] = q(d[i + 3]!, 51);
  }
  og.putImageData(img, 0, 0);
  return out;
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

const SANS = `600 X "Inter Tight", "Inter", -apple-system, "Helvetica Neue", Arial, sans-serif`;
const font = (px: number, weight = 600) => SANS.replace("600", String(weight)).replace("X", `${px}px`);

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Deterministic PRNG so textures are identical between reloads (screenshots diff cleanly). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const mixHex = (a: string, b: string, k: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();

// ─────────────────────────────────────────────── surfaces

/** Very fine mineral noise (microcement / plaster). Greyscale, used as a multiply map. */
export function plasterTex(): THREE.CanvasTexture {
  const t = canvasTex("plaster", 256, 256, (g, w, h) => {
    const r = rng(7);
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const a = 0.018 + r() * 0.03;
      g.fillStyle = `rgba(90,80,70,${a})`;
      const s = 1 + r() * 2.2;
      g.fillRect(r() * w, r() * h, s, s);
    }
    for (let i = 0; i < 40; i++) {
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 40);
      grd.addColorStop(0, "rgba(120,110,100,0.035)");
      grd.addColorStop(1, "rgba(120,110,100,0)");
      g.save();
      g.translate(r() * w, r() * h);
      g.fillStyle = grd;
      g.fillRect(-40, -40, 80, 80);
      g.restore();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Oak planks with grain, knots and soft per-plank tone. Near-white, multiplied by the material colour. */
export function planksTex(): THREE.CanvasTexture {
  if (isPixel()) return pixelPlanksTex();
  const t = canvasTex("planks2", 1024, 1024, (g, w, h) => {
    const r = rng(11);
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
    const rows = 10;
    const ph = h / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 400;
      while (x < w) {
        const len = 420 + r() * 420;
        const tone = 0.93 + r() * 0.07;
        const c = Math.round(255 * tone);
        g.fillStyle = `rgb(${c},${Math.round(c * 0.975)},${Math.round(c * 0.94)})`;
        g.fillRect(x, i * ph, len, ph);
        // long soft grain
        for (let k = 0; k < 22; k++) {
          g.strokeStyle = `rgba(110,80,50,${0.03 + r() * 0.06})`;
          g.lineWidth = 0.6 + r() * 1.6;
          g.beginPath();
          const y = i * ph + 3 + r() * (ph - 6);
          g.moveTo(x, y);
          g.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 10, x + len * 0.7, y + (r() - 0.5) * 10, x + len, y + (r() - 0.5) * 4);
          g.stroke();
        }
        // a cathedral figure now and then
        if (r() < 0.45) {
          const cx = x + len * (0.3 + r() * 0.4), cy = i * ph + ph / 2;
          for (let k = 0; k < 5; k++) {
            g.strokeStyle = `rgba(110,78,48,${0.05 + r() * 0.05})`;
            g.lineWidth = 1;
            g.beginPath();
            g.ellipse(cx, cy, 30 + k * 22, 5 + k * 5, 0, 0, Math.PI * 2);
            g.stroke();
          }
        }
        g.fillStyle = "rgba(70,50,30,0.32)";
        g.fillRect(x, i * ph, 2, ph);
        x += len;
      }
      g.fillStyle = "rgba(70,50,30,0.3)";
      g.fillRect(0, i * ph, w, 2);
      g.fillStyle = "rgba(255,255,255,0.25)";
      g.fillRect(0, i * ph + 2, w, 1);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Large-format mineral stone tiles (corridor): very fine noise, faint veining, hairline joints. */
export function stoneTex(): THREE.CanvasTexture {
  if (isPixel()) return pixelStoneTex();
  const t = canvasTex("stone", 512, 512, (g, w, h) => {
    const r = rng(23);
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `rgba(90,82,74,${0.015 + r() * 0.03})`;
      const s = 0.8 + r() * 1.8;
      g.fillRect(r() * w, r() * h, s, s);
    }
    for (let i = 0; i < 18; i++) {
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 70);
      grd.addColorStop(0, "rgba(120,110,100,0.04)");
      grd.addColorStop(1, "rgba(120,110,100,0)");
      g.save();
      g.translate(r() * w, r() * h);
      g.fillStyle = grd;
      g.fillRect(-70, -70, 140, 140);
      g.restore();
    }
    // 2 × 2 tiles per texture repeat (≈ 1.6 m tiles), hairline joints
    g.fillStyle = "rgba(80,72,64,0.22)";
    for (const p of [0, w / 2]) {
      g.fillRect(p, 0, 1.5, h);
      g.fillRect(0, p, w, 1.5);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Soft radial blob: contact shadows (dark tint) and light pools (warm tint, additive). */
export function radialTex(): THREE.CanvasTexture {
  return canvasTex("radial", 128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.45, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, true, 8);
}

/** Rounded-rectangle soft shadow (for boxy furniture: desks, sofas, racks). */
export function softRectTex(): THREE.CanvasTexture {
  return canvasTex("softrect", 128, 128, (g, w, h) => {
    g.filter = "blur(14px)";
    g.fillStyle = "#fff";
    rr(g, 26, 26, w - 52, h - 52, 14);
    g.fill();
  }, true, 8);
}

/** Linear fade (AO along wall bases): opaque at v=0, transparent at v=1. */
export function fadeTex(): THREE.CanvasTexture {
  return canvasTex("fade", 4, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.3, "rgba(255,255,255,0.45)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, true, 8);
}

/** Woven rug: a subtle border and texture, white-based so the material colour tints it. */
export function rugTex(kind: "rect" | "round"): THREE.CanvasTexture {
  if (isPixel() && kind === "rect") return pixelRugTex("rect");
  return canvasTex(`rug:${kind}`, 256, 256, (g, w, h) => {
    const r = rng(kind === "rect" ? 3 : 5);
    g.clearRect(0, 0, w, h);
    g.save();
    if (kind === "round") {
      g.beginPath();
      g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
      g.clip();
    } else {
      rr(g, 2, 2, w - 4, h - 4, 18);
      g.clip();
    }
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.03})`;
      g.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
    g.strokeStyle = "rgba(255,255,255,0.75)";
    g.lineWidth = 4;
    if (kind === "round") {
      g.beginPath();
      g.arc(w / 2, h / 2, w / 2 - 20, 0, Math.PI * 2);
      g.stroke();
    } else {
      rr(g, 18, 18, w - 36, h - 36, 8);
      g.stroke();
    }
    g.restore();
  }, true, 8);
}

// ─────────────────────────────────────────────── screens

/** Monitor UI: calm dark navy, one accent. variant: 0 doc, 1 chart, 2 grid/kanban, 3 code/terminal, 4 map. */
export function screenTex(color: string, variant: number): THREE.CanvasTexture {
  return canvasTex(`screen:${color}:${variant}`, 320, 200, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "#162033");
    grd.addColorStop(1, "#0E1624");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.05)";
    g.fillRect(0, 0, 54, h);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = i === 1 ? color : "rgba(255,255,255,0.16)";
      rr(g, 14, 22 + i * 18, i === 1 ? 26 : 22, 6, 3);
      g.fill();
    }
    const x0 = 70;
    const v = variant % 5;
    if (v === 0) {
      g.fillStyle = "rgba(255,255,255,0.85)";
      rr(g, x0, 22, 130, 11, 4);
      g.fill();
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 4 === 0 ? color : "rgba(255,255,255,0.22)";
        rr(g, x0, 48 + i * 17, 80 + ((i * 61) % 150), 6, 3);
        g.fill();
      }
    } else if (v === 1) {
      g.strokeStyle = "rgba(255,255,255,0.08)";
      g.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.moveTo(x0, 40 + i * 32);
        g.lineTo(w - 16, 40 + i * 32);
        g.stroke();
      }
      const pts = [0.15, 0.22, 0.2, 0.35, 0.42, 0.4, 0.58, 0.66, 0.78, 0.86];
      const fill = g.createLinearGradient(0, 40, 0, h - 30);
      fill.addColorStop(0, mixHex(color, "#0E1624", 0.55));
      fill.addColorStop(1, "rgba(14,22,36,0)");
      g.beginPath();
      pts.forEach((p, i) => {
        const x = x0 + (i / (pts.length - 1)) * (w - 16 - x0);
        const y = h - 30 - p * (h - 80);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.lineTo(w - 16, h - 30);
      g.lineTo(x0, h - 30);
      g.fillStyle = fill;
      g.fill();
      g.beginPath();
      pts.forEach((p, i) => {
        const x = x0 + (i / (pts.length - 1)) * (w - 16 - x0);
        const y = h - 30 - p * (h - 80);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.strokeStyle = color;
      g.lineWidth = 3;
      g.stroke();
    } else if (v === 2) {
      for (let c = 0; c < 4; c++) {
        g.fillStyle = "rgba(255,255,255,0.05)";
        rr(g, x0 + c * 61, 22, 54, h - 40, 6);
        g.fill();
        for (let k = 0; k < 2 + ((c * 3) % 3); k++) {
          g.fillStyle = k === 0 && c === 1 ? color : "rgba(255,255,255,0.18)";
          rr(g, x0 + c * 61 + 6, 32 + k * 30, 42, 22, 4);
          g.fill();
        }
      }
    } else if (v === 3) {
      g.font = font(11, 500);
      for (let i = 0; i < 10; i++) {
        g.fillStyle = i % 3 === 0 ? color : "rgba(255,255,255,0.3)";
        rr(g, x0 + (i % 4) * 10, 22 + i * 16, 50 + ((i * 47) % 140), 6, 3);
        g.fill();
      }
    } else {
      const r = rng(21);
      for (let i = 0; i < 220; i++) {
        const x = x0 + r() * (w - x0 - 16);
        const y = 24 + r() * (h - 48);
        const inland = Math.sin(x * 0.04) + Math.cos(y * 0.06) > 0.2;
        if (!inland) continue;
        g.fillStyle = "rgba(255,255,255,0.22)";
        g.fillRect(x, y, 2.5, 2.5);
      }
      for (const [x, y] of [[150, 80], [210, 64], [250, 120]] as const) {
        g.fillStyle = color;
        g.beginPath();
        g.arc(x, y, 5, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = mixHex(color, "#0E1624", 0.4);
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, 11, 0, Math.PI * 2);
        g.stroke();
      }
    }
  }, true, 4);
}

/** Blank dark glass for screens that are off (locked rooms). */
export function screenOffTex(): THREE.CanvasTexture {
  return canvasTex("screen:off", 64, 40, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "#1A2230");
    grd.addColorStop(0.5, "#121821");
    grd.addColorStop(1, "#1A2230");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, true, 2);
}

// ─────────────────────────────────────────────── department walls

/** Mia: a 4-week planning wall with sticky notes. */
export function planWallTex(color: string): THREE.CanvasTexture {
  return canvasTex(`plan:${color}`, 640, 300, (g, w, h) => {
    g.fillStyle = "#FBFBFA";
    g.fillRect(0, 0, w, h);
    const r = rng(42);
    const notes = ["#FFD86B", "#FFB8A3", mixHex(color, "#ffffff", 0.35), "#A8DDC4", "#FFE9A8"];
    for (let c = 0; c < 4; c++) {
      const x = 22 + c * 154;
      g.fillStyle = "rgba(30,30,40,0.55)";
      g.font = font(17, 600);
      g.fillText(`W${c + 1}`, x + 4, 34);
      g.fillStyle = "rgba(30,30,40,0.08)";
      g.fillRect(x, 44, 140, 2);
      const n = [3, 3, 2, 2][c]!;
      for (let k = 0; k < n; k++) {
        const nx = x + (k % 2) * 70 + r() * 6;
        const ny = 60 + Math.floor(k / 2) * 76 + (k % 2) * 10 + r() * 6;
        g.save();
        g.translate(nx + 30, ny + 30);
        g.rotate((r() - 0.5) * 0.12);
        g.shadowColor = "rgba(0,0,0,0.12)";
        g.shadowBlur = 6;
        g.shadowOffsetY = 2;
        g.fillStyle = notes[(c + k) % notes.length]!;
        g.fillRect(-32, -32, 64, 64);
        g.shadowColor = "transparent";
        g.fillStyle = "rgba(30,30,40,0.45)";
        g.fillRect(-20, -14, 36, 4);
        g.fillRect(-20, -4, 26, 4);
        g.restore();
      }
    }
    // progress line along the bottom
    g.fillStyle = "rgba(30,30,40,0.08)";
    rr(g, 22, h - 30, w - 44, 6, 3);
    g.fill();
    g.fillStyle = color;
    rr(g, 22, h - 30, (w - 44) * 0.32, 6, 3);
    g.fill();
  }, true, 6);
}

/** Leo: large market screen (score dial + bars). */
export function marketWallTex(color: string): THREE.CanvasTexture {
  return canvasTex(`market:${color}`, 512, 288, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "#121B2B");
    grd.addColorStop(1, "#0B1220");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    // dial
    const cx = 120, cy = 150, R = 70;
    g.lineCap = "round";
    g.lineWidth = 14;
    g.strokeStyle = "rgba(255,255,255,0.08)";
    g.beginPath();
    g.arc(cx, cy, R, Math.PI * 0.75, Math.PI * 2.25);
    g.stroke();
    g.strokeStyle = color;
    g.beginPath();
    g.arc(cx, cy, R, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * 0.78));
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.font = font(40, 600);
    g.textAlign = "center";
    g.fillText("7.8", cx, cy + 14);
    // bars
    g.textAlign = "left";
    const vals = [0.82, 0.64, 0.74];
    vals.forEach((v, i) => {
      const y = 92 + i * 52;
      g.fillStyle = "rgba(255,255,255,0.08)";
      rr(g, 240, y, 230, 12, 6);
      g.fill();
      g.fillStyle = i === 0 ? color : mixHex(color, "#ffffff", 0.35);
      rr(g, 240, y, 230 * v, 12, 6);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.25)";
      rr(g, 240, y - 18, 70, 7, 3);
      g.fill();
    });
  }, true, 6);
}

/** Sam: finance board, rising cash curve that crosses zero at month 6. */
export function financeWallTex(color: string): THREE.CanvasTexture {
  return canvasTex(`finance:${color}`, 512, 300, (g, w, h) => {
    g.fillStyle = "#FBFBFA";
    g.fillRect(0, 0, w, h);
    const x0 = 40, x1 = w - 30, y0 = 40, y1 = h - 40;
    const zero = y0 + (y1 - y0) * 0.55;
    g.strokeStyle = "rgba(30,30,40,0.10)";
    g.lineWidth = 1.5;
    for (let i = 0; i <= 12; i++) {
      const x = x0 + (i / 12) * (x1 - x0);
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x, y1);
      g.stroke();
    }
    g.strokeStyle = "rgba(30,30,40,0.35)";
    g.beginPath();
    g.moveTo(x0, zero);
    g.lineTo(x1, zero);
    g.stroke();
    const pts: Array<[number, number]> = [];
    for (let m = 0; m <= 12; m++) {
      const v = m <= 6 ? -1 + (m / 6) * 1 - Math.sin((m / 6) * Math.PI) * 0.25 : ((m - 6) / 6) * 0.85;
      pts.push([x0 + (m / 12) * (x1 - x0), zero - v * (zero - y0) * 0.95]);
    }
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokeStyle = color;
    g.lineWidth = 5;
    g.lineJoin = "round";
    g.stroke();
    const [bx, by] = pts[6]!;
    g.fillStyle = "#0AC18E";
    g.beginPath();
    g.arc(bx, by, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(bx, by, 4, 0, Math.PI * 2);
    g.fill();
  }, true, 6);
}

/** Nova: moodboard with swatches, type specimen and a photo block. */
export function moodboardTex(color: string): THREE.CanvasTexture {
  return canvasTex(`mood:${color}`, 560, 320, (g, w, h) => {
    g.fillStyle = "#EFE9E1";
    g.fillRect(0, 0, w, h);
    const card = (x: number, y: number, cw: number, ch: number, rot: number, fill: (g: CanvasRenderingContext2D) => void) => {
      g.save();
      g.translate(x + cw / 2, y + ch / 2);
      g.rotate(rot);
      g.shadowColor = "rgba(0,0,0,0.14)";
      g.shadowBlur = 10;
      g.shadowOffsetY = 3;
      g.fillStyle = "#fff";
      g.fillRect(-cw / 2, -ch / 2, cw, ch);
      g.shadowColor = "transparent";
      g.translate(-cw / 2, -ch / 2);
      fill(g);
      g.restore();
    };
    const sw = [color, mixHex(color, "#ffffff", 0.45), "#2B2622", "#E9C9A6"];
    card(26, 28, 200, 120, -0.03, (g) => {
      sw.forEach((c, i) => {
        g.fillStyle = c;
        g.fillRect(10 + i * 46, 10, 40, 100);
      });
    });
    card(250, 22, 140, 150, 0.04, (g) => {
      g.fillStyle = "#2B2622";
      g.font = `400 86px "Instrument Serif", Georgia, serif`;
      g.fillText("Aa", 18, 104);
      g.fillStyle = color;
      g.fillRect(18, 120, 60, 6);
    });
    card(410, 40, 124, 170, -0.05, (g) => {
      const grd = g.createLinearGradient(0, 0, 0, 170);
      grd.addColorStop(0, "#E8C6A8");
      grd.addColorStop(1, "#B98A6B");
      g.fillStyle = grd;
      g.fillRect(8, 8, 108, 154);
      g.fillStyle = "rgba(255,255,255,0.65)";
      g.beginPath();
      g.arc(62, 70, 26, 0, Math.PI * 2);
      g.fill();
    });
    card(60, 172, 150, 120, 0.05, (g) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(75, 60, 34, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(75, 60, 14, 0, Math.PI * 2);
      g.fill();
    });
    card(240, 196, 150, 100, -0.02, (g) => {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i === 0 ? "#2B2622" : "rgba(43,38,34,0.25)";
        g.fillRect(14, 18 + i * 18, i === 0 ? 100 : 120 - i * 14, 7);
      }
    });
  }, true, 6);
}

/** Dex: logo exploration grid (three marks, one chosen). */
export function logoGridTex(color: string): THREE.CanvasTexture {
  return canvasTex(`logos:${color}`, 420, 160, (g, w, h) => {
    g.fillStyle = "#FBFBFA";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) {
      const x = 20 + i * 134;
      g.fillStyle = i === 1 ? mixHex(color, "#ffffff", 0.82) : "#F1F1EF";
      rr(g, x, 18, 120, 124, 12);
      g.fill();
      if (i === 1) {
        g.strokeStyle = color;
        g.lineWidth = 3;
        g.stroke();
      }
      const cx = x + 60, cy = 80;
      g.fillStyle = i === 1 ? color : "#3A3634";
      if (i === 0) {
        g.beginPath();
        g.arc(cx, cy, 30, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#F1F1EF";
        g.fillRect(cx - 30, cy - 4, 60, 8);
      } else if (i === 1) {
        g.beginPath();
        g.arc(cx, cy, 32, Math.PI, 0);
        g.lineTo(cx + 32, cy + 22);
        g.lineTo(cx - 32, cy + 22);
        g.closePath();
        g.fill();
      } else {
        rr(g, cx - 28, cy - 28, 56, 56, 16);
        g.fill();
        g.fillStyle = "#F1F1EF";
        g.beginPath();
        g.arc(cx, cy, 12, 0, Math.PI * 2);
        g.fill();
      }
    }
  }, true, 5);
}

/** Rae: 30-day content calendar. */
export function calendarTex(color: string): THREE.CanvasTexture {
  return canvasTex(`cal:${color}`, 420, 300, (g, w, h) => {
    g.fillStyle = "#FBFBFA";
    g.fillRect(0, 0, w, h);
    const posts = new Set([1, 3, 5, 8, 10, 12, 15, 17, 19, 22, 25, 28]);
    for (let d = 0; d < 30; d++) {
      const c = d % 7, r = Math.floor(d / 7);
      const x = 22 + c * 54, y = 26 + r * 54;
      g.fillStyle = posts.has(d) ? color : "rgba(30,30,40,0.06)";
      rr(g, x, y, 46, 46, 8);
      g.fill();
      if (posts.has(d)) {
        g.fillStyle = "rgba(255,255,255,0.85)";
        rr(g, x + 10, y + 18, 26, 5, 2);
        g.fill();
      }
    }
  }, true, 5);
}

/** Pip: launch console screen with a big "Live" status bar. */
export function consoleTex(color: string): THREE.CanvasTexture {
  return canvasTex(`console:${color}`, 420, 200, (g, w, h) => {
    g.fillStyle = "#0C121C";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i === 5 ? "#0AC18E" : "rgba(255,255,255,0.18)";
      rr(g, 24, 22 + i * 18, 120 + ((i * 53) % 140), 6, 3);
      g.fill();
    }
    g.fillStyle = "rgba(10,193,142,0.14)";
    rr(g, 24, 140, w - 48, 38, 10);
    g.fill();
    g.fillStyle = "#0AC18E";
    rr(g, 24, 140, (w - 48) * 0.72, 38, 10);
    g.fill();
    g.fillStyle = color;
    rr(g, w - 60, 22, 36, 36, 18);
    g.fill();
  }, true, 5);
}

/** Lobby: LaunchDesk wordmark on a dark panel. */
export function wordmarkTex(): THREE.CanvasTexture {
  return canvasTex("wordmark", 640, 200, (g, w, h) => {
    g.fillStyle = "#16201C";
    g.fillRect(0, 0, w, h);
    // mark: rounded square with a rising step
    const x = 70, y = h / 2 - 40;
    g.fillStyle = "#0AC18E";
    rr(g, x, y, 80, 80, 20);
    g.fill();
    g.fillStyle = "#16201C";
    g.fillRect(x + 20, y + 44, 14, 18);
    g.fillRect(x + 38, y + 32, 14, 30);
    g.fillRect(x + 56, y + 18, 6, 44);
    g.fillStyle = "#F4F5F2";
    g.font = font(64, 600);
    g.textBaseline = "middle";
    g.fillText("LaunchDesk", x + 110, h / 2 + 2);
  });
}

/** Small round department plaque: one letter, dept colour. */
export function plaqueTex(letter: string, color: string): THREE.CanvasTexture {
  return canvasTex(`plaque:${letter}:${color}`, 128, 128, (g, w, h) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.font = font(64, 600);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(letter, w / 2, h / 2 + 3);
  }, true, 4);
}

/** White check on transparent (done badge). */
export function checkTex(): THREE.CanvasTexture {
  return canvasTex("check", 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "#fff";
    g.lineWidth = 14;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(w * 0.3, h * 0.52);
    g.lineTo(w * 0.45, h * 0.66);
    g.lineTo(w * 0.72, h * 0.38);
    g.stroke();
  });
}

/** Art print for walls: abstract shapes in a colour. */
export function printTex(color: string, seed: number): THREE.CanvasTexture {
  return canvasTex(`print:${color}:${seed}`, 200, 260, (g, w, h) => {
    g.fillStyle = "#F6F3EE";
    g.fillRect(0, 0, w, h);
    g.fillStyle = color;
    if (seed % 2 === 0) {
      g.beginPath();
      g.arc(w / 2, h * 0.42, 56, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#2B2622";
      g.fillRect(40, h * 0.72, w - 80, 10);
    } else {
      g.fillRect(36, 50, 70, 150);
      g.fillStyle = mixHex(color, "#ffffff", 0.5);
      g.beginPath();
      g.arc(130, 160, 40, 0, Math.PI * 2);
      g.fill();
    }
  }, true, 5);
}
