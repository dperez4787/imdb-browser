---
id: IMDB-10
title: Chat backend scaffold — Anthropic agentic loop with GraphQL MCP on Cloud Run
status: in-progress
owner: product-owner
depends-on: []
branch: "imdb-10-chat-backend-scaffold"
pr: "https://github.com/dperez4787/imdb-browser/pull/5"
---

## Description

The Node service in `app/chat/` that powers the chat assistant. Hard requirements from
the brief: `ANTHROPIC_API_KEY` lives server-side only (Secret Manager in prod,
gitignored `.env` locally — never in code, PRs, or tickets); the bot answers questions
**through the federated GraphQL layer via a simple GraphQL MCP server** pointed at the
cosmo router, driven by an agentic loop against the Anthropic API so the model can
introspect the schema and execute queries as tools; and every chat request carries a
Firebase ID token the backend verifies **before** spending Anthropic tokens. Blocked on
the OPEN "Chat backend API contract" section of `docs/architecture.md`: endpoint shape
(streaming?), session/history model, which GraphQL MCP server package, how the backend
authenticates to the router (adjacent to IMDB-3's browser-side decision), and
token/cost guardrails. Runs standalone — no frontend dependency; the UI arrives in
IMDB-11, deployment in IMDB-12. Handlers stay thin; Anthropic/MCP wiring lives in
dedicated modules per CLAUDE.md.

## Acceptance criteria

- `app/chat/` starts locally with documented env vars and exposes the chat endpoint
  shaped exactly as the architecture decision records.
- A request without a valid Firebase ID token is rejected (401/403) and provably makes
  no Anthropic API call.
- A request with a valid token and a data question (e.g. "what are the highest-rated
  Christopher Nolan titles?") returns an answer produced by the agentic loop executing
  real GraphQL against the cosmo router through the MCP server — verifiable from the
  service's logged tool calls.
- The decided token/cost guardrails observably apply (e.g. an over-limit request is
  refused per the contract).
- `ANTHROPIC_API_KEY` appears in no committed file; `.env` is gitignored; a Dockerfile
  builds the service image successfully.
- `node:test` + `supertest` tests cover the auth rejection path and the handler
  contract (Anthropic/MCP mocked) and pass via `npm test`.

## Files expected to change

- app/chat/ (server, handlers, anthropic/mcp modules, tests, Dockerfile, package.json)
- .gitignore

## Log

- **product-owner** — filed. `needs-architecture`: blocked on the OPEN "Chat backend
  API contract" section (endpoint shape, session model, MCP package, router auth from
  the service, guardrails). Independent of all frontend tickets.
- **architect** — unblocked → `ready-for-dev`. Contract in `docs/architecture.md`
  § "Chat backend API contract". What the developer needs: `POST /api/chat` streaming
  SSE (`text`/`tool`/`done`/`error` events) + unauthenticated `GET /health`;
  stateless — client sends full history, cap 20 messages / 16 KB; verify the Firebase
  ID token with `firebase-admin.verifyIdToken()` (project
  `project-d60a83c1-2c60-4d51-ad0`) **before** any Anthropic call (401 with zero
  Anthropic spend — test this path); MCP server is **`mcp-graphql`** (verified on
  npm, v2.0.4, github.com/blurrah/mcp-graphql), spawned stdio per request with
  endpoint = `https://cosmo-router-dkuqnmldta-uc.a.run.app/graphql` and header
  `Authorization: Bearer <the requesting user's forwarded Firebase ID token>` — the
  backend authenticates to the router *as the user*, no service credential; Anthropic
  via `@anthropic-ai/sdk`, model `claude-opus-4-8`, streaming, tools =
  introspect-schema + query-graphql. Guardrails (all observable per AC):
  `max_tokens: 2048`, max 8 tool iterations, 10 req/min per uid in-memory rate limit
  → 429, history cap → 400/413. `ANTHROPIC_API_KEY` env-only. For the live-data AC
  ("highest-rated Christopher Nolan titles"): entity queries work today, but the
  orchestrator's search collections have never been rebuilt (`searchInfo.rebuiltAt`
  is null, verified live) — the user must run imdb-federation `./scripts/rebuild.sh`
  before search-dependent questions return data.
- **developer** — claimed. Branch `imdb-10-chat-backend-scaffold`. Implementing per
  the "Chat backend API contract" section of `docs/architecture.md`.
