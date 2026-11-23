import { describe, expect, it } from 'vitest';
import { VISITORS, VISITS, isFriend, visitorHere } from './visitors';
import { answerVisitor, calm, updateVisitors } from './meta';
import { bonuses } from './expansion';
import { deserialize, newState, serialize } from './state';

const MIN = 60_000;

function settled() {
  const s = newState(0);
  s.tutorial = -1;
  s.stats.playSec = 3600;
  return s;
}

describe('Dock visitors', () => {
  it('has eight visitors, each with three two-answer requests', () => {
    expect(VISITORS).toHaveLength(8);
    expect(new Set(VISITORS.map((v) => v.id)).size).toBe(8);
    for (const v of VISITORS) {
      expect(v.requests).toHaveLength(3);
      for (const r of v.requests) expect(['a', 'b']).toContain(r.likes);
    }
  });

  it('docks when things are calm, keeps things calm while docked, and leaves if ignored', () => {
    const s = settled();
    expect(updateVisitors(s, 0, () => 0)).toBeNull();
    const due = s.visitors.nextAt;
    expect(due).toBeGreaterThan(0);
    s.lastHappening = -1e9;
    expect(updateVisitors(s, due, () => 0)).toBe('arrived');
    expect(visitorHere(s, due)).not.toBeNull();
    expect(calm(s, due + 1)).toBe(false);
    expect(updateVisitors(s, due + VISITS.stayMin * MIN, () => 0)).toBe('left');
    expect(s.visitors.here).toBeNull();
  });

  it('pays the answer, wins a heart for the liked one, and leaves a keepsake at three hearts', () => {
    const s = settled();
    s.crystals = 100;
    const def = VISITORS.find((v) => v.id === 'nana')!;
    const base = bonuses(s).income;
    for (let i = 0; i < VISITS.hearts; i++) {
      const req = i % def.requests.length;
      s.visitors.here = { id: 'nana', req, until: 1e12 };
      const r = answerVisitor(s, def.requests[req].likes, 0)!;
      expect(r.liked).toBe(true);
      expect(r.friend).toBe(i === VISITS.hearts - 1);
    }
    expect(isFriend(s, 'nana')).toBe(true);
    expect(bonuses(s).income - base).toBeCloseTo(def.keepsake.amount);
    expect(s.visitors.met.nana).toBe(3);
  });

  it('will not take an answer it cannot afford', () => {
    const s = settled();
    s.crystals = 0;
    s.visitors.here = { id: 'ziggy', req: 1, until: 1e12 };
    expect(answerVisitor(s, 'a', 0)).toBeNull();
    expect(answerVisitor(s, 'b', 0)?.crystals).toBe(2);
  });

  it('saves and loads', () => {
    const s = settled();
    s.visitors.hearts = { quill: 2 };
    s.visitors.met = { quill: 4 };
    s.visitors.here = { id: 'brass', req: 1, until: 99 };
    const back = deserialize(serialize(s), 0)!;
    expect(back.visitors.hearts.quill).toBe(2);
    expect(back.visitors.met.quill).toBe(4);
    expect(back.visitors.here).toEqual({ id: 'brass', req: 1, until: 99 });
  });
});
