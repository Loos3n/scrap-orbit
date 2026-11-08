import type { GameState } from './state';

/*
 * Optional rewarded ads: the player chooses to watch one for a bonus. Each kind has a daily
 * allowance, counted per local day, and the Settings switch hides every offer. This only does
 * the bookkeeping; src/ads.ts plays the ad and the Game pays the reward.
 */

export type AdReward = 'offline' | 'overdrive' | 'crystals';

export const AD_REWARDS: Record<AdReward, { perDay: number; name: string }> = {
  /** Doubles the welcome-back earnings. */
  offline: { perDay: 3, name: 'Double your time-away earnings' },
  /** Recharges Overdrive while it is cooling down. */
  overdrive: { perDay: 5, name: 'Recharge Overdrive' },
  /** A supply drop of crystals from the mission board. */
  crystals: { perDay: 3, name: 'Supply drop' },
};

export const AD_CRYSTALS = 10;

/** The local calendar day, as YYYY-MM-DD. */
export function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ads of this kind the player can still watch today; 0 while offers are switched off. */
export function adsLeft(state: GameState, kind: AdReward, now: number): number {
  if (!state.settings.adOffers) return 0;
  const used = state.ads.day === dayKey(now) ? (state.ads.used[kind] ?? 0) : 0;
  return Math.max(0, AD_REWARDS[kind].perDay - used);
}

/** Counts one watched ad. Returns false if none were left today. */
export function useAd(state: GameState, kind: AdReward, now: number): boolean {
  if (adsLeft(state, kind, now) <= 0) return false;
  const day = dayKey(now);
  if (state.ads.day !== day) state.ads = { day, used: {} };
  state.ads.used[kind] = (state.ads.used[kind] ?? 0) + 1;
  state.stats.adsWatched = (state.stats.adsWatched ?? 0) + 1;
  return true;
}
