import type { GeneratorId } from './config';

/**
 * Meta-game content: crew, research, decorations, missions and timed events.
 * Crystals are the soft currency for all of it. They come from missions, events,
 * achievements and relocations, never from scrap, so they stay meaningful late on.
 */

// ---------- Crew ----------

export type CrewId = 'mika' | 'bolt' | 'ash' | 'juno' | 'hex' | 'ray' | 'nova' | 'pip' | 'orin' | 'sol';

export interface CrewDef {
  id: CrewId;
  name: string;
  role: string;
  gen: GeneratorId;
  /** Crystals to recruit. Each level after that costs this times the current level. */
  cost: number;
  look: { skin: string; hair: string; suit: string; visor: string; style: 'helmet' | 'buzz' | 'bun' | 'spiky' | 'bob' };
}

export const CREW_MAX_LEVEL = 5;
/** A crew member at level L multiplies their machine's output by 1 + L * this. */
export const CREW_PER_LEVEL = 1;

export const CREW: readonly CrewDef[] = [
  { id: 'mika', name: 'Mika', role: 'Drone Wrangler', gen: 'drone', cost: 5, look: { skin: '#f2c7a5', hair: '#3b2a24', suit: '#4fe3c1', visor: '#bff', style: 'bun' } },
  { id: 'bolt', name: 'Bolt', role: 'Tow Pilot', gen: 'hauler', cost: 10, look: { skin: '#8d5a3b', hair: '#1d1a26', suit: '#7aa7ff', visor: '#cde', style: 'buzz' } },
  { id: 'ash', name: 'Ash', role: 'Furnace Chief', gen: 'smelter', cost: 15, look: { skin: '#e0ac86', hair: '#c0462e', suit: '#ff8a4c', visor: '#ffd', style: 'spiky' } },
  { id: 'juno', name: 'Juno', role: 'Print Tech', gen: 'fabricator', cost: 20, look: { skin: '#c68c64', hair: '#6b3fc2', suit: '#c58cff', visor: '#eef', style: 'bob' } },
  { id: 'hex', name: 'Hex', role: 'Dockmaster', gen: 'dock', cost: 30, look: { skin: '#5e3a28', hair: '#e8e2d0', suit: '#ffd166', visor: '#ffe', style: 'helmet' } },
  { id: 'ray', name: 'Ray', role: 'Laser Gunner', gen: 'laser', cost: 40, look: { skin: '#f5d0b5', hair: '#f0d060', suit: '#ff5d6c', visor: '#fdd', style: 'spiky' } },
  { id: 'nova', name: 'Nova', role: 'Gravity Engineer', gen: 'gravity', cost: 50, look: { skin: '#a8714d', hair: '#22d0ff', suit: '#5ce1ff', visor: '#dff', style: 'bob' } },
  { id: 'pip', name: 'Pip', role: 'Swarm Whisperer', gen: 'nanite', cost: 60, look: { skin: '#ffd9c0', hair: '#4a8f2a', suit: '#9dff6b', visor: '#efe', style: 'bun' } },
  { id: 'orin', name: 'Orin', role: 'Gate Navigator', gen: 'gate', cost: 80, look: { skin: '#7a4a32', hair: '#2a2060', suit: '#8f7bff', visor: '#ddf', style: 'helmet' } },
  { id: 'sol', name: 'Sol', role: 'Star Shepherd', gen: 'dyson', cost: 100, look: { skin: '#e8b48c', hair: '#fff1c0', suit: '#ffe9a8', visor: '#fff', style: 'buzz' } },
];

export function crewCost(def: CrewDef, level: number): number {
  return def.cost * Math.max(1, level);
}

// ---------- Research ----------

export type ResearchEffect =
  | { kind: 'tapMult'; mult: number }
  | { kind: 'tapIncomeShare'; share: number }
  | { kind: 'allMult'; mult: number }
  | { kind: 'costMult'; mult: number }
  | { kind: 'crateRate'; mult: number }
  | { kind: 'offlineSec'; sec: number }
  | { kind: 'offlineMult'; mult: number }
  | { kind: 'eventRate'; mult: number }
  | { kind: 'flareMult'; mult: number }
  | { kind: 'crewMult'; mult: number }
  | { kind: 'boostSec'; sec: number }
  | { kind: 'missionMult'; mult: number }
  | { kind: 'corePerCore'; add: number };

