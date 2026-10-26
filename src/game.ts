import { GENERATORS, MILESTONES, type GeneratorId } from './core/config';
import { checkAchievements, type AchievementDef } from './core/achievements';
import { ACHIEVEMENT_CRYSTALS, TUTORIAL, type CrewId, type EventKind, type PetId, type TutorialStep } from './core/content';
import * as eco from './core/economy';
import type { ModuleId } from './core/expansion';
import * as meta from './core/meta';
import type { Decimal } from './core/num';
import { deserialize, newState, serialize, type GameState } from './core/state';

const SAVE_KEY = 'scrap-orbit-save';
const AUTOSAVE_MS = 30_000;
/** Gaps longer than this between frames count as time away (tab hidden, phone locked). */
const AWAY_THRESHOLD_SEC = 5;
const ACHIEVEMENT_CHECK_MS = 1_000;
const AUTOBUY_MS = 2_000;
/** Crystals for each relocation. */
const RELOCATE_CRYSTALS = 5;

export type GameEvent =
  | { type: 'tap'; value: Decimal }
  | { type: 'bought'; gen: GeneratorId; count: number }
  | { type: 'milestone'; gen: GeneratorId; at: number }
  | { type: 'upgrade'; id: string }
  | { type: 'boost' }
  | { type: 'offline'; seconds: number; earned: Decimal }
  | { type: 'bonus'; value: Decimal }
  | { type: 'achievement'; def: AchievementDef }
  | { type: 'relocate'; cores: number; crystals: number }
  | { type: 'crew'; id: CrewId; level: number }
  | { type: 'research'; id: string; phase: 'start' | 'done' }
  | { type: 'decor'; id: string }
  | { type: 'mission'; crystals: number }
  | { type: 'missionReady' }
  | { type: 'event'; kind: EventKind; phase: 'start' | 'end' }
  | { type: 'meteor'; value: Decimal }
  | { type: 'convoy'; crystals: number }
  | { type: 'tutorial'; step: TutorialStep | null }
  | { type: 'claw'; level: number }
  | { type: 'streak' }
  | { type: 'streakClaim'; reward: meta.ClaimedReward }
  | { type: 'pet'; id: PetId | null; adopted: boolean }
  | { type: 'petTap'; value: Decimal }
  | { type: 'boss' }
  | { type: 'bossDefeated'; scrap: Decimal; crystals: number; loot?: string }
  | { type: 'bossEscape' }
  | { type: 'goldenSpawn' }
  | { type: 'golden' }
  | { type: 'module'; id: string | null; slot: number }
  | { type: 'trip'; crew: CrewId; dest: string }
  | { type: 'tripReady'; crew: CrewId }
  | { type: 'tripHome'; reward: meta.TripReward }
  | { type: 'skin'; pet: PetId }
  | { type: 'bossHit'; value: Decimal }
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
  private readyMissions = 0;
  private lastPounce = Date.now();
  private streakShown = '';
  private tripsReady = new Set<CrewId>();

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
    meta.refreshMissions(this.state, Date.now());
    this.readyMissions = meta.claimableMissions(this.state);
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
      this.state.stats.playSec += dt;
      this.state.stats.runSec += dt;
    }
    this.updateBoss(now, Math.min(dt, 1));
    if (meta.catDue(this.state, this.lastPounce, now)) {
      this.lastPounce = now;
      const value = eco.tap(this.state, now);
      this.emit({ type: 'petTap', value });
      this.hitBoss(value, now);
    }
    if (now - this.lastAutoBuy > AUTOBUY_MS) {
      this.lastAutoBuy = now;
      if (eco.hasPerk(this.state, 'autobuy') && this.state.settings.autoBuy) this.autoBuy();
    }
    if (now - this.lastCheck > ACHIEVEMENT_CHECK_MS) {
      this.lastCheck = now;
      this.slowUpdate(now);
    }
    if (now - this.lastSave > AUTOSAVE_MS) this.save();
  }

  /** Once a second: achievements, missions, research timers, events, records. */
  private slowUpdate(now: number): void {
    const s = this.state;
    for (const def of checkAchievements(s)) {
      meta.addCrystals(s, ACHIEVEMENT_CRYSTALS);
      this.emit({ type: 'achievement', def });
    }
    meta.refreshMissions(s, now);
    const ready = meta.claimableMissions(s);
    if (ready > this.readyMissions) this.emit({ type: 'missionReady' });
    this.readyMissions = ready;
    const done = meta.finishResearch(s, now);
    if (done) this.emit({ type: 'research', id: done, phase: 'done' });
    const ev = meta.updateEvents(s, now);
    if (ev.started) this.emit({ type: 'event', kind: ev.started, phase: 'start' });
    if (ev.ended) this.emit({ type: 'event', kind: ev.ended, phase: 'end' });
    if (meta.goldenDue(s, now)) this.emit({ type: 'goldenSpawn' });
    for (const t of s.trips) {
      if (now >= t.endsAt && !this.tripsReady.has(t.crew)) {
        this.tripsReady.add(t.crew);
        this.emit({ type: 'tripReady', crew: t.crew });
      }
    }
    const inc = eco.baseIncome(s);
    if (inc.gt(s.stats.bestIncome)) s.stats.bestIncome = inc.toString();
    // A new day's reward waits until the tutorial is over, then is offered once per day.
    if (s.tutorial < 0 && meta.checkLogin(s, now) && this.streakShown !== s.login.day) {
      this.streakShown = s.login.day;
      this.emit({ type: 'streak' });
    }
  }

  private updateBoss(now: number, dt: number): void {
    if (dt <= 0) return;
    const r = meta.updateBoss(this.state, now, dt);
    if (r.arrived) this.emit({ type: 'boss' });
    if (r.escaped) this.emit({ type: 'bossEscape' });
    if (r.defeated) this.emit({ type: 'bossDefeated', ...r.defeated });
  }

  private hitBoss(value: Decimal, now: number): void {
    if (!this.state.boss) return;
    this.emit({ type: 'bossHit', value });
    const won = meta.hitBoss(this.state, value, now);
    if (won) this.emit({ type: 'bossDefeated', ...won });
  }

  claimStreak(): void {
    const reward = meta.claimLogin(this.state, Date.now());
    if (reward) this.emit({ type: 'streakClaim', reward });
  }

  buyPet(id: PetId): void {
    if (meta.buyPet(this.state, id)) this.emit({ type: 'pet', id, adopted: true });
  }

  choosePet(id: PetId | null): void {
    if (meta.choosePet(this.state, id)) this.emit({ type: 'pet', id, adopted: false });
  }

  /** Tapping the golden crate starts a golden rush. */
  collectGolden(): void {
    meta.claimGolden(this.state, Date.now());
    this.emit({ type: 'golden' });
  }

  buildModule(slot: number, id: ModuleId): void {
    if (meta.buildModule(this.state, slot, id)) this.emit({ type: 'module', id, slot });
  }

  removeModule(slot: number): void {
    if (meta.removeModule(this.state, slot) > 0) this.emit({ type: 'module', id: null, slot });
  }

  startTrip(crew: CrewId, dest: string): void {
    if (meta.startTrip(this.state, crew, dest, Date.now())) this.emit({ type: 'trip', crew, dest });
  }

  claimTrip(index: number): void {
    const reward = meta.claimTrip(this.state, index, Date.now());
    if (!reward) return;
    this.tripsReady.delete(reward.crew);
    this.emit({ type: 'tripHome', reward });
  }

  chooseSkin(pet: PetId, skin: string | null): void {
    if (meta.chooseSkin(this.state, pet, skin)) this.emit({ type: 'skin', pet });
  }

  /** The tutorial step the player is on, or null once it is finished or skipped. */
  get tutorialStep(): TutorialStep | null {
    return this.state.tutorial >= 0 ? (TUTORIAL[this.state.tutorial] ?? null) : null;
  }

  /** Moves the tutorial on when the player has done what the current step asks. */
  advanceTutorial(step: TutorialStep): void {
    if (this.tutorialStep !== step) return;
    if (this.state.tutorial >= TUTORIAL.length - 1) return this.endTutorial();
    this.state.tutorial += 1;
    this.emit({ type: 'tutorial', step: this.tutorialStep });
  }

  /** Marks a one-time tip as seen. */
  seeTip(id: string): void {
    this.state.tips.add(id);
  }

  endTutorial(): void {
    this.state.tutorial = -1;
    this.emit({ type: 'tutorial', step: null });
  }

  trainCrew(id: CrewId): void {
    if (meta.trainCrew(this.state, id)) this.emit({ type: 'crew', id, level: this.state.crew[id] });
  }

  startResearch(id: string): void {
    if (meta.startResearch(this.state, id, Date.now())) this.emit({ type: 'research', id, phase: 'start' });
  }

  rushResearch(): void {
    const id = meta.rushResearch(this.state, Date.now());
    if (id) this.emit({ type: 'research', id, phase: 'done' });
  }

  useDecor(id: string): void {
    if (meta.useDecor(this.state, id)) this.emit({ type: 'decor', id });
  }

  claimMission(index: number): void {
    const crystals = meta.claimMission(this.state, index);
    if (crystals > 0) {
      this.readyMissions = meta.claimableMissions(this.state);
      this.emit({ type: 'mission', crystals });
    }
  }

  smashMeteor(): Decimal {
    const value = meta.smashMeteor(this.state, Date.now());
    this.emit({ type: 'meteor', value });
    return value;
  }

  boardConvoy(): number {
    const crystals = meta.boardConvoy(this.state);
    this.emit({ type: 'convoy', crystals });
    return crystals;
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
    const now = Date.now();
    const value = eco.tap(this.state, now);
    this.emit({ type: 'tap', value });
    this.hitBoss(value, now);
    return value;
  }

  /** Bonus crate: worth 30 seconds of income or 25 taps, whichever is more. */
  collectBonus(): Decimal {
    const now = Date.now();
    const a = eco.income(this.state, now).mul(30);
    const b = eco.tapValue(this.state, now).mul(25);
    // The Orbit Pup doubles what crates are worth.
    const value = (a.gt(b) ? a : b).mul(meta.petActive(this.state, 'pup') ? 2 : 1);
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

  levelClaw(): void {
    if (eco.buyClaw(this.state)) this.emit({ type: 'claw', level: this.state.claw });
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
      meta.addCrystals(this.state, RELOCATE_CRYSTALS);
      this.save();
      this.emit({ type: 'relocate', cores, crystals: RELOCATE_CRYSTALS });
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
