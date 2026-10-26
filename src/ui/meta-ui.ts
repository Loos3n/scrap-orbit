import { BOSS_NAMES, BRANCHES, CREW, CREW_MAX_LEVEL, CREW_PER_LEVEL, EVENTS, PAINTS, PETS, RESEARCH, STORY, STREAK_REWARDS, THEMES, TUTORIAL, TUTORIAL_DRONES, TUTORIAL_TAPS, type PetId, type ResearchDef } from '../core/content';
import { GENERATORS } from '../core/config';
import { LOOT } from '../core/expansion';
import * as eco from '../core/economy';
import * as meta from '../core/meta';
import { D, Decimal, format, formatDuration } from '../core/num';
import type { Game } from '../game';
import { GEN_ICONS, ICONS } from './icons';
import { petUrl } from '../scene/art';
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

// ---------- Boss wrecks ----------

export function renderBossBanner(game: Game): void {
  const b = game.state.boss;
  const banner = $('boss-banner');
  banner.hidden = !b;
  $('boss-edge').hidden = !b;
  if (!b) return;
  setText($('boss-name'), BOSS_NAMES[b.name % BOSS_NAMES.length]);
  const health = meta.bossHealth(game.state);
  setText($('boss-time'), `${Math.ceil(meta.bossTimeLeft(game.state, Date.now()))}s`);
  setText($('boss-reward'), b.reward ? format(D(b.reward)) : '');
  $('boss-hp').style.width = `${health * 100}%`;
}

/** The big hazard-striped warning when a boss wreck arrives. */
export function showBossAlert(name: string, reward: string): void {
  const alert = $('boss-alert');
  setText($('boss-alert-name'), name);
  setText($('boss-alert-reward'), reward);
  alert.hidden = false;
  // Restart the animation, then hide it when it has played.
  alert.style.animation = 'none';
  void alert.offsetWidth;
  alert.style.animation = '';
  window.setTimeout(() => (alert.hidden = true), 2800);
}

/** Jolts the boss banner when a hit lands. */
export function shakeBossBanner(): void {
  const banner = $('boss-banner');
  banner.classList.remove('hit');
  void banner.offsetWidth;
  banner.classList.add('hit');
}

// ---------- Pets ----------

const petArt = new Map<PetId, string>();
const petImg = (id: PetId) => {
  if (!petArt.has(id)) petArt.set(id, petUrl(id));
  const url = petArt.get(id)!;
  return url ? `<img src="${url}" alt="" />` : '';
};

/** A toggle for a pet's boss-loot skin, once it has been found. */
function skinButton(s: Game['state'], pet: PetId): string {
  const skin = LOOT.find((l) => l.pet === pet && s.loot.has(l.id));
  if (!skin) return '';
  const wearing = s.skins[pet] === skin.id;
  return `<button class="skin-btn${wearing ? ' on' : ''}" type="button" data-pet="${pet}" data-skin="${wearing ? '' : skin.id}" style="--s:${hex(skin.tint!)}">${wearing ? 'Wearing' : 'Wear'} ${esc(skin.name)}</button>`;
}

export class PetPanel {
  private key = '';
  constructor(private game: Game) {
    $('pet-list').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-pet]');
      if (!btn) return;
      const id = btn.dataset.pet as PetId;
      const s = this.game.state;
      if (btn.dataset.skin !== undefined) {
        this.game.chooseSkin(id, btn.dataset.skin || null);
        this.key = '';
        return;
      }
      if (!s.pets.owned.has(id)) this.game.buyPet(id);
      else this.game.choosePet(s.pets.active === id ? null : id);
    });
  }

  /** A dot on the tab when a pet can be adopted. */
  anyAffordable(): boolean {
    const s = this.game.state;
    return PETS.some((p) => !s.pets.owned.has(p.id) && s.crystals >= p.cost);
  }

  render(): void {
    const s = this.game.state;
    const key = PETS.map((p) => (s.pets.owned.has(p.id) ? 1 : 0)).join('') + (s.pets.active ?? '') + s.crystals + [...s.loot].join() + JSON.stringify(s.skins);
    if (key === this.key) return;
    this.key = key;
    $('pet-list').innerHTML = PETS.map((p) => {
      const owned = s.pets.owned.has(p.id);
      const active = s.pets.active === p.id;
      const action = !owned
        ? `<button class="crew-btn" type="button" data-pet="${p.id}" ${s.crystals < p.cost ? 'disabled' : ''}>Adopt ${crystalCost(p.cost)}</button>`
        : `<button class="crew-btn" type="button" data-pet="${p.id}">${active ? 'Send home' : 'Bring along'}</button>`;
      return `<li class="crew-card${owned ? ' hired' : ' locked'}${active ? ' active' : ''}" style="--c:${hex(p.color)}">
        <div class="pet-art">${petImg(p.id)}</div>
        <div class="crew-name">${esc(p.name)}</div>
        <div class="crew-effect">${esc(p.desc)}</div>
        ${active ? '<div class="pet-status">Following you</div>' : ''}
        ${action}
        ${owned ? skinButton(s, p.id) : ''}
      </li>`;
    }).join('');
  }
}

