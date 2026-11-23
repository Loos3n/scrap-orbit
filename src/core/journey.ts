import { CAPTAIN_PAINT, type PetId } from './content';
import { baseIncome, claimableCores } from './economy';
import { dayKey } from './rewards';
import { D, type Decimal } from './num';
import type { GameState } from './state';

/*
 * Captain ranks: a new captain's path through the first days. Each rank asks for three small
 * things, in the order the game opens up, and claiming it pays out and promotes the captain.
 * A task, once met, stays met (the save keeps its id), so a mission board that resets or a
 * crew member who comes home can't take a tick away. Each rank also adds a little income for good.
 */

export interface JourneyTask {
  id: string;
  text: string;
  /** Where the task is done, so the card can send the captain there. */
  go?: JourneyGo;
  target: number;
  have: (s: GameState) => number;
  /** Counts days played, so the card can say when the next day starts. */
  day?: boolean;
}

export type JourneyGo = 'build' | 'upgrades' | 'crew' | 'trips' | 'lab' | 'cores' | 'station' | 'pets' | 'missions' | 'fishing' | 'station-tap' | 'boost';

export interface JourneyReward {
  crystals: number;
  /** Minutes of income (or taps, whichever is more), paid as scrap. */
  scrapMin?: number;
  /** A pet who comes aboard (or the crystals it would cost, if every pet is home already). */
  pet?: PetId;
  /** The rank's paint, only earned here. */
  paint?: boolean;
}

export interface RankDef {
  /** The title this rank gives the captain. */
  title: string;
  tasks: [JourneyTask, JourneyTask, JourneyTask];
  reward: JourneyReward;
  /** Something that opens with this rank, if any, said on the promotion card. */
  opens?: string;
}

/** Each rank claimed adds this much income, for good. */
export const RANK_INCOME = 0.02;

/** The paint the last rank gives (content.ts lists it with the event paints, out of the shop). */
export const CAPTAIN_PAINT_ID = CAPTAIN_PAINT.id;

const crewHired = (s: GameState) => Object.values(s.crew).filter((l) => l > 0).length;
const crewLevels = (s: GameState) => Object.values(s.crew).reduce((a, l) => a + l, 0);
const researching = (s: GameState) => (s.research.done.size > 0 || s.research.active ? 1 : 0);
const missionsClaimed = (s: GameState) => s.missions.daily.filter((m) => m.claimed).length;
const owned = (id: keyof GameState['owned']) => (s: GameState) => s.owned[id];
const rate = (s: GameState) => baseIncome(s).toNumber();

export const RANKS: readonly RankDef[] = [
  {
    title: 'Deckhand',
    tasks: [
      { id: 'drones10', text: 'Build 10 Salvage Drones', go: 'build', target: 10, have: owned('drone') },
      { id: 'crates2', text: 'Grab 2 salvage crates', go: 'station-tap', target: 2, have: (s) => s.stats.crates },
      { id: 'claw3', text: 'Level the Salvage Claw to 3', go: 'build', target: 3, have: (s) => s.claw },
    ],
    reward: { crystals: 10, scrapMin: 3 },
  },
  {
    title: 'Salvager',
    tasks: [
      { id: 'hauler1', text: 'Build your first Hauler', go: 'build', target: 1, have: owned('hauler') },
      { id: 'crew1', text: 'Recruit a crew member', go: 'crew', target: 1, have: crewHired },
      { id: 'mission1', text: 'Claim a mission', go: 'missions', target: 1, have: missionsClaimed },
    ],
    reward: { crystals: 15, scrapMin: 5 },
    opens: 'Space fishing at the station tank',
  },
  {
    title: 'Tinkerer',
    tasks: [
      { id: 'upgrades5', text: 'Install 5 upgrades', go: 'upgrades', target: 5, have: (s) => s.stats.upgradesBought },
      { id: 'lab1', text: 'Start a project in the Lab', go: 'lab', target: 1, have: researching },
      { id: 'fish1', text: 'Land a catch while fishing', go: 'fishing', target: 1, have: (s) => Object.values(s.fishing.caught).reduce((a, n) => a + n, 0) },
    ],
    reward: { crystals: 15, scrapMin: 8 },
  },
  {
    title: 'Mechanic',
    tasks: [
      { id: 'smelter1', text: 'Build your first Smelter', go: 'build', target: 1, have: owned('smelter') },
      { id: 'drones25', text: 'Build 25 Salvage Drones', go: 'build', target: 25, have: owned('drone') },
      { id: 'boost3', text: 'Fire Overdrive 3 times', go: 'boost', target: 3, have: (s) => s.stats.boosts },
    ],
    reward: { crystals: 20, pet: 'cat' },
    opens: 'A pet of your own',
  },
  {
    title: 'Wreck Buster',
    tasks: [
      { id: 'boss1', text: 'Break a boss wreck', go: 'station-tap', target: 1, have: (s) => s.stats.bosses },
      { id: 'rate1k', text: 'Earn 1,000 scrap per second', go: 'build', target: 1000, have: rate },
      { id: 'train3', text: 'Reach 3 crew levels in total', go: 'crew', target: 3, have: crewLevels },
    ],
    reward: { crystals: 25, scrapMin: 10 },
  },
  {
    title: 'Quartermaster',
    tasks: [
      { id: 'fab1', text: 'Build your first Fabricator', go: 'build', target: 1, have: owned('fabricator') },
      { id: 'room1', text: 'Build a room on the station', go: 'station', target: 1, have: (s) => s.modules.filter(Boolean).length },
      { id: 'trip1', text: 'Send crew on a trip', go: 'trips', target: 1, have: (s) => (s.trips.length > 0 ? 1 : 0) },
    ],
    reward: { crystals: 30, scrapMin: 15 },
  },
  {
    title: 'Navigator',
    tasks: [
      { id: 'core1', text: 'Have a Star Core ready to claim', go: 'cores', target: 1, have: (s) => (s.cores > 0 || s.stats.relocations > 0 ? 1 : Math.floor(claimableCores(s))) },
      { id: 'research2', text: 'Finish 2 Lab projects', go: 'lab', target: 2, have: (s) => s.research.done.size },
      { id: 'crates15', text: 'Grab 15 salvage crates', go: 'station-tap', target: 15, have: (s) => s.stats.crates },
    ],
    reward: { crystals: 35, scrapMin: 20 },
  },
  {
    title: 'Pathfinder',
    tasks: [
      { id: 'relocate1', text: 'Relocate the station', go: 'cores', target: 1, have: (s) => s.stats.relocations },
      { id: 'day2', text: 'Come back on another day', day: true, target: 2, have: (s) => s.journey.days },
      { id: 'streak', text: 'Claim a daily reward', target: 1, have: (s) => (s.login.claimed ? 1 : 0) },
    ],
    reward: { crystals: 40, scrapMin: 30 },
  },
  {
    title: 'Captain',
    tasks: [
      { id: 'relocate3', text: 'Relocate 3 times', go: 'cores', target: 3, have: (s) => s.stats.relocations },
      { id: 'day3', text: 'Play on 3 different days', day: true, target: 3, have: (s) => s.journey.days },
      { id: 'bosses3', text: 'Break 3 boss wrecks', go: 'station-tap', target: 3, have: (s) => s.stats.bosses },
    ],
    reward: { crystals: 60, paint: true },
    opens: "The Captain's Gold paint",
  },
];

