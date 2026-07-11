---
id: IMDB-7
title: Title detail page
status: in-review
owner: product-owner
design: designs/DES-4-title-detail.md
depends-on: [IMDB-4, IMDB-5, IMDB-14]
branch: "imdb-7-title-detail-page"
pr: "https://github.com/dperez4787/imdb-browser/pull/25"
---

## Description

A deep title page hydrated through federation: search results are entity stubs the
router expands, so this page selects the rich `Title` fields (year, genres, rating,
runtime, credits/cast and crew) in its own query. Replaces the placeholder title route
IMDB-5 introduced. Shows the OMDb poster with graceful fallback. Cast and crew people
are listed here; navigation from those entries to person pages activates when IMDB-8
lands (this page must not break without it — person entries render as
names/cards whose links appear with IMDB-8, per the design spec). URL scheme follows
the OPEN "Frontend routing & state" decision — coordinate with the architect.

Designer must answer: page layout (poster, headline facts, rating treatment,
credits organization by category), how much filmography-style density is right, the
loading / not-found / error / image-missing states, and how cast/crew entries look
before and after person pages exist.

## Acceptance criteria

- Clicking a title in universal search opens its detail page at a stable, shareable
  URL; loading that URL directly while signed in renders the same page.
- The page shows the designed title facts hydrated through the router (at minimum:
  primary title, year, genres, star rating, runtime where present; vote count when the
  router grants it) and the OMDb poster or designed fallback.
- `Rating.numVotes` is governed at the router and currently denied to everyone: with
  it denied, the page still renders fully — star rating and every ungoverned fact
  intact — and the vote-count slot shows the designed restricted-field treatment
  (IMDB-14): never an error page, never a silent gap indistinguishable from a title
  with no rating data. When a grant is enabled at the governance console, a fresh
  load shows the real vote count with no redeploy; re-denied, the restricted
  treatment returns on the next fresh load.
- Below the design's narrow-viewport breakpoint the page reflows as DES-4 specifies
  (poster centered above the header, credit groups stacked full-width) with no
  horizontal page scroll.
- Cast/crew are listed grouped as the design specifies, showing each person's name;
  with IMDB-8 unmerged these entries render per the design's pre-person-page
  treatment and nothing 404s.
- An unknown/invalid title id renders the designed not-found state; query failures
  render the designed error state; loading state as designed.
- Signed-out users never see the page (AuthGate).

## Files expected to change

- app/frontend/src/titles/ (detail page + tests)
- app/frontend/src/graphql/ (title detail query)

## Log

- **product-owner** — filed. `needs-design`. Also inherits the routing-scheme OPEN
  question via its URL requirement and depends on IMDB-4/IMDB-5. Cross-navigation to
  person pages completes in IMDB-8.
- **ui-ux-designer** — design spec written: `designs/DES-4-title-detail.md` (one-sheet
  layout: poster + fact line + RatingBlock + GenreChips, credits grouped per data
  category — never hard-coded — with the pre-IMDB-8 non-interactive person-chip
  treatment specified so nothing 404s; not-found/error/loading/poster-missing states
  all drawn). Route literal follows the architect's routing decision (spec assumes
  `/title/:tconst`); credits-shape field names are introspection-verified per the
  ticket. No open design decision remains → `ready-for-dev`.
