import { DIVE, DROPS, chargeSecondsLeft, diveOpen, pickDrop, type DropKind } from '../core/dive';
import { formatDuration, type Decimal } from '../core/num';
import type { Game } from '../game';
import { colorBlindOn } from './comfort';

/**
 * Salvage dives: a Dive button on the side rail and a card holding a little canvas arcade.
 * Slide (or use the arrow keys) to move the claw and catch what falls; mines cost a life.
 */

const $ = (id: string) => document.getElementById(id)!;

export interface DiveHooks {
  catch(kind: DropKind): void;
  hurt(): void;
  start(): void;
  end(): void;
  buzz(ms: number | number[]): void;
}

interface Drop {
  kind: DropKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  a: number;
}

interface Pop {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

type Phase = 'ready' | 'play' | 'done';

export class DivePanel {
  private phase: Phase = 'ready';
  private raf = 0;
  private last = 0;
  private t = 0;
  private spawnIn = 0;
  private drops: Drop[] = [];
  private pops: Pop[] = [];
  private bubbles: { x: number; y: number; r: number; v: number }[] = [];
  private clawX = 0.5;
  private targetX = 0.5;
  private points = 0;
  private crystals = 0;
  private lives = DIVE.lives;
  private hurtT = 0;
  private keys = { left: false, right: false };
  private result: { points: number; scrap: Decimal; crystals: number; best: boolean } | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private w = 320;
  private h = 420;

