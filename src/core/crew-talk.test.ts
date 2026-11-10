import { describe, expect, it } from 'vitest';
import { CREW } from './content';
import { PERSONAL, crewLine, type TalkContext } from './crew-talk';

const ctx: TalkContext = { night: false, boss: false, festival: false, sector: 'Ember Reach', level: 1, caught: 0, aboard: 3 };
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length];
};

describe('crew talk', () => {
  it('gives every crew member their own lines', () => {
    for (const c of CREW) expect(PERSONAL[c.id].length).toBeGreaterThanOrEqual(5);
  });

  it('mostly speaks in their own voice', () => {
    expect(PERSONAL.ash).toContain(crewLine('ash', 'poke', ctx, seq(0.1, 0)));
  });

  it('cheers during a boss and whispers at night', () => {
    expect(crewLine('bolt', 'poke', { ...ctx, boss: true }, seq(0))).toMatch(/!/);
    expect(crewLine('bolt', 'poke', { ...ctx, night: true }, seq(0))).toMatch(/[Nn]ight|asleep|stars/);
  });

  it('greets on arrival and on coming home', () => {
    expect(crewLine('pip', 'hello', ctx, seq(0))).toBe('Reporting for duty!');
    expect(crewLine('pip', 'home', ctx, seq(0))).toMatch(/trip/);
  });

  it('can mention the sector, and never returns an empty line', () => {
    const lines = new Set<string>();
    for (let i = 0; i < 400; i++) lines.add(crewLine('juno', 'idle', { ...ctx, festival: true, caught: 4 }));
    expect([...lines].some((l) => l.includes('Ember Reach'))).toBe(true);
    expect([...lines].some((l) => l.includes('4 critters'))).toBe(true);
    for (const l of lines) expect(l.length).toBeGreaterThan(3);
  });
});
