import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { P, type Ramp } from '../art/kit';
import * as art from './art';

/*
 * Machine bays: the first four machines each get one fixed bay on the station, joined to the
 * hub by a truss, instead of a crowd of copies. The machine in a bay grows as more are bought
 * (tiers at 1, 10, 25, 50, 100, 200 and 400 owned): a bigger deck plate, a bigger machine,
 * helper copies at its side, a lamp per tier, and glowing loads that run down the truss to
 * the hub faster the bigger it gets.
 */

export type BayId = 'drone' | 'hauler' | 'smelter' | 'fabricator';
export const BAY_IDS: readonly BayId[] = ['drone', 'smelter', 'hauler', 'fabricator'];
/** How far out the bays sit, in world units. The outer ring runs through them. */
export const BAY_RADIUS = 122;
const TAU = Math.PI * 2;
/** On the diagonals, clear of the solar wings, the claw and the antenna. */
const ANGLE: Record<BayId, number> = { drone: -Math.PI / 4, smelter: (-3 * Math.PI) / 4, hauler: (3 * Math.PI) / 4, fabricator: Math.PI / 4 };
const TIERS = [1, 10, 25, 50, 100, 200, 400];
const COLOR: Record<BayId, number> = { drone: 0x4fe3c1, hauler: 0x7aa7ff, smelter: 0xff8a4c, fabricator: 0xc58cff };
const RAMP: Record<BayId, Ramp> = { drone: P.teal, hauler: P.blue, smelter: P.orange, fabricator: P.purple };
/** The machine's size at tier 0 and how much it gains per tier (a hauler is long, so less). */
const HERO: Record<BayId, [number, number]> = { drone: [1.35, 0.16], hauler: [0.8, 0.08], smelter: [1.15, 0.13], fabricator: [1.3, 0.15] };
const HUB_EDGE = 68;

/** The bay tier for `n` machines owned: -1 for none, then 0 to 6. */
export function bayTier(n: number): number {
  let t = -1;
  TIERS.forEach((th, i) => {
    if (n >= th) t = i;
  });
  return t;
}

/** The deck plate's radius in world units at a tier. */
const padRadius = (tier: number) => 15 + Math.max(0, tier) * 3.4;

interface Bay {
  id: BayId;
  a: number;
  tier: number;
  c: Container;
  shadow: Sprite;
  pool: Sprite;
  pad: Sprite;
  hero: Sprite;
  sats: Sprite[];
  blueprint: Graphics;
  pop: number;
  nextLoad: number;
}

interface Load {
  s: Sprite;
  bay: Bay;
  t: number;
  dur: number;
}

export class Bays {
  /** Trusses and shadows, drawn under everything else on the station. */
  readonly back = new Container();
  /** Deck plates and machines. */
  readonly layer = new Container();
  private truss = new Graphics();
  private bays: Record<BayId, Bay>;
  private padTex = new Map<string, Texture>();
  private loads: Load[] = [];
  private stage = -1;
  private ready = false;

  constructor(
    private glow: Texture,
    private texOf: (id: BayId) => Texture,
    private reducedMotion: boolean,
  ) {
    const make = (id: BayId): Bay => {
      const a = ANGLE[id];
      const c = new Container();
      c.position.set(Math.cos(a) * BAY_RADIUS, Math.sin(a) * BAY_RADIUS);
      const shadow = this.glowSprite(this.back, 0x02020c, 'normal');
      shadow.alpha = 0.5;
      const pool = this.glowSprite(c, COLOR[id], 'add');
      const pad = new Sprite();
      pad.anchor.set(0.5);
      c.addChild(pad);
      const blueprint = new Graphics();
      c.addChild(blueprint);
      const hero = new Sprite(texOf(id));
      hero.anchor.set(0.5);
      c.addChild(hero);
      this.layer.addChild(c);
      return { id, a, tier: -2, c, shadow, pool, pad, hero, sats: [], blueprint, pop: 0, nextLoad: Math.random() * 2 };
    };
    this.bays = { drone: make('drone'), smelter: make('smelter'), hauler: make('hauler'), fabricator: make('fabricator') };
    // The shadows went in first, so the trusses lie on top of them.
    this.back.addChild(this.truss);
  }

