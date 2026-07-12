/**
 * usePersonDetail (IMDB-8) — the person detail page's one data hook (DES-5),
 * mirroring titleHooks.js exactly: components import THIS, never the
 * transport or the document. The pre-IMDB-8 `useName` in hooks.js remains
 * as-is (its document predates the governance amendment and does not select
 * the governed years); this hook supersedes it for the detail page under its
 * own cache key, so the two documents can never collide in the cache.
 *
 * GOVERNANCE (IMDB-14): the queryFn is client.js#executeWithDenials — the
 * cached value is the `{ data, deniedFields }` envelope, the hook unwraps it
 * and returns `deniedFields` (always an array) alongside the usual result.
 * Verified live 2026-07-12: the router runs transparent redact mode, so the
 * optimistic select of `Name.birthYear`/`Name.deathYear` resolves in ONE
 * round trip — the page renders with the years redacted and the lifespan
 * line shows DES-8's treatment; no fallback document, no retry (architecture
 * § Field-level governance explicitly retires denial-derived documents).
 * Should the router ever be flipped back to reject mode (a config fallback
 * outside this repo), errors.js normalizes that 403 to kind 'denied' and the
 * page degrades to its designed ErrorState — never a blank page.
 *
 * staleTime is denial-scoped: min(60 s, 1 h) while any coordinate is
 * redacted, the normal 1 h entity policy otherwise — so a live grant flip at
 * the governance console reaches a mounted page within a minute of the next
 * fetch, with no redeploy (docs/architecture.md § Field-level governance,
 * "caching: denial-scoped staleTime").
 */
import { useQuery } from '@tanstack/react-query';

import { executeWithDenials } from './client.js';
import { denialScopedStaleTime } from './hooks.js';
import { staleTimes } from './keys.js';
import { PERSON_DETAIL_QUERY } from './personQueries.js';

/** Key builder, same convention as keys.js (full variable set embedded). */
export function personDetailKey(nconst) {
  return ['personDetail', { nconst }];
}

/**
 * One person, fully hydrated for the detail page (identity header with the
 * governed lifespan years, known-for titles in dataset order, curated
 * credits for the filmography). Disabled until an nconst exists.
 *
 * @param {string} nconst  IMDb name id, e.g. 'nm0000199'
 * @returns TanStack query result (data unwrapped from the envelope) +
 *   { deniedFields }
 */
export function usePersonDetail(nconst, options = {}) {
  const variables = { nconst };
  const result = useQuery({
    queryKey: personDetailKey(nconst),
    queryFn: () => executeWithDenials(PERSON_DETAIL_QUERY, variables),
    enabled: Boolean(nconst),
    ...options,
    // After the spread, so no option object can bypass the denial cap (the
    // same rule hooks.js enforces for its hooks).
    staleTime: denialScopedStaleTime(options.staleTime ?? staleTimes.name),
  });
  return {
    ...result,
    data: result.data?.data,
    deniedFields: result.data?.deniedFields ?? [],
  };
}
