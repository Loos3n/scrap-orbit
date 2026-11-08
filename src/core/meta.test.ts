import { describe, expect, it } from 'vitest';
import { CREW, RESEARCH, TUTORIAL } from './content';
import { baseIncome, buyGenerator, costFor, genById, tapValue } from './economy';
import {
  addCrystals,
  claimMission,
  claimableMissions,
  crewAvailable,
  finishResearch,
  missionProgress,
  refreshMissions,
  rushResearch,
  startResearch,
  trainCrew,
  updateEvents,
  useDecor,
  dayKey,
  weekKey,
} from './meta';
import { D } from './num';
import { deserialize, newState, serialize } from './state';

const NOW = new Date(2026, 9, 21, 12).getTime();

describe('crew', () => {
  it('can only join once their machine exists, and costs crystals', () => {
    const s = newState(NOW);
    addCrystals(s, 100);
    expect(trainCrew(s, 'mika')).toBe(false);
    s.owned.drone = 1;
    expect(crewAvailable(s, 'mika')).toBe(true);
    expect(trainCrew(s, 'mika')).toBe(true);
    expect(s.crystals).toBe(100 - CREW[0].cost);
  });

  it('each level multiplies that machine', () => {
    const s = newState(NOW);
    s.owned.drone = 10;
    const before = baseIncome(s).toNumber();
    addCrystals(s, 1000);
    trainCrew(s, 'mika');
    expect(baseIncome(s).toNumber()).toBeCloseTo(before * 2);
    trainCrew(s, 'mika');
    expect(baseIncome(s).toNumber()).toBeCloseTo(before * 3);
  });

  it('stops at max level', () => {
    const s = newState(NOW);
    s.owned.drone = 1;
    addCrystals(s, 10_000);
    for (let i = 0; i < 9; i++) trainCrew(s, 'mika');
    expect(s.crew.mika).toBe(5);
  });
});

describe('research', () => {
  it('runs on real time, one at a time, in order', () => {
    const s = newState(NOW);
    expect(startResearch(s, 'claw2', NOW)).toBe(false);
    expect(startResearch(s, 'claw1', NOW)).toBe(true);
    expect(startResearch(s, 'ind1', NOW)).toBe(false);
    expect(finishResearch(s, NOW + 1000)).toBe(null);
    const tap = tapValue(s, NOW).toNumber();
    expect(finishResearch(s, NOW + 2 * 60 * 1000)).toBe('claw1');
    expect(tapValue(s, NOW).toNumber()).toBeCloseTo(tap * 2);
    expect(startResearch(s, 'claw2', NOW)).toBe(true);
  });

  it('can be rushed for crystals', () => {
    const s = newState(NOW);
    startResearch(s, 'ind1', NOW);
    expect(rushResearch(s, NOW)).toBe(null);
    // One crystal per minute left; ind1 takes 5 minutes.
    addCrystals(s, 4);
    expect(rushResearch(s, NOW)).toBe(null);
    addCrystals(s, 1);
    expect(rushResearch(s, NOW)).toBe('ind1');
    expect(s.crystals).toBe(0);
  });

  it('cost research makes machines cheaper', () => {
    const s = newState(NOW);
    s.research.done.add('ind1');
    s.scrap = D(1000);
    buyGenerator(s, 'drone', 1);
    expect(s.scrap.toNumber()).toBeCloseTo(1000 - costFor(genById('drone'), 0, 1).toNumber() * 0.95);
  });

  it('every prerequisite exists', () => {
    for (const r of RESEARCH) if (r.requires) expect(RESEARCH.some((x) => x.id === r.requires)).toBe(true);
  });
});

