---
id: DES-3
title: Faceted title search — the stacks
status: approved
tickets: [IMDB-6]
---

## Intent

Where the omnibox is the front door, this view is the stacks: a title-only search over
`searchTitles` where every filter control is populated from the backend's typed facet
vocabularies **with counts** — the UI never knows what genres exist, it only knows how
to render whatever the API says exists, and the counts turn filtering into browsing
("Horror (12,340)" is an invitation, not a form field). The entire view state —
filters, sort, page — reads as shareable state: change anything and the URL changes,
load the URL and the view reproduces. The URL encoding is now decided
(`docs/architecture.md` → "Frontend routing & URL scheme") and `API-CHANGES.md`
(landed, authoritative) adds **contextual facets** — so the rail's numbers are live:
every count reflects the current filter, not the global corpus, and narrowing one
dimension visibly re-counts the others.

## Layout

### Default view — `/titles`

```
┌──────────────────────────────────────────────────────────────────┐
│ MARQUEE ●   [ 🔍 compact omnibox ]                        💬 (DP)│
├───────────────┬──────────────────────────────────────────────────┤
│ FILTERS       │  12,437 titles      Index rebuilt 3 h ago ⓘ      │
│               │  Sort: [ Popularity ▾ ]                          │
│ Genres        │                                                  │
│ ☑ Drama 89,2K │  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐          │
│ ☐ Comedy 61K  │  │▓▓▓▓│  │▓▓▓▓│  │╌GH╌│  │▓▓▓▓│  │▓▓▓▓│          │
│ ☐ Horror 12K  │  │▓▓▓▓│  │▓▓▓▓│  │fall│  │▓▓▓▓│  │▓▓▓▓│          │
│ ☐ …           │  └────┘  └────┘  └back┘  └────┘  └────┘          │
│ Show all (28) │  Title    Title   Title   Title   Title          │
│               │  1972 ★9.2 1994 ★8.9 2019 ★8.1  …                │
│ Type          │  Drama·Crime  …                                  │
│ ☑ Movie 645K  │                                                  │
│ ☐ Series 233K │  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐          │
│ ☐ …           │  │▓▓▓▓│  │▓▓▓▓│  │▓▓▓▓│  │▓▓▓▓│  │▓▓▓▓│          │
│               │  └────┘  └────┘  └────┘  └────┘  └────┘          │
│ Year          │   …                                              │
│ [1990]–[2026] │                                                  │
│               │        ◀ Prev    Page 2 of 249    Next ▶         │
│ Rating        │                                                  │
│ ≥ [ 7.0 ▾ ]   │                                                  │
│               │                                                  │
│ People        │                                                  │
│ (FC) Coppola ✕│                                                  │
│ (AP) Pacino  ✕│                                                  │
│ [+ add person]│                                                  │
│ match (•all   │                                                  │
│        ○any)  │                                                  │
│               │                                                  │
│ ☐ Include     │                                                  │
│   adult       │                                                  │
│               │                                                  │
│ Clear all     │                                                  │
└───────────────┴──────────────────────────────────────────────────┘
```

### Active-filter summary (above the grid, when any filter is set)

```
│  Horror ✕   1990–2026 ✕   ≥7.0 ✕   with Coppola & Pacino (ALL) ✕   Clear all │
```

Removable chips restating the rail's state — the view's state is always legible in one
line, mirroring what the shared URL carries.

### States

```
Loading (first load / filter change):     Grid shows 12 skeleton
poster cards (shimmer); the rail stays interactive; the count
reads "— titles". On filter change, previous results stay dimmed
to 50% under a 2px amber top progress bar until fresh data lands.

Facet vocabulary loading:                 Rail groups show 3
skeleton checkbox lines each. Facet vocabulary error: that group
renders "Couldn't load genres. [Retry]" — the rest of the rail
and results still work.

No results:
│    Nothing matches these filters.                    │
│    [ Clear all filters ]  or remove one chip above.  │

Error (searchTitles fails):
│    ⚠ Search isn’t responding.  [ Retry ]             │

Poster missing/404: card art renders FallbackArt (DES-1) —
gradient + title initials + film glyph. Never a broken image.

Empty rail state does not exist: with no filters set, the view
shows all titles sorted by popularity (that IS the default view).

Index never built (searchInfo.rebuiltAt is null — verified real:
until the first federation rebuild runs, facet vocabularies come
back empty and every search returns total: 0): the grid area
renders one explainer instead of the no-results state —
"The search index hasn't been built yet — titles will appear
after the first rebuild." — and the rail hides its (empty) facet
groups. "Nothing matches these filters" must never appear in
this state: nothing the user unchecks can fix it.
```

