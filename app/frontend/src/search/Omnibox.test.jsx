/**
 * Omnibox (IMDB-5, DES-2): the combobox behavior — open/close, interleaved
 * rows, keyboard model (arrows wrap, Enter opens, Esc closes then blurs,
 * `/` / Cmd+K focus from anywhere), all panel states, and navigation to the
 * detail routes. The GraphQL layer is faked at its seam (useUniversalSearch);
 * row assembly (mergeRows) runs for real.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Omnibox from './Omnibox.jsx';
import SearchPage from './SearchPage.jsx';
import { setSearchText } from './searchTextStore.js';
import { useUniversalSearch } from '../graphql/searchHooks.js';

vi.mock('../graphql/searchHooks.js', () => ({
  AUTOCOMPLETE_DEBOUNCE_MS: 250,
  MIN_QUERY_LENGTH: 2,
  PANEL_ROW_LIMIT: 8,
  useUniversalSearch: vi.fn(),
}));

const REBUILT = new Date(Date.now() - 3 * 60 * 60_000).toISOString();

const DATA = {
  hits: [
    {
      __typename: 'Title',
      tconst: 'tt0068646',
      primaryTitle: 'The Godfather',
      startYear: 1972,
      titleType: 'movie',
      rating: { averageRating: 9.2 },
    },
    {
      __typename: 'Name',
      nconst: 'nm0000338',
      primaryName: 'Francis Ford Coppola',
      primaryProfessions: ['director', 'writer'],
    },
  ],
  titles: {
    items: [
      {
        tconst: 'tt7712598',
        primaryTitle: 'Godfather of Harlem',
        startYear: 2019,
        titleType: 'tvSeries',
        rating: { averageRating: 8.1 },
      },
    ],
  },
  people: {
    items: [
      { nconst: 'nm0000412', primaryName: 'Andy García', primaryProfessions: ['actor'] },
    ],
  },
  searchInfo: { rebuiltAt: REBUILT },
};

const searchState = (overrides = {}) => ({
  data: DATA,
  error: null,
  isPending: false,
  isFetching: false,
  isPlaceholderData: false,
  refetch: vi.fn(),
  debouncedQuery: 'godf',
  enabled: true,
  ...overrides,
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderOmnibox(props = {}) {
  return render(
    <MemoryRouter initialEntries={['/somewhere']}>
      <Omnibox variant="hero" {...props} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

const input = () => screen.getByRole('combobox');
const type = (value) => fireEvent.change(input(), { target: { value } });
const key = (k, opts = {}) => fireEvent.keyDown(input(), { key: k, ...opts });

beforeEach(() => {
  vi.clearAllMocks();
  useUniversalSearch.mockReturnValue(searchState());
  // The query text lives in a module-level store (survives unmounts by
  // design) — reset it so tests stay independent.
  setSearchText('');
});

afterEach(() => {
  // jsdom has no matchMedia; tests that need a viewport stub set it.
  delete window.matchMedia;
});

describe('open/close', () => {
  it('stays closed under 2 characters and opens at the trigger', () => {
    renderOmnibox();
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    type('g');
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();
    type('go');
    expect(input()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('clicking outside closes the panel; the ✕ clears text and closes', () => {
    renderOmnibox();
    type('godf');
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();

    type('godf');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input()).toHaveValue('');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('rows', () => {
  it('interleaves union hits (server order) then prefix fill, one visually uniform list', () => {
    renderOmnibox();
    type('godf');
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.id)).toHaveLength(4);
    expect(options[0]).toHaveTextContent('The Godfather');
    expect(options[1]).toHaveTextContent('Francis Ford Coppola');
    expect(options[2]).toHaveTextContent('Godfather of Harlem');
    expect(options[3]).toHaveTextContent('Andy García');
    // No section headers — one list.
    expect(screen.queryByText(/^titles$/i)).toBeNull();
    expect(screen.queryByText(/^people$/i)).toBeNull();
  });

  it('shows the freshness footer with results (folded IMDB-13)', () => {
    renderOmnibox();
    type('godf');
    expect(screen.getByText('Index rebuilt 3 h ago')).toBeInTheDocument();
  });
});

describe('keyboard model (ARIA combobox)', () => {
  it('preselects row 1, arrows move and wrap, focus never leaves the input', () => {
    renderOmnibox();
    type('godf');
    input().focus();
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(input()).toHaveAttribute('aria-activedescendant', options[0].id);

    key('ArrowDown');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    expect(input()).toHaveAttribute('aria-activedescendant', options[1].id);

    key('ArrowUp');
    key('ArrowUp'); // wraps from row 1 to the last row
    expect(screen.getAllByRole('option')[3]).toHaveAttribute('aria-selected', 'true');

    key('ArrowDown'); // wraps back to row 1
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(input());
  });

  it('Enter opens the selected row: title → /title/:tconst', () => {
    renderOmnibox();
    type('godf');
    key('Enter');
    expect(screen.getByTestId('location')).toHaveTextContent('/title/tt0068646');
    // Selecting clears nothing — the query text stays.
    expect(input()).toHaveValue('godf');
  });

  it('Enter on a person row → /person/:nconst', () => {
    renderOmnibox();
    type('godf');
    key('ArrowDown');
    key('Enter');
    expect(screen.getByTestId('location')).toHaveTextContent('/person/nm0000338');
  });

  it('Esc closes the panel, a second Esc blurs the input', () => {
    renderOmnibox();
    type('godf');
    input().focus();
    key('Escape');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(input());
    key('Escape');
    expect(document.activeElement).not.toBe(input());
  });

  it('Tab closes the panel and moves on', () => {
    renderOmnibox();
    type('godf');
    key('Tab');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('`/` and Cmd/Ctrl+K focus the omnibox from anywhere', () => {
    renderOmnibox();
    expect(document.activeElement).not.toBe(input());
    fireEvent.keyDown(document.body, { key: '/' });
    expect(document.activeElement).toBe(input());

    input().blur();
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true });
    expect(document.activeElement).toBe(input());

    input().blur();
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(input());
  });

  it('Enter with no rows to open goes to the reserved /search?q= route', () => {
    useUniversalSearch.mockReturnValue(
      searchState({
        data: { hits: [], titles: { items: [] }, people: { items: [] }, searchInfo: { rebuiltAt: REBUILT } },
        debouncedQuery: 'zzyzx',
      }),
    );
    renderOmnibox();
    type('zzyzx');
    key('Enter');
    expect(screen.getByTestId('location')).toHaveTextContent('/search?q=zzyzx');
  });
});

describe('mouse', () => {
  it('hover moves the selection; click opens the row', () => {
    renderOmnibox();
    type('godf');
    const options = screen.getAllByRole('option');
    fireEvent.mouseEnter(options[2]);
    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(options[2]);
    expect(screen.getByTestId('location')).toHaveTextContent('/title/tt7712598');
  });
});

describe('panel states (DES-2)', () => {
  it('first load: skeleton rows, no footer yet', () => {
    useUniversalSearch.mockReturnValue(
      searchState({ data: undefined, isPending: true, isFetching: true }),
    );
    renderOmnibox();
    type('godf');
    expect(screen.getByRole('status', { name: 'Searching' })).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByText(/Index rebuilt/)).toBeNull();
  });

  it('query changed while results shown: previous rows stay + amber progress bar', () => {
    useUniversalSearch.mockReturnValue(
      searchState({ isFetching: true, isPlaceholderData: true }),
    );
    const { container } = renderOmnibox();
    type('godfa');
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(container.querySelector('.autocomplete-panel__progress')).not.toBeNull();
  });

  it('no results: query-blaming copy + footer', () => {
    useUniversalSearch.mockReturnValue(
      searchState({
        data: { hits: [], titles: { items: [] }, people: { items: [] }, searchInfo: { rebuiltAt: REBUILT } },
        debouncedQuery: 'zzyzx',
      }),
    );
    renderOmnibox();
    type('zzyzx');
    expect(screen.getByText('Nothing matches “zzyzx”.')).toBeInTheDocument();
    expect(screen.getByText(/try a shorter prefix/)).toBeInTheDocument();
    expect(screen.getByText('Index rebuilt 3 h ago')).toBeInTheDocument();
  });

  it('no results with a never-built index (rebuiltAt null): honest copy, never blames the query', () => {
    useUniversalSearch.mockReturnValue(
      searchState({
        data: { hits: [], titles: { items: [] }, people: { items: [] }, searchInfo: { rebuiltAt: null } },
        debouncedQuery: 'godf',
      }),
    );
    renderOmnibox();
    type('godf');
    expect(screen.getByText(/hasn’t been built yet/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing matches/)).toBeNull();
    expect(screen.getByText('Index not yet built')).toBeInTheDocument();
  });

  it('error: warning + Retry (wired to refetch), and NO freshness footer', () => {
    const refetch = vi.fn();
    useUniversalSearch.mockReturnValue(
      searchState({ data: undefined, error: { kind: 'network', message: 'boom' }, refetch }),
    );
    renderOmnibox();
    type('godf');
    expect(screen.getByRole('alert')).toHaveTextContent('Search isn’t responding.');
    expect(screen.queryByText(/Index rebuilt/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('a new query fetching after a previous EMPTY result shows loading, never "Nothing matches"', () => {
    // rows empty + a fetch in flight: the empty data belongs to the previous
    // query; blaming the new one would be a false no-results.
    useUniversalSearch.mockReturnValue(
      searchState({
        data: { hits: [], titles: { items: [] }, people: { items: [] }, searchInfo: { rebuiltAt: REBUILT } },
        isFetching: true,
        debouncedQuery: 'zzyzxy',
      }),
    );
    renderOmnibox();
    type('zzyzxy');
    expect(screen.queryByText(/Nothing matches/)).toBeNull();
    expect(screen.getByRole('status', { name: 'Searching' })).toBeInTheDocument();
  });

  it('the settled no-results body is a polite live region (role=status)', () => {
    useUniversalSearch.mockReturnValue(
      searchState({
        data: { hits: [], titles: { items: [] }, people: { items: [] }, searchInfo: { rebuiltAt: REBUILT } },
        debouncedQuery: 'zzyzx',
      }),
    );
    const { container } = renderOmnibox();
    type('zzyzx');
    const panel = container.querySelector('.autocomplete-panel');
    expect(within(panel).getByRole('status')).toHaveTextContent('Nothing matches “zzyzx”.');
  });
});

describe('ARIA wiring (no dangling references, entity-scoped option ids)', () => {
  it('skeleton state: collapsed combobox, no aria-controls/activedescendant pointing at nothing', () => {
    useUniversalSearch.mockReturnValue(
      searchState({ data: undefined, isPending: true, isFetching: true }),
    );
    renderOmnibox();
    type('godf');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(input()).not.toHaveAttribute('aria-controls');
    expect(input()).not.toHaveAttribute('aria-activedescendant');
  });

  it('error state: same — the alert body is not a listbox', () => {
    useUniversalSearch.mockReturnValue(
      searchState({ data: undefined, error: { kind: 'network', message: 'boom' } }),
    );
    renderOmnibox();
    type('godf');
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(input()).not.toHaveAttribute('aria-controls');
  });

  it('with rows: aria-controls references the rendered listbox element', () => {
    renderOmnibox();
    type('godf');
    expect(input()).toHaveAttribute('aria-expanded', 'true');
    expect(input()).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
  });

  it('option ids embed the entity id, so the active descendant differs across result sets', () => {
    renderOmnibox();
    type('godf');
    expect(input().getAttribute('aria-activedescendant')).toContain('tt0068646');

    // Same index, different entity → textually different id (screen readers
    // re-announce; index-based ids would be identical and stay silent).
    useUniversalSearch.mockReturnValue(
      searchState({
        data: {
          ...DATA,
          hits: [{ ...DATA.hits[0], tconst: 'tt9999999', primaryTitle: 'Other' }, DATA.hits[1]],
        },
        debouncedQuery: 'other',
      }),
    );
    type('other');
    expect(input().getAttribute('aria-activedescendant')).toContain('tt9999999');
  });
});

describe('query text lifted above the route (DES-2 Back-then-refocus)', () => {
  it('survives unmount/remount, and refocus with text resumes the panel', () => {
    const view = renderOmnibox();
    type('godf');
    view.unmount();

    renderOmnibox();
    expect(input()).toHaveValue('godf');
    expect(screen.queryByRole('listbox')).toBeNull(); // closed until refocus
    input().focus();
    fireEvent.focus(input());
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('deep link to /search?q= hydrates the omnibox text from the URL', () => {
    render(
      <MemoryRouter initialEntries={['/search?q=the%20godfather']}>
        <Omnibox variant="compact" />
        <Routes>
          <Route path="/search" element={<SearchPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('combobox')).toHaveValue('the godfather');
  });
});

describe('mobile overlay (compact, DES-2 "✕/Esc closes it")', () => {
  const toggle = () => screen.getByRole('button', { name: 'Search' });
  const overlayClass = (container) => container.querySelector('.omnibox').className;

  it('the close control exists even with an EMPTY input, closes the overlay, and returns focus to the toggle', () => {
    const { container } = renderOmnibox({ variant: 'compact' });
    fireEvent.click(toggle());
    expect(overlayClass(container)).toContain('omnibox--mobile-open');

    const close = screen.getByRole('button', { name: 'Close search' });
    fireEvent.click(close);
    expect(overlayClass(container)).not.toContain('omnibox--mobile-open');
    expect(document.activeElement).toBe(toggle()); // not <body>
  });

  it('✕ with text typed closes the overlay WITHOUT clearing the query (Esc parity)', () => {
    const { container } = renderOmnibox({ variant: 'compact' });
    fireEvent.click(toggle());
    type('godf');
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }));
    expect(overlayClass(container)).not.toContain('omnibox--mobile-open');
    expect(input()).toHaveValue('godf');
  });

  it('Esc closes the overlay and returns focus to the toggle, not <body>', () => {
    const { container } = renderOmnibox({ variant: 'compact' });
    fireEvent.click(toggle());
    key('Escape');
    expect(overlayClass(container)).not.toContain('omnibox--mobile-open');
    expect(document.activeElement).toBe(toggle());
  });

  it('`/` at mobile width opens the overlay first, then focuses after the paint (rAF)', async () => {
    window.matchMedia = vi.fn(() => ({ matches: true }));
    const { container } = renderOmnibox({ variant: 'compact' });
    fireEvent.keyDown(document.body, { key: '/' });
    // Overlay opens synchronously; focus lands on the next frame, once the
    // field is no longer display:none.
    expect(overlayClass(container)).toContain('omnibox--mobile-open');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(document.activeElement).toBe(input());
  });

  it('`/` at desktop width never touches the overlay state — the two-Esc model stays intact', () => {
    window.matchMedia = vi.fn(() => ({ matches: false }));
    const { container } = renderOmnibox({ variant: 'compact' });
    fireEvent.keyDown(document.body, { key: '/' });
    expect(document.activeElement).toBe(input());
    expect(overlayClass(container)).not.toContain('omnibox--mobile-open');

    type('godf');
    key('Escape'); // 1: closes the panel
    expect(screen.queryByRole('listbox')).toBeNull();
    key('Escape'); // 2: blurs — no phantom overlay state eating an Esc
    expect(document.activeElement).not.toBe(input());
  });
});
