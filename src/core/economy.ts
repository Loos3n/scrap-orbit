import {
  ACHIEVEMENT_BONUS,
  BOOST,
  CORE_PERKS,
  GENERATORS,
  MILESTONE_MULT,
  MILESTONES,
  OFFLINE_CAP_SEC,
  PRESTIGE,
  UPGRADES,
  type PerkId,
  type GeneratorDef,
  type GeneratorId,
  type UpgradeDef,
} from './config';
import { D, Decimal } from './num';
import { emptyOwned, type GameState } from './state';

export type BuyMode = 1 | 10 | 100 | 'max';

export const genById = (id: GeneratorId): GeneratorDef => GENERATORS.find((g) => g.id === id)!;

/** Cost of buying `count` more of a generator when `owned` are already owned. */
export function costFor(gen: GeneratorDef, owned: number, count: number): Decimal {
  if (count <= 0) return D(0);
  return Decimal.sumGeometricSeries(count, gen.baseCost, gen.growth, owned);
}

/** How many of a generator `scrap` can buy right now. */
export function maxAffordable(gen: GeneratorDef, owned: number, scrap: Decimal): number {
  let n = Decimal.affordGeometricSeries(scrap, gen.baseCost, gen.growth, owned).toNumber();
  if (!Number.isFinite(n) || n < 0) n = 0;
  n = Math.floor(n);
  // The library works in logs; nudge for floating-point edge cases.
  while (n > 0 && costFor(gen, owned, n).gt(scrap)) n--;
  while (costFor(gen, owned, n + 1).lte(scrap)) n++;
  return n;
}

/** Units and price for a buy button in the given mode. Max with nothing affordable shows 1. */
export function purchaseQuote(state: GameState, gen: GeneratorDef, mode: BuyMode): { count: number; cost: Decimal } {
  const owned = state.owned[gen.id];
  const count = mode === 'max' ? Math.max(1, maxAffordable(gen, owned, state.scrap)) : mode;
  return { count, cost: costFor(gen, owned, count) };
}

export function milestonesReached(owned: number): number {
  return MILESTONES.filter((m) => owned >= m).length;
}

/** The next milestone above `owned`, or null after the last one. */
export function nextMilestone(owned: number): { at: number; prev: number } | null {
  let prev = 0;
  for (const m of MILESTONES) {
    if (owned < m) return { at: m, prev };
    prev = m;
  }
  return null;
}

function upgradeDefs(state: GameState): UpgradeDef[] {
  return UPGRADES.filter((u) => state.upgrades.has(u.id));
}

export function hasPerk(state: GameState, id: PerkId): boolean {
  return state.cores >= CORE_PERKS.find((p) => p.id === id)!.at;
}

/** Permanent multiplier from Star Cores and achievements; applies to machines and taps. */
export function globalMult(state: GameState): number {
  return (1 + state.cores * PRESTIGE.perCore) * (1 + state.achievements.size * ACHIEVEMENT_BONUS);
}

export function boostDurationSec(state: GameState): number {
  return hasPerk(state, 'longboost') ? 60 : BOOST.durationSec;
}

export function offlineCapSec(state: GameState): number {
  return hasPerk(state, 'longshift') ? OFFLINE_CAP_SEC * 2 : OFFLINE_CAP_SEC;
}

export function boostActive(state: GameState, now: number): boolean {
  return now < state.boostUntil;
}

/** Output per second of one generator type, including all multipliers except the boost. */
export function generatorRate(state: GameState, gen: GeneratorDef): Decimal {
  const owned = state.owned[gen.id];
  if (owned === 0) return D(0);
  let mult = Math.pow(MILESTONE_MULT, milestonesReached(owned)) * globalMult(state);
  for (const u of upgradeDefs(state)) {
    for (const e of u.effects) {
      if (e.kind === 'genMult' && e.gen === gen.id) mult *= e.mult;
      if (e.kind === 'allMult') mult *= e.mult;
    }
  }
  return D(gen.baseOutput).mul(owned).mul(mult);
}

/** Base income per second, without the boost. */
export function baseIncome(state: GameState): Decimal {
  return GENERATORS.reduce((sum, g) => sum.add(generatorRate(state, g)), D(0));
}

export function income(state: GameState, now: number): Decimal {
  const base = baseIncome(state);
  return boostActive(state, now) ? base.mul(BOOST.mult) : base;
}

export function tapValue(state: GameState, now: number): Decimal {
  let mult = 1;
  let share = 0;
  for (const u of upgradeDefs(state)) {
    for (const e of u.effects) {
      if (e.kind === 'tapMult') mult *= e.mult;
      if (e.kind === 'tapIncomeShare') share += e.share;
    }
  }
  const value = D(mult * globalMult(state)).add(baseIncome(state).mul(share));
  return boostActive(state, now) ? value.mul(BOOST.mult) : value;
}

