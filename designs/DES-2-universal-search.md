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
reuses verbatim. The unified `search(query, kinds, limit)` union has landed upstream
(`imdb-federation/API-CHANGES.md`, authoritative; see `docs/architecture.md`), so
**server-side ranking is the primary data path**: union hits render in server order
and the client invents no ordering. The brief's zero-backend stopgap — the aliased
prefix pair merged client-side — is demoted to the fill rule for partial-word typing
(Appendix A), riding in the same single request.

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
  missing from a stub simply drop out of the line. The votes parenthetical is
  **opportunistic**: `Rating.numVotes` is governed (denied to everyone today, per
  architecture § Field-level governance), so it renders only when the value is
  present — while denied it drops out silently exactly like any missing field, and
  no row ever renders DES-8's restricted treatment (a transient ranked list is
  explicitly outside its scope — DES-8 § where it deliberately doesn't apply).
  Nothing else in the row reads a governed field. Person rows: 40px `Monogram` disc,
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

No results, index never built (searchInfo.rebuiltAt is null —
a real, live-verified state of this system: every query returns
nothing until the first federation rebuild runs):
        ├────────────────────────────────────────┤
        │   The search index hasn’t been built   │
        │   yet — nothing is searchable until    │
        │   the first rebuild runs.              │
        ├────────────────────────────────────────┤
        │              Index not yet built  ⓘ    │

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
  never a guess. If `searchInfo` succeeds but `rebuiltAt` is `null`, the index has
  **never been built**: the footer reads `Index not yet built ⓘ` and the no-results
  body switches to the index-never-built copy above instead of blaming the user's
  query.

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
- `useUniversalSearch` — hook: debounced single aliased document; union hits in
  server order + prefix fill (Appendix A). People-only mode requests only the
  `people` alias (used by DES-3's `PeopleFilter`).

## Behavior

- **Trigger**: autocomplete fires at ≥2 characters, debounced **250ms** — observable
  as exactly one router request (the single aliased document) per settled keystroke
  burst. Under 2 characters the panel closes and no request is made.
- **Row assembly (union-first):** the panel's rows come from the unified
  `search(query: $q, limit: 8)` union in **server order** — the server interleaves
  titles and people and ranks them (text relevance, popularity breaking ties); the
  client branches on `__typename` and invents no ordering. Because the union matches
  whole words/stems, not prefixes (per `API-CHANGES.md`), a mid-word query like
  `godf` legitimately returns zero union hits: the remaining rows fill from the two
  prefix-backed aliases in the same document, ordered by Appendix A's rule and
  deduped by `tconst`/`nconst` against union hits. Union rows and fill rows are
  visually identical — the user sees one list.
- **Keyboard**: `/` or `Cmd/Ctrl+K` focuses the omnibox from anywhere. With the panel
  open: `↓`/`↑` move selection (wrapping), `Enter` opens the selected row (row 1 is
  preselected by default), `Esc` closes the panel (a second `Esc` blurs the input),
  `Tab` closes the panel and moves on. Typing always keeps focus in the input —
  selection moves, focus doesn't (ARIA combobox with `aria-activedescendant`).
- **Mouse**: hover moves selection; click opens the row. Clicking outside closes the
  panel. The input's `✕` clears text and closes the panel.
- **Navigation**: a title row navigates to `/title/:tconst`, a person row to
  `/person/:nconst` (decided in `docs/architecture.md` → "Frontend routing & URL
  scheme"). The route table also reserves `/search?q=…` for a full mixed-results
  page; that surface is not designed by this spec — the union field (`limit` up to
  50) is its ready-made data path if a follow-up spec picks it up.
- **Images**: thumbs lazy-load; at most 8 OMDb requests per rendered panel (one per
  title row), and none for rows never rendered.
- **Freshness fetch**: `searchInfo { rebuiltAt }` rides along in the same aliased
  document as the first autocomplete request after mount, then is cached in memory
  for 5 minutes (subsequent keystrokes don't refetch it).
- Selecting a result records nothing and clears nothing: the query text stays, so
  Back-then-refocus resumes where the user was.

## Data needs

Field names verified against `imdb-federation/API-CHANGES.md` (landed, authoritative).
One document, three aliases, one request per settled keystroke burst:

```graphql
query UniversalSearch($q: String!) {
  hits: search(query: $q, limit: 8) {    # PRIMARY — server-ranked union
    __typename                           # union SearchHit = Title | Name
    ... on Title {
      tconst          # OMDb poster key + /title/:tconst param
      primaryTitle
      startYear
      titleType       # rendered as Movie / Series / …
      rating { averageRating numVotes }
    }
    ... on Name {
      nconst          # /person/:nconst param + Monogram hash seed
      primaryName
      primaryProfession   # → professions metadata line (verify exact field/shape)
    }
  }
  titles: searchTitles(filter: { titlePrefix: $q }, limit: 8) {   # fill (Appendix A)
    items { tconst primaryTitle startYear titleType
            rating { averageRating numVotes } }
  }
  people: searchNames(filter: { namePrefix: $q }, limit: 4) {     # fill (Appendix A)
    items { nconst primaryName primaryProfession }
  }
  searchInfo { rebuiltAt }   # ISO timestamp, or null = never built — folded IMDB-13
}
```

Notes: (1) name popularity is now **materialized server-side** (`searchNames` defaults
to `POPULARITY_DESC` = sum of known-for vote counts), so both fill lists arrive in true
popularity order and the client never compares popularity across lists; (2) poster URLs
are constructed client-side as `https://img.omdbapi.com/?i=<tconst>&apikey=db1f8efc`
(key public by design); (3) the union excludes adult titles, and both the union query
and the prefix filters require ≥2 characters — matching the panel's ≥2-char trigger;
(4) **governance**: `Rating.numVotes` is governed (denied to everyone today). The
document **keeps selecting it optimistically** per architecture § Field-level
governance — the client strips denied coordinates and retries, so a live grant makes
vote counts appear in rows on the next settled keystroke with no code change. The
co-select rule holds (`averageRating` beside `numVotes`), no rendered element
*depends* on it (the parenthetical is opportunistic, ranking and fill order are
server-side), and the accepted cost is one extra round trip per autocomplete fetch
while denied — bounded by the strip-and-retry mechanism, invisible in the panel
(rows render from the retried response like any other).

## Appendix A — prefix fill order (the demoted client merge)

Until the union field shipped, this heuristic *was* the row order; it is now only the
order in which prefix-only hits fill the rows the union leaves empty (all 8 of them
while the user is mid-word). Both prefix lists arrive popularity-sorted server-side:
**take 2 titles, then 1 person, repeating, preserving each list's server order,
skipping ids already shown as union hits, until 8 rows are filled; when either list
runs out, fill from the other.** The old exact-name promotion rule is retired — an
exactly-typed name is a whole word, so the union's server relevance ranks it first
without client help. If the union ever gains prefix semantics, delete this appendix
and the two fill aliases; the change stays contained in `useUniversalSearch`.
