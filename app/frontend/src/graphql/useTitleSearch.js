/**
 * useTitleSearch (IMDB-6) — the faceted view's one results+facets data hook.
 *
 * NEW file by design (the round's file partition owns IMDB-6's graphql
 * additions here and in titleSearchQueries.js and forbids editing the shared
 * hooks.js/keys.js). Same conventions as hooks.js: components import THIS,
 * never the transport or the document.
 *
 * One request per settled filter/sort/page change carries BOTH the result
 * cards and the rail's contextual facet counts (DES-3). Transport is the
 * denial-aware executeWithDenials, so the envelope is `{ data, deniedFields }`:
 * the hook unwraps `data`, surfaces `deniedFields` (always an array), and
 * denial-scopes staleTime (min(60 s, 5 m) while `Rating.numVotes` is redacted)
 * so a live grant flip reaches the grid within a minute of the next fetch.
 *
 * `placeholderData: keepPreviousData` keeps the prior page/filter's cards on
 * screen while the next query is in flight — that IS DES-3's "previous results
 * stay dimmed to 50% under a 2px amber progress bar until fresh data lands"
 * loading state (callers read `isPlaceholderData` / `isFetching` for the bar).
 *
 * The facet sub-selection's `dimensions`/`perDimension` are constants, not
 * user state, so they are NOT part of the cache key (the key embeds the same
 * {filter, sort, limit, offset} set the request varies on); the hook injects
 * them into the request variables.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { executeWithDenials } from './client.js';
import { denialScopedStaleTime } from './hooks.js';
import { staleTimes } from './keys.js';
import { FACETED_TITLE_SEARCH_QUERY } from './titleSearchQueries.js';

/** DES-3: the rail's two live vocabularies, and the perDimension that covers both. */
export const FACET_DIMENSIONS = Object.freeze(['GENRES', 'TITLE_TYPES']);
export const FACET_PER_DIMENSION = 50;

/** Key builder — distinct lineage from queries.js's card-only searchTitles. */
export function titleSearchKey(variables) {
  return ['facetedTitleSearch', variables];
}

/**
 * @param {{filter: object, sort: string, limit: number, offset: number}} variables
 *   the user-driven request variables (built by titles/urlState.buildVariables)
 * @returns TanStack query result with `data` unwrapped and `deniedFields`
 */
export function useTitleSearch(variables, options = {}) {
  const result = useQuery({
    queryKey: titleSearchKey(variables),
    queryFn: () =>
      executeWithDenials(FACETED_TITLE_SEARCH_QUERY, {
        ...variables,
        facetDimensions: FACET_DIMENSIONS,
        facetPerDimension: FACET_PER_DIMENSION,
      }),
    staleTime: denialScopedStaleTime(staleTimes.searchTitles),
    placeholderData: keepPreviousData,
    ...options,
  });
  return {
    ...result,
    data: result.data?.data,
    deniedFields: result.data?.deniedFields ?? [],
  };
}
