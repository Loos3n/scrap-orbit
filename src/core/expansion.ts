import type { CrewId, PetId } from './content';
import { sectorBonuses } from './sectors';
import type { GameState } from './state';

/*
 * Station modules, expeditions, boss loot, golden scrap, the trading post and challenge runs:
 * definitions, plus the bonuses they
 * add up to. These only read the save, so the economy can use them without a cycle; the
 * actions that pay out scrap live in meta.ts.
 */

/** Everything these systems can boost. Values are fractions (0.1 is +10%). */
export interface Bonuses {
  income: number;
  tap: number;
  offline: number;
  boss: number;
  /** Expeditions finish this much faster. */
  trip: number;
  /** Golden scrap turns up this much more often. */
  golden: number;
}

const NONE = (): Bonuses => ({ income: 0, tap: 0, offline: 0, boss: 0, trip: 0, golden: 0 });

// ---------- Station modules ----------

export type ModuleId = 'reactor' | 'hangar' | 'solar' | 'workshop' | 'greenhouse' | 'quarters' | 'observatory' | 'armory';

export interface ModuleDef {
  id: ModuleId;
  name: string;
  stat: keyof Bonuses;
  amount: number;
  /** The layout rule, in words, for the build menu. */
  rule: string;
  cost: number;
  color: number;
  /** Needs a blueprint from an expedition before it can be built. */
  blueprint: boolean;
  /** At most this many on the grid. */
  max?: number;
}

export const GRID = 3;

export const MODULES: readonly ModuleDef[] = [
  { id: 'reactor', name: 'Fusion Reactor', stat: 'income', amount: 0.05, rule: 'Powers the rooms beside it: their bonus x1.5.', cost: 25, color: 0xffb547, blueprint: false, max: 1 },
  { id: 'hangar', name: 'Drone Hangar', stat: 'income', amount: 0.06, rule: '+2% more for each hangar beside it.', cost: 15, color: 0x4fe3c1, blueprint: false },
  { id: 'solar', name: 'Solar Array', stat: 'income', amount: 0.04, rule: 'Double in a corner.', cost: 12, color: 0x7aa7ff, blueprint: false },
  { id: 'workshop', name: 'Claw Workshop', stat: 'tap', amount: 0.15, rule: '+5% more next to a hangar.', cost: 20, color: 0x9aa6ff, blueprint: true },
  { id: 'greenhouse', name: 'Greenhouse', stat: 'offline', amount: 0.2, rule: '+3% income for each crew quarters beside it.', cost: 20, color: 0x9dff6b, blueprint: true },
  { id: 'quarters', name: 'Crew Quarters', stat: 'trip', amount: 0.12, rule: 'Double next to a greenhouse.', cost: 20, color: 0xff8a4c, blueprint: true },
  { id: 'observatory', name: 'Observatory', stat: 'golden', amount: 0.2, rule: 'Double in the centre.', cost: 30, color: 0xc58cff, blueprint: true },
  { id: 'armory', name: 'Armory', stat: 'boss', amount: 0.2, rule: '+10% more next to the reactor.', cost: 30, color: 0xff5d6c, blueprint: true },
];

export const moduleDef = (id: string) => MODULES.find((m) => m.id === id);

/** The four grid cells that share an edge with `i`. */
export function neighbours(i: number): number[] {
  const x = i % GRID;
  const y = Math.floor(i / GRID);
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < GRID - 1) out.push(i + 1);
  if (y > 0) out.push(i - GRID);
  if (y < GRID - 1) out.push(i + GRID);
  return out;
}

const isCorner = (i: number) => (i % GRID === 0 || i % GRID === GRID - 1) && (i < GRID || i >= GRID * (GRID - 1));
const CENTRE = Math.floor((GRID * GRID) / 2);

/** What one placed module gives, with its layout bonuses: [stat, amount] pairs. */
export function moduleYield(grid: (string | null)[], i: number): [keyof Bonuses, number][] {
  const def = moduleDef(grid[i] ?? '');
  if (!def) return [];
  const near = neighbours(i).map((n) => grid[n]);
  const count = (id: ModuleId) => near.filter((n) => n === id).length;
  let amount = def.amount;
  const extra: [keyof Bonuses, number][] = [];
  if (def.id === 'hangar') amount += 0.02 * count('hangar');
  if (def.id === 'solar' && isCorner(i)) amount *= 2;
  if (def.id === 'workshop' && count('hangar') > 0) amount += 0.05;
  if (def.id === 'greenhouse' && count('quarters') > 0) extra.push(['income', 0.03 * count('quarters')]);
  if (def.id === 'quarters' && count('greenhouse') > 0) amount *= 2;
  if (def.id === 'observatory' && i === CENTRE) amount *= 2;
  if (def.id === 'armory' && count('reactor') > 0) amount += 0.1;
  const powered = def.id !== 'reactor' && count('reactor') > 0 ? 1.5 : 1;
  return [[def.stat, amount * powered], ...extra.map(([s, a]) => [s, a * powered] as [keyof Bonuses, number])];
}

