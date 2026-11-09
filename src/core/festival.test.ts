import { describe, expect, it } from 'vitest';
import { buyFestival, cocoaMult, dailyPresent, earnFlakes, festivalOn, festivalSecondsLeft } from './festival';
import { checkOrnaments } from './ornaments';
import { deserialize, newState, serialize } from './state';
import { allPaints } from './weekly';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();
const ready = () => {
  const s = newState(0);
  s.tutorial = -1;
  return s;
};

describe('Frost Festival', () => {
  it('runs from 1 December to 6 January', () => {
    expect(festivalOn(at(2026, 10, 30))).toBe(false);
    expect(festivalOn(at(2026, 11, 1, 0))).toBe(true);
    expect(festivalOn(at(2026, 11, 25))).toBe(true);
    expect(festivalOn(at(2027, 0, 6, 23))).toBe(true);
    expect(festivalOn(at(2027, 0, 7, 0))).toBe(false);
    expect(festivalSecondsLeft(at(2027, 0, 6, 12))).toBeCloseTo(12 * 3600, -1);
  });

  it('earns snowflakes only while it runs, and one present a day', () => {
    const s = ready();
    expect(earnFlakes(s, at(2026, 10, 20), 'crate')).toBe(0);
    expect(earnFlakes(s, at(2026, 11, 2), 'crate')).toBe(1);
    expect(earnFlakes(s, at(2026, 11, 2), 'boss')).toBe(5);
    expect(dailyPresent(s, at(2026, 11, 2))).toBe(5);
    expect(dailyPresent(s, at(2026, 11, 2, 20))).toBe(0);
    expect(dailyPresent(s, at(2026, 11, 3))).toBe(5);
    expect(s.festival.flakes).toBe(16);
  });

  it('can be tried early with the preview switch', () => {
    const s = ready();
    s.festival.test = true;
    expect(earnFlakes(s, at(2026, 10, 9), 'boss')).toBe(5);
  });

  it('sells cocoa, decorations, a paint and stockings for snowflakes, and keeps them in the save', () => {
    const s = ready();
    const now = at(2026, 11, 10);
    s.festival.flakes = 200;
    expect(buyFestival(s, 'cocoa', now)).toBe(true);
    expect(cocoaMult(s, now + 29 * 60_000)).toBe(2);
    expect(cocoaMult(s, now + 31 * 60_000)).toBe(1);
    expect(buyFestival(s, 'snowman', now)).toBe(true);
    expect(buyFestival(s, 'snowman', now)).toBe(false);
    expect(checkOrnaments(s).map((o) => o.id)).toContain('snowman');
    expect(buyFestival(s, 'hoarfrost', now)).toBe(true);
    expect(s.decor.owned.has('hoarfrost')).toBe(true);
    expect(allPaints().some((p) => p.id === 'hoarfrost')).toBe(true);
    const crystals = s.crystals;
    expect(buyFestival(s, 'stocking', now)).toBe(true);
    expect(s.crystals).toBe(crystals + 15);
    expect(buyFestival(s, 'startree', at(2027, 1, 1))).toBe(false);
    const back = deserialize(serialize(s), now)!;
    expect(back.festival.flakes).toBe(s.festival.flakes);
    expect(back.festival.bought.has('snowman')).toBe(true);
    expect(back.ornaments.got.has('snowman')).toBe(true);
    expect(back.decor.owned.has('hoarfrost')).toBe(true);
  });
});