## Components

- `TitleSearchView` — page: rail + toolbar + grid + pagination; owns URL↔state sync.
- `FilterRail` — the left rail (collapsible drawer below 960px, opened by a
  `Filters (3)` button showing the active count).
- `FacetGroup` — one vocabulary group rendered from API data: label, checkbox list
  with **live contextual counts** (within the current filter — see Behavior),
  `Show all (n)` expander past 6 values. **Renders whatever values the vocabulary
  query returns — no value list exists in source code.**
- `YearRangeInput` — two numeric fields (from/to), either may be blank.
- `RatingMinSelect` — `Any, ≥5, ≥6, ≥7, ≥8, ≥9`; a minimum maps to `ratingFrom`,
  which by API definition excludes unrated titles (microcopy under the control:
  `hides unrated`); `Any` includes them.
- `PeopleFilter` — chip list + `+ add person` inline mini-autocomplete (reuses
  `useUniversalSearch` in people-only mode) + ALL/ANY radio (labeled
  `match: all of these / any of these`; visible only with ≥2 people).
- `ActiveFilterChips` — the removable summary row.
- `SortSelect` — dropdown listing the documented sorts; **Popularity** default.
- `ResultsGrid` + `TitleCard` — poster (2:3, `PosterImage`), title, `year · ★rating`,
  up to 3 genre names muted. Whole card is one link to the title detail route.
- `Paginator` — Prev / `Page N of M` / Next; M = ⌈total ÷ 24⌉, rendered as
  `Page N of 417+` when `totalIsCapped` (the API stops counting at 10,000).
- `SearchFreshness` — the identical component from DES-2, mounted in the toolbar.

## Behavior

- **Facet vocabularies** (genres, title types) load once per view mount from the
  global `facets` query — the value lists; a new value appearing in the API appears
  in the UI with no code change. **Counts are contextual**: every `searchTitles`
  response carries `facets(dimensions: [GENRES, TITLE_TYPES], perDimension: 50)`
  evaluated within the current filter, and the rail re-renders its counts from it on
  each settled change (`perDimension: 50` covers both vocabularies fully). A value
  whose contextual count is zero stays in place, muted, still operable — positions
  never jump. With no filters set, contextual counts equal the global ones.
- **Every control writes state; state writes the URL** (replace, not push, for rapid
  changes — one history entry per settled change). Encoding as decided in
  `docs/architecture.md`: param names mirror `TitleSearchFilter` fields, multi-values
  are comma-separated, and **defaults are omitted** so canonical URLs stay short.
  Rail controls ⇄ params: genre checkboxes → `genres` (genresAny), type checkboxes →
  `types`, year fields → `yearFrom`/`yearTo`, rating minimum → `ratingFrom`, people
  chips → `people` (nconsts) + `peopleMode=ANY` (ALL is the default, omitted),
  Include adult → `adult=1`, sort → `sort` (omitted when `POPULARITY_DESC`), page →
  `page` (1-based, omitted when 1). The URL module also round-trips params v1 renders
  no control for (`q`, `genresAll`, `runtimeFrom`/`runtimeTo`, `ratingTo`,
  `votesFrom`, `cats`): they still filter results and appear as removable
  `ActiveFilterChips`, so a shared URL is never silently wider than the rail shows.
  Loading a URL fresh (signed in) reproduces the identical rail, chips, and grid.
- Genre and type checkboxes apply immediately (no Apply button); each change resets
  `page` to 1. `isAdult` is **excluded by default**; the `Include adult` checkbox is
  the only way in.
- **People filter**: typing in `+ add person` shows a person-only autocomplete
  (monogram rows, DES-2 anatomy); selecting adds a chip. With ≥2 chips the ALL/ANY
  radio appears, default **ALL** ("titles featuring all of these people" reads as the
  intuitive intent). Removing a chip below 2 hides the radio.
