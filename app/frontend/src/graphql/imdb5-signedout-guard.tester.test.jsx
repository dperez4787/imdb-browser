/**
 * IMDB-5 tester spot-check: the ticket's AuthGate criterion has a structural
 * backstop in the client layer (IMDB-4's guard) — verify it holds through the
 * NEW universal-search path: while signed out, the aliased search document
 * produces ZERO network activity, both at execute() directly and through the
 * real useUniversalSearch hook (real debounce, real QueryClient, real
 * client.js — only auth.js is faked, and global fetch is spied).
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getIdToken } from '../auth.js';
import { execute } from './client.js';
import { createQueryClient } from './queryClient.js';
import { useUniversalSearch } from './searchHooks.js';
import { UNIVERSAL_SEARCH_QUERY } from './searchQueries.js';

vi.mock('../auth.js', () => ({
  getIdToken: vi.fn(),
}));

const fetchSpy = vi.fn(() => {
  throw new Error('network reached while signed out — the guard failed');
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchSpy);
  getIdToken.mockResolvedValue(null); // signed out
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('signed-out guard through the universal-search path (IMDB-4 backstop)', () => {
  it('execute() throws a normalized auth error before ANY network request', async () => {
    await expect(execute(UNIVERSAL_SEARCH_QUERY, { q: 'godf' })).rejects.toMatchObject({
      kind: 'auth',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('useUniversalSearch surfaces kind "auth" with zero network activity', async () => {
    function Probe() {
      const { error } = useUniversalSearch('godf');
      return <output data-testid="err">{error ? error.kind : 'none'}</output>;
    }
    render(
      <QueryClientProvider client={createQueryClient()}>
        <Probe />
      </QueryClientProvider>,
    );
    // Real 250ms debounce runs, the query fires, the guard rejects it;
    // kind 'auth' is non-retryable at the TanStack layer (queryClient.js).
    await waitFor(() => expect(screen.getByTestId('err')).toHaveTextContent('auth'), {
      timeout: 3000,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getIdToken).toHaveBeenCalled();
  });
});