/** Crystal price of the next module: each one built makes the next a bit dearer. */
export function moduleCost(state: GameState, id: ModuleId): number {
  const built = state.modules.filter(Boolean).length;
  return Math.round(moduleDef(id)!.cost * (1 + built * 0.25));
}

export function moduleUnlocked(state: GameState, id: ModuleId): boolean {
  const def = moduleDef(id)!;
  return !def.blueprint || state.blueprints.has(id);
}

// ---------- Boss loot ----------

export interface LootDef {
  id: string;
  name: string;
  desc: string;
  /** A permanent bonus, for parts. */
  stat?: keyof Bonuses;
  amount?: number;
  /** A pet skin: which pet, and the tint it wears. */
  pet?: PetId;
  tint?: number;
  color: number;
}

export const LOOT: readonly LootDef[] = [
  { id: 'plating', name: 'Freighter Hull Plating', desc: '+10% income, for good.', stat: 'income', amount: 0.1, color: 0x9aa6ff },
  { id: 'chip', name: 'Cruiser Targeting Chip', desc: '+25% damage to boss wrecks.', stat: 'boss', amount: 0.25, color: 0xff5d6c },
  { id: 'tip', name: 'Titan Claw Tip', desc: '+20% tap power.', stat: 'tap', amount: 0.2, color: 0x7aa7ff },
  { id: 'beacon', name: 'Gilded Beacon', desc: 'Golden scrap turns up 25% more often.', stat: 'golden', amount: 0.25, color: 0xffd166 },
  { id: 'compass', name: 'Star Compass', desc: 'Expeditions finish 15% faster.', stat: 'trip', amount: 0.15, color: 0x5cd6ff },
  { id: 'battery', name: 'Hollow Battery', desc: '+25% offline earnings.', stat: 'offline', amount: 0.25, color: 0x9dff6b },
  { id: 'skin-cat', name: 'Golden Cat', desc: 'A gilded coat for the Nebula Cat.', pet: 'cat', tint: 0xffd27a, color: 0xffd166 },
  { id: 'skin-pup', name: 'Ghost Pup', desc: 'A spooky glow for the Orbit Pup.', pet: 'pup', tint: 0xbfe8ff, color: 0xbfe8ff },
  { id: 'skin-owl', name: 'Ember Owl', desc: 'Fiery feathers for the Star Owl.', pet: 'owl', tint: 0xff9a6a, color: 0xff9a6a },
  { id: 'skin-blob', name: 'Void Blob', desc: 'A deep purple ooze for the Goo Blob.', pet: 'blob', tint: 0xa98aff, color: 0xa98aff },
];

export const LOOT_CHANCE = 0.2;
/** After this many bosses in a row with no drop, the next one always drops. */
export const LOOT_PITY = 4;

// ---------- Expeditions ----------

export interface TripDef {
  id: string;
  name: string;
  desc: string;
  minutes: number;
  crystals: [number, number];
  /** Scrap brought back, in minutes of the station's income. */
  scrapMin: number;
  blueprint: number;
  color: number;
}

export const TRIPS: readonly TripDef[] = [
  { id: 'field', name: 'Debris Field', desc: 'A quick sweep of the nearby junk.', minutes: 15, crystals: [2, 4], scrapMin: 5, blueprint: 0.05, color: 0x9aa6ff },
  { id: 'nebula', name: 'Rose Nebula', desc: 'Colourful clouds hide old cargo pods.', minutes: 60, crystals: [5, 9], scrapMin: 20, blueprint: 0.15, color: 0xff8ac8 },
  { id: 'graveyard', name: 'Fleet Graveyard', desc: 'Where the Hollow Fleet went quiet.', minutes: 240, crystals: [12, 20], scrapMin: 60, blueprint: 0.4, color: 0xff5d6c },
  { id: 'deep', name: 'Deep Expanse', desc: 'Far past the charts. Rare finds.', minutes: 480, crystals: [25, 40], scrapMin: 120, blueprint: 0.7, color: 0x8f7bff },
];

export const TRIP_SLOTS = 2;
/** Each crew level past the first brings back this much more. */
export const TRIP_PER_LEVEL = 0.15;

