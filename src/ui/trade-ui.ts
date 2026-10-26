import { CREW } from '../core/content';
import { CHALLENGES, CHALLENGE_CORES, LOOT, TRADER_NAMES, moduleDef, type Offer } from '../core/expansion';
import * as meta from '../core/meta';
import { D, formatDuration, type Decimal } from '../core/num';
import type { Game, OfflineReport } from '../game';
import { pressWatch } from './gestures';
import { ICONS } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const crystalCost = (n: number | string) => `<span class="cost-crystal">${ICONS.crystal}<span>${n}</span></span>`;
const setText = (el: HTMLElement, text: string) => {
  if (el.textContent !== text) el.textContent = text;
};
type Fmt = (v: Decimal | number) => string;

// ---------- Welcome-back report ----------

/** The lines under the offline earnings: what else happened while the player was away. */
export function offlineReportHtml(r: OfflineReport): string {
  const lines: [string, string][] = [];
  if (r.research) lines.push([ICONS.lab, `Research finished: <b>${esc(r.research)}</b>`]);
  if (r.trips.length) {
    const names = r.trips.map((id) => CREW.find((c) => c.id === id)?.name ?? id);
    lines.push([ICONS.crew, `<b>${esc(names.join(' and '))}</b> came back from ${r.trips.length > 1 ? 'their trips' : 'a trip'}. Open Crew, Trips for the haul`]);
  }
  if (r.trader) lines.push([ICONS.crystal, 'A trader is on the way with deals']);
  if (r.golden) lines.push([ICONS.star, 'Golden scrap is drifting nearby. Keep an eye out']);
  if (r.bossEscaped) lines.push([ICONS.warp, 'A boss wreck drifted off while you were gone']);
  if (r.mult > 1.001) lines.push([ICONS.scrap, `Offline bonuses gave you <b>x${(Math.round(r.mult * 100) / 100).toString()}</b>`]);
  return lines.map(([icon, html]) => `<li><span class="report-icon">${icon}</span><span>${html}</span></li>`).join('');
}

// ---------- Trading post ----------

function offerText(o: Offer, fmt: Fmt): { title: string; desc: string; icon: string } {
  switch (o.kind) {
    case 'crystals':
      return { title: `${o.amount} crystals`, desc: 'Swap some spare scrap for crystals.', icon: ICONS.crystal };
    case 'scrap':
      return { title: `${fmt(D(o.amount))} scrap`, desc: 'Half an hour of your income, right now.', icon: ICONS.scrap };
    case 'blueprint':
      return { title: 'Mystery blueprint', desc: 'A room plan you have not found yet.', icon: ICONS.station };
    case 'recall':
      return { title: 'Express recall', desc: 'Everyone on an expedition comes home now.', icon: ICONS.warp };
    case 'loot':
      return { title: 'Wreck part', desc: 'A piece of boss loot you are still missing.', icon: ICONS.star };
  }
}

/** The pill that says the trader is docked, and the deals sheet it opens. */
export class TraderPanel {
  private key = '';
  private pressing: () => boolean;

  constructor(
    private game: Game,
    private fmt: Fmt,
  ) {
    $('trader-banner').addEventListener('click', () => this.open());
    $('trader-close').addEventListener('click', () => this.close());
    $('trader').addEventListener('click', (e) => {
      if (e.target === $('trader')) this.close();
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-offer]');
      if (btn) {
        this.game.trade(Number(btn.dataset.offer));
        this.key = '';
        this.render();
      }
    });
    this.pressing = pressWatch($('trader-offers'));
  }

  open(): void {
    this.key = '';
    $('trader').hidden = false;
    this.render();
  }

  close(): void {
    $('trader').hidden = true;
  }

  render(): void {
    const s = this.game.state;
    const now = Date.now();
    const here = meta.traderHere(s, now);
    $('trader-banner').hidden = !here;
    if (!here) {
      if (!$('trader').hidden) this.close();
      return;
    }
    const left = formatDuration((s.trader.until - now) / 1000);
    setText($('trader-time'), left);
    if ($('trader').hidden) return;
    setText($('trader-left'), `Leaving in ${left}`);
    setText($('trader-name'), TRADER_NAMES[s.trader.name] ?? TRADER_NAMES[0]);
    if (this.pressing()) return;
    const key = JSON.stringify(s.trader.offers) + s.crystals + s.scrap.gte(D(s.trader.offers.find((o) => o.pay === 'scrap')?.price ?? '0'));
    if (key === this.key) return;
    this.key = key;
    $('trader-offers').innerHTML = s.trader.offers
      .map((o, i) => {
        const t = offerText(o, this.fmt);
        const price = o.pay === 'scrap' ? `${ICONS.scrap}<span>${this.fmt(D(o.price))}</span>` : crystalCost(o.price);
        const afford = o.pay === 'scrap' ? s.scrap.gte(D(o.price)) : s.crystals >= Number(o.price);
        const btn = o.bought
          ? `<span class="offer-sold">${ICONS.check}Sold</span>`
          : `<button type="button" class="crew-btn" data-offer="${i}" ${afford ? '' : 'disabled'}><span class="offer-price">${price}</span></button>`;
        return `<li class="offer${o.bought ? ' sold' : ''}"><div class="offer-icon">${t.icon}</div><div><b>${esc(t.title)}</b><div class="offer-desc">${esc(t.desc)}</div></div>${btn}</li>`;
      })
      .join('');
  }
}

