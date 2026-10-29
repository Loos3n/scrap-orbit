import { GENERATORS, UPGRADES, type GeneratorId } from './config';
import { baseIncome, coreTotal, costDiscount, costFor, genById, lastCoreAt, nextCoreAt, nextMilestone, upgradeVisible } from './economy';
import { challengeOn } from './expansion';
import { D, Decimal } from './num';
import type { GameState } from './state';

/*
 * Two helpers for the Build tab: Buy Best, which picks the purchase that pays for itself
 * soonest, and the Next Goal line, which names one thing to work towards. Both only read the save.
 */

export type Purchase =
  | { kind: 'machine'; id: GeneratorId; count: number; cost: Decimal; gain: Decimal }
  | { kind: 'upgrade'; id: string; count: 1; cost: Decimal; gain: Decimal };

/** Machines on show in the Build tab: everything owned plus the next new one. */
export function visibleMachines(state: GameState): GeneratorId[] {
  const out: GeneratorId[] = [];
  for (const g of GENERATORS) {
    out.push(g.id);
    if (state.owned[g.id] === 0) break;
  }
  return out;
}

/** Income per second a change would add, found by making it on the save and undoing it. */
function gainOf(state: GameState, before: Decimal, apply: () => void, undo: () => void): Decimal {
  apply();
  const after = baseIncome(state);
  undo();
  return after.sub(before);
}

/** Every purchase that adds income: one of each machine, enough to reach its next milestone, and each upgrade. */
export function incomePurchases(state: GameState): Purchase[] {
  const before = baseIncome(state);
  const discount = costDiscount(state);
  const out: Purchase[] = [];
  for (const id of visibleMachines(state)) {
    const owned = state.owned[id];
    const counts = [1];
    // Several at once can win when they reach a milestone that doubles the whole stack.
    const next = nextMilestone(owned);
    if (next && next.at - owned > 1 && next.at - owned <= 50) counts.push(next.at - owned);
    for (const count of counts) {
      const gain = gainOf(state, before, () => (state.owned[id] = owned + count), () => (state.owned[id] = owned));
      if (gain.gt(0)) out.push({ kind: 'machine', id, count, cost: costFor(genById(id), owned, count, discount), gain });
    }
  }
  if (!challengeOn(state, 'noupg')) {
    for (const u of UPGRADES) {
      if (state.upgrades.has(u.id) || !upgradeVisible(state, u)) continue;
      const gain = gainOf(state, before, () => state.upgrades.add(u.id), () => state.upgrades.delete(u.id));
      if (gain.gt(0)) out.push({ kind: 'upgrade', id: u.id, count: 1, cost: D(u.cost), gain });
    }
  }
  return out;
}

/**
 * The purchase that pays off soonest: seconds to save up for it, plus seconds for its extra
 * income to earn back its price. Waiting counts, so a far-off bargain loses to something buyable now.
 */
export function bestPurchase(state: GameState): Purchase | null {
  const income = baseIncome(state);
  let best: Purchase | null = null;
  let bestScore = Infinity;
  for (const p of incomePurchases(state)) {
    const short = p.cost.sub(state.scrap);
    const wait = short.lte(0) ? 0 : income.gt(0) ? short.div(income).toNumber() : Infinity;
    const score = wait + p.cost.div(p.gain).toNumber();
    if (score < bestScore || (score === bestScore && best && p.cost.lt(best.cost))) {
      best = p;
      bestScore = score;
    }
  }
  // With no income yet, the first machine is the way forward.
  if (!best && income.lte(0)) {
    const id = GENERATORS[0].id;
    return { kind: 'machine', id, count: 1, cost: costFor(genById(id), state.owned[id], 1, costDiscount(state)), gain: D(0) };
  }
  return best;
}

export type Goal = {
  /** Stays the same while the goal does, so the line can hold on to it. */
  key: string;
  text: string;
  /** Scrap still to save for it, and what it costs in total. */
  cost: Decimal;
  /** The pane that finishes it. */
  pane: 'build' | 'upgrades' | 'cores';
};

/** Whether a goal from `goalKey` is still open: false once it is done. */
export function goalOpen(state: GameState, key: string): boolean {
  const [kind, id, at] = key.split(':');
  if (kind === 'new') return state.owned[id as GeneratorId] === 0;
  if (kind === 'ms') return state.owned[id as GeneratorId] < Number(at);
  if (kind === 'upg') return !state.upgrades.has(id) && !challengeOn(state, 'noupg');
  if (kind === 'core') return coreTotal(state) < Number(id);
  return false;
}

/** Every goal on offer now. */
function goals(state: GameState): Goal[] {
  const discount = costDiscount(state);
  const out: Goal[] = [];
  for (const id of visibleMachines(state)) {
    const g = genById(id);
    const owned = state.owned[id];
    if (owned === 0) {
      out.push({ key: `new:${id}`, text: `Build your first ${g.name}`, cost: costFor(g, 0, 1, discount), pane: 'build' });
      continue;
    }
    const next = nextMilestone(owned);
    if (next) out.push({ key: `ms:${id}:${next.at}`, text: `${owned} / ${next.at} ${g.name}s for 2x output`, cost: costFor(g, owned, next.at - owned, discount), pane: 'build' });
  }
  if (!challengeOn(state, 'noupg')) {
    for (const u of UPGRADES) {
      if (state.upgrades.has(u.id) || !upgradeVisible(state, u)) continue;
      out.push({ key: `upg:${u.id}`, text: `Install ${u.name}`, cost: D(u.cost), pane: 'upgrades' });
    }
  }
  return out;
}

/** The goal shown on screen: the cheapest one, or the next Star Core once the build list runs dry. */
export function pickGoal(state: GameState): Goal | null {
  let best: Goal | null = null;
  for (const g of goals(state)) if (!best || g.cost.lt(best.cost)) best = g;
  if (best) return best;
  const n = coreTotal(state) + 1;
  return { key: `core:${n}`, text: n === 1 ? 'Earn your first Star Core' : 'Earn the next Star Core', cost: nextCoreAt(state), pane: 'cores' };
}

/** A goal by key, recomputed so its cost is current; null once it is done. */
export function goalByKey(state: GameState, key: string): Goal | null {
  if (!goalOpen(state, key)) return null;
  if (key.startsWith('core:')) {
    const n = Number(key.split(':')[1]);
    return { key, text: n === 1 ? 'Earn your first Star Core' : 'Earn the next Star Core', cost: nextCoreAt(state), pane: 'cores' };
  }
  return goals(state).find((g) => g.key === key) ?? null;
}

/** How far along a goal is, from 0 to 1. Star Cores count all-time scrap; the rest count scrap on hand. */
export function goalProgress(state: GameState, goal: Goal): number {
  if (goal.key.startsWith('core:')) {
    const from = lastCoreAt(state);
    const span = goal.cost.sub(from);
    return span.lte(0) ? 1 : Math.max(0, Math.min(1, state.allTime.sub(from).div(span).toNumber()));
  }
  if (goal.cost.lte(0)) return 1;
  return Math.max(0, Math.min(1, state.scrap.div(goal.cost).toNumber()));
}
