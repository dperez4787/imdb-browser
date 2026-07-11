/**
 * useTitleDetail (IMDB-7) — the title detail page's one data hook (DES-4).
 *
 * NEW file by design (IMDB-6 owns edits to the pre-existing src/graphql/
 * files this round); same conventions as hooks.js: components import THIS,
 * never the transport or the document. The pre-IMDB-7 `useTitle` in hooks.js
 * remains as-is (its document predates the governance amendment and does not
 * select `numVotes`); this hook supersedes it for the detail page under its
 * own cache key, so the two documents can never collide in the cache.
 *
 * GOVERNANCE (IMDB-14): the queryFn is client.js#executeWithDenials — the
 * cached value is the `{ data, deniedFields }` envelope, the hook unwraps it
 * and returns `deniedFields` (always an array) alongside the usual result.
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
import { TITLE_DETAIL_QUERY } from './titleQueries.js';

/** Key builder, same convention as keys.js (full variable set embedded). */
export function titleDetailKey(tconst) {
  return ['titleDetail', { tconst }];
}

/**
 * One title, fully hydrated for the detail page (header facts, rating with
 * the governed vote count, principals for the credit groups, episode
 * context). Disabled until a tconst exists.
 *
 * @param {string} tconst  IMDb title id, e.g. 'tt0068646'
 * @returns TanStack query result (data unwrapped from the envelope) +
 *   { deniedFields }
 */
export function useTitleDetail(tconst, options = {}) {
  const variables = { tconst };
  const result = useQuery({
    queryKey: titleDetailKey(tconst),
    queryFn: () => executeWithDenials(TITLE_DETAIL_QUERY, variables),
    enabled: Boolean(tconst),
    ...options,
    // After the spread, so no option object can bypass the denial cap (the
    // same rule hooks.js enforces for its hooks).
    staleTime: denialScopedStaleTime(options.staleTime ?? staleTimes.title),
  });
  return {
    ...result,
    data: result.data?.data,
    deniedFields: result.data?.deniedFields ?? [],
  };
}
