import { CRITTERS, FISHING, RARITY, baitSecondsLeft, critterPool, fishingOpen, markerAt, speciesCaught, type Critter } from '../core/fishing';
import { format, formatDuration } from '../core/num';
import type { Game } from '../game';
import { critterSvg } from '../scene/critter-art';
import { ICONS } from './icons';

/**
 * Space fishing: a round Fishing button on the side rail, and a card with the pond (cast, wait
 * for the bobber to dip, hook it, then reel by tapping while the marker is in the green) and the
 * catch book. One button (or a tap on the pond, or Space) does whatever comes next.
 */

const $ = (id: string) => document.getElementById(id)!;

export interface FishHooks {
  cast(): void;
  bite(): void;
  hit(step: number): void;
  miss(): void;
  escape(): void;
  /** Something landed (the game event handles the payout toast and the tank). */
  landed(c: Critter): void;
  buzz(ms: number): void;
}

type Phase = 'idle' | 'cast' | 'wait' | 'bite' | 'reel' | 'done';

export class FishingPanel {
  private phase: Phase = 'idle';
  private timer = 0;
  private raf = 0;
  private critter: Critter | null = null;
  private hits = 0;
  private misses = 0;
  private reelStart = 0;
  private zone0 = 0.4;
  private speed = 0.6;
  private pick: string | null = null;
  private baitKey = '';

