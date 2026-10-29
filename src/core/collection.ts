import { GENERATORS } from './config';
import { BOSS_NAMES, CREW, PETS, SECTORS } from './content';
import { LOOT } from './expansion';
import type { GameState } from './state';

/*
 * Cargo safes (the wreck mini-game), the collection book and the station skins its sets unlock.
 * Like expansion.ts this only reads the save; actions live in meta.ts.
 */

// ---------- Cargo safes ----------

export interface SafeType {
  id: string;
  name: string;
  color: number;
}

export const SAFE_TYPES: readonly SafeType[] = [
  { id: 'supply', name: 'Supply Crate', color: 0x4fe3c1 },
  { id: 'bank', name: 'Bank Vault', color: 0xffd166 },
  { id: 'military', name: 'Military Locker', color: 0xff5d6c },
  { id: 'relic', name: 'Ancient Relic', color: 0xc58cff },
];

export const SAFE = {
  /** Minutes of play before the first locked pod, then between pods. */
  firstMin: 12,
  gap: [25, 40] as [number, number],
  /** How long a pod waits to be cracked before drifting off. */
  stayMin: 2,
  locks: 3,
  /** Misses allowed before the lock jams. */
  lives: 3,
  /** Reward by locks opened (0 to 3): minutes of income, and crystals. */
  scrapMin: [0, 2, 5, 12],
  crystals: [0, 1, 3, 8],
  /** Each lock: seconds per full turn of the needle, and the size of the green zone in degrees. */
  turn: [2.6, 2.0, 1.5],
  zone: [60, 46, 36],
};

// ---------- Collection book ----------

export interface CollectionItem {
  id: string;
  name: string;
}

export interface CollectionSet {
  id: string;
  name: string;
  desc: string;
  crystals: number;
  /** The station skin finishing the set unlocks. */
  skin: string;
  color: number;
  items: (state: GameState) => { item: CollectionItem; got: boolean }[];
}

const seen = (state: GameState, key: string) => state.collection.has(key);

export const SETS: readonly CollectionSet[] = [
  {
    id: 'wrecks',
    name: 'Wreck Hunter',
    desc: 'Break every kind of boss wreck.',
    crystals: 15,
    skin: 'salvager',
    color: 0xff8a4c,
    items: (s) => BOSS_NAMES.map((name, i) => ({ item: { id: `boss:${i}`, name }, got: seen(s, `boss:${i}`) })),
  },
  {
    id: 'sectors',
    name: 'Star Charts',
    desc: 'Visit every sector of the scrapyard.',
    crystals: 20,
    skin: 'starlight',
    color: 0x9fe0ff,
    items: (s) => SECTORS.map((sec, i) => ({ item: { id: `sector:${i}`, name: sec.name }, got: seen(s, `sector:${i}`) })),
  },
  {
    id: 'machines',
    name: 'Machine Park',
    desc: 'Build every kind of machine at least once.',
    crystals: 15,
    skin: 'gilded',
    color: 0xffd166,
    items: (s) => GENERATORS.map((g) => ({ item: { id: `gen:${g.id}`, name: g.name }, got: seen(s, `gen:${g.id}`) || s.owned[g.id] > 0 })),
  },
  {
    id: 'safes',
    name: 'Safe Cracker',
    desc: 'Fully crack every kind of locked cargo.',
    crystals: 20,
    skin: 'vault',
    color: 0x9dff6b,
    items: (s) => SAFE_TYPES.map((t) => ({ item: { id: `safe:${t.id}`, name: t.name }, got: seen(s, `safe:${t.id}`) })),
  },
  {
    id: 'pets',
    name: 'Pet Pals',
    desc: 'Adopt every pet.',
    crystals: 10,
    skin: 'cozy',
    color: 0xffb8d0,
    items: (s) => PETS.map((p) => ({ item: { id: `pet:${p.id}`, name: p.name }, got: s.pets.owned.has(p.id) })),
  },
  {
    id: 'parts',
    name: 'Wreck Parts',
    desc: 'Find every part boss wrecks drop.',
    crystals: 25,
    skin: 'warlord',
    color: 0xff5d6c,
    items: (s) => LOOT.filter((l) => !l.pet).map((l) => ({ item: { id: `loot:${l.id}`, name: l.name }, got: s.loot.has(l.id) })),
  },
  {
    id: 'crew',
    name: 'Full Roster',
    desc: 'Recruit every crew member.',
    crystals: 20,
    skin: 'captain',
    color: 0x7aa7ff,
    items: (s) => CREW.map((c) => ({ item: { id: `crew:${c.id}`, name: c.name }, got: s.crew[c.id] > 0 })),
  },
];

export function setComplete(state: GameState, set: CollectionSet): boolean {
  return set.items(state).every((x) => x.got);
}

// ---------- Station skins ----------

export interface SkinDef {
  id: string;
  name: string;
  /** Hull plating, the reactor's glow, the beacons and a wash over every machine. */
  hull: number;
  core: number;
  beacons: [number, number];
  machines: number;
}

export const SKINS: readonly SkinDef[] = [
  { id: 'salvager', name: 'Salvager', hull: 0xd89a6a, core: 0xff8a3c, beacons: [0xffb547, 0xff5d3c], machines: 0xffd0a8 },
  { id: 'starlight', name: 'Starlight', hull: 0xd8ecff, core: 0xbfe8ff, beacons: [0xffffff, 0x9fe0ff], machines: 0xe0f0ff },
  { id: 'gilded', name: 'Gilded', hull: 0xffd88a, core: 0xffe08a, beacons: [0xffd166, 0xfff0b0], machines: 0xffe6a0 },
  { id: 'vault', name: 'Vault', hull: 0xa8e0b0, core: 0x9dff6b, beacons: [0x9dff6b, 0xffd166], machines: 0xc8f0c0 },
  { id: 'cozy', name: 'Cozy', hull: 0xffc8dc, core: 0xff9ac8, beacons: [0xffb8d0, 0xb8e0ff], machines: 0xffe0ec },
  { id: 'warlord', name: 'Warlord', hull: 0x8a6a78, core: 0xff3d5a, beacons: [0xff3d5a, 0xff8a4c], machines: 0xd8a0a8 },
  { id: 'captain', name: 'Captain', hull: 0x8fa0e0, core: 0xffd166, beacons: [0xffd166, 0x7aa7ff], machines: 0xc0ccff },
];

export function skinUnlocked(state: GameState, id: string): boolean {
  const set = SETS.find((s) => s.skin === id);
  return !!set && state.setsDone.has(set.id);
}
