// @vitest-environment node
/**
 * LIVE router check for IMDB-20's episode document — SKIPPED unless
 * LIVE_ROUTER_TOKEN is set (same pattern as live-router.integration.test.js),
 * so `npm test` stays hermetic on a clean checkout.
 *
 * Run it deliberately:
 *
 *   LIVE_ROUTER_TOKEN="$(gcloud auth print-identity-token)" \
 *     npx vitest run src/graphql/episodeQueries.live.integration.test.js
 *
 * Drives the REAL client module (client.js → errors.js → episodeQueries.js →
 * graphql-request → global fetch) against the live cosmo router; the only
 * substituted seam is auth.js#getIdToken() returning the supplied Google
 * OIDC identity token (an accepted JWKS provider per IMDB-3).
 */
import { describe, expect, it, vi } from 'vitest';

import { executeWithDenials } from './client.js';
import { TITLE_EPISODES_QUERY } from './episodeQueries.js';

const TOKEN = process.env.LIVE_ROUTER_TOKEN;

vi.mock('../auth.js', () => ({
  getIdToken: vi.fn(async () => process.env.LIVE_ROUTER_TOKEN),
}));

describe.skipIf(!TOKEN)('IMDB-20: Title.episodes through the real document', () => {
  it('tt0903747 (Breaking Bad): children ordered by season/episode, S1E1 "Pilot" first', async () => {
    const { data, deniedFields } = await executeWithDenials(TITLE_EPISODES_QUERY, {
      tconst: 'tt0903747',
      limit: 12,
      offset: 0,
    });
    const episodes = data.title.episodes;
    expect(episodes).toHaveLength(12);
    expect(episodes[0].primaryTitle).toBe('Pilot');
    expect(episodes[0].episode.seasonNumber).toBe(1);
    expect(episodes[0].episode.episodeNumber).toBe(1);
    // Ordered by season/episode across the page.
    const pairs = episodes.map((e) => [e.episode.seasonNumber, e.episode.episodeNumber]);
    const sorted = [...pairs].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    expect(pairs).toEqual(sorted);
    // Nothing in this document is governed at the current policy revision.
    expect(deniedFields).toEqual([]);
  }, 30000);

  it('offset paging pages forward deterministically (page 2 starts past page 1)', async () => {
    const [page1, page2] = await Promise.all([
      executeWithDenials(TITLE_EPISODES_QUERY, { tconst: 'tt0903747', limit: 5, offset: 0 }),
      executeWithDenials(TITLE_EPISODES_QUERY, { tconst: 'tt0903747', limit: 5, offset: 5 }),
    ]);
    const ids1 = page1.data.title.episodes.map((e) => e.tconst);
    const ids2 = page2.data.title.episodes.map((e) => e.tconst);
    expect(ids1).toHaveLength(5);
    expect(ids2).toHaveLength(5);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  }, 30000);

  it('tt0068646 (The Godfather, a movie): episodes resolve to [] — the zero-DOM signal', async () => {
    const { data } = await executeWithDenials(TITLE_EPISODES_QUERY, {
      tconst: 'tt0068646',
      limit: 60,
      offset: 0,
    });
    expect(data.title.episodes).toEqual([]);
  }, 30000);
});
