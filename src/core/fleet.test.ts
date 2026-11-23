import { describe, expect, it } from 'vitest';
import { FLEET, SHIPS, addPlates, collectPatrol, finishJob, fleetOpen, fleetPower, jobCost, patrolHaul, startJob, welcomeFleet } from './fleet';
import { FINALE_ID } from './story';
import { coreGainMult } from './galaxy';
import { bonuses } from './expansion';
import { costDiscount, globalMult } from './economy';
import { deserialize, newState, serialize } from './state';

const HOUR = 3_600_000;

function docked() {
  const s = newState(0);
  s.story.heard.add(FINALE_ID);
  welcomeFleet(s, 0);
  return s;
}

describe('The Hollow Fleet', () => {
  it('stays shut until the Lantern docks, then hands over the welcome plates once', () => {
    const s = newState(0);
    expect(fleetOpen(s)).toBe(false);
    expect(welcomeFleet(s, 0)).toBe(false);
    expect(addPlates(s, 5)).toBe(0);
    s.story.heard.add(FINALE_ID);
    expect(welcomeFleet(s, 0)).toBe(true);
    expect(welcomeFleet(s, 0)).toBe(false);
    expect(s.fleet.plates).toBe(FLEET.welcomePlates);
    expect(FLEET.welcomePlates).toBeGreaterThanOrEqual(SHIPS[0].plates);
  });

  it('rebuilds ships in order, one drydock job at a time', () => {
    const s = docked();
    s.fleet.plates = 1000;
    expect(startJob(s, 'bellwether', 0)).toBe(false);
    expect(startJob(s, 'wren', 0)).toBe(true);
    expect(startJob(s, 'wren', 0)).toBe(false);
    expect(finishJob(s, HOUR - 1)).toBeNull();
    expect(finishJob(s, HOUR)).toEqual({ id: 'wren', rank: 1 });
    expect(startJob(s, 'halcyon', HOUR)).toBe(false);
    expect(startJob(s, 'bellwether', HOUR)).toBe(true);
    expect(s.fleet.plates).toBe(1000 - 10 - 20);
  });

  it('refits cost more each rank and stop at the top rank', () => {
    const def = SHIPS[0];
    expect(jobCost(def, 0)).toEqual({ plates: 10, hours: 1 });
    expect(jobCost(def, 1).plates).toBe(18);
    expect(jobCost(def, 2).hours).toBe(2);
    const s = docked();
    s.fleet.plates = 1e6;
    let t = 0;
    for (let r = 0; r < FLEET.maxRank; r++) {
      expect(startJob(s, 'wren', t)).toBe(true);
      t += 100 * HOUR;
      finishJob(s, t);
    }
    expect(s.fleet.ranks.wren).toBe(FLEET.maxRank);
    expect(startJob(s, 'wren', t)).toBe(false);
  });

  it('feeds its abilities into the economy', () => {
    const s = docked();
    const income = globalMult(s);
    const cost = costDiscount(s);
    const cores = coreGainMult(s);
    s.fleet.ranks = { bellwether: 2, anvil: 1, thimble: 1, corvid: 2, lullaby: 1 };
    expect(globalMult(s) / income).toBeCloseTo(3);
    expect(costDiscount(s) / cost).toBeCloseTo(0.85);
    expect(coreGainMult(s) / cores).toBeCloseTo(1.25);
    expect(bonuses(s).boss).toBeCloseTo(1);
    expect(fleetPower(s, 'starGain')).toBeCloseTo(1.2);
  });

  it('patrols haul plates over time, capped, keeping the part-made plate', () => {
    const s = docked();
    s.fleet.ranks = { wren: 1, bellwether: 2 };
    s.fleet.patrolAt = 0;
    // 3 ranks: one plate every 2 hours.
    expect(patrolHaul(s, 3 * HOUR)).toBe(1);
    const before = s.fleet.plates;
    expect(collectPatrol(s, 3 * HOUR)).toBe(1);
    expect(s.fleet.plates).toBe(before + 1);
    expect(patrolHaul(s, 4 * HOUR)).toBe(1);
    expect(patrolHaul(s, 1000 * HOUR)).toBe(Math.floor(FLEET.patrolCapHours * 3 / FLEET.patrolHours));
  });

  it('saves and loads', () => {
    const s = docked();
    s.fleet.plates = 42;
    s.fleet.ranks = { wren: 3 };
    s.fleet.job = { ship: 'bellwether', endsAt: 5 };
    const back = deserialize(serialize(s), 10)!;
    expect(back.fleet.plates).toBe(42);
    expect(back.fleet.ranks.wren).toBe(3);
    expect(back.fleet.job).toEqual({ ship: 'bellwether', endsAt: 5 });
    expect(back.fleet.welcomed).toBe(true);
    // Older saves have no fleet.
    const old = JSON.parse(serialize(s));
    delete old.fleet;
    expect(deserialize(JSON.stringify(old), 10)!.fleet.plates).toBe(0);
  });
});
