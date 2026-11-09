import type { GameState } from './state';

/*
 * The Frost Festival: every year from 1 December to 6 January (device clock), snow drifts past
 * the station, the music turns cosy and salvage crates come gift-wrapped. Crates and boss wrecks
 * shake loose snowflakes, plus a present each day, and snowflakes buy things in the festival
 * shop: decorations and a paint that only the festival has, hot cocoa (2x income for a while)
 * and crystal stockings. Snowflakes and everything bought keep from one year to the next.
 * This file only reads and writes the save; the UI lives in ui/festival-ui.ts.
 */

export const FESTIVAL = {
  name: 'Frost Festival',
  /** First and last day, as [month (0 = January), day]. The festival runs across the new year. */
  start: [11, 1] as const,
  end: [0, 6] as const,
  /** Snowflakes for each crate caught, each boss wreck broken, and the present each day. */
  crate: 1,
  boss: 5,
  daily: 5,
  /** Hot cocoa: income multiplier and how long one cup lasts. */
  cocoaMult: 2,
  cocoaMin: 30,
  color: '#9fe6ff',
};

export type FestivalItemId = 'snowman' | 'startree' | 'hoarfrost' | 'cocoa' | 'stocking';

export interface FestivalItem {
  id: FestivalItemId;
  name: string;
  desc: string;
  cost: number;
  /** Bought again and again (cocoa, stockings), or once. */
  repeat?: boolean;
}

export const FESTIVAL_SHOP: readonly FestivalItem[] = [
  { id: 'cocoa', name: 'Hot cocoa', desc: `The crew warm up: ${FESTIVAL.cocoaMult}x income for ${FESTIVAL.cocoaMin} minutes.`, cost: 8, repeat: true },
  { id: 'snowman', name: 'Snowman', desc: 'A snowman in a bubble helmet, up on the station.', cost: 20 },
  { id: 'startree', name: 'Star Tree', desc: 'A little tree of lights for the hull, with a star on top.', cost: 35 },
  { id: 'hoarfrost', name: 'Hoarfrost paint', desc: 'A frosted white hull paint, only from the festival.', cost: 50 },
  { id: 'stocking', name: 'Crystal stocking', desc: '15 crystals, stuffed in a sock.', cost: 12, repeat: true },
];

export const STOCKING_CRYSTALS = 15;
/** The festival's paint, kept out of the shop like the weekly event paints. */
export const FESTIVAL_PAINT = { id: 'hoarfrost', name: 'Hoarfrost', tint: 0xe6f6ff, cost: 0 };

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** Whether the festival is on at `now` (local time). `state.festival.test` forces it on, for trying it out. */
export function festivalOn(now: number, state?: GameState): boolean {
  if (state?.festival.test) return true;
  const d = new Date(now);
  const m = d.getMonth();
  const day = d.getDate();
  return (m === FESTIVAL.start[0] && day >= FESTIVAL.start[1]) || (m === FESTIVAL.end[0] && day <= FESTIVAL.end[1]);
}

/** Seconds until the festival ends (midnight after its last day), or starts when it is off. */
export function festivalSecondsLeft(now: number): number {
  const d = new Date(now);
  const year = d.getMonth() === 0 ? d.getFullYear() : d.getFullYear() + 1;
  return Math.max(0, (new Date(year, FESTIVAL.end[0], FESTIVAL.end[1] + 1).getTime() - now) / 1000);
}

/** Festival rules apply: it is on, and the tutorial is over (so a new captain isn't swamped). */
export const festivalActive = (state: GameState, now: number) => state.tutorial < 0 && festivalOn(now, state);

export function cocoaActive(state: GameState, now: number): boolean {
  return now < state.festival.cocoaUntil;
}

export const cocoaMult = (state: GameState, now: number) => (cocoaActive(state, now) ? FESTIVAL.cocoaMult : 1);

/** Adds snowflakes for something done while the festival is on. Returns how many. */
export function earnFlakes(state: GameState, now: number, kind: 'crate' | 'boss'): number {
  if (!festivalActive(state, now)) return 0;
  const n = FESTIVAL[kind];
  state.festival.flakes += n;
  return n;
}

/** The present under the tree: once per festival day. Returns snowflakes given, or 0. */
export function dailyPresent(state: GameState, now: number): number {
  if (!festivalActive(state, now)) return 0;
  const key = dayKey(new Date(now));
  if (state.festival.day === key) return 0;
  state.festival.day = key;
  state.festival.flakes += FESTIVAL.daily;
  return FESTIVAL.daily;
}

export const festivalOwns = (state: GameState, id: FestivalItemId) => state.festival.bought.has(id);

/** Whether an item can be bought now. */
export function canBuyFestival(state: GameState, id: FestivalItemId, now: number): boolean {
  const item = FESTIVAL_SHOP.find((i) => i.id === id);
  if (!item || !festivalActive(state, now) || state.festival.flakes < item.cost) return false;
  return item.repeat || !state.festival.bought.has(id);
}

/** Buys a shop item with snowflakes. */
export function buyFestival(state: GameState, id: FestivalItemId, now: number): boolean {
  if (!canBuyFestival(state, id, now)) return false;
  const item = FESTIVAL_SHOP.find((i) => i.id === id)!;
  state.festival.flakes -= item.cost;
  if (!item.repeat) state.festival.bought.add(id);
  if (id === 'cocoa') state.festival.cocoaUntil = Math.max(now, state.festival.cocoaUntil) + FESTIVAL.cocoaMin * 60_000;
  if (id === 'stocking') {
    state.crystals += STOCKING_CRYSTALS;
    state.stats.crystalsEarned += STOCKING_CRYSTALS;
  }
  if (id === 'hoarfrost') state.decor.owned.add(FESTIVAL_PAINT.id);
  return true;
}
