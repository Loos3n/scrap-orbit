import { baseIncome } from './economy';
import type { GameState } from './state';

/*
 * A small record for the Stats graphs: base income sampled every ten minutes of play (the last
 * day of play is kept) and a line for each of the recent relocations.
 */

export const SAMPLE_SEC = 600;
export const MAX_SAMPLES = 144;
export const MAX_RUNS = 12;

export interface IncomeSample {
  /** Epoch ms. */
  t: number;
  /** log10 of base income per second (-1 for none), so samples stay small numbers. */
  log: number;
}

export interface RunRecord {
  /** Epoch ms the run ended. */
  t: number;
  sector: number;
  minutes: number;
  cores: number;
}

const logOf = (state: GameState) => {
  const inc = baseIncome(state);
  return inc.gt(0) ? Math.round(inc.log10() * 1000) / 1000 : -1;
};

/** Adds an income sample when ten minutes of play have passed since the last one. */
export function recordIncome(state: GameState, now: number): void {
  const h = state.history.income;
  const last = h[h.length - 1];
  if (last && now - last.t < SAMPLE_SEC * 1000) return;
  h.push({ t: now, log: logOf(state) });
  if (h.length > MAX_SAMPLES) h.splice(0, h.length - MAX_SAMPLES);
}

/** Notes a finished run; call just before the relocation resets it. */
export function recordRun(state: GameState, cores: number, now: number): void {
  const r = state.history.runs;
  r.push({ t: now, sector: state.stats.relocations, minutes: Math.round(state.stats.runSec / 60), cores });
  if (r.length > MAX_RUNS) r.splice(0, r.length - MAX_RUNS);
}
