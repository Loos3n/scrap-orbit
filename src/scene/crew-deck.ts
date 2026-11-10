import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { CREW, type CrewId } from '../core/content';
import { ARM, BODY, LEG, crewParts, wrench } from './crew-art';

/**
 * The crew, out on the station deck: little figures that stroll round the ring, fix things,
 * stop for a chat, spacewalk out to the machines, fish off the edge, cheer at boss wrecks and
 * go inside to sleep at night (one stays up on watch with a lantern). Tap one and they hop,
 * wave and say something.
 *
 * Everything here is in the hub's own units, with the reactor at (0, 0). Speech bubbles are
 * drawn in screen space so they stay readable however far the camera has pulled back.
 */

const TAU = Math.PI * 2;
/** The deck the crew walk on: a circle round the reactor. */
const R = 60;
const SCALE = 1.1;
/** Where the hatch is: they come and go through it. Bottom, a little right of the antenna. */
const HATCH = Math.PI / 2 - 0.36;
/** The fishing spot: the edge facing the fish tank. */
const FISH_SPOT = 0.6;
/** Spots on the deck where there's always something to fix. */
const WORK_SPOTS = [-2.3, -1.05, -0.2, 0.95, 2.1, 2.75, 3.6];
const WALK = 12;
const ICONS = ['…', '♪', '!', '?', '♥', 'ha!', '★', '~'];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
/** The shortest signed turn from angle a to b. */
const turn = (a: number, b: number) => ((((b - a) % TAU) + TAU * 1.5) % TAU) - Math.PI;

type Act = 'walk' | 'idle' | 'work' | 'chat' | 'wait' | 'cheer' | 'wave' | 'fish' | 'eva' | 'inside' | 'appear' | 'vanish' | 'react';
type Then = 'work' | 'chat' | 'fish' | 'inside' | 'leave' | null;

interface Member {
  id: CrewId;
  c: Container;
  body: Sprite;
  armB: Sprite;
  armF: Sprite;
  legB: Sprite;
  legF: Sprite;
  tool: Sprite;
  rod: Graphics;
  lamp: Sprite | null;
  a: number;
  /** Distance from the reactor: R on deck, more on a spacewalk. */
  r: number;
  target: number;
  act: Act;
  then: Then;
  t: number;
  dur: number;
  face: 1 | -1;
  ph: number;
  hop: number;
  /** 0 hidden to 1 fully out, for coming and going through the hatch. */
  show: number;
  talkCool: number;
  partner: Member | null;
  watch: boolean;
  /** Seconds until they wake (after a night), or wander off after a reaction. */
  delay: number;
  leaving: boolean;
  nextSpark: number;
  bite: number;
  /** A held icon above them while chatting or cheering. */
  icon: number;
}

interface Bubble {
  m: Member;
  c: Container;
  life: number;
  max: number;
  small: boolean;
}

export interface DeckWorld {
  /** 0 day to 1 deep night. */
  night: number;
  /** Where a boss wreck is, in hub units, while one is here. */
  boss: { x: number; y: number } | null;
  /** The fish tank is out, so someone can go fishing. */
  tank: boolean;
  /** Let the crew pipe up on their own now and then. */
  chatter: boolean;
}

export interface DeckFx {
  spark(x: number, y: number, color: number): void;
  puff(x: number, y: number, color: number, size: number, life: number): void;
  /** A hub point on the screen, for speech bubbles. */
  toScreen(x: number, y: number): { x: number; y: number };
  /** A line for someone to say. */
  talk(id: CrewId, why: 'poke' | 'idle' | 'arrive'): string;
  /** The screen's width, to keep bubbles on it. */
  width(): number;
  glow: Texture;
}

export class CrewDeck {
  /** Goes in the hub, under the claw. */
  readonly layer = new Container();
  /** Goes on the stage, above the world: speech bubbles. */
  readonly screen = new Container();
  private members: Member[] = [];
  private bubbles: Bubble[] = [];
  private tethers = new Graphics();
  private hatch = new Graphics();
  private hatchGlow: Sprite;
  private hatchOpen = 0;
  private time = 0;
  private nextChatter = rand(25, 45);
  private bossWas = false;
  private seeded = false;
  private night = 0;
  private world: DeckWorld = { night: 0, boss: null, tank: false, chatter: false };

