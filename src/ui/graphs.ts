import { sectorFor } from '../core/content';
import { D } from '../core/num';
import type { GameState } from '../core/state';

/*
 * Two small charts above the Stats list: income per second over the last day of play (log
 * scale, since it grows by powers of ten) and Star Cores earned by each recent run. Both are
 * plain inline SVG; tapping or hovering shows the value under the finger.
 */

type Fmt = (v: ReturnType<typeof D>) => string;
const W = 320;
const H = 140;
const PAD = { l: 44, r: 10, t: 10, b: 22 };
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

interface Point {
  x: number;
  y: number;
  label: string;
}

function ago(ms: number): string {
  const h = ms / 3_600_000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))}m ago` : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
}

function incomeChart(state: GameState, fmt: Fmt, now: number): { svg: string; points: Point[] } | null {
  const h = state.history.income.filter((s) => s.log >= 0);
  if (h.length < 2) return null;
  let lo = Math.floor(Math.min(...h.map((s) => s.log)));
  let hi = Math.ceil(Math.max(...h.map((s) => s.log)));
  if (hi - lo < 1) hi = lo + 1;
  // Keep about four gridlines whatever the range.
  const step = Math.max(1, Math.ceil((hi - lo) / 4));
  lo = Math.floor(lo / step) * step;
  hi = lo + Math.ceil((hi - lo) / step) * step;
  const t0 = h[0].t;
  const t1 = Math.max(h[h.length - 1].t, t0 + 1);
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  let grid = '';
  for (let v = lo; v <= hi; v += step) {
    grid += `<line class="g-grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}"/><text class="g-tick" x="${PAD.l - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(D(10).pow(v)))}</text>`;
  }
  const pts = h.map((s) => ({ x: x(s.t), y: y(s.log), label: `${fmt(D(10).pow(s.log))} / sec · ${ago(now - s.t)}` }));
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
  const area = `${path}L${pts[pts.length - 1].x.toFixed(1)},${H - PAD.b}L${pts[0].x.toFixed(1)},${H - PAD.b}Z`;
  const last = pts[pts.length - 1];
  const svg = `<path class="g-area" d="${area}"/>${grid}<path class="g-line" d="${path}"/><circle class="g-end" cx="${last.x}" cy="${last.y}" r="4"/>
    <text class="g-tick" x="${PAD.l}" y="${H - 5}">${ago(now - t0)}</text><text class="g-tick" x="${W - PAD.r}" y="${H - 5}" text-anchor="end">now</text>`;
  return { svg, points: pts };
}

function runsChart(state: GameState): { svg: string; points: Point[] } | null {
  const runs = state.history.runs;
  if (!runs.length) return null;
  const max = Math.max(...runs.map((r) => r.cores), 1);
  const slot = (W - PAD.l - PAD.r) / Math.max(runs.length, 6);
  const bw = Math.min(28, slot - 6);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const base = H - PAD.b;
  const points: Point[] = [];
  let bars = '';
  runs.forEach((r, i) => {
    const cx = PAD.l + slot * (i + 0.5);
    const top = Math.min(y(r.cores), base - 3);
    const rr = Math.min(4, (base - top) / 2);
    // Rounded at the data end only, square on the baseline.
    bars += `<path class="g-bar" d="M${cx - bw / 2},${base}V${top + rr}Q${cx - bw / 2},${top} ${cx - bw / 2 + rr},${top}H${cx + bw / 2 - rr}Q${cx + bw / 2},${top} ${cx + bw / 2},${top + rr}V${base}Z"/>`;
    bars += `<text class="g-tick" x="${cx}" y="${H - 5}" text-anchor="middle">S${r.sector + 1}</text>`;
    points.push({ x: cx, y: top, label: `Sector ${r.sector + 1}, ${sectorFor(r.sector).name}: +${r.cores.toLocaleString('en-US')} cores in ${r.minutes} min` });
  });
  const mid = Math.round(max / 2);
  const grid = [max, mid, 0]
    .map((v) => `<line class="g-grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}"/><text class="g-tick" x="${PAD.l - 6}" y="${y(v) + 4}" text-anchor="end">${v.toLocaleString('en-US')}</text>`)
    .join('');
  return { svg: grid + bars, points };
}

function card(title: string, sub: string, chart: { svg: string; points: Point[] } | null, empty: string): string {
  const body = chart
    ? `<div class="g-plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${chart.svg}<circle class="g-dot" r="5" hidden/></svg><div class="g-tip" hidden></div>
       <script type="application/json">${JSON.stringify(chart.points)}</script></div>`
    : `<p class="g-empty">${esc(empty)}</p>`;
  return `<figure class="graph"><figcaption><b>${esc(title)}</b><span>${esc(sub)}</span></figcaption>${body}</figure>`;
}

export class Graphs {
  private key = '';

  constructor(private el: HTMLElement) {
    // One handler for both charts: the nearest point under the finger or pointer gets a tooltip.
    const show = (e: PointerEvent) => {
      const plot = (e.target as Element).closest<HTMLElement>('.g-plot');
      if (!plot) return;
      const svg = plot.querySelector('svg')!;
      const pts: Point[] = JSON.parse(plot.querySelector('script')!.textContent || '[]');
      const box = svg.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * W;
      let best = pts[0];
      for (const p of pts) if (Math.abs(p.x - px) < Math.abs(best.x - px)) best = p;
      if (!best) return;
      const dot = svg.querySelector<SVGCircleElement>('.g-dot')!;
      dot.removeAttribute('hidden');
      dot.setAttribute('cx', String(best.x));
      dot.setAttribute('cy', String(best.y));
      const tip = plot.querySelector<HTMLElement>('.g-tip')!;
      tip.hidden = false;
      tip.textContent = best.label;
      const left = (best.x / W) * box.width;
      tip.style.left = `${Math.max(0, Math.min(box.width - tip.offsetWidth, left - tip.offsetWidth / 2))}px`;
      tip.style.top = `${Math.max(14, (best.y / H) * box.height - 10)}px`;
    };
    const hide = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const plot = (e.target as Element).closest<HTMLElement>('.g-plot');
      plot?.querySelector('.g-tip')?.setAttribute('hidden', '');
      plot?.querySelector('.g-dot')?.setAttribute('hidden', '');
    };
    el.addEventListener('pointermove', show);
    el.addEventListener('pointerdown', show);
    el.addEventListener('pointerout', hide);
  }

  render(state: GameState, fmt: Fmt): void {
    const inc = state.history.income;
    const key = `${inc.length}|${inc[inc.length - 1]?.t}|${state.history.runs.length}|${state.settings.numbers}`;
    if (key === this.key) return;
    this.key = key;
    const now = Date.now();
    this.el.innerHTML =
      card('Income per second', 'Last day of play, log scale', incomeChart(state, fmt, now), 'Keep playing: a point is added every 10 minutes.') +
      card('Star Cores per run', 'Your recent relocations', runsChart(state), 'Relocate to see your runs here.');
  }
}
