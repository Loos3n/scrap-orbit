import { describe, expect, it } from 'vitest';
import { costDiscount } from './economy';
import { bonuses } from './expansion';
import { GALAXY_TRAITS, STAR_NODES, galaxyTrait, starNodeShown } from './galaxy';
import { buyStarNode } from './meta';
import { sectorCrateMult, sectorCrewMult, timeStretch } from './sectors';
import { newState } from './state';

describe('galaxy traits', () => {
  it('has none in the first galaxy, then one per galaxy, cycling', () => {
    const s = newState(0);
    expect(galaxyTrait(s)).toBeNull();
    s.galaxy.shifts = 1;
    expect(galaxyTrait(s)?.id).toBe('shallows');
    s.galaxy.shifts = GALAXY_TRAITS.length + 1;
    expect(galaxyTrait(s)?.id).toBe('shallows');
  });

  it('bends the rules it says', () => {
    const s = newState(0);
    const base = { cost: costDiscount(s), income: bonuses(s).income, tap: bonuses(s).tap, offline: bonuses(s).offline };
    s.galaxy.shifts = 1;
    expect(costDiscount(s)).toBeCloseTo(base.cost * 0.75);
    s.galaxy.shifts = 2;
    expect(bonuses(s).tap).toBeCloseTo(base.tap + 2);
    s.galaxy.shifts = 3;
    expect(bonuses(s).offline).toBeCloseTo(base.offline + 2);
    expect(timeStretch(s)).toBeCloseTo(1.5);
    s.galaxy.shifts = 4;
    expect(sectorCrewMult(s)).toBe(2);
    s.galaxy.shifts = 5;
    expect(sectorCrateMult(s)).toBe(2);
    s.galaxy.shifts = 6;
    expect(bonuses(s).income).toBeCloseTo(base.income + 1);
  });
});

describe('constellations', () => {
  it('adds two Star Map nodes for each galaxy from the second to the seventh', () => {
    for (let g = 2; g <= 7; g++) expect(STAR_NODES.filter((n) => n.galaxy === g)).toHaveLength(2);
  });

  it('only sells a constellation node once its galaxy is reached', () => {
    const s = newState(0);
    s.galaxy.stars = 100;
    const tide = STAR_NODES.find((n) => n.id === 'tide')!;
    expect(starNodeShown(s, tide)).toBe(false);
    expect(buyStarNode(s, 'tide')).toBe(false);
    s.galaxy.shifts = 1;
    expect(buyStarNode(s, 'tide')).toBe(true);
    expect(s.galaxy.stars).toBe(100 - tide.cost);
  });
});
