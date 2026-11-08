import { describe, expect, it } from 'vitest';
import { AD_REWARDS, adsLeft, useAd } from './rewards';
import { affordableUpgrades } from './economy';
import { D } from './num';
import { deserialize, newState, serialize } from './state';

const NOW = new Date(2026, 10, 8, 12).getTime();
const DAY = 24 * 3600 * 1000;

describe('ad rewards', () => {
  it('counts a daily allowance per kind', () => {
    const s = newState(NOW);
    expect(adsLeft(s, 'crystals', NOW)).toBe(AD_REWARDS.crystals.perDay);
    for (let i = 0; i < AD_REWARDS.crystals.perDay; i++) expect(useAd(s, 'crystals', NOW)).toBe(true);
    expect(useAd(s, 'crystals', NOW)).toBe(false);
    expect(adsLeft(s, 'overdrive', NOW)).toBe(AD_REWARDS.overdrive.perDay);
    expect(adsLeft(s, 'crystals', NOW + DAY)).toBe(AD_REWARDS.crystals.perDay);
    expect(s.stats.adsWatched).toBe(AD_REWARDS.crystals.perDay);
  });

  it('offers nothing with ad offers switched off', () => {
    const s = newState(NOW);
    s.settings.adOffers = false;
    expect(adsLeft(s, 'offline', NOW)).toBe(0);
    expect(useAd(s, 'offline', NOW)).toBe(false);
  });

  it('keeps the count in the save', () => {
    const s = newState(NOW);
    useAd(s, 'offline', NOW);
    const back = deserialize(serialize(s), NOW)!;
    expect(adsLeft(back, 'offline', NOW)).toBe(AD_REWARDS.offline.perDay - 1);
  });
});

describe('install all', () => {
  it('picks the cheapest visible upgrades the scrap covers', () => {
    const s = newState(NOW);
    s.owned.drone = 10;
    s.owned.hauler = 1;
    s.scrap = D(75 + 600 + 900);
    const ids = affordableUpgrades(s).map((u) => u.id);
    expect(ids).toEqual(['claw1', 'grip1', 'drone1']);
  });
});
