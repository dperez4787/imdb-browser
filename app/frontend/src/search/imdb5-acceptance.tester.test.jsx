/**
 * IMDB-5 tester acceptance suite (DES-2, incl. Appendix A + folded IMDB-13).
 *
 * Deliberately different seam from the developer's Omnibox.test.jsx (which
 * fakes useUniversalSearch): here the REAL hook, REAL debounce, REAL
 * QueryClient, and REAL mergeRows run end-to-end with only the transport
 * (client.js#execute) faked — so a wiring break between Omnibox and the
 * data layer cannot hide behind a mocked hook. Real timers throughout.
 *
 * Also: hostile-input cases for Appendix A's fill rule that the developer's
 * mergeRows.test.js does not cover (union-only overflow, duplicates inside
 * the union and inside a fill list, all-duplicate fill, unknown __typename,
 * sub-union limits), and deep-link /search?q= hydration with encoded text.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { execute } from '../graphql/client.js';
import { createQueryClient } from '../graphql/queryClient.js';
import { AUTOCOMPLETE_DEBOUNCE_MS } from '../graphql/searchHooks.js';
import { UNIVERSAL_SEARCH_QUERY } from '../graphql/searchQueries.js';
import { assembleRows } from './mergeRows.js';
import Omnibox from './Omnibox.jsx';
import SearchPage from './SearchPage.jsx';

vi.mock('../graphql/client.js', () => ({ execute: vi.fn() }));

const REBUILT = new Date(Date.now() - 3 * 60 * 60_000).toISOString();

const title = (n, over = {}) => ({
  tconst: `tt${n}`,
  primaryTitle: `Title ${n}`,
  startYear: 1970 + (n % 50),
  titleType: 'movie',
  rating: { averageRating: 8.0 },
  ...over,
});
const person = (n, over = {}) => ({
  nconst: `nm${n}`,
  primaryName: `Person ${n}`,
  primaryProfessions: ['actor'],
  ...over,
});
const uT = (n, over) => ({ __typename: 'Title', ...title(n, over) });
const uN = (n, over) => ({ __typename: 'Name', ...person(n, over) });
const payload = ({ hits = [], titles = [], people = [], rebuiltAt = REBUILT } = {}) => ({
  hits,
  titles: { items: titles },
  people: { items: people },
  searchInfo: { rebuiltAt },
});

/** The "coppola"-shaped response: union interleaves titles and people. */
const UNION_DATA = payload({
  hits: [
    uT(1, { primaryTitle: 'The Godfather', startYear: 1972, rating: { averageRating: 9.2 } }),
    uN(1, { primaryName: 'Francis Ford Coppola', primaryProfessions: ['director', 'writer'] }),
    uT(2, { primaryTitle: 'The Godfather Part II', startYear: 1974 }),
    uN(2, { primaryName: 'Sofia Coppola' }),
  ],
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderBox(props = {}) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/elsewhere']}>
        <Omnibox variant="hero" {...props} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const input = () => screen.getByRole('combobox');
const typeText = (value) => fireEvent.change(input(), { target: { value } });
const key = (k) => fireEvent.keyDown(input(), { key: k });
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const options = () => screen.getAllByRole('option');

beforeEach(() => {
  vi.clearAllMocks();
  execute.mockResolvedValue(payload());
});

describe('debounce through the real hook (AC: one request per settled burst)', () => {
  it('a rapid keystroke burst settles into exactly ONE aliased request', async () => {
    renderBox();
    for (const q of ['c', 'co', 'cop', 'copp', 'coppola']) typeText(q);
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1), {
      timeout: AUTOCOMPLETE_DEBOUNCE_MS * 8,
    });
    expect(execute).toHaveBeenCalledWith(UNIVERSAL_SEARCH_QUERY, { q: 'coppola' });
    // No request ever went out for the intermediate prefixes.
    const queries = execute.mock.calls.map(([, vars]) => vars.q);
    expect(queries).toEqual(['coppola']);
  });

  it('a second settled burst issues a second (and only a second) request', async () => {
    renderBox();
    typeText('coppola');
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    typeText('godf');
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(execute).toHaveBeenLastCalledWith(UNIVERSAL_SEARCH_QUERY, { q: 'godf' });
  });

  it('never fires below the 2-character trigger, and the panel stays closed', async () => {
    renderBox();
    typeText('g');
    await sleep(AUTOCOMPLETE_DEBOUNCE_MS * 2);
    expect(execute).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input()).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('panel pipeline: skeleton → union rows (posters/monograms) → footer', () => {
  it('shows skeletons while the first request is in flight, then server-order rows', async () => {
    const d = deferred();
    execute.mockReturnValue(d.promise);
    renderBox();
    typeText('coppola');

    // First load: skeletons, no listbox, no footer yet.
    await waitFor(() => expect(screen.getByRole('status', { name: 'Searching' })).toBeInTheDocument());
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByText(/Index rebuilt/)).toBeNull();

    await act(async () => d.resolve(UNION_DATA));

    const rows = await waitFor(() => options());
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('The Godfather'),
      expect.stringContaining('Francis Ford Coppola'),
      expect.stringContaining('The Godfather Part II'),
      expect.stringContaining('Sofia Coppola'),
    ]);

    // Title rows: lazy OMDb poster img; person rows: Monogram disc, never an img.
    const [t1, p1, t2, p2] = rows;
    for (const t of [t1, t2]) {
      const img = t.querySelector('img');
      expect(img).not.toBeNull();
      expect(img).toHaveAttribute('loading', 'lazy');
      expect(img.src).toContain('img.omdbapi.com');
    }
    for (const p of [p1, p2]) {
      expect(p.querySelector('img')).toBeNull();
      expect(p.querySelector('.monogram')).not.toBeNull();
    }
    // One list — no section headers.
    expect(screen.queryByText(/^titles$/i)).toBeNull();
    expect(screen.queryByText(/^people$/i)).toBeNull();
    // Folded IMDB-13: freshness footer under the rows.
    expect(screen.getByText('Index rebuilt 3 h ago')).toBeInTheDocument();
  });

  it('empty union + prefix fill renders Appendix A order through the real pipeline', async () => {
    execute.mockResolvedValue(
      payload({
        titles: [title(11), title(12), title(13)],
        people: [person(21), person(22)],
      }),
    );
    renderBox();
    typeText('godf');
    const rows = await waitFor(() => options());
    // 2 titles : 1 person, repeating; remainder from whichever list is left.
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Title 11'),
      expect.stringContaining('Title 12'),
      expect.stringContaining('Person 21'),
      expect.stringContaining('Title 13'),
      expect.stringContaining('Person 22'),
    ]);
  });

  it('query change keeps previous rows at full strength and shows the progress bar', async () => {
    const { container } = renderBox();
    execute.mockResolvedValueOnce(UNION_DATA);
    typeText('coppola');
    await waitFor(() => expect(options()).toHaveLength(4));

    const d = deferred();
    execute.mockReturnValue(d.promise);
    typeText('coppola f');
    await waitFor(() =>
      expect(container.querySelector('.autocomplete-panel__progress')).not.toBeNull(),
    );
    // Previous rows still there, still a real listbox (not skeletons).
    expect(options()).toHaveLength(4);
    await act(async () => d.resolve(payload({ hits: [uT(9, { primaryTitle: 'Fresh Row' })] })));
    await waitFor(() => expect(options()).toHaveLength(1));
  });
});

