import { firebase } from './cloud';
import { codeFromBytes, type StationCard } from './core/friends';

/*
 * The cloud side of friend codes (see core/friends.ts for the rules kept in the save).
 * Firestore holds, for each signed-in player who has opened Friends:
 *   profiles/<code>               their station name, a small picture of the station and a few
 *                                 numbers; any signed-in player can read it, only they can write it.
 *   profiles/<code>/gifts/<from>_<day>   one gift from another player per day; only the
 *                                 owner can read and open (delete) them. firestore.rules has the details.
 */

export interface Profile {
  code: string;
  name: string;
  /** A small JPEG of their station (data URL), or '' if none yet. */
  pic: string;
  card: StationCard | null;
  updatedAt: number;
}

export interface Gift {
  id: string;
  from: string;
  name: string;
}

/** The player's friend code: from a hash of their account id, so it is the same on every device. */
export async function codeForUser(uid: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`scrap-orbit:${uid}`));
  return codeFromBytes(new Uint8Array(hash));
}

async function uidNow(): Promise<string> {
  const { auth } = await firebase();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

export async function publishProfile(p: Omit<Profile, 'updatedAt'>): Promise<void> {
  const uid = await uidNow();
  const { db } = await firebase();
  const { doc, setDoc } = await import('firebase/firestore');
  await setDoc(doc(db, 'profiles', p.code), { uid, name: p.name, pic: p.pic, card: p.card, updatedAt: Date.now() });
}

/** A friend's profile, or null if nobody has that code yet. */
export async function fetchProfile(code: string): Promise<Profile | null> {
  await uidNow();
  const { db } = await firebase();
  const { doc, getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, 'profiles', code));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    code,
    name: typeof d.name === 'string' ? d.name : '',
    pic: typeof d.pic === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d.pic) ? d.pic : '',
    card: readCard(d.card),
    updatedAt: Number(d.updatedAt) || 0,
  };
}

/** Sends today's gift. The rules refuse a second one the same day, which is reported as 'already'. */
export async function sendGift(to: string, from: string, name: string, day: string): Promise<'sent' | 'already'> {
  const uid = await uidNow();
  const { db } = await firebase();
  const { doc, setDoc } = await import('firebase/firestore');
  try {
    await setDoc(doc(db, 'profiles', to, 'gifts', `${from}_${day}`), { fromUid: uid, from, name, day, sentAt: Date.now() });
    return 'sent';
  } catch (e) {
    if ((e as { code?: string }).code === 'permission-denied') return 'already';
    throw e;
  }
}

export async function listGifts(mine: string): Promise<Gift[]> {
  await uidNow();
  const { db } = await firebase();
  const { collection, getDocs, limit, query } = await import('firebase/firestore');
  const snap = await getDocs(query(collection(db, 'profiles', mine, 'gifts'), limit(50)));
  return snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, from: typeof x.from === 'string' ? x.from : '', name: typeof x.name === 'string' ? x.name : '' };
  });
}

/** Removes opened gifts from the inbox. */
export async function removeGifts(mine: string, ids: string[]): Promise<void> {
  const { db } = await firebase();
  const { deleteDoc, doc } = await import('firebase/firestore');
  await Promise.all(ids.map((id) => deleteDoc(doc(db, 'profiles', mine, 'gifts', id))));
}

/** Another player's numbers, checked field by field since anyone could have written them. */
function readCard(c: unknown): StationCard | null {
  if (!c || typeof c !== 'object') return null;
  const x = c as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  const t = (v: unknown, max = 40) => (typeof v === 'string' ? v.slice(0, max) : '');
  const allTime = t(x.allTime, 60);
  return {
    allTime: /^[0-9.e+]+$/i.test(allTime) ? allTime : '0',
    relocations: n(x.relocations),
    shifts: n(x.shifts),
    sector: t(x.sector),
    best: t(x.best),
    machines: n(x.machines),
    pet: t(x.pet),
    achievements: n(x.achievements),
    streak: n(x.streak),
  };
}
