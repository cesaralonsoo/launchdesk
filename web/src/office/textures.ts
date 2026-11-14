import * as THREE from "three";

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

const cache = new Map<string, THREE.CanvasTexture>();

export function canvasTex(key: string, w: number, h: number, draw: Draw): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const DISPLAY = "'Sora', 'Plus Jakarta Sans', system-ui, sans-serif";

/** Monitor screen: dark UI with coloured rows, tinted by the department colour. */
export function screenTex(color: string, variant = 0): THREE.CanvasTexture {
  return canvasTex(`screen:${color}:${variant}`, 256, 160, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "#132033");
    grd.addColorStop(1, "#0C1522");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#1C2B42";
    g.fillRect(0, 0, w, 18);
    ["#FF7A6B", "#F5C542", "#0AC18E"].forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(12 + i * 12, 9, 3.5, 0, Math.PI * 2);
      g.fill();
    });
    if (variant % 3 === 0) {
      // document lines
      for (let i = 0; i < 9; i++) {
        g.fillStyle = i === 0 ? color : i % 3 === 0 ? "#3A4F6E" : "#2A3A52";
        const len = i === 0 ? 120 : 60 + ((i * 53) % 150);
        rr(g, 18, 30 + i * 13, len, 7, 3);
        g.fill();
      }
    } else if (variant % 3 === 1) {
      // chart
      g.strokeStyle = color;
      g.lineWidth = 4;
      g.beginPath();
      const pts = [120, 110, 118, 92, 98, 70, 76, 52, 46];
      pts.forEach((y, i) => (i ? g.lineTo(20 + i * 27, y) : g.moveTo(20, y)));
      g.stroke();
      g.globalAlpha = 0.18;
      g.lineTo(236, 150);
      g.lineTo(20, 150);
      g.fillStyle = color;
      g.fill();
      g.globalAlpha = 1;
      for (let i = 0; i < 3; i++) {
        g.fillStyle = "#2A3A52";
        rr(g, 20 + i * 76, 132, 64, 14, 4);
        g.fill();
      }
    } else {
      // cards grid
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < 3; c++) {
          g.fillStyle = r === 0 && c === 0 ? color : "#22324A";
          rr(g, 16 + c * 78, 30 + r * 62, 68, 52, 6);
          g.fill();
        }
    }
  });
}

export function whiteboardTex(): THREE.CanvasTexture {
  return canvasTex("whiteboard", 512, 256, (g, w, h) => {
    g.fillStyle = "#FBFCFE";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#C9D2E0";
    g.lineWidth = 8;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.font = `700 26px ${DISPLAY}`;
    g.fillStyle = "#4C3FB6";
    g.fillText("4-week plan", 26, 46);
    // grid
    g.strokeStyle = "#B9C2D3";
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(26 + i * 92, 66);
      g.lineTo(26 + i * 92, 232);
      g.stroke();
    }
    const notes = ["#FDE68A", "#C4B5FD", "#A7F3D0", "#FBCFE8", "#BFDBFE", "#FED7AA"];
    for (let i = 0; i < 7; i++) {
      g.fillStyle = notes[i % notes.length]!;
      const x = 34 + (i % 4) * 92 + (i > 3 ? 20 : 0);
      const y = 76 + Math.floor(i / 4) * 70 + (i % 2) * 8;
      g.fillRect(x, y, 62, 52);
      g.fillStyle = "rgba(0,0,0,.18)";
      g.fillRect(x + 8, y + 14, 40, 4);
      g.fillRect(x + 8, y + 24, 30, 4);
    }
    g.strokeStyle = "#EC4899";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(430, 150, 46, 0, Math.PI * 2);
    g.stroke();
    g.font = `800 30px ${DISPLAY}`;
    g.fillStyle = "#0AC18E";
    g.fillText("GO", 410, 160);
  });
}

export function wallScreenTex(): THREE.CanvasTexture {
  return canvasTex("wallscreen", 512, 288, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "#0F1B2E");
    grd.addColorStop(1, "#0A1220");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.font = `700 20px ${FONT}`;
    g.fillStyle = "#93C5FD";
    g.fillText("MARKET SCAN", 24, 36);
    g.fillStyle = "#3B82F6";
    rr(g, 380, 18, 108, 28, 14);
    g.fill();
    g.fillStyle = "#fff";
    g.font = `800 16px ${FONT}`;
    g.fillText("LIVE", 416, 38);
    // bars
    const vals = [0.45, 0.7, 0.55, 0.85, 0.62, 0.92, 0.78];
    vals.forEach((v, i) => {
      g.fillStyle = i === 5 ? "#60A5FA" : "#25456F";
      const bh = v * 150;
      rr(g, 28 + i * 40, 240 - bh, 26, bh, 5);
      g.fill();
    });
    // scatter (positioning map)
    g.strokeStyle = "#2B3E5C";
    g.lineWidth = 2;
    g.strokeRect(320, 70, 168, 170);
    g.beginPath();
    g.moveTo(404, 70);
    g.lineTo(404, 240);
    g.moveTo(320, 155);
    g.lineTo(488, 155);
    g.stroke();
    [[340, 200], [372, 120], [430, 210], [455, 180], [350, 160]].forEach(([x, y]) => {
      g.fillStyle = "#64748B";
      g.beginPath();
      g.arc(x!, y!, 7, 0, Math.PI * 2);
      g.fill();
    });
    g.fillStyle = "#0AC18E";
    g.beginPath();
    g.arc(452, 96, 10, 0, Math.PI * 2);
    g.fill();
  });
}

