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

  it('reminds about the whale, the planet, the garden and the drydock', () => {
    const s = newState(0);
    s.tutorial = -1;
    s.whale.phase = 'born';
    s.whale.name = 'Pip';
    s.whale.hunger = 1;
    s.whale.hungerAt = 0;
    s.planet.found = true;
    s.planet.name = 'Verda';
    s.planet.loads = 3;
    s.planet.settleAt = 900_000;
    s.garden.plots[0] = { crop: 'bean', at: 0 };
    const list = reminders(s, 0);
    const whale = list.find((r) => r.title === 'Pip is hungry')!;
    // Two more bowls to empty, two hours each.
    expect(whale.at).toBe(4 * 3_600_000);
    expect(list.find((r) => r.title.endsWith('took hold'))!.at).toBe(900_000);
    expect(list.find((r) => r.title === 'The garden is ripe')!.at).toBe(20 * 60_000);
  });

  it('says when the egg hatches', () => {
    const s = newState(0);
    s.whale.phase = 'egg';
    s.whale.eggAt = 0;
    expect(reminders(s, 0).find((r) => r.title === 'The egg is hatching!')!.at).toBe(60 * 60_000);
  });
});
