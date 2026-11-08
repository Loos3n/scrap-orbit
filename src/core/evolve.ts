import { GENERATORS, MARKS, type GeneratorId, type MarkDef } from './config';

/*
 * Machine evolutions. Owning enough of one machine refits it into a new model (Mk II at 100,
 * up to Mk V at 1000): a new name, a new look on the station and a bigger output multiplier.
 * The mark is worked out from the count, so it needs nothing in the save.
 */

/** 0 for the original model, 1 for Mk II, and so on. */
export function markOf(owned: number): number {
  let m = 0;
  for (const d of MARKS) if (owned >= d.at) m++;
  return m;
}

/** The output multiplier from every mark reached. */
export function markMult(owned: number): number {
  let k = 1;
  for (const d of MARKS) if (owned >= d.at) k *= d.mult;
  return k;
}

/** The next model up, or null once a machine is at its last mark. */
export function nextMark(owned: number): MarkDef | null {
  return MARKS.find((d) => owned < d.at) ?? null;
}

/** "Salvage Drone Mk II", or just the name for the original model. */
export function modelName(id: GeneratorId, owned: number): string {
  const g = GENERATORS.find((x) => x.id === id)!;
  const m = markOf(owned);
  return m === 0 ? g.name : `${g.name} ${MARKS[m - 1].name}`;
}