export function moodboardTex(): THREE.CanvasTexture {
  return canvasTex("moodboard", 512, 256, (g, w, h) => {
    g.fillStyle = "#E9D7C1";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#C9AF91";
    g.lineWidth = 10;
    g.strokeRect(5, 5, w - 10, h - 10);
    const sw = ["#EC4899", "#F9A8D4", "#7C3AED", "#FDE68A", "#0F766E", "#FB7185", "#1E293B", "#FCE7F3"];
    sw.forEach((c, i) => {
      const x = 26 + (i % 4) * 118;
      const y = 26 + Math.floor(i / 4) * 112;
      g.save();
      g.translate(x + 48, y + 44);
      g.rotate(((i * 37) % 9 - 4) * 0.02);
      g.fillStyle = "#fff";
      g.fillRect(-52, -46, 104, 96);
      g.fillStyle = c;
      g.fillRect(-46, -40, 92, 64);
      g.fillStyle = "#D1D5DB";
      g.fillRect(-40, 30, 50, 6);
      g.restore();
      g.fillStyle = "#EF4444";
      g.beginPath();
      g.arc(x + 48, y + 4, 6, 0, Math.PI * 2);
      g.fill();
    });
  });
}

export function logoWallTex(): THREE.CanvasTexture {
  return canvasTex("logowall", 512, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "#0E2A25");
    grd.addColorStop(1, "#0B1B1A");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    // mark
    g.fillStyle = "#0AC18E";
    rr(g, 44, 78, 100, 100, 26);
    g.fill();
    g.fillStyle = "#0B1B1A";
    g.beginPath();
    g.moveTo(94, 98);
    g.quadraticCurveTo(122, 120, 112, 152);
    g.lineTo(76, 152);
    g.quadraticCurveTo(66, 120, 94, 98);
    g.fill();
    g.fillStyle = "#0AC18E";
    g.beginPath();
    g.arc(94, 126, 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#F5C542";
    g.beginPath();
    g.moveTo(84, 156);
    g.lineTo(104, 156);
    g.lineTo(94, 172);
    g.fill();
    g.fillStyle = "#EAF0F7";
    g.font = `800 52px ${DISPLAY}`;
    g.fillText("LaunchDesk", 164, 140);
    g.fillStyle = "#7FE3C4";
    g.font = `600 20px ${FONT}`;
    g.fillText("Your startup team, for pennies.", 166, 174);
  });
}

export function signTex(key: string, text: string, color: string, bg = "#111827"): THREE.CanvasTexture {
  return canvasTex(`sign:${key}`, 256, 96, (g, w, h) => {
    g.fillStyle = bg;
    rr(g, 0, 0, w, h, 22);
    g.fill();
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.fillStyle = color;
    g.font = `800 46px ${DISPLAY}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

export function sketchTex(): THREE.CanvasTexture {
  return canvasTex("sketch", 256, 256, (g, w, h) => {
    g.fillStyle = "#FFFDF7";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#F97362";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(90, 100, 46, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "#334155";
    g.lineWidth = 4;
    g.strokeRect(150, 60, 70, 70);
    g.beginPath();
    g.moveTo(40, 190);
    g.lineTo(220, 190);
    g.moveTo(40, 214);
    g.lineTo(170, 214);
    g.stroke();
  });
}

export function rugTex(color: string): THREE.CanvasTexture {
  return canvasTex(`rug:${color}`, 256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color;
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,.55)";
    g.lineWidth = 5;
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2 - 22, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2 - 70, 0, Math.PI * 2);
    g.stroke();
  });
}

/** Soft white→transparent gradient used for the coloured floor glow. */
export function glowTex(): THREE.CanvasTexture {
  return canvasTex("glow", 64, 64, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.35, "rgba(255,255,255,.45)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
}

export function radialTex(): THREE.CanvasTexture {
  return canvasTex("radial", 128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
}

export function floorTex(): THREE.CanvasTexture {
  const t = canvasTex("floor", 256, 256, (g, w, h) => {
    g.fillStyle = "#F4F6F9";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(120,135,160,.10)";
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(i * 64, 0);
      g.lineTo(i * 64, h);
      g.moveTo(0, i * 64);
      g.lineTo(w, i * 64);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