// ---------- Story log ----------

export class LogPanel {
  private key = '';
  constructor(private game: Game) {}

  /** `since` is how many entries had been read when the log was opened; newer ones glow. */
  render(since: number): void {
    const s = this.game.state;
    const key = `${s.story.length}|${since}`;
    if (key === this.key) return;
    this.key = key;
    // Newest first.
    const html = s.story
      .map((id, i) => {
        const e = STORY.find((x) => x.id === id);
        if (!e) return '';
        const who = CREW.find((c) => c.id === e.who)!;
        return `<li class="log-entry${i >= since ? ' new' : ''}">
          <div class="log-face">${portrait(who)}</div>
          <div><div class="log-head"><b>${esc(e.title)}</b><small>${esc(who.name)}, ${esc(who.role)} · entry ${i + 1}</small></div><p>${esc(e.text)}</p></div>
        </li>`;
      })
      .reverse()
      .join('');
    $('log-list').innerHTML = html;
    const left = STORY.length - s.story.length;
    setText($('log-more'), left > 0 ? `${left} more ${left === 1 ? 'entry' : 'entries'} to uncover as the station grows.` : 'That is every entry so far. The story continues in a future update.');
  }
}

// ---------- Daily streak ----------

export class StreakModal {
  constructor(private game: Game, private fmt: Fmt) {
    $('streak-claim').addEventListener('click', () => {
      this.game.claimStreak();
      $('streak').hidden = true;
    });
  }

  open(): void {
    const s = this.game.state;
    const slot = meta.streakSlot(s);
    setText($('streak-title'), `Day ${s.login.streak} streak`);
    setText($('streak-sub'), s.login.streak > 1 ? 'You came back! Visit every day to climb the reward track.' : 'Come back tomorrow to start a streak. Day 7 brings a free pet.');
    const now = Date.now();
    $('streak-days').innerHTML = STREAK_REWARDS.map((r, i) => {
      let icon: string;
      let label: string;
      if (r.kind === 'crystals') {
        icon = ICONS.crystal;
        label = `${r.amount}`;
      } else if (r.kind === 'scrap') {
        icon = ICONS.scrap;
        label = this.fmt(meta.streakScrap(s, r.minutes, now));
      } else {
        const pet = meta.nextFreePet(s);
        icon = pet ? petImg(pet) : ICONS.crystal;
        label = pet ? PETS.find((p) => p.id === pet)!.name : `${r.crystals}`;
      }
      const cls = i < slot ? ' done' : i === slot ? ' today' : '';
      return `<li class="streak-day${cls}${i === 6 ? ' big' : ''}"><span>Day ${i + 1}</span><span class="ic">${icon}</span><b>${esc(label)}</b></li>`;
    }).join('');
    $('streak').hidden = false;
  }
}

// ---------- Tutorial ----------

interface CoachStep {
  /** What Mika says. */
  text: string;
  /** The element to point at; none means a centred card. */
  target?: string;
  /** The tab the target lives in; if it is closed, Mika points at the tab first. */
  tab?: string;
  /** A progress bar under the text, as [done, goal]. */
  progress?: [number, number];
  /** Label of a button that finishes the step, for steps there is nothing to do in. */
  next?: string;
}

const TAB_NAMES: Record<string, string> = { build: 'Build', upgrades: 'Upgrades', crew: 'Crew', lab: 'Lab', cores: 'Cores', station: 'Station' };
const MIKA = CREW.find((c) => c.id === 'mika')!;

/** One-time tips for things that unlock after the tutorial. Each is seen once its tab is opened. */
const TIPS: { id: string; tab: string; text: string; when: (game: Game) => boolean }[] = [
  {
    id: 'crew',
    tab: 'crew',
    text: "You've earned crystals! Spend 5 to recruit me in the Crew tab, and your drones will work twice as hard.",
    when: (g) => g.state.crystals >= MIKA.cost && Object.values(g.state.crew).every((l) => l === 0),
  },
  {
    id: 'lab',
    tab: 'lab',
    text: 'The Lab researches big upgrades over real time, even while you are away. Start a project!',
    when: (g) => g.state.stats.upgradesBought >= 3 && g.state.research.done.size === 0 && !g.state.research.active,
  },
  {
    id: 'cores',
    tab: 'cores',
    text: 'We can relocate to a new sector now! You start over, but Star Cores make everything faster for good. Take a look.',
    when: (g) => eco.claimableCores(g.state) >= 1 && g.state.cores === 0,
  },
];

