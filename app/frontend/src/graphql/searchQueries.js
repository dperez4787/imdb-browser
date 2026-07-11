/**
 * Universal-search operation document (IMDB-5, DES-2 "Data needs").
 *
 * NEW file by design: the round this shipped, IMDB-14 owned the pre-existing
 * src/graphql/ files, so IMDB-5's additions live here and in searchHooks.js.
 * Components never import this file — they use useUniversalSearch from
 * searchHooks.js.
 *
 * One document, three aliases, ONE router request per settled keystroke burst:
 *   - hits:   the unified `search` union (PRIMARY — server-ranked, the client
 *             invents no ordering; whole-word/stem matching per API-CHANGES.md)
 *   - titles/people: prefix-backed fill for mid-word typing (DES-2 Appendix A)
 *   - searchInfo: index freshness rides along in the SAME request (folded
 *             IMDB-13) — no extra round trip, and it can never be fresher
 *             than the results beside it.
 *
 * GOVERNANCE (IMDB-14 / docs/architecture.md § Field-level governance):
 * `Rating.numVotes` is a governed coordinate (denied to everyone at policy
 * rev 8), and this document selects it OPTIMISTICALLY anyway — the router's
 * transparent redact mode answers HTTP 200 with the denied field silently
 * absent from `data` and the coordinate listed in
 * `extensions.governance.redactedFields`, at zero extra round trips. The
 * hook resolves `{ data, deniedFields }` through executeWithDenials, so a
 * live grant flip lights the votes parenthetical up on the next settled
 * keystroke (denial-scoped 60 s staleTime) with NO code change; while denied,
 * the value simply drops out of the row like any missing field (the
 * parenthetical is opportunistic — DES-2 forbids the restricted treatment in
 * this transient list). `averageRating` is co-selected beside it per the
 * document-style rule. An earlier revision of this file omitted numVotes
 * because the router then REJECTED the whole operation with a 403; that
 * enforcement shape is retired to a config fallback that errors.js still
 * normalizes defensively (kind 'denied').
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
          numVotes
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
          numVotes
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
