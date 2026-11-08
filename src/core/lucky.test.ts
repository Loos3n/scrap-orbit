import { describe, expect, it } from 'vitest';
import { baseIncome } from './economy';
import { catchStar } from './lucky';
import { newState } from './state';

describe('Lucky shooting stars', () => {
  const station = () => {
    const s = newState(0);
    s.owned.drone = 50;
    return s;
  };

  it('pays a jackpot of an hour of income one time in ten', () => {
    const s = station();
    const p = catchStar(s, 0, 0.05);
    expect(p.kind).toBe('jackpot');
    expect(s.scrap.toNumber()).toBeCloseTo(baseIncome(s).toNumber() * 3600);
    expect(s.stats.stars).toBe(1);
  });

  it('can bring crystals, a free Overdrive or ten minutes of scrap', () => {
    expect(catchStar(station(), 0, 0.2).kind).toBe('crystals');
    const s = station();
    expect(catchStar(s, 1000, 0.4).kind).toBe('overdrive');
    expect(s.boostUntil).toBeGreaterThan(1000);
    expect(s.boostReadyAt).toBe(0);
    expect(catchStar(station(), 0, 0.9).kind).toBe('scrap');
  });
});
