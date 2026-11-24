import { describe, expect, it } from 'vitest';
import { deserialize, newState, serialize } from './state';
import { globalMult } from './economy';
import * as w from './whale';

const NOW = 1_700_000_000_000;
const H = 3_600_000;

function hatched(now = NOW) {
  const s = newState(now);
  s.tutorial = -1;
  w.findEgg(s, now, 0);
  w.hatchIfReady(s, now + w.WHALE.hatchMinutes * 60_000);
  return s;
}

describe('Stardrifter', () => {
  it('waits for a settled-in captain before an egg turns up', () => {
    const s = newState(NOW);
    s.tutorial = -1;
    expect(w.eggDue(s)).toBe(false);
    s.stats.playSec = w.WHALE.eggAfterPlaySec;
    expect(w.eggDue(s)).toBe(true);
    w.findEgg(s, NOW, 0.5);
    expect(s.whale.phase).toBe('egg');
    expect(s.whale.name).not.toBe('');
    expect(w.eggDue(s)).toBe(false);
  });

  it('hatches after an hour, sooner when warmed', () => {
    const s = newState(NOW);
    w.findEgg(s, NOW, 0);
    expect(w.hatchIfReady(s, NOW + 40 * 60_000)).toBe(false);
    for (let i = 0; i < 10; i++) w.warmEgg(s);
    expect(s.whale.warmed).toBe(w.WHALE.warmMax);
    expect(w.hatchIfReady(s, NOW + 30 * 60_000)).toBe(true);
    expect(s.whale.phase).toBe('born');
    expect(s.whale.hunger).toBe(1);
  });

  it('gets hungry again over time, up to three meals', () => {
    const s = hatched();
    const t0 = s.whale.at;
    w.settleWhale(s, t0 + 2.5 * H);
    expect(s.whale.hunger).toBe(2);
    w.settleWhale(s, t0 + 30 * H);
    expect(s.whale.hunger).toBe(w.WHALE.mealsMax);
  });

  it('only eats when hungry, and grows from meals', () => {
    const s = hatched();
    const t = s.whale.at;
    expect(w.feedWhale(s, t)?.growth).toBe(w.WHALE.mealGrowth);
    expect(w.feedWhale(s, t)).toBeNull();
    expect(s.whale.growth).toBe(w.WHALE.mealGrowth);
  });

  it('sulks while starving and cheers up once fed', () => {
    const s = hatched();
    const t = s.whale.at;
    const start = s.whale.mood;
    // Hungry slots fill up after a few hours; starving for a day pulls mood down to the floor.
    w.settleWhale(s, t + 30 * H);
    expect(s.whale.mood).toBeLessThan(start);
    expect(s.whale.mood).toBeGreaterThanOrEqual(w.WHALE.moodFloor);
    expect(w.moodWord(s)).toBe('Sulking');
    const low = s.whale.mood;
    w.feedWhale(s, t + 30 * H);
    w.feedWhale(s, t + 30 * H);
    expect(s.whale.mood).toBeGreaterThan(low);
  });

  it('counts only the time spent starving against its mood', () => {
    const s = hatched();
    const t = s.whale.at;
    s.whale.mood = 50;
    // Hungry for 1 of 3 meals: two more slots take 4 hours, then 2 hours starving.
    w.settleWhale(s, t + 6 * H);
    expect(s.whale.mood).toBeCloseTo(50 + 4 * w.WHALE.moodUpPerHour - 2 * w.WHALE.moodDownPerHour, 5);
  });

  it('grows through every stage and sings at each', () => {
    const s = hatched();
    expect(w.pendingSong(s)?.id).toBe('first');
    w.hearSong(s, 'first');
    expect(w.pendingSong(s)).toBeNull();
    s.whale.growth = w.WHALE_STAGES[1].at;
    expect(w.whaleStage(s).id).toBe('calf');
    expect(w.pendingSong(s)?.id).toBe('field');
    for (const id of ['field', 'plates', 'elder', 'home'] as const) {
      s.whale.growth = 1000;
      expect(w.hearSong(s, id)).toBe(true);
    }
    expect(w.whaleStage(s).id).toBe('elder');
    expect(w.pendingSong(s)).toBeNull();
    expect(w.canTow(s)).toBe(true);
    expect(w.towToNursery(s)).toBe(true);
    expect(w.pendingSong(s)?.id).toBe('nursery');
    expect(w.canTow(s)).toBe(false);
  });

  it('reports a new stage when a meal crosses into it', () => {
    const s = hatched();
    s.whale.growth = w.WHALE_STAGES[1].at - 1;
    const grew = w.feedWhale(s, s.whale.at)!;
    expect(grew.stage?.id).toBe('calf');
  });

  it('caps the crew treats each day', () => {
    const s = hatched();
    let n = 0;
    while (w.treatWhale(s, NOW + H)) n++;
    expect(n).toBe(w.WHALE.treatsPerDay);
    expect(w.treatWhale(s, NOW + 30 * H)).not.toBeNull();
  });

  it('adds income as it grows, more when happy, and for good at the Nursery', () => {
    const s = hatched();
    const base = newState(NOW);
    const ratio = () => globalMult(s) / globalMult(base);
    s.whale.mood = 100;
    expect(ratio()).toBeCloseTo(1.05, 5);
    s.whale.mood = w.WHALE.moodFloor;
    expect(ratio()).toBeLessThan(1.05);
    s.whale.growth = 10_000;
    s.whale.mood = 100;
    expect(ratio()).toBeCloseTo(1.5, 5);
    s.whale.nursery = true;
    expect(ratio()).toBeCloseTo(1.5 * 1.5, 5);
  });

  it('gulps wrecks only once big enough', () => {
    const s = hatched();
    s.whale.gulpAt = 0;
    expect(w.gulpDue(s, NOW)).toBe(0);
    s.whale.growth = w.WHALE_STAGES[1].at;
    expect(w.gulpDue(s, NOW + H)).toBe(w.WHALE_STAGES[1].gulp);
    w.scheduleGulp(s, NOW + H, 0);
    expect(w.gulpDue(s, NOW + H + 60_000)).toBe(0);
  });

  it('tidies names', () => {
    expect(w.cleanWhaleName('  Big   <b>Blue</b>!! ')).toBe('Big bBlueb');
    expect(w.cleanWhaleName('A very long whale name indeed')).toHaveLength(14);
  });

  it('survives a save and load, and old saves start without one', () => {
    const s = hatched();
    s.whale.growth = 123;
    s.whale.name = 'Lumen';
    s.whale.songs = 2;
    const back = deserialize(serialize(s), NOW + 2 * H)!;
    expect(back.whale.phase).toBe('born');
    expect(back.whale.growth).toBe(123);
    expect(back.whale.name).toBe('Lumen');
    expect(back.whale.songs).toBe(2);
    const old = JSON.parse(serialize(newState(NOW)));
    delete old.whale;
    expect(deserialize(JSON.stringify(old), NOW)!.whale.phase).toBe('none');
  });
});
