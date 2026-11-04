/**
 * Draws the art kit's markup (src/art/kit.ts) straight onto a canvas, so the station sprites
 * share the menu icons' shapes and style. Only what the kit produces is understood: `<path>`
 * with fill, stroke, stroke-width, stroke-dasharray, opacity and transform, and `<g>` with
 * transform and opacity. Path data goes through Path2D, which takes SVG path syntax.
 */
type Ctx = CanvasRenderingContext2D;

const TAG = /<(\/?)(g|path)\b([^>]*?)(\/?)>/g;
const ATTR = /([\w-]+)="([^"]*)"/g;
const FN = /(translate|scale|rotate)\(([^)]*)\)/g;

function attrs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(ATTR)) out[m[1]] = m[2];
  return out;
}

function applyTransform(ctx: Ctx, t: string): void {
  for (const m of t.matchAll(FN)) {
    const v = m[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (m[1] === 'translate') ctx.translate(v[0], v[1] ?? 0);
    else if (m[1] === 'scale') ctx.scale(v[0], v[1] ?? v[0]);
    else {
      const [deg, cx = 0, cy = 0] = v;
      ctx.translate(cx, cy);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
  }
}

/** Paints kit markup in the context's current coordinate space (one unit per markup unit). */
export function drawMarkup(ctx: Ctx, markup: string): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const m of markup.matchAll(TAG)) {
    const [, close, tag, rest, selfClose] = m;
    if (close) {
      ctx.restore();
      continue;
    }
    const a = attrs(rest);
    ctx.save();
    if (a.transform) applyTransform(ctx, a.transform);
    if (a.opacity) ctx.globalAlpha *= Number(a.opacity);
    if (tag === 'path') {
      const p = new Path2D(a.d);
      if (a.fill && a.fill !== 'none') {
        ctx.fillStyle = a.fill;
        ctx.fill(p);
      }
      if (a.stroke && a.stroke !== 'none') {
        ctx.strokeStyle = a.stroke;
        ctx.lineWidth = Number(a['stroke-width'] ?? 1);
        ctx.setLineDash(a['stroke-dasharray'] ? a['stroke-dasharray'].split(/[\s,]+/).map(Number) : []);
        ctx.stroke(p);
      }
      ctx.restore();
    } else if (selfClose) {
      ctx.restore();
    }
  }
  ctx.restore();
}
