import type { PlanetPath } from '../core/planet';

/*
 * The living planet's look (core/planet.ts has the rules). A surface map is painted once per era
 * and path: height from wrapped noise, coloured for the era (grey craters, then ice and glowing
 * vents, seas, colour, life), with a cloud layer and a city-light layer. The planet itself is then
 * drawn as a real sphere from that map, turned a little each time, lit from the upper left, with
 * town lights showing on its night side and a rim of air once it has some.
 */

const W = 512;
const H = 256;

export interface PlanetLook {
  era: number;
  path: PlanetPath | null;
  /** How far the town lights have spread, 0 to 1. */
  lights: number;
}

/** Air colour per era (none while it is dead). */
export function atmosphereColor(look: PlanetLook): number {
  if (look.era <= 0) return 0x9a8f86;
  if (look.era === 1) return 0xffb08a;
  if (look.era === 2 || !look.path) return 0x7cc8ff;
  return look.path === 'coral' ? 0x6fe8ff : look.path === 'forest' ? 0x9ff0c0 : 0xd6a8ff;
}

/** Periodic in x (so the map wraps round the planet) value noise, summed over octaves. */
function fbm(seed: number, octaves: number, base: number) {
  const layers: ((x: number, y: number) => number)[] = [];
  for (let o = 0; o < octaves; o++) {
    const cells = base << o;
    const cell = W / cells;
    const s = seed + o * 101;
    const hash = (x: number, y: number) => {
      const xx = ((x % cells) + cells) % cells;
      let n = (xx * 374761393 + y * 668265263 + s * 2147483647) | 0;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    layers.push((px, py) => {
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
    });
  }
  return (x: number, y: number) => {
    let v = 0;
    let amp = 0.5;
    let sum = 0;
    for (const l of layers) {
      v += l(x, y) * amp;
      sum += amp;
      amp *= 0.5;
    }
    return v / sum;
  };
}

const hexRgb = (h: number): [number, number, number] => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

interface Maps {
  color: Float32Array;
  clouds: Float32Array;
  lights: Float32Array;
  /** 1 where the colour is glowing on its own (lava vents), for the night side. */
  glow: Float32Array;
}

const mapCache = new Map<string, Maps>();
// The same rock every time, so the planet a player has been tending keeps its continents.
const heightBase = fbm(7, 7, 4);
const detail = fbm(19, 4, 16);
const fine = fbm(23, 4, 20);
const height = (x: number, y: number) => heightBase(x, y) * 0.78 + fine(x, y) * 0.22;
/** A fixed hash per map pixel, for single town lights. */
const speck = (x: number, y: number) => {
  let n = (x * 73856093) ^ (y * 19349663);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
/** Old impact craters, the same on every planet. */
const CRATERS = (() => {
  let s = 99;
  const r = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return Array.from({ length: 70 }, () => ({ x: r() * W, y: H * 0.12 + r() * H * 0.76, r: 3 + Math.pow(r(), 2.2) * 22 }));
})();
const cloudNoise = fbm(31, 5, 10);
const cloudWarp = fbm(43, 3, 3);
const lightNoise = fbm(53, 4, 24);

/** Fields every look shares, worked out once: height, detail, relief, craters, cloud and town noise. */
interface Base {
  height: Float32Array;
  detail: Float32Array;
  relief: Float32Array;
  /** Crater floor darkness (0 to 1) and rim light (-1 shadowed to 1 lit). */
  pit: Float32Array;
  rim: Float32Array;
  cloud: Float32Array;
  warp: Float32Array;
  town: Float32Array;
  speck: Float32Array;
}
let base: Base | null = null;

function baseFields(): Base {
  if (base) return base;
  const n = W * H;
  const b: Base = { height: new Float32Array(n), detail: new Float32Array(n), relief: new Float32Array(n), pit: new Float32Array(n), rim: new Float32Array(n), cloud: new Float32Array(n), warp: new Float32Array(n), town: new Float32Array(n), speck: new Float32Array(n) };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      b.height[i] = height(x, y);
      b.detail[i] = detail(x, y);
      const wv = cloudWarp(x, y) - 0.5;
      b.warp[i] = wv;
      b.cloud[i] = cloudNoise(x + wv * 60, y * 1.4 + wv * 20);
      b.town[i] = lightNoise(x, y);
      b.speck[i] = speck(x, y);
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const h = (xx: number, yy: number) => b.height[Math.max(0, Math.min(H - 1, yy)) * W + ((xx + W) % W)];
      const slope = (h(x + 1, y) - h(x - 1, y)) * -0.6 + (h(x, y + 1) - h(x, y - 1)) * -0.8;
      b.relief[y * W + x] = Math.max(-0.22, Math.min(0.22, slope * 7));
    }
  }
  for (const k of CRATERS) {
    const r = Math.ceil(k.r * 1.3);
    for (let yy = Math.floor(k.y - r); yy <= k.y + r; yy++) {
      if (yy < 0 || yy >= H) continue;
      for (let xx = Math.floor(k.x - r); xx <= k.x + r; xx++) {
        const dx = xx - k.x;
        const dy = yy - k.y;
        const q = Math.hypot(dx, dy) / k.r;
        if (q > 1.25) continue;
        const i = yy * W + ((xx % W) + W) % W;
        if (q < 0.85) b.pit[i] = Math.max(b.pit[i], 1 - q * 0.4);
        else {
          const side = dx * -0.6 + dy * -0.8 > 0 ? 1 : -1;
          const a = Math.max(0, 1 - Math.abs(q - 1.05) / 0.2) * 0.8;
          if (Math.abs(a) > Math.abs(b.rim[i])) b.rim[i] = side * a;
        }
      }
    }
  }
  base = b;
  return b;
}

