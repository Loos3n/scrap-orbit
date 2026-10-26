import {
  BOSS,
  BOSS_NAMES,
  CALM_SEC,
  CAT_TAP_SEC,
  CONVOY_CRYSTALS,
  CREW,
  CREW_MAX_LEVEL,
  EVENT_GAP,
  EVENTS,
  FIRST_EVENT_SEC,
  METEOR_INCOME_SEC,
  MISSION_REWARDS,
  MISSION_TEMPLATES,
  PAINTS,
  PETS,
  RESEARCH,
  STREAK_REWARDS,
  THEMES,
  WEEKLY_REWARD,
  WEEKLY_SCALE,
  crewCost,
  rushCost,
  type CrewId,
  type EventKind,
  type MissionKind,
  type PetId,
  type StreakReward,
} from './content';
import { baseIncome, claimableCores, earn, income, researchProduct, resetRun, tapValue } from './economy';
import {
  CHALLENGES,
  CHALLENGE_CORES,
  GOLDEN,
  GRID,
  LOOT,
  LOOT_CHANCE,
  LOOT_PITY,
  MODULES,
  TRADER,
  TRADER_NAMES,
  TRIPS,
  TRIP_PER_LEVEL,
  TRIP_SLOTS,
  bonuses,
  moduleCost,
  moduleDef,
  moduleUnlocked,
  onTrip,
  tripMs,
  type ChallengeDef,
  type ModuleId,
  type Offer,
  type OfferKind,
} from './expansion';
import { D, Decimal } from './num';
import type { GameState, Mission } from './state';

// ---------- Crystals ----------

export function addCrystals(state: GameState, n: number): void {
  state.crystals += n;
  state.stats.crystalsEarned += n;
}

function spend(state: GameState, n: number): boolean {
  if (state.crystals < n) return false;
  state.crystals -= n;
  return true;
}

// ---------- Crew ----------

/** A crew member can join once their machine has been built this run or any run before. */
export function crewAvailable(state: GameState, id: CrewId): boolean {
  const def = CREW.find((c) => c.id === id)!;
  return state.owned[def.gen] > 0 || state.crew[id] > 0;
}

/** Crystals for the next level (recruiting is level 1), or null at max level. */
export function crewNextCost(state: GameState, id: CrewId): number | null {
  const level = state.crew[id];
  if (level >= CREW_MAX_LEVEL) return null;
  return crewCost(CREW.find((c) => c.id === id)!, level);
}

/** Recruits or levels up a crew member. */
export function trainCrew(state: GameState, id: CrewId): boolean {
  const cost = crewNextCost(state, id);
  if (cost === null || !crewAvailable(state, id) || !spend(state, cost)) return false;
  state.crew[id]++;
  return true;
}

// ---------- Research ----------

export function researchState(state: GameState, id: string): 'done' | 'active' | 'ready' | 'locked' {
  if (state.research.done.has(id)) return 'done';
  if (state.research.active?.id === id) return 'active';
  const def = RESEARCH.find((r) => r.id === id)!;
  return !def.requires || state.research.done.has(def.requires) ? 'ready' : 'locked';
}

export function startResearch(state: GameState, id: string, now: number): boolean {
  if (state.research.active || researchState(state, id) !== 'ready') return false;
  const def = RESEARCH.find((r) => r.id === id)!;
  state.research.active = { id, endsAt: now + def.seconds * 1000 };
  return true;
}

/** Completes the running research if its time is up. Returns the finished id. */
export function finishResearch(state: GameState, now: number): string | null {
  const a = state.research.active;
  if (!a || now < a.endsAt) return null;
  state.research.done.add(a.id);
  state.research.active = null;
  return a.id;
}

export function rushPrice(state: GameState, now: number): number {
  const a = state.research.active;
  return a ? rushCost((a.endsAt - now) / 1000) : 0;
}

/** Spends crystals to finish the running research now. */
export function rushResearch(state: GameState, now: number): string | null {
  const a = state.research.active;
  if (!a || !spend(state, rushPrice(state, now))) return null;
  a.endsAt = now;
  return finishResearch(state, now);
}

// ---------- Decorations ----------

export function decorCost(id: string): number | null {
  return (THEMES.find((t) => t.id === id) ?? PAINTS.find((p) => p.id === id))?.cost ?? null;
}

