# Tickets

One markdown file per ticket, filed by the **product-owner** agent. This folder is the
team's issue tracker: the frontmatter is the ticket's state, the `## Log` section is its
comment thread. Nothing about a ticket lives anywhere else.

## File name

`IMDB-<n>-<short-slug>.md` — e.g. `IMDB-6-title-search-results-grid.md`. `<n>` is the
next unused number across this folder (list the folder to find it; numbers are never
reused, including by deleted tickets).

## Format

```markdown
---
id: IMDB-6
title: Title search results grid with posters
status: backlog
owner: product-owner
design: designs/DES-2-search-results.md   # optional — required for user-facing UI work
depends-on: [IMDB-4]                      # tickets that must merge first; [] if none
branch: ""                                # set by the developer on claim
pr: ""                                    # set by the developer when the PR opens
---

## Description

One short paragraph: the user-visible outcome, and why it matters.

## Acceptance criteria

- Written as observable behavior, not implementation. "Typing `god` shows a results
  grid where each title card displays a poster image or the designed fallback" — not
  "integrate OMDb".
- The tester verifies against these and only these. Anything left out is unchecked.

## Files expected to change

- app/frontend/src/...

## Log

- **product-owner** — filed.
```

## Status state machine

| status | means | who sets it |
|---|---|---|
| `backlog` | filed, not ready to build | product-owner |
| `needs-design` | blocked on a design spec in `designs/` | product-owner |
| `needs-architecture` | blocked on a decision in `docs/architecture.md` | product-owner or designer |
| `ready-for-dev` | criteria + design + architecture all settled | product-owner, designer, or architect (whoever unblocks it last) |
| `in-progress` | a developer has claimed it (the status change *is* the claim) | developer |
| `in-review` | draft PR open, waiting on the tester — **not** a signal to merge | developer |
| `done` | tester logged a passing verdict and lifted the PR draft | tester only |

A failed test run moves the ticket back to `in-progress` with the failure in the Log.
Only the tester ever sets `done`. `done` means tested, not merged — the user merges.

## Log entries

Every agent that acts on a ticket appends one entry: `- **<agent>** — <what happened,
links, verdict>.` Never rewrite or delete earlier entries; the Log is append-only.

## Design specs

Design specs live in `designs/` (see `designs/README.md`), are owned by the
ui-ux-designer, and are referenced from tickets via the `design:` field. A ticket for
user-facing UI without a linked design is `needs-design`, not `ready-for-dev`.
