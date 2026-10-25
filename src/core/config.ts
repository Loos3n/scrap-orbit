export type GeneratorId =
  | 'drone'
  | 'hauler'
  | 'smelter'
  | 'fabricator'
  | 'dock'
  | 'laser'
  | 'gravity'
  | 'nanite'
  | 'gate'
  | 'dyson';

export interface GeneratorDef {
  id: GeneratorId;
  name: string;
  blurb: string;
  baseCost: number;
  /** Scrap per second for one unit, before multipliers. */
  baseOutput: number;
  /** Price multiplier per unit owned. */
  growth: number;
  color: number;
}

export const GENERATORS: readonly GeneratorDef[] = [
  { id: 'drone', name: 'Salvage Drone', blurb: 'Nibbles bolts off passing wrecks.', baseCost: 15, baseOutput: 0.5, growth: 1.07, color: 0x4fe3c1 },
  { id: 'hauler', name: 'Hauler', blurb: 'Tows whole hull plates back home.', baseCost: 220, baseOutput: 4, growth: 1.09, color: 0x7aa7ff },
  { id: 'smelter', name: 'Smelter', blurb: 'Melts junk into tidy ingots.', baseCost: 3_500, baseOutput: 28, growth: 1.11, color: 0xff8a4c },
  { id: 'fabricator', name: 'Fabricator', blurb: 'Prints parts nobody asked for.', baseCost: 60_000, baseOutput: 210, growth: 1.12, color: 0xc58cff },
  { id: 'dock', name: 'Orbital Dock', blurb: 'Whole derelicts, parked and stripped.', baseCost: 1_100_000, baseOutput: 1_600, growth: 1.13, color: 0xffd166 },
  { id: 'laser', name: 'Mining Laser', blurb: 'Slices asteroids into bite-size chunks.', baseCost: 2e7, baseOutput: 12_000, growth: 1.13, color: 0xff5d6c },
  { id: 'gravity', name: 'Gravity Well', blurb: 'Pulls whole debris fields into reach.', baseCost: 4e8, baseOutput: 90_000, growth: 1.14, color: 0x5ce1ff },
  { id: 'nanite', name: 'Nanite Hive', blurb: 'Billions of tiny hands, all very busy.', baseCost: 9e9, baseOutput: 700_000, growth: 1.14, color: 0x9dff6b },
  { id: 'gate', name: 'Warp Gate', blurb: 'Imports scrap from other star systems.', baseCost: 2.2e11, baseOutput: 5.5e6, growth: 1.15, color: 0x8f7bff },
  { id: 'dyson', name: 'Dyson Collector', blurb: 'Harvests a whole star to feed the smelters.', baseCost: 6e12, baseOutput: 4.5e7, growth: 1.15, color: 0xffe9a8 },
];

/** Owning this many of a generator multiplies its output by MILESTONE_MULT (cumulative). */
export const MILESTONES = [10, 25, 50, 100, 150, 200, 250, 300, 400, 500] as const;
export const MILESTONE_MULT = 2;

