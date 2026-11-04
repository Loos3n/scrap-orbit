import { describe, expect, it } from 'vitest';
import { activateBoost, tapValue } from './economy';
import { useDecor } from './meta';
import { newState } from './state';
import { WEEKLIES, claimWeekly, updateWeekly, weekOf, weeklyClaimable, weeklyFor, weeklyProgress } from './weekly';

const MON = new Date(2026, 10, 2, 10).getTime(); // a Monday
const DAY = 86_400_000;

function started(id: string) {
  const s = newState(MON);
  s.tutorial = -1;
  let t = MON;
  while (weeklyFor(weekOf(t).index).id !== id) t += 7 * DAY;
  updateWeekly(s, t);
  return { s, t };
}

describe('Weekly event', () => {
  it('keeps one event for the whole week and rotates through all four', () => {
    expect(weekOf(MON).key).toBe(weekOf(MON + 6 * DAY).key);
    expect(weekOf(MON).key).not.toBe(weekOf(MON + 7 * DAY).key);
    const seen = new Set([0, 1, 2, 3].map((i) => weeklyFor(weekOf(MON + i * 7 * DAY).index).id));
    expect(seen.size).toBe(WEEKLIES.length);
  });

  it('counts from the start of the week and pays tiers in order, the last one a paint', () => {
    const { s } = started('taps');
    s.taps += 1500;
    expect(weeklyProgress(s).tier).toBe(1);
    expect(claimWeekly(s)!.crystals).toBe(10);
    expect(weeklyClaimable(s)).toBe(0);
    s.taps += 20000;
    expect(claimWeekly(s)!.crystals).toBe(25);
    expect(claimWeekly(s)!.paint).toBe('neon');
    expect(s.decor.owned.has('neon')).toBe(true);
    expect(claimWeekly(s)).toBeNull();
  });

  it('bends the rules while it runs', () => {
    const taps = started('taps').s;
    const plain = newState(MON);
    plain.tutorial = -1;
    expect(tapValue(taps, MON).toNumber()).toBe(tapValue(plain, MON).toNumber() * 2);
    const { s, t } = started('solar');
    activateBoost(s, t);
    activateBoost(plain, t);
    expect(s.boostReadyAt).toBeLessThan(plain.boostReadyAt);
  });

  it('never sells an event paint', () => {
    const s = newState(MON);
    s.crystals = 999;
    expect(useDecor(s, 'neon')).toBe(false);
  });
});
