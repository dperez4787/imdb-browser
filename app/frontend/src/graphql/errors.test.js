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

  it('only ever produces the four documented kinds', () => {
    const samples = [
      clientError({ status: 401 }),
      clientError({ status: 500 }),
      clientError({ status: 200, errors: [{ message: 'x' }] }),
      new TypeError('Failed to fetch'),
      undefined,
      'a string, even',
    ];
    for (const s of samples) {
      expect(ERROR_KINDS).toContain(normalizeError(s).kind);
    }
  });
});

describe('signedOutError', () => {
  it('is an auth-kind error that names the guarantee: no request was sent', () => {
    const e = signedOutError();
    expect(e.kind).toBe('auth');
    expect(e.message).toMatch(/no request was sent/i);
  });
});
