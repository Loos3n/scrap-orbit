import { GENERATORS, SAVE_VERSION, type GeneratorId } from './config';
import { CREW, PETS, TUTORIAL, type CrewId, type EventKind, type MissionKind, type PetId, type TutorialStep } from './content';
import { CHALLENGES, GRID, LOOT, MODULES, TRIPS, TRIP_SLOTS, type Offer, type Trip } from './expansion';
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
  /** Daily login streak: the last day visited, the run of days, and the last day claimed. */
  login: { day: string; streak: number; claimed: string; best: number };
  pets: { owned: Set<PetId>; active: PetId | null };
  /** The boss wreck on screen, if any. `name` indexes BOSS_NAMES; hp values are Decimal strings. */
  boss: { name: number; hp: string; max: string; endsAt: number; reward?: string } | null;
  nextBossAt: number;
  /** Station module grid, row by row: a module id or null for an empty slot. */
  modules: (string | null)[];
  /** Crystals paid for the module in each slot, refunded in full when it comes down. */
  modulePaid: number[];
  /** Module blueprints found on expeditions. */
  blueprints: Set<string>;
  /** Crew away on expeditions. */
  trips: Trip[];
  /** Boss loot found, and bosses beaten since the last drop. */
  loot: Set<string>;
  lootMiss: number;
  /** The skin each pet wears (a loot id), if any. */
  skins: Partial<Record<PetId, string>>;
  /** Golden scrap: the rush ends at `until`; the next crate is due at `nextAt`. */
  golden: { until: number; nextAt: number };
  /** The trading post: docked until `until` with these offers; the next visit is due at `nextAt`. */
  trader: { until: number; nextAt: number; name: number; offers: Offer[] };
  /** The challenge run in progress, if any, and the ones already beaten. */
  challenge: string | null;
  challengesDone: Set<string>;
  /** When the last event, boss, golden crate or trader began, to keep calm time between them. */
  lastHappening: number;
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
    bosses: number;
    golden?: number;
    trades?: number;
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
  login?: GameState['login'];
  pets?: { owned?: string[]; active?: string | null };
  boss?: GameState['boss'];
  nextBossAt?: number;
  modules?: (string | null)[];
  modulePaid?: number[];
  blueprints?: string[];
  trips?: Trip[];
  loot?: string[];
  lootMiss?: number;
  skins?: Partial<Record<PetId, string>>;
  golden?: GameState['golden'];
  trader?: GameState['trader'];
  challenge?: string | null;
  challengesDone?: string[];
  lastHappening?: number;
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
    login: { day: '', streak: 0, claimed: '', best: 0 },
    pets: { owned: new Set(), active: null },
    boss: null,
    nextBossAt: 0,
    modules: Array(GRID * GRID).fill(null),
    modulePaid: Array(GRID * GRID).fill(0),
    blueprints: new Set(),
    trips: [],
    loot: new Set(),
    lootMiss: 0,
    skins: {},
    golden: { until: 0, nextAt: 0 },
    trader: { until: 0, nextAt: 0, name: 0, offers: [] },
    challenge: null,
    challengesDone: new Set(),
    lastHappening: 0,
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
      bosses: 0,
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
    login: { ...state.login },
    pets: { owned: [...state.pets.owned], active: state.pets.active },
    boss: state.boss,
    nextBossAt: state.nextBossAt,
    modules: [...state.modules],
    modulePaid: [...state.modulePaid],
    blueprints: [...state.blueprints],
    trips: state.trips.map((t) => ({ ...t })),
    loot: [...state.loot],
    lootMiss: state.lootMiss,
    skins: { ...state.skins },
    golden: { ...state.golden },
    trader: { ...state.trader, offers: state.trader.offers.map((o) => ({ ...o })) },
    challenge: state.challenge,
    challengesDone: [...state.challengesDone],
    lastHappening: state.lastHappening,
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
  if (data.login && typeof data.login.day === 'string') state.login = { ...state.login, ...data.login };
  const petIds = new Set<string>(PETS.map((p) => p.id));
  for (const id of strings(data.pets?.owned)) if (petIds.has(id)) state.pets.owned.add(id as PetId);
  const pet = data.pets?.active;
  state.pets.active = typeof pet === 'string' && state.pets.owned.has(pet as PetId) ? (pet as PetId) : null;
  state.boss = data.boss && typeof data.boss.endsAt === 'number' ? data.boss : null;
  state.nextBossAt = Number(data.nextBossAt) || 0;
  const moduleIds = new Set<string>(MODULES.map((m) => m.id));
  if (Array.isArray(data.modules)) state.modules = state.modules.map((_, i) => (moduleIds.has(data.modules![i] ?? '') ? data.modules![i] : null));
  // Only one of each limited room (the reactor) survives a hand-edited or glitched save.
  for (const m of MODULES) {
    if (!m.max) continue;
    let seen = 0;
    state.modules = state.modules.map((id) => (id === m.id && ++seen > m.max! ? null : id));
  }
  // Saves from before refunds were tracked get back each room's base price.
  state.modulePaid = state.modules.map((id, i) => {
    const paid = Array.isArray(data.modulePaid) ? Number(data.modulePaid[i]) : NaN;
    return id ? (Number.isFinite(paid) && paid >= 0 ? Math.floor(paid) : MODULES.find((m) => m.id === id)!.cost) : 0;
  });
  for (const id of strings(data.blueprints)) if (moduleIds.has(id)) state.blueprints.add(id);
  const tripIds = new Set(TRIPS.map((t) => t.id));
  if (Array.isArray(data.trips)) {
    // Each crew member can be on one trip, only recruited crew can go, and only so many at once.
    const going = new Set<string>();
    state.trips = data.trips
      .filter((t) => {
        const ok = t && CREW.some((c) => c.id === t.crew) && state.crew[t.crew] > 0 && !going.has(t.crew) && tripIds.has(t.dest) && Number.isFinite(t.endsAt);
        if (ok) going.add(t.crew);
        return ok;
      })
      .slice(0, TRIP_SLOTS)
      .map((t) => ({ crew: t.crew, dest: t.dest, endsAt: t.endsAt }));
  }
  const lootIds = new Set(LOOT.map((l) => l.id));
  for (const id of strings(data.loot)) if (lootIds.has(id)) state.loot.add(id);
  state.lootMiss = int(data.lootMiss);
  for (const p of PETS) {
    const skin = data.skins?.[p.id];
    if (typeof skin === 'string' && state.loot.has(skin)) state.skins[p.id] = skin;
  }
  if (data.golden) state.golden = { until: Number(data.golden.until) || 0, nextAt: Number(data.golden.nextAt) || 0 };
  const t = data.trader;
  if (t && typeof t === 'object') {
    const kinds = new Set(['crystals', 'scrap', 'blueprint', 'recall', 'loot']);
    state.trader = {
      until: Number(t.until) || 0,
      nextAt: Number(t.nextAt) || 0,
      name: int(t.name),
      offers: Array.isArray(t.offers)
        ? t.offers
            .filter((o) => o && kinds.has(o.kind) && (o.pay === 'scrap' || o.pay === 'crystals'))
            .slice(0, 4)
            .map((o) => ({ kind: o.kind, pay: o.pay, price: num(o.price).toString(), amount: num(o.amount).toString(), bought: !!o.bought }))
        : [],
    };
  }
  const challengeIds = new Set(CHALLENGES.map((c) => c.id));
  for (const id of strings(data.challengesDone)) if (challengeIds.has(id)) state.challengesDone.add(id);
  state.challenge = typeof data.challenge === 'string' && challengeIds.has(data.challenge) && !state.challengesDone.has(data.challenge) ? data.challenge : null;
  state.lastHappening = Number(data.lastHappening) || 0;
  state.stats = { ...state.stats, ...(data.stats ?? {}) };
  state.boostUntil = Number(data.boostUntil) || 0;
  state.boostReadyAt = Number(data.boostReadyAt) || 0;
  state.lastSeen = Number(data.lastSeen) || now;
  const { scientific, ...settings } = data.settings ?? {};
  state.settings = { ...state.settings, ...settings };
  if (scientific && !settings.numbers) state.settings.numbers = 'scientific';
  return state;
}
