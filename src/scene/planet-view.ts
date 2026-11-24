import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';
import { atmosphereColor, drawPlanet, type PlanetLook } from './planet-art';

/*
 * The living planet on screen (core/planet.ts has the rules, planet-art.ts paints it). It hangs in
 * the sky beside the station as a real turning sphere, redrawn a few times a second, with a soft
 * halo of air. A new era washes over it with a flash. Salvage pods streak down to it from the
 * station, and once it thrives, trade shuttles rise from it to the station.
 */

/** Seconds for one full turn of the surface; the clouds go a little faster. */
const DAY_SEC = 260;
const CLOUD_DAY_SEC = 190;
/** Seconds between redraws while nothing is changing. */
const REDRAW_SEC = 0.2;
const MAX_PX = 320;

interface Flyer {
  s: Sprite;
  glow: Sprite;
  t: number;
  dur: number;
  from: { x: number; y: number };
  to: () => { x: number; y: number };
  bend: number;
  done: () => void;
}

export class PlanetView {
  /** Screen-space layer, behind the station. */
  readonly layer = new Container();
  /** Pods and shuttles fly here, in front of the station. */
  readonly flyLayer = new Container();
  private halo: Sprite;
  private body: Sprite | null = null;
  private fading: { s: Sprite; t: number } | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private source: CanvasSource | null = null;
  private img: ImageData | null = null;
  private look: PlanetLook | null = null;
  private turn = Math.random();
  private cloudTurn = Math.random();
  private redraw = 0;
  private radius = 60;
  private px = 0;
  private flash = 0;
  private night = 0;
  private flyers: Flyer[] = [];
  private sparks: { s: Sprite; life: number; max: number }[] = [];

  constructor(
    private glow: Texture,
    private streak: Texture,
    private resolution: number,
    private reducedMotion: boolean,
  ) {
    this.halo = new Sprite(glow);
    this.halo.anchor.set(0.5);
    this.halo.blendMode = 'add';
    this.layer.addChild(this.halo);
    this.layer.visible = false;
  }

  get shown(): boolean {
    return this.layer.visible && !!this.look;
  }

  /** The look to show, or null to hide it. `flash` plays the new-era wash. */
  setLook(look: PlanetLook | null, flash = false): void {
    if (!look) {
      this.look = null;
      this.layer.visible = false;
      return;
    }
    const same = this.look && this.look.era === look.era && this.look.path === look.path && this.look.lights === look.lights;
    if (same) return;
    if (flash && this.body && this.look) {
      // Keep a still copy of the old planet to fade out over the new one.
      this.fading?.s.destroy({ texture: true });
      const copy = document.createElement('canvas');
      copy.width = copy.height = this.px;
      copy.getContext('2d')?.drawImage(this.canvas!, 0, 0);
      const s = new Sprite(new Texture({ source: new CanvasSource({ resource: copy, resolution: this.resolution }) }));
      s.anchor.set(0.5);
      s.position.copyFrom(this.body.position);
      s.width = s.height = this.radius * 2;
      this.layer.addChild(s);
      this.fading = { s, t: 0 };
      this.flash = 1;
    }
    this.look = { ...look };
    this.layer.visible = true;
    this.halo.tint = atmosphereColor(look);
    this.redraw = 0;
  }

  /** Where it hangs on screen (its centre) and how big it is (radius in screen pixels). */
  place(x: number, y: number, r: number): void {
    this.radius = r;
    const px = Math.max(64, Math.min(MAX_PX, Math.round(r * 2 * this.resolution)));
    if (px !== this.px) {
      this.px = px;
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.canvas.height = px;
      const ctx = this.canvas.getContext('2d');
      this.img = ctx ? ctx.createImageData(px, px) : null;
      this.source?.destroy();
      this.source = new CanvasSource({ resource: this.canvas, resolution: this.resolution });
      const tex = new Texture({ source: this.source });
      if (this.body) {
        this.body.texture.destroy(false);
        this.body.texture = tex;
      } else {
        this.body = new Sprite(tex);
        this.body.anchor.set(0.5);
        this.layer.addChild(this.body);
      }
      this.redraw = 0;
    }
    this.body!.position.set(x, y);
    this.body!.width = this.body!.height = r * 2;
    this.halo.position.set(x, y);
    if (this.fading) {
      this.fading.s.position.set(x, y);
      this.fading.s.width = this.fading.s.height = r * 2;
    }
  }

  get center(): { x: number; y: number; r: number } {
    return { x: this.body?.x ?? 0, y: this.body?.y ?? 0, r: this.radius };
  }

  /** Whether a screen point is on the planet. */
  at(sx: number, sy: number): boolean {
    if (!this.shown || !this.body) return false;
    return Math.hypot(sx - this.body.x, sy - this.body.y) < this.radius * 1.05;
  }

