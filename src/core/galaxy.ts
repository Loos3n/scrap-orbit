import type { ResearchEffect } from './content';
import type { GameState } from './state';

/*
 * Galaxy Shift, the second reset layer. Once a run has built a Dyson Collector the player can
 * shift to a new galaxy: Star Cores go too, in exchange for Galaxy Stars. Every star ever earned
 * adds income, and stars are spent on the Star Map for permanent upgrades.
 * Like expansion.ts this only reads the save; actions live in meta.ts.
 */

export const GALAXY = {
  /** Built in the current run to unlock the shift. */
  unlockGen: 'dyson' as const,
  /**
   * Stars for N cores held: floor(sqrt(N / (coresPerStar * starGrowth^shifts)). The first shift
   * turns 900 cores into 6 stars; every galaxy after asks for more, so each stays a journey.
   */
  coresPerStar: 25,
  starGrowth: 4,
  /** Income bonus for every star ever earned, spent or not. */
  incomePerStar: 0.25,
  /** The Star Forge, a node bought again and again: each level doubles everything, at a price that doubles. */
  forgeMult: 2,
  forgeCost: 4,
};

/** Stars for the next Star Forge level. */
export function forgeCost(level: number): number {
  return GALAXY.forgeCost * 2 ** level;
}

/** What a Star Map node does: a research-style effect, or one of the shift's own. */
export type StarEffect =
  | ResearchEffect
  | { kind: 'startKit' }
  | { kind: 'coreGain'; mult: number }
  | { kind: 'keepPerks' };

export interface StarNode {
  id: string;
  name: string;
  desc: string;
  cost: number;
  effect: StarEffect;
  color: number;
}

export const STAR_NODES: readonly StarNode[] = [
  { id: 'kit', name: 'Starter Kit', desc: 'Start every run with 25 Drones, 10 Haulers and 5 Smelters.', cost: 1, effect: { kind: 'startKit' }, color: 0x4fe3c1 },
  { id: 'resonance', name: 'Core Resonance', desc: 'Each Star Core gives +5% more income.', cost: 2, effect: { kind: 'corePerCore', add: 0.05 }, color: 0xffd166 },
  { id: 'rush', name: 'Core Rush', desc: 'Relocating gives 50% more Star Cores.', cost: 2, effect: { kind: 'coreGain', mult: 1.5 }, color: 0xff8a4c },
  { id: 'memory', name: 'Star Memory', desc: 'Core perks you unlocked stay unlocked after a shift.', cost: 3, effect: { kind: 'keepPerks' }, color: 0x9fe0ff },
  { id: 'claws', name: 'Comet Claws', desc: 'Taps are worth 5x.', cost: 3, effect: { kind: 'tapMult', mult: 5 }, color: 0x9aa6ff },
  { id: 'dreams', name: 'Night Dreams', desc: 'Offline earnings 2x.', cost: 3, effect: { kind: 'offlineMult', mult: 2 }, color: 0xc58cff },
  { id: 'bounty', name: 'Star Bounty', desc: 'Missions give 2x crystals.', cost: 4, effect: { kind: 'missionMult', mult: 2 }, color: 0x9dff6b },
  { id: 'hyper', name: 'Hyperdrive', desc: 'Everything produces 3x.', cost: 5, effect: { kind: 'allMult', mult: 3 }, color: 0xff5d6c },
];

export function starNodeOwned(state: GameState, id: string): boolean {
  return state.galaxy.map.has(id);
}

/** Effects of every Star Map node bought. */
export function starEffects(state: GameState): StarEffect[] {
  return STAR_NODES.filter((n) => state.galaxy.map.has(n.id)).map((n) => n.effect);
}

export function starsForCores(cores: number, shifts = 0): number {
  return Math.floor(Math.sqrt(Math.max(0, cores) / (GALAXY.coresPerStar * GALAXY.starGrowth ** shifts)) + 1e-9);
}

/** Income multiplier from every star ever earned, and the Star Forge. */
export function starIncomeMult(state: GameState): number {
  return (1 + state.galaxy.earned * GALAXY.incomePerStar) * GALAXY.forgeMult ** state.galaxy.forge;
}

/** Relocation core multiplier from Core Rush. */
export function coreGainMult(state: GameState): number {
  let m = 1;
  for (const e of starEffects(state)) if (e.kind === 'coreGain') m *= e.mult;
  return m;
}
