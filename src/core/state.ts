import { GENERATORS, SAVE_VERSION, type GeneratorId } from './config';
import { D, Decimal } from './num';

export interface GameState {
  scrap: Decimal;
  /** Total scrap ever earned; will drive prestige later. */
  lifetime: Decimal;
  owned: Record<GeneratorId, number>;
  upgrades: Set<string>;
  taps: number;
  /** Epoch ms when the active boost ends (0 = none). */
  boostUntil: number;
  /** Epoch ms when the boost can be used again. */
  boostReadyAt: number;
  /** Epoch ms of the last save, used for offline earnings. */
  lastSeen: number;
  settings: { scientific: boolean; haptics: boolean; sound: boolean };
}

interface SaveData {
  v: number;
  scrap: string;
  lifetime: string;
  owned: Partial<Record<GeneratorId, number>>;
  upgrades: string[];
  taps: number;
  boostUntil: number;
  boostReadyAt: number;
  lastSeen: number;
  settings?: Partial<GameState['settings']>;
}

export function newState(now: number): GameState {
  const owned = {} as Record<GeneratorId, number>;
  for (const g of GENERATORS) owned[g.id] = 0;
  return {
    scrap: D(0),
    lifetime: D(0),
    owned,
    upgrades: new Set(),
    taps: 0,
    boostUntil: 0,
    boostReadyAt: 0,
    lastSeen: now,
    settings: { scientific: false, haptics: true, sound: true },
  };
}

export function serialize(state: GameState): string {
  const data: SaveData = {
    v: SAVE_VERSION,
    scrap: state.scrap.toString(),
    lifetime: state.lifetime.toString(),
    owned: { ...state.owned },
    upgrades: [...state.upgrades],
    taps: state.taps,
    boostUntil: state.boostUntil,
    boostReadyAt: state.boostReadyAt,
    lastSeen: state.lastSeen,
    settings: { ...state.settings },
  };
  return JSON.stringify(data);
}

/** Parses a save string. Returns null if it is missing or unreadable. */
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
  state.scrap = num(data.scrap);
  state.lifetime = num(data.lifetime);
  for (const g of GENERATORS) {
    const n = data.owned?.[g.id];
    state.owned[g.id] = typeof n === 'number' && n >= 0 ? Math.floor(n) : 0;
  }
  state.upgrades = new Set(Array.isArray(data.upgrades) ? data.upgrades.filter((u) => typeof u === 'string') : []);
  state.taps = data.taps | 0;
  state.boostUntil = Number(data.boostUntil) || 0;
  state.boostReadyAt = Number(data.boostReadyAt) || 0;
  state.lastSeen = Number(data.lastSeen) || now;
  state.settings = { ...state.settings, ...(data.settings ?? {}) };
  return state;
}
