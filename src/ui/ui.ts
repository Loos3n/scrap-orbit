import { ACHIEVEMENTS, type AchievementDef } from '../core/achievements';
import { ACHIEVEMENT_BONUS, BOOST, CLAW, CORE_PERKS, GENERATORS, PRESTIGE, UPGRADES, type GeneratorId, type PerkId, type UpgradeDef } from '../core/config';
import * as eco from '../core/economy';
import { CREW, PETS, RESEARCH, sectorFor } from '../core/content';
import { LOOT, MODULES } from '../core/expansion';
import { D, Decimal, format, formatDuration, type NumberStyle } from '../core/num';
import type { Game } from '../game';
import { GEN_ICONS, ICONS } from './icons';
import { holdToRepeat, makePanelDraggable } from './gestures';
import { InfoSheet } from './info';
import { LootShelf, ModulePanel, TripPanel, renderGoldenBanner } from './expansion-ui';
import { Coach, CrewPanel, DecorPanel, LabPanel, MissionsPanel, PetPanel, StreakModal, renderBossBanner, renderEventBanner } from './meta-ui';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

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
  readonly missions: MissionsPanel;
  readonly coach: Coach;
  private pets: PetPanel;
  private modules: ModulePanel;
  private trips: TripPanel;
  private lootShelf: LootShelf;
  private info: InfoSheet;
  readonly streak: StreakModal;

  /** Called when the sound or music setting changes, so main can update the synth. */
  onSoundChange: ((sound: boolean, music: boolean) => void) | null = null;
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
    this.missions = new MissionsPanel(game, this.fmt);
    this.coach = new Coach(game);
    this.pets = new PetPanel(game);
    this.modules = new ModulePanel(game);
    this.trips = new TripPanel(game, this.fmt);
    this.lootShelf = new LootShelf(game);
    this.info = new InfoSheet(game, this.fmt);
    $('rate-btn').addEventListener('click', () => this.info.open({ kind: 'income' }));
    this.streak = new StreakModal(game, this.fmt);
    $('boost').addEventListener('click', () => game.boost());
    holdToRepeat($('claw-buy') as HTMLButtonElement, () => game.levelClaw());
    makePanelDraggable($('app'), $('panel'), $('grabber'), document.querySelector<HTMLElement>('.tabs'), $('hud'));
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
    const tabs = document.querySelectorAll<HTMLButtonElement>('.tab');
    tabs.forEach((tab) =>
      tab.addEventListener('click', () => {
        tabs.forEach((t) => {
          const on = t === tab;
          t.setAttribute('aria-selected', String(on));
          $(`tab-${t.dataset.tab}`).hidden = !on;
        });
        this.coach.tabOpened(tab.dataset.tab!);
        this.render();
      }),
    );
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

  /** Opens a panel tab from code (the tutorial uses it). */
  showTab(name: string): void {
    document.querySelector<HTMLButtonElement>(`.tab[data-tab="${name}"]`)?.click();
  }

  private bindSegments(): void {
    // Each tab's segment bar switches only its own sections.
    document.querySelectorAll<HTMLButtonElement>('.segments button').forEach((b) =>
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
    const snd = $<HTMLInputElement>('opt-sound');
    const mus = $<HTMLInputElement>('opt-music');
    const auto = $<HTMLInputElement>('opt-auto');
    const nums = document.querySelectorAll<HTMLButtonElement>('#opt-numbers button');
    const sync = () => {
      auto.checked = settings().autoBuy;
      hap.checked = settings().haptics;
      snd.checked = settings().sound;
      mus.checked = settings().music;
      nums.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.num === settings().numbers)));
      this.onSoundChange?.(settings().sound, settings().music);
    };
    this.syncSettings = sync;
    sync();
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
    snd.addEventListener('change', () => {
      settings().sound = snd.checked;
      sync();
    });
    mus.addEventListener('change', () => {
      settings().music = mus.checked;
      sync();
    });
    $('replay-tutorial').addEventListener('click', () => {
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
    if (!$('tab-station').hidden) {
      if (!$('seg-decor').hidden) this.decor.render();
      if (!$('seg-modules').hidden) this.modules.render();
      if (!$('seg-awards').hidden) this.lootShelf.render();
      this.renderStats(now);
    }
    this.missions.render();
    renderEventBanner(this.game);
    renderBossBanner(this.game);
    renderGoldenBanner(this.game);
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
    const prevTotal = Math.max(eco.coresForAllTime(s.allTime), s.cores);
    const prev = prevTotal > 0 ? D(prevTotal).pow(1 / PRESTIGE.exponent).mul(PRESTIGE.divisor) : D(0);
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

  private renderGenerators(): void {
    this.renderClaw();
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
        ['Boss loot found', `${s.loot.size} of ${LOOT.length}`],
        ['Station rooms built', `${s.modules.filter(Boolean).length} of ${s.modules.length}`],
        ['Blueprints found', `${s.blueprints.size} of ${MODULES.filter((m) => m.blueprint).length}`],
        ['Pets adopted', `${s.pets.owned.size} of ${PETS.length}`],
      ]],
      ['Adventures', [
        ['Boss wrecks broken', n(s.stats.bosses)],
        ['Golden rushes', n(s.stats.golden ?? 0)],
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

  showOffline(seconds: number, earned: Decimal, onCollect: () => void): void {
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
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 3) $('toasts').firstElementChild!.remove();
    setTimeout(() => el.remove(), 2900);
  }
}
