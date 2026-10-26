import { ACHIEVEMENT_BONUS, BOOST, GENERATORS, MILESTONE_MULT, UPGRADES, type GeneratorId } from '../core/config';
import { CREW, CREW_PER_LEVEL } from '../core/content';
import * as eco from '../core/economy';
import { GOLDEN, LOOT, bonuses, goldenActive } from '../core/expansion';
import { D, type Decimal } from '../core/num';
import type { Game } from '../game';
import { GEN_ICONS, ICONS } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
type Fmt = (v: Decimal | number) => string;

/** A longer story for each machine, shown on its info sheet. */
const LORE: Record<GeneratorId, string> = {
  drone: 'Fist-sized and endlessly curious, salvage drones nibble screws, cables and plating off anything that drifts too close. They hum when they are happy.',
  hauler: 'Old tugboats refitted with magnetic grapples. A hauler can drag a hull plate the size of a house back to the station before lunch.',
  smelter: 'Furnaces fed straight from the haulers. Twisted junk goes in one end and neat glowing ingots come out the other, ready to sell or build with.',
  fabricator: 'Printers that turn ingots into brackets, bolts and spare parts. Half of them are useful. The other half get melted down and tried again.',
  dock: 'A cradle big enough to hold a whole derelict ship while crews strip it, one deck at a time, from the bridge to the engines.',
  laser: 'Orbital mining lasers that slice passing asteroids into tidy chunks. Point them carefully: the station paint is not laser-proof.',
  gravity: 'A pocket of bent space that tugs whole debris fields toward the station. Loose socks have been known to vanish into it.',
  nanite: 'A hive of microscopic builders. Released onto a wreck, they take it apart atom by atom and carry the pieces home in single file.',
  gate: 'A ring that folds space to a scrapyard in another star system. Cargo arrives instantly; the paperwork takes a little longer.',
  dyson: 'A swarm of mirrors wrapped around a star, pouring its light into the smelters. The biggest machine anyone has ever built for tidying up.',
};

const pctText = (n: number) => `+${(Math.round(n * 1000) / 10).toLocaleString('en-US')}%`;
const xText = (n: number) => `x${n >= 100 ? Math.round(n).toLocaleString('en-US') : (Math.round(n * 100) / 100).toString()}`;

type Sheet = { kind: 'machine'; id: GeneratorId } | { kind: 'income' };

/** A pop-up that explains where numbers come from: one machine, or the whole income. */
export class InfoSheet {
  private sheet: Sheet | null = null;
  private html = '';

  constructor(
    private game: Game,
    private fmt: Fmt,
  ) {
    $('info-close').addEventListener('click', () => this.close());
    $('info').addEventListener('click', (e) => {
      if (e.target === $('info')) this.close();
    });
  }

  open(sheet: Sheet): void {
    this.sheet = sheet;
    this.html = '';
    $('info').hidden = false;
    this.render();
  }

  close(): void {
    this.sheet = null;
    $('info').hidden = true;
  }

  render(): void {
    if (!this.sheet) return;
    const html = this.sheet.kind === 'machine' ? this.machine(this.sheet.id) : this.income();
    if (html === this.html) return;
    this.html = html;
    $('info-body').innerHTML = html;
  }