- **Sort** reorders using the documented server sorts only — no client-side sorting.
  `SortSelect` lists: Popularity (`POPULARITY_DESC`, default), Rating (`RATING_DESC`),
  Newest (`YEAR_DESC`), Oldest (`YEAR_ASC`); Relevance (`RELEVANCE`) appears only
  while a `q` param is active. The Rating option always sends `votesFrom: 1000`
  unless the URL carries its own `votesFrom` — the API's documented guard against
  ten-vote 9.9s; the implicit floor applies identically on fresh URL loads, so
  shared links stay deterministic.
- **Pagination** is deterministic server paging (stable tiebreaks server-side):
  Next/Prev walk `offset = (page − 1) × 24` with no duplicates or skips. Page changes
  scroll the grid to top. Prev disabled on page 1, Next on the last page; when
  `totalIsCapped`, the last reachable page is 417 (`offset` must stay ≤ 10,000 —
  deeper paging is rejected by the API) and the label reads `Page N of 417+`.
- Result count in the toolbar comes from `total` on the same response (no second
  query) and re-renders with every filter change; when `totalIsCapped` it reads
  `10,000+ titles` — the API stops counting at 10k.
- **Keyboard**: the rail is standard form controls in DOM order; the grid is a list
  of links (`Tab` walks cards, `Enter` opens); chips' `✕` are buttons. The mobile
  filter drawer traps focus and closes on Esc.
- **Images**: grid posters lazy-load; a page of 24 results issues at most 24 OMDb
  requests and only for scrolled-into-view cards.
- Grid: 6 columns ≥1200px, 4 ≥960px, 3 ≥720px, 2 below; page size fixed at 24
  (divides evenly at every breakpoint — a full page never has a ragged last row).

## Data needs

Verified against `imdb-federation/API-CHANGES.md` (landed, authoritative) — the names
below are real:

```graphql
# Global vocabularies — once per mount, cacheable (the rail's value lists):
facets {
  genres     { value count }
  titleTypes { value count }
}

# Results + contextual counts — one request per settled filter/sort/page change:
searchTitles(
  filter: {
    genresAny: [...]                 # genre checkboxes (cap 10)
    titleTypes: [...]
    startYearFrom: Int, startYearTo: Int
    ratingFrom: Float                # excludes unrated titles by definition
    includeAdult: false              # the default; true only via Include adult
    withPeople: [ID!]                # nconst chips (cap 20)
    peopleMode: ALL                  # ALL default; ANY via the radio
    peopleCategories: [...]          # `cats` URL param; no rail control in v1
  }
  sort: POPULARITY_DESC              # RELEVANCE | POPULARITY_DESC | RATING_DESC |
                                     # YEAR_DESC | YEAR_ASC
  limit: 24
  offset: 0                          # (page − 1) × 24, ≤ 10 000
) {
  total
  totalIsCapped                      # true → "10,000+ titles" / "Page N of 417+"
  items { tconst primaryTitle startYear titleType genres
          rating { averageRating numVotes } }
  facets(dimensions: [GENRES, TITLE_TYPES], perDimension: 50) {
    dimension
    values { value count }           # the rail's live contextual counts
  }
}

searchInfo { rebuiltAt }             # SearchFreshness (shared with DES-2); null =
                                     # index never built → the dedicated empty state
```

Validation failures (caps, exclusive fields, inverted ranges, `offset` > 10,000)
return GraphQL `BAD_REQUEST` errors, not empty results — they render the error state;
the URL module clamps before sending so no rail interaction can produce one.

**Governance (architecture § Field-level governance):** `Rating.numVotes` is
governed and currently denied to everyone. The `items` selection above **keeps it
optimistically** — the client strips denied coordinates and retries, the hook
returns `deniedFields` alongside `data`, and a grant flows through on the next
fresh fetch with no code change; the co-select rule holds (`averageRating` beside
`numVotes`). **No rendered element in this view depends on it**: `TitleCard` shows
`year · ★rating` (`averageRating`, ungoverned) and no vote count, so denial changes
nothing visible and this view never renders DES-8's restricted treatment. The
Rating sort's `votesFrom: 1000` guard and the `votesFrom` URL param are **filter
inputs evaluated server-side**, not field reads — field governance does not affect
them.

Operational note: until the user runs imdb-federation's `./scripts/rebuild.sh`
(verified never yet run — see `docs/architecture.md`), this entire view sits in the
index-never-built state; demoing or testing it requires that rebuild first.