  constructor(private fx: DeckFx) {
    this.layer.sortableChildren = true;
    this.tethers.zIndex = -1000;
    this.hatch.zIndex = -999;
    this.layer.addChild(this.tethers, this.hatch);
    const hx = Math.cos(HATCH) * R;
    const hy = Math.sin(HATCH) * R;
    this.hatch.ellipse(hx, hy, 6, 3.4).fill({ color: 0x141838, alpha: 0.9 }).stroke({ color: 0x8f98c8, width: 0.8, alpha: 0.9 });
    this.hatch.ellipse(hx, hy - 0.5, 4.2, 2).fill({ color: 0x262c5a });
    this.hatchGlow = new Sprite(fx.glow);
    this.hatchGlow.anchor.set(0.5);
    this.hatchGlow.position.set(hx, hy);
    this.hatchGlow.blendMode = 'add';
    this.hatchGlow.tint = 0xffd08a;
    this.hatchGlow.scale.set(0.22, 0.14);
    this.hatchGlow.alpha = 0;
    this.hatchGlow.zIndex = -998;
    this.layer.addChild(this.hatchGlow);
  }

  /** Who is on the station. New faces come out of the hatch; anyone missing walks in and goes. */
  setCrew(ids: readonly CrewId[]): void {
    const first = !this.seeded;
    this.seeded = true;
    for (const m of this.members) {
      if (!ids.includes(m.id) && !m.leaving) {
        m.leaving = true;
        if (m.act === 'inside') this.remove(m);
        else this.walkTo(m, HATCH, 'leave');
      }
    }
    for (const id of ids) {
      const m = this.members.find((x) => x.id === id);
      if (m) {
        if (m.leaving) {
          m.leaving = false;
          if (m.act === 'walk' && m.then === 'leave') m.then = null;
        }
        continue;
      }
      const born = this.make(id);
      if (first) {
        born.a = rand(0, TAU);
        born.show = 1;
        born.act = 'idle';
        born.dur = rand(0.5, 3);
      } else {
        born.a = HATCH;
        born.act = 'appear';
        born.dur = 0.8;
        born.t = 0;
        born.show = 0;
        this.hatchOpen = 1.5;
        window.setTimeout(() => this.say(id, this.fx.talk(id, 'arrive')), 900);
      }
    }
    this.pickWatch();
  }

  private make(id: CrewId): Member {
    const def = CREW.find((x) => x.id === id)!;
    const parts = crewParts(def);
    const c = new Container();
    c.scale.set(SCALE);
    const sprite = (t: Texture, ax: number, ay: number) => {
      const s = new Sprite(t);
      s.anchor.set(ax, ay);
      return s;
    };
    const legB = sprite(parts.leg, 1.8 / LEG.w, 0.04);
    const legF = sprite(parts.leg, 1.8 / LEG.w, 0.04);
    const armB = sprite(parts.arm, 0.5, 0.08);
    const armF = sprite(parts.arm, 0.5, 0.08);
    const body = sprite(parts.body, BODY.hipX / BODY.w, BODY.hipY / BODY.h);
    legB.position.set(-1.3, -0.8);
    legF.position.set(0.9, -0.8);
    armB.position.set(-2.4, -9.3);
    armF.position.set(2.5, -9.1);
    legB.tint = armB.tint = 0xb4b9dc;
    const tool = sprite(wrench(), 0.5, 0.95);
    tool.position.set(0, ARM.h * 0.72);
    tool.rotation = Math.PI + 0.5;
    tool.visible = false;
    armF.addChild(tool);
    const rod = new Graphics();
    rod.visible = false;
    // A soft shadow on the deck, so they stand out from the hull.
    const shadow = new Graphics();
    shadow.ellipse(0, 0.6, 5.2, 1.7).fill({ color: 0x0b0e2a, alpha: 0.45 });
    c.addChild(shadow, armB, legB, legF, body, rod, armF);
    this.layer.addChild(c);
    const m: Member = {
      id, c, body, armB, armF, legB, legF, tool, rod, lamp: null,
      a: 0, r: R, target: 0, act: 'idle', then: null, t: 0, dur: 2, face: Math.random() < 0.5 ? 1 : -1,
      ph: rand(0, TAU), hop: 0, show: 1, talkCool: 0, partner: null, watch: false, delay: 0,
      leaving: false, nextSpark: 0, bite: 0, icon: 0,
    };
    this.members.push(m);
    return m;
  }