export interface ResearchDef {
  id: string;
  branch: 0 | 1 | 2 | 3;
  name: string;
  desc: string;
  /** Real seconds it takes. Research keeps running while the game is closed. */
  seconds: number;
  requires?: string;
  effect: ResearchEffect;
}

export const BRANCHES = ['Salvage', 'Industry', 'Logistics', 'Command'] as const;

const MIN = 60;
const HOUR = 3600;

export const RESEARCH: readonly ResearchDef[] = [
  { id: 'claw1', branch: 0, name: 'Servo Grip', desc: 'Taps 2x.', seconds: 2 * MIN, effect: { kind: 'tapMult', mult: 2 } },
  { id: 'claw2', branch: 0, name: 'Reactive Claw', desc: 'Each tap also gives 2% of your income per second.', seconds: 15 * MIN, requires: 'claw1', effect: { kind: 'tapIncomeShare', share: 0.02 } },
  { id: 'claw3', branch: 0, name: 'Claw Swarm', desc: 'Taps 3x.', seconds: HOUR, requires: 'claw2', effect: { kind: 'tapMult', mult: 3 } },
  { id: 'flare', branch: 0, name: 'Flare Shielding', desc: 'Solar flares boost taps 10x instead of 5x.', seconds: 2 * HOUR, requires: 'claw3', effect: { kind: 'flareMult', mult: 2 } },
  { id: 'ind1', branch: 1, name: 'Lean Assembly', desc: 'Machines cost 5% less.', seconds: 5 * MIN, effect: { kind: 'costMult', mult: 0.95 } },
  { id: 'ind2', branch: 1, name: 'Overclocked Cores', desc: 'Everything produces 1.5x.', seconds: 30 * MIN, requires: 'ind1', effect: { kind: 'allMult', mult: 1.5 } },
  { id: 'ind3', branch: 1, name: 'Bulk Contracts', desc: 'Machines cost 10% less.', seconds: 2 * HOUR, requires: 'ind2', effect: { kind: 'costMult', mult: 0.9 } },
  { id: 'ind4', branch: 1, name: 'Fusion Lattice', desc: 'Everything produces 2x.', seconds: 8 * HOUR, requires: 'ind3', effect: { kind: 'allMult', mult: 2 } },
  { id: 'log1', branch: 2, name: 'Long-Range Scanners', desc: 'Salvage crates drift by 1.5x as often.', seconds: 5 * MIN, effect: { kind: 'crateRate', mult: 1.5 } },
  { id: 'log2', branch: 2, name: 'Night Crew', desc: 'Offline earnings last 2 hours longer.', seconds: 30 * MIN, requires: 'log1', effect: { kind: 'offlineSec', sec: 2 * HOUR } },
  { id: 'log3', branch: 2, name: 'Event Beacon', desc: 'Events happen 1.5x as often.', seconds: HOUR, requires: 'log2', effect: { kind: 'eventRate', mult: 1.5 } },
  { id: 'log4', branch: 2, name: 'Deep Storage', desc: 'Offline earnings 2x.', seconds: 4 * HOUR, requires: 'log3', effect: { kind: 'offlineMult', mult: 2 } },
  { id: 'cmd1', branch: 3, name: 'Crew Quarters', desc: 'Crew bonuses 25% stronger.', seconds: 10 * MIN, effect: { kind: 'crewMult', mult: 1.25 } },
  { id: 'cmd2', branch: 3, name: 'Afterburner Tuning', desc: 'Overdrive lasts 15 seconds longer.', seconds: 30 * MIN, requires: 'cmd1', effect: { kind: 'boostSec', sec: 15 } },
  { id: 'cmd3', branch: 3, name: 'Mission Control', desc: 'Missions give 50% more crystals.', seconds: 2 * HOUR, requires: 'cmd2', effect: { kind: 'missionMult', mult: 1.5 } },
  { id: 'cmd4', branch: 3, name: 'Core Resonance', desc: 'Each Star Core gives +12% income instead of +10%.', seconds: 8 * HOUR, requires: 'cmd3', effect: { kind: 'corePerCore', add: 0.02 } },
];