  private glowSprite(parent: Container, tint: number, blend: 'add' | 'normal'): Sprite {
    const s = new Sprite(this.glow);
    s.anchor.set(0.5);
    s.tint = tint;
    s.blendMode = blend;
    parent.addChild(s);
    return s;
  }

  private pad(id: BayId, tier: number): Texture {
    const k = `${id}:${tier}`;
    let t = this.padTex.get(k);
    if (!t) {
      t = art.bayPad(RAMP[id], tier);
      this.padTex.set(k, t);
    }
    return t;
  }

  /** Shows each bay at the tier its machine count earns. Returns the bays that just grew. */
  set(owned: Record<BayId, number>): BayId[] {
    const grew: BayId[] = [];
    let changed = false;
    for (const id of BAY_IDS) {
      const b = this.bays[id];
      b.hero.texture = this.texOf(id);
      for (const s of b.sats) s.texture = b.hero.texture;
      const tier = bayTier(owned[id] ?? 0);
      if (tier === b.tier) continue;
      if (this.ready && tier > b.tier) {
        b.pop = 1;
        grew.push(id);
      }
      b.tier = tier;
      changed = true;
      this.dress(b);
    }
    this.ready = true;
    if (changed) this.drawTruss();
    return grew;
  }

  /** The station's growth stage: from stage 2 the trusses become heavy cargo spokes. */
  setStage(stage: number): void {
    if (stage === this.stage) return;
    this.stage = stage;
    this.drawTruss();
  }

