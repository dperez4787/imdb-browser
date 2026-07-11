/**
 * Tester acceptance probes (IMDB-4) — written independently of the
 * developer's colocated suites, at the seams the acceptance criteria and the
 * live router's field-governance policy care about:
 *
 *   1. FIELD GOVERNANCE document-style guard (rewritten by IMDB-14): under
 *      redact mode documents may select governed fields optimistically, but
 *      a parent must never select ONLY governed leaves — see the describe
 *      block's history note.
 *   2. Credential attach, re-proved from the raw fetch call: exact header
 *      value, POST body carries the operation, router URL is the only
 *      destination.
 *   3. Signed-out guard: for every falsy token shape (null, undefined, ''),
 *      the promise rejects kind 'auth' and fetch is NEVER invoked.
 *   4. Each normalization branch exercised THROUGH execute() (transport
 *      included), not just via normalizeError() unit calls: 401→auth,
 *      403+PERMISSION_DENIED→denied (updated by IMDB-14; was 'auth' when
 *      this suite was written), reject→network, 5xx→network,
 *      BAD_REQUEST→bad-request, other→graphql.
 *   5. Query-key/variable lockstep: distinct variable sets can never collide
 *      in the cache, and builders are pure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getIdToken } from '../auth.js';
import { execute, routerUrl } from './client.js';
import { ERROR_KINDS, GraphQLLayerError } from './errors.js';
import { queryKeys } from './keys.js';
import * as queries from './queries.js';
import { SEARCH_INFO_QUERY, SEARCH_TITLES_QUERY } from './queries.js';

vi.mock('../auth.js', () => ({
  getIdToken: vi.fn(),
}));

/** JSON GraphQL HTTP response for the stubbed fetch. */
function graphqlResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('field governance: optimistic-select document style (guard updated by IMDB-14)', () => {
  // HISTORY: under the original reject mode (policy rev 7, IMDB-4) selecting
  // a governed field 403'd the whole operation, so this guard FORBADE
  // numVotes/birthYear/deathYear in committed documents. The router now runs
  // transparent redact mode (architecture § Field-level governance, verified
  // live 2026-07-11 at rev 8): documents MAY — and per the optimistic-select
  // policy SHOULD, where a view wants the value — select governed fields;
  // a denial comes back as HTTP 200 with the field absent and the coordinate
  // in extensions.governance.redactedFields. What remains mechanically
  // checkable is the document-style rule: a parent must never select ONLY
  // governed leaves (e.g. `rating` co-selects `averageRating` beside
  // `numVotes`), so a redaction degrades a field, never a whole object.
  const documents = Object.entries(queries).filter(([, v]) => typeof v === 'string');

  it('queries.js exports operation documents to scan', () => {
    // If exports stop being plain strings this guard would silently scan
    // nothing — fail loudly instead.
    expect(documents.length).toBeGreaterThanOrEqual(7);
  });

  it('every `rating` selection that includes governed numVotes co-selects ungoverned averageRating', () => {
    for (const [name, doc] of documents) {
      for (const match of doc.matchAll(/rating\s*\{([^}]*)\}/g)) {
        const leaves = match[1];
        if (/\bnumVotes\b/.test(leaves)) {
          expect(leaves, `${name}: rating{} must not select ONLY governed leaves`).toMatch(
            /\baverageRating\b/,
          );
        }
      }
    }
  });
});

describe('credential attach (raw fetch call inspected)', () => {
  it('sends exactly one POST to the router with Authorization: Bearer <token> and the operation in the body', async () => {
    getIdToken.mockResolvedValue('tester-token-abc.def.ghi');
    fetchMock.mockResolvedValue(
      graphqlResponse({ data: { searchInfo: { rebuiltAt: '2026-07-11T03:12:24.167Z' } } }),
    );

    await execute(SEARCH_INFO_QUERY);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(routerUrl());
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer tester-token-abc.def.ghi',
    );
    // The operation document itself travels in the body — no GET, no querystring.
    expect(String(init.body)).toContain('searchInfo');
  });

  it('passes variables through to the request body untouched', async () => {
    getIdToken.mockResolvedValue('tok');
    fetchMock.mockResolvedValue(
      graphqlResponse({ data: { searchTitles: { total: 0, totalIsCapped: false, items: [] } } }),
    );
    const variables = {
      filter: { query: 'godfather' },
      sort: 'POPULARITY_DESC',
      limit: 24,
      offset: 0,
    };

    await execute(SEARCH_TITLES_QUERY, variables);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.variables).toEqual(variables);
  });
});