/** Buys a decoration if needed, then puts it on. */
export function useDecor(state: GameState, id: string): boolean {
  const cost = decorCost(id);
  if (cost === null) return false;
  if (!state.decor.owned.has(id)) {
    if (!spend(state, cost)) return false;
    state.decor.owned.add(id);
  }
  if (THEMES.some((t) => t.id === id)) state.decor.theme = id;
  else state.decor.paint = id;
  return true;
}

// ---------- Missions ----------

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day, so missions roll over at the player's midnight. */
export function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The Monday that starts this week. */
export function weekKey(now: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d.getTime());
}

function seeded(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let s = h >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function counter(state: GameState, kind: MissionKind): Decimal {
  switch (kind) {
    case 'taps':
      return D(state.taps);
    case 'machines':
      return D(state.stats.machines);
    case 'upgrades':
      return D(state.stats.upgradesBought);
    case 'crates':
      return D(state.stats.crates);
    case 'boosts':
      return D(state.stats.boosts);
    case 'meteors':
      return D(state.stats.meteors);
    case 'earn':
      return state.allTime;
  }
}

function makeMission(state: GameState, kind: MissionKind, tier: 0 | 1 | 2, scale: number): Mission {
  const t = MISSION_TEMPLATES.find((m) => m.kind === kind)!;
  let target = D(t.targets[tier] * scale);
  if (kind === 'earn') {
    // Earn goals are measured in minutes of current income, rounded to look tidy.
    const raw = Decimal.max(baseIncome(state), 1).mul(t.targets[tier] * scale).max(500);
    const mag = D(10).pow(Math.max(0, Math.floor(raw.log10()) - 1));
    target = raw.div(mag).ceil().mul(mag);
  }
  return { kind, tier, target: target.toString(), base: counter(state, kind).toString(), claimed: false };
}

/** Hands out fresh daily missions at midnight and a fresh weekly challenge each Monday. */
export function refreshMissions(state: GameState, now: number): boolean {
  let changed = false;
  const day = dayKey(now);
  if (state.missions.day !== day) {
    const r = seeded(day);
    const kinds = MISSION_TEMPLATES.map((m) => m.kind).filter((k) => k !== 'meteors' || state.stats.events > 0);
    const picks: MissionKind[] = [];
    while (picks.length < 3) {
      const k = kinds[Math.floor(r() * kinds.length)];
      if (!picks.includes(k)) picks.push(k);
    }
    state.missions.day = day;
    state.missions.daily = picks.map((k, i) => makeMission(state, k, i as 0 | 1 | 2, 1));
    changed = true;
  }
  const week = weekKey(now);
  if (state.missions.week !== week) {
    const r = seeded('w' + week);
    const kinds: MissionKind[] = ['taps', 'machines', 'earn', 'meteors'];
    state.missions.week = week;
    state.missions.weekly = makeMission(state, kinds[Math.floor(r() * kinds.length)], 2, WEEKLY_SCALE);
    changed = true;
  }
  return changed;
}

export function missionProgress(state: GameState, m: Mission): { done: Decimal; target: Decimal; pct: number } {
  const target = D(m.target);
  const done = Decimal.min(Decimal.max(counter(state, m.kind).sub(D(m.base)), 0), target);
  return { done, target, pct: target.gt(0) ? done.div(target).toNumber() : 1 };
}

export function missionComplete(state: GameState, m: Mission): boolean {
  return missionProgress(state, m).pct >= 1;
}

export function missionReward(state: GameState, m: Mission, weekly: boolean): number {
  return Math.round((weekly ? WEEKLY_REWARD : MISSION_REWARDS[m.tier]) * researchProduct(state, 'missionMult'));
}

export function missionText(m: Mission, fmt: (v: Decimal) => string): string {
  const t = MISSION_TEMPLATES.find((x) => x.kind === m.kind)!;
  return t.text(m.kind === 'earn' ? fmt(D(m.target)) : D(m.target).toNumber().toLocaleString('en-US'));
}

/** Claims a finished mission; `index` -1 is the weekly challenge. Returns crystals won. */
export function claimMission(state: GameState, index: number): number {
  const weekly = index < 0;
  const m = weekly ? state.missions.weekly : state.missions.daily[index];
  if (!m || m.claimed || !missionComplete(state, m)) return 0;
  m.claimed = true;
  const reward = missionReward(state, m, weekly);
  addCrystals(state, reward);
  return reward;
}

export function claimableMissions(state: GameState): number {
  const all = [...state.missions.daily, ...(state.missions.weekly ? [state.missions.weekly] : [])];
  return all.filter((m) => !m.claimed && missionComplete(state, m)).length;
}

// ---------- Events ----------

/**
 * True when nothing is going on: no event, boss, golden rush or trader, and the last one
 * started at least CALM_SEC ago. Anything due waits for this, so they never pile up.
 */
export function calm(state: GameState, now: number): boolean {
  return !eventActive(state, now) && !state.boss && now >= state.trader.until && now >= state.golden.until && now - state.lastHappening >= CALM_SEC * 1000;
}

export function eventActive(state: GameState, now: number): EventKind | null {
  return state.event && now < state.event.endsAt ? state.event.kind : null;
}

/**
 * Starts and ends timed events. `rand` is injectable for tests.
 * Returns what changed so the game can announce it.
 */
export function updateEvents(state: GameState, now: number, rand = Math.random): { started?: EventKind; ended?: EventKind } {
  if (state.nextEventAt === 0) state.nextEventAt = now + FIRST_EVENT_SEC * 1000;
  if (state.event && now >= state.event.endsAt) {
    const ended = state.event.kind;
    state.event = null;
    return { ended };
  }
  // Events hold off while anything else is going on, so there is always calm time between.
  if (!state.event && now >= state.nextEventAt && calm(state, now)) {
    const roll = rand();
    const kind: EventKind = roll < 0.45 ? 'meteors' : roll < 0.75 ? 'flare' : 'convoy';
    const endsAt = now + EVENTS[kind].seconds * 1000;
    const gap = (EVENT_GAP[0] + rand() * (EVENT_GAP[1] - EVENT_GAP[0])) / researchProduct(state, 'eventRate');
    state.event = { kind, endsAt };
    state.nextEventAt = endsAt + gap * 1000;
    state.lastHappening = now;
    state.stats.events++;
    return { started: kind };
  }
  return {};
}

/** A smashed meteor: a few seconds of income, or five taps, whichever is more. */
export function smashMeteor(state: GameState, now: number): Decimal {
  const a = income(state, now).mul(METEOR_INCOME_SEC);
  const b = tapValue(state, now).mul(5);
  const value = a.gt(b) ? a : b;
  earn(state, value);
  state.stats.meteors++;
  return value;
}

export function boardConvoy(state: GameState): number {
  addCrystals(state, CONVOY_CRYSTALS);
  return CONVOY_CRYSTALS;
}

// ---------- Daily login streak ----------

/**
 * Called on start and once a second: on a new calendar day, extends the streak if the last
 * visit was yesterday, or starts it over. Returns true when today's reward is waiting.
 */
export function checkLogin(state: GameState, now: number): boolean {
  const today = dayKey(now);
  const l = state.login;
  if (l.day !== today) {
    // Noon yesterday, so a daylight-saving shift can't skip or repeat a day.
    const noon = new Date(now);
    noon.setHours(12, 0, 0, 0);
    const yesterday = dayKey(noon.getTime() - 86_400_000);
    l.streak = l.day === yesterday ? l.streak + 1 : 1;
    l.best = Math.max(l.best, l.streak);
    l.day = today;
  }
  return l.claimed !== today;
}

/** Today's place on the 7-day reward track, 0 to 6. */
export function streakSlot(state: GameState): number {
  return (Math.max(1, state.login.streak) - 1) % STREAK_REWARDS.length;
}

/** The next pet a day-7 reward would hand out, if any are left. */
export function nextFreePet(state: GameState): PetId | null {
  return PETS.find((p) => !state.pets.owned.has(p.id))?.id ?? null;
}

/** What a scrap reward is worth right now: minutes of income, or taps if those pay more. */
export function streakScrap(state: GameState, minutes: number, now: number): Decimal {
  // Plain values, so claiming during Overdrive or a golden rush doesn't multiply the reward.
  const a = baseIncome(state).mul(minutes * 60);
  const b = tapValue(state, now, true).mul(minutes * 20);
  return Decimal.max(a.gt(b) ? a : b, D(100));
}

export type ClaimedReward = { kind: 'crystals'; amount: number } | { kind: 'scrap'; amount: Decimal } | { kind: 'pet'; pet: PetId };

export function claimLogin(state: GameState, now: number): ClaimedReward | null {
  if (!checkLogin(state, now)) return null;
  state.login.claimed = state.login.day;
  const r: StreakReward = STREAK_REWARDS[streakSlot(state)];
  if (r.kind === 'scrap') {
    const amount = streakScrap(state, r.minutes, now);
    earn(state, amount);
    return { kind: 'scrap', amount };
  }
  if (r.kind === 'pet') {
    const pet = nextFreePet(state);
    if (pet) {
      adoptPet(state, pet);
      return { kind: 'pet', pet };
    }
    addCrystals(state, r.crystals);
    return { kind: 'crystals', amount: r.crystals };
  }
  addCrystals(state, r.amount);
  return { kind: 'crystals', amount: r.amount };
}

// ---------- Pets ----------

function adoptPet(state: GameState, id: PetId): void {
  state.pets.owned.add(id);
  state.pets.active = id;
}

export function buyPet(state: GameState, id: PetId): boolean {
  const def = PETS.find((p) => p.id === id)!;
  if (state.pets.owned.has(id) || !spend(state, def.cost)) return false;
  adoptPet(state, id);
  return true;
}

export function choosePet(state: GameState, id: PetId | null): boolean {
  if (id !== null && !state.pets.owned.has(id)) return false;
  state.pets.active = id;
  return true;
}

export function petActive(state: GameState, id: PetId): boolean {
  return state.pets.active === id;
}

/** The cat's pounce: due every CAT_TAP_SEC while the cat is out. */
export function catDue(state: GameState, lastPounce: number, now: number): boolean {
  return petActive(state, 'cat') && now - lastPounce >= CAT_TAP_SEC * 1000;
}

// ---------- Boss wrecks ----------

export interface BossUpdate {
  arrived?: boolean;
  escaped?: boolean;
  defeated?: { scrap: Decimal; crystals: number; loot?: string };
}

function bossHp(state: GameState, now: number): Decimal {
  const tough = BOSS.growth ** state.stats.bosses;
  const hp = tapValue(state, now, true).mul(BOSS.hpTaps).add(baseIncome(state).mul(BOSS.hpIncomeSec));
  return Decimal.max(hp.mul(tough), D(60));
}

/** The scrap a wreck pays out: minutes of the station's scrap per second, set when it arrives. */
export function bossReward(state: GameState, now: number): Decimal {
  const a = baseIncome(state).mul(BOSS.rewardIncomeSec);
  // Plain values: a wreck that turns up during Overdrive or a golden rush shouldn't pay 14x.
  const t = tapValue(state, now, true).mul(BOSS.rewardTaps);
  return a.gt(t) ? a : t;
}

/** Damage multiplier on boss wrecks (the Goo Blob likes to chew). */
export function bossDamageMult(state: GameState): number {
  return (petActive(state, 'blob') ? 1.5 : 1) * (1 + bonuses(state).boss);
}

/**
 * Brings in, wears down and resolves boss wrecks. Machines chip at the wreck each second;
 * taps land through hitBoss. Wrecks wait until the tutorial is done and no event is running.
 */
export function updateBoss(state: GameState, now: number, dt: number, rand = Math.random): BossUpdate {
  const b = state.boss;
  if (!b) {
    if (state.tutorial >= 0) return {};
    if (state.nextBossAt === 0) state.nextBossAt = now + Math.max(0, BOSS.firstSec - state.stats.playSec) * 1000;
    if (now < state.nextBossAt || !calm(state, now)) return {};
    state.lastHappening = now;
    const hp = bossHp(state, now);
    state.boss = { name: state.stats.bosses % BOSS_NAMES.length, hp: hp.toString(), max: hp.toString(), endsAt: now + BOSS.seconds * 1000, reward: bossReward(state, now).toString() };
    return { arrived: true };
  }
  // Wrecks from saves made while bosses had no time limit get a fresh minute.
  if (!b.endsAt) b.endsAt = now + BOSS.seconds * 1000;
  const chip = baseIncome(state).mul(BOSS.machineShare * dt * bossDamageMult(state));
  const defeated = damageBoss(state, chip, now, rand);
  if (defeated) return { defeated };
  if (now >= b.endsAt) {
    state.boss = null;
    scheduleBoss(state, now, rand);
    return { escaped: true };
  }
  return {};
}

/** Seconds before the wreck flies off. */
export function bossTimeLeft(state: GameState, now: number): number {
  return state.boss ? Math.max(0, (state.boss.endsAt - now) / 1000) : 0;
}

/** Rolls for boss loot: a part or pet skin not yet found, sometimes, and always after a dry spell. */
function rollLoot(state: GameState, rand: () => number): string | undefined {
  const left = LOOT.filter((l) => !state.loot.has(l.id));
  if (left.length === 0) return undefined;
  if (state.lootMiss < LOOT_PITY && rand() >= LOOT_CHANCE) {
    state.lootMiss++;
    return undefined;
  }
  state.lootMiss = 0;
  const pick = left[Math.floor(rand() * left.length)];
  state.loot.add(pick.id);
  return pick.id;
}

function scheduleBoss(state: GameState, now: number, rand: () => number): void {
  const [lo, hi] = BOSS.gap;
  state.nextBossAt = now + (lo + rand() * (hi - lo)) * 60_000;
}

function damageBoss(state: GameState, amount: Decimal, now: number, rand: () => number = Math.random): BossUpdate['defeated'] {
  const b = state.boss;
  if (!b) return undefined;
  const hp = D(b.hp).sub(amount);
  if (hp.gt(0)) {
    b.hp = hp.toString();
    return undefined;
  }
  state.boss = null;
  state.stats.bosses++;
  scheduleBoss(state, now, rand);
  const scrap = b.reward ? D(b.reward) : bossReward(state, now);
  earn(state, scrap);
  addCrystals(state, BOSS.crystals);
  return { scrap, crystals: BOSS.crystals, loot: rollLoot(state, rand) };
}

/** A tap on the scene while a wreck is in range: the claw's tap value lands on it too. */
export function hitBoss(state: GameState, tap: Decimal, now: number, rand = Math.random): BossUpdate['defeated'] {
  return damageBoss(state, tap.mul(bossDamageMult(state)), now, rand);
}

/** Health left, 0 to 1. */
export function bossHealth(state: GameState): number {
  const b = state.boss;
  if (!b) return 0;
  return Math.max(0, Math.min(1, D(b.hp).div(b.max).toNumber()));
}

// ---------- Station modules ----------

/** Builds a module in an empty grid slot, for crystals. */
export function buildModule(state: GameState, slot: number, id: ModuleId): boolean {
  const def = moduleDef(id);
  if (!def || slot < 0 || slot >= GRID * GRID || state.modules[slot] || !moduleUnlocked(state, id)) return false;
  if (def.max && state.modules.filter((m) => m === id).length >= def.max) return false;
  const cost = moduleCost(state, id);
  if (state.crystals < cost) return false;
  state.crystals -= cost;
  state.modules[slot] = id;
  state.modulePaid[slot] = cost;
  return true;
}

/**
 * Takes a module down and refunds exactly what it cost, so layouts are free to try. (Refunding
 * today's price instead let players farm crystals by building and removing in a clever order.)
 */
export function removeModule(state: GameState, slot: number): number {
  const id = state.modules[slot] as ModuleId | null;
  if (!id) return 0;
  const refund = state.modulePaid[slot] ?? 0;
  state.modules[slot] = null;
  state.modulePaid[slot] = 0;
  state.crystals += refund;
  return refund;
}

// ---------- Expeditions ----------

/** Sends a recruited crew member off on a trip, if a slot is free. */
export function startTrip(state: GameState, crew: CrewId, dest: string, now: number): boolean {
  const def = TRIPS.find((t) => t.id === dest);
  if (!def || state.crew[crew] < 1 || onTrip(state, crew) || state.trips.length >= TRIP_SLOTS) return false;
  state.trips.push({ crew, dest, endsAt: now + tripMs(state, def) });
  return true;
}

export interface TripReward {
  crew: CrewId;
  dest: string;
  scrap: Decimal;
  crystals: number;
  blueprint?: string;
}

/** Brings a finished trip home and hands out what the crew found. */
export function claimTrip(state: GameState, index: number, now: number, rand = Math.random): TripReward | null {
  const trip = state.trips[index];
  if (!trip || now < trip.endsAt) return null;
  const def = TRIPS.find((t) => t.id === trip.dest)!;
  state.trips.splice(index, 1);
  const skill = 1 + (state.crew[trip.crew] - 1) * TRIP_PER_LEVEL;
  const [lo, hi] = def.crystals;
  const crystals = Math.round((lo + rand() * (hi - lo)) * skill);
  const scrap = baseIncome(state).mul(def.scrapMin * 60 * skill);
  earn(state, scrap);
  addCrystals(state, crystals);
  let blueprint: string | undefined;
  const missing = MODULES.filter((m) => m.blueprint && !state.blueprints.has(m.id));
  if (missing.length > 0 && rand() < def.blueprint) {
    blueprint = missing[Math.floor(rand() * missing.length)].id;
    state.blueprints.add(blueprint);
  }
  return { crew: trip.crew, dest: trip.dest, scrap, crystals, blueprint };
}

// ---------- Golden scrap ----------

/** True when a golden crate should drift in now (and books the one after). */
export function goldenDue(state: GameState, now: number, rand = Math.random): boolean {
  if (state.tutorial >= 0) return false;
  if (state.golden.nextAt === 0) {
    state.golden.nextAt = now + GOLDEN.firstMin * 60_000;
    return false;
  }
  if (now < state.golden.nextAt || !calm(state, now)) return false;
  state.lastHappening = now;
  const [lo, hi] = GOLDEN.gap;
  state.golden.nextAt = now + ((lo + rand() * (hi - lo)) * 60_000) / (1 + bonuses(state).golden);
  return true;
}

/** Tapping a golden crate starts the rush. */
export function claimGolden(state: GameState, now: number): void {
  state.golden.until = now + GOLDEN.seconds * 1000;
  state.stats.golden = (state.stats.golden ?? 0) + 1;
}

/** Picks the skin a pet wears (a loot id the player has found), or null for its own coat. */
export function chooseSkin(state: GameState, pet: PetId, skin: string | null): boolean {
  if (skin === null) {
    delete state.skins[pet];
    return true;
  }
  const def = LOOT.find((l) => l.id === skin);
  if (!def || def.pet !== pet || !state.loot.has(skin)) return false;
  state.skins[pet] = skin;
  return true;
}

// ---------- Trading post ----------

export function traderHere(state: GameState, now: number): boolean {
  return now < state.trader.until;
}

/** Fills the trader's hold with three deals that make sense right now. */
function makeOffers(state: GameState, now: number, rand: () => number): Offer[] {
  const inc = Decimal.max(baseIncome(state), 1);
  const missingBlueprint = MODULES.some((m) => m.blueprint && !state.blueprints.has(m.id));
  const missingLoot = LOOT.some((l) => !state.loot.has(l.id));
  const pool: Offer[] = [
    { kind: 'crystals', pay: 'scrap', price: inc.mul(TRADER.crystalsPriceMin * 60).ceil().toString(), amount: String(TRADER.crystalsBought), bought: false },
    { kind: 'scrap', pay: 'crystals', price: String(TRADER.scrapPrice), amount: inc.mul(TRADER.scrapMin * 60).floor().toString(), bought: false },
  ];
  if (missingBlueprint) pool.push({ kind: 'blueprint', pay: 'crystals', price: String(TRADER.blueprintPrice), amount: '0', bought: false });
  if (state.trips.some((t) => t.endsAt > now)) pool.push({ kind: 'recall', pay: 'crystals', price: String(TRADER.recallPrice), amount: '0', bought: false });
  if (missingLoot) pool.push({ kind: 'loot', pay: 'crystals', price: String(TRADER.lootPrice), amount: '0', bought: false });
  // Shuffle and keep three.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

/**
 * Brings the trader in and sends them off. Returns 'arrived' or 'left' when that happens.
 * The trader waits for the tutorial to finish.
 */
export function updateTrader(state: GameState, now: number, rand = Math.random): 'arrived' | 'left' | null {
  const t = state.trader;
  if (state.tutorial >= 0) return null;
  if (t.until && now >= t.until) {
    t.until = 0;
    t.offers = [];
    return 'left';
  }
  if (t.nextAt === 0) {
    t.nextAt = now + TRADER.firstMin * 60_000;
    return null;
  }
  if (t.until || now < t.nextAt || !calm(state, now)) return null;
  state.lastHappening = now;
  t.until = now + TRADER.stayMin * 60_000;
  const [lo, hi] = TRADER.gap;
  t.nextAt = t.until + (lo + rand() * (hi - lo)) * 60_000;
  t.name = Math.floor(rand() * TRADER_NAMES.length);
  t.offers = makeOffers(state, now, rand);
  return 'arrived';
}

export type TradeResult = { kind: OfferKind; scrap?: Decimal; crystals?: number; blueprint?: string; loot?: string; recalled?: number };

/** Takes one of the trader's deals, if it's still on the table and affordable. */
export function trade(state: GameState, index: number, now: number, rand = Math.random): TradeResult | null {
  const o = state.trader.offers[index];
  if (!o || o.bought || !traderHere(state, now)) return null;
  const price = D(o.price);
  if (o.pay === 'scrap' ? state.scrap.lt(price) : state.crystals < price.toNumber()) return null;
  const result: TradeResult = { kind: o.kind };
  if (o.kind === 'blueprint') {
    const missing = MODULES.filter((m) => m.blueprint && !state.blueprints.has(m.id));
    if (!missing.length) return null;
    result.blueprint = missing[Math.floor(rand() * missing.length)].id;
    state.blueprints.add(result.blueprint);
  } else if (o.kind === 'loot') {
    const left = LOOT.filter((l) => !state.loot.has(l.id));
    if (!left.length) return null;
    result.loot = left[Math.floor(rand() * left.length)].id;
    state.loot.add(result.loot);
  } else if (o.kind === 'recall') {
    const away = state.trips.filter((t) => t.endsAt > now);
    if (!away.length) return null;
    for (const t of away) t.endsAt = now;
    result.recalled = away.length;
  }
  if (o.pay === 'scrap') state.scrap = state.scrap.sub(price);
  else state.crystals -= price.toNumber();
  if (o.kind === 'crystals') {
    result.crystals = Number(o.amount);
    addCrystals(state, result.crystals);
  } else if (o.kind === 'scrap') {
    result.scrap = D(o.amount);
    earn(state, result.scrap);
  }
  o.bought = true;
  state.stats.trades = (state.stats.trades ?? 0) + 1;
  return result;
}

// ---------- Challenge runs ----------

export function challengesOpen(state: GameState): boolean {
  return state.cores >= CHALLENGE_CORES || state.challengesDone.size > 0 || state.challenge !== null;
}

/**
 * Starts a challenge run: banks any Star Cores waiting (like relocating), then starts a fresh
 * run under the challenge's rule. Returns the cores banked, or -1 if it can't start.
 */
export function startChallenge(state: GameState, id: string, now: number): number {
  const def = CHALLENGES.find((c) => c.id === id);
  if (!def || !challengesOpen(state) || state.challengesDone.has(id) || state.challenge) return -1;
  const gained = claimableCores(state);
  if (gained > 0) {
    state.cores += gained;
    state.stats.relocations++;
  }
  resetRun(state, now);
  state.challenge = id;
  return gained;
}

/** Gives up the challenge: its rule lifts and the run carries on as normal. */
export function abandonChallenge(state: GameState): boolean {
  if (!state.challenge) return false;
  state.challenge = null;
  return true;
}

/** Progress toward the running challenge's goal, 0 to 1. */
export function challengeProgress(state: GameState): number {
  const def = CHALLENGES.find((c) => c.id === state.challenge);
  return def ? Math.min(1, state.lifetime.div(def.goal).toNumber()) : 0;
}

/** Completes the running challenge once its goal is reached. Returns the one beaten. */
export function checkChallenge(state: GameState): ChallengeDef | null {
  const def = CHALLENGES.find((c) => c.id === state.challenge);
  if (!def || state.lifetime.lt(def.goal)) return null;
  state.challengesDone.add(def.id);
  state.challenge = null;
  return def;
}
