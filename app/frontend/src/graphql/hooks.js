/**
 * TanStack Query hooks (IMDB-4) — the ONLY GraphQL surface components import.
 * Each hook normalizes its variables once, then feeds the same object to the
 * query key and the request, so cache identity and what was actually asked
 * for can never drift apart. Errors reach callers as the normalized
 * {kind, message, errors} shape from errors.js.
 *
 * FIELD-LEVEL GOVERNANCE (IMDB-14): every queryFn goes through
 * client.js#executeWithDenials, so a cached result is the envelope
 * `{ data, deniedFields }` — coordinates the router's transparent redact
 * mode withheld are already absent from `data` and listed in `deniedFields`
 * (from extensions.governance.redactedFields; see client.js). Each hook
 * unwraps the
 * envelope and returns `deniedFields: string[]` (always an array) alongside
 * the usual query result, so views apply the two-rule contract — coordinate
 * in `deniedFields` → the shared restricted treatment; value null/absent and
 * NOT denied → the view's ordinary missing state — without ever parsing raw
 * GraphQL errors or `extensions` outside this directory.
 *
 * CACHING FOR DENIALS: a degraded result gets `staleTime` 60 s via TanStack
 * v5's function form (denialScopedStaleTime below); clean results keep the
 * standard per-operation policy from keys.js. This scopes the freshness cost
 * to exactly the cache entries a live grant flip can change: within 60 s of a
 * grant, the next mount/fetch re-sends the optimistic full document and
 * renders the real value — no redeploy, no code change.
 */
import { useQuery } from '@tanstack/react-query';

import { executeWithDenials } from './client.js';
import { queryKeys, staleTimes } from './keys.js';
import {
  FACETS_QUERY,
  NAME_QUERY,
  SEARCH_INFO_QUERY,
  SEARCH_NAMES_QUERY,
  SEARCH_QUERY,
  SEARCH_TITLES_QUERY,
  TITLE_QUERY,
} from './queries.js';

/** Page size shared by both paged searches (fixed at 24 in v1 per the URL scheme). */
export const DEFAULT_PAGE_SIZE = 24;

/** staleTime for any result with a non-empty deniedFields (ms) — see module docs. */
export const DENIED_STALE_TIME = 60_000;

/**
 * Function-form staleTime: 60 s while the cached envelope reports denied
 * coordinates, the operation's normal staleTime otherwise.
 */
export function denialScopedStaleTime(normalStaleTime) {
  return (query) =>
    query.state.data?.deniedFields?.length ? DENIED_STALE_TIME : normalStaleTime;
}

/**
 * The one useQuery wrapper every hook goes through: queryFn resolves the
 * {data, deniedFields} envelope, staleTime is denial-scoped, and the returned
 * result unwraps the envelope (`data` is the operation data, `deniedFields`
 * is always an array — empty until a fetch reports denials).
 */
function useGraphQuery({ queryKey, document, variables, staleTime, enabled = true }, options) {
  const query = useQuery({
    queryKey,
    queryFn: () => executeWithDenials(document, variables),
    staleTime: denialScopedStaleTime(staleTime),
    enabled,
    ...options,
  });
  return {
    ...query,
    data: query.data?.data,
    deniedFields: query.data?.deniedFields ?? [],
  };
}

/** Index freshness (rebuiltAt + counts). */
export function useSearchInfo(options = {}) {
  return useGraphQuery(
    {
      queryKey: queryKeys.searchInfo(),
      document: SEARCH_INFO_QUERY,
      staleTime: staleTimes.searchInfo,
    },
    options,
  );
}

/** Vocabulary facets for filter controls — never hard-code genre lists. */
export function useFacets(options = {}) {
  return useGraphQuery(
    {
      queryKey: queryKeys.facets(),
      document: FACETS_QUERY,
      staleTime: staleTimes.facets,
    },
    options,
  );
}

/** One title, fully hydrated. Disabled until a tconst exists. */
export function useTitle(tconst, options = {}) {
  const variables = { tconst };
  return useGraphQuery(
    {
      queryKey: queryKeys.title(variables),
      document: TITLE_QUERY,
      variables,
      staleTime: staleTimes.title,
      enabled: Boolean(tconst),
    },
    options,
  );
}

/** One person, with known-for titles and credits. Disabled until an nconst exists. */
export function useName(nconst, options = {}) {
  const variables = { nconst };
  return useGraphQuery(
    {
      queryKey: queryKeys.name(variables),
      document: NAME_QUERY,
      variables,
      staleTime: staleTimes.name,
      enabled: Boolean(nconst),
    },
    options,
  );
}

/**
 * Faceted title search. `filter` is a TitleSearchFilter object (see
 * queries.js); sort/limit/offset default here — explicitly, so the key
 * embeds the effective values.
 */
export function useSearchTitles(
  { filter, sort = 'POPULARITY_DESC', limit = DEFAULT_PAGE_SIZE, offset = 0 },
  options = {},
) {
  const variables = { filter, sort, limit, offset };
  return useGraphQuery(
    {
      queryKey: queryKeys.searchTitles(variables),
      document: SEARCH_TITLES_QUERY,
      variables,
      staleTime: staleTimes.searchTitles,
      enabled: Boolean(filter),
    },
    options,
  );
}

/** People search, same shape as useSearchTitles with a NameSearchFilter. */
export function useSearchNames(
  { filter, sort = 'POPULARITY_DESC', limit = DEFAULT_PAGE_SIZE, offset = 0 },
  options = {},
) {
  const variables = { filter, sort, limit, offset };
  return useGraphQuery(
    {
      queryKey: queryKeys.searchNames(variables),
      document: SEARCH_NAMES_QUERY,
      variables,
      staleTime: staleTimes.searchNames,
      enabled: Boolean(filter),
    },
    options,
  );
}

/**
 * Universal mixed title+person search (popularity-ranked union). `kinds`
 * optionally narrows to ['TITLE'] / ['NAME']; omitted means both.
 */
export function useSearch({ query, kinds = null, limit = 20 }, options = {}) {
  const variables = { query, kinds, limit };
  return useGraphQuery(
    {
      queryKey: queryKeys.search(variables),
      document: SEARCH_QUERY,
      variables,
      staleTime: staleTimes.search,
      enabled: Boolean(query),
    },
    options,
  );
}
