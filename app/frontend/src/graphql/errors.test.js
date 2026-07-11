/**
 * Error normalization (IMDB-4 AC: "Router/network/GraphQL errors surface to
 * callers in one documented, normalized shape"). Each branch of the mapping
 * table in errors.js, driven by transport-shaped fakes.
 */
import { describe, expect, it } from 'vitest';

import { ERROR_KINDS, GraphQLLayerError, normalizeError, signedOutError } from './errors.js';

/** Shape a graphql-request ClientError-alike: `.response` with status/errors. */
function clientError({ status, errors }) {
  const err = new Error(errors?.[0]?.message ?? `HTTP ${status}`);
  err.response = { status, errors };
  return err;
}

describe('normalizeError', () => {
  it('maps HTTP 401 to kind "auth"', () => {
    const e = normalizeError(clientError({ status: 401 }));
    expect(e).toBeInstanceOf(GraphQLLayerError);
    expect(e.kind).toBe('auth');
    expect(e.message).toMatch(/401/);
    expect(e.errors).toEqual([]);
  });

  it('maps HTTP 403 to kind "auth"', () => {
    expect(normalizeError(clientError({ status: 403 })).kind).toBe('auth');
  });

  it('maps a fetch/transport failure to kind "network"', () => {
    const e = normalizeError(new TypeError('Failed to fetch'));
    expect(e.kind).toBe('network');
    expect(e.message).toMatch(/Failed to fetch/);
    expect(e.errors).toEqual([]);
  });

  it('maps an HTTP failure with no GraphQL error list (5xx) to kind "network"', () => {
    const e = normalizeError(clientError({ status: 502 }));
    expect(e.kind).toBe('network');
    expect(e.message).toMatch(/502/);
  });

  it('maps GraphQL errors carrying a BAD_REQUEST code to kind "bad-request"', () => {
    const errors = [
      { message: 'something else', extensions: { code: 'OTHER' } },
      { message: 'offset must be <= 10000', extensions: { code: 'BAD_REQUEST' } },
    ];
    const e = normalizeError(clientError({ status: 200, errors }));
    expect(e.kind).toBe('bad-request');
    // The BAD_REQUEST message wins (it names the caller's mistake) …
    expect(e.message).toBe('offset must be <= 10000');
    // … but the full raw error list is preserved.
    expect(e.errors).toEqual(errors);
  });

  it('maps any other GraphQL errors to kind "graphql"', () => {
    const errors = [{ message: 'Cannot query field "nope" on type "Query"' }];
    const e = normalizeError(clientError({ status: 200, errors }));
    expect(e.kind).toBe('graphql');
    expect(e.message).toBe('Cannot query field "nope" on type "Query"');
    expect(e.errors).toEqual(errors);
  });

  it('finds BAD_REQUEST nested under the router\'s subgraph-error wrapper', () => {
    // Shape ready for router-side subgraph error passthrough; today the
    // nested code is DOWNSTREAM_SERVICE_ERROR (next test).
    const errors = [
      {
        message: "Failed to fetch from Subgraph 'orchestrator'.",
        extensions: {
          serviceName: 'orchestrator',
          errors: [
            { message: 'offset must be <= 10000', extensions: { code: 'BAD_REQUEST' } },
          ],
        },
      },
    ];
    const e = normalizeError(clientError({ status: 200, errors }));
    expect(e.kind).toBe('bad-request');
    expect(e.message).toBe('offset must be <= 10000');
    expect(e.errors).toEqual(errors);
  });

  it('surfaces the nested subgraph message on wrapped errors (live router shape, 2026-07-10)', () => {
    const errors = [
      {
        message: "Failed to fetch from Subgraph 'orchestrator'.",
        extensions: {
          serviceName: 'orchestrator',
          errors: [
            {
              message: 'query and titlePrefix are mutually exclusive',
              path: ['searchTitles'],
              extensions: { code: 'DOWNSTREAM_SERVICE_ERROR' },
            },
          ],
        },
      },
    ];
    const e = normalizeError(clientError({ status: 200, errors }));
    expect(e.kind).toBe('graphql');
    expect(e.message).toBe('query and titlePrefix are mutually exclusive');
  });

  it('passes an already-normalized error through unchanged (idempotent)', () => {
    const original = signedOutError();
    expect(normalizeError(original)).toBe(original);
  });

  it('only ever produces the five documented kinds', () => {
    const samples = [
      clientError({ status: 401 }),
      clientError({ status: 500 }),
      clientError({ status: 200, errors: [{ message: 'x' }] }),
      clientError({
        status: 403,
        errors: [{ message: 'no', extensions: { code: 'PERMISSION_DENIED', deniedFields: ['A.b'] } }],
      }),
      new TypeError('Failed to fetch'),
      undefined,
      'a string, even',
    ];
    for (const s of samples) {
      expect(ERROR_KINDS).toContain(normalizeError(s).kind);
    }
  });
});

