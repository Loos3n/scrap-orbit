import { CREW, type CrewId } from '../core/content';
import { GENERATORS } from '../core/config';
import * as eco from '../core/economy';
import { GOLDEN, LOOT, MODULES, TRIPS, TRIP_PER_LEVEL, TRIP_SLOTS, bonuses, goldenActive, moduleCost, moduleDef, moduleUnlocked, moduleYield, onTrip, tripMs, type Bonuses, type ModuleId } from '../core/expansion';
import { formatDuration, type Decimal } from '../core/num';
import type { Game } from '../game';
import { pressWatch } from './gestures';
import { ICONS } from './icons';
import { portrait } from './portrait';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const crystalCost = (n: number) => `<span class="cost-crystal">${ICONS.crystal}<span>${n}</span></span>`;
const setText = (el: HTMLElement, text: string) => {
  if (el.textContent !== text) el.textContent = text;
};
type Fmt = (v: Decimal | number) => string;

const icon = (body: string) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;

export const MODULE_ICONS: Record<ModuleId, string> = {
  reactor: icon(`<circle cx="24" cy="24" r="9" fill="currentColor"/><g fill="none" stroke="currentColor" stroke-width="3"><ellipse cx="24" cy="24" rx="19" ry="7"/><ellipse cx="24" cy="24" rx="19" ry="7" transform="rotate(60 24 24)"/><ellipse cx="24" cy="24" rx="19" ry="7" transform="rotate(120 24 24)"/></g>`),
  hangar: icon(`<path d="M5 40 V20 L24 8 L43 20 V40 Z" fill="currentColor" opacity=".35"/><path d="M5 40 V20 L24 8 L43 20 V40" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><rect x="14" y="24" width="20" height="16" rx="2" fill="currentColor"/>`),
  solar: icon(`<g fill="currentColor"><rect x="4" y="12" width="17" height="24" rx="2"/><rect x="27" y="12" width="17" height="24" rx="2"/><rect x="21" y="22" width="6" height="4"/></g><g stroke="#0b0d26" stroke-width="1.6" opacity=".55"><path d="M4 24 H21 M12.5 12 V36 M27 24 H44 M35.5 12 V36"/></g>`),
  workshop: ICONS.claw,
  greenhouse: icon(`<path d="M6 40 V22 a18 18 0 0 1 36 0 V40 Z" fill="currentColor" opacity=".3"/><path d="M6 40 V22 a18 18 0 0 1 36 0 V40 Z M24 4 V40 M6 26 H42" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M24 38 C14 34 14 24 20 20 C22 26 24 30 24 38 C24 30 28 24 33 22 C35 30 30 36 24 38Z" fill="currentColor"/>`),
  quarters: ICONS.crew,
  observatory: icon(`<path d="M8 40 V26 a16 16 0 0 1 32 0 V40 Z" fill="currentColor"/><path d="M22 16 L36 6 L39 10 L26 21 Z" fill="currentColor" stroke="#0b0d26" stroke-width="1.5"/><circle cx="12" cy="9" r="2" fill="currentColor"/><circle cx="40" cy="22" r="1.5" fill="currentColor"/>`),
  armory: icon(`<path d="M24 4 L41 11 V24 C41 34 33 41 24 44 C15 41 7 34 7 24 V11 Z" fill="currentColor" opacity=".35" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M17 31 L31 17 M20 17 L31 28" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`),
};

const STAT_WORDS: Record<keyof Bonuses, string> = {
  income: 'income',
  tap: 'tap power',
  offline: 'offline earnings',
  boss: 'boss damage',
  trip: 'faster trips',
  golden: 'more golden scrap',
};

const pct = (n: number) => `+${Math.round(n * 1000) / 10}%`;

/** A short list like "+12% income, +15% tap power". */
function bonusText(pairs: [keyof Bonuses, number][]): string {
  return pairs.filter(([, a]) => a > 0).map(([s, a]) => `${pct(a)} ${STAT_WORDS[s]}`).join(', ');
}

// ---------- Station modules ----------

export class ModulePanel {
  private key = '';
  private selected = 4;

