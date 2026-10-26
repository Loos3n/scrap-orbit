import { GENERATORS, SAVE_VERSION, type GeneratorId } from './config';
import { CREW, TUTORIAL, type CrewId, type EventKind, type MissionKind, type TutorialStep } from './content';
import { D, Decimal, type NumberStyle } from './num';

export interface Mission {
  kind: MissionKind;
  tier: 0 | 1 | 2;
  /** Target amount (a Decimal string for 'earn'). */
  target: string;
  /** The counter's value when the mission was handed out. */
  base: string;
  claimed: boolean;
}

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
  /** Salvage Claw level, bought with scrap; resets on relocation. */
  claw: number;
  /** Soft currency for crew, research rushes and decorations. */
  crystals: number;
  /** Crew level by id; 0 means not recruited. */
  crew: Record<CrewId, number>;
  research: { done: Set<string>; active: { id: string; endsAt: number } | null };
  decor: { owned: Set<string>; theme: string; paint: string };
  missions: { day: string; daily: Mission[]; week: string; weekly: Mission | null };
  event: { kind: EventKind; endsAt: number } | null;
  nextEventAt: number;
  /** Tutorial step; -1 when finished. */
  tutorial: number;
  /** One-time tips the player has already seen (after the tutorial). */
  tips: Set<string>;
  stats: {
    crates: number;
    boosts: number;
    relocations: number;
    machines: number;
    upgradesBought: number;
    meteors: number;
    crystalsEarned: number;
    playSec: number;
    runSec: number;
    bestIncome: string;
    events: number;
  };
  /** Epoch ms when the active boost ends (0 = none). */
  boostUntil: number;
  /** Epoch ms when the boost can be used again. */
  boostReadyAt: number;
  /** Epoch ms of the last save, used for offline earnings. */
  lastSeen: number;
  settings: { numbers: NumberStyle; haptics: boolean; sound: boolean; music: boolean; autoBuy: boolean };
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
  claw?: number;
  crystals?: number;
  crew?: Partial<Record<CrewId, number>>;
  research?: { done?: string[]; active?: { id: string; endsAt: number } | null };
  decor?: { owned?: string[]; theme?: string; paint?: string };
  missions?: GameState['missions'];
  event?: GameState['event'];
  nextEventAt?: number;
  tutorial?: number;
  tut?: string;
  tips?: string[];
  stats?: Partial<GameState['stats']>;
  boostUntil: number;
  boostReadyAt: number;
  lastSeen: number;
  settings?: Partial<GameState['settings']> & { scientific?: boolean };
}

export function emptyOwned(): Record<GeneratorId, number> {
  const owned = {} as Record<GeneratorId, number>;
  for (const g of GENERATORS) owned[g.id] = 0;
  return owned;
}

export function emptyCrew(): Record<CrewId, number> {
  const crew = {} as Record<CrewId, number>;
  for (const c of CREW) crew[c.id] = 0;
  return crew;
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
    claw: 0,
    crystals: 0,
    crew: emptyCrew(),
    research: { done: new Set(), active: null },
    decor: { owned: new Set(['classic', 'standard']), theme: 'classic', paint: 'standard' },
    missions: { day: '', daily: [], week: '', weekly: null },
    event: null,
    nextEventAt: 0,
    tutorial: 0,
    tips: new Set(),
    stats: {
      crates: 0,
      boosts: 0,
      relocations: 0,
      machines: 0,
      upgradesBought: 0,
      meteors: 0,
      crystalsEarned: 0,
      playSec: 0,
      runSec: 0,
      bestIncome: '0',
      events: 0,
    },
    boostUntil: 0,
    boostReadyAt: 0,
    lastSeen: now,
    settings: { numbers: 'letters', haptics: true, sound: true, music: true, autoBuy: true },
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
    claw: state.claw,
    crystals: state.crystals,
    crew: { ...state.crew },
    research: { done: [...state.research.done], active: state.research.active },
    decor: { owned: [...state.decor.owned], theme: state.decor.theme, paint: state.decor.paint },
    missions: state.missions,
    event: state.event,
    nextEventAt: state.nextEventAt,
    tutorial: state.tutorial,
    tut: state.tutorial >= 0 ? TUTORIAL[state.tutorial] : undefined,
    tips: [...state.tips],
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
  const int = (n: unknown) => Math.max(0, Math.floor(Number(n) || 0));
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
  state.cores = int(data.cores);
  state.achievements = new Set(strings(data.achievements));
  state.taps = int(data.taps);
  state.claw = int(data.claw);
  state.crystals = int(data.crystals);
  for (const c of CREW) state.crew[c.id] = Math.min(5, int(data.crew?.[c.id]));
  state.research.done = new Set(strings(data.research?.done));
  const active = data.research?.active;
  state.research.active = active && typeof active.id === 'string' ? { id: active.id, endsAt: Number(active.endsAt) || now } : null;
  for (const id of strings(data.decor?.owned)) state.decor.owned.add(id);
  if (data.decor?.theme && state.decor.owned.has(data.decor.theme)) state.decor.theme = data.decor.theme;
  if (data.decor?.paint && state.decor.owned.has(data.decor.paint)) state.decor.paint = data.decor.paint;
  if (data.missions && Array.isArray(data.missions.daily)) state.missions = data.missions;
  state.event = data.event && typeof data.event.endsAt === 'number' ? data.event : null;
  state.nextEventAt = Number(data.nextEventAt) || 0;
  // Players from before the tutorial existed already know the basics. Saves from before the
  // tutorial was reworked store only a step number, so those restart it from the welcome.
  const tut = TUTORIAL.indexOf(data.tut as TutorialStep);
  if (tut >= 0) state.tutorial = tut;
  else if (typeof data.tutorial === 'number') state.tutorial = data.tutorial < 0 ? -1 : 0;
  else state.tutorial = state.allTime.gt(0) ? -1 : 0;
  for (const id of strings(data.tips)) state.tips.add(id);
  state.stats = { ...state.stats, ...(data.stats ?? {}) };
  state.boostUntil = Number(data.boostUntil) || 0;
  state.boostReadyAt = Number(data.boostReadyAt) || 0;
  state.lastSeen = Number(data.lastSeen) || now;
  const { scientific, ...settings } = data.settings ?? {};
  state.settings = { ...state.settings, ...settings };
  if (scientific && !settings.numbers) state.settings.numbers = 'scientific';
  return state;
}
