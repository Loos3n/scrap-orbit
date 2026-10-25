import { CanvasSource, Texture } from 'pixi.js';

/**
 * All of the station's art is painted once at startup with Canvas 2D (gradients, soft light,
 * panel detail) and uploaded as textures. Sprites then just move, spin and fade them.
 * Sizes are in world units; textures are painted at RES pixels per unit so they stay sharp.
 */
const RES = 3;

type Ctx = CanvasRenderingContext2D;

export function paint(w: number, h: number, draw: (ctx: Ctx) => void, res = RES): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * res);
  canvas.height = Math.ceil(h * res);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(res, res);
  draw(ctx);
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution: res, autoGenerateMipmaps: true }) });
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
export function backdrop(w: number, h: number): Texture {
  return paint(w, h, (ctx) => {
    ctx.fillStyle = linear(ctx, 0, 0, 0, h, [
      [0, '#0a0b22'],
      [0.55, '#12123a'],
      [1, '#0b0d26'],
    ]);
    ctx.fillRect(0, 0, w, h);
    const r = rng(7);
    const clouds: [number, number, number, string, number][] = [
      [0.12, 0.18, 0.75, '#6b3fc2', 0.22],
      [0.3, 0.05, 0.45, '#c23f8f', 0.12],
      [0.85, 0.42, 0.6, '#1f7fa8', 0.2],
      [0.7, 0.9, 0.7, '#3f4fc2', 0.18],
      [0.05, 0.75, 0.5, '#2a8f9c', 0.1],
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
  }, 1);
}

/** A banded gas giant with a thin ring, lit from the upper left. */
export function planet(size: number): Texture {
  const pad = size * 0.35;
  const S = size + pad * 2;
  return paint(S, S, (ctx) => {
    const c = S / 2;
    const r = size / 2;
    // Atmosphere glow.
    ctx.fillStyle = radial(ctx, c, c, r * 1.25, [
      [0.75, 'rgba(255,170,120,0.35)'],
      [1, 'rgba(255,170,120,0)'],
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
      [0, '#e8a37a'],
      [0.35, '#b0627a'],
      [0.7, '#6a3d8a'],
      [1, '#3d2a6a'],
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
    ctx.strokeStyle = 'rgba(255,200,160,0.5)';
    ctx.lineWidth = r * 0.02;
    ctx.beginPath();
    ctx.arc(c, c, r, Math.PI * 0.95, Math.PI * 1.75);
    ctx.stroke();
    ring(true);
  }, 1.5);
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

/** The main hull disc: shaded metal, panel seams, rivets and lit windows. */
export const hull = () =>
  paint(140, 140, (ctx) => {
    const c = 70;
    // Drop shadow.
    ctx.fillStyle = radial(ctx, c + 4, c + 6, 70, [
      [0.75, 'rgba(0,0,10,0.5)'],
      [1, 'rgba(0,0,10,0)'],
    ]);
    ctx.fillRect(0, 0, 140, 140);
    ctx.fillStyle = radial(ctx, c - 22, c - 26, 90, [
      [0, '#8b93d8'],
      [0.45, '#4a52a0'],
      [1, '#1f2358'],
    ]);
    ctx.beginPath();
    ctx.arc(c, c, 62, 0, TAU);
    ctx.fill();
    // Panel seams.
    ctx.strokeStyle = 'rgba(10,12,40,0.55)';
    ctx.lineWidth = 0.8;
    for (const r of [52, 40]) {
      ctx.beginPath();
      ctx.arc(c, c, r, 0, TAU);
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.13;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 40, c + Math.sin(a) * 40);
      ctx.lineTo(c + Math.cos(a) * 62, c + Math.sin(a) * 62);
      ctx.stroke();
    }
    // Light catching the seams on the lit side.
    ctx.strokeStyle = 'rgba(200,210,255,0.25)';
    ctx.beginPath();
    ctx.arc(c, c, 52.8, Math.PI * 1.05, Math.PI * 1.6);
    ctx.stroke();
    // Windows: a lit band between the rings.
    const r = rng(11);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      if (r() < 0.25) continue;
      const lit = r() < 0.75;
      ctx.fillStyle = lit ? `rgba(255,${200 + Math.floor(r() * 40)},120,${0.7 + r() * 0.3})` : 'rgba(30,34,80,0.9)';
      ctx.save();
      ctx.translate(c + Math.cos(a) * 46, c + Math.sin(a) * 46);
      ctx.rotate(a);
      ctx.fillRect(-1.6, -1, 3.2, 2);
      ctx.restore();
    }
    rivetRing(ctx, c, 58, 48, 'rgba(180,190,255,0.35)');
    // Rim.
    ctx.strokeStyle = linear(ctx, 0, 0, 140, 140, [
      [0, 'rgba(220,226,255,0.9)'],
      [0.5, 'rgba(120,130,200,0.5)'],
      [1, 'rgba(40,44,100,0.8)'],
    ]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c, c, 61.5, 0, TAU);
    ctx.stroke();
    // Inner socket for the reactor.
    ctx.fillStyle = radial(ctx, c, c, 38, [
      [0, '#0b0d26'],
      [0.8, '#151845'],
      [1, '#2b3170'],
    ]);
    ctx.beginPath();
    ctx.arc(c, c, 37, 0, TAU);
    ctx.fill();
  });

/** The rotating habitat ring with lit modules. */
export const habitatRing = () =>
  paint(124, 124, (ctx) => {
    const c = 62;
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * TAU + 0.06;
      const a1 = a0 + TAU / 8 - 0.12;
      ctx.lineCap = 'round';
      ctx.strokeStyle = linear(ctx, 0, 0, 124, 124, [
        [0, '#c5cbff'],
        [1, '#4a52a0'],
      ]);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(c, c, 56, a0, a1);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(20,22,60,0.6)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(c, c, 56, a0 + 0.05, a1 - 0.05);
      ctx.stroke();
      // Little lit windows along each module.
      for (let k = 1; k < 6; k++) {
        const a = a0 + ((a1 - a0) * k) / 6;
        ctx.fillStyle = k % 2 ? 'rgba(255,214,140,0.95)' : 'rgba(150,230,255,0.9)';
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * 56, c + Math.sin(a) * 56, 0.8, 0, TAU);
        ctx.fill();
      }
    }
  });

