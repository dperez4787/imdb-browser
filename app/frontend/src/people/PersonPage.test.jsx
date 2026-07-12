/**
 * PersonPage (IMDB-8, DES-5) — page-level suite at the strongest seam: REAL
 * usePersonDetail/useSearchInfo hooks, REAL QueryClient (app-shaped, from
 * createQueryClient), REAL grouping/formatting — only the transport
 * (client.js#executeWithDenials) is faked, so a wiring break between the
 * page and the data layer cannot hide behind a mocked hook.
 *
 * Covers the ticket's ACs: the identity header (since IMDB-9/DES-6 the
 * known-for poster mosaic over the Monogram floor, in DES-5's unchanged
 * 160px slot), the full lifespan denied-vs-missing matrix at page level
 * (line-level pill under the live both-denied default, inline pill per slot,
 * plain absence when nothing is denied — the confusion rule), the known-for
 * strip in dataset order with NO numVotes dependency, category-grouped
 * filmography rows linking to /title/:tconst, and the loading / error /
 * not-found / empty states.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeWithDenials } from '../graphql/client.js';
import { PERSON_DETAIL_QUERY } from '../graphql/personQueries.js';
import { SEARCH_INFO_QUERY } from '../graphql/queries.js';
import { createQueryClient } from '../graphql/queryClient.js';
import PersonPage from './PersonPage.jsx';

vi.mock('../graphql/client.js', () => ({ executeWithDenials: vi.fn() }));

/** The redact-mode envelope the denial-aware transport resolves. */
const env = (data, deniedFields = []) => ({ data, deniedFields });

const LIFESPAN_DENIED = ['Name.birthYear', 'Name.deathYear', 'Rating.numVotes'];

const knownFor = (n, primaryTitle, startYear, averageRating) => ({
  tconst: `tt${n}`,
  primaryTitle,
  startYear,
  rating: averageRating != null ? { averageRating } : null,
});

const credit = (ordering, category, tconst, primaryTitle, startYear, extra = {}) => ({
  ordering,
  category,
  characters: null,
  title: { tconst, primaryTitle, startYear, rating: null },
  ...extra,
});

/**
 * Live nm0000199 shape (verified 2026-07-12, policy rev 8), trimmed. The
 * live default: both lifespan years redacted (absent from data + listed in
 * deniedFields), knownForTitles WITHOUT numVotes (redacted there too).
 */
const pacino = (overrides = {}) => ({
  nconst: 'nm0000199',
  primaryName: 'Al Pacino',
  primaryProfessions: ['actor', 'director', 'producer'],
  knownForTitles: [
    // Dataset order, deliberately NOT rating- or year-sorted.
    knownFor(70666, 'Serpico', 1973, 7.7),
    knownFor(72890, 'Dog Day Afternoon', 1975, 8),
    knownFor(68646, 'The Godfather', 1972, 9.2),
    knownFor(78718, 'And Justice for All', 1979, 7.4),
  ],
  credits: [
    credit(5, 'self', 'tt0044308', 'Wheel of Fortune', 1952),
    credit(1, 'actor', 'tt0067549', 'The Panic in Needle Park', 1971, {
      characters: ['Bobby'],
    }),
    credit(1, 'actor', 'tt0068646', 'The Godfather', 1972, {
      characters: ['Michael Corleone'],
      title: {
        tconst: 'tt0068646',
        primaryTitle: 'The Godfather',
        startYear: 1972,
        rating: { averageRating: 9.2 },
      },
    }),
    credit(2, 'director', 'tt0118954', 'Looking for Richard', 1996),
  ],
  ...overrides,
});

const REBUILT = new Date(Date.now() - 3 * 60 * 60_000).toISOString();

/** Fake the transport per document: the page query + not-found's searchInfo. */
function stubTransport({ name, deniedFields = [], personError = null } = {}) {
  executeWithDenials.mockImplementation(async (document) => {
    if (document === PERSON_DETAIL_QUERY) {
      if (personError) throw personError;
      return env({ name }, deniedFields);
    }
    if (document === SEARCH_INFO_QUERY) {
      return env({ searchInfo: { rebuiltAt: REBUILT, titleCount: 1, nameCount: 1 } });
    }
    throw new Error('unexpected document');
  });
}

/** Non-retryable failure (kind bad-request) so error tests settle instantly. */
const failure = () => Object.assign(new Error('boom'), { kind: 'bad-request' });

function renderPage(initialEntry = '/person/nm0000199') {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/person/:nconst" element={<PersonPage />} />
          <Route path="*" element={<div>elsewhere</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const findHeadline = () => screen.findByRole('heading', { level: 1, name: 'Al Pacino' });

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn(); // jsdom has no layout; DES-5's scroll reset calls it
  document.title = 'imdb-browser';
});