/** Crystals to finish a running research now: one per started minute left, at least 5. */
export function rushCost(secondsLeft: number): number {
  return Math.max(5, Math.ceil(secondsLeft / 60));
}

// ---------- Decorations ----------

export interface ThemeDef {
  id: string;
  name: string;
  cost: number;
  /** Station core glow and floating numbers. */
  core: number;
  /** Two beacon colours. */
  beacons: [number, number];
  /** Nebula clouds: five hex colours. */
  nebula: [string, string, string, string, string];
  /** Top, middle and bottom of the sky gradient. */
  sky: [string, string, string];
}

export const THEMES: readonly ThemeDef[] = [
  { id: 'classic', name: 'Sector sky', cost: 0, core: 0xffb547, beacons: [0x4fe3c1, 0xff6b9a], nebula: ['#6b3fc2', '#c23f8f', '#1f7fa8', '#3f4fc2', '#2a8f9c'], sky: ['#0a0b22', '#12123a', '#0b0d26'] },
  { id: 'aurora', name: 'Aurora', cost: 25, core: 0x6bffd0, beacons: [0x9dff6b, 0x5ce1ff], nebula: ['#1fa87a', '#2ac2b0', '#3f6fc2', '#1f8fa8', '#6bdf8f'], sky: ['#04161a', '#0a2430', '#06121c'] },
  { id: 'ember', name: 'Ember', cost: 25, core: 0xff6b3d, beacons: [0xffd166, 0xff3d5a], nebula: ['#c2402a', '#e07a2a', '#8f1f3f', '#c23f5a', '#a8601f'], sky: ['#1a0806', '#2a0f10', '#160608'] },
  { id: 'royal', name: 'Royal', cost: 40, core: 0xffe08a, beacons: [0xffe08a, 0x8fa8ff], nebula: ['#2a3fc2', '#4a2ac2', '#1f4fa8', '#6b5fd0', '#c2a03f'], sky: ['#060a24', '#0c1440', '#070a20'] },
  { id: 'neon', name: 'Neon', cost: 40, core: 0xff5cf0, beacons: [0x5cf0ff, 0xff5cf0], nebula: ['#c22aa8', '#2ac2e0', '#8f2ae0', '#e02a7a', '#2a7ae0'], sky: ['#12041c', '#1c0830', '#0c0418'] },
  { id: 'void', name: 'Void', cost: 60, core: 0xf2f2ff, beacons: [0xffffff, 0x8f8fa8], nebula: ['#4a4a5a', '#6a6a7a', '#3a3a4a', '#5a5a6a', '#2a2a3a'], sky: ['#020204', '#08080e', '#030306'] },
];

export interface PaintDef {
  id: string;
  name: string;
  cost: number;
  /** Tint for the hull and habitat ring (white = original paint). */
  tint: number;
}

export const PAINTS: readonly PaintDef[] = [
  { id: 'standard', name: 'Standard', cost: 0, tint: 0xffffff },
  { id: 'gold', name: 'Gold Plating', cost: 30, tint: 0xffd88a },
  { id: 'mint', name: 'Mint', cost: 20, tint: 0xb0ffe0 },
  { id: 'rose', name: 'Rose', cost: 20, tint: 0xffb8d0 },
  { id: 'stealth', name: 'Stealth', cost: 35, tint: 0x8088a8 },
];

// ---------- Missions ----------

export type MissionKind = 'taps' | 'machines' | 'upgrades' | 'crates' | 'boosts' | 'meteors' | 'earn';

export interface MissionTemplate {
  kind: MissionKind;
  /** Targets for easy, medium and hard; 'earn' targets are seconds of current income. */
  targets: [number, number, number];
  text: (n: string) => string;
}