  private remove(m: Member): void {
    if (m.partner) this.endChat(m);
    for (const b of this.bubbles.filter((x) => x.m === m)) this.dropBubble(b);
    m.c.destroy({ children: true });
    this.members.splice(this.members.indexOf(m), 1);
    this.pickWatch();
  }

  /** One crew member stays up at night with a lantern; it rotates by the day. */
  private pickWatch(): void {
    const day = Math.floor(Date.now() / 86_400_000);
    const out = this.members.filter((m) => !m.leaving);
    const watch = out.length ? out[day % out.length] : null;
    for (const m of this.members) {
      m.watch = m === watch;
      if (m.watch && !m.lamp) {
        const l = new Sprite(this.fx.glow);
        l.anchor.set(0.5);
        l.blendMode = 'add';
        l.tint = 0xffc070;
        l.scale.set(0.3);
        l.position.set(0, ARM.h * 0.72);
        l.alpha = 0;
        m.armF.addChild(l);
        m.lamp = l;
      }
    }
  }

  /** A tap at hub point (x, y): the crew member there hops and waves. Returns who, if anyone. */
  poke(x: number, y: number, reach: number): CrewId | null {
    let best: { m: Member; d: number } | null = null;
    for (const m of this.members) {
      if (m.show < 0.6 || m.act === 'inside' || m.leaving) continue;
      const d = Math.hypot(m.c.x - x, m.c.y - 9 * SCALE - y);
      if (d < reach && (!best || d < best.d)) best = { m, d };
    }
    if (!best) return null;
    const m = best.m;
    m.hop = Math.max(m.hop, 1);
    if (m.talkCool > 0) return m.id;
    m.talkCool = 5;
    // Turn to face the player and wave, then carry on.
    if (m.act === 'walk' || m.act === 'idle' || m.act === 'work') {
      m.act = 'wave';
      m.t = 0;
      m.dur = 1.6;
      m.then = null;
    }
    this.say(m.id, this.fx.talk(m.id, 'poke'));
    return m.id;
  }

  /** Someone says something, in a speech bubble over their head. */
  say(id: CrewId, text: string): void {
    const m = this.members.find((x) => x.id === id);
    if (!m || m.act === 'inside') return;
    for (const b of this.bubbles.filter((x) => x.m === m)) this.dropBubble(b);
    const def = CREW.find((x) => x.id === id)!;
    const c = new Container();
    const name = new Text({ text: def.name, style: { fontFamily: 'Fredoka, Rubik, sans-serif', fontWeight: '700', fontSize: 11, fill: def.look.suit, stroke: { color: 0x1b1f45, width: 3, join: 'round' } } });
    const body = new Text({ text, style: { fontFamily: 'Rubik, Fredoka, sans-serif', fontWeight: '500', fontSize: 12.5, fill: 0x1b1f45, wordWrap: true, wordWrapWidth: 172, lineHeight: 16 } });
    const pad = 8;
    const w = Math.max(body.width, name.width) + pad * 2;
    const h = body.height + pad * 2 + 4;
    const g = new Graphics();
    g.roundRect(-w / 2, -h, w, h, 10).fill({ color: 0xfffaf0, alpha: 0.97 }).stroke({ color: 0x1b1f45, width: 1.5 });
    g.poly([-6, -1, 6, -1, 0, 7]).fill({ color: 0xfffaf0 });
    g.moveTo(-6, 0).lineTo(0, 7).lineTo(6, 0).stroke({ color: 0x1b1f45, width: 1.5 });
    name.position.set(-w / 2 + pad - 2, -h - 8);
    body.position.set(-w / 2 + pad, -h + pad + 2);
    c.addChild(g, body, name);
    c.scale.set(0.6);
    this.screen.addChild(c);
    const life = 3.4 + text.length * 0.045;
    this.bubbles.push({ m, c, life, max: life, small: false });
  }

