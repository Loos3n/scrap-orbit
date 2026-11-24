import type { GameState } from './state';

/*
 * Stardrifter: a cosmic whale the captain raises. A warm egg turns up in a salvage crate once a
 * new captain has played a while; it hatches an hour later (sooner if warmed), and the hatchling
 * grows over real days on meals of scrap and on treats the crew save for it (a fresh catch, a
 * harvest, a broken wreck). It gets hungry again every couple of hours, and its mood follows how
 * well it is fed and petted. Each stage sings a memory, and the memories slowly reveal that the
 * scrap field is the shell of its long-dead elder. Fully grown, it tows the station to the Nursery.
 *
 * What it gives: a share more income (bigger as it grows, scaled by mood), and from the calf
 * stage on it now and then gulps a passing wreck, which pays minutes of income.
 *
 * This file only reads and changes state.whale; Game wraps the actions with events.
 */

export type WhaleStageId = 'hatchling' | 'calf' | 'juvenile' | 'adult' | 'elder';

export interface WhaleStage {
  id: WhaleStageId;
  name: string;
  /** Growth needed to reach this stage. */
  at: number;
  /** Extra income at full mood (0.1 = +10%). */
  income: number;
  /** Minutes of income a gulped wreck pays (0: too small to gulp). */
  gulp: number;
  /** How big it is drawn, as a share of a fully grown elder. */
  size: number;
}

export const WHALE_STAGES: readonly WhaleStage[] = [
  { id: 'hatchling', name: 'Hatchling', at: 0, income: 0.05, gulp: 0, size: 0.16 },
  { id: 'calf', name: 'Calf', at: 40, income: 0.1, gulp: 2, size: 0.3 },
  { id: 'juvenile', name: 'Juvenile', at: 120, income: 0.2, gulp: 3, size: 0.5 },
  { id: 'adult', name: 'Adult', at: 260, income: 0.35, gulp: 5, size: 0.75 },
  { id: 'elder', name: 'Elder', at: 420, income: 0.5, gulp: 8, size: 1 },
];

export const WHALE = {
  /** The egg turns up in the first crate opened after this much play (and the tutorial). */
  eggAfterPlaySec: 20 * 60,
  /** The egg hatches this long after it is found... */
  hatchMinutes: 60,
  /** ...less this much for each time it is warmed, up to `warmMax` times. */
  warmMinutes: 5,
  warmMax: 6,
  /** Meals it can eat in a row, and how often it gets hungry for another. */
  mealsMax: 3,
  mealEveryMin: 120,
  /** Growth from a meal and from a treat. */
  mealGrowth: 10,
  treatGrowth: 4,
  /** Treats it can get in a day (so the crew can't feed it all day long). */
  treatsPerDay: 8,
  /** A meal costs this many minutes of income in scrap. */
  mealMinutes: 10,
  /** Mood, 0 to 100: rises while it has had enough to eat, falls while it is starving. */
  moodStart: 70,
  moodFloor: 20,
  moodUpPerHour: 4,
  moodDownPerHour: 6,
  moodPerMeal: 8,
  moodPerPet: 2,
  /** Seconds between pets that count. */
  petCooldownSec: 20,
  /** Minutes between gulps, low and high. */
  gulpMin: 18,
  gulpMax: 32,
  /** Income for good once it has towed the station to the Nursery. */
  nurseryIncome: 0.5,
};

export type WhaleSongId = 'first' | 'field' | 'plates' | 'elder' | 'home' | 'nursery';

export interface WhaleSong {
  id: WhaleSongId;
  title: string;
  /** The stage that sings it (the last one comes from arriving at the Nursery). */
  stage: WhaleStageId | 'nursery';
  lines: string[];
}

