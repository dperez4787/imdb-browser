---
id: IMDB-14
title: Governance-denied fields — client 'denied' handling + shared restricted-field treatment
status: done
owner: product-owner
design: designs/DES-8-restricted-field-treatment.md
depends-on: [IMDB-4]
branch: "imdb-14-governance-denied-fields"
pr: "https://github.com/dperez4787/imdb-browser/pull/13"
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
- **developer** — implemented, `in-review`, PR #13 (draft). **The contract change in
  the governance-platform notice above landed mid-implementation** and was verified
  directly against the live router (2026-07-11, policy revision 8): a query selecting
  `Rating.numVotes` now returns HTTP 200 with `numVotes` absent and
  `extensions.governance.redactedFields: ["Rating.numVotes"]` — observed verbatim via
  curl and through the client module. Consequences: the strip-and-retry mechanism was
  built, then **deleted before landing** (no dead code with an untriggerable fallback);
  `client.js#executeWithDenials` now reads the governance extension off successful
  responses (`rawRequest`, because `request()` discards extensions) and resolves
  `{ data, deniedFields }` in one round trip. Kept per contract: `kind: 'denied'`
  in `errors.js` as the defensive branch for the residual reject mode
  (PERMISSION_DENIED before the HTTP-status rule, `deniedFields` unioned across
  errors — a governance denial never reads as `auth`); full optimistic document every
  fetch (grant detection); hooks exposing `deniedFields` alongside `data`; 60 s
  function-form staleTime for degraded results; `denied` non-retryable at TanStack;
  `RestrictedValue` + `isRestricted` per DES-8 (unchanged by the contract shift),
  colocated tests, styles as a delimited appended `styles.css` section. Files:
  `src/graphql/{client,errors,hooks,queryClient}.js` + tests,
  `src/components/RestrictedValue.{jsx,test.jsx}`, `styles.css`; also updated
  IMDB-4's `tester-acceptance.test.js` case (403+PERMISSION_DENIED → now `denied`,
  was `auth`) and `queries.js`'s stale header comment (documents may select governed
  fields now) — no operation document changed. Verified: `npm ci`/`npm test` green
  (197 passed, 10 skipped after merging main), `npm run build` green, live suite
  7/7 through the real client with a gcloud OIDC token — `Rating.numVotes` query →
  200, field absent, `deniedFields === ['Rating.numVotes']`, ungoverned siblings
  intact. NOT verified: the live grant-flip AC (user-operated governance console —
  the remaining live criterion; 60 s staleTime seam tests stand in), browser/Firebase
  token path (no view consumes the hooks yet — IMDB-7/8 are the consumers), reject
  mode live (no longer triggerable via queries; unit-tested only). ⚠️ For the
  architect: `docs/architecture.md` § Field-level governance still specifies
  strip-and-retry and the 403 shape as primary — needs the redact-mode amendment
  (not rewritten here; architect-owned).
