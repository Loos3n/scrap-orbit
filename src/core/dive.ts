import type { GameState } from './state';

/*
 * Salvage dives: a 30-second arcade run. The claw drops into a debris stream; slide it left and
 * right to catch falling scrap, gold and crystals while dodging mines. Dives use charges that
 * refill over time. The play itself lives in ui/dive-ui.ts; this file holds the rules and the
 * payout, which is in seconds of the station's income per point.
 */

export const DIVE = {
  seconds: 30,
  lives: 3,
  chargesMax: 3,
  /** Minutes for one charge to refill. */
  chargeMin: 20,
  /** Each point is worth this many seconds of income. */
  secPerPoint: 6,
  /** Most crystals one dive can bring home. */
  crystalCap: 6,
  /** Crystals for beating your best score. */
  bestCrystals: 3,
  /** Dives open after the first relocation. */
  openAtRelocations: 1,
};

/** What falls in the stream: points, a crystal, or a mine. */
export type DropKind = 'scrap' | 'gold' | 'crystal' | 'mine';

export const DROPS: Record<DropKind, { points: number; weight: number; color: string }> = {
  scrap: { points: 1, weight: 60, color: '#ffb547' },
  gold: { points: 5, weight: 8, color: '#ffe066' },
  crystal: { points: 0, weight: 7, color: '#5cd6ff' },
  mine: { points: 0, weight: 25, color: '#ff5d6c' },
};

export const diveOpen = (s: GameState) => s.tutorial < 0 && (s.stats.relocations >= DIVE.openAtRelocations || s.galaxy.shifts > 0);

export function pickDrop(roll: number): DropKind {
  const total = Object.values(DROPS).reduce((n, d) => n + d.weight, 0);
  let x = roll * total;
  for (const [k, d] of Object.entries(DROPS) as [DropKind, (typeof DROPS)[DropKind]][]) {
    if ((x -= d.weight) < 0) return k;
  }
  return 'scrap';
}

/** Tops up dive charges for the time that has passed. */
export function refillCharges(s: GameState, now: number): void {
  const d = s.dive;
  if (d.charges >= DIVE.chargesMax) {
    d.chargeAt = now;
    return;
  }
  const step = DIVE.chargeMin * 60_000;
  const add = Math.floor((now - d.chargeAt) / step);
  if (add <= 0) return;
  d.charges = Math.min(DIVE.chargesMax, d.charges + add);
  d.chargeAt = d.charges >= DIVE.chargesMax ? now : d.chargeAt + add * step;
}

export function chargeSecondsLeft(s: GameState, now: number): number {
  if (s.dive.charges >= DIVE.chargesMax) return 0;
  return Math.max(0, Math.ceil((s.dive.chargeAt + DIVE.chargeMin * 60_000 - now) / 1000));
}

/** Spends a charge to start a dive. */
export function startDive(s: GameState, now: number): boolean {
  refillCharges(s, now);
  if (!diveOpen(s) || s.dive.charges <= 0) return false;
  if (s.dive.charges >= DIVE.chargesMax) s.dive.chargeAt = now;
  s.dive.charges--;
  return true;
}

/** Settles a finished dive: the record, and what it pays besides scrap (which Game works out from income). */
export function finishDive(s: GameState, points: number, crystals: number): { best: boolean; crystals: number } {
  const best = points > s.dive.best && s.dive.dives > 0;
  const first = s.dive.dives === 0;
  s.dive.dives++;
  if (points > s.dive.best) s.dive.best = points;
  return { best, crystals: Math.min(DIVE.crystalCap, crystals) + (best ? DIVE.bestCrystals : 0) + (first ? DIVE.bestCrystals : 0) };
}
