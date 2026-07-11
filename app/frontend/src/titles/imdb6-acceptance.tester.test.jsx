/**
 * IMDB-6 tester acceptance suite — the gaps the developer's own suites left.
 *
 * The shareable-URL criterion ("loading that URL fresh reproduces the same
 * view") is only true if HOSTILE URLs are deterministic too: junk params,
 * out-of-range/garbage page values, duplicate params, duplicate values,
 * percent-encoded commas. Part 1 pins parse→serialize→parse as a fixed point
 * for all of those and proves no hand-typed URL can push offset past the
 * API's 10,000 cap.
 *
 * Part 2 drives the rendered view (faked transport, real hooks/router) over
 * the cases the developer's view suite skipped: a page=9999 deep link, a URL
 * that carries its OWN votesFrom under the Rating sort (the floor must NOT
 * stomp it), and the full set of uncontrolled-param chips (q, genresAll,
 * runtime, ratingTo, cats) rendered and individually removable.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { executeWithDenials } from '../graphql/client.js';
import { FACETS_QUERY, SEARCH_INFO_QUERY } from '../graphql/queries.js';
import { createQueryClient } from '../graphql/queryClient.js';
import { FACETED_TITLE_SEARCH_QUERY } from '../graphql/titleSearchQueries.js';
import TitleSearchView from './TitleSearchView.jsx';
import {
  buildVariables,
  deriveChips,
  MAX_OFFSET,
  MAX_PAGE,
  parseState,
  stateToSearchParams,
} from './urlState.js';

vi.mock('../graphql/client.js', () => ({ executeWithDenials: vi.fn() }));

const sp = (q) => new URLSearchParams(q);

// ---- Part 1: hostile URL inputs stay deterministic -------------------------

describe('hostile URLs: parse → serialize → parse is a fixed point', () => {
  const HOSTILE = [
    'foo=bar&utm_source=spam&genres=Horror', // junk params
    'page=abc&genres=Horror', // garbage page
    'page=-3', // negative page
    'page=0', // below 1-based floor
    'page=2.9', // fractional page
    'page=9999', // beyond the offset cap
    'genres=Horror,,Drama,&types=,movie', // empty comma segments
    'genres=Horror%2CSci-Fi', // percent-encoded comma
    'genres=Horror&genres=Drama', // duplicate param
    'genres=Horror,Horror', // duplicate value
    'sort=DROP%20TABLE', // garbage sort
    'sort=RELEVANCE', // RELEVANCE without q
    'adult=true&peopleMode=any', // wrong-cased/typed flags
    'yearFrom=abc&ratingFrom=NaN&votesFrom=junk', // garbage numerics
  ];

  it.each(HOSTILE)('"%s" reaches a stable canonical state', (query) => {
    const first = parseState(sp(query));
    const canonical = stateToSearchParams(first);
    const second = parseState(canonical);
    expect(second).toEqual(first);
    expect(stateToSearchParams(second).toString()).toBe(canonical.toString());
  });

  it('junk params are dropped from the canonical form, real filters kept', () => {
    const state = parseState(sp('foo=bar&utm_source=spam&genres=Horror'));
    expect(stateToSearchParams(state).toString()).toBe('genres=Horror');
  });

  it('garbage/out-of-range pages clamp into [1, MAX_PAGE]; offset never exceeds the cap', () => {
    expect(parseState(sp('page=abc')).page).toBe(1);
    expect(parseState(sp('page=-3')).page).toBe(1);
    expect(parseState(sp('page=0')).page).toBe(1);
    expect(parseState(sp('page=2.9')).page).toBe(2); // truncated, not rejected
    expect(parseState(sp('page=9999')).page).toBe(MAX_PAGE);
    const vars = buildVariables(parseState(sp('page=9999')));
    expect(vars.offset).toBe((MAX_PAGE - 1) * 24);
    expect(vars.offset).toBeLessThanOrEqual(MAX_OFFSET);
  });

  it('garbage numerics fall back to unset (no NaN ever reaches the filter)', () => {
    const state = parseState(sp('yearFrom=abc&ratingFrom=NaN&votesFrom=junk'));
    expect(state.yearFrom).toBeUndefined();
    expect(state.ratingFrom).toBeUndefined();
    expect(state.votesFrom).toBeUndefined();
    const { filter } = buildVariables(state);
    expect('startYearFrom' in filter).toBe(false);
    expect('ratingFrom' in filter).toBe(false);
    expect('votesFrom' in filter).toBe(false);
  });

  it('percent-encoded commas split; duplicate params take the first; blanks drop', () => {
    expect(parseState(sp('genres=Horror%2CSci-Fi')).genres).toEqual(['Horror', 'Sci-Fi']);
    expect(parseState(sp('genres=Horror&genres=Drama')).genres).toEqual(['Horror']);
    expect(parseState(sp('genres=Horror,,Drama,')).genres).toEqual(['Horror', 'Drama']);
  });

  it('duplicated values round-trip stably and one chip removal clears them all', () => {
    const state = parseState(sp('genres=Horror,Horror'));
    expect(stateToSearchParams(state).toString()).toBe('genres=Horror%2CHorror');
    const chip = deriveChips(state).find((c) => c.key === 'genre:Horror');
    expect(chip.remove(state).genres).toEqual([]);
  });

  it('flags are strict: adult only via adult=1, peopleMode only via exact ANY', () => {
    expect(parseState(sp('adult=true')).adult).toBe(false);
    expect(parseState(sp('adult=0')).adult).toBe(false);
    expect(parseState(sp('adult=1')).adult).toBe(true);
    expect(parseState(sp('peopleMode=any')).peopleMode).toBe('ALL');
    expect(parseState(sp('peopleMode=ANY')).peopleMode).toBe('ANY');
  });
});

// ---- Part 2: view-level gaps ------------------------------------------------

const VOCAB = {
  facets: {
    genres: [
      { value: 'Drama', count: 89200 },
      { value: 'Horror', count: 12000 },
    ],
    titleTypes: [{ value: 'movie', count: 645000 }],
  },
};
const SEARCH_INFO = {
  searchInfo: { rebuiltAt: '2026-07-11T03:12:24.167Z', titleCount: 1, nameCount: 1 },
};
const RESULT = (total, totalIsCapped) => ({
  searchTitles: {
    total,
    totalIsCapped,
    items: Array.from({ length: 24 }, (_, i) => ({
      tconst: `tt${i}`,
      primaryTitle: `Title ${i}`,
      titleType: 'movie',
      startYear: 2000 + i,
      genres: ['Drama'],
      rating: { averageRating: 7.5 },
    })),
    facets: [
      { dimension: 'GENRES', values: [{ value: 'Drama', count: total }] },
      { dimension: 'TITLE_TYPES', values: [{ value: 'movie', count: total }] },
    ],
  },
});

function stubTransport(search = RESULT(240, false)) {
  executeWithDenials.mockImplementation(async (document) => {
    if (document === FACETS_QUERY) return { data: VOCAB, deniedFields: [] };
    if (document === SEARCH_INFO_QUERY) return { data: SEARCH_INFO, deniedFields: [] };
    if (document === FACETED_TITLE_SEARCH_QUERY) return { data: search, deniedFields: [] };
    throw new Error('unexpected document');
  });
}

const searchCalls = () =>
  executeWithDenials.mock.calls.filter(([doc]) => doc === FACETED_TITLE_SEARCH_QUERY);

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="url">{`${location.pathname}${location.search}`}</output>;
}

function renderView(initialEntry) {
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

describe('view: hostile deep links and uncontrolled chips', () => {
  it('page=9999 deep link clamps to page 417: capped offset, capped label, Next disabled', async () => {
    stubTransport(RESULT(10000, true));
    renderView('/titles?page=9999');
    expect(await screen.findByText('10,000+ titles')).toBeInTheDocument();
    expect(screen.getByText(`Page ${MAX_PAGE} of ${MAX_PAGE}+`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next ▶' })).toBeDisabled();
    const [, variables] = searchCalls().at(-1);
    expect(variables.offset).toBe((MAX_PAGE - 1) * 24);
    expect(variables.offset).toBeLessThanOrEqual(MAX_OFFSET);
  });

  it("a URL carrying its OWN votesFrom under the Rating sort wins over the floor", async () => {
    renderView('/titles?sort=RATING_DESC&votesFrom=50');
    await screen.findByText('Title 0');
    const [, variables] = searchCalls().at(-1);
    expect(variables.sort).toBe('RATING_DESC');
    expect(variables.filter.votesFrom).toBe(50); // not stomped to 1000
  });

  it('every uncontrolled param renders as a chip; each is individually removable', async () => {
    renderView('/titles?q=alien&genresAll=Drama&runtimeFrom=90&ratingTo=9&cats=director&page=3');
    await screen.findByText('Title 0');
    const chipRow = screen.getByLabelText('Active filters');
    expect(within(chipRow).getByText('“alien”')).toBeInTheDocument();
    expect(within(chipRow).getByText('all: Drama')).toBeInTheDocument();
    expect(within(chipRow).getByText('from 90 min')).toBeInTheDocument();
    expect(within(chipRow).getByText('≤ 9.0')).toBeInTheDocument();
    expect(within(chipRow).getByText('role: director')).toBeInTheDocument();

    // The request carried all of them (a shared URL is never silently wider
    // than the rail shows — it filters too, not just displays).
    const [, variables] = searchCalls().at(-1);
    expect(variables.filter).toMatchObject({
      query: 'alien',
      genresAll: ['Drama'],
      runtimeFrom: 90,
      ratingTo: 9,
      peopleCategories: ['director'],
    });

    // Removing ONE chip drops exactly that param and resets the page.
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter from 90 min' }));
    expect(url()).not.toContain('runtimeFrom');
    expect(url()).not.toContain('page=');
    expect(url()).toContain('q=alien');
    expect(url()).toContain('genresAll=Drama');
    expect(url()).toContain('cats=director');
  });
});
