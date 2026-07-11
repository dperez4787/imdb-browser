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
import { execute, routerUrl } from './client.js';
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
