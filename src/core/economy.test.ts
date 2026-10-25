import { describe, expect, it } from 'vitest';
import { GENERATORS, OFFLINE_CAP_SEC } from './config';
import {
  activateBoost,
  applyOffline,
  baseIncome,
  buyGenerator,
  buyUpgrade,
  costFor,
  genById,
  income,
  maxAffordable,
  nextMilestone,
  tap,
  tapValue,
} from './economy';
import { D, format } from './num';
import { deserialize, newState, serialize } from './state';

const NOW = 1_000_000;

describe('costs', () => {
  it('first unit costs the base cost', () => {
    const drone = genById('drone');
    expect(costFor(drone, 0, 1).toNumber()).toBeCloseTo(drone.baseCost);
  });

  it('bulk cost equals the sum of single costs', () => {
    const hauler = genById('hauler');
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += hauler.baseCost * Math.pow(hauler.growth, 5 + i);
    expect(costFor(hauler, 5, 10).toNumber()).toBeCloseTo(sum, 6);
  });

  it('max affordable never overspends', () => {
    for (const gen of GENERATORS) {
      for (const owned of [0, 7, 42, 160]) {
        const scrap = costFor(gen, owned, 13).mul(1.0000001);
        const n = maxAffordable(gen, owned, scrap);
        expect(n).toBe(13);
        expect(costFor(gen, owned, n).lte(scrap)).toBe(true);
        expect(costFor(gen, owned, n + 1).gt(scrap)).toBe(true);
      }
    }
  });
});

describe('buying', () => {
  it('spends scrap and adds units', () => {
    const s = newState(NOW);
    s.scrap = D(100);
    expect(buyGenerator(s, 'drone', 1)).toBe(1);
    expect(s.owned.drone).toBe(1);
    expect(s.scrap.toNumber()).toBeCloseTo(100 - genById('drone').baseCost);
  });

  it('refuses when too poor', () => {
    const s = newState(NOW);
    s.scrap = D(5);
    expect(buyGenerator(s, 'drone', 1)).toBe(0);
    expect(buyGenerator(s, 'drone', 'max')).toBe(0);
    expect(s.scrap.toNumber()).toBe(5);
  });

  it('upgrades need their requirement and enough scrap', () => {
    const s = newState(NOW);
    s.scrap = D(1000);
    expect(buyUpgrade(s, 'claw1')).toBe(false); // needs a drone
    s.owned.drone = 1;
    expect(buyUpgrade(s, 'claw1')).toBe(true);
    expect(buyUpgrade(s, 'claw1')).toBe(false); // only once
    expect(tapValue(s, NOW).toNumber()).toBe(2);
  });
});

describe('income', () => {
  it('milestones double output', () => {
    const s = newState(NOW);
    s.owned.drone = 9;
    const before = baseIncome(s).toNumber();
    s.owned.drone = 10;
    expect(baseIncome(s).toNumber()).toBeCloseTo((before / 9) * 10 * 2);
    expect(nextMilestone(10)).toEqual({ at: 25, prev: 10 });
  });

  it('boost doubles income and taps, then cools down', () => {
    const s = newState(NOW);
    s.owned.drone = 4;
    expect(activateBoost(s, NOW)).toBe(true);
    expect(income(s, NOW + 1000).toNumber()).toBeCloseTo(4);
    expect(tap(s, NOW + 1000).toNumber()).toBe(2);
    expect(income(s, NOW + 31_000).toNumber()).toBeCloseTo(2);
    expect(activateBoost(s, NOW + 60_000)).toBe(false);
  });

  it('offline earnings are capped', () => {
    const s = newState(NOW);
    s.owned.drone = 2; // 1 scrap/s
    const { seconds, earned } = applyOffline(s, NOW + 10 * 60 * 60 * 1000);
    expect(seconds).toBe(OFFLINE_CAP_SEC);
    expect(earned.toNumber()).toBeCloseTo(OFFLINE_CAP_SEC);
  });
});

describe('save', () => {
  it('round-trips through JSON', () => {
    const s = newState(NOW);
    s.scrap = D('1.5e400');
    s.owned.smelter = 12;
    s.upgrades.add('claw1');
    const back = deserialize(serialize(s), NOW)!;
    expect(back.scrap.eq(s.scrap)).toBe(true);
    expect(back.owned.smelter).toBe(12);
    expect(back.upgrades.has('claw1')).toBe(true);
  });

  it('ignores garbage', () => {
    expect(deserialize('not json', NOW)).toBeNull();
    expect(deserialize(null, NOW)).toBeNull();
  });
});

describe('format', () => {
  it('uses short suffixes then letters', () => {
    expect(format(D(12.34))).toBe('12.3');
    expect(format(D(999))).toBe('999');
    expect(format(D(1234))).toBe('1.23K');
    expect(format(D(45_600_000))).toBe('45.6M');
    expect(format(D('1e33'))).toBe('1.00Dc');
    expect(format(D('1e36'))).toBe('1.00aa');
    expect(format(D('2.5e39'))).toBe('2.50ab');
  });
});
