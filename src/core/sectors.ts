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
