---
id: IMDB-20
title: Title hierarchy browser + episodes popover
status: in-progress
owner: user (directive relayed by main session)
design: designs/DES-4-title-detail.md   # visual-language reference; additions match its idiom
depends-on: [IMDB-6, IMDB-7]
branch: imdb-20-title-hierarchy
pr: ""
---

## Description

Series titles are containers, but Marquee currently only walks the hierarchy upward
(episode → series). This ticket adds the downward direction in two places: the title
page grows a breadcrumb (for episodes) and an "Episodes" section grouped by season
(for series), and the `/titles` grid gains a lightweight episodes popover on
series-like cards — so a reviewer can descend from any series to a specific episode
without leaving the grid, or browse the full episode list on the series' own page.

Schema facts (live-introspected 2026-07-12 by the main session): `Title.episodes(limit,
offset) -> [Title]`, ordered by season/episode, each child carrying
`episode { seasonNumber episodeNumber }`; leaf titles return `[]`; **no total count
exists on the field** (a short page = the end). The upward `episode { … series { … } }`
path already ships in TITLE_DETAIL_QUERY.

## Acceptance criteria

- **Breadcrumb (title page):** an episode's page shows
  `<Series title> › S<n> E<n> · <episode title>` at the top, the series segment
  linking to `/title/:seriesTconst`. Non-episode titles show no breadcrumb. The same
  season/episode/series information is not displayed twice on the page.
- **Episodes section (title page):** a title whose `episodes` list is non-empty
  renders an "Episodes" section below the credits — grouped by season
  (`seasonNumber: null` groups under "Specials"), each row showing `S#E#`, the
  episode's primary title as a link to `/title/:tconst`, and its start year muted.
- The section fetches via its own query (limit 60, offset paging) — NOT inside
  TITLE_DETAIL_QUERY — and shows a "Load more" button exactly when a full page came
  back; a short page ends the paging. When the list resolves empty the section
  renders nothing at all (zero DOM — no header, no spinner placeholder).
- **Episodes popover (/titles grid):** cards whose `titleType` is `tvSeries` or
  `tvMiniSeries` show a "…" affordance; clicking it opens a popover anchored to the
  card that lazily fetches `episodes(limit: 12)` on first open (once — reopening does
  not refetch), listing `S#E#` + title as links, with a footer link "All episodes →"
  to `/title/:tconst`. States: loading (skeleton lines), empty ("No episodes found"),
  error (one line + retry). No poster/OMDb requests are made inside the popover.
- The card's main click-through keeps working; clicking "…" never navigates.
- Accessibility: the affordance is a real button (`aria-label "Episodes of <title>"`,
  `aria-haspopup="dialog"`, `aria-expanded`); focus moves into the popover on open;
  Esc closes it and returns focus to the button; outside-click closes it.
- All data flows through `src/graphql/` (new `episodeQueries.js` + `episodeHooks.js`;
  no existing graphql files modified); tests colocate; full suite + build pass; the
  document is exercised against the LIVE router (tt0903747 → S1E1 "Pilot"…,
  tt0068646 → `[]`).

## Files expected to change

- app/frontend/src/graphql/episodeQueries.js (new)
- app/frontend/src/graphql/episodeHooks.js (new)
- app/frontend/src/graphql/episodeQueries.live.integration.test.js (new)
- app/frontend/src/title/TitleBreadcrumb.jsx (new), EpisodesSection.jsx (new)
- app/frontend/src/title/TitlePage.jsx, TitleHeader.jsx, format.js (+ tests)
- app/frontend/src/titles/TitleCard.jsx, EpisodesPopover.jsx (new) (+ tests)
- app/frontend/src/styles.css (appended at the very end)

## Log

- **user** (directive relayed by main session, 2026-07-12) — build the title
  hierarchy browser (breadcrumb + season-grouped episodes section on the title page)
  and the episodes popover on the `/titles` grid. The product-owner/designer round
  was skipped at the user's demo-speed direction; DES-4 is the visual-language
  reference for the title-page additions, and the schema facts above were
  live-introspected by the main session the same day.
- **developer** — claimed: status → in-progress, branch `imdb-20-title-hierarchy`.
