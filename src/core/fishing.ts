import { CRATE_BUFFS } from './crate-buffs';
import { earn, income, tapValue } from './economy';
import { addCrystals } from './meta';
import { D, type Decimal } from './num';
import type { GameState } from './state';

/*
 * Space fishing: a calm little minigame off the side of the station. Cast a tractor line into
 * the nebula, wait for a bite, then reel in by tapping while the marker is in the green. Each
 * catch pays some scrap (a slice of income), the first of each kind pays crystals, and a
 * legendary catch sets the machines humming with a power surge. Catches fill the catch book and
 * swim in a little tank that orbits the station.
 *
 * Casting costs bait, which refills over time, so fishing is a break between upgrades rather
 * than a way to farm. Bait is only spent once something is hooked: a missed bite is free.
 * This file only reads and writes the save; the UI lives in ui/fishing-ui.ts.
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type CritterShape = 'fish' | 'jelly' | 'squid' | 'ray' | 'star' | 'eel' | 'puff' | 'whale';

export interface Critter {
  id: string;
  name: string;
  desc: string;
  rarity: Rarity;
  shape: CritterShape;
  color: string;
  accent: string;
  /** Jumps needed before it turns up (deeper sectors hold stranger things). */
  jumps?: number;
  /** Only after a Galaxy Shift. */
  shifted?: boolean;
}

export const CRITTERS: readonly Critter[] = [
  // ---------- Common ----------
  { id: 'boltfin', name: 'Boltfin', desc: 'A little fish with a nut for an eye. Loves loose bolts.', rarity: 'common', shape: 'fish', color: '#5cd6ff', accent: '#1d6e9a' },
  { id: 'glowjelly', name: 'Glow Jelly', desc: 'Drifts in the nebula and lights up when it’s happy.', rarity: 'common', shape: 'jelly', color: '#ff8fd8', accent: '#9a2f7a' },
  { id: 'dustpuff', name: 'Dust Puff', desc: 'Puffs up into a ball whenever a meteor goes by.', rarity: 'common', shape: 'puff', color: '#ffd166', accent: '#a0661a' },
  { id: 'starlet', name: 'Starlet', desc: 'A baby sea star. It will grow up to be a real star. Probably.', rarity: 'common', shape: 'star', color: '#ffb547', accent: '#a04a1a' },
  { id: 'wirewiggle', name: 'Wire Wiggler', desc: 'Often mistaken for a loose cable. Bites if you plug it in.', rarity: 'common', shape: 'eel', color: '#9dff6b', accent: '#2f7a2a' },
  { id: 'rustgill', name: 'Rustgill', desc: 'Orange all over from nibbling old hulls.', rarity: 'common', shape: 'fish', color: '#ff8a4c', accent: '#8a3412', jumps: 1 },
  { id: 'inkling', name: 'Inkling', desc: 'A tiny squid that squirts glitter when startled.', rarity: 'common', shape: 'squid', color: '#b58cff', accent: '#5a2fa0', jumps: 2 },
  // ---------- Uncommon ----------
  { id: 'solarray', name: 'Solar Ray', desc: 'Basks in starlight with its wings spread wide.', rarity: 'uncommon', shape: 'ray', color: '#ffe27a', accent: '#b07a10' },
  { id: 'cometkoi', name: 'Comet Koi', desc: 'Leaves a sparkly trail. Brings good luck to salvagers.', rarity: 'uncommon', shape: 'fish', color: '#ffffff', accent: '#ff5d6c' },
  { id: 'moonjelly', name: 'Moon Jelly', desc: 'Pale and round, with tentacles like silver thread.', rarity: 'uncommon', shape: 'jelly', color: '#dfe8ff', accent: '#6a78c0', jumps: 1 },
  { id: 'gearsquid', name: 'Gear Squid', desc: 'Its suckers are shaped like little cogs. Very handy.', rarity: 'uncommon', shape: 'squid', color: '#7ad9c0', accent: '#1f6f60', jumps: 3 },
  { id: 'prickle', name: 'Prickle Puff', desc: 'Covered in crystal spines. Pet it very carefully.', rarity: 'uncommon', shape: 'puff', color: '#5cd6ff', accent: '#ffffff', jumps: 4 },
  { id: 'voltee', name: 'Volt Eel', desc: 'Hums with spare power. The engineers want one for the reactor.', rarity: 'uncommon', shape: 'eel', color: '#5cd6ff', accent: '#ffe27a', jumps: 5 },
  // ---------- Rare ----------
  { id: 'nebulaling', name: 'Nebulaling', desc: 'A young whale made of gas and starlight.', rarity: 'rare', shape: 'whale', color: '#b58cff', accent: '#ff8fd8', jumps: 2 },
  { id: 'emberray', name: 'Ember Ray', desc: 'Glides through hot clouds near dying stars.', rarity: 'rare', shape: 'ray', color: '#ff5d6c', accent: '#ffb547', jumps: 4 },
  { id: 'crownstar', name: 'Crown Star', desc: 'A sea star with a tiny crown. It knows it’s special.', rarity: 'rare', shape: 'star', color: '#ffe27a', accent: '#ff8fd8', jumps: 6 },
  { id: 'hollowkoi', name: 'Hollow Koi', desc: 'Marked with a hollow circle, like the old fleet’s ships.', rarity: 'rare', shape: 'fish', color: '#2e3a7a', accent: '#ffcf7a', jumps: 8 },
  // ---------- Legendary ----------
  { id: 'starwhale', name: 'Star Whale', desc: 'Old as the galaxy. Sings so low the station hums along.', rarity: 'legendary', shape: 'whale', color: '#5cd6ff', accent: '#ffffff', jumps: 5 },
  { id: 'voidkraken', name: 'Void Kraken', desc: 'A tiny kraken from the edge of the dark star. Surprisingly cuddly.', rarity: 'legendary', shape: 'squid', color: '#3a2f6a', accent: '#ff5d6c', jumps: 8 },
  { id: 'galaxyjelly', name: 'Galaxy Jelly', desc: 'Has a whole spiral galaxy turning inside it.', rarity: 'legendary', shape: 'jelly', color: '#2a2346', accent: '#ffd166', shifted: true },
];