- **product-owner** — amended for router field-level governance (see IMDB-14 and
  IMDB-4's Log/PR #8): `Rating.numVotes` is governed and currently denied to
  everyone, live. AC now require the designed restricted-field treatment in the
  vote-count slot under denial, clean upgrade/degrade on grant changes (next fresh
  fetch, no redeploy — the user will toggle grants in a demo), and the DES-4
  narrow-viewport reflow as an explicit criterion. Added depends-on IMDB-14 (which
  ships the `denied` error kind and the shared treatment) and moved back to
  `needs-design`: DES-4's RatingBlock assumes `numVotes` is readable and must be
  revised (restricted state distinct from "no rating data") before this is buildable.
  Amended now, pre-implementation, because changing an unstarted ticket is cheaper
  than a follow-up ticket against shipped code.
- **ui-ux-designer** — DES-4 revised for governance; back to `ready-for-dev`. The
  vote-count slot now has three explicitly distinct states: value present →
  `2.1M votes`; `Rating.numVotes` in `deniedFields` → the inline `RestrictedValue`
  pill from `designs/DES-8-restricted-field-treatment.md` (stars and all other
  facts unaffected, zero layout jump on grant flips); no rating at all, nothing
  denied → whole block absent as before. Data needs updated: the query keeps
  selecting `numVotes` optimistically per architecture § Field-level governance
  (co-select rule already satisfied by `averageRating`). Restricted pill joins the
  header tab order (tooltip on focus). No open design question remains; the
  restricted-treatment component itself ships under IMDB-14 (depends-on already
  present).
- **developer** — claimed; `in-progress` on branch `imdb-7-title-detail-page`.
  Live-router shape verified before writing code (2026-07-11, gcloud identity
  token): `title(tconst:)` returns `null` for an unknown id (not-found ≠ error,
  as DES-4 requires), `principals` carries every crew category incl. director/
  writer entries (so credit groups are principals-driven, no separate
  directors/writers selection needed), `episode { seasonNumber episodeNumber
  series { … } }` hydrates (tt0959621), and `Rating.numVotes` is redacted at
  policy revision 8 with the coordinate in
  `extensions.governance.redactedFields` while `averageRating` arrives (9.2 for
  tt0068646). Per the IMDB-6 file partition, the title query gets NEW graphql
  files (`titleQueries.js`/`titleHooks.js`) — existing `queries.js`/`hooks.js`
  untouched; genre chips render as links to `/titles?genres=…` from day one per
  the coordination directive (IMDB-6's route lands independently).
- **developer** — implemented; `in-review`, PR #25 (draft).
  What changed: `src/title/` filled in — `TitlePage.jsx` (state switch, doc
  title, scroll reset), `TitleHeader.jsx` (poster 260×390, fact line, episode
  context), `RatingBlock.jsx` (the amended three-way governed votes slot),
  `GenreChips.jsx` (real `/titles?genres=…` links), `CreditGroup.jsx` +
  `PersonEntity.jsx` (non-interactive pre-IMDB-8 chips, `data-nconst` upgrade
  seam), `PageStates.jsx` (NotFoundState/ErrorState, placed for DES-5 reuse),
  `format.js` (formatters + `groupCredits`); new `src/graphql/titleQueries.js`
  + `titleHooks.js` (optimistic `numVotes`, own `titleDetail` cache key,
  denial-scoped staleTime); one appended `styles.css` section incl. the 720px
  reflow; colocated tests (41 new, all green; full suite 416 pass / 17
  pre-existing env-gated skips; build green).
  Live-verified (gcloud OIDC token, rev 8, through the page's real document):
  tt0068646 → averageRating present, numVotes absent +
  `redactedFields:["Rating.numVotes"]`, 22 principals / 10 categories;
  unknown id → `title: null`, no error.
  Honest gaps: (1) browser click-through deferred per the user's directive —
  direct-load, reflow, and live grant-flip not watched in a real browser;
  (2) `App.test.jsx`'s `/title` block was updated (it pinned the placeholder
  this ticket replaces) — the one shared-file edit, flagged for the IMDB-6
  developer; (3) DES-4's wireframe shows a merged "CAST" header but its
  normative text says headers are the data's category words — implemented the
  text (ACTOR/ACTRESS as their own groups filling the cast slot); designer
  may want a merged-cast follow-up; (4) the pre-existing `useTitle`/
  `TITLE_QUERY` in hooks.js/queries.js are now superseded for this page but
  untouched per the partition — candidates for cleanup once IMDB-6 lands;
  (5) "Search instead" focuses the omnibox by dispatching the DES-1 global
  `/` shortcut rather than new plumbing into `search/` files.
