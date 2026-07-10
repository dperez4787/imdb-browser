---
id: DES-2
title: Universal search — one omnibox, interleaved results, honest freshness
status: approved
tickets: [IMDB-5, IMDB-13]
---

## Intent

One search box is the product's front door and its only search input: type a prefix,
get titles and people **interleaved in one popularity-ranked list**, posters and all,
and hop straight to a detail page. It lives in the TopBar on every view and as a
larger hero on the home route, but it is the *same* component with the same behavior.
The index-freshness caveat (`searchInfo.rebuiltAt`, IMDB-13) is folded in here as the
autocomplete panel's footer — the honest small print at the exact moment the user is
trusting the index — via a component (`SearchFreshness`) that DES-3's faceted view
reuses verbatim. This spec implements the brief's zero-backend stopgap (aliased
`searchTitles` + `searchNames` in one request, merged client-side) and documents the
merge heuristic so the developer decides nothing.

## Layout

### Home route `/` — hero omnibox

```
┌────────────────────────────────────────────────────────────┐
│ MARQUEE ●   [ compact omnibox hidden on / ]         💬 (DP)│
│                                                            │
│                       MARQUEE ●                            │
│        ┌────────────────────────────────────────┐          │
│        │ 🔍  Search titles & people…        /   │          │
│        └────────────────────────────────────────┘          │
│              Browse all titles →  (link to /titles)        │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

The home route is the search page: wordmark, hero omnibox (max-width 640px,
centered, auto-focused), and one quiet link into the faceted view (DES-3). Nothing
else — no data is fetched until the user types.

### Autocomplete panel — results (anchored under whichever omnibox is focused)

```
        ┌────────────────────────────────────────┐
        │ 🔍  godf|                          ✕   │
        ├────────────────────────────────────────┤
        │ ┌──┐  The Godfather                    │ ← selected row:
        │ │▓▓│  1972 · Movie · ★ 9.2  (2.1M)     │   amber left edge +
        │ └──┘                                   │   raised background
        │ ┌──┐  The Godfather Part II            │
        │ │▓▓│  1974 · Movie · ★ 9.0  (1.4M)     │
        │ └──┘                                   │
        │ (FC)  Francis Ford Coppola             │ ← person: monogram
        │       Director · Writer                │   disc (DES-6 owns
        │ ┌╌╌┐  Godfather of Harlem              │   any upgrade)
        │ │GH│  2019 · Series · ★ 8.1  (34K)     │ ← FallbackArt tile
        │ └╌╌┘                                   │   (poster missing)
        │ (AG)  Andy García                      │
        │       Actor · Producer                 │
        ├────────────────────────────────────────┤
        │              Index rebuilt 3 h ago  ⓘ  │ ← SearchFreshness
        └────────────────────────────────────────┘
```

- Max **8 rows**. Title rows: 40×60 poster thumb (`PosterImage`, 2:3), primary title,
  muted metadata line `year · type · ★ rating (votes, compact e.g. 2.1M)`; fields
  missing from a stub simply drop out of the line. Person rows: 40px `Monogram` disc,
  primary name, muted professions (e.g. `Actor · Director`, max 3, fallback word
  `Person`).
- Rows are visually interleaved in one list — **no "Titles" / "People" section
  headers**; the type is legible from the row anatomy itself (poster vs disc).

### States

```
Loading (first open, <8 chars typed then settled):
        ├────────────────────────────────────────┤
        │ ▒▒▒  ▒▒▒▒▒▒▒▒▒▒▒▒                      │  3 skeleton rows,
        │ ▒▒▒  ▒▒▒▒▒▒▒▒                          │  shimmer
        │ ▒▒▒  ▒▒▒▒▒▒▒▒▒▒                        │
        ├────────────────────────────────────────┤

Loading (query changed while results shown):
        previous rows stay, at full opacity; a 2px amber
        progress bar animates along the panel's top edge.

No results:
        ├────────────────────────────────────────┤
        │   Nothing matches “zzyzx”.             │
        │   Search matches how titles and names  │
        │   begin — try a shorter prefix.        │
        ├────────────────────────────────────────┤
        │              Index rebuilt 3 h ago  ⓘ  │

Error:
        ├────────────────────────────────────────┤
        │   ⚠ Search isn’t responding.           │
        │   [ Retry ]                            │
        ├────────────────────────────────────────┤
        (no freshness footer — nothing to vouch for)