/** One memory per stage. Together they tell what the scrap field really is. */
export const WHALE_SONGS: readonly WhaleSong[] = [
  {
    id: 'first',
    title: 'The first song',
    stage: 'hatchling',
    lines: [
      'A tiny wobbling note, like a kettle learning to sing.',
      'It bumps its nose against the reactor glass and settles there, humming. It thinks the station is its mother.',
      'Mika: "Well. That is ours now, I suppose. Somebody find out what it eats."',
    ],
  },
  {
    id: 'field',
    title: 'Song of the field',
    stage: 'calf',
    lines: [
      'The calf sings out across the wreck field, long and low.',
      'Out among the drifting scrap, something hums back. Faint. Every rock, every plate, the same note.',
      'Mika checks the scanners twice. "That is not an echo. Echoes don’t answer."',
    ],
  },
  {
    id: 'plates',
    title: 'Song of the plates',
    stage: 'juvenile',
    lines: [
      'It found a curved grey plate we salvaged weeks ago, and it will not leave it alone. It circles it, singing softly.',
      'Mika runs a scan. Not hull metal. Not rock. It is layered like a seashell, and very, very old.',
      'The plates we have been melting down all this time. Every one of them is the same stuff.',
    ],
  },
  {
    id: 'elder',
    title: 'Song of the elder',
    stage: 'adult',
    lines: [
      'Tonight it sang and the whole field lit up, rock by rock, in one long curve that went past the edge of the sky.',
      'From up here you can see the shape of it. A ribcage of drifting plates, a skull the size of a moon. The scrap field is a shell.',
      'An elder of its kind died here long ago, and broke apart, and we built a station in the middle of her. The Hollow Fleet’s old charts just called it "the Reef".',
      'It isn’t sad. It sounds like it is saying thank you.',
    ],
  },
  {
    id: 'home',
    title: 'Song of going home',
    stage: 'elder',
    lines: [
      'It is bigger than the station now. When it passes the reactor the whole deck goes blue.',
      'It sings one note, over and over, always pointing the same way: past the edge of every map we have.',
      'Then it nudges the station’s old tow-hook with its nose. Gently. Asking.',
    ],
  },
  {
    id: 'nursery',
    title: 'The Nursery',
    stage: 'nursery',
    lines: [
      'We followed it for a night and a day, through dark nobody has charted.',
      'And then: light. A nebula full of eggs, warm as lanterns, and whales of every size drifting between them, singing.',
      'This is where the elders come to rest, and where the new ones start. It brought us home with it.',
      'We’re staying. Its family hums around the station now, and the scrap out here is rich and strange.',
    ],
  },
];

/** Names a new hatchling can be given, picked by the egg. The captain can rename it. */
const NAMES = ['Bubbles', 'Nimbus', 'Pip', 'Tidewell', 'Moonbean', 'Biscuit', 'Lumen', 'Orbit', 'Wobble', 'Nova'];

export interface WhaleState {
  /** none: not found yet; egg: in the cargo bay; born: hatched. */
  phase: 'none' | 'egg' | 'born';
  /** When the egg was found (epoch ms). */
  eggAt: number;
  warmed: number;
  name: string;
  growth: number;
  mood: number;
  /** Meals it is hungry for now (0 to mealsMax), and the moment the next one is counted from. */
  hunger: number;
  hungerAt: number;
  /** When mood and hunger were last brought up to date. */
  at: number;
  petAt: number;
  /** When it next gulps a wreck. */
  gulpAt: number;
  /** Songs heard so far, in order (the count of WHALE_SONGS heard). */
  songs: number;
  meals: number;
  treats: number;
  /** Treats given on `treatDay` (a local date), for the daily cap. */
  treatDay: string;
  treatsToday: number;
  /** It has towed the station to the Nursery. */
  nursery: boolean;
}

export function newWhale(): WhaleState {
  return { phase: 'none', eggAt: 0, warmed: 0, name: '', growth: 0, mood: WHALE.moodStart, hunger: 0, hungerAt: 0, at: 0, petAt: 0, gulpAt: 0, songs: 0, meals: 0, treats: 0, treatDay: '', treatsToday: 0, nursery: false };
}

export const whaleBorn = (s: GameState) => s.whale.phase === 'born';

export function stageIndex(growth: number): number {
  let i = 0;
  while (i + 1 < WHALE_STAGES.length && growth >= WHALE_STAGES[i + 1].at) i++;
  return i;
}

export const whaleStage = (s: GameState): WhaleStage => WHALE_STAGES[stageIndex(s.whale.growth)];

/** Progress to the next stage, 0 to 1 (1 once fully grown). */
export function stageProgress(s: GameState): number {
  const i = stageIndex(s.whale.growth);
  const next = WHALE_STAGES[i + 1];
  if (!next) return 1;
  const from = WHALE_STAGES[i].at;
  return Math.max(0, Math.min(1, (s.whale.growth - from) / (next.at - from)));
}

/** Whether the next crate should hold the egg. */
export const eggDue = (s: GameState) => s.whale.phase === 'none' && s.tutorial < 0 && s.stats.playSec >= WHALE.eggAfterPlaySec;

/** Puts the egg in the cargo bay. */
export function findEgg(s: GameState, now: number, roll = Math.random()): void {
  const w = s.whale;
  w.phase = 'egg';
  w.eggAt = now;
  w.warmed = 0;
  w.name = NAMES[Math.floor(roll * NAMES.length) % NAMES.length];
}

export function hatchAt(s: GameState): number {
  return s.whale.eggAt + (WHALE.hatchMinutes - s.whale.warmed * WHALE.warmMinutes) * 60_000;
}

