/**
 * IMDB-20 tester acceptance gaps — the developer's colocated suites are broad
 * (gate, states, ARIA, lazy fetch, grouping, basic paging), so this file only
 * covers what they DON'T:
 *
 *   1. The short-page heuristic at the exact boundary: a list of exactly one
 *      full page (60) offers Load more; clicking it fetches an EMPTY page,
 *      which retires the button without disturbing the list and without an
 *      error line.
 *   2. Load more APPENDS, never replaces (page-1 rows survive, count grows).
 *   3. A failed Load-more keeps the loaded groups on screen next to the
 *      quiet error + Retry line, and Retry resumes the paging.
 *   4. The two query lineages — the section's {tconst, limit:60} and the
 *      popover's {tconst, limit:12} — never collide in one QueryClient for
 *      the SAME tconst: two distinct cache entries, each surface renders its
 *      own page shape.
 *   5. Popover row links actually navigate (the developer asserted href only),
 *      and opening the popover adds zero <img> elements anywhere (OMDb
 *      budget 0 inside the popover).
 *
 * Same seam as the developer's suites: REAL hook, REAL app-shaped
 * QueryClient, only the transport faked.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeWithDenials } from '../graphql/client.js';
import { EPISODES_PAGE_SIZE, EPISODES_PEEK_SIZE, titleEpisodesKey } from '../graphql/episodeHooks.js';
import { TITLE_EPISODES_QUERY } from '../graphql/episodeQueries.js';
import { createQueryClient } from '../graphql/queryClient.js';
import TitleCard from '../titles/TitleCard.jsx';
import EpisodesSection from './EpisodesSection.jsx';

vi.mock('../graphql/client.js', () => ({ executeWithDenials: vi.fn() }));

const env = (data, deniedFields = []) => ({ data, deniedFields });

const makeEpisodes = (n) =>
  Array.from({ length: n }, (_, i) => ({
    tconst: `tt${i + 1}`,
    primaryTitle: `Episode ${i + 1}`,
    startYear: 2008,
    episode: { seasonNumber: 1, episodeNumber: i + 1 },
  }));

/** Offset-paged stub over one full episode list (the router's semantics). */
function stubEpisodes(all) {
  executeWithDenials.mockImplementation(async (document, { tconst, limit, offset }) => {
    if (document !== TITLE_EPISODES_QUERY) throw new Error('unexpected document');
    return env({ title: { tconst, episodes: all.slice(offset, offset + limit) } });
  });
}

const failure = () => Object.assign(new Error('boom'), { kind: 'bad-request' });

function renderSection(tconst = 'tt0903747', client = createQueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EpisodesSection tconst={tconst} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('short-page heuristic at the exact boundary (list length == one full page)', () => {
  it('60-of-60 offers Load more; the follow-up EMPTY page retires it, list intact, no error', async () => {
    stubEpisodes(makeEpisodes(EPISODES_PAGE_SIZE)); // exactly one full page
    renderSection();

    const section = await screen.findByRole('region', { name: 'Episodes' });
    expect(within(section).getAllByRole('link')).toHaveLength(EPISODES_PAGE_SIZE);
    const more = within(section).getByRole('button', { name: 'Load more' });

    fireEvent.click(more);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull(),
    );
    // The empty page appended nothing and broke nothing.
    expect(within(section).getAllByRole('link')).toHaveLength(EPISODES_PAGE_SIZE);
    expect(within(section).getByRole('link', { name: 'Episode 1' })).toBeVisible();
    expect(screen.queryByText(/Couldn’t load episodes\./)).toBeNull();
    // Second request was the offset-60 page.
    expect(executeWithDenials).toHaveBeenLastCalledWith(
      TITLE_EPISODES_QUERY,
      expect.objectContaining({ offset: EPISODES_PAGE_SIZE, limit: EPISODES_PAGE_SIZE }),
    );
  });
});

describe('Load more appends — never replaces', () => {
  it('after paging, page-1 rows are still present and the count is the sum', async () => {
    stubEpisodes(makeEpisodes(EPISODES_PAGE_SIZE + 2)); // 62
    renderSection();

    const section = await screen.findByRole('region', { name: 'Episodes' });
    fireEvent.click(within(section).getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(
        within(section).getByRole('link', { name: `Episode ${EPISODES_PAGE_SIZE + 2}` }),
      ).toBeVisible(),
    );
    expect(within(section).getAllByRole('link')).toHaveLength(EPISODES_PAGE_SIZE + 2);
    expect(within(section).getByRole('link', { name: 'Episode 1' })).toBeVisible();
  });
});

