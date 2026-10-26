/**
 * Tiny synthesized sound effects (Web Audio, no files). Browsers only allow audio after the
 * player interacts, so the context is created on the first tap.
 */

/** Ambient loop: four slow chords (A minor, F, C, G), as semitones above A2. */
const CHORDS = [
  [0, 3, 7, 12],
  [-4, 0, 3, 8],
  [3, 7, 10, 15],
  [-2, 2, 5, 10],
];
const CHORD_SEC = 8;
const A2 = 110;

/** Options for one synthesized voice. */
interface Voice {
  freq: number;
  dur: number;
  vol: number;
  start?: number;
  type?: OscillatorType;
  slideTo?: number;
  attack?: number;
  /** A filter on the voice, optionally swept to `to` over its length. */
  filter?: { type: BiquadFilterType; freq: number; to?: number; q?: number };
  /** How much goes to the echo (0 to 1). */
  echo?: number;
  detune?: number;
}

export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private echoBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private musicBus: GainNode | null = null;
  private musicOn = false;
  private musicTimer = 0;
  private nextChordAt = 0;
  private chord = 0;
  private lastTap = 0;
  private lastBuy = 0;
  private lastHit = 0;

  /** Call from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      this.ctx = ctx;
      // Effects -> gentle compressor -> speakers, so layered sounds stay loud without clipping.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(comp);
      // A shared space echo: a generated impulse of decaying stereo noise.
      const verb = ctx.createConvolver();
      verb.buffer = this.impulse(2.4);
      this.echoBus = ctx.createGain();
      this.echoBus.gain.value = 0.55;
      this.echoBus.connect(verb).connect(this.master);
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      // Music runs through its own quiet bus with a soft low-pass, under the effects.
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(lp).connect(ctx.destination);
      const musicVerb = ctx.createGain();
      musicVerb.gain.value = 0.35;
      lp.connect(musicVerb).connect(verb);
      if (this.musicOn) this.startMusic();
    } catch {
      this.ctx = null;
    }
  }

  private impulse(sec: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  /** Routes a voice's output to the dry mix and, if asked, the echo. */
  private out(node: AudioNode, echo = 0): void {
    node.connect(this.master!);
    if (echo > 0) {
      const send = this.ctx!.createGain();
      send.gain.value = echo;
      node.connect(send).connect(this.echoBus!);
    }
  }

  private envelope(g: GainNode, t: number, vol: number, attack: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private filtered(src: AudioNode, t: number, dur: number, f?: Voice['filter']): AudioNode {
    if (!f) return src;
    const bq = this.ctx!.createBiquadFilter();
    bq.type = f.type;
    bq.Q.value = f.q ?? 0.8;
    bq.frequency.setValueAtTime(f.freq, t);
    if (f.to) bq.frequency.exponentialRampToValueAtTime(f.to, t + dur);
    src.connect(bq);
    return bq;
  }

  private voice(v: Voice): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (v.start ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = v.type ?? 'sine';
    osc.frequency.setValueAtTime(v.freq, t);
    if (v.detune) osc.detune.value = v.detune;
    if (v.slideTo) osc.frequency.exponentialRampToValueAtTime(v.slideTo, t + v.dur);
    this.envelope(g, t, v.vol, v.attack ?? 0.006, v.dur);
    osc.connect(g);
    this.out(this.filtered(g, t, v.dur, v.filter), v.echo);
    osc.start(t);
    osc.stop(t + v.dur + 0.05);
  }

  /** A bell or mallet: a sine whose tone is brightened by a decaying modulator (FM). */
  private bell(freq: number, start: number, dur: number, vol: number, ratio = 3.5, index = 2.2, echo = 0.25): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + start;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const depth = ctx.createGain();
    const g = ctx.createGain();
    car.frequency.value = freq;
    mod.frequency.value = freq * ratio;
    depth.gain.setValueAtTime(freq * index, t);
    depth.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur * 0.6);
    mod.connect(depth).connect(car.frequency);
    this.envelope(g, t, vol, 0.004, dur);
    car.connect(g);
    this.out(g, echo);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }

  /** A burst of filtered noise: clicks, whooshes, impacts. */
  private noise(start: number, dur: number, vol: number, filter: Voice['filter'], echo = 0, attack = 0.004): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const g = ctx.createGain();
    this.envelope(g, t, vol, attack, dur);
    src.connect(g);
    this.out(this.filtered(g, t, dur, filter), echo);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private ready(): boolean {
    return this.enabled && !!this.ctx && this.ctx.state === 'running';
  }

  /**
   * A soft, steady clink with a little thump. Same note every time, with only a hint of random
   * detune so it never sounds robotic, and quieter when taps come fast so mashing stays easy on the ears.
   */
  tap(): void {
    if (!this.ready()) return;
    const now = performance.now();
    const fast = now - this.lastTap < 200;
    this.lastTap = now;
    const f = 523.25 * (1 + (Math.random() - 0.5) * 0.03);
    const vol = fast ? 0.6 : 1;
    this.bell(f, 0, 0.14 * vol, 0.22, 2, 1.2, 0.06);
    this.noise(0, 0.025, 0.08 * vol, { type: 'highpass', freq: 4000 });
    this.voice({ freq: 150, slideTo: 70, dur: 0.06, vol: 0.2 * vol, type: 'sine' });
  }

  /** A two-note wooden mallet. */
  buy(): void {
    if (!this.ready()) return;
    // Holding a buy button fires many buys a second; keep the blips from piling up.
    const now = performance.now();
    if (now - this.lastBuy < 70) return;
    this.lastBuy = now;
    this.bell(784, 0, 0.14, 0.24, 4, 1.6, 0.1);
    this.bell(1175, 0.055, 0.2, 0.24, 4, 1.6, 0.15);
    this.noise(0, 0.02, 0.08, { type: 'bandpass', freq: 2500, q: 2 });
  }

  /** A bright rising arpeggio of bells with a shimmer on top. */
  upgrade(): void {
    if (!this.ready()) return;
    [784, 988, 1175, 1568].forEach((f, i) => this.bell(f, i * 0.06, 0.5, 0.16, 3.5, 1.8, 0.35));
    this.voice({ freq: 3136, dur: 0.6, vol: 0.04, start: 0.2, attack: 0.05, echo: 0.5 });
  }

  /** A little fanfare: an arpeggio into a held, warm chord. */
  milestone(): void {
    if (!this.ready()) return;
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.bell(f, i * 0.07, 0.55, 0.16, 2, 1.2, 0.35));
    for (const [f, d] of [[523, -7], [659, 7], [784, -5]] as [number, number][]) {
      this.voice({ freq: f, detune: d, dur: 1.1, vol: 0.06, start: 0.35, attack: 0.08, type: 'sawtooth', filter: { type: 'lowpass', freq: 2400, to: 700 }, echo: 0.5 });
    }
  }

  /** Overdrive: a filtered riser and a rush of air, landing on a punchy low hit. */
  boost(): void {
    if (!this.ready()) return;
    this.voice({ freq: 110, slideTo: 440, dur: 0.6, vol: 0.12, type: 'sawtooth', attack: 0.05, filter: { type: 'lowpass', freq: 300, to: 5000, q: 6 } });
    this.voice({ freq: 165, slideTo: 660, dur: 0.6, vol: 0.08, type: 'sawtooth', attack: 0.05, detune: 8, filter: { type: 'lowpass', freq: 300, to: 5000, q: 6 } });
    this.noise(0, 0.6, 0.12, { type: 'bandpass', freq: 400, to: 6000, q: 1.5 }, 0.3, 0.3);
    this.voice({ freq: 90, slideTo: 40, dur: 0.35, vol: 0.3, start: 0.55 });
    this.noise(0.55, 0.25, 0.14, { type: 'lowpass', freq: 3000, to: 300 }, 0.3);
  }

  /** The crate pops open: a woody knock, then a sparkle of bells. */
  crate(): void {
    if (!this.ready()) return;
    this.noise(0, 0.07, 0.25, { type: 'bandpass', freq: 900, q: 3 });
    this.voice({ freq: 220, slideTo: 110, dur: 0.1, vol: 0.2 });
    [1047, 1319, 1568, 2093, 2637].forEach((f, i) => this.bell(f, 0.05 + i * 0.04, 0.35, 0.12, 3.5, 1.5, 0.35));
  }

  /** A handful of coins: classic two-step pings, scattered. */
  coins(): void {
    if (!this.ready()) return;
    for (let i = 0; i < 5; i++) {
      const t = i * 0.065 + Math.random() * 0.02;
      const f = 1318 * Math.pow(2, (Math.floor(Math.random() * 3) * 2) / 12);
      this.voice({ freq: f * 0.75, dur: 0.05, vol: 0.07, start: t, type: 'square', filter: { type: 'lowpass', freq: 5000 } });
      this.voice({ freq: f, dur: 0.22, vol: 0.07, start: t + 0.045, type: 'square', filter: { type: 'lowpass', freq: 5000 }, echo: 0.2 });
    }
  }

  /** A shining bell chord that rings out. */
  achievement(): void {
    if (!this.ready()) return;
    [880, 1109, 1319, 1760].forEach((f, i) => this.bell(f, i * 0.08, 1.3, 0.13, 1.4, 1.2, 0.5));
    this.voice({ freq: 2637, dur: 1, vol: 0.03, start: 0.3, attack: 0.1, echo: 0.6 });
  }

  /** Relocation: a deep rumble and a long rising whoosh into a bright, echoing chord. */
  warp(): void {
    if (!this.ready()) return;
    this.voice({ freq: 55, slideTo: 110, dur: 1.6, vol: 0.2, attack: 0.4, type: 'triangle' });
    this.voice({ freq: 90, slideTo: 1400, dur: 1.6, vol: 0.08, type: 'sawtooth', attack: 0.3, filter: { type: 'lowpass', freq: 400, to: 6000, q: 4 } });
    this.noise(0, 1.6, 0.16, { type: 'bandpass', freq: 200, to: 7000, q: 1.2 }, 0.4, 1);
    this.noise(1.5, 0.6, 0.18, { type: 'lowpass', freq: 6000, to: 300 }, 0.5);
    this.voice({ freq: 70, slideTo: 32, dur: 0.6, vol: 0.3, start: 1.5 });
    [523, 784, 1047, 1568, 2093].forEach((f, i) => this.bell(f, 1.5 + i * 0.05, 1.4, 0.12, 2, 1.4, 0.6));
  }

  /** A meteor breaking: a rocky crunch and boom, then a glint of the scrap inside. */
  meteor(): void {
    if (!this.ready()) return;
    this.noise(0, 0.4, 0.5, { type: 'lowpass', freq: 2500, to: 150 }, 0.25);
    this.noise(0, 0.08, 0.2, { type: 'bandpass', freq: 3200, q: 1.5 });
    this.voice({ freq: 130, slideTo: 38, dur: 0.35, vol: 0.32 });
    this.bell(1760, 0.1, 0.35, 0.08, 3.5, 1.5, 0.3);
  }

  /** A soft two-note chime when an event begins. */
  event(): void {
    if (!this.ready()) return;
    [659, 988, 659, 988].forEach((f, i) => this.bell(f, i * 0.13, 0.4, 0.13, 2, 1, 0.4));
  }

  /** A boss wreck arriving: a deep boom and a wailing two-tone klaxon. */
  bossAlarm(): void {
    if (!this.ready()) return;
    this.voice({ freq: 70, slideTo: 30, dur: 0.9, vol: 0.32 });
    this.noise(0, 0.8, 0.22, { type: 'lowpass', freq: 1800, to: 100 }, 0.4);
    for (let i = 0; i < 3; i++) {
      for (const [f, at] of [[330, 0], [440, 0.21]] as [number, number][]) {
        for (const d of [-10, 10]) {
          this.voice({ freq: f, detune: d, dur: 0.22, vol: 0.07, start: 0.15 + i * 0.42 + at, type: 'sawtooth', attack: 0.02, filter: { type: 'bandpass', freq: 1300, q: 1.6 }, echo: 0.3 });
        }
      }
    }
  }

  /** A hit on the boss: a heavy metal clang (spaced out so fast tapping doesn't turn into noise). */
  bossHit(): void {
    if (!this.ready()) return;
    const now = performance.now();
    if (now - this.lastHit < 90) return;
    this.lastHit = now;
    const f = 180 + Math.random() * 60;
    this.bell(f, 0, 0.35, 0.32, 2.76, 3.5, 0.2);
    this.noise(0, 0.06, 0.25, { type: 'bandpass', freq: 2200, q: 1.2 });
  }

  /** The wreck breaks apart: rolling explosions, then a victory flourish. */
  bossBreak(): void {
    if (!this.ready()) return;
    for (let i = 0; i < 3; i++) {
      this.noise(i * 0.16, 0.6, 0.3, { type: 'lowpass', freq: 3000, to: 120 }, 0.4);
      this.voice({ freq: 110 - i * 15, slideTo: 30, dur: 0.5, vol: 0.28, start: i * 0.16 });
    }
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.bell(f, 0.55 + i * 0.07, 0.8, 0.14, 2, 1.3, 0.5));
  }

  /** Research finished: a calm rising triad with a high bell. */
  research(): void {
    if (!this.ready()) return;
    [523, 784, 1047].forEach((f, i) => this.bell(f, i * 0.09, 0.8, 0.14, 1.4, 1, 0.4));
    this.bell(1568, 0.3, 1.1, 0.1, 3.5, 1.2, 0.5);
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
