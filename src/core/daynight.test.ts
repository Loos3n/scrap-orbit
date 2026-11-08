import { describe, expect, it } from 'vitest';
import { daylightAt } from './daynight';

describe('day and night', () => {
  it('is full day at noon and full night at midnight', () => {
    expect(daylightAt(12)).toMatchObject({ night: 0, warm: 0, phase: 'day' });
    expect(daylightAt(0)).toMatchObject({ night: 1, warm: 0, phase: 'night' });
    expect(daylightAt(3).phase).toBe('night');
  });

  it('fades through warm dawn and dusk', () => {
    const dawn = daylightAt(6.75);
    expect(dawn.phase).toBe('dawn');
    expect(dawn.night).toBeGreaterThan(0.2);
    expect(dawn.night).toBeLessThan(0.8);
    expect(dawn.warm).toBeGreaterThan(0.9);
    const dusk = daylightAt(19.75);
    expect(dusk.phase).toBe('dusk');
    expect(dusk.warm).toBeGreaterThan(0.5);
    expect(daylightAt(22).phase).toBe('night');
  });

  it('changes smoothly from hour to hour', () => {
    let prev = daylightAt(0);
    for (let m = 1; m <= 24 * 60; m++) {
      const cur = daylightAt(m / 60);
      expect(Math.abs(cur.night - prev.night)).toBeLessThan(0.02);
      expect(Math.abs(cur.warm - prev.warm)).toBeLessThan(0.03);
      prev = cur;
    }
  });
});