  /** A little icon over someone's head: a note, a heart, dots while they think. */
  private emote(m: Member, icon: string): void {
    if (this.bubbles.some((b) => b.m === m && !b.small)) return;
    for (const b of this.bubbles.filter((x) => x.m === m)) this.dropBubble(b);
    const c = new Container();
    const t = new Text({ text: icon, style: { fontFamily: 'Fredoka, Rubik, sans-serif', fontWeight: '700', fontSize: 13, fill: icon === '♥' ? 0xff5d8a : 0x1b1f45 } });
    t.anchor.set(0.5);
    const w = Math.max(22, t.width + 10);
    const g = new Graphics();
    g.roundRect(-w / 2, -21, w, 18, 9).fill({ color: 0xfffaf0, alpha: 0.95 }).stroke({ color: 0x1b1f45, width: 1.2 });
    g.circle(-2, 1, 2).fill({ color: 0xfffaf0 }).stroke({ color: 0x1b1f45, width: 1 });
    t.position.set(0, -12);
    c.addChild(g, t);
    this.screen.addChild(c);
    this.bubbles.push({ m, c, life: 1.4, max: 1.4, small: true });
  }

  private dropBubble(b: Bubble): void {
    this.bubbles.splice(this.bubbles.indexOf(b), 1);
    b.c.destroy({ children: true });
  }

  /** The crew react together: a broken wreck, one that got away, or a big moment. */
  react(kind: 'win' | 'lose' | 'party', who?: CrewId): void {
    for (const m of this.members) {
      if (m.act === 'inside' || m.show < 0.5 || m.leaving) continue;
      if (who && m.id !== who) continue;
      if (m.partner) this.endChat(m);
      m.act = 'react';
      m.t = 0;
      m.dur = kind === 'lose' ? 2.2 : 2.6;
      m.then = null;
      m.icon = kind === 'lose' ? -1 : 1;
      m.hop = kind === 'lose' ? 0 : 1;
      m.delay = rand(0, 0.5);
      if (m.r > R) m.r = R;
      window.setTimeout(() => this.emote(m, kind === 'lose' ? '…' : kind === 'win' ? '★' : '♥'), rand(0, 400));
    }
  }

  update(dt: number, w: DeckWorld): void {
    this.world = w;
    this.time += dt;
    this.night = w.night;
    const boss = !!w.boss;
    if (boss && !this.bossWas) this.startCheer();
    this.bossWas = boss;

    if (w.chatter) {
      this.nextChatter -= dt;
      if (this.nextChatter <= 0) {
        this.nextChatter = rand(55, 110);
        const out = this.members.filter((m) => m.show > 0.9 && m.act !== 'inside' && !m.leaving && m.act !== 'chat' && m.act !== 'eva');
        if (out.length) {
          const m = out[Math.floor(Math.random() * out.length)];
          this.say(m.id, this.fx.talk(m.id, 'idle'));
        }
      }
    }

    this.tethers.clear();
    for (const m of [...this.members]) this.step(m, dt);
    this.hatchOpen = Math.max(0, this.hatchOpen - dt);
    this.hatchGlow.alpha = Math.min(1, this.hatchOpen) * 0.8 + w.night * 0.25;

    for (const b of [...this.bubbles]) {
      b.life -= dt;
      if (b.life <= 0 || b.m.c.destroyed) {
        this.dropBubble(b);
        continue;
      }
      const m = b.m;
      const head = this.fx.toScreen(m.c.x, m.c.y - 22 * SCALE + this.hopY(m));
      const age = b.max - b.life;
      const pop = Math.min(1, age / 0.18);
      const k = (b.small ? 0.85 : 1) * (0.7 + 0.3 * ease(pop));
      b.c.scale.set(k);
      b.c.alpha = Math.min(pop * 2, b.life / 0.3, 1);
      // Keep long bubbles on screen.
      const half = b.c.width / 2 + 6;
      const sw = this.fx.width();
      b.c.position.set(Math.max(half, Math.min(sw - half, head.x)), head.y - 2);
    }
  }

