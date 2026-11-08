import { describe, expect, it } from 'vitest';
import { openReadyTabs, tabOpen } from './unlocks';
import { newState } from './state';
import { nextCoreAt } from './economy';

describe('Tab unlocks', () => {
  it('starts with only Build open', () => {
    const s = newState(0);
    expect(openReadyTabs(s)).toEqual([]);
    expect(tabOpen(s, 'build')).toBe(true);
    expect(tabOpen(s, 'crew')).toBe(false);
  });

  it('opens tabs one at a time and keeps them open', () => {
    const s = newState(0);
    s.crystals = 5;
    expect(openReadyTabs(s).map((u) => u.tab)).toEqual(['crew']);
    s.crystals = 0;
    expect(tabOpen(s, 'crew')).toBe(true);
    s.stats.playSec = 700;
    expect(openReadyTabs(s).map((u) => u.tab)).toEqual(['station']);
  });

  it('opens both Lab and Prestige for a save that had the old Progress tab', () => {
    const s = newState(0);
    s.tips.add('open:progress');
    expect(openReadyTabs(s).map((u) => u.tab)).toEqual(['lab', 'prestige']);
  });

  it('opens Lab after three upgrades and Prestige near the first core', () => {
    const s = newState(0);
    s.stats.upgradesBought = 3;
    expect(openReadyTabs(s).map((u) => u.tab)).toEqual(['lab']);
    s.allTime = nextCoreAt(s);
    expect(openReadyTabs(s).map((u) => u.tab)).toEqual(['prestige']);
  });

  it('opens everything for a station that has relocated', () => {
    const s = newState(0);
    s.cores = 3;
    expect(openReadyTabs(s)).toHaveLength(4);
  });
});
