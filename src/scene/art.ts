import { CanvasSource, Texture } from 'pixi.js';
import * as sprites from './sprites';
import { drawMarkup } from './vector';

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

/**
 * A hard-surface sprite from the art kit (sprites.ts), in the same style as the menu icons.
 * The finish adds only fine grain and faint wear: the kit already draws the light and outlines.
 */
function vector(art: sprites.SpriteArt): Texture {
  return paint(art.w, art.h, (ctx) => {
    ctx.scale(1 / art.scale, 1 / art.scale);
    drawMarkup(ctx, art.markup);
  }, art.res ?? Math.max(RES, art.scale * 2), art.plain ? undefined : { bevel: 0.3, light: 0, grain: 0.12, grime: 0.12, seed: 5 });
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

/**
 * The main hull disc: a bevelled outer rim, a ring of armour plates with vents and greebles,
 * a lit window band and a recessed socket for the reactor. Lit from the upper left.
 */
export const hull = () => vector(sprites.hull());

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
export const habitatRing = () => vector(sprites.habitatRing());

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
export const solarWing = () => vector(sprites.solarWing());

/** The salvage claw that sits on top of the station. Anchored at its base. */
export const claw = () => vector(sprites.claw());

// ---------- Machines ----------

/** Small salvage drone, pointing right: a rounded pod with a glass dome, fins and a grabber. */
export const drone = () => vector(sprites.drone());

/** Cargo hauler, pointing right: a cab, a spine of containers and a big engine. */
export const hauler = () => vector(sprites.hauler());

/** Smelter pod: a squat furnace with a glowing grill, a chimney and side vents. Points outward (right). */
export const smelter = () => vector(sprites.smelter());

/** Fabricator module: a hex block with a working printer eye, panel facets and status lights. */
export const fabricator = () => vector(sprites.fabricator());

/** One 30-degree section of the gold orbital dock ring, centred on a canvas the size of the ring. */
export const dockSegment = (radius: number) => vector(sprites.dockSegment(radius));

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
export const goldenCrate = () => vector(sprites.goldenCrate());

/** The golden salvage crate. */
export const crate = () => vector(sprites.crate());

// ---------- Extra detail ----------

/** Comms mast with a dish, hanging below the hull. Anchored at its top. */
export const antenna = () => vector(sprites.antenna());

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
export const laserTurret = () => vector(sprites.laserTurret());

/** A gravity well: a dark eye with spiral arms. Spin it (drawn with normal blending). */
export const vortex = () => vector(sprites.vortex());

/** A warp gate: a heavy segmented ring with lights. The portal is a separate sprite. */
export const warpGate = () => vector(sprites.warpGate());

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
export const dysonPanel = () => vector(sprites.dysonPanel());

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

// ---------- Station decorations ----------

/** Sizes of each decoration's painting, in world units. */
export const ORNAMENT_SIZE: Record<string, [number, number]> = {
  fern: [22, 34],
  poster: [16, 20],
  pennant: [20, 12],
  garden: [32, 18],
  lantern: [10, 16],
  duck: [16, 14],
  cactus: [14, 20],
  gnome: [14, 20],
  neon: [36, 15],
  disco: [14, 26],
  flag: [6, 8],
  bulb: [6, 6],
};

function drawOrnament(ctx: Ctx, id: string): void {
  switch (id) {
    case 'fern': {
      // Three cords to a basket, fronds spilling over the rim.
      ctx.strokeStyle = 'rgba(220,210,190,0.8)';
      ctx.lineWidth = 0.5;
      for (const x of [4, 11, 18]) {
        ctx.beginPath();
        ctx.moveTo(11, 0);
        ctx.lineTo(x, 13);
        ctx.stroke();
      }
      ctx.fillStyle = linear(ctx, 4, 13, 18, 20, [
        [0, '#d98a5c'],
        [1, '#7a3f2a'],
      ]);
      ctx.beginPath();
      ctx.moveTo(3, 13);
      ctx.lineTo(19, 13);
      ctx.quadraticCurveTo(18, 20, 11, 20);
      ctx.quadraticCurveTo(4, 20, 3, 13);
      ctx.fill();
      const frond = (x0: number, y0: number, dx: number, dy: number, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(x0 + dx, y0 - 2, x0 + dx * 1.2, y0 + dy);
        ctx.stroke();
        ctx.lineWidth = 0.8;
        for (let t = 0.2; t < 1; t += 0.2) {
          const x = x0 + dx * 1.2 * t;
          const y = y0 + dy * t * t;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 1.6, y + 1.4);
          ctx.moveTo(x, y);
          ctx.lineTo(x - 1.6, y + 1.4);
          ctx.stroke();
        }
      };
      frond(6, 13, -4, 18, '#3fae6a');
      frond(16, 13, 4, 18, '#3fae6a');
      frond(9, 13, -2, 14, '#5fd68a');
      frond(13, 13, 2, 15, '#5fd68a');
      frond(11, 13, 0.5, 19, '#4cc27a');
      break;
    }
    case 'poster': {
      ctx.fillStyle = '#f3e6c8';
      ctx.fillRect(1, 1, 14, 18);
      ctx.fillStyle = linear(ctx, 0, 2, 0, 14, [
        [0, '#5b3fa8'],
        [0.6, '#ff6b9a'],
        [1, '#ffb347'],
      ]);
      ctx.fillRect(2, 2, 12, 12);
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath();
      ctx.arc(8, 10, 3.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#fff4c8';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.ellipse(8, 10, 5.4, 1.4, -0.25, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#3a2a5a';
      ctx.fillRect(3, 15.2, 10, 1.2);
      ctx.fillRect(4.5, 17, 7, 0.8);
      ctx.fillStyle = 'rgba(200,220,255,0.55)';
      ctx.fillRect(0, 0, 3.5, 1.6);
      ctx.fillRect(12.5, 18.4, 3.5, 1.6);
      break;
    }
    case 'pennant': {
      ctx.fillStyle = linear(ctx, 1, 0, 20, 0, [
        [0, '#ff5d8f'],
        [1, '#ff9a6b'],
      ]);
      ctx.beginPath();
      ctx.moveTo(1, 1);
      ctx.quadraticCurveTo(10, 3, 19, 6);
      ctx.quadraticCurveTo(10, 8, 1, 11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath();
      ctx.arc(7, 6, 1.8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#c5cbff';
      ctx.fillRect(0, 0, 1.2, 12);
      break;
    }
    case 'garden': {
      // A planter box with a bush, a tulip and a sprout.
      ctx.fillStyle = '#4fae5a';
      ctx.beginPath();
      ctx.arc(8, 9, 5.5, 0, TAU);
      ctx.arc(12, 7.5, 4.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#7fe08a';
      ctx.beginPath();
      ctx.arc(9.5, 6.5, 2.4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#3f9a4a';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(19, 13);
      ctx.lineTo(19, 4);
      ctx.stroke();
      ctx.fillStyle = '#ff6b9a';
      ctx.beginPath();
      ctx.moveTo(16.6, 2);
      ctx.lineTo(17.6, 5.4);
      ctx.lineTo(20.4, 5.4);
      ctx.lineTo(21.4, 2);
      ctx.lineTo(19, 3.4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5fd68a';
      ctx.beginPath();
      ctx.ellipse(25, 9, 1.4, 3, -0.6, 0, TAU);
      ctx.ellipse(28, 9, 1.4, 3, 0.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = linear(ctx, 0, 11, 0, 18, [
        [0, '#c9845a'],
        [1, '#6a3524'],
      ]);
      ctx.fillRect(2, 11, 28, 6.5);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(2, 11, 28, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (const x of [9, 16, 23]) ctx.fillRect(x, 12, 0.6, 5.5);
      break;
    }
    case 'lantern': {
      ctx.fillStyle = radial(ctx, 5, 9, 9, [
        [0, 'rgba(255,255,255,0.5)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
      ctx.fillRect(0, 0, 10, 16);
      ctx.fillStyle = linear(ctx, 1, 0, 9, 0, [
        [0, '#c8c8c8'],
        [0.45, '#ffffff'],
        [1, '#a0a0a0'],
      ]);
      ctx.beginPath();
      ctx.ellipse(5, 9, 4, 5, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 0.4;
      for (const y of [6.5, 9, 11.5]) {
        ctx.beginPath();
        ctx.moveTo(1.4, y);
        ctx.lineTo(8.6, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#3a2a2a';
      ctx.fillRect(3, 3.4, 4, 1.2);
      ctx.fillRect(3, 13.6, 4, 1.2);
      ctx.fillRect(4.7, 0, 0.6, 3.6);
      break;
    }
    case 'duck': {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.ellipse(8, 10, 7, 4, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(11.5, 5, 3.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ff9a2e';
      ctx.beginPath();
      ctx.ellipse(15.2, 5.6, 1.8, 0.9, 0.1, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#2a1f1a';
      ctx.beginPath();
      ctx.arc(12.3, 4.2, 0.7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(6, 8.4, 3, 1.2, -0.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#f0b81e';
      ctx.beginPath();
      ctx.ellipse(5, 9.6, 2.6, 1.6, 0.3, 0, TAU);
      ctx.fill();
      break;
    }
    case 'cactus': {
      ctx.fillStyle = '#3fae6a';
      const pill = (x: number, y: number, w: number, h: number) => {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, w / 2);
        ctx.fill();
      };
      pill(5, 3, 4, 12);
      pill(1.6, 6, 2.8, 5);
      pill(9.6, 4.5, 2.8, 5);
      ctx.fillRect(3, 9.5, 2.5, 1.6);
      ctx.fillRect(8.5, 8, 2.5, 1.6);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(6, 4, 0.7, 10);
      ctx.fillStyle = '#ff7ab8';
      ctx.beginPath();
      ctx.arc(7, 3, 1.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = linear(ctx, 0, 14, 0, 20, [
        [0, '#d98a5c'],
        [1, '#7a3f2a'],
      ]);
      ctx.beginPath();
      ctx.moveTo(2.5, 14);
      ctx.lineTo(11.5, 14);
      ctx.lineTo(10.5, 19.6);
      ctx.lineTo(3.5, 19.6);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'gnome': {
      ctx.fillStyle = '#4f7cff';
      ctx.beginPath();
      ctx.ellipse(7, 16, 5, 4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#f4f0e8';
      ctx.beginPath();
      ctx.moveTo(3.4, 10.5);
      ctx.quadraticCurveTo(7, 19, 10.6, 10.5);
      ctx.fill();
      ctx.fillStyle = '#ffc8a8';
      ctx.beginPath();
      ctx.arc(7, 10, 2.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ff9a8a';
      ctx.beginPath();
      ctx.arc(7, 10.8, 0.9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#e8324e';
      ctx.beginPath();
      ctx.moveTo(3.6, 9);
      ctx.quadraticCurveTo(7, -1, 10.4, 9);
      ctx.closePath();
      ctx.fill();
      // A bubble helmet: it is a space gnome.
      ctx.strokeStyle = 'rgba(200,240,255,0.75)';
      ctx.lineWidth = 0.6;
      ctx.fillStyle = 'rgba(160,220,255,0.15)';
      ctx.beginPath();
      ctx.arc(7, 7.5, 6, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(4.6, 4.8, 1.4, 0.7, -0.6, 0, TAU);
      ctx.fill();
      break;
    }
    case 'neon': {
      ctx.fillStyle = 'rgba(14,10,32,0.88)';
      ctx.beginPath();
      ctx.roundRect(1, 1, 34, 13, 3);
      ctx.fill();
      ctx.strokeStyle = '#5cf2ff';
      ctx.lineWidth = 0.8;
      ctx.shadowColor = '#5cf2ff';
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.roundRect(2.2, 2.2, 31.6, 10.6, 2.4);
      ctx.stroke();
      ctx.shadowColor = '#ff5daf';
      ctx.fillStyle = '#ffd0ea';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('OPEN', 18, 8);
      ctx.shadowBlur = 0;
      break;
    }
    case 'disco': {
      ctx.strokeStyle = 'rgba(200,206,255,0.6)';
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(7, 13);
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.arc(7, 19, 6, 0, TAU);
      ctx.clip();
      ctx.fillStyle = radial(ctx, 5, 17, 8, [
        [0, '#ffffff'],
        [0.5, '#b8c0e8'],
        [1, '#4a5090'],
      ]);
      ctx.fillRect(0, 12, 14, 14);
      const r = rng(42);
      for (let y = 13; y < 25; y += 1.6) {
        for (let x = 1; x < 13; x += 1.6) {
          ctx.fillStyle = `rgba(${r() > 0.7 ? '255,255,255' : r() > 0.5 ? '255,180,230' : '120,130,200'},${0.25 + r() * 0.5})`;
          ctx.fillRect(x, y, 1.3, 1.3);
        }
      }
      ctx.restore();
      break;
    }
    case 'flag': {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(6, 0);
      ctx.lineTo(3, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      ctx.moveTo(3, 0);
      ctx.lineTo(6, 0);
      ctx.lineTo(3, 8);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'bulb': {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(3, 3.4, 1.6, 2.2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#5a5f80';
      ctx.fillRect(2.2, 0, 1.6, 1.4);
      break;
    }
  }
}

export const ornament = (id: string) => {
  const [w, h] = ORNAMENT_SIZE[id];
  return paint(w, h, (ctx) => drawOrnament(ctx, id), 5);
};

/** A picture of each decoration for the menu, 40 units square. */
export function ornamentUrl(id: string): string {
  return paintUrl(40, 40, (ctx) => {
    const piece = (pid: string, x: number, y: number, s: number, tint?: string) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      drawOrnament(ctx, pid);
      if (tint) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = tint;
        const [w, h] = ORNAMENT_SIZE[pid];
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    };
    if (id === 'bulbs') {
      ctx.strokeStyle = '#5a5f80';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(2, 12);
      ctx.quadraticCurveTo(20, 30, 38, 12);
      ctx.stroke();
      const colors = ['#ff6b9a', '#ffd166', '#4fe3c1', '#7aa7ff', '#ff9a4c'];
      colors.forEach((c, i) => {
        const t = (i + 0.5) / colors.length;
        const x = 2 + 36 * t;
        const y = 12 + 2 * t * (1 - t) * 18;
        ctx.fillStyle = radial(ctx, x, y + 3, 6, [
          [0, rgba(c, 0.6)],
          [1, rgba(c, 0)],
        ]);
        ctx.fillRect(x - 6, y - 3, 12, 12);
        piece('bulb', x - 3, y, 1.2, rgba(c, 0.85));
      });
    } else if (id === 'bunting') {
      ctx.strokeStyle = '#c5cbff';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(1, 12);
      ctx.quadraticCurveTo(20, 26, 39, 12);
      ctx.stroke();
      const colors = ['#ff6b9a', '#ffd166', '#4fe3c1', '#7aa7ff', '#c58cff'];
      colors.forEach((c, i) => {
        const t = (i + 0.5) / colors.length;
        piece('flag', 1 + 38 * t - 3.6, 12 + 2 * t * (1 - t) * 14 - 0.5, 1.2, rgba(c, 0.95));
      });
    } else if (id === 'lanterns') {
      piece('lantern', 3, 8, 1.3, 'rgba(255,90,90,0.75)');
      piece('lantern', 14, 4, 1.3, 'rgba(255,170,70,0.75)');
      piece('lantern', 25, 10, 1.3, 'rgba(255,110,180,0.75)');
    } else {
      const [w, h] = ORNAMENT_SIZE[id];
      const s = Math.min(34 / w, 34 / h);
      piece(id, 20 - (w * s) / 2, 20 - (h * s) / 2, s);
    }
  }, 3);
}

// ---------- Deep sectors ----------

/** A black hole in place of the gas giant: horizon, photon ring and a tilted accretion disk. Same framing as `planet`. */
export function blackHole(size: number, glowColor = '#ff9a4c'): Texture {
  const pad = size * 0.35;
  const S = size + pad * 2;
  return paint(S, S, (ctx) => {
    const c = S / 2;
    const r = size * 0.2;
    ctx.fillStyle = radial(ctx, c, c, size * 0.62, [
      [0, rgba(glowColor, 0.5)],
      [0.35, rgba(glowColor, 0.18)],
      [1, rgba(glowColor, 0)],
    ]);
    ctx.fillRect(0, 0, S, S);
    const disk = (front: boolean) => {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(-0.28);
      ctx.beginPath();
      if (front) ctx.rect(-S, 0, S * 2, S);
      else ctx.rect(-S, -S, S * 2, S);
      ctx.clip();
      const n = 14;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const rx = r * (1.35 + t * 1.6);
        // Hot white-gold near the hole, cooling to orange and violet further out.
        const col = t < 0.3 ? `rgba(255,${235 - t * 200},${200 - t * 400},${0.85 - t})` : t < 0.7 ? `rgba(255,${150 - (t - 0.3) * 150},${60 + (t - 0.3) * 100},${0.65 - t * 0.45})` : `rgba(${200 - (t - 0.7) * 200},${70},${200},${0.4 - (t - 0.7) * 0.9})`;
        ctx.strokeStyle = col;
        ctx.lineWidth = r * 0.14;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, rx * 0.2, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    };
    disk(false);
    // The far side of the disk, bent up over the hole by its gravity.
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(-0.28);
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(255,${200 - i * 25},${120 - i * 20},${0.55 - i * 0.09})`;
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * (1.18 + i * 0.09), r * (1.12 + i * 0.08), 0, Math.PI, TAU);
      ctx.stroke();
    }
    ctx.restore();
    // Photon ring and the horizon itself.
    ctx.shadowColor = 'rgba(255,190,120,0.9)';
    ctx.shadowBlur = r * 0.5;
    ctx.strokeStyle = 'rgba(255,236,200,0.95)';
    ctx.lineWidth = r * 0.07;
    ctx.beginPath();
    ctx.arc(c, c, r * 1.06, 0, TAU);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(c, c, r, 0, TAU);
    ctx.fill();
    disk(true);
  }, 2);
}

/** Faint spiral arms of infalling matter; spun slowly over the black hole. */
export const holeSwirl = () =>
  paint(160, 160, (ctx) => {
    const c = 80;
    for (let arm = 0; arm < 3; arm++) {
      for (let i = 0; i < 40; i++) {
        const t = i / 40;
        const a = arm * (TAU / 3) + t * 4.2;
        const rr = 74 - t * 56;
        ctx.fillStyle = `rgba(255,${150 + t * 80},${110 + t * 60},${0.08 + t * 0.22})`;
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * rr, c + Math.sin(a) * rr, 2.5 + t * 2, 0, TAU);
        ctx.fill();
      }
    }
  }, 2);

/** A floating ice crystal cluster for the Ice Belt. */
export const iceShard = (seed: number) =>
  paint(48, 64, (ctx) => {
    const r = rng(seed * 13 + 5);
    const count = 2 + Math.floor(r() * 3);
    for (let i = 0; i < count; i++) {
      const lean = (r() - 0.5) * 0.9;
      const h = 30 + r() * 28;
      const w = 7 + r() * 7;
      ctx.save();
      ctx.translate(24 + (r() - 0.5) * 12, 60);
      ctx.rotate(lean);
      // A long hexagonal prism: a lit face on the left, a shaded one on the right.
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(-w / 2, -h + w);
      ctx.lineTo(0, -h);
      ctx.lineTo(w / 2, -h + w);
      ctx.lineTo(w / 2, 0);
      ctx.closePath();
      ctx.fillStyle = linear(ctx, -w / 2, 0, w / 2, 0, [
        [0, 'rgba(235,250,255,0.95)'],
        [0.45, 'rgba(150,215,255,0.85)'],
        [0.5, 'rgba(90,160,230,0.85)'],
        [1, 'rgba(40,90,170,0.9)'],
      ]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 0.6, -2);
      ctx.lineTo(-w / 2 + 0.6, -h + w);
      ctx.lineTo(0, -h + 0.8);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.moveTo(0, -h + 2);
      ctx.lineTo(0, -4);
      ctx.stroke();
      ctx.restore();
    }
  }, 3);

/** A broken chunk of an old city drifting in the Derelict City: rock, towers and a few lit windows. */
export const ruin = (seed: number) =>
  paint(200, 160, (ctx) => {
    const r = rng(seed * 7 + 3);
    // Rock underside.
    ctx.beginPath();
    ctx.moveTo(14, 112);
    for (let i = 0; i <= 10; i++) {
      const x = 14 + i * 17.2;
      ctx.lineTo(x, 116 + Math.sin((i / 10) * Math.PI) * (30 + r() * 12));
    }
    ctx.lineTo(186, 112);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, 110, 0, 160, [
      [0, '#4a3a32'],
      [1, '#1a1412'],
    ]);
    ctx.fill();
    ctx.fillStyle = '#5a4a40';
    ctx.fillRect(12, 108, 176, 6);
    // Towers, some with broken tops.
    let x = 20;
    while (x < 175) {
      const w = 14 + r() * 18;
      const h = 30 + r() * 70;
      const top = 108 - h;
      ctx.fillStyle = linear(ctx, x, 0, x + w, 0, [
        [0, '#5a6070'],
        [0.25, '#3a3f4c'],
        [1, '#22252e'],
      ]);
      ctx.beginPath();
      ctx.moveTo(x, 108);
      ctx.lineTo(x, top + (r() < 0.5 ? 0 : 6));
      if (r() < 0.45) {
        // Snapped off: a jagged top.
        for (let k = 1; k <= 4; k++) ctx.lineTo(x + (w * k) / 4, top + r() * 12);
      } else ctx.lineTo(x + w, top);
      ctx.lineTo(x + w, 108);
      ctx.closePath();
      ctx.fill();
      for (let wy = top + 8; wy < 102; wy += 7) {
        for (let wx = x + 3; wx < x + w - 4; wx += 5) {
          const lit = r() < 0.22;
          ctx.fillStyle = lit ? `rgba(255,${190 + r() * 40},${100 + r() * 40},0.95)` : 'rgba(10,12,18,0.7)';
          ctx.fillRect(wx, wy, 2.4, 3.2);
        }
      }
      if (h > 80) {
        ctx.strokeStyle = '#6a6f80';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w / 2, top);
        ctx.lineTo(x + w / 2, top - 14);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,90,90,0.9)';
        ctx.beginPath();
        ctx.arc(x + w / 2, top - 14, 1.6, 0, TAU);
        ctx.fill();
      }
      x += w + 2 + r() * 6;
    }
  }, 2);

/** The size of each rig's painting, and where its moving part hangs, in world units. */
export const RIG_SIZE = 64;
export const RIG_PART_AT: Record<string, [number, number]> = { ice: [32, 34], city: [56, 18], hole: [32, 40] };

function steel(ctx: Ctx, x0: number, x1: number, light = '#e6eefc', dark = '#5a6a8a'): CanvasGradient {
  return linear(ctx, x0, 0, x1, 0, [
    [0, light],
    [0.4, '#a8b6d0'],
    [1, dark],
  ]);
}

/** The fixed frame of a sector rig, hanging from a mount at the top middle. */
function drawRigBody(ctx: Ctx, look: string): void {
  // Mount plate where it bolts onto the hull.
  ctx.fillStyle = steel(ctx, 22, 42);
  ctx.beginPath();
  ctx.roundRect(22, 0, 20, 7, 2);
  ctx.fill();
  if (look === 'ice') {
    ctx.strokeStyle = '#8a9ab8';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(27, 6);
    ctx.lineTo(20, 16);
    ctx.moveTo(37, 6);
    ctx.lineTo(44, 16);
    ctx.stroke();
    ctx.fillStyle = steel(ctx, 14, 50, '#f4faff', '#4a6488');
    ctx.beginPath();
    ctx.roundRect(14, 14, 36, 20, 6);
    ctx.fill();
    // Coolant window.
    ctx.fillStyle = radial(ctx, 32, 24, 10, [
      [0, '#e8fbff'],
      [0.5, '#5fd0ff'],
      [1, '#1a5a9a'],
    ]);
    ctx.beginPath();
    ctx.roundRect(24, 19, 16, 9, 4);
    ctx.fill();
    // Frost on top.
    ctx.fillStyle = 'rgba(240,252,255,0.95)';
    for (const [fx, fh] of [[17, 5], [22, 3], [41, 4], [46, 6]] as const) {
      ctx.beginPath();
      ctx.moveTo(fx - 2, 15);
      ctx.lineTo(fx, 15 - fh);
      ctx.lineTo(fx + 2, 15);
      ctx.fill();
    }
  } else if (look === 'city') {
    // A short mast with a jib reaching out to the right.
    ctx.fillStyle = steel(ctx, 26, 38, '#ffe2a8', '#8a5a2a');
    ctx.fillRect(28, 6, 8, 20);
    ctx.strokeStyle = '#ffb547';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(30, 12);
    ctx.lineTo(58, 16);
    ctx.moveTo(30, 22);
    ctx.lineTo(58, 16);
    ctx.stroke();
    // Lattice.
    ctx.strokeStyle = '#c78a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = 34 + i * 6;
      ctx.moveTo(a, 12.6 + ((a - 30) / 28) * 4);
      ctx.lineTo(a + 6, 21 - ((a + 6 - 30) / 28) * 5);
    }
    ctx.stroke();
    // Counterweight and a warning stripe.
    ctx.fillStyle = '#4a4a58';
    ctx.fillRect(14, 12, 14, 10);
    ctx.fillStyle = '#ffd166';
    for (let i = 0; i < 3; i++) ctx.fillRect(15 + i * 4.5, 13, 2, 8);
    ctx.fillStyle = 'rgba(255,90,90,0.95)';
    ctx.beginPath();
    ctx.arc(58, 16, 1.8, 0, TAU);
    ctx.fill();
  } else {
    // Three struts holding a ring.
    ctx.strokeStyle = '#7a6a9a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(32, 6);
    ctx.lineTo(32, 18);
    ctx.moveTo(26, 6);
    ctx.lineTo(14, 32);
    ctx.moveTo(38, 6);
    ctx.lineTo(50, 32);
    ctx.stroke();
    ctx.strokeStyle = steel(ctx, 10, 54, '#f0e6ff', '#4a3a6a');
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(32, 40, 19, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(220,170,255,0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(32, 40, 15.5, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.fillStyle = i % 2 ? '#ffd166' : '#c58cff';
      ctx.beginPath();
      ctx.arc(32 + Math.cos(a) * 19, 40 + Math.sin(a) * 19, 1.3, 0, TAU);
      ctx.fill();
    }
  }
}

/** The rig's moving part, drawn around its pivot at (0, 0). */
function drawRigPart(ctx: Ctx, look: string): void {
  if (look === 'ice') {
    // A drill bit pointing down, with its spiral grooves.
    ctx.fillStyle = linear(ctx, -8, 0, 8, 0, [
      [0, '#f0f8ff'],
      [0.45, '#9ab8d8'],
      [1, '#3a5478'],
    ]);
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.lineTo(0, 24);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,50,80,0.7)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = 3 + i * 5;
      const hw = 8 * (1 - y / 24);
      ctx.beginPath();
      ctx.moveTo(-hw, y);
      ctx.lineTo(hw, y + 3.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#e8fbff';
    ctx.beginPath();
    ctx.arc(0, 23, 1.2, 0, TAU);
    ctx.fill();
  } else if (look === 'city') {
    ctx.strokeStyle = '#8a8a9a';
    ctx.lineWidth = 1.1;
    ctx.setLineDash([2, 1.2]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 20);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = radial(ctx, -2.5, 23, 9, [
      [0, '#a0a4b8'],
      [0.6, '#4a4e60'],
      [1, '#1c1e28'],
    ]);
    ctx.beginPath();
    ctx.arc(0, 26, 7, 0, TAU);
    ctx.fill();
  } else {
    for (let arm = 0; arm < 3; arm++) {
      for (let i = 0; i < 16; i++) {
        const t = i / 16;
        const a = arm * (TAU / 3) + t * 3.6;
        const rr = 14 - t * 12;
        ctx.fillStyle = `rgba(${200 + t * 55},${120 + t * 100},255,${0.35 + t * 0.6})`;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 1 + t * 1.2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#05020a';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, TAU);
    ctx.fill();
  }
}

const RIG_PART_BOX: Record<string, [number, number, number, number]> = { ice: [-9, -1, 18, 27], city: [-8, -1, 16, 35], hole: [-16, -16, 32, 32] };

export const rigBody = (look: string) => paint(RIG_SIZE, RIG_SIZE, (ctx) => drawRigBody(ctx, look), RES, { bevel: 1.2, light: 0.5, grain: 0.05, grime: 0.15, seed: 3 });

/** The moving part, with its pivot at the texture's anchor given by `rigPartAnchor`. */
export const rigPart = (look: string) => {
  const [x, y, w, h] = RIG_PART_BOX[look];
  return paint(w, h, (ctx) => {
    ctx.translate(-x, -y);
    drawRigPart(ctx, look);
  });
};
export const rigPartAnchor = (look: string): [number, number] => {
  const [x, y, w, h] = RIG_PART_BOX[look];
  return [-x / w, -y / h];
};

/** The whole rig as a picture for the menus. Empty if the canvas can't be read. */
export function rigUrl(look: string): string {
  return paintUrl(RIG_SIZE, RIG_SIZE, (ctx) => {
    drawRigBody(ctx, look);
    const [px, py] = RIG_PART_AT[look];
    ctx.translate(px, py);
    drawRigPart(ctx, look);
  }, 2);
}
