import { AD_CRYSTALS, useAd, type AdReward } from './core/rewards';
import { FINALE_CRYSTALS, FINALE_ID, STORY_CRYSTALS, pendingStory } from './core/story';
import { markOf } from './core/evolve';
import { comboMult, cooled, heatAfterTap } from './core/combo';
import { CONTRACT_CRYSTALS, checkContract, contractAutoBuyOff, makeOffers, pickContract, type ContractId } from './core/contracts';
import { recordIncome, recordRun } from './core/history';
import { catchStar, type StarPrize } from './core/lucky';
import { claimWeekly, updateWeekly, weeklyProgress, type WeeklyId } from './core/weekly';
import { openCrate, openMiniCrate, type CratePrize } from './core/crates';
import { GENERATORS, MILESTONES, type GeneratorId } from './core/config';
import { bestPurchase } from './core/advisor';
import { checkOrnaments, toggleOrnament } from './core/ornaments';
import { checkAchievements, type AchievementDef } from './core/achievements';
import { ACHIEVEMENT_CRYSTALS, RESEARCH, TUTORIAL, type CrewId, type EventKind, type PetId, type TutorialStep } from './core/content';
import * as eco from './core/economy';
import type { ModuleId } from './core/expansion';
import * as meta from './core/meta';
import { D, type Decimal } from './core/num';
import { deserialize, newState, serialize, type GameState } from './core/state';

const SAVE_KEY = 'scrap-orbit-save';
const AUTOSAVE_MS = 30_000;
/** Gaps longer than this between frames count as time away (tab hidden, phone locked). */
const AWAY_THRESHOLD_SEC = 5;
const ACHIEVEMENT_CHECK_MS = 1_000;
const AUTOBUY_MS = 2_000;
/** Seconds of play before the first daily reward pops up. */
const STREAK_SETTLE_SEC = 240;
/** Crystals for each relocation. */
const RELOCATE_CRYSTALS = 5;

export type GameEvent =
  | { type: 'tap'; value: Decimal }
  | { type: 'bought'; gen: GeneratorId; count: number }
  | { type: 'milestone'; gen: GeneratorId; at: number }
  /** A machine reached a new model: `mark` 1 is Mk II. */
  | { type: 'evolve'; gen: GeneratorId; mark: number }
  | { type: 'upgradeAll'; ids: string[] }
  | { type: 'adReward'; kind: AdReward; earned?: Decimal; fired?: boolean }
  | { type: 'upgrade'; id: string }
  | { type: 'boost' }
  | { type: 'offline'; seconds: number; earned: Decimal; report: OfflineReport }
  | { type: 'bonus'; prize: CratePrize }
  | { type: 'mini'; value: Decimal }
  | { type: 'achievement'; def: AchievementDef }
  | { type: 'relocate'; cores: number; crystals: number; speed: number }
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
  | { type: 'rig' }
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
  | { type: 'trader'; phase: 'arrived' | 'left' }
  | { type: 'safe' }
  | { type: 'safeOpened'; reward: meta.SafeReward }
  | { type: 'set'; id: string }
  | { type: 'stationSkin' }
  | { type: 'ornament'; id: string; fresh: boolean }
  | { type: 'galaxy'; stars: number }
  | { type: 'starNode'; id: string }
  | { type: 'trade'; result: meta.TradeResult }
  | { type: 'challenge'; id: string; phase: 'start' | 'done' | 'abandon'; cores?: number }
  | { type: 'reset' }
  /** Combo heat reached the top. */
  | { type: 'comboMax' }
  /** Contracts: offered after a relocation, signed (or skipped), met or failed. */
  | { type: 'contract'; phase: 'start' | 'done' | 'failed'; id?: ContractId }
  | { type: 'star'; prize: StarPrize }
  | { type: 'weekly'; phase: 'start' | 'tier'; id: WeeklyId }
  | { type: 'weeklyClaim'; crystals: number; paint?: string }
  /** A radio transmission came in (ready to play), or was just heard. */
  | { type: 'story'; id: string; phase: 'ready' | 'heard'; crystals?: number };

