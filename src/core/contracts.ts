import { GENERATORS, type GeneratorId } from './config';
import type { GameState } from './state';

/*
 * Run contracts: from the second relocation on, the player picks one of three rule cards for the
 * new run (or none). Each bends the run one way and sets a goal sized from the run before; meeting
 * it pays crystals and a permanent +2% income. The rule lasts until the next relocation, done or not.
 * Like sectors.ts, these only read the save, except the few actions at the bottom.
 */

export type ContractId = 'haulers' | 'forge' | 'hands' | 'lean' | 'crates' | 'overclock' | 'sprint';

export interface ContractOffer {
  id: ContractId;
  /** A count (machines, taps, crates, Overdrives) or, for 'lean' and 'sprint', a machine's index. */
  goal: number;
}

export interface ActiveContract extends ContractOffer {
  /** The counter the goal is measured from (taps, crates or Overdrives so far). */
  base: number;
  done: boolean;
}

export interface ContractDef {
  id: ContractId;
  name: string;
  /** The rule, shown on the card. */
  rule: string;
  color: number;
}

export const CONTRACTS: readonly ContractDef[] = [
  { id: 'haulers', name: 'Hauler Union', rule: 'Haulers 4x, Drones 0.25x', color: 0xffb547 },
  { id: 'forge', name: 'Foundry Shift', rule: 'Smelters and Fabricators 3x, taps 0.5x', color: 0xff8a4c },
  { id: 'hands', name: 'Hands On', rule: 'Taps 10x, Auto-Builder off', color: 0x9aa6ff },
  { id: 'lean', name: 'Lean Station', rule: 'Machines 40% cheaper, taps 0.5x', color: 0x4fe3c1 },
  { id: 'crates', name: 'Crate Season', rule: 'Salvage crates drift by twice as often', color: 0xffd166 },
  { id: 'overclock', name: 'Overclocked', rule: 'Overdrive recharges twice as fast', color: 0xff6b9a },
  { id: 'sprint', name: 'Sprint', rule: 'Everything 1.5x, but the goal has a 20 minute clock', color: 0x5cd6ff },
];

/** Crystals for meeting a contract. */
export const CONTRACT_CRYSTALS = 15;
/** Permanent income for every contract ever met. */
export const CONTRACT_INCOME = 0.02;
/** Run time allowed for the Sprint goal. */
export const SPRINT_SEC = 20 * 60;
/** Relocations already made before contracts are offered (the first relocation has its own card). */
export const CONTRACTS_FROM = 1;

export const contractDef = (id: ContractId): ContractDef => CONTRACTS.find((c) => c.id === id)!;

/** Rounds a goal down to a friendly number. */
function nice(n: number): number {
  if (n >= 100) return Math.floor(n / 25) * 25;
  if (n >= 20) return Math.floor(n / 5) * 5;
  return Math.max(1, Math.floor(n));
}

/** Index of the furthest machine the run owns, or -1. */
function furthest(owned: Record<GeneratorId, number>): number {
  let best = -1;
  GENERATORS.forEach((g, i) => {
    if (owned[g.id] > 0) best = i;
  });
  return best;
}

/** The goal a contract would get after a run like `prev`, or null when it doesn't fit that run. */
function goalFor(id: ContractId, prev: GameState): number | null {
  const far = furthest(prev.owned);
  switch (id) {
    case 'haulers':
      return prev.owned.hauler >= 30 ? nice(prev.owned.hauler * 1.2) : null;
    case 'forge':
      return prev.owned.fabricator >= 15 ? nice(prev.owned.fabricator * 1.15) : null;
    case 'hands':
      return 1200;
    case 'lean':
      // One machine past the furthest of the last run (or the Dyson itself, once it is reached).
      return far >= 2 ? Math.min(far + 1, GENERATORS.length - 1) : null;
    case 'crates':
      return 12;
    case 'overclock':
      return 8;
    case 'sprint':
      // Back to the last run's furthest machine against the clock: with more cores it is close but doable.
      return far >= 3 ? far : null;
  }
}

