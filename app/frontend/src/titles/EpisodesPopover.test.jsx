/**
 * EpisodesPopover on the /titles grid (IMDB-20) — rendered through the REAL
 * TitleCard (the gate under test) with the REAL useTitleEpisodes hook and an
 * app-shaped QueryClient; only the transport is faked. Covers: the
 * series-like ellipsis gate, the lazy single fetch (zero requests before
 * first open, exactly one across close/reopen), the loading/empty/error
 * states, row + footer links, Esc close with focus return, outside-click
 * close, and that the "…" click never becomes a card navigation.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeWithDenials } from '../graphql/client.js';
import { EPISODES_PEEK_SIZE } from '../graphql/episodeHooks.js';
import { TITLE_EPISODES_QUERY } from '../graphql/episodeQueries.js';
import { createQueryClient } from '../graphql/queryClient.js';
import TitleCard from './TitleCard.jsx';

vi.mock('../graphql/client.js', () => ({ executeWithDenials: vi.fn() }));

const env = (data, deniedFields = []) => ({ data, deniedFields });

const series = (overrides = {}) => ({
  tconst: 'tt0903747',
  primaryTitle: 'Breaking Bad',
  titleType: 'tvSeries',
  startYear: 2008,
  genres: ['Crime', 'Drama'],
  rating: { averageRating: 9.5 },
  ...overrides,
});

const makeEpisodes = (n) =>
  Array.from({ length: n }, (_, i) => ({
    tconst: `tt${i + 1}`,
    primaryTitle: `Episode ${i + 1}`,
    startYear: 2008,
    episode: { seasonNumber: 1, episodeNumber: i + 1 },
  }));

function stubEpisodes(all) {
  executeWithDenials.mockImplementation(async (document, { tconst, limit, offset }) => {
    if (document !== TITLE_EPISODES_QUERY) throw new Error('unexpected document');
    return env({ title: { tconst, episodes: all.slice(offset, offset + limit) } });
  });
}

const failure = () => Object.assign(new Error('boom'), { kind: 'bad-request' });

/** The grid route plus a probe so navigation (or its absence) is observable. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="pathname">{location.pathname}</div>;
}

function renderCard(item = series()) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/titles']}>
        <Routes>
          <Route
            path="/titles"
            element={
              <>
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

const theButton = () => screen.getByRole('button', { name: 'Episodes of Breaking Bad' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the ellipsis gate (UI heuristic, not a vocabulary)', () => {
  it('tvSeries and tvMiniSeries cards wear the "…" button', () => {
    stubEpisodes([]);
    const { unmount } = renderCard(series());
    expect(theButton()).toBeVisible();
    unmount();

    renderCard(series({ titleType: 'tvMiniSeries' }));
    expect(theButton()).toBeVisible();
  });

  it('movie and tvEpisode cards get no affordance', () => {
    stubEpisodes([]);
    const { unmount } = renderCard(series({ titleType: 'movie' }));
    expect(screen.queryByRole('button', { name: /Episodes of/ })).toBeNull();
    unmount();

    renderCard(series({ titleType: 'tvEpisode' }));
    expect(screen.queryByRole('button', { name: /Episodes of/ })).toBeNull();
  });

  it('the button carries the dialog ARIA contract', () => {
    stubEpisodes([]);
    renderCard();
    expect(theButton()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(theButton()).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('lazy single fetch', () => {
  it('no request before first open; one request (limit 12) after; close/reopen does NOT refetch', async () => {
    stubEpisodes(makeEpisodes(3));
    renderCard();

    expect(executeWithDenials).not.toHaveBeenCalled();

    fireEvent.click(theButton());
    await screen.findByRole('link', { name: /Episode 1/ });
    expect(executeWithDenials).toHaveBeenCalledTimes(1);
    expect(executeWithDenials).toHaveBeenCalledWith(TITLE_EPISODES_QUERY, {
      tconst: 'tt0903747',
      limit: EPISODES_PEEK_SIZE,
      offset: 0,
    });

    fireEvent.click(theButton()); // close
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(theButton()); // reopen — cache, not network
    expect(await screen.findByRole('link', { name: /Episode 1/ })).toBeVisible();
    expect(executeWithDenials).toHaveBeenCalledTimes(1);
  });
});

describe('popover states and anatomy', () => {
  it('loading: skeleton lines inside the dialog until data lands', async () => {
    let release;
    executeWithDenials.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve(env({ title: { tconst: 'tt0903747', episodes: makeEpisodes(2) } }));
        }),
    );
    renderCard();
    fireEvent.click(theButton());

    const dialog = screen.getByRole('dialog', { name: 'Episodes of Breaking Bad' });
    expect(within(dialog).getByRole('status', { name: 'Loading episodes' })).toBeVisible();
    expect(dialog.querySelectorAll('.skeleton-line').length).toBeGreaterThan(0);
    // Zero OMDb inside the popover — text rows only, no <img> ever.
    expect(dialog.querySelector('img')).toBeNull();

    release();
    expect(await within(dialog).findByRole('link', { name: /Episode 1/ })).toBeVisible();
    expect(dialog.querySelector('img')).toBeNull();
  });

  it('lists S#E# + title rows as links, and the "All episodes →" footer to the title page', async () => {
    stubEpisodes(makeEpisodes(2));
    renderCard();
    fireEvent.click(theButton());

    const dialog = screen.getByRole('dialog');
    // Marker + name are adjacent spans; the computed accessible name may or
    // may not carry a space between them, so match both parts loosely.
    const first = await within(dialog).findByRole('link', { name: /S1E1\s*Episode 1/ });
    expect(first).toHaveAttribute('href', '/title/tt1');
    expect(within(first).getByText('S1E1')).toHaveClass('episodes-popover__marker');
    expect(within(dialog).getByRole('link', { name: 'All episodes →' })).toHaveAttribute(
      'href',
      '/title/tt0903747',
    );
  });

  it('empty: "No episodes found" (and no footer link)', async () => {
    stubEpisodes([]);
    renderCard();
    fireEvent.click(theButton());

    expect(await screen.findByText('No episodes found')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'All episodes →' })).toBeNull();
  });

  it('error: one line + Retry, which recovers into the list', async () => {
    executeWithDenials.mockRejectedValueOnce(failure());
    stubEpisodes(makeEpisodes(1));
    renderCard();
    fireEvent.click(theButton());

    expect(await screen.findByText(/Couldn’t load episodes\./)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: /Episode 1/ })).toBeVisible();
  });
});

describe('interaction contract', () => {
  it('clicking "…" never navigates — the card stays on the grid, and the card link still works', async () => {
    stubEpisodes(makeEpisodes(1));
    renderCard();

    fireEvent.click(theButton());
    await screen.findByRole('dialog');
    expect(screen.getByTestId('pathname')).toHaveTextContent('/titles');

    // The card's main click-through is intact (a real link to the title).
    expect(screen.getByRole('link', { name: /Breaking Bad/ })).toHaveAttribute(
      'href',
      '/title/tt0903747',
    );
  });

  it('focus moves into the popover on open; Esc closes and returns focus to the button', async () => {
    stubEpisodes(makeEpisodes(1));
    renderCard();
    fireEvent.click(theButton());

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(theButton()).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(theButton()).toHaveFocus();
    expect(theButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('clicking outside closes the popover', async () => {
    stubEpisodes(makeEpisodes(1));
    renderCard();
    fireEvent.click(theButton());
    await screen.findByRole('dialog');

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
