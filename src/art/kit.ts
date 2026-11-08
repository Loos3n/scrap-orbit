/**
 * The art set's drawing kit, shared by the menu icons (src/ui/icons.ts) and the station
 * sprites (src/scene/art.ts, which paints the same markup onto canvases via vector.ts).
 *
 * House style, shared by every coloured piece so they read as one set:
 * - Each object has a four-tone ramp (highlight, base, shade, ink) from the game palette.
 * - Light comes from the upper left, so a shape is its shade colour with the base laid over
 *   it nudged up and left, leaving a shadow rim on the lower right, plus a soft highlight
 *   and a small white glint.
 * - Every shape gets an outline in its own dark ink colour (never pure black).
 * - Glow (energy, light, flames) is drawn as stacked flat circles, never gradients, so the
 *   markup carries no ids and any number of copies can sit on a page.
 *
 * Everything here returns SVG markup (paths and groups only) or path data.
 */
export const svg = (body: string, view = 48) =>
  `<svg viewBox="0 0 ${view} ${view}" aria-hidden="true" focusable="false">${body}</svg>`;

export interface Ramp {
  hi: string;
  base: string;
  lo: string;
  ink: string;
}

/** The art set's palette. Machine ramps are built around each machine's colour in config.ts. */
export const PALETTE = {
  teal: { hi: '#c4fff1', base: '#4fe3c1', lo: '#1f9e88', ink: '#0b3536' },
  blue: { hi: '#dfe9ff', base: '#7aa7ff', lo: '#3b5cc6', ink: '#131d55' },
  orange: { hi: '#ffe0c4', base: '#ff8a4c', lo: '#c24d1f', ink: '#4a1608' },
  purple: { hi: '#f1e0ff', base: '#c58cff', lo: '#7443c4', ink: '#28104f' },
  gold: { hi: '#fff3c9', base: '#ffd166', lo: '#c98f1b', ink: '#4a2f05' },
  red: { hi: '#ffd9dd', base: '#ff5d6c', lo: '#b42438', ink: '#45091a' },
  cyan: { hi: '#d9f9ff', base: '#5ce1ff', lo: '#1f8ec2', ink: '#062a45' },
  green: { hi: '#e8ffd9', base: '#9dff6b', lo: '#4cb52d', ink: '#123d0a' },
  violet: { hi: '#e8e2ff', base: '#8f7bff', lo: '#4d3bc2', ink: '#1a1250' },
  sun: { hi: '#fffbe8', base: '#ffe9a8', lo: '#e3a53b', ink: '#4f3205' },
  pink: { hi: '#ffe0ea', base: '#ff6b9a', lo: '#c23a68', ink: '#4a0f26' },
  steel: { hi: '#f0f2ff', base: '#b8bfe6', lo: '#6c74ad', ink: '#1b1f4d' },
  hull: { hi: '#d6dbff', base: '#8a93d8', lo: '#4d559f', ink: '#141845' },
  navy: { hi: '#7f9cff', base: '#3a52b8', lo: '#22306e', ink: '#0b1236' },
  dark: { hi: '#4a5a9a', base: '#232a5c', lo: '#11163a', ink: '#070a20' },
  rock: { hi: '#d9c8b4', base: '#9a8672', lo: '#5e4d3e', ink: '#2a1e14' },
  ice: { hi: '#f2fdff', base: '#7fdcff', lo: '#2f7fd6', ink: '#0b1a40' },
} satisfies Record<string, Ramp>;

export const P = PALETTE;
export const n = (v: number) => +v.toFixed(2);

// Shape builders, all returning path data.
export const circ = (cx: number, cy: number, r: number) => ell(cx, cy, r, r);
export const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0Z`;
export const rrect = (x: number, y: number, w: number, h: number, r: number) => {
  r = Math.min(r, w / 2, h / 2);
  return `M${n(x + r)} ${n(y)}h${n(w - 2 * r)}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(r)}v${n(h - 2 * r)}a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(r)}h${n(-(w - 2 * r))}a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(-r)}v${n(-(h - 2 * r))}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(-r)}Z`;
};
export const poly = (...pts: number[]) => {
  let d = '';
  for (let i = 0; i < pts.length; i += 2) d += `${i ? 'L' : 'M'}${n(pts[i])} ${n(pts[i + 1])}`;
  return d + 'Z';
};
const pt = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${n(cx + Math.cos(a) * r)} ${n(cy + Math.sin(a) * r)}`;
};
/** An open arc from angle `a0` to `a1` (degrees, clockwise), for strokes. */
export const arc = (cx: number, cy: number, r: number, a0: number, a1: number) =>
  `M${pt(cx, cy, r, a0)}A${n(r)} ${n(r)} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${pt(cx, cy, r, a1)}`;