export type UpgradeEffect =
  | { kind: 'tapMult'; mult: number }
  | { kind: 'tapIncomeShare'; share: number }
  | { kind: 'genMult'; gen: GeneratorId; mult: number }
  | { kind: 'allMult'; mult: number };

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  /** Shown once the player owns at least `count` of `gen`. */
  requires: { gen: GeneratorId; count: number };
  effects: UpgradeEffect[];
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'claw1', name: 'Reinforced Claw', desc: 'Taps are worth 2x.', cost: 75, requires: { gen: 'drone', count: 1 }, effects: [{ kind: 'tapMult', mult: 2 }] },
  { id: 'drone1', name: 'Swarm Protocol', desc: 'Drones produce 2x.', cost: 900, requires: { gen: 'drone', count: 10 }, effects: [{ kind: 'genMult', gen: 'drone', mult: 2 }] },
  { id: 'claw2', name: 'Magnetic Claw', desc: 'Each tap also gives 3% of your income per second.', cost: 4_000, requires: { gen: 'hauler', count: 5 }, effects: [{ kind: 'tapIncomeShare', share: 0.03 }] },
  { id: 'hauler1', name: 'Cargo Expanders', desc: 'Haulers produce 2x.', cost: 15_000, requires: { gen: 'hauler', count: 10 }, effects: [{ kind: 'genMult', gen: 'hauler', mult: 2 }] },
  { id: 'drone2', name: 'Drone Uplink', desc: 'Drones produce 3x.', cost: 60_000, requires: { gen: 'drone', count: 50 }, effects: [{ kind: 'genMult', gen: 'drone', mult: 3 }] },
  { id: 'smelter1', name: 'Plasma Furnaces', desc: 'Smelters produce 2x.', cost: 200_000, requires: { gen: 'smelter', count: 10 }, effects: [{ kind: 'genMult', gen: 'smelter', mult: 2 }] },
  { id: 'hauler2', name: 'Warp Tethers', desc: 'Haulers produce 3x.', cost: 900_000, requires: { gen: 'hauler', count: 50 }, effects: [{ kind: 'genMult', gen: 'hauler', mult: 3 }] },
  { id: 'fab1', name: 'Nano Assemblers', desc: 'Fabricators produce 2x.', cost: 3_500_000, requires: { gen: 'fabricator', count: 10 }, effects: [{ kind: 'genMult', gen: 'fabricator', mult: 2 }] },
  { id: 'claw3', name: 'Quantum Claw', desc: 'Taps 3x, and 5% more of your income per tap.', cost: 8_000_000, requires: { gen: 'smelter', count: 25 }, effects: [{ kind: 'tapMult', mult: 3 }, { kind: 'tapIncomeShare', share: 0.05 }] },
  { id: 'smelter2', name: 'Star Forges', desc: 'Smelters produce 3x.', cost: 12_000_000, requires: { gen: 'smelter', count: 50 }, effects: [{ kind: 'genMult', gen: 'smelter', mult: 3 }] },
  { id: 'dock1', name: 'Tractor Beams', desc: 'Docks produce 2x.', cost: 40_000_000, requires: { gen: 'dock', count: 10 }, effects: [{ kind: 'genMult', gen: 'dock', mult: 2 }] },
  { id: 'fab2', name: 'Self-Replicators', desc: 'Fabricators produce 3x.', cost: 150_000_000, requires: { gen: 'fabricator', count: 50 }, effects: [{ kind: 'genMult', gen: 'fabricator', mult: 3 }] },
  { id: 'all1', name: 'Station Overclock', desc: 'Everything produces 1.5x.', cost: 200_000_000, requires: { gen: 'dock', count: 25 }, effects: [{ kind: 'allMult', mult: 1.5 }] },
  { id: 'dock2', name: 'Gravity Anchors', desc: 'Docks produce 3x.', cost: 2_500_000_000, requires: { gen: 'dock', count: 50 }, effects: [{ kind: 'genMult', gen: 'dock', mult: 3 }] },
  { id: 'laser1', name: 'Focusing Lenses', desc: 'Mining Lasers produce 2x.', cost: 4e8, requires: { gen: 'laser', count: 10 }, effects: [{ kind: 'genMult', gen: 'laser', mult: 2 }] },
  { id: 'claw4', name: 'Singularity Claw', desc: 'Taps 5x.', cost: 2e9, requires: { gen: 'laser', count: 25 }, effects: [{ kind: 'tapMult', mult: 5 }] },
  { id: 'gravity1', name: 'Event Horizon Nets', desc: 'Gravity Wells produce 2x.', cost: 8e9, requires: { gen: 'gravity', count: 10 }, effects: [{ kind: 'genMult', gen: 'gravity', mult: 2 }] },
  { id: 'laser2', name: 'Gamma Emitters', desc: 'Mining Lasers produce 3x.', cost: 6e10, requires: { gen: 'laser', count: 50 }, effects: [{ kind: 'genMult', gen: 'laser', mult: 3 }] },
  { id: 'nanite1', name: 'Hive Mind', desc: 'Nanite Hives produce 2x.', cost: 2e11, requires: { gen: 'nanite', count: 10 }, effects: [{ kind: 'genMult', gen: 'nanite', mult: 2 }] },
  { id: 'all2', name: 'Quantum Logistics', desc: 'Everything produces 2x.', cost: 8e11, requires: { gen: 'gravity', count: 25 }, effects: [{ kind: 'allMult', mult: 2 }] },
  { id: 'gate1', name: 'Stable Wormholes', desc: 'Warp Gates produce 2x.', cost: 5e12, requires: { gen: 'gate', count: 10 }, effects: [{ kind: 'genMult', gen: 'gate', mult: 2 }] },
  { id: 'claw5', name: 'Event Claw', desc: 'Each tap also gives 10% of your income per second.', cost: 2e13, requires: { gen: 'nanite', count: 25 }, effects: [{ kind: 'tapIncomeShare', share: 0.1 }] },
  { id: 'dyson1', name: 'Stellar Mirrors', desc: 'Dyson Collectors produce 2x.', cost: 1.5e14, requires: { gen: 'dyson', count: 10 }, effects: [{ kind: 'genMult', gen: 'dyson', mult: 2 }] },
  { id: 'all3', name: 'Galactic Franchise', desc: 'Everything produces 3x.', cost: 2e15, requires: { gen: 'gate', count: 25 }, effects: [{ kind: 'allMult', mult: 3 }] },
];

export const BOOST = {
  mult: 2,
  durationSec: 30,
  cooldownSec: 300,
};

export const OFFLINE_CAP_SEC = 2 * 60 * 60;
export const SAVE_VERSION = 2;

/**
 * Prestige: relocating the station resets the run for Star Cores. Total cores earned is
 * (all-time scrap / divisor) ^ exponent; a cube root means 8x the earnings gives 2x the cores,
 * which keeps runs speeding up without running away.
 */
export const PRESTIGE = {
  divisor: 1e6,
  exponent: 1 / 3,
  /** Income bonus per core. */
  perCore: 0.1,
};

export type PerkId = 'headstart' | 'longshift' | 'longboost' | 'autobuy' | 'magnet' | 'seedfund';

/** Permanent perks unlocked by how many Star Cores you hold. */
export const CORE_PERKS: readonly { id: PerkId; at: number; name: string; desc: string }[] = [
  { id: 'headstart', at: 3, name: 'Head Start', desc: 'Start each run with 10 Salvage Drones.' },
  { id: 'longshift', at: 10, name: 'Night Shift', desc: 'Offline earnings last up to 4 hours.' },
  { id: 'longboost', at: 25, name: 'Afterburners', desc: 'Overdrive lasts 60 seconds.' },
  { id: 'autobuy', at: 50, name: 'Auto-Builder', desc: 'Buys your cheapest machine every 2 seconds.' },
  { id: 'magnet', at: 100, name: 'Crate Magnet', desc: 'Salvage crates drift by twice as often.' },
  { id: 'seedfund', at: 250, name: 'Seed Fund', desc: 'Start each run with 1M scrap.' },
];

/** Each achievement adds this much income, permanently. */
export const ACHIEVEMENT_BONUS = 0.01;