export interface Trip {
  crew: CrewId;
  dest: string;
  endsAt: number;
}

export function onTrip(state: GameState, crew: CrewId): boolean {
  return state.trips.some((t) => t.crew === crew);
}

// ---------- Golden scrap ----------

export const GOLDEN = {
  /** Minutes between golden crates. */
  gap: [12, 20] as [number, number],
  firstMin: 8,
  /** The rush: income and taps multiplied, for this long. */
  mult: 7,
  seconds: 30,
};

export function goldenActive(state: GameState, now: number): boolean {
  return now < state.golden.until;
}

// ---------- Trading post ----------

export type OfferKind = 'crystals' | 'scrap' | 'blueprint' | 'recall' | 'loot';

export interface Offer {
  kind: OfferKind;
  /** What the trader wants: scrap (a Decimal string) or crystals. */
  pay: 'scrap' | 'crystals';
  price: string;
  /** What the player gets: crystals, or scrap as a Decimal string. Unused for blueprints, recalls and loot. */
  amount: string;
  bought: boolean;
}

export const TRADER = {
  /** Minutes of play before the first visit, then the gap between visits. */
  firstMin: 20,
  gap: [30, 45] as [number, number],
  /** How long the trader stays docked. */
  stayMin: 4,
  /** Scrap-for-crystals: this many minutes of income buys `crystalsBought` crystals. */
  crystalsPriceMin: 12,
  crystalsBought: 4,
  /** Crystals-for-scrap: `scrapPrice` crystals buy this many minutes of income. */
  scrapPrice: 5,
  scrapMin: 30,
  blueprintPrice: 30,
  recallPrice: 6,
  lootPrice: 45,
};

export const TRADER_NAMES = ['Captain Bramble', 'Old Mag', 'Zeph the Peddler', 'Tilly Twobolts', 'The Rust Baron'];

// ---------- Challenge runs ----------

export interface ChallengeDef {
  id: string;
  name: string;
  rule: string;
  /** Scrap to salvage in the challenge run, for a station with CHALLENGE_CORES cores and nothing else. */
  goal: number;
  stat: keyof Bonuses;
  amount: number;
  reward: string;
  color: number;
}

export const CHALLENGES: readonly ChallengeDef[] = [
  { id: 'notap', name: 'Hands Off', rule: 'Taps earn nothing. Your machines have to do it all.', goal: 1e9, stat: 'income', amount: 0.1, reward: '+10% income, forever', color: 0x4fe3c1 },
  { id: 'noupg', name: 'Bare Bones', rule: 'Upgrades cannot be installed.', goal: 1e9, stat: 'tap', amount: 0.5, reward: '+50% tap power, forever', color: 0x7aa7ff },
  { id: 'nocrew', name: 'Skeleton Crew', rule: 'Crew bonuses are switched off.', goal: 5e9, stat: 'offline', amount: 0.5, reward: '+50% offline earnings, forever', color: 0xff8a4c },
  { id: 'pricey', name: 'Inflation', rule: 'Every machine costs 3x as much.', goal: 1e10, stat: 'income', amount: 0.15, reward: '+15% income, forever', color: 0xc58cff },
];

/** Challenge runs open up once the player holds this many Star Cores. */
export const CHALLENGE_CORES = 5;

/**
 * Goals grow with the cube of the station's power (cores, research, achievements, room and
 * loot income), which keeps a challenge near the same hour or so of play however strong the
 * station is. Without it a late station cleared one in a couple of minutes.
 */
export const CHALLENGE_SCALE = 3;
/** Power of a station with CHALLENGE_CORES cores and nothing else: the base goals are set for it. */
export const CHALLENGE_BASE_POWER = 1.5;

export function challengeOn(state: GameState, id: string): boolean {
  return state.challenge === id;
}

// ---------- Totals ----------

export function bonuses(state: GameState): Bonuses {
  const b = NONE();
  for (let i = 0; i < state.modules.length; i++) for (const [stat, a] of moduleYield(state.modules, i)) b[stat] += a;
  for (const l of LOOT) if (l.stat && state.loot.has(l.id)) b[l.stat] += l.amount!;
  for (const c of CHALLENGES) if (state.challengesDone.has(c.id)) b[c.stat] += c.amount;
  const sec = sectorBonuses(state);
  b.income += sec.income;
  b.tap += sec.tap;
  b.offline += sec.offline;
  b.boss += sec.boss;
  return b;
}

/** Trip length in ms, after Crew Quarters and the Star Compass. */
export function tripMs(state: GameState, def: TripDef): number {
  return (def.minutes * 60_000) / (1 + bonuses(state).trip);
}
