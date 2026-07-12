---
id: IMDB-8
title: Person detail page with title cross-navigation
status: in-review
owner: product-owner
design: designs/DES-5-person-detail.md
depends-on: [IMDB-5, IMDB-7, IMDB-14]
branch: "imdb-8-person-detail-page"
pr: "https://github.com/dperez4787/imdb-browser/pull/27"
---

## Description

A person page hydrated through federation — name plus filmography/known-for titles —
completing the people ↔ titles cross-navigation the brief calls for: person results in
search open this page, filmography entries link to title detail pages (IMDB-7), and
title pages' cast/crew entries now link here. **No people images exist** (OMDb serves
title posters only), so this page ships with the designed placeholder/initials
treatment; the richer known-for-poster treatment is IMDB-9's separate design question
and must not block this page. Replaces the placeholder person route from IMDB-5.

Designer must answer: page layout (identity header with placeholder treatment,
filmography organization — by category? known-for first?), how title entries display
(poster thumbnails with fallbacks?), and the loading / not-found / error states.

## Acceptance criteria

- Clicking a person in universal search opens their detail page at a stable, shareable
  URL; loading that URL directly while signed in renders the same page.
- The page shows the person's name with the designed placeholder visual treatment (no
  broken images, no real photo expected) and their filmography/known-for titles as the
  design specifies, hydrated through the router.
- `Name.birthYear` and `Name.deathYear` are governed at the router and currently
  denied to everyone: with them denied, the page still renders fully and the lifespan
  line shows the designed restricted-field treatment (IMDB-14) — visibly different
  from a person with no recorded birth year, never an error page. When a grant is
  enabled at the governance console, a fresh load shows the real years with no
  redeploy; re-denied, the restricted treatment returns on the next fresh load.
- The known-for strip renders under the current deny-everyone state of
  `Rating.numVotes`: its fallback selection (per revised DES-5) does not require
  reading `numVotes`, and no query this page issues fails because of a governed field.
- Below the design's narrow-viewport breakpoint the page reflows as DES-5 specifies
  (header stacks, known-for strip scrolls horizontally, filmography drops the rating
  column) with no horizontal page scroll.
- Clicking a filmography entry navigates to that title's detail page; on a title
  detail page, clicking a cast/crew person navigates here — cross-navigation works in
  both directions.
- Unknown/invalid person id renders the designed not-found state; query failures the
  designed error state; loading state as designed.
- Signed-out users never see the page (AuthGate).

## Files expected to change

- app/frontend/src/people/ (detail page + tests)
- app/frontend/src/titles/ (activate person links in cast/crew entries)
- app/frontend/src/graphql/ (person detail query)

## Log

- **product-owner** — filed. `needs-design`. Ships with the placeholder person visual;
  the mosaic/known-for-poster idea is deliberately split into IMDB-9 so this page
  isn't blocked on that designer+architect discussion.
- **ui-ux-designer** — design spec written: `designs/DES-5-person-detail.md` (billing
  layout: PersonVisual slot rendering the Monogram in this ticket — DES-6 upgrades
  internals later without layout change — plus Known-for strip and category-grouped
  filmography; all states drawn). Two data assumptions are stated explicitly in the
  spec's Data needs (A: a known-for field with Title stubs — with a designed fallback
  if absent; B: a Name→credits edge with category/characters — load-bearing) for the
  architect to confirm; field names introspection-verified per the ticket. The design
  itself leaves no decision open → `ready-for-dev` (data-layer ordering rides
  depends-on IMDB-5/IMDB-7).
