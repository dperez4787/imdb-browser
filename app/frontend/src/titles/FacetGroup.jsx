/**
 * FacetGroup (IMDB-6, DES-3): one vocabulary group rendered ENTIRELY from API
 * data — the value list comes from the global `facets` query and each value's
 * number is the LIVE CONTEXTUAL count from the current search response, so a
 * new vocabulary value appears with no code change and a value whose count is
 * zero within the current filter stays in place, muted, still operable
 * (positions never jump). There is no hard-coded value list anywhere.
 *
 * `Show all (n)` expands past the first six values; a selected value ranked
 * below the fold stays visible while collapsed so it is always un-checkable.
 * `status` drives the DES-3 vocabulary loading (skeleton lines) and error
 * ("Couldn't load …. [Retry]") states without taking down the rest of the rail.
 */
import { useState } from 'react';

const COLLAPSED_LIMIT = 6;

function SkeletonLines({ count = 3 }) {
  return (
    <ul className="facet-group__list" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="facet-option facet-option--skeleton">
          <span className="skeleton-line skeleton-line--facet" />
        </li>
      ))}
    </ul>
  );
}

export default function FacetGroup({
  title,
  values = [],
  selected = [],
  onToggle,
  labelFor = (v) => v,
  status = 'ready',
  onRetry,
  noun = 'options',
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedSet = new Set(selected);

  return (
    <div className="facet-group">
      <h3 className="facet-group__title">{title}</h3>

      {status === 'loading' && <SkeletonLines />}

      {status === 'error' && (
        <p className="facet-group__error">
          Couldn’t load {noun}.{' '}
          <button type="button" className="link-button" onClick={onRetry}>
            Retry
          </button>
        </p>
      )}

      {status === 'ready' && (
        <>
          <ul className="facet-group__list">
            {values
              .filter((value, index) => expanded || index < COLLAPSED_LIMIT || selectedSet.has(value.value))
              .map(({ value, count }) => (
                <li key={value}>
                  <label className={`facet-option${count ? '' : ' facet-option--empty'}`}>
                    <input
                      type="checkbox"
                      checked={selectedSet.has(value)}
                      onChange={() => onToggle(value)}
                    />
                    <span className="facet-option__label">{labelFor(value)}</span>
                    <span className="facet-option__count">
                      {Number(count ?? 0).toLocaleString('en-US')}
                    </span>
                  </label>
                </li>
              ))}
          </ul>
          {values.length > COLLAPSED_LIMIT && (
            <button
              type="button"
              className="facet-group__more link-button"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Show fewer' : `Show all (${values.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
