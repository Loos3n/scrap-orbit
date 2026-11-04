import { sectorFor, type SectorDef } from './content';
import type { GameState } from './state';

/*
 * The deeper sectors each bend one rule (the twist) and offer one machine that can only be built
 * there (the rig). Both last until the station relocates. These only read the save.
 */

export const currentSector = (state: GameState): SectorDef => sectorFor(state.stats.relocations);

/** What the twist and rig add, as fractions like the other bonuses (0.5 is +50%). */
export function sectorBonuses(state: GameState): { income: number; tap: number; offline: number; boss: number } {
  const b = { income: 0, tap: 0, offline: 0, boss: 0 };
  const look = currentSector(state).look;
  const rig = state.rig;
  if (look === 'ice') {
    b.tap += 1;
    b.income -= 0.2;
    if (rig) {
      b.income += 0.5;
      b.tap += 1;
    }
  } else if (look === 'city') {
    if (rig) {
      b.income += 0.5;
      b.boss += 1;
    }
  } else if (look === 'hole') {
    b.offline += 1;
    if (rig) b.income += 0.75;
  }
  return b;
}

/** This sector's twist rule, if it is one of the plain-looking ones. */
export const sectorRule = (state: GameState) => currentSector(state).rule ?? null;

/** Output multiplier the twist gives one kind of machine. */
export function sectorGenMult(state: GameState, gen: string): number {
  const rule = sectorRule(state);
  if (rule === 'forge') return gen === 'smelter' || gen === 'fabricator' ? 3 : gen === 'drone' ? 0.5 : 1;
  if (rule === 'quiet') return 1.5;
  return 1;
}

/** Machine price multiplier from the twist. */
export const sectorCostMult = (state: GameState) => (sectorRule(state) === 'cheap' ? 0.6 : 1);

/** How much more crew bonuses count here. */
export const sectorCrewMult = (state: GameState) => (sectorRule(state) === 'crew' ? 2 : 1);

/** Crate rate and crate value multipliers. */
export const sectorCrateMult = (state: GameState) => (sectorRule(state) === 'crates' ? 2 : 1);

/** False where wrecks, storms and traders never come. */
export const sectorHappenings = (state: GameState) => sectorRule(state) !== 'quiet';

/** How boss wrecks differ here: health and payout multipliers, and the gap between them. */
export function sectorBossRules(state: GameState): { hp: number; reward: number; gap: number } {
  return currentSector(state).look === 'city' ? { hp: 2, reward: 3, gap: 0.5 } : { hp: 1, reward: 1, gap: 1 };
}

/** How much longer Overdrive and golden rushes last here. */
export function timeStretch(state: GameState): number {
  return currentSector(state).look === 'hole' ? 2 : 1;
}

/** The rig costs this many seconds of income, and never less than the floor. */
export const RIG = { incomeSec: 600, minCost: 25_000 };