/** What happened while the player was away, for the welcome-back screen. */
export interface OfflineReport {
  research?: string;
  trips: CrewId[];
  bossEscaped: boolean;
  golden: boolean;
  trader: boolean;
  /** The multiplier offline earnings got (owl, research, greenhouses, loot). */
  mult: number;
}

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
  private storyShown = '';
  private tripsReady = new Set<CrewId>();
  /** What each little crate of the current swarm is worth. */
  private swarmEach: Decimal = D(1);

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
    } else if (dt > 0) {
      // (A clock that jumps backwards gives a negative gap: skip that frame.)
      eco.tick(this.state, dt, now);
      this.state.lastSeen = now;
      this.state.stats.playSec += dt;
      this.state.stats.runSec += dt;
    }
    this.updateBoss(now, Math.min(dt, 1));
    if (this.state.tutorial < 0) recordIncome(this.state, now);
    // A new week brings a new weekly event (after a new captain has settled in, so it isn't lost).
    if (this.state.tutorial < 0 && this.state.stats.playSec >= STREAK_SETTLE_SEC) {
      const started = updateWeekly(this.state, now);
      if (started) this.emit({ type: 'weekly', phase: 'start', id: started.id });
      const tier = weeklyProgress(this.state).tier;
      if (tier > this.weeklyTier && this.weeklyTier >= 0) this.emit({ type: 'weekly', phase: 'tier', id: this.state.weekly.id as WeeklyId });
      this.weeklyTier = tier;
    }
    if (meta.catDue(this.state, this.lastPounce, now)) {
      this.lastPounce = now;
      const value = eco.tap(this.state, now);
      this.emit({ type: 'petTap', value });
      this.hitBoss(value, now);
    }
    if (now - this.lastAutoBuy > AUTOBUY_MS) {
      this.lastAutoBuy = now;
      if (eco.hasPerk(this.state, 'autobuy') && this.state.settings.autoBuy && !contractAutoBuyOff(this.state)) this.autoBuy();
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
    const trader = meta.updateTrader(s, now);
    if (trader) this.emit({ type: 'trader', phase: trader });
    if (meta.updateSafe(s, now)) this.emit({ type: 'safe' });
    meta.noteCollection(s);
    for (const set of meta.checkSets(s)) this.emit({ type: 'set', id: set.id });
    // Decorations wait for the tutorial to finish, so it stays uncluttered.
    if (s.tutorial < 0) for (const o of checkOrnaments(s)) this.emit({ type: 'ornament', id: o.id, fresh: true });
    const deal = s.contract;
    const outcome = checkContract(s, now);
    if (outcome === 'done') meta.addCrystals(s, CONTRACT_CRYSTALS);
    if (outcome) this.emit({ type: 'contract', phase: outcome, id: deal!.id });
    const beaten = meta.checkChallenge(s);
    if (beaten) this.emit({ type: 'challenge', id: beaten.id, phase: 'done' });
    for (const t of s.trips) {
      if (now >= t.endsAt && !this.tripsReady.has(t.crew)) {
        this.tripsReady.add(t.crew);
        this.emit({ type: 'tripReady', crew: t.crew });
      }
    }
    const story = pendingStory(s);
    if (story && story.id !== this.storyShown) {
      this.storyShown = story.id;
      this.emit({ type: 'story', id: story.id, phase: 'ready' });
    }
    const inc = eco.baseIncome(s);
    if (inc.gt(s.stats.bestIncome)) s.stats.bestIncome = inc.toString();
    // A new day's reward waits until the tutorial is over and a brand-new captain has had a few
    // minutes to settle in, then is offered once per day.
    if (s.tutorial < 0 && s.stats.playSec >= STREAK_SETTLE_SEC && meta.checkLogin(s, now) && this.streakShown !== s.login.day) {
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

  /** Marks a radio transmission heard (only the one that is ready), paying its crystals. */
  hearStory(id: string): void {
    const ready = pendingStory(this.state);
    if (!ready || ready.id !== id) return;
    this.state.story.heard.add(id);
    const crystals = id === FINALE_ID ? FINALE_CRYSTALS : STORY_CRYSTALS;
    meta.addCrystals(this.state, crystals);
    this.emit({ type: 'story', id, phase: 'heard', crystals });
    this.save();
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
  /** A lucky shooting star was tapped: rolls and pays its surprise. */
  catchStar(): StarPrize {
    const prize = catchStar(this.state, Date.now());
    this.emit({ type: 'star', prize });
    return prize;
  }

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

  /** Starts cracking the waiting cargo pod; returns its type, or null. */
  openSafe(): string | null {
    return meta.openSafe(this.state, Date.now());
  }

  finishSafe(locks: number): void {
    const reward = meta.finishSafe(this.state, locks);
    if (reward) this.emit({ type: 'safeOpened', reward });
  }

  toggleOrnament(id: string): void {
    if (toggleOrnament(this.state, id)) this.emit({ type: 'ornament', id, fresh: false });
  }

  chooseStationSkin(id: string | null): void {
    if (meta.chooseStationSkin(this.state, id)) this.emit({ type: 'stationSkin' });
  }

  trade(index: number): void {
    const result = meta.trade(this.state, index, Date.now());
    if (result) this.emit({ type: 'trade', result });
  }

  startChallenge(id: string): void {
    const cores = meta.startChallenge(this.state, id, Date.now());
    if (cores < 0) return;
    this.save();
    this.emit({ type: 'challenge', id, phase: 'start', cores });
  }

  abandonChallenge(): void {
    const id = this.state.challenge;
    if (id && meta.abandonChallenge(this.state)) this.emit({ type: 'challenge', id, phase: 'abandon' });
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

  private weeklyTier = -1;

  /** Claims the next weekly event tier reached. */
  claimWeekly(): void {
    const r = claimWeekly(this.state);
    if (r) this.emit({ type: 'weeklyClaim', crystals: r.crystals, paint: r.paint });
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
    const s = this.state;
    const since = s.lastSeen;
    // Read what changed while away before the regular updates tidy it up.
    const research = s.research.active && s.research.active.endsAt <= now ? RESEARCH.find((r) => r.id === s.research.active!.id)?.name : undefined;
    const report: OfflineReport = {
      research,
      trips: s.trips.filter((t) => t.endsAt > since && t.endsAt <= now).map((t) => t.crew),
      bossEscaped: !!s.boss && s.boss.endsAt <= now,
      golden: s.tutorial < 0 && s.golden.nextAt > 0 && s.golden.nextAt <= now,
      trader: s.tutorial < 0 && s.trader.nextAt > 0 && s.trader.nextAt <= now && !s.trader.until,
      mult: eco.offlineMult(s),
    };
    const { seconds, earned } = eco.applyOffline(s, now);
    this.lastFrame = now;
    // Time spent watching an optional ad is credited quietly, not greeted with "welcome back".
    if (seconds >= 30 && earned.gt(0) && !this.adPlaying) this.emit({ type: 'offline', seconds, earned, report });
  }

  /** True while an optional ad plays (and a moment after), when the game may be paused behind it. */
  adPlaying = false;

  /** Combo heat as of the last tap, and when that was (core/combo.ts). */
  private heat = 0;
  private lastTapAt = 0;

  /** Combo heat right now, 0 to 1. */
  heatNow(now = Date.now()): number {
    return cooled(this.heat, (now - this.lastTapAt) / 1000);
  }

  tap(): Decimal {
    const now = Date.now();
    const before = this.heatNow(now);
    this.heat = heatAfterTap(this.heat, (now - this.lastTapAt) / 1000);
    this.lastTapAt = now;
    if (this.heat >= 1 && before < 1) this.emit({ type: 'comboMax' });
    const value = eco.tap(this.state, now, comboMult(this.heat));
    this.emit({ type: 'tap', value });
    this.hitBoss(value, now);
    return value;
  }

  /** A lucky crate: cracks it open and pays whatever is inside. */
  collectBonus(): CratePrize {
    const now = Date.now();
    const prize = openCrate(this.state, now, Math.random(), this.state.tutorial < 0);
    if (prize.kind === 'swarm') this.swarmEach = prize.each;
    this.emit({ type: 'bonus', prize });
    return prize;
  }

  /** One of the little crates a swarm spilled out. */
  collectMini(): Decimal {
    const value = openMiniCrate(this.state, this.swarmEach);
    this.emit({ type: 'mini', value });
    return value;
  }

  buy(id: GeneratorId, mode: eco.BuyMode | number = this.buyMode): void {
    const before = this.state.owned[id];
    const count = eco.buyGenerator(this.state, id, mode);
    if (count === 0) return;
    this.emit({ type: 'bought', gen: id, count });
    const after = this.state.owned[id];
    const mark = markOf(after);
    if (mark > markOf(before)) {
      // A new model outshines the milestone it lands on, so only the evolution is announced.
      this.emit({ type: 'evolve', gen: id, mark });
      return;
    }
    for (const m of MILESTONES) {
      if (before < m && after >= m) this.emit({ type: 'milestone', gen: id, at: m });
    }
  }

  /** Buys whatever pays for itself soonest, if it is affordable. */
  buyBest(): boolean {
    const p = bestPurchase(this.state);
    if (!p || p.cost.gt(this.state.scrap)) return false;
    if (p.kind === 'upgrade') this.buyUpgrade(p.id);
    else if (p.kind === 'claw') this.levelClaw();
    else this.buy(p.id, p.count);
    return true;
  }

  /** Builds this sector's rig. */
  buildRig(): void {
    if (eco.buildRig(this.state)) this.emit({ type: 'rig' });
  }

  levelClaw(): void {
    if (eco.buyClaw(this.state)) this.emit({ type: 'claw', level: this.state.claw });
  }

  buyUpgrade(id: string): void {
    if (eco.buyUpgrade(this.state, id)) this.emit({ type: 'upgrade', id });
  }

  /**
   * Pays an optional ad's reward, once the ad has been watched: doubles the welcome-back
   * earnings (`earned` is what came in), recharges Overdrive, or drops crystals.
   */
  adReward(kind: AdReward, earned?: Decimal): boolean {
    const now = Date.now();
    if (!useAd(this.state, kind, now)) return false;
    if (kind === 'offline' && earned) eco.earn(this.state, earned);
    // Overdrive may have finished recharging while the ad played: then the ad pays a free
    // Overdrive that leaves the cooldown alone, so watching it is never wasted.
    const fired = kind === 'overdrive' && now >= this.state.boostReadyAt;
    if (fired) this.state.boostUntil = Math.max(this.state.boostUntil, now) + eco.boostDurationSec(this.state) * 1000;
    else if (kind === 'overdrive') this.state.boostReadyAt = now;
    if (kind === 'crystals') meta.addCrystals(this.state, AD_CRYSTALS);
    this.emit({ type: 'adReward', kind, earned, fired });
    this.save();
    return true;
  }

  /** Installs every upgrade the scrap covers, cheapest first, with one announcement for the lot. */
  installAll(): number {
    const ids = eco.affordableUpgrades(this.state).map((u) => u.id).filter((id) => eco.buyUpgrade(this.state, id));
    if (ids.length === 1) this.emit({ type: 'upgrade', id: ids[0] });
    else if (ids.length > 1) this.emit({ type: 'upgradeAll', ids });
    return ids.length;
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
    const speed = eco.relocateSpeedup(this.state);
    const claim = eco.claimableCores(this.state);
    if (claim > 0) recordRun(this.state, claim, Date.now());
    // Contract offers are sized from the run that is ending, so they are drawn before the reset.
    const offers = claim > 0 ? makeOffers(this.state) : [];
    const cores = eco.relocate(this.state, Date.now());
    if (cores > 0) {
      this.state.contractOffers = offers;
      meta.addCrystals(this.state, RELOCATE_CRYSTALS);
      this.save();
      this.emit({ type: 'relocate', cores, crystals: RELOCATE_CRYSTALS, speed });
    }
    return cores;
  }

  /** Signs the offered contract at `index`, or none with null. */
  pickContract(index: number | null): void {
    const offer = pickContract(this.state, index, Date.now());
    this.save();
    this.emit({ type: 'contract', phase: 'start', id: offer?.id });
  }

  /** Shifts to a new galaxy for Galaxy Stars. */
  shiftGalaxy(): number {
    const stars = meta.shiftGalaxy(this.state, Date.now());
    if (stars > 0) {
      this.save();
      this.emit({ type: 'galaxy', stars });
    }
    return stars;
  }

  /** Buys a Star Map node, or the next Star Forge level when `id` is 'forge'. */
  buyStar(id: string): void {
    const ok = id === 'forge' ? meta.buyForge(this.state) : meta.buyStarNode(this.state, id);
    if (ok) this.emit({ type: 'starNode', id });
  }

  /** Swaps in a save loaded from a backup code and stores it straight away. */
  load(state: GameState): void {
    const now = Date.now();
    state.settings = this.state.settings;
    state.lastSeen = now;
    this.state = state;
    this.lastFrame = now;
    this.tripsReady.clear();
    this.streakShown = '';
    this.readyMissions = 0;
    this.weeklyTier = -1;
    this.save();
    this.emit({ type: 'reset' });
  }

  reset(): void {
    const now = Date.now();
    const settings = this.state.settings;
    this.state = newState(now);
    this.state.settings = settings;
    storageSet(null);
    this.lastFrame = now;
    this.tripsReady.clear();
    this.streakShown = '';
    this.readyMissions = 0;
    this.weeklyTier = -1;
    this.emit({ type: 'reset' });
  }

  generatorName(id: GeneratorId): string {
    return GENERATORS.find((g) => g.id === id)!.name;
  }
}
