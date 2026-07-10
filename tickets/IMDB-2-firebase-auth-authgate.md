---
id: IMDB-2
title: Firebase Auth with Google-only sign-in behind an AuthGate
status: needs-design
owner: product-owner
design: ""   # to be filled by ui-ux-designer
depends-on: [IMDB-1]
branch: ""
pr: ""
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
