---
id: IMDB-4
title: GraphQL client layer for the SPA
status: in-review
owner: product-owner
depends-on: [IMDB-1, IMDB-2, IMDB-3]
branch: "imdb-4-graphql-client-layer"
pr: "https://github.com/dperez4787/imdb-browser/pull/8"
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
- **architect** — unblocked → `ready-for-dev` (still sequenced behind IMDB-1/IMDB-2
  merges per depends-on). Decisions in `docs/architecture.md` § "GraphQL client
  layer" + § "Router authentication from the browser". What the developer needs:
  `graphql-request` + TanStack Query v5, **no codegen**; everything under
  `app/frontend/src/graphql/` (`client.js` transport, `queries.js` documents,
  `errors.js`); attach `Authorization: Bearer <auth.js getIdToken()>` per request,
  throw a normalized `auth` error (no network call) when signed out; endpoint
  `https://cosmo-router-dkuqnmldta-uc.a.run.app/graphql` (override `VITE_ROUTER_URL`);
  error shape `{kind: auth|network|graphql|bad-request, message, errors}`; staleTime
  1h for facets/searchInfo/entities, 5m for search results, `refetchOnWindowFocus`
  off. Heads-up for the AC demo: verified live that `searchInfo { rebuiltAt }` works
  authenticated (returns `rebuiltAt: null` — index never rebuilt; the field exists
  and the query 200s, so it remains a fine smoke query). Anonymous requests are
  rejected 401 by the router (verified live).
- **developer** — claimed. Branch `imdb-4-graphql-client-layer` off `origin/main`
  (post IMDB-2/IMDB-10 merges). Plan: `graphql-request` + TanStack Query v5 per the
  settled architecture; transport/queries/errors/hooks all under
  `app/frontend/src/graphql/`; `QueryClientProvider` wired in `main.jsx`; live
  verification of every operation document against the router with a Google OIDC
  identity token (the other configured JWKS provider) since a Firebase ID token
  cannot be minted non-interactively.
- **developer** — implemented → `in-review`, PR #8 (draft):
  https://github.com/dperez4787/imdb-browser/pull/8. Files: `src/graphql/`
  (`client.js` transport + signed-out guard, `queries.js` documents, `errors.js`
  normalization, `hooks.js`/`keys.js` hooks + keys + staleTimes,
  `queryClient.js` factory, three colocated test files), `main.jsx`
  (QueryClientProvider), `scaffold-conventions.test.js` (the no-fetch/no-GraphQL
  scan now exempts `src/graphql/`, as its own comment anticipated),
  `package.json`/lockfile (`graphql-request` 7.4, `@tanstack/react-query` 5.101).
  Verified: 83 unit tests + build green; ALL seven operation documents executed
  against the LIVE router with real post-rebuild data (searchInfo.rebuiltAt
  2026-07-11T03:12Z; Godfather/Pacino/union-search/episode results in the PR),
  authenticated with a Google OIDC identity token. HONESTLY NOT verified: the
  Firebase-ID-token path end-to-end (needs an interactive sign-in — exercised
  only at the mocked `getIdToken()` seam), and no view consumes the hooks yet.
  Two findings for the architect (details + evidence in the PR):
  (1) the router's new fieldAuth module denies `Rating.numVotes`,
  `Name.birthYear` (role `analyst` only; policy bundle `principals` map is
  EMPTY, so every Google/Firebase identity is denied) and `Name.deathYear`
  (denied to all) — 403 PERMISSION_DENIED verified live, so the operation
  documents deliberately do NOT select these three fields; the "most-voted
  known-for title" poster heuristic in architecture §Person visuals needs
  `numVotes` and currently cannot have it (averageRating still readable,
  POPULARITY_DESC sorting unaffected).
  (2) the router wraps orchestrator validation errors and rewrites BAD_REQUEST
  to nested DOWNSTREAM_SERVICE_ERROR, so live they normalize to kind `graphql`
  (with the useful nested message surfaced), not `bad-request`; errors.js
  already scans nested errors, so router-side passthrough fixes this with no
  client change. Did not touch AppShell/TopBar/chat files (IMDB-11 partition).