  private startCheer(): void {
    for (const m of this.members) {
      if (m.act === 'inside' || m.leaving || m.show < 0.5) continue;
      if (m.partner) this.endChat(m);
      m.act = 'cheer';
      m.t = 0;
      m.dur = 999;
      m.then = null;
      m.delay = rand(0, 0.8);
      m.r = Math.min(m.r, R);
    }
  }

  private hopY(m: Member): number {
    return -Math.sin(Math.min(1, m.hop) * Math.PI) * 4;
  }

  private walkTo(m: Member, angle: number, then: Then): void {
    if (m.partner && then !== 'chat') this.endChat(m);
    m.act = 'walk';
    m.target = angle;
    m.then = then;
    m.t = 0;
    m.r = R;
  }

  private endChat(m: Member): void {
    const p = m.partner;
    m.partner = null;
    if (p && p.partner === m) {
      p.partner = null;
      if (p.act === 'chat' || p.act === 'wait') this.next(p);
    }
  }

  /** What to do next, once the current thing is done. */
  private next(m: Member): void {
    m.t = 0;
    m.then = null;
    m.icon = 0;
    if (m.leaving) return this.walkTo(m, HATCH, 'leave');
    if (this.night > 0.6 && !m.watch) return this.walkTo(m, HATCH + rand(-0.04, 0.04), 'inside');
    if (this.world.boss) {
      m.act = 'cheer';
      m.dur = 999;
      return;
    }
    const others = this.members.filter((o) => o !== m && !o.leaving && o.show > 0.9 && (o.act === 'walk' || o.act === 'idle') && !o.partner);
    const someoneFishing = this.members.some((o) => o.act === 'fish' || (o.act === 'walk' && o.then === 'fish'));
    const someoneOut = this.members.some((o) => o.act === 'eva');
    const r = Math.random();
    if (m.watch && this.night > 0.6) {
      // The night watch potters about slowly with the lantern.
      if (r < 0.55) return this.walkTo(m, m.a + rand(-1.4, 1.4), null);
      m.act = 'idle';
      m.dur = rand(3, 7);
      return;
    }
    if (this.world.tank && !someoneFishing && r < 0.14) return this.walkTo(m, FISH_SPOT, 'fish');
    if (!someoneOut && r < 0.24) {
      m.act = 'eva';
      m.dur = 7.5;
      return;
    }
    if (others.length && r < 0.4) {
      const p = others[Math.floor(Math.random() * others.length)];
      p.act = 'wait';
      p.partner = m;
      p.t = 0;
      p.dur = 12;
      m.partner = p;
      const side = turn(p.a, m.a) > 0 ? 1 : -1;
      return this.walkTo(m, p.a + side * 0.2, 'chat');
    }
    if (r < 0.66) return this.walkTo(m, WORK_SPOTS[Math.floor(Math.random() * WORK_SPOTS.length)] + rand(-0.1, 0.1), 'work');
    if (r < 0.78) {
      m.act = 'idle';
      m.dur = rand(2, 5);
      return;
    }
    this.walkTo(m, m.a + rand(-2.2, 2.2), null);
  }

