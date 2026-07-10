---
id: DES-3
title: Faceted title search — the stacks
status: draft
tickets: [IMDB-6]
---

## Intent

Where the omnibox is the front door, this view is the stacks: a title-only search over
`searchTitles` where every filter control is populated from the backend's typed facet
vocabularies **with counts** — the UI never knows what genres exist, it only knows how
to render whatever the API says exists, and the counts turn filtering into browsing
("Horror (12,340)" is an invitation, not a form field). The entire view state —
filters, sort, page — reads as shareable state: change anything and the URL changes,
load the URL and the view reproduces. The URL *encoding* is the architect's routing
decision; this spec defines the state dimensions that must round-trip and everything
visual/behavioral around them. Status is `draft` until that decision lands.

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
Loading (first load / filter change):     Grid shows 10 skeleton
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
```

## Components

- `TitleSearchView` — page: rail + toolbar + grid + pagination; owns URL↔state sync.
- `FilterRail` — the left rail (collapsible drawer below 960px, opened by a
  `Filters (3)` button showing the active count).
- `FacetGroup` — one vocabulary group rendered from API data: label, checkbox list
  with counts, `Show all (n)` expander past 6 values. **Renders whatever values the
  vocabulary query returns — no value list exists in source code.**
- `YearRangeInput` — two numeric fields (from/to), either may be blank.
- `RatingMinSelect` — `Any, ≥5, ≥6, ≥7, ≥8, ≥9`.
- `PeopleFilter` — chip list + `+ add person` inline mini-autocomplete (reuses
  `useUniversalSearch` in people-only mode) + ALL/ANY radio (labeled
  `match: all of these / any of these`; visible only with ≥2 people).
- `ActiveFilterChips` — the removable summary row.
- `SortSelect` — dropdown listing the documented sorts; **Popularity** default.
- `ResultsGrid` + `TitleCard` — poster (2:3, `PosterImage`), title, `year · ★rating`,
  up to 3 genre names muted. Whole card is one link to the title detail route.
- `Paginator` — Prev / `Page N of M` / Next.
- `SearchFreshness` — the identical component from DES-2, mounted in the toolbar.

## Behavior

- **Facet vocabularies** (genres, title types) load once per view mount from the
  typed facet fields, each value with its count; a new value appearing in the API
  appears in the UI with no code change.
- **Every control writes state; state writes the URL** (replace, not push, for rapid
  changes — one history entry per settled change). The state dimensions that must
  round-trip through the URL: `genres[]`, `types[]`, `yearFrom`, `yearTo`,
  `ratingMin`, `people[]` (ids) + `peopleMatch (ALL|ANY)`, `includeAdult`, `sort`,
  `page`. Loading a URL fresh (signed in) reproduces the identical rail, chips, and
  grid. Encoding syntax: architect's routing decision.
- Genre and type checkboxes apply immediately (no Apply button); each change resets
  `page` to 1. `isAdult` is **excluded by default**; the `Include adult` checkbox is
  the only way in.
- **People filter**: typing in `+ add person` shows a person-only autocomplete
  (monogram rows, DES-2 anatomy); selecting adds a chip. With ≥2 chips the ALL/ANY
  radio appears, default **ALL** ("titles featuring all of these people" reads as the
  intuitive intent). Removing a chip below 2 hides the radio.
- **Sort** reorders using the documented server sorts only — no client-side sorting.
- **Pagination** is deterministic server paging: Next/Prev walk pages with no
  duplicates or skips; `Page N of M` uses the count variant. Page changes scroll the
  grid to top. Prev disabled on page 1, Next on the last page.
- Result count in the toolbar comes from the with-total count variant (the brief's
  2-aggregate shape) and re-renders with every filter change.
- **Keyboard**: the rail is standard form controls in DOM order; the grid is a list
  of links (`Tab` walks cards, `Enter` opens); chips' `✕` are buttons. The mobile
  filter drawer traps focus and closes on Esc.
- **Images**: grid posters lazy-load; a page of 20 results issues at most 20 OMDb
  requests and only for scrolled-into-view cards.
- Grid: 5 columns ≥1200px, 4 ≥960px, 3 ≥720px, 2 below; page size fixed at 20.

## Data needs

To verify by introspection / `API-CHANGES.md` (names below are the brief's, not
gospel):

```graphql
# Vocabularies — typed facet fields materialized from search_facets:
facets {
  genres     { value count }
  titleTypes { value count }
}

# Results:
searchTitles(
  filter: {
    genres: [...]            # array semantics per API-CHANGES
    titleTypes: [...]
    yearFrom: Int, yearTo: Int
    ratingMin: Float
    isAdult: false           # excluded unless Include adult
    withPeople: { ids: [...], match: ALL|ANY }
  }
  sort: POPULARITY           # default; SortSelect lists the documented enum
  page/first+after: …        # deterministic paging per API-CHANGES
) {
  items { id primaryTitle startYear titleType genres
          rating { averageRating numVotes } }
  totalCount                 # count variant (2 aggregates)
}

searchInfo { rebuiltAt }     # SearchFreshness (shared with DES-2)
```

Assumptions the architect/`API-CHANGES.md` must confirm: the facet vocabulary query's
shape (one field per facet with `value`+`count`), year/rating filter availability on
`searchTitles`, the paging model (offset pages vs cursors — the Paginator needs
`Page N of M`, which needs the total), and the sort enum's members.
