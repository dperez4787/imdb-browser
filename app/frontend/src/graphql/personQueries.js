/**
 * Person-detail operation document (IMDB-8, DES-5 "Data needs").
 *
 * NEW file by design, mirroring titleQueries.js: pre-existing src/graphql/
 * files stay untouched this round, so IMDB-8's additions live here and in
 * personHooks.js. Components never import this file — they use
 * usePersonDetail from personHooks.js.
 *
 * Field names verified against the LIVE router on 2026-07-12 (gcloud
 * identity token, policy revision 8), per the project brief's "verify field
 * names by introspecting the live router" rule — three corrections to
 * DES-5's Data needs sketch, recorded on the ticket Log:
 *   - The root field is `name(nconst: ID!)` — not `name(id:)`; the entity
 *     key is `nconst` and there is no `Name.id`. An unknown/invalid nconst
 *     resolves `name: null` on HTTP 200 with NO GraphQL error, so the page
 *     can tell not-found from failure (same split as `title`).
 *   - `primaryProfessions` is PLURAL (`[String!]`).
 *   - DES-5's load-bearing Assumption B holds: `Name.credits` is
 *     `[Principal!]!` with `ordering category job characters title`, hydrated
 *     through federation in the same query. It is the router's CURATED credit
 *     set (no tvEpisode/archive-footage rows) and is capped at 50 entries;
 *     the root `principalsByName(nconst, limit!, offset!)` serves the raw
 *     principals table instead but is mandatory-paginated and episode-noisy —
 *     the wrong fit for DES-5's "long filmographies render fully, no
 *     pagination", so this page reads `credits`.
 *
 * GOVERNANCE (IMDB-14 / docs/architecture.md § Field-level governance):
 * `Name.birthYear` and `Name.deathYear` are governed coordinates (denied to
 * everyone at policy rev 8) and this document selects them OPTIMISTICALLY
 * anyway — observed live for nm0000199: transparent redact mode answers
 * HTTP 200 with both years silently absent from `data` and listed in
 * `extensions.governance.redactedFields`, which the hook surfaces as
 * `deniedFields` for the lifespan line's DES-8 treatment. The full document
 * is re-sent on every fetch, so a grant flipped at the governance console
 * shows real years on the next fresh fetch with NO redeploy (denial-scoped
 * 60 s staleTime, see personHooks.js). Ungoverned siblings (`primaryName`
 * etc.) sit beside the governed leaves per the document-style rule.
 * `Rating.numVotes` (also governed) is selected under `knownForTitles` only
 * as DES-6 plumbing — NOTHING this page renders reads it: the strip is
 * dataset order and every ★ shows `averageRating` (ungoverned).
 */
import { gql } from 'graphql-request';

export const PERSON_DETAIL_QUERY = gql`
  query PersonDetail($nconst: ID!) {
    name(nconst: $nconst) {
      nconst
      primaryName
      birthYear
      deathYear
      primaryProfessions
      knownForTitles {
        tconst
        primaryTitle
        startYear
        rating {
          averageRating
          numVotes
        }
      }
      credits {
        ordering
        category
        characters
        title {
          tconst
          primaryTitle
          startYear
          rating {
            averageRating
          }
        }
      }
    }
  }
`;