- **tester** — verdict: **all agent-verifiable criteria PASS**; ticket → `done`,
  PR #13 approved and taken out of draft per the user's 2026-07-11 directive
  (human-only live criteria deferred to the upcoming testing period). Verified
  against the amended contract — the governance-platform notice above and
  `docs/architecture.md` § Field-level governance as merged to main via PR #12
  (this branch's local copy predates that merge; the PR does not touch the file,
  so main's version governs and no conflict exists). Own suites added
  (`IMDB-14:`-prefixed commit): `src/imdb14-acceptance.tester.test.jsx` (hooks
  contract proven through the REAL client with only auth.js/fetch faked — not a
  mocked client.js), `src/graphql/imdb14-live.tester.test.js` (token-gated live
  probes), and a rewrite of IMDB-4's stale "denied fields never selected" guard
  in `tester-acceptance.test.js` (it enforced the superseded reject-mode policy;
  now enforces the co-selection document-style rule). Per criterion:
  1. **Denial surfaces with coordinates — PASS.** Under the live redact
     contract the primary surface is `deniedFields` on a successful result
     (unit: developer's `client.test.js` + my full-stack probes), with kind
     `denied` as the reject-mode fallback (unit, both suites). LIVE
     (2026-07-11-dated policy rev 8, Google OIDC token, real client module):
     `Rating.numVotes` query → resolved (HTTP 200 — `rawRequest` rejects
     non-2xx; raw curl cross-check `HTTP 200`,
     `extensions.governance.redactedFields:["Rating.numVotes"]`, `revision: 8`,
     `x-imdb-policy-revision: 8`), `numVotes` absent from `data`,
     `deniedFields === ['Rating.numVotes']`. My additional live probes:
     alias-aware (`votes: numVotes` absent under its alias, reported under its
     coordinate) and three-coordinate union (`Name.birthYear`,
     `Name.deathYear`, `Rating.numVotes` from one document, per-element
     absence across `knownForTitles`) — 10/10 live tests green.
  2. **Never presented as auth — PASS.** Ordering proven at the unit seam
     (403+PERMISSION_DENIED → `denied` never `auth`; bare 401/403 → `auth`;
     union deduplicated across multiple errors) in my suite, the developer's,
     and live (invalid token → `auth`).
  3. **Mixed query never blanked — PASS.** Unit (through the real client) and
     LIVE: with `numVotes` denied, `primaryTitle`/`startYear`/`averageRating`
     all resolve; one round trip, no retry. Mechanism documented in
     `src/graphql/client.js`/`queries.js`/`hooks.js` headers.
  4. **RestrictedValue per DES-8 — PASS** at component level: inline + line
     variants, tooltip on hover AND keyboard focus with the spec copy, Esc
     with focus retained, SR text `"<Label>: restricted by data governance."`,
     aria-hidden decoration, static (no animation asserted in the DOM and
     against the committed `styles.css` section — no
     animation/keyframes/transition), `isRestricted` whole-coordinate matching
     (never substrings/bare leaves), exported for reuse. DES-8's confusion
     rule has explicit coverage: my two-rule-contract demo proves
     denied-coordinate → pill renders vs null-and-not-denied → silent absence.
     Caveat: verified in jsdom; in-browser pixel rendering rides with the
     deferred browser path (no view consumes the component until IMDB-7/8).
  5. **Live grant flip — NOT VERIFIED, deferred** (user directive 2026-07-11:
     human-only live criteria move to the upcoming testing period; the user
     operates the governance console). Per this AC's own fallback clause the
     caching-seam tests stand in and PASS: function-form staleTime resolves
     60 s iff the cached envelope reports denials (1 h entities / 5 m searches
     otherwise), installed on real rendered hooks; `denied` non-retryable at
     TanStack; full optimistic document re-sent every fetch (grant-detection).
  6. **Suite green, boundary clean — PASS.** Clean checkout `npm ci && npm
     test`: exit 0, 217 passed / 13 skipped (token-gated live suites);
     with `LIVE_ROUTER_TOKEN`: 227 passed / 3 skipped, exit 0; `npm run build`
     exit 0. Repo search: no `extensions`/raw-error parsing outside
     `src/graphql/` (only my test fixtures at `src/` fabricate transport
     responses; no component touches them), no `fetch()` outside sanctioned
     boundaries, no inline query strings in components (comment-only matches).
  Also NOT VERIFIED (unchanged from the developer's list, both deferred or
  structurally untriggerable): browser/Firebase-token path (no consuming view
  yet), reject mode live (redact mode makes it unreachable via queries —
  unit-only by design).
- **developer** — fix round on PR #13 after an adversarial review surfaced four
  defects; all four verified against the code before fixing, all four real, all
  four fixed (one commit on the branch, plus a merge of main to pick up PR #12's
  architecture amendment).
  1. **RestrictedValue tooltip conflated hover and focus in one boolean**
     (`src/components/RestrictedValue.jsx`): `onMouseLeave` unconditionally
     closed the tooltip even while the pill held keyboard focus (DES-8: focus
     holds it until blur/Esc), and a hover-opened tooltip had no Esc path
     (keydown never reaches an unfocused element). Now hover and focus are
     tracked separately (open = hover OR focus), Esc sets a dismissal that
     overrides both while keeping focus (span-level handler plus a
     document-level listener attached only while open, for the hover-only
     case), and a fresh hover/focus re-expresses intent and re-opens. Five new
     colocated tests cover: mouseout-while-focused stays open,
     blur-while-hovered stays open, Esc on a hover-only tooltip, Esc while
     hovered+focused (dismissal holds until fresh intent, focus retained), and
     the document listener detaching when closed.
  2. **Caller-supplied `staleTime` silently disabled the denial-scoped 60 s
     freshness** (`src/graphql/hooks.js`): the options spread came after
     `staleTime`, so any per-call `staleTime` replaced the denial-scoped
     function entirely — one call site could hide a live grant flip for an
     hour. Now the caller's `staleTime` is extracted, substituted as the
     *base* window, and denial-scoped like any other: when the cached envelope
     reports denials the result is fresh for `min(60 s, base)` regardless of
     caller options (non-numeric bases — `Infinity`, `'static'`, function form
     — cannot dodge the cap). Three new tests, including through a real
     rendered hook with `staleTime: 24h` in options.
  3. **`getIdToken()` rejection escaped `rawExecute` un-normalized**
     (`src/graphql/client.js`): the token fetch sat outside the try block, so
     a rejected Firebase token refresh surfaced as a raw exception — the one
     failure path outside the documented normalized shape. Now it's caught and
     thrown as the new `tokenFetchError(err)` from errors.js: kind `'auth'`
     (credential problem, never `'network'`), message carrying the cause and
     the no-request-was-sent guarantee, idempotent for already-normalized
     errors. Tests in client.test.js (execute + executeWithDenials paths,
     nothing sent) and errors.test.js (factory shape).
  4. **client.js NOTE comment misstated the source of truth**: it claimed
     `docs/architecture.md` still specified strip-and-retry with an amendment
     pending — but the architect's redact-mode amendment landed on main via
     PR #12. Comment rewritten to point at architecture § Field-level
     governance as the settled source of truth; `origin/main` merged into the
     branch so the in-branch copy matches. Comment-only change — no runtime
     behavior, so no test (noted honestly rather than inventing a doc-diff
     test).
  Verified: `npm ci && npm test` green (230 passed / 13 token-gated skipped),
  `npm run build` green, and the full suite with `LIVE_ROUTER_TOKEN` against
  the real router green twice (240 passed / 3 skipped; one earlier live run
  had 2 transient failures that did not reproduce — Cloud Run cold-start
  latency, not code). PR left out of draft as instructed; body's verified
  list updated.
