---
id: IMDB-6
title: Faceted title search view
status: in-review
owner: product-owner
design: designs/DES-3-faceted-title-search.md
depends-on: [IMDB-4]
branch: imdb-6-faceted-title-search
pr: "https://github.com/dperez4787/imdb-browser/pull/22"
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
- **ui-ux-designer** — architecture landed: `docs/architecture.md` → "Frontend
  routing & URL scheme" fixes the `/titles` encoding (params mirror
  `TitleSearchFilter` names, comma-separated multi-values, defaults omitted, 1-based
  `page`, page size 24, offset ≤ 10k), and `imdb-federation/API-CHANGES.md` (landed,
  authoritative) adds contextual facet counts plus capped totals
  (`total`/`totalIsCapped`). DES-3 revised in place: exact URL mapping, live
  per-filter checkbox counts via `facets(dimensions: [GENRES, TITLE_TYPES])`,
  `10,000+ titles` / `Page N of 417+` capped displays, 24-per-page grid (6 columns
  wide), and a dedicated index-never-built empty state (`searchInfo.rebuiltAt` is
  `null` until the user runs imdb-federation's rebuild — a verified prerequisite for
  demoing this view). Spec `approved`; both blockers cleared → `ready-for-dev`
  (depends-on IMDB-4 still orders the work).
- **product-owner** — governance advisory (no AC/status change; see IMDB-14 and
  IMDB-4's Log/PR #8): the router now denies `Rating.numVotes` to everyone, and
  **selecting a denied field 403s the whole operation** — so this ticket's
  `searchTitles` document must not select it (DES-3's query snippet, which predates
  governance and still selects `numVotes`, is being trimmed under IMDB-14's design
  pass). Card anatomy shows the star rating (`averageRating`, ungoverned), so no AC
  is affected. The `votesFrom` URL filter is a filter *input*, not a field
  selection — presumed ungoverned, but the developer should verify it against the
  live router at implementation and flag IMDB-14 if filtering is also governed.
  Stays `ready-for-dev` with no new dependency.
- **developer** — claimed → `in-progress` on branch `imdb-6-faceted-title-search`.
  Live-introspected the router (identity token) to pin real names before coding:
  facet dimensions are `TitleFacetDimension` (`GENRES`, `TITLE_TYPES`, plus DECADES /
  RATING_BANDS / RUNTIME_BANDS), `TitleSort` = POPULARITY_DESC | RATING_DESC |
  RELEVANCE | YEAR_ASC | YEAR_DESC, `TitleSearchFilter` has `includeAdult` (default
  false) + `peopleMode` (default ALL). Confirmed the shipping query shape live:
  `searchTitles(filter:{genresAny:["Horror"],votesFrom:1000},sort:RATING_DESC,…)`
  returns contextual `facets(dimensions:[GENRES,TITLE_TYPES],perDimension:50)` that
  re-count within the filter, `total:10000 / totalIsCapped:true`, and `numVotes`
  redacted (`extensions.governance.redactedFields:["Rating.numVotes"]`) while
  `averageRating` survives — numVotes stays optimistically selected. `votesFrom` is a
  filter *input* and is NOT governed (accepted, no denial) — nothing to flag on
  IMDB-14.
- **developer** — implemented → `in-review`, PR #22 (draft).
  What changed: `src/titles/` (TitleSearchView, FilterRail, FacetGroup,
  YearRangeInput, RatingMinSelect, PeopleFilter, ActiveFilterChips, SortSelect,
  ResultsGrid, TitleCard, Paginator, urlState.js + tests), new
  `src/graphql/titleSearchQueries.js` + `src/graphql/useTitleSearch.js` (+ test)
  — shared graphql files untouched per the round's file partition; `/titles`
  route added to App.jsx (two-line diff); IMDB-6 styles appended to styles.css.
  urlState.js owns the whole URL⇄filter⇄variables mapping (decided encoding:
  comma multi-values, defaults omitted, 1-based page, size 24, offset ≤ 10k →
  Next disabled at page 417); uncontrolled params round-trip as chips.
  Verified: `npm ci && npm test` green (378 pass; 16 pre-existing skips are the
  live tester suites) and `npm run build` green. LIVE against the router
  (gcloud identity token, the real shipping document + real urlState mapping):
  filtered deep link → total 219/uncapped, contextual counts re-count within
  the filter, two runs of the same URL return identical item order, page 1 ∩
  page 2 empty, numVotes redacted with averageRating intact; capped shape
  (total 10000/totalIsCapped true) verified separately.
  Honest gaps: (1) browser click-through as a signed-in Google user NOT done —
  deferred per user directive; live checks used a Google OIDC token, not a
  Firebase ID token from the UI. (2) DES-3's sub-960px filter DRAWER
  (`Filters (3)` button, focus trap, Esc) is not implemented — below 960px the
  rail stacks above the grid, fully interactive; designer/PO should say
  whether the drawer is a must for this ticket or a follow-up. (3) People
  autocomplete exercised at unit level only. (4) App.test.jsx's not-found case
  moved to a genuinely unrouted path since `/titles` is now real.
