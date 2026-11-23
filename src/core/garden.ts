import type { GameState } from './state';

/*
 * The hydroponics garden (Station > Garden): plant a crop in a plot, it grows in real time (also
 * while the game is closed), and harvesting it cooks a snack for the crew: a timed boost. Crops
 * come to the garden one by one as more is harvested, and a third and fourth plot open later.
 * Seeds are free; the price is waiting.
 *
 * This file only reads and changes state.garden; Game wraps the actions with events.
 */

export type SnackKind = 'income' | 'tap' | 'crates' | 'boss';

export interface CropDef {
  id: string;
  name: string;
  /** Minutes to grow. */
  minutes: number;
  /** The snack harvesting it gives: a boost of this kind, this strong, for this many minutes. */
  snack: { kind: SnackKind; mult: number; minutes: number; name: string };
  /** Crystals as well, for the slow crops. */
  crystals: number;
  /** Harvests (of anything) before this crop can be planted. */
  unlockAt: number;
  color: string;
  leaf: string;
}

export const CROPS: readonly CropDef[] = [
  { id: 'sprout', name: 'Star Sprouts', minutes: 5, snack: { kind: 'tap', mult: 2, minutes: 10, name: 'Sprout crunch' }, crystals: 0, unlockAt: 0, color: '#ffe066', leaf: '#7ed957' },
  { id: 'bean', name: 'Comet Beans', minutes: 20, snack: { kind: 'income', mult: 1.5, minutes: 20, name: 'Bean stew' }, crystals: 1, unlockAt: 2, color: '#7cf0ff', leaf: '#4fbf6a' },
  { id: 'melon', name: 'Moon Melons', minutes: 60, snack: { kind: 'crates', mult: 2, minutes: 30, name: 'Melon slices' }, crystals: 2, unlockAt: 5, color: '#c9f2a0', leaf: '#3f9f50' },
  { id: 'berry', name: 'Nebula Berries', minutes: 120, snack: { kind: 'boss', mult: 2, minutes: 60, name: 'Berry pie' }, crystals: 3, unlockAt: 9, color: '#c58cff', leaf: '#4f8f5a' },
  { id: 'pumpkin', name: 'Sun Pumpkins', minutes: 240, snack: { kind: 'income', mult: 2, minutes: 60, name: 'Pumpkin soup' }, crystals: 5, unlockAt: 15, color: '#ff9a4c', leaf: '#5aa04a' },
  { id: 'truffle', name: 'Void Truffles', minutes: 480, snack: { kind: 'income', mult: 3, minutes: 45, name: 'Truffle feast' }, crystals: 12, unlockAt: 24, color: '#8f7bff', leaf: '#3a6a5a' },
];

export const GARDEN = {
  /** Plots to start with, and when the third and fourth open. */
  plots: 2,
  thirdAtRelocations: 2,
  fourthAtShifts: 1,
};

export const cropDef = (id: string) => CROPS.find((c) => c.id === id);

/** The garden opens with the Station tab. */
export const gardenOpen = (s: GameState) => s.tips.has('open:station') || s.stats.relocations > 0 || s.galaxy.shifts > 0;

export function plotCount(s: GameState): number {
  return GARDEN.plots + (s.stats.relocations >= GARDEN.thirdAtRelocations ? 1 : 0) + (s.galaxy.shifts >= GARDEN.fourthAtShifts ? 1 : 0);
}

export const cropUnlocked = (s: GameState, c: CropDef) => s.garden.harvested >= c.unlockAt;

/** What a plot holds: empty, growing (0 to 1), or ripe. */
export function plotState(s: GameState, i: number, now: number): { crop: CropDef | null; grown: number; ripe: boolean; secondsLeft: number } {
  const p = s.garden.plots[i];
  const crop = p ? cropDef(p.crop) ?? null : null;
  if (!p || !crop) return { crop: null, grown: 0, ripe: false, secondsLeft: 0 };
  const total = crop.minutes * 60_000;
  const grown = Math.max(0, Math.min(1, (now - p.at) / total));
  return { crop, grown, ripe: grown >= 1, secondsLeft: Math.max(0, (p.at + total - now) / 1000) };
}

export function ripeCount(s: GameState, now: number): number {
  let n = 0;
  for (let i = 0; i < plotCount(s); i++) if (plotState(s, i, now).ripe) n++;
  return n;
}

export function plant(s: GameState, i: number, cropId: string, now: number): boolean {
  const c = cropDef(cropId);
  if (!c || !gardenOpen(s) || i < 0 || i >= plotCount(s) || s.garden.plots[i] || !cropUnlocked(s, c)) return false;
  s.garden.plots[i] = { crop: c.id, at: now };
  return true;
}

/** Harvests a ripe plot: the snack starts (or runs longer), and any crystals are returned. */
export function harvest(s: GameState, i: number, now: number): { crop: CropDef; crystals: number } | null {
  const st = plotState(s, i, now);
  if (!st.crop || !st.ripe) return null;
  const c = st.crop;
  s.garden.plots[i] = null;
  s.garden.harvested++;
  const k = c.snack.kind;
  const cur = s.garden.snacks[k];
  // A stronger snack replaces a weaker one; the same strength adds its time on.
  if (!cur || cur.until <= now || cur.mult < c.snack.mult) s.garden.snacks[k] = { mult: c.snack.mult, until: now + c.snack.minutes * 60_000 };
  else if (cur.mult === c.snack.mult) cur.until += c.snack.minutes * 60_000;
  return { crop: c, crystals: c.crystals };
}

/** The boost a snack gives right now (1 when none). */
export function snackMult(s: GameState, kind: SnackKind, now: number): number {
  const sn = s.garden.snacks[kind];
  return sn && now < sn.until ? sn.mult : 1;
}

export function snackSecondsLeft(s: GameState, kind: SnackKind, now: number): number {
  const sn = s.garden.snacks[kind];
  return sn ? Math.max(0, (sn.until - now) / 1000) : 0;
}

export const SNACK_TEXT: Record<SnackKind, string> = {
  income: 'income',
  tap: 'tap power',
  crates: 'crates',
  boss: 'boss damage',
};
