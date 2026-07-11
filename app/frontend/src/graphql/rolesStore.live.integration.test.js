// @vitest-environment node
/**
 * LIVE governance-role signal (IMDB-17 AC) — SKIPPED unless LIVE_ROUTER_TOKEN
 * is set, so `npm test` stays hermetic on a clean checkout. Run it:
 *
 *   LIVE_ROUTER_TOKEN="$(gcloud auth print-identity-token)" npm test
 *
 * Drives the REAL client module (client.js → rolesStore.ingestResponse) against
 * the live cosmo router; the only substituted seam is auth.js#getIdToken(),
 * which returns the supplied Google OIDC identity token (an accepted JWKS
 * provider per IMDB-3). The token's identity maps to NO persona, so the router
 * omits X-Imdb-Roles and the store must land on the no-roles state ([]) with a
 * numeric policy revision — the exact state the badge renders as "no data role".
 *
 * The roles-PRESENT path is seam-tested only (rolesStore.test.js / the client
 * mock tests): the verifying identity cannot be granted a persona from here, so
 * that live check is deferred per the user directive.
 */
import { describe, expect, it, vi } from 'vitest';

import { execute } from './client.js';
import { SEARCH_INFO_QUERY } from './queries.js';
import { getGovernanceRoles, resetGovernanceRoles } from './rolesStore.js';

const TOKEN = process.env.LIVE_ROUTER_TOKEN;

vi.mock('../auth.js', () => ({
  getIdToken: vi.fn(async () => process.env.LIVE_ROUTER_TOKEN),
}));

describe.skipIf(!TOKEN)('IMDB-17 live: role signal surfaced from a real router response', () => {
  it('no-persona identity → store lands on no-roles ([]) with a numeric policy revision', async () => {
    resetGovernanceRoles();
    expect(getGovernanceRoles()).toEqual({ roles: null, revision: null }); // Unknown before any fetch

    // Any query works — the badge piggybacks on responses views already make.
    await execute(SEARCH_INFO_QUERY);

    const { roles, revision } = getGovernanceRoles();
    // X-Imdb-Roles absent for this identity → no roles, distinct from Unknown.
    expect(roles).toEqual([]);
    // x-imdb-policy-revision accompanies every response.
    expect(typeof revision).toBe('number');
    expect(revision).toBeGreaterThan(0);
  }, 30000);
});
