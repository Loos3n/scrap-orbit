import { BOOST, GENERATORS, OFFLINE_CAP_SEC, UPGRADES, type GeneratorId, type UpgradeDef } from '../core/config';
import * as eco from '../core/economy';
import { D, Decimal, format, formatDuration } from '../core/num';
import type { Game } from '../game';
import { GEN_ICONS, ICONS } from './icons';

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
  private shown: Decimal = D(0);
  private lastScrapText = '';
  private fmt = (v: Parameters<typeof format>[0]) => format(v, this.game.state.settings.scientific);

  /** Called when the sound setting changes, so main can mute the synth. */
  onSoundChange: ((on: boolean) => void) | null = null;

  constructor(private game: Game) {
    fillIcons();
    this.shown = game.state.scrap;
    this.buildGenerators();
    this.bindTabs();
    this.bindBuyModes();
    this.bindSettings();
    $('boost').addEventListener('click', () => game.boost());
  }

  private buildGenerators(): void {
    const list = $('gen-list');
    for (const g of GENERATORS) {
      const li = document.createElement('li');
      li.className = 'gen';
      li.style.setProperty('--c', hex(g.color));
      li.innerHTML = `
        <div class="gen-icon">${GEN_ICONS[g.id]}<span class="gen-count">0</span></div>
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
      row.btn.addEventListener('click', () => this.game.buy(g.id));
      list.appendChild(li);
      this.rows.set(g.id, row);
    }
  }

  /** Flashes a machine row after a purchase. */
  flashRow(id: GeneratorId): void {
    const li = this.rows.get(id)!.li;
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

  private bindSettings(): void {
    const settings = () => this.game.state.settings;
    const sci = $<HTMLInputElement>('opt-sci');
    const hap = $<HTMLInputElement>('opt-haptics');
    const snd = $<HTMLInputElement>('opt-sound');
    const soundBtn = $('sound');
    const sync = () => {
      sci.checked = settings().scientific;
      hap.checked = settings().haptics;
      snd.checked = settings().sound;
      soundBtn.innerHTML = settings().sound ? ICONS.soundOn : ICONS.soundOff;
      soundBtn.setAttribute('aria-label', settings().sound ? 'Mute sound' : 'Turn sound on');
      this.onSoundChange?.(settings().sound);
    };
    this.syncSettings = sync;
    sync();
    sci.addEventListener('change', () => {
      settings().scientific = sci.checked;
      this.upgradeKey = '';
    });
    hap.addEventListener('change', () => (settings().haptics = hap.checked));
    const setSound = (on: boolean) => {
      settings().sound = on;
      sync();
    };
    snd.addEventListener('change', () => setSound(snd.checked));
    soundBtn.addEventListener('click', () => setSound(!settings().sound));
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
    if (!$('tab-station').hidden) this.renderStats(now);
  }

  private renderBoost(now: number): void {
    const s = this.game.state;
    const btn = $('boost');
    const sub = $('boost-sub');
    let state: string;
    let p = 0;
    if (eco.boostActive(s, now)) {
      state = 'active';
      p = (s.boostUntil - now) / (BOOST.durationSec * 1000);
      setText(sub, `${Math.ceil((s.boostUntil - now) / 1000)}s left`);
    } else if (now < s.boostReadyAt) {
      state = 'cooldown';
      p = 1 - (s.boostReadyAt - now) / (BOOST.cooldownSec * 1000);
      setText(sub, `Ready in ${formatDuration((s.boostReadyAt - now) / 1000)}`);
    } else {
      state = 'ready';
      setText(sub, `${BOOST.mult}x for ${BOOST.durationSec}s`);
    }
    if (btn.dataset.state !== state) btn.dataset.state = state;
    btn.style.setProperty('--p', p.toFixed(3));
  }

  private renderGenerators(): void {
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
    const key = available.map((u) => u.id).join() + '|' + (teaser?.id ?? '') + '|' + s.settings.scientific;
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
    const rows: [string, string][] = [
      ['Scrap per tap', this.fmt(eco.tapValue(s, now))],
      ['Total scrap salvaged', this.fmt(s.lifetime)],
      ['Taps', s.taps.toLocaleString('en-US')],
      ['Machines built', Object.values(s.owned).reduce((a, b) => a + b, 0).toLocaleString('en-US')],
      ['Upgrades installed', `${s.upgrades.size} of ${UPGRADES.length}`],
    ];
    const html = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    const stats = $('stats');
    if (stats.innerHTML !== html) stats.innerHTML = html;
  }

  showOffline(seconds: number, earned: Decimal, onCollect: () => void): void {
    const modal = $('modal');
    const amount = $('modal-amount');
    const capped = seconds >= OFFLINE_CAP_SEC - 1;
    $('modal-time').textContent = `Gone for ${formatDuration(seconds)}.${capped ? ' Earnings are capped at 2 hours for now.' : ''}`;
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