describe('happy path — the billing page (live both-denied default)', () => {
  it('renders the DES-6 identity header: known-for mosaic over the Monogram floor, same 160px slot', async () => {
    stubTransport({ name: pacino(), deniedFields: LIFESPAN_DENIED });
    renderPage();

    expect(await findHeadline()).toBeVisible();
    // The PersonVisual slot paints the Monogram floor first (initials from
    // the name — the page never waits on OMDb)...
    const visual = document.querySelector('.person-header__visual');
    expect(within(visual).getByText('AP')).toBeInTheDocument();
    // ...and the IMDB-9 mosaic renders over it: one lazy OMDb tile per
    // known-for title (4 here — the spec's ≤4-requests-per-page budget is
    // structural: one img per tile, at most 4 tiles).
    const tiles = visual.querySelectorAll('img.poster-image');
    expect(tiles).toHaveLength(4);
    for (const img of tiles) {
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.src).toContain('img.omdbapi.com');
    }
    // Decorative portrait, not a menu: hidden from AT, nothing interactive
    // (the Known-for strip below is the clickable version of these titles).
    expect(visual).toHaveAttribute('aria-hidden', 'true');
    expect(visual.querySelector('a, button')).toBeNull();
    // Professions: data's words, max 3, ' · ' joined.
    expect(screen.getByText('Actor · Director · Producer')).toBeVisible();
    // Document title per DES-5 Behavior.
    expect(document.title).toBe('Al Pacino — Marquee');
    // Scroll reset on navigation to the page.
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('known-for strip: 4 DES-3 cards in DATASET order, linking to /title/:tconst — no numVotes anywhere', async () => {
    // numVotes is absent from every rating (redacted) AND listed in
    // deniedFields — the strip must render fully regardless (revised DES-5:
    // dataset order, never reads numVotes).
    stubTransport({ name: pacino(), deniedFields: LIFESPAN_DENIED });
    renderPage();
    await findHeadline();

    const cards = document.querySelectorAll('.known-for__strip .title-card');
    expect(cards).toHaveLength(4);
    const links = [...document.querySelectorAll('.known-for__strip .title-card__link')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/title/tt70666',
      '/title/tt72890',
      '/title/tt68646',
      '/title/tt78718',
    ]);
    // Dataset order preserved — NOT re-ranked by rating or year.
    const titles = [...document.querySelectorAll('.known-for__strip .title-card__title')].map(
      (t) => t.textContent,
    );
    expect(titles).toEqual(['Serpico', 'Dog Day Afternoon', 'The Godfather', 'And Justice for All']);
    // Cards show year ★rating from averageRating (ungoverned); never votes.
    expect(screen.getByText('1972 · ★ 9.2')).toBeVisible();
    expect(document.body.textContent).not.toMatch(/votes/i);
    // Posters are lazy-loaded OMDb images (FallbackArt on failure is
    // PosterImage's own tested behavior).
    const poster = document.querySelector('.known-for__strip img.poster-image');
    expect(poster.src).toContain('img.omdbapi.com');
    expect(poster.getAttribute('loading')).toBe('lazy');
  });

  it('filmography: one group per category from the data, acting first, rows year-descending, linked to titles', async () => {
    stubTransport({ name: pacino(), deniedFields: LIFESPAN_DENIED });
    renderPage();
    await findHeadline();

    const headers = [...document.querySelectorAll('.filmography-group__header')].map(
      (h) => h.textContent,
    );
    // actor (acting) first; then self, director in API first-appearance order.
    expect(headers).toEqual(['actor', 'self', 'director']);
    // Rows within actor: year-descending (1972 before 1971).
    const actorGroup = document.querySelector('.filmography-group[data-category="actor"]');
    const rowTitles = [...actorGroup.querySelectorAll('.filmography-row__title')].map(
      (t) => t.textContent,
    );
    expect(rowTitles).toEqual(['The Godfather', 'The Panic in Needle Park']);
    // The whole row is one link to the title detail page.
    const row = screen.getByText('The Panic in Needle Park').closest('a');
    expect(row).toHaveAttribute('href', '/title/tt0067549');
    // Characters muted, full text in title=.
    expect(within(row).getByText('Bobby')).toHaveAttribute('title', 'Bobby');
    // ★ rating reads averageRating (ungoverned).
    const godfatherRow = screen.getByText('The Godfather', { selector: '.filmography-row__title' })
      .closest('a');
    expect(within(godfatherRow).getByText('9.2')).toBeVisible();
  });
});

