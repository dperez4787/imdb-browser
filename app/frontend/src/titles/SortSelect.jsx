/**
 * SortSelect (IMDB-6, DES-3): the documented server sorts only — no
 * client-side reordering. Popularity is the default; Relevance appears only
 * while a `q` is active (`hasQuery`). The chosen enum flows straight to the
 * URL `sort` param (omitted when POPULARITY_DESC).
 */
import { SORT_OPTIONS } from './urlState.js';

export default function SortSelect({ value, hasQuery, onChange }) {
  const options = SORT_OPTIONS.filter((o) => !o.requiresQuery || hasQuery);
  return (
    <label className="sort-select">
      <span className="sort-select__label">Sort</span>
      <select
        className="sort-select__control"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
