/**
 * Universal-search operation document (IMDB-5, DES-2 "Data needs").
 *
 * NEW file by design: this round IMDB-14 owns the pre-existing src/graphql/
 * files, so IMDB-5's additions live here and in searchHooks.js. Components
 * never import this file — they use useUniversalSearch from searchHooks.js.
 *
 * One document, three aliases, ONE router request per settled keystroke burst:
 *   - hits:   the unified `search` union (PRIMARY — server-ranked, the client
 *             invents no ordering; whole-word/stem matching per API-CHANGES.md)
 *   - titles/people: prefix-backed fill for mid-word typing (DES-2 Appendix A)
 *   - searchInfo: index freshness rides along in the SAME request (folded
 *             IMDB-13) — no extra round trip, and it can never be fresher
 *             than the results beside it.
 *
 * GOVERNANCE (per the product-owner advisory on the IMDB-5 ticket, 2026-07-10):
 * `Rating.numVotes` is denied to everyone and selecting it 403s the WHOLE
 * operation; the optimistic select + strip-and-retry mechanism is IMDB-14's
 * work and does not exist yet, so this document deliberately does NOT select
 * numVotes. The row UI renders the votes parenthetical opportunistically
 * whenever a response carries `rating.numVotes`, so once IMDB-14's
 * strip-and-retry lands, re-adding the field here lights vote counts up with
 * no component change.
 */
import { gql } from 'graphql-request';

export const UNIVERSAL_SEARCH_QUERY = gql`
  query UniversalSearch($q: String!) {
    hits: search(query: $q, limit: 8) {
      __typename
      ... on Title {
        tconst
        primaryTitle
        startYear
        titleType
        rating {
          averageRating
        }
      }
      ... on Name {
        nconst
        primaryName
        primaryProfessions
      }
    }
    titles: searchTitles(filter: { titlePrefix: $q }, limit: 8) {
      items {
        tconst
        primaryTitle
        startYear
        titleType
        rating {
          averageRating
        }
      }
    }
    people: searchNames(filter: { namePrefix: $q }, limit: 4) {
      items {
        nconst
        primaryName
        primaryProfessions
      }
    }
    searchInfo {
      rebuiltAt
    }
  }
`;
