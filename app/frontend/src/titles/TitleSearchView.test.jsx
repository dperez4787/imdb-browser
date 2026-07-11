/**
 * TitleSearchView (IMDB-6, DES-3): the view against a faked transport —
 * executeWithDenials dispatches per operation document (facets vocabulary /
 * searchInfo freshness / faceted search), so useFacets, useSearchInfo, and
 * useTitleSearch all run for real over a real QueryClient and MemoryRouter.
 * Proves:
 *   - vocabularies render from API data (a novel value appears, nothing
 *     hard-coded) with LIVE contextual counts from the search response;
 *   - facet click → URL param → next request's variables (the full chain);
 *   - deep links reproduce rail + chips (incl. uncontrolled params) and
 *     removing a chip rewrites the URL with page reset;
 *   - capped totals ("10,000+ titles" / "Page N of 417+") and pager bounds;
 *   - POPULARITY default sort, Rating sort's votesFrom floor;
 *   - skeleton / no-results / error / index-never-built states.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { executeWithDenials } from '../graphql/client.js';
import { FACETS_QUERY, SEARCH_INFO_QUERY } from '../graphql/queries.js';
import { createQueryClient } from '../graphql/queryClient.js';
import { FACETED_TITLE_SEARCH_QUERY } from '../graphql/titleSearchQueries.js';
import TitleSearchView from './TitleSearchView.jsx';

vi.mock('../graphql/client.js', () => ({ executeWithDenials: vi.fn() }));

// ---- fixtures ------------------------------------------------------------

const VOCAB = {
  facets: {
    // "Zorkumentary" is deliberately not a real genre: it proves the rail
    // renders whatever the API says exists — no list in source code.
    genres: [
      { value: 'Drama', count: 89200 },
      { value: 'Comedy', count: 61000 },
      { value: 'Horror', count: 12000 },
      { value: 'Zorkumentary', count: 7 },
    ],
    titleTypes: [
      { value: 'movie', count: 645000 },
      { value: 'tvSeries', count: 233000 },
    ],
  },
};

const SEARCH_INFO = { searchInfo: { rebuiltAt: '2026-07-11T03:12:24.167Z', titleCount: 1, nameCount: 1 } };

const items = (n, prefix = 'Title') =>
  Array.from({ length: n }, (_, i) => ({
    tconst: `tt${prefix}${i}`,
    primaryTitle: `${prefix} ${i}`,
    titleType: 'movie',
    startYear: 2000 + i,
    genres: ['Drama'],
    rating: { averageRating: 7.5 },
  }));

const searchResult = ({
  total = 240,
  totalIsCapped = false,
  count = 24,
  genreCounts = [
    ['Drama', 120],
    ['Horror', 34],
    ['Zorkumentary', 0],
  ],
} = {}) => ({
  searchTitles: {
    total,
    totalIsCapped,
    items: items(count),
    facets: [
      { dimension: 'GENRES', values: genreCounts.map(([value, c]) => ({ value, count: c })) },
      { dimension: 'TITLE_TYPES', values: [{ value: 'movie', count: total }] },
    ],
  },
});

/** Dispatch the fake transport per operation document. */
function stubTransport({ facets = VOCAB, info = SEARCH_INFO, search = searchResult() } = {}) {
  executeWithDenials.mockImplementation(async (document) => {
    if (document === FACETS_QUERY) return { data: facets, deniedFields: [] };
    if (document === SEARCH_INFO_QUERY) return { data: info, deniedFields: [] };
    if (document === FACETED_TITLE_SEARCH_QUERY) {
      if (search instanceof Error) throw search;
      return { data: search, deniedFields: ['Rating.numVotes'] };
    }
    throw new Error('unexpected document');
  });
}

/** The faceted-search calls only (ignores facets/searchInfo traffic). */
const searchCalls = () =>
  executeWithDenials.mock.calls.filter(([doc]) => doc === FACETED_TITLE_SEARCH_QUERY);

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="url">{`${location.pathname}${location.search}`}</output>;
}

