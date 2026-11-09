import { GENERATORS, SAVE_VERSION, type GeneratorId } from './config';
import { BOSS_NAMES, CREW, PETS, SECTORS, TUTORIAL, type CrewId, type EventKind, type MissionKind, type PetId, type TutorialStep } from './content';
import { CHALLENGES, GRID, LOOT, MODULES, TRIPS, TRIP_SLOTS, type Offer, type Trip } from './expansion';
import { SAFE_TYPES, SETS, SKINS, skinUnlocked } from './collection';
import { ORNAMENTS } from './ornaments';
import { FRIEND_LIMIT, cleanName, normalizeCode, type Friend } from './friends';
import { STAR_NODES } from './galaxy';
import { CONTRACTS, type ActiveContract, type ContractOffer } from './contracts';
import { STORY } from './story';
import { FESTIVAL_SHOP } from './festival';
import { CRITTERS, FISHING } from './fishing';
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
  /** This week's event (core/weekly.ts): which week, which event, its counter at the start, tiers claimed. */
  weekly: { week: string; id: string; start: number; claimed: number };
  /** Samples for the Stats graphs (core/history.ts). */
  history: { income: { t: number; log: number }[]; runs: { t: number; sector: number; minutes: number; cores: number }[] };
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
  /** Lucky crate buffs: each ends at this epoch ms (0 = off). */
  crateBuffs: { surge: number; frenzy: number };
  /** Rewarded ads watched today, by kind (core/rewards.ts); `day` is the local date. */
  ads: { day: string; used: Record<string, number> };
  /** The trading post: docked until `until` with these offers; the next visit is due at `nextAt`. */
  trader: { until: number; nextAt: number; name: number; offers: Offer[] };
  /** The challenge run in progress, if any, and the ones already beaten. */
  challenge: string | null;
  /**
   * Galaxy Shift: stars ever earned and still to spend, shifts made, all-time scrap when the
   * current galaxy began (cores count from there), the most cores held before a shift, and the
   * Star Map nodes bought.
   */
  galaxy: { earned: number; stars: number; shifts: number; base: Decimal; bestCores: number; map: Set<string>; forge: number };
  /** The running challenge's goal, fixed when it started. */
  challengeGoal: Decimal;
  /** This run's contract (core/contracts.ts), the three on offer after a relocation, and how many were ever met. */
  contract: ActiveContract | null;
  contractOffers: ContractOffer[];
  contractsDone: number;
  challengesDone: Set<string>;
  /** When the last event, boss, golden crate, trader or cargo pod began, to keep calm time between them. */
  lastHappening: number;
  /** A locked cargo pod: waiting until `until`, the next due at `nextAt`, and the one being cracked. */
  safe: { until: number; nextAt: number; type: string; open: string | null };
  /** Collection book entries found (bosses, sectors, machines, safes), sets finished, and the station skin worn. */
  collection: Set<string>;
  setsDone: Set<string>;
  skin: string | null;
  /** Station decorations earned, and the ones up on the station. */
  ornaments: { got: Set<string>; on: Set<string> };
  /** Whether this sector's rig is built; it stays behind on a relocation. */
  rig: boolean;
  /** Radio transmissions heard, in the Hollow Fleet story (core/story.ts). */
  story: { heard: Set<string> };
  /**
   * The Frost Festival (core/festival.ts): snowflakes to spend, shop items bought once, when hot
   * cocoa wears off, the last day a present was opened, and a switch to try it out early.
   */
  festival: { flakes: number; bought: Set<string>; cocoaUntil: number; day: string; test: boolean };
  /** Space fishing (core/fishing.ts): bait held and when it last refilled, catches by kind, and lines cast. */
  fishing: { bait: number; baitAt: number; caught: Record<string, number>; casts: number };
  /**
   * Friend codes (core/friends.ts): this player's own code and station name once signed in,
   * friends added, who got a gift today, and today's gift counters.
   */
  friends: { mine: string; name: string; list: Friend[]; sent: Record<string, string>; day: string; opened: number; sentRewards: number };
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
    safes?: number;
    stars?: number;
    /** Crates that opened into something other than plain scrap. */
    surprises?: number;
    /** Optional rewarded ads watched (core/rewards.ts). */
    adsWatched?: number;
  };
  /** Epoch ms when the active boost ends (0 = none). */
  boostUntil: number;
  /** Epoch ms when the boost can be used again. */
  boostReadyAt: number;
  /** Epoch ms of the last save, used for offline earnings. */
  lastSeen: number;
  /**
   * Player settings. `sound` and `music` mirror whether each volume (0 to 1) is above zero;
   * the comfort options calm down flashes and screen shake.
   */
  settings: {
    numbers: NumberStyle;
    haptics: boolean;
    sound: boolean;
    music: boolean;
    sfxVol: number;
    musicVol: number;
    reduceFlash: boolean;
    reduceShake: boolean;
    autoBuy: boolean;
    /** How far the player has pinched the station view in (1 = normal). */
    viewZoom: number;
    /** Battery saver: 30 frames a second, lower resolution, no soft-focus blur. */
    batterySaver: boolean;
    /** Phone reminders in the Android app (storage full, research done, crew home). */
    notifications: boolean;
    /** Offers to watch an optional ad for a bonus (core/rewards.ts). */
    adOffers: boolean;
    /** Day and night follow the device clock (core/daynight.ts); off keeps it always day. */
    dayNight: boolean;
  };
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
  weekly?: GameState['weekly'];
  history?: GameState['history'];
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
  crateBuffs?: Partial<GameState['crateBuffs']>;
  ads?: { day?: string; used?: Record<string, number> };
  trader?: GameState['trader'];
  challenge?: string | null;
  challengeGoal?: string;
  contract?: ActiveContract | null;
  contractOffers?: ContractOffer[];
  contractsDone?: number;
  galaxy?: { earned?: number; stars?: number; shifts?: number; base?: string; bestCores?: number; map?: string[]; forge?: number };
  challengesDone?: string[];
  lastHappening?: number;
  safe?: GameState['safe'];
  collection?: string[];
  setsDone?: string[];
  skin?: string | null;
  ornaments?: { got?: string[]; on?: string[] };
  story?: { heard?: string[] };
  festival?: { flakes?: number; bought?: string[]; cocoaUntil?: number; day?: string; test?: boolean };
  fishing?: { bait?: number; baitAt?: number; caught?: Record<string, number>; casts?: number };
  rig?: boolean;
  friends?: Partial<GameState['friends']>;
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
    weekly: { week: '', id: '', start: 0, claimed: 0 },
    history: { income: [], runs: [] },
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
    crateBuffs: { surge: 0, frenzy: 0 },
    ads: { day: '', used: {} },
    trader: { until: 0, nextAt: 0, name: 0, offers: [] },
    challenge: null,
    challengeGoal: D(0),
    contract: null,
    contractOffers: [],
    contractsDone: 0,
    galaxy: { earned: 0, stars: 0, shifts: 0, base: D(0), bestCores: 0, map: new Set(), forge: 0 },
    challengesDone: new Set(),
    lastHappening: 0,
    safe: { until: 0, nextAt: 0, type: 'supply', open: null },
    collection: new Set(),
    setsDone: new Set(),
    skin: null,
    ornaments: { got: new Set(), on: new Set() },
    story: { heard: new Set() },
    festival: { flakes: 0, bought: new Set(), cocoaUntil: 0, day: '', test: false },
    fishing: { bait: FISHING.baitMax, baitAt: now, caught: {}, casts: 0 },
    rig: false,
    friends: { mine: '', name: '', list: [], sent: {}, day: '', opened: 0, sentRewards: 0 },
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
    settings: { numbers: 'letters', haptics: true, sound: true, music: true, sfxVol: 0.8, musicVol: 0.6, reduceFlash: false, reduceShake: false, autoBuy: true, viewZoom: 1, batterySaver: false, notifications: true, adOffers: true, dayNight: true },
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
    weekly: state.weekly,
    history: state.history,
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
    crateBuffs: { ...state.crateBuffs },
    ads: { day: state.ads.day, used: { ...state.ads.used } },
    trader: { ...state.trader, offers: state.trader.offers.map((o) => ({ ...o })) },
    challenge: state.challenge,
    challengeGoal: state.challengeGoal.toString(),
    contract: state.contract ? { ...state.contract } : null,
    contractOffers: state.contractOffers.map((o) => ({ ...o })),
    contractsDone: state.contractsDone,
    galaxy: { ...state.galaxy, base: state.galaxy.base.toString(), map: [...state.galaxy.map] },
    challengesDone: [...state.challengesDone],
    lastHappening: state.lastHappening,
    safe: { ...state.safe },
    collection: [...state.collection],
    setsDone: [...state.setsDone],
    skin: state.skin,
    ornaments: { got: [...state.ornaments.got], on: [...state.ornaments.on] },
    story: { heard: [...state.story.heard] },
    festival: { ...state.festival, bought: [...state.festival.bought] },
    fishing: { ...state.fishing, caught: { ...state.fishing.caught } },
    rig: state.rig,
    friends: { ...state.friends, list: state.friends.list.map((x) => ({ ...x })), sent: { ...state.friends.sent } },
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
  if (data.history) {
    const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
    if (Array.isArray(data.history.income)) state.history.income = data.history.income.filter((x) => x && ok(x.t) && ok(x.log)).slice(-144);
    if (Array.isArray(data.history.runs)) state.history.runs = data.history.runs.filter((x) => x && ok(x.t) && ok(x.cores) && ok(x.minutes) && ok(x.sector)).slice(-12);
  }
  if (data.weekly && typeof data.weekly.week === 'string') state.weekly = { week: data.weekly.week, id: String(data.weekly.id ?? ''), start: int(data.weekly.start), claimed: Math.min(3, int(data.weekly.claimed)) };
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
  if (data.ads && typeof data.ads.day === 'string') {
    const used: Record<string, number> = {};
    for (const [k, v] of Object.entries(data.ads.used ?? {})) if (Number.isFinite(Number(v))) used[k] = Math.max(0, Math.floor(Number(v)));
    state.ads = { day: data.ads.day, used };
  }
  if (data.crateBuffs) state.crateBuffs = { surge: Number(data.crateBuffs.surge) || 0, frenzy: Number(data.crateBuffs.frenzy) || 0 };
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
  const contractIds = new Set<string>(CONTRACTS.map((c) => c.id));
  const offerOk = (o: unknown): o is ContractOffer => !!o && typeof o === 'object' && contractIds.has((o as ContractOffer).id) && Number.isFinite(Number((o as ContractOffer).goal));
  state.contractOffers = Array.isArray(data.contractOffers) ? data.contractOffers.filter(offerOk).slice(0, 3).map((o) => ({ id: o.id, goal: int(o.goal) })) : [];
  const c = data.contract;
  state.contract = offerOk(c) ? { id: c.id, goal: int(c.goal), base: int(c.base), done: !!c.done } : null;
  if (state.contract && c && Number.isFinite(Number(c.deadline)) && Number(c.deadline) > 0) state.contract.deadline = Number(c.deadline);
  state.contractsDone = int(data.contractsDone);
  const challengeIds = new Set(CHALLENGES.map((c) => c.id));
  for (const id of strings(data.challengesDone)) if (challengeIds.has(id)) state.challengesDone.add(id);
  state.challenge = typeof data.challenge === 'string' && challengeIds.has(data.challenge) && !state.challengesDone.has(data.challenge) ? data.challenge : null;
  if (data.galaxy && typeof data.galaxy === 'object') {
    const g = data.galaxy;
    const count = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
    const nodeIds = new Set(STAR_NODES.map((n) => n.id));
    state.galaxy = {
      earned: count(g.earned),
      stars: Math.min(count(g.stars), count(g.earned)),
      shifts: count(g.shifts),
      base: g.base ? num(g.base) : D(0),
      bestCores: count(g.bestCores),
      map: new Set(strings(g.map).filter((id) => nodeIds.has(id))),
      forge: Math.min(count(g.forge), 40),
    };
    if (state.galaxy.base.gt(state.allTime)) state.galaxy.base = state.allTime;
  }
  // Saves from before goals scaled keep the old fixed goal.
  const savedGoal = state.challenge && data.challengeGoal ? num(data.challengeGoal) : null;
  state.challengeGoal = savedGoal && savedGoal.gt(0) ? savedGoal : D(CHALLENGES.find((c) => c.id === state.challenge)?.goal ?? 0);
  state.lastHappening = Number(data.lastHappening) || 0;
  const safeIds = new Set(SAFE_TYPES.map((t) => t.id));
  if (data.safe && typeof data.safe === 'object') {
    // A safe left half-cracked when the game closed is lost; the pod itself may still be waiting.
    state.safe = { until: Number(data.safe.until) || 0, nextAt: Number(data.safe.nextAt) || 0, type: safeIds.has(data.safe.type) ? data.safe.type : 'supply', open: null };
  }
  for (const id of strings(data.collection)) state.collection.add(id);
  const setIds = new Set(SETS.map((s) => s.id));
  for (const id of strings(data.setsDone)) if (setIds.has(id)) state.setsDone.add(id);
  state.skin = typeof data.skin === 'string' && SKINS.some((k) => k.id === data.skin) && skinUnlocked(state, data.skin) ? data.skin : null;
  state.stats = { ...state.stats, ...(data.stats ?? {}) };
  const ornamentIds = new Set(ORNAMENTS.map((o) => o.id));
  for (const id of strings(data.ornaments?.got)) if (ornamentIds.has(id)) state.ornaments.got.add(id);
  for (const id of strings(data.ornaments?.on)) if (state.ornaments.got.has(id)) state.ornaments.on.add(id);
  for (const id of strings(data.story?.heard)) if (STORY.some((e) => e.id === id)) state.story.heard.add(id);
  const fest = data.festival;
  if (fest) {
    state.festival.flakes = int(fest.flakes);
    for (const id of strings(fest.bought)) if (FESTIVAL_SHOP.some((i) => i.id === id && !i.repeat)) state.festival.bought.add(id);
    state.festival.cocoaUntil = typeof fest.cocoaUntil === 'number' && Number.isFinite(fest.cocoaUntil) ? fest.cocoaUntil : 0;
    state.festival.day = typeof fest.day === 'string' ? fest.day.slice(0, 12) : '';
    state.festival.test = fest.test === true;
  }
  const fish = data.fishing;
  if (fish && typeof fish === 'object') {
    const f = state.fishing;
    f.bait = Math.min(FISHING.baitMax, int(fish.bait));
    f.baitAt = typeof fish.baitAt === 'number' && Number.isFinite(fish.baitAt) ? Math.min(fish.baitAt, now) : now;
    f.casts = int(fish.casts);
    if (fish.caught && typeof fish.caught === 'object')
      for (const c of CRITTERS) {
        const n = int((fish.caught as Record<string, unknown>)[c.id]);
        if (n > 0) f.caught[c.id] = n;
      }
  }
  state.rig = data.rig === true;
  const fr = data.friends;
  if (fr && typeof fr === 'object') {
    const f = state.friends;
    f.mine = typeof fr.mine === 'string' && normalizeCode(fr.mine) ? fr.mine : '';
    f.name = typeof fr.name === 'string' ? cleanName(fr.name) : '';
    const seen = new Set<string>();
    for (const x of Array.isArray(fr.list) ? fr.list : []) {
      const code = x && typeof x.code === 'string' ? normalizeCode(x.code) : null;
      if (!code || seen.has(code) || code === f.mine || seen.size >= FRIEND_LIMIT) continue;
      seen.add(code);
      f.list.push({ code, name: typeof x.name === 'string' ? cleanName(x.name) : '' });
    }
    if (fr.sent && typeof fr.sent === 'object') for (const [k, v] of Object.entries(fr.sent)) if (typeof v === 'string') f.sent[k] = v;
    f.day = typeof fr.day === 'string' ? fr.day : '';
    f.opened = Math.max(0, Math.floor(Number(fr.opened) || 0));
    f.sentRewards = Math.max(0, Math.floor(Number(fr.sentRewards) || 0));
  }
  if (!Array.isArray(data.collection)) {
    // Saves from before the book: credit what the save already shows.
    for (let i = 0; i <= Math.min(state.stats.relocations, SECTORS.length - 1); i++) state.collection.add(`sector:${i}`);
    for (let i = 0; i < Math.min(state.stats.bosses, BOSS_NAMES.length); i++) state.collection.add(`boss:${i}`);
  }
  state.boostUntil = Number(data.boostUntil) || 0;
  state.boostReadyAt = Number(data.boostReadyAt) || 0;
  state.lastSeen = Number(data.lastSeen) || now;
  const { scientific, ...settings } = data.settings ?? {};
  state.settings = { ...state.settings, ...settings };
  if (scientific && !settings.numbers) state.settings.numbers = 'scientific';
  // Saves from before the volume sliders: a switched-off sound stays silent.
  const vol = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);
  state.settings.sfxVol = vol(settings.sfxVol, settings.sound === false ? 0 : 0.8);
  state.settings.musicVol = vol(settings.musicVol, settings.music === false ? 0 : 0.6);
  state.settings.sound = state.settings.sfxVol > 0;
  state.settings.music = state.settings.musicVol > 0;
  state.settings.reduceFlash = settings.reduceFlash === true;
  state.settings.reduceShake = settings.reduceShake === true;
  state.settings.dayNight = settings.dayNight !== false;
  state.settings.viewZoom = typeof settings.viewZoom === 'number' && Number.isFinite(settings.viewZoom) ? settings.viewZoom : 1;
  return state;
}

const CODE_PREFIX = 'SCRAP1-';

/** The save as a text code the player can copy somewhere safe: base64 of the save JSON. */
export function exportCode(state: GameState): string {
  const bytes = new TextEncoder().encode(serialize(state));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return CODE_PREFIX + btoa(bin);
}

/** Reads a code from exportCode back into a save, or null if it is not one. Spaces and line breaks are ignored. */
export function importCode(code: string, now: number): GameState | null {
  const clean = code.replace(/\s+/g, '');
  if (!clean.startsWith(CODE_PREFIX)) return null;
  try {
    const bin = atob(clean.slice(CODE_PREFIX.length));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    return deserialize(json, now);
  } catch {
    return null;
  }
}
