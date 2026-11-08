import { GENERATORS } from './config';
import { PETS, sectorFor } from './content';
import { modelName } from './evolve';
import type { GameState } from './state';

/*
 * Friend codes. A signed-in player gets a short code (worked out from their account, so it never
 * changes); sharing it lets friends visit a picture of their station and send one gift a day.
 * This file is the save side: the friends list, gifts sent today and the gift rewards. The
 * cloud side (profiles and gift inboxes in Firestore) is src/friends.ts.
 */

export interface Friend {
  code: string;
  /** The station name they chose, as last seen. */
  name: string;
}

/** Letters and digits that can't be mixed up when read aloud or typed (no 0/O, 1/I/L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;
export const FRIEND_LIMIT = 30;
/** Crystals in each gift a friend sends, and how many gifts can be opened in one day. */
export const GIFT_CRYSTALS = 5;
export const GIFTS_PER_DAY = 5;
/** Sending a gift is nice too: 1 crystal each, for the first few a day. */
export const SEND_CRYSTALS = 1;
export const SEND_REWARDS_PER_DAY = 5;
export const NAME_MAX = 20;

/** A code from the first bytes of a hash of the player's account id. */
export function codeFromBytes(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** "ABCD-EFGH" for showing; codes are stored without the dash. */
export function prettyCode(code: string): string {
  return code.length === CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** Reads a typed or pasted code (any case, dashes and spaces ignored), or null if it isn't one. */
export function normalizeCode(text: string): string | null {
  const clean = text.toUpperCase().replace(/[\s-]+/g, '');
  if (clean.length !== CODE_LENGTH) return null;
  for (const ch of clean) if (!CODE_ALPHABET.includes(ch)) return null;
  return clean;
}

/** A station name: trimmed, single-spaced, no angle brackets, at most NAME_MAX characters. */
export function cleanName(text: string): string {
  return text.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export function defaultName(code: string): string {
  return `Station ${code.slice(0, 4)}`;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** The local calendar day (same as meta.dayKey; kept here so the save code can import this file). */
function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addCrystals(state: GameState, n: number): void {
  state.crystals += n;
  state.stats.crystalsEarned += n;
}

/** Rolls the daily counters over at the player's midnight. */
function today(state: GameState, now: number): string {
  const day = dayKey(now);
  const f = state.friends;
  if (f.day !== day) {
    f.day = day;
    f.opened = 0;
    f.sentRewards = 0;
    for (const code of Object.keys(f.sent)) if (f.sent[code] !== day) delete f.sent[code];
  }
  return day;
}

export function addFriend(state: GameState, code: string, name: string): 'added' | 'known' | 'full' | 'self' {
  const f = state.friends;
  if (code === f.mine) return 'self';
  const known = f.list.find((x) => x.code === code);
  if (known) {
    known.name = name;
    return 'known';
  }
  if (f.list.length >= FRIEND_LIMIT) return 'full';
  f.list.push({ code, name });
  return 'added';
}

export function removeFriend(state: GameState, code: string): void {
  state.friends.list = state.friends.list.filter((x) => x.code !== code);
}

export function giftSentToday(state: GameState, code: string, now: number): boolean {
  return state.friends.sent[code] === today(state, now);
}

/** Records a gift sent; returns the crystals it earned the sender (0 once the day's few are used). */
export function markGiftSent(state: GameState, code: string, now: number): number {
  const day = today(state, now);
  const f = state.friends;
  f.sent[code] = day;
  if (f.sentRewards >= SEND_REWARDS_PER_DAY) return 0;
  f.sentRewards++;
  addCrystals(state, SEND_CRYSTALS);
  return SEND_CRYSTALS;
}

/** How many more gifts can be opened today. */
export function giftsLeftToday(state: GameState, now: number): number {
  today(state, now);
  return Math.max(0, GIFTS_PER_DAY - state.friends.opened);
}

/** Opens up to `count` gifts (as many as today allows); returns how many opened and the crystals. */
export function openGifts(state: GameState, count: number, now: number): { opened: number; crystals: number } {
  const opened = Math.min(count, giftsLeftToday(state, now));
  state.friends.opened += opened;
  const crystals = opened * GIFT_CRYSTALS;
  if (crystals) addCrystals(state, crystals);
  return { opened, crystals };
}

/** What friends see on a visit, besides the picture. All plain values, safe to store in the cloud. */
export interface StationCard {
  allTime: string;
  relocations: number;
  shifts: number;
  sector: string;
  /** The biggest machine they own, by model name ("Fusion Smelter Mk III"), or '' with none. */
  best: string;
  machines: number;
  pet: string;
  achievements: number;
  streak: number;
}

export function stationCard(state: GameState): StationCard {
  const top = [...GENERATORS].reverse().find((g) => state.owned[g.id] > 0);
  const pet = PETS.find((p) => p.id === state.pets.active);
  return {
    allTime: state.allTime.toString(),
    relocations: state.stats.relocations,
    shifts: state.galaxy.shifts,
    sector: sectorFor(state.stats.relocations).name,
    best: top ? modelName(top.id, state.owned[top.id]) : '',
    machines: GENERATORS.reduce((n, g) => n + state.owned[g.id], 0),
    pet: pet?.name ?? '',
    achievements: state.achievements.size,
    streak: state.login.best,
  };
}
