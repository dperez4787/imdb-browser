---
id: IMDB-17
title: Governance role badge — show who the graph thinks you are
status: in-progress
owner: product-owner
design: designs/DES-1-marquee-shell-and-sign-in.md
depends-on: [IMDB-2, IMDB-4]
branch: imdb-17-governance-role-badge
pr: ""
---

## Description

Filed by the governance-platform effort (imdb-policy-service / cosmo-router) for
product-owner triage.

A signed-in user's governance role is defined by the policy service: the persona whose
`subjects` list contains their Google email grants its roles (managed live in the
governance console's Personas tab, https://imdb-policy-service-dkuqnmldta-uc.a.run.app).
A user mapped nowhere has **no roles** — not even `public` (it's a role, not
"everyone") — and sees every governed field redacted.

The router now surfaces the resolved roles on **every response**:

- header `X-Imdb-Roles: analyst,public` (only present when the caller has roles;
  CORS-exposed via `Access-Control-Expose-Headers`, so browser JS can read it)
- header `X-Imdb-Policy-Revision: <n>` (which policy bundle decided)
- body `extensions.governance.roles` on responses that had redactions

Show a small role badge in the header next to the signed-in avatar so demo viewers can
see role changes take effect live. The "no roles" state must be visually distinct and
honest (e.g. "viewer — no data role"), because it explains why restricted pills
(IMDB-14 / DES-8) appear everywhere.

Alternative source if headers prove awkward in the client layer: `GET
{policy-service}/v1/whoami` is under consideration on the platform side but NOT built —
headers are the supported mechanism today.

## Acceptance criteria

- After sign-in, the header shows the user's governance roles read from
  `X-Imdb-Roles` on any router response (no extra network round trip solely for the
  badge; piggyback on an existing query).
- A user with no mapped persona sees the distinct no-role state, not an empty/broken
  badge.
- When the user's roles change at the governance console, the badge reflects it on the
  next fetched response — no reload required beyond normal query activity, no redeploy.
- Unit tests cover: roles present, roles absent, roles changing between responses.
- No component outside `src/graphql/` reads raw response headers (the client layer
  exposes them normalized, mirroring the IMDB-14 pattern).

## Files expected to change

- app/frontend/src/graphql/ (surface X-Imdb-Roles through the client layer + tests)
- app/frontend/src/ (header/avatar area badge component + tests)

## Log

- **governance-platform** (external) — filed with the platform work already live:
  headers verified on the deployed router (smoke-tested every deploy). Left in
  `backlog` for product-owner triage and (if user-facing polish requires) a design
  pass; the badge is intentionally small enough to ride an existing design's header
  spec if the designer prefers.
- **product-owner** — **renumbered IMDB-15 → IMDB-17.** The external filing collided
  with the already-taken IMDB-15 (`tickets/IMDB-15-chat-backend-cors.md`, filed and
  implemented first, PR #11). Per `tickets/README.md` numbers are never reused, so
  this ticket takes the next free number; nothing else about the ticket changed.
- **product-owner** — triaged. Dependencies verified: IMDB-2 (PR #6) and IMDB-4
  (PR #8) are both merged, so the AuthGate and the `src/graphql/` client layer this
  ticket builds on exist on `main`. Live platform facts confirmed for the
  implementer: `X-Imdb-Roles` is **absent** (not empty) when the caller has no
  roles; `x-imdb-policy-revision` is present on every response; both are
  CORS-exposed via `Access-Control-Expose-Headers` (verified live against the
  deployed router, 2026-07-11). Status → **`needs-design`**: this is user-facing
  chrome inside DES-1's precisely specified TopBar (wordmark / omnibox / chat
  toggle / UserMenu), and the workflow requires a `design:` link before UI work is
  `ready-for-dev`. The designer's ask is small — a DES-1 addendum answering:
  (1) badge placement and size next to the 32px avatar without breaking the 56px
  TopBar; (2) the distinct, honest no-roles visual and copy (the ticket's
  "viewer — no data role" is an example, not a decision); (3) overflow behavior for
  multiple roles; (4) whether the badge duplicates into the UserMenu. The
  acceptance criteria as written stand; the client-layer header plumbing mirrors
  the IMDB-14 pattern and needs no architecture pass.
- **ui-ux-designer** — design settled: DES-1 revised in place with **"Addendum —
  governance role badge (IMDB-17)"** (`designs/DES-1-marquee-shell-and-sign-in.md`).
  The PO's four questions, answered there: (1) *placement* — `RoleBadge` is a 20px
  pill inside the existing UserMenu trigger, 8px left of the 32px avatar, in a
  **fixed 104px slot** so state changes never shift the TopBar (56px bar untouched;
  no new tab stop); (2) *no-roles state* — dashed hairline border + muted text, copy
  exactly **`no data role`** (not "viewer" — the spec refuses to invent a role name;
  no lock glyph either, since DES-8's lock means a withheld value and here nothing
  is withheld); the full "why is everything redacted" explanation lives in the menu;
  (3) *multi-role overflow* — pill shows `first-role +N` with ellipsis past ~11ch,
  full header-order list in the menu; (4) *UserMenu duplication* — **yes**: a static
  "Data roles" section (roles or explanation, plus muted `policy rev <n>` from
  `x-imdb-policy-revision`) between identity and Sign out; it is also the sole
  surface below 720px and the keyboard/SR path (badge has no tooltip — the menu is
  one click away). Spec distinguishes `roles: null` (no response yet → empty slot,
  never a guessed state) from `[]` (header absent → no-roles state), matching the
  verified live contract. Hook named `useGovernanceRoles()` in `src/graphql/` per
  the AC. Status → **`ready-for-dev`**; `design:` set.
- **developer** — claimed; branch `imdb-17-governance-role-badge` off `origin/main`.
  Implemented the role signal as a module-level store
  (`src/graphql/rolesStore.js`, `useSyncExternalStore`, mirroring
  `searchTextStore`): `null` = no response yet (Unknown), `[]` = a response with
  `X-Imdb-Roles` absent (no roles), otherwise the header's values in order;
  `x-imdb-policy-revision` → `revision` (extensions fallback). The client feeds
  it from every resolved response — the sole `client.js` touch is additive:
  `rawExecute` now also destructures `headers` off the existing
  `client.rawRequest(...)` and calls `ingestResponse(headers, extensions)`
  before returning; the resolved `{ data, extensions }` shape and error
  normalization are untouched. New `RoleBadge` (fixed 104px slot, solid pill /
  dashed `no data role` / empty slot) mounts inside the single `UserMenu`
  trigger left of the avatar (no new tab stop); the trigger's aria-label
  extends with the state (` — data roles: …` / ` — no data role`, silent) and
  the menu gains a static, non-focusable **Data roles** section with
  `policy rev <n>`. Files: `src/graphql/rolesStore.js` (+test),
  `src/graphql/client.js` (additive), `src/graphql/index.js` (re-export),
  `src/RoleBadge.jsx` (+test), `src/UserMenu.jsx` (+tests), `src/styles.css`.
  No other view touched; the roles-present *live* path is seam-tested only and
  deferred per the user directive (the verifying identity maps to no persona).
