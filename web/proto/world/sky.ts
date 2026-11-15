// WS-A1 · Sky backdrop (CSS, behind the transparent WebGL canvas): vertical gradient, a soft daylight bloom,
// a horizon glow on the side of the sun (or moon), and a star field that fades in at night.
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
  return {
    paint(s: DayState, camera: THREE.Camera) {
      // where the light comes from, seen from the camera (x: −1 left … 1 right)
      v.copy(s.keyDir).transformDirection(camera.matrixWorldInverse);
      const sx = Math.max(-1, Math.min(1, v.x / (Math.abs(v.z) + 0.45)));
      const gx = (50 + sx * 46).toFixed(1);
      const low = 1 - Math.min(1, Math.max(0, s.sunEl) / 40); // low sun = wide warm band
      const gy = (14 + low * 10).toFixed(1);
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
    },
  };
}
