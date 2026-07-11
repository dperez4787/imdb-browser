---
id: DES-1
title: Marquee — product concept, app shell, and sign-in
status: approved
tickets: [IMDB-2, IMDB-17]
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
  and **Sign out**. The UserMenu trigger also carries the **governance role badge**
  (`RoleBadge`) immediately left of the avatar — see *Addendum — governance role
  badge* below.
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

(The addendum below consumes response *headers* from router traffic other views
already make; it adds no query of its own, so the zero-extra-traffic stance holds.)

---

## Addendum — governance role badge (IMDB-17)

### Intent

The graph now resolves every signed-in user to zero or more governance roles and says
so on every response (`X-Imdb-Roles`; architecture § Field-level governance). The
TopBar wears that answer as a small badge beside the avatar, because during a live
grant flip the badge *is* the narration — and for a user with no roles it is the
answer to "why is everything redacted for me" (DES-8's pills everywhere). Same
honesty rules as the rest of Marquee: never invent a role name (no "viewer" — the
truthful state is *no data role*), never guess before the first response (blank, not
a claim), and never let a flip move the chrome (DES-8's zero-layout-jump discipline).

### Layout

```
TopBar right cluster (≥720px):

roles present:            no roles:                  unknown (pre-first-response):
… 💬  [ANALYST](DP)       … 💬  [no data role](DP)    … 💬        (DP)
       └ solid pill ┘            └ dashed pill ┘           └ slot empty ┘

multi-role:               long role name:
… 💬  [ANALYST +1](DP)    … 💬  [CONTENT-MODE…](DP)   ← ellipsis past ~11ch
```

- **The pill**: 20px tall, fully rounded, 11px letter-spaced small caps, vertically
  centered in the 56px bar, 8px gap to the avatar. It renders inside the existing
  UserMenu trigger button — the pill and the avatar are **one click target and one
  tab stop** (the DES-1 tab order — wordmark, omnibox, chat toggle, avatar — gains
  nothing).
- **Roles present**: raised surface `#181b22`, 1px **solid** hairline `#262a33`,
  primary text `#e8eaed`. One role → the role name verbatim (rendered small-caps by
  CSS; the string is never rewritten). Two or more → first role as sent plus a count:
  `analyst +1`. Full list lives in the menu.
- **No roles** (a response arrived and `X-Imdb-Roles` was absent): same geometry,
  1px **dashed** `#262a33` border, muted text `#9aa0a6`, copy exactly `no data role`.
  The dashed border reads as "an empty slot where a role would go" — visually
  distinct from a granted role at a glance. **No amber** (focus/activity only) and
  **no lock glyph** — DES-8's lock means "a value exists and is withheld"; here
  nothing is withheld, the roles list is genuinely empty.
- **Unknown** (signed in, no router response observed yet this session): the slot
  renders empty. Showing "no data role" before we know would be a guess.
- **Fixed slot**: the badge renders inside a fixed-width slot (104px, constant at
  runtime; pill right-aligned against the avatar, text ellipsized past ~11ch). Role
  flips, first appearance, and state changes therefore never shift the chat toggle
  or anything else — the zero-layout-jump rule, applied to chrome.
- **Below 720px**: the slot is not rendered (the collapsed TopBar has no room); the
  menu section below is the sole surface and keeps full parity.

### In the UserMenu (yes, it duplicates — the menu is the explainer)

```
roles present:                      no roles:
┌──────────────────────────┐       ┌──────────────────────────┐
│ Danny Perez              │       │ Danny Perez              │
│ perez.f@… (muted)        │       │ perez.f@… (muted)        │
├──────────────────────────┤       ├──────────────────────────┤
│ DATA ROLES               │       │ DATA ROLES               │
│ analyst, public          │       │ No data role             │
│ policy rev 12 (muted)    │       │ Governed fields are      │
├──────────────────────────┤       │ redacted for you. A graph│
│ Sign out                 │       │ admin can grant a role — │
└──────────────────────────┘       │ it takes effect live, no │
                                   │ reload. (muted)          │
                                   │ policy rev 12 (muted)    │
                                   ├──────────────────────────┤
                                   │ Sign out                 │
                                   └──────────────────────────┘
```

- A **Data roles** section sits between the identity block and Sign out: 11px
  small-caps muted label, then the full role list (comma-separated, header order) or
  the no-roles explanation. `policy rev <n>` (from `x-imdb-policy-revision`, muted,
  11px) rides along — it is the honest-freshness move for governance, and during a
  demo it visibly ticks when the bundle changes. While roles are unknown the section
  shows `—` (an em dash) rather than hiding, so the menu never reflows on first
  response.
- The section is **static text, not a menu item** — not focusable, skipped by any
  menu keyboard navigation; Sign out remains the only action. No link to the
  governance console: it is an admin tool, not user chrome.
- The badge itself gets **no tooltip**. Unlike DES-8's pill (a terminal affordance
  that must self-explain), this badge is one click from its full explanation in the
  menu; a second explaining surface would be redundant chrome.

### States

```
Unknown:        empty slot; menu section shows "—". Transient — ends at the
                first router response of the session.
Roles present:  solid pill, name or name +N; menu lists all.
No roles:       dashed pill, "no data role"; menu explains why everything
                is redacted.
Live flip:      the next router response that reports different roles
                restyles the pill in place — no animation, no layout shift,
                no toast, no live-region announcement (mirrors DES-8's
                swap-in-place rule). The menu, if open, updates in place.
Sign-out:       badge unmounts with the shell; a new sign-in starts at
                Unknown again.
```

### Components

- `RoleBadge` — the fixed-width slot + pill. Consumes `useGovernanceRoles()`;
  renders the empty slot for `roles: null`, the dashed variant for `[]`, the solid
  variant otherwise. Mounted inside the `UserMenu` trigger, left of the avatar.
- `UserMenu` — grows the **Data roles** section per the wireframe (no new
  component; it is menu content).
- `useGovernanceRoles()` — hook exported from `src/graphql/` (per IMDB-17, no
  component outside that module reads raw headers): returns
  `{ roles: string[] | null, revision: number | null }` — `null` = no response
  observed yet; `[]` = a response arrived with `X-Imdb-Roles` absent (the live
  contract for "no roles"); otherwise the header's values in header order.
  Updated from every router response; last response processed wins (policy flips
  move at poll-interval scale, so ordering races are immaterial).

### Behavior

- The badge updates by **piggybacking on responses other views already fetch** —
  it issues no request of its own, ever (observable: opening a page makes the same
  router calls with and without the badge).
- A grant flip at the governance console is reflected on the next fetched response —
  no reload, no redeploy (observable: flip a persona, navigate or refetch, the pill
  restyles).
- The UserMenu trigger's accessible name extends with the badge state:
  `"<displayName> — data roles: analyst, public"` / `"<displayName> — no data
  role"` / just the name while unknown. It updates silently — **no `aria-live`**,
  consistent with DES-8's no-announcement stance; a screen reader user finds the
  current state on the trigger or in the menu.
- Pill text and hatch-free styling are presentation; the pill carries
  `data-roles="analyst,public"` (or `data-roles=""` for none) for tests.
- Keyboard: unchanged from the base spec — the trigger opens on Enter/Space, the
  menu traps focus, Esc returns focus to the trigger. The badge adds no tab stop
  and is not independently interactive.
- Zero layout jump, restated as the acceptance-quotable rule: **the TopBar's
  height, the slot's width, and the position of every other TopBar element are
  identical in all four badge states and across any live flip.**

### Data needs

None from the GraphQL document layer — this is transport metadata:

- `X-Imdb-Roles` response header — **absent when the caller has no roles** (not
  empty; verified live per IMDB-17's Log), comma-separated role names otherwise.
- `x-imdb-policy-revision` response header — present on every response.
- Both are CORS-exposed via `Access-Control-Expose-Headers` (verified live), so the
  browser client can read them. `extensions.governance.roles` (present on redacted
  responses) may corroborate but headers are the mechanism — they arrive on clean
  responses too.
- The sign-in screen's zero-traffic rule is untouched: the badge exists only inside
  the signed-in shell and only reads headers from queries views already make.
