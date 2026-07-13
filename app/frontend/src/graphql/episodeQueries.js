/**
 * Episode-list operation document (IMDB-20 — title hierarchy browser).
 *
 * NEW file by design, the same partition move every round has made
 * (searchQueries.js, titleQueries.js, personQueries.js): IMDB-20 adds its
 * document here and its hook in episodeHooks.js without touching the
 * pre-existing src/graphql/ files. Components never import this file — they
 * use useTitleEpisodes from episodeHooks.js.
 *
 * Field names verified against the LIVE router on 2026-07-12 (gcloud
 * identity token), per the project brief's "verify field names by
 * introspecting the live router" rule:
 *   - `Title.episodes(limit: Int, offset: Int) -> [Title]` returns a series'
 *     children ordered by season/episode; each child hydrates any Title
 *     field plus its `episode { seasonNumber episodeNumber }` placement.
 *     tt0903747 (Breaking Bad) → S1E1 "Pilot"…; movies/leaf titles return
 *     `[]` (tt0068646 verified).
 *   - There is NO total count on this field — paging ends when a page comes
 *     back shorter than `limit` (see episodeHooks.js).
 *   - A root `episodesOfSeries(parentTconst, limit, offset)` also exists;
 *     `Title.episodes` is preferred (one document, hydrates with the title).
 *
 * This document is deliberately SEPARATE from TITLE_DETAIL_QUERY: the title
 * page's first paint stays lean (one entity query), and the episodes section
 * / grid popover issue this one lazily with their own limit/offset.
 *
 * GOVERNANCE: no governed coordinate is selected here (tconst, primaryTitle,
 * startYear, episode numbers are all ungoverned at policy rev 8), so a
 * response never reports redactions for this document today; the hook still
 * rides executeWithDenials like every other, so a future governed field
 * would flow through the standard deniedFields contract unchanged.
 */
import { gql } from 'graphql-request';

export const TITLE_EPISODES_QUERY = gql`
  query TitleEpisodes($tconst: ID!, $limit: Int!, $offset: Int!) {
    title(tconst: $tconst) {
      tconst
      episodes(limit: $limit, offset: $offset) {
        tconst
        primaryTitle
        startYear
        episode {
          seasonNumber
          episodeNumber
        }
      }
    }
  }
`;
