---
id: IMDB-9
title: Person visual treatment — known-for poster mosaic vs placeholder
status: ready-for-dev
owner: product-owner
design: designs/DES-6-person-visual-treatment.md
depends-on: [IMDB-5, IMDB-8]
branch: ""
pr: ""
---

## Description

No people images exist anywhere in the system (OMDb serves title posters only, and
there will be no people-image endpoint). The brief's Images section carries an explicit
**"Open idea (designer + architect to hash out, per the user)"** bullet: represent a
person visually with the poster(s) of titles they were part of — a single known-for
poster or a small mosaic on person cards and the person page, pulled through federation
from the person's known-for/filmography fields. The user explicitly wants the designer
and architect to settle this together: the designer owns whether it looks right and
where it applies (search result cards, person page header); the architect owns the
costs the brief names — each poster is an extra OMDb request, needs a title id, and
depends on what the person's hydrated fields actually expose — and a sensible request
budget. The outcome may legitimately be "keep the initials placeholder"; that decision,
recorded in a design spec (and `docs/architecture.md` if request-budget rules are set),
still closes the question. Implementation upgrades the placeholder treatment shipped by
IMDB-5 and IMDB-8.

## Acceptance criteria

- A design spec in `designs/` records the joint designer+architect decision (mosaic /
  single poster / keep placeholder), which surfaces it applies to, and the agreed OMDb
  request budget per person card and per person page.
- Person results in universal search and the person detail header render the approved
  treatment exactly as specified.
- A person whose known-for titles have no retrievable posters (missing/404) falls back
  gracefully to the placeholder/initials treatment — never a broken image.
- Observed OMDb request volume for a person card/page stays within the spec's budget
  (offscreen images lazy-load).
- If the decision is "keep the placeholder", the spec says so with the rationale and
  this ticket closes with no code change beyond what IMDB-5/IMDB-8 shipped.

## Files expected to change

- designs/ (the decision spec)
- app/frontend/src/people/, app/frontend/src/search/ (apply treatment, if adopted)
- app/frontend/src/graphql/ (known-for fields, if adopted)

## Log

- **product-owner** — filed. `needs-design`, and explicitly a designer **and**
  architect conversation per the brief's "Open idea" bullet (Images — OMDb section).
  Deliberately split from IMDB-8 so person pages ship on the placeholder first.
- **ui-ux-designer** — design proposal written: `designs/DES-6-person-visual-treatment.md`
  (status `draft`). Proposes a tiered treatment: 2×2 known-for poster mosaic on the
  person page header (budget ≤4 OMDb requests/page), single poster + monogram badge on
  person cards (≤1, lazy), monogram always in autocomplete (0), with a fully designed
  degradation ladder down to the Monogram floor. Both ideal and degraded states are
  drawn; "keep the monogram everywhere" is an explicitly acceptable verdict. Staying
  `needs-design`: the spec's three feasibility gates (known-for title-id field
  exposure, OMDb request budget, no-new-query assumption) are being verified by the
  architect in parallel — the main session reconciles this ticket once those facts
  land in `docs/architecture.md`.
- **ui-ux-designer** — feasibility confirmed: `docs/architecture.md` → "Person
  visuals — data facts & OMDb budget" verifies live that `Name.knownForTitles`
  returns ≤4 hydrated titles (tconst, primaryTitle, startYear, rating.numVotes) in
  the same query at zero extra GraphQL cost, and adopts the proposed budgets (≤4
  posters per person page, ≤1 per person card lazy, 0 in autocomplete, instant
  fallback on 404). DES-6's tiered treatment is now **the decision**: 2×2 known-for
  mosaic on the person page header, single most-voted-known-for poster + monogram
  badge on person cards, monogram floor everywhere; the monogram-everywhere
  contingency is retired. Spec `approved` → `ready-for-dev` (depends-on
  IMDB-5/IMDB-8 unchanged — this upgrades what they ship).
