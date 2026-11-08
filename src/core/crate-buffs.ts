import type { GameState } from './state';

/** The timed buffs a lucky crate can hold. */
export const CRATE_BUFFS = {
  /** Power surge: every machine runs hot. */
  surge: { name: 'Power surge', mult: 5, seconds: 45, what: 'income' },
  /** Claw frenzy: taps are worth far more, for a short burst of tapping. */
  frenzy: { name: 'Claw frenzy', mult: 20, seconds: 12, what: 'taps' },
} as const;

export type CrateBuffId = keyof typeof CRATE_BUFFS;

export function crateBuffActive(state: GameState, id: CrateBuffId, now: number): boolean {
  return now < state.crateBuffs[id];
}

export function crateIncomeMult(state: GameState, now: number): number {
  return crateBuffActive(state, 'surge', now) ? CRATE_BUFFS.surge.mult : 1;
}

export function crateTapMult(state: GameState, now: number): number {
  return crateBuffActive(state, 'frenzy', now) ? CRATE_BUFFS.frenzy.mult : 1;
}