- **developer** — implemented → `in-review`, draft PR
  https://github.com/dperez4787/imdb-browser/pull/5. `app/chat/`: Express app with
  thin handlers (`src/app.js`), injected seams for auth (`auth.js`), validation
  (`validate.js`), rate limit (`ratelimit.js`), SSE framing (`sse.js`), Anthropic
  loop (`anthropic.js`, claude-opus-4-8 / streaming / max_tokens 2048 / 8-iteration
  cap), and per-request stdio spawn of `mcp-graphql` 2.0.4 (`mcp.js`) pointed at the
  cosmo router with the requester's forwarded Firebase ID token. Architect's open
  assumption resolved: mcp-graphql v2 config is env vars `ENDPOINT`/`HEADERS`/
  `ALLOW_MUTATIONS`/`NAME` (confirmed against the installed package). Dockerfile
  mirrors linear-example's backend. Verified: 23/23 tests green (`npm test`,
  Anthropic/MCP/firebase-admin faked at the seams — zero token spend); live boot
  with no credentials → /health 200, unauthenticated and forged-token /api/chat →
  401 with no ANTHROPIC_API_KEY even present; real mcp-graphql child spawned and
  ran a real query against the live router (401/unauthorized with a fake token, as
  expected — Authorization forwarding proven up to the router's gate); docker build
  + in-container /health 200 and 401 smoke test. NOT verified: the full
  authenticated conversation (real ANTHROPIC_API_KEY + real Firebase ID token →
  streamed answer from live GraphQL) — needs secrets only the tester/user has;
  that is the remaining acceptance criterion to exercise. Search-dependent
  questions also still need the user to run imdb-federation `./scripts/rebuild.sh`.
- **tester** — verdict: **5 of 6 criteria PASSED, 1 NOT VERIFIED** → back to
  `in-progress`; PR #5 **stays a draft** (a not-verified criterion is not a pass).
  Wrote my own suite (`app/chat/src/acceptance.test.js`, 9 tests, fakes at the
  injection seams, zero token spend) rather than re-running the developer's; full
  suite `npm ci && npm test` on a clean checkout: **32/32 pass** (23 developer + 9
  tester, exit 0). Per criterion:
  1. *Starts locally with documented env vars, endpoint shaped per the contract* —
     **PASS**. Booted `node src/server.js` under `env -i` (no credentials): /health
     200; SSE frames verified at the wire level (`event:`/`data:`/blank-line) with
     exact contract shapes `text {delta}` / `tool {name}` / `done {usage:
     {input_tokens, output_tokens}}` / `error {kind, message}`; `.env.example`
     documents the env vars.
  2. *No valid Firebase ID token → 401, provably no Anthropic call* — **PASS**.
     Live server (real firebase-admin verifier, no key in the process): missing
     header → 401, forged Bearer → 401. Tests prove ordering, not just counts: an
     interleaved call-order log shows the agent runs only after the verifier
     settles, and never runs on rejection; malformed headers 401 before the
     verifier is even called.
  3. *Valid token + data question answered by the agentic loop running real GraphQL
     via MCP against the router* — **NOT VERIFIED** (not failed). Needs a real
     `ANTHROPIC_API_KEY` plus a Firebase ID token from an interactive Google
     sign-in; neither is available to an agent and no real key was placed anywhere.
     Supporting evidence only: the live router answers 401 to unauthenticated
     GraphQL (reachable, auth-gated), and the loop/MCP wiring passes under fakes.
     Human steps to verify are in the PR comment.
  4. *Guardrails observably apply* — **PASS**. Real `createRateLimiter` driven
     through the real HTTP stack with an injected clock: requests 1–10 → 200, 11th
     → 429 with SSE `error {kind:"rate-limited"}`, other uid unaffected, window
     slides after 61 s. History: 20 messages → 200, 21 → 400 (agent not called).
     Live 17 KB body → 413. Full-stack loop test: 8-iteration cap enforced,
     `max_tokens: 2048` + `claude-opus-4-8` on every turn, tool SSE events carry
     names only (the GraphQL query text provably never reaches the stream).
  5. *No committed key; .env gitignored; Docker builds* — **PASS**. Secret-pattern
     scan of the full branch diff: clean (`.env.example` holds a placeholder only);
     `git check-ignore app/chat/.env` → ignored; `docker build` succeeded and the
     container (runs as `node`, not root) served /health 200 and unauthenticated
     /api/chat 401.
  6. *node:test + supertest cover auth rejection + handler contract, pass via
     `npm test`* — **PASS**. 32/32 on a clean checkout; all deps declared in
     `package.json`.
  To finish criterion 3 a human must: put a real `ANTHROPIC_API_KEY` in
  `app/chat/.env`, obtain a Firebase ID token by signing in with Google, POST a
  data question to /api/chat with that Bearer token, and confirm a streamed answer
  plus `tool call: …` lines in the server log (details in the PR comment).
