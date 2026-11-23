import { describe, expect, it } from 'vitest';
import { globalMult } from './economy';
import { fishingOpen } from './fishing';
import { CAPTAIN_PAINT_ID, FISHING_RANK, RANKS, RANK_INCOME, checkJourney, claimRank, currentRank, journeyDone, rankReady, rankTitle, taskProgress } from './journey';
import { D } from './num';
import { deserialize, newState, serialize, type GameState } from './state';

const NOW = new Date(2026, 10, 23, 12).getTime();
const DAY = 86_400_000;

const hooks = (s: GameState) => ({
  scrapFor: (min: number) => D(min * 100),
  earn: (n: ReturnType<typeof D>) => (s.scrap = s.scrap.add(n)),
  crystals: (n: number) => (s.crystals += n),
  adopt: (id: 'cat' | 'pup' | 'owl' | 'blob') => (s.pets.owned.has(id) ? false : (s.pets.owned.add(id), true)),
});

/** A new captain who has finished the tutorial. */
function captain(): GameState {
  const s = newState(NOW);
  s.tutorial = -1;
  return s;
}

describe('Captain ranks', () => {
  it('has nine ranks of three tasks, with unique task ids', () => {
    expect(RANKS).toHaveLength(9);
    const ids = RANKS.flatMap((r) => r.tasks.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RANKS) expect(r.reward.crystals).toBeGreaterThan(0);
  });

  it('waits for the tutorial before ticking anything off', () => {
    const s = newState(NOW);
    s.owned.drone = 10;
    expect(checkJourney(s, NOW)).toEqual([]);
    s.tutorial = -1;
    expect(checkJourney(s, NOW).map((t) => t.id)).toEqual(['drones10']);
  });

  it('keeps a task ticked once it is met', () => {
    const s = captain();
    s.owned.drone = 10;
    checkJourney(s, NOW);
    s.owned.drone = 0;
    expect(checkJourney(s, NOW)).toEqual([]);
    expect(taskProgress(s, RANKS[0].tasks[0])).toEqual([10, 10]);
  });

  it('pays the reward and promotes once all three tasks are met', () => {
    const s = captain();
    expect(claimRank(s, hooks(s))).toBeNull();
    s.owned.drone = 10;
    s.stats.crates = 2;
    s.claw = 3;
    checkJourney(s, NOW);
    expect(rankReady(s)).toBe(true);
    const before = globalMult(s);
    const c = claimRank(s, hooks(s))!;
    expect(c.rank.title).toBe('Deckhand');
    expect(s.crystals).toBe(RANKS[0].reward.crystals);
    expect(s.scrap.toNumber()).toBe(RANKS[0].reward.scrapMin! * 100);
    expect(rankTitle(s)).toBe('Deckhand');
    expect(currentRank(s)!.title).toBe('Salvager');
    expect(globalMult(s) / before).toBeCloseTo(1 + RANK_INCOME);
    // Claiming again does nothing until the next rank's tasks are met.
    expect(claimRank(s, hooks(s))).toBeNull();
  });

  it('gives the Mechanic a cat, or crystals if one is already aboard', () => {
    const s = captain();
    s.journey.rank = 3;
    for (const t of RANKS[3].tasks) s.journey.met.add(t.id);
    const c = claimRank(s, hooks(s))!;
    expect(c.pet).toBe('cat');
    const t = captain();
    t.pets.owned.add('cat');
    t.journey.rank = 3;
    for (const x of RANKS[3].tasks) t.journey.met.add(x.id);
    const d = claimRank(t, hooks(t))!;
    expect(d.pet).toBeNull();
    expect(d.crystals).toBe(RANKS[3].reward.crystals + 15);
  });

  it('gives Captain’s Gold at the top and then is done', () => {
    const s = captain();
    s.journey.rank = RANKS.length - 1;
    for (const t of RANKS.at(-1)!.tasks) s.journey.met.add(t.id);
    const c = claimRank(s, hooks(s))!;
    expect(c.paint).toBe(true);
    expect(s.decor.owned.has(CAPTAIN_PAINT_ID)).toBe(true);
    expect(journeyDone(s)).toBe(true);
    expect(currentRank(s)).toBeNull();
    expect(checkJourney(s, NOW)).toEqual([]);
  });

  it('counts days played', () => {
    const s = captain();
    checkJourney(s, NOW);
    checkJourney(s, NOW + 1000);
    expect(s.journey.days).toBe(1);
    checkJourney(s, NOW + DAY);
    checkJourney(s, NOW + 3 * DAY);
    expect(s.journey.days).toBe(3);
  });

  it('holds fishing back for a new captain until the second rank', () => {
    const s = captain();
    expect(fishingOpen(s)).toBe(false);
    s.journey.rank = FISHING_RANK;
    expect(fishingOpen(s)).toBe(true);
  });

  it('saves and loads', () => {
    const s = captain();
    s.journey.rank = 2;
    s.journey.met.add('upgrades5');
    s.journey.days = 2;
    s.journey.lastDay = '2026-11-23';
    const t = deserialize(serialize(s), NOW)!;
    expect(t.journey.rank).toBe(2);
    expect([...t.journey.met]).toEqual(['upgrades5']);
    expect(t.journey.days).toBe(2);
    expect(t.journey.lastDay).toBe('2026-11-23');
    expect(t.journey.legacy).toBe(false);
  });

  it('opens everything for saves from before ranks', () => {
    const mid = captain();
    mid.allTime = D(5000);
    const data = JSON.parse(serialize(mid));
    delete data.journey;
    const a = deserialize(JSON.stringify(data), NOW)!;
    expect(a.journey.rank).toBe(0);
    expect(a.journey.legacy).toBe(true);
    expect(fishingOpen(a)).toBe(true);

    const vet = captain();
    vet.allTime = D(1e9);
    vet.stats.relocations = 3;
    const v = JSON.parse(serialize(vet));
    delete v.journey;
    const b = deserialize(JSON.stringify(v), NOW)!;
    expect(journeyDone(b)).toBe(true);
  });
});
