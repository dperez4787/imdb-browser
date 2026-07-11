/**
 * The single place that knows Firebase Auth exists (CLAUDE.md: "Firebase Auth
 * lives behind one module (auth.js) and one AuthGate component"). Everything
 * else — AuthContext, AuthGate, and later the GraphQL client (IMDB-4) — depends
 * on these four small functions, never on the Firebase SDK directly.
 *
 * Google is the ONLY sign-in path: no email/password, no anonymous. Those
 * providers are absent from the code by design (project brief, Authentication).
 */
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';

import { firebaseConfig } from './firebase.js';

// Lazily create the Firebase app + Auth instance. Kept out of module scope so
// importing this file has no side effects — the SDK only touches persistence or
// the network once an auth operation actually runs. Reuses an already-created
// app to survive Vite HMR and test re-imports.
let cachedAuth;
function auth() {
  if (!cachedAuth) {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}

/**
 * Subscribe to sign-in/sign-out transitions. Returns Firebase's unsubscribe
 * function so a React effect can clean up. The listener fires with the current
 * user (or null) once persisted auth state resolves, then on every change —
 * that first callback is what ends the AuthGate's resolving "curtain" state.
 */
export function subscribeToAuth(listener) {
  return onAuthStateChanged(auth(), listener);
}

/** Google sign-in via popup — the only sign-in the app offers. */
export async function signInWithGoogle() {
  return signInWithPopup(auth(), new GoogleAuthProvider());
}

export async function signOutUser() {
  return signOut(auth());
}

/**
 * The current user's Firebase ID token, or null when nobody is signed in.
 * IMDB-4's GraphQL client calls this to attach `Authorization: Bearer <token>`
 * on every router request (docs/architecture.md). getIdToken() returns a fresh
 * token, refreshing it automatically when near expiry.
 */
export async function getIdToken() {
  const user = auth().currentUser;
  return user ? user.getIdToken() : null;
}
