/**
 * useTitleEpisodes (IMDB-20) — the one data hook behind both episode
 * surfaces: the title page's season-grouped "Episodes" section (limit 60,
 * "Load more" paging) and the /titles grid's episodes popover (limit 12,
 * lazily enabled on first open). NEW file by the same partition rule as
 * titleHooks.js/personHooks.js: components import THIS, never the transport
 * or the document.
 *
 * Paging: `Title.episodes` exposes NO total count (verified live
 * 2026-07-12), so this is an offset-paged useInfiniteQuery whose end signal
 * is a short page — `getNextPageParam` returns undefined exactly when the
 * last page came back shorter than `limit`, which makes TanStack's
 * `hasNextPage` the "render the Load more button" boolean with no extra
 * bookkeeping. A FULL last page therefore offers one more fetch that may
 * come back empty; that empty page simply flattens to nothing.
 *
 * Caching: the key embeds { tconst, limit } (offset is the page param), so
 * the section's 60-page lineage and the popover's 12-page lineage never
 * collide. staleTime is the standard 1 h entity policy — episode lists
 * change only on index rebuilds. The denial-scoped staleTime cap is NOT
 * wired here on purpose: it reads the flat { data, deniedFields } envelope,
 * whereas an infinite query caches { pages, pageParams } — and this document
 * selects no governed coordinate (see episodeQueries.js), so there is no
 * denial to scope. `deniedFields` is still returned (unioned across pages)
 * to honor the hooks contract, so a future governed field surfaces without
 * a caller change.
 */
import { useInfiniteQuery } from '@tanstack/react-query';

import { executeWithDenials } from './client.js';
import { TITLE_EPISODES_QUERY } from './episodeQueries.js';
import { staleTimes } from './keys.js';

/** Page size for the title page's Episodes section. */
export const EPISODES_PAGE_SIZE = 60;

/** Page size for the grid popover's peek list. */
export const EPISODES_PEEK_SIZE = 12;

/** Key builder, same convention as keys.js (variables embedded; offset is the page param). */
export function titleEpisodesKey(tconst, limit) {
  return ['titleEpisodes', { tconst, limit }];
}

/**
 * The episodes of one series, offset-paged.
 *
 * @param {string} tconst  IMDb title id of the (presumed) series
 * @param {object} [options]
 * @param {number}  [options.limit=60]   page size (60 section / 12 popover)
 * @param {boolean} [options.enabled=true]  gate for lazy consumers (the
 *   popover passes false until first open, so no fetch happens for cards
 *   whose popover is never opened)
 * @returns TanStack infinite-query result plus:
 *   - episodes: Title[] flattened across loaded pages (always an array)
 *   - deniedFields: string[] unioned across pages (always an array)
 *   `hasNextPage` is true exactly when the last page was full.
 */
export function useTitleEpisodes(tconst, { limit = EPISODES_PAGE_SIZE, enabled = true } = {}) {
  const result = useInfiniteQuery({
    queryKey: titleEpisodesKey(tconst, limit),
    queryFn: ({ pageParam }) =>
      executeWithDenials(TITLE_EPISODES_QUERY, { tconst, limit, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const page = lastPage.data?.title?.episodes ?? [];
      return page.length < limit ? undefined : lastPageParam + limit;
    },
    enabled: Boolean(tconst) && enabled,
    staleTime: staleTimes.title,
  });

  const pages = result.data?.pages ?? [];
  return {
    ...result,
    episodes: pages.flatMap((page) => page.data?.title?.episodes ?? []),
    deniedFields: [...new Set(pages.flatMap((page) => page.deniedFields ?? []))],
  };
}
