import type { ResearchEffect } from './content';
import type { GameState } from './state';
import { FINALE_ID } from './story';

/*
 * Rebuild the Hollow Fleet: the endgame that opens once the Lantern has docked. Forty ships left
 * a dying sun; the station has been salvaging their wrecks ever since. Now Captain Vey wants the
 * eight that can still be saved rebuilt, one at a time, in a drydock beside the station.
 *
 * Hull plates pay for it. They come from boss wrecks, relocations and galaxy shifts, and every
 * ship rebuilt goes out on patrol and hauls more home while the player is away. Each ship joins
 * the fleet that circles the station and brings one permanent ability, which grows as it is
 * refitted up to rank 5. Nothing here resets: not on a relocation, not on a galaxy shift.
 *
 * Like galaxy.ts this file only reads the save, apart from the small actions at the bottom.
 */

export type ShipId = 'wren' | 'bellwether' | 'halcyon' | 'thimble' | 'corvid' | 'marigold' | 'anvil' | 'lullaby';

/** What a ship's ability does at a given rank. */
export type ShipPower =
  | { kind: 'crateRate'; per: number }
  | { kind: 'allMult'; per: number }
  | { kind: 'offlineMult'; per: number }
  | { kind: 'coreGain'; per: number }
  | { kind: 'boss'; per: number }
  | { kind: 'crewMult'; per: number }
  | { kind: 'costMult'; per: number }
  | { kind: 'starGain'; per: number };

export interface ShipDef {
  id: ShipId;
  name: string;
  /** What sort of ship it was, for the card. */
  role: string;
  /** One line of what Captain Vey remembers of it. */
  lore: string;
  /** Plates to rebuild it (rank 1); refits cost more. */
  plates: number;
  /** Hours in the drydock to rebuild it; refits take longer. */
  hours: number;
  power: ShipPower;
  /** The hull stripe and lights. */
  color: number;
  /** Shape of the hull for the painter (scene/art.ts fleetShip). */
  hull: { len: number; tall: number; nose: 'round' | 'sharp' | 'blunt'; fins: number; decks: number; dome?: boolean; mast?: boolean };
}

export const FLEET = {
  maxRank: 5,
  /** Plates Captain Vey hands over when the drydock opens: enough for the first ship. */
  welcomePlates: 12,
  /** Plates per boss wreck broken, per relocation, and per Galaxy Star gained in a shift. */
  bossPlates: 2,
  relocatePlates: 3,
  starPlates: 4,
  minShiftPlates: 10,
  /** Each rank in the fleet hauls one plate home per this many hours on patrol. */
  patrolHours: 6,
  /** Patrol hauls stop piling up after this long uncollected. */
  patrolCapHours: 24,
  /** A refit to rank r+1 costs plates x refitCost^r and takes hours x (1 + r/2). */
  refitCost: 1.8,
};

export const SHIPS: readonly ShipDef[] = [
  {
    id: 'wren', name: 'Wren', role: 'Scout cutter', plates: 10, hours: 1, color: 0x5ce1ff,
    lore: 'The fleet’s eyes. She always found the next cargo drift first.',
    power: { kind: 'crateRate', per: 0.25 },
    hull: { len: 54, tall: 16, nose: 'sharp', fins: 2, decks: 1 },
  },
  {
    id: 'bellwether', name: 'Bellwether', role: 'Bulk freighter', plates: 20, hours: 2, color: 0xffb547,
    lore: 'Slow, wide and stubborn. Carried half the fleet’s supplies.',
    power: { kind: 'allMult', per: 1 },
    hull: { len: 84, tall: 26, nose: 'blunt', fins: 1, decks: 2 },
  },
  {
    id: 'halcyon', name: 'Halcyon', role: 'Hospital ship', plates: 30, hours: 3, color: 0xff8fa8,
    lore: 'Its wards were always lit. Nobody slept badly aboard the Halcyon.',
    power: { kind: 'offlineMult', per: 0.5 },
    hull: { len: 70, tall: 24, nose: 'round', fins: 2, decks: 2, dome: true },
  },
  {
    id: 'thimble', name: 'Thimble', role: 'Tug', plates: 45, hours: 4, color: 0x9dff6b,
    lore: 'Tiny, with engines twice her size. She towed the Lantern out of a storm once.',
    power: { kind: 'coreGain', per: 0.25 },
    hull: { len: 46, tall: 22, nose: 'blunt', fins: 3, decks: 1 },
  },
  {
    id: 'corvid', name: 'Corvid', role: 'Escort', plates: 60, hours: 6, color: 0xff5d6c,
    lore: 'Kept the raiders off. Her crew still argue about who flew her best.',
    power: { kind: 'boss', per: 0.5 },
    hull: { len: 66, tall: 18, nose: 'sharp', fins: 4, decks: 1, mast: true },
  },
  {
    id: 'marigold', name: 'Marigold', role: 'Garden ship', plates: 80, hours: 8, color: 0xffd166,
    lore: 'Fed forty ships for three hundred years. The orchards are still in her hold.',
    power: { kind: 'crewMult', per: 0.2 },
    hull: { len: 78, tall: 28, nose: 'round', fins: 1, decks: 1, dome: true },
  },
  {
    id: 'anvil', name: 'Anvil', role: 'Forge ship', plates: 110, hours: 10, color: 0xc58cff,
    lore: 'A foundry with engines. Every other ship in the fleet was mended in her bays.',
    power: { kind: 'costMult', per: 0.15 },
    hull: { len: 88, tall: 30, nose: 'blunt', fins: 2, decks: 3, mast: true },
  },
  {
    id: 'lullaby', name: 'Lullaby', role: 'Sleeper liner', plates: 150, hours: 12, color: 0x8f7bff,
    lore: 'Ten thousand sleepers dreamed here. They will wake to a fleet again.',
    power: { kind: 'starGain', per: 0.2 },
    hull: { len: 96, tall: 26, nose: 'round', fins: 2, decks: 3, dome: true },
  },
];

