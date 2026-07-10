---
id: DES-1
title: Marquee — product concept, app shell, and sign-in
status: approved
tickets: [IMDB-2]
---

## Intent

**The product concept, in one paragraph (all other specs assume it).** The app is
called **Marquee** in its chrome: a poster-forward, keyboard-first way to wander IMDb
data. House lights down — a near-black theater surface makes posters the only saturated
thing on screen. There is exactly one front door: a universal omnibox (DES-2) that is
always one keystroke away (`/` or `Cmd/Ctrl+K`). Every entity you can see is one hop
away — titles, people, and genres render as consistent chips/cards that navigate, so
browsing feels like wandering a lobby, not filling in forms. A chat concierge (DES-7)
rides alongside in a docked panel rather than covering the content, because the whole
point is asking questions *while* looking at things. Honesty is part of the aesthetic:
index freshness is stated plainly (DES-2), missing posters get designed fallback art
(never broken images), and people — who have no photos anywhere in the system — get a
deliberate visual identity (DES-6), not an apology.

This spec covers what IMDB-2 builds: the sign-in screen (the only thing a signed-out
user ever sees), the auth-resolving state, and the signed-in chrome (top bar with
identity + sign-out) that every other view mounts inside.

## Shared visual language (referenced by DES-2…DES-7)

- **Surface**: background `#0e1014`, raised cards `#181b22`, hairline borders
  `#262a33`, primary text `#e8eaed`, muted text `#9aa0a6`, accent **marquee amber**
  `#f5c518` (used sparingly: focus rings, the active nav state, the wordmark dot).
- **Posters** are always **2:3 aspect ratio**, rounded 6px, and always rendered
  through the shared `PosterImage` component (fallback + lazy-load rules below).
- **Fallback art** (`FallbackArt`): when a poster is missing/404, render a
  deterministic placeholder — a subtle two-stop gradient whose hue is derived from a
  hash of the entity id, with the entity's initials (up to 2 characters) centered and
  a small glyph in the corner: a film-frame glyph for titles, a person glyph for
  people. Deterministic so the same entity always looks the same. Never a broken-image
  icon, never a gray void.
- **Lazy images**: any poster that is offscreen must not issue its network request
  (native `loading="lazy"` is acceptable); observable as no OMDb request for content
  the user hasn't scrolled to.
- **Entity chips** (`EntityChip`): the universal "this is a thing you can hop to"
  unit — a pill with a tiny thumb (poster or monogram), primary text, and optional
  muted metadata. Used in cast lists, filmographies, chat answers.
- **Keyboard**: `/` or `Cmd/Ctrl+K` focuses the omnibox from anywhere (unless focus is
  already in a text input); `Cmd/Ctrl+/` toggles chat; `Esc` closes the topmost
  transient surface (autocomplete panel, then menus, then chat).

## Layout

### Signed-out — sign-in screen (the only signed-out view)

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│                                                            │
│              ● ● ● ● ● ● ● ● ● ● ● ● ● ●                   │   ← marquee-dot
│            ┌───────────────────────────────┐               │     ornament (CSS
│            │                               │               │     only, amber,
│            │        MARQUEE ●              │               │     slow shimmer)
│            │   Browse IMDb like a lobby,   │               │
│            │        not a spreadsheet      │               │
│            │                               │               │
│            │   ┌───────────────────────┐   │               │
│            │   │  [G] Sign in with     │   │               │
│            │   │      Google           │   │               │
│            │   └───────────────────────┘   │               │
│            │                               │               │
│            │   Google sign-in only. No     │               │
│            │   account is created here.    │               │
│            └───────────────────────────────┘               │
│              ● ● ● ● ● ● ● ● ● ● ● ● ● ●                   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

- Centered card (max-width 400px) on the full-bleed dark surface. Ornament is pure
  CSS — **no data or image requests are made signed-out** (no OMDb, no router).
- One action: the standard Google sign-in button (Google brand guidelines: light
  button, Google "G" mark, "Sign in with Google").
- **Sign-in error state** (popup closed, network failure): an inline message renders
  under the button — `Couldn't sign in — <short reason>. Try again.` — and the button
  remains enabled. No toast, no modal.