export const MISSION_TEMPLATES: readonly MissionTemplate[] = [
  { kind: 'taps', targets: [150, 300, 600], text: (n) => `Tap the station ${n} times` },
  { kind: 'machines', targets: [15, 40, 90], text: (n) => `Build ${n} machines` },
  { kind: 'upgrades', targets: [1, 2, 4], text: (n) => `Install ${n} upgrade${n === '1' ? '' : 's'}` },
  { kind: 'crates', targets: [1, 2, 4], text: (n) => `Grab ${n} salvage crate${n === '1' ? '' : 's'}` },
  { kind: 'boosts', targets: [1, 2, 3], text: (n) => `Fire Overdrive ${n} time${n === '1' ? '' : 's'}` },
  { kind: 'meteors', targets: [8, 16, 30], text: (n) => `Smash ${n} meteors` },
  { kind: 'earn', targets: [600, 1800, 5400], text: (n) => `Salvage ${n} scrap` },
];

export const MISSION_REWARDS: [number, number, number] = [5, 10, 15];
export const WEEKLY_REWARD = 60;
/** Weekly challenge targets are the hard daily target times this. */
export const WEEKLY_SCALE = 8;

// ---------- Events ----------

export type EventKind = 'meteors' | 'flare' | 'convoy';

export const EVENTS: Record<EventKind, { name: string; desc: string; seconds: number }> = {
  meteors: { name: 'Meteor shower', desc: 'Tap the meteors for scrap!', seconds: 30 },
  flare: { name: 'Solar flare', desc: 'Taps are supercharged!', seconds: 20 },
  convoy: { name: 'Trade convoy', desc: 'Tap the convoy ship for crystals!', seconds: 25 },
};

/** Seconds between events, before research. */
export const EVENT_GAP: [number, number] = [6 * MIN, 11 * MIN];
export const FIRST_EVENT_SEC = 3 * MIN;
export const FLARE_TAP_MULT = 5;
/** A meteor is worth this many seconds of income (or 5 taps, whichever is more). */
export const METEOR_INCOME_SEC = 8;
export const CONVOY_CRYSTALS = 3;
export const ACHIEVEMENT_CRYSTALS = 3;

/** The first-time tutorial, in order. The save stores the step's id, so steps can be added later. */
export const TUTORIAL = ['welcome', 'tap', 'drone', 'more', 'upgradeTab', 'upgrade', 'boost', 'crate', 'missions', 'panel', 'done'] as const;
export type TutorialStep = (typeof TUTORIAL)[number];
/** Taps asked for in the first tutorial step. */
export const TUTORIAL_TAPS = 8;
/** Drones asked for in the "build a few more" step. */
export const TUTORIAL_DRONES = 5;

// ---------- Daily login streak ----------

export type StreakReward = { kind: 'crystals'; amount: number } | { kind: 'scrap'; minutes: number } | { kind: 'pet'; crystals: number };

/** One week of rewards; the track loops, and the streak count keeps climbing. */
export const STREAK_REWARDS: readonly StreakReward[] = [
  { kind: 'crystals', amount: 5 },
  { kind: 'scrap', minutes: 10 },
  { kind: 'crystals', amount: 10 },
  { kind: 'scrap', minutes: 30 },
  { kind: 'crystals', amount: 15 },
  { kind: 'scrap', minutes: 60 },
  // Day 7: a free pet while any are left to adopt, otherwise a pile of crystals.
  { kind: 'pet', crystals: 40 },
];

// ---------- Pets ----------

export type PetId = 'cat' | 'pup' | 'owl' | 'blob';

export interface PetDef {
  id: PetId;
  name: string;
  desc: string;
  cost: number;
  color: number;
}

/** One pet follows the station at a time; each helps in its own way. */
export const PETS: readonly PetDef[] = [
  { id: 'cat', name: 'Nebula Cat', desc: 'Pounces on the station every 4 seconds for a free tap.', cost: 15, color: 0xc58cff },
  { id: 'pup', name: 'Orbit Pup', desc: 'Sniffs out salvage: crates turn up 50% more often and are worth 2x.', cost: 40, color: 0xffb547 },
  { id: 'owl', name: 'Star Owl', desc: 'Keeps watch while you are away: offline earnings +50%.', cost: 60, color: 0x5cd6ff },
  { id: 'blob', name: 'Goo Blob', desc: 'Loves chewing wrecks: +50% damage to boss wrecks.', cost: 90, color: 0x9dff6b },
];
export const CAT_TAP_SEC = 4;

