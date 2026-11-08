import { describe, expect, it } from 'vitest';
import { GENERATORS, MARKS, UPGRADES } from './config';
import { markMult, markOf, modelName, nextMark } from './evolve';
import { generatorRate } from './economy';
import { newState } from './state';

describe('machine evolutions', () => {
  it('reaches a new model at each mark', () => {
    expect(markOf(99)).toBe(0);
    expect(markOf(100)).toBe(1);
    expect(markOf(250)).toBe(2);
    expect(markOf(500)).toBe(3);
    expect(markOf(1000)).toBe(4);
    expect(nextMark(120)?.at).toBe(250);
    expect(nextMark(1000)).toBeNull();
  });

  it('names the model', () => {
    expect(modelName('drone', 10)).toBe('Salvage Drone');
    expect(modelName('drone', 100)).toBe('Salvage Drone Mk II');
    expect(modelName('dyson', 1000)).toBe('Dyson Collector Mk V');
  });

  it('multiplies output on top of the milestone', () => {
    expect(markMult(100)).toBe(MARKS[0].mult);
    const s = newState(0);
    s.owned.drone = 99;
    const before = generatorRate(s, GENERATORS[0]).div(99).toNumber();
    s.owned.drone = 100;
    const after = generatorRate(s, GENERATORS[0]).div(100).toNumber();
    // The 100 milestone doubles output and Mk II adds its own multiplier.
    expect(after / before).toBeCloseTo(2 * MARKS[0].mult, 5);
  });
});

describe('upgrade tail', () => {
  it('has unique ids and a few upgrades for every machine', () => {
    const ids = UPGRADES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(UPGRADES.length).toBeGreaterThanOrEqual(100);
    for (const g of GENERATORS) expect(UPGRADES.filter((u) => u.requires.gen === g.id).length).toBeGreaterThanOrEqual(8);
  });

  it('prices every upgrade as a finite number', () => {
    for (const u of UPGRADES) expect(Number.isFinite(u.cost) && u.cost > 0).toBe(true);
  });
});
