import type { GeneratorId } from './config';

/*
 * The station itself grows as the player builds: every stage adds a visible piece of hull
 * around the hub, so a glance at the scene shows how far this run has come.
 */

export interface GrowthStage {
  /** Machines owned in total (all kinds) to reach this stage. */
  at: number;
  name: string;
  desc: string;
}

export const GROWTH: readonly GrowthStage[] = [
  { at: 0, name: 'Salvage Hub', desc: 'Where it all starts.' },
  { at: 30, name: 'Habitat Ring', desc: 'A ring of crew cabins, lights on in every window.' },
  { at: 90, name: 'Cargo Spokes', desc: 'Four spokes reach out to stack the haul.' },
  { at: 200, name: 'Outer Ring', desc: 'A wide second ring turns slowly around everything.' },
  { at: 400, name: 'Spire Beacons', desc: 'Tall beacons blink on the outer ring.' },
  { at: 700, name: 'Star Crown', desc: 'A ring of starlight crowns the finished station.' },
];

export function machinesOwned(owned: Record<GeneratorId, number>): number {
  return Object.values(owned).reduce((a, b) => a + b, 0);
}

/** The station's stage index (0 = bare hub) for the machines owned. */
export function growthStage(owned: Record<GeneratorId, number>): number {
  const n = machinesOwned(owned);
  let stage = 0;
  GROWTH.forEach((g, i) => {
    if (n >= g.at) stage = i;
  });
  return stage;
}
