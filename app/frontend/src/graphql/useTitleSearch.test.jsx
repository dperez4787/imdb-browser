/**
 * useTitleSearch (IMDB-6): the faceted view's data hook at the client-layer
 * seam. Proves the cache key embeds the request variables (the URL state),
 * the document is the denial-aware one selecting numVotes optimistically and
 * carrying contextual facets, and the {data, deniedFields} envelope is
 * unwrapped. Transport is faked at executeWithDenials(); no network.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { executeWithDenials } from './client.js';
import { createQueryClient } from './queryClient.js';
import { FACETED_TITLE_SEARCH_QUERY } from './titleSearchQueries.js';
import {
  FACET_DIMENSIONS,
  FACET_PER_DIMENSION,
  titleSearchKey,
  useTitleSearch,
} from './useTitleSearch.js';

vi.mock('./client.js', () => ({ executeWithDenials: vi.fn() }));

const RESULT = {
  searchTitles: {
    total: 10000,
    totalIsCapped: true,
    items: [{ tconst: 'tt1', primaryTitle: 'Alien', startYear: 1979, genres: ['Horror'], rating: { averageRating: 8.5 } }],
    facets: [{ dimension: 'GENRES', values: [{ value: 'Horror', count: 10000 }] }],
  },
};
const envelope = (data = RESULT, deniedFields = []) => ({ data, deniedFields });

function Probe({ variables }) {
  const { data, deniedFields } = useTitleSearch(variables);
  return (
    <output>
      {data?.searchTitles?.items?.[0]?.primaryTitle ?? 'none'}:[{deniedFields.join(',')}]
    </output>
  );
}

const VARIABLES = { filter: { includeAdult: false, peopleMode: 'ALL', genresAny: ['Horror'] }, sort: 'POPULARITY_DESC', limit: 24, offset: 0 };

beforeEach(() => executeWithDenials.mockResolvedValue(envelope()));
afterEach(() => vi.clearAllMocks());

describe('the FacetedTitleSearch document', () => {
  it('carries contextual facets and selects numVotes optimistically beside averageRating', () => {
    expect(FACETED_TITLE_SEARCH_QUERY).toContain('facets(dimensions: $facetDimensions');
    expect(FACETED_TITLE_SEARCH_QUERY).toContain('numVotes');
    expect(FACETED_TITLE_SEARCH_QUERY).toContain('averageRating');
    expect(FACETED_TITLE_SEARCH_QUERY).toContain('totalIsCapped');
    expect(FACET_DIMENSIONS).toEqual(['GENRES', 'TITLE_TYPES']);
    expect(FACET_PER_DIMENSION).toBe(50);
  });
});

describe('useTitleSearch', () => {
  it('keys the cache on the exact request variables (URL state ⇄ cache in lockstep)', () => {
    expect(titleSearchKey(VARIABLES)).toEqual(['facetedTitleSearch', VARIABLES]);
  });

  it('requests the document with the variables plus the constant facet params, and unwraps the envelope', async () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <Probe variables={VARIABLES} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Alien'));
    expect(executeWithDenials).toHaveBeenCalledWith(FACETED_TITLE_SEARCH_QUERY, {
      ...VARIABLES,
      facetDimensions: FACET_DIMENSIONS,
      facetPerDimension: FACET_PER_DIMENSION,
    });
  });

  it('surfaces deniedFields from the envelope (redacted numVotes is invisible in data)', async () => {
    executeWithDenials.mockResolvedValue(envelope(RESULT, ['Rating.numVotes']));
    render(
      <QueryClientProvider client={createQueryClient()}>
        <Probe variables={VARIABLES} />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('[Rating.numVotes]'),
    );
  });
});
