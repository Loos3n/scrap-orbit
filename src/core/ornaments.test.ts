import { describe, expect, it } from 'vitest';
import { ORNAMENTS, checkOrnaments, toggleOrnament } from './ornaments';
import { deserialize, newState, serialize } from './state';

const NOW = 1_000_000;

describe('station decorations', () => {
  it('start locked and unlock, put up, as the player hits each goal', () => {
    const s = newState(NOW);
    expect(checkOrnaments(s)).toEqual([]);
    s.owned.drone = 10;
    s.owned.hauler = 1;
    expect(checkOrnaments(s).map((o) => o.id)).toEqual(['bulbs', 'fern']);
    expect(s.ornaments.on.has('bulbs')).toBe(true);
    expect(checkOrnaments(s)).toEqual([]);
  });

  it('stay earned after a relocation resets the machines', () => {
    const s = newState(NOW);
    s.owned.drone = 10;
    checkOrnaments(s);
    s.owned.drone = 0;
    expect(checkOrnaments(s)).toEqual([]);
    expect(s.ornaments.got.has('bulbs')).toBe(true);
  });

  it('can be taken down and put back, but only once earned', () => {
    const s = newState(NOW);
    expect(toggleOrnament(s, 'duck')).toBe(false);
    s.taps = 1000;
    checkOrnaments(s);
    expect(toggleOrnament(s, 'duck')).toBe(true);
    expect(s.ornaments.on.has('duck')).toBe(false);
    toggleOrnament(s, 'duck');
    expect(s.ornaments.on.has('duck')).toBe(true);
  });

  it('survive a save and load, dropping unknown ids', () => {
    const s = newState(NOW);
    s.ornaments.got = new Set(['bulbs', 'neon']);
    s.ornaments.on = new Set(['neon']);
    const data = JSON.parse(serialize(s));
    data.ornaments.got.push('nope');
    data.ornaments.on.push('bulbs', 'nope', 'duck');
    const back = deserialize(JSON.stringify(data), NOW)!;
    expect([...back.ornaments.got].sort()).toEqual(['bulbs', 'neon']);
    expect([...back.ornaments.on].sort()).toEqual(['bulbs', 'neon']);
  });

  it('every decoration has a goal the player can reach', () => {
    for (const o of ORNAMENTS) {
      const [, need] = o.progress(newState(NOW));
      expect(need).toBeGreaterThan(0);
    }
  });
});
