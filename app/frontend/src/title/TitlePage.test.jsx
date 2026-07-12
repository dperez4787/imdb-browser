/**
 * TitlePage (IMDB-7, DES-4) — page-level suite at the strongest seam: REAL
 * useTitleDetail/useSearchInfo hooks, REAL QueryClient (app-shaped, from
 * createQueryClient), REAL grouping/formatting — only the transport
 * (client.js#executeWithDenials) is faked, so a wiring break between the
 * page and the data layer cannot hide behind a mocked hook.
 *
 * Covers the ticket's ACs: the designed facts + poster slot, the amended
 * three-way governed votes slot (incl. the restricted-vs-absent confusion
 * rule at page level), genre chips as real /titles?genres=… links,
 * data-driven credit groups with the pre-IMDB-8 non-interactive person
 * chips, episode context, and the loading / error / not-found states.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeWithDenials } from '../graphql/client.js';
import { SEARCH_INFO_QUERY } from '../graphql/queries.js';
import { createQueryClient } from '../graphql/queryClient.js';
import { TITLE_DETAIL_QUERY } from '../graphql/titleQueries.js';
import TitlePage from './TitlePage.jsx';

vi.mock('../graphql/client.js', () => ({ executeWithDenials: vi.fn() }));

/** The redact-mode envelope the denial-aware transport resolves. */
const env = (data, deniedFields = []) => ({ data, deniedFields });

const person = (n, primaryName) => ({ nconst: `nm${n}`, primaryName });
const principal = (ordering, category, name, characters = null) => ({
  ordering,
  category,
  characters,
  name,
});

/** Live tt0068646 shape (verified 2026-07-11), trimmed. */
const godfather = ({ rating = { averageRating: 9.2, numVotes: 2132880 }, episode = null } = {}) => ({
  tconst: 'tt0068646',
  primaryTitle: 'The Godfather',
  titleType: 'movie',
  startYear: 1972,
  endYear: null,
  runtimeMinutes: 175,
  genres: ['Crime', 'Drama'],
  rating,
  episode,
  principals: [
    principal(1, 'actor', person(8, 'Marlon Brando'), ['Don Vito Corleone']),
    principal(2, 'actor', person(199, 'Al Pacino'), ['Michael']),
    principal(4, 'actress', person(473, 'Diane Keaton'), ['Kay Adams']),
    principal(11, 'director', person(338, 'Francis Ford Coppola')),
    principal(12, 'writer', person(701374, 'Mario Puzo')),
    principal(14, 'producer', person(748665, 'Albert S. Ruddy')),
    principal(19, 'casting_director', person(226544, 'Louis DiGiaimo')),
  ],
});

const REBUILT = new Date(Date.now() - 3 * 60 * 60_000).toISOString();

/** Fake the transport per document: the page query + not-found's searchInfo. */
function stubTransport({ title, deniedFields = [], titleError = null } = {}) {
  executeWithDenials.mockImplementation(async (document) => {
    if (document === TITLE_DETAIL_QUERY) {
      if (titleError) throw titleError;
      return env({ title }, deniedFields);
    }
    if (document === SEARCH_INFO_QUERY) {
      return env({ searchInfo: { rebuiltAt: REBUILT, titleCount: 1, nameCount: 1 } });
    }
    throw new Error('unexpected document');
  });
}

/** Non-retryable failure (kind bad-request) so error tests settle instantly. */
const failure = () => Object.assign(new Error('boom'), { kind: 'bad-request' });

function renderPage(initialEntry = '/title/tt0068646') {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/title/:tconst" element={<TitlePage />} />
          <Route path="*" element={<div>elsewhere</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const findHeadline = () => screen.findByRole('heading', { level: 1, name: 'The Godfather' });

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn(); // jsdom has no layout; DES-4's scroll reset calls it
  document.title = 'imdb-browser';
});

