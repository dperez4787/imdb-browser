---
id: DES-6
title: Person visual treatment — known-for mosaic, monogram floor
status: approved
tickets: [IMDB-9]
---

## Intent

People have **no images, ever** — OMDb serves title posters only and no people-image
endpoint will exist. Marquee turns that constraint into the identity: *a person is
shown as their work.* This spec realizes the brief's "Open idea" — represent a person
with the posters of titles they were part of — as a **tiered treatment**: a 2×2
known-for poster mosaic where the surface justifies the cost, and the deterministic
`Monogram` disc (already shipped by DES-1/2/5) everywhere else and as the universal
degraded state. The architect has verified every feasibility gate (`docs/architecture.md`
→ "Person visuals — data facts & OMDb budget", live-checked 2026-07-10):
`Name.knownForTitles` hydrates ≤4 titles in the same query at zero extra GraphQL
cost, and the proposed OMDb budgets are adopted as written. **The tier table below is
therefore the decision, not a proposal** — mosaic on the person page header, single
poster + monogram badge on person cards, monogram in autocomplete and as the floor of
every ladder. "Monogram everywhere" survives only as the designed degraded state, not
as an open alternative.

## The tiers (per surface — this is the decision)

| Surface | Treatment | OMDb budget | Why |
|---|---|---|---|
| Autocomplete person rows (DES-2) | `Monogram` 40px — **never mosaic** | 0 | Autocomplete renders on every keystroke; N extra poster requests per keystroke is the wrong trade, and at 40px a mosaic is mush. |
| Person page header (DES-5's `PersonVisual` slot) | **KnownForMosaic 2×2**, 160px | ≤4 per page view | One page, one person, above the fold — the flagship surface where "shown as their work" lands. |
| Person cards on larger surfaces (people-filter chips in DES-3, any future person grid) | Single poster thumb — the **first `knownForTitles` entry** (dataset order; when `rating.numVotes` values are present, i.e. the field is granted, upgrade to the client-side max — see Behavior) — with a small monogram badge overlay | ≤1 per card, lazy | Cheap, still says "their work", degrades to plain monogram; the pick never depends on a governed field. |

## Layout

### Ideal — person page header with the mosaic

```
   ┌────────┬────────┐   Al Pacino
   │ poster │ poster │   1940 –
   │  ▓▓▓▓  │  ▓▓▓▓  │   Actor · Producer · Director
   ├────────┼────────┤
   │ poster │ poster │   ← 160×160 total, 2px gaps,
   │  ▓▓▓▓  │  ▓▓▓▓  │     6px outer radius; tiles are
   └────────┴────────┘     center-cropped to square
```

- Tiles are the person's top 4 known-for titles in known-for order. Decorative:
  `aria-hidden`, not focusable, **not** clickable (the Known-for strip right below it
  is the interactive version of the same titles — the mosaic is a portrait, not a
  menu).

### Degradation ladder (each step is a designed state, not an accident)

```
4 posters resolve   →  2×2 mosaic (ideal)
2–3 posters resolve →  render resolved tiles; each failed tile
                       becomes a FallbackArt square (gradient +
                       title initials) — the mosaic stays a mosaic
0–1 posters resolve, or no known-for title ids at all
                    →  the whole slot renders the 160px Monogram
                       disc (DES-1): deterministic hue from the
                       person id, initials from primaryName
While loading       →  Monogram renders immediately; tiles
                       fade in over it as they load (the page
                       never waits on OMDb, and never shifts)
```

Single-poster card variant: poster thumb resolves → poster + 16px monogram badge
bottom-left; poster fails or no known-for id → plain `Monogram`. Same ladder, depth 1.

## Components

- `PersonVisual` — already the named slot in DES-5; gains a `treatment` prop:
  `monogram` (v1, shipped) | `mosaic` (this spec) | `poster+badge` (card variant).
  Internals change; the box does not — DES-5's layout is untouched.
- `KnownForMosaic` — 4 `PosterImage` tiles with per-tile `FallbackArt` and the
  whole-slot monogram floor.
- `Monogram` — unchanged (DES-1); it is the floor of every ladder.

## Behavior

- The mosaic issues at most 4 OMDb requests per person page view, only when the
  header is rendered (it always is — no lazy rule needed here; the budget cap *is*
  the rule). The card variant issues at most 1, lazy.
- Autocomplete behavior is explicitly unchanged by this spec (0 requests for people).
- Tile failures are silent: no retry UI, no broken image, just the ladder.
- The header visual never causes layout shift: the 160px square is reserved from
  first paint with the monogram in it.
- **Card-variant poster pick (denial-safe by construction —
  architecture § Person visuals + § Field-level governance):** the primary rule is
  the **first `knownForTitles` entry** (dataset order — IMDb's own curation, an
  ungoverned signal). When the fetched data carries `rating.numVotes` values (the
  field is governed and only present while granted), the pick **opportunistically
  upgrades** to the client-side max-voted title. Both rules read data the list
  query already fetched — never an extra GraphQL or OMDb request. The degradation
  is **silent**: cards never render the restricted-field treatment (DES-8 § where
  it deliberately doesn't apply) — `numVotes` here is a heuristic input, not a
  displayed fact, so denied → first-entry pick, granted → possibly a better poster
  on the next fresh fetch, and the user is never told about either. (The
  feasibility verdict came back **yes on all three gates** — see Data needs — so
  the monogram-everywhere contingency is retired; the monogram remains as every
  ladder's floor.)

## Data needs — feasibility gates, all verified

Every gate passed; confirmed by the architect in `docs/architecture.md` ("Person
visuals — data facts & OMDb budget") against the live router and
`imdb-federation/API-CHANGES.md` on 2026-07-10:

1. **Known-for titles are queryable and hydrated** — `Name.knownForTitles: [Title!]`
   (at most 4 per person; may be empty or null — the ladder covers both) hydrates
   through federation in the same query, selectable wherever a `Name` appears:
   `name`/`names`, `searchNames.items`, and `... on Name` fragments in the unified
   `search`. Live check: Al Pacino returned 4 fully hydrated titles. Person cards get
   their poster ids with **zero extra GraphQL requests**; DES-5's Assumption-B
   fallback (top-4 filmography via the credits edge) is moot and retired.
2. **OMDb request budget — adopted as recorded**: ≤4 poster requests per person page
   view, ≤1 per person card (lazy), 0 in autocomplete; all lazy-loaded, no retry on
   404, instant fallback down the ladder. These budgets keep a 24-result people page
   at the same order of OMDb traffic as a title results page.
3. **No new GraphQL surface** — the mosaic rides DES-5's person query; the card
   variant rides whatever list query rendered the card; poster URLs are
   client-constructed.

```graphql
# The incremental selection wherever a person visual renders:
knownForTitles {
  tconst              # → https://img.omdbapi.com/?i=<tconst>&apikey=db1f8efc
  primaryTitle        # FallbackArt tile initials + alt text
  startYear
  rating {
    averageRating     # ungoverned sibling — keeps `rating` non-empty under strip
    numVotes          # GOVERNED (denied to everyone today) — selected
  }                   # optimistically per architecture § Field-level governance;
}                     # stripped when denied, present when granted. The card pick
                      # upgrades to max-voted only when values are present; the
                      # mosaic and the first-entry pick never read it.
```

**Governance note:** `Rating.numVotes` stays in the selection deliberately — the
optimistic full document is the grant-detection mechanism (the client strips and
retries while denied; a grant flows through on the next fresh fetch, no code
change). No treatment, no error, and no extra image traffic in either direction:
denial changes at most *which* single poster a card shows.
