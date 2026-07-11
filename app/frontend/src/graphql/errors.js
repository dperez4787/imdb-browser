/**
 * Error normalization for the GraphQL client layer (IMDB-4).
 *
 * Every failure that escapes this module — signed-out guard, HTTP transport,
 * router auth, GraphQL execution — surfaces to callers as ONE documented shape
 * (docs/architecture.md, "GraphQL client layer"):
 *
 *   {
 *     kind:    'auth' | 'denied' | 'network' | 'graphql' | 'bad-request',
 *     message: string,          // human-readable summary (first server message)
 *     errors:  Array<object>,   // raw GraphQL errors when present, else []
 *     deniedFields: string[],   // 'denied' only: Type.field coordinates
 *   }
 *
 * Mapping — ORDER MATTERS for the first two rows (IMDB-14):
 *   - any GraphQL error with extensions.code
 *     PERMISSION_DENIED (field-level governance;
 *     arrives as HTTP 403 — see below)           → 'denied'
 *   - no signed-in user, HTTP 401/403            → 'auth'
 *   - fetch/transport failure, non-GraphQL HTTP  → 'network'
 *   - GraphQL errors with a BAD_REQUEST code
 *     (the orchestrator's validation errors:
 *     caps, exclusive fields, offset > 10000)    → 'bad-request'
 *   - any other GraphQL errors                   → 'graphql'
 *
 * GOVERNANCE DENIALS — a DEFENSIVE branch since the router's switch to
 * transparent redact mode (governance-platform notice on the IMDB-14 ticket,
 * verified live 2026-07-11): queries selecting a denied field now succeed
 * with HTTP 200, the field absent from `data` and the signal in
 * `extensions.governance.redactedFields` (handled in client.js, never here).
 * The platform keeps the old REJECT shape for subscriptions and as a config
 * fallback: whole-operation HTTP 403, no `data`, one GraphQL error carrying
 * extensions.code=PERMISSION_DENIED and extensions.deniedFields=["Type.field",
 * …] (the shape IMDB-4 verified live 2026-07-10). If it ever reaches the
 * browser, that 403 would hit the HTTP-status rule and read as a credential
 * problem — pointing a signed-in user at a useless re-login — so the
 * PERMISSION_DENIED check runs FIRST. `deniedFields` is unioned across all
 * errors: observed as one aggregated error, but the union is defensive
 * against a one-error-per-field shape. `auth` stays reserved for 401/403
 * WITHOUT the PERMISSION_DENIED marker.
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

export const ERROR_KINDS = Object.freeze(['auth', 'denied', 'network', 'graphql', 'bad-request']);

/**
 * The one error type this module throws. A real Error (stack, message) whose
 * `kind`, `errors`, and `deniedFields` properties complete the documented
 * shape. `deniedFields` is only populated for kind 'denied'; it is always an
 * array so callers never null-check it.
 */
export class GraphQLLayerError extends Error {
  constructor(kind, message, errors = [], deniedFields = []) {
    super(message);
    this.name = 'GraphQLLayerError';
    this.kind = kind;
    this.errors = errors;
    this.deniedFields = deniedFields;
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
    // Field-level governance FIRST (before the HTTP-status rule): the router
    // delivers PERMISSION_DENIED as a 403, which must never read as 'auth'.
    const denied = collectDenied(response.errors ?? []);
    if (denied) return denied;

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

/**
 * Build the 'denied' error if any GraphQL error (top level or nested under
 * the router's extensions.errors wrapper) carries PERMISSION_DENIED; else
 * null. `deniedFields` is the deduplicated union across ALL matching errors —
 * live the router sends one aggregated error, so the union is defensive.
 */
function collectDenied(gqlErrors) {
  const flattened = gqlErrors.flatMap((e) => [e, ...(e?.extensions?.errors ?? [])]);
  const matches = flattened.filter((e) => e?.extensions?.code === 'PERMISSION_DENIED');
  if (matches.length === 0) return null;

  const deniedFields = [...new Set(matches.flatMap((e) => e.extensions?.deniedFields ?? []))];
  return new GraphQLLayerError(
    'denied',
    matches[0].message ?? 'Field-level governance denied part of this query.',
    gqlErrors,
    deniedFields,
  );
}