describe('signed-out guard blocks the network for every falsy token', () => {
  for (const token of [null, undefined, '']) {
    it(`getIdToken() → ${JSON.stringify(token)}: rejects kind 'auth', fetch never called`, async () => {
      getIdToken.mockResolvedValue(token);

      const err = await execute(SEARCH_INFO_QUERY).catch((e) => e);

      expect(err).toBeInstanceOf(GraphQLLayerError);
      expect(err.kind).toBe('auth');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
});

describe('normalization branches through the real transport', () => {
  beforeEach(() => {
    getIdToken.mockResolvedValue('tok');
  });

  const cases = [
    {
      name: 'HTTP 401 (router rejects credential) → auth',
      arrange: () => fetchMock.mockResolvedValue(graphqlResponse({ errors: [] }, { status: 401 })),
      kind: 'auth',
    },
    {
      // IMDB-4 verified this arrives as HTTP 403 and (then) normalized it to
      // 'auth'; IMDB-14 gave governance denials their own kind so a
      // signed-in user's denial is never presented as a credential problem
      // (architecture § Field-level governance — 'denied' BEFORE the
      // HTTP-status rule). This case now asserts the settled contract.
      name: 'HTTP 403 PERMISSION_DENIED (live fieldAuth denial status) → denied, never auth (IMDB-14)',
      arrange: () =>
        fetchMock.mockResolvedValue(
          graphqlResponse(
            {
              errors: [
                {
                  message: "Unauthorized to access field 'numVotes' on type 'Rating'.",
                  extensions: { code: 'PERMISSION_DENIED', deniedFields: ['Rating.numVotes'] },
                },
              ],
            },
            { status: 403 },
          ),
        ),
      kind: 'denied',
    },
    {
      name: 'fetch rejection (offline/DNS) → network',
      arrange: () => fetchMock.mockRejectedValue(new TypeError('Failed to fetch')),
      kind: 'network',
    },
    {
      name: 'HTTP 503 with no GraphQL error list → network',
      arrange: () =>
        fetchMock.mockResolvedValue(
          new Response('upstream unavailable', { status: 503, headers: { 'content-type': 'text/plain' } }),
        ),
      kind: 'network',
    },
    {
      name: 'GraphQL BAD_REQUEST validation error → bad-request',
      arrange: () =>
        fetchMock.mockResolvedValue(
          graphqlResponse({
            data: null,
            errors: [{ message: 'limit must be <= 100', extensions: { code: 'BAD_REQUEST' } }],
          }),
        ),
      kind: 'bad-request',
    },
    {
      name: 'other GraphQL error → graphql',
      arrange: () =>
        fetchMock.mockResolvedValue(
          graphqlResponse({ data: null, errors: [{ message: 'boom' }] }),
        ),
      kind: 'graphql',
    },
  ];

  for (const { name, arrange, kind } of cases) {
    it(name, async () => {
      arrange();
      const err = await execute(SEARCH_INFO_QUERY).catch((e) => e);
      expect(err, 'execute() must reject').toBeInstanceOf(GraphQLLayerError);
      expect(err.kind).toBe(kind);
      // The documented shape, always: kind ∈ ERROR_KINDS, message, errors[].
      expect(ERROR_KINDS).toContain(err.kind);
      expect(typeof err.message).toBe('string');
      expect(Array.isArray(err.errors)).toBe(true);
    });
  }
});

describe('query keys: distinct variables can never collide in the cache', () => {
  it('different filters, pages, sorts and kinds all yield distinct keys', () => {
    const keys = [
      queryKeys.searchTitles({ filter: { query: 'a' }, sort: 'POPULARITY_DESC', limit: 24, offset: 0 }),
      queryKeys.searchTitles({ filter: { query: 'b' }, sort: 'POPULARITY_DESC', limit: 24, offset: 0 }),
      queryKeys.searchTitles({ filter: { query: 'a' }, sort: 'POPULARITY_DESC', limit: 24, offset: 24 }),
      queryKeys.searchTitles({ filter: { query: 'a' }, sort: 'RATING_DESC', limit: 24, offset: 0 }),
      queryKeys.search({ query: 'a', kinds: null, limit: 20 }),
      queryKeys.search({ query: 'a', kinds: ['TITLE'], limit: 20 }),
      queryKeys.title({ tconst: 'tt0068646' }),
      queryKeys.name({ nconst: 'nm0000199' }),
    ];
    const serialized = keys.map((k) => JSON.stringify(k));
    expect(new Set(serialized).size).toBe(keys.length);
  });

  it('builders are pure: same variables → deep-equal key', () => {
    const variables = { filter: { query: 'x' }, sort: 'POPULARITY_DESC', limit: 24, offset: 0 };
    expect(queryKeys.searchTitles(variables)).toEqual(queryKeys.searchTitles({ ...variables }));
  });
});
