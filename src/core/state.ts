import { GENERATORS, SAVE_VERSION, type GeneratorId } from './config';
import { D, Decimal } from './num';

export interface GameState {
  scrap: Decimal;
  /** Scrap earned this run; resets when the station relocates. */
  lifetime: Decimal;
  /** Scrap earned across every run; drives Star Cores. */
  allTime: Decimal;
  owned: Record<GeneratorId, number>;
  upgrades: Set<string>;
  /** Star Cores held (they are never spent). */
  cores: number;
  achievements: Set<string>;
  taps: number;
  stats: { crates: number; boosts: number; relocations: number };
  /** Epoch ms when the active boost ends (0 = none). */
  boostUntil: number;
  /** Epoch ms when the boost can be used again. */
  boostReadyAt: number;
  /** Epoch ms of the last save, used for offline earnings. */
  lastSeen: number;
  settings: { scientific: boolean; haptics: boolean; sound: boolean; autoBuy: boolean };
}

interface SaveData {
  v: number;
  scrap: string;
  lifetime: string;
  allTime?: string;
  owned: Partial<Record<GeneratorId, number>>;
  upgrades: string[];
  cores?: number;
  achievements?: string[];
  taps: number;
  stats?: Partial<GameState['stats']>;
  boostUntil: number;
  boostReadyAt: number;
  lastSeen: number;
  settings?: Partial<GameState['settings']>;
}

export function emptyOwned(): Record<GeneratorId, number> {
  const owned = {} as Record<GeneratorId, number>;
  for (const g of GENERATORS) owned[g.id] = 0;
  return owned;
}

export function newState(now: number): GameState {
  return {
    scrap: D(0),
    lifetime: D(0),
    allTime: D(0),
    owned: emptyOwned(),
    upgrades: new Set(),
    cores: 0,
    achievements: new Set(),
    taps: 0,
    stats: { crates: 0, boosts: 0, relocations: 0 },
    boostUntil: 0,
    boostReadyAt: 0,
    lastSeen: now,
    settings: { scientific: false, haptics: true, sound: true, autoBuy: true },
  };
}

export function serialize(state: GameState): string {
  const data: SaveData = {
    v: SAVE_VERSION,
    scrap: state.scrap.toString(),
    lifetime: state.lifetime.toString(),
    allTime: state.allTime.toString(),
    owned: { ...state.owned },
    upgrades: [...state.upgrades],
    cores: state.cores,
    achievements: [...state.achievements],
    taps: state.taps,
    stats: { ...state.stats },
    boostUntil: state.boostUntil,
    boostReadyAt: state.boostReadyAt,
    lastSeen: state.lastSeen,
    settings: { ...state.settings },
  };
  return JSON.stringify(data);
}

/** Parses a save string, upgrading older versions. Returns null if it is missing or unreadable. */
export function deserialize(json: string | null, now: number): GameState | null {
  if (!json) return null;
  let data: SaveData;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || typeof data.v !== 'number') return null;
  const state = newState(now);
  const num = (s: unknown) => {
    const d = typeof s === 'string' ? D(s) : D(0);
    return Number.isFinite(d.m) && Number.isFinite(d.e) ? d : D(0);
  };
  const strings = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []);
  state.scrap = num(data.scrap);
  state.lifetime = num(data.lifetime);
  // Version 1 saves had no all-time total; their one run is all there was.
  state.allTime = data.allTime ? num(data.allTime) : state.lifetime;
  for (const g of GENERATORS) {
    const n = data.owned?.[g.id];
    state.owned[g.id] = typeof n === 'number' && n >= 0 ? Math.floor(n) : 0;
  }
  state.upgrades = new Set(strings(data.upgrades));
  state.cores = Math.max(0, Math.floor(Number(data.cores) || 0));
  state.achievements = new Set(strings(data.achievements));
  state.taps = data.taps | 0;
  state.stats = { ...state.stats, ...(data.stats ?? {}) };
  state.boostUntil = Number(data.boostUntil) || 0;
  state.boostReadyAt = Number(data.boostReadyAt) || 0;
  state.lastSeen = Number(data.lastSeen) || now;
  state.settings = { ...state.settings, ...(data.settings ?? {}) };
  return state;
}
