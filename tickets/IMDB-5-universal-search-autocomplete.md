---
id: IMDB-5
title: Universal search box with autocomplete and poster-rich results
status: in-review
owner: product-owner
design: designs/DES-2-universal-search.md
depends-on: [IMDB-4]
branch: "imdb-5-universal-search"
pr: "https://github.com/dperez4787/imdb-browser/pull/14"
---

## Description

The product's front door: **one universal input** (per the brief — one search box beats
two radio buttons) that autocompletes across titles and people as the user types.
There is no mixed `search` root field yet, so this ships the brief's **zero-backend
aliased stopgap**: a single GraphQL request aliasing `searchTitles` (titlePrefix) and
`searchNames` (namePrefix), merged client-side by popularity — `rating.numVotes` for
titles vs. name popularity, with a documented fallback heuristic while name popularity
is not yet a queryable field. Title results show OMDb posters
(`img.omdbapi.com/?i=<tconst>&apikey=db1f8efc`); person results use the designed
placeholder/initials treatment (upgraded later by IMDB-9 — no people-image API exists).
Field names must be verified by introspecting the live router before implementation
(the orchestrator subgraph's `API-CHANGES.md` is authoritative once it lands).

Designer must answer: search box placement/prominence, autocomplete panel layout with
interleaved title and person hits, result card anatomy (poster, name, year/type
metadata), keyboard navigation, and the loading / empty / no-results / image-missing /
error states. Note: the OPEN "Frontend routing & state" architecture section touches
where selecting a result navigates — coordinate with the architect.

## Acceptance criteria

- A signed-in user typing a prefix (e.g. `god`) into the single search box sees an
  autocomplete panel with title and person results interleaved in one ranked list,
  ordered by the documented popularity merge (not grouped titles-then-people).
- Each title result shows its OMDb poster; a missing/404 poster shows the designed
  fallback, never a broken image. Person results show the designed placeholder
  treatment.
- Input is debounced: one GraphQL request (the aliased two-query document) per settled
  keystroke burst — observable as a single network call to the router per query change.
- Offscreen result images lazy-load (per the brief's request-volume caution).
- Loading, no-results, and error states render exactly as the design spec defines.
- Keyboard access works as designed: results are reachable and selectable without a
  mouse.
- Selecting a result navigates to that title's or person's detail route (a minimal
  placeholder page until IMDB-7/IMDB-8 land; the URL scheme follows the architecture
  decision).
- Signed-out users never see the search UI (AuthGate).

## Files expected to change

- app/frontend/src/search/ (search box, autocomplete panel, merge logic + tests)
- app/frontend/src/graphql/ (aliased search query)

## Log

- **product-owner** — filed. `needs-design` (universal search UX). Also transitively
  blocked on IMDB-4 (and thus the router-auth and client-layer architecture
  decisions). Stopgap explicitly sanctioned by the brief; replaceable when the
  `search(query, limit)` union field ships upstream.
- **ui-ux-designer** — design spec written: `designs/DES-2-universal-search.md`.
  Answers placement (hero on `/`, compact in TopBar — one component), panel anatomy,
  card anatomy, keyboard model (ARIA combobox), all states, and documents the exact
  client-side merge heuristic (2 titles : 1 person positional interleave over
  server-popularity-sorted lists, exact-name promotion) so no decision is left to the
  developer. IMDB-13's freshness indicator is folded in as the panel footer
  (`SearchFreshness`, reusable). Detail-route literals follow the architect's routing
  decision in `docs/architecture.md` (spec assumes `/title/:tconst`, `/name/:nconst`);
  that ordering is carried by depends-on (IMDB-4 chain), not by an open design
  question → `ready-for-dev`.
- **ui-ux-designer** — upstream simplification: the unified `search(query, kinds,
  limit)` union has landed (`imdb-federation/API-CHANGES.md`, authoritative; see
  `docs/architecture.md`). DES-2 revised in place: server-ranked union hits are now
  the primary rows; the aliased prefix pair stays in the **same single document** as
  the fill for partial-word typing (the client 2:1 merge is demoted to DES-2
  Appendix A; exact-name promotion retired — server relevance owns it). Still
  exactly one router request per settled keystroke burst — read this ticket's
  "aliased two-query document" AC parenthetical as "the single aliased search
  document" per the revised spec. Also added: the index-never-built empty state
  (`searchInfo.rebuiltAt` null until the user runs the federation rebuild).
- **product-owner** — governance advisory (no AC/status change; see IMDB-14 and
  IMDB-4's Log/PR #8): the router now denies `Rating.numVotes`, `Name.birthYear`,
  and `Name.deathYear` to everyone, and **selecting a denied field 403s the whole
  operation** — so this ticket's search document must not select them (DES-2's query
  snippet, which predates governance and still selects `numVotes`, is being trimmed
  under IMDB-14's design pass; IMDB-4's shipped operation documents already omit
  them). Nothing in this ticket's ACs displays those fields, and the revised ranking
  is server-side (Appendix A's fallback interleave is positional over
  server-sorted lists, needing no `numVotes` values), so this ticket stays
  `ready-for-dev` with no new dependency.
- **developer** — claimed; branch `imdb-5-universal-search` off `main` (post-PR-#8,
  so the IMDB-4 client layer is in). Implementing per DES-2 as revised:
  union-primary rows + Appendix A prefix fill in one aliased document, freshness
  footer folded in (IMDB-13), routing scaffold (`react-router` v7 per
  architecture) with placeholder `/title/:tconst` / `/person/:nconst` /
  `/search?q=` routes. Per the PO's governance advisory above, the search
  document does NOT select `Rating.numVotes` (no strip-and-retry exists yet —
  IMDB-14 owns it); the row renders the votes parenthetical opportunistically
  whenever a response carries it, so re-adding the field to the document under
  IMDB-14 lights it up with no component change. New GraphQL code goes in NEW
  files (`searchQueries.js`, `searchHooks.js`) — existing `src/graphql/` files
  untouched, IMDB-14 owns them this round.
- **developer** — implemented → `in-review`, PR #14 (draft):
  https://github.com/dperez4787/imdb-browser/pull/14.
  - **What changed:** new `src/search/` (Omnibox, AutocompletePanel,
    SearchHitRow, SearchFreshness, mergeRows, HomePage, SearchPage), new
    shared `src/PosterImage.jsx` + `src/FallbackArt.jsx` (DES-1 units, beside
    the existing Monogram), new `src/graphql/searchQueries.js` +
    `searchHooks.js` (debounce 250ms, ≥2-char trigger, one aliased request
    per settled burst, searchInfo riding along), routing scaffold
    (react-router v7: BrowserRouter in `main.jsx`, route table in `App.jsx`
    with placeholder `/title/:tconst`, `/person/:nconst`, `/search?q=`,
    catch-all), TopBar now mounts the compact omnibox off-home, styles
    appended as one delimited section in `styles.css`.
  - **IMDB-13 note:** DES-2 folds the freshness indicator in here —
    `SearchFreshness` (exported standalone for DES-3 reuse) renders
    `rebuiltAt` relative/absolute, the never-built state, and the
    absence-over-guessing rule. IMDB-13 likely closes with this PR; PO and
    tester decide.
  - **Verified:** all 157 frontend tests + build green; live router run with
    a gcloud identity token using the exact shipped document — 200, union
    hits interleaving Title/Name in server order (`coppola`), mid-word
    `godf` → empty union + prefix fill (Appendix A is a real scenario);
    OMDb poster URLs for returned tconsts → 200 image/jpeg, bogus id → 404
    (FallbackArt path); dev server + deep links serve.
  - **Not verified (needs a human):** the signed-in browser flow end-to-end
    (Google popup → typing → panel → navigate) — my live auth was a gcloud
    OIDC token (the router's second JWKS provider), not a Firebase ID token;
    panel rendering with real posters not eyeballed in a browser; mobile
    (<720px) overlay exercised only in jsdom.
  - **Honest notes:** (1) the search document omits `numVotes` (see claim
    entry) — votes render opportunistically when the field returns under
    IMDB-14; (2) Enter with no openable rows navigates to the reserved
    `/search?q=` placeholder — DES-2 leaves that surface undesigned, so this
    is scaffold wiring, not designed UX; (3) the IMDB-2 tester suite needed a
    mechanical providers wrapper (App now requires router/query context that
    `main.jsx` supplies in production) — zero assertion changes; (4) the old
    `.home-placeholder` CSS block is now unused but was left in place per the
    append-only styles rule this round.
