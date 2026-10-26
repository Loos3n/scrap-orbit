import { CanvasSource, Texture } from 'pixi.js';

/**
 * All of the station's art is painted once at startup with Canvas 2D (gradients, soft light,
 * panel detail) and uploaded as textures. Sprites then just move, spin and fade them.
 * Sizes are in world units; textures are painted at RES pixels per unit so they stay sharp.
 */
const RES = 4;

type Ctx = CanvasRenderingContext2D;

/**
 * A material pass laid over a finished painting, using only its alpha as a height map:
 * a bevel lit from the upper left, a soft inner shadow, fine grain and patchy grime.
 * This gives every hard-surface sprite the same light and a painted, worn-in feel.
 */
export interface Finish {
  /** Width of the bevel in world units. */
  bevel?: number;
  /** How strongly the bevel lights and shades the edges (0 to 1). */
  light?: number;
  /** Per-pixel grain (0 to 1). */
  grain?: number;
  /** Large soft patches of wear and grime (0 to 1). */
  grime?: number;
  seed?: number;
}

/** Separable box blur of a single channel, in place. */
function boxBlur(src: Float32Array, w: number, h: number, r: number): void {
  if (r < 1) return;
  const tmp = new Float32Array(src.length);
  const span = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / span;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      src[y * w + x] = acc / span;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
}

