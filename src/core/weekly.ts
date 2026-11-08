import { PAINTS } from './content';
import type { GameState } from './state';

/*
 * The weekly event: each calendar week (Monday to Sunday, local time) one of four events runs.
 * It bends one rule for the week and has a three-tier goal; the top tier pays a hull paint that
 * only that event gives. Progress counts from the player's stats when the week began.
 */

export type WeeklyId = 'comets' | 'wrecks' | 'solar' | 'taps';
type Counter = 'crates' | 'bosses' | 'boosts' | 'taps';

export interface WeeklyDef {
  id: WeeklyId;
  name: string;
  /** The rule it bends this week. */
  rule: string;
  counter: Counter;
  goal: string;
  tiers: [number, number, number];
  /** The paint the top tier gives. */
  paint: { id: string; name: string; tint: number };
  color: string;
}

export const WEEKLIES: readonly WeeklyDef[] = [
  { id: 'comets', name: 'Comet Shower', rule: 'Salvage crates drift by twice as often.', counter: 'crates', goal: 'Catch salvage crates', tiers: [10, 30, 70], paint: { id: 'comet', name: 'Comet Ice', tint: 0xa8e8ff }, color: '#7fd8ff' },
  { id: 'wrecks', name: 'Wreck Season', rule: 'Boss wrecks turn up twice as often.', counter: 'bosses', goal: 'Break boss wrecks', tiers: [2, 5, 10], paint: { id: 'rust', name: 'Salvager Rust', tint: 0xe8a878 }, color: '#ffb547' },
  { id: 'solar', name: 'Solar Festival', rule: 'Overdrive recharges twice as fast.', counter: 'boosts', goal: 'Fire Overdrive', tiers: [8, 25, 60], paint: { id: 'sunburst', name: 'Sunburst', tint: 0xffd07a }, color: '#ff8a4c' },
  { id: 'taps', name: 'Tap Marathon', rule: 'Every tap is worth 2x.', counter: 'taps', goal: 'Tap the station', tiers: [1500, 6000, 20000], paint: { id: 'neon', name: 'Neon Violet', tint: 0xd4a8ff }, color: '#c58cff' },
];

export const WEEKLY_CRYSTALS = [10, 25, 40] as const;

/** Paints only weekly events give, kept out of the shop. */
export const EVENT_PAINTS = WEEKLIES.map((w) => ({ ...w.paint, cost: 0 }));

const pad = (n: number) => String(n).padStart(2, '0');

/** Local Monday that starts the week holding `now`, and how many weeks that is since 1970. */
export function weekOf(now: number): { key: string; index: number } {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return { key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, index: Math.round(d.getTime() / (7 * 86_400_000)) };
}

export const weeklyFor = (index: number): WeeklyDef => WEEKLIES[((index % WEEKLIES.length) + WEEKLIES.length) % WEEKLIES.length];

function counter(state: GameState, c: Counter): number {
  if (c === 'taps') return state.taps;
  return state.stats[c] ?? 0;
}

/** Starts this week's event if a new week began. Returns the event when it just started. */
export function updateWeekly(state: GameState, now: number): WeeklyDef | null {
  const { key, index } = weekOf(now);
  if (state.weekly.week === key) return null;
  const def = weeklyFor(index);
  state.weekly = { week: key, id: def.id, start: counter(state, def.counter), claimed: 0 };
  return def;
}

export function currentWeekly(state: GameState): WeeklyDef | null {
  return WEEKLIES.find((w) => w.id === state.weekly.id) ?? null;
}

/** True while this week's event is the one named. */
export const weeklyOn = (state: GameState, id: WeeklyId) => state.weekly.id === id && state.tutorial < 0;

export function weeklyProgress(state: GameState): { done: number; tier: number; next: number | null } {
  const def = currentWeekly(state);
  if (!def) return { done: 0, tier: 0, next: null };
  const done = Math.max(0, counter(state, def.counter) - state.weekly.start);
  const tier = def.tiers.filter((t) => done >= t).length;
  return { done, tier, next: def.tiers[tier] ?? null };
}

/** Tiers reached but not yet claimed. */
export const weeklyClaimable = (state: GameState) => Math.max(0, weeklyProgress(state).tier - state.weekly.claimed);

/** Pays out the next reached tier: crystals, and at the top the event's paint (crystals if owned). */
export function claimWeekly(state: GameState): { crystals: number; paint?: string } | null {
  const def = currentWeekly(state);
  if (!def || weeklyClaimable(state) === 0) return null;
  const tier = state.weekly.claimed;
  state.weekly.claimed++;
  if (tier === 2 && !state.decor.owned.has(def.paint.id)) {
    state.decor.owned.add(def.paint.id);
    return { crystals: 0, paint: def.paint.id };
  }
  const crystals = WEEKLY_CRYSTALS[tier];
  state.crystals += crystals;
  state.stats.crystalsEarned += crystals;
  return { crystals };
}

/** All paints the Decor tab can show: shop paints plus the event ones the player has won. */
export const allPaints = () => [...PAINTS, ...EVENT_PAINTS];

/** Seconds until this week's event ends (next local Monday, midnight). */
export function weekEnds(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (7 - ((d.getDay() + 6) % 7)));
  return Math.max(0, (d.getTime() - now) / 1000);
}
