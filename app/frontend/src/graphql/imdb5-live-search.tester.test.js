// @vitest-environment node
/**
 * IMDB-5 LIVE verification — SKIPPED unless LIVE_ROUTER_TOKEN is set, same
 * pattern as live-router.integration.test.js, so `npm test` stays hermetic.
 *
 *   LIVE_ROUTER_TOKEN="$(gcloud auth print-identity-token)" npm test
 *
 * Drives the EXACT shipped UniversalSearch document through the REAL client
 * module against the live cosmo router (auth.js#getIdToken is the only
 * substituted seam — a Google OIDC identity token, one of the router's two
 * JWKS providers; the Firebase-ID-token browser path stays not-verified here):
 *
 *   - a multi-entity query returns union hits interleaving Title and Name in
 *     server order, and the document does not 403 ([IMDB-5 fix round] the
 *     document now selects the governed numVotes OPTIMISTICALLY — the
 *     router's transparent redact mode answers 200 with the field silently
 *     absent; the redaction contract itself is covered live by
 *     imdb5-live-redaction.test.jsx);
 *   - a mid-word query returns zero union hits but non-empty prefix fill —
 *     Appendix A is a real scenario, not a hypothetical;
 *   - searchInfo.rebuiltAt rides along non-null (folded IMDB-13).
 */
import { describe, expect, it, vi } from 'vitest';

import { assembleRows } from '../search/mergeRows.js';
import { UNIVERSAL_SEARCH_QUERY } from './searchQueries.js';

const TOKEN = process.env.LIVE_ROUTER_TOKEN;

vi.mock('../auth.js', () => ({
  getIdToken: vi.fn(async () => process.env.LIVE_ROUTER_TOKEN ?? null),
}));

const { execute } = await import('./client.js');

describe.skipIf(!TOKEN)('LIVE: the shipped UniversalSearch document (IMDB-5)', () => {
  it('multi-entity query: union interleaves Title and Name, searchInfo non-null', async () => {
    // "godfather" observably interleaves mid-list (T T N T T…). Note some
    // queries (e.g. "coppola" live: 3 Titles then 5 Names) rank one type
    // contiguously — that is still server order, which the client must not
    // regroup; this test just needs a query where interleaving is visible.
    const data = await execute(UNIVERSAL_SEARCH_QUERY, { q: 'godfather' });

    const typenames = data.hits.map((h) => h.__typename);
    expect(typenames.length).toBeGreaterThan(0);
    expect(new Set(typenames)).toEqual(new Set(['Title', 'Name']));
    // Actually interleaved (not grouped): a Title appears after a Name.
    const firstName = typenames.indexOf('Name');
    const lastTitle = typenames.lastIndexOf('Title');
    expect(firstName).toBeGreaterThan(-1);
    expect(lastTitle).toBeGreaterThan(firstName);

    // Every union hit carries what a row renders.
    for (const hit of data.hits) {
      if (hit.__typename === 'Title') expect(hit.tconst).toMatch(/^tt/);
      else expect(hit.nconst).toMatch(/^nm/);
    }

    expect(data.searchInfo.rebuiltAt).not.toBeNull();
    expect(new Date(data.searchInfo.rebuiltAt).toString()).not.toBe('Invalid Date');

    // The panel would render at most 8 unique rows.
    const rows = assembleRows(data, 8);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(8);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  }, 30_000);

  it('mid-word query: empty union, non-empty prefix fill (Appendix A is real)', async () => {
    const data = await execute(UNIVERSAL_SEARCH_QUERY, { q: 'godf' });

    expect(data.hits).toEqual([]); // whole-word/stem union: mid-word misses
    expect(data.titles.items.length).toBeGreaterThan(0); // prefix fill catches it

    const rows = assembleRows(data, 8);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].kind).toBe('title');
  }, 30_000);
});
