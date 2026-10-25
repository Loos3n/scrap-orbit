export type GeneratorId = 'drone' | 'hauler' | 'smelter' | 'fabricator' | 'dock';

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
];

export const BOOST = {
  mult: 2,
  durationSec: 30,
  cooldownSec: 300,
};

export const OFFLINE_CAP_SEC = 2 * 60 * 60;
export const SAVE_VERSION = 1;
