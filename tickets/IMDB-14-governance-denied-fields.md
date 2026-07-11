---
id: IMDB-14
title: Governance-denied fields — client 'denied' handling + shared restricted-field treatment
status: in-progress
owner: product-owner
design: designs/DES-8-restricted-field-treatment.md
depends-on: [IMDB-4]
branch: "imdb-14-governance-denied-fields"
pr: ""
---

## Description

The cosmo router now enforces **field-level governance** from a policy service ("IMDb
Graph Governance", `imdb-policy-service` on Cloud Run, currently policy bundle rev 7).
Three field coordinates are governed today and **all currently deny everyone**:
`Rating.numVotes` (ratings subgraph), `Name.birthYear` and `Name.deathYear` (names
subgraph). Ungoverned fields flow freely; a governed field with no granted roles denies
everyone; grants take effect at the router within one poll interval — **no deploy**.
When an operation selects a denied field the router rejects it with PERMISSION_DENIED
carrying `extensions.deniedFields` (verified live during IMDB-4 — see its Log and PR #8;
the implementer must re-verify the exact HTTP status and error shape against the live
router, as it may have evolved with the policy service).

The user will toggle grants live in a demo. This ticket makes the SPA honest and
resilient about it, in two pieces:

1. **Client layer (`app/frontend/src/graphql/`).** A governance denial gets its own
   normalized kind — `denied`, carrying the denied field coordinates — instead of
   today's mapping of HTTP 401/403 → kind `auth`, which would paint a field-governance
   denial as a sign-in problem. Because the router rejects the *whole operation* when a
   denied field is selected (per the IMDB-4 finding), the client also needs the
   mechanism the architect settles (e.g. optimistic select + strip-`deniedFields`-and-
   retry, or conditional selection) so one denied field never blanks a whole view.
2. **Shared restricted-field UI treatment (designer-owned).** One reusable visual
   treatment that says "this value is restricted" — explicitly distinct from the
   absent-data state (a person with no recorded birth year is not the same as a denied
   `birthYear`) — for IMDB-7/8/9's views to reuse.

**Designer must answer:** the restricted-value visual and copy (distinct from
empty/missing; tooltip or label explaining restriction), where it applies as a general
pattern (title vote count, person lifespan, any future governed field), and — in the
same pass — **revise DES-4, DES-5, and DES-6**, which currently assume the denied
fields are readable (DES-4's vote count under the stars; DES-5's lifespan line and
`numVotes`-ranked known-for fallback; DES-6's most-voted-known-for poster pick), and
**trim DES-2/DES-3's query snippets**, which still select `numVotes`.

**Architect must answer** (dual-blocked, IMDB-6 precedent — designer flips to
`needs-architecture` if design lands first): re-verify the exact denial response shape;
settle the select/degrade policy for governed fields and how `kind: 'denied'` +
`deniedFields` surface through the query hooks; and settle caching for denied results —
a denial cached for the 1-hour entity `staleTime` would make a live grant flip
invisible for an hour and wreck the demo.

## Acceptance criteria

- With a governed field denied (the live default today), executing a query document
  that selects it surfaces to callers as the normalized kind `denied` carrying the
  denied field coordinates — demonstrated by colocated unit tests (mocked transport)
  and one live integration check recorded on the PR (e.g. selecting `Rating.numVotes`).
- A governance denial is never presented as an authentication failure: kind `auth`
  remains reserved for credential problems, and unit tests prove a signed-in user's
  governed-field denial does not normalize to `auth`.
- A query mixing governed and ungoverned fields still delivers the ungoverned data to
  the view (per the architect's settled mechanism): with `Rating.numVotes` denied, a
  title query's other fields (title, year, rating stars) still resolve — one denied
  field never blanks a whole result. Unit-tested; the mechanism is documented in
  `src/graphql/`.
- The shared restricted-field treatment renders exactly as its approved design spec
  defines, is visually distinct from the absent-data state, and is exported for reuse
  by other views (component tests colocated).
- After a grant changes at the governance console, the next fresh fetch reflects it
  with **no redeploy and no code change**: granted → real value appears; re-denied →
  the restricted treatment returns. Verified once live end-to-end coordinated with the
  user (who operates the governance console); if that session can't be scheduled, the
  tester records it explicitly as unverified and the caching-seam tests (denied results
  are not served stale beyond the settled policy) stand in.
- `npm test` green; no component outside `src/graphql/` parses raw GraphQL errors or
  `extensions` (repo search).

## Files expected to change

- app/frontend/src/graphql/ (errors.js `denied` kind, client/hooks degrade mechanism, tests)
- app/frontend/src/ (shared RestrictedValue-style component + tests; exact home per the design/architecture)
- designs/ (new restricted-treatment spec; DES-4/DES-5/DES-6 revisions, DES-2/DES-3 snippet trims — designer)
- docs/architecture.md (denial shape, select/degrade policy, caching for denied — architect)

## Log

- **product-owner** — filed. `needs-design` (shared restricted-field treatment +
  DES-4/5/6 revisions), dual-blocked on architecture (denial shape re-verification,
  select/degrade policy, denied-result caching). Grounding: user-confirmed governance
  facts (three deny-everyone coordinates, poll-interval grant propagation) + IMDB-4's
  live PERMISSION_DENIED/`deniedFields` finding (its Log, PR #8). This is the
  foundation for the governance-aware ACs added to IMDB-7/8/9; those tickets now
  depend on this one. IMDB-5/6 got Log advisories only (they display no governed
  field, but their design query snippets must stop selecting them).
- **ui-ux-designer** — design settled: **`designs/DES-8-restricted-field-treatment.md`**
  (approved) is the shared treatment — `RestrictedValue`, a static hatched
  redaction pill with a lock glyph occupying exactly the replaced value's line box;
  inline and line-level variants; tooltip on hover *and* keyboard focus; SR text
  `"<Label>: restricted by data governance."`; zero layout jump on grant flips in
  both directions; driven solely by the hook's `deniedFields` per the two-rule
  contract in architecture § Field-level governance. Revised in the same pass:
  DES-4 (RatingBlock's three-way vote-count slot: value / restricted pill / whole
  block absent), DES-5 (lifespan denied-vs-missing matrix, line-level variant when
  both years denied; known-for strip now `knownForTitles` dataset order — never
  reads `numVotes`), DES-6 (card pick = first known-for entry, silent opportunistic
  max-voted upgrade when granted, no treatment on cards). One deliberate deviation
  from this ticket's description: DES-2/DES-3 snippets were **not trimmed** — per
  the architect's optimistic-select policy they keep selecting `numVotes` with
  explicit governance notes (the full document is the grant-detection mechanism),
  and both specs now state that no rendered element depends on a governed field
  (DES-2's votes parenthetical is opportunistic and silently absent while denied).
  Architecture and design both settled → `ready-for-dev`.
- **governance-platform** (external: imdb-policy-service/cosmo-router effort) — ⚠️
  **the denial contract changed live** after this ticket's grounding. The router now
  defaults to **transparent redact mode**: an operation selecting a denied field
  returns **HTTP 200 with the denied fields ABSENT from `data`** (alias-aware,
  per-element in lists) and **no `errors` array at all** — the strip-`deniedFields`-
  and-retry mechanism is no longer needed; partial data arrives in one round trip.
  The machine-readable signal moved to top-level
  `extensions.governance: { redactedFields: ["Rating.numVotes"], roles: [...],
  revision: N }`. `kind: 'denied'`/RestrictedValue remain exactly right — drive them
  from `extensions.governance.redactedFields` instead of an error. The architect's
  optimistic-select policy holds up perfectly (keep selecting governed fields; their
  absence + the extension IS the grant-detection signal). Reject mode (the 403 shape
  IMDB-4 observed) still exists but only for subscriptions and as a config fallback.
  Also live now: `X-Imdb-Roles` and `X-Imdb-Policy-Revision` response headers
  (CORS-exposed) for the role badge (see IMDB-15), and the router's CORS
  `allow_headers` now includes `Authorization` explicitly. Caching note stands:
  redacted results must not be cached past the settled policy or grant flips stay
  invisible. Verify live: any persona token from the governance console playground
  (https://imdb-policy-service-dkuqnmldta-uc.a.run.app) against the router.
- **developer** — claimed. Branch `imdb-14-governance-denied-fields`. Implementing the
  architecture § Field-level governance contract: `denied` kind before the HTTP-status
  rule in `errors.js`, optimistic-select + strip-and-retry in `client.js`, hooks
  resolving `{ data, deniedFields }` with denial-scoped 60 s staleTime, `denied`
  non-retryable in `queryClient.js`, plus the shared `RestrictedValue` component per
  DES-8. IMDB-5 runs in parallel; staying strictly inside the existing
  `src/graphql/` files + new `src/components/RestrictedValue.*` files + an appended
  `styles.css` section.