export const shipDef = (id: string) => SHIPS.find((s) => s.id === id);

/** The drydock opens once the Lantern has docked, at the end of the Hollow Fleet story. */
export function fleetOpen(state: GameState): boolean {
  return state.story.heard.has(FINALE_ID);
}

export const shipRank = (state: GameState, id: ShipId): number => state.fleet.ranks[id] ?? 0;

/** Ships rebuilt so far, in fleet order. */
export function shipsBuilt(state: GameState): ShipDef[] {
  return SHIPS.filter((s) => shipRank(state, s.id) > 0);
}

/** Total ranks across the fleet. */
export function fleetRanks(state: GameState): number {
  return SHIPS.reduce((n, s) => n + shipRank(state, s.id), 0);
}

/** Plates and hours for the next job on a ship (rebuild at rank 0, refit after). */
export function jobCost(def: ShipDef, rank: number): { plates: number; hours: number } {
  return { plates: Math.round(def.plates * FLEET.refitCost ** rank), hours: def.hours * (1 + rank / 2) };
}

/** The ability's strength at a rank, as a multiplier (or +fraction for boss damage). */
export function powerAt(p: ShipPower, rank: number): number {
  if (rank <= 0) return p.kind === 'boss' ? 0 : 1;
  switch (p.kind) {
    case 'costMult':
      return (1 - p.per) ** rank;
    case 'boss':
      return p.per * rank;
    default:
      return 1 + p.per * rank;
  }
}

/** The ability in words, at a rank. */
export function powerText(p: ShipPower, rank: number): string {
  const r = Math.max(1, rank);
  const m = powerAt(p, r);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  switch (p.kind) {
    case 'crateRate':
      return `Salvage crates drift by ${pct(m - 1)} more often.`;
    case 'allMult':
      return `Everything produces ${m}x.`;
    case 'offlineMult':
      return `Time away earns ${pct(m - 1)} more.`;
    case 'coreGain':
      return `Relocating gives ${pct(m - 1)} more Star Cores.`;
    case 'boss':
      return `+${pct(m)} damage to boss wrecks.`;
    case 'crewMult':
      return `Crew bonuses ${pct(m - 1)} stronger.`;
    case 'costMult':
      return `Machines cost ${pct(1 - m)} less.`;
    case 'starGain':
      return `Galaxy Shifts give ${pct(m - 1)} more stars.`;
  }
}

/** The fleet's abilities that work like research (the economy folds these in). */
export function fleetEffects(state: GameState): ResearchEffect[] {
  const out: ResearchEffect[] = [];
  for (const s of SHIPS) {
    const r = shipRank(state, s.id);
    if (r <= 0) continue;
    const p = s.power;
    if (p.kind === 'crateRate' || p.kind === 'allMult' || p.kind === 'offlineMult' || p.kind === 'crewMult' || p.kind === 'costMult') out.push({ kind: p.kind, mult: powerAt(p, r) });
  }
  return out;
}

