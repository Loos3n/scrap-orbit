import { Container, Sprite, type Texture } from 'pixi.js';
import * as art from './art';

/*
 * Stardrifter on screen (core/whale.ts has the rules). The egg floats in a soft glow beside the
 * station until it hatches; the whale then swims round the station on a lazy tilted loop, passing
 * in front and behind while small. From the adult stage it is too big for that and glides along
 * a wide path behind the station instead, slow and dimmed by distance. Its tail beats as it swims,
 * a tap makes it wiggle, and a gulp sends it lunging forward.
 */

const TAU = Math.PI * 2;
/** Length of a fully grown elder, in world units (the station's hub is about 120 across). */
const ELDER_LEN = 420;
/** Where the egg floats. */
export const EGG_SPOT = { x: -78, y: 66 };
/** The body sprite's tail stock, where the fluke hinges, in body canvas units. */
const STOCK = { x: 10, y: 55 };

interface Fx {
  burst(x: number, y: number, color: number, count: number, power: number): void;
  ring(x: number, y: number, r: number, color: number): void;
}

export class WhaleView {
  private egg: Sprite | null = null;
  private eggGlow: Sprite | null = null;
  private body: Sprite | null = null;
  private fluke: Sprite | null = null;
  private halo: Sprite | null = null;
  private babies: { body: Sprite; fluke: Sprite; a: number; r: number; speed: number; size: number }[] = [];
  private t = 0;
  /** Where on its loop it is (radians). */
  private a = 0.3;
  private size = 0;
  private shownSize = 0;
  private wiggle = 0;
  private lunge = 0;
  private hatchT = -1;
  private mood = 1;
  private bodyTex: Texture | null = null;
  private flukeTex: Texture | null = null;

  constructor(
    private back: Container,
    private front: Container,
    private far: Container,
    private glow: Texture,
    private fx: Fx,
  ) {}

  private textures(): { body: Texture; fluke: Texture } {
    this.bodyTex ??= art.whaleBody();
    this.flukeTex ??= art.whaleFluke();
    return { body: this.bodyTex, fluke: this.flukeTex };
  }

  /** The egg is waiting (true) or not. */
  setEgg(on: boolean): void {
    if (on && !this.egg) {
      this.eggGlow = new Sprite(this.glow);
      this.eggGlow.anchor.set(0.5);
      this.eggGlow.blendMode = 'add';
      this.eggGlow.tint = 0x7cf0ff;
      this.egg = new Sprite(art.whaleEgg());
      this.egg.anchor.set(0.5);
      this.front.addChild(this.eggGlow, this.egg);
    } else if (!on && this.egg) {
      this.egg.destroy();
      this.eggGlow!.destroy();
      this.egg = this.eggGlow = null;
    }
  }

  /**
   * The whale at `size` (share of a full-grown elder; 0 = none) and `mood` (0 to 1, dims its
   * glow when low). `hatch` plays the egg cracking first.
   */
  setWhale(size: number, mood: number, hatch = false): void {
    this.mood = mood;
    if (size <= 0) {
      this.body?.destroy();
      this.fluke?.destroy();
      this.halo?.destroy();
      this.body = this.fluke = this.halo = null;
      this.size = 0;
      return;
    }
    if (!this.body) {
      const tex = this.textures();
      this.halo = new Sprite(this.glow);
      this.halo.anchor.set(0.5);
      this.halo.blendMode = 'add';
      this.halo.tint = 0x5cd6ff;
      this.fluke = new Sprite(tex.fluke);
      this.fluke.anchor.set(1, 0.5);
      this.body = new Sprite(tex.body);
      this.body.anchor.set(0.5);
      this.body.addChild(this.fluke);
      this.fluke.position.set(STOCK.x - art.WHALE_W / 2, STOCK.y - art.WHALE_H / 2);
      this.front.addChild(this.halo, this.body);
      this.shownSize = hatch ? 0.02 : size;
      if (hatch) {
        this.hatchT = 0;
        this.a = Math.atan2(EGG_SPOT.y, EGG_SPOT.x);
      }
    }
    this.size = size;
  }

  /** The Nursery's little ones, circling the station for good. */
  setBabies(n: number): void {
    if (this.babies.length === n) return;
    for (const b of this.babies) b.body.destroy({ children: true });
    this.babies = [];
    const tex = this.textures();
    for (let i = 0; i < n; i++) {
      const body = new Sprite(tex.body);
      body.anchor.set(0.5);
      const fluke = new Sprite(tex.fluke);
      fluke.anchor.set(1, 0.5);
      fluke.position.set(STOCK.x - art.WHALE_W / 2, STOCK.y - art.WHALE_H / 2);
      body.addChild(fluke);
      this.front.addChild(body);
      this.babies.push({ body, fluke, a: (i / n) * TAU, r: 120 + i * 22, speed: 0.22 + i * 0.05, size: 0.08 + (i % 2) * 0.03 });
    }
  }

  /** A happy wiggle when petted. */
  pet(): void {
    this.wiggle = 1;
    const p = this.head();
    if (p) this.fx.burst(p.x, p.y, 0xff8fc8, 8, 0.6);
  }

