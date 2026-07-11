// Firebase Web App configuration for the "imdb-browser" Web App registered in
// project-d60a83c1-2c60-4d51-ad0 (app id ...:web:f7e58da7556e44f0863d18) — the
// project the cosmo router accepts as its `aud` claim (docs/architecture.md,
// "Router authentication from the browser").
//
// These values are PUBLIC by design and ship in the client bundle (CLAUDE.md,
// Secrets). The apiKey is a Firebase Web API key: it identifies the project to
// Google's auth endpoints and grants no privileges on its own — access control
// is Firebase Auth plus ID-token verification downstream, never the secrecy of
// this string. `storageBucket` and `measurementId` are deliberately omitted:
// the app uses neither, and measurementId would pull in Analytics for nothing.
//
// Each value can be overridden with a VITE_-prefixed env var (to point at a
// different Firebase project without a code change), but the committed
// defaults make the app work out of the box.
export const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ??
    'AIzaSyCS45zSWu-tNrTN4FOrH5jIgo9z_8mfy8g',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ??
    'project-d60a83c1-2c60-4d51-ad0.firebaseapp.com',
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'project-d60a83c1-2c60-4d51-ad0',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ??
    '1:756865700041:web:f7e58da7556e44f0863d18',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '756865700041',
};
