/**
 * useUniversalSearch (IMDB-5) — the omnibox's one data hook (DES-2).
 *
 * NEW file by design (IMDB-14 owned the pre-existing src/graphql/ files the
 * round this shipped); same conventions as hooks.js: components import THIS,
 * never the transport or the document.
 *
 * Owns the DES-2 debounce: the raw input value is debounced 250ms here, and
 * the query is enabled only at >= 2 characters, so a keystroke burst settles
 * into exactly ONE router request (TanStack's cache dedupes repeats of the
 * same settled query within staleTime).
 *
 * GOVERNANCE (IMDB-14): the queryFn is client.js#executeWithDenials, the same
 * denial-aware path every hook in hooks.js takes — the cached value is the
 * `{ data, deniedFields }` envelope, the hook unwraps it and returns
 * `deniedFields` (always an array) alongside the usual result, and staleTime
 * is denial-scoped (min(60 s, 5 m) while `Rating.numVotes` is redacted), so
 * a live grant flip reaches the panel within a minute of the next settled
 * keystroke.
 *
 * `placeholderData` keeps the previous rows on screen while a new query is in
 * flight (DES-2's "previous rows stay, amber progress bar" loading state) —
 * but ONLY within the same query lineage (one string extends the other:
 * typing forward or backspacing). An unrelated query (cleared then retyped,
 * select-all-retype) starts from DES-2's first-open skeleton instead of
 * resurrecting rows that never matched it. Callers read `isPlaceholderData` /
 * `isFetching` for the bar and `isPending` for the skeletons.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { executeWithDenials } from './client.js';
import { denialScopedStaleTime } from './hooks.js';
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
 * Same lineage = one query extends the other (typing forward, backspacing).
 * Placeholder rows may bridge those; anything else is a different search and
 * must not inherit rows it never matched. Exported for tests.
 */
export function isSameQueryLineage(previousQ, nextQ) {
  if (!previousQ || !nextQ) return false;
  return nextQ.startsWith(previousQ) || previousQ.startsWith(nextQ);
}

/**
 * Debounced universal search: union hits (server order), the two prefix-fill
 * aliases, and searchInfo freshness — one document, one request per settled
 * keystroke burst, through the denial-aware transport.
 *
 * @param {string} rawQuery the live input value (undebounced)
 * @returns TanStack query result (data unwrapped from the envelope) +
 *   { deniedFields, debouncedQuery, enabled }
 */
export function useUniversalSearch(rawQuery, options = {}) {
  const q = useDebouncedValue(String(rawQuery ?? '').trim());
  const enabled = q.length >= MIN_QUERY_LENGTH;
  const result = useQuery({
    queryKey: universalSearchKey(q),
    queryFn: () => executeWithDenials(UNIVERSAL_SEARCH_QUERY, { q }),
    staleTime: denialScopedStaleTime(staleTimes.search),
    enabled,
    placeholderData: (previousData, previousQuery) => {
      const previousQ = previousQuery?.queryKey?.[1]?.q;
      return isSameQueryLineage(previousQ, q) ? previousData : undefined;
    },
    ...options,
  });
  return {
    ...result,
    data: result.data?.data,
    deniedFields: result.data?.deniedFields ?? [],
    debouncedQuery: q,
    enabled,
  };
}
