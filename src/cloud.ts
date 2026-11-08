import { Capacitor } from '@capacitor/core';
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { FIREBASE_CONFIG } from './cloud-config';

/*
 * Cloud save: sign in with Google and the save is kept in Firestore under the player's own
 * account (saves/<uid>; firestore.rules lets only that player read or write it). The save is
 * the same SCRAP1 code as Settings > Back up or move your save, so it loads through importCode.
 * Firebase is loaded only when cloud save is used, so it costs nothing at start-up.
 */

export interface CloudSave {
  code: string;
  /** Epoch ms of the upload. */
  savedAt: number;
  /** All-time scrap as text, to show which save is further along. */
  allTime: string;
  relocations: number;
}

export const cloudAvailable = (): boolean => FIREBASE_CONFIG !== null;

let services: Promise<{ auth: Auth; db: Firestore }> | null = null;

function connect(): Promise<{ auth: Auth; db: Firestore }> {
  services ??= (async () => {
    const [{ initializeApp }, { getAuth }, { getFirestore }] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    const app = initializeApp(FIREBASE_CONFIG!);
    return { auth: getAuth(app), db: getFirestore(app) };
  })();
  return services;
}

/** Calls `fn` now and whenever the player signs in or out. */
export async function watchUser(fn: (user: User | null) => void): Promise<void> {
  if (!cloudAvailable()) return;
  const { auth } = await connect();
  const { onAuthStateChanged } = await import('firebase/auth');
  onAuthStateChanged(auth, fn);
}

/** Google sign-in: the phone's own account picker in the app, a popup in a browser. */
export async function signIn(): Promise<User> {
  const { auth } = await connect();
  const { GoogleAuthProvider, signInWithCredential, signInWithPopup } = await import('firebase/auth');
  if (Capacitor.isNativePlatform()) {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
    const token = result.credential?.idToken;
    if (!token) throw new Error('Google sign-in was cancelled');
    return (await signInWithCredential(auth, GoogleAuthProvider.credential(token))).user;
  }
  return (await signInWithPopup(auth, new GoogleAuthProvider())).user;
}

export async function signOut(): Promise<void> {
  const { auth } = await connect();
  const { signOut: out } = await import('firebase/auth');
  if (Capacitor.isNativePlatform()) {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    await FirebaseAuthentication.signOut().catch(() => undefined);
  }
  await out(auth);
}

async function saveRef() {
  const { auth, db } = await connect();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  const { doc } = await import('firebase/firestore');
  return doc(db, 'saves', uid);
}

export async function upload(save: CloudSave): Promise<void> {
  const { setDoc } = await import('firebase/firestore');
  await setDoc(await saveRef(), save);
}

/** The save in the cloud, or null if this account has none yet. */
export async function download(): Promise<CloudSave | null> {
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(await saveRef());
  if (!snap.exists()) return null;
  const d = snap.data();
  if (typeof d.code !== 'string') return null;
  return { code: d.code, savedAt: Number(d.savedAt) || 0, allTime: String(d.allTime ?? '0'), relocations: Number(d.relocations) || 0 };
}
