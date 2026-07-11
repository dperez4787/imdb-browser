---
id: IMDB-18
title: Search perf conformance — prefix-only typing with a Titles/People scope toggle
status: ready-for-dev
owner: user (directive relayed by main session)
design: designs/DES-2-universal-search.md
depends-on: [IMDB-5, IMDB-6]
branch: ""
pr: ""
---

## Description

The federation side published measured performance guidance (docs/PROJECT-BRIEF.md
§ "Search performance guidance"): while typing, send ONLY prefix queries; never the
`$text`-backed `search` union per keystroke; fetch `searchInfo`/`facets` once on load;
don't stack search roots in one per-keystroke document; ~15s server ceiling.

The user's explicit scope decision (2026-07-11): **keep it demo-simple — add a
Titles/People scope control (checkbox/segmented) to the omnibox instead of redesigning
the blended experience.** This supersedes DES-2's union-first autocomplete path; DES-2's
visual/keyboard/state specs are unchanged.

## Acceptance criteria

- While typing in the omnibox, only `searchTitles(titlePrefix:)` / `searchNames(namePrefix:)`
  queries are issued (debounced, unchanged trigger rules). The `search` union is never
  sent on a keystroke — mechanically asserted in a test.
- A small scope control on the omnibox panel offers All / Titles / People. All sends the
  two prefix aliases; Titles/People send exactly one search root per keystroke. Scope is
  keyboard-accessible and persists for the session.
- Pressing Enter with no row selected navigates to `/search?q=` which runs the `search`
  union ONCE per submitted query (word/stem semantics), rendering rows with the existing
  components and states.
- `searchInfo` is fetched once on load (own query key, existing 1h staleTime), not per
  keystroke; the freshness footer reads from that cache. `facets` fetch remains
  once-on-load (verify, already the case via useFacets).
- The `/titles` PeopleFilter sends only `namePrefix` queries per keystroke.
- All existing DES-2 states/keyboard behavior keep passing; suite green.

## Files expected to change

- app/frontend/src/search/** (Omnibox, panel, scope control, /search page)
- app/frontend/src/graphql/searchQueries.js, searchHooks.js
- app/frontend/src/titles/PeopleFilter (post-IMDB-6 merge)

## Log

- **user** (relayed by main session, 2026-07-11) — filed from the user's directive:
  "Just add a Person/Title checkbox or something. This is a demo." Supersedes DES-2's
  union-per-keystroke data path per the server-side performance guidance; PO/designer
  round deliberately skipped at the user's direction for speed.
