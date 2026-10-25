import { BRANCHES, CREW, CREW_MAX_LEVEL, CREW_PER_LEVEL, EVENTS, PAINTS, RESEARCH, THEMES, type ResearchDef } from '../core/content';
import { GENERATORS } from '../core/config';
import * as eco from '../core/economy';
import * as meta from '../core/meta';
import { Decimal, formatDuration } from '../core/num';
import type { Game } from '../game';
import { GEN_ICONS, ICONS } from './icons';
import { portrait } from './portrait';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const setText = (el: HTMLElement, text: string) => {
  if (el.textContent !== text) el.textContent = text;
};
const setHtml = (el: HTMLElement, html: string) => {
  if (el.innerHTML !== html) el.innerHTML = html;
};
const crystalCost = (n: number) => `<span class="cost-crystal">${ICONS.crystal}<span>${n}</span></span>`;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

type Fmt = (v: Decimal | number) => string;

// ---------- Crew ----------

export class CrewPanel {
  private key = '';
  constructor(private game: Game) {
    $('crew-list').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-crew]');
      if (btn) this.game.trainCrew(btn.dataset.crew as (typeof CREW)[number]['id']);
    });
  }

  /** A dot on the tab when someone can be recruited or trained right now. */
  anyAffordable(): boolean {
    const s = this.game.state;
    return CREW.some((c) => {
      const cost = meta.crewNextCost(s, c.id);
      return cost !== null && meta.crewAvailable(s, c.id) && s.crystals >= cost;
    });
  }

  render(): void {
    const s = this.game.state;
    const key = CREW.map((c) => `${s.crew[c.id]}${meta.crewAvailable(s, c.id) ? 1 : 0}`).join() + s.crystals + eco.researchProduct(s, 'crewMult');
    if (key === this.key) return;
    this.key = key;
    const crewMult = eco.researchProduct(s, 'crewMult');
    const html = CREW.map((c) => {
      const gen = GENERATORS.find((g) => g.id === c.gen)!;
      const level = s.crew[c.id];
      const available = meta.crewAvailable(s, c.id);
      const cost = meta.crewNextCost(s, c.id);
      const mult = (1 + level * CREW_PER_LEVEL * crewMult).toFixed(level && crewMult !== 1 ? 2 : 0).replace(/\.?0+$/, '');
      const next = (1 + (level + 1) * CREW_PER_LEVEL * crewMult).toFixed(crewMult !== 1 ? 2 : 0).replace(/\.?0+$/, '');
      const pips = Array.from({ length: CREW_MAX_LEVEL }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
      let action: string;
      if (!available) action = `<div class="crew-locked">${ICONS.lock}Build a ${esc(gen.name)} to meet them</div>`;
      else if (cost === null) action = `<div class="crew-max">Max level</div>`;
      else
        action = `<button class="crew-btn" type="button" data-crew="${c.id}" ${s.crystals < cost ? 'disabled' : ''}>${level ? 'Train' : 'Recruit'} ${crystalCost(cost)}</button>`;
      const effect = level ? `${esc(gen.name)}s <b>x${mult}</b>` : available ? `Would make ${esc(gen.name)}s <b>x${next}</b>` : '&nbsp;';
      return `<li class="crew-card${level ? ' hired' : ''}${available ? '' : ' locked'}" style="--c:${hex(gen.color)}">
        <div class="crew-portrait">${portrait(c, !available)}<span class="crew-gen">${GEN_ICONS[c.gen]}</span></div>
        <div class="crew-name">${available ? esc(c.name) : '???'}</div>
        <div class="crew-role">${esc(c.role)}</div>
        <div class="pips">${pips}</div>
        <div class="crew-effect">${effect}</div>
        ${action}
      </li>`;
    }).join('');
    $('crew-list').innerHTML = html;
  }
}

// ---------- Research ----------

