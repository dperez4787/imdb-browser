---
id: IMDB-7
title: Title detail page
status: needs-design
owner: product-owner
design: ""   # to be filled by ui-ux-designer
depends-on: [IMDB-4, IMDB-5]
branch: ""
pr: ""
---

## Description

A deep title page hydrated through federation: search results are entity stubs the
router expands, so this page selects the rich `Title` fields (year, genres, rating,
runtime, credits/cast and crew) in its own query. Replaces the placeholder title route
IMDB-5 introduced. Shows the OMDb poster with graceful fallback. Cast and crew people
are listed here; navigation from those entries to person pages activates when IMDB-8
lands (this page must not break without it — person entries render as
names/cards whose links appear with IMDB-8, per the design spec). URL scheme follows
the OPEN "Frontend routing & state" decision — coordinate with the architect.

Designer must answer: page layout (poster, headline facts, rating treatment,
credits organization by category), how much filmography-style density is right, the
loading / not-found / error / image-missing states, and how cast/crew entries look
before and after person pages exist.

## Acceptance criteria

- Clicking a title in universal search opens its detail page at a stable, shareable
  URL; loading that URL directly while signed in renders the same page.
- The page shows the designed title facts hydrated through the router (at minimum:
  primary title, year, genres, rating with vote count, runtime where present) and the
  OMDb poster or designed fallback.
- Cast/crew are listed grouped as the design specifies, showing each person's name;
  with IMDB-8 unmerged these entries render per the design's pre-person-page
  treatment and nothing 404s.
- An unknown/invalid title id renders the designed not-found state; query failures
  render the designed error state; loading state as designed.
- Signed-out users never see the page (AuthGate).

## Files expected to change

- app/frontend/src/titles/ (detail page + tests)
- app/frontend/src/graphql/ (title detail query)

## Log

- **product-owner** — filed. `needs-design`. Also inherits the routing-scheme OPEN
  question via its URL requirement and depends on IMDB-4/IMDB-5. Cross-navigation to
  person pages completes in IMDB-8.
