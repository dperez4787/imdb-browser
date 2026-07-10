---
id: IMDB-1
title: Frontend scaffold — Vite React SPA with test setup
status: ready-for-dev
owner: product-owner
depends-on: []
branch: ""
pr: ""
---

## Description

Stand up the React SPA skeleton in `app/frontend/` so every later frontend ticket has a
working repo to land in: Vite + React, Vitest + Testing Library wired up, ES modules,
Node LTS pinned by `.nvmrc`, and the module layout CLAUDE.md prescribes (including an
empty `src/graphql/` boundary directory so the "one GraphQL client module" convention
has a home from day one). No routing library is chosen here — router choice is an OPEN
architecture question (`docs/architecture.md`, "Frontend routing & state") and no ticket
in this scaffold needs it yet. No data fetching, no auth — just a bootable, testable
shell that renders a placeholder screen.

## Acceptance criteria

- `npm install` then `npm run dev` in `app/frontend/` serves a page that renders a
  visible imdb-browser placeholder (no blank screen, no console errors).
- `npm run build` produces a production bundle without errors.
- `npm test` runs Vitest and passes, including at least one colocated
  `*.test.jsx` component test using Testing Library that asserts on rendered output.
- `.nvmrc` pins a Node LTS version at the repo root or in `app/frontend/`; the project
  uses ES modules throughout (`"type": "module"`).
- `app/frontend/src/graphql/` exists (may contain only a stub/README comment) so later
  tickets have the sanctioned GraphQL boundary location.
- No `fetch()` calls, no GraphQL, no Firebase code anywhere — the scaffold makes no
  network requests.

## Files expected to change

- app/frontend/package.json, app/frontend/vite.config.js
- app/frontend/index.html, app/frontend/src/main.jsx, app/frontend/src/App.jsx (+ test)
- app/frontend/src/graphql/ (stub)
- .nvmrc

## Log

- **product-owner** — filed. Pure toolchain scaffold, no UI design or open architecture
  decision touched, so `ready-for-dev`. Router choice deliberately excluded (OPEN in
  docs/architecture.md).
