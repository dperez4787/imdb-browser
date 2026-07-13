/**
 * The single place that knows Firebase Auth exists (CLAUDE.md: "Firebase Auth
 * lives behind one module (auth.js) and one AuthGate component"). Everything
 * else — AuthContext, AuthGate, and later the GraphQL client (IMDB-4) — depends
 * on these four small functions, never on the Firebase SDK directly.
 *
 * Two sign-in paths: Google (the full identity, eligible for governance
 * personas) and anonymous guest (user-directed, 2026-07-12 — one-click entry
 * for reviewers; guests have no email, so they can never match a persona and
 * always see the redacted/no-data-role state). No email/password — absent by
 * design (project brief, Authentication).
 */
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
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

/** Google sign-in via popup — the full-identity path. */
export async function signInWithGoogle() {
  return signInWithPopup(auth(), new GoogleAuthProvider());
}

/**
 * Anonymous guest sign-in — no account, no popup. The token it yields is a
 * real Firebase ID token (same issuer/audience), so the router and the chat
 * backend accept it unchanged; governance sees no email → no persona → no
 * roles, which is exactly the reviewer-facing demo state.
 */
export async function signInAsGuest() {
  return signInAnonymously(auth());
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