function buildMaps(look: PlanetLook): Maps {
  const key = `${look.era}|${look.path ?? ''}|${Math.round(look.lights * 10)}`;
  const hit = mapCache.get(key);
  if (hit) return hit;
  const color = new Float32Array(W * H * 3);
  const clouds = new Float32Array(W * H);
  const lights = new Float32Array(W * H);
  const glow = new Float32Array(W * H);
  const { era, path } = look;
  const seas = era >= 2;
  const sea = path === 'coral' ? 0.56 : path === 'crystal' ? 0.48 : 0.52;
  const rock: [number, number, number][] = era === 0 ? [hexRgb(0x3e3936), hexRgb(0x8c847c)] : [hexRgb(0x4a3a33), hexRgb(0x9a8470)];
  const bare: [number, number, number][] = [hexRgb(0x7a5c3e), hexRgb(0xc7a878)];
  const green: Record<PlanetPath, [number, number, number][]> = {
    forest: [hexRgb(0x1f6a2c), hexRgb(0x7bc95a)],
    coral: [hexRgb(0x3c9a4c), hexRgb(0xe8d9a0)],
    crystal: [hexRgb(0x6a3fb0), hexRgb(0xf0b8ff)],
  };
  const deep = hexRgb(path === 'coral' ? 0x0f5a8a : 0x123e86);
  const shallow = hexRgb(path === 'coral' ? 0x3fe0d0 : 0x3d8fd6);
  const ice = hexRgb(0xeaf4ff);
  const B = baseFields();
  const lush = era >= 3 && path ? (era === 3 ? 0.7 : 1) : 0;

  for (let y = 0; y < H; y++) {
    const lat = (y / (H - 1)) * 2 - 1;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const h = B.height[i];
      const d = B.detail[i];
      let c: [number, number, number];
      if (seas && h < sea) {
        const depth = clamp01((sea - h) / 0.18);
        c = mix(shallow, deep, Math.pow(depth, 0.6));
      } else {
        const t = clamp01((h - (seas ? sea : 0.25)) / 0.45);
        c = mix(rock[0], rock[1], clamp01(t * 0.7 + d * 0.5));
        if (seas) {
          // Bare land first, then colour spreading inland from the coasts.
          c = mix(c, mix(bare[0], bare[1], clamp01(d * 0.9 + t * 0.3)), 0.75);
          if (lush > 0 && path) {
            const g = green[path];
            const spread = smooth(0.75, 0.35, t + (d - 0.5) * 0.4) * lush;
            c = mix(c, mix(g[0], g[1], clamp01(d * 1.1 - 0.05 + (path === 'coral' ? t * 0.4 : 0))), spread);
          }
        }
      }
      // Craters: sharp on the dead world, softening as air and life cover them; and a little relief on land.
      if (!(seas && h < sea)) {
        const fade = era === 0 ? 1 : era === 1 ? 0.7 : 0.25 * (1 - lush);
        if (B.pit[i] > 0) c = mix(c, [c[0] * 0.62, c[1] * 0.6, c[2] * 0.6], fade * B.pit[i]);
        const rim = B.rim[i];
        if (rim > 0) c = mix(c, [Math.min(255, c[0] * 1.35), Math.min(255, c[1] * 1.32), Math.min(255, c[2] * 1.3)], fade * rim);
        else if (rim < 0) c = mix(c, [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7], -fade * rim);
        const k = 1 + B.relief[i];
        c = [c[0] * k, c[1] * k, c[2] * k];
      }
      // Polar ice: none on the dead world, big in the thaw, shrinking as it warms.
      if (era >= 1) {
        const cap = era === 1 ? 0.62 : era === 2 ? 0.78 : 0.86;
        const p = smooth(cap, cap + 0.08, Math.abs(lat) + (d - 0.5) * 0.18);
        c = mix(c, ice, p);
      }
      // Glowing vents while it thaws.
      if (era === 1) {
        const v = smooth(0.62, 0.72, B.town[i]) * smooth(0.56, 0.36, h);
        if (v > 0) {
          c = mix(c, hexRgb(0xff6a2a), v);
          glow[i] = v;
        }
      }
      color[i * 3] = c[0];
      color[i * 3 + 1] = c[1];
      color[i * 3 + 2] = c[2];
      // Clouds: a thin haze in the thaw, proper weather once there are seas.
      if (era >= 1) {
        const wv = B.warp[i];
        const n = B.cloud[i];
        const band = 0.5 + 0.5 * Math.sin(lat * 9 + wv * 6);
        const v = n * 0.8 + band * 0.2;
        clouds[i] = era === 1 ? smooth(0.5, 0.7, v) * 0.3 : smooth(0.55, 0.66, v) * 0.9;
      }
      // Town lights on land, near the coasts first.
      if (look.lights > 0 && seas && h >= sea && Math.abs(lat) < 0.75) {
        const coast = smooth(sea + 0.14, sea, h);
        const n = B.town[i];
        // Towns cluster near the coasts; each lit pixel is a single speck, brighter in the middle.
        // Kept sparse: a thriving world reads as strings of little towns, not lit-up continents.
        const th = 0.72 - look.lights * 0.08 - coast * 0.08;
        const town = smooth(th, th + 0.12, n);
        if (town > 0 && B.speck[i] < town * town * (0.1 + look.lights * 0.22)) lights[i] = 0.5 + 0.5 * town;
      }
    }
  }
  const maps = { color, clouds, lights, glow };
  mapCache.set(key, maps);
  return maps;
}

