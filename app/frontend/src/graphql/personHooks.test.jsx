/**
 * usePersonDetail wiring tests (IMDB-8), mirroring titleHooks.test.jsx: the
 * document selects the governed lifespan years OPTIMISTICALLY (beside
 * ungoverned siblings, per the amended AC and architecture § Field-level
 * governance), the key embeds the nconst, every fetch goes through
 * executeWithDenials, the envelope unwraps into { data, deniedFields }, and
 * staleTime is denial-scoped — 1 h clean, capped at 60 s the moment the
 * result reports denied coordinates (the grant-flip freshness guarantee).
 * client.js is mocked — transport behavior has its own tests.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { executeWithDenials } from './client.js';
import { DENIED_STALE_TIME } from './hooks.js';
import { staleTimes } from './keys.js';
import { personDetailKey, usePersonDetail } from './personHooks.js';
import { PERSON_DETAIL_QUERY } from './personQueries.js';
import { createQueryClient } from './queryClient.js';

vi.mock('./client.js', () => ({
  executeWithDenials: vi.fn().mockResolvedValue({ data: { name: null }, deniedFields: [] }),
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

describe('PERSON_DETAIL_QUERY (the optimistic document)', () => {
  it('uses the introspection-verified root field name(nconst:) — not DES-5\'s name(id:)', () => {
    expect(PERSON_DETAIL_QUERY).toMatch(/name\s*\(\s*nconst:\s*\$nconst\s*\)/);
    expect(PERSON_DETAIL_QUERY).not.toMatch(/name\s*\(\s*id:/);
  });

  it('selects the governed years optimistically, beside ungoverned siblings', () => {
    // The optimistic select IS the grant-detection mechanism: the full
    // document goes out every fetch, so a live grant appears with no code
    // change. primaryName etc. sit beside the governed leaves, so a
    // redaction degrades the lifespan line, never the person object.
    expect(PERSON_DETAIL_QUERY).toContain('birthYear');
    expect(PERSON_DETAIL_QUERY).toContain('deathYear');
    expect(PERSON_DETAIL_QUERY).toContain('primaryName');
  });

  it('selects everything the DES-5 page renders from (plural primaryProfessions, credits with title stubs)', () => {
    for (const field of [
      'primaryProfessions', // PLURAL — introspection-verified
      'knownForTitles',
      'credits',
      'ordering',
      'category',
      'characters',
      'primaryTitle',
      'startYear',
      'averageRating',
    ]) {
      expect(PERSON_DETAIL_QUERY).toContain(field);
    }
    expect(PERSON_DETAIL_QUERY).not.toMatch(/primaryProfession\b/);
  });
});

describe('usePersonDetail', () => {
  it('key embeds the nconst and the transport gets the SAME variables', async () => {
    const { queryClient, result } = renderQueryHook(() => usePersonDetail('nm0000199'));
    expect(cachedQuery(queryClient).queryKey).toEqual(personDetailKey('nm0000199'));
    expect(cachedQuery(queryClient).queryKey).toEqual(['personDetail', { nconst: 'nm0000199' }]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(executeWithDenials).toHaveBeenCalledWith(PERSON_DETAIL_QUERY, {
      nconst: 'nm0000199',
    });
  });

  it('unwraps the envelope: data + deniedFields surface side by side', async () => {
    const name = { nconst: 'nm0000199', primaryName: 'Al Pacino' };
    executeWithDenials.mockResolvedValue({
      data: { name },
      deniedFields: ['Name.birthYear', 'Name.deathYear'],
    });
    const { result } = renderQueryHook(() => usePersonDetail('nm0000199'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ name });
    expect(result.current.deniedFields).toEqual(['Name.birthYear', 'Name.deathYear']);
  });

  it('deniedFields is always an array — empty before any fetch resolves', () => {
    const { result } = renderQueryHook(() => usePersonDetail('nm0000199'));
    expect(result.current.deniedFields).toEqual([]);
  });

  it('is disabled without an nconst — no request leaves the hook', async () => {
    renderQueryHook(() => usePersonDetail(undefined));
    await Promise.resolve();
    expect(executeWithDenials).not.toHaveBeenCalled();
  });

  it('staleTime is denial-scoped: 1 h clean, 60 s cap when the result reports denials', () => {
    const { queryClient } = renderQueryHook(() => usePersonDetail('nm0000199'));
    const staleTime = cachedQuery(queryClient).options.staleTime;
    expect(typeof staleTime).toBe('function');
    expect(staleTime({ state: { data: { data: {}, deniedFields: [] } } })).toBe(staleTimes.name);
    expect(
      staleTime({ state: { data: { data: {}, deniedFields: ['Name.birthYear'] } } }),
    ).toBe(DENIED_STALE_TIME);
  });

  it('a caller-supplied staleTime cannot stretch a degraded result past the 60 s cap', () => {
    const { queryClient } = renderQueryHook(() =>
      usePersonDetail('nm0000199', { staleTime: 24 * 60 * 60 * 1000 }),
    );
    const staleTime = cachedQuery(queryClient).options.staleTime;
    expect(
      staleTime({ state: { data: { data: {}, deniedFields: ['Name.birthYear'] } } }),
    ).toBe(DENIED_STALE_TIME);
  });
});
