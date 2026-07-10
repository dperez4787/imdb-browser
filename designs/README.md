# Designs

One markdown file per design spec, written by the **ui-ux-designer** agent. Tickets in
`tickets/` reference these via their `design:` frontmatter field; the developer builds
what the spec says and the tester checks the built UI against it.

## File name

`DES-<n>-<short-slug>.md` — e.g. `DES-2-search-results.md`. `<n>` is the next unused
number across this folder.

## Format

```markdown
---
id: DES-2
title: Search results — poster grid
status: draft | approved | superseded
tickets: [IMDB-6]        # tickets this spec informs (kept current as tickets are filed)
---

## Intent

What experience this creates and why — one paragraph a developer can hold in their head.

## Layout

ASCII wireframes / markdown. Show the states, not just the happy path: empty, loading,
no-results, image-missing, error, signed-out never renders (AuthGate).

## Components

The component inventory with responsibilities — names the developer should use.

## Behavior

Interactions, keyboard access, focus order, responsive breakpoints, motion. Written as
observable behavior so acceptance criteria can quote it.

## Data needs

Which GraphQL fields/queries this view depends on (per docs/PROJECT-BRIEF.md), so gaps
surface before implementation, not during.
```

Specs are design documents, not changelogs — revise in place and bump `status:`. A
superseded spec stays in the folder with `status: superseded` and a pointer to its
replacement.
