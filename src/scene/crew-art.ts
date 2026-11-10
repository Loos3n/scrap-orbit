import type { Texture } from 'pixi.js';
import type { CrewDef } from '../core/content';
import { paint } from './art';

/**
 * The crew as little walking figures on the station deck. Each is cut into parts (body with
 * head, an arm and a leg) so the scene can swing limbs to walk, wave and cheer. Same house
 * style as the portraits: dark ink outlines, light from the upper left, shade lower right.
 * Sizes are world units; the body's origin is the hip, and figures face right.
 */
type Ctx = CanvasRenderingContext2D;
type Look = CrewDef['look'];

const INK = '#141838';
/** Painted finer than the station, since the figures are tiny and the camera can zoom in. */
const RES = 12;

export interface CrewParts {
  body: Texture;
  arm: Texture;
  leg: Texture;
}

/** Where things sit on the body texture, in units from its top left. */
export const BODY = { w: 16, h: 24, hipX: 8, hipY: 18, shoulderY: 9.6, shoulderX: 0.4 };
export const ARM = { w: 3.4, h: 6.4 };
export const LEG = { w: 4.6, h: 4.8 };

function mix(hex: string, to: string, t: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function outline(ctx: Ctx, w = 0.55): void {
  ctx.lineWidth = w;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function capsule(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const r = Math.min(w, h) / 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawHair(ctx: Ctx, look: Look, hx: number, hy: number, r: number, back: boolean): void {
  ctx.fillStyle = look.hair;
  if (back) {
    if (look.style === 'bun') {
      ctx.beginPath();
      ctx.arc(hx - 1.6, hy - r - 0.6, 2, 0, Math.PI * 2);
      ctx.fill();
      outline(ctx, 0.5);
    }
    if (look.style === 'bob') {
      ctx.beginPath();
      ctx.roundRect(hx - r - 0.7, hy - 1.5, r * 1.15, r + 1.2, 1.6);
      ctx.fill();
      outline(ctx, 0.5);
    }
    return;
  }
  ctx.beginPath();
  if (look.style === 'spiky') {
    ctx.moveTo(hx - r, hy - 0.4);
    ctx.lineTo(hx - r - 0.8, hy - 3.6);
    ctx.lineTo(hx - 2.4, hy - 3.6);
    ctx.lineTo(hx - 2.6, hy - r - 2.2);
    ctx.lineTo(hx - 0.2, hy - r - 0.6);
    ctx.lineTo(hx + 1.4, hy - r - 2.4);
    ctx.lineTo(hx + 2.6, hy - r - 0.2);
    ctx.lineTo(hx + r + 1.2, hy - 3);
    ctx.quadraticCurveTo(hx + 2, hy - 3.2, hx + 1, hy - 2.2);
    ctx.quadraticCurveTo(hx - 1.5, hy - 2.4, hx - r, hy - 0.4);
  } else {
    // A cap of hair over the top of the head, with a fringe swept towards the face.
    ctx.arc(hx, hy, r + 0.25, Math.PI * 1.02, Math.PI * 1.98);
    ctx.quadraticCurveTo(hx + r * 0.7, hy - r * 0.15, hx + r * 0.1, hy - r * 0.55);
    ctx.quadraticCurveTo(hx - r * 0.5, hy - r * 0.1, hx - r - 0.2, hy + (look.style === 'buzz' ? -0.4 : 0.8));
  }
  ctx.closePath();
  ctx.fill();
  outline(ctx, 0.5);
  if (look.style !== 'buzz') {
    ctx.beginPath();
    ctx.arc(hx - 0.8, hy - r + 0.9, 1.2, Math.PI * 1.1, Math.PI * 1.7);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

function drawBody(ctx: Ctx, look: Look): void {
  const ox = BODY.hipX;
  const oy = BODY.hipY;
  ctx.translate(ox, oy);
  // Jetpack on the back.
  ctx.beginPath();
  ctx.roundRect(-5.6, -9.4, 2.8, 6, 1);
  ctx.fillStyle = '#a9b1d6';
  ctx.fill();
  outline(ctx, 0.5);
  ctx.fillStyle = look.visor;
  ctx.fillRect(-5, -8.4, 1.4, 1);
  // Torso: a rounded suit with a belt.
  ctx.beginPath();
  ctx.roundRect(-3.8, -10.4, 7.6, 8.6, 2.8);
  ctx.fillStyle = look.suit;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(11,14,42,.22)';
  ctx.beginPath();
  ctx.ellipse(3.6, -2.6, 4.4, 6.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  ctx.beginPath();
  ctx.ellipse(-2.6, -8.4, 1.6, 2.4, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = mix(look.suit, INK, 0.55);
  ctx.fillRect(-4, -3.6, 8, 1.2);
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(0.6, -3.5, 1.3, 1);
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(-3.8, -10.4, 7.6, 8.6, 2.8);
  outline(ctx);
  // Chest badge.
  ctx.beginPath();
  ctx.arc(-0.6, -7.4, 0.85, 0, Math.PI * 2);
  ctx.fillStyle = look.visor;
  ctx.fill();
  outline(ctx, 0.35);
  // Head, a size too big, looking a little to the right.
  const hx = 0.6;
  const hy = -14.6;
  const r = 4.7;
  drawHair(ctx, look, hx, hy, r, true);
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, Math.PI * 2);
  ctx.fillStyle = look.skin;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(11,14,42,.18)';
  ctx.beginPath();
  ctx.arc(hx + 3.2, hy + 3, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, Math.PI * 2);
  outline(ctx);
  drawHair(ctx, look, hx, hy, r, false);
  // Face.
  for (const ex of [hx + 0.5, hx + 3]) {
    ctx.beginPath();
    ctx.ellipse(ex, hy + 0.3, 0.62, 0.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + 0.22, hy - 0.05, 0.24, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(hx + 1.9, hy + 1.6, 0.9, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.45;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,122,138,.45)';
  ctx.beginPath();
  ctx.arc(hx - 0.4, hy + 1.6, 0.7, 0, Math.PI * 2);
  ctx.arc(hx + 4.1, hy + 1.5, 0.6, 0, Math.PI * 2);
  ctx.fill();
  // An ear at the back of the head.
  ctx.beginPath();
  ctx.ellipse(hx - 3.1, hy + 0.6, 0.85, 1.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = look.skin;
  ctx.fill();
  outline(ctx, 0.4);
  if (look.style === 'helmet') {
    // A glass bubble helmet with a glint.
    ctx.beginPath();
    ctx.arc(hx, hy - 0.4, r + 1.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(190,230,255,.16)';
    ctx.fill();
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = 'rgba(223,228,255,.95)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx, hy - 0.4, r + 0.6, Math.PI * 1.1, Math.PI * 1.45);
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
}

/** An arm hanging from the shoulder (the texture's top middle), with a white glove. */
function drawArm(ctx: Ctx, look: Look): void {
  const cx = ARM.w / 2;
  capsule(ctx, cx - 1.1, 0.4, 2.2, 4.6);
  ctx.fillStyle = look.suit;
  ctx.fill();
  outline(ctx, 0.45);
  ctx.beginPath();
  ctx.arc(cx, 5.1, 1.2, 0, Math.PI * 2);
  ctx.fillStyle = '#f4f6ff';
  ctx.fill();
  outline(ctx, 0.45);
}

/** A leg from the hip (the texture's top middle) to a chunky magnetic boot pointing right. */
function drawLeg(ctx: Ctx, look: Look): void {
  const cx = 1.8;
  capsule(ctx, cx - 1.15, 0.2, 2.3, 3.4);
  ctx.fillStyle = mix(look.suit, INK, 0.38);
  ctx.fill();
  outline(ctx, 0.45);
  ctx.beginPath();
  ctx.roundRect(cx - 1.4, 2.6, 3.6, 1.8, 0.8);
  ctx.fillStyle = '#353b6b';
  ctx.fill();
  outline(ctx, 0.45);
  ctx.fillStyle = look.visor;
  ctx.fillRect(cx - 0.9, 3.9, 2.6, 0.35);
}

const cache = new Map<string, CrewParts>();

/** The painted parts for a crew member, made once. */
export function crewParts(def: CrewDef): CrewParts {
  const hit = cache.get(def.id);
  if (hit) return hit;
  const parts: CrewParts = {
    body: paint(BODY.w, BODY.h, (ctx) => drawBody(ctx, def.look), RES),
    arm: paint(ARM.w, ARM.h, (ctx) => drawArm(ctx, def.look), RES),
    leg: paint(LEG.w, LEG.h, (ctx) => drawLeg(ctx, def.look), RES),
  };
  cache.set(def.id, parts);
  return parts;
}

let wrenchTex: Texture | null = null;
/** A little wrench for fixing things, held from its handle end (the texture's bottom middle). */
export function wrench(): Texture {
  return (wrenchTex ??= paint(3, 6, (ctx) => {
    ctx.beginPath();
    ctx.roundRect(1, 1.6, 1, 4.2, 0.5);
    ctx.fillStyle = '#c9d0ee';
    ctx.fill();
    outline(ctx, 0.35);
    ctx.beginPath();
    ctx.arc(1.5, 1.4, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#c9d0ee';
    ctx.fill();
    outline(ctx, 0.35);
    ctx.fillStyle = INK;
    ctx.fillRect(1.15, 0.1, 0.7, 1.2);
  }, RES));
}
