import type { FirebaseOptions } from 'firebase/app';

/**
 * The Firebase project that holds cloud saves (see src/cloud.ts and firestore.rules).
 * These values are not secret: they only name the project, and the security rules decide who
 * may read what. Cloud save stays hidden while this is null.
 */
export const FIREBASE_CONFIG: FirebaseOptions | null = {
  apiKey: 'AIzaSyCiRpoSH_y7xYE8Qm9JpAvBv5NgiFhCOnY',
  authDomain: 'scrap-orbit.firebaseapp.com',
  projectId: 'scrap-orbit',
  storageBucket: 'scrap-orbit.firebasestorage.app',
  messagingSenderId: '360096936500',
  appId: '1:360096936500:web:ac00f453aff300a4399061',
};