Poster missing/404:  that row's thumb renders FallbackArt
(gradient + initials + film glyph). Never a broken image.
```

- **Freshness footer** (`SearchFreshness`): one muted right-aligned line. Format:
  `Index rebuilt <relative> ago` when under 24h (`3 h ago`, `45 min ago`,
  `just now` under 60s); `Index rebuilt <Mon D>` when older. Hovering/focusing the
  `ⓘ` shows the absolute timestamp (title attribute is sufficient). If `searchInfo`
  is unavailable or errors, **the footer row does not render at all** — absence,
  never a guess.

### Compact omnibox (TopBar, every non-home route) and mobile

Same component, same panel, anchored below the TopBar input (panel width 480px,
right-aligned to the input). Below 720px: the TopBar shows a search icon button;
tapping it opens a full-width input row overlaying the TopBar with the panel
full-width beneath; `✕`/Esc closes it.

## Components

- `Omnibox` — the input (hero and compact are size variants of one component);
  owns debounce and open/close state; ARIA combobox pattern.
- `AutocompletePanel` — listbox popup: rows, skeletons, no-results, error, footer.
- `SearchHitRow` — one result row; `variant: title | person`.
- `PosterImage` / `FallbackArt` / `Monogram` — shared (DES-1).
- `SearchFreshness` — the footer line; **exported standalone** so DES-3 mounts the
  identical component above its results grid.
- `useUniversalSearch` — hook: debounced aliased query + client-side merge (below).

## Behavior

- **Trigger**: autocomplete fires at ≥2 characters, debounced **250ms** — observable
  as exactly one router request (the single aliased document) per settled keystroke
  burst. Under 2 characters the panel closes and no request is made.
- **Merge heuristic (documented; replaceable when the union `search` field ships):**
  both lists are requested pre-sorted by popularity server-side (`searchTitles`
  default POPULARITY sort; `searchNames` popularity sort), 8 titles + 4 people.
  Because name popularity is not yet a queryable field, the client cannot compare
  numbers across lists; it merges positionally instead: **take 2 titles, then 1
  person, repeating, preserving each list's server order, until 8 rows are filled;
  when either list runs out, fill from the other.** One exception: if a person's
  `primaryName` equals the query case-insensitively, that person is promoted to row 1.
  Rationale: title popularity dominates in practice (this mirrors IMDb's own bar),
  and the exact-name rule catches "searched for a specific person". When
  name-popularity becomes queryable, replace the positional rule with a true numeric
  merge on comparable popularity values — a one-function change inside
  `useUniversalSearch`.
- **Keyboard**: `/` or `Cmd/Ctrl+K` focuses the omnibox from anywhere. With the panel
  open: `↓`/`↑` move selection (wrapping), `Enter` opens the selected row (row 1 is
  preselected by default), `Esc` closes the panel (a second `Esc` blurs the input),
  `Tab` closes the panel and moves on. Typing always keeps focus in the input —
  selection moves, focus doesn't (ARIA combobox with `aria-activedescendant`).
- **Mouse**: hover moves selection; click opens the row. Clicking outside closes the
  panel. The input's `✕` clears text and closes the panel.
- **Navigation**: a title row navigates to the title detail route, a person row to
  the person detail route. This spec assumes `/title/:tconst` and `/name/:nconst`;
  the literal scheme follows the architect's routing decision in
  `docs/architecture.md` — the developer reads it there, not here.
- **Images**: thumbs lazy-load; at most 8 OMDb requests per rendered panel (one per
  title row), and none for rows never rendered.
- **Freshness fetch**: `searchInfo { rebuiltAt }` rides along in the same aliased
  document as the first autocomplete request after mount, then is cached in memory
  for 5 minutes (subsequent keystrokes don't refetch it).
- Selecting a result records nothing and clears nothing: the query text stays, so
  Back-then-refocus resumes where the user was.

## Data needs

One aliased document (field names to be verified against the live router /
`API-CHANGES.md` before implementation, per the ticket):

```graphql
query UniversalSearch($q: String!) {
  titles: searchTitles(
    filter: { titlePrefix: $q }        # sort: POPULARITY is the default
    first: 8
  ) {
    items {
      id            # tconst — OMDb poster key + route param
      primaryTitle
      startYear
      titleType     # rendered as Movie / Series / …
      rating { averageRating numVotes }
    }
  }
  people: searchNames(
    filter: { namePrefix: $q }
    sort: POPULARITY
    first: 4
  ) {
    items {
      id            # nconst — route param + Monogram hash seed
      primaryName
      primaryProfession   # → professions metadata line (verify field name/shape)
    }
  }
  searchInfo { rebuiltAt }   # ISO timestamp assumed; folded IMDB-13
}
```

Gaps this spec depends on the brief's stated facts for: (1) **name popularity is not
queryable** — handled by the documented positional merge; (2) poster URLs are
constructed client-side as `https://img.omdbapi.com/?i=<tconst>&apikey=db1f8efc`
(key public by design); (3) exact filter/sort/paging argument names are
introspection-verified by the developer, not guessed from this spec.
