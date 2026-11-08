/**
 * Celebrations for big moments: a card that pops up over the station and a shower of confetti.
 * With "Reduce flashing" on, the card just fades in and out and there is no confetti.
 */

const $ = (id: string) => document.getElementById(id)!;

export interface Cheer {
  icon: string;
  kicker: string;
  title: string;
  sub: string;
  color: string;
}

const CONFETTI = ['#ff6b9a', '#ffd166', '#4fe3c1', '#7aa7ff', '#c58cff', '#ff9a4c'];
const SHOW_MS = 2600;

export class Fanfare {
  private queue: Cheer[] = [];
  private busy = false;
  private idle: (() => void)[] = [];

  constructor(private calm: () => boolean) {}

  /** Shows a card, after any already showing. */
  cheer(c: Cheer): void {
    if (this.queue.some((q) => q.title === c.title)) return;
    this.queue.push(c);
    if (!this.busy) this.next();
  }

  private next(): void {
    const c = this.queue.shift();
    if (!c) {
      this.busy = false;
      for (const fn of this.idle.splice(0)) fn();
      return;
    }
    this.busy = true;
    const el = $('fanfare');
    $('fanfare-icon').innerHTML = c.icon;
    $('fanfare-kicker').textContent = c.kicker;
    $('fanfare-title').textContent = c.title;
    $('fanfare-sub').innerHTML = c.sub;
    el.style.setProperty('--c', c.color);
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this.confetti([c.color, ...CONFETTI]);
    window.setTimeout(() => {
      el.hidden = true;
      el.classList.remove('show');
      window.setTimeout(() => this.next(), 250);
    }, SHOW_MS);
  }

  /** Runs `fn` once no card is showing, so smaller news doesn't land on top of a celebration. */
  whenIdle(fn: () => void): void {
    if (this.busy) this.idle.push(fn);
    else fn();
  }

  /** Confetti falling from the top of the screen. */
  confetti(colors = CONFETTI): void {
    if (this.calm()) return;
    const box = $('confetti');
    const pieces: HTMLElement[] = [];
    for (let i = 0; i < 44; i++) {
      const p = document.createElement('i');
      p.style.setProperty('--x', `${Math.random() * 100}vw`);
      p.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
      p.style.setProperty('--r', `${(Math.random() - 0.5) * 1440}deg`);
      p.style.setProperty('--d', `${1.6 + Math.random() * 1.2}s`);
      p.style.setProperty('--delay', `${Math.random() * 0.35}s`);
      p.style.background = colors[i % colors.length];
      if (i % 3 === 0) p.classList.add('round');
      pieces.push(p);
    }
    box.append(...pieces);
    window.setTimeout(() => pieces.forEach((p) => p.remove()), 3400);
  }
}
