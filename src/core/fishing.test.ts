import { describe, expect, it } from 'vitest';
import { CRITTERS, FISHING, RARITY, baitSecondsLeft, critterPool, hook, landCatch, markerAt, pickCritter, refillBait, speciesCaught, tankCritters } from './fishing';
import { deserialize, newState, serialize } from './state';

const MIN = 60_000;

describe('Space fishing', () => {
  it('has 20 critters with unique ids, and every rarity', () => {
    expect(CRITTERS).toHaveLength(20);
    expect(new Set(CRITTERS.map((c) => c.id)).size).toBe(20);
    for (const r of Object.keys(RARITY)) expect(CRITTERS.some((c) => c.rarity === r)).toBe(true);
  });

  it('spends bait only when something is hooked, and refills it over time', () => {
    const s = newState(0);
    expect(s.fishing.bait).toBe(FISHING.baitMax);
    for (let i = 0; i < FISHING.baitMax; i++) expect(hook(s, 1000)).toBe(true);
    expect(hook(s, 1000)).toBe(false);
    expect(s.fishing.casts).toBe(FISHING.baitMax);
    expect(baitSecondsLeft(s, 1000)).toBe(FISHING.baitMin * 60);
    refillBait(s, 1000 + FISHING.baitMin * MIN * 2 + 5);
    expect(s.fishing.bait).toBe(2);
    // The part-way refill carries over.
    expect(baitSecondsLeft(s, 1000 + FISHING.baitMin * MIN * 2 + 5)).toBe(FISHING.baitMin * 60);
    refillBait(s, 1000 + FISHING.baitMin * MIN * 100);
    expect(s.fishing.bait).toBe(FISHING.baitMax);
    expect(baitSecondsLeft(s, 1000 + FISHING.baitMin * MIN * 100)).toBe(0);
  });

  it('keeps deeper critters for deeper sectors', () => {
    const s = newState(0);
    const early = critterPool(s);
    expect(early.every((c) => !c.jumps && !c.shifted)).toBe(true);
    s.stats.relocations = 8;
    expect(critterPool(s).some((c) => c.id === 'voidkraken')).toBe(true);
    expect(critterPool(s).some((c) => c.id === 'galaxyjelly')).toBe(false);
    s.galaxy.shifts = 1;
    expect(critterPool(s)).toHaveLength(CRITTERS.length);
  });

  it('picks by rarity weight, and only from the pool', () => {
    const s = newState(0);
    const pool = new Set(critterPool(s).map((c) => c.id));
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const c = pickCritter(s, i / 1000);
      expect(pool.has(c.id)).toBe(true);
      counts[c.rarity] = (counts[c.rarity] ?? 0) + 1;
    }
    expect(counts.common).toBeGreaterThan(counts.uncommon);
    expect(counts.legendary ?? 0).toBe(0);
    expect(pickCritter(s, 0.9999).id).toBeTruthy();
  });

  it('pays scrap, crystals for a first catch, and a surge for a legendary', () => {
    const s = newState(0);
    const before = s.crystals;
    const a = landCatch(s, 'boltfin', 1000)!;
    expect(a.first).toBe(true);
    expect(a.crystals).toBe(RARITY.common.crystals);
    expect(a.scrap.gt(0)).toBe(true);
    expect(s.crystals).toBe(before + RARITY.common.crystals);
    const b = landCatch(s, 'boltfin', 1000)!;
    expect(b.first).toBe(false);
    expect(b.crystals).toBe(0);
    const w = landCatch(s, 'starwhale', 1000)!;
    expect(w.surge).toBe(true);
    expect(s.crateBuffs.surge).toBeGreaterThan(1000);
    expect(landCatch(s, 'nope', 1000)).toBeNull();
    expect(speciesCaught(s)).toBe(2);
    expect(tankCritters(s).map((c) => c.id)).toEqual(['starwhale', 'boltfin']);
  });

  it('sweeps the marker back and forth', () => {
    expect(markerAt(0, 1)).toBe(0);
    expect(markerAt(0.5, 1)).toBeCloseTo(0.5);
    expect(markerAt(1, 1)).toBeCloseTo(1);
    expect(markerAt(1.5, 1)).toBeCloseTo(0.5);
  });

  it('saves and loads, ignoring unknown critters', () => {
    const s = newState(0);
    s.fishing.bait = 2;
    s.fishing.baitAt = 500;
    s.fishing.casts = 9;
    s.fishing.caught = { boltfin: 3, starwhale: 1 };
    const raw = JSON.parse(serialize(s));
    raw.fishing.caught.fake = 4;
    raw.fishing.bait = 99;
    const back = deserialize(JSON.stringify(raw), 1000)!;
    expect(back.fishing.caught).toEqual({ boltfin: 3, starwhale: 1 });
    expect(back.fishing.bait).toBe(FISHING.baitMax);
    expect(back.fishing.casts).toBe(9);
    const old = JSON.parse(serialize(s));
    delete old.fishing;
    expect(deserialize(JSON.stringify(old), 1000)!.fishing.bait).toBe(FISHING.baitMax);
  });
});
