import { Application, Container, Graphics, Text } from 'pixi.js';
import type { GeneratorId } from '../core/config';

/** Size of the world in scene units; the scene scales this to fit the viewport. */
const WORLD = 380;
const TAU = Math.PI * 2;

const COLORS = {
  scrap: 0xffb547,
  hull: 0x2b3170,
  hullLight: 0x4a52a8,
  panel: 0x3a5bd9,
  drone: 0x4fe3c1,
  hauler: 0x7aa7ff,
  smelter: 0xff8a4c,
  fabricator: 0xc58cff,
  dock: 0xffd166,
  debris: 0x6c7099,
  boost: 0xff6b9a,
};

interface Star { x: number; y: number; r: number; depth: number; phase: number }
interface Orbiter { radius: number; angle: number; speed: number; wobble: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; color: number; size: number }
interface Ring { x: number; y: number; r: number; life: number; color: number }
interface Debris { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; crate: boolean; points: number[] }
interface Floater { text: Text; vy: number; life: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Traces an open arc as line segments, so it never joins up with the previous shape. */
function arcPath(g: Graphics, r: number, a0: number, a1: number): Graphics {
  const steps = Math.max(4, Math.ceil(Math.abs(a1 - a0) * 12));
  g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
  for (let i = 1; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return g;
}

export class StationScene {
  readonly app = new Application();
  private world = new Container();
  private bg = new Graphics();
  private starG = new Graphics();
  private orbitG = new Graphics();
  private hub = new Container();
  private hubG = new Graphics();
  private fxG = new Graphics();
  private textLayer = new Container();

  private stars: Star[] = [];
  private drones: Orbiter[] = [];
  private haulers: Orbiter[] = [];
  private sparks: Spark[] = [];
  private rings: Ring[] = [];
  private debris: Debris[] = [];
  private floaters: Floater[] = [];
  private textPool: Text[] = [];

  private owned: Record<GeneratorId, number> = { drone: 0, hauler: 0, smelter: 0, fabricator: 0, dock: 0 };
  private time = 0;
  private squash = 0;
  private boosting = false;
  private nextDebris = 2;
  private nextCrate = rand(40, 70);
  private scale = 1;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Called when the player taps the bonus crate. */
  onCrate: (() => void) | null = null;

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
    this.hub.addChild(this.hubG);
    this.world.addChild(this.orbitG, this.hub, this.fxG, this.textLayer);
    this.app.stage.addChild(this.bg, this.starG, this.world);
    this.layout();
    this.app.renderer.on('resize', () => this.layout());
    this.app.ticker.add((t) => this.frame(Math.min(t.deltaMS / 1000, 0.1)));
  }

  private layout(): void {
    const { width: w, height: h } = this.app.screen;
    this.scale = Math.min(w, h * 1.05) / WORLD;
    this.world.position.set(w / 2, h / 2);
    this.world.scale.set(this.scale);
    this.stars = Array.from({ length: Math.round((w * h) / 2200) }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: rand(0.4, 1.6),
      depth: rand(0.2, 1),
      phase: rand(0, TAU),
    }));
    this.drawBackground(w, h);
  }

  private drawBackground(w: number, h: number): void {
    const g = this.bg.clear();
    // A gas giant peeking in from the lower right.
    const pr = Math.max(w, h) * 0.32;
    const px = w + pr * 0.35;
    const py = h + pr * 0.2;
    for (let i = 0; i < 6; i++) g.circle(px, py, pr + 18 - i * 3).fill({ color: 0xffb27a, alpha: 0.03 });
    g.circle(px, py, pr).fill({ color: 0x3b2a5c });
    g.circle(px - pr * 0.08, py - pr * 0.06, pr * 0.97).fill({ color: 0x4d3570 });
    for (let i = 0; i < 5; i++) {
      g.ellipse(px - pr * 0.1, py - pr * 0.55 + i * pr * 0.2, pr * 0.95, pr * 0.035).fill({ color: 0x6a4a8c, alpha: 0.35 });
    }
  }

  setOwned(owned: Record<GeneratorId, number>): void {
    this.owned = { ...owned };
    const droneCount = Math.min(28, Math.ceil(Math.sqrt(owned.drone) * 3.2));
    while (this.drones.length < droneCount) {
      this.drones.push({ radius: rand(78, 98), angle: rand(0, TAU), speed: rand(0.5, 0.9) * (Math.random() < 0.5 ? 1 : -1), wobble: rand(0, TAU) });
    }
    this.drones.length = droneCount;
    const haulerCount = Math.min(9, Math.ceil(Math.sqrt(owned.hauler) * 1.6));
    while (this.haulers.length < haulerCount) {
      this.haulers.push({ radius: rand(122, 134), angle: rand(0, TAU), speed: rand(0.16, 0.24), wobble: rand(0, TAU) });
    }
    this.haulers.length = haulerCount;
  }

  setBoost(active: boolean): void {
    this.boosting = active;
  }

  /** Converts a screen point to world units. */
  private toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.world.x) / this.scale, y: (sy - this.world.y) / this.scale };
  }

  /** Returns true if the point hit the bonus crate (and consumes it). */
  hitCrate(sx: number, sy: number): boolean {
    const p = this.toWorld(sx, sy);
    const crate = this.debris.find((d) => d.crate && Math.hypot(d.x - p.x, d.y - p.y) < d.size + 18);
    if (!crate) return false;
    this.debris.splice(this.debris.indexOf(crate), 1);
    this.burst(crate.x, crate.y, COLORS.dock, 28, 1.6);
    this.rings.push({ x: crate.x, y: crate.y, r: 8, life: 1, color: COLORS.dock });
    return true;
  }

  /** Effects for a tap at screen point (sx, sy) worth `label`. */
  tapAt(sx: number, sy: number, label: string, big = false): void {
    const p = this.toWorld(sx, sy);
    this.squash = 1;
    // Sparks fly from the claw at the hub's rim toward where the finger landed.
    const ang = Math.atan2(p.y, p.x) || -Math.PI / 2;
    const ox = Math.cos(ang) * 46;
    const oy = Math.sin(ang) * 46;
    this.burst(ox, oy, this.boosting ? COLORS.boost : COLORS.scrap, big ? 22 : 9, big ? 1.5 : 1);
    this.rings.push({ x: 0, y: 0, r: 50, life: 1, color: this.boosting ? COLORS.boost : COLORS.scrap });
    this.floatText(p.x, p.y - 10, label, big);
  }

  private burst(x: number, y: number, color: number, count: number, power: number): void {
    if (this.reducedMotion) count = Math.ceil(count / 3);
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const v = rand(60, 180) * power;
      const life = rand(0.35, 0.7);
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: rand(1.5, 3.5) });
    }
    if (this.sparks.length > 400) this.sparks.splice(0, this.sparks.length - 400);
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
          stroke: { color: 0x0b0d26, width: 4 },
        },
        resolution: 2,
      });
      text.anchor.set(0.5);
    }
    text.text = label;
    text.style.fill = big ? COLORS.dock : this.boosting ? COLORS.boost : COLORS.scrap;
    text.style.fontSize = big ? 32 : 24;
    text.position.set(x + rand(-28, 28), y - 16 + rand(-12, 12));
    text.alpha = 1;
    text.scale.set(0.8);
    this.textLayer.addChild(text);
    this.floaters.push({ text, vy: big ? -50 : -70, life: big ? 1.6 : 0.9 });
    if (this.floaters.length > 30) this.retireFloater(this.floaters[0]);
  }

  private retireFloater(f: Floater): void {
    this.floaters.splice(this.floaters.indexOf(f), 1);
    this.textLayer.removeChild(f.text);
    this.textPool.push(f.text);
  }

  /** A celebratory pulse for milestones and upgrades. */
  celebrate(color = COLORS.dock): void {
    this.rings.push({ x: 0, y: 0, r: 40, life: 1, color });
    this.rings.push({ x: 0, y: 0, r: 20, life: 1.3, color });
    this.burst(0, 0, color, 36, 1.8);
  }

  private frame(dt: number): void {
    this.time += dt;
    const speed = this.boosting ? 2.2 : 1;
    this.drawStars(dt * speed);
    this.updateDebris(dt);
    this.drawOrbits(dt * speed);
    this.drawHub(dt);
    this.drawFx(dt);
  }

  private drawStars(dt: number): void {
    const { height: h, width: w } = this.app.screen;
    const g = this.starG.clear();
    for (const s of this.stars) {
      s.y += dt * 6 * s.depth;
      if (s.y > h) {
        s.y -= h;
        s.x = Math.random() * w;
      }
      const tw = this.reducedMotion ? 0.8 : 0.55 + 0.45 * Math.sin(this.time * 1.7 + s.phase);
      g.circle(s.x, s.y, s.r).fill({ color: 0xdfe3ff, alpha: tw * s.depth });
    }
  }

  private updateDebris(dt: number): void {
    const half = WORLD * 0.75;
    this.nextDebris -= dt;
    this.nextCrate -= dt;
    const spawn = (crate: boolean) => {
      const fromLeft = Math.random() < 0.5;
      const size = crate ? 13 : rand(4, 11);
      const sides = crate ? 4 : 5 + Math.floor(Math.random() * 3);
      const points: number[] = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * TAU + (crate ? Math.PI / 4 : 0);
        const r = crate ? size : size * rand(0.6, 1);
        points.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      this.debris.push({
        x: fromLeft ? -half : half,
        y: rand(-WORLD * 0.4, WORLD * 0.4),
        vx: (fromLeft ? 1 : -1) * (crate ? rand(28, 36) : rand(14, 30)),
        vy: rand(-6, 6),
        rot: rand(0, TAU),
        vr: rand(-1, 1),
        size,
        crate,
        points,
      });
    };
    if (this.nextDebris <= 0) {
      spawn(false);
      this.nextDebris = rand(2.5, 6);
    }
    if (this.nextCrate <= 0) {
      spawn(true);
      this.nextCrate = rand(60, 110);
    }
    for (const d of this.debris) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.vr * dt;
    }
    this.debris = this.debris.filter((d) => Math.abs(d.x) <= half + 1);
  }

  private drawOrbits(dt: number): void {
    const g = this.orbitG.clear();
    const t = this.time;

    // Debris and the bonus crate drift behind the station.
    for (const d of this.debris) {
      const c = Math.cos(d.rot);
      const s = Math.sin(d.rot);
      const pts: number[] = [];
      for (let i = 0; i < d.points.length; i += 2) {
        pts.push(d.x + d.points[i] * c - d.points[i + 1] * s, d.y + d.points[i] * s + d.points[i + 1] * c);
      }
      if (d.crate) {
        const glow = 0.5 + 0.5 * Math.sin(t * 6);
        g.circle(d.x, d.y, d.size + 10 + glow * 4).fill({ color: COLORS.dock, alpha: 0.12 });
        g.poly(pts).fill({ color: COLORS.dock }).stroke({ width: 2, color: 0xfff1c4 });
        g.rect(d.x - 1.5, d.y - d.size * 0.7, 3, d.size * 1.4).fill({ color: 0x9c6a12, alpha: 0.6 });
      } else {
        g.poly(pts).fill({ color: COLORS.debris, alpha: 0.75 });
      }
    }

    // Orbital dock: a gold outer ring that fills in as docks are built.
    const docks = this.owned.dock;
    if (docks > 0) {
      const segs = Math.min(12, Math.ceil(docks / 2) + 1);
      const r = 158;
      g.circle(0, 0, r).stroke({ width: 1, color: COLORS.dock, alpha: 0.15 });
      for (let i = 0; i < segs; i++) {
        const a0 = (i / 12) * TAU + t * 0.05;
        arcPath(g, r, a0, a0 + TAU / 12 - 0.08).stroke({ width: 6, color: COLORS.dock, alpha: 0.85, cap: 'round' });
        g.circle(Math.cos(a0) * r, Math.sin(a0) * r, 3.5).fill({ color: 0xfff1c4 });
      }
    }

    // Hauler lane, with haulers towing scrap.
    if (this.haulers.length) g.circle(0, 0, 128).stroke({ width: 1, color: COLORS.hauler, alpha: 0.18 });
    for (const o of this.haulers) {
      o.angle += o.speed * dt;
      const x = Math.cos(o.angle) * o.radius;
      const y = Math.sin(o.angle) * o.radius;
      const tx = -Math.sin(o.angle);
      const ty = Math.cos(o.angle);
      g.moveTo(x, y).lineTo(x - tx * 14, y - ty * 14).stroke({ width: 1, color: COLORS.hauler, alpha: 0.5 });
      g.circle(x - tx * 16, y - ty * 16, 3).fill({ color: COLORS.debris });
      g.roundRect(x - 7, y - 4, 14, 8, 3).fill({ color: COLORS.hauler });
      g.circle(x + tx * 6, y + ty * 6, 2).fill({ color: 0xe8f0ff });
    }

    // Fabricator ring: purple nodes on a counter-rotating inner ring.
    const fabs = Math.min(8, Math.ceil(Math.sqrt(this.owned.fabricator) * 1.5));
    if (fabs > 0) {
      g.circle(0, 0, 108).stroke({ width: 2, color: COLORS.fabricator, alpha: 0.35 });
      for (let i = 0; i < fabs; i++) {
        const a = (i / fabs) * TAU - t * 0.3;
        const x = Math.cos(a) * 108;
        const y = Math.sin(a) * 108;
        g.moveTo(Math.cos(a) * 62, Math.sin(a) * 62).lineTo(x, y).stroke({ width: 1.5, color: COLORS.fabricator, alpha: 0.4 });
        g.rect(x - 5, y - 5, 10, 10).fill({ color: COLORS.fabricator });
      }
    }

    // Drones dart around in a loose swarm.
    for (const o of this.drones) {
      o.angle += o.speed * dt;
      const r = o.radius + Math.sin(t * 2 + o.wobble) * 4;
      const x = Math.cos(o.angle) * r;
      const y = Math.sin(o.angle) * r;
      const dir = o.angle + (o.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
      const c = Math.cos(dir);
      const s = Math.sin(dir);
      g.poly([x + c * 5, y + s * 5, x - c * 3 - s * 3, y - s * 3 + c * 3, x - c * 3 + s * 3, y - s * 3 - c * 3]).fill({ color: COLORS.drone });
    }
  }

  private drawHub(dt: number): void {
    const g = this.hubG.clear();
    const t = this.time;
    this.squash = Math.max(0, this.squash - dt * 6);
    const sq = this.reducedMotion ? 0 : this.squash;
    this.hub.scale.set(1 - sq * 0.08, 1 - sq * 0.08);

    const coreColor = this.boosting ? COLORS.boost : COLORS.scrap;
    // Solar panels.
    for (const side of [-1, 1]) {
      g.rect(side * 60, -3, side * 34, 6).fill({ color: COLORS.hullLight });
      g.rect(side > 0 ? 92 : -128, -14, 36, 28).fill({ color: COLORS.panel });
      for (let i = 1; i < 3; i++) g.rect(side > 0 ? 92 + i * 12 : -128 + i * 12, -14, 1, 28).fill({ color: 0x0b0d26, alpha: 0.5 });
    }
    // Hull and rotating ring.
    g.circle(0, 0, 62).fill({ color: COLORS.hull }).stroke({ width: 2, color: COLORS.hullLight });
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * TAU + t * 0.4;
      arcPath(g, 54, a0, a0 + TAU / 6 - 0.25).stroke({ width: 4, color: COLORS.hullLight, cap: 'round' });
    }
    // Smelter pods bolted onto the hull.
    const pods = Math.min(8, Math.ceil(Math.sqrt(this.owned.smelter) * 1.6));
    for (let i = 0; i < pods; i++) {
      const a = (i / pods) * TAU + Math.PI / pods;
      const x = Math.cos(a) * 66;
      const y = Math.sin(a) * 66;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + i);
      g.circle(x, y, 11 + pulse * 3).fill({ color: COLORS.smelter, alpha: 0.18 });
      g.circle(x, y, 8).fill({ color: COLORS.smelter }).stroke({ width: 2, color: 0xffd0b0 });
    }
    // Glowing core.
    const beat = 0.5 + 0.5 * Math.sin(t * (this.boosting ? 9 : 2.4));
    for (let i = 4; i > 0; i--) g.circle(0, 0, 30 + i * 5 + beat * 3).fill({ color: coreColor, alpha: 0.07 });
    g.circle(0, 0, 30).fill({ color: coreColor });
    g.circle(-8, -9, 10).fill({ color: 0xffffff, alpha: 0.35 });
    // The salvage claw on top.
    g.rect(-4, -84, 8, 22).fill({ color: COLORS.hullLight });
    g.moveTo(-4, -84).lineTo(-14, -96).lineTo(-8, -100).stroke({ width: 4, color: 0xd6dbff, cap: 'round', join: 'round' });
    g.moveTo(4, -84).lineTo(14, -96).lineTo(8, -100).stroke({ width: 4, color: 0xd6dbff, cap: 'round', join: 'round' });
  }

  private drawFx(dt: number): void {
    const g = this.fxG.clear();
    for (const s of this.sparks) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 1 - dt * 3;
      s.vy *= 1 - dt * 3;
      const a = Math.max(0, s.life / s.max);
      g.rect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size).fill({ color: s.color, alpha: a });
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    for (const r of this.rings) {
      r.life -= dt * 2.2;
      r.r += dt * 90;
      g.circle(r.x, r.y, r.r).stroke({ width: 2.5, color: r.color, alpha: Math.max(0, r.life) * 0.6 });
    }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const f of [...this.floaters]) {
      f.life -= dt;
      f.text.y += f.vy * dt;
      f.vy *= 1 - dt * 1.5;
      const grow = Math.min(1, f.text.scale.x + dt * 6);
      f.text.scale.set(grow);
      f.text.alpha = Math.min(1, f.life * 2.5);
      if (f.life <= 0) this.retireFloater(f);
    }
  }
}
