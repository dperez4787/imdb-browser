---
id: DES-8
title: Restricted-field treatment — the redaction
status: approved
tickets: [IMDB-14, IMDB-7, IMDB-8]
---

## Intent

Some fields are now governed at the router (IMDb Graph Governance): when the app
hasn't been granted a field, the client strips it and hands the view a `deniedFields`
coordinate list alongside otherwise-normal data (architecture § Field-level
governance). This spec is what a withheld value *looks like*, and it is the moment
DES-1's "honesty is part of the aesthetic" was built for. Marquee already refuses to
fake what it doesn't have — FallbackArt for missing posters, the Monogram for people
who have no photos — so a governed value gets the same move: **a redaction, not an
apology, and never a lie**. Missing data is *absence* (the segment silently drops, as
every spec already says); restricted data is the *presence of a redaction* — a small
hatched pill with a lock glyph sitting exactly where the value would sit, saying "a
value exists here and this app hasn't been granted it." Those two states are never
allowed to look alike: "no recorded birth year" renders nothing, "birth year
restricted" renders the redaction. One component, two variants, generic over any
coordinate — the three fields governed today are an instance list, not a design
input.

**The two-rule contract** (restating the architecture verbatim — these are the only
rules any view needs, and this spec exists to make them visually unconfusable):

1. Coordinate present in `deniedFields` → render `RestrictedValue` in that value slot.
2. Value null/absent and coordinate **not** in `deniedFields` → the view's ordinary
   missing/empty rule (usually silent absence — never this treatment).

## Layout

### The redaction pill (both variants share this recipe)

```
  inline:      ▨▨▨🔒▨▨▨            line-level:   ▨▨▨🔒▨▨▨ RESTRICTED
               └─ 3.5em ─┘                       └─ pill ─┘ └ small-caps
                                                             muted word ┘
```

- **Hatch**: 45° diagonal hairline stripes — 1px lines of hairline-border
  `#262a33` repeating every 3px over raised-surface `#181b22` — inside a 1px
  `#262a33` border, 3px radius. Reads as "redacted", stays quiet on the dark
  surface. **No amber** (amber is for focus and activity, not for withheld data)
  and **no animation, ever** — a static hatch is the discriminator against loading
  skeletons, which shimmer.
- **Lock glyph**: tiny (≈10px) padlock in muted `#9aa0a6`, centered in the inline
  pill, leading in the line-level pill. The one ornament that earns its place: it
  makes "restricted" legible without hover.
- **Box**: the pill occupies exactly the line box of the text it replaces — same
  line-height, baseline-aligned, never taller. Inline default width `3.5em` of the
  surrounding text (call sites may pass a width hint, e.g. `2.5em` for a 4-digit
  year); line-level variant adds the word `RESTRICTED` in 11px letter-spaced
  small caps, muted `#9aa0a6`.
- **Inline** is for a value embedded in surrounding text or a tight slot (the vote
  count under the stars, one year inside a lifespan). **Line-level** is for a slot
  that is a whole line of its own with room to self-explain (a fully-restricted
  lifespan line).

### In place — the two flagship slots

```
DES-4 RatingBlock                 DES-5 lifespan line
─────────────────                 ───────────────────
granted:   ★ 9.2                  granted:        1940 – 2015
           2.1M votes             living:         1940 –
                                  birth denied:   ▨▨🔒▨▨ – 2015
denied:    ★ 9.2                  death denied:   1940 – ▨▨🔒▨▨
           ▨▨▨🔒▨▨▨               both denied:    ▨▨▨🔒▨▨▨ RESTRICTED
                                  no recorded birth year, nothing
no rating: (whole block absent)   denied:         (line absent)
```

### Tooltip / affordance (hover and keyboard focus)

```
        ▨▨▨🔒▨▨▨
   ┌────────────────────────────────────────┐
   │ Restricted                             │  ← 12px, primary text
   │ Vote count is governed data this app   │  ← 12px, muted
   │ hasn’t been granted. If access is      │
   │ granted, it appears here automatically.│
   └────────────────────────────────────────┘
```