- **Sign-in in-flight**: button shows a disabled state with an inline spinner
  replacing the G mark; the rest of the card is unchanged.

### Auth-resolving — the curtain (never a flash of the wrong screen)

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│                       MARQUEE ●                            │  ← wordmark at 40%
│                                                            │     opacity, gentle
│                                                            │     pulse; nothing else
└────────────────────────────────────────────────────────────┘
```

While Firebase resolves persisted auth state on page load, render only this curtain.
It is neither the sign-in screen nor the app shell, so neither can flash. It has no
spinner and no text beyond the wordmark; if auth resolves in under ~150ms the pulse
animation simply never becomes noticeable.

### Signed-in — the shell (chrome for every view)

```
┌────────────────────────────────────────────────────────────┐
│ MARQUEE ●   [ 🔍 Search titles & people…      /  ]  💬  (DP)│ ← TopBar
├────────────────────────────────────────────────────────────┤
│                                                            │
│                     <routed view>                          │
│                                              ┌──────────┐  │
│                                              │ chat     │  │ ← DES-7 panel,
│                                              │ (DES-7)  │  │   when open
│                                              └──────────┘  │
└────────────────────────────────────────────────────────────┘

(DP) open:                        ┌──────────────────┐
                                  │ Danny Perez      │
                                  │ perez.f@… (muted)│
                                  ├──────────────────┤
                                  │ Sign out         │
                                  └──────────────────┘
```

- **TopBar** (56px, sticky): wordmark left (navigates to `/`), omnibox center
  (DES-2 owns its behavior), right side: chat toggle button (DES-7) and the
  **UserMenu** — the signed-in user's Google avatar (32px circle; if the photo URL is
  missing or fails, a monogram disc of their initials — same `Monogram` component the
  rest of the app uses). Clicking it opens a menu with display name, email (muted),
  and **Sign out**.
- Signing out closes the menu and returns immediately to the sign-in screen.
- **Responsive**: below 720px the omnibox collapses to a search icon button that
  expands to a full-width overlay input on tap (DES-2 details it); wordmark collapses
  to the amber dot; UserMenu unchanged.

## Components

- `AuthGate` — wraps the whole app: renders `AuthCurtain` while resolving,
  `SignInScreen` when signed out, children (the shell) when signed in. Only it and
  `auth.js` touch Firebase.
- `AuthCurtain` — the resolving splash.
- `SignInScreen` — card, `GoogleSignInButton`, inline error.
- `AppShell` — TopBar + routed outlet + chat mount point.
- `TopBar` — wordmark, omnibox slot, chat toggle, `UserMenu`.
- `UserMenu` — avatar button + menu (name, email, sign out).
- `Monogram` — initials disc with deterministic hue from a string (shared with DES-6).
- `PosterImage` / `FallbackArt` — shared image unit per the visual language above
  (built here or with the first consumer, DES-2; named here so all specs agree).
- `EntityChip` — shared hop unit (first consumer is DES-4).

## Behavior

- Signed out, every route renders `SignInScreen`; no data request of any kind is made
  (observable: zero router/OMDb traffic signed-out).
- Page load signed-in: curtain → shell, with no intermediate sign-in flash. Page load
  signed-out: curtain → sign-in screen, with no shell flash.
- Google button: click opens the Google popup flow; success lands on `/` (or the
  originally requested route if the router preserves it — architect's routing
  decision; if not preserved, `/` is fine); failure renders the inline error and the
  user can retry immediately.
- Sign out: single click from the UserMenu; app returns to `SignInScreen`; any open
  transient UI (chat, menus) is discarded.
- Keyboard/focus: TopBar is in the tab order — wordmark, omnibox, chat toggle, avatar.
  The UserMenu opens on Enter/Space, traps focus while open, closes on Esc (focus
  returns to the avatar button). On the sign-in screen, initial focus is on the Google
  button.
- The avatar image failing to load swaps to the `Monogram` without layout shift.

## Data needs

None from the GraphQL router — this spec deliberately requires zero router traffic.
Firebase Auth provides `displayName`, `email`, `photoURL` for the UserMenu. Firebase
web config is public-by-design and committed per CLAUDE.md.
