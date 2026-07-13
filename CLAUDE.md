# imdb-browser

A React SPA for rich browsing of IMDb data, built by a team of Claude Code agents driven
from local markdown tickets. The data backend is the **cosmo federation router,
exclusively** — the SPA never talks to MongoDB or to individual subgraphs.

## Stack

| Layer     | Choice |
|-----------|--------|
| Frontend  | React SPA (Vite) — browse/search UI over the federated IMDb graph |
| Data API  | Cosmo router (GraphQL federation) — the SPA's only data source |
| Chat      | Small Node backend on Cloud Run holding `ANTHROPIC_API_KEY`; talks to the federated GraphQL layer via a GraphQL MCP server |
| Auth      | Firebase Auth behind an AuthGate — **Google sign-in or anonymous guest** (guest added 2026-07-12 for frictionless review; guests have no email so governance personas can never match them) |
| Deploy    | Firebase Hosting (SPA) + Cloud Run (chat backend), GitHub Actions with OIDC/WIF — same pattern as `dperez4787/linear-example` |
| Images    | OMDb image API (`img.omdbapi.com`) for title posters in search results |

## Layout

```
app/frontend/    React SPA
app/chat/        Chat backend (Anthropic API + GraphQL MCP)
docs/            PROJECT-BRIEF.md (backend context, read first), architecture.md (architect-owned)
tickets/         Product Owner's tickets — one markdown file per ticket
designs/         UI/UX Designer's specs — one markdown file per design
.claude/agents/  product-owner, ui-ux-designer, architect, developer, tester
```

`docs/PROJECT-BRIEF.md` is the source of truth for everything about the surrounding
system (federation schema plans, search capabilities, facets, OMDb, chatbot
requirements). Every agent reads it before doing anything.

## Agent workflow

`product-owner` files tickets in `tickets/` → `ui-ux-designer` writes design specs in
`designs/` for UI tickets → `architect` records design decisions in
`docs/architecture.md` → `developer` implements one ticket → `tester` verifies against
the ticket's acceptance criteria and records the verdict on the ticket file and the PR.

Tickets are markdown files with YAML frontmatter; the `status:` field is the workflow
state and the `## Log` section is the comment thread. See `tickets/README.md` for the
format and the state machine. Agents work one ticket at a time. A ticket is not done
until the tester has logged a verdict on it.

## Git workflow

One ticket, one branch, one pull request. `main` is protected by convention: it only
receives merges from a PR, and **agents never merge and never push to `main`**. The user
merges.

Branch names come from the ticket's `branch:` frontmatter field — read it and use it
verbatim; if it is empty, set it (`<ticket-id-lowercase>-<short-slug>`) in the same
commit that moves the ticket to `in-progress`, so the ticket and the branch cross-link.

Commit subjects start with the ticket ID: `IMDB-6: Add title search results grid`. Say
why the change is shaped the way it is, not what the diff already shows. Work that
belongs to no ticket (a design doc, a toolchain fix) goes on its own branch with no
ticket prefix.

**Every ticket PR is opened as a draft (`gh pr create --draft`), and only the tester
takes it out of draft** (`gh pr ready`) after every acceptance criterion has passed.
GitHub refuses to merge a draft, so the review order is structural. Non-ticket PRs
(design docs, toolchain fixes) are exempt: no acceptance criteria, no tester — open them
non-draft and say in the body why they are exempt.

The PR body links the ticket file (a GitHub URL to `tickets/IMDB-<n>-….md` on the
branch) and states what was verified and what was not.

## Secrets

Never commit a connection string, password, or API key, with one deliberate exception:
the OMDb image API key is embedded in client-side image URLs by design (it is exposed to
every browser regardless) and lives in `docs/PROJECT-BRIEF.md`. `ANTHROPIC_API_KEY` is a
Secret Manager secret on the chat service's Cloud Run deployment and a gitignored
`.env` locally — never in code, never in a PR body, never in a ticket. Firebase web
config (apiKey etc.) is public-by-design and may be committed.

## Conventions

- ES modules, Node LTS pinned by `.nvmrc`, `async`/`await` only.
- The SPA speaks GraphQL through one client module (`app/frontend/src/graphql/`); no
  `fetch()` and no inline query strings inside components.
- Firebase Auth lives behind one module (`auth.js`) and one `AuthGate` component, same
  shape as linear-example. Everything user-visible renders inside the gate.
- The chat backend keeps handlers thin and holds all Anthropic/MCP wiring in dedicated
  modules; the frontend never sees the Anthropic key or calls Anthropic directly.
- Tests colocate as `*.test.js(x)` next to what they test. Frontend: Vitest + Testing
  Library. Backend: `node:test` + `supertest`.
- Every ticket's acceptance criteria are what the tester verifies against — not what the
  developer thinks it built.
