/**
 * GraphQL transport (IMDB-4) — the SPA's ONLY network path to data.
 *
 * Talks exclusively to the cosmo federation router. Per
 * docs/architecture.md ("Router authentication from the browser"):
 * every request carries `Authorization: Bearer <Firebase ID token>` from
 * auth.js#getIdToken(), and NO request is attempted while signed out — the
 * guard throws a normalized `auth` error before any network activity.
 * AuthGate makes the signed-out case unreachable in practice; the guard here
 * makes it structural.
 *
 * FIELD-LEVEL GOVERNANCE (IMDB-14): operation documents select governed
 * fields optimistically. Since the router's switch to TRANSPARENT REDACT
 * MODE (governance-platform notice on the IMDB-14 ticket, verified live
 * 2026-07-11, policy revision 8), an operation selecting a denied field
 * succeeds with HTTP 200: the denied fields are simply ABSENT from `data`
 * (alias-aware, per-element in lists), there is no `errors` array, and the
 * machine-readable signal is the top-level response extension
 * `extensions.governance.redactedFields` (`Type.field` coordinates).
 * `executeWithDenials` reads that extension and resolves
 * `{ data, deniedFields }` in ONE round trip — no retry needed. The full
 * optimistic document goes out on every fetch, so a live grant flip shows up
 * on the very next fetch with no code change: the value reappears in `data`
 * and drops out of `redactedFields`.
 *
 * The pre-redact REJECT mode (whole-operation HTTP 403 + PERMISSION_DENIED
 * + extensions.deniedFields, the shape IMDB-4 verified) still exists on the
 * platform for subscriptions and as a config fallback; errors.js keeps
 * normalizing it to kind 'denied' defensively, but it is no longer the
 * primary path and no retry machinery hangs off it.
 *
 * NOTE: docs/architecture.md § Field-level governance still describes the
 * old strip-and-retry contract; an architect amendment is pending (flagged
 * on the IMDB-14 ticket/PR).
 *
 * Components never import this file — they use the hooks/keys in hooks.js.
 */
import { GraphQLClient } from 'graphql-request';

import { getIdToken } from '../auth.js';
import { normalizeError, signedOutError } from './errors.js';

const DEFAULT_ROUTER_URL = 'https://cosmo-router-dkuqnmldta-uc.a.run.app/graphql';

/**
 * The router endpoint, overridable via VITE_ROUTER_URL (linear-example's
 * VITE_ override pattern). Read per call so tests can stub the env.
 */
export function routerUrl() {
  return import.meta.env?.VITE_ROUTER_URL || DEFAULT_ROUTER_URL;
}

/**
 * Guarded raw execution: signed-out guard, per-request credential, and the
 * FULL GraphQL response (data + extensions) — `request()` would discard the
 * extensions that carry the governance signal, so this uses `rawRequest()`.
 *
 * @returns {Promise<{data: object, extensions: object|undefined}>}
 */
async function rawExecute(document, variables) {
  const token = await getIdToken();
  if (!token) throw signedOutError();

  try {
    const client = new GraphQLClient(routerUrl(), {
      headers: { authorization: `Bearer ${token}` },
    });
    const { data, extensions } = await client.rawRequest(document, variables);
    return { data, extensions };
  } catch (err) {
    throw normalizeError(err);
  }
}

/**
 * Execute one GraphQL operation against the router.
 *
 * @param {string} document  an operation document from queries.js
 * @param {object} [variables]
 * @returns {Promise<object>} the operation's `data`
 * @throws {import('./errors.js').GraphQLLayerError} normalized
 *   {kind, message, errors} on every failure path (see errors.js)
 */
export async function execute(document, variables) {
  const { data } = await rawExecute(document, variables);
  return data;
}

/**
 * Execute with the governance contract (IMDB-14) — what every query hook
 * calls. One request; resolves `{ data, deniedFields }` where `deniedFields`
 * is `extensions.governance.redactedFields` (always an array — empty when
 * nothing was redacted). Redacted coordinates are already absent from `data`
 * (the router removed them), so views apply the two-rule contract off
 * `deniedFields` alone and no caller ever parses raw errors or extensions.
 *
 * Failures — including a residual reject-mode denial, normalized to kind
 * 'denied' by errors.js — propagate untouched.
 *
 * @param {string} document  an operation document from queries.js
 * @param {object} [variables]
 * @returns {Promise<{data: object, deniedFields: string[]}>}
 */
export async function executeWithDenials(document, variables) {
  const { data, extensions } = await rawExecute(document, variables);
  const redacted = extensions?.governance?.redactedFields;
  return { data, deniedFields: Array.isArray(redacted) ? redacted : [] };
}
