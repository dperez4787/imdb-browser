# Architecture

Owned by the **architect** agent. Decisions this repo makes on top of the system
described in `docs/PROJECT-BRIEF.md`. Every decision below states its one-sentence
why and what was verified (repo/file or live probe) on 2026-07-10; anything not
verifiable is marked **Assumption**.

## Settled by inheritance (see CLAUDE.md / the brief)

- React SPA (Vite) on Firebase Hosting; chat backend (`app/chat/`) on Cloud Run.
- Cosmo router is the SPA's only data backend; OMDb images and the chat service are
  the sanctioned exceptions.
- Firebase Auth, Google-only, `auth.js` boundary + `AuthGate` wrapping the app.
- Chatbot: server-side Anthropic agentic loop with a GraphQL MCP server pointed at the
  cosmo router; `ANTHROPIC_API_KEY` in Secret Manager, verified Firebase ID token on
  every chat request.
- Deploy: GitHub Actions on push to `main`, OIDC/WIF, SHA-tagged images, pinned
  `firebase-tools` — mirroring linear-example's `deploy.yml`.

## Router authentication from the browser

**Decision: the SPA sends the signed-in user's Firebase ID token directly to the
router — `Authorization: Bearer <ID token>` on every `POST
https://cosmo-router-dkuqnmldta-uc.a.run.app/graphql` — because the router already
validates exactly that token with zero custom code**, so no proxy, no Hosting rewrite,
and no router change are needed.

How it works (all verified in `dperez4787/cosmo-router`):

- The router's Cloud Run service is deployed `--allow-unauthenticated`
  (`.github/workflows/deploy.yml`); the auth gate is **application-level JWT
  validation** in the router itself, not Cloud Run IAM.
- `config/config.yaml` configures stock Cosmo `authentication.jwt.jwks` with two
  providers: **Firebase ID tokens** (JWKS
  `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`,
  audience allowlist `project-d60a83c1-2c60-4d51-ad0`) and Google OIDC ID tokens
  (service accounts / gcloud). `authorization.require_authentication: true` rejects
  anonymous operations with 401.
- The router→subgraph hop is separately secured by Cloud Run IAM
  (`modules/subgraphtoken/module.go` replaces the client's Authorization header with a
  router-minted service-account ID token), so the browser's token never reaches the
  subgraphs.