  constructor(private game: Game) {
    $('module-grid').addEventListener('click', (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-slot]');
      if (!cell) return;
      this.selected = Number(cell.dataset.slot);
      this.key = '';
      this.render();
    });
    $('module-detail').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-build],button[data-remove]');
      if (!btn) return;
      if (btn.dataset.build) this.game.buildModule(this.selected, btn.dataset.build as ModuleId);
      else this.game.removeModule(this.selected);
      this.key = '';
      this.render();
    });
  }

  render(): void {
    const s = this.game.state;
    const key = s.modules.join() + [...s.blueprints].join() + s.crystals + this.selected;
    if (key === this.key) return;
    this.key = key;
    const b = bonuses(s);
    const total = (Object.keys(STAT_WORDS) as (keyof Bonuses)[]).map((k) => [k, b[k]] as [keyof Bonuses, number]);
    setText($('module-total'), bonusText(total) || 'No modules yet. Tap a slot to build one.');
    $('module-grid').innerHTML = s.modules
      .map((id, i) => {
        const def = moduleDef(id ?? '');
        const sel = i === this.selected ? ' selected' : '';
        if (!def) return `<button type="button" class="module-cell empty${sel}" data-slot="${i}" aria-label="Empty slot">+</button>`;
        return `<button type="button" class="module-cell${sel}" data-slot="${i}" style="--c:${hex(def.color)}" aria-label="${esc(def.name)}">${MODULE_ICONS[def.id]}<span>${esc(def.name)}</span></button>`;
      })
      .join('');
    const here = moduleDef(s.modules[this.selected] ?? '');
    if (here) {
      const refund = s.modulePaid[this.selected] ?? 0;
      $('module-detail').innerHTML = `<div class="module-here" style="--c:${hex(here.color)}">
        <div class="module-icon">${MODULE_ICONS[here.id]}</div>
        <div><b>${esc(here.name)}</b><div class="module-yield">Giving ${bonusText(moduleYield(s.modules, this.selected))}</div><div class="module-rule">${esc(here.rule)}</div></div>
        <button type="button" class="crew-btn" data-remove="1">Take down ${crystalCost(refund)}</button></div>`;
      return;
    }
    $('module-detail').innerHTML = `<p class="module-hint">Build in this slot. Rooms beside a reactor get powered up, and some like company. Taking a room down gives the crystals back, so try layouts freely.</p><ul class="module-list">${MODULES.map((m) => {
      const unlocked = moduleUnlocked(s, m.id);
      const full = m.max !== undefined && s.modules.filter((x) => x === m.id).length >= m.max;
      const cost = moduleCost(s, m.id);
      const action = !unlocked
        ? `<span class="module-locked">${ICONS.lock}Blueprint from expeditions</span>`
        : full
          ? `<span class="module-locked">Only one allowed</span>`
          : `<button type="button" class="crew-btn" data-build="${m.id}" ${s.crystals < cost ? 'disabled' : ''}>Build ${crystalCost(cost)}</button>`;
      return `<li class="module-row${unlocked ? '' : ' locked'}" style="--c:${hex(m.color)}">
        <div class="module-icon">${MODULE_ICONS[m.id]}</div>
        <div class="module-info"><b>${esc(m.name)}</b><div class="module-yield">${pct(m.amount)} ${STAT_WORDS[m.stat]}</div><div class="module-rule">${esc(m.rule)}</div></div>
        ${action}</li>`;
    }).join('')}</ul>`;
  }
}

// ---------- Expeditions ----------

export class TripPanel {
  private key = '';
  private pick: CrewId | null = null;
  /** A finger is down on the panel: hold the once-a-second redraw so the press isn't lost. */
  private pressing: () => boolean;

