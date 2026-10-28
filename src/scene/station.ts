import { Application, BlurFilter, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { GeneratorId } from '../core/config';
import { SECTORS, type EventKind, type PetId, type SectorDef, type ThemeDef } from '../core/content';
import type { SkinDef } from '../core/collection';
import * as art from './art';

/** How far the player can pinch the view out and in. */
const VIEW_ZOOM_MIN = 0.7;
const VIEW_ZOOM_MAX = 2.2;

/** Size of the world in scene units; the scene scales this to fit the viewport. */
const WORLD = 380;
const TAU = Math.PI * 2;
const DOCK_RADIUS = 160;
const CLAW_TIP = { x: 0, y: -104 };
/** Where a boss wreck parks: up and to the left, behind the station. */
const BOSS_POS = { x: -92, y: -132 };
const BOSS_SCALE = 0.78;

const COLORS = {
  scrap: 0xffb547,
  drone: 0x4fe3c1,
  hauler: 0x7aa7ff,
  smelter: 0xff8a4c,
  fabricator: 0xc58cff,
  dock: 0xffd166,
  laser: 0xff5d6c,
  gravity: 0x5ce1ff,
  nanite: 0x9dff6b,
  gate: 0x8f7bff,
  dyson: 0xffe9a8,
  boost: 0xff6b9a,
  white: 0xffffff,
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeInCubic = (t: number) => t * t * t;

/** Where the big late-game machines sit, in world units. */
const GATE_POS = { x: -250, y: -205 };
const SUN_POS = { x: 236, y: -200 };
const WELL_RADIUS = 238;
const TURRET_RADIUS = 186;
/** How far the camera pulls back once each tier is built, so everything fits. */
const ZOOM_FOR: Partial<Record<GeneratorId, number>> = { laser: 1.16, gravity: 1.4, nanite: 1.42, gate: 1.5, dyson: 1.6 };

interface Star { s: Sprite; depth: number; phase: number; base: number }
interface Orbiter { s: Sprite; radius: number; angle: number; speed: number; wobble: number; cargo?: Sprite; engine?: Sprite }
interface Spark { s: Sprite; vx: number; vy: number; life: number; max: number }
interface Puff { s: Sprite; life: number; max: number; grow: number }
interface Ring { x: number; y: number; r: number; life: number; color: number; width: number }
type DriftKind = 'debris' | 'crate' | 'meteor' | 'convoy' | 'golden';
interface Drift { s: Sprite; vx: number; vy: number; vr: number; kind: DriftKind; glow?: Sprite; tail?: Sprite }
interface Chunk { s: Sprite; x0: number; y0: number; t: number; dur: number; color: number }
interface Floater { text: Text; vy: number; life: number; max: number }
interface Turret { s: Sprite; angle: number; aim: number; cool: number; beam: number; tx: number; ty: number }
interface Well { s: Sprite; x: number; y: number; spin: number }
interface Mote { s: Sprite; a: number; d: number; v: number; well: number }
interface Nanite { s: Sprite; p: number; lane: number; size: number }
interface GateShip { s: Sprite; engine: Sprite; t: number; x0: number; y0: number; x1: number; y1: number }
interface Rock { s: Sprite; vx: number; vr: number }

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
    dock: Texture; crate: Texture; golden: Texture; debris: Texture[]; planet: Texture; antenna: Texture; moon: Texture;
    galaxy: Texture; rocks: Texture[]; turret: Texture; vortex: Texture; gate: Texture; portal: Texture;
    sun: Texture; panel: Texture; meteor: Texture; shadeDark: Texture; shadeLight: Texture;
    plasma: Texture[]; rays: Texture; reactorRing: Texture; vignette: Texture;
    bosses: (Texture | undefined)[]; cracks: Texture[]; pets: Record<PetId, Texture>;
  };

  private bg = new Sprite();
  private starLayer = new Container();
  private planet = new Sprite();
  private galaxy = new Sprite();
  private moon = new Sprite();
  private moonAngle = rand(0, TAU);
  private fgLayer = new Container();
  private rocks: Rock[] = [];
  private nextRock = rand(4, 10);
  private flash = new Sprite(Texture.WHITE);
  private world = new Container();
  private farLayer = new Container();
  private debrisLayer = new Container();
  private lines = new Graphics();
  private dockLayer = new Container();
  private machineLayer = new Container();
  private hub = new Container();
  private habitat!: Sprite;
  private coreGlow!: Sprite;
  private core!: Sprite;
  private plasma: Sprite[] = [];
  private rays!: Sprite;
  private reactorRing!: Sprite;
  private coreHot!: Sprite;
  private vignette = new Sprite();
  private keyLight = new Sprite();
  private dustLayer = new Container();
  private dust: { s: Sprite; depth: number; phase: number; vx: number; vy: number }[] = [];
  private bossLayer = new Container();
  private boss: { c: Container; hull: Sprite; cracks: Sprite; glow: Sprite; bar: Graphics; shown: number; state: 'in' | 'here' | 'out' | 'dead'; t: number; hit: number; health: number } | null = null;
  private beams: { x: number; y: number; life: number }[] = [];
  private pet: { s: Sprite; id: PetId; angle: number; pounce: number } | null = null;
  private claw!: Sprite;
  private podLayer = new Container();
  private lights: Sprite[] = [];
  private antenna!: Sprite;
  private droneLayer = new Container();
  private fxLayer = new Container();
  private ringG = new Graphics();
  private beamG = new Graphics();
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
  private turrets: Turret[] = [];
  private wells: Well[] = [];
  private motes: Mote[] = [];
  private nanites: Nanite[] = [];
  private gate: { ring: Sprite; portal: Sprite; glow: Sprite } | null = null;
  private gateShips: GateShip[] = [];
  private nextGateShip = 2;
  private sun: { core: Sprite; glow: Sprite; panels: Sprite[] } | null = null;
  private dysonCount = 0;
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
  private nextSteam = 1;
  private nextTraffic = rand(4, 9);
  private traderShip: { s: Sprite; light: Sprite; t: number } | null = null;
  private traffic: { s: Sprite; light: Sprite; vx: number; vy: number; life: number; blink: number }[] = [];
  private scale = 1;
  private skyKey = '';
  private baseScale = 1;
  private zoom = 1;
  private zoomTarget = 1;
  /** The player's own pinch zoom on top of the automatic one (above 1 = closer). */
  private viewZoom = 1;
  private crateRate = 1;
  private event: EventKind | null = null;
  private nextMeteor = 0;
  private flareGlow = new Sprite();
  private flare = 0;
  private theme: ThemeDef | null = null;
  private sector: SectorDef = SECTORS[0];
  private coreColor: number = COLORS.scrap;
  private hullSprites: Sprite[] = [];
  private jump = 0;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Comfort settings: soften flashes and pulses, and keep the camera still. */
  private calmFlash = false;
  private calmShake = false;

  setComfort(reduceFlash: boolean, reduceShake: boolean): void {
    this.calmFlash = reduceFlash;
    this.calmShake = reduceShake;
  }
  private resizeTimer = 0;
  /** The open band of screen between the HUD and the panel, where the station sits. */
  private focus = { top: 0, bottom: 0 };
  /** Where layout() puts things before the player's pan is added. */
  private home = { world: { x: 0, y: 0 }, planet: { x: 0, y: 0 }, galaxy: { x: 0, y: 0 } };
  /** The view's offset in screen pixels: `raw` follows the finger, `pan` is what is shown. */
  private pan = { x: 0, y: 0 };
  private panRaw = { x: 0, y: 0 };
  private panning = false;

  async init(el: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: el,
      backgroundAlpha: 0,
      antialias: true,
      // Full sharpness on 3x phone screens.
      resolution: Math.min(window.devicePixelRatio || 1, 3),
      autoDensity: true,
      // Skip WebGPU: when WebGL is unavailable, probing for WebGPU can hang some phone web
      // views. Canvas is a slower but dependable fallback.
      preference: ['webgl', 'canvas'],
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
      golden: art.goldenCrate(),
      debris: [1, 2, 3, 4, 5, 6].map((n) => art.debris(n * 97)),
      planet: art.planet(260),
      antenna: art.antenna(),
      moon: art.moon(),
      galaxy: art.galaxy(),
      rocks: [11, 23, 37].map((n) => art.bigRock(n)),
      turret: art.laserTurret(),
      vortex: art.vortex(),
      gate: art.warpGate(),
      portal: art.portal(),
      sun: art.sun(),
      panel: art.dysonPanel(),
      meteor: art.meteor(),
      shadeDark: art.hubShade('dark'),
      shadeLight: art.hubShade('light'),
      plasma: [art.plasma(3), art.plasma(8)],
      rays: art.rays(),
      reactorRing: art.reactorRing(),
      vignette: art.vignette(),
      // Boss hulls are big and slow to paint, so each is painted the first time it shows up.
      bosses: [undefined, undefined, undefined, undefined],
      cracks: [0, 1].map((n) => art.bossCracks(n)),
      pets: { cat: art.pet('cat'), pup: art.pet('pup'), owl: art.pet('owl'), blob: art.pet('blob') },
    };

    this.buildHub();
    this.sparkPool = new Pool(this.tex.streak, this.fxLayer, 'add');
    this.puffPool = new Pool(this.tex.glow, this.fxLayer, 'add');
    this.chunkPool = new Pool(this.tex.debris[0], this.fxLayer);

    this.planet.texture = this.tex.planet;
    this.planet.anchor.set(0.5);
    this.galaxy.texture = this.tex.galaxy;
    this.galaxy.anchor.set(0.5);
    this.galaxy.blendMode = 'add';
    this.galaxy.alpha = 0.55;
    this.moon.texture = this.tex.moon;
    this.moon.anchor.set(0.5);
    // Foreground rocks are drawn soft, as if close to the camera and out of focus.
    this.fgLayer.filters = [new BlurFilter({ strength: 2, quality: 2 })];
    this.flash.alpha = 0;
    this.vignette.texture = this.tex.vignette;
    this.keyLight.texture = this.tex.glow;
    this.keyLight.anchor.set(0.5);
    this.keyLight.blendMode = 'add';
    this.keyLight.tint = 0x9fb0ff;
    this.keyLight.alpha = 0.16;
    this.flareGlow.texture = this.tex.glow;
    this.flareGlow.anchor.set(0.5);
    this.flareGlow.blendMode = 'add';
    this.flareGlow.tint = 0xffb070;
    this.flareGlow.alpha = 0;
    this.world.addChild(this.farLayer, this.bossLayer, this.debrisLayer, this.lines, this.dockLayer, this.machineLayer, this.hub, this.droneLayer, this.beamG, this.fxLayer, this.ringG, this.textLayer);
    this.app.stage.sortableChildren = true;
    const z: [Container, number][] = [[this.bg, 0], [this.galaxy, 1], [this.starLayer, 2], [this.moon, 3], [this.planet, 4], [this.flareGlow, 6], [this.keyLight, 7], [this.world, 10], [this.dustLayer, 15], [this.fgLayer, 20], [this.vignette, 25], [this.flash, 30]];
    for (const [c, i] of z) {
      c.zIndex = i;
      this.app.stage.addChild(c);
    }

    this.layout();
    this.app.renderer.on('resize', () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.layout(), 120);
    });
    this.app.ticker.add((t) => this.frame(Math.min(t.deltaMS / 1000, 0.1)));
    this.ready = true;
  }

  /** False until init finishes; every public method is a no-op before then. */
  ready = false;

  // ---------- Decorations ----------

  private ornLayer = new Container();
  private ornTex = new Map<string, Texture>();
  /** Each decoration's sprites, and how it moves. */
  private orns: { id: string; parts: Sprite[]; wire?: Graphics }[] = [];
  private ornKey = '';

  private ornTexture(id: string): Texture {
    let t = this.ornTex.get(id);
    if (!t) {
      t = art.ornament(id);
      this.ornTex.set(id, t);
    }
    return t;
  }

  /** Puts up the decorations in `on`, taking down the rest. */
  setOrnaments(on: Iterable<string>): void {
    if (!this.ready) return;
    const ids = [...on].sort();
    const key = ids.join();
    if (key === this.ornKey) return;
    this.ornKey = key;
    if (!this.ornLayer.parent) this.hub.addChild(this.ornLayer);
    for (const o of this.orns) {
      o.parts.forEach((p) => p.destroy());
      o.wire?.destroy();
    }
    this.orns = [];
    // Draw order: things around the rim first, then what hangs and sits on top.
    const order = ['bunting', 'bulbs', 'poster', 'gnome', 'garden', 'cactus', 'fern', 'lanterns', 'pennant', 'neon', 'disco', 'duck'];
    for (const id of order) if (ids.includes(id)) this.orns.push(this.buildOrnament(id));
  }

  private buildOrnament(id: string): { id: string; parts: Sprite[]; wire?: Graphics } {
    const L = this.ornLayer;
    const place = (tex: string, x: number, y: number, ax = 0.5, ay = 0.5) => {
      const sp = this.sprite(this.ornTexture(tex), L, x, y);
      sp.anchor.set(ax, ay);
      return sp;
    };
    const colors = [0xff6b9a, 0xffd166, 0x4fe3c1, 0x7aa7ff, 0xff9a4c, 0xc58cff];
    switch (id) {
      case 'bulbs': {
        // A ring of bulbs around the station, the wire dipping between hooks.
        const wire = new Graphics();
        L.addChild(wire);
        const n = 18;
        const r = 74;
        const parts: Sprite[] = [];
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * TAU;
          const a1 = ((i + 1) / n) * TAU;
          const am = (a0 + a1) / 2;
          wire.moveTo(Math.cos(a0) * r, Math.sin(a0) * r).quadraticCurveTo(Math.cos(am) * (r - 6), Math.sin(am) * (r - 6), Math.cos(a1) * r, Math.sin(a1) * r);
          const halo = this.sprite(this.tex.glow, L, Math.cos(am) * (r - 3), Math.sin(am) * (r - 3));
          halo.blendMode = 'add';
          halo.scale.set(0.2);
          halo.tint = colors[i % colors.length];
          const bulb = place('bulb', halo.x, halo.y);
          bulb.tint = colors[i % colors.length];
          bulb.rotation = am - Math.PI / 2;
          parts.push(halo, bulb);
        }
        wire.stroke({ width: 0.7, color: 0x5a5f80, alpha: 0.9 });
        return { id, parts, wire };
      }
      case 'bunting': {
        const wire = new Graphics();
        L.addChild(wire);
        const parts: Sprite[] = [];
        const r = 84;
        const from = Math.PI * 1.12;
        const to = Math.PI * 1.88;
        const n = 11;
        wire.moveTo(Math.cos(from) * r, Math.sin(from) * r);
        for (let i = 1; i <= 40; i++) {
          const a = from + ((to - from) * i) / 40;
          const sag = Math.sin((i / 40) * Math.PI * 4) * 1.5;
          wire.lineTo(Math.cos(a) * (r - sag), Math.sin(a) * (r - sag));
        }
        wire.stroke({ width: 0.6, color: 0xc5cbff, alpha: 0.8 });
        for (let i = 0; i < n; i++) {
          const a = from + ((to - from) * (i + 0.5)) / n;
          const f = place('flag', Math.cos(a) * r, Math.sin(a) * r, 0.5, 0);
          f.rotation = a + Math.PI / 2 + Math.PI;
          f.tint = colors[i % colors.length];
          parts.push(f);
        }
        return { id, parts, wire };
      }
      case 'lanterns': {
        const wire = new Graphics();
        L.addChild(wire);
        const parts: Sprite[] = [];
        const spots: [number, number, number][] = [[84, 10, 0xff5a5a], [102, 16, 0xffaa46], [118, 8, 0xff6eb4]];
        for (const [x, len, c] of spots) {
          wire.moveTo(x, 8).lineTo(x, 8 + len);
          const glow = this.sprite(this.tex.glow, L, x, 8 + len + 8);
          glow.blendMode = 'add';
          glow.tint = c;
          glow.scale.set(0.5);
          glow.alpha = 0.6;
          const l = place('lantern', x, 8 + len, 0.5, 0);
          l.tint = c;
          parts.push(glow, l);
        }
        wire.stroke({ width: 0.5, color: 0xb0b0c0, alpha: 0.8 });
        return { id, parts, wire };
      }
      case 'fern':
        return { id, parts: [place('fern', -104, 8, 0.5, 0)] };
      case 'garden':
        return { id, parts: [place('garden', -98, -9, 0.5, 1)] };
      case 'cactus':
        return { id, parts: [place('cactus', 108, -9, 0.5, 1)] };
      case 'poster': {
        const p = place('poster', -34, 36);
        p.rotation = -0.18;
        return { id, parts: [p] };
      }
      case 'gnome':
        return { id, parts: [place('gnome', 36, 46, 0.5, 1)] };
      case 'pennant':
        return { id, parts: [place('pennant', 2, 60, 0, 0.5)] };
      case 'neon': {
        const glow = this.sprite(this.tex.glow, L, -86, -52);
        glow.blendMode = 'add';
        glow.tint = 0xff5daf;
        glow.scale.set(1.1, 0.5);
        glow.alpha = 0.35;
        return { id, parts: [glow, place('neon', -86, -52)] };
      }
      case 'disco': {
        const parts = [place('disco', 70, -96, 0.5, 0)];
        for (let i = 0; i < 4; i++) {
          const sp = this.sprite(this.tex.glow, L, 70, -77);
          sp.blendMode = 'add';
          sp.scale.set(0.12);
          parts.push(sp);
        }
        return { id, parts };
      }
      case 'duck':
        return { id, parts: [place('duck', 100, 0)] };
    }
    return { id, parts: [] };
  }

  private updateOrnaments(): void {
    const t = this.time;
    const calm = this.reducedMotion;
    for (const o of this.orns) {
      switch (o.id) {
        case 'bulbs':
          // Bulbs twinkle in a slow chase around the ring.
          for (let i = 0; i < o.parts.length; i += 2) {
            const k = 0.5 + 0.5 * Math.sin(t * 2.2 - i * 0.35);
            o.parts[i].alpha = this.calmFlash ? 0.6 : 0.35 + k * 0.65;
          }
          break;
        case 'lanterns':
          for (let i = 1; i < o.parts.length; i += 2) o.parts[i].rotation = calm ? 0 : Math.sin(t * 1.3 + i) * 0.12;
          break;
        case 'fern':
          o.parts[0].rotation = calm ? 0 : Math.sin(t * 0.9) * 0.06;
          break;
        case 'pennant':
          o.parts[0].skew.y = calm ? 0 : Math.sin(t * 3) * 0.12;
          o.parts[0].scale.x = 1 + Math.sin(t * 3 + 1) * 0.05;
          break;
        case 'neon': {
          // A neon sign hums, and now and then stutters.
          const flicker = !this.calmFlash && Math.sin(t * 0.7) > 0.97 && Math.sin(t * 40) > 0;
          o.parts[1].alpha = flicker ? 0.55 : 1;
          o.parts[0].alpha = flicker ? 0.1 : 0.3 + 0.08 * Math.sin(t * 3);
          o.parts[0].y = o.parts[1].y = -52 + (calm ? 0 : Math.sin(t * 1.1) * 1.5);
          break;
        }
        case 'disco': {
          const ball = o.parts[0];
          ball.rotation = calm ? 0 : Math.sin(t * 0.8) * 0.08;
          for (let i = 1; i < o.parts.length; i++) {
            const a = t * 1.6 + (i * TAU) / 4;
            const sp = o.parts[i];
            sp.position.set(70 + Math.cos(a) * 5, -77 + Math.sin(a * 1.3) * 5);
            sp.alpha = this.calmFlash ? 0.15 : Math.max(0, Math.sin(t * 5 + i * 1.7)) * 0.9;
            sp.tint = [0xffffff, 0xff9ad5, 0x9fe0ff, 0xffe27a][i - 1];
          }
          break;
        }
        case 'duck': {
          // The duck drifts round the station, bobbing as if on water.
          const a = t * 0.12 + 0.6;
          const d = o.parts[0];
          d.position.set(Math.cos(a) * 100, Math.sin(a) * 100 + (calm ? 0 : Math.sin(t * 2) * 2));
          d.scale.x = Math.sin(a) < 0 ? 1 : -1;
          d.rotation = calm ? 0 : Math.sin(t * 2.4) * 0.12;
          break;
        }
      }
    }
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
    this.antenna = this.sprite(t.antenna, this.hub, 0, 54);
    this.antenna.anchor.set(0.5, 0);
    this.hullSprites.push(this.sprite(t.hull, this.hub));
    this.hub.addChild(this.podLayer);
    this.habitat = this.sprite(t.habitat, this.hub);
    this.hullSprites.push(this.habitat);
    this.habitat.scale.set(0.82);
    // Fixed light and shade over the turning ring, so the hub reads as lit from the upper left.
    this.sprite(t.shadeDark, this.hub);
    const lit = this.sprite(t.shadeLight, this.hub);
    lit.blendMode = 'add';
    // Blinking beacon lights around the rim.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const l = this.sprite(t.glow, this.hub, Math.cos(a) * 62, Math.sin(a) * 62);
      l.blendMode = 'add';
      l.scale.set(0.22);
      l.tint = i % 2 ? 0xff6b9a : 0x4fe3c1;
      this.lights.push(l);
    }
    this.rays = this.sprite(t.rays, this.hub);
    this.rays.blendMode = 'add';
    this.rays.alpha = 0.3;
    this.coreGlow = this.sprite(t.glow, this.hub);
    this.coreGlow.blendMode = 'add';
    this.coreGlow.scale.set(2.2);
    this.reactorRing = this.sprite(t.reactorRing, this.hub);
    this.reactorRing.blendMode = 'add';
    this.reactorRing.alpha = 0.55;
    this.core = this.sprite(t.core, this.hub);
    this.core.scale.set(0.95);
    // Plasma swirls inside the core turn against each other.
    for (const tex of t.plasma) {
      const p = this.sprite(tex, this.hub);
      p.blendMode = 'add';
      p.scale.set(0.95);
      this.plasma.push(p);
    }
    this.coreHot = this.sprite(t.glow, this.hub);
    this.coreHot.blendMode = 'add';
    this.coreHot.scale.set(0.6);
    this.claw = this.sprite(t.claw, this.hub, 0, -60);
    this.claw.anchor.set(0.5, 1);
  }

  private layout(): void {
    const { width: w, height: h } = this.app.screen;
    if (w < 2 || h < 2) return;
    const top = this.focus.bottom > this.focus.top ? this.focus.top : 0;
    const bottom = this.focus.bottom > this.focus.top ? this.focus.bottom : h;
    const fh = bottom - top;
    this.baseScale = Math.min(w, fh * 1.08) / WORLD;
    this.scale = (this.baseScale * this.viewZoom) / this.zoom;
    this.home.world = { x: w / 2, y: top + fh / 2 };
    this.world.scale.set(this.scale);

    // Painting the sky and scattering stars is slow, so only redo it when the screen size or
    // theme changes, not when the panel is dragged and only the focus band moves.
    const skyKey = `${Math.ceil(w)}x${Math.ceil(h)}|${this.theme?.id ?? ''}|${this.sector.name}`;
    const repaint = skyKey !== this.skyKey;
    this.skyKey = skyKey;
    if (repaint) {
      this.bg.texture?.destroy(true);
      // The classic theme means "use the sector's own sky".
      const own = !this.theme || this.theme.id === 'classic';
      this.bg.texture = art.backdrop(Math.ceil(w), Math.ceil(h), own ? this.sector.sky : this.theme!.sky, own ? this.sector.nebula : this.theme!.nebula);
    }
    this.flareGlow.position.set(w * 0.08, top + fh * 0.05);
    this.flareGlow.scale.set(Math.max(w, h) / 40);

    // The gas giant rises from behind the panel, off to one side.
    const ps = Math.min(w, fh, 520) * 0.62;
    this.planet.width = ps * 1.7;
    this.planet.height = ps * 1.7;
    this.home.planet = { x: w / 2 + Math.min(w, 540) * 0.52, y: bottom - ps * 0.02 };
    this.moon.scale.set(ps / 220);
    this.home.galaxy = { x: w * 0.16, y: top + fh * 0.86 };
    this.galaxy.scale.set(Math.min(w, 600) / 300);
    this.flash.width = w;
    this.flash.height = h;
    this.vignette.width = w * 1.15;
    this.vignette.height = h * 1.15;
    this.vignette.position.set(-w * 0.075, -h * 0.075);
    this.keyLight.position.set(w * 0.1, top + fh * 0.1);
    this.keyLight.scale.set(Math.max(w, h) / 34);
    this.placePan();

    if (!repaint) return;
    // Dust drifting close to the camera gives the scene depth.
    for (const d of this.dust) d.s.destroy();
    this.dust = [];
    const dustCount = this.reducedMotion ? 0 : Math.round((w * h) / 16000);
    for (let i = 0; i < dustCount; i++) {
      const s = new Sprite(this.tex.glow);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.position.set(Math.random() * w, Math.random() * h);
      const depth = rand(0.3, 1);
      s.scale.set(0.05 + depth * 0.09);
      s.tint = Math.random() < 0.5 ? 0xbfd0ff : 0xffe2c0;
      this.dustLayer.addChild(s);
      this.dust.push({ s, depth, phase: rand(0, TAU), vx: rand(-5, 5), vy: rand(-3, 3) });
    }
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
    if (!this.ready) return;
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
      const engine = this.sprite(t.glow, this.machineLayer);
      engine.blendMode = 'add';
      engine.tint = 0x7aa7ff;
      const s = this.sprite(t.hauler, this.machineLayer);
      s.scale.set(0.85);
      this.haulers.push({ s, cargo, engine, radius: rand(124, 136), angle: rand(0, TAU), speed: rand(0.14, 0.22), wobble: rand(0, TAU) });
    }
    while (this.haulers.length > haulerCount) {
      const h = this.haulers.pop()!;
      h.s.destroy();
      h.cargo?.destroy();
      h.engine?.destroy();
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

    // Mining lasers sit just outside the dock ring.
    const turretCount = owned.laser > 0 ? Math.min(8, Math.ceil(Math.sqrt(owned.laser) * 1.4)) : 0;
    while (this.turrets.length < turretCount) {
      const s = this.sprite(t.turret, this.machineLayer);
      s.scale.set(0.9);
      this.turrets.push({ s, angle: 0, aim: 0, cool: rand(0.5, 2), beam: 0, tx: 0, ty: 0 });
    }
    while (this.turrets.length > turretCount) this.turrets.pop()!.s.destroy();
    this.turrets.forEach((tu, i) => {
      tu.angle = (i / turretCount) * TAU - Math.PI / 2 + 0.3;
      tu.aim = tu.angle;
      tu.s.position.set(Math.cos(tu.angle) * TURRET_RADIUS, Math.sin(tu.angle) * TURRET_RADIUS);
    });

    // Gravity wells, out on the diagonals, pulling in streams of dust.
    const wellCount = owned.gravity > 0 ? Math.min(4, Math.ceil(Math.sqrt(owned.gravity) * 0.8)) : 0;
    while (this.wells.length < wellCount) {
      const i = this.wells.length;
      const a = [Math.PI * 0.82, Math.PI * 0.18, Math.PI * 1.12, Math.PI * 1.88][i];
      const s = this.sprite(t.vortex, this.farLayer, Math.cos(a) * WELL_RADIUS, Math.sin(a) * WELL_RADIUS * 0.8);
      s.blendMode = 'add';
      this.wells.push({ s, x: s.x, y: s.y, spin: i % 2 ? 1 : -1 });
    }
    while (this.wells.length > wellCount) this.wells.pop()!.s.destroy();
    const moteCount = this.wells.length * 14;
    while (this.motes.length < moteCount) {
      const s = this.sprite(t.glow, this.farLayer);
      s.blendMode = 'add';
      s.tint = Math.random() < 0.3 ? 0xffffff : COLORS.gravity;
      this.motes.push({ s, a: rand(0, TAU), d: rand(4, 46), v: rand(0.6, 1.2), well: this.motes.length % Math.max(1, this.wells.length) });
    }
    while (this.motes.length > moteCount) this.motes.pop()!.s.destroy();

    // A ribbon of nanites flowing around the whole station.
    const naniteCount = owned.nanite > 0 ? Math.min(110, Math.ceil(Math.sqrt(owned.nanite) * 14)) : 0;
    while (this.nanites.length < naniteCount) {
      const s = this.sprite(t.glow, this.droneLayer);
      s.blendMode = 'add';
      s.tint = Math.random() < 0.25 ? 0xeaffd8 : COLORS.nanite;
      this.nanites.push({ s, p: Math.random(), lane: rand(-1, 1), size: rand(0.1, 0.2) });
    }
    while (this.nanites.length > naniteCount) this.nanites.pop()!.s.destroy();

    // One warp gate, which grows a little as you build more.
    if (owned.gate > 0 && !this.gate) {
      const glow = this.sprite(t.glow, this.farLayer, GATE_POS.x, GATE_POS.y);
      glow.blendMode = 'add';
      glow.tint = COLORS.gate;
      const portal = this.sprite(t.portal, this.farLayer, GATE_POS.x, GATE_POS.y);
      portal.blendMode = 'add';
      const ring = this.sprite(t.gate, this.farLayer, GATE_POS.x, GATE_POS.y);
      this.gate = { ring, portal, glow };
    } else if (owned.gate === 0 && this.gate) {
      this.gate.ring.destroy();
      this.gate.portal.destroy();
      this.gate.glow.destroy();
      this.gate = null;
      for (const sh of this.gateShips) {
        sh.s.destroy();
        sh.engine.destroy();
      }
      this.gateShips = [];
    }
    if (this.gate) {
      const k = 0.85 + Math.min(0.35, Math.sqrt(owned.gate) * 0.05);
      this.gate.ring.scale.set(k);
      this.gate.portal.scale.set(k * 0.9);
      this.gate.glow.scale.set(k * 3.2);
    }

    // A distant star, wrapped in more collector panels the more you build.
    if (owned.dyson > 0 && !this.sun) {
      const glow = this.sprite(t.glow, this.farLayer, SUN_POS.x, SUN_POS.y);
      glow.blendMode = 'add';
      glow.tint = 0xffc070;
      glow.scale.set(4);
      const core = this.sprite(t.sun, this.farLayer, SUN_POS.x, SUN_POS.y);
      core.blendMode = 'add';
      this.sun = { core, glow, panels: [] };
    } else if (owned.dyson === 0 && this.sun) {
      this.sun.core.destroy();
      this.sun.glow.destroy();
      this.sun.panels.forEach((p) => p.destroy());
      this.sun = null;
    }
    if (this.sun) {
      const panels = Math.min(18, Math.ceil(Math.sqrt(owned.dyson) * 3));
      while (this.sun.panels.length < panels) this.sun.panels.push(this.sprite(t.panel, this.farLayer));
      while (this.sun.panels.length > panels) this.sun.panels.pop()!.destroy();
    }
    this.dysonCount = owned.dyson;

    let zoom = 1;
    for (const [id, z] of Object.entries(ZOOM_FOR) as [GeneratorId, number][]) if (owned[id] > 0) zoom = Math.max(zoom, z);
    this.zoomTarget = zoom;
  }

  /** Crate Magnet perk: crates show up `mult` times as often. */
  setCrateRate(mult: number): void {
    if (!this.ready) return;
    if (mult > this.crateRate) this.nextCrate /= mult / this.crateRate;
    this.crateRate = mult;
  }

  /**
   * Colours the sky, core and beacons, and paints the hull. A station skin, when worn, takes
   * over the hull, reactor glow and beacons, and washes every machine in its colour.
   */
  setTheme(theme: ThemeDef, paint: number, skin: SkinDef | null = null): void {
    if (!this.ready) return;
    const changedSky = this.theme?.id !== theme.id;
    this.theme = theme;
    this.coreColor = skin?.core ?? theme.core;
    const beacons = skin?.beacons ?? theme.beacons;
    this.lights.forEach((l, i) => (l.tint = beacons[i % 2]));
    for (const h of this.hullSprites) h.tint = skin?.hull ?? paint;
    for (const layer of [this.machineLayer, this.droneLayer, this.podLayer, this.dockLayer]) layer.tint = skin?.machines ?? 0xffffff;
    if (changedSky && this.tex) this.layout();
  }

  /** Timed events change what drifts past (meteors, a convoy) and the light (solar flare). */
  setEvent(kind: EventKind | null): void {
    if (!this.ready) return;
    if (kind === this.event) return;
    this.event = kind;
    this.nextMeteor = 0.3;
    if (kind === 'convoy') this.spawnDrift('convoy');
  }

  /** The big jump when the station relocates: a warp, a flash, and a fresh start. */
  /** Moves the scene to a sector: its own sky (unless a theme overrides it) and planet. */
  setSector(sector: SectorDef): void {
    if (!this.ready || sector === this.sector) return;
    this.sector = sector;
    const old = this.tex.planet;
    this.tex.planet = art.planet(260, sector.planet, sector.atmosphere);
    this.planet.texture = this.tex.planet;
    old.destroy(true);
    this.layout();
  }

  /** How far the view may be dragged from the middle, in screen pixels. */
  private panLimit(): { x: number; y: number } {
    const { width: w, height: h } = this.app.screen;
    const fh = this.focus.bottom > this.focus.top ? this.focus.bottom - this.focus.top : h;
    // Zoomed in, the station is bigger than the screen, so let the view travel further.
    const k = Math.max(1, this.viewZoom);
    return { x: Math.min(w * 0.2, 110) * k, y: Math.min(fh * 0.15, 90) * k };
  }

  /** The player's pinch zoom, kept between visits. */
  getViewZoom(): number {
    return this.viewZoom;
  }

  setViewZoom(z: number): void {
    this.viewZoom = Math.max(VIEW_ZOOM_MIN, Math.min(VIEW_ZOOM_MAX, z));
    if (!this.ready) return;
    this.scale = (this.baseScale * this.viewZoom) / this.zoom;
    this.world.scale.set(this.scale);
  }

  /**
   * Zoom by `factor` around a point on screen (a pinch's middle, or the mouse), so the spot
   * under the fingers stays put. The view keeps the zoom; letting go only re-centers it.
   */
  zoomAt(factor: number, sx: number, sy: number): void {
    if (!this.ready) return;
    const before = this.scale;
    this.setViewZoom(this.viewZoom * factor);
    const k = this.scale / before;
    if (k === 1) return;
    if (!this.panning) this.panRaw = { ...this.pan };
    this.panning = true;
    // Keep the point under (sx, sy) fixed: the station's middle moves away from it by k.
    const cx = this.home.world.x + this.panRaw.x;
    const cy = this.home.world.y + this.panRaw.y;
    this.panRaw = { x: sx + (cx - sx) * k - this.home.world.x, y: sy + (cy - sy) * k - this.home.world.y };
    this.pan = { ...this.panRaw };
    this.placePan();
  }

  /** Drag the view by a finger's movement. Past the limit it stretches, like a rubber band. */
  panBy(dx: number, dy: number): void {
    if (!this.ready) return;
    if (!this.panning) this.panRaw = { ...this.pan };
    this.panning = true;
    this.panRaw.x += dx;
    this.panRaw.y += dy;
    const L = this.panLimit();
    const soft = (v: number, l: number) => (Math.abs(v) <= l ? v : Math.sign(v) * (l + (Math.abs(v) - l) * 0.3));
    this.pan = { x: soft(this.panRaw.x, L.x), y: soft(this.panRaw.y, L.y) };
    this.placePan();
  }

  /** The finger lifted: the view glides back to the middle. */
  panEnd(): void {
    this.recenter();
  }

  /** Back to the middle, gently: after a drag, and on a relocation. */
  recenter(): void {
    this.panning = false;
    this.panRaw = { x: 0, y: 0 };
    this.recentering = true;
  }

  private recentering = false;

  private updatePan(dt: number): void {
    if (this.panning) return;
    const L = this.panLimit();
    const tx = this.recentering ? 0 : Math.max(-L.x, Math.min(L.x, this.pan.x));
    const ty = this.recentering ? 0 : Math.max(-L.y, Math.min(L.y, this.pan.y));
    if (Math.abs(tx - this.pan.x) < 0.3 && Math.abs(ty - this.pan.y) < 0.3) {
      this.recentering = false;
      if (tx === this.pan.x && ty === this.pan.y) return;
      this.pan = { x: tx, y: ty };
    } else {
      const k = Math.min(1, dt * (this.recentering ? 4 : 12));
      this.pan = { x: this.pan.x + (tx - this.pan.x) * k, y: this.pan.y + (ty - this.pan.y) * k };
    }
    this.placePan();
  }

  /** Moves the station by the pan, and the scenery by less, so the distance shows. */
  private placePan(): void {
    const { x, y } = this.pan;
    this.world.position.set(this.home.world.x + x, this.home.world.y + y);
    this.planet.position.set(this.home.planet.x + x * 0.45, this.home.planet.y + y * 0.45);
    this.galaxy.position.set(this.home.galaxy.x + x * 0.2, this.home.galaxy.y + y * 0.2);
    this.starLayer.position.set(x * 0.1, y * 0.1);
    this.fgLayer.position.set(x * 1.3, y * 1.3);
    this.dustLayer.position.set(x * 1.15, y * 1.15);
  }

  warpJump(): void {
    if (!this.ready) return;
    this.recenter();
    this.flash.tint = 0xffffff;
    this.jump = 2.4;
    this.shake = Math.max(this.shake, 9);
    this.celebrate(COLORS.gate);
  }

  /** The Galaxy Shift: a longer, golden jump with rings of starlight. */
  galaxyJump(): void {
    if (!this.ready) return;
    this.warpJump();
    this.flash.tint = 0xffe9a8;
    this.shake = Math.max(this.shake, 14);
    for (let i = 0; i < 4; i++) this.rings.push({ x: 0, y: 0, r: 30 + i * 30, life: 1.2 + i * 0.25, color: i % 2 ? 0x8f7bff : 0xffe9a8, width: 5 - i });
    window.setTimeout(() => this.celebrate(0xffe9a8), 1700);
    window.setTimeout(() => this.celebrate(0x8f7bff), 2100);
  }

  /** Each galaxy paints the distant spiral its own colour. */
  setGalaxy(n: number): void {
    const tints = [0xffffff, 0xffd7a0, 0xa8f0ff, 0xffb8e0, 0xc8ffb0, 0xd0c0ff];
    this.galaxy.tint = tints[n % tints.length];
  }

  setFocus(top: number, bottom: number): void {
    if (top === this.focus.top && bottom === this.focus.bottom) return;
    this.focus = { top, bottom };
    if (this.tex) this.layout();
  }

  setBoost(active: boolean): void {
    this.boosting = active;
  }

  /** While the tutorial asks for a crate, a slow one is always drifting past. */
  holdCrate = false;

  /** The station's middle on screen, where bought machines fly in. */
  hubOnScreen(): { x: number; y: number } | null {
    if (!this.ready) return null;
    return { x: this.world.x, y: this.world.y };
  }

  /** A bought machine arriving: a small pop of its colour and a squash of the hub. */
  arrive(color: number): void {
    if (!this.ready) return;
    this.rings.push({ x: 0, y: 0, r: 24, life: 0.6, color, width: 3 });
    this.burst(0, 0, color, 10, 0.9);
    this.squash = Math.max(this.squash, 0.5);
  }

  /** Where the crate is on screen, so the tutorial can point at it. */
  crateOnScreen(): { x: number; y: number } | null {
    const c = this.ready ? this.drifts.find((d) => d.kind === 'crate') : undefined;
    if (!c) return null;
    const x = this.world.x + c.s.x * this.scale;
    const y = this.world.y + c.s.y * this.scale;
    return x > 0 && x < window.innerWidth ? { x, y } : null;
  }

  private toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.world.x) / this.scale, y: (sy - this.world.y) / this.scale };
  }

  /** Checks for a tap on a crate, meteor or convoy ship, and consumes it. */
  /** A golden crate drifts slowly across, glittering. */
  /** The trading post's ship parks beside the station while the trader is docked. */
  setTrader(on: boolean): void {
    if (!this.ready) return;
    if (on && !this.traderShip) {
      const s = this.sprite(this.tex.hauler, this.dockLayer, -420, 118);
      s.scale.set(1.35);
      s.tint = 0xbff0ff;
      s.alpha = 0;
      const light = this.sprite(this.tex.glow, this.dockLayer, s.x, s.y);
      light.blendMode = 'add';
      light.tint = 0x5cd6ff;
      this.traderShip = { s, light, t: 0 };
    } else if (!on && this.traderShip) {
      const { s, light } = this.traderShip;
      this.burst(s.x, s.y, 0x5cd6ff, 18, 1);
      s.destroy();
      light.destroy();
      this.traderShip = null;
    }
  }

  private updateTrader(dt: number): void {
    const o = this.traderShip;
    if (!o) return;
    o.t += dt;
    // Glide in from the left, then bob gently at the berth.
    const arrive = Math.min(1, o.t / 2.5);
    const ease = 1 - Math.pow(1 - arrive, 3);
    o.s.alpha = ease;
    o.s.x = -420 + 265 * ease;
    o.s.y = 118 + Math.sin(o.t * 1.3) * 4;
    o.s.rotation = Math.sin(o.t * 0.9) * 0.04;
    o.light.position.set(o.s.x - 26, o.s.y);
    o.light.scale.set(Math.sin(o.t * 4) > 0.4 ? 0.3 : 0.08);
  }

  spawnGolden(): void {
    if (this.ready && !this.drifts.some((d) => d.kind === 'golden')) this.spawnDrift('golden');
  }

  hitSpecial(sx: number, sy: number): 'crate' | 'meteor' | 'convoy' | 'golden' | null {
    if (!this.ready) return null;
    const p = this.toWorld(sx, sy);
    const reach: Record<DriftKind, number> = { debris: 0, crate: 34, meteor: 32, convoy: 46, golden: 42 };
    const hit = this.drifts.find((d) => d.kind !== 'debris' && Math.hypot(d.s.x - p.x, d.s.y - p.y) < reach[d.kind]);
    if (!hit) return null;
    // Read the position before removing it: a destroyed sprite has none.
    const { x, y } = hit.s;
    this.removeDrift(hit);
    this.lastHit = { x, y };
    const color = hit.kind === 'meteor' ? 0xff9a4c : hit.kind === 'convoy' ? 0x5cd6ff : hit.kind === 'golden' ? 0xffe27a : COLORS.dock;
    this.burst(x, y, color, hit.kind === 'meteor' ? 22 : hit.kind === 'golden' ? 60 : 34, hit.kind === 'golden' ? 2.4 : 1.7);
    if (hit.kind === 'golden') this.rings.push({ x, y, r: 20, life: 1.4, color: 0xffffff, width: 5 });
    this.puff(x, y, color, 3, 0.6);
    this.rings.push({ x, y, r: 10, life: 1, color, width: 3 });
    this.shake = Math.max(this.shake, hit.kind === 'meteor' ? 4 : 6);
    return hit.kind as 'crate' | 'meteor' | 'convoy' | 'golden';
  }

  /**
   * The machine under a screen point, for press-and-hold. Checks the nearest sprite of each kind
   * against its on-screen size, smallest things first so a drone in front of the dock ring wins.
   */
  machineAt(sx: number, sy: number): GeneratorId | null {
    if (!this.ready) return null;
    const groups: [GeneratorId, Container[]][] = [
      ['drone', this.drones.map((d) => d.s)],
      ['laser', this.turrets.map((t) => t.s)],
      ['fabricator', this.fabs],
      ['smelter', this.pods],
      ['hauler', this.haulers.map((h) => h.s)],
      ['dock', [...this.dockedShips, ...this.docks]],
      ['gravity', this.wells.map((w) => w.s)],
      ['gate', this.gate ? [this.gate.ring] : []],
      ['dyson', this.sun ? [this.sun.core, ...this.sun.panels] : []],
    ];
    let best: { id: GeneratorId; d: number } | null = null;
    for (const [id, sprites] of groups) {
      for (const sp of sprites) {
        if (sp.destroyed || !sp.visible) continue;
        const b = sp.getBounds();
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        const reach = Math.max(18, Math.min(b.width, b.height) / 2);
        const d = Math.hypot(cx - sx, cy - sy);
        if (d < reach && (!best || d < best.d)) best = { id, d };
      }
    }
    return best?.id ?? null;
  }

  /** Whether a screen point is on the docked trader's ship. */
  traderAt(sx: number, sy: number): boolean {
    const o = this.traderShip;
    if (!this.ready || !o || o.s.destroyed) return false;
    const b = o.s.getBounds();
    return sx >= b.x - 10 && sx <= b.x + b.width + 10 && sy >= b.y - 10 && sy <= b.y + b.height + 10;
  }

  /** Where a hit happened, in world units, for floating text. */
  lastHit = { x: 0, y: 0 };

  /** Effects for a tap at screen point (sx, sy) worth `label`. */
  tapAt(sx: number, sy: number, label: string): void {
    if (!this.ready) return;
    const p = this.toWorld(sx, sy);
    const color = this.boosting ? COLORS.boost : this.flare > 0.5 ? 0xfff0c0 : this.coreColor;
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
    if (!this.ready) return;
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
    text.style.fill = big ? COLORS.dock : this.boosting ? COLORS.boost : this.coreColor;
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
  /** Brings a boss wreck in (an index into the wreck art), or sends it off when null. */
  setBoss(kind: number | null, defeated = false): void {
    if (!this.ready) return;
    if (kind === null) {
      if (!this.boss) return;
      if (defeated) this.explodeBoss();
      else this.boss.state = 'out';
      this.boss.t = 0;
      return;
    }
    if (this.boss) this.boss.c.destroy({ children: true });
    const c = new Container();
    const glow = this.sprite(this.tex.glow, c);
    glow.blendMode = 'add';
    glow.tint = 0xff5d6c;
    glow.scale.set(7, 4);
    glow.alpha = 0.25;
    const slot = kind % this.tex.bosses.length;
    const hull = this.sprite((this.tex.bosses[slot] ??= art.bossWreck(slot)), c);
    const cracks = this.sprite(this.tex.cracks[kind % this.tex.cracks.length], c);
    cracks.blendMode = 'add';
    cracks.alpha = 0;
    const bar = new Graphics();
    c.addChild(bar);
    c.scale.set(BOSS_SCALE);
    c.position.set(-WORLD, BOSS_POS.y);
    this.bossLayer.addChild(c);
    this.boss = { c, hull, cracks, glow, bar, shown: -1, state: 'in', t: 0, hit: 0, health: 1 };
  }

  /** The health bar floating over the wreck; the red part eases down after each hit. */
  private drawBossBar(b: NonNullable<StationScene['boss']>, dt: number): void {
    const target = b.health;
    b.shown = b.shown < 0 ? target : Math.max(target, b.shown - Math.max(0.02, (b.shown - target) * 4) * dt);
    const w = 150;
    const h = 9;
    const x = -w / 2;
    const y = 58;
    const g = b.bar;
    g.clear();
    g.roundRect(x - 3, y - 3, w + 6, h + 6, 7).fill({ color: 0x14081c, alpha: 0.85 });
    g.roundRect(x - 3, y - 3, w + 6, h + 6, 7).stroke({ color: 0xff5d6c, width: 1.5, alpha: 0.9 });
    if (b.shown > target) g.roundRect(x, y, w * b.shown, h, 4.5).fill({ color: 0xffffff, alpha: 0.75 });
    if (target > 0) {
      g.roundRect(x, y, Math.max(h, w * target), h, 4.5).fill({ color: target > 0.5 ? 0xff7a59 : target > 0.25 ? 0xff5d6c : 0xff3d5a });
      g.roundRect(x + 2, y + 1.5, Math.max(0, w * target - 4), 2.5, 1.2).fill({ color: 0xffffff, alpha: 0.35 });
    }
    // Notches every 10%.
    for (let i = 1; i < 10; i++) g.rect(x + (w * i) / 10 - 0.5, y, 1, h).fill({ color: 0x14081c, alpha: 0.45 });
    // Keep the bar level while the wreck rocks.
    g.rotation = -b.c.rotation;
  }

  setBossHealth(health: number): void {
    if (this.boss) this.boss.health = health;
  }

  /** A tap landed on the wreck: the claw fires a bolt at it. */
  bossHit(): void {
    if (!this.ready || !this.boss || this.boss.state !== 'here') return;
    const b = this.boss;
    b.hit = 1;
    const x = b.c.x + rand(-60, 60) * BOSS_SCALE;
    const y = b.c.y + rand(-22, 22) * BOSS_SCALE;
    this.beams.push({ x, y, life: 1 });
    this.burst(x, y, 0xffb070, 5, 0.6);
  }

  private explodeBoss(): void {
    const b = this.boss!;
    b.state = 'dead';
    for (let i = 0; i < 6; i++) {
      const x = b.c.x + rand(-80, 80) * BOSS_SCALE;
      const y = b.c.y + rand(-30, 30) * BOSS_SCALE;
      this.burst(x, y, i % 2 ? 0xffb070 : 0xff5d6c, 22, 1.8);
      this.puff(x, y, 0xff9a4c, 3, 0.8);
    }
    this.rings.push({ x: b.c.x, y: b.c.y, r: 30, life: 1.2, color: 0xffd166, width: 5 });
    this.shake = Math.max(this.shake, 9);
    // The wreck's scrap streams into the claw.
    for (let i = 0; i < 14; i++) {
      const s = this.chunkPool.get();
      s.texture = this.tex.debris[i % this.tex.debris.length];
      s.scale.set(rand(0.5, 0.9));
      this.chunks.push({ s, x0: b.c.x + rand(-70, 70), y0: b.c.y + rand(-25, 25), t: -i * 0.06, dur: rand(0.5, 0.8), color: COLORS.scrap });
    }
  }

  private updateBoss(dt: number): void {
    const b = this.boss;
    if (b) {
      b.t += dt;
      b.hit = Math.max(0, b.hit - dt * 5);
      if (b.state === 'in') {
        const k = Math.min(1, b.t / 2.2);
        b.c.x = -WORLD + (BOSS_POS.x + WORLD) * (1 - (1 - k) ** 3);
        if (k >= 1) b.state = 'here';
      } else if (b.state === 'out') {
        b.c.x -= dt * 60 * (1 + b.t * 2);
        b.c.alpha = Math.max(0, 1 - b.t / 2.5);
      } else if (b.state === 'dead') {
        b.c.alpha = Math.max(0, 1 - b.t * 2.5);
        b.c.scale.set(BOSS_SCALE * (1 + b.t * 0.3));
      }
      if (b.state !== 'out' && b.state !== 'dead') b.c.y = BOSS_POS.y + Math.sin(this.time * 0.7) * 4;
      b.c.rotation = Math.sin(this.time * 0.4) * 0.03 + (b.hit ? rand(-0.012, 0.012) : 0);
      b.hull.tint = b.hit > 0.5 ? 0xffd6c0 : 0xffffff;
      b.cracks.alpha = (1 - b.health) * (0.7 + 0.3 * Math.sin(this.time * 6));
      this.drawBossBar(b, dt);
      b.glow.alpha = 0.18 + (1 - b.health) * 0.35;
      // Smoke and sparks leak from a damaged wreck.
      if (b.state === 'here' && Math.random() < dt * (1 + (1 - b.health) * 6)) {
        const s = this.sparkPool.get();
        s.position.set(b.c.x + rand(-70, 70) * BOSS_SCALE, b.c.y + rand(-25, 25) * BOSS_SCALE);
        s.tint = Math.random() < 0.5 ? 0xffb070 : 0xff5d6c;
        s.scale.set(0.35);
        const a = rand(0, TAU);
        this.sparks.push({ s, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 10, life: 0.7, max: 0.7 });
      }
      if ((b.state === 'out' || b.state === 'dead') && b.c.alpha <= 0) {
        b.c.destroy({ children: true });
        this.boss = null;
      }
    }
    const g = this.beamG;
    const tip = { x: CLAW_TIP.x, y: CLAW_TIP.y + this.hub.y };
    for (const beam of [...this.beams]) {
      beam.life -= dt * 6;
      if (beam.life <= 0) {
        this.beams.splice(this.beams.indexOf(beam), 1);
        continue;
      }
      g.moveTo(tip.x, tip.y).lineTo(beam.x, beam.y).stroke({ width: 4 * beam.life, color: 0xffb070, alpha: beam.life * 0.5 });
      g.moveTo(tip.x, tip.y).lineTo(beam.x, beam.y).stroke({ width: 1.5 * beam.life, color: 0xffffff, alpha: beam.life });
    }
  }

  /** Shows the active pet floating around the station, or none. */
  setPet(id: PetId | null, tint = 0xffffff): void {
    if (!this.ready) return;
    if (this.pet?.id === id) {
      this.pet.s.tint = tint;
      return;
    }
    if (this.pet) this.pet.s.destroy();
    this.pet = null;
    if (!id) return;
    const s = this.sprite(this.tex.pets[id], this.droneLayer);
    s.scale.set(0.9);
    s.tint = tint;
    this.pet = { s, id, angle: rand(0, TAU), pounce: 0 };
    this.puff(s.x, s.y, 0xffffff, 2, 0.4);
  }

  /** The cat leaps at the core for a free tap. */
  petPounce(label: string): void {
    if (!this.ready || !this.pet) return;
    this.pet.pounce = 1;
    this.squash = Math.max(this.squash, 0.6);
    this.puff(0, 0, 0xc58cff, 1.2, 0.25);
    this.floatText(this.pet.s.x * 0.5, this.pet.s.y * 0.5 - 14, label);
  }

  private updatePet(dt: number): void {
    const p = this.pet;
    if (!p) return;
    p.angle += dt * 0.45;
    p.pounce = Math.max(0, p.pounce - dt * 2.2);
    // A lazy figure-of-eight around the hub; a pounce pulls it to the core and back.
    const ox = Math.sin(p.angle) * 96;
    const oy = Math.sin(p.angle * 2) * 34 + 8;
    const k = Math.sin(p.pounce * Math.PI);
    const x = ox * (1 - k);
    const y = oy * (1 - k) + this.hub.y;
    const facing = Math.cos(p.angle) >= 0 ? 1 : -1;
    p.s.position.set(x, y + Math.sin(this.time * 2.4) * 3);
    p.s.scale.set(0.9 * facing * (1 + k * 0.2), 0.9 * (1 - k * 0.1));
    p.s.rotation = Math.sin(this.time * 1.7) * 0.12;
  }

  /** A few bursts of colour popping around the station, for a big moment. */
  fireworks(colors: number[]): void {
    if (!this.ready) return;
    const n = this.calmFlash ? 2 : 6;
    for (let i = 0; i < n; i++) {
      window.setTimeout(() => {
        const a = rand(0, TAU);
        const d = rand(70, 150);
        const x = Math.cos(a) * d;
        const y = Math.sin(a) * d * 0.8;
        const c = colors[i % colors.length];
        this.burst(x, y, c, this.calmFlash ? 12 : 26, 1.5);
        this.rings.push({ x, y, r: 6, life: 0.9, color: c, width: 2.5 });
        this.puff(x, y, c, 2, 0.5);
      }, i * 170);
    }
    this.squash = Math.max(this.squash, 0.6);
  }

  celebrate(color = COLORS.dock): void {
    if (!this.ready) return;
    this.rings.push({ x: 0, y: 0, r: 40, life: 1, color, width: 4 });
    this.rings.push({ x: 0, y: 0, r: 20, life: 1.3, color, width: 2 });
    this.puff(0, 0, color, 5, 0.7);
    this.burst(0, 0, color, 40, 1.9);
    this.shake = Math.max(this.shake, 5);
  }

  private frame(dt: number): void {
    this.time += dt;
    this.jump = Math.max(0, this.jump - dt);
    const warpTarget = this.jump > 0.6 ? 2.6 : this.boosting ? 1 : 0;
    this.warp += (warpTarget - this.warp) * Math.min(1, dt * 3);
    // The flash peaks partway through the jump, as the station lands somewhere new.
    const jt = 2.4 - this.jump;
    this.flash.alpha = this.jump > 0 ? Math.max(0, 1 - Math.abs(jt - 1.6) * 2.2) * (this.calmFlash ? 0.12 : 0.85) : 0;
    const speed = 1 + Math.min(1, this.warp) * 1.4;
    if (Math.abs(this.zoom - this.zoomTarget) > 0.0005) {
      this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 1.5);
      this.scale = (this.baseScale * this.viewZoom) / this.zoom;
      this.world.scale.set(this.scale);
    }
    this.flare += ((this.event === 'flare' ? 1 : 0) - this.flare) * Math.min(1, dt * 2);
    this.flareGlow.alpha = this.flare * (this.calmFlash ? 0.4 : 0.55 + 0.15 * Math.sin(this.time * 3));
    this.updatePan(dt);
    this.updateStars(dt);
    this.updateScenery(dt);
    this.updateDrifts(dt);
    this.updateMachines(dt * speed);
    this.updateFar(dt * speed);
    this.updateHub(dt);
    this.updateOrnaments();
    this.updateBoss(dt);
    this.updatePet(dt);
    this.updateFx(dt);
    if (this.calmShake) this.shake = 0;
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
    for (const d of this.dust) {
      const s = d.s;
      s.x += (d.vx + 4) * d.depth * dt;
      s.y += (d.vy + fall * 0.6) * d.depth * dt;
      if (s.x > w + 10) s.x -= w + 20;
      if (s.x < -10) s.x += w + 20;
      if (s.y > h + 10) s.y -= h + 20;
      if (s.y < -10) s.y += h + 20;
      s.alpha = (0.25 + 0.35 * Math.sin(this.time * 0.9 + d.phase) ** 2) * d.depth;
    }

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

  private spawnDrift(kind: DriftKind): void {
    const half = WORLD * 0.8;
    const fromLeft = Math.random() < 0.5;
    const tex = kind === 'golden' ? this.tex.golden : kind === 'crate' ? this.tex.crate : kind === 'meteor' ? this.tex.meteor : kind === 'convoy' ? this.tex.hauler : this.tex.debris[Math.floor(Math.random() * this.tex.debris.length)];
    const s = new Sprite(tex);
    s.anchor.set(0.5);
    let vx = (fromLeft ? 1 : -1) * rand(12, 28);
    let vy = rand(-6, 6);
    s.position.set(fromLeft ? -half : half, rand(-WORLD * 0.42, WORLD * 0.42));
    s.scale.set(rand(0.5, 1.1));
    if (kind === 'debris') s.alpha = rand(0.55, 0.9);
    if (kind === 'crate') {
      s.scale.set(1.1);
      vx = (fromLeft ? 1 : -1) * rand(26, 34);
    }
    if (kind === 'golden') {
      s.scale.set(1.25);
      vx = (fromLeft ? 1 : -1) * rand(20, 24);
      vy = rand(-3, 3);
      s.y = rand(-WORLD * 0.3, WORLD * 0.2);
    }
    if (kind === 'meteor') {
      // Meteors rain in from the top, angled across the station.
      s.position.set(rand(-half, half * 0.6), -WORLD * 0.75);
      const a = rand(0.95, 1.35);
      const v = rand(70, 105);
      vx = Math.cos(a) * v * (fromLeft ? 1 : -1);
      vy = Math.sin(a) * v;
      s.scale.set(rand(1.1, 1.5));
    }
    if (kind === 'convoy') {
      s.scale.set(fromLeft ? 2.8 : -2.8, 2.8);
      s.tint = 0xd8f6ff;
      vx = (fromLeft ? 1 : -1) * 24;
      vy = 0;
      s.y = rand(-WORLD * 0.3, -WORLD * 0.15);
    }
    let glow: Sprite | undefined;
    let tail: Sprite | undefined;
    if (kind !== 'debris') {
      glow = new Sprite(this.tex.glow);
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.tint = kind === 'meteor' ? 0xff7a3d : kind === 'convoy' ? 0x5cd6ff : kind === 'golden' ? 0xffd84a : COLORS.dock;
      this.debrisLayer.addChild(glow);
    }
    if (kind === 'meteor') {
      tail = new Sprite(this.tex.streak);
      tail.anchor.set(1, 0.5);
      tail.blendMode = 'add';
      tail.tint = 0xffa060;
      tail.rotation = Math.atan2(vy, vx);
      tail.scale.set(3.2, 1.6);
      this.debrisLayer.addChild(tail);
    }
    this.debrisLayer.addChild(s);
    this.drifts.push({ s, glow, tail, vx, vy, vr: kind === 'convoy' ? 0 : rand(-0.8, 0.8) * (kind === 'meteor' ? 3 : 1), kind });
  }

  private updateDrifts(dt: number): void {
    const half = WORLD * 0.8;
    this.nextDebris -= dt;
    this.nextCrate -= dt;
    if (this.nextDebris <= 0) {
      this.spawnDrift('debris');
      this.nextDebris = rand(1.8, 4.5);
    }
    if (this.nextCrate <= 0) {
      this.spawnDrift('crate');
      this.nextCrate = rand(90, 160) / this.crateRate;
    }
    if (this.holdCrate && !this.drifts.some((d) => d.kind === 'crate')) {
      this.spawnDrift('crate');
      const c = this.drifts[this.drifts.length - 1];
      // Start it just inside the view, below the station and clear of Mika's card.
      c.vx *= 0.45;
      c.vy = 0;
      c.s.position.set(Math.sign(c.vx) * -WORLD * 0.4, rand(WORLD * 0.14, WORLD * 0.24));
    }
    if (this.event === 'meteors') {
      this.nextMeteor -= dt;
      if (this.nextMeteor <= 0) {
        this.spawnDrift('meteor');
        this.nextMeteor = rand(0.45, 0.9);
      }
    }
    if (this.event === 'convoy' && !this.drifts.some((d) => d.kind === 'convoy')) this.spawnDrift('convoy');
    for (const d of [...this.drifts]) {
      d.s.x += d.vx * dt;
      d.s.y += d.vy * dt;
      d.s.rotation += d.vr * dt;
      if (d.kind === 'convoy') d.s.y += Math.sin(this.time * 1.5) * dt * 6;
      if (d.glow) {
        d.glow.position.copyFrom(d.s.position);
        const p = 0.5 + 0.5 * Math.sin(this.time * 5);
        const base = d.kind === 'convoy' ? 2.4 : d.kind === 'meteor' ? 0.9 : d.kind === 'golden' ? 2.2 : 1.3;
        d.glow.scale.set(base + p * 0.4);
        d.glow.alpha = 0.55 + p * 0.3;
      }
      d.tail?.position.copyFrom(d.s.position);
      // Golden crates glitter and bob gently.
      if (d.kind === 'golden') {
        d.s.rotation = Math.sin(this.time * 2) * 0.15;
        if (Math.random() < dt * 14) this.burst(d.s.x + rand(-14, 14), d.s.y + rand(-14, 14), 0xffe27a, 1, 0.5);
      }
      const gone = Math.abs(d.s.x) > half + 1 || d.s.y > WORLD * 0.8;
      if (gone) this.removeDrift(d);
    }
  }

  private removeDrift(d: Drift): void {
    this.drifts.splice(this.drifts.indexOf(d), 1);
    d.s.destroy();
    d.glow?.destroy();
    d.tail?.destroy();
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
      const ea = o.angle - 0.06;
      o.engine!.position.set(Math.cos(ea) * o.radius, Math.sin(ea) * o.radius);
      o.engine!.scale.set(0.35 + 0.08 * Math.sin(t * 20 + o.wobble) + this.warp * 0.2);
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

    // Smelters vent a little heat now and then.
    const pods = this.pods.length;
    if (pods) {
      this.nextSteam -= dt;
      if (this.nextSteam <= 0) {
        const p = this.pods[Math.floor(Math.random() * pods)];
        const a = p.rotation;
        this.puff(p.x + Math.cos(a) * 12, p.y + Math.sin(a) * 12, Math.random() < 0.5 ? 0xffb070 : 0xffe0c0, 1.1, rand(0.5, 0.8));
        this.nextSteam = rand(0.6, 1.8) / Math.sqrt(pods);
      }
    }

    this.updateTraffic(dt);
    this.updateTrader(dt);

    // Drones dart around in a loose swarm, leaving short trails.
    for (const o of this.drones) {
      o.angle += o.speed * dt;
      const r = o.radius + Math.sin(t * 2 + o.wobble) * 4;
      o.s.position.set(Math.cos(o.angle) * r, Math.sin(o.angle) * r);
      o.s.rotation = o.angle + (o.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.trail(g, r, o.angle, o.speed > 0 ? -1 : 1, 0.3, COLORS.drone, 1.6);
    }
  }

  /** Tiny far-off ships cross the sky now and then, nav lights blinking. */
  private updateTraffic(dt: number): void {
    this.nextTraffic -= dt;
    if (this.nextTraffic <= 0 && this.traffic.length < 3 && !this.reducedMotion) {
      this.nextTraffic = rand(7, 16);
      const left = Math.random() < 0.5;
      const y = rand(-320, 320);
      const speed = rand(28, 50);
      const s = this.sprite(this.tex.hauler, this.farLayer, left ? -520 : 520, y);
      s.scale.set(rand(0.22, 0.32));
      s.alpha = 0.55;
      s.tint = 0x9fb0d8;
      const vy = rand(-6, 6);
      s.rotation = Math.atan2(vy, left ? speed : -speed) + Math.PI / 2;
      const light = this.sprite(this.tex.glow, this.farLayer, s.x, s.y);
      light.blendMode = 'add';
      light.tint = Math.random() < 0.5 ? 0xff5d6c : 0x7cf7c8;
      this.traffic.push({ s, light, vx: left ? speed : -speed, vy, life: 1040 / speed, blink: rand(0, TAU) });
    }
    for (let i = this.traffic.length - 1; i >= 0; i--) {
      const o = this.traffic[i];
      o.life -= dt;
      o.s.x += o.vx * dt;
      o.s.y += o.vy * dt;
      o.light.position.set(o.s.x, o.s.y);
      o.blink += dt * 5;
      o.light.scale.set(Math.sin(o.blink) > 0.6 ? 0.18 : 0.04);
      if (o.life <= 0) {
        o.s.destroy();
        o.light.destroy();
        this.traffic.splice(i, 1);
      }
    }
  }

  /** Background life: the galaxy turns, the moon orbits, big rocks drift past the camera. */
  private updateScenery(dt: number): void {
    const { width: w } = this.app.screen;
    this.galaxy.rotation += dt * 0.012;

    this.moonAngle += dt * 0.07;
    const pr = this.planet.width * 0.5;
    const ma = this.moonAngle;
    this.moon.position.set(this.planet.x + pr * 0.15 + Math.cos(ma) * pr * 0.5, this.planet.y - pr * 0.72 + Math.sin(ma) * pr * 0.16);
    // Pass in front of the planet on the near side of the orbit, behind it on the far side.
    const z = Math.sin(ma) > 0 ? 5 : 3;
    if (this.moon.zIndex !== z) this.moon.zIndex = z;

    if (this.reducedMotion) return;
    this.nextRock -= dt;
    if (this.nextRock <= 0 && this.rocks.length < 2) {
      const fromLeft = Math.random() < 0.5;
      const s = new Sprite(this.tex.rocks[Math.floor(Math.random() * this.tex.rocks.length)]);
      s.anchor.set(0.5);
      const size = Math.min(w, 500) * rand(0.2, 0.3);
      s.scale.set(size / 80);
      s.tint = 0xc8c0e0;
      s.alpha = 0.9;
      s.position.set(fromLeft ? -size : w + size, rand(this.focus.top, this.focus.bottom || this.app.screen.height));
      this.fgLayer.addChild(s);
      this.rocks.push({ s, vx: (fromLeft ? 1 : -1) * rand(10, 18), vr: rand(-0.08, 0.08) });
      this.nextRock = rand(25, 50);
    }
    for (const r of [...this.rocks]) {
      r.s.x += r.vx * dt * (1 + this.warp * 6);
      r.s.rotation += r.vr * dt;
      if (r.s.x < -r.s.width || r.s.x > w + r.s.width) {
        this.rocks.splice(this.rocks.indexOf(r), 1);
        r.s.destroy();
      }
    }
  }

  /** The late-game machines: lasers, gravity wells, nanites, the warp gate and the Dyson swarm. */
  private updateFar(dt: number): void {
    const g = this.beamG.clear();
    const t = this.time;

    for (const tu of this.turrets) {
      tu.cool -= dt;
      tu.beam = Math.max(0, tu.beam - dt);
      const x = tu.s.x;
      const y = tu.s.y;
      if (tu.cool <= 0) {
        // Shoot the nearest passing rock if there is one, otherwise sweep the dark.
        let target: Drift | null = null;
        let best = 240;
        for (const d of this.drifts) {
          const dist = Math.hypot(d.s.x - x, d.s.y - y);
          if (d.kind === 'debris' && dist < best) {
            best = dist;
            target = d;
          }
        }
        if (target) {
          tu.tx = target.s.x;
          tu.ty = target.s.y;
          this.removeDrift(target);
          this.burst(tu.tx, tu.ty, COLORS.laser, 14, 0.9);
          this.puff(tu.tx, tu.ty, 0xffb0a0, 1.6, 0.35);
        } else {
          const a = tu.angle + rand(-0.7, 0.7);
          const d = rand(70, 130);
          tu.tx = x + Math.cos(a) * d;
          tu.ty = y + Math.sin(a) * d;
          this.burst(tu.tx, tu.ty, COLORS.laser, 4, 0.4);
        }
        tu.aim = Math.atan2(tu.ty - y, tu.tx - x);
        tu.beam = 0.2;
        tu.cool = rand(1.4, 3.4) / Math.sqrt(this.turrets.length);
      } else if (tu.beam === 0) {
        tu.aim += (tu.angle - tu.aim) * Math.min(1, dt * 0.8);
      }
      tu.s.rotation = tu.aim + Math.PI / 2;
      if (tu.beam > 0) {
        const k = tu.beam / 0.2;
        const bx = x + Math.cos(tu.aim) * 12;
        const by = y + Math.sin(tu.aim) * 12;
        g.moveTo(bx, by).lineTo(tu.tx, tu.ty).stroke({ width: 5 * k, color: COLORS.laser, alpha: 0.35 * k });
        g.moveTo(bx, by).lineTo(tu.tx, tu.ty).stroke({ width: 1.6 * k, color: 0xfff0f0, alpha: k });
      }
    }

    for (const w of this.wells) {
      w.s.rotation += w.spin * dt * 1.1;
      w.s.scale.set(0.95 + 0.06 * Math.sin(t * 1.3 + w.x));
    }
    for (const m of this.motes) {
      const w = this.wells[m.well % this.wells.length];
      if (!w) continue;
      m.d -= dt * m.v * (10 + (46 - m.d) * 0.9);
      m.a += w.spin * dt * (1.5 + 40 / (m.d + 6));
      if (m.d < 3) {
        m.d = 46;
        m.a = rand(0, TAU);
      }
      m.s.position.set(w.x + Math.cos(m.a) * m.d, w.y + Math.sin(m.a) * m.d * 0.85);
      m.s.scale.set(0.04 + (m.d / 46) * 0.07);
      m.s.alpha = Math.min(1, (46 - m.d) / 8) * Math.min(1, m.d / 6);
    }

    for (const n of this.nanites) {
      n.p = (n.p + dt * 0.03) % 1;
      const u = n.p * TAU;
      const r = 198 + 20 * Math.sin(u * 3 + t * 0.5) + n.lane * 12 * Math.sin(t * 1.9 + n.p * 50);
      n.s.position.set(Math.cos(u) * r, Math.sin(u) * r * 0.8);
      n.s.scale.set(n.size * (0.8 + 0.35 * Math.sin(t * 6 + n.p * 90)));
      n.s.alpha = 0.55 + 0.45 * Math.sin(t * 3 + n.lane * 9);
    }

    if (this.gate) {
      const gt = this.gate;
      gt.portal.rotation -= dt * 0.9;
      gt.ring.rotation += dt * 0.05;
      gt.glow.alpha = 0.35 + 0.15 * Math.sin(t * 2);
      this.nextGateShip -= dt;
      if (this.nextGateShip <= 0 && this.gateShips.length < 4) {
        const s = this.sprite(this.tex.hauler, this.farLayer, GATE_POS.x, GATE_POS.y);
        s.tint = 0xdcd2ff;
        const engine = this.sprite(this.tex.glow, this.farLayer);
        engine.blendMode = 'add';
        engine.tint = COLORS.gate;
        const a = Math.atan2(GATE_POS.y, GATE_POS.x) + rand(-0.6, 0.6);
        this.gateShips.push({ s, engine, t: 0, x0: GATE_POS.x, y0: GATE_POS.y, x1: Math.cos(a) * 128, y1: Math.sin(a) * 128 });
        this.puff(GATE_POS.x, GATE_POS.y, COLORS.gate, 2.2, 0.4);
        this.nextGateShip = rand(3, 7) / Math.sqrt(Math.sqrt(this.gateShips.length + 1));
      }
    }
    for (const sh of [...this.gateShips]) {
      sh.t += dt / 2.8;
      const k = 1 - Math.pow(1 - Math.min(1, sh.t), 2);
      const x = sh.x0 + (sh.x1 - sh.x0) * k;
      const y = sh.y0 + (sh.y1 - sh.y0) * k;
      const dir = Math.atan2(sh.y1 - sh.y0, sh.x1 - sh.x0);
      sh.s.position.set(x, y);
      sh.s.rotation = dir;
      sh.s.scale.set(0.3 + Math.min(1, sh.t * 4) * 0.45);
      const alpha = Math.min(1, sh.t * 8) * Math.min(1, (1 - sh.t) * 4);
      sh.s.alpha = alpha;
      sh.engine.position.set(x - Math.cos(dir) * 10, y - Math.sin(dir) * 10);
      sh.engine.scale.set(0.45 + 0.1 * Math.sin(t * 25));
      sh.engine.alpha = alpha;
      if (sh.t >= 1) {
        this.gateShips.splice(this.gateShips.indexOf(sh), 1);
        sh.s.destroy();
        sh.engine.destroy();
      }
    }

    if (this.sun) {
      const sn = this.sun;
      sn.glow.alpha = 0.5 + 0.12 * Math.sin(t * 1.4);
      sn.core.scale.set(1 + 0.04 * Math.sin(t * 2.3));
      const n = sn.panels.length;
      sn.panels.forEach((p, i) => {
        const a = (i / n) * TAU + t * 0.25;
        p.position.set(SUN_POS.x + Math.cos(a) * 30, SUN_POS.y + Math.sin(a) * 11);
        p.rotation = Math.cos(a) * 0.5;
        p.scale.set(0.7 + 0.3 * Math.abs(Math.sin(a)), 0.8);
        p.alpha = Math.sin(a) > 0 ? 1 : 0.45;
      });
      // Power beamed home to the station core.
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      g.moveTo(SUN_POS.x, SUN_POS.y).lineTo(0, 0).stroke({ width: 3, color: COLORS.dyson, alpha: 0.06 + pulse * 0.05 });
      const packets = Math.min(5, 1 + Math.floor(Math.sqrt(this.dysonCount)));
      for (let k = 0; k < packets; k++) {
        const f = (t * 0.3 + k / packets) % 1;
        g.circle(SUN_POS.x * (1 - f), SUN_POS.y * (1 - f), 2.4).fill({ color: COLORS.dyson, alpha: Math.sin(f * Math.PI) * 0.9 });
      }
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
    this.antenna.rotation = Math.sin(t * 0.7) * 0.06;

    const color = this.boosting ? COLORS.boost : this.flare > 0.5 ? 0xfff4d8 : this.coreColor;
    const beat = 0.5 + 0.5 * Math.sin(t * (this.boosting ? 10 : 2.4));
    this.core.tint = color;
    this.coreGlow.tint = color;
    this.coreGlow.scale.set(2 + beat * 0.25 + this.squash * 0.6);
    this.coreGlow.alpha = 0.7 + beat * 0.3;
    this.claw.scale.set(1, 1 + Math.sin(this.clawSnap * Math.PI) * 0.18);
    const spin = this.boosting ? 3 : 1;
    this.plasma.forEach((p, i) => {
      p.rotation = t * (i ? -0.9 : 0.6) * spin;
      p.tint = color;
      p.alpha = 0.55 + 0.25 * Math.sin(t * 1.7 + i * 2);
    });
    this.rays.rotation = t * 0.08;
    this.rays.tint = color;
    this.rays.alpha = 0.22 + beat * 0.12 + this.squash * 0.3;
    this.rays.scale.set(1.25 + beat * 0.08 + this.squash * 0.25);
    this.reactorRing.rotation = -t * 0.5 * spin;
    this.reactorRing.tint = color;
    this.coreHot.alpha = 0.6 + beat * 0.3 + this.squash * 0.4;

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