/** True once every rank is claimed. */
export const journeyDone = (s: GameState) => s.journey.rank >= RANKS.length;

/** The rank being worked on, or null once all are claimed. */
export const currentRank = (s: GameState): RankDef | null => RANKS[s.journey.rank] ?? null;

/** The captain's title now: the last rank claimed. */
export function rankTitle(s: GameState): string {
  return s.journey.rank > 0 ? RANKS[Math.min(s.journey.rank, RANKS.length) - 1].title : 'Cadet';
}

/** Income multiplier from ranks claimed. */
export const rankMult = (s: GameState) => 1 + Math.min(s.journey.rank, RANKS.length) * RANK_INCOME;

/** How far along one task is: [have, target], with a met task counting as full. */
export function taskProgress(s: GameState, t: JourneyTask): [number, number] {
  if (s.journey.met.has(t.id)) return [t.target, t.target];
  return [Math.max(0, Math.min(t.target, t.have(s))), t.target];
}

export const taskMet = (s: GameState, t: JourneyTask) => s.journey.met.has(t.id);

/** Whether the current rank can be claimed. */
export function rankReady(s: GameState): boolean {
  const r = currentRank(s);
  return !!r && r.tasks.every((t) => taskMet(s, t));
}

/**
 * Counts a new day and ticks off tasks on the current rank that are now met. Returns the
 * tasks that just got their tick, so the game can cheer each one. Waits for the tutorial.
 */
export function checkJourney(s: GameState, now: number): JourneyTask[] {
  const j = s.journey;
  const today = dayKey(now);
  if (j.lastDay !== today) {
    j.lastDay = today;
    j.days += 1;
  }
  const r = currentRank(s);
  if (!r || s.tutorial >= 0) return [];
  const fresh: JourneyTask[] = [];
  for (const t of r.tasks) {
    if (!j.met.has(t.id) && t.have(s) >= t.target) {
      j.met.add(t.id);
      fresh.push(t);
    }
  }
  return fresh;
}

export interface RankClaim {
  rank: RankDef;
  crystals: number;
  scrap: Decimal;
  pet: PetId | null;
  paint: boolean;
}

/**
 * Claims the current rank: pays its reward and moves to the next. `scrapFor` turns minutes into
 * scrap and `pay` banks it (both from meta, passed in to keep this file small).
 */
export function claimRank(
  s: GameState,
  hooks: { scrapFor: (min: number) => Decimal; earn: (n: Decimal) => void; crystals: (n: number) => void; adopt: (id: PetId) => boolean },
): RankClaim | null {
  if (!rankReady(s)) return null;
  const rank = currentRank(s)!;
  const r = rank.reward;
  let crystals = r.crystals;
  let pet: PetId | null = null;
  if (r.pet) {
    if (hooks.adopt(r.pet)) pet = r.pet;
    else crystals += 15;
  }
  const scrap = r.scrapMin ? hooks.scrapFor(r.scrapMin) : D(0);
  if (r.scrapMin) hooks.earn(scrap);
  hooks.crystals(crystals);
  let paint = false;
  if (r.paint && !s.decor.owned.has(CAPTAIN_PAINT_ID)) {
    s.decor.owned.add(CAPTAIN_PAINT_ID);
    paint = true;
  }
  s.journey.rank += 1;
  return { rank, crystals, scrap, pet, paint };
}

/** Space fishing opens with the second rank, so the first minutes stay simple. */
export const FISHING_RANK = 2;

/** Whether a system held back for newcomers is open: legacy saves and finished journeys have everything. */
export function rankOpen(s: GameState, rank: number): boolean {
  return s.journey.legacy || s.journey.rank >= rank || s.stats.relocations > 0 || s.galaxy.shifts > 0;
}
