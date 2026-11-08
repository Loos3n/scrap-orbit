import { CRATE_BUFFS, type CrateBuffId } from './crate-buffs';
import { baseIncome, earn, income, tapValue } from './economy';
import { addCrystals, petActive } from './meta';
import { D, Decimal } from './num';
import { sectorCrateMult, timeStretch } from './sectors';
import type { GameState } from './state';

/*
 * Lucky salvage crates. Every crate that drifts past is sealed, and you only learn what is
 * inside when you crack it open. Most hold a plain haul of scrap; the rest hold a timed buff
 * (Power surge, Claw frenzy), a big haul that grows with the scrap you have banked, a swarm of
 * little crates spilling out, a crystal stash, or a spare battery that recharges Overdrive.
 */

export type CratePrize =
  | { kind: 'scrap'; amount: Decimal }
  | { kind: 'haul'; amount: Decimal }
  | { kind: 'buff'; id: CrateBuffId; seconds: number }
  | { kind: 'swarm'; count: number; each: Decimal }
  | { kind: 'crystals'; amount: number }
  | { kind: 'battery' };

/** How often each surprise turns up, out of 100. */
export const CRATE_ODDS = { scrap: 42, surge: 15, frenzy: 12, haul: 12, swarm: 8, crystals: 7, battery: 4 } as const;

/** A big haul: this share of banked scrap, capped at this many seconds of income. */
export const HAUL = { bankShare: 0.15, capSec: 15 * 60, minCrates: 4 };
/** A swarm: how many little crates spill out, and what each is worth next to a full crate. */
export const SWARM = { count: [5, 8] as [number, number], share: 0.5 };

/** A plain crate: 30 seconds of income or 25 taps, whichever is more (doubled by the Orbit Pup). */
export function crateValue(state: GameState, now: number): Decimal {
  const a = income(state, now).mul(30);
  const b = tapValue(state, now).mul(25);
  return (a.gt(b) ? a : b).mul(petActive(state, 'pup') ? 2 : 1).mul(sectorCrateMult(state));
}

/** Picks what is inside. `roll` is 0 to 1 (Math.random in play). */
export function pickCrate(roll: number): keyof typeof CRATE_ODDS {
  let at = roll * 100;
  for (const [k, w] of Object.entries(CRATE_ODDS) as [keyof typeof CRATE_ODDS, number][]) {
    if (at < w) return k;
    at -= w;
  }
  return 'scrap';
}

/**
 * Opens a crate and pays what is inside. `surprises` is false during the tutorial, so the first
 * crate a new player taps is always plain scrap.
 */
export function openCrate(state: GameState, now: number, roll = Math.random(), surprises = true, rand = Math.random): CratePrize {
  state.stats.crates++;
  const plain = crateValue(state, now);
  let kind = surprises ? pickCrate(roll) : 'scrap';
  // A spare battery only helps while Overdrive is cooling down.
  if (kind === 'battery' && now >= state.boostReadyAt) kind = 'surge';
  if (kind !== 'scrap') state.stats.surprises = (state.stats.surprises ?? 0) + 1;
  switch (kind) {
    case 'surge':
    case 'frenzy': {
      const seconds = CRATE_BUFFS[kind].seconds * timeStretch(state);
      state.crateBuffs[kind] = Math.max(state.crateBuffs[kind], now) + seconds * 1000;
      return { kind: 'buff', id: kind, seconds };
    }
    case 'haul': {
      // Rewards a full bank, like a vault, but never more than a quarter hour of income.
      const fromBank = Decimal.min(state.scrap.mul(HAUL.bankShare), baseIncome(state).mul(HAUL.capSec));
      const amount = Decimal.max(fromBank, plain.mul(HAUL.minCrates));
      earn(state, amount);
      return { kind: 'haul', amount };
    }
    case 'swarm': {
      const [lo, hi] = SWARM.count;
      return { kind: 'swarm', count: lo + Math.floor(rand() * (hi - lo + 1)), each: plain.mul(SWARM.share) };
    }
    case 'crystals': {
      const amount = 3 + Math.floor(rand() * 6);
      addCrystals(state, amount);
      return { kind: 'crystals', amount };
    }
    case 'battery':
      state.boostReadyAt = now;
      return { kind: 'battery' };
    default:
      earn(state, plain);
      return { kind: 'scrap', amount: plain };
  }
}

/** One little crate from a swarm. */
export function openMiniCrate(state: GameState, each: Decimal): Decimal {
  const amount = Decimal.max(each, D(1));
  earn(state, amount);
  return amount;
}

/** Seconds left on a buff, for the HUD (0 when off). */
export function buffLeft(state: GameState, id: CrateBuffId, now: number): number {
  return Math.max(0, Math.ceil((state.crateBuffs[id] - now) / 1000));
}
