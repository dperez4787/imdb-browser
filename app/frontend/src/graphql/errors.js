/**
 * Error normalization for the GraphQL client layer (IMDB-4).
 *
 * Every failure that escapes this module — signed-out guard, HTTP transport,
 * router auth, GraphQL execution — surfaces to callers as ONE documented shape
 * (docs/architecture.md, "GraphQL client layer"):
 *
 *   {
 *     kind:    'auth' | 'network' | 'graphql' | 'bad-request',
 *     message: string,          // human-readable summary (first server message)
 *     errors:  Array<object>,   // raw GraphQL errors when present, else []
 *   }
 *
 * Mapping:
 *   - no signed-in user, HTTP 401/403            → 'auth'
 *   - fetch/transport failure, non-GraphQL HTTP  → 'network'
 *   - GraphQL errors with a BAD_REQUEST code
 *     (the orchestrator's validation errors:
 *     caps, exclusive fields, offset > 10000)    → 'bad-request'
 *   - any other GraphQL errors                   → 'graphql'
 *
 * Views branch on `kind` only — never on HTTP status or SDK error classes.
 *
 * Verified live (2026-07-10): the router currently WRAPS subgraph validation
 * errors — "Failed to fetch from Subgraph 'orchestrator'." with the real
 * message nested under extensions.errors[] and its code rewritten to
 * DOWNSTREAM_SERVICE_ERROR, so BAD_REQUEST does not reach the browser today
 * and such failures normalize to 'graphql' (flagged to the architect on the
 * IMDB-4 ticket). Normalization scans nested errors anyway, so enabling
 * subgraph error passthrough router-side lights 'bad-request' up with no
 * change here, and the nested (useful) message is surfaced either way.
 */

export const ERROR_KINDS = Object.freeze(['auth', 'network', 'graphql', 'bad-request']);

/**
 * The one error type this module throws. A real Error (stack, message) whose
 * `kind` and `errors` properties complete the documented shape.
 */
export class GraphQLLayerError extends Error {
  constructor(kind, message, errors = []) {
    super(message);
    this.name = 'GraphQLLayerError';
    this.kind = kind;
    this.errors = errors;
  }
}

/** The signed-out guard error: thrown before any network request is made. */
export function signedOutError() {
  return new GraphQLLayerError('auth', 'Not signed in — no request was sent to the router.');
}

/**
 * Normalize anything thrown by the transport (graphql-request's ClientError,
 * a fetch TypeError, an abort, …) into a GraphQLLayerError. Idempotent:
 * already-normalized errors pass through untouched.
 */
export function normalizeError(err) {
  if (err instanceof GraphQLLayerError) return err;

  // graphql-request's ClientError carries the parsed HTTP response. Detected
  // structurally (status + optional errors) so tests can fake the transport.
  const response = err?.response;
  if (response && typeof response.status === 'number') {
    if (response.status === 401 || response.status === 403) {
      return new GraphQLLayerError(
        'auth',
        `The router rejected the credential (HTTP ${response.status}).`,
        response.errors ?? [],
      );
    }

    const gqlErrors = response.errors ?? [];
    if (gqlErrors.length > 0) {
      // The router nests a subgraph's own errors under extensions.errors[];
      // scan both levels so the real cause (message, BAD_REQUEST code) wins
      // over the generic "Failed to fetch from Subgraph" wrapper.
      const flattened = gqlErrors.flatMap((e) => [e, ...(e?.extensions?.errors ?? [])]);
      const badRequest = flattened.find((e) => e?.extensions?.code === 'BAD_REQUEST');
      if (badRequest) {
        return new GraphQLLayerError('bad-request', badRequest.message, gqlErrors);
      }
      const nested = gqlErrors[0]?.extensions?.errors?.[0]?.message;
      return new GraphQLLayerError(
        'graphql',
        nested ?? gqlErrors[0]?.message ?? 'The router returned GraphQL errors.',
        gqlErrors,
      );
    }

    // HTTP failure with no GraphQL error list (5xx, HTML error page, …):
    // transport-level as far as views are concerned.
    return new GraphQLLayerError(
      'network',
      `The router request failed (HTTP ${response.status}).`,
    );
  }

  // fetch() rejection (DNS, offline, CORS, abort) or anything unrecognized.
  return new GraphQLLayerError(
    'network',
    err?.message ? `Could not reach the router: ${err.message}` : 'Could not reach the router.',
  );
}
