import { CROPS, GARDEN, SNACK_TEXT, cropUnlocked, gardenOpen, plotCount, plotState, ripeCount, snackMult, snackSecondsLeft, type CropDef, type SnackKind } from '../core/garden';
import { formatDuration } from '../core/num';
import type { Game } from '../game';
import { ICONS } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const growText = (m: number) => (m < 60 ? `${m}m` : `${m / 60}h`);

/** A crop drawn as a little SVG plant in a hydroponic tray, fuller as it grows. */
export function cropSvg(c: CropDef, grown: number): string {
  const g = Math.max(0.15, grown);
  const ink = '#141838';
  const stem = 34 - 20 * g;
  const leaves = [
    `<path d="M24 40Q24 ${stem + 6} 24 ${stem}" stroke="${c.leaf}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    `<path d="M24 ${36 - 8 * g}q-${10 * g} -2 -${12 * g} -${9 * g}q${8 * g} -1 ${12 * g} ${9 * g}z" fill="${c.leaf}" stroke="${ink}" stroke-opacity=".5" stroke-width="1"/>`,
    `<path d="M24 ${38 - 12 * g}q${10 * g} -2 ${12 * g} -${9 * g}q-${8 * g} -1 -${12 * g} ${9 * g}z" fill="${c.leaf}" stroke="${ink}" stroke-opacity=".5" stroke-width="1"/>`,
  ];
  const fruit =
    grown >= 0.5
      ? `<circle cx="24" cy="${stem}" r="${3 + 5 * Math.min(1, (grown - 0.5) * 2)}" fill="${c.color}" stroke="${ink}" stroke-width="1.4"/><circle cx="${22.5}" cy="${stem - 2}" r="1.5" fill="#fff" opacity=".7"/>`
      : '';
  const glow = grown >= 1 ? `<circle cx="24" cy="${stem}" r="12" fill="${c.color}" opacity=".25"/>` : '';
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${glow}${leaves.join('')}${fruit}<rect x="8" y="39" width="32" height="7" rx="3" fill="#5a6090" stroke="${ink}" stroke-width="1.4"/><rect x="10" y="40" width="28" height="2" rx="1" fill="#7cf0ff" opacity=".55"/></svg>`;
}

/** Station > Garden: the plots, the snacks running, and the seed list. */
export class GardenPanel {
  private key = '';

  constructor(private game: Game) {
    $('tab-garden').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-plot],[data-seed],[data-harvest-all]');
      if (!btn || (btn as HTMLButtonElement).disabled) return;
      const s = this.game.state;
      const now = Date.now();
      if (btn.dataset.harvestAll) {
        for (let i = 0; i < plotCount(s); i++) if (plotState(s, i, now).ripe) this.game.harvestPlot(i);
      } else if (btn.dataset.plot) {
        const i = Number(btn.dataset.plot);
        if (plotState(s, i, now).ripe) this.game.harvestPlot(i);
      } else if (btn.dataset.seed) {
        const free = Array.from({ length: plotCount(s) }, (_, i) => i).find((i) => !s.garden.plots[i]);
        if (free !== undefined) this.game.plantCrop(free, btn.dataset.seed);
      }
      this.key = '';
      this.render();
    });
  }

  /** Something to do: a crop is ripe, or a plot sits empty. */
  hasNews(): boolean {
    const s = this.game.state;
    if (!gardenOpen(s)) return false;
    const now = Date.now();
    if (ripeCount(s, now) > 0) return true;
    // A garden never planted gets a dot until the first seed goes in.
    return s.garden.harvested === 0 && !s.garden.plots.some(Boolean);
  }

  render(): void {
    if ($('tab-garden').hidden) return;
    const s = this.game.state;
    const now = Date.now();
    const n = plotCount(s);
    const states = Array.from({ length: n }, (_, i) => plotState(s, i, now));
    const kinds: SnackKind[] = ['income', 'tap', 'crates', 'boss'];
    const key = `${n}|${s.garden.harvested}|${states.map((p) => `${p.crop?.id}${Math.floor(p.grown * 50)}${Math.ceil(p.secondsLeft / 60)}`).join()}|${kinds.map((k) => Math.ceil(snackSecondsLeft(s, k, now) / 60)).join()}`;
    if (key === this.key) return;
    this.key = key;
    const snacks = kinds
      .filter((k) => snackMult(s, k, now) > 1)
      .map((k) => `<span class="snack-chip">${ICONS.bolt}<b>${snackMult(s, k, now)}x ${SNACK_TEXT[k]}</b> ${formatDuration(snackSecondsLeft(s, k, now))}</span>`)
      .join('');
    $('garden-snacks').innerHTML = snacks || '<span class="snack-none">No snacks running. Harvest a crop to cook one for the crew.</span>';
    const ripe = states.filter((p) => p.ripe).length;
    const plots = states.map((p, i) => {
      if (!p.crop) return `<button type="button" class="plot empty" data-plot="${i}" disabled><span class="plot-art">${ICONS.station}</span><small>Empty: plant a seed below</small></button>`;
      const c = p.crop;
      return `<button type="button" class="plot${p.ripe ? ' ripe' : ''}" data-plot="${i}" style="--c:${c.color}" ${p.ripe ? '' : 'disabled'}><span class="plot-art">${cropSvg(c, p.grown)}</span><b>${esc(c.name)}</b><small>${p.ripe ? 'Ripe! Tap to harvest' : `${formatDuration(p.secondsLeft)} left`}</small>${p.ripe ? '' : `<i class="plot-bar"><i style="width:${Math.round(p.grown * 100)}%"></i></i>`}</button>`;
    });
    const locked: string[] = [];
    if (n < GARDEN.plots + 1) locked.push(`<div class="plot locked">${ICONS.lock}<small>Opens after ${GARDEN.thirdAtRelocations} relocations</small></div>`);
    if (n < GARDEN.plots + 2) locked.push(`<div class="plot locked">${ICONS.lock}<small>Opens after a Galaxy Shift</small></div>`);
    $('garden-plots').innerHTML = plots.join('') + locked.slice(0, 4 - n).join('');
    $('garden-harvest').hidden = ripe < 2;
    const free = states.some((p) => !p.crop);
    $('garden-seeds').innerHTML = CROPS.map((c) => {
      if (!cropUnlocked(s, c)) return `<li class="seed locked"><span class="seed-art">${ICONS.lock}</span><div><b>${esc(c.name)}</b><small>Unlocks after ${c.unlockAt} harvests (${s.garden.harvested} so far)</small></div></li>`;
      const sn = c.snack;
      return `<li class="seed" style="--c:${c.color}"><span class="seed-art">${cropSvg(c, 1)}</span><div><b>${esc(c.name)}</b><small>Grows in ${growText(c.minutes)} · ${esc(sn.name)}: ${sn.mult}x ${SNACK_TEXT[sn.kind]} for ${growText(sn.minutes)}${c.crystals ? ` · +${c.crystals} crystals` : ''}</small></div><button type="button" class="crew-btn" data-seed="${c.id}" ${free ? '' : 'disabled'}>Plant</button></li>`;
    }).join('');
  }
}
