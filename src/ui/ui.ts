import { ACHIEVEMENTS, type AchievementDef } from '../core/achievements';
import { ACHIEVEMENT_BONUS, BOOST, CLAW, CORE_PERKS, GENERATORS, UPGRADES, type GeneratorId, type PerkId, type UpgradeDef } from '../core/config';
import * as eco from '../core/economy';
import { bestPurchase, goalByKey, goalProgress, pickGoal, type Purchase } from '../core/advisor';
import { CREW, PETS, RESEARCH, sectorFor } from '../core/content';
import { CHALLENGES, LOOT, MODULES } from '../core/expansion';
import { D, Decimal, format, formatDuration, type NumberStyle } from '../core/num';
import type { Game } from '../game';
import { GEN_ICONS, ICONS } from './icons';
import { holdToRepeat, makePanelToggle, type PanelToggle } from './gestures';
import { InfoSheet } from './info';
import { LootShelf, ModulePanel, TripPanel, renderGoldenBanner } from './expansion-ui';
import { SETS } from '../core/collection';
import { BookPanel, SafeGame, SkinPanel } from './book-ui';
import { ChallengePanel, TraderPanel, offlineReportHtml } from './trade-ui';
import { GalaxyPanel } from './galaxy-ui';
import { currentSector } from '../core/sectors';
import { rigUrl } from '../scene/art';
import { ALL_PANES, GROUPS, groupOf } from './panes';
import * as meta from '../core/meta';
import { STAR_NODES } from '../core/galaxy';
import type { OfflineReport } from '../game';
import { Coach, CrewPanel, DecorPanel, OrnamentPanel, LabPanel, MissionsPanel, PetPanel, StreakModal, renderBossBanner, renderEventBanner } from './meta-ui';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** Each tab's accent colour, worn by the open panel and the dock marker. */
const TAB_ACCENT: Record<string, string> = {
  build: '#4fe3c1',
  upgrades: '#ffd166',
  crew: '#ff8a4c',
  lab: '#7aa7ff',
  cores: '#c58cff',
  station: '#ff7bb0',
  galaxy: '#ffe9a8',
};

/** Fills every `data-icon="name"` placeholder in the static HTML. */
function fillIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    const name = el.dataset.icon as keyof typeof ICONS;
    if (ICONS[name]) el.innerHTML = ICONS[name];
  });
}

function upgradeArt(u: UpgradeDef): { icon: string; color: string } {
  const e = u.effects[0];
  if (e.kind === 'genMult') {
    const g = GENERATORS.find((x) => x.id === e.gen)!;
    return { icon: GEN_ICONS[e.gen], color: hex(g.color) };
  }
  if (e.kind === 'allMult') return { icon: ICONS.star, color: '#ffd166' };
  return { icon: ICONS.claw, color: '#9aa6ff' };
}

const PERK_ICONS: Record<PerkId, string> = {
  headstart: GEN_ICONS.drone,
  longshift: ICONS.station,
  longboost: ICONS.bolt.replace('currentColor', '#ff6b9a'),
  autobuy: GEN_ICONS.fabricator,
  magnet: ICONS.scrap,
  seedfund: ICONS.star,
};

function achievementIcon(a: AchievementDef): string {
  if (a.id.startsWith('own50-')) return GEN_ICONS[a.id.slice(6) as GeneratorId];
  if (a.id.startsWith('taps')) return ICONS.claw;
  if (a.id.startsWith('earn') || a.id.startsWith('rate') || a.id.startsWith('crate')) return ICONS.scrap;
  if (a.id.startsWith('boost')) return ICONS.bolt.replace('currentColor', '#ff6b9a');
  if (a.id.startsWith('relocate')) return ICONS.core;
  if (a.id.startsWith('galaxy') || a.id === 'starmap') return ICONS.star;
  return ICONS.star;
}

const setText = (el: HTMLElement, text: string) => {
  if (el.textContent !== text) el.textContent = text;
};

interface GenRow {
  li: HTMLLIElement;
  count: HTMLElement;
  rate: HTMLElement;
  bar: HTMLElement;
  milestone: HTMLElement;
  btn: HTMLButtonElement;
  btnCount: HTMLElement;
  btnCost: HTMLElement;
}

/** The HTML half of the game: readout, build list, upgrades, station stats and settings. */
export class UI {
  private rows = new Map<GeneratorId, GenRow>();
  private upgradeKey = '';
  private perkKey = '';
  private achKey = '';
  private achButtons = new Map<string, HTMLButtonElement>();
  private shown: Decimal = D(0);
  private lastScrapText = '';
  private fmt = (v: Parameters<typeof format>[0]) => format(v, this.game.state.settings.numbers);
  private crew: CrewPanel;
  private lab: LabPanel;
  private decor: DecorPanel;
  private ornaments: OrnamentPanel;
  readonly missions: MissionsPanel;
  readonly coach: Coach;
  private pets: PetPanel;
  private modules: ModulePanel;
  private trips: TripPanel;
  private lootShelf: LootShelf;
  private info: InfoSheet;
  private trader: TraderPanel;
  private book: BookPanel;
  private skins: SkinPanel;
  safeGame!: SafeGame;
  private challenges: ChallengePanel;
  private galaxy: GalaxyPanel;
  private panel!: PanelToggle;
  readonly streak: StreakModal;