/** A ring sector between radii `r1` > `r2`, from angle `a0` to `a1` (degrees). */
export const sector = (cx: number, cy: number, r1: number, r2: number, a0: number, a1: number) => {
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M${pt(cx, cy, r1, a0)}A${n(r1)} ${n(r1)} 0 ${big} 1 ${pt(cx, cy, r1, a1)}L${pt(cx, cy, r2, a1)}A${n(r2)} ${n(r2)} 0 ${big} 0 ${pt(cx, cy, r2, a0)}Z`;
};
/** A regular polygon with `k` corners, the first one pointing at `rot` degrees. */
export const ngon = (cx: number, cy: number, r: number, k: number, rot = -90) => {
  const pts: number[] = [];
  for (let i = 0; i < k; i++) {
    const a = ((rot + (360 / k) * i) * Math.PI) / 180;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return poly(...pts);
};
/** A star with `k` points between radii `r1` (tips) and `r2` (valleys). */
export const starPts = (cx: number, cy: number, r1: number, r2: number, k: number, rot = -90) => {
  const pts: number[] = [];
  for (let i = 0; i < k * 2; i++) {
    const a = ((rot + (180 / k) * i) * Math.PI) / 180;
    const r = i % 2 ? r2 : r1;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
};

export const fill = (d: string, color: string, extra = '') => `<path d="${d}" fill="${color}"${extra}/>`;
export const line = (d: string, color: string, w: number, extra = '') =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
export const outline = (d: string, ink: string, w = 2) => line(d, ink, w);
/** A small four-point sparkle. */
export const glint = (x: number, y: number, r = 2, color = '#fff', op = 1) =>
  fill(poly(x, y - r, x + r * 0.28, y - r * 0.28, x + r, y, x + r * 0.28, y + r * 0.28, x, y + r, x - r * 0.28, y + r * 0.28, x - r, y, x - r * 0.28, y - r * 0.28), color, op < 1 ? ` opacity="${op}"` : '');
/** Soft glow: flat circles stacked from faint and wide to bright and small. */
export const glow = (cx: number, cy: number, r: number, color: string, op = 0.5) =>
  [1, 0.72, 0.48].map((k, i) => fill(circ(cx, cy, r * k), color, ` opacity="${n(op * (0.3 + i * 0.3))}"`)).join('');

export interface CelOpts {
  /** Size of the highlight blob relative to the shape (0 = none). */
  hl?: number;
  /** Opacity of the highlight. */
  hlOp?: number;
  /** Width of the outline. */
  ink?: number;
  /** Extra drawing laid over the shading and under the outline. */
  detail?: string;
}

/**
 * A filled shape in the house style. `box` is the shape's centre and rough radius, used to
 * place the shade rim and highlight. Works for any shape without holes.
 */
export function cel(d: string, c: Ramp, box: [number, number, number], o: CelOpts = {}): string {
  const [cx, cy, r] = box;
  const off = Math.min(1.5, r * 0.11);
  const s = 1 - (off * 1.41) / r;
  const scaled = (k: number, dx: number, dy: number) =>
    ` transform="translate(${n(cx + dx)} ${n(cy + dy)}) scale(${n(k)}) translate(${n(-cx)} ${n(-cy)})"`;
  const hl = o.hl ?? 0.5;
  return (
    fill(d, c.lo) +
    fill(d, c.base, scaled(s, -off, -off)) +
    (hl > 0 ? fill(d, c.hi, scaled(hl, -r * (1 - hl) * 0.55, -r * (1 - hl) * 0.55) + ` opacity="${o.hlOp ?? 0.55}"`) : '') +
    (o.detail ?? '') +
    outline(d, c.ink, o.ink ?? 2)
  );
}

/** A thick rounded line (struts, arms, barrels) in the house style. */
export function tube(d: string, c: Ramp, w: number): string {
  return (
    line(d, c.ink, w + 2.4) +
    line(d, c.lo, w) +
    line(d, c.base, w * 0.62, ` transform="translate(${n(-w * 0.12)} ${n(-w * 0.12)})"`) +
    line(d, c.hi, Math.max(0.8, w * 0.2), ` transform="translate(${n(-w * 0.25)} ${n(-w * 0.25)})" opacity=".7"`)
  );
}

/** A faceted star: alternating light and dark wedges, like a cut gem. */
export function facetStar(cx: number, cy: number, r1: number, r2: number, k: number, c: Ramp): string {
  const pts = starPts(cx, cy, r1, r2, k);
  const m = pts.length / 2;
  let out = '';
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    // Wedges whose outer edge faces the upper left catch the light.
    const mx = (pts[i * 2] + pts[j * 2]) / 2 - cx;
    const my = (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2 - cy;
    const lit = -(mx * 0.62 + my * 0.78) / Math.hypot(mx, my);
    const color = lit > 0.35 ? c.hi : lit > -0.35 ? c.base : c.lo;
    out += fill(poly(cx, cy, pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1]), color);
  }
  return out + outline(poly(...pts), c.ink);
}
