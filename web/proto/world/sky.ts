// WS-A1 · Sky backdrop (CSS, behind the transparent WebGL canvas): vertical gradient, a soft daylight bloom,
// a horizon glow on the side of the sun (or moon), and a star field that fades in at night.
// v7 (WS-WORLD): in pixel mode the same sky is painted into a small canvas — banded gradient with an ordered dither,
// square pixel stars that twinkle in steps — upscaled with hard edges, so the backdrop matches the pixel-art scene.
import * as THREE from "three";
import type { DayState } from "./daycycle";

function starTile(size = 512, n = 150, seed = 7): string {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const x = r() * size, y = r() * size, big = r() < 0.08;
    const a = 0.25 + r() * (big ? 0.75 : 0.45);
    const rad = big ? 1.1 + r() * 0.5 : 0.45 + r() * 0.45;
    g.fillStyle = `rgba(${r() < 0.2 ? "200,215,255" : "255,250,240"},${a.toFixed(2)})`;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  return c.toDataURL("image/png");
}

export function createSky(host: HTMLElement) {
  const stars = document.createElement("div");
  stars.className = "world-stars";
  Object.assign(stars.style, {
    position: "absolute", inset: "0", pointerEvents: "none", opacity: "0", backgroundRepeat: "repeat", backgroundSize: "512px 512px",
    maskImage: "linear-gradient(180deg, #000 0%, rgba(0,0,0,.65) 38%, transparent 72%)",
    webkitMaskImage: "linear-gradient(180deg, #000 0%, rgba(0,0,0,.65) 38%, transparent 72%)",
  } as Partial<CSSStyleDeclaration>);
  try {
    stars.style.backgroundImage = `url(${starTile()})`;
  } catch {
    /* no 2D canvas: no stars */
  }
  host.prepend(stars);
  const canvas = host.querySelector("canvas");
  if (canvas) (canvas as HTMLCanvasElement).style.position = "relative";

  const v = new THREE.Vector3();
  const rgb = (c: THREE.Color) => {
    const h = c.getHex(THREE.SRGBColorSpace);
    return `${(h >> 16) & 255},${(h >> 8) & 255},${h & 255}`;
  };
  let lastCss = "";
  // ── pixel sky (v7)
  let px = 0;
  const pc = document.createElement("canvas");
  pc.className = "world-pixel-sky";
  Object.assign(pc.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none", imageRendering: "pixelated", display: "none" } as Partial<CSSStyleDeclaration>);
  host.prepend(pc);
  const pg = pc.getContext("2d");
  let img: ImageData | null = null;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((x) => (x + 0.5) / 16 - 0.5);
  // fixed star field in sky pixels (deterministic), brighter ones get a 4-pixel cross
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const STARS = Array.from({ length: 220 }, () => ({ x: rnd(), y: rnd() * 0.62, b: rnd(), big: rnd() < 0.07, ph: rnd() * 6.28 }));
  const tmpA = new THREE.Color(), tmpB = new THREE.Color(), tmpG = new THREE.Color();
  function paintPixel(s: DayState, gx: number, gy: number, low: number, now: number) {
    if (!pg) return;
    const W = Math.max(8, Math.ceil(host.clientWidth / px)), H = Math.max(8, Math.ceil(host.clientHeight / px));
    if (pc.width !== W || pc.height !== H || !img) {
      pc.width = W;
      pc.height = H;
      img = pg.createImageData(W, H);
    }
    const d = img.data;
    // colours in sRGB 0..255
    tmpA.copy(s.skyTop).convertLinearToSRGB();
    tmpB.copy(s.skyBottom).convertLinearToSRGB();
    tmpG.copy(s.glow).convertLinearToSRGB();
    const levels = 64, q = levels - 1;
    const gcx = (gx / 100) * W, gcy = (gy / 100) * H;
    const rx = ((70 + low * 40) / 100) * W, ry = ((55 + low * 15) / 100) * H;
    const bloom = 0.42 * s.daylight * (1 - 0.5 * s.warmth);
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1);
      for (let x = 0; x < W; x++) {
        let r = tmpA.r + (tmpB.r - tmpA.r) * v, g = tmpA.g + (tmpB.g - tmpA.g) * v, b = tmpA.b + (tmpB.b - tmpA.b) * v;
        const ex = (x - gcx) / rx, ey = (y - gcy) / ry;
        const gk = Math.max(0, 1 - Math.sqrt(ex * ex + ey * ey) / 0.72) * s.glowK;
        r += (tmpG.r - r) * gk; g += (tmpG.g - g) * gk; b += (tmpG.b - b) * gk;
        const bx = (x / W - 0.5) / 1.2, by = (y / H - 0.38) / 0.8;
        const bk = Math.max(0, 1 - Math.sqrt(bx * bx + by * by) / 0.6) * bloom;
        r += (1 - r) * bk; g += (1 - g) * bk; b += (1 - b) * bk;
        const dth = BAYER[(x & 3) + (y & 3) * 4]!;
        const i = (y * W + x) * 4;
        d[i] = (Math.floor(r * q + 0.5 + dth) / q) * 255;
        d[i + 1] = (Math.floor(g * q + 0.5 + dth) / q) * 255;
        d[i + 2] = (Math.floor(b * q + 0.5 + dth) / q) * 255;
        d[i + 3] = 255;
      }
    }
    if (s.stars > 0.02) {
      const tw = Math.floor(now / 700);
      for (const st of STARS) {
        const x = Math.floor(st.x * W), y = Math.floor(st.y * H);
        const fadeY = 1 - Math.min(1, Math.max(0, (st.y - 0.25) / 0.4));
        const on = (Math.floor(st.ph * 10) + tw) % 9 !== 0; // stepped twinkle
        const a = s.stars * fadeY * (0.35 + 0.65 * st.b) * (on ? 1 : 0.4);
        const put = (xx: number, yy: number, k: number) => {
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) return;
          const i = (yy * W + xx) * 4;
          d[i] += (255 - d[i]!) * k;
          d[i + 1] += (250 - d[i + 1]!) * k;
          d[i + 2] += (235 - d[i + 2]!) * k;
        };
        put(x, y, a);
        if (st.big) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(x + dx!, y + dy!, a * 0.45);
      }
    }
    pg.putImageData(img, 0, 0);
  }
  let lastPixelPaint = 0;
  return {
    /** v7: CSS px per sky pixel (0 = smooth CSS sky). The sky uses 2× the scene's art pixel. */
    setPixel(cssPx: number) {
      px = cssPx ? cssPx * 2 : 0;
      pc.style.display = px ? "block" : "none";
      stars.style.display = px ? "none" : "";
      lastCss = "";
    },
    paint(s: DayState, camera: THREE.Camera) {
      // where the light comes from, seen from the camera (x: −1 left … 1 right)
      v.copy(s.keyDir).transformDirection(camera.matrixWorldInverse);
      const sx = Math.max(-1, Math.min(1, v.x / (Math.abs(v.z) + 0.45)));
      const gx = (50 + sx * 46).toFixed(1);
      const low = 1 - Math.min(1, Math.max(0, s.sunEl) / 40); // low sun = wide warm band
      const gy = (14 + low * 10).toFixed(1);
      if (px) {
        const now = performance.now();
        // ≤ 10 Hz from the world; star twinkle steps every 700 ms
        if (now - lastPixelPaint > 90) {
          lastPixelPaint = now;
          paintPixel(s, +gx, +gy, low, now);
        }
        return;
      }
      const bloom = (0.42 * s.daylight * (1 - 0.5 * s.warmth)).toFixed(3);
      const css =
        `radial-gradient(${(70 + low * 40).toFixed(0)}% ${(55 + low * 15).toFixed(0)}% at ${gx}% ${gy}%, rgba(${rgb(s.glow)},${s.glowK.toFixed(3)}) 0%, rgba(${rgb(s.glow)},0) 72%),` +
        `radial-gradient(120% 80% at 50% 38%, rgba(255,255,255,${bloom}) 0%, rgba(255,255,255,0) 60%),` +
        `linear-gradient(180deg, rgb(${rgb(s.skyTop)}) 0%, rgb(${rgb(s.skyBottom)}) 100%)`;
      if (css !== lastCss) {
        host.style.background = css;
        lastCss = css;
      }
      stars.style.opacity = (s.stars * 0.85).toFixed(3);
    },
    dispose() {
      stars.remove();
      pc.remove();
    },
  };
}
