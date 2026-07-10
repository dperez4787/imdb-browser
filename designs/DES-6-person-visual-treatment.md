---
id: DES-6
title: Person visual treatment — known-for mosaic, monogram floor
status: draft
tickets: [IMDB-9]
---

## Intent

People have **no images, ever** — OMDb serves title posters only and no people-image
endpoint will exist. Marquee turns that constraint into the identity: *a person is
shown as their work.* This spec proposes the brief's "Open idea" — represent a person
with the posters of titles they were part of — as a **tiered treatment**: a 2×2
known-for poster mosaic where the surface justifies the cost, and the deterministic
`Monogram` disc (already shipped by DES-1/2/5) everywhere else and as the universal
degraded state. The proposal decides *where it looks right and what it costs*; whether
the data and budget support it is **being verified by the architect in parallel** —
the "Feasibility gates" section below lists exactly what must be confirmed against
`docs/architecture.md` before this spec leaves `draft`. The fallback outcome ("keep
the monogram everywhere") is explicitly acceptable and already fully designed, so no
other spec or ticket blocks on this one.

## The tiers (per surface — this is the decision)

| Surface | Treatment | OMDb budget | Why |
|---|---|---|---|
| Autocomplete person rows (DES-2) | `Monogram` 40px — **never mosaic** | 0 | Autocomplete renders on every keystroke; N extra poster requests per keystroke is the wrong trade, and at 40px a mosaic is mush. |
| Person page header (DES-5's `PersonVisual` slot) | **KnownForMosaic 2×2**, 160px | ≤4 per page view | One page, one person, above the fold — the flagship surface where "shown as their work" lands. |
| Person cards on larger surfaces (people-filter chips in DES-3, any future person grid) | Single top-known-for poster thumb with a small monogram badge overlay | ≤1 per card, lazy | Cheap, still says "their work", degrades to plain monogram. |

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
- If the feasibility verdict is "no" (fields or budget), the shipped v1 monogram
  stands everywhere, this spec's status becomes `approved` with the tier table
  replaced by "monogram everywhere — rationale: <the verdict>", and IMDB-9 closes
  with no code change — that is a legitimate closure per the ticket.

## Data needs — and the feasibility gates the architect is verifying

This spec's data assumptions, stated so `docs/architecture.md` can confirm or refute
each (the architect is checking these in parallel; this spec stays `draft` and IMDB-9
stays open until then):

1. **Known-for title ids are queryable on `Name`** — some field exposing known-for
   Title stubs (IMDb datasets carry `knownForTitles` tconsts; DES-5's Assumption A).
   The mosaic needs `knownFor { id }` — ids only; no other fields.
   *If absent:* fallback source is the person's top-4 filmography titles by
   `numVotes` via the credits edge (DES-5's Assumption B) — costlier query, same UI;
   architect to say whether that's acceptable or the answer is monogram-only.
2. **OMDb request budget** — proposed: **≤4 per person page view, ≤1 per person
   card, 0 in autocomplete**, all through the existing lazy/fallback rules. Architect
   to confirm this is within sensible OMDb volume (the key is a public demo-tier
   key) or set a different number; whatever number lands in `docs/architecture.md`
   supersedes the table above.
3. **No new GraphQL surface is required** — the mosaic reuses the person page's
   existing query (DES-5) plus client-constructed OMDb URLs. If the architect finds
   known-for ids need an extra query, that cost belongs in the verdict.

```graphql
# The only incremental data the ideal treatment needs (within DES-5's query):
knownFor { id }   # 4 ids → 4 poster URLs; field name per introspection
```