describe('failed Load-more keeps what loaded', () => {
  it('the loaded groups stay next to the quiet line + Retry, and Retry resumes paging', async () => {
    const all = makeEpisodes(EPISODES_PAGE_SIZE + 2);
    const page = ({ tconst, limit, offset }) =>
      env({ title: { tconst, episodes: all.slice(offset, offset + limit) } });
    executeWithDenials
      .mockImplementationOnce(async (document, variables) => page(variables)) // page 1 OK
      .mockImplementationOnce(async () => {
        throw failure(); // Load more fails
      })
      .mockImplementation(async (document, variables) => page(variables)); // Retry succeeds

    renderSection();
    const section = await screen.findByRole('region', { name: 'Episodes' });
    fireEvent.click(within(section).getByRole('button', { name: 'Load more' }));

    // Failure: the 60 loaded rows survive, alongside the error line.
    expect(await within(section).findByText(/Couldn’t load episodes\./)).toBeVisible();
    expect(within(section).getAllByRole('link')).toHaveLength(EPISODES_PAGE_SIZE);

    fireEvent.click(within(section).getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(within(section).getAllByRole('link')).toHaveLength(EPISODES_PAGE_SIZE + 2),
    );
    expect(screen.queryByText(/Couldn’t load episodes\./)).toBeNull();
  });
});

describe('lineage isolation: {tconst, limit:60} vs {tconst, limit:12} in ONE QueryClient', () => {
  function LocationProbe() {
    const location = useLocation();
    return <div data-testid="pathname">{location.pathname}</div>;
  }

  function renderBothSurfaces(client) {
    const item = {
      tconst: 'tt0903747',
      primaryTitle: 'Breaking Bad',
      titleType: 'tvSeries',
      startYear: 2008,
      genres: ['Crime'],
      rating: { averageRating: 9.5 },
    };
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/titles']}>
          <Routes>
            <Route
              path="/titles"
              element={
                <>
                  <EpisodesSection tconst="tt0903747" />
                  <ul>
                    <TitleCard item={item} />
                  </ul>
                  <LocationProbe />
                </>
              }
            />
            <Route path="/title/:tconst" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('the section keeps its 60-page and the popover its 12-peek — two cache entries, no clobbering', async () => {
    stubEpisodes(makeEpisodes(EPISODES_PAGE_SIZE + 2));
    const client = createQueryClient();
    renderBothSurfaces(client);

    // Section settles first (its query is enabled from mount).
    const section = await screen.findByRole('region', { name: 'Episodes' });
    expect(within(section).getAllByRole('link')).toHaveLength(EPISODES_PAGE_SIZE);
    const imgsBeforeOpen = document.querySelectorAll('img').length; // the card poster

    fireEvent.click(screen.getByRole('button', { name: 'Episodes of Breaking Bad' }));
    const dialog = await screen.findByRole('dialog', { name: 'Episodes of Breaking Bad' });
    await within(dialog).findByRole('link', { name: /Episode 1$/ });

    // The popover shows its own 12-episode peek (+ the footer link), while
    // the section still shows its full 60 — neither lineage clobbered the other.
    const dialogRows = within(dialog)
      .getAllByRole('link')
      .filter((a) => a.textContent !== 'All episodes →');
    expect(dialogRows).toHaveLength(EPISODES_PEEK_SIZE);
    expect(within(section).getAllByRole('link')).toHaveLength(EPISODES_PAGE_SIZE);

    // Exactly two lineages hit the transport, one per limit…
    const variablesSeen = executeWithDenials.mock.calls.map(([, variables]) => variables);
    expect(variablesSeen).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tconst: 'tt0903747', limit: EPISODES_PAGE_SIZE, offset: 0 }),
        expect.objectContaining({ tconst: 'tt0903747', limit: EPISODES_PEEK_SIZE, offset: 0 }),
      ]),
    );
    // …and they live under two DISTINCT cache keys.
    expect(client.getQueryData(titleEpisodesKey('tt0903747', EPISODES_PAGE_SIZE))).toBeDefined();
    expect(client.getQueryData(titleEpisodesKey('tt0903747', EPISODES_PEEK_SIZE))).toBeDefined();
    expect(titleEpisodesKey('tt0903747', EPISODES_PAGE_SIZE)).not.toEqual(
      titleEpisodesKey('tt0903747', EPISODES_PEEK_SIZE),
    );

    // Zero OMDb inside the popover: opening it added no <img> anywhere.
    expect(document.querySelectorAll('img').length).toBe(imgsBeforeOpen);
    expect(dialog.querySelector('img')).toBeNull();
  });

  it('a popover row link is a real navigation to the episode page', async () => {
    stubEpisodes(makeEpisodes(3));
    renderBothSurfaces(createQueryClient());

    fireEvent.click(screen.getByRole('button', { name: 'Episodes of Breaking Bad' }));
    const dialog = await screen.findByRole('dialog', { name: 'Episodes of Breaking Bad' });
    fireEvent.click(await within(dialog).findByRole('link', { name: /Episode 2/ }));

    expect(screen.getByTestId('pathname')).toHaveTextContent('/title/tt2');
  });
});