/** Warms the egg a little (takes minutes off the wait). */
export function warmEgg(s: GameState): boolean {
  if (s.whale.phase !== 'egg' || s.whale.warmed >= WHALE.warmMax) return false;
  s.whale.warmed++;
  return true;
}

/** Hatches the egg once its time has come. */
export function hatchIfReady(s: GameState, now: number): boolean {
  const w = s.whale;
  if (w.phase !== 'egg' || now < hatchAt(s)) return false;
  w.phase = 'born';
  w.growth = 0;
  w.mood = WHALE.moodStart;
  // Born hungry for one meal, so feeding it is the first thing to do.
  w.hunger = 1;
  w.hungerAt = now;
  w.at = now;
  w.gulpAt = now + WHALE.gulpMin * 60_000;
  w.songs = 0;
  return true;
}

/**
 * Brings hunger and mood up to `now`: a hunger slot comes back every mealEveryMin up to mealsMax,
 * mood rises while it has eaten recently and falls for the time it has spent starving (all
 * slots hungry), including time the game was closed.
 */
export function settleWhale(s: GameState, now: number): void {
  const w = s.whale;
  if (w.phase !== 'born' || now <= w.at) return;
  const every = WHALE.mealEveryMin * 60_000;
  const from = w.at;
  let starvingFrom = Infinity;
  if (w.hunger >= WHALE.mealsMax) {
    starvingFrom = from;
    w.hungerAt = now;
  } else {
    const gained = Math.floor((now - w.hungerAt) / every);
    if (w.hunger + gained >= WHALE.mealsMax) {
      starvingFrom = Math.max(from, w.hungerAt + (WHALE.mealsMax - w.hunger) * every);
      w.hunger = WHALE.mealsMax;
      w.hungerAt = now;
    } else {
      w.hunger += gained;
      w.hungerAt += gained * every;
    }
  }
  const starving = Math.max(0, now - starvingFrom) / 3_600_000;
  const fed = Math.max(0, now - from) / 3_600_000 - starving;
  w.mood = clampMood(w.mood + fed * WHALE.moodUpPerHour - starving * WHALE.moodDownPerHour);
  w.at = now;
}

const clampMood = (m: number) => Math.max(WHALE.moodFloor, Math.min(100, m));

/** Seconds until it is hungry for another meal (0 when it already is, or can't eat more). */
export function nextMealSeconds(s: GameState, now: number): number {
  const w = s.whale;
  if (w.hunger >= WHALE.mealsMax) return 0;
  return Math.max(0, (w.hungerAt + WHALE.mealEveryMin * 60_000 - now) / 1000);
}

export type MoodWord = 'Overjoyed' | 'Happy' | 'Content' | 'Peckish' | 'Sulking';

export function moodWord(s: GameState): MoodWord {
  const m = s.whale.mood;
  if (s.whale.hunger >= WHALE.mealsMax && m < 60) return 'Sulking';
  if (m >= 90) return 'Overjoyed';
  if (m >= 70) return 'Happy';
  if (m >= 45) return 'Content';
  return s.whale.hunger > 0 ? 'Peckish' : 'Content';
}

/** How much of its full bonus the whale gives at its current mood (0.6 to 1). */
export const moodFactor = (s: GameState) => 0.6 + (0.4 * s.whale.mood) / 100;

/** The income multiplier from the whale (and the Nursery), for economy.globalMult. */
export function whaleMult(s: GameState): number {
  if (s.whale.phase !== 'born') return 1;
  return (1 + whaleStage(s).income * moodFactor(s)) * (s.whale.nursery ? 1 + WHALE.nurseryIncome : 1);
}

/** Growth added, and whether it reached a new stage. */
export interface Grew {
  growth: number;
  stage: WhaleStage | null;
}

function grow(s: GameState, n: number): Grew {
  const before = stageIndex(s.whale.growth);
  s.whale.growth += n;
  const after = stageIndex(s.whale.growth);
  return { growth: n, stage: after > before ? WHALE_STAGES[after] : null };
}

/** Feeds it a meal (the caller pays `mealMinutes` of income). Null if it isn't hungry. */
export function feedWhale(s: GameState, now: number): Grew | null {
  settleWhale(s, now);
  const w = s.whale;
  if (w.phase !== 'born' || w.hunger <= 0) return null;
  // Eating from a full set of hunger slots restarts the clock for the next one.
  if (w.hunger >= WHALE.mealsMax) w.hungerAt = now;
  w.hunger--;
  w.meals++;
  w.mood = clampMood(w.mood + WHALE.moodPerMeal);
  return grow(s, WHALE.mealGrowth);
}

