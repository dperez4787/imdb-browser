---
id: IMDB-5
title: Universal search box with autocomplete and poster-rich results
status: ready-for-dev
owner: product-owner
design: designs/DES-2-universal-search.md
depends-on: [IMDB-4]
branch: ""
pr: ""
---

## Description

The product's front door: **one universal input** (per the brief — one search box beats
two radio buttons) that autocompletes across titles and people as the user types.
There is no mixed `search` root field yet, so this ships the brief's **zero-backend
aliased stopgap**: a single GraphQL request aliasing `searchTitles` (titlePrefix) and
`searchNames` (namePrefix), merged client-side by popularity — `rating.numVotes` for
titles vs. name popularity, with a documented fallback heuristic while name popularity
is not yet a queryable field. Title results show OMDb posters
(`img.omdbapi.com/?i=<tconst>&apikey=db1f8efc`); person results use the designed
placeholder/initials treatment (upgraded later by IMDB-9 — no people-image API exists).
Field names must be verified by introspecting the live router before implementation
(the orchestrator subgraph's `API-CHANGES.md` is authoritative once it lands).

Designer must answer: search box placement/prominence, autocomplete panel layout with
interleaved title and person hits, result card anatomy (poster, name, year/type
metadata), keyboard navigation, and the loading / empty / no-results / image-missing /
error states. Note: the OPEN "Frontend routing & state" architecture section touches
where selecting a result navigates — coordinate with the architect.

## Acceptance criteria

- A signed-in user typing a prefix (e.g. `god`) into the single search box sees an
  autocomplete panel with title and person results interleaved in one ranked list,
  ordered by the documented popularity merge (not grouped titles-then-people).
- Each title result shows its OMDb poster; a missing/404 poster shows the designed
  fallback, never a broken image. Person results show the designed placeholder
  treatment.
- Input is debounced: one GraphQL request (the aliased two-query document) per settled
  keystroke burst — observable as a single network call to the router per query change.
- Offscreen result images lazy-load (per the brief's request-volume caution).
- Loading, no-results, and error states render exactly as the design spec defines.
- Keyboard access works as designed: results are reachable and selectable without a
  mouse.
- Selecting a result navigates to that title's or person's detail route (a minimal
  placeholder page until IMDB-7/IMDB-8 land; the URL scheme follows the architecture
  decision).
- Signed-out users never see the search UI (AuthGate).

## Files expected to change

- app/frontend/src/search/ (search box, autocomplete panel, merge logic + tests)
- app/frontend/src/graphql/ (aliased search query)

## Log

- **product-owner** — filed. `needs-design` (universal search UX). Also transitively
  blocked on IMDB-4 (and thus the router-auth and client-layer architecture
  decisions). Stopgap explicitly sanctioned by the brief; replaceable when the
  `search(query, limit)` union field ships upstream.
- **ui-ux-designer** — design spec written: `designs/DES-2-universal-search.md`.
  Answers placement (hero on `/`, compact in TopBar — one component), panel anatomy,
  card anatomy, keyboard model (ARIA combobox), all states, and documents the exact
  client-side merge heuristic (2 titles : 1 person positional interleave over
  server-popularity-sorted lists, exact-name promotion) so no decision is left to the
  developer. IMDB-13's freshness indicator is folded in as the panel footer
  (`SearchFreshness`, reusable). Detail-route literals follow the architect's routing
  decision in `docs/architecture.md` (spec assumes `/title/:tconst`, `/name/:nconst`);
  that ordering is carried by depends-on (IMDB-4 chain), not by an open design
  question → `ready-for-dev`.
