import { claimableCores, nextCoreAt } from './economy';
import type { GameState } from './state';

/*
 * The menu's later tabs open one at a time as the player gets to them, so a new captain sees
 * Build first and the rest arrive with a little ceremony. Once open, a tab stays open
 * (recorded in state.tips as `open:<tab>`). Veterans who relocated have everything.
 * Older saves recorded a single `open:progress` tab, which held both the Lab and Prestige.
 */

export interface TabUnlock {
  tab: 'crew' | 'lab' | 'prestige' | 'station';
  /** Shown when the locked tab is tapped. */
  hint: string;
  /** Shown when it opens. */
  news: string;
  ready: (s: GameState) => boolean;
}

const veteran = (s: GameState) => s.cores > 0 || s.stats.relocations > 0 || s.galaxy.shifts > 0;

export const TAB_UNLOCKS: readonly TabUnlock[] = [
  {
    tab: 'crew',
    hint: 'Crew opens once you have 5 crystals. Missions and achievements pay them.',
    news: 'Hire crew with crystals to power up your machines.',
    ready: (s) => veteran(s) || s.crystals >= 5 || Object.values(s.crew).some((l) => l > 0),
  },
  {
    tab: 'lab',
    hint: 'The Lab opens after your third upgrade.',
    news: 'Research new tech in the Lab. It keeps working while you are away.',
    ready: (s) => veteran(s) || s.tips.has('open:progress') || s.stats.upgradesBought >= 3 || s.research.done.size > 0 || !!s.research.active,
  },
  {
    tab: 'prestige',
    hint: 'Prestige opens as you get close to your first Star Core.',
    news: 'Relocate the station for Star Cores: a fresh start that runs much faster.',
    ready: (s) => veteran(s) || s.tips.has('open:progress') || claimableCores(s) > 0 || s.allTime.gte(nextCoreAt(s).mul(0.25)),
  },
  {
    tab: 'station',
    hint: 'Station opens with your first decoration, or after 10 minutes of salvaging.',
    news: 'Build rooms, decorate, and fill your collection book.',
    ready: (s) => veteran(s) || s.stats.playSec >= 600 || s.ornaments.got.size > 0,
  },
];

export const tabOpen = (s: GameState, tab: string): boolean => tab === 'build' || s.tips.has(`open:${tab}`);

/** Opens every tab that is ready and returns the ones that just opened. */
export function openReadyTabs(s: GameState): TabUnlock[] {
  const out: TabUnlock[] = [];
  for (const u of TAB_UNLOCKS) {
    if (!s.tips.has(`open:${u.tab}`) && u.ready(s)) {
      s.tips.add(`open:${u.tab}`);
      out.push(u);
    }
  }
  return out;
}
