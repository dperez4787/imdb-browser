/**
 * AutocompletePanel (IMDB-5, DES-2): the listbox popup under the omnibox.
 * Purely presentational — Omnibox owns all state; this renders exactly one of
 * DES-2's bodies:
 *
 *   - error        → "Search isn't responding." + Retry, NO freshness footer
 *                    (nothing to vouch for)
 *   - rows         → the interleaved listbox (+ footer)
 *   - loading      → 3 shimmer skeleton rows (no footer yet): the first load,
 *                    AND any fetch with no rows to keep on screen — a new
 *                    query fetching after a previous empty result must read
 *                    as loading, never as "Nothing matches" for a response
 *                    that hasn't arrived
 *   - no results   → query-blaming copy, OR the index-never-built copy when
 *                    searchInfo.rebuiltAt is null (+ footer). Announced via a
 *                    polite live region (role=status), like loading/error —
 *                    focus never leaves the input, so without one a screen
 *                    reader hears nothing change.
 *
 * A refetch with previous rows on screen keeps them at full opacity and adds
 * the 2px amber progress bar along the top edge.
 */
import SearchFreshness from './SearchFreshness.jsx';
import SearchHitRow from './SearchHitRow.jsx';

function SkeletonRows() {
  return (
    <div className="autocomplete-panel__skeleton" role="status" aria-label="Searching">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton-row" aria-hidden="true">
          <span className="skeleton-row__thumb" />
          <span className="skeleton-row__text" style={{ width: `${72 - i * 16}%` }} />
        </div>
      ))}
    </div>
  );
}

export default function AutocompletePanel({
  query,
  rows,
  error,
  isPending,
  isRefreshing,
  hasData,
  searchInfo,
  selectedIndex,
  listboxId,
  optionId,
  onRetry,
  onSelectRow,
  onHoverRow,
}) {
  let body;
  let footer = null;

  if (error) {
    body = (
      <div className="autocomplete-panel__message" role="alert">
        <p>⚠ Search isn’t responding.</p>
        <button type="button" className="autocomplete-panel__retry" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  } else if (rows.length > 0) {
    body = (
      <ul className="autocomplete-panel__list" role="listbox" id={listboxId} aria-label="Search results">
        {rows.map((row, index) => (
          <SearchHitRow
            key={row.id}
            row={row}
            optionId={optionId(row.id)}
            selected={index === selectedIndex}
            onSelect={() => onSelectRow(row)}
            onHover={() => onHoverRow(index)}
          />
        ))}
      </ul>
    );
    footer = <SearchFreshness searchInfo={searchInfo} />;
  } else if (isPending || !hasData || isRefreshing) {
    // No rows to keep on screen while a fetch is in flight → skeletons. The
    // isRefreshing arm is the "new query after a previous EMPTY result" case:
    // rows are empty and data exists, but blaming the (new) query with
    // "Nothing matches" would be a lie about a response that hasn't arrived.
    body = <SkeletonRows />;
  } else {
    const neverBuilt = searchInfo && searchInfo.rebuiltAt == null;
    body = neverBuilt ? (
      <div className="autocomplete-panel__message" role="status">
        <p>The search index hasn’t been built yet — nothing is searchable until the first rebuild runs.</p>
      </div>
    ) : (
      <div className="autocomplete-panel__message" role="status">
        <p>Nothing matches “{query}”.</p>
        <p className="autocomplete-panel__hint">
          Search matches how titles and names begin — try a shorter prefix.
        </p>
      </div>
    );
    footer = <SearchFreshness searchInfo={searchInfo} />;
  }

  return (
    <div className="autocomplete-panel">
      {isRefreshing && rows.length > 0 && !error && (
        <div className="autocomplete-panel__progress" aria-hidden="true" />
      )}
      {body}
      {footer}
    </div>
  );
}