interface Frame {
  size: number;
  /** Per pixel: map x (before turning), map y, light amount, rim, edge alpha; -1 x = outside. */
  mx: Float32Array;
  my: Int16Array;
  lit: Float32Array;
  rim: Float32Array;
  alpha: Float32Array;
}

const frames = new Map<number, Frame>();

/** Precomputed sphere for a canvas `size` pixels across (the axis tilted a little). */
function frameFor(size: number): Frame {
  const hit = frames.get(size);
  if (hit) return hit;
  const n = size * size;
  const f: Frame = { size, mx: new Float32Array(n), my: new Int16Array(n), lit: new Float32Array(n), rim: new Float32Array(n), alpha: new Float32Array(n) };
  const r = size / 2;
  const tilt = -0.32;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const L = [-0.62, -0.48, 0.62];
  const ll = Math.hypot(L[0], L[1], L[2]);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = py * size + px;
      const x = (px + 0.5 - r) / r;
      const y = (py + 0.5 - r) / r;
      const d2 = x * x + y * y;
      const d = Math.sqrt(d2);
      if (d > 1 + 1 / r) {
        f.mx[i] = -1;
        continue;
      }
      const z = Math.sqrt(Math.max(0, 1 - Math.min(1, d2)));
      f.alpha[i] = clamp01((1 - d) * r + 0.5);
      // Lighting uses the view-space normal.
      f.lit[i] = Math.max(0, (x * L[0] + y * L[1] + z * L[2]) / ll);
      f.rim[i] = Math.pow(1 - z, 2.4);
      // Tilt the axis, then find latitude and longitude.
      const tx = x * ct - y * st;
      const ty = x * st + y * ct;
      const lat = Math.asin(Math.max(-1, Math.min(1, ty)));
      const lon = Math.atan2(tx, z);
      f.mx[i] = ((lon / (Math.PI * 2)) * W + W) % W;
      f.my[i] = Math.max(0, Math.min(H - 1, Math.round(((lat / Math.PI) + 0.5) * (H - 1))));
    }
  }
  frames.set(size, f);
  return f;
}

