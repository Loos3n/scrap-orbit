import { describe, expect, it } from 'vitest';
import { CALM_SEC } from './content';
import { SAFE, SETS, SKINS } from './collection';
import { checkSets, chooseStationSkin, finishSafe, noteCollection, openSafe, updateSafe } from './meta';
import { deserialize, newState, serialize } from './state';

const NOW = new Date(2026, 9, 26, 12).getTime();

describe('cargo safes', () => {
  it('arrive when calm, can be opened once, and pay by locks cracked', () => {
    const s = newState(NOW);
    s.tutorial = -1;
    s.owned.drone = 20;
    expect(updateSafe(s, NOW)).toBe(false);
    const at = s.safe.nextAt;
    expect(updateSafe(s, at, () => 0)).toBe(true);
    expect(s.safe.type).toBe('supply');
    expect(openSafe(s, at + 1000)).toBe('supply');
    expect(openSafe(s, at + 1000)).toBeNull();
    const r = finishSafe(s, 3)!;
    expect(r.locks).toBe(3);
    expect(r.crystals).toBe(SAFE.crystals[3]);
    expect(r.newEntry).toBe(true);
    expect(s.collection.has('safe:supply')).toBe(true);
    expect(finishSafe(s, 3)).toBeNull();
  });

  it('drifts off if nobody cracks it, and a half-cracked safe is lost on reload', () => {
    const s = newState(NOW);
    s.tutorial = -1;
    s.safe.nextAt = NOW;
    s.lastHappening = NOW - CALM_SEC * 1000;
    updateSafe(s, NOW);
    updateSafe(s, s.safe.until + 1);
    expect(openSafe(s, s.safe.until + 2)).toBeNull();
    s.safe.open = 'bank';
    expect(deserialize(serialize(s), NOW)!.safe.open).toBeNull();
  });
});

describe('collection book', () => {
  it('pays for a finished set once and unlocks its station skin', () => {
    const s = newState(NOW);
    s.crystals = 0;
    s.collection.add('boss:0').add('boss:1').add('boss:2');
    expect(checkSets(s)).toEqual([]);
    expect(chooseStationSkin(s, 'salvager')).toBe(false);
    s.collection.add('boss:3');
    expect(checkSets(s).map((x) => x.id)).toEqual(['wrecks']);
    expect(s.crystals).toBe(SETS.find((x) => x.id === 'wrecks')!.crystals);
    expect(checkSets(s)).toEqual([]);
    expect(chooseStationSkin(s, 'salvager')).toBe(true);
    const back = deserialize(serialize(s), NOW)!;
    expect(back.skin).toBe('salvager');
    expect(back.setsDone.has('wrecks')).toBe(true);
  });

  it('notes machines and sectors, credits old saves, and has a skin for every set', () => {
    const s = newState(NOW);
    s.owned.hauler = 1;
    s.stats.relocations = 2;
    noteCollection(s);
    expect(s.collection.has('gen:hauler')).toBe(true);
    expect(s.collection.has('sector:2')).toBe(true);
    const raw = JSON.parse(serialize(s));
    delete raw.collection;
    raw.stats.bosses = 2;
    const old = deserialize(JSON.stringify(raw), NOW)!;
    expect(['sector:0', 'sector:1', 'sector:2', 'boss:0', 'boss:1'].every((k) => old.collection.has(k))).toBe(true);
    for (const set of SETS) expect(SKINS.some((k) => k.id === set.skin)).toBe(true);
  });
});
