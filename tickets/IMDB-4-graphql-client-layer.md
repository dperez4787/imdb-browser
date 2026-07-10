---
id: IMDB-4
title: GraphQL client layer for the SPA
status: needs-architecture
owner: product-owner
depends-on: [IMDB-1, IMDB-2, IMDB-3]
branch: ""
pr: ""
---

## Description

The single GraphQL client module every view will use, living entirely under
`app/frontend/src/graphql/` per CLAUDE.md: components never call `fetch()` or embed
query strings. It attaches the credential per the IMDB-3 decision, talks only to the
cosmo router, and normalizes errors so views get a consistent shape. Blocked on two
OPEN sections of `docs/architecture.md`: "GraphQL client layer" (library choice,
codegen or not, caching policy, where the auth header attaches, error normalization)
and — via IMDB-3 — "Router authentication from the browser". Assumes IMDB-1's scaffold
and IMDB-2's auth (the credential presumably derives from the signed-in Firebase user).

## Acceptance criteria

- A signed-in user's session can execute a real query against the live cosmo router
  through the client module — demonstrated by a minimal query (e.g.
  `searchInfo { rebuiltAt }`, field names verified by introspection first per the
  brief) succeeding in the running app or an integration check recorded on the PR.
- Requests carry the credential exactly as the IMDB-3 decision specifies; no GraphQL
  request is attempted while signed out.
- All GraphQL transport, query definitions, caching, and error normalization live
  under `app/frontend/src/graphql/`; a repo search shows no `fetch()` and no inline
  GraphQL strings in components.
- Router/network/GraphQL errors surface to callers in one documented, normalized shape
  (unit-tested with a mocked transport).
- Unit tests colocated under `src/graphql/` pass in `npm test`.

## Files expected to change

- app/frontend/src/graphql/ (client module, queries, error handling, tests)
- app/frontend/package.json (chosen client library)

## Log

- **product-owner** — filed. `needs-architecture`: blocked on the OPEN "GraphQL client
  layer" section and on IMDB-3's router-auth decision. This is the gate for every
  data-fetching view (IMDB-5 through IMDB-9, IMDB-13).
