import type { Critter, CritterShape } from '../core/fishing';

/**
 * The space critters, drawn from SVG path data in a 40x40 box so the same shapes work as inline
 * SVG in the menus and as canvas paths (Path2D) for the tank that orbits the station.
 */

interface ShapeArt {
  /** Main body, filled with the critter's colour. */
  body: string;
  /** Fins, tentacles or spots, filled with the accent colour. */
  fill?: string;
  /** Lines stroked with the accent colour (tentacles, tails). */
  stroke?: string;
  strokeW?: number;
  eye: [number, number];
}

function starPath(cx: number, cy: number, outer: number, inner: number): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
  }
  return d + 'Z';
}

function spikes(cx: number, cy: number, r: number, n: number): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = a + Math.PI / n;
    const p = (ang: number, rr: number) => `${(cx + Math.cos(ang) * rr).toFixed(1)} ${(cy + Math.sin(ang) * rr).toFixed(1)}`;
    d += `M${p(a - 0.25, r - 1)}L${p(b - Math.PI / n, r + 5)}L${p(a + 0.25, r - 1)}Z`;
  }
  return d;
}

export const SHAPES: Record<CritterShape, ShapeArt> = {
  fish: {
    body: 'M6 20C10 10 24 9 30 20C24 31 10 30 6 20Z',
    fill: 'M28 20L37 12L35 20L37 28ZM15 12C18 8 22 8 24 11L18 13ZM16 27L21 32L23 28Z',
    eye: [13, 18],
  },
  jelly: {
    body: 'M7 23C7 7 33 7 33 23C30 25 27 22 24 24C22 22 18 22 16 24C13 22 10 25 7 23Z',
    stroke: 'M11 24q-3 6 1 13M17 24q3 6-1 13M23 24q-3 6 1 13M29 24q3 5 0 11',
    strokeW: 2.2,
    eye: [16, 16],
  },
  squid: {
    body: 'M20 3C28 9 29 19 27 25L13 25C11 19 12 9 20 3Z',
    fill: 'M12 8L6 13L13 14ZM28 8L34 13L27 14Z',
    stroke: 'M14 25q-4 6-1 13M18 25q-1 7 1 13M22 25q1 7-1 13M26 25q4 6 1 13',
    strokeW: 2.4,
    eye: [17, 19],
  },
  ray: {
    body: 'M20 9C27 11 35 16 39 23C31 22 25 24 20 30C15 24 9 22 1 23C5 16 13 11 20 9Z',
    fill: 'M20 13C23 14 26 17 27 20C24 20 22 21 20 23C18 21 16 20 13 20C14 17 17 14 20 13Z',
    stroke: 'M20 30q3 5-1 9',
    strokeW: 2,
    eye: [16, 17],
  },
  star: {
    body: starPath(20, 21, 18, 8),
    fill: 'M20 14a2 2 0 1 0 0.1 0ZM13 20a1.6 1.6 0 1 0 0.1 0ZM27 20a1.6 1.6 0 1 0 0.1 0Z',
    eye: [17, 21],
  },
  eel: {
    body: 'M3 26C8 14 14 32 20 22C24 15 29 12 35 14C38 15 38 20 35 21C31 22 27 20 24 25C19 34 9 34 3 26Z',
    fill: 'M10 26l3-5 2 6ZM20 22l3-6 2 5Z',
    eye: [33, 17],
  },
  puff: {
    body: 'M20 9a11 11 0 1 0 0.1 0Z',
    fill: spikes(20, 20, 11, 10) + 'M30 18l7-4-2 6 2 6-7-4Z',
    eye: [15, 18],
  },
  whale: {
    body: 'M3 22C3 12 17 7 27 13C31 15 33 18 35 16L38 11L37 21L39 29L34 25C30 30 17 34 9 30C5 28 3 26 3 22Z',
    fill: 'M6 25C12 29 22 30 30 25C26 31 14 32 6 25ZM17 22L23 28L24 22Z',
    eye: [10, 19],
  },
};

/** The critter as inline SVG. A silhouette for ones not caught yet. */
export function critterSvg(c: Critter, silhouette = false): string {
  const a = SHAPES[c.shape];
  const fg = silhouette ? '#1a1f45' : c.color;
  const ac = silhouette ? '#1a1f45' : c.accent;
  const line = silhouette ? '#454d8a' : 'rgb(0 0 0 / 0.45)';
  const parts = [
    a.stroke ? `<path d="${a.stroke}" fill="none" stroke="${ac}" stroke-width="${a.strokeW ?? 2}" stroke-linecap="round"/>` : '',
    `<path d="${a.body}" fill="${fg}" stroke="${line}" stroke-width="1.4" stroke-linejoin="round"/>`,
    a.fill ? `<path d="${a.fill}" fill="${ac}" stroke="${line}" stroke-width="1" stroke-linejoin="round"/>` : '',
    silhouette
      ? ''
      : `<circle cx="${a.eye[0]}" cy="${a.eye[1]}" r="2.6" fill="#fff"/><circle cx="${a.eye[0] + 0.6}" cy="${a.eye[1] + 0.3}" r="1.4" fill="#141230"/><circle cx="${a.eye[0] - 0.5}" cy="${a.eye[1] - 0.8}" r="0.6" fill="#fff"/>`,
  ];
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${parts.join('')}</svg>`;
}

const pathCache = new Map<string, Path2D>();
const path = (d: string) => {
  let p = pathCache.get(d);
  if (!p) pathCache.set(d, (p = new Path2D(d)));
  return p;
};

/** Draws the critter on a canvas, centred at (x, y), `size` pixels across. */
export function drawCritter(ctx: CanvasRenderingContext2D, c: Critter, x: number, y: number, size: number): void {
  const a = SHAPES[c.shape];
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 40, size / 40);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (a.stroke) {
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = a.strokeW ?? 2;
    ctx.stroke(path(a.stroke));
  }
  ctx.fillStyle = c.color;
  ctx.fill(path(a.body));
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.4;
  ctx.stroke(path(a.body));
  if (a.fill) {
    ctx.fillStyle = c.accent;
    ctx.fill(path(a.fill));
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(a.eye[0], a.eye[1], 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#141230';
  ctx.beginPath();
  ctx.arc(a.eye[0] + 0.6, a.eye[1] + 0.3, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
