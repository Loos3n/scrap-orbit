import { baseIncome, boostDurationSec, earn, tapValue } from './economy';
import { D, Decimal } from './num';
import type { GameState } from './state';

/*
 * Lucky shooting stars: a rare streak across the sky (every 15 to 30 minutes) that pays a
 * surprise when tapped. Most are a nice handful of scrap; some are crystals or a free
 * Overdrive; one in ten is a jackpot.
 */

export type StarPrize = { kind: 'scrap'; amount: Decimal } | { kind: 'jackpot'; amount: Decimal } | { kind: 'crystals'; amount: number } | { kind: 'overdrive'; seconds: number };

/** Rolls and pays a star's prize. `roll` is 0 to 1 (Math.random in play). */
export function catchStar(state: GameState, now: number, roll = Math.random()): StarPrize {
  state.stats.stars = (state.stats.stars ?? 0) + 1;
  const minutes = (m: number) => Decimal.max(Decimal.max(baseIncome(state).mul(m * 60), tapValue(state, now, true).mul(m * 15)), D(50));
  if (roll < 0.1) {
    const amount = minutes(60);
    earn(state, amount);
    return { kind: 'jackpot', amount };
  }
  if (roll < 0.35) {
    const amount = 15 + Math.floor(((roll - 0.1) / 0.25) * 16);
    state.crystals += amount;
    state.stats.crystalsEarned += amount;
    return { kind: 'crystals', amount };
  }
  if (roll < 0.5) {
    // A free Overdrive that doesn't touch the cooldown.
    const seconds = boostDurationSec(state);
    state.boostUntil = Math.max(state.boostUntil, now) + seconds * 1000;
    return { kind: 'overdrive', seconds };
  }
  const amount = minutes(10);
  earn(state, amount);
  return { kind: 'scrap', amount };
}