function researchIcon(r: ResearchDef): string {
  switch (r.effect.kind) {
    case 'tapMult':
    case 'tapIncomeShare':
      return ICONS.claw;
    case 'flareMult':
      return ICONS.flare;
    case 'allMult':
      return ICONS.star;
    case 'costMult':
      return ICONS.build;
    case 'crateRate':
      return ICONS.scrap;
    case 'offlineSec':
    case 'offlineMult':
      return ICONS.clock;
    case 'eventRate':
      return ICONS.meteor;
    case 'crewMult':
      return ICONS.crew;
    case 'boostSec':
      return ICONS.bolt.replace('currentColor', '#ff6b9a');
    case 'missionMult':
      return ICONS.missions;
    case 'corePerCore':
      return ICONS.core;
  }
}

export class LabPanel {
  private selected = RESEARCH[0].id;
  private treeKey = '';
  constructor(private game: Game) {
    $('lab-tree').addEventListener('click', (e) => {
      const node = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-research]');
      if (!node) return;
      this.selected = node.dataset.research!;
      this.treeKey = '';
      this.render();
    });
    $('lab-detail').addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-start]')) this.game.startResearch(this.selected);
    });
    $('lab-active').addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-rush]')) this.game.rushResearch();
    });
  }

  /** A dot on the tab when the lab is idle and something can be started. */
  idle(): boolean {
    const s = this.game.state;
    return !s.research.active && RESEARCH.some((r) => meta.researchState(s, r.id) === 'ready');
  }

  render(): void {
    const s = this.game.state;
    const now = Date.now();
    const a = s.research.active;
    if (a) {
      const def = RESEARCH.find((r) => r.id === a.id)!;
      const left = Math.max(0, (a.endsAt - now) / 1000);
      const pct = 100 * (1 - left / def.seconds);
      const rush = meta.rushPrice(s, now);
      setHtml(
        $('lab-active'),
        `<div class="lab-active-icon">${researchIcon(def)}</div>
        <div class="lab-active-text"><div class="eyebrow">Researching</div><b>${esc(def.name)}</b>
        <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div><span class="lab-left">${formatDuration(left)} left</span></div>
        <button type="button" class="crew-btn" data-rush ${s.crystals < rush ? 'disabled' : ''}>Finish ${crystalCost(rush)}</button>`,
      );
    } else {
      const done = s.research.done.size;
      setHtml(
        $('lab-active'),
        `<div class="lab-active-icon idle">${ICONS.lab}</div><div class="lab-active-text"><div class="eyebrow">Lab idle</div><b>${done === RESEARCH.length ? 'Every project is finished' : 'Pick a project to start'}</b><span class="lab-left">Research keeps running while you're away.</span></div>`,
      );
    }

    const key = RESEARCH.map((r) => meta.researchState(s, r.id)).join() + this.selected + (a ? 1 : 0);
    if (key === this.treeKey) return;
    this.treeKey = key;
    $('lab-tree').innerHTML = BRANCHES.map(
      (name, b) =>
        `<div class="lab-col"><div class="lab-branch">${name}</div>${RESEARCH.filter((r) => r.branch === b)
          .map((r) => {
            const st = meta.researchState(s, r.id);
            return `<button type="button" class="lab-node ${st}${r.id === this.selected ? ' sel' : ''}" data-research="${r.id}" aria-label="${esc(r.name)}">
              <span class="lab-node-icon">${st === 'done' ? ICONS.check : st === 'locked' ? ICONS.lock : researchIcon(r)}</span>
              <span class="lab-node-name">${esc(r.name)}</span></button>`;
          })
          .join('')}</div>`,
    ).join('');

    const def = RESEARCH.find((r) => r.id === this.selected)!;
    const st = meta.researchState(s, def.id);
    const req = def.requires ? RESEARCH.find((r) => r.id === def.requires)!.name : '';
    let action = '';
    if (st === 'done') action = `<div class="lab-status ok">${ICONS.check} Finished</div>`;
    else if (st === 'active') action = `<div class="lab-status">In progress</div>`;
    else if (st === 'locked') action = `<div class="lab-status">Needs ${esc(req)} first</div>`;
    else if (a) action = `<div class="lab-status">The lab is busy with another project</div>`;
    else action = `<button type="button" class="primary lab-start" data-start>Start research</button>`;
    $('lab-detail').innerHTML = `<div class="lab-detail-head"><div class="lab-node-icon big">${researchIcon(def)}</div>
      <div><b>${esc(def.name)}</b><div class="lab-desc">${esc(def.desc)}</div><div class="lab-time">${ICONS.clock}${formatDuration(def.seconds)}</div></div></div>${action}`;
  }
}

