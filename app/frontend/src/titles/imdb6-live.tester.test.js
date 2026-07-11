// @vitest-environment node
/**
 * IMDB-6 LIVE verification — SKIPPED unless LIVE_ROUTER_TOKEN is set, same
 * pattern as imdb5-live-search.tester.test.js, so `npm test` stays hermetic.
 *
 *   LIVE_ROUTER_TOKEN="$(gcloud auth print-identity-token)" npm test
 *
 * Drives the EXACT shipped FacetedTitleSearch document through the REAL
 * client module (executeWithDenials) against the live cosmo router, with the
 * variables built by the REAL urlState mapping from a deep-link URL — a
 * DIFFERENT filter combo from the developer's own live check (theirs:
 * genresAny Horror + votesFrom 1000 + RATING_DESC; this: Comedy movies of the
 * 1990s sorted YEAR_ASC), so determinism is not a one-combo accident:
 *
 *   - the same deep link fetched twice returns the identical item order;
 *   - page 1 ∩ page 2 is empty (deterministic paging, no duplicates/skips);
 *   - the documented sort actually orders (YEAR_ASC → startYear non-decreasing)
 *     and the filter actually filters (years within range, movie type only);
 *   - contextual facet counts are evaluated WITHIN the filter, not globally:
 *     every genre count ≤ the filtered total, which is far below the corpus.
 *
 * auth.js#getIdToken is the only substituted seam — a Google OIDC identity
 * token (one of the router's two JWKS providers); the Firebase-ID-token
 * browser path stays not-verified here, per the ticket's live-check record.
 */
import { describe, expect, it, vi } from 'vitest';

import { FACETS_QUERY } from '../graphql/queries.js';
import { FACETED_TITLE_SEARCH_QUERY } from '../graphql/titleSearchQueries.js';
import { FACET_DIMENSIONS, FACET_PER_DIMENSION } from '../graphql/useTitleSearch.js';
import { buildVariables, parseState } from './urlState.js';

const TOKEN = process.env.LIVE_ROUTER_TOKEN;

vi.mock('../auth.js', () => ({
  getIdToken: vi.fn(async () => process.env.LIVE_ROUTER_TOKEN ?? null),
}));

const { executeWithDenials } = await import('../graphql/client.js');

/** The deep link under test, exactly as a user would share it. */
const DEEP_LINK = 'types=movie&genres=Comedy&yearFrom=1990&yearTo=1999&sort=YEAR_ASC';

function variablesForPage(page) {
  const state = parseState(new URLSearchParams(`${DEEP_LINK}${page > 1 ? `&page=${page}` : ''}`));
  return {
    ...buildVariables(state),
    facetDimensions: [...FACET_DIMENSIONS],
    facetPerDimension: FACET_PER_DIMENSION,
  };
}

const run = (variables) => executeWithDenials(FACETED_TITLE_SEARCH_QUERY, variables);

describe.skipIf(!TOKEN)('LIVE: the shipped FacetedTitleSearch document (IMDB-6)', () => {
  it('the same deep link twice returns the identical item order; the filter and sort hold', async () => {
    const vars = variablesForPage(1);
    const [a, b] = [await run(vars), await run(vars)];

    const orderA = a.data.searchTitles.items.map((t) => t.tconst);
    const orderB = b.data.searchTitles.items.map((t) => t.tconst);
    expect(orderA.length).toBeGreaterThan(0);
    expect(orderB).toEqual(orderA); // determinism: a shared URL reproduces the view

    for (const item of a.data.searchTitles.items) {
      expect(item.titleType).toBe('movie'); // types filter holds
      expect(item.startYear).toBeGreaterThanOrEqual(1990); // year range holds
      expect(item.startYear).toBeLessThanOrEqual(1999);
    }
    // YEAR_ASC actually orders.
    const years = a.data.searchTitles.items.map((t) => t.startYear);
    for (let i = 1; i < years.length; i += 1) {
      expect(years[i]).toBeGreaterThanOrEqual(years[i - 1]);
    }
  }, 30_000);

  it('page 1 ∩ page 2 is empty — deterministic paging, no duplicates or skips', async () => {
    const [p1, p2] = [await run(variablesForPage(1)), await run(variablesForPage(2))];
    const ids1 = new Set(p1.data.searchTitles.items.map((t) => t.tconst));
    const ids2 = p2.data.searchTitles.items.map((t) => t.tconst);
    expect(ids2.length).toBeGreaterThan(0);
    expect(ids2.filter((id) => ids1.has(id))).toEqual([]);
  }, 30_000);

  it('contextual facet counts re-count WITHIN the filter, not the global corpus', async () => {
    const filtered = (await run(variablesForPage(1))).data.searchTitles;
    const genreBucket = filtered.facets.find((f) => f.dimension === 'GENRES');
    expect(genreBucket.values.length).toBeGreaterThan(0);

    // Within-filter: no genre can count more titles than the filtered total.
    for (const { count } of genreBucket.values) {
      expect(count).toBeLessThanOrEqual(filtered.total);
    }

    // Not-global: compare against the SAME source the rail's vocabulary uses
    // (the global `facets` query — precomputed, unlike a whole-corpus
    // searchTitles, which exceeds the router's execution budget). If the view
    // wired the global counts instead of the response's, these would be equal.
    const globalGenres = new Map(
      (await executeWithDenials(FACETS_QUERY, {})).data.facets.genres.map((v) => [
        v.value,
        v.count,
      ]),
    );
    let strictlySmaller = 0;
    for (const { value, count } of genreBucket.values) {
      const global = globalGenres.get(value);
      if (global != null) {
        expect(count).toBeLessThanOrEqual(global);
        if (count < global) strictlySmaller += 1;
      }
    }
    expect(strictlySmaller).toBeGreaterThan(0); // the counts visibly re-counted
  }, 30_000);
});