  /** Called when the sound or music setting changes, so main can update the synth. */
  onSoundChange: ((sfx: number, music: number) => void) | null = null;
  onComfortChange: ((reduceFlash: boolean, reduceShake: boolean) => void) | null = null;
  /** Called after the player confirms a relocation. */
  onRelocate: (() => void) | null = null;

  constructor(private game: Game) {
    fillIcons();
    this.shown = game.state.scrap;
    this.buildGenerators();
    this.bindTabs();
    this.bindBuyModes();
    this.bindSettings();
    this.bindRelocate();
    this.buildAchievements();
    this.bindSegments();
    this.crew = new CrewPanel(game);
    this.lab = new LabPanel(game);
    this.decor = new DecorPanel(game);
    this.ornaments = new OrnamentPanel(game);
    this.missions = new MissionsPanel(game, this.fmt);
    this.coach = new Coach(game);
    this.pets = new PetPanel(game);
    this.modules = new ModulePanel(game);
    this.trips = new TripPanel(game, this.fmt);
    this.lootShelf = new LootShelf(game);
    this.info = new InfoSheet(game, this.fmt);
    this.trader = new TraderPanel(game, this.fmt);
    this.book = new BookPanel(game);
    this.skins = new SkinPanel(game);
    this.challenges = new ChallengePanel(game, this.fmt);
    this.galaxy = new GalaxyPanel(game);
    $('rate-btn').addEventListener('click', () => this.info.open({ kind: 'income' }));
    this.streak = new StreakModal(game, this.fmt);
    $('boost').addEventListener('click', () => game.boost());
    holdToRepeat($('claw-buy') as HTMLButtonElement, () => game.levelClaw());
    $('rig-buy').addEventListener('click', () => game.buildRig());
    holdToRepeat($('best-buy') as HTMLButtonElement, () => {
      game.buyBest();
      this.renderBest();
    });
    $('goal').addEventListener('click', () => {
      const goal = this.goalKey ? goalByKey(game.state, this.goalKey) : null;
      if (!goal) return;
      this.openPane(goal.pane);
      // Wait for the menu to finish opening, then bring the goal's row into view and light it up.
      window.setTimeout(() => this.spotlight(goal.key), 280);
    });
  }

  private buildGenerators(): void {
    const list = $('gen-list');
    for (const g of GENERATORS) {
      const li = document.createElement('li');
      li.className = 'gen';
      li.style.setProperty('--c', hex(g.color));
      li.innerHTML = `
        <button class="gen-icon" type="button" aria-label="About ${g.name}">${GEN_ICONS[g.id]}<span class="gen-count">0</span><span class="info-dot">i</span></button>
        <div class="gen-info">
          <div class="gen-name"></div>
          <div class="gen-rate"></div>
          <div class="bar"><i></i></div>
          <div class="milestone"></div>
        </div>
        <button class="buy" type="button"><span class="buy-count"></span><span class="buy-cost"><span data-icon="scrap"></span><span class="n"></span></span></button>`;
      fillIcons(li);
      li.querySelector('.gen-name')!.textContent = g.name;
      const row: GenRow = {
        li,
        count: li.querySelector('.gen-count')!,
        rate: li.querySelector('.gen-rate')!,
        bar: li.querySelector('.bar > i')!,
        milestone: li.querySelector('.milestone')!,
        btn: li.querySelector('.buy')!,
        btnCount: li.querySelector('.buy-count')!,
        btnCost: li.querySelector('.buy-cost .n')!,
      };
      holdToRepeat(row.btn, () => this.game.buy(g.id));
      li.querySelector('.gen-icon')!.addEventListener('click', () => this.info.open({ kind: 'machine', id: g.id }));
      list.appendChild(li);
      this.rows.set(g.id, row);
    }
  }

  /** Flashes a machine row after a purchase. */
  flashRow(id: GeneratorId | 'claw'): void {
    const li = id === 'claw' ? $('claw-row') : this.rows.get(id)!.li;
    li.classList.remove('flash');
    void li.offsetWidth;
    li.classList.add('flash');
  }

