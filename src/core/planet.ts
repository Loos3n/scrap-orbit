import type { GameState } from './state';
import type { Bonuses } from './expansion';

/*
 * The living planet. Below the scrap field hangs a dead world: grey dust and old craters. Once a
 * captain has played a while, the scanners pick it up, and the station can start sending salvage
 * pods down to bring it back to life, one project at a time, over real days and weeks.
 *
 * Each era has three projects. A project needs a number of pods (most cost minutes of income in
 * scrap, a few cost crystals); once the last pod lands it takes real time to take hold, and only
 * then does the next project open. Three projects done moves the planet to its next era, which
 * changes how it looks from the station (ice, then seas, then green, then life, then town lights)
 * and tells a little story. At the seas the captain picks what grows first, which sets the
 * planet's colours and a bonus for good.
 *
 * What it gives: a little more income for every project done, the chosen path's bonus, and once it
 * is thriving, trade shuttles that rise from its spaceport now and then carrying minutes of scrap.
 *
 * This file only reads and changes state.planet; Game wraps the actions with events.
 */

export type PlanetPath = 'coral' | 'forest' | 'crystal';

export interface PlanetPathDef {
  id: PlanetPath;
  name: string;
  /** What the choice card says. */
  blurb: string;
  /** What it gives, in words. */
  gives: string;
  bonus: Partial<Bonuses>;
  color: string;
}

export const PLANET_PATHS: readonly PlanetPathDef[] = [
  { id: 'coral', name: 'Coral seas', blurb: 'Warm shallow seas, reefs in every colour, islands strung like beads.', gives: '+50% offline earnings: the tides keep working while you sleep', bonus: { offline: 0.5 }, color: '#4fd8d0' },
  { id: 'forest', name: 'Great forests', blurb: 'Deep green continents, rivers, mist, and trees taller than the station.', gives: '+50% tap power: fresh air does the crew good', bonus: { tap: 0.5 }, color: '#7be37a' },
  { id: 'crystal', name: 'Crystal dunes', blurb: 'Violet deserts of singing glass that ring when the wind blows.', gives: '+40% damage to boss wrecks and golden scrap 25% more often', bonus: { boss: 0.4, golden: 0.25 }, color: '#c69cff' },
];

export interface PlanetProject {
  id: string;
  /** A name, or one per path (only for eras after the path is chosen). */
  name: string | Record<PlanetPath, string>;
  desc: string | Record<PlanetPath, string>;
  /** Pods it needs. */
  loads: number;
  /** Each pod costs this many crystals instead of scrap. */
  crystals?: number;
}

export interface PlanetEra {
  id: string;
  name: string;
  /** One line on what the planet looks like now. */
  look: string;
  /** Projects that lead out of this era (none for the last). */
  projects: PlanetProject[];
  /** Minutes of income each scrap pod costs in this era. */
  podMinutes: number;
  /** Minutes a finished project takes to take hold. */
  settleMinutes: number;
  /** The story told on reaching it. */
  story: { title: string; lines: string[] };
}

