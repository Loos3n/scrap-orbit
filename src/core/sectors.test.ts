import { describe, expect, it } from 'vitest';
import { SECTORS } from './content';
import { baseIncome, boostDurationSec, buildRig, relocate, rigCost, tapValue } from './economy';
import { bossReward } from './meta';
import { D } from './num';
import { currentSector } from './sectors';
import { deserialize, newState, serialize } from './state';

const NOW = 1_000_000;

/** A save parked in the sector with this look, with some machines running. */
function inSector(look: string | undefined) {
  const s = newState(NOW);
  s.stats.relocations = SECTORS.findIndex((x) => x.look === look);
  s.owned.drone = 30;
  s.owned.hauler = 10;
  return s;
}

describe('Sectors', () => {
  it('reaches the new sectors after the first six, then cycles', () => {
    const s = newState(NOW);
    s.stats.relocations = 6;
    expect(currentSector(s).name).toBe('Ice Belt');
    s.stats.relocations = 8;
    expect(currentSector(s).name).toBe('Black Hole Edge');
    s.stats.relocations = 9;
    expect(currentSector(s).name).toBe('Scrapyard Belt');
  });

  it('makes taps stronger and machines slower in the Ice Belt', () => {
    const home = inSector(undefined);
    const ice = inSector('ice');
    expect(baseIncome(ice).toNumber()).toBeCloseTo(baseIncome(home).toNumber() * 0.8);
    expect(tapValue(ice, NOW).toNumber()).toBeGreaterThan(tapValue(home, NOW).toNumber() * 1.5);
  });

  it('makes wrecks pay more in the Derelict City', () => {
    expect(bossReward(inSector('city'), NOW).toNumber()).toBeCloseTo(bossReward(inSector(undefined), NOW).toNumber() * 3);
  });

  it('stretches Overdrive at the Black Hole Edge', () => {
    expect(boostDurationSec(inSector('hole'))).toBe(boostDurationSec(inSector(undefined)) * 2);
  });
});

describe('Sector rigs', () => {
  it('can only be built where there is one, once, and when affordable', () => {
    const home = inSector(undefined);
    home.scrap = D(1e12);
    expect(buildRig(home)).toBe(false);
    const s = inSector('hole');
    s.scrap = rigCost(s).sub(1);
    expect(buildRig(s)).toBe(false);
    s.scrap = rigCost(s);
    const before = baseIncome(s).toNumber();
    expect(buildRig(s)).toBe(true);
    expect(s.scrap.toNumber()).toBe(0);
    expect(baseIncome(s).toNumber()).toBeCloseTo(before * 1.75);
    s.scrap = D(1e12);
    expect(buildRig(s)).toBe(false);
  });

  it('is kept in the save and left behind on a relocation', () => {
    const s = inSector('city');
    s.scrap = D(1e9);
    buildRig(s);
    expect(deserialize(serialize(s), NOW)!.rig).toBe(true);
    s.allTime = D(1e15);
    expect(relocate(s, NOW)).toBeGreaterThan(0);
    expect(s.rig).toBe(false);
  });
});
