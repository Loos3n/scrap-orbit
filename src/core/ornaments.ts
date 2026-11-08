import type { GameState } from './state';

/*
 * Station decorations: lights, plants, posters and a few silly things that sit on the station
 * itself. Each one unlocks for something done while playing, goes up on the station straight
 * away, and can be taken down or put back from Station > Decor. They are just for looks and stay
 * through relocations and galaxy shifts.
 */

export type OrnamentKind = 'lights' | 'plants' | 'posters' | 'fun';

export interface OrnamentDef {
  id: string;
  name: string;
  kind: OrnamentKind;
  /** What unlocks it, shown on a locked card. */
  hint: string;
  /** How far along the player is towards it, as [have, need]. */
  progress: (s: GameState) => [number, number];
}

export const ORNAMENTS: readonly OrnamentDef[] = [
  { id: 'bulbs', name: 'String Lights', kind: 'lights', hint: 'Own 10 Salvage Drones', progress: (s) => [s.owned.drone, 10] },
  { id: 'fern', name: 'Hanging Fern', kind: 'plants', hint: 'Build a Hauler', progress: (s) => [s.owned.hauler, 1] },
  { id: 'poster', name: 'Retro Poster', kind: 'posters', hint: 'Install 5 upgrades', progress: (s) => [s.stats.upgradesBought, 5] },
  { id: 'pennant', name: 'Antenna Pennant', kind: 'fun', hint: 'Grab 5 salvage crates', progress: (s) => [s.stats.crates, 5] },
  { id: 'garden', name: 'Wing Garden', kind: 'plants', hint: 'Build a Smelter', progress: (s) => [s.owned.smelter, 1] },
  { id: 'lanterns', name: 'Paper Lanterns', kind: 'lights', hint: 'Fire Overdrive 5 times', progress: (s) => [s.stats.boosts, 5] },
  { id: 'duck', name: 'Rubber Duck', kind: 'fun', hint: 'Tap the station 1,000 times', progress: (s) => [s.taps, 1000] },
  { id: 'cactus', name: 'Moon Cactus', kind: 'plants', hint: 'Smash 25 meteors', progress: (s) => [s.stats.meteors, 25] },
  { id: 'gnome', name: 'Space Gnome', kind: 'fun', hint: 'Adopt a pet', progress: (s) => [s.pets.owned.size, 1] },
  { id: 'neon', name: 'Neon Sign', kind: 'posters', hint: 'Relocate the station', progress: (s) => [s.stats.relocations, 1] },
  { id: 'disco', name: 'Disco Ball', kind: 'lights', hint: 'Break a boss wreck', progress: (s) => [s.stats.bosses, 1] },
  { id: 'bunting', name: 'Party Bunting', kind: 'fun', hint: 'Earn 10 achievements', progress: (s) => [s.achievements.size, 10] },
];

export const ORNAMENT_KINDS: Record<OrnamentKind, string> = { lights: 'Lights', plants: 'Plants', posters: 'Posters', fun: 'Fun' };

/**
 * Unlocks every decoration the player has now earned and puts it up. Returns the new ones.
 * Some unlocks count things a relocation resets (machines owned), so earned ones are kept.
 */
export function checkOrnaments(state: GameState): OrnamentDef[] {
  const fresh: OrnamentDef[] = [];
  for (const o of ORNAMENTS) {
    if (state.ornaments.got.has(o.id)) continue;
    const [have, need] = o.progress(state);
    if (have < need) continue;
    state.ornaments.got.add(o.id);
    state.ornaments.on.add(o.id);
    fresh.push(o);
  }
  return fresh;
}

/** Takes a decoration down, or puts it back up. */
export function toggleOrnament(state: GameState, id: string): boolean {
  if (!state.ornaments.got.has(id)) return false;
  if (state.ornaments.on.has(id)) state.ornaments.on.delete(id);
  else state.ornaments.on.add(id);
  return true;
}
