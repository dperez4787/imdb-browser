/**
 * TanStack Query hooks (IMDB-4) — the ONLY GraphQL surface components import.
 * Each hook normalizes its variables once, then feeds the same object to the
 * query key and the request, so cache identity and what was actually asked
 * for can never drift apart. Errors reach callers as the normalized
 * {kind, message, errors} shape from errors.js.
 */
import { useQuery } from '@tanstack/react-query';

import { execute } from './client.js';
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

/** Index freshness (rebuiltAt + counts). */
export function useSearchInfo(options = {}) {
  return useQuery({
    queryKey: queryKeys.searchInfo(),
    queryFn: () => execute(SEARCH_INFO_QUERY),
    staleTime: staleTimes.searchInfo,
    ...options,
  });
}

/** Vocabulary facets for filter controls — never hard-code genre lists. */
export function useFacets(options = {}) {
  return useQuery({
    queryKey: queryKeys.facets(),
    queryFn: () => execute(FACETS_QUERY),
    staleTime: staleTimes.facets,
    ...options,
  });
}

/** One title, fully hydrated. Disabled until a tconst exists. */
export function useTitle(tconst, options = {}) {
  const variables = { tconst };
  return useQuery({
    queryKey: queryKeys.title(variables),
    queryFn: () => execute(TITLE_QUERY, variables),
    staleTime: staleTimes.title,
    enabled: Boolean(tconst),
    ...options,
  });
}

/** One person, with known-for titles and credits. Disabled until an nconst exists. */
export function useName(nconst, options = {}) {
  const variables = { nconst };
  return useQuery({
    queryKey: queryKeys.name(variables),
    queryFn: () => execute(NAME_QUERY, variables),
    staleTime: staleTimes.name,
    enabled: Boolean(nconst),
    ...options,
  });
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
  return useQuery({
    queryKey: queryKeys.searchTitles(variables),
    queryFn: () => execute(SEARCH_TITLES_QUERY, variables),
    staleTime: staleTimes.searchTitles,
    enabled: Boolean(filter),
    ...options,
  });
}

/** People search, same shape as useSearchTitles with a NameSearchFilter. */
export function useSearchNames(
  { filter, sort = 'POPULARITY_DESC', limit = DEFAULT_PAGE_SIZE, offset = 0 },
  options = {},
) {
  const variables = { filter, sort, limit, offset };
  return useQuery({
    queryKey: queryKeys.searchNames(variables),
    queryFn: () => execute(SEARCH_NAMES_QUERY, variables),
    staleTime: staleTimes.searchNames,
    enabled: Boolean(filter),
    ...options,
  });
}

/**
 * Universal mixed title+person search (popularity-ranked union). `kinds`
 * optionally narrows to ['TITLE'] / ['NAME']; omitted means both.
 */
export function useSearch({ query, kinds = null, limit = 20 }, options = {}) {
  const variables = { query, kinds, limit };
  return useQuery({
    queryKey: queryKeys.search(variables),
    queryFn: () => execute(SEARCH_QUERY, variables),
    staleTime: staleTimes.search,
    enabled: Boolean(query),
    ...options,
  });
}
