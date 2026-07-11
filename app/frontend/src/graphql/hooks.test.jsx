/**
 * Hook wiring tests (IMDB-4 + IMDB-14): query keys embed the FULL variable
 * set, each operation gets the architecture's staleTime (1h entities/facets/
 * searchInfo, 5m search results — 60s the moment a result reports denied
 * coordinates), refetchOnWindowFocus is off via createQueryClient, every
 * queryFn goes through executeWithDenials, and hooks unwrap the
 * {data, deniedFields} envelope so views get `deniedFields` alongside `data`.
 * client.js is mocked — transport/strip behavior has its own tests.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { executeWithDenials } from './client.js';
import {
  DENIED_STALE_TIME,
  denialScopedStaleTime,
  useFacets,
  useName,
  useSearch,
  useSearchInfo,
  useSearchNames,
  useSearchTitles,
  useTitle,
} from './hooks.js';
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
  executeWithDenials: vi.fn().mockResolvedValue({ data: {}, deniedFields: [] }),
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

/** Resolve the cached query's function-form staleTime for a given envelope. */
function staleTimeFor(queryClient, data) {
  const staleTime = cachedQuery(queryClient).options.staleTime;
  expect(typeof staleTime).toBe('function'); // IMDB-14: denial-scoped
  return staleTime({ state: { data } });
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
    expect(executeWithDenials).toHaveBeenCalledWith(SEARCH_TITLES_QUERY, expectedVariables);
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
    expect(executeWithDenials).toHaveBeenCalledWith(SEARCH_NAMES_QUERY, expectedVariables);
  });

  it('useSearch embeds query/kinds/limit', async () => {
    const { queryClient, result } = await renderQueryHook(() =>
      useSearch({ query: 'god', kinds: ['TITLE'], limit: 5 }),
    );
    const expectedVariables = { query: 'god', kinds: ['TITLE'], limit: 5 };
    expect(cachedQuery(queryClient).queryKey).toEqual(['search', expectedVariables]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(executeWithDenials).toHaveBeenCalledWith(SEARCH_QUERY, expectedVariables);
  });

  it('useTitle / useName embed their id', async () => {
    const { queryClient, result } = await renderQueryHook(() => useTitle('tt0068646'));
    expect(cachedQuery(queryClient).queryKey).toEqual(['title', { tconst: 'tt0068646' }]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(executeWithDenials).toHaveBeenCalledWith(TITLE_QUERY, { tconst: 'tt0068646' });

    const named = await renderQueryHook(() => useName('nm0000199'));
    expect(cachedQuery(named.queryClient).queryKey).toEqual(['name', { nconst: 'nm0000199' }]);
    await waitFor(() => expect(named.result.current.isSuccess).toBe(true));
    expect(executeWithDenials).toHaveBeenCalledWith(NAME_QUERY, { nconst: 'nm0000199' });
  });

  it('keys.js builders match what the hooks cache under', () => {
    expect(queryKeys.searchInfo()).toEqual(['searchInfo']);
    expect(queryKeys.facets()).toEqual(['facets']);
    expect(queryKeys.title({ tconst: 't' })).toEqual(['title', { tconst: 't' }]);
  });
});