const dayOf = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** A treat from the crew (a catch, a harvest, a wreck); null once today's treats are used up. */
export function treatWhale(s: GameState, now: number): Grew | null {
  const w = s.whale;
  if (w.phase !== 'born') return null;
  const day = dayOf(now);
  if (w.treatDay !== day) {
    w.treatDay = day;
    w.treatsToday = 0;
  }
  if (w.treatsToday >= WHALE.treatsPerDay) return null;
  w.treatsToday++;
  w.treats++;
  return grow(s, WHALE.treatGrowth);
}

/** A pet (a tap on it): lifts its mood a little, at most once every few seconds. */
export function petWhale(s: GameState, now: number): boolean {
  const w = s.whale;
  if (w.phase !== 'born' || now - w.petAt < WHALE.petCooldownSec * 1000) return false;
  w.petAt = now;
  w.mood = clampMood(w.mood + WHALE.moodPerPet);
  return true;
}

/** Minutes of income the next gulp pays, if it is time for one (and it is big enough). */
export function gulpDue(s: GameState, now: number): number {
  const w = s.whale;
  if (w.phase !== 'born' || now < w.gulpAt) return 0;
  return whaleStage(s).gulp;
}

/** Sets the next gulp after one happened (or was too small to happen). */
export function scheduleGulp(s: GameState, now: number, roll = Math.random()): void {
  s.whale.gulpAt = now + (WHALE.gulpMin + roll * (WHALE.gulpMax - WHALE.gulpMin)) * 60_000;
}

/** The song it has to sing next, if its stage has reached it (the Nursery's waits for the tow). */
export function pendingSong(s: GameState): WhaleSong | null {
  const w = s.whale;
  if (w.phase !== 'born') return null;
  const next = WHALE_SONGS[w.songs];
  if (!next) return null;
  if (next.stage === 'nursery') return w.nursery ? next : null;
  return stageIndex(w.growth) >= WHALE_STAGES.findIndex((x) => x.id === next.stage) ? next : null;
}

export function hearSong(s: GameState, id: WhaleSongId): boolean {
  const next = pendingSong(s);
  if (!next || next.id !== id) return false;
  s.whale.songs++;
  return true;
}

/** It can tow the station to the Nursery once it is an elder and has sung about going home. */
export const canTow = (s: GameState) => s.whale.phase === 'born' && !s.whale.nursery && whaleStage(s).id === 'elder' && s.whale.songs >= WHALE_SONGS.findIndex((x) => x.id === 'home') + 1;

export function towToNursery(s: GameState): boolean {
  if (!canTow(s)) return false;
  s.whale.nursery = true;
  return true;
}

/** A name the captain typed, tidied: letters, numbers, spaces and a little punctuation, 14 at most. */
export function cleanWhaleName(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N} '\-.]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 14);
}

/** Reads a saved whale, keeping only sane values. */
export function readWhale(raw: unknown, now: number): WhaleState {
  const w = newWhale();
  if (!raw || typeof raw !== 'object') return w;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, now) : 0);
  w.phase = r.phase === 'egg' || r.phase === 'born' ? r.phase : 'none';
  w.eggAt = time(r.eggAt) || (w.phase === 'egg' ? now : 0);
  w.warmed = Math.floor(num(r.warmed, 0, WHALE.warmMax));
  w.name = typeof r.name === 'string' ? cleanWhaleName(r.name) : '';
  if (w.phase !== 'none' && !w.name) w.name = NAMES[0];
  w.growth = num(r.growth, 0, 1e6);
  w.mood = num(r.mood, WHALE.moodFloor, 100, WHALE.moodStart);
  w.hunger = Math.floor(num(r.hunger, 0, WHALE.mealsMax));
  w.hungerAt = time(r.hungerAt) || now;
  w.at = time(r.at) || now;
  w.petAt = time(r.petAt);
  // A gulp time may be in the future; keep it, but never more than the longest wait away.
  w.gulpAt = typeof r.gulpAt === 'number' && Number.isFinite(r.gulpAt) ? Math.min(r.gulpAt, now + WHALE.gulpMax * 60_000) : now;
  w.songs = Math.floor(num(r.songs, 0, WHALE_SONGS.length));
  w.meals = Math.floor(num(r.meals, 0, 1e9));
  w.treats = Math.floor(num(r.treats, 0, 1e9));
  w.treatDay = typeof r.treatDay === 'string' ? r.treatDay.slice(0, 12) : '';
  w.treatsToday = Math.floor(num(r.treatsToday, 0, WHALE.treatsPerDay));
  w.nursery = r.nursery === true && w.phase === 'born';
  return w;
}