/**
 * The first-time tutorial. Mika walks the player through tapping, building, upgrades,
 * Overdrive, crates, missions and the panel, dimming everything but the thing to touch.
 * Afterwards she pops up once for each system as it unlocks.
 */
export class Coach {
  private shownKey = '';
  /** Where the tutorial's crate is on screen, if the graphics are running. */
  crate: (() => { x: number; y: number } | null) | null = null;

  constructor(private game: Game) {
    $('coach-face').innerHTML = portrait(MIKA);
    $('coach-skip').addEventListener('click', () => {
      const tip = this.tip();
      if (tip) this.game.seeTip(tip.id);
      else this.game.endTutorial();
      this.render();
    });
    $('coach-next').addEventListener('click', () => {
      const tip = this.tip();
      if (tip) this.game.seeTip(tip.id);
      else if (this.game.tutorialStep) this.game.advanceTutorial(this.game.tutorialStep);
      this.render();
    });
    $('missions-btn').addEventListener('click', () => this.game.advanceTutorial('missions'));
    const grabbed = () => this.game.advanceTutorial('panel');
    $('grabber').addEventListener('pointerup', grabbed);
    $('grabber').addEventListener('keydown', grabbed);
  }

  /** Called when the player opens a panel tab. */
  tabOpened(tab: string): void {
    if (tab === 'upgrades') this.game.advanceTutorial('upgradeTab');
    const tip = this.tip();
    if (tip && tip.tab === tab) this.game.seeTip(tip.id);
  }

  private tip() {
    if (this.game.state.tutorial >= 0) return null;
    return TIPS.find((t) => !this.game.state.tips.has(t.id) && t.when(this.game)) ?? null;
  }

  private step(): CoachStep | null {
    const s = this.game.state;
    switch (this.game.tutorialStep) {
      case 'welcome':
        return {
          text: "Welcome aboard, captain! I'm Mika. This old station isn't much yet, but the orbit is full of scrap. Let me show you the ropes.",
          next: "Let's go",
        };
      case 'tap':
        return { text: 'Tap the station to salvage scrap. Tap, tap, tap!', target: '#stage', progress: [Math.min(s.taps, TUTORIAL_TAPS), TUTORIAL_TAPS] };
      case 'drone': {
        const cost = eco.costFor(GENERATORS[0], s.owned.drone, 1, eco.costDiscount(s)).toNumber();
        if (s.scrap.lt(cost)) return { text: `A Salvage Drone costs ${Math.ceil(cost)} scrap. Keep tapping!`, target: '#stage', progress: [Math.floor(s.scrap.toNumber()), Math.ceil(cost)] };
        return { text: 'Nice haul! Build a Salvage Drone. It salvages for you, even while you are away.', target: '#gen-list .gen:first-child .buy', tab: 'build' };
      }
      case 'more':
        return {
          text: 'Drones add up fast. Build a few more. Tip: hold the button down to keep buying.',
          target: '#gen-list .gen:first-child .buy',
          tab: 'build',
          progress: [Math.min(s.owned.drone, TUTORIAL_DRONES), TUTORIAL_DRONES],
        };
      case 'upgradeTab':
        if ($('upgrade-dot').hidden) return { text: "Keep tapping and building. I'll shout when an upgrade is ready." };
        return { text: 'An upgrade is ready! Open the Upgrades tab.', target: '.tab[data-tab="upgrades"]' };
      case 'upgrade':
        return {
          text: 'Upgrades make your machines much stronger. Install one!',
          target: document.querySelector('#upgrade-list .upg.can .buy') ? '#upgrade-list .upg.can .buy' : '#upgrade-list .upg .buy',
          tab: 'upgrades',
        };
      case 'boost':
        return { text: 'Overdrive doubles everything for a short burst. Give it a tap!', target: '#boost' };
      case 'crate': {
        // Without graphics there is no crate to tap, so just explain it.
        if (!this.crate) return { text: 'Salvage crates drift past now and then. Tap one before it floats away for a big bonus.', next: 'Will do' };
        return { text: 'A salvage crate! Tap it before it floats away for a big bonus.', target: '@crate' };
      }
      case 'missions':
        return { text: 'Your mission board has daily goals that pay crystals. Have a look.', target: '#missions-btn' };
      case 'panel':
        return { text: 'Tap this handle to make the panel bigger or smaller. You can drag it too.', target: '#grabber' };
      case 'done':
        return {
          text: "That's the basics, captain! Crew, research and new sectors open up as you go. I'll pop by when there's something new.",
          next: "Let's salvage!",
        };
      default:
        return null;
    }
  }