describe('the governed lifespan line (amended AC — DES-5 matrix at page level)', () => {
  it('LIVE DEFAULT both denied → line renders the line-level pill + RESTRICTED; page otherwise intact', async () => {
    stubTransport({ name: pacino(), deniedFields: LIFESPAN_DENIED });
    renderPage();
    await findHeadline();

    const line = document.querySelector('.person-header__lifespan');
    const pill = line.querySelector('.restricted-value--line');
    expect(pill).not.toBeNull();
    expect(within(line).getByText('Restricted')).toBeInTheDocument();
    // The pill joins the tab order between name and known-for cards.
    expect(pill).toHaveAttribute('tabindex', '0');
    // SR text names the whole line's label.
    expect(within(line).getByText('Lifespan: restricted by data governance.')).toBeInTheDocument();
    // Never an error page: every other section rendered.
    expect(document.querySelectorAll('.known-for__strip .title-card')).toHaveLength(4);
    expect(document.querySelectorAll('.filmography-group').length).toBeGreaterThan(0);
  });

  it('one year denied → inline pill in that slot alone, real year beside it (grant-flip shape)', async () => {
    stubTransport({
      name: pacino({ birthYear: 1940 }),
      deniedFields: ['Name.deathYear'],
    });
    renderPage();
    await findHeadline();

    const line = document.querySelector('.person-header__lifespan');
    expect(within(line).getByText('1940')).toBeVisible();
    const pill = line.querySelector('.restricted-value--inline');
    expect(pill).toHaveAttribute('data-coordinate', 'Name.deathYear');
    expect(line.querySelector('.restricted-value--line')).toBeNull();
    expect(line.textContent).toContain('–');
  });

  it('nothing denied, both years known → plain 1940 – 2015, no pill', async () => {
    stubTransport({ name: pacino({ birthYear: 1940, deathYear: 2015 }) });
    renderPage();
    await findHeadline();

    const line = document.querySelector('.person-header__lifespan');
    expect(line.textContent).toBe('1940 – 2015');
    expect(document.querySelector('.restricted-value')).toBeNull();
  });

  it('living person, nothing denied → trailing dash: 1940 –', async () => {
    stubTransport({ name: pacino({ birthYear: 1940 }) });
    renderPage();
    await findHeadline();

    expect(document.querySelector('.person-header__lifespan').textContent.trim()).toBe('1940 –');
  });

  it('CONFUSION RULE: no recorded birth year and nothing denied → NO line and NO pill', async () => {
    // numVotes may still be denied elsewhere in the document — the lifespan
    // must not confuse that with its own coordinates.
    stubTransport({ name: pacino(), deniedFields: ['Rating.numVotes'] });
    renderPage();
    await findHeadline();

    expect(document.querySelector('.person-header__lifespan')).toBeNull();
    expect(document.querySelector('.person-header .restricted-value')).toBeNull();
  });
});

describe('strip and filmography edge states (DES-5)', () => {
  it('fewer than 2 known-for titles → the strip section does not render at all', async () => {
    stubTransport({
      name: pacino({ knownForTitles: [knownFor(1, 'Only One', 2000, 7)] }),
      deniedFields: LIFESPAN_DENIED,
    });
    renderPage();
    await findHeadline();

    expect(document.querySelector('.known-for')).toBeNull();
    expect(screen.queryByText('Known for')).toBeNull();
  });

  it('empty filmography → the single muted line, no filmography section', async () => {
    stubTransport({
      name: pacino({ credits: [], knownForTitles: [] }),
      deniedFields: LIFESPAN_DENIED,
    });
    renderPage();
    await findHeadline();

    expect(screen.getByText('No credited titles in the index.')).toBeVisible();
    expect(document.querySelector('.filmography')).toBeNull();
    expect(document.querySelector('.known-for')).toBeNull();
  });
});

describe('states', () => {
  it('loading: DES-5 skeleton (square visual + card + row bones) until data lands; never the hatch', async () => {
    stubTransport({ name: pacino(), deniedFields: LIFESPAN_DENIED });
    let release;
    executeWithDenials.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(env({ name: pacino() }, LIFESPAN_DENIED));
        }),
    );
    renderPage();

    expect(screen.getByRole('status', { name: 'Loading person' })).toBeInTheDocument();
    expect(document.querySelector('.person-skeleton__visual')).not.toBeNull();
    expect(document.querySelectorAll('.person-skeleton__card')).toHaveLength(4);
    expect(document.querySelectorAll('.person-skeleton__line--row')).toHaveLength(6);
    expect(document.querySelector('.restricted-value')).toBeNull();

    release();
    expect(await findHeadline()).toBeVisible();
    expect(screen.queryByRole('status', { name: 'Loading person' })).toBeNull();
  });

  it('not-found: name:null (never an error) → person-worded copy + freshness caveat + both actions', async () => {
    stubTransport({ name: null });
    renderPage('/person/nm9999999999');

    expect(await screen.findByText('This person isn’t in the index.')).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByText(
          /It may not exist, or the index may not have it yet \(Index rebuilt 3 h ago\)\./,
        ),
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

  it('error: query failure → designed error state with person wording, and Retry refetches into the page', async () => {
    stubTransport({ name: pacino(), personError: failure() });
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load this person.');

    stubTransport({ name: pacino(), deniedFields: LIFESPAN_DENIED });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await findHeadline()).toBeVisible();
  });
});
