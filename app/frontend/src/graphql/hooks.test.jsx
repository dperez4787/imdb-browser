/**
 * Hook wiring tests (IMDB-4): query keys embed the FULL variable set, each
 * operation gets the architecture's staleTime (1h entities/facets/searchInfo,
 * 5m search results), refetchOnWindowFocus is off via createQueryClient, and
 * hooks hand the exact same variables to the transport. client.js is mocked —
 * transport behavior has its own tests.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { execute } from './client.js';
import { useFacets, useName, useSearch, useSearchInfo, useSearchNames, useSearchTitles, useTitle } from './hooks.js';
import { queryKeys, staleTimes } from './keys.js';
import {
  NAME_QUERY,
  SEARCH_NAMES_QUERY,
  SEARCH_QUERY,
  SEARCH_TITLES_QUERY,
  TITLE_QUERY,
} from './queries.js';
import { createQueryClient } from './queryClient.js';

vi.mock('./client.js', () => ({
  execute: vi.fn().mockResolvedValue({}),
}));

const HOUR = 60 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;

/** Render a hook inside a fresh app-shaped QueryClientProvider. */
async function renderQueryHook(hook) {
  const { QueryClientProvider } = await import('@tanstack/react-query');
  const queryClient = createQueryClient();
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(hook, { wrapper });
  return { queryClient, ...rendered };
}

/** The single cached query created by a hook render. */
function cachedQuery(queryClient) {
  const all = queryClient.getQueryCache().getAll();
  expect(all).toHaveLength(1);
  return all[0];
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('query keys embed the full variable set', () => {
  it('useSearchTitles: key = ["searchTitles", {filter, sort, limit, offset}] with defaults applied', async () => {
    const filter = { query: 'godfather', genresAny: ['Crime'] };
    const { queryClient, result } = await renderQueryHook(() => useSearchTitles({ filter }));

    const expectedVariables = { filter, sort: 'POPULARITY_DESC', limit: 24, offset: 0 };
    expect(cachedQuery(queryClient).queryKey).toEqual(['searchTitles', expectedVariables]);

    // The transport receives the SAME variables the key embeds.
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(execute).toHaveBeenCalledWith(SEARCH_TITLES_QUERY, expectedVariables);
  });

  it('useSearchTitles: different page → different key (paging never collides in cache)', async () => {
    const filter = { query: 'godfather' };
    const { queryClient } = await renderQueryHook(() => useSearchTitles({ filter, offset: 24 }));
    expect(cachedQuery(queryClient).queryKey).toEqual([
      'searchTitles',
      { filter, sort: 'POPULARITY_DESC', limit: 24, offset: 24 },
    ]);
  });

  it('useSearchNames embeds filter/sort/limit/offset', async () => {
    const filter = { namePrefix: 'pacin' };
    const { queryClient, result } = await renderQueryHook(() => useSearchNames({ filter }));
    const expectedVariables = { filter, sort: 'POPULARITY_DESC', limit: 24, offset: 0 };
    expect(cachedQuery(queryClient).queryKey).toEqual(['searchNames', expectedVariables]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(execute).toHaveBeenCalledWith(SEARCH_NAMES_QUERY, expectedVariables);
  });

  it('useSearch embeds query/kinds/limit', async () => {
    const { queryClient, result } = await renderQueryHook(() =>
      useSearch({ query: 'god', kinds: ['TITLE'], limit: 5 }),
    );
    const expectedVariables = { query: 'god', kinds: ['TITLE'], limit: 5 };
    expect(cachedQuery(queryClient).queryKey).toEqual(['search', expectedVariables]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(execute).toHaveBeenCalledWith(SEARCH_QUERY, expectedVariables);
  });

  it('useTitle / useName embed their id', async () => {
    const { queryClient, result } = await renderQueryHook(() => useTitle('tt0068646'));
    expect(cachedQuery(queryClient).queryKey).toEqual(['title', { tconst: 'tt0068646' }]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(execute).toHaveBeenCalledWith(TITLE_QUERY, { tconst: 'tt0068646' });

    const named = await renderQueryHook(() => useName('nm0000199'));
    expect(cachedQuery(named.queryClient).queryKey).toEqual(['name', { nconst: 'nm0000199' }]);
    await waitFor(() => expect(named.result.current.isSuccess).toBe(true));
    expect(execute).toHaveBeenCalledWith(NAME_QUERY, { nconst: 'nm0000199' });
  });

  it('keys.js builders match what the hooks cache under', () => {
    expect(queryKeys.searchInfo()).toEqual(['searchInfo']);
    expect(queryKeys.facets()).toEqual(['facets']);
    expect(queryKeys.title({ tconst: 't' })).toEqual(['title', { tconst: 't' }]);
  });
});

describe('staleTime wiring (architecture caching policy)', () => {
  it('searchInfo and facets are fresh for 1 hour', async () => {
    const info = await renderQueryHook(() => useSearchInfo());
    expect(cachedQuery(info.queryClient).options.staleTime).toBe(HOUR);
    const facets = await renderQueryHook(() => useFacets());
    expect(cachedQuery(facets.queryClient).options.staleTime).toBe(HOUR);
  });

  it('title/name entities are fresh for 1 hour', async () => {
    const title = await renderQueryHook(() => useTitle('tt0068646'));
    expect(cachedQuery(title.queryClient).options.staleTime).toBe(HOUR);
    const name = await renderQueryHook(() => useName('nm0000199'));
    expect(cachedQuery(name.queryClient).options.staleTime).toBe(HOUR);
  });

  it('search results are fresh for 5 minutes', async () => {
    const titles = await renderQueryHook(() => useSearchTitles({ filter: { query: 'x' } }));
    expect(cachedQuery(titles.queryClient).options.staleTime).toBe(FIVE_MINUTES);
    const names = await renderQueryHook(() => useSearchNames({ filter: { query: 'x' } }));
    expect(cachedQuery(names.queryClient).options.staleTime).toBe(FIVE_MINUTES);
    const mixed = await renderQueryHook(() => useSearch({ query: 'x' }));
    expect(cachedQuery(mixed.queryClient).options.staleTime).toBe(FIVE_MINUTES);
  });

  it('staleTimes exports match, so cache plumbing can rely on them', () => {
    expect(staleTimes).toMatchObject({
      searchInfo: HOUR,
      facets: HOUR,
      title: HOUR,
      name: HOUR,
      searchTitles: FIVE_MINUTES,
      searchNames: FIVE_MINUTES,
      search: FIVE_MINUTES,
    });
  });
});

describe('createQueryClient defaults', () => {
  it('turns refetchOnWindowFocus off for every query', async () => {
    const { queryClient } = await renderQueryHook(() => useSearchInfo());
    expect(cachedQuery(queryClient).options.refetchOnWindowFocus).toBe(false);
  });

  it('never retries auth or bad-request failures; retries transient ones', () => {
    const { retry } = createQueryClient().getDefaultOptions().queries;
    expect(retry(0, { kind: 'auth' })).toBe(false);
    expect(retry(0, { kind: 'bad-request' })).toBe(false);
    expect(retry(0, { kind: 'network' })).toBe(true);
    expect(retry(2, { kind: 'network' })).toBe(false);
  });
});

describe('disabled states (no variables, no request)', () => {
  it('useTitle/useName/useSearch do not fetch without an id/query', async () => {
    await renderQueryHook(() => useTitle(undefined));
    await renderQueryHook(() => useName(undefined));
    await renderQueryHook(() => useSearch({ query: '' }));
    expect(execute).not.toHaveBeenCalled();
  });
});
