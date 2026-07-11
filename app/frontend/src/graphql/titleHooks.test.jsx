/**
 * useTitleDetail wiring tests (IMDB-7): the document selects the governed
 * vote count OPTIMISTICALLY (with averageRating co-selected, per the
 * amended AC and architecture § Field-level governance), the key embeds the
 * tconst, every fetch goes through executeWithDenials, the envelope unwraps
 * into { data, deniedFields }, and staleTime is denial-scoped — 1 h clean,
 * capped at 60 s the moment the result reports denied coordinates (the
 * grant-flip freshness guarantee). client.js is mocked — transport behavior
 * has its own tests.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { executeWithDenials } from './client.js';
import { DENIED_STALE_TIME } from './hooks.js';
import { staleTimes } from './keys.js';
import { createQueryClient } from './queryClient.js';
import { titleDetailKey, useTitleDetail } from './titleHooks.js';
import { TITLE_DETAIL_QUERY } from './titleQueries.js';

vi.mock('./client.js', () => ({
  executeWithDenials: vi.fn().mockResolvedValue({ data: { title: null }, deniedFields: [] }),
}));

function renderQueryHook(hook) {
  const queryClient = createQueryClient();
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...renderHook(hook, { wrapper }) };
}

function cachedQuery(queryClient) {
  const all = queryClient.getQueryCache().getAll();
  expect(all).toHaveLength(1);
  return all[0];
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('TITLE_DETAIL_QUERY (the optimistic document)', () => {
  it('selects the governed Rating.numVotes with averageRating co-selected beside it', () => {
    // The optimistic select IS the grant-detection mechanism: the full
    // document goes out every fetch, so a live grant appears with no code
    // change. The co-select keeps a redaction degrading the votes line,
    // never the whole rating object.
    expect(TITLE_DETAIL_QUERY).toMatch(/rating\s*\{\s*averageRating\s+numVotes\s*\}/);
  });

  it('selects everything the DES-4 page renders from', () => {
    for (const field of [
      'primaryTitle',
      'titleType',
      'startYear',
      'endYear',
      'runtimeMinutes',
      'genres',
      'principals',
      'category',
      'characters',
      'primaryName',
      'episode',
      'seasonNumber',
      'episodeNumber',
    ]) {
      expect(TITLE_DETAIL_QUERY).toContain(field);
    }
  });
});

describe('useTitleDetail', () => {
  it('key embeds the tconst and the transport gets the SAME variables', async () => {
    const { queryClient, result } = renderQueryHook(() => useTitleDetail('tt0068646'));
    expect(cachedQuery(queryClient).queryKey).toEqual(titleDetailKey('tt0068646'));
    expect(cachedQuery(queryClient).queryKey).toEqual(['titleDetail', { tconst: 'tt0068646' }]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(executeWithDenials).toHaveBeenCalledWith(TITLE_DETAIL_QUERY, { tconst: 'tt0068646' });
  });

  it('unwraps the envelope: data + deniedFields surface side by side', async () => {
    const title = { tconst: 'tt0068646', rating: { averageRating: 9.2 } };
    executeWithDenials.mockResolvedValue({
      data: { title },
      deniedFields: ['Rating.numVotes'],
    });
    const { result } = renderQueryHook(() => useTitleDetail('tt0068646'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ title });
    expect(result.current.deniedFields).toEqual(['Rating.numVotes']);
  });

  it('deniedFields is always an array — empty before any fetch resolves', () => {
    const { result } = renderQueryHook(() => useTitleDetail('tt0068646'));
    expect(result.current.deniedFields).toEqual([]);
  });

  it('is disabled without a tconst — no request leaves the hook', async () => {
    renderQueryHook(() => useTitleDetail(undefined));
    await Promise.resolve();
    expect(executeWithDenials).not.toHaveBeenCalled();
  });

  it('staleTime is denial-scoped: 1 h clean, 60 s cap when the result reports denials', () => {
    const { queryClient } = renderQueryHook(() => useTitleDetail('tt0068646'));
    const staleTime = cachedQuery(queryClient).options.staleTime;
    expect(typeof staleTime).toBe('function');
    expect(staleTime({ state: { data: { data: {}, deniedFields: [] } } })).toBe(staleTimes.title);
    expect(staleTime({ state: { data: { data: {}, deniedFields: ['Rating.numVotes'] } } })).toBe(
      DENIED_STALE_TIME,
    );
  });

  it('a caller-supplied staleTime cannot stretch a degraded result past the 60 s cap', () => {
    const { queryClient } = renderQueryHook(() =>
      useTitleDetail('tt0068646', { staleTime: 24 * 60 * 60 * 1000 }),
    );
    const staleTime = cachedQuery(queryClient).options.staleTime;
    expect(staleTime({ state: { data: { data: {}, deniedFields: ['Rating.numVotes'] } } })).toBe(
      DENIED_STALE_TIME,
    );
  });
});
