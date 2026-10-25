import { describe, expect, it } from 'vitest';
import { GENERATORS, UPGRADES } from './config';
import {
  baseIncome,
  buyGenerator,
  buyUpgrade,
  costFor,
  tap,
  tapValue,
  tick,
  upgradeVisible,
} from './economy';
import { format, formatDuration } from './num';
import { deserialize, newState, serialize, type GameState } from './state';

const TAPS_PER_SEC = 3;

/** Income gained per scrap spent, counting taps at TAPS_PER_SEC. */
function valueOf(state: GameState): number {
  return baseIncome(state).toNumber() + tapValue(state, 0).toNumber() * TAPS_PER_SEC;
}

type Option = { label: string; cost: number; apply: (s: GameState) => void };

function options(state: GameState): Option[] {
  const out: Option[] = [];
  for (const g of GENERATORS) {
    out.push({ label: g.name, cost: costFor(g, state.owned[g.id], 1).toNumber(), apply: (s) => buyGenerator(s, g.id, 1) });
  }
  for (const u of UPGRADES) {
    if (state.upgrades.has(u.id) || !upgradeVisible(state, u)) continue;
    out.push({ label: u.name, cost: u.cost, apply: (s) => buyUpgrade(s, u.id) });
  }
  return out;
}

/**
 * Picks what an attentive player buys next: the best payback (cost / gain) overall,
 * or an affordable option nearly as good while saving up for it.
 */
function nextPurchase(state: GameState): Option | null {
  const now = valueOf(state);
  const scored: { o: Option; score: number }[] = [];
  for (const o of options(state)) {
    const trial = deserialize(serialize(state), 0)!;
    trial.scrap = state.scrap.add(o.cost * 2);
    o.apply(trial);
    const gain = valueOf(trial) - now;
    if (gain > 0) scored.push({ o, score: o.cost / gain });
  }
  if (scored.length === 0) return null;
  scored.sort((x, y) => x.score - y.score);
  const best = scored[0];
  if (state.scrap.gte(best.o.cost)) return best.o;
  const fallback = scored.find((x) => x.score <= best.score * 3 && state.scrap.gte(x.o.cost));
  return fallback ? fallback.o : null;
}

/** Simulates an active player for `seconds`, returning purchase times and first-buy times. */
function simulate(seconds: number) {
  const s = newState(0);
  const purchases: number[] = [];
  const firsts: Record<string, number> = {};
  for (let t = 1; t <= seconds; t++) {
    for (let i = 0; i < TAPS_PER_SEC; i++) tap(s, 0);
    tick(s, 1, 0);
    for (let next = nextPurchase(s); next; next = nextPurchase(s)) {
      next.apply(s);
      purchases.push(t);
      if (!(next.label in firsts)) firsts[next.label] = t;
    }
  }
  return { state: s, purchases, firsts };
}

function maxGap(times: number[], until: number): number {
  let prev = 0;
  let gap = 0;
  for (const t of times) {
    if (t > until) break;
    gap = Math.max(gap, t - prev);
    prev = t;
  }
  return Math.max(gap, until - prev);
}

describe('pacing', () => {
  const run = simulate(90 * 60);

  it('prints a pacing report', () => {
    const lines = Object.entries(run.firsts)
      .sort((a, b) => a[1] - b[1])
      .map(([label, t]) => `  ${formatDuration(t).padStart(8)}  ${label}`);
    console.log(
      [
        `Pacing over 90 min at ${TAPS_PER_SEC} taps/s`,
        `  purchases: ${run.purchases.length}`,
        `  income at end: ${format(baseIncome(run.state))}/s`,
        `  longest wait in first 30 min: ${maxGap(run.purchases, 30 * 60)}s`,
        `  longest wait in first 90 min: ${maxGap(run.purchases, 90 * 60)}s`,
        '  first purchase of each:',
        ...lines,
      ].join('\n'),
    );
  });

  it('never makes the player wait more than 2.5 minutes in the first half hour', () => {
    expect(maxGap(run.purchases, 30 * 60)).toBeLessThanOrEqual(150);
  });

  // Past an hour the run is meant to slow down; prestige takes over there.
  it('keeps waits under 5 minutes for the first hour', () => {
    expect(maxGap(run.purchases, 60 * 60)).toBeLessThanOrEqual(300);
  });

  it('reaches every generator within 90 minutes', () => {
    for (const g of GENERATORS) expect(run.firsts[g.name]).toBeDefined();
  });
});
