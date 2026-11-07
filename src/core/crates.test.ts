import { describe, expect, it } from 'vitest';
import { CRATE_BUFFS } from './crate-buffs';
import { CRATE_ODDS, crateValue, openCrate, openMiniCrate, pickCrate } from './crates';
import { baseIncome, income, relocate, tapValue } from './economy';
import { D } from './num';
import { deserialize, newState, serialize } from './state';

const NOW = new Date(2026, 10, 7, 12).getTime();

function station() {
  const s = newState(NOW);
  s.owned.drone = 50;
  s.owned.hauler = 10;
  s.tutorial = -1;
  return s;
}

describe('lucky crates', () => {
  it('odds add up to 100 and every surprise can turn up', () => {
    expect(Object.values(CRATE_ODDS).reduce((a, b) => a + b, 0)).toBe(100);
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(pickCrate(i / 100 + 0.001));
    expect([...seen].sort()).toEqual(Object.keys(CRATE_ODDS).sort());
  });

  it('is always plain scrap during the tutorial', () => {
    const s = station();
    for (let r = 0; r < 1; r += 0.05) expect(openCrate(s, NOW, r, false).kind).toBe('scrap');
    expect(s.stats.crates).toBe(20);
    expect(s.stats.surprises ?? 0).toBe(0);
  });

  it('a plain crate pays its value', () => {
    const s = station();
    const value = crateValue(s, NOW);
    const p = openCrate(s, NOW, 0);
    expect(p.kind).toBe('scrap');
    expect(s.scrap.eq(value)).toBe(true);
  });

  it('a power surge multiplies income, stacks its time, and ends', () => {
    const s = station();
    const before = income(s, NOW);
    const p = openCrate(s, NOW, 0.43);
    expect(p).toEqual({ kind: 'buff', id: 'surge', seconds: CRATE_BUFFS.surge.seconds });
    expect(income(s, NOW + 1000).div(before).toNumber()).toBeCloseTo(CRATE_BUFFS.surge.mult);
    openCrate(s, NOW + 10_000, 0.43);
    expect(s.crateBuffs.surge).toBe(NOW + CRATE_BUFFS.surge.seconds * 2000);
    expect(income(s, s.crateBuffs.surge).eq(before)).toBe(true);
    expect(s.stats.surprises).toBe(2);
  });

  it('a claw frenzy multiplies taps but not income', () => {
    const s = station();
    const tap = tapValue(s, NOW);
    const inc = income(s, NOW);
    expect(openCrate(s, NOW, 0.6)).toMatchObject({ kind: 'buff', id: 'frenzy' });
    expect(tapValue(s, NOW + 1).div(tap).toNumber()).toBeCloseTo(CRATE_BUFFS.frenzy.mult);
    expect(tapValue(s, NOW + 1, true).eq(tap)).toBe(true);
    expect(income(s, NOW + 1).eq(inc)).toBe(true);
  });

  it('a big haul grows with banked scrap, capped at 15 minutes of income', () => {
    const s = station();
    const floor = crateValue(s, NOW).mul(4);
    expect((openCrate(s, NOW, 0.75) as { amount: typeof floor }).amount.eq(floor)).toBe(true);
    s.scrap = D(1e30);
    const p = openCrate(s, NOW, 0.75) as { kind: string; amount: typeof floor };
    expect(p.kind).toBe('haul');
    expect(p.amount.eq(baseIncome(s).mul(900))).toBe(true);
  });

  it('a swarm spills little crates worth half a crate each', () => {
    const s = station();
    const p = openCrate(s, NOW, 0.85, true, () => 0.99);
    expect(p).toMatchObject({ kind: 'swarm', count: 8 });
    const each = (p as { each: typeof s.scrap }).each;
    expect(each.eq(crateValue(s, NOW).mul(0.5))).toBe(true);
    expect(s.scrap.eq(0)).toBe(true);
    expect(openMiniCrate(s, each).eq(each)).toBe(true);
  });

  it('a crystal stash pays 3 to 8 crystals', () => {
    const s = station();
    expect(openCrate(s, NOW, 0.95, true, () => 0)).toEqual({ kind: 'crystals', amount: 3 });
    expect(openCrate(s, NOW, 0.95, true, () => 0.999)).toEqual({ kind: 'crystals', amount: 8 });
    expect(s.crystals).toBe(11);
  });

  it('a spare battery recharges Overdrive, or becomes a surge if it is ready', () => {
    const s = station();
    s.boostReadyAt = NOW + 60_000;
    expect(openCrate(s, NOW, 0.99)).toEqual({ kind: 'battery' });
    expect(s.boostReadyAt).toBe(NOW);
    expect(openCrate(s, NOW, 0.99)).toMatchObject({ kind: 'buff', id: 'surge' });
  });

  it('buffs survive a save and end on relocation', () => {
    const s = station();
    openCrate(s, NOW, 0.43);
    openCrate(s, NOW, 0.6);
    const back = deserialize(serialize(s), NOW);
    expect(back!.crateBuffs).toEqual(s.crateBuffs);
    s.lifetime = D(1e15);
    s.allTime = D(1e15);
    relocate(s, NOW);
    expect(s.crateBuffs).toEqual({ surge: 0, frenzy: 0 });
  });
});
