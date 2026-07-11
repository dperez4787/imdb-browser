/**
 * The omnibox's query text, lifted ABOVE the route tree (IMDB-5, DES-2:
 * "Selecting a result records nothing and clears nothing: the query text
 * stays, so Back-then-refocus resumes where the user was").
 *
 * Per-instance useState dies with its route (the hero omnibox unmounts when
 * HomePage does), so the text lives in this module-level store instead —
 * every Omnibox instance (hero on `/`, compact in the TopBar) reads and
 * writes the SAME text via useSyncExternalStore. Deliberately not a router
 * concern and not context: there is exactly one omnibox text in the product,
 * it must survive route changes, and nothing else belongs in the store.
 *
 * /search?q= is the one route where the URL is authoritative for the text;
 * SearchPage hydrates the store from the param (deep links arrive with an
 * empty store).
 */
import { useSyncExternalStore } from 'react';

let text = '';
const listeners = new Set();

export function getSearchText() {
  return text;
}

export function setSearchText(next) {
  const value = String(next ?? '');
  if (value === text) return;
  text = value;
  for (const listener of [...listeners]) listener();
}

export function subscribeSearchText(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** [text, setText] — same tuple shape as useState, shared across instances. */
export function useSearchText() {
  const value = useSyncExternalStore(subscribeSearchText, getSearchText);
  return [value, setSearchText];
}
