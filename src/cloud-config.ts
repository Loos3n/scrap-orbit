import type { FirebaseOptions } from 'firebase/app';

/**
 * The Firebase project that holds cloud saves (see src/cloud.ts and firestore.rules).
 * These values are not secret: they only name the project, and the security rules decide who
 * may read what. Cloud save stays hidden until this is filled in.
 */
export const FIREBASE_CONFIG: FirebaseOptions | null = null;