describe('the {data, deniedFields} envelope (IMDB-14 hook contract)', () => {
  it('unwraps data and exposes deniedFields: [] on a clean result', async () => {
    executeWithDenials.mockResolvedValue({
      data: { title: { primaryTitle: 'The Godfather' } },
      deniedFields: [],
    });
    const { result } = await renderQueryHook(() => useTitle('tt0068646'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Views read result.data as the operation data — the envelope is internal.
    expect(result.current.data).toEqual({ title: { primaryTitle: 'The Godfather' } });
    expect(result.current.deniedFields).toEqual([]);
  });

  it('exposes the denied coordinates alongside the degraded data', async () => {
    executeWithDenials.mockResolvedValue({
      data: { title: { primaryTitle: 'The Godfather', rating: { averageRating: 9.2 } } },
      deniedFields: ['Rating.numVotes'],
    });
    const { result } = await renderQueryHook(() => useTitle('tt0068646'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // A denied vote count did NOT blank the view's data…
    expect(result.current.data.title.rating.averageRating).toBe(9.2);
    // …and the view can apply the two-rule contract from deniedFields.
    expect(result.current.deniedFields).toEqual(['Rating.numVotes']);
  });

  it('deniedFields is always an array, even before any data arrives', async () => {
    const { result } = await renderQueryHook(() => useTitle(undefined)); // disabled
    expect(result.current.deniedFields).toEqual([]);
    expect(result.current.data).toBeUndefined();
  });
});

describe('staleTime wiring (architecture caching policy + denial scoping)', () => {
  const clean = { data: {}, deniedFields: [] };
  const degraded = { data: {}, deniedFields: ['Rating.numVotes'] };

  it('searchInfo and facets are fresh for 1 hour when clean', async () => {
    const info = await renderQueryHook(() => useSearchInfo());
    expect(staleTimeFor(info.queryClient, clean)).toBe(HOUR);
    const facets = await renderQueryHook(() => useFacets());
    expect(staleTimeFor(facets.queryClient, clean)).toBe(HOUR);
  });

  it('title/name entities are fresh for 1 hour when clean', async () => {
    const title = await renderQueryHook(() => useTitle('tt0068646'));
    expect(staleTimeFor(title.queryClient, clean)).toBe(HOUR);
    const name = await renderQueryHook(() => useName('nm0000199'));
    expect(staleTimeFor(name.queryClient, clean)).toBe(HOUR);
  });

  it('search results are fresh for 5 minutes when clean', async () => {
    const titles = await renderQueryHook(() => useSearchTitles({ filter: { query: 'x' } }));
    expect(staleTimeFor(titles.queryClient, clean)).toBe(FIVE_MINUTES);
    const names = await renderQueryHook(() => useSearchNames({ filter: { query: 'x' } }));
    expect(staleTimeFor(names.queryClient, clean)).toBe(FIVE_MINUTES);
    const mixed = await renderQueryHook(() => useSearch({ query: 'x' }));
    expect(staleTimeFor(mixed.queryClient, clean)).toBe(FIVE_MINUTES);
  });

  it('ANY result carrying denied coordinates is stale after 60s — a live grant flip shows on the next fetch', async () => {
    const title = await renderQueryHook(() => useTitle('tt0068646'));
    expect(staleTimeFor(title.queryClient, degraded)).toBe(DENIED_STALE_TIME);
    const names = await renderQueryHook(() =>
      useSearchNames({ filter: { namePrefix: 'pacin' } }),
    );
    expect(staleTimeFor(names.queryClient, degraded)).toBe(DENIED_STALE_TIME);
    expect(DENIED_STALE_TIME).toBe(60_000);
  });

  it('denialScopedStaleTime: 60s iff the cached envelope reports denials (function form, missing data safe)', () => {
    const staleTime = denialScopedStaleTime(HOUR);
    expect(staleTime({ state: { data: degraded } })).toBe(60_000);
    expect(staleTime({ state: { data: clean } })).toBe(HOUR);
    expect(staleTime({ state: { data: undefined } })).toBe(HOUR);
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

  it('never retries auth, bad-request, or denied failures; retries transient ones', () => {
    const { retry } = createQueryClient().getDefaultOptions().queries;
    expect(retry(0, { kind: 'auth' })).toBe(false);
    expect(retry(0, { kind: 'bad-request' })).toBe(false);
    // IMDB-14: a reject-mode denial is deterministic per policy revision —
    // TanStack must not burn requests re-asking.
    expect(retry(0, { kind: 'denied' })).toBe(false);
    expect(retry(0, { kind: 'network' })).toBe(true);
    expect(retry(2, { kind: 'network' })).toBe(false);
  });
});

describe('disabled states (no variables, no request)', () => {
  it('useTitle/useName/useSearch do not fetch without an id/query', async () => {
    await renderQueryHook(() => useTitle(undefined));
    await renderQueryHook(() => useName(undefined));
    await renderQueryHook(() => useSearch({ query: '' }));
    expect(executeWithDenials).not.toHaveBeenCalled();
  });
});
