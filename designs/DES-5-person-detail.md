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
  `Monogram` disc), name (h1), lifespan line, professions muted (max 3).
- **Lifespan line** — `Name.birthYear` and `Name.deathYear` are **governed slots**
  (both currently denied to everyone), so the line has two families of state that
  must never look alike (DES-8's two-rule contract):
  - *Values known, nothing denied* (unchanged): `1940 –` living, `1940 – 2015`
    dead; **no recorded birth year and nothing denied → line absent** (ordinary
    missing data — renders nothing).
  - *Any lifespan coordinate in `deniedFields` → the line always renders*, with
    each denied year slot showing the inline `RestrictedValue` pill (DES-8, width
    hint `2.5em`, labels "Birth year" / "Death year"): birth denied →
    `▨▨🔒▨▨ – 2015`; death denied → `1940 – ▨▨🔒▨▨` (living vs. dead is unknowable
    while denied — the redaction says exactly that); **both denied → the
    line-level variant**, one pill + small-caps `RESTRICTED` word, label
    "Lifespan". A year that is genuinely absent while the other is denied follows
    its ordinary missing rule within the line.
- **Known for**: horizontal strip of up to 4 `TitleCard`s (same card as DES-3:
  poster 2:3 ~120px wide, title one line ellipsized, `year ★rating`). Sourced from
  `Name.knownForTitles` (≤4 hydrated titles, dataset order — live-verified for
  DES-6, see architecture § Person visuals), rendered in that order. **The strip
  never reads `numVotes`** — the old top-4-by-`numVotes` filmography fallback is
  retired (its trigger, "no known-for field", is disproven, and its ranking field
  is governed). If fewer than 2 known-for titles exist, the section doesn't render
  (a one-poster "strip" looks broken).
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

Restricted lifespan (the live default today — both years denied):
   ┌─────────┐   Al Pacino
   │  (AP)   │   ▨▨▨🔒▨▨▨ RESTRICTED   ← line-level RestrictedValue
   │ monogram│   Actor · Producer · Director        (DES-8)
   └─────────┘
                    One year denied: that slot alone shows the
                    inline pill (▨▨🔒▨▨ – 2015 / 1940 – ▨▨🔒▨▨).
                    Page otherwise identical to the happy path.
                    Distinct by construction from “no recorded
                    birth year” (line absent entirely). A grant
                    flip swaps pill ↔ year in place on the next
                    fresh fetch — the line renders in both states,
                    zero layout jump (sole edge: a grant revealing
                    a genuinely absent birth year collapses the
                    line per the ordinary missing rule — DES-8).
```

## Components

- `PersonDetailPage` — route component; query + loading/not-found/error/page switch.
- `PersonHeader` — `PersonVisual` slot + name + lifespan + professions. Consumes
  the hook's `deniedFields` via `isRestricted(…)` for `Name.birthYear` /
  `Name.deathYear` and renders `RestrictedValue` (DES-8) per the lifespan rules
  above.
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
  When the lifespan is restricted, its `RestrictedValue` pill(s) sit between name and
  known-for cards in the tab order (focus opens the tooltip, Esc closes — DES-8).
- Long filmographies render fully; no pagination.
- Scroll resets to top on navigation here.

## Data needs

Field names introspection-verified; the `Name` entity hydrates through federation so
any field is selectable. `knownForTitles` is live-verified (architecture § Person
visuals — ≤4 hydrated titles in the same query, zero extra GraphQL cost):

```graphql
query PersonDetail($id: ID!) {
  name(id: $id) {                 # exact root field per introspection
    id
    primaryName
    birthYear                     # GOVERNED — selected optimistically, see below
    deathYear                     # GOVERNED — selected optimistically, see below
    primaryProfession
    knownForTitles {              # VERIFIED (retires former Assumption A / knownFor)
      tconst primaryTitle startYear rating { averageRating numVotes }
    }                             # strip renders in dataset order; numVotes is for
                                  # DES-6's card pick only, never read by this page
    credits {                     # ASSUMPTION B: filmography with categories
      category
      characters                  # when present
      title { id primaryTitle startYear rating { averageRating numVotes } }
    }
  }
}
```

- **Governance (architecture § Field-level governance):** `Name.birthYear`,
  `Name.deathYear`, and `Rating.numVotes` are governed and currently denied to
  everyone. The query **keeps selecting them optimistically** — the client strips
  denied coordinates and retries, the hook returns `deniedFields` alongside `data`,
  and a live grant appears on the next fresh fetch with no code change. Co-select
  rule satisfied: the governed leaves sit beside ungoverned siblings (`primaryName`
  etc.; `averageRating` beside `numVotes`), so a strip never empties an object.
  **Nothing this page renders depends on a governed field**: the lifespan slots
  show DES-8's treatment under denial, the known-for strip uses dataset order, and
  the ★ ratings shown everywhere read `averageRating` (ungoverned).
- **Former Assumption A is retired**: `knownForTitles` exists and hydrates (verified
  live); the top-4-by-`numVotes` filmography fallback is deleted rather than kept —
  its ranking field is governed and its trigger condition is disproven.
- **Assumption B** (a credits/filmography connection from Name to Title with
  `category` and optional `characters`): this one is **load-bearing** — the page has
  no filmography without it. It is the reverse edge of DES-4's title credits, which
  the brief's "people ↔ titles cross-navigation is cheap through federation" promise
  implies; confirm the actual field in `docs/architecture.md` / `API-CHANGES.md`.
- Not-found vs error must be distinguishable (null vs GraphQL error), as in DES-4.
  A governance denial is neither: the strip-and-retry means the page renders with
  `deniedFields` set — kind `denied` reaches this page only if a retry is denied
  again, which renders the shared error state.