describe('missions', () => {
  it('hands out three dailies and a weekly, tracks progress and pays once', () => {
    const s = newState(NOW);
    expect(refreshMissions(s, NOW)).toBe(true);
    expect(s.missions.daily).toHaveLength(3);
    expect(s.missions.weekly).not.toBeNull();
    expect(refreshMissions(s, NOW + 1000)).toBe(false);
    const m = s.missions.daily[0];
    expect(missionProgress(s, m).pct).toBe(0);
    // Finish it by pushing every counter well past the goal.
    s.taps += 1e6;
    s.stats.machines += 1e6;
    s.stats.upgradesBought += 1e6;
    s.stats.crates += 1e6;
    s.stats.boosts += 1e6;
    s.stats.meteors += 1e6;
    s.allTime = s.allTime.add(1e30);
    expect(claimableMissions(s)).toBe(4);
    const won = claimMission(s, 0);
    expect(won).toBeGreaterThan(0);
    expect(claimMission(s, 0)).toBe(0);
    expect(s.crystals).toBe(won);
  });

  it('rolls over at midnight and on Mondays', () => {
    expect(dayKey(NOW)).toBe('2026-10-21');
    expect(weekKey(NOW)).toBe('2026-10-19');
    const s = newState(NOW);
    refreshMissions(s, NOW);
    expect(refreshMissions(s, NOW + 24 * 3600 * 1000)).toBe(true);
  });
});

describe('events', () => {
  it('waits, starts, ends and schedules the next one', () => {
    const s = newState(NOW);
    expect(updateEvents(s, NOW)).toEqual({});
    const r = updateEvents(s, s.nextEventAt, () => 0.5);
    expect(r.started).toBe('flare');
    const tapNormal = 1;
    expect(tapValue(s, s.event!.endsAt - 1).toNumber()).toBeGreaterThan(tapNormal);
    expect(updateEvents(s, s.event!.endsAt).ended).toBe('flare');
    expect(s.event).toBeNull();
    expect(s.nextEventAt).toBeGreaterThan(NOW);
  });
});

describe('decorations', () => {
  it('buys once, then switches for free', () => {
    const s = newState(NOW);
    expect(useDecor(s, 'aurora')).toBe(false);
    addCrystals(s, 25);
    expect(useDecor(s, 'aurora')).toBe(true);
    expect(s.decor.theme).toBe('aurora');
    expect(useDecor(s, 'classic')).toBe(true);
    expect(useDecor(s, 'aurora')).toBe(true);
    expect(s.crystals).toBe(0);
  });
});

describe('save v3', () => {
  it('round-trips the new systems', () => {
    const s = newState(NOW);
    s.owned.drone = 3;
    addCrystals(s, 50);
    trainCrew(s, 'mika');
    startResearch(s, 'claw1', NOW);
    useDecor(s, 'ember');
    refreshMissions(s, NOW);
    s.settings.numbers = 'engineering';
    const back = deserialize(serialize(s), NOW)!;
    expect(back.crew.mika).toBe(1);
    expect(back.research.active?.id).toBe('claw1');
    expect(back.decor.theme).toBe('ember');
    expect(back.missions.daily).toHaveLength(3);
    expect(back.settings.numbers).toBe('engineering');
    expect(back.crystals).toBe(s.crystals);
  });

  it('upgrades the old scientific setting and skips the tutorial for old players', () => {
    const old = JSON.stringify({ v: 2, scrap: '10', lifetime: '100', allTime: '100', owned: { drone: 2 }, upgrades: [], taps: 5, boostUntil: 0, boostReadyAt: 0, lastSeen: NOW, settings: { scientific: true } });
    const s = deserialize(old, NOW)!;
    expect(s.settings.numbers).toBe('scientific');
    expect(s.tutorial).toBe(-1);
  });

  it('saves the tutorial step by name and remembers seen tips', () => {
    const s = newState(NOW);
    s.tutorial = TUTORIAL.indexOf('boost');
    s.tips.add('crew');
    const back = deserialize(serialize(s), NOW)!;
    expect(TUTORIAL[back.tutorial]).toBe('boost');
    expect(back.tips.has('crew')).toBe(true);
    // A save from the first tutorial only has a step number, so it starts again.
    const old = JSON.parse(serialize(s));
    delete old.tut;
    old.tutorial = 3;
    expect(deserialize(JSON.stringify(old), NOW)!.tutorial).toBe(0);
  });
});
