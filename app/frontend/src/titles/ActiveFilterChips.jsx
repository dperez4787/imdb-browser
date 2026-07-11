/**
 * ActiveFilterChips (IMDB-6, DES-3): the removable summary row above the grid.
 * Restates every set filter — rail-backed AND the params the v1 rail renders
 * no control for — as one legible line mirroring the shared URL, so a link is
 * never silently wider than the rail shows. Each chip removes exactly its
 * filter; `Clear all` resets everything. Chips come from urlState.deriveChips.
 */
export default function ActiveFilterChips({ chips, onRemove, onClearAll }) {
  if (chips.length === 0) return null;
  return (
    <div className="active-chips" aria-label="Active filters">
      {chips.map((chip) => (
        <button
          type="button"
          key={chip.key}
          className="chip"
          aria-label={`Remove filter ${chip.label}`}
          onClick={() => onRemove(chip)}
        >
          <span className="chip__label">{chip.label}</span>
          <span className="chip__x" aria-hidden="true">
            ✕
          </span>
        </button>
      ))}
      <button type="button" className="chip chip--clear" onClick={onClearAll}>
        Clear all
      </button>
    </div>
  );
}