// ---------- Decorations ----------

export class DecorPanel {
  private key = '';
  constructor(private game: Game) {
    for (const id of ['theme-list', 'paint-list']) {
      $(id).addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-decor]');
        if (btn) this.game.useDecor(btn.dataset.decor!);
      });
    }
  }

  render(): void {
    const s = this.game.state;
    const key = [...s.decor.owned].join() + s.decor.theme + s.decor.paint + s.crystals;
    if (key === this.key) return;
    this.key = key;
    const card = (id: string, name: string, cost: number, swatch: string) => {
      const owned = s.decor.owned.has(id);
      const inUse = s.decor.theme === id || s.decor.paint === id;
      const label = inUse ? 'In use' : owned ? 'Use' : crystalCost(cost);
      return `<li><button type="button" class="decor-card${inUse ? ' on' : ''}" data-decor="${id}" ${!owned && s.crystals < cost ? 'disabled' : ''}>
        <span class="decor-swatch">${swatch}</span><span class="decor-name">${esc(name)}</span><span class="decor-tag">${label}</span></button></li>`;
    };
    $('theme-list').innerHTML = THEMES.map((t) =>
      card(
        t.id,
        t.name,
        t.cost,
        `<span class="sky" style="background:radial-gradient(circle at 30% 30%, ${t.nebula[0]}, transparent 60%), radial-gradient(circle at 75% 70%, ${t.nebula[2]}, transparent 55%), linear-gradient(${t.sky[0]}, ${t.sky[1]}, ${t.sky[2]})"><i style="background:${hex(t.core)};box-shadow:0 0 10px ${hex(t.core)}"></i></span>`,
      ),
    ).join('');
    $('paint-list').innerHTML = PAINTS.map((p) =>
      card(p.id, p.name, p.cost, `<span class="hull" style="--t:${hex(p.tint)}"><i></i></span>`),
    ).join('');
  }
}

// ---------- Missions ----------

export class MissionsPanel {
  private key = '';
  constructor(private game: Game, private fmt: Fmt) {
    $('missions-btn').addEventListener('click', () => this.open());
    $('missions-close').addEventListener('click', () => ($('missions').hidden = true));
    $('missions').addEventListener('click', (e) => {
      if (e.target === $('missions')) $('missions').hidden = true;
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-claim]');
      if (btn) this.game.claimMission(Number(btn.dataset.claim));
    });
  }

  open(): void {
    $('missions').hidden = false;
    this.key = '';
    this.render();
  }

  render(): void {
    const s = this.game.state;
    const ready = meta.claimableMissions(s);
    const dot = $('missions-dot');
    dot.hidden = ready === 0;
    setText(dot, String(ready));
    if ($('missions').hidden) return;
    const row = (m: (typeof s.missions.daily)[number], index: number) => {
      const p = meta.missionProgress(s, m);
      const weekly = index < 0;
      const reward = meta.missionReward(s, m, weekly);
      const done = p.pct >= 1;
      const count = m.kind === 'earn' ? `${this.fmt(p.done)} / ${this.fmt(p.target)}` : `${p.done.toNumber().toLocaleString('en-US')} / ${p.target.toNumber().toLocaleString('en-US')}`;
      const action = m.claimed
        ? `<span class="mission-claimed">${ICONS.check}</span>`
        : `<button type="button" class="crew-btn" data-claim="${index}" ${done ? '' : 'disabled'}>${done ? 'Claim' : ''} ${crystalCost(reward)}</button>`;
      return `<li class="mission${m.claimed ? ' claimed' : done ? ' done' : ''}${weekly ? ' weekly' : ''}">
        <div class="mission-text"><b>${esc(meta.missionText(m, this.fmt))}</b>
        <div class="bar"><i style="width:${(p.pct * 100).toFixed(1)}%"></i></div><span class="mission-count">${count}</span></div>${action}</li>`;
    };
    const key = JSON.stringify(s.missions) + s.taps + s.stats.machines + s.stats.meteors + s.allTime.toString() + s.settings.numbers;
    if (key !== this.key) {
      this.key = key;
      setHtml($('mission-list'), s.missions.daily.map((m, i) => row(m, i)).join(''));
      setHtml($('weekly-list'), s.missions.weekly ? row(s.missions.weekly, -1) : '');
    }
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    setText($('mission-reset'), `New missions in ${formatDuration((midnight.getTime() - Date.now()) / 1000)}`);
  }
}

