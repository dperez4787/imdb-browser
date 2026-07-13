/**
 * EpisodesSection (IMDB-20) — the strongest seam, same as TitlePage.test.jsx:
 * REAL useTitleEpisodes (real useInfiniteQuery paging), REAL grouping, REAL
 * app-shaped QueryClient; only the transport is faked. Covers the section's
 * own contract: season grouping (null → Specials), the no-total paging rule
 * (full page → Load more, short page → the end), zero DOM on empty, and the
 * quiet error + Retry line.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeWithDenials } from '../graphql/client.js';
import { EPISODES_PAGE_SIZE } from '../graphql/episodeHooks.js';
import { TITLE_EPISODES_QUERY } from '../graphql/episodeQueries.js';
import { createQueryClient } from '../graphql/queryClient.js';
import EpisodesSection from './EpisodesSection.jsx';

vi.mock('../graphql/client.js', () => ({ executeWithDenials: vi.fn() }));

const env = (data, deniedFields = []) => ({ data, deniedFields });

/** n synthetic episodes: season 1 throughout, numbered from `from`. */
const makeEpisodes = (n, { from = 1, season = 1 } = {}) =>
  Array.from({ length: n }, (_, i) => ({
    tconst: `tt${from + i}`,
    primaryTitle: `Episode ${from + i}`,
    startYear: 2008,
    episode: { seasonNumber: season, episodeNumber: from + i },
  }));

/** Offset-paged stub over one full episode list (the router's semantics). */
function stubEpisodes(all) {
  executeWithDenials.mockImplementation(async (document, { tconst, limit, offset }) => {
    if (document !== TITLE_EPISODES_QUERY) throw new Error('unexpected document');
    return env({ title: { tconst, episodes: all.slice(offset, offset + limit) } });
  });
}

const failure = () => Object.assign(new Error('boom'), { kind: 'bad-request' });

function renderSection(tconst = 'tt0903747') {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <EpisodesSection tconst={tconst} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('season grouping', () => {
  it('groups by season in API order, marker + linked title + muted year per row', async () => {
    stubEpisodes([
      ...makeEpisodes(2, { season: 1 }),
      {
        tconst: 'tt77',
        primaryTitle: 'El Camino',
        startYear: 2019,
        episode: { seasonNumber: 2, episodeNumber: 1 },
      },
    ]);
    renderSection();

    const section = await screen.findByRole('region', { name: 'Episodes' });
    const headers = [...section.querySelectorAll('.episode-group__header')].map(
      (h) => h.textContent,
    );
    expect(headers).toEqual(['Season 1', 'Season 2']);
    const row = within(section).getByRole('link', { name: 'El Camino' }).closest('.episode-row');
    expect(within(row).getByText('S2E1')).toBeVisible();
    expect(within(row).getByRole('link', { name: 'El Camino' })).toHaveAttribute(
      'href',
      '/title/tt77',
    );
    expect(within(row).getByText('2019')).toHaveClass('episode-row__year');
  });

  it('seasonNumber null groups under "Specials"', async () => {
    stubEpisodes([
      ...makeEpisodes(1, { season: 1 }),
      {
        tconst: 'tt88',
        primaryTitle: 'Behind the Scenes',
        startYear: 2010,
        episode: { seasonNumber: null, episodeNumber: null },
      },
    ]);
    renderSection();

    const section = await screen.findByRole('region', { name: 'Episodes' });
    const headers = [...section.querySelectorAll('.episode-group__header')].map(
      (h) => h.textContent,
    );
    expect(headers).toEqual(['Season 1', 'Specials']);
    expect(within(section).getByRole('link', { name: 'Behind the Scenes' })).toBeVisible();
  });
});

describe('paging without a total (short page = the end)', () => {
  it('a FULL first page (60) offers Load more; the next short page appends and ends the paging', async () => {
    stubEpisodes(makeEpisodes(EPISODES_PAGE_SIZE + 2)); // 62 total: full page, then 2
    renderSection();

    const section = await screen.findByRole('region', { name: 'Episodes' });
    expect(within(section).getAllByRole('link')).toHaveLength(EPISODES_PAGE_SIZE);
    const more = within(section).getByRole('button', { name: 'Load more' });
    expect(more).toBeVisible();

    fireEvent.click(more);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: `Episode ${EPISODES_PAGE_SIZE + 2}` })).toBeVisible(),
    );
    // Second request paged with offset 60…
    expect(executeWithDenials).toHaveBeenLastCalledWith(
      TITLE_EPISODES_QUERY,
      expect.objectContaining({ offset: EPISODES_PAGE_SIZE, limit: EPISODES_PAGE_SIZE }),
    );
    // …and the short page retired the button.
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('a short first page shows NO Load more button', async () => {
    stubEpisodes(makeEpisodes(7));
    renderSection();

    await screen.findByRole('region', { name: 'Episodes' });
    expect(screen.getAllByRole('link')).toHaveLength(7);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(executeWithDenials).toHaveBeenCalledTimes(1);
  });
});

describe('empty and error', () => {
  it('episodes resolve empty (movies, leaf titles) → ZERO DOM', async () => {
    stubEpisodes([]);
    const { container } = renderSection('tt0068646');

    await waitFor(() => expect(executeWithDenials).toHaveBeenCalledTimes(1));
    expect(container.innerHTML).toBe('');
  });

  it('first fetch fails → quiet line + Retry, which recovers into the section', async () => {
    executeWithDenials.mockRejectedValueOnce(failure());
    stubEpisodes(makeEpisodes(3)); // mockImplementation serves AFTER the rejectedOnce
    renderSection();

    expect(await screen.findByText(/Couldn’t load episodes\./)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('region', { name: 'Episodes' })).toBeVisible();
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });
});
