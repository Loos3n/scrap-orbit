/**
 * Tiny synthesized sound effects (Web Audio, no files). Browsers only allow audio after the
 * player interacts, so the context is created on the first tap.
 */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16];

/** Ambient loop: four slow chords (A minor, F, C, G), as semitones above A2. */
const CHORDS = [
  [0, 3, 7, 12],
  [-4, 0, 3, 8],
  [3, 7, 10, 15],
  [-2, 2, 5, 10],
];
const CHORD_SEC = 8;
const A2 = 110;

export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicOn = false;
  private musicTimer = 0;
  private nextChordAt = 0;
  private chord = 0;
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
      // Music runs through its own quiet bus with a soft low-pass, under the effects.
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(lp).connect(this.ctx.destination);
      if (this.musicOn) this.startMusic();
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

  achievement(): void {
    if (!this.ready()) return;
    [880, 1109, 1319].forEach((f, i) => this.tone(f, i * 0.09, 0.35, 'sine', 0.2));
  }

  /** Relocation: a long rising whoosh into a bright chord. */
  warp(): void {
    if (!this.ready()) return;
    this.tone(90, 0, 1.6, 'sawtooth', 0.1, 1400);
    this.tone(180, 0.1, 1.5, 'triangle', 0.14, 2600);
    [523, 784, 1047, 1568].forEach((f, i) => this.tone(f, 1.5 + i * 0.05, 0.9, 'triangle', 0.16));
  }

  meteor(): void {
    if (!this.ready()) return;
    this.tone(220, 0, 0.25, 'square', 0.1, 60);
    this.tone(1200, 0, 0.12, 'triangle', 0.15, 2400);
  }

  /** A two-note alert when an event begins. */
  event(): void {
    if (!this.ready()) return;
    [659, 988, 659, 988].forEach((f, i) => this.tone(f, i * 0.12, 0.14, 'triangle', 0.16));
  }

  research(): void {
    if (!this.ready()) return;
    [523, 784, 1047].forEach((f, i) => this.tone(f, i * 0.08, 0.4, 'sine', 0.2));
    this.tone(1568, 0.26, 0.6, 'triangle', 0.12);
  }

  // ---------- Music ----------

  setMusic(on: boolean): void {
    if (on === this.musicOn) return;
    this.musicOn = on;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  private startMusic(): void {
    if (!this.ctx || !this.musicBus || this.musicTimer) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(0.16, t + 3);
    this.nextChordAt = t + 0.1;
    // Schedule a little ahead on a timer; the audio clock keeps the notes on time.
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 400);
    this.scheduleMusic();
  }

  private stopMusic(): void {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = 0;
    if (this.ctx && this.musicBus) {
      const t = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
      this.musicBus.gain.linearRampToValueAtTime(0, t + 1.2);
    }
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || ctx.state !== 'running') return;
    while (this.nextChordAt < ctx.currentTime + 1.5) {
      const start = this.nextChordAt;
      const notes = CHORDS[this.chord % CHORDS.length];
      // Pad: each chord tone as two slightly detuned voices with a slow swell.
      for (const semi of notes) {
        for (const detune of [-6, 6]) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = A2 * Math.pow(2, semi / 12);
          osc.detune.value = detune;
          g.gain.setValueAtTime(0.0001, start);
          g.gain.linearRampToValueAtTime(0.09, start + 2.5);
          g.gain.linearRampToValueAtTime(0.0001, start + CHORD_SEC + 1.5);
          osc.connect(g).connect(this.musicBus);
          osc.start(start);
          osc.stop(start + CHORD_SEC + 1.6);
        }
      }
      // Sparse twinkles from the chord, two octaves up.
      for (let beat = 0; beat < CHORD_SEC; beat += 0.5) {
        if (Math.random() > 0.28) continue;
        const semi = notes[Math.floor(Math.random() * notes.length)] + 24 + (Math.random() < 0.3 ? 12 : 0);
        const t = start + beat;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = A2 * Math.pow(2, semi / 12);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
        osc.connect(g).connect(this.musicBus);
        osc.start(t);
        osc.stop(t + 1.5);
      }
      this.nextChordAt += CHORD_SEC;
      this.chord++;
    }
  }
}