describe('DES-2 keyboard model against the real pipeline', () => {
  async function openWithUnionData() {
    execute.mockResolvedValue(UNION_DATA);
    renderBox();
    input().focus();
    typeText('coppola');
    await waitFor(() => expect(options()).toHaveLength(4));
  }

  it('row 1 preselected; wrapping arrows; focus pinned to the input', async () => {
    await openWithUnionData();
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    expect(input()).toHaveAttribute('aria-activedescendant', options()[0].id);

    key('ArrowUp'); // wraps to the last row
    expect(options()[3]).toHaveAttribute('aria-selected', 'true');
    key('ArrowDown'); // wraps back to row 1
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(input());
  });

  it('hover moves the selection and Enter opens the hovered row (mouse+keyboard agree)', async () => {
    await openWithUnionData();
    fireEvent.mouseEnter(options()[1]);
    expect(options()[1]).toHaveAttribute('aria-selected', 'true');
    key('Enter');
    expect(screen.getByTestId('location')).toHaveTextContent('/person/nm1');
    // Selecting clears nothing.
    expect(input()).toHaveValue('coppola');
  });

  it('a NEW result set re-preselects row 1', async () => {
    await openWithUnionData();
    key('ArrowDown');
    key('ArrowDown');
    expect(options()[2]).toHaveAttribute('aria-selected', 'true');

    execute.mockResolvedValue(payload({ hits: [uT(31), uN(32), uT(33)] }));
    typeText('coppola j');
    await waitFor(() => expect(options()).toHaveLength(3));
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('Esc closes the panel then blurs; Tab closes; ✕ clears, closes, and keeps focus', async () => {
    await openWithUnionData();
    key('Escape');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(input());
    key('Escape');
    expect(document.activeElement).not.toBe(input());

    input().focus(); // refocus with text present reopens (active query)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    key('Tab');
    expect(screen.queryByRole('listbox')).toBeNull();

    // jsdom's Tab doesn't move focus, so blur explicitly before refocusing.
    input().blur();
    input().focus();
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input()).toHaveValue('');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(input());
  });

  it('`/` does NOT steal focus from another text field', async () => {
    execute.mockResolvedValue(UNION_DATA);
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <Omnibox variant="hero" />
          <input data-testid="other" type="text" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const other = screen.getByTestId('other');
    other.focus();
    fireEvent.keyDown(other, { key: '/' });
    expect(document.activeElement).toBe(other);
  });
});

describe('DES-2 empty/error states through the real pipeline', () => {
  it('no results: query-blaming copy + freshness footer', async () => {
    execute.mockResolvedValue(payload());
    renderBox();
    typeText('zzyzx');
    await waitFor(() => expect(screen.getByText('Nothing matches “zzyzx”.')).toBeInTheDocument());
    expect(screen.getByText(/try a shorter prefix/)).toBeInTheDocument();
    expect(screen.getByText('Index rebuilt 3 h ago')).toBeInTheDocument();
  });

  it('index never built (rebuiltAt null): honest copy + "Index not yet built" footer', async () => {
    execute.mockResolvedValue(payload({ rebuiltAt: null }));
    renderBox();
    typeText('godf');
    await waitFor(() => expect(screen.getByText(/hasn’t been built yet/)).toBeInTheDocument());
    expect(screen.queryByText(/Nothing matches/)).toBeNull();
    expect(screen.getByText('Index not yet built')).toBeInTheDocument();
  });

  it('error: alert + Retry actually refetches through the transport; no footer', async () => {
    execute.mockRejectedValue({ kind: 'network', message: 'boom' });
    renderBox();
    typeText('godf');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Search isn’t responding.'), {
      timeout: 4000, // TanStack retries transient kinds twice before erroring
    });
    expect(screen.queryByText(/Index rebuilt/)).toBeNull();

    const callsBefore = execute.mock.calls.length;
    execute.mockResolvedValue(UNION_DATA);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(execute.mock.calls.length).toBeGreaterThan(callsBefore));
    await waitFor(() => expect(options()).toHaveLength(4));
  });
});