/** Smooth value noise in 0..1, tiled on a grid of `cell` pixels. */
function valueNoise(seed: number, cell: number) {
  const hash = (x: number, y: number) => {
    let n = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (px: number, py: number) => {
    const x = px / cell;
    const y = py / cell;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash(x0, y0) + (hash(x0 + 1, y0) - hash(x0, y0)) * sx;
    const b = hash(x0, y0 + 1) + (hash(x0 + 1, y0 + 1) - hash(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

function applyFinish(canvas: HTMLCanvasElement, res: number, f: Finish): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  let img: ImageData;
  try {
    img = ctx.getImageData(0, 0, w, h);
  } catch {
    return;
  }
  const d = img.data;
  const n = w * h;
  const height = new Float32Array(n);
  for (let i = 0; i < n; i++) height[i] = d[i * 4 + 3] / 255;
  const deep = height.slice();
  const bevelPx = Math.max(1, Math.round((f.bevel ?? 1.2) * res));
  boxBlur(height, w, h, bevelPx);
  boxBlur(height, w, h, Math.max(1, bevelPx >> 1));
  boxBlur(deep, w, h, bevelPx * 3);
  const light = (f.light ?? 0.6) * bevelPx * 1.6;
  const grain = (f.grain ?? 0.35) * 26;
  const grime = (f.grime ?? 0.35) * 0.32;
  const rand = rng(f.seed ?? 7);
  // Wear changes slowly across a sprite, so it is worked out on a coarse grid and looked up.
  const big = valueNoise(f.seed ?? 7, 9 * res);
  const mid = valueNoise((f.seed ?? 7) + 1, 3 * res);
  const cw = (w >> 2) + 1;
  const wearMap = new Float32Array(cw * ((h >> 2) + 1));
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) wearMap[(y >> 2) * cw + (x >> 2)] = big(x, y) * 0.65 + mid(x, y) * 0.35;
  const lx = -0.62;
  const ly = -0.78;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = d[i * 4 + 3];
      if (a === 0) continue;
      // Slope of the blurred alpha: it rises inward, so the upper-left edge faces the light.
      const gx = height[i + 1] - height[i - 1];
      const gy = height[i + w] - height[i - w];
      let shade = -(gx * lx + gy * ly) * light;
      // Deep inside a shape stays a touch brighter than near its edges (soft occlusion).
      shade += (deep[i] - 0.85) * 0.18;
      const wear = wearMap[(y >> 2) * cw + (x >> 2)];
      const g = (rand() - 0.5) * grain;
      const dirt = 1 - Math.max(0, wear - 0.45) * grime * 2.2;
      for (let k = 0; k < 3; k++) {
        let v = d[i * 4 + k];
        v = shade > 0 ? v + (255 - v) * Math.min(0.85, shade) : v * (1 + Math.max(-0.75, shade));
        d[i * 4 + k] = Math.max(0, Math.min(255, v * dirt + g));
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function paintCanvas(w: number, h: number, draw: (ctx: Ctx) => void, res: number, finish?: Finish): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * res);
  canvas.height = Math.ceil(h * res);
  const ctx = canvas.getContext('2d', finish ? { willReadFrequently: true } : undefined)!;
  ctx.scale(res, res);
  draw(ctx);
  if (finish) applyFinish(canvas, res, finish);
  return canvas;
}

export function paint(w: number, h: number, draw: (ctx: Ctx) => void, res = RES, finish?: Finish): Texture {
  return new Texture({ source: new CanvasSource({ resource: paintCanvas(w, h, draw, res, finish), resolution: res, autoGenerateMipmaps: true }) });
}

/** The same painting as a PNG data URL, for the menus. Empty if the canvas can't be read. */
function paintUrl(w: number, h: number, draw: (ctx: Ctx) => void, res: number): string {
  try {
    return paintCanvas(w, h, draw, res).toDataURL();
  } catch {
    return '';
  }
}

const TAU = Math.PI * 2;
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Seeded random so the art is the same on every launch. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function radial(ctx: Ctx, x: number, y: number, r: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function linear(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** A soft white glow; tint it and draw with additive blending. */
export const glow = () =>
  paint(64, 64, (ctx) => {
    ctx.fillStyle = radial(ctx, 32, 32, 32, [
      [0, 'rgba(255,255,255,1)'],
      [0.2, 'rgba(255,255,255,0.55)'],
      [0.5, 'rgba(255,255,255,0.15)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.fillRect(0, 0, 64, 64);
  }, 2);

/** A streak for sparks, stretched along their velocity. */
export const streak = () =>
  paint(32, 8, (ctx) => {
    const g = linear(ctx, 0, 0, 32, 0, [
      [0, 'rgba(255,255,255,0)'],
      [0.7, 'rgba(255,255,255,0.8)'],
      [1, 'rgba(255,255,255,1)'],
    ]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(16, 4, 16, 3, 0, 0, TAU);
    ctx.fill();
  }, 4);

/** A four-point lens flare for the brightest stars. */
export const flare = () =>
  paint(48, 48, (ctx) => {
    ctx.fillStyle = radial(ctx, 24, 24, 10, [
      [0, 'rgba(255,255,255,1)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.fillRect(0, 0, 48, 48);
    for (const [w, h] of [[24, 1.2], [1.2, 24]]) {
      ctx.fillStyle = radial(ctx, 24, 24, 24, [
        [0, 'rgba(255,255,255,0.9)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
      ctx.beginPath();
      ctx.ellipse(24, 24, w, h, 0, 0, TAU);
      ctx.fill();
    }
  }, 2);

/** Deep-space backdrop: gradient, nebula clouds and a dusting of faint stars. */
export function backdrop(
  w: number,
  h: number,
  sky: [string, string, string] = ['#0a0b22', '#12123a', '#0b0d26'],
  nebula: [string, string, string, string, string] = ['#6b3fc2', '#c23f8f', '#1f7fa8', '#3f4fc2', '#2a8f9c'],
): Texture {
  return paint(w, h, (ctx) => {
    ctx.fillStyle = linear(ctx, 0, 0, 0, h, [
      [0, sky[0]],
      [0.55, sky[1]],
      [1, sky[2]],
    ]);
    ctx.fillRect(0, 0, w, h);
    const r = rng(7);
    const clouds: [number, number, number, string, number][] = [
      [0.12, 0.18, 0.75, nebula[0], 0.22],
      [0.3, 0.05, 0.45, nebula[1], 0.12],
      [0.85, 0.42, 0.6, nebula[2], 0.2],
      [0.7, 0.9, 0.7, nebula[3], 0.18],
      [0.05, 0.75, 0.5, nebula[4], 0.1],
    ];
    ctx.globalCompositeOperation = 'lighter';
    for (const [cx, cy, cr, color, a] of clouds) {
      // Each cloud is many overlapping puffs, which reads as soft and lumpy rather than a disc.
      for (let i = 0; i < 26; i++) {
        const px = (cx + (r() - 0.5) * cr * 0.8) * w;
        const py = (cy + (r() - 0.5) * cr * 0.6) * h;
        const pr = (0.15 + r() * 0.35) * cr * Math.max(w, h);
        ctx.fillStyle = radial(ctx, px, py, pr, [
          [0, rgba(color, a * (0.3 + r() * 0.5))],
          [1, rgba(color, 0)],
        ]);
        ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // Dark dust lanes cut through the nebula.
    for (let i = 0; i < 10; i++) {
      const px = r() * w;
      const py = r() * h;
      const pr = (0.08 + r() * 0.18) * Math.max(w, h);
      ctx.fillStyle = radial(ctx, px, py, pr, [
        [0, 'rgba(6,6,20,0.35)'],
        [1, 'rgba(6,6,20,0)'],
      ]);
      ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    for (let i = 0; i < (w * h) / 900; i++) {
      ctx.fillStyle = `rgba(220,225,255,${0.15 + r() * 0.35})`;
      ctx.fillRect(r() * w, r() * h, 0.6, 0.6);
    }
  }, Math.min(2, window.devicePixelRatio || 1));
}

/** A banded gas giant with a thin ring, lit from the upper left. */
export function planet(size: number, bands = ['#e8a37a', '#b0627a', '#6a3d8a', '#3d2a6a'], atmosphere = '#ffaa78'): Texture {
  const pad = size * 0.35;
  const S = size + pad * 2;
  return paint(S, S, (ctx) => {
    const c = S / 2;
    const r = size / 2;
    // Atmosphere glow.
    ctx.fillStyle = radial(ctx, c, c, r * 1.25, [
      [0.75, rgba(atmosphere, 0.35)],
      [1, rgba(atmosphere, 0)],
    ]);
    ctx.fillRect(0, 0, S, S);
    // Back half of the ring.
    const ring = (front: boolean) => {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(-0.35);
      ctx.beginPath();
      if (front) ctx.rect(-S, 0, S * 2, S);
      else ctx.rect(-S, -S, S * 2, S);
      ctx.clip();
      for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = `rgba(${210 - i * 8},${180 - i * 10},${220 - i * 4},${0.18 + (i % 2) * 0.12})`;
        ctx.lineWidth = r * 0.035;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * (1.45 + i * 0.05), r * (0.28 + i * 0.012), 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    };
    ring(false);
    // Body.
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, r, 0, TAU);
    ctx.clip();
    ctx.fillStyle = linear(ctx, c, c - r, c, c + r, [
      [0, bands[0]],
      [0.35, bands[1]],
      [0.7, bands[2]],
      [1, bands[3]],
    ]);
    ctx.fillRect(c - r, c - r, size, size);
    const rr = rng(3);
    for (let i = 0; i < 22; i++) {
      const y = c - r + rr() * size;
      const bh = r * (0.03 + rr() * 0.12);
      ctx.fillStyle = rr() < 0.5 ? `rgba(255,220,190,${0.06 + rr() * 0.14})` : `rgba(60,20,80,${0.08 + rr() * 0.18})`;
      ctx.beginPath();
      ctx.ellipse(c, y, r * 1.2, bh, (rr() - 0.5) * 0.08, 0, TAU);
      ctx.fill();
    }
    // Turbulent cloud bands: stretched noise, warped sideways, laid over the colour bands.
    const px = Math.ceil(size * 1.3);
    const tex = document.createElement('canvas');
    tex.width = px;
    tex.height = px;
    const tctx = tex.getContext('2d');
    if (tctx) {
      const img = tctx.createImageData(px, px);
      const n1 = valueNoise(21, px / 5);
      const n2 = valueNoise(22, px / 14);
      const n3 = valueNoise(23, px / 40);
      for (let y = 0; y < px; y++) {
        for (let x = 0; x < px; x++) {
          const warp = (n1(x, y * 3) - 0.5) * px * 0.08;
          const band = Math.sin((y + warp) / px * 38 + n2(x * 0.25, y) * 4);
          const v = 0.5 + band * 0.22 + (n2(x * 0.3, y * 2) - 0.5) * 0.35 + (n3(x * 0.5, y * 1.5) - 0.5) * 0.25;
          const i = (y * px + x) * 4;
          const g = Math.max(0, Math.min(255, v * 255));
          img.data[i] = g;
          img.data[i + 1] = g;
          img.data[i + 2] = g;
          img.data[i + 3] = 255;
        }
      }
      tctx.putImageData(img, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.55;
      ctx.drawImage(tex, c - r, c - r, size, size);
      ctx.restore();
    }
    // A storm.
    ctx.fillStyle = radial(ctx, c + r * 0.25, c + r * 0.2, r * 0.16, [
      [0, 'rgba(255,230,210,0.55)'],
      [0.6, 'rgba(220,120,110,0.35)'],
      [1, 'rgba(220,120,110,0)'],
    ]);
    ctx.beginPath();
    ctx.ellipse(c + r * 0.25, c + r * 0.2, r * 0.2, r * 0.09, 0.1, 0, TAU);
    ctx.fill();
    // Night side.
    ctx.fillStyle = radial(ctx, c - r * 0.45, c - r * 0.5, r * 1.9, [
      [0, 'rgba(10,8,30,0)'],
      [0.45, 'rgba(10,8,30,0.1)'],
      [0.75, 'rgba(10,8,30,0.7)'],
      [1, 'rgba(10,8,30,0.95)'],
    ]);
    ctx.fillRect(c - r, c - r, size, size);
    ctx.restore();
    // Rim light.
    ctx.strokeStyle = rgba(atmosphere, 0.5);
    ctx.lineWidth = r * 0.02;
    ctx.beginPath();
    ctx.arc(c, c, r, Math.PI * 0.95, Math.PI * 1.75);
    ctx.stroke();
    ring(true);
  }, 2.5);
}

// ---------- The station ----------

function rivetRing(ctx: Ctx, c: number, r: number, n: number, color: string) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 0.7, 0, TAU);
    ctx.fill();
  }
}

/** Brushed-metal sheen: a conic sweep of light and dark, where the browser supports it. */
function sheen(ctx: Ctx, c: number, alpha: number): CanvasGradient | string {
  if (!('createConicGradient' in ctx)) return 'rgba(0,0,0,0)';
  const g = ctx.createConicGradient(-0.6, c, c);
  const stops: [number, number][] = [[0, 0.5], [0.08, 1], [0.17, 0.3], [0.3, 0.05], [0.45, 0.6], [0.55, 0.15], [0.7, 0.02], [0.85, 0.35], [1, 0.5]];
  for (const [o, v] of stops) g.addColorStop(o, `rgba(255,255,255,${(v * alpha).toFixed(3)})`);
  return g;
}

/**
 * The main hull disc: a bevelled outer rim, a ring of armour plates with vents and greebles,
 * a lit window band and a recessed socket for the reactor. Lit from the upper left.
 */
export const hull = () =>
  paint(140, 140, (ctx) => {
    const c = 70;
    const r = rng(11);
    // Drop shadow, cast down and to the right.
    ctx.fillStyle = radial(ctx, c + 5, c + 7, 72, [
      [0.78, 'rgba(0,0,12,0.55)'],
      [1, 'rgba(0,0,12,0)'],
    ]);
    ctx.fillRect(0, 0, 140, 140);
    // Base metal.
    ctx.fillStyle = radial(ctx, c - 24, c - 28, 100, [
      [0, '#a9b0e8'],
      [0.4, '#5b63b0'],
      [1, '#1c2052'],
    ]);
    ctx.beginPath();
    ctx.arc(c, c, 62, 0, TAU);
    ctx.fill();

    // Armour plates between the rim and the window band, in two tones.
    const plates = 18;
    for (let i = 0; i < plates; i++) {
      const a0 = (i / plates) * TAU + 0.02;
      const a1 = a0 + TAU / plates - 0.04;
      const tone = i % 3 === 0 ? 'rgba(10,14,50,0.22)' : i % 3 === 1 ? 'rgba(255,255,255,0.05)' : 'rgba(10,14,50,0.1)';
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.arc(c, c, 54, a0, a1);
      ctx.arc(c, c, 49.5, a1, a0, true);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(c, c, 42.5, a0, a1);
      ctx.arc(c, c, 38.5, a1, a0, true);
      ctx.closePath();
      ctx.fill();
    }
    // Hazard stripes where the claw and antenna mount (top and bottom).
    for (const mid of [-Math.PI / 2, Math.PI / 2]) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(c, c, 54, mid - 0.2, mid + 0.2);
      ctx.arc(c, c, 49.5, mid + 0.2, mid - 0.2, true);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = '#ffcf5a';
      ctx.fillRect(0, 0, 140, 140);
      ctx.strokeStyle = '#2a1e10';
      ctx.lineWidth = 2;
      for (let k = -140; k < 280; k += 5) {
        ctx.beginPath();
        ctx.moveTo(k, 0);
        ctx.lineTo(k + 140, 140);
        ctx.stroke();
      }
      ctx.restore();
    }
    // Greebles: small boxes and vent slits on the plate ring.
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU;
      if (Math.abs(Math.sin(a)) > 0.93) continue; // keep the hazard plates clean
      const rad = 50 + r() * 3;
      ctx.save();
      ctx.translate(c + Math.cos(a) * rad, c + Math.sin(a) * rad);
      ctx.rotate(a + Math.PI / 2);
      if (r() < 0.5) {
        const w = 2 + r() * 3;
        ctx.fillStyle = 'rgba(14,16,48,0.6)';
        ctx.fillRect(-w / 2 + 0.4, -0.6, w, 2);
        ctx.fillStyle = 'rgba(200,208,255,0.55)';
        ctx.fillRect(-w / 2, -1, w, 1.6);
      } else {
        ctx.fillStyle = 'rgba(10,12,40,0.7)';
        for (let k = -1; k <= 1; k++) ctx.fillRect(k * 1.3 - 0.4, -1.2, 0.7, 2.4);
      }
      ctx.restore();
    }
    // Panel seams.
    ctx.strokeStyle = 'rgba(8,10,36,0.6)';
    ctx.lineWidth = 0.7;
    for (const rad of [54, 49.5, 42.5, 38.5]) {
      ctx.beginPath();
      ctx.arc(c, c, rad, 0, TAU);
      ctx.stroke();
    }
    // Light catches the upper-left edge of each seam.
    ctx.strokeStyle = 'rgba(220,226,255,0.35)';
    for (const rad of [54.6, 43.1]) {
      ctx.beginPath();
      ctx.arc(c, c, rad, Math.PI * 1.0, Math.PI * 1.55);
      ctx.stroke();
    }
    // The window band: lit and dark windows set into a dark strip.
    ctx.fillStyle = 'rgba(10,12,40,0.75)';
    ctx.beginPath();
    ctx.arc(c, c, 48, 0, TAU);
    ctx.arc(c, c, 44, 0, TAU, true);
    ctx.fill();
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * TAU;
      if (r() < 0.2) continue;
      const lit = r() < 0.78;
      ctx.fillStyle = lit ? (r() < 0.8 ? `rgba(255,${205 + Math.floor(r() * 40)},130,0.95)` : 'rgba(150,230,255,0.95)') : 'rgba(40,46,100,0.9)';
      ctx.save();
      ctx.translate(c + Math.cos(a) * 46, c + Math.sin(a) * 46);
      ctx.rotate(a);
      ctx.fillRect(-1, -1.4, 2, 2.8);
      ctx.restore();
    }
    rivetRing(ctx, c, 58, 56, 'rgba(190,198,255,0.4)');
    // Brushed-metal sheen over everything outside the socket.
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = sheen(ctx, c, 0.5);
    ctx.beginPath();
    ctx.arc(c, c, 62, 0, TAU);
    ctx.arc(c, c, 38, 0, TAU, true);
    ctx.fill();
    ctx.restore();
    // Bevelled rim: bright on the lit side, dark on the far side.
    ctx.lineWidth = 3;
    ctx.strokeStyle = linear(ctx, 20, 20, 120, 120, [
      [0, 'rgba(240,244,255,0.95)'],
      [0.45, 'rgba(140,150,220,0.55)'],
      [1, 'rgba(20,22,70,0.9)'],
    ]);
    ctx.beginPath();
    ctx.arc(c, c, 60.5, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(5,6,24,0.7)';
    ctx.beginPath();
    ctx.arc(c, c, 62.3, 0, TAU);
    ctx.stroke();
    // Recessed socket for the reactor, with an inner shadow.
    ctx.fillStyle = radial(ctx, c, c, 38, [
      [0, '#05061a'],
      [0.7, '#0e1038'],
      [0.92, '#1d2160'],
      [1, '#3a40a0'],
    ]);
    ctx.beginPath();
    ctx.arc(c, c, 38, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = linear(ctx, 30, 30, 110, 110, [
      [0, 'rgba(0,0,10,0.8)'],
      [1, 'rgba(160,170,255,0.6)'],
    ]);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(c, c, 37.4, 0, TAU);
    ctx.stroke();
  }, 4, { bevel: 1.4, light: 0.45, grain: 0.3, grime: 0.3, seed: 2 });

/**
 * Light and shade laid over the hub after the rotating parts, so the light stays put while
 * the habitat ring turns. Two layers: `dark` drawn normally, `light` drawn additively.
 */
export const hubShade = (kind: 'dark' | 'light') =>
  paint(140, 140, (ctx) => {
    const c = 70;
    ctx.beginPath();
    ctx.arc(c, c, 62, 0, TAU);
    ctx.clip();
    if (kind === 'dark') {
      ctx.fillStyle = radial(ctx, c - 30, c - 34, 150, [
        [0, 'rgba(4,4,20,0)'],
        [0.45, 'rgba(4,4,20,0)'],
        [0.8, 'rgba(4,4,20,0.42)'],
        [1, 'rgba(4,4,20,0.6)'],
      ]);
    } else {
      ctx.fillStyle = radial(ctx, c - 30, c - 34, 70, [
        [0, 'rgba(255,255,255,0.18)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
    }
    ctx.fillRect(0, 0, 140, 140);
    if (kind === 'light') {
      // Warm bounce light from the gas giant on the lower right.
      ctx.fillStyle = radial(ctx, c + 52, c + 46, 46, [
        [0, 'rgba(255,170,120,0.28)'],
        [1, 'rgba(255,170,120,0)'],
      ]);
      ctx.fillRect(0, 0, 140, 140);
    }
  }, 2);

/** The rotating habitat ring with lit modules. Lit evenly; the hub shade adds direction. */
export const habitatRing = () =>
  paint(124, 124, (ctx) => {
    const c = 62;
    ctx.lineCap = 'butt';
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * TAU + 0.07;
      const a1 = a0 + TAU / 8 - 0.14;
      // Module body, rounded by a gradient across its width.
      const g = ctx.createRadialGradient(c, c, 52, c, c, 60);
      g.addColorStop(0, '#5a62b0');
      g.addColorStop(0.45, '#d4d9ff');
      g.addColorStop(1, '#4a52a0');
      ctx.strokeStyle = g;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(c, c, 56, a0, a1);
      ctx.stroke();
      // End caps.
      for (const a of [a0, a1]) {
        ctx.fillStyle = '#2b3170';
        ctx.save();
        ctx.translate(c + Math.cos(a) * 56, c + Math.sin(a) * 56);
        ctx.rotate(a);
        ctx.fillRect(-4, -1, 8, 2);
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(20,22,60,0.55)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(c, c, 56, a0 + 0.04, a1 - 0.04);
      ctx.stroke();
      // Lit windows along each module.
      for (let k = 1; k < 7; k++) {
        const a = a0 + ((a1 - a0) * k) / 7;
        ctx.fillStyle = k % 3 === 0 ? 'rgba(150,230,255,0.95)' : 'rgba(255,214,140,0.95)';
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * 57.5, c + Math.sin(a) * 57.5, 0.75, 0, TAU);
        ctx.fill();
      }
    }
    // Spokes to the hub.
    ctx.strokeStyle = 'rgba(150,158,230,0.7)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + TAU / 16;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 46, c + Math.sin(a) * 46);
      ctx.lineTo(c + Math.cos(a) * 52.5, c + Math.sin(a) * 52.5);
      ctx.stroke();
    }
  }, 4, { bevel: 1, light: 0.5, grain: 0.3, grime: 0.25, seed: 3 });

/** The reactor core: a glossy sphere. Painted white so it can be tinted for Overdrive. */
export const core = () =>
  paint(64, 64, (ctx) => {
    ctx.fillStyle = radial(ctx, 26, 24, 34, [
      [0, '#ffffff'],
      [0.3, '#f4f4f4'],
      [0.75, '#b0b0b0'],
      [1, '#7a7a7a'],
    ]);
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, TAU);
    ctx.fill();
    // Fresnel rim: the edge of a glowing sphere is brighter.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(32, 32, 29, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(22, 18, 7, 3.6, -0.6, 0, TAU);
    ctx.fill();
  }, 4);

/** Swirling plasma inside the core; two copies counter-rotate, drawn additively. */
export const plasma = (seed: number) =>
  paint(64, 64, (ctx) => {
    const r = rng(seed);
    ctx.save();
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, TAU);
    ctx.clip();
    ctx.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const rad = 6 + r() * 20;
      const a0 = r() * TAU;
      ctx.strokeStyle = `rgba(255,255,255,${0.15 + r() * 0.35})`;
      ctx.lineWidth = 0.6 + r() * 1.8;
      ctx.beginPath();
      ctx.arc(32 + (r() - 0.5) * 6, 32 + (r() - 0.5) * 6, rad, a0, a0 + 0.6 + r() * 1.6);
      ctx.stroke();
    }
    ctx.restore();
  }, 3);

/** Soft light rays fanning out from the core. */
export const rays = () =>
  paint(128, 128, (ctx) => {
    const c = 64;
    const r = rng(5);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + r() * 0.2;
      const w = 0.05 + r() * 0.08;
      const len = 40 + r() * 24;
      ctx.fillStyle = radial(ctx, c, c, len, [
        [0, 'rgba(255,255,255,0.5)'],
        [0.4, 'rgba(255,255,255,0.18)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, len, a - w, a + w);
      ctx.closePath();
      ctx.fill();
    }
  }, 2);

/** A thin containment ring with tick marks that spins around the core. */
export const reactorRing = () =>
  paint(80, 80, (ctx) => {
    const c = 40;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(c, c, 34, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      const long = i % 4 === 0;
      ctx.lineWidth = long ? 1.2 : 0.6;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 34, c + Math.sin(a) * 34);
      ctx.lineTo(c + Math.cos(a) * (long ? 38 : 36), c + Math.sin(a) * (long ? 38 : 36));
      ctx.stroke();
    }
    // Three brighter arcs, like magnetic clamps.
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      ctx.beginPath();
      ctx.arc(c, c, 31.5, a, a + 0.5);
      ctx.stroke();
    }
  }, 3);

/** Darkens the screen's edges to frame the station. Stretched to the screen. */
export const vignette = () =>
  paint(64, 64, (ctx) => {
    ctx.fillStyle = radial(ctx, 32, 32, 46, [
      [0, 'rgba(2,2,14,0)'],
      [0.55, 'rgba(2,2,14,0)'],
      [1, 'rgba(2,2,14,0.75)'],
    ]);
    ctx.fillRect(0, 0, 64, 64);
  }, 2);

/** A solar array wing: a braced truss and two panels of cells, each catching the light. */
export const solarWing = () =>
  paint(64, 30, (ctx) => {
    // Strut: a solid boom with a lit top edge and bolted collars.
    ctx.fillStyle = linear(ctx, 0, 12, 0, 18, [
      [0, '#c5cbff'],
      [0.5, '#6a72c0'],
      [1, '#2b3170'],
    ]);
    ctx.fillRect(0, 12.5, 19, 5);
    ctx.fillStyle = '#20264f';
    for (const x of [4, 10]) ctx.fillRect(x, 12, 1.6, 6);
    const r = rng(19);
    for (const [x0, w] of [[19, 21], [42, 21]] as const) {
      // Frame.
      ctx.fillStyle = '#c9a24a';
      ctx.fillRect(x0, 0.5, w, 29);
      // Cells, each a slightly different blue so the panel shimmers.
      const cols = 4;
      const rows = 6;
      const cw = (w - 2) / cols;
      const ch = 27 / rows;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = x0 + 1 + i * cw;
          const y = 1.5 + j * ch;
          const v = r() * 0.25;
          ctx.fillStyle = linear(ctx, x, y, x + cw, y + ch, [
            [0, `rgb(${70 + v * 80},${110 + v * 80},255)`],
            [1, `rgb(${20 + v * 40},${40 + v * 50},${130 + v * 60})`],
          ]);
          ctx.fillRect(x + 0.25, y + 0.25, cw - 0.5, ch - 0.5);
          ctx.fillStyle = 'rgba(200,220,255,0.18)';
          ctx.fillRect(x + cw / 2 - 0.1, y + 0.25, 0.2, ch - 0.5);
        }
      }
      // Sheen across the panel.
      ctx.fillStyle = linear(ctx, x0, 0, x0 + w, 30, [
        [0, 'rgba(255,255,255,0.4)'],
        [0.3, 'rgba(255,255,255,0.06)'],
        [0.55, 'rgba(255,255,255,0)'],
        [0.75, 'rgba(255,255,255,0.12)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
      ctx.fillRect(x0 + 1, 1.5, w - 2, 27);
    }
    // Hinge between the panels.
    ctx.fillStyle = '#5b63b0';
    ctx.fillRect(40, 12, 2, 6);
  }, 4, { bevel: 0.6, light: 0.5, grain: 0.25, grime: 0.2, seed: 4 });

/** The salvage claw that sits on top of the station. Anchored at its base. */
export const claw = () =>
  paint(40, 46, (ctx) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Arm.
    ctx.fillStyle = linear(ctx, 15, 0, 25, 0, [
      [0, '#c5cbff'],
      [1, '#4a52a0'],
    ]);
    ctx.fillRect(16, 18, 8, 28);
    ctx.fillStyle = '#2b3170';
    ctx.fillRect(16, 28, 8, 2);
    // Joint.
    ctx.fillStyle = radial(ctx, 18, 16, 7, [
      [0, '#ffffff'],
      [1, '#7a84d8'],
    ]);
    ctx.beginPath();
    ctx.arc(20, 18, 5, 0, TAU);
    ctx.fill();
    // Pincers.
    for (const s of [-1, 1]) {
      ctx.strokeStyle = '#e6e9ff';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(20 + s * 3, 16);
      ctx.lineTo(20 + s * 12, 6);
      ctx.lineTo(20 + s * 6, 1.5);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(60,70,150,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(20 + s * 4, 17);
      ctx.lineTo(20 + s * 12.5, 7.5);
      ctx.stroke();
    }
  }, RES, { bevel: 0.8, light: 0.7, grain: 0.3, grime: 0.3, seed: 5 });

// ---------- Machines ----------

/** Thin dark seam with a lit lip below it, like a panel join catching light from above. */
function seam(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w = 0.35) {
  ctx.lineCap = 'round';
  ctx.lineWidth = w;
  ctx.strokeStyle = 'rgba(8,12,40,0.55)';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.moveTo(x0 + w * 0.7, y0 + w * 0.7);
  ctx.lineTo(x1 + w * 0.7, y1 + w * 0.7);
  ctx.stroke();
}

/** A small status light with a soft halo. */
function lamp(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = radial(ctx, x, y, r * 3, [
    [0, rgba(color, 0.55)],
    [1, rgba(color, 0)],
  ]);
  ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, TAU);
  ctx.fill();
}

/** Small salvage drone, pointing right: a rounded pod with a glass dome, fins and a grabber. */
export const drone = () =>
  paint(18, 14, (ctx) => {
    // Fins, with a darker trailing edge.
    for (const s of [-1, 1]) {
      ctx.fillStyle = linear(ctx, 2, 7, 9, 7, [
        [0, '#0f5e50'],
        [1, '#22a98d'],
      ]);
      ctx.beginPath();
      ctx.moveTo(6, 7 + s * 2);
      ctx.lineTo(2, 7 + s * 6.2);
      ctx.lineTo(4.5, 7 + s * 6.2);
      ctx.lineTo(9, 7 + s * 2.5);
      ctx.fill();
      ctx.fillStyle = '#ffcf5a';
      ctx.fillRect(2.4, 7 + s * 6.2 - (s > 0 ? 0.7 : 0), 1.8, 0.7);
    }
    // Body.
    ctx.fillStyle = linear(ctx, 0, 2, 0, 12, [
      [0, '#e2fff8'],
      [0.35, '#5ff0cd'],
      [0.7, '#22a98d'],
      [1, '#0f5e50'],
    ]);
    ctx.beginPath();
    ctx.ellipse(9, 7, 6.5, 4.2, 0, 0, TAU);
    ctx.fill();
    // Panel seams and a belly plate.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(9, 7, 6.5, 4.2, 0, 0, TAU);
    ctx.clip();
    ctx.fillStyle = 'rgba(6,40,40,0.28)';
    ctx.fillRect(2, 8.6, 14, 3);
    seam(ctx, 5.6, 3, 5.6, 11, 0.25);
    seam(ctx, 13.2, 3.5, 13.2, 10.5, 0.25);
    ctx.restore();
    // Grabber arms at the nose, with jointed tips.
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.strokeStyle = '#3a4380';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(14.6, 7 + s * 1.1);
      ctx.lineTo(16.4, 7 + s * 2.3);
      ctx.lineTo(17.5, 7 + s * 1.3);
      ctx.stroke();
      ctx.strokeStyle = '#dfe4ff';
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.moveTo(14.6, 7 + s * 1.1);
      ctx.lineTo(16.4, 7 + s * 2.3);
      ctx.lineTo(17.5, 7 + s * 1.3);
      ctx.stroke();
    }
    // Glass dome with a frame and a reflected window glint.
    ctx.fillStyle = '#163a4a';
    ctx.beginPath();
    ctx.ellipse(10.5, 6.6, 3, 2.6, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = radial(ctx, 10, 5.4, 3.4, [
      [0, '#f2fdff'],
      [0.35, '#6fdcff'],
      [1, '#0a3046'],
    ]);
    ctx.beginPath();
    ctx.ellipse(10.5, 6.6, 2.5, 2.1, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(9.7, 5.6, 0.9, 0.45, -0.5, 0, TAU);
    ctx.fill();
    // Engine nozzle with a hot core.
    ctx.fillStyle = linear(ctx, 0, 5.4, 0, 8.6, [
      [0, '#8c96d8'],
      [1, '#1a1f48'],
    ]);
    ctx.fillRect(1.6, 5.4, 1.9, 3.2);
    ctx.fillStyle = '#ffb36a';
    ctx.fillRect(1.6, 6.4, 0.6, 1.2);
    // Specular highlight along the top.
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(7, 4.2, 2.6, 0.7, -0.1, 0, TAU);
    ctx.fill();
    lamp(ctx, 12.8, 9.4, 0.45, '#ff6a7a');
  }, 6, { bevel: 0.6, light: 0.6, grain: 0.18, grime: 0.12, seed: 6 });

/** Cargo hauler, pointing right: a cab, a spine of containers and a big engine. */
export const hauler = () =>
  paint(32, 16, (ctx) => {
    // Engine bell with cooling rings and a glowing throat.
    ctx.fillStyle = linear(ctx, 0, 3.5, 0, 12.5, [
      [0, '#b8c0f4'],
      [0.4, '#6670c4'],
      [1, '#1f2460'],
    ]);
    ctx.beginPath();
    ctx.moveTo(4.5, 5);
    ctx.lineTo(1, 3.5);
    ctx.lineTo(1, 12.5);
    ctx.lineTo(4.5, 11);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,12,40,0.5)';
    ctx.lineWidth = 0.3;
    for (const x of [2.2, 3.4]) {
      ctx.beginPath();
      ctx.moveTo(x, 4.1 + (x - 1) * 0.3);
      ctx.lineTo(x, 11.9 - (x - 1) * 0.3);
      ctx.stroke();
    }
    ctx.fillStyle = radial(ctx, 1, 8, 2.4, [
      [0, '#fff1c8'],
      [0.5, '#ff9a4c'],
      [1, 'rgba(255,90,40,0)'],
    ]);
    ctx.fillRect(0, 5, 3, 6);
    // Spine truss.
    ctx.fillStyle = linear(ctx, 0, 6.8, 0, 9.2, [
      [0, '#8a92dc'],
      [1, '#2c3274'],
    ]);
    ctx.fillRect(4, 6.8, 20, 2.4);
    ctx.strokeStyle = 'rgba(12,14,46,0.6)';
    ctx.lineWidth = 0.25;
    for (let x = 4.5; x < 24; x += 1.5) {
      ctx.beginPath();
      ctx.moveTo(x, 6.8);
      ctx.lineTo(x + 1.5, 9.2);
      ctx.stroke();
    }
    // Containers, two stacks, with ridges, a stencilled band and corner castings.
    const colors = ['#ff8a4c', '#ffd166', '#4fe3c1', '#c58cff'];
    for (let i = 0; i < 4; i++) {
      for (const y of [2.3, 9.2]) {
        const x = 5 + i * 4.6;
        const col = colors[(i + (y > 5 ? 2 : 0)) % 4];
        ctx.fillStyle = linear(ctx, 0, y, 0, y + 4.5, [
          [0, '#ffffff'],
          [0.12, col],
          [0.7, col],
          [1, 'rgba(40,20,60,1)'],
        ]);
        ctx.fillRect(x, y, 4.2, 4.5);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        for (let k = 1; k < 5; k++) ctx.fillRect(x + k * 0.84 - 0.12, y + 0.5, 0.24, 3.5);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        for (let k = 1; k < 5; k++) ctx.fillRect(x + k * 0.84 + 0.12, y + 0.5, 0.18, 3.5);
        ctx.fillStyle = 'rgba(20,14,40,0.45)';
        ctx.fillRect(x, y + 2, 4.2, 0.6);
        ctx.fillStyle = 'rgba(30,24,60,0.9)';
        for (const [cx, cy] of [[x, y], [x + 3.7, y], [x, y + 4], [x + 3.7, y + 4]]) ctx.fillRect(cx, cy, 0.5, 0.5);
      }
    }
    // Cab with a window frame, seams and a nose light.
    ctx.fillStyle = linear(ctx, 0, 3, 0, 13, [
      [0, '#f4f7ff'],
      [0.4, '#86b0ff'],
      [1, '#26408f'],
    ]);
    ctx.beginPath();
    ctx.moveTo(23.5, 3.5);
    ctx.lineTo(27, 3.5);
    ctx.quadraticCurveTo(32, 8, 27, 12.5);
    ctx.lineTo(23.5, 12.5);
    ctx.closePath();
    ctx.fill();
    seam(ctx, 25.2, 3.8, 25.2, 12.2, 0.25);
    ctx.fillStyle = '#16224a';
    ctx.beginPath();
    ctx.ellipse(28, 7.2, 2.1, 2.5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = radial(ctx, 27.6, 6.2, 3, [
      [0, '#f2fdff'],
      [0.4, '#6fd2ff'],
      [1, '#1a6a9a'],
    ]);
    ctx.beginPath();
    ctx.ellipse(28, 7.2, 1.7, 2.1, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(27.2, 5.6, 0.5, 1.3);
    lamp(ctx, 30.6, 8, 0.4, '#ffe08a');
    lamp(ctx, 23.9, 12.1, 0.35, '#ff6a7a');
  }, 5, { bevel: 0.5, light: 0.6, grain: 0.25, grime: 0.3, seed: 8 });

/** Smelter pod: a squat furnace with a glowing grill, a chimney and side vents. Points outward (right). */
export const smelter = () =>
  paint(22, 22, (ctx) => {
    // Chimney stacks behind the body.
    for (const y of [2.2, 16.6]) {
      ctx.fillStyle = linear(ctx, 0, y, 0, y + 3.2, [
        [0, '#8a8fb8'],
        [1, '#33365c'],
      ]);
      ctx.fillRect(2.5, y, 5, 3.2);
      ctx.fillStyle = '#1a1b30';
      ctx.fillRect(3.2, y + (y < 10 ? 0 : 2.4), 3.6, 0.8);
    }
    // Furnace body.
    ctx.fillStyle = linear(ctx, 0, 3, 0, 19, [
      [0, '#ffd9bd'],
      [0.25, '#e07a3e'],
      [0.7, '#9a4220'],
      [1, '#4a1c0e'],
    ]);
    ctx.beginPath();
    ctx.roundRect(1, 3, 20, 16, 5);
    ctx.fill();
    // Heat-scorched band around the grill.
    ctx.fillStyle = radial(ctx, 11, 11, 10, [
      [0.4, 'rgba(40,10,0,0.45)'],
      [1, 'rgba(40,10,0,0)'],
    ]);
    ctx.fillRect(1, 3, 20, 16);
    // Bolted frame around the firebox.
    ctx.fillStyle = '#3a1a10';
    ctx.beginPath();
    ctx.roundRect(4, 6, 14, 10, 2.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,220,190,0.75)';
    for (const [x, y] of [[5, 7], [17, 7], [5, 15], [17, 15]]) {
      ctx.beginPath();
      ctx.arc(x, y, 0.45, 0, TAU);
      ctx.fill();
    }
    // Molten glow.
    ctx.fillStyle = radial(ctx, 11, 11, 7, [
      [0, '#fffbe0'],
      [0.35, '#ffd36a'],
      [0.75, '#ff7a2a'],
      [1, '#c4301a'],
    ]);
    ctx.beginPath();
    ctx.roundRect(5.4, 7.4, 11.2, 7.2, 1.6);
    ctx.fill();
    // Grill bars with a lit top edge.
    for (let x = 7.6; x < 16; x += 2.4) {
      ctx.fillStyle = '#4a160c';
      ctx.fillRect(x - 0.5, 7.4, 1, 7.2);
      ctx.fillStyle = 'rgba(255,190,120,0.7)';
      ctx.fillRect(x - 0.5, 7.4, 0.3, 7.2);
    }
    // Vent slits on the outer face.
    ctx.fillStyle = 'rgba(40,12,4,0.7)';
    for (let k = 0; k < 4; k++) ctx.fillRect(19, 6.5 + k * 2.6, 1.2, 1.4);
    // Outline glint.
    ctx.strokeStyle = 'rgba(255,236,220,0.55)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.roundRect(1.5, 3.5, 19, 15, 4.6);
    ctx.stroke();
    lamp(ctx, 3, 5.4, 0.45, '#7dffb0');
  }, 5, { bevel: 0.9, light: 0.6, grain: 0.3, grime: 0.4, seed: 9 });

/** Fabricator module: a hex block with a working printer eye, panel facets and status lights. */
export const fabricator = () =>
  paint(20, 20, (ctx) => {
    const hex = (r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + Math.PI / 6;
        ctx.lineTo(10 + Math.cos(a) * r, 10 + Math.sin(a) * r);
      }
      ctx.closePath();
    };
    ctx.fillStyle = linear(ctx, 0, 0, 20, 20, [
      [0, '#f4e6ff'],
      [0.4, '#b27cf0'],
      [1, '#3e1f72'],
    ]);
    hex(9.5);
    ctx.fill();
    // Facets: each of the six faces gets its own tone from the light.
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * TAU + Math.PI / 6;
      const a1 = a0 + TAU / 6;
      const mid = (a0 + a1) / 2;
      const lit = -(Math.cos(mid) * -0.62 + Math.sin(mid) * -0.78);
      ctx.fillStyle = lit < 0 ? `rgba(255,255,255,${(-lit * 0.22).toFixed(3)})` : `rgba(20,6,50,${(lit * 0.3).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(10 + Math.cos(a0) * 9.5, 10 + Math.sin(a0) * 9.5);
      ctx.lineTo(10 + Math.cos(a1) * 9.5, 10 + Math.sin(a1) * 9.5);
      ctx.lineTo(10 + Math.cos(a1) * 6.2, 10 + Math.sin(a1) * 6.2);
      ctx.lineTo(10 + Math.cos(a0) * 6.2, 10 + Math.sin(a0) * 6.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(30,10,60,0.5)';
    ctx.lineWidth = 0.35;
    hex(6.2);
    ctx.stroke();
    // Printer eye.
    ctx.fillStyle = '#1c0e38';
    ctx.beginPath();
    ctx.arc(10, 10, 4.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = linear(ctx, 6, 6, 14, 14, [
      [0, 'rgba(0,0,0,0.6)'],
      [1, 'rgba(230,200,255,0.7)'],
    ]);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(10, 10, 4.3, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = radial(ctx, 10, 10, 3.2, [
      [0, '#ffffff'],
      [0.3, '#f0d8ff'],
      [0.7, '#b46cff'],
      [1, 'rgba(120,50,220,0)'],
    ]);
    ctx.beginPath();
    ctx.arc(10, 10, 3.2, 0, TAU);
    ctx.fill();
    lamp(ctx, 15.4, 6.6, 0.45, '#7dffb0');
    lamp(ctx, 15.4, 13.4, 0.45, '#ffcf5a');
  }, 6, { bevel: 0.8, light: 0.6, grain: 0.2, grime: 0.15, seed: 10 });

/** One 30-degree section of the gold orbital dock ring, centred on a canvas the size of the ring. */
export const dockSegment = (radius: number) =>
  paint(radius * 2 + 20, radius * 2 + 20, (ctx) => {
    const c = radius + 10;
    const a0 = -Math.PI / 12 + 0.03;
    const a1 = Math.PI / 12 - 0.03;
    ctx.lineCap = 'round';
    // Truss: two rails with cross bracing.
    for (const [r, w] of [[radius - 4, 2.2], [radius + 4, 2.2]] as const) {
      ctx.strokeStyle = linear(ctx, c, c - radius, c, c + radius, [
        [0, '#fff1c4'],
        [1, '#c8902a'],
      ]);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(c, c, r, a0, a1);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,209,102,0.85)';
    ctx.lineWidth = 0.9;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t0 = a0 + ((a1 - a0) * i) / n;
      const t1 = a0 + ((a1 - a0) * (i + 1)) / n;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(t0) * (radius - 4), c + Math.sin(t0) * (radius - 4));
      ctx.lineTo(c + Math.cos(t1) * (radius + 4), c + Math.sin(t1) * (radius + 4));
      ctx.stroke();
    }
    // Docking clamp at the middle, with a landing light.
    ctx.fillStyle = linear(ctx, c + radius - 8, c - 6, c + radius + 8, c + 6, [
      [0, '#fff1c4'],
      [1, '#a8741a'],
    ]);
    ctx.beginPath();
    ctx.roundRect(c + radius - 7, c - 5, 14, 10, 2);
    ctx.fill();
    ctx.fillStyle = '#ff6b9a';
    ctx.beginPath();
    ctx.arc(c + radius + 5, c, 1.3, 0, TAU);
    ctx.fill();
  }, 2.5);

// ---------- Space junk ----------

/** Rock and metal scrap variants. */
export function debris(seed: number): Texture {
  const r = rng(seed);
  const metal = seed % 3 === 0;
  const size = 22;
  return paint(size, size, (ctx) => {
    const c = size / 2;
    ctx.beginPath();
    if (metal) {
      // A bent hull plate.
      ctx.moveTo(3, 6);
      ctx.lineTo(17, 3 + r() * 3);
      ctx.lineTo(19, 14);
      ctx.lineTo(9 + r() * 3, 18);
      ctx.lineTo(4, 15);
      ctx.closePath();
      ctx.fillStyle = linear(ctx, 0, 0, size, size, [
        [0, '#c5cbe8'],
        [1, '#4a4f78'],
      ]);
      ctx.fill();
      ctx.fillStyle = 'rgba(30,30,60,0.6)';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(6 + i * 3.4, 7.5 + i * 0.6, 0.6, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,138,76,0.6)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(8, 12);
      ctx.lineTo(15, 10);
      ctx.stroke();
    } else {
      drawRock(ctx, c, c, c * 0.8, 4, { ...(seed % 3 ? ROCK_GREY : ROCK_RUST), lumpy: 0.4, craters: 4, seed });
    }
  }, 4, metal ? { bevel: 0.8, light: 0.6, grain: 0.45, grime: 0.5, seed } : undefined);
}

/** The rare golden scrap crate: polished gold with a star emblem and bright edges. */
export const goldenCrate = () =>
  paint(32, 32, (ctx) => {
    ctx.fillStyle = linear(ctx, 0, 2, 0, 30, [
      [0, '#fffbe6'],
      [0.25, '#ffe27a'],
      [0.6, '#f0a818'],
      [1, '#8a5404'],
    ]);
    ctx.beginPath();
    ctx.roundRect(3, 3, 26, 26, 6);
    ctx.fill();
    // Bevelled inner panel.
    ctx.strokeStyle = 'rgba(255,255,230,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(5.5, 5.5, 21, 21, 4);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,70,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(6.6, 6.6, 18.8, 18.8, 3.4);
    ctx.stroke();
    // Star emblem.
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU - Math.PI / 2;
      const rr = i % 2 ? 3.2 : 7.4;
      ctx.lineTo(16 + Math.cos(a) * rr, 16.4 + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = radial(ctx, 14.5, 14, 8, [
      [0, '#ffffff'],
      [0.5, '#fff1b0'],
      [1, '#ffbf2e'],
    ]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,80,0,0.7)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    // Specular streak across the top-left corner.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(3, 3, 26, 26, 6);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(3, 12);
    ctx.lineTo(12, 3);
    ctx.lineTo(16, 3);
    ctx.lineTo(3, 16);
    ctx.fill();
    ctx.restore();
  }, 4, { bevel: 1, light: 0.6, grain: 0.15, grime: 0.05, seed: 31 });

/** The golden salvage crate. */
export const crate = () =>
  paint(28, 28, (ctx) => {
    ctx.fillStyle = linear(ctx, 0, 0, 28, 28, [
      [0, '#fff1c4'],
      [0.45, '#ffd166'],
      [1, '#b07a12'],
    ]);
    ctx.beginPath();
    ctx.roundRect(3, 3, 22, 22, 4);
    ctx.fill();
    ctx.strokeStyle = '#7a5208';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(3.7, 3.7, 20.6, 20.6, 3.5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(122,82,8,0.55)';
    ctx.fillRect(12, 3, 4, 22);
    ctx.fillRect(3, 12, 22, 4);
    ctx.fillStyle = '#fff8e0';
    ctx.beginPath();
    ctx.arc(14, 14, 3.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(5, 5, 6, 2);
  }, 4, { bevel: 1, light: 0.7, grain: 0.4, grime: 0.4, seed: 12 });

// ---------- Extra detail ----------

/** Comms mast with a dish, hanging below the hull. Anchored at its top. */
export const antenna = () =>
  paint(40, 40, (ctx) => {
    ctx.fillStyle = linear(ctx, 17, 0, 23, 0, [
      [0, '#c5cbff'],
      [1, '#3a4090'],
    ]);
    ctx.fillRect(18, 0, 4, 20);
    ctx.strokeStyle = 'rgba(200,206,255,0.7)';
    ctx.lineWidth = 0.7;
    for (let y = 2; y < 20; y += 4) {
      ctx.beginPath();
      ctx.moveTo(18, y);
      ctx.lineTo(22, y + 4);
      ctx.stroke();
    }
    // Dish, facing down-left.
    ctx.save();
    ctx.translate(20, 26);
    ctx.rotate(0.5);
    ctx.fillStyle = linear(ctx, -12, -4, 12, 6, [
      [0, '#f2f4ff'],
      [0.6, '#9aa2e8'],
      [1, '#3a4090'],
    ]);
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 5, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#2b3170';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.strokeStyle = '#c5cbff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 9);
    ctx.stroke();
    ctx.fillStyle = '#ff6b9a';
    ctx.beginPath();
    ctx.arc(0, 9.5, 1.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }, 5, { bevel: 0.6, light: 0.6, grain: 0.25, grime: 0.25, seed: 13 });

/** A cratered grey moon, lit from the upper left. */
export const moon = () =>
  paint(40, 40, (ctx) => {
    drawRock(ctx, 20, 20, 18, 4, { light: [236, 232, 246], dark: [96, 90, 124], lumpy: 0.03, craters: 14, seed: 21 });
  }, 4);

/** A distant spiral galaxy. */
export const galaxy = () =>
  paint(120, 120, (ctx) => {
    const c = 60;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, c, c, 22, [
      [0, 'rgba(255,240,220,0.9)'],
      [0.4, 'rgba(255,200,170,0.35)'],
      [1, 'rgba(255,200,170,0)'],
    ]);
    ctx.fillRect(0, 0, 120, 120);
    const r = rng(5);
    for (let arm = 0; arm < 2; arm++) {
      for (let i = 0; i < 260; i++) {
        const t = i / 260;
        const a = arm * Math.PI + t * Math.PI * 3.2;
        const d = 4 + t * 52;
        const x = c + Math.cos(a) * d + (r() - 0.5) * 8 * t;
        const y = c + Math.sin(a) * d * 0.55 + (r() - 0.5) * 6 * t;
        const s = 0.5 + r() * 2.2 * (1 - t);
        ctx.fillStyle = r() < 0.2 ? `rgba(255,150,200,${0.35 * (1 - t)})` : `rgba(170,190,255,${0.4 * (1 - t) + 0.05})`;
        ctx.beginPath();
        ctx.arc(x, y, s, 0, TAU);
        ctx.fill();
      }
    }
  }, 2);

/** A big rock for the foreground, drawn soft-edged so it reads as out of focus. */
export const bigRock = (seed: number) =>
  paint(80, 80, (ctx) => {
    drawRock(ctx, 40, 40, 32, 3, { ...(seed % 3 === 2 ? ROCK_RUST : ROCK_GREY), lumpy: 0.32, craters: 9, seed });
  }, 3);

/** A small laser turret on a strut, barrel pointing up (rotate to aim). */
export const laserTurret = () =>
  paint(28, 34, (ctx) => {
    // Base plate.
    ctx.fillStyle = linear(ctx, 4, 24, 24, 34, [
      [0, '#6a6f9c'],
      [1, '#262a4e'],
    ]);
    ctx.beginPath();
    ctx.roundRect(3, 24, 22, 8, 3);
    ctx.fill();
    // Turret dome.
    ctx.fillStyle = radial(ctx, 11, 18, 12, [
      [0, '#f1f3ff'],
      [0.5, '#9aa0d0'],
      [1, '#3a3f70'],
    ]);
    ctx.beginPath();
    ctx.arc(14, 22, 9, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    // Barrel.
    ctx.fillStyle = linear(ctx, 11, 0, 17, 0, [
      [0, '#2e3260'],
      [0.5, '#c8ccf0'],
      [1, '#2e3260'],
    ]);
    ctx.fillRect(11.5, 3, 5, 15);
    ctx.fillStyle = '#ff5d6c';
    ctx.fillRect(11.5, 2, 5, 2.5);
    ctx.fillStyle = radial(ctx, 14, 3, 5, [
      [0, 'rgba(255,200,200,1)'],
      [1, 'rgba(255,93,108,0)'],
    ]);
    ctx.beginPath();
    ctx.arc(14, 3, 5, 0, TAU);
    ctx.fill();
  }, 4, { bevel: 0.8, light: 0.7, grain: 0.3, grime: 0.3, seed: 14 });

/** A swirling gravity vortex: a dark eye with bright spiral arms. Spin it. */
export const vortex = () =>
  paint(90, 90, (ctx) => {
    const c = 45;
    ctx.fillStyle = radial(ctx, c, c, 44, [
      [0, 'rgba(92,225,255,0.35)'],
      [0.5, 'rgba(60,120,255,0.12)'],
      [1, 'rgba(60,120,255,0)'],
    ]);
    ctx.fillRect(0, 0, 90, 90);
    ctx.lineCap = 'round';
    for (let arm = 0; arm < 4; arm++) {
      for (let i = 0; i < 40; i++) {
        const t = i / 40;
        const a = (arm / 4) * TAU + t * Math.PI * 2.2;
        const d = 6 + t * 36;
        ctx.strokeStyle = `rgba(${170 + 85 * (1 - t)},${230},255,${0.65 * (1 - t)})`;
        ctx.lineWidth = 2.6 * (1 - t) + 0.4;
        ctx.beginPath();
        ctx.arc(c, c, d, a, a + 0.12);
        ctx.stroke();
      }
    }
    ctx.fillStyle = radial(ctx, c, c, 9, [
      [0, '#000008'],
      [0.75, '#05061a'],
      [1, 'rgba(160,240,255,0.9)'],
    ]);
    ctx.beginPath();
    ctx.arc(c, c, 9, 0, TAU);
    ctx.fill();
  }, 3);

/** A warp gate: a heavy segmented ring with lights. The portal is a separate sprite. */
export const warpGate = () =>
  paint(120, 120, (ctx) => {
    const c = 60;
    ctx.lineWidth = 11;
    ctx.strokeStyle = linear(ctx, 0, 0, 120, 120, [
      [0, '#b9b2ff'],
      [0.5, '#4b3f9a'],
      [1, '#1e1846'],
    ]);
    ctx.beginPath();
    ctx.arc(c, c, 48, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(c, c, 53, Math.PI * 1.05, Math.PI * 1.7);
    ctx.stroke();
    // Clamps around the ring.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.save();
      ctx.translate(c + Math.cos(a) * 48, c + Math.sin(a) * 48);
      ctx.rotate(a);
      ctx.fillStyle = linear(ctx, -7, 0, 7, 0, [
        [0, '#2a2460'],
        [0.5, '#9d94ff'],
        [1, '#2a2460'],
      ]);
      ctx.beginPath();
      ctx.roundRect(-7, -5, 14, 10, 2);
      ctx.fill();
      ctx.fillStyle = i % 2 ? '#ffe9a8' : '#8f7bff';
      ctx.beginPath();
      ctx.arc(4, 0, 1.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }, 4, { bevel: 1.2, light: 0.5, grain: 0.3, grime: 0.3, seed: 15 });

/** The shimmering inside of a warp gate. Spin and pulse it with additive blending. */
export const portal = () =>
  paint(96, 96, (ctx) => {
    const c = 48;
    ctx.fillStyle = radial(ctx, c, c, 44, [
      [0, 'rgba(255,255,255,0.95)'],
      [0.25, 'rgba(190,170,255,0.7)'],
      [0.7, 'rgba(110,80,255,0.35)'],
      [1, 'rgba(80,60,200,0)'],
    ]);
    ctx.beginPath();
    ctx.arc(c, c, 44, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      ctx.strokeStyle = 'rgba(220,210,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c, c, 14 + i * 4.5, a, a + 1.6);
      ctx.stroke();
    }
  }, 2);

/** A distant white-gold star for the Dyson collectors to wrap. */
export const sun = () =>
  paint(80, 80, (ctx) => {
    const c = 40;
    ctx.fillStyle = radial(ctx, c, c, 40, [
      [0, 'rgba(255,255,240,1)'],
      [0.18, 'rgba(255,240,190,1)'],
      [0.3, 'rgba(255,200,110,0.6)'],
      [0.6, 'rgba(255,150,80,0.15)'],
      [1, 'rgba(255,150,80,0)'],
    ]);
    ctx.fillRect(0, 0, 80, 80);
  }, 3);

/** One curved collector panel of a Dyson swarm, centred on its arc. */
export const dysonPanel = () =>
  paint(30, 12, (ctx) => {
    ctx.fillStyle = linear(ctx, 0, 0, 30, 0, [
      [0, '#3b3220'],
      [0.5, '#ffe9a8'],
      [1, '#3b3220'],
    ]);
    ctx.beginPath();
    ctx.moveTo(1, 9);
    ctx.quadraticCurveTo(15, 1, 29, 9);
    ctx.lineTo(27, 11);
    ctx.quadraticCurveTo(15, 4, 3, 11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 0.5;
    for (let x = 6; x < 26; x += 5) {
      ctx.beginPath();
      ctx.moveTo(x, 9 - Math.sin((x / 30) * Math.PI) * 5);
      ctx.lineTo(x, 11 - Math.sin((x / 30) * Math.PI) * 5);
      ctx.stroke();
    }
  }, 4, { bevel: 0.5, light: 0.5, grain: 0.2, grime: 0.15, seed: 16 });

/** A glowing meteor head: molten rock with a hot rim. The tail is a stretched streak. */
export const meteor = () =>
  paint(30, 30, (ctx) => {
    const c = 15;
    ctx.fillStyle = radial(ctx, c, c, 15, [
      [0, 'rgba(255,200,120,0.9)'],
      [0.55, 'rgba(255,120,60,0.35)'],
      [1, 'rgba(255,90,40,0)'],
    ]);
    ctx.fillRect(0, 0, 30, 30);
    drawRock(ctx, c, c, 8.5, 4, { light: [150, 104, 92], dark: [44, 26, 34], lumpy: 0.3, craters: 3, molten: true, seed: 77 });
    // Heat glare on the leading face.
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, c - 3, c - 3, 7, [
      [0, 'rgba(255,170,90,0.45)'],
      [1, 'rgba(255,120,60,0)'],
    ]);
    ctx.fillRect(0, 0, 30, 30);
    ctx.globalCompositeOperation = 'source-over';
  }, 4);

// ---------- Boss wrecks ----------

/**
 * A huge derelict, pointing left: a long broken hull with scorch marks, exposed ribs where it
 * snapped, emergency lights and the Hollow Fleet's circle on its flank. `seed` varies the shape.
 */
export const bossWreck = (seed: number) =>
  paint(230, 120, (ctx) => {
    const r = rng(seed * 31 + 7);
    const top = 22 + r() * 8;
    const bottom = 98 - r() * 8;
    const breakX = 168 + r() * 20;
    // Hull silhouette: a tapered nose on the left, a jagged break on the right.
    const hullPath = () => {
      ctx.beginPath();
      ctx.moveTo(8, 60);
      ctx.quadraticCurveTo(14, top + 6, 46, top);
      ctx.lineTo(breakX - 10, top - 2);
      let y = top - 2;
      for (let i = 0; i < 9; i++) {
        y += (bottom - top) / 9;
        ctx.lineTo(breakX + (r() - 0.3) * 22, y);
      }
      ctx.lineTo(46, bottom);
      ctx.quadraticCurveTo(14, bottom - 6, 8, 60);
      ctx.closePath();
    };
    // Shadow.
    ctx.save();
    ctx.translate(4, 6);
    hullPath();
    ctx.fillStyle = 'rgba(0,0,12,0.45)';
    ctx.fill();
    ctx.restore();
    hullPath();
    ctx.fillStyle = linear(ctx, 0, top, 0, bottom, [
      [0, '#8a8fb8'],
      [0.35, '#4d5280'],
      [1, '#1c1e3a'],
    ]);
    ctx.fill();
    ctx.save();
    hullPath();
    ctx.clip();
    // Hull plating.
    ctx.strokeStyle = 'rgba(10,10,30,0.55)';
    ctx.lineWidth = 0.8;
    for (let x = 40; x < 240; x += 14 + r() * 8) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 120);
      ctx.stroke();
    }
    for (const y of [top + 18, 60, bottom - 18]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(230, y);
      ctx.stroke();
    }
    // Scorch marks.
    for (let i = 0; i < 9; i++) {
      const x = 30 + r() * (breakX - 30);
      const y = top + r() * (bottom - top);
      const rad = 8 + r() * 18;
      ctx.fillStyle = radial(ctx, x, y, rad, [
        [0, 'rgba(8,6,12,0.75)'],
        [1, 'rgba(8,6,12,0)'],
      ]);
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // Lit upper edge.
    ctx.fillStyle = linear(ctx, 0, top, 0, top + 10, [
      [0, 'rgba(220,226,255,0.45)'],
      [1, 'rgba(220,226,255,0)'],
    ]);
    ctx.fillRect(0, top - 4, 230, 14);
    ctx.restore();
    // Exposed ribs and fire where it broke.
    ctx.strokeStyle = '#6a6f9a';
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 5; i++) {
      const y = top + 8 + i * ((bottom - top - 16) / 4);
      ctx.beginPath();
      ctx.moveTo(breakX - 6, y);
      ctx.lineTo(breakX + 14 + r() * 16, y + (r() - 0.5) * 10);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, breakX, 60, 34, [
      [0, 'rgba(255,170,80,0.7)'],
      [0.5, 'rgba(255,90,40,0.25)'],
      [1, 'rgba(255,90,40,0)'],
    ]);
    ctx.fillRect(breakX - 40, 20, 80, 80);
    ctx.globalCompositeOperation = 'source-over';
    // Bridge windows, mostly dark.
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = r() < 0.25 ? 'rgba(255,210,140,0.9)' : 'rgba(20,22,48,0.9)';
      ctx.fillRect(28 + i * 5, top + 8, 3, 2.4);
    }
    // The Hollow Fleet mark: a hollow circle, scratched but clear.
    ctx.strokeStyle = 'rgba(235,240,255,0.75)';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.arc(96, 60, 13, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(20,20,40,0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(84, 52);
    ctx.lineTo(106, 70);
    ctx.stroke();
    // Emergency lights.
    for (const [x, y] of [[50, top + 2], [140, bottom - 2], [120, top + 1]]) {
      ctx.fillStyle = radial(ctx, x, y, 5, [
        [0, 'rgba(255,90,110,1)'],
        [1, 'rgba(255,90,110,0)'],
      ]);
      ctx.fillRect(x - 5, y - 5, 10, 10);
    }
  }, 3, { bevel: 1.6, light: 0.5, grain: 0.45, grime: 0.6, seed: seed + 40 });

/** Glowing cracks, faded in over a wreck as it takes damage. Drawn additively. */
export const bossCracks = (seed: number) =>
  paint(230, 120, (ctx) => {
    const r = rng(seed * 13 + 3);
    ctx.strokeStyle = 'rgba(255,170,90,0.9)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let x = 30 + r() * 150;
      let y = 35 + r() * 50;
      ctx.lineWidth = 1 + r() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (r() - 0.5) * 22;
        y += (r() - 0.5) * 14;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, 2);

// ---------- Pets ----------

/** A pet, facing right, inside a glass space helmet (the blob needs none). */
export const pet = (id: 'cat' | 'pup' | 'owl' | 'blob') => paint(40, 40, (ctx) => drawPet(ctx, id), 4);

/** A pet portrait for the Pets tab. */
export const petUrl = (id: 'cat' | 'pup' | 'owl' | 'blob') => paintUrl(40, 40, (ctx) => drawPet(ctx, id), 3);

function drawPet(ctx: Ctx, id: 'cat' | 'pup' | 'owl' | 'blob'): void {
  const c = 20;
  const ink = '#141838';
  const eyes = (x: number, y: number, gap: number, size: number) => {
    for (const dx of [-gap / 2, gap / 2]) {
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(x + dx, y, size, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x + dx + size * 0.35, y - size * 0.35, size * 0.38, 0, TAU);
      ctx.fill();
    }
  };
  const blush = (x: number, y: number, gap: number) => {
    ctx.fillStyle = 'rgba(255,120,150,0.45)';
    for (const dx of [-gap / 2, gap / 2]) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y, 2, 1.2, 0, 0, TAU);
      ctx.fill();
    }
  };
  if (id === 'blob') {
    ctx.fillStyle = radial(ctx, 16, 16, 20, [
      [0, '#e6ffd0'],
      [0.4, '#9dff6b'],
      [1, '#3f9a2a'],
    ]);
    ctx.beginPath();
    ctx.moveTo(6, 32);
    ctx.bezierCurveTo(2, 18, 10, 6, 20, 6);
    ctx.bezierCurveTo(30, 6, 38, 18, 34, 32);
    ctx.quadraticCurveTo(27, 35, 20, 32);
    ctx.quadraticCurveTo(13, 35, 6, 32);
    ctx.fill();
    eyes(21, 19, 9, 2.4);
    blush(21, 24, 13);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.ellipse(13, 12, 3.5, 2, -0.6, 0, TAU);
    ctx.fill();
    return;
  }
  const body = id === 'cat' ? ['#e6d0ff', '#a66ae8', '#5a2f9a'] : id === 'pup' ? ['#ffe6c0', '#ffb547', '#b86a1a'] : ['#d6f4ff', '#5cd6ff', '#2a6fa0'];
  const fill = radial(ctx, c - 4, c - 5, 16, [
    [0, body[0]],
    [0.5, body[1]],
    [1, body[2]],
  ]);
  // Ears or tufts behind the head.
  ctx.fillStyle = body[2];
  if (id === 'cat' || id === 'owl') {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(c + s * 4, c - 8);
      ctx.lineTo(c + s * 9, c - 15);
      ctx.lineTo(c + s * 10, c - 5);
      ctx.fill();
    }
  }
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(c, c + 1, 10.5, 9.5, 0, 0, TAU);
  ctx.fill();
  if (id === 'pup') {
    ctx.fillStyle = body[2];
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(c + s * 10, c + 1, 3, 6, s * 0.3, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#fff2dc';
    ctx.beginPath();
    ctx.ellipse(c + 1, c + 5, 5, 3.4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(c + 1, c + 3.6, 1.6, 1.1, 0, 0, TAU);
    ctx.fill();
  }
  if (id === 'owl') {
    ctx.fillStyle = '#eafaff';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(c + s * 4.2, c - 0.5, 4, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#ffb547';
    ctx.beginPath();
    ctx.moveTo(c - 1.4, c + 3);
    ctx.lineTo(c + 1.4, c + 3);
    ctx.lineTo(c, c + 5.4);
    ctx.fill();
  }
  eyes(c + 1, c - 0.5, id === 'owl' ? 8.4 : 7.5, id === 'owl' ? 2.2 : 1.9);
  if (id !== 'owl') blush(c + 1, c + 3.5, 12);
  if (id === 'cat') {
    // Whiskers and a few stars in the fur.
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.5;
    for (const s of [-1, 1]) {
      for (const dy of [-0.8, 0.8]) {
        ctx.beginPath();
        ctx.moveTo(c + s * 6, c + 3 + dy);
        ctx.lineTo(c + s * 11, c + 2.4 + dy * 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#fff6c8';
    for (const [x, y] of [[c - 6, c - 4], [c + 7, c - 3], [c - 3, c + 6]]) ctx.fillRect(x, y, 1, 1);
  }
  // The glass helmet.
  ctx.fillStyle = 'rgba(160,220,255,0.12)';
  ctx.strokeStyle = 'rgba(220,240,255,0.75)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(c, c, 16.5, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(c, c, 13.5, Math.PI * 1.1, Math.PI * 1.4);
  ctx.stroke();
}

// ---------- Rocks ----------

interface RockLook {
  /** Light and dark albedo, as [r, g, b]. */
  light: [number, number, number];
  dark: [number, number, number];
  /** How far the outline wanders from a circle (0 is round). */
  lumpy: number;
  craters: number;
  /** Glowing molten cracks, for meteors. */
  molten?: boolean;
  seed: number;
}

/**
 * A lit, cratered rock painted per pixel: a lumpy sphere's height, bumps and crater bowls with
 * raised rims give a surface normal, which is lit from the upper left like the rest of the art.
 * `size` is the canvas size in pixels; the rock fills most of it.
 */
function rockCanvas(size: number, look: RockLook): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const r = rng(look.seed);
  const R = size * 0.46;
  const c = size / 2;
  const outline = valueNoise(look.seed + 3, 1);
  const bumps = valueNoise(look.seed + 5, size / 7);
  const fine = valueNoise(look.seed + 6, size / 22);
  const tone = valueNoise(look.seed + 7, size / 4);
  const cracks = valueNoise(look.seed + 8, size / 9);
  // The outline radius at an angle, smoothly wrapped round the circle.
  const edge = (a: number) => 1 - look.lumpy * (outline(2.2 + Math.cos(a) * 1.8, 2.2 + Math.sin(a) * 1.8) * 0.8 + outline(6 + Math.cos(a) * 4.5, 6 + Math.sin(a) * 4.5) * 0.35);
  const craters: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < look.craters; i++) {
    const a = r() * TAU;
    const d = Math.sqrt(r()) * 0.75;
    craters.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 0.07 + r() * r() * 0.28 });
  }
  const height = new Float32Array(size * size);
  const alpha = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5 - c) / R;
      const v = (y + 0.5 - c) / R;
      const d = Math.hypot(u, v);
      const rho = edge(Math.atan2(v, u));
      const i = y * size + x;
      alpha[i] = Math.max(0, Math.min(1, (rho - d) * R + 0.5));
      if (d > rho + 2 / R) continue;
      const s = Math.min(1, d / rho);
      let h = Math.sqrt(Math.max(0, 1 - s * s)) * 0.9;
      h += (bumps(x, y) - 0.5) * 0.16 + (fine(x, y) - 0.5) * 0.05;
      for (const k of craters) {
        const q = Math.hypot(u - k.x, v - k.y) / k.r;
        if (q < 1) h -= k.r * 0.9 * (1 - q * q);
        if (q > 0.6 && q < 1.7) h += k.r * 0.2 * Math.exp(-(((q - 1) / 0.25) ** 2));
      }
      height[i] = h;
    }
  }
  const img = ctx.createImageData(size, size);
  const L = [-0.55, -0.62, 0.56];
  const scale = R * 0.5;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      if (alpha[i] <= 0) continue;
      const nx = -(height[i + 1] - height[i - 1]) * scale;
      const ny = -(height[i + size] - height[i - size]) * scale;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const lambert = Math.max(0, (nx * L[0] + ny * L[1] + L[2]) * inv);
      // Warm bounce light from the lower right, where the station's glow comes from.
      const bounce = Math.max(0, (nx * 0.6 + ny * 0.5) * inv) * 0.22;
      const t = Math.max(0, Math.min(1, (tone(x, y) - 0.5) * 2.2 + 0.5 + (fine(x * 3, y * 3) - 0.5) * 0.5 + (r() - 0.5) * 0.14));
      const lit = 0.16 + lambert * 1.05;
      const o = i * 4;
      let cr = (look.dark[0] + (look.light[0] - look.dark[0]) * t) * lit + bounce * 255;
      let cg = (look.dark[1] + (look.light[1] - look.dark[1]) * t) * lit + bounce * 150;
      let cb = (look.dark[2] + (look.light[2] - look.dark[2]) * t) * lit + bounce * 110;
      if (look.molten) {
        // Thin bright seams where the crack noise crosses its middle.
        const seam = 1 - Math.min(1, Math.abs(cracks(x, y) - 0.5) * 20);
        if (seam > 0) {
          cr += seam * 255;
          cg += seam * 150;
          cb += seam * 40;
        }
      }
      img.data[o] = Math.min(255, cr);
      img.data[o + 1] = Math.min(255, cg);
      img.data[o + 2] = Math.min(255, cb);
      img.data[o + 3] = alpha[i] * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Draws a rock centred at (x, y) with radius `rad` in world units, painted at `res`. */
function drawRock(ctx: Ctx, x: number, y: number, rad: number, res: number, look: RockLook): void {
  const box = rad / 0.46;
  ctx.drawImage(rockCanvas(Math.ceil(box * res), look), x - box / 2, y - box / 2, box, box);
}

const ROCK_GREY: Pick<RockLook, 'light' | 'dark'> = { light: [168, 160, 196], dark: [62, 56, 86] };
const ROCK_RUST: Pick<RockLook, 'light' | 'dark'> = { light: [196, 150, 128], dark: [70, 48, 58] };