  private arrived(m: Member): void {
    const then = m.then;
    m.then = null;
    m.t = 0;
    if (then === 'leave') {
      m.act = 'vanish';
      m.dur = 0.7;
      this.hatchOpen = 1.2;
      return;
    }
    if (then === 'inside') {
      m.act = 'vanish';
      m.dur = 0.7;
      this.hatchOpen = 1.2;
      return;
    }
    if (then === 'fish') {
      m.act = 'fish';
      m.dur = rand(25, 50);
      m.face = 1;
      m.bite = rand(5, 10);
      return;
    }
    if (then === 'work') {
      m.act = 'work';
      m.dur = rand(4, 7);
      m.face = Math.random() < 0.5 ? 1 : -1;
      return;
    }
    if (then === 'chat' && m.partner && m.partner.partner === m) {
      const p = m.partner;
      m.act = 'chat';
      p.act = 'chat';
      m.dur = p.dur = rand(5, 8);
      p.t = 0;
      // Face each other.
      const dx = p.c.x - m.c.x;
      m.face = dx >= 0 ? 1 : -1;
      p.face = dx >= 0 ? -1 : 1;
      return;
    }
    m.act = 'idle';
    m.dur = rand(1, 3);
  }

  private step(m: Member, dt: number): void {
    m.t += dt;
    m.ph += dt;
    m.talkCool = Math.max(0, m.talkCool - dt);
    if (m.delay > 0) m.delay -= dt;
    // Pose: limb angles (radians, negative swings forward), body lift and lean.
    let legF = 0;
    let legB = 0;
    let armF = 0.12;
    let armB = -0.1;
    let lift = 0;
    let lean = 0;
    let tool = false;
    let rod = false;
    let sit = 0;

    switch (m.act) {
      case 'walk': {
        const d = turn(m.a, m.target);
        const night = m.watch && this.night > 0.6;
        const speed = (WALK * (night ? 0.55 : m.then === 'inside' || m.then === 'leave' ? 1.7 : 1)) / R;
        const stepA = Math.sign(d) * Math.min(Math.abs(d), speed * dt);
        m.a += stepA;
        const dx = -Math.sin(m.a) * stepA;
        if (Math.abs(dx) > 1e-4) m.face = dx > 0 ? 1 : -1;
        const p = m.ph * 9;
        legF = Math.sin(p) * 0.55;
        legB = -legF;
        armF = -Math.sin(p) * 0.45;
        armB = -armF;
        lift = Math.abs(Math.sin(p)) * 0.7;
        if (Math.abs(d) < 0.01) this.arrived(m);
        break;
      }
      case 'idle':
      case 'wait':
        lift = Math.sin(m.ph * 2) * 0.15;
        if (m.act === 'wait' && m.partner) m.face = m.partner.c.x > m.c.x ? 1 : -1;
        if (m.t > m.dur) {
          if (m.act === 'wait') this.endChat(m.partner ?? m);
          this.next(m);
        }
        break;
      case 'work': {
        tool = true;
        armF = -2.1 + Math.sin(m.ph * 13) * 0.4;
        armB = 0.2;
        lean = 0.05;
        m.nextSpark -= dt;
        if (m.nextSpark <= 0) {
          m.nextSpark = rand(0.25, 0.6);
          const hand = m.armF.toGlobal({ x: 0, y: ARM.h * 0.9 });
          const p = this.layer.toLocal(hand);
          this.fx.spark(p.x, p.y, 0xffd27a);
        }
        if (m.t > m.dur) this.next(m);
        break;
      }
      case 'chat': {
        const p = m.partner;
        if (!p || p.partner !== m) {
          this.next(m);
          break;
        }
        // Take turns talking, with a hand gesture and now and then an icon.
        const mine = Math.floor(m.t / 1.4) % 2 === (this.members.indexOf(m) < this.members.indexOf(p) ? 0 : 1);
        armF = mine ? -0.7 + Math.sin(m.ph * 5) * 0.35 : 0.1;
        lift = Math.sin(m.ph * 2) * 0.15;
        if (mine && m.t % 1.4 < dt && Math.random() < 0.7) this.emote(m, ICONS[Math.floor(Math.random() * ICONS.length)]);
        if (m.t > m.dur) {
          m.hop = 1;
          p.hop = 1;
          this.endChat(m);
          this.next(m);
        }
        break;
      }
      case 'cheer': {
        if (!this.world.boss) {
          this.next(m);
          break;
        }
        if (m.delay > 0) break;
        m.face = this.world.boss.x > m.c.x ? 1 : -1;
        armF = -2.75 + Math.sin(m.ph * 9) * 0.3;
        armB = 2.75 - Math.sin(m.ph * 9 + 1) * 0.3;
        if (m.hop <= 0 && Math.random() < dt * 1.4) m.hop = 1;
        break;
      }
      case 'react':
        if (m.delay > 0) break;
        if (m.icon > 0) {
          armF = -2.8 + Math.sin(m.ph * 10) * 0.25;
          armB = 2.8;
          if (m.hop <= 0 && m.t < m.dur - 0.6) m.hop = 1;
        } else {
          armF = 0.5;
          armB = -0.5;
          lean = 0.12;
          lift = -0.4;
        }
        if (m.t > m.dur) this.next(m);
        break;
      case 'wave':
        armF = -2.6 + Math.sin(m.ph * 13) * 0.45;
        if (m.t > m.dur) this.next(m);
        break;
      case 'fish': {
        sit = 1;
        rod = true;
        m.face = 1;
        m.bite -= dt;
        // A bite: the float dips, they yank, and something sparkly flips out.
        const biting = m.bite < 0 && m.bite > -0.9;
        armF = biting ? -2.4 : -1.1 + Math.sin(m.ph * 0.8) * 0.05;
        if (m.bite < -0.9) {
          m.bite = rand(8, 16);
          const tip = this.layer.toLocal(m.c.toGlobal({ x: 22, y: 5 }));
          this.fx.puff(tip.x, tip.y, 0x9fe6ff, 1.2, 0.5);
          this.fx.spark(tip.x, tip.y, 0x9fe6ff);
          this.fx.spark(tip.x, tip.y, 0xffffff);
          this.emote(m, Math.random() < 0.5 ? '!' : '♥');
          m.hop = 0.7;
        }
        this.drawRod(m, biting);
        if (m.t > m.dur) this.next(m);
        break;
      }
      case 'eva': {
        // Jet out, fix something, jet back.
        const out = Math.min(1, m.t / 2.2);
        const back = Math.max(0, (m.t - 5.3) / 2.2);
        const far = 46;
        m.r = R + far * ease(out) * (1 - ease(back));
        const flying = m.t < 2.2 || m.t > 5.3;
        legF = 0.35 + Math.sin(m.ph * 2) * 0.15;
        legB = 0.15 + Math.sin(m.ph * 2 + 1) * 0.15;
        lean = flying ? 0.35 : 0.1;
        armB = 0.4;
        if (!flying) {
          tool = true;
          armF = -1.8 + Math.sin(m.ph * 12) * 0.35;
          m.nextSpark -= dt;
          if (m.nextSpark <= 0) {
            m.nextSpark = rand(0.2, 0.5);
            const hand = this.layer.toLocal(m.armF.toGlobal({ x: 0, y: ARM.h * 0.9 }));
            this.fx.spark(hand.x, hand.y, 0x9fe6ff);
          }
        } else {
          armF = -0.6;
          m.face = Math.cos(m.a) * (m.t < 2.2 ? 1 : -1) >= 0 ? 1 : -1;
          if (Math.random() < dt * 9) {
            const pack = this.layer.toLocal(m.c.toGlobal({ x: -5 * m.face, y: -5 }));
            this.fx.puff(pack.x, pack.y, 0xbfe8ff, 0.35, 0.4);
          }
        }
        // A tether back to the deck.
        const bx = Math.cos(m.a) * R;
        const by = Math.sin(m.a) * R - 4;
        const hx = m.c.x;
        const hy = m.c.y - 6 * SCALE;
        const sag = 6 + Math.sin(m.ph * 1.5) * 2;
        this.tethers.moveTo(bx, by).quadraticCurveTo((bx + hx) / 2 + sag, (by + hy) / 2 + sag, hx, hy).stroke({ color: 0xdfe4ff, width: 0.7, alpha: 0.7 });
        if (m.t > 7.5) {
          m.r = R;
          this.next(m);
        }
        break;
      }
      case 'appear':
        m.show = Math.min(1, m.t / m.dur);
        if (m.t > m.dur) {
          m.show = 1;
          m.hop = 1;
          this.next(m);
        }
        break;
      case 'vanish':
        m.show = Math.max(0, 1 - m.t / m.dur);
        if (m.t > m.dur) {
          if (m.leaving) return this.remove(m);
          m.act = 'inside';
          m.t = 0;
          m.delay = rand(0, 9);
        }
        break;
      case 'inside':
        m.show = 0;
        if (m.leaving) return this.remove(m);
        if ((this.night < 0.4 || m.watch) && m.delay <= 0) {
          m.a = HATCH;
          m.act = 'appear';
          m.t = 0;
          m.dur = 0.7;
          this.hatchOpen = 1.2;
        }
        break;
    }

    // Night falls: everyone not on watch heads in once they're done.
    const bedtime = ['idle', 'work', 'chat', 'wait', 'fish', 'wave'].includes(m.act) || (m.act === 'walk' && m.then !== 'inside' && m.then !== 'leave');
    if (this.night > 0.6 && !m.watch && !this.world.boss && bedtime) this.walkTo(m, HATCH, 'inside');
    // Morning came before they made it in: never mind.
    if (this.night < 0.4 && m.act === 'walk' && m.then === 'inside') m.then = null;

    m.hop = Math.max(0, m.hop - dt * 2.4);
    const hopY = this.hopY(m);
    m.legF.rotation = legF - sit * 1.35;
    m.legB.rotation = legB - sit * 1.2;
    m.armF.rotation = armF;
    m.armB.rotation = armB;
    m.tool.visible = tool;
    m.rod.visible = rod;
    m.body.y = -lift + sit * 2.6;
    m.armF.y = -9.1 - lift + sit * 2.6;
    m.armB.y = -9.3 - lift + sit * 2.6;
    m.legF.y = m.legB.y = -0.8 + sit * 2.6;
    m.c.rotation = lean * m.face;
    if (m.lamp) {
      const want = m.watch && this.night > 0.4 ? 0.85 + Math.sin(this.time * 5) * 0.08 : 0;
      m.lamp.alpha += (want - m.lamp.alpha) * Math.min(1, dt * 2);
    }
    const x = Math.cos(m.a) * m.r;
    const y = Math.sin(m.a) * m.r;
    // Coming out of the hatch: they rise up through it.
    const s = SCALE * (0.4 + 0.6 * m.show);
    m.c.scale.set(s * m.face, s);
    m.c.alpha = Math.min(1, m.show * 1.5);
    m.c.position.set(x, y + hopY + (1 - m.show) * 3);
    m.c.zIndex = y;
    m.c.visible = m.show > 0.01;
  }

  private drawRod(m: Member, biting: boolean): void {
    const g = m.rod;
    g.clear();
    const hand = { x: 4.5, y: -12 };
    const tip = { x: 13, y: biting ? -21 : -19 };
    g.moveTo(hand.x, hand.y).lineTo(tip.x, tip.y).stroke({ color: 0x8a5a3b, width: 0.9 });
    const bob = Math.sin(this.time * 2.2) * 1.2 + (biting ? 3 : 0);
    const fx = 22;
    const fy = 6 + bob;
    g.moveTo(tip.x, tip.y).quadraticCurveTo(fx + 2, tip.y + 6, fx, fy - 1.6).stroke({ color: 0xdfe4ff, width: 0.35, alpha: 0.9 });
    g.circle(fx, fy, 1.6).fill({ color: 0xff5d6c }).stroke({ color: 0x141838, width: 0.4 });
    g.rect(fx - 1.6, fy - 0.2, 3.2, 1.8).fill({ color: 0xffffff });
    g.circle(fx, fy, 1.6).stroke({ color: 0x141838, width: 0.4 });
  }

  /** How many crew are on deck (out of the hatch). */
  get onDeck(): number {
    return this.members.filter((m) => m.act !== 'inside' && !m.leaving).length;
  }
}