  render(): void {
    const coach = $('coach');
    const spot = $('coach-spot');
    const dim = $('coach-dim');
    const s = this.game.state;
    const tip = this.tip();
    let def = tip ? { text: tip.text, target: `.tab[data-tab="${tip.tab}"]`, next: 'Got it' } : this.step();
    // Never sit on top of a pop-up such as the welcome-back screen.
    const modalOpen = [...document.querySelectorAll<HTMLElement>('.modal')].some((m) => !m.hidden);
    if (!def || modalOpen) {
      coach.hidden = spot.hidden = dim.hidden = true;
      this.shownKey = '';
      return;
    }
    // A target inside a closed tab: point at the tab first.
    if (def.tab && $(`tab-${def.tab}`).hidden) def = { text: `Open the ${TAB_NAMES[def.tab]} tab.`, target: `.tab[data-tab="${def.tab}"]` };
    if (this.game.tutorialStep === 'upgradeTab' && !$('tab-upgrades').hidden) this.game.advanceTutorial('upgradeTab');

    // '@crate' follows the drifting crate rather than an element.
    const crate = def.target === '@crate' ? this.crate?.() : null;
    const target = crate ? { getBoundingClientRect: () => ({ left: crate.x - 36, top: crate.y - 36, width: 72, height: 72 }) } : def.target && def.target !== '@crate' ? document.querySelector<HTMLElement>(def.target) : null;
    const key = `${tip?.id ?? s.tutorial}|${def.text}`;
    if (key !== this.shownKey) {
      this.shownKey = key;
      setText($('coach-text'), def.text);
      const next = $('coach-next');
      next.hidden = !def.next;
      setText(next, def.next ?? '');
      const skip = $('coach-skip');
      // The last tutorial card and tips have only one button.
      skip.hidden = !!tip || this.game.tutorialStep === 'done';
      setText(skip, 'Skip tutorial');
      setText($('coach-count'), tip ? 'New!' : `${s.tutorial + 1} / ${TUTORIAL.length}`);
      coach.hidden = false;
      // Replays the pop-in animation for each new card.
      coach.classList.remove('pop');
      void coach.offsetWidth;
      coach.classList.add('pop');
    }
    const bar = $('coach-bar');
    bar.hidden = !def.progress;
    if (def.progress) (bar.firstElementChild as HTMLElement).style.width = `${Math.min(100, (def.progress[0] / def.progress[1]) * 100)}%`;

    const w = Math.min(320, window.innerWidth - 32);
    coach.style.width = `${w}px`;
    const centred = !target || !def.target;
    coach.classList.toggle('centre', centred);
    // The welcome and goodbye cards dim the screen and wait for their button.
    dim.hidden = !(centred && def.next && !tip);
    if (centred) {
      spot.hidden = true;
      coach.style.left = `${(window.innerWidth - w) / 2}px`;
      const stage = $('stage').getBoundingClientRect();
      // A card with nothing to press waits at the top of the view, clear of the station.
      const top = def.next ? stage.top + stage.height / 2 - coach.offsetHeight / 2 : stage.top + 8;
      coach.style.top = `${Math.max(16, top)}px`;
      delete coach.dataset.place;
      return;
    }
    const r = target!.getBoundingClientRect();
    const isStage = def.target === '#stage';
    spot.classList.toggle('chase', !!crate);
    // The stage gets a soft ring around the station; anything else gets a snug cut-out.
    const pad = isStage ? 0 : 6;
    const sr = isStage
      ? (() => {
          const d = Math.min(r.width, r.height) * 0.62;
          return { left: r.left + r.width / 2 - d / 2, top: r.top + r.height / 2 - d / 2, width: d, height: d };
        })()
      : { left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
    spot.hidden = false;
    spot.classList.toggle('round', isStage || !!crate);
    spot.style.left = `${sr.left}px`;
    spot.style.top = `${sr.top}px`;
    spot.style.width = `${sr.width}px`;
    spot.style.height = `${sr.height}px`;
    if (crate) {
      // The crate moves, so the card stays put at the top of the view.
      const stage = $('stage').getBoundingClientRect();
      coach.style.left = `${(window.innerWidth - w) / 2}px`;
      coach.style.top = `${stage.top + 8}px`;
      delete coach.dataset.place;
      coach.classList.add('centre');
      return;
    }
    const left = Math.max(16, Math.min(window.innerWidth - w - 16, sr.left + sr.width / 2 - w / 2));
    coach.style.left = `${left}px`;
    coach.style.setProperty('--arrow', `${Math.max(24, Math.min(w - 24, sr.left + sr.width / 2 - left))}px`);
    const below = isStage || sr.top + sr.height / 2 < window.innerHeight / 2;
    coach.dataset.place = below ? 'below' : 'above';
    const top = below ? sr.top + sr.height + 14 : sr.top - coach.offsetHeight - 14;
    coach.style.top = `${Math.max(8, Math.min(window.innerHeight - coach.offsetHeight - 8, top))}px`;
  }
}