function renderView(initialEntry = '/titles') {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <TitleSearchView />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const url = () => screen.getByTestId('url').textContent;

beforeEach(() => stubTransport());
afterEach(() => vi.clearAllMocks());

// ---- vocabularies + contextual counts -------------------------------------

describe('facet vocabularies (never hard-coded) + live contextual counts', () => {
  it('renders whatever genre values the API returns, counts from the search response', async () => {
    renderView();
    // The invented vocabulary value appears — proof there is no source list.
    const zork = await screen.findByLabelText(/Zorkumentary/);
    expect(zork).toBeInTheDocument();
    // Counts are the CONTEXTUAL ones (Drama 120 from the search response, not
    // the global 89,200 from the vocabulary query).
    const drama = screen.getByLabelText(/Drama/).closest('.facet-option');
    expect(within(drama).getByText('120')).toBeInTheDocument();
    // A zero-count value stays in place, muted but operable.
    expect(zork.closest('.facet-option')).toHaveClass('facet-option--empty');
    expect(within(zork.closest('.facet-option')).getByText('0')).toBeInTheDocument();
  });
});

// ---- the facet → URL → request chain ---------------------------------------

describe('filters write the URL; the URL drives the request', () => {
  it('checking a genre puts genres= in the URL and genresAny in the next request', async () => {
    renderView();
    fireEvent.click(await screen.findByLabelText(/Horror/));

    expect(url()).toBe('/titles?genres=Horror');
    await waitFor(() => {
      const [, variables] = searchCalls().at(-1);
      expect(variables.filter.genresAny).toEqual(['Horror']);
      expect(variables.offset).toBe(0);
    });
  });

  it('defaults: first request is POPULARITY_DESC, limit 24, offset 0, includeAdult false', async () => {
    renderView();
    await screen.findByText('Title 0');
    const [, variables] = searchCalls()[0];
    expect(variables).toMatchObject({
      sort: 'POPULARITY_DESC',
      limit: 24,
      offset: 0,
      filter: { includeAdult: false, peopleMode: 'ALL' },
    });
  });

  it('Rating sort writes sort=RATING_DESC and sends the votesFrom: 1000 floor', async () => {
    renderView();
    fireEvent.change(await screen.findByRole('combobox', { name: 'Sort' }), {
      target: { value: 'RATING_DESC' },
    });
    expect(url()).toBe('/titles?sort=RATING_DESC');
    await waitFor(() => {
      const [, variables] = searchCalls().at(-1);
      expect(variables.sort).toBe('RATING_DESC');
      expect(variables.filter.votesFrom).toBe(1000);
    });
  });

  it('a filter change resets page to 1', async () => {
    renderView('/titles?page=3');
    fireEvent.click(await screen.findByLabelText(/Horror/));
    expect(url()).toBe('/titles?genres=Horror'); // no page param = page 1
  });
});

// ---- deep links + chips ----------------------------------------------------

describe('deep links round-trip; uncontrolled params surface as chips', () => {
  const DEEP = '/titles?genres=Horror&types=movie&yearFrom=1990&ratingFrom=7&votesFrom=1000&sort=RATING_DESC&page=2';

  it('loading a rich URL reproduces rail state, chips, and the request', async () => {
    renderView(DEEP);
    // Scoped to the rail: the chips row also carries "Horror" in a label.
    const rail = await screen.findByRole('complementary', { name: 'Filters' });
    expect(await within(rail).findByLabelText(/Horror/)).toBeChecked();
    expect(within(rail).getByLabelText(/Movie/)).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue('RATING_DESC');

    // Chips: rail-backed AND the uncontrolled votesFrom.
    const chipRow = screen.getByLabelText('Active filters');
    expect(within(chipRow).getByText('Horror')).toBeInTheDocument();
    expect(within(chipRow).getByText('from 1990')).toBeInTheDocument();
    expect(within(chipRow).getByText('≥ 7.0')).toBeInTheDocument();
    expect(within(chipRow).getByText('≥ 1,000 votes')).toBeInTheDocument();

    await waitFor(() => {
      const [, variables] = searchCalls().at(-1);
      expect(variables).toMatchObject({
        sort: 'RATING_DESC',
        offset: 24, // page 2
        filter: {
          genresAny: ['Horror'],
          titleTypes: ['movie'],
          startYearFrom: 1990,
          ratingFrom: 7,
          votesFrom: 1000,
        },
      });
    });
  });

  it('removing a chip rewrites the URL without that filter and resets the page', async () => {
    renderView(DEEP);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove filter ≥ 1,000 votes' }));
    expect(url()).not.toContain('votesFrom');
    expect(url()).not.toContain('page='); // reset to 1 → omitted
    expect(url()).toContain('genres=Horror'); // everything else intact
  });

  it('Clear all returns to the canonical bare /titles', async () => {
    renderView(DEEP);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Clear all' }))[0]);
    expect(url()).toBe('/titles');
  });
});

// ---- capped totals + pager ---------------------------------------------------

describe('capped totals and pager bounds', () => {
  it('uncapped: real count, Page N of M, Next enabled mid-range', async () => {
    stubTransport({ search: searchResult({ total: 240, totalIsCapped: false }) });
    renderView('/titles?page=2');
    expect(await screen.findByText('240 titles')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '◀ Prev' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next ▶' })).toBeEnabled();
  });

  it('capped: "10,000+ titles", "Page N of 417+", Next disabled at page 417 (offset cap)', async () => {
    stubTransport({ search: searchResult({ total: 10000, totalIsCapped: true }) });
    renderView('/titles?page=417');
    expect(await screen.findByText('10,000+ titles')).toBeInTheDocument();
    expect(screen.getByText('Page 417 of 417+')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next ▶' })).toBeDisabled();
    // The request under the deepest page stays within the API's offset cap.
    const [, variables] = searchCalls().at(-1);
    expect(variables.offset).toBe(9984);
  });

  it('Prev disabled on page 1; clicking Next writes page=2', async () => {
    renderView();
    await screen.findByText('Title 0');
    expect(screen.getByRole('button', { name: '◀ Prev' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next ▶' }));
    expect(url()).toBe('/titles?page=2');
  });
});

// ---- states -------------------------------------------------------------------

describe('states (DES-3)', () => {
  it('first load shows skeleton cards, then the grid of title-card links', async () => {
    let resolveSearch;
    executeWithDenials.mockImplementation(async (document) => {
      if (document === FACETS_QUERY) return { data: VOCAB, deniedFields: [] };
      if (document === SEARCH_INFO_QUERY) return { data: SEARCH_INFO, deniedFields: [] };
      return new Promise((resolve) => {
        resolveSearch = () => resolve({ data: searchResult(), deniedFields: [] });
      });
    });
    const { container } = renderView();
    expect(container.querySelector('.results-grid--skeleton')).toBeInTheDocument();

    await waitFor(() => expect(resolveSearch).toBeDefined());
    resolveSearch();
    const card = await screen.findByRole('link', { name: /Title 0/ });
    // Cards navigate to the title detail route.
    expect(card).toHaveAttribute('href', '/title/ttTitle0');
    expect(container.querySelector('.results-grid--skeleton')).not.toBeInTheDocument();
  });

  it('zero results with filters set: no-results copy + Clear all filters', async () => {
    stubTransport({ search: searchResult({ total: 0, count: 0, genreCounts: [['Drama', 0]] }) });
    renderView('/titles?genres=Horror');
    expect(await screen.findByText('Nothing matches these filters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(url()).toBe('/titles');
  });

  it('search failure renders the error state; Retry refetches', async () => {
    // kind 'bad-request' is non-retryable at the QueryClient layer, so the
    // error surfaces immediately (a 'network' failure retries with backoff —
    // same rendered state, slower test).
    const failure = Object.assign(new Error('boom'), { kind: 'bad-request' });
    stubTransport({ search: failure });
    renderView();
    expect(await screen.findByRole('alert')).toHaveTextContent('Search isn’t responding.');

    stubTransport(); // next attempt succeeds
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Title 0')).toBeInTheDocument();
  });

  it('index never built (rebuiltAt null): the explainer — never "Nothing matches", no rail', async () => {
    stubTransport({
      info: { searchInfo: { rebuiltAt: null, titleCount: 0, nameCount: 0 } },
      search: searchResult({ total: 0, count: 0, genreCounts: [] }),
    });
    renderView();
    expect(
      await screen.findByText(/The search index hasn’t been built yet/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Nothing matches these filters.')).toBeNull();
    expect(screen.queryByLabelText('Filters')).toBeNull();
  });

  it('while searchInfo is still resolving, an empty result shows skeletons, not "Nothing matches"', async () => {
    executeWithDenials.mockImplementation(async (document) => {
      if (document === FACETS_QUERY) return { data: VOCAB, deniedFields: [] };
      if (document === SEARCH_INFO_QUERY) return new Promise(() => {}); // never resolves
      return { data: searchResult({ total: 0, count: 0, genreCounts: [] }), deniedFields: [] };
    });
    const { container } = renderView();
    await waitFor(() => expect(searchCalls().length).toBeGreaterThan(0));
    expect(container.querySelector('.results-grid--skeleton')).toBeInTheDocument();
    expect(screen.queryByText('Nothing matches these filters.')).toBeNull();
  });
});
