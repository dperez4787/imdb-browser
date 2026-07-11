/**
 * Transport tests (IMDB-4 ACs): the credential attaches exactly as IMDB-3
 * decided (Authorization: Bearer <auth.js getIdToken()>), NO request leaves
 * while signed out, the endpoint honors VITE_ROUTER_URL, and every transport
 * failure resolves to the normalized error shape. Fakes at the two seams:
 * ./auth.js (mocked) and globalThis.fetch (stubbed) — never real Firebase,
 * never the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getIdToken } from '../auth.js';
import { execute, executeWithDenials, routerUrl } from './client.js';
import { GraphQLLayerError } from './errors.js';
import { SEARCH_INFO_QUERY } from './queries.js';

vi.mock('../auth.js', () => ({
  getIdToken: vi.fn(),
}));

const DEFAULT_URL = 'https://cosmo-router-dkuqnmldta-uc.a.run.app/graphql';

/** A minimal successful GraphQL HTTP response. */
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

describe('signed-out guard', () => {
  it('throws a normalized auth error and sends NOTHING when there is no user', async () => {
    getIdToken.mockResolvedValue(null);

    const err = await execute(SEARCH_INFO_QUERY).catch((e) => e);

    expect(err).toBeInstanceOf(GraphQLLayerError);
    expect(err.kind).toBe('auth');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Fix round on PR #13: a rejected token fetch used to escape rawExecute as
  // the raw exception — the one failure path outside the normalized shape.
  it('a REJECTED getIdToken() surfaces as the normalized "auth" kind, never a raw exception', async () => {
    getIdToken.mockRejectedValue(new Error('token refresh failed'));

    const err = await execute(SEARCH_INFO_QUERY).catch((e) => e);

    expect(err).toBeInstanceOf(GraphQLLayerError);
    expect(err.kind).toBe('auth');
    expect(err.kind).not.toBe('network'); // credential problem, not transport
    expect(err.message).toMatch(/token refresh failed/);
    expect(err.message).toMatch(/no request was sent/i);
    expect(fetchMock).not.toHaveBeenCalled(); // guard fired before any network
  });

  it('a rejected token fetch is normalized on the executeWithDenials path too', async () => {
    getIdToken.mockRejectedValue(new Error('boom'));

    const err = await executeWithDenials(SEARCH_INFO_QUERY).catch((e) => e);

    expect(err).toBeInstanceOf(GraphQLLayerError);
    expect(err.kind).toBe('auth');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an already-normalized error thrown by the token fetch passes through untouched (idempotent)', async () => {
    const original = new GraphQLLayerError('auth', 'already normalized');
    getIdToken.mockRejectedValue(original);

    const err = await execute(SEARCH_INFO_QUERY).catch((e) => e);

    expect(err).toBe(original);
  });
});

describe('credential attach', () => {
  it('POSTs to the router with Authorization: Bearer <getIdToken()>', async () => {
    getIdToken.mockResolvedValue('signed-in-id-token-123');
    fetchMock.mockResolvedValue(
      graphqlResponse({ data: { searchInfo: { rebuiltAt: '2026-07-11T03:12:24.167Z' } } }),
    );

    const data = await execute(SEARCH_INFO_QUERY);

    expect(data.searchInfo.rebuiltAt).toBe('2026-07-11T03:12:24.167Z');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(DEFAULT_URL);
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer signed-in-id-token-123');
  });

  it('fetches a token per request, so refreshed tokens attach automatically', async () => {
    getIdToken.mockResolvedValueOnce('token-1').mockResolvedValueOnce('token-2');
    // Fresh Response per call — a Response body can only be read once.
    fetchMock.mockImplementation(async () =>
      graphqlResponse({ data: { searchInfo: { rebuiltAt: null } } }),
    );

    await execute(SEARCH_INFO_QUERY);
    await execute(SEARCH_INFO_QUERY);

    const sent = fetchMock.mock.calls.map(([, init]) =>
      new Headers(init.headers).get('authorization'),
    );
    expect(sent).toEqual(['Bearer token-1', 'Bearer token-2']);
  });
});

describe('endpoint', () => {
  it('defaults to the cosmo router URL', () => {
    expect(routerUrl()).toBe(DEFAULT_URL);
  });

  it('honors the VITE_ROUTER_URL override per request', async () => {
    vi.stubEnv('VITE_ROUTER_URL', 'https://router.example.test/graphql');
    getIdToken.mockResolvedValue('tok');
    fetchMock.mockResolvedValue(graphqlResponse({ data: { searchInfo: { rebuiltAt: null } } }));

    await execute(SEARCH_INFO_QUERY);

    expect(String(fetchMock.mock.calls[0][0])).toBe('https://router.example.test/graphql');
  });
});

describe('failure normalization at the transport', () => {
  beforeEach(() => {
    getIdToken.mockResolvedValue('tok');
  });

  it('HTTP 401 from the router → kind "auth"', async () => {
    fetchMock.mockResolvedValue(graphqlResponse({ errors: [] }, { status: 401 }));
    const err = await execute(SEARCH_INFO_QUERY).catch((e) => e);
    expect(err.kind).toBe('auth');
  });

  it('fetch rejection (offline/DNS/CORS) → kind "network"', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await execute(SEARCH_INFO_QUERY).catch((e) => e);
    expect(err.kind).toBe('network');
  });

  it('GraphQL BAD_REQUEST validation error → kind "bad-request"', async () => {
    fetchMock.mockResolvedValue(
      graphqlResponse({
        data: null,
        errors: [{ message: 'offset must be <= 10000', extensions: { code: 'BAD_REQUEST' } }],
      }),
    );
    const err = await execute(SEARCH_INFO_QUERY).catch((e) => e);
    expect(err.kind).toBe('bad-request');
    expect(err.message).toBe('offset must be <= 10000');
  });

  it('any other GraphQL error → kind "graphql"', async () => {
    fetchMock.mockResolvedValue(
      graphqlResponse({ data: null, errors: [{ message: 'internal subgraph error' }] }),
    );
    const err = await execute(SEARCH_INFO_QUERY).catch((e) => e);
    expect(err.kind).toBe('graphql');
    expect(err.errors).toHaveLength(1);
  });
});

/* ---------------------------------------------------------------------- */
/* IMDB-14: field-level governance — transparent redact mode               */
/* (governance-platform notice on the ticket, verified live 2026-07-11:    */
/* HTTP 200, denied fields ABSENT from data, no errors array, signal in    */
/* extensions.governance.redactedFields)                                   */
/* ---------------------------------------------------------------------- */

/** The parsed operation body actually sent in fetch call N (0-based). */
function sentQuery(n) {
  return JSON.parse(fetchMock.mock.calls[n][1].body).query;
}

/** The live router's verified redact-mode 200 for the given coordinates. */
function redactedResponse(data, redactedFields, { revision = 8, roles = [] } = {}) {
  return graphqlResponse({
    data,
    extensions: { governance: { redactedFields, revision, roles } },
  });
}

describe('executeWithDenials (transparent redact mode)', () => {
  const GOVERNED_QUERY = `
    query Title($tconst: ID!) {
      title(tconst: $tconst) {
        primaryTitle
        rating { averageRating numVotes }
      }
    }`;

  beforeEach(() => {
    getIdToken.mockResolvedValue('tok');
  });

  it('clean execution resolves { data, deniedFields: [] } in one request', async () => {
    fetchMock.mockResolvedValue(
      graphqlResponse({ data: { title: { primaryTitle: 'The Godfather' } } }),
    );
    const result = await executeWithDenials(GOVERNED_QUERY, { tconst: 'tt0068646' });
    expect(result).toEqual({
      data: { title: { primaryTitle: 'The Godfather' } },
      deniedFields: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('redacted response: resolves the partial data + redactedFields as deniedFields — ONE round trip, no retry', async () => {
    // Verbatim live shape (2026-07-11, revision 8): numVotes is just gone.
    fetchMock.mockResolvedValue(
      redactedResponse(
        { title: { primaryTitle: 'The Godfather', rating: { averageRating: 9.2 } } },
        ['Rating.numVotes'],
      ),
    );

    const result = await executeWithDenials(GOVERNED_QUERY, { tconst: 'tt0068646' });

    // Ungoverned data reached the caller — one denied field blanked nothing…
    expect(result.data.title.primaryTitle).toBe('The Godfather');
    expect(result.data.title.rating.averageRating).toBe(9.2);
    expect(result.data.title.rating).not.toHaveProperty('numVotes');
    // …the view gets the coordinates for the two-rule contract…
    expect(result.deniedFields).toEqual(['Rating.numVotes']);
    // …and partial data cost exactly one request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('carries multiple redacted coordinates through unchanged', async () => {
    fetchMock.mockResolvedValue(
      redactedResponse({ name: { primaryName: 'Al Pacino' } }, [
        'Name.birthYear',
        'Name.deathYear',
        'Rating.numVotes',
      ]),
    );
    const { deniedFields } = await executeWithDenials(GOVERNED_QUERY, { tconst: 'tt1' });
    expect(deniedFields).toEqual(['Name.birthYear', 'Name.deathYear', 'Rating.numVotes']);
  });

  it('always sends the FULL optimistic document — the grant-detection mechanism', async () => {
    // Fetch 1: redacted. Fetch 2 (later, e.g. after a live grant): the same
    // full document goes out again, and the value simply comes back.
    fetchMock
      .mockResolvedValueOnce(
        redactedResponse({ title: { rating: { averageRating: 9.2 } } }, ['Rating.numVotes']),
      )
      .mockResolvedValueOnce(
        graphqlResponse({
          data: { title: { rating: { averageRating: 9.2, numVotes: 2100000 } } },
        }),
      );

    await executeWithDenials(GOVERNED_QUERY, { tconst: 'tt1' });
    const granted = await executeWithDenials(GOVERNED_QUERY, { tconst: 'tt1' });

    expect(sentQuery(0)).toMatch(/numVotes/);
    expect(sentQuery(1)).toMatch(/numVotes/); // full document, every fetch
    expect(granted).toEqual({
      data: { title: { rating: { averageRating: 9.2, numVotes: 2100000 } } },
      deniedFields: [],
    });
  });

  it('treats a governance extension with an empty redactedFields as clean', async () => {
    fetchMock.mockResolvedValue(redactedResponse({ title: {} }, [], { roles: ['analyst'] }));
    const { deniedFields } = await executeWithDenials(GOVERNED_QUERY, { tconst: 'tt1' });
    expect(deniedFields).toEqual([]);
  });

  it('ignores malformed governance extensions (no crash, clean result)', async () => {
    fetchMock.mockResolvedValue(
      graphqlResponse({ data: { title: {} }, extensions: { governance: { revision: 9 } } }),
    );
    const result = await executeWithDenials(GOVERNED_QUERY, { tconst: 'tt1' });
    expect(result.deniedFields).toEqual([]);
  });

  it('DEFENSIVE residual reject mode: a 403 PERMISSION_DENIED still surfaces as kind "denied", never "auth"', async () => {
    // The platform keeps the old whole-operation reject shape for
    // subscriptions/config fallback — if it ever reappears on queries it
    // must not read as a credential problem.
    fetchMock.mockResolvedValue(
      graphqlResponse(
        {
          errors: [
            {
              message: 'not authorized to read: Rating.numVotes',
              extensions: { code: 'PERMISSION_DENIED', deniedFields: ['Rating.numVotes'] },
            },
          ],
        },
        { status: 403 },
      ),
    );
    const err = await executeWithDenials(GOVERNED_QUERY, { tconst: 'tt1' }).catch((e) => e);
    expect(err).toBeInstanceOf(GraphQLLayerError);
    expect(err.kind).toBe('denied');
    expect(err.deniedFields).toEqual(['Rating.numVotes']);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry machinery
  });

  it('propagates non-governance failures untouched', async () => {
    fetchMock.mockResolvedValue(graphqlResponse({ errors: [] }, { status: 401 }));
    const err = await executeWithDenials(GOVERNED_QUERY, { tconst: 'tt1' }).catch((e) => e);
    expect(err.kind).toBe('auth');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('execute() (data-only form) is unaffected by governance extensions', async () => {
    fetchMock.mockResolvedValue(
      redactedResponse({ title: { primaryTitle: 'X' } }, ['Rating.numVotes']),
    );
    const data = await execute(GOVERNED_QUERY, { tconst: 'tt1' });
    expect(data).toEqual({ title: { primaryTitle: 'X' } });
  });
});
