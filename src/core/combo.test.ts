import { describe, expect, it } from 'vitest';
import { COMBO, comboMult, cooled, heatAfterTap } from './combo';

describe('combo tapping', () => {
  it('builds heat with quick taps and tops out at 1', () => {
    let h = 0;
    for (let i = 0; i < 10; i++) h = heatAfterTap(h, 0.15);
    expect(h).toBeCloseTo(10 * COMBO.perTap);
    for (let i = 0; i < 30; i++) h = heatAfterTap(h, 0.15);
    expect(h).toBe(1);
    expect(comboMult(h)).toBe(COMBO.maxMult);
  });

  it('holds briefly, then cools to nothing', () => {
    expect(cooled(0.8, COMBO.holdSec)).toBe(0.8);
    expect(cooled(0.8, COMBO.holdSec + 1)).toBeCloseTo(0.8 - COMBO.coolPerSec);
    expect(cooled(0.8, 60)).toBe(0);
    expect(comboMult(0)).toBe(1);
  });

  it('slow taps never build up', () => {
    let h = 0;
    for (let i = 0; i < 50; i++) h = heatAfterTap(h, 2);
    expect(h).toBeCloseTo(COMBO.perTap);
  });
});
