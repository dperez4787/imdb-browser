/**
 * rolesStore (IMDB-17, DES-1 addendum): the governance role signal folded from
 * every router response's transport headers. Covers the three meaningfully
 * distinct states (null / [] / [...]), revision parsing, live changes between
 * responses, subscriber notification, and reset — the AC's "roles present,
 * absent, changing".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getGovernanceRoles,
  ingestResponse,
  resetGovernanceRoles,
  subscribeGovernanceRoles,
} from './rolesStore.js';

/** A router response's headers, as graphql-request's rawRequest surfaces them. */
function headers(map) {
  return new Headers(map);
}

afterEach(() => {
  resetGovernanceRoles();
});

describe('rolesStore', () => {
  it('starts Unknown — no response observed yet (roles null, revision null)', () => {
    expect(getGovernanceRoles()).toEqual({ roles: null, revision: null });
  });

  it('X-Imdb-Roles present → its values in header order, with the policy revision', () => {
    ingestResponse(headers({ 'X-Imdb-Roles': 'analyst,public', 'X-Imdb-Policy-Revision': '12' }));
    expect(getGovernanceRoles()).toEqual({ roles: ['analyst', 'public'], revision: 12 });
  });

  it('X-Imdb-Roles ABSENT → no roles ([]), still distinct from Unknown (null)', () => {
    ingestResponse(headers({ 'X-Imdb-Policy-Revision': '12' }));
    // A response arrived: [] (this caller has no roles), never null.
    expect(getGovernanceRoles()).toEqual({ roles: [], revision: 12 });
  });

  it('trims and drops empty entries in a multi-role header', () => {
    ingestResponse(headers({ 'X-Imdb-Roles': ' analyst , , public ', 'X-Imdb-Policy-Revision': '3' }));
    expect(getGovernanceRoles().roles).toEqual(['analyst', 'public']);
  });

  it('reflects roles CHANGING between responses (grant, then re-deny)', () => {
    ingestResponse(headers({ 'X-Imdb-Policy-Revision': '12' }));
    expect(getGovernanceRoles().roles).toEqual([]); // no roles

    // A grant lands at the console; the next response carries the header.
    ingestResponse(headers({ 'X-Imdb-Roles': 'analyst', 'X-Imdb-Policy-Revision': '13' }));
    expect(getGovernanceRoles()).toEqual({ roles: ['analyst'], revision: 13 });

    // Re-denied: the header drops off the next response again.
    ingestResponse(headers({ 'X-Imdb-Policy-Revision': '14' }));
    expect(getGovernanceRoles()).toEqual({ roles: [], revision: 14 });
  });

  it('notifies subscribers on a real change, not on an identical re-ingest', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGovernanceRoles(listener);

    ingestResponse(headers({ 'X-Imdb-Roles': 'analyst', 'X-Imdb-Policy-Revision': '12' }));
    expect(listener).toHaveBeenCalledTimes(1);

    // Same roles AND same revision → no notification (useSyncExternalStore must
    // not loop; the snapshot reference is stable).
    const before = getGovernanceRoles();
    ingestResponse(headers({ 'X-Imdb-Roles': 'analyst', 'X-Imdb-Policy-Revision': '12' }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getGovernanceRoles()).toBe(before);

    // Revision alone ticking (same roles) is still a change — the menu shows it.
    ingestResponse(headers({ 'X-Imdb-Roles': 'analyst', 'X-Imdb-Policy-Revision': '13' }));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    ingestResponse(headers({ 'X-Imdb-Policy-Revision': '14' }));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('falls back to extensions.governance.revision when the header is missing', () => {
    ingestResponse(headers({ 'X-Imdb-Roles': 'analyst' }), { governance: { revision: 9 } });
    expect(getGovernanceRoles().revision).toBe(9);
  });

  it('leaves revision null when neither header nor extension carries one', () => {
    ingestResponse(headers({ 'X-Imdb-Roles': 'analyst' }));
    expect(getGovernanceRoles().revision).toBe(null);
  });

  it('accepts a plain-object headers map (case-insensitive), not only a Headers instance', () => {
    ingestResponse({ 'x-imdb-roles': 'analyst', 'x-imdb-policy-revision': '7' });
    expect(getGovernanceRoles()).toEqual({ roles: ['analyst'], revision: 7 });
  });

  it('reset returns to Unknown for a fresh session', () => {
    ingestResponse(headers({ 'X-Imdb-Roles': 'analyst', 'X-Imdb-Policy-Revision': '12' }));
    resetGovernanceRoles();
    expect(getGovernanceRoles()).toEqual({ roles: null, revision: null });
  });
});
