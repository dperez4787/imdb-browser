/**
 * Shared page-level states for detail pages (IMDB-7, DES-4 "States") —
 * NotFoundState and ErrorState. DES-5 names both for reuse by the person
 * page (IMDB-8), which is why they live in their own file.
 *
 * Not-found ≠ error (verified live: an unknown/invalid id resolves
 * `title: null` with NO GraphQL error, so the two states can never blur):
 *   - NotFoundState: honest copy with the index-freshness caveat when
 *     searchInfo is available (silently absent otherwise — never a guess),
 *     [← Back] (history), and [Search instead], which focuses the omnibox by
 *     dispatching the DES-1 global `/` shortcut the omnibox already owns —
 *     no cross-module ref plumbing.
 *   - ErrorState: one line + [Retry] wired to the query's refetch.
 */
import { useNavigate } from 'react-router';

import { useSearchInfo } from '../graphql/hooks.js';
import { formatRebuilt } from '../search/SearchFreshness.jsx';

/**
 * Focus the omnibox from anywhere: the omnibox listens document-wide for the
 * `/` shortcut (DES-1 shared keyboard language), so dispatching that same
 * event is the sanctioned way to hand it focus without reaching into its
 * internals.
 */
function focusOmnibox() {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }),
  );
}

export function NotFoundState() {
  const navigate = useNavigate();
  // The freshness caveat rides the standard searchInfo cache (1 h). If it is
  // unavailable or errored the parenthetical simply drops — DES-2's rule.
  const { data } = useSearchInfo();
  const rebuiltAt = data?.searchInfo?.rebuiltAt;

  return (
    <section className="page-state" data-state="not-found">
      <h1 className="page-state__headline">This title isn’t in the index.</h1>
      <p className="page-state__body">
        It may not exist, or the index may not have it yet
        {rebuiltAt ? ` (Index rebuilt ${formatRebuilt(rebuiltAt)})` : ''}.
      </p>
      <div className="page-state__actions">
        <button type="button" className="page-state__button" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <button type="button" className="page-state__button" onClick={focusOmnibox}>
          Search instead
        </button>
      </div>
    </section>
  );
}

export function ErrorState({ onRetry, message = 'Couldn’t load this title.' }) {
  return (
    <section className="page-state" data-state="error">
      <p className="page-state__headline" role="alert">
        <span aria-hidden="true">⚠</span> {message}
      </p>
      <div className="page-state__actions">
        <button type="button" className="page-state__button" onClick={onRetry}>
          Retry
        </button>
      </div>
    </section>
  );
}
