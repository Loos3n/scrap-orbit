import { claimableCores } from '../core/economy';
import { GALAXY, STAR_NODES, forgeCost, starIncomeMult } from '../core/galaxy';
import * as meta from '../core/meta';
import type { Game } from '../game';
import { ICONS } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const starCost = (n: number) => `<span class="cost-star">${ICONS.star}<span>${n}</span></span>`;
const fmtMult = (m: number) => (m >= 100 ? Math.round(m).toLocaleString('en-US') : (Math.round(m * 100) / 100).toString());

/** The Galaxy Shift card and the Star Map, in the Cores tab. */
export class GalaxyPanel {
  private key = '';
  private arming = false;

  constructor(private game: Game) {
    $('galaxy-card').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-shift]');
      if (!btn) return;
      if (this.arming) {
        this.arming = false;
        this.game.shiftGalaxy();
      } else this.arming = true;
      this.key = '';
      this.render();
    });
    $('star-map').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-star]');
      if (!btn) return;
      this.game.buyStar(btn.dataset.star!);
      this.key = '';
      this.render();
    });
  }

  render(): void {
    if ($('tab-cores').hidden) {
      this.arming = false;
      return;
    }
    const s = this.game.state;
    const g = s.galaxy;
    const open = meta.galaxyOpen(s);
    const stars = meta.starsOnShift(s);
    const key = `${open}${stars}${g.stars}${g.earned}${g.forge}${[...g.map].join()}${this.arming}${s.cores + claimableCores(s)}`;
    if (key === this.key) return;
    this.key = key;
    if (!open && stars === 0) this.arming = false;

    const now = g.shifts ? `<div class="galaxy-now">Galaxy ${g.shifts + 1} · ${g.earned} stars earned · x${fmtMult(starIncomeMult(s))} income</div>` : '';
    let action: string;
    if (!open) action = `<div class="galaxy-lock">${ICONS.lock}Build a Dyson Collector in a run to open the shift.</div>`;
    else if (stars === 0) action = `<div class="galaxy-lock">Hold more Star Cores first. You need ${(GALAXY.coresPerStar * GALAXY.starGrowth ** g.shifts).toLocaleString('en-US')} for your first star here.</div>`;
    else
      action = `<button type="button" class="primary galaxy-btn${this.arming ? ' armed' : ''}" data-shift="1">${ICONS.star}${this.arming ? `Tap again to shift for ${stars} ${stars === 1 ? 'star' : 'stars'}` : `Shift galaxy for +${stars} ${stars === 1 ? 'star' : 'stars'}`}</button>`;
    const warn = this.arming
      ? '<p class="galaxy-warn">Everything from this galaxy resets, Star Cores too. You keep stars, crew, research, rooms, crystals, pets and your collection.</p>'
      : '';
    $('galaxy-card').innerHTML = `
      <div class="galaxy-head"><div class="galaxy-art">${ICONS.star}</div><div><div class="eyebrow">Galaxy Shift</div>
      <div class="galaxy-count"><b>${g.stars}</b> ${g.stars === 1 ? 'star' : 'stars'} to spend</div></div></div>
      ${now}
      <p class="galaxy-desc">Trade all your Star Cores for Galaxy Stars and start over in a new galaxy. Every star ever earned adds +${GALAXY.incomePerStar * 100}% income, and you spend them on the Star Map below. More cores make more stars.</p>
      ${action}${warn}`;

    const nodes = STAR_NODES.map((n) => {
      const have = g.map.has(n.id);
      const btn = have
        ? `<span class="offer-sold">${ICONS.check}Owned</span>`
        : `<button type="button" class="crew-btn" data-star="${n.id}" ${g.stars >= n.cost ? '' : 'disabled'}>${starCost(n.cost)}</button>`;
      return `<li class="star-node${have ? ' on' : ''}" style="--c:${hex(n.color)}"><div class="challenge-icon">${ICONS.star}</div><div><b>${esc(n.name)}</b><div class="challenge-rule">${esc(n.desc)}</div></div>${btn}</li>`;
    });
    const fc = forgeCost(g.forge);
    nodes.push(
      `<li class="star-node forge" style="--c:#ffe9a8"><div class="challenge-icon">${ICONS.core}</div><div><b>Star Forge${g.forge ? ` (level ${g.forge})` : ''}</b><div class="challenge-rule">Everything produces 2x. Buy it again and again; the price doubles each time.</div></div><button type="button" class="crew-btn" data-star="forge" ${g.stars >= fc ? '' : 'disabled'}>${starCost(fc)}</button></li>`,
    );
    $('star-map').innerHTML = nodes.join('');
    $('star-map-title').hidden = g.earned === 0;
    $('star-map').hidden = g.earned === 0;
  }
}

/** Toast text for a shift. */
export function galaxyText(stars: number, galaxy: number): string {
  return `<b>Welcome to Galaxy ${galaxy}!</b> +${stars} Galaxy ${stars === 1 ? 'Star' : 'Stars'}. Spend them on the Star Map in Cores`;
}
