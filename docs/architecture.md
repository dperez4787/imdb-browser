# Architecture

Owned by the **architect** agent. Decisions this repo makes on top of the system
described in `docs/PROJECT-BRIEF.md`. Seeded as a strawman: sections marked **OPEN**
are unsettled — a ticket touching one is `needs-architecture` until the architect
replaces the OPEN block with a decision and its one-sentence why.

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

## OPEN — Router authentication from the browser

How the SPA's GraphQL requests authenticate to the (non-public) cosmo router. Settle
with evidence from the cosmo-router repo (JWT/JWKS config? IAM-gated Cloud Run?), not
by assumption. Candidates: router validates Firebase ID tokens; Firebase Hosting
rewrite; thin authenticated proxy. This blocks every data-fetching ticket.

## OPEN — GraphQL client layer

Client library (Apollo / urql / graphql-request + TanStack Query), codegen or not,
caching policy, where the auth header is attached, error normalization. Must live
entirely under `app/frontend/src/graphql/`.

## OPEN — Chat backend API contract

Endpoint shape (streaming?), session/history model, which GraphQL MCP server package
and how it authenticates to the router, token/cost guardrails.

## OPEN — Frontend routing & state

Router choice, URL scheme for search/facets (filters should be shareable URLs), and
whether any state manager is warranted in v1 (default: no).

## OPEN — GCP provisioning for this repo

Project/region, Artifact Registry repo, WIF provider + deploy SA, Firebase site,
Secret Manager entries. IAM changes are executed by the user, not agents.
