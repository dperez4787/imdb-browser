---
id: IMDB-2
title: Firebase Auth with Google-only sign-in behind an AuthGate
status: in-review
owner: product-owner
design: designs/DES-1-marquee-shell-and-sign-in.md
depends-on: [IMDB-1]
branch: "imdb-2-firebase-auth-authgate"
pr: "https://github.com/dperez4787/imdb-browser/pull/6"
---

## Description

Enforce login exactly like linear-example (per the brief): Firebase Auth with **Google
sign-in only** — no email/password, no anonymous — behind one `auth.js` boundary module
and one `AuthGate` component wrapping the entire app. Nothing user-visible renders
signed-out except the sign-in screen. Assumes the IMDB-1 scaffold exists. Firebase web
config is public-by-design and may be committed. This ticket does **not** cover
authenticating to the cosmo router — that is IMDB-3.

Designer must answer: layout of the sign-in screen (single Google button treatment),
the loading state while auth resolves on page load (no flash of either screen), and the
signed-in user indicator + sign-out affordance in the app shell.

## Acceptance criteria

- Visiting the app signed out shows only the designed sign-in screen with a Google
  sign-in action; no other view, data, or navigation is reachable.
- Completing Google sign-in lands the user in the app shell; their identity (name
  and/or avatar per the design) is visible, with a working sign-out affordance.
- Reloading the page while signed in stays signed in (no re-prompt); while auth state
  is resolving, the designed loading state shows — never a flash of the wrong screen.
- Signing out returns immediately to the sign-in screen.
- All Firebase Auth calls live in `app/frontend/src/auth.js` (or the module the design
  spec names) and one `AuthGate` component; no other component imports Firebase.
- No secret is committed; only the public Firebase web config appears in the repo.

## Files expected to change

- app/frontend/src/auth.js (+ test)
- app/frontend/src/AuthGate.jsx (+ test)
- app/frontend/src/App.jsx, app/frontend/src/firebase-config.js

## Log

- **product-owner** — filed. `needs-design` for the sign-in screen, auth-resolving
  state, and signed-in indicator; the auth mechanics themselves are settled by the
  brief (mirror linear-example, Google-only).
- **ui-ux-designer** — design spec written: `designs/DES-1-marquee-shell-and-sign-in.md`
  (sign-in card with Google button + inline error, AuthCurtain no-flash resolving
  state, TopBar chrome with UserMenu avatar/sign-out). It also carries the product
  concept and shared visual language all other specs reference. All three designer
  questions from the description are answered; module names match the ticket
  (`auth.js`, `AuthGate`). Nothing unsettled → `ready-for-dev`.
- **developer** — claimed; branch `imdb-2-firebase-auth-authgate`. Registered the
  dedicated Firebase Web App "imdb-browser" in `project-d60a83c1-2c60-4d51-ad0`
  (app id `1:756865700041:web:f7e58da7556e44f0863d18`, additive `firebase apps:create
  web` — no IAM change), so the committed config is the real one, not an interim
  borrow from linear-example. Note: the ticket's file list says `firebase-config.js`;
  architecture.md and linear-example both name it `src/firebase.js` — going with
  `firebase.js`.
- **developer** — implemented; PR https://github.com/dperez4787/imdb-browser/pull/6
  (draft). New: `src/auth.js` (lazy init, subscribeToAuth / signInWithGoogle /
  signOutUser / getIdToken), `src/firebase.js` (committed public config of the new
  Web App), `AuthContext.jsx`, `AuthGate.jsx`, `AuthCurtain.jsx`, `SignInScreen.jsx`,
  `AppShell.jsx`, `TopBar.jsx`, `UserMenu.jsx`, `Monogram.jsx`, `Wordmark.jsx`,
  `styles.css`, + colocated tests. Changed: `App.jsx` (composition root),
  `main.jsx`/`main.test.jsx`, `App.test.jsx`, `setupTests.js` (explicit RTL cleanup —
  vitest has no globals so auto-cleanup never armed), and
  `scaffold-conventions.test.js`: IMDB-1's "no Firebase anywhere" check is now "no
  Firebase outside auth.js/firebase.js", which enforces this ticket's boundary AC;
  flagging the loosening here since that test is tester-owned coverage. Verified:
  `npm ci && npm test` 34/34 green, `npm run build` clean, dev server serves; an
  uncommitted jsdom smoke booted the app against the real Firebase SDK (no mocks)
  and it resolved signed-out to the sign-in screen. NOT verified (needs a real
  browser): the live Google popup flow — sign-in, reload persistence, sign-out —
  and DES-1's visual/responsive polish; left for the tester. TopBar ships without
  the chat toggle (DES-7/IMDB-11) and with an empty omnibox slot (DES-2/IMDB-5), by
  design.