/**
 * Draws the planet into `img` (size x size): `turn` and `cloudTurn` are how far the surface and
 * the clouds have turned (0 to 1 a full turn), `night` how dark the station's sky is (0 to 1).
 */
export function drawPlanet(img: ImageData, look: PlanetLook, turn: number, cloudTurn: number, night: number): void {
  const size = img.width;
  const f = frameFor(size);
  const m = buildMaps(look);
  const data = img.data;
  const off = (((turn % 1) + 1) % 1) * W;
  const coff = (((cloudTurn % 1) + 1) % 1) * W;
  const air = hexRgb(atmosphereColor(look));
  const airAmt = look.era === 0 ? 0.12 : look.era === 1 ? 0.35 : 0.6;
  const lightColor = [255, 214, 130];
  for (let i = 0, n = size * size; i < n; i++) {
    const o = i * 4;
    const fx = f.mx[i];
    if (fx < 0) {
      data[o + 3] = 0;
      continue;
    }
    const y = f.my[i];
    const x = Math.floor(fx + off) % W;
    const j = y * W + x;
    let r = m.color[j * 3];
    let g = m.color[j * 3 + 1];
    let b = m.color[j * 3 + 2];
    const cx = Math.floor(fx + coff) % W;
    const c = m.clouds[y * W + cx];
    if (c > 0) {
      r += (245 - r) * c;
      g += (248 - g) * c;
      b += (255 - b) * c;
    }
    const lit = f.lit[i];
    const shade = 0.1 + 0.9 * Math.pow(lit, 0.75);
    r *= shade;
    g *= shade;
    b *= shade;
    // Town lights and glowing vents show on the dark side, and a little more at night.
    const dark = smooth(0.42, 0.06, lit) + night * 0.35;
    const li = m.lights[j] * (1 - c * 0.7) * Math.min(1, dark);
    if (li > 0) {
      r += lightColor[0] * li;
      g += lightColor[1] * li;
      b += lightColor[2] * li * 0.7;
    }
    const gl = m.glow[j] * Math.min(1, 0.35 + dark);
    if (gl > 0) {
      r += 255 * gl * 0.6;
      g += 90 * gl * 0.6;
      b += 30 * gl * 0.6;
    }
    const rim = f.rim[i] * airAmt * (0.35 + lit * 0.9);
    r += (air[0] - r) * rim;
    g += (air[1] - g) * rim;
    b += (air[2] - b) * rim;
    const a = f.alpha[i];
    data[o] = r > 255 ? 255 : r;
    data[o + 1] = g > 255 ? 255 : g;
    data[o + 2] = b > 255 ? 255 : b;
    data[o + 3] = a * 255;
  }
}

/** A still picture of the planet, for the menus. Empty if the canvas can't be read. */
export function planetPortrait(look: PlanetLook, size = 180, turn = 0.15): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    drawPlanet(img, look, turn, turn * 1.3, 0);
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  } catch {
    return '';
  }
}
