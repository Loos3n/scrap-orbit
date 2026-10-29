import { describe, expect, it } from 'vitest';
import { bestPurchase, goalByKey, goalProgress, incomePurchases, pickGoal } from './advisor';
import { baseIncome, buyGenerator } from './economy';
import { D } from './num';
import { newState } from './state';

const NOW = 1_000_000;

describe('Buy best', () => {
  it('starts with a drone when there is no income yet', () => {
    const s = newState(NOW);
    const p = bestPurchase(s)!;
    expect(p.kind).toBe('machine');
    expect(p.id).toBe('drone');
  });

  it('leaves the save as it found it', () => {
    const s = newState(NOW);
    s.owned.drone = 12;
    s.owned.hauler = 3;
    s.scrap = D(1e6);
    const before = baseIncome(s).toNumber();
    incomePurchases(s);
    expect(s.owned.drone).toBe(12);
    expect(s.owned.hauler).toBe(3);
    expect(s.upgrades.size).toBe(0);
    expect(baseIncome(s).toNumber()).toBe(before);
  });

  it('never picks an upgrade that only helps taps', () => {
    const s = newState(NOW);
    s.owned.drone = 5;
    s.scrap = D(1e9);
    for (const p of incomePurchases(s)) expect(['claw1', 'grip1']).not.toContain(p.id);
  });

  it('grabs a cheap upgrade that doubles a big stack', () => {
    const s = newState(NOW);
    s.owned.drone = 40;
    s.scrap = D(1000);
    const p = bestPurchase(s)!;
    expect(p).toMatchObject({ kind: 'upgrade', id: 'drone1' });
  });

  it('counts the milestone a purchase reaches', () => {
    const s = newState(NOW);
    s.owned.drone = 9;
    s.owned.hauler = 1;
    s.scrap = D(500);
    const p = bestPurchase(s)!;
    expect(p).toMatchObject({ kind: 'machine', id: 'drone', count: 1 });
  });

  it('keeps finding something to buy through a long run', () => {
    const s = newState(NOW);
    s.scrap = D(15);
    for (let i = 0; i < 400; i++) {
      const p = bestPurchase(s);
      expect(p).not.toBeNull();
      s.scrap = s.scrap.add(p!.cost);
      if (p!.kind === 'upgrade') s.upgrades.add(p!.id);
      else buyGenerator(s, p!.id, p!.count);
    }
    expect(s.owned.smelter).toBeGreaterThan(0);
  });
});

describe('Next goal', () => {
  it('starts with the first drone', () => {
    const s = newState(NOW);
    expect(pickGoal(s)!.key).toBe('new:drone');
  });

  it('closes a goal once it is done', () => {
    const s = newState(NOW);
    const g = pickGoal(s)!;
    s.owned.drone = 1;
    expect(goalByKey(s, g.key)).toBeNull();
  });

  it('shows how close the scrap on hand is', () => {
    const s = newState(NOW);
    const g = pickGoal(s)!;
    s.scrap = g.cost.div(2);
    expect(goalProgress(s, g)).toBeCloseTo(0.5);
  });
});
