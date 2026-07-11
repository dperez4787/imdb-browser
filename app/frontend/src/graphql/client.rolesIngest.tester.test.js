/**
 * IMDB-17 tester acceptance — the client → rolesStore wiring, HERMETIC.
 *
 * The developer's rolesStore.test.js drives the store directly and the live
 * integration test is skipped without LIVE_ROUTER_TOKEN, so on a clean
 * checkout nothing proved that client.js actually calls ingestResponse off a
 * resolved response. These tests stub globalThis.fetch (same seam as
 * client.test.js) and assert:
 *
 *   1. a response WITH X-Imdb-Roles lands the store on the roles, in order,
 *      with the revision — via execute(), no badge-only request (AC 1);
 *   2. a response WITHOUT the header lands on [] (no roles), never null —
 *      the honesty rule at the transport seam (AC 2);
 *   3. the client.js touch is ADDITIVE: execute() still resolves bare data,
 *      executeWithDenials() still resolves { data, deniedFields }, and a
 *      transport failure still normalizes to GraphQLLayerError while leaving
 *      the store exactly as it was (a failed response is not a role signal).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getIdToken } from '../auth.js';
import { execute, executeWithDenials } from './client.js';
import { GraphQLLayerError } from './errors.js';
import { SEARCH_INFO_QUERY } from './queries.js';
import { getGovernanceRoles, resetGovernanceRoles } from './rolesStore.js';

vi.mock('../auth.js', () => ({
  getIdToken: vi.fn(),
}));

/** A successful GraphQL HTTP response carrying governance headers. */
function graphqlResponse(body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  getIdToken.mockResolvedValue('id-token-abc');
  resetGovernanceRoles();
});

afterEach(() => {
  resetGovernanceRoles();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('IMDB-17: client.js feeds the role signal off every resolved response', () => {
  it('X-Imdb-Roles on the response → store holds the roles in header order + revision (no extra request)', async () => {
    fetchMock.mockResolvedValue(
      graphqlResponse(
        { data: { __typename: 'Query' } },
        { 'X-Imdb-Roles': 'analyst,public', 'X-Imdb-Policy-Revision': '12' },
      ),
    );

    const data = await execute(SEARCH_INFO_QUERY);

    expect(getGovernanceRoles()).toEqual({ roles: ['analyst', 'public'], revision: 12 });
    // Piggybacked: exactly the one query's fetch, nothing badge-only.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Additive: execute() still resolves the operation's bare data.
    expect(data).toEqual({ __typename: 'Query' });
  });

  it('header ABSENT on the response → store holds [] (no roles), distinct from Unknown', async () => {
    fetchMock.mockResolvedValue(
      graphqlResponse({ data: { __typename: 'Query' } }, { 'X-Imdb-Policy-Revision': '8' }),
    );

    await execute(SEARCH_INFO_QUERY);

    expect(getGovernanceRoles()).toEqual({ roles: [], revision: 8 });
  });

  it('roles changing between two responses flip the store — grant then re-deny (AC 3 seam)', async () => {
    fetchMock.mockResolvedValueOnce(
      graphqlResponse({ data: {} }, { 'X-Imdb-Policy-Revision': '8' }),
    );
    await execute(SEARCH_INFO_QUERY);
    expect(getGovernanceRoles().roles).toEqual([]);

    fetchMock.mockResolvedValueOnce(
      graphqlResponse({ data: {} }, { 'X-Imdb-Roles': 'analyst', 'X-Imdb-Policy-Revision': '9' }),
    );
    await execute(SEARCH_INFO_QUERY);
    expect(getGovernanceRoles()).toEqual({ roles: ['analyst'], revision: 9 });
  });

  it('executeWithDenials keeps its { data, deniedFields } shape AND feeds the store', async () => {
    fetchMock.mockResolvedValue(
      graphqlResponse(
        {
          data: { rating: {} },
          extensions: { governance: { redactedFields: ['Rating.averageRating'], roles: [], revision: 8 } },
        },
        { 'X-Imdb-Policy-Revision': '8' },
      ),
    );

    const result = await executeWithDenials(SEARCH_INFO_QUERY);

    // IMDB-14 contract untouched by the IMDB-17 change.
    expect(result).toEqual({ data: { rating: {} }, deniedFields: ['Rating.averageRating'] });
    expect(getGovernanceRoles()).toEqual({ roles: [], revision: 8 });
  });

  it('a transport failure still normalizes (error contract untouched) and does NOT move the store', async () => {
    // Establish a known state first — a later failure must not corrupt it.
    fetchMock.mockResolvedValueOnce(
      graphqlResponse({ data: {} }, { 'X-Imdb-Roles': 'analyst', 'X-Imdb-Policy-Revision': '8' }),
    );
    await execute(SEARCH_INFO_QUERY);
    const before = getGovernanceRoles();

    fetchMock.mockRejectedValueOnce(new TypeError('network down'));
    const err = await execute(SEARCH_INFO_QUERY).catch((e) => e);

    expect(err).toBeInstanceOf(GraphQLLayerError);
    expect(getGovernanceRoles()).toBe(before); // same snapshot reference — untouched
  });

  it('signed out: no request, no ingest — the store stays Unknown', async () => {
    getIdToken.mockResolvedValue(null);

    await execute(SEARCH_INFO_QUERY).catch(() => {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getGovernanceRoles()).toEqual({ roles: null, revision: null });
  });
});