/** The reactor core: a glossy sphere. Painted white so it can be tinted for Overdrive. */
export const core = () =>
  paint(64, 64, (ctx) => {
    ctx.fillStyle = radial(ctx, 26, 24, 34, [
      [0, '#ffffff'],
      [0.35, '#f2f2f2'],
      [0.8, '#b8b8b8'],
      [1, '#8a8a8a'],
    ]);
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, TAU);
    ctx.fill();
    // Energy swirls.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(32, 32, 12 + i * 6, i * 1.7, i * 1.7 + 2.2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(22, 18, 7, 4, -0.6, 0, TAU);
    ctx.fill();
  });

/** A solar array wing with cells and a sheen. */
export const solarWing = () =>
  paint(64, 30, (ctx) => {
    // Strut.
    ctx.fillStyle = linear(ctx, 0, 12, 0, 18, [
      [0, '#9aa2e8'],
      [1, '#3a4090'],
    ]);
    ctx.fillRect(0, 13, 16, 4);
    // Panel.
    ctx.fillStyle = linear(ctx, 16, 0, 64, 30, [
      [0, '#3b6cff'],
      [0.5, '#2440b0'],
      [1, '#152870'],
    ]);
    ctx.fillRect(16, 1, 47, 28);
    ctx.strokeStyle = 'rgba(8,14,50,0.8)';
    ctx.lineWidth = 0.6;
    for (let x = 16; x <= 63; x += 47 / 6) {
      ctx.beginPath();
      ctx.moveTo(x, 1);
      ctx.lineTo(x, 29);
      ctx.stroke();
    }
    for (let y = 1; y <= 29; y += 7) {
      ctx.beginPath();
      ctx.moveTo(16, y);
      ctx.lineTo(63, y);
      ctx.stroke();
    }
    ctx.fillStyle = linear(ctx, 16, 1, 50, 29, [
      [0, 'rgba(255,255,255,0.35)'],
      [0.35, 'rgba(255,255,255,0.05)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.fillRect(16, 1, 47, 28);
    ctx.strokeStyle = '#8f9ae8';
    ctx.lineWidth = 1;
    ctx.strokeRect(16.5, 1.5, 46, 27);
  });

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
  });

// ---------- Machines ----------

/** Small salvage drone, pointing right. */
export const drone = () =>
  paint(16, 12, (ctx) => {
    ctx.fillStyle = linear(ctx, 0, 0, 0, 12, [
      [0, '#b8fff0'],
      [0.5, '#4fe3c1'],
      [1, '#1a8f78'],
    ]);
    ctx.beginPath();
    ctx.moveTo(15, 6);
    ctx.lineTo(3, 0.5);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(3, 11.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0b2b2a';
    ctx.beginPath();
    ctx.ellipse(9.5, 6, 2.2, 1.4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(9, 5.2, 1.2, 0.8);
  }, 6);

/** Cargo hauler, pointing right, with container stripes. */
export const hauler = () =>
  paint(30, 14, (ctx) => {
    ctx.fillStyle = linear(ctx, 0, 0, 0, 14, [
      [0, '#d6e4ff'],
      [0.5, '#7aa7ff'],
      [1, '#3557b8'],
    ]);
    ctx.beginPath();
    ctx.roundRect(4, 2, 20, 10, 2.5);
    ctx.fill();
    // Nose.
    ctx.beginPath();
    ctx.moveTo(24, 3);
    ctx.quadraticCurveTo(30, 7, 24, 11);
    ctx.fill();
    // Containers.
    const colors = ['#ff8a4c', '#ffd166', '#4fe3c1'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = colors[i];
      ctx.fillRect(6 + i * 5.5, 4, 4.5, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(6 + i * 5.5, 8, 4.5, 2);
    }
    ctx.fillStyle = '#e8f2ff';
    ctx.fillRect(25, 5.5, 1.6, 3);
    // Engine block.
    ctx.fillStyle = '#2b3170';
    ctx.fillRect(1, 4, 3.5, 6);
  }, 5);

/** Smelter pod: a squat furnace with a glowing grill. Points outward (right). */
export const smelter = () =>
  paint(22, 22, (ctx) => {
    ctx.fillStyle = linear(ctx, 0, 0, 22, 22, [
      [0, '#ffd0b0'],
      [0.5, '#c4602a'],
      [1, '#6a2a14'],
    ]);
    ctx.beginPath();
    ctx.roundRect(1, 3, 20, 16, 5);
    ctx.fill();
    ctx.fillStyle = radial(ctx, 11, 11, 7, [
      [0, '#fff4c2'],
      [0.5, '#ffb547'],
      [1, '#ff6a2a'],
    ]);
    ctx.beginPath();
    ctx.roundRect(5, 7, 12, 8, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,20,10,0.7)';
    ctx.lineWidth = 1;
    for (let x = 8; x < 17; x += 3) {
      ctx.beginPath();
      ctx.moveTo(x, 7);
      ctx.lineTo(x, 15);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,230,210,0.6)';
    ctx.beginPath();
    ctx.roundRect(1.5, 3.5, 19, 15, 5);
    ctx.stroke();
  }, 5);

/** Fabricator module: a hex block with status lights. */
export const fabricator = () =>
  paint(20, 20, (ctx) => {
    ctx.fillStyle = linear(ctx, 0, 0, 20, 20, [
      [0, '#ecd6ff'],
      [0.5, '#a66ae8'],
      [1, '#4e2a8a'],
    ]);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      ctx.lineTo(10 + Math.cos(a) * 9.5, 10 + Math.sin(a) * 9.5);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#241245';
    ctx.beginPath();
    ctx.arc(10, 10, 4.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f2e3ff';
    ctx.beginPath();
    ctx.arc(10, 10, 2, 0, TAU);
    ctx.fill();
  }, 6);

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
  const metal = r() < 0.5;
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
      const sides = 7 + Math.floor(r() * 3);
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * TAU;
        const rr = c * (0.65 + r() * 0.3);
        ctx.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = radial(ctx, c - 3, c - 3, c * 1.3, [
        [0, '#9a95b8'],
        [0.6, '#5c5878'],
        [1, '#2e2b45'],
      ]);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = 'rgba(20,18,40,0.45)';
        ctx.beginPath();
        ctx.arc(c + (r() - 0.5) * 8, c + (r() - 0.5) * 8, 0.8 + r() * 1.6, 0, TAU);
        ctx.fill();
      }
    }
  }, 4);
}

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
  }, 4);

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
  }, 5);

