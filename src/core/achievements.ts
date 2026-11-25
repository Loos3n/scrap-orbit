import { GENERATORS, UPGRADES } from './config';
import { baseIncome } from './economy';
import type { GameState } from './state';
import { WHALE_STAGES } from './whale';
import { PLANET_ERAS } from './planet';
import { journeyDone } from './journey';

const whaleAt = (id: string) => WHALE_STAGES.find((x) => x.id === id)!.at;
const eraOf = (id: string) => PLANET_ERAS.findIndex((x) => x.id === id);
const caught = (s: GameState) => Object.values(s.fishing.caught).reduce((n, k) => n + k, 0);
const hearts = (s: GameState) => Object.values(s.visitors.hearts).filter((n) => (n ?? 0) >= 3).length;

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  test: (s: GameState) => boolean;
}

const plural = (name: string) => (name.endsWith('s') ? name : `${name}s`);

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first-machine', name: 'Open for Business', desc: 'Build your first machine.', test: (s) => s.owned.drone > 0 },
  ...GENERATORS.map((g) => ({
    id: `own50-${g.id}`,
    name: `Fleet of ${plural(g.name)}`,
    desc: `Own 50 ${plural(g.name)}.`,
    test: (s: GameState) => s.owned[g.id] >= 50,
  })),
  { id: 'taps100', name: 'Warming Up', desc: 'Tap 100 times.', test: (s) => s.taps >= 100 },
  { id: 'taps1k', name: 'Claw Enthusiast', desc: 'Tap 1,000 times.', test: (s) => s.taps >= 1_000 },
  { id: 'taps10k', name: 'Claw Legend', desc: 'Tap 10,000 times.', test: (s) => s.taps >= 10_000 },
  { id: 'earn1m', name: 'Millionaire', desc: 'Salvage 1M scrap in total.', test: (s) => s.allTime.gte(1e6) },
  { id: 'earn1b', name: 'Scrap Baron', desc: 'Salvage 1B scrap in total.', test: (s) => s.allTime.gte(1e9) },
  { id: 'earn1t', name: 'Junk Tycoon', desc: 'Salvage 1T scrap in total.', test: (s) => s.allTime.gte(1e12) },
  { id: 'earn1qa', name: 'Galactic Hoarder', desc: 'Salvage 1Qa scrap in total.', test: (s) => s.allTime.gte(1e15) },
  { id: 'rate1k', name: 'Assembly Line', desc: 'Earn 1K scrap per second.', test: (s) => baseIncome(s).gte(1e3) },
  { id: 'rate1m', name: 'Industrial Revolution', desc: 'Earn 1M scrap per second.', test: (s) => baseIncome(s).gte(1e6) },
  { id: 'rate1b', name: 'Post-Scarcity', desc: 'Earn 1B scrap per second.', test: (s) => baseIncome(s).gte(1e9) },
  { id: 'crate1', name: 'Finders Keepers', desc: 'Grab a salvage crate.', test: (s) => s.stats.crates >= 1 },
  { id: 'crate10', name: 'Crate Collector', desc: 'Grab 10 salvage crates.', test: (s) => s.stats.crates >= 10 },
  { id: 'boost10', name: 'Need for Speed', desc: 'Use Overdrive 10 times.', test: (s) => s.stats.boosts >= 10 },
  { id: 'relocate1', name: 'Moving Day', desc: 'Relocate your station.', test: (s) => s.stats.relocations >= 1 },
  { id: 'relocate5', name: 'Nomad', desc: 'Relocate your station 5 times.', test: (s) => s.stats.relocations >= 5 },
  { id: 'contract1', name: 'Under Contract', desc: 'Meet a run contract.', test: (s) => s.contractsDone >= 1 },
  { id: 'contract10', name: 'Contractor', desc: 'Meet 10 run contracts.', test: (s) => s.contractsDone >= 10 },
  { id: 'galaxy1', name: 'Star Hopper', desc: 'Shift to a new galaxy.', test: (s) => s.galaxy.shifts >= 1 },
  { id: 'galaxy3', name: 'Intergalactic', desc: 'Shift galaxies 3 times.', test: (s) => s.galaxy.shifts >= 3 },
  { id: 'starmap', name: 'Cartographer', desc: 'Fill in the whole Star Map.', test: (s) => s.galaxy.map.size >= 8 },
  { id: 'all-upgrades', name: 'Fully Loaded', desc: 'Install every upgrade.', test: (s) => UPGRADES.every((u) => s.upgrades.has(u.id)) },
  // The newer corners of the station: the whale, the planet, the crew's hobbies and the fleet.
  { id: 'whale-hatch', name: 'It Thinks You Are Its Mother', desc: 'Hatch the warm egg.', test: (s) => s.whale.phase === 'born' },
  { id: 'whale-adult', name: 'Big Fish (Technically)', desc: 'Raise your whale to an Adult.', test: (s) => s.whale.phase === 'born' && s.whale.growth >= whaleAt('adult') },
  { id: 'whale-nursery', name: 'Home Waters', desc: 'Let your whale tow the station to the Nursery.', test: (s) => s.whale.nursery },
  { id: 'planet-oceans', name: 'First Rain', desc: 'Bring your planet to the Oceans era.', test: (s) => s.planet.found && s.planet.era >= eraOf('oceans') },
  { id: 'planet-thriving', name: 'World Builder', desc: 'Bring your planet all the way to a Thriving world.', test: (s) => s.planet.found && s.planet.era >= eraOf('thriving') },
  { id: 'boss10', name: 'Wreck Breaker', desc: 'Break 10 boss wrecks.', test: (s) => s.stats.bosses >= 10 },
  { id: 'fish10', name: 'Gone Fishing', desc: 'Land 10 catches.', test: (s) => caught(s) >= 10 },
  { id: 'garden10', name: 'Green Thumb', desc: 'Harvest the garden 10 times.', test: (s) => s.garden.harvested >= 10 },
  { id: 'dive10', name: 'Deep Diver', desc: 'Make 10 salvage dives.', test: (s) => s.dive.dives >= 10 },
  { id: 'visitor-friend', name: 'Good Neighbour', desc: 'Make a dock visitor a friend of the station.', test: (s) => hearts(s) >= 1 },
  { id: 'fleet1', name: 'Shipwright', desc: 'Rebuild a ship of the Hollow Fleet.', test: (s) => Object.values(s.fleet.ranks).some((n) => (n ?? 0) > 0) },
  { id: 'captain', name: 'Captain on Deck', desc: 'Reach the rank of Captain.', test: journeyDone },
];

/** Unlocks any achievements the state now meets and returns the new ones. */
export function checkAchievements(s: GameState): AchievementDef[] {
  const fresh = ACHIEVEMENTS.filter((a) => !s.achievements.has(a.id) && a.test(s));
  for (const a of fresh) s.achievements.add(a.id);
  return fresh;
}
