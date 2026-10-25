/**
 * Tiny synthesized sound effects (Web Audio, no files). Browsers only allow audio after the
 * player interacts, so the context is created on the first tap.
 */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16];

export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private tapStep = 0;
  private lastTap = 0;

  /** Call from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private ready(): boolean {
    return this.enabled && !!this.ctx && this.ctx.state === 'running';
  }

  /** Rapid taps climb a pentatonic scale, so mashing sounds musical. */
  tap(): void {
    if (!this.ready()) return;
    const now = performance.now();
    this.tapStep = now - this.lastTap < 350 ? (this.tapStep + 1) % PENTATONIC.length : 0;
    this.lastTap = now;
    const f = 523.25 * Math.pow(2, PENTATONIC[this.tapStep] / 12);
    this.tone(f, 0, 0.09, 'triangle', 0.35);
    this.tone(f * 2, 0, 0.04, 'sine', 0.12);
  }

  buy(): void {
    if (!this.ready()) return;
    this.tone(660, 0, 0.08, 'square', 0.08);
    this.tone(990, 0.06, 0.12, 'square', 0.08);
  }

  upgrade(): void {
    if (!this.ready()) return;
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, i * 0.06, 0.25, 'triangle', 0.2));
  }

  milestone(): void {
    if (!this.ready()) return;
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, i * 0.07, 0.3, 'triangle', 0.22));
  }

  boost(): void {
    if (!this.ready()) return;
    this.tone(180, 0, 0.6, 'sawtooth', 0.12, 900);
    this.tone(360, 0.05, 0.6, 'triangle', 0.15, 1800);
  }

  crate(): void {
    if (!this.ready()) return;
    [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, i * 0.045, 0.18, 'sine', 0.22));
  }

  coins(): void {
    if (!this.ready()) return;
    for (let i = 0; i < 6; i++) this.tone(1400 + Math.random() * 600, i * 0.07, 0.1, 'sine', 0.15);
  }
}
