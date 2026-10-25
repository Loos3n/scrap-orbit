import { BOOST, GENERATORS, UPGRADES, type GeneratorId } from '../core/config';
import * as eco from '../core/economy';
import { format, formatDuration } from '../core/num';
import type { Game } from '../game';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

interface GenRow {
  li: HTMLLIElement;
  owned: HTMLElement;
  rate: HTMLElement;
  bar: HTMLElement;
  milestone: HTMLElement;
  btn: HTMLButtonElement;
  count: HTMLElement;
  cost: HTMLElement;
}

/** The HTML half of the game: readout, build list, upgrades, station stats and settings. */
export class UI {
  private rows = new Map<GeneratorId, GenRow>();
  private upgradeKey = '';
  private fmt = (v: Parameters<typeof format>[0]) => format(v, this.game.state.settings.scientific);

  constructor(private game: Game) {
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
        <div class="gen-icon" aria-hidden="true">0</div>
        <div class="gen-info">
          <div class="gen-name"></div>
          <div class="gen-rate"></div>
          <div class="bar"><i></i></div>
          <div class="milestone"></div>
        </div>
        <button class="buy" type="button"><span class="buy-count"></span><span class="buy-cost"></span></button>`;
      li.querySelector('.gen-name')!.textContent = g.name;
      const row: GenRow = {
        li,
        owned: li.querySelector('.gen-icon')!,
        rate: li.querySelector('.gen-rate')!,
        bar: li.querySelector('.bar > i')!,
        milestone: li.querySelector('.milestone')!,
        btn: li.querySelector('.buy')!,
        count: li.querySelector('.buy-count')!,
        cost: li.querySelector('.buy-cost')!,
      };
      row.btn.addEventListener('click', () => this.game.buy(g.id));
      list.appendChild(li);
      this.rows.set(g.id, row);
    }
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
      }),
    );
  }

  private bindSettings(): void {
    const sci = $<HTMLInputElement>('opt-sci');
    const hap = $<HTMLInputElement>('opt-haptics');
    const sync = () => {
      sci.checked = this.game.state.settings.scientific;
      hap.checked = this.game.state.settings.haptics;
    };
    sync();
    sci.addEventListener('change', () => (this.game.state.settings.scientific = sci.checked));
    hap.addEventListener('change', () => (this.game.state.settings.haptics = hap.checked));
    const confirm = $('reset-confirm');
    $('reset').addEventListener('click', () => (confirm.hidden = false));
    $('reset-no').addEventListener('click', () => (confirm.hidden = true));
    $('reset-yes').addEventListener('click', () => {
      confirm.hidden = true;
      this.game.reset();
      this.upgradeKey = '';
      sync();
    });
  }

  /** Refreshes every visible number. Cheap enough to call ~10 times a second. */
  render(): void {
    const s = this.game.state;
    const now = Date.now();
    $('scrap').textContent = this.fmt(s.scrap);
    $('rate').textContent = `${this.fmt(eco.income(s, now))} / sec`;
    this.renderBoost(now);
    this.renderGenerators();
    this.renderUpgrades();
    this.renderStats(now);
  }

  private renderBoost(now: number): void {
    const s = this.game.state;
    const btn = $('boost');
    const sub = $('boost-sub');
    if (eco.boostActive(s, now)) {
      btn.dataset.state = 'active';
      sub.textContent = `${Math.ceil((s.boostUntil - now) / 1000)}s left`;
    } else if (now < s.boostReadyAt) {
      btn.dataset.state = 'cooldown';
      sub.textContent = `Ready in ${formatDuration((s.boostReadyAt - now) / 1000)}`;
    } else {
      btn.dataset.state = 'ready';
      sub.textContent = `${BOOST.mult}x for ${BOOST.durationSec}s`;
    }
  }

  private renderGenerators(): void {
    const s = this.game.state;
    let revealNext = true;
    for (const g of GENERATORS) {
      const row = this.rows.get(g.id)!;
      const owned = s.owned[g.id];
      // Show owned generators plus the next one up; hide the rest until then.
      const visible = owned > 0 || revealNext;
      if (owned === 0) revealNext = false;
      row.li.hidden = !visible;
      if (!visible) continue;
      const quote = eco.purchaseQuote(s, g, this.game.buyMode);
      const affordable = quote.cost.lte(s.scrap);
      row.li.classList.toggle('locked', owned === 0 && !affordable);
      row.owned.textContent = String(owned);
      row.rate.textContent = owned > 0 ? `+${this.fmt(eco.generatorRate(s, g))} / sec` : g.blurb;
      const next = eco.nextMilestone(owned);
      if (next) {
        const pct = ((owned - next.prev) / (next.at - next.prev)) * 100;
        row.bar.style.width = `${pct}%`;
        row.milestone.textContent = `${owned} / ${next.at} for 2x output`;
      } else {
        row.bar.style.width = '100%';
        row.milestone.textContent = 'All milestones reached';
      }
      row.btn.disabled = !affordable;
      row.count.textContent = this.game.buyMode === 'max' ? `Max (${quote.count})` : `Buy ${quote.count}`;
      row.cost.textContent = this.fmt(quote.cost);
    }
  }

  private renderUpgrades(): void {
    const s = this.game.state;
    const available = UPGRADES.filter((u) => !s.upgrades.has(u.id) && eco.upgradeVisible(s, u));
    const teaser = UPGRADES.find((u) => !s.upgrades.has(u.id) && !eco.upgradeVisible(s, u));
    $('upgrade-dot').hidden = !available.some((u) => s.scrap.gte(u.cost));

    // Rebuild only when the set of cards changes; otherwise just toggle buttons.
    const key = available.map((u) => u.id).join() + '|' + (teaser?.id ?? '') + '|' + s.settings.scientific;
    const list = $('upgrade-list');
    if (key !== this.upgradeKey) {
      this.upgradeKey = key;
      list.replaceChildren();
      for (const u of available) {
        const li = document.createElement('li');
        li.className = 'upg';
        li.innerHTML = `<div><div class="upg-name"></div><div class="upg-desc"></div></div>
          <button class="buy" type="button"><span class="buy-count">Buy</span><span class="buy-cost"></span></button>`;
        li.querySelector('.upg-name')!.textContent = u.name;
        li.querySelector('.upg-desc')!.textContent = u.desc;
        li.querySelector('.buy-cost')!.textContent = this.fmt(u.cost);
        const btn = li.querySelector<HTMLButtonElement>('.buy')!;
        btn.dataset.cost = String(u.cost);
        btn.addEventListener('click', () => this.game.buyUpgrade(u.id));
        list.appendChild(li);
      }
      if (teaser) {
        const li = document.createElement('li');
        li.className = 'upg teaser';
        const gen = GENERATORS.find((g) => g.id === teaser.requires.gen)!;
        li.innerHTML = `<div><div class="upg-name">Locked upgrade</div><div class="upg-desc"></div></div>`;
        li.querySelector('.upg-desc')!.textContent = `Own ${teaser.requires.count} ${gen.name}s to reveal.`;
        list.appendChild(li);
      }
      if (!available.length && !teaser) {
        list.innerHTML = '<li class="empty">Every upgrade is installed. More arrive with the next sector.</li>';
      }
    }
    list.querySelectorAll<HTMLButtonElement>('.buy').forEach((b) => (b.disabled = s.scrap.lt(Number(b.dataset.cost))));
  }

  private renderStats(now: number): void {
    const stats = $('stats');
    if (stats.closest('[hidden]')) return;
    const s = this.game.state;
    const rows: [string, string][] = [
      ['Scrap per tap', this.fmt(eco.tapValue(s, now))],
      ['Total scrap salvaged', this.fmt(s.lifetime)],
      ['Taps', s.taps.toLocaleString('en-US')],
      ['Machines built', Object.values(s.owned).reduce((a, b) => a + b, 0).toLocaleString('en-US')],
      ['Upgrades installed', `${s.upgrades.size} of ${UPGRADES.length}`],
    ];
    stats.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }

  showOffline(seconds: number, amount: string): void {
    $('modal-amount').textContent = `+${amount}`;
    $('modal-time').textContent = `Gone for ${formatDuration(seconds)}. Offline earnings are capped at 2 hours for now.`;
    const modal = $('modal');
    modal.hidden = false;
    const close = () => (modal.hidden = true);
    $('modal-ok').onclick = close;
  }

  toast(html: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = html;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 2700);
  }
}