  private rows(rows: [string, string][]): string {
    return `<dl class="info-rows">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  }

  private machine(id: GeneratorId): string {
    const s = this.game.state;
    const g = GENERATORS.find((x) => x.id === id)!;
    const owned = s.owned[id];
    const rate = eco.generatorRate(s, g);
    const total = eco.baseIncome(s);
    const share = total.gt(0) ? rate.div(total).toNumber() : 0;
    const each = owned > 0 ? rate.div(owned) : D(0);
    const crew = CREW.find((c) => c.gen === id)!;
    const crewX = eco.crewMult(s, id);
    const ups = UPGRADES.filter((u) => s.upgrades.has(u.id));
    let upX = 1;
    for (const u of ups) for (const e of u.effects) if ((e.kind === 'genMult' && e.gen === id) || e.kind === 'allMult') upX *= e.mult;
    const next = eco.nextMilestone(owned);
    const milestones = eco.milestonesReached(owned);
    const away = s.trips.some((t) => t.crew === crew.id);
    const crewText = s.crew[crew.id] === 0 ? 'Not recruited' : away ? `${esc(crew.name)} is on a trip` : `${esc(crew.name)} ${xText(crewX)}`;
    return `<div class="info-hero" style="--c:${hex(g.color)}"><div class="info-icon">${GEN_ICONS[id]}</div>
        <div><div class="eyebrow">Machine</div><h2>${esc(g.name)}</h2><div class="info-owned">${owned.toLocaleString('en-US')} built</div></div></div>
      <p class="info-lore">${LORE[id]}</p>
      <h3 class="section-title">Output</h3>
      ${this.rows([
        ['All of them', `<b>${this.fmt(rate)}</b> / sec`],
        ['Each one', `${this.fmt(each)} / sec`],
        ['Share of your income', `<span class="info-share"><i style="width:${(share * 100).toFixed(1)}%;background:${hex(g.color)}"></i></span>${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`],
        ['Base output', `${this.fmt(g.baseOutput)} / sec each`],
      ])}
      <h3 class="section-title">Multipliers</h3>
      ${this.rows([
        ['Milestones', `${milestones} reached ${xText(MILESTONE_MULT ** milestones)}`],
        ['Crew', crewText],
        ['Upgrades', xText(upX)],
        ['Station-wide bonuses', xText(eco.globalMult(s) * (1 + bonuses(s).income))],
      ])}
      <h3 class="section-title">Next</h3>
      ${this.rows([
        ['Next milestone', next ? `${owned} / ${next.at} for 2x output` : 'All reached'],
        ['Next one costs', this.fmt(eco.costFor(g, owned, 1, eco.costDiscount(s)))],
      ])}`;
  }

  private income(): string {
    const s = this.game.state;
    const now = Date.now();
    const total = eco.baseIncome(s);
    const machines = GENERATORS.filter((g) => s.owned[g.id] > 0)
      .map((g) => ({ g, rate: eco.generatorRate(s, g) }))
      .sort((a, b) => (b.rate.gt(a.rate) ? 1 : -1));
    const list = machines
      .map(({ g, rate }) => {
        const share = total.gt(0) ? rate.div(total).toNumber() : 0;
        return `<li style="--c:${hex(g.color)}"><span class="info-mini">${GEN_ICONS[g.id]}</span><span class="info-name">${esc(g.name)}</span><span class="info-share"><i style="width:${(share * 100).toFixed(1)}%"></i></span><b>${this.fmt(rate)}</b></li>`;
      })
      .join('');
    const b = bonuses(s);
    const loot = LOOT.filter((l) => l.stat === 'income' && s.loot.has(l.id)).reduce((a, l) => a + l.amount!, 0);
    const rooms = b.income - loot;
    const cores = s.cores * eco.perCoreBonus(s);
    const ach = s.achievements.size * ACHIEVEMENT_BONUS;
    const research = eco.researchProduct(s, 'allMult');
    const boost = eco.boostActive(s, now);
    const golden = goldenActive(s, now);
    const mult: [string, string][] = [
      ['Star Cores', pctText(cores)],
      ['Achievements', pctText(ach)],
      ['Research', xText(research)],
      ['Station rooms', pctText(rooms)],
      ['Boss loot', pctText(loot)],
      ['Overdrive', boost ? `${xText(BOOST.mult)} now` : 'Not running'],
      ['Golden rush', golden ? `${xText(GOLDEN.mult)} now` : 'Not running'],
    ];
    const crewX = CREW.filter((c) => s.crew[c.id] > 0);
    return `<div class="info-hero" style="--c:#4fe3c1"><div class="info-icon">${ICONS.scrap}</div>
        <div><div class="eyebrow">Income</div><h2>${this.fmt(eco.income(s, now))} / sec</h2><div class="info-owned">${this.fmt(eco.tapValue(s, now))} per tap</div></div></div>
      <h3 class="section-title">Where it comes from${boost || golden ? ', before timed boosts' : ''}</h3>
      <ul class="info-list">${list || '<li class="empty">Build a machine to start earning.</li>'}</ul>
      <h3 class="section-title">Bonuses on everything</h3>
      ${this.rows(mult)}
      <h3 class="section-title">Crew on duty</h3>
      <p class="info-lore">${crewX.length ? crewX.map((c) => `${esc(c.name)} ${s.trips.some((t) => t.crew === c.id) ? '(away)' : xText(1 + s.crew[c.id] * CREW_PER_LEVEL * eco.researchProduct(s, 'crewMult'))}`).join(' &middot; ') : 'Nobody yet. Recruit crew from the Crew tab.'}</p>`;
  }
}
