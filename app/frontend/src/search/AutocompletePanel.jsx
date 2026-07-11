/**
 * AutocompletePanel (IMDB-5, DES-2): the listbox popup under the omnibox.
 * Purely presentational — Omnibox owns all state; this renders exactly one of
 * DES-2's bodies:
 *
 *   - error        → "Search isn't responding." + Retry, NO freshness footer
 *                    (nothing to vouch for)
 *   - rows         → the interleaved listbox (+ footer)
 *   - first load   → 3 shimmer skeleton rows (no footer yet — searchInfo
 *                    arrives with the same response)
 *   - no results   → query-blaming copy, OR the index-never-built copy when
 *                    searchInfo.rebuiltAt is null (+ footer)
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
            optionId={optionId(index)}
            selected={index === selectedIndex}
            onSelect={() => onSelectRow(row)}
            onHover={() => onHoverRow(index)}
          />
        ))}
      </ul>
    );
    footer = <SearchFreshness searchInfo={searchInfo} />;
  } else if (isPending || !hasData) {
    body = <SkeletonRows />;
  } else {
    const neverBuilt = searchInfo && searchInfo.rebuiltAt == null;
    body = neverBuilt ? (
      <div className="autocomplete-panel__message">
        <p>The search index hasn’t been built yet — nothing is searchable until the first rebuild runs.</p>
      </div>
    ) : (
      <div className="autocomplete-panel__message">
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
