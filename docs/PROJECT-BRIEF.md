# Project brief — imdb-browser

The shared facts every agent works from. This file records the surrounding system and
the product intent; `docs/architecture.md` records decisions made *in this repo*. When
the two disagree, flag it — don't silently pick one.

## The surrounding system

| Repo | Role |
|------|------|
| `dperez4787/imdb-data-pipeline` | Populates MongoDB Atlas with IMDb datasets. **We never touch it.** |
| `dperez4787/imdb-federation` | GraphQL federation subgraphs serving the indexed IMDb data (Cloud Run, private, invoker-gated) |
| `dperez4787/cosmo-router` | The federation router in front of the subgraphs — **the SPA's one and only data backend** |
| `dperez4787/linear-example` | The reference app whose deployment + auth pattern this repo copies |

The SPA talks GraphQL to the cosmo router. It never queries Mongo, never calls a
subgraph directly. The one non-router dependency is the OMDb image API (below), plus
this repo's own chat backend.

## Search capabilities (8th subgraph — "orchestrator", in progress)

An orchestrator subgraph is being added to imdb-federation that materializes search
collections at rebuild time and exposes typed search queries. When it lands, an
**`API-CHANGES.md` in imdb-federation is the authoritative contract** — every new Query
field, input, enum, and result type with semantics, caps, sort behaviors, and the
freshness caveat. Until then, plan against this summary and verify field names by
introspecting the live router before implementing.

What the plan commits to:

- **`searchTitles`** — filter/sort combos including a **POPULARITY default sort**,
  genre filters (genres arrays), `isAdult`, `withPeople` with **ALL/ANY** semantics,
  deterministic paging, and count variants (items only = 1 aggregate; with total = 2).
- **`searchNames`** — `inTitles`, `inGenres` + `active` + `categories` filters,
  popularity and credits sorts, an internal candidate cap.
- Both are text/prefix-indexed (`primaryTitle` / `primaryName`) with prefix indexes for
  **autocomplete**.
- **`searchInfo.rebuiltAt`** exposes index freshness — the UI should surface this
  caveat somewhere unobtrusive.
- Existing entity fields hydrate through federation: search results are entity stubs
  the router expands, so the UI can select any `Title` / `Name` field in the same query.

## Universal (mixed title + person) search — planned fast-follow

`searchTitles` and `searchNames` are deliberately separate today; there is no mixed
query and no shared ranking. The planned fast-follow adds a **`search(query, limit)`
root field returning `union SearchHit = Title | Name`**, ranked by **popularity, not
text score** (name popularity is a materialized sum of title `numVotes`, so the two
numbers are directly comparable — this is what IMDb's own search bar does). The UI
consumes it with `... on Title { }` / `... on Name { }` fragments.

**Zero-backend stopgap the UI can ship first:** one GraphQL request with aliases —

```graphql
titles: searchTitles(filter: { titlePrefix: $q }) { items { ... } }
people: searchNames(filter: { namePrefix: $q }) { items { ... } }
```

— merged client-side by popularity (`rating.numVotes` for titles vs. name popularity).
Known gap: name popularity is not yet exposed as a queryable field; until it is,
client-side merging needs a fallback heuristic. Design the search box as **one
universal input** (one search box beats two radio buttons); explicit title-only /
people-only search remains valuable for the filtered/faceted views and complements it.

## Facets / aggregations (planned)

The design principle on the backend: **never expose raw Mongo pipelines through
GraphQL** — typed aggregation surfaces only, mapping internally onto
`$facet`/`$sortByCount`/`$bucket`.

- **Vocabulary facets** (dropdown/checkbox population — distinct genres, crew
  job types/categories, title types) are **materialized at rebuild** into a small
  `search_facets` collection (one doc per facet, values with counts) and exposed as
  typed GraphQL fields. The UI populates its filter controls from these — never
  hard-code genre or category lists.
- **Awards data does not exist** in the IMDb datasets. Do not design awards features.

## Images — OMDb

Title posters come from the OMDb image API, keyed by IMDb title id (`tconst`):

```
https://img.omdbapi.com/?i=tt3896198&apikey=db1f8efc
```

- The key (`db1f8efc`) is embedded in client-side URLs by design; it is public to every
  browser and lives here deliberately.
- This serves **title posters only** — there is no people-image endpoint and there
  will not be one. Person results need a designed placeholder/initials treatment.
- **Open idea (designer + architect to hash out, per the user):** represent a person
  visually with the poster(s) of titles they were part of — their filmography is
  reachable through federation, so a person card/page could pull one or a small mosaic
  of known-for title posters. Cost to weigh: each poster is an extra OMDb request and
  needs a title id, so this depends on what the person's hydrated fields expose
  (known-for titles / credits) and on sensible request budgets.
- Posters can be missing or 404; every image slot needs a graceful fallback state.
- Search result lists must show poster images for title results. Be considerate with
  request volume (lazy-load offscreen images).

## Authentication

The SPA enforces login exactly like linear-example: **Firebase Auth, Google sign-in
only** (no email/password, no anonymous), one `auth.js` boundary module, one `AuthGate`
component wrapping the entire app. Nothing user-visible renders signed-out except the
sign-in screen.

**Open question for the architect:** how the browser authenticates *to the cosmo
router*. The router's live checks include anonymous 401/403 responses, so it is not
public. Candidate shapes: the router validates Firebase ID tokens (JWT config), a
Firebase Hosting rewrite/proxy, or a thin authenticated proxy on Cloud Run. This must
be settled in `docs/architecture.md` (with the router repo checked, not guessed) before
any data-fetching ticket is implementable.

## Chatbot

The UI includes a chat assistant. Requirements:

- A **backend is required**: something must hold `ANTHROPIC_API_KEY` server-side —
  the key never ships to the browser. Plan: a small Node service on Cloud Run
  (`app/chat/`), deployed like linear-example's backend (image built in CI, tagged by
  SHA, key from Secret Manager).
- The bot answers questions **through the federated GraphQL layer using a simple
  GraphQL MCP server** (this is a hard requirement, not an implementation detail): the
  chat backend runs an agentic loop against the Anthropic API with a GraphQL MCP server
  pointed at the cosmo router, so the model can introspect the schema and execute
  queries as tools.
- Chat requests are authenticated with the user's Firebase ID token; the backend
  verifies it before spending Anthropic tokens.

## Deployment

Copy the linear-example pattern (see its `deploy.yml` and `firebase.json`):

- SPA → **Firebase Hosting**; chat backend → **Cloud Run**.
- GitHub Actions deploy on push to `main`, auth via **OIDC / Workload Identity
  Federation** (`id-token: write`; no service-account keys anywhere).
- Backend image built on the runner from a Dockerfile, pushed to Artifact Registry,
  **tagged by commit SHA, never `latest`**.
- `firebase-tools` pinned to an exact version; `firebase deploy` runs from the repo
  root where `firebase.json` lives.
- GCP project / region / WIF provider values for *this* repo are not yet provisioned —
  an infra ticket, coordinated with the user (IAM changes are run by the user).

## Product intent

A rich, *clever* browsing experience over IMDb data — not a table with filters. The
UI/UX designer owns what "clever" means (see `designs/`), but the ingredients are:
universal search with autocomplete and poster-rich results, faceted exploration
(genres, years, ratings, crew categories) powered by the typed facet fields, deep
title/person pages hydrated through federation (people ↔ titles cross-navigation), and
an ever-present chat assistant that can answer questions about the data. Search result
freshness (`searchInfo.rebuiltAt`) is surfaced honestly.
