/**
 * RatingMinSelect (IMDB-6, DES-3): `Any, ≥5 … ≥9`. A minimum maps to
 * `ratingFrom`, which by API definition EXCLUDES unrated titles — the
 * `hides unrated` microcopy shows whenever a minimum is set; `Any` clears it
 * (and includes unrated).
 */
const OPTIONS = [5, 6, 7, 8, 9];

export default function RatingMinSelect({ value, onChange }) {
  return (
    <div className="rating-min">
      <label className="rating-min__label">
        <span>Rating</span>
        <select
          className="rating-min__control"
          value={value ?? ''}
          onChange={(event) =>
            onChange(event.target.value === '' ? undefined : Number(event.target.value))
          }
        >
          <option value="">Any</option>
          {OPTIONS.map((n) => (
            <option key={n} value={n}>
              ≥ {n}
            </option>
          ))}
        </select>
      </label>
      {value != null && <p className="rating-min__hint">hides unrated</p>}
    </div>
  );
}
