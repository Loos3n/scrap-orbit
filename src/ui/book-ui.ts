import { SAFE, SAFE_TYPES, SETS, SKINS, skinUnlocked } from '../core/collection';
import * as meta from '../core/meta';
import { formatDuration, type Decimal } from '../core/num';
import type { Game } from '../game';
import { ICONS } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const setText = (el: HTMLElement, text: string) => {
  if (el.textContent !== text) el.textContent = text;
};
type Fmt = (v: Decimal | number) => string;

// ---------- Cargo safe mini-game ----------

/** An SVG arc on the dial from angle a to b (degrees, 0 at the top, clockwise). */
function arc(a: number, b: number, r = 72): string {
  const p = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${(100 + Math.cos(rad) * r).toFixed(2)} ${(100 + Math.sin(rad) * r).toFixed(2)}`;
  };
  return `M ${p(a)} A ${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${p(b)}`;
}

/** Shortest distance between two angles, in degrees. */
const angleGap = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/**
 * The wreck mini-game: a safe dial with a sweeping needle. Tap while it's in the green zone to
 * open a lock; each lock spins faster with a smaller zone. Three misses jams the safe, and
 * whatever was opened by then pays out.
 */
export class SafeGame {
  private lock = 0;
  private lives = SAFE.lives;
  private angle = 0;
  private dir = 1;
  private zone = 0;
  private running = false;
  private finished = false;
  private last = 0;
  private frame = 0;

  constructor(
    private game: Game,
    private onSound: (kind: 'click' | 'open' | 'miss' | 'done') => void,
  ) {
    $('safe-banner').addEventListener('click', () => this.start());
    $('safe-dial').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.crack();
    });
    // Keyboard presses arrive as clicks with no pointer behind them.
    $('safe-dial').addEventListener('click', (e) => {
      if (e.detail === 0) this.crack();
    });
    $('safe-done').addEventListener('click', () => this.close());
    $('safe-close').addEventListener('click', () => this.close());
    const ticks = Array.from({ length: 24 }, (_, i) => {
      const rad = ((i * 15 - 90) * Math.PI) / 180;
      const r1 = i % 2 ? 80 : 77;
      return `<line x1="${100 + Math.cos(rad) * r1}" y1="${100 + Math.sin(rad) * r1}" x2="${100 + Math.cos(rad) * 84}" y2="${100 + Math.sin(rad) * 84}"/>`;
    }).join('');
    $('safe-ticks').innerHTML = ticks;
  }

  /** Keeps the "Locked cargo" banner in step with the pod. */
  render(): void {
    const s = this.game.state;
    const now = Date.now();
    const waiting = meta.safeWaiting(s, now);
    $('safe-banner').hidden = !waiting;
    if (waiting) setText($('safe-time'), formatDuration((s.safe.until - now) / 1000));
  }

  private start(): void {
    const type = this.game.openSafe();
    if (!type) return;
    const def = SAFE_TYPES.find((t) => t.id === type)!;
    setText($('safe-name'), def.name);
    $('safe').style.setProperty('--c', hex(def.color));
    this.lock = 0;
    this.lives = SAFE.lives;
    this.finished = false;
    this.angle = 0;
    this.dir = 1;
    this.newZone();
    this.drawLocks();
    setText($('safe-status'), 'Tap the dial when the needle is in the green.');
    $('safe-done').hidden = true;
    $('safe').hidden = false;
    $('safe').classList.remove('won', 'jammed');
    this.running = true;
    this.last = performance.now();
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (t: number): void => {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.angle = (this.angle + (360 / SAFE.turn[this.lock]) * dt * this.dir + 360) % 360;
    $('safe-needle').setAttribute('transform', `rotate(${this.angle.toFixed(1)} 100 100)`);
    this.frame = requestAnimationFrame(this.tick);
  };

  /** Puts the green zone somewhere well away from the needle. */
  private newZone(): void {
    const width = SAFE.zone[this.lock];
    this.zone = (this.angle + 120 + Math.random() * 120) % 360;
    $('safe-zone').setAttribute('d', arc(this.zone - width / 2, this.zone + width / 2));
  }

  private drawLocks(): void {
    $('safe-locks').innerHTML = Array.from({ length: SAFE.locks }, (_, i) => `<span class="safe-lock${i < this.lock ? ' open' : ''}">${i < this.lock ? ICONS.check : ICONS.lock}</span>`).join('');
    $('safe-lives').innerHTML = Array.from({ length: SAFE.lives }, (_, i) => `<i class="${i < this.lives ? 'on' : ''}"></i>`).join('');
  }

  private crack(): void {
    if (!this.running) return;
    const dial = $('safe-dial');
    if (angleGap(this.angle, this.zone) <= SAFE.zone[this.lock] / 2 + 2) {
      this.lock++;
      this.drawLocks();
      dial.classList.remove('hit', 'miss');
      void dial.offsetWidth;
      dial.classList.add('hit');
      if (this.lock >= SAFE.locks) return this.end(true);
      this.onSound('open');
      this.dir = -this.dir;
      this.newZone();
      setText($('safe-status'), `Lock ${this.lock} open! ${SAFE.locks - this.lock} to go. It spins faster now.`);
    } else {
      this.lives--;
      this.drawLocks();
      dial.classList.remove('hit', 'miss');
      void dial.offsetWidth;
      dial.classList.add('miss');
      this.onSound('miss');
      if (this.lives <= 0) return this.end(false);
      setText($('safe-status'), `Missed! ${this.lives} ${this.lives === 1 ? 'try' : 'tries'} left.`);
    }
  }

  private end(won: boolean): void {
    this.running = false;
    this.finished = true;
    $('safe').classList.add(won ? 'won' : 'jammed');
    setText($('safe-status'), won ? 'Cracked wide open! Everything inside is yours.' : this.lock ? `The lock jammed, but ${this.lock} of ${SAFE.locks} opened.` : 'The lock jammed shut. Better luck with the next one.');
    $('safe-done').hidden = false;
    $('safe-done').textContent = this.lock ? 'Collect' : 'OK';
    this.onSound(won ? 'done' : 'miss');
  }

  /** Closing pays for whatever was opened, even mid-game. */
  private close(): void {
    if (!this.finished && !this.running) {
      $('safe').hidden = true;
      return;
    }
    this.running = false;
    cancelAnimationFrame(this.frame);
    $('safe').hidden = true;
    this.finished = false;
    this.game.finishSafe(this.lock);
  }
}

// ---------- Collection book ----------

export class BookPanel {
  private key = '';
  constructor(private game: Game) {}

  render(): void {
    const s = this.game.state;
    const sets = SETS.map((set) => ({ set, items: set.items(s) }));
    const key = sets.map(({ items }) => items.map((x) => (x.got ? 1 : 0)).join('')).join('|') + [...s.setsDone].join();
    if (key === this.key) return;
    this.key = key;
    setText($('book-sum'), `${s.setsDone.size} / ${SETS.length}`);
    $('book-list').innerHTML = sets
      .map(({ set, items }) => {
        const got = items.filter((x) => x.got).length;
        const done = s.setsDone.has(set.id);
        const skin = SKINS.find((k) => k.id === set.skin)!;
        const chips = items.map((x) => `<span class="book-chip${x.got ? ' got' : ''}">${x.got ? esc(x.item.name) : '???'}</span>`).join('');
        return `<li class="book-set${done ? ' done' : ''}" style="--c:${hex(set.color)}">
          <div class="book-head"><b>${esc(set.name)}</b><span class="book-count">${done ? `${ICONS.check}Complete` : `${got} / ${items.length}`}</span></div>
          <div class="book-desc">${esc(set.desc)}</div>
          <div class="book-bar"><i style="width:${((got / items.length) * 100).toFixed(1)}%"></i></div>
          <div class="book-chips">${chips}</div>
          <div class="book-reward">${ICONS.crystal}${set.crystals} crystals and the <b>${esc(skin.name)}</b> station skin</div>
        </li>`;
      })
      .join('');
  }
}

// ---------- Station skins ----------

export class SkinPanel {
  private key = '';
  constructor(private game: Game) {
    $('skin-list').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-skin]');
      if (!btn) return;
      this.game.chooseStationSkin(btn.dataset.skin === 'none' ? null : btn.dataset.skin!);
      this.key = '';
      this.render();
    });
  }

  render(): void {
    const s = this.game.state;
    const key = [...s.setsDone].join() + s.skin;
    if (key === this.key) return;
    this.key = key;
    const none = `<li><button type="button" class="decor-card${s.skin === null ? ' on' : ''}" data-skin="none">
      <span class="decor-swatch"><span class="hull" style="--t:#ffffff"><i></i></span></span><span class="decor-name">Plain</span><span class="decor-tag">${s.skin === null ? 'In use' : 'Use'}</span></button></li>`;
    $('skin-list').innerHTML =
      none +
      SKINS.map((k) => {
        const open = skinUnlocked(s, k.id);
        const set = SETS.find((x) => x.skin === k.id)!;
        const on = s.skin === k.id;
        const tag = on ? 'In use' : open ? 'Use' : `${ICONS.lock}${esc(set.name)}`;
        return `<li><button type="button" class="decor-card skin-card${on ? ' on' : ''}" data-skin="${k.id}" ${open ? '' : 'disabled'}>
          <span class="decor-swatch"><span class="hull skin" style="--t:${hex(k.hull)};--g:${hex(k.core)};--m:${hex(k.machines)}"><i></i><b></b></span></span>
          <span class="decor-name">${esc(k.name)}</span><span class="decor-tag">${tag}</span></button></li>`;
      }).join('');
  }
}

/** Toast text for a finished set. */
export function setDoneText(id: string): string {
  const set = SETS.find((x) => x.id === id)!;
  const skin = SKINS.find((k) => k.id === set.skin)!;
  return `<b>Collection complete: ${esc(set.name)}!</b> +${set.crystals} crystals and the ${esc(skin.name)} skin (Station, Decor)`;
}

/** Toast text for a cracked safe. */
export function safeText(r: meta.SafeReward, fmt: Fmt): string {
  const name = SAFE_TYPES.find((t) => t.id === r.type)!.name;
  if (!r.locks) return `The ${name} stayed shut`;
  return `<b>${name}: ${r.locks} of ${SAFE.locks} locks!</b> +${fmt(r.scrap)} and ${r.crystals} crystals${r.newEntry ? '. New collection entry!' : ''}`;
}
