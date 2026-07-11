/**
 * useUniversalSearch (IMDB-5): the DES-2 contract at the client-layer seam —
 * one aliased document, ONE request per settled keystroke burst (250ms
 * debounce), no request under 2 characters, and (since the IMDB-14 merge) the
 * governance contract: the document selects the governed numVotes
 * OPTIMISTICALLY, the queryFn is the denial-aware executeWithDenials, the
 * hook surfaces deniedFields from the envelope, degraded results go stale
 * within 60 s (denial-scoped staleTime), and placeholder rows are scoped to
 * the same query lineage. Transport is faked at the executeWithDenials()
 * seam; no network anywhere.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { executeWithDenials } from './client.js';
import { createQueryClient } from './queryClient.js';
import {
  AUTOCOMPLETE_DEBOUNCE_MS,
  isSameQueryLineage,
  MIN_QUERY_LENGTH,
  useUniversalSearch,
} from './searchHooks.js';
import { UNIVERSAL_SEARCH_QUERY } from './searchQueries.js';

vi.mock('./client.js', () => ({
  executeWithDenials: vi.fn(),
}));

const EMPTY = {
  hits: [],
  titles: { items: [] },
  people: { items: [] },
  searchInfo: { rebuiltAt: '2026-07-11T03:12:24.167Z' },
};

/** The redact-mode envelope executeWithDenials resolves. */
const envelope = (data = EMPTY, deniedFields = []) => ({ data, deniedFields });

/** Minimal harness component so the hook runs under a real QueryClient. */
function Probe({ q }) {
  const { data, deniedFields, isPending, isPlaceholderData, enabled } = useUniversalSearch(q);
  return (
    <output>
      {enabled ? 'enabled' : 'disabled'}:{isPending ? 'pending' : data ? 'data' : 'idle'}:
      {isPlaceholderData ? 'placeholder' : 'own'}:[{deniedFields.join(',')}]:
      {data?.hits?.[0]?.primaryTitle ?? 'none'}
    </output>
  );
}

function renderProbe(q, client = createQueryClient()) {
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
  return { ...view, setQ, client };
}

const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(AUTOCOMPLETE_DEBOUNCE_MS);
  });

beforeEach(() => {
  vi.useFakeTimers();
  executeWithDenials.mockResolvedValue(envelope());
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

  it('selects the governed numVotes OPTIMISTICALLY (redact mode makes it free), co-selected with averageRating', () => {
    // architecture § Field-level governance: optimistic select, one round
    // trip — redaction is silent on a 200 and a live grant flip lights the
    // value up with no code change. Both rating selections carry it.
    const votesSelections = UNIVERSAL_SEARCH_QUERY.match(/numVotes/g) ?? [];
    expect(votesSelections).toHaveLength(2); // union fragment + titles fill
    expect(UNIVERSAL_SEARCH_QUERY.match(/averageRating/g)).toHaveLength(2);
    // Still nothing selects the governed Name coordinates — no row shows them.
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
    expect(executeWithDenials).not.toHaveBeenCalled();
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
    expect(executeWithDenials).not.toHaveBeenCalled(); // still mid-burst — nothing settled

    await settle();
    expect(executeWithDenials).toHaveBeenCalledTimes(1);
    expect(executeWithDenials).toHaveBeenCalledWith(UNIVERSAL_SEARCH_QUERY, { q: 'godf' });

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
    await settle();
    expect(executeWithDenials).toHaveBeenCalledTimes(1);

    setQ('coppola');
    await settle();
    expect(executeWithDenials).toHaveBeenCalledTimes(2);
    expect(executeWithDenials).toHaveBeenLastCalledWith(UNIVERSAL_SEARCH_QUERY, { q: 'coppola' });
  });

  it('trims whitespace before deciding the trigger and the key', async () => {
    renderProbe('  godf  ');
    await settle();
    expect(executeWithDenials).toHaveBeenCalledTimes(1);
    expect(executeWithDenials).toHaveBeenCalledWith(UNIVERSAL_SEARCH_QUERY, { q: 'godf' });
  });
});