export const PLANET_ERAS: readonly PlanetEra[] = [
  {
    id: 'dead',
    name: 'Dead world',
    look: 'Grey dust and old craters. Nothing has moved here in a million years.',
    podMinutes: 4,
    settleMinutes: 15,
    projects: [
      { id: 'core', name: 'Wake the core', desc: 'Drop reactor slag down the old volcano vents to warm the planet from the inside.', loads: 3 },
      { id: 'comet', name: 'Steer an ice comet', desc: 'Nudge a passing comet into the planet. Water, at last.', loads: 3 },
      { id: 'shield', name: 'Raise a magnetic shield', desc: 'Ring the poles with scrap coils, so the sun stops scouring the air away.', loads: 4 },
    ],
    story: {
      title: 'Something below',
      lines: [
        'Mika taps the long-range scanner. "Huh. There is a whole planet under the scrap field. We have been parked on top of it this whole time."',
        'It is grey and silent, pocked with craters. No air, no water, no life. Just dust.',
        '"It wasn’t always like this," Mika says, reading the old charts. "There were seas once. Do you think we could... I mean, we have a lot of scrap."',
      ],
    },
  },
  {
    id: 'thaw',
    name: 'The Thaw',
    look: 'Ice at the poles, glowing vents, and the first thin haze of air.',
    podMinutes: 6,
    settleMinutes: 30,
    projects: [
      { id: 'sky', name: 'Seed the sky', desc: 'Air makers, built from old scrubbers. They breathe out what the planet lost.', loads: 3, crystals: 3 },
      { id: 'rain', name: 'The first rain', desc: 'Cloud seeders over the warm vents. It has not rained here in an age.', loads: 4 },
      { id: 'basins', name: 'Fill the basins', desc: 'Melt the polar ice and let it run down into the old sea beds.', loads: 4 },
    ],
    story: {
      title: 'The thaw',
      lines: [
        'The core is warm again. Red light seeps up through cracks in the crust, and the comet’s ice is spreading at the poles.',
        'There is air now. Thin, cold, not much. But Mika swears the scanner picked up wind.',
      ],
    },
  },
  {
    id: 'oceans',
    name: 'Oceans',
    look: 'Blue seas and bare brown land under drifting cloud.',
    podMinutes: 8,
    settleMinutes: 60,
    projects: [
      { id: 'algae', name: 'Algae blooms', desc: 'Tiny green life for the seas, grown in the station’s tanks.', loads: 4 },
      { id: 'tides', name: 'Tide engines', desc: 'Big slow pumps that stir the seas so nothing goes stale.', loads: 4 },
      {
        id: 'first',
        name: { coral: 'Plant the reefs', forest: 'Moss carpets', crystal: 'Seed the glass' },
        desc: { coral: 'Coral starts, grown on old hull plates and sunk in the warm shallows.', forest: 'A soft green coat for the bare land, so roots have somewhere to grow.', crystal: 'Crystal seeds scattered across the dry plains, to grow in the wind.' },
        loads: 5,
      },
    ],
    story: {
      title: 'Oceans',
      lines: [
        'It rained for eleven days straight. Now the old sea beds are full, and the planet is blue.',
        'From the station it looks like a marble someone dropped in the dark. The crew keep finding excuses to go to the windows.',
        'Mika: "Okay. Big question. What do we grow first?"',
      ],
    },
  },
  {
    id: 'bloom',
    name: 'The Bloom',
    look: 'Colour spreading across every continent.',
    podMinutes: 10,
    settleMinutes: 120,
    projects: [
      { id: 'pollen', name: 'Pollinators', desc: 'Little winged helpers from the station garden, to carry seeds where the wind won’t.', loads: 4, crystals: 4 },
      { id: 'rivers', name: 'Rivers', desc: 'Cut channels from the mountains to the sea, so the water keeps moving.', loads: 5 },
      {
        id: 'grow',
        name: { coral: 'Kelp forests', forest: 'The first trees', crystal: 'Crystal groves' },
        desc: { coral: 'Tall swaying kelp in every bay, a forest under the waves.', forest: 'Saplings, by the million. In a hundred years they will touch the clouds.', crystal: 'Spires of glass that hum in chords when the wind blows through.' },
        loads: 5,
      },
    ],
    story: {
      title: 'The bloom',
      lines: [
        'Something is growing down there, and it is spreading faster than anyone thought.',
        'Each morning the planet looks a little different. The crew have started a betting pool on what it will look like tomorrow.',
      ],
    },
  },
  {
    id: 'life',
    name: 'Life',
    look: 'Herds on the plains, flocks over the seas.',
    podMinutes: 12,
    settleMinutes: 240,
    projects: [
      { id: 'herds', name: 'Seed the herds', desc: 'Grazers from the old seed vaults, woken up and set loose.', loads: 5 },
      { id: 'birds', name: 'Songbirds', desc: 'Something to sing in the mornings. The station has been too quiet.', loads: 5 },
      { id: 'giants', name: 'Ocean giants', desc: 'Huge, gentle swimmers for the deep seas. The whales would approve.', loads: 6 },
    ],
    story: {
      title: 'Life',
      lines: [
        'Mika put the planet’s microphone feed on the station speakers this morning. Nobody said anything for a long time.',
        'Wind. Water. And under it, very faintly, something calling to something else.',
        'It is alive. We did that.',
      ],
    },
  },
  {
    id: 'settlers',
    name: 'Settlers',
    look: 'The first lights on the night side.',
    podMinutes: 15,
    settleMinutes: 360,
    projects: [
      { id: 'field', name: 'A landing field', desc: 'Flat ground, beacons and a tower, for the first families who asked to move down.', loads: 4, crystals: 5 },
      { id: 'town', name: 'The first town', desc: 'Houses from salvaged hull, a market, a school, a tavern called The Claw.', loads: 6 },
      { id: 'port', name: 'A spaceport', desc: 'So the planet can send things back up. Trade, visitors, letters home.', loads: 6 },
    ],
    story: {
      title: 'Settlers',
      lines: [
        'Some of the crew’s families asked if they could live down there. Then some of the visitors asked too. Then a lot of people asked.',
        'Tonight, for the first time, there are lights on the night side of the planet.',
      ],
    },
  },
  {
    id: 'thriving',
    name: 'Thriving world',
    look: 'Cities glowing at night and shuttles rising to the station.',
    podMinutes: 15,
    settleMinutes: 0,
    projects: [],
    story: {
      title: 'A thriving world',
      lines: [
        'The spaceport opened this morning. The first shuttle up carried fresh bread, a crate of fruit, and a letter.',
        'It says: "To the station in our sky. Thank you for our world. Come down and visit sometime."',
        'Mika pins it to the wall above the scanner, right where we first saw the planet.',
      ],
    },
  },
];

