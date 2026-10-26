import { describe, expect, it } from 'vitest';
import { BOSS, STORY } from './content';
import { baseIncome, tapValue } from './economy';
import { bossHealth, buyPet, checkLogin, choosePet, claimLogin, hitBoss, streakSlot, updateBoss, updateStory } from './meta';
import { D } from './num';
import { deserialize, newState, serialize } from './state';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 21, 12).getTime();

describe('login streak', () => {
  it('counts consecutive days, pays once a day, and resets after a gap', () => {
    const s = newState(NOW);
    expect(checkLogin(s, NOW)).toBe(true);
    expect(s.login.streak).toBe(1);
    expect(claimLogin(s, NOW)).toEqual({ kind: 'crystals', amount: 5 });
    expect(claimLogin(s, NOW + 1000)).toBeNull();
    expect(checkLogin(s, NOW + DAY)).toBe(true);
    expect(s.login.streak).toBe(2);
    expect(claimLogin(s, NOW + DAY)!.kind).toBe('scrap');
    checkLogin(s, NOW + 3 * DAY);
    expect(s.login.streak).toBe(1);
    expect(s.login.best).toBe(2);
  });

  it('gives a free pet on day 7, then crystals once every pet is adopted', () => {
    const s = newState(NOW);
    for (let d = 0; d < 7; d++) claimLogin(s, NOW + d * DAY);
    expect(s.pets.owned.has('cat')).toBe(true);
    expect(s.pets.active).toBe('cat');
    for (const id of ['pup', 'owl', 'blob'] as const) s.pets.owned.add(id);
    for (let d = 7; d < 14; d++) claimLogin(s, NOW + d * DAY);
    expect(streakSlot(s)).toBe(6);
    expect(s.login.streak).toBe(14);
  });
});

describe('pets', () => {
  it('are bought with crystals and only owned ones can be chosen', () => {
    const s = newState(NOW);
    expect(choosePet(s, 'owl')).toBe(false);
    expect(buyPet(s, 'cat')).toBe(false);
    s.crystals = 100;
    expect(buyPet(s, 'cat')).toBe(true);
    expect(s.crystals).toBe(85);
    expect(buyPet(s, 'cat')).toBe(false);
    expect(choosePet(s, null)).toBe(true);
    expect(s.pets.active).toBeNull();
  });
});

describe('boss wrecks', () => {
  const ready = () => {
    const s = newState(NOW);
    s.tutorial = -1;
    s.owned.drone = 10;
    s.stats.playSec = BOSS.firstSec;
    return s;
  };

  it('arrives after the first few minutes, takes tap damage and pays out', () => {
    const s = ready();
    expect(updateBoss(s, NOW, 1).arrived).toBe(true);
    expect(bossHealth(s)).toBe(1);
    const before = s.crystals;
    let won;
    for (let i = 0; i < 1000 && !won; i++) won = hitBoss(s, tapValue(s, NOW), NOW);
    expect(won!.crystals).toBe(BOSS.crystals);
    expect(s.crystals).toBe(before + BOSS.crystals);
    expect(s.boss).toBeNull();
    expect(s.stats.bosses).toBe(1);
    expect(s.nextBossAt).toBeGreaterThan(NOW + BOSS.gap[0] * 60_000 - 1);
  });

  it('stays until broken, and waits during the tutorial', () => {
    const s = ready();
    s.tutorial = 2;
    expect(updateBoss(s, NOW, 1).arrived).toBeUndefined();
    s.tutorial = -1;
    updateBoss(s, NOW, 1);
    s.owned.drone = 0;
    updateBoss(s, NOW + 3_600_000, 0.01);
    expect(s.boss).not.toBeNull();
    expect(s.stats.bosses).toBe(0);
  });

  it('pays a fixed reward of minutes of scrap per second, set on arrival', () => {
    const s = ready();
    updateBoss(s, NOW, 1);
    const promised = D(s.boss!.reward!);
    expect(promised.toNumber()).toBeCloseTo(Math.max(baseIncome(s).mul(BOSS.rewardIncomeSec).toNumber(), tapValue(s, NOW).mul(BOSS.rewardTaps).toNumber()));
    s.owned.drone = 50;
    const before = D(s.scrap);
    let won;
    for (let i = 0; i < 100000 && !won; i++) won = hitBoss(s, D(s.boss!.max), NOW);
    expect(won!.scrap.toString()).toBe(promised.toString());
    expect(D(s.scrap).sub(before).toString()).toBe(promised.toString());
  });

  it('survives a save', () => {
    const s = ready();
    updateBoss(s, NOW, 1);
    hitBoss(s, D(5), NOW);
    const back = deserialize(serialize(s), NOW)!;
    expect(back.boss!.hp).toBe(s.boss!.hp);
  });
});

describe('story log', () => {
  it('unlocks entries in order and remembers them', () => {
    const s = newState(NOW);
    expect(updateStory(s)).toEqual([]);
    s.taps = 1;
    s.owned.hauler = 1; // unlocks 'cargo', but only after 'stamp'
    expect(updateStory(s)).toEqual(['arrival']);
    s.owned.drone = 10;
    expect(updateStory(s)).toEqual(['stamp', 'cargo']);
    const back = deserialize(serialize(s), NOW)!;
    expect(back.story).toEqual(['arrival', 'stamp', 'cargo']);
    expect(STORY.length).toBeGreaterThanOrEqual(12);
  });
});
