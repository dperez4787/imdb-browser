---
id: IMDB-20
title: Title hierarchy browser + episodes popover
status: in-review
owner: user (directive relayed by main session)
design: designs/DES-4-title-detail.md   # visual-language reference; additions match its idiom
depends-on: [IMDB-6, IMDB-7]
branch: imdb-20-title-hierarchy
pr: "https://github.com/dperez4787/imdb-browser/pull/33"
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
- **developer** — implemented; status → in-review, PR
  https://github.com/dperez4787/imdb-browser/pull/33 (draft).
  - New: `graphql/episodeQueries.js` + `graphql/episodeHooks.js`
    (`useTitleEpisodes` — offset-paged `useInfiniteQuery`; `Title.episodes`
    has no total, so a short page is the end signal and `hasNextPage` IS the
    Load-more condition), `graphql/episodeQueries.live.integration.test.js`
    (LIVE_ROUTER_TOKEN-gated, same pattern as live-router.integration.test.js),
    `title/TitleBreadcrumb.jsx`, `title/EpisodesSection.jsx`,
    `titles/EpisodesPopover.jsx` (+ colocated tests). Changed:
    `title/TitlePage.jsx` (breadcrumb above the header, section below the
    credits), `title/TitleHeader.jsx`, `title/format.js`
    (`formatEpisodeMarker`, `groupEpisodesBySeason`), `titles/TitleCard.jsx`
    (gate + sibling popover), `styles.css` (appended section at the very
    end). No pre-existing `src/graphql/` file was modified.
  - **Breadcrumb-vs-episode-line choice: REPLACED.** The old
    "S1 · E7 of <series>" line under the h1 is gone; the breadcrumb at the
    top carries the same placement plus the episode's own title, so the
    information appears exactly once (the ticket offered keep-or-replace).
  - The `tvSeries`/`tvMiniSeries` ellipsis gate is a commented UI heuristic,
    not a data vocabulary — the repo's no-hard-coding rule guards facet
    vocabularies; a type outside the pair still shows its children on its
    detail page, so the heuristic can never hide data.
  - Judgment call beyond the spec text: when the episodes query FAILS the
    section shows one quiet line + Retry rather than nothing (zero DOM is
    the spec'd state for a list that RESOLVES empty; hiding a failure would
    silently amputate a series' episode list). On the rare movie-page
    failure this line is honest but slightly odd — flagging for the tester.
  - Verified: full suite 617 passed / 23 skipped (`npx vitest run
    --maxWorkers=2`), `npm run build` OK (pre-existing chunk-size warning),
    and LIVE router through the real client module + this document (gcloud
    identity token): tt0903747 → 12 episodes, S1E1 "Pilot" first,
    season/episode-ordered, deterministic offset paging; tt0068646 → `[]`.
  - NOT verified: real-browser eyeballing (popover positioning, breadcrumb,
    narrow reflow) — deferred per the 2026-07-11 directive; and the live
    check used a Google OIDC token, not a Firebase ID token (the standing
    IMDB-4 seam). `Title.imgUrl` exists on the graph now; deliberately not
    adopted here (separate concern per the directive).
