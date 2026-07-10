---
id: IMDB-8
title: Person detail page with title cross-navigation
status: needs-design
owner: product-owner
design: ""   # to be filled by ui-ux-designer
depends-on: [IMDB-5, IMDB-7]
branch: ""
pr: ""
---

## Description

A person page hydrated through federation — name plus filmography/known-for titles —
completing the people ↔ titles cross-navigation the brief calls for: person results in
search open this page, filmography entries link to title detail pages (IMDB-7), and
title pages' cast/crew entries now link here. **No people images exist** (OMDb serves
title posters only), so this page ships with the designed placeholder/initials
treatment; the richer known-for-poster treatment is IMDB-9's separate design question
and must not block this page. Replaces the placeholder person route from IMDB-5.

Designer must answer: page layout (identity header with placeholder treatment,
filmography organization — by category? known-for first?), how title entries display
(poster thumbnails with fallbacks?), and the loading / not-found / error states.

## Acceptance criteria

- Clicking a person in universal search opens their detail page at a stable, shareable
  URL; loading that URL directly while signed in renders the same page.
- The page shows the person's name with the designed placeholder visual treatment (no
  broken images, no real photo expected) and their filmography/known-for titles as the
  design specifies, hydrated through the router.
- Clicking a filmography entry navigates to that title's detail page; on a title
  detail page, clicking a cast/crew person navigates here — cross-navigation works in
  both directions.
- Unknown/invalid person id renders the designed not-found state; query failures the
  designed error state; loading state as designed.
- Signed-out users never see the page (AuthGate).

## Files expected to change

- app/frontend/src/people/ (detail page + tests)
- app/frontend/src/titles/ (activate person links in cast/crew entries)
- app/frontend/src/graphql/ (person detail query)

## Log

- **product-owner** — filed. `needs-design`. Ships with the placeholder person visual;
  the mosaic/known-for-poster idea is deliberately split into IMDB-9 so this page
  isn't blocked on that designer+architect discussion.