// ---------- Event banner ----------

export function renderEventBanner(game: Game): void {
  const s = game.state;
  const now = Date.now();
  const kind = meta.eventActive(s, now);
  const banner = $('event-banner');
  banner.hidden = !kind;
  if (!kind) return;
  const def = EVENTS[kind];
  if (banner.dataset.kind !== kind) {
    banner.dataset.kind = kind;
    $('event-icon').innerHTML = kind === 'meteors' ? ICONS.meteor : kind === 'flare' ? ICONS.flare : ICONS.crystal;
    setText($('event-name'), def.name);
    const desc = kind === 'flare' ? `Taps are ${5 * eco.researchProduct(s, 'flareMult')}x stronger!` : def.desc;
    setText($('event-desc'), desc);
  }
  const left = (s.event!.endsAt - now) / 1000;
  setText($('event-time'), `${Math.ceil(left)}s`);
  $('event-bar').style.width = `${(100 * left) / def.seconds}%`;
}

// ---------- Tutorial ----------

const STEPS: { text: string; target: string; place: 'above' | 'below' }[] = [
  { text: 'Tap the station to salvage scrap.', target: '#stage', place: 'below' },
  { text: 'Nice haul! Build a Salvage Drone. It salvages for you, even while you are away.', target: '#gen-list .gen:first-child .buy', place: 'above' },
  { text: 'Keep tapping and building. When an upgrade is ready, the Upgrades tab lights up.', target: '.tab[data-tab="upgrades"]', place: 'above' },
  { text: 'Overdrive doubles everything for a short burst. Give it a tap!', target: '#boost', place: 'below' },
  { text: 'Missions, crew, research and more unlock as you go. Have fun out there, captain!', target: '#missions-btn', place: 'below' },
];

export class Coach {
  private shownFor = -2;
  private highlighted: Element | null = null;
  constructor(private game: Game) {
    $('coach-skip').addEventListener('click', () => this.game.endTutorial());
  }

  render(): void {
    const step = this.game.state.tutorial;
    const coach = $('coach');
    const def = step >= 0 ? STEPS[step] : undefined;
    // Step 2 waits until there is actually an upgrade to buy.
    const waiting = step === 2 && $('upgrade-dot').hidden;
    if (!def || waiting) {
      coach.hidden = true;
      this.highlight(null);
      this.shownFor = -2;
      return;
    }
    const target = document.querySelector(def.target);
    if (!target) return;
    if (this.shownFor !== step) {
      this.shownFor = step;
      $('coach-text').textContent = def.text;
      setText($('coach-skip'), step === STEPS.length - 1 ? 'Got it' : 'Skip tutorial');
      coach.hidden = false;
      this.highlight(def.target === '#stage' ? null : target);
    }
    const r = target.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 32);
    const left = Math.max(16, Math.min(window.innerWidth - w - 16, r.left + r.width / 2 - w / 2));
    coach.style.width = `${w}px`;
    coach.style.left = `${left}px`;
    coach.style.setProperty('--arrow', `${r.left + r.width / 2 - left}px`);
    if (def.target === '#stage') {
      coach.dataset.place = 'below';
      coach.style.top = `${r.top + r.height * 0.78}px`;
    } else if (def.place === 'below') {
      coach.dataset.place = 'below';
      coach.style.top = `${r.bottom + 12}px`;
    } else {
      coach.dataset.place = 'above';
      coach.style.top = `${r.top - coach.offsetHeight - 12}px`;
    }
  }

  private highlight(el: Element | null): void {
    if (this.highlighted === el) return;
    this.highlighted?.classList.remove('coach-target');
    el?.classList.add('coach-target');
    this.highlighted = el;
  }

  static get last(): number {
    return STEPS.length - 1;
  }
}