  /** A pod streaks from `from` (screen) down to the planet; `landed` runs as it hits. */
  sendPod(from: { x: number; y: number }, landed: () => void): void {
    const c = this.center;
    const a = Math.random() * Math.PI * 2;
    const k = Math.random() * 0.55;
    const spot = { dx: Math.cos(a) * k, dy: Math.sin(a) * k };
    this.fly(from, () => ({ x: this.center.x + spot.dx * this.center.r, y: this.center.y + spot.dy * this.center.r }), 1.5, 0xffb86b, () => {
      this.spark(c.x + spot.dx * c.r, c.y + spot.dy * c.r, 0xffd29a);
      this.flash = Math.max(this.flash, 0.35);
      landed();
    });
  }

  /** A trade shuttle rises from the planet to `to()` (screen); `arrived` runs when it docks. */
  sendShuttle(to: () => { x: number; y: number }, arrived: () => void): void {
    const c = this.center;
    this.fly({ x: c.x + c.r * 0.3, y: c.y - c.r * 0.5 }, to, 2.6, 0x9ff0ff, arrived);
  }

  private fly(from: { x: number; y: number }, to: () => { x: number; y: number }, dur: number, tint: number, done: () => void): void {
    if (!this.shown || this.reducedMotion) {
      done();
      return;
    }
    const s = new Sprite(this.streak);
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.tint = tint;
    const glow = new Sprite(this.glow);
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.tint = tint;
    glow.scale.set(0.55);
    this.flyLayer.addChild(glow, s);
    this.flyers.push({ s, glow, t: 0, dur, from: { ...from }, to, bend: (Math.random() < 0.5 ? -1 : 1) * (0.18 + Math.random() * 0.12), done });
  }

  private spark(x: number, y: number, tint: number): void {
    const s = new Sprite(this.glow);
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.tint = tint;
    s.position.set(x, y);
    this.layer.addChild(s);
    this.sparks.push({ s, life: 0.9, max: 0.9 });
  }

  update(dt: number, night: number): void {
    // The fliers keep going even with the planet scrolled away, so their payouts still land.
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt / f.dur;
      const to = f.to();
      const t = Math.min(1, f.t);
      const e = t * t * (3 - 2 * t);
      const mx = (f.from.x + to.x) / 2 - (to.y - f.from.y) * f.bend;
      const my = (f.from.y + to.y) / 2 + (to.x - f.from.x) * f.bend;
      const x = (1 - e) * (1 - e) * f.from.x + 2 * (1 - e) * e * mx + e * e * to.x;
      const y = (1 - e) * (1 - e) * f.from.y + 2 * (1 - e) * e * my + e * e * to.y;
      const vx = x - f.s.x;
      const vy = y - f.s.y;
      f.s.position.set(x, y);
      f.glow.position.set(x, y);
      if (vx || vy) f.s.rotation = Math.atan2(vy, vx);
      f.s.scale.set(0.6 + Math.min(1.4, Math.hypot(vx, vy) * 0.1), 0.8);
      f.s.alpha = f.glow.alpha = t < 0.1 ? t * 10 : 1;
      if (f.t >= 1) {
        f.s.destroy();
        f.glow.destroy();
        this.flyers.splice(i, 1);
        f.done();
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life -= dt;
      const k = Math.max(0, p.life / p.max);
      p.s.alpha = k;
      p.s.scale.set((1 - k) * 0.9 + 0.2);
      if (p.life <= 0) {
        p.s.destroy();
        this.sparks.splice(i, 1);
      }
    }
    if (!this.shown || !this.body) return;
    this.night += (night - this.night) * Math.min(1, dt * 0.8);
    if (!this.reducedMotion) {
      this.turn += dt / DAY_SEC;
      this.cloudTurn += dt / CLOUD_DAY_SEC;
    }
    this.redraw -= dt;
    if (this.redraw <= 0 && this.img && this.canvas && this.source && this.look) {
      this.redraw = this.reducedMotion ? 2 : REDRAW_SEC;
      drawPlanet(this.img, this.look, this.turn, this.cloudTurn, this.night);
      this.canvas.getContext('2d')!.putImageData(this.img, 0, 0);
      this.source.update();
    }
    if (this.fading) {
      this.fading.t += dt / 2.4;
      this.fading.s.alpha = Math.max(0, 1 - this.fading.t);
      if (this.fading.t >= 1) {
        this.fading.s.destroy({ texture: true });
        this.fading = null;
      }
    }
    this.flash = Math.max(0, this.flash - dt * 0.6);
    // Drawn above the sky's night shade so it stays the star of the view, but cooled a little at night.
    const n = this.night;
    const tint = ((255 - n * 70) << 16) | ((255 - n * 55) << 8) | 255;
    this.body.tint = tint;
    if (this.fading) this.fading.s.tint = tint;
    const era = this.look?.era ?? 0;
    const air = era === 0 ? 0.12 : era === 1 ? 0.3 : 0.45;
    this.halo.scale.set((this.radius * 2.9) / 64);
    this.halo.alpha = air + this.flash * 0.9;
  }
}
