import { PETS } from '../core/content';
import { RANKS, RANK_INCOME, currentRank, journeyDone, rankReady, rankTitle, taskMet, taskProgress, type JourneyGo, type JourneyReward, type JourneyTask, type RankClaim } from '../core/journey';
import { tabOpen } from '../core/unlocks';
import { fishingOpen } from '../core/fishing';
import { formatDuration, type Decimal } from '../core/num';
import type { Game } from '../game';
import { ICONS } from './icons';
import { groupOf } from './panes';

/*
 * Captain ranks on screen: a small tracker at the foot of the station view naming the next thing
 * to do, and a card with the rank's three tasks, its reward and the ladder ahead. Claiming a rank
 * is a promotion, with its own celebration (main.ts).
 */

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
type Fmt = (v: Decimal | number) => string;

/** Seconds to local midnight. */
function untilMidnight(): number {
  const m = new Date();
  m.setHours(24, 0, 0, 0);
  return Math.max(60, (m.getTime() - Date.now()) / 1000);
}

/** The rank badge: a little shield with one chevron per rank claimed (up to three, then a star). */
export function rankBadge(rank: number, gold = false): string {
  const fill = gold ? '#ffd166' : '#5cd6ff';
  const deep = gold ? '#b8771a' : '#1f6f9a';
  const chevrons =
    rank >= 4
      ? `<path d="M16 9.5l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="#fff"/>`
      : Array.from({ length: Math.max(0, rank) }, (_, i) => `<path d="M10 ${11 + i * 5}l6 4 6-4" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2.5l11 4v8.5c0 7-4.7 12.3-11 14.5C9.7 27.3 5 22 5 15V6.5z" fill="${deep}"/><path d="M16 4.6l9 3.3v7.1c0 5.9-3.8 10.4-9 12.4-5.2-2-9-6.5-9-12.4V7.9z" fill="${fill}"/>${chevrons}</svg>`;
}

/** The reward as little chips. */
function rewardChips(r: JourneyReward): string {
  const out = [`${ICONS.crystal}<b>${r.crystals}</b>`];
  if (r.scrapMin) out.push(`${ICONS.scrap}<b>${r.scrapMin} min</b> of scrap`);
  if (r.pet) out.push(`${ICONS.heart}<b>${esc(PETS.find((p) => p.id === r.pet)!.name)}</b>`);
  if (r.paint) out.push(`${ICONS.palette}<b>Captain's Gold</b> paint`);
  out.push(`${ICONS.star}<b>+${Math.round(RANK_INCOME * 100)}%</b> income`);
  return out.map((t) => `<span class="rank-chip-r">${t}</span>`).join('');
}

export interface JourneyHooks {
  /** Opens a menu pane. */
  pane(name: string): void;
  /** Shows a short note. */
  toast(icon: string, html: string): void;
}

export class JourneyPanel {
  private key = '';
  private chipKey = '';

  constructor(
    private game: Game,
    private fmt: Fmt,
    private hooks: JourneyHooks,
  ) {
    $('rank-chip').addEventListener('click', () => this.open());
    $('rank-close').addEventListener('click', () => this.close());
    $('rank').addEventListener('click', (e) => {
      if (e.target === $('rank')) return this.close();
      const t = e.target as HTMLElement;
      if (t.closest('#rank-claim')) {
        this.game.claimRank();
        this.key = '';
        this.render();
        if (journeyDone(this.game.state) || !rankReady(this.game.state)) this.close();
        return;
      }
      const go = t.closest<HTMLElement>('[data-go]');
      if (go) this.go(go.dataset.go as JourneyGo);
    });
  }

  open(): void {
    $('rank').hidden = false;
    this.key = '';
    this.render();
  }

  close(): void {
    $('rank').hidden = true;
  }

  /** Sends the captain to where a task is done. */
  private go(where: JourneyGo): void {
    this.close();
    const s = this.game.state;
    if (where === 'missions') return $('missions-btn').click();
    if (where === 'fishing') return fishingOpen(s) ? $('fish-btn').click() : undefined;
    if (where === 'boost') {
      const b = $('boost');
      b.classList.remove('nudge');
      void b.offsetWidth;
      b.classList.add('nudge');
      return;
    }
    if (where === 'station-tap') return;
    const group = groupOf(where);
    if (!tabOpen(s, group)) return this.hooks.toast(ICONS.lock, 'That opens a little later. Keep salvaging!');
    this.hooks.pane(where);
  }

  /** Whether a task has a Go button: somewhere to send the captain that is open now. */
  private canGo(t: JourneyTask): boolean {
    if (!t.go || t.go === 'station-tap') return false;
    if (t.go === 'fishing') return fishingOpen(this.game.state);
    if (t.go === 'missions' || t.go === 'boost') return true;
    return tabOpen(this.game.state, groupOf(t.go));
  }

  /** The tracker: the next unmet task of the current rank, or a glowing Claim once all three are met. */
  private renderChip(): void {
    const s = this.game.state;
    const chip = $('rank-chip');
    const rank = currentRank(s);
    chip.hidden = !rank || (s.tutorial >= 0 && this.game.tutorialStep !== 'done');
    if (!rank || chip.hidden) return;
    const ready = rankReady(s);
    const metCount = rank.tasks.filter((t) => taskMet(s, t)).length;
    const next = rank.tasks.find((t) => !taskMet(s, t));
    const [have, target] = next ? taskProgress(s, next) : [1, 1];
    const key = `${s.journey.rank}|${ready}|${next?.id}|${have}|${metCount}|${s.settings.numbers}`;
    if (key === this.chipKey) return;
    const advanced = !!this.chipKey && this.chipKey.split('|')[4] !== String(metCount);
    this.chipKey = key;
    chip.classList.toggle('ready', ready);
    const count = target > 1 ? ` <em>${this.fmt(Math.floor(have))}/${this.fmt(target)}</em>` : '';
    chip.innerHTML = `<span class="rank-badge">${rankBadge(s.journey.rank, ready)}</span>
      <span class="rank-chip-text"><small>${ready ? 'Promotion ready!' : `Next rank: ${esc(rank.title)} · ${metCount}/3`}</small>
      <b>${ready ? `Become ${esc(rank.title)}` : esc(next!.text) + count}</b></span>
      <i class="rank-chip-bar"><i style="width:${ready ? 100 : ((metCount + have / target) / 3) * 100}%"></i></i>`;
    chip.setAttribute('aria-label', ready ? `Claim promotion to ${rank.title}` : `Captain rank: ${next!.text}`);
    if (advanced) {
      chip.classList.remove('tick');
      void chip.offsetWidth;
      chip.classList.add('tick');
    }
  }

  render(): void {
    this.renderChip();
    if ($('rank').hidden) return;
    const s = this.game.state;
    const rank = currentRank(s);
    const key = `${Math.floor(Date.now() / 60_000)}|${s.journey.rank}|${[...s.journey.met].join()}|${rank ? rank.tasks.map((t) => taskProgress(s, t)[0]).join() : ''}|${s.settings.numbers}`;
    if (key === this.key) return;
    this.key = key;
    $('rank-now').innerHTML = `<span class="rank-badge big">${rankBadge(s.journey.rank, true)}</span>
      <div><div class="eyebrow">Captain rank ${Math.min(s.journey.rank, RANKS.length)} of ${RANKS.length}</div>
      <h2 id="rank-title">${esc(rankTitle(s))}</h2>
      <p class="rank-bonus">+${Math.round(Math.min(s.journey.rank, RANKS.length) * RANK_INCOME * 100)}% income from ranks</p></div>`;
    if (!rank) {
      $('rank-body').innerHTML = `<p class="rank-done">You've climbed every rank. The station is yours, Captain!</p>`;
      return;
    }
    const ready = rankReady(s);
    const tasks = rank.tasks
      .map((t) => {
        const [have, target] = taskProgress(s, t);
        const met = taskMet(s, t);
        const count =
          t.day && !met ? `${have} / ${target} days · a new day starts in ${formatDuration(untilMidnight())}`
          : target > 1 ? `${this.fmt(Math.floor(have))} / ${this.fmt(target)}`
          : met ? 'Done' : 'Not yet';
        const action = met ? `<span class="mission-claimed">${ICONS.check}</span>` : this.canGo(t) ? `<button type="button" class="crew-btn quiet" data-go="${t.go}">Go</button>` : '';
        return `<li class="mission rank-task${met ? ' done' : ''}"><div class="mission-text"><b>${esc(t.text)}</b>
          <div class="bar"><i style="width:${((have / target) * 100).toFixed(1)}%"></i></div><span class="mission-count">${count}</span></div>${action}</li>`;
      })
      .join('');
    const ladder = RANKS.map((r, i) => {
      const cls = i < s.journey.rank ? 'got' : i === s.journey.rank ? 'now' : '';
      return `<li class="${cls}" title="${esc(r.title)}"><span class="rank-badge">${rankBadge(i + 1, i < s.journey.rank)}</span><small>${esc(r.title)}</small></li>`;
    }).join('');
    $('rank-body').innerHTML = `<h3 class="section-title">Next: ${esc(rank.title)}</h3>
      <ul class="mission-list">${tasks}</ul>
      <div class="rank-reward"><small>Promotion reward</small><div>${rewardChips(rank.reward)}</div>${rank.opens ? `<p>Also opens: <b>${esc(rank.opens)}</b></p>` : ''}</div>
      ${ready ? `<button id="rank-claim" type="button" class="primary">Claim promotion</button>` : ''}
      <ol class="rank-ladder">${ladder}</ol>`;
  }
}

/** The promotion card's words. */
export function promotionText(c: RankClaim, fmt: Fmt): string {
  const parts = [`+${c.crystals} crystals`];
  if (c.scrap.gt(0)) parts.push(`+${fmt(c.scrap)} scrap`);
  if (c.pet) parts.push(`${PETS.find((p) => p.id === c.pet)!.name} joins the crew`);
  if (c.paint) parts.push("Captain's Gold paint");
  parts.push(`+${Math.round(RANK_INCOME * 100)}% income for good`);
  return parts.join(' · ');
}