  private bindTabs(): void {
    this.panel = makePanelToggle($('app'), document.querySelector<HTMLElement>('.tabs')!, $('hud'), $('menu-btn'));
    // The square: one tap opens the menu where it was left, the next tap hides it.
    $('menu-btn').addEventListener('click', () => {
      if (this.panel.open) {
        this.panel.set(false);
        this.coach.panelHidden();
      } else {
        const tab = document.querySelector<HTMLButtonElement>('.tab[aria-selected="true"]');
        this.openTab(tab?.dataset.tab ?? 'build');
      }
    });
    document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) =>
      tab.addEventListener('click', () => {
        // One tap does it all: the open tab hides the panel, any other tab opens it.
        if (tab.getAttribute('aria-selected') === 'true' && this.panel.open) {
          this.panel.set(false);
          this.coach.panelHidden();
        } else this.openTab(tab.dataset.tab!);
      }),
    );
  }

  /** The pane each tab showed last, so a tab reopens where the player left it. */
  private lastPane: Record<string, string> = {};

  /** Opens a bottom-bar tab at the pane it showed last. */
  private openTab(group: string): void {
    this.openPane(this.lastPane[group] ?? GROUPS[group][0]);
  }

  /** Opens one pane, and the tab that holds it. */
  private openPane(pane: string): void {
    const group = groupOf(pane);
    this.lastPane[group] = pane;
    document.querySelectorAll<HTMLButtonElement>('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === group)));
    for (const p of ALL_PANES) $(`tab-${p}`).hidden = p !== pane;
    document.querySelectorAll<HTMLElement>('.pane-seg').forEach((bar) => {
      bar.hidden = bar.dataset.group !== group;
      bar.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pane === pane)));
    });
    if (TAB_ACCENT[pane]) $('app').style.setProperty('--accent', TAB_ACCENT[pane]);
    this.panel.set(true);
    this.coach.tabOpened(pane);
    this.render();
  }

  private bindBuyModes(): void {
    const buttons = document.querySelectorAll<HTMLButtonElement>('.buy-modes button');
    buttons.forEach((b) =>
      b.addEventListener('click', () => {
        const m = b.dataset.mode!;
        this.game.buyMode = m === 'max' ? 'max' : (Number(m) as 1 | 10 | 100);
        buttons.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        this.render();
      }),
    );
  }

  /** The machine sheet, for a machine held down on the station. */
  openMachine(id: GeneratorId): void {
    this.info.open({ kind: 'machine', id });
  }

  /** The trader's deals, for a tap on the docked ship. */
  openTrader(): void {
    if (!$('trader-banner').hidden) this.trader.open();
  }

  /** Opens a panel tab from code (the tutorial uses it). */
  showTab(name: string): void {
    this.openPane(name);
  }

  private bindSegments(): void {
    document.querySelectorAll<HTMLButtonElement>('.pane-seg button').forEach((b) => b.addEventListener('click', () => this.openPane(b.dataset.pane!)));
    // Each tab's segment bar switches only its own sections.
    document.querySelectorAll<HTMLButtonElement>('.segments:not(.pane-seg) button').forEach((b) =>
      b.addEventListener('click', () => {
        b.parentElement!.querySelectorAll<HTMLButtonElement>('button').forEach((x) => {
          x.setAttribute('aria-selected', String(x === b));
          $(`seg-${x.dataset.seg}`).hidden = x !== b;
        });
        this.render();
      }),
    );
  }

  private bindRelocate(): void {
    const confirm = $('relocate-confirm');
    $('relocate').addEventListener('click', () => (confirm.hidden = false));
    $('relocate-no').addEventListener('click', () => (confirm.hidden = true));
    $('relocate-yes').addEventListener('click', () => {
      confirm.hidden = true;
      this.onRelocate?.();
      this.shown = this.game.state.scrap;
      this.upgradeKey = '';
      this.render();
    });
  }

  private buildAchievements(): void {
    const grid = $('ach-grid');
    const caption = $('ach-caption');
    for (const a of ACHIEVEMENTS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ach';
      b.innerHTML = achievementIcon(a);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        this.achButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        const got = this.game.state.achievements.has(a.id);
        caption.innerHTML = `<b></b> ${got ? '(earned)' : ''}<br>`;
        caption.querySelector('b')!.textContent = a.name;
        caption.append(a.desc);
      });
      grid.appendChild(b);
      this.achButtons.set(a.id, b);
    }
  }

  private bindSettings(): void {
    const settings = () => this.game.state.settings;
    const hap = $<HTMLInputElement>('opt-haptics');
    const sfxVol = $<HTMLInputElement>('opt-sfx-vol');
    const musVol = $<HTMLInputElement>('opt-music-vol');
    const flash = $<HTMLInputElement>('opt-flash');
    const shake = $<HTMLInputElement>('opt-shake');
    const auto = $<HTMLInputElement>('opt-auto');
    const nums = document.querySelectorAll<HTMLButtonElement>('#opt-numbers button');
    const pct = (v: number) => (v > 0 ? `${Math.round(v * 100)}%` : 'Off');
    const sync = () => {
      const o = settings();
      auto.checked = o.autoBuy;
      hap.checked = o.haptics;
      sfxVol.value = String(Math.round(o.sfxVol * 100));
      musVol.value = String(Math.round(o.musicVol * 100));
      setText($('opt-sfx-val'), pct(o.sfxVol));
      setText($('opt-music-val'), pct(o.musicVol));
      flash.checked = o.reduceFlash;
      shake.checked = o.reduceShake;
      document.body.classList.toggle('reduce-flash', o.reduceFlash);
      document.body.classList.toggle('reduce-shake', o.reduceShake);
      nums.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.num === o.numbers)));
      this.onSoundChange?.(o.sfxVol, o.musicVol);
      this.onComfortChange?.(o.reduceFlash, o.reduceShake);
    };
    this.syncSettings = sync;
    sync();
    $('settings-btn').addEventListener('click', () => {
      sync();
      $('settings').hidden = false;
    });
    const closeSettings = () => {
      $('settings').hidden = true;
      $('reset-confirm').hidden = true;
    };
    $('settings-close').addEventListener('click', closeSettings);
    $('settings').addEventListener('click', (e) => {
      if (e.target === $('settings')) closeSettings();
    });
    nums.forEach((b) =>
      b.addEventListener('click', () => {
        settings().numbers = b.dataset.num as NumberStyle;
        this.upgradeKey = '';
        sync();
        this.render();
      }),
    );
    hap.addEventListener('change', () => (settings().haptics = hap.checked));
    auto.addEventListener('change', () => (settings().autoBuy = auto.checked));
    const volume = (input: HTMLInputElement, key: 'sfxVol' | 'musicVol', flag: 'sound' | 'music') =>
      input.addEventListener('input', () => {
        settings()[key] = Number(input.value) / 100;
        settings()[flag] = settings()[key] > 0;
        sync();
      });
    volume(sfxVol, 'sfxVol', 'sound');
    volume(musVol, 'musicVol', 'music');
    flash.addEventListener('change', () => {
      settings().reduceFlash = flash.checked;
      sync();
    });
    shake.addEventListener('change', () => {
      settings().reduceShake = shake.checked;
      sync();
    });
    $('replay-tutorial').addEventListener('click', () => {
      closeSettings();
      this.game.state.tutorial = 0;
      this.showTab('build');
    });
    const confirm = $('reset-confirm');
    $('reset').addEventListener('click', () => (confirm.hidden = false));
    $('reset-no').addEventListener('click', () => (confirm.hidden = true));
    $('reset-yes').addEventListener('click', () => {
      confirm.hidden = true;
      this.game.reset();
      this.shown = D(0);
      this.upgradeKey = '';
      sync();
    });
  }

  syncSettings: () => void = () => {};

  /** Every frame: the scrap counter rolls toward the real value. */
  renderHud(dt: number): void {
    const s = this.game.state;
    const target = s.scrap;
    if (target.lt(this.shown) || target.sub(this.shown).lt(1)) {
      this.shown = target;
    } else {
      this.shown = this.shown.add(target.sub(this.shown).mul(Math.min(1, dt * 12)));
    }
    const text = this.fmt(this.shown);
    if (text !== this.lastScrapText) {
      this.lastScrapText = text;
      $('scrap').textContent = text;
    }
  }

  /**
   * Sends a glowing orb from a bought machine's card up to the station, which calls `land` as it
   * arrives. At most a few fly at once, so Max buys don't flood the screen.
   */
  flyToStation(id: GeneratorId, color: string, to: { x: number; y: number } | null, land: () => void): void {
    const row = this.rows.get(id);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!row || !to || reduce || this.flying >= 3 || row.li.offsetParent === null) return land();
    const from = row.li.querySelector('.gen-icon')!.getBoundingClientRect();
    // Only from a card the player can see: not one scrolled out of the sheet.
    const view = row.li.offsetParent.getBoundingClientRect();
    if (from.top < view.top || from.bottom > view.bottom) return land();
    const x0 = from.left + from.width / 2;
    const y0 = from.top + from.height / 2;
    const orb = document.createElement('div');
    orb.className = 'fly-orb';
    orb.style.setProperty('--c', color);
    document.body.appendChild(orb);
    this.flying++;
    // A gentle arc: out to the side a little, then into the hub.
    const mx = (x0 + to.x) / 2 + (x0 < to.x ? -40 : 40);
    const my = Math.min(y0, to.y) - 30;
    const anim = orb.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(0.6)`, opacity: 0.2 },
        { transform: `translate(${mx}px, ${my}px) scale(1.15)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${to.x}px, ${to.y}px) scale(0.5)`, opacity: 0.9 },
      ],
      { duration: 520, easing: 'cubic-bezier(0.45, 0, 0.6, 1)' },
    );
    const done = () => {
      orb.remove();
      this.flying--;
      land();
    };
    anim.onfinish = done;
    anim.oncancel = done;
  }
  private flying = 0;

  /** A big one-off gain (crate, boss, safe): a gold "+X" lifts off the counter and it glows. */
  bigGain(amount: Decimal): void {
    const el = $('scrap');
    const r = el.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'gain-pop';
    pop.textContent = `+${this.fmt(amount)}`;
    pop.style.left = `${r.left + r.width / 2}px`;
    pop.style.top = `${r.bottom}px`;
    document.body.appendChild(pop);
    window.setTimeout(() => pop.remove(), 1400);
    el.classList.remove('glow');
    void el.offsetWidth;
    el.classList.add('glow');
  }

  /** Pops the scrap counter, for taps. */
  bumpScrap(): void {
    const el = $('scrap');
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  /** Refreshes every other number. Cheap enough to call ~10 times a second. */
  render(): void {
    const s = this.game.state;
    const now = Date.now();
    setText($('rate'), this.fmt(eco.income(s, now)));
    this.renderBoost(now);
    this.renderGoal();
    if (!$('tab-build').hidden) this.renderGenerators();
    this.renderUpgrades();
    this.renderCores();
    setText($('crystals'), s.crystals.toLocaleString('en-US'));
    const petsReady = this.pets.anyAffordable();
    $('pets-dot').hidden = !petsReady;
    const tripsReady = this.trips.anyReady();
    $('trips-dot').hidden = !tripsReady;
    $('crew-dot').hidden = !this.crew.anyAffordable() && !petsReady && !tripsReady;
    $('lab-dot').hidden = !this.lab.idle();
    if (!$('tab-crew').hidden) {
      if (!$('seg-crewlist').hidden) this.crew.render();
      else if (!$('seg-trips').hidden) this.trips.render();
      else this.pets.render();
    }
    if (!$('tab-lab').hidden) this.lab.render();
    // Tab dots gather their panes' dots.
    $('build-dot').hidden = $('upgrade-dot').hidden;
    $('galaxy-dot').hidden = !(meta.galaxyOpen(s) && meta.starsOnShift(s) > 0) && !STAR_NODES.some((n) => !s.galaxy.map.has(n.id) && s.galaxy.stars >= n.cost);
    $('progress-dot').hidden = $('lab-dot').hidden && $('cores-dot').hidden && $('galaxy-dot').hidden;
    // With the menu hidden, the square carries a dot when any tab has something new.
    $('menu-dot').hidden = this.panel.open || ['build-dot', 'crew-dot', 'progress-dot', 'station-dot'].every((id) => $(id).hidden);
    if (!$('tab-station').hidden) {
      if (!$('seg-decor').hidden) {
        this.ornaments.render();
        this.decor.render();
        this.skins.render();
      }
      if (!$('seg-modules').hidden) this.modules.render();
      if (!$('seg-awards').hidden) {
        this.lootShelf.render();
        this.book.render();
        this.renderStats(now);
      }
    }
    this.missions.render();
    renderEventBanner(this.game);
    renderBossBanner(this.game);
    renderGoldenBanner(this.game);
    this.trader.render();
    this.safeGame?.render();
    this.challenges.render();
    this.galaxy.render();
    this.coach.render();
    this.info.render();
  }

  private renderCores(): void {
    const s = this.game.state;
    const claim = eco.claimableCores(s);
    const chip = $('cores-chip');
    chip.hidden = s.cores === 0;
    setText($('cores-n'), s.cores.toLocaleString('en-US'));
    // Nudge the player once a relocation would at least double their cores.
    $('cores-dot').hidden = !(claim > 0 && claim >= Math.max(1, s.cores));
    if ($('tab-cores').hidden) return;

    setText($('core-count'), s.cores.toLocaleString('en-US'));
    setText($('core-bonus'), `+${Math.round(s.cores * eco.perCoreBonus(s) * 100).toLocaleString('en-US')}% income`);
    setText($('core-claim'), claim.toLocaleString('en-US'));
    const next = eco.nextCoreAt(s);
    const prev = eco.lastCoreAt(s);
    const span = next.sub(prev);
    const pct = span.gt(0) ? Math.max(0, Math.min(1, s.allTime.sub(prev).div(span).toNumber())) : 0;
    $('core-bar').style.width = `${(pct * 100).toFixed(1)}%`;
    const nextHtml = `Next core at <b>${this.fmt(next)}</b> scrap salvaged (all time: ${this.fmt(s.allTime)})`;
    if ($('core-next').innerHTML !== nextHtml) $('core-next').innerHTML = nextHtml;
    $<HTMLButtonElement>('relocate').disabled = claim === 0;
    if (claim === 0) $('relocate-confirm').hidden = true;

    const key = CORE_PERKS.map((p) => eco.hasPerk(s, p.id)).join();
    if (key !== this.perkKey) {
      this.perkKey = key;
      const list = $('perk-list');
      list.replaceChildren();
      for (const p of CORE_PERKS) {
        const on = eco.hasPerk(s, p.id);
        const li = document.createElement('li');
        li.className = `perk${on ? ' on' : ''}`;
        li.innerHTML = `<div class="perk-icon">${PERK_ICONS[p.id]}</div><div><div class="perk-name"></div><div class="perk-desc"></div></div><div class="perk-at"></div>`;
        li.querySelector('.perk-name')!.textContent = p.name;
        li.querySelector('.perk-desc')!.textContent = p.desc;
        li.querySelector('.perk-at')!.textContent = on ? 'Active' : `${p.at} cores`;
        list.appendChild(li);
      }
    }
  }

  private renderBoost(now: number): void {
    const s = this.game.state;
    const btn = $('boost');
    const sub = $('boost-sub');
    let state: string;
    let p = 0;
    if (eco.boostActive(s, now)) {
      state = 'active';
      p = (s.boostUntil - now) / (eco.boostDurationSec(s) * 1000);
      setText(sub, `${Math.ceil((s.boostUntil - now) / 1000)}s left`);
    } else if (now < s.boostReadyAt) {
      state = 'cooldown';
      p = 1 - (s.boostReadyAt - now) / (BOOST.cooldownSec * 1000);
      setText(sub, `Ready in ${formatDuration((s.boostReadyAt - now) / 1000)}`);
    } else {
      state = 'ready';
      setText(sub, `${BOOST.mult}x for ${eco.boostDurationSec(s)}s`);
    }
    if (btn.dataset.state !== state) btn.dataset.state = state;
    btn.style.setProperty('--p', p.toFixed(3));
  }

  private rigLook = '';

  /** The sector's twist and rig, at the top of the Build tab, in the sectors that have them. */
  private renderSector(): void {
    const s = this.game.state;
    const sector = currentSector(s);
    const line = $('sector-line');
    const row = $('rig-row');
    line.hidden = !sector.twist || s.tutorial >= 0;
    row.hidden = !sector.rig || s.tutorial >= 0;
    if (line.hidden) return;
    const color = hex(sector.rig?.color ?? 0x9fe6ff);
    if (this.rigLook !== sector.name) {
      this.rigLook = sector.name;
      line.style.setProperty('--c', color);
      row.style.setProperty('--c', color);
      setText($('sector-line-where'), `Sector rule · ${sector.name}`);
      setText($('sector-line-name'), sector.twist!.name);
      setText($('sector-line-text'), sector.twist!.text);
      if (sector.rig) {
        ($('rig-img') as HTMLImageElement).src = rigUrl(sector.look!);
        setText($('rig-name'), sector.rig.name);
        setText($('rig-desc'), sector.rig.desc);
      }
    }
    if (row.hidden) return;
    const btn = $('rig-buy') as HTMLButtonElement;
    row.classList.toggle('built', s.rig);
    if (s.rig) {
      btn.disabled = true;
      setText($('rig-label'), 'Built');
      setText($('rig-cost'), '-');
      return;
    }
    const cost = eco.rigCost(s);
    btn.disabled = s.scrap.lt(cost);
    setText($('rig-label'), 'Build');
    setText($('rig-cost'), this.fmt(cost));
  }

  private renderClaw(): void {
    const s = this.game.state;
    const level = s.claw;
    setText($('claw-level'), String(level));
    const rate = `<b>+${this.fmt(eco.tapValue(s, Date.now()))}</b> / tap`;
    if ($('claw-rate').innerHTML !== rate) $('claw-rate').innerHTML = rate;
    const step = CLAW.doubleEvery;
    $('claw-bar').style.width = `${((level % step) / step) * 100}%`;
    const next = `Lv ${level} / ${(Math.floor(level / step) + 1) * step} <b>→ 2x taps</b>`;
    if ($('claw-next').innerHTML !== next) $('claw-next').innerHTML = next;
    const cost = eco.clawCost(s);
    ($('claw-buy') as HTMLButtonElement).disabled = s.scrap.lt(cost);
    setText($('claw-cost'), this.fmt(cost));
  }

  private goalKey = '';
  private spotTimer = 0;

  /** Scrolls the row that finishes a goal into the middle of its pane and makes it glow for a moment. */
  private spotlight(key: string): void {
    const [kind, id] = key.split(':');
    const el =
      kind === 'upg' ? document.querySelector<HTMLElement>(`#upgrade-list li[data-upg="${id}"]`)
      : kind === 'core' ? document.querySelector<HTMLElement>('#tab-cores .core-card')
      : this.rows.get(id as GeneratorId)?.li;
    const body = el?.closest<HTMLElement>('.tab-body');
    if (!el || !body || el.hidden || body.hidden) return;
    const r = el.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    body.scrollTo({ top: body.scrollTop + r.top - b.top - (body.clientHeight - r.height) / 2, behavior: 'smooth' });
    document.querySelectorAll('.spotlight').forEach((x) => x.classList.remove('spotlight'));
    void el.offsetWidth;
    el.classList.add('spotlight');
    clearTimeout(this.spotTimer);
    this.spotTimer = window.setTimeout(() => el.classList.remove('spotlight'), 2600);
  }

  /** The Next goal line: holds on to one goal until it is done, then picks the cheapest one left. */
  private renderGoal(): void {
    const s = this.game.state;
    const line = $('goal');
    line.hidden = s.tutorial >= 0;
    if (line.hidden) return;
    let goal = this.goalKey ? goalByKey(s, this.goalKey) : null;
    if (!goal) {
      if (this.goalKey) {
        line.classList.remove('done');
        void line.offsetWidth;
        line.classList.add('done');
      }
      goal = pickGoal(s);
      this.goalKey = goal?.key ?? '';
    }
    if (!goal) {
      line.hidden = true;
      return;
    }
    const p = goalProgress(s, goal);
    setText($('goal-text'), goal.text);
    $('goal-bar').style.width = `${p * 100}%`;
    $('goal-ready').hidden = p < 1 || goal.pane === 'cores';
  }

  /** The Buy best button: what it would buy, and whether it can yet. */
  private renderBest(): void {
    const s = this.game.state;
    const btn = $('best-buy') as HTMLButtonElement;
    btn.hidden = s.tutorial >= 0;
    if (btn.hidden) return;
    const p = bestPurchase(s);
    btn.disabled = !p || p.cost.gt(s.scrap);
    const what = !p ? 'Nothing left to buy' : p.gain.gt(0) ? `${this.purchaseText(p)} · +${this.fmt(p.gain)} / sec` : this.purchaseText(p);
    setText($('best-what'), what);
    setText($('best-cost'), p ? this.fmt(p.cost) : '-');
  }

  private purchaseText(p: Purchase): string {
    if (p.kind === 'upgrade') return UPGRADES.find((u) => u.id === p.id)!.name;
    const name = GENERATORS.find((g) => g.id === p.id)!.name;
    return p.count === 1 ? `1 ${name}` : `${p.count} ${name}s`;
  }

  private renderGenerators(): void {
    this.renderSector();
    this.renderClaw();
    this.renderBest();
    const s = this.game.state;
    let revealNext = true;
    let hidden = 0;
    for (const g of GENERATORS) {
      const row = this.rows.get(g.id)!;
      const owned = s.owned[g.id];
      // Show owned machines plus the next one up; the rest stay a mystery.
      const visible = owned > 0 || revealNext;
      if (owned === 0) revealNext = false;
      row.li.hidden = !visible;
      if (!visible) {
        hidden++;
        continue;
      }
      const quote = eco.purchaseQuote(s, g, this.game.buyMode);
      const affordable = quote.cost.lte(s.scrap);
      row.li.classList.toggle('locked', owned === 0 && !affordable);
      setText(row.count, String(owned));
      const rateHtml = owned > 0 ? `<b>+${this.fmt(eco.generatorRate(s, g))}</b> / sec` : g.blurb;
      if (row.rate.innerHTML !== rateHtml) row.rate.innerHTML = rateHtml;
      const next = eco.nextMilestone(owned);
      if (next) {
        const pct = ((owned - next.prev) / (next.at - next.prev)) * 100;
        row.bar.style.width = `${pct}%`;
        const html = `${owned} / ${next.at} <b>→ 2x output</b>`;
        if (row.milestone.innerHTML !== html) row.milestone.innerHTML = html;
      } else {
        row.bar.style.width = '100%';
        setText(row.milestone, 'All milestones reached');
      }
      row.btn.disabled = !affordable;
      setText(row.btnCount, this.game.buyMode === 'max' ? `Max ${quote.count}` : `Buy ${quote.count}`);
      setText(row.btnCost, this.fmt(quote.cost));
    }
    $('gen-hint').hidden = hidden === 0;
  }

  private renderUpgrades(): void {
    const s = this.game.state;
    const available = UPGRADES.filter((u) => !s.upgrades.has(u.id) && eco.upgradeVisible(s, u));
    const teaser = UPGRADES.find((u) => !s.upgrades.has(u.id) && !eco.upgradeVisible(s, u));
    $('upgrade-dot').hidden = !available.some((u) => s.scrap.gte(u.cost));
    if ($('tab-upgrades').hidden) return;

    // Rebuild only when the set of cards changes; otherwise just toggle buttons.
    const key = available.map((u) => u.id).join() + '|' + (teaser?.id ?? '') + '|' + s.settings.numbers;
    const list = $('upgrade-list');
    if (key !== this.upgradeKey) {
      this.upgradeKey = key;
      list.replaceChildren();
      for (const u of available) {
        const { icon, color } = upgradeArt(u);
        const li = document.createElement('li');
        li.className = 'upg';
        li.dataset.upg = u.id;
        li.style.setProperty('--c', color);
        li.innerHTML = `<div class="upg-icon">${icon}</div><div><div class="upg-name"></div><div class="upg-desc"></div></div>
          <button class="buy" type="button"><span class="buy-count">Install</span><span class="buy-cost"><span data-icon="scrap"></span><span class="n"></span></span></button>`;
        fillIcons(li);
        li.querySelector('.upg-name')!.textContent = u.name;
        li.querySelector('.upg-desc')!.textContent = u.desc;
        li.querySelector('.buy-cost .n')!.textContent = this.fmt(u.cost);
        const btn = li.querySelector<HTMLButtonElement>('.buy')!;
        btn.dataset.cost = String(u.cost);
        btn.addEventListener('click', () => this.game.buyUpgrade(u.id));
        list.appendChild(li);
      }
      if (teaser) {
        const li = document.createElement('li');
        li.className = 'upg teaser';
        const gen = GENERATORS.find((g) => g.id === teaser.requires.gen)!;
        li.innerHTML = `<div class="upg-icon">${ICONS.lock}</div><div><div class="upg-name">Locked upgrade</div><div class="upg-desc"></div></div>`;
        li.querySelector('.upg-desc')!.textContent = `Own ${teaser.requires.count} ${gen.name}s to reveal it.`;
        list.appendChild(li);
      }
      if (!available.length && !teaser) {
        list.innerHTML = '<li class="empty">Every upgrade is installed. More arrive with the next sector.</li>';
      }
    }
    list.querySelectorAll<HTMLButtonElement>('.buy').forEach((b) => {
      const can = s.scrap.gte(Number(b.dataset.cost));
      b.disabled = !can;
      b.closest('.upg')!.classList.toggle('can', can);
    });
  }

  private renderStats(now: number): void {
    const s = this.game.state;
    const n = (v: number) => v.toLocaleString('en-US');
    const sections: [string, [string, string][]][] = [
      ['This run', [
        ['Time this run', formatDuration(s.stats.runSec)],
        ['Scrap salvaged', this.fmt(s.lifetime)],
        ['Scrap per second', this.fmt(eco.baseIncome(s))],
        ['Scrap per tap', this.fmt(eco.tapValue(s, now))],
        ['Machines owned', n(Object.values(s.owned).reduce((a, b) => a + b, 0))],
        ['Upgrades installed', `${s.upgrades.size} of ${UPGRADES.length}`],
      ]],
      ['All time', [
        ['Time played', formatDuration(s.stats.playSec)],
        ['Scrap salvaged', this.fmt(s.allTime)],
        ['Best scrap per second', this.fmt(D(s.stats.bestIncome))],
        ['Taps', n(s.taps)],
        ['Machines built', n(s.stats.machines)],
        ['Crates grabbed', n(s.stats.crates)],
        ['Meteors smashed', n(s.stats.meteors)],
        ['Events seen', n(s.stats.events)],
        ['Overdrives fired', n(s.stats.boosts)],
        ['Relocations', n(s.stats.relocations)],
        ['Current sector', `${s.stats.relocations + 1}: ${sectorFor(s.stats.relocations).name}`],
      ]],
      ['Collection', [
        ['Crystals earned', n(s.stats.crystalsEarned)],
        ['Crew recruited', `${CREW.filter((c) => s.crew[c.id] > 0).length} of ${CREW.length}`],
        ['Research finished', `${s.research.done.size} of ${RESEARCH.length}`],
        ['Achievements', `${s.achievements.size} of ${ACHIEVEMENTS.length}`],
        ['Star Cores', n(s.cores)],
        ['Galaxy', `${n(s.galaxy.shifts + 1)} (${n(s.galaxy.earned)} stars earned)`],
        ['Boss loot found', `${s.loot.size} of ${LOOT.length}`],
        ['Station rooms built', `${s.modules.filter(Boolean).length} of ${s.modules.length}`],
        ['Blueprints found', `${s.blueprints.size} of ${MODULES.filter((m) => m.blueprint).length}`],
        ['Collections finished', `${s.setsDone.size} of ${SETS.length}`],
        ['Pets adopted', `${s.pets.owned.size} of ${PETS.length}`],
      ]],
      ['Adventures', [
        ['Boss wrecks broken', n(s.stats.bosses)],
        ['Golden rushes', n(s.stats.golden ?? 0)],
        ['Trader deals', n(s.stats.trades ?? 0)],
        ['Cargo safes tried', n(s.stats.safes ?? 0)],
        ['Challenges beaten', `${s.challengesDone.size} of ${CHALLENGES.length}`],
        ['Crew on trips now', n(s.trips.length)],
        ['Login streak', `${n(s.login.streak)} days (best ${n(s.login.best)})`],
      ]],
    ];
    const html = sections.map(([title, rows]) => `<dt class="stats-head">${title}</dt><dd class="stats-head"></dd>` + rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')).join('');
    const stats = $('stats');
    if (stats.innerHTML !== html) stats.innerHTML = html;

    const key = [...s.achievements].join();
    if (key !== this.achKey) {
      this.achKey = key;
      for (const [id, b] of this.achButtons) b.classList.toggle('on', s.achievements.has(id));
      const n = s.achievements.size;
      setText($('ach-sum'), `${n} of ${ACHIEVEMENTS.length} · +${Math.round(n * ACHIEVEMENT_BONUS * 100)}% income`);
    }
    $('opt-auto-row').hidden = !eco.hasPerk(s, 'autobuy');
  }

  showOffline(seconds: number, earned: Decimal, report: OfflineReport, onCollect: () => void): void {
    $('modal-report').innerHTML = offlineReportHtml(report);
    const modal = $('modal');
    const amount = $('modal-amount');
    const cap = eco.offlineCapSec(this.game.state);
    const capped = seconds >= cap - 1;
    $('modal-time').textContent = `Gone for ${formatDuration(seconds)}.${capped ? ` Earnings are capped at ${formatDuration(cap)} for now.` : ''}`;
    modal.hidden = false;
    // Count the amount up from zero.
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      const eased = 1 - Math.pow(1 - k, 3);
      amount.textContent = `+${this.fmt(earned.mul(eased))}`;
      if (k < 1 && !modal.hidden) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    $('modal-ok').onclick = () => {
      modal.hidden = true;
      onCollect();
    };
  }

  toast(icon: string, html: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span data-icon></span><span></span>`;
    el.firstElementChild!.innerHTML = icon;
    el.lastElementChild!.innerHTML = html;
    // Just under the HUD, whatever height the goal line gives it.
    $('toasts').style.top = `${Math.round($('hud').getBoundingClientRect().bottom + 6)}px`;
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 3) $('toasts').firstElementChild!.remove();
    setTimeout(() => el.remove(), 2900);
  }
}
