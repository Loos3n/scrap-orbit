import { describe, expect, it } from 'vitest';
import { BOSS, CALM_SEC } from './content';
import { baseIncome, tapValue } from './economy';
import { bossHealth, buyPet, checkLogin, choosePet, claimLogin, hitBoss, streakSlot, updateBoss, updateEvents } from './meta';
import { D } from './num';
import { deserialize, newState, serialize } from './state';
import { GOLDEN, LOOT_PITY, TRIPS, bonuses, moduleYield, tripMs } from './expansion';
import { abandonChallenge, buildModule, checkChallenge, claimGolden, claimTrip, goldenDue, removeModule, startChallenge, startTrip, trade, updateTrader } from './meta';
import { income } from './economy';

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

  it('flies off after a minute, and waits during the tutorial', () => {
    const s = ready();
    s.tutorial = 2;
    expect(updateBoss(s, NOW, 1).arrived).toBeUndefined();
    s.tutorial = -1;
    updateBoss(s, NOW, 1);
    s.owned.drone = 0;
    expect(updateBoss(s, NOW + 59_000, 0.01).escaped).toBeUndefined();
    expect(updateBoss(s, NOW + BOSS.seconds * 1000, 0.01).escaped).toBe(true);
    expect(s.boss).toBeNull();
    expect(s.stats.bosses).toBe(0);
  });

  it('drops loot sometimes, and always after a dry spell', () => {
    const s = ready();
    const never = () => 0.99;
    for (let i = 0; i < LOOT_PITY + 1; i++) {
      s.nextBossAt = 0;
      s.stats.playSec = BOSS.firstSec;
      updateBoss(s, NOW + i * 1e9, 1, never);
      const won = hitBoss(s, D(s.boss!.max).mul(10), NOW + i * 1e9, never);
      if (i < LOOT_PITY) expect(won!.loot).toBeUndefined();
      else expect(s.loot.has(won!.loot!)).toBe(true);
    }
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

describe('station modules', () => {
  it('adds up layout bonuses: reactor power, hangar clusters and corners', () => {
    const grid: (string | null)[] = ['solar', 'hangar', null, 'reactor', 'hangar', null, null, null, 'observatory'];
    expect(moduleYield(grid, 0)).toEqual([['income', 0.04 * 2 * 1.5]]);
    // Hangar at 4 touches the reactor and one hangar.
    expect(moduleYield(grid, 4)[0][1]).toBeCloseTo((0.06 + 0.02) * 1.5);
    expect(moduleYield(grid, 8)).toEqual([['golden', 0.2]]);
  });

  it('costs crystals, needs blueprints, and refunds when taken down', () => {
    const s = newState(NOW);
    s.crystals = 100;
    expect(buildModule(s, 4, 'workshop')).toBe(false);
    expect(buildModule(s, 4, 'reactor')).toBe(true);
    expect(buildModule(s, 0, 'reactor')).toBe(false);
    expect(s.crystals).toBe(75);
    const before = income(s, NOW).toNumber();
    s.owned.drone = 10;
    expect(bonuses(s).income).toBeCloseTo(0.05);
    expect(removeModule(s, 4)).toBe(25);
    expect(s.crystals).toBe(100);
    expect(before).toBe(0);
  });
});

describe('expeditions', () => {
  it('takes crew away from their machine and brings back crystals, scrap and blueprints', () => {
    const s = newState(NOW);
    s.owned.drone = 10;
    s.crew.mika = 1;
    const full = income(s, NOW);
    expect(startTrip(s, 'bolt', 'field', NOW)).toBe(false);
    expect(startTrip(s, 'mika', 'field', NOW)).toBe(true);
    expect(startTrip(s, 'mika', 'nebula', NOW)).toBe(false);
    expect(income(s, NOW).lt(full)).toBe(true);
    expect(claimTrip(s, 0, NOW + 1000)).toBeNull();
    const end = NOW + tripMs(s, TRIPS[0]);
    const got = claimTrip(s, 0, end, () => 0)!;
    expect(got.crystals).toBe(TRIPS[0].crystals[0]);
    expect(got.blueprint).toBeDefined();
    expect(s.blueprints.has(got.blueprint!)).toBe(true);
    expect(s.trips.length).toBe(0);
  });
});

describe('golden scrap', () => {
  it('turns up on a timer and multiplies income during the rush', () => {
    const s = newState(NOW);
    s.tutorial = -1;
    s.owned.drone = 10;
    expect(goldenDue(s, NOW)).toBe(false);
    expect(goldenDue(s, NOW + GOLDEN.firstMin * 60_000)).toBe(true);
    const base = income(s, NOW).toNumber();
    claimGolden(s, NOW);
    expect(income(s, NOW + 1000).toNumber()).toBeCloseTo(base * GOLDEN.mult);
    expect(income(s, NOW + GOLDEN.seconds * 1000).toNumber()).toBeCloseTo(base);
  });

  it('survives a save with modules, trips and loot', () => {
    const s = newState(NOW);
    s.modules[0] = 'hangar';
    s.blueprints.add('armory');
    s.crew.mika = 2;
    startTrip(s, 'mika', 'deep', NOW);
    s.loot.add('skin-cat');
    s.skins.cat = 'skin-cat';
    const back = deserialize(serialize(s), NOW)!;
    expect(back.modules[0]).toBe('hangar');
    expect(back.blueprints.has('armory')).toBe(true);
    expect(back.trips[0].crew).toBe('mika');
    expect(back.skins.cat).toBe('skin-cat');
  });
});

describe('bug fixes', () => {
  it('refunds exactly what a room cost, so build-and-remove orders cannot farm crystals', () => {
    const s = newState(NOW);
    s.blueprints.add('observatory');
    s.crystals = 1000;
    for (let round = 0; round < 5; round++) {
      buildModule(s, 4, 'observatory');
      buildModule(s, 0, 'solar');
      buildModule(s, 2, 'solar');
      removeModule(s, 4);
      removeModule(s, 0);
      removeModule(s, 2);
    }
    expect(s.crystals).toBe(1000);
  });

  it('keeps what was paid across a save, and trims impossible trips and extra reactors', () => {
    const s = newState(NOW);
    s.crystals = 200;
    buildModule(s, 0, 'solar');
    buildModule(s, 1, 'hangar');
    const back = deserialize(serialize(s), NOW)!;
    expect(back.modulePaid.slice(0, 2)).toEqual(s.modulePaid.slice(0, 2));
    const raw = JSON.parse(serialize(s));
    raw.modules = ['reactor', 'reactor', null, null, null, null, null, null, null];
    delete raw.modulePaid;
    raw.crew = { mika: 1, bolt: 1, ash: 1 };
    raw.trips = [
      { crew: 'mika', dest: 'field', endsAt: NOW },
      { crew: 'mika', dest: 'nebula', endsAt: NOW },
      { crew: 'juno', dest: 'field', endsAt: NOW },
      { crew: 'bolt', dest: 'field', endsAt: NOW },
      { crew: 'ash', dest: 'field', endsAt: NOW },
    ];
    const odd = deserialize(JSON.stringify(raw), NOW)!;
    expect(odd.modules.filter((m) => m === 'reactor')).toHaveLength(1);
    expect(odd.modulePaid[0]).toBe(25);
    expect(odd.trips.map((t) => t.crew)).toEqual(['mika', 'bolt']);
  });

  it('sizes and pays boss wrecks without Overdrive or golden rush inflating them', () => {
    const plain = newState(NOW);
    plain.owned.drone = 50;
    plain.tutorial = -1;
    plain.nextBossAt = NOW;
    const rushed = newState(NOW);
    rushed.owned.drone = 50;
    rushed.tutorial = -1;
    rushed.nextBossAt = NOW;
    // (A golden rush now holds bosses back entirely; Overdrive doesn't.)
    rushed.boostUntil = NOW + 30_000;
    updateBoss(plain, NOW, 0.01, () => 0.5);
    updateBoss(rushed, NOW, 0.01, () => 0.5);
    expect(rushed.boss!.reward).toBe(plain.boss!.reward);
    expect(rushed.boss!.max).toBe(plain.boss!.max);
    expect(tapValue(rushed, NOW).gt(tapValue(rushed, NOW, true))).toBe(true);
  });
});

describe('trading post', () => {
  it('visits after the first wait, offers three deals, sells each once, then leaves', () => {
    const s = newState(NOW);
    s.tutorial = -1;
    s.owned.drone = 20;
    expect(updateTrader(s, NOW)).toBeNull();
    const at = s.trader.nextAt;
    expect(updateTrader(s, at - 1)).toBeNull();
    expect(updateTrader(s, at, () => 0.3)).toBe('arrived');
    expect(s.trader.offers).toHaveLength(3);
    s.crystals = 100;
    s.scrap = D(1e12);
    const before = s.crystals;
    const i = s.trader.offers.findIndex((o) => o.kind === 'crystals' || o.kind === 'scrap');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(trade(s, i, at + 1000)).not.toBeNull();
    expect(trade(s, i, at + 1000)).toBeNull();
    expect(s.crystals === before && s.scrap.eq(1e12)).toBe(false);
    expect(updateTrader(s, s.trader.until)).toBe('left');
    expect(trade(s, 0, s.trader.until + 1)).toBeNull();
  });
});

describe('challenge runs', () => {
  it('starts a fresh run under a rule and pays a permanent bonus at the goal', () => {
    const s = newState(NOW);
    s.cores = 5;
    s.owned.drone = 50;
    expect(tapValue(s, NOW).gt(0)).toBe(true);
    expect(startChallenge(s, 'notap', NOW)).toBeGreaterThanOrEqual(0);
    // A fresh run (Head Start hands back 10 drones at 3 cores).
    expect(s.owned.drone).toBe(10);
    expect(tapValue(s, NOW).eq(0)).toBe(true);
    expect(startChallenge(s, 'noupg', NOW)).toBe(-1);
    s.lifetime = D(2e9);
    expect(checkChallenge(s)!.id).toBe('notap');
    expect(s.challenge).toBeNull();
    expect(bonuses(s).income).toBeCloseTo(0.1);
    expect(startChallenge(s, 'notap', NOW)).toBe(-1);
    const back = deserialize(serialize(s), NOW)!;
    expect(back.challengesDone.has('notap')).toBe(true);
  });

  it('applies the price and crew rules only while running, and can be given up', () => {
    const s = newState(NOW);
    s.cores = 5;
    s.crew.mika = 3;
    startChallenge(s, 'nocrew', NOW);
    s.owned.drone = 10;
    const benched = baseIncome(s);
    abandonChallenge(s);
    expect(baseIncome(s).gt(benched)).toBe(true);
    expect(s.challengesDone.size).toBe(0);
  });
});

describe('calm time', () => {
  it('never starts an event, boss, golden crate or trader while another is running or just began', () => {
    const s = newState(NOW);
    s.tutorial = -1;
    s.owned.drone = 20;
    s.nextEventAt = NOW;
    s.nextBossAt = NOW;
    s.golden.nextAt = NOW;
    s.trader.nextAt = NOW;
    expect(updateEvents(s, NOW, () => 0.1).started).toBe('meteors');
    expect(updateBoss(s, NOW, 0.01).arrived).toBeUndefined();
    expect(goldenDue(s, NOW)).toBe(false);
    expect(updateTrader(s, NOW)).toBeNull();
    const end = s.event!.endsAt;
    updateEvents(s, end);
    // Over, but still inside the calm window.
    expect(goldenDue(s, end + 1000)).toBe(false);
    const later = NOW + CALM_SEC * 1000;
    expect(updateBoss(s, later, 0.01).arrived).toBe(true);
    expect(goldenDue(s, later + 1000)).toBe(false);
  });
});
