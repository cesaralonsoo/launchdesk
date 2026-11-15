// WS-WORLD v7 · Pixel-art look for the 3D canvas only (the DOM UI stays crisp).
// The scene renders into a low-resolution linear target (one "art pixel" = `size` device pixels); a full-screen pass
// then tone-maps, draws a 1-pixel ink outline on silhouettes and depth breaks, quantises colour with a 4×4 Bayer
// dither, and writes into a canvas whose drawing buffer has that same low resolution. CSS `image-rendering: pixelated`
// upscales it with hard edges. Cheaper than native resolution: the 3D pass touches 4–9× fewer pixels.
//
// ?pixel=0 native (DEFAULT, owner's call) · ?pixel=1 soft pixels (2 CSS px, outline, gentle dither) · ?pixel=2 chunky
// (3 CSS px, stronger palette quantisation, no MSAA).
import * as THREE from "three";

export type PixelMode = 0 | 1 | 2;
/** Owner update (v7): no visible renderer pixelation by default. ?pixel=1|2 stay available as opt-in looks. */
export const DEFAULT_PIXEL: PixelMode = 0;

export function readPixelMode(search = location.search): PixelMode {
  const v = new URLSearchParams(search).get("pixel");
  return v === "0" ? 0 : v === "2" ? 2 : v === "1" ? 1 : DEFAULT_PIXEL;
}

/** Size of one art pixel in CSS px for a mode and viewport width (phones get slightly finer pixels). */
export function pixelCss(mode: PixelMode, cssW: number): number {
  if (mode === 0) return 0;
  const phone = cssW < 700;
  return mode === 1 ? (phone ? 1.5 : 2) : phone ? 2 : 3;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 res;
uniform float near;
uniform float far;
uniform float outline;   // 0..1 ink strength
uniform float levels;    // colour levels per channel after dithering
uniform float dither;    // 0..1 dither amplitude (in quantisation steps)
uniform vec3 ink;        // outline tint (scene-dependent: dark navy by night, warm umber by day)
varying vec2 vUv;

float lin(float d) { return (near * far) / (far - d * (far - near)); }
float bayer(vec2 p) {
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0 - 0.5;
}
void main() {
  vec2 px = 1.0 / res;
  vec4 c = texture2D(tColor, vUv);
  float a = c.a;
  // silhouettes: this pixel is solid and a neighbour is sky, or a neighbour is clearly farther away (depth break)
  float zc = lin(texture2D(tDepth, vUv).r);
  float edge = 0.0;
  vec2 o[4] = vec2[4](vec2(px.x, 0.0), vec2(-px.x, 0.0), vec2(0.0, px.y), vec2(0.0, -px.y));
  for (int k = 0; k < 4; k++) {
    float an = texture2D(tColor, vUv + o[k]).a;
    float zn = lin(texture2D(tDepth, vUv + o[k]).r);
    edge = max(edge, step(0.5, a) * (1.0 - step(0.02, an)));
    edge = max(edge, step(0.5, a) * smoothstep(0.006, 0.022, (zn - zc) / zc) * 0.8);
  }
  if (a < 0.002) { gl_FragColor = vec4(0.0); return; }
  // unpremultiply → tone map → output colour space
  gl_FragColor = vec4(c.rgb / a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec3 col = gl_FragColor.rgb;
  col = mix(col, col * ink, edge * outline);
  float q = levels - 1.0;
  col = floor(col * q + 0.5 + bayer(gl_FragCoord.xy) * dither) / q;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0) * a, a);
}`;

export interface PixelPass {
  readonly mode: PixelMode;
  /** CSS px per art pixel (0 = off). */
  readonly cssPx: number;
  setMode(m: PixelMode): void;
  /** Call from the world's resize with the CSS size of the canvas. Sets the renderer pixel ratio. */
  resize(cssW: number, cssH: number): void;
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
  /** Compile every visible material for the target the scene really renders into (no first-use hitch). */
  compile(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
  /** Outline tint, 0..1 night (cool ink) → day (warm ink). */
  setInk(night: number): void;
  dispose(): void;
}

export function createPixelPass(renderer: THREE.WebGLRenderer, opts: { mode: PixelMode; quality: "low" | "high" }): PixelPass {
  let mode = opts.mode;
  const canvas = renderer.domElement;
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true });
  rt.texture.minFilter = rt.texture.magFilter = THREE.NearestFilter;
  rt.texture.generateMipmaps = false;
  rt.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.NearestFilter;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, res: { value: new THREE.Vector2(1, 1) },
      near: { value: 1 }, far: { value: 1000 }, outline: { value: 0.5 }, levels: { value: 48 }, dither: { value: 0.6 },
      ink: { value: new THREE.Color(0.42, 0.36, 0.34) },
    },
    depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: true,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const qScene = new THREE.Scene();
  qScene.add(quad);
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let cssPx = 0, cw = 1, ch = 1;
  const dayInk = new THREE.Color(0.46, 0.38, 0.34), nightInk = new THREE.Color(0.3, 0.32, 0.46);

  function apply() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    cssPx = pixelCss(mode, cw);
    if (!cssPx) {
      renderer.setPixelRatio(Math.min(opts.quality === "high" ? 2 : 1, dpr));
      canvas.style.imageRendering = "";
    } else {
      // whole device pixels per art pixel → uniform, hard-edged upscale
      const dev = Math.max(1, Math.round(cssPx * dpr));
      renderer.setPixelRatio(dpr / dev);
      canvas.style.imageRendering = "pixelated";
    }
    renderer.setSize(cw, ch, false);
    const b = renderer.getDrawingBufferSize(new THREE.Vector2());
    rt.setSize(b.x, b.y);
    mat.uniforms.res!.value.set(b.x, b.y);
    mat.uniforms.outline!.value = mode === 2 ? 0.62 : 0.5;
    mat.uniforms.levels!.value = mode === 2 ? 24 : 40;
    mat.uniforms.dither!.value = mode === 2 ? 0.65 : 0.7;
  }

  return {
    get mode() { return mode; },
    get cssPx() { return cssPx; },
    setMode(m) {
      if (m === mode) return;
      mode = m;
      apply();
    },
    resize(w, h) {
      cw = Math.max(1, w);
      ch = Math.max(1, h);
      apply();
    },
    render(scene, camera) {
      if (!cssPx) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      mat.uniforms.near!.value = camera.near;
      mat.uniforms.far!.value = camera.far;
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(qScene, qCam);
    },
    compile(scene, camera) {
      renderer.setRenderTarget(cssPx ? rt : null);
      renderer.compile(scene, camera);
      renderer.setRenderTarget(null);
    },
    setInk(night) {
      (mat.uniforms.ink!.value as THREE.Color).copy(dayInk).lerp(nightInk, night);
    },
    dispose() {
      rt.depthTexture?.dispose();
      rt.dispose();
      mat.dispose();
      quad.geometry.dispose();
    },
  };
}
