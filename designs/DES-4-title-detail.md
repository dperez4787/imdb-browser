---
id: DES-4
title: Title detail — one-sheet page
status: approved
tickets: [IMDB-7]
---

## Intent

A title's page is its one-sheet: poster on the left, the facts a person actually asks
for (year, runtime, rating, genres) stated once at the top, and then the people — cast
and crew grouped by what they did — as the page's main body, because in Marquee every
person listed is a door to somewhere else. Density is deliberately moderate: this is a
lobby card, not a database dump — full credits render, but grouped and scannable, with
no tabs and no accordion to learn. Genre chips hop into the faceted view (DES-3) so
even metadata is a door. The page must be shareable (stable URL, direct load works)
and must degrade exactly as specified when the poster, the person pages, or the title
itself are missing.

## Layout

### Happy path — `/title/:tconst`

```
┌──────────────────────────────────────────────────────────────────┐
│ MARQUEE ●   [ 🔍 compact omnibox ]                        💬 (DP)│
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────┐   The Godfather                                    │
│   │         │   1972 · Movie · 2h 55m          ★ 9.2             │
│   │ poster  │                                  2.1M votes        │
│   │  2:3    │   [Crime] [Drama]                ← GenreChips      │
│   │ 260px   │                                                    │
│   │         │                                                    │
│   └─────────┘                                                    │
│                                                                  │
│   DIRECTOR                                                       │
│   (FC) Francis Ford Coppola                                      │
│                                                                  │
│   WRITERS                                                        │
│   (MP) Mario Puzo        (FC) Francis Ford Coppola               │
│                                                                  │
│   CAST                                                           │
│   (MB) Marlon Brando         Don Vito Corleone                   │
│   (AP) Al Pacino             Michael Corleone                    │
│   (JC) James Caan            Sonny Corleone                      │
│   (RD) Robert Duvall         Tom Hagen                           │
│   …                                                              │
│                                                                  │
│   PRODUCERS / OTHER CREW (one group per category in the data)    │
│   (AR) Albert S. Ruddy                                           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

- Header: `primaryTitle` (h1). Fact line: `startYear · titleType · runtime`, each
  segment dropping out silently if absent. Rating block right-aligned: amber `★ 9.2`
  large, `numVotes` compact-formatted beneath, whole block absent if no rating.
- `GenreChips`: one chip per genre; each links to the faceted view pre-filtered to
  that genre (`/titles?…genre…` per the routing decision). **Until IMDB-6 ships, the
  chips render as static (non-link) chips** — same look, no anchor; flipping them to
  links is part of IMDB-6's landing, not this page's.
- Credits: **one group per crew category present in the data, in this order when
  present: directors, writers, cast, then remaining categories in API order.** Group
  headers are the category names from the data (uppercased) — never a hard-coded
  category list; unknown categories simply render as their own group. Cast entries
  show character name(s) right of the person, muted. Groups with no members don't
  render.
- Each person entry is an `EntityChip` (`Monogram` + name — DES-6 owns any visual
  upgrade). **Before IMDB-8 lands, person chips render non-interactive**: same
  anatomy, no anchor, default cursor, not in tab order — nothing 404s. IMDB-8's
  landing activates them into links to the person route.
- Below 720px the poster centers above the header and groups stack full-width.

### States

```
Loading:            Poster-sized skeleton + 2 header text skeleton
                    lines + 3 group-header skeletons. No layout
                    shift when data lands.

Poster missing/404: FallbackArt (DES-1) at full poster size —
                    gradient + title initials + film glyph.

Not found (unknown/invalid id):
│        This title isn’t in the index.                  │
│        It may not exist, or the index may not          │
│        have it yet (Index rebuilt 3 h ago).            │
│        [ ← Back ]   [ Search instead ]                 │
                    (Search focuses the omnibox.)

Error (query fails):
│        ⚠ Couldn’t load this title.  [ Retry ]          │

Partial data:       Any absent field drops its segment/block
                    silently (no “N/A” text anywhere on the page).
```

## Components

- `TitleDetailPage` — route component; owns the query + state switch
  (loading / not-found / error / page).
- `TitleHeader` — poster (`PosterImage`), h1, fact line, `RatingBlock`, `GenreChips`.
- `RatingBlock` — amber star + rating + compact votes (reusable; DES-3's cards use
  the inline variant).
- `GenreChip` — genre pill; link or static variant per IMDB-6 availability.
- `CreditGroup` — category header + entries.
- `PersonEntity` — `EntityChip` for a person (+ optional character text);
  `interactive` prop gates the link (IMDB-8).
- `NotFoundState`, `ErrorState` — shared page-level states (DES-5 reuses both).

## Behavior

- Direct-loading `/title/:tconst` while signed in renders the identical page reached
  by clicking a search result; the URL is stable and shareable. (Route literal per
  the architect's routing decision; this spec assumes `/title/:tconst`.)
- Document title becomes `The Godfather (1972) — Marquee` on load.
- One GraphQL query per page view; the poster is one OMDb request (this page's OMDb
  budget is exactly 1).
- Genre chip click (once IMDB-6 exists) navigates to the faceted view with only that
  genre applied.
- Person chip click (once IMDB-8 exists) navigates to that person's page. Before
  that: not focusable, not clickable, visually identical minus hover affordance.
- Keyboard: focus order is header → genre chips → credit entries in reading order;
  all interactive elements are anchors reachable by Tab, activated by Enter.
- Scroll position resets to top on navigation to this page.
- Long cast lists render fully (no pagination); character text truncates to one line
  with ellipsis and full text in `title`.

## Data needs

One query, field names introspection-verified (entity stubs hydrate through
federation per the brief, so any `Title` field is selectable):

```graphql
query TitleDetail($id: ID!) {
  title(id: $id) {              # exact root field per API-CHANGES / introspection
    id
    primaryTitle
    startYear
    titleType
    runtimeMinutes
    genres
    rating { averageRating numVotes }
    credits {                   # shape to verify: assumed grouped or flat
      category                  # e.g. director / writer / actor / actress …
      person { id primaryName } # Name stub via federation
      characters                # cast only; may be absent
    }
  }
}
```

Assumptions to confirm against `docs/architecture.md` / `API-CHANGES.md`: the root
field for a single title by id, and the credits shape (flat list with `category`
assumed — if the API groups differently, `CreditGroup` consumes whatever grouping
exists; the design needs `category`, person stub (`id`, `primaryName`), and
`characters` where present). Not-found must be distinguishable from error (null
result vs GraphQL error).
