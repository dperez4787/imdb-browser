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
 * Execute one GraphQL operation against the router.
 *
 * @param {string} document  an operation document from queries.js
 * @param {object} [variables]
 * @returns {Promise<object>} the operation's `data`
 * @throws {import('./errors.js').GraphQLLayerError} normalized
 *   {kind, message, errors} on every failure path (see errors.js)
 */
export async function execute(document, variables) {
  const token = await getIdToken();
  if (!token) throw signedOutError();

  try {
    const client = new GraphQLClient(routerUrl(), {
      headers: { authorization: `Bearer ${token}` },
    });
    return await client.request(document, variables);
  } catch (err) {
    throw normalizeError(err);
  }
}