export const RARITY: Record<Rarity, { name: string; weight: number; color: string; hits: number; zone: number; speed: number; secs: number; crystals: number }> = {
  /** hits: taps in the green needed. zone: green width (share of the bar). speed: sweeps per second. */
  common: { name: 'Common', weight: 62, color: '#9dff6b', hits: 2, zone: 0.26, speed: 0.55, secs: 45, crystals: 2 },
  uncommon: { name: 'Uncommon', weight: 26, color: '#5cd6ff', hits: 3, zone: 0.2, speed: 0.7, secs: 120, crystals: 4 },
  rare: { name: 'Rare', weight: 9, color: '#b58cff', hits: 3, zone: 0.15, speed: 0.85, secs: 300, crystals: 8 },
  legendary: { name: 'Legendary', weight: 3, color: '#ffd166', hits: 4, zone: 0.12, speed: 1, secs: 900, crystals: 20 },
};

export const FISHING = {
  /** Most bait held, and minutes for each to refill. */
  baitMax: 5,
  baitMin: 12,
  /** Misses allowed while reeling before the line snaps. */
  slack: 2,
};

/** Fishing opens once the tutorial is done. */
export const fishingOpen = (s: GameState) => s.tutorial < 0;

/** Critters that can bite where the station is now. */
export function critterPool(s: GameState): Critter[] {
  return CRITTERS.filter((c) => (c.jumps ?? 0) <= s.stats.relocations + s.galaxy.shifts * 8 && (!c.shifted || s.galaxy.shifts > 0));
}

