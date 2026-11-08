import { describe, expect, it } from 'vitest';
import { MAX_SAMPLES, recordIncome, recordRun } from './history';
import { deserialize, newState, serialize } from './state';

describe('Stats history', () => {
  it('samples income every ten minutes and keeps a day of it', () => {
    const s = newState(0);
    s.owned.drone = 10;
    recordIncome(s, 0);
    recordIncome(s, 60_000);
    expect(s.history.income).toHaveLength(1);
    for (let i = 1; i <= 200; i++) recordIncome(s, i * 600_000);
    expect(s.history.income).toHaveLength(MAX_SAMPLES);
  });

  it('remembers runs and survives a save', () => {
    const s = newState(0);
    s.stats.runSec = 1800;
    recordRun(s, 7, 1000);
    const back = deserialize(serialize(s), 0)!;
    expect(back.history.runs).toEqual([{ t: 1000, sector: 0, minutes: 30, cores: 7 }]);
  });
});
