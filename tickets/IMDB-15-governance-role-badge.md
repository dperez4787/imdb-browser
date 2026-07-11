---
id: IMDB-15
title: Governance role badge — show who the graph thinks you are
status: backlog
owner: product-owner
depends-on: [IMDB-2, IMDB-4]
branch: ""
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
