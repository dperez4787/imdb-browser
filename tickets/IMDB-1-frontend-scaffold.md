---
id: IMDB-1
title: Frontend scaffold — Vite React SPA with test setup
status: done
owner: product-owner
depends-on: []
branch: "imdb-1-frontend-scaffold"
pr: "https://github.com/dperez4787/imdb-browser/pull/1"
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
- **developer** — claimed. Branch `imdb-1-frontend-scaffold` off `main`.
- **developer** — implemented; draft PR https://github.com/dperez4787/imdb-browser/pull/1.
  Files: `.nvmrc` (repo root, Node 24 LTS), `app/frontend/{package.json,
  package-lock.json, vite.config.js, index.html, .gitignore}`, `app/frontend/src/
  {main.jsx, App.jsx, App.test.jsx, setupTests.js, graphql/index.js}`. Vite 8 +
  React 19, Vitest 4 + Testing Library (config in `vite.config.js` via
  `vitest/config`; jest-dom matchers via `setupTests.js`). `src/graphql/index.js`
  is a comment-only stub marking the sanctioned GraphQL boundary. Verified locally
  on Node v24.18.0: `npm ci` clean; `npm test` 1/1 passing (App renders heading +
  tagline); `npm run build` clean; `npm run dev` served — curl confirmed index.html
  and the transformed App module with the placeholder markup. No `fetch()`/GraphQL/
  Firebase anywhere (grep-checked). Skipped/not done on purpose: no router, no CSS
  framework, no real-browser console check (curl + Testing Library only).
- **tester** — verdict: **all criteria pass**; `status: done`, PR taken out of draft.
  Verified on Node v24.18.0 / npm 11.16.0, clean checkout (`rm -rf node_modules`).
  Added tester tests (`src/main.test.jsx`, `src/scaffold-conventions.test.js`),
  committed to the PR branch.
  - `npm run dev` serves visible placeholder, no blank screen — **pass**. Ran
    `npm run dev -- --port 5199 --strictPort`; curl: `/` 200 with `#root` +
    `/src/main.jsx` script, transformed `/src/App.jsx` carries the placeholder
    markup, `/src/main.jsx` 200. `main.test.jsx` drives the real entry module and
    asserts the h1 + tagline mount into `#root` with `console.error` never called.
    Caveat (same as developer's): no real browser available — served-HTML via curl
    plus jsdom-rendered output is the evidence; the "no console errors in a live
    browser" clause is verified only to that extent.
  - `npm run build` clean — **pass**. Exit 0, `dist/` emitted, placeholder markup
    present in `dist/assets/index-*.js` (grep-confirmed).
  - `npm test` passes incl. colocated `*.test.jsx` Testing Library test — **pass**.
    `npm ci && npm test` from clean checkout: exit 0, 3 files / 6 tests (developer's
    `App.test.jsx` + tester's two). All deps declared; no undeclared flags.
  - `.nvmrc` Node LTS + ES modules — **pass**. Repo-root `.nvmrc` = `24` (even/LTS
    line), `"type": "module"` in `app/frontend/package.json`; asserted by
    `scaffold-conventions.test.js`.
  - `src/graphql/` boundary exists — **pass**. Comment-only stub `index.js`;
    asserted by test.
  - No `fetch()`/GraphQL/Firebase, no network requests — **pass**. Grep over `src/`
    (only hit is the prohibition comment in the graphql stub) plus comment-stripping
    test assertion; diff-wide secret scan (api keys/passwords/tokens/conn strings)
    found nothing.