/** Tops up bait for the time that has passed. */
export function refillBait(s: GameState, now: number): void {
  const f = s.fishing;
  if (f.bait >= FISHING.baitMax) {
    f.baitAt = now;
    return;
  }
  const step = FISHING.baitMin * 60_000;
  const add = Math.floor((now - f.baitAt) / step);
  if (add <= 0) return;
  f.bait = Math.min(FISHING.baitMax, f.bait + add);
  f.baitAt = f.bait >= FISHING.baitMax ? now : f.baitAt + add * step;
}

/** Seconds until the next bait, or 0 when full. */
export function baitSecondsLeft(s: GameState, now: number): number {
  if (s.fishing.bait >= FISHING.baitMax) return 0;
  return Math.max(0, Math.ceil((s.fishing.baitAt + FISHING.baitMin * 60_000 - now) / 1000));
}

/** Picks what bites, weighted by rarity. `roll` is in [0, 1). */
export function pickCritter(s: GameState, roll: number): Critter {
  const pool = critterPool(s);
  const total = pool.reduce((n, c) => n + RARITY[c.rarity].weight / pool.filter((o) => o.rarity === c.rarity).length, 0);
  let r = roll * total;
  for (const c of pool) {
    r -= RARITY[c.rarity].weight / pool.filter((o) => o.rarity === c.rarity).length;
    if (r < 0) return c;
  }
  return pool[pool.length - 1];
}

/** Hooking a bite spends one bait. */
export function hook(s: GameState, now: number): boolean {
  refillBait(s, now);
  if (s.fishing.bait <= 0) return false;
  if (s.fishing.bait >= FISHING.baitMax) s.fishing.baitAt = now;
  s.fishing.bait--;
  s.fishing.casts++;
  return true;
}

export interface CatchReward {
  scrap: Decimal;
  crystals: number;
  first: boolean;
  surge: boolean;
}

/** What a catch is worth (without adding it). */
export function catchValue(s: GameState, c: Critter, now: number): Decimal {
  const secs = RARITY[c.rarity].secs;
  return Decimal_max(income(s, now).mul(secs), tapValue(s, now).mul(secs / 3), D(10));
}

const Decimal_max = (...xs: Decimal[]) => xs.reduce((a, b) => (b.gt(a) ? b : a));

/** Lands a catch: adds it to the book and pays out. */
export function landCatch(s: GameState, id: string, now: number): CatchReward | null {
  const c = CRITTERS.find((x) => x.id === id);
  if (!c) return null;
  const first = !s.fishing.caught[id];
  s.fishing.caught[id] = (s.fishing.caught[id] ?? 0) + 1;
  const scrap = catchValue(s, c, now);
  earn(s, scrap);
  const crystals = first ? RARITY[c.rarity].crystals : 0;
  if (crystals) addCrystals(s, crystals);
  const surge = c.rarity === 'legendary';
  if (surge) s.crateBuffs.surge = Math.max(s.crateBuffs.surge, now) + CRATE_BUFFS.surge.seconds * 1000;
  return { scrap, crystals, first, surge };
}

/** Kinds caught so far. */
export const speciesCaught = (s: GameState) => CRITTERS.filter((c) => s.fishing.caught[c.id]).length;

/** A reel in progress: where the marker is, given time since it began. Sweeps 0 → 1 → 0. */
export function markerAt(t: number, speed: number): number {
  const p = (t * speed) % 2;
  return p < 1 ? p : 2 - p;
}

const RANK: Record<Rarity, number> = { legendary: 0, rare: 1, uncommon: 2, common: 3 };

/** Who swims in the station's tank: the rarest kinds caught, up to five. */
export function tankCritters(s: GameState): Critter[] {
  return CRITTERS.filter((c) => s.fishing.caught[c.id])
    .sort((a, b) => RANK[a.rarity] - RANK[b.rarity])
    .slice(0, 5);
}
