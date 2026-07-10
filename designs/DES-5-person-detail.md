---
id: DES-5
title: Person detail — billing page
status: approved
tickets: [IMDB-8]
---

## Intent

A person's page is their billing: who they are in one header line, the work they're
known for as a poster strip you can walk (because their work *does* have images even
though they don't), and the full filmography grouped by what they did, newest first.
This page completes the wander loop — search → person → title → cast → person — so
every title on it is a door back into DES-4. It ships with the deliberate no-photo
identity: a large `Monogram` disc (deterministic hue from the person id, initials from
the name), which DES-6 may later upgrade to a known-for poster mosaic **without
changing this page's layout** — the header reserves one square visual slot either way.

## Layout

### Happy path — `/name/:nconst`

```
┌──────────────────────────────────────────────────────────────────┐
│ MARQUEE ●   [ 🔍 compact omnibox ]                        💬 (DP)│
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────┐   Al Pacino                                        │
│   │  (AP)   │   1940 –                                           │
│   │ monogram│   Actor · Producer · Director                      │
│   │ 160×160 │                                                    │
│   └─────────┘   ← PersonVisual slot (DES-6 may upgrade)          │
│                                                                  │
│   KNOWN FOR                                                      │
│   ┌────┐   ┌────┐   ┌╌╌╌╌┐   ┌────┐                              │
│   │▓▓▓▓│   │▓▓▓▓│   │ SC │   │▓▓▓▓│      ← poster cards,         │
│   │▓▓▓▓│   │▓▓▓▓│   │fall│   │▓▓▓▓│        horizontal strip      │
│   └────┘   └────┘   └back┘   └────┘                              │
│   The Godf… Scarface  Serpico  Heat                              │
│   1972 ★9.2 1983 ★8.3 1973 ★7.7 1995 ★8.3                        │
│                                                                  │
│   FILMOGRAPHY                                                    │
│                                                                  │
│   ACTOR                                                          │
│   ┌──┐ House of Gucci        2021   Aldo Gucci        ★ 6.6      │
│   ┌──┐ The Irishman          2019   Jimmy Hoffa       ★ 7.8      │
│   ┌──┐ …                                                         │
│                                                                  │
│   DIRECTOR                                                       │
│   ┌──┐ Looking for Richard   1996                     ★ 7.3      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

- Header: `PersonVisual` slot (square, 160px; in this ticket it renders the
  `Monogram` disc), name (h1), lifespan line (`1940 –` living, `1940 – 2015` dead,
  absent if no birth year), professions muted (max 3).
- **Known for**: horizontal strip of up to 4 `TitleCard`s (same card as DES-3:
  poster 2:3 ~120px wide, title one line ellipsized, `year ★rating`). Sourced from
  the person's known-for field; if the API exposes no known-for field, the strip
  falls back to the 4 filmography titles with the highest `numVotes`. If fewer than
  2 candidates exist, the section doesn't render (a one-poster "strip" looks broken).
- **Filmography**: one group per credit category the person has (ACTOR, DIRECTOR,
  WRITER, … — headers from the data, never hard-coded), acting categories first,
  then remaining categories in API order; rows within a group sorted by year
  descending, unknown years last. Row anatomy: 32×48 poster thumb (`PosterImage`),
  title (link to DES-4), year, character(s) muted (when present), `★ rating` right.
- Every title element (known-for card, filmography row) links to the title detail
  route — cross-navigation back is DES-4's person chips activating with this ticket.
- Below 720px: header stacks (visual above name), known-for strip scrolls
  horizontally, filmography rows drop the rating column.

### States

```
Loading:            Header: square skeleton + 2 text lines.
                    Known-for: 4 poster-card skeletons.
                    Filmography: 6 row skeletons.

Not found (unknown/invalid id):
│        This person isn’t in the index.                 │
│        [ ← Back ]   [ Search instead ]                 │

Error:              ⚠ Couldn’t load this person.  [ Retry ]
                    (shared ErrorState from DES-4)

Poster missing:     Any thumb/card falls back to FallbackArt
                    (film glyph + title initials). The header
                    Monogram cannot fail — it is generated, not
                    fetched; that is the point.

Empty filmography:  A single muted line under the header:
                    “No credited titles in the index.”
                    Known-for strip absent.
```

## Components

- `PersonDetailPage` — route component; query + loading/not-found/error/page switch.
- `PersonHeader` — `PersonVisual` slot + name + lifespan + professions.
- `PersonVisual` — the square identity slot; v1 renders `Monogram` (DES-1) at 160px;
  DES-6 upgrades its internals without changing its box.
- `KnownForStrip` — up to 4 `TitleCard`s (component shared with DES-3).
- `FilmographyGroup` — category header + `FilmographyRow`s.
- `FilmographyRow` — thumb + title link + year + characters + rating.
- `NotFoundState`, `ErrorState` — shared with DES-4.

## Behavior

- Direct-loading `/name/:nconst` signed in renders the same page as arriving via
  search or via a title's cast chip; URL stable and shareable (route literal per the
  architect's routing decision; this spec assumes `/name/:nconst`).
- Document title: `Al Pacino — Marquee`.
- Clicking any known-for card or filmography row navigates to that title's page;
  landing back here from a title's cast works — both directions observable.
- OMDb budget for this page: **4 known-for posters (eager, they're above the fold) +
  filmography thumbs lazy-loaded on scroll only.** No OMDb request is made for the
  header visual in this ticket (Monogram is generated).
- Keyboard: visual slot is not focusable (decorative, `aria-hidden`); focus order is
  name → known-for cards → filmography rows; all links Tab-reachable, Enter-activated.
- Long filmographies render fully; no pagination.
- Scroll resets to top on navigation here.

## Data needs

Field names introspection-verified; the `Name` entity hydrates through federation so
any field is selectable — **which of these fields exist is exactly what the architect
is verifying for DES-6/IMDB-9**, and this page is designed to work with either
outcome:

```graphql
query PersonDetail($id: ID!) {
  name(id: $id) {                 # exact root field per introspection
    id
    primaryName
    birthYear
    deathYear
    primaryProfession
    knownFor {                    # ASSUMPTION A: known-for title stubs exposed
      id primaryTitle startYear rating { averageRating numVotes }
    }
    credits {                     # ASSUMPTION B: filmography with categories
      category
      characters                  # when present
      title { id primaryTitle startYear rating { averageRating numVotes } }
    }
  }
}
```

- **Assumption A** (`knownFor` as hydrated Title stubs — IMDb datasets carry
  `knownForTitles` tconsts, so some form should exist): if absent, `KnownForStrip`
  derives from top-4 filmography by `numVotes` as specified above — no design change.
- **Assumption B** (a credits/filmography connection from Name to Title with
  `category` and optional `characters`): this one is **load-bearing** — the page has
  no filmography without it. It is the reverse edge of DES-4's title credits, which
  the brief's "people ↔ titles cross-navigation is cheap through federation" promise
  implies; confirm the actual field in `docs/architecture.md` / `API-CHANGES.md`.
- Not-found vs error must be distinguishable (null vs GraphQL error), as in DES-4.