**Binding consequence: this repo's SPA must use Firebase project
`project-d60a83c1-2c60-4d51-ad0`** (the linear-example project — its ID is the
router's allowed `aud` claim, and Firebase sets `aud` to the project ID). We register
a *new* Firebase Web App and a *new* Hosting site inside that project (see GCP
provisioning below). A separate Firebase project would work only after adding its
project ID to the router config's `audiences` list and redeploying cosmo-router — we
deliberately avoid that cross-repo change.

Where the credential attaches (for IMDB-4): `auth.js#getIdToken()` (the
linear-example pattern — `user.getIdToken()`, auto-refreshing) supplies the token;
the GraphQL client module sets `Authorization: Bearer <token>` per request. No
request is sent while signed out.

Verified live (2026-07-10) against `https://cosmo-router-dkuqnmldta-uc.a.run.app/graphql`:

- Anonymous `POST /graphql` → **401**.
- Authenticated request (Google OIDC identity token, one of the two configured JWKS
  providers) → **200** with valid data (`{ searchInfo { rebuiltAt } }` and a
  federated `name(...) { knownForTitles { ... } }` query both succeeded).
- CORS preflight (`OPTIONS` with `Origin` + `Access-Control-Request-Headers:
  authorization,content-type`) → 204 with `access-control-allow-origin: *` and
  `Authorization` in `access-control-allow-headers` — so the browser can call the
  router cross-origin from any Hosting site; no proxy needed.

**Assumption (small):** the Firebase-token JWKS path was verified from the router's
config and the matching audience, not exercised live (minting a real Firebase ID
token requires an interactive Google sign-in). IMDB-4's acceptance criteria include
exactly that end-to-end demo with a signed-in user.

## GraphQL client layer

**Decision: `graphql-request` for transport + TanStack Query v5 for caching, no
codegen** — this app is 100% read-only queries whose inputs live in the URL, which
maps 1:1 onto TanStack Query's key-based cache, and a normalized cache (Apollo/urql)
buys nothing here while costing bundle size and a second mental model.

- **Everything lives under `app/frontend/src/graphql/`** (per CLAUDE.md): a
  `client.js` transport wrapper, `queries.js` (all operation documents as `gql`
  template strings), `errors.js` (normalization), and colocated tests. Components
  import query *hooks/keys*, never transport.
- **Auth attach:** `client.js` calls `auth.js#getIdToken()` before each request and
  sets `Authorization: Bearer <token>`. If there is no signed-in user it throws a
  normalized `auth` error without making a network request (AuthGate makes this
  unreachable in practice; the guard makes it structural).
- **Endpoint:** `https://cosmo-router-dkuqnmldta-uc.a.run.app/graphql`, overridable
  via `VITE_ROUTER_URL` (same pattern as linear-example's `VITE_` overrides). No
  other network destination is allowed from this module.
- **No codegen:** the repo is plain JS (linear-example pattern, `*.test.js(x)`), so
  TS codegen would drag in a type toolchain for little benefit; field names are
  verified against the live router / `imdb-federation/API-CHANGES.md` instead.
- **Caching policy (TanStack Query):** `refetchOnWindowFocus: false` everywhere (data
  changes only on index rebuilds). `staleTime`: `facets` and `searchInfo` 1 hour
  (materialized at rebuild); `title`/`name` entity queries 1 hour; `searchTitles`/
  `searchNames`/`search` results 5 minutes. Query keys embed the full variable set
  (e.g. `['searchTitles', filter, sort, page]`) so shareable URLs and cache entries
  stay in lockstep.
- **Error normalization:** every failure surfaces as one shape —
  `{ kind: 'auth' | 'denied' | 'network' | 'graphql' | 'bad-request', message,
  errors }` (`denied` additionally carries `deniedFields`). Any GraphQL error with
  `extensions.code === 'PERMISSION_DENIED'` → `denied` — checked **before** the
  HTTP-status rule, because governance denials arrive as 403 (see § Field-level
  governance); HTTP 401/403 without that marker → `auth`; fetch/transport failure →
  `network`; GraphQL `errors` with `BAD_REQUEST` extensions (the orchestrator's
  validation errors — caps, exclusive fields, offset > 10000) → `bad-request`; other
  GraphQL errors → `graphql`. Views branch on `kind` only.

Verified: `searchTitles` / `searchNames` / `search` / `facets` / `searchInfo`
signatures and validation semantics in
`imdb-federation/subgraph-orchestrator/src/main/resources/schema/orchestrator.graphqls`
and `imdb-federation/API-CHANGES.md` (which has landed and is authoritative); entity
hydration exercised live through the router.

> **Freshness (verified live 2026-07-10):** the search index has been rebuilt —
> `searchInfo.rebuiltAt` is `2026-07-11T03:12:24.167Z` (12,629,478 titles /
> 15,475,639 names) — so search, facets, and entity queries all serve real data.

## Field-level governance (denied fields)

The router enforces field-level policy from the **"IMDb Graph Governance"** service
(`imdb-policy-service` on Cloud Run). Governed coordinates at verification time
(policy bundle **rev 8** — the briefing said rev 7; revisions move at runtime, so
nothing below pins one): `Rating.numVotes` and `Name.birthYear` (role `analyst`
only, `principals` map empty → denied to everyone), `Name.deathYear` (no roles →
denied to all). Default posture is `allow-unless-governed`; grants flip at the
governance console and reach the router within one policy-poll interval — **no
deploy, no code change**. The demo flips grants live; everything below is designed
so the SPA reflects a flip on the next fetch.

### Verified denial shape (live, 2026-07-10)

Any operation whose selection set includes ≥ 1 denied field is rejected **whole** —
HTTP **403**, no `data` key at all, never partial data — with one GraphQL error
aggregating every denied coordinate in the document:

```json
{"errors":[{"extensions":{"code":"PERMISSION_DENIED",
  "deniedFields":["Name.birthYear","Name.deathYear","Rating.numVotes"]},
  "message":"not authorized to read: Name.birthYear, Name.deathYear, Rating.numVotes"}]}
```

The check is static selection-set analysis, not per-row: a denied field nested
three levels deep (`name { knownForTitles { rating { numVotes } } }`) produces the
same 403, so a given (document, principal, bundle) triple always gets the same
verdict. The policy bundle is readable at `GET
https://imdb-policy-service-dkuqnmldta-uc.a.run.app/v1/bundle` (revision,
posture, fields, principals) — useful for ops/debugging, but **the SPA never calls
it**: the router is the SPA's only data backend, and a browser-side capability
probe against the policy service would both break that rule and go stale
mid-session as grants flip.

### Decision — normalized kind `denied`

Any GraphQL error with `extensions.code === 'PERMISSION_DENIED'` normalizes to
`{ kind: 'denied', deniedFields, message, errors }`, with `deniedFields` unioned
across all errors (live it is one aggregated error; the union is defensive against
a future one-error-per-field shape). This rule runs **before** the HTTP-status
mapping, because the denial arrives as a 403 that would otherwise become `auth`.
Why: a signed-in user's governance denial is not a credential problem, and
presenting it as one points users at a useless re-login. `auth` stays reserved for
401/403 without the `PERMISSION_DENIED` marker.

### Decision — select/degrade: optimistic select + strip-and-retry

Operation documents select governed fields normally. When execution comes back
`denied`, the client strips exactly the denied coordinates from the document and
retries **once**; the queryFn then resolves `{ data, deniedFields }` (clean
results resolve `{ data, deniedFields: [] }`). Kind `denied` reaches a view only
if stripping empties the whole document or the retry is denied again. Why
optimistic instead of always-omit or a session-start capability probe: the full
document is re-sent on every fetch, so a live grant is picked up on the very next
fetch with zero code — always-omit needs a code change per grant, and a
capability probe adds a forbidden policy-service dependency and goes stale
mid-session; the cost is one extra round trip per fetch only while a selected
field is denied.

Mechanics the developer must keep (all inside `src/graphql/`):

- Strip via AST `visit` from the `graphql` package (already a dependency of
  `graphql-request`): remove each Field node whose name equals the field part of a
  denied coordinate, then drop any parent field left with an empty selection set,
  recording that parent's coordinate as denied too. Name-based matching is safe
  here because the strip only removes names the router itself just denied in this
  exact document.
- **Never cache the stripped document across fetches** — re-sending the optimistic
  full document is the grant-detection mechanism.
- `denied` is non-retryable at the TanStack layer (like `auth`/`bad-request`); the
  strip-and-retry lives inside the queryFn, not in TanStack `retry`.
- Author documents so no parent selects *only* governed leaves (e.g. `rating`
  always co-selects `averageRating` beside `numVotes`), so stripping degrades a
  field, never a whole object.

### Decision — caching: denial-scoped staleTime

A degraded result (`deniedFields` non-empty) gets **`staleTime` 60 seconds** via
TanStack v5's function form
(`staleTime: (query) => query.state.data?.deniedFields?.length ? 60_000 : <normal>`);
clean results keep the standard policy (1 h entities, 5 m searches). Why: this
scopes the freshness cost to exactly the cache entries a grant flip can change —
60 s matches the order of the router's policy-poll interval, and ungoverned
queries pay nothing. Demo behavior this yields: **deny → grant** — the degraded
entry goes stale within 60 s, the next mount/fetch re-sends the full document and
renders the real value; **grant → re-deny** — the clean result ages under the
normal staleTime, so re-denial appears on the next fetch past staleTime or on any
page reload (the query cache is in-memory only, no persistence, so a reload is
always a fresh fetch). Both directions satisfy "the next fresh fetch reflects it,
no redeploy".

### Contract for views (feeds the shared restricted-field treatment)

- Every query hook exposes `deniedFields` (array of `Type.field` coordinates,
  possibly empty) alongside `data`; the plumbing lives in `src/graphql/`, and no
  component outside it parses raw GraphQL errors or `extensions`.
- **Restricted ≠ absent.** A coordinate present in `deniedFields` was stripped by
  governance → render the shared restricted treatment. A null/absent value whose
  coordinate is *not* in `deniedFields` is genuinely missing data → render the
  empty state. These are the only two rules a view needs.
- The shared restricted-value component (IMDB-14) is the single consumer-facing
  rendering of this state; feature views pass it the coordinate they wanted.

### Verified vs assumed

- **Verified live 2026-07-10** (Google OIDC identity token against the live
  router): the 403/no-`data` whole-operation rejection, the aggregated
  `PERMISSION_DENIED`/`deniedFields` error shape (single- and multi-coordinate,
  including a nested selection), a clean query 200 alongside, and
  `GET /v1/bundle` (rev 8, three governed coordinates, empty `principals`).
- **Assumption:** grant-propagation latency ("within one poll interval") is the
  user's description of the policy service, not exercised live — flipping grants
  is user-only; the 60 s staleTime is sized to that claim.
- **Assumption:** the single-aggregated-error shape is stable; the normalizer's
  union across errors keeps a one-error-per-field change from breaking it.

## Chat backend API contract

**Decision: one streaming endpoint, stateless server, `mcp-graphql` as the MCP
server, and the user's own Firebase ID token forwarded to the router** — the simplest
shape that satisfies every hard requirement while keeping the user's identity on
every graph query.

- **Endpoint:** `POST /api/chat` responding with **Server-Sent Events**
  (`Content-Type: text/event-stream`; the SPA consumes it with `fetch` +
  `ReadableStream`, no EventSource needed). Streaming is required UX: the agentic
  loop (model turns + GraphQL tool calls) routinely takes several seconds.
  - Request body: `{ "messages": [{ "role": "user"|"assistant", "content": "…" }] }`
    — full history from the client, newest last, **max 20 messages / 16 KB body**
    (413/400 beyond that).
  - SSE events: `text` (`{delta}` — assistant text chunks), `tool` (`{name}` only —
    lets the UI show "querying the graph…" without leaking query internals), `done`
    (`{usage: {input_tokens, output_tokens}}`), `error` (`{kind, message}`).
  - `GET /health` unauthenticated liveness probe (linear-example pattern).
- **Session/history model: stateless.** The server holds no session store — the
  client resends capped history each call. Why: no database in this repo, Cloud Run
  scales to zero, and chat history is not a durable product requirement.
- **Auth:** every `/api/chat` request carries `Authorization: Bearer <Firebase ID
  token>`; the backend verifies it with `firebase-admin`'s `verifyIdToken()`
  (project `project-d60a83c1-2c60-4d51-ad0`, ADC — no key file) **before any
  Anthropic call**. Invalid/missing token → 401, provably zero Anthropic spend. The
  Cloud Run service itself deploys `--allow-unauthenticated` (like linear-example's
  backend and the router): the app-level token check is the gate.
- **GraphQL MCP server: `mcp-graphql` (npm, verified: v2.0.4, deps
  `@modelcontextprotocol/sdk` 1.12 + `graphql` 16, repo github.com/blurrah/mcp-graphql).**
  Spawned as a stdio child per request via the MCP SDK client, configured with
  endpoint = the router's `/graphql` URL and header `Authorization: Bearer <the
  requesting user's Firebase ID token>` — the same credential the browser uses, so
  the bot's data access is exactly the user's, with no extra service credential or
  router change. Mutations stay disabled (mcp-graphql default; the graph has none).
  Its two tools (`introspect-schema`, `query-graphql`) are exposed to the model.
- **Anthropic wiring:** `@anthropic-ai/sdk`, model **`claude-opus-4-8`**, streaming
  (`messages.stream`), agentic tool-use loop over the MCP tools. `ANTHROPIC_API_KEY`
  from env only (Secret Manager in prod, gitignored `.env` locally).
- **Token/cost guardrails (observable per IMDB-10's AC):**
  - `max_tokens: 2048` per model response.
  - **Max 8 tool iterations** per request; on hitting the cap the loop stops and the
    reply says it couldn't finish.
  - History cap enforced server-side (last 20 messages; oversize body → 400/413).
  - In-memory per-user rate limit: **10 requests/minute per verified `uid`** →
    429 with a friendly SSE `error`. (In-memory is acceptable: max-instances stays
    small; a shared store is deliberate later work.)
  - A system prompt pins the bot to answering from the federated graph via its tools.

**Assumption:** mcp-graphql v2.0.4's env/flag names for endpoint+headers are taken
from its README (package verified on npm; exact flag spelling to be confirmed by the
developer at implementation — it does not change this contract).

## Frontend routing & URL scheme

**Decision: `react-router` (v7, library mode, `BrowserRouter`), URL query params as
the single source of truth for search/facet state, and no state-management library**
— the URL already is the shareable state IMDB-6 needs, TanStack Query owns server
data, and React context is only used for auth (linear-example pattern).

Routes:

| Path | View |
|------|------|
| `/` | Home: universal search box (+ entry points) |
| `/search?q=…` | Universal (mixed title+person) results — IMDB-5 |
| `/titles?…` | Faceted title search — IMDB-6 |
| `/title/:tconst` | Title detail — IMDB-7 |
| `/person/:nconst` | Person detail — IMDB-8 |

Chat (IMDB-11) is a persistent panel/drawer, not a route.

URL scheme for `/titles` (IMDB-6): every filter/sort/page lives in query params;
**defaults are omitted** so canonical URLs stay short; multi-values are
comma-separated. Params (names mirror `TitleSearchFilter` fields, verified in
`orchestrator.graphqls`): `q`, `titlePrefix` is not URL state (autocomplete only),
`types`, `genres` (genresAny), `genresAll`, `yearFrom`/`yearTo`, `runtimeFrom`/`runtimeTo`,
`ratingFrom`/`ratingTo`, `votesFrom`, `adult=1`, `people` (nconsts), `peopleMode=ANY`
(ALL is the API default), `cats` (peopleCategories), `sort` (enum name, omitted when
`POPULARITY_DESC`), `page` (1-based, omitted when 1; page size fixed at 24 in v1,
offset = (page-1)×24, ≤10 000 per the API cap). `/search` uses `q` only. One module
(`src/titles/urlState.js` or similar) owns param⇄filter mapping; components never
parse `location.search` themselves.

Deep links work because Firebase Hosting rewrites `**` → `/index.html`
(linear-example `firebase.json`, same shape here). Loading any URL fresh while
signed in reproduces the view: params → filter object → TanStack Query key.

State-manager stance: **none in v1.** Adding Redux/Zustand would create a second
home for state that must live in the URL to satisfy IMDB-6's shareability criterion.

## GCP provisioning for this repo

**Decision: deploy into the existing project `project-d60a83c1-2c60-4d51-ad0`
(us-central1) — the project that already hosts the router, subgraphs, linear-example,
and the Firebase Auth users** — because router auth *requires* this Firebase project
(see above) and the shared WIF pool/APIs already exist there, this is the smallest
provisioning surface. Repo-scoped resources get their own names; nothing existing is
touched.

Verified pattern sources: `linear-example/infra/*.tf` + `infra/README.md` (pool,
deploy/runtime SA split, secret container without version, resource-scoped
accessor), `cosmo-router/infra/wif.tf` (second repo adds only its own provider to
the shared `github-pool`; APIs already enabled by the imdb-federation stack).

What must exist (all **user-run** — agents never execute IAM changes):

| Resource | Value |
|---|---|
| WIF provider (in existing `github-pool`) | `github-provider-imdbbrowser`, condition `assertion.repository == 'dperez4787/imdb-browser'` |
| Deploy SA | `imdb-browser-deploy@project-d60a83c1-2c60-4d51-ad0.iam.gserviceaccount.com` — roles `artifactregistry.writer`, `run.admin`, `iam.serviceAccountUser`, `firebasehosting.admin`; `workloadIdentityUser` for the repo's principalSet |
| Runtime SA (chat) | `imdb-browser-run@…` — no project roles; resource-scoped `secretmanager.secretAccessor` on the secret |
| Artifact Registry repo | `imdb-browser` (Docker, us-central1) |
| Secret | `ANTHROPIC_API_KEY` — container only; version added by hand from stdin, never in code/state |
| Firebase Hosting site | `imdb-browser` (second site in the project; deploy targets map it) |
| Firebase Web App | new app "imdb-browser" in the same project → committed `firebase.js` config |
| Auth authorized domain | add `imdb-browser.web.app` in Firebase Console → Auth → Settings |
| GitHub repo secrets | `WIF_PROVIDER` (full provider resource name), `DEPLOY_SA` |
| Cloud Run service (CI-owned) | `imdb-browser-chat`, created by `gcloud run deploy` in deploy.yml — **not** provisioned by hand, per the cosmo-router/linear-example convention |

User-run commands (Owner credentials, `gcloud auth login` first):

```sh
PROJECT=project-d60a83c1-2c60-4d51-ad0
PROJECT_NUMBER=$(gcloud projects describe $PROJECT --format='value(projectNumber)')

# 1. WIF provider in the existing shared pool
gcloud iam workload-identity-pools providers create-oidc github-provider-imdbbrowser \
  --project=$PROJECT --location=global --workload-identity-pool=github-pool \
  --display-name="GitHub imdb-browser" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository == 'dperez4787/imdb-browser'"

# 2. Service accounts
gcloud iam service-accounts create imdb-browser-deploy --project=$PROJECT --display-name="imdb-browser GitHub Actions deploy"
gcloud iam service-accounts create imdb-browser-run    --project=$PROJECT --display-name="imdb-browser chat runtime"

# 3. Deploy SA roles (additive member bindings)
for ROLE in roles/artifactregistry.writer roles/run.admin roles/iam.serviceAccountUser roles/firebasehosting.admin; do
  gcloud projects add-iam-policy-binding $PROJECT \
    --member="serviceAccount:imdb-browser-deploy@$PROJECT.iam.gserviceaccount.com" --role="$ROLE"
done
gcloud iam service-accounts add-iam-policy-binding \
  imdb-browser-deploy@$PROJECT.iam.gserviceaccount.com --project=$PROJECT \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/dperez4787/imdb-browser"

# 4. Artifact Registry
gcloud artifacts repositories create imdb-browser --project=$PROJECT \
  --location=us-central1 --repository-format=docker

# 5. Secret container + value (value from stdin, never echoed)
gcloud secrets create ANTHROPIC_API_KEY --project=$PROJECT --replication-policy=automatic
printf '%s' "sk-ant-…" | gcloud secrets versions add ANTHROPIC_API_KEY --project=$PROJECT --data-file=-
gcloud secrets add-iam-policy-binding ANTHROPIC_API_KEY --project=$PROJECT \
  --member="serviceAccount:imdb-browser-run@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor

# 6. Firebase: second Hosting site + Web App (then paste the config into app/frontend/src/firebase.js)
firebase hosting:sites:create imdb-browser --project $PROJECT
firebase apps:create web imdb-browser --project $PROJECT
firebase apps:sdkconfig web <APP_ID> --project $PROJECT
# Console (manual): Auth → Settings → Authorized domains → add imdb-browser.web.app

# 7. GitHub secrets
gh secret set DEPLOY_SA    --repo dperez4787/imdb-browser --body "imdb-browser-deploy@$PROJECT.iam.gserviceaccount.com"
gh secret set WIF_PROVIDER --repo dperez4787/imdb-browser --body "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider-imdbbrowser"
```

Workflow shape (IMDB-12, mirrors linear-example `deploy.yml` verbatim where
possible): two jobs on push to `main`, each with `permissions: id-token: write`;
backend job builds `app/chat/Dockerfile` → pushes
`us-central1-docker.pkg.dev/$PROJECT/imdb-browser/chat:${{ github.sha }}` → `gcloud
run deploy imdb-browser-chat --service-account imdb-browser-run@… --set-secrets
ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest --allow-unauthenticated`; frontend job
`npm ci && npm run build` → pinned `firebase-tools` → `firebase deploy --only
hosting:imdb-browser` from the repo root. `firebase.json` uses a named hosting
target (`"site": "imdb-browser"` via `.firebaserc` targets) — required because the
project already serves linear-example from its default site. No `latest` tags,
no SA keys, `firebase.json` at repo root.

APIs: already enabled in this project by the linear-example/imdb-federation stacks
(verified in `linear-example/infra/apis.tf` and noted in `cosmo-router/infra/wif.tf`);
no new enablement expected. **Assumption:** none of them have been disabled since.

**Additional user-run prerequisite (different repo):** run imdb-federation's
`./scripts/rebuild.sh` once so the search collections exist (see the caveat in the
GraphQL client section).

## Person visuals — data facts & OMDb budget (input to IMDB-9's design)

The designer owns the visual treatment; these are the verified data facts and the
request budget the design must fit.

Data facts (verified in `imdb-federation/subgraph-names/…/schema/names.graphqls` and
live through the router on 2026-07-10):

- `Name.knownForTitles: [Title!]` exists and hydrates through federation: one query
  can select `knownForTitles { tconst primaryTitle startYear rating { numVotes } }`.
  Live check: `name(nconst: "nm0000199")` (Al Pacino) returned 4 fully hydrated
  known-for titles.
- The field comes from the IMDb dataset's `knownForTitles` column: **at most 4
  titles per person**, may be empty or null. It is selectable anywhere a `Name`
  appears — `name`/`names`, `searchNames.items`, and `... on Name` fragments in the
  unified `search` — so person cards get title ids with **zero extra GraphQL
  requests**.
- Poster URL per title id: `https://img.omdbapi.com/?i=<tconst>&apikey=db1f8efc`
  (key public by design, per the brief). Posters can be missing/404 — every slot
  needs the fallback.

OMDb request budget (constraint for the design):

- **Person card in any list (search results, cast strips): ≤ 1 poster request** —
  the single most-voted known-for title (client-side max over `rating.numVotes`,
  which the same query already fetched). **Governance caveat:** `Rating.numVotes`
  is a governed field currently denied to everyone (see § Field-level governance);
  while denied, the poster pick falls back to the **first `knownForTitles` entry**
  (dataset order) — the restricted treatment applies only where a vote count would
  be *displayed*, never to the poster heuristic, which degrades silently.
- **Person detail header: ≤ 4 poster requests** (the full known-for set, e.g. a
  mosaic) — only if the design wants them.
- All person-poster images **lazy-load** (same rule as title posters); never
  prefetch posters for offscreen cards; no retries on 404 — fall back to the
  initials/placeholder treatment immediately.
- Rationale: a 24-result people page then costs ≤ 24 poster requests, the same
  order as a title results page. **Assumption:** the OMDb key is a free-tier key
  (nominally 1 000 req/day); budgets above keep normal browsing well under it, and
  browser HTTP caching de-duplicates repeats.

If the designer chooses "keep the initials placeholder", nothing here is wasted —
the budget section simply goes unused.

## Module boundaries (recap)

- `app/frontend/src/graphql/` — the only GraphQL transport (see client layer).
- `app/frontend/src/auth.js` + `AuthGate` — the only Firebase Auth surface.
- `app/frontend/src/<feature>/` (`search/`, `titles/`, `title/`, `people/`, `chat/`)
  — views import from `graphql/`, never fetch.
- `app/chat/src/` — thin HTTP handlers; Anthropic loop in `anthropic.js`-style
  module; MCP client/spawn wiring in its own module; auth verification middleware
  isolated so tests can prove "401 before Anthropic".