export function earn(state: GameState, amount: Decimal): void {
  state.scrap = state.scrap.add(amount);
  state.lifetime = state.lifetime.add(amount);
  state.allTime = state.allTime.add(amount);
}

/** Advances the game by `dt` seconds of production. */
export function tick(state: GameState, dt: number, now: number): void {
  if (dt <= 0) return;
  earn(state, income(state, now).mul(dt));
}

export function tap(state: GameState, now: number): Decimal {
  const value = tapValue(state, now);
  earn(state, value);
  state.taps++;
  return value;
}

export function buyGenerator(state: GameState, id: GeneratorId, mode: BuyMode): number {
  const gen = genById(id);
  const owned = state.owned[id];
  const count = mode === 'max' ? maxAffordable(gen, owned, state.scrap) : mode;
  if (count <= 0) return 0;
  const cost = costFor(gen, owned, count);
  if (cost.gt(state.scrap)) return 0;
  state.scrap = state.scrap.sub(cost);
  state.owned[id] = owned + count;
  return count;
}

export function upgradeVisible(state: GameState, u: UpgradeDef): boolean {
  return state.owned[u.requires.gen] >= u.requires.count;
}

export function buyUpgrade(state: GameState, id: string): boolean {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u || state.upgrades.has(id) || !upgradeVisible(state, u)) return false;
  if (state.scrap.lt(u.cost)) return false;
  state.scrap = state.scrap.sub(u.cost);
  state.upgrades.add(id);
  return true;
}

export function activateBoost(state: GameState, now: number): boolean {
  if (now < state.boostReadyAt) return false;
  const duration = boostDurationSec(state);
  state.boostUntil = now + duration * 1000;
  state.boostReadyAt = now + (duration + BOOST.cooldownSec) * 1000;
  state.stats.boosts++;
  return true;
}

/**
 * Credits production for time spent away, from the last-seen timestamp.
 * Uses base income (boosts don't run while away) and caps the time.
 */
export function applyOffline(state: GameState, now: number): { seconds: number; earned: Decimal } {
  const away = Math.max(0, (now - state.lastSeen) / 1000);
  const seconds = Math.min(away, offlineCapSec(state));
  const earned = baseIncome(state).mul(seconds);
  earn(state, earned);
  state.lastSeen = now;
  return { seconds, earned };
}

/** Total Star Cores that all-time earnings are worth. */
export function coresForAllTime(allTime: Decimal): number {
  if (allTime.lte(0)) return 0;
  // Work in logs so this stays exact far past the range of a normal number.
  const log = (allTime.log10() - Math.log10(PRESTIGE.divisor)) * PRESTIGE.exponent;
  return log < 0 ? 0 : Math.floor(Math.pow(10, log) + 1e-9);
}

/** Cores the player would gain by relocating now. */
export function claimableCores(state: GameState): number {
  return Math.max(0, coresForAllTime(state.allTime) - state.cores);
}

/** All-time scrap needed before the next core becomes claimable. */
export function nextCoreAt(state: GameState): Decimal {
  const target = Math.max(coresForAllTime(state.allTime), state.cores) + 1;
  return D(target).pow(1 / PRESTIGE.exponent).mul(PRESTIGE.divisor);
}

/**
 * Relocates the station: banks the claimable cores and starts a fresh run.
 * Keeps cores, achievements, all-time totals, stats and settings.
 */
export function relocate(state: GameState, now: number): number {
  const gained = claimableCores(state);
  if (gained <= 0) return 0;
  state.cores += gained;
  state.stats.relocations++;
  state.scrap = D(0);
  state.lifetime = D(0);
  state.owned = emptyOwned();
  state.upgrades = new Set();
  state.boostUntil = 0;
  state.boostReadyAt = 0;
  state.lastSeen = now;
  if (hasPerk(state, 'headstart')) state.owned.drone = 10;
  if (hasPerk(state, 'seedfund')) state.scrap = D(1e6);
  return gained;
}

/** The cheapest single machine purchase, for the Auto-Builder perk. */
export function cheapestMachine(state: GameState): { id: GeneratorId; cost: Decimal } | null {
  let best: { id: GeneratorId; cost: Decimal } | null = null;
  let revealed = true;
  for (const g of GENERATORS) {
    // Only machines the player can see: everything owned plus the next new one.
    if (!revealed) break;
    if (state.owned[g.id] === 0) revealed = false;
    const cost = costFor(g, state.owned[g.id], 1);
    if (!best || cost.lt(best.cost)) best = { id: g.id, cost };
  }
  return best;
}