describe('mobile overlay (compact variant, jsdom-level)', () => {
  it('the toggle opens the overlay row and Esc closes it', () => {
    const { container } = renderBox({ variant: 'compact' });
    const box = container.querySelector('.omnibox');
    expect(box.className).not.toContain('omnibox--mobile-open');
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(box.className).toContain('omnibox--mobile-open');
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(box.className).not.toContain('omnibox--mobile-open');
  });
});

describe('deep-link /search?q= hydration', () => {
  it('renders the reserved placeholder with the decoded query from the URL', () => {
    render(
      <MemoryRouter initialEntries={['/search?q=the%20godfather%20%26%20co']}>
        <Routes>
          <Route path="/search" element={<SearchPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: 'Search — “the godfather & co”' }),
    ).toBeInTheDocument();
  });
});

describe('Appendix A fill rule — hostile cases beyond the developer suite', () => {
  const data = ({ hits = [], titles = [], people = [] } = {}) => ({
    hits,
    titles: { items: titles },
    people: { items: people },
  });

  it('union-only overflow: more union hits than the cap → first 8 in server order', () => {
    const hits = [uT(1), uN(1), uT(2), uN(2), uT(3), uN(3), uT(4), uN(4), uT(5), uN(5)];
    const rows = assembleRows(data({ hits }), 8);
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.id)).toEqual(['tt1', 'nm1', 'tt2', 'nm2', 'tt3', 'nm3', 'tt4', 'nm4']);
  });

  it('duplicate ids INSIDE the union are deduped, keeping first position', () => {
    const rows = assembleRows(data({ hits: [uT(1), uN(1), uT(1), uN(1), uT(2)] }));
    expect(rows.map((r) => r.id)).toEqual(['tt1', 'nm1', 'tt2']);
  });

  it('duplicate ids INSIDE a fill list are deduped (no dupes, no crash)', () => {
    // A list duplicating its own ids violates the server's uniqueness
    // contract; the invariants that matter still hold: each id renders once,
    // in list order, nothing undefined. (The duplicate consumes one slot of
    // the 2:1 cadence — acceptable for out-of-contract input.)
    const rows = assembleRows(
      data({ titles: [title(1), title(1), title(2)], people: [person(1), person(1)] }),
    );
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.map((r) => r.id)).toEqual(['tt1', 'nm1', 'tt2']);
  });

  it('all-duplicate fill (everything already a union hit) adds nothing', () => {
    const rows = assembleRows(
      data({
        hits: [uT(1), uN(1)],
        titles: [title(1)],
        people: [person(1)],
      }),
    );
    expect(rows.map((r) => r.id)).toEqual(['tt1', 'nm1']);
  });

  it('fewer people than the 2:1 ratio needs: people exhaust, titles keep filling', () => {
    const rows = assembleRows(
      data({
        titles: [1, 2, 3, 4, 5, 6, 7].map(title),
        people: [person(1)],
      }),
    );
    expect(rows.map((r) => r.id)).toEqual(['tt1', 'tt2', 'nm1', 'tt3', 'tt4', 'tt5', 'tt6', 'tt7']);
  });

  it('titles exhaust mid-pattern: remaining rows fill from people alone', () => {
    const rows = assembleRows(
      data({
        titles: [title(1), title(2), title(3)],
        people: [1, 2, 3, 4, 5].map(person),
      }),
    );
    expect(rows.map((r) => r.id)).toEqual(['tt1', 'tt2', 'nm1', 'tt3', 'nm2', 'nm3', 'nm4', 'nm5']);
  });

  it('unknown union member __typename is skipped without consuming a row', () => {
    const rows = assembleRows(
      data({ hits: [uT(1), { __typename: 'Episode', id: 'ep1' }, uN(1)], titles: [title(2)] }),
    );
    expect(rows.map((r) => r.id)).toEqual(['tt1', 'nm1', 'tt2']);
  });

  it('union hit missing its id is skipped, not rendered as an empty row', () => {
    const rows = assembleRows(
      data({ hits: [{ __typename: 'Title', primaryTitle: 'No Id' }, uN(1)] }),
    );
    expect(rows.map((r) => r.id)).toEqual(['nm1']);
  });

  it('respects a limit smaller than the union block', () => {
    const rows = assembleRows(data({ hits: [uT(1), uN(1), uT(2), uN(2)] }), 2);
    expect(rows.map((r) => r.id)).toEqual(['tt1', 'nm1']);
  });

  it('mixed hostile: union block + duplicated, ragged fill still caps at 8 with no dupes', () => {
    const rows = assembleRows(
      data({
        hits: [uT(1), uN(1), uT(2)],
        titles: [title(2), title(3), title(3), title(4), title(5), title(6), title(7)],
        people: [person(1), person(2)],
      }),
      8,
    );
    expect(rows).toHaveLength(8);
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(8);
    expect(ids.slice(0, 3)).toEqual(['tt1', 'nm1', 'tt2']);
    expect(ids).not.toContain(undefined);
  });
});