  constructor(
    private game: Game,
    private fmt: Fmt,
  ) {
    this.pressing = pressWatch($('trip-panel'));
    $('trip-panel').addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-pick],button[data-send],button[data-claim]');
      if (!el) return;
      if (el.dataset.pick) this.pick = el.dataset.pick as CrewId;
      else if (el.dataset.send && this.pick) this.game.startTrip(this.pick, el.dataset.send);
      else if (el.dataset.claim) this.game.claimTrip(Number(el.dataset.claim));
      this.key = '';
      this.render();
    });
  }

  /** True when a trip is back and waiting to be opened. */
  anyReady(): boolean {
    const now = Date.now();
    return this.game.state.trips.some((t) => now >= t.endsAt);
  }

  render(): void {
    if (this.pressing()) return;
    const s = this.game.state;
    const now = Date.now();
    const home = CREW.filter((c) => s.crew[c.id] > 0 && !onTrip(s, c.id));
    if (!this.pick || !home.some((c) => c.id === this.pick)) this.pick = home[0]?.id ?? null;
    // Rebuild only when something real changes (a trip leaves or comes back); the countdowns
    // tick in place, so buttons are never swapped out from under a finger.
    const key = JSON.stringify(s.trips) + s.trips.map((t) => now >= t.endsAt).join() + home.map((c) => c.id + s.crew[c.id]).join() + this.pick + s.blueprints.size + Math.round(eco.baseIncome(s).log10() * 10);
    if (key === this.key) return this.tick(now);
    this.key = key;
    const slots = Array.from({ length: TRIP_SLOTS }, (_, i) => {
      const t = s.trips[i];
      if (!t) return `<li class="trip-slot empty">Free slot: pick a crew member and a destination below.</li>`;
      const c = CREW.find((x) => x.id === t.crew)!;
      const def = TRIPS.find((x) => x.id === t.dest)!;
      const total = tripMs(s, def);
      const left = Math.max(0, t.endsAt - now);
      const done = left === 0;
      return `<li class="trip-slot${done ? ' done' : ''}" data-i="${i}" style="--c:${hex(def.color)}">
        <div class="trip-face">${portrait(c, false)}</div>
        <div class="trip-info"><b>${esc(c.name)}</b> &middot; ${esc(def.name)}
          <div class="bar"><i style="width:${(100 * (1 - left / total)).toFixed(1)}%"></i></div>
          <div class="trip-left">${done ? 'Back with the haul!' : `${formatDuration(left / 1000)} left`}</div></div>
        ${done ? `<button type="button" class="crew-btn" data-claim="${i}">Open</button>` : ''}
      </li>`;
    }).join('');
    const crewRow = home.length
      ? home.map((c) => `<button type="button" class="trip-crew${c.id === this.pick ? ' on' : ''}" data-pick="${c.id}" style="--c:${hex(GENERATORS.find((g) => g.id === c.gen)!.color)}">${portrait(c, false)}<span>${esc(c.name)}</span></button>`).join('')
      : `<p class="module-hint">${CREW.some((c) => s.crew[c.id] > 0) ? 'Everyone is out exploring.' : 'Recruit crew in the Crew list to send them exploring.'}</p>`;
    const picked = this.pick ? CREW.find((c) => c.id === this.pick)! : null;
    const skill = picked ? 1 + (s.crew[picked.id] - 1) * TRIP_PER_LEVEL : 1;
    const full = s.trips.length >= TRIP_SLOTS;
    const income = eco.baseIncome(s);
    const dests = TRIPS.map((d) => {
      const [lo, hi] = d.crystals;
      return `<li class="trip-dest" style="--c:${hex(d.color)}">
        <div class="trip-dest-head"><b>${esc(d.name)}</b><span class="trip-time">${ICONS.clock}${formatDuration(tripMs(s, d) / 1000)}</span></div>
        <div class="trip-desc">${esc(d.desc)}</div>
        <div class="trip-loot">${ICONS.crystal}${Math.round(lo * skill)}-${Math.round(hi * skill)} &middot; ${ICONS.scrap}~${this.fmt(income.mul(d.scrapMin * 60 * skill))} &middot; ${Math.round(d.blueprint * 100)}% blueprint</div>
        <button type="button" class="crew-btn" data-send="${d.id}" ${!picked || full ? 'disabled' : ''}>${picked ? `Send ${esc(picked.name)}` : 'Send'}</button>
      </li>`;
    }).join('');
    $('trip-panel').innerHTML = `<ul class="trip-slots">${slots}</ul>
      <h3 class="section-title">Who goes?</h3><div class="trip-crew-row">${crewRow}</div>
      <p class="module-hint">While away, a crew member's machine loses their bonus. Higher levels bring back more.</p>
      <ul class="trip-dests">${dests}</ul>`;
    this.tick(now);
  }

  /** Moves the countdown text and bars along without rebuilding anything. */
  private tick(now: number): void {
    const s = this.game.state;
    $('trip-panel').querySelectorAll<HTMLElement>('.trip-slot[data-i]').forEach((li) => {
      const t = s.trips[Number(li.dataset.i)];
      if (!t) return;
      const left = Math.max(0, t.endsAt - now);
      const total = tripMs(s, TRIPS.find((x) => x.id === t.dest)!);
      const bar = li.querySelector<HTMLElement>('.bar i');
      if (bar) bar.style.width = `${(100 * (1 - left / total)).toFixed(1)}%`;
      const text = li.querySelector<HTMLElement>('.trip-left');
      if (text) setText(text, left === 0 ? 'Back with the haul!' : `${formatDuration(left / 1000)} left`);
    });
  }
}

// ---------- Boss loot ----------

export class LootShelf {
  private key = '';
  constructor(private game: Game) {}

  render(): void {
    const s = this.game.state;
    const key = [...s.loot].join();
    if (key === this.key) return;
    this.key = key;
    setText($('loot-sum'), `${s.loot.size} / ${LOOT.length}`);
    $('loot-grid').innerHTML = LOOT.map((l) => {
      const got = s.loot.has(l.id);
      return `<li class="loot${got ? ' got' : ''}" style="--c:${hex(l.color)}">
        <div class="loot-icon">${l.pet ? ICONS.crew : ICONS.star}</div>
        <div><b>${got ? esc(l.name) : '???'}</b><div class="loot-desc">${got ? esc(l.desc) : l.pet ? 'A pet skin' : 'A wreck part'}</div></div></li>`;
    }).join('');
  }
}

// ---------- Golden rush ----------

export function renderGoldenBanner(game: Game): void {
  const now = Date.now();
  const on = goldenActive(game.state, now);
  $('golden-banner').hidden = !on;
  document.body.classList.toggle('golden', on);
  if (on) setText($('golden-time'), `${GOLDEN.mult}x for ${Math.ceil((game.state.golden.until - now) / 1000)}s`);
}
