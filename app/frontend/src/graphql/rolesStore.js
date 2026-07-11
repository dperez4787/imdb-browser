/**
 * Governance role signal (IMDB-17, DES-1 addendum) — the caller's resolved
 * roles + policy revision, lifted ABOVE the route tree.
 *
 * The router reports the signed-in user's governance roles on EVERY response
 * (architecture § "Roles for the UI"): the `X-Imdb-Roles` header (present only
 * when the caller has ≥ 1 role, CORS-exposed) and `x-imdb-policy-revision`
 * (always present). This module is the ONLY place outside the transport that
 * turns those raw headers into state — client.js calls `ingestResponse()` from
 * the success path of every request, and the TopBar's RoleBadge / UserMenu read
 * `useGovernanceRoles()`. No component outside `src/graphql/` reads raw headers
 * (the IMDB-17 AC / IMDB-14 boundary rule).
 *
 * Why a module-level store (like searchTextStore) and not context: the signal
 * updates from transport deep inside a query, not from React state, and exactly
 * one answer exists per session. useSyncExternalStore fans it out to every
 * subscriber.
 *
 * The three states are meaningfully distinct (DES-1 addendum):
 *   - roles === null  → no router response observed yet this session (Unknown;
 *                       the badge slot is empty — showing "no data role" would
 *                       be a guess).
 *   - roles === []    → a response arrived with `X-Imdb-Roles` ABSENT — the
 *                       live contract for "this caller has no roles".
 *   - roles === [...] → the header's values, in header order.
 * revision is the numeric `x-imdb-policy-revision`, or null while Unknown.
 */
import { useSyncExternalStore } from 'react';

const ROLES_HEADER = 'x-imdb-roles';
const REVISION_HEADER = 'x-imdb-policy-revision';

/** @type {{ roles: string[] | null, revision: number | null }} */
let state = { roles: null, revision: null };
const listeners = new Set();

/** Read a header off a `Headers` instance or a plain object, case-insensitively. */
function readHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return null;
}

/** Header ABSENT → no roles ([]); present → its comma-separated values in order. */
function parseRoles(headers) {
  const raw = readHeader(headers, ROLES_HEADER);
  if (raw == null) return [];
  return String(raw)
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);
}

/** `x-imdb-policy-revision` → number; falls back to extensions.governance.revision. */
function parseRevision(headers, extensions) {
  const raw = readHeader(headers, REVISION_HEADER);
  const fromHeader = Number.parseInt(raw ?? '', 10);
  if (Number.isFinite(fromHeader)) return fromHeader;
  const fromExt = extensions?.governance?.revision;
  return typeof fromExt === 'number' ? fromExt : null;
}

function sameRoles(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  return a.length === b.length && a.every((role, i) => role === b[i]);
}

function commit(next) {
  if (sameRoles(next.roles, state.roles) && next.revision === state.revision) return;
  state = next;
  for (const listener of [...listeners]) listener();
}

/**
 * Fold a router response's transport metadata into the role signal. Called by
 * client.js on every resolved response; last response wins (policy flips move
 * at poll-interval scale, so ordering races are immaterial). Never throws — a
 * response with no governance headers simply resolves to the no-roles state.
 *
 * @param {Headers|object} headers  the response headers (Headers instance in prod)
 * @param {object} [extensions]     the response `extensions` (revision fallback)
 */
export function ingestResponse(headers, extensions) {
  commit({ roles: parseRoles(headers), revision: parseRevision(headers, extensions) });
}

/** Back to Unknown — used on sign-out (a new session starts blank) and by tests. */
export function resetGovernanceRoles() {
  commit({ roles: null, revision: null });
}

/** Stable snapshot for useSyncExternalStore (same reference until a real change). */
export function getGovernanceRoles() {
  return state;
}

export function subscribeGovernanceRoles(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * `{ roles, revision }` — the current signal, re-rendering on every change.
 * `roles` is `null` (Unknown), `[]` (no roles), or the header's values.
 */
export function useGovernanceRoles() {
  return useSyncExternalStore(subscribeGovernanceRoles, getGovernanceRoles);
}