export const PLANET = {
  /** The scanners pick it up once a new captain has played this long (and finished the tutorial). */
  openAfterPlaySec: 30 * 60,
  /** Extra income for every project done. */
  perProject: 0.03,
  /** Extra income once it is thriving. */
  thrivingIncome: 0.1,
  /** Minutes between trade shuttles, low and high, once it is thriving. */
  shuttleMin: 20,
  shuttleMax: 35,
  /** Minutes of income a trade shuttle brings. */
  shuttleMinutes: 6,
};

const LAST = PLANET_ERAS.length - 1;
/** Index of the era where the path is picked. */
export const PATH_ERA = PLANET_ERAS.findIndex((e) => e.id === 'oceans');
export const PROJECT_COUNT = PLANET_ERAS.reduce((n, e) => n + e.projects.length, 0);

const NAMES = ['Verda', 'Hope', 'Ember', 'Haven', 'Tamsin', 'Marrow', 'Willow', 'Calla'];

export interface PlanetState {
  /** Whether the scanners have found it yet. */
  found: boolean;
  name: string;
  era: number;
  /** Index of the project being worked on in this era. */
  project: number;
  /** Pods landed for that project. */
  loads: number;
  /** When the project, now fully supplied, takes hold (0 while it still needs pods). */
  settleAt: number;
  path: PlanetPath | null;
  /** Era stories heard so far (the first is the discovery). */
  stories: number;
  pods: number;
  /** When the next trade shuttle rises (thriving only). */
  shuttleAt: number;
  shuttles: number;
  /** When the current era was reached. */
  eraAt: number;
}

export function newPlanet(): PlanetState {
  return { found: false, name: '', era: 0, project: 0, loads: 0, settleAt: 0, path: null, stories: 0, pods: 0, shuttleAt: 0, shuttles: 0, eraAt: 0 };
}

export const planetEra = (s: GameState): PlanetEra => PLANET_ERAS[s.planet.era];

