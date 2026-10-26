import { describe, expect, it } from 'vitest';
import { GENERATORS, UPGRADES } from './config';
import {
  baseIncome,
  buyClaw,
  buyGenerator,
  buyUpgrade,
  claimableCores,
  clawCost,
  costFor,
  relocate,
  tap,
  tapValue,
  tick,
  upgradeVisible,
} from './economy';
import { checkAchievements } from './achievements';
import { format, formatDuration } from './num';
import { deserialize, newState, serialize, type GameState } from './state';

const TAPS_PER_SEC = 3;

/** Income gained per scrap spent, counting taps at TAPS_PER_SEC. */
function valueOf(state: GameState): number {
  return baseIncome(state).toNumber() + tapValue(state, 0).toNumber() * TAPS_PER_SEC;
}

type Option = { label: string; cost: number; apply: (s: GameState) => void };

function options(state: GameState): Option[] {
  const out: Option[] = [{ label: 'Salvage Claw', cost: clawCost(state), apply: (s) => buyClaw(s) }];
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
function simulate(seconds: number, start?: GameState) {
  const s = start ?? newState(0);
  const purchases: number[] = [];
  const firsts: Record<string, number> = {};
  for (let t = 1; t <= seconds; t++) {
    for (let i = 0; i < TAPS_PER_SEC; i++) tap(s, 0);
    tick(s, 1, 0);
    if (t % 10 === 0) checkAchievements(s);
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

  it('reaches the Mining Laser within 45 minutes and the Gravity Well within 90', () => {
    expect(run.firsts['Mining Laser']).toBeLessThanOrEqual(45 * 60);
    expect(run.firsts['Gravity Well']).toBeLessThanOrEqual(90 * 60);
  });
});

describe('prestige pacing', () => {
  /** Hour-long runs, relocating after each, like a player who prestiges once a session. */
  const runs: { cores: number; lifetime: string; reached: string; gainedAt60: number }[] = [];
  const state = newState(0);
  for (let i = 0; i < 5; i++) {
    const r = simulate(60 * 60, state);
    const reached = GENERATORS.filter((g) => r.state.owned[g.id] > 0).at(-1)!.name;
    runs.push({ cores: state.cores, lifetime: format(state.lifetime), reached, gainedAt60: claimableCores(state) });
    relocate(state, 0);
  }

  it('prints a prestige report', () => {
    console.log(
      ['Five 1-hour runs, relocating after each:', ...runs.map((r, i) => `  run ${i + 1}: started with ${r.cores} cores, earned ${r.lifetime}, reached ${r.reached}, +${r.gainedAt60} cores`)].join('\n'),
    );
  });

  it('offers a worthwhile first relocation after an hour', () => {
    expect(runs[0].gainedAt60).toBeGreaterThanOrEqual(5);
  });

  it('makes each run reach at least as far as the one before', () => {
    const idx = (name: string) => GENERATORS.findIndex((g) => g.name === name);
    for (let i = 1; i < runs.length; i++) expect(idx(runs[i].reached)).toBeGreaterThanOrEqual(idx(runs[i - 1].reached));
    expect(idx(runs.at(-1)!.reached)).toBeGreaterThan(idx(runs[0].reached));
  });
});
