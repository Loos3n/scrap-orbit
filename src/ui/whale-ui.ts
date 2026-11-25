import * as whale from '../core/whale';
import { WHALE, WHALE_SONGS, WHALE_STAGES, type WhaleSong } from '../core/whale';
import { formatDuration, type Decimal } from '../core/num';
import type { Game } from '../game';
import { whaleEggUrl, whaleUrl } from '../scene/art';
import { ICONS } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Stardrifter's window (core/whale.ts): the egg and its warming, then the whale with its name,
 * stage, mood and hunger, a Feed button, what it gives, and the songs it has sung. A song that
 * is waiting opens as a card of its own; the last stage offers the tow to the Nursery.
 */
export class WhalePanel {
  private key = '';
  /** A song being read: its id, and whether hearing it is still to be counted. */
  private reading: { song: WhaleSong; fresh: boolean } | null = null;
  private naming = false;
  private eggPic = '';
  private whalePic = '';

  constructor(
    private game: Game,
    private fmt: (d: Decimal) => string,
    private hooks: { pet: () => void; tow: () => void },
  ) {
    $('whale-btn').addEventListener('click', () => this.open());
    // The playable test build can skip the waiting: find the egg, hatch it, then grow a stage at a time.
    $('opt-whale-row').hidden = import.meta.env.MODE !== 'single' && !import.meta.env.DEV;
    $('opt-whale-test').addEventListener('click', () => {
      const s = this.game.state;
      const w = s.whale;
      if (w.phase === 'none') whale.findEgg(s, Date.now());
      else if (w.phase === 'egg') w.eggAt = Date.now() - WHALE.hatchMinutes * 60_000;
      else {
        const next = WHALE_STAGES[whale.stageIndex(w.growth) + 1];
        w.growth = next ? next.at : w.growth;
        w.hunger = WHALE.mealsMax;
        w.gulpAt = 0;
      }
      $('settings').hidden = true;
      if (w.phase !== 'born') this.open();
    });
    $('whale-close').addEventListener('click', () => this.close());
    $('whale').addEventListener('click', (e) => {
      if (e.target === $('whale')) return this.close();
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-w]');
      if (!btn) return;
      const act = btn.dataset.w!;
      if (act === 'warm') this.game.warmEgg();
      else if (act === 'feed') this.game.feedWhale();
      else if (act === 'pet') {
        if (this.game.petWhale()) this.hooks.pet();
      } else if (act === 'song') {
        const song = whale.pendingSong(this.game.state);
        if (song) this.reading = { song, fresh: true };
      } else if (act === 'replay') {
        const song = WHALE_SONGS.find((x) => x.id === btn.dataset.id);
        if (song) this.reading = { song, fresh: false };
      } else if (act === 'heard') {
        if (this.reading?.fresh) this.game.hearWhaleSong(this.reading.song.id);
        this.reading = null;
      } else if (act === 'rename') this.naming = true;
      else if (act === 'save-name') {
        this.game.renameWhale(($('whale-name-input') as HTMLInputElement).value);
        this.naming = false;
      } else if (act === 'tow') {
        this.close();
        this.hooks.tow();
        return;
      }
      this.key = '';
      this.render();
    });
    $('whale').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).id === 'whale-name-input') {
        this.game.renameWhale((e.target as HTMLInputElement).value);
        this.naming = false;
        this.key = '';
        this.render();
      }
    });
  }

  open(song = false): void {
    $('whale').hidden = false;
    this.naming = false;
    this.reading = null;
    if (song) {
      const s = whale.pendingSong(this.game.state);
      if (s) this.reading = { song: s, fresh: true };
    }
    this.key = '';
    this.render();
  }

  /** Opens straight onto naming, for a hatchling just out of its egg. */
  openNaming(): void {
    this.open();
    this.naming = true;
    this.key = '';
    this.render();
    window.setTimeout(() => ($('whale-name-input') as HTMLInputElement | null)?.select(), 50);
  }

  close(): void {
    $('whale').hidden = true;
    this.reading = null;
    this.naming = false;
  }

  /** The side button, its dot, and the window if it is open. */
  render(): void {
    const s = this.game.state;
    const w = s.whale;
    const now = Date.now();
    const btn = $('whale-btn');
    btn.hidden = w.phase === 'none';
    if (w.phase === 'none') return;
    const song = whale.pendingSong(s);
    const hungry = w.phase === 'born' && w.hunger > 0 && s.scrap.gte(this.game.whaleMealCost());
    const hatching = w.phase === 'egg' && now >= whale.hatchAt(s);
    $('whale-dot').hidden = !(song || hungry || hatching || whale.canTow(s));
    const label = w.phase === 'egg' ? 'Egg' : w.name;
    if ($('whale-btn-name').textContent !== label) $('whale-btn-name').textContent = label;
    if ($('whale').hidden) return;
    // The window is only rebuilt when something on it changes shape; the countdowns tick in place,
    // so a finger on Feed or Warm never lands on a button that was swapped out under it.
    const live = !this.naming && !this.reading;
    const hatchLeft = w.phase === 'egg' ? Math.max(0, (whale.hatchAt(s) - now) / 1000) : 0;
    const key = [w.phase, w.warmed, Math.floor(w.growth), Math.round(w.mood), w.hunger, w.name, w.songs, w.nursery, w.treatsToday, w.treatDay, this.naming, this.reading?.song.id ?? '', ...(live ? [hatchLeft > 0, s.scrap.gte(this.game.whaleMealCost()), this.fmt(this.game.whaleMealCost())] : [])].join('|');
    if (key === this.key) {
      if (live) this.tick(now);
      return;
    }
    this.key = key;
    if (this.reading) return this.renderSong(this.reading.song);
    if (w.phase === 'egg') return this.renderEgg(now);
    this.renderWhale(now);
  }

  /** Updates the countdowns on the open window without rebuilding it. */
  private tick(now: number): void {
    const s = this.game.state;
    const hatch = document.getElementById('whale-hatch-left');
    if (hatch) hatch.textContent = formatDuration(Math.max(0, (whale.hatchAt(s) - now) / 1000));
    const wait = document.getElementById('whale-meal-wait');
    if (wait) wait.textContent = formatDuration(whale.nextMealSeconds(s, now));
  }

  private renderEgg(now: number): void {
    const s = this.game.state;
    this.eggPic ||= whaleEggUrl();
    const left = Math.max(0, (whale.hatchAt(s) - now) / 1000);
    const warmsLeft = WHALE.warmMax - s.whale.warmed;
    $('whale-body').innerHTML = `
      <div class="whale-hero egg"><img src="${this.eggPic}" alt="" /></div>
      <h2>A warm egg</h2>
      <p class="whale-lede">It was in a salvage crate, wrapped in old packing foam. It hums when you hold it, and something inside it hums back.</p>
      <div class="whale-stat"><span>Hatches in</span><b>${left > 0 ? `<span id="whale-hatch-left">${formatDuration(left)}</span>` : 'any moment now'}</b></div>
      <button type="button" class="primary whale-act" data-w="warm" ${warmsLeft <= 0 || left <= 0 ? 'disabled' : ''}>Warm it up <small>${warmsLeft > 0 ? `${WHALE.warmMinutes} min sooner, ${warmsLeft} left` : 'It is as cosy as it gets'}</small></button>`;
  }

  private renderWhale(now: number): void {
    const s = this.game.state;
    const w = s.whale;
    this.whalePic ||= whaleUrl();
    const stage = whale.whaleStage(s);
    const i = WHALE_STAGES.indexOf(stage);
    const next = WHALE_STAGES[i + 1];
    const prog = whale.stageProgress(s);
    const word = whale.moodWord(s);
    const cost = this.game.whaleMealCost();
    const wait = whale.nextMealSeconds(s, now);
    const canFeed = w.hunger > 0 && s.scrap.gte(cost);
    const bowls = Array.from({ length: WHALE.mealsMax }, (_, k) => `<i class="${k < w.hunger ? 'on' : ''}"></i>`).join('');
    const pct = Math.round((whale.whaleMult(s) - 1) * 100);
    const song = whale.pendingSong(s);
    const heard = WHALE_SONGS.slice(0, w.songs);
    const nameRow = this.naming
      ? `<div class="whale-naming"><input id="whale-name-input" type="text" maxlength="14" value="${esc(w.name)}" aria-label="Whale's name" autocomplete="off" /><button type="button" class="primary" data-w="save-name">Save</button></div>`
      : `<h2 class="whale-name">${esc(w.name)} <button type="button" class="whale-rename" data-w="rename">Rename</button></h2>`;
    const feedNote = w.hunger > 0 ? (canFeed ? `Wants ${w.hunger} more ${w.hunger === 1 ? 'meal' : 'meals'}` : 'Not enough scrap for a meal yet') : `Full. Hungry again in <span id="whale-meal-wait">${formatDuration(wait)}</span>`;
    $('whale-body').innerHTML = `
      <div class="whale-hero" style="--size:${0.45 + stage.size * 0.55}"><img src="${this.whalePic}" alt="" /></div>
      ${nameRow}
      <div class="whale-stage"><span class="whale-chip">${stage.name}</span>${next ? `<span class="whale-next">${Math.round(prog * 100)}% to ${next.name}</span>` : `<span class="whale-next">Fully grown</span>`}</div>
      <div class="whale-bar"><i style="width:${prog * 100}%"></i></div>
      ${song ? `<button type="button" class="whale-song-ready" data-w="song">${ICONS.radio}<span><b>${esc(w.name)} is singing</b><small>${esc(song.title)}: tap to listen</small></span></button>` : ''}
      ${whale.canTow(s) ? `<button type="button" class="primary whale-act tow" data-w="tow">Let ${esc(w.name)} tow the station <small>To the Nursery, past the edge of every map. +${Math.round(WHALE.nurseryIncome * 100)}% income for good</small></button>` : ''}
      <div class="whale-grid">
        <div class="whale-stat"><span>Mood</span><b class="mood-${word.toLowerCase()}">${word}</b><div class="whale-bar mood"><i style="width:${w.mood}%"></i></div></div>
        <div class="whale-stat"><span>Appetite</span><b class="whale-bowls">${bowls}</b><small>${feedNote}</small></div>
      </div>
      <div class="whale-actions">
        <button type="button" class="buy whale-feed" data-w="feed" ${canFeed ? '' : 'disabled'}><span class="buy-count">Feed</span><span class="buy-cost"><span>${ICONS.scrap}</span><span class="n">${this.fmt(cost)}</span></span></button>
        <button type="button" class="whale-pet" data-w="pet">${ICONS.heart}<span>Pet</span></button>
      </div>
      <ul class="whale-gives">
        <li>${ICONS.bolt}<span><b>+${pct}% income</b>, more as ${esc(w.name)} grows and the happier it is</span></li>
        <li>${ICONS.scrap}<span>${stage.gulp ? `Gulps a passing wreck every half hour or so: <b>${stage.gulp} minutes</b> of scrap` : 'Too small to gulp wrecks yet. From the Calf stage it will'}</span></li>
        <li>${ICONS.fish}<span>The crew save it a treat from each catch, harvest and broken wreck (<b>${Math.max(0, WHALE.treatsPerDay - (w.treatDay === dayKey(now) ? w.treatsToday : 0))}</b> left today)</span></li>
      </ul>
      ${heard.length ? `<h3 class="section-title">Songs</h3><div class="whale-songs">${heard.map((x) => `<button type="button" data-w="replay" data-id="${x.id}">${ICONS.radio}<span>${esc(x.title)}</span></button>`).join('')}</div>` : ''}`;
  }

  private renderSong(song: WhaleSong): void {
    $('whale-body').innerHTML = `
      <div class="whale-song">
        <h2>${esc(song.title)}</h2>
        ${song.lines.map((l, k) => `<p style="--d:${k * 0.6}s">${esc(l)}</p>`).join('')}
        <button type="button" class="primary" data-w="heard">${this.reading?.fresh ? 'Keep listening' : 'Back'}</button>
      </div>`;
  }
}

/** The same day key core/whale.ts uses for the daily treats. */
function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
