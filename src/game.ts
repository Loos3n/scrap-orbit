import { GENERATORS, MILESTONES, type GeneratorId } from './core/config';
import { checkAchievements, type AchievementDef } from './core/achievements';
import * as eco from './core/economy';
import type { Decimal } from './core/num';
import { deserialize, newState, serialize, type GameState } from './core/state';

const SAVE_KEY = 'scrap-orbit-save';
const AUTOSAVE_MS = 30_000;
/** Gaps longer than this between frames count as time away (tab hidden, phone locked). */
const AWAY_THRESHOLD_SEC = 5;
const ACHIEVEMENT_CHECK_MS = 1_000;
const AUTOBUY_MS = 2_000;

export type GameEvent =
  | { type: 'tap'; value: Decimal }
  | { type: 'bought'; gen: GeneratorId; count: number }
  | { type: 'milestone'; gen: GeneratorId; at: number }
  | { type: 'upgrade'; id: string }
  | { type: 'boost' }
  | { type: 'offline'; seconds: number; earned: Decimal }
  | { type: 'bonus'; value: Decimal }
  | { type: 'achievement'; def: AchievementDef }
  | { type: 'relocate'; cores: number }
  | { type: 'reset' };

function storageGet(): string | null {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

function storageSet(value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, value);
  } catch {
    // Storage can be blocked (private mode, embedded views); the game still runs.
  }
}

export class Game {
  state: GameState;
  buyMode: eco.BuyMode = 1;
  private listeners: ((e: GameEvent) => void)[] = [];
  private lastFrame = Date.now();
  private lastSave = Date.now();
  private lastCheck = 0;
  private lastAutoBuy = Date.now();

  constructor() {
    const now = Date.now();
    this.state = deserialize(storageGet(), now) ?? newState(now);
  }

  on(fn: (e: GameEvent) => void): void {
    this.listeners.push(fn);
  }

  private emit(e: GameEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  /** Call once after listeners are attached, to credit time away since the last save. */
  start(): void {
    this.collectOffline(Date.now());
  }

  /** Advances the game to `now`. Called every animation frame. */
  update(now = Date.now()): void {
    const dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (dt > AWAY_THRESHOLD_SEC) {
      this.collectOffline(now);
    } else {
      eco.tick(this.state, dt, now);
      this.state.lastSeen = now;
    }
    if (now - this.lastAutoBuy > AUTOBUY_MS) {
      this.lastAutoBuy = now;
      if (eco.hasPerk(this.state, 'autobuy') && this.state.settings.autoBuy) this.autoBuy();
    }
    if (now - this.lastCheck > ACHIEVEMENT_CHECK_MS) {
      this.lastCheck = now;
      for (const def of checkAchievements(this.state)) this.emit({ type: 'achievement', def });
    }
    if (now - this.lastSave > AUTOSAVE_MS) this.save();
  }

  /** Auto-Builder perk: buys the cheapest machine on offer, if it's affordable. */
  private autoBuy(): void {
    const pick = eco.cheapestMachine(this.state);
    if (!pick || pick.cost.gt(this.state.scrap)) return;
    const mode = this.buyMode;
    this.buyMode = 1;
    this.buy(pick.id);
    this.buyMode = mode;
  }

  private collectOffline(now: number): void {
    const { seconds, earned } = eco.applyOffline(this.state, now);
    this.lastFrame = now;
    if (seconds >= 30 && earned.gt(0)) this.emit({ type: 'offline', seconds, earned });
  }

  tap(): Decimal {
    const value = eco.tap(this.state, Date.now());
    this.emit({ type: 'tap', value });
    return value;
  }

  /** Bonus crate: worth 30 seconds of income or 25 taps, whichever is more. */
  collectBonus(): Decimal {
    const now = Date.now();
    const a = eco.income(this.state, now).mul(30);
    const b = eco.tapValue(this.state, now).mul(25);
    const value = a.gt(b) ? a : b;
    eco.earn(this.state, value);
    this.state.stats.crates++;
    this.emit({ type: 'bonus', value });
    return value;
  }

  buy(id: GeneratorId): void {
    const before = this.state.owned[id];
    const count = eco.buyGenerator(this.state, id, this.buyMode);
    if (count === 0) return;
    this.emit({ type: 'bought', gen: id, count });
    const after = this.state.owned[id];
    for (const m of MILESTONES) {
      if (before < m && after >= m) this.emit({ type: 'milestone', gen: id, at: m });
    }
  }

  buyUpgrade(id: string): void {
    if (eco.buyUpgrade(this.state, id)) this.emit({ type: 'upgrade', id });
  }

  boost(): void {
    if (eco.activateBoost(this.state, Date.now())) this.emit({ type: 'boost' });
  }

  save(): void {
    this.state.lastSeen = Date.now();
    storageSet(serialize(this.state));
    this.lastSave = Date.now();
  }

  /** Prestige: trades this run for Star Cores. Returns the cores gained. */
  relocate(): number {
    const cores = eco.relocate(this.state, Date.now());
    if (cores > 0) {
      this.save();
      this.emit({ type: 'relocate', cores });
    }
    return cores;
  }

  reset(): void {
    const now = Date.now();
    const settings = this.state.settings;
    this.state = newState(now);
    this.state.settings = settings;
    storageSet(null);
    this.lastFrame = now;
    this.emit({ type: 'reset' });
  }

  generatorName(id: GeneratorId): string {
    return GENERATORS.find((g) => g.id === id)!.name;
  }
}
