// @vitest-environment node
/**
 * LIVE router integration (IMDB-4 AC 1) — SKIPPED unless LIVE_ROUTER_TOKEN is
 * set, so `npm test` stays hermetic on a clean checkout.
 *
 * Run it deliberately:
 *
 *   LIVE_ROUTER_TOKEN="$(gcloud auth print-identity-token)" npm test
 *
 * This drives the REAL client module (client.js → errors.js → queries.js →
 * graphql-request → global fetch) against the live cosmo router. The only
 * substituted seam is `auth.js#getIdToken()`, which returns the supplied
 * Google OIDC identity token instead of a Firebase ID token — both are
 * accepted JWKS providers on the router per IMDB-3, but the Firebase-token
 * path end-to-end still requires an interactive Google sign-in and is NOT
 * covered here (recorded as not-verified on the ticket).
 */
import { describe, expect, it, vi } from 'vitest';

import { execute, executeWithDenials } from './client.js';
import { GraphQLLayerError } from './errors.js';
import {
  SEARCH_INFO_QUERY,
  SEARCH_QUERY,
  SEARCH_TITLES_QUERY,
  TITLE_QUERY,
} from './queries.js';

/**
 * IMDB-14 live check: selects the governed `Rating.numVotes` (denied to every
 * principal at policy revision 8) beside ungoverned siblings. Defined here,
 * not in queries.js — production documents there stay aligned with what the
 * views of this round actually render. Expected live behavior is the
 * router's TRANSPARENT REDACT MODE (governance-platform notice on the
 * ticket, verified 2026-07-11): HTTP 200, numVotes absent from data, the
 * coordinate reported in extensions.governance.redactedFields.
 */
const GOVERNED_TITLE_QUERY = `
  query GovernedTitle($tconst: ID!) {
    title(tconst: $tconst) {
      tconst
      primaryTitle
      startYear
      rating {
        averageRating
        numVotes
      }
    }
  }
`;

const TOKEN = process.env.LIVE_ROUTER_TOKEN;

vi.mock('../auth.js', () => ({
  // One mutable seam: tests flip it to an invalid token for the 401 case.
  getIdToken: vi.fn(async () => globalThis.__liveToken),
}));

globalThis.__liveToken = TOKEN;

describe.skipIf(!TOKEN)('live cosmo router through the real client module', () => {
  it('searchInfo: indexes are live (rebuiltAt set, counts positive)', async () => {
    globalThis.__liveToken = TOKEN;
    const data = await execute(SEARCH_INFO_QUERY);
    expect(data.searchInfo.rebuiltAt).toBeTruthy();
    expect(data.searchInfo.titleCount).toBeGreaterThan(0);
    expect(data.searchInfo.nameCount).toBeGreaterThan(0);
  });

  it('searchTitles: faceted search returns real hits for "godfather"', async () => {
    globalThis.__liveToken = TOKEN;
    const data = await execute(SEARCH_TITLES_QUERY, {
      filter: { query: 'godfather' },
      sort: 'POPULARITY_DESC',
      limit: 5,
      offset: 0,
    });
    expect(data.searchTitles.total).toBeGreaterThan(0);
    expect(data.searchTitles.items.length).toBeGreaterThan(0);
    const titles = data.searchTitles.items.map((t) => t.primaryTitle.toLowerCase());
    expect(titles.some((t) => t.includes('godfather'))).toBe(true);
  }, 30000);

  it('search: union query returns both Title and Name results for "pacino"', async () => {
    globalThis.__liveToken = TOKEN;
    const data = await execute(SEARCH_QUERY, { query: 'pacino', kinds: null, limit: 20 });
    expect(data.search.length).toBeGreaterThan(0);
    const typenames = new Set(data.search.map((r) => r.__typename));
    expect(typenames.has('Name')).toBe(true);
  }, 30000);

  it('title: entity hydration through federation (The Godfather, tt0068646)', async () => {
    globalThis.__liveToken = TOKEN;
    const data = await execute(TITLE_QUERY, { tconst: 'tt0068646' });
    expect(data.title.primaryTitle).toBe('The Godfather');
    expect(data.title.rating.averageRating).toBeGreaterThan(0);
    expect(data.title.directors.length).toBeGreaterThan(0);
    expect(data.title.principals.length).toBeGreaterThan(0);
  }, 30000);

  it('bad credential: router 401 normalizes to kind "auth" through the module', async () => {
    globalThis.__liveToken = 'not-a-real-token';
    const err = await execute(SEARCH_INFO_QUERY).catch((e) => e);
    globalThis.__liveToken = TOKEN;
    expect(err).toBeInstanceOf(GraphQLLayerError);
    expect(err.kind).toBe('auth');
  }, 30000);

  it('IMDB-14 governance (redact mode): selecting Rating.numVotes resolves { data, deniedFields } — ungoverned fields survive, nothing 403s', async () => {
    globalThis.__liveToken = TOKEN;
    const { data, deniedFields } = await executeWithDenials(GOVERNED_TITLE_QUERY, {
      tconst: 'tt0068646',
    });
    // One denied field blanked nothing: every ungoverned sibling resolved…
    expect(data.title.primaryTitle).toBe('The Godfather');
    expect(data.title.startYear).toBe(1972);
    expect(data.title.rating.averageRating).toBeGreaterThan(0);
    // …the redacted coordinate is absent from data and reported to the view.
    expect(data.title.rating).not.toHaveProperty('numVotes');
    expect(deniedFields).toEqual(['Rating.numVotes']);
  }, 30000);

  it('IMDB-14: the redaction is a data-level signal, not an error — execute() succeeds too, with numVotes simply gone', async () => {
    globalThis.__liveToken = TOKEN;
    const data = await execute(GOVERNED_TITLE_QUERY, { tconst: 'tt0068646' });
    expect(data.title.rating.averageRating).toBeGreaterThan(0);
    expect(data.title.rating).not.toHaveProperty('numVotes');
  }, 30000);
});