describe('field-level governance → kind "denied" (IMDB-14)', () => {
  /** The live router's verified denial shape (2026-07-10): HTTP 403, one
   *  aggregated PERMISSION_DENIED error, extensions.deniedFields. */
  function denialError(deniedFields, { status = 403 } = {}) {
    return clientError({
      status,
      errors: [
        {
          message: `not authorized to read: ${deniedFields.join(', ')}`,
          extensions: { code: 'PERMISSION_DENIED', deniedFields },
        },
      ],
    });
  }

  it('normalizes PERMISSION_DENIED to kind "denied" carrying the coordinates', () => {
    const e = normalizeError(denialError(['Rating.numVotes']));
    expect(e).toBeInstanceOf(GraphQLLayerError);
    expect(e.kind).toBe('denied');
    expect(e.deniedFields).toEqual(['Rating.numVotes']);
    expect(e.message).toMatch(/not authorized to read/);
    expect(e.errors).toHaveLength(1);
  });

  it('ORDERING: a 403 with the PERMISSION_DENIED marker is "denied", never "auth"', () => {
    // A signed-in user's governance denial arrives as HTTP 403 — the exact
    // status the HTTP rule maps to 'auth'. The governance rule must win, or
    // the UI would point the user at a useless re-login.
    const e = normalizeError(denialError(['Name.birthYear'], { status: 403 }));
    expect(e.kind).toBe('denied');
    expect(e.kind).not.toBe('auth');
  });

  it('ORDERING: a 403 WITHOUT the marker still maps to "auth" (kind reserved for credentials)', () => {
    expect(normalizeError(clientError({ status: 403 })).kind).toBe('auth');
    expect(
      normalizeError(clientError({ status: 403, errors: [{ message: 'forbidden' }] })).kind,
    ).toBe('auth');
  });

  it('carries every coordinate of the live aggregated multi-field shape', () => {
    const e = normalizeError(
      denialError(['Name.birthYear', 'Name.deathYear', 'Rating.numVotes']),
    );
    expect(e.deniedFields).toEqual(['Name.birthYear', 'Name.deathYear', 'Rating.numVotes']);
  });

  it('unions deniedFields across MULTIPLE errors, deduplicated (defensive against a one-error-per-field shape)', () => {
    const errors = [
      { message: 'a', extensions: { code: 'PERMISSION_DENIED', deniedFields: ['Rating.numVotes'] } },
      { message: 'b', extensions: { code: 'PERMISSION_DENIED', deniedFields: ['Name.birthYear'] } },
      { message: 'c', extensions: { code: 'PERMISSION_DENIED', deniedFields: ['Name.birthYear', 'Name.deathYear'] } },
    ];
    const e = normalizeError(clientError({ status: 403, errors }));
    expect(e.kind).toBe('denied');
    expect(e.deniedFields).toEqual(['Rating.numVotes', 'Name.birthYear', 'Name.deathYear']);
    expect(e.errors).toEqual(errors);
  });

  it('finds PERMISSION_DENIED nested under the router\'s subgraph-error wrapper', () => {
    const errors = [
      {
        message: "Failed to fetch from Subgraph 'ratings'.",
        extensions: {
          errors: [
            {
              message: 'not authorized to read: Rating.numVotes',
              extensions: { code: 'PERMISSION_DENIED', deniedFields: ['Rating.numVotes'] },
            },
          ],
        },
      },
    ];
    const e = normalizeError(clientError({ status: 200, errors }));
    expect(e.kind).toBe('denied');
    expect(e.deniedFields).toEqual(['Rating.numVotes']);
  });

  it('wins over the status rule at ANY status, and never misfires without the code', () => {
    // Denial marker on a 200 (router evolution) → still 'denied'.
    expect(normalizeError(denialError(['Rating.numVotes'], { status: 200 })).kind).toBe('denied');
    // Other codes never produce 'denied'.
    const e = normalizeError(
      clientError({ status: 200, errors: [{ message: 'x', extensions: { code: 'BAD_REQUEST' } }] }),
    );
    expect(e.kind).toBe('bad-request');
  });
});

describe('signedOutError', () => {
  it('is an auth-kind error that names the guarantee: no request was sent', () => {
    const e = signedOutError();
    expect(e.kind).toBe('auth');
    expect(e.message).toMatch(/no request was sent/i);
  });
});