describe('happy path — the one-sheet', () => {
  it('renders the designed title facts hydrated through the router', async () => {
    stubTransport({ title: godfather() });
    renderPage();

    expect(await findHeadline()).toBeVisible();
    // Fact line: startYear · titleType · runtime.
    expect(screen.getByText('1972 · Movie · 2h 55m')).toBeVisible();
    // Rating block: amber star value + compact votes (granted here).
    expect(screen.getByText('9.2')).toBeVisible();
    expect(screen.getByText('2.1M votes')).toBeVisible();
    // Poster slot: one lazy-loaded OMDb request for THIS tconst (budget = 1).
    const poster = document.querySelector('.title-header__poster img.poster-image');
    expect(poster).not.toBeNull();
    expect(poster.src).toContain('img.omdbapi.com');
    expect(poster.src).toContain('tt0068646');
    expect(poster.getAttribute('loading')).toBe('lazy');
    // Document title per DES-4 Behavior.
    expect(document.title).toBe('The Godfather (1972) — Marquee');
    // Scroll reset on navigation to the page.
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('genre chips are real links into the faceted view, pre-filtered to one genre', async () => {
    stubTransport({ title: godfather() });
    renderPage();
    await findHeadline();

    const chips = within(screen.getByRole('list', { name: 'Genres' })).getAllByRole('link');
    expect(chips.map((a) => a.textContent)).toEqual(['Crime', 'Drama']);
    expect(chips.map((a) => a.getAttribute('href'))).toEqual([
      '/titles?genres=Crime',
      '/titles?genres=Drama',
    ]);
  });

  it('credit groups are data-driven and DES-4-ordered: director, writer, cast slot, then API order', async () => {
    stubTransport({ title: godfather() });
    renderPage();
    await findHeadline();

    const headers = [...document.querySelectorAll('.credit-group__header')].map(
      (h) => h.textContent,
    );
    expect(headers).toEqual([
      'director',
      'writer',
      'actor',
      'actress',
      'producer',
      'casting director', // unknown-ish category renders as its own group, data's words
    ]);
    // Cast entries carry the muted character text, full text in title=.
    const brando = screen.getByText('Marlon Brando').closest('.person-entity');
    expect(within(brando).getByText('Don Vito Corleone')).toHaveAttribute(
      'title',
      'Don Vito Corleone',
    );
  });

  it('person chips are links to the person detail page (the IMDB-8 upgrade)', async () => {
    stubTransport({ title: godfather() });
    renderPage();
    await findHeadline();

    // The seam IMDB-7 left non-interactive is now the cross-navigation door:
    // one anchor per chip, Tab-reachable, straight to /person/:nconst.
    const chip = screen.getByText('Al Pacino').closest('.person-entity');
    expect(chip.tagName).toBe('A');
    expect(chip).toHaveAttribute('href', '/person/nm199');
    expect(chip).toHaveAttribute('data-nconst', 'nm199');
  });

  it('episode context renders for tvEpisode titles, linking the series to its own page', async () => {
    stubTransport({
      title: {
        ...godfather(),
        primaryTitle: 'Pilot',
        episode: {
          seasonNumber: 1,
          episodeNumber: 7,
          series: { tconst: 'tt0903747', primaryTitle: 'Breaking Bad' },
        },
      },
    });
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Pilot' });

    expect(screen.getByText('S1 · E7')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Breaking Bad' })).toHaveAttribute(
      'href',
      '/title/tt0903747',
    );
  });

  it('partial data drops segments silently — no rating block, no “N/A” anywhere', async () => {
    stubTransport({
      title: { ...godfather({ rating: null }), runtimeMinutes: null, genres: [] },
    });
    renderPage();
    await findHeadline();

    expect(screen.getByText('1972 · Movie')).toBeVisible();
    expect(document.querySelector('.rating-block')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Genres' })).toBeNull();
    expect(document.body.textContent).not.toContain('N/A');
  });
});

describe('the governed votes slot (amended AC)', () => {
  it('numVotes denied → page fully intact, pill in the votes slot — never an error page', async () => {
    stubTransport({
      title: godfather({ rating: { averageRating: 9.2 } }),
      deniedFields: ['Rating.numVotes'],
    });
    renderPage();
    await findHeadline();

    // Stars and every ungoverned fact intact.
    expect(screen.getByText('9.2')).toBeVisible();
    expect(screen.getByText('1972 · Movie · 2h 55m')).toBeVisible();
    expect(screen.getByText('Francis Ford Coppola')).toBeVisible();
    // The designed restricted treatment sits in the votes line's box.
    const pill = document.querySelector(
      '.rating-block__votes .restricted-value[data-coordinate="Rating.numVotes"]',
    );
    expect(pill).not.toBeNull();
    // …and joins the header tab order (tooltip affordance for keyboard users).
    expect(pill).toHaveAttribute('tabindex', '0');
    expect(screen.queryByText(/\d+(\.\d+)?[KM]? votes/)).toBeNull();
  });

  it('CONFUSION RULE: a title with no rating and nothing denied shows NO block and NO pill', async () => {
    stubTransport({ title: godfather({ rating: null }) });
    renderPage();
    await findHeadline();

    expect(document.querySelector('.rating-block')).toBeNull();
    expect(document.querySelector('.restricted-value')).toBeNull();
  });
});

describe('states', () => {
  it('loading: poster-sized skeleton until data lands (shimmers; never the hatch)', async () => {
    stubTransport({ title: godfather() });
    let release;
    executeWithDenials.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve(env({ title: godfather() }));
        }),
    );
    renderPage();

    expect(screen.getByRole('status', { name: 'Loading title' })).toBeInTheDocument();
    expect(document.querySelector('.title-skeleton__poster')).not.toBeNull();
    expect(document.querySelector('.restricted-value')).toBeNull();

    release();
    expect(await findHeadline()).toBeVisible();
    expect(screen.queryByRole('status', { name: 'Loading title' })).toBeNull();
  });

  it('not-found: title:null (never an error) → designed copy + freshness caveat + both actions', async () => {
    stubTransport({ title: null });
    renderPage('/title/tt9999999999');

    expect(await screen.findByText('This title isn’t in the index.')).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByText(/It may not exist, or the index may not have it yet \(Index rebuilt 3 h ago\)\./),
      ).toBeVisible(),
    );
    expect(screen.getByRole('button', { name: '← Back' })).toBeVisible();

    // "Search instead" hands focus to the omnibox via the DES-1 global `/`
    // shortcut the omnibox owns — observable as the dispatched event.
    const seen = vi.fn();
    document.addEventListener('keydown', seen);
    fireEvent.click(screen.getByRole('button', { name: 'Search instead' }));
    document.removeEventListener('keydown', seen);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0].key).toBe('/');
  });

  it('not-found without searchInfo: the freshness parenthetical drops silently', async () => {
    executeWithDenials.mockImplementation(async (document) => {
      if (document === TITLE_DETAIL_QUERY) return env({ title: null });
      throw failure(); // searchInfo unavailable
    });
    renderPage('/title/tt9999999999');

    expect(await screen.findByText('This title isn’t in the index.')).toBeVisible();
    await waitFor(() =>
      expect(screen.getByText('It may not exist, or the index may not have it yet.')).toBeVisible(),
    );
    expect(screen.queryByText(/Index rebuilt/)).toBeNull();
  });

  it('error: query failure → designed error state, and Retry refetches into the page', async () => {
    stubTransport({ title: godfather(), titleError: failure() });
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load this title.');

    stubTransport({ title: godfather() });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await findHeadline()).toBeVisible();
  });
});