describe('governance envelope through the hook (IMDB-14 contract)', () => {
  it('unwraps {data, deniedFields}: data is the operation data, deniedFields always an array', async () => {
    executeWithDenials.mockResolvedValue(
      envelope(
        {
          ...EMPTY,
          hits: [{ __typename: 'Title', tconst: 'tt1', primaryTitle: 'Inception', rating: { averageRating: 8.8 } }],
        },
        ['Rating.numVotes'],
      ),
    );
    renderProbe('inception');
    await settle();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('data'));
    // deniedFields flows out of the envelope; data is unwrapped (the row
    // reads hits[0].primaryTitle, not envelope.data.hits...).
    expect(screen.getByRole('status')).toHaveTextContent('[Rating.numVotes]');
    expect(screen.getByRole('status')).toHaveTextContent('Inception');
  });

  it('a REDACTED result goes stale within 60 s (denial-scoped staleTime): remount refetches', async () => {
    executeWithDenials.mockResolvedValue(envelope(EMPTY, ['Rating.numVotes']));
    const { unmount, client } = renderProbe('godf');
    await settle();
    expect(executeWithDenials).toHaveBeenCalledTimes(1);
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000); // past the 60 s denial cap
    });
    renderProbe('godf', client);
    await settle();
    // refetchOnMount sees a stale entry → the full optimistic document goes
    // out again, which is exactly how a live grant flip becomes visible.
    expect(executeWithDenials).toHaveBeenCalledTimes(2);
  });

  it('a CLEAN result keeps the normal 5 min search staleTime: remount within 61 s does not refetch', async () => {
    executeWithDenials.mockResolvedValue(envelope(EMPTY, []));
    const { unmount, client } = renderProbe('godf');
    await settle();
    expect(executeWithDenials).toHaveBeenCalledTimes(1);
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    renderProbe('godf', client);
    await settle();
    expect(executeWithDenials).toHaveBeenCalledTimes(1); // still fresh
  });
});

describe('placeholder rows are scoped to the query lineage (DES-2 loading states)', () => {
  const named = (title) => ({
    ...EMPTY,
    hits: [{ __typename: 'Title', tconst: 'tt1', primaryTitle: title, rating: { averageRating: 8 } }],
  });

  it('isSameQueryLineage: extensions and backspaces yes, unrelated no', () => {
    expect(isSameQueryLineage('godf', 'godfa')).toBe(true);
    expect(isSameQueryLineage('godfa', 'godf')).toBe(true);
    expect(isSameQueryLineage('godf', 'godf')).toBe(true);
    expect(isSameQueryLineage('godf', 'cop')).toBe(false);
    expect(isSameQueryLineage('', 'godf')).toBe(false);
    expect(isSameQueryLineage(undefined, 'godf')).toBe(false);
  });

  it('typing forward keeps the previous rows as placeholder while the new query fetches', async () => {
    executeWithDenials.mockResolvedValue(envelope(named('The Godfather')));
    const { setQ } = renderProbe('godf');
    await settle();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(screen.getByRole('status')).toHaveTextContent('The Godfather');

    // New query in the same lineage; hold its response open.
    executeWithDenials.mockReturnValue(new Promise(() => {}));
    setQ('godfa');
    await settle();
    // Previous rows ride along (placeholder), not skeletons.
    expect(screen.getByRole('status')).toHaveTextContent('placeholder');
    expect(screen.getByRole('status')).toHaveTextContent('The Godfather');
  });

  it('an unrelated query starts from the first-open skeleton — no resurrected rows', async () => {
    executeWithDenials.mockResolvedValue(envelope(named('The Godfather')));
    const { setQ } = renderProbe('godf');
    await settle();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(screen.getByRole('status')).toHaveTextContent('The Godfather');

    executeWithDenials.mockReturnValue(new Promise(() => {}));
    setQ('cop'); // select-all-retype: different lineage
    await settle();
    // No placeholder: pending with no data (the panel renders skeletons).
    expect(screen.getByRole('status')).toHaveTextContent('pending');
    expect(screen.getByRole('status')).toHaveTextContent('none');
  });
});