/** One of the fleet's own multipliers (coreGain, starGain), or the boss damage it adds. */
export function fleetPower(state: GameState, kind: 'coreGain' | 'starGain' | 'boss'): number {
  let m = kind === 'boss' ? 0 : 1;
  for (const s of SHIPS) {
    if (s.power.kind !== kind) continue;
    const v = powerAt(s.power, shipRank(state, s.id));
    m = kind === 'boss' ? m + v : m * v;
  }
  return m;
}

/** Plates per hour the patrol brings home. */
export function patrolRate(state: GameState): number {
  return fleetRanks(state) / FLEET.patrolHours;
}

/** Whole plates the patrol has hauled since it was last collected. */
export function patrolHaul(state: GameState, now: number): number {
  const hours = Math.min(FLEET.patrolCapHours, Math.max(0, now - state.fleet.patrolAt) / 3_600_000);
  return Math.floor(hours * patrolRate(state) + 1e-9);
}

/** Whether the patrol has filled up and stopped hauling. */
export function patrolFull(state: GameState, now: number): boolean {
  return patrolRate(state) > 0 && now - state.fleet.patrolAt >= FLEET.patrolCapHours * 3_600_000;
}

/** Seconds left on the drydock job, 0 if none or done. */
export function jobSecondsLeft(state: GameState, now: number): number {
  const j = state.fleet.job;
  return j ? Math.max(0, (j.endsAt - now) / 1000) : 0;
}

// ---------- Actions ----------

/** Opens the drydock the first time the fleet is open: Vey's welcome plates. Returns true once. */
export function welcomeFleet(state: GameState, now: number): boolean {
  if (!fleetOpen(state) || state.fleet.welcomed) return false;
  state.fleet.welcomed = true;
  state.fleet.plates += FLEET.welcomePlates;
  state.fleet.patrolAt = now;
  return true;
}

/** Adds plates, only once the fleet is open. Returns what was added. */
export function addPlates(state: GameState, n: number): number {
  if (!fleetOpen(state) || !state.fleet.welcomed || n <= 0) return 0;
  state.fleet.plates += n;
  state.fleet.earned += n;
  return n;
}

/** Plates a galaxy shift for this many stars brings. */
export function shiftPlates(stars: number): number {
  return Math.max(FLEET.minShiftPlates, stars * FLEET.starPlates);
}

/** Starts a rebuild or refit in the drydock, if it is free and the plates are there. */
export function startJob(state: GameState, id: ShipId, now: number): boolean {
  const def = shipDef(id);
  const f = state.fleet;
  if (!def || !fleetOpen(state) || f.job) return false;
  const rank = shipRank(state, id);
  if (rank >= FLEET.maxRank) return false;
  // Ships are rebuilt in fleet order: the next hull is the one after the last one rebuilt.
  if (rank === 0 && SHIPS.findIndex((s) => s.id === id) > shipsBuilt(state).length) return false;
  const cost = jobCost(def, rank);
  if (f.plates < cost.plates) return false;
  f.plates -= cost.plates;
  f.job = { ship: id, endsAt: now + cost.hours * 3_600_000 };
  return true;
}

/** Finishes the drydock job once its time is up: the ship launches (or gains a rank). Returns it. */
export function finishJob(state: GameState, now: number): { id: ShipId; rank: number } | null {
  const j = state.fleet.job;
  if (!j || now < j.endsAt) return null;
  const id = j.ship;
  state.fleet.job = null;
  // A ship joining the patrol starts hauling from now, without back pay for time it wasn't out.
  if (fleetRanks(state) === 0) state.fleet.patrolAt = now;
  else {
    // Bank what the old patrol earned so the new rate doesn't reach back in time.
    const hauled = patrolHaul(state, now);
    state.fleet.plates += hauled;
    state.fleet.earned += hauled;
    state.fleet.patrolAt = now;
  }
  state.fleet.ranks[id] = shipRank(state, id) + 1;
  return { id, rank: state.fleet.ranks[id]! };
}

/** Brings the patrol's haul aboard. Returns the plates collected. */
export function collectPatrol(state: GameState, now: number): number {
  const n = patrolHaul(state, now);
  if (n <= 0) return 0;
  const rate = patrolRate(state);
  // Keep the part-made plate: move the clock on by exactly the time those plates took.
  const capped = now - state.fleet.patrolAt >= FLEET.patrolCapHours * 3_600_000;
  state.fleet.patrolAt = capped ? now : state.fleet.patrolAt + (n / rate) * 3_600_000;
  state.fleet.plates += n;
  state.fleet.earned += n;
  return n;
}