/** Projects finished so far, 0 to PROJECT_COUNT. */
export function projectsDone(s: GameState): number {
  let n = 0;
  for (let i = 0; i < s.planet.era; i++) n += PLANET_ERAS[i].projects.length;
  return n + s.planet.project;
}

/** Whether the scanners should pick the planet up now. */
export const planetDue = (s: GameState) => !s.planet.found && s.tutorial < 0 && s.stats.playSec >= PLANET.openAfterPlaySec;

export function findPlanet(s: GameState, now: number, roll = Math.random()): void {
  const p = s.planet;
  p.found = true;
  p.name = NAMES[Math.floor(roll * NAMES.length) % NAMES.length];
  p.eraAt = now;
}

/** The captain has to pick what grows first before the seas' projects can go on. */
export const needsPath = (s: GameState) => s.planet.found && s.planet.era >= PATH_ERA && !s.planet.path;

export function choosePath(s: GameState, path: PlanetPath): boolean {
  if (!s.planet.found || s.planet.era < PATH_ERA || s.planet.path || !PLANET_PATHS.some((x) => x.id === path)) return false;
  s.planet.path = path;
  return true;
}

/** The project being worked on, or null (not found, the end, or waiting on the path). */
export function currentProject(s: GameState): PlanetProject | null {
  if (!s.planet.found || needsPath(s)) return null;
  return planetEra(s).projects[s.planet.project] ?? null;
}

/** A project's name or description, for the chosen path. */
export function pathText(s: GameState, t: string | Record<PlanetPath, string>): string {
  return typeof t === 'string' ? t : t[s.planet.path ?? 'forest'];
}

export type PodCost = { kind: 'scrap'; minutes: number } | { kind: 'crystals'; n: number };

export function podCost(s: GameState): PodCost | null {
  const pr = currentProject(s);
  if (!pr) return null;
  return pr.crystals ? { kind: 'crystals', n: pr.crystals } : { kind: 'scrap', minutes: planetEra(s).podMinutes };
}

/** Whether a pod can go down now (the caller still checks the price). */
export const canSendPod = (s: GameState) => {
  const pr = currentProject(s);
  return !!pr && s.planet.settleAt === 0 && s.planet.loads < pr.loads;
};

/**
 * A pod lands (the caller has paid). Returns 'filled' when it was the project's last pod and the
 * project starts taking hold, 'landed' otherwise, or null if no pod could go.
 */
export function landPod(s: GameState, now: number): 'landed' | 'filled' | null {
  if (!canSendPod(s)) return null;
  const p = s.planet;
  const pr = currentProject(s)!;
  p.loads++;
  p.pods++;
  if (p.loads < pr.loads) return 'landed';
  p.settleAt = now + Math.max(1, planetEra(s).settleMinutes * 60_000);
  return 'filled';
}

/** Seconds left until the supplied project takes hold (0 if none is settling). */
export function settleSeconds(s: GameState, now: number): number {
  return s.planet.settleAt ? Math.max(0, (s.planet.settleAt - now) / 1000) : 0;
}

export interface Settled {
  project: PlanetProject;
  /** The era it moved into, if this project finished one. */
  era: PlanetEra | null;
}

/** Finishes the settling project once its time has come; moves to the next era after the third. */
export function settleIfReady(s: GameState, now: number): Settled | null {
  const p = s.planet;
  if (!p.found || !p.settleAt || now < p.settleAt) return null;
  const project = planetEra(s).projects[p.project];
  p.settleAt = 0;
  p.loads = 0;
  p.project++;
  if (p.project < planetEra(s).projects.length) return { project, era: null };
  p.era = Math.min(LAST, p.era + 1);
  p.project = 0;
  p.eraAt = now;
  if (p.era === LAST) p.shuttleAt = now + PLANET.shuttleMin * 60_000;
  return { project, era: PLANET_ERAS[p.era] };
}

/** The story waiting to be heard, if there is one. */
export function pendingStory(s: GameState): PlanetEra | null {
  const p = s.planet;
  if (!p.found || p.stories > p.era) return null;
  return PLANET_ERAS[p.stories];
}