/** Three different contracts that fit the run that is ending, picked at random. */
export function makeOffers(prev: GameState, rand = Math.random): ContractOffer[] {
  if (prev.stats.relocations < CONTRACTS_FROM || prev.challenge) return [];
  const pool: ContractOffer[] = [];
  for (const c of CONTRACTS) {
    const goal = goalFor(c.id, prev);
    if (goal !== null) pool.push({ id: c.id, goal });
  }
  const out: ContractOffer[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

/** The counter a contract's goal is measured on, for the save as it is now. */
function counter(state: GameState, id: ContractId): number {
  if (id === 'hands') return state.taps;
  if (id === 'crates') return state.stats.crates;
  if (id === 'overclock') return state.stats.boosts;
  return 0;
}

/** Progress towards the active contract's goal: what is done, out of what. */
export function contractProgress(state: GameState): { have: number; need: number; pct: number } | null {
  const c = state.contract;
  if (!c) return null;
  let have: number;
  let need = c.goal;
  if (c.id === 'haulers') have = state.owned.hauler;
  else if (c.id === 'forge') have = state.owned.fabricator;
  else if (c.id === 'lean' || c.id === 'sprint') {
    // Machines reached on the way to the goal machine.
    have = Math.min(c.goal + 1, furthest(state.owned) + 1);
    need = c.goal + 1;
  } else have = counter(state, c.id) - c.base;
  have = c.done ? need : Math.min(have, need);
  return { have, need, pct: need > 0 ? have / need : 1 };
}

/** The goal in words, like "120 Haulers" or "Reach the Mining Laser". */
export function goalText(offer: ContractOffer): string {
  switch (offer.id) {
    case 'haulers':
      return `Own ${offer.goal} Haulers`;
    case 'forge':
      return `Own ${offer.goal} Fabricators`;
    case 'hands':
      return `Tap ${offer.goal} times`;
    case 'lean':
      return `Build a ${GENERATORS[offer.goal].name}`;
    case 'crates':
      return `Open ${offer.goal} salvage crates`;
    case 'overclock':
      return `Use Overdrive ${offer.goal} times`;
    case 'sprint':
      return `Build a ${GENERATORS[offer.goal].name} within 20 minutes`;
  }
}

/** Seconds left on the Sprint clock, or null for contracts without one. */
export function sprintLeft(state: GameState): number | null {
  const c = state.contract;
  if (!c || c.id !== 'sprint' || c.done) return null;
  return Math.max(0, SPRINT_SEC - state.stats.runSec);
}

const ruleOn = (state: GameState, id: ContractId) => state.contract?.id === id;

/** Output multiplier the contract gives one kind of machine. */
export function contractGenMult(state: GameState, gen: GeneratorId): number {
  if (ruleOn(state, 'haulers')) return gen === 'hauler' ? 4 : gen === 'drone' ? 0.25 : 1;
  if (ruleOn(state, 'forge')) return gen === 'smelter' || gen === 'fabricator' ? 3 : 1;
  if (ruleOn(state, 'sprint')) return 1.5;
  return 1;
}

export function contractTapMult(state: GameState): number {
  if (ruleOn(state, 'hands')) return 10;
  if (ruleOn(state, 'forge') || ruleOn(state, 'lean')) return 0.5;
  if (ruleOn(state, 'sprint')) return 1.5;
  return 1;
}

export const contractCostMult = (state: GameState) => (ruleOn(state, 'lean') ? 0.6 : 1);
export const contractCrateMult = (state: GameState) => (ruleOn(state, 'crates') ? 2 : 1);
export const contractCooldownMult = (state: GameState) => (ruleOn(state, 'overclock') ? 0.5 : 1);
export const contractAutoBuyOff = (state: GameState) => ruleOn(state, 'hands');

/** Permanent income multiplier from every contract ever met. */
export const contractIncomeMult = (state: GameState) => 1 + state.contractsDone * CONTRACT_INCOME;

// ---------- Actions ----------

/** Signs one of the offered contracts (or none, with null) for the run that has just begun. */
export function pickContract(state: GameState, index: number | null): ContractOffer | null {
  const offer = index === null ? null : state.contractOffers[index] ?? null;
  state.contractOffers = [];
  state.contract = offer ? { ...offer, base: counter(state, offer.id), done: false } : null;
  return offer;
}

/** Marks the contract met (paying out) or failed. Returns what happened, if anything. */
export function checkContract(state: GameState): 'done' | 'failed' | null {
  const c = state.contract;
  if (!c || c.done) return null;
  const p = contractProgress(state)!;
  if (p.have >= p.need) {
    // The caller pays the crystals (meta.addCrystals), so mission and weekly counters see them.
    c.done = true;
    state.contractsDone++;
    return 'done';
  }
  if (c.id === 'sprint' && state.stats.runSec > SPRINT_SEC) {
    state.contract = null;
    return 'failed';
  }
  return null;
}
