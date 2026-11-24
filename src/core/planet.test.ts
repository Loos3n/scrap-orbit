import { describe, expect, it } from 'vitest';
import { deserialize, newState, serialize } from './state';
import { globalMult } from './economy';
import { bonuses } from './expansion';
import * as p from './planet';

const NOW = 1_700_000_000_000;
const MIN = 60_000;

function found(now = NOW) {
  const s = newState(now);
  s.tutorial = -1;
  p.findPlanet(s, now, 0);
  return s;
}

/** Sends every pod the current project needs and lets it take hold. */
function finishProject(s: ReturnType<typeof found>, now: number): number {
  if (p.needsPath(s)) p.choosePath(s, 'coral');
  const pr = p.currentProject(s)!;
  for (let i = 0; i < pr.loads; i++) p.landPod(s, now);
  const t = s.planet.settleAt;
  p.settleIfReady(s, t);
  return t;
}

describe('The living planet', () => {
  it('turns up for a settled-in captain', () => {
    const s = newState(NOW);
    s.tutorial = -1;
    expect(p.planetDue(s)).toBe(false);
    s.stats.playSec = p.PLANET.openAfterPlaySec;
    expect(p.planetDue(s)).toBe(true);
    p.findPlanet(s, NOW, 0.3);
    expect(s.planet.found).toBe(true);
    expect(s.planet.name).not.toBe('');
    expect(p.planetDue(s)).toBe(false);
    expect(p.pendingStory(s)?.id).toBe('dead');
  });

  it('needs every pod before a project takes hold, then waits', () => {
    const s = found();
    const pr = p.currentProject(s)!;
    expect(p.podCost(s)).toEqual({ kind: 'scrap', minutes: p.PLANET_ERAS[0].podMinutes });
    for (let i = 0; i < pr.loads - 1; i++) expect(p.landPod(s, NOW)).toBe('landed');
    expect(s.planet.settleAt).toBe(0);
    expect(p.landPod(s, NOW)).toBe('filled');
    expect(p.canSendPod(s)).toBe(false);
    expect(p.landPod(s, NOW)).toBeNull();
    expect(p.settleSeconds(s, NOW)).toBe(p.PLANET_ERAS[0].settleMinutes * 60);
    expect(p.settleIfReady(s, NOW + MIN)).toBeNull();
    const done = p.settleIfReady(s, s.planet.settleAt);
    expect(done?.project.id).toBe('core');
    expect(done?.era).toBeNull();
    expect(s.planet.project).toBe(1);
    expect(s.planet.loads).toBe(0);
    expect(p.projectsDone(s)).toBe(1);
  });

  it('moves to the next era after three projects, and tells its story', () => {
    const s = found();
    p.hearStory(s);
    let t = NOW;
    t = finishProject(s, t);
    t = finishProject(s, t);
    expect(s.planet.era).toBe(0);
    const pr = p.currentProject(s)!;
    for (let i = 0; i < pr.loads; i++) p.landPod(s, t);
    const done = p.settleIfReady(s, s.planet.settleAt);
    expect(done?.era?.id).toBe('thaw');
    expect(s.planet.era).toBe(1);
    expect(p.pendingStory(s)?.id).toBe('thaw');
    expect(p.hearStory(s)).toBe(true);
    expect(p.pendingStory(s)).toBeNull();
    // The thaw's first project is paid in crystals.
    expect(p.podCost(s)).toEqual({ kind: 'crystals', n: 3 });
  });

  it('stops at the seas until the captain picks a path, which gives its bonus', () => {
    const s = found();
    let t = NOW;
    while (s.planet.era < p.PATH_ERA) t = finishProject(s, t);
    expect(p.needsPath(s)).toBe(true);
    expect(p.currentProject(s)).toBeNull();
    expect(p.canSendPod(s)).toBe(false);
    const tapBefore = bonuses(s).tap;
    expect(p.choosePath(s, 'forest')).toBe(true);
    expect(p.choosePath(s, 'coral')).toBe(false);
    expect(bonuses(s).tap).toBeCloseTo(tapBefore + 0.5);
    expect(p.currentProject(s)).not.toBeNull();
    // Path projects take the path's name.
    s.planet.project = 2;
    expect(p.pathText(s, p.currentProject(s)!.name)).toBe('Moss carpets');
  });

  it('adds income for each project, more once thriving, and sends trade shuttles', () => {
    const s = found();
    const base = globalMult(s);
    let t = NOW;
    finishProject(s, t);
    expect(globalMult(s) / base).toBeCloseTo(1 + p.PLANET.perProject);
    while (s.planet.era < p.PLANET_ERAS.length - 1) t = finishProject(s, t);
    expect(p.projectsDone(s)).toBe(p.PROJECT_COUNT);
    expect(p.currentProject(s)).toBeNull();
    expect(p.planetMult(s)).toBeCloseTo((1 + p.PROJECT_COUNT * p.PLANET.perProject) * (1 + p.PLANET.thrivingIncome));
    expect(p.shuttleDue(s, t)).toBe(0);
    expect(p.shuttleDue(s, t + p.PLANET.shuttleMin * MIN)).toBe(p.PLANET.shuttleMinutes);
    p.scheduleShuttle(s, t + p.PLANET.shuttleMin * MIN, 0);
    expect(s.planet.shuttles).toBe(1);
    expect(p.population(s, t + 86_400_000)).toBeGreaterThan(p.population(s, t));
  });

  it('survives a save and load, and repairs a broken one', () => {
    const s = found();
    p.landPod(s, NOW);
    p.landPod(s, NOW);
    const back = deserialize(serialize(s), NOW);
    expect(back!.planet).toEqual(s.planet);
    const old = deserialize(JSON.stringify({ ...JSON.parse(serialize(s)), planet: undefined }), NOW);
    expect(old!.planet.found).toBe(false);
    const bad = p.readPlanet({ found: true, era: 99, project: 7, loads: 50, path: 'lava', name: '<b>', settleAt: NOW + 1e12 }, NOW);
    expect(bad.era).toBe(p.PLANET_ERAS.length - 1);
    expect(bad.path).toBeNull();
    expect(bad.name).toBe('b');
    expect(bad.settleAt).toBe(0);
  });
});