  constructor(
    private game: Game,
    private fmt: (v: Decimal) => string,
    private hooks: DiveHooks,
  ) {
    $('dive-btn').addEventListener('click', () => this.open());
    $('dive-close').addEventListener('click', () => this.close());
    $('dive').addEventListener('click', (e) => {
      if (e.target === $('dive')) this.close();
    });
    $('dive-go').addEventListener('click', () => this.begin());
    const canvas = $('dive-canvas') as HTMLCanvasElement;
    const aim = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      this.targetX = Math.max(0.06, Math.min(0.94, (e.clientX - r.left) / r.width));
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      aim(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' || e.buttons) aim(e);
    });
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'ArrowLeft' || e.key === 'a') this.keys.left = true;
      else if (e.key === 'ArrowRight' || e.key === 'd') this.keys.right = true;
      else if ((e.code === 'Space' || e.key === 'Enter') && this.phase !== 'play' && !(e.target as HTMLElement | null)?.closest('button')) {
        e.preventDefault();
        this.begin();
      } else return;
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') this.keys.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') this.keys.right = false;
    });
    this.render();
  }

  get isOpen(): boolean {
    return !$('dive').hidden;
  }

  open(): void {
    $('dive').hidden = false;
    if (this.phase === 'play') return;
    this.phase = 'ready';
    this.result = null;
    this.size();
    this.resetField();
    this.loop();
    this.render();
  }

  close(): void {
    // Leaving mid-dive still pays what was caught.
    if (this.phase === 'play') this.finish();
    $('dive').hidden = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** The dive's own payout came back from the game. */
  showResult(r: { points: number; scrap: Decimal; crystals: number; best: boolean }): void {
    this.result = r;
    this.render();
  }

  private size(): void {
    const canvas = $('dive-canvas') as HTMLCanvasElement;
    const box = canvas.parentElement!.getBoundingClientRect();
    this.w = Math.max(240, Math.round(box.width));
    this.h = Math.round(Math.min(440, Math.max(300, window.innerHeight * 0.5)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = this.w * dpr;
    canvas.height = this.h * dpr;
    canvas.style.height = `${this.h}px`;
    this.ctx = canvas.getContext('2d');
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private resetField(): void {
    this.drops = [];
    this.pops = [];
    this.points = 0;
    this.crystals = 0;
    this.lives = DIVE.lives;
    this.t = 0;
    this.spawnIn = 0.6;
    this.clawX = this.targetX = 0.5;
    this.bubbles = Array.from({ length: 18 }, () => ({ x: Math.random() * this.w, y: Math.random() * this.h, r: 1 + Math.random() * 2.5, v: 10 + Math.random() * 25 }));
  }

  private begin(): void {
    if (this.phase === 'play') return;
    if (!this.game.startDive()) return this.render();
    this.size();
    this.resetField();
    this.phase = 'play';
    this.result = null;
    this.hooks.start();
    this.last = performance.now();
    this.loop();
    this.render();
  }

  private finish(): void {
    if (this.phase !== 'play') return;
    this.phase = 'done';
    this.hooks.end();
    this.game.endDive(this.points, this.crystals);
    this.render();
  }

  private loop(): void {
    cancelAnimationFrame(this.raf);
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (this.phase === 'play') this.update(dt);
      else for (const b of this.bubbles) b.y = b.y < -5 ? this.h + 5 : b.y - b.v * dt;
      this.draw();
      if (this.isOpen) this.raf = requestAnimationFrame(step);
    };
    this.last = performance.now();
    this.raf = requestAnimationFrame(step);
  }

  private update(dt: number): void {
    this.t += dt;
    const k = Math.min(1, this.t / DIVE.seconds);
    // Keys nudge the target; the claw eases after it.
    if (this.keys.left) this.targetX = Math.max(0.06, this.targetX - dt * 1.3);
    if (this.keys.right) this.targetX = Math.min(0.94, this.targetX + dt * 1.3);
    this.clawX += (this.targetX - this.clawX) * Math.min(1, dt * 14);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawnIn = DIVE.spawnGap - DIVE.spawnSqueeze * k + Math.random() * 0.15;
      const kind = pickDrop(Math.random());
      this.drops.push({ kind, x: 20 + Math.random() * (this.w - 40), y: -16, vx: (Math.random() - 0.5) * (kind === 'mine' ? 30 + 50 * k : 30), vy: DIVE.fall + DIVE.fallRamp * k + Math.random() * 40 + (kind === 'gold' ? 50 : 0), spin: (Math.random() - 0.5) * 4, a: Math.random() * 6 });
    }
    const cx = this.clawX * this.w;
    const cy = this.h - 46;
    for (const d of this.drops) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.a += d.spin * dt;
      if (d.x < 12 || d.x > this.w - 12) d.vx = -d.vx;
      if (Math.abs(d.x - cx) < DIVE.reach && d.y > cy - 14 && d.y < cy + 14) {
        d.y = this.h + 99;
        this.caught(d, cx, cy);
      }
    }
    this.drops = this.drops.filter((d) => d.y < this.h + 20);
    for (const b of this.bubbles) b.y = b.y < -5 ? this.h + 5 : b.y - b.v * dt;
    for (const p of this.pops) {
      p.life -= dt;
      p.y -= 30 * dt;
    }
    this.pops = this.pops.filter((p) => p.life > 0);
    if (this.t >= DIVE.seconds || this.lives <= 0) this.finish();
    this.renderHud();
  }

  private caught(d: Drop, x: number, y: number): void {
    const info = DROPS[d.kind];
    if (d.kind === 'mine') {
      this.lives--;
      this.hurtT = 0.4;
      this.pops.push({ x, y: y - 20, text: 'Ouch!', color: info.color, life: 0.8 });
      this.hooks.hurt();
      this.hooks.buzz([40, 30, 40]);
    } else if (d.kind === 'crystal') {
      this.crystals++;
      this.pops.push({ x, y: y - 20, text: '+1 crystal', color: info.color, life: 0.8 });
      this.hooks.catch(d.kind);
      this.hooks.buzz(10);
    } else {
      this.points += info.points;
      this.pops.push({ x, y: y - 20, text: `+${info.points}`, color: info.color, life: 0.7 });
      this.hooks.catch(d.kind);
      this.hooks.buzz(d.kind === 'gold' ? 20 : 6);
    }
  }

  private draw(): void {
    const c = this.ctx;
    if (!c) return;
    const { w, h } = this;
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#141a4a');
    bg.addColorStop(1, '#060818');
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    // Light shafts from above.
    c.globalAlpha = 0.06;
    c.fillStyle = '#9fe6ff';
    for (let i = 0; i < 4; i++) {
      const x = ((i * 97 + this.t * 8) % (w + 80)) - 40;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + 40, 0);
      c.lineTo(x + 90, h);
      c.lineTo(x + 50, h);
      c.fill();
    }
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(160,220,255,0.25)';
    for (const b of this.bubbles) {
      c.beginPath();
      c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      c.fill();
    }
    for (const d of this.drops) this.drawDrop(c, d);
    this.drawClaw(c, this.clawX * w, h - 46);
    c.textAlign = 'center';
    c.font = '700 15px Fredoka, sans-serif';
    for (const p of this.pops) {
      c.globalAlpha = Math.min(1, p.life * 2);
      c.fillStyle = p.color;
      c.fillText(p.text, p.x, p.y);
    }
    c.globalAlpha = 1;
    if (this.hurtT > 0) {
      c.fillStyle = `rgba(255,60,90,${this.hurtT * 0.5})`;
      c.fillRect(0, 0, w, h);
    }
  }

  private drawDrop(c: CanvasRenderingContext2D, d: Drop): void {
    const ink = '#141838';
    c.save();
    c.translate(d.x, d.y);
    c.rotate(d.a);
    c.lineWidth = 2;
    c.strokeStyle = ink;
    if (d.kind === 'scrap') {
      c.fillStyle = '#ffb547';
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 ? 7 : 11;
        const a = (i / 8) * Math.PI * 2;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#7a4a1a';
      c.beginPath();
      c.arc(0, 0, 3, 0, Math.PI * 2);
      c.fill();
    } else if (d.kind === 'gold') {
      c.shadowColor = '#ffe066';
      c.shadowBlur = 14;
      c.fillStyle = '#ffe066';
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 6 : 13;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      c.fill();
      c.shadowBlur = 0;
      c.stroke();
    } else if (d.kind === 'crystal') {
      c.shadowColor = '#5cd6ff';
      c.shadowBlur = 12;
      c.fillStyle = '#7ee6ff';
      c.beginPath();
      c.moveTo(0, -12);
      c.lineTo(8, -2);
      c.lineTo(0, 12);
      c.lineTo(-8, -2);
      c.closePath();
      c.fill();
      c.shadowBlur = 0;
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.fillRect(-2, -7, 3, 6);
    } else {
      // Mines: dark with spikes. Colour-blind colours swap the red (close to the orange scrap) for white.
      const warn = colorBlindOn() ? '#ffffff' : '#ff5d6c';
      c.fillStyle = '#3a2440';
      c.strokeStyle = warn;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        c.beginPath();
        c.moveTo(Math.cos(a) * 9, Math.sin(a) * 9);
        c.lineTo(Math.cos(a) * 15, Math.sin(a) * 15);
        c.stroke();
      }
      c.beginPath();
      c.arc(0, 0, 10, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = ink;
      c.stroke();
      c.fillStyle = Math.sin(this.t * 10 + d.x) > 0 ? warn : '#6a2030';
      c.beginPath();
      c.arc(0, 0, 3.5, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  private drawClaw(c: CanvasRenderingContext2D, x: number, y: number): void {
    const ink = '#141838';
    // The cable up to the station.
    c.strokeStyle = 'rgba(200,210,255,0.5)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, y - 14);
    c.stroke();
    c.lineWidth = 2;
    c.strokeStyle = ink;
    c.fillStyle = '#9aa6ff';
    c.beginPath();
    c.roundRect(x - 14, y - 18, 28, 12, 4);
    c.fill();
    c.stroke();
    c.fillStyle = '#4fe3c1';
    c.beginPath();
    c.arc(x, y - 12, 3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#c9cfef';
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(x + s * 10, y - 7);
      c.quadraticCurveTo(x + s * 30, y + 2, x + s * 16, y + 16);
      c.lineTo(x + s * 11, y + 13);
      c.quadraticCurveTo(x + s * 20, y + 3, x + s * 5, y - 6);
      c.closePath();
      c.fill();
      c.stroke();
    }
    if (this.phase === 'play') {
      c.fillStyle = 'rgba(79,227,193,0.12)';
      c.fillRect(x - DIVE.reach, y - 14, DIVE.reach * 2, 28);
    }
  }

  private renderHud(): void {
    $('dive-points').textContent = String(this.points);
    $('dive-lives').innerHTML = Array.from({ length: DIVE.lives }, (_, i) => `<i class="${i < this.lives ? 'on' : ''}"></i>`).join('');
    ($('dive-time') as HTMLElement).style.width = `${Math.max(0, 100 - (this.t / DIVE.seconds) * 100)}%`;
  }

  /** The side button, and the card's state outside play. */
  render(): void {
    const s = this.game.state;
    const now = Date.now();
    this.game.refillDives();
    const btn = $('dive-btn');
    btn.hidden = !diveOpen(s);
    $('dive-dot').hidden = s.dive.charges < DIVE.chargesMax || this.isOpen;
    if (!this.isOpen) return;
    this.renderHud();
    const over = $('dive-over');
    over.hidden = this.phase === 'play';
    if (this.phase === 'play') return;
    const left = chargeSecondsLeft(s, now);
    const charges = `${s.dive.charges} of ${DIVE.chargesMax} dives ready${s.dive.charges < DIVE.chargesMax ? ` · next in ${formatDuration(left)}` : ''}`;
    const r = this.result;
    $('dive-msg').innerHTML = r
      ? `<b class="dive-score">${r.points} points</b><span>+${this.fmt(r.scrap)} scrap${r.crystals ? ` · +${r.crystals} crystals` : ''}</span>${r.best ? '<span class="dive-best">New best!</span>' : `<span>Best: ${s.dive.best}</span>`}`
      : `<b>Salvage dive</b><span>Slide to move the claw. Catch scrap and gold, grab crystals, and dodge the mines. ${DIVE.seconds} seconds, ${DIVE.lives} lives.</span>${s.dive.best ? `<span>Best: ${s.dive.best}</span>` : ''}`;
    $('dive-charges').textContent = charges;
    const go = $('dive-go') as HTMLButtonElement;
    go.disabled = s.dive.charges <= 0;
    go.textContent = r ? 'Dive again' : 'Dive!';
  }
}
