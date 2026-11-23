import { describe, expect, it } from 'vitest';
import { CROPS, GARDEN, harvest, plant, plotCount, plotState, snackMult } from './garden';
import { DIVE, finishDive, pickDrop, refillCharges, startDive } from './dive';
import { income } from './economy';
import { deserialize, newState, serialize } from './state';

const MIN = 60_000;

function gardener() {
  const s = newState(0);
  s.tutorial = -1;
  s.tips.add('open:station');
  return s;
}

describe('Garden', () => {
  it('grows crops in real time and harvests them into snacks', () => {
    const s = gardener();
    expect(plotCount(s)).toBe(GARDEN.plots);
    expect(plant(s, 0, 'bean', 0)).toBe(false); // not unlocked yet
    expect(plant(s, 0, 'sprout', 0)).toBe(true);
    expect(plant(s, 0, 'sprout', 0)).toBe(false); // plot taken
    expect(harvest(s, 0, 4 * MIN)).toBeNull();
    expect(plotState(s, 0, 5 * MIN).ripe).toBe(true);
    expect(harvest(s, 0, 5 * MIN)?.crop.id).toBe('sprout');
    expect(snackMult(s, 'tap', 6 * MIN)).toBe(2);
    expect(snackMult(s, 'tap', 16 * MIN)).toBe(1);
    expect(s.garden.harvested).toBe(1);
  });

  it('opens more crops and plots as you go', () => {
    const s = gardener();
    s.garden.harvested = CROPS[CROPS.length - 1].unlockAt;
    expect(plant(s, 1, 'truffle', 0)).toBe(true);
    s.stats.relocations = GARDEN.thirdAtRelocations;
    s.galaxy.shifts = 1;
    expect(plotCount(s)).toBe(4);
  });

  it('a stronger income snack raises income', () => {
    const s = gardener();
    s.owned.drone = 10;
    const before = income(s, 0);
    s.garden.snacks.income = { mult: 2, until: 1000 };
    expect(income(s, 0).div(before).toNumber()).toBeCloseTo(2);
  });
});

describe('Salvage dives', () => {
  it('spends and refills charges', () => {
    const s = gardener();
    s.stats.relocations = DIVE.openAtRelocations;
    for (let i = 0; i < DIVE.chargesMax; i++) expect(startDive(s, 0)).toBe(true);
    expect(startDive(s, 0)).toBe(false);
    refillCharges(s, DIVE.chargeMin * MIN);
    expect(s.dive.charges).toBe(1);
  });

  it('records bests and caps crystals', () => {
    const s = gardener();
    expect(finishDive(s, 10, 99).crystals).toBe(DIVE.crystalCap + DIVE.bestCrystals);
    expect(finishDive(s, 20, 0)).toEqual({ best: true, crystals: DIVE.bestCrystals });
    expect(finishDive(s, 5, 1)).toEqual({ best: false, crystals: 1 });
    expect(s.dive.best).toBe(20);
  });

  it('drops every kind', () => {
    const kinds = new Set(Array.from({ length: 200 }, (_, i) => pickDrop(i / 200)));
    expect(kinds.size).toBe(4);
  });

  it('garden and dives save and load', () => {
    const s = gardener();
    plant(s, 0, 'sprout', 0);
    s.garden.snacks.boss = { mult: 2, until: 50 };
    s.dive.best = 33;
    const back = deserialize(serialize(s), 10)!;
    expect(back.garden.plots[0]).toEqual({ crop: 'sprout', at: 0 });
    expect(back.garden.snacks.boss).toEqual({ mult: 2, until: 50 });
    expect(back.dive.best).toBe(33);
  });
});

describe('minigame difficulty', () => {
  it('keeps dives tougher but fair', async () => {
    const { DIVE, DROPS } = await import('./dive');
    const total = Object.values(DROPS).reduce((n, d) => n + d.weight, 0);
    expect(DROPS.mine.weight / total).toBeGreaterThan(0.25);
    expect(DROPS.mine.weight / total).toBeLessThan(0.4);
    expect(DIVE.spawnGap - DIVE.spawnSqueeze).toBeGreaterThan(0.1);
    expect(DIVE.reach).toBeGreaterThanOrEqual(20);
  });

  it('gives each rarer catch a smaller, faster green zone', async () => {
    const { FISHING, RARITY } = await import('./fishing');
    const order = ['common', 'uncommon', 'rare', 'legendary'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(RARITY[order[i]].zone).toBeLessThan(RARITY[order[i - 1]].zone);
      expect(RARITY[order[i]].speed).toBeGreaterThan(RARITY[order[i - 1]].speed);
    }
    expect(FISHING.biteMs).toBeGreaterThanOrEqual(900);
  });
});
