import { describe, expect, it } from 'vitest';
import { newState } from './core/state';
import { reminders } from './notify';

describe('Phone reminders', () => {
  it('reminds when storage fills and when research finishes', () => {
    const s = newState(0);
    s.tutorial = -1;
    s.owned.drone = 5;
    s.research.active = { id: 'log1', endsAt: 3_600_000 } as typeof s.research.active;
    const list = reminders(s, 0);
    expect(list.map((r) => r.title)).toEqual(['Scrap storage is full', 'Research complete']);
    expect(list[0].at).toBe(8 * 3_600_000);
  });

  it('stays quiet for a station that earns nothing', () => {
    const s = newState(0);
    s.tutorial = -1;
    expect(reminders(s, 0)).toEqual([]);
  });
});