// ---------- Boss wrecks ----------

export const BOSS_NAMES = ['Derelict Freighter', 'Shattered Cruiser', 'Ghost Dreadnought', 'Hollow Ark'] as const;
export const BOSS = {
  /** Seconds of play before the first wreck shows up. */
  firstSec: 12 * 60,
  /** Minutes between wrecks. */
  gap: [25, 40] as [number, number],
  /** Seconds to break it before it flies off. */
  seconds: 60,
  /** Health, as taps-worth plus seconds-of-income-worth at the moment it arrives. */
  hpTaps: 110,
  hpIncomeSec: 25,
  /** Machines chip away this share of income as damage every second. */
  machineShare: 0.25,
  /** Each wreck beaten makes the next one this much tougher. */
  growth: 1.12,
  /** Payout, fixed when it arrives: this many seconds of scrap per second (or taps' worth if more), plus crystals. */
  rewardIncomeSec: 300,
  rewardTaps: 300,
  crystals: 10,
};

// ---------- Sectors ----------

export interface SectorDef {
  name: string;
  sky: [string, string, string];
  nebula: [string, string, string, string, string];
  /** The gas giant's bands, top to bottom, and its glow. */
  planet: [string, string, string, string];
  atmosphere: string;
}

/**
 * Each relocation lands in a new sector with its own sky and planet, cycling after the last.
 * A bought sky theme overrides the sector's sky; the planet always belongs to the sector.
 */
export const SECTORS: readonly SectorDef[] = [
  { name: 'Scrapyard Belt', sky: ['#0a0b22', '#12123a', '#0b0d26'], nebula: ['#6b3fc2', '#c23f8f', '#1f7fa8', '#3f4fc2', '#2a8f9c'], planet: ['#e8a37a', '#b0627a', '#6a3d8a', '#3d2a6a'], atmosphere: '#ffaa78' },
  { name: 'Ember Reach', sky: ['#1a0806', '#2a0f12', '#140608'], nebula: ['#c2402a', '#e07a2a', '#8f1f3f', '#c23f5a', '#a8601f'], planet: ['#d8f4ff', '#7ac8f0', '#3a7ac0', '#1f3a7a'], atmosphere: '#9fe0ff' },
  { name: 'Verdant Drift', sky: ['#04161a', '#0a2430', '#06121c'], nebula: ['#1fa87a', '#2ac2b0', '#3f6fc2', '#1f8fa8', '#6bdf8f'], planet: ['#f0c8ff', '#b07ae0', '#6a3fa8', '#3a1f6a'], atmosphere: '#d6a8ff' },
  { name: 'Glass Sea', sky: ['#020a20', '#06183a', '#030c22'], nebula: ['#1f5fc2', '#2ab0e0', '#3f3fc2', '#1f8fd0', '#6bc0ff'], planet: ['#fff0b0', '#f0c050', '#c07a2a', '#6a3a1a'], atmosphere: '#ffd88a' },
  { name: 'Rose Nebula', sky: ['#18041a', '#2a0a2c', '#120416'], nebula: ['#e02a8f', '#ff6bb0', '#8f2ac2', '#c23f8f', '#ff8fa8'], planet: ['#c8fff0', '#5ce0b0', '#1f9a7a', '#0f4a4a'], atmosphere: '#8fffd8' },
  { name: 'Hollow Expanse', sky: ['#030306', '#0a0a14', '#040408'], nebula: ['#4a4a6a', '#6a5a8a', '#3a3a5a', '#5a5a7a', '#2a2a4a'], planet: ['#f4f4ff', '#b8b8d0', '#70708a', '#3a3a4a'], atmosphere: '#e0e0ff' },
];

export function sectorFor(relocations: number): SectorDef {
  return SECTORS[relocations % SECTORS.length];
}
