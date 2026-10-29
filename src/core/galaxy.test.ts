import { describe, expect, it } from 'vitest';
import { claimableCores, globalMult, hasPerk, nextCoreAt, relocate } from './economy';
import { GALAXY, forgeCost, starsForCores } from './galaxy';
import { buyForge, buyStarNode, galaxyOpen, shiftGalaxy, starsOnShift } from './meta';
import { D } from './num';
import { deserialize, newState, serialize } from './state';

const NOW = 1_700_000_000_000;

describe('galaxy shift', () => {
  it('opens with a Dyson Collector and trades cores for stars', () => {
    const s = newState(NOW);
    s.cores = 900;
    s.allTime = D(1e15);
    expect(galaxyOpen(s)).toBe(false);
    expect(shiftGalaxy(s, NOW)).toBe(0);
    s.owned.dyson = 1;
    const stars = starsOnShift(s);
    expect(stars).toBe(starsForCores(900 + claimableCores(s)));
    expect(shiftGalaxy(s, NOW)).toBe(stars);
    expect(s.cores).toBe(0);
    expect(s.owned.dyson).toBe(0);
    expect(s.galaxy.stars).toBe(stars);
    // Cores count again from the shift, not from the old all-time total.
    expect(claimableCores(s)).toBe(0);
    expect(nextCoreAt(s).gt(s.allTime)).toBe(true);
    expect(globalMult(s)).toBeCloseTo(1 + stars * GALAXY.incomePerStar);
  });

  it('asks for more cores per star in each new galaxy', () => {
    expect(starsForCores(900)).toBe(6);
    expect(starsForCores(900, 1)).toBe(3);
    expect(starsForCores(0)).toBe(0);
  });

  it('spends stars on the Star Map and the forge, and saves them', () => {
    const s = newState(NOW);
    s.galaxy.stars = s.galaxy.earned = 7;
    expect(buyStarNode(s, 'kit')).toBe(true);
    expect(buyStarNode(s, 'kit')).toBe(false);
    expect(buyStarNode(s, 'memory')).toBe(true);
    expect(buyForge(s)).toBe(false);
    expect(s.galaxy.stars).toBe(3);
    s.galaxy.stars = 20;
    expect(buyForge(s)).toBe(true);
    expect(s.galaxy.stars).toBe(20 - forgeCost(0));
    // The kit and kept perks apply to the next run.
    s.galaxy.bestCores = 60;
    s.allTime = D(1e9);
    relocate(s, NOW);
    expect(s.owned.hauler).toBe(10);
    expect(hasPerk(s, 'autobuy')).toBe(true);
    expect(hasPerk(s, 'magnet')).toBe(false);
    const back = deserialize(serialize(s), NOW)!;
    expect([...back.galaxy.map]).toEqual(['kit', 'memory']);
    expect(back.galaxy.forge).toBe(1);
    expect(back.galaxy.bestCores).toBe(60);
  });
});

describe('settings', () => {
  it('turns old sound switches into volumes and keeps comfort options', () => {
    const s = newState(NOW);
    const old = JSON.parse(serialize(s));
    old.settings = { sound: false, music: true, numbers: 'letters' };
    const back = deserialize(JSON.stringify(old), NOW)!;
    expect(back.settings.sfxVol).toBe(0);
    expect(back.settings.sound).toBe(false);
    expect(back.settings.musicVol).toBeGreaterThan(0);
    back.settings.reduceShake = true;
    back.settings.musicVol = 0.25;
    const again = deserialize(serialize(back), NOW)!;
    expect(again.settings.reduceShake).toBe(true);
    expect(again.settings.reduceFlash).toBe(false);
    expect(again.settings.musicVol).toBe(0.25);
  });
});
