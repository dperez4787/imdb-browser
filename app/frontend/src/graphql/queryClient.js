/**
 * QueryClient factory (IMDB-4) — the caching policy lives here, next to the
 * keys and hooks, not in main.jsx. docs/architecture.md: refetchOnWindowFocus
 * off everywhere (the data changes only on index rebuilds); per-query
 * staleTimes come from keys.js via the hooks.
 */
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        // Retrying can only help transient failures: an expired credential
        // ('auth') or an invalid filter ('bad-request') fails identically on
        // every attempt, so don't burn requests on it.
        retry: (failureCount, error) =>
          error?.kind !== 'auth' && error?.kind !== 'bad-request' && failureCount < 2,
      },
    },
  });
}
