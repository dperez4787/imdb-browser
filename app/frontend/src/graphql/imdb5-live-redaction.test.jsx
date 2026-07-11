/**
 * IMDB-5 fix-round LIVE verification — SKIPPED unless LIVE_ROUTER_TOKEN is
 * set (same gating as live-router.integration.test.js, so `npm test` stays
 * hermetic):
 *
 *   LIVE_ROUTER_TOKEN="$(gcloud auth print-identity-token)" npm test
 *
 * The updated UniversalSearch document — which now selects the governed
 * Rating.numVotes OPTIMISTICALLY (architecture § Field-level governance) —
 * driven through the REAL client module AND the REAL useUniversalSearch hook
 * (real debounce, real QueryClient, real network; the only substituted seam
 * is auth.js#getIdToken, a Google OIDC identity token — one of the router's
 * two JWKS providers). Expectations while numVotes is denied to everyone
 * (policy rev 8 at verification time):
 *
 *   - HTTP 200, no error (graphql-request resolves only on 2xx);
 *   - numVotes silently ABSENT from every rating object in `data`;
 *   - the ungoverned co-selected averageRating still present;
 *   - deniedFields === ['Rating.numVotes'] flowing OUT OF THE HOOK.
 *
 * If the user flips a grant at the governance console, the deniedFields
 * assertion fails — that is this test doing its job.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createQueryClient } from './queryClient.js';
import { useUniversalSearch } from './searchHooks.js';

const TOKEN = process.env.LIVE_ROUTER_TOKEN;

vi.mock('../auth.js', () => ({
  getIdToken: vi.fn(async () => process.env.LIVE_ROUTER_TOKEN),
}));

let captured;
function Probe({ q }) {
  captured = useUniversalSearch(q);
  return <output>{captured.isSuccess ? 'done' : captured.isError ? 'error' : 'waiting'}</output>;
}

describe.skipIf(!TOKEN)('LIVE: redact-mode governance through useUniversalSearch (IMDB-5 fix round)', () => {
  it('numVotes silently absent, averageRating intact, deniedFields [Rating.numVotes] from the hook', async () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <Probe q="godfather" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/done|error/), {
      timeout: 30_000,
    });
    expect(screen.getByRole('status')).toHaveTextContent('done'); // 200, not 403

    const { data, deniedFields } = captured;
    // The one governed coordinate this document touches, straight off the hook.
    expect(deniedFields).toEqual(['Rating.numVotes']);

    const ratings = [
      ...data.hits.filter((h) => h.__typename === 'Title').map((h) => h.rating),
      ...data.titles.items.map((t) => t.rating),
    ].filter(Boolean);
    expect(ratings.length).toBeGreaterThan(0);
    for (const rating of ratings) {
      expect(rating).not.toHaveProperty('numVotes'); // silently absent, per-element
    }
    expect(ratings.some((r) => typeof r.averageRating === 'number')).toBe(true);

    expect(data.searchInfo.rebuiltAt).not.toBeNull(); // freshness rides along
  }, 45_000);
});
