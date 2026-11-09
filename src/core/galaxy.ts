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
  /** Constellations: nodes that only appear on the map from this galaxy on (2 = after the first shift). */
  galaxy?: number;
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
  // Constellations: two new nodes come into view in each new galaxy, up to the seventh.
  { id: 'tide', name: 'Solar Tide', desc: 'Everything produces 2x.', cost: 6, effect: { kind: 'allMult', mult: 2 }, color: 0xffb547, galaxy: 2 },
  { id: 'lodestone', name: 'Lodestone', desc: 'Machines cost 20% less.', cost: 6, effect: { kind: 'costMult', mult: 0.8 }, color: 0x9aa6ff, galaxy: 2 },
  { id: 'comet', name: 'Comet Tail', desc: 'Salvage crates drift by 1.5x as often.', cost: 8, effect: { kind: 'crateRate', mult: 1.5 }, color: 0x9fe6ff, galaxy: 3 },
  { id: 'chorus', name: 'Crew Chorus', desc: 'Crew bonuses 50% stronger.', cost: 8, effect: { kind: 'crewMult', mult: 1.5 }, color: 0x4fe3c1, galaxy: 3 },
  { id: 'deepcore', name: 'Deep Core', desc: 'Relocating gives 50% more Star Cores.', cost: 10, effect: { kind: 'coreGain', mult: 1.5 }, color: 0xff8a4c, galaxy: 4 },
  { id: 'dawn', name: 'Long Dawn', desc: 'Overdrive lasts 30 seconds longer.', cost: 10, effect: { kind: 'boostSec', sec: 30 }, color: 0xff6b9a, galaxy: 4 },
  { id: 'nova', name: 'Supernova', desc: 'Everything produces 3x.', cost: 14, effect: { kind: 'allMult', mult: 3 }, color: 0xffe9a8, galaxy: 5 },
  { id: 'beacon', name: 'Beacon Tower', desc: 'Events happen 1.5x as often.', cost: 12, effect: { kind: 'eventRate', mult: 1.5 }, color: 0xc58cff, galaxy: 5 },
  { id: 'lens', name: 'Gravity Lens', desc: 'Each Star Core gives +5% more income.', cost: 18, effect: { kind: 'corePerCore', add: 0.05 }, color: 0x5ce1ff, galaxy: 6 },
  { id: 'harvest', name: 'Star Harvest', desc: 'Offline earnings 2x.', cost: 16, effect: { kind: 'offlineMult', mult: 2 }, color: 0x9dff6b, galaxy: 6 },
  { id: 'crown', name: 'Crown of Stars', desc: 'Everything produces 5x.', cost: 25, effect: { kind: 'allMult', mult: 5 }, color: 0xffd166, galaxy: 7 },
  { id: 'nebclaw', name: 'Nebula Claw', desc: 'Taps are worth 10x.', cost: 20, effect: { kind: 'tapMult', mult: 10 }, color: 0xff9a4c, galaxy: 7 },
];

/** Whether a Star Map node is on the map yet (constellations wait for their galaxy). */
export const starNodeShown = (state: GameState, node: StarNode) => !node.galaxy || state.galaxy.shifts + 1 >= node.galaxy;

/*
 * Galaxy traits: from the second galaxy on, each galaxy bends one rule in the player's favour for
 * as long as the station is there, so every shift lands somewhere that plays a little differently.
 * They cycle after the seventh.
 */
export type GalaxyTraitId = 'shallows' | 'ember' | 'night' | 'haven' | 'treasure' | 'twin';

export interface GalaxyTrait {
  id: GalaxyTraitId;
  name: string;
  text: string;
  color: string;
}

export const GALAXY_TRAITS: readonly GalaxyTrait[] = [
  { id: 'shallows', name: 'The Shallows', text: 'Scrap lies close to the surface here: machines cost 25% less.', color: '#5ce1ff' },
  { id: 'ember', name: 'Ember Cluster', text: 'Hot young stars: taps are worth 3x, and boss wrecks take double damage.', color: '#ff8a4c' },
  { id: 'night', name: 'The Long Night', text: 'Days crawl by: time away earns 3x, and Overdrive and golden rushes last 1.5x as long.', color: '#8f7bff' },
  { id: 'haven', name: 'Crew Haven', text: 'A galaxy of shore leave: crew bonuses count double.', color: '#4fe3c1' },
  { id: 'treasure', name: 'Treasure Drift', text: 'Old cargo everywhere: salvage crates drift by twice as often and hold twice as much.', color: '#ffd166' },
  { id: 'twin', name: 'Twin Suns', text: 'Two suns to harvest: +100% income.', color: '#ffe9a8' },
];

/** This galaxy's trait, or null in the first galaxy. */
export function galaxyTrait(state: GameState): GalaxyTrait | null {
  const n = state.galaxy.shifts;
  return n > 0 ? GALAXY_TRAITS[(n - 1) % GALAXY_TRAITS.length] : null;
}

export const traitOn = (state: GameState, id: GalaxyTraitId) => galaxyTrait(state)?.id === id;

export function starNodeOwned(state: GameState, id: string): boolean {
  return state.galaxy.map.has(id);
}

/** Effects of every Star Map node bought. */
export function starEffects(state: GameState): StarEffect[] {
  // (A constellation node is only bought once it is shown, so owning it is enough here.)
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