- Copy pattern, generic over the coordinate: bold word **Restricted**, then
  `<Label> is governed data this app hasn’t been granted. If access is granted, it
  appears here automatically.` — the call site supplies the human label ("Vote
  count", "Birth year", "Lifespan"). No blame, no error tone, and it quietly
  promises the demo's payoff: grants take effect with no action on the user's part.
- Shown on hover **and** on keyboard focus (a `title` attribute is not sufficient
  here — this is the explaining affordance, and keyboard users get it too). Dark
  raised card (`#181b22`, hairline border), max-width 280px, no arrow needed.
  `Esc` dismisses it; it never opens on its own.

### States

```
Default:            static hatched pill + lock, as above.

Hover / focus:      tooltip (above); focus additionally shows the
                    shared amber focus ring. Esc closes the tooltip
                    (focus stays on the pill).

Appearing (grant → deny between two fetches):
                    the real value is replaced in place by the pill
                    on the fetch that reports the denial. Same line
                    box, no animation, no layout jump — exactly like
                    any other value updating.

Disappearing (deny → grant):
                    the pill is replaced in place by the value. Same
                    rules. The slot's line/block renders in both
                    states, so nothing above or below it moves.

Revealed-absent (edge, acknowledged):
                    a grant reveals the value is genuinely null
                    (e.g. a living person’s deathYear) → the slot
                    follows the view’s ordinary missing rule from
                    that fetch on (a line may collapse). This is the
                    one legitimate layout change: the redaction could
                    not know, and honesty wins over pixel stability.

What this is NOT:   never a loading skeleton (skeletons shimmer;
                    this never animates), never FallbackArt (that is
                    for images), never rendered for a value that is
                    merely missing (rule 2), never an error state —
                    the rest of the view is healthy and renders
                    normally.
```

## Where it applies — and where it deliberately doesn't

- **Applies: any labeled value slot on a detail surface** — a place where the UI
  asserts a fact about the entity. Today: DES-4's vote count, DES-5's lifespan.
  Any field governed tomorrow inherits the same treatment in its slot; no new
  design round needed.
- **Does not apply: internal heuristics.** The person-card poster pick falls back
  silently to the first known-for title when `Rating.numVotes` is denied — settled
  in architecture § Person visuals, specified in DES-6. No pill on cards.
- **Does not apply: transient dense-list metadata.** Autocomplete rows (DES-2) show
  a votes parenthetical opportunistically and drop it silently while denied — eight
  lock pills per keystroke would turn governance into wallpaper. The
  unconfusability rule binds where a value is presented as a fact in a labeled
  slot; in a ranked transient list the parenthetical asserts nothing by its
  absence.
- **Never invented:** the component renders only when its coordinate is actually in
  `deniedFields` — it is driven by the hook contract, never by guessing at nulls.

## Components

- `RestrictedValue` — the shared component, exported for reuse (IMDB-14 AC). Props:
  - `coordinate` — the `Type.field` string the view wanted (e.g. `Rating.numVotes`);
    emitted as a `data-coordinate` attribute for tests, and never shown to users.
  - `label` — human label for tooltip and screen-reader text ("Vote count").
  - `variant` — `inline` (default) | `line`.
  - `width` — optional em-width hint for the inline pill (default `3.5em`).
- `isRestricted(deniedFields, coordinate)` — tiny predicate helper exported beside
  the component, so call sites read as the two-rule contract and never string-match
  inline.
- Consumers this round: `RatingBlock` (DES-4), `PersonHeader`'s lifespan line
  (DES-5). Future governed fields plug in the same way.

## Behavior

- Renders if and only if `isRestricted(deniedFields, coordinate)` is true for the
  slot's coordinate; otherwise the slot renders its value or its ordinary missing
  state. (Observable: with `Rating.numVotes` in `deniedFields`, the pill renders;
  with `numVotes: null` and an empty `deniedFields`, it never does.)
- The pill is focusable (`tabIndex=0`) and sits in the natural tab order of its
  surface; focus shows the amber ring and opens the tooltip; blur or `Esc` closes
  it. It is not a button: `Enter`/`Space` do nothing, and it never navigates.
- **Screen reader**: the element carries visually-hidden text
  `"<Label>: restricted by data governance."` as its accessible content — a screen
  reader walking the page reads e.g. "Vote count: restricted by data governance."
  The hatch and lock are `aria-hidden` decoration; the visible tooltip repeats the
  hidden text's meaning and is itself `aria-hidden` (no `aria-live`, no
  double-announcement).
- **Zero layout jump, both directions**: a slot that can be governed renders the
  same DOM structure (same lines, same blocks, same heights) whether it holds the
  real value or the pill; only inline width may differ, which never reflows
  surrounding lines' vertical layout. Grant flips during a live demo therefore swap
  value ↔ pill in place with nothing else on the page moving (sole exception: the
  revealed-absent edge above).
- No animation on swap-in or swap-out — the value updates the way any refetched
  value does. No toast, no banner, no page-level notice: one denied field is a
  detail of one slot, never a page event (the strip-and-retry guarantees the rest
  of the view renders normally).
- Tooltip is `aria-hidden` presentation; it must never trap focus or block clicks
  on neighbors.

## Data needs

None of its own — this component consumes the query-hook contract from
architecture § Field-level governance:

- Every query hook returns `deniedFields: string[]` (possibly empty) alongside
  `data`; denied coordinates are already stripped from `data` by the client's
  strip-and-retry. No component outside `src/graphql/` parses raw GraphQL errors.
- Views keep **selecting governed fields optimistically** (the full document is
  re-sent every fetch — that is the grant-detection mechanism), and author
  documents so no parent selects only governed leaves (e.g. `rating` co-selects
  `averageRating` beside `numVotes`), so a strip degrades a field, never an object.
- Governed today — an instance list, not a design input: `Rating.numVotes`,
  `Name.birthYear`, `Name.deathYear`. The component hard-codes nothing about them;
  labels come from call sites.
