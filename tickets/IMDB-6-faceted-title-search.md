---
id: IMDB-6
title: Faceted title search view
status: needs-architecture
owner: product-owner
design: designs/DES-3-faceted-title-search.md
depends-on: [IMDB-4]
branch: ""
pr: ""
---

## Description

The exploratory complement to universal search (the brief keeps both): a title search
view over `searchTitles` with filters and sorts. Filter vocabularies (genres, title
types, crew categories where applicable) are populated from the **typed facet fields**
materialized in the backend's `search_facets` collection — never hard-coded lists.
Supported per the brief: genre filters, `isAdult`, `withPeople` with ALL/ANY semantics,
**POPULARITY as the default sort**, other documented sorts, deterministic paging, and
count variants. Verify actual field/enum names by introspecting the live router
(`API-CHANGES.md` in imdb-federation is authoritative once it lands). Filter state
should live in shareable URLs — that URL scheme is part of the OPEN "Frontend routing &
state" architecture section, so this ticket is dual-blocked: design first, and the
routing decision must land before it is `ready-for-dev`.

Designer must answer: layout of the filter rail/controls vs. the results grid, result
card anatomy (poster, rating, year, genres), how ALL/ANY people-filtering is expressed,
pagination treatment, facet counts display, and the loading / empty / no-results /
image-missing / error states.

## Acceptance criteria

- A signed-in user can open the title search view and see results ordered by
  popularity by default, each card showing its OMDb poster or the designed fallback.
- Genre and title-type filter controls are populated from the router's typed facet
  vocabulary fields (observable: a vocabulary value present in the API appears without
  any code change; no hard-coded genre/category list exists in the source).
- Applying filters (e.g. genre = Horror, isAdult excluded, a person constraint with
  ALL vs ANY) visibly narrows results consistently with the selected semantics.
- Changing sort reorders results per the selected documented sort; paging through
  results is deterministic (no duplicates/skips when walking pages).
- The current filter/sort/page state is encoded in the URL; loading that URL fresh
  (signed in) reproduces the same view.
- Loading, empty, no-results, and error states render as the design spec defines;
  offscreen posters lazy-load.
- Result cards navigate to the title detail route.

## Files expected to change

- app/frontend/src/titles/ (faceted view, filter controls, results grid + tests)
- app/frontend/src/graphql/ (searchTitles + facet vocabulary queries)

## Log

- **product-owner** — filed. `needs-design`; also blocked on the OPEN "Frontend
  routing & state" section (shareable filter URLs) and transitively on IMDB-4 —
  whoever unblocks last flips it to `ready-for-dev`.
- **ui-ux-designer** — design spec written: `designs/DES-3-faceted-title-search.md`
  (filter rail + grid layout, API-driven FacetGroups with counts, ALL/ANY people
  filter expression, active-filter chips, Prev/Next paging with `Page N of M`, all
  states; `SearchFreshness` reused from DES-2). Design side is settled; the spec
  enumerates the state dimensions that must round-trip through the URL, but the URL
  encoding itself is the OPEN "Frontend routing & state" decision — moving to
  `needs-architecture` until the architect lands it (spec stays `draft` till then).
