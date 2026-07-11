/**
 * GraphQL client boundary (IMDB-4).
 *
 * Per CLAUDE.md, this directory is the SPA's ONE sanctioned GraphQL surface:
 * all data comes from the cosmo federation router through this module. No
 * `fetch()` and no inline query strings inside components — ever.
 *
 * Components import the HOOKS (and, rarely, keys/staleTimes for cache
 * plumbing) — never the transport in client.js or the documents in
 * queries.js. main.jsx wires createQueryClient() into a QueryClientProvider.
 * Every failure surfaces as errors.js's normalized {kind, message, errors}.
 */
export { ERROR_KINDS, GraphQLLayerError } from './errors.js';
export {
  DEFAULT_PAGE_SIZE,
  useFacets,
  useName,
  useSearch,
  useSearchInfo,
  useSearchNames,
  useSearchTitles,
  useTitle,
} from './hooks.js';
export { queryKeys, staleTimes } from './keys.js';
export { createQueryClient } from './queryClient.js';
