import { describe, expect, it } from 'vitest';
import { checkContract, contractGenMult, contractIncomeMult, contractProgress, makeOffers, pickContract, sprintLeft, SPRINT_SEC } from './contracts';
import { relocate, tapValue } from './economy';
import { D } from './num';
import { deserialize, newState, serialize, type GameState } from './state';

function midRun(): GameState {
  const s = newState(0);
  s.stats.relocations = 2;
  s.owned.drone = 200;
  s.owned.hauler = 150;
  s.owned.smelter = 100;
  s.owned.fabricator = 60;
  s.owned.dock = 40;
  return s;
}

describe('run contracts', () => {
  it('are not offered before the second relocation or during a challenge', () => {
    const s = midRun();
    s.stats.relocations = 0;
    expect(makeOffers(s)).toEqual([]);
    s.stats.relocations = 2;
    s.challenge = 'notap';
    expect(makeOffers(s)).toEqual([]);
  });

  it('offers three different contracts sized from the run that is ending', () => {
    const offers = makeOffers(midRun(), () => 0);
    expect(offers).toHaveLength(3);
    expect(new Set(offers.map((o) => o.id)).size).toBe(3);
    const haulers = makeOffers(midRun(), () => 0).find((o) => o.id === 'haulers');
    expect(haulers?.goal).toBe(175);
  });

  it('applies the rule only while signed, and pays on the goal', () => {
    const s = midRun();
    s.contractOffers = [{ id: 'haulers', goal: 175 }];
    expect(contractGenMult(s, 'hauler')).toBe(1);
    pickContract(s, 0, 0);
    expect(s.contractOffers).toEqual([]);
    expect(contractGenMult(s, 'hauler')).toBe(4);
    expect(contractGenMult(s, 'drone')).toBe(0.25);
    expect(checkContract(s, 0)).toBeNull();
    s.owned.hauler = 175;
    expect(checkContract(s, 0)).toBe('done');
    expect(s.contractsDone).toBe(1);
    expect(contractIncomeMult(s)).toBeCloseTo(1.02);
    // Met once only, and the rule stays for the rest of the run.
    expect(checkContract(s, 0)).toBeNull();
    expect(contractGenMult(s, 'hauler')).toBe(4);
  });

  it('counts taps from the moment it is signed', () => {
    const s = midRun();
    s.taps = 5000;
    s.contractOffers = [{ id: 'hands', goal: 1200 }];
    pickContract(s, 0, 0);
    expect(contractProgress(s)!.have).toBe(0);
    const before = tapValue(s, 0, true);
    s.contract = null;
    expect(before.div(tapValue(s, 0, true)).toNumber()).toBeCloseTo(10);
  });

  it('fails a sprint when the clock runs out', () => {
    const s = midRun();
    s.contractOffers = [{ id: 'sprint', goal: 7 }];
    pickContract(s, 0, 0);
    s.stats.runSec = SPRINT_SEC + 1;
    expect(checkContract(s, SPRINT_SEC * 1000 + 1)).toBe('failed');
    expect(s.contract).toBeNull();
  });

  it('keeps the sprint clock running while the game is closed', () => {
    const s = midRun();
    s.stats.runSec = 60;
    s.contractOffers = [{ id: 'sprint', goal: 7 }];
    pickContract(s, 0, 1000);
    // Play time stands still while away, but the clock does not.
    expect(sprintLeft(s, 1000 + 10 * 60_000)).toBe(SPRINT_SEC - 60 - 600);
    const back = deserialize(serialize(s), 0)!;
    expect(checkContract(back, 1000 + 3 * 3600_000)).toBe('failed');
  });

  it('skipping signs nothing', () => {
    const s = midRun();
    s.contractOffers = makeOffers(s);
    pickContract(s, null, 0);
    expect(s.contract).toBeNull();
    expect(s.contractOffers).toEqual([]);
  });

  it('survives a save and ends with the run', () => {
    const s = midRun();
    s.contractOffers = [{ id: 'crates', goal: 12 }];
    pickContract(s, 0, 0);
    s.contractsDone = 3;
    const back = deserialize(serialize(s), 0)!;
    expect(back.contract).toEqual(s.contract);
    expect(back.contractsDone).toBe(3);
    back.allTime = D(1e15);
    relocate(back, 0);
    expect(back.contract).toBeNull();
  });
});
