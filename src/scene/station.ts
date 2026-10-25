import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { GeneratorId } from '../core/config';
import * as art from './art';

/** Size of the world in scene units; the scene scales this to fit the viewport. */
const WORLD = 380;
const TAU = Math.PI * 2;
const DOCK_RADIUS = 160;
const CLAW_TIP = { x: 0, y: -104 };

const COLORS = {
  scrap: 0xffb547,
  drone: 0x4fe3c1,
  hauler: 0x7aa7ff,
  smelter: 0xff8a4c,
  fabricator: 0xc58cff,
  dock: 0xffd166,
  boost: 0xff6b9a,
  white: 0xffffff,
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeInCubic = (t: number) => t * t * t;

interface Star { s: Sprite; depth: number; phase: number; base: number }
interface Orbiter { s: Sprite; radius: number; angle: number; speed: number; wobble: number; cargo?: Sprite }
interface Spark { s: Sprite; vx: number; vy: number; life: number; max: number }
interface Puff { s: Sprite; life: number; max: number; grow: number }
interface Ring { x: number; y: number; r: number; life: number; color: number; width: number }
interface Drift { s: Sprite; vx: number; vy: number; vr: number; crate: boolean; glow?: Sprite }
interface Chunk { s: Sprite; x0: number; y0: number; t: number; dur: number; color: number }
interface Floater { text: Text; vy: number; life: number; max: number }

/** Simple pool so effects don't allocate sprites every tap. */
class Pool {
  private free: Sprite[] = [];
  constructor(private tex: Texture, private parent: Container, private blend: 'add' | 'normal' = 'normal') {}
  get(): Sprite {
    const s = this.free.pop() ?? new Sprite(this.tex);
    s.anchor.set(0.5);
    s.blendMode = this.blend;
    s.visible = true;
    s.alpha = 1;
    s.rotation = 0;
    s.tint = 0xffffff;
    this.parent.addChild(s);
    return s;
  }
  put(s: Sprite): void {
    this.parent.removeChild(s);
    this.free.push(s);
  }
}

export class StationScene {
  readonly app = new Application();

  private tex!: {
    glow: Texture; streak: Texture; flare: Texture; hull: Texture; habitat: Texture; core: Texture;
    wing: Texture; claw: Texture; drone: Texture; hauler: Texture; smelter: Texture; fab: Texture;
    dock: Texture; crate: Texture; debris: Texture[]; planet: Texture;
  };

  private bg = new Sprite();
  private starLayer = new Container();
  private planet = new Sprite();
  private world = new Container();
  private debrisLayer = new Container();
  private lines = new Graphics();
  private dockLayer = new Container();
  private machineLayer = new Container();
  private hub = new Container();
  private habitat!: Sprite;
  private coreGlow!: Sprite;
  private core!: Sprite;
  private claw!: Sprite;
  private podLayer = new Container();
  private lights: Sprite[] = [];
  private droneLayer = new Container();
  private fxLayer = new Container();
  private ringG = new Graphics();
  private textLayer = new Container();

  private sparkPool!: Pool;
  private puffPool!: Pool;
  private chunkPool!: Pool;

  private stars: Star[] = [];
  private drones: Orbiter[] = [];
  private haulers: Orbiter[] = [];
  private pods: Sprite[] = [];
  private fabs: Sprite[] = [];
  private docks: Sprite[] = [];
  private dockedShips: Sprite[] = [];
  private sparks: Spark[] = [];
  private puffs: Puff[] = [];
  private rings: Ring[] = [];
  private drifts: Drift[] = [];
  private chunks: Chunk[] = [];
  private floaters: Floater[] = [];
  private textPool: Text[] = [];
  private comet: { s: Sprite; vx: number; vy: number; life: number } | null = null;

  private time = 0;
  private squash = 0;
  private clawSnap = 0;
  private shake = 0;
  private boosting = false;
  private warp = 0;
  private nextDebris = 1;
  private nextCrate = rand(40, 70);
  private nextComet = rand(6, 14);
  private nextWeld = 0;
  private nextEmber = 0;
  private scale = 1;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private resizeTimer = 0;
  /** The open band of screen between the HUD and the panel, where the station sits. */
  private focus = { top: 0, bottom: 0 };

  async init(el: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: el,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
    });
    el.appendChild(this.app.canvas);

    this.tex = {
      glow: art.glow(),
      streak: art.streak(),
      flare: art.flare(),
      hull: art.hull(),
      habitat: art.habitatRing(),
      core: art.core(),
      wing: art.solarWing(),
      claw: art.claw(),
      drone: art.drone(),
      hauler: art.hauler(),
      smelter: art.smelter(),
      fab: art.fabricator(),
      dock: art.dockSegment(DOCK_RADIUS),
      crate: art.crate(),
      debris: [1, 2, 3, 4, 5, 6].map((n) => art.debris(n * 97)),
      planet: art.planet(260),
    };

    this.buildHub();
    this.sparkPool = new Pool(this.tex.streak, this.fxLayer, 'add');
    this.puffPool = new Pool(this.tex.glow, this.fxLayer, 'add');
    this.chunkPool = new Pool(this.tex.debris[0], this.fxLayer);

    this.planet.texture = this.tex.planet;
    this.planet.anchor.set(0.5);
    this.world.addChild(this.debrisLayer, this.lines, this.dockLayer, this.machineLayer, this.hub, this.droneLayer, this.fxLayer, this.ringG, this.textLayer);
    this.app.stage.addChild(this.bg, this.starLayer, this.planet, this.world);

    this.layout();
    this.app.renderer.on('resize', () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.layout(), 120);
    });
    this.app.ticker.add((t) => this.frame(Math.min(t.deltaMS / 1000, 0.1)));
  }

  private sprite(tex: Texture, parent: Container, x = 0, y = 0): Sprite {
    const s = new Sprite(tex);
    s.anchor.set(0.5);
    s.position.set(x, y);
    parent.addChild(s);
    return s;
  }

  private buildHub(): void {
    const t = this.tex;
    for (const side of [-1, 1]) {
      const wing = this.sprite(t.wing, this.hub, side * 88, 0);
      if (side < 0) wing.scale.x = -1;
    }
    const halo = this.sprite(t.glow, this.hub);
    halo.scale.set(4.4);
    halo.tint = 0x5b6bff;
    halo.alpha = 0.25;
    halo.blendMode = 'add';
    this.sprite(t.hull, this.hub);
    this.hub.addChild(this.podLayer);
    this.habitat = this.sprite(t.habitat, this.hub);
    this.habitat.scale.set(0.82);
    // Blinking beacon lights around the rim.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const l = this.sprite(t.glow, this.hub, Math.cos(a) * 62, Math.sin(a) * 62);
      l.blendMode = 'add';
      l.scale.set(0.22);
      l.tint = i % 2 ? 0xff6b9a : 0x4fe3c1;
      this.lights.push(l);
    }
    this.coreGlow = this.sprite(t.glow, this.hub);
    this.coreGlow.blendMode = 'add';
    this.coreGlow.scale.set(2.2);
    this.core = this.sprite(t.core, this.hub);
    this.core.scale.set(0.95);
    this.claw = this.sprite(t.claw, this.hub, 0, -60);
    this.claw.anchor.set(0.5, 1);
  }

  private layout(): void {
    const { width: w, height: h } = this.app.screen;
    if (w < 2 || h < 2) return;
    const top = this.focus.bottom > this.focus.top ? this.focus.top : 0;
    const bottom = this.focus.bottom > this.focus.top ? this.focus.bottom : h;
    const fh = bottom - top;
    this.scale = Math.min(w, fh * 1.08) / WORLD;
    this.world.position.set(w / 2, top + fh / 2);
    this.world.scale.set(this.scale);

    this.bg.texture?.destroy(true);
    this.bg.texture = art.backdrop(Math.ceil(w), Math.ceil(h));

    // The gas giant rises from behind the panel, off to one side.
    const ps = Math.min(w, fh, 520) * 0.62;
    this.planet.width = ps * 1.7;
    this.planet.height = ps * 1.7;
    this.planet.position.set(w / 2 + Math.min(w, 540) * 0.52, bottom - ps * 0.02);

    for (const st of this.stars) st.s.destroy();
    this.stars = [];
    const count = Math.round((w * h) / 2600);
    for (let i = 0; i < count; i++) {
      const bright = Math.random() < 0.04;
      const s = new Sprite(bright ? this.tex.flare : this.tex.glow);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.position.set(Math.random() * w, Math.random() * h);
      const base = bright ? rand(0.25, 0.45) : rand(0.03, 0.09);
      s.scale.set(base);
      const hue = Math.random();
      s.tint = hue < 0.15 ? 0xffd9a8 : hue < 0.3 ? 0xa8c8ff : 0xffffff;
      this.starLayer.addChild(s);
      this.stars.push({ s, depth: rand(0.2, 1), phase: rand(0, TAU), base });
    }
  }

  setOwned(owned: Record<GeneratorId, number>): void {
    const t = this.tex;

    const droneCount = Math.min(30, Math.ceil(Math.sqrt(owned.drone) * 3.2));
    while (this.drones.length < droneCount) {
      const s = this.sprite(t.drone, this.droneLayer);
      this.drones.push({ s, radius: rand(80, 100), angle: rand(0, TAU), speed: rand(0.55, 0.95) * (Math.random() < 0.5 ? 1 : -1), wobble: rand(0, TAU) });
    }
    while (this.drones.length > droneCount) this.drones.pop()!.s.destroy();

    const haulerCount = Math.min(9, Math.ceil(Math.sqrt(owned.hauler) * 1.6));
    while (this.haulers.length < haulerCount) {
      const cargo = this.sprite(t.debris[this.haulers.length % t.debris.length], this.machineLayer);
      cargo.scale.set(0.55);
      const s = this.sprite(t.hauler, this.machineLayer);
      s.scale.set(0.85);
      this.haulers.push({ s, cargo, radius: rand(124, 136), angle: rand(0, TAU), speed: rand(0.14, 0.22), wobble: rand(0, TAU) });
    }
    while (this.haulers.length > haulerCount) {
      const h = this.haulers.pop()!;
      h.s.destroy();
      h.cargo?.destroy();
    }

    const podCount = Math.min(8, Math.ceil(Math.sqrt(owned.smelter) * 1.6));
    while (this.pods.length < podCount) this.pods.push(this.sprite(t.smelter, this.podLayer));
    while (this.pods.length > podCount) this.pods.pop()!.destroy();
    this.pods.forEach((p, i) => {
      const a = (i / podCount) * TAU + Math.PI / podCount;
      p.position.set(Math.cos(a) * 66, Math.sin(a) * 66);
      p.rotation = a;
      p.scale.set(0.85);
    });

    const fabCount = Math.min(8, Math.ceil(Math.sqrt(owned.fabricator) * 1.5));
    while (this.fabs.length < fabCount) this.fabs.push(this.sprite(t.fab, this.machineLayer));
    while (this.fabs.length > fabCount) this.fabs.pop()!.destroy();

    const dockCount = owned.dock > 0 ? Math.min(12, Math.ceil(owned.dock / 2) + 1) : 0;
    while (this.docks.length < dockCount) {
      const i = this.docks.length;
      const seg = this.sprite(t.dock, this.dockLayer);
      seg.rotation = (i / 12) * TAU;
      this.docks.push(seg);
      if (i % 2 === 0) {
        const ship = this.sprite(t.hauler, this.dockLayer);
        ship.tint = 0xffe6b0;
        ship.scale.set(0.7);
        this.dockedShips.push(ship);
      }
    }
    while (this.docks.length > dockCount) this.docks.pop()!.destroy();
    while (this.dockedShips.length > Math.ceil(dockCount / 2)) this.dockedShips.pop()!.destroy();
  }

  setFocus(top: number, bottom: number): void {
    if (top === this.focus.top && bottom === this.focus.bottom) return;
    this.focus = { top, bottom };
    if (this.tex) this.layout();
  }

  setBoost(active: boolean): void {
    this.boosting = active;
  }

  private toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.world.x) / this.scale, y: (sy - this.world.y) / this.scale };
  }

  /** Returns true if the point hit the bonus crate (and consumes it). */
  hitCrate(sx: number, sy: number): boolean {
    const p = this.toWorld(sx, sy);
    const crate = this.drifts.find((d) => d.crate && Math.hypot(d.s.x - p.x, d.s.y - p.y) < 34);
    if (!crate) return false;
    this.removeDrift(crate);
    this.burst(crate.s.x, crate.s.y, COLORS.dock, 34, 1.7);
    this.puff(crate.s.x, crate.s.y, COLORS.dock, 3, 0.6);
    this.rings.push({ x: crate.s.x, y: crate.s.y, r: 10, life: 1, color: COLORS.dock, width: 3 });
    this.shake = Math.max(this.shake, 6);
    return true;
  }

  /** Effects for a tap at screen point (sx, sy) worth `label`. */
  tapAt(sx: number, sy: number, label: string): void {
    const p = this.toWorld(sx, sy);
    const color = this.boosting ? COLORS.boost : COLORS.scrap;
    this.squash = 1;
    this.clawSnap = 1;
    this.puff(0, 0, color, 1.6, 0.25);
    this.rings.push({ x: 0, y: 0, r: 36, life: 1, color, width: 2.5 });
    this.burst(p.x, p.y, color, 6, 0.6);
    this.floatText(p.x, p.y - 18, label);
    // A piece of scrap gets yanked in from the dark toward the claw.
    if (this.chunks.length < 14) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const d = rand(170, 230);
      const s = this.chunkPool.get();
      s.texture = this.tex.debris[Math.floor(Math.random() * this.tex.debris.length)];
      s.scale.set(rand(0.45, 0.7));
      this.chunks.push({ s, x0: Math.cos(a) * d, y0: Math.sin(a) * d, t: 0, dur: rand(0.28, 0.38), color });
    }
  }

  private burst(x: number, y: number, color: number, count: number, power: number): void {
    if (this.reducedMotion) count = Math.ceil(count / 3);
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const v = rand(70, 200) * power;
      const life = rand(0.3, 0.65);
      const s = this.sparkPool.get();
      s.position.set(x, y);
      s.tint = Math.random() < 0.3 ? 0xffffff : color;
      this.sparks.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life });
    }
    while (this.sparks.length > 300) this.sparkPool.put(this.sparks.shift()!.s);
  }

  private puff(x: number, y: number, color: number, size: number, life: number): void {
    const s = this.puffPool.get();
    s.position.set(x, y);
    s.tint = color;
    s.scale.set(size * 0.5);
    this.puffs.push({ s, life, max: life, grow: size });
  }

  floatText(x: number, y: number, label: string, big = false): void {
    let text = this.textPool.pop();
    if (!text) {
      text = new Text({
        text: '',
        style: {
          fontFamily: 'Fredoka, Rubik, sans-serif',
          fontWeight: '700',
          fontSize: 24,
          fill: COLORS.scrap,
          stroke: { color: 0x0b0d26, width: 5, join: 'round' },
          dropShadow: { color: 0x000000, alpha: 0.4, blur: 2, distance: 2, angle: Math.PI / 2 },
        },
        resolution: 2,
      });
      text.anchor.set(0.5);
    }
    text.text = label;
    text.style.fill = big ? COLORS.dock : this.boosting ? COLORS.boost : COLORS.scrap;
    text.style.fontSize = big ? 34 : 24;
    text.position.set(x + rand(-24, 24), y + rand(-10, 10));
    text.alpha = 1;
    text.scale.set(0.4);
    this.textLayer.addChild(text);
    const life = big ? 1.6 : 0.95;
    this.floaters.push({ text, vy: big ? -45 : -75, life, max: life });
    if (this.floaters.length > 30) this.retireFloater(this.floaters[0]);
  }

  private retireFloater(f: Floater): void {
    this.floaters.splice(this.floaters.indexOf(f), 1);
    this.textLayer.removeChild(f.text);
    this.textPool.push(f.text);
  }

  /** A celebratory pulse for milestones and upgrades. */
  celebrate(color = COLORS.dock): void {
    this.rings.push({ x: 0, y: 0, r: 40, life: 1, color, width: 4 });
    this.rings.push({ x: 0, y: 0, r: 20, life: 1.3, color, width: 2 });
    this.puff(0, 0, color, 5, 0.7);
    this.burst(0, 0, color, 40, 1.9);
    this.shake = Math.max(this.shake, 5);
  }

  private frame(dt: number): void {
    this.time += dt;
    this.warp += ((this.boosting ? 1 : 0) - this.warp) * Math.min(1, dt * 3);
    const speed = 1 + this.warp * 1.4;
    this.updateStars(dt);
    this.updateDrifts(dt);
    this.updateMachines(dt * speed);
    this.updateHub(dt);
    this.updateFx(dt);
    if (!this.reducedMotion && this.shake > 0.05) {
      this.world.pivot.set(rand(-1, 1) * this.shake, rand(-1, 1) * this.shake);
      this.shake *= Math.pow(0.002, dt);
    } else {
      this.world.pivot.set(0, 0);
    }
  }

  private updateStars(dt: number): void {
    const { width: w, height: h } = this.app.screen;
    const fall = 6 + this.warp * 260;
    for (const st of this.stars) {
      const s = st.s;
      s.y += dt * fall * st.depth;
      if (s.y > h + 10) {
        s.y -= h + 20;
        s.x = Math.random() * w;
      }
      const tw = this.reducedMotion ? 0.85 : 0.6 + 0.4 * Math.sin(this.time * 1.6 + st.phase);
      s.alpha = tw * (0.4 + st.depth * 0.6);
      // Overdrive stretches the stars into warp streaks.
      s.scale.set(st.base, st.base * (1 + this.warp * 10 * st.depth));
    }
    this.planet.rotation = Math.sin(this.time * 0.05) * 0.02;

    this.nextComet -= dt;
    if (!this.comet && this.nextComet <= 0 && !this.reducedMotion) {
      const s = new Sprite(this.tex.streak);
      s.anchor.set(1, 0.5);
      s.blendMode = 'add';
      s.scale.set(3, 0.6);
      s.position.set(rand(0, w * 0.6), rand(0, h * 0.3));
      const a = rand(0.35, 0.6);
      s.rotation = a;
      this.starLayer.addChild(s);
      this.comet = { s, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 0.9 };
      this.nextComet = rand(10, 22);
    }
    if (this.comet) {
      const c = this.comet;
      c.life -= dt;
      c.s.x += c.vx * dt;
      c.s.y += c.vy * dt;
      c.s.alpha = Math.min(1, c.life * 2);
      if (c.life <= 0) {
        c.s.destroy();
        this.comet = null;
      }
    }
  }

  private updateDrifts(dt: number): void {
    const half = WORLD * 0.8;
    this.nextDebris -= dt;
    this.nextCrate -= dt;
    const spawn = (crate: boolean) => {
      const fromLeft = Math.random() < 0.5;
      const tex = crate ? this.tex.crate : this.tex.debris[Math.floor(Math.random() * this.tex.debris.length)];
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.position.set(fromLeft ? -half : half, rand(-WORLD * 0.42, WORLD * 0.42));
      s.scale.set(crate ? 1.1 : rand(0.5, 1.1));
      if (!crate) s.alpha = rand(0.55, 0.9);
      let glow: Sprite | undefined;
      if (crate) {
        glow = new Sprite(this.tex.glow);
        glow.anchor.set(0.5);
        glow.blendMode = 'add';
        glow.tint = COLORS.dock;
        this.debrisLayer.addChild(glow);
      }
      this.debrisLayer.addChild(s);
      this.drifts.push({
        s,
        glow,
        vx: (fromLeft ? 1 : -1) * (crate ? rand(26, 34) : rand(12, 28)),
        vy: rand(-6, 6),
        vr: rand(-0.8, 0.8),
        crate,
      });
    };
    if (this.nextDebris <= 0) {
      spawn(false);
      this.nextDebris = rand(1.8, 4.5);
    }
    if (this.nextCrate <= 0) {
      spawn(true);
      this.nextCrate = rand(60, 110);
    }
    for (const d of [...this.drifts]) {
      d.s.x += d.vx * dt;
      d.s.y += d.vy * dt;
      d.s.rotation += d.vr * dt;
      if (d.glow) {
        d.glow.position.copyFrom(d.s.position);
        const p = 0.5 + 0.5 * Math.sin(this.time * 5);
        d.glow.scale.set(1.3 + p * 0.4);
        d.glow.alpha = 0.55 + p * 0.3;
      }
      if (Math.abs(d.s.x) > half + 1) this.removeDrift(d);
    }
  }

  private removeDrift(d: Drift): void {
    this.drifts.splice(this.drifts.indexOf(d), 1);
    d.s.destroy();
    d.glow?.destroy();
  }

  private updateMachines(dt: number): void {
    const g = this.lines.clear();
    const t = this.time;

    // Dock ring turns slowly; docked ships ride along.
    if (this.docks.length) {
      g.circle(0, 0, DOCK_RADIUS).stroke({ width: 1, color: COLORS.dock, alpha: 0.12 });
      const spin = t * 0.04;
      this.docks.forEach((s, i) => (s.rotation = (i / 12) * TAU + spin));
      this.dockedShips.forEach((s, k) => {
        const a = ((k * 2) / 12) * TAU + spin;
        s.position.set(Math.cos(a) * (DOCK_RADIUS + 14), Math.sin(a) * (DOCK_RADIUS + 14));
        s.rotation = a + Math.PI / 2;
      });
    }

    // Haulers tow scrap around their lane.
    if (this.haulers.length) g.circle(0, 0, 130).stroke({ width: 1, color: COLORS.hauler, alpha: 0.14 });
    for (const o of this.haulers) {
      o.angle += o.speed * dt;
      const x = Math.cos(o.angle) * o.radius;
      const y = Math.sin(o.angle) * o.radius;
      o.s.position.set(x, y);
      o.s.rotation = o.angle + Math.PI / 2;
      const ba = o.angle - 0.16;
      const cx = Math.cos(ba) * o.radius;
      const cy = Math.sin(ba) * o.radius;
      o.cargo!.position.set(cx, cy);
      o.cargo!.rotation += dt * 0.6;
      g.moveTo(x - Math.cos(o.s.rotation) * 10, y - Math.sin(o.s.rotation) * 10).lineTo(cx, cy).stroke({ width: 0.8, color: 0xb8ccff, alpha: 0.6 });
      this.trail(g, o.radius, o.angle - 0.07, -1, 0.25, 0x7aa7ff, 2.2);
    }

    // Fabricators ride a counter-rotating ring, tethered to the hull.
    const fabs = this.fabs.length;
    if (fabs) {
      g.circle(0, 0, 110).stroke({ width: 2, color: COLORS.fabricator, alpha: 0.28 });
      this.fabs.forEach((s, i) => {
        const a = (i / fabs) * TAU - t * 0.25;
        const x = Math.cos(a) * 110;
        const y = Math.sin(a) * 110;
        s.position.set(x, y);
        s.rotation = a;
        g.moveTo(Math.cos(a) * 64, Math.sin(a) * 64).lineTo(Math.cos(a) * 100, Math.sin(a) * 100).stroke({ width: 1.4, color: COLORS.fabricator, alpha: 0.35 });
      });
      this.nextWeld -= dt;
      if (this.nextWeld <= 0) {
        const s = this.fabs[Math.floor(Math.random() * fabs)];
        this.burst(s.x, s.y, 0xe7d0ff, 5, 0.35);
        this.puff(s.x, s.y, 0xd6b0ff, 0.9, 0.2);
        this.nextWeld = rand(0.4, 1.4) / Math.sqrt(fabs);
      }
    }

    // Drones dart around in a loose swarm, leaving short trails.
    for (const o of this.drones) {
      o.angle += o.speed * dt;
      const r = o.radius + Math.sin(t * 2 + o.wobble) * 4;
      o.s.position.set(Math.cos(o.angle) * r, Math.sin(o.angle) * r);
      o.s.rotation = o.angle + (o.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.trail(g, r, o.angle, o.speed > 0 ? -1 : 1, 0.3, COLORS.drone, 1.6);
    }
  }

  /** Draws a fading arc behind something orbiting at radius r. */
  private trail(g: Graphics, r: number, angle: number, dir: number, length: number, color: number, width: number): void {
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const a0 = angle + dir * (length * i) / steps;
      const a1 = angle + dir * (length * (i + 1)) / steps;
      g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r)
        .lineTo(Math.cos(a1) * r, Math.sin(a1) * r)
        .stroke({ width: width * (1 - i / steps), color, alpha: 0.5 * (1 - i / steps) });
    }
  }

  private updateHub(dt: number): void {
    const t = this.time;
    this.squash = Math.max(0, this.squash - dt * 5);
    this.clawSnap = Math.max(0, this.clawSnap - dt * 7);
    const sq = this.reducedMotion ? 0 : this.squash;
    const wobble = Math.sin(sq * Math.PI * 2) * 0.04;
    this.hub.scale.set(1 - sq * 0.06 + wobble, 1 - sq * 0.06 - wobble);
    this.hub.y = Math.sin(t * 0.8) * 2;
    this.habitat.rotation = t * 0.35;

    const color = this.boosting ? COLORS.boost : COLORS.scrap;
    const beat = 0.5 + 0.5 * Math.sin(t * (this.boosting ? 10 : 2.4));
    this.core.tint = color;
    this.coreGlow.tint = color;
    this.coreGlow.scale.set(2 + beat * 0.25 + this.squash * 0.6);
    this.coreGlow.alpha = 0.7 + beat * 0.3;
    this.claw.scale.set(1, 1 + Math.sin(this.clawSnap * Math.PI) * 0.18);

    this.lights.forEach((l, i) => {
      const on = Math.sin(t * 3 + i * 1.3) > 0.2;
      l.alpha = on ? 0.9 : 0.15;
    });

    // Smelter pods breathe heat and throw the odd ember.
    this.pods.forEach((p, i) => (p.alpha = 0.85 + 0.15 * Math.sin(t * 4 + i)));
    this.nextEmber -= dt;
    if (this.pods.length && this.nextEmber <= 0) {
      const p = this.pods[Math.floor(Math.random() * this.pods.length)];
      const s = this.sparkPool.get();
      s.position.set(p.x * 1.1, p.y * 1.1 + this.hub.y);
      s.tint = COLORS.smelter;
      s.scale.set(0.3);
      const a = p.rotation + rand(-0.4, 0.4);
      this.sparks.push({ s, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, life: 0.8, max: 0.8 });
      this.nextEmber = rand(0.2, 0.6) / Math.sqrt(this.pods.length);
    }
  }

  private updateFx(dt: number): void {
    for (const sp of [...this.sparks]) {
      sp.life -= dt;
      sp.s.x += sp.vx * dt;
      sp.s.y += sp.vy * dt;
      sp.vx *= 1 - dt * 3;
      sp.vy *= 1 - dt * 3;
      const a = Math.max(0, sp.life / sp.max);
      const v = Math.hypot(sp.vx, sp.vy);
      sp.s.rotation = Math.atan2(sp.vy, sp.vx);
      sp.s.scale.set(Math.max(0.15, v / 260), 0.55);
      sp.s.alpha = a;
      if (sp.life <= 0) {
        this.sparks.splice(this.sparks.indexOf(sp), 1);
        this.sparkPool.put(sp.s);
      }
    }
    for (const p of [...this.puffs]) {
      p.life -= dt;
      const k = 1 - p.life / p.max;
      p.s.scale.set(p.grow * (0.5 + k * 0.7));
      p.s.alpha = Math.max(0, 1 - k) * 0.8;
      if (p.life <= 0) {
        this.puffs.splice(this.puffs.indexOf(p), 1);
        this.puffPool.put(p.s);
      }
    }
    for (const c of [...this.chunks]) {
      c.t += dt / c.dur;
      const k = easeInCubic(Math.min(1, c.t));
      const tip = { x: CLAW_TIP.x, y: CLAW_TIP.y + this.hub.y };
      c.s.position.set(c.x0 + (tip.x - c.x0) * k, c.y0 + (tip.y - c.y0) * k);
      c.s.rotation += dt * 9;
      if (c.t >= 1) {
        this.chunks.splice(this.chunks.indexOf(c), 1);
        this.chunkPool.put(c.s);
        this.burst(tip.x, tip.y, c.color, 7, 0.7);
        this.puff(tip.x, tip.y, c.color, 0.9, 0.18);
      }
    }
    const g = this.ringG.clear();
    for (const r of this.rings) {
      r.life -= dt * 2.2;
      r.r += dt * 110;
      g.circle(r.x, r.y, r.r).stroke({ width: r.width, color: r.color, alpha: Math.max(0, r.life) * 0.55 });
    }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const f of [...this.floaters]) {
      f.life -= dt;
      f.text.y += f.vy * dt;
      f.vy *= 1 - dt * 1.8;
      const age = f.max - f.life;
      // Pop in with a little overshoot, then fade.
      const pop = age < 0.12 ? 0.4 + (age / 0.12) * 0.8 : Math.max(1, 1.2 - (age - 0.12) * 2);
      f.text.scale.set(pop);
      f.text.alpha = Math.min(1, f.life * 2.5);
      if (f.life <= 0) this.retireFloater(f);
    }
  }
}
