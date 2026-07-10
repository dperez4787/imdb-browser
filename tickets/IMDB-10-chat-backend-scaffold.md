---
id: IMDB-10
title: Chat backend scaffold — Anthropic agentic loop with GraphQL MCP on Cloud Run
status: needs-architecture
owner: product-owner
depends-on: []
branch: ""
pr: ""
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
