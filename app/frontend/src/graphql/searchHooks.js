/**
 * useUniversalSearch (IMDB-5) — the omnibox's one data hook (DES-2).
 *
 * NEW file by design (IMDB-14 owns the pre-existing src/graphql/ files this
 * round); same conventions as hooks.js: components import THIS, never the
 * transport or the document.
 *
 * Owns the DES-2 debounce: the raw input value is debounced 250ms here, and
 * the query is enabled only at >= 2 characters, so a keystroke burst settles
 * into exactly ONE router request (TanStack's cache dedupes repeats of the
 * same settled query within staleTime). `placeholderData` keeps the previous
 * rows on screen while a new query is in flight (DES-2's "previous rows stay,
 * amber progress bar" loading state); callers read `isPlaceholderData` /
 * `isFetching` for that bar and `isPending` for the first-load skeletons.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { execute } from './client.js';
import { staleTimes } from './keys.js';
import { UNIVERSAL_SEARCH_QUERY } from './searchQueries.js';

/** DES-2 "Behavior": autocomplete debounce, and its >= 2-character trigger. */
export const AUTOCOMPLETE_DEBOUNCE_MS = 250;
export const MIN_QUERY_LENGTH = 2;
/** DES-2 panel cap: max 8 rows, and at most 8 OMDb requests per panel. */
export const PANEL_ROW_LIMIT = 8;

/** Trailing-edge debounce of a changing value. */
export function useDebouncedValue(value, delayMs = AUTOCOMPLETE_DEBOUNCE_MS) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Key builder, same convention as keys.js (full variable set embedded). */
export function universalSearchKey(q) {
  return ['universalSearch', { q }];
}

/**
 * Debounced universal search: union hits (server order), the two prefix-fill
 * aliases, and searchInfo freshness — one document, one request per settled
 * keystroke burst.
 *
 * @param {string} rawQuery the live input value (undebounced)
 * @returns TanStack query result + { debouncedQuery, enabled }
 */
export function useUniversalSearch(rawQuery, options = {}) {
  const q = useDebouncedValue(String(rawQuery ?? '').trim());
  const enabled = q.length >= MIN_QUERY_LENGTH;
  const result = useQuery({
    queryKey: universalSearchKey(q),
    queryFn: () => execute(UNIVERSAL_SEARCH_QUERY, { q }),
    staleTime: staleTimes.search,
    enabled,
    placeholderData: (previousData) => previousData,
    ...options,
  });
  return { ...result, debouncedQuery: q, enabled };
}
