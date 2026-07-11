/**
 * Query keys + caching policy (IMDB-4), per docs/architecture.md
 * ("GraphQL client layer"):
 *
 *   - keys embed the FULL variable set, so shareable URLs and cache entries
 *     stay in lockstep (['searchTitles', {filter, sort, limit, offset}]);
 *   - staleTime 1h for facets/searchInfo and title/name entities
 *     (data changes only on index rebuilds), 5m for search results;
 *   - refetchOnWindowFocus is off globally (see queryClient.js).
 *
 * The hooks in hooks.js pass the SAME normalized variables object to the key
 * builder and to the request — never build keys by hand in components.
 */

const HOUR = 60 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;

/** staleTime per operation (ms). */
export const staleTimes = Object.freeze({
  searchInfo: HOUR,
  facets: HOUR,
  title: HOUR,
  name: HOUR,
  searchTitles: FIVE_MINUTES,
  searchNames: FIVE_MINUTES,
  search: FIVE_MINUTES,
});

/** Key builders — one per operation in queries.js. */
export const queryKeys = Object.freeze({
  searchInfo: () => ['searchInfo'],
  facets: () => ['facets'],
  title: (variables) => ['title', variables],
  name: (variables) => ['name', variables],
  searchTitles: (variables) => ['searchTitles', variables],
  searchNames: (variables) => ['searchNames', variables],
  search: (variables) => ['search', variables],
});