/** A cratered grey moon, lit from the upper left. */
export const moon = () =>
  paint(40, 40, (ctx) => {
    const c = 20;
    ctx.fillStyle = radial(ctx, c - 6, c - 7, 26, [
      [0, '#e6e2f0'],
      [0.6, '#9a95b0'],
      [1, '#4a4660'],
    ]);
    ctx.beginPath();
    ctx.arc(c, c, 18, 0, TAU);
    ctx.fill();
    const r = rng(21);
    for (let i = 0; i < 9; i++) {
      const x = c + (r() - 0.5) * 24;
      const y = c + (r() - 0.5) * 24;
      if (Math.hypot(x - c, y - c) > 15) continue;
      const cr = 1 + r() * 3;
      ctx.fillStyle = 'rgba(60,55,80,0.45)';
      ctx.beginPath();
      ctx.arc(x, y, cr, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(x, y, cr, Math.PI * 1.1, Math.PI * 1.7);
      ctx.stroke();
    }
    ctx.fillStyle = radial(ctx, c - 8, c - 8, 34, [
      [0.45, 'rgba(10,8,30,0)'],
      [1, 'rgba(10,8,30,0.85)'],
    ]);
    ctx.beginPath();
    ctx.arc(c, c, 18, 0, TAU);
    ctx.fill();
  }, 3);

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
    const r = rng(seed);
    const c = 40;
    ctx.beginPath();
    const sides = 11;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TAU;
      const rr = 30 * (0.7 + r() * 0.3);
      ctx.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.shadowColor = 'rgba(20,16,40,0.9)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = radial(ctx, c - 10, c - 12, 50, [
      [0, '#5c5878'],
      [0.6, '#2e2b45'],
      [1, '#16142a'],
    ]);
    ctx.fill();
    ctx.shadowBlur = 0;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = 'rgba(10,8,24,0.4)';
      ctx.beginPath();
      ctx.arc(c + (r() - 0.5) * 30, c + (r() - 0.5) * 30, 2 + r() * 5, 0, TAU);
      ctx.fill();
    }
    // Rim light from the station's side.
    ctx.strokeStyle = 'rgba(255,190,140,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c, c, 26, Math.PI * 1.1, Math.PI * 1.6);
    ctx.stroke();
  }, 2);

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
  }, 4);

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
  }, 3);

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
  }, 4);
