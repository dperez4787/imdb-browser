/**
 * Faceted title-search document (IMDB-6, DES-3 "Data needs").
 *
 * NEW file by design — the file partition for this round gives IMDB-6 its own
 * document/hook files under src/graphql/ and forbids editing the shared
 * queries.js/hooks.js. queries.js already carries a SEARCH_TITLES_QUERY, but
 * that one is card-only; the faceted view needs the SAME response to ALSO
 * carry the contextual `facets(...)` sub-selection (the rail's live counts),
 * so it is a distinct operation with its own cache lineage
 * (see useTitleSearch.js). Components never import this file — they use the
 * hook in useTitleSearch.js.
 *
 * Field/enum names verified against the LIVE router by introspection
 * (2026-07-11): `TitleFacetDimension` (GENRES, TITLE_TYPES), `TitleSort`
 * (POPULARITY_DESC | RATING_DESC | RELEVANCE | YEAR_ASC | YEAR_DESC), and the
 * `TitleSearchResult.facets(dimensions:[…], perDimension: Int!)` shape
 * (`[FacetBucket!]!` of `{ dimension, values { value count } }`). `perDimension:
 * 50` covers both vocabularies fully (GENRES has 26 values live, TITLE_TYPES 9).
 *
 * GOVERNANCE (IMDB-14 / docs/architecture.md § Field-level governance):
 * `Rating.numVotes` is governed and denied to everyone at policy rev 8. This
 * document selects it OPTIMISTICALLY, co-selected beside the ungoverned
 * `averageRating`: under the router's transparent redact mode the request is a
 * plain HTTP 200 with `numVotes` absent from `data` and the coordinate reported
 * in `extensions.governance.redactedFields` (verified live 2026-07-11) — zero
 * extra round trips, and a live grant flip lights it up on the very next fetch
 * with no code change. TitleCard renders no vote count (the parenthetical is
 * opportunistic per DES-3), so denial is invisible in this view; the field is
 * carried only so a future grant flows through the plumbing unchanged.
 */
import { gql } from 'graphql-request';

export const FACETED_TITLE_SEARCH_QUERY = gql`
  query FacetedTitleSearch(
    $filter: TitleSearchFilter!
    $sort: TitleSort!
    $limit: Int!
    $offset: Int!
    $facetDimensions: [TitleFacetDimension!]!
    $facetPerDimension: Int!
  ) {
    searchTitles(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
      total
      totalIsCapped
      items {
        tconst
        primaryTitle
        titleType
        startYear
        genres
        rating {
          averageRating
          numVotes
        }
      }
      facets(dimensions: $facetDimensions, perDimension: $facetPerDimension) {
        dimension
        values {
          value
          count
        }
      }
    }
  }
`;
