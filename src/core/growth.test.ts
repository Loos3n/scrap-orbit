import { describe, expect, it } from 'vitest';
import { GROWTH, growthStage } from './growth';
import { emptyOwned } from './state';

describe('Station growth', () => {
  it('starts bare and grows with machines of any kind', () => {
    const owned = emptyOwned();
    expect(growthStage(owned)).toBe(0);
    owned.drone = 20;
    owned.hauler = 10;
    expect(growthStage(owned)).toBe(1);
    owned.smelter = 1000;
    expect(growthStage(owned)).toBe(GROWTH.length - 1);
  });
});
