/**
 * useUniversalSearch (IMDB-5): the DES-2 contract at the client-layer seam —
 * one aliased document, ONE request per settled keystroke burst (250ms
 * debounce), no request under 2 characters, and a document that carries the
 * union + both prefix fills + searchInfo but does NOT select the governed
 * numVotes (per the product-owner's governance advisory on the ticket).
 * Transport is faked at the execute() seam; no network anywhere.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { execute } from './client.js';
import { createQueryClient } from './queryClient.js';
import { AUTOCOMPLETE_DEBOUNCE_MS, MIN_QUERY_LENGTH, useUniversalSearch } from './searchHooks.js';
import { UNIVERSAL_SEARCH_QUERY } from './searchQueries.js';

vi.mock('./client.js', () => ({
  execute: vi.fn(),
}));

const EMPTY = {
  hits: [],
  titles: { items: [] },
  people: { items: [] },
  searchInfo: { rebuiltAt: '2026-07-11T03:12:24.167Z' },
};

/** Minimal harness component so the hook runs under a real QueryClient. */
function Probe({ q }) {
  const { data, isPending, enabled } = useUniversalSearch(q);
  return (
    <output>
      {enabled ? 'enabled' : 'disabled'}:{isPending ? 'pending' : data ? 'data' : 'idle'}
    </output>
  );
}

function renderProbe(q) {
  const client = createQueryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <Probe q={q} />
    </QueryClientProvider>,
  );
  const setQ = (next) =>
    view.rerender(
      <QueryClientProvider client={client}>
        <Probe q={next} />
      </QueryClientProvider>,
    );
  return { ...view, setQ };
}

beforeEach(() => {
  vi.useFakeTimers();
  execute.mockResolvedValue(EMPTY);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('the UniversalSearch document', () => {
  it('is the single aliased document: union + prefix fills + searchInfo', () => {
    expect(UNIVERSAL_SEARCH_QUERY).toContain('hits: search(query: $q, limit: 8)');
    expect(UNIVERSAL_SEARCH_QUERY).toContain('titles: searchTitles(filter: { titlePrefix: $q }');
    expect(UNIVERSAL_SEARCH_QUERY).toContain('people: searchNames(filter: { namePrefix: $q }');
    expect(UNIVERSAL_SEARCH_QUERY).toContain('searchInfo');
    expect(UNIVERSAL_SEARCH_QUERY).toContain('rebuiltAt');
    expect(UNIVERSAL_SEARCH_QUERY).toContain('__typename');
  });

  it('does NOT select governed fields — selecting numVotes would 403 the whole operation', () => {
    expect(UNIVERSAL_SEARCH_QUERY).not.toContain('numVotes');
    expect(UNIVERSAL_SEARCH_QUERY).not.toContain('birthYear');
    expect(UNIVERSAL_SEARCH_QUERY).not.toContain('deathYear');
  });
});

describe('useUniversalSearch', () => {
  it('sends no request under the 2-character trigger', async () => {
    renderProbe('g');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOCOMPLETE_DEBOUNCE_MS * 4);
    });
    expect(execute).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('disabled');
    expect(MIN_QUERY_LENGTH).toBe(2);
  });

  it('debounces a keystroke burst into exactly ONE request with the settled query', async () => {
    const { setQ } = renderProbe('');

    // A burst: g → go → god → godf, each keystroke 100ms apart (< 250ms).
    for (const q of ['g', 'go', 'god', 'godf']) {
      setQ(q);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
    }
    expect(execute).not.toHaveBeenCalled(); // still mid-burst — nothing settled

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOCOMPLETE_DEBOUNCE_MS);
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(UNIVERSAL_SEARCH_QUERY, { q: 'godf' });

    // The settled request's data reaches the hook. TanStack schedules its
    // observer notification with setTimeout, so flush the fake clock first,
    // then let waitFor poll on real timers.
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('data'));
  });

  it('a second settled burst issues a second request (new query key)', async () => {
    const { setQ } = renderProbe('godf');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOCOMPLETE_DEBOUNCE_MS);
    });
    expect(execute).toHaveBeenCalledTimes(1);

    setQ('coppola');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOCOMPLETE_DEBOUNCE_MS);
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenLastCalledWith(UNIVERSAL_SEARCH_QUERY, { q: 'coppola' });
  });

  it('trims whitespace before deciding the trigger and the key', async () => {
    renderProbe('  godf  ');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOCOMPLETE_DEBOUNCE_MS);
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(UNIVERSAL_SEARCH_QUERY, { q: 'godf' });
  });
});
