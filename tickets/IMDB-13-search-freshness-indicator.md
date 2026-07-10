---
id: IMDB-13
title: Surface searchInfo.rebuiltAt freshness on search surfaces
status: ready-for-dev
owner: product-owner
design: designs/DES-2-universal-search.md
depends-on: [IMDB-5]
branch: ""
pr: ""
---

## Description

Search collections are materialized at rebuild time, so results can lag the source
data. The brief commits to surfacing this honestly: `searchInfo.rebuiltAt` exposes
index freshness and "the UI should surface this caveat somewhere unobtrusive."
This ticket adds that indicator to the search experience shipped by IMDB-5 (and to the
faceted view once IMDB-6 exists — the design spec should place it once, reusably).
Verify the exact field name by introspection before implementing.

Designer must answer: where the indicator lives so it is honest but unobtrusive, its
wording/format (e.g. relative time — "search index rebuilt 3 hours ago"), and what
happens when the value is unavailable.

## Acceptance criteria

- On the universal search surface, a signed-in user can see the designed freshness
  indicator reflecting the live `searchInfo.rebuiltAt` value, formatted as the design
  spec defines.
- The indicator matches the design's placement and tone — it does not compete with
  results (per the spec's definition of unobtrusive).
- If `searchInfo` is unavailable or errors, the indicator degrades exactly as the
  design specifies (no crash, no misleading stale value presented as fresh).
- The same component/placement is reusable by the faceted view (IMDB-6) without
  redesign — demonstrated by its component structure and stated in the spec.

## Files expected to change

- app/frontend/src/search/ (freshness indicator + tests)
- app/frontend/src/graphql/ (searchInfo query)

## Log

- **product-owner** — filed. `needs-design` (placement/wording). Small, honest-UX
  ticket straight from the brief; depends on IMDB-5's search surface existing.
- **ui-ux-designer** — folded into `designs/DES-2-universal-search.md` (one spec, one
  component) rather than a separate spec: `SearchFreshness` is the autocomplete
  panel's footer line — "Index rebuilt 3 h ago" relative under 24h, date beyond, ⓘ
  with absolute timestamp, and **renders nothing at all** when `searchInfo` is
  unavailable (absence, never a guess). Exported standalone and mounted verbatim in
  DES-3's toolbar, satisfying the reuse criterion. Fetch rule specified (rides the
  first aliased search request, cached 5 min). Nothing unsettled → `ready-for-dev`.
