import {
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
  RESEARCH,
  THEMES,
  WEEKLY_REWARD,
  WEEKLY_SCALE,
  crewCost,
  rushCost,
  type CrewId,
  type EventKind,
  type MissionKind,
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
  if (!state.event && now >= state.nextEventAt) {
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