  private dress(b: Bay): void {
    const built = b.tier >= 0;
    const r = padRadius(b.tier);
    b.pad.visible = built;
    b.hero.visible = built;
    b.pool.visible = built;
    b.blueprint.visible = !built;
    b.shadow.visible = built;
    b.blueprint.clear();
    if (!built) {
      // An empty bay: a faint blueprint outline, so the player can see where it will go.
      for (let i = 0; i < 30; i++) {
        const k = i / 30;
        const side = Math.floor(k * 6);
        const f = k * 6 - side;
        const a0 = ((-60 + side * 60) * Math.PI) / 180;
        const a1 = ((-60 + (side + 1) * 60) * Math.PI) / 180;
        const x = Math.cos(a0) * r * (1 - f) + Math.cos(a1) * r * f;
        const y = Math.sin(a0) * r * (1 - f) + Math.sin(a1) * r * f;
        b.blueprint.circle(x, y, 0.9).fill({ color: 0x9fd8ff });
      }
      b.blueprint.circle(0, 0, r * 0.55).stroke({ width: 1, color: 0x9fd8ff, alpha: 0.6 });
      b.blueprint.moveTo(-4, 0).lineTo(4, 0).moveTo(0, -4).lineTo(0, 4).stroke({ width: 1.2, color: 0x9fd8ff });
      for (const s of b.sats) s.destroy();
      b.sats = [];
      return;
    }
    b.pad.texture = this.pad(b.id, b.tier);
    const [base, step] = HERO[b.id];
    b.hero.scale.set(base + step * b.tier);
    // Machines face outwards; haulers lie along the ring.
    const face = b.id === 'drone' ? b.a : b.a + Math.PI / 2;
    b.hero.rotation = face;
    b.pool.scale.set((r * 2.6) / 32);
    b.pool.alpha = 0.1 + b.tier * 0.025;
    b.shadow.scale.set((r * 2.5) / 32);
    b.shadow.position.set(b.c.x + 6, b.c.y + 9);
    // Helper copies: two from tier 2, four from tier 4.
    const want = b.tier >= 4 ? 4 : b.tier >= 2 ? 2 : 0;
    while (b.sats.length < want) {
      const s = new Sprite(b.hero.texture);
      s.anchor.set(0.5);
      b.c.addChildAt(s, b.c.getChildIndex(b.hero));
      b.sats.push(s);
    }
    while (b.sats.length > want) b.sats.pop()!.destroy();
    b.sats.forEach((s, i) => {
      const off = want === 2 ? [Math.PI / 2, -Math.PI / 2][i] : [Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4][i];
      const a = b.a + off;
      s.position.set(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
      s.scale.set(b.hero.scale.x * 0.5);
      s.rotation = face;
    });
  }

  /** Lattice trusses from the hub out to each bay; heavier, with cargo, from stage 2. */
  private drawTruss(): void {
    const g = this.truss.clear();
    const heavy = this.stage >= 2;
    const INK = 0x1b1f4d;
    const LO = 0x4d559f;
    const BASE = 0x8a93d8;
    const HI = 0xd6dbff;
    for (const id of BAY_IDS) {
      const b = this.bays[id];
      const built = b.tier >= 0;
      const r0 = HUB_EDGE;
      const r1 = BAY_RADIUS - padRadius(b.tier) * 0.85;
      const w = heavy ? 4.2 : 3;
      const ca = Math.cos(b.a);
      const sa = Math.sin(b.a);
      // Points along the truss: u runs outwards, v across.
      const P = (u: number, v: number) => [ca * u - sa * v, sa * u + ca * v] as const;
      if (!built) {
        for (let u = r0 + 4; u < r1; u += 6) {
          const [x, y] = P(u, 0);
          g.circle(x, y, 0.8).fill({ color: 0x9fd8ff, alpha: 0.45 });
        }
        continue;
      }
      const rail = (v: number, width: number, color: number, alpha = 1, dx = 0, dy = 0) => {
        const [x0, y0] = P(r0, v);
        const [x1, y1] = P(r1, v);
        g.moveTo(x0 + dx, y0 + dy).lineTo(x1 + dx, y1 + dy).stroke({ width, color, alpha, cap: 'round' });
      };
      // Braces first, so the rails sit on top.
      const steps = Math.max(2, Math.round((r1 - r0) / 7));
      for (let i = 0; i < steps; i++) {
        const u0 = r0 + ((r1 - r0) * i) / steps;
        const u1 = r0 + ((r1 - r0) * (i + 1)) / steps;
        const s = i % 2 ? 1 : -1;
        const [x0, y0] = P(u0, -w * s);
        const [x1, y1] = P(u1, w * s);
        g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 2.2, color: INK });
        g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 1, color: LO });
      }
      for (const v of [-w, w]) {
        rail(v, heavy ? 3.6 : 3, INK);
        rail(v, heavy ? 2.2 : 1.7, LO);
        rail(v, heavy ? 1.1 : 0.8, BASE, 1, -0.4, -0.4);
      }
      rail(-w, 0.5, HI, 0.6, -0.6, -0.6);
      if (heavy) {
        // Cargo crates stacked along the spoke, in the bay's colour and two others.
        const colors = [COLOR[id], 0xffb547, 0x7aa7ff];
        for (let k = 0; k < 3; k++) {
          const u = r0 + 10 + k * 11;
          if (u + 6 > r1) break;
          const side = k % 2 ? 1 : -1;
          const [x, y] = P(u, side * (w + 4.5));
          g.roundRect(x - 4, y - 3.2, 8, 6.4, 1.5).fill({ color: INK });
          g.roundRect(x - 3.2, y - 2.4, 6.4, 4.8, 1.2).fill({ color: colors[k] });
          g.roundRect(x - 3.2, y - 2.4, 6.4, 1.6, 0.8).fill({ color: 0xffffff, alpha: 0.35 });
        }
      }
      // A collar where the truss meets the deck plate.
      const [cx, cy] = P(r1, 0);
      g.circle(cx, cy, w + 2.2).fill({ color: INK }).circle(cx, cy, w + 1).fill({ color: LO }).circle(cx - 0.6, cy - 0.6, w * 0.6).fill({ color: BASE });
    }
  }

  /** The bay's machines, for taps, evolution flares and Mk V tints. */
  spritesOf(id: BayId): Sprite[] {
    const b = this.bays[id];
    return b.tier >= 0 ? [b.hero, ...b.sats] : [];
  }

  /** Something to press on for each built bay: the whole deck plate. */
  pads(id: BayId): Container[] {
    const b = this.bays[id];
    return b.tier >= 0 ? [b.pad] : [];
  }

  /** A built bay's centre in world units (on the station), or null. */
  at(id: BayId): { x: number; y: number; a: number; r: number } | null {
    const b = this.bays[id];
    if (b.tier < 0) return null;
    return { x: b.c.x, y: b.c.y + this.layer.y, a: b.a, r: padRadius(b.tier) };
  }

  update(t: number, dt: number, hubY: number): void {
    this.layer.y = this.back.y = hubY;
    for (const id of BAY_IDS) {
      const b = this.bays[id];
      if (b.tier < 0) {
        b.blueprint.alpha = 0.3 + 0.15 * Math.sin(t * 1.6 + b.a);
        continue;
      }
      b.pop = Math.max(0, b.pop - dt * 1.6);
      const pop = this.reducedMotion ? 0 : Math.sin(b.pop * Math.PI) * 0.22;
      b.c.scale.set(1 + pop);
      b.pool.alpha = 0.1 + b.tier * 0.025 + 0.04 * Math.sin(t * 2 + b.a) + b.pop * 0.4;
      const [base, step] = HERO[id];
      const k = base + step * b.tier;
      switch (id) {
        case 'drone':
          // The hangar's drone hovers on its pad.
          b.hero.y = Math.sin(t * 2.2) * 1.2;
          b.sats.forEach((s, i) => (s.alpha = 0.85 + 0.15 * Math.sin(t * 3 + i)));
          break;
        case 'smelter':
          b.hero.alpha = 0.88 + 0.12 * Math.sin(t * 4);
          break;
        case 'fabricator':
          b.hero.rotation = b.a + Math.PI / 2 + Math.sin(t * 0.9) * 0.12;
          break;
        case 'hauler':
          b.hero.scale.set(k * (1 + 0.015 * Math.sin(t * 1.4)));
          break;
      }
      // Loads run down the truss to the hub: the bigger the bay, the busier.
      if (this.reducedMotion) continue;
      b.nextLoad -= dt;
      if (b.nextLoad <= 0) {
        b.nextLoad = 2.6 / (1 + b.tier * 0.55) * (0.7 + Math.random() * 0.6);
        const s = this.glowSprite(this.layer, COLOR[id], 'add');
        s.scale.set(0.12);
        this.loads.push({ s, bay: b, t: 0, dur: 1.1 + Math.random() * 0.3 });
      }
    }
    for (let i = this.loads.length - 1; i >= 0; i--) {
      const l = this.loads[i];
      l.t += dt;
      const k = l.t / l.dur;
      if (k >= 1 || l.bay.tier < 0) {
        l.s.destroy();
        this.loads.splice(i, 1);
        continue;
      }
      const r1 = BAY_RADIUS - padRadius(l.bay.tier) * 0.85;
      const u = r1 + (HUB_EDGE - r1) * (k * k * (3 - 2 * k));
      l.s.position.set(Math.cos(l.bay.a) * u, Math.sin(l.bay.a) * u);
      l.s.alpha = Math.min(1, k * 6) * Math.min(1, (1 - k) * 5);
      l.s.scale.set(0.1 + 0.05 * Math.sin(k * TAU * 2));
    }
  }
}
