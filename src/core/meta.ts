import {
  BOSS,
  BOSS_NAMES,
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
  STORY,
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
import { baseIncome, earn, income, researchProduct, tapValue } from './economy';
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
  // Events hold off while a boss wreck is on screen, so the two never share the banner.
  if (!state.event && !state.boss && now >= state.nextEventAt) {
    const roll = rand();
    const kind: EventKind = roll < 0.45 ? 'meteors' : roll < 0.75 ? 'flare' : 'convoy';
    const endsAt = now + EVENTS[kind].seconds * 1000;
    const gap = (EVENT_GAP[0] + rand() * (EVENT_GAP[1] - EVENT_GAP[0])) / researchProduct(state, 'eventRate');
    state.event = { kind, endsAt };
    state.nextEventAt = endsAt + gap * 1000;
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
  const a = income(state, now).mul(minutes * 60);
  const b = tapValue(state, now).mul(minutes * 20);
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
  defeated?: { scrap: Decimal; crystals: number };
}

function bossHp(state: GameState, now: number): Decimal {
  const tough = BOSS.growth ** state.stats.bosses;
  const hp = tapValue(state, now).mul(BOSS.hpTaps).add(baseIncome(state).mul(BOSS.hpIncomeSec));
  return Decimal.max(hp.mul(tough), D(60));
}

/** The scrap a wreck pays out: minutes of the station's scrap per second, set when it arrives. */
export function bossReward(state: GameState, now: number): Decimal {
  const a = baseIncome(state).mul(BOSS.rewardIncomeSec);
  const t = tapValue(state, now).mul(BOSS.rewardTaps);
  return a.gt(t) ? a : t;
}

/** Damage multiplier on boss wrecks (the Goo Blob likes to chew). */
export function bossDamageMult(state: GameState): number {
  return petActive(state, 'blob') ? 1.5 : 1;
}

/**
 * Brings in, wears down and resolves boss wrecks. Machines chip at the wreck each second;
 * taps land through hitBoss. Wrecks wait until the tutorial is done and no event is running.
 */
export function updateBoss(state: GameState, now: number, dt: number, rand = Math.random): BossUpdate {
  const b = state.boss;
  if (!b) {
    if (state.tutorial >= 0 || eventActive(state, now)) return {};
    if (state.nextBossAt === 0) state.nextBossAt = now + Math.max(0, BOSS.firstSec - state.stats.playSec) * 1000;
    if (now < state.nextBossAt) return {};
    const hp = bossHp(state, now);
    state.boss = { name: state.stats.bosses % BOSS_NAMES.length, hp: hp.toString(), max: hp.toString(), endsAt: 0, reward: bossReward(state, now).toString() };
    return { arrived: true };
  }
  const chip = baseIncome(state).mul(BOSS.machineShare * dt * bossDamageMult(state));
  const defeated = damageBoss(state, chip, now, rand);
  return defeated ? { defeated } : {};
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
  return { scrap, crystals: BOSS.crystals };
}

/** A tap on the scene while a wreck is in range: the claw's tap value lands on it too. */
export function hitBoss(state: GameState, tap: Decimal, now: number): BossUpdate['defeated'] {
  return damageBoss(state, tap.mul(bossDamageMult(state)), now);
}

/** Health left, 0 to 1. */
export function bossHealth(state: GameState): number {
  const b = state.boss;
  if (!b) return 0;
  return Math.max(0, Math.min(1, D(b.hp).div(b.max).toNumber()));
}

// ---------- Story log ----------

const STORY_UNLOCKS: Record<string, (s: GameState) => boolean> = {
  arrival: (s) => s.taps >= 1,
  stamp: (s) => s.owned.drone >= 10,
  cargo: (s) => s.owned.hauler >= 1,
  blackbox: (s) => s.stats.bosses >= 1,
  inside: (s) => s.owned.smelter >= 1,
  fleet: (s) => s.owned.fabricator >= 1,
  maps: (s) => s.stats.crates >= 10,
  three: (s) => s.stats.bosses >= 3,
  pilotless: (s) => s.owned.dock >= 1,
  moving: (s) => s.stats.relocations >= 1,
  signal: (s) => s.owned.gate >= 1,
  backwards: (s) => s.stats.bosses >= 10,
};

/** Unlocks log entries strictly in order, so the story always reads front to back. */
export function updateStory(state: GameState): string[] {
  const added: string[] = [];
  for (let next = STORY[state.story.length]; next && STORY_UNLOCKS[next.id](state); next = STORY[state.story.length]) {
    state.story.push(next.id);
    added.push(next.id);
  }
  return added;
}

export function storyUnread(state: GameState): number {
  return state.story.length - state.storySeen;
}