export function hearStory(s: GameState): boolean {
  if (!pendingStory(s)) return false;
  s.planet.stories++;
  return true;
}

/** The income multiplier from the planet, for economy.globalMult. */
export function planetMult(s: GameState): number {
  if (!s.planet.found) return 1;
  return (1 + projectsDone(s) * PLANET.perProject) * (s.planet.era === LAST ? 1 + PLANET.thrivingIncome : 1);
}

/** The chosen path's bonus, for expansion.bonuses. */
export function planetBonuses(s: GameState): Partial<Bonuses> {
  if (!s.planet.found || !s.planet.path) return {};
  return PLANET_PATHS.find((x) => x.id === s.planet.path)?.bonus ?? {};
}

/** Minutes of income the next trade shuttle brings, if one is due. */
export function shuttleDue(s: GameState, now: number): number {
  const p = s.planet;
  if (!p.found || p.era !== LAST || now < p.shuttleAt) return 0;
  return PLANET.shuttleMinutes;
}

export function scheduleShuttle(s: GameState, now: number, roll = Math.random()): void {
  s.planet.shuttleAt = now + (PLANET.shuttleMin + roll * (PLANET.shuttleMax - PLANET.shuttleMin)) * 60_000;
  s.planet.shuttles++;
}

/** People living down there: none until the settlers come, then it keeps growing. */
export function population(s: GameState, now: number): number {
  const p = s.planet;
  const settlers = PLANET_ERAS.findIndex((e) => e.id === 'settlers');
  if (!p.found || p.era < settlers) return 0;
  if (p.era === settlers) return 40 + p.project * 260 + p.loads * 25;
  const days = Math.max(0, now - p.eraAt) / 86_400_000;
  return Math.floor(1200 + 2400 * Math.log2(1 + days * 2) + p.shuttles * 15);
}

/** A name the captain typed, tidied the same way as the whale's. */
export function cleanPlanetName(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N} '\-.]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 14);
}

/** Reads a saved planet, keeping only sane values. */
export function readPlanet(raw: unknown, now: number): PlanetState {
  const p = newPlanet();
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as Record<string, unknown>;
  const int = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(Math.max(lo, Math.min(hi, v))) : lo);
  p.found = r.found === true;
  if (!p.found) return p;
  p.name = typeof r.name === 'string' ? cleanPlanetName(r.name) : '';
  if (!p.name) p.name = NAMES[0];
  p.era = int(r.era, 0, LAST);
  p.path = PLANET_PATHS.some((x) => x.id === r.path) ? (r.path as PlanetPath) : null;
  const projects = PLANET_ERAS[p.era].projects;
  p.project = int(r.project, 0, Math.max(0, projects.length - 1));
  p.loads = int(r.loads, 0, projects[p.project]?.loads ?? 0);
  // A settle time can be in the future, but never further than this era's wait.
  const settle = typeof r.settleAt === 'number' && Number.isFinite(r.settleAt) && r.settleAt > 0 ? r.settleAt : 0;
  p.settleAt = settle && projects[p.project] && p.loads >= projects[p.project].loads ? Math.min(settle, now + PLANET_ERAS[p.era].settleMinutes * 60_000) : 0;
  if (!p.settleAt && projects[p.project] && p.loads >= projects[p.project].loads) p.settleAt = now;
  p.stories = int(r.stories, 0, p.era + 1);
  p.pods = int(r.pods, 0, 1e9);
  p.shuttles = int(r.shuttles, 0, 1e9);
  p.eraAt = typeof r.eraAt === 'number' && Number.isFinite(r.eraAt) && r.eraAt > 0 ? Math.min(r.eraAt, now) : now;
  p.shuttleAt = p.era === LAST ? (typeof r.shuttleAt === 'number' && Number.isFinite(r.shuttleAt) ? Math.min(r.shuttleAt, now + PLANET.shuttleMax * 60_000) : now) : 0;
  return p;
}