- **product-owner** — amended for router field-level governance (see IMDB-14 and
  IMDB-4's Log/PR #8): `Name.birthYear` and `Name.deathYear` are governed and
  currently denied to everyone, live; `Rating.numVotes` (which DES-5's known-for
  fallback ranks by) likewise. AC now require the restricted-field treatment on the
  lifespan line under denial (distinct from absent data — DES-5's current "absent if
  no birth year" rule conflates the two), clean upgrade/degrade on grant changes
  (next fresh fetch, no redeploy — the user will toggle grants in a demo), a
  denial-safe known-for fallback, and the DES-5 narrow-viewport reflow as an explicit
  criterion. Added depends-on IMDB-14 and moved back to `needs-design` pending the
  DES-5 revision. Amended now, pre-implementation, because changing an unstarted
  ticket is cheaper than a follow-up ticket against shipped code.
- **ui-ux-designer** — DES-5 revised for governance; back to `ready-for-dev`. The
  lifespan line now has a full denied-vs-missing matrix: no recorded birth year and
  nothing denied → line absent (unchanged, ordinary missing data); any lifespan
  coordinate in `deniedFields` → the line always renders, with the inline
  `RestrictedValue` pill (`designs/DES-8-restricted-field-treatment.md`) in each
  denied year slot (`▨▨🔒▨▨ – 2015` / `1940 – ▨▨🔒▨▨`) and the line-level variant
  (`▨▨▨🔒▨▨▨ RESTRICTED`) when both are denied — the two families cannot be
  confused, and grant flips swap pill ↔ year in place with zero layout jump. The
  known-for strip is now sourced from `Name.knownForTitles` in dataset order and
  **never reads `numVotes`** — the old top-4-by-`numVotes` fallback is retired
  (trigger disproven by the architect's live verification; ranking field
  governed). Data needs updated to select governed fields optimistically per
  architecture § Field-level governance; no rendered element on this page depends
  on one. No open design question remains (data-layer ordering rides depends-on
  IMDB-14 as before).
- **developer** — claimed; branch `imdb-8-person-detail-page`. Live-introspection
  findings before writing the query (2026-07-12, policy revision 8), correcting
  DES-5's Data needs for the designer:
  - Root field is `name(nconst: ID!)`, not `name(id:)`; the entity key is `nconst`,
    there is no `Name.id`. Unknown nconst resolves `name: null` on HTTP 200 with no
    GraphQL error — same not-found-vs-error split as `title`.
  - `primaryProfessions` (plural), not `primaryProfession`.
  - **Assumption B confirmed**: `Name.credits: [Principal!]!` exists and hydrates
    in the same query — `Principal { ordering category job characters title }` all
    present. Caveat found live: `credits` is a curated set **capped at 50 entries**
    (no tvEpisode/archive-footage noise; Al Pacino returns exactly 50 of 200+ raw
    principal rows). The root `principalsByName(nconst, limit!, offset!)` serves
    the full raw principals table (episode-level rows, archive_footage) but is
    mandatory-paginated and noisy — wrong fit for DES-5's "renders fully, no
    pagination" filmography, so this page uses `credits` and accepts the 50-cap.
    Flagged for product-owner/designer as a data-layer fact, not hidden.
  - Governance observed live for `nm0000199`: **transparent redact mode** — HTTP
    200, no errors, `birthYear`/`deathYear` absent from data,
    `extensions.governance.redactedFields: [Name.birthYear, Name.deathYear,
    Rating.numVotes]`. The page therefore selects governed fields optimistically
    and relies on the redact-mode `deniedFields` envelope (architecture § Field-level
    governance: one round trip; a denial-derived fallback document is explicitly
    retired there). Under the residual reject-mode config fallback, errors.js
    normalizes the 403 to kind `denied` and the page shows the shared ErrorState
    with Retry — degraded but never blank; per DES-5 that mode reaching a query is
    itself the error case.
- **developer** — implemented; draft PR
  https://github.com/dperez4787/imdb-browser/pull/27 → `in-review`.
  - New: `src/graphql/personQueries.js` + `personHooks.js` (envelope +
    denial-scoped 60 s staleTime, mirroring titleHooks); `src/people/`
    PersonHeader / KnownForStrip / FilmographyGroup / FilmographyRow /
    personFormat.js (+ tests); PersonPage.jsx replaces the IMDB-5 placeholder on
    the same route (no App.jsx change needed). Styles appended at the end of
    styles.css (720px reflow: header stacks, strip scrolls horizontally inside
    its own box, rating column drops).
  - Sanctioned cross-ticket edits: `src/title/PersonEntity.jsx` span → Link
    (the upgrade seam IMDB-7 reserved; TitlePage.test.jsx updated to match) and
    `src/title/PageStates.jsx` NotFoundState gained a `subject` prop ('title'
    default, 'person' here); App.test.jsx's person-route test now expects the
    real page.
  - Governance choice (per architecture § Field-level governance): rely on the
    redact-mode `deniedFields` envelope — one round trip, no fallback document,
    no retry (denial-derived documents are explicitly retired there). Observed
    live through the shipped document for nm0000199: HTTP 200 redact mode,
    `redactedFields [Name.birthYear, Name.deathYear, Rating.numVotes]`, page
    renders with the line-level restricted lifespan. Residual reject-mode 403
    (platform config fallback) would render the designed ErrorState, not a
    blank page.
  - Verified: 47 files / 532 Vitest tests green (7 opt-in live suites skipped);
    `npm run build` clean; live router checks for nm0000199 (redact behavior,
    dataset-order known-for, curated credits) and an unknown nconst
    (`name: null`, no error). Under parallel load two unrelated test files
    (`useTitleSearch`, `main`) flaked on waitFor timeouts; both pass in
    isolation and the final clean full run was green.
  - NOT verified (honest gaps): real-browser signed-in flow, 720px visual
    reflow, tooltip interactions, and the live grant-flip demo — deferred to
    the human testing period per the 2026-07-11 directive. Known data-layer
    caveat for the tester/product-owner: the filmography is `Name.credits`,
    the router's curated credit edge capped at 50 entries (prolific people
    have more raw principal rows behind `principalsByName`).