/** Toast text for a finished trade. */
export function tradeText(r: meta.TradeResult, fmt: Fmt): string {
  if (r.crystals) return `<b>Deal!</b> +${r.crystals} crystals`;
  if (r.scrap) return `<b>Deal!</b> +${fmt(r.scrap)} scrap`;
  if (r.blueprint) return `<b>Blueprint: ${esc(moduleDef(r.blueprint)!.name)}!</b> Build it in Station, Rooms`;
  if (r.loot) {
    const l = LOOT.find((x) => x.id === r.loot)!;
    return `<b>${esc(l.name)}!</b> ${esc(l.desc)}`;
  }
  return `<b>Recalled!</b> Your crew are home. Open Crew, Trips`;
}

// ---------- Challenge runs ----------

export class ChallengePanel {
  private key = '';
  /** The challenge whose Start button was tapped once and is asking to be sure. */
  private arming: string | null = null;

  constructor(
    private game: Game,
    private fmt: Fmt,
  ) {
    $('challenge-list').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-start],button[data-quit]');
      if (!btn) return;
      if (btn.dataset.quit) this.game.abandonChallenge();
      else if (this.arming === btn.dataset.start) {
        this.arming = null;
        this.game.startChallenge(btn.dataset.start!);
      } else this.arming = btn.dataset.start!;
      this.key = '';
      this.render();
    });
  }

  render(): void {
    const s = this.game.state;
    const open = meta.challengesOpen(s);
    const progress = meta.challengeProgress(s);
    // The Build tab carries a slim reminder while a challenge is running.
    const def = CHALLENGES.find((c) => c.id === s.challenge);
    $('challenge-line').hidden = !def;
    if (def) {
      setText($('challenge-line-name'), def.name);
      setText($('challenge-line-pct'), `${Math.floor(progress * 100)}%`);
      ($('challenge-line-bar') as HTMLElement).style.width = `${(progress * 100).toFixed(1)}%`;
    }
    if ($('tab-cores').hidden) return;
    const key = `${open}${s.challenge}${[...s.challengesDone].join()}${this.arming}${Math.floor(progress * 200)}`;
    if (key === this.key) return;
    this.key = key;
    if (!open) {
      $('challenge-list').innerHTML = `<li class="challenge locked"><div class="challenge-icon">${ICONS.lock}</div><div><b>Challenge runs</b><div class="challenge-rule">Hold ${CHALLENGE_CORES} Star Cores to unlock runs with a twist and a permanent reward.</div></div></li>`;
      return;
    }
    $('challenge-list').innerHTML = CHALLENGES.map((c) => {
      const done = s.challengesDone.has(c.id);
      const active = s.challenge === c.id;
      let action: string;
      if (done) action = `<span class="offer-sold">${ICONS.check}Beaten</span>`;
      else if (active) action = `<button type="button" class="crew-btn quiet" data-quit="1">Give up</button>`;
      else if (s.challenge) action = '';
      else action = `<button type="button" class="crew-btn${this.arming === c.id ? ' armed' : ''}" data-start="${c.id}">${this.arming === c.id ? 'Tap to confirm' : 'Start'}</button>`;
      const bar = active ? `<div class="bar"><i style="width:${(progress * 100).toFixed(1)}%"></i></div><div class="challenge-goal">${this.fmt(s.lifetime)} / ${this.fmt(c.goal)} scrap</div>` : `<div class="challenge-goal">Goal: salvage ${this.fmt(c.goal)} in one run</div>`;
      return `<li class="challenge${done ? ' done' : ''}${active ? ' active' : ''}" style="--c:${hex(c.color)}">
        <div class="challenge-icon">${done ? ICONS.check : ICONS.trophy}</div>
        <div class="challenge-info"><b>${esc(c.name)}</b><div class="challenge-rule">${esc(c.rule)}</div>${bar}<div class="challenge-reward">${esc(c.reward)}</div></div>
        ${action}</li>`;
    }).join('');
    if (this.arming && !s.challenge) {
      $('challenge-list').insertAdjacentHTML('beforeend', '<li class="challenge-note">Starting a challenge begins a fresh run, like relocating (any Star Cores waiting are banked). Give up any time and the run simply carries on.</li>');
    }
  }
}
