/**
 * Tester acceptance probes (IMDB-14) — written independently of the
 * developer's colocated suites, against the ticket's acceptance criteria,
 * designs/DES-8, and docs/architecture.md § Field-level governance (the
 * redact-mode revision, merged via PR #12).
 *
 * Everything here drives the REAL modules: hooks → client.js → errors.js →
 * graphql-request, with only the two outermost seams faked (auth.js and
 * globalThis.fetch). Where the developer's tests mock client.js under the
 * hooks, these do not — the {data, deniedFields} envelope is proven through
 * the full in-repo stack.
 *
 *   1. Normalization ORDERING: a 403 carrying PERMISSION_DENIED yields kind
 *      'denied' — never 'auth' — and a bare 401/403 stays 'auth'.
 *   2. deniedFields union + dedup across multiple PERMISSION_DENIED errors.
 *   3. Redact-mode contract through the real client: HTTP 200, partial data,
 *      deniedFields from extensions.governance.redactedFields, one request.
 *   4. Hooks contract: deniedFields is ALWAYS an array (disabled, pending,
 *      clean, degraded), data unwrapped from the envelope.
 *   5. Caching seam (grant-flip stand-in per the AC's fallback clause):
 *      function-form staleTime resolves 60s iff the cached envelope reports
 *      denials, 1h/5m per operation otherwise.
 *   6. RestrictedValue per DES-8: variants, tooltip on hover AND focus, SR
 *      text, static (no animation — asserted against styles.css itself),
 *      isRestricted coordinate matching.
 *   7. DES-8's confusion rule: restricted is DISTINGUISHABLE from
 *      genuinely-absent through the two-rule contract a view would write.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getIdToken } from './auth.js';
import RestrictedValue, { isRestricted } from './components/RestrictedValue.jsx';
import { execute, executeWithDenials } from './graphql/client.js';
import { GraphQLLayerError } from './graphql/errors.js';
import {
  DENIED_STALE_TIME,
  denialScopedStaleTime,
  useName,
  useSearch,
  useTitle,
} from './graphql/hooks.js';
import { SEARCH_INFO_QUERY, TITLE_QUERY } from './graphql/queries.js';
import { createQueryClient } from './graphql/queryClient.js';

vi.mock('./auth.js', () => ({
  getIdToken: vi.fn(),
}));

const srcDir = dirname(fileURLToPath(import.meta.url));

/** JSON GraphQL HTTP response for the stubbed fetch. */
function graphqlResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** The live router's verified redact-mode 200 (2026-07-11, revision 8). */
function redactedResponse(data, redactedFields, { revision = 8, roles = [] } = {}) {
  return graphqlResponse({
    data,
    extensions: { governance: { redactedFields, revision, roles } },
  });
}

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  getIdToken.mockResolvedValue('tester-imdb14-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/* AC 2 — never presented as an authentication failure                 */
/* ------------------------------------------------------------------ */

describe('normalization ordering: governance denial is never "auth" (AC 2)', () => {
  const denial403 = (deniedFields) =>
    graphqlResponse(
      {
        errors: [
          {
            message: `not authorized to read: ${deniedFields.join(', ')}`,
            extensions: { code: 'PERMISSION_DENIED', deniedFields },
          },
        ],
      },
      { status: 403 },
    );

  it('a signed-in user\'s 403 + PERMISSION_DENIED → kind "denied" with coordinates, never "auth"', async () => {
    // The exact collision the ordering rule exists for: reject mode arrives
    // as HTTP 403, the same status the HTTP rule maps to 'auth'.
    fetchMock.mockResolvedValue(denial403(['Rating.numVotes']));

    const err = await execute(TITLE_QUERY, { tconst: 'tt0068646' }).catch((e) => e);

    expect(err).toBeInstanceOf(GraphQLLayerError);
    expect(err.kind).toBe('denied');
    expect(err.kind).not.toBe('auth');
    expect(err.deniedFields).toEqual(['Rating.numVotes']);
  });

  it('a bare 403 (no PERMISSION_DENIED marker) still normalizes to "auth" — the kind stays reserved for credentials', async () => {
    fetchMock.mockResolvedValue(graphqlResponse({ errors: [] }, { status: 403 }));
    const err = await execute(SEARCH_INFO_QUERY).catch((e) => e);
    expect(err.kind).toBe('auth');
    expect(err.deniedFields).toEqual([]); // always an array, never populated for auth
  });

  it('a 401 stays "auth" and a PERMISSION_DENIED at any other status is still "denied"', async () => {
    fetchMock.mockResolvedValueOnce(graphqlResponse({ errors: [] }, { status: 401 }));
    expect((await execute(SEARCH_INFO_QUERY).catch((e) => e)).kind).toBe('auth');

    // Defensive: the marker wins even on a 200-with-errors evolution.
    fetchMock.mockResolvedValueOnce(
      graphqlResponse({
        errors: [
          { message: 'no', extensions: { code: 'PERMISSION_DENIED', deniedFields: ['Name.birthYear'] } },
        ],
      }),
    );
    expect((await execute(SEARCH_INFO_QUERY).catch((e) => e)).kind).toBe('denied');
  });

  it('unions and DEDUPLICATES deniedFields across multiple PERMISSION_DENIED errors', async () => {
    // Defensive against a one-error-per-field shape — with exact duplicates.
    fetchMock.mockResolvedValue(
      graphqlResponse(
        {
          errors: [
            { message: 'a', extensions: { code: 'PERMISSION_DENIED', deniedFields: ['Rating.numVotes'] } },
            { message: 'b', extensions: { code: 'PERMISSION_DENIED', deniedFields: ['Rating.numVotes', 'Name.birthYear'] } },
            { message: 'c', extensions: { code: 'PERMISSION_DENIED', deniedFields: ['Name.birthYear', 'Name.deathYear'] } },
          ],
        },
        { status: 403 },
      ),
    );

    const err = await execute(SEARCH_INFO_QUERY).catch((e) => e);

    expect(err.kind).toBe('denied');
    expect(err.deniedFields).toEqual(['Rating.numVotes', 'Name.birthYear', 'Name.deathYear']);
    expect(new Set(err.deniedFields).size).toBe(err.deniedFields.length);
  });
});

/* ------------------------------------------------------------------ */
/* AC 1 + AC 3 — redact mode through the real client                   */
/* ------------------------------------------------------------------ */

describe('redact-mode contract through the real client (AC 1, AC 3)', () => {
  it('a mixed governed/ungoverned query delivers the ungoverned data plus deniedFields — one request, nothing blanked', async () => {
    fetchMock.mockResolvedValue(
      redactedResponse(
        {
          title: {
            tconst: 'tt0068646',
            primaryTitle: 'The Godfather',
            startYear: 1972,
            rating: { averageRating: 9.2 },
          },
        },
        ['Rating.numVotes'],
      ),
    );

    const { data, deniedFields } = await executeWithDenials(TITLE_QUERY, {
      tconst: 'tt0068646',
    });

    expect(data.title.primaryTitle).toBe('The Godfather');
    expect(data.title.startYear).toBe(1972);
    expect(data.title.rating.averageRating).toBe(9.2);
    expect(data.title.rating).not.toHaveProperty('numVotes');
    expect(deniedFields).toEqual(['Rating.numVotes']);
    expect(fetchMock).toHaveBeenCalledTimes(1); // one round trip, no retry
  });

  it('a clean response (no governance extension at all) resolves deniedFields: []', async () => {
    fetchMock.mockResolvedValue(graphqlResponse({ data: { searchInfo: { rebuiltAt: 'x' } } }));
    const { deniedFields } = await executeWithDenials(SEARCH_INFO_QUERY);
    expect(deniedFields).toEqual([]);
  });

  it('a malformed governance extension (redactedFields not an array) degrades to clean, not a crash', async () => {
    fetchMock.mockResolvedValue(
      graphqlResponse({
        data: { searchInfo: {} },
        extensions: { governance: { redactedFields: 'Rating.numVotes', revision: 8 } },
      }),
    );
    const { deniedFields } = await executeWithDenials(SEARCH_INFO_QUERY);
    expect(deniedFields).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Hooks contract — proven through the REAL client (fetch faked)       */
/* ------------------------------------------------------------------ */

function renderWithClient(hook) {
  const queryClient = createQueryClient();
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...renderHook(hook, { wrapper }) };
}

describe('hooks contract: deniedFields alongside data, always an array', () => {
  it('degraded fetch: useTitle exposes unwrapped data AND the coordinates, full stack', async () => {
    fetchMock.mockResolvedValue(
      redactedResponse(
        { title: { primaryTitle: 'The Godfather', rating: { averageRating: 9.2 } } },
        ['Rating.numVotes'],
      ),
    );

    const { result } = renderWithClient(() => useTitle('tt0068646'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data.title.rating.averageRating).toBe(9.2);
    expect(result.current.data.title.rating).not.toHaveProperty('numVotes');
    expect(result.current.deniedFields).toEqual(['Rating.numVotes']);
  });

  it('clean fetch: deniedFields is [] (empty, not undefined)', async () => {
    fetchMock.mockResolvedValue(
      graphqlResponse({ data: { name: { primaryName: 'Al Pacino' } } }),
    );
    const { result } = renderWithClient(() => useName('nm0000199'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.name.primaryName).toBe('Al Pacino');
    expect(result.current.deniedFields).toEqual([]);
  });

  it('disabled and pending states: deniedFields is already an array before any data exists', async () => {
    const disabled = renderWithClient(() => useTitle(undefined));
    expect(Array.isArray(disabled.result.current.deniedFields)).toBe(true);
    expect(disabled.result.current.deniedFields).toEqual([]);

    // Pending: fetch never resolves within this test.
    fetchMock.mockReturnValue(new Promise(() => {}));
    const pending = renderWithClient(() => useSearch({ query: 'godfather' }));
    expect(pending.result.current.isPending).toBe(true);
    expect(pending.result.current.deniedFields).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* AC 5 stand-in — the caching seam for live grant flips               */
/* ------------------------------------------------------------------ */

describe('denial-scoped staleTime (grant-flip caching seam, AC 5 stand-in)', () => {
  const HOUR = 60 * 60 * 1000;
  const FIVE_MINUTES = 5 * 60 * 1000;
  const degraded = { data: {}, deniedFields: ['Rating.numVotes'] };
  const clean = { data: {}, deniedFields: [] };

  it('function form: 60s iff the cached envelope reports denials, else the operation policy', () => {
    expect(DENIED_STALE_TIME).toBe(60_000);
    const entity = denialScopedStaleTime(HOUR);
    expect(entity({ state: { data: degraded } })).toBe(60_000);
    expect(entity({ state: { data: clean } })).toBe(HOUR);
    expect(entity({ state: { data: undefined } })).toBe(HOUR); // pre-data safe

    const search = denialScopedStaleTime(FIVE_MINUTES);
    expect(search({ state: { data: degraded } })).toBe(60_000);
    expect(search({ state: { data: clean } })).toBe(FIVE_MINUTES);
  });

  it('rendered hooks install the FUNCTION form so a degraded entry goes stale in 60s, not 1h/5m', async () => {
    // Fresh Response per call — a Response body can only be read once.
    fetchMock.mockImplementation(async () =>
      redactedResponse({ title: { rating: { averageRating: 9.2 } } }, ['Rating.numVotes']),
    );
    const title = renderWithClient(() => useTitle('tt0068646'));
    await waitFor(() => expect(title.result.current.isSuccess).toBe(true));

    const cached = title.queryClient.getQueryCache().getAll()[0];
    expect(typeof cached.options.staleTime).toBe('function');
    // Resolved against the REAL cached state (a degraded envelope): 60s.
    expect(cached.options.staleTime(cached)).toBe(60_000);

    // Same title hook, clean state: back to the 1h entity policy.
    expect(cached.options.staleTime({ state: { data: clean } })).toBe(HOUR);

    const search = renderWithClient(() => useSearch({ query: 'x' }));
    await waitFor(() => expect(search.result.current.isSuccess).toBe(true));
    const searchCached = search.queryClient.getQueryCache().getAll()[0];
    expect(searchCached.options.staleTime({ state: { data: clean } })).toBe(FIVE_MINUTES);
    expect(searchCached.options.staleTime({ state: { data: degraded } })).toBe(60_000);
  });
});

/* ------------------------------------------------------------------ */
/* AC 4 — RestrictedValue per DES-8                                    */
/* ------------------------------------------------------------------ */

describe('RestrictedValue per DES-8 (AC 4)', () => {
  const root = (container) => container.querySelector('.restricted-value');
  const tooltip = (container) => container.querySelector('.restricted-value__tooltip');

  it('inline variant (default): hatched pill + lock, coordinate only as data attribute, width hint honored', () => {
    const { container } = render(
      <RestrictedValue coordinate="Name.birthYear" label="Birth year" width="2.5em" />,
    );
    const el = root(container);
    expect(el).toHaveClass('restricted-value--inline');
    expect(el).toHaveAttribute('data-coordinate', 'Name.birthYear');
    expect(container.querySelector('.restricted-value__pill')).toHaveStyle({ width: '2.5em' });
    expect(container.querySelector('svg.restricted-value__lock')).toBeInTheDocument();
    // The coordinate is never user-visible copy.
    expect(screen.queryByText(/Name\.birthYear/)).not.toBeInTheDocument();
    // Inline has no RESTRICTED word.
    expect(container.querySelector('.restricted-value__word')).toBeNull();
  });

  it('line variant adds the aria-hidden small-caps RESTRICTED word', () => {
    const { container } = render(
      <RestrictedValue coordinate="Name.birthYear" label="Lifespan" variant="line" />,
    );
    expect(root(container)).toHaveClass('restricted-value--line');
    const word = container.querySelector('.restricted-value__word');
    expect(word).toHaveTextContent(/restricted/i);
    expect(word).toHaveAttribute('aria-hidden', 'true');
  });

  it('tooltip opens on HOVER with the DES-8 copy pattern and closes on unhover', () => {
    const { container } = render(
      <RestrictedValue coordinate="Rating.numVotes" label="Vote count" />,
    );
    expect(tooltip(container)).toBeNull(); // never opens on its own

    fireEvent.mouseOver(root(container));
    expect(tooltip(container)).toHaveTextContent(
      /Restricted.*Vote count is governed data this app hasn’t been granted\. If access is granted, it appears here automatically\./s,
    );
    expect(tooltip(container)).toHaveAttribute('aria-hidden', 'true');

    fireEvent.mouseOut(root(container));
    expect(tooltip(container)).toBeNull();
  });

  it('tooltip opens on KEYBOARD FOCUS too, and Esc dismisses it with focus retained', () => {
    const { container } = render(
      <RestrictedValue coordinate="Rating.numVotes" label="Vote count" />,
    );
    const el = root(container);
    expect(el).toHaveAttribute('tabindex', '0'); // in the tab order
    expect(el.tagName).not.toBe('BUTTON'); // not a button, never navigates

    act(() => el.focus());
    expect(tooltip(container)).not.toBeNull();

    fireEvent.keyDown(el, { key: 'Escape' });
    expect(tooltip(container)).toBeNull();
    expect(el).toHaveFocus();

    act(() => el.blur());
    expect(tooltip(container)).toBeNull();
  });

  it('screen readers get exactly "<Label>: restricted by data governance." while decoration is aria-hidden', () => {
    const { container } = render(
      <RestrictedValue coordinate="Rating.numVotes" label="Vote count" />,
    );
    const sr = screen.getByText('Vote count: restricted by data governance.');
    expect(sr).toHaveClass('restricted-value__sr');
    expect(sr).not.toHaveAttribute('aria-hidden');
    expect(container.querySelector('.restricted-value__pill')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('is STATIC: no animation in the rendered DOM and none in the styles.css section (skeleton discriminator)', () => {
    const { container } = render(
      <RestrictedValue coordinate="Rating.numVotes" label="Vote count" />,
    );
    for (const el of [root(container), ...root(container).querySelectorAll('*')]) {
      expect(el.style?.animation || '').toBe('');
      expect(el.style?.transition || '').toBe('');
      expect(String(el.className)).not.toMatch(/skeleton|shimmer|pulse|spin/i);
    }

    // jsdom does not apply stylesheets, so assert against the committed CSS:
    // the RestrictedValue section itself must declare no animation of any kind.
    const css = readFileSync(join(srcDir, 'styles.css'), 'utf8');
    const start = css.indexOf('RestrictedValue (IMDB-14 / DES-8)');
    const end = css.indexOf('end RestrictedValue');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const section = css.slice(start, end);
    expect(section).not.toMatch(/animation/i);
    expect(section).not.toMatch(/@keyframes/i);
    expect(section).not.toMatch(/transition/i);
  });

  it('isRestricted matches whole coordinates only — never substrings or bare field names', () => {
    expect(isRestricted(['Rating.numVotes'], 'Rating.numVotes')).toBe(true);
    expect(isRestricted(['Name.birthYear', 'Name.deathYear'], 'Name.deathYear')).toBe(true);
    expect(isRestricted(['Rating.numVotes'], 'numVotes')).toBe(false); // bare leaf
    expect(isRestricted(['Rating.numVotes'], 'Rating.num')).toBe(false); // prefix
    expect(isRestricted(['Rating.numVotesExtra'], 'Rating.numVotes')).toBe(false);
    expect(isRestricted([], 'Rating.numVotes')).toBe(false);
    expect(isRestricted(undefined, 'Rating.numVotes')).toBe(false);
    expect(isRestricted(null, 'Rating.numVotes')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* DES-8's confusion rule — restricted ≠ genuinely absent              */
/* ------------------------------------------------------------------ */

describe('the two-rule contract keeps "restricted" distinguishable from "genuinely absent" (DES-8, AC 4)', () => {
  /** A slot written exactly as DES-8 tells a view to write it. */
  function LifespanYear({ value, deniedFields }) {
    if (isRestricted(deniedFields, 'Name.birthYear')) {
      return <RestrictedValue coordinate="Name.birthYear" label="Birth year" width="2.5em" />;
    }
    if (value == null) return null; // rule 2: ordinary silent absence
    return <span data-testid="year">{value}</span>;
  }

  it('rule 1: coordinate denied → the redaction renders (a PRESENCE, with SR text)', () => {
    const { container } = render(
      <LifespanYear value={undefined} deniedFields={['Name.birthYear']} />,
    );
    expect(container.querySelector('.restricted-value')).not.toBeNull();
    expect(screen.getByText('Birth year: restricted by data governance.')).toBeInTheDocument();
  });

  it('rule 2: value null and NOT denied → nothing renders — the two states can never look alike', () => {
    const { container } = render(<LifespanYear value={null} deniedFields={[]} />);
    expect(container.querySelector('.restricted-value')).toBeNull();
    expect(container.textContent).toBe(''); // silent absence, no pill, no copy
  });

  it('granted: the real value renders with no pill (the demo\'s deny → grant swap)', () => {
    const { container } = render(<LifespanYear value={1940} deniedFields={[]} />);
    expect(screen.getByTestId('year')).toHaveTextContent('1940');
    expect(container.querySelector('.restricted-value')).toBeNull();
  });
});
