/**
 * YearRangeInput (IMDB-6, DES-3): two numeric fields, either may be blank.
 * The view converts blank → undefined (param omitted) and maps to
 * `startYearFrom` / `startYearTo`.
 */
export default function YearRangeInput({ from, to, onChange }) {
  return (
    <div className="year-range">
      <input
        type="number"
        inputMode="numeric"
        className="year-range__field"
        aria-label="Year from"
        placeholder="from"
        value={from ?? ''}
        onChange={(event) => onChange('from', event.target.value)}
      />
      <span className="year-range__dash" aria-hidden="true">
        –
      </span>
      <input
        type="number"
        inputMode="numeric"
        className="year-range__field"
        aria-label="Year to"
        placeholder="to"
        value={to ?? ''}
        onChange={(event) => onChange('to', event.target.value)}
      />
    </div>
  );
}