  /** It lunges and swallows a passing wreck; returns where, for the floating number. */
  gulp(): { x: number; y: number } | null {
    this.lunge = 1;
    const p = this.head();
    if (p) {
      this.fx.ring(p.x, p.y, 18, 0x7cf0ff);
      this.fx.burst(p.x, p.y, 0xffb547, 14, 1);
    }
    return p;
  }

  /** The middle of its head in world units, if it is out. */
  head(): { x: number; y: number } | null {
    const b = this.body;
    if (!b) return null;
    const dir = Math.sign(b.scale.x) || 1;
    return { x: b.x + dir * art.WHALE_W * 0.38 * Math.abs(b.scale.x), y: b.y };
  }

  /** The egg's sprite (for taps), or null. */
  eggSprite(): Sprite | null {
    return this.egg;
  }

  bodySprite(): Sprite | null {
    return this.body;
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    if (this.egg) {
      this.egg.position.set(EGG_SPOT.x, EGG_SPOT.y + Math.sin(t * 1.3) * 2.5);
      this.egg.rotation = Math.sin(t * 0.9) * 0.12;
      this.egg.scale.set(1.35);
      this.eggGlow!.position.copyFrom(this.egg.position);
      this.eggGlow!.scale.set(0.7 + Math.sin(t * 2.2) * 0.1);
      this.eggGlow!.alpha = 0.75;
    }
    for (const b of this.babies) {
      b.a += b.speed * dt * 0.4;
      const x = Math.cos(b.a) * b.r;
      const y = Math.sin(b.a) * b.r * 0.42 - 20;
      const len = b.size * (ELDER_LEN / art.WHALE_W);
      const goingRight = -Math.sin(b.a) > 0;
      b.body.position.set(x, y + Math.sin(t * 2 + b.a) * 3);
      b.body.scale.set(goingRight ? len : -len, len);
      b.fluke.rotation = Math.sin(t * 5 + b.a) * 0.4;
      const layer = Math.sin(b.a) > 0 ? this.front : this.back;
      if (b.body.parent !== layer) layer.addChild(b.body);
    }
    const body = this.body;
    if (!body) return;
    // Grows smoothly toward its stage size.
    this.shownSize += (this.size - this.shownSize) * Math.min(1, dt * (this.hatchT >= 0 ? 1.2 : 0.4));
    if (this.hatchT >= 0) {
      this.hatchT += dt;
      if (this.hatchT > 4) this.hatchT = -1;
    }
    this.lunge = Math.max(0, this.lunge - dt * 0.7);
    this.wiggle = Math.max(0, this.wiggle - dt * 1.4);
    const big = this.shownSize >= 0.6;
    const speed = (big ? 0.035 : 0.09) * (1 + this.lunge * 2.5);
    this.a += speed * dt;
    const a = this.a;
    let x: number;
    let y: number;
    let front: boolean;
    let goingRight: boolean;
    if (big) {
      // A wide, slow glide behind the station, nose first, rising and falling.
      x = Math.cos(a) * 300;
      y = -70 + Math.sin(a * 2) * 40;
      front = false;
      goingRight = -Math.sin(a) > 0;
    } else {
      // A tilted loop round the station, in front on the lower half.
      const rx = 150 + this.shownSize * 120;
      x = Math.cos(a) * rx;
      y = Math.sin(a) * rx * 0.36 + 6;
      front = Math.sin(a) > 0;
      goingRight = -Math.sin(a) > 0;
    }
    // A newborn swims out from the egg's spot.
    if (this.hatchT >= 0) {
      const k = Math.min(1, this.hatchT / 3);
      const e = 1 - Math.pow(1 - k, 3);
      x = EGG_SPOT.x + (x - EGG_SPOT.x) * e;
      y = EGG_SPOT.y + (y - EGG_SPOT.y) * e;
    }
    const layer = front ? this.front : big ? this.far : this.back;
    if (body.parent !== layer) layer.addChild(this.halo!, body);
    const len = this.shownSize * (ELDER_LEN / art.WHALE_W);
    const depth = big ? 0.85 : 1 + Math.sin(a) * 0.08;
    const s = len * depth;
    body.position.set(x, y + Math.sin(t * 1.1) * 4);
    body.scale.set(goingRight ? s : -s, s * (1 + Math.sin(this.wiggle * 18) * 0.05 * this.wiggle));
    // Nose bobs with the rise and fall of its path.
    const climb = big ? Math.cos(a * 2) * 0.12 : Math.cos(a) * 0.08;
    body.rotation = (goingRight ? -climb : climb) + Math.sin(t * 1.1) * 0.03 + Math.sin(this.wiggle * 14) * 0.08 * this.wiggle;
    this.fluke!.rotation = Math.sin(t * (3 + this.lunge * 4)) * (0.32 + this.lunge * 0.2);
    // Far away it is dimmer and bluer; closer and happier it glows brighter.
    const tintK = big ? 0.86 : front ? 1 : 0.88;
    const c = Math.round(255 * tintK);
    body.tint = (c << 16) | (c << 8) | Math.min(255, c + 30);
    body.alpha = big ? 0.92 : 1;
    this.halo!.position.set(x, y);
    this.halo!.scale.set(s * 2.4);
    this.halo!.alpha = (0.25 + this.mood * 0.35) * (0.8 + Math.sin(t * 1.7) * 0.2);
  }

  destroy(): void {
    this.setEgg(false);
    this.setWhale(0, 1);
    this.setBabies(0);
  }
}