  constructor(
    private game: Game,
    private hooks: FishHooks,
  ) {
    $('fish-btn').addEventListener('click', () => this.open());
    $('fishing-close').addEventListener('click', () => this.close());
    $('fishing').addEventListener('click', (e) => {
      if (e.target === $('fishing')) this.close();
    });
    $('fish-act').addEventListener('click', () => this.act());
    $('fish-pond').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.act();
    });
    $('fish-tab-fish').addEventListener('click', () => this.tab('fish'));
    $('fish-tab-book').addEventListener('click', () => this.tab('book'));
    $('fish-grid').addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('[data-critter]');
      if (!li) return;
      this.pick = li.dataset.critter!;
      this.renderBook();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen || $('fish-play').hidden) return;
      if (e.code !== 'Space' && e.key !== 'Enter') return;
      if ((e.target as HTMLElement | null)?.closest('button')) return;
      e.preventDefault();
      if (!e.repeat) this.act();
    });
    this.render();
  }

  get isOpen(): boolean {
    return !$('fishing').hidden;
  }

  /** The side button (shown once the tutorial is done, with a dot when the bait is full), and the bait line. */
  render(): void {
    const s = this.game.state;
    this.game.refillBait();
    const btn = $('fish-btn');
    btn.hidden = !fishingOpen(s);
    const full = s.fishing.bait >= FISHING.baitMax;
    $('fish-dot').hidden = !full || this.isOpen;
    if (!this.isOpen) return;
    const left = baitSecondsLeft(s, Date.now());
    const key = `${s.fishing.bait}|${left}`;
    if (key === this.baitKey) return;
    this.baitKey = key;
    $('fish-bait-pips').innerHTML = Array.from({ length: FISHING.baitMax }, (_, i) => `<i class="${i < s.fishing.bait ? 'on' : ''}"></i>`).join('');
    $('fish-bait-text').textContent = full ? 'Bait full' : `${s.fishing.bait} bait · next in ${formatDuration(left)}`;
    if (this.phase === 'idle' || this.phase === 'done') this.setAct();
  }

  open(): void {
    $('fishing').hidden = false;
    this.tab('fish');
    this.reset();
    this.shadows();
    this.baitKey = '';
    this.render();
    $('fish-msg').textContent = this.game.state.fishing.casts ? 'Tap Cast, wait for the bobber to dip, then hook it!' : 'Cast your line into the nebula and see what bites!';
  }

  close(): void {
    // Walking away mid-reel lets it go (the bait was already spent when it was hooked).
    this.stop();
    this.phase = 'idle';
    $('fishing').hidden = true;
    this.render();
  }

  private tab(name: 'fish' | 'book'): void {
    $('fish-play').hidden = name !== 'fish';
    $('fish-book').hidden = name !== 'book';
    $('fish-tab-fish').classList.toggle('on', name === 'fish');
    $('fish-tab-book').classList.toggle('on', name === 'book');
    $('fish-tab-fish').setAttribute('aria-selected', String(name === 'fish'));
    $('fish-tab-book').setAttribute('aria-selected', String(name === 'book'));
    $('fish-book-count').textContent = `${speciesCaught(this.game.state)}/${CRITTERS.length}`;
    if (name === 'book') {
      if (this.phase !== 'idle' && this.phase !== 'done') {
        this.stop();
        this.reset();
      }
      this.renderBook();
    }
  }

  private stop(): void {
    window.clearTimeout(this.timer);
    cancelAnimationFrame(this.raf);
  }

  private reset(): void {
    this.stop();
    this.phase = 'idle';
    this.critter = null;
    $('fish-bobber').hidden = true;
    $('fish-bobber').className = 'fish-bobber';
    $('fish-alert').hidden = true;
    $('fish-result').hidden = true;
    $('fish-reel').hidden = true;
    $('fish-line-path').setAttribute('d', 'M50 0L50 0');
    this.setAct();
  }

  private setAct(): void {
    const b = $('fish-act') as HTMLButtonElement;
    const labels: Record<Phase, string> = { idle: 'Cast', cast: 'Waiting…', wait: 'Waiting…', bite: 'Hook it!', reel: 'Reel!', done: 'Cast again' };
    b.textContent = labels[this.phase];
    b.classList.toggle('hot', this.phase === 'bite' || this.phase === 'reel');
    b.classList.toggle('quiet', this.phase === 'cast' || this.phase === 'wait');
  }

  /** Whatever comes next: cast, hook, or tug the reel. */
  private act(): void {
    switch (this.phase) {
      case 'idle':
      case 'done':
        return this.cast();
      case 'wait':
        // Too soon: reel back in for free.
        this.reset();
        $('fish-msg').textContent = 'Too soon! Wait for the bobber to dip.';
        return;
      case 'bite':
        return this.hookIt();
      case 'reel':
        return this.tug();
    }
  }

  private cast(): void {
    const s = this.game.state;
    this.reset();
    if (s.fishing.bait <= 0) {
      $('fish-msg').textContent = `Out of bait. More in ${formatDuration(baitSecondsLeft(s, Date.now()))}.`;
      return;
    }
    this.phase = 'cast';
    this.setAct();
    this.hooks.cast();
    const x = 28 + Math.random() * 44;
    const y = 48 + Math.random() * 18;
    const bob = $('fish-bobber');
    bob.style.left = `${x}%`;
    bob.style.top = `${y}%`;
    bob.hidden = false;
    bob.className = 'fish-bobber flying';
    $('fish-alert').style.left = `${x}%`;
    $('fish-alert').style.top = `${y}%`;
    $('fish-line-path').setAttribute('d', `M50 0Q${(50 + x) / 2} ${y * 0.75} ${x} ${y}`);
    $('fish-msg').textContent = 'Waiting for a bite…';
    this.timer = window.setTimeout(() => {
      this.phase = 'wait';
      this.setAct();
      bob.className = 'fish-bobber';
      this.timer = window.setTimeout(() => this.bite(), 1400 + Math.random() * 3200);
    }, 550);
  }

  private bite(): void {
    this.phase = 'bite';
    this.setAct();
    $('fish-bobber').className = 'fish-bobber bite';
    $('fish-alert').hidden = false;
    $('fish-msg').textContent = 'A bite! Hook it!';
    this.hooks.bite();
    this.hooks.buzz(30);
    this.timer = window.setTimeout(() => {
      this.reset();
      $('fish-msg').textContent = 'It nibbled the bait and swam off. Cast again!';
    }, 1500);
  }

  private hookIt(): void {
    window.clearTimeout(this.timer);
    const c = this.game.hookFish();
    if (!c) {
      this.reset();
      $('fish-msg').textContent = 'Out of bait!';
      return;
    }
    this.critter = c;
    this.phase = 'reel';
    this.hits = 0;
    this.misses = 0;
    this.baitKey = '';
    this.render();
    this.setAct();
    const r = RARITY[c.rarity];
    this.speed = r.speed;
    $('fish-alert').hidden = true;
    $('fish-bobber').className = 'fish-bobber tug';
    $('fish-reel').hidden = false;
    $('fish-reel').style.setProperty('--rar', r.color);
    $('fish-reel-label').textContent = c.rarity === 'legendary' ? 'Something huge!' : c.rarity === 'rare' ? 'Something big!' : 'Reel it in!';
    $('fish-msg').textContent = 'Tap when the marker is in the green!';
    this.newZone(-1);
    this.pips();
    this.reelStart = performance.now();
    const loop = () => {
      $('fish-marker').style.left = `${this.marker() * 100}%`;
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  private marker(): number {
    return markerAt((performance.now() - this.reelStart) / 1000, this.speed);
  }

  /** Moves the green zone, away from where the marker is now. */
  private newZone(at: number): void {
    const w = RARITY[this.critter!.rarity].zone;
    let z = Math.random() * (1 - w);
    for (let i = 0; i < 6 && at >= 0 && Math.abs(z + w / 2 - at) < 0.3; i++) z = Math.random() * (1 - w);
    this.zone0 = z;
    const zone = $('fish-zone');
    zone.style.left = `${z * 100}%`;
    zone.style.width = `${w * 100}%`;
  }

  private pips(): void {
    const r = RARITY[this.critter!.rarity];
    $('fish-hits').innerHTML = Array.from({ length: r.hits }, (_, i) => `<i class="${i < this.hits ? 'on' : ''}"></i>`).join('');
    $('fish-slack').innerHTML = Array.from({ length: FISHING.slack + 1 }, (_, i) => `<i class="${i < FISHING.slack + 1 - this.misses ? 'on' : ''}"></i>`).join('');
  }

  private tug(): void {
    const c = this.critter!;
    const r = RARITY[c.rarity];
    const at = this.marker();
    const bar = $('fish-bar');
    // A little forgiveness at the edges of the green.
    if (at >= this.zone0 - 0.02 && at <= this.zone0 + r.zone + 0.02) {
      this.hits++;
      this.hooks.hit(this.hits);
      this.hooks.buzz(15);
      bar.classList.remove('good', 'bad');
      void bar.offsetWidth;
      bar.classList.add('good');
      this.pips();
      if (this.hits >= r.hits) return this.land();
      this.speed *= 1.12;
      this.newZone(at);
    } else {
      this.misses++;
      this.hooks.miss();
      bar.classList.remove('good', 'bad');
      void bar.offsetWidth;
      bar.classList.add('bad');
      this.pips();
      if (this.misses > FISHING.slack) return this.escape();
    }
  }

  private escape(): void {
    this.stop();
    this.reset();
    this.phase = 'done';
    this.setAct();
    this.hooks.escape();
    const c = this.critter;
    $('fish-msg').textContent = c && c.rarity !== 'common' ? 'The line snapped! Something big got away…' : 'The line snapped. It got away!';
  }

  private land(): void {
    this.stop();
    const c = this.critter!;
    const reward = this.game.landFish(c.id);
    this.phase = 'done';
    this.setAct();
    $('fish-reel').hidden = true;
    $('fish-bobber').hidden = true;
    $('fish-line-path').setAttribute('d', 'M50 0L50 0');
    const r = RARITY[c.rarity];
    const res = $('fish-result');
    res.hidden = false;
    res.style.setProperty('--rar', r.color);
    $('fish-result-pic').innerHTML = critterSvg(c);
    $('fish-result-rarity').textContent = r.name;
    $('fish-result-name').textContent = c.name;
    $('fish-result-desc').textContent = c.desc;
    const pay = [`<span>${ICONS.scrap}+${format(reward?.scrap ?? 0, this.game.state.settings.numbers)}</span>`];
    if (reward?.crystals) pay.push(`<span>${ICONS.crystal}+${reward.crystals} <em>New!</em></span>`);
    if (reward?.surge) pay.push(`<span class="surge">Power surge!</span>`);
    $('fish-result-pay').innerHTML = pay.join('');
    $('fish-msg').textContent = '';
    $('fish-book-count').textContent = `${speciesCaught(this.game.state)}/${CRITTERS.length}`;
    this.hooks.landed(c);
    this.hooks.buzz(40);
  }

  /** A few faint shapes drifting under the surface, for atmosphere. */
  private shadows(): void {
    const pool = critterPool(this.game.state);
    $('fish-shadows').innerHTML = Array.from({ length: 3 }, (_, i) => {
      const c = pool[Math.floor(Math.random() * pool.length)];
      const top = 30 + i * 22 + Math.random() * 8;
      const dur = 14 + Math.random() * 10;
      return `<span style="top:${top}%;animation-duration:${dur}s;animation-delay:${-Math.random() * dur}s">${critterSvg(c, true)}</span>`;
    }).join('');
  }

  private renderBook(): void {
    const s = this.game.state;
    const got = speciesCaught(s);
    $('fish-book-intro').textContent =
      got === CRITTERS.length ? 'Every critter in the nebula. What a collection!' : `${got} of ${CRITTERS.length} critters caught. Deeper sectors hold stranger things.`;
    const pool = new Set(critterPool(s).map((c) => c.id));
    $('fish-grid').innerHTML = CRITTERS.map((c) => {
      const n = s.fishing.caught[c.id] ?? 0;
      const sel = this.pick === c.id ? ' sel' : '';
      return `<li data-critter="${c.id}" class="fish-cell ${n ? 'got' : ''}${sel}" style="--rar:${RARITY[c.rarity].color}" role="button" tabindex="0" aria-label="${n ? c.name : 'Not caught yet'}">${critterSvg(c, !n)}${n ? `<small>×${n}</small>` : pool.has(c.id) ? '' : '<small class="lock">Deeper</small>'}</li>`;
    }).join('');
    const c = CRITTERS.find((x) => x.id === this.pick);
    const detail = $('fish-detail');
    if (!c) {
      detail.innerHTML = '<small>Tap a critter to read about it.</small>';
      return;
    }
    const n = s.fishing.caught[c.id] ?? 0;
    const r = RARITY[c.rarity];
    detail.innerHTML = n
      ? `<b>${c.name}</b> <span class="fish-rarity" style="--rar:${r.color}">${r.name}</span><small>${c.desc} Caught ${n}.</small>`
      : `<b>???</b> <span class="fish-rarity" style="--rar:${r.color}">${r.name}</span><small>${pool.has(c.id) ? 'Swimming somewhere out there. Keep fishing!' : c.shifted ? 'Only found in another galaxy.' : `Lives in deeper sectors (after ${c.jumps} jumps).`}</small>`;
  }
}
