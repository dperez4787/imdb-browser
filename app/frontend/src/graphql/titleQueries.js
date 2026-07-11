/**
 * Title-detail operation document (IMDB-7, DES-4 "Data needs").
 *
 * NEW file by design: the round this shipped, IMDB-6 owned edits to the
 * pre-existing src/graphql/ files, so IMDB-7's additions live here and in
 * titleHooks.js (the same partition move IMDB-5 made with searchQueries.js).
 * Components never import this file — they use useTitleDetail from
 * titleHooks.js.
 *
 * Field names verified against the LIVE router on 2026-07-11 (gcloud
 * identity token, policy revision 8), per the project brief's "verify field
 * names by introspecting the live router" rule:
 *   - `title(tconst: ID!)` resolves an unknown/invalid id to `null` (no
 *     GraphQL error), so the page can tell not-found from failure.
 *   - `principals` carries EVERY crew category — director and writer entries
 *     included (tt0068646 returns director/writer/actor/actress/producer/
 *     composer/cinematographer/editor/casting_director/production_designer)
 *     — so the credit groups are built from principals alone; no separate
 *     directors/writers selection is needed.
 *   - `episode { seasonNumber episodeNumber series { … } }` hydrates for
 *     tvEpisode titles (tt0959621 → S1 E1 of Breaking Bad) and is null
 *     otherwise.
 *
 * GOVERNANCE (IMDB-14 / docs/architecture.md § Field-level governance):
 * `Rating.numVotes` is a governed coordinate (denied to everyone at policy
 * rev 8) and this document selects it OPTIMISTICALLY anyway — the router's
 * transparent redact mode answers HTTP 200 with the field silently absent
 * from `data` and the coordinate listed in
 * `extensions.governance.redactedFields`, which the hook surfaces as
 * `deniedFields`. The full document is re-sent on every fetch, so a live
 * grant flip shows the real vote count on the next fresh fetch with NO code
 * change (denial-scoped 60 s staleTime, see titleHooks.js). `averageRating`
 * is co-selected beside it per the document-style rule, so a redaction
 * degrades the votes line, never the whole rating block.
 */
import { gql } from 'graphql-request';

export const TITLE_DETAIL_QUERY = gql`
  query TitleDetail($tconst: ID!) {
    title(tconst: $tconst) {
      tconst
      primaryTitle
      titleType
      startYear
      endYear
      runtimeMinutes
      genres
      rating {
        averageRating
        numVotes
      }
      principals {
        ordering
        category
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
