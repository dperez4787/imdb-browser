/**
 * All GraphQL operation documents (IMDB-4). Plain `gql` template strings, no
 * codegen (docs/architecture.md, "GraphQL client layer").
 *
 * Field names verified against the LIVE router by introspection on 2026-07-10
 * (post search-index rebuild — searchInfo.rebuiltAt 2026-07-11T03:12Z), per
 * the project brief's "verify field names by introspecting the live router"
 * rule. `searchTitles`/`searchNames` take a required filter; `sort`, `limit`,
 * `offset` have schema defaults, but the hooks always send them explicitly so
 * query keys and request variables stay in lockstep.
 *
 * FIELD GOVERNANCE (router "fieldAuth" module, verified live 2026-07-10):
 * `Rating.numVotes`, `Name.birthYear`, and `Name.deathYear` are governed by
 * the imdb-policy-service bundle and DENIED to every Google/Firebase identity
 * (HTTP 403, code PERMISSION_DENIED, extensions.deniedFields). No document
 * here may select them until policy grants a role — see the IMDB-4 ticket Log.
 * Popularity SORTS (POPULARITY_DESC) still work server-side; only reading the
 * raw vote count is denied.
 *
 * Components never import this file — they use the hooks in hooks.js.
 */
import { gql } from 'graphql-request';

/** Index freshness — the smoke query, and the UI's freshness caveat. */
export const SEARCH_INFO_QUERY = gql`
  query SearchInfo {
    searchInfo {
      rebuiltAt
      titleCount
      nameCount
    }
  }
`;

/** Vocabulary facets, materialized at rebuild — populates all filter controls. */
export const FACETS_QUERY = gql`
  query Facets {
    facets {
      genres {
        value
        count
      }
      titleTypes {
        value
        count
      }
      principalCategories {
        value
        count
      }
      professions {
        value
        count
      }
      akaLanguages {
        value
        count
      }
      akaRegions {
        value
        count
      }
    }
  }
`;

/** Faceted title search (IMDB-6): result cards + paging counts. */
export const SEARCH_TITLES_QUERY = gql`
  query SearchTitles($filter: TitleSearchFilter!, $sort: TitleSort!, $limit: Int!, $offset: Int!) {
    searchTitles(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
      total
      totalIsCapped
      items {
        tconst
        primaryTitle
        titleType
        startYear
        endYear
        runtimeMinutes
        genres
        isAdult
        rating {
          averageRating
        }
      }
    }
  }
`;

/** People search: cards get knownForTitles in the SAME query (≤4 per person). */
export const SEARCH_NAMES_QUERY = gql`
  query SearchNames($filter: NameSearchFilter!, $sort: NameSort!, $limit: Int!, $offset: Int!) {
    searchNames(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
      total
      totalIsCapped
      titleCandidatesCapped
      items {
        nconst
        primaryName
        primaryProfessions
        knownForTitles {
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

/** Universal mixed search (IMDB-5): popularity-ranked Title|Name union. */
export const SEARCH_QUERY = gql`
  query Search($query: String!, $kinds: [SearchKind!], $limit: Int) {
    search(query: $query, kinds: $kinds, limit: $limit) {
      __typename
      ... on Title {
        tconst
        primaryTitle
        titleType
        startYear
        genres
        rating {
          averageRating
        }
      }
      ... on Name {
        nconst
        primaryName
        primaryProfessions
        knownForTitles {
          tconst
          primaryTitle
          rating {
            averageRating
          }
        }
      }
    }
  }
`;

/** Title detail (IMDB-7), hydrated through federation in one query. */
export const TITLE_QUERY = gql`
  query Title($tconst: ID!) {
    title(tconst: $tconst) {
      tconst
      primaryTitle
      originalTitle
      titleType
      startYear
      endYear
      runtimeMinutes
      genres
      isAdult
      rating {
        averageRating
      }
      directors {
        nconst
        primaryName
      }
      writers {
        nconst
        primaryName
      }
      principals {
        ordering
        category
        job
        characters
        name {
          nconst
          primaryName
        }
      }
      episode {
        seasonNumber
        episodeNumber
        series {
          tconst
          primaryTitle
        }
      }
    }
  }
`;

/** Person detail (IMDB-8): known-for set + full credits with title stubs. */
export const NAME_QUERY = gql`
  query Name($nconst: ID!) {
    name(nconst: $nconst) {
      nconst
      primaryName
      primaryProfessions
      knownForTitles {
        tconst
        primaryTitle
        startYear
        genres
        rating {
          averageRating
        }
      }
      credits {
        ordering
        category
        job
        characters
        title {
          tconst
          primaryTitle
          titleType
          startYear
          rating {
            averageRating
          }
        }
      }
    }
  }
`;
